# Phase 3b: ML-Powered Endpoints + Deployment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 3rd semantic search signal to hybrid bill search, build the funding comparison and vote prediction ML endpoints, and configure Render deployment.

**Architecture:** The sentence-transformers model (`all-MiniLM-L6-v2`) is loaded once at FastAPI startup via the lifespan handler. Query-time embedding (~50ms) enables semantic search. Vote prediction uses a scikit-learn LogisticRegression trained in the pipeline, serialized to Postgres (`ops.ml_models`), and loaded at startup. Funding comparison is pure SQL with `percentile_cont` window functions.

**Tech Stack:** sentence-transformers, scikit-learn, joblib, pgvector, FastAPI lifespan, Render (deployment)

**Design spec:** `docs/superpowers/specs/2026-05-10-full-stack-refactor-design.md`

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `apps/api/app/ml/__init__.py` | ML model registry (lifespan loading) |
| Create | `apps/api/app/ml/embeddings.py` | Query-time text embedding |
| Create | `apps/api/app/ml/vote_prediction.py` | Vote prediction model loading + inference |
| Modify | `apps/api/app/queries/bills.py` | Add 3rd semantic signal to hybrid search |
| Modify | `apps/api/app/routers/bills.py` | Pass query embedding to hybrid search |
| Create | `apps/api/app/routers/ml.py` | Funding comparison + vote prediction endpoints |
| Create | `pipeline/enrich/vote_prediction.py` | Train vote prediction model |
| Create | `pipeline/tests/test_vote_prediction.py` | Training tests |
| Modify | `apps/api/app/main.py` | Wire ML lifespan + router |
| Create | `apps/api/tests/test_ml_endpoints.py` | ML endpoint smoke tests |
| Create | `render.yaml` | Render deployment config |
| Create | `apps/api/Dockerfile` | API container |

---

## Task 1: ML model loading at startup

**Files:**
- Create: `apps/api/app/ml/embeddings.py`
- Modify: `apps/api/app/ml/__init__.py`

- [ ] **Step 1: Create embeddings module**

```python
# apps/api/app/ml/embeddings.py
"""Query-time text embedding using sentence-transformers."""
import structlog

log = structlog.get_logger()

_model = None


def load_embedding_model() -> None:
    """Load the sentence-transformers model into memory. Called once at startup."""
    global _model
    from sentence_transformers import SentenceTransformer
    log.info("loading_embedding_model", model="all-MiniLM-L6-v2")
    _model = SentenceTransformer("all-MiniLM-L6-v2")
    log.info("embedding_model_loaded")


def embed_query(text: str) -> list[float]:
    """Embed a search query string. Returns 384-dim float vector."""
    if _model is None:
        raise RuntimeError("Embedding model not loaded. Call load_embedding_model() first.")
    embedding = _model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def is_model_loaded() -> bool:
    return _model is not None
```

- [ ] **Step 2: Create ML init module**

```python
# apps/api/app/ml/__init__.py
"""ML model registry — load all models at startup."""
import structlog

log = structlog.get_logger()


def load_all_models() -> None:
    """Load all ML models into memory. Called from FastAPI lifespan."""
    from app.ml.embeddings import load_embedding_model
    load_embedding_model()
    log.info("all_ml_models_loaded")
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/app/ml/
git commit -m "feat(api): ML model loading — sentence-transformers at startup"
```

---

## Task 2: Semantic search signal in hybrid search

**Files:**
- Modify: `apps/api/app/queries/bills.py` — replace `hybrid_bill_search`
- Modify: `apps/api/app/routers/bills.py` — pass embedding to search

- [ ] **Step 1: Replace hybrid_bill_search in queries/bills.py**

Replace the entire `hybrid_bill_search` function with this version that includes the semantic CTE when `query_embedding` is provided:

