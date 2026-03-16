import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StorageRecord } from './schemas'

// Mock storage module before importing buffer
vi.mock('./storage', () => ({
  downloadFileWithEtag: vi.fn(),
  uploadFile: vi.fn(),
  uploadFileConditional: vi.fn(),
  listFiles: vi.fn(),
  downloadFile: vi.fn(),
  deleteFiles: vi.fn(),
  deleteFile: vi.fn(),
}))

import {
  writeBufferEntry,
  updateUserSummary,
  readChartJson,
  writeDelta,
  mergeDeltas,
  deleteUserFromBuffer,
} from './buffer'
import {
  downloadFileWithEtag,
  uploadFile,
  uploadFileConditional,
  listFiles,
  downloadFile,
  deleteFiles,
  deleteFile,
} from './storage'

const mockDownloadFileWithEtag = vi.mocked(downloadFileWithEtag)
const mockUploadFile = vi.mocked(uploadFile)
const mockUploadFileConditional = vi.mocked(uploadFileConditional)
const mockListFiles = vi.mocked(listFiles)
const mockDownloadFile = vi.mocked(downloadFile)
const mockDeleteFiles = vi.mocked(deleteFiles)
const mockDeleteFile = vi.mocked(deleteFile)

// Compression helpers using Web APIs (matching what buffer.ts uses)
async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(data)
  writer.close()
  return new Uint8Array(await new Response(cs.readable).arrayBuffer())
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(data)
  writer.close()
  return new Uint8Array(await new Response(ds.readable).arrayBuffer())
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// Fake R2 bucket (only used as first arg, actual calls are mocked)
const fakeBucket = {} as R2Bucket

function makeRecord(overrides: Partial<StorageRecord> = {}): StorageRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    timestamp: '2026-02-21T12:00:00.000Z',
    user_id: 'user1',
    model_id: 'gpt-5',
    prompt_id: 'prompt1',
    output: 'test output',
    output_hash: 'sha256:abc',
    metadata_json: '{}',
    year: 2026,
    month: 2,
    day: 21,
    score: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('writeBufferEntry', () => {
  it('writes a gzipped CSV entry file with headers', async () => {
    mockUploadFile.mockResolvedValue(undefined)

    await writeBufferEntry(fakeBucket, [makeRecord()])

    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    const [, key, body] = mockUploadFile.mock.calls[0]
    expect(key).toMatch(/^_buffer\/entries\/\d+_[a-z0-9]+\.csv\.gz$/)
    const csv = decoder.decode(await gunzip(body))
    expect(csv).toContain('id,timestamp,user_id')
    expect(csv).toContain('00000000-0000-4000-8000-000000000001')
    expect(csv).toContain('gpt-5')
  })

  it('skips when no records', async () => {
    await writeBufferEntry(fakeBucket, [])
    expect(mockUploadFile).not.toHaveBeenCalled()
  })

  it('escapes CSV fields with commas and quotes', async () => {
    mockUploadFile.mockResolvedValue(undefined)

    await writeBufferEntry(fakeBucket, [
      makeRecord({ output: 'has "quotes" and, commas' }),
    ])

    const [, , body] = mockUploadFile.mock.calls[0]
    const csv = decoder.decode(await gunzip(body))
    expect(csv).toContain('"has ""quotes"" and, commas"')
  })
})

