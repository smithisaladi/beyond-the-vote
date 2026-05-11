"""Generate bill embeddings and upload to enrichment.bill_embeddings."""
import structlog
from shared.db import get_conn, upsert
from shared.embeddings import get_model, embed_texts

log = structlog.get_logger()
MODEL_VERSION = "all-MiniLM-L6-v2-v1"


def load_bill_embeddings(batch_size: int = 500) -> int:
    conn = get_conn()
    cur = conn.cursor()
    model = get_model()

    cur.execute("SELECT bill_id FROM enrichment.bill_embeddings WHERE model_version = %s", (MODEL_VERSION,))
    existing = {r[0] for r in cur.fetchall()}
    log.info("existing_embeddings", count=len(existing))

    cur.execute("SELECT bill_id, title, summary FROM congress.bills")
    all_bills = cur.fetchall()

    total = 0
    to_embed = [b for b in all_bills if b[0] not in existing]

    for i in range(0, len(to_embed), batch_size):
        chunk = to_embed[i : i + batch_size]
        texts = [f"{b[1] or ''} {b[2] or ''}".strip() for b in chunk]
        embeddings = embed_texts(model, texts)
        rows = [{"bill_id": b[0], "embedding": emb, "model_version": MODEL_VERSION} for b, emb in zip(chunk, embeddings)]
        upsert("bill_embeddings", rows, on_conflict="bill_id", schema="enrichment")
        total += len(rows)
        log.info("embedded_batch", count=len(rows), total=total)

    log.info("bill_embeddings_complete", total=total)
    return total