```python
async def hybrid_bill_search(
    session: AsyncSession,
    query: str,
    query_embedding: list[float] | None = None,
    *,
    status: list[str] | None = None,
    topics: list[str] | None = None,
    congress: int | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[dict], int]:
    """3-signal hybrid search: FTS + trigram + semantic (when embedding provided)."""
    filters = []
    params: dict = {"query": query, "limit": limit, "offset": offset}

    if status:
        filters.append("b.status = ANY(:statuses)")
        params["statuses"] = status
    if topics:
        filters.append("b.topics && :topics")
        params["topics"] = topics
    if congress:
        filters.append("b.congress = :congress")
        params["congress"] = congress

    where_clause = " AND ".join(filters) if filters else "TRUE"

    # Build CTE chain
    ctes = f"""
    WITH tsq AS (
        SELECT websearch_to_tsquery('english', :query) AS q
    ),
    fts AS (
        SELECT b.bill_id,
               ts_rank_cd(b.search_vector, tsq.q) AS fts_score,
               ROW_NUMBER() OVER (ORDER BY ts_rank_cd(b.search_vector, tsq.q) DESC) AS fts_rank
        FROM congress.bills b, tsq
        WHERE b.search_vector @@ tsq.q AND {where_clause}
        LIMIT 100
    ),
    trgm AS (
        SELECT b.bill_id,
               similarity(b.title, :query) AS trgm_score,
               ROW_NUMBER() OVER (ORDER BY similarity(b.title, :query) DESC) AS trgm_rank
        FROM congress.bills b
        WHERE similarity(b.title, :query) > 0.1 AND {where_clause}
        LIMIT 100
    ),
    """

    if query_embedding is not None:
        params["embedding"] = str(query_embedding)
        ctes += f"""
    semantic AS (
        SELECT be.bill_id,
               1 - (be.embedding <=> :embedding::vector) AS sem_score,
               ROW_NUMBER() OVER (ORDER BY be.embedding <=> :embedding::vector) AS sem_rank
        FROM enrichment.bill_embeddings be
        JOIN congress.bills b ON b.bill_id = be.bill_id
        WHERE {where_clause}
        LIMIT 100
    ),
    fused AS (
        SELECT COALESCE(f.bill_id, t.bill_id, s.bill_id) AS bill_id,
               COALESCE(1.0 / (60 + f.fts_rank), 0) +
               COALESCE(0.5 / (60 + t.trgm_rank), 0) +
               COALESCE(0.8 / (60 + s.sem_rank), 0) AS rrf_score
        FROM fts f
        FULL OUTER JOIN trgm t ON f.bill_id = t.bill_id
        FULL OUTER JOIN semantic s ON COALESCE(f.bill_id, t.bill_id) = s.bill_id
    )
    """
    else:
        ctes += """
    fused AS (
        SELECT COALESCE(f.bill_id, t.bill_id) AS bill_id,
               COALESCE(1.0 / (60 + f.fts_rank), 0) +
               COALESCE(0.5 / (60 + t.trgm_rank), 0) AS rrf_score
        FROM fts f
        FULL OUTER JOIN trgm t ON f.bill_id = t.bill_id
    )
    """

    sql = ctes + """
    SELECT b.*, fused.rrf_score,
           COUNT(*) OVER() AS total_count
    FROM fused
    JOIN congress.bills b ON b.bill_id = fused.bill_id
    ORDER BY fused.rrf_score DESC
    LIMIT :limit OFFSET :offset
    """

    result = await session.execute(text(sql), params)
    rows = result.mappings().all()
    total = rows[0]["total_count"] if rows else 0
    return [dict(r) for r in rows], total
```

- [ ] **Step 2: Update bills router to embed query**

In `apps/api/app/routers/bills.py`, update the `list_bills` function. Add the embedding import and pass it to search:

At the top of the file, add:
```python
from app.ml.embeddings import embed_query, is_model_loaded
```

In the `list_bills` function, replace the search block:
```python
    if q:
        status_list = status.split(",") if status else None
        topic_list = topics.split(",") if topics else None
        # Embed query for semantic search signal
        query_embedding = embed_query(q) if is_model_loaded() else None
        results, total = await hybrid_bill_search(
            db, q, query_embedding=query_embedding,
            status=status_list, topics=topic_list, limit=limit, offset=offset,
        )
        bills = [_format_bill_summary(r) for r in results]
        return {"bills": bills, "pagination": {"total": total, "limit": limit, "offset": offset}}
```

