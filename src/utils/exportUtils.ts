import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { QueryResult, UserProfileData } from '../types'
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

// ── Permission comparison helpers ─────────────────────────────────────────────

interface PermExportInfo {
  user: UserProfileData
  compUser: { SamAccountName: string; DisplayName: string; EmployeeID: string; Department: string; Title: string }
  missingGroups: string[]
}

// ── Permission Excel ──────────────────────────────────────────────────────────
export async function exportExcelPermissions(info: PermExportInfo, savePath: string): Promise<void> {
  const { user, compUser, missingGroups } = info
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()

  const ws = wb.addWorksheet('Berechtigungsanfrage')
  ws.addRow(['IT Admin Tool — Berechtigungsanfrage'])
  ws.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1E40AF' } }
  ws.addRow([`Erstellt am: ${new Date().toLocaleString('de-DE')}`])
  ws.addRow([])

  ws.addRow(['Benutzer'])
  ws.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
  ws.addRow(['Name', user.Name || user.Sam])
  ws.addRow(['Corp ID', user.EmpID || '–'])
  ws.addRow(['Abteilung', user.Dept || '–'])
  ws.addRow(['Standort', user.Office || '–'])
  ws.addRow([])

  ws.addRow(['Vergleichsbasis'])
  ws.getRow(10).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } }
  ws.addRow(['Name', compUser.DisplayName || compUser.SamAccountName])
  ws.addRow(['Corp ID', compUser.EmployeeID || '–'])
  ws.addRow(['Jobtitel', compUser.Title || '–'])
  ws.addRow(['Abteilung', compUser.Department || '–'])
  ws.addRow([])

  ws.addRow(['Fehlende Berechtigungen', `(${missingGroups.length})`])
  ws.getRow(16).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(16).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }
  for (const g of missingGroups) {
    ws.addRow([g])
  }
  ws.columns.forEach((c) => { c.width = 50 })

  const ab = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(ab))
}

// ── Permission Word ───────────────────────────────────────────────────────────
export async function exportWordPermissions(info: PermExportInfo, savePath: string): Promise<void> {
  const { user, compUser, missingGroups } = info
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }

  const mkRow = (label: string, value: string) => new TableRow({
    children: [
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] }),
      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: value })] })] }),
    ],
  })

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: 'IT Admin Tool — Berechtigungsanfrage', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `Erstellt am: ${new Date().toLocaleString('de-DE')}`, italics: true })] }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Benutzer', heading: HeadingLevel.HEADING_2 }),
    new Table({
      rows: [
        mkRow('Name', user.Name || user.Sam),
        mkRow('Corp ID', user.EmpID || '–'),
        mkRow('Abteilung', user.Dept || '–'),
        mkRow('Standort', user.Office || '–'),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: ALL_BORDERS,
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Vergleichsbasis', heading: HeadingLevel.HEADING_2 }),
    new Table({
      rows: [
        mkRow('Name', compUser.DisplayName || compUser.SamAccountName),
        mkRow('Corp ID', compUser.EmployeeID || '–'),
        mkRow('Jobtitel', compUser.Title || '–'),
        mkRow('Abteilung', compUser.Department || '–'),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: ALL_BORDERS,
    }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: `Fehlende Berechtigungen (${missingGroups.length})`, heading: HeadingLevel.HEADING_2 }),
    new Table({
      rows: [
        new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Gruppe / Berechtigung', bold: true })] })] })] }),
        ...missingGroups.map((g) => new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: g, font: 'Courier New' })] })] })] })),
      ],
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: ALL_BORDERS,
    }),
  ]

  const doc = new Document({ sections: [{ children }] })
  await writeAndCheck(savePath, await Packer.toBase64String(doc))
}

