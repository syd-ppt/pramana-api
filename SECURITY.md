# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainers or use GitHub's private vulnerability reporting feature
3. Include steps to reproduce, impact assessment, and suggested fix if possible

We will acknowledge receipt within 48 hours and provide a timeline for resolution.

## Supported Versions

Only the latest version on `main` is actively maintained.

## Security Measures

- HTTPS enforced via Vercel
- JWT-based authentication (NextAuth.js)
- OAuth providers (GitHub, Google) — no password storage
- Rate limiting (60 req/min per IP)
- CORS restricted to deployment domain
- Storage bucket is private; all reads go through server-side API
- User-partitioned storage paths
- GDPR-compliant deletion endpoint
