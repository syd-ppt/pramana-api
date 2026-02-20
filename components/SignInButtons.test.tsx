import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockSignIn = vi.fn()
vi.mock("next-auth/react", () => ({
  signIn: (...args: any[]) => mockSignIn(...args),
}))

import SignInButtons from "./SignInButtons"

describe("SignInButtons", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders GitHub button when providers includes 'github'", () => {
    render(<SignInButtons providers={["github"]} />)
    expect(screen.getByText("Continue with GitHub")).toBeInTheDocument()
    expect(screen.queryByText("Continue with Google")).not.toBeInTheDocument()
  })

  it("renders Google button when providers includes 'google'", () => {
    render(<SignInButtons providers={["google"]} />)
    expect(screen.getByText("Continue with Google")).toBeInTheDocument()
    expect(screen.queryByText("Continue with GitHub")).not.toBeInTheDocument()
  })

  it("renders both buttons when both providers are present", () => {
    render(<SignInButtons providers={["github", "google"]} />)
    expect(
      screen.getByText("Continue with GitHub"),
      "GitHub button missing. Check components/SignInButtons.tsx providers.includes('github') conditional."
    ).toBeInTheDocument()
    expect(
      screen.getByText("Continue with Google"),
      "Google button missing. Check components/SignInButtons.tsx providers.includes('google') conditional."
    ).toBeInTheDocument()
  })

  it("shows 'No authentication providers configured.' when providers is empty", () => {
    render(<SignInButtons providers={[]} />)
    expect(
      screen.getByText("No authentication providers configured."),
      "Empty provider list should show error message. This is the 404 bug — zero providers configured on Vercel means blank sign-in page. Check components/SignInButtons.tsx providers.length === 0 branch."
    ).toBeInTheDocument()
  })

  it("calls signIn('github', { callbackUrl: '/cli-token' }) on GitHub click", async () => {
    mockSignIn.mockClear()
    render(<SignInButtons providers={["github"]} />)
    await userEvent.click(screen.getByText("Continue with GitHub"))
    expect(mockSignIn).toHaveBeenCalledWith(
      "github",
      { callbackUrl: "/cli-token" }
    )
  })

  it("calls signIn('google', { callbackUrl: '/cli-token' }) on Google click", async () => {
    mockSignIn.mockClear()
    render(<SignInButtons providers={["google"]} />)
    await userEvent.click(screen.getByText("Continue with Google"))
    expect(mockSignIn).toHaveBeenCalledWith(
      "google",
      { callbackUrl: "/cli-token" }
    )
  })
})
