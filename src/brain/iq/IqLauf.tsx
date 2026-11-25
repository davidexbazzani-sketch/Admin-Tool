// IQ-Test — der laufende Test: eine Aufgabe nach der anderen, auf Zeit, ohne Rückmeldung.
// Die Stufe der nächsten Aufgabe richtet sich nach dem bisherigen Stand (adaptiv).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Frage, IqGebiet } from '../kern/typen'
import { rng } from '../kern/zufall'
import { Zeige } from '../figuren/Zeige'
import { zieheFrage } from '../ablauf/ohneWiederholung'
import { bVonStufe, type Antwort } from './irt'
import { ablaufplan, iqGebietName, naechsteStufe, type TestLaenge } from './test'
import type { IqGeneratoren } from './aufgaben'

export interface IqAufgabe { gebiet: IqGebiet; stufe: number; frage: Frage; gewaehlt: number | null; richtig: boolean; ms: number }
export interface IqRohergebnis { antworten: Antwort[]; aufgaben: IqAufgabe[]; dauerSek: number }

interface Props {
  laenge: TestLaenge; generatoren: IqGeneratoren; start: number
  /** zuletzt gesehene Aufgaben (Hashes, aus Training und früheren Tests) — werden gemieden, wenn es anders geht */
  vermeide?: ReadonlySet<number>
  /** meldet jede gezeigte Aufgabe (Hash ihrer Kennung) */
  onGezeigt?: (hash: number) => void
  onFertig: (e: IqRohergebnis) => void; onAbbruch: () => void
}