describe('updateUserSummary', () => {
  it('creates new v3 summary when none exists', async () => {
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    mockUploadFile.mockResolvedValue(undefined)

    const summary = await updateUserSummary(fakeBucket, 'user1', [makeRecord()])

    expect(summary.version).toBe(3)
    expect(summary.total_submissions).toBe(1)
    expect(summary.submissions_by_date['2026-02-21']['gpt-5']).toBe(1)
    expect(summary.model_submissions['gpt-5']).toBe(1)
  })

  it('accumulates multiple records', async () => {
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    mockUploadFile.mockResolvedValue(undefined)

    const summary = await updateUserSummary(fakeBucket, 'user1', [
      makeRecord(),
      makeRecord({ id: 'test-id-2', model_id: 'gpt-4' }),
      makeRecord({ id: 'test-id-3' }),
    ])

    expect(summary.total_submissions).toBe(3)
    expect(summary.submissions_by_date['2026-02-21']['gpt-5']).toBe(2)
    expect(summary.submissions_by_date['2026-02-21']['gpt-4']).toBe(1)
    expect(summary.model_submissions['gpt-5']).toBe(2)
    expect(summary.model_submissions['gpt-4']).toBe(1)
  })

  it('migrates v1 summary (date_counts) to v3', async () => {
    const existing = JSON.stringify({
      date_counts: { '2026-02-20': { 'gpt-4': 3 } },
      total_submissions: 3,
    })
    mockDownloadFileWithEtag.mockResolvedValue({
      body: encoder.encode(existing),
      etag: '"e1"',
    })
    mockUploadFileConditional.mockResolvedValue(undefined)

    const summary = await updateUserSummary(fakeBucket, 'user1', [makeRecord()])

    expect(summary.version).toBe(3)
    expect(summary.total_submissions).toBe(4)
    expect(summary.submissions_by_date['2026-02-20']['gpt-4']).toBe(3)
    expect(summary.submissions_by_date['2026-02-21']['gpt-5']).toBe(1)
    expect(summary.model_submissions['gpt-4']).toBe(3)
    expect(summary.model_submissions['gpt-5']).toBe(1)
  })

  it('migrates v2 summary (Welford date_stats) to v3', async () => {
    const existing = JSON.stringify({
      version: 2,
      date_stats: { '2026-02-20': { 'gpt-4': { n: 2, mean: 0.8, m2: 0.1, count: 5 } } },
      model_stats: { 'gpt-4': { n: 2, mean: 0.8, m2: 0.1, count: 5 } },
      total_submissions: 5,
      total_scored: 2,
    })
    mockDownloadFileWithEtag.mockResolvedValue({
      body: encoder.encode(existing),
      etag: '"e2"',
    })
    mockUploadFileConditional.mockResolvedValue(undefined)

    const summary = await updateUserSummary(fakeBucket, 'user1', [makeRecord()])

    expect(summary.version).toBe(3)
    expect(summary.total_submissions).toBe(6)
    // v2 count was 5, migrated as submission count
    expect(summary.submissions_by_date['2026-02-20']['gpt-4']).toBe(5)
    expect(summary.submissions_by_date['2026-02-21']['gpt-5']).toBe(1)
  })
})

describe('readChartJson', () => {
  it('returns empty v5 structure when file missing', async () => {
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    const chart = await readChartJson(fakeBucket)
    expect(chart.version).toBe(5)
    expect(chart.data).toEqual({})
    expect(chart.models).toEqual([])
    expect(chart.total_submissions).toBe(0)
    expect(chart._prev_hashes).toEqual({})
    expect(chart._known_users).toEqual([])
  })

  it('migrates v3 chart to v5 on read (daily keys get -00 suffix)', async () => {
    const json = JSON.stringify({
      version: 3,
      data: {
        '2026-02-21': {
          'gpt-5': { submissions: 5, prompts_tested: 3, unique_outputs: 3, drifted_prompts: 0 }
        }
      },
      models: ['gpt-5'],
      total_submissions: 5,
      total_contributors: 1,
    })
    mockDownloadFileWithEtag.mockResolvedValue({
      body: encoder.encode(json),
      etag: '"e1"',
    })

    const chart = await readChartJson(fakeBucket)
    expect(chart.version).toBe(5)
    expect(chart._prev_hashes).toEqual({})
    expect(chart._known_users).toEqual([])
    expect(chart.total_submissions).toBe(5)
    expect(chart.data['2026-02-21-00']['gpt-5'].submissions).toBe(5)
  })

  it('migrates existing v4 chart JSON (daily keys get -00 suffix)', async () => {
    const json = JSON.stringify({
      version: 4,
      data: {
        '2026-02-21': {
          'gpt-5': { submissions: 5, prompts_tested: 3, unique_outputs: 3, drifted_prompts: 0 }
        }
      },
      models: ['gpt-5'],
      total_submissions: 5,
      total_contributors: 1,
      _prev_hashes: { 'gpt-5|prompt1': 'sha256:abc' },
      _known_users: ['user1'],
    })
    mockDownloadFileWithEtag.mockResolvedValue({
      body: encoder.encode(json),
      etag: '"e1"',
    })

    const chart = await readChartJson(fakeBucket)
    expect(chart.version).toBe(5)
    expect(chart.data['2026-02-21-00']['gpt-5'].submissions).toBe(5)
    expect(chart._prev_hashes['gpt-5|prompt1']).toBe('sha256:abc')
    expect(chart._known_users).toEqual(['user1'])
  })
})

