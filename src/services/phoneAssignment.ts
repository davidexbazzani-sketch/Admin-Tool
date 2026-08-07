// ── Rufnummer-Vergabe (Xelion-Durchwahlen) ──────────────────────────────────
// Die Durchwahlliste.xlsx liegt als zentrale "Datenbank" auf dem Netzwerk-
// Speicher des Admin Tools (gleicher Ort wie Lizenzen, Checklisten etc.) —
// damit arbeiten alle Instanzen immer auf demselben Stand. Die bestehende
// Excel-Liste wird einmalig dorthin importiert. Vor jedem Schreiben wird ein
// zeitgestempeltes Backup auf dem Share abgelegt (wie im Python-Skript).

import ExcelJS from 'exceljs'
import { api } from '../electronAPI'

const CONFIG_PATH = 'settings/phone_assignment.json'
export const PHONE_DB_PATH = 'phone_assignment/Durchwahlliste.xlsx'
const BACKUP_DIR = 'phone_assignment/backup'

// Excel-Layout (Sheet "User"): Header in Zeile 6, Daten ab Zeile 7
const SHEET_NAME = 'User'
const DATA_START_ROW = 7
const COL_NUMMER = 1
const COL_ABT = 2
const COL_USER = 3
const COL_BEMERKUNG = 4
const COL_GEBAEUDE = 5
const COL_RAUM = 6
// Falls alle Zeilen belegt sind: neue Nummer aus diesem Bereich vergeben
const NUMMER_MIN = 1000
const NUMMER_MAX = 3000

export interface PhoneAssignConfig {
  hrEmail: string
  subjectTemplate: string
  bodyTemplate: string
}

export const DEFAULT_PHONE_CONFIG: PhoneAssignConfig = {
  hrEmail: 'hrservice.marine@skf.com',
  subjectTemplate: '{name} wurde Durchwahl {durchwahl} zugewiesen',
  bodyTemplate:
    'Moin zusammen,\n\n' +
    'Bitte in PeopleCore die folgende Telefonnummer anlegen:\n\n' +
    'Name: {name}\n' +
    'Telefonnummer: {rufnummer}\n\n' +
    'Viele Grüße\n' +
    'Deine IT\n',
}

export type PhoneEntryStatus = 'frei' | 'vergeben' | 'gesperrt'

export interface PhoneEntry {
  row: number
  nummer: number | null
  abt: string
  user: string
  bemerkung: string
  gebaeude: string
  raum: string
  status: PhoneEntryStatus
}

export interface PhoneStats {
  gesamt: number
  vergeben: number
  frei: number
  gesperrt: number
}

export interface PhoneListData {
  entries: PhoneEntry[]
  stats: PhoneStats
  nextFree: PhoneEntry | null
}

export type AssignResult =
  | { status: 'assigned'; nummer: number }
  | { status: 'exists'; nummer: number | null }

// ── Config ───────────────────────────────────────────────────────────────────

export async function loadPhoneConfig(): Promise<PhoneAssignConfig> {
  try {
    const cfg = await api().netReadJson<Partial<PhoneAssignConfig>>(CONFIG_PATH)
    return { ...DEFAULT_PHONE_CONFIG, ...(cfg ?? {}) }
  } catch {
    return { ...DEFAULT_PHONE_CONFIG }
  }
}

export async function savePhoneConfig(cfg: PhoneAssignConfig): Promise<boolean> {
  return api().netWriteJson(CONFIG_PATH, cfg)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number') return String(v)
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>
    if (Array.isArray(o.richText)) return (o.richText as Array<{ text: string }>).map(t => t.text).join('').trim()
    if (typeof o.text === 'string') return o.text.trim()
    if (o.result != null) return String(o.result).trim()
  }
  return String(v).trim()
}

function cellNumber(v: ExcelJS.CellValue): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v)
  const t = cellText(v)
  if (/^\d+$/.test(t)) return parseInt(t, 10)
  return null
}

interface LoadedWorkbook {
  wb: ExcelJS.Workbook
  ws: ExcelJS.Worksheet
  originalB64: string
}

async function parseB64Workbook(b64: string): Promise<LoadedWorkbook> {
  const wb = new ExcelJS.Workbook()
  const bytes = b64ToBytes(b64)
  await wb.xlsx.load(bytes.buffer as ArrayBuffer)
  const ws = wb.getWorksheet(SHEET_NAME) ?? wb.worksheets[0]
  if (!ws) throw new Error('Die Excel-Datei enthält kein auswertbares Arbeitsblatt.')
  return { wb, ws, originalB64: b64 }
}

