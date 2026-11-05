// ── Back-Up-Jobs – zentrale Registry ─────────────────────────────────────────
// Alle Backup-Jobs liegen zentral auf dem Netzlaufwerk (fuer alle App-Nutzer):
//   backups/jobs.json     → { version, jobs: BackupJob[] }
//   backups/run_log.json  → Verlauf aller Laeufe (manuell, geplant, PC-Aufgabe) inkl. Bericht
//
// Zeitplan-Motor = Hybrid:
//   - Ziel lokal (gleicher PC)  → native Windows-Aufgabe auf dem PC (mechanism 'native')
//   - Ziel im Netzwerk          → tool-getriggert; ein Controller holt faellige/
//                                 verpasste Jobs nach (mechanism 'tool')
// Zugriffe aufs Netzlaufwerk laufen ueber die asynchronen IPC-Wege (blockieren das
// Fenster nicht, siehe ui_ruckeln_ursachen).

import { api } from '../electronAPI'
import type { LaufBericht, BerichtStufe } from './backupBericht'
import type { ChironJobDaten } from './chironBackup'

// ── Datenmodell ───────────────────────────────────────────────────────────────

export interface BackupSource {
  target: string          // Quell-PC (Hostname oder IP)
  drive: string           // Laufwerksbuchstabe ohne ':' (z. B. 'C')
  folders: string[]       // vollstaendige Pfade auf dem Laufwerk (z. B. 'C:\\Users\\x\\Documents')
}

export interface BackupDest {
  kind: 'local' | 'network'   // gleicher PC | anderer PC/Server
  target?: string             // bei 'network': Ziel-PC (Hostname/IP)
  drive: string               // Laufwerksbuchstabe ohne ':'
  path: string                // vollstaendiger Zielordner (z. B. 'D:\\Backups\\PC01')
}

export interface BackupSchedule {
  type: 'once' | 'recurring'
  time: string                // 'HH:MM'
  date?: string               // 'YYYY-MM-DD' (nur bei 'once')
  days?: number[]             // 0=So..6=Sa (nur bei 'recurring' + repeat 'weekly')
  repeat?: 'daily' | 'weekly' // nur bei 'recurring'
}

export type BackupMechanism = 'native' | 'tool'
export type BackupLastResult = 'success' | 'warning' | 'error' | 'running' | 'waiting'

/** Ein gerade laufender Lauf — damit ein neu gestartetes Tool ihn wieder aufnimmt
 *  und andere Admins sehen, wo er läuft. */
export interface LaufInfo {
  runId: string
  art: 'admin' | 'pc'         // admin = Hintergrundprozess auf dem Admin-PC, pc = PC-Aufgabe
  rechner: string             // Admin-PC, der den Lauf gestartet hat/verfolgt
  by: string
  start: string               // ISO
  slot?: string               // geplanter Zeitpunkt (bei Zeitplan-Läufen)
}

export interface BackupJob {
  id: string
  name: string
  /** 'chiron' = Kachel „Chiron Backup" (Sync läuft als Aufgabe auf w3294, siehe chironBackup.ts).
   *  Nicht gesetzt = normales Backup — dafür ändert sich nichts. */
  art?: 'standard' | 'chiron'
  chiron?: ChironJobDaten
  source: BackupSource
  dest: BackupDest
  mirror: boolean             // /MIR (loescht im Ziel entfernte Dateien) — Standard false
  scheduled: boolean          // false = nur manuell ('Jetzt ausfuehren')
  schedule?: BackupSchedule
  planSeit?: string           // ISO — ab wann der aktuelle Zeitplan gilt (frühere Slots nie nachholen)
  mechanism: BackupMechanism  // abgeleitet: dest.kind 'local' → 'native', sonst 'tool'
  nativeTaskName?: string     // Name der Windows-Aufgabe (bei mechanism 'native')
  nativeFehler?: string       // letzter Fehler beim Einrichten der PC-Aufgabe (leer = ok)
  status: 'active' | 'paused'
  createdBy: string
  createdAt: string
  updatedAt?: string
  lastRun?: string            // ISO
  lastResult?: BackupLastResult
  lastMessage?: string
  lastReport?: LaufBericht    // Bericht des letzten Laufs (Gründe, Zahlen, Protokolle)
  lastRunId?: string          // zuletzt ausgewerteter Lauf (Dedup PC-Aufgabe)
  lauf?: LaufInfo
  wartet?: { slot: string; seit: string; grund: string }   // geplanter Lauf wartet auf den PC
  nextDue?: string            // ISO – naechster geplanter Lauf (informativ)
}

interface JobStore { version: number; jobs: BackupJob[] }

