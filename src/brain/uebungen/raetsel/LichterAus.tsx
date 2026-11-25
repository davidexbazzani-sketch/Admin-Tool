// Lichter aus (Rätsel): Ein Klick schaltet das Feld und seine Nachbarn oben, unten, links und rechts um.
// Ziel: alle Lichter aus — mit möglichst wenigen Klicks. Trainiert vorausschauendes Planen: die Wirkung
// mehrerer Schritte im Kopf überlagern.
//
// Stufen: 3×3 (Stufe 1–2), 4×4 (3–4), 5×5 (5–7), 6×6 (8–10); die kürzeste Lösung wächst von 2–3 auf 18 Klicks.
//         Stufe 1–2: 3 Bretter je Durchgang, 3–6: 2 Bretter, ab 7: 1 Brett. Tabelle, Erzeugung, Par und
//         Wertung stehen in LichterAus.logik.ts.
// Bedienung: Feld anklicken. „Zurücksetzen“ (Taste R) stellt das Brett wieder her — die Klicks zählen weiter.
//            Angezeigt werden die eigenen Klicks und das Par (kleinste mögliche Zahl von Klicks).
//            „Aufgeben“ zeigt kurz, welche Felder noch zu klicken gewesen wären.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Flag, Lightbulb, RotateCcw } from 'lucide-react'
import type { FreiProps, Rohergebnis } from '../../kern/typen'
import { Balken, KopfZeile, Taste, useStoppuhr, useTasten } from '../../ablauf/kit'
import { lichterAufgabeLeistung, lichterAus, lichterDurchgang, lichterKlick, lichterLeistung, lichterLoese, lichterRichtSek } from './LichterAus.logik'
import './raetsel.css'

const zeitText = (sek: number): string => `${Math.floor(sek / 60)}:${String(Math.floor(sek % 60)).padStart(2, '0')}`
/** kurze Pause zwischen zwei Brettern (zählt nicht zur Zeit) */
const PAUSE_MS = 900

/** Laufende Zeit — eigenes Bauteil, damit nicht das ganze Brett zehnmal je Sekunde neu gezeichnet wird. */
function Uhr({ aktiv }: { aktiv: boolean }) {
  const sek = useStoppuhr(aktiv)
  return <span className="bt-chip bt-chip-akzent bt-zahl" data-bt-zeit>{zeitText(sek)}</span>
}

