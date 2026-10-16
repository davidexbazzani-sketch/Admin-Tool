// ── Netzlaufwerke alt → neu: Hintergrundlauf ────────────────────────────────
// Erfasst die Netzlaufwerke der Altgeräte und verbindet sie auf den neuen PCs, sobald
// diese erreichbar sind und jemand angemeldet ist. Läuft unabhängig vom geöffneten
// Menüpunkt — vorher hing die Erfassung am Screen „Geräte-Einrichtung".
// Claim + Heartbeat wie bei den übrigen Hintergrundläufen. [[network_drive_migration]]

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { loadRunStatus, saveRunStatus, isStatusClaimed } from '../../services/scanSchedules'
import { NETWORK_DRIVE_SETUP_STATUS, runNetworkDriveSetupOnce } from '../../services/networkDriveSetup'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'

const POLL_MS = 5 * 60 * 1000
const HEARTBEAT_MS = 5 * 60 * 1000

export default function NetworkDriveSetupController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(NETWORK_DRIVE_SETUP_STATUS) } catch { return }
    if (isStatusClaimed(s, Date.now())) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveRunStatus(NETWORK_DRIVE_SETUP_STATUS, { ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    try { const check = await loadRunStatus(NETWORK_DRIVE_SETUP_STATUS); if (check.running && check.running.by !== claimToken) { busy.current = false; return } } catch { /* im Zweifel laufen */ }

    let lastBeat = Date.now()
    const heartbeat = () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      void (async () => {
        try { const cur = await loadRunStatus(NETWORK_DRIVE_SETUP_STATUS); if (cur.running?.by === claimToken) await saveRunStatus(NETWORK_DRIVE_SETUP_STATUS, { ...cur, running: { by: claimToken, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
      })()
    }

    const by = user?.displayName || username
    try {
      const res = await runNetworkDriveSetupOnce(by, heartbeat)
      await saveRunStatus(NETWORK_DRIVE_SETUP_STATUS, { lastRunAt: new Date().toISOString(), lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(NETWORK_DRIVE_SETUP_STATUS, { lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: 'Unerwarteter Fehler beim Erfassen/Verbinden der Netzlaufwerke', running: undefined }) } catch { /* egal */ }
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
