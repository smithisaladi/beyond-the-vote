# Authentication Flow

Authentication uses Neon Auth (built on Better Auth) with JWT tokens signed using EdDSA (Ed25519). The frontend obtains tokens via Neon Auth's client SDK, and the backend validates them against Neon's JWKS endpoint.

## Architecture

```
┌─────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│ Browser  │────>│ Neon Auth  │────>│ Session   │────>│ JWT      │
│          │     │ Modal      │     │ Created   │     │ Issued   │
│          │     │ (Sign In)  │     │           │     │ (EdDSA)  │
└─────────┘     └───────────┘     └──────────┘     └────┬─────┘
                                                         │
                                                         v
┌─────────┐     ┌───────────┐     ┌──────────┐     ┌──────────┐
│ apiFetch │────>│ FastAPI    │────>│ JWKS     │────>│ Validated│
│ (Bearer) │     │ Middleware │     │ Fetch    │     │ Payload  │
│          │     │            │     │ (cached) │     │          │
└─────────┘     └───────────┘     └──────────┘     └──────────┘
```

## Frontend Auth

### Neon Auth Client

```typescript
// apps/web/src/lib/auth/neon.ts
import { createAuthClient } from "@neondatabase/neon-js/auth";

export const authClient = createAuthClient({
  url: import.meta.env.VITE_NEON_AUTH_URL,
  adapter: BetterAuthReactAdapter(),
});
```

### Auth Context

```typescript
// apps/web/src/components/auth/AuthContext.tsx
const AuthContext = createContext<{
  user: AuthUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}>();

// On mount: check for existing session
useEffect(() => {
  authClient.getSession().then(session => {
    if (session) setUser(session.user);
    setLoading(false);
  });
}, []);
```

### API Fetch with Token Injection

```typescript
// apps/web/src/lib/api/fetch.ts
export async function apiFetch(path: string, options?: RequestInit) {
  const session = await authClient.getSession();
  const headers = { ...options?.headers };

  if (session?.token) {
    headers["Authorization"] = `Bearer ${session.token}`;
  }

  return fetch(`${VITE_API_URL}${path}`, { ...options, headers });
}
```

Every API request automatically includes the JWT if a session exists. Unauthenticated requests still work for public endpoints.

### Protected Routes

```typescript
// apps/web/src/routes/_authenticated.tsx
export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session) throw redirect({ to: "/" });
  },
});
```

TanStack Router's `beforeLoad` hook checks for a valid session before rendering protected routes. If no session exists, the user is redirected to the landing page.

## Backend Auth

### JWKS Validation

The backend validates JWTs against Neon Auth's JWKS endpoint:

```python
# apps/api/app/auth.py

# JWKS is cached for 1 hour to avoid repeated HTTP calls
_jwks_cache: dict[str, Any] = {}
_jwks_cache_ttl: float = 0
_JWKS_CACHE_DURATION = 3600  # 1 hour

async def _fetch_jwks() -> dict | None:
    """Fetch public keys from Neon Auth JWKS endpoint."""
    jwks_url = f"{settings.neon_auth_url}/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url, timeout=10)
        return resp.json()

async def validate_token(token: str) -> dict:
    """Validate JWT using JWKS public key."""
    jwks = await _fetch_jwks()
    key, alg = _find_signing_key(jwks, token)
    payload = jwt.decode(
        token, key,
        algorithms=[alg, "EdDSA", "RS256", "ES256"],
        options={"verify_aud": False},
    )
    return payload
```

### Key Resolution

1. Decode JWT header (unverified) to extract `kid` (key ID)
2. Find matching key in JWKS by `kid`
3. Construct `PyJWK` from key data
4. Verify signature with the matched algorithm (EdDSA primary)

### FastAPI Dependency Injection

```python
# apps/api/app/deps.py

async def get_current_user(
    authorization: str = Header(None)
) -> dict:
    """Required auth — returns {user_id, payload} or raises 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing authorization")
    token = authorization.split(" ", 1)[1]
    payload = await validate_token(token)
    return {"user_id": payload["sub"], "payload": payload}

async def get_optional_user(
    authorization: str = Header(None)
) -> dict | None:
    """Optional auth — returns user dict or None."""
    try:
        return await get_current_user(authorization)
    except:
        return None
```

**Usage in routers:**
```python
# Protected endpoint
@router.get("/api/dashboard/followed")
async def get_followed(user=Depends(get_current_user), db=Depends(get_db)):
    # user["user_id"] is guaranteed to exist
    ...

# Public endpoint with optional personalization
@router.get("/api/bills")
async def list_bills(user=Depends(get_optional_user), db=Depends(get_db)):
    # user may be None
    ...
```

## Token Lifecycle

```
1. User clicks "Sign In" → Neon Auth modal opens
2. User authenticates (email/password or OAuth)
3. Neon Auth issues JWT signed with EdDSA (Ed25519)
4. JWT stored in browser session by Neon Auth SDK
5. Every API request: apiFetch() reads token, sends as Bearer header
6. FastAPI: extracts token, fetches JWKS (cached 1hr), validates signature
7. On token expiry: Neon Auth SDK handles refresh transparently
8. On sign out: authClient.signOut() clears session
```

## Security Properties

| Property | Implementation |
|----------|---------------|
| **Algorithm** | EdDSA (Ed25519) — modern, fast, secure |
| **Key distribution** | JWKS endpoint — rotatable without code changes |
| **Key caching** | 1-hour TTL — balances freshness vs latency |
| **Audience validation** | Disabled (`verify_aud: False`) — Neon Auth doesn't set `aud` |
| **Expiry validation** | Automatic via PyJWT — expired tokens return 401 |
| **CORS** | Configurable origins in FastAPI middleware |
| **Token transport** | Bearer header only — no cookies (SPA pattern) |

## Why EdDSA Over RS256?

Neon Auth uses EdDSA (Ed25519) by default:
- **Smaller keys**: 32 bytes vs 256+ bytes for RSA
- **Faster verification**: ~10x faster than RS256
- **Smaller signatures**: 64 bytes vs 256 bytes
- **No padding attacks**: Immune to RSA padding oracle attacks

The backend also accepts RS256 and ES256 as fallbacks for compatibility.
