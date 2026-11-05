// ── Backup-Lauf-Store ────────────────────────────────────────────────────────
// Startet einen Lauf (Admin-PC oder PC-Aufgabe) und verfolgt ihn über die
// status.json/ergebnis.json des Bausteins. Fenster-weites setInterval (überlebt
// Menüwechsel). Robust gegen:
//   - Tool geschlossen/neu gestartet während des Laufs → `fortsetzen` nimmt ihn wieder auf
//   - Prozess abgestürzt / PC neu gestartet → status.json wird nicht mehr aktualisiert
//   - kurz unterbrochene Verbindung (PC-Aufgabe per UNC) → mehrere Fehlversuche erlaubt
// Ergebnis: lastReport (Bericht mit Gründen) am Job + Eintrag im Verlauf.

import { create } from 'zustand'
import {
  starteAdminLauf, startePcAufgabe, liesLaufStand, brecheLaufAb, pruefeErreichbar, pcBasisUnc,
  type LaufHandle, type LaufStatus,
} from '../services/backupEngine'
import { updateJob, recordRun, runAusBericht, stufeZuResult, claimJob, type BackupJob, type LaufInfo } from '../services/backups'
import { bewerteErgebnis, berichtAusFehler, type LaufBericht } from '../services/backupBericht'
import { api } from '../electronAPI'

type Phase = 'idle' | 'starting' | 'pruefen' | 'running' | 'done' | 'warning' | 'error'

interface BackupRunState {
  phase: Phase
  jobId: string
  jobName: string
  art: 'admin' | 'pc' | ''
  host: string
  ordnerNr: number
  ordnerAnzahl: number
  copiedFiles: number
  expectedFiles: number
  expectedBytes: number
  message: string
  hinweis: string          // z. B. „Verbindung kurz weg — warte…"
  bericht?: LaufBericht
  startedAt: number
  abbrechend: boolean
  /** Hochgezählt bei jedem Abschluss — Bildschirme laden daraufhin neu. */
  fertigZaehler: number
  run: (job: BackupJob, opts?: { slot?: string; by?: string; claimed?: boolean }) => Promise<void>
  fortsetzen: (job: BackupJob) => Promise<boolean>
  abbrechen: (von: string) => Promise<void>
  reset: () => void
}

let _poll: ReturnType<typeof setInterval> | null = null
let _handle: LaufHandle | null = null
let _ctx: { job: BackupJob; slot?: string; by: string } | null = null
let _lesefehler = 0
let _pollLaeuft = false

const POLL_MS = 4000
const STALE_MS = 3 * 60_000          // status.json so lange unverändert → Prozess gilt als tot
const ANLAUF_MS = 120_000            // so lange darf es dauern, bis der Lauf eine status.json schreibt
const MAX_LAUF_MS = 24 * 3600_000

let _rechner = ''
export async function eigenerRechner(): Promise<string> {
  if (_rechner) return _rechner
  try { _rechner = ((await api().getHostname()) || '').toUpperCase() } catch { _rechner = '' }
  return _rechner
}

function stop() { if (_poll) { clearInterval(_poll); _poll = null } }

async function finish(roh: LaufBericht) {
  stop()
  const ctx = _ctx, h = _handle
  _handle = null
  const bericht: LaufBericht = { ...roh, art: h?.art }
  const phase: Phase = bericht.stufe === 'ok' ? 'done' : bericht.stufe === 'warnung' ? 'warning' : 'error'
  useBackupRunStore.setState(s => ({ phase, message: bericht.titel, bericht, hinweis: '', abbrechend: false, copiedFiles: Math.max(s.copiedFiles, bericht.kopiert), fertigZaehler: s.fertigZaehler + 1 }))
  if (!ctx) return
  const at = bericht.ende || new Date().toISOString()
  const runId = h?.runId || undefined
  try {
    await updateJob(ctx.job.id, {
      lastRun: at,
      lastResult: stufeZuResult(bericht.stufe), lastMessage: bericht.titel, lastReport: bericht,
      lastRunId: runId, lauf: undefined, wartet: undefined,
    })
    await recordRun(runAusBericht(ctx.job.id, bericht, {
      slot: ctx.slot || (h?.art === 'pc' ? `pc:${runId}` : `manuell:${at}`), runId, by: ctx.by,
      art: ctx.slot ? 'geplant' : h?.art === 'pc' ? 'pc-aufgabe' : 'manuell',
    }))
  } catch { /* best effort */ }
  useBackupRunStore.setState(s => ({ fertigZaehler: s.fertigZaehler + 1 }))
}

