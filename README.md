# Pramana API

LLM providers silently update their models. The same prompt that worked last month might return different — or worse — results today. **Pramana detects this.**

Users run a standard set of prompts against any model using the [Pramana CLI](https://github.com/syd-ppt/pramana), then submit their results here. This repo aggregates those submissions, applies statistical tests, and displays drift over time on a public dashboard.

**This repo is the server side:** submission API, storage, and dashboard. If you want to *run* evaluations, use the [CLI](https://github.com/syd-ppt/pramana).

---

## Architecture

```
Public CLI (pramana) → Vercel API → R2 Storage → Vercel Dashboard
                          ↓            ↓              ↓
                      Serverless    Parquet      Next.js + PyArrow
                      Functions     (ZSTD)       Aggregation
```

**Components:**
- `backend/` - FastAPI backend (serverless functions)
- `app/` - Next.js dashboard
- `docs/` - Architecture documentation

**Cost: $0/month** (Vercel free tier + R2 $0 egress)

---

## Features

- ✅ **Serverless API** - FastAPI on Vercel (zero cost)
- ✅ **Next.js Dashboard** - Real-time drift visualization
- ✅ **R2 Storage** - Cost-effective Parquet storage with zero egress fees
- ✅ **User Authentication** - GitHub/Google OAuth via NextAuth.js
- ✅ **Personalized Tracking** - "You vs Crowd" statistics
- ✅ **GDPR Compliant** - Full deletion or anonymization options
- ✅ **PyArrow** - Server-side Parquet aggregation

---

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements.txt
cd app && npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your credentials
```

**Required:**
- `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` - R2 storage
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
- `NEXTAUTH_URL` - Your Vercel deployment URL
- `GITHUB_ID`, `GITHUB_SECRET` - GitHub OAuth app
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth client

See the OAuth provider docs for setup instructions.

### 3. Create R2 Bucket

1. Go to **Cloudflare Dashboard** → **R2 Object Storage**
2. Click **Create bucket** → name it `your-bucket-name`
3. Under **Settings → CORS Policy**, add:
   ```json
   [
     {
       "AllowedOrigins": ["https://yourdomain.vercel.app"],
       "AllowedMethods": ["GET"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. Go to **R2 → Manage R2 API Tokens** → **Create API token**
5. Grant **Object Read & Write** permission scoped to your bucket
6. Copy the **Access Key ID**, **Secret Access Key**, and **Endpoint URL**

### 4. Run Locally

**API:**
```bash
uvicorn backend.main:app --reload
# http://localhost:8000
```

**Dashboard:**
```bash
cd app
npm run dev
# http://localhost:3000
```

---

## Deployment to Vercel

### One-Command Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy (from project root)
vercel --prod
```

Vercel will:
- ✅ Deploy API as serverless functions
- ✅ Deploy Next.js dashboard
- ✅ Provide custom domain
- ✅ Enable HTTPS automatically

### Environment Variables

Set in Vercel dashboard or CLI:

```bash
# R2 Storage
vercel env add R2_ENDPOINT_URL
vercel env add R2_ACCESS_KEY_ID
vercel env add R2_SECRET_ACCESS_KEY
vercel env add R2_BUCKET_NAME

# NextAuth (Authentication)
vercel env add NEXTAUTH_URL
vercel env add NEXTAUTH_SECRET
vercel env add GITHUB_ID
vercel env add GITHUB_SECRET
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET

# API Config
vercel env add CORS_ORIGINS
```

**Values:**
- `R2_ENDPOINT_URL`: Your Cloudflare R2 S3-compatible endpoint
- `R2_ACCESS_KEY_ID`: Your R2 API token access key ID
- `R2_SECRET_ACCESS_KEY`: Your R2 API token secret access key
- `R2_BUCKET_NAME`: Your R2 bucket name
- `NEXTAUTH_URL`: Your deployment URL
- `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
- `GITHUB_ID`, `GITHUB_SECRET`: From GitHub OAuth app
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: From Google OAuth client
- `CORS_ORIGINS`: `https://yourdomain.vercel.app` (or your custom domain)

See the OAuth provider docs for app setup.

### Custom Domain

```bash
vercel domains add yourdomain.com
```

Update DNS:
- Add CNAME record: `pramana.yourdomain.com` → `cname.vercel-dns.com`

---

## API Endpoints

### POST /api/submit

Submit evaluation results (anonymous or authenticated).

**Headers (optional):**
```
Authorization: Bearer <jwt_token>
```

**Request:**
```json
{
  "model_id": "gpt-5.2",
  "prompt_id": "reasoning-001",
  "output": "The answer is 42",
  "metadata": {
    "tier": "cheap",
    "temperature": 0.0,
    "seed": 42
  }
}
```

**Response:**
```json
{
  "status": "accepted",
  "id": "uuid-here",
  "hash": "sha256:..."
}
```

**Storage:**
- Anonymous: `year=2024/month=02/day=11/user=anonymous/file.parquet`
- Authenticated: `year=2024/month=02/day=11/user={user_id}/file.parquet`

### DELETE /api/user/me

Delete user data (GDPR compliance). Requires authentication.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Query Params:**
- `anonymize_only=true` - Keep results as anonymous (default: false)

**Response:**
```json
{
  "status": "deleted",  // or "anonymized"
  "user_id": "abc123...",
  "files_deleted": 42,
  "message": "All your data has been permanently deleted"
}
```

### GET /api/user/me/stats

Get personalized statistics. Requires authentication.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "user_id": "abc123...",
  "total_submissions": 150,
  "pass_rate": 0.85,
  "crowd_pass_rate": 0.78
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy"
}
```

---

## Monitoring

**Vercel Dashboard:**
- Logs: https://vercel.com/dashboard
- Analytics: Included in free tier
- Function metrics: Execution time, errors

**R2 Usage:**
Check storage metrics in **Cloudflare Dashboard → R2 → your bucket → Metrics**.

**Costs (monthly):**
- Vercel: **$0** (free tier: 100GB bandwidth, 100k function invocations)
- R2 Storage: **~$0.015/GB** (10GB free)
- R2 Egress: **$0** (zero egress fees)
- R2 Operations: **1M Class B reads free, 10M Class A writes free**

**Total: < $1/month for 10K submissions**

---

## Troubleshooting

**API returns 500:**
- Check environment variables in Vercel dashboard
- Verify R2 credentials are correct
- Check Vercel function logs

**CORS errors:**
- Update `CORS_ORIGINS` env var in Vercel
- Match exact domain (include https://)

**R2 upload fails:**
- Verify bucket name matches `R2_BUCKET_NAME`
- Check R2 API token has write permissions
- Verify `R2_ENDPOINT_URL` is correct
- Ensure bucket is not public-read (use CORS instead)

---

## Security Checklist

- [x] API on HTTPS (Vercel automatic)
- [x] Rate limiting (60 req/min per IP)
- [x] CORS restricted to your domain
- [x] JWT-based authentication (NextAuth.js)
- [x] OAuth providers (GitHub, Google)
- [x] GDPR-compliant data deletion
- [x] User-partitioned object storage
- [ ] Enable R2 bucket encryption
- [ ] Rotate R2 keys regularly
- [ ] Add session timeout policies

---

## Backup & Maintenance

**Backup data:**
```bash
# Download all Parquet files (using AWS CLI with R2 endpoint)
aws s3 sync s3://your-bucket-name ./backup --endpoint-url $R2_ENDPOINT_URL
```

**Clear old data (optional):**
Set R2 lifecycle rules to delete files after 365 days (Cloudflare Dashboard → R2 → bucket → Settings).

---

## Cost Comparison

| Service | Previous (Railway) | New (Vercel) |
|---------|-------------------|--------------|
| API Hosting | $5/month | **$0/month** |
| Dashboard | Vercel free | **$0/month** |
| Storage (R2) | $0.03/month | **$0.00/month** |
| **Total** | **$5/month** | **$0.00/month** |

**167x cost reduction!** 🎉

---

## License

MIT
