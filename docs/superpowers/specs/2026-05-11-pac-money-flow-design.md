# PAC Detail Page — Money Flow Visualization

**Date:** 2026-05-11
**Status:** Design approved

## Context

The PAC detail page currently shows funding breakdown (direct/IE) and a recipient list, but doesn't answer the two most important questions: **who funds this PAC** and **where does the money ultimately go**. We have 1.07M money flow attribution records in `analytics.money_flow_attribution` and are building `enrichment.donor_canonical` with resolved individual donor identities. This feature surfaces those data as a visual "Follow the Money" section.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Enhanced PAC detail page (editorial) | Surfaces insights directly; no graph exploration needed |
| Placement | Hero position (after header, before funding breakdown) | Sets narrative context before numbers |
| Layout | Three-column horizontal flow: Funders → PAC → Recipients | Reads left-to-right, scannable, card-based |
| Connectors | SVG bezier curves, stroke width proportional to amount | Proper flow diagram feel while staying clean |
| Donor data | Canonical donors (`enrichment.donor_canonical`) | Deduplicated, confidence-scored, improves over time |
| Pre-computation | New `derived.pac_top_funders` table | Fast API reads; weekly pipeline refresh is acceptable |
| Degradation | Show top PAC sources from money flow when no individual data | Always shows something useful |

## Architecture

### New Pipeline Step: `compute_pac_top_funders`

Runs after Tier 1 donor resolution. For each PAC (cmte_id):

1. Join individual contributions (from `indiv.parquet`) with `enrichment.donor_canonical` on `contribution_id`
2. Group by `(cmte_id, canonical_id)` → sum `transaction_amt`
3. For each canonical donor, pick the best name/employer (highest confidence row)
4. Filter: `confidence >= 0.5`, `total_amount > 200` (skip noise)
5. Store top 10 per PAC in `derived.pac_top_funders`

**Schema:**

```sql
CREATE TABLE derived.pac_top_funders (
    cmte_id             text NOT NULL,
    canonical_donor_id  text NOT NULL,
    display_name        text NOT NULL,
    employer            text,
    state               text,
    total_amount        numeric(12,2) NOT NULL,
    contribution_count  integer NOT NULL,
    confidence          real NOT NULL,
    rank                integer NOT NULL,
    cycle               smallint NOT NULL,
    computed_at         timestamptz DEFAULT now(),
    PRIMARY KEY (cmte_id, cycle, canonical_donor_id)
);

CREATE INDEX ON derived.pac_top_funders (cmte_id, cycle, rank);
```

**Integration:** Add to `scripts/compute_funding_summaries.py` or as a new script `scripts/compute_pac_top_funders.py`. Runs after `enrich_tier1` in the pipeline sequence.

### New API Endpoint

```
GET /api/donors/{cmte_id}/money-flow
```

**Response:**

```json
{
  "cmteId": "C00828541",
  "cmteName": "AMERICA PAC",
  "topFunders": [
    {
      "canonicalDonorId": "d_12345",
      "name": "Elon Musk",
      "employer": "Space Exploration Technologies",
      "state": "TX",
      "totalAmount": 288365988,
      "contributionCount": 40,
      "confidence": 0.95
    }
  ],
  "topRecipients": [
    {
      "entityId": "S8AZ00250",
      "name": "Kari Lake",
      "party": "Republican",
      "state": "AZ",
      "chamber": "senate",
      "amount": 12400000,
      "hopCount": 1
    }
  ],
  "flowStats": {
    "totalInbound": 450000000,
    "totalOutbound": 173116354,
    "funderCount": 42,
    "recipientCount": 43
  }
}
```

**Data sources:**
- `topFunders` → `derived.pac_top_funders` WHERE `cmte_id = :id` ORDER BY `rank`
- `topRecipients` → `analytics.money_flow_attribution` WHERE `destination_committee_id = :id` AND `hop_count = 1`, aggregated by recipient, joined with `fec.cmte_names` or `congress.legislators` for name/party
- `flowStats` → aggregates from both tables

**Fallback:** When `pac_top_funders` has no rows for a PAC, query `analytics.money_flow_attribution` for top *origin PACs* (hop_count = 1, inbound) and return those as funders with `type: "pac"` instead of `type: "individual"`.

### New Frontend Component: `MoneyFlowSection`

**File:** `apps/web/src/components/donors/MoneyFlowSection.tsx`

**Props:**
```typescript
interface MoneyFlowSectionProps {
  cmteId: string;
  cmteName: string;
}
```

**Query hook:** `useMoneyFlow(cmteId)` in `hooks/queries/useDonors.ts`

**Layout (three-column flex):**

