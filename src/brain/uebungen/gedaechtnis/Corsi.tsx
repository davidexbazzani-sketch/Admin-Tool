// Corsi-Blockspanne (Gedächtnis): Neun unregelmäßig verteilte Blöcke; einige leuchten nacheinander auf,
// danach werden sie in derselben (oder umgekehrter) Reihenfolge angeklickt.
// Das räumliche Gegenstück zur Zahlenspanne: gemerkt werden Orte und ihre Reihenfolge, nicht Wörter.
//
// Stufen:   gleiche und umgekehrte Reihenfolge im Wechsel (siehe CORSI_STUFEN): 1–3 gleich 3/4/5 · 4 umgekehrt 4 · 5 gleich 6 · 6 umgekehrt 5 · 7 gleich 7 · 8–10 umgekehrt 6/7/8
// Ablauf:   4 Durchgänge; jeder Block leuchtet 0,6 s, dann 0,2 s Pause (0,8 s je Block)
// Folgen:   kein Block doppelt (also nie derselbe zweimal hintereinander); feste Anordnung ohne Raster
// Wertung:  fehlerfrei = 1; sonst höchstens 0,6 nach dem Anteil in richtiger Reihenfolge (siehe spanne.logik.ts).
//           Güte = Mittel der 4 Durchgänge. Tempo zählt nicht.
// Bedienung: Blöcke anklicken; Rücktaste nimmt den letzten Klick zurück (solange die Folge nicht voll ist).
// Dauer:    etwa 1 Minute. Kein eigener Duell-Ablauf (im Duell läuft derselbe Durchgang).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Undo2, X } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useTasten } from '../../ablauf/kit'
import { folgeWertung, spannenErgebnis, type FolgeWertung } from './spanne.logik'
import { BLOCK_AN_MS, BLOCK_PAUSE_MS, CORSI_BLOECKE, CORSI_BRETT, CORSI_RUNDEN, corsiFolge, corsiSoll, corsiStufe, corsiText } from './Corsi.logik'
import './gedaechtnis.css'

export * from './Corsi.logik'
export { folgeWertung, gemeinsameTeilfolge, spannenErgebnis, TEIL_HOECHSTENS } from './spanne.logik'
export type { FolgeWertung, SpannenErgebnis } from './spanne.logik'

type Phase = 'achtung' | 'zeigen' | 'eingabe' | 'auswertung'

