// ── Endgeräte-Übersicht – Export (Excel / Word / PDF) ─────────────────────────
// Exportiert die (gefilterte) Geraeteliste inkl. abgeleitetem Model-Typ und
// monatlichen Kosten, plus eine Kostenzusammenfassung je Typ.

import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import { classifyModel, modelCost, formatEuro, MODEL_CATEGORIES, type EndpointDevice } from './endpointDevices'
import { monthsSince, type LastOnlineRow } from './endpointLastOnline'

export type EndpointExportFormat = 'excel' | 'word' | 'pdf'

export interface EndpointExportOptions {
  title?: string                                   // Titel ueberschreiben (z. B. Berichtsname)
  lastOnline?: Record<string, LastOnlineRow>       // keyed hostname (lowercase) -> Spalten "Zuletzt online"/"Offline seit"
}

function fmtDateDE(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function loText(r?: LastOnlineRow): string {
  if (!r) return 'nicht geprüft'
  if (r.online) return 'aktuell online'
  if (r.lastOnline) return fmtDateDE(r.lastOnline)
  return r.inAd ? 'kein Anmeldedatum' : 'nicht in AD'
}
function loMonths(r?: LastOnlineRow): string {
  if (!r || r.online || !r.lastOnline) return ''
  const m = monthsSince(r.lastOnline)
  return m === null ? '' : `${Math.floor(m)} Mon.`
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.byteLength; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}
async function writeAndCheck(savePath: string, base64: string): Promise<void> {
  const r = await api().writeFile(savePath, base64)
  if (!r.success) throw new Error(r.error || 'Datei konnte nicht gespeichert werden.')
}
function sanitize(s: string): string { return s.replace(/[\\/:*?"<>|]/g, '_') }
function fmtNow(): string { return new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }

const TITLE = 'Endgeräte-Übersicht'
const BASE_COLS = ['Seriennummer', 'PC-Name', 'Zugewiesen an', 'Model', 'Model-Typ', 'Kosten/Monat', 'Status', 'Verwendung', 'Kommentar', 'Leasingende', 'Unternehmen', 'Wer bezahlt?']
const LO_COLS = ['Zuletzt online', 'Offline seit']

function colsFor(lo?: Record<string, LastOnlineRow>): string[] {
  return lo ? [...BASE_COLS, ...LO_COLS] : BASE_COLS
}

function deviceRow(d: EndpointDevice, lo?: Record<string, LastOnlineRow>): string[] {
  const cost = modelCost(d.model)
  const row = [
    d.serial, d.hostname, d.assignedTo, d.model, classifyModel(d.model) || '—',
    cost === null ? '' : formatEuro(cost),
    d.state, d.substate, d.comments, d.retiredDate, d.company, d.assetOwnership,
  ]
  if (lo) {
    const r = lo[d.hostname.trim().toLowerCase()]
    row.push(loText(r), loMonths(r))
  }
  return row
}

// Kosten-Zusammenfassung je Model-Typ + Gesamtsumme (nur bekannte Typen)
function costSummary(devices: EndpointDevice[]): { rows: [string, number, number][]; totalCount: number; totalCost: number } {
  const rows: [string, number, number][] = []
  let totalCount = 0, totalCost = 0
  for (const cat of MODEL_CATEGORIES) {
    const inCat = devices.filter(d => classifyModel(d.model) === cat)
    if (inCat.length === 0) continue
    const per = modelCost(inCat[0].model) ?? 0
    const sum = per * inCat.length
    rows.push([cat, inCat.length, sum])
    totalCount += inCat.length
    totalCost += sum
  }
  return { rows, totalCount, totalCost }
}

// ── Excel ─────────────────────────────────────────────────────────────────────
async function buildExcel(devices: EndpointDevice[], opts: EndpointExportOptions): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()
  const head: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
  const lo = opts.lastOnline
  const cols = colsFor(lo)

  const ws = wb.addWorksheet('Endgeräte')
  ws.addRow([opts.title || TITLE]).getCell(1).font = { bold: true, size: 14 }
  ws.addRow([`Erstellt: ${fmtNow()} · ${devices.length} Geräte`]).getCell(1).font = { italic: true, color: { argb: 'FF666666' } }
  ws.addRow([])
  const hr = ws.addRow(cols)
  hr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = head })
  for (const d of devices) ws.addRow(deviceRow(d, lo))
  ws.columns = [18, 16, 22, 30, 20, 14, 14, 16, 34, 14, 16, 16, ...(lo ? [16, 12] : [])].map(w => ({ width: w }))

  // Kostenzusammenfassung
  const sum = costSummary(devices)
  const cs = wb.addWorksheet('Kostenübersicht')
  cs.addRow(['Monatliche Kosten je Model-Typ']).getCell(1).font = { bold: true, size: 13 }
  cs.addRow([])
  const ch = cs.addRow(['Model-Typ', 'Anzahl', 'Kosten/Monat (Summe)'])
  ch.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = head })
  for (const [cat, count, s] of sum.rows) cs.addRow([cat, count, formatEuro(s)])
  const tr = cs.addRow(['Gesamt', sum.totalCount, formatEuro(sum.totalCost)])
  tr.eachCell(c => { c.font = { bold: true } })
  cs.columns = [{ width: 26 }, { width: 12 }, { width: 24 }]

  return arrayBufferToBase64(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

// ── Word ────────────────────────────────────────────────────────────────────
async function buildWord(devices: EndpointDevice[], opts: EndpointExportOptions): Promise<string> {
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }
  const hcell = (t: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 14 })] })] })
  const cell = (t: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, size: 14 })] })] })
  const lo = opts.lastOnline
  const cols = colsFor(lo)

  const sum = costSummary(devices)
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: opts.title || TITLE, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Erstellt: ${fmtNow()} · ${devices.length} Geräte`, italics: true, color: '666666' })] }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Kostenübersicht (monatlich)', heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 60, type: WidthType.PERCENTAGE }, borders: ALL,
      rows: [
        new TableRow({ tableHeader: true, children: [hcell('Model-Typ'), hcell('Anzahl'), hcell('Kosten/Monat')] }),
        ...sum.rows.map(([cat, count, s]) => new TableRow({ children: [cell(cat), cell(String(count)), cell(formatEuro(s))] })),
        new TableRow({ children: [hcell('Gesamt'), hcell(String(sum.totalCount)), hcell(formatEuro(sum.totalCost))] }),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Geräteliste', heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL,
      rows: [
        new TableRow({ tableHeader: true, children: cols.map(hcell) }),
        ...devices.map(d => new TableRow({ children: deviceRow(d, lo).map(cell) })),
      ],
    }),
  ]
  const doc = new Document({ sections: [{ children }] })
  return await Packer.toBase64String(doc)
}

// ── PDF ─────────────────────────────────────────────────────────────────────
async function buildPdf(devices: EndpointDevice[], opts: EndpointExportOptions): Promise<string> {
  const lo = opts.lastOnline
  const cols = colsFor(lo)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(15); doc.setTextColor(30, 64, 175); doc.text(opts.title || TITLE, 14, 15)
  doc.setFontSize(9); doc.setTextColor(90); doc.text(`Erstellt: ${fmtNow()} · ${devices.length} Geräte`, 14, 21)

  const sum = costSummary(devices)
  autoTable(doc, {
    startY: 26,
    head: [['Model-Typ', 'Anzahl', 'Kosten/Monat (Summe)']],
    body: [...sum.rows.map(([cat, count, s]) => [cat, String(count), formatEuro(s)]), ['Gesamt', String(sum.totalCount), formatEuro(sum.totalCost)]],
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    margin: { left: 14, right: 14 },
    tableWidth: 120,
  })
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  autoTable(doc, {
    startY: y,
    head: [cols],
    body: devices.map(d => deviceRow(d, lo)),
    styles: { fontSize: 6, cellPadding: 1, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    columnStyles: { 8: { cellWidth: 45 } },  // Kommentar breiter
    margin: { left: 8, right: 8 },
  })
  return arrayBufferToBase64(doc.output('arraybuffer'))
}

export async function exportEndpointDevices(devices: EndpointDevice[], format: EndpointExportFormat, opts: EndpointExportOptions = {}): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : 'pdf'
  const filter = format === 'excel' ? { name: 'Excel', extensions: ['xlsx'] } : format === 'word' ? { name: 'Word', extensions: ['docx'] } : { name: 'PDF', extensions: ['pdf'] }
  const savePath = await api().saveFileDialog(sanitize(`Endgeraete-Uebersicht ${new Date().toISOString().slice(0, 10)}.${ext}`), [filter])
  if (!savePath) return { ok: true, cancelled: true }
  try {
    const base64 = format === 'excel' ? await buildExcel(devices, opts) : format === 'word' ? await buildWord(devices, opts) : await buildPdf(devices, opts)
    await writeAndCheck(savePath, base64)
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
