// ── Personen-Stammdaten (Aggregation aller bekannten Infos zu einer Person) ──
// Zieht fuer das Personen-Dossier alle im Tool vorhandenen Datenquellen zu
// EINER Person zusammen. Jede Quelle wird UNABHAENGIG geladen (die UI blockiert
// nie und zeigt jeden Block, sobald er da ist):
//
//   1. Active Directory        → Abteilung, Stellenbezeichnung, Vorgesetzter,
//                                E-Mail, Festnetz-Durchwahl, Office, Gruppen
//   2. Mitarbeiterverwaltung   → Eintrittsdatum, Kostenstelle, Gruppenpostfach,
//      (employees.json)          Raumnummer/Arbeitsplatz, beantragte Durchwahl
//   3. Inventar                → zugewiesene PCs (inventory/inventory.json)
//   4. Endgeraete-Uebersicht   → Leasing-Geraete (endpoint-devices/devices.json)
//   5. Durchwahlliste (Xelion) → Durchwahl, Gebaeude, Raum (phone_assignment)

import { api } from '../electronAPI'
import { canonicalName } from './personDossier'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from './adUserDirectory'
import { listEmployees, listDepartures, type Employee, type Departure } from './employees'
import { loadDevices, type EndpointDevice } from './endpointDevices'
import { loadPhoneList, type PhoneEntry } from './phoneAssignment'
import type { InventoryItem } from '../types/auth'

// ── Namensabgleich ────────────────────────────────────────────────────────────
// Namen tauchen je nach Quelle als "Vorname Nachname", "Nachname, Vorname" oder
// "Nachname Vorname" auf. Bei genau zwei Woertern gelten beide Reihenfolgen.

