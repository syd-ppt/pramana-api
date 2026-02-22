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
}))

import {
  appendToCsvBuffer,
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
} from './storage'

const mockDownloadFileWithEtag = vi.mocked(downloadFileWithEtag)
const mockUploadFile = vi.mocked(uploadFile)
const mockUploadFileConditional = vi.mocked(uploadFileConditional)
const mockListFiles = vi.mocked(listFiles)
const mockDownloadFile = vi.mocked(downloadFile)
const mockDeleteFiles = vi.mocked(deleteFiles)

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
    id: 'test-id',
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

describe('appendToCsvBuffer', () => {
  it('creates buffer with headers when none exists', async () => {
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    mockUploadFile.mockResolvedValue(undefined)

    await appendToCsvBuffer(fakeBucket, [makeRecord()])

    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    const [, , body] = mockUploadFile.mock.calls[0]
    const csv = decoder.decode(await gunzip(body))
    expect(csv).toContain('id,timestamp,user_id')
    expect(csv).toContain('test-id')
    expect(csv).toContain('gpt-5')
  })

  it('appends to existing buffer with conditional PUT', async () => {
    const existingCsv =
      'id,timestamp,user_id,model_id,prompt_id,output,output_hash,metadata_json,year,month,day\n' +
      'old-id,2026-02-20T00:00:00Z,user1,gpt-4,p1,old output,sha256:xyz,{},2026,2,20'
    const compressed = await gzip(encoder.encode(existingCsv))

    mockDownloadFileWithEtag.mockResolvedValue({
      body: compressed,
      etag: '"etag123"',
    })
    mockUploadFileConditional.mockResolvedValue(undefined)

    await appendToCsvBuffer(fakeBucket, [makeRecord()])

    expect(mockUploadFileConditional).toHaveBeenCalledTimes(1)
    const [, , body, etag] = mockUploadFileConditional.mock.calls[0]
    expect(etag).toBe('"etag123"')

    const csv = decoder.decode(await gunzip(body))
    expect(csv).toContain('old-id')
    expect(csv).toContain('test-id')
  })

  it('retries on 412 PreconditionFailed', async () => {
    const csv =
      'id,timestamp,user_id,model_id,prompt_id,output,output_hash,metadata_json,year,month,day\n'
    const compressed = await gzip(encoder.encode(csv))

    mockDownloadFileWithEtag.mockResolvedValue({
      body: compressed,
      etag: '"etag1"',
    })

    const error412 = new Error('PreconditionFailed') as Error & { status: number }
    error412.status = 412
    mockUploadFileConditional
      .mockRejectedValueOnce(error412)
      .mockResolvedValueOnce(undefined)

    await appendToCsvBuffer(fakeBucket, [makeRecord()])

    expect(mockDownloadFileWithEtag).toHaveBeenCalledTimes(2)
    expect(mockUploadFileConditional).toHaveBeenCalledTimes(2)
  })

  it('escapes CSV fields with commas and quotes', async () => {
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    mockUploadFile.mockResolvedValue(undefined)

    await appendToCsvBuffer(fakeBucket, [
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
  it('returns empty v4 structure when file missing', async () => {
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    const chart = await readChartJson(fakeBucket)
    expect(chart.version).toBe(4)
    expect(chart.data).toEqual({})
    expect(chart.models).toEqual([])
    expect(chart.total_submissions).toBe(0)
    expect(chart._prev_hashes).toEqual({})
    expect(chart._known_users).toEqual([])
  })

  it('migrates v3 chart to v4 on read', async () => {
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
    expect(chart.version).toBe(4)
    expect(chart._prev_hashes).toEqual({})
    expect(chart._known_users).toEqual([])
    expect(chart.total_submissions).toBe(5)
    expect(chart.data['2026-02-21']['gpt-5'].submissions).toBe(5)
  })

  it('parses existing v4 chart JSON', async () => {
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
    expect(chart.version).toBe(4)
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
    expect(delta.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
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

    // One delta file
    const delta = {
      ts: 1000,
      day: '2026-02-21',
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
    expect(chart.version).toBe(4)
    expect(chart.data['2026-02-21']['gpt-5'].submissions).toBe(2)
    expect(chart.data['2026-02-21']['gpt-5'].prompts_tested).toBe(2)
    expect(chart.models).toEqual(['gpt-5'])
    expect(chart._known_users).toEqual(['user1'])
    expect(chart.total_contributors).toBe(1)
    expect(chart._prev_hashes['gpt-5|p1']).toBe('sha256:abc')
    expect(chart._prev_hashes['gpt-5|p2']).toBe('sha256:def')

    // Verify deltas deleted
    expect(mockDeleteFiles).toHaveBeenCalledWith(fakeBucket, ['_deltas/2026-02-21/1000_abc123.json'])
  })

  it('detects drift when hash changes', async () => {
    // Existing chart with prev_hashes
    const existingChart = JSON.stringify({
      version: 4,
      data: { '2026-02-20': { 'gpt-5': { submissions: 1, prompts_tested: 1, unique_outputs: 1, drifted_prompts: 0 } } },
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
      day: '2026-02-21',
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
    expect(chart.data['2026-02-21']['gpt-5'].drifted_prompts).toBe(1)
    expect(chart._prev_hashes['gpt-5|p1']).toBe('sha256:new')
  })
})

describe('deleteUserFromBuffer', () => {
  it('removes user rows from buffer CSV', async () => {
    const csv =
      'id,timestamp,user_id,model_id,prompt_id,output,output_hash,metadata_json,year,month,day\n' +
      'id1,2026-02-21T00:00:00Z,user1,gpt-5,p1,out1,sha256:a,{},2026,2,21\n' +
      'id2,2026-02-21T00:00:00Z,user2,gpt-5,p1,out2,sha256:b,{},2026,2,21\n' +
      'id3,2026-02-21T00:00:00Z,user1,gpt-4,p2,out3,sha256:c,{},2026,2,21'
    const compressed = await gzip(encoder.encode(csv))

    mockDownloadFileWithEtag.mockResolvedValue({
      body: compressed,
      etag: '"e1"',
    })
    mockUploadFileConditional.mockResolvedValue(undefined)

    const removed = await deleteUserFromBuffer(fakeBucket, 'user1')

    expect(removed).toBe(2)
    const [, , body] = mockUploadFileConditional.mock.calls[0]
    const resultCsv = decoder.decode(await gunzip(body))
    expect(resultCsv).not.toContain('user1')
    expect(resultCsv).toContain('user2')
  })
})
