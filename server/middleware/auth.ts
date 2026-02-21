/**
 * Hono auth middleware — reads JWT from cookie or Authorization header.
 */
import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { verifyToken } from '../lib/auth'

type Env = {
  Bindings: { JWT_SECRET: string }
  Variables: { userId: string }
}

/** Requires valid JWT. Returns 401 if missing/invalid. */
export const requireAuth = createMiddleware<Env>(async (c, next) => {
  const cookie = getCookie(c, 'pramana-session')
  const authHeader = c.req.header('Authorization')
  const token = cookie || authHeader?.replace('Bearer ', '')

  if (!token) return c.json({ error: 'Authentication required' }, 401)

  const payload = await verifyToken(token, c.env.JWT_SECRET)
  if (!payload) return c.json({ error: 'Invalid or expired token' }, 401)

  c.set('userId', payload.userId)
  await next()
})

/** Extracts userId if JWT present, defaults to 'anonymous'. */
export const softAuth = createMiddleware<Env>(async (c, next) => {
  const cookie = getCookie(c, 'pramana-session')
  const authHeader = c.req.header('Authorization')
  const token = cookie || authHeader?.replace('Bearer ', '')

  if (token) {
    const payload = await verifyToken(token, c.env.JWT_SECRET)
    if (payload) {
      c.set('userId', payload.userId)
      await next()
      return
    }
  }

  c.set('userId', 'anonymous')
  await next()
})
