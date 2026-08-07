// ── Hardware-Inventur – Export ────────────────────────────────────────────────
// Exportiert einen Inventur-Bericht als Excel, Word oder PDF.

import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import type { InventoryRun } from './hardwareInventory'

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

function fmtDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sanitize(s: string): string { return s.replace(/[\\/:*?"<>|]/g, '_') }
function suggestName(run: InventoryRun, ext: string): string {
  return sanitize(`${run.title} ${new Date().toISOString().slice(0, 10)}.${ext}`)
}

// ── Excel ───────────────────────────────────────────────────────────────────────
async function exportExcel(run: InventoryRun, savePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()
  const head: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

  // Übersichts-Sheet
  const ws = wb.addWorksheet('Übersicht')
  const totalDevices = run.devices.length
  const scanned = run.devices.filter(d => d.scanned).length
  const missing = run.devices.filter(d => !d.scanned).length
  const lateFound = run.devices.filter(d => d.lateFound).length
  const stats: [string, string][] = [
    ['Inventur', run.title],
    ['Status', run.status === 'completed' ? 'Abgeschlossen' : run.status === 'open' ? 'Offen' : 'Archiv'],
    ['Import-Datei', run.importedFilename],
    ['Importiert am', fmtDateTime(run.importedAt)],
    ['Importiert von', run.importedBy],
    ['Abgeschlossen am', fmtDateTime(run.completedAt) || '—'],
    ['Abgeschlossen von', run.completedBy || '—'],
    ['Geräte gesamt', String(totalDevices)],
    ['Erfasst', String(scanned)],
    ['Fehlend', String(missing)],
    ['Nachträglich gefunden', String(lateFound)],
    ['Unerwartete Scans', String(run.extras.length)],
  ]
  for (const [k, v] of stats) {
    const row = ws.addRow([k, v])
    row.getCell(1).font = { bold: true }
  }
  // Notizen zum Bericht (falls angelegt)
  if (run.notes && run.notes.trim()) {
    ws.addRow([])
    const nh = ws.addRow(['Notizen zum Bericht'])
    nh.getCell(1).font = { bold: true, color: { argb: 'FF1E40AF' } }
    const nr = ws.addRow(['', run.notes.trim()])
    nr.getCell(2).alignment = { vertical: 'top', wrapText: true }
  }
  ws.columns = [{ width: 28 }, { width: 60 }]

  // Geräte-Sheet (mit allen Spalten aus dem Originalimport + Inventur-Status)
  const dws = wb.addWorksheet('Geräte')
  const headers = ['Status', 'Seriennummer', 'Gerätetyp', 'Company', 'Status (Quelle)', 'Substate', 'Kommentar', 'Erfasst am', 'Erfasst von', 'AD-Hostname', 'AD-Online', 'AD-Letzter Logon', 'AD-Akt. Benutzer', 'AD-Notiz', 'Nachträgl. gefunden', 'Nachträgl. Notiz']
  const hr = dws.addRow(headers)
  hr.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = head; cell.alignment = { vertical: 'middle' } })
  for (const d of run.devices) {
    const status = d.lateFound ? 'NACHGEFUNDEN' : (d.scanned ? 'ERFASST' : 'FEHLEND')
    const row = dws.addRow([
      status,
      d.serial, d.deviceType, d.company, d.status, d.substate, d.comment,
      fmtDateTime(d.scannedAt), d.scannedBy || '',
      d.adHostname || '', d.adOnline === undefined ? '' : (d.adOnline ? 'Ja' : 'Nein'), fmtDateTime(d.adLastOnline), d.adCurrentUser || '', d.adNote || '',
      d.lateFound ? fmtDateTime(d.lateFoundAt) : '', d.lateNote || '',
    ])
    row.eachCell(cell => { cell.alignment = { vertical: 'top', wrapText: true } })
  }
  dws.columns = [
    { width: 14 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 28 },
    { width: 20 }, { width: 18 }, { width: 22 }, { width: 12 }, { width: 20 }, { width: 24 }, { width: 24 },
    { width: 20 }, { width: 24 },
  ]

  if (run.extras.length > 0) {
    const ex = wb.addWorksheet('Unerwartete Scans')
    const exHeader = ex.addRow(['Seriennummer', 'Gescannt am', 'Gescannt von', 'Begründung'])
    exHeader.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = head })
    for (const x of run.extras) ex.addRow([x.serial, fmtDateTime(x.scannedAt), x.scannedBy, x.reason || ''])
    ex.columns = [{ width: 18 }, { width: 22 }, { width: 18 }, { width: 36 }]
  }

  if (run.history.length > 0) {
    const hws = wb.addWorksheet('Verlauf')
    const hh = hws.addRow(['Zeitpunkt', 'Bearbeiter', 'Aktion', 'Details'])
    hh.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = head })
    for (const h of run.history) hws.addRow([fmtDateTime(h.timestamp), h.by, h.action, h.details || ''])
    hws.columns = [{ width: 22 }, { width: 22 }, { width: 36 }, { width: 60 }]
  }

  const ab = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(ab))
}

