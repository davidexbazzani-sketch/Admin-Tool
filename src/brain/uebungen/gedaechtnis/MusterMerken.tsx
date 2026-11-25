// Muster merken (Gedächtnis): Ein Gitter zeigt kurz einige leuchtende Felder und wird dann leer —
// danach werden genau diese Felder wieder markiert.
// Trainiert das visuelle Kurzzeitgedächtnis: ein Bild auf einen Blick erfassen und behalten.
//
// Stufe:     1    2    3    4    5    6    7    8    9    10
// Gitter:    3×3  3×3  4×4  4×4  4×4  5×5  5×5  5×5  6×6  6×6
// Felder:    3    4    5    6    7    8    9    10   11   12
// Zeigezeit: 2,40 s (Stufe 1), je Stufe 0,06 s kürzer, bis 1,86 s (Stufe 10)
// Ablauf:   5 Muster. Sind so viele Felder markiert wie geleuchtet haben, wird von selbst gewertet;
//           mit „Fertig“ (Enter) geht es auch mit weniger. Ein markiertes Feld lässt sich wieder abwählen.
// Wertung:  je Muster (richtige − falsche Felder) / Felder, nie unter 0. Güte = Mittel der 5 Muster. Tempo zählt nicht.
// Dauer:    etwa 1 Minute. Kein eigener Duell-Ablauf (im Duell läuft derselbe Durchgang).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, Taste, useTasten } from '../../ablauf/kit'
import { MUSTER_RUNDEN, musterErgebnis, musterFelder, musterStufe, musterText, musterWertung, type MusterWertung } from './MusterMerken.logik'
import './gedaechtnis.css'

export * from './MusterMerken.logik'

type Phase = 'achtung' | 'zeigen' | 'eingabe' | 'auswertung'

