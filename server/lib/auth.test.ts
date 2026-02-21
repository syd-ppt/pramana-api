// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { createToken, verifyToken, deriveUserId } from './auth'

const TEST_SECRET = 'test-secret-at-least-32-characters-long'

describe('createToken + verifyToken', () => {
  it('round-trips a token payload', async () => {
    const payload = { userId: 'abc123', name: 'Test', email: 'test@example.com' }
    const token = await createToken(payload, TEST_SECRET)
    const result = await verifyToken(token, TEST_SECRET)

    expect(result).not.toBeNull()
    expect(result!.userId).toBe('abc123')
    expect(result!.name).toBe('Test')
    expect(result!.email).toBe('test@example.com')
  })

  it('returns null for invalid token', async () => {
    const result = await verifyToken('not.a.valid.jwt', TEST_SECRET)
    expect(result).toBeNull()
  })

  it('returns null for wrong secret', async () => {
    const token = await createToken({ userId: 'abc' }, TEST_SECRET)
    const result = await verifyToken(token, 'wrong-secret-also-long-enough-32chars')
    expect(result).toBeNull()
  })
})

describe('deriveUserId', () => {
  it('produces deterministic output', async () => {
    const a = await deriveUserId('github', '12345')
    const b = await deriveUserId('github', '12345')
    expect(a).toBe(b)
  })

  it('produces different output for different inputs', async () => {
    const a = await deriveUserId('github', '12345')
    const b = await deriveUserId('google', '12345')
    expect(a).not.toBe(b)
  })

  it('matches node:crypto createHash output (backward compatibility)', async () => {
    // CRITICAL: existing user IDs must not change
    const expected = createHash('sha256')
      .update('github:12345')
      .digest('hex')
      .substring(0, 16)

    const result = await deriveUserId('github', '12345')
    expect(result).toBe(expected)
  })

  it('matches node:crypto for google provider', async () => {
    const expected = createHash('sha256')
      .update('google:67890')
      .digest('hex')
      .substring(0, 16)

    const result = await deriveUserId('google', '67890')
    expect(result).toBe(expected)
  })

  it('returns 16 hex characters', async () => {
    const result = await deriveUserId('github', '99999')
    expect(result).toMatch(/^[0-9a-f]{16}$/)
  })
})
