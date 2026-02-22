import { Hono } from 'hono'
import { compactBuffer, rebuildChartJson, rebuildUserSummaries } from '../lib/buffer'
import { listFiles, downloadFile, uploadFile, deleteFile } from '../lib/storage'

type Env = { Bindings: { PRAMANA_DATA: R2Bucket; CRON_SECRET: string } }

function requireCronAuth(c: { req: { header: (name: string) => string | undefined }; env: { CRON_SECRET: string }; json: (body: unknown, status: number) => Response }): Response | null {
  const authHeader = c.req.header('Authorization')
  const expected = c.env.CRON_SECRET
  if (!expected) return c.json({ error: 'CRON_SECRET not configured' }, 500)
  if (authHeader !== `Bearer ${expected}`) return c.json({ error: 'Unauthorized' }, 401)
  return null
}

export const adminRoutes = new Hono<Env>()
  .post('/compact', async (c) => {
    const denied = requireCronAuth(c)
    if (denied) return denied

    const result = await compactBuffer(c.env.PRAMANA_DATA)
    return c.json({ status: 'completed', ...result })
  })
  .post('/rebuild', async (c) => {
    const denied = requireCronAuth(c)
    if (denied) return denied

    const bucket = c.env.PRAMANA_DATA
    await rebuildChartJson(bucket)
    const userResult = await rebuildUserSummaries(bucket)
    return c.json({ status: 'completed', rebuilt: true, ...userResult })
  })
  // TEMP: one-shot reassign anonymous → 40589bdddb811717. Remove after use.
  .post('/reassign', async (c) => {
    const denied = requireCronAuth(c)
    if (denied) return denied

    const FROM = 'anonymous'
    const TO = '40589bdddb811717'
    const bucket = c.env.PRAMANA_DATA

    // Helper: decompress gzip
    async function gunzip(data: Uint8Array): Promise<Uint8Array> {
      const ds = new DecompressionStream('gzip')
      const w = ds.writable.getWriter()
      w.write(data as unknown as BufferSource)
      w.close()
      return new Uint8Array(await new Response(ds.readable).arrayBuffer())
    }
    async function gzip(data: Uint8Array): Promise<Uint8Array> {
      const cs = new CompressionStream('gzip')
      const w = cs.writable.getWriter()
      w.write(data as unknown as BufferSource)
      w.close()
      return new Uint8Array(await new Response(cs.readable).arrayBuffer())
    }

    const enc = new TextEncoder()
    const dec = new TextDecoder()
    let reassigned = 0

    // Rewrite archives
    const keys = await listFiles(bucket, '_archive/')
    for (const key of keys) {
      if (!key.endsWith('.csv.gz')) continue
      const raw = await downloadFile(bucket, key)
      const csv = dec.decode(await gunzip(raw))
      // Simple text replace of ,anonymous, with ,TO, in user_id column (col 2)
      // CSV: id,timestamp,user_id,...
      const lines = csv.split('\n')
      let changed = false
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].includes(`,${FROM},`)) {
          lines[i] = lines[i].replace(`,${FROM},`, `,${TO},`)
          reassigned++
          changed = true
        }
      }
      if (changed) {
        await uploadFile(bucket, key, await gzip(enc.encode(lines.join('\n'))))
      }
    }

    // Rewrite buffer
    const bufObj = await bucket.get('_buffer/buffer.csv.gz')
    if (bufObj) {
      const raw = new Uint8Array(await bufObj.arrayBuffer())
      const csv = dec.decode(await gunzip(raw))
      const lines = csv.split('\n')
      let changed = false
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].includes(`,${FROM},`)) {
          lines[i] = lines[i].replace(`,${FROM},`, `,${TO},`)
          reassigned++
          changed = true
        }
      }
      if (changed) {
        await uploadFile(bucket, '_buffer/buffer.csv.gz', await gzip(enc.encode(lines.join('\n'))))
      }
    }

    // Delete orphaned anonymous summary
    await deleteFile(bucket, `_users/${FROM}/summary.json`).catch(() => {})

    // Rebuild chart + user summaries
    await rebuildChartJson(bucket)
    const userResult = await rebuildUserSummaries(bucket)

    return c.json({ status: 'completed', reassigned, ...userResult })
  })
