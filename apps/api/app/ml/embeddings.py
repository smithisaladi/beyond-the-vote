# apps/api/app/ml/embeddings.py
"""Query-time text embedding using sentence-transformers."""
import structlog

log = structlog.get_logger()

_model = None


def load_embedding_model() -> None:
    global _model
    from sentence_transformers import SentenceTransformer
    log.info("loading_embedding_model", model="all-MiniLM-L6-v2")
    _model = SentenceTransformer("all-MiniLM-L6-v2")
    log.info("embedding_model_loaded")


def embed_query(text: str) -> list[float]:
    if _model is None:
        raise RuntimeError("Embedding model not loaded. Call load_embedding_model() first.")
    embedding = _model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


def is_model_loaded() -> bool:
    return _model is not None
