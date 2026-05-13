# pipeline/tests/test_donor_clustering.py
from enrich.donor_clustering import build_donor_features, cluster_donors
import numpy as np


def test_build_donor_features():
    donor = {"canonical_id": "d_1001", "total_amount": 5000.0, "contribution_count": 10,
             "cmte_count": 3}
    features = build_donor_features(donor)
    assert len(features) == 3
    assert features[0] == 5000.0
    assert features[1] == 10
    assert features[2] == 3


def test_build_donor_features_missing_values():
    donor = {"canonical_id": "d_1001"}
    features = build_donor_features(donor)
    assert len(features) == 3
    assert all(f == 0.0 for f in features)


def test_cluster_donors_returns_labels():
    features = np.array([
        [1000, 5, 1],
        [1100, 6, 1],
        [50000, 2, 5],
        [55000, 3, 4],
    ])
    labels, reduced = cluster_donors(features, min_cluster_size=2)
    assert len(labels) == 4
