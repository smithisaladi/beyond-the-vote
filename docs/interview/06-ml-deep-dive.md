# ML & AI Deep Dive Questions

Technical questions about the machine learning features, model choices, and AI integration.

---

## Q1: Why all-MiniLM-L6-v2 for embeddings? What are the trade-offs?

**Answer:**

`all-MiniLM-L6-v2` was chosen for specific constraints:

| Property | Value | Impact |
|----------|-------|--------|
| Dimensions | 384 | Small vectors → less storage, faster distance computation |
| Parameters | ~22M | CPU inference is fast (~10-50ms per query) |
| Max sequence length | 256 tokens | Sufficient for bill titles + short summaries |
| Training data | 1B+ sentence pairs | Good general semantic understanding |

**Why not a larger model (e.g., `all-mpnet-base-v2`, 768d)?**
- 2x the storage per vector (768 vs 384 floats)
- Slower HNSW traversal (distance computation scales with dimensions)
- Marginal quality improvement for our use case (bill search, not fine-grained semantic analysis)
- Doubles pgvector index size

**Why not an API-based embedding (OpenAI, Cohere)?**
- Pipeline runs in GitHub Actions — adding API calls introduces latency and cost per embedding
- Query-time embedding must be fast (<50ms) — API round-trip adds 100-500ms
- Self-hosted model means zero per-query cost and no external dependency
- ~40K bills is a manageable embedding corpus for a local model

**Why not fine-tuned on legal/political text?**
- The general model handles political language well enough — "healthcare reform" and "Affordable Care Act" are semantically close in the base model
- Fine-tuning requires labeled pairs (bills that should match) which we don't have
- The hybrid search's FTS and trigram signals compensate for any semantic model weakness

**When to reconsider:**
- If bill summaries regularly exceed 256 tokens → need a longer-context model
- If search quality feedback shows semantic misses → consider domain-specific fine-tuning
- If embedding corpus grows to millions → evaluate approximate methods or sharding

---

## Q2: How does the vote prediction model work? How accurate is it?

**Answer:**

**The model:** Per-congress logistic regression classifiers, trained on historical vote data.

**Features:**
```python
features = [
    nominate_dim1,      # Liberal-conservative score (-1 to +1)
    nominate_dim2,      # Social/economic cross-pressure dimension
    same_party,         # 1 if legislator and bill sponsor share party
    topic_count,        # Number of topics on the bill
    is_policy_health,   # 1 if primary policy area is health
]
```

**Why these features?**

- `nominate_dim1` is the strongest single predictor of vote behavior — it captures the left-right ideological position. A legislator with dim1 = -0.5 (liberal) will almost certainly vote differently than one with dim1 = +0.5 (conservative) on partisan bills.
- `same_party` captures party-line voting, which accounts for ~90% of votes in recent congresses.
- `topic_count` and `is_policy_health` are weak signals that capture bill complexity and domain-specific patterns.

**Training:**
```python
# For each congress session:
X = vote_positions.merge(member_scores).merge(bills)
y = (position == "Yea").astype(int)
model = LogisticRegression().fit(X_train, y_train)
```

**Storage:** Models serialized with joblib, stored as bytea in `ops.ml_models`:
```sql
INSERT INTO ops.ml_models (model_name, congress, model_bytes, accuracy, feature_names)
VALUES ('vote_prediction', 119, :model_bytes, 0.87, ARRAY['nominate_dim1', ...])
```

**Accuracy:** Typically 85-90% on held-out test data. This is high because:
- Most votes are party-line (binary classification with strong class separation)
- NOMINATE scores are specifically designed to predict voting behavior
- The model is per-congress, so it captures era-specific dynamics

**Limitations:**
- Can't predict on bipartisan votes well (low signal when party doesn't predict)
- Only 5 features — doesn't capture lobbying influence, constituent pressure, or legislative bargaining
- New legislators without NOMINATE scores can't be predicted
- The `is_policy_health` feature is ad hoc — a more general topic encoding would be better

**Why logistic regression over a neural network?**
- 5 features → logistic regression is the right complexity. A neural network would overfit.
- Interpretable: you can read the coefficients to understand which features matter
- Fast inference: single matrix multiply, no GPU needed
- Small model: ~1KB serialized vs MB for neural networks

---

## Q3: How does UMAP + HDBSCAN donor clustering work? What does it find?

**Answer:**

The `donor_clustering` module computes both feature vectors and cluster assignments in a single pipeline step.

**Input features per canonical donor (7):**
- Total contribution amount
- Number of contributions
- Party split (% to Democrats vs Republicans)
- Recipient type split (% to candidates vs PACs)
- State count (number of unique states donated in — geographic spread proxy)

**Process:**
1. Build feature matrix from canonical donors (Tier 1 output)
2. Reduce to 64 dimensions via UMAP
3. Cluster the UMAP-reduced vectors with HDBSCAN
4. Store 64d embeddings in `analytics.donor_feature_vectors` (HNSW-indexed)
5. Store cluster IDs + distance-to-centroid in `analytics.donor_cluster`

**Why HDBSCAN over K-means?**

| Property | HDBSCAN | K-means |
|----------|---------|---------|
| Cluster count | Automatic | Must specify K |
| Noise handling | Outliers labeled as noise (-1) | Forces every point into a cluster |
| Cluster shape | Arbitrary (density-based) | Spherical only |
| Scalability | O(n log n) | O(nk) per iteration |

