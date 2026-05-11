"""Sentence-transformers model loading and embedding utilities."""
from pathlib import Path
import structlog

log = structlog.get_logger()

_MODEL_NAME = "all-MiniLM-L6-v2"
_model = None


def get_model(cache_dir: Path | None = None):
    global _model
    if _model is not None:
        return _model
    from sentence_transformers import SentenceTransformer
    cache_path = str(cache_dir) if cache_dir else None
    log.info("loading_embedding_model", model=_MODEL_NAME)
    _model = SentenceTransformer(_MODEL_NAME, cache_folder=cache_path)
    log.info("embedding_model_loaded", model=_MODEL_NAME)
    return _model


def embed_texts(model, texts: list[str], batch_size: int = 256) -> list[list[float]]:
    if not texts:
        return []
    embeddings = model.encode(texts, batch_size=batch_size, show_progress_bar=True, convert_to_numpy=True)
    return [emb.tolist() for emb in embeddings]
