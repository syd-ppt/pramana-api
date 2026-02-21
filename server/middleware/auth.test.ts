// @vitest-environment node
/**
 * Auth middleware tests — verifies requireAuth/softAuth behavior.
 */
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { requireAuth, softAuth } from './auth'
import { createToken } from '../lib/auth'

const SECRET = 'test-secret-at-least-32-characters-long'

type Env = {
  Bindings: { JWT_SECRET: string }
  Variables: { userId: string }
}

const env = { JWT_SECRET: SECRET }

function makeApp(middleware: typeof requireAuth | typeof softAuth) {
  const app = new Hono<Env>()
  app.use('/protected/*', middleware)
  app.get('/protected/test', (c) => c.json({ userId: c.get('userId') }))
  return {
    request: (path: string, init?: RequestInit) => app.request(path, init, env),
  }
}

describe('requireAuth', () => {
  const app = makeApp(requireAuth)

  it('returns 401 when no token provided', async () => {
    const res = await app.request('/protected/test')
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Authentication required')
  })

  it('returns 401 for invalid token', async () => {
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer invalid.jwt' },
    })
    expect(res.status).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Invalid or expired token')
  })

  it('sets userId from valid Bearer token', async () => {
    const jwt = await createToken({ userId: 'user-abc' }, SECRET)
    const res = await app.request('/protected/test', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { userId: string }
    expect(body.userId).toBe('user-abc')
  })

  it('sets userId from valid cookie', async () => {
    const jwt = await createToken({ userId: 'user-cookie' }, SECRET)
    const res = await app.request('/protected/test', {
      headers: { Cookie: `pramana-session=${jwt}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { userId: string }
    expect(body.userId).toBe('user-cookie')
  })

  it('returns 401 for token signed with wrong secret', async () => {
    const jwt = await createToken({ userId: 'abc' }, 'wrong-secret-also-long-enough-32chars')
    const res = await app.request('/protected/test', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    expect(res.status).toBe(401)
  })
})

describe('softAuth', () => {
  const app = makeApp(softAuth)

  it('defaults to anonymous when no token provided', async () => {
    const res = await app.request('/protected/test')
    expect(res.status).toBe(200)
    const body = await res.json() as { userId: string }
    expect(body.userId).toBe('anonymous')
  })

  it('defaults to anonymous for invalid token', async () => {
    const res = await app.request('/protected/test', {
      headers: { Authorization: 'Bearer invalid.jwt' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { userId: string }
    expect(body.userId).toBe('anonymous')
  })

  it('sets userId from valid token', async () => {
    const jwt = await createToken({ userId: 'real-user' }, SECRET)
    const res = await app.request('/protected/test', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { userId: string }
    expect(body.userId).toBe('real-user')
  })
})
