// ── Access Points – PDF-Export ────────────────────────────────────────────────
// Erzeugt EIN großes Multi-Page-PDF mit:
//   1. Allen Lageplänen als Original-Vektorseiten (pdf-lib übernimmt sie 1:1
//      → unbegrenzt zoombar ohne Qualitätsverlust)
//   2. Marker-Overlays (Kreis + nummeriertes Label) direkt auf den Plänen
//   3. Detail-Seiten pro AP mit MAC, Seriennummer, Modell, Notizen, Screenshots
//
// Verwendete Bibliothek: pdf-lib (kein Raster, alles Vektor außer den
// eingebetteten Screenshot-PNGs).

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { api } from '../electronAPI'
import {
  readFloorPlanBytes, readScreenshotBase64,
  type FloorPlan, type Marker,
} from './accessPoints'

function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',')[1] : b64
  const bin = atob(clean)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

function uint8ToBase64(u: Uint8Array): string {
  let bin = ''
  const chunk = 8192
  for (let i = 0; i < u.byteLength; i += chunk) bin += String.fromCharCode(...u.subarray(i, i + chunk))
  return btoa(bin)
}

function fmtDateTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_')
}

const COLOR_MARKER = rgb(0.0, 0.45, 0.95)        // Blau
const COLOR_MARKER_BORDER = rgb(1, 1, 1)         // Weiß
const COLOR_LABEL_BG = rgb(0, 0, 0)
const COLOR_LABEL_FG = rgb(1, 1, 1)
const COLOR_TEXT = rgb(0.05, 0.07, 0.12)
const COLOR_MUTED = rgb(0.4, 0.45, 0.55)
const COLOR_HEAD = rgb(0.12, 0.25, 0.7)

/** Zeichnet ein einzelnes Marker-Overlay (Kreis + Label) auf die Seite. */
function drawMarker(page: PDFPage, font: PDFFont, x: number, y: number, label: string) {
  const r = 5             // Pt – kompakt, beim Zoom super scharf (Vektor)
  // Halo
  page.drawCircle({ x, y, size: r + 1.5, color: COLOR_MARKER_BORDER, opacity: 0.9 })
  // Kern
  page.drawCircle({ x, y, size: r, color: COLOR_MARKER })
  // Label
  if (label) {
    const fontSize = 6
    const padX = 2, padY = 1.4
    const tw = font.widthOfTextAtSize(label, fontSize)
    const th = font.heightAtSize(fontSize)
    const lx = x + r + 3
    const ly = y - th / 2 + 1
    page.drawRectangle({
      x: lx - padX, y: ly - padY,
      width: tw + 2 * padX, height: th + 2 * padY,
      color: COLOR_LABEL_BG, opacity: 0.78,
    })
    page.drawText(label, { x: lx, y: ly, size: fontSize, font, color: COLOR_LABEL_FG })
  }
}

