/**
 * Cloudflare Pages Functions catch-all — Hono app.
 * All /api/* requests are routed here.
 */
import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { statusRoutes } from '../../server/routes/status'
import { submitRoutes } from '../../server/routes/submit'
import { dataRoutes } from '../../server/routes/data'
import { userRoutes } from '../../server/routes/user'
import { adminRoutes } from '../../server/routes/admin'
import { authRoutes } from '../../server/routes/auth'

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

const app = new Hono<Env>().basePath('/api')

app.route('/', statusRoutes)
app.route('/submit', submitRoutes)
app.route('/data', dataRoutes)
app.route('/user', userRoutes)
app.route('/admin', adminRoutes)
app.route('/auth', authRoutes)

export const onRequest = handle(app)
