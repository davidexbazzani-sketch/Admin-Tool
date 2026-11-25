// Geographie – die Weltkarte zum Anklicken.
//
// Gezeichnet werden alle Flächen aus geo/welt.json (fertig projiziert). Zoomen (Mausrad, + / −) und
// Schieben (Ziehen mit der Maus) ändern nur das `transform` EINER Gruppe – die rund 180 Pfade werden
// dabei nicht neu gezeichnet. Hervorheben beim Überfahren macht CSS.
//
// Kleinstländer: Ist ein Land bei der aktuellen Vergrößerung kleiner als ein paar Pixel, bekommt es
// einen sichtbaren Punkt und eine größere unsichtbare Trefferfläche. Beide sind kurze Striche mit
// rundem Ende und fester Strichbreite – so bleiben sie beim Zoomen von selbst gleich groß.
//
// Jede Fläche trägt data-land="<Kennung>", die Punkte data-treffer="<Kennung>" (auch für Tests).
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { WELT, weltLand, type AusschnittName } from './welt'
import './geo.css'

export type KartenMarke = 'ziel' | 'gut' | 'schlecht'

export interface KarteProps {
  /** welcher Teil der Welt zu Beginn (und nach „Zurücksetzen“) zu sehen ist */
  ausschnitt?: AusschnittName
  /** Flächen einfärben: Ziel (warm), richtig (grün), falsch (rot) */
  markiert?: Record<string, KartenMarke>
  /** Namensschilder: Kennung → Text (nur sinnvoll für markierte Flächen) */
  schilder?: Record<string, string>
  /** Klick auf eine Fläche (Ziehen zählt nicht als Klick). Ohne diese Angabe ist die Karte nur Bild. */
  onLand?: (id: string) => void
  /** Höhe in Pixeln (Standard 460); die Breite füllt den Platz */
  hoehe?: number
  /** ändert sich der Wert, fährt die Karte auf den Ausschnitt zurück (z. B. je Aufgabe) */
  ruecksetzen?: number | string
  /** liegt über der Karte (z. B. eine Meldung) */
  children?: ReactNode
}

interface Ansicht { k: number; x: number; y: number }

/** unter diesem Halbmesser (Pixel) gilt ein Land als zu klein zum Treffen → Punkt */
const KLEIN_PX = 2.6
/** größte Vergrößerung: Pixel je Karteneinheit */
const K_MAX = 36
const RAND = 10

/** Ansicht, bei der der Ausschnitt gerade ganz hineinpasst */
export function passendeAnsicht(name: AusschnittName, breite: number, hoehe: number): Ansicht {
  const [ax, ay, ab, ah, q] = WELT.ausschnitte[name]
  const k = Math.max(0.05, Math.min((breite - 2 * RAND) / ab, (hoehe - 2 * RAND) / (ah * q)))
  return { k, x: (breite - ab * k) / 2 - ax * k, y: (hoehe - ah * k * q) / 2 - ay * k * q }
}

/** kleinste Vergrößerung (ganze Welt sichtbar) und Grenzen fürs Schieben: die Karte bleibt immer im Bild */
function begrenze(a: Ansicht, breite: number, hoehe: number, q: number): Ansicht {
  const kMin = Math.min((breite - 2 * RAND) / WELT.breite, (hoehe - 2 * RAND) / (WELT.hoehe * q))
  const k = Math.max(kMin, Math.min(K_MAX, a.k))
  const halt = Math.min(breite, hoehe) * 0.35
  const x = Math.max(halt - WELT.breite * k, Math.min(breite - halt, a.x))
  const y = Math.max(halt - WELT.hoehe * k * q, Math.min(hoehe - halt, a.y))
  return { k, x, y }
}

// ── Schichten (ändern sich nur, wenn sich ihr Inhalt ändert) ──────────────────
const Flaechen = memo(function Flaechen() {
  return <g>{WELT.laender.map(l => <path key={l.id} className="bt-geo-land" data-land={l.id} d={l.d} />)}</g>
})

/** kurzer Strich mit rundem Ende = Kreis mit fester Größe auf dem Bildschirm */
const tupfer = (x: number, y: number) => `M${x} ${y}h.01`

const Punkte = memo(function Punkte({ ids }: { ids: string }) {
  if (!ids) return null
  return (
    <g>
      {ids.split(',').map(id => {
        const l = weltLand(id)!
        return (
          <g key={id} className="bt-geo-klein" data-treffer={id}>
            <path className="bt-geo-treffer" d={tupfer(l.x, l.y)} />
            <path className="bt-geo-punkt" d={tupfer(l.x, l.y)} />
          </g>
        )
      })}
    </g>
  )
})

