// ── PDF-Werkzeuge: Viewer (PDF.js) ───────────────────────────────────────────
import {
  forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import {
  ZoomIn, ZoomOut, RotateCw, Search, X, ChevronUp, ChevronDown,
  GalleryVerticalEnd, Maximize, FileText, Highlighter, Underline, Strikethrough,
} from 'lucide-react'
import { loadPdf, renderPageToCanvas, renderPageFull, searchInDocument, type SearchHit } from '../tools/render'
import type { MarkupKind, MarkupRect } from '../tools/pdfOps'
import type { PDFDocumentProxy } from '../pdfjsSetup'
import { Spinner } from './ui'

export type ViewLayout = 'continuous' | 'single' | 'double'

export interface PlacementResult {
  pageIndex: number          // 0-basiert
  xPdf: number; yPdf: number // PDF-Koordinaten (Ursprung unten links)
  pageWidthPt: number; pageHeightPt: number
}

export interface PdfViewerHandle {
  zoomIn: () => void
  zoomOut: () => void
  setZoomPercent: (p: number) => void
  fitWidth: () => void
  fitPage: () => void
  rotateView: () => void
  setLayout: (l: ViewLayout) => void
  cycleLayout: () => void
  toggleThumbnails: () => void
  openSearch: () => void
  goToPage: (n: number) => void
  getCurrentPage: () => number
  getNumPages: () => number
  startPlacement: (cb: (r: PlacementResult) => void) => void
  cancelPlacement: () => void
  applyMarkupToSelection: (kind: MarkupKind) => boolean   // false = keine Auswahl
}

interface PageMeta { widthPt: number; heightPt: number }

const MIN_SCALE = 0.25
const MAX_SCALE = 5

interface ViewerProps {
  data: Uint8Array
  onApplyMarkup?: (kind: MarkupKind, rects: MarkupRect[]) => void
}

export default forwardRef<PdfViewerHandle, ViewerProps>(function PdfViewer({ data, onApplyMarkup }, ref) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageMeta, setPageMeta] = useState<PageMeta[]>([])
  const [scale, setScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [layout, setLayoutState] = useState<ViewLayout>('continuous')
  const [currentPage, setCurrentPage] = useState(1)
  const [showThumbs, setShowThumbs] = useState(false)
  const [loading, setLoading] = useState(true)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const [activeHit, setActiveHit] = useState(0)

  const placementCb = useRef<((r: PlacementResult) => void) | null>(null)
  const [placing, setPlacing] = useState(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageWrapRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderedAt = useRef<Map<number, string>>(new Map())  // page -> "scale|rotation"

  // Markup (Text-Markierung) — Popover + zuletzt gueltige Auswahl
  const [markupBar, setMarkupBar] = useState<{ x: number; y: number } | null>(null)
  const lastRects = useRef<MarkupRect[]>([])

  // Dokument laden
  useEffect(() => {
    let alive = true
    setLoading(true)
    setDoc(null)
    renderedAt.current.clear()
    ;(async () => {
      const d = await loadPdf(data)
      if (!alive) return
      setDoc(d)
      setNumPages(d.numPages)
      const metas: PageMeta[] = []
      for (let i = 1; i <= d.numPages; i++) {
        const vp = (await d.getPage(i)).getViewport({ scale: 1 })
        metas.push({ widthPt: vp.width, heightPt: vp.height })
      }
      if (!alive) return
      setPageMeta(metas)
      setLoading(false)
      requestAnimationFrame(() => fitWidth(metas))
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Sichtbare Seiten rendern (Lazy)
  function renderVisible() {
    const cont = containerRef.current
    if (!cont || !doc) return
    const top = cont.scrollTop - cont.clientHeight
    const bottom = cont.scrollTop + cont.clientHeight * 2
    const key = `${scale.toFixed(3)}|${rotation}`
    let best = currentPage; let bestDist = Infinity
    pageWrapRefs.current.forEach((wrap, pageNum) => {
      const offTop = wrap.offsetTop
      const offBottom = offTop + wrap.offsetHeight
      const center = Math.abs((offTop + offBottom) / 2 - (cont.scrollTop + cont.clientHeight / 2))
      if (center < bestDist) { bestDist = center; best = pageNum }
      const visible = offBottom >= top && offTop <= bottom
      if (visible && renderedAt.current.get(pageNum) !== key) {
        const canvas = canvasRefs.current.get(pageNum)
        const textLayer = textLayerRefs.current.get(pageNum)
        if (canvas && textLayer) {
          renderedAt.current.set(pageNum, key)
          doc.getPage(pageNum).then(pg => renderPageFull(pg, canvas, textLayer, scale, rotation)).catch(() => {
            renderedAt.current.delete(pageNum)
          })
        }
      }
    })
    if (best !== currentPage) setCurrentPage(best)
  }

  // Bei Aenderung von scale/rotation alle Canvas neu zeichnen
  useLayoutEffect(() => {
    renderedAt.current.clear()
    renderVisible()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, rotation, layout, doc, showThumbs])

  function onScroll() { setMarkupBar(null); requestAnimationFrame(renderVisible) }

  // ── Imperative API ──
  function fitWidth(metas = pageMeta) {
    const cont = containerRef.current
    if (!cont || metas.length === 0) return
    const avail = cont.clientWidth - (layout === 'double' ? 60 : 48)
    const w = layout === 'double' ? metas[0].widthPt * 2 + 24 : metas[0].widthPt
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, avail / w)))
  }
  function fitPage() {
    const cont = containerRef.current
    if (!cont || pageMeta.length === 0) return
    const availW = cont.clientWidth - 48
    const availH = cont.clientHeight - 48
    const m = pageMeta[Math.max(0, currentPage - 1)]
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min(availW / m.widthPt, availH / m.heightPt))))
  }
  function goToPage(n: number) {
    const target = Math.max(1, Math.min(numPages, n))
    const wrap = pageWrapRefs.current.get(target)
    wrap?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setCurrentPage(target)
  }

  // ── Text-Markierung: Auswahl → PDF-Koordinaten ──
  function collectSelectionRects(): MarkupRect[] {
    if (rotation % 360 !== 0) return []  // Markierung nur ohne Drehung
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return []
    const clientRects = Array.from(selection.getRangeAt(0).getClientRects())
    const out: MarkupRect[] = []
    for (const r of clientRects) {
      if (r.width < 1 || r.height < 1) continue
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      for (const [pageNum, canvas] of canvasRefs.current) {
        const cr = canvas.getBoundingClientRect()
        if (cx >= cr.left && cx <= cr.right && cy >= cr.top && cy <= cr.bottom) {
          const m = pageMeta[pageNum - 1]; if (!m) break
          out.push({
            pageIndex: pageNum - 1,
            x: ((r.left - cr.left) / cr.width) * m.widthPt,
            yTop: m.heightPt - ((r.top - cr.top) / cr.height) * m.heightPt,
            width: (r.width / cr.width) * m.widthPt,
            height: (r.height / cr.height) * m.heightPt,
          })
          break
        }
      }
    }
    return out
  }

  function refreshSelectionBar() {
    if (placing) return
    const rects = collectSelectionRects()
    if (rects.length === 0) { setMarkupBar(null); return }
    lastRects.current = rects
    const sel = window.getSelection()
    const bound = sel?.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null
    const root = rootRef.current?.getBoundingClientRect()
    if (bound && root) setMarkupBar({ x: bound.left - root.left + bound.width / 2, y: Math.max(8, bound.top - root.top - 8) })
  }

  function applyMarkup(kind: MarkupKind): boolean {
    const rects = collectSelectionRects()
    const use = rects.length ? rects : lastRects.current
    if (use.length === 0) return false
    onApplyMarkup?.(kind, use)
    window.getSelection()?.removeAllRanges()
    lastRects.current = []
    setMarkupBar(null)
    return true
  }

  useImperativeHandle(ref, (): PdfViewerHandle => ({
    zoomIn: () => setScale(s => Math.min(MAX_SCALE, +(s + 0.15).toFixed(2))),
    zoomOut: () => setScale(s => Math.max(MIN_SCALE, +(s - 0.15).toFixed(2))),
    setZoomPercent: (p) => setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, p / 100))),
    fitWidth: () => fitWidth(),
    fitPage: () => fitPage(),
    rotateView: () => setRotation(r => (r + 90) % 360),
    setLayout: (l) => setLayoutState(l),
    cycleLayout: () => setLayoutState(l => l === 'continuous' ? 'single' : l === 'single' ? 'double' : 'continuous'),
    toggleThumbnails: () => setShowThumbs(v => !v),
    openSearch: () => setSearchOpen(true),
    goToPage,
    getCurrentPage: () => currentPage,
    getNumPages: () => numPages,
    startPlacement: (cb) => { placementCb.current = cb; setPlacing(true) },
    cancelPlacement: () => { placementCb.current = null; setPlacing(false) },
    applyMarkupToSelection: (kind) => applyMarkup(kind),
  }))

  // ── Suche ──
  async function runSearch(q: string) {
    setQuery(q)
    if (!doc || !q.trim()) { setHits([]); return }
    setSearching(true)
    const found = await searchInDocument(doc, q)
    setHits(found); setActiveHit(0); setSearching(false)
    if (found.length) goToPage(found[0].page)
  }
  function jumpHit(delta: number) {
    if (!hits.length) return
    const next = (activeHit + delta + hits.length) % hits.length
    setActiveHit(next); goToPage(hits[next].page)
  }

  // ── Platzieren (Klick auf Seite) ──
  function onPageClick(pageNum: number, e: React.MouseEvent<HTMLDivElement>) {
    if (!placing || !placementCb.current) return
    const canvas = canvasRefs.current.get(pageNum)
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const rx = (e.clientX - rect.left) / rect.width
    const ry = (e.clientY - rect.top) / rect.height
    const m = pageMeta[pageNum - 1]
    const cb = placementCb.current
    placementCb.current = null; setPlacing(false)
    cb({ pageIndex: pageNum - 1, xPdf: rx * m.widthPt, yPdf: (1 - ry) * m.heightPt, pageWidthPt: m.widthPt, pageHeightPt: m.heightPt })
  }

  const visiblePages = useMemo(() => {
    if (layout === 'single') return [currentPage]
    return Array.from({ length: numPages }, (_, i) => i + 1)
  }, [layout, numPages, currentPage])

  return (
    <div ref={rootRef} onMouseUp={refreshSelectionBar} style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
      {/* Markup-Popover (erscheint bei Textauswahl) */}
      {markupBar && (
        <div
          className="pdfx-card pdfx-fade-in"
          onMouseDown={e => e.preventDefault()}
          style={{ position: 'absolute', zIndex: 40, left: markupBar.x, top: markupBar.y, transform: 'translate(-50%, -100%)', display: 'flex', gap: 2, padding: 4, boxShadow: 'var(--px-shadow)' }}
        >
          <button className="pdfx-btn" style={{ padding: '6px 9px' }} title="Hervorheben" onClick={() => applyMarkup('highlight')}><Highlighter size={15} /></button>
          <button className="pdfx-btn" style={{ padding: '6px 9px' }} title="Unterstreichen" onClick={() => applyMarkup('underline')}><Underline size={15} /></button>
          <button className="pdfx-btn" style={{ padding: '6px 9px' }} title="Durchstreichen" onClick={() => applyMarkup('strike')}><Strikethrough size={15} /></button>
        </div>
      )}

      {/* Viewer-Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--px-border)', background: 'var(--px-surface)' }}>
        <button className="pdfx-btn" style={{ padding: 7 }} onClick={() => setShowThumbs(v => !v)} title="Miniaturen ein-/ausblenden"><GalleryVerticalEnd size={15} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button className="pdfx-btn" style={{ padding: 7 }} onClick={() => setScale(s => Math.max(MIN_SCALE, +(s - 0.15).toFixed(2)))} title="Verkleinern"><ZoomOut size={15} /></button>
          <span style={{ minWidth: 52, textAlign: 'center', fontSize: 12, color: 'var(--px-text-2)' }}>{Math.round(scale * 100)}%</span>
          <button className="pdfx-btn" style={{ padding: 7 }} onClick={() => setScale(s => Math.min(MAX_SCALE, +(s + 0.15).toFixed(2)))} title="Vergrößern"><ZoomIn size={15} /></button>
        </div>
        <button className="pdfx-btn" onClick={() => fitWidth()} title="An Breite anpassen" style={{ fontSize: 12 }}>Breite</button>
        <button className="pdfx-btn" style={{ padding: 7 }} onClick={() => fitPage()} title="Ganze Seite"><Maximize size={15} /></button>
        <button className="pdfx-btn" style={{ padding: 7 }} onClick={() => setRotation(r => (r + 90) % 360)} title="Ansicht drehen"><RotateCw size={15} /></button>
        <select
          value={layout}
          onChange={e => setLayoutState(e.target.value as ViewLayout)}
          className="pdfx-btn" style={{ fontSize: 12, padding: '7px 10px' }}
          title="Seitenlayout"
        >
          <option value="continuous">Fortlaufend</option>
          <option value="single">Einzelseite</option>
          <option value="double">Doppelseite</option>
        </select>

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--px-text-2)' }}>
          <button className="pdfx-btn" style={{ padding: 6 }} onClick={() => goToPage(currentPage - 1)} title="Vorherige Seite"><ChevronUp size={14} /></button>
          <input
            value={currentPage}
            onChange={e => { const n = parseInt(e.target.value, 10); if (!isNaN(n)) goToPage(n) }}
            style={{ width: 40, textAlign: 'center', padding: '4px', borderRadius: 6, border: '1px solid var(--px-border)', background: 'var(--px-surface-2)', color: 'var(--px-text)' }}
          />
          <span>/ {numPages}</span>
          <button className="pdfx-btn" style={{ padding: 6 }} onClick={() => goToPage(currentPage + 1)} title="Nächste Seite"><ChevronDown size={14} /></button>
        </div>
        <button className="pdfx-btn" style={{ padding: 7 }} onClick={() => setSearchOpen(o => !o)} title="Im Dokument suchen"><Search size={15} /></button>
      </div>

      {/* Suchleiste */}
      {searchOpen && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--px-border)', background: 'var(--px-surface-2)' }}>
          <Search size={14} />
          <input
            autoFocus value={query}
            onChange={e => runSearch(e.target.value)}
            placeholder="Im Dokument suchen…"
            style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--px-border)', background: 'var(--px-surface)', color: 'var(--px-text)', fontSize: 13 }}
          />
          {searching ? <Spinner /> : <span style={{ fontSize: 12, color: 'var(--px-text-2)' }}>{hits.length ? `${activeHit + 1} / ${hits.length}` : 'keine Treffer'}</span>}
          <button className="pdfx-btn" style={{ padding: 6 }} onClick={() => jumpHit(-1)} disabled={!hits.length}><ChevronUp size={14} /></button>
          <button className="pdfx-btn" style={{ padding: 6 }} onClick={() => jumpHit(1)} disabled={!hits.length}><ChevronDown size={14} /></button>
          <button className="pdfx-btn" style={{ padding: 6 }} onClick={() => setSearchOpen(false)}><X size={14} /></button>
        </div>
      )}

      {placing && (
        <div style={{ padding: '7px 12px', background: 'var(--px-accent-soft)', color: 'var(--px-accent)', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
          Klicke auf die Stelle im Dokument, an der es platziert werden soll …
          <button className="pdfx-btn" style={{ marginLeft: 12, padding: '2px 10px' }} onClick={() => { placementCb.current = null; setPlacing(false) }}>Abbrechen</button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Miniaturen */}
        {showThumbs && doc && (
          <div className="pdfx-scroll" style={{ width: 150, borderRight: '1px solid var(--px-border)', overflowY: 'auto', padding: 10, background: 'var(--px-surface-2)' }}>
            {Array.from({ length: numPages }, (_, i) => i + 1).map(p => (
              <Thumb key={p} doc={doc} pageNum={p} active={p === currentPage} onClick={() => goToPage(p)} />
            ))}
          </div>
        )}

        {/* Seiten */}
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="pdfx-scroll"
          style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexWrap: 'wrap', gap: 24, alignContent: 'flex-start', justifyContent: 'center', background: 'var(--px-bg)' }}
        >
          {loading && <div style={{ alignSelf: 'center', display: 'flex', gap: 8, color: 'var(--px-text-2)' }}><Spinner /> Lade Dokument …</div>}
          {!loading && visiblePages.map(p => {
            const m = pageMeta[p - 1]
            const rotated = rotation % 180 !== 0
            const w = (rotated ? m?.heightPt : m?.widthPt) ?? 600
            const h = (rotated ? m?.widthPt : m?.heightPt) ?? 800
            return (
              <div
                key={p}
                ref={el => { if (el) pageWrapRefs.current.set(p, el); else pageWrapRefs.current.delete(p) }}
                onClick={e => onPageClick(p, e)}
                style={{
                  width: w * scale, height: h * scale,
                  background: '#fff', boxShadow: 'var(--px-shadow)', borderRadius: 4,
                  flex: layout === 'double' ? '0 0 auto' : '0 0 auto',
                  cursor: placing ? 'crosshair' : 'default',
                  position: 'relative',
                }}
              >
                <canvas ref={el => { if (el) canvasRefs.current.set(p, el); else canvasRefs.current.delete(p) }} style={{ display: 'block', borderRadius: 4 }} />
                <div
                  className="px-textlayer"
                  ref={el => { if (el) textLayerRefs.current.set(p, el); else textLayerRefs.current.delete(p) }}
                  style={{ pointerEvents: placing ? 'none' : 'auto' }}
                />
                <span style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 10, color: 'var(--px-text-3)', background: 'rgba(255,255,255,0.8)', padding: '1px 6px', borderRadius: 6, pointerEvents: 'none' }}>{p}</span>
              </div>
            )
          })}
          {!loading && numPages === 0 && (
            <div style={{ alignSelf: 'center', color: 'var(--px-text-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <FileText size={40} /> Leeres oder nicht lesbares Dokument
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

function Thumb({ doc, pageNum, active, onClick }: { doc: PDFDocumentProxy; pageNum: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let alive = true
    doc.getPage(pageNum).then(pg => { if (alive && ref.current) renderPageToCanvas(pg, ref.current, 0.2, 0) }).catch(() => {})
    return () => { alive = false }
  }, [doc, pageNum])
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', marginBottom: 8, padding: 4, cursor: 'pointer',
        border: `2px solid ${active ? 'var(--px-accent)' : 'transparent'}`, borderRadius: 8, background: 'transparent',
      }}
      title={`Seite ${pageNum}`}
    >
      <canvas ref={ref} style={{ width: '100%', borderRadius: 4, boxShadow: 'var(--px-shadow-sm)', display: 'block' }} />
      <span style={{ fontSize: 10, color: 'var(--px-text-3)' }}>{pageNum}</span>
    </button>
  )
}
