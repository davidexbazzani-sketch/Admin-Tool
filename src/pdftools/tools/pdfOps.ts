// ── PDF-Werkzeuge: Dokument-Operationen (pdf-lib) ────────────────────────────
// Echte, clientseitige Manipulationen. Alle Funktionen nehmen/liefern Uint8Array.
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

const LOAD_OPTS = { ignoreEncryption: true } as const

export async function getPageCount(data: Uint8Array): Promise<number> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  return doc.getPageCount()
}

export async function mergePdfs(files: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const f of files) {
    const src = await PDFDocument.load(f, LOAD_OPTS)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach(p => out.addPage(p))
  }
  return out.save()
}

// Seiten in beliebiger Reihenfolge zu neuem Dokument (auch zum Loeschen nutzbar:
// einfach die zu behaltenden Indizes uebergeben).
export async function reorderPages(data: Uint8Array, order: number[]): Promise<Uint8Array> {
  const src = await PDFDocument.load(data, LOAD_OPTS)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, order)
  pages.forEach(p => out.addPage(p))
  return out.save()
}

export async function deletePages(data: Uint8Array, removeIndices: number[]): Promise<Uint8Array> {
  const set = new Set(removeIndices)
  const count = await getPageCount(data)
  const keep = Array.from({ length: count }, (_, i) => i).filter(i => !set.has(i))
  return reorderPages(data, keep)
}

export async function extractPages(data: Uint8Array, indices: number[]): Promise<Uint8Array> {
  return reorderPages(data, indices)
}

export async function rotatePages(data: Uint8Array, indices: number[], deltaDeg: number): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const pages = doc.getPages()
  const set = new Set(indices)
  pages.forEach((p, i) => {
    if (set.has(i)) {
      const cur = p.getRotation().angle
      p.setRotation(degrees((cur + deltaDeg) % 360))
    }
  })
  return doc.save()
}

export async function insertBlankPage(data: Uint8Array, atIndex: number, size?: [number, number]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const [w, h] = size ?? [595.28, 841.89] // A4
  doc.insertPage(Math.max(0, Math.min(atIndex, doc.getPageCount())), [w, h])
  return doc.save()
}

export interface WatermarkOpts {
  text: string
  opacity?: number      // 0..1
  fontSize?: number
  angleDeg?: number
  color?: [number, number, number]  // 0..1 each
}

export async function addWatermark(data: Uint8Array, opts: WatermarkOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const { text } = opts
  const size = opts.fontSize ?? 60
  const opacity = opts.opacity ?? 0.18
  const angle = opts.angleDeg ?? 45
  const [r, g, b] = opts.color ?? [0.5, 0.5, 0.5]
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const textWidth = font.widthOfTextAtSize(text, size)
    page.drawText(text, {
      x: width / 2 - (textWidth / 2) * Math.cos((angle * Math.PI) / 180),
      y: height / 2 - (textWidth / 2) * Math.sin((angle * Math.PI) / 180),
      size, font, color: rgb(r, g, b), opacity, rotate: degrees(angle),
    })
  }
  return doc.save()
}

export interface HeaderFooterOpts {
  headerText?: string
  footerText?: string
  showPageNumbers?: boolean
  fontSize?: number
}

export async function addHeaderFooter(data: Uint8Array, opts: HeaderFooterOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const size = opts.fontSize ?? 9
  const pages = doc.getPages()
  pages.forEach((page, i) => {
    const { width, height } = page.getSize()
    if (opts.headerText) page.drawText(opts.headerText, { x: 40, y: height - 28, size, font, color: rgb(0.3, 0.3, 0.3) })
    const footerParts: string[] = []
    if (opts.footerText) footerParts.push(opts.footerText)
    if (opts.showPageNumbers) footerParts.push(`Seite ${i + 1} von ${pages.length}`)
    const footer = footerParts.join('    ')
    if (footer) {
      const w = font.widthOfTextAtSize(footer, size)
      page.drawText(footer, { x: width / 2 - w / 2, y: 22, size, font, color: rgb(0.3, 0.3, 0.3) })
    }
  })
  return doc.save()
}

export interface BatesOpts { prefix?: string; start?: number; digits?: number }

export async function addBatesNumbering(data: Uint8Array, opts: BatesOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const start = opts.start ?? 1
  const digits = opts.digits ?? 6
  const prefix = opts.prefix ?? ''
  doc.getPages().forEach((page, i) => {
    const { width } = page.getSize()
    const label = `${prefix}${String(start + i).padStart(digits, '0')}`
    const w = font.widthOfTextAtSize(label, 9)
    page.drawText(label, { x: width - w - 30, y: 18, size: 9, font, color: rgb(0.2, 0.2, 0.2) })
  })
  return doc.save()
}

export interface PdfMetadata { title?: string; author?: string; subject?: string; keywords?: string }

export async function setMetadata(data: Uint8Array, meta: PdfMetadata): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  if (meta.title !== undefined) doc.setTitle(meta.title)
  if (meta.author !== undefined) doc.setAuthor(meta.author)
  if (meta.subject !== undefined) doc.setSubject(meta.subject)
  if (meta.keywords !== undefined) doc.setKeywords(meta.keywords.split(',').map(s => s.trim()).filter(Boolean))
  return doc.save()
}

