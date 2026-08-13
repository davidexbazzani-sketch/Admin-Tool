// ── VLAN-/Subnetz-Service ─────────────────────────────────────────────────────
// Ein VLAN wird hier auf ein IP-Subnetz (CIDR) abgebildet. Subnetze kommen aus
// dem AD (Sites & Services, siehe userPresenceScan.getSiteSubnets); die IT
// beschriftet jedes Subnetz einmalig mit VLAN-ID + Name (zentral gespeichert).
// Geräte je VLAN kommen kombiniert aus (a) dem Inventar (mit IP) und (b) einem
// Live-Ping-Sweep + IP→Gerät-Auflösung — wiederverwendet aus userPresenceScan.
//
// Speicher (Netzlaufwerk):
//   network/vlans.json       — VLAN-Beschriftung je Subnetz (Config)
//   network/vlan_scan.json   — letzter Scan (Cache, damit beim Öffnen sofort etwas da ist)

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { expandSubnets, pingBatch, scanIpsBatch, type ComputerRecord } from './userPresenceScan'
import { VLAN_SEED } from '../data/vlanSeed'

export const VLAN_CONFIG_PATH = 'network/vlans.json'
export const VLAN_SCAN_PATH = 'network/vlan_scan.json'
export const VLAN_TYPES_PATH = 'network/vlan_device_types.json'
export const DEFAULT_SITE = 'DEHAM'
const INVENTORY_FILE = 'inventory/inventory.json'

/** Gerätetyp für den „Was steht im VLAN?"-Check. */
export type DeviceType = 'printer' | 'phone' | 'pc' | 'server' | 'other'

/** VLAN-Beschriftung je Subnetz (CIDR ist der Schlüssel). */
export interface VlanDef {
  cidr: string
  vlanId?: string
  name?: string
  description?: string
  expectedType?: DeviceType | ''   // erwarteter Gerätetyp (leer = keine Prüfung)
}
export interface VlanConfig {
  site: string
  vlans: VlanDef[]
  updatedAt?: string
  updatedBy?: string
}

/** Ein Gerät in der VLAN-Ansicht (aus Scan und/oder Inventar). */
export interface VlanDevice {
  ip: string
  hostname?: string
  user?: string            // angemeldeter Benutzer (SamAccountName)
  online: boolean          // per Ping erreichbar
  scanned: boolean         // lag in einem gescannten Subnetz (Erreichbarkeit ist damit aussagekräftig)
  source: 'inventory' | 'scan' | 'both'
  cidr?: string            // zugeordnetes Subnetz (leer = unbekannt)
  deviceType?: DeviceType  // erkannter Gerätetyp (leer = unbekannt)
  typeSource?: 'inventory' | 'ports' | 'hostname'  // woher der Typ stammt
  typeDetail?: string      // z. B. offene Ports
}

export interface VlanScanCache {
  scanDate: string
  scannedBy?: string
  site: string
  subnets: string[]
  capped?: boolean
  devices: VlanDevice[]
}

// ── Config laden/speichern ────────────────────────────────────────────────────

export async function loadVlanConfig(): Promise<VlanConfig> {
  try {
    const c = await api().netReadJson<VlanConfig>(VLAN_CONFIG_PATH)
    if (c && Array.isArray(c.vlans)) {
      // Nur wohlgeformte Einträge übernehmen (schützt labelFor/Editor vor kaputten Datensätzen).
      const vlans = c.vlans.filter(v => v && typeof v === 'object' && typeof (v as VlanDef).cidr === 'string')
      return { site: c.site || DEFAULT_SITE, vlans, updatedAt: c.updatedAt, updatedBy: c.updatedBy }
    }
  } catch { /* noch keine */ }
  return { site: DEFAULT_SITE, vlans: [] }
}

export async function saveVlanConfig(cfg: VlanConfig, by: string): Promise<boolean> {
  const payload: VlanConfig = { ...cfg, updatedBy: by, updatedAt: new Date().toISOString() }
  try { return await api().netWriteJson(VLAN_CONFIG_PATH, payload) } catch { return false }
}

export async function loadScanCache(): Promise<VlanScanCache | null> {
  try {
    const c = await api().netReadJson<VlanScanCache>(VLAN_SCAN_PATH)
    if (c && Array.isArray(c.devices)) return c
  } catch { /* kein Cache */ }
  return null
}

