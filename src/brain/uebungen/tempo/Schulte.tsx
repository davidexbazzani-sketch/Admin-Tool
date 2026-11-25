// Schulte-Tabelle (Tempo): Zahlen in einem gemischten Gitter der Reihe nach anklicken.
// Trainiert das schnelle Absuchen des Blickfelds und die Blicksteuerung.
//
// Stufen: Gittergröße 3×3 (Stufe 1–2), 4×4 (3–4), 5×5 (5–6), 6×6 (7–8), 7×7 (9–10).
//         Ungerade Stufen aufwärts (1, 2, 3 …), gerade Stufen rückwärts (n … 3, 2, 1).
// Training: 3 Gitter (bis 4×4), 2 Gitter (5×5, 6×6), 1 Gitter (7×7).
// Duell: Gitter 4×4 aufwärts, so viele Zahlen wie möglich in der Zeit (+1 je Treffer, −1 je Fehlklick).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { rng, type Rng } from '../../kern/zufall'
import { tempoAus } from '../../kern/wertung'
import { tempoGuete } from './tempo.logik'
import { Balken, KopfZeile, useStoppuhr, useUhr } from '../../ablauf/kit'

export const schulteGroesse = (stufe: number): number => [3, 3, 4, 4, 5, 5, 6, 6, 7, 7][Math.max(1, Math.min(10, Math.round(stufe))) - 1]
export const schulteRunden = (groesse: number): number => (groesse <= 4 ? 3 : groesse <= 6 ? 2 : 1)
/** gemischtes Gitter mit den Zahlen 1..n² */
export function schulteGitter(r: Rng, groesse: number): number[] {
  return r.misch(Array.from({ length: groesse * groesse }, (_, i) => i + 1))
}

export function Komponente({ stufe, start, modus, dauerSek, onPunkte, onFertig }: FreiProps) {
  const duell = modus === 'duell'
  const groesse = duell ? 4 : schulteGroesse(stufe)
  const rueckwaerts = !duell && Math.round(stufe) % 2 === 0
  const runden = duell ? Infinity : schulteRunden(groesse)
  const n = groesse * groesse

  const [runde, setRunde] = useState(0)
  const [naechste, setNaechste] = useState(rueckwaerts ? n : 1)
  const [falsch, setFalsch] = useState<number | null>(null)
  const treffer = useRef(0)
  const fehler = useRef(0)
  const fertig = useRef(false)
  const sek = useStoppuhr(!fertig.current)
  const sekRef = useRef(0)
  sekRef.current = sek

  const gitter = useMemo(() => schulteGitter(rng(start).zweig(runde), groesse), [start, runde, groesse])

  const schliesseAb = useCallback(() => {
    if (fertig.current) return
    fertig.current = true
    const klicks = treffer.current + fehler.current
    const jeZahlMs = treffer.current ? (sekRef.current * 1000 + fehler.current * 1000) / treffer.current : 9999
    onFertig({
      // Tempo zählt hier zur Hälfte: fehlerfrei, aber gemächlich reicht nicht zum Aufstieg
      leistung: tempoGuete(klicks ? treffer.current / klicks : 0, tempoAus(jeZahlMs, 600, 2200)),
      richtig: treffer.current, gesamt: klicks, rtMs: Math.round(jeZahlMs),
      text: `Ø ${(jeZahlMs / 1000).toFixed(2).replace('.', ',')} s je Zahl`,
      duellPunkte: Math.max(0, treffer.current - fehler.current),
    })
  }, [onFertig])

  const rest = useUhr(duell ? dauerSek : undefined, schliesseAb)

  const klick = (zahl: number) => {
    if (fertig.current) return
    if (zahl !== naechste) {
      fehler.current++
      setFalsch(zahl)
      onPunkte?.(Math.max(0, treffer.current - fehler.current))
      return
    }
    treffer.current++
    setFalsch(null)
    onPunkte?.(Math.max(0, treffer.current - fehler.current))
    const letzte = rueckwaerts ? zahl === 1 : zahl === n
    if (!letzte) { setNaechste(rueckwaerts ? zahl - 1 : zahl + 1); return }
    if (runde + 1 >= runden) { schliesseAb(); return }
    setRunde(r => r + 1)
    setNaechste(rueckwaerts ? n : 1)
  }

  useEffect(() => { if (falsch === null) return; const t = setTimeout(() => setFalsch(null), 320); return () => clearTimeout(t) }, [falsch])

  const kante = Math.min(84, Math.floor(500 / groesse))
  const erledigt = (z: number) => (rueckwaerts ? z > naechste : z < naechste)

  return (
    <div className="bt-lauf" data-bt-frei="schulte">
      <KopfZeile
        links={duell
          ? <span className="bt-chip bt-chip-warm bt-zahl">{rest} s</span>
          : <span className="bt-chip bt-zahl">Gitter {runde + 1} / {runden}</span>}
        mitte={duell ? <Balken anteil={rest / (dauerSek || 1)} warm /> : <Balken anteil={(runde * n + (rueckwaerts ? n - naechste : naechste - 1)) / (runden * n)} />}
        rechts={<span className="bt-chip bt-chip-akzent bt-zahl">{duell ? `${Math.max(0, treffer.current - fehler.current)} Punkte` : `${sek.toFixed(1).replace('.', ',')} s`}</span>}
      />
      <div className="bt-aufgabe">
        Suche die <span style={{ color: 'var(--bt-akzent-stark)' }}>{naechste}</span>
        <span className="bt-leise" style={{ fontWeight: 400, fontSize: 14 }}> · {rueckwaerts ? 'rückwärts bis 1' : `aufwärts bis ${n}`}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${groesse}, ${kante}px)`, gap: 6 }} data-bt-gitter>
        {gitter.map(z => (
          <button key={`${runde}-${z}`} type="button" className={`bt-feld ${falsch === z ? 'bt-ruettel' : ''}`}
            style={{ width: kante, height: kante, fontSize: Math.round(kante * 0.4) }}
            data-zahl={z} data-matt={erledigt(z) ? '' : undefined} data-schlecht={falsch === z ? '' : undefined}
            onClick={() => klick(z)}>
            {z}
          </button>
        ))}
      </div>
    </div>
  )
}
