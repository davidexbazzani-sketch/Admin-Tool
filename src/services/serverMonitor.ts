// ── Server-Monitor: Kachel-Config + Live-Status (Ping/Reboot) + Offline-Mail ──
// Geteilt für alle Admins auf dem Netzlaufwerk unter server_monitor/. Der Ping
// (alle 5 min, 3-fach-Retry) und die Reboot-Abfrage (alle 15 min + sofort, wenn ein
// Server wieder erreichbar ist) laufen im
// Hintergrund über den ServerMonitorController; nur EINE Instanz führt sie aus
// (Claim in status.json), alle Instanzen lesen den Status für Kacheln/Popup.

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { pingBatch } from './userPresenceScan'
import { melde, detailsZuNeustarts, titelVon, textVon, type MeldeZiel, type ServerEreignis, type NeustartDetail } from './serverEreignisse'
import type { ZertZusammenfassung } from './serverZertifikate'
import { ladeSoll, ladeIst, pruefe, kritischeFehler, fasseZusammen, istDcaDienst, DCA_AUSFALL, type Zusammenfassung } from './serverZustand'
import { addHistoryEntry } from './serverHistory'
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
  notifyEnabled: boolean      // Mail bei Offline (+ „wieder erreichbar")
  notifyReboot?: boolean      // Mail bei Neustart — nicht gesetzt = wie notifyEnabled
  notifyPruefung?: boolean    // Mail bei Problemen der Dienst-/Einstellungs-Prüfung — nicht gesetzt = wie notifyReboot
  notifyZertifikat?: boolean  // Mail, wenn ein verwendetes Zertifikat in 30 / 5 Tagen abläuft — nicht gesetzt = wie notifyPruefung
  notifyEmail?: string
  position: number
}

