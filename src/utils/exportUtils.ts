import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { QueryResult } from '../types'
import { QUERY_DEFINITIONS } from './queries'
import { api } from '../electronAPI'

function getLabel(queryId: string) {
  return QUERY_DEFINITIONS.find((q) => q.id === queryId)?.label ?? queryId
}

function getCategory(queryId: string) {
  return QUERY_DEFINITIONS.find((q) => q.id === queryId)?.category ?? 'Sonstige'
}

// ── Excel ────────────────────────────────────────────────────────────────────
export async function exportExcel(results: QueryResult[], savePath: string) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'
  wb.created = new Date()

  // Group by category
  const byCategory = new Map<string, QueryResult[]>()
  for (const r of results) {
    const cat = getCategory(r.queryId)
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(r)
  }

  for (const [cat, catResults] of byCategory) {
    const ws = wb.addWorksheet(cat.slice(0, 31)) // Excel sheet name max 31 chars

    // Header row
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

  const buf = await wb.xlsx.writeBuffer()
  const base64 = Buffer.from(buf).toString('base64')
  await api().writeFile(savePath, base64)
}

// ── Word ─────────────────────────────────────────────────────────────────────
export async function exportWord(results: QueryResult[], savePath: string) {
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
          top: { style: BorderStyle.SINGLE, size: 1 },
          bottom: { style: BorderStyle.SINGLE, size: 1 },
          left: { style: BorderStyle.SINGLE, size: 1 },
          right: { style: BorderStyle.SINGLE, size: 1 },
          insideH: { style: BorderStyle.SINGLE, size: 1 },
          insideV: { style: BorderStyle.SINGLE, size: 1 },
        },
      })
    )
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({ sections: [{ children }] })
  const buf = await Packer.toBuffer(doc)
  await api().writeFile(savePath, buf.toString('base64'))
}

// ── PDF ──────────────────────────────────────────────────────────────────────
export async function exportPdf(results: QueryResult[], savePath: string) {
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

  const pdfBuf = Buffer.from(doc.output('arraybuffer'))
  await api().writeFile(savePath, pdfBuf.toString('base64'))
}
