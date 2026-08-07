// ── Checklist PDF generator ───────────────────────────────────────────────────
// Renders a checklist as a one-page A4 PDF in the SKF house style. The
// layout is modelled on the existing handover document (TASK#### - Name.pdf).

import jsPDF from 'jspdf'
import type { Checklist } from './checklists'
import { ensureSkfLogo } from './skfLogo'
import { api } from '../electronAPI'

const DISCLAIMER =
  'Mit meiner Unterschrift bestätige ich, das oben aufgeführte Gerät nebst Zubehör in einwandfreiem Zustand erhalten zu haben. ' +
  'Ich bin ab diesem Zeitpunkt für den sachgemäßen Umgang, die Sicherheit und den Verbleib des Rechners sowie aller Unternehmensdaten darauf verantwortlich.'

function formatGermanDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  return `${dd}.${mm}.${yy}`
}

export interface BuildPdfOptions {
  /** Filename suggestion (without .pdf). If not given, derived from task + name. */
  filename?: string
}

export async function buildChecklistPdf(c: Checklist, opts: BuildPdfOptions = {}): Promise<{ doc: jsPDF; filename: string }> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  const pageW = doc.internal.pageSize.getWidth()
  const marginX = 20
  let y = 22

  // ── SKF Marine logo ─────────────────────────────────────────────────────
  // Prefers the user-supplied file public/skf-marine-logo.png, otherwise
  // falls back to a canvas-rendered logo.
  try {
    const { url: logoDataUrl, aspect } = await ensureSkfLogo()
    if (logoDataUrl) {
      const logoH = 18           // mm
      const logoW = logoH * aspect
      doc.addImage(logoDataUrl, 'PNG', pageW - marginX - logoW, 10, logoW, logoH, undefined, 'FAST')
    }
  } catch { /* fallback to title block only */ }

  // ── Title ─────────────────────────────────────────────────────────────────
  doc.setTextColor(0, 0, 0)
  y = 34
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Geräteübergabe-Dokument', marginX, y)
  y += 12

  // ── Meta fields ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  const line = (label: string, value: string) => {
    doc.text(`${label}: ${value}`, marginX, y)
    y += 7
  }
  line('Auftragsnummer', c.taskNumber || '—')
  line('Typ', c.deviceType === 'new' ? 'Neu-Gerät' : 'Refresh (Geräte-Tausch)')
  line('Name', c.name || '—')
  line('Corp-ID', c.corpId || '—')
  line('Techniker', c.technician || '—')

  y += 5

  // ── Devices ──────────────────────────────────────────────────────────────
  if (c.deviceType === 'refresh') {
    doc.setFont('helvetica', 'bold')
    doc.text('Hardware alt:', marginX, y)
    doc.setFont('helvetica', 'normal')
    doc.text(c.oldDeviceId || '—', marginX + 35, y)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
    doc.text('(Seriennummer oder Hostname)', marginX + 35 + doc.getTextWidth(c.oldDeviceId || '—') + 4, y)
    doc.setFontSize(11)
    doc.setTextColor(0, 0, 0)
    y += 8
  }

  doc.setFont('helvetica', 'bold')
  doc.text('Hardware neu:', marginX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(c.newDeviceSerial || '—', marginX + 35, y)
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text('(Seriennummer)', marginX + 35 + doc.getTextWidth(c.newDeviceSerial || '—') + 4, y)
  doc.setFontSize(11)
  doc.setTextColor(0, 0, 0)
  y += 12

  // ── Comment block (optional) ─────────────────────────────────────────────
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(11)
  doc.text('Kommentare:', marginX, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  if (c.comment && c.comment.trim()) {
    const lines = doc.splitTextToSize(c.comment.trim(), pageW - 2 * marginX)
    doc.text(lines, marginX, y)
    y += lines.length * 5
  } else {
    y += 12
  }

  y += 6
  // Separator line
  doc.setDrawColor(60, 60, 60)
  doc.setLineWidth(0.4)
  doc.line(marginX, y, pageW - marginX, y)
  y += 8

  // ── Disclaimer ───────────────────────────────────────────────────────────
  doc.setFontSize(10)
  const discLines = doc.splitTextToSize(DISCLAIMER, pageW - 2 * marginX)
  doc.text(discLines, marginX, y)
  y += discLines.length * 5 + 14

  // ── Signature row ────────────────────────────────────────────────────────
  // Two columns: Datum | Unterschrift
  const colX = marginX
  const col2X = marginX + (pageW - 2 * marginX) / 2
  const signedDate = formatGermanDate(c.signatureDate)
  doc.setFontSize(11)
  doc.text('Datum:', colX, y)
  doc.text('Unterschrift:', col2X, y)

  // Underline / value lines
  const dateLineY = y + 2
  doc.setLineWidth(0.3)
  doc.line(colX + 16, dateLineY, colX + 70, dateLineY)
  doc.line(col2X + 30, dateLineY, col2X + 80, dateLineY)

  if (signedDate) {
    doc.setFont('helvetica', 'normal')
    doc.text(signedDate, colX + 18, dateLineY - 1)
  }

  // Insert signature image (if present)
  if (c.signatureDataUrl) {
    try {
      // signature image area: approx 50mm wide, 18mm tall above the line
      const sigW = 50
      const sigH = 18
      const sigX = col2X + 30
      const sigY = dateLineY - sigH - 0.5
      doc.addImage(c.signatureDataUrl, 'PNG', sigX, sigY, sigW, sigH, undefined, 'NONE')
    } catch { /* ignore */ }
  }

  // ── Footer with id + creation timestamp (small grey) ─────────────────────
  doc.setFontSize(8)
  doc.setTextColor(150, 150, 150)
  doc.text(
    `Checklisten-ID: ${c.id} · erstellt: ${formatGermanDate(c.createdAt)} von ${c.createdBy}`,
    marginX, doc.internal.pageSize.getHeight() - 10,
  )

  const filename = (opts.filename ?? `${c.taskNumber || 'Checkliste'} - ${c.name || 'Unbenannt'}`)
    .replace(/[\\/:*?"<>|]/g, '_')
    + '.pdf'

  return { doc, filename }
}

// Trigger a browser-side download (Save-As dialog)
export async function downloadChecklistPdf(c: Checklist): Promise<void> {
  const { doc, filename } = await buildChecklistPdf(c)
  doc.save(filename)
}

// ── Direktdruck (ohne Dialog) ─────────────────────────────────────────────────
// Baut die Checkliste als A4-HTML (gleiches Layout wie die PDF) und schickt sie
// per Silent-Print an den Windows-Standarddrucker. Keine Rueckfrage, kein
// Druckdialog — Klick auf "Drucken" gibt das Dokument direkt aus.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function buildChecklistPrintHtml(c: Checklist): Promise<string> {
  let logoImg = ''
  try {
    const { url, aspect } = await ensureSkfLogo()
    if (url) logoImg = `<img src="${url}" style="height:18mm;width:${(18 * aspect).toFixed(1)}mm" alt="" />`
  } catch { /* ohne Logo drucken */ }

  const signedDate = formatGermanDate(c.signatureDate)
  const sigImg = c.signatureDataUrl
    ? `<img src="${c.signatureDataUrl}" style="width:50mm;height:18mm;object-fit:contain;display:block" alt="" />`
    : `<div style="height:18mm"></div>`

  const commentHtml = c.comment && c.comment.trim()
    ? esc(c.comment.trim()).replace(/\n/g, '<br/>')
    : ''

  const oldDeviceRow = c.deviceType === 'refresh'
    ? `<div class="row"><span class="lbl">Hardware alt:</span><span class="val">${esc(c.oldDeviceId || '—')}</span><span class="hint">(Seriennummer oder Hostname)</span></div>`
    : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; color: #000; font-size: 11pt; }
    .page { position: relative; width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 10mm 20mm 20mm 20mm; }
    .logo { position: absolute; top: 10mm; right: 20mm; }
    h1 { font-size: 18pt; margin: 24mm 0 12mm 0; font-weight: bold; }
    .meta div { margin-bottom: 2.5mm; }
    .row { margin-bottom: 3mm; }
    .lbl { font-weight: bold; display: inline-block; min-width: 35mm; }
    .hint { font-style: italic; font-size: 9pt; color: #787878; margin-left: 4mm; }
    .comments { margin-top: 8mm; }
    .comments .title { font-style: italic; margin-bottom: 3mm; }
    .comments .body { min-height: 12mm; white-space: pre-wrap; }
    hr { border: none; border-top: 0.4mm solid #3c3c3c; margin: 6mm 0 8mm 0; }
    .disclaimer { font-size: 10pt; line-height: 1.45; }
    .sigrow { display: flex; margin-top: 16mm; }
    .sigcol { width: 50%; }
    .sigline { border-bottom: 0.3mm solid #000; display: inline-block; }
    .footer { position: absolute; bottom: 10mm; left: 20mm; font-size: 8pt; color: #969696; }
  </style></head><body><div class="page">
    <div class="logo">${logoImg}</div>
    <h1>Geräteübergabe-Dokument</h1>
    <div class="meta">
      <div>Auftragsnummer: ${esc(c.taskNumber || '—')}</div>
      <div>Typ: ${c.deviceType === 'new' ? 'Neu-Gerät' : 'Refresh (Geräte-Tausch)'}</div>
      <div>Name: ${esc(c.name || '—')}</div>
      <div>Corp-ID: ${esc(c.corpId || '—')}</div>
      <div>Techniker: ${esc(c.technician || '—')}</div>
    </div>
    <div style="height:5mm"></div>
    ${oldDeviceRow}
    <div class="row"><span class="lbl">Hardware neu:</span><span class="val">${esc(c.newDeviceSerial || '—')}</span><span class="hint">(Seriennummer)</span></div>
    <div class="comments">
      <div class="title">Kommentare:</div>
      <div class="body">${commentHtml}</div>
    </div>
    <hr/>
    <div class="disclaimer">${esc(DISCLAIMER)}</div>
    <div class="sigrow">
      <div class="sigcol">
        <div style="height:18mm"></div>
        Datum: <span class="sigline" style="width:54mm;text-align:center">${esc(signedDate)}&nbsp;</span>
      </div>
      <div class="sigcol">
        ${sigImg}
        Unterschrift: <span class="sigline" style="width:50mm">&nbsp;</span>
      </div>
    </div>
    <div class="footer">Checklisten-ID: ${esc(c.id)} · erstellt: ${esc(formatGermanDate(c.createdAt))} von ${esc(c.createdBy)}</div>
  </div></body></html>`
}

/** Druckt die Checkliste direkt auf dem Standarddrucker (ohne Dialog). */
export async function printChecklist(c: Checklist): Promise<{ success: boolean; error?: string }> {
  const html = await buildChecklistPrintHtml(c)
  try {
    return await api().printHtml(html)
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
}
