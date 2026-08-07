// ── Infrastruktur Projekte – Export ───────────────────────────────────────────
// Exportiert EIN Projekt mit komplettem Stand (Status, Beschreibung, alle
// Einträge inkl. Datum/Bearbeiter/Anhänge) als Word, PDF oder Excel.
// Bilder-Anhänge werden in PDF/Word eingebettet; andere Dateien als Name gelistet.

import ExcelJS from 'exceljs'
import { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun, BorderStyle } from 'docx'
import { jsPDF } from 'jspdf'
import { api } from '../electronAPI'
import type { InfraProject, Attachment } from './infraProjects'
import { STATUS_LABEL, readAttachmentBase64, isImageAttachment, formatBytes } from './infraProjects'

// ── kleine Helfer ──────────────────────────────────────────────────────────────
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 8192
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64
  const bin = atob(clean)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

async function writeAndCheck(savePath: string, base64: string): Promise<void> {
  const res = await api().writeFile(savePath, base64)
  if (!res.success) throw new Error(res.error ?? 'Datei konnte nicht gespeichert werden')
}

function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth || 0, h: img.naturalHeight || 0 })
    img.onerror = () => resolve({ w: 0, h: 0 })
    img.src = dataUrl
  })
}

function imgFormatFor(att: Attachment): 'PNG' | 'JPEG' {
  const ext = (att.filename.split('.').pop() || '').toLowerCase()
  return ext === 'jpg' || ext === 'jpeg' ? 'JPEG' : 'PNG'
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

export function suggestFilename(project: InfraProject, ext: string): string {
  return `${sanitize(project.title || 'Projekt')} - Stand ${new Date().toISOString().slice(0, 10)}.${ext}`
}

// ── PDF ─────────────────────────────────────────────────────────────────────────
export async function exportProjectPdf(project: InfraProject, savePath: string): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 18
  const contentW = pageW - 2 * marginX
  let y = 20

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 16) { doc.addPage(); y = 20 }
  }

  // Kopf
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(15, 23, 42)
  doc.text('Infrastruktur-Projekt', marginX, y); y += 9
  doc.setFontSize(14); doc.setTextColor(30, 64, 175)
  doc.splitTextToSize(project.title || 'Unbenannt', contentW).forEach((l: string) => { doc.text(l, marginX, y); y += 7 })
  y += 1

  // Meta
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(80, 80, 80)
  doc.text(`Status: ${STATUS_LABEL[project.status]}`, marginX, y); y += 5
  doc.text(`Erstellt: ${fmtDateTime(project.createdAt)} von ${project.createdBy || '—'}`, marginX, y); y += 5
  doc.text(`Letzte Aktualisierung: ${fmtDateTime(project.updatedAt || project.createdAt)}`, marginX, y); y += 5
  doc.text(`Anzahl Einträge: ${project.entries.length}`, marginX, y); y += 7

  if (project.description && project.description.trim()) {
    doc.setTextColor(40, 40, 40); doc.setFont('helvetica', 'italic')
    doc.splitTextToSize(project.description.trim(), contentW).forEach((l: string) => { ensureSpace(6); doc.text(l, marginX, y); y += 5 })
    doc.setFont('helvetica', 'normal'); y += 2
  }

  // Trennlinie
  doc.setDrawColor(200); doc.setLineWidth(0.3); doc.line(marginX, y, pageW - marginX, y); y += 7

  // Einträge (chronologisch)
  const entries = [...project.entries].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(15, 23, 42)
  doc.text('Verlauf / Einträge', marginX, y); y += 7

  if (entries.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(120)
    doc.text('Noch keine Einträge.', marginX, y); y += 6
  }

  for (const entry of entries) {
    ensureSpace(20)
    // Eintrag-Kopfzeile
    doc.setFillColor(241, 245, 249)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(15, 23, 42)
    const titleLines = doc.splitTextToSize(entry.title || '(ohne Titel)', contentW - 4)
    const headerH = 6 + titleLines.length * 5
    doc.rect(marginX, y, contentW, headerH, 'F')
    let ty = y + 5
    titleLines.forEach((l: string) => { doc.text(l, marginX + 2, ty); ty += 5 })
    y += headerH + 1
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(100)
    doc.text(`${fmtDateTime(entry.createdAt)}   ·   Bearbeiter: ${entry.author || '—'}`, marginX + 2, y + 3)
    y += 7

    // Inhalt
    if (entry.body && entry.body.trim()) {
      doc.setFontSize(10); doc.setTextColor(30, 30, 30)
      doc.splitTextToSize(entry.body.trim(), contentW).forEach((l: string) => { ensureSpace(6); doc.text(l, marginX, y); y += 5 })
      y += 1
    }

    // Anhänge
    if (entry.attachments.length > 0) {
      doc.setFontSize(8.5); doc.setTextColor(80, 80, 120); doc.setFont('helvetica', 'italic')
      ensureSpace(5)
      doc.text(`Anhänge (${entry.attachments.length}):`, marginX, y); y += 4
      doc.setFont('helvetica', 'normal')
      for (const att of entry.attachments) {
        ensureSpace(5)
        doc.text(`• ${att.filename}  (${formatBytes(att.size)})`, marginX + 3, y); y += 4
        // Bild einbetten
        if (isImageAttachment(att)) {
          try {
            const b64 = await readAttachmentBase64(att)
            if (b64) {
              const dataUrl = `data:${att.mime || 'image/png'};base64,${b64}`
              const { w, h } = await imageSize(dataUrl)
              if (w && h) {
                const maxW = Math.min(contentW, 90)
                const dispW = Math.min(maxW, w * 0.2645) // px→mm grob
                const dispH = (h / w) * dispW
                ensureSpace(dispH + 3)
                doc.addImage(dataUrl, imgFormatFor(att), marginX + 3, y, dispW, Math.min(dispH, 80), undefined, 'FAST')
                y += Math.min(dispH, 80) + 3
              }
            }
          } catch { /* Bild überspringen */ }
        }
      }
      y += 1
    }
    y += 3
  }

  // Fußzeile auf jeder Seite
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(8); doc.setTextColor(150)
    doc.text(`Infrastruktur-Projekt · ${project.title} · exportiert ${fmtDateTime(new Date().toISOString())}`, marginX, pageH - 8)
    doc.text(`Seite ${i}/${pages}`, pageW - marginX, pageH - 8, { align: 'right' })
  }

  await writeAndCheck(savePath, arrayBufferToBase64(doc.output('arraybuffer')))
}

