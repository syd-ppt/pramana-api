/**
 * Local dev server: Hono API + static SPA on Node.js.
 * Bypasses esbuild WSL path bug by running pure Node.js.
 * Usage: npx tsx scripts/dev-server.ts
 */
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { statusRoutes } from '../server/routes/status'
import { submitRoutes } from '../server/routes/submit'
import { dataRoutes } from '../server/routes/data'
import { userRoutes } from '../server/routes/user'
import { adminRoutes } from '../server/routes/admin'
import { authRoutes } from '../server/routes/auth'
import * as fs from 'fs'

type Env = {
  Bindings: {
    PRAMANA_DATA: R2Bucket
    JWT_SECRET: string
    GITHUB_ID: string
    GITHUB_SECRET: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    CRON_SECRET: string
  }
}

// Load env from .env files
function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const file of ['.env', '.env.local', '.env.example']) {
    try {
      const content = fs.readFileSync(file, 'utf-8')
      for (const line of content.split('\n')) {
        const match = line.match(/^([A-Z_]+)=["']?(.+?)["']?$/)
        if (match) env[match[1]] = match[2]
      }
    } catch { /* skip missing files */ }
  }
  return env
}

const envVars = loadEnv()

const app = new Hono<Env>()

// Inject env bindings for all API routes
app.use('/api/*', async (c, next) => {
  const bindings = c.env as Record<string, string>
  bindings.JWT_SECRET = process.env.JWT_SECRET || envVars.JWT_SECRET || 'dev-secret-at-least-32-characters-long'
  bindings.GITHUB_ID = process.env.GITHUB_ID || envVars.GITHUB_ID || ''
  bindings.GITHUB_SECRET = process.env.GITHUB_SECRET || envVars.GITHUB_SECRET || ''
  bindings.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || envVars.GOOGLE_CLIENT_ID || ''
  bindings.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || envVars.GOOGLE_CLIENT_SECRET || ''
  bindings.CRON_SECRET = process.env.CRON_SECRET || envVars.CRON_SECRET || ''
  await next()
})

// API routes — must be registered BEFORE static file serving
app.route('/api', statusRoutes)
app.route('/api/submit', submitRoutes)
app.route('/api/data', dataRoutes)
app.route('/api/user', userRoutes)
app.route('/api/admin', adminRoutes)
app.route('/api/auth', authRoutes)

// Static files from dist/
app.use('/*', serveStatic({ root: './dist' }))

// SPA fallback — only for non-API routes
app.get('/*', (c) => {
  if (c.req.path.startsWith('/api')) {
    return c.json({ error: 'Not found' }, 404)
  }
  return serveStatic({ root: './dist', path: 'index.html' })(c, async () => {})
})

const port = Number(process.env.PORT || 8788)
console.log(`Local dev server: http://localhost:${port}`)
console.log('Note: R2 storage not available locally (submit/data endpoints will error)')
console.log('Press Ctrl+C to stop')

serve({ fetch: app.fetch, port })
