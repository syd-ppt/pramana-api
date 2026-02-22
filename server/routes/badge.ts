import { Hono } from 'hono'
import { readChartJson } from '../lib/buffer'
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

export const badgeRoutes = new Hono<Env>().get('/:model', async (c) => {
  const model = c.req.param('model')
  const chart = await readChartJson(c.env.PRAMANA_DATA)

  if (!chart.models.includes(model)) {
    return c.text('Model not found', 404)
  }

  // Compute consistency over last 7 days
  const dates = Object.keys(chart.data).sort()
  const recentDates = dates.slice(-7)

  let totalPrompts = 0
  let totalDrifted = 0

  for (const date of recentDates) {
    const s = chart.data[date]?.[model]
    if (s) {
      totalPrompts += s.prompts_tested
      totalDrifted += s.drifted_prompts
    }
  }

  const consistency = totalPrompts > 0
    ? (totalPrompts - totalDrifted) / totalPrompts
    : 1.0

  let status: string
  let color: string
  if (consistency >= 0.95) {
    status = `${(consistency * 100).toFixed(0)}% consistent`
    color = '#4c1'
  } else if (consistency >= 0.80) {
    status = `${(consistency * 100).toFixed(0)}% consistent`
    color = '#dfb317'
  } else {
    status = `${(consistency * 100).toFixed(0)}% drifting`
    color = '#e05d44'
  }

  const svg = makeBadgeSvg('pramana', status, color)

  return c.body(svg, 200, {
    'Content-Type': 'image/svg+xml',
    'Cache-Control': 'public, max-age=3600',
  })
})
