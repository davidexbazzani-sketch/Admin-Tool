// ── Geräte-Scan: Auto-Scan-Controller (alle 3 Tage 15:00, Hintergrund) ────────
// Führt den Geräte-Scan (IP/MAC/Seriennummer für Server, Computer, Drucker)
// automatisch aus, sobald der jüngste „alle 3 Tage 15:00"-Slot nach dem letzten
// Lauf liegt. Kein UI, keine Bestätigung. Verpasste Slots werden nachgeholt.
// Muster: SoftwareScanController (Claim-Token + Heartbeat gegen Doppelläufe bei
// mehreren offenen Tool-Instanzen).

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import {
  loadDeviceScanSchedule, saveDeviceScanSchedule, isDeviceScanClaimed, runDeviceScan,
} from '../../services/deviceScan'
import { getScanSchedule, isConfiguredDue } from '../../services/scanSchedules'

const POLL_MS = 20 * 60 * 1000       // alle 20 min prüfen, ob ein Lauf fällig ist
const HEARTBEAT_MS = 5 * 60 * 1000   // Claim höchstens alle 5 min auffrischen

export default function DeviceScanController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)   // verhindert überlappende Ticks in DIESER Instanz

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadDeviceScanSchedule() } catch { return }
    const now = Date.now()
    const cfg = await getScanSchedule('device-scan')
    if (!isConfiguredDue(cfg, s.lastRunAt, now)) return
    if (isDeviceScanClaimed(s, now)) return   // andere Instanz scannt gerade

    busy.current = true
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    const claim = { by: claimToken, at: new Date().toISOString() }
    try { await saveDeviceScanSchedule({ ...s, running: claim }) } catch { busy.current = false; return }
    // Kurz gegenlesen: hat eine andere Instanz zuletzt geclaimt, treten wir zurück.
    try {
      const check = await loadDeviceScanSchedule()
      if (check.running && check.running.by !== claimToken) { busy.current = false; return }
    } catch { /* im Zweifel scannen */ }

    let lastBeat = now
    const heartbeat = async () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      try {
        const cur = await loadDeviceScanSchedule()
        if (cur.running?.by === claimToken) {
          await saveDeviceScanSchedule({ ...cur, running: { by: claimToken, at: new Date().toISOString() } })
        }
      } catch { /* nächster Beat versucht es erneut */ }
    }

    const by = user?.displayName || username
    try {
      const res = await runDeviceScan(by, () => { void heartbeat() })
      await saveDeviceScanSchedule({
        lastRunAt: new Date().toISOString(),
        lastResult: 'ok',
        lastSummary: `${res.updated} aktualisiert / ${res.scanned} Geräte`,
        running: undefined,
      })
    } catch {
      // lastRunAt SETZEN, damit kein 20-min-Retry-Storm entsteht — nächster Lauf
      // erst wieder zum nächsten 3-Tage-15:00-Slot.
      try {
        await saveDeviceScanSchedule({
          lastRunAt: new Date().toISOString(),
          lastResult: 'error',
          lastSummary: 'Unerwarteter Fehler beim Geräte-Scan',
          running: undefined,
        })
      } catch { /* egal */ }
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
