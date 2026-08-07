import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward, X, Loader } from 'lucide-react'
import {
  resolvePlayerConfig, detectSlideMediaType, slideSrcUrl, isPlayableSlide, activeSlideUrl,
  localHtmlFsPath,
  type Slide, type PresentationConfig, type TransitionType,
} from '../services/presentationConfig'
import { writeHeartbeat, clearHeartbeat, HEARTBEAT_INTERVAL_MS } from '../services/presentationClients'
import { readClientPush, type RemotePush } from '../services/presentationRemote'
import { api } from '../electronAPI'

const CONFIG_POLL_MS = 12_000   // how often the player checks for config updates (live edit)
const PUSH_POLL_MS = 4_000      // how often the player checks for a remote live-push

// Electron <webview> typing — we treat it as an HTMLElement with extra methods.
type WebviewEl = HTMLElement & {
  src: string
  reload(): void
  setZoomFactor(factor: number): void
  getURL(): string
  executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>
}

// ── ServiceNow "Sitzung abgelaufen" automatisch wegklicken ────────────────────
// ServiceNow-Dashboards verlangen nach ~2-3 h einen erneuten Login (Dialog
// "Your session has expired. Please login again." mit "Log In"-Button). Ein
// einziger Klick auf den Button reicht (SSO meldet still neu an). Wir injizieren
// dieses Skript regelmaessig in JEDE Folie — es klickt NUR, wenn der Ablauf-
// Dialog wirklich sichtbar ist (Text "expired"/"abgelaufen"). Auf allen anderen
// Folien und auf ServiceNow-Folien ohne Dialog passiert garantiert NICHTS.
// Laeuft im Seiten-Kontext des <webview>, daher kein CORS/CSP-Problem.
const SN_KEEPALIVE_JS = `(function(){
  try {
    function isExpired(doc){
      var t = ((doc.body && doc.body.innerText) || '').toLowerCase();
      return t.indexOf('session has expired') !== -1
          || t.indexOf('login session has expired') !== -1
          || t.indexOf('sitzung ist abgelaufen') !== -1
          || t.indexOf('sitzung abgelaufen') !== -1
          || (t.indexOf('expired') !== -1 && t.indexOf('log in') !== -1)
          || (t.indexOf('abgelaufen') !== -1 && t.indexOf('anmelden') !== -1);
    }
    function robustClick(e){
      try {
        var r = e.getBoundingClientRect();
        var cx = r.left + r.width/2, cy = r.top + r.height/2;
        var opts = { bubbles:true, cancelable:true, view:window, clientX:cx, clientY:cy };
        e.dispatchEvent(new MouseEvent('mousedown', opts));
        e.dispatchEvent(new MouseEvent('mouseup', opts));
        e.dispatchEvent(new MouseEvent('click', opts));
      } catch(_){}
      try { e.click(); } catch(_){}
    }
    function tryDoc(doc){
      if (!doc) return false;
      if (isExpired(doc)){
        var els = doc.querySelectorAll('button, a, [role=button], input[type=button], input[type=submit], now-button, .btn');
        for (var i=0;i<els.length;i++){
          var el = els[i];
          var label = ((el.innerText || el.textContent || el.value || el.getAttribute('aria-label') || '') + '').trim().toLowerCase();
          if (label === 'log in' || label === 'login' || label === 'log in again'
              || label === 'anmelden' || label === 'erneut anmelden' || label === 'neu anmelden'){
            robustClick(el);
            return true;
          }
        }
      }
      // In gleich-originige iFrames absteigen (ServiceNow-Reports laufen dort)
      var frames = doc.querySelectorAll('iframe, frame');
      for (var j=0;j<frames.length;j++){
        try { if (tryDoc(frames[j].contentDocument)) return true; } catch(_){}
      }
      return false;
    }
    return tryDoc(document);
  } catch(_){ return false; }
})();`

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

// Base64 (UTF-8 Bytes) → Text, fuer das Einlesen lokaler HTML-Dateien.
function decodeBase64Utf8(b64: string): string {
  try {
    const bin = atob(b64)
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
    return new TextDecoder('utf-8').decode(bytes)
  } catch {
    return ''
  }
}

