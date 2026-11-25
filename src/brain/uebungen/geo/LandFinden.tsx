// Land finden (Geographie): „Wo liegt Frankreich?“ – das Land auf der Karte anklicken.
// Trainiert das Lagewissen: Länder auf der Karte wiederfinden, zunehmend ohne Hilfe durch den Ausschnitt.
//
// Stufen (je Durchgang 10 Länder, Zeit je Land):
//    1  Europa, die bekannten Länder (Rang 1–2) · Europakarte · 15 s
//    2  Europa bis Rang 3 · 14 s
//    3  Nord-/Mittelamerika ODER Südamerika (Rang 1–3) · Erdteilkarte · 13 s
//    4  Asien (Rang 1–2) ODER Afrika (Rang 1–3) · Erdteilkarte · 12 s
//    5  Welt ohne Europa (Rang 1–2) auf der Weltkarte ODER Europa Rang 2–4 · 12 s
//    6  Asien (1–3) ODER Afrika (2–4) ODER Welt (1–2) · 11 s
//    7  Welt, Rang 2–3 · Weltkarte · 10 s
//    8  Afrika ODER Asien ODER Mittelamerika/Karibik, Rang 3–5 · Erdteilkarte · 10 s
//    9  Welt, Rang 3–4 · Weltkarte · 9 s
//   10  Welt, Rang 4–5 · Weltkarte · 8 s
// Nach dem Klick wird das gesuchte Land grün, ein falsch geklicktes rot (mit Namen). Abgelaufene Zeit zählt als falsch.
// Gebiete mit umstrittenem Status und abhängige Gebiete sind nie gesucht; ein Klick darauf wird nicht gewertet.
// Duell: genau `dauerSek`, endlose Folge bekannter Länder auf der Weltkarte, +10 je richtiges, −5 je falsches Land.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { Balken, KopfZeile, Taste, useTasten, useUhr } from '../../ablauf/kit'
import { Karte, type KartenMarke } from '../../geo/Karte'
import { OHNE_QUIZ_IDS, gross, istMehrzahl, mitArtikel, nameVon } from '../../geo/laender'
import { DUELL_TOPF, FINDEN_ANZAHL, duellLand, findenDuellWertung, findenPlan, findenPunkte, findenWertung, type FindenAntwort } from './LandFinden.logik'

