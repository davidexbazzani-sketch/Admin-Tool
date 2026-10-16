// ── EuroPAR: Sichern + Übertragen im Hintergrund ────────────────────────────
// Läuft unabhängig davon, welcher Menüpunkt gerade offen ist. Vorher hing das Sichern
// am Screen „Geräte-Einrichtung" — markierte Geräte blieben dadurch ungesichert, wenn
// man dort nicht stehen blieb. Claim + Heartbeat wie bei den übrigen Hintergrundläufen,
// weil eine Kopie je nach Datenmenge lange dauern kann. [[europar_folder_migration]]

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { loadRunStatus, saveRunStatus, isStatusClaimed } from '../../services/scanSchedules'
import { EUROPAR_STAGING_STATUS, runEuroparStagingOnce } from '../../services/europarStaging'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'

const POLL_MS = 5 * 60 * 1000       // alle 5 min prüfen, ob etwas zu sichern/übertragen ist
const HEARTBEAT_MS = 5 * 60 * 1000

export default function EuroparStagingController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(EUROPAR_STAGING_STATUS) } catch { return }
    if (isStatusClaimed(s, Date.now())) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveRunStatus(EUROPAR_STAGING_STATUS, { ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    try { const check = await loadRunStatus(EUROPAR_STAGING_STATUS); if (check.running && check.running.by !== claimToken) { busy.current = false; return } } catch { /* im Zweifel laufen */ }

    let lastBeat = Date.now()
    const heartbeat = () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      void (async () => {
        try { const cur = await loadRunStatus(EUROPAR_STAGING_STATUS); if (cur.running?.by === claimToken) await saveRunStatus(EUROPAR_STAGING_STATUS, { ...cur, running: { by: claimToken, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
      })()
    }

    const by = user?.displayName || username
    try {
      const res = await runEuroparStagingOnce(by, heartbeat)
      await saveRunStatus(EUROPAR_STAGING_STATUS, { lastRunAt: new Date().toISOString(), lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(EUROPAR_STAGING_STATUS, { lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: 'Unerwarteter Fehler beim EuroPAR-Sichern/Übertragen', running: undefined }) } catch { /* egal */ }
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