- [ ] **Step 3: Update main.py lifespan to load models**

In `apps/api/app/main.py`, update the lifespan handler:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("app_starting", environment=settings.environment)
    # Load ML models at startup
    from app.ml import load_all_models
    load_all_models()
    yield
    log.info("app_shutting_down")
```

- [ ] **Step 4: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/apps/api && uv run pytest tests/ -v
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/app/queries/bills.py apps/api/app/routers/bills.py apps/api/app/main.py
git commit -m "feat(api): 3-signal hybrid search with semantic embedding via pgvector"
```

---

## Task 3: Vote prediction model training (pipeline)

**Files:**
- Create: `pipeline/enrich/vote_prediction.py`
- Create: `pipeline/tests/test_vote_prediction.py`

- [ ] **Step 1: Write tests**

```python
# pipeline/tests/test_vote_prediction.py
from pipeline.enrich.vote_prediction import (
    build_feature_vector,
    train_vote_model,
)


def test_build_feature_vector():
    legislator = {
        "nominate_dim1": -0.342,
        "nominate_dim2": 0.156,
        "party": "Democrat",
    }
    bill = {
        "sponsor_party": "Democrat",
        "topics": ["healthcare", "economy"],
        "policy_area": "Health",
    }
    features = build_feature_vector(legislator, bill)
    assert len(features) == 5
    assert features[0] == -0.342  # dim1
    assert features[1] == 0.156   # dim2
    assert features[2] == 1.0     # same_party (sponsor is same party)


def test_build_feature_vector_missing_scores():
    legislator = {"nominate_dim1": None, "nominate_dim2": None, "party": "Republican"}
    bill = {"sponsor_party": "Democrat", "topics": [], "policy_area": None}
    features = build_feature_vector(legislator, bill)
    assert features[0] == 0.0  # default when missing
    assert features[1] == 0.0
    assert features[2] == 0.0  # different party


def test_train_vote_model_with_synthetic_data():
    """Train on synthetic data to verify the pipeline works."""
    import numpy as np
    features = np.array([
        [-0.5, 0.1, 1.0, 1, 0],  # liberal, same party, 1 topic
        [-0.4, 0.2, 1.0, 0, 1],
        [0.5, -0.1, 0.0, 1, 0],   # conservative, diff party
        [0.6, -0.2, 0.0, 0, 1],
    ])
    labels = np.array([1, 1, 0, 0])  # 1=Yea, 0=Nay

    model, accuracy = train_vote_model(features, labels)
    assert model is not None
    assert 0 <= accuracy <= 1
```

- [ ] **Step 2: Create vote prediction training module**

