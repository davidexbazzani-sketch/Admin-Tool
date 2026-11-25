// Zahlenspanne (Gedächtnis): Ziffern erscheinen einzeln, danach werden sie eingetippt —
// vorwärts (gleiche Reihenfolge) oder rückwärts (letzte Ziffer zuerst).
// Vorwärts misst das reine Behalten, rückwärts zusätzlich das Umordnen im Kopf (Arbeitsgedächtnis).
//
// Stufen:   vorwärts und rückwärts im Wechsel (siehe SPANNE_STUFEN): 1–3 vorwärts 3/4/5 · 4 rückwärts 4 · 5 vorwärts 6 · 6 rückwärts 5 · 7 vorwärts 7 · 8–10 rückwärts 6/7/8
// Ablauf:   4 Durchgänge; jede Ziffer steht 0,8 s da, dann 0,2 s Pause (1 s je Ziffer)
// Folgen:   Ziffern 0–9, keine doppelt (also nie zwei gleiche hintereinander), keine Treppen wie 4-5-6
// Wertung:  fehlerfrei = 1; sonst höchstens 0,6 nach dem Anteil in richtiger Reihenfolge (siehe spanne.logik.ts).
//           Güte = Mittel der 4 Durchgänge. Tempo zählt nicht.
// Bedienung: Ziffern tippen oder anklicken, Rücktaste löscht, Enter bestätigt.
// Dauer:    etwa 1 Minute. Kein eigener Duell-Ablauf (im Duell läuft derselbe Durchgang).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Delete, X } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useTasten } from '../../ablauf/kit'
import { folgeWertung, spannenErgebnis, type FolgeWertung } from './spanne.logik'
import { SPANNE_RUNDEN, ZIFFER_AN_MS, ZIFFER_PAUSE_MS, spanneFolge, spanneSoll, spanneStufe, spanneText } from './Zahlenspanne.logik'
import './gedaechtnis.css'

export * from './Zahlenspanne.logik'
export { folgeWertung, gemeinsameTeilfolge, spannenErgebnis, TEIL_HOECHSTENS } from './spanne.logik'
export type { FolgeWertung, SpannenErgebnis } from './spanne.logik'

type Phase = 'achtung' | 'zeigen' | 'eingabe' | 'auswertung'