export function Komponente({ stufe, start, modus, dauerSek, onPunkte, onFertig }: FreiProps) {
  const duell = modus === 'duell'
  const plan = useMemo(() => findenPlan(start, stufe), [start, stufe])
  const topf = duell ? DUELL_TOPF : plan.topf
  const zeitSek = plan.zeitSek

  const [nr, setNr] = useState(0)
  const [phase, setPhase] = useState<'frage' | 'antwort'>('frage')
  /** falsch angeklickte Fläche (null = richtig oder Zeit abgelaufen) */
  const [falsch, setFalsch] = useState<string | null>(null)
  const [abgelaufen, setAbgelaufen] = useState(false)
  /** Hinweis nach einem Klick auf ein Gebiet, das nicht gewertet wird */
  const [neutral, setNeutral] = useState<string | null>(null)
  /** zählt hoch, wenn die Karte auf ihren Ausschnitt zurückfahren soll */
  const [heim, setHeim] = useState(0)
  const antworten = useRef<FindenAntwort[]>([])
  const fertig = useRef(false)
  const frageStart = useRef(performance.now())
  const antwortZeit = useRef(0)
  // Rückrufe über eine Referenz: so starten die Zeitgeber nicht neu, wenn der Rahmen neu zeichnet
  const aussen = useRef({ onPunkte, onFertig })
  aussen.current = { onPunkte, onFertig }

  const ziel = duell ? duellLand(start, nr) : plan.laender[Math.min(nr, plan.laender.length - 1)]
  const letzteRichtig = phase === 'antwort' && !!antworten.current[antworten.current.length - 1]?.richtig

  const schliesseAb = useCallback(() => {
    if (fertig.current) return
    fertig.current = true
    aussen.current.onFertig(duell ? findenDuellWertung(antworten.current, dauerSek && dauerSek > 0 ? dauerSek : 60) : findenWertung(antworten.current, FINDEN_ANZAHL, zeitSek))
  }, [dauerSek, duell, zeitSek])

  // Duell ohne Zeitangabe gibt es nicht – zur Sicherheit 60 s, damit die Übung in jedem Fall endet
  const dauer = duell ? (dauerSek && dauerSek > 0 ? dauerSek : 60) : undefined
  const rest = useUhr(dauer, schliesseAb)

  const weiter = useCallback(() => {
    if (fertig.current) return
    if (!duell && nr + 1 >= FINDEN_ANZAHL) { schliesseAb(); return }
    // alles in EINEM Schritt zurücksetzen, sonst blitzt die alte Markierung an der neuen Aufgabe auf
    setFalsch(null); setAbgelaufen(false); setNeutral(null); setPhase('frage')
    setHeim(h => h + 1)
    setNr(n => n + 1)
  }, [duell, nr, schliesseAb])

  /** id = angeklickte Fläche, null = Zeit abgelaufen */
  const werte = useCallback((id: string | null) => {
    if (fertig.current) return
    const richtig = id === ziel.id
    antworten.current.push({ richtig, ms: performance.now() - frageStart.current })
    antwortZeit.current = performance.now()
    aussen.current.onPunkte?.(findenPunkte(antworten.current))
    setFalsch(richtig ? null : id)
    setAbgelaufen(id === null)
    setNeutral(null)
    setPhase('antwort')
    // nach einem Fehler die ganze Karte zeigen – das gesuchte Land könnte außerhalb des Bildes liegen
    if (!richtig) setHeim(h => h + 1)
  }, [ziel.id])

  const klick = useCallback((id: string) => {
    if (fertig.current) return
    if (phase === 'antwort') {
      // ein Klick auf die Karte geht weiter (nicht sofort – sonst überspringt ein Doppelklick die Rückmeldung)
      if (performance.now() - antwortZeit.current > 350) weiter()
      return
    }
    if (OHNE_QUIZ_IDS.has(id)) { setNeutral(nameVon(id)); return }
    werte(id)
  }, [phase, weiter, werte])

  // neue Aufgabe: Uhr stellen
  useEffect(() => { frageStart.current = performance.now() }, [nr])

  // Zeit je Land (nur Training): abgelaufen = falsch
  useEffect(() => {
    if (duell || phase !== 'frage') return
    const t = setTimeout(() => werte(null), zeitSek * 1000)
    return () => clearTimeout(t)
  }, [duell, phase, nr, werte, zeitSek])

  // nach der Antwort kurz zeigen, dann von selbst weiter
  useEffect(() => {
    if (phase !== 'antwort') return
    const pause = duell ? (letzteRichtig ? 350 : 950) : letzteRichtig ? 900 : 2800
    const t = setTimeout(weiter, pause)
    return () => clearTimeout(t)
  }, [phase, duell, letzteRichtig, weiter])

  // Hinweis „wird nicht gewertet“ wieder ausblenden
  useEffect(() => {
    if (!neutral) return
    const t = setTimeout(() => setNeutral(null), 2200)
    return () => clearTimeout(t)
  }, [neutral])

  useTasten({ Enter: weiter, ' ': weiter }, phase === 'antwort')

  const markiert = useMemo<Record<string, KartenMarke> | undefined>(() => {
    if (phase !== 'antwort') return undefined
    const m: Record<string, KartenMarke> = { [ziel.id]: 'gut' }
    if (falsch) m[falsch] = 'schlecht'
    return m
  }, [phase, ziel.id, falsch])
  const schilder = useMemo<Record<string, string> | undefined>(() => {
    if (phase !== 'antwort') return undefined
    const s: Record<string, string> = { [ziel.id]: ziel.name }
    if (falsch) s[falsch] = nameVon(falsch)
    return s
  }, [phase, ziel.id, ziel.name, falsch])

  const richtigBisher = antworten.current.filter(a => a.richtig).length
  const punkte = findenPunkte(antworten.current)
  const zielText = gross(mitArtikel(ziel))
  const istSind = istMehrzahl(ziel) ? 'sind' : 'ist'

  return (
    <div className="bt-lauf bt-geo-finden" style={{ gap: 10 }} data-bt-frei="landfinden" data-phase={phase} data-nr={nr} data-topf={topf.name}>
      <KopfZeile
        links={duell
          ? <span className="bt-chip bt-chip-warm bt-zahl" data-bt-rest>{rest} s</span>
          : <span className="bt-chip bt-zahl">{Math.min(nr + 1, FINDEN_ANZAHL)} / {FINDEN_ANZAHL}</span>}
        mitte={duell ? <Balken anteil={rest / (dauer || 1)} warm /> : <Balken anteil={(nr + (phase === 'antwort' ? 1 : 0)) / FINDEN_ANZAHL} />}
        rechts={duell
          ? <span className="bt-chip bt-chip-akzent bt-zahl" data-bt-punkte-live>{punkte} Punkte</span>
          : <span className="bt-chip bt-chip-gut bt-zahl">{richtigBisher} richtig</span>}
      />

      <div className="bt-aufgabe" data-bt-aufgabe>
        {istMehrzahl(ziel) ? 'Wo liegen' : 'Wo liegt'} <em>{mitArtikel(ziel)}</em>?
        <span className="bt-leise" style={{ fontWeight: 400, fontSize: 13 }}> · {topf.name}</span>
      </div>

      {!duell && phase === 'frage'
        ? <div className="bt-uhr" style={{ maxWidth: 'none' }} aria-hidden="true"><i key={nr} style={{ animation: `bt-uhr-lauf ${zeitSek * 1000}ms linear forwards` }} /></div>
        : <div className="bt-uhr" style={{ visibility: 'hidden' }} />}

      <Karte ausschnitt={topf.ausschnitt} markiert={markiert} schilder={schilder} onLand={klick} hoehe={466} ruecksetzen={heim}>
        {phase === 'antwort' ? (
          <div className="bt-geo-meldung bt-ein" data-art={letzteRichtig ? 'gut' : 'schlecht'} data-bt-meldung>
            {letzteRichtig ? <span><b>Richtig</b> – {ziel.name}</span>
              : abgelaufen ? <span><b>Zeit abgelaufen.</b> {zielText} {istSind} grün markiert.</span>
                : <span><b>Das war {nameVon(falsch ?? '')}.</b> {zielText} {istSind} grün markiert.</span>}
            {!letzteRichtig && !duell && <button type="button" className="bt-knopf" data-bt-weiter onClick={weiter}>Weiter <Taste>↵</Taste></button>}
          </div>
        ) : neutral ? (
          <div className="bt-geo-meldung bt-ein" data-art="neutral" data-bt-neutral>{neutral} wird hier nicht gewertet – such weiter.</div>
        ) : null}
      </Karte>
    </div>
  )
}
