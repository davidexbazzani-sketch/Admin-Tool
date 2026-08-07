// ── Mitarbeiterverwaltung – Import & Export ───────────────────────────────────
// Liest die HR-PDFs ("Personelle Veraenderung" Eintritt/Austritt) und die
// Access-Pass-Mails (.msg) aus und exportiert/importiert die Excel-Liste.
//
//   PDF  → pdfjs Textextraktion → Felder per Regex
//   .msg → UTF-16-Body dekodieren → Global ID + Temporary Access Pass + UPN
//   xlsx → exceljs (Import der Alt-Liste, Export auf Knopfdruck)

import ExcelJS from 'exceljs'
import pdfjsLib from '../pdftools/pdfjsSetup'
import { api } from '../electronAPI'
import { toIsoDate, formatGermanDate, daysUntil, isFullyChecked } from './employees'
import type { Employee, Departure } from './employees'

// ── PDF: Personelle Veraenderung ──────────────────────────────────────────────

export interface ParsedPersonnelPdf {
  type: 'entry' | 'exit'
  name: string
  vorname: string
  globalId: string
  date: string               // ISO yyyy-mm-dd (Eintritt bzw. Austritt)
  manager: string
  jobTitle: string
  department: string
  costCenter: string
}

/** Extrahiert den Fliesstext der ersten Seite (alle Items, durch Leerzeichen verbunden). */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  let out = ''
  const pageCount = Math.min(doc.numPages, 2)
  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if ('str' in item && item.str) out += item.str + ' '
    }
    out += '\n'
  }
  return out.replace(/\s+/g, ' ').trim()
}

function pick(re: RegExp, text: string): string {
  const m = text.match(re)
  return m && m[1] ? m[1].trim() : ''
}

/** Findet ein Datum (TT.MM.JJJJ) direkt hinter einem Label im entspacten Text. */
function dateAfterLabel(label: string, tight: string): string {
  const m = tight.match(new RegExp(label + '[^0-9]{0,5}(\\d{1,2}\\.\\d{1,2}\\.\\d{4})', 'i'))
  return m ? m[1] : ''
}

/**
 * Parst eine "Personelle Veraenderung"-PDF (Eintritt oder Austritt).
 *
 * pdfjs zerlegt den Tabellentext stark in Fragmente (z. B. Datum "0 1 .0 7 .2026",
 * Personalnummer "11000 767", "a m:"). Darum werden ZWEI Varianten benutzt:
 *   - text  (Einzel-Leerzeichen): fuer Mehrwort-Felder (Name, Vorname, Manager,
 *     Stellenbezeichnung), wo Woerter durch echte Leerzeichen getrennt sind.
 *   - tight (komplett ohne Leerzeichen): fuer Datum, Global ID, Abteilung und
 *     Kostenstelle, die normalerweise keine internen Leerzeichen haben.
 *
 * Eintritt vs. Austritt: entscheidend ist, hinter welchem Label ein Datum steht
 * ("Eintritt am: <Datum>" -> Eintritt; sonst "Vertragsende"/"Letzter Arbeitstag"
 * -> Austritt). Die Ankreuzkaestchen liegen NICHT im Textstream und taugen nicht.
 */
