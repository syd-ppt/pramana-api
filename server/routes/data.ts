import { Hono } from 'hono'
import { readChartJson } from '../lib/buffer'

type Env = { Bindings: { PRAMANA_DATA: R2Bucket } }

export const dataRoutes = new Hono<Env>().get('/chart', async (c) => {
  const chart = await readChartJson(c.env.PRAMANA_DATA)

  const data = Object.entries(chart.data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, models]) => ({ date, ...models }))

  return c.json(
    {
      data,
      models: chart.models,
      total_submissions: chart.total_submissions,
    },
    200,
    {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    }
  )
})
