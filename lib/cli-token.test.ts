import { describe, it, expect } from "vitest"
import { extractSessionToken } from "@/lib/auth"

function makeCookieStore(cookies: Record<string, string>) {
  return {
    get(name: string) {
      return name in cookies ? { value: cookies[name] } : undefined
    },
  }
}

describe("extractSessionToken", () => {
  it("returns __Secure-next-auth.session-token cookie value (production)", () => {
    const store = makeCookieStore({
      "__Secure-next-auth.session-token": "prod-jwt-value",
    })
    expect(extractSessionToken(store)).toBe(
      "prod-jwt-value",
      "Production cookie name is '__Secure-next-auth.session-token'. Check lib/auth.ts extractSessionToken()."
    )
  })

  it("falls back to next-auth.session-token cookie (development)", () => {
    const store = makeCookieStore({
      "next-auth.session-token": "dev-jwt-value",
    })
    expect(extractSessionToken(store)).toBe(
      "dev-jwt-value",
      "Dev cookie name is 'next-auth.session-token'. Check lib/auth.ts extractSessionToken() fallback."
    )
  })

  it("returns empty string when neither cookie is present", () => {
    const store = makeCookieStore({})
    expect(extractSessionToken(store)).toBe(
      "",
      "extractSessionToken must return '' (not undefined/null) when no session cookie exists. Check lib/auth.ts extractSessionToken() final fallback."
    )
  })
})