export interface RunLogEntry {
  jobId: string
  slot: string                // geplanter Slot (ISO) bzw. 'manuell:<ISO>' / 'pc:<runId>'
  runId?: string
  at: string
  by: string
  result: 'success' | 'warning' | 'error'
  message?: string
  art?: 'manuell' | 'geplant' | 'pc-aufgabe'
  rechner?: string
  kopiert?: number
  fehlgeschlagen?: number
  bytes?: number
  dauerSek?: number
  gruende?: string[]          // Kurzfassung der Gründe (max. 3)
}
interface RunLog { version: number; runs: RunLogEntry[] }

const JOBS_FILE = 'backups/jobs.json'
const RUNLOG_FILE = 'backups/run_log.json'

// Jobs, deren geplanter Zeitpunkt laenger als das zurueckliegt, werden NICHT mehr
// nachgeholt (verhindert eine Flut nach langer Tool-Abwesenheit).
export const CATCHUP_CAP_DAYS = 14

export function newId(prefix = 'bk'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ── Laden / Speichern / Normalisieren ─────────────────────────────────────────

const RESULTS: BackupLastResult[] = ['success', 'warning', 'error', 'running', 'waiting']

function normalizeJob(j: Partial<BackupJob>): BackupJob {
  const dest = (j.dest ?? {}) as Partial<BackupDest>
  const src = (j.source ?? {}) as Partial<BackupSource>
  const kind: 'local' | 'network' = dest.kind === 'network' ? 'network' : 'local'
  return {
    id: j.id ?? newId(),
    name: j.name ?? 'Backup',
    ...(j.art === 'chiron' ? { art: 'chiron' as const, chiron: j.chiron } : {}),
    source: {
      target: (src.target ?? '').trim(),
      drive: (src.drive ?? 'C').replace(/[:$\\]/g, '').toUpperCase().slice(0, 1) || 'C',
      folders: Array.isArray(src.folders) ? src.folders.filter(f => typeof f === 'string' && f.trim()) : [],
    },
    dest: {
      kind,
      target: (dest.target ?? '').trim(),
      drive: (dest.drive ?? 'C').replace(/[:$\\]/g, '').toUpperCase().slice(0, 1) || 'C',
      path: dest.path ?? '',
    },
    mirror: j.mirror === true,
    scheduled: j.scheduled === true,
    schedule: j.schedule,
    planSeit: j.planSeit,
    mechanism: kind === 'local' ? 'native' : 'tool',
    nativeTaskName: j.nativeTaskName,
    nativeFehler: j.nativeFehler || undefined,
    status: j.status === 'paused' ? 'paused' : 'active',
    createdBy: j.createdBy ?? '',
    createdAt: j.createdAt ?? new Date().toISOString(),
    updatedAt: j.updatedAt,
    lastRun: j.lastRun,
    lastResult: j.lastResult && RESULTS.includes(j.lastResult) ? j.lastResult : undefined,
    lastMessage: j.lastMessage,
    lastReport: j.lastReport,
    lastRunId: j.lastRunId,
    lauf: j.lauf && j.lauf.runId !== undefined ? j.lauf : undefined,
    wartet: j.wartet,
    nextDue: j.nextDue,
  }
}

async function loadStore(): Promise<JobStore | null> {
  try {
    const d = await api().netReadJsonAsync<JobStore>(JOBS_FILE)
    if (!d || !Array.isArray(d.jobs)) return { version: 1, jobs: [] }
    return { version: d.version ?? 1, jobs: d.jobs.map(normalizeJob) }
  } catch { return null }
}
async function saveStore(s: JobStore): Promise<boolean> {
  try { return await api().netWriteJsonAsync(JOBS_FILE, s) } catch { return false }
}

const NICHT_GESPEICHERT = 'Netzlaufwerk nicht erreichbar — Änderung wurde nicht gespeichert.'

export async function listJobs(): Promise<BackupJob[]> {
  const s = await loadStore()
  if (!s) throw new Error('Netzlaufwerk nicht erreichbar — Back-Ups konnten nicht geladen werden.')
  return s.jobs.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
}

export async function getJob(id: string): Promise<BackupJob | null> {
  const s = await loadStore()
  return s?.jobs.find(j => j.id === id) ?? null
}

export async function createJob(job: BackupJob): Promise<{ ok: boolean; error?: string }> {
  const s = await loadStore()
  if (!s) return { ok: false, error: NICHT_GESPEICHERT }
  s.jobs.push(normalizeJob(job))
  return (await saveStore(s)) ? { ok: true } : { ok: false, error: NICHT_GESPEICHERT }
}

export async function updateJob(id: string, patch: Partial<BackupJob>): Promise<{ ok: boolean; error?: string }> {
  const s = await loadStore()
  if (!s) return { ok: false, error: NICHT_GESPEICHERT }
  const i = s.jobs.findIndex(j => j.id === id)
  if (i < 0) return { ok: false, error: 'Back-Up nicht gefunden (evtl. von jemand anderem gelöscht).' }
  s.jobs[i] = normalizeJob({ ...s.jobs[i], ...patch, id: s.jobs[i].id, updatedAt: new Date().toISOString() })
  return (await saveStore(s)) ? { ok: true } : { ok: false, error: NICHT_GESPEICHERT }
}

export async function deleteJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const s = await loadStore()
  if (!s) return { ok: false, error: NICHT_GESPEICHERT }
  s.jobs = s.jobs.filter(j => j.id !== id)
  return (await saveStore(s)) ? { ok: true } : { ok: false, error: NICHT_GESPEICHERT }
}

