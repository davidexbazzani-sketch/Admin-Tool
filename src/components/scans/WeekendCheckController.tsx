// ── Wochenend-Check – Auto-Scan-Controller ───────────────────────────────────
// Pingt sonntags (Standard 12:00, Einstellungen → Automatische Scans) alle genutzten PCs
// an und speichert je Messtag, welche noch laufen (Proaktives Radar → Wochenend-Check).
// Muster: NetworkDrivesScanController (Claim + Heartbeat).
//
// UNTERSCHIED zu den anderen Scans: KEIN Nachholen. Gemessen wird nur im Zeitfenster
// (geplanter Zeitpunkt bis +2 Std., am selben Tag) und nur, wenn für diesen Messtag
// noch kein Ergebnis vorliegt. Ist das Fenster verpasst, bleibt der Messtag
// „nicht gemessen" — ein Ping am Montag würde das Ergebnis verfälschen.

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { getScanSchedule, loadRunStatus, saveRunStatus, isStatusClaimed } from '../../services/scanSchedules'
import { WEEKEND_CHECK_ID, WEEKEND_CHECK_STATUS, isInWindow, loadWeekendResults, runWeekendCheckOnce } from '../../services/weekendCheck'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'

// Kürzer als bei den anderen Scans: das Messfenster ist nur 2 Std. lang.
const POLL_MS = 10 * 60 * 1000
const HEARTBEAT_MS = 5 * 60 * 1000

export default function WeekendCheckController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    const cfg = await getScanSchedule(WEEKEND_CHECK_ID)
    const slotKey = isInWindow(cfg, new Date())
    if (!slotKey) return
    // Für diesen Messtag schon gemessen (auch von einer anderen Instanz)?
    try { if ((await loadWeekendResults()).messungen[slotKey]) return } catch { return }

    let s
    try { s = await loadRunStatus(WEEKEND_CHECK_STATUS) } catch { return }
    if (isStatusClaimed(s)) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveRunStatus(WEEKEND_CHECK_STATUS, { ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    try { const check = await loadRunStatus(WEEKEND_CHECK_STATUS); if (check.running && check.running.by !== claimToken) { busy.current = false; return } } catch { /* im Zweifel messen */ }

    let lastBeat = Date.now()
    const heartbeat = () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      void (async () => {
        try { const cur = await loadRunStatus(WEEKEND_CHECK_STATUS); if (cur.running?.by === claimToken) await saveRunStatus(WEEKEND_CHECK_STATUS, { ...cur, running: { by: claimToken, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
      })()
    }

    const by = user?.displayName || username
    try {
      const res = await runWeekendCheckOnce(by, slotKey, heartbeat)
      await saveRunStatus(WEEKEND_CHECK_STATUS, { lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(WEEKEND_CHECK_STATUS, { lastRunAt: s.lastRunAt, lastResult: 'error', lastSummary: 'Unerwarteter Fehler beim Wochenend-Check', running: undefined }) } catch { /* egal */ }
    } finally {
      busy.current = false
    }
  }, [isAdmin, username, user?.displayName])

  useEffect(() => {
    if (!username) return
    const startAbbrechen = ersterLaufEntzerrt(() => { void tick() })
    const t = setInterval(() => { void tick() }, POLL_MS)
    const abmelden = onAppFocus(() => { void tick() })
    return () => { clearInterval(t); abmelden(); startAbbrechen() }
  }, [tick, username])

  return null
}
