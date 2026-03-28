'use client'
import { createContext, useContext } from 'react'

type AuthContextType = {
  user: null
  session: null
  loading: false
  role: 'admin'
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: false,
  role: 'admin',
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ user: null, session: null, loading: false, role: 'admin' }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuthContext = () => useContext(AuthContext)
