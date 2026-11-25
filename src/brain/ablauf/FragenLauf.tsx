// Gemeinsamer Ablauf für alle Aufgaben mit Auswahl oder Eingabe.
//  • Training: feste Anzahl Aufgaben, nach jeder Antwort Rückmeldung + Erklärung.
//  • Sprint/Duell: feste Dauer, so viele Aufgaben wie möglich, keine Erklärungen.
// Tasten: 1–8 wählt, Enter/Leertaste geht weiter. Die Aufgaben kommen aus einem FragenGenerator
// (gleicher Startwert = gleiche Folge → im Duell bekommen beide dieselben Aufgaben).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Frage, FragenGenerator, Rohergebnis } from '../kern/typen'
import { guete, tempoAus } from '../kern/wertung'
import { eingabeRichtig } from '../aufgaben/hilfen'
import { Zeige } from '../figuren/Zeige'
import { zieheFrage } from './ohneWiederholung'

export interface FragenLaufProps {
  erzeuge: FragenGenerator
  stufe: number
  start: number
  /** Training: Anzahl Aufgaben (Standard 10) */
  anzahl?: number
  /** gesetzt = Sprint/Duell: Dauer in Sekunden */
  dauerSek?: number
  /** Erklärungen zeigen (Training) */
  mitErklaerung?: boolean
  /** zuletzt gesehene Aufgaben (Hashes) — werden gemieden, wenn es anders geht. Im Duell NICHT setzen (beide brauchen dieselbe Folge). */
  vermeide?: ReadonlySet<number>
  /** meldet jede gezeigte Aufgabe (Hash ihrer Kennung) */
  onGezeigt?: (hash: number) => void
  onPunkte?: (punkte: number) => void
  onFertig: (e: Rohergebnis) => void
}

interface Antwort { richtig: boolean; ms: number; zeitMs: number }

