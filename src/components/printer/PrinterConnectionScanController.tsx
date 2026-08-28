// ── Drucker-Verbindungs-Scan: Auto-Scheduler ─────────────────────────────────
// Führt den Verbindungs-Scan (welcher Computer/Benutzer hat welchen Drucker)
// automatisch alle 2 Wochen FREITAGS 14:00 im HINTERGRUND aus — ohne UI, ohne
// Bestätigung. Läuft, solange irgendeine berechtigte Tool-Instanz offen ist;
// verpasste Läufe werden nachgeholt, sobald wieder eine Instanz online kommt.
// Muster: SoftwareScanController (Token-Claim + Heartbeat), Fälligkeit aber
// kalenderbasiert (isConnScanDue).

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import {
  loadConnSchedule, saveConnSchedule, isConnClaimed, runConnectionScanOnce,
} from '../../services/printerConnections'
import { getScanSchedule, isConfiguredDue } from '../../services/scanSchedules'

const POLL_MS = 20 * 60 * 1000       // alle 20 min prüfen, ob ein Lauf fällig ist
const HEARTBEAT_MS = 5 * 60 * 1000   // Claim höchstens alle 5 min auffrischen

export default function PrinterConnectionScanController() {
  const username = useAuthStore(s => s.session?.user?.username) || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadConnSchedule() } catch { return }
    const now = Date.now()
    const cfg = await getScanSchedule('printer-connections')
    if (!isConfiguredDue(cfg, s.lastRunAt, now)) return
    if (isConnClaimed(s, now)) return   // andere Instanz scannt gerade

    busy.current = true
    // Eindeutiges Claim-Token je Instanz (username + Nonce), damit das Gegenlesen
    // zwei Instanzen desselben Admins unterscheiden kann.
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    try { await saveConnSchedule({ ...s, running: { by: claimToken, at: new Date().toISOString() } }) } catch { busy.current = false; return }
    // Kein CAS auf dem Netzlaufwerk verfügbar → TOCTOU-Fenster mit randomisiertem
    // Backoff verkleinern: kurz warten, DANN gegenlesen. Gewinnt eine andere
    // Instanz das Rennen (ihr Claim steht zuletzt), treten wir zurück.
    await new Promise(r => setTimeout(r, 300 + Math.floor(Math.random() * 700)))
    try {
      const check = await loadConnSchedule()
      if (check.running && check.running.by !== claimToken) { busy.current = false; return }
    } catch { /* im Zweifel scannen */ }

    let lastBeat = now
    const heartbeat = async () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      try {
        const cur = await loadConnSchedule()
        if (cur.running?.by === claimToken) await saveConnSchedule({ ...cur, running: { by: claimToken, at: new Date().toISOString() } })
      } catch { /* nächster Beat versucht es erneut */ }
    }

    try {
      const res = await runConnectionScanOnce(username, heartbeat)
      // lastRunAt NUR bei Erfolg fortschreiben — ein transienter Fehler (Netz/
      // Inventar kurz weg) darf den Biweekly-Slot nicht „verbrauchen"; Claim aber
      // freigeben, damit der 20-min-Poll es erneut versucht.
      await saveConnSchedule({
        lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt,
        lastResult: res.ok ? 'success' : 'error',
        lastSummary: res.ok
          ? `${res.withPrinters} PCs mit Druckern / ${res.online} online / ${res.candidates} Computer`
          : (res.reason || 'Fehler'),
        running: undefined,
      })
    } catch {
      // Unerwarteter Fehler: lastRunAt setzen, damit kein Retry-Storm entsteht
      // (nächster regulärer Lauf erst wieder am nächsten Biweekly-Freitag-Slot).
      try { await saveConnSchedule({ lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: 'Unerwarteter Fehler beim Verbindungs-Scan', running: undefined }) } catch { /* egal */ }
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
