// ── PDF-Werkzeuge: Office-Export (Word / Excel / PowerPoint) ─────────────────
// Clientseitige Basis-Variante: extrahiert den Textinhalt und erzeugt echte
// .docx/.xlsx/.pptx-Dateien. Layout-Treue (Spalten, Bilder exakt) ist hiermit
// nicht garantiert — dafuer ist spaeter ein Konvertierungs-Dienst vorgesehen
// (siehe README, Integrationsstelle).
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'
import ExcelJS from 'exceljs'
import PptxGenJS from 'pptxgenjs'
import { loadPdf, getPageText } from './render'
import { saveBytes, base64ToBytes, stripExt } from './io'

export type OfficeFormat = 'word' | 'excel' | 'ppt'

async function getPageTexts(data: Uint8Array): Promise<string[]> {
  const doc = await loadPdf(data)
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) pages.push(await getPageText(doc, i))
  return pages
}

function ab2bytes(ab: ArrayBuffer): Uint8Array { return new Uint8Array(ab) }

async function buildWord(pages: string[]): Promise<Uint8Array> {
  const children: Paragraph[] = []
  pages.forEach((text, i) => {
    children.push(new Paragraph({ text: `Seite ${i + 1}`, heading: HeadingLevel.HEADING_2 }))
    const lines = text.split(/\n|(?<=\.)\s{2,}/).map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) children.push(new Paragraph({ children: [new TextRun({ text: '(kein Text erkannt)', italics: true, color: '888888' })] }))
    for (const line of lines) children.push(new Paragraph({ children: [new TextRun({ text: line })] }))
  })
  const doc = new Document({ sections: [{ children }] })
  return base64ToBytes(await Packer.toBase64String(doc))
}

async function buildExcel(pages: string[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()
  const ws = wb.addWorksheet('Text')
  const head = ws.addRow(['Seite', 'Inhalt'])
  head.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } } })
  pages.forEach((text, i) => {
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean)
    if (lines.length === 0) { ws.addRow([i + 1, '']); return }
    lines.forEach(line => ws.addRow([i + 1, line]))
  })
  ws.columns = [{ width: 8 }, { width: 100 }]
  ws.getColumn(2).alignment = { wrapText: true }
  return ab2bytes(await wb.xlsx.writeBuffer() as ArrayBuffer)
}

async function buildPpt(pages: string[]): Promise<Uint8Array> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'A4', width: 11.69, height: 8.27 })
  pptx.layout = 'A4'
  pages.forEach((text, i) => {
    const slide = pptx.addSlide()
    slide.addText(`Seite ${i + 1}`, { x: 0.4, y: 0.25, w: 10.8, h: 0.5, fontSize: 18, bold: true, color: '1E40AF' })
    const body = text.trim() || '(kein Text erkannt)'
    slide.addText(body, { x: 0.4, y: 0.9, w: 10.8, h: 7, fontSize: 12, color: '222222', valign: 'top', wrap: true })
  })
  const ab = await pptx.write({ outputType: 'arraybuffer' }) as ArrayBuffer
  return ab2bytes(ab)
}

export async function exportOffice(data: Uint8Array, fileName: string, format: OfficeFormat): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  try {
    const pages = await getPageTexts(data)
    const base = stripExt(fileName)
    if (format === 'word') return saveBytes(await buildWord(pages), `${base}.docx`, [{ name: 'Word', extensions: ['docx'] }])
    if (format === 'excel') return saveBytes(await buildExcel(pages), `${base}.xlsx`, [{ name: 'Excel', extensions: ['xlsx'] }])
    return saveBytes(await buildPpt(pages), `${base}.pptx`, [{ name: 'PowerPoint', extensions: ['pptx'] }])
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
