// ── Treiber-Rollout: Auto-Runner-Controller ──────────────────────────────────
// Verarbeitet geplante Treiber-Rollouts im Hintergrund (Zeitplan je Rollout). Muster
// wie Nis2AccessScanController: Claim + Heartbeat (ein Lauf kann je nach PC-Zahl lange
// dauern). Single-Runner über die Flotte via DRIVER_ROLLOUT_STATUS-Claim.

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { loadRunStatus, saveRunStatus, isStatusClaimed } from '../../services/scanSchedules'
import { DRIVER_ROLLOUT_STATUS, anyRolloutDue, runDriverRolloutOnce } from '../../services/driverRollout'

const POLL_MS = 20 * 60 * 1000
const HEARTBEAT_MS = 5 * 60 * 1000

export default function DriverRolloutController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let due = false
    try { due = await anyRolloutDue() } catch { return }
    if (!due) return

    let s
    try { s = await loadRunStatus(DRIVER_ROLLOUT_STATUS) } catch { return }
    const now = Date.now()
    if (isStatusClaimed(s, now)) return

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveRunStatus(DRIVER_ROLLOUT_STATUS, { ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    try { const check = await loadRunStatus(DRIVER_ROLLOUT_STATUS); if (check.running && check.running.by !== claimToken) { busy.current = false; return } } catch { /* im Zweifel laufen */ }

    let lastBeat = Date.now()
    const heartbeat = () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      void (async () => {
        try { const cur = await loadRunStatus(DRIVER_ROLLOUT_STATUS); if (cur.running?.by === claimToken) await saveRunStatus(DRIVER_ROLLOUT_STATUS, { ...cur, running: { by: claimToken, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
      })()
    }

    const by = user?.displayName || username
    try {
      const res = await runDriverRolloutOnce(by, heartbeat)
      await saveRunStatus(DRIVER_ROLLOUT_STATUS, { lastRunAt: new Date().toISOString(), lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(DRIVER_ROLLOUT_STATUS, { lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: 'Unerwarteter Fehler beim Treiber-Rollout', running: undefined }) } catch { /* egal */ }
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
