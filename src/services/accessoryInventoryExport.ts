// ── Zubehör-Inventur – Bestellung als PDF / Word / Excel ─────────────────────
// PDF ist der Anhang der Bestell-Mail (direkt gesendet oder im Outlook-Fenster);
// alle drei Formate lassen sich außerdem speichern. Links sind in allen Formaten klickbar.

import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType, ExternalHyperlink } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import type { BestellPosition } from './accessoryInventory'
import { sortiertePositionen, linkHref, kurzLink, bestellDatei } from './zubehoerBestellung'

export interface BestellMeta { von: string; an?: string; anmerkung?: string; datum?: Date }

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

const fmt = (d = new Date()) => d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const TITLE = 'Bestellung IT-Zubehör (Kleinteile-Lager)'
const kopfText = (m: BestellMeta) => `Erstellt am ${fmt(m.datum)} von ${m.von}${m.an ? ` · an ${m.an}` : ''}`

// ── Excel ───────────────────────────────────────────────────────────────────────
async function buildExcelBase64(pos: BestellPosition[], m: BestellMeta): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()
  const head: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }
  const ws = wb.addWorksheet('Bestellung')
  ws.addRow([TITLE]).getCell(1).font = { bold: true, size: 14 }
  ws.addRow([kopfText(m)]).getCell(1).font = { italic: true, color: { argb: 'FF666666' } }
  if (m.anmerkung?.trim()) ws.addRow([`Anmerkung: ${m.anmerkung.trim()}`])
  ws.addRow([])
  const hr = ws.addRow(['Pos.', 'Artikel', 'Anzahl', 'Bestelllink'])
  hr.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = head })
  pos.forEach((p, i) => {
    const row = ws.addRow([i + 1, p.name, p.menge, p.link || '—'])
    const h = linkHref(p.link)
    if (h) { row.getCell(4).value = { text: h, hyperlink: h } as ExcelJS.CellHyperlinkValue; row.getCell(4).font = { color: { argb: 'FF1D4ED8' }, underline: true } }
    row.getCell(1).alignment = { horizontal: 'center' }; row.getCell(3).alignment = { horizontal: 'center' }
  })
  const s = ws.addRow(['', 'Summe', pos.reduce((a, p) => a + p.menge, 0), `${pos.length} Positionen`])
  s.font = { bold: true }; s.getCell(3).alignment = { horizontal: 'center' }
  ws.columns = [{ width: 6 }, { width: 44 }, { width: 10 }, { width: 70 }]
  return arrayBufferToBase64(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

// ── Word ──────────────────────────────────────────────────────────────────────
async function buildWordBase64(pos: BestellPosition[], m: BestellMeta): Promise<string> {
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }
  const cell = (s: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s, size: 18, bold })] })] })
  const linkCell = (url: string) => {
    const h = linkHref(url)
    return new TableCell({ children: [new Paragraph({ children: h
      ? [new ExternalHyperlink({ link: h, children: [new TextRun({ text: kurzLink(url), color: '1D4ED8', underline: {}, size: 18 })] })]
      : [new TextRun({ text: '—', size: 18 })] })] })
  }
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: TITLE, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: kopfText(m), italics: true, color: '666666' })] }),
    ...(m.anmerkung?.trim() ? [new Paragraph({ children: [new TextRun({ text: 'Anmerkung: ', bold: true }), new TextRun({ text: m.anmerkung.trim() })] })] : []),
    new Paragraph({ text: '' }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL,
      rows: [
        new TableRow({ tableHeader: true, children: ['Pos.', 'Artikel', 'Anzahl', 'Bestelllink'].map(t => cell(t, true)) }),
        ...pos.map((p, i) => new TableRow({ children: [cell(String(i + 1)), cell(p.name), cell(String(p.menge)), linkCell(p.link)] })),
        new TableRow({ children: [cell(''), cell('Summe', true), cell(String(pos.reduce((a, p) => a + p.menge, 0)), true), cell(`${pos.length} Positionen`)] }),
      ],
    }),
  ]
  return await Packer.toBase64String(new Document({ sections: [{ children }] }))
}

