// Parla Italiano — der Ablauf einer Runde: eine Aufgabe nach der anderen, Rückmeldung, Fortschritt.
//  • Modus „lernen“: nach jeder Antwort eine Erklärung; was falsch war, kommt am Ende noch einmal.
//  • Modus „test“: kurze Rückmeldung, dann geht es von selbst weiter; auf Wunsch mit Uhr.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Clock, RotateCcw, X } from 'lucide-react'
import type { Aufgabe, Ergebnis, GewerteteAufgabe } from '../kern/typen'
import { istGewertet } from '../kern/typen'
import { useItaliano } from '../kern/speicher'
import { stoppeTon } from '../kern/ton'
import { Auswahl, Paare, Satzbau, Tippen, type Antwort } from '../uebungen/aufgaben'
import { DialogKarte, Einstieg, GrammatikKarte, Nachsprechen, WissenKarte, Wortkarte } from '../uebungen/teile'

export interface LaufEnde { ergebnisse: Ergebnis[]; sekunden: number; zeitUm: boolean }

interface Props {
  aufgaben: Aufgabe[]
  modus: 'lernen' | 'test'
  titel: string
  /** Zeitgrenze in Sekunden (nur Test) */
  sekunden?: number
  /** Beschriftung über der Aufgabe, z. B. der Prüfungsteil */
  abschnitt?: (index: number) => string | undefined
  onFertig: (e: LaufEnde) => void
  /** vorzeitig beendet — mit dem, was bis dahin beantwortet war */
  onAbbruch: (e: LaufEnde) => void
}

const LOB = ['Esatto!', 'Bravo!', 'Perfetto!', 'Giusto!', 'Benissimo!', 'Ottimo!']
const zeitText = (s: number): string => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