async function loadWorkbook(): Promise<LoadedWorkbook> {
  const b64 = await api().netReadRawFile(PHONE_DB_PATH)
  if (!b64) {
    throw new Error('Durchwahlliste auf dem Netzwerk-Speicher nicht gefunden. Bitte zuerst die Excel-Liste importieren (Einstellungen).')
  }
  return parseB64Workbook(b64)
}

function parseEntries(ws: ExcelJS.Worksheet): PhoneEntry[] {
  const entries: PhoneEntry[] = []
  for (let r = DATA_START_ROW; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const nummer = cellNumber(row.getCell(COL_NUMMER).value)
    const user = cellText(row.getCell(COL_USER).value)
    const bemerkung = cellText(row.getCell(COL_BEMERKUNG).value)
    if (nummer === null && !user && !bemerkung) continue // Leerzeile
    const status: PhoneEntryStatus = user ? 'vergeben' : bemerkung ? 'gesperrt' : 'frei'
    entries.push({
      row: r,
      nummer,
      abt: cellText(row.getCell(COL_ABT).value),
      user,
      bemerkung,
      gebaeude: cellText(row.getCell(COL_GEBAEUDE).value),
      raum: cellText(row.getCell(COL_RAUM).value),
      status,
    })
  }
  return entries
}

function buildStats(entries: PhoneEntry[]): PhoneStats {
  const withNumber = entries.filter(e => e.nummer !== null)
  return {
    gesamt: withNumber.length,
    vergeben: withNumber.filter(e => e.status === 'vergeben').length,
    frei: withNumber.filter(e => e.status === 'frei').length,
    gesperrt: withNumber.filter(e => e.status === 'gesperrt').length,
  }
}

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
}

/** Zeitgestempeltes Backup auf dem Netzwerk-Speicher ablegen. */
async function backupExcel(originalB64: string): Promise<void> {
  await api().netWriteRawFile(`${BACKUP_DIR}/Durchwahlliste_${backupTimestamp()}.xlsx`, originalB64)
}

