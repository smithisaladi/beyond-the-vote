# pipeline/tests/test_donor_clustering.py
from pipeline.enrich.donor_clustering import build_donor_features, cluster_donors, compute_feature_vectors
import numpy as np


def test_build_donor_features():
    donor = {"canonical_id": "d_1001", "total_amount": 5000.0, "contribution_count": 10,
             "party_d_pct": 0.7, "party_r_pct": 0.3, "candidate_pct": 0.6, "pac_pct": 0.4, "state_count": 3}
    features = build_donor_features(donor)
    assert len(features) == 7
    assert features[0] == 5000.0
    assert features[1] == 10
    assert features[2] == 0.7


def test_build_donor_features_missing_values():
    donor = {"canonical_id": "d_1001"}
    features = build_donor_features(donor)
    assert len(features) == 7
    assert all(f == 0.0 for f in features)


def test_cluster_donors_returns_labels():
    features = np.array([
        [1000, 5, 0.8, 0.2, 0.5, 0.5, 1],
        [1100, 6, 0.9, 0.1, 0.6, 0.4, 1],
        [50000, 2, 0.1, 0.9, 0.9, 0.1, 5],
        [55000, 3, 0.0, 1.0, 1.0, 0.0, 4],
    ])
    labels, reduced = cluster_donors(features, min_cluster_size=2)
    assert len(labels) == 4
    assert labels[0] == labels[1]
    assert labels[2] == labels[3]


def test_compute_feature_vectors_with_synthetic_data(tmp_path):
    import duckdb
    parquet_path = tmp_path / "test_indiv.parquet"
    conn = duckdb.connect(":memory:")
    conn.execute("""
        CREATE TABLE donors AS
        SELECT 'C00001' as cmte_id, '' as amndt_ind, '' as rpt_tp, '' as transaction_pgi,
               '' as image_num, '15' as transaction_tp, 'IND' as entity_tp,
               'SMITH, JOHN' as name, 'NY' as city, 'NY' as state, '10001' as zip_code,
               'ACME' as employer, 'CEO' as occupation, '01012025' as transaction_dt,
               '500' as transaction_amt, '' as other_id, '' as tran_id, '' as file_num,
               '' as memo_cd, '' as memo_text, '1001' as sub_id
        UNION ALL
        SELECT 'C00002', '', '', '', '', '15', 'IND', 'SMITH, JOHN', 'NY', 'NY', '10001',
               'ACME', 'CEO', '02012025', '300', '', '', '', '', '', '1002'
    """)
    conn.execute(f"COPY donors TO '{parquet_path}' (FORMAT PARQUET)")
    conn.close()
    canonical_map = {"1001": "d_1001", "1002": "d_1001"}
    result = compute_feature_vectors(parquet_path, canonical_map)
    assert len(result) >= 1
    assert "canonical_id" in result[0]
    assert "features" in result[0]