/**
 * Lauf für sich beanspruchen (zwei offene Tools sollen denselben Slot nicht doppelt
 * starten): nur wenn kein anderer frischer Lauf eingetragen ist. Danach kurz warten und
 * nachlesen — steht dann noch unsere runId drin, gehört der Lauf uns.
 */
export async function claimJob(id: string, lauf: LaufInfo, extra: Partial<BackupJob> = {}): Promise<boolean> {
  const s = await loadStore()
  if (!s) return false
  const j = s.jobs.find(x => x.id === id)
  if (!j) return false
  if (j.lauf && j.lauf.runId !== lauf.runId && Date.now() - new Date(j.lauf.start).getTime() < 12 * 3600_000) return false
  const r = await updateJob(id, { ...extra, lauf, lastResult: 'running', lastMessage: 'läuft…', wartet: undefined })
  if (!r.ok) return false
  await new Promise(res => setTimeout(res, 1500 + Math.random() * 1500))
  const nach = await getJob(id)
  return nach?.lauf?.runId === lauf.runId
}

// ── Verlauf ───────────────────────────────────────────────────────────────────

async function loadRunLog(): Promise<RunLog> {
  try {
    const d = await api().netReadJsonAsync<RunLog>(RUNLOG_FILE)
    if (!d || !Array.isArray(d.runs)) return { version: 1, runs: [] }
    return { version: d.version ?? 1, runs: d.runs }
  } catch { return { version: 1, runs: [] } }
}
export async function hasRun(jobId: string, slotIso: string): Promise<boolean> {
  const log = await loadRunLog()
  return log.runs.some(r => r.jobId === jobId && r.slot === slotIso)
}
/** Verlauf ergänzen (doppelte runIds werden ignoriert). */
export async function recordRun(entry: RunLogEntry): Promise<void> {
  await recordRuns([entry])
}
export async function recordRuns(entries: RunLogEntry[]): Promise<void> {
  if (!entries.length) return
  const log = await loadRunLog()
  const da = new Set(log.runs.filter(r => r.runId).map(r => `${r.jobId}|${r.runId}`))
  let neu = 0
  for (const e of entries) {
    if (e.runId && da.has(`${e.jobId}|${e.runId}`)) continue
    log.runs.push(e); neu++
    if (e.runId) da.add(`${e.jobId}|${e.runId}`)
  }
  if (!neu) return
  log.runs.sort((a, b) => a.at.localeCompare(b.at))
  if (log.runs.length > 1000) log.runs = log.runs.slice(-1000)
  try { await api().netWriteJsonAsync(RUNLOG_FILE, log) } catch { /* best effort */ }
}
export async function listRuns(jobId?: string, limit = 20): Promise<RunLogEntry[]> {
  const log = await loadRunLog()
  return log.runs.filter(r => !jobId || r.jobId === jobId).slice(-limit).reverse()
}

/** Verlaufseintrag aus einem Bericht. */
export function runAusBericht(jobId: string, b: LaufBericht, x: { slot: string; runId?: string; by: string; art: RunLogEntry['art'] }): RunLogEntry {
  return {
    jobId, slot: x.slot, runId: x.runId, at: b.ende || new Date().toISOString(), by: x.by,
    result: stufeZuResult(b.stufe), message: b.titel, art: x.art, rechner: b.rechner,
    kopiert: b.kopiert, fehlgeschlagen: b.fehlgeschlagen, bytes: b.bytesKopiert, dauerSek: b.dauerSek,
    gruende: b.gruende.slice(0, 3).map(g => g.anzahl > 1 ? `${g.titel} (${g.anzahl}×)` : g.titel),
  }
}
export function stufeZuResult(s: BerichtStufe): 'success' | 'warning' | 'error' {
  return s === 'ok' ? 'success' : s === 'warnung' ? 'warning' : 'error'
}

// ── Zeitplan-Mathematik ───────────────────────────────────────────────────────

