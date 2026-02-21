import { Hono } from 'hono'

type Env = { Bindings: { PRAMANA_DATA: R2Bucket } }

export const statusRoutes = new Hono<Env>()
  .get('/', (c) =>
    c.json({ status: 'ok', service: 'pramana-api', version: '0.3.0' })
  )
  .get('/health', (c) =>
    c.json({ status: 'healthy', storage_configured: !!c.env.PRAMANA_DATA })
  )
