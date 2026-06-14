import pytest
from shared.embeddings import get_model, embed_texts


def _load_model():
    try:
        return get_model()
    except OSError:
        pytest.skip("embedding model not available (no network or cache)")


def test_get_model_loads_successfully():
    model = _load_model()
    assert model is not None


def test_embed_texts_returns_correct_dimensions():
    model = _load_model()
    texts = ["This is a test bill about clean energy.", "Healthcare reform act."]
    embeddings = embed_texts(model, texts)
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 384


def test_embed_texts_empty_input():
    model = _load_model()
    embeddings = embed_texts(model, [])
    assert len(embeddings) == 0
