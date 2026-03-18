import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { QueryResult } from '../types'
import type { XelionResult } from './adUtils'
import type { PhoneCheckEntry } from './phoneUtils'
import { PHONE_FIELD_LABELS } from './phoneUtils'
import { QUERY_DEFINITIONS } from './queries'
import { api } from '../electronAPI'

function getLabel(queryId: string) {
  return QUERY_DEFINITIONS.find((q) => q.id === queryId)?.label ?? queryId
}

function getCategory(queryId: string) {
  return QUERY_DEFINITIONS.find((q) => q.id === queryId)?.category ?? 'Sonstige'
}

// ── Browser-compatible ArrayBuffer → base64 (no Buffer needed) ───────────────
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Process in 8 KB chunks to avoid call stack overflow on large files
  const chunkSize = 8192
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function writeAndCheck(savePath: string, base64: string): Promise<void> {
  const result = await api().writeFile(savePath, base64)
  if (!result.success) {
    throw new Error(result.error ?? 'Datei konnte nicht gespeichert werden')
  }
}

// ── Excel ────────────────────────────────────────────────────────────────────
export async function exportExcel(results: QueryResult[], savePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'
  wb.created = new Date()

  const byCategory = new Map<string, QueryResult[]>()
  for (const r of results) {
    const cat = getCategory(r.queryId)
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(r)
  }

  for (const [cat, catResults] of byCategory) {
    const ws = wb.addWorksheet(cat.slice(0, 31))
    ws.addRow(['Hostname', 'Abfrage', 'Status', 'Ergebnis', 'Zeitstempel'])
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    for (const r of catResults) {
      ws.addRow([
        r.hostname,
        getLabel(r.queryId),
        r.status,
        r.output || r.error || '',
        new Date(r.timestamp).toLocaleString('de-DE'),
      ])
    }
    ws.columns.forEach((col) => { col.width = 30 })
  }

  // writeBuffer() returns ArrayBuffer — convert without Buffer
  const arrayBuffer = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(arrayBuffer))
}