function zeigeStatus(st: LaufStatus) {
  const phase: Phase = st.phase === 'pruefen' || st.phase === 'start' ? 'pruefen' : 'running'
  const ordner = st.ordnerAnzahl > 1 ? ` · Ordner ${st.ordnerNr}/${st.ordnerAnzahl}` : ''
  useBackupRunStore.setState(s => ({
    phase: s.abbrechend ? s.phase : phase,
    ordnerNr: st.ordnerNr, ordnerAnzahl: st.ordnerAnzahl,
    copiedFiles: st.aktuell ?? 0, expectedFiles: st.erwartet ?? 0, expectedBytes: st.erwartetBytes ?? 0,
    message: s.abbrechend ? 'Wird abgebrochen…' : (phase === 'pruefen' ? `Prüfe, was zu kopieren ist…${ordner}` : `Kopiert…${ordner}`),
    hinweis: '',
  }))
}

async function pollOnce() {
  if (!_handle || _pollLaeuft) return
  _pollLaeuft = true
  try {
    const h = _handle
    const alter = Date.now() - h.gestartet
    if (alter > MAX_LAUF_MS) { await finish(berichtAusFehler('Lauf dauert länger als 24 Stunden — Verfolgung beendet', 'Prüfen, ob der Backup-Prozess hängt (Protokoll im Lauf-Ordner).')); return }
    const st = await liesLaufStand(h)
    if (_handle !== h) return
    if (!st.lesbar && !st.status && !st.ergebnis) {
      _lesefehler++
      useBackupRunStore.setState({ hinweis: h.art === 'pc' ? `Verbindung zu ${h.host} unterbrochen — versuche weiter (${_lesefehler})…` : 'Lauf-Status nicht lesbar — versuche weiter…' })
      if (_lesefehler > 45) await finish(berichtAusFehler(h.art === 'pc' ? `Verbindung zu ${h.host} verloren` : 'Lauf-Status nicht mehr lesbar', 'Der Lauf läuft evtl. weiter — Ergebnis erscheint beim nächsten Aktualisieren.', st.fehler))
      return
    }
    _lesefehler = 0
    // PC-Aufgabe: runId erst aus der status.json übernehmen (vom Baustein vergeben)
    if (!h.runId && st.status && st.status.start && new Date(st.status.start).getTime() >= h.gestartet - 120_000) {
      h.runId = st.status.runId
      if (_ctx?.job.lauf) {
        _ctx.job = { ..._ctx.job, lauf: { ..._ctx.job.lauf, runId: h.runId } }
        try { await updateJob(_ctx.job.id, { lauf: _ctx.job.lauf }) } catch { /* egal */ }
      }
    }
    if (st.ergebnis && h.runId && st.ergebnis.runId === h.runId) { await finish(bewerteErgebnis(st.ergebnis)); return }
    // Läuft schon ein anderer Lauf desselben Jobs (z. B. geplant)? → diesem folgen
    if (st.status && h.runId && st.status.runId !== h.runId && st.status.phase !== 'fertig' && frisch(st.status)) {
      h.runId = st.status.runId
      useBackupRunStore.setState({ hinweis: 'Es lief bereits ein Lauf dieses Backups — der wird jetzt angezeigt.' })
    }
    if (st.status && h.runId && st.status.runId === h.runId) {
      if (st.status.phase === 'fertig') {
        if (st.ergebnis && st.ergebnis.runId === h.runId) await finish(bewerteErgebnis(st.ergebnis))
        return
      }
      if (!frisch(st.status)) {
        await finish(berichtAusFehler('Der Backup-Prozess wurde unterbrochen',
          h.art === 'pc' ? `Der PC ${h.host} wurde vermutlich neu gestartet/heruntergefahren, oder der Prozess wurde beendet. Einfach erneut ausführen — bereits kopierte Dateien werden übersprungen.`
            : 'Der Admin-PC wurde vermutlich neu gestartet/abgemeldet, oder der Prozess wurde beendet. Einfach erneut ausführen — bereits kopierte Dateien werden übersprungen.',
          st.status.aktualisiert ? `Letztes Lebenszeichen: ${new Date(st.status.aktualisiert).toLocaleString('de-DE')}` : undefined))
        return
      }
      zeigeStatus(st.status)
      return
    }
    if (alter > ANLAUF_MS) {
      await finish(berichtAusFehler('Der Backup-Prozess ist nicht angelaufen',
        h.art === 'pc' ? 'Die PC-Aufgabe hat nicht gestartet. In der Aufgabenplanung des PCs nachsehen oder „PC-Aufgabe neu einrichten".' : 'PowerShell konnte den Lauf nicht starten (Virenschutz/Richtlinie?).'))
    }
  } catch { /* nächster Durchgang */ } finally { _pollLaeuft = false }
}

function frisch(st: LaufStatus): boolean {
  const t = st.aktualisiert ? new Date(st.aktualisiert).getTime() : NaN
  return Number.isFinite(t) && Date.now() - t < STALE_MS
}

function startePolling() {
  stop()
  _lesefehler = 0
  _poll = setInterval(() => { void pollOnce() }, POLL_MS)
  void pollOnce()
}