```
┌─────────────────┐    ╭────────────╮    ┌─────────────────┐
│ TOP FUNDERS      │    │            │    │ TOP RECIPIENTS   │
│                  │    │    PAC     │    │                  │
│ ┌──────────────┐ │╌╌╌>│  AMERICA  │╌╌╌>│ ┌──────────────┐ │
│ │ Elon Musk    │ │    │   PAC     │    │ │ Kari Lake R-AZ│ │
│ │ $288M        │ │    │  $173M    │    │ │      $12.4M   │ │
│ └──────────────┘ │    │           │    │ └──────────────┘ │
│ ┌──────────────┐ │╌╌╌>│           │╌╌╌>│ ┌──────────────┐ │
│ │ T. Mellon    │ │    │           │    │ │ McCormick R-PA│ │
│ │ $150M        │ │    │           │    │ │       $9.1M   │ │
│ └──────────────┘ │    │           │    │ └──────────────┘ │
│ ┌──────────────┐ │╌╌╌>│           │╌╌╌>│ ┌──────────────┐ │
│ │ M. Adelson   │ │    ╰────────────╯    │ │ Moreno   R-OH│ │
│ │ $106M        │ │                      │ │       $8.7M  │ │
│ └──────────────┘ │                      │ └──────────────┘ │
│                  │                      │                  │
│ + 39 more funders│                      │ + 40 more recips │
└─────────────────┘                      └─────────────────┘
```

**SVG Connectors:**
- An `<svg>` element positioned between each column and the center node
- Bezier curves (`<path d="M x1,y1 C cx1,cy1 cx2,cy2 x2,y2">`) from each card's vertical center to the PAC node center
- Stroke width: proportional to amount relative to the largest funder/recipient (max 3px, min 1px)
- Color: `#7B5E8A` with opacity scaling (largest = 0.6, smallest = 0.2)
- Curves are recalculated on mount/resize using a `useLayoutEffect` + refs on the card elements

**Left column (Top Funders) card content:**
- Display name (serif font, semibold)
- Employer + state (secondary text, 60% opacity)
- Amount (serif font, `formatTotal()`)
- If type is "pac" (fallback mode): show PAC name instead, with a "PAC" badge

**Center node:**
- Background: `#7B5E8A` (accent)
- "PAC" label (small, uppercase, 70% opacity)
- PAC name (bold, white)
- Total distributed amount

**Right column (Top Recipients) card content:**
- Name + party badge (from `PARTY_STYLES`)
- Chamber + state (secondary text)
- Amount right-aligned (`formatTotal()`)
- Links to `/representatives/{bioguideId}` where available

**Section header:**
- "Follow the Money" (serif, semibold)
- Subtitle: "Who funds this PAC and where it goes" (secondary text)

**Loading state:**
- Skeleton cards in three-column layout matching the shape
- Center node skeleton (rounded rectangle)

**Empty/error state:**
- If no money flow data exists: section is not rendered (hidden entirely)
- If only one side has data (funders but no recipients, or vice versa): show available side, collapse empty side

### Mobile Responsiveness

On screens < 768px, stack vertically:
- Top Funders (full width)
- Down arrow / flow indicator
- PAC node (centered)
- Down arrow / flow indicator
- Top Recipients (full width)

SVG connectors hidden on mobile — the vertical stack implies flow.

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `pipeline/schema.sql` | Modify | Add `derived.pac_top_funders` table |
| `pipeline/scripts/compute_pac_top_funders.py` | Create | Pipeline step to populate top funders |
| `apps/api/app/routers/donors.py` | Modify | Add `GET /api/donors/{cmte_id}/money-flow` endpoint |
| `apps/web/src/components/donors/MoneyFlowSection.tsx` | Create | The flow visualization component |
| `apps/web/src/components/donors/PacDetailPage.tsx` | Modify | Import and render MoneyFlowSection in hero position |
| `apps/web/src/hooks/queries/useDonors.ts` | Modify | Add `useMoneyFlow(cmteId)` hook |

## Verification

1. **Pipeline:** Run `compute_pac_top_funders` for both cycles, verify `derived.pac_top_funders` has rows for known large PACs (AMERICA PAC, SLF PAC, CLF, etc.)
2. **API:** Hit `GET /api/donors/C00828541/money-flow` (America PAC), verify top funders include Elon Musk and recipients match known data
3. **Frontend:** Navigate to `/donors/C00828541`, verify:
   - Money flow section renders in hero position
   - SVG curves connect funders → PAC → recipients
   - Stroke widths are proportional
   - Party badges use correct colors
   - Amounts are formatted correctly
   - Clicking a recipient navigates to their profile
   - Loading skeleton appears during fetch
   - Mobile layout stacks vertically
4. **Fallback:** Test a small PAC with no individual donor data — should show PAC sources instead
