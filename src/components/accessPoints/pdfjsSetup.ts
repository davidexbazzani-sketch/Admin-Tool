// ── PDF.js-Konfiguration ──────────────────────────────────────────────────────
// pdfjs-dist 4.x: Worker als ES-Module-URL bündeln (Vite kümmert sich um den
// korrekten Asset-Pfad). Damit kann der Renderer das PDF in einem Worker laden
// und blockiert die UI nicht.

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export default pdfjsLib
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
