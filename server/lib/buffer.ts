/**
 * CSV buffer + aggregation layer.
 * Replaces lib/buffer.ts with Workers-compatible APIs:
 *   - CompressionStream/DecompressionStream instead of node:zlib
 *   - Uint8Array instead of Buffer
 *   - R2 bucket binding passed as first param
 *
 * Storage layout:
 *   _buffer/buffer.csv.gz           <- appended per submit
 *   _archive/YYYY-MM-DD.csv.gz      <- daily compacted from buffer
 *   _aggregated/chart_data.json     <- rebuilt daily by cron
 *   _users/{user_id}/summary.json   <- updated per submit (real-time)
 */
import {
  downloadFileWithEtag,
  uploadFile,
  uploadFileConditional,
  listFiles,
  downloadFile,
} from './storage'
import type {
  StorageRecord,
  ChartJson,
  UserSummaryJson,
  UserSummaryV1,
  ModelDayStats,
} from './schemas'

const BUFFER_KEY = '_buffer/buffer.csv.gz'
const CHART_KEY = '_aggregated/chart_data.json'
const ARCHIVE_PREFIX = '_archive/'
const USERS_PREFIX = '_users/'

const CSV_HEADERS =
  'id,timestamp,user_id,model_id,prompt_id,output,output_hash,metadata_json,year,month,day,score'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// -- Compression helpers (Workers-native) --

async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(data as unknown as BufferSource)
  writer.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(data as unknown as BufferSource)
  writer.close()
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

// -- CSV helpers --

function escapeCsvField(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return '"' + value.replace(/"/g, '""') + '"'
  }
  return value
}

function recordToCsvRow(r: StorageRecord): string {
  return [
    r.id,
    r.timestamp,
    r.user_id,
    r.model_id,
    r.prompt_id,
    escapeCsvField(r.output),
    r.output_hash,
    escapeCsvField(r.metadata_json),
    String(r.year),
    String(r.month),
    String(r.day),
    r.score !== null ? String(r.score) : '',
  ].join(',')
}

function parseCsvRow(line: string): StorageRecord | null {
  if (!line.trim()) return null
  // RFC 4180 parser -- handles quoted fields with commas/newlines
  const fields: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1
      let value = ''
      while (j < line.length) {
        if (line[j] === '"') {
          if (j + 1 < line.length && line[j + 1] === '"') {
            value += '"'
            j += 2
          } else {
            j++
            break
          }
        } else {
          value += line[j]
          j++
        }
      }
      fields.push(value)
      i = j + 1
    } else {
      const comma = line.indexOf(',', i)
      if (comma === -1) {
        fields.push(line.slice(i))
        break
      }
      fields.push(line.slice(i, comma))
      i = comma + 1
    }
  }
  // Support both 11-field (legacy, no score) and 12-field rows
  if (fields.length < 11) return null
  const scoreStr = fields.length >= 12 ? fields[11] : ''
  return {
    id: fields[0],
    timestamp: fields[1],
    user_id: fields[2],
    model_id: fields[3],
    prompt_id: fields[4],
    output: fields[5],
    output_hash: fields[6],
    metadata_json: fields[7],
    year: parseInt(fields[8], 10),
    month: parseInt(fields[9], 10),
    day: parseInt(fields[10], 10),
    score: scoreStr !== '' ? parseFloat(scoreStr) : null,
  }
}

function parseCsvBody(csv: string): StorageRecord[] {
  const lines = csv.split('\n')
  const records: StorageRecord[] = []
  for (let i = 1; i < lines.length; i++) {
    const rec = parseCsvRow(lines[i])
    if (rec) records.push(rec)
  }
  return records
}

// -- Welford online statistics --

function emptyStats(): ModelDayStats {
  return { n: 0, mean: 0, m2: 0, count: 0 }
}

function welfordUpdate(stats: ModelDayStats, score: number | null): void {
  stats.count++
  if (score !== null) {
    stats.n++
    const delta = score - stats.mean
    stats.mean += delta / stats.n
    const delta2 = score - stats.mean
    stats.m2 += delta * delta2
  }
}

/** Merge two Welford accumulators (parallel combine). */
export function welfordMerge(a: ModelDayStats, b: ModelDayStats): ModelDayStats {
  const count = a.count + b.count
  const n = a.n + b.n
  if (n === 0) return { n: 0, mean: 0, m2: 0, count }
  const delta = b.mean - a.mean
  const mean = (a.n * a.mean + b.n * b.mean) / n
  const m2 = a.m2 + b.m2 + delta * delta * (a.n * b.n) / n
  return { n, mean, m2, count }
}

