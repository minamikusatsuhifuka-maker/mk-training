'use client'
export function useAuth() {
  return {
    user: null,
    session: null,
    loading: false,
    role: 'admin' as const,
  }
}
