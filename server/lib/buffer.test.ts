import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StorageRecord } from './schemas'

// Mock storage module before importing buffer
vi.mock('./storage', () => ({
  downloadFileWithEtag: vi.fn(),
  uploadFile: vi.fn(),
  uploadFileConditional: vi.fn(),
  listFiles: vi.fn(),
  downloadFile: vi.fn(),
}))

import {
  appendToCsvBuffer,
  updateUserSummary,
  readChartJson,
  deleteUserFromBuffer,
} from './buffer'
import {
  downloadFileWithEtag,
  uploadFile,
  uploadFileConditional,
} from './storage'

const mockDownloadFileWithEtag = vi.mocked(downloadFileWithEtag)
const mockUploadFile = vi.mocked(uploadFile)
const mockUploadFileConditional = vi.mocked(uploadFileConditional)

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
  it('returns empty v3 structure when file missing', async () => {
    mockDownloadFileWithEtag.mockResolvedValue({ body: null, etag: null })
    const chart = await readChartJson(fakeBucket)
    expect(chart.version).toBe(3)
    expect(chart.data).toEqual({})
    expect(chart.models).toEqual([])
    expect(chart.total_submissions).toBe(0)
  })

  it('parses existing chart JSON', async () => {
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
    expect(chart.total_submissions).toBe(5)
    expect(chart.data['2026-02-21']['gpt-5'].submissions).toBe(5)
    expect(chart.data['2026-02-21']['gpt-5'].drifted_prompts).toBe(0)
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
