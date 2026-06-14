"""CORS middleware ordering regression tests.

CORS must be the outermost middleware so that rate-limit (429) and error
responses still carry Access-Control-Allow-Origin. Otherwise the browser
reports them as CORS failures instead of the real status.
"""
from app.main import app

ALLOWED_ORIGIN = "http://localhost:5173"


def test_cors_is_outermost_middleware():
    # user_middleware is ordered outermost-first.
    names = [mw.cls.__name__ for mw in app.user_middleware]
    assert names[0] == "CORSMiddleware", f"CORS must be outermost, got {names}"


async def test_cors_header_present_on_error_response(client):
    """A 422 (validation error) still carries the CORS header because CORS
    wraps the routing/exception layers — same property that covers 429s."""
    resp = await client.get(
        "/api/bills",
        params={"sort": "not-a-valid-sort"},  # triggers 422
        headers={"Origin": ALLOWED_ORIGIN},
    )
    assert resp.status_code == 422
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


async def test_cors_preflight_allowed(client):
    resp = await client.options(
        "/api/dashboard/tracked-bills",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
