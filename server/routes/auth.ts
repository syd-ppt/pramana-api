/**
 * OAuth routes — manual GitHub/Google OAuth + jose JWT.
 * Replaces NextAuth.js entirely.
 */
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { createToken, verifyToken, deriveUserId } from '../lib/auth'

type Env = {
  Bindings: {
    JWT_SECRET: string
    GITHUB_ID: string
    GITHUB_SECRET: string
    GOOGLE_CLIENT_ID: string
    GOOGLE_CLIENT_SECRET: string
  }
}

function getBaseUrl(c: { req: { url: string } }): string {
  const url = new URL(c.req.url)
  return `${url.protocol}//${url.host}`
}

export const authRoutes = new Hono<Env>()
  // -- Sign in: redirect to OAuth provider --
  .get('/signin/:provider', (c) => {
    const provider = c.req.param('provider')
    const callbackUrl = c.req.query('callbackUrl') || '/cli-token'
    const base = getBaseUrl(c)
    const state = btoa(JSON.stringify({ callbackUrl }))

    if (provider === 'github') {
      const params = new URLSearchParams({
        client_id: c.env.GITHUB_ID,
        redirect_uri: `${base}/api/auth/callback/github`,
        scope: 'read:user user:email',
        state,
      })
      return c.redirect(`https://github.com/login/oauth/authorize?${params}`)
    }

    if (provider === 'google') {
      const params = new URLSearchParams({
        client_id: c.env.GOOGLE_CLIENT_ID,
        redirect_uri: `${base}/api/auth/callback/google`,
        scope: 'openid email profile',
        response_type: 'code',
        state,
      })
      return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
    }

    return c.json({ error: `Unknown provider: ${provider}` }, 400)
  })

  // -- OAuth callback: exchange code, create JWT, set cookie --
  .get('/callback/:provider', async (c) => {
    const provider = c.req.param('provider')
    const code = c.req.query('code')
    const stateParam = c.req.query('state')

    if (!code) return c.json({ error: 'Missing code parameter' }, 400)

    let callbackUrl = '/cli-token'
    if (stateParam) {
      try {
        const parsed = JSON.parse(atob(stateParam))
        if (parsed.callbackUrl) callbackUrl = parsed.callbackUrl
      } catch { /* use default */ }
    }

    const base = getBaseUrl(c)
    let accountId: string
    let name: string | undefined
    let email: string | undefined
    let image: string | undefined

    if (provider === 'github') {
      // Exchange code for access token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: c.env.GITHUB_ID,
          client_secret: c.env.GITHUB_SECRET,
          code,
          redirect_uri: `${base}/api/auth/callback/github`,
        }),
      })
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
      if (!tokenData.access_token) {
        return c.json({ error: 'GitHub token exchange failed', details: tokenData.error }, 400)
      }

      // Fetch user profile
      const userRes = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'Pramana' },
      })
      const user = await userRes.json() as { id: number; login: string; name?: string; email?: string; avatar_url?: string }
      accountId = String(user.id)
      name = user.name || user.login
      email = user.email || undefined
      image = user.avatar_url
    } else if (provider === 'google') {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: c.env.GOOGLE_CLIENT_ID,
          client_secret: c.env.GOOGLE_CLIENT_SECRET,
          code,
          redirect_uri: `${base}/api/auth/callback/google`,
          grant_type: 'authorization_code',
        }),
      })
      const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
      if (!tokenData.access_token) {
        return c.json({ error: 'Google token exchange failed', details: tokenData.error }, 400)
      }

      const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      })
      const user = await userRes.json() as { id: string; name?: string; email?: string; picture?: string }
      accountId = user.id
      name = user.name
      email = user.email
      image = user.picture
    } else {
      return c.json({ error: `Unknown provider: ${provider}` }, 400)
    }

    const userId = await deriveUserId(provider, accountId)
    const jwt = await createToken({ userId, name, email, image }, c.env.JWT_SECRET)

    setCookie(c, 'pramana-session', jwt, {
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    })

    return c.redirect(callbackUrl)
  })

  // -- Session: verify cookie, return user + token --
  .get('/session', async (c) => {
    const cookie = getCookie(c, 'pramana-session')
    const authHeader = c.req.header('Authorization')
    const token = cookie || authHeader?.replace('Bearer ', '')

    if (!token) return c.json(null)

    const payload = await verifyToken(token, c.env.JWT_SECRET)
    if (!payload) return c.json(null)

    return c.json({
      user: {
        id: payload.userId,
        name: payload.name,
        email: payload.email,
        image: payload.image,
      },
      token,
    })
  })

  // -- Sign out: clear cookie --
  .post('/signout', (c) => {
    deleteCookie(c, 'pramana-session', { path: '/' })
    return c.json({ status: 'signed_out' })
  })

  // -- Providers list --
  .get('/providers', (c) => {
    const providers: string[] = []
    if (c.env.GITHUB_ID && c.env.GITHUB_SECRET) providers.push('github')
    if (c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET) providers.push('google')
    return c.json({ providers })
  })
