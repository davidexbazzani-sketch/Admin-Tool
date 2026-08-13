// ── Geräte-Stammdaten (Aggregation aller bekannten Infos zu einem Gerät) ──────
// Zieht fuer das Geräte-Dossier alle im Tool vorhandenen Datenquellen zu EINEM
// Hostnamen zusammen. Jede Quelle wird UNABHAENGIG geladen (die UI blockiert nie
// und zeigt jeden Block, sobald er da ist):
//
//   1. Active Directory (Computerobjekt) → OS, OU, Beschreibung, ManagedBy,
//      letzte Anmeldung, Enabled + LIVE Online-Status & angemeldeter Benutzer
//   2. Standort-Inventar (inventory/inventory.json) → IP, Kategorie, zugewiesen
//   3. Endgeraete-Uebersicht (endpoint-devices) → Seriennr., Modell, Leasing
//   4. Software-Inventar (software_inventar/scan_data.json) → installierte Software
//   5. ServiceNow → CMDB-CI (cmdb_ci_computer) + offene Tickets zum Gerät

import { api } from '../electronAPI'
import { canonicalHost, isIpAddress } from './deviceDossier'
import { loadDevices, type EndpointDevice } from './endpointDevices'
import { loadConfig, loadIntegrationAccount } from './servicenow'
import type { InventoryItem } from '../types/auth'

