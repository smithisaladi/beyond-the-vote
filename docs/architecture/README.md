# Architecture Documentation

Detailed technical documentation for the Beyond the Ballot platform.

## Documents

| # | Document | Topics |
|---|----------|--------|
| 01 | [System Overview](01-system-overview.md) | High-level architecture, component summary, deployment topology, repository layout, key design decisions |
| 02 | [Database Schema](02-database-schema.md) | 8 Postgres schemas, core tables, FK graph, indexing strategy (GIN, HNSW, trigram) |
| 03 | [Data Pipeline](03-data-pipeline.md) | ETL architecture, run order, watermarks, DuckDB, 3-tier ML enrichment, GitHub Actions |
| 04 | [Search System](04-search-system.md) | Hybrid search (FTS + trigram + semantic), Reciprocal Rank Fusion, tsvector trigger, graceful degradation |
| 05 | [Auth Flow](05-auth-flow.md) | Neon Auth, EdDSA JWT, JWKS validation, frontend/backend auth, token lifecycle |
| 06 | [ML System](06-ml-system.md) | Embeddings, vote prediction, donor similarity, entity resolution, clustering, change-point detection |
| 07 | [Frontend Architecture](07-frontend-architecture.md) | TanStack Router/Query, component organization, design system, state management, Vite config |
| 08 | [API Design](08-api-design.md) | Router map, endpoint reference, middleware, caching, error handling, connection pooling |
| 09 | [Money Flow System](09-money-flow-system.md) | Donor entity resolution (blocking, clustering, cross-block merge, condensed schema), money flow graph (proportional attribution), PAC top funders pipeline, SVG visualization component, all-inclusive PAC queries, IE support/oppose distinction |
| 10 | [Design Decisions & Scaling](10-design-decisions-and-scaling.md) | Defense of every major architecture choice, production scaling roadmap (10K → 1M+ users), cost analysis, CI/CD audit, cron schedules, monitoring plan, known debt |
| 11 | [Database Design Trade-offs](11-database-design-tradeoffs.md) | Complete table inventory (45 tables), design rationale per table, indexing strategy, FK constraints, storage projections, known issues, schema/model mismatches |
| 12 | [Infrastructure](12-infrastructure.md) | Deployment topology, Vercel/Render/Neon config, CI/CD workflows (5 test jobs, 2 sync crons), environment variables, connection management, operational runbook |
