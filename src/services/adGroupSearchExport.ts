// ── Export der AD-Gruppen-Suche ───────────────────────────────────────────────
// Exportiert die Trefferliste als Word, Excel oder PDF.

import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import type { GroupSearchResponse, GroupSearchResult, SearchMode } from './adGroupSearch'

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.byteLength; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

async function writeAndCheck(savePath: string, base64: string): Promise<void> {
  const res = await api().writeFile(savePath, base64)
  if (!res.success) throw new Error(res.error ?? 'Datei konnte nicht gespeichert werden')
}

function fmtDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE')
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

// Spaltenkopf je Modus
function columns(mode: SearchMode): { key: keyof GroupSearchResult | 'matchedJoined' | 'allJoined'; label: string }[] {
  if (mode === 'user') {
    return [
      { key: 'sam', label: 'Corp-ID' },
      { key: 'name', label: 'Name' },
      { key: 'col1', label: 'Titel' },
      { key: 'col2', label: 'Abteilung' },
      { key: 'col3', label: 'E-Mail' },
      { key: 'enabled', label: 'Aktiv' },
      { key: 'lastLogon', label: 'Letzter Logon' },
      { key: 'matchedJoined', label: 'Treffer-Gruppen' },
    ]
  }
  return [
    { key: 'sam', label: 'Computername' },
    { key: 'col1', label: 'DNS-Hostname' },
    { key: 'col2', label: 'Betriebssystem' },
    { key: 'col3', label: 'Beschreibung' },
    { key: 'enabled', label: 'Aktiv' },
    { key: 'lastLogon', label: 'Letzter Logon' },
    { key: 'matchedJoined', label: 'Treffer-Gruppen' },
  ]
}

function cellValue(r: GroupSearchResult, key: string): string {
  if (key === 'matchedJoined') return r.matchedGroups.join(', ')
  if (key === 'allJoined') return r.allGroups.join(', ')
  if (key === 'enabled') return r.enabled ? 'Ja' : 'Nein'
  if (key === 'lastLogon') return fmtDate(r.lastLogon)
  const v = (r as unknown as Record<string, unknown>)[key]
  return v == null ? '' : String(v)
}

function metaLine(resp: GroupSearchResponse): string {
  const modeLabel = resp.mode === 'user' ? 'Benutzer' : 'Computer'
  const nested = resp.recursive ? ' (inkl. verschachtelter Gruppen)' : ''
  return `Modus: ${modeLabel}${nested} · Suchbegriff: "${resp.query}" · ${resp.results.length} Treffer · ${resp.matchingGroups.length} passende Gruppen`
}

function suggestName(resp: GroupSearchResponse, ext: string): string {
  return `Gruppen-Suche ${sanitize(resp.query)} (${resp.mode === 'user' ? 'Benutzer' : 'Computer'}) ${new Date().toISOString().slice(0, 10)}.${ext}`
}

// ── Excel ───────────────────────────────────────────────────────────────────────
async function exportExcel(resp: GroupSearchResponse, savePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'
  wb.created = new Date()
  const ws = wb.addWorksheet('Gruppen-Suche')

  ws.addRow(['Gruppen-Suche – Ergebnis'])
  ws.getRow(1).font = { bold: true, size: 14 }
  ws.addRow([metaLine(resp)])
  ws.addRow([`Passende Gruppen: ${resp.matchingGroups.join(', ')}`])
  ws.addRow([])

  const cols = columns(resp.mode)
  // Zusaetzlich alle Gruppen als letzte Spalte
  const headers = [...cols.map(c => c.label), 'Alle Gruppen (Mitglied von)']
  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    cell.alignment = { vertical: 'middle' }
  })

  for (const r of resp.results) {
    const row = ws.addRow([...cols.map(c => cellValue(r, c.key as string)), r.allGroups.join(', ')])
    row.eachCell(cell => { cell.alignment = { vertical: 'top', wrapText: true } })
  }

  ws.columns.forEach((col, i) => { col.width = i >= headers.length - 2 ? 50 : 22 })

  const ab = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(ab))
}

// ── Word ──────────────────────────────────────────────────────────────────────────
async function exportWord(resp: GroupSearchResponse, savePath: string): Promise<void> {
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }
  const cols = columns(resp.mode)

  const headerCells = cols.map(c => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.label, bold: true, size: 16 })] })] }))
  const bodyRows = resp.results.map(r => new TableRow({
    children: cols.map(c => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cellValue(r, c.key as string), size: 16 })] })] })),
  }))

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: 'Gruppen-Suche – Ergebnis', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: metaLine(resp), italics: true, color: '666666' })] }),
    new Paragraph({ children: [new TextRun({ text: `Passende Gruppen: ${resp.matchingGroups.join(', ')}`, size: 18 })] }),
    new Paragraph({ text: '' }),
    new Table({
      rows: [new TableRow({ children: headerCells, tableHeader: true }), ...bodyRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: ALL,
    }),
  ]

  const doc = new Document({ sections: [{ children }] })
  await writeAndCheck(savePath, await Packer.toBase64String(doc))
}

// ── PDF ──────────────────────────────────────────────────────────────────────────
async function exportPdf(resp: GroupSearchResponse, savePath: string): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(16); doc.setTextColor(30, 64, 175)
  doc.text('Gruppen-Suche – Ergebnis', 14, 16)
  doc.setFontSize(9); doc.setTextColor(90)
  doc.text(doc.splitTextToSize(metaLine(resp), 270), 14, 23)
  doc.text(doc.splitTextToSize(`Passende Gruppen: ${resp.matchingGroups.join(', ')}`, 270), 14, 31)

  const cols = columns(resp.mode)
  const head = [cols.map(c => c.label)]
  const body = resp.results.map(r => cols.map(c => cellValue(r, c.key as string)))

  autoTable(doc, {
    startY: 38,
    head, body,
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    margin: { left: 14, right: 14 },
  })

  await writeAndCheck(savePath, arrayBufferToBase64(doc.output('arraybuffer')))
}

export type GroupExportFormat = 'pdf' | 'word' | 'excel'

export async function exportGroupSearch(resp: GroupSearchResponse, format: GroupExportFormat): Promise<{ ok: boolean; error?: string; cancelled?: boolean }> {
  const extMap: Record<GroupExportFormat, string> = { pdf: 'pdf', word: 'docx', excel: 'xlsx' }
  const filterMap: Record<GroupExportFormat, { name: string; extensions: string[] }> = {
    pdf: { name: 'PDF', extensions: ['pdf'] },
    word: { name: 'Word', extensions: ['docx'] },
    excel: { name: 'Excel', extensions: ['xlsx'] },
  }
  const savePath = await api().saveFileDialog(suggestName(resp, extMap[format]), [filterMap[format]])
  if (!savePath) return { ok: true, cancelled: true }
  try {
    if (format === 'pdf') await exportPdf(resp, savePath)
    else if (format === 'word') await exportWord(resp, savePath)
    else await exportExcel(resp, savePath)
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export fehlgeschlagen.' }
  }
}
