// ── OT-Geräte: Hallenplan-Viewer (verlustfreies Zoomen via pdf.js) ───────────
// Rendert die PDF-Seite bei JEDER Zoomstufe neu in ein <canvas> (echte Vektor-
// Schärfe), Pan über CSS-translate. PC-Marker liegen normiert (0..1) darüber.
// Schlanker Klon von components/accessPoints/PdfViewer.tsx.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Plus, Minus, Maximize2, Lock } from 'lucide-react'
import pdfjsLib, { type PDFDocumentProxy, type PDFPageProxy } from '../accessPoints/pdfjsSetup'
import type { OtDevice } from '../../services/otDevices'

interface PlanViewerProps {
  pdfBase64: string | null
  pageIndex: number                                  // 0-basiert
  devices: OtDevice[]
  selectedId: string | null
  blinkingId: string | null
  placementMode: boolean
  onPlace: (x: number, y: number) => void            // x,y normiert (0..1)
  onDeviceClick: (id: string) => void
  onDeviceMove: (id: string, x: number, y: number) => void
  onEmptyClick?: () => void
  onPageCountKnown?: (count: number) => void
  resetSignal?: number
  placeHint?: string                                 // Text im Platzieren-Banner (Standard: PC)
}

function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

const MIN_SCALE = 0.2
const MAX_SCALE = 12