function normName(s: string): string {
  return canonicalName(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function nameVariants(name: string): string[] {
  const n = normName(name)
  if (!n) return []
  const out = [n]
  const parts = n.split(' ')
  if (parts.length === 2) out.push(`${parts[1]} ${parts[0]}`)
  return out
}

/** true, wenn beide Namen (in irgendeiner Reihenfolge der zwei Woerter) matchen. */
export function samePerson(a: string, b: string): boolean {
  if (!a || !b) return false
  const va = nameVariants(a)
  const vb = new Set(nameVariants(b))
  return va.some(v => vb.has(v))
}

/** Letzte 4 Ziffern einer FESTNETZ-Nummer (Durchwahl). Nie fuer Handynummern verwenden. */
export function extractExtension(phone?: string): string {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : ''
}

/** Corp-ID (sam) ueber das zentrale AD-Verzeichnis aufloesen (nur Cache-Lesen, kein AD-Zugriff). */
export async function resolveSamByName(name: string): Promise<string | undefined> {
  try {
    const dir = await readCentralAdUsers()
    if (!dir) return undefined
    const hit = lookupUserByName(buildNameIndex(dir.users), canonicalName(name))
    return hit?.sam
  } catch { return undefined }
}

// ── 1) Active Directory (gezielte Einzelabfrage) ──────────────────────────────

export interface AdPersonInfo {
  found: boolean
  sam?: string
  displayName?: string
  employeeId?: string
  title?: string            // Stellenbezeichnung
  department?: string       // Abteilung
  email?: string
  telephone?: string        // telephoneNumber (Festnetz — bewusst NICHT Mobile)
  ipPhone?: string
  office?: string
  whenCreated?: string      // AD-Anlagedatum (Naeherung fuer Eintritt, wenn sonst nichts vorliegt)
  enabled?: boolean
  managerName?: string      // direkter Vorgesetzter
  managerSam?: string
  lastLogon?: string        // AD LastLogonDate (ISO) — "zuletzt angemeldet"
  groups: string[]          // MemberOf (CN-Liste)
  error?: string
}

function psq(s: string): string { return s.replace(/'/g, "''") }

/**
 * Eine gezielte AD-Abfrage fuer genau diese Person. Aufgeloest wird per
 * SamAccountName, sonst per DisplayName (beide Namensreihenfolgen).
 */
export async function fetchAdPersonInfo(name: string, sam?: string): Promise<AdPersonInfo> {
  const cn = canonicalName(name)
  const variants: string[] = []
  const parts = cn.split(' ')
  variants.push(cn)
  if (parts.length === 2) {
    variants.push(`${parts[1]} ${parts[0]}`)          // "Nachname Vorname"
    variants.push(`${parts[1]}, ${parts[0]}`)         // "Nachname, Vorname"
  }

  const script = [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$tab = [char]9`,
    `$props = @('SamAccountName','DisplayName','EmployeeID','Title','Department','EmailAddress','UserPrincipalName','telephoneNumber','ipPhone','Office','whenCreated','Enabled','Manager','MemberOf','LastLogonDate')`,
    `$u = $null`,
    sam ? `$u = Get-ADUser -Filter "SamAccountName -eq '${psq(sam)}'" -Properties $props | Select-Object -First 1` : ``,
    ...variants.map(v =>
      `if (-not $u) { $u = Get-ADUser -Filter "DisplayName -eq '${psq(v)}'" -Properties $props | Select-Object -First 1 }`),
    `if (-not $u) { Write-Output 'NOTFOUND'; exit }`,
    `$clean = { param($x) ([string]$x) -replace "[$([char]9)$([char]10)$([char]13)]", ' ' }`,
    `$em = [string]$u.EmailAddress; if (-not $em) { $up = [string]$u.UserPrincipalName; if ($up -like '*@*') { $em = $up } }`,
    `$mgrName = ''; $mgrSam = ''`,
    `if ($u.Manager) { $m = Get-ADUser -Identity $u.Manager -Properties DisplayName; if ($m) { $mgrName = & $clean $m.DisplayName; $mgrSam = [string]$m.SamAccountName } }`,
    `$wc = ''; if ($u.whenCreated) { $wc = $u.whenCreated.ToString('o') }`,
    `$ll = ''; if ($u.LastLogonDate) { $ll = $u.LastLogonDate.ToString('o') }`,
    `$en = if ($u.Enabled) { '1' } else { '0' }`,
    `Write-Output ("ADP$tab" + [string]$u.SamAccountName + $tab + (& $clean $u.DisplayName) + $tab + [string]$u.EmployeeID + $tab + (& $clean $u.Title) + $tab + (& $clean $u.Department) + $tab + $em + $tab + (& $clean $u.telephoneNumber) + $tab + (& $clean $u.ipPhone) + $tab + (& $clean $u.Office) + $tab + $wc + $tab + $en + $tab + $mgrName + $tab + $mgrSam + $tab + $ll)`,
    `foreach ($g in @($u.MemberOf)) { if ($g -match '^CN=([^,]+)') { Write-Output ("GRP$tab" + $Matches[1]) } }`,
  ].filter(Boolean).join('\n')

  try {
    const res = await api().runPowerShell(script, 60000)
    const out = res.stdout ?? ''
    if (out.includes('NOTFOUND')) return { found: false, groups: [], error: 'In AD nicht gefunden' }
    const line = out.split(/\r?\n/).find(l => l.startsWith('ADP\t'))
    if (!line) return { found: false, groups: [], error: res.stderr?.trim() || 'Keine Antwort von AD' }
    const p = line.split('\t')
    const groups = out.split(/\r?\n/).filter(l => l.startsWith('GRP\t')).map(l => l.slice(4).trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'))
    return {
      found: true,
      sam: p[1] || undefined,
      displayName: p[2] || undefined,
      employeeId: p[3] || undefined,
      title: p[4] || undefined,
      department: p[5] || undefined,
      email: p[6] || undefined,
      telephone: p[7] || undefined,
      ipPhone: p[8] || undefined,
      office: p[9] || undefined,
      whenCreated: p[10] || undefined,
      enabled: p[11] === '1',
      managerName: p[12] || undefined,
      managerSam: p[13] || undefined,
      lastLogon: p[14] || undefined,
      groups,
    }
  } catch (e) {
    return { found: false, groups: [], error: e instanceof Error ? e.message : 'AD-Abfrage fehlgeschlagen' }
  }
}

// ── 2) Mitarbeiterverwaltung (Onboarding / Austritte) ─────────────────────────

export interface EmployeeRecords {
  employee?: Employee
  departure?: Departure
}

export async function findEmployeeRecords(name: string, sam?: string): Promise<EmployeeRecords> {
  const out: EmployeeRecords = {}
  const samLc = (sam || '').trim().toLowerCase()
  try {
    const emps = await listEmployees()
    out.employee = emps.find(e =>
      (samLc && e.globalId && e.globalId.trim().toLowerCase() === samLc) ||
      samePerson(`${e.vorname} ${e.name}`, name))
  } catch { /* Quelle optional */ }
  try {
    const deps = await listDepartures()
    out.departure = deps.find(d =>
      (samLc && d.globalId && d.globalId.trim().toLowerCase() === samLc) ||
      samePerson(d.name, name))
  } catch { /* Quelle optional */ }
  return out
}

// ── 3+4) Zugewiesene Hardware ─────────────────────────────────────────────────

export interface AssignedHardware {
  inventory: InventoryItem[]      // Standort-Inventar (inventory.json)
  endpoint: EndpointDevice[]      // Endgeraete-Uebersicht (Leasing)
}

export async function findAssignedHardware(name: string, sam?: string): Promise<AssignedHardware> {
  const samLc = (sam || '').trim().toLowerCase()
  const result: AssignedHardware = { inventory: [], endpoint: [] }
  try {
    const items = await api().netReadJson<InventoryItem[]>('inventory/inventory.json')
    if (Array.isArray(items)) {
      result.inventory = items.filter(it =>
        (it.assignedTo && samePerson(it.assignedTo, name)) ||
        (samLc && ((it.corpId && it.corpId.trim().toLowerCase() === samLc) ||
                   (it.assignedTo && it.assignedTo.trim().toLowerCase() === samLc))))
    }
  } catch { /* Quelle optional */ }
  try {
    const devices = await loadDevices()
    result.endpoint = devices.filter(d =>
      (d.assignedTo && samePerson(d.assignedTo, name)) ||
      (samLc && d.assignedTo.trim().toLowerCase() === samLc))
  } catch { /* Quelle optional */ }
  return result
}

// ── Online-Status (leichtgewichtig, nur die zugewiesenen Rechner) ─────────────
// Prueft, ob die Person GERADE an einem ihrer Rechner angemeldet ist. Bewusst
// KEIN Standort-weiter Scan (das macht "Wo angemeldet?") — nur die 1–3 bekannten
// Hosts, mit kurzen Timeouts, damit das Dossier nie blockiert.

export interface PersonOnline {
  online: boolean
  host?: string           // Rechner, an dem die Person angemeldet ist
  checkedHosts: number
}

export async function checkPersonOnline(sam: string, hostnames: string[]): Promise<PersonOnline> {
  const hosts = [...new Set(hostnames.map(h => h.trim().toUpperCase()).filter(Boolean))].slice(0, 3)
  const s = (sam || '').trim()
  if (!s || hosts.length === 0) return { online: false, checkedHosts: 0 }
  const list = hosts.map(h => `'${h.replace(/'/g, "''")}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$sam='${s.replace(/'/g, "''")}'`,
    `$hit=''`,
    `foreach ($h in @(${list})) {`,
    `  if ($hit) { break }`,
    // Schnell-Check: online per SMB 445 (1,2 s), sonst ueberspringen
    `  $up=$false; try { $t=New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync($h,445).Wait(1200)) { $up=$true }; $t.Close() } catch {}`,
    `  if (-not $up) { continue }`,
    // Angemeldeten Benutzer ermitteln (CIM, sonst quser)
    `  $u=''`,
    `  try { $cs=Get-CimInstance -ComputerName $h -ClassName Win32_ComputerSystem -OperationTimeoutSec 4; $u=[string]$cs.UserName } catch {}`,
    `  if (-not $u) { try { $q = quser /server:$h 2>$null; if ($q -match $sam) { $u = $sam } } catch {} }`,
    `  if ($u -and ($u -match ('\\\\' + [regex]::Escape($sam) + '$') -or $u -match $sam)) { $hit=$h }`,
    `}`,
    `@{ host=$hit } | ConvertTo-Json -Compress`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 20000)
    const line = (res.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('{')).pop()
    const host = line ? (JSON.parse(line).host || '') : ''
    return { online: !!host, host: host || undefined, checkedHosts: hosts.length }
  } catch {
    return { online: false, checkedHosts: hosts.length }
  }
}

// ── 5) Durchwahlliste (Xelion / Rufnummer-Vergabe) ────────────────────────────

export async function findPhoneEntries(name: string): Promise<PhoneEntry[]> {
  try {
    const data = await loadPhoneList()
    return data.entries.filter(e => e.status === 'vergeben' && e.user && samePerson(e.user, name))
  } catch { return [] }
}