// ── Word ─────────────────────────────────────────────────────────────────────────
export async function exportProjectWord(project: InfraProject, savePath: string): Promise<void> {
  const children: Paragraph[] = []

  children.push(new Paragraph({ text: 'Infrastruktur-Projekt', heading: HeadingLevel.TITLE }))
  children.push(new Paragraph({ children: [new TextRun({ text: project.title || 'Unbenannt', bold: true, size: 32, color: '1E40AF' })] }))
  children.push(new Paragraph({ children: [new TextRun({ text: `Status: ${STATUS_LABEL[project.status]}`, bold: true })] }))
  children.push(new Paragraph({ children: [new TextRun({ text: `Erstellt: ${fmtDateTime(project.createdAt)} von ${project.createdBy || '—'}`, italics: true, color: '666666' })] }))
  children.push(new Paragraph({ children: [new TextRun({ text: `Letzte Aktualisierung: ${fmtDateTime(project.updatedAt || project.createdAt)}`, italics: true, color: '666666' })] }))
  if (project.description && project.description.trim()) {
    children.push(new Paragraph({ text: '' }))
    children.push(new Paragraph({ children: [new TextRun({ text: project.description.trim() })] }))
  }
  children.push(new Paragraph({ text: '', border: { bottom: { color: 'CCCCCC', size: 6, style: BorderStyle.SINGLE, space: 1 } } }))
  children.push(new Paragraph({ text: 'Verlauf / Einträge', heading: HeadingLevel.HEADING_1 }))

  const entries = [...project.entries].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  if (entries.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: 'Noch keine Einträge.', italics: true, color: '888888' })] }))
  }

  for (const entry of entries) {
    children.push(new Paragraph({ text: entry.title || '(ohne Titel)', heading: HeadingLevel.HEADING_2 }))
    children.push(new Paragraph({ children: [new TextRun({ text: `${fmtDateTime(entry.createdAt)}  ·  Bearbeiter: ${entry.author || '—'}`, italics: true, size: 18, color: '777777' })] }))
    if (entry.body && entry.body.trim()) {
      for (const line of entry.body.trim().split('\n')) {
        children.push(new Paragraph({ children: [new TextRun({ text: line })] }))
      }
    }
    if (entry.attachments.length > 0) {
      children.push(new Paragraph({ children: [new TextRun({ text: `Anhänge (${entry.attachments.length}):`, bold: true, size: 18 })] }))
      for (const att of entry.attachments) {
        children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: `${att.filename} (${formatBytes(att.size)})` })] }))
        if (isImageAttachment(att)) {
          try {
            const b64 = await readAttachmentBase64(att)
            if (b64) {
              const dataUrl = `data:${att.mime || 'image/png'};base64,${b64}`
              const { w, h } = await imageSize(dataUrl)
              if (w && h) {
                const dispW = Math.min(480, w)
                const dispH = (h / w) * dispW
                children.push(new Paragraph({
                  children: [new ImageRun({ data: base64ToUint8(b64), transformation: { width: dispW, height: Math.round(dispH) } } as ConstructorParameters<typeof ImageRun>[0])],
                }))
              }
            }
          } catch { /* Bild überspringen */ }
        }
      }
    }
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({ sections: [{ children }] })
  await writeAndCheck(savePath, await Packer.toBase64String(doc))
}

