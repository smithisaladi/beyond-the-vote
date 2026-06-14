"""Query-time text embedding via an external inference endpoint.

The bill corpus is pre-embedded by the pipeline with sentence-transformers
`all-MiniLM-L6-v2` (384-dim). To keep the API memory footprint small (no torch
in-process), query embeddings are fetched from a hosted endpoint serving the
same model, so vectors stay directionally compatible for cosine search.

This is best-effort: any misconfiguration, network error, or unexpected
response shape raises, and callers fall back to non-semantic search.
"""
import httpx
import structlog

from app.config import settings

log = structlog.get_logger()

EXPECTED_DIM = 384


def embeddings_enabled() -> bool:
    """True when an external embedding endpoint + token are configured."""
    return bool(settings.embedding_api_url and settings.embedding_api_token)


def _extract_vector(data) -> list[float]:
    """Pull a 384-dim float vector out of the endpoint's JSON response.

    Handles the two shapes feature-extraction endpoints return for a single
    input: a flat ``[384 floats]`` or a batch-of-one ``[[384 floats]]``.
    """
    if isinstance(data, list) and len(data) == EXPECTED_DIM and isinstance(data[0], (int, float)):
        return [float(x) for x in data]
    if (
        isinstance(data, list)
        and len(data) == 1
        and isinstance(data[0], list)
        and len(data[0]) == EXPECTED_DIM
    ):
        return [float(x) for x in data[0]]
    raise ValueError(f"unexpected embedding response shape (type={type(data).__name__})")


async def embed_query(text: str) -> list[float]:
    """Return a 384-dim embedding for `text` from the external endpoint."""
    if not embeddings_enabled():
        raise RuntimeError("Embedding endpoint not configured")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            settings.embedding_api_url,
            headers={"Authorization": f"Bearer {settings.embedding_api_token}"},
            json={"inputs": text, "options": {"wait_for_model": True}},
        )
    resp.raise_for_status()
    return _extract_vector(resp.json())
