// ── Verlorene Geräte – Online-Check: Auto-Scan-Controller ────────────────────
// Prüft alle als verloren gemeldeten Geräte automatisch nach Zeitplan (Standard
// Mi + Do 11:00), ob sie online sind + wann zuletzt. Muster: VlanScanController
// (Claim + Heartbeat, da die AD-Abfrage je nach Anzahl länger laufen kann).

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { getScanSchedule, isConfiguredDue, loadRunStatus, saveRunStatus, isStatusClaimed } from '../../services/scanSchedules'
import { LOST_SCAN_SCHEDULE, runLostDevicesScanOnce } from '../../services/lostDevices'

const POLL_MS = 20 * 60 * 1000
const HEARTBEAT_MS = 5 * 60 * 1000
const SCAN_ID = 'lost-devices'

export default function LostDeviceScanController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(LOST_SCAN_SCHEDULE) } catch { return }
    const now = Date.now()
    const cfg = await getScanSchedule(SCAN_ID)
    if (!isConfiguredDue(cfg, s.lastRunAt, now)) return
    if (isStatusClaimed(s, now)) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveRunStatus(LOST_SCAN_SCHEDULE, { ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    try { const check = await loadRunStatus(LOST_SCAN_SCHEDULE); if (check.running && check.running.by !== claimToken) { busy.current = false; return } } catch { /* im Zweifel scannen */ }

    let lastBeat = Date.now()
    const heartbeat = () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      void (async () => {
        try { const cur = await loadRunStatus(LOST_SCAN_SCHEDULE); if (cur.running?.by === claimToken) await saveRunStatus(LOST_SCAN_SCHEDULE, { ...cur, running: { by: claimToken, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
      })()
    }

    const by = user?.displayName || username
    try {
      const res = await runLostDevicesScanOnce(by, heartbeat)
      await saveRunStatus(LOST_SCAN_SCHEDULE, { lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(LOST_SCAN_SCHEDULE, { lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: 'Unerwarteter Fehler beim Online-Check', running: undefined }) } catch { /* egal */ }
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
