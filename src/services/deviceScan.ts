// ── Geräte-Scan: IP / MAC / Seriennummer (alle 3 Tage 15:00 + manuell) ────────
// Liest für alle Inventar-Geräte (Server, Computer, Drucker) IP-Adresse,
// MAC-Adresse und — wenn möglich — die Seriennummer aus und hinterlegt sie in
// den Stammdaten: Computer/Server im Inventar (inventory.json), Drucker in ihrem
// Drucker-Dossier (master.ip/mac).
//
// Ablauf (voll, gedrosselt nach den Performance-Regeln):
//   1) Hostname → IP per DNS (host-keyed).
//   2) Ping-Sweep über alle IPs (füllt den ARP-Cache) → ARP-Tabelle = MAC im
//      eigenen Subnetz (fängt v. a. Drucker).
//   3) NUR ping-erreichbare Maschinen per WinRM Invoke-Command (ThrottleLimit 10)
//      abfragen (Win32_NetworkAdapterConfiguration = IP/MAC, Win32_BIOS = Serial).
//      So entstehen keine WinRM-Timeouts auf schlafende/offline Geräte.
//   4) Fallbacks: MAC aus der ARP-Tabelle, Serial aus dem Hostnamen (DE-Konvention).
//   5) Persistenz: nur befüllte Werte schreiben (nie mit Leerstrings überschreiben).

import { api } from '../electronAPI'
import type { InventoryItem } from '../types/auth'
import { pingBatch } from './userPresenceScan'
import { readArpTable } from './vlans'
import { serialFromHostname } from './deviceMasterData'
import { loadPrinterDossier, savePrinterMaster } from './printerDossier'
import { ensureWinRM } from '../utils/winrmUtils'

const DEVICE_SCAN_SCHEDULE = 'device_scan/schedule.json'
const INVENTORY_FILE = 'inventory/inventory.json'
const STALE_LOCK_MS = 2 * 60 * 60 * 1000   // laufender Scan älter als 2h = übernehmbar

export interface DeviceScanSchedule {
  lastRunAt: string | null
  lastResult?: 'ok' | 'error' | 'running'
  lastSummary?: string
  running?: { by: string; at: string }
}

export async function loadDeviceScanSchedule(): Promise<DeviceScanSchedule> {
  try {
    const s = await api().netReadJson<DeviceScanSchedule>(DEVICE_SCAN_SCHEDULE)
    if (s && typeof s === 'object') return { lastRunAt: s.lastRunAt ?? null, lastResult: s.lastResult, lastSummary: s.lastSummary, running: s.running }
  } catch { /* noch keiner */ }
  return { lastRunAt: null }
}
export async function saveDeviceScanSchedule(s: DeviceScanSchedule): Promise<boolean> {
  try { return await api().netWriteJson(DEVICE_SCAN_SCHEDULE, s) } catch { return false }
}

/** Jüngster 15:00-Zeitpunkt auf 3-Tage-Raster ≤ now (Nachhol-Logik inklusive). */
export function latestThreeDaySlot(now: Date): Date {
  for (let back = 0; back < 7; back++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 15, 0, 0, 0)
    if (d.getTime() > now.getTime()) continue
    if (Math.floor(d.getTime() / 86400000) % 3 !== 0) continue   // 3-Tage-Parität
    return d
  }
  const d = new Date(now); d.setHours(15, 0, 0, 0)
  if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1)
  return d
}
export function isDeviceScanDue(s: DeviceScanSchedule, now = Date.now()): boolean {
  const slot = latestThreeDaySlot(new Date(now))
  if (!s.lastRunAt) return true
  const t = new Date(s.lastRunAt).getTime()
  if (isNaN(t)) return true
  return t < slot.getTime()
}
export function isDeviceScanClaimed(s: DeviceScanSchedule, now = Date.now()): boolean {
  if (!s.running) return false
  const t = new Date(s.running.at).getTime()
  if (isNaN(t)) return false
  return (now - t) < STALE_LOCK_MS
}

// ── Scan-Bausteine ────────────────────────────────────────────────────────────

function psList(items: string[]): string { return items.map(h => `'${h.replace(/'/g, "''")}'`).join(',') }
function normMac(m?: string): string { return (m || '').trim().replace(/-/g, ':').toUpperCase() }