/** fehlerfreie Muster gehen von selbst weiter; nach einem Fehler bleibt die Auflösung stehen */
const WEITER_NACH_MS = 1300
/** nach dem letzten Feld kurz warten (so lange lässt es sich noch abwählen) */
const WERTEN_NACH_MS = 420
/** größte Kantenlänge des Gitters in Pixeln (ohne Rand) */
const GITTER_PX = 360

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const cfg = useMemo(() => musterStufe(stufe), [stufe])
  const { n, k } = cfg

  const [runde, setRunde] = useState(0)
  const [phase, setPhase] = useState<Phase>('achtung')
  const [markiert, setMarkiert] = useState<number[]>([])
  const wertungen = useRef<MusterWertung[]>([])
  const fertig = useRef(false)
  const melde = useRef(onFertig)
  melde.current = onFertig

  // jedes Muster aus seinem eigenen Zufalls-Zweig
  const muster = useMemo(() => musterFelder(rng(start).zweig(runde), n, k), [start, runde, n, k])

  // Ablauf: Achtung → Muster zeigen → Eingabe
  useEffect(() => {
    if (fertig.current) return
    if (phase === 'achtung') { const t = setTimeout(() => setPhase('zeigen'), runde > 0 ? 700 : 1000); return () => clearTimeout(t) }
    if (phase === 'zeigen') { const t = setTimeout(() => setPhase('eingabe'), cfg.zeigeMs); return () => clearTimeout(t) }
  }, [phase, runde, cfg.zeigeMs])

  const werte = useCallback(() => {
    if (phase !== 'eingabe' || fertig.current || !markiert.length) return
    wertungen.current[runde] = musterWertung(muster, markiert)
    setPhase('auswertung')
  }, [phase, markiert, runde, muster])

  const klick = useCallback((feld: number) => {
    if (phase !== 'eingabe' || fertig.current) return
    if (markiert.includes(feld)) setMarkiert(markiert.filter(x => x !== feld))
    else if (markiert.length < k) setMarkiert([...markiert, feld])
  }, [phase, markiert, k])

  // so viele markiert wie geleuchtet haben → von selbst werten
  useEffect(() => {
    if (phase !== 'eingabe' || markiert.length < k) return
    const t = setTimeout(werte, WERTEN_NACH_MS)
    return () => clearTimeout(t)
  }, [phase, markiert, k, werte])

  const weiter = useCallback(() => {
    if (phase !== 'auswertung' || fertig.current) return
    if (runde + 1 >= MUSTER_RUNDEN) {
      fertig.current = true
      const e = musterErgebnis(wertungen.current, k, MUSTER_RUNDEN)
      melde.current({ leistung: e.leistung, richtig: e.richtig, gesamt: e.gesamt, text: musterText(cfg, e.fehlerfrei) })
      return
    }
    // alles in einem Schritt zurücksetzen
    setMarkiert([]); setPhase('achtung'); setRunde(runde + 1)
  }, [phase, runde, k, cfg])

  const wertung = phase === 'auswertung' ? wertungen.current[runde] : undefined
  useEffect(() => {
    if (phase !== 'auswertung' || !wertungen.current[runde]?.fehlerfrei) return
    const t = setTimeout(weiter, WEITER_NACH_MS)
    return () => clearTimeout(t)
  }, [phase, runde, weiter])

  useTasten({ Enter: () => { if (phase === 'eingabe') werte(); else weiter() }, ' ': weiter }, phase === 'eingabe' || phase === 'auswertung')

  const fehlerfreiBisher = wertungen.current.filter(w => w?.fehlerfrei).length
  const kante = Math.min(92, Math.floor((GITTER_PX - (n - 1) * 8) / n))
  const aufgabe = phase === 'achtung' ? `Achtung – gleich leuchten ${k} Felder`
    : phase === 'zeigen' ? `Präge dir die ${k} leuchtenden Felder ein`
      : phase === 'eingabe' ? `Welche ${k} Felder waren es? Klicke sie an`
        : wertung?.fehlerfrei ? 'Richtig!' : 'Nicht ganz'

  return (
    <div className="bt-lauf" style={{ gap: 14 }} data-bt-frei="muster" data-phase={phase} data-runde={runde} data-markiert={markiert.length}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">Muster {runde + 1} / {MUSTER_RUNDEN}</span>}
        mitte={<Balken anteil={(runde + (phase === 'auswertung' ? 1 : phase === 'eingabe' ? 0.6 : 0)) / MUSTER_RUNDEN} />}
        rechts={<span className="bt-chip bt-chip-gut bt-zahl">{fehlerfreiBisher} fehlerfrei</span>}
      />

      <div className="bt-aufgabe" data-bt-aufgabe>{aufgabe}</div>

      {/* Restzeit der Zeige-Phase; sonst unsichtbar, damit nichts springt */}
      <div className="bt-uhr" style={{ maxWidth: 360, visibility: phase === 'zeigen' ? 'visible' : 'hidden' }} aria-hidden="true">
        {phase === 'zeigen' && <i key={runde} style={{ animation: `bt-uhr-lauf ${cfg.zeigeMs}ms linear forwards` }} />}
      </div>

      <div className="bt-ged-mu-gitter" style={{ gridTemplateColumns: `repeat(${n}, ${kante}px)`, gridAutoRows: `${kante}px` }} data-bt-gitter>
        {Array.from({ length: n * n }, (_, i) => {
          const imMuster = muster.includes(i)
          const gewaehlt = markiert.includes(i)
          const zeigt = phase === 'zeigen' && imMuster
          return (
            <button key={i} type="button" className="bt-feld" data-feld={i} tabIndex={-1}
              data-an={zeigt || (phase === 'eingabe' && gewaehlt) ? '' : undefined}
              data-gut={wertung && imMuster && gewaehlt ? '' : undefined}
              data-schlecht={wertung && !imMuster && gewaehlt ? '' : undefined}
              data-verpasst={wertung && imMuster && !gewaehlt ? '' : undefined}
              data-fest={phase !== 'eingabe' ? '' : undefined}
              disabled={phase !== 'eingabe'}
              aria-label={`Feld ${i + 1}`} aria-pressed={phase === 'eingabe' ? gewaehlt : undefined}
              onMouseDown={e => e.preventDefault()} onClick={() => klick(i)}>
              {wertung && imMuster && gewaehlt && <Check size={Math.round(kante * 0.36)} />}
              {wertung && !imMuster && gewaehlt && <X size={Math.round(kante * 0.36)} />}
            </button>
          )
        })}
      </div>

      <div className="bt-ged-unterzeile">
        {(phase === 'achtung' || phase === 'zeigen') && <span className="bt-klein bt-leise">Gitter {n}×{n} · {k} Felder</span>}
        {phase === 'eingabe' && (
          <>
            <span className="bt-chip bt-zahl" data-bt-zaehler>{markiert.length} von {k} markiert</span>
            <button type="button" className="bt-knopf bt-knopf-leise bt-ged-knopf" data-klein="" data-bt-fertig tabIndex={-1}
              onMouseDown={e => e.preventDefault()} onClick={werte} disabled={!markiert.length}>Fertig</button>
            <span className="bt-klein bt-stumm"><Taste>Enter</Taste> · nochmal klicken wählt ab</span>
          </>
        )}
        {phase === 'auswertung' && wertung && (
          <>
            <span className="bt-ged-meldung" data-art={wertung.fehlerfrei ? 'gut' : 'schlecht'} data-bt-auswertung>
              {wertung.fehlerfrei
                ? <><Check size={16} />Alle {k} Felder richtig</>
                : <>{wertung.richtig} richtig · {wertung.falsch} falsch · {wertung.verpasst} übersehen</>}
            </span>
            {!wertung.fehlerfrei && (
              <>
                <span className="bt-ged-legende" aria-hidden="true">
                  <span><i data-gut="" />richtig</span>
                  <span><i data-schlecht="" />falsch</span>
                  <span><i data-verpasst="" />übersehen</span>
                </span>
                <button type="button" className="bt-knopf bt-ged-knopf" data-bt-weiter onClick={weiter}>Weiter</button>
                <span className="bt-klein bt-stumm"><Taste>Enter</Taste></span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
