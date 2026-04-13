import { Hono } from 'hono'
import { compactBuffer, rebuildChartJsonIncremental } from '../lib/buffer'

type Env = { Bindings: { PRAMANA_DATA: R2Bucket; CRON_SECRET: string } }

function requireCronAuth(c: { req: { header: (name: string) => string | undefined }; env: { CRON_SECRET: string }; json: (body: unknown, status: number) => Response }): Response | null {
  const authHeader = c.req.header('Authorization')
  const expected = c.env.CRON_SECRET
  if (!expected) return c.json({ error: 'CRON_SECRET not configured' }, 500)
  if (authHeader !== `Bearer ${expected}`) return c.json({ error: 'Unauthorized' }, 401)
  return null
}

export const adminRoutes = new Hono<Env>()
  .post('/compact', async (c) => {
    const denied = requireCronAuth(c)
    if (denied) return denied

    try {
      const result = await compactBuffer(c.env.PRAMANA_DATA)
      return c.json({ status: 'completed', ...result })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      return c.json({ status: 'error', error: message, stack }, 500)
    }
  })
  .post('/rebuild', async (c) => {
    const denied = requireCronAuth(c)
    if (denied) return denied

    try {
      const result = await rebuildChartJsonIncremental(c.env.PRAMANA_DATA)
      return c.json({ status: result.done ? 'completed' : 'in_progress', ...result })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const stack = err instanceof Error ? err.stack : undefined
      return c.json({ status: 'error', error: message, stack }, 500)
    }
  })
