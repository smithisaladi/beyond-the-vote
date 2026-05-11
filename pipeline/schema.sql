-- Beyond the Ballot — Full Database Schema
-- 8 Postgres schemas organized by domain

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS congress;
CREATE SCHEMA IF NOT EXISTS fec;
CREATE SCHEMA IF NOT EXISTS enrichment;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS anomalies;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS derived;
CREATE SCHEMA IF NOT EXISTS ops;

-- ============================================================
-- congress.* — Legislative data
-- ============================================================

CREATE TABLE congress.legislators (
    bioguide_id     text PRIMARY KEY,
    lis_id          text UNIQUE,
    icpsr_id        integer,
    govtrack_id     text,
    thomas_id       text,
    fec_ids         text[],
    first_name      text NOT NULL,
    last_name       text NOT NULL,
    full_name       text NOT NULL,
    party           text NOT NULL,
    chamber         text NOT NULL,
    state           text NOT NULL,
    state_full      text NOT NULL,
    district        integer,
    title           text NOT NULL,
    in_office       boolean DEFAULT true,
    birthday        date,
    gender          text,
    website         text,
    phone           text,
    address         text,
    photo_url       text,
    term_start      date,
    term_end        date,
    senate_class    integer,
    next_election   integer,
    twitter         text,
    facebook        text,
    youtube         text,
    fec_committee_id text,
    raw_json        jsonb,
    synced_at       timestamptz DEFAULT now()
);

CREATE INDEX ON congress.legislators USING gin(fec_ids);
CREATE INDEX ON congress.legislators (chamber);
CREATE INDEX ON congress.legislators (state);
CREATE INDEX ON congress.legislators (party);

CREATE TABLE congress.bills (
    bill_id         text PRIMARY KEY,
    congress        integer NOT NULL,
    bill_type       text NOT NULL,
    bill_number     text,
    title           text NOT NULL,
    summary         text,
    combined_text   text,
    status          text,
    policy_area     text,
    topics          text[] NOT NULL DEFAULT '{}',
    sponsor_bioguide_id text REFERENCES congress.legislators(bioguide_id),
    sponsor_name    text,
    sponsor_party   text,
    introduced_date date,
    last_action_text text,
    last_action_date date,
    congress_gov_url text,
    referenced_agencies text[],
    referenced_laws    text[],
    referenced_usc     text[],
    search_vector   tsvector,
    synced_at       timestamptz DEFAULT now()
);

CREATE INDEX ON congress.bills USING gin(search_vector);
CREATE INDEX ON congress.bills USING gin(title gin_trgm_ops);
CREATE INDEX ON congress.bills USING gin(topics);
CREATE INDEX ON congress.bills (congress);
CREATE INDEX ON congress.bills (status);
CREATE INDEX ON congress.bills (policy_area);

CREATE TABLE congress.bill_vote_summaries (
    id              text PRIMARY KEY,
    bill_id         text NOT NULL,
    congress        integer NOT NULL,
    chamber         text NOT NULL,
    date            date NOT NULL,
    question        text,
    result          text NOT NULL,
    title           text,
    required        text,
    yea_total       integer DEFAULT 0,
    nay_total       integer DEFAULT 0,
    present_total   integer,
    not_voting_total integer,
    yea_democrat    integer,
    nay_democrat    integer,
    yea_republican  integer,
    nay_republican  integer,
    yea_independent integer,
    nay_independent integer,
    source_url      text,
    synced_at       timestamptz DEFAULT now()
);

CREATE INDEX ON congress.bill_vote_summaries (bill_id);
CREATE INDEX ON congress.bill_vote_summaries (date);

-- Bill cosponsors
CREATE TABLE congress.bill_cosponsors (
    bill_id         text NOT NULL,
    bioguide_id     text NOT NULL,
    sponsored_at    date,
    withdrawn_at    date,
    original_cosponsor boolean DEFAULT false,
    PRIMARY KEY (bill_id, bioguide_id)
);

CREATE INDEX ON congress.bill_cosponsors (bioguide_id);

-- Bill action timeline
CREATE TABLE congress.bill_actions (
    id              bigserial PRIMARY KEY,
    bill_id         text NOT NULL,
    acted_at        text NOT NULL,
    text            text NOT NULL,
    action_code     text,
    action_type     text,
    UNIQUE (bill_id, acted_at, text)
);

CREATE INDEX ON congress.bill_actions (bill_id);

CREATE TABLE congress.bill_vote_positions (
    vote_id         text NOT NULL REFERENCES congress.bill_vote_summaries(id) ON DELETE CASCADE,
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    position        text NOT NULL,
    PRIMARY KEY (vote_id, bioguide_id)
);

