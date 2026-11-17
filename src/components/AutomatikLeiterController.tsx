// ── Automatik-PC bestimmen (global in App.tsx, vor allen Scan-Controllern) ────
// Nur Admins nehmen teil: BQ8069 ist immer Automatik-PC, sonst genau EIN anderer Admin-PC
// (services/automatikLeiter.ts). Alle automatischen Scans fragen vor dem Start darfAutomatik().
import { useEffect } from 'react'
import { useAuthStore, useIsAdmin } from '../store/authStore'
import { starteAutomatikLeiter } from '../services/automatikLeiter'

export default function AutomatikLeiterController() {
  const username = useAuthStore(s => s.session?.user?.username || '')
  const isAdmin = useIsAdmin()
  useEffect(() => {
    if (!username || !isAdmin) return
    const stop = starteAutomatikLeiter({ benutzer: () => useAuthStore.getState().session?.user?.displayName || username })
    const beimSchliessen = () => stop()
    window.addEventListener('beforeunload', beimSchliessen)
    return () => { window.removeEventListener('beforeunload', beimSchliessen); stop() }
  }, [username, isAdmin])
  return null
}