// Hex (12 Zeichen) → 'AA:BB:CC:DD:EE:FF'; leer bei ungültig oder 00:00:…
function hexToMac(hex?: string): string {
  const h = (hex || '').replace(/[^0-9a-fA-F]/g, '')
  if (h.length !== 12 || /^0{12}$/i.test(h)) return ''
  return (h.match(/.{2}/g) || []).join(':').toUpperCase()
}

// Drucker-MAC + Seriennummer per SNMP (routet über Subnetze — anders als ARP):
//   MAC   = ifPhysAddress (1.3.6.1.2.1.2.2.1.6, erster echter 6-Byte-Wert)
//   Serial= prtGeneralSerialNumber (Printer-MIB 1.3.6.1.2.1.43.5.1.1.17)
async function snmpPrinterInfo(ip: string, community: string): Promise<{ mac?: string; serial?: string }> {
  const out: { mac?: string; serial?: string } = {}
  try {
    const r = await api().snmpQuery({ host: ip, op: 'walk', oid: '1.3.6.1.2.1.2.2.1.6', version: 'v2c', community, timeoutMs: 2500, retries: 1 })
    if (r.success && r.varbinds) {
      for (const vb of r.varbinds) { const mac = hexToMac(vb.hex); if (mac) { out.mac = mac; break } }
    }
  } catch { /* kein SNMP */ }
  try {
    const r = await api().snmpQuery({ host: ip, op: 'get', oids: ['1.3.6.1.2.1.43.5.1.1.17.1'], version: 'v2c', community, timeoutMs: 2500, retries: 1 })
    let s = ''
    const vb0 = r.success && r.varbinds ? r.varbinds[0] : undefined
    if (vb0 && vb0.type !== 'error' && typeof vb0.value === 'string') s = vb0.value.trim()
    if (!s) {
      const rw = await api().snmpQuery({ host: ip, op: 'walk', oid: '1.3.6.1.2.1.43.5.1.1.17', version: 'v2c', community, timeoutMs: 2500, retries: 1 })
      const hit = rw.success && rw.varbinds ? rw.varbinds.find(v => typeof v.value === 'string' && v.value.trim()) : undefined
      if (hit && typeof hit.value === 'string') s = hit.value.trim()
    }
    if (s && s.toLowerCase() !== 'null') out.serial = s
  } catch { /* keine Serial */ }
  return out
}

/** Hostname → IPv4 per DNS, host-keyed (Schlüssel = UPPERCASE-Hostname). */
async function resolveHostIpMap(hosts: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = [...new Set(hosts.map(h => h.trim()).filter(Boolean))]
  for (let i = 0; i < uniq.length; i += 40) {
    const chunk = uniq.slice(i, i + 40)
    const script = [
      `$ErrorActionPreference='SilentlyContinue'`,
      `foreach ($h in @(${psList(chunk)})) {`,
      `  try {`,
      `    $a = [System.Net.Dns]::GetHostAddresses($h) | Where-Object { $_.AddressFamily -eq 'InterNetwork' } | Select-Object -First 1`,
      `    if ($a) { Write-Output ('IP' + [char]9 + $h + [char]9 + $a.IPAddressToString) }`,
      `  } catch {}`,
      `}`,
    ].join('\n')
    try {
      const res = await api().runPowerShell(script, 20000)
      for (const line of (res.stdout ?? '').split(/\r?\n/)) {
        if (!line.startsWith('IP\t')) continue
        const parts = line.split('\t')
        if (parts[1] && parts[2]) out.set(parts[1].toUpperCase(), parts[2].trim())
      }
    } catch { /* nächster Block */ }
  }
  return out
}

interface MachineInfo { ip?: string; mac?: string; serial?: string }

/** WinRM Invoke-Command (ThrottleLimit 10) → host-keyed IP/MAC/Serial. Nur erreichbare Hosts.
 *  onAdvance(n) meldet Fortschritt: n = in diesem Block fertig bearbeitete Hosts
 *  (die WinRM-Aktivierung ist die langsame Phase → hier zählt der Balken hoch). */
