from shared.embeddings import get_model, embed_texts


def test_get_model_loads_successfully():
    model = get_model()
    assert model is not None


def test_embed_texts_returns_correct_dimensions():
    model = get_model()
    texts = ["This is a test bill about clean energy.", "Healthcare reform act."]
    embeddings = embed_texts(model, texts)
    assert len(embeddings) == 2
    assert len(embeddings[0]) == 384


def test_embed_texts_empty_input():
    model = get_model()
    embeddings = embed_texts(model, [])
    assert len(embeddings) == 0
