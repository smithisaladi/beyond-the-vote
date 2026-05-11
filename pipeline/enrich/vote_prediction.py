"""Train vote prediction model (logistic regression) and upload to ops.ml_models."""
import io
import base64

import joblib
import numpy as np
import structlog
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import cross_val_score

import psycopg2.extras

from shared.db import get_conn, upsert

log = structlog.get_logger()

MODEL_NAME = "vote_prediction"
MODEL_VERSION = "vote_pred_v1_logreg"
FEATURE_NAMES = ["nominate_dim1", "nominate_dim2", "same_party", "topic_count", "is_policy_health"]


def build_feature_vector(legislator: dict, bill: dict) -> list[float]:
    dim1 = float(legislator.get("nominate_dim1") or 0)
    dim2 = float(legislator.get("nominate_dim2") or 0)
    leg_party = (legislator.get("party") or "").strip()
    sponsor_party = (bill.get("sponsor_party") or "").strip()
    same_party = 1.0 if leg_party and sponsor_party and leg_party == sponsor_party else 0.0
    topics = bill.get("topics") or []
    topic_count = float(len(topics))
    policy = (bill.get("policy_area") or "").lower()
    is_health = 1.0 if "health" in policy else 0.0
    return [dim1, dim2, same_party, topic_count, is_health]


def train_vote_model(features: np.ndarray, labels: np.ndarray) -> tuple:
    model = LogisticRegression(max_iter=1000, class_weight="balanced")
    unique, counts = np.unique(labels, return_counts=True)
    min_class_count = int(counts.min()) if len(counts) > 0 else 1
    cv = min(5, len(labels), min_class_count)
    cv = max(cv, 2)
    scores = cross_val_score(model, features, labels, cv=cv, scoring="accuracy")
    accuracy = float(scores.mean())
    model.fit(features, labels)
    log.info("model_trained", accuracy=accuracy, samples=len(labels))
    return model, accuracy


def run_vote_prediction_training(congress_num: int = 119) -> None:
    conn = get_conn()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    log.info("fetching_training_data", congress=congress_num)

    cur.execute("SELECT vote_id, bioguide_id, position FROM congress.bill_vote_positions")
    positions_data = [dict(r) for r in cur.fetchall()]
    if not positions_data:
        log.warning("no_vote_positions_found")
        return

    cur.execute("SELECT bioguide_id, nominate_dim1, nominate_dim2 FROM congress.member_scores WHERE congress = %s", (congress_num,))
    scores_by_id = {r["bioguide_id"]: dict(r) for r in cur.fetchall()}

    cur.execute("SELECT bioguide_id, party FROM congress.legislators")
    party_by_id = {r["bioguide_id"]: r["party"] for r in cur.fetchall()}

    cur.execute("SELECT id, bill_id FROM congress.bill_vote_summaries")
    bill_id_by_vote = {r["id"]: r["bill_id"] for r in cur.fetchall()}

    cur.execute("SELECT bill_id, sponsor_party, topics, policy_area FROM congress.bills")
    bills_by_id = {r["bill_id"]: dict(r) for r in cur.fetchall()}

    features_list = []
    labels_list = []

    for pos in positions_data:
        bio_id = pos["bioguide_id"]
        position = pos["position"]
        if position not in ("Yea", "Nay"):
            continue
        score = scores_by_id.get(bio_id)
        if not score or score.get("nominate_dim1") is None:
            continue
        bill_id = bill_id_by_vote.get(pos["vote_id"])
        if not bill_id:
            continue
        bill = bills_by_id.get(bill_id)
        if not bill:
            continue
        legislator = {
            "nominate_dim1": score["nominate_dim1"],
            "nominate_dim2": score["nominate_dim2"],
            "party": party_by_id.get(bio_id, ""),
        }
        fv = build_feature_vector(legislator, bill)
        features_list.append(fv)
        labels_list.append(1 if position == "Yea" else 0)

    if len(features_list) < 10:
        log.warning("insufficient_training_data", count=len(features_list))
        return

    features = np.array(features_list)
    labels = np.array(labels_list)
    log.info("training_data_built", samples=len(labels), yea_rate=float(labels.mean()))

    model, accuracy = train_vote_model(features, labels)

    buffer = io.BytesIO()
    joblib.dump(model, buffer)
    model_bytes = buffer.getvalue()
    model_b64 = base64.b64encode(model_bytes).decode("ascii")

    log.info("model_serialized", size_bytes=len(model_bytes), accuracy=accuracy)

    upsert("ml_models", [{
        "model_name": MODEL_NAME,
        "congress": congress_num,
        "model_bytes": model_b64,
        "accuracy": accuracy,
        "feature_names": FEATURE_NAMES,
        "model_version": MODEL_VERSION,
    }], on_conflict="model_name,congress", schema="ops")

    log.info("model_uploaded", congress=congress_num, accuracy=accuracy)
