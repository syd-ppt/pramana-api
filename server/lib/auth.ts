/**
 * JWT auth helpers using jose (Workers-compatible).
 */
import { SignJWT, jwtVerify } from 'jose'

export interface TokenPayload {
  userId: string
  name?: string
  email?: string
  image?: string
}

const ALG = 'HS256'

function getSecret(jwtSecret: string): Uint8Array {
  return new TextEncoder().encode(jwtSecret)
}

export async function createToken(payload: TokenPayload, jwtSecret: string): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret(jwtSecret))
}

export async function verifyToken(token: string, jwtSecret: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(jwtSecret))
    return payload as unknown as TokenPayload
  } catch {
    return null
  }
}

/**
 * Derive deterministic user ID from provider + account ID.
 * MUST produce identical output to:
 *   createHash('sha256').update(`${provider}:${accountId}`).digest('hex').substring(0, 16)
 */
export async function deriveUserId(provider: string, accountId: string): Promise<string> {
  const data = new TextEncoder().encode(`${provider}:${accountId}`)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return hex.substring(0, 16)
}
