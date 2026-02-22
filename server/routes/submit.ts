/**
 * POST /api/submit — single + batch submission.
 */
import { Hono } from 'hono'
import { softAuth } from '../middleware/auth'
import {
  SubmissionRequestSchema,
  BatchSubmissionRequestSchema,
  type StorageRecord,
} from '../lib/schemas'
import { appendToCsvBuffer, updateUserSummary, rebuildChartJson } from '../lib/buffer'

type Env = {
  Bindings: { PRAMANA_DATA: R2Bucket; JWT_SECRET: string }
  Variables: { userId: string }
}

async function sha256hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const submitRoutes = new Hono<Env>()
  .use('/*', softAuth)
  .post('/', async (c) => {
    const body = await c.req.json()
    const parsed = SubmissionRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        400
      )
    }

    const submission = parsed.data
    const userId = c.get('userId')
    const now = new Date()
    const id = crypto.randomUUID()

    const hashInput = `${submission.model_id}|${submission.prompt_id}|${submission.output}`
    const outputHash = await sha256hex(hashInput)

    const record: StorageRecord = {
      id,
      timestamp: now.toISOString(),
      user_id: userId,
      model_id: submission.model_id,
      prompt_id: submission.prompt_id,
      output: submission.output,
      output_hash: `sha256:${outputHash}`,
      metadata_json: JSON.stringify(submission.metadata ?? {}),
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      day: now.getUTCDate(),
      score: submission.score ?? null,
    }

    const bucket = c.env.PRAMANA_DATA
    const [, summary] = await Promise.all([
      appendToCsvBuffer(bucket, [record]),
      updateUserSummary(bucket, userId, [record]),
    ])

    return c.json({
      status: 'accepted',
      id,
      hash: `sha256:${outputHash}`,
      user_summary: summary,
    })
  })
  .post('/batch', async (c) => {
    const body = await c.req.json()
    const parsed = BatchSubmissionRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        400
      )
    }

    const batch = parsed.data
    const userId = c.get('userId')
    const now = new Date()

    const records: StorageRecord[] = []
    const results: { id: string; hash: string }[] = []

    for (const submission of batch.results) {
      const id = crypto.randomUUID()
      const hashInput = `${submission.model_id}|${submission.prompt_id}|${submission.output}`
      const outputHash = await sha256hex(hashInput)

      records.push({
        id,
        timestamp: now.toISOString(),
        user_id: userId,
        model_id: submission.model_id,
        prompt_id: submission.prompt_id,
        output: submission.output,
        output_hash: `sha256:${outputHash}`,
        metadata_json: JSON.stringify(submission.metadata ?? {}),
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        day: now.getUTCDate(),
        score: submission.score ?? null,
      })

      results.push({ id, hash: `sha256:${outputHash}` })
    }

    const bucket = c.env.PRAMANA_DATA
    await Promise.all([
      appendToCsvBuffer(bucket, records),
      updateUserSummary(bucket, userId, records),
    ])

    // Rebuild chart data so dashboard reflects new submissions immediately
    c.executionCtx.waitUntil(rebuildChartJson(bucket))

    return c.json({
      status: 'completed',
      submitted: results.length,
      results,
    })
  })
