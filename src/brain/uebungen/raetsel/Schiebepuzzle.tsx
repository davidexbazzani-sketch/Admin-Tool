// Schiebepuzzle (Rätsel): Nummerierte Steine und eine Lücke; ein Stein neben der Lücke rutscht hinein.
// Ziel: 1, 2, 3 … der Reihe nach, die Lücke unten rechts. Trainiert räumliches Vorausplanen in
// Zugfolgen — was verschiebt sich mit, wenn ich diesen Stein an seinen Platz bringe?
//
// Stufen: 3×3 (Stufe 1–5) und 4×4 (6–10); der kürzeste Weg zum Ziel wächst von 4–6 Zügen auf rund 48.
//         Stufe 1–2: 3 Bretter je Durchgang, 3–4 und 6–7: 2 Bretter, sonst 1 Brett. Tabelle, Erzeugung,
//         Par und Wertung stehen in Schiebepuzzle.logik.ts.
// Bedienung: Stein neben der Lücke anklicken — oder Pfeiltasten: Der Pfeil zeigt, wohin der Stein rutscht.
//            Angezeigt werden die eigenen Züge und das Par (kürzester Weg; bei tief gemischten 4×4 geschätzt).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Flag } from 'lucide-react'
import type { FreiProps, Rohergebnis } from '../../kern/typen'
import { Balken, KopfZeile, Taste, useStoppuhr, useTasten } from '../../ablauf/kit'
import { schiebeAufgabeLeistung, schiebeDurchgang, schiebeGeloest, schiebeLeistung, schiebeNachbarn, schiebeRichtSek, schiebeStein, schiebeZug } from './Schiebepuzzle.logik'
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
  const bretter = useMemo(() => schiebeDurchgang(start, stufe), [start, stufe])
  const [nr, setNr] = useState(0)
  const brett = bretter[nr]
  const n = brett.n
  const [feld, setFeld] = useState<number[]>(() => bretter[0].start.slice())
  const [zuege, setZuege] = useState(0)                 // Züge auf diesem Brett
  const [pause, setPause] = useState(false)             // Brett gelöst, das nächste kommt gleich
  const [ende, setEnde] = useState<null | 'geloest' | 'aufgegeben'>(null)
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
        leistung: schiebeLeistung(s.zuege, s.par, ms, s.richtMs), richtig: anzahl, gesamt: anzahl,
        text: `${anzahl === 1 ? `${n}×${n}` : `${anzahl} Bretter`} gelöst · ${s.zuege} Züge (Par ${s.par}) · ${zeitText(ms / 1000)} min`,
      }
      : {
        leistung: schiebeAufgabeLeistung(s.geloest, anzahl), richtig: s.geloest, gesamt: anzahl,
        text: `aufgegeben nach ${s.zuege + offeneZuege} Zügen`,
      }
    setEnde(art)
    zeitgeber.current = setTimeout(() => melde.current(roh), art === 'geloest' ? 1200 : 1500)
  }

  const schiebe = (stein: number) => {
    if (ende || pause || !stein) return
    const neu = schiebeZug(feld, n, stein)
    if (!neu) return
    const z = zuege + 1
    setFeld(neu)
    setZuege(z)
    if (!schiebeGeloest(neu)) return
    const s = summe.current
    s.zuege += z; s.par += brett.par; s.richtMs += schiebeRichtSek(n, brett.par) * 1000; s.geloest++
    if (nr + 1 >= bretter.length) { schliesse('geloest', 0); return }
    setPause(true)
    zeitgeber.current = setTimeout(() => {
      setNr(nr + 1); setFeld(bretter[nr + 1].start.slice()); setZuege(0); setPause(false)
    }, PAUSE_MS)
  }

  useTasten({
    ArrowUp: () => schiebe(schiebeStein(feld, n, 'hoch')),
    ArrowDown: () => schiebe(schiebeStein(feld, n, 'runter')),
    ArrowLeft: () => schiebe(schiebeStein(feld, n, 'links')),
    ArrowRight: () => schiebe(schiebeStein(feld, n, 'rechts')),
  }, ende === null)

  const kante = n === 3 ? 104 : 88
  const abstand = 8, rand = 12
  const seite = n * kante + (n - 1) * abstand + 2 * rand
  const luecke = feld.indexOf(0)
  const neben = schiebeNachbarn(n, luecke)
  const amPlatz = feld.reduce((a, w, i) => a + (w !== 0 && w === i + 1 ? 1 : 0), 0)
  const geloestJetzt = pause || ende === 'geloest'
  const fortschritt = bretter.length > 1 ? (nr + (geloestJetzt ? 1 : 0)) / bretter.length : amPlatz / (n * n - 1)

  return (
    <div className="bt-lauf" data-bt-frei="schiebepuzzle" data-ende={ende ?? undefined} data-brett={nr}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl">{bretter.length > 1 ? `Brett ${nr + 1} / ${bretter.length}` : `${n}×${n}`} · {amPlatz} / {n * n - 1} am Platz</span>}
        mitte={<Balken anteil={fortschritt} />}
        rechts={<Uhr aktiv={ende === null && !pause} />}
      />
      <div className="bt-raetsel-buehne" data-mittig>
        <div className={`bt-raetsel-schiebe ${geloestJetzt ? 'bt-blitz-gut' : ''}`} style={{ width: seite, height: seite }} data-bt-schiebe>
          {Array.from({ length: n * n - 1 }, (_, k) => {
            const stein = k + 1
            const p = feld.indexOf(stein)
            const beweglich = neben.includes(p) && !ende && !pause
            return (
              <button key={`${nr}-${stein}`} type="button" className="bt-raetsel-stein" data-stein={stein} data-platz={p}
                data-beweglich={beweglich ? '' : undefined} data-richtig={p === k ? '' : undefined}
                style={{ left: rand + (p % n) * (kante + abstand), top: rand + Math.floor(p / n) * (kante + abstand), width: kante, height: kante, fontSize: Math.round(kante * 0.4) }}
                tabIndex={beweglich ? 0 : -1} aria-label={`Stein ${stein}${beweglich ? ' — in die Lücke schieben' : ''}`}
                onClick={() => schiebe(stein)}>
                {stein}
              </button>
            )
          })}
        </div>

        <div className="bt-raetsel-seite">
          <div className="bt-raetsel-wert"><span>Züge</span><b data-bt-zuege>{zuege}</b></div>
          <div className="bt-raetsel-wert" title={brett.exakt ? 'kürzester Weg zum Ziel' : 'geschätzte Länge des kürzesten Wegs'}>
            <span>Par{brett.exakt ? '' : ' (geschätzt)'}</span><b data-bt-par>{brett.exakt ? '' : '≈ '}{brett.par}</b>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="bt-raetsel-zielbild" style={{ gridTemplateColumns: `repeat(${n}, ${n === 3 ? 20 : 17}px)`, gridAutoRows: n === 3 ? 20 : 17 }} aria-hidden>
              {Array.from({ length: n * n }, (_, i) => (i < n * n - 1 ? <span key={i}>{i + 1}</span> : <span key={i} data-luecke />))}
            </div>
            <span className="bt-klein bt-leise">So soll es am Ende aussehen.</span>
          </div>
          {geloestJetzt && <span className="bt-raetsel-meldung bt-ein" data-art="gut" data-bt-geloest style={{ justifyContent: 'center' }}><Check size={16} />Geordnet!</span>}
          {ende === 'aufgegeben' && <span className="bt-raetsel-meldung bt-ein" data-art="leise" style={{ justifyContent: 'center' }}>Aufgegeben.</span>}
          {!ende && !pause && (
            <div className="bt-raetsel-hinweis" style={{ textAlign: 'left' }}>
              Stein neben der Lücke anklicken — oder <Taste>←</Taste><Taste>↑</Taste><Taste>↓</Taste><Taste>→</Taste>: Der Pfeil zeigt, wohin der Stein rutscht.
            </div>
          )}
          <AufgebenKnopf onAufgeben={() => schliesse('aufgegeben', zuege)} gesperrt={!!ende || pause} />
        </div>
      </div>
    </div>
  )
}
