// ── PDF.js-Konfiguration (modul-lokal) ───────────────────────────────────────
// Eigene Einrichtung fuer das PDF-Werkzeuge-Modul, damit es in sich
// geschlossen bleibt. Worker als ES-Module-URL (Vite bündelt den Asset).
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export default pdfjsLib
export type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
