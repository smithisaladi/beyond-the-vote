"""Generate bill embeddings and upload to enrichment.bill_embeddings."""
import structlog
from shared.db import get_conn, upsert
from shared.embeddings import get_model, embed_texts

log = structlog.get_logger()
MODEL_VERSION = "all-MiniLM-L6-v2-v1"


def _has_text(title: str | None, summary: str | None) -> bool:
    """Return True if a bill has any non-empty text to embed."""
    return bool((title or "").strip() or (summary or "").strip())


def _build_text(title: str | None, summary: str | None) -> str:
    """Combine title and summary into embedding input text."""
    return f"{title or ''} {summary or ''}".strip()


def load_bill_embeddings(batch_size: int = 500) -> int:
    conn = get_conn()
    cur = conn.cursor()
    model = get_model()

    # ── Existing embeddings ──────────────────────────────────────────────
    cur.execute(
        "SELECT bill_id FROM enrichment.bill_embeddings WHERE model_version = %s",
        (MODEL_VERSION,),
    )
    existing = {r[0] for r in cur.fetchall()}
    log.info("existing_embeddings", count=len(existing))

    # ── Fetch all bills ──────────────────────────────────────────────────
    cur.execute("SELECT bill_id, title, summary FROM congress.bills")
    all_bills = cur.fetchall()

    # Filter: new bills with text, skip empty-text and already-embedded
    to_embed = [
        b for b in all_bills
        if b[0] not in existing and _has_text(b[1], b[2])
    ]

    total = 0
    failed_ids: list[str] = []

    # ── Embed new bills in batches ───────────────────────────────────────
    for i in range(0, len(to_embed), batch_size):
        chunk = to_embed[i : i + batch_size]
        batch_num = i // batch_size + 1
        log.info(
            "embedding_batch",
            batch=batch_num,
            first_bill_id=chunk[0][0],
            last_bill_id=chunk[-1][0],
            count=len(chunk),
        )
        try:
            texts = [_build_text(b[1], b[2]) for b in chunk]
            embeddings = embed_texts(model, texts)
            rows = [
                {
                    "bill_id": b[0],
                    "embedding": emb,
                    "model_version": MODEL_VERSION,
                    "has_summary": bool(b[2]),
                }
                for b, emb in zip(chunk, embeddings)
            ]
            upsert("bill_embeddings", rows, on_conflict="bill_id", schema="enrichment")
            total += len(rows)
            log.info("embedded_batch", count=len(rows), total=total)
        except Exception:
            batch_ids = [b[0] for b in chunk]
            failed_ids.extend(batch_ids)
            log.error("batch_embed_failed", batch=batch_num, bill_ids=batch_ids)

    # ── Re-embed stale bills (summary arrived since last embed) ──────────
    cur.execute("""
        SELECT b.bill_id, b.title, b.summary
        FROM congress.bills b
        JOIN enrichment.bill_embeddings e ON e.bill_id = b.bill_id
        WHERE e.has_summary = false
          AND b.summary IS NOT NULL
          AND e.model_version = %s
    """, (MODEL_VERSION,))
    stale_bills = cur.fetchall()

    if stale_bills:
        log.info("stale_bills_to_reembed", count=len(stale_bills))
        for i in range(0, len(stale_bills), batch_size):
            chunk = stale_bills[i : i + batch_size]
            batch_num = i // batch_size + 1
            log.info(
                "reembed_batch",
                batch=batch_num,
                first_bill_id=chunk[0][0],
                last_bill_id=chunk[-1][0],
                count=len(chunk),
            )
            try:
                texts = [_build_text(b[1], b[2]) for b in chunk]
                embeddings = embed_texts(model, texts)
                rows = [
                    {
                        "bill_id": b[0],
                        "embedding": emb,
                        "model_version": MODEL_VERSION,
                        "has_summary": True,
                    }
                    for b, emb in zip(chunk, embeddings)
                ]
                upsert("bill_embeddings", rows, on_conflict="bill_id", schema="enrichment")
                total += len(rows)
                log.info("reembedded_batch", count=len(rows), total=total)
            except Exception:
                batch_ids = [b[0] for b in chunk]
                failed_ids.extend(batch_ids)
                log.error("reembed_batch_failed", batch=batch_num, bill_ids=batch_ids)

    # ── Coverage report ──────────────────────────────────────────────────
    cur.execute("SELECT count(*) FROM congress.bills")
    total_bills = cur.fetchall()[0][0]
    cur.execute("SELECT count(*) FROM enrichment.bill_embeddings")
    embedded_count = cur.fetchall()[0][0]

    if total_bills > 0:
        coverage = embedded_count / total_bills * 100
        log.info("embedding_coverage", total_bills=total_bills, embedded=embedded_count, coverage_pct=round(coverage, 1))
        if coverage < 95:
            log.warning("low_embedding_coverage", coverage_pct=round(coverage, 1), threshold=95)

    if failed_ids:
        log.warning("failed_bill_ids", count=len(failed_ids), ids=failed_ids[:20])

    log.info("bill_embeddings_complete", total=total, failed=len(failed_ids))
    return total
