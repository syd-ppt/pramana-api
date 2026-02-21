/**
 * /api/user/me/* — per-user endpoints (stats, summary, GDPR delete).
 */
import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth'
import { readUserSummary, deleteUserFromBuffer, rebuildChartJson } from '../lib/buffer'
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

    // 1. Delete user's parquet files
    const allKeys = await listFiles(bucket, 'year=')
    const userParquets = allKeys.filter(
      (k) => k.includes(`/user=${userId}/`) && k.endsWith('.parquet')
    )
    if (userParquets.length > 0) {
      await deleteFiles(bucket, userParquets)
    }

    // 2. Filter user rows from buffer.csv.gz
    const bufferRowsRemoved = await deleteUserFromBuffer(bucket, userId)

    // 3. Delete per-user summary
    await deleteFile(bucket, `_users/${userId}/summary.json`)

    // 4. Rebuild chart JSON (removes user's contributions)
    await rebuildChartJson(bucket)

    return c.json({
      status: 'deleted',
      user_id: userId,
      parquet_files_deleted: userParquets.length,
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
        last_submission: null,
      })
    }

    const modelsSet = new Set<string>()
    let lastDate: string | null = null

    for (const [date, models] of Object.entries(summary.date_counts)) {
      for (const model of Object.keys(models)) {
        modelsSet.add(model)
      }
      if (!lastDate || date > lastDate) lastDate = date
    }

    return c.json({
      user_id: userId,
      total_submissions: summary.total_submissions,
      models_tested: Array.from(modelsSet).sort(),
      models_count: modelsSet.size,
      last_submission: lastDate,
    })
  })
  .get('/me/summary', async (c) => {
    const userId = c.get('userId')
    const summary = await readUserSummary(c.env.PRAMANA_DATA, userId)

    if (!summary) {
      return c.json({ date_counts: {}, total_submissions: 0 })
    }

    return c.json(summary)
  })