export async function saveScanCache(cache: VlanScanCache): Promise<void> {
  try { await api().netWriteJson(VLAN_SCAN_PATH, cache) } catch { /* offline — egal */ }
}

// ── IP-/CIDR-Helfer ───────────────────────────────────────────────────────────

export function ipToInt(ip: string): number {
  const p = (ip || '').trim().split('.')
  if (p.length !== 4) return -1
  let n = 0
  for (const part of p) {
    // Strikt: nur 1–3 Ziffern je Oktett (verhindert '', ' ', Hex, Exponent,
    // fehlende Oktette wie '1.2.3.' → sonst würden Tippfehler als IP durchgehen).
    if (!/^\d{1,3}$/.test(part)) return -1
    const b = Number(part)
    if (b > 255) return -1
    n = (n * 256) + b
  }
  return n >>> 0
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.')
}

/** Kanonische IPv4-Schreibweise (z. B. '010.1.2.3' → '10.1.2.3'); '' wenn ungültig. */
export function canonicalIp(ip: string): string {
  const n = ipToInt(ip)
  return n < 0 ? '' : intToIp(n >>> 0)
}

/** Normalisiert ein CIDR auf die KANONISCHE Netzadresse (Host-Bits maskiert,
 *  keine führenden Nullen); gibt '' zurück, wenn ungültig. So vergleichen sich
 *  unterschiedlich geschriebene, aber gleiche Subnetze per String korrekt. */
export function normalizeCidr(cidr: string): string {
  const t = (cidr || '').trim()
  const m = t.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/)
  if (!m) return ''
  const base = ipToInt(m[1])
  const bits = Number(m[2])
  if (base < 0 || bits < 0 || bits > 32) return ''
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0
  const network = (base & mask) >>> 0
  return `${intToIp(network)}/${bits}`
}