async function winrmMachineInfo(hosts: string[], onAdvance?: (n: number) => void): Promise<Map<string, MachineInfo>> {
  const out = new Map<string, MachineInfo>()
  const uniq = [...new Set(hosts.map(h => h.trim()).filter(Boolean))]
  if (uniq.length === 0) return out

  // 1) WinRM sicherstellen — EXAKT wie Remote Doc (Test-WSMan, sonst WinRM-Dienst
  //    per RPC/SMB starten; ensureWinRM cached pro Session). 10er-Batch. OHNE diesen
  //    Schritt schlägt Invoke-Command auf Geräten mit inaktivem WinRM still fehl
  //    (→ leere MAC/Serial, wie zuvor bei den Servern beobachtet).
  const active: string[] = []
  for (let i = 0; i < uniq.length; i += 10) {
    const chunk = uniq.slice(i, i + 10)
    const res = await Promise.all(chunk.map(async h => ({ h, ok: await ensureWinRM(h).catch(() => false) })))
    for (const r of res) if (r.ok) active.push(r.h)
    onAdvance?.(chunk.length)   // erreichbare Maschinen dieses Blocks abgearbeitet
  }
  if (active.length === 0) return out

  // 2) IP/MAC/Serial per WinRM über die WinRM-aktiven Hosts.
  const CHUNK = 30
  for (let i = 0; i < active.length; i += CHUNK) {
    const chunk = active.slice(i, i + CHUNK)
    const script = [
      `$ErrorActionPreference='SilentlyContinue'`,
      `$targets=@(${psList(chunk)})`,
      `$r = Invoke-Command -ComputerName $targets -ThrottleLimit 10 -ErrorAction SilentlyContinue -ScriptBlock {`,
      `  $nic = Get-CimInstance Win32_NetworkAdapterConfiguration -EA SilentlyContinue | Where-Object { $_.IPEnabled -and $_.MACAddress } | Select-Object -First 1`,
      `  $bios = Get-CimInstance Win32_BIOS -EA SilentlyContinue`,
      `  $ip = $null; if ($nic) { $ip = ($nic.IPAddress | Where-Object { $_ -match '^\\d+\\.\\d+\\.\\d+\\.\\d+$' } | Select-Object -First 1) }`,
      `  [pscustomobject]@{ IP = $ip; MAC = $nic.MACAddress; Serial = $bios.SerialNumber }`,
      `}`,
      `$r | Select-Object PSComputerName, IP, MAC, Serial | ConvertTo-Json -Depth 3 -Compress`,
    ].join('\n')
    try {
      const res = await api().runPowerShell(script, 180000)
      const txt = (res.stdout ?? '').trim()
      if (txt && !txt.startsWith('ERR:')) {
        const parsed = JSON.parse(txt)
        const arr = Array.isArray(parsed) ? parsed : [parsed]
        for (const o of arr) {
          const host = String(o?.PSComputerName ?? '').trim().toUpperCase()
          if (!host) continue
          out.set(host, {
            ip: o?.IP ? String(o.IP).trim() : undefined,
            mac: o?.MAC ? normMac(String(o.MAC)) : undefined,
            serial: o?.Serial ? String(o.Serial).trim() : undefined,
          })
        }
      }
    } catch { /* Block fehlgeschlagen — nächster */ }
    onAdvance?.(0)   // kein Vorschub (schon in Phase 1 gezählt), nur Heartbeat
  }
  return out
}

/**
 * Führt EINEN Geräte-Scan über das komplette Inventar aus. Schreibt IP/MAC/Serial
 * in die Stammdaten (Computer/Server → Inventar, Drucker → Drucker-Dossier).
 */
