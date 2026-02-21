import { Hono } from 'hono'
import { compactBuffer } from '../lib/buffer'

type Env = { Bindings: { PRAMANA_DATA: R2Bucket; CRON_SECRET: string } }

export const adminRoutes = new Hono<Env>().post('/compact', async (c) => {
  const authHeader = c.req.header('Authorization')
  const expected = c.env.CRON_SECRET

  if (!expected) {
    return c.json({ error: 'CRON_SECRET not configured' }, 500)
  }

  if (authHeader !== `Bearer ${expected}`) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const result = await compactBuffer(c.env.PRAMANA_DATA)
  return c.json({ status: 'completed', ...result })
})
