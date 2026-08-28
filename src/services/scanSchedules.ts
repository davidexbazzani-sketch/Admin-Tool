// ── Konfigurierbare Zeitpläne für die automatischen Scans ─────────────────────
// Ersetzt die bisher HART CODIERTEN Turnusse der Scan-Controller durch ein zentral
// gespeichertes Wochentag-+-Uhrzeit-Modell (verwaltet in Einstellungen → „Automatische
// Scans"). Ein Scan ist „fällig", wenn der jüngste passende Wochentag-/Uhrzeit-Slot
// nach dem letzten Lauf liegt (Nachhol-Logik). Zusätzlich generische Lauf-Status-Helfer
// (lastRunAt + Claim) für die neuen Scans (Radar, VLAN).

import { api } from '../electronAPI'

export interface ScanScheduleConfig {
  enabled: boolean
  days: number[]     // 0=So … 6=Sa (wie Date.getDay())
  time: string       // 'HH:MM'
}

const SCAN_SCHEDULE_PATH = 'settings/scan_schedules.json'

// Standard-Zeitpläne je Scan-ID (greifen, solange der Nutzer nichts anderes speichert).
export const SCAN_SCHEDULE_DEFAULTS: Record<string, ScanScheduleConfig> = {
  'software-inventory':  { enabled: true, days: [1, 3, 4], time: '12:00' },   // Mo, Mi, Do (Nutzerwunsch)
  'printer-connections': { enabled: true, days: [5], time: '14:00' },          // Fr (vorher 14-täglich)
  'printer-ip':          { enabled: true, days: [0, 1, 2, 3, 4, 5, 6], time: '15:00' }, // täglich
  'device-scan':         { enabled: true, days: [1, 4], time: '15:00' },        // Mo, Do (vorher „alle 3 Tage")
  'proactive-radar':     { enabled: true, days: [1, 2, 3, 4, 5], time: '07:00' }, // Werktags früh
  'vlan-scan':           { enabled: true, days: [6], time: '03:00' },            // Sa nachts (schwerer Scan)
}

export const WEEKDAY_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

function sanitize(c: Partial<ScanScheduleConfig> | undefined, def: ScanScheduleConfig): ScanScheduleConfig {
  if (!c || typeof c !== 'object') return { ...def }
  const days = Array.isArray(c.days)
    ? [...new Set(c.days.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
    : [...def.days]
  const time = typeof c.time === 'string' && /^\d{1,2}:\d{2}$/.test(c.time) ? c.time : def.time
  const enabled = typeof c.enabled === 'boolean' ? c.enabled : def.enabled
  return { enabled, days, time }
}

export async function loadScanSchedules(): Promise<Record<string, ScanScheduleConfig>> {
  let stored: Record<string, Partial<ScanScheduleConfig>> = {}
  try {
    const s = await api().netReadJson<Record<string, Partial<ScanScheduleConfig>>>(SCAN_SCHEDULE_PATH)
    if (s && typeof s === 'object') stored = s
  } catch { /* noch keine — Defaults */ }
  const out: Record<string, ScanScheduleConfig> = {}
  for (const [id, def] of Object.entries(SCAN_SCHEDULE_DEFAULTS)) out[id] = sanitize(stored[id], def)
  return out
}

export async function saveScanSchedules(cfg: Record<string, ScanScheduleConfig>): Promise<boolean> {
  try { return await api().netWriteJson(SCAN_SCHEDULE_PATH, cfg) } catch { return false }
}

export async function getScanSchedule(id: string): Promise<ScanScheduleConfig> {
  const all = await loadScanSchedules()
  return all[id] ?? SCAN_SCHEDULE_DEFAULTS[id] ?? { enabled: true, days: [1, 3, 4], time: '12:00' }
}

/** Jüngster Zeitpunkt an einem der `days` (0=So..6=Sa) um `time` ≤ now (Rückschau 0–7 Tage). */
export function latestWeeklySlot(now: Date, days: number[], time: string): Date | null {
  if (!days || days.length === 0) return null
  const [hh, mm] = time.split(':').map(n => parseInt(n, 10))
  if (isNaN(hh) || isNaN(mm)) return null
  const set = new Set(days)
  for (let back = 0; back < 8; back++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, hh, mm, 0, 0)
    if (d.getTime() > now.getTime()) continue
    if (!set.has(d.getDay())) continue
    return d
  }
  return null
}

/** Fällig, wenn aktiviert UND der jüngste passende Slot nach dem letzten Lauf liegt. */
export function isConfiguredDue(cfg: ScanScheduleConfig, lastRunAt: string | null | undefined, now = Date.now()): boolean {
  if (!cfg.enabled) return false
  const slot = latestWeeklySlot(new Date(now), cfg.days, cfg.time)
  if (!slot) return false
  if (!lastRunAt) return true
  const t = new Date(lastRunAt).getTime()
  if (isNaN(t)) return true
  return t < slot.getTime()
}

/** Menschlich lesbarer Turnus („Mo, Mi, Do um 12:00"). */
export function describeSchedule(cfg: ScanScheduleConfig): string {
  if (!cfg.enabled) return 'deaktiviert'
  if (!cfg.days.length) return 'kein Tag gewählt'
  const days = cfg.days.length === 7 ? 'täglich' : cfg.days.slice().sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).join(', ')
  return `${days} um ${cfg.time}`
}

// ── Generischer Lauf-Status (lastRunAt + Claim) für Scans ohne eigene Datei ───
export interface ScanRunStatus {
  lastRunAt: string | null
  lastResult?: 'success' | 'error'
  lastSummary?: string
  running?: { by: string; at: string }
}
const STALE_LOCK_MS = 2 * 60 * 60 * 1000

export async function loadRunStatus(path: string): Promise<ScanRunStatus> {
  try {
    const s = await api().netReadJson<ScanRunStatus>(path)
    if (s && typeof s === 'object') return { lastRunAt: s.lastRunAt ?? null, lastResult: s.lastResult, lastSummary: s.lastSummary, running: s.running }
  } catch { /* noch keiner */ }
  return { lastRunAt: null }
}
export async function saveRunStatus(path: string, s: ScanRunStatus): Promise<boolean> {
  try { return await api().netWriteJson(path, s) } catch { return false }
}
export function isStatusClaimed(s: ScanRunStatus, now = Date.now()): boolean {
  if (!s.running) return false
  const t = new Date(s.running.at).getTime()
  if (isNaN(t)) return false
  return (now - t) < STALE_LOCK_MS
}
