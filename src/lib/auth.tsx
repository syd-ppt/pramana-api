import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface User {
  id: string
  name?: string
  email?: string
  image?: string
}

interface Session {
  user: User
  token: string
}

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  session: Session | null
  status: AuthStatus
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  status: 'loading',
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() as Promise<Session> : null))
      .then((data) => {
        setSession(data)
        setStatus(data ? 'authenticated' : 'unauthenticated')
      })
      .catch(() => setStatus('unauthenticated'))
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/signout', { method: 'POST', credentials: 'include' })
    setSession(null)
    setStatus('unauthenticated')
    window.location.href = '/'
  }, [])

  return (
    <AuthContext.Provider value={{ session, status, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
