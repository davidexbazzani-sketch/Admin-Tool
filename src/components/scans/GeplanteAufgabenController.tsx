// ── Geplante Aufgaben: Hintergrund-Planer (global in App.tsx) ─────────────────
// Führt die „Geplanten Aufgaben“ aus — unabhängig davon, ob der Bildschirm offen ist, und nur auf
// dem EINEN Automatik-PC (BQ8069 bevorzugt, sonst genau eine Vertretung). Takt 30 s.
import { useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { darfAutomatik } from '../../services/automatikLeiter'
import { planerTakt } from '../../services/geplanteAufgaben'

const TAKT_MS = 30_000

export default function GeplanteAufgabenController() {
  const username = useAuthStore(s => s.session?.user?.username || '')
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  useEffect(() => {
    if (!username || !isAdmin) return
    const tick = async () => {
      if (busy.current) return
      busy.current = true
      try {
        if (!(await darfAutomatik())) return   // nur der EINE Automatik-PC (BQ8069 bevorzugt) — services/automatikLeiter.ts
        await planerTakt(username)
      } catch { /* nächster Takt */ } finally { busy.current = false }
    }
    const t = setInterval(() => { void tick() }, TAKT_MS)
    return () => clearInterval(t)
  }, [username, isAdmin])

  return null
}