async function saveWorkbook(wb: ExcelJS.Workbook, originalB64: string): Promise<void> {
  await backupExcel(originalB64)
  const buffer = await wb.xlsx.writeBuffer()
  const ok = await api().netWriteRawFile(PHONE_DB_PATH, bufToB64(buffer as ArrayBuffer))
  if (!ok) {
    throw new Error('Speichern der Durchwahlliste auf dem Netzwerk-Speicher fehlgeschlagen. Ist das Netzlaufwerk erreichbar?')
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Prüft, ob die Durchwahl-Datenbank auf dem Netzwerk-Speicher existiert. */
export async function phoneDbExists(): Promise<boolean> {
  return api().netExists(PHONE_DB_PATH)
}

/** Anzeige-Pfad der zentralen Datenbank (für UI-Hinweise). */
export async function getPhoneDbDisplayPath(): Promise<string> {
  try {
    const base = await api().netGetBasePath()
    return `${base.replace(/[\\/]+$/, '')}\\${PHONE_DB_PATH.replace(/\//g, '\\')}`
  } catch {
    return PHONE_DB_PATH
  }
}

/**
 * Importiert eine lokale Durchwahlliste.xlsx als zentrale Datenbank auf den
 * Netzwerk-Speicher. Die Datei wird vorher validiert; eine ggf. vorhandene
 * Datenbank wird zuvor als Backup gesichert.
 */
export async function importPhoneDb(localPath: string): Promise<PhoneStats> {
  const read = await api().readFile(localPath)
  if (!read.success || !read.data) {
    throw new Error(`Datei konnte nicht gelesen werden: ${read.error ?? localPath}`)
  }
  // Validieren, dass das Format passt
  const { ws } = await parseB64Workbook(read.data)
  const entries = parseEntries(ws)
  if (entries.length === 0) {
    throw new Error('Die ausgewählte Datei enthält keine Durchwahl-Einträge (Sheet "User", Daten ab Zeile 7).')
  }
  // Bestehende Datenbank sichern, dann überschreiben
  const existing = await api().netReadRawFile(PHONE_DB_PATH)
  if (existing) await backupExcel(existing)
  const ok = await api().netWriteRawFile(PHONE_DB_PATH, read.data)
  if (!ok) {
    throw new Error('Import fehlgeschlagen: Netzwerk-Speicher nicht beschreibbar.')
  }
  return buildStats(entries)
}

export async function loadPhoneList(): Promise<PhoneListData> {
  const { ws } = await loadWorkbook()
  const entries = parseEntries(ws)
  return {
    entries,
    stats: buildStats(entries),
    nextFree: entries.find(e => e.status === 'frei' && e.nummer !== null) ?? null,
  }
}

/**
 * Vergibt die nächste freie Durchwahl an `name`.
 * - Existiert der Name bereits, wird nichts geändert (status: 'exists').
 * - Gibt es keine freie Zeile, wird eine neue Nummer (1000–3000) angehängt.
 * Die Datenbank wird zum Vergabezeitpunkt frisch vom Netzwerk gelesen, damit
 * Änderungen anderer Instanzen nicht überschrieben werden.
 */
export async function assignNumber(name: string): Promise<AssignResult> {
  const cleanName = name.trim().replace(/\s+/g, ' ')
  if (!cleanName) throw new Error('Kein Name angegeben.')

  const { wb, ws, originalB64 } = await loadWorkbook()
  const entries = parseEntries(ws)

  const existing = entries.find(e => e.user.toLowerCase() === cleanName.toLowerCase())
  if (existing) return { status: 'exists', nummer: existing.nummer }

  const free = entries.find(e => e.status === 'frei' && e.nummer !== null)
  if (free) {
    ws.getRow(free.row).getCell(COL_USER).value = cleanName
    await saveWorkbook(wb, originalB64)
    return { status: 'assigned', nummer: free.nummer! }
  }

  // Keine freie Zeile: neue Nummer suchen und als neue Zeile anhängen
  const used = new Set(entries.map(e => e.nummer).filter((n): n is number => n !== null))
  let neueNummer: number | null = null
  for (let n = NUMMER_MIN; n <= NUMMER_MAX; n++) {
    if (!used.has(n)) { neueNummer = n; break }
  }
  if (neueNummer === null) throw new Error('Keine freie Durchwahl mehr verfügbar (1000–3000 erschöpft).')

  const lastDataRow = entries.length ? entries[entries.length - 1].row : DATA_START_ROW - 1
  const newRow = ws.getRow(lastDataRow + 1)
  newRow.getCell(COL_NUMMER).value = neueNummer
  newRow.getCell(COL_USER).value = cleanName
  await saveWorkbook(wb, originalB64)
  return { status: 'assigned', nummer: neueNummer }
}

/**
 * Gibt eine vergebene Durchwahl wieder frei: USER, Abt. und Bemerkung der
 * Zeile werden geleert. Der Abgleich mit dem erwarteten Inhalt schützt vor
 * Konflikten, falls eine andere Instanz zwischenzeitlich geschrieben hat.
 */
export async function releaseNumber(entry: PhoneEntry): Promise<void> {
  const { wb, ws, originalB64 } = await loadWorkbook()
  const row = ws.getRow(entry.row)
  const currentUser = cellText(row.getCell(COL_USER).value)
  const currentNummer = cellNumber(row.getCell(COL_NUMMER).value)
  if (currentNummer !== entry.nummer || currentUser.toLowerCase() !== entry.user.toLowerCase()) {
    throw new Error('Die Durchwahlliste wurde zwischenzeitlich geändert. Bitte Übersicht aktualisieren und erneut versuchen.')
  }
  row.getCell(COL_USER).value = null
  row.getCell(COL_ABT).value = null
  row.getCell(COL_BEMERKUNG).value = null
  await saveWorkbook(wb, originalB64)
}

// ── E-Mail ───────────────────────────────────────────────────────────────────

/** Platzhalter: {name}, {durchwahl}, {rufnummer} (= +49 40 3011 {durchwahl}) */
export function resolveTemplate(template: string, name: string, durchwahl: number): string {
  const rufnummer = `+49 40 3011 ${durchwahl}`
  return template
    .replace(/\{name\}/g, name)
    .replace(/\{durchwahl\}/g, String(durchwahl))
    .replace(/\{rufnummer\}/g, rufnummer)
}

/** Versendet über Outlook (ScheduledTask-Mechanismus, kein SMTP nötig). */
export async function sendAssignmentMail(recipients: string[], subject: string, body: string): Promise<void> {
  const to = recipients.map(r => r.trim()).filter(Boolean)
  if (to.length === 0) throw new Error('Kein Empfänger ausgewählt.')
  const res = await api().sendEmailRaw({
    to: to.join('; '),
    subject,
    body,
    smtp: '', port: 0, // ungenutzt — Versand läuft über Outlook
    method: 'outlook',
  })
  if (!res.success) throw new Error(res.error ?? 'Mailversand fehlgeschlagen.')
}