/** fehlerfreie Durchgänge gehen von selbst weiter; nach einem Fehler bleibt die Auflösung stehen */
const WEITER_NACH_MS = 1200

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const cfg = useMemo(() => spanneStufe(stufe), [stufe])
  const { laenge, rueckwaerts } = cfg

  const [runde, setRunde] = useState(0)
  const [phase, setPhase] = useState<Phase>('achtung')
  /** welche Ziffer gerade dran ist … */
  const [idx, setIdx] = useState(0)
  /** … und ob sie gerade zu sehen ist (dazwischen ist das Feld kurz leer) */
  const [sichtbar, setSichtbar] = useState(false)
  const [eingabe, setEingabe] = useState<number[]>([])
  const wertungen = useRef<FolgeWertung[]>([])
  const fertig = useRef(false)
  const melde = useRef(onFertig)
  melde.current = onFertig

  // jeder Durchgang aus seinem eigenen Zufalls-Zweig
  const folge = useMemo(() => spanneFolge(rng(start).zweig(runde), laenge), [start, runde, laenge])
  const soll = useMemo(() => spanneSoll(folge, rueckwaerts), [folge, rueckwaerts])

  // Ablauf: Achtung → Ziffer an → Ziffer aus → … → Eingabe
  useEffect(() => {
    if (fertig.current) return
    if (phase === 'achtung') {
      const t = setTimeout(() => { setIdx(0); setSichtbar(true); setPhase('zeigen') }, runde > 0 ? 900 : rueckwaerts ? 1800 : 1200)
      return () => clearTimeout(t)
    }
    if (phase !== 'zeigen') return
    if (sichtbar) { const t = setTimeout(() => setSichtbar(false), ZIFFER_AN_MS); return () => clearTimeout(t) }
    const t = setTimeout(() => {
      if (idx + 1 >= laenge) setPhase('eingabe')
      else { setIdx(idx + 1); setSichtbar(true) }
    }, ZIFFER_PAUSE_MS)
    return () => clearTimeout(t)
  }, [phase, idx, sichtbar, laenge, runde, rueckwaerts])

  const tippe = useCallback((z: number) => {
    if (phase !== 'eingabe' || fertig.current) return
    setEingabe(e => (e.length < laenge ? [...e, z] : e))
  }, [phase, laenge])

  const loesche = useCallback(() => {
    if (phase !== 'eingabe' || fertig.current) return
    setEingabe(e => e.slice(0, -1))
  }, [phase])

  const bestaetige = useCallback(() => {
    if (phase !== 'eingabe' || fertig.current || !eingabe.length) return
    wertungen.current[runde] = folgeWertung(soll, eingabe)
    setPhase('auswertung')
  }, [phase, eingabe, runde, soll])

  const weiter = useCallback(() => {
    if (phase !== 'auswertung' || fertig.current) return
    if (runde + 1 >= SPANNE_RUNDEN) {
      fertig.current = true
      const e = spannenErgebnis(wertungen.current, laenge, SPANNE_RUNDEN)
      melde.current({ leistung: e.leistung, richtig: e.richtig, gesamt: e.gesamt, text: spanneText(cfg, e.exakt) })
      return
    }
    // alles in einem Schritt zurücksetzen
    setEingabe([]); setIdx(0); setSichtbar(false); setPhase('achtung'); setRunde(runde + 1)
  }, [phase, runde, laenge, cfg])

  const wertung = phase === 'auswertung' ? wertungen.current[runde] : undefined
  useEffect(() => {
    if (phase !== 'auswertung' || !wertungen.current[runde]?.exakt) return
    const t = setTimeout(weiter, WEITER_NACH_MS)
    return () => clearTimeout(t)
  }, [phase, runde, weiter])

  const tasten = useMemo(() => {
    const k: Record<string, () => void> = {
      Backspace: loesche, Delete: loesche,
      Enter: () => { if (phase === 'eingabe') bestaetige(); else weiter() },
      ' ': weiter,
    }
    for (let z = 0; z <= 9; z++) k[String(z)] = () => tippe(z)
    return k
  }, [phase, tippe, loesche, bestaetige, weiter])
  useTasten(tasten, phase === 'eingabe' || phase === 'auswertung')

  const exaktBisher = wertungen.current.filter(w => w?.exakt).length
  const anStelle = wertung ? soll.filter((z, i) => eingabe[i] === z).length : 0
  const aufgabe = phase === 'achtung' ? `Gleich kommen ${laenge} Ziffern`
    : phase === 'zeigen' ? (rueckwaerts ? 'Merke dir die Ziffern – du tippst sie gleich rückwärts' : 'Merke dir die Ziffern')
      : phase === 'eingabe' ? (rueckwaerts ? 'Tippe die Ziffern rückwärts: die letzte zuerst' : 'Tippe die Ziffern in derselben Reihenfolge')
        : wertung?.exakt ? 'Richtig!' : 'Nicht ganz'

  return (
    <div className="bt-lauf" data-bt-frei="zahlenspanne" data-phase={phase} data-runde={runde} data-idx={idx}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Durchgang {runde + 1} / {SPANNE_RUNDEN}</span>}
        mitte={<Balken anteil={(runde + (phase === 'auswertung' ? 1 : phase === 'eingabe' ? 0.6 : 0)) / SPANNE_RUNDEN} />}
        rechts={<span className="bt-chip bt-chip-gut bt-zahl">{exaktBisher} fehlerfrei</span>}
      />

      <div className="bt-ged-kopfzeile">
        <span className="bt-ged-modus" data-rueck={rueckwaerts ? '' : undefined} data-bt-modus>
          {rueckwaerts ? <><ArrowLeft size={15} />Rückwärts</> : <>Vorwärts<ArrowRight size={15} /></>}
        </span>
        <span className="bt-aufgabe" data-bt-aufgabe>{aufgabe}</span>
      </div>

      {(phase === 'achtung' || phase === 'zeigen') && (
        <>
          <div className="bt-reiz bt-ged-zs-reiz" data-rueck={rueckwaerts ? '' : undefined} aria-live="off">
            {phase === 'zeigen' && sichtbar && <span key={idx} data-bt-ziffer>{folge[idx]}</span>}
          </div>
          <div className="bt-ged-punkte" aria-hidden="true">
            {folge.map((_, i) => <span key={i} className="bt-ged-punkt" data-an={phase === 'zeigen' && i <= idx ? '' : undefined} />)}
          </div>
          <div className="bt-klein bt-leise" style={{ minHeight: 18 }}>
            {rueckwaerts ? 'Beispiel: gezeigt 3 · 8 · 5 → du tippst 5 · 8 · 3' : 'Danach tippst du sie in derselben Reihenfolge'}
          </div>
        </>
      )}

      {phase === 'eingabe' && (
        <>
          <div className="bt-ged-schlitze" data-bt-schlitze>
            {soll.map((_, i) => (
              <div key={i} className="bt-ged-schlitz" data-aktiv={i === eingabe.length ? '' : undefined}>{eingabe[i] ?? ''}</div>
            ))}
          </div>
          <div className="bt-klein" style={{ color: rueckwaerts ? 'var(--bt-akzent2)' : 'var(--bt-leise)', fontWeight: rueckwaerts ? 600 : 400 }}>
            {rueckwaerts ? 'Ins erste Feld kommt die zuletzt gezeigte Ziffer' : 'von der ersten bis zur letzten Ziffer'}
          </div>
          <div className="bt-ged-pad" data-bt-pad>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(z => (
              <button key={z} type="button" className="bt-feld" data-ziffer={z} tabIndex={-1}
                onMouseDown={e => e.preventDefault()} onClick={() => tippe(z)} disabled={eingabe.length >= laenge}>{z}</button>
            ))}
            <button type="button" className="bt-feld" data-bt-loeschen tabIndex={-1} aria-label="Letzte Ziffer löschen"
              onMouseDown={e => e.preventDefault()} onClick={loesche} disabled={!eingabe.length}><Delete size={20} /></button>
            <button type="button" className="bt-feld" data-ziffer={0} tabIndex={-1}
              onMouseDown={e => e.preventDefault()} onClick={() => tippe(0)} disabled={eingabe.length >= laenge}>0</button>
            <button type="button" className="bt-knopf bt-ged-knopf" data-bt-ok tabIndex={-1}
              onMouseDown={e => e.preventDefault()} onClick={bestaetige} disabled={!eingabe.length}>OK</button>
          </div>
          <div className="bt-klein bt-stumm">
            <Taste>0</Taste>–<Taste>9</Taste> tippen · <Taste>⌫</Taste> löscht · <Taste>Enter</Taste> bestätigt
          </div>
        </>
      )}

      {phase === 'auswertung' && wertung && (
        <div className="bt-ein" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }} data-bt-auswertung>
          <div className="bt-ged-meldung" data-art={wertung.exakt ? 'gut' : 'schlecht'}>
            {wertung.exakt
              ? <><Check size={16} />Alle {laenge} Ziffern stimmen</>
              : <><X size={16} />{anStelle} von {laenge} Ziffern an der richtigen Stelle</>}
          </div>
          <div className="bt-ged-schlitz-zeile">
            <span className="bt-label">Deine Eingabe</span>
            <div className="bt-ged-schlitze">
              {soll.map((z, i) => (
                <div key={i} className="bt-ged-schlitz" data-gut={eingabe[i] === z ? '' : undefined} data-schlecht={eingabe[i] === z ? undefined : ''}>{eingabe[i] ?? ''}</div>
              ))}
            </div>
          </div>
          {!wertung.exakt && (
            <>
              <div className="bt-ged-schlitz-zeile">
                <span className="bt-label">Richtig wäre</span>
                <div className="bt-ged-schlitze" data-bt-loesung>
                  {soll.map((z, i) => <div key={i} className="bt-ged-schlitz">{z}</div>)}
                </div>
              </div>
              {rueckwaerts && (
                <div className="bt-ged-schlitz-zeile">
                  <span className="bt-label">Gezeigt wurde</span>
                  <div className="bt-ged-schlitze" data-klein="">
                    {folge.map((z, i) => <div key={i} className="bt-ged-schlitz">{z}</div>)}
                  </div>
                </div>
              )}
              <div className="bt-ged-unterzeile">
                <button type="button" className="bt-knopf bt-ged-knopf" data-bt-weiter onClick={weiter}>Weiter</button>
                <span className="bt-klein bt-stumm">oder <Taste>Enter</Taste></span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
