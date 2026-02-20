# Deployment Guide

## Vercel Deployment

This project deploys **both** FastAPI (Python) and Next.js to Vercel as serverless functions.

### Architecture

```
Vercel Deployment
├── FastAPI (Python) - /api/submit, /api/user/*
└── Next.js (TypeScript) - Dashboard + /api/auth/* (OAuth)
```

### Route Configuration

Routes are configured in `vercel.json` to avoid conflicts:

1. `/api/auth/*` → Next.js (NextAuth OAuth handlers)
2. `/api/submit` → FastAPI (CLI submission endpoint)
3. `/api/user/*` → FastAPI (user management)
4. `/*` → Next.js (dashboard pages)

### Environment Variables

Required on Vercel:

**Next.js (OAuth):**
- `NEXTAUTH_URL` - Your Vercel deployment URL
- `NEXTAUTH_SECRET` - Generate with `openssl rand -base64 32`
- `GITHUB_ID`, `GITHUB_SECRET` - GitHub OAuth app
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` - Google OAuth

**FastAPI (Backend):**
- `R2_ENDPOINT_URL` - R2 S3-compatible endpoint
- `R2_ACCESS_KEY_ID` - R2 API token access key
- `R2_SECRET_ACCESS_KEY` - R2 API token secret
- `R2_BUCKET_NAME` - Storage bucket name

### Deployment Process

1. Push to `main` branch → Vercel auto-deploys
2. Builds both Python and Next.js
3. Creates serverless functions for each
4. Routes configured per `vercel.json`

### Local Development

**FastAPI backend:**
```bash
uvicorn backend.main:app --reload
```

**Next.js dashboard:**
```bash
cd app && npm run dev
```

### Troubleshooting

**Python runtime errors:** Check that `backend/main.py` exports `handler = app` for Vercel compatibility.

**OAuth errors:** Ensure `NEXTAUTH_URL` matches your Vercel domain and OAuth callback URLs are configured correctly in GitHub/Google apps.

**Route conflicts:** Next.js `/api/auth/*` must be routed before FastAPI catch-all patterns.
