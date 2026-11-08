// ── Video-Folie im Präsentationsmodus ────────────────────────────────────────
// MP4/WebM direkt mit <video> abspielen. Das <webview> kann lokale/UNC-Dateien nicht laden
// (file:// ist dort blockiert), das Player-Fenster selbst schon (es läuft im Build als file://).
//
// Verhalten:
//   • spielt NUR, solange die Folie sichtbar ist; beim nächsten Mal wieder von vorn
//   • Standard stumm (Flur-TV); mit Ton: blockiert Chromium den Ton, läuft es stumm weiter
//   • bisEnde: Folie wechselt, wenn das Video zu Ende ist — sonst Schleife bis die Dauer um ist
//   • Fehler (Datei fehlt, Format z. B. HEVC/iPhone) → Hinweis auf der Folie, nach 10 s weiter,
//     damit ein unbeaufsichtigter Bildschirm nie hängen bleibt. Ebenso, wenn das Video 30 s
//     lang nicht vorankommt (Netz hängt).

import { useEffect, useRef, useState, type CSSProperties } from 'react'

export const FEHLER_WEITER_MS = 10_000
export const HAENGT_MS = 30_000

export interface VideoFolieProps {
  src: string
  titel?: string
  /** Folie ist gerade sichtbar */
  aktiv: boolean
  /** Zählt bei jedem Folienwechsel hoch — startet das Video neu, auch bei nur einer Folie */
  durchlauf: number
  pausiert: boolean
  ton: boolean
  /** true = Folie wechselt nach dem Ende; false = Schleife */
  bisEnde: boolean
  zoom: number
  style: CSSProperties
  /** Video zu Ende (oder Fehler / hängt) — nur bei bisEnde */
  onEnde: () => void
  /** Restzeit in Sekunden (für die Anzeige im Player) */
  onRest?: (sek: number) => void
}

/** Fehlertext zu einem MediaError (rein, testbar). */
export function videoFehlerText(code: number | undefined, ohneBild = false): string {
  if (ohneBild) return 'Das Video hat keine abspielbare Bildspur — vermutlich HEVC (iPhone). Bitte als MP4 (H.264) speichern.'
  if (code === 4) return 'Video kann nicht abgespielt werden — Datei nicht gefunden oder Format nicht unterstützt (z. B. HEVC/iPhone, ProRes). Bitte als MP4 (H.264) speichern.'
  if (code === 2) return 'Video konnte nicht geladen werden (Netzwerkfehler).'
  if (code === 3) return 'Video ist beschädigt oder unvollständig.'
  return 'Video kann nicht abgespielt werden.'
}

export default function VideoFolie({ src, titel, aktiv, durchlauf, pausiert, ton, bisEnde, zoom, style, onEnde, onRest }: VideoFolieProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [fehler, setFehler] = useState('')
  const [stummWeil, setStummWeil] = useState(false)
  const fortschritt = useRef(Date.now())
  const endeGemeldet = useRef(false)
  // aktuelle Rückrufe ohne die Effekte neu anzustoßen
  const cb = useRef({ onEnde, onRest })
  cb.current = { onEnde, onRest }

  function starte(v: HTMLVideoElement) {
    v.muted = !ton
    const p = v.play()
    if (p) p.catch(() => {
      // Chromium blockiert Ton ohne Klick → stumm weiterspielen statt schwarz zu bleiben
      if (!v.muted) { v.muted = true; setStummWeil(true); v.play().catch(() => { /* Fehler meldet onError */ }) }
    })
  }

  function melde() {
    if (endeGemeldet.current || !bisEnde) return
    endeGemeldet.current = true
    cb.current.onEnde()
  }

  // Sichtbar → von vorn starten; unsichtbar → anhalten
  useEffect(() => {
    const v = ref.current
    if (!v) return
    endeGemeldet.current = false
    if (!aktiv) { v.pause(); return }
    fortschritt.current = Date.now()
    // Beim letzten Mal ging es nicht (z. B. Netz kurz weg) → jetzt neu laden und erneut versuchen
    if (fehler) { setFehler(''); try { v.load() } catch { /* egal */ } }
    try { v.currentTime = 0 } catch { /* noch keine Metadaten */ }
    if (!pausiert) starte(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, durchlauf])

  // Pause/Weiter aus dem Player (Leertaste)
  useEffect(() => {
    const v = ref.current
    if (!v || !aktiv || fehler) return
    if (pausiert) v.pause()
    else { fortschritt.current = Date.now(); starte(v) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausiert])

  // Neue Datei → Fehler zurücksetzen
  useEffect(() => { setFehler(''); setStummWeil(false) }, [src])

  // Fehler oder Hänger: nach kurzer Zeit weiter (nur bei „bis zum Ende"; in der Schleife
  // wechselt ohnehin der Zeitgeber des Players)
  useEffect(() => {
    if (!aktiv || pausiert || !bisEnde) return
    if (fehler) {
      const t = setTimeout(melde, FEHLER_WEITER_MS)
      return () => clearTimeout(t)
    }
    const t = setInterval(() => { if (Date.now() - fortschritt.current > HAENGT_MS) melde() }, 5000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, pausiert, bisEnde, fehler, durchlauf])

  return (
    <div style={style} data-video-folie={aktiv ? 'aktiv' : 'still'}>
      <video
        ref={ref}
        src={src}
        title={titel}
        preload={aktiv ? 'auto' : 'metadata'}
        playsInline
        loop={!bisEnde}
        muted={!ton}
        onTimeUpdate={e => {
          const v = e.currentTarget
          fortschritt.current = Date.now()
          // Restzeit NUR bei „bis zum Ende" — in der Schleife zählt der Zeitgeber des Players
          // (sonst setzt jede Runde des Videos dessen Countdown zurück und die Folie wechselt nie)
          if (aktiv && bisEnde && Number.isFinite(v.duration) && v.duration > 0) cb.current.onRest?.(Math.max(0, Math.ceil(v.duration - v.currentTime)))
        }}
        onLoadedMetadata={e => {
          const v = e.currentTarget
          fortschritt.current = Date.now()
          // Ton läuft, Bild nicht (Chromium kann HEVC nicht): ehrlich melden statt schwarz
          if (v.videoWidth === 0 && v.videoHeight === 0) setFehler(videoFehlerText(undefined, true))
        }}
        onEnded={() => melde()}
        onError={e => setFehler(videoFehlerText(e.currentTarget.error?.code))}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000',
          transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: 'center center',
        }}
      />
      {fehler && (
        <div data-video-fehler style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center', color: '#fff', background: '#000' }}>
          <div>
            <p style={{ fontSize: 22, fontWeight: 600 }}>{titel || 'Video'}</p>
            <p style={{ fontSize: 15, opacity: 0.75, marginTop: 8, maxWidth: 720 }}>{fehler}</p>
          </div>
        </div>
      )}
      {stummWeil && aktiv && !fehler && (
        <div style={{ position: 'absolute', right: 12, bottom: 12, fontSize: 11, color: 'rgba(255,255,255,.6)' }}>Ton blockiert — läuft stumm</div>
      )}
    </div>
  )
}
