# apps/api/app/ml/__init__.py
"""ML model registry — load all models at startup."""
import structlog

log = structlog.get_logger()


async def load_all_models(db_session=None) -> None:
    from app.ml.embeddings import load_embedding_model
    load_embedding_model()

    if db_session:
        from app.ml.vote_prediction import load_vote_models
        await load_vote_models(db_session)

    log.info("all_ml_models_loaded")
