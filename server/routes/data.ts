import { Hono } from 'hono'
import { readChartJson } from '../lib/buffer'
import { normalCI } from '../lib/stats'
import type { ModelDayStats } from '../lib/schemas'

type Env = { Bindings: { PRAMANA_DATA: R2Bucket } }

export const dataRoutes = new Hono<Env>().get('/chart', async (c) => {
  const chart = await readChartJson(c.env.PRAMANA_DATA)

  const data = Object.entries(chart.data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, models]) => {
      const point: Record<string, string | number> = { date }
      for (const [model, stats] of Object.entries(models) as [string, ModelDayStats][]) {
        point[model] = stats.mean
        point[`${model}_n`] = stats.n
        point[`${model}_count`] = stats.count
        point[`${model}_variance`] = stats.n < 2 ? 0 : stats.m2 / (stats.n - 1)
        const ci = normalCI(stats)
        point[`${model}_ci_low`] = ci.lower
        point[`${model}_ci_high`] = ci.upper
      }
      return point
    })

  return c.json(
    {
      data,
      models: chart.models,
      total_submissions: chart.total_submissions,
      total_scored: chart.total_scored,
    },
    200,
    {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    }
  )
})