export async function readMetadata(data: Uint8Array): Promise<Required<PdfMetadata>> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  return {
    title: doc.getTitle() ?? '',
    author: doc.getAuthor() ?? '',
    subject: doc.getSubject() ?? '',
    keywords: (doc.getKeywords() ?? '').toString(),
  }
}

// Formularfelder und (soweit moeglich) Anmerkungen fest ins PDF einbrennen.
export async function flattenDocument(data: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  try { doc.getForm().flatten() } catch { /* kein Formular */ }
  return doc.save()
}

// Ein PNG (z.B. Unterschrift) an einer Position einbetten.
export interface PlaceImageOpts { pageIndex: number; x: number; y: number; width: number; height: number }

export async function placePngImage(data: Uint8Array, pngBytes: Uint8Array, opts: PlaceImageOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const png = await doc.embedPng(pngBytes)
  const page = doc.getPage(opts.pageIndex)
  page.drawImage(png, { x: opts.x, y: opts.y, width: opts.width, height: opts.height })
  return doc.save()
}

// Freien Text an einer Position platzieren (Fill & Sign / Datum / Haekchen).
export interface PlaceTextOpts { pageIndex: number; x: number; y: number; text: string; size?: number; color?: [number, number, number] }

export async function placeText(data: Uint8Array, opts: PlaceTextOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.getPage(opts.pageIndex)
  const [r, g, b] = opts.color ?? [0, 0, 0]
  page.drawText(opts.text, { x: opts.x, y: opts.y, size: opts.size ?? 12, font, color: rgb(r, g, b) })
  return doc.save()
}

// Vorhandene Formularfelder auslesen (zum Ausfuellen) / setzen.
export interface FormFieldInfo { name: string; type: string; value?: string }

export async function listFormFields(data: Uint8Array): Promise<FormFieldInfo[]> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const form = doc.getForm()
  return form.getFields().map(f => ({ name: f.getName(), type: f.constructor.name }))
}

export async function setTextFieldValues(data: Uint8Array, values: Record<string, string>): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const form = doc.getForm()
  for (const [name, value] of Object.entries(values)) {
    try { form.getTextField(name).setText(value) } catch { /* kein Textfeld */ }
  }
  return doc.save()
}

// Rechteck zeichnen — fuer Markierungen (halbtransparent) oder Schwaerzen (deckend).
export interface PlaceRectOpts {
  pageIndex: number; x: number; y: number; width: number; height: number
  color?: [number, number, number]; opacity?: number; border?: boolean
}
export async function placeRect(data: Uint8Array, o: PlaceRectOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const page = doc.getPage(o.pageIndex)
  const [r, g, b] = o.color ?? [1, 0.9, 0.2]
  page.drawRectangle({
    x: o.x, y: o.y - o.height, width: o.width, height: o.height,
    color: rgb(r, g, b), opacity: o.opacity ?? 0.35,
    borderColor: o.border ? rgb(0.1, 0.1, 0.1) : undefined,
    borderWidth: o.border ? 1 : 0,
  })
  return doc.save()
}

// Selektionsbasierte Text-Markierung: mehrere Rechtecke in EINEM Durchgang.
// rect.yTop = obere Kante in PDF-Koordinaten (Ursprung unten links).
export type MarkupKind = 'highlight' | 'underline' | 'strike'
export interface MarkupRect { pageIndex: number; x: number; yTop: number; width: number; height: number }

export async function applyTextMarkup(data: Uint8Array, kind: MarkupKind, rects: MarkupRect[]): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  for (const r of rects) {
    if (r.pageIndex < 0 || r.pageIndex >= doc.getPageCount()) continue
    const page = doc.getPage(r.pageIndex)
    const bottom = r.yTop - r.height
    if (kind === 'highlight') {
      page.drawRectangle({ x: r.x, y: bottom, width: r.width, height: r.height, color: rgb(1, 0.92, 0.2), opacity: 0.4 })
    } else if (kind === 'underline') {
      page.drawRectangle({ x: r.x, y: bottom + 0.5, width: r.width, height: 1.4, color: rgb(0.85, 0.1, 0.1) })
    } else {
      const mid = bottom + r.height / 2
      page.drawRectangle({ x: r.x, y: mid - 0.7, width: r.width, height: 1.4, color: rgb(0.85, 0.1, 0.1) })
    }
  }
  return doc.save()
}

export async function createBlankPdf(pages = 1, size: [number, number] = [595.28, 841.89]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < Math.max(1, pages); i++) doc.addPage(size)
  return doc.save()
}

export async function createPdfFromImage(imgBytes: Uint8Array, kind: 'png' | 'jpg'): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const img = kind === 'png' ? await doc.embedPng(imgBytes) : await doc.embedJpg(imgBytes)
  const page = doc.addPage([img.width, img.height])
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
  return doc.save()
}

// Erneut speichern (Objekt-Streams) — kann die Dateigroesse leicht reduzieren.
export async function recompress(data: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  return doc.save({ useObjectStreams: true })
}

// Neues Textfeld als echtes Formularfeld anlegen.
export async function createTextFieldAt(data: Uint8Array, name: string, o: { pageIndex: number; x: number; y: number; width: number; height: number }): Promise<Uint8Array> {
  const doc = await PDFDocument.load(data, LOAD_OPTS)
  const form = doc.getForm()
  const field = form.createTextField(name)
  field.addToPage(doc.getPage(o.pageIndex), { x: o.x, y: o.y - o.height, width: o.width, height: o.height })
  return doc.save()
}
