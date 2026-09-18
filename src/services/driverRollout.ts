// ── Treiber-Rollout: geplante, resumierbare HP-Treiber-Verteilung ────────────
// Ein „Rollout" ist eine Menge von Ziel-PCs + Zeitplan (Wochentage+Uhrzeit). Zu
// jedem fälligen Slot werden NUR noch nicht fertige PCs verarbeitet: pro PC frisch
// scannen (scanOneHost), NUR VERALTETE Gerätetreiber (kein BIOS/keine Firmware)
// installieren (deployOneHost) und das Ergebnis persistieren. Bereits fertige PCs
// werden nie erneut angefasst; NICHT erreichte PCs werden am nächsten Slot erneut
// versucht — bis sie erreicht wurden. Läuft im Hintergrund via DriverRolloutController,
// Single-Runner über einen Claim-Lock (wie die anderen geplanten Scans).
//
// Persistenz auf dem Netzlaufwerk (Muster deviceSetup.ts / nis2Access.ts).

import { api } from '../electronAPI'
import {
  scanOneHost, deployOneHost,
  type DriverItem, type HpDeployResult, type HpDeployOptions, type RebootMode,
} from './hpDrivers'
import {
  isConfiguredDue, loadRunStatus, saveRunStatus, isStatusClaimed, claimExclusive,
  type ScanScheduleConfig,
} from './scanSchedules'

export const ROLLOUT_FILE = 'rollout/rollouts.json'
export const DRIVER_ROLLOUT_STATUS = 'settings/driver_rollout_status.json'

export type RolloutTargetStatus = 'pending' | 'in-progress' | 'done' | 'unreachable'

export interface RolloutTarget {
  hostname: string
  status: RolloutTargetStatus
  attempts: number
  lastAttemptAt?: string
  doneAt?: string
  result?: HpDeployResult   // was tatsächlich eingespielt wurde (nur bei erreichten PCs)
  message?: string
}
export interface Rollout {
  id: string
  name: string
  createdBy: string
  createdAt: string
  schedule: ScanScheduleConfig
  rebootMode: RebootMode
  notifyUser: boolean
  lastRunAt?: string
  status: 'aktiv' | 'fertig'
  targets: Record<string, RolloutTarget>   // key = hostname.toLowerCase()
}
interface RolloutStore { version: number; rollouts: Rollout[] }

/**
 * Rollout-Deploy-Regel: NUR veraltete, anwendbare Gerätetreiber. Schließt BIOS
 * (klasse) UND Firmware/Dock (ohneHardwareBezug) sowie unsichere Matches aus.
 * Wird für Deploy UND UI-Vorschau genutzt (Anzeige == was installiert wird).
 */
export function istRolloutTreiber(it: DriverItem): boolean {
  return it.klasse !== 'bios' && it.anwendbar && !it.ohneHardwareBezug && !it.matchUnsicher && it.status === 'veraltet'
}