/** Detailseite pro AP: Stammdaten + Screenshots. */
async function drawDetailPage(
  out: PDFDocument, font: PDFFont, fontBold: PDFFont,
  marker: Marker, number: number, plan: FloorPlan | undefined,
) {
  // A4 quer für mehr Platz für Screenshots
  const page = out.addPage([842, 595])
  const W = 842, H = 595
  const M = 36

  // Kopf
  page.drawText(`AP #${number}`, { x: M, y: H - M - 22, size: 22, font: fontBold, color: COLOR_HEAD })
  page.drawText(marker.name || '(ohne Namen)', { x: M + 70, y: H - M - 22, size: 22, font: fontBold, color: COLOR_TEXT })
  if (plan) {
    page.drawText(`auf "${plan.name}"  ·  Seite ${marker.page}`, { x: M, y: H - M - 38, size: 9, font, color: COLOR_MUTED })
  }
  page.drawLine({ start: { x: M, y: H - M - 46 }, end: { x: W - M, y: H - M - 46 }, color: COLOR_MUTED, thickness: 0.5 })

  // Felder linke Spalte
  const fields: { label: string; value: string }[] = [
    { label: 'MAC-Adresse', value: marker.mac },
    { label: 'Seriennummer', value: marker.serial },
    { label: 'IP-Adresse', value: marker.ip },
    { label: 'Modell', value: marker.model },
    { label: 'Notizen', value: marker.notes },
  ]
  for (const [k, v] of Object.entries(marker.extra)) {
    if (v && v.trim()) fields.push({ label: k, value: v })
  }

  let y = H - M - 60
  for (const f of fields) {
    page.drawText(f.label + ':', { x: M, y, size: 9, font: fontBold, color: COLOR_TEXT })
    // Wert in mehrere Zeilen wrappen
    const lines = wrapText(f.value || '—', font, 9, 280)
    let ly = y
    for (const line of lines) {
      page.drawText(line, { x: M + 96, y: ly, size: 9, font, color: COLOR_TEXT })
      ly -= 12
    }
    y = Math.min(y - 16, ly - 4)
    if (y < M + 100) break
  }

  // Screenshots rechte Spalte (max 2 nebeneinander)
  if (marker.screenshots.length > 0) {
    let imgX = 410
    let imgY = H - M - 60
    const maxW = (W - M - imgX) / 2 - 8
    const maxH = 220
    let col = 0
    for (const sc of marker.screenshots.slice(0, 4)) {
      try {
        const b64 = await readScreenshotBase64(sc)
        if (!b64) continue
        const bytes = base64ToUint8(b64)
        // Format raten via Header
        const isPng = bytes[0] === 0x89 && bytes[1] === 0x50
        const img = isPng ? await out.embedPng(bytes) : await out.embedJpg(bytes).catch(() => null)
        if (!img) continue
        const ratio = img.width / img.height
        let w = maxW, h = maxW / ratio
        if (h > maxH) { h = maxH; w = maxH * ratio }
        const xPos = imgX + col * (maxW + 12)
        page.drawImage(img, { x: xPos, y: imgY - h, width: w, height: h })
        page.drawText(sc.filename, { x: xPos, y: imgY - h - 10, size: 7, font, color: COLOR_MUTED })
        col++
        if (col >= 2) { col = 0; imgY -= (maxH + 28) }
        if (imgY < M + 40) break
      } catch { /* skip */ }
    }
  } else {
    page.drawText('Keine Screenshots vorhanden.', { x: 410, y: H - M - 60, size: 9, font, color: COLOR_MUTED })
  }

  // Fußzeile
  page.drawText(`Aktualisiert ${fmtDateTime(marker.updatedAt)}`, { x: M, y: 18, size: 7, font, color: COLOR_MUTED })
}

