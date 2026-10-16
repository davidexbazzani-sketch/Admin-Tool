// ── Automatische Windows-Updates für Geräte in der Einrichtung ───────────────
// Prüft regelmäßig, welche Geräte aus der Geräte-Einrichtung (offene Neu-/Refresh-
// Checklisten) seit mehr als 8 Stunden keinen Update-Lauf hatten, und installiert dort
// verfügbare Updates — nur wenn der PC online ist. Erledigte Checklisten fallen
// automatisch heraus. Muster: NetworkDrivesScanController (Claim + Heartbeat), weil ein
// Lauf über mehrere PCs lange dauern kann. [[setup_scripts_feature]]

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { loadRunStatus, saveRunStatus, isStatusClaimed } from '../../services/scanSchedules'
import { WINUPDATE_STATUS, WINUPDATE_INTERVAL_H, runAutoWindowsUpdatesOnce } from '../../services/autoWindowsUpdate'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'

const POLL_MS = 30 * 60 * 1000        // alle 30 min prüfen, ob ein Gerät fällig ist
const HEARTBEAT_MS = 5 * 60 * 1000

export default function WindowsUpdateController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(WINUPDATE_STATUS) } catch { return }
    const now = Date.now()
    // Der eigentliche 8-h-Takt hängt am einzelnen Gerät (winUpdateTriedAt) — hier wird nur
    // verhindert, dass mehrere Instanzen gleichzeitig loslaufen.
    if (isStatusClaimed(s, now)) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveRunStatus(WINUPDATE_STATUS, { ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    try { const check = await loadRunStatus(WINUPDATE_STATUS); if (check.running && check.running.by !== claimToken) { busy.current = false; return } } catch { /* im Zweifel laufen */ }

    let lastBeat = Date.now()
    const heartbeat = () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      void (async () => {
        try { const cur = await loadRunStatus(WINUPDATE_STATUS); if (cur.running?.by === claimToken) await saveRunStatus(WINUPDATE_STATUS, { ...cur, running: { by: claimToken, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
      })()
    }

    const by = user?.displayName || username
    try {
      const res = await runAutoWindowsUpdatesOnce(by, heartbeat)
      await saveRunStatus(WINUPDATE_STATUS, { lastRunAt: new Date().toISOString(), lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(WINUPDATE_STATUS, { lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: `Unerwarteter Fehler bei den automatischen Windows-Updates (${WINUPDATE_INTERVAL_H}-h-Takt)`, running: undefined }) } catch { /* egal */ }
    } finally {
      busy.current = false
    }
  }, [isAdmin, username, user?.displayName])

  useEffect(() => {
    if (!username) return
    // Erster Lauf entzerrt: sonst greifen beim Start alle Controller gleichzeitig
    // aufs Netzlaufwerk zu und das Fenster hakt in den ersten Sekunden.
    const startAbbrechen = ersterLaufEntzerrt(() => { void tick() })
    const t = setInterval(() => { void tick() }, POLL_MS)
    // Beim Zurückkehren ins Fenster nachsehen — gebündelt und entzerrt über den
    // gemeinsamen Melder, damit nicht alle Controller gleichzeitig loslaufen.
    const abmelden = onAppFocus(() => { void tick() })
    return () => { clearInterval(t); abmelden(); startAbbrechen() }
  }, [tick, username])

  return null
}
