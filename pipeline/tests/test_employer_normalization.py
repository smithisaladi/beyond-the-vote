from enrich.employer_normalization import (
    extract_unique_employers,
    pick_canonical_name,
    cluster_employers,
)


def test_extract_unique_employers(tmp_path):
    import duckdb
    parquet_path = tmp_path / "test_indiv.parquet"
    conn = duckdb.connect(":memory:")
    conn.execute("""
        CREATE TABLE donors AS
        SELECT 'GOLDMAN SACHS' as employer UNION ALL
        SELECT 'Goldman Sachs & Co.' UNION ALL
        SELECT 'GOLDMAN SACHS' UNION ALL
        SELECT 'RETIRED' UNION ALL
        SELECT 'GOOGLE LLC'
    """)
    conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
    conn.close()

    employers = extract_unique_employers(parquet_path)
    assert "RETIRED" not in employers
    assert len(employers) == 3


def test_pick_canonical_name():
    variants = ["GOLDMAN SACHS", "Goldman Sachs & Co.", "GS", "goldman sachs group inc"]
    canonical = pick_canonical_name(variants)
    assert canonical is not None
    assert len(canonical) > 2


def test_cluster_employers_identical():
    employers = ["goldman sachs", "goldman sachs", "google llc"]
    clusters = cluster_employers(employers, model=None)
    assert len(clusters) == 2
