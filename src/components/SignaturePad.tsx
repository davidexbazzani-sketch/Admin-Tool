import { useEffect, useRef, useState } from 'react'
import { Eraser, Check, Edit3, Maximize2, X } from 'lucide-react'

interface SignaturePadProps {
  /** Existing signature (PNG data URL) to display as starting point. */
  initialValue?: string
  /** Called when the user finalises a stroke or clears. */
  onChange?: (dataUrl: string | null) => void
  /** Canvas drawing area in pixels. */
  width?: number
  height?: number
}

/**
 * Two-mode signature pad:
 *   - "view" mode: shows an existing signature as an <img>. Has a
 *     "Neu unterschreiben" button to switch into draw mode.
 *   - "draw" mode: shows a drawable canvas. Mouse / touchpad strokes are
 *     recorded; user can lift the pointer and continue. "Löschen" wipes the
 *     canvas; "Übernehmen" (or any stroke release) emits the dataURL.
 *
 * Additionally a "Vollbild" button (top-right) opens a fullscreen overlay with
 * a much larger drawing surface — useful for signing with a pen on a touch
 * display. The fullscreen surface edits the SAME signature and emits the same
 * onChange; closing it returns to the inline pad showing the result.
 *
 * IMPORTANT IMPLEMENTATION NOTE:
 * The draw-mode canvas setup intentionally runs only when `mode` changes,
 * NOT when `initialValue` changes. Otherwise every stroke release would emit
 * onChange → parent re-renders with new initialValue → effect would clear
 * and re-paint the canvas, losing strokes mid-signing.
 */