// ── Excel ─────────────────────────────────────────────────────────────────────────
export async function exportProjectExcel(project: InfraProject, savePath: string): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'IT Admin Tool'
  wb.created = new Date()
  const ws = wb.addWorksheet('Projekt')

  const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

  // Meta-Block
  const meta: [string, string][] = [
    ['Projekt', project.title || 'Unbenannt'],
    ['Status', STATUS_LABEL[project.status]],
    ['Beschreibung', project.description || '—'],
    ['Erstellt', `${fmtDateTime(project.createdAt)} von ${project.createdBy || '—'}`],
    ['Letzte Aktualisierung', fmtDateTime(project.updatedAt || project.createdAt)],
    ['Anzahl Einträge', String(project.entries.length)],
  ]
  for (const [k, v] of meta) {
    const row = ws.addRow([k, v])
    row.getCell(1).font = { bold: true }
  }
  ws.addRow([])

  // Einträge-Tabelle
  const headerRow = ws.addRow(['Datum / Uhrzeit', 'Bearbeiter', 'Titel', 'Inhalt', 'Anhänge'])
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = HEADER_FILL
    cell.alignment = { vertical: 'middle' }
  })

  const entries = [...project.entries].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  for (const entry of entries) {
    const attNames = entry.attachments.map(a => a.filename).join('\n')
    const row = ws.addRow([fmtDateTime(entry.createdAt), entry.author || '—', entry.title || '(ohne Titel)', entry.body || '', attNames])
    row.eachCell(cell => { cell.alignment = { vertical: 'top', wrapText: true } })
  }

  ws.columns = [
    { width: 20 }, { width: 22 }, { width: 30 }, { width: 60 }, { width: 30 },
  ]

  const ab = await wb.xlsx.writeBuffer() as ArrayBuffer
  await writeAndCheck(savePath, arrayBufferToBase64(ab))
}

// ── Dispatcher ────────────────────────────────────────────────────────────────────
export type ExportFormat = 'pdf' | 'word' | 'excel'

export async function exportProject(project: InfraProject, format: ExportFormat): Promise<{ ok: boolean; error?: string; cancelled?: boolean }> {
  const extMap: Record<ExportFormat, string> = { pdf: 'pdf', word: 'docx', excel: 'xlsx' }
  const filterMap: Record<ExportFormat, { name: string; extensions: string[] }> = {
    pdf: { name: 'PDF', extensions: ['pdf'] },
    word: { name: 'Word', extensions: ['docx'] },
    excel: { name: 'Excel', extensions: ['xlsx'] },
  }
  const savePath = await api().saveFileDialog(suggestFilename(project, extMap[format]), [filterMap[format]])
  if (!savePath) return { ok: true, cancelled: true }
  try {
    if (format === 'pdf') await exportProjectPdf(project, savePath)
    else if (format === 'word') await exportProjectWord(project, savePath)
    else await exportProjectExcel(project, savePath)
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Export fehlgeschlagen.' }
  }
}
