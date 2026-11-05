// ── Endgeräte-Kostenverlauf – Hintergrund ─────────────────────────────────────
// Setzt einmal pro Kalenderwoche einen Messpunkt der Endgeräte-Kosten (bzw. zieht den
// Punkt der laufenden Woche auf den aktuellen Stand). Kein Claim nötig: das Schreiben ist
// idempotent (gleiche Woche + gleiche Werte → kein Schreiben). Siehe endpointCostHistory.ts.

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { aktualisiereKostenPunkt } from '../../services/endpointCostHistory'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'

const POLL_MS = 6 * 60 * 60 * 1000

export default function KostenVerlaufController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    busy.current = true
    try { await aktualisiereKostenPunkt(user?.displayName || username) } catch { /* nächster Versuch */ }
    finally { busy.current = false }
  }, [isAdmin, username, user?.displayName])

  useEffect(() => {
    if (!username) return
    const startAbbrechen = ersterLaufEntzerrt(() => { void tick() })
    const t = setInterval(() => { void tick() }, POLL_MS)
    const abmelden = onAppFocus(() => { void tick() }, 60 * 60 * 1000)
    return () => { clearInterval(t); abmelden(); startAbbrechen() }
  }, [tick, username])

  return null
}
