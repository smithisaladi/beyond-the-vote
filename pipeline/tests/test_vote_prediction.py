from enrich.vote_prediction import build_feature_vector, train_vote_model


def test_build_feature_vector():
    legislator = {"nominate_dim1": -0.342, "nominate_dim2": 0.156, "party": "Democrat"}
    bill = {"sponsor_party": "Democrat", "topics": ["healthcare", "economy"], "policy_area": "Health"}
    features = build_feature_vector(legislator, bill)
    assert len(features) == 5
    assert features[0] == -0.342
    assert features[1] == 0.156
    assert features[2] == 1.0  # same party


def test_build_feature_vector_missing_scores():
    legislator = {"nominate_dim1": None, "nominate_dim2": None, "party": "Republican"}
    bill = {"sponsor_party": "Democrat", "topics": [], "policy_area": None}
    features = build_feature_vector(legislator, bill)
    assert features[0] == 0.0
    assert features[1] == 0.0
    assert features[2] == 0.0  # different party


def test_train_vote_model_with_synthetic_data():
    import numpy as np
    features = np.array([
        [-0.5, 0.1, 1.0, 1, 0],
        [-0.4, 0.2, 1.0, 0, 1],
        [0.5, -0.1, 0.0, 1, 0],
        [0.6, -0.2, 0.0, 0, 1],
    ])
    labels = np.array([1, 1, 0, 0])
    model, accuracy = train_vote_model(features, labels)
    assert model is not None
    assert 0 <= accuracy <= 1