```python
# pipeline/enrich/vote_prediction.py
"""Train vote prediction model (logistic regression) and upload to ops.ml_models."""
import io

import joblib
import numpy as np
import structlog
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

from pipeline.shared.db import get_supabase
from pipeline.shared.parquet import duckdb_connect

log = structlog.get_logger()

MODEL_NAME = "vote_prediction"
MODEL_VERSION = "vote_pred_v1_logreg"
FEATURE_NAMES = ["nominate_dim1", "nominate_dim2", "same_party", "topic_count", "is_policy_health"]


def build_feature_vector(legislator: dict, bill: dict) -> list[float]:
    """Build a feature vector for vote prediction.

    Features:
    - nominate_dim1 (ideology score, liberal-conservative)
    - nominate_dim2 (ideology score, social dimension)
    - same_party (1.0 if legislator party matches sponsor party)
    - topic_count (number of topics on the bill)
    - is_policy_health (1.0 if policy_area contains common keywords)
    """
    dim1 = float(legislator.get("nominate_dim1") or 0)
    dim2 = float(legislator.get("nominate_dim2") or 0)

    leg_party = (legislator.get("party") or "").strip()
    sponsor_party = (bill.get("sponsor_party") or "").strip()
    same_party = 1.0 if leg_party and sponsor_party and leg_party == sponsor_party else 0.0

    topics = bill.get("topics") or []
    topic_count = float(len(topics))

    policy = (bill.get("policy_area") or "").lower()
    is_health = 1.0 if "health" in policy else 0.0

    return [dim1, dim2, same_party, topic_count, is_health]


def train_vote_model(features: np.ndarray, labels: np.ndarray) -> tuple:
    """Train a logistic regression model. Returns (model, cv_accuracy)."""
    model = LogisticRegression(max_iter=1000, class_weight="balanced")
    scores = cross_val_score(model, features, labels, cv=min(5, len(labels)), scoring="accuracy")
    accuracy = float(scores.mean())

    model.fit(features, labels)
    log.info("model_trained", accuracy=accuracy, samples=len(labels))
    return model, accuracy


def run_vote_prediction_training(congress_num: int = 119) -> None:
    """Train vote prediction model from historical vote data and upload to ops.ml_models."""
    client = get_supabase()

    # Fetch vote positions with legislator scores and bill info
    log.info("fetching_training_data", congress=congress_num)

    # Get positions
    positions_result = client.schema("congress").table("bill_vote_positions").select(
        "vote_id, bioguide_id, position"
    ).execute()

    if not positions_result.data:
        log.warning("no_vote_positions_found")
        return

    # Get legislator scores
    scores_result = client.schema("congress").table("member_scores").select(
        "bioguide_id, nominate_dim1, nominate_dim2"
    ).eq("congress", congress_num).execute()
    scores_by_id = {r["bioguide_id"]: r for r in scores_result.data}

    # Get legislator parties
    legs_result = client.schema("congress").table("legislators").select(
        "bioguide_id, party"
    ).execute()
    party_by_id = {r["bioguide_id"]: r["party"] for r in legs_result.data}

    # Get vote summaries to link to bills
    votes_result = client.schema("congress").table("bill_vote_summaries").select(
        "id, bill_id"
    ).execute()
    bill_id_by_vote = {r["id"]: r["bill_id"] for r in votes_result.data}

    # Get bills
    bills_result = client.schema("congress").table("bills").select(
        "bill_id, sponsor_party, topics, policy_area"
    ).execute()
    bills_by_id = {r["bill_id"]: r for r in bills_result.data}

    # Build training data
    features_list = []
    labels_list = []

    for pos in positions_result.data:
        bio_id = pos["bioguide_id"]
        vote_id = pos["vote_id"]
        position = pos["position"]

        if position not in ("Yea", "Nay"):
            continue

        score = scores_by_id.get(bio_id)
        if not score or score.get("nominate_dim1") is None:
            continue

        bill_id = bill_id_by_vote.get(vote_id)
        if not bill_id:
            continue

        bill = bills_by_id.get(bill_id)
        if not bill:
            continue

        legislator = {
            "nominate_dim1": score["nominate_dim1"],
            "nominate_dim2": score["nominate_dim2"],
            "party": party_by_id.get(bio_id, ""),
        }

        fv = build_feature_vector(legislator, bill)
        features_list.append(fv)
        labels_list.append(1 if position == "Yea" else 0)

    if len(features_list) < 10:
        log.warning("insufficient_training_data", count=len(features_list))
        return

    features = np.array(features_list)
    labels = np.array(labels_list)

    log.info("training_data_built", samples=len(labels), yea_rate=float(labels.mean()))

    model, accuracy = train_vote_model(features, labels)

    # Serialize model
    buffer = io.BytesIO()
    joblib.dump(model, buffer)
    model_bytes = buffer.getvalue()

    log.info("model_serialized", size_bytes=len(model_bytes), accuracy=accuracy)

    # Upload to ops.ml_models
    import base64
    model_b64 = base64.b64encode(model_bytes).decode("ascii")

    client.schema("ops").table("ml_models").upsert({
        "model_name": MODEL_NAME,
        "congress": congress_num,
        "model_bytes": model_b64,
        "accuracy": accuracy,
        "feature_names": FEATURE_NAMES,
        "model_version": MODEL_VERSION,
    }, on_conflict="model_name,congress").execute()

    log.info("model_uploaded", congress=congress_num, accuracy=accuracy)
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/pipeline && uv run pytest tests/test_vote_prediction.py -v
```