export default function SignaturePad({ initialValue, onChange, width = 480, height = 160 }: SignaturePadProps) {
  // Mode toggle: 'view' shows the saved <img>; 'draw' shows the canvas.
  const [mode, setMode] = useState<'view' | 'draw'>(initialValue ? 'view' : 'draw')
  const [imgFailed, setImgFailed] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fsCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastRef = useRef<{ x: number; y: number } | null>(null)
  const [canvasHasContent, setCanvasHasContent] = useState(false)
  // Quelle, aus der die Vollbild-Flaeche initialisiert wird (aktuelle Unterschrift).
  const fsInitRef = useRef<string | undefined>(undefined)
  // Vollbild-Flaeche in CSS-Pixeln (fuer Platzhalter-Positionierung).
  const [fsSize, setFsSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  // Latest props captured in refs so the mount-only effect can read the
  // current value without listing them as deps (which would cause clears).
  const initialValueRef = useRef(initialValue)
  const widthRef = useRef(width)
  const heightRef = useRef(height)
  useEffect(() => { initialValueRef.current = initialValue }, [initialValue])
  useEffect(() => { widthRef.current = width }, [width])
  useEffect(() => { heightRef.current = height }, [height])

  // Set up canvas ONCE every time we enter draw mode. The deps deliberately
  // only contain `mode` — see note above.
  useEffect(() => {
    if (mode !== 'draw') return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const w = widthRef.current
    const h = heightRef.current
    const iv = initialValueRef.current

    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr
    c.height = h * dpr
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111111'

    if (iv) {
      const img = new Image()
      img.onload = () => {
        if (drawingRef.current) return
        ctx.drawImage(img, 0, 0, w, h)
        setCanvasHasContent(true)
      }
      img.onerror = () => {
        console.warn('[SignaturePad] could not load initial signature into canvas')
      }
      img.src = iv
    } else {
      setCanvasHasContent(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Set up the fullscreen canvas whenever the overlay opens. Initialises from
  // the current signature (fsInitRef), drawn with preserved aspect ratio.
  useEffect(() => {
    if (!fullscreen) return
    const c = fsCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const w = Math.max(320, window.innerWidth - 80)
    const h = Math.max(240, window.innerHeight - 200)
    setFsSize({ w, h })

    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr
    c.height = h * dpr
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111111'

    const iv = fsInitRef.current
    if (iv) {
      const img = new Image()
      img.onload = () => {
        if (drawingRef.current) return
        // contain: Seitenverhaeltnis der bestehenden Unterschrift erhalten
        const iw = img.naturalWidth || w
        const ih = img.naturalHeight || h
        const scale = Math.min(w / iw, h / ih)
        const dw = iw * scale
        const dh = ih * scale
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
        setCanvasHasContent(true)
      }
      img.onerror = () => { /* leere Flaeche behalten */ }
      img.src = iv
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreen])

  function pointFromEvent(c: HTMLCanvasElement | null, e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null {
    if (!c) return null
    const rect = c.getBoundingClientRect()
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0]
      if (!t) return null
      return { x: t.clientX - rect.left, y: t.clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function start(c: HTMLCanvasElement | null, e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const p = pointFromEvent(c, e)
    if (!p) return
    drawingRef.current = true
    lastRef.current = p
  }
  function move(c: HTMLCanvasElement | null, e: React.MouseEvent | React.TouchEvent) {
    if (!drawingRef.current) return
    const p = pointFromEvent(c, e)
    if (!p) return
    const ctx = c?.getContext('2d')
    if (!ctx) return
    const from = lastRef.current ?? p
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastRef.current = p
  }
  function end(c: HTMLCanvasElement | null) {
    if (!drawingRef.current) return
    drawingRef.current = false
    lastRef.current = null
    if (!c) return
    const dataUrl = c.toDataURL('image/png')
    setCanvasHasContent(true)
    onChange?.(dataUrl)
  }
  function clearCanvasEl(c: HTMLCanvasElement | null) {
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    // In CSS-Pixeln loeschen: Kontext ist bereits mit dpr skaliert.
    const dpr = window.devicePixelRatio || 1
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width / dpr, c.height / dpr)
    setCanvasHasContent(false)
    onChange?.(null)
  }

  // Vollbild oeffnen: aktuelle Unterschrift als Startbild merken.
  function openFullscreen() {
    let src = initialValueRef.current
    const c = canvasRef.current
    if (mode === 'draw' && c && canvasHasContent) {
      try { src = c.toDataURL('image/png') } catch { /* fallback bleibt */ }
    }
    fsInitRef.current = src
    setFullscreen(true)
  }
  // Vollbild schliessen: Inline-Pad passend zum Ergebnis anzeigen.
  function closeFullscreen() {
    setFullscreen(false)
    setImgFailed(false)
    setMode(canvasHasContent ? 'view' : 'draw')
  }

  // ── Vollbild-Button (oben rechts ueber dem Feld) ──────────────────────────
  const FullscreenButton = (
    <div className="flex justify-end mb-1">
      <button
        type="button"
        onClick={openFullscreen}
        title="Unterschriftenfeld auf Vollbild vergrößern"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/30"
      >
        <Maximize2 size={11} />Vollbild
      </button>
    </div>
  )

  // ── Vollbild-Overlay ──────────────────────────────────────────────────────
  const fullscreenOverlay = fullscreen ? (
    <div className="fixed inset-0 z-[60] bg-black/70 flex flex-col p-5">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-sm font-semibold text-white inline-flex items-center gap-2">
          <Edit3 size={14} />Unterschrift — Vollbild
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => clearCanvasEl(fsCanvasRef.current)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-white/10 text-white hover:bg-white/20 text-xs"
          >
            <Eraser size={13} />Löschen
          </button>
          <button
            type="button"
            onClick={closeFullscreen}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-medium"
          >
            <Check size={13} />Fertig
          </button>
          <button
            type="button"
            onClick={closeFullscreen}
            title="Schließen"
            className="p-1.5 rounded-md bg-white/10 text-white hover:bg-white/20"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div className="relative border-2 border-dashed border-white/40 rounded-lg bg-white">
          <canvas
            ref={fsCanvasRef}
            onMouseDown={e => start(fsCanvasRef.current, e)}
            onMouseMove={e => move(fsCanvasRef.current, e)}
            onMouseUp={() => end(fsCanvasRef.current)}
            onMouseLeave={() => end(fsCanvasRef.current)}
            onTouchStart={e => start(fsCanvasRef.current, e)}
            onTouchMove={e => move(fsCanvasRef.current, e)}
            onTouchEnd={() => end(fsCanvasRef.current)}
            className="block touch-none cursor-crosshair rounded-lg"
          />
          {!canvasHasContent && fsSize.w > 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-sm italic">
              Hier mit Stift, Maus oder Touchpad unterschreiben
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null

  // ── View mode: existing signature as <img> ────────────────────────────────
  if (mode === 'view') {
    return (
      <div className="inline-block">
        {FullscreenButton}
        <div
          className="relative inline-block border-2 border-dashed border-border rounded-md bg-white overflow-hidden"
          style={{ width, height }}
        >
          {initialValue && !imgFailed ? (
            <img
              src={initialValue}
              alt=""
              draggable={false}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain' }}
              onError={() => {
                console.warn('[SignaturePad] saved signature could not be displayed as <img>. URL length:', initialValue?.length, 'prefix:', initialValue?.slice(0, 60))
                setImgFailed(true)
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs italic">
              {initialValue ? 'Unterschrift konnte nicht angezeigt werden — bitte neu erstellen' : 'Noch keine Unterschrift'}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px]">
          <span className="text-emerald-400 inline-flex items-center gap-1">
            <Check size={11} />Unterschrift gespeichert
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMode('draw')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
            >
              <Edit3 size={11} />Neu unterschreiben
            </button>
            <button
              type="button"
              onClick={() => { setImgFailed(false); onChange?.(null) }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
            >
              <Eraser size={11} />Löschen
            </button>
          </div>
        </div>
        {fullscreenOverlay}
      </div>
    )
  }

  // ── Draw mode: canvas ────────────────────────────────────────────────────
  return (
    <div className="inline-block">
      {FullscreenButton}
      <div className="relative inline-block border-2 border-dashed border-border rounded-md bg-white">
        <canvas
          ref={canvasRef}
          onMouseDown={e => start(canvasRef.current, e)}
          onMouseMove={e => move(canvasRef.current, e)}
          onMouseUp={() => end(canvasRef.current)}
          onMouseLeave={() => end(canvasRef.current)}
          onTouchStart={e => start(canvasRef.current, e)}
          onTouchMove={e => move(canvasRef.current, e)}
          onTouchEnd={() => end(canvasRef.current)}
          className="block touch-none cursor-crosshair"
        />
        {!canvasHasContent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-xs italic">
            Hier mit der Maus oder Touchpad unterschreiben
          </div>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 text-[11px]">
        <span className="text-muted-foreground">
          {canvasHasContent
            ? <span className="text-emerald-400 inline-flex items-center gap-1"><Check size={11} />Unterschrift erfasst</span>
            : 'Noch keine Unterschrift'}
        </span>
        <div className="flex items-center gap-1">
          {initialValue && (
            <button
              type="button"
              onClick={() => setMode('view')}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
            >
              Abbrechen
            </button>
          )}
          <button
            type="button"
            onClick={() => clearCanvasEl(canvasRef.current)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent/30"
          >
            <Eraser size={11} />Löschen
          </button>
        </div>
      </div>
      {fullscreenOverlay}
    </div>
  )
}