// ── Permission PDF ────────────────────────────────────────────────────────────
export async function exportPdfPermissions(info: PermExportInfo, savePath: string): Promise<void> {
  const { user, compUser, missingGroups } = info
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  doc.setFontSize(18); doc.setTextColor(30, 64, 175)
  doc.text('Berechtigungsanfrage', 14, 20)
  doc.setFontSize(9); doc.setTextColor(120)
  doc.text(`Erstellt am: ${new Date().toLocaleString('de-DE')}`, 14, 27)

  autoTable(doc, {
    startY: 33,
    head: [['Benutzer', '']],
    body: [
      ['Name', user.Name || user.Sam],
      ['Corp ID', user.EmpID || '–'],
      ['Abteilung', user.Dept || '–'],
      ['Standort', user.Office || '–'],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  })

  const y1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  autoTable(doc, {
    startY: y1,
    head: [['Vergleichsbasis', '']],
    body: [
      ['Name', compUser.DisplayName || compUser.SamAccountName],
      ['Corp ID', compUser.EmployeeID || '–'],
      ['Jobtitel', compUser.Title || '–'],
      ['Abteilung', compUser.Department || '–'],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [55, 65, 81], textColor: 255 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    margin: { left: 14, right: 14 },
  })

  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6

  autoTable(doc, {
    startY: y2,
    head: [[`Fehlende Berechtigungen (${missingGroups.length})`]],
    body: missingGroups.map((g) => [g]),
    styles: { fontSize: 8, cellPadding: 2, font: 'courier' },
    headStyles: { fillColor: [217, 119, 6], textColor: 255 },
    alternateRowStyles: { fillColor: [254, 243, 199] },
    margin: { left: 14, right: 14 },
  })

  await writeAndCheck(savePath, arrayBufferToBase64(doc.output('arraybuffer')))
}

// ── User Profile helpers ──────────────────────────────────────────────────────

function upField(label: string, value: string | null | undefined): string {
  return value ? String(value) : '–'
}

const UP_SECTIONS: { title: string; fields: (keyof UserProfileData)[][]; labels: string[][] }[] = [
  {
    title: 'Allgemeine Informationen',
    fields: [['Name'],['GivenName','Surname'],['Sam','UPN'],['EmpID','Mail'],['Title','Dept'],['Company','Office'],['Street','PostalCode'],['City','Country'],['Desc']],
    labels: [['Anzeigename'],['Vorname','Nachname'],['SAMAccountName','UPN'],['Corp ID','E-Mail'],['Jobtitel','Abteilung'],['Unternehmen','Standort'],['Straße','PLZ'],['Stadt','Land'],['Beschreibung']],
  },
  {
    title: 'Kontaktdaten',
    fields: [['Phone','Mobile'],['Fax','IPPhone'],['OtherPhone','OtherMobile']],
    labels: [['Telefon','Mobil'],['Fax','IP-Telefon/Xelion'],['Weitere Telefon','Weitere Mobil']],
  },
  {
    title: 'Konto & Sicherheit',
    fields: [['Created','PwdSet'],['PwdExpiry','PwdDaysLeft'],['LastLogon','BadPwdTime'],['BadLogonCount','AcctExpiry']],
    labels: [['Erstellt am','Letzter PW-Reset'],['PW läuft ab','Tage bis Ablauf'],['Letzter Login','Letzter Fehler-Login'],['Fehler-Anmeldeversuche','Konto läuft ab']],
  },
  {
    title: 'Gerät',
    fields: [['Device','LogonTime']],
    labels: [['Gerät','Letzte Anmeldung']],
  },
  {
    title: 'Organisation',
    fields: [['MgrName','MgrSam']],
    labels: [['Manager','Manager SAM']],
  },
  {
    title: 'Sonstige Attribute',
    fields: [['HomeDir','ProfilePath'],['ScriptPath']],
    labels: [['Home-Verzeichnis','Profilpfad'],['Anmeldeskript']],
  },
]

function upFlatRows(p: UserProfileData): string[][] {
  const rows: string[][] = []
  for (const sec of UP_SECTIONS) {
    rows.push([sec.title, '', ''])
    for (let i = 0; i < sec.fields.length; i++) {
      const flds = sec.fields[i]; const lbls = sec.labels[i]
      rows.push([lbls[0] ?? '', upField(lbls[0] ?? '', String(p[flds[0]] ?? '')), flds[1] ? `${lbls[1]}: ${upField(lbls[1], String(p[flds[1]] ?? ''))}` : ''])
    }
    rows.push(['', '', ''])
  }
  // Groups
  rows.push(['Gruppen', p.Groups ? p.Groups.split(';').join(', ') : '–', ''])
  return rows
}

// ── User Profile Excel ────────────────────────────────────────────────────────
export async function exportExcelUserProfiles(profiles: UserProfileData[], savePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()

  // Summary sheet
  const summary = wb.addWorksheet('Übersicht')
  summary.addRow(['Name', 'SAMAccountName', 'Corp ID', 'E-Mail', 'Abteilung', 'Standort', 'Status', 'Gesperrt', 'Gerät', 'Letzter Login'])
  const sh = summary.getRow(1)
  sh.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
  for (const p of profiles) {
    summary.addRow([p.Name, p.Sam, p.EmpID, p.Mail, p.Dept, p.Office, p.Enabled ? 'Aktiv' : 'Deaktiviert', p.Locked ? 'Ja' : 'Nein', p.Device, p.LogonTime])
  }
  summary.columns.forEach((c) => { c.width = 24 })

  // Per-user sheets
  for (const p of profiles) {
    const name = (p.Sam || p.Name || 'Benutzer').slice(0, 28)
    const ws = wb.addWorksheet(name)
    ws.addRow(['Feld', 'Wert', 'Details'])
    const hr = ws.getRow(1)
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

    for (const row of upFlatRows(p)) {
      const r = ws.addRow(row)
      if (row[1] === '' && row[0]) {
        r.font = { bold: true, color: { argb: 'FF3B82F6' } }
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
      }
    }
    ws.columns.forEach((c) => { c.width = 32 })
  }

  const ab = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(ab))
}

// ── User Profile Word ─────────────────────────────────────────────────────────
export async function exportWordUserProfiles(profiles: UserProfileData[], savePath: string): Promise<void> {
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: 'IT Admin Tool — Benutzerprofile', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `Erstellt am: ${new Date().toLocaleString('de-DE')}`, italics: true })] }),
    new Paragraph({ text: '' }),
  ]

  for (const p of profiles) {
    children.push(new Paragraph({ text: p.Name || p.Sam, heading: HeadingLevel.HEADING_2 }))
    for (const sec of UP_SECTIONS) {
      children.push(new Paragraph({ text: sec.title, heading: HeadingLevel.HEADING_3 }))
      const rows = sec.fields.map((flds, i) => {
        const lbls = sec.labels[i]
        const cells: TableCell[] = []
        for (let j = 0; j < flds.length; j++) {
          cells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: lbls[j] ?? '', bold: true })] })] }))
          cells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: upField(lbls[j] ?? '', String(p[flds[j]] ?? '')) })] })] }))
        }
        return new TableRow({ children: cells })
      })
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL_BORDERS }))
      children.push(new Paragraph({ text: '' }))
    }
    // Groups
    children.push(new Paragraph({ text: 'Gruppen', heading: HeadingLevel.HEADING_3 }))
    children.push(new Paragraph({ children: [new TextRun({ text: p.Groups ? p.Groups.split(';').join(', ') : '–' })] }))
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({ sections: [{ children }] })
  await writeAndCheck(savePath, await Packer.toBase64String(doc))
}

