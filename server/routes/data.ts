import { Hono } from 'hono'
import { readChartJson } from '../lib/buffer'
import type { ModelDayStats } from '../lib/schemas'

type Env = { Bindings: { PRAMANA_DATA: R2Bucket } }

export const dataRoutes = new Hono<Env>().get('/chart', async (c) => {
  const chart = await readChartJson(c.env.PRAMANA_DATA)

  const data = Object.entries(chart.data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, models]) => {
      const point: Record<string, string | number> = { date }
      for (const [model, stats] of Object.entries(models) as [string, ModelDayStats][]) {
        point[model] = stats.submissions
        point[`${model}_prompts`] = stats.prompts_tested
        point[`${model}_unique_outputs`] = stats.unique_outputs
        point[`${model}_drifted`] = stats.drifted_prompts
        point[`${model}_consistency`] = stats.prompts_tested > 0
          ? (stats.prompts_tested - stats.drifted_prompts) / stats.prompts_tested
          : 1.0
      }
      return point
    })

  return c.json(
    {
      data,
      models: chart.models,
      total_submissions: chart.total_submissions,
      total_contributors: chart.total_contributors,
    },
    200,
    {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    }
  )
})