/** true, wenn die IP im CIDR liegt (IPv4). */
export function ipInCidr(ip: string, cidr: string): boolean {
  const norm = normalizeCidr(cidr)
  if (!norm) return false
  const [base, bitsStr] = norm.split('/')
  const bits = Number(bitsStr)
  const ipInt = ipToInt(ip)
  const baseInt = ipToInt(base)
  if (ipInt < 0 || baseInt < 0) return false
  if (bits === 0) return true
  const mask = (0xFFFFFFFF << (32 - bits)) >>> 0
  return ((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0)
}

/** Findet das (spezifischste) Subnetz, in dem die IP liegt. */
export function matchSubnet(ip: string, cidrs: string[]): string | undefined {
  let best: string | undefined
  let bestBits = -1
  for (const c of cidrs) {
    const norm = normalizeCidr(c)
    if (!norm) continue
    if (ipInCidr(ip, norm)) {
      const bits = Number(norm.split('/')[1])
      if (bits > bestBits) { bestBits = bits; best = norm }
    }
  }
  return best
}

/** Spezifischsten (größte Präfixlänge) Eintrag finden, dessen CIDR die Basis-IP enthält. */
function mostSpecificContaining(baseIp: string, defs: VlanDef[]): VlanDef | undefined {
  let best: VlanDef | undefined
  let bestBits = -1
  for (const d of defs) {
    const n = normalizeCidr(d.cidr)
    if (!n) continue
    if (ipInCidr(baseIp, n)) { const bits = Number(n.split('/')[1]); if (bits > bestBits) { bestBits = bits; best = d } }
  }
  return best
}

// Der gefundene VLAN-Seed als VlanDef-Liste (inkl. abgeleitetem Soll-Typ), damit
// die Namen auch OHNE Import angezeigt werden. Nur einmal aufbauen.
let SEED_DEFS: VlanDef[] | null = null
function seedDefs(): VlanDef[] {
  if (!SEED_DEFS) SEED_DEFS = VLAN_SEED.map(s => ({ cidr: normalizeCidr(s.cidr) || s.cidr, vlanId: s.vlanId, name: s.name, expectedType: suggestExpectedType(s.name) || undefined }))
  return SEED_DEFS
}

/** VLAN-Definition zu einem Subnetz finden — tolerant: erst exakt, dann per
 *  Netz-Enthaltensein (fängt /23-vs-/24-Abweichungen ab), zuerst aus der Config,
 *  danach aus dem gefundenen VLAN-Seed (Anzeige auch ohne Import). */
export function findVlanDef(cidr: string, config: VlanConfig): VlanDef | undefined {
  const target = normalizeCidr(cidr)
  if (!target) return undefined
  const base = target.split('/')[0]
  const exactCfg = config.vlans.find(v => normalizeCidr(v.cidr) === target)
  if (exactCfg) return exactCfg
  const containCfg = mostSpecificContaining(base, config.vlans)
  if (containCfg && (containCfg.vlanId || containCfg.name)) return containCfg
  const sd = seedDefs()
  const exactSeed = sd.find(v => normalizeCidr(v.cidr) === target)
  if (exactSeed) return exactSeed
  return mostSpecificContaining(base, sd)
}

/** Anzeige-Label für ein Subnetz (VLAN-ID/Name aus Config/Seed, sonst CIDR). */
export function labelFor(cidr: string, config: VlanConfig): string {
  const def = findVlanDef(cidr, config)
  const parts: string[] = []
  if (def?.vlanId) parts.push(`VLAN ${def.vlanId}`)
  if (def?.name) parts.push(def.name)
  if (parts.length === 0) return cidr
  return `${parts.join(' · ')} (${cidr})`
}

// ── Import einer VLAN-Liste (Seed) + Drift-Check gegen AD/Scan ─────────────────

/** Mischt eine Liste (cidr/vlanId/name) in die Config. Bestehende, bereits
 *  gepflegte Labels bleiben unangetastet (nur leere Felder werden gefüllt,
 *  fehlende Subnetze ergänzt). `note` landet als Beschreibung bei neuen/ergänzten. */
export function mergeVlanSeed(
  config: VlanConfig,
  seed: { cidr: string; vlanId: string; name: string }[],
  note: string,
): { merged: VlanConfig; added: number; updated: number } {
  const vlans: VlanDef[] = config.vlans.map(v => ({ ...v }))
  const idxByCidr = new Map<string, number>()
  vlans.forEach((v, i) => { const n = normalizeCidr(v.cidr); if (n) idxByCidr.set(n, i) })
  let added = 0, updated = 0
  for (const s of seed) {
    const n = normalizeCidr(s.cidr)
    if (!n) continue
    const i = idxByCidr.get(n)
    if (i === undefined) {
      vlans.push({ cidr: n, vlanId: s.vlanId, name: s.name, description: note, expectedType: suggestExpectedType(s.name) || undefined })
      idxByCidr.set(n, vlans.length - 1)
      added++
    } else {
      const v = vlans[i]
      let changed = false
      if (!v.vlanId && s.vlanId) { v.vlanId = s.vlanId; changed = true }
      if (!v.name && s.name) { v.name = s.name; changed = true }
      if (!v.expectedType) { const et = suggestExpectedType(s.name || v.name); if (et) { v.expectedType = et; changed = true } }
      if (changed && !v.description) v.description = note
      if (changed) updated++
    }
  }
  return { merged: { ...config, vlans }, added, updated }
}

export type DriftStatus = 'active' | 'empty' | 'not-in-ad' | 'new-in-ad'
export interface VlanDrift {
  cidr: string
  vlanId?: string
  name?: string
  inList: boolean
  inAd: boolean
  deviceCount: number
  onlineCount: number
  status: DriftStatus
  note: string
}

const DRIFT_RANK: Record<DriftStatus, number> = { 'not-in-ad': 0, 'new-in-ad': 1, 'empty': 2, 'active': 3 }

/** Gleicht die VLAN-Liste gegen AD-Subnetze und den letzten Scan ab und markiert
 *  Abweichungen (veraltet / neu / leer / bestätigt). */
export function computeVlanDrift(config: VlanConfig, adCidrs: string[], devices: VlanDevice[]): VlanDrift[] {
  const adSet = new Set(adCidrs.map(normalizeCidr).filter(Boolean))
  const listMap = new Map<string, VlanDef>()
  for (const v of config.vlans) { const n = normalizeCidr(v.cidr); if (n) listMap.set(n, v) }
  const counts = new Map<string, { t: number; o: number }>()
  for (const d of devices) {
    if (!d.cidr) continue
    const c = counts.get(d.cidr) ?? { t: 0, o: 0 }
    c.t++; if (d.online) c.o++
    counts.set(d.cidr, c)
  }
  const all = new Set<string>([...listMap.keys(), ...adSet])
  const out: VlanDrift[] = []
  for (const cidr of all) {
    const def = listMap.get(cidr)
    const inList = listMap.has(cidr)
    const inAd = adSet.has(cidr)
    const cnt = counts.get(cidr) ?? { t: 0, o: 0 }
    let status: DriftStatus, note: string
    if (!inList && inAd) { status = 'new-in-ad'; note = 'In AD (Sites & Services) vorhanden, aber nicht in der Liste — evtl. neues Subnetz.' }
    else if (inList && !inAd) { status = 'not-in-ad'; note = 'In der Liste, aber nicht in den AD-Subnetzen — evtl. veraltet/entfernt.' }
    else if (cnt.t === 0) { status = 'empty'; note = 'Keine Geräte im letzten Scan — evtl. ungenutzt (oder noch nicht gescannt).' }
    else { status = 'active'; note = `Bestätigt: ${cnt.t} Gerät(e), ${cnt.o} online.` }
    out.push({ cidr, vlanId: def?.vlanId, name: def?.name, inList, inAd, deviceCount: cnt.t, onlineCount: cnt.o, status, note })
  }
  out.sort((a, b) => DRIFT_RANK[a.status] - DRIFT_RANK[b.status] || ipToInt(a.cidr.split('/')[0]) - ipToInt(b.cidr.split('/')[0]))
  return out
}

// ── Gerätetyp-Check („Was steht im VLAN?") ────────────────────────────────────

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  printer: 'Drucker', phone: 'Telefon (VoIP)', pc: 'PC/Laptop', server: 'Server', other: 'Sonstiges',
}