// ── Remote Doc single-result helpers ─────────────────────────────────────────

type RDParsed =
  | { type: 'array'; headers: string[]; rows: string[][] }
  | { type: 'object'; pairs: [string, string][] }
  | { type: 'text'; text: string }

function parseRemoteDocText(text: string): RDParsed {
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      const headers = Object.keys(parsed[0])
      const rows = (parsed as Record<string, unknown>[]).map(item => headers.map(h => String(item[h] ?? '—')))
      return { type: 'array', headers, rows }
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const pairs = Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '—')] as [string, string])
      return { type: 'object', pairs }
    }
  } catch { /* not JSON */ }
  return { type: 'text', text }
}

export async function exportRemoteDocResultExcel(label: string, text: string, savePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'
  wb.created = new Date()
  const ws = wb.addWorksheet(label.slice(0, 31))
  const parsed = parseRemoteDocText(text)
  if (parsed.type === 'array') {
    ws.addRow(parsed.headers)
    const hr = ws.getRow(1)
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    for (const row of parsed.rows) ws.addRow(row)
  } else if (parsed.type === 'object') {
    ws.addRow(['Eigenschaft', 'Wert'])
    const hr = ws.getRow(1)
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
    for (const [k, v] of parsed.pairs) ws.addRow([k, v])
  } else {
    ws.addRow(['Ausgabe'])
    ws.getRow(1).font = { bold: true }
    for (const line of parsed.text.split('\n')) ws.addRow([line])
  }
  ws.columns.forEach((col) => { col.width = 40 })
  const arrayBuffer = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(arrayBuffer))
}

