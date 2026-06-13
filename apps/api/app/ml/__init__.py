# apps/api/app/ml/__init__.py
"""ML model registry — load all models at startup."""
import structlog

log = structlog.get_logger()


def load_all_models() -> None:
    from app.ml.embeddings import load_embedding_model
    load_embedding_model()
    log.info("all_ml_models_loaded")
