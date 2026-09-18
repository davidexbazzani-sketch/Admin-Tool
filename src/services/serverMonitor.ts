// ── Server-Monitor: Kachel-Config + Live-Status (Ping/Reboot) + Offline-Mail ──
// Geteilt für alle Admins auf dem Netzlaufwerk unter server_monitor/. Der Ping
// (alle 10 min, 3-fach-Retry) und die Reboot-Abfrage (2×/Tag) laufen im
// Hintergrund über den ServerMonitorController; nur EINE Instanz führt sie aus
// (Claim in status.json), alle Instanzen lesen den Status für Kacheln/Popup.

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { pingBatch } from './userPresenceScan'
import {
  getScanSchedule, isConfiguredDue, loadRunStatus, saveRunStatus,
  isStatusClaimed as isRunStatusClaimed,
} from './scanSchedules'

const CONFIG_PATH = 'server_monitor/config.json'
const STATUS_PATH = 'server_monitor/status.json'
const NOTIFIED_PATH = 'server_monitor/notified.json'
const INVENTORY_FILE = 'inventory/inventory.json'
const STALE_CLAIM_MS = 15 * 60 * 1000

// Auslastungs-Scan (RAM/Festplatte): 1×/Tag, Zeitplan-ID + eigene Lauf-Status-Datei.
export const SERVER_METRICS_SCAN_ID = 'server-metrics'
export const SERVER_METRICS_STATUS = 'server_monitor/metrics_schedule.json'

export interface ServerTile {
  id: string
  hostname: string
  ip?: string
  description?: string      // Bezeichnung aus der Standort-Übersicht (Inventar)
  note?: string             // frei eingebbare Info, wird auf der Kachel angezeigt
  notifyEnabled: boolean
  notifyEmail?: string
  position: number
}
export interface ServerConfig { tiles: ServerTile[] }

/** Festplatte (lokales Laufwerk, DriveType=3) — Kapazität + Belegung. */
export interface ServerDisk { drive: string; sizeGB: number; freeGB: number; usedPct: number }
/** Auslastungs-Momentaufnahme aus dem täglichen Metrik-Scan. */
export interface ServerMetrics {
  ramUsedPct: number
  ramUsedGB: number
  ramTotalGB: number
  disks: ServerDisk[]
  at: string                   // ISO – Zeitpunkt der Messung
}

export interface ServerStatus {
  online: boolean
  consecutiveFailures: number
  lastOkAt?: string
  lastCheckAt?: string
  lastReboot?: string          // Anzeige-String (yyyy-MM-dd HH:mm)
  lastRebootCheckAt?: string
  metrics?: ServerMetrics      // RAM-/Festplatten-Auslastung (täglicher Scan)
}
export interface ServerMonitorStatus {
  pingRunAt: string | null
  rebootRunAt: string | null
  metricsRunAt?: string | null
  running?: { by: string; at: string }
  servers: Record<string, ServerStatus>
}

export function hostKey(h: string): string { return (h || '').trim().toUpperCase() }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// ── Config ────────────────────────────────────────────────────────────────────
export async function loadServerConfig(): Promise<ServerConfig> {
  try {
    const c = await api().netReadJson<ServerConfig>(CONFIG_PATH)
    if (c && Array.isArray(c.tiles)) return { tiles: c.tiles }
  } catch { /* noch keine */ }
  return { tiles: [] }
}
export async function saveServerConfig(cfg: ServerConfig): Promise<boolean> {
  try { return await api().netWriteJson(CONFIG_PATH, cfg) } catch { return false }
}

export interface InventoryServer { hostname: string; ip?: string; description?: string }

/** Server aus dem Inventar (Kategorie „Server") — für Erstbefüllung / „Ergänzen". */
export async function loadInventoryServers(): Promise<InventoryServer[]> {
  try {
    const inv = (await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)) ?? []
    return (Array.isArray(inv) ? inv : [])
      .filter(i => (i.category || '').toLowerCase() === 'server' && i.name && i.name.trim())
      .map(i => ({ hostname: i.name.trim(), ip: (i.ip || '').trim() || undefined, description: (i.description || '').trim() || undefined }))
  } catch { return [] }
}

/** Fehlende Inventar-Server ergänzen + bei bestehenden Kacheln die Bezeichnung/IP
 *  aus dem Inventar auffrischen (gelöschte Kacheln bleiben gelöscht). */