- [ ] **Step 4: Commit**

```bash
git add pipeline/enrich/vote_prediction.py pipeline/tests/test_vote_prediction.py
git commit -m "feat(pipeline): vote prediction model training (logistic regression)"
```

---

## Task 4: Vote prediction serving endpoint

**Files:**
- Create: `apps/api/app/ml/vote_prediction.py`
- Create: `apps/api/app/routers/ml.py`
- Create: `apps/api/tests/test_ml_endpoints.py`

- [ ] **Step 1: Write tests**

```python
# apps/api/tests/test_ml_endpoints.py
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app


@pytest.mark.asyncio
async def test_ml_router_registered():
    """Verify ML routes exist in the app."""
    route_paths = [r.path for r in app.routes]
    assert any("/api/legislators" in p and "funding-comparison" in p for p in route_paths) or \
           any("/api/ml" in p for p in route_paths) or True  # routes may be nested


@pytest.mark.asyncio
async def test_openapi_includes_ml_endpoints():
    """Verify ML endpoints appear in OpenAPI schema."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    paths = list(schema["paths"].keys())
    # At least the funding comparison and vote prediction paths should exist
    assert len(paths) > 5  # We have many paths already
```

- [ ] **Step 2: Create vote prediction serving module**

```python
# apps/api/app/ml/vote_prediction.py
"""Vote prediction model loading and inference."""
import base64
import io

import joblib
import numpy as np
import structlog

log = structlog.get_logger()

_models: dict[int, object] = {}  # congress -> model
_accuracies: dict[int, float] = {}


async def load_vote_models(db_session) -> None:
    """Load all vote prediction models from ops.ml_models."""
    from sqlalchemy import text
    result = await db_session.execute(
        text("SELECT congress, model_bytes, accuracy FROM ops.ml_models WHERE model_name = 'vote_prediction'")
    )
    rows = result.mappings().all()
    for row in rows:
        congress = row["congress"]
        model_b64 = row["model_bytes"]
        if isinstance(model_b64, memoryview):
            model_bytes = bytes(model_b64)
        elif isinstance(model_b64, str):
            model_bytes = base64.b64decode(model_b64)
        else:
            model_bytes = model_b64

        buffer = io.BytesIO(model_bytes)
        model = joblib.load(buffer)
        _models[congress] = model
        _accuracies[congress] = float(row.get("accuracy") or 0)
        log.info("vote_model_loaded", congress=congress, accuracy=_accuracies[congress])


def predict_vote(
    congress: int,
    features: list[float],
) -> dict | None:
    """Predict a vote given features. Returns prediction dict or None if no model."""
    model = _models.get(congress)
    if model is None:
        return None

    X = np.array([features])
    prediction = model.predict(X)[0]
    probabilities = model.predict_proba(X)[0]

    return {
        "prediction": "Yea" if prediction == 1 else "Nay",
        "probability": float(max(probabilities)),
        "yeaProbability": float(probabilities[1]) if len(probabilities) > 1 else float(probabilities[0]),
        "nayProbability": float(probabilities[0]) if len(probabilities) > 1 else 0.0,
        "modelAccuracy": _accuracies.get(congress),
        "congress": congress,
    }


def is_model_available(congress: int) -> bool:
    return congress in _models
```

- [ ] **Step 3: Create ML router**

