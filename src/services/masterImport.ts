// ── Wissensdatenbank-Import (SKF_MARINE_MASTER.md → Notizen) ──────────────────
// Liest die große Master-Markdown-Datei (Tickets + Rolleninfo), ordnet die
// Einträge „nur bei sicheren Treffern" bestehenden Nutzern (Personen-Dossier)
// bzw. Geräten (Geräte-Dossier) zu und hinterlegt je Person/Gerät EINE gebündelte,
// idempotente Notiz (fester Eintrags-id 'wdb-import' → Re-Run aktualisiert statt
// zu duplizieren). Keine Mails. Nichts Neues wird angelegt; alles nicht
// Zuordenbare landet im Report.

import { api } from '../electronAPI'
import {
  loadDossier, saveDossier, emptyDossier, canonicalName,
  type PersonDossier, type DossierEntry,
} from './personDossier'
import {
  loadDeviceDossier, saveDeviceDossier, emptyDeviceDossier, canonicalHost,
  type DeviceDossier, type DeviceDossierEntry,
} from './deviceDossier'
import { hostFromSerial, serialFromHostname } from './deviceMasterData'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from './adUserDirectory'
import { samePerson } from './personMasterData'
import { listEmployees } from './employees'
import { loadDevices, type EndpointDevice } from './endpointDevices'
import type { InventoryItem } from '../types/auth'

const IMPORT_ID = 'wdb-import'
const IMPORT_SOURCE = 'Wissensdatenbank'
const MAX_LIST = 50           // max. Tickets pro Notiz (Rest als „… und N weitere")
const MAX_TEXT = 180          // max. Zeichen je Problem-/Lösungstext

// ── Datentypen ────────────────────────────────────────────────────────────────
export interface MasterTicket {
  id: string                  // INC… (leer bei Selbstdoku)
  date: string                // YYYY-MM-DD
  reporter: string
  problem: string
  solution: string
  hosts: string[]
  source: 'ServiceNow' | 'Field-Service'
}

interface PersonAgg {
  displayName: string
  sam?: string
  role?: string
  tickets: MasterTicket[]
}
interface DeviceAgg {
  hostname: string
  serial?: string
  tickets: MasterTicket[]
}

export interface ImportAnalysis {
  fileName: string
  totalTickets: number
  serviceNowCount: number
  fieldServiceCount: number
  persons: PersonAgg[]
  devices: DeviceAgg[]
  unmatchedReporters: { name: string; count: number }[]
  unresolvedHosts: { host: string; count: number }[]
  rolesFound: number
  builtAt: string             // Anzeige-Datum (Stand)
}

// ── Datei wählen + einlesen (20 MB, absoluter Pfad → base64 → UTF-8) ──────────
export async function pickAndReadMaster(): Promise<{ path: string; md: string } | null> {
  const path = await api().openFileDialog([{ name: 'Markdown', extensions: ['md'] }])
  if (!path) return null
  const read = await api().readFile(path)
  if (!read.success || !read.data) throw new Error(read.error || 'Datei konnte nicht gelesen werden.')
  return { path, md: decodeBase64Utf8(read.data) }
}

function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