const median = (w: number[]): number => {
  if (!w.length) return 0
  const s = w.slice().sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
/** Duell-Punkte: +10 je richtige, −5 je falsche Antwort, nie unter 0 */
export const duellPunkte = (richtig: number, falsch: number): number => Math.max(0, richtig * 10 - falsch * 5)

export default function FragenLauf({ erzeuge, stufe, start, anzahl = 10, dauerSek, mitErklaerung = true, vermeide, onGezeigt, onPunkte, onFertig }: FragenLaufProps) {
  const sprint = !!dauerSek
  const [nr, setNr] = useState(0)
  const [stand, setStand] = useState<'frage' | 'antwort'>('frage')
  /** Nummer der Aufgabe, deren Merkphase schon vorbei ist */
  const [vorabFertig, setVorabFertig] = useState(-1)
  const [gewaehlt, setGewaehlt] = useState<number | null>(null)
  const [eingabe, setEingabe] = useState('')
  const [eingabeOk, setEingabeOk] = useState<boolean | null>(null)
  const [restSprint, setRestSprint] = useState(dauerSek ?? 0)
  const antworten = useRef<Antwort[]>([])
  const frageStart = useRef(performance.now())
  const fertig = useRef(false)
  const feld = useRef<HTMLInputElement>(null)

  // Jede Aufgabe kommt aus ihrem eigenen Zufalls-Zweig; was in diesem Durchgang schon dran war, wird nicht
  // wiederholt (siehe ohneWiederholung.ts). Die Folge wird gemerkt, damit ein erneutes Rendern nichts ändert.
  const folge = useRef<{ erzeuge: FragenGenerator; start: number; stufe: number; fragen: Frage[]; kennungen: string[]; hashes: number[] } | null>(null)
  const vermeideFest = useRef(vermeide)   // Stand vom Beginn des Durchgangs
  const frage: Frage = useMemo(() => {
    let f = folge.current
    if (!f || f.erzeuge !== erzeuge || f.start !== start || f.stufe !== stufe) f = folge.current = { erzeuge, start, stufe, fragen: [], kennungen: [], hashes: [] }
    for (let i = f.fragen.length; i <= nr; i++) {
      const z = zieheFrage(erzeuge, start, stufe, i, new Set(f.kennungen), vermeideFest.current)
      f.fragen[i] = z.frage; f.kennungen[i] = z.kennung; f.hashes[i] = z.hash
    }
    return f.fragen[nr]
  }, [erzeuge, start, nr, stufe])
  const gezeigtRef = useRef(onGezeigt)
  gezeigtRef.current = onGezeigt
  useEffect(() => { const h = folge.current?.hashes[nr]; if (h !== undefined) gezeigtRef.current?.(h) }, [nr, frage])
  const zeitMs = (frage.zeitSek ?? 45) * 1000
  const phase: 'vorab' | 'frage' | 'antwort' = frage.vorab && vorabFertig !== nr ? 'vorab' : stand

  const schliesseAb = useCallback(() => {
    if (fertig.current) return
    fertig.current = true
    const a = antworten.current
    const richtig = a.filter(x => x.richtig).length
    const gesamt = sprint ? a.length : anzahl
    const tempi = a.filter(x => x.richtig).map(x => tempoAus(x.ms, x.zeitMs * 0.25, x.zeitMs))
    const tempo = tempi.length ? tempi.reduce((s, x) => s + x, 0) / tempi.length : 0
    // Sprint: Güte aus Genauigkeit und Menge (Richtwert: eine richtige Antwort je 6 s)
    const leistung = sprint
      ? guete(a.length ? richtig / a.length : 0, Math.min(1, richtig / Math.max(1, (dauerSek ?? 60) / 6)))
      : guete(gesamt ? richtig / gesamt : 0, tempo)
    onFertig({
      leistung, richtig, gesamt,
      rtMs: Math.round(median(a.filter(x => x.richtig).map(x => x.ms))) || undefined,
      duellPunkte: duellPunkte(richtig, a.length - richtig),
    })
  }, [anzahl, dauerSek, onFertig, sprint])

  const weiter = useCallback(() => {
    if (fertig.current) return
    if (!sprint && nr + 1 >= anzahl) { schliesseAb(); return }
    // alles in EINEM Schritt zurücksetzen — sonst wäre die nächste Aufgabe kurz „beantwortet“ zu sehen
    setGewaehlt(null); setEingabe(''); setEingabeOk(null); setStand('frage')
    setNr(n => n + 1)
  }, [anzahl, nr, schliesseAb, sprint])

  const werte = useCallback((richtig: boolean) => {
    antworten.current.push({ richtig, ms: performance.now() - frageStart.current, zeitMs })
    const r = antworten.current.filter(x => x.richtig).length
    onPunkte?.(duellPunkte(r, antworten.current.length - r))
    setStand('antwort')
  }, [onPunkte, zeitMs])

  const waehle = useCallback((i: number) => {
    if (phase !== 'frage' || fertig.current) return
    setGewaehlt(i)
    werte(i === frage.richtig)
  }, [frage.richtig, phase, werte])

  const sendeEingabe = useCallback(() => {
    if (phase !== 'frage' || fertig.current || !eingabe.trim()) return
    const ok = eingabeRichtig(frage, eingabe)
    setEingabeOk(ok)
    werte(ok)
  }, [eingabe, frage, phase, werte])

  // neue Aufgabe: Merkphase oder gleich die Frage
  useEffect(() => {
    frageStart.current = performance.now()
    if (!frage.vorab) return
    const t = setTimeout(() => { frageStart.current = performance.now(); setVorabFertig(nr) }, frage.vorab.sek * 1000)
    return () => clearTimeout(t)
  }, [frage, nr])

  useEffect(() => { if (phase === 'frage' && frage.eingabe) feld.current?.focus() }, [phase, frage])

  // Zeit je Aufgabe (nur Training): abgelaufen = falsch
  useEffect(() => {
    if (sprint || phase !== 'frage') return
    const t = setTimeout(() => { if (!fertig.current) werte(false) }, zeitMs)
    return () => clearTimeout(t)
  }, [phase, sprint, werte, zeitMs, nr])

  // nach der Antwort: richtig → kurz zeigen und weiter; falsch → im Training stehen lassen (Erklärung lesen)
  const letzteRichtig = phase === 'antwort' && antworten.current[antworten.current.length - 1]?.richtig
  useEffect(() => {
    if (phase !== 'antwort') return
    const warte = sprint ? (letzteRichtig ? 160 : 420) : letzteRichtig ? 750 : mitErklaerung ? 0 : 1100
    if (!warte) return
    const t = setTimeout(weiter, warte)
    return () => clearTimeout(t)
  }, [phase, sprint, letzteRichtig, mitErklaerung, weiter])

  // Sprint-Uhr
  useEffect(() => {
    if (!sprint) return
    const ende = performance.now() + (dauerSek ?? 0) * 1000
    const t = setInterval(() => {
      const rest = Math.max(0, Math.ceil((ende - performance.now()) / 1000))
      setRestSprint(rest)
      if (rest <= 0) { clearInterval(t); schliesseAb() }
    }, 200)
    return () => clearInterval(t)
  }, [sprint, dauerSek, schliesseAb])

  // Tasten
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (phase === 'antwort' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); weiter(); return }
      if (phase === 'frage' && !frage.eingabe && /^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1
        if (i < frage.optionen.length) { e.preventDefault(); waehle(i) }
      }
    }
    window.addEventListener('keydown', taste)
    return () => window.removeEventListener('keydown', taste)
  }, [phase, frage, waehle, weiter])

  const spalten = frage.spalten ?? (frage.optionen.length <= 2 ? 2 : frage.optionen.length <= 4 ? (frage.optionen.every(o => o.art === 'text') ? 2 : 4) : frage.optionen.length === 5 ? 5 : 4)
  const richtigBisher = antworten.current.filter(x => x.richtig).length

  return (
    <div className="bt-lauf" data-bt-lauf data-nr={nr} data-phase={phase}>
      <div className="bt-lauf-kopf">
        {sprint ? (
          <>
            <span className="bt-chip bt-chip-warm bt-zahl" data-bt-rest>{restSprint} s</span>
            <div className="bt-balken" style={{ flex: 1 }}><i style={{ width: `${(restSprint / (dauerSek || 1)) * 100}%`, background: 'var(--bt-akzent2)' }} /></div>
            <span className="bt-chip bt-chip-akzent bt-zahl">{duellPunkte(richtigBisher, antworten.current.length - richtigBisher)} Punkte</span>
          </>
        ) : (
          <>
            <span className="bt-chip bt-zahl">{Math.min(nr + 1, anzahl)} / {anzahl}</span>
            <div className="bt-balken" style={{ flex: 1 }}><i style={{ width: `${((nr + (phase === 'antwort' ? 1 : 0)) / anzahl) * 100}%` }} /></div>
            <span className="bt-chip bt-chip-gut bt-zahl">{richtigBisher} richtig</span>
          </>
        )}
      </div>

      {!sprint && phase === 'frage' && (
        <div className="bt-uhr" aria-hidden="true"><i key={nr} style={{ animation: `bt-uhr-lauf ${zeitMs}ms linear forwards` }} /></div>
      )}
      {(sprint || phase !== 'frage') && <div className="bt-uhr" style={{ visibility: 'hidden' }} />}

      {phase === 'vorab' && frage.vorab ? (
        <div className="bt-ein" key={`v${nr}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="bt-aufgabe">{frage.vorab.hinweis ?? 'Präge dir das ein'}</div>
          <div className="bt-buehne"><Zeige d={frage.vorab.zeige} /></div>
          <div className="bt-uhr" style={{ maxWidth: 320 }}><i style={{ animation: `bt-uhr-lauf ${frage.vorab.sek * 1000}ms linear forwards` }} /></div>
        </div>
      ) : (
        <div className="bt-ein" key={`f${nr}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%' }}>
          <div className="bt-aufgabe" data-bt-aufgabe>{frage.aufgabe}</div>
          {frage.zeige && <div className="bt-buehne"><Zeige d={frage.zeige} /></div>}

          {frage.eingabe ? (
            <form onSubmit={e => { e.preventDefault(); if (phase === 'antwort') weiter(); else sendeEingabe() }} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input ref={feld} className="bt-eingabe" data-bt-eingabe value={eingabe} disabled={phase === 'antwort'}
                inputMode={frage.eingabe === 'zahl' ? 'numeric' : 'text'} autoComplete="off" spellCheck={false}
                data-zustand={eingabeOk === null ? undefined : eingabeOk ? 'richtig' : 'falsch'}
                onChange={e => setEingabe(frage.eingabe === 'zahl' ? e.target.value.replace(/[^0-9,.\-−]/g, '') : e.target.value)}
                aria-label="Antwort" />
              {phase === 'frage' && <button type="submit" className="bt-knopf" disabled={!eingabe.trim()}>OK</button>}
            </form>
          ) : (
            <div className="bt-optionen" style={{ gridTemplateColumns: `repeat(${spalten}, minmax(0, 1fr))` }}>
              {frage.optionen.map((o, i) => {
                const zustand = phase !== 'antwort' ? undefined
                  : i === frage.richtig ? 'richtig' : i === gewaehlt ? 'falsch' : 'matt'
                return (
                  <button key={i} type="button" className="bt-option" data-bt-option={i} data-zustand={zustand}
                    disabled={phase !== 'frage'} onClick={() => waehle(i)}>
                    <kbd>{i + 1}</kbd>
                    <Zeige d={o} rolle="auswahl" />
                  </button>
                )
              })}
            </div>
          )}

          {phase === 'antwort' && !sprint && (
            <div className="bt-erklaerung bt-ein" data-bt-erklaerung>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                <b style={{ color: letzteRichtig ? 'var(--bt-gut)' : 'var(--bt-schlecht)' }}>
                  {letzteRichtig ? 'Richtig' : gewaehlt === null && eingabeOk === null ? 'Zeit abgelaufen' : 'Nicht ganz'}
                  {frage.eingabe && !letzteRichtig && frage.loesungen?.[0] ? ` — richtig wäre: ${frage.loesungen[0]}` : ''}
                </b>
                {!letzteRichtig && <button type="button" className="bt-knopf" data-bt-weiter onClick={weiter}>Weiter</button>}
              </div>
              {mitErklaerung && frage.erklaerung && !letzteRichtig && <p className="bt-leise" style={{ margin: '6px 0 0' }}>{frage.erklaerung}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