// ── Slide transition styles ──────────────────────────────────────────────────
// Returns the inline style for a slide based on whether it is the current
// slide, the previously-visible slide (= the one fading/animating out), or
// just one of the preloaded but inactive ones.

type SlidePhase = 'current' | 'leaving' | 'idle'

function slideTransitionStyle(
  phase: SlidePhase,
  type: TransitionType,
  durationMs: number,
): React.CSSProperties {
  const dur = `${durationMs}ms`
  const base: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
    backfaceVisibility: 'hidden',
  }

  if (type === 'fade') {
    return {
      ...base,
      opacity: phase === 'current' ? 1 : 0,
      pointerEvents: phase === 'current' ? 'auto' : 'none',
      transition: `opacity ${dur} ease-in-out`,
    }
  }

  if (type === 'cinematic') {
    // current = scale 1 / x=0; leaving = scale 0.92 / x=-10%; idle = scale 1 / x=100%
    let transform = 'translateX(100%) scale(1)'
    if (phase === 'current') transform = 'translateX(0) scale(1)'
    else if (phase === 'leaving') transform = 'translateX(-8%) scale(0.92)'
    return {
      ...base,
      opacity: phase === 'idle' ? 0 : phase === 'leaving' ? 0 : 1,
      transform,
      pointerEvents: phase === 'current' ? 'auto' : 'none',
      transition: phase === 'idle' ? 'none' : `transform ${dur} cubic-bezier(.4,0,.2,1), opacity ${dur} ease-in-out`,
    }
  }

  if (type === 'cube') {
    let transform = 'rotateY(90deg)'
    if (phase === 'current') transform = 'rotateY(0deg)'
    else if (phase === 'leaving') transform = 'rotateY(-90deg)'
    return {
      ...base,
      opacity: phase === 'idle' ? 0 : 1,
      transform,
      transformOrigin: 'center center',
      pointerEvents: phase === 'current' ? 'auto' : 'none',
      transition: phase === 'idle' ? 'none' : `transform ${dur} cubic-bezier(.4,0,.2,1), opacity ${dur} ease-in-out`,
    }
  }

  if (type === 'flip') {
    let transform = 'rotateY(-180deg)'
    if (phase === 'current') transform = 'rotateY(0deg)'
    else if (phase === 'leaving') transform = 'rotateY(180deg)'
    return {
      ...base,
      opacity: phase === 'idle' ? 0 : 1,
      transform,
      transformOrigin: 'center center',
      pointerEvents: phase === 'current' ? 'auto' : 'none',
      transition: phase === 'idle' ? 'none' : `transform ${dur} cubic-bezier(.55,0,.45,1), opacity ${dur} ease-in-out`,
    }
  }

  if (type === 'circle') {
    let clipPath = 'circle(0% at 50% 50%)'
    if (phase === 'current') clipPath = 'circle(150% at 50% 50%)'
    else if (phase === 'leaving') clipPath = 'circle(150% at 50% 50%)'
    return {
      ...base,
      opacity: phase === 'leaving' ? 0 : phase === 'idle' ? 0 : 1,
      clipPath,
      WebkitClipPath: clipPath,
      pointerEvents: phase === 'current' ? 'auto' : 'none',
      transition: phase === 'idle' ? 'none'
        : phase === 'leaving' ? `opacity ${dur} ease-in-out`
        : `clip-path ${dur} cubic-bezier(.45,.05,.55,.95), opacity 150ms`,
    }
  }

  if (type === 'blur') {
    return {
      ...base,
      opacity: phase === 'current' ? 1 : 0,
      filter: phase === 'current' ? 'blur(0px)' : 'blur(20px)',
      pointerEvents: phase === 'current' ? 'auto' : 'none',
      transition: phase === 'idle' ? 'none' : `filter ${dur} ease-in-out, opacity ${dur} ease-in-out`,
    }
  }

  // unknown → fall back to fade
  return {
    ...base,
    opacity: phase === 'current' ? 1 : 0,
    pointerEvents: phase === 'current' ? 'auto' : 'none',
    transition: `opacity ${dur} ease-in-out`,
  }
}