// ── Markdown-Tabellen-Parser (Muster aus scripts/build-knowledge-index.mjs) ───
function cleanCell(c: string): string {
  return (c ?? '').replace(/\\\|/g, '|').replace(/\*\*/g, '').replace(/`/g, '').trim()
}
/** Zerlegt eine Tabellenzeile in Zellen (Wrapper-Pipes weg, escaped \| beachtet). */
function splitRow(line: string): string[] {
  const parts = line.split(/(?<!\\)\|/)
  if (parts.length && parts[0].trim() === '') parts.shift()
  if (parts.length && parts[parts.length - 1].trim() === '') parts.pop()
  return parts.map(cleanCell)
}
const isPipeRow = (l: string): boolean => /^\s*\|/.test(l)
const isSeparatorRow = (l: string): boolean => /^\s*\|[\s\-|:]+\|?\s*$/.test(l)

/** Alle Datenzeilen (ohne Kopf-/Trennzeile) eines Tabellenblocks im Zeilenbereich. */
function dataRowsIn(lines: string[], start: number, end: number): string[][] {
  const rows: string[][] = []
  let headerSeen = false
  for (let i = start; i < end; i++) {
    const l = lines[i]
    if (!isPipeRow(l)) continue
    if (isSeparatorRow(l)) continue
    if (!headerSeen) { headerSeen = true; continue }   // erste Pipe-Zeile = Kopf
    rows.push(splitRow(l))
  }
  return rows
}

function findLine(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i
  return -1
}

// ── Hostname-/Serial-Erkennung ────────────────────────────────────────────────
const HOST_RE = /\b(?:W3\d{3}|X0\d{3}|PMD\d{3}|DEHAM\d{3,}|(?:DE|SE)5CG[0-9A-Z]{4,}|5CG[0-9A-Z]{6,}|1HF[0-9A-Z]{6,})\b/gi
function extractHosts(...texts: string[]): string[] {
  const out = new Set<string>()
  for (const t of texts) {
    if (!t) continue
    const m = t.toUpperCase().match(HOST_RE)
    if (m) for (const h of m) out.add(h)
  }
  return [...out]
}

const dateOnly = (s: string): string => (s || '').trim().slice(0, 10)

// ── Ticket-Tabellen parsen ────────────────────────────────────────────────────
export function parseMasterTickets(md: string): MasterTicket[] {
  const lines = md.split(/\r?\n/)
  const tickets: MasterTicket[] = []

  // ServiceNow-Tabelle: | Ticket | Datum | Status | Melder | Bearbeiter | Problem | Lösung | CI | Cluster | Typ |
  const snStart = findLine(lines, /^###\s+ServiceNow-Tickets/i)
  const selfStart = findLine(lines, /^###\s+Selbstdokumentierte Vorg/i)
  if (snStart >= 0) {
    const end = selfStart > snStart ? selfStart : findLine(lines, /^#{1,3}\s/, snStart + 1)
    for (const c of dataRowsIn(lines, snStart + 1, end < 0 ? lines.length : end)) {
      if (c.length < 8) continue
      const [id, date, , reporter, , problem, solution, ci] = c
      if (!reporter) continue
      tickets.push({
        id: (id || '').trim(),
        date: dateOnly(date),
        reporter: reporter.trim(),
        problem: (problem || '').trim(),
        solution: (solution || '').trim(),
        hosts: extractHosts(ci, problem, solution),
        source: 'ServiceNow',
      })
    }
  }

  // Selbstdoku: | Datum | Zeit | Nutzer(Melder) | Bearbeiter | Vorgang und Lösung | Kategorie | Kritisch | Hostname | Quelle |
  if (selfStart >= 0) {
    const end = findLine(lines, /^#{1,3}\s/, selfStart + 1)
    for (const c of dataRowsIn(lines, selfStart + 1, end < 0 ? lines.length : end)) {
      if (c.length < 5) continue
      const [date, , reporter, , vorgang, , , hostname] = c
      if (!reporter) continue
      tickets.push({
        id: '',
        date: dateOnly(date),
        reporter: reporter.trim(),
        problem: (vorgang || '').trim(),
        solution: '',
        hosts: extractHosts(hostname || '', vorgang || ''),
        source: 'Field-Service',
      })
    }
  }

  return tickets
}

// ── Rollen (Kap. „2. Organisation & Menschen", Tabellen 2.1/2.2) ──────────────
function normName(s: string): string { return (s || '').trim().toLowerCase().replace(/\s+/g, ' ') }

export function parseMasterRoles(md: string): Map<string, string> {
  const lines = md.split(/\r?\n/)
  const roles = new Map<string, string>()
  const start = findLine(lines, /^####\s+2\.\s+Organisation/i)
  if (start < 0) return roles
  let end = findLine(lines, /^#{1,4}\s/, start + 1)   // nächste Überschrift mit ≤4 # (##### bleibt drin)
  if (end < 0) end = lines.length

  let inRoleTable = false
  for (let i = start + 1; i < end; i++) {
    const l = lines[i]
    if (!isPipeRow(l)) { inRoleTable = false; continue }
    if (isSeparatorRow(l)) continue
    const cells = splitRow(l)
    const head = cells.map(x => x.toLowerCase())
    // Kopfzeile einer Rollen-Tabelle erkennen
    if (head[0] === 'name' && (head.some(h => h.includes('funktion')) || head.some(h => h.includes('rolle')))) {
      inRoleTable = true
      continue
    }
    if (inRoleTable && cells[0] && cells[1]) {
      const kuerzel = cells[2] ? ` (${cells[2]})` : ''
      roles.set(normName(cells[0]), `${cells[1]}${kuerzel}`)
    }
  }
  return roles
}

// ── Zuordnung + Aggregation ───────────────────────────────────────────────────
interface PersonResolution { displayName: string; sam?: string }

export async function analyzeMaster(md: string, fileName: string): Promise<ImportAnalysis> {
  const tickets = parseMasterTickets(md)
  const roles = parseMasterRoles(md)

  // Auflöser vorbereiten (jeweils einmalig laden)
  const adDir = await readCentralAdUsers()
  const adIndex = adDir ? buildNameIndex(adDir.users) : new Map()
  const employees = await listEmployees()

  const personCache = new Map<string, PersonResolution | null>()
  function resolvePerson(raw: string): PersonResolution | null {
    const key = normName(raw)
    if (personCache.has(key)) return personCache.get(key)!
    let res: PersonResolution | null = null
    const u = lookupUserByName(adIndex, raw)
    if (u) res = { displayName: u.displayName, sam: u.sam }
    else {
      const emp = employees.find(e => `${e.vorname} ${e.name}`.trim() && samePerson(`${e.vorname} ${e.name}`, raw))
      if (emp) res = { displayName: `${emp.vorname} ${emp.name}`.trim(), sam: emp.globalId || undefined }
    }
    personCache.set(key, res)
    return res
  }

  // Geräte-Auflöser: Inventar + Endgeräte einmalig laden → Maps
  const inv = (await api().netReadJson<InventoryItem[]>('inventory/inventory.json')) ?? []
  const eps = await loadDevices()
  const byHost = new Map<string, { hostname: string; serial?: string }>()
  const bySerial = new Map<string, { hostname: string; serial?: string }>()
  const addDev = (hostname: string, serial?: string) => {
    const h = canonicalHost(hostname)
    if (h) byHost.set(h, { hostname: h, serial: serial || undefined })
    const s = (serial || serialFromHostname(hostname) || '').toUpperCase().replace(/\s+/g, '')
    if (s) bySerial.set(s, { hostname: h || hostFromSerial(s), serial: s })
  }
  for (const it of Array.isArray(inv) ? inv : []) if (it?.name) addDev(it.name, it.serial)
  for (const d of eps as EndpointDevice[]) if (d?.hostname || d?.serial) addDev(d.hostname || hostFromSerial(d.serial), d.serial)

  const hostCache = new Map<string, { hostname: string; serial?: string } | null>()
  function resolveHost(token: string): { hostname: string; serial?: string } | null {
    const t = token.toUpperCase().replace(/\s+/g, '')
    if (hostCache.has(t)) return hostCache.get(t)!
    let res = byHost.get(canonicalHost(t)) ?? null
    if (!res) {
      const s = serialFromHostname(t) || (/^(5CG|1HF)/.test(t) ? t : '')
      if (s) res = bySerial.get(s) ?? null
    }
    hostCache.set(t, res)
    return res
  }

  // Aggregation
  const persons = new Map<string, PersonAgg>()
  const devices = new Map<string, DeviceAgg>()
  const unmatched = new Map<string, { name: string; count: number }>()
  const unresolved = new Map<string, { host: string; count: number }>()

  for (const tk of tickets) {
    // Person
    const pr = resolvePerson(tk.reporter)
    if (pr) {
      const key = normName(pr.displayName)
      let agg = persons.get(key)
      if (!agg) { agg = { displayName: pr.displayName, sam: pr.sam, role: roles.get(key), tickets: [] }; persons.set(key, agg) }
      agg.tickets.push(tk)
    } else {
      const uk = normName(tk.reporter)
      const u = unmatched.get(uk) ?? { name: tk.reporter, count: 0 }
      u.count++; unmatched.set(uk, u)
    }
    // Geräte
    for (const h of tk.hosts) {
      const dr = resolveHost(h)
      if (dr) {
        let agg = devices.get(dr.hostname)
        if (!agg) { agg = { hostname: dr.hostname, serial: dr.serial, tickets: [] }; devices.set(dr.hostname, agg) }
        if (!agg.tickets.includes(tk)) agg.tickets.push(tk)
      } else {
        const hk = h.toUpperCase()
        const u = unresolved.get(hk) ?? { host: h, count: 0 }
        u.count++; unresolved.set(hk, u)
      }
    }
  }

  const sortByDateDesc = (a: MasterTicket, b: MasterTicket) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  for (const p of persons.values()) p.tickets.sort(sortByDateDesc)
  for (const d of devices.values()) d.tickets.sort(sortByDateDesc)

  return {
    fileName,
    totalTickets: tickets.length,
    serviceNowCount: tickets.filter(t => t.source === 'ServiceNow').length,
    fieldServiceCount: tickets.filter(t => t.source === 'Field-Service').length,
    persons: [...persons.values()].sort((a, b) => b.tickets.length - a.tickets.length),
    devices: [...devices.values()].sort((a, b) => b.tickets.length - a.tickets.length),
    unmatchedReporters: [...unmatched.values()].sort((a, b) => b.count - a.count),
    unresolvedHosts: [...unresolved.values()].sort((a, b) => b.count - a.count),
    rolesFound: roles.size,
    builtAt: new Date().toLocaleDateString('de-DE'),
  }
}

// ── Notiztext bauen ───────────────────────────────────────────────────────────
const trim = (s: string, n = MAX_TEXT): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const monthOf = (d: string): string => (d && d.length >= 7 ? d.slice(0, 7) : d)

function ticketLine(tk: MasterTicket, withReporter: boolean): string {
  const parts: string[] = [tk.date || '????-??-??']
  if (tk.id) parts.push(tk.id)
  if (withReporter && tk.reporter) parts.push(tk.reporter)
  const prob = trim(tk.problem || '(ohne Beschreibung)')
  const sol = tk.solution && tk.solution !== tk.problem ? ` → ${trim(tk.solution)}` : ''
  parts.push(`${prob}${sol}`)
  return `• ${parts.join(' · ')}`
}

function buildNoteText(header: string, meta: string[], tickets: MasterTicket[], builtAt: string): string {
  const dates = tickets.map(t => t.date).filter(Boolean).sort()
  const span = dates.length ? `${monthOf(dates[0])}–${monthOf(dates[dates.length - 1])}` : '—'
  const shown = tickets.slice(0, MAX_LIST)
  const rest = tickets.length - shown.length
  const lines = [
    `📚 Wissensdatenbank-Import (Stand ${builtAt})`,
    header,
    ...meta,
    '',
    `Tickets: ${tickets.length} gesamt (${span})`,
    ...shown.map(t => ticketLine(t, header.startsWith('Gerät'))),
  ]
  if (rest > 0) lines.push(`… und ${rest} weitere (Details in der Wissensdatenbank).`)
  return lines.filter(l => l !== undefined).join('\n')
}

// ── Idempotentes Schreiben (fester Eintrag 'wdb-import' pro Dossier) ──────────
async function writePersonNote(p: PersonAgg, by: string, builtAt: string): Promise<boolean> {
  const meta: string[] = []
  if (p.role) meta.push(`Rolle: ${p.role}`)
  if (p.sam) meta.push(`Corp-ID: ${p.sam}`)
  const text = buildNoteText(`Nutzer: ${p.displayName}`, meta, p.tickets, builtAt)
  const d: PersonDossier = (await loadDossier(p.displayName)) ?? emptyDossier(p.displayName, p.sam)
  if (!d.sam && p.sam) d.sam = p.sam
  d.personName = canonicalName(p.displayName)
  const entry: DossierEntry = { id: IMPORT_ID, text, createdAt: new Date().toISOString(), createdBy: by, files: [], kind: 'note', source: IMPORT_SOURCE }
  d.entries = [entry, ...d.entries.filter(e => e.id !== IMPORT_ID)]
  return saveDossier(d, by)
}

async function writeDeviceNote(dev: DeviceAgg, by: string, builtAt: string): Promise<boolean> {
  const meta: string[] = []
  if (dev.serial) meta.push(`Seriennummer: ${dev.serial}`)
  const text = buildNoteText(`Gerät: ${dev.hostname}`, meta, dev.tickets, builtAt)
  const d: DeviceDossier = (await loadDeviceDossier(dev.hostname)) ?? emptyDeviceDossier(dev.hostname, dev.serial)
  if (!d.serial && dev.serial) d.serial = dev.serial
  const entry: DeviceDossierEntry = { id: IMPORT_ID, text, createdAt: new Date().toISOString(), createdBy: by, files: [], kind: 'note', source: IMPORT_SOURCE }
  d.entries = [entry, ...d.entries.filter(e => e.id !== IMPORT_ID)]
  return saveDeviceDossier(d, by)
}

export interface ImportProgress { done: number; total: number; phase: 'persons' | 'devices' }
export interface ImportResult { persons: number; devices: number; failed: number }

/** Schreibt die gebündelten Notizen — in 10er-Gruppen, UI-schonend, mit Fortschritt. */
export async function runImport(
  analysis: ImportAnalysis, by: string, onProgress?: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const CHUNK = 10
  let persons = 0, devices = 0, failed = 0

  const total = analysis.persons.length + analysis.devices.length
  let done = 0
  const tick = (phase: 'persons' | 'devices') => { done++; onProgress?.({ done, total, phase }) }

  for (let i = 0; i < analysis.persons.length; i += CHUNK) {
    const batch = analysis.persons.slice(i, i + CHUNK)
    const oks = await Promise.all(batch.map(p => writePersonNote(p, by, analysis.builtAt).catch(() => false)))
    for (const ok of oks) { if (ok) persons++; else failed++; tick('persons') }
  }
  for (let i = 0; i < analysis.devices.length; i += CHUNK) {
    const batch = analysis.devices.slice(i, i + CHUNK)
    const oks = await Promise.all(batch.map(d => writeDeviceNote(d, by, analysis.builtAt).catch(() => false)))
    for (const ok of oks) { if (ok) devices++; else failed++; tick('devices') }
  }

  return { persons, devices, failed }
}
