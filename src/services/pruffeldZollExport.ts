// ── Prüffeld & Zoll – PDF-Export ─────────────────────────────────────────────
// Wie otDevicesExport.ts, nur mit dem Lageplan „Halle 1–11, Gesamtübersicht":
//   Seite 1 = Lageplan (Original-Vektorseite via pdf-lib) mit den Geräte-Markern
//   ab Seite 2 = Liste aller Geräte mit Hostname + Arbeitsplatz (durchnummeriert)

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib'
import { api } from '../electronAPI'
import type { OtDevice } from './otDevices'

const PLAN_ASSET = 'pruffeld-zoll/gesamtuebersicht.pdf'

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
function fmtDateTime(d: Date): string {
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const COLOR_MARKER = rgb(0.0, 0.45, 0.95)
const COLOR_MARKER_BORDER = rgb(1, 1, 1)
const COLOR_LABEL_BG = rgb(0, 0, 0)
const COLOR_LABEL_FG = rgb(1, 1, 1)
const COLOR_TEXT = rgb(0.05, 0.07, 0.12)
const COLOR_MUTED = rgb(0.4, 0.45, 0.55)
const COLOR_HEAD = rgb(0.12, 0.25, 0.7)
const COLOR_ROWALT = rgb(0.95, 0.96, 0.98)

/** Marker (Punkt + Hostname-Label) auf die Planseite zeichnen. */
function drawMarker(page: PDFPage, font: PDFFont, x: number, y: number, label: string) {
  const r = 4.5
  page.drawCircle({ x, y, size: r + 1.4, color: COLOR_MARKER_BORDER, opacity: 0.9 })
  page.drawCircle({ x, y, size: r, color: COLOR_MARKER })
  if (label) {
    const fontSize = 6
    const padX = 2, padY = 1.4
    const tw = font.widthOfTextAtSize(label, fontSize)
    const th = font.heightAtSize(fontSize)
    const lx = x + r + 3
    const ly = y - th / 2 + 1
    page.drawRectangle({ x: lx - padX, y: ly - padY, width: tw + 2 * padX, height: th + 2 * padY, color: COLOR_LABEL_BG, opacity: 0.78 })
    page.drawText(label, { x: lx, y: ly, size: fontSize, font, color: COLOR_LABEL_FG })
  }
}

/** Natürliche Sortierung nach Arbeitsplatz (Zahlen numerisch), dann Hostname. */
function sortDevices(list: OtDevice[]): OtDevice[] {
  return [...list].sort((a, b) =>
    (a.arbeitsplatz || '').localeCompare(b.arbeitsplatz || '', 'de', { numeric: true, sensitivity: 'base' })
    || (a.hostname || '').localeCompare(b.hostname || '', 'de', { numeric: true }))
}

export async function exportPruffeldZollPdf(devices: OtDevice[]): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const savePath = await api().saveFileDialog(
    `Prueffeld-Zoll Lageplan ${new Date().toISOString().slice(0, 10)}.pdf`,
    [{ name: 'PDF', extensions: ['pdf'] }],
  )
  if (!savePath) return { ok: true, cancelled: true }

  try {
    const out = await PDFDocument.create()
    out.setTitle('Prüffeld & Zoll – Lageplan')
    out.setProducer('IT Admin Tool'); out.setCreator('IT Admin Tool'); out.setCreationDate(new Date())
    const font = await out.embedFont(StandardFonts.Helvetica)
    const fontBold = await out.embedFont(StandardFonts.HelveticaBold)

    // Nummerierung (Plan-Label ↔ Liste identisch)
    const sorted = sortDevices(devices)
    const numbered = sorted.map((d, i) => ({ d, n: i + 1 }))
    const numByPage = (page: number) => numbered.filter(x => (x.d.page || 1) === page)

    // ── Seite 1+: Lageplan mit Markern ──
    const asset = await api().readAsset(PLAN_ASSET)
    if (asset.success && asset.data) {
      try {
        const src = await PDFDocument.load(base64ToUint8(asset.data), { ignoreEncryption: true })
        const copied = await out.copyPages(src, src.getPageIndices())
        copied.forEach((page, pageIdx) => {
          const added = out.addPage(page)
          const { width: pw, height: ph } = added.getSize()
          for (const { d, n } of numByPage(pageIdx + 1)) {
            drawMarker(added, fontBold, d.x * pw, (1 - d.y) * ph, `#${n} ${d.hostname || ''}`.trim())
          }
        })
      } catch (e) {
        const page = out.addPage([595, 842])
        page.drawText('Lageplan konnte nicht eingebunden werden.', { x: 36, y: 800, size: 12, font: fontBold, color: COLOR_TEXT })
        page.drawText(String(e), { x: 36, y: 780, size: 9, font, color: COLOR_MUTED })
      }
    } else {
      const page = out.addPage([595, 842])
      page.drawText('Lageplan nicht gefunden.', { x: 36, y: 800, size: 12, font: fontBold, color: COLOR_TEXT })
    }

    // ── Liste: alle Geräte mit Arbeitsplatz ──
    const W = 595, H = 842, M = 36
    const cNr = M, cHost = M + 40, cPlace = M + 260, cNote = M + 420
    let page = out.addPage([W, H])
    let y = H - M
    const drawHeader = (cont: boolean) => {
      page.drawText(`Prüffeld & Zoll – Arbeitsplätze${cont ? ' (Forts.)' : ''}`, { x: M, y: y - 16, size: cont ? 13 : 18, font: fontBold, color: COLOR_HEAD })
      if (!cont) page.drawText(`${numbered.length} Gerät(e) · Stand ${fmtDateTime(new Date())}`, { x: M, y: y - 32, size: 9, font, color: COLOR_MUTED })
      y -= cont ? 30 : 46
      // Spaltenköpfe
      page.drawText('Nr.', { x: cNr, y, size: 8.5, font: fontBold, color: COLOR_MUTED })
      page.drawText('Hostname', { x: cHost, y, size: 8.5, font: fontBold, color: COLOR_MUTED })
      page.drawText('Arbeitsplatz', { x: cPlace, y, size: 8.5, font: fontBold, color: COLOR_MUTED })
      page.drawText('Notiz', { x: cNote, y, size: 8.5, font: fontBold, color: COLOR_MUTED })
      y -= 6
      page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, color: COLOR_MUTED, thickness: 0.5 })
      y -= 14
    }
    drawHeader(false)
    const trunc = (s: string, size: number, maxW: number) => {
      let t = s || ''
      if (font.widthOfTextAtSize(t, size) <= maxW) return t
      while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1)
      return t + '…'
    }
    numbered.forEach(({ d, n }, i) => {
      if (y < M + 24) { page = out.addPage([W, H]); y = H - M; drawHeader(true) }
      if (i % 2 === 1) page.drawRectangle({ x: M - 3, y: y - 3, width: W - 2 * M + 6, height: 13, color: COLOR_ROWALT })
      page.drawText(`#${n}`, { x: cNr, y, size: 9, font, color: COLOR_MUTED })
      page.drawText(trunc(d.hostname || '(ohne Hostname)', 9, cPlace - cHost - 6), { x: cHost, y, size: 9, font: fontBold, color: COLOR_TEXT })
      page.drawText(trunc(d.arbeitsplatz || '—', 9, cNote - cPlace - 6), { x: cPlace, y, size: 9, font, color: COLOR_TEXT })
      page.drawText(trunc(d.notes || '', 8.5, W - M - cNote), { x: cNote, y, size: 8.5, font, color: COLOR_MUTED })
      y -= 15
    })

    const bytes = await out.save()
    const ok = await api().writeFile(savePath, uint8ToBase64(bytes))
    if (!ok.success) return { ok: false, error: ok.error || 'Datei konnte nicht gespeichert werden.' }
    api().openPath(savePath).catch(() => {})
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