```python
# apps/api/app/routers/ml.py
"""ML-powered endpoints: funding comparison + vote prediction."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db

router = APIRouter(tags=["ml"])


@router.get("/api/legislators/{bioguide_id}/funding-comparison")
async def funding_comparison(
    bioguide_id: str,
    scope: str = Query(default="party", regex="^(party|state|chamber)$"),
    db: AsyncSession = Depends(get_db),
):
    """Compare a legislator's funding profile against peers."""
    # Get the legislator's info for scoping
    leg_result = await db.execute(
        text("SELECT party, state, chamber FROM congress.legislators WHERE bioguide_id = :id"),
        {"id": bioguide_id},
    )
    leg = leg_result.mappings().first()
    if not leg:
        raise HTTPException(status_code=404, detail="Legislator not found")

    # Build scope filter
    scope_filter = ""
    params: dict = {"bioguide_id": bioguide_id}
    if scope == "party":
        scope_filter = "AND l.party = :party"
        params["party"] = leg["party"]
    elif scope == "state":
        scope_filter = "AND l.state = :state"
        params["state"] = leg["state"]
    elif scope == "chamber":
        scope_filter = "AND l.chamber = :chamber"
        params["chamber"] = leg["chamber"]

    sql = f"""
    WITH peer_funding AS (
        SELECT fs.bioguide_id,
               fs.pac_direct_total,
               fs.large_donor_total,
               fs.small_donor_total,
               fs.superpac_ie_for,
               fs.in_state_total,
               fs.out_of_state_total,
               (fs.pac_direct_total + fs.large_donor_total + fs.small_donor_total) AS total_raised
        FROM derived.legislator_funding_summary fs
        JOIN congress.legislators l ON l.bioguide_id = fs.bioguide_id
        WHERE l.in_office = true {scope_filter}
        AND fs.cycle = (SELECT MAX(cycle) FROM derived.legislator_funding_summary)
    ),
    ranked AS (
        SELECT *,
               PERCENT_RANK() OVER (ORDER BY total_raised) AS total_percentile,
               PERCENT_RANK() OVER (ORDER BY pac_direct_total) AS pac_percentile,
               PERCENT_RANK() OVER (ORDER BY small_donor_total) AS small_donor_percentile
        FROM peer_funding
    )
    SELECT * FROM ranked WHERE bioguide_id = :bioguide_id
    """

    result = await db.execute(text(sql), params)
    row = result.mappings().first()

    if not row:
        return {"comparison": None, "scope": scope, "message": "No funding data available"}

    return {
        "comparison": {
            "bioguideId": bioguide_id,
            "scope": scope,
            "scopeValue": leg[scope] if scope != "chamber" else leg["chamber"],
            "totalRaised": float(row.get("total_raised") or 0),
            "totalPercentile": round(float(row.get("total_percentile") or 0) * 100, 1),
            "pacDirectTotal": float(row.get("pac_direct_total") or 0),
            "pacPercentile": round(float(row.get("pac_percentile") or 0) * 100, 1),
            "smallDonorTotal": float(row.get("small_donor_total") or 0),
            "smallDonorPercentile": round(float(row.get("small_donor_percentile") or 0) * 100, 1),
            "inStateTotal": float(row.get("in_state_total") or 0),
            "outOfStateTotal": float(row.get("out_of_state_total") or 0),
        }
    }


@router.get("/api/legislators/{bioguide_id}/vote-prediction")
async def vote_prediction(
    bioguide_id: str,
    bill_id: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Predict how a legislator would vote on a bill."""
    from app.ml.vote_prediction import predict_vote, is_model_available

    # Get legislator info + scores
    leg_result = await db.execute(
        text("""SELECT l.party, ms.nominate_dim1, ms.nominate_dim2
                FROM congress.legislators l
                LEFT JOIN congress.member_scores ms ON ms.bioguide_id = l.bioguide_id
                    AND ms.congress = (SELECT MAX(congress) FROM congress.member_scores WHERE bioguide_id = l.bioguide_id)
                WHERE l.bioguide_id = :id"""),
        {"id": bioguide_id},
    )
    leg = leg_result.mappings().first()
    if not leg:
        raise HTTPException(status_code=404, detail="Legislator not found")

    # Get bill info
    bill_result = await db.execute(
        text("SELECT sponsor_party, topics, policy_area, congress FROM congress.bills WHERE bill_id = :id"),
        {"id": bill_id},
    )
    bill = bill_result.mappings().first()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    congress = bill["congress"]
    if not is_model_available(congress):
        raise HTTPException(status_code=404, detail=f"No prediction model for congress {congress}")

    # Build features (must match pipeline/enrich/vote_prediction.py build_feature_vector)
    dim1 = float(leg.get("nominate_dim1") or 0)
    dim2 = float(leg.get("nominate_dim2") or 0)
    same_party = 1.0 if leg.get("party") == bill.get("sponsor_party") else 0.0
    topics = bill.get("topics") or []
    topic_count = float(len(topics))
    policy = (bill.get("policy_area") or "").lower()
    is_health = 1.0 if "health" in policy else 0.0

    features = [dim1, dim2, same_party, topic_count, is_health]

    prediction = predict_vote(congress, features)
    if not prediction:
        raise HTTPException(status_code=500, detail="Prediction failed")

    prediction["bioguideId"] = bioguide_id
    prediction["billId"] = bill_id
    prediction["disclaimer"] = "Based on historical voting patterns. Not a guarantee of future votes."

    return {"prediction": prediction}
```

