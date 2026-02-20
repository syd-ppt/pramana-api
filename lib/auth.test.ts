import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "crypto"

// Helper: dynamically import lib/auth with fresh module state
async function loadAuth() {
  vi.resetModules()
  return await import("@/lib/auth")
}

function clearAuthEnv() {
  delete process.env.GITHUB_ID
  delete process.env.GITHUB_SECRET
  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_CLIENT_SECRET
}

describe("buildProviders (via authOptions.providers)", () => {
  beforeEach(() => {
    clearAuthEnv()
  })

  it("returns GitHub provider when only GitHub env vars are set", async () => {
    process.env.GITHUB_ID = "gh-id"
    process.env.GITHUB_SECRET = "gh-secret"
    const { authOptions } = await loadAuth()
    expect(authOptions.providers).toHaveLength(1)
    expect(authOptions.providers[0].id).toBe(
      "github",
      "Expected GitHub provider. Check GITHUB_ID and GITHUB_SECRET env vars in lib/auth.ts buildProviders()."
    )
  })

  it("returns Google provider when only Google env vars are set", async () => {
    process.env.GOOGLE_CLIENT_ID = "g-id"
    process.env.GOOGLE_CLIENT_SECRET = "g-secret"
    const { authOptions } = await loadAuth()
    expect(authOptions.providers).toHaveLength(1)
    expect(authOptions.providers[0].id).toBe(
      "google",
      "Expected Google provider. Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in lib/auth.ts buildProviders()."
    )
  })

  it("returns both providers when all env vars are set", async () => {
    process.env.GITHUB_ID = "gh-id"
    process.env.GITHUB_SECRET = "gh-secret"
    process.env.GOOGLE_CLIENT_ID = "g-id"
    process.env.GOOGLE_CLIENT_SECRET = "g-secret"
    const { authOptions } = await loadAuth()
    const ids = authOptions.providers.map((p) => p.id).sort()
    expect(ids).toEqual(
      ["github", "google"],
      "Both GitHub and Google providers should be registered when all 4 env vars are set. Check lib/auth.ts buildProviders()."
    )
  })

  it("returns 0 providers and warns when no env vars are set", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { authOptions } = await loadAuth()
    expect(authOptions.providers).toHaveLength(0)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("No OAuth providers configured")
    )
    warnSpy.mockRestore()
  })

  it("returns 0 providers when GITHUB_ID is set without GITHUB_SECRET", async () => {
    process.env.GITHUB_ID = "gh-id"
    // GITHUB_SECRET intentionally missing
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const { authOptions } = await loadAuth()
    expect(authOptions.providers).toHaveLength(0)
    warnSpy.mockRestore()
  })
})

describe("JWT callback", () => {
  it("produces deterministic userId from sha256(provider:accountId)[0:16]", async () => {
    process.env.GITHUB_ID = "x"
    process.env.GITHUB_SECRET = "x"
    const { authOptions } = await loadAuth()
    const jwtCb = authOptions.callbacks!.jwt!

    const expected = createHash("sha256")
      .update("github:12345")
      .digest("hex")
      .substring(0, 16)

    const result = await jwtCb({
      token: {},
      account: { provider: "github", providerAccountId: "12345" },
      profile: { id: "12345" },
    } as any)

    expect(result.userId).toBe(
      expected,
      `JWT callback should set userId = sha256('provider:accountId')[0:16]. Got '${result.userId}', expected '${expected}'. Check lib/auth.ts jwt callback.`
    )
  })

  it("does not overwrite userId when account is null (token refresh)", async () => {
    process.env.GITHUB_ID = "x"
    process.env.GITHUB_SECRET = "x"
    const { authOptions } = await loadAuth()
    const jwtCb = authOptions.callbacks!.jwt!

    const result = await jwtCb({
      token: { userId: "existing-id" },
      account: null,
      profile: undefined,
    } as any)

    expect(result.userId).toBe(
      "existing-id",
      "JWT callback must not overwrite userId on token refresh (account=null). Check the `if (account && profile)` guard in lib/auth.ts."
    )
  })
})

describe("session callback", () => {
  it("copies token.userId to session.user.id", async () => {
    process.env.GITHUB_ID = "x"
    process.env.GITHUB_SECRET = "x"
    const { authOptions } = await loadAuth()
    const sessionCb = authOptions.callbacks!.session!

    const result = await sessionCb({
      session: { user: { name: "test" } },
      token: { userId: "abc123" },
    } as any)

    expect((result as any).user.id).toBe(
      "abc123",
      "Session callback must copy token.userId → session.user.id. Check lib/auth.ts session callback."
    )
  })
})

describe("authOptions static config", () => {
  it("uses /auth/signin as custom sign-in page", async () => {
    process.env.GITHUB_ID = "x"
    process.env.GITHUB_SECRET = "x"
    const { authOptions } = await loadAuth()
    expect(authOptions.pages?.signIn).toBe(
      "/auth/signin",
      "Custom sign-in page must be '/auth/signin'. If changed, the SignInButtons component won't render. Check lib/auth.ts pages.signIn."
    )
  })

  it("uses jwt session strategy", async () => {
    process.env.GITHUB_ID = "x"
    process.env.GITHUB_SECRET = "x"
    const { authOptions } = await loadAuth()
    expect(authOptions.session?.strategy).toBe(
      "jwt",
      "Session strategy must be 'jwt' for extractSessionToken() to work. Database sessions use a different cookie format. Check lib/auth.ts session.strategy."
    )
  })
})