export function mergeInventoryServers(tiles: ServerTile[], inv: InventoryServer[]): { tiles: ServerTile[]; added: number } {
  const byKey = new Map(inv.map(s => [hostKey(s.hostname), s]))
  const have = new Set(tiles.map(t => hostKey(t.hostname)))
  let pos = tiles.reduce((m, t) => Math.max(m, t.position), -1)
  let added = 0
  // bestehende Kacheln: Bezeichnung/IP aus Inventar nachziehen
  const out = tiles.map(t => {
    const s = byKey.get(hostKey(t.hostname))
    if (!s) return t
    return { ...t, description: s.description ?? t.description, ip: t.ip || s.ip }
  })
  for (const s of inv) {
    if (have.has(hostKey(s.hostname))) continue
    out.push({ id: `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, hostname: s.hostname, ip: s.ip, description: s.description, notifyEnabled: false, position: ++pos })
    have.add(hostKey(s.hostname))
    added++
  }
  return { tiles: out, added }
}

// ── Status ──────────────────────────────────────────────────────────────────
export async function loadServerStatus(): Promise<ServerMonitorStatus> {
  try {
    const s = await api().netReadJson<ServerMonitorStatus>(STATUS_PATH)
    if (s && typeof s === 'object') return { pingRunAt: s.pingRunAt ?? null, rebootRunAt: s.rebootRunAt ?? null, metricsRunAt: s.metricsRunAt ?? null, running: s.running, servers: s.servers || {} }
  } catch { /* noch keiner */ }
  return { pingRunAt: null, rebootRunAt: null, metricsRunAt: null, servers: {} }
}
export async function saveServerStatus(s: ServerMonitorStatus): Promise<boolean> {
  try { return await api().netWriteJson(STATUS_PATH, s) } catch { return false }
}
export function isStatusClaimed(s: ServerMonitorStatus, now = Date.now()): boolean {
  if (!s.running) return false
  const t = new Date(s.running.at).getTime()
  if (isNaN(t)) return false
  return (now - t) < STALE_CLAIM_MS
}
/** Aktuell offline gemeldete Hosts (aus dem geteilten Status). */
export function offlineHosts(s: ServerMonitorStatus): string[] {
  return Object.entries(s.servers).filter(([, v]) => v.online === false).map(([k]) => k)
}

/** Offline-Hosts, gefiltert auf die aktuell konfigurierten Kacheln (gelöschte ignorieren). */
export function offlineHostsForTiles(s: ServerMonitorStatus, tiles: ServerTile[]): string[] {
  const valid = new Set(tiles.map(t => hostKey(t.hostname)))
  return offlineHosts(s).filter(k => valid.has(k))
}

/** Status-/Mail-Eintrag eines gelöschten Servers entfernen (räumt Alarm/Popup sofort auf). */
export async function removeHostState(hostname: string): Promise<void> {
  const key = hostKey(hostname)
  try {
    const status = await loadServerStatus()
    if (status.servers[key]) {
      const servers = { ...status.servers }; delete servers[key]
      await saveServerStatus({ ...status, servers })
    }
  } catch { /* offline */ }
  try {
    const n = (await api().netReadJson<Record<string, string>>(NOTIFIED_PATH)) ?? {}
    if (n && n[key]) { delete n[key]; await api().netWriteJson(NOTIFIED_PATH, n) }
  } catch { /* offline */ }
}

// ── Ping mit 3-fach-Retry (in EINEM Zyklus) ───────────────────────────────────
async function pingReachable(targets: string[]): Promise<Set<string>> {
  const reachable = new Set<string>()
  let pending = [...new Set(targets.filter(Boolean))]
  for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
    let up = new Set<string>()
    try { up = new Set((await pingBatch(pending, 800)).up) } catch { up = new Set() }
    for (const t of pending) if (up.has(t)) reachable.add(t)
    pending = pending.filter(t => !up.has(t))
    if (pending.length && attempt < 2) await sleep(1000)   // 2 weitere Pings nach kurzer Pause
  }
  return reachable
}

const targetOf = (t: ServerTile) => (t.ip || '').trim() || t.hostname.trim()

async function loadNotified(): Promise<Record<string, string>> {
  try { const n = await api().netReadJson<Record<string, string>>(NOTIFIED_PATH); return (n && typeof n === 'object') ? n : {} } catch { return {} }
}
async function saveNotified(n: Record<string, string>): Promise<void> {
  try { await api().netWriteJson(NOTIFIED_PATH, n) } catch { /* offline */ }
}

/**
 * Ein Ping-Zyklus: pingt alle Kacheln (3-fach-Retry), schreibt status.json,
 * sendet für neu-offline Kacheln mit Benachrichtigung eine Mail (Dedup bis Recovery).
 */
export async function runPingCycle(by: string): Promise<{ online: number; offline: number }> {
  const cfg = await loadServerConfig()
  const status = await loadServerStatus()
  const notified = await loadNotified()
  const now = new Date().toISOString()

  const reachable = await pingReachable(cfg.tiles.map(targetOf))
  let online = 0, offline = 0
  // Nur noch aktuelle Kacheln behalten — gelöschte Server fallen aus status.json.
  const validKeys = new Set(cfg.tiles.map(t => hostKey(t.hostname)))
  const servers: Record<string, ServerStatus> = {}
  for (const [k, v] of Object.entries(status.servers)) if (validKeys.has(k)) servers[k] = v
  for (const k of Object.keys(notified)) if (!validKeys.has(k)) delete notified[k]

  for (const t of cfg.tiles) {
    const key = hostKey(t.hostname)
    const isUp = reachable.has(targetOf(t))
    const prev = servers[key] || { online: true, consecutiveFailures: 0 }
    const st: ServerStatus = { ...prev, lastCheckAt: now }
    if (isUp) {
      st.online = true; st.consecutiveFailures = 0; st.lastOkAt = now; online++
      if (notified[key]) { delete notified[key] }   // Recovery → Dedup zurücksetzen
    } else {
      st.online = false; st.consecutiveFailures = (prev.consecutiveFailures || 0) + 1; offline++
      // Mail bei Offline (einmalig bis Recovery), nur wenn aktiviert + Adresse
      if (t.notifyEnabled && t.notifyEmail && t.notifyEmail.trim() && !notified[key]) {
        try {
          await api().sendEmailRaw({
            to: t.notifyEmail.trim(),
            subject: `Server offline: ${t.hostname}`,
            body: `Der Server ${t.hostname}${t.ip ? ` (${t.ip})` : ''} ist seit ${new Date().toLocaleString('de-DE')} nicht mehr erreichbar (3× kein Ping).\n\nGemeldet vom IT Admin Tool (Server-Monitor).`,
            smtp: '', port: 587,
          })
          notified[key] = now
        } catch { /* nächster Zyklus versucht es erneut */ }
      }
    }
    servers[key] = st
  }

  await saveServerStatus({ ...status, pingRunAt: now, running: undefined, servers })
  await saveNotified(notified)
  return { online, offline }
}

// ── Reboot-Abfrage (2×/Tag) ───────────────────────────────────────────────────
export async function runRebootCheck(by: string): Promise<{ updated: number }> {
  const cfg = await loadServerConfig()
  const status = await loadServerStatus()
  const now = new Date().toISOString()
  const hosts = [...new Set(cfg.tiles.map(t => t.hostname.trim()).filter(Boolean))]
  const servers: Record<string, ServerStatus> = { ...status.servers }
  let updated = 0
  const CHUNK = 40
  for (let i = 0; i < hosts.length; i += CHUNK) {
    const chunk = hosts.slice(i, i + CHUNK)
    const list = chunk.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
    const script = [
      `$ErrorActionPreference='SilentlyContinue'`,
      `$h=@(${list})`,
      `$r = Invoke-Command -ComputerName $h -ThrottleLimit 10 -ErrorAction SilentlyContinue -ScriptBlock {`,
      `  [pscustomobject]@{ Boot = (Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue).LastBootUpTime.ToString('yyyy-MM-dd HH:mm') }`,
      `}`,
      `$r | Select-Object PSComputerName, Boot | ConvertTo-Json -Compress`,
    ].join('\n')
    try {
      const res = await api().runPowerShell(script, 180000)
      const txt = (res.stdout ?? '').trim()
      if (txt && !txt.startsWith('ERR:')) {
        const parsed = JSON.parse(txt)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const o of arr) {
          const host = String(o?.PSComputerName ?? '').trim()
          const boot = o?.Boot ? String(o.Boot).trim() : ''
          if (!host || !boot) continue
          const key = hostKey(host)
          servers[key] = { ...(servers[key] || { online: true, consecutiveFailures: 0 }), lastReboot: boot, lastRebootCheckAt: now }
        }
        updated += arr.length
      }
    } catch { /* Block fehlgeschlagen */ }
  }
  await saveServerStatus({ ...status, rebootRunAt: now, servers })
  return { updated }
}

// ── Auslastungs-Scan: RAM + Festplatten-Kapazität (1×/Tag, 11:00) ─────────────
/**
 * Fragt je Server per WinRM RAM-Belegung (Win32_OperatingSystem) und lokale
 * Festplatten (Win32_LogicalDisk, DriveType=3) ab und schreibt die Werte in
 * status.servers[*].metrics. Offline-Server liefern nichts → ihr letzter Stand
 * bleibt erhalten. Chunked mit ThrottleLimit 10 (max. 10 parallele WinRM-Sessions).
 */
export async function runServerMetricsScan(by: string): Promise<{ ok: boolean; summary: string; scanned: number; updated: number }> {
  const cfg = await loadServerConfig()
  const status = await loadServerStatus()
  const now = new Date().toISOString()
  const hosts = [...new Set(cfg.tiles.map(t => t.hostname.trim()).filter(Boolean))]
  const servers: Record<string, ServerStatus> = { ...status.servers }
  let updated = 0
  const CHUNK = 40
  for (let i = 0; i < hosts.length; i += CHUNK) {
    const chunk = hosts.slice(i, i + CHUNK)
    const list = chunk.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
    const script = [
      `$ErrorActionPreference='SilentlyContinue'`,
      `$h=@(${list})`,
      `$r = Invoke-Command -ComputerName $h -ThrottleLimit 10 -ErrorAction SilentlyContinue -ScriptBlock {`,
      `  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue`,
      `  $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction SilentlyContinue | ForEach-Object {`,
      `    [pscustomobject]@{ Drive = $_.DeviceID; SizeGB = [math]::Round(($_.Size/1GB),1); FreeGB = [math]::Round(($_.FreeSpace/1GB),1) }`,
      `  })`,
      `  [pscustomobject]@{ TotalKB = [double]$os.TotalVisibleMemorySize; FreeKB = [double]$os.FreePhysicalMemory; Disks = $disks }`,
      `}`,
      `$r | Select-Object PSComputerName, TotalKB, FreeKB, Disks | ConvertTo-Json -Depth 5 -Compress`,
    ].join('\n')
    try {
      const res = await api().runPowerShell(script, 180000)
      const txt = (res.stdout ?? '').trim()
      if (txt && !txt.startsWith('ERR:')) {
        const parsed = JSON.parse(txt)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const o of arr) {
          const host = String(o?.PSComputerName ?? '').trim()
          const totalKB = Number(o?.TotalKB) || 0
          if (!host || totalKB <= 0) continue
          const freeKB = Number(o?.FreeKB) || 0
          const usedKB = Math.max(0, totalKB - freeKB)
          const ramTotalGB = Math.round((totalKB / 1048576) * 10) / 10
          const ramUsedGB = Math.round((usedKB / 1048576) * 10) / 10
          const ramUsedPct = Math.min(100, Math.round((usedKB / totalKB) * 100))
          const rawDisks = o?.Disks == null ? [] : (Array.isArray(o.Disks) ? o.Disks : [o.Disks])
          const disks: ServerDisk[] = rawDisks
            .map((d: unknown) => {
              const dd = d as { Drive?: unknown; SizeGB?: unknown; FreeGB?: unknown }
              const sizeGB = Number(dd?.SizeGB) || 0
              const freeGB = Number(dd?.FreeGB) || 0
              const usedPct = sizeGB > 0 ? Math.min(100, Math.round(((sizeGB - freeGB) / sizeGB) * 100)) : 0
              return { drive: String(dd?.Drive ?? '').trim(), sizeGB, freeGB, usedPct }
            })
            .filter((d: ServerDisk) => d.drive)
          const key = hostKey(host)
          servers[key] = {
            ...(servers[key] || { online: true, consecutiveFailures: 0 }),
            metrics: { ramUsedPct, ramUsedGB, ramTotalGB, disks, at: now },
          }
          updated++
        }
      }
    } catch { /* Block fehlgeschlagen – nächster Lauf versucht es erneut */ }
  }
  await saveServerStatus({ ...status, metricsRunAt: now, servers })
  return { ok: true, summary: `${updated}/${hosts.length} Server (RAM/Festplatte) aktualisiert`, scanned: hosts.length, updated }
}

/**
 * Führt den Auslastungs-Scan aus, wenn er laut Zeitplan fällig ist (Einstellungen →
 * „Automatische Scans" → server-metrics, Standard: täglich 11:00). Single-Runner via
 * eigenem Claim in SERVER_METRICS_STATUS. Wird vom ServerMonitorController getickt.
 */
export async function runServerMetricsIfDue(by: string, now = Date.now()): Promise<boolean> {
  const sched = await getScanSchedule(SERVER_METRICS_SCAN_ID)
  const st = await loadRunStatus(SERVER_METRICS_STATUS)
  if (!isConfiguredDue(sched, st.lastRunAt, now)) return false
  if (isRunStatusClaimed(st, now)) return false
  const token = `${by}#${Math.random().toString(36).slice(2, 10)}`
  await saveRunStatus(SERVER_METRICS_STATUS, { ...st, running: { by: token, at: new Date().toISOString() } })
  const check = await loadRunStatus(SERVER_METRICS_STATUS)
  if (check.running?.by !== token) return false   // andere Instanz war schneller
  try {
    const r = await runServerMetricsScan(by)
    await saveRunStatus(SERVER_METRICS_STATUS, { lastRunAt: new Date().toISOString(), lastResult: r.ok ? 'success' : 'error', lastSummary: r.summary, running: undefined })
    return true
  } catch {
    await saveRunStatus(SERVER_METRICS_STATUS, { ...st, running: undefined })
    return false
  }
}