/** Compute variance from Welford accumulator. Returns 0 if n < 2. */
export function welfordVariance(stats: ModelDayStats): number {
  return stats.n < 2 ? 0 : stats.m2 / (stats.n - 1)
}

// -- Buffer operations --

const MAX_RETRIES = 3

export async function appendToCsvBuffer(
  bucket: R2Bucket,
  records: StorageRecord[]
): Promise<void> {
  if (records.length === 0) return

  const newRows = records.map(recordToCsvRow).join('\n')

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { body, etag } = await downloadFileWithEtag(bucket, BUFFER_KEY)

    let csv: string
    if (body) {
      csv = decoder.decode(await gunzip(body))
      csv = csv.trimEnd() + '\n' + newRows
    } else {
      csv = CSV_HEADERS + '\n' + newRows
    }

    const compressed = await gzip(encoder.encode(csv))

    try {
      if (etag) {
        await uploadFileConditional(bucket, BUFFER_KEY, compressed, etag)
      } else {
        await uploadFile(bucket, BUFFER_KEY, compressed)
      }
      return
    } catch (err: unknown) {
      // R2 returns 412 on etag mismatch
      const status = (err as { status?: number }).status
      if (status === 412 && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }
}

// -- Per-user summary --

function userSummaryKey(userId: string): string {
  return `${USERS_PREFIX}${userId}/summary.json`
}

/** Migrate v1 user summary (count-based) to v2 (Welford stats). */
function migrateUserSummaryV1(v1: UserSummaryV1): UserSummaryJson {
  const v2: UserSummaryJson = {
    version: 2,
    date_stats: {},
    model_stats: {},
    total_submissions: v1.total_submissions,
    total_scored: 0,
  }
  for (const [date, models] of Object.entries(v1.date_counts)) {
    v2.date_stats[date] = {}
    for (const [model, count] of Object.entries(models)) {
      // No score data in v1 — only count is preserved
      v2.date_stats[date][model] = { n: 0, mean: 0, m2: 0, count }
      if (!v2.model_stats[model]) {
        v2.model_stats[model] = emptyStats()
      }
      v2.model_stats[model].count += count
    }
  }
  return v2
}

function isV1Summary(obj: unknown): obj is UserSummaryV1 {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'date_counts' in obj &&
    !('version' in obj)
  )
}

export async function updateUserSummary(
  bucket: R2Bucket,
  userId: string,
  records: StorageRecord[]
): Promise<UserSummaryJson> {
  if (records.length === 0) {
    return { version: 2, date_stats: {}, model_stats: {}, total_submissions: 0, total_scored: 0 }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const key = userSummaryKey(userId)
    const { body, etag } = await downloadFileWithEtag(bucket, key)

    let summary: UserSummaryJson
    if (body) {
      const raw = JSON.parse(decoder.decode(body))
      summary = isV1Summary(raw) ? migrateUserSummaryV1(raw) : raw as UserSummaryJson
    } else {
      summary = { version: 2, date_stats: {}, model_stats: {}, total_submissions: 0, total_scored: 0 }
    }

    for (const r of records) {
      const dateStr = `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`

      // Update date_stats
      if (!summary.date_stats[dateStr]) summary.date_stats[dateStr] = {}
      if (!summary.date_stats[dateStr][r.model_id]) {
        summary.date_stats[dateStr][r.model_id] = emptyStats()
      }
      welfordUpdate(summary.date_stats[dateStr][r.model_id], r.score)

      // Update model_stats (all-time per-model)
      if (!summary.model_stats[r.model_id]) {
        summary.model_stats[r.model_id] = emptyStats()
      }
      welfordUpdate(summary.model_stats[r.model_id], r.score)

      summary.total_submissions++
      if (r.score !== null) summary.total_scored++
    }

    const buf = encoder.encode(JSON.stringify(summary))

    try {
      if (etag) {
        await uploadFileConditional(bucket, key, buf, etag)
      } else {
        await uploadFile(bucket, key, buf)
      }
      return summary
    } catch (err: unknown) {
      const status = (err as { status?: number }).status
      if (status === 412 && attempt < MAX_RETRIES - 1) continue
      throw err
    }
  }

  throw new Error('updateUserSummary: exhausted retries')
}

