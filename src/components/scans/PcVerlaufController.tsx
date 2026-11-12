// ── Hintergrund-Controller: Änderungsverlauf · Proaktive Fehlersuche · Warteliste ──
// Zwei GETRENNTE Scans mit je eigenem Zeitplan (Einstellungen → Automatische Scans):
//   • Änderungsverlauf je PC   (Standard Mo–Fr 10:00)  → src/pcVerlauf
//   • Proaktive Fehlersuche    (Standard Mo–Fr 09:00)  → src/pcFehler
// Beide lesen nur, je höchstens 3 PCs gleichzeitig — und sie laufen nie gleichzeitig:
// Läuft der eine, wartet der andere bis zum nächsten Blick (20 min).
// Muster wie die anderen Scans: Sperre + Herzschlag, Fokus gebündelt, erster Lauf versetzt.
//
// Verpasste Läufe werden nachgeholt. Zusätzlich je Scan einmal am Tag eine Nachlese
// (frühestens 3 Std. später, vor 17 Uhr) nur für PCs, die beim ersten Durchgang aus waren.
//
// Dritter Controller: die Warteliste der Fehlerbehebung — alle 2 Stunden nachsehen, ob
// vorgemerkte PCs wieder online sind (src/pcFehler/warteliste.ts).

import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { getScanSchedule, isConfiguredDue, loadRunStatus, saveRunStatus, isStatusClaimed, claimExclusive } from '../../services/scanSchedules'
import { PC_VERLAUF_ID, PC_VERLAUF_STATUS, runPcVerlaufScan, nachleseFaellig, merkeNachlese, type LaufErgebnis } from '../../pcVerlauf/lesen'
import { PC_FEHLER_ID, PC_FEHLER_STATUS, PC_FEHLER_NACHLESE, runPcFehlerScan } from '../../pcFehler/lauf'
import { WARTELISTE_STATUS, WARTE_ABSTAND_MS, ladeWarteliste, laufWarteliste } from '../../pcFehler/warteliste'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'

const POLL_MS = 20 * 60 * 1000
const HEARTBEAT_MS = 5 * 60 * 1000

interface LaufDef {
  id: string
  status: string
  /** Merkdatei der Nachlese (undefined = Standard des Änderungsverlaufs). */
  nachlese?: string
  /** Solange einer dieser Scans läuft, startet dieser nicht (Netz-Schonung). */
  nichtWaehrend: string[]
  lauf: (by: string, onTick: () => void, nachlese: boolean) => Promise<LaufErgebnis>
  name: string
}
const VERLAUF: LaufDef = { id: PC_VERLAUF_ID, status: PC_VERLAUF_STATUS, nichtWaehrend: [PC_FEHLER_STATUS], lauf: runPcVerlaufScan, name: 'Änderungsverlauf' }
const FEHLER: LaufDef = { id: PC_FEHLER_ID, status: PC_FEHLER_STATUS, nachlese: PC_FEHLER_NACHLESE, nichtWaehrend: [PC_VERLAUF_STATUS], lauf: runPcFehlerScan, name: 'Fehlersuche' }

function herzschlag(pfad: string, token: string): () => void {
  let letzter = Date.now()
  return () => {
    if (Date.now() - letzter < HEARTBEAT_MS) return
    letzter = Date.now()
    void (async () => {
      try { const cur = await loadRunStatus(pfad); if (cur.running?.by === token) await saveRunStatus(pfad, { ...cur, running: { by: token, at: new Date().toISOString() } }) } catch { /* nächster Beat */ }
    })()
  }
}

