// ── Onboarding-Assets: gebuendelte Plaene/Logo → Data-URIs ────────────────────
// Die Lageplan-PDFs und das SKF-Logo liegen gebuendelt in der App
// (public/onboarding/…). ZUR GENERIERUNGSZEIT (nie zur Build-Zeit) werden die
// benoetigten PDF-Seiten per pdfjs auf ein Offscreen-Canvas gerendert und als
// JPEG-Data-URIs in die selbstenthaltende HTML eingebettet. Ergebnisse werden
// pro Sitzung gecacht, damit wiederholtes Generieren sofort geht.
//
// Gelesen wird ueber api().readAsset (IPC): fetch() waere im Production-Build
// (file:// + webSecurity) blockiert.

import { api } from '../electronAPI'
import pdfjsLib, { type PDFDocumentProxy } from '../components/accessPoints/pdfjsSetup'
import { PLAN_FILES, type PlanId } from './onboarding'

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

/** Gebuendeltes Asset als Bytes lesen (wirft bei Fehler). */
export async function readAssetBytes(rel: string): Promise<Uint8Array> {
  const r = await api().readAsset(rel)
  if (!r.success || !r.data) throw new Error(r.error || `Asset ${rel} nicht ladbar`)
  return base64ToBytes(r.data)
}

// Render-Tuning fuer das STATISCHE Fallback-/Sofortbild. Die eigentliche
// Schaerfe liefert im Dashboard das eingebettete pdf.js, das den Plan LIVE bei
// jeder Zoomstufe neu rendert (wie der Karten-Editor). Das statische Bild dient
// nur als sofortiger erster Anblick und als Fallback, falls pdf.js nicht laedt
// — daher reicht eine moderate Aufloesung (haelt die HTML klein).
const MAX_RENDER_WIDTH = 2000
const MIN_RENDER_SCALE = 1.0
const JPEG_QUALITY = 0.82

const docCache = new Map<PlanId, Promise<PDFDocumentProxy>>()
const pageImageCache = new Map<string, string>()   // "planId:page" -> dataURI
const pageCountCache = new Map<PlanId, number>()
let logoCache: string | null = null

async function getDoc(planId: PlanId): Promise<PDFDocumentProxy> {
  let p = docCache.get(planId)
  if (!p) {
    p = (async () => {
      const data = await readAssetBytes(PLAN_FILES[planId])
      const doc = await pdfjsLib.getDocument({ data }).promise
      pageCountCache.set(planId, doc.numPages)
      return doc
    })()
    docCache.set(planId, p)
  }
  return p
}

/** Seitenzahl eines gebuendelten Plans (fuer die Etagen-Zuordnung im Editor). */
export async function getPlanPageCount(planId: PlanId): Promise<number> {
  const cached = pageCountCache.get(planId)
  if (cached) return cached
  const doc = await getDoc(planId)
  return doc.numPages
}

/**
 * Rendert EINE Seite eines gebuendelten Plans als JPEG-Data-URI (max. 1800px
 * breit, Qualitaet 0.75). Gecacht pro Sitzung.
 */
export async function renderPlanPage(planId: PlanId, page: number): Promise<string> {
  const key = `${planId}:${page}`
  const cached = pageImageCache.get(key)
  if (cached) return cached

  const doc = await getDoc(planId)
  const pageNo = Math.min(Math.max(1, page), doc.numPages)
  const pdfPage = await doc.getPage(pageNo)

  const base = pdfPage.getViewport({ scale: 1 })
  const scale = Math.max(MIN_RENDER_SCALE, Math.min(MAX_RENDER_WIDTH / base.width, 4))
  const viewport = pdfPage.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas-Kontext nicht verfügbar')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  await pdfPage.render({ canvasContext: ctx, viewport }).promise
  // Pro Seite das bessere Format waehlen: PNG ist bei Vektor-Strichzeichnungen
  // (Gebaeudeplaene) gestochen scharf und oft KLEINER als JPEG; beim gescannten
  // Komplett-Lageplan gewinnt JPEG deutlich.
  const jpeg = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  const png = canvas.toDataURL('image/png')
  const uri = png.length < jpeg.length ? png : jpeg
  pageImageCache.set(key, uri)
  return uri
}

/**
 * Rendert alle benoetigten Seiten (sequenziell, UI-schonend) mit Fortschritt.
 * `pages` = eindeutige "planId:page"-Schluessel.
 */
