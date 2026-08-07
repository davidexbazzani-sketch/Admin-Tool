// ── Back-Up-Jobs – zentrale Registry ─────────────────────────────────────────
// Alle Backup-Jobs liegen zentral auf dem Netzlaufwerk (fuer alle App-Nutzer):
//   backups/jobs.json     → { version, jobs: BackupJob[] }
//   backups/run_log.json  → ausgefuehrte Laeufe (Dedup, damit zwei offene Tools
//                            bzw. eine spaete Nachhol-Ausfuehrung nicht doppelt starten)
//
// Zeitplan-Motor = Hybrid:
//   - Ziel lokal (gleicher PC)  → native Windows-Aufgabe auf dem PC (mechanism 'native')
//   - Ziel im Netzwerk          → tool-getriggert; ein Controller holt faellige/
//                                 verpasste Jobs nach (mechanism 'tool')

import { api } from '../electronAPI'

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

export interface BackupJob {
  id: string
  name: string
  source: BackupSource
  dest: BackupDest
  mirror: boolean             // /MIR (loescht im Ziel entfernte Dateien) — Standard false
  scheduled: boolean          // false = nur manuell ('Jetzt ausfuehren')
  schedule?: BackupSchedule
  mechanism: BackupMechanism  // abgeleitet: dest.kind 'local' → 'native', sonst 'tool'
  nativeTaskName?: string     // Name der Windows-Aufgabe (bei mechanism 'native')
  status: 'active' | 'paused'
  createdBy: string
  createdAt: string
  updatedAt?: string
  lastRun?: string            // ISO
  lastResult?: 'success' | 'error' | 'running'
  lastMessage?: string
  nextDue?: string            // ISO – naechster geplanter Lauf (informativ)
}

interface JobStore { version: number; jobs: BackupJob[] }

export interface RunLogEntry { jobId: string; slot: string; at: string; by: string; result: 'success' | 'error'; message?: string }
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

function normalizeJob(j: Partial<BackupJob>): BackupJob {
  const dest = (j.dest ?? {}) as Partial<BackupDest>
  const src = (j.source ?? {}) as Partial<BackupSource>
  const kind: 'local' | 'network' = dest.kind === 'network' ? 'network' : 'local'
  return {
    id: j.id ?? newId(),
    name: j.name ?? 'Backup',
    source: {
      target: src.target ?? '',
      drive: (src.drive ?? 'C').replace(/[:$\\]/g, '').toUpperCase().slice(0, 1) || 'C',
      folders: Array.isArray(src.folders) ? src.folders.filter(f => typeof f === 'string' && f.trim()) : [],
    },
    dest: {
      kind,
      target: dest.target ?? '',
      drive: (dest.drive ?? 'C').replace(/[:$\\]/g, '').toUpperCase().slice(0, 1) || 'C',
      path: dest.path ?? '',
    },
    mirror: j.mirror === true,
    scheduled: j.scheduled === true,
    schedule: j.schedule,
    mechanism: kind === 'local' ? 'native' : 'tool',
    nativeTaskName: j.nativeTaskName,
    status: j.status === 'paused' ? 'paused' : 'active',
    createdBy: j.createdBy ?? '',
    createdAt: j.createdAt ?? new Date().toISOString(),
    updatedAt: j.updatedAt,
    lastRun: j.lastRun,
    lastResult: j.lastResult,
    lastMessage: j.lastMessage,
    nextDue: j.nextDue,
  }
}

async function loadStore(): Promise<JobStore> {
  try {
    const d = await api().netReadJson<JobStore>(JOBS_FILE)
    if (!d || !Array.isArray(d.jobs)) return { version: 1, jobs: [] }
    return { version: d.version ?? 1, jobs: d.jobs.map(normalizeJob) }
  } catch { return { version: 1, jobs: [] } }
}
async function saveStore(s: JobStore): Promise<boolean> {
  try { return await api().netWriteJson(JOBS_FILE, s) } catch { return false }
}

export async function listJobs(): Promise<BackupJob[]> {
  const s = await loadStore()
  return s.jobs.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
}

export async function createJob(job: BackupJob): Promise<{ ok: boolean; error?: string }> {
  const s = await loadStore()
  s.jobs.push(normalizeJob(job))
  return { ok: await saveStore(s), error: undefined }
}

export async function updateJob(id: string, patch: Partial<BackupJob>): Promise<{ ok: boolean; error?: string }> {
  const s = await loadStore()
  const i = s.jobs.findIndex(j => j.id === id)
  if (i < 0) return { ok: false, error: 'Job nicht gefunden' }
  s.jobs[i] = normalizeJob({ ...s.jobs[i], ...patch, id: s.jobs[i].id, updatedAt: new Date().toISOString() })
  return { ok: await saveStore(s) }
}

export async function deleteJob(id: string): Promise<{ ok: boolean; error?: string }> {
  const s = await loadStore()
  s.jobs = s.jobs.filter(j => j.id !== id)
  return { ok: await saveStore(s) }
}

// ── Run-Log (Dedup ausgefuehrter Slots) ───────────────────────────────────────

async function loadRunLog(): Promise<RunLog> {
  try {
    const d = await api().netReadJson<RunLog>(RUNLOG_FILE)
    if (!d || !Array.isArray(d.runs)) return { version: 1, runs: [] }
    return { version: d.version ?? 1, runs: d.runs }
  } catch { return { version: 1, runs: [] } }
}
export async function hasRun(jobId: string, slotIso: string): Promise<boolean> {
  const log = await loadRunLog()
  return log.runs.some(r => r.jobId === jobId && r.slot === slotIso)
}
export async function recordRun(entry: RunLogEntry): Promise<void> {
  const log = await loadRunLog()
  log.runs.push(entry)
  // Nur die letzten 500 Laeufe behalten
  if (log.runs.length > 500) log.runs = log.runs.slice(-500)
  try { await api().netWriteJson(RUNLOG_FILE, log) } catch { /* best effort */ }
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
 */
export function dueSlot(job: BackupJob, now: Date): string | null {
  if (!job.scheduled || job.status !== 'active' || job.mechanism !== 'tool') return null
  const slot = latestDueSlot(job.schedule, now)
  if (!slot) return null
  // Cap: zu alte verpasste Slots nicht mehr nachholen
  const ageDays = (now.getTime() - slot.getTime()) / 86400000
  if (ageDays > CATCHUP_CAP_DAYS) return null
  const slotIso = slot.toISOString()
  // Bereits fuer diesen Slot gelaufen?
  if (job.lastRun && new Date(job.lastRun).getTime() >= slot.getTime()) return null
  return slotIso
}