// ── Word ─────────────────────────────────────────────────────────────────────
export async function exportWord(results: QueryResult[], savePath: string): Promise<void> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      text: 'IT Admin Tool — Abfrageergebnisse',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({
      children: [new TextRun({ text: `Erstellt am: ${new Date().toLocaleString('de-DE')}`, italics: true })],
    }),
    new Paragraph({ text: '' }),
  ]

  const byHost = new Map<string, QueryResult[]>()
  for (const r of results) {
    if (!byHost.has(r.hostname)) byHost.set(r.hostname, [])
    byHost.get(r.hostname)!.push(r)
  }

  for (const [host, hostResults] of byHost) {
    children.push(new Paragraph({ text: host, heading: HeadingLevel.HEADING_2 }))

    const tableRows = [
      new TableRow({
        children: ['Abfrage', 'Status', 'Ergebnis'].map(
          (t) =>
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
            })
        ),
      }),
      ...hostResults.map(
        (r) =>
          new TableRow({
            children: [getLabel(r.queryId), r.status, (r.output || r.error || '').slice(0, 500)].map(
              (t) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t })] })] })
            ),
          })
      ),
    ]

    children.push(
      new Table({
        rows: tableRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top:     { style: BorderStyle.SINGLE, size: 1 },
          bottom:  { style: BorderStyle.SINGLE, size: 1 },
          left:    { style: BorderStyle.SINGLE, size: 1 },
          right:   { style: BorderStyle.SINGLE, size: 1 },
          insideH: { style: BorderStyle.SINGLE, size: 1 },
          insideV: { style: BorderStyle.SINGLE, size: 1 },
        },
      })
    )
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({ sections: [{ children }] })
  // Packer.toBase64String() returns base64 directly — no Buffer.toString() needed
  const base64 = await Packer.toBase64String(doc)
  await writeAndCheck(savePath, base64)
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function exportPdf(results: QueryResult[], savePath: string): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(18)
  doc.setTextColor(30, 64, 175)
  doc.text('IT Admin Tool — Abfrageergebnisse', 14, 20)

  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Erstellt: ${new Date().toLocaleString('de-DE')}`, 14, 28)

  let y = 36
  const byHost = new Map<string, QueryResult[]>()
  for (const r of results) {
    if (!byHost.has(r.hostname)) byHost.set(r.hostname, [])
    byHost.get(r.hostname)!.push(r)
  }

  for (const [host, hostResults] of byHost) {
    doc.setFontSize(13)
    doc.setTextColor(30, 64, 175)
    if (y > 170) { doc.addPage(); y = 20 }
    doc.text(host, 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Abfrage', 'Kategorie', 'Status', 'Ergebnis']],
      body: hostResults.map((r) => [
        getLabel(r.queryId),
        getCategory(r.queryId),
        r.status,
        (r.output || r.error || '').slice(0, 200),
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 244, 255] },
      margin: { left: 14, right: 14 },
    })

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  }

  // doc.output('arraybuffer') returns ArrayBuffer — convert without Buffer
  const arrayBuffer = doc.output('arraybuffer')
  await writeAndCheck(savePath, arrayBufferToBase64(arrayBuffer))
}

// ── Xelion helpers ────────────────────────────────────────────────────────────
function xelionStatus(r: XelionResult): string {
  if (r.hasAnyPhone && !r.hasXelion) return 'Kein Xelion'
  if (r.hasXelion) return 'Xelion aktiv'
  return 'Keine Daten'
}

function xelionHeaders(opts: { showNumbers: boolean; showPwdLastSet: boolean }): string[] {
  const h = ['Name', 'Status']
  if (opts.showNumbers) h.push('Telefon (Xelion)', 'Mobil', 'IP-Phone')
  if (opts.showPwdLastSet) h.push('PW zuletzt geändert')
  return h
}

function xelionRow(r: XelionResult, opts: { showNumbers: boolean; showPwdLastSet: boolean }): string[] {
  const row = [r.name, xelionStatus(r)]
  if (opts.showNumbers) row.push(r.telephoneNumber || '—', r.mobile || '—', r.ipPhone || '—')
  if (opts.showPwdLastSet) row.push(r.pwdLastSet || '—')
  return row
}

// ── Xelion Excel ──────────────────────────────────────────────────────────────
export async function exportExcelXelion(
  results: XelionResult[],
  opts: { showNumbers: boolean; showPwdLastSet: boolean },
  savePath: string
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'
  wb.created = new Date()

  const ws = wb.addWorksheet('Xelion & Diensthandy')
  const headers = xelionHeaders(opts)
  ws.addRow(headers)
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

  for (const r of results) {
    ws.addRow(xelionRow(r, opts))
  }
  ws.columns.forEach((col) => { col.width = 30 })

  const arrayBuffer = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(arrayBuffer))
}

// ── Xelion Word ───────────────────────────────────────────────────────────────
export async function exportWordXelion(
  results: XelionResult[],
  opts: { showNumbers: boolean; showPwdLastSet: boolean },
  savePath: string
): Promise<void> {
  const headers = xelionHeaders(opts)

  const tableRows = [
    new TableRow({
      children: headers.map((t) =>
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })] })
      ),
    }),
    ...results.map((r) =>
      new TableRow({
        children: xelionRow(r, opts).map((t) =>
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t })] })] })
        ),
      })
    ),
  ]

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'IT Admin Tool — Diensthandy & Xelion', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `Erstellt am: ${new Date().toLocaleString('de-DE')}`, italics: true })] }),
        new Paragraph({ text: '' }),
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top:     { style: BorderStyle.SINGLE, size: 1 },
            bottom:  { style: BorderStyle.SINGLE, size: 1 },
            left:    { style: BorderStyle.SINGLE, size: 1 },
            right:   { style: BorderStyle.SINGLE, size: 1 },
            insideH: { style: BorderStyle.SINGLE, size: 1 },
            insideV: { style: BorderStyle.SINGLE, size: 1 },
          },
        }),
      ],
    }],
  })

  const base64 = await Packer.toBase64String(doc)
  await writeAndCheck(savePath, base64)
}

// ── Xelion PDF ────────────────────────────────────────────────────────────────
export async function exportPdfXelion(
  results: XelionResult[],
  opts: { showNumbers: boolean; showPwdLastSet: boolean },
  savePath: string
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(18)
  doc.setTextColor(30, 64, 175)
  doc.text('IT Admin Tool — Diensthandy & Xelion', 14, 20)

  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Erstellt: ${new Date().toLocaleString('de-DE')}`, 14, 28)

  autoTable(doc, {
    startY: 36,
    head: [xelionHeaders(opts)],
    body: results.map((r) => xelionRow(r, opts)),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    margin: { left: 14, right: 14 },
  })

  const arrayBuffer = doc.output('arraybuffer')
  await writeAndCheck(savePath, arrayBufferToBase64(arrayBuffer))
}