For donor data, HDBSCAN is ideal because:
- We don't know how many behavioral clusters exist
- Many donors are unique (noise) and shouldn't be forced into clusters
- Cluster shapes are irregular (e.g., "large corporate donors" is a different density than "small grassroots donors")

**Downstream usage:**
- `analytics.donor_cluster` → cluster membership (used by similarity endpoint and Tier 3)
- `analytics.donor_feature_vectors` → 64d vectors for nearest-neighbor search via pgvector
- `anomalies.suspicious_contribution_events` → Tier 3 uses cluster data to flag anomalous patterns

---

## Q4: How does the Anthropic API integration work for PAC summaries?

**Answer:**

The `POST /api/donors/{cmte_id}/summary` endpoint generates AI summaries of PAC funding patterns:

**Flow:**
1. User clicks "Generate Summary" on a PAC detail page
2. Frontend sends POST to `/api/donors/{cmte_id}/summary`
3. Backend aggregates PAC data: total contributions, top recipients, party split, independent expenditures
4. Constructs a prompt with the data
5. Calls Anthropic API with `claude-3-5-haiku-latest`
6. Stores the response in the database (cached for 30 days)
7. Returns the summary to the frontend

**Why Claude Haiku?**
- Fast: ~1-2 seconds for a summary
- Cheap: ~$0.001 per summary
- Sufficient quality for data summarization (doesn't need Opus-level reasoning)

**Caching strategy:**
```python
# Check for existing summary
existing = await db.execute(
    text("SELECT summary FROM derived.pac_summaries WHERE cmte_id = :id AND age < interval '30 days'"),
    {"id": cmte_id}
)
if existing:
    return {"summary": existing["summary"]}

# Generate new summary
response = client.messages.create(model="claude-3-5-haiku-latest", ...)
# Store in DB
await db.execute(text("INSERT INTO derived.pac_summaries ..."))
```

The 30-day TTL balances freshness (PAC data updates weekly) against API cost.

**Cost control:**
- Rate limited per user to prevent abuse
- Haiku model keeps per-call cost minimal
- Database caching means each PAC is summarized at most once per month
- Estimated cost: ~$5/month for typical usage patterns

---

## Q5: How would you evaluate and improve search quality?

**Answer:**

**Current state:** No formal search quality metrics. The hybrid search was designed based on information retrieval best practices (RRF, weighted tsvector, semantic embeddings) but hasn't been evaluated against user expectations.

**Evaluation approach:**

1. **Build a test set:**
   - Collect ~100 real user queries (from search logs or manual curation)
   - For each query, manually label the top 10 relevant bills (relevance: 0-3 scale)
   - This gives a ground truth dataset

2. **Metrics:**
   - **NDCG@10** (Normalized Discounted Cumulative Gain): Measures if highly relevant bills appear at the top
   - **MRR** (Mean Reciprocal Rank): How high is the first relevant result?
   - **Recall@20**: What fraction of relevant bills appear in the top 20?

3. **Ablation study:**
   - Run each signal alone (FTS only, trigram only, semantic only)
   - Run pairs (FTS + trigram, FTS + semantic, etc.)
   - Run all three with different RRF weights
   - Compare NDCG/MRR across configurations

**Likely improvements:**

1. **RRF weight tuning:** The current weights (1.0, 0.5, 0.8) are reasonable defaults but not optimized. Grid search over weight combinations with the test set would likely find better weights.

2. **Query expansion:** "ACA" should also search for "Affordable Care Act". A synonym/acronym dictionary would improve FTS recall.

3. **Boost recent bills:** Add a recency signal to RRF (bills from the current congress ranked higher than historical ones).

4. **Click-through feedback:** Log which bills users click after searching. Use this as implicit relevance signal for future tuning.

5. **Better embeddings:** Fine-tune the embedding model on (query, relevant bill) pairs from the test set using contrastive learning.

---

## Q6: What's the change-point detection algorithm? How reliable is it?

**Answer:**

The `ruptures` library implements the PELT (Pruned Exact Linear Time) algorithm for change-point detection on time-series data.

**Input:** Monthly aggregated committee spending (total contributions per month over 2+ years)

**Algorithm:**
1. Model the time series as piecewise constant (each segment has a mean)
2. PELT finds the optimal segmentation by minimizing:
   ```
   cost(segmentation) = Σ fit_cost(segment_i) + penalty * num_changepoints
   ```
3. The penalty parameter controls sensitivity (higher = fewer change points)

**Output:** Change dates with magnitude and direction:
```json
{
  "changeDate": "2025-08-01",
  "metric": "monthly_spending",
  "magnitude": 4.2,
  "direction": "increase",
  "confidence": 0.85
}
```

**Reliability considerations:**
- **False positives:** Seasonal patterns (e.g., election-year spending increases) can be flagged as change points. Mitigation: compare against election cycle baselines.
- **Lag:** Detection requires data after the change point. With monthly aggregation, there's at least a 1-month lag.
- **Small committees:** Low-volume committees have noisy time series. Minimum contribution count threshold filters these out.
- **Confidence scoring:** The magnitude relative to historical variance gives a rough confidence. Large committees with stable histories and sudden changes get high confidence; volatile committees get low confidence.

**What it reveals:**
- A PAC that suddenly quadruples spending → investigating a specific race
- A PAC that stops receiving contributions → may have been disbanded or restructured
- Spending pattern shifts around primaries vs general elections

These are flagged as "investigation leads, not evidence" — the API explicitly frames them this way.