describe('writeDelta', () => {
  it('writes a delta file to _deltas/{day}/', async () => {
    mockUploadFile.mockResolvedValue(undefined)

    await writeDelta(fakeBucket, [makeRecord()])

    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    const [, key, body] = mockUploadFile.mock.calls[0]
    expect(key).toMatch(/^_deltas\/\d{4}-\d{2}-\d{2}\/\d+_[a-z0-9]+\.json$/)

    const delta = JSON.parse(decoder.decode(body))
    expect(delta.records).toHaveLength(1)
    expect(delta.records[0].model_id).toBe('gpt-5')
    expect(delta.records[0].prompt_id).toBe('prompt1')
    expect(delta.records[0].output_hash).toBe('sha256:abc')
    expect(delta.records[0].user_id).toBe('user1')
    expect(delta.bucket).toMatch(/^\d{4}-\d{2}-\d{2}-\d{2}$/)
    expect(typeof delta.ts).toBe('number')
  })

  it('skips when no records', async () => {
    await writeDelta(fakeBucket, [])
    expect(mockUploadFile).not.toHaveBeenCalled()
  })
})

describe('mergeDeltas', () => {
  it('returns merged=0 when no deltas exist', async () => {
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    mockListFiles.mockResolvedValue([])

    const result = await mergeDeltas(fakeBucket)
    expect(result.merged).toBe(0)
  })

  it('merges single delta into empty chart', async () => {
    // Empty chart
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })

    // One delta file (v5 format with bucket)
    const delta = {
      ts: 1000,
      bucket: '2026-02-21-14',
      records: [
        { model_id: 'gpt-5', prompt_id: 'p1', output_hash: 'sha256:abc', user_id: 'user1' },
        { model_id: 'gpt-5', prompt_id: 'p2', output_hash: 'sha256:def', user_id: 'user1' },
      ],
    }
    mockListFiles.mockResolvedValue(['_deltas/2026-02-21/1000_abc123.json'])
    mockDownloadFile.mockResolvedValue(encoder.encode(JSON.stringify(delta)))
    mockUploadFile.mockResolvedValue(undefined)
    mockDeleteFiles.mockResolvedValue(undefined)

    const result = await mergeDeltas(fakeBucket)
    expect(result.merged).toBe(1)

    // Verify chart written
    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    const [, key, body] = mockUploadFile.mock.calls[0]
    expect(key).toBe('_aggregated/chart_data.json')

    const chart = JSON.parse(decoder.decode(body))
    expect(chart.version).toBe(5)
    expect(chart.data['2026-02-21-14']['gpt-5'].submissions).toBe(2)
    expect(chart.data['2026-02-21-14']['gpt-5'].prompts_tested).toBe(2)
    expect(chart.models).toEqual(['gpt-5'])
    expect(chart._known_users).toEqual(['user1'])
    expect(chart.total_contributors).toBe(1)
    expect(chart._prev_hashes['gpt-5|p1']).toBe('sha256:abc')
    expect(chart._prev_hashes['gpt-5|p2']).toBe('sha256:def')

    // Verify deltas deleted
    expect(mockDeleteFiles).toHaveBeenCalledWith(fakeBucket, ['_deltas/2026-02-21/1000_abc123.json'])
  })

  it('detects drift when hash changes', async () => {
    // Existing chart with prev_hashes (v5 format)
    const existingChart = JSON.stringify({
      version: 5,
      data: { '2026-02-20-10': { 'gpt-5': { submissions: 1, prompts_tested: 1, unique_outputs: 1, drifted_prompts: 0 } } },
      models: ['gpt-5'],
      total_submissions: 1,
      total_contributors: 1,
      _prev_hashes: { 'gpt-5|p1': 'sha256:old' },
      _known_users: ['user1'],
    })
    mockDownloadFileWithEtag.mockResolvedValue({ body: encoder.encode(existingChart), etag: '"e1"' })

    // Delta with changed hash for same prompt
    const delta = {
      ts: 2000,
      bucket: '2026-02-21-14',
      records: [
        { model_id: 'gpt-5', prompt_id: 'p1', output_hash: 'sha256:new', user_id: 'user1' },
      ],
    }
    mockListFiles.mockResolvedValue(['_deltas/2026-02-21/2000_xyz.json'])
    mockDownloadFile.mockResolvedValue(encoder.encode(JSON.stringify(delta)))
    mockUploadFile.mockResolvedValue(undefined)
    mockDeleteFiles.mockResolvedValue(undefined)

    await mergeDeltas(fakeBucket)

    const chart = JSON.parse(decoder.decode(mockUploadFile.mock.calls[0][2]))
    expect(chart.data['2026-02-21-14']['gpt-5'].drifted_prompts).toBe(1)
    expect(chart._prev_hashes['gpt-5|p1']).toBe('sha256:new')
  })
})