export const useBackupRunStore = create<BackupRunState>((set, get) => ({
  phase: 'idle',
  jobId: '',
  jobName: '',
  art: '',
  host: '',
  ordnerNr: 0,
  ordnerAnzahl: 0,
  copiedFiles: 0,
  expectedFiles: 0,
  expectedBytes: 0,
  message: '',
  hinweis: '',
  bericht: undefined,
  startedAt: 0,
  abbrechend: false,
  fertigZaehler: 0,

  reset: () => {
    if (_handle) return   // ein laufender Lauf wird nicht verworfen
    stop(); _ctx = null
    set({ phase: 'idle', jobId: '', jobName: '', art: '', host: '', copiedFiles: 0, expectedFiles: 0, expectedBytes: 0, ordnerNr: 0, ordnerAnzahl: 0, message: '', hinweis: '', bericht: undefined, startedAt: 0, abbrechend: false })
  },

  run: async (job, opts) => {
    const p = get().phase
    if (p === 'starting' || p === 'pruefen' || p === 'running') return
    stop(); _handle = null
    const by = opts?.by || ''
    _ctx = { job, slot: opts?.slot, by }
    const startedAt = Date.now()
    set({ phase: 'starting', jobId: job.id, jobName: job.name, art: '', host: job.source.target, copiedFiles: 0, expectedFiles: 0, expectedBytes: 0, ordnerNr: 0, ordnerAnzahl: job.source.folders.length, message: 'Verbindung wird geprüft…', hinweis: '', bericht: undefined, startedAt, abbrechend: false })

    const problem = await pruefeErreichbar(job)
    if (problem) { await finish(berichtAusFehler(problem.titel, problem.hilfe)); return }

    // PC-Aufgabe vorhanden? Dann direkt auf dem PC laufen lassen (lokal, ohne Umweg übers Netz).
    let handle: LaufHandle | undefined
    let fehler = ''
    const pcMoeglich = job.mechanism === 'native' && job.scheduled && !job.nativeFehler
    if (pcMoeglich) {
      set({ message: `Starte die PC-Aufgabe auf ${job.source.target}…` })
      const r = await startePcAufgabe(job)
      if (r.ok) handle = r.handle
      else fehler = r.error || ''
    }
    if (!handle) {
      set({ message: fehler ? `${fehler} Kopiere stattdessen über diesen PC…` : 'Backup wird gestartet…' })
      const r = await starteAdminLauf(job, by)
      if (!r.ok || !r.handle) { await finish(berichtAusFehler(r.error || 'Start fehlgeschlagen.')); return }
      handle = r.handle
    }
    _handle = handle
    set({ art: handle.art, phase: 'pruefen', message: 'Lauf gestartet…' })
    const lauf: LaufInfo = { runId: handle.runId, art: handle.art, rechner: await eigenerRechner(), by, start: new Date(startedAt).toISOString(), slot: opts?.slot }
    _ctx.job = { ...job, lauf }
    // Erst speichern, dann verfolgen — sonst könnte dieser Eintrag bei einem sehr
    // schnellen Lauf NACH dem Ergebnis landen und den Job auf „läuft…" festnageln.
    try {
      if (!opts?.claimed) await updateJob(job.id, { lauf, lastResult: 'running', lastMessage: 'läuft…', wartet: undefined })
      else await updateJob(job.id, { lauf })
    } catch { /* Verfolgung läuft trotzdem */ }
    startePolling()
  },

  /** Einen Lauf wieder aufnehmen, der von diesem PC gestartet wurde (Tool war geschlossen). */
  fortsetzen: async (job) => {
    const p = get().phase
    if (p === 'starting' || p === 'pruefen' || p === 'running' || !job.lauf) return false
    const l = job.lauf
    _ctx = { job, slot: l.slot, by: l.by }
    _handle = {
      art: l.art, jobId: job.id, runId: l.runId, host: job.source.target,
      basisLesen: l.art === 'pc' ? pcBasisUnc(job) : '', gestartet: new Date(l.start).getTime() || Date.now(),
    }
    set({ phase: 'running', jobId: job.id, jobName: job.name, art: l.art, host: job.source.target, copiedFiles: 0, expectedFiles: 0, expectedBytes: 0, message: 'Lauf wird wieder aufgenommen…', hinweis: '', bericht: undefined, startedAt: _handle.gestartet, abbrechend: false })
    startePolling()
    return true
  },

  abbrechen: async (von) => {
    if (!_handle) return
    set({ abbrechend: true, message: 'Wird abgebrochen…' })
    const ok = await brecheLaufAb(_handle, von)
    if (!ok) set({ abbrechend: false, hinweis: 'Abbruch-Signal konnte nicht gesetzt werden — erneut versuchen.' })
  },
}))

/** Läuft gerade ein Lauf (für Knöpfe/Scheduler)? */
export function backupLaeuft(): boolean {
  const p = useBackupRunStore.getState().phase
  return p === 'starting' || p === 'pruefen' || p === 'running'
}

export { claimJob }
