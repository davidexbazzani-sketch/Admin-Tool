// Zahlen verbinden (Tempo): verstreute Kreise der Reihe nach anklicken; zwischen den verbundenen Kreisen
// entsteht eine Linie. Ab Stufe 6 wechseln Zahlen und Buchstaben (1 – A – 2 – B …).
// Trainiert das schnelle Absuchen eines Felds und — im Wechsel — das Umschalten zwischen zwei Reihenfolgen.
//
// Stufen (Richtzeit je Kreis einschließlich Strafzeiten: „sehr gut“ / „langsam“):
//   1  nur Zahlen ·  8 Kreise · 3 Felder · 0,65 / 2,00 s      6  Zahlen + Buchstaben · 10 Kreise · 3 Felder · 1,05 / 3,15 s
//   2  nur Zahlen · 11 Kreise · 3 Felder · 0,70 / 2,10 s      7  Zahlen + Buchstaben · 14 Kreise · 2 Felder · 1,15 / 3,45 s
//   3  nur Zahlen · 14 Kreise · 2 Felder · 0,75 / 2,25 s      8  Zahlen + Buchstaben · 18 Kreise · 2 Felder · 1,25 / 3,75 s
//   4  nur Zahlen · 17 Kreise · 2 Felder · 0,80 / 2,40 s      9  Zahlen + Buchstaben · 21 Kreise · 2 Felder · 1,33 / 4,00 s
//   5  nur Zahlen · 20 Kreise · 2 Felder · 0,85 / 2,55 s     10  Zahlen + Buchstaben · 24 Kreise · 2 Felder · 1,40 / 4,20 s
//
// Regeln:
//   • Die Kreise liegen zufällig und überlappen nie (würfeln und verwerfen, siehe Verbinden.logik.ts).
//   • Ein falscher Kreis rüttelt, zählt als Fehlklick und kostet 1 Sekunde. Schon verbundene Kreise sind ohne Wirkung.
//   • Der nächste Kreis steht nur als Text über dem Feld („Weiter mit: 7“), nie als Markierung im Feld.
//   • Zwischen zwei Feldern steht die Uhr kurz still (das fertige Feld bleibt einen Augenblick sichtbar).
//   • Wertung: tempoGuete(Treffer / Klicks, Tempo aus der Zeit je Kreis) — siehe tempo.logik.ts.
//   • Gezählt wird beim HERUNTERDRÜCKEN der Maustaste, gemessen mit performance.now().
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, useStoppuhr } from '../../ablauf/kit'
import { VB_BREITE, VB_HOEHE, vbFeld, vbStufe, vbWertung } from './Verbinden.logik'
import { kommaZahl } from './tempo.logik'
import './tempo.css'

export * from './Verbinden.logik'