// ── Phone Check helpers ───────────────────────────────────────────────────────
const PHONE_HEADERS = ['Rufnummer', 'Status', 'Name', 'Benutzername', 'AD-Feld', 'Hinterlegte Nummer']

function phoneRow(e: PhoneCheckEntry): string[] {
  return [
    e.inputNumber,
    e.found ? 'Gefunden' : 'Nicht gefunden',
    e.displayName    || '—',
    e.samAccountName || '—',
    e.matchedField   ? (PHONE_FIELD_LABELS[e.matchedField] ?? e.matchedField) : '—',
    e.matchedValue   || '—',
  ]
}

// ── Phone Check Excel ─────────────────────────────────────────────────────────
export async function exportExcelPhoneCheck(results: PhoneCheckEntry[], savePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'
  wb.created = new Date()

  const ws = wb.addWorksheet('Rufnummern People Core Check')
  ws.addRow(PHONE_HEADERS)
  const headerRow = ws.getRow(1)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

  for (const e of results) {
    const row = ws.addRow(phoneRow(e))
    row.getCell(2).font = { color: { argb: e.found ? 'FF22C55E' : 'FFEF4444' } }
  }
  ws.columns.forEach((col) => { col.width = 28 })

  const arrayBuffer = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(arrayBuffer))
}

// ── Phone Check Word ──────────────────────────────────────────────────────────
export async function exportWordPhoneCheck(results: PhoneCheckEntry[], savePath: string): Promise<void> {
  const tableRows = [
    new TableRow({
      children: PHONE_HEADERS.map((t) =>
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })] })
      ),
    }),
    ...results.map((e) =>
      new TableRow({
        children: phoneRow(e).map((t) =>
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t })] })] })
        ),
      })
    ),
  ]

  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: 'IT Admin Tool — Rufnummern People Core Check', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `Erstellt am: ${new Date().toLocaleString('de-DE')}`, italics: true })] }),
        new Paragraph({ text: '' }),
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top:     { style: BorderStyle.SINGLE, size: 1 },
            bottom:  { style: BorderStyle.SINGLE, size: 1 },
            left:    { style: BorderStyle.SINGLE, size: 1 },
            right:   { style: BorderStyle.SINGLE, size: 1 },
            insideH: { style: BorderStyle.SINGLE, size: 1 },
            insideV: { style: BorderStyle.SINGLE, size: 1 },
          },
        }),
      ],
    }],
  })

  const base64 = await Packer.toBase64String(doc)
  await writeAndCheck(savePath, base64)
}

// ── Phone Check PDF ───────────────────────────────────────────────────────────
export async function exportPdfPhoneCheck(results: PhoneCheckEntry[], savePath: string): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(18)
  doc.setTextColor(30, 64, 175)
  doc.text('IT Admin Tool — Rufnummern People Core Check', 14, 20)

  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Erstellt: ${new Date().toLocaleString('de-DE')}`, 14, 28)

  autoTable(doc, {
    startY: 36,
    head: [PHONE_HEADERS],
    body: results.map(phoneRow),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    margin: { left: 14, right: 14 },
    didParseCell: (data: { section: string; column: { index: number }; cell: { raw: unknown; styles: { textColor: number[] } } }) => {
      if (data.section === 'body' && data.column.index === 1) {
        const val = String(data.cell.raw ?? '')
        data.cell.styles.textColor = val === 'Gefunden' ? [34, 197, 94] : [239, 68, 68]
      }
    },
  })

  const arrayBuffer2 = doc.output('arraybuffer')
  await writeAndCheck(savePath, arrayBufferToBase64(arrayBuffer2))
}
