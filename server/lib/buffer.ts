/**
 * CSV buffer + aggregation layer.
 * Workers-compatible APIs:
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

function isLegacySummary(obj: unknown): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    ('version' in obj ? (obj as { version: number }).version < 3 : true)
  )
}

function migrateSummary(raw: Record<string, unknown>): UserSummaryJson {
  // v1 had date_counts, v2 had date_stats with Welford — both migrate to v3 counts
  const v3: UserSummaryJson = {
    version: 3,
    submissions_by_date: {},
    model_submissions: {},
    total_submissions: (raw.total_submissions as number) || 0,
  }

  // v1: date_counts: Record<string, Record<string, number>>
  const dateCounts = raw.date_counts as Record<string, Record<string, number>> | undefined
  // v2: date_stats: Record<string, Record<string, { count: number }>>
  const dateStats = raw.date_stats as Record<string, Record<string, { count: number }>> | undefined

  const source = dateCounts || dateStats
  if (source) {
    for (const [date, models] of Object.entries(source)) {
      v3.submissions_by_date[date] = {}
      for (const [model, val] of Object.entries(models)) {
        const count = typeof val === 'number' ? val : (val as { count: number }).count || 0
        v3.submissions_by_date[date][model] = count
        v3.model_submissions[model] = (v3.model_submissions[model] || 0) + count
      }
    }
  }

  return v3
}

export async function updateUserSummary(
  bucket: R2Bucket,
  userId: string,
  records: StorageRecord[]
): Promise<UserSummaryJson> {
  if (records.length === 0) {
    return { version: 3, submissions_by_date: {}, model_submissions: {}, total_submissions: 0 }
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const key = userSummaryKey(userId)
    const { body, etag } = await downloadFileWithEtag(bucket, key)

    let summary: UserSummaryJson
    if (body) {
      const raw = JSON.parse(decoder.decode(body))
      summary = isLegacySummary(raw) ? migrateSummary(raw) : raw as UserSummaryJson
    } else {
      summary = { version: 3, submissions_by_date: {}, model_submissions: {}, total_submissions: 0 }
    }

    for (const r of records) {
      const dateStr = `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`

      if (!summary.submissions_by_date[dateStr]) summary.submissions_by_date[dateStr] = {}
      summary.submissions_by_date[dateStr][r.model_id] =
        (summary.submissions_by_date[dateStr][r.model_id] || 0) + 1

      summary.model_submissions[r.model_id] =
        (summary.model_submissions[r.model_id] || 0) + 1

      summary.total_submissions++
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
  return isLegacySummary(raw) ? migrateSummary(raw) : raw as UserSummaryJson
}

// -- Chart JSON aggregation (hash-based output consistency) --

export async function readChartJson(bucket: R2Bucket): Promise<ChartJson> {
  const { body } = await downloadFileWithEtag(bucket, CHART_KEY)
  if (!body) return { version: 3, data: {}, models: [], total_submissions: 0, total_contributors: 0 }
  return JSON.parse(decoder.decode(body)) as ChartJson
}

/**
 * Rebuild chart_data.json from all archive CSVs.
 * Tracks hash-based output consistency:
 *   - prevHash: last-seen output_hash per (model_id, prompt_id)
 *   - A prompt "drifted" if its hash differs from the previous day's hash
 */
export async function rebuildChartJson(bucket: R2Bucket): Promise<void> {
  // 1. Load all records: archives + current buffer
  const allRecords: StorageRecord[] = []
  const archiveKeys = await listFiles(bucket, ARCHIVE_PREFIX)
  for (const key of archiveKeys) {
    if (!key.endsWith('.csv.gz')) continue
    const buf = await downloadFile(bucket, key)
    const csv = decoder.decode(await gunzip(buf))
    allRecords.push(...parseCsvBody(csv))
  }

  // Also read the current buffer (unarchived submissions)
  const { body: bufferBody } = await downloadFileWithEtag(bucket, BUFFER_KEY)
  if (bufferBody) {
    const bufferCsv = decoder.decode(await gunzip(bufferBody))
    allRecords.push(...parseCsvBody(bufferCsv))
  }

  // 2. Sort by date
  allRecords.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year
    if (a.month !== b.month) return a.month - b.month
    return a.day - b.day
  })

  // 3. Group by (date, model)
  const grouped = new Map<string, Map<string, StorageRecord[]>>()
  const modelSet = new Set<string>()
  for (const r of allRecords) {
    const dateStr = `${r.year}-${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`
    if (!grouped.has(dateStr)) grouped.set(dateStr, new Map())
    const dateMap = grouped.get(dateStr)!
    if (!dateMap.has(r.model_id)) dateMap.set(r.model_id, [])
    dateMap.get(r.model_id)!.push(r)
    modelSet.add(r.model_id)
  }

  // 4. Compute stats with drift tracking
  const prevHash = new Map<string, string>() // `${model}|${prompt}` → last hash
  const data: Record<string, Record<string, ModelDayStats>> = {}
  let totalSubmissions = 0

  const sortedDates = Array.from(grouped.keys()).sort()
  for (const date of sortedDates) {
    data[date] = {}
    const dateMap = grouped.get(date)!

    for (const [model, records] of dateMap) {
      const promptIds = new Set<string>()
      const outputHashes = new Set<string>()
      let drifted = 0

      for (const r of records) {
        promptIds.add(r.prompt_id)
        outputHashes.add(r.output_hash)
      }

      // Check drift: for each prompt, compare latest hash to prevHash
      const promptLatestHash = new Map<string, string>()
      for (const r of records) {
        promptLatestHash.set(r.prompt_id, r.output_hash)
      }

      for (const [prompt, hash] of promptLatestHash) {
        const key = `${model}|${prompt}`
        const prev = prevHash.get(key)
        if (prev !== undefined && prev !== hash) {
          drifted++
        }
        prevHash.set(key, hash)
      }

      data[date][model] = {
        submissions: records.length,
        prompts_tested: promptIds.size,
        unique_outputs: outputHashes.size,
        drifted_prompts: drifted,
      }
      totalSubmissions += records.length
    }
  }

  // 5. Count contributors
  const userKeys = await listFiles(bucket, USERS_PREFIX)
  const totalContributors = userKeys.filter(k => k.endsWith('/summary.json')).length

  const chart: ChartJson = {
    version: 3,
    data,
    models: Array.from(modelSet).sort(),
    total_submissions: totalSubmissions,
    total_contributors: totalContributors,
  }

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
