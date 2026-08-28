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
export const VLAN_OVERRIDES_PATH = 'network/vlan_overrides.json'
export const DEFAULT_SITE = 'DEHAM'
const INVENTORY_FILE = 'inventory/inventory.json'

/** Gerätetyp für den „Was steht im VLAN?"-Check. */
export type DeviceType = 'printer' | 'phone' | 'pc' | 'server' | 'other'

/** VLAN-Beschriftung je Subnetz (CIDR ist der Schlüssel). */
export interface VlanDef {
  cidr: string
  vlanId?: string
  name?: string
  gateway?: string                 // Standard-Gateway des Subnetzes (aus der VLAN-Liste)
  description?: string
  expectedType?: DeviceType | ''   // erwarteter Gerätetyp (leer = keine Prüfung)
}
export interface VlanConfig {
  site: string
  vlans: VlanDef[]
  snmpCommunity?: string     // read-only Community für die SNMP-Erkennung (Default 'public')
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
      return { site: c.site || DEFAULT_SITE, vlans, snmpCommunity: c.snmpCommunity, updatedAt: c.updatedAt, updatedBy: c.updatedBy }
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
  if (!SEED_DEFS) SEED_DEFS = VLAN_SEED.map(s => ({ cidr: normalizeCidr(s.cidr) || s.cidr, vlanId: s.vlanId, name: s.name, gateway: s.gateway, expectedType: suggestExpectedType(s.name) || undefined }))
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
  seed: { cidr: string; vlanId: string; name: string; gateway?: string }[],
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
      vlans.push({ cidr: n, vlanId: s.vlanId, name: s.name, gateway: s.gateway || undefined, description: note, expectedType: suggestExpectedType(s.name) || undefined })
      idxByCidr.set(n, vlans.length - 1)
      added++
    } else {
      const v = vlans[i]
      let changed = false
      if (!v.vlanId && s.vlanId) { v.vlanId = s.vlanId; changed = true }
      if (!v.name && s.name) { v.name = s.name; changed = true }
      if (!v.gateway && s.gateway) { v.gateway = s.gateway; changed = true }
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
  // „Liste" = gepflegte Config VEREINIGT mit dem eingebauten VLAN-Seed — konsistent
  // mit der Anzeige (labelFor/findVlanDef nutzen denselben Seed-Fallback). Sonst
  // würden Subnetze, die nur über den Seed benannt sind (Config noch leer/nicht
  // importiert), fälschlich als „neu in AD" markiert, obwohl sie längst bekannt sind.
  const listMap = new Map<string, VlanDef>()
  for (const v of seedDefs()) { const n = normalizeCidr(v.cidr); if (n && !listMap.has(n)) listMap.set(n, v) }
  for (const v of config.vlans) { const n = normalizeCidr(v.cidr); if (n) listMap.set(n, v) }   // Config gewinnt (Labels)
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

export interface DeviceTypeResult {
  type: DeviceType | ''      // grober Typ (leer = per Ports nicht bestimmbar)
  detail: string             // z. B. "Port 9100"
  kind?: string              // sprechende Geräteart, z. B. "Drucker", "Windows-Geraet", "Kamera (RTSP)"
  ptr?: string               // Reverse-DNS (PTR) Hostname
  netbios?: string           // NetBIOS-Name (nbtstat)
  ports?: string             // offene Ports, kommagetrennt
  snmpName?: string          // SNMP sysName
  snmpDescr?: string         // SNMP sysDescr (Modell/Beschreibung)
  mac?: string               // MAC-Adresse (nur eigenes Subnetz, aus ARP)
  vendor?: string            // Hersteller (aus MAC-OUI oder SNMP)
}

/** Manuelle Typ-Korrektur pro IP (überschreibt die Auto-Erkennung, bleibt dauerhaft). */
export interface DeviceOverride { type?: DeviceType; kind?: string; note?: string; by?: string; at?: string }

/** Endnutzer-PC an der AD-Namenskonvention erkennen (Präfix de/deham/desch + Serial). */
export function isEndpointHostname(name: string): boolean {
  const n = (name || '').split('.')[0].trim().toLowerCase()
  return /^(deham|desch|de)[a-z0-9]/.test(n)
}

/**
 * Finaler Gerätetyp + sprechende Geräteart aus Name (Konvention) + Portprofil.
 * Priorität: Drucker/Telefon (per Port) → eindeutiger PC/Server (RDP/SMB) →
 * Endnutzer-PC per Name (de/deham/desch) → sonstiges Portprofil (Web/Linux) →
 * passiver Typ (Inventar/Hostname). So bleibt z. B. DEHAMKSA… als PC/Server (RDP),
 * während DE…-Geräte mit nur 80/443 korrekt als Endnutzer-PC erscheinen.
 */
export function refineDeviceType(name: string, act?: DeviceTypeResult, passiveType?: DeviceType): { type: DeviceType | ''; kind: string } {
  if (act?.type === 'printer') return { type: 'printer', kind: act.kind || 'Drucker' }
  if (act?.type === 'phone') return { type: 'phone', kind: act.kind || 'Telefon (VoIP)' }
  if (act?.type === 'pc') return { type: 'pc', kind: act.kind || 'PC/Laptop' }
  if (isEndpointHostname(name)) return { type: 'pc', kind: 'PC (Endnutzer)' }
  if (act?.type) return { type: act.type, kind: act.kind || '' }
  if (passiveType) return { type: passiveType, kind: '' }
  return { type: '', kind: act?.kind || '' }
}

/** Aktiver Tiefen-Check pro IP: offene Ports → Geräteart, plus Reverse-DNS (PTR)
 *  und NetBIOS-Name. Zieht so viel wie möglich über geroutetes TCP heraus, damit
 *  auch „unbekannte" IPs identifizierbar werden. Läuft chunked im Pool (auch für
 *  „alle Subnetze auf einmal"). Wird auf die ONLINE-Geräte angewandt. */
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
      // Pro IP: Portprofil + Geräteart + Reverse-DNS + NetBIOS.
      // Ausgabe: ip|type|detail|kind|ptr|netbios|ports
      const script = [
        `$ips=@(${arr})`,
        `function TP($ip,$p){ try { $c=New-Object System.Net.Sockets.TcpClient; $ok=$c.ConnectAsync($ip,$p).Wait(400); $c.Close(); return $ok } catch { return $false } }`,
        `foreach($ip in $ips){`,
        `  $open=@()`,
        `  foreach($p in 9100,515,631,5060,5061,3389,445,139,22,80,443,554,23){ if(TP $ip $p){ $open+=$p } }`,
        `  $t=''; $kind=''`,
        `  if($open -contains 9100 -or $open -contains 515 -or $open -contains 631){ $t='printer'; $kind='Drucker' }`,
        `  elseif($open -contains 5060 -or $open -contains 5061){ $t='phone'; $kind='Telefon (VoIP)' }`,
        `  elseif($open -contains 554){ $t='other'; $kind='Kamera (RTSP)' }`,
        `  elseif($open -contains 3389){ $t='pc'; $kind='PC/Server (RDP)' }`,
        `  elseif($open -contains 445 -or $open -contains 139){ $t='pc'; $kind='Windows-Geraet' }`,
        `  elseif($open -contains 22){ $t='other'; $kind='Linux/Netzwerkgeraet (SSH)' }`,
        `  elseif($open -contains 23){ $t='other'; $kind='Netzwerkgeraet (Telnet)' }`,
        `  elseif($open -contains 80 -or $open -contains 443){ $t='other'; $kind='Web-verwaltetes Geraet' }`,
        `  $ptr=''`,
        `  try { $r=Resolve-DnsName -Name $ip -Type PTR -QuickTimeout -EA SilentlyContinue; if($r){ $h=($r | Where-Object { $_.NameHost } | Select-Object -First 1).NameHost; if($h){ $ptr=$h } } } catch {}`,
        `  $nb=''`,
        `  try { $o=nbtstat -A $ip 2>$null; $mm=$o | Select-String '<00>\\s+UNIQUE'; if($mm){ $nb=(($mm[0].ToString().Trim()) -split '\\s+')[0] } } catch {}`,
        `  $detail=''; if($open.Count -gt 0){ $detail='Port '+$open[0] }`,
        `  Write-Output ($ip+'|'+$t+'|'+$detail+'|'+$kind+'|'+$ptr+'|'+$nb+'|'+($open -join ','))`,
        `}`,
      ].join('\n')
      const res = await api().runPowerShell(script, 120000).catch(() => ({ stdout: '', stderr: '', exitCode: -1, timedOut: true }))
      for (const line of (res.stdout ?? '').split(/\r?\n/)) {
        const m = line.trim().split('|')
        if (m.length < 2) continue
        const ip = canonicalIp(m[0]) || m[0]
        if (!ip) continue
        const rawType = (m[1] || '') as DeviceType | ''
        const type: DeviceType | '' = ['printer', 'phone', 'pc', 'server', 'other'].includes(rawType) ? rawType : ''
        const detail = m[2] || ''
        const kind = m[3] || ''
        const ptr = m[4] || ''
        const netbios = m[5] || ''
        const ports = m[6] || ''
        // Auch ohne Typ speichern, wenn es Zusatzinfos gibt (macht "unbekannt" identifizierbar).
        if (!type && !kind && !ptr && !netbios && !ports) continue
        result.set(ip, { type, detail, kind: kind || undefined, ptr: ptr || undefined, netbios: netbios || undefined, ports: ports || undefined })
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

// ── Manuelle Typ-Overrides (pro IP, dauerhaft) ────────────────────────────────

export async function loadOverrides(): Promise<Record<string, DeviceOverride>> {
  try {
    const c = await api().netReadJson<Record<string, DeviceOverride>>(VLAN_OVERRIDES_PATH)
    if (c && typeof c === 'object') return c
  } catch { /* keine */ }
  return {}
}
export async function saveOverrides(map: Record<string, DeviceOverride>): Promise<boolean> {
  try { return await api().netWriteJson(VLAN_OVERRIDES_PATH, map) } catch { return false }
}

// ── SNMP-Tiefenerkennung (sysDescr/sysName -> Geräteart) ──────────────────────
// Läuft über die SNMP-IPC (Main-Prozess, net-snmp). Identifiziert v. a. Infra-
// Geräte (Drucker/Switch/USV/Kamera/AP), die per TCP-Port nur „Sonstiges" wären.

const SNMP_SYSDESCR = '1.3.6.1.2.1.1.1.0'
const SNMP_SYSNAME = '1.3.6.1.2.1.1.5.0'

/** sysDescr-Text -> {type, kind}. Nur sichere Nicht-PC-Klassen setzen einen Typ. */
function snmpClassify(descr: string): { type?: DeviceType; kind?: string } {
  const d = (descr || '').toLowerCase()
  if (/jetdirect|laserjet|officejet|designjet|lexmark|kyocera|ricoh|brother|\bcanon\b|\bepson\b|zebra|utax|sharp mfp|printer|drucker/.test(d)) return { type: 'printer', kind: 'Drucker (SNMP)' }
  if (/cisco|catalyst|\bios\b|aruba|procurve|\bhpe?\b.*switch|switch|juniper|junos|extreme|mikrotik|netgear|zyxel/.test(d)) return { type: 'other', kind: 'Switch/Netzwerk (SNMP)' }
  if (/\bapc\b|smart-ups|\bups\b|eaton|riello|usv/.test(d)) return { type: 'other', kind: 'USV (SNMP)' }
  if (/\baxis\b|hikvision|dahua|mobotix|camera|kamera|network camera/.test(d)) return { type: 'other', kind: 'Kamera (SNMP)' }
  if (/access point|aironet|\binstant\b|\bwlan\b|\bwifi\b|wireless ap/.test(d)) return { type: 'other', kind: 'Access Point (SNMP)' }
  return {}
}

export interface SnmpResult { snmpName?: string; snmpDescr?: string; type?: DeviceType; kind?: string; vendor?: string }

export async function snmpEnrich(
  ips: string[],
  community = 'public',
  onProgress?: (done: number, total: number) => void,
  isAborted?: () => boolean,
  concurrency = 10,
): Promise<Map<string, SnmpResult>> {
  const result = new Map<string, SnmpResult>()
  const list = [...new Set(ips.map(ip => canonicalIp(ip) || ip).filter(Boolean))]
  let done = 0, idx = 0
  async function worker() {
    for (;;) {
      if (isAborted?.()) return
      const ip = list[idx++]
      if (!ip) return
      try {
        const r = await api().snmpQuery({ host: ip, op: 'get', oids: [SNMP_SYSDESCR, SNMP_SYSNAME], version: 'v2c', community, timeoutMs: 2500, retries: 1 })
        if (r.success && r.varbinds && r.varbinds.length) {
          const descr = String(r.varbinds.find(v => v.oid === SNMP_SYSDESCR && v.type !== 'error')?.value ?? '').trim()
          const name = String(r.varbinds.find(v => v.oid === SNMP_SYSNAME && v.type !== 'error')?.value ?? '').trim()
          if (descr || name) {
            const cls = snmpClassify(descr)
            result.set(ip, { snmpName: name || undefined, snmpDescr: descr || undefined, type: cls.type, kind: cls.kind, vendor: vendorFromSysDescr(descr) })
          }
        }
      } catch { /* Gerät ohne SNMP -> ignorieren */ }
      done++
      onProgress?.(Math.min(done, list.length), list.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()))
  return result
}

/** Hersteller grob aus sysDescr ableiten (ergänzt/ersetzt die MAC-OUI-Angabe). */
function vendorFromSysDescr(descr: string): string | undefined {
  const d = (descr || '').toLowerCase()
  const map: [RegExp, string][] = [
    [/hewlett|hp |hpe |jetdirect|laserjet|procurve/, 'HP/HPE'], [/lexmark/, 'Lexmark'], [/kyocera/, 'Kyocera'],
    [/ricoh/, 'Ricoh'], [/brother/, 'Brother'], [/canon/, 'Canon'], [/epson/, 'Epson'], [/zebra/, 'Zebra'],
    [/cisco/, 'Cisco'], [/aruba/, 'Aruba'], [/juniper|junos/, 'Juniper'], [/mikrotik/, 'MikroTik'],
    [/\bapc\b|schneider/, 'APC/Schneider'], [/eaton/, 'Eaton'], [/axis/, 'Axis'], [/hikvision/, 'Hikvision'],
    [/dell/, 'Dell'], [/fujitsu/, 'Fujitsu'], [/lenovo/, 'Lenovo'], [/synology/, 'Synology'], [/qnap/, 'QNAP'],
  ]
  for (const [re, v] of map) if (re.test(d)) return v
  return undefined
}

// ── MAC-Adresse + Hersteller (nur eigenes Subnetz, aus ARP-Tabelle) ───────────
// Cross-Subnet-Hosts erscheinen NICHT in der ARP-Tabelle (routen übers Gateway).
// Der vorherige Ping-Sweep (pingBatch) hat den ARP-Cache des Admin-PCs gefüllt.

/** Liest die lokale ARP/Neighbor-Tabelle des Admin-PCs -> Map<IP, MAC>. */
export async function readArpTable(): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const script = [
    `try {`,
    `  $n = Get-NetNeighbor -AddressFamily IPv4 -EA Stop | Where-Object { $_.State -in 'Reachable','Stale','Permanent' -and $_.LinkLayerAddress -and $_.LinkLayerAddress -ne '00-00-00-00-00-00' }`,
    `  $n | ForEach-Object { "$($_.IPAddress)|$($_.LinkLayerAddress)" }`,
    `} catch {`,
    `  (arp -a) -split "\\r?\\n" | Where-Object { $_ -match '(\\d+\\.\\d+\\.\\d+\\.\\d+)\\s+([0-9a-fA-F-]{17})' } | ForEach-Object { $m=[regex]::Match($_,'(\\d+\\.\\d+\\.\\d+\\.\\d+)\\s+([0-9a-fA-F-]{17})'); "$($m.Groups[1].Value)|$($m.Groups[2].Value)" }`,
    `}`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 20000)
    for (const line of (res.stdout ?? '').split(/\r?\n/)) {
      const [ip, mac] = line.trim().split('|')
      if (!ip || !mac) continue
      const cip = canonicalIp(ip) || ip
      const m = mac.replace(/-/g, ':').toUpperCase()
      if (/^([0-9A-F]{2}:){5}[0-9A-F]{2}$/.test(m)) out.set(cip, m)
    }
  } catch { /* ARP nicht lesbar */ }
  return out
}

// Kleine, erweiterbare OUI-Tabelle (Präfix ohne Trenner, GROSS) -> Hersteller.
// Best-effort; unbekannt -> leer. Zuverlässiger ist bei SNMP-Geräten die sysDescr.
const OUI_VENDORS: Record<string, string> = {
  '005056': 'VMware', '000C29': 'VMware', '000569': 'VMware',
  '00155D': 'Microsoft (Hyper-V)', '00509F': 'Cisco',
  '3C0754': 'Apple', 'F01898': 'Apple', 'ACBC32': 'Apple',
  '000BDB': 'Dell', 'F8BC12': 'Dell', 'B8CA3A': 'Dell', '18DBF2': 'Dell',
  '3CD92B': 'HP/HPE', '9457A5': 'HP/HPE', '001560': 'HP/HPE', '80CE62': 'HP/HPE',
  '00074D': 'Zebra', 'AC3FA4': 'Zebra',
  '00206B': 'Konica Minolta', '00C0EE': 'Kyocera', '002673': 'Ricoh', '30055C': 'Brother',
  '00408C': 'Axis', 'ACCC8E': 'Axis', '00C0B7': 'APC',
}

/** Hersteller aus MAC-OUI (erste 3 Oktette). */
export function vendorFromMac(mac?: string): string | undefined {
  if (!mac) return undefined
  const p = mac.replace(/[:-]/g, '').toUpperCase().slice(0, 6)
  return OUI_VENDORS[p]
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
