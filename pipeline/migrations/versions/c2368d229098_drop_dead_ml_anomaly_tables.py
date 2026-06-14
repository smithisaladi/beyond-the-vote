"""drop dead ml anomaly tables

Revision ID: c2368d229098
Revises: bcfe2420302d
Create Date: 2026-06-14 14:02:56.737276
"""
from alembic import op


revision = 'c2368d229098'
down_revision = 'bcfe2420302d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analytics.bundling_events")
    op.execute("DROP TABLE IF EXISTS analytics.donor_cluster")
    op.execute("DROP TABLE IF EXISTS analytics.donor_feature_vectors")
    op.execute("DROP TABLE IF EXISTS analytics.entity_centrality")
    op.execute("DROP TABLE IF EXISTS analytics.entity_community")
    op.execute("DROP TABLE IF EXISTS anomalies.amount_distribution_anomalies")
    op.execute("DROP TABLE IF EXISTS anomalies.committee_change_points")
    op.execute("DROP TABLE IF EXISTS anomalies.geographic_anomalies")
    op.execute("DROP TABLE IF EXISTS anomalies.suspicious_contribution_events")
    op.execute("DROP SCHEMA IF EXISTS anomalies CASCADE")
    op.execute("DROP TABLE IF EXISTS enrichment.donor_address_normalized")


def downgrade() -> None:
    # Best-effort restore: these were dead, empty scaffolding tables, so the
    # downgrade recreates columns/types/NOT NULL only — primary keys, defaults,
    # indexes, and foreign keys are intentionally NOT reconstructed.
    op.execute("CREATE SCHEMA IF NOT EXISTS anomalies")
    op.execute("""CREATE TABLE analytics.bundling_events (id bigint NOT NULL, committee_id text NOT NULL, event_date date NOT NULL, donor_count integer NOT NULL, total_amount numeric, signals jsonb NOT NULL, confidence real NOT NULL, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE analytics.donor_cluster (id bigint NOT NULL, canonical_donor_id text NOT NULL, cluster_id integer NOT NULL, cluster_label text, distance_to_centroid real, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE analytics.donor_feature_vectors (canonical_donor_id text NOT NULL, embedding vector NOT NULL, total_amount numeric, contribution_count integer, party_split_d real, party_split_r real, recipient_type_candidate real, recipient_type_pac real, geographic_spread real, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE analytics.entity_centrality (id bigint NOT NULL, entity_id text NOT NULL, entity_type text NOT NULL, pagerank real, betweenness real, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE analytics.entity_community (id bigint NOT NULL, entity_id text NOT NULL, entity_type text NOT NULL, community_id integer NOT NULL, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE anomalies.amount_distribution_anomalies (id bigint NOT NULL, committee_id text NOT NULL, anomaly_type text NOT NULL, magnitude real NOT NULL, examples jsonb, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE anomalies.committee_change_points (id bigint NOT NULL, committee_id text NOT NULL, change_date date NOT NULL, metric text NOT NULL, magnitude real NOT NULL, direction text, confidence real NOT NULL, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE anomalies.geographic_anomalies (id bigint NOT NULL, contribution_id bigint NOT NULL, canonical_donor_id text, anomaly_score real NOT NULL, donor_center_distance_km real, employer_distance_km real, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE anomalies.suspicious_contribution_events (id bigint NOT NULL, committee_id text NOT NULL, event_date date NOT NULL, donor_count integer NOT NULL, total_amount numeric, signals jsonb NOT NULL, score real NOT NULL, confidence real NOT NULL, model_version text NOT NULL, created_at timestamptz);""")
    op.execute("""CREATE TABLE enrichment.donor_address_normalized (id bigint NOT NULL, contribution_id bigint NOT NULL, street text, city text, state text, zip5 text, zip4 text, lat real, lon real, geocode_confidence real, model_version text NOT NULL, created_at timestamptz);""")