/** fehlerfreie Durchgänge gehen von selbst weiter; nach einem Fehler bleibt die Auflösung stehen */
const WEITER_NACH_MS = 1200
/** nach dem letzten Klick kurz warten, damit der Block noch sichtbar aufleuchtet */
const WERTEN_NACH_MS = 380
/** so lange leuchtet ein angeklickter Block */
const KLICK_AN_MS = 240

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const cfg = useMemo(() => corsiStufe(stufe), [stufe])
  const { laenge, rueckwaerts } = cfg

  const [runde, setRunde] = useState(0)
  const [phase, setPhase] = useState<Phase>('achtung')
  /** welcher Block der Folge gerade dran ist … */
  const [idx, setIdx] = useState(0)
  /** … und ob er gerade leuchtet */
  const [an, setAn] = useState(false)
  const [klicks, setKlicks] = useState<number[]>([])
  /** zuletzt angeklickter Block (leuchtet kurz); `nr` unterscheidet zwei Klicks auf denselben Block */
  const [blitz, setBlitz] = useState<{ block: number; nr: number } | null>(null)
  const wertungen = useRef<FolgeWertung[]>([])
  const fertig = useRef(false)
  const melde = useRef(onFertig)
  melde.current = onFertig

  // jeder Durchgang aus seinem eigenen Zufalls-Zweig
  const folge = useMemo(() => corsiFolge(rng(start).zweig(runde), laenge), [start, runde, laenge])
  const soll = useMemo(() => corsiSoll(folge, rueckwaerts), [folge, rueckwaerts])

  // Ablauf: Achtung → Block an → Block aus → … → Eingabe
  useEffect(() => {
    if (fertig.current) return
    if (phase === 'achtung') {
      const t = setTimeout(() => { setIdx(0); setAn(true); setPhase('zeigen') }, runde > 0 ? 900 : rueckwaerts ? 1800 : 1200)
      return () => clearTimeout(t)
    }
    if (phase !== 'zeigen') return
    if (an) { const t = setTimeout(() => setAn(false), BLOCK_AN_MS); return () => clearTimeout(t) }
    const t = setTimeout(() => {
      if (idx + 1 >= laenge) setPhase('eingabe')
      else { setIdx(idx + 1); setAn(true) }
    }, BLOCK_PAUSE_MS)
    return () => clearTimeout(t)
  }, [phase, idx, an, laenge, runde, rueckwaerts])

  const klick = useCallback((block: number) => {
    if (phase !== 'eingabe' || fertig.current || klicks.length >= laenge) return
    setKlicks([...klicks, block])
    setBlitz({ block, nr: klicks.length })
  }, [phase, klicks, laenge])

  const zurueck = useCallback(() => {
    if (phase !== 'eingabe' || fertig.current || !klicks.length || klicks.length >= laenge) return
    setKlicks(klicks.slice(0, -1))
    setBlitz(null)
  }, [phase, klicks, laenge])

  useEffect(() => {
    if (!blitz) return
    const t = setTimeout(() => setBlitz(null), KLICK_AN_MS)
    return () => clearTimeout(t)
  }, [blitz])

  // Folge voll → auswerten
  useEffect(() => {
    if (phase !== 'eingabe' || klicks.length < laenge || fertig.current) return
    const t = setTimeout(() => {
      wertungen.current[runde] = folgeWertung(soll, klicks)
      setBlitz(null)
      setPhase('auswertung')
    }, WERTEN_NACH_MS)
    return () => clearTimeout(t)
  }, [phase, klicks, laenge, runde, soll])

  const weiter = useCallback(() => {
    if (phase !== 'auswertung' || fertig.current) return
    if (runde + 1 >= CORSI_RUNDEN) {
      fertig.current = true
      const e = spannenErgebnis(wertungen.current, laenge, CORSI_RUNDEN)
      melde.current({ leistung: e.leistung, richtig: e.richtig, gesamt: e.gesamt, text: corsiText(cfg, e.exakt) })
      return
    }
    // alles in einem Schritt zurücksetzen
    setKlicks([]); setIdx(0); setAn(false); setBlitz(null); setPhase('achtung'); setRunde(runde + 1)
  }, [phase, runde, laenge, cfg])

  const wertung = phase === 'auswertung' ? wertungen.current[runde] : undefined
  useEffect(() => {
    if (phase !== 'auswertung' || !wertungen.current[runde]?.exakt) return
    const t = setTimeout(weiter, WEITER_NACH_MS)
    return () => clearTimeout(t)
  }, [phase, runde, weiter])

  useTasten({ Backspace: zurueck, Enter: weiter, ' ': weiter }, phase === 'eingabe' || phase === 'auswertung')

  const exaktBisher = wertungen.current.filter(w => w?.exakt).length
  const anStelle = wertung ? soll.filter((b, i) => klicks[i] === b).length : 0
  const aufgabe = phase === 'achtung' ? `Gleich leuchten ${laenge} Blöcke`
    : phase === 'zeigen' ? (rueckwaerts ? 'Merke dir die Reihenfolge – du klickst sie gleich rückwärts' : 'Merke dir die Reihenfolge')
      : phase === 'eingabe' ? (rueckwaerts ? 'Klicke die Blöcke rückwärts: den letzten zuerst' : 'Klicke die Blöcke in derselben Reihenfolge')
        : wertung?.exakt ? 'Richtig!' : 'Nicht ganz – die Zahlen zeigen die richtige Reihenfolge'

  const leuchtet = phase === 'zeigen' && an ? folge[idx] : phase === 'eingabe' && blitz ? blitz.block : -1
  // wie viele Punkte unten gefüllt sind: gezeigte bzw. angeklickte Blöcke
  const gefuellt = phase === 'zeigen' ? idx + 1 : phase === 'eingabe' ? klicks.length : 0

  return (
    <div className="bt-lauf" style={{ gap: 14 }} data-bt-frei="corsi" data-phase={phase} data-runde={runde} data-idx={idx} data-klicks={klicks.length}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Durchgang {runde + 1} / {CORSI_RUNDEN}</span>}
        mitte={<Balken anteil={(runde + (phase === 'auswertung' ? 1 : phase === 'eingabe' ? 0.6 : 0)) / CORSI_RUNDEN} />}
        rechts={<span className="bt-chip bt-chip-gut bt-zahl">{exaktBisher} fehlerfrei</span>}
      />

      <div className="bt-ged-kopfzeile">
        <span className="bt-ged-modus" data-rueck={rueckwaerts ? '' : undefined} data-bt-modus>
          {rueckwaerts ? <><ArrowLeft size={15} />Rückwärts</> : <>Gleiche Reihenfolge<ArrowRight size={15} /></>}
        </span>
        <span className="bt-aufgabe" data-bt-aufgabe>{aufgabe}</span>
      </div>

      <div className="bt-ged-brett" data-rueck={rueckwaerts ? '' : undefined} data-bt-brett
        style={{ width: CORSI_BRETT.breite, height: CORSI_BRETT.hoehe }}>
        {CORSI_BLOECKE.map((b, i) => {
          // Auflösung: Nummer = Stelle in der richtigen Reihenfolge, grün = dort hast du diesen Block geklickt
          const stelle = wertung ? soll.indexOf(i) : -1
          const getroffen = stelle >= 0 && klicks[stelle] === i
          return (
            <button key={i} type="button" className="bt-ged-block" data-block={i} tabIndex={-1}
              style={{ left: b.x, top: b.y, width: CORSI_BRETT.block, height: CORSI_BRETT.block }}
              data-an={leuchtet === i ? '' : undefined}
              data-gut={stelle >= 0 && getroffen ? '' : undefined}
              data-schlecht={stelle >= 0 && !getroffen ? '' : undefined}
              disabled={phase !== 'eingabe' || klicks.length >= laenge}
              aria-label={`Block ${i + 1}`}
              onMouseDown={e => e.preventDefault()} onClick={() => klick(i)}>
              {stelle >= 0 ? stelle + 1 : ''}
            </button>
          )
        })}
      </div>

      <div className="bt-ged-unterzeile">
        {phase !== 'auswertung' && (
          <>
            <div className="bt-ged-punkte" aria-hidden="true" data-bt-punkte>
              {soll.map((_, i) => <span key={i} className="bt-ged-punkt" data-an={i < gefuellt ? '' : undefined} />)}
            </div>
            {phase === 'eingabe' && (
              <>
                <span className="bt-klein bt-leise bt-zahl">{klicks.length} von {laenge}</span>
                <button type="button" className="bt-knopf bt-knopf-leise bt-ged-knopf" data-klein="" data-bt-zurueck-klick tabIndex={-1}
                  onMouseDown={e => e.preventDefault()} onClick={zurueck} disabled={!klicks.length || klicks.length >= laenge}>
                  <Undo2 size={14} />Letzten Klick zurück
                </button>
                <span className="bt-klein bt-stumm"><Taste>⌫</Taste></span>
              </>
            )}
          </>
        )}
        {phase === 'auswertung' && wertung && (
          <>
            <span className="bt-ged-meldung" data-art={wertung.exakt ? 'gut' : 'schlecht'} data-bt-auswertung>
              {wertung.exakt
                ? <><Check size={16} />Alle {laenge} Blöcke in der richtigen Reihenfolge</>
                : <><X size={16} />{anStelle} von {laenge} Blöcken an der richtigen Stelle</>}
            </span>
            {!wertung.exakt && (
              <>
                <button type="button" className="bt-knopf bt-ged-knopf" data-bt-weiter onClick={weiter}>Weiter</button>
                <span className="bt-klein bt-stumm">oder <Taste>Enter</Taste></span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