/** Einfache Wort-basierte Zeilenumbrüche. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = (text || '').split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? line + ' ' + w : w
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) { lines.push(line); line = w }
    else line = test
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['—']
}

export interface ExportProgress { phase: string; current: number; total: number }

export async function exportAccessPointsPdf(
  floorplans: FloorPlan[], markers: Marker[],
  onProgress?: (p: ExportProgress) => void,
): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const savePath = await api().saveFileDialog(
    `Access Points Übersicht ${new Date().toISOString().slice(0, 10)}.pdf`,
    [{ name: 'PDF', extensions: ['pdf'] }],
  )
  if (!savePath) return { ok: true, cancelled: true }

  try {
    const out = await PDFDocument.create()
    out.setTitle('Access Points Übersicht')
    out.setSubject('SKF Marine GmbH – WLAN Access Points')
    out.setProducer('IT Admin Tool')
    out.setCreator('IT Admin Tool')
    out.setCreationDate(new Date())

    const font = await out.embedFont(StandardFonts.Helvetica)
    const fontBold = await out.embedFont(StandardFonts.HelveticaBold)

    // Marker mit globalem Nummerierungsschema (für Detail-Seiten + Label)
    const numbered: { m: Marker; n: number; planIdx: number }[] = []
    let n = 1
    const planIndex = new Map<string, number>()
    floorplans.forEach((fp, i) => planIndex.set(fp.id, i))
    const sortedMarkers = [...markers].sort((a, b) => {
      const ai = planIndex.get(a.floorplanId) ?? 999
      const bi = planIndex.get(b.floorplanId) ?? 999
      if (ai !== bi) return ai - bi
      if (a.page !== b.page) return a.page - b.page
      return a.name.localeCompare(b.name, 'de')
    })
    for (const m of sortedMarkers) numbered.push({ m, n: n++, planIdx: planIndex.get(m.floorplanId) ?? -1 })

    // 1) Lagepläne einbetten + Marker-Overlay
    onProgress?.({ phase: 'Lagepläne übernehmen', current: 0, total: floorplans.length })
    for (let i = 0; i < floorplans.length; i++) {
      const fp = floorplans[i]
      onProgress?.({ phase: 'Lagepläne übernehmen', current: i, total: floorplans.length })
      const b64 = await readFloorPlanBytes(fp)
      if (!b64) continue
      const srcBytes = base64ToUint8(b64)
      try {
        const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true })
        const pageIndexes = src.getPageIndices()
        const copied = await out.copyPages(src, pageIndexes)
        copied.forEach((page, pageIdx) => {
          const added = out.addPage(page)
          const { width: pw, height: ph } = added.getSize()
          // Marker dieser Seite
          const here = numbered.filter(x => x.m.floorplanId === fp.id && x.m.page === pageIdx + 1)
          for (const { m, n } of here) {
            const xPt = m.x * pw
            const yPt = (1 - m.y) * ph        // pdf-lib: y wächst nach oben → invertieren
            drawMarker(added, fontBold, xPt, yPt, `#${n} ${m.name || ''}`.trim())
          }
        })
      } catch (e) {
        // Wenn ein PDF nicht kopiert werden kann, eine Platzhalter-Seite einfügen
        const page = out.addPage([595, 842])
        page.drawText(`Plan konnte nicht eingebunden werden: ${fp.name}`, { x: 36, y: 800, size: 12, font: fontBold, color: COLOR_TEXT })
        page.drawText(String(e), { x: 36, y: 780, size: 9, font, color: COLOR_MUTED })
      }
    }

    // 2) Inhaltsverzeichnis (eine Seite, listet alle APs mit Plan + Seite)
    onProgress?.({ phase: 'Inhaltsverzeichnis', current: 0, total: 1 })
    {
      const page = out.addPage([595, 842])
      page.drawText('Access Points – Übersicht', { x: 36, y: 800, size: 18, font: fontBold, color: COLOR_HEAD })
      page.drawText(`${numbered.length} Access Points · ${floorplans.length} Lagepläne · Stand ${fmtDateTime(new Date().toISOString())}`,
        { x: 36, y: 780, size: 9, font, color: COLOR_MUTED })
      page.drawLine({ start: { x: 36, y: 770 }, end: { x: 559, y: 770 }, color: COLOR_MUTED, thickness: 0.5 })

      let y = 752
      for (const { m, n } of numbered) {
        if (y < 50) {
          // neue Seite
          const np = out.addPage([595, 842])
          y = 800
          np.drawText('Access Points – Übersicht (Forts.)', { x: 36, y, size: 12, font: fontBold, color: COLOR_HEAD })
          y -= 16
        }
        const plan = floorplans.find(p => p.id === m.floorplanId)
        const line = `#${String(n).padStart(3, '0')}   ${m.name || '(ohne Namen)'}`
        const meta = `${plan?.name || '—'} · Seite ${m.page}${m.model ? ' · ' + m.model : ''}${m.ip ? ' · IP ' + m.ip : ''}${m.mac ? ' · MAC ' + m.mac : ''}`
        page.drawText(line, { x: 36, y, size: 10, font: fontBold, color: COLOR_TEXT })
        page.drawText(meta, { x: 220, y, size: 8.5, font, color: COLOR_MUTED })
        y -= 14
      }
    }

    // 3) Detail-Seiten pro AP
    onProgress?.({ phase: 'AP-Details', current: 0, total: numbered.length })
    for (let i = 0; i < numbered.length; i++) {
      onProgress?.({ phase: 'AP-Details', current: i, total: numbered.length })
      const { m, n } = numbered[i]
      const plan = floorplans.find(p => p.id === m.floorplanId)
      await drawDetailPage(out, font, fontBold, m, n, plan)
    }

    // Speichern
    onProgress?.({ phase: 'PDF schreiben', current: 0, total: 1 })
    const bytes = await out.save()
    const ok = await api().writeFile(savePath, uint8ToBase64(bytes))
    if (!ok.success) return { ok: false, error: ok.error || 'Datei konnte nicht gespeichert werden.' }
    api().openPath(savePath).catch(() => {})
    onProgress?.({ phase: 'Fertig', current: 1, total: 1 })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Hilfsfunktion zum Aufbau eines Excel-Vorschau-Namens. */
export function suggestExportName(): string {
  return sanitize(`Access Points Übersicht ${new Date().toISOString().slice(0, 10)}.pdf`)
}
