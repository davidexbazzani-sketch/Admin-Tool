// ── Onboarding-Plan-Viewer (Karten-Editor) ────────────────────────────────────
// Abgespeckte Kopie des Access-Points-PdfViewers: Pan/Zoom/Canvas-Rendering und
// normierte 0..1-Koordinaten. Zusaetzlich: Rechteck-Ziehen fuer Gebaeude-
// Regionen. Laedt die GEBUENDELTEN Plan-PDFs (public/onboarding/plans/) per
// fetch statt vom Netzlaufwerk.

import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, Minus, Maximize2 } from 'lucide-react'
import pdfjsLib, { type PDFDocumentProxy, type PDFPageProxy } from '../accessPoints/pdfjsSetup'
import { PLAN_FILES, type PlanId, type MapPin, type MapRegion } from '../../services/onboarding'
import { readAssetBytes } from '../../services/onboardingAssets'

export type EditorMode = 'none' | 'pin' | 'region'

interface Props {
  planId: PlanId
  page: number                                  // 1-basiert
  pins: MapPin[]                                // bereits auf Plan+Seite gefiltert
  regions: MapRegion[]                          // bereits auf Plan+Seite gefiltert
  selectedId: string | null
  mode: EditorMode
  onPlacePin: (x: number, y: number) => void
  onPlaceRegion: (rect: { x: number; y: number; w: number; h: number }) => void
  onSelect: (id: string | null) => void
  onPinMove: (id: string, x: number, y: number) => void
  onPageCountKnown?: (count: number) => void
  resetSignal?: number
}

const MIN_SCALE = 0.2
const MAX_SCALE = 10

const docCache = new Map<PlanId, Promise<PDFDocumentProxy>>()

function getPlanDoc(planId: PlanId): Promise<PDFDocumentProxy> {
  let p = docCache.get(planId)
  if (!p) {
    p = readAssetBytes(PLAN_FILES[planId]).then(data => pdfjsLib.getDocument({ data }).promise)
    docCache.set(planId, p)
  }
  return p
}

