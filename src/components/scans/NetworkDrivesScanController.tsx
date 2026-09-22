// ── Verbundene Netzlaufwerke – Auto-Scan-Controller ──────────────────────────
// Liest nach Zeitplan (Einstellungen → Automatische Scans, Standard Di 13:00) für
// ALLE Computer die verbundenen Netzlaufwerke per WinRM ein und speichert sie je
// Host. Ergebnis erscheint im Geräte-„i" unter „Verbundene Netzlaufwerke".
// Muster: LostDeviceScanController (Claim + Heartbeat, da der Scan über viele PCs
// läuft und länger dauern kann).

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { getScanSchedule, isConfiguredDue, loadRunStatus, saveRunStatus, isStatusClaimed } from '../../services/scanSchedules'
import { NETWORK_DRIVES_STATUS, runNetworkDrivesScanOnce } from '../../services/deviceNetworkDrives'

const POLL_MS = 20 * 60 * 1000
const HEARTBEAT_MS = 5 * 60 * 1000
const SCAN_ID = 'network-drives'

export default function NetworkDrivesScanController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(NETWORK_DRIVES_STATUS) } catch { return }
    const now = Date.now()
    const cfg = await getScanSchedule(SCAN_ID)
    if (!isConfiguredDue(cfg, s.lastRunAt, now)) return
    if (isStatusClaimed(s, now)) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveRunStatus(NETWORK_DRIVES_STATUS, { ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    try { const check = await loadRunStatus(NETWORK_DRIVES_STATUS); if (check.running && check.running.by !== claimToken) { busy.current = false; return } } catch { /* im Zweifel scannen */ }

    let lastBeat = Date.now()
    const heartbeat = () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      void (async () => {
        try { const cur = await loadRunStatus(NETWORK_DRIVES_STATUS); if (cur.running?.by === claimToken) await saveRunStatus(NETWORK_DRIVES_STATUS, { ...cur, running: { by: claimToken, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
      })()
    }

    const by = user?.displayName || username
    try {
      const res = await runNetworkDrivesScanOnce(by, heartbeat)
      await saveRunStatus(NETWORK_DRIVES_STATUS, { lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(NETWORK_DRIVES_STATUS, { lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: 'Unerwarteter Fehler beim Netzlaufwerk-Scan', running: undefined }) } catch { /* egal */ }
    } finally {
      busy.current = false
    }
  }, [isAdmin, username, user?.displayName])

  useEffect(() => {
    if (!username) return
    void tick()
    const t = setInterval(() => { void tick() }, POLL_MS)
    const onFocus = () => { void tick() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [tick, username])

  return null
}