function hmToParts(time: string): { h: number; m: number } {
  const [h, m] = (time || '00:00').split(':').map(n => parseInt(n, 10))
  return { h: isNaN(h) ? 0 : h, m: isNaN(m) ? 0 : m }
}

/** Letzter geplanter Zeitpunkt <= `now` (oder null, wenn keiner in der Vergangenheit). */
export function latestDueSlot(schedule: BackupSchedule | undefined, now: Date): Date | null {
  if (!schedule) return null
  const { h, m } = hmToParts(schedule.time)
  if (schedule.type === 'once') {
    if (!schedule.date) return null
    const [y, mo, d] = schedule.date.split('-').map(n => parseInt(n, 10))
    const slot = new Date(y, (mo || 1) - 1, d || 1, h, m, 0, 0)
    return slot.getTime() <= now.getTime() ? slot : null
  }
  // recurring
  if (schedule.repeat === 'weekly') {
    const days = (schedule.days && schedule.days.length) ? schedule.days : [1] // Standard Montag
    // Von heute rueckwaerts bis zu 7 Tage nach dem letzten passenden Tag suchen
    for (let back = 0; back < 8; back++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m, 0, 0)
      if (days.includes(d.getDay()) && d.getTime() <= now.getTime()) return d
    }
    return null
  }
  // daily
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0)
  if (today.getTime() <= now.getTime()) return today
  const yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, h, m, 0, 0)
  return yest
}

/** Naechster geplanter Zeitpunkt strikt nach `after`. */
export function nextSlotAfter(schedule: BackupSchedule | undefined, after: Date): Date | null {
  if (!schedule) return null
  const { h, m } = hmToParts(schedule.time)
  if (schedule.type === 'once') {
    if (!schedule.date) return null
    const [y, mo, d] = schedule.date.split('-').map(n => parseInt(n, 10))
    const slot = new Date(y, (mo || 1) - 1, d || 1, h, m, 0, 0)
    return slot.getTime() > after.getTime() ? slot : null
  }
  if (schedule.repeat === 'weekly') {
    const days = (schedule.days && schedule.days.length) ? schedule.days : [1]
    for (let fwd = 0; fwd < 8; fwd++) {
      const d = new Date(after.getFullYear(), after.getMonth(), after.getDate() + fwd, h, m, 0, 0)
      if (days.includes(d.getDay()) && d.getTime() > after.getTime()) return d
    }
    return null
  }
  const today = new Date(after.getFullYear(), after.getMonth(), after.getDate(), h, m, 0, 0)
  if (today.getTime() > after.getTime()) return today
  return new Date(after.getFullYear(), after.getMonth(), after.getDate() + 1, h, m, 0, 0)
}

/**
 * Ist ein (tool-getriggerter) Job jetzt faellig? Liefert den auszufuehrenden Slot
 * zurueck (ISO) oder null. Beruecksichtigt Nachhol-Logik + Cap.
 * Slots VOR dem Einrichten des Zeitplans zählen nicht (Bug bis 11/2026: ein neuer
 * täglicher Job um 20:00 lief sofort beim Speichern, weil „gestern 20:00" fällig war).
 */
export function dueSlot(job: BackupJob, now: Date): string | null {
  if (!job.scheduled || job.status !== 'active' || job.mechanism !== 'tool') return null
  const slot = latestDueSlot(job.schedule, now)
  if (!slot) return null
  // Cap: zu alte verpasste Slots nicht mehr nachholen
  const ageDays = (now.getTime() - slot.getTime()) / 86400000
  if (ageDays > CATCHUP_CAP_DAYS) return null
  const seit = new Date(job.planSeit || job.createdAt).getTime()
  if (Number.isFinite(seit) && slot.getTime() < seit - 60_000 && job.schedule?.type !== 'once') return null
  // Bereits fuer diesen Slot gelaufen?
  if (job.lastRun && new Date(job.lastRun).getTime() >= slot.getTime() && job.lastResult !== 'waiting') return null
  if (job.lauf) return null
  return slot.toISOString()
}

/** Nächster geplanter Lauf (für die Karte). */
export function naechsterLauf(job: BackupJob, now = new Date()): Date | null {
  if (!job.scheduled || job.status !== 'active') return null
  return nextSlotAfter(job.schedule, now)
}

/** Zeitplan zweier Jobs gleich? (planSeit nur bei Änderung neu setzen) */
export function gleicherPlan(a?: BackupSchedule, b?: BackupSchedule): boolean {
  if (!a || !b) return !a && !b
  return a.type === b.type && a.time === b.time && (a.date || '') === (b.date || '') && (a.repeat || '') === (b.repeat || '')
    && JSON.stringify([...(a.days ?? [])].sort()) === JSON.stringify([...(b.days ?? [])].sort())
}