function useHintergrundLauf(def: LaufDef) {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(def.status) } catch { return }
    if (isStatusClaimed(s)) return
    const cfg = await getScanSchedule(def.id)
    const faellig = isConfiguredDue(cfg, s.lastRunAt)
    const nachlese = !faellig && cfg.enabled && await nachleseFaellig(s.lastRunAt, new Date(), def.nachlese)
    if (!faellig && !nachlese) return
    // Der andere PC-Scan läuft gerade → später noch einmal nachsehen
    for (const p of def.nichtWaehrend) { try { if (isStatusClaimed(await loadRunStatus(p))) return } catch { return } }

    busy.current = true
    const token = `${username}#${Math.random().toString(36).slice(2, 10)}`
    if (!(await claimExclusive(def.status, token, s))) { busy.current = false; return }
    try {
      const res = await def.lauf(user?.displayName || username, herzschlag(def.status, token), nachlese)
      if (nachlese) await merkeNachlese(new Date(), def.nachlese)
      // Die Nachlese verschiebt den Zeitpunkt des Hauptlaufs nicht. Ein wegen gestörtem WinRM
      // abgebrochener Lauf gilt für heute als erledigt — sonst liefe er alle paar Minuten wieder an.
      const erledigt = (res.ok || res.nichtWiederholen) && !nachlese
      await saveRunStatus(def.status, { lastRunAt: erledigt ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      // Auch hier als erledigt vermerken: Ein Fehler, der immer wieder auftritt, darf keinen Dauerlauf auslösen.
      try { await saveRunStatus(def.status, { lastRunAt: nachlese ? s.lastRunAt : new Date().toISOString(), lastResult: 'error', lastSummary: `Unerwarteter Fehler (${def.name}) – nächster Versuch beim nächsten geplanten Lauf`, running: undefined }) } catch { /* egal */ }
      if (nachlese) await merkeNachlese(new Date(), def.nachlese).catch(() => {})
    } finally {
      busy.current = false
    }
  }, [isAdmin, username, user?.displayName, def])

  useEffect(() => {
    if (!username) return
    const startAbbrechen = ersterLaufEntzerrt(() => { void tick() })
    const t = setInterval(() => { void tick() }, POLL_MS)
    const abmelden = onAppFocus(() => { void tick() })
    return () => { clearInterval(t); abmelden(); startAbbrechen() }
  }, [tick, username])
}

export default function PcVerlaufController() { useHintergrundLauf(VERLAUF); return null }
export function PcFehlerController() { useHintergrundLauf(FEHLER); return null }

/** Alle 2 Stunden: Sind PCs von der Warteliste der Fehlerbehebung wieder online? */
export function WartelisteController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const busy = useRef(false)

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    let s
    try { s = await loadRunStatus(WARTELISTE_STATUS) } catch { return }
    if (isStatusClaimed(s)) return
    if (s.lastRunAt && Date.now() - new Date(s.lastRunAt).getTime() < WARTE_ABSTAND_MS) return
    const w = await ladeWarteliste()
    if (!w || !w.wartend.length) return   // nichts vorgemerkt → nichts anpingen, nichts schreiben
    busy.current = true
    const token = `${username}#${Math.random().toString(36).slice(2, 10)}`
    if (!(await claimExclusive(WARTELISTE_STATUS, token, s))) { busy.current = false; return }
    try {
      const res = await laufWarteliste(herzschlag(WARTELISTE_STATUS, token))
      await saveRunStatus(WARTELISTE_STATUS, { lastRunAt: new Date().toISOString(), lastResult: res.ok ? 'success' : 'error', lastSummary: res.summary, running: undefined })
    } catch {
      try { await saveRunStatus(WARTELISTE_STATUS, { lastRunAt: new Date().toISOString(), lastResult: 'error', lastSummary: 'Unerwarteter Fehler in der Warteliste', running: undefined }) } catch { /* egal */ }
    } finally { busy.current = false }
  }, [isAdmin, username])

  useEffect(() => {
    if (!username) return
    const startAbbrechen = ersterLaufEntzerrt(() => { void tick() })
    const t = setInterval(() => { void tick() }, 10 * 60 * 1000)
    const abmelden = onAppFocus(() => { void tick() })
    return () => { clearInterval(t); abmelden(); startAbbrechen() }
  }, [tick, username])
  return null
}