/** so lange bleibt ein fertiges Feld stehen, bevor das nächste kommt (die Uhr steht dabei) */
const WECHSEL_MS = 450

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const st = useMemo(() => vbStufe(stufe), [stufe])

  const [runde, setRunde] = useState(0)
  const [stand, setStand] = useState(0)
  const [wechsel, setWechsel] = useState(false)
  const [zu, setZu] = useState(false)
  const [falsch, setFalsch] = useState<{ i: number; n: number } | null>(null)
  // Derselbe Stand als Ref: Klicks müssen ihn sofort sehen, nicht erst nach dem nächsten Zeichnen
  const lauf = useRef({ runde: 0, stand: 0, treffer: 0, fehler: 0, beginn: 0, pause: 0, pauseAb: 0, wechsel: false })
  const fertig = useRef(false)
  const sek = useStoppuhr(!wechsel && !zu)

  useEffect(() => { lauf.current.beginn = performance.now() }, [])

  const feld = useMemo(() => vbFeld(rng(start).zweig(`feld${runde}`), st.anzahl, st.gemischt), [start, runde, st])

  const klick = useCallback((feldNr: number, i: number) => {
    const l = lauf.current
    if (fertig.current || l.wechsel || feldNr !== l.runde) return
    if (i < l.stand) return
    if (i !== l.stand) { l.fehler++; setFalsch({ i, n: l.fehler }); return }
    l.treffer++
    l.stand++
    setStand(l.stand)
    if (l.stand < st.anzahl) return
    if (l.runde + 1 >= st.felder) {
      fertig.current = true
      setZu(true)
      onFertig(vbWertung(stufe, l.treffer, l.fehler, performance.now() - l.beginn - l.pause))
      return
    }
    l.wechsel = true
    l.pauseAb = performance.now()
    setWechsel(true)
  }, [onFertig, st, stufe])

  // fertiges Feld kurz zeigen, dann das nächste
  useEffect(() => {
    if (!wechsel) return
    const t = setTimeout(() => {
      const l = lauf.current
      l.pause += performance.now() - l.pauseAb
      l.runde++
      l.stand = 0
      l.wechsel = false
      setRunde(l.runde); setStand(0); setFalsch(null); setWechsel(false)
    }, WECHSEL_MS)
    return () => clearTimeout(t)
  }, [wechsel])

  useEffect(() => {
    if (!falsch) return
    const t = setTimeout(() => setFalsch(null), 380)
    return () => clearTimeout(t)
  }, [falsch])

  const fehler = lauf.current.fehler
  const naechster = feld.kreise[stand]?.text
  const linie = feld.kreise.slice(0, stand).map(k => `${k.x},${k.y}`).join(' ')

  return (
    <div className="bt-lauf" data-bt-frei="verbinden" data-runde={runde} data-stand={stand} data-weiter={wechsel ? undefined : naechster} data-fehler={fehler}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Feld {runde + 1} / {st.felder}</span>}
        mitte={<Balken anteil={(runde * st.anzahl + stand) / (st.felder * st.anzahl)} />}
        rechts={<>
          {fehler > 0 && <span className="bt-chip bt-chip-warm bt-zahl" title="Strafzeit für Fehlklicks">+{fehler} s</span>}
          <span className="bt-chip bt-chip-akzent bt-zahl">{kommaZahl(sek)} s</span>
        </>}
      />
      <div className="bt-aufgabe">
        {naechster && !wechsel
          ? <>Weiter mit: <span className="bt-tempo-vb-ziel" data-bt-weiter>{naechster}</span></>
          : <span style={{ color: 'var(--bt-gut)' }}>Geschafft{wechsel ? ' — das nächste Feld kommt' : ''}</span>}
        <span className="bt-leise" style={{ fontWeight: 400, fontSize: 14 }}>
          {' '}· {st.gemischt ? 'Zahlen und Buchstaben im Wechsel: 1 – A – 2 – B – 3 …' : `der Reihe nach bis ${st.anzahl}`} · Fehlklick = +1 s
        </span>
      </div>

      <svg className="bt-tempo-vb-feld" viewBox={`0 0 ${VB_BREITE} ${VB_HOEHE}`} data-bt-feld role="group" aria-label="Spielfeld mit Kreisen">
        {stand >= 2 && <polyline className="bt-tempo-vb-linie" points={linie} />}
        {feld.kreise.map((k, i) => {
          const daneben = falsch?.i === i
          return (
            <g key={`${runde}-${i}-${daneben ? falsch.n : 0}`} className={`bt-tempo-vb-kreis ${daneben ? 'bt-ruettel' : ''}`}
              data-i={i} data-text={k.text} data-fertig={i < stand ? '' : undefined} data-schlecht={daneben ? '' : undefined}
              onPointerDown={e => { if (e.button === 0) klick(runde, i) }}>
              <circle cx={k.x} cy={k.y} r={feld.radius} />
              <text x={k.x} y={k.y} textAnchor="middle" dominantBaseline="central" style={{ fontSize: feld.radius * 0.92 }}>{k.text}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
