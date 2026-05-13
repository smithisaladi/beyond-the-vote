# Security & Auth Questions

Deep-dive on authentication, authorization, data protection, and security considerations for a political transparency platform.

---

## Q1: Walk through the JWT validation flow. What attack vectors does it protect against?

**Answer:**

**The flow:**

1. Frontend calls `authClient.getSession()` → returns a JWT signed by Neon Auth
2. JWT includes `sub` (user ID), `exp` (expiry), `kid` (key ID), signed with EdDSA (Ed25519)
3. Frontend sends `Authorization: Bearer <token>` with every API request
4. FastAPI extracts the token:
   ```python
   token = authorization.split(" ", 1)[1]
   ```
5. Fetches JWKS from `{neon_auth_url}/.well-known/jwks.json` (cached 1 hour)
6. Matches the token's `kid` to a key in JWKS
7. Verifies signature with the matched Ed25519 public key
8. Checks `exp` claim for expiry
9. Extracts `sub` as user ID

**Attack vectors addressed:**

| Attack | Protection |
|--------|------------|
| **Token forgery** | EdDSA signature verification — can't forge without private key |
| **Token replay (expired)** | `exp` claim checked by PyJWT |
| **Key compromise** | JWKS rotation — Neon can rotate keys, API picks up new keys within 1 hour (cache TTL) |
| **Algorithm confusion** | Explicit `algorithms=["EdDSA", "RS256", "ES256"]` — rejects `none` algorithm |
| **MITM on JWKS** | JWKS endpoint is HTTPS with TLS |

**What's NOT protected:**
- **Token theft (XSS):** If an attacker gets the JWT via XSS, they can use it until it expires. Mitigation: short token lifetime + HTTP-only session cookies (not currently implemented — tokens are in JS memory).
- **CSRF:** Not applicable — Bearer tokens in headers aren't sent automatically by browsers (unlike cookies).

---

## Q2: How do you prevent SQL injection in raw SQL queries?

**Answer:**

All raw SQL uses SQLAlchemy's `text()` with parameterized queries:

```python
# SAFE — parameterized
result = await session.execute(
    text("SELECT * FROM congress.bills WHERE bill_id = :bill_id"),
    {"bill_id": bill_id}
)

# The hybrid search also uses parameters
params = {"query": query, "limit": limit, "offset": offset}
result = await session.execute(text(sql), params)
```

**Why this is safe:**
- SQLAlchemy's `text()` sends parameters separately from the query
- The database driver (asyncpg) sends them as protocol-level parameters, not string interpolation
- No user input is ever concatenated into SQL strings

**The one exception — dynamic filter construction:**
```python
# In queries/bills.py
filters = []
if status:
    filters.append("b.status = ANY(:statuses)")
if topics:
    filters.append("b.topics && :topics")
where_clause = " AND ".join(filters) if filters else "TRUE"
```

The filter *names* are hardcoded strings, not user input. Only the *values* come from parameters. The `where_clause` is built from a fixed set of conditions — no user-controlled SQL fragments.

**What could go wrong:**
If someone added `f"WHERE status = '{status}'"` (string interpolation), that would be vulnerable. Code review must catch this pattern. The convention is: every `{variable}` in SQL must be a `:parameter` reference, never an f-string value.

---

## Q3: How does the auth guard work for protected routes? Can someone bypass it?

**Answer:**

**Frontend guard:**
```typescript
// _authenticated.tsx layout
beforeLoad: async () => {
  const session = await authClient.getSession();
  if (!session) throw redirect({ to: "/" });
}
```

Every route under `_authenticated/` runs this check before rendering. No session = redirect to landing.

**Backend guard:**
```python
# deps.py
async def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing authorization")
    token = authorization.split(" ", 1)[1]
    payload = await validate_token(token)
    return {"user_id": payload["sub"], "payload": payload}
```

Dashboard endpoints use `Depends(get_current_user)` — no valid JWT = 401.

**Can someone bypass it?**

- **Frontend bypass:** Yes, trivially. The SPA runs in the browser — anyone can modify JavaScript to skip the redirect. This is **by design**. Frontend auth is UX, not security. The data is protected at the API level.
- **API bypass:** No (assuming Neon Auth's signing key isn't compromised). Without a valid JWT signed by the correct Ed25519 private key, the backend returns 401. You can't forge the token.
- **Public endpoints:** Most endpoints use `get_optional_user` — they work without auth. Only dashboard endpoints (follow/track/preferences) require auth because they access user-specific data.

**Defense in depth:** Even if someone bypasses frontend auth, they can only see public data (bills, politicians, donors) — the same data that's publicly available from Congress.gov and FEC.

---

## Q4: How do you handle rate limiting? What about abuse?

**Answer:**

**Current implementation:**
```python
# main.py
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
```

Default: 60 requests per minute per IP. Returns 429 Too Many Requests when exceeded.

**Limitations of the current approach:**
- IP-based limiting can be bypassed with multiple IPs (proxies, VPNs)
- Doesn't differentiate between endpoints (search is more expensive than a bill detail page)
- No per-user limiting (authenticated users get the same limit as anonymous)

**What I'd add for production:**

1. **Tiered rate limits:**
   ```python
   @limiter.limit("10/minute")   # Search is expensive
   @router.get("/api/bills")

   @limiter.limit("60/minute")   # Detail is cheap
   @router.get("/api/bills/{bill_id}")
   ```

2. **Authenticated user limits:** Higher limits for logged-in users, tracked by user ID instead of IP.

3. **AI summary endpoint:** The `POST /api/donors/{cmte_id}/summary` endpoint calls the Anthropic API. It needs aggressive rate limiting (e.g., 5/hour per user) to prevent cost abuse.

4. **Scraping protection:** If someone is systematically scraping all bills/politicians, detect the pattern (sequential IDs, no browser headers) and block.

---

## Q5: What data privacy considerations exist for a political transparency platform?

**Answer:**

**Public data (no privacy concerns):**
- Legislator profiles, votes, sponsored bills — all public record
- PAC contributions and independent expenditures — public via FEC
- Bill text, status, actions — public via Congress.gov

**Sensitive data requiring protection:**

1. **User activity data** (`app.*` schema):
   - Which politicians a user follows → reveals political leanings
   - Which bills a user tracks → reveals policy interests
   - Topic preferences → reveals political orientation
   - This data is protected by JWT auth — only the owning user can access it

2. **Individual contributor data** (FEC individual contributions):
   - Names, employers, addresses of political donors
   - While technically public (FEC mandate), aggregating and making it easily searchable raises ethical concerns
   - **Our approach:** Individual contributions are aggregated locally via DuckDB and never stored in the database. Only aggregated results (top employers, PAC totals) are persisted. No individual donor search feature.

3. **Anomaly detection results** (`anomalies.*` schema):
   - "Suspicious contribution" flags could damage reputations
   - The research endpoints explicitly frame results as "leads for investigation, not evidence"
   - Access could be restricted to authenticated users or specific roles

**What I'd add:**
- Data retention policy for `app.*` (delete inactive user data after N months)
- Audit log for access to anomaly/research endpoints
- GDPR-style data export/deletion for user profiles
- Rate limiting on research endpoints to prevent bulk scraping of anomaly data