const minSek = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function IqLauf({ laenge, generatoren, start, vermeide, onGezeigt, onFertig, onAbbruch }: Props) {
  const plan = useMemo(() => ablaufplan(rng(start), laenge), [start, laenge])
  const [nr, setNr] = useState(0)
  const [vorabFertig, setVorabFertig] = useState(-1)
  const [sek, setSek] = useState(0)
  const [abbruchFrage, setAbbruchFrage] = useState(false)
  const antworten = useRef<Antwort[]>([])
  const aufgaben = useRef<IqAufgabe[]>([])
  const beginn = useRef(performance.now())
  const frageStart = useRef(performance.now())
  const fertig = useRef(false)
  // wie oft kam jedes Gebiet schon dran → wechselt innerhalb eines Gebiets die Aufgabenart
  const zaehler = useRef<Partial<Record<IqGebiet, number>>>({})

  // Aufgabe für diese Nummer: Gebiet aus dem Plan, Stufe aus dem bisherigen Stand.
  // Keine Aufgabe kommt im selben Test zweimal; die gezogenen Aufgaben werden je Nummer gemerkt,
  // damit ein erneutes Rendern nichts ändert.
  const gezogen = useRef(new Map<number, { gebiet: IqGebiet; stufe: number; frage: Frage; kennung: string; hash: number }>())
  const vermeideFest = useRef(vermeide)   // Stand vom Beginn des Tests
  const aktuell = useMemo(() => {
    const schon = gezogen.current.get(nr)
    if (schon) return schon
    const gebiet = plan[nr]
    const stufe = naechsteStufe(antworten.current)
    const gens = generatoren[gebiet]
    const wievielte = zaehler.current[gebiet] ?? 0
    const imTest = new Set(Array.from(gezogen.current.values(), g => g.kennung))
    const z = zieheFrage(gens[(wievielte + (start % gens.length)) % gens.length], start, stufe, `iq${nr}`, imTest, vermeideFest.current)
    const neu = { gebiet, stufe, frage: z.frage, kennung: z.kennung, hash: z.hash }
    gezogen.current.set(nr, neu)
    return neu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nr, plan, generatoren, start])
  const { frage, gebiet, stufe } = aktuell
  const gezeigtRef = useRef(onGezeigt)
  gezeigtRef.current = onGezeigt
  useEffect(() => { gezeigtRef.current?.(aktuell.hash) }, [aktuell])
  const zeitMs = Math.max(20, Math.min(120, frage.zeitSek ?? 60)) * 1000
  const inVorab = !!frage.vorab && vorabFertig !== nr

  const werte = useCallback((gewaehlt: number | null) => {
    if (fertig.current) return
    const richtig = gewaehlt !== null && gewaehlt === frage.richtig
    antworten.current.push({ b: bVonStufe(stufe), c: 1 / Math.max(2, frage.optionen.length), richtig, gebiet })
    aufgaben.current.push({ gebiet, stufe, frage, gewaehlt, richtig, ms: performance.now() - frageStart.current })
    zaehler.current[gebiet] = (zaehler.current[gebiet] ?? 0) + 1
    if (nr + 1 >= laenge) {
      fertig.current = true
      onFertig({ antworten: antworten.current, aufgaben: aufgaben.current, dauerSek: (performance.now() - beginn.current) / 1000 })
      return
    }
    setNr(n => n + 1)
  }, [frage, gebiet, stufe, nr, laenge, onFertig])

  // Merkphase, dann Zeit je Aufgabe (abgelaufen = falsch)
  useEffect(() => {
    frageStart.current = performance.now()
    if (!frage.vorab) return
    const t = setTimeout(() => { frageStart.current = performance.now(); setVorabFertig(nr) }, frage.vorab.sek * 1000)
    return () => clearTimeout(t)
  }, [frage, nr])
  useEffect(() => {
    if (inVorab || abbruchFrage) return
    const t = setTimeout(() => werte(null), Math.max(0, zeitMs - (performance.now() - frageStart.current)))
    return () => clearTimeout(t)
  }, [inVorab, abbruchFrage, werte, zeitMs, nr])

  useEffect(() => { const t = setInterval(() => setSek((performance.now() - beginn.current) / 1000), 500); return () => clearInterval(t) }, [])

  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.repeat || inVorab || abbruchFrage || !/^[1-9]$/.test(e.key)) return
      const i = Number(e.key) - 1
      if (i < frage.optionen.length) { e.preventDefault(); werte(i) }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [frage, inVorab, abbruchFrage, werte])

  const n = frage.optionen.length
  const spalten = frage.spalten ?? (n <= 2 ? 2 : n <= 4 ? (frage.optionen.every(o => o.art === 'text') ? 2 : 4) : n === 5 ? 5 : 4)

  return (
    <div className="bt-lauf" data-bt-iqlauf data-nr={nr} data-phase={inVorab ? 'vorab' : 'frage'} data-gebiet={gebiet} data-stufe={stufe}>
      <div className="bt-lauf-kopf">
        <span className="bt-chip bt-zahl">Frage {nr + 1} / {laenge}</span>
        <div className="bt-balken" style={{ flex: 1 }}><i style={{ width: `${(nr / laenge) * 100}%` }} /></div>
        <span className="bt-chip">{iqGebietName(gebiet)}</span>
        <span className="bt-chip bt-zahl" title="bisherige Dauer">{minSek(sek)}</span>
        <button type="button" className="bt-knopf bt-knopf-nackt" onClick={() => setAbbruchFrage(true)} aria-label="Test abbrechen" data-bt-iq-abbruch><X size={16} /></button>
      </div>

      {abbruchFrage ? (
        <div className="bt-karte bt-ein" style={{ maxWidth: 520, marginTop: 40, textAlign: 'center' }} data-bt-iq-abbruchfrage>
          <h2 className="bt-h2">Test abbrechen?</h2>
          <p className="bt-leise" style={{ margin: '8px 0 16px' }}>Ein abgebrochener Test wird nicht ausgewertet und nicht gespeichert. Die laufende Aufgabe zählt beim Weitermachen als nicht beantwortet.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button type="button" className="bt-knopf bt-knopf-gefahr" onClick={onAbbruch} data-bt-iq-abbruch-ja>Ja, abbrechen</button>
            <button type="button" className="bt-knopf" onClick={() => { setAbbruchFrage(false); werte(null) }}>Weitermachen</button>
          </div>
        </div>
      ) : inVorab && frage.vorab ? (
        <div className="bt-ein" key={`v${nr}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, marginTop: 20 }}>
          <div className="bt-aufgabe">{frage.vorab.hinweis ?? 'Präge dir das ein'}</div>
          <div className="bt-buehne"><Zeige d={frage.vorab.zeige} /></div>
          <div className="bt-uhr" style={{ maxWidth: 320 }}><i style={{ animation: `bt-uhr-lauf ${frage.vorab.sek * 1000}ms linear forwards` }} /></div>
        </div>
      ) : (
        <>
          <div className="bt-uhr" aria-hidden="true"><i key={nr} style={{ animation: `bt-uhr-lauf ${zeitMs}ms linear forwards` }} /></div>
          <div className="bt-ein" key={`f${nr}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
            <div className="bt-aufgabe" data-bt-aufgabe>{frage.aufgabe}</div>
            {frage.zeige && <div className="bt-buehne"><Zeige d={frage.zeige} /></div>}
            <div className="bt-optionen" style={{ gridTemplateColumns: `repeat(${spalten}, minmax(0, 1fr))` }}>
              {frage.optionen.map((o, i) => (
                <button key={i} type="button" className="bt-option" data-bt-option={i} onClick={() => werte(i)}>
                  <kbd>{i + 1}</kbd><Zeige d={o} rolle="auswahl" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
