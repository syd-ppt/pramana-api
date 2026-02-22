/**
 * /api/user/me/* — per-user endpoints (stats, summary, comparison, GDPR delete).
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { readUserSummary, readChartJson, deleteUserFromBuffer, rebuildChartJson, welfordMerge, welfordVariance } from '../lib/buffer'
import { listFiles, deleteFiles, deleteFile } from '../lib/storage'
import { welchTTest, holmBonferroni, normalCI, poolStats } from '../lib/stats'
import type { ModelDayStats } from '../lib/schemas'

type Env = {
  Bindings: { PRAMANA_DATA: R2Bucket; JWT_SECRET: string }
  Variables: { userId: string }
}

export const userRoutes = new Hono<Env>()
  .use('/me/*', requireAuth)
  .use('/me', requireAuth)
  .delete('/me', async (c) => {
    const userId = c.get('userId')
    const bucket = c.env.PRAMANA_DATA

    // 1. Filter user rows from buffer.csv.gz
    const bufferRowsRemoved = await deleteUserFromBuffer(bucket, userId)

    // 2. Delete per-user summary
    await deleteFile(bucket, `_users/${userId}/summary.json`)

    // 3. Rebuild chart JSON (removes user's contributions)
    await rebuildChartJson(bucket)

    return c.json({
      status: 'deleted',
      user_id: userId,
      buffer_rows_removed: bufferRowsRemoved,
      message: 'All your data has been permanently deleted',
    })
  })
  .get('/me/stats', async (c) => {
    const userId = c.get('userId')
    const summary = await readUserSummary(c.env.PRAMANA_DATA, userId)

    if (!summary) {
      return c.json({
        user_id: userId,
        total_submissions: 0,
        total_scored: 0,
        models_tested: [],
        models_count: 0,
        model_stats: {},
        last_submission: null,
      })
    }

    const modelsSet = new Set<string>()
    let lastDate: string | null = null

    for (const [date, models] of Object.entries(summary.date_stats)) {
      for (const model of Object.keys(models)) {
        modelsSet.add(model)
      }
      if (!lastDate || date > lastDate) lastDate = date
    }

    // Serialize model_stats with computed variance
    const modelStatsOut: Record<string, { n: number; mean: number; variance: number; count: number }> = {}
    for (const [model, stats] of Object.entries(summary.model_stats)) {
      modelStatsOut[model] = {
        n: stats.n,
        mean: stats.mean,
        variance: welfordVariance(stats),
        count: stats.count,
      }
    }

    return c.json({
      user_id: userId,
      total_submissions: summary.total_submissions,
      total_scored: summary.total_scored,
      models_tested: Array.from(modelsSet).sort(),
      models_count: modelsSet.size,
      model_stats: modelStatsOut,
      last_submission: lastDate,
    })
  })
  .get('/me/summary', async (c) => {
    const userId = c.get('userId')
    const summary = await readUserSummary(c.env.PRAMANA_DATA, userId)

    if (!summary) {
      return c.json({ version: 2, date_stats: {}, model_stats: {}, total_submissions: 0, total_scored: 0 })
    }

    return c.json(summary)
  })
  .get('/me/comparison', async (c) => {
    const userId = c.get('userId')
    const bucket = c.env.PRAMANA_DATA

    const [userSummary, chart] = await Promise.all([
      readUserSummary(bucket, userId),
      readChartJson(bucket),
    ])

    if (!userSummary) {
      return c.json({ comparisons: [], total_scored: 0 })
    }

    // Pool community stats per model from chart date-level data
    const communityByModel: Record<string, ModelDayStats[]> = {}
    for (const models of Object.values(chart.data)) {
      for (const [model, stats] of Object.entries(models)) {
        if (!communityByModel[model]) communityByModel[model] = []
        communityByModel[model].push(stats)
      }
    }

    const comparisons: Array<{
      model: string
      user_n: number
      user_mean: number
      user_variance: number
      user_ci: { lower: number; upper: number }
      community_n: number
      community_mean: number
      community_variance: number
      community_ci: { lower: number; upper: number }
      welch_t: number | null
      df: number | null
      p_value: number | null
      p_adjusted: number | null
      cohens_d: number | null
      effect: string | null
      significant: boolean
    }> = []

    const pValues: { key: string; p: number }[] = []

    for (const [model, userStats] of Object.entries(userSummary.model_stats)) {
      const communityDays = communityByModel[model]
      if (!communityDays) continue

      const communityPooled = poolStats(communityDays)
      const userCI = normalCI(userStats)
      const communityCI = normalCI(communityPooled)
      const welch = welchTTest(userStats, communityPooled)

      comparisons.push({
        model,
        user_n: userStats.n,
        user_mean: userStats.mean,
        user_variance: welfordVariance(userStats),
        user_ci: userCI,
        community_n: communityPooled.n,
        community_mean: communityPooled.mean,
        community_variance: welfordVariance(communityPooled),
        community_ci: communityCI,
        welch_t: welch?.t ?? null,
        df: welch?.df ?? null,
        p_value: welch?.pValue ?? null,
        p_adjusted: null, // filled after Holm-Bonferroni
        cohens_d: welch?.cohensD ?? null,
        effect: welch?.effectLabel ?? null,
        significant: false,
      })

      if (welch) {
        pValues.push({ key: model, p: welch.pValue })
      }
    }

    // Apply Holm-Bonferroni correction
    if (pValues.length > 0) {
      const corrected = holmBonferroni(pValues)
      for (const comp of comparisons) {
        const adj = corrected.get(comp.model)
        if (adj) {
          comp.p_adjusted = adj.adjusted
          comp.significant = adj.significant
        }
      }
    }

    comparisons.sort((a, b) => a.model.localeCompare(b.model))

    return c.json({
      comparisons,
      total_scored: userSummary.total_scored,
    })
  })