// ── Word ──────────────────────────────────────────────────────────────────────
async function exportWord(run: InventoryRun, savePath: string): Promise<void> {
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }

  const scanned = run.devices.filter(d => d.scanned).length
  const missing = run.devices.filter(d => !d.scanned)
  const lateFound = run.devices.filter(d => d.lateFound)

  const headerCells = (labels: string[]) => labels.map(t => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 16 })] })] }))
  const cell = (s: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s, size: 16 })] })] })

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: 'Hardware-Inventur', heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: run.title, bold: true, size: 28, color: '1E40AF' })] }),
    new Paragraph({ children: [new TextRun({ text: `Importiert: ${fmtDateTime(run.importedAt)} von ${run.importedBy}`, italics: true, color: '666666' })] }),
    new Paragraph({ children: [new TextRun({ text: `Abgeschlossen: ${fmtDateTime(run.completedAt) || '—'} ${run.completedBy ? 'von ' + run.completedBy : ''}`, italics: true, color: '666666' })] }),
    new Paragraph({ children: [new TextRun({ text: `Geräte: ${run.devices.length} gesamt · ${scanned} erfasst · ${missing.length} fehlend · ${lateFound.length} nachgefunden · ${run.extras.length} unerwartete Scans`, bold: true })] }),
    new Paragraph({ text: '' }),
  ]

  // Notizen zum Bericht (falls angelegt)
  if (run.notes && run.notes.trim()) {
    children.push(new Paragraph({ text: 'Notizen zum Bericht', heading: HeadingLevel.HEADING_2 }))
    for (const line of run.notes.trim().split(/\r?\n/)) {
      children.push(new Paragraph({ children: [new TextRun({ text: line || ' ', size: 20 })] }))
    }
    children.push(new Paragraph({ text: '' }))
  }

  children.push(new Paragraph({ text: 'Fehlende Geräte', heading: HeadingLevel.HEADING_2 }))

  if (missing.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Alle Geräte sind vorhanden.', color: '047857' })] }))
  } else {
    const rows = [
      new TableRow({ children: headerCells(['Seriennummer', 'Gerätetyp', 'Company', 'Substate', 'AD-Hostname', 'Online', 'Letzter Logon', 'Akt. Benutzer', 'Kommentar']), tableHeader: true }),
      ...missing.map(d => new TableRow({
        children: [
          cell(d.serial), cell(d.deviceType), cell(d.company), cell(d.substate),
          cell(d.adHostname || '—'),
          cell(d.adOnline === undefined ? '—' : (d.adOnline ? 'Ja' : 'Nein')),
          cell(fmtDateTime(d.adLastOnline) || '—'),
          cell(d.adCurrentUser || '—'),
          cell(d.comment),
        ],
      })),
    ]
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL }))
  }

  if (lateFound.length > 0) {
    children.push(new Paragraph({ text: 'Nachträglich gefunden', heading: HeadingLevel.HEADING_2 }))
    const rows = [
      new TableRow({ children: headerCells(['Seriennummer', 'Zeitpunkt', 'Bearbeiter', 'Notiz']), tableHeader: true }),
      ...lateFound.map(d => new TableRow({ children: [cell(d.serial), cell(fmtDateTime(d.lateFoundAt)), cell(d.lateFoundBy || ''), cell(d.lateNote || '')] })),
    ]
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL }))
  }

  if (run.extras.length > 0) {
    children.push(new Paragraph({ text: 'Unerwartete Scans', heading: HeadingLevel.HEADING_2 }))
    const rows = [
      new TableRow({ children: headerCells(['Seriennummer', 'Zeitpunkt', 'Bearbeiter', 'Begründung']), tableHeader: true }),
      ...run.extras.map(x => new TableRow({ children: [cell(x.serial), cell(fmtDateTime(x.scannedAt)), cell(x.scannedBy), cell(x.reason || '')] })),
    ]
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL }))
  }

  if (run.history.length > 0) {
    children.push(new Paragraph({ text: 'Verlauf / Korrekturen', heading: HeadingLevel.HEADING_2 }))
    const rows = [
      new TableRow({ children: headerCells(['Zeitpunkt', 'Bearbeiter', 'Aktion', 'Details']), tableHeader: true }),
      ...run.history.map(h => new TableRow({ children: [cell(fmtDateTime(h.timestamp)), cell(h.by), cell(h.action), cell(h.details || '')] })),
    ]
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL }))
  }

  const doc = new Document({ sections: [{ children }] })
  await writeAndCheck(savePath, await Packer.toBase64String(doc))
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function exportPdf(run: InventoryRun, savePath: string): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const scanned = run.devices.filter(d => d.scanned).length
  const missing = run.devices.filter(d => !d.scanned)
  const lateFound = run.devices.filter(d => d.lateFound)

  doc.setFontSize(16); doc.setTextColor(30, 64, 175)
  doc.text('Hardware-Inventur', 14, 16)
  doc.setFontSize(13); doc.setTextColor(20, 20, 20)
  doc.text(run.title, 14, 24)
  doc.setFontSize(9); doc.setTextColor(90)
  doc.text(`Importiert: ${fmtDateTime(run.importedAt)} von ${run.importedBy}`, 14, 30)
  doc.text(`Abgeschlossen: ${fmtDateTime(run.completedAt) || '—'} ${run.completedBy ? 'von ' + run.completedBy : ''}`, 14, 35)
  doc.setFontSize(10); doc.setTextColor(20, 20, 20)
  doc.text(`Geräte: ${run.devices.length} gesamt · ${scanned} erfasst · ${missing.length} fehlend · ${lateFound.length} nachgefunden · ${run.extras.length} unerwartete Scans`, 14, 43)

  let y = 50

  // Notizen zum Bericht (falls angelegt)
  if (run.notes && run.notes.trim()) {
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    doc.setFontSize(12); doc.setTextColor(30, 64, 175); doc.text('Notizen zum Bericht', 14, y); y += 5
    doc.setFontSize(9); doc.setTextColor(40, 40, 40)
    const noteLines: string[] = doc.splitTextToSize(run.notes.trim(), pageW - 28)
    for (const line of noteLines) {
      if (y > pageH - 14) { doc.addPage(); y = 16 }
      doc.text(line, 14, y)
      y += 4.5
    }
    y += 6
    if (y > pageH - 30) { doc.addPage(); y = 16 }
  }

  doc.setFontSize(12); doc.setTextColor(30, 64, 175); doc.text('Fehlende Geräte', 14, y); y += 4

  if (missing.length === 0) {
    doc.setFontSize(11); doc.setTextColor(4, 120, 87)
    doc.text('Alle Geräte sind vorhanden.', 14, y + 6)
    y += 16
  } else {
    autoTable(doc, {
      startY: y,
      head: [['Seriennummer', 'Gerätetyp', 'Company', 'Substate', 'AD-Host', 'Online', 'Last Logon', 'Akt. Benutzer', 'Kommentar']],
      body: missing.map(d => [
        d.serial, d.deviceType, d.company, d.substate,
        d.adHostname || '—',
        d.adOnline === undefined ? '—' : (d.adOnline ? 'Ja' : 'Nein'),
        fmtDateTime(d.adLastOnline) || '—',
        d.adCurrentUser || '—',
        d.comment,
      ]),
      styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 244, 255] },
      margin: { left: 14, right: 14 },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  if (lateFound.length > 0) {
    if (y > 170) { doc.addPage(); y = 16 }
    doc.setFontSize(12); doc.setTextColor(30, 64, 175); doc.text('Nachträglich gefunden', 14, y); y += 4
    autoTable(doc, {
      startY: y,
      head: [['Seriennummer', 'Zeitpunkt', 'Bearbeiter', 'Notiz']],
      body: lateFound.map(d => [d.serial, fmtDateTime(d.lateFoundAt), d.lateFoundBy || '', d.lateNote || '']),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      margin: { left: 14, right: 14 },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  if (run.extras.length > 0) {
    if (y > 170) { doc.addPage(); y = 16 }
    doc.setFontSize(12); doc.setTextColor(180, 100, 0); doc.text('Unerwartete Scans', 14, y); y += 4
    autoTable(doc, {
      startY: y,
      head: [['Seriennummer', 'Zeitpunkt', 'Bearbeiter', 'Begründung']],
      body: run.extras.map(x => [x.serial, fmtDateTime(x.scannedAt), x.scannedBy, x.reason || '']),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [180, 100, 0], textColor: 255 },
      margin: { left: 14, right: 14 },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  if (run.history.length > 0) {
    if (y > 170) { doc.addPage(); y = 16 }
    doc.setFontSize(12); doc.setTextColor(90, 90, 90); doc.text('Verlauf', 14, y); y += 4
    autoTable(doc, {
      startY: y,
      head: [['Zeitpunkt', 'Bearbeiter', 'Aktion', 'Details']],
      body: run.history.map(h => [fmtDateTime(h.timestamp), h.by, h.action, h.details || '']),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [90, 90, 90], textColor: 255 },
      margin: { left: 14, right: 14 },
    })
  }

  await writeAndCheck(savePath, arrayBufferToBase64(doc.output('arraybuffer')))
}

export type InventoryExportFormat = 'pdf' | 'word' | 'excel'

export async function exportInventoryRun(run: InventoryRun, format: InventoryExportFormat): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const extMap: Record<InventoryExportFormat, string> = { pdf: 'pdf', word: 'docx', excel: 'xlsx' }
  const filterMap: Record<InventoryExportFormat, { name: string; extensions: string[] }> = {
    pdf: { name: 'PDF', extensions: ['pdf'] },
    word: { name: 'Word', extensions: ['docx'] },
    excel: { name: 'Excel', extensions: ['xlsx'] },
  }
  const savePath = await api().saveFileDialog(suggestName(run, extMap[format]), [filterMap[format]])
  if (!savePath) return { ok: true, cancelled: true }
  try {
    if (format === 'pdf') await exportPdf(run, savePath)
    else if (format === 'word') await exportWord(run, savePath)
    else await exportExcel(run, savePath)
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
