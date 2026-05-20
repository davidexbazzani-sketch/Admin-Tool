import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, X, Loader } from 'lucide-react'
import { loadConfigForPlayer, type Slide, type PresentationConfig } from '../services/presentationConfig'
import { api } from '../electronAPI'

// Electron <webview> typing — we treat it as an HTMLElement with extra methods.
type WebviewEl = HTMLElement & {
  src: string
  reload(): void
  setZoomFactor(factor: number): void
  getURL(): string
}

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string
        allowpopups?: string
        partition?: string
        // arbitrary string attributes are fine on this custom element
      }, HTMLElement>
    }
  }
}

const OVERLAY_HIDE_MS = 3000

export default function PresentationPlayer() {
  const [config, setConfig] = useState<PresentationConfig | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [remaining, setRemaining] = useState(0)
  const [overlayVisible, setOverlayVisible] = useState(true)
  const [loadingError, setLoadingError] = useState<string>('')

  const webviewRefs = useRef<Map<string, WebviewEl>>(new Map())
  const hideOverlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map())

  // Active slides only (filtered + valid URL)
  const activeSlides = useMemo<Slide[]>(() => {
    if (!config) return []
    return config.slides.filter(s => s.active && /^https?:\/\//i.test(s.url.trim()))
  }, [config])

  // Load config once
  useEffect(() => {
    (async () => {
      try {
        const cfg = await loadConfigForPlayer()
        setConfig(cfg)
        const active = cfg.slides.filter(s => s.active && /^https?:\/\//i.test(s.url.trim()))
        if (active.length > 0) {
          setRemaining(active[0].durationSec)
        }
      } catch (e) {
        setLoadingError(e instanceof Error ? e.message : 'Konfiguration konnte nicht geladen werden.')
      }
    })()
  }, [])

  // Tick down + advance
  useEffect(() => {
    if (paused || activeSlides.length === 0) return
    const t = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          advance(1)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [paused, activeSlides.length, currentIdx])

  // When current slide changes: reset countdown to that slide's duration
  useEffect(() => {
    if (activeSlides.length === 0) return
    const cur = activeSlides[currentIdx % activeSlides.length]
    setRemaining(cur.durationSec)
  }, [currentIdx, activeSlides])

  // Set up per-slide refresh intervals
  useEffect(() => {
    // Clear old timers
    refreshTimers.current.forEach(t => clearInterval(t))
    refreshTimers.current.clear()

    activeSlides.forEach(slide => {
      if (slide.refreshIntervalSec > 0) {
        const timer = setInterval(() => {
          const wv = webviewRefs.current.get(slide.id)
          if (wv) {
            try { wv.reload() } catch { /* ignore */ }
          }
        }, slide.refreshIntervalSec * 1000)
        refreshTimers.current.set(slide.id, timer)
      }
    })
    return () => {
      refreshTimers.current.forEach(t => clearInterval(t))
      refreshTimers.current.clear()
    }
  }, [activeSlides])

  // Apply zoom factor when webview is ready
  function applyZoom(slide: Slide) {
    const wv = webviewRefs.current.get(slide.id)
    if (wv) {
      try { wv.setZoomFactor(slide.zoom) } catch { /* not ready yet */ }
    }
  }

  // Hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        api().presentationClose().catch(() => {})
      } else if (e.key === ' ') {
        e.preventDefault()
        setPaused(p => !p)
        showOverlay()
      } else if (e.key === 'ArrowRight') {
        advance(1); showOverlay()
      } else if (e.key === 'ArrowLeft') {
        advance(-1); showOverlay()
      } else if (e.key === 'r' || e.key === 'R') {
        const cur = activeSlides[currentIdx]
        if (cur) {
          const wv = webviewRefs.current.get(cur.id)
          try { wv?.reload() } catch { /* ignore */ }
          showOverlay()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeSlides, currentIdx])

  // Show overlay on mouse move, then auto-hide
  useEffect(() => {
    function onMove() { showOverlay() }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  function showOverlay() {
    setOverlayVisible(true)
    if (hideOverlayTimer.current) clearTimeout(hideOverlayTimer.current)
    hideOverlayTimer.current = setTimeout(() => setOverlayVisible(false), OVERLAY_HIDE_MS)
  }

  function advance(delta: number) {
    setCurrentIdx(i => {
      if (activeSlides.length === 0) return 0
      return (i + delta + activeSlides.length) % activeSlides.length
    })
  }

  if (loadingError) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center text-center p-10">
        <div>
          <p className="text-xl">Fehler beim Laden der Präsentation</p>
          <p className="text-sm text-red-300 mt-2">{loadingError}</p>
          <button onClick={() => api().presentationClose()} className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm">Schließen</button>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center gap-2">
        <Loader size={18} className="animate-spin" /> Lade Slides...
      </div>
    )
  }

  if (activeSlides.length === 0) {
    return (
      <div className="fixed inset-0 bg-black text-white flex items-center justify-center text-center p-10">
        <div>
          <p className="text-xl">Keine aktiven Slides konfiguriert</p>
          <p className="text-sm text-white/60 mt-2">Bitte im Admin Tool unter "Präsentationsmodus" Slides anlegen und aktivieren.</p>
          <button onClick={() => api().presentationClose()} className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm">Schließen</button>
        </div>
      </div>
    )
  }

  const currentSlide = activeSlides[currentIdx % activeSlides.length]

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Preloaded webviews stacked, only current visible */}
      {activeSlides.map((slide, idx) => {
        const isCurrent = idx === (currentIdx % activeSlides.length)
        return (
          <webview
            key={slide.id}
            ref={(el: HTMLElement | null) => {
              if (el) {
                webviewRefs.current.set(slide.id, el as WebviewEl)
                el.addEventListener('dom-ready', () => applyZoom(slide), { once: true } as AddEventListenerOptions)
              } else {
                webviewRefs.current.delete(slide.id)
              }
            }}
            src={slide.url}
            allowpopups="true"
            partition="persist:presentation"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              opacity: isCurrent ? 1 : 0,
              pointerEvents: isCurrent ? 'auto' : 'none',
              transition: `opacity ${config.transitionMs}ms ease-in-out`,
              backgroundColor: '#000',
            }}
          />
        )
      })}

      {/* Bottom overlay: slide indicator + countdown + controls */}
      <div
        className={`fixed bottom-0 left-0 right-0 transition-opacity duration-300 ${
          overlayVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent px-6 pt-12 pb-4">
          <div className="max-w-5xl mx-auto flex items-center gap-4">
            {/* Slide info */}
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-medium truncate">
                {currentSlide.title || currentSlide.url}
              </p>
              <p className="text-white/60 text-xs truncate">{currentSlide.url}</p>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => advance(-1)} className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white" title="Zurück (←)">
                <SkipBack size={16} />
              </button>
              <button onClick={() => setPaused(p => !p)} className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white" title={paused ? 'Play (Leertaste)' : 'Pause (Leertaste)'}>
                {paused ? <Play size={16} /> : <Pause size={16} />}
              </button>
              <button onClick={() => advance(1)} className="p-2 rounded-md bg-white/10 hover:bg-white/20 text-white" title="Vor (→)">
                <SkipForward size={16} />
              </button>
              <div className="w-px h-6 bg-white/20 mx-1" />
              <button onClick={() => api().presentationClose()} className="p-2 rounded-md bg-white/10 hover:bg-red-500/40 text-white" title="Beenden (ESC)">
                <X size={16} />
              </button>
            </div>

            {/* Countdown */}
            <div className="text-white text-sm font-mono tabular-nums w-14 text-right">
              {paused ? '⏸' : `${remaining}s`}
            </div>
          </div>

          {/* Progress dots */}
          <div className="max-w-5xl mx-auto mt-3 flex items-center justify-center gap-1.5">
            {activeSlides.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentIdx(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === (currentIdx % activeSlides.length)
                    ? 'w-8 bg-white'
                    : 'w-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