export async function renderPlanPages(
  pages: { planId: PlanId; page: number }[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const uniq = new Map<string, { planId: PlanId; page: number }>()
  for (const p of pages) uniq.set(`${p.planId}:${p.page}`, p)
  let done = 0
  for (const [key, p] of uniq) {
    out.set(key, await renderPlanPage(p.planId, p.page))
    done++
    onProgress?.(done, uniq.size)
  }
  return out
}

function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() || ''
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

// ── Automatische Raum-Suche in den Plaenen ────────────────────────────────────
// Die Gebaeudeplaene (Verwaltungsgebaeude, Kopfbauwerk) haben eine Textebene,
// in der alle Raumnummern stehen. Damit finden wir den Raum des Mitarbeiters
// ZUR GENERIERUNGSZEIT automatisch und pinnen ihn als "Dein Büro" — ohne dass
// die IT jeden Raum manuell setzen muss.

const ROOM_SEARCH_ORDER: PlanId[] = ['verwaltung', 'kopfbauwerk', 'halle']

export interface RoomHit {
  planId: PlanId
  page: number
  x: number
  y: number
}

export async function findRoomOnPlans(roomNumber: string): Promise<RoomHit | null> {
  const target = (roomNumber || '').trim().toLowerCase()
  // Kuerzer als 3 Zeichen -> zu grosse Verwechslungsgefahr mit Raster-/Massbeschriftungen
  if (target.length < 3) return null
  for (const planId of ROOM_SEARCH_ORDER) {
    try {
      const doc = await getDoc(planId)
      for (let page = 1; page <= doc.numPages; page++) {
        const p = await doc.getPage(page)
        const vp = p.getViewport({ scale: 1 })
        const tc = await p.getTextContent()
        for (const raw of tc.items) {
          const it = raw as { str?: string; transform?: number[]; width?: number; height?: number }
          if (!it.str || !it.transform) continue
          if (it.str.trim().toLowerCase() !== target) continue
          // Text-Transform in Viewport-Koordinaten (y nach unten) umrechnen
          const m = pdfjsLib.Util.transform(vp.transform, it.transform) as number[]
          const x = (m[4] + (it.width ?? 0) / 2) / vp.width
          const y = (m[5] - (it.height ?? 0) / 2) / vp.height
          return {
            planId, page,
            x: Math.max(0, Math.min(1, x)),
            y: Math.max(0, Math.min(1, y)),
          }
        }
      }
    } catch { /* naechster Plan */ }
  }
  return null
}

// ── pdf.js + rohe Plan-PDFs fuer das LIVE-Rendering in der HTML ───────────────
// pdf.js (Lib + Worker) und die benoetigten Plan-PDFs werden als Base64 in die
// selbstenthaltende HTML eingebettet, damit die Karte dort exakt wie der
// Karten-Editor gerendert werden kann (Vektor, scharf bei jedem Zoom).

let pdfjsSrcCache: { lib: string; worker: string } | null = null
const planPdfB64Cache = new Map<PlanId, string>()

/** pdf.js-Quelltexte (Base64) — Lib + Worker. Null, wenn nicht ladbar. */
export async function getPdfJsSources(): Promise<{ lib: string; worker: string } | null> {
  if (pdfjsSrcCache) return pdfjsSrcCache
  try {
    const [lib, worker] = await Promise.all([
      api().readAsset('onboarding/pdfjs/pdf.min.mjs'),
      api().readAsset('onboarding/pdfjs/pdf.worker.min.mjs'),
    ])
    if (!lib.success || !lib.data || !worker.success || !worker.data) return null
    pdfjsSrcCache = { lib: lib.data, worker: worker.data }
    return pdfjsSrcCache
  } catch { return null }
}

/** Rohe Plan-PDFs (Base64) fuer die angeforderten Plaene. */
export async function getPlanPdfsBase64(planIds: PlanId[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const id of [...new Set(planIds)]) {
    const cached = planPdfB64Cache.get(id)
    if (cached) { out[id] = cached; continue }
    try {
      const r = await api().readAsset(PLAN_FILES[id])
      if (r.success && r.data) { planPdfB64Cache.set(id, r.data); out[id] = r.data }
    } catch { /* Plan fehlt -> Fallback auf statisches Bild */ }
  }
  return out
}

/** SKF-Logo als PNG-Data-URI (gebuendelt, ~36 KB). */
export async function getLogoDataUri(): Promise<string> {
  if (logoCache) return logoCache
  try {
    const r = await api().readAsset('onboarding/logo-skf-marine.png')
    if (!r.success || !r.data) return ''
    logoCache = `data:image/png;base64,${r.data}`
    return logoCache
  } catch { return '' }
}

/**
 * Raumfoto als Data-URI, '' wenn (noch) nicht vorhanden.
 * Pfad mit '/' -> zentral vom Tool-Netzlaufwerk (Upload im Tool),
 * sonst Legacy: gebuendelt unter public/onboarding/rooms/<datei>.
 */
export async function getRoomPhotoDataUri(photo?: string): Promise<string> {
  if (!photo) return ''
  try {
    const mime = mimeFromName(photo)
    if (!mime.startsWith('image/')) return ''
    if (photo.includes('/')) {
      const b64 = await api().netReadRawFile(photo)
      return b64 ? `data:${mime};base64,${b64}` : ''
    }
    const r = await api().readAsset(`onboarding/rooms/${photo}`)
    if (!r.success || !r.data) return ''
    return `data:${mime};base64,${r.data}`
  } catch { return '' }
}
