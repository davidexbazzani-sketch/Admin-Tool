// „Lager einsehen“ — 3D-Ansicht als React-Baustein. Wird erst beim Öffnen nachgeladen (mit three).

import { useEffect, useRef } from 'react'
import { erzeugeSzene, type Ansicht, type Auswahl, type Markierung, type SzeneGruppe, type SzeneHandle } from './szene'
import type { LagerTyp, OrtId } from '../typen'

export interface Lager3DProps {
  gruppen: SzeneGruppe[]
  namen: Map<string, string>
  markierungen: Markierung[] | null
  auswahl: Auswahl | null
  /** Kamera zur Auswahl fahren? (nicht, wenn im Raum selbst geklickt wurde) */
  fahren: boolean
  treffer: Set<string> | null
  ansicht: { a: Ansicht; n: number } | null
  onAuswahl: (a: Auswahl | null) => void
  onFehler: (grund: string) => void
}

const istHell = () => document.documentElement.classList.contains('light')
function hintergrund(): string | undefined {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
  const m = v.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/)
  return m ? `hsl(${m[1]}, ${m[2]}%, ${m[3]}%)` : undefined
}

export default function Lager3D(p: Lager3DProps) {
  const box = useRef<HTMLDivElement>(null)
  const ov = useRef<HTMLDivElement>(null)
  const h = useRef<SzeneHandle | null>(null)
  const props = useRef(p)
  props.current = p

  useEffect(() => {
    if (!box.current || !ov.current) return
    let handle: SzeneHandle
    try {
      handle = erzeugeSzene({
        behaelter: box.current, overlay: ov.current, hell: istHell(), hintergrund: hintergrund(),
        onAuswahl: a => props.current.onAuswahl(a),
        onKontextVerloren: () => props.current.onFehler('Die Grafikkarte hat die 3D-Ansicht beendet.'),
      })
    } catch (e) {
      props.current.onFehler(`3D-Ansicht konnte nicht starten (${e instanceof Error ? e.message : String(e)}).`)
      return
    }
    h.current = handle
    const q = props.current
    handle.setzeDaten(q.gruppen, q.namen)
    handle.setzeMarkierungen(q.markierungen)
    handle.setzeTreffer(q.treffer)
    if (q.auswahl) handle.setzeAuswahl(q.auswahl, false)
    const mo = new MutationObserver(() => handle.setzeThema(istHell(), hintergrund()))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const w = window as unknown as { __LAGER_TEST__?: boolean; __lagerTest?: unknown }
    if (w.__LAGER_TEST__) {
      w.__lagerTest = {
        bildpunkt: (ort: OrtId, typ?: LagerTyp) => handle.bildpunkt(ort, typ),
        info: () => handle.info(),
        waehle: (ort: OrtId, typ?: LagerTyp) => props.current.onAuswahl({ ort, typ }),
      }
    }
    return () => {
      mo.disconnect()
      handle.entsorge()
      h.current = null
      if (w.__LAGER_TEST__) (w as { __lagerLetzteInfo?: unknown }).__lagerLetzteInfo = handle.info()
    }
  }, [])

  useEffect(() => { h.current?.setzeDaten(p.gruppen, p.namen) }, [p.gruppen, p.namen])
  useEffect(() => { h.current?.setzeMarkierungen(p.markierungen) }, [p.markierungen])
  useEffect(() => { h.current?.setzeAuswahl(p.auswahl, p.fahren) }, [p.auswahl]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { h.current?.setzeTreffer(p.treffer) }, [p.treffer])
  useEffect(() => { if (p.ansicht) h.current?.ansicht(p.ansicht.a) }, [p.ansicht])

  return (
    <div className="relative w-full h-full">
      <div ref={box} className="absolute inset-0" />
      <div ref={ov} className="lager-overlay" />
    </div>
  )
}