const canon = (h: string): string => (h || '').trim().toLowerCase().split('.')[0]
function newId(): string { return `rollout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }

function normTarget(raw: unknown): RolloutTarget | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<RolloutTarget>
  const hostname = (r.hostname || '').trim()
  if (!hostname) return null
  const status: RolloutTargetStatus = (['pending', 'in-progress', 'done', 'unreachable'] as const).includes(r.status as RolloutTargetStatus) ? (r.status as RolloutTargetStatus) : 'pending'
  return { hostname, status, attempts: Number.isFinite(Number(r.attempts)) ? Number(r.attempts) : 0, lastAttemptAt: r.lastAttemptAt, doneAt: r.doneAt, result: r.result, message: r.message }
}
function normRollout(raw: unknown): Rollout | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<Rollout>
  if (!r.id || !r.schedule) return null
  const targets: Record<string, RolloutTarget> = {}
  const src = (r.targets && typeof r.targets === 'object') ? r.targets as Record<string, unknown> : {}
  for (const [k, v] of Object.entries(src)) { const t = normTarget(v); if (t) targets[k] = t }
  return {
    id: String(r.id), name: r.name || 'Rollout', createdBy: r.createdBy || '', createdAt: r.createdAt || new Date().toISOString(),
    schedule: r.schedule as ScanScheduleConfig,
    rebootMode: (r.rebootMode === 'reboot' ? 'reboot' : 'notify'),
    notifyUser: !!r.notifyUser,
    lastRunAt: r.lastRunAt,
    status: r.status === 'fertig' ? 'fertig' : 'aktiv',
    targets,
  }
}

export async function loadRollouts(): Promise<Rollout[]> {
  try {
    const d = await api().netReadJson<RolloutStore>(ROLLOUT_FILE)
    if (d && Array.isArray(d.rollouts)) return d.rollouts.map(normRollout).filter((x): x is Rollout => x !== null)
  } catch { /* noch keiner */ }
  return []
}
async function saveRollouts(list: Rollout[]): Promise<boolean> {
  try { return await api().netWriteJson(ROLLOUT_FILE, { version: 1, rollouts: list }) } catch { return false }
}

export async function createRollout(input: {
  name: string; by: string; hosts: string[]
  schedule: ScanScheduleConfig; rebootMode: RebootMode; notifyUser: boolean
}): Promise<Rollout> {
  const targets: Record<string, RolloutTarget> = {}
  for (const raw of input.hosts) {
    const host = (raw || '').trim()
    if (!host) continue
    const key = canon(host)
    if (!key || targets[key]) continue
    targets[key] = { hostname: host.toUpperCase(), status: 'pending', attempts: 0 }
  }
  const r: Rollout = {
    id: newId(), name: (input.name || '').trim() || 'Treiber-Rollout', createdBy: input.by,
    createdAt: new Date().toISOString(), schedule: input.schedule, rebootMode: input.rebootMode,
    notifyUser: input.notifyUser, status: 'aktiv', targets,
  }
  const list = await loadRollouts(); list.unshift(r); await saveRollouts(list); return r
}

export async function deleteRollout(id: string): Promise<void> {
  const list = await loadRollouts(); await saveRollouts(list.filter(r => r.id !== id))
}

export async function updateRollout(id: string, patch: Partial<Omit<Rollout, 'id' | 'targets'>>): Promise<Rollout | null> {
  const list = await loadRollouts()
  const idx = list.findIndex(r => r.id === id)
  if (idx < 0) return null
  list[idx] = { ...list[idx], ...patch }
  await saveRollouts(list)
  return list[idx]
}

/** Ein Ziel (read-modify-write). `attemptsInc` erhöht den Versuchszähler. */
async function updateTarget(id: string, hostKey: string, patch: Partial<RolloutTarget> & { attemptsInc?: boolean }): Promise<void> {
  const list = await loadRollouts()
  const r = list.find(x => x.id === id)
  if (!r) return
  const prev = r.targets[hostKey] || { hostname: hostKey.toUpperCase(), status: 'pending' as RolloutTargetStatus, attempts: 0 }
  const { attemptsInc, ...rest } = patch
  r.targets[hostKey] = { ...prev, ...rest, attempts: attemptsInc ? (prev.attempts || 0) + 1 : prev.attempts }
  await saveRollouts(list)
}

// ── Runner ───────────────────────────────────────────────────────────────────
const DEPLOY_BATCH = 4   // max. gleichzeitige PCs (WinRM-Regel)

async function processTarget(id: string, hostname: string, opts: HpDeployOptions): Promise<void> {
  const key = canon(hostname)
  const nowIso = () => new Date().toISOString()
  await updateTarget(id, key, { status: 'in-progress' })
  // 1) Scannen — schlägt das fehl / PC offline → nicht erreicht (Retry nächster Slot)
  let report
  try { report = await scanOneHost(hostname) }
  catch (e) { await updateTarget(id, key, { status: 'unreachable', message: e instanceof Error ? e.message : String(e), lastAttemptAt: nowIso(), attemptsInc: true }); return }
  if (!report.online || report.error) {
    await updateTarget(id, key, { status: 'unreachable', message: report.error || 'nicht erreichbar', lastAttemptAt: nowIso(), attemptsInc: true }); return
  }
  // 2) Nur veraltete Gerätetreiber (kein BIOS/keine Firmware)
  const items = report.items.filter(istRolloutTreiber)
  if (items.length === 0) {
    await updateTarget(id, key, { status: 'done', doneAt: nowIso(), message: 'keine Updates verfügbar', lastAttemptAt: nowIso(), attemptsInc: true }); return
  }
  // 3) Installieren — PC wurde erreicht → gilt als erledigt (auch bei Teilfehler; kein Retry)
  try {
    const result = await deployOneHost(hostname, items, opts)
    await updateTarget(id, key, { status: 'done', doneAt: nowIso(), result, message: result.message, lastAttemptAt: nowIso(), attemptsInc: true })
  } catch (e) {
    await updateTarget(id, key, { status: 'done', doneAt: nowIso(), message: 'Deploy-Fehler: ' + (e instanceof Error ? e.message : String(e)), lastAttemptAt: nowIso(), attemptsInc: true })
  }
}

/** Alle noch nicht fertigen Ziele eines Rollouts verarbeiten (in Batches ≤4). */
async function processRollout(id: string, by: string, heartbeat?: () => void): Promise<void> {
  const start = (await loadRollouts()).find(x => x.id === id)
  if (!start) return
  const opts: HpDeployOptions = { rebootMode: start.rebootMode, by, notifyUser: start.notifyUser }
  const pending = Object.values(start.targets).filter(t => t.status !== 'done').map(t => t.hostname)
  for (let i = 0; i < pending.length; i += DEPLOY_BATCH) {
    const batch = pending.slice(i, i + DEPLOY_BATCH)
    await Promise.all(batch.map(h => processTarget(id, h, opts)))
    heartbeat?.()
  }
  // Slot abgeschlossen: Zeitstempel + ggf. „fertig"
  const end = (await loadRollouts()).find(x => x.id === id)
  if (end) {
    const allDone = Object.values(end.targets).every(t => t.status === 'done')
    await updateRollout(id, { lastRunAt: new Date().toISOString(), status: allDone ? 'fertig' : 'aktiv' })
  }
}

/** Vom Hintergrund-Controller aufgerufen: alle FÄLLIGEN aktiven Rollouts verarbeiten. */
export async function runDriverRolloutOnce(by: string, heartbeat?: () => void): Promise<{ ok: boolean; summary: string }> {
  const now = Date.now()
  const list = await loadRollouts()
  const due = list.filter(r => r.status === 'aktiv' && isConfiguredDue(r.schedule, r.lastRunAt, now))
  for (const r of due) await processRollout(r.id, by, heartbeat)
  const done = due.length
  return { ok: true, summary: done ? `${done} Rollout(s) verarbeitet` : 'Kein Rollout fällig' }
}

/** Gibt es einen aktiven, fälligen Rollout? (billiger Vorab-Check für den Controller.) */
export async function anyRolloutDue(now = Date.now()): Promise<boolean> {
  const list = await loadRollouts()
  return list.some(r => r.status === 'aktiv' && isConfiguredDue(r.schedule, r.lastRunAt, now))
}

/** „Jetzt ausführen" — einen bestimmten Rollout sofort verarbeiten (ohne Zeitplan), Claim-geschützt. */
export async function runRolloutNow(id: string, by: string): Promise<{ ok: boolean; summary: string }> {
  const s = await loadRunStatus(DRIVER_ROLLOUT_STATUS)
  if (isStatusClaimed(s)) return { ok: false, summary: 'Ein Rollout-Lauf ist bereits aktiv — bitte kurz warten.' }
  const token = `${by}#now#${Math.random().toString(36).slice(2, 8)}`
  if (!(await claimExclusive(DRIVER_ROLLOUT_STATUS, token, s))) return { ok: false, summary: 'Konnte den Lauf nicht starten (parallel aktiv).' }
  try {
    await processRollout(id, by)
    return { ok: true, summary: 'Rollout ausgeführt.' }
  } catch (e) {
    return { ok: false, summary: e instanceof Error ? e.message : String(e) }
  } finally {
    try { const cur = await loadRunStatus(DRIVER_ROLLOUT_STATUS); await saveRunStatus(DRIVER_ROLLOUT_STATUS, { ...cur, lastRunAt: new Date().toISOString(), running: undefined }) } catch { /* egal */ }
  }
}

// ── kleine Auswertungshelfer für die UI ──────────────────────────────────────
export interface RolloutCounts { total: number; done: number; unreachable: number; pending: number; running: number }
export function countRollout(r: Rollout): RolloutCounts {
  const ts = Object.values(r.targets)
  return {
    total: ts.length,
    done: ts.filter(t => t.status === 'done').length,
    unreachable: ts.filter(t => t.status === 'unreachable').length,
    pending: ts.filter(t => t.status === 'pending').length,
    running: ts.filter(t => t.status === 'in-progress').length,
  }
}
