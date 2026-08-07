// ── PDF-Werkzeuge: Anzeige & Text (PDF.js) ───────────────────────────────────
import pdfjsLib, { type PDFDocumentProxy, type PDFPageProxy } from '../pdfjsSetup'
import { api } from '../../electronAPI'
import { bytesToBase64, sanitizeName } from './io'

// PDF.js detached den uebergebenen Buffer — daher immer eine Kopie uebergeben,
// damit dieselben Bytes spaeter (z.B. fuer pdf-lib) weiter nutzbar bleiben.
export async function loadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const copy = data.slice()
  return pdfjsLib.getDocument({ data: copy }).promise
}

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  rotation = 0,
): Promise<void> {
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  await page.render({ canvasContext: ctx, viewport }).promise
}

// Canvas rendern UND eine auswaehlbare Textebene aufbauen (gleiche viewport-
// Geometrie). Die Textebene enthaelt transparente, exakt positionierte Spans,
// damit der Browser den Text markieren kann und die Markierung auf den Woertern
// sitzt.
export async function renderPageFull(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  textLayer: HTMLDivElement,
  scale: number,
  rotation = 0,
): Promise<void> {
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 })
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(viewport.width * dpr)
  canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  await page.render({ canvasContext: ctx, viewport }).promise

  // Textebene
  textLayer.style.width = `${Math.floor(viewport.width)}px`
  textLayer.style.height = `${Math.floor(viewport.height)}px`
  textLayer.textContent = ''
  const content = await page.getTextContent()
  const targets: number[] = []
  const spans: HTMLSpanElement[] = []
  for (const item of content.items) {
    if (!('str' in item) || !item.str) continue
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
    const fontHeight = Math.hypot(tx[2], tx[3])
    if (fontHeight < 1) continue
    const span = document.createElement('span')
    span.textContent = item.str
    span.style.position = 'absolute'
    span.style.left = `${tx[4]}px`
    span.style.top = `${tx[5] - fontHeight}px`
    span.style.fontSize = `${fontHeight}px`
    span.style.fontFamily = 'sans-serif'
    span.style.transformOrigin = '0% 0%'
    textLayer.appendChild(span)
    spans.push(span)
    targets.push(('width' in item ? item.width : 0) * scale)
  }
  // Zweiter Durchgang: Breite messen und horizontal anpassen (eine Layout-Phase)
  for (let i = 0; i < spans.length; i++) {
    const measured = spans[i].getBoundingClientRect().width
    if (targets[i] > 0 && measured > 0) spans[i].style.transform = `scaleX(${targets[i] / measured})`
  }
}

export async function getPageText(doc: PDFDocumentProxy, pageNum: number): Promise<string> {
  const page = await doc.getPage(pageNum)
  const content = await page.getTextContent()
  return content.items.map(it => ('str' in it ? it.str : '')).join(' ')
}

export async function getAllText(doc: PDFDocumentProxy): Promise<string> {
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    parts.push(`--- Seite ${i} ---`)
    parts.push(await getPageText(doc, i))
  }
  return parts.join('\n\n')
}

export interface SearchHit { page: number; index: number; snippet: string }

export async function searchInDocument(doc: PDFDocumentProxy, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const hits: SearchHit[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const text = (await getPageText(doc, p)).toLowerCase()
    let from = 0
    while (true) {
      const idx = text.indexOf(q, from)
      if (idx < 0) break
      hits.push({ page: p, index: idx, snippet: text.slice(Math.max(0, idx - 30), idx + q.length + 30) })
      from = idx + q.length
      if (hits.length > 999) return hits
    }
  }
  return hits
}

// Seiten als Bilder rendern und in einen gewaehlten Ordner schreiben.
// Liefert die Anzahl exportierter Dateien (0 = abgebrochen).
export async function exportPagesAsImages(
  data: Uint8Array,
  baseName: string,
  format: 'png' | 'jpeg',
  scale = 2,
): Promise<{ count: number; dir?: string; cancelled?: boolean; error?: string }> {
  const dir = await api().selectDirectory()
  if (!dir) return { count: 0, cancelled: true }
  const doc = await loadPdf(data)
  const ext = format === 'jpeg' ? 'jpg' : 'png'
  const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const canvas = document.createElement('canvas')
  let count = 0
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    await renderPageToCanvas(page, canvas, scale, 0)
    const dataUrl = canvas.toDataURL(mime, 0.92)
    const b64 = dataUrl.split(',')[1] ?? ''
    const fileName = `${sanitizeName(baseName)}_Seite_${String(p).padStart(3, '0')}.${ext}`
    const res = await api().writeFile(`${dir}\\${fileName}`, b64)
    if (res.success) count++
  }
  api().openPath(dir).catch(() => {})
  return { count, dir }
}
