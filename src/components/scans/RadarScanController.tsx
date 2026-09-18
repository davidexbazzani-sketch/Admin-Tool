// ── Proaktives Radar (AD-Hygiene): Auto-Scan-Controller ───────────────────────
// Aktualisiert den AD-Hygiene-Cache automatisch nach dem konfigurierten Zeitplan
// (Einstellungen → „Automatische Scans"). Muster: DeviceScanController.

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { getScanSchedule, isConfiguredDue, loadRunStatus, saveRunStatus, isStatusClaimed, claimExclusive } from '../../services/scanSchedules'
import { RADAR_SCAN_SCHEDULE, runRadarScanOnce } from '../../services/extraScans'

const POLL_MS = 20 * 60 * 1000
const SCAN_ID = 'proactive-radar'

export default function RadarScanController() {
  const username = useAuthStore(s => s.session?.user?.username) || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(RADAR_SCAN_SCHEDULE) } catch { return }
    const now = Date.now()
    const cfg = await getScanSchedule(SCAN_ID)
    if (!isConfiguredDue(cfg, s.lastRunAt, now)) return
    if (isStatusClaimed(s, now)) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    // Robuste Einmal-Wahl: nur die Instanz, die den Claim gewinnt, versendet die Auto-Mail.
    const won = await claimExclusive(RADAR_SCAN_SCHEDULE, claimToken, s)
    if (!won) { busy.current = false; return }

    try {
      const res = await runRadarScanOnce()
      await saveRunStatus(RADAR_SCAN_SCHEDULE, { lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(RADAR_SCAN_SCHEDULE, { lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: 'Unerwarteter Fehler beim Radar-Scan', running: undefined }) } catch { /* egal */ }
    } finally {
      busy.current = false
    }
  }, [isAdmin, username])

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
