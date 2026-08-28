// ── Grafik-/Treiber-Verwaltung – Export (Excel / Word / PDF) ──────────────────
// Exportiert die (gefilterten) Scan-Ergebnisse: Grafikkarte + Treiberversion +
// Eignung, angereichert um Model/Status/Verwendung aus der Endgeräte-Übersicht.

import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import { SUITABILITY_LABEL, type GpuDriverRecord, type Suitability } from './gpuDrivers'

export type GpuExportFormat = 'excel' | 'word' | 'pdf'

/** hostname (lowercase) -> Zusatzinfo aus der Endgeräte-Übersicht. */
export type GpuDeviceInfo = Record<string, { model?: string; assignedTo?: string; state?: string; substate?: string }>

const TITLE = 'Grafik-/Treiber-Übersicht'
const COLS = ['Hostname', 'Zugewiesen an', 'Model', 'Status', 'Verwendung', 'CPU', 'RAM', 'Grafikkarte', 'Treiber (WMI)', 'NVIDIA-Version', 'Eignung', 'Begründung', 'Geprüft am']

function fmtDateDE(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtNow(): string { return new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
function sanitize(s: string): string { return s.replace(/[\\/:*?"<>|]/g, '_') }

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

function recRow(r: GpuDriverRecord, info?: GpuDeviceInfo): string[] {
  const d = info?.[r.hostname.trim().toLowerCase()]
  return [
    r.hostname, d?.assignedTo || '', d?.model || '', d?.state || '', d?.substate || '',
    r.cpu || '', r.ramGB ? `${r.ramGB} GB` : '',
    r.gpuName || '', r.driverVersion || '', r.nvidiaVersion || '',
    SUITABILITY_LABEL[r.suitability], r.suitabilityReason || r.error || '', fmtDateDE(r.scannedAt),
  ]
}

function summary(records: GpuDriverRecord[]): [string, number][] {
  const order: Suitability[] = ['geeignet', 'nicht-geeignet', 'unbekannt', 'fehler']
  const c: Record<string, number> = {}
  for (const r of records) c[r.suitability] = (c[r.suitability] || 0) + 1
  return order.filter(s => c[s]).map(s => [SUITABILITY_LABEL[s], c[s]] as [string, number])
}

// ── Excel ─────────────────────────────────────────────────────────────────────
async function buildExcel(records: GpuDriverRecord[], info: GpuDeviceInfo | undefined, title: string): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()
  const head: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

  const ws = wb.addWorksheet('Grafik-Treiber')
  ws.addRow([title]).getCell(1).font = { bold: true, size: 14 }
  ws.addRow([`Erstellt: ${fmtNow()} · ${records.length} Geräte`]).getCell(1).font = { italic: true, color: { argb: 'FF666666' } }
  ws.addRow([])
  const hr = ws.addRow(COLS)
  hr.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = head })
  for (const r of records) ws.addRow(recRow(r, info))
  ws.columns = [18, 22, 26, 14, 16, 28, 8, 30, 18, 14, 16, 44, 18].map(w => ({ width: w }))

  const sum = summary(records)
  const cs = wb.addWorksheet('Zusammenfassung')
  cs.addRow(['Eignung (Anzahl)']).getCell(1).font = { bold: true, size: 13 }
  cs.addRow([])
  const ch = cs.addRow(['Eignung', 'Anzahl']); ch.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = head })
  for (const [label, count] of sum) cs.addRow([label, count])
  cs.columns = [{ width: 22 }, { width: 12 }]

  return arrayBufferToBase64(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

// ── Word ──────────────────────────────────────────────────────────────────────
async function buildWord(records: GpuDriverRecord[], info: GpuDeviceInfo | undefined, title: string): Promise<string> {
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }
  const hcell = (t: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 13 })] })] })
  const cell = (t: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, size: 13 })] })] })

  const sum = summary(records)
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Erstellt: ${fmtNow()} · ${records.length} Geräte`, italics: true, color: '666666' })] }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Zusammenfassung (Eignung)', heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 50, type: WidthType.PERCENTAGE }, borders: ALL,
      rows: [
        new TableRow({ tableHeader: true, children: [hcell('Eignung'), hcell('Anzahl')] }),
        ...sum.map(([label, count]) => new TableRow({ children: [cell(label), cell(String(count))] })),
      ],
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Ergebnisse', heading: HeadingLevel.HEADING_2 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL,
      rows: [
        new TableRow({ tableHeader: true, children: COLS.map(hcell) }),
        ...records.map(r => new TableRow({ children: recRow(r, info).map(cell) })),
      ],
    }),
  ]
  const doc = new Document({ sections: [{ children }] })
  return await Packer.toBase64String(doc)
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function buildPdf(records: GpuDriverRecord[], info: GpuDeviceInfo | undefined, title: string): Promise<string> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(15); doc.setTextColor(30, 64, 175); doc.text(title, 14, 15)
  doc.setFontSize(9); doc.setTextColor(90); doc.text(`Erstellt: ${fmtNow()} · ${records.length} Geräte`, 14, 21)

  const sum = summary(records)
  autoTable(doc, {
    startY: 26,
    head: [['Eignung', 'Anzahl']],
    body: sum.map(([label, count]) => [label, String(count)]),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    margin: { left: 14, right: 14 },
    tableWidth: 70,
  })
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  autoTable(doc, {
    startY: y,
    head: [COLS],
    body: records.map(r => recRow(r, info)),
    styles: { fontSize: 6.5, cellPadding: 1, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    columnStyles: { 11: { cellWidth: 40 } },  // Begründung breiter
    margin: { left: 8, right: 8 },
  })
  return arrayBufferToBase64(doc.output('arraybuffer'))
}

export async function exportGpuDrivers(
  records: GpuDriverRecord[],
  format: GpuExportFormat,
  opts: { deviceInfo?: GpuDeviceInfo; title?: string } = {},
): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const title = opts.title || TITLE
  const ext = format === 'excel' ? 'xlsx' : format === 'word' ? 'docx' : 'pdf'
  const filter = format === 'excel' ? { name: 'Excel', extensions: ['xlsx'] } : format === 'word' ? { name: 'Word', extensions: ['docx'] } : { name: 'PDF', extensions: ['pdf'] }
  const savePath = await api().saveFileDialog(sanitize(`Grafik-Treiber-Uebersicht ${new Date().toISOString().slice(0, 10)}.${ext}`), [filter])
  if (!savePath) return { ok: true, cancelled: true }
  try {
    const base64 = format === 'excel' ? await buildExcel(records, opts.deviceInfo, title)
      : format === 'word' ? await buildWord(records, opts.deviceInfo, title)
        : await buildPdf(records, opts.deviceInfo, title)
    await writeAndCheck(savePath, base64)
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