/** Inventar-Kategorie → Gerätetyp (leer = unklar). */
export function categoryToType(category: string): DeviceType | '' {
  const c = (category || '').toLowerCase()
  if (/druck|print/.test(c)) return 'printer'
  if (/telefon|phone|voip|xelion|dect|sip/.test(c)) return 'phone'
  if (/server/.test(c)) return 'server'
  if (/computer|laptop|notebook|workstation|desktop|\bpc\b/.test(c)) return 'pc'
  return ''
}

/** Hostname-Heuristik (AD-Konvention Präfix de/deham/desch + Serial = PC). */
export function classifyByHostname(hostname: string): DeviceType | '' {
  const h = (hostname || '').toLowerCase()
  if (!h) return ''
  if (/print|drucker|\bprn\b/.test(h)) return 'printer'
  if (/phone|voip|\bsip\b|telefon/.test(h)) return 'phone'
  if (/^(deham|desch|de)[a-z0-9]/.test(h)) return 'pc'
  return ''
}

/** Vorschlag für den erwarteten VLAN-Typ aus dem VLAN-Namen. */
export function suggestExpectedType(name?: string): DeviceType | '' {
  const n = (name || '').toLowerCase()
  if (/print|druck/.test(n)) return 'printer'
  if (/voip|phone|telefon/.test(n)) return 'phone'
  if (/server/.test(n)) return 'server'
  if (/office_lan|shopfloor_lan|_management\b|lan_management|office_wireless|shopfloor_wireless/.test(n)) return 'pc'
  return ''
}

/** Passt der erkannte Typ NICHT zum erwarteten? (Unbekannt ⇒ kein harter Verstoß.) */
export function isTypeMismatch(deviceType: DeviceType | undefined, expected: DeviceType | '' | undefined): boolean {
  if (!expected || !deviceType) return false
  return deviceType !== expected
}

/** Passiver Gerätetyp aus dem Inventar (per IP, sonst Hostname) + Hostname-Heuristik. */
export function classifyDevicesPassive(
  devices: VlanDevice[],
  inventory: InventoryItem[],
): Map<string, { type: DeviceType; source: 'inventory' | 'hostname' }> {
  const byIp = new Map<string, string>()      // IP → category
  const byHost = new Map<string, string>()    // hostname(lower) → category
  for (const it of Array.isArray(inventory) ? inventory : []) {
    const ip = canonicalIp((it.ip || '').trim())
    if (ip) byIp.set(ip, it.category || '')
    if (it.name) byHost.set(it.name.trim().toLowerCase(), it.category || '')
  }
  const out = new Map<string, { type: DeviceType; source: 'inventory' | 'hostname' }>()
  for (const d of devices) {
    const cat = byIp.get(d.ip) || (d.hostname ? byHost.get(d.hostname.trim().toLowerCase()) : '') || ''
    const invType = categoryToType(cat)
    if (invType) { out.set(d.ip, { type: invType, source: 'inventory' }); continue }
    const hnType = classifyByHostname(d.hostname || '')
    if (hnType) out.set(d.ip, { type: hnType, source: 'hostname' })
  }
  return out
}

