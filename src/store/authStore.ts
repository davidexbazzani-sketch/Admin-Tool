import { create } from 'zustand'
import type { AppSession, AppUser } from '../types/auth'

interface AuthState {
  session: AppSession | null
  setSession: (s: AppSession | null) => void

  networkAvailable: boolean
  setNetworkAvailable: (v: boolean) => void

  // Whether first-run initialization has been completed
  initialized: boolean
  setInitialized: (v: boolean) => void

  // Recovery key shown on first run (shown once, then cleared)
  firstRunRecoveryKey: string | null
  setFirstRunRecoveryKey: (k: string | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),

  networkAvailable: false,
  setNetworkAvailable: (networkAvailable) => set({ networkAvailable }),

  initialized: false,
  setInitialized: (initialized) => set({ initialized }),

  firstRunRecoveryKey: null,
  setFirstRunRecoveryKey: (firstRunRecoveryKey) => set({ firstRunRecoveryKey }),
}))

// ── Convenience selectors ──────────────────────────────────────────────────────
export function useCurrentUser(): AppUser | null {
  return useAuthStore((s) => s.session?.user ?? null)
}

export function useIsLoggedIn(): boolean {
  return useAuthStore((s) => s.session !== null)
}

export function useRole() {
  return useAuthStore((s) => s.session?.user.role ?? null)
}

export function useIsMasterAdmin(): boolean {
  return useAuthStore((s) => s.session?.user.role === 'master_admin')
}

export function useIsAdmin(): boolean {
  const role = useAuthStore((s) => s.session?.user.role)
  return role === 'admin' || role === 'master_admin'
}

export function useIsFounder(): boolean {
  return useAuthStore((s) => s.session?.user.isFounder === true)
}

// Check if a specific feature is allowed for the current user
export function useCanAccess(featureId: string): boolean {
  return useAuthStore((s) => {
    const user = s.session?.user
    if (!user) return false
    if (user.role === 'master_admin') return true
    if (user.role === 'admin') return !user.blockedFeatures.includes(featureId)
    // Normal user: blocked unless featureId is in the read-only allowed list
    return false
  })
}