// ── Status bar (clock + date) ────────────────────────────────────────────────

function StatusBar({ position }: { position: 'top' | 'bottom' }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const weekday = now.toLocaleDateString('de-DE', { weekday: 'long' })
  const date = now.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
  const isTop = position === 'top'
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        [isTop ? 'top' : 'bottom']: 0,
        zIndex: 40,
        pointerEvents: 'none',
        padding: '14px 32px',
        background: isTop
          ? 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)'
          : 'linear-gradient(0deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%)',
        color: 'rgba(255,255,255,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 24,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
        letterSpacing: '0.01em',
        textShadow: '0 2px 8px rgba(0,0,0,0.6)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 18, fontWeight: 500, opacity: 0.85 }}>{weekday}</span>
        <span style={{ fontSize: 22, fontWeight: 600 }}>{date}</span>
      </div>
      <div style={{ fontSize: 56, fontWeight: 200, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {time}
      </div>
    </div>
  )
}

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

  // Remote live-push: ein vom Master-Admin aus der Ferne eingeblendeter Inhalt,
  // der die laufende Praesentation voruebergehend ueberlagert (Vollbild).
  const [livePush, setLivePush] = useState<RemotePush | null>(null)
  const handledPushId = useRef<string>('')
  const pushExpiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Lokale/UNC HTML-Dateien koennen vom <webview> nicht ueber file:// geladen
  // werden (Folie bleibt schwarz). Wir lesen den Inhalt ein und zeigen ihn als
  // data:-URL. Cache: Dateipfad → data-URL.
  const [htmlData, setHtmlData] = useState<Record<string, string>>({})
  const htmlLoadingRef = useRef<Set<string>>(new Set())

  // Client identity (Windows username + hostname) — written into each heartbeat
  // so the master-admin overview can list this kiosk and address it directly.
  const identityRef = useRef<{ username: string; displayUsername: string; hostname: string } | null>(null)
  const lastConfigStamp = useRef<string>('')
  // Vorschau-Modus: Editor hat eine bestimmte Playlist zum Ansehen uebergeben.
  const previewIdRef = useRef<string>(new URLSearchParams(window.location.search).get('preview') || '')
  // Name der aktuell gezeigten Playlist/Konfiguration (fuer den Heartbeat).
  const playlistNameRef = useRef<string>('')

  // Active slides only (filtered + valid URL/path)
  const activeSlides = useMemo<Slide[]>(() => {
    if (!config) return []
    return config.slides.filter(isPlayableSlide)
  }, [config])

  // Rotation clock: Folien mit Wechsel-Inhalten (rotation) tauschen ihre URL
  // zeitgesteuert. Der aktive Inhalt wird deterministisch aus Startzeitpunkt +
  // Rhythmus berechnet — läuft komplett auf diesem PC, kein Admin-PC nötig.
  const [rotationNow, setRotationNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setRotationNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Lokale/UNC HTML-Dateien einlesen und als data:-URL cachen (sowohl fuer
  // Folien als auch fuer einen Live-Push). http(s)-HTML laedt das webview
  // normal und wird hier uebersprungen.
  useEffect(() => {
    const candidates: string[] = []
    for (const s of activeSlides) {
      const p = localHtmlFsPath(activeSlideUrl(s, rotationNow))
      if (p) candidates.push(p)
    }
    if (livePush?.url) { const p = localHtmlFsPath(livePush.url); if (p) candidates.push(p) }

    for (const p of candidates) {
      if (htmlData[p] || htmlLoadingRef.current.has(p)) continue
      htmlLoadingRef.current.add(p)
      api().readFile(p)
        .then(r => {
          if (r.success && r.data) {
            const html = decodeBase64Utf8(r.data)
            if (html) setHtmlData(prev => ({ ...prev, [p]: html }))
          }
        })
        .catch(() => { /* offline / nicht lesbar → bleibt leer */ })
        .finally(() => { htmlLoadingRef.current.delete(p) })
    }
  }, [activeSlides, rotationNow, livePush, htmlData])

  // Initial: detect identity, load config (with per-user override resolution)
  useEffect(() => {
    (async () => {
      try {
        let username = ''
        let hostname = ''
        try { username = (await api().getWindowsUsername()) ?? '' } catch {}
        try { hostname = (await api().getHostname()) ?? '' } catch {}
        identityRef.current = { username, displayUsername: username, hostname }

        const r = await resolvePlayerConfig(username, previewIdRef.current || undefined)
        const cfg = r.config
        playlistNameRef.current = r.playlistName ?? ''
        setConfig(cfg)
        lastConfigStamp.current = `${r.source}|${cfg.lastModified}`
        const active = cfg.slides.filter(isPlayableSlide)
        if (active.length > 0) setRemaining(active[0].durationSec)
      } catch (e) {
        setLoadingError(e instanceof Error ? e.message : 'Konfiguration konnte nicht geladen werden.')
      }
    })()
  }, [])

  // Live-reload: every 30s check whether the (resolved) config has changed and,
  // if so, apply it immediately. Keeps the player in sync with master-admin
  // edits without requiring a restart.
  useEffect(() => {
    const t = setInterval(async () => {
      const id = identityRef.current
      try {
        const r = await resolvePlayerConfig(id?.username, previewIdRef.current || undefined)
        playlistNameRef.current = r.playlistName ?? ''
        // Stamp inkl. Quelle: erkennt auch einen Quellenwechsel (z.B. zentral -> User-Override),
        // selbst wenn lastModified zufaellig gleich waere.
        const stamp = `${r.source}|${r.config.lastModified}`
        if (stamp !== lastConfigStamp.current) {
          lastConfigStamp.current = stamp
          setConfig(r.config)
        }
      } catch { /* offline → keep current */ }
    }, CONFIG_POLL_MS)
    return () => clearInterval(t)
  }, [])

  // Remote live-push poll: every few seconds check whether the master admin
  // has pushed an ad-hoc content to THIS kiosk. A new (active) push is shown
  // immediately as a fullscreen takeover; after its duration (or when the admin
  // stops it) the normal presentation resumes.
  useEffect(() => {
    let alive = true
    async function tick() {
      const id = identityRef.current
      if (!id?.username) return
      let push: RemotePush | null = null
      try { push = await readClientPush(id.username) } catch { return }
      if (!alive) return
      if (!push || !push.active || !push.url) {
        // Beendet / keiner hinterlegt → Overlay ausblenden
        if (pushExpiryTimer.current) { clearTimeout(pushExpiryTimer.current); pushExpiryTimer.current = null }
        setLivePush(prev => (prev ? null : prev))
        return
      }
      if (push.id === handledPushId.current) return  // diesen Push schon behandelt
      // Bei begrenzter Dauer: bereits abgelaufene Pushes (z. B. wenn der Player
      // spaeter startet) nicht erneut einblenden.
      const elapsedMs = push.pushedAt ? Date.now() - Date.parse(push.pushedAt) : 0
      const totalMs = push.durationSec > 0 ? push.durationSec * 1000 : 0
      if (totalMs > 0 && Number.isFinite(elapsedMs) && elapsedMs >= totalMs) {
        handledPushId.current = push.id
        return
      }
      handledPushId.current = push.id
      if (pushExpiryTimer.current) { clearTimeout(pushExpiryTimer.current); pushExpiryTimer.current = null }
      setLivePush(push)
      if (totalMs > 0) {
        const remaining = Number.isFinite(elapsedMs) ? Math.max(1000, totalMs - elapsedMs) : totalMs
        pushExpiryTimer.current = setTimeout(() => {
          setLivePush(prev => (prev && prev.id === push!.id ? null : prev))
        }, remaining)
      }
    }
    void tick()
    const t = setInterval(tick, PUSH_POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
      if (pushExpiryTimer.current) { clearTimeout(pushExpiryTimer.current); pushExpiryTimer.current = null }
    }
  }, [])

  // Heartbeat: write our state to the network share every 30s so the master
  // admin sees this kiosk as "online" + which slide is currently shown.
  useEffect(() => {
    async function beat() {
      const id = identityRef.current
      if (!id || !id.username) return
      const cur = activeSlides[currentIdx % Math.max(activeSlides.length, 1)]
      try {
        await writeHeartbeat({
          username: id.username,
          displayUsername: id.displayUsername,
          hostname: id.hostname,
          currentSlideIndex: activeSlides.length > 0 ? currentIdx % activeSlides.length : undefined,
          totalSlides: activeSlides.length,
          slideTitle: cur?.title || undefined,
          slideUrl: cur ? (activeSlideUrl(cur, new Date()) || undefined) : undefined,
          playlistName: playlistNameRef.current || undefined,
        })
      } catch { /* ok */ }
    }
    void beat() // first beat immediately
    const t = setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => {
      clearInterval(t)
      // Best-effort: clear our heartbeat on unmount so the master doesn't see
      // us as online when this player is closed.
      const id = identityRef.current
      if (id?.username) void clearHeartbeat(id.username)
    }
  }, [activeSlides, currentIdx])

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

  // Per-slide refresh (image src cache-bust or webview reload)
  const imageRefs = useRef<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    refreshTimers.current.forEach(t => clearInterval(t))
    refreshTimers.current.clear()

    activeSlides.forEach(slide => {
      if (slide.refreshIntervalSec > 0) {
        const timer = setInterval(() => {
          const effUrl = activeSlideUrl(slide, new Date())
          const type = detectSlideMediaType(effUrl)
          if (type === 'image') {
            const img = imageRefs.current.get(slide.id)
            if (img) {
              const base = slideSrcUrl(effUrl)
              const sep = base.includes('?') ? '&' : '?'
              try { img.src = `${base}${sep}_t=${Date.now()}` } catch {}
            }
          } else {
            const wv = webviewRefs.current.get(slide.id)
            if (wv) { try { wv.reload() } catch {} }
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

  // ServiceNow Auto-Login: alle 8s in JEDER Folie den evtl. sichtbaren
  // "Sitzung abgelaufen"-Dialog wegklicken — nur wenn in dieser Praesentation
  // aktiviert. Das injizierte Skript klickt ausschliesslich, wenn der Dialog
  // wirklich da ist, sonst passiert nichts (auch nicht auf Nicht-SN-Folien).
  useEffect(() => {
    if (!config?.serviceNowAutoLogin) return
    const fire = () => {
      webviewRefs.current.forEach(wv => {
        try { void wv.executeJavaScript(SN_KEEPALIVE_JS).catch(() => {}) } catch { /* webview noch nicht bereit */ }
      })
    }
    const t = setInterval(fire, 8000)
    return () => clearInterval(t)
  }, [config?.serviceNowAutoLogin])

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

  // Track the previously-shown slide so the leaving slide can animate out
  // (necessary for cube/flip/circle/cinematic — fade alone wouldn't need it).
  const [previousIdx, setPreviousIdx] = useState<number | null>(null)
  function advance(delta: number) {
    setCurrentIdx(i => {
      if (activeSlides.length === 0) return 0
      const next = (i + delta + activeSlides.length) % activeSlides.length
      setPreviousIdx(i)
      return next
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

  const pushType = livePush ? detectSlideMediaType(livePush.url) : 'unknown'
  const pushLocalHtml = livePush ? localHtmlFsPath(livePush.url) : null
  const pushHtml = pushLocalHtml ? htmlData[pushLocalHtml] : undefined
  const pushSrc = livePush ? slideSrcUrl(livePush.url) : ''

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* 3D-aware stage for cube/flip transitions; harmless for other types */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          perspective: '1500px',
          transformStyle: 'preserve-3d',
          overflow: 'hidden',
        }}
      >
        {activeSlides.map((slide, idx) => {
          const currentMod = currentIdx % activeSlides.length
          const isCurrent = idx === currentMod
          const isLeaving = previousIdx != null && idx === (previousIdx % activeSlides.length) && !isCurrent
          const phase: SlidePhase = isCurrent ? 'current' : isLeaving ? 'leaving' : 'idle'
          const txType = config.transitionType ?? 'fade'
          const baseStyle = slideTransitionStyle(phase, txType, config.transitionMs)
          // Rotation: bei Folien mit Wechsel-Inhalten die gerade gültige URL anzeigen
          const effectiveUrl = activeSlideUrl(slide, rotationNow)
          const type = detectSlideMediaType(effectiveUrl)
          const localHtml = localHtmlFsPath(effectiveUrl)
          const src = slideSrcUrl(effectiveUrl)

          // Lokale/UNC HTML: als <iframe srcdoc> anzeigen. Chromium blockiert
          // Top-Level-Navigation zu file:// und data:-HTML im <webview> (Folie
          // bliebe schwarz) — srcdoc rendert das Dokument inline.
          if (localHtml) {
            const html = htmlData[localHtml]
            return (
              <div key={slide.id} style={baseStyle}>
                {html ? (
                  <iframe
                    title={slide.title || 'HTML'}
                    srcDoc={html}
                    style={{
                      position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0,
                      backgroundColor: '#fff',
                      transform: slide.zoom !== 1 ? `scale(${slide.zoom})` : undefined,
                      transformOrigin: 'center center',
                    }}
                  />
                ) : null}
              </div>
            )
          }

          if (type === 'image') {
            return (
              <div key={slide.id} style={baseStyle}>
                <img
                  ref={(el) => {
                    if (el) imageRefs.current.set(slide.id, el)
                    else imageRefs.current.delete(slide.id)
                  }}
                  src={src}
                  alt={slide.title}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    transform: slide.zoom !== 1 ? `scale(${slide.zoom})` : undefined,
                    transformOrigin: 'center center',
                  }}
                  draggable={false}
                />
              </div>
            )
          }
          // url + pdf: webview (Chromium has built-in PDF viewer)
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
              src={src}
              allowpopups="true"
              partition="persist:presentation"
              style={baseStyle}
            />
          )
        })}
      </div>

      {/* Remote live-push overlay: ueberlagert die Praesentation im Vollbild */}
      {livePush && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30, backgroundColor: '#000' }}>
          {pushLocalHtml ? (
            // Lokale/UNC HTML als Inline-Dokument (srcdoc) — siehe Folien oben.
            pushHtml ? (
              <iframe
                title={livePush.title || 'HTML'}
                srcDoc={pushHtml}
                style={{
                  position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0,
                  backgroundColor: '#fff',
                  transform: livePush.zoom !== 1 ? `scale(${livePush.zoom})` : undefined,
                  transformOrigin: 'center center',
                }}
              />
            ) : null
          ) : pushType === 'image' ? (
            <img
              src={pushSrc}
              alt={livePush.title}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'contain',
                transform: livePush.zoom !== 1 ? `scale(${livePush.zoom})` : undefined,
                transformOrigin: 'center center',
              }}
              draggable={false}
            />
          ) : (
            <webview
              key={`push_${livePush.id}`}
              ref={(el: HTMLElement | null) => {
                if (el) {
                  const z = livePush.zoom
                  el.addEventListener('dom-ready', () => {
                    try { (el as WebviewEl).setZoomFactor(z) } catch { /* not ready */ }
                  }, { once: true } as AddEventListenerOptions)
                }
              }}
              src={pushSrc}
              allowpopups="true"
              partition="persist:presentation"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', backgroundColor: '#000' }}
            />
          )}
          <div
            style={{
              position: 'absolute', top: 14, right: 16, zIndex: 31,
              background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.92)',
              padding: '5px 12px', borderRadius: 10, fontSize: 13,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif',
              textShadow: '0 1px 4px rgba(0,0,0,0.6)', pointerEvents: 'none',
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
            Live{livePush.title ? ` · ${livePush.title}` : ''}{livePush.pushedBy ? ` · ${livePush.pushedBy}` : ''}
          </div>
        </div>
      )}

      {/* Optional status bar (clock + date) */}
      {config.statusBar === 'top' && <StatusBar position="top" />}
      {config.statusBar === 'bottom' && <StatusBar position="bottom" />}

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
                {currentSlide.title || activeSlideUrl(currentSlide, rotationNow)}
              </p>
              <p className="text-white/60 text-xs truncate">{activeSlideUrl(currentSlide, rotationNow)}</p>
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
