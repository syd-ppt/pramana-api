// @vitest-environment node
/**
 * Auth route tests — adapted from old lib/auth.test.ts (NextAuth).
 * Tests provider configuration, session endpoint, and signout.
 */
import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { authRoutes } from './auth'
import { createToken } from '../lib/auth'

const SECRET = 'test-secret-at-least-32-characters-long'

type Env = {
  Bindings: {
    JWT_SECRET: string
    GITHUB_ID: string
    GITHUB_SECRET: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
  }
}

function makeApp(bindings: Partial<Env['Bindings']> = {}) {
  const env: Env['Bindings'] = {
    JWT_SECRET: SECRET,
    GITHUB_ID: '',
    GITHUB_SECRET: '',
    GOOGLE_CLIENT_ID: '',
    GOOGLE_CLIENT_SECRET: '',
    ...bindings,
  }

  const app = new Hono<Env>()
  app.route('/auth', authRoutes)

  return {
    request: (path: string, init?: RequestInit) =>
      app.request(path, init, env),
  }
}

describe('GET /auth/providers', () => {
  it('returns github when only GitHub env vars are set', async () => {
    const app = makeApp({ GITHUB_ID: 'gh-id', GITHUB_SECRET: 'gh-secret' })
    const res = await app.request('/auth/providers')
    const body = await res.json() as { providers: string[] }
    expect(body.providers).toEqual(['github'])
  })

  it('returns google when only Google env vars are set', async () => {
    const app = makeApp({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' })
    const res = await app.request('/auth/providers')
    const body = await res.json() as { providers: string[] }
    expect(body.providers).toEqual(['google'])
  })

  it('returns both providers when all env vars are set', async () => {
    const app = makeApp({
      GITHUB_ID: 'gh-id',
      GITHUB_SECRET: 'gh-secret',
      GOOGLE_CLIENT_ID: 'g-id',
      GOOGLE_CLIENT_SECRET: 'g-secret',
    })
    const res = await app.request('/auth/providers')
    const body = await res.json() as { providers: string[] }
    expect(body.providers.sort()).toEqual(['github', 'google'])
  })

  it('returns empty when no env vars are set', async () => {
    const app = makeApp()
    const res = await app.request('/auth/providers')
    const body = await res.json() as { providers: string[] }
    expect(body.providers).toEqual([])
  })

  it('returns empty when GITHUB_ID is set without GITHUB_SECRET', async () => {
    const app = makeApp({ GITHUB_ID: 'gh-id' })
    const res = await app.request('/auth/providers')
    const body = await res.json() as { providers: string[] }
    expect(body.providers).toEqual([])
  })
})

describe('GET /auth/session', () => {
  it('returns null when no cookie or header present', async () => {
    const app = makeApp()
    const res = await app.request('/auth/session')
    const body = await res.json()
    expect(body).toBeNull()
  })

  it('returns user + token when valid cookie is present', async () => {
    const app = makeApp()
    const jwt = await createToken(
      { userId: 'abc123', name: 'Test User', email: 'test@example.com' },
      SECRET
    )
    const res = await app.request('/auth/session', {
      headers: { Cookie: `pramana-session=${jwt}` },
    })
    const body = await res.json() as { user: { id: string; name: string }; token: string }
    expect(body.user.id).toBe('abc123')
    expect(body.user.name).toBe('Test User')
    expect(body.token).toBe(jwt)
  })

  it('returns user + token when valid Authorization header is present', async () => {
    const app = makeApp()
    const jwt = await createToken({ userId: 'xyz789' }, SECRET)
    const res = await app.request('/auth/session', {
      headers: { Authorization: `Bearer ${jwt}` },
    })
    const body = await res.json() as { user: { id: string }; token: string }
    expect(body.user.id).toBe('xyz789')
    expect(body.token).toBe(jwt)
  })

  it('returns null for invalid token', async () => {
    const app = makeApp()
    const res = await app.request('/auth/session', {
      headers: { Cookie: 'pramana-session=invalid.jwt.token' },
    })
    const body = await res.json()
    expect(body).toBeNull()
  })

  it('returns null for token signed with wrong secret', async () => {
    const app = makeApp()
    const jwt = await createToken({ userId: 'abc' }, 'wrong-secret-also-long-enough-32chars')
    const res = await app.request('/auth/session', {
      headers: { Cookie: `pramana-session=${jwt}` },
    })
    const body = await res.json()
    expect(body).toBeNull()
  })
})

describe('POST /auth/signout', () => {
  it('returns signed_out status and clears cookie', async () => {
    const app = makeApp()
    const res = await app.request('/auth/signout', { method: 'POST' })
    const body = await res.json() as { status: string }
    expect(body.status).toBe('signed_out')
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('pramana-session=')
  })
})

describe('GET /auth/signin/:provider', () => {
  it('redirects to GitHub OAuth for github provider', async () => {
    const app = makeApp({ GITHUB_ID: 'my-gh-id', GITHUB_SECRET: 's' })
    const res = await app.request('/auth/signin/github?callbackUrl=/cli-token')
    expect(res.status).toBe(302)
    const location = res.headers.get('location')!
    expect(location).toContain('github.com/login/oauth/authorize')
    expect(location).toContain('client_id=my-gh-id')
  })

  it('redirects to Google OAuth for google provider', async () => {
    const app = makeApp({ GOOGLE_CLIENT_ID: 'my-g-id', GOOGLE_CLIENT_SECRET: 's' })
    const res = await app.request('/auth/signin/google')
    expect(res.status).toBe(302)
    const location = res.headers.get('location')!
    expect(location).toContain('accounts.google.com/o/oauth2')
    expect(location).toContain('client_id=my-g-id')
  })

  it('returns 400 for unknown provider', async () => {
    const app = makeApp()
    const res = await app.request('/auth/signin/facebook')
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('Unknown provider')
  })
})