export async function parsePersonnelPdf(bytes: Uint8Array, filename?: string): Promise<{ ok: boolean; data?: ParsedPersonnelPdf; error?: string }> {
  let text: string
  try { text = await extractPdfText(bytes) }
  catch (e) { return { ok: false, error: 'PDF konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : String(e)) } }

  const tight = text.replace(/\s+/g, '')

  if (!/PersonelleVer/i.test(tight)) {
    return { ok: false, error: 'Das sieht nicht nach einer "Personelle Veraenderung"-PDF aus.' }
  }

  const entryDate = dateAfterLabel('Eintritt', tight)
  const exitDate = dateAfterLabel('Vertragsende', tight) || dateAfterLabel('LetzterArbeitstag', tight)

  // Typ-Erkennung: zuerst der Dateiname (enthaelt zuverlaessig irgendwo
  // "Eintritt" oder "Austritt"), sonst Rueckfall auf den PDF-Inhalt
  // (Datum hinter "Eintritt am:" -> Eintritt). "Austritt" gewinnt bei
  // Mehrdeutigkeit nicht automatisch — wir pruefen gezielt beide Woerter.
  const fn = (filename || '').toLowerCase()
  const fnHasEntry = /eintritt/.test(fn)
  const fnHasExit = /austritt/.test(fn)
  let isEntry: boolean
  if (fnHasEntry && !fnHasExit) isEntry = true
  else if (fnHasExit && !fnHasEntry) isEntry = false
  else isEntry = !!entryDate                       // Dateiname mehrdeutig/leer -> Inhalt

  const type: 'entry' | 'exit' = isEntry ? 'entry' : 'exit'
  // Datum unabhaengig vom Typ nehmen (das Dokument hat genau ein gefuelltes Datum)
  const date = toIsoDate(entryDate || exitDate)

  const data: ParsedPersonnelPdf = {
    type,
    name: pick(/\bName\s+([A-Za-zÀ-ÿ'\-. ]+?)\s+Vorname\b/i, text),
    vorname: pick(/\bVorname\s+([A-Za-zÀ-ÿ'\-. ]+?)\s+Personalnummer\b/i, text),
    globalId: pick(/SKFID[^/]*\/([A-Za-z]{2}\d{2,6})/i, tight).toUpperCase(),
    date,
    manager: pick(/\bVorgesetzter\s+([A-Za-zÀ-ÿ'\-. ]+?)\s+Bemerkungen\b/i, text),
    jobTitle: pick(/\bStellenbezeichnung\s+(.+?)\s+Abteilung\b/i, text),
    department: pick(/Abteilung(.{1,12}?)Kostenstelle/i, tight),
    costCenter: pick(/Kostenstelle[^0-9]{0,4}(\d{2,6})/i, tight),
  }

  if (!data.name && !data.globalId) {
    return { ok: false, error: 'Konnte aus der PDF keine Mitarbeiterdaten lesen (Name/Global ID fehlen).' }
  }
  return { ok: true, data }
}

// ── .msg: Temporary Access Pass ───────────────────────────────────────────────

export interface ParsedAccessPass {
  globalId: string
  accessPass: string
  upn: string
  valid: string
}

/**
 * Liest Global ID + Temporary Access Pass + UPN aus einer Outlook-.msg-Datei.
 * Die Mail-Body-Daten liegen als UTF-16-Stream in der OLE-Datei; wir dekodieren
 * den gesamten Inhalt als UTF-16LE und ziehen die Felder per Regex. Der
 * Doppelpunkt hinter "Temporary Access Pass" unterscheidet den echten Wert von
 * der Betreffzeile ("...Access Pass Generated").
 */
export function parseAccessPassMsg(bytes: Uint8Array): { ok: boolean; data?: ParsedAccessPass; error?: string } {
  let clean: string
  try {
    const u16 = new TextDecoder('utf-16le').decode(bytes).replace(/\0/g, '')
    // Nur druckbare ASCII + erweiterte Latein-Zeichen behalten, Rest zu Space
    clean = u16.replace(/[^\x20-\x7E -ɏ\n\r]/g, ' ')
  } catch (e) {
    return { ok: false, error: 'Mail konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : String(e)) }
  }

  const data = matchAccessPassFields(clean)
  if (!hasAccessPass(data)) {
    return { ok: false, error: 'Keine Access-Pass-Daten in der Mail gefunden (Global ID / Temporary Access Pass).' }
  }
  return { ok: true, data }
}

/**
 * Zieht Global ID + Temporary Access Pass + UPN aus einem bereits dekodierten
 * Mail-Text. Der Doppelpunkt hinter "Temporary Access Pass" unterscheidet den
 * echten Wert von der Betreffzeile ("...Access Pass Generated").
 */
function matchAccessPassFields(text: string): ParsedAccessPass {
  const gid = pick(/Global\s*ID\s*:\s*([A-Za-z]{2}\d{2,6})/i, text).toUpperCase()
  const tap = pick(/Temporary\s*Access\s*Pass\s*:\s*([!-~]{4,40})/i, text)
  const upn = pick(/UPN\s*:\s*([\w.\-]+@[\w.\-]+)/i, text)
  const vm = text.match(/Valid\s*between\s*:\s*([\d-]+)\s+\S*\s*([\d-]+)/i)
  const valid = vm ? `${vm[1]} - ${vm[2]}` : ''
  return { globalId: gid, accessPass: tap, upn, valid }
}

function hasAccessPass(d: ParsedAccessPass): boolean { return !!d.globalId || !!d.accessPass }

/** Decodiert Quoted-Printable (Soft-Umbrueche + =XX Hex). */
function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
}

/**
 * Liefert Body-Kandidaten aus einer MIME-.eml-Mail: bevorzugt text/plain, dann
 * text/html (Tags entfernt), zuletzt der komplette QP-dekodierte Rohtext. Jeder
 * Part wird gemaess seinem Content-Transfer-Encoding dekodiert (8bit/QP/base64).
 */
function emlBodyCandidates(text: string): string[] {
  const out: string[] = []
  const bm = text.match(/boundary="?([^";\r\n]+)"?/i)
  if (bm) {
    const parts = text.split('--' + bm[1])
    const order = [/Content-Type:\s*text\/plain/i, /Content-Type:\s*text\/html/i]
    for (const re of order) {
      const part = parts.find(p => re.test(p))
      if (!part) continue
      const enc = (part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i)?.[1] || '').trim().toLowerCase()
      const sep = part.search(/\r?\n\r?\n/)
      if (sep < 0) continue
      let body = part.slice(sep).replace(/^\r?\n\r?\n/, '')
      if (enc === 'quoted-printable') body = decodeQuotedPrintable(body)
      else if (enc === 'base64') { try { body = atob(body.replace(/\s+/g, '')) } catch { /* ignore */ } }
      if (/text\/html/i.test(part)) body = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ')
      out.push(body)
    }
  }
  out.push(decodeQuotedPrintable(text))   // Fallback: ganzer Rohtext
  return out
}

/**
 * Liest die Access-Pass-Felder aus einer .eml-Datei (entsteht beim Drag & Drop
 * einer Mail aus Outlook). Probiert plain → html → Rohtext, bis Felder gefunden.
 */
export function parseAccessPassEml(text: string): { ok: boolean; data?: ParsedAccessPass; error?: string } {
  for (const body of emlBodyCandidates(text)) {
    const data = matchAccessPassFields(body)
    if (hasAccessPass(data)) return { ok: true, data }
  }
  return { ok: false, error: 'Keine Access-Pass-Daten in der Mail gefunden (Global ID / Temporary Access Pass).' }
}

// ── Datei-Typ-Erkennung beim Drop ─────────────────────────────────────────────

export type DroppedKind = 'pdf' | 'msg' | 'eml' | 'unknown'

export function classifyFile(name: string): DroppedKind {
  const n = name.toLowerCase()
  if (n.endsWith('.pdf')) return 'pdf'
  if (n.endsWith('.msg')) return 'msg'
  if (n.endsWith('.eml')) return 'eml'
  return 'unknown'
}

// ── Excel-Import (Alt-Liste einmalig uebernehmen) ─────────────────────────────

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    const o = v as { richText?: Array<{ text: string }>; text?: string; result?: unknown; formula?: unknown }
    if (Array.isArray(o.richText)) return o.richText.map(t => t.text).join('').trim()
    if (typeof o.text === 'string') return o.text.trim()
    if (o.result !== undefined && o.result !== null) return String(o.result).trim()
    return ''
  }
  return String(v).trim()
}

function cellDateIso(v: ExcelJS.CellValue): string {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = cellText(v)
  return s ? toIsoDate(s) : ''
}

export interface ExcelImportResult {
  ok: boolean
  employees: Partial<Employee>[]
  departures: Partial<Departure>[]
  error?: string
}

/** Liest die bestehende Excel (Sheets "Neuer MA" + "Austritte") aus einem ArrayBuffer. */
export async function parseExistingExcel(buffer: ArrayBuffer): Promise<ExcelImportResult> {
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(buffer) }
  catch (e) { return { ok: false, employees: [], departures: [], error: 'Excel konnte nicht gelesen werden: ' + (e instanceof Error ? e.message : String(e)) } }

  const employees: Partial<Employee>[] = []
  const departures: Partial<Departure>[] = []

  // ── Sheet "Neuer MA" (Header in Zeile 4, Daten ab Zeile 5) ──────────────────
  const wsNew = wb.getWorksheet('Neuer MA')
  if (wsNew) {
    for (let r = 5; r <= wsNew.rowCount; r++) {
      const row = wsNew.getRow(r)
      const name = cellText(row.getCell(3).value)
      const vorname = cellText(row.getCell(4).value)
      const globalId = cellText(row.getCell(5).value)
      if (!name && !globalId) continue
      // Restspalten ohne eigenes Feld sammeln, damit nichts verloren geht
      const leftovers: string[] = []
      const mobil = cellText(row.getCell(10).value)        // Laptop mobilisieren
      const swCheck = cellText(row.getCell(20).value)      // Software checken ob bestellt
      const rueck = cellText(row.getCell(22).value)        // Rueckmeldung nach 5 Tagen
      if (mobil) leftovers.push(`Laptop mobilisieren: ${mobil}`)
      if (swCheck) leftovers.push(`Software-Check: ${swCheck}`)
      if (rueck) leftovers.push(`Rueckmeldung nach 5 Tagen: ${rueck}`)
      employees.push({
        startDate: cellDateIso(row.getCell(1).value),
        name, vorname, globalId,
        manager: cellText(row.getCell(6).value),
        request: cellText(row.getCell(7).value),
        ritmLaptop: cellText(row.getCell(8).value),
        laptopType: cellText(row.getCell(9).value),
        accessPass: cellText(row.getCell(11).value),
        accessPassUpn: cellText(row.getCell(12).value),
        extraSoftware: cellText(row.getCell(13).value),
        groupMailbox: cellText(row.getCell(14).value),
        roomNumber: cellText(row.getCell(15).value),
        standardEquipment: cellText(row.getCell(16).value),
        extraEquipment: cellText(row.getCell(17).value),
        handoverDate: cellText(row.getCell(18).value),
        phoneExtension: cellText(row.getCell(21).value),
        notes: [cellText(row.getCell(19).value), ...leftovers].filter(Boolean).join(' · '),
      })
    }
  }

  // ── Sheet "Austritte" (Header in Zeile 3, Daten ab Zeile 4) ─────────────────
  const wsExit = wb.getWorksheet('Austritte')
  if (wsExit) {
    for (let r = 4; r <= wsExit.rowCount; r++) {
      const row = wsExit.getRow(r)
      const name = cellText(row.getCell(3).value)
      const globalId = cellText(row.getCell(4).value)
      if (!name && !globalId) continue
      const returnedTxt = cellText(row.getCell(10).value).toLowerCase()
      const mk5 = cellText(row.getCell(8).value)
      const mk1 = cellText(row.getCell(9).value)
      const notes = [mk5 && `Manager-Kontakt nach 5: ${mk5}`, mk1 && `Manager-Kontakt nach 1: ${mk1}`].filter(Boolean).join(' · ')
      departures.push({
        exitDate: cellDateIso(row.getCell(1).value),
        name, globalId,
        manager: cellText(row.getCell(5).value),
        deviceName: cellText(row.getCell(6).value),
        task: cellText(row.getCell(7).value),
        deviceReturned: returnedTxt.includes('erledigt') || returnedTxt.includes('ja'),
        notes,
      })
    }
  }

  return { ok: true, employees, departures }
}

// ── Excel-Export ──────────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.byteLength; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

const HEAD_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = HEAD_FILL })
}

/** Exportiert die aktuelle Liste als Excel-Datei (Sheets "Neuer MA" + "Austritte"). */
export async function exportEmployeesExcel(employees: Employee[], departures: Departure[]): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const stamp = new Date().toISOString().slice(0, 10)
  const savePath = await api().saveFileDialog(`Mitarbeiter_${stamp}.xlsx`, [{ name: 'Excel', extensions: ['xlsx'] }])
  if (!savePath) return { ok: true, cancelled: true }

  try {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'IT Admin Tool'
    wb.created = new Date()

    // ── Sheet "Neuer MA" ──────────────────────────────────────────────────────
    const wsNew = wb.addWorksheet('Neuer MA')
    const newCols = [
      'Startdatum', 'Tage bis Start', 'Name', 'Vorname', 'GlobalID', 'Manager', 'Request',
      'Ritm Laptop', 'Laptop Typ', 'Einmal PW', 'Access Pass Mail (UPN)', 'Extra Software',
      'Gruppenpostfach', 'Raumnummer/Arbeitsplatz', 'Standard-Ausrüstung', 'Extra-Ausrüstung',
      'Geräte-Übergabe-Termin', 'Durchwahl', 'Manager kontaktiert', 'Laptop fertig',
      'Arbeitsplatz steht', 'Alles erledigt', 'Status', 'Sonstiges',
    ]
    styleHeader(wsNew.addRow(newCols))
    for (const e of employees) {
      const tage = daysUntil(e.startDate)
      wsNew.addRow([
        e.startDate ? formatGermanDate(e.startDate) : '', isNaN(tage) ? '' : tage,
        e.name, e.vorname, e.globalId, e.manager, e.request, e.ritmLaptop, e.laptopType,
        e.accessPass, e.accessPassUpn, e.extraSoftware, e.groupMailbox, e.roomNumber,
        e.standardEquipment, e.extraEquipment, e.handoverDate, e.phoneExtension,
        e.managerContacted ? 'Ja' : 'Nein', e.laptopReady ? 'Ja' : 'Nein', e.workplaceReady ? 'Ja' : 'Nein',
        e.allDone ? 'Ja' : 'Nein',
        isFullyChecked(e) ? 'Fertig' : 'Offen', e.notes,
      ])
    }
    wsNew.columns.forEach(c => { c.width = 18 })

    // ── Sheet "Austritte" ──────────────────────────────────────────────────────
    const wsExit = wb.addWorksheet('Austritte')
    const exitCols = ['Austrittsdatum', 'Tage bis Austritt', 'Name', 'GlobalID', 'Manager', 'Geräte-Name', 'Task', 'Gerät abgegeben', 'Sonstiges']
    styleHeader(wsExit.addRow(exitCols))
    for (const d of departures) {
      const tage = daysUntil(d.exitDate)
      wsExit.addRow([
        d.exitDate ? formatGermanDate(d.exitDate) : '', isNaN(tage) ? '' : tage,
        d.name, d.globalId, d.manager, d.deviceName, d.task, d.deviceReturned ? 'Ja' : 'Nein', d.notes,
      ])
    }
    wsExit.columns.forEach(c => { c.width = 18 })

    const buf = await wb.xlsx.writeBuffer() as ArrayBuffer
    const res = await api().writeFile(savePath, arrayBufferToBase64(buf))
    if (!res.success) return { ok: false, error: res.error || 'Datei konnte nicht gespeichert werden.' }
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