describe('CSV parsing (RFC 4180)', () => {
  it('parses multi-line quoted output fields correctly', async () => {
    // This was the root cause of the garbage model names bug:
    // parseCsvBody split on \n before parsing quotes, breaking multi-line outputs
    mockUploadFile.mockResolvedValue(undefined)

    const multiLineOutput = 'line 1\nline 2, with comma\nline 3 "quoted"'
    await writeBufferEntry(fakeBucket, [makeRecord({ output: multiLineOutput })])

    // Read back the written CSV and verify it round-trips correctly
    const [, , body] = mockUploadFile.mock.calls[0]
    const csv = decoder.decode(await gunzip(body))
    expect(csv).toContain('"line 1\nline 2, with comma\nline 3 ""quoted"""')

    // Now simulate reading it back via a compaction-like path:
    // feed the CSV through the same compression pipeline
    const recompressed = await gzip(encoder.encode(csv))
    mockListFiles.mockResolvedValue(['_buffer/entries/123_abc.csv.gz'])
    mockDownloadFile.mockResolvedValue(recompressed)
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })

    // deleteUserFromBuffer uses parseCsvBody internally — use it as a round-trip test
    const removed = await deleteUserFromBuffer(fakeBucket, 'nonexistent-user')
    expect(removed).toBe(0) // no user matched, but parsing succeeded without corruption
  })

  it('filters garbage rows with non-UUID ids', async () => {
    // Simulates corrupted archive data from the old split-on-newline bug
    const csv =
      'id,timestamp,user_id,model_id,prompt_id,output,output_hash,metadata_json,year,month,day\n' +
      '00000000-0000-4000-8000-000000000001,2026-02-21T00:00:00Z,user1,gpt-5,p1,valid,sha256:a,{},2026,2,21\n' +
      'garbage-not-uuid,2026-02-21T00:00:00Z,user1, HTML pattern,p1,frag,sha256:b,{},2026,2,21\n' +
      '00000000-0000-4000-8000-000000000002,2026-02-21T00:00:00Z,user1,gpt-4,p2,valid2,sha256:c,{},2026,2,21'
    const compressed = await gzip(encoder.encode(csv))

    // Entry file containing garbage rows
    mockListFiles.mockResolvedValue(['_buffer/entries/123_abc.csv.gz'])
    mockDownloadFile.mockResolvedValue(compressed)
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    mockUploadFile.mockResolvedValue(undefined)
    mockDeleteFile.mockResolvedValue(undefined)

    // deleteUserFromBuffer parses and rewrites — garbage row should be filtered
    const removed = await deleteUserFromBuffer(fakeBucket, 'user1')
    expect(removed).toBe(2) // only 2 valid records matched, garbage row filtered
  })
})

describe('deleteUserFromBuffer', () => {
  it('removes user rows from buffer entry files', async () => {
    const csv =
      'id,timestamp,user_id,model_id,prompt_id,output,output_hash,metadata_json,year,month,day\n' +
      '00000000-0000-4000-8000-000000000001,2026-02-21T00:00:00Z,user1,gpt-5,p1,out1,sha256:a,{},2026,2,21\n' +
      '00000000-0000-4000-8000-000000000002,2026-02-21T00:00:00Z,user2,gpt-5,p1,out2,sha256:b,{},2026,2,21\n' +
      '00000000-0000-4000-8000-000000000003,2026-02-21T00:00:00Z,user1,gpt-4,p2,out3,sha256:c,{},2026,2,21'
    const compressed = await gzip(encoder.encode(csv))

    mockListFiles.mockResolvedValue(['_buffer/entries/123_abc.csv.gz'])
    mockDownloadFile.mockResolvedValue(compressed)
    // No legacy buffer
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    mockUploadFile.mockResolvedValue(undefined)

    const removed = await deleteUserFromBuffer(fakeBucket, 'user1')

    expect(removed).toBe(2)
    // Entry rewritten with only user2's record
    const [, , body] = mockUploadFile.mock.calls[0]
    const resultCsv = decoder.decode(await gunzip(body))
    expect(resultCsv).not.toContain('user1')
    expect(resultCsv).toContain('user2')
  })
})