export default function OnboardingPlanViewer({
  planId, page, pins, regions, selectedId, mode,
  onPlacePin, onPlaceRegion, onSelect, onPinMove, onPageCountKnown, resetSignal,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<ReturnType<PDFPageProxy['render']> | null>(null)

  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [pageProxy, setPageProxy] = useState<PDFPageProxy | null>(null)
  const [pageBaseSize, setPageBaseSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [tx, setTx] = useState(0)
  const [ty, setTy] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftRect, setDraftRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const panState = useRef({ active: false, sx: 0, sy: 0, stx: 0, sty: 0, moved: false })
  const rectDraw = useRef<{ sx: number; sy: number } | null>(null)   // normierte Startkoordinaten
  const pinDrag = useRef<{ id: string; moved: boolean } | null>(null)

  // Plan laden
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(''); setDoc(null); setPageProxy(null)
    getPlanDoc(planId)
      .then(d => { if (!cancelled) { setDoc(d); onPageCountKnown?.(d.numPages) } })
      .catch(err => { if (!cancelled) { setError('Plan konnte nicht geladen werden: ' + (err?.message || err)); setLoading(false) } })
    return () => { cancelled = true; renderTaskRef.current?.cancel?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  // Seite holen
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    const idx = Math.min(Math.max(page, 1), doc.numPages)
    doc.getPage(idx).then(p => {
      if (cancelled) return
      setPageProxy(p)
      const vp = p.getViewport({ scale: 1 })
      setPageBaseSize({ w: vp.width, h: vp.height })
    }).catch(err => { if (!cancelled) setError('Seite nicht ladbar: ' + (err?.message || err)) })
    return () => { cancelled = true }
  }, [doc, page])

  // Fit-to-Container bei Wechsel
  useEffect(() => {
    if (!pageBaseSize.w || !pageBaseSize.h) return
    const c = containerRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const fit = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min((rect.width - 24) / pageBaseSize.w, (rect.height - 24) / pageBaseSize.h)))
    setScale(fit)
    setTx((rect.width - pageBaseSize.w * fit) / 2)
    setTy((rect.height - pageBaseSize.h * fit) / 2)
  }, [pageBaseSize, resetSignal])

  // Canvas rendern
  useEffect(() => {
    if (!pageProxy) return
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    const vp = pageProxy.getViewport({ scale: scale * dpr })
    c.width = Math.floor(vp.width)
    c.height = Math.floor(vp.height)
    c.style.width = `${pageBaseSize.w * scale}px`
    c.style.height = `${pageBaseSize.h * scale}px`
    const ctx = c.getContext('2d', { alpha: false })
    if (!ctx) return
    setLoading(true)
    renderTaskRef.current?.cancel?.()
    const task = pageProxy.render({ canvasContext: ctx, viewport: vp })
    renderTaskRef.current = task
    task.promise
      .then(() => setLoading(false))
      .catch(err => {
        if (err?.name !== 'RenderingCancelledException') { setError('Render-Fehler: ' + (err?.message || err)); setLoading(false) }
      })
  }, [pageProxy, scale, pageBaseSize])

  // ── Koordinaten-Helfer ──────────────────────────────────────────────────────
  function toNorm(clientX: number, clientY: number): { x: number; y: number } | null {
    const c = containerRef.current
    if (!c || !pageBaseSize.w) return null
    const rect = c.getBoundingClientRect()
    const px = (clientX - rect.left - tx) / scale
    const py = (clientY - rect.top - ty) / scale
    return { x: px / pageBaseSize.w, y: py / pageBaseSize.h }
  }

  // ── Zoom ────────────────────────────────────────────────────────────────────
  function onWheel(e: React.WheelEvent) {
    if (!pageBaseSize.w) return
    e.preventDefault()
    const c = containerRef.current
    if (!c) return
    const rect = c.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * Math.exp(-e.deltaY * 0.0015)))
    if (next === scale) return
    const ratio = next / scale
    setScale(next); setTx(cx - (cx - tx) * ratio); setTy(cy - (cy - ty) * ratio)
  }
  function zoomBy(factor: number) {
    const c = containerRef.current; if (!c || !pageBaseSize.w) return
    const rect = c.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor))
    if (next === scale) return
    const ratio = next / scale
    setScale(next); setTx(cx - (cx - tx) * ratio); setTy(cy - (cy - ty) * ratio)
  }
  function fit() {
    if (!pageBaseSize.w) return
    const c = containerRef.current; if (!c) return
    const rect = c.getBoundingClientRect()
    const f = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min((rect.width - 24) / pageBaseSize.w, (rect.height - 24) / pageBaseSize.h)))
    setScale(f); setTx((rect.width - pageBaseSize.w * f) / 2); setTy((rect.height - pageBaseSize.h * f) / 2)
  }

  // ── Maus: Pan / Pin setzen / Rechteck ziehen / Pin verschieben ──────────────
  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    if (mode === 'region') {
      const n = toNorm(e.clientX, e.clientY)
      if (n && n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1) {
        rectDraw.current = { sx: n.x, sy: n.y }
        setDraftRect({ x: n.x, y: n.y, w: 0, h: 0 })
      }
      return
    }
    if (pinDrag.current) return
    panState.current = { active: true, sx: e.clientX, sy: e.clientY, stx: tx, sty: ty, moved: false }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (rectDraw.current) {
      const n = toNorm(e.clientX, e.clientY)
      if (!n) return
      const s = rectDraw.current
      setDraftRect({
        x: Math.max(0, Math.min(s.sx, n.x)),
        y: Math.max(0, Math.min(s.sy, n.y)),
        w: Math.min(1, Math.abs(n.x - s.sx)),
        h: Math.min(1, Math.abs(n.y - s.sy)),
      })
      return
    }
    if (pinDrag.current) {
      const n = toNorm(e.clientX, e.clientY)
      if (!n) return
      onPinMove(pinDrag.current.id, Math.max(0, Math.min(1, n.x)), Math.max(0, Math.min(1, n.y)))
      pinDrag.current.moved = true
      return
    }
    if (!panState.current.active) return
    const dx = e.clientX - panState.current.sx
    const dy = e.clientY - panState.current.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panState.current.moved = true
    setTx(panState.current.stx + dx)
    setTy(panState.current.sty + dy)
  }
  function onMouseUp(e: React.MouseEvent) {
    if (rectDraw.current) {
      rectDraw.current = null
      if (draftRect && draftRect.w > 0.01 && draftRect.h > 0.01) onPlaceRegion(draftRect)
      setDraftRect(null)
      return
    }
    if (pinDrag.current) { pinDrag.current = null; return }
    if (!panState.current.active) return
    const moved = panState.current.moved
    panState.current.active = false
    if (moved) return
    if (mode === 'pin') {
      const n = toNorm(e.clientX, e.clientY)
      if (n && n.x >= 0 && n.x <= 1 && n.y >= 0 && n.y <= 1) onPlacePin(n.x, n.y)
      return
    }
    onSelect(null)
  }

  const overlayStyle: React.CSSProperties = {
    position: 'absolute',
    left: tx, top: ty,
    width: pageBaseSize.w * scale,
    height: pageBaseSize.h * scale,
    pointerEvents: 'none',
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-muted/20 select-none ${mode === 'none' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { panState.current.active = false; rectDraw.current = null; setDraftRect(null); pinDrag.current = null }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', left: tx, top: ty }} />

      {/* Overlay: Regionen + Pins (normierte Koordinaten in %) */}
      <div style={overlayStyle}>
        {regions.map(r => (
          <div
            key={r.id}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); onSelect(r.id) }}
            title={`${r.label} → öffnet ${r.targetPlanId}`}
            className={`absolute rounded-md border-2 ${selectedId === r.id ? 'border-amber-400 bg-amber-400/25' : 'border-blue-500/70 bg-blue-500/15 hover:bg-blue-500/25'}`}
            style={{
              left: `${r.rect.x * 100}%`, top: `${r.rect.y * 100}%`,
              width: `${r.rect.w * 100}%`, height: `${r.rect.h * 100}%`,
              pointerEvents: 'auto', cursor: 'pointer',
            }}
          >
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-background/90 border border-border text-blue-400 pointer-events-none">
              {r.label}
            </span>
          </div>
        ))}
        {draftRect && (
          <div
            className="absolute rounded-md border-2 border-dashed border-amber-400 bg-amber-400/15"
            style={{ left: `${draftRect.x * 100}%`, top: `${draftRect.y * 100}%`, width: `${draftRect.w * 100}%`, height: `${draftRect.h * 100}%` }}
          />
        )}
        {pins.map(p => (
          <button
            key={p.id}
            type="button"
            onMouseDown={e => { e.stopPropagation(); pinDrag.current = { id: p.id, moved: false } }}
            onClick={e => { e.stopPropagation(); if (!pinDrag.current) onSelect(p.id) }}
            title={p.label + (p.roomNumber ? ` (Raum ${p.roomNumber})` : '')}
            className="absolute -translate-x-1/2 -translate-y-full flex flex-col items-center"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, pointerEvents: 'auto', cursor: 'move' }}
          >
            <svg viewBox="0 0 24 24" width={selectedId === p.id ? 30 : 24} height={selectedId === p.id ? 30 : 24}
              fill="none" stroke={p.kind === 'room' ? '#3b82f6' : p.kind === 'entrance' ? '#10b981' : '#ef4444'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.5))' }}>
              <path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z" fill={selectedId === p.id ? (p.kind === 'room' ? '#3b82f6' : p.kind === 'entrance' ? '#10b981' : '#ef4444') : 'rgba(255,255,255,.85)'} />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span className="text-[9px] font-bold px-1 py-px rounded bg-background/90 border border-border text-foreground whitespace-nowrap">
              {p.label}
            </span>
          </button>
        ))}
      </div>

      {/* Zoom-Steuerung */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 z-10">
        <button onClick={() => zoomBy(1.3)} className="p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground shadow" title="Vergrößern"><Plus size={14} /></button>
        <button onClick={() => zoomBy(1 / 1.3)} className="p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground shadow" title="Verkleinern"><Minus size={14} /></button>
        <button onClick={fit} className="p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-foreground shadow" title="Einpassen"><Maximize2 size={14} /></button>
      </div>

      {loading && (
        <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-card border border-border text-xs text-muted-foreground z-10">
          <Loader2 size={12} className="animate-spin" />Rendere…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-red-400 px-4 text-center">{error}</p>
        </div>
      )}
    </div>
  )
}
