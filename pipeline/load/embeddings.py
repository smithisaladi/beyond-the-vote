"""Generate bill embeddings and upload to enrichment.bill_embeddings."""
import structlog
from shared.db import get_supabase, upsert
from shared.embeddings import get_model, embed_texts

log = structlog.get_logger()
MODEL_VERSION = "all-MiniLM-L6-v2-v1"


def load_bill_embeddings(batch_size: int = 500) -> int:
    client = get_supabase()
    model = get_model()

    existing = set()
    result = client.schema("enrichment").table("bill_embeddings").select("bill_id").eq("model_version", MODEL_VERSION).execute()
    for row in result.data:
        existing.add(row["bill_id"])
    log.info("existing_embeddings", count=len(existing))

    offset = 0
    total = 0
    page_size = 1000

    while True:
        result = client.schema("congress").table("bills").select("bill_id, title, summary").range(offset, offset + page_size - 1).execute()
        bills = result.data
        if not bills:
            break

        to_embed = [b for b in bills if b["bill_id"] not in existing]
        if to_embed:
            texts = [f"{b['title'] or ''} {b['summary'] or ''}".strip() for b in to_embed]
            embeddings = embed_texts(model, texts)
            rows = [{"bill_id": bill["bill_id"], "embedding": embedding, "model_version": MODEL_VERSION} for bill, embedding in zip(to_embed, embeddings)]
            upsert("bill_embeddings", rows, on_conflict="bill_id", schema="enrichment")
            total += len(rows)
            log.info("embedded_batch", count=len(rows), total=total)

        offset += page_size
        if len(bills) < page_size:
            break

    log.info("bill_embeddings_complete", total=total)
    return total
