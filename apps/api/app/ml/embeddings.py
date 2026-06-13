# apps/api/app/ml/embeddings.py
"""Query-time text embedding using sentence-transformers."""
import asyncio

import structlog

log = structlog.get_logger()

_model = None


def load_embedding_model() -> None:
    global _model
    from sentence_transformers import SentenceTransformer
    log.info("loading_embedding_model", model="all-MiniLM-L6-v2")
    _model = SentenceTransformer("all-MiniLM-L6-v2")
    log.info("embedding_model_loaded")


def _embed_sync(text: str) -> list[float]:
    embedding = _model.encode(text, convert_to_numpy=True)
    return embedding.tolist()


async def embed_query(text: str) -> list[float]:
    if _model is None:
        raise RuntimeError("Embedding model not loaded. Call load_embedding_model() first.")
    return await asyncio.get_running_loop().run_in_executor(None, _embed_sync, text)


def is_model_loaded() -> bool:
    return _model is not None