export async function exportRemoteDocResultWord(label: string, text: string, savePath: string): Promise<void> {
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }
  const parsed = parseRemoteDocText(text)
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: label, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text: `Erstellt am: ${new Date().toLocaleString('de-DE')}`, italics: true })] }),
    new Paragraph({ text: '' }),
  ]
  if (parsed.type === 'array') {
    const rows = [
      new TableRow({ children: parsed.headers.map(h => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }),
      ...parsed.rows.map(row => new TableRow({ children: row.map(cell => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell })] })] })) })),
    ]
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL_BORDERS }))
  } else if (parsed.type === 'object') {
    const rows = parsed.pairs.map(([k, v]) => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: k, bold: true })] })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: v })] })] }),
      ],
    }))
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL_BORDERS }))
  } else {
    children.push(new Paragraph({ children: [new TextRun({ text: parsed.text, font: 'Courier New' })] }))
  }
  const doc = new Document({ sections: [{ children }] })
  await writeAndCheck(savePath, await Packer.toBase64String(doc))
}

export async function exportRemoteDocResultPdf(label: string, text: string, savePath: string): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  doc.setFontSize(16); doc.setTextColor(30, 64, 175)
  doc.text(label, 14, 18)
  doc.setFontSize(9); doc.setTextColor(120)
  doc.text(`Erstellt: ${new Date().toLocaleString('de-DE')}`, 14, 24)
  const parsed = parseRemoteDocText(text)
  if (parsed.type === 'array') {
    autoTable(doc, {
      startY: 30, head: [parsed.headers], body: parsed.rows,
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 244, 255] },
      margin: { left: 14, right: 14 },
    })
  } else if (parsed.type === 'object') {
    autoTable(doc, {
      startY: 30, head: [['Eigenschaft', 'Wert']], body: parsed.pairs,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 244, 255] },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
      margin: { left: 14, right: 14 },
    })
  } else {
    doc.setFontSize(8); doc.setTextColor(40)
    doc.text(doc.splitTextToSize(parsed.text, 260), 14, 30)
  }
  await writeAndCheck(savePath, arrayBufferToBase64(doc.output('arraybuffer')))
}

// ── User Profile PDF ──────────────────────────────────────────────────────────
export async function exportPdfUserProfiles(profiles: UserProfileData[], savePath: string): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  for (let pi = 0; pi < profiles.length; pi++) {
    if (pi > 0) doc.addPage()
    const p = profiles[pi]

    doc.setFontSize(16); doc.setTextColor(30, 64, 175)
    doc.text(p.Name || p.Sam || 'Benutzer', 14, 18)
    doc.setFontSize(9); doc.setTextColor(120)
    doc.text(`${p.Sam} · ${p.EmpID || '–'} · Exportiert: ${new Date().toLocaleString('de-DE')}`, 14, 24)

    const body: string[][] = [
      ['Abteilung', p.Dept || '–', 'Standort', p.Office || '–'],
      ['E-Mail', p.Mail || '–', 'Telefon', p.Phone || '–'],
      ['Mobil', p.Mobile || '–', 'IP-Telefon', p.IPPhone || '–'],
      ['Status', p.Enabled ? 'Aktiv' : 'Deaktiviert', 'Gesperrt', p.Locked ? 'Ja' : 'Nein'],
      ['Erstellt', p.Created || '–', 'PW-Reset', p.PwdSet || '–'],
      ['PW läuft ab', p.PwdExpiry || (p.PwdNeverExpires ? 'Nie' : '–'), 'Letzter Login', p.LastLogon || '–'],
      ['Gerät', p.Device || '–', 'Anmeldung', p.LogonTime || '–'],
      ['Manager', p.MgrName || '–', 'Manager SAM', p.MgrSam || '–'],
      ['Jobtitel', p.Title || '–', 'Unternehmen', p.Company || '–'],
    ]

    autoTable(doc, {
      startY: 28,
      head: [['Feld', 'Wert', 'Feld', 'Wert']],
      body,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 244, 255] },
      margin: { left: 14, right: 14 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 }, 2: { fontStyle: 'bold', cellWidth: 35 } },
    })

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
    // Groups
    doc.setFontSize(10); doc.setTextColor(30, 64, 175)
    doc.text('Gruppen', 14, finalY)
    doc.setFontSize(7); doc.setTextColor(60)
    const groupText = p.Groups ? p.Groups.split(';').join('  ·  ') : '–'
    const lines = doc.splitTextToSize(groupText, 180)
    doc.text(lines, 14, finalY + 5)
  }

  await writeAndCheck(savePath, arrayBufferToBase64(doc.output('arraybuffer')))
}
