// ── PDF-Werkzeuge: OCR-Texterkennung (tesseract.js, offline-faehig) ──────────
// Worker + WASM-Core werden LOKAL aus public/tesseract/ geladen (keine
// Internet-Abhaengigkeit fuer die Engine). Die Sprachdaten (*.traineddata.gz)
// werden ebenfalls lokal aus public/tesseract/tessdata/ geladen, falls
// vorhanden — sonst faellt OCR auf den offiziellen CDN-Pfad zurueck.
//
// Vollstaendig offline: die Dateien `deu.traineddata.gz` und `eng.traineddata.gz`
// in `public/tesseract/tessdata/` ablegen (siehe README dort).
import { createWorker, type Worker } from 'tesseract.js'
import { loadPdf, renderPageToCanvas } from './render'

const CDN_LANG = 'https://tessdata.projectnaptha.com/4.0.0'

// Stabiler, NICHT gehashter Pfad (public/ wird 1:1 nach dist/ kopiert).
function localBase(): string {
  return new URL('tesseract/', document.baseURI).href
}

export interface OcrProgress {
  page: number
  totalPages: number
  status: string
  progress: number
  offline: boolean
}

async function makeWorker(lang: string, langPath: string, logger: (m: { status: string; progress: number }) => void): Promise<Worker> {
  const base = localBase()
  return createWorker(lang, 1, {
    workerPath: `${base}worker.min.js`,
    corePath: base,
    langPath,
    logger,
  })
}

export async function ocrDocument(
  data: Uint8Array,
  opts?: { lang?: string; scale?: number; onProgress?: (p: OcrProgress) => void },
): Promise<string> {
  const lang = opts?.lang ?? 'deu+eng'
  const scale = opts?.scale ?? 2
  let page = 0
  let totalPages = 0
  let offline = true
  const logger = (m: { status: string; progress: number }) =>
    opts?.onProgress?.({ page, totalPages, status: m.status, progress: m.progress, offline })

  // Erst lokal (offline), bei Fehler auf CDN-Sprachdaten ausweichen.
  let worker: Worker
  try {
    worker = await makeWorker(lang, `${localBase()}tessdata`, logger)
  } catch {
    offline = false
    worker = await makeWorker(lang, CDN_LANG, logger)
  }

  try {
    const doc = await loadPdf(data)
    totalPages = doc.numPages
    const canvas = document.createElement('canvas')
    const parts: string[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      page = p
      const pg = await doc.getPage(p)
      await renderPageToCanvas(pg, canvas, scale, 0)
      const result = await worker.recognize(canvas)
      parts.push(`--- Seite ${p} ---\n${result.data.text.trim()}`)
    }
    return parts.join('\n\n')
  } finally {
    await worker.terminate()
  }
}