CREATE INDEX ON congress.bill_vote_positions (bioguide_id);

CREATE TABLE congress.committees (
    thomas_id       text PRIMARY KEY,
    name            text NOT NULL,
    chamber         text NOT NULL,
    committee_type  text,
    parent_id       text REFERENCES congress.committees(thomas_id),
    url             text,
    synced_at       timestamptz DEFAULT now()
);

CREATE TABLE congress.committee_memberships (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    committee_id    text NOT NULL REFERENCES congress.committees(thomas_id) ON DELETE CASCADE,
    rank            integer,
    role            text,
    PRIMARY KEY (bioguide_id, committee_id)
);

CREATE TABLE congress.member_scores (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    congress        integer NOT NULL,
    nominate_dim1   real,
    nominate_dim2   real,
    synced_at       timestamptz DEFAULT now(),
    PRIMARY KEY (bioguide_id, congress)
);

-- ============================================================
-- fec.* — Campaign finance source data
-- ============================================================

CREATE TABLE fec.pac_to_candidate (
    sub_id          bigint PRIMARY KEY,
    cmte_id         text NOT NULL,
    cand_id         text,
    transaction_tp  text,
    transaction_amt numeric(12,2),
    transaction_dt  text,
    cycle           smallint NOT NULL
);

CREATE INDEX ON fec.pac_to_candidate (cmte_id);
CREATE INDEX ON fec.pac_to_candidate (cand_id);
CREATE INDEX ON fec.pac_to_candidate (cycle);

CREATE TABLE fec.independent_expenditures (
    sub_id          bigint PRIMARY KEY,
    cmte_id         text NOT NULL,
    cand_id         text,
    sup_opp         char(1) NOT NULL CHECK (sup_opp IN ('S', 'O')),
    transaction_tp  text,
    transaction_amt numeric(12,2),
    transaction_dt  text,
    cycle           smallint NOT NULL
);

CREATE INDEX ON fec.independent_expenditures (cmte_id);
CREATE INDEX ON fec.independent_expenditures (cand_id);
CREATE INDEX ON fec.independent_expenditures (cycle);

CREATE TABLE fec.cmte_names (
    cmte_id         text PRIMARY KEY,
    cmte_name       text NOT NULL,
    connected_org   text
);

CREATE TABLE fec.candidates (
    cand_id         text PRIMARY KEY,
    cand_name       text NOT NULL,
    cand_party      text,
    cand_office     text,
    cand_state      text,
    cand_district   text,
    cycle           smallint NOT NULL
);

CREATE INDEX ON fec.candidates (cycle);

-- ============================================================
-- enrichment.* — ML-produced clean data (Tier 1)
-- ============================================================

