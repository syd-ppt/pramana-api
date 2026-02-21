/**
 * Cloudflare Pages _worker.js entry point.
 * Advanced mode: worker handles all requests.
 * Non-API routes are served from the static asset binding.
 */
import { Hono } from 'hono'
import { statusRoutes } from './server/routes/status'
import { submitRoutes } from './server/routes/submit'
import { dataRoutes } from './server/routes/data'
import { userRoutes } from './server/routes/user'
import { adminRoutes } from './server/routes/admin'
import { authRoutes } from './server/routes/auth'

type Env = {
  Bindings: {
    ASSETS: { fetch: typeof fetch }
    PRAMANA_DATA: R2Bucket
    JWT_SECRET: string
    GITHUB_ID: string
    GITHUB_SECRET: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
    CRON_SECRET: string
  }
}

const api = new Hono<Env>().basePath('/api')

api.route('/', statusRoutes)
api.route('/submit', submitRoutes)
api.route('/data', dataRoutes)
api.route('/user', userRoutes)
api.route('/admin', adminRoutes)
api.route('/auth', authRoutes)

const app = new Hono<Env>()

// API routes
app.route('/', api)

// Static assets + SPA fallback
app.all('*', async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw)
  if (res.status !== 404) return res
  // SPA fallback: serve index.html for client-side routing
  return c.env.ASSETS.fetch(new Request(new URL('/', c.req.url), c.req.raw))
})

export default {
  fetch: app.fetch,
}