export default function Lauf({ aufgaben, modus, titel, sekunden, abschnitt, onFertig, onAbbruch }: Props) {
  const ton = useItaliano(s => s.daten.einstellungen.ton)
  const langsam = useItaliano(s => s.daten.einstellungen.langsam)
  /** die Liste kann am Ende um die Wiederholungen wachsen */
  const [liste, setListe] = useState<Aufgabe[]>(aufgaben)
  const [index, setIndex] = useState(0)
  const [antwort, setAntwort] = useState<Antwort | null>(null)
  const [fragtAbbruch, setFragtAbbruch] = useState(false)
  const [rest, setRest] = useState(sekunden ?? 0)
  const ergebnisse = useRef<Ergebnis[]>([])
  const falsche = useRef<GewerteteAufgabe[]>([])
  const wiederholtAb = useRef<number | null>(null)
  const beginn = useRef(Date.now())
  const aufgabeAb = useRef(Date.now())
  const antwortUm = useRef(0)
  const beendet = useRef(false)

  const a = liste[index]
  const gewertet = a ? istGewertet(a) : false
  const istWiederholung = wiederholtAb.current !== null && index >= wiederholtAb.current
  const gesamtGewertet = useMemo(() => aufgaben.filter(istGewertet).length, [aufgaben])

  const ende = useCallback((zeitUm: boolean) => {
    if (beendet.current) return
    beendet.current = true
    stoppeTon()
    onFertig({ ergebnisse: ergebnisse.current, sekunden: Math.round((Date.now() - beginn.current) / 1000), zeitUm })
  }, [onFertig])

  const weiter = useCallback(() => {
    if (beendet.current) return
    stoppeTon()
    const naechster = index + 1
    if (naechster < liste.length) { setAntwort(null); setIndex(naechster); aufgabeAb.current = Date.now(); return }
    // am Ende: im Lernmodus kommt Falsches einmal wieder
    if (modus === 'lernen' && wiederholtAb.current === null && falsche.current.length) {
      const nochmal = falsche.current.slice(0, 6).map(x => ({ ...x, id: x.id + '-w' }))
      wiederholtAb.current = liste.length
      setListe(l => [...l, ...nochmal]); setAntwort(null); setIndex(naechster); aufgabeAb.current = Date.now()
      return
    }
    ende(false)
  }, [index, liste.length, modus, ende])

  const nimmAntwort = useCallback((x: Antwort) => {
    if (!a || !istGewertet(a) || antwort) return
    antwortUm.current = Date.now()
    setAntwort(x)
    if (!istWiederholung) {
      ergebnisse.current.push({ id: a.id, f: a.f, richtig: x.richtig, woerter: x.woerter, ms: Date.now() - aufgabeAb.current })
      if (!x.richtig) falsche.current.push(a)
    }
  }, [a, antwort, istWiederholung])

  // Test: von selbst weiter
  useEffect(() => {
    if (modus !== 'test' || !antwort) return
    const t = setTimeout(weiter, antwort.richtig ? 850 : 2200)
    return () => clearTimeout(t)
  }, [modus, antwort, weiter])

  // Uhr
  useEffect(() => {
    if (!sekunden) return
    const t = setInterval(() => {
      const r = sekunden - Math.floor((Date.now() - beginn.current) / 1000)
      setRest(r)
      if (r <= 0) { clearInterval(t); ende(true) }
    }, 250)
    return () => clearInterval(t)
  }, [sekunden, ende])

  // Eingabetaste = weiter (nicht im selben Tastendruck, mit dem geantwortet wurde)
  const darfWeiter = !!a && (!gewertet || !!antwort)
  const zustand = useRef({ darfWeiter, weiter, fragtAbbruch })
  zustand.current = { darfWeiter, weiter, fragtAbbruch }
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.defaultPrevented || zustand.current.fragtAbbruch) return
      if (!zustand.current.darfWeiter || Date.now() - antwortUm.current < 250) return
      e.preventDefault()
      zustand.current.weiter()
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [])
  useEffect(() => () => stoppeTon(), [])

  if (!a) return null
  const anteil = Math.round((Math.min(index, liste.length) / liste.length) * 100)
  const richtigBisher = ergebnisse.current.filter(e => e.richtig).length
  const teil = abschnitt?.(index)

  return (
    <div className="pi-lauf" data-pi-lauf={modus} data-pi-index={index} data-pi-anzahl={liste.length}>
      <div className="pi-lauf-kopf">
        <button type="button" className="pi-knopf pi-knopf-nackt" style={{ padding: 6 }} onClick={() => setFragtAbbruch(true)} aria-label="Beenden" title="Beenden" data-pi-abbruch><X size={18} /></button>
        <div style={{ flex: 1 }}>
          <div className="pi-reihe pi-klein" style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="pi-leise" style={{ fontWeight: 700 }}>{titel}{teil ? ` · ${teil}` : ''}{istWiederholung ? ' · noch einmal' : ''}</span>
            <span className="pi-stumm pi-zahl">{modus === 'test' ? `${Math.min(ergebnisse.current.length + (antwort ? 0 : 1), gesamtGewertet)} von ${gesamtGewertet}` : `${richtigBisher} richtig`}</span>
          </div>
          <div className="pi-balken"><i style={{ width: `${anteil}%` }} /></div>
        </div>
        {!!sekunden && <span className={`pi-chip pi-zahl ${rest <= 30 ? 'pi-chip-gold' : ''}`} data-pi-uhr><Clock size={12} />{zeitText(rest)}</span>}
      </div>

      {istWiederholung && index === wiederholtAb.current && !antwort && (
        <div className="pi-karte-flach pi-reihe pi-ein"><RotateCcw size={16} style={{ color: 'var(--pi-gold)' }} /><span>Das kommt noch einmal – jetzt klappt es bestimmt.</span></div>
      )}

      <div key={a.id}>
        {a.typ === 'einstieg' && <Einstieg a={a} />}
        {a.typ === 'karte' && <Wortkarte a={a} ton={ton} langsam={langsam} />}
        {a.typ === 'grammatik' && <GrammatikKarte a={a} />}
        {a.typ === 'dialog' && <DialogKarte a={a} ton={ton} langsam={langsam} />}
        {a.typ === 'wissen' && <WissenKarte a={a} />}
        {a.typ === 'nachsprechen' && <Nachsprechen a={a} ton={ton} langsam={langsam} />}
        {a.typ === 'auswahl' && <Auswahl a={a} onAntwort={nimmAntwort} ton={ton} langsam={langsam} />}
        {a.typ === 'tippen' && <Tippen a={a} onAntwort={nimmAntwort} ton={ton} langsam={langsam} />}
        {a.typ === 'satzbau' && <Satzbau a={a} onAntwort={nimmAntwort} ton={ton} langsam={langsam} />}
        {a.typ === 'paare' && <Paare a={a} onAntwort={nimmAntwort} ton={ton} langsam={langsam} />}
      </div>

      {antwort && (
        <div className="pi-meldung pi-ein" data-art={antwort.richtig ? (antwort.fast ? 'fast' : 'richtig') : 'falsch'} role="status" data-pi-meldung={antwort.richtig ? 'richtig' : 'falsch'}>
          {antwort.richtig ? <Check size={20} style={{ flexShrink: 0, marginTop: 1 }} /> : <X size={20} style={{ flexShrink: 0, marginTop: 1 }} />}
          <div style={{ flex: 1 }}>
            <b lang={antwort.richtig && !antwort.fast ? 'it' : undefined}>{antwort.richtig ? (antwort.fast ? 'Fast perfekt' : LOB[index % LOB.length]) : 'Noch nicht ganz'}</b>
            {antwort.fast && <span>{antwort.fast} Richtig geschrieben: <span className="pi-it" lang="it">{antwort.loesung}</span></span>}
            {!antwort.richtig && antwort.loesung && <span>Richtig ist: <span className="pi-it" lang="it" style={{ fontWeight: 700 }}>{antwort.loesung}</span></span>}
            {modus === 'lernen' && antwort.nach && <span style={{ display: 'block', marginTop: 2 }}>{antwort.nach}</span>}
          </div>
        </div>
      )}

      {darfWeiter && (
        <div className="pi-reihe" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className={`pi-knopf pi-knopf-gross ${antwort?.richtig ? 'pi-knopf-gruen' : ''}`} onClick={weiter} autoFocus={!gewertet} data-pi-weiter>
            {index + 1 >= liste.length && !(modus === 'lernen' && wiederholtAb.current === null && falsche.current.length) ? 'Fertig' : 'Weiter'}<ArrowRight size={18} />
          </button>
        </div>
      )}

      {fragtAbbruch && (
        <div className="pi-schleier" role="dialog" aria-modal="true" data-pi-abbruch-frage>
          <div className="pi-karte pi-dialog pi-ein pi-spalte">
            <h2 className="pi-h2">Wirklich aufhören?</h2>
            <p className="pi-leise">{modus === 'test' ? 'Der Test zählt dann nicht.' : 'Diese Runde wird dann nicht gewertet. Schon beantwortete Aufgaben bleiben in deinem Karteikasten.'}</p>
            <div className="pi-reihe" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="pi-knopf pi-knopf-leise" onClick={() => { stoppeTon(); beendet.current = true; onAbbruch({ ergebnisse: ergebnisse.current, sekunden: Math.round((Date.now() - beginn.current) / 1000), zeitUm: false }) }} data-pi-abbruch-ja>Aufhören</button>
              <button type="button" className="pi-knopf" onClick={() => setFragtAbbruch(false)} autoFocus>Weitermachen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
