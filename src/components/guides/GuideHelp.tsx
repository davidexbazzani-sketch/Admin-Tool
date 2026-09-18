// ── Anleitungs-Helfer (generisch) ────────────────────────────────────────────
// Blendet dort, wo ein Software-Name im Tool erscheint, beim Überfahren eine
// Option „Anleitung anzeigen" ein. Im Dialog kann die gebündelte PDF gelesen,
// als PDF exportiert oder direkt gedruckt werden. Unterstützt MEHRERE Anleitungen
// je Eintrag (z. B. COSCOM: Installation + Arbeitsplatz einrichten) via Reiter.
// Grundlage: gebündelte PDFs unter public/guides/… (Asset via readAsset).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, X, FileDown, Printer, Loader2, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react'
import pdfjsLib, { type PDFDocumentProxy } from '../accessPoints/pdfjsSetup'
import { api } from '../../electronAPI'

export interface GuideDef {
  title: string        // Anzeige-/Reiter-Titel
  asset: string        // Pfad unter public/guides, z. B. 'guides/coscom-installation.pdf'
  exportName: string   // Dateiname beim „Als PDF exportieren"
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

export function GuideModal({ guides, initialIndex = 0, onClose }: { guides: GuideDef[]; initialIndex?: number; onClose: () => void }) {
  const [active, setActive] = useState(initialIndex)
  const [maximized, setMaximized] = useState(false)
  const [pagesByGuide, setPagesByGuide] = useState<Record<number, string[]>>({})
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const b64Ref = useRef<Record<number, string>>({})
  const alive = useRef(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const loadGuide = useCallback(async (idx: number) => {
    if (pagesByGuide[idx]) return
    setLoadingIdx(idx); setError('')
    try {
      const g = guides[idx]
      const asset = await api().readAsset(g.asset)
      if (!asset.success || !asset.data) throw new Error(asset.error || 'Anleitung (PDF) nicht gefunden.')
      b64Ref.current[idx] = asset.data
      const doc: PDFDocumentProxy = await pdfjsLib.getDocument({ data: base64ToUint8(asset.data) }).promise
      const out: string[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        if (!alive.current) { doc.destroy(); return }
        const page = await doc.getPage(i)
        const vp = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height)
        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport: vp }).promise
        out.push(canvas.toDataURL('image/jpeg', 0.85))
        if (alive.current) setPagesByGuide(prev => ({ ...prev, [idx]: [...out] }))
      }
      doc.destroy()
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (alive.current) setLoadingIdx(null)
    }
  }, [guides, pagesByGuide])

  useEffect(() => { void loadGuide(active); if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [active, loadGuide])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pages = pagesByGuide[active] || []
  const loading = loadingIdx === active && pages.length === 0

  const exportPdf = useCallback(async () => {
    const data = b64Ref.current[active]
    if (!data) return
    setBusy('export'); setError('')
    try {
      const path = await api().saveFileDialog(guides[active].exportName, [{ name: 'PDF', extensions: ['pdf'] }])
      if (!path) return
      const r = await api().writeFile(path, data)
      if (r.success) api().openPath(path).catch(() => {})
      else setError(r.error || 'Speichern fehlgeschlagen.')
    } finally { setBusy('') }
  }, [active, guides])

  const printGuide = useCallback(async () => {
    if (pages.length === 0) return
    setBusy('print'); setError('')
    try {
      const html =
        '<!doctype html><html><head><meta charset="utf-8"><style>'
        + '@page{size:A4;margin:8mm;} html,body{margin:0;padding:0;background:#fff;}'
        + 'img{width:100%;display:block;} .pg{page-break-after:always;} .pg:last-child{page-break-after:auto;}'
        + '</style></head><body>'
        + pages.map(src => `<div class="pg"><img src="${src}"/></div>`).join('')
        + '</body></html>'
      const r = await api().printHtml(html)
      if (!r.success) setError(r.error || 'Drucken fehlgeschlagen.')
    } finally { setBusy('') }
  }, [pages])

  return createPortal(
    <div className={`fixed inset-0 z-[80] flex items-center justify-center bg-black/60 ${maximized ? 'p-1.5' : 'p-4'}`} onClick={onClose}>
      <div className={`bg-card border border-border rounded-xl w-full flex flex-col shadow-2xl ${maximized ? 'max-w-[99vw] h-[97vh]' : 'max-w-4xl h-[90vh]'}`} onClick={e => e.stopPropagation()}>
        <div className="shrink-0 flex items-center gap-2 px-5 py-3 border-b border-border">
          <BookOpen size={18} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground flex-1 truncate">{guides[active]?.title}</h2>
          <button onClick={exportPdf} disabled={!!busy || loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-border text-muted-foreground hover:text-foreground disabled:opacity-50">
            {busy === 'export' ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}Als PDF exportieren
          </button>
          <button onClick={printGuide} disabled={!!busy || loading || pages.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
            {busy === 'print' ? <Loader2 size={13} className="animate-spin" /> : <Printer size={13} />}Drucken
          </button>
          <button onClick={() => setMaximized(m => !m)} title={maximized ? 'Fenster verkleinern' : 'Fenster vergrößern'}
            className="p-1.5 rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground">
            {maximized ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground"><X size={18} /></button>
        </div>

        {guides.length > 1 && (
          <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-border bg-background/40 overflow-x-auto">
            {guides.map((g, i) => (
              <button key={i} onClick={() => setActive(i)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap ${i === active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40'}`}>
                {g.title}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mx-5 mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs shrink-0">
            <AlertTriangle size={14} />{error}
          </div>
        )}

        <div ref={scrollRef} className="guide-scroll flex-1 overflow-y-auto p-4 bg-[#2a2f3a] space-y-4">
          {pages.map((src, i) => (
            <img key={i} src={src} alt={`Seite ${i + 1}`} className={`mx-auto w-full shadow-lg rounded bg-white ${maximized ? 'max-w-[1500px]' : 'max-w-[850px]'}`} />
          ))}
          {loading && (
            <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
              <Loader2 size={16} className="animate-spin" />Anleitung wird geladen…
            </div>
          )}
        </div>
      </div>
      <style>{`
        .guide-scroll { scrollbar-width: thin; scrollbar-color: #ffffff rgba(255,255,255,0.12); }
        .guide-scroll::-webkit-scrollbar { width: 14px; height: 14px; }
        .guide-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,0.08); }
        .guide-scroll::-webkit-scrollbar-thumb { background: #ffffff; border-radius: 8px; border: 3px solid #2a2f3a; }
        .guide-scroll::-webkit-scrollbar-thumb:hover { background: #e5e7eb; }
      `}</style>
    </div>,
    document.body,
  )
}

export default function GuideHelp({ children, guides, className }: { children: ReactNode; guides: GuideDef[]; className?: string }) {
  const [hovered, setHovered] = useState(false)
  const [open, setOpen] = useState(false)
  const timer = useRef<number | null>(null)

  const enter = () => { if (timer.current) window.clearTimeout(timer.current); setHovered(true) }
  const leave = () => { timer.current = window.setTimeout(() => setHovered(false), 140) }

  return (
    <span className={`relative inline-flex items-center ${className || ''}`} onMouseEnter={enter} onMouseLeave={leave}>
      <span onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        title="Anleitung anzeigen"
        className="underline decoration-dotted decoration-primary/50 underline-offset-2 cursor-help">{children}</span>
      {hovered && (
        <span className="absolute z-[70] top-full left-0 mt-1 whitespace-nowrap">
          <span role="button" tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setOpen(true); setHovered(false) }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-primary text-primary-foreground shadow-lg hover:opacity-90 cursor-pointer"
          >
            <BookOpen size={12} />Anleitung anzeigen{guides.length > 1 ? ` (${guides.length})` : ''}
          </span>
        </span>
      )}
      {open && <GuideModal guides={guides} onClose={() => setOpen(false)} />}
    </span>
  )
}
