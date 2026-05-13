# Technical Interview Questions

Interview-style questions and answers for technical deep dives on the Beyond the Ballot platform. Each document covers a different domain with progressively deeper questions.

## Documents

| # | Document | Topics |
|---|----------|--------|
| 01 | [System Design](01-system-design.md) | Architecture decisions, scaling strategy, data flow, failure handling, trade-offs |
| 02 | [Scaling & Performance](02-scaling-and-performance.md) | Hybrid search optimization, FEC file handling, caching, connection pooling, N+1 queries, monitoring |
| 03 | [Data Engineering](03-data-engineering.md) | 3-tier enrichment, donor resolution, money flow, DuckDB, data consistency, tsvector triggers |
| 04 | [Frontend & API](04-frontend-and-api.md) | TanStack Router/Query, cache invalidation, search lifecycle, real-time features, design system, N+1 prevention |
| 05 | [Security & Auth](05-security-and-auth.md) | JWT validation, SQL injection prevention, auth guards, rate limiting, data privacy |
| 06 | [ML Deep Dive](06-ml-deep-dive.md) | Embedding model choice, vote prediction, HDBSCAN clustering, AI summaries, search quality, change-point detection |
| 07 | [Money Flow & Entity Resolution](07-money-flow-and-entity-resolution.md) | End-to-end donation tracing, condensed schema design, cross-block merge trade-offs, fast-path optimization, all-inclusive PAC queries, SVG visualization, production scaling |

## How to Use

These questions are designed for:
- **Self-study** — review before technical interviews about this project
- **Team onboarding** — understand the reasoning behind architectural decisions
- **Technical reviews** — structured discussion of system trade-offs
