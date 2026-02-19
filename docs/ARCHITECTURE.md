# Pramana Architecture

**Zero-cost crowdsourced LLM drift detection platform**

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Machine                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  $ uvx pramana run --tier cheap --model gpt-4o                  │
│                                                                 │
│  ┌──────────────┐                                               │
│  │ CLI Library  │  (Python package)                             │
│  │              │  - Runs tests locally                         │
│  │  - OpenAI    │  - Uses user's API keys                       │
│  │  - Anthropic │  - Generates results.json                     │
│  │  - Google    │                                               │
│  └──────┬───────┘                                               │
│         │                                                       │
│         │ POST /api/submit  (JWT Bearer token, optional)        │
│         │                                                       │
└─────────┼───────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│              your-app.vercel.app  (Next.js)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ next.config.js rewrites                    FREE        │    │
│  │                                                        │    │
│  │  /api/submit      → your-api.vercel.app        │    │
│  │  /api/health      → your-api.vercel.app        │    │
│  │  /api/user/*      → your-api.vercel.app        │    │
│  │  /api/data/*      → your-api.vercel.app        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ Dashboard (React / Recharts)               FREE        │    │
│  │                                                        │    │
│  │  - Fetches /api/data/chart (JSON)                      │    │
│  │  - Statistical drift detection (client-side)           │    │
│  │  - NextAuth.js OAuth (GitHub, Google)                  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │  proxy
          ▼
┌─────────────────────────────────────────────────────────────────┐
│          your-api.vercel.app  (FastAPI)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  POST /api/submit      - Validate, hash, write to B2           │
│  GET  /api/data/chart  - Read B2 parquet, aggregate, return JSON│
│  GET  /api/health      - B2 connectivity check                 │
│  DELETE /api/user/me   - GDPR: delete or anonymize user data   │
│  GET  /api/user/me/stats - Per-user submission stats           │
│                                                                 │
│  - JWT validation (NEXTAUTH_SECRET, HS256)                     │
│  - Rate limiting: 60 req/min per IP                            │
│  - B2 access via b2sdk (server-side, credentials only)         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
          │  b2sdk (private)
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Backblaze B2 Storage  (allPrivate)             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Parquet Files (ZSTD level 9)                 $0.03/month      │
│                                                                 │
│  year=2025/month=02/day=17/user=abc123def456/                   │
│  ├─ pramana_20250217_120000_a1b2c3d4.parquet                   │
│  └─ pramana_20250217_120030_e5f6g7h8.parquet                   │
│                                                                 │
│  year=2025/month=02/day=17/user=anonymous/                      │
│  └─ pramana_20250217_120100_i9j0k1l2.parquet                   │
│                                                                 │
│  - allPrivate bucket (no public read)                           │
│  - All reads via b2sdk server-side credentials                  │
│  - CORS configured for your-app.vercel.app                  │
│    (pre-signed URL support reserved for future use)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deployment: Two Vercel Projects, One GitHub Repo

| Project | URL | Framework | Visibility |
|---------|-----|-----------|------------|
| `your-app` | `your-app.vercel.app` | Next.js | Public |
| `your-app-api` | `your-api.vercel.app` | FastAPI (Python) | Internal |

Both projects deploy from the same GitHub repository. Vercel auto-detects the framework per project root configuration.

---

## Component Breakdown

### 1. Public CLI Library

**Repository:** `https://github.com/your-org/pramana`
**Installation:** `uvx pramana` or `pip install pramana`

**User flow:**
1. `export OPENAI_API_KEY=sk-...`
2. `uvx pramana run --tier cheap --model gpt-4o`
3. `uvx pramana submit results.json`  ← POSTs to `your-app.vercel.app/api/submit`

Submissions are proxied by Next.js rewrites to the FastAPI backend.

---

### 2. FastAPI Backend (`api/`)

**Deployment:** `your-app-api` Vercel project
**URL:** `your-api.vercel.app`

**Files:**

| File | Purpose |
|------|---------|
| `api/main.py` | FastAPI app, CORS, rate limit middleware |
| `api/routes/submit.py` | POST /api/submit, JWT validation, Parquet write |
| `api/routes/data.py` | GET /api/data/chart, B2 read, aggregation |
| `api/routes/user.py` | DELETE /api/user/me, GET /api/user/me/stats |
| `api/storage/b2_client.py` | b2sdk wrapper, upload/delete/repartition |
| `api/models/schemas.py` | Pydantic request/response models |

**Endpoints:**

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/submit` | Optional JWT | Write single result to B2 |
| POST | `/api/submit/batch` | Optional JWT | Write multiple results |
| GET | `/api/data/chart` | None | Aggregated chart data (JSON) |
| GET | `/api/health` | None | B2 connectivity check |
| DELETE | `/api/user/me` | Required JWT | Delete or anonymize user data |
| GET | `/api/user/me/stats` | Required JWT | Per-user submission stats |

**Submit flow:**
```python
# api/routes/submit.py
user_id = validate_token(authorization)  # None if anonymous
output_hash = sha256(f"{model_id}|{prompt_id}|{output}")
key = f"year={y}/month={m:02d}/day={d:02d}/user={user_id}/{filename}"
await b2_client.upload_file(key, parquet_bytes)
```

**Data query flow (server-side PyArrow, no DuckDB-WASM):**
```python
# api/routes/data.py
# 1. Enumerate date prefixes in range → list matching .parquet files
# 2. Download files in parallel (ThreadPoolExecutor, max_workers=16)
# 3. pq.read_table(buf) → aggregate counts per (date, model_id)
# 4. Return {"data": [...], "models": [...], "total_submissions": N}
```

---

### 3. Next.js Dashboard (`app/`)

**Deployment:** `your-app` Vercel project
**URL:** `your-app.vercel.app`

**Files:**

| File | Purpose |
|------|---------|
| `app/page.tsx` | Main dashboard, fetches `/api/data/chart` |
| `app/layout.tsx` | Root layout, SessionProvider |
| `app/auth/signin/page.tsx` | OAuth sign-in page |
| `app/cli-token/page.tsx` | Generate JWT for CLI use |
| `app/my-stats/page.tsx` | Per-user stats page |
| `app/api/auth/[...nextauth]/route.ts` | NextAuth.js handler |
| `lib/auth.ts` | NextAuth options (GitHub + Google providers) |
| `lib/statistics.ts` | Client-side drift detection (Mann-Whitney U) |
| ~~`lib/duckdb.ts`~~ | DuckDB-WASM (moved to `.private/`, unused) |
| `next.config.js` | API proxy rewrites |

**Data loading (no DuckDB-WASM):**
```typescript
// app/page.tsx
const res = await fetch(`/api/data/chart?start_date=...&end_date=...`);
const json = await res.json();
// json = { data: [{date, model_id: count}], models: [...], total_submissions: N }
```

**Proxy rewrites (`next.config.js`):**
```javascript
const apiUrl = process.env.NEXT_PUBLIC_API_URL; // required
rewrites: [
  { source: '/api/submit',    destination: `${apiUrl}/api/submit` },
  { source: '/api/health',    destination: `${apiUrl}/api/health` },
  { source: '/api/user/:path*', destination: `${apiUrl}/api/user/:path*` },
  { source: '/api/data/:path*', destination: `${apiUrl}/api/data/:path*` },
]
```

---

### 4. Authentication (`lib/auth.ts`)

NextAuth.js with GitHub and Google OAuth. JWT sessions — no database.

**`user_id` derivation:**
```typescript
// lib/auth.ts
const userId = sha256(`${provider}:${providerAccountId}`).substring(0, 16)
token.userId = userId
```

- Deterministic: same OAuth identity always produces same `user_id`
- 16-char hex string stored in JWT and in B2 partition path
- `user_id` propagated to FastAPI via `Authorization: Bearer <jwt>` header
- FastAPI validates with `NEXTAUTH_SECRET` (shared env var, HS256)

**Environment variables (Next.js project):**

| Var | Purpose |
|-----|---------|
| `NEXTAUTH_SECRET` | JWT signing secret (shared with FastAPI) |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` |
| `GITHUB_ID` / `GITHUB_SECRET` | GitHub OAuth app credentials |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `NEXT_PUBLIC_API_URL` | FastAPI base URL (required) |

---

### 5. Storage (Backblaze B2)

**Bucket visibility:** `allPrivate` — no public read, all access via b2sdk server-side
**Cost:** ~$0.005/GB/month

**Partition structure:**
```
{bucket}/
└── year=YYYY/
    └── month=MM/
        └── day=DD/
            └── user={user_id | anonymous}/
                └── pramana_{ts}_{uuid8}.parquet
```

**Parquet schema:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | string | UUID v4 |
| `timestamp` | timestamp[us] | UTC |
| `user_id` | string | 16-char hex or "anonymous" |
| `model_id` | string | e.g. "gpt-4o" |
| `prompt_id` | string | Test suite prompt ID |
| `output` | string | Raw LLM output |
| `output_hash` | string | `sha256:{hex}` |
| `metadata_json` | string | JSON blob |
| `year` | int32 | Partition key |
| `month` | int32 | Partition key |
| `day` | int32 | Partition key |

**Compression:** ZSTD level 9 (~90% size reduction vs raw text)

**CORS:** Configured for `your-app.vercel.app`. Bucket stays private; CORS is reserved for future pre-signed URL support. Current data access is exclusively server-side via b2sdk.

**Environment variables (FastAPI project):**

| Var | Purpose |
|-----|---------|
| `B2_APPLICATION_KEY_ID` or `B2_KEY_ID` | B2 key ID |
| `B2_APPLICATION_KEY` | B2 application key |
| `B2_BUCKET_NAME` | Bucket name (required) |
| `NEXTAUTH_SECRET` | JWT validation (shared with Next.js) |
| `CORS_ORIGINS` | Comma-separated allowed origins |

---

## Data Flow

### Submission Path

```
1. CLI runs tests locally
   └─> uvx pramana run --tier cheap --model gpt-4o

2. CLI POSTs to your-app.vercel.app/api/submit
   └─> Authorization: Bearer <nextauth_jwt>  (optional)

3. Next.js proxy rewrites to your-api.vercel.app/api/submit

4. FastAPI validates JWT, extracts user_id (or "anonymous")

5. Computes sha256(model_id|prompt_id|output)

6. Writes Parquet to B2:
   └─> year=YYYY/month=MM/day=DD/user={user_id}/pramana_{ts}_{uuid8}.parquet

7. Returns {status: "accepted", id: "uuid", hash: "sha256:..."}
```

### Dashboard Query Path

```
1. Browser loads your-app.vercel.app

2. React fetches /api/data/chart?start_date=...&end_date=...

3. Next.js proxy rewrites to your-api.vercel.app/api/data/chart

4. FastAPI lists B2 files for each date in range (by prefix)

5. Downloads matching .parquet files in parallel (PyArrow, ThreadPoolExecutor)

6. Aggregates: count per (date, model_id)

7. Returns JSON: {data: [{date, model_id: count}], models: [...], total_submissions: N}

8. Browser runs Mann-Whitney U drift detection (client-side, lib/statistics.ts)

9. Renders Recharts line chart with StatisticalBadge overlays
```

### GDPR Data Deletion

```
DELETE /api/user/me
  ?anonymize_only=false → delete all files under user={user_id}/
  ?anonymize_only=true  → move files from user={user_id}/ to user=anonymous/
```

---

## Cost Analysis

### Monthly Costs (100K submissions)

| Component | Usage | Cost |
|-----------|-------|------|
| **Vercel (your-app)** | Next.js, bandwidth | **$0.00** |
| **Vercel (your-app-api)** | 100K invocations @ ~200ms | **$0.00** |
| **Backblaze B2 storage** | 5GB @ $0.005/GB | **$0.025** |
| **B2 transactions** | 100K writes @ $0.004/10K | **$0.04** |
| **B2 downloads** | Covered by 3x free egress | **$0.00** |
| **Total** | | **~$0.07/month** |

### Comparison

| Service | Monthly Cost |
|---------|--------------|
| **Pramana (Vercel + B2)** | **$0.07** |
| Railway + B2 | $5.03 |
| AWS Lambda + S3 | ~$15 |
| LangSmith | $39 |
| Weights & Biases | $50 |
| AWS Full Stack | $100+ |

---

## Scaling Limits

### Vercel Free Tier

| Limit | Value |
|-------|-------|
| Function invocations | 100K/month |
| Bandwidth | 100GB/month |
| Function duration | 10s max |
| Build minutes | 6,000/month |

**Vercel Pro ($20/month) needed when:** >100K submissions/month, >100GB bandwidth, or functions exceed 10s (large date-range queries).

---

## Security Model

### Authentication

- NextAuth.js OAuth: GitHub and Google providers
- JWT sessions (no database): `NEXTAUTH_SECRET` shared between Next.js and FastAPI
- `user_id` = `sha256(provider:providerAccountId)[:16]` — deterministic, no PII stored
- CLI submissions: JWT obtained from `your-app.vercel.app/cli-token`, passed as `Authorization: Bearer <token>`
- Anonymous submissions accepted without a token; stored under `user=anonymous/`

### Rate Limiting

- 60 requests/minute per IP (`RateLimitMiddleware` in `api/main.py`)
- Returns HTTP 429

### CORS

- FastAPI: controlled via `CORS_ORIGINS` env var
- B2 bucket: CORS rule for `your-app.vercel.app` (future pre-signed URL support)
- Bucket itself: `allPrivate` — direct browser access not possible

### Data Privacy

- No email or name stored in B2; only `user_id` (opaque hash)
- GDPR deletion: `DELETE /api/user/me` removes or anonymizes all user partitions
- `output_hash` enables deduplication without storing content twice

---

## Monitoring

### Vercel Metrics (both projects)

- Function invocations, error rates, P50/P95/P99 latency, bandwidth

### B2 Health Check

```
GET your-app.vercel.app/api/health
→ proxied to your-api.vercel.app/api/health
→ returns B2 credential status and connection test result
```

### Alerts (configure in Vercel dashboard)

- Error rate > 5%
- Function duration > 8s
- Bandwidth > 90GB/month

---

## Future Enhancements

- [ ] Pre-signed B2 URLs for direct browser Parquet access (CORS already configured)
- [ ] Client-side DuckDB-WASM analytics
- [ ] Automated daily runs (GitHub Actions)
- [ ] Email alerts for drift detection
- [ ] LLM judge assertions
- [ ] Custom assertion plugins

---

## References

- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Backblaze B2](https://www.backblaze.com/b2/docs/)
- [NextAuth.js](https://next-auth.js.org/)
- [Apache Parquet](https://parquet.apache.org/)
- [PyArrow](https://arrow.apache.org/docs/python/)
- [OpenAI Evals](https://github.com/openai/evals)