export async function runDeviceScan(by: string, onProgress?: (done: number, total: number) => void): Promise<{ scanned: number; updated: number }> {
  const inv = (await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)) ?? []
  const all = (Array.isArray(inv) ? inv : []).filter(i => i.name && i.name.trim())
  const machines = all.filter(i => { const c = (i.category || '').toLowerCase(); return c === 'computer' || c === 'server' })
  const printers = all.filter(i => (i.category || '').toLowerCase() === 'drucker')
  const total = machines.length + printers.length
  let done = 0
  const bump = (n = 1) => { done += n; onProgress?.(done, total) }
  const nameOf = (i: InventoryItem) => i.name.trim()
  const upKey = (i: InventoryItem) => nameOf(i).toUpperCase()

  // 1) DNS host→ip
  const hostIp = await resolveHostIpMap(all.map(nameOf))
  const ipFor = (i: InventoryItem) => (i.ip || '').trim() || hostIp.get(upKey(i)) || ''

  // 2) Ping-Sweep (füllt ARP) + ARP-Tabelle
  const ips = [...new Set(all.map(ipFor).filter(Boolean))]
  let up = new Set<string>()
  try { const r = await pingBatch(ips, 500); up = new Set(r.up) } catch { /* egal */ }
  let arp = new Map<string, string>()
  try { arp = await readArpTable() } catch { /* egal */ }

  // 3) WinRM nur für erreichbare Maschinen. Fortschritt zählt HIER hoch (langsame
  //    Phase): jeder in der WinRM-Phase abgearbeitete Host erhöht `done`.
  const upMachines = machines.filter(i => { const ip = ipFor(i); return ip && up.has(ip) })
  const upSet = new Set(upMachines.map(upKey))
  const winInfo = await winrmMachineInfo(upMachines.map(nameOf), (n) => bump(n))

  // 4) Inventar frisch laden + Maschinen aktualisieren (nur befüllte Werte)
  let updated = 0
  const fresh = (await api().netReadJson<InventoryItem[]>(INVENTORY_FILE)) ?? []
  const freshArr: InventoryItem[] = Array.isArray(fresh) ? fresh : []
  const nowIso = new Date().toISOString()
  for (const m of machines) {
    const key = upKey(m)
    const w = winInfo.get(key)
    const ip = (w?.ip || m.ip || hostIp.get(key) || '').trim()
    const mac = (w?.mac || (ip ? arp.get(ip) : '') || '').trim()
    const serial = (w?.serial || serialFromHostname(nameOf(m)) || '').trim()
    const target = freshArr.find(x => (x.name || '').trim().toLowerCase() === nameOf(m).toLowerCase())
    // Nur OFFLINE-Maschinen hier zählen — up-Maschinen wurden in der WinRM-Phase gezählt.
    const advance = !upSet.has(key)
    if (!target) { if (advance) bump(); continue }
    let ch = false
    if (ip && target.ip !== ip) { target.ip = ip; ch = true }
    if (mac && target.mac !== mac) { target.mac = mac; ch = true }
    if (serial && target.serial !== serial) { target.serial = serial; ch = true }
    if (ch) { target.deviceScanAt = nowIso; updated++ }
    if (advance) bump()
  }
  if (machines.length) { try { await api().netWriteJson(INVENTORY_FILE, freshArr) } catch { /* offline */ } }

  // 5) Drucker: IP (DNS/Inventar) + MAC/Serial per SNMP (routet über Subnetze),
  //    ARP nur als MAC-Fallback im eigenen Subnetz. In 8er-Batches (SNMP ist I/O-lastig).
  const SNMP_BATCH = 8
  for (let i = 0; i < printers.length; i += SNMP_BATCH) {
    const chunk = printers.slice(i, i + SNMP_BATCH)
    const results = await Promise.all(chunk.map(async p => {
      try {
        const ip = ipFor(p)
        const dossier = await loadPrinterDossier(p.name)
        const master = { ...(dossier?.master || {}) }
        const community = (master.snmpCommunity || '').trim() || 'public'
        const snmp = ip ? await snmpPrinterInfo(ip, community) : {}
        const mac = normMac(snmp.mac || (ip ? arp.get(ip) : '') || '')
        const serial = (snmp.serial || '').trim()
        let ch = false
        if (ip && master.ip !== ip) { master.ip = ip; ch = true }
        if (mac && master.mac !== mac) { master.mac = mac; ch = true }
        if (serial && master.serial !== serial) { master.serial = serial; ch = true }
        if (ch) { await savePrinterMaster(p.name, master, by); return true }
      } catch { /* nächster Drucker */ }
      return false
    }))
    updated += results.filter(Boolean).length
    bump(chunk.length)
  }

  return { scanned: total, updated }
}
