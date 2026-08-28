// ── Drucker-IP-Scan-Controller ───────────────────────────────────────────────
// Startet den täglichen (15:00 Uhr) Drucker-IP-Scan im Hintergrund, sobald ein
// berechtigtes IT-Tool läuft — unabhängig vom aktuellen Menüpunkt (Nachhol-Logik).
// Muster: BackupSchedulerController (tick auf Mount + Intervall + Fokus).

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { loadIpScanSchedule, saveIpScanSchedule, runPrinterIpScan } from '../../services/printerIpScan'
import { getScanSchedule, isConfiguredDue, latestWeeklySlot } from '../../services/scanSchedules'

const POLL_MS = 10 * 60 * 1000

export default function PrinterIpScanController() {
  const username = useAuthStore(s => s.session?.user?.username) || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    const now = new Date()
    let s
    try { s = await loadIpScanSchedule() } catch { return }
    const cfg = await getScanSchedule('printer-ip')
    if (!isConfiguredDue(cfg, s.lastRunAt, now.getTime())) return
    busy.current = true
    const slot = latestWeeklySlot(now, cfg.days, cfg.time) ?? now
    // Optimistischer Guard: Slot vormerken, damit ein zweites offenes Tool nicht
    // denselben Slot nochmal scannt.
    try { await saveIpScanSchedule({ lastRunAt: slot.toISOString(), lastResult: 'running' }) } catch { /* egal */ }
    try {
      const r = await runPrinterIpScan(username)
      await saveIpScanSchedule({ lastRunAt: new Date().toISOString(), lastResult: 'ok', lastSummary: `${r.updated}/${r.scanned} Drucker-IPs aktualisiert` })
    } catch (e) {
      await saveIpScanSchedule({ lastRunAt: slot.toISOString(), lastResult: 'error', lastSummary: e instanceof Error ? e.message : String(e) })
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