export async function readUserSummary(
  bucket: R2Bucket,
  userId: string
): Promise<UserSummaryJson | null> {
  const { body } = await downloadFileWithEtag(bucket, userSummaryKey(userId))
  if (!body) return null
  const raw = JSON.parse(decoder.decode(body))
  return isV1Summary(raw) ? migrateUserSummaryV1(raw) : raw as UserSummaryJson
}

// -- Chart JSON --

export async function readChartJson(bucket: R2Bucket): Promise<ChartJson> {
  const { body } = await downloadFileWithEtag(bucket, CHART_KEY)
  if (!body) return { version: 2, data: {}, models: [], total_submissions: 0, total_scored: 0 }
  return JSON.parse(decoder.decode(body)) as ChartJson
}

function aggregateRecords(records: StorageRecord[], into: ChartJson): void {
  for (const r of records) {
    const dateStr = `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`
    if (!into.data[dateStr]) into.data[dateStr] = {}
    if (!into.data[dateStr][r.model_id]) {
      into.data[dateStr][r.model_id] = emptyStats()
    }
    welfordUpdate(into.data[dateStr][r.model_id], r.score)
    into.total_submissions++
    if (r.score !== null) into.total_scored++
    if (!into.models.includes(r.model_id)) into.models.push(r.model_id)
  }
}

export async function rebuildChartJson(bucket: R2Bucket): Promise<void> {
  const chart: ChartJson = { version: 2, data: {}, models: [], total_submissions: 0, total_scored: 0 }

  const archiveKeys = await listFiles(bucket, ARCHIVE_PREFIX)
  for (const key of archiveKeys) {
    if (!key.endsWith('.csv.gz')) continue
    const buf = await downloadFile(bucket, key)
    const csv = decoder.decode(await gunzip(buf))
    aggregateRecords(parseCsvBody(csv), chart)
  }

  chart.models.sort()
  await uploadFile(bucket, CHART_KEY, encoder.encode(JSON.stringify(chart)))
}

// -- Compact (cron) --

export async function compactBuffer(
  bucket: R2Bucket
): Promise<{ archived: number; chartRebuilt: boolean }> {
  const { body } = await downloadFileWithEtag(bucket, BUFFER_KEY)
  if (!body) return { archived: 0, chartRebuilt: false }

  const csv = decoder.decode(await gunzip(body))
  const records = parseCsvBody(csv)
  if (records.length === 0) return { archived: 0, chartRebuilt: false }

  const today = new Date().toISOString().split('T')[0]
  const archiveKey = `${ARCHIVE_PREFIX}${today}.csv.gz`

  const { body: existingArchive } = await downloadFileWithEtag(bucket, archiveKey)
  let archiveCsv: string
  if (existingArchive) {
    const existing = decoder.decode(await gunzip(existingArchive))
    archiveCsv = existing.trimEnd() + '\n' + records.map(recordToCsvRow).join('\n')
  } else {
    archiveCsv = CSV_HEADERS + '\n' + records.map(recordToCsvRow).join('\n')
  }
  await uploadFile(bucket, archiveKey, await gzip(encoder.encode(archiveCsv)))

  await uploadFile(bucket, BUFFER_KEY, await gzip(encoder.encode(CSV_HEADERS + '\n')))

  await rebuildChartJson(bucket)

  return { archived: records.length, chartRebuilt: true }
}

// -- GDPR helpers --

export async function deleteUserFromBuffer(
  bucket: R2Bucket,
  userId: string
): Promise<number> {
  const { body, etag } = await downloadFileWithEtag(bucket, BUFFER_KEY)
  if (!body) return 0

  const csv = decoder.decode(await gunzip(body))
  const lines = csv.split('\n')
  const header = lines[0]
  const filtered = lines.slice(1).filter((line) => {
    const rec = parseCsvRow(line)
    return rec ? rec.user_id !== userId : true
  })
  const removed = lines.length - 1 - filtered.length

  if (removed > 0) {
    const newCsv = header + '\n' + filtered.join('\n')
    const compressed = await gzip(encoder.encode(newCsv))
    if (etag) {
      await uploadFileConditional(bucket, BUFFER_KEY, compressed, etag)
    } else {
      await uploadFile(bucket, BUFFER_KEY, compressed)
    }
  }
  return removed
}