// ── PDF ───────────────────────────────────────────────────────────────────────
function buildPdfBase64(pos: BestellPosition[], m: BestellMeta): string {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setFontSize(16); doc.setTextColor(30, 64, 175)
  doc.text(TITLE, 14, 18)
  doc.setFontSize(9); doc.setTextColor(90)
  doc.text(kopfText(m), 14, 25)
  let y = 31
  if (m.anmerkung?.trim()) {
    doc.setTextColor(40)
    const z = doc.splitTextToSize(`Anmerkung: ${m.anmerkung.trim()}`, 182) as string[]
    doc.text(z, 14, y); y += z.length * 4 + 2
  }
  const summe = pos.reduce((a, p) => a + p.menge, 0)
  autoTable(doc, {
    startY: y,
    head: [['Pos.', 'Artikel', 'Anzahl', 'Bestelllink']],
    body: [...pos.map((p, i) => [String(i + 1), p.name, String(p.menge), kurzLink(p.link) || '—']), ['', 'Summe', String(summe), `${pos.length} Position${pos.length === 1 ? '' : 'en'}`]],
    styles: { fontSize: 9, cellPadding: 2.2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 64, 175], textColor: 255 },
    alternateRowStyles: { fillColor: [240, 244, 255] },
    columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 82 }, 2: { cellWidth: 18, halign: 'center' }, 3: { cellWidth: 'auto', textColor: [29, 78, 216] } },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => { if (data.section === 'body' && data.row.index === pos.length) { data.cell.styles.fontStyle = 'bold'; data.cell.styles.textColor = 20 } },
    didDrawCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 3) return
      const h = linkHref(pos[data.row.index]?.link || '')
      if (h) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: h })
    },
  })
  return arrayBufferToBase64(doc.output('arraybuffer'))
}

export type AccessoryExportFormat = 'pdf' | 'word' | 'excel'
const EXT_OF: Record<AccessoryExportFormat, string> = { pdf: 'pdf', word: 'docx', excel: 'xlsx' }

async function buildBase64(positionen: BestellPosition[], format: AccessoryExportFormat, m: BestellMeta): Promise<string> {
  const pos = sortiertePositionen(positionen)
  if (format === 'pdf') return buildPdfBase64(pos, m)
  if (format === 'word') return buildWordBase64(pos, m)
  return buildExcelBase64(pos, m)
}

/** Mit „Speichern unter"-Dialog speichern und öffnen. */
export async function exportOrderList(positionen: BestellPosition[], format: AccessoryExportFormat, m: BestellMeta): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const filterMap: Record<AccessoryExportFormat, { name: string; extensions: string[] }> = {
    pdf: { name: 'PDF', extensions: ['pdf'] }, word: { name: 'Word', extensions: ['docx'] }, excel: { name: 'Excel', extensions: ['xlsx'] },
  }
  const savePath = await api().saveFileDialog(bestellDatei(EXT_OF[format], m.datum), [filterMap[format]])
  if (!savePath) return { ok: true, cancelled: true }
  try {
    await writeAndCheck(savePath, await buildBase64(positionen, format, m))
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** PDF für den Mail-Anhang ohne Dialog in `dir` schreiben (Exportordner aus den Einstellungen). */
export async function bestellPdfAnhang(positionen: BestellPosition[], dir: string, m: BestellMeta): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!dir) return { ok: false, error: 'Kein Exportordner eingestellt (Einstellungen → Exportpfad).' }
  const path = `${dir.replace(/[\\/]+$/, '')}\\${bestellDatei('pdf', m.datum)}`
  try {
    await writeAndCheck(path, await buildBase64(positionen, 'pdf', m))
    return { ok: true, path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