function psq(s: string): string { return s.replace(/'/g, "''") }

// ── 1) AD-Computerobjekt + Live-Status ────────────────────────────────────────

export interface AdComputerInfo {
  found: boolean
  name?: string
  enabled?: boolean
  os?: string
  osVersion?: string
  description?: string
  managedBy?: string
  ou?: string
  ipv4?: string
  whenCreated?: string
  lastLogon?: string
  online?: boolean
  onlineMethod?: string
  currentUser?: string      // gerade angemeldeter Benutzer (DOMAIN\user)
  error?: string
}

export async function fetchAdComputerInfo(hostname: string): Promise<AdComputerInfo> {
  const h = canonicalHost(hostname)
  if (!h) return { found: false, error: 'Kein Hostname' }
  const hp = psq(h)
  const ip = isIpAddress(h)   // bei IP kein AD-Namobjekt möglich → AD-Lookup überspringen
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$c = $null`,
    // AD-Computerobjekt nur bei echten Hostnamen suchen (nicht bei IPs).
    ...(ip ? [] : [
      `Import-Module ActiveDirectory -EA SilentlyContinue`,
      `$props = @('Description','OperatingSystem','OperatingSystemVersion','LastLogonDate','whenCreated','ManagedBy','DistinguishedName','Enabled','IPv4Address')`,
      `$c = Get-ADComputer -Identity '${hp}' -Properties $props -EA SilentlyContinue`,
      // Fallback: forestweit ueber den Global Catalog (Namenskonvention Praefix+Serial)
      `if (-not $c) { try { $gc = (Get-ADRootDSE).dnsHostName + ':3268'; $c = Get-ADComputer -Filter "Name -eq '${hp}'" -Server $gc -Properties $props -EA SilentlyContinue | Select-Object -First 1 } catch {} }`,
    ]),
    // AD-Felder nur wenn ein Objekt gefunden wurde
    `$mgr=''; $ou=''; $wc=''; $ll=''`,
    `if ($c) {`,
    `  if ($c.ManagedBy) { $m = Get-ADUser $c.ManagedBy -Properties DisplayName -EA SilentlyContinue; if ($m) { $mgr = [string]$m.DisplayName } }`,
    `  $ou = ([string]$c.DistinguishedName) -replace '^CN=[^,]+,',''`,
    `  if ($c.whenCreated) { $wc = $c.whenCreated.ToString('o') }`,
    `  if ($c.LastLogonDate) { $ll = $c.LastLogonDate.ToString('o') }`,
    `}`,
    // Live-Status IMMER prüfen (auch ohne AD-Objekt / bei IP-Geräten)
    `$online=$false; $method='none'`,
    `try { if (Test-Connection -ComputerName '${hp}' -Count 1 -Quiet -EA SilentlyContinue) { $online=$true; $method='Ping' } } catch {}`,
    `if (-not $online) { try { $t=New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync('${hp}',445).Wait(1500)) { $online=$true; $method='SMB' }; $t.Close() } catch {} }`,
    `$cur=''`,
    `if ($online) {`,
    `  try { $cs=Get-CimInstance -ComputerName '${hp}' -ClassName Win32_ComputerSystem -OperationTimeoutSec 4 -EA SilentlyContinue; if ($cs.UserName) { $cur=[string]$cs.UserName } } catch {}`,
    `  if (-not $cur) { try { $q = quser /server:'${hp}' 2>$null; $line = ($q | Select-String -Pattern 'Aktiv|Active|console|rdp-tcp' | Select-Object -First 1); if ($line) { $cur = (($line.ToString().Trim() -replace '^>','') -split '\\s+')[0] } } catch {} }`,
    `}`,
    // PS 5.1: 'if' als Ausdruck NUR in der Zuweisungsform — nicht in (…) im Hashtable.
    `$cname = if ($c) { [string]$c.Name } else { '${hp}' }`,
    `$cenabled = if ($c) { [bool]$c.Enabled } else { $null }`,
    `$o = [ordered]@{ found=[bool]$c; name=$cname; enabled=$cenabled; os=[string]$c.OperatingSystem; osVersion=[string]$c.OperatingSystemVersion; description=([string]$c.Description); managedBy=$mgr; ou=$ou; ipv4=[string]$c.IPv4Address; whenCreated=$wc; lastLogon=$ll; online=$online; onlineMethod=$method; currentUser=$cur }`,
    `$o | ConvertTo-Json -Compress`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 40000)
    const out = res.stdout ?? ''
    const m = out.match(/\{[\s\S]*\}/)
    if (!m) return { found: false, error: res.stderr?.trim() || 'Keine Antwort von AD' }
    const p = JSON.parse(m[0]) as Record<string, unknown>
    const found = p.found === true
    return {
      found,
      // Auch ohne AD-Objekt liefern wir den Live-Status (online/currentUser) —
      // wichtig für IP-Geräte und nicht-domänengebundene Rechner.
      error: found ? undefined : (ip ? 'IP-Adresse — kein AD-Namobjekt' : 'Kein AD-Computerobjekt gefunden'),
      name: (p.name as string) || undefined,
      enabled: p.enabled === true,
      os: (p.os as string) || undefined,
      osVersion: (p.osVersion as string) || undefined,
      description: (p.description as string) || undefined,
      managedBy: (p.managedBy as string) || undefined,
      ou: (p.ou as string) || undefined,
      ipv4: (p.ipv4 as string) || undefined,
      whenCreated: (p.whenCreated as string) || undefined,
      lastLogon: (p.lastLogon as string) || undefined,
      online: p.online === true,
      onlineMethod: (p.onlineMethod as string) && p.onlineMethod !== 'none' ? (p.onlineMethod as string) : undefined,
      currentUser: (p.currentUser as string) || undefined,
    }
  } catch (e) {
    return { found: false, error: e instanceof Error ? e.message : 'AD-Abfrage fehlgeschlagen' }
  }
}

// ── 2) Standort-Inventar ──────────────────────────────────────────────────────

export async function findInventoryItem(hostname: string): Promise<InventoryItem | null> {
  const h = canonicalHost(hostname)
  try {
    const items = await api().netReadJson<InventoryItem[]>('inventory/inventory.json')
    if (Array.isArray(items)) {
      return items.find(i => canonicalHost(i.name) === h) ?? null
    }
  } catch { /* Quelle optional */ }
  return null
}

// ── 3) Endgeraete-Uebersicht ──────────────────────────────────────────────────

export async function findEndpointDevice(hostname: string): Promise<EndpointDevice | null> {
  const h = canonicalHost(hostname)
  try {
    const devices = await loadDevices()
    return devices.find(d => canonicalHost(d.hostname) === h) ?? null
  } catch { /* Quelle optional */ }
  return null
}

// ── 4) Software-Inventar ──────────────────────────────────────────────────────

export interface InstalledSoftware {
  DisplayName: string
  DisplayVersion: string
  Publisher: string
}
export interface SoftwareResult {
  software: InstalledSoftware[]
  scannedAt?: string
  method?: number   // 1=WinRM, 2=Registry, 3=PsExec
  found: boolean
}

interface ScanFilePcResult {
  hostname: string
  software?: InstalledSoftware[]
  scannedAt?: string
  method?: number
}
interface ScanFile { lastUpdated?: string; scannedPCs?: ScanFilePcResult[] }

const SCAN_DATA_PATH = 'software_inventar/scan_data.json'

export async function findInstalledSoftware(hostname: string): Promise<SoftwareResult> {
  const h = canonicalHost(hostname)
  try {
    const data = await api().netReadJson<ScanFile>(SCAN_DATA_PATH)
    const pc = data?.scannedPCs?.find(p => canonicalHost(p.hostname) === h)
    if (pc && Array.isArray(pc.software)) {
      const sorted = [...pc.software].sort((a, b) => (a.DisplayName || '').localeCompare(b.DisplayName || '', 'de'))
      return { software: sorted, scannedAt: pc.scannedAt, method: pc.method, found: true }
    }
  } catch { /* Quelle optional */ }
  return { software: [], found: false }
}

// ── 5) ServiceNow (CMDB-CI + Tickets) ─────────────────────────────────────────

/** ServiceNow liefert bei sysparm_display_value=all pro Feld { display_value, value }. */
function snDv(field: unknown): string {
  if (field == null) return ''
  if (typeof field === 'string') return field
  const f = field as { display_value?: string; value?: string }
  return (f.display_value ?? f.value ?? '') || ''
}
function snRaw(field: unknown): string {
  if (field == null) return ''
  if (typeof field === 'string') return field
  const f = field as { value?: string }
  return (f.value ?? '') || ''
}

export interface DeviceCi {
  sysId?: string
  name?: string
  serial?: string
  assetTag?: string
  ip?: string
  os?: string
  model?: string
  manufacturer?: string
  assignedTo?: string
  location?: string
  department?: string
  installStatus?: string
  lastDiscovered?: string
  warrantyExpiration?: string
}
export interface DeviceTicket {
  sysId: string
  number: string
  shortDescription: string
  state: string
  priority: string
  assignedTo: string
  openedAt: string
  table: 'incident' | 'task'
}
export interface DeviceServiceNow {
  configured: boolean
  ci: DeviceCi | null
  tickets: DeviceTicket[]
  instanceUrl?: string
  error?: string
  needsLogin?: boolean
}

const CI_FIELDS = 'sys_id,name,serial_number,asset_tag,ip_address,os,os_version,model_id,manufacturer,assigned_to,location,department,install_status,last_discovered,warranty_expiration'
const TICKET_FIELDS = 'sys_id,number,short_description,state,priority,assigned_to,cmdb_ci,opened_at,sys_updated_on'

export async function fetchDeviceServiceNow(hostname: string, serial?: string): Promise<DeviceServiceNow> {
  const h = canonicalHost(hostname)
  let cfg: { instanceUrl: string }
  try { cfg = await loadConfig() } catch { return { configured: false, ci: null, tickets: [] } }
  if (!cfg?.instanceUrl?.trim()) return { configured: false, ci: null, tickets: [] }
  const acc = await loadIntegrationAccount().catch(() => null)
  const auth = acc ? { user: acc.user, pass: acc.pass } : undefined

  const out: DeviceServiceNow = { configured: true, ci: null, tickets: [], instanceUrl: cfg.instanceUrl }

  // (1) CMDB-CI per Name (oder Seriennummer)
  const ciQuery = serial && serial.trim()
    ? `name=${h}^ORserial_number=${serial.trim()}`
    : `name=${h}`
  try {
    const res = await api().serviceNowRequest({
      instanceUrl: cfg.instanceUrl, method: 'GET', table: 'cmdb_ci_computer',
      query: ciQuery, fields: CI_FIELDS, limit: 1, auth,
    })
    if (res.success) {
      const row = (res.data as { result?: Record<string, unknown>[] } | undefined)?.result?.[0]
      if (row) {
        out.ci = {
          sysId: snRaw(row.sys_id) || undefined,
          name: snDv(row.name) || undefined,
          serial: snDv(row.serial_number) || undefined,
          assetTag: snDv(row.asset_tag) || undefined,
          ip: snDv(row.ip_address) || undefined,
          os: [snDv(row.os), snDv(row.os_version)].filter(Boolean).join(' ') || undefined,
          model: snDv(row.model_id) || undefined,
          manufacturer: snDv(row.manufacturer) || undefined,
          assignedTo: snDv(row.assigned_to) || undefined,
          location: snDv(row.location) || undefined,
          department: snDv(row.department) || undefined,
          installStatus: snDv(row.install_status) || undefined,
          lastDiscovered: snDv(row.last_discovered) || undefined,
          warrantyExpiration: snDv(row.warranty_expiration) || undefined,
        }
      }
    } else if (res.needsLogin) {
      out.needsLogin = true
    } else if (res.error && !/403|404/.test(String(res.status))) {
      out.error = res.error
    }
  } catch { /* CMDB evtl. ohne Rechte -> weiter mit Tickets */ }

  // (2) Tickets zum Gerät: CMDB-Referenz + Volltext-Fallback (Hostname).
  // WICHTIG: Die Basistabelle 'task' liefert auch Incident-Datensätze (gleiche
  // sys_id). Daher per sys_id deduplizieren — 'incident' wird zuerst abgefragt
  // und gewinnt (behält table='incident' + korrekten incident.do-Link).
  const ticketQuery = `cmdb_ci.name=${h}^ORshort_descriptionLIKE${h}^ORdescriptionLIKE${h}^ORDERBYDESCsys_updated_on`
  const byId = new Map<string, DeviceTicket>()
  for (const table of ['incident', 'task'] as const) {
    try {
      const res = await api().serviceNowRequest({
        instanceUrl: cfg.instanceUrl, method: 'GET', table,
        query: ticketQuery, fields: TICKET_FIELDS, limit: 25, auth,
      })
      if (res.success) {
        const rows = (res.data as { result?: Record<string, unknown>[] } | undefined)?.result ?? []
        for (const r of rows) {
          const sysId = snRaw(r.sys_id)
          if (!sysId || byId.has(sysId)) continue
          byId.set(sysId, {
            sysId,
            number: snDv(r.number),
            shortDescription: snDv(r.short_description),
            state: snDv(r.state),
            priority: snDv(r.priority),
            assignedTo: snDv(r.assigned_to),
            openedAt: snDv(r.opened_at),
            table,
          })
        }
      } else if (res.needsLogin) {
        out.needsLogin = true
      }
    } catch { /* Tabelle optional */ }
  }
  out.tickets = [...byId.values()].sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))
  return out
}

/** Direktlink auf einen ServiceNow-Datensatz. */
export function snRecordUrl(instanceUrl: string, table: string, sysId: string): string {
  const base = instanceUrl.trim().replace(/\/+$/, '')
  return `${base}/nav_to.do?uri=${table}.do?sys_id=${encodeURIComponent(sysId)}`
}

// ── Serial aus dem Hostnamen ableiten (Praefix entfernen) ─────────────────────
// AD-Computername = Praefix (DE/DEHAM/DESCH) + Seriennummer.
export function serialFromHostname(hostname: string): string {
  const h = canonicalHost(hostname)
  // Längstes Präfix zuerst deterministisch abschneiden (KEINE Regex-Alternation,
  // sonst würde bei kurzer Seriennummer 'DEHAM123' zu 'HAM123' backtracken).
  const rest = h.startsWith('DEHAM') ? h.slice(5)
    : h.startsWith('DESCH') ? h.slice(5)
    : h.startsWith('DE') ? h.slice(2)
    : ''
  return /^[A-Z0-9]{5,}$/.test(rest) ? rest : ''
}