export default function PlanViewer({
  pdfBase64, pageIndex, devices, selectedId, blinkingId, placementMode,
  onPlace, onDeviceClick, onDeviceMove, onEmptyClick, onPageCountKnown, resetSignal, placeHint,
}: PlanViewerProps) {
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
  const [renderError, setRenderError] = useState('')

  const panState = useRef<{ active: boolean; sx: number; sy: number; stx: number; sty: number; moved: boolean }>({ active: false, sx: 0, sy: 0, stx: 0, sty: 0, moved: false })
  const markerDrag = useRef<{ id: string; moved: boolean } | null>(null)

  // PDF laden
  useEffect(() => {
    let cancelled = false
    if (!pdfBase64) { setDoc(null); return }
    setLoading(true); setRenderError('')
    const bytes = base64ToUint8Array(pdfBase64)
    pdfjsLib.getDocument({ data: bytes }).promise
      .then(d => { if (cancelled) { d.destroy(); return } setDoc(d); onPageCountKnown?.(d.numPages) })
      .catch(err => { if (!cancelled) { setRenderError('Plan konnte nicht geladen werden: ' + (err?.message || err)); setLoading(false) } })
    return () => { cancelled = true; renderTaskRef.current?.cancel?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfBase64])

  // Seite holen
  useEffect(() => {
    if (!doc) return
    let cancelled = false
    const idx = Math.min(Math.max(pageIndex + 1, 1), doc.numPages)
    doc.getPage(idx).then(p => {
      if (cancelled) return
      setPageProxy(p)
      const vp = p.getViewport({ scale: 1 })
      setPageBaseSize({ w: vp.width, h: vp.height })
    }).catch(err => { if (!cancelled) setRenderError('Seite konnte nicht geladen werden: ' + (err?.message || err)) })
    return () => { cancelled = true }
  }, [doc, pageIndex])

  // Fit-to-Container (bei Plan-Load / Reset)
  useEffect(() => {
    if (!pageBaseSize.w || !pageBaseSize.h) return
    const c = containerRef.current; if (!c) return
    const rect = c.getBoundingClientRect()
    const fit = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min((rect.width - 24) / pageBaseSize.w, (rect.height - 24) / pageBaseSize.h)))
    setScale(fit)
    setTx((rect.width - pageBaseSize.w * fit) / 2)
    setTy((rect.height - pageBaseSize.h * fit) / 2)
  }, [pageBaseSize, resetSignal])

  // Rendern (re-render bei jeder Scale-Änderung → verlustfreie Schärfe)
  useEffect(() => {
    if (!pageProxy) return
    const c = canvasRef.current; if (!c) return
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
      .catch(err => { if (err?.name !== 'RenderingCancelledException') { setRenderError('Render-Fehler: ' + (err?.message || err)); setLoading(false) } })
  }, [pageProxy, scale, pageBaseSize])

  function onWheel(e: React.WheelEvent) {
    if (!pageBaseSize.w) return
    e.preventDefault()
    const c = containerRef.current; if (!c) return
    const rect = c.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * Math.exp(-e.deltaY * 0.0015)))
    if (next === scale) return
    const ratio = next / scale
    setScale(next); setTx(cx - (cx - tx) * ratio); setTy(cy - (cy - ty) * ratio)
  }
  function zoomBy(factor: number) {
    if (!pageBaseSize.w) return
    const c = containerRef.current; if (!c) return
    const rect = c.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor))
    if (next === scale) return
    const ratio = next / scale
    setScale(next); setTx(cx - (cx - tx) * ratio); setTy(cy - (cy - ty) * ratio)
  }
  function fitToContainer() {
    if (!pageBaseSize.w) return
    const c = containerRef.current; if (!c) return
    const rect = c.getBoundingClientRect()
    const fit = Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.min((rect.width - 24) / pageBaseSize.w, (rect.height - 24) / pageBaseSize.h)))
    setScale(fit); setTx((rect.width - pageBaseSize.w * fit) / 2); setTy((rect.height - pageBaseSize.h * fit) / 2)
  }

  function onMouseDown(e: React.MouseEvent) {
    if (markerDrag.current) return
    if (e.button !== 0) return
    panState.current = { active: true, sx: e.clientX, sy: e.clientY, stx: tx, sty: ty, moved: false }
  }
  function onMouseMove(e: React.MouseEvent) {
    if (markerDrag.current) {
      const c = containerRef.current; if (!c) return
      const rect = c.getBoundingClientRect()
      const nx = Math.max(0, Math.min(1, ((e.clientX - rect.left - tx) / scale) / pageBaseSize.w))
      const ny = Math.max(0, Math.min(1, ((e.clientY - rect.top - ty) / scale) / pageBaseSize.h))
      onDeviceMove(markerDrag.current.id, nx, ny)
      markerDrag.current.moved = true
      return
    }
    if (!panState.current.active) return
    const dx = e.clientX - panState.current.sx, dy = e.clientY - panState.current.sy
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panState.current.moved = true
    setTx(panState.current.stx + dx); setTy(panState.current.sty + dy)
  }
  function onMouseUp(e: React.MouseEvent) {
    if (markerDrag.current) { markerDrag.current = null; return }
    if (!panState.current.active) return
    const wasMoved = panState.current.moved
    panState.current.active = false
    if (!wasMoved && placementMode && pageBaseSize.w) {
      const c = containerRef.current; if (!c) return
      const rect = c.getBoundingClientRect()
      const nx = ((e.clientX - rect.left - tx) / scale) / pageBaseSize.w
      const ny = ((e.clientY - rect.top - ty) / scale) / pageBaseSize.h
      if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) onPlace(nx, ny)
      return
    }
    if (!wasMoved) onEmptyClick?.()
  }

  const visible = useMemo(() => devices.filter(d => d.page === pageIndex + 1), [devices, pageIndex])
  const cursorClass = placementMode ? 'cursor-crosshair' : 'cursor-grab'
  const startMarkerDrag = useCallback((id: string) => { markerDrag.current = { id, moved: false } }, [])

  if (!pdfBase64) {
    return <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Hallenplan wird geladen…</div>
  }

  return (
    <div
      ref={containerRef}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => { panState.current.active = false; markerDrag.current = null }}
      className={`relative h-full w-full overflow-hidden bg-[#2a2f3a] ${cursorClass} select-none`}
      style={{ backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.02) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.02) 25%, transparent 25%)', backgroundSize: '20px 20px' }}
    >
      <div className="absolute top-0 left-0 origin-top-left" style={{ transform: `translate(${tx}px, ${ty}px)` }}>
        <canvas ref={canvasRef} className="block shadow-2xl bg-white" />

        {visible.map(m => {
          const left = m.x * pageBaseSize.w * scale
          const top = m.y * pageBaseSize.h * scale
          const isSelected = selectedId === m.id
          const isBlinking = blinkingId === m.id
          const isLock = m.kind === 'lock'
          const colorCls = isBlinking
            ? 'bg-green-400 border-green-600 ot-blink'
            : isSelected
              ? 'bg-amber-300 border-amber-600 ring-2 ring-amber-200'
              : isLock
                ? 'bg-red-600 border-red-800'
                : 'bg-blue-500 border-blue-700'
          return (
            <div
              key={m.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
              style={{ left, top }}
              onMouseDown={(e) => { e.stopPropagation(); panState.current.active = false; startMarkerDrag(m.id) }}
              onClick={(e) => {
                e.stopPropagation()
                if (markerDrag.current && markerDrag.current.moved) { markerDrag.current = null; return }
                markerDrag.current = null
                onDeviceClick(m.id)
              }}
            >
              {isLock ? (
                <div className={`flex items-center justify-center w-5 h-5 rounded border-2 shadow-md ${colorCls} hover:scale-125 transition-transform cursor-pointer`} title="Verschlossene Tür">
                  <Lock size={11} className="text-white" strokeWidth={2.5} />
                </div>
              ) : (
                <div className={`w-3.5 h-3.5 rounded-full border-2 shadow-md ${colorCls} hover:scale-125 transition-transform cursor-pointer`} />
              )}
              {(isSelected || isBlinking) && (m.hostname || isLock) && (
                <div className="absolute left-4 top-3 whitespace-nowrap px-1.5 py-0.5 rounded bg-black/80 text-white text-[10px] font-medium pointer-events-none">
                  {m.hostname || (isLock ? 'Verschlossene Tür' : '')}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="absolute top-3 right-3 z-20 flex flex-col gap-1 bg-card border border-border rounded-md shadow-md p-1">
        <button onClick={() => zoomBy(1.25)} className="p-1.5 rounded hover:bg-accent/40 text-foreground" title="Vergrößern (Mausrad)"><Plus size={14} /></button>
        <button onClick={() => zoomBy(0.8)} className="p-1.5 rounded hover:bg-accent/40 text-foreground" title="Verkleinern"><Minus size={14} /></button>
        <button onClick={fitToContainer} className="p-1.5 rounded hover:bg-accent/40 text-foreground" title="An Fenster anpassen"><Maximize2 size={14} /></button>
      </div>

      <div className="absolute bottom-3 left-3 z-20 px-2 py-1 rounded-md bg-card/90 border border-border text-[10px] text-muted-foreground">
        {Math.round(scale * 100)} %
      </div>

      {placementMode && (
        <div className="absolute top-3 left-3 z-20 px-3 py-1.5 rounded-md bg-amber-300 text-black text-xs font-medium shadow">
          {placeHint || 'Klicke auf den Plan, um einen PC zu platzieren'}
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-card/80 px-3 py-2 rounded-md flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />Lade Plan…
          </div>
        </div>
      )}

      {renderError && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="max-w-md bg-red-500/10 border border-red-500/40 text-red-300 text-xs p-3 rounded-md">{renderError}</div>
        </div>
      )}

      <style>{`
        @keyframes ot-blink-anim {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(74,222,128,0.7); }
          50% { transform: scale(1.6); box-shadow: 0 0 0 12px rgba(74,222,128,0); }
        }
        .ot-blink { animation: ot-blink-anim 1s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