/** „Aufgeben“ mit Rückfrage: erst der zweite Klick (innerhalb von 3 s) gilt. */
function AufgebenKnopf({ onAufgeben, gesperrt }: { onAufgeben: () => void; gesperrt?: boolean }) {
  const [sicher, setSicher] = useState(false)
  useEffect(() => { if (!sicher) return; const t = setTimeout(() => setSicher(false), 3000); return () => clearTimeout(t) }, [sicher])
  return (
    <button type="button" className="bt-knopf bt-knopf-leise bt-raetsel-klein" disabled={gesperrt} data-bt-aufgeben
      onClick={() => { if (sicher) { setSicher(false); onAufgeben() } else setSicher(true) }}>
      <Flag size={14} />{sicher ? 'Wirklich aufgeben?' : 'Aufgeben'}
    </button>
  )
}

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const bretter = useMemo(() => lichterDurchgang(start, stufe), [start, stufe])
  const [nr, setNr] = useState(0)
  const brett = bretter[nr]
  const n = brett.n
  const [an, setAn] = useState<boolean[]>(() => bretter[0].an.slice())
  const [zuege, setZuege] = useState(0)                 // Klicks auf diesem Brett
  const [pause, setPause] = useState(false)             // Brett gelöst, das nächste kommt gleich
  const [ende, setEnde] = useState<null | 'geloest' | 'aufgegeben'>(null)
  const [zeige, setZeige] = useState<number[]>([])      // nach „Aufgeben“: diese Felder hätten gefehlt
  const summe = useRef({ zuege: 0, par: 0, richtMs: 0, geloest: 0 })
  const beginn = useRef(performance.now())
  const fertig = useRef(false)
  const zeitgeber = useRef<ReturnType<typeof setTimeout>>()
  const melde = useRef(onFertig)
  melde.current = onFertig
  useEffect(() => () => clearTimeout(zeitgeber.current), [])

  const schliesse = (art: 'geloest' | 'aufgegeben', offeneZuege: number) => {
    if (fertig.current) return
    fertig.current = true
    const s = summe.current
    const ms = Math.max(1, performance.now() - beginn.current - s.geloest * PAUSE_MS + (art === 'geloest' ? PAUSE_MS : 0))
    const anzahl = bretter.length
    const roh: Rohergebnis = art === 'geloest'
      ? {
        leistung: lichterLeistung(s.zuege, s.par, ms, s.richtMs), richtig: anzahl, gesamt: anzahl,
        text: `${anzahl === 1 ? `${n}×${n}` : `${anzahl} Bretter`} gelöst · ${s.zuege} Klicks (Par ${s.par}) · ${zeitText(ms / 1000)} min`,
      }
      : {
        leistung: lichterAufgabeLeistung(s.geloest, anzahl), richtig: s.geloest, gesamt: anzahl,
        text: `aufgegeben nach ${s.zuege + offeneZuege} Klicks`,
      }
    setEnde(art)
    zeitgeber.current = setTimeout(() => melde.current(roh), art === 'geloest' ? 1200 : 3500)
  }

  const klick = (i: number) => {
    if (ende || pause) return
    const neu = lichterKlick(an, n, i)
    const z = zuege + 1
    setAn(neu)
    setZuege(z)
    if (!lichterAus(neu)) return
    const s = summe.current
    s.zuege += z; s.par += brett.par; s.richtMs += lichterRichtSek(n, brett.par) * 1000; s.geloest++
    if (nr + 1 >= bretter.length) { schliesse('geloest', 0); return }
    setPause(true)
    zeitgeber.current = setTimeout(() => {
      setNr(nr + 1); setAn(bretter[nr + 1].an.slice()); setZuege(0); setPause(false)
    }, PAUSE_MS)
  }

  const zurueck = () => { if (!ende && !pause) setAn(brett.an.slice()) }
  const gibAuf = () => {
    if (ende || pause) return
    setZeige(lichterLoese(an, n) ?? [])
    schliesse('aufgegeben', zuege)
  }
  useTasten({ r: zurueck }, ende === null)

  const kante = [0, 0, 0, 96, 84, 74, 64][n] ?? 64
  const anZahl = an.reduce((a, x) => a + (x ? 1 : 0), 0)
  const geloestJetzt = pause || ende === 'geloest'
  // mehrere Bretter: Anteil der gelösten Bretter · ein Brett: Anteil der Lichter, die schon aus sind
  const fortschritt = bretter.length > 1 ? (nr + (geloestJetzt ? 1 : 0)) / bretter.length : geloestJetzt ? 1 : 1 - anZahl / (n * n)

  return (
    <div className="bt-lauf" data-bt-frei="lichteraus" data-ende={ende ?? undefined} data-brett={nr}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">{bretter.length > 1 ? `Brett ${nr + 1} / ${bretter.length}` : `${n}×${n}`} · {anZahl} an</span>}
        mitte={<Balken anteil={fortschritt} />}
        rechts={<Uhr aktiv={ende === null && !pause} />}
      />
      <div className="bt-raetsel-buehne" data-mittig>
        <div className={`bt-raetsel-lichter ${geloestJetzt ? 'bt-blitz-gut' : ''}`} data-bt-lichter
          style={{ gridTemplateColumns: `repeat(${n}, ${kante}px)`, gridAutoRows: kante }}>
          {an.map((x, i) => (
            <button key={`${nr}-${i}`} type="button" className="bt-raetsel-licht" data-i={i} data-an={x ? '' : undefined}
              data-loesung={zeige.includes(i) ? '' : undefined} disabled={!!ende || pause}
              aria-label={`Zeile ${Math.floor(i / n) + 1}, Spalte ${(i % n) + 1}: ${x ? 'an' : 'aus'}`} aria-pressed={x}
              onClick={() => klick(i)}>
              <Lightbulb size={Math.round(kante * 0.36)} />
            </button>
          ))}
        </div>

        <div className="bt-raetsel-seite">
          <div className="bt-raetsel-wert"><span>Klicks</span><b data-bt-zuege>{zuege}</b></div>
          <div className="bt-raetsel-wert" title="kleinste mögliche Zahl von Klicks"><span>Par</span><b data-bt-par>{brett.par}</b></div>
          {geloestJetzt && <span className="bt-raetsel-meldung bt-ein" data-art="gut" data-bt-geloest style={{ justifyContent: 'center' }}><Check size={16} />Alle aus!</span>}
          {ende === 'aufgegeben' && <span className="bt-raetsel-meldung bt-ein" data-art="leise" style={{ justifyContent: 'center', textAlign: 'center' }}>Diese Felder fehlten noch.</span>}
          {!ende && !pause && (
            <div className="bt-raetsel-hinweis" style={{ textAlign: 'left' }}>
              Ein Klick schaltet das Feld und seine Nachbarn oben, unten, links und rechts um. Schalte alle Lichter aus.<br />
              Die Reihenfolge ist egal, und zweimal dasselbe Feld hebt sich auf.
            </div>
          )}
          <button type="button" className="bt-knopf bt-knopf-leise bt-raetsel-klein" onClick={zurueck} disabled={!!ende || pause || zuege === 0} data-bt-zurueck-brett
            title="Brett wie am Anfang — die Klicks zählen weiter">
            <RotateCcw size={14} />Zurücksetzen <Taste>R</Taste>
          </button>
          <AufgebenKnopf onAufgeben={gibAuf} gesperrt={!!ende || pause} />
        </div>
      </div>
    </div>
  )
}