// ── Melde-Adressen: mehrere je Server, getrennt mit ; , oder Leerzeichen ──────
const MAIL_RE = /^[^\s@;,<>"]+@[^\s@;,<>"]+\.[^\s@;,<>"]+$/
/** Alle Teile einer Adress-Eingabe: gültige (ohne Dubletten) + ungültige (zum Anzeigen). */
export function zerlegeAdressen(s?: string): { gueltig: string[]; ungueltig: string[] } {
  const gesehen = new Set<string>()
  const gueltig: string[] = [], ungueltig: string[] = []
  for (const roh of (s || '').split(/[;,\s]+/)) {
    const a = roh.trim().replace(/^<|>$/g, '')
    if (!a) continue
    if (!MAIL_RE.test(a)) { ungueltig.push(a); continue }
    if (gesehen.has(a.toLowerCase())) continue
    gesehen.add(a.toLowerCase()); gueltig.push(a)
  }
  return { gueltig, ungueltig }
}
/** Empfänger-Zeile für Outlook („a@x; b@y") — leer, wenn keine gültige Adresse. */
export function meldeAn(s?: string): string {
  return zerlegeAdressen(s).gueltig.join('; ')
}

/** Mail-Einstellungen je HOSTKEY für die Ereignis-Meldungen. */
export function meldeZiele(tiles: ServerTile[]): Record<string, MeldeZiel> {
  const z: Record<string, MeldeZiel> = {}
  for (const t of tiles) {
    const neustart = t.notifyReboot ?? !!t.notifyEnabled
    const pruefung = t.notifyPruefung ?? neustart
    z[hostKey(t.hostname)] = { email: meldeAn(t.notifyEmail) || undefined, offline: !!t.notifyEnabled, neustart, pruefung, zertifikat: t.notifyZertifikat ?? pruefung }
  }
  return z
}

/** Häufigste Melde-Adresse der vorhandenen Kacheln (für „für alle übernehmen" + neue Server). */
export function haeufigsteMeldeAdresse(tiles: ServerTile[]): string {
  const n = new Map<string, number>()
  for (const t of tiles) { const e = meldeAn(t.notifyEmail); if (e) n.set(e, (n.get(e) || 0) + 1) }
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
}

/**
 * Melde-Einstellungen für NEUE Server: Gibt es schon eine Melde-Adresse, bekommt jeder neue
 * Server alle Mails (Offline, Neustart/Herunterfahren, Probleme) an diese Adresse — sonst aus.
 */
export function meldeStandard(tiles: ServerTile[]): Pick<ServerTile, 'notifyEnabled' | 'notifyReboot' | 'notifyPruefung' | 'notifyZertifikat' | 'notifyEmail'> {
  const email = haeufigsteMeldeAdresse(tiles)
  return email ? { notifyEnabled: true, notifyReboot: true, notifyPruefung: true, notifyZertifikat: true, notifyEmail: email } : { notifyEnabled: false }
}

/** Startzeit-String (yyyy-MM-dd HH:mm, Serverzeit) → ms; NaN bei Unsinn. */
function bootMs(b?: string): number {
  return b ? new Date(b.replace(' ', 'T')).getTime() : NaN
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
  lastRebootCheckAt?: string   // letzte ERFOLGREICHE Abfrage
  lastRebootTryAt?: string     // letzter Versuch (auch fehlgeschlagen)
  lastRebootError?: string     // Grund, wenn der letzte Versuch scheiterte (sonst leer)
  rebootQuelle?: 'winrm' | 'dcom'
  metrics?: ServerMetrics      // RAM-/Festplatten-Auslastung (täglicher Scan)
  pruefung?: Zusammenfassung   // letzte Dienst-/Einstellungs-Prüfung (Kurzfassung für die Kachel)
  zertifikate?: ZertZusammenfassung   // letzter Zertifikats-Scan (nächster Ablauf, Anzahl ≤ 30 / ≤ 5 Tage)
}
export interface ServerMonitorStatus {
  pingRunAt: string | null
  rebootRunAt: string | null
  metricsRunAt?: string | null
  running?: { by: string; at: string }
  /** Sperre der automatischen Dienst-Prüfung (alle 5 min) — damit sich zwei Läufe nie überlappen */
  pruefungLaeuft?: { by: string; at: string }
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
    out.push({ id: `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, hostname: s.hostname, ip: s.ip, description: s.description, ...meldeStandard(tiles), position: ++pos })
    have.add(hostKey(s.hostname))
    added++
  }
  return { tiles: out, added }
}

// ── Status ──────────────────────────────────────────────────────────────────
export async function loadServerStatus(): Promise<ServerMonitorStatus> {
  try {
    const s = await api().netReadJson<ServerMonitorStatus>(STATUS_PATH)
    if (s && typeof s === 'object') return { pingRunAt: s.pingRunAt ?? null, rebootRunAt: s.rebootRunAt ?? null, metricsRunAt: s.metricsRunAt ?? null, running: s.running, pruefungLaeuft: s.pruefungLaeuft, servers: s.servers || {} }
  } catch { /* noch keiner */ }
  return { pingRunAt: null, rebootRunAt: null, metricsRunAt: null, servers: {} }
}
export async function saveServerStatus(s: ServerMonitorStatus): Promise<boolean> {
  try { return await api().netWriteJson(STATUS_PATH, s) } catch { return false }
}
/**
 * Änderungen in den FRISCH geladenen Stand schreiben (nicht in eine alte Kopie) —
 * sonst überschreiben Ping, Reboot-Abfrage und Auslastungs-Scan gegenseitig ihre
 * Ergebnisse, wenn sie sich zeitlich überlappen.
 */
export async function aktualisiereStatus(fn: (frisch: ServerMonitorStatus) => ServerMonitorStatus): Promise<boolean> {
  const frisch = await loadServerStatus()
  return saveServerStatus(fn(frisch))
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
export async function runPingCycle(by: string): Promise<{ online: number; offline: number; wiederDa: string[] }> {
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
  const wiederDa: string[] = []   // war offline, jetzt erreichbar → evtl. neu gestartet
  const ereignisse: ServerEreignis[] = []
  const ziele: Record<string, MeldeZiel> = {}

  for (const t of cfg.tiles) {
    const key = hostKey(t.hostname)
    const isUp = reachable.has(targetOf(t))
    const prev = servers[key] || { online: true, consecutiveFailures: 0 }
    const basis = { host: t.hostname.trim(), bezeichnung: t.description, ip: t.ip, at: now }
    if (isUp && servers[key]?.online === false) {
      wiederDa.push(t.hostname.trim())
      const weg = prev.lastOkAt ? Math.round((Date.parse(now) - Date.parse(prev.lastOkAt)) / 60000) : undefined
      ereignisse.push({ ...basis, id: `wieder-online|${key}|${now}`, typ: 'wieder-online', dauerMin: weg })
      // „wieder erreichbar"-Mail nur, wenn vorher auch die Offline-Mail rausging
      ziele[key] = { email: meldeAn(t.notifyEmail) || undefined, offline: !!notified[key], neustart: false }
    } else if (!isUp && prev.online !== false) {
      ereignisse.push({ ...basis, id: `offline|${key}|${now}`, typ: 'offline' })
      ziele[key] = { offline: false, neustart: false }   // Offline-Mail läuft unten (mit Wiederholung)
    }
    const st: ServerStatus = { ...prev, lastCheckAt: now }
    if (isUp) {
      st.online = true; st.consecutiveFailures = 0; st.lastOkAt = now; online++
      if (notified[key]) { delete notified[key] }   // Recovery → Dedup zurücksetzen
    } else {
      st.online = false; st.consecutiveFailures = (prev.consecutiveFailures || 0) + 1; offline++
      // Mail bei Offline (einmalig bis Recovery), nur wenn aktiviert + Adresse
      // Nur bei ERFOLG als gemeldet merken — sonst versucht es der nächste Zyklus erneut.
      const an = meldeAn(t.notifyEmail)
      if (t.notifyEnabled && an && !notified[key]) {
        const e: ServerEreignis = { host: t.hostname.trim(), bezeichnung: t.description, ip: t.ip, at: prev.online === false && prev.lastCheckAt ? prev.lastCheckAt : now, id: '', typ: 'offline' }
        try {
          const r = await api().sendEmailRaw({ to: an, subject: titelVon(e), body: textVon(e), smtp: '', port: 587 })
          if (r?.success) notified[key] = now
        } catch { /* nächster Zyklus versucht es erneut */ }
      }
    }
    servers[key] = st
  }

  // Nur die Ping-Felder in den frischen Stand übernehmen (Reboot/Auslastung bleiben).
  await aktualisiereStatus(frisch => {
    const neu: Record<string, ServerStatus> = {}
    for (const k of validKeys) {
      const p = servers[k]
      const f = frisch.servers[k]
      if (!p && !f) continue
      neu[k] = { ...(f || {}), ...(p ? { online: p.online, consecutiveFailures: p.consecutiveFailures, lastOkAt: p.lastOkAt, lastCheckAt: p.lastCheckAt } : {}) } as ServerStatus
    }
    return { ...frisch, pingRunAt: now, running: undefined, servers: neu }
  })
  await saveNotified(notified)
  // Historie + (bei „wieder erreichbar") Mail; Fehler hier dürfen den Ping nie stören
  if (ereignisse.length) await melde(ereignisse, ziele, by).catch(() => [])
  return { online, offline, wiederDa }
}

// ── Reboot-Abfrage (stündlich + bei „wieder erreichbar") ─────────────────────
// WinRM (Invoke-Command, max. 10 parallel, kurze Verbindungs-Timeouts, damit ein
// hängender Server nicht die ganze Abfrage abbricht). Scheitert WinRM für wenige
// Server (z. B. Zscaler fängt 5985 ab), wird für diese einzeln per DCOM nachgefragt.
// Fehler werden je Server gespeichert und auf der Kachel angezeigt — der alte Wert
// bleibt stehen, ist aber als „nicht aktuell" erkennbar.
const DCOM_FALLBACK_MAX = 10

function psListe(hosts: string[]): string {
  return hosts.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
}

type RebootRoh = { Host?: string; Boot?: string; Fehler?: string; Text?: string }

function parseRebootJson(txt: string): RebootRoh[] {
  try {
    const p = JSON.parse(txt)
    return (Array.isArray(p) ? p : [p]).filter(Boolean)
  } catch { return [] }
}

/**
 * `bekannt` = Startzeiten, die die Dienst-Prüfung gerade schon gelesen hat (HOSTKEY → boot) —
 * diese Server werden nicht noch einmal abgefragt. `throttle` = max. gleichzeitige
 * WinRM-Sitzungen für die übrigen (automatischer 5-min-Lauf: 3, „Jetzt prüfen": 10).
 */
export async function runRebootCheck(by: string, nurHosts?: string[], opt: { bekannt?: Record<string, string>; throttle?: number } = {}): Promise<{ updated: number; fehler: number; neustarts: number }> {
  const cfg = await loadServerConfig()
  const status = await loadServerStatus()
  const now = new Date().toISOString()
  const wunsch = nurHosts ? new Set(nurHosts.map(hostKey)) : null
  const alle = [...new Set(cfg.tiles.map(t => t.hostname.trim()).filter(Boolean))].filter(h => !wunsch || wunsch.has(hostKey(h)))
  const ergebnis = new Map<string, { boot?: string; fehler?: string; quelle?: 'winrm' | 'dcom' }>()
  const bekannt = opt.bekannt || {}
  for (const h of alle) { const b = bekannt[hostKey(h)]; if (b) ergebnis.set(hostKey(h), { boot: b, quelle: 'winrm' }) }
  // laut Ping offline → gar nicht erst per WinRM versuchen (spart Timeouts); schon bekannte nicht noch einmal
  const hosts = alle.filter(h => status.servers[hostKey(h)]?.online !== false && !ergebnis.has(hostKey(h)))
  for (const h of alle) if (status.servers[hostKey(h)]?.online === false && !ergebnis.has(hostKey(h))) ergebnis.set(hostKey(h), { fehler: 'offline (kein Ping)' })
  const throttle = Math.max(1, Math.min(10, opt.throttle || 10))

  const CHUNK = 40
  for (let i = 0; i < hosts.length; i += CHUNK) {
    const chunk = hosts.slice(i, i + CHUNK)
    const script = [
      `$ErrorActionPreference='SilentlyContinue'`,
      `$h=@(${psListe(chunk)})`,
      `$so = New-PSSessionOption -OpenTimeout 15000 -OperationTimeout 60000`,
      `$fehler = @()`,
      `$r = @(Invoke-Command -ComputerName $h -ThrottleLimit ${throttle} -SessionOption $so -ErrorAction SilentlyContinue -ErrorVariable +fehler -ScriptBlock {`,
      `  $os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue`,
      `  [pscustomobject]@{ Boot = if ($os -and $os.LastBootUpTime) { $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm') } else { '' } }`,
      `})`,
      `$aus = @($r | ForEach-Object { [pscustomobject]@{ Host = [string]$_.PSComputerName; Boot = [string]$_.Boot; Fehler = ''; Text = '' } })`,
      `foreach ($f in $fehler) {`,
      `  $t = [string]$f.TargetObject; if (-not $t) { $t = [string]$f.CategoryInfo.TargetName }`,
      `  $txt = (([string]$f) -split "\\r?\\n")[0]; if ($txt.Length -gt 300) { $txt = $txt.Substring(0,300) }`,
      `  $aus += [pscustomobject]@{ Host = $t; Boot = ''; Fehler = 'WinRM'; Text = $txt }`,
      `}`,
      `ConvertTo-Json -InputObject @($aus) -Compress`,
    ].join('\n')
    let roh: RebootRoh[] = []
    let blockFehler = ''
    try {
      const res = await api().runPowerShell(script, 240000)
      const txt = (res.stdout ?? '').trim()
      roh = txt && !txt.startsWith('ERR:') ? parseRebootJson(txt) : []
      if (!roh.length) blockFehler = res.timedOut ? 'Zeitüberschreitung der WinRM-Abfrage' : (res.stderr || 'keine Antwort per WinRM').split(/\r?\n/)[0].slice(0, 200)
    } catch (e) { blockFehler = e instanceof Error ? e.message : String(e) }
    for (const h of chunk) {
      const k = hostKey(h)
      const ok = roh.find(o => hostKey(String(o.Host || '')) === k && String(o.Boot || '').trim())
      if (ok) { ergebnis.set(k, { boot: String(ok.Boot).trim(), quelle: 'winrm' }); continue }
      const err = roh.find(o => o.Fehler && (hostKey(String(o.Host || '')) === k || String(o.Text || '').toUpperCase().includes(k)))
      ergebnis.set(k, { fehler: err?.Text ? `WinRM: ${err.Text}` : blockFehler || 'keine Antwort per WinRM' })
    }
  }

  // DCOM-Nachfrage für (wenige) Server, bei denen WinRM scheiterte
  const nachfragen = hosts.filter(h => !ergebnis.get(hostKey(h))?.boot)
  if (nachfragen.length > 0 && nachfragen.length <= DCOM_FALLBACK_MAX) {
    const script = [
      `$ErrorActionPreference='SilentlyContinue'`,
      `$opt = New-CimSessionOption -Protocol Dcom`,
      `$aus = @()`,
      `foreach ($n in @(${psListe(nachfragen)})) {`,
      `  try {`,
      `    $s = New-CimSession -ComputerName $n -SessionOption $opt -OperationTimeoutSec 10 -ErrorAction Stop`,
      `    $os = Get-CimInstance Win32_OperatingSystem -CimSession $s -OperationTimeoutSec 10 -ErrorAction Stop`,
      `    $aus += [pscustomobject]@{ Host = $n; Boot = $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm'); Fehler = ''; Text = '' }`,
      `    Remove-CimSession $s`,
      `  } catch { $aus += [pscustomobject]@{ Host = $n; Boot = ''; Fehler = 'DCOM'; Text = (([string]$_.Exception.Message) -split "\\r?\\n")[0] } }`,
      `}`,
      `ConvertTo-Json -InputObject @($aus) -Compress`,
    ].join('\n')
    try {
      const res = await api().runPowerShell(script, 180000)
      for (const o of parseRebootJson((res.stdout ?? '').trim())) {
        const k = hostKey(String(o.Host || ''))
        if (o.Boot && String(o.Boot).trim()) ergebnis.set(k, { boot: String(o.Boot).trim(), quelle: 'dcom' })
        else if (o.Text) { const alt = ergebnis.get(k); ergebnis.set(k, { fehler: `${alt?.fehler || 'WinRM fehlgeschlagen'} · DCOM: ${o.Text}` }) }
      }
    } catch { /* WinRM-Fehler bleibt stehen */ }
  }

  let updated = 0, fehler = 0
  for (const v of ergebnis.values()) { if (v.boot) updated++; else fehler++ }

  // Neustart erkannt = neue, spätere Startzeit als bisher bekannt (und nicht älter als 7 Tage)
  const neu: { key: string; host: string; boot: string; vorher: string }[] = []
  for (const [k, v] of ergebnis) {
    const vorher = status.servers[k]?.lastReboot
    if (!v.boot || !vorher || v.boot === vorher) continue
    const b = bootMs(v.boot), a = bootMs(vorher)
    if (!isNaN(b) && !isNaN(a) && b > a && Date.now() - b < 7 * 86400_000) {
      neu.push({ key: k, host: alle.find(h => hostKey(h) === k) || k, boot: v.boot, vorher })
    }
  }
  const details: Record<string, NeustartDetail> = neu.length
    ? await detailsZuNeustarts(neu.map(n => n.host), Object.fromEntries(neu.map(n => [n.host, n.vorher]))).catch(() => ({}))
    : {}
  const tileVon = (k: string) => cfg.tiles.find(t => hostKey(t.hostname) === k)
  const neustartEreignisse: ServerEreignis[] = neu.map(n => {
    // Ergebnis kommt je PSComputerName (so wie angefragt) — Kurzname als Rückfall
    const d = details[n.key] || details[n.key.split('.')[0]]
    return {
      id: `neustart|${n.key}|${n.boot}`, typ: 'neustart', host: n.host, bezeichnung: tileVon(n.key)?.description, ip: tileVon(n.key)?.ip,
      at: now, boot: n.boot, vorherBoot: n.vorher,
      art: d?.art || 'unbekannt', aktion: d?.aktion, ausAm: d?.ausAm, grund: d?.grund,
    }
  })
  // Nur die Reboot-Felder in den frischen Stand schreiben (Ping/Auslastung bleiben).
  await aktualisiereStatus(frisch => {
    const servers = { ...frisch.servers }
    for (const [k, v] of ergebnis) {
      const alt = servers[k] || { online: true, consecutiveFailures: 0 }
      servers[k] = v.boot
        ? { ...alt, lastReboot: v.boot, lastRebootCheckAt: now, lastRebootTryAt: now, lastRebootError: undefined, rebootQuelle: v.quelle }
        : { ...alt, lastRebootTryAt: now, lastRebootError: v.fehler }
    }
    // Teil-Abfrage (nur wieder erreichbare Server) verschiebt den Stundenrhythmus nicht
    return { ...frisch, rebootRunAt: nurHosts ? frisch.rebootRunAt : now, servers }
  })
  if (neustartEreignisse.length) await melde(neustartEreignisse, meldeZiele(cfg.tiles), by).catch(() => [])
  return { updated, fehler, neustarts: neustartEreignisse.length }
}

// ── Dienst-/Einstellungs-Prüfung gegen den Soll-Zustand ──────────────────────
/**
 * Prüft alle Server mit Soll-Zustand (oder nur `nurHosts`), die laut Ping erreichbar
 * sind — nur lesend und netzschonend gestaffelt: höchstens 2 Server gleichzeitig, nach
 * jedem Server eine kurze Pause mit Zufallsanteil (1,5–3 s), Reihenfolge: `zuerst`
 * (z. B. gerade wieder erreichbar), danach die am längsten nicht geprüften.
 * Neue kritische Fehler (die vorher in Ordnung waren) → Ereignis „pruefung" (Popup + Mail).
 * Kurz nach dem Hochfahren (`startetNoch`) wird nicht gemeldet; die nächste Prüfung entscheidet.
 * `auto` = automatischer Lauf (alle 5 min): läuft schon einer (Sperre `pruefungLaeuft`,
 * < 10 min alt, auch von einem anderen Rechner), wird dieser übersprungen.
 */
const PRUEF_PARALLEL = 2
const PRUEF_PAUSE_MS = 1500
const PRUEF_SPERRE_MS = 10 * 60 * 1000
/** `boots` = Startzeit je geprüftem Server (HOSTKEY) — die Neustart-Erkennung braucht diese nicht neu abzufragen. */
export interface ZustandsLauf { geprueft: number; probleme: number; boots: Record<string, string>; uebersprungen?: boolean }
export async function runZustandsPruefung(by: string, nurHosts?: string[], opt: { auto?: boolean; zuerst?: string[] } = {}): Promise<ZustandsLauf> {
  const cfg = await loadServerConfig()
  const status = await loadServerStatus()
  let token = ''
  if (opt.auto) {
    const s = status.pruefungLaeuft
    if (s && Date.now() - new Date(s.at).getTime() < PRUEF_SPERRE_MS) return { geprueft: 0, probleme: 0, boots: {}, uebersprungen: true }
    token = `${by}#${Math.random().toString(36).slice(2, 10)}`
    await aktualisiereStatus(f => ({ ...f, pruefungLaeuft: { by: token, at: new Date().toISOString() } }))
    if ((await loadServerStatus()).pruefungLaeuft?.by !== token) return { geprueft: 0, probleme: 0, boots: {}, uebersprungen: true }
  }
  try {
    return await zustandsPruefungLauf(by, cfg, status, nurHosts, opt.zuerst)
  } finally {
    if (token) await aktualisiereStatus(f => f.pruefungLaeuft?.by === token ? { ...f, pruefungLaeuft: undefined } : f).catch(() => false)
  }
}

async function zustandsPruefungLauf(by: string, cfg: ServerConfig, status: ServerMonitorStatus, nurHosts?: string[], zuerst?: string[]): Promise<ZustandsLauf> {
  const boots: Record<string, string> = {}
  const wunsch = nurHosts ? new Set(nurHosts.map(hostKey)) : null
  const vorn = new Set((zuerst || []).map(hostKey))
  const zuletzt = (t: ServerTile) => { const a = status.servers[hostKey(t.hostname)]?.pruefung?.am; const ms = a ? new Date(a).getTime() : NaN; return isNaN(ms) ? 0 : ms }
  const tiles = cfg.tiles
    .filter(t => t.hostname.trim() && (!wunsch || wunsch.has(hostKey(t.hostname))) && status.servers[hostKey(t.hostname)]?.online !== false)
    .sort((a, b) => (vorn.has(hostKey(b.hostname)) ? 1 : 0) - (vorn.has(hostKey(a.hostname)) ? 1 : 0) || zuletzt(a) - zuletzt(b))
  const zusammen: Record<string, Zusammenfassung> = {}
  const ereignisse: ServerEreignis[] = []
  let geprueft = 0, probleme = 0
  const warteschlange = [...tiles]
  const arbeiter = async (start: number) => {
    if (start) await sleep(start)
    for (let t = warteschlange.shift(); t; t = warteschlange.shift()) {
      const host = t.hostname.trim()
      const soll = await ladeSoll(host)
      if (!soll || !soll.punkte.length) continue
      const vorher = await ladeIst(host)
      const ist = await pruefe(host, soll)
      geprueft++
      if (ist.erreichbar && ist.boot) boots[hostKey(host)] = ist.boot
      // netzschonend: kurze Pause mit Zufallsanteil, bevor dieser Arbeiter den nächsten Server fragt
      if (warteschlange.length) await sleep(PRUEF_PAUSE_MS + Math.floor(Math.random() * PRUEF_PAUSE_MS))
      zusammen[hostKey(host)] = fasseZusammen(soll, ist)
      if (!ist.erreichbar || ist.startetNoch) continue
      const jetzt = kritischeFehler(soll, ist)
      probleme += jetzt.length
      // vorher schon gemeldete Fehler nicht erneut melden (nur wenn vorher NICHT „startet noch")
      const vorherFehler = vorher && vorher.erreichbar && !vorher.startetNoch ? new Set(kritischeFehler(soll, vorher).map(p => p.id)) : new Set<string>()
      const neu = jetzt.filter(p => !vorherFehler.has(p.id))
      if (neu.length) {
        const erg = new Map(ist.ergebnisse.map(e => [e.id, e]))
        ereignisse.push({
          id: `pruefung|${hostKey(host)}|${ist.am}`, typ: 'pruefung', host, bezeichnung: t.description, ip: t.ip, at: ist.am,
          probleme: jetzt.map(p => {
            const e = erg.get(p.id)
            // SEAL: die auslösende sysstatus-Zeile mitschicken („[E] DPF License invalid" …)
            const det = p.typ === 'seal' && e?.detail ? ` — ${e.detail.length > 220 ? e.detail.slice(0, 220) + ' …' : e.detail}`
              : istDcaDienst(p) ? ` — ${DCA_AUSFALL}` : ''
            return `${p.anzeige}: ${e?.status || 'nicht in Ordnung'}${p.typ === 'dienst' ? ` (${p.name})` : ''}${det}`
          }),
        })
      } else if (!jetzt.length && vorherFehler.size) {
        await addHistoryEntry(host, 'Prüfung: alle kritischen Prüfpunkte wieder in Ordnung', 'IT Admin Tool (Server-Monitor)').catch(() => undefined)
      }
    }
  }
  // höchstens PRUEF_PARALLEL gleichzeitig; der zweite Arbeiter startet versetzt, damit nie zwei Anfragen im Gleichtakt laufen
  await Promise.all(Array.from({ length: PRUEF_PARALLEL }, (_, i) => arbeiter(i * 1000)))
  if (Object.keys(zusammen).length) {
    await aktualisiereStatus(frisch => {
      const servers = { ...frisch.servers }
      for (const [k, z] of Object.entries(zusammen)) servers[k] = { ...(servers[k] || { online: true, consecutiveFailures: 0 }), pruefung: z }
      return { ...frisch, servers }
    })
  }
  if (ereignisse.length) await melde(ereignisse, meldeZiele(cfg.tiles), by).catch(() => [])
  return { geprueft, probleme, boots }
}

/** Nach manueller Prüfung/Behebung im Panel: Kurzfassung eines Servers aktualisieren. */
export async function setzePruefZusammenfassung(host: string, z: Zusammenfassung): Promise<void> {
  await aktualisiereStatus(frisch => ({ ...frisch, servers: { ...frisch.servers, [hostKey(host)]: { ...(frisch.servers[hostKey(host)] || { online: true, consecutiveFailures: 0 }), pruefung: z } } }))
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
  await aktualisiereStatus(frisch => {
    const neu = { ...frisch.servers }
    for (const [k, v] of Object.entries(servers)) if (v.metrics && v.metrics.at === now) neu[k] = { ...(neu[k] || { online: true, consecutiveFailures: 0 }), metrics: v.metrics }
    return { ...frisch, metricsRunAt: now, servers: neu }
  })
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
