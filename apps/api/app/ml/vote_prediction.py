# apps/api/app/ml/vote_prediction.py
"""Vote prediction model loading and inference."""
import base64
import io

import joblib
import numpy as np
import structlog

log = structlog.get_logger()

_models: dict[int, object] = {}
_accuracies: dict[int, float] = {}


async def load_vote_models(db_session) -> None:
    from sqlalchemy import text
    result = await db_session.execute(
        text("SELECT congress, model_bytes, accuracy FROM ops.ml_models WHERE model_name = 'vote_prediction'")
    )
    rows = result.mappings().all()
    for row in rows:
        congress = row["congress"]
        model_b64 = row["model_bytes"]
        if isinstance(model_b64, memoryview):
            model_bytes = bytes(model_b64)
        elif isinstance(model_b64, str):
            model_bytes = base64.b64decode(model_b64)
        else:
            model_bytes = model_b64
        buffer = io.BytesIO(model_bytes)
        model = joblib.load(buffer)
        _models[congress] = model
        _accuracies[congress] = float(row.get("accuracy") or 0)
        log.info("vote_model_loaded", congress=congress, accuracy=_accuracies[congress])


def predict_vote(congress: int, features: list[float]) -> dict | None:
    model = _models.get(congress)
    if model is None:
        return None
    X = np.array([features])
    prediction = model.predict(X)[0]
    probabilities = model.predict_proba(X)[0]
    return {
        "prediction": "Yea" if prediction == 1 else "Nay",
        "probability": float(max(probabilities)),
        "yeaProbability": float(probabilities[1]) if len(probabilities) > 1 else float(probabilities[0]),
        "nayProbability": float(probabilities[0]) if len(probabilities) > 1 else 0.0,
        "modelAccuracy": _accuracies.get(congress),
        "congress": congress,
    }


def is_model_available(congress: int) -> bool:
    return congress in _models
