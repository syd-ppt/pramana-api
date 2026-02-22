import { Hono } from 'hono'
import { readChartJson } from '../lib/buffer'
import { welfordMerge } from '../lib/buffer'
import { welchTTest } from '../lib/stats'
import type { ModelDayStats } from '../lib/schemas'

type Env = { Bindings: { PRAMANA_DATA: R2Bucket } }

function makeBadgeSvg(label: string, status: string, color: string): string {
  const labelWidth = label.length * 6.5 + 12
  const statusWidth = status.length * 6.5 + 12
  const totalWidth = labelWidth + statusWidth

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${label}: ${status}">
  <title>${label}: ${status}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#555"/>
    <rect x="${labelWidth}" width="${statusWidth}" height="20" fill="${color}"/>
    <rect width="${totalWidth}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="11">
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + statusWidth / 2}" y="14">${status}</text>
  </g>
</svg>`
}

function poolModelDayStats(statsList: ModelDayStats[]): ModelDayStats {
  let merged: ModelDayStats = { n: 0, mean: 0, m2: 0, count: 0 }
  for (const s of statsList) {
    merged = welfordMerge(merged, s)
  }
  return merged
}

export const badgeRoutes = new Hono<Env>().get('/:model', async (c) => {
  const model = c.req.param('model')
  const chart = await readChartJson(c.env.PRAMANA_DATA)

  if (!chart.models.includes(model)) {
    return c.text('Model not found', 404)
  }

  const dates = Object.keys(chart.data).sort()
  const recentDates = dates.slice(-7)
  const baselineDates = dates.slice(-14, -7)

  const recentList: ModelDayStats[] = []
  const baselineList: ModelDayStats[] = []

  for (const date of recentDates) {
    const s = chart.data[date]?.[model]
    if (s && s.n > 0) recentList.push(s)
  }
  for (const date of baselineDates) {
    const s = chart.data[date]?.[model]
    if (s && s.n > 0) baselineList.push(s)
  }

  const recent = poolModelDayStats(recentList)
  const baseline = poolModelDayStats(baselineList)
  const test = welchTTest(recent, baseline)

  let status: string
  let color: string
  if (test && test.pValue < 0.05 && recent.mean < baseline.mean) {
    status = 'Degraded'
    color = '#e05d44'
  } else if (test && test.pValue < 0.1 && recent.mean < baseline.mean) {
    status = 'Watch'
    color = '#dfb317'
  } else {
    status = 'Stable'
    color = '#4c1'
  }

  const svg = makeBadgeSvg('pramana', status, color)

  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=3600',
  })
})
