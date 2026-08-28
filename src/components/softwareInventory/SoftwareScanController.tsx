// ── Software-Inventar: Auto-Scan-Controller ──────────────────────────────────
// Führt den Software-Scan automatisch alle 72h im HINTERGRUND aus — ohne UI,
// ohne Bestätigung. Läuft, solange irgendeine berechtigte Tool-Instanz offen
// ist; verpasste Läufe werden nachgeholt, sobald wieder eine Instanz online
// kommt (Fälligkeit = now - lastRunAt >= 72h, zentral in scan_schedule.json).
// Muster: BackupSchedulerController (tick auf Mount + Intervall + Fokus).
//
// Instanzübergreifende Best-Effort-Sperre: vor dem Lauf wird `running` gesetzt;
// andere Instanzen überspringen einen aktiven (nicht veralteten) Claim.

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import {
  loadSchedule, saveSchedule, isClaimed, runAutoScanOnce,
} from '../../services/softwareInventoryScan'
import { getScanSchedule, isConfiguredDue } from '../../services/scanSchedules'

const POLL_MS = 20 * 60 * 1000       // alle 20 min prüfen, ob ein Lauf fällig ist
const HEARTBEAT_MS = 5 * 60 * 1000   // Claim höchstens alle 5 min auffrischen

export default function SoftwareScanController() {
  const username = useAuthStore(s => s.session?.user?.username) || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)   // verhindert überlappende Ticks in DIESER Instanz

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadSchedule() } catch { return }
    const now = Date.now()
    const cfg = await getScanSchedule('software-inventory')
    if (!isConfiguredDue(cfg, s.lastRunAt, now)) return
    if (isClaimed(s, now)) return   // andere Instanz scannt gerade

    busy.current = true
    // Eindeutiges Claim-Token pro Instanz: username + Zufalls-Nonce. Nur so kann
    // das Gegenlesen zwei Instanzen desselben Admins auseinanderhalten (sonst
    // hätten beide by===username und beide würden scannen → Doppellauf).
    const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
    const claim = { by: claimToken, at: new Date().toISOString() }
    try { await saveSchedule({ ...s, running: claim }) } catch { busy.current = false; return }
    // Kurz gegenlesen: hat eine andere Instanz zuletzt geclaimt, treten wir zurück.
    try {
      const check = await loadSchedule()
      if (check.running && check.running.by !== claimToken) { busy.current = false; return }
    } catch { /* weiter — im Zweifel lieber scannen als gar nicht */ }

    // Heartbeat: hält den Claim während langer Läufe frisch, damit ihn keine
    // andere Instanz für „veraltet" hält und parallel startet. Nur schreiben,
    // solange wir den Claim noch besitzen; auf HEARTBEAT_MS gedrosselt.
    let lastBeat = now
    const heartbeat = async () => {
      if (Date.now() - lastBeat < HEARTBEAT_MS) return
      lastBeat = Date.now()
      try {
        const cur = await loadSchedule()
        if (cur.running?.by === claimToken) {
          await saveSchedule({ ...cur, running: { by: claimToken, at: new Date().toISOString() } })
        }
      } catch { /* egal — nächster Beat versucht es erneut */ }
    }

    try {
      const res = await runAutoScanOnce(undefined, heartbeat)
      await saveSchedule({
        lastRunAt: new Date().toISOString(),
        lastResult: res.ok ? 'success' : 'error',
        lastSummary: res.ok
          ? `${res.updated} aktualisiert / ${res.online} online / ${res.candidates} fällig`
          : (res.reason || 'Fehler'),
        running: undefined,
      })
    } catch {
      // Unerwarteter Fehler: lastRunAt SETZEN, damit die Fälligkeit zurückgesetzt
      // wird und nicht alle 20 min ein Retry-Storm entsteht — nächster regulärer
      // Lauf erst wieder nach dem 72h-Intervall.
      try {
        await saveSchedule({
          lastRunAt: new Date().toISOString(),
          lastResult: 'error',
          lastSummary: 'Unerwarteter Fehler beim Auto-Scan',
          running: undefined,
        })
      } catch { /* egal */ }
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