const Marken = memo(function Marken({ markiert, kleinAb }: { markiert?: Record<string, KartenMarke>; kleinAb: number }) {
  if (!markiert) return null
  const liste = Object.entries(markiert).map(([id, marke]) => ({ l: weltLand(id), marke })).filter(x => x.l)
  return (
    <g>
      {liste.map(({ l, marke }) => <path key={l!.id} className="bt-geo-marke" data-marke={marke} data-markiert={l!.id} d={l!.d} />)}
      {/* kleines Ziel: zusätzlich ein pulsierender Ring, damit man es findet (nicht beim falsch geklickten Land) */}
      {liste.filter(({ l, marke }) => marke !== 'schlecht' && l!.r < kleinAb).map(({ l, marke }) => (
        <g key={`r${l!.id}`}>
          <path className="bt-geo-ring" data-marke={marke} d={tupfer(l!.x, l!.y)} />
          <path className="bt-geo-kern" data-marke={marke} d={tupfer(l!.x, l!.y)} />
        </g>
      ))}
    </g>
  )
})

export const Karte = memo(function Karte({ ausschnitt = 'welt', markiert, schilder, onLand, hoehe = 460, ruecksetzen, children }: KarteProps) {
  const huelle = useRef<HTMLDivElement>(null)
  const [breite, setBreite] = useState(1000)
  const [ansicht, setAnsicht] = useState<Ansicht>(() => passendeAnsicht(ausschnitt, 1000, hoehe))
  const [zieht, setZieht] = useState(false)
  /** weich bewegen erst, wenn die Karte einmal vermessen ist (sonst „fährt“ sie beim Öffnen herein) */
  const [sanft, setSanft] = useState(false)
  const q = WELT.ausschnitte[ausschnitt][4]

  // aktuelle Maße für die Listener, die nur einmal angemeldet werden
  const mass = useRef({ breite, hoehe, q })
  mass.current = { breite, hoehe, q }
  const klick = useRef(onLand)
  klick.current = onLand

  // Breite messen (und mitgehen, wenn sich das Fenster ändert)
  useLayoutEffect(() => {
    const el = huelle.current
    if (!el) return
    const miss = () => { const b = el.clientWidth; if (b > 0) setBreite(b) }
    miss()
    const beobachter = new ResizeObserver(miss)
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [])

  // Ausschnitt, Größe oder „Zurücksetzen“ geändert → Grundansicht
  useLayoutEffect(() => {
    setAnsicht(passendeAnsicht(ausschnitt, breite, hoehe))
  }, [ausschnitt, breite, hoehe, ruecksetzen])
  useEffect(() => { const t = setTimeout(() => setSanft(true), 120); return () => clearTimeout(t) }, [])

  const zoome = useCallback((faktor: number, px?: number, py?: number) => {
    setAnsicht(a => {
      const m = mass.current
      const cx = px ?? m.breite / 2, cy = py ?? m.hoehe / 2
      const ziel = begrenze({ k: a.k * faktor, x: 0, y: 0 }, m.breite, m.hoehe, m.q).k
      const f = ziel / a.k
      return begrenze({ k: ziel, x: cx - (cx - a.x) * f, y: cy - (cy - a.y) * f }, m.breite, m.hoehe, m.q)
    })
  }, [])

  // Mausrad: zoomt auf die Stelle unter dem Zeiger. Eigener Listener, weil die Seite sonst mitrollen würde.
  useEffect(() => {
    const el = huelle.current
    if (!el) return
    const rad = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      zoome(Math.exp(-Math.max(-240, Math.min(240, e.deltaY)) * 0.0022), e.clientX - r.left, e.clientY - r.top)
    }
    el.addEventListener('wheel', rad, { passive: false })
    return () => el.removeEventListener('wheel', rad)
  }, [zoome])

  // Ziehen verschiebt. Erst ab 5 Pixeln gilt es als Ziehen – dann zählt das Loslassen nicht als Klick.
  const griff = useRef<{ zeiger: number; x: number; y: number; ax: number; ay: number; bewegt: boolean } | null>(null)
  const gezogen = useRef(false)
  const runter = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    gezogen.current = false
    griff.current = { zeiger: e.pointerId, x: e.clientX, y: e.clientY, ax: ansicht.x, ay: ansicht.y, bewegt: false }
  }
  const bewege = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = griff.current
    if (!g || g.zeiger !== e.pointerId) return
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (!g.bewegt) {
      if (Math.hypot(dx, dy) < 5) return
      g.bewegt = true
      gezogen.current = true
      setZieht(true)
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* Zeiger schon weg */ }
    }
    const m = mass.current
    setAnsicht(a => begrenze({ k: a.k, x: g.ax + dx, y: g.ay + dy }, m.breite, m.hoehe, m.q))
  }
  const hoch = () => { griff.current = null; setZieht(false) }
  const geklickt = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (gezogen.current) { gezogen.current = false; return }
    const el = (e.target as Element).closest('[data-land],[data-treffer]')
    const id = el?.getAttribute('data-land') ?? el?.getAttribute('data-treffer')
    if (id) klick.current?.(id)
  }

  const basis = useMemo(() => passendeAnsicht(ausschnitt, breite, hoehe), [ausschnitt, breite, hoehe])
  const amAnfang = Math.abs(ansicht.k - basis.k) < 1e-6 && Math.abs(ansicht.x - basis.x) < 0.5 && Math.abs(ansicht.y - basis.y) < 0.5
  const kMin = begrenze({ k: 0, x: 0, y: 0 }, breite, hoehe, q).k

  // welche Länder sind gerade zu klein? (kleinste zuletzt = obenauf)
  const kq = ansicht.k * Math.min(1, q)
  const kleine = useMemo(
    () => WELT.laender.filter(l => l.r * kq < KLEIN_PX).sort((a, b) => b.r - a.r).map(l => l.id).join(','),
    [kq],
  )

  const stil = { transform: `translate(${ansicht.x}px, ${ansicht.y}px) scale(${ansicht.k}, ${ansicht.k * q})` }
  const weich = sanft && !zieht

  return (
    <div ref={huelle} className="bt-geo-karte" style={{ height: hoehe }} data-bt-karte data-ausschnitt={ausschnitt} data-zieht={zieht ? '' : undefined} data-k={ansicht.k.toFixed(3)}>
      <svg role="img" aria-label="Weltkarte" className={onLand ? 'bt-geo-klickbar' : undefined}
        onPointerDown={runter} onPointerMove={bewege} onPointerUp={hoch} onPointerCancel={hoch} onClick={geklickt}>
        <g className={`bt-geo-welt ${weich ? 'bt-geo-sanft' : ''}`} style={stil}>
          <Flaechen />
          <Punkte ids={kleine} />
          <Marken markiert={markiert} kleinAb={6 / kq} />
        </g>
      </svg>

      {schilder && Object.entries(schilder).map(([id, text]) => {
        const l = weltLand(id)
        if (!l || !text) return null
        const marke = markiert?.[id]
        // Schild über dem Merkpunkt (falsch geklickt: darunter), immer im Bild halten
        const sx = Math.max(60, Math.min(breite - 60, l.x * ansicht.k + ansicht.x))
        const sy = Math.max(34, Math.min(hoehe - 34, l.y * ansicht.k * q + ansicht.y))
        return (
          <div key={id} className={`bt-geo-schild ${weich ? 'bt-geo-sanft' : ''}`} data-marke={marke} data-schild={id}
            style={{ transform: `translate(${sx}px, ${sy}px) translate(-50%, ${marke === 'schlecht' ? '12px' : 'calc(-100% - 12px)'})` }}>
            {text}
          </div>
        )
      })}

      <div className="bt-geo-knoepfe">
        <button type="button" onClick={() => zoome(1.6)} disabled={ansicht.k >= K_MAX - 1e-6} aria-label="Vergrößern" title="Vergrößern" data-bt-zoom="plus"><Plus size={16} /></button>
        <button type="button" onClick={() => zoome(1 / 1.6)} disabled={ansicht.k <= kMin + 1e-6} aria-label="Verkleinern" title="Verkleinern" data-bt-zoom="minus"><Minus size={16} /></button>
        <button type="button" onClick={() => setAnsicht(basis)} disabled={amAnfang} aria-label="Ansicht zurücksetzen" title="Ansicht zurücksetzen" data-bt-zoom="zurueck"><RotateCcw size={15} /></button>
      </div>
      {onLand && <div className="bt-geo-hinweis">Mausrad oder + / − zoomt · Ziehen verschiebt</div>}
      {children}
    </div>
  )
})

export default Karte