export interface DeviceTypeResult { type: DeviceType; detail: string }

/** Aktiver Port-Check: 9100/515/631 ⇒ Drucker, 5060/5061 (TCP) ⇒ Telefon-Hinweis,
 *  3389/445 ⇒ PC/Server. Zuverlässig quer über Subnetze (geroutetes TCP).
 *  Chunks laufen parallel (Pool), damit auch „alle Subnetze auf einmal" zügig geht. */
export async function probeDeviceTypes(
  ips: string[],
  onProgress?: (done: number, total: number) => void,
  isAborted?: () => boolean,
  concurrency = 8,
): Promise<Map<string, DeviceTypeResult>> {
  const result = new Map<string, DeviceTypeResult>()
  const list = [...new Set(ips.map(ip => canonicalIp(ip) || ip).filter(Boolean))]
  const CHUNK = 16
  const chunks: string[][] = []
  for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK))

  let done = 0
  let idx = 0
  async function worker() {
    for (;;) {
      if (isAborted?.()) return
      const chunk = chunks[idx++]
      if (!chunk) return
      const arr = chunk.map(ip => `'${ip}'`).join(',')
      // Pro IP: früh-abbrechende Portprüfung; gibt "ip|type|detail" aus.
      const script = [
        `$ips=@(${arr})`,
        `function TP($ip,$p){ try { $c=New-Object System.Net.Sockets.TcpClient; $ok=$c.ConnectAsync($ip,$p).Wait(500); $c.Close(); return $ok } catch { return $false } }`,
        `foreach($ip in $ips){`,
        `  $t=''; $d=''`,
        `  if(TP $ip 9100){$t='printer';$d='9100'} elseif(TP $ip 515){$t='printer';$d='515'} elseif(TP $ip 631){$t='printer';$d='631'}`,
        `  elseif(TP $ip 5060){$t='phone';$d='5060'} elseif(TP $ip 5061){$t='phone';$d='5061'}`,
        `  elseif(TP $ip 3389){$t='pc';$d='3389'} elseif(TP $ip 445){$t='pc';$d='445'}`,
        `  Write-Output ($ip+'|'+$t+'|'+$d)`,
        `}`,
      ].join('\n')
      const res = await api().runPowerShell(script, 60000).catch(() => ({ stdout: '', stderr: '', exitCode: -1, timedOut: true }))
      for (const line of (res.stdout ?? '').split(/\r?\n/)) {
        const m = line.trim().split('|')
        if (m.length < 2 || !m[1]) continue
        const ip = canonicalIp(m[0]) || m[0]
        const type = m[1] as DeviceType
        if (['printer', 'phone', 'pc', 'server', 'other'].includes(type)) {
          result.set(ip, { type, detail: m[2] ? `Port ${m[2]}` : '' })
        }
      }
      done += chunk.length
      onProgress?.(Math.min(done, list.length), list.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, () => worker()))
  return result
}

// ── Gerätetyp-Ergebnisse persistieren (bis zum nächsten Scan) ─────────────────
// Gebunden an das Scan-Datum: nach einem NEUEN Scan passt das gespeicherte
// scanDate nicht mehr → die Typen gelten als „veraltet" und werden nicht mehr
// geladen (bis erneut geprüft wird).

export interface DeviceTypeCache { scanDate: string; types: Record<string, DeviceTypeResult> }

export async function loadDeviceTypes(): Promise<DeviceTypeCache | null> {
  try {
    const c = await api().netReadJson<DeviceTypeCache>(VLAN_TYPES_PATH)
    if (c && c.types && typeof c.types === 'object') return { scanDate: c.scanDate || '', types: c.types }
  } catch { /* keine */ }
  return null
}
export async function saveDeviceTypes(scanDate: string, types: Record<string, DeviceTypeResult>): Promise<void> {
  try { await api().netWriteJson(VLAN_TYPES_PATH, { scanDate, types } satisfies DeviceTypeCache) } catch { /* offline — egal */ }
}

