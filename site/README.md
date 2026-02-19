# Static Site Dashboard

Zero-cost alternative to Next.js dashboard using GitHub Pages.

## Architecture

```
HTML + Chart.js + DuckDB-WASM (CDN)
└─> Direct fetch from B2 Parquet files
└─> No server, no build, no deployment complexity
```

## Deployment

1. **GitHub Pages:**
   ```bash
   # Push to GitHub
   git add site/
   git commit -m "Add static dashboard"
   git push origin main

   # Enable GitHub Pages
   # Settings → Pages → Source: main branch, /site folder
   ```

2. **Access:**
   ```
   https://yourusername.github.io/pramana/
   ```

## Cost Comparison

| Approach | Monthly Cost | Pros | Cons |
|----------|--------------|------|------|
| **Static Site (GitHub Pages)** | $0 | Zero cost, no vendor lock-in, simple | No SSR, limited compute |
| **Next.js (Vercel)** | $0 (free tier) | Modern DX, SSR | Vendor lock-in, build complexity |
| **Static Site (Netlify)** | $0 | Similar to GitHub Pages | Slightly more complex |

## Features

- ✅ Chart.js for visualization (lighter than Recharts)
- ✅ DuckDB-WASM for browser SQL (same as Next.js version)
- ✅ Date range filtering
- ✅ Multi-model comparison
- ✅ Degradation detection
- ✅ Responsive design
- ✅ CDN-based dependencies (no build step)

## Real Data Integration

Replace `generateMockData()` with:

```javascript
async function loadDataFromB2() {
    // 1. Fetch manifest
    const manifest = await fetch(`${B2_BUCKET_URL}/manifest.json`).then(r => r.json());

    // 2. Filter files by date range
    const files = filterFilesByDate(manifest.files, startDate, endDate);

    // 3. Load into DuckDB-WASM
    const db = await initDuckDB();
    await db.query(`
        CREATE TABLE results AS
        SELECT * FROM read_parquet([${files.map(f => `'${B2_BUCKET_URL}/${f.path}'`).join(',')}])
    `);

    // 4. Run time-series query
    const data = await db.query(`
        SELECT
            DATE_TRUNC('day', timestamp) AS date,
            model_id,
            AVG(CASE WHEN passed THEN 1.0 ELSE 0.0 END) AS pass_rate
        FROM results
        WHERE model_id IN (${selectedModels.map(m => `'${m}'`).join(',')})
        GROUP BY date, model_id
        ORDER BY date
    `);

    return data;
}
```

## Why Static > Next.js

1. **Cost:** $0 forever (GitHub Pages)
2. **Simplicity:** Single HTML file, no build process
3. **Performance:** Direct B2 fetch, no middleware
4. **Reliability:** No server to crash
5. **Ownership:** No vendor lock-in

## Trade-offs

**Static wins:**
- Zero hosting cost
- Simpler deployment
- No server maintenance
- Direct data access

**Next.js wins:**
- Better DX (TypeScript, components)
- SSR for SEO
- API routes (but we don't need them)
- Modern tooling

**Verdict:** For read-only analytics dashboard with B2 storage, static site is superior.
