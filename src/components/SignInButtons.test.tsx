import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SignInButtons from './SignInButtons'

describe('SignInButtons', () => {
  let originalHref: string

  beforeEach(() => {
    originalHref = window.location.href
    // Mock window.location.href setter
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: originalHref },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: originalHref },
      writable: true,
      configurable: true,
    })
  })

  it('renders GitHub button when providers includes "github"', () => {
    render(<SignInButtons providers={['github']} />)
    expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
    expect(screen.queryByText('Continue with Google')).not.toBeInTheDocument()
  })

  it('renders Google button when providers includes "google"', () => {
    render(<SignInButtons providers={['google']} />)
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
    expect(screen.queryByText('Continue with GitHub')).not.toBeInTheDocument()
  })

  it('renders both buttons when both providers are present', () => {
    render(<SignInButtons providers={['github', 'google']} />)
    expect(screen.getByText('Continue with GitHub')).toBeInTheDocument()
    expect(screen.getByText('Continue with Google')).toBeInTheDocument()
  })

  it('shows error when providers is empty', () => {
    render(<SignInButtons providers={[]} />)
    expect(screen.getByText('No authentication providers configured.')).toBeInTheDocument()
  })

  it('sets window.location.href to github signin on click', async () => {
    render(<SignInButtons providers={['github']} />)
    await userEvent.click(screen.getByText('Continue with GitHub'))
    expect(window.location.href).toBe('/api/auth/signin/github?callbackUrl=%2Fcli-token')
  })

  it('sets window.location.href to google signin on click', async () => {
    render(<SignInButtons providers={['google']} />)
    await userEvent.click(screen.getByText('Continue with Google'))
    expect(window.location.href).toBe('/api/auth/signin/google?callbackUrl=%2Fcli-token')
  })
})