// ── Discovery (Ping-Sweep + IP→Gerät + Inventar-Merge) ────────────────────────

export interface DiscoverProgress { phase: 'ping' | 'resolve'; done: number; total: number; up: number }

const PING_CHUNK = 512
const RESOLVE_CHUNK = 64

/**
 * Ermittelt alle Geräte in den angegebenen Subnetzen: Ping-Sweep → IP→Gerät-
 * Auflösung (Hostname/Benutzer) → Merge mit Inventar. Chunked für Fortschritt +
 * Abbrechbarkeit; respektiert die vorhandenen Batch-Grenzen aus userPresenceScan.
 */
export async function discoverDevices(
  cidrs: string[],
  onProgress?: (p: DiscoverProgress) => void,
  isAborted?: () => boolean,
): Promise<{ devices: VlanDevice[]; capped: boolean; pingError?: string }> {
  const normCidrs = [...new Set(cidrs.map(normalizeCidr).filter(Boolean))]
  const { ips, capped } = expandSubnets(normCidrs)

  // 1) Ping-Sweep (chunked). Ping-Fehler sammeln, um einen komplett fehlgeschlagenen
  //    Sweep später nicht still als "0 Geräte online" zu präsentieren.
  const up: string[] = []
  let pingError = ''
  for (let i = 0; i < ips.length; i += PING_CHUNK) {
    if (isAborted?.()) break
    const chunk = ips.slice(i, i + PING_CHUNK)
    const r = await pingBatch(chunk)
    up.push(...r.up)
    if (r.error && !pingError) pingError = r.error
    onProgress?.({ phase: 'ping', done: Math.min(i + PING_CHUNK, ips.length), total: ips.length, up: up.length })
  }
  const upSet = new Set(up)   // up-IPs stammen aus expandSubnets → bereits kanonisch

  // 2) IP→Gerät (Hostname/Benutzer), chunked; activate=false → kein WinRM (leichter)
  const records: ComputerRecord[] = []
  for (let i = 0; i < up.length; i += RESOLVE_CHUNK) {
    if (isAborted?.()) break
    const chunk = up.slice(i, i + RESOLVE_CHUNK)
    const recs = await scanIpsBatch(chunk, false)
    records.push(...recs)
    onProgress?.({ phase: 'resolve', done: Math.min(i + RESOLVE_CHUNK, up.length), total: up.length, up: up.length })
  }

  // 3) Geräteliste aufbauen — Schlüssel IMMER kanonische IP (damit Scan- und
  //    Inventar-Einträge derselben IP verlässlich zusammenfinden)
  const byIp = new Map<string, VlanDevice>()
  for (const ip of up) byIp.set(ip, { ip, online: true, scanned: true, source: 'scan' })
  for (const r of records) {
    const key = canonicalIp(r.ip) || r.ip
    if (!key) continue
    const d = byIp.get(key) ?? { ip: key, online: upSet.has(key), scanned: true, source: 'scan' as const }
    if (r.hostname && r.hostname !== r.ip) d.hostname = r.hostname
    if (r.sam) d.user = r.sam
    byIp.set(key, d)
  }

  // 4) Inventar mergen (Geräte mit IP) — IP kanonisieren vor Lookup
  const inv = (await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)) ?? []
  for (const it of Array.isArray(inv) ? inv : []) {
    const ip = canonicalIp((it.ip || '').trim())
    if (!ip) continue
    const existing = byIp.get(ip)
    if (existing) {
      existing.source = 'both'
      if (!existing.hostname && it.name) existing.hostname = it.name
    } else {
      byIp.set(ip, { ip, hostname: it.name || undefined, online: false, scanned: false, source: 'inventory' })
    }
  }

  // 5) Subnetz zuordnen; „scanned" gilt für alles, was in einem gescannten Subnetz liegt
  const devices = [...byIp.values()]
  for (const d of devices) {
    d.cidr = matchSubnet(d.ip, normCidrs)
    if (d.cidr) d.scanned = true
  }
  devices.sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip))
  return { devices, capped, pingError: pingError || undefined }
}
