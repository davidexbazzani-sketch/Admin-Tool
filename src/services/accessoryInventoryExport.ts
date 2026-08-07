// ── Zubehoer-Inventur – Bestellliste-Export ───────────────────────────────────
// Exportiert die Bestellliste (zu bestellende Kleinteile) als Excel, Word oder
// PDF. Spiegelt das Muster von hardwareInventoryExport.ts.

import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, BorderStyle, WidthType, ExternalHyperlink } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { api } from '../electronAPI'
import type { OrderLine } from './accessoryInventory'

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

function fmtNow(): string {
  return new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sanitize(s: string): string { return s.replace(/[\\/:*?"<>|]/g, '_') }
function suggestName(ext: string): string {
  return sanitize(`Bestellliste Zubehoer ${new Date().toISOString().slice(0, 10)}.${ext}`)
}

const TITLE = 'Bestellliste – Zubehör-Inventur'

function bytesFromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

// ── Excel ───────────────────────────────────────────────────────────────────────
async function buildExcelBase64(lines: OrderLine[]): Promise<string> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'; wb.created = new Date()
  const head: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

  const ws = wb.addWorksheet('Bestellliste')
  ws.addRow([TITLE]).getCell(1).font = { bold: true, size: 14 }
  ws.addRow([`Erstellt: ${fmtNow()}`]).getCell(1).font = { italic: true, color: { argb: 'FF666666' } }
  ws.addRow([])

  const headers = ['Kleinteil', 'Zu bestellen', 'Amazon-Link']
  const hr = ws.addRow(headers)
  hr.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = head })
  for (const { item, quantity } of lines) {
    const row = ws.addRow([item.name, quantity, item.amazonLink || '—'])
    const linkCell = row.getCell(3)
    if (item.amazonLink.trim()) {
      linkCell.value = { text: item.amazonLink, hyperlink: item.amazonLink } as ExcelJS.CellHyperlinkValue
      linkCell.font = { color: { argb: 'FF1D4ED8' }, underline: true }
    }
    row.getCell(2).alignment = { horizontal: 'center' }
  }
  ws.columns = [{ width: 38 }, { width: 14 }, { width: 70 }]

  const ab = await wb.xlsx.writeBuffer() as ArrayBuffer
  return arrayBufferToBase64(ab)
}

// ── Word ──────────────────────────────────────────────────────────────────────
async function buildWordBase64(lines: OrderLine[]): Promise<string> {
  const BORDER = { style: BorderStyle.SINGLE, size: 1 }
  const ALL = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER, insideH: BORDER, insideV: BORDER }

  const headerCells = (labels: string[]) => labels.map(t => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 18 })] })] }))
  const cell = (s: string) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: s, size: 18 })] })] })
  const linkCell = (url: string) => new TableCell({
    children: [new Paragraph({
      children: url.trim()
        ? [new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, color: '1D4ED8', underline: {}, size: 16 })] })]
        : [new TextRun({ text: '—', size: 18 })],
    })],
  })

  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: TITLE, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Erstellt: ${fmtNow()}`, italics: true, color: '666666' })] }),
    new Paragraph({ text: '' }),
  ]

  if (lines.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Alle Kleinteile sind ausreichend vorhanden – nichts zu bestellen.', color: '047857' })] }))
  } else {
    const rows = [
      new TableRow({ children: headerCells(['Kleinteil', 'Zu bestellen', 'Amazon-Link']), tableHeader: true }),
      ...lines.map(({ item, quantity }) => new TableRow({ children: [cell(item.name), cell(String(quantity)), linkCell(item.amazonLink)] })),
    ]
    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: ALL }))
  }

  const doc = new Document({ sections: [{ children }] })
  return await Packer.toBase64String(doc)
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function buildPdfBase64(lines: OrderLine[]): Promise<string> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setFontSize(16); doc.setTextColor(30, 64, 175)
  doc.text(TITLE, 14, 18)
  doc.setFontSize(9); doc.setTextColor(90)
  doc.text(`Erstellt: ${fmtNow()}`, 14, 25)

  if (lines.length === 0) {
    doc.setFontSize(11); doc.setTextColor(4, 120, 87)
    doc.text('Alle Kleinteile sind ausreichend vorhanden – nichts zu bestellen.', 14, 36)
  } else {
    autoTable(doc, {
      startY: 32,
      head: [['Kleinteil', 'Zu bestellen', 'Amazon-Link']],
      body: lines.map(({ item, quantity }) => [item.name, String(quantity), item.amazonLink || '—']),
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [30, 64, 175], textColor: 255 },
      alternateRowStyles: { fillColor: [240, 244, 255] },
      columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 26, halign: 'center' }, 2: { cellWidth: 'auto', textColor: [29, 78, 216] } },
      margin: { left: 14, right: 14 },
      // Amazon-Links klickbar machen
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 2) {
          const line = lines[data.row.index]
          const url = line?.item.amazonLink?.trim()
          if (url) {
            doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url })
          }
        }
      },
    })
  }

  return arrayBufferToBase64(doc.output('arraybuffer'))
}

export type AccessoryExportFormat = 'pdf' | 'word' | 'excel'

const EXT_OF: Record<AccessoryExportFormat, string> = { pdf: 'pdf', word: 'docx', excel: 'xlsx' }

async function buildBase64(lines: OrderLine[], format: AccessoryExportFormat): Promise<string> {
  if (format === 'pdf') return buildPdfBase64(lines)
  if (format === 'word') return buildWordBase64(lines)
  return buildExcelBase64(lines)
}

export async function exportOrderList(lines: OrderLine[], format: AccessoryExportFormat): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const filterMap: Record<AccessoryExportFormat, { name: string; extensions: string[] }> = {
    pdf: { name: 'PDF', extensions: ['pdf'] },
    word: { name: 'Word', extensions: ['docx'] },
    excel: { name: 'Excel', extensions: ['xlsx'] },
  }
  const savePath = await api().saveFileDialog(suggestName(EXT_OF[format]), [filterMap[format]])
  if (!savePath) return { ok: true, cancelled: true }
  try {
    await writeAndCheck(savePath, await buildBase64(lines, format))
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── E-Mail-Anhang vorbereiten ─────────────────────────────────────────────────
// Erstellt die gewaehlten Formate im Hintergrund (ohne Dialog) und schreibt sie
// in den uebergebenen Ordner. Bei einem Format -> direkte Datei; bei mehreren ->
// ein komprimiertes ZIP-Archiv (eigener Writer, keine Zusatz-Bibliothek). Gibt
// den Pfad zurueck, der als echter Dateianhang an die Mail uebergeben wird.
export async function prepareOrderAttachment(
  lines: OrderLine[],
  formats: AccessoryExportFormat[],
  dir: string,
): Promise<{ ok: boolean; path?: string; error?: string }> {
  if (!dir) return { ok: false, error: 'Kein Zielordner fuer den Anhang verfuegbar.' }
  if (formats.length === 0) return { ok: false, error: 'Kein Anhang-Format ausgewaehlt.' }
  const date = new Date().toISOString().slice(0, 10)
  const sep = dir.includes('\\') || !dir.includes('/') ? '\\' : '/'
  const base = dir.replace(/[\\/]+$/, '') + sep
  try {
    const built = await Promise.all(formats.map(async f => ({ ext: EXT_OF[f], base64: await buildBase64(lines, f) })))

    if (built.length === 1) {
      const path = base + sanitize(`Bestellliste Zubehoer ${date}.${built[0].ext}`)
      await writeAndCheck(path, built[0].base64)
      return { ok: true, path }
    }

    const files = built.map(b => ({ name: sanitize(`Bestellliste Zubehoer ${date}.${b.ext}`), bytes: bytesFromBase64(b.base64) }))
    const zipB64 = buildStoredZipBase64(files)
    const path = base + sanitize(`Bestellliste Zubehoer ${date}.zip`)
    await writeAndCheck(path, zipB64)
    return { ok: true, path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Minimaler ZIP-Writer (Methode "stored", keine Komprimierung noetig) ────────
function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1))
  }
  return (~c) >>> 0
}

function buildStoredZipBase64(files: { name: string; bytes: Uint8Array }[]): string {
  const enc = new TextEncoder()
  const now = new Date()
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((Math.floor(now.getSeconds() / 2)) & 0x1f)
  const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f)

  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const crc = crc32(f.bytes)
    const size = f.bytes.length

    const lh = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(lh.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, 0, true)
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true)
    lh.set(nameBytes, 30)
    localChunks.push(lh, f.bytes)

    const cd = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true); cv.setUint32(20, size, true); cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true)
    cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, offset, true)
    cd.set(nameBytes, 46)
    centralChunks.push(cd)

    offset += lh.length + size
  }

  const cdStart = offset
  const cdSize = centralChunks.reduce((s, c) => s + c.length, 0)

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(4, 0, true); ev.setUint16(6, 0, true)
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true)
  ev.setUint32(12, cdSize, true); ev.setUint32(16, cdStart, true); ev.setUint16(20, 0, true)

  const all = [...localChunks, ...centralChunks, eocd]
  const total = all.reduce((s, a) => s + a.length, 0)
  const out = new Uint8Array(total)
  let p = 0
  for (const a of all) { out.set(a, p); p += a.length }
  return arrayBufferToBase64(out.buffer as ArrayBuffer)
}