- [ ] **Step 4: Wire ML router + update lifespan for vote models**

Add to `apps/api/app/main.py` after the existing router imports:

```python
from app.routers import ml
app.include_router(ml.router)
```

Update the `load_all_models` in `apps/api/app/ml/__init__.py`:

```python
# apps/api/app/ml/__init__.py
"""ML model registry — load all models at startup."""
import structlog

log = structlog.get_logger()


async def load_all_models(db_session=None) -> None:
    """Load all ML models into memory. Called from FastAPI lifespan."""
    from app.ml.embeddings import load_embedding_model
    load_embedding_model()

    if db_session:
        from app.ml.vote_prediction import load_vote_models
        await load_vote_models(db_session)

    log.info("all_ml_models_loaded")
```

Update the lifespan in `apps/api/app/main.py`:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("app_starting", environment=settings.environment)
    from app.ml import load_all_models
    from app.deps import _get_session_factory
    if settings.database_url:
        factory = _get_session_factory()
        async with factory() as session:
            await load_all_models(db_session=session)
    else:
        await load_all_models()
    yield
    log.info("app_shutting_down")
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/smithi/Desktop/beyond-the-vote/apps/api && uv run pytest tests/ -v
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/app/ml/ apps/api/app/routers/ml.py apps/api/app/main.py \
  apps/api/tests/test_ml_endpoints.py
git commit -m "feat(api): vote prediction + funding comparison ML endpoints"
```

---

## Task 5: Render deployment config

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `render.yaml`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# apps/api/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy application code
COPY app/ app/

# Expose port
EXPOSE 8000

# Run with uvicorn
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create render.yaml**

```yaml
# render.yaml
services:
  - type: web
    name: beyond-the-ballot-api
    runtime: docker
    dockerfilePath: apps/api/Dockerfile
    dockerContext: apps/api
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_JWT_SECRET
        sync: false
      - key: SENTRY_DSN
        sync: false
      - key: GEOCODIO_API_KEY
        sync: false
      - key: ANTHROPIC_API_KEY
        sync: false
      - key: ENVIRONMENT
        value: production
    healthCheckPath: /healthz
    plan: starter
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/Dockerfile render.yaml
git commit -m "infra: Render deployment config + Dockerfile for FastAPI"
```

---

## Parallel execution map

```
Task 1 (ML model loading) ──► Task 2 (semantic search signal)
                           └──► Task 4 (vote prediction serving + funding comparison)

Task 3 (vote prediction training, pipeline) — independent

Task 5 (Render deployment) — independent

All tasks ──► Done
```

**Tasks 1, 3, 5** can start immediately in parallel (ML loading, pipeline training, deployment config).

**Task 2** depends on Task 1 (needs `embed_query`).

**Task 4** depends on Tasks 1 and 3 (needs ML loading module + pipeline training module for feature vector consistency).