CREATE TABLE enrichment.donor_canonical (
    id              bigserial PRIMARY KEY,
    canonical_id    text NOT NULL,
    contribution_id bigint NOT NULL,
    raw_name        text,
    raw_employer    text,
    raw_address     text,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.donor_canonical (canonical_id);
CREATE INDEX ON enrichment.donor_canonical (model_version);

CREATE TABLE enrichment.employer_canonical (
    id              bigserial PRIMARY KEY,
    canonical_employer_id text NOT NULL,
    raw_string      text NOT NULL,
    canonical_name  text NOT NULL,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.employer_canonical (canonical_employer_id);
CREATE INDEX ON enrichment.employer_canonical (raw_string);

CREATE TABLE enrichment.employer_industry (
    id              bigserial PRIMARY KEY,
    canonical_employer_id text NOT NULL,
    industry        text NOT NULL,
    sub_industry    text,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    classified_at   timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.employer_industry (canonical_employer_id);
CREATE INDEX ON enrichment.employer_industry (industry);

CREATE TABLE enrichment.donor_address_normalized (
    id              bigserial PRIMARY KEY,
    contribution_id bigint NOT NULL,
    street          text,
    city            text,
    state           text,
    zip5            text,
    zip4            text,
    lat             real,
    lon             real,
    geocode_confidence real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.donor_address_normalized (zip5);
CREATE INDEX ON enrichment.donor_address_normalized (state);

CREATE TABLE enrichment.bill_embeddings (
    bill_id         text PRIMARY KEY REFERENCES congress.bills(bill_id) ON DELETE CASCADE,
    embedding       vector(384) NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON enrichment.bill_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================
-- analytics.* — Pattern detection (Tier 2)
-- ============================================================

CREATE TABLE analytics.donor_cluster (
    id              bigserial PRIMARY KEY,
    canonical_donor_id text NOT NULL,
    cluster_id      integer NOT NULL,
    cluster_label   text,
    distance_to_centroid real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.donor_cluster (canonical_donor_id);
CREATE INDEX ON analytics.donor_cluster (cluster_id);

CREATE TABLE analytics.entity_community (
    id              bigserial PRIMARY KEY,
    entity_id       text NOT NULL,
    entity_type     text NOT NULL,
    community_id    integer NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.entity_community (entity_id, entity_type);
CREATE INDEX ON analytics.entity_community (community_id);

CREATE TABLE analytics.entity_centrality (
    id              bigserial PRIMARY KEY,
    entity_id       text NOT NULL,
    entity_type     text NOT NULL,
    pagerank        real,
    betweenness     real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.entity_centrality (entity_id, entity_type);

CREATE TABLE analytics.bundling_events (
    id              bigserial PRIMARY KEY,
    committee_id    text NOT NULL,
    event_date      date NOT NULL,
    donor_count     integer NOT NULL,
    total_amount    numeric(12,2),
    signals         jsonb NOT NULL,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.bundling_events (committee_id);

CREATE TABLE analytics.money_flow_attribution (
    id              bigserial PRIMARY KEY,
    destination_committee_id text NOT NULL,
    origin_entity_id text NOT NULL,
    origin_entity_type text NOT NULL,
    attributed_amount numeric(12,2) NOT NULL,
    hop_count       integer NOT NULL,
    path            text[],
    cycle           smallint NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.money_flow_attribution (destination_committee_id);
CREATE INDEX ON analytics.money_flow_attribution (origin_entity_id);

CREATE TABLE analytics.donor_feature_vectors (
    canonical_donor_id text PRIMARY KEY,
    embedding       vector(64) NOT NULL,
    total_amount    numeric(12,2),
    contribution_count integer,
    party_split_d   real,
    party_split_r   real,
    recipient_type_candidate real,
    recipient_type_pac real,
    geographic_spread real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON analytics.donor_feature_vectors
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============================================================
-- anomalies.* — Flagged patterns (Tier 3)
-- ============================================================

CREATE TABLE anomalies.suspicious_contribution_events (
    id              bigserial PRIMARY KEY,
    committee_id    text NOT NULL,
    event_date      date NOT NULL,
    donor_count     integer NOT NULL,
    total_amount    numeric(12,2),
    signals         jsonb NOT NULL,
    score           real NOT NULL,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON anomalies.suspicious_contribution_events (committee_id);
CREATE INDEX ON anomalies.suspicious_contribution_events (score);

CREATE TABLE anomalies.committee_change_points (
    id              bigserial PRIMARY KEY,
    committee_id    text NOT NULL,
    change_date     date NOT NULL,
    metric          text NOT NULL,
    magnitude       real NOT NULL,
    direction       text,
    confidence      real NOT NULL,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE INDEX ON anomalies.committee_change_points (committee_id);

CREATE TABLE anomalies.geographic_anomalies (
    id              bigserial PRIMARY KEY,
    contribution_id bigint NOT NULL,
    canonical_donor_id text,
    anomaly_score   real NOT NULL,
    donor_center_distance_km real,
    employer_distance_km real,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE anomalies.amount_distribution_anomalies (
    id              bigserial PRIMARY KEY,
    committee_id    text NOT NULL,
    anomaly_type    text NOT NULL,
    magnitude       real NOT NULL,
    examples        jsonb,
    model_version   text NOT NULL,
    created_at      timestamptz DEFAULT now()
);

-- ============================================================
-- app.* — User-facing data
-- ============================================================

CREATE TABLE app.profiles (
    id              uuid PRIMARY KEY,
    display_name    text,
    avatar_url      text,
    activity_last_seen_at timestamptz,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE app.followed_politicians (
    user_id         uuid NOT NULL,
    politician_id   text NOT NULL REFERENCES congress.legislators(bioguide_id),
    created_at      timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, politician_id)
);

CREATE TABLE app.tracked_bills (
    user_id         uuid NOT NULL,
    bill_id         text NOT NULL REFERENCES congress.bills(bill_id),
    created_at      timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, bill_id)
);

CREATE TABLE app.topic_preferences (
    user_id         uuid NOT NULL,
    topic           text NOT NULL,
    created_at      timestamptz DEFAULT now(),
    PRIMARY KEY (user_id, topic)
);

-- ============================================================
-- derived.* — Pipeline-computed aggregations
-- ============================================================

CREATE TABLE derived.legislator_funding_summary (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    cycle           smallint NOT NULL,
    pac_direct_total numeric(12,2) DEFAULT 0,
    large_donor_total numeric(12,2) DEFAULT 0,
    small_donor_total numeric(12,2) DEFAULT 0,
    superpac_ie_for  numeric(12,2) DEFAULT 0,
    superpac_ie_against numeric(12,2) DEFAULT 0,
    in_state_total   numeric(12,2) DEFAULT 0,
    out_of_state_total numeric(12,2) DEFAULT 0,
    computed_at      timestamptz DEFAULT now(),
    PRIMARY KEY (bioguide_id, cycle)
);

CREATE TABLE derived.legislator_top_pacs (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    cycle           smallint NOT NULL,
    cmte_id         text NOT NULL,
    cmte_name       text,
    industry        text,
    direct_contribution numeric(12,2) DEFAULT 0,
    ie_for          numeric(12,2) DEFAULT 0,
    ie_against      numeric(12,2) DEFAULT 0,
    total_support   numeric(12,2) DEFAULT 0,
    rank            integer,
    PRIMARY KEY (bioguide_id, cycle, cmte_id)
);

CREATE TABLE derived.legislator_top_contributors (
    bioguide_id     text NOT NULL REFERENCES congress.legislators(bioguide_id) ON DELETE CASCADE,
    cycle           smallint NOT NULL,
    org_name        text NOT NULL,
    individual_total numeric(12,2) DEFAULT 0,
    pac_total       numeric(12,2) DEFAULT 0,
    grand_total     numeric(12,2) DEFAULT 0,
    rank            integer,
    PRIMARY KEY (bioguide_id, cycle, org_name)
);

CREATE TABLE derived.contributor_leaderboard_cache (
    cmte_id         text PRIMARY KEY,
    cmte_name       text NOT NULL,
    direct_total    numeric(12,2) DEFAULT 0,
    ie_for_total    numeric(12,2) DEFAULT 0,
    ie_against_total numeric(12,2) DEFAULT 0,
    total_contributions numeric(12,2) DEFAULT 0,
    recipient_count integer DEFAULT 0,
    top_recipients  jsonb,
    computed_at     timestamptz DEFAULT now()
);

CREATE INDEX ON derived.contributor_leaderboard_cache (total_contributions DESC);
CREATE INDEX ON derived.contributor_leaderboard_cache USING gin(cmte_name gin_trgm_ops);

-- ============================================================
-- ops.* — Pipeline operations
-- ============================================================

CREATE TABLE ops.pipeline_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    script_name     text NOT NULL,
    started_at      timestamptz DEFAULT now(),
    finished_at     timestamptz,
    status          text NOT NULL DEFAULT 'running',
    rows_processed  integer DEFAULT 0,
    rows_skipped    integer DEFAULT 0,
    errors          integer DEFAULT 0,
    watermark       timestamptz,
    metadata        jsonb,
    error_detail    text
);

CREATE INDEX ON ops.pipeline_runs (script_name, started_at DESC);

CREATE TABLE ops.bulk_import_checkpoints (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    script          text NOT NULL,
    source_file     text NOT NULL,
    chunk_index     integer NOT NULL,
    status          text DEFAULT 'completed',
    created_at      timestamptz DEFAULT now(),
    UNIQUE (script, source_file, chunk_index)
);

CREATE TABLE ops.donor_overrides (
    id              bigserial PRIMARY KEY,
    canonical_id_from text NOT NULL,
    canonical_id_to   text NOT NULL,
    reason          text,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE ops.employer_overrides (
    id              bigserial PRIMARY KEY,
    raw_string      text NOT NULL,
    correct_canonical_employer_id text NOT NULL,
    reason          text,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE ops.industry_overrides (
    id              bigserial PRIMARY KEY,
    canonical_employer_id text NOT NULL,
    correct_industry text NOT NULL,
    reason          text,
    created_at      timestamptz DEFAULT now()
);

CREATE TABLE ops.ml_models (
    id              bigserial PRIMARY KEY,
    model_name      text NOT NULL,
    congress        integer,
    model_bytes     bytea NOT NULL,
    accuracy        real,
    feature_names   text[],
    trained_at      timestamptz DEFAULT now(),
    model_version   text NOT NULL
);

CREATE UNIQUE INDEX ON ops.ml_models (model_name, congress);

-- ============================================================
-- Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION congress.bills_search_vector_update() RETURNS trigger AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(NEW.summary, '')), 'B') ||
        setweight(to_tsvector('english',
            coalesce(NEW.sponsor_name, '') || ' ' ||
            coalesce(NEW.policy_area, '') || ' ' ||
            coalesce(array_to_string(NEW.topics, ' '), '')
        ), 'C') ||
        setweight(to_tsvector('english', coalesce(NEW.bill_number, '')), 'D');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bills_search_vector_trigger
    BEFORE INSERT OR UPDATE ON congress.bills
    FOR EACH ROW EXECUTE FUNCTION congress.bills_search_vector_update();
