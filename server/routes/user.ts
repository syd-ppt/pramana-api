/**
 * /api/user/me/* — per-user endpoints (stats, summary, GDPR delete).
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { readUserSummary, readChartJson, deleteUserFromBuffer, rebuildChartJson } from '../lib/buffer'
import { listFiles, deleteFiles, deleteFile } from '../lib/storage'

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

    const bufferRowsRemoved = await deleteUserFromBuffer(bucket, userId)
    await deleteFile(bucket, `_users/${userId}/summary.json`)
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
        models_tested: [],
        models_count: 0,
        model_submissions: {},
        last_submission: null,
      })
    }

    let lastDate: string | null = null
    for (const date of Object.keys(summary.submissions_by_date)) {
      if (!lastDate || date > lastDate) lastDate = date
    }

    return c.json({
      user_id: userId,
      total_submissions: summary.total_submissions,
      models_tested: Object.keys(summary.model_submissions).sort(),
      models_count: Object.keys(summary.model_submissions).length,
      model_submissions: summary.model_submissions,
      last_submission: lastDate,
    })
  })
  .get('/me/summary', async (c) => {
    const userId = c.get('userId')
    const summary = await readUserSummary(c.env.PRAMANA_DATA, userId)

    if (!summary) {
      return c.json({ version: 3, submissions_by_date: {}, model_submissions: {}, total_submissions: 0 })
    }

    return c.json(summary)
  })
