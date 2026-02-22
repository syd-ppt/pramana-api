/**
 * Generate deterministic mock data for local dashboard development.
 * Writes scripts/fixtures/chart-data.json and scripts/fixtures/user-stats.json.
 *
 * Usage: npx tsx scripts/generate-mock-data.ts
 */
import * as fs from 'fs'
import * as path from 'path'

// Seeded PRNG (mulberry32)
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(42)

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// --- Model consistency generators ---

/** Stable high consistency */
function gpt4oConsistency(_day: number): number {
  return clamp(0.95 + rand() * 0.05, 0.95, 1.0)
}

/** Sudden break ~day 35, partial recovery */
function claudeConsistency(day: number): number {
  if (day < 33) return clamp(0.95 + rand() * 0.05, 0.93, 1.0)
  if (day < 40) return clamp(0.70 + rand() * 0.10, 0.68, 0.82)
  // partial recovery
  const recovery = Math.min((day - 40) * 0.008, 0.12)
  return clamp(0.80 + recovery + rand() * 0.05, 0.78, 0.95)
}

/** Gradual degradation */
function geminiConsistency(day: number): number {
  const base = 0.97 - (day / 60) * 0.22
  return clamp(base + (rand() - 0.5) * 0.04, 0.75, 0.97)
}

/** Erratic oscillation */
function llamaConsistency(day: number): number {
  const wave = Math.sin(day * 0.4) * 0.07
  return clamp(0.875 + wave + (rand() - 0.5) * 0.05, 0.80, 0.95)
}

const MODELS = [
  { name: 'gpt-4o', consistency: gpt4oConsistency },
  { name: 'claude-3.5-sonnet', consistency: claudeConsistency },
  { name: 'gemini-2.0-flash', consistency: geminiConsistency },
  { name: 'llama-3.1-70b', consistency: llamaConsistency },
]

// --- Generate chart data ---

interface ChartDataPoint {
  date: string
  [key: string]: string | number
}

const startDate = new Date('2026-01-01')
const data: ChartDataPoint[] = []

for (let day = 0; day < 60; day++) {
  const date = new Date(startDate)
  date.setDate(date.getDate() + day)
  const dateStr = date.toISOString().split('T')[0]

  const point: ChartDataPoint = { date: dateStr }

  for (const model of MODELS) {
    const subs = randInt(20, 80)
    const prompts = randInt(40, 160)
    const consistency = model.consistency(day)
    const drifted = prompts - Math.round(prompts * consistency)

    point[model.name] = subs
    point[`${model.name}_prompts`] = prompts
    point[`${model.name}_drifted`] = drifted
    point[`${model.name}_consistency`] = parseFloat(consistency.toFixed(4))
  }

  data.push(point)
}

let totalSubs = 0
for (const point of data) {
  for (const model of MODELS) {
    totalSubs += (point[model.name] as number) || 0
  }
}

const chartData = {
  data,
  models: MODELS.map((m) => m.name),
  total_submissions: totalSubs,
  total_contributors: 47,
}

// --- Generate user stats ---

const userModels = ['gpt-4o', 'claude-3.5-sonnet', 'gemini-2.0-flash']
const userStats = {
  user_id: 'dev-user-mock-id',
  total_submissions: 312,
  models_tested: userModels,
  models_count: userModels.length,
  model_submissions: {
    'gpt-4o': 156,
    'claude-3.5-sonnet': 98,
    'gemini-2.0-flash': 58,
  },
  last_submission: '2026-02-21T18:45:00Z',
}

// --- Generate user summary ---

const userSummary = {
  version: 3,
  submissions_by_date: {
    '2026-02-20': { 'gpt-4o': 12, 'claude-3.5-sonnet': 8, 'gemini-2.0-flash': 4 },
    '2026-02-21': { 'gpt-4o': 15, 'claude-3.5-sonnet': 6, 'gemini-2.0-flash': 3 },
  },
  model_submissions: userStats.model_submissions,
  total_submissions: userStats.total_submissions,
}

// --- Write files ---

const fixturesDir = path.join(import.meta.dirname!, 'fixtures')
fs.mkdirSync(fixturesDir, { recursive: true })

fs.writeFileSync(path.join(fixturesDir, 'chart-data.json'), JSON.stringify(chartData, null, 2))
fs.writeFileSync(path.join(fixturesDir, 'user-stats.json'), JSON.stringify(userStats, null, 2))
fs.writeFileSync(path.join(fixturesDir, 'user-summary.json'), JSON.stringify(userSummary, null, 2))

console.log(`Wrote ${data.length} data points, ${MODELS.length} models`)
console.log(`  fixtures/chart-data.json (${totalSubs} total submissions)`)
console.log(`  fixtures/user-stats.json (${userStats.total_submissions} user submissions)`)
console.log(`  fixtures/user-summary.json`)
