// Paare merken (Gedächtnis): das klassische Paare-Spiel. Zwei Karten aufdecken; gleiche bleiben offen,
// ungleiche drehen sich wieder um. Trainiert das Merken von „was liegt wo“ über viele Züge hinweg.
//
// Stufe:   1    2    3    4    5    6    7    8    9    10
// Brett:   4×3  4×4  5×4  6×4  7×4  6×5  8×4  6×6  6×6  6×6      (Spalten × Zeilen)
// Paare:   6    8    10   12   14   15   16   18   18   18
// Motive:  bunt gemischt (Stufe 1–8) · aus 3 ähnlichen Gruppen (9) · aus 2 ähnlichen Gruppen (10)
// Offen:   ein falsches Paar bleibt 1,2 s liegen (Stufe 1), je Stufe 0,05 s kürzer, bis 0,75 s (Stufe 10).
//          Wer schneller ist, klickt einfach die nächste Karte — das falsche Paar dreht sich dann sofort um.
// Wertung: Züge gegen den Richtwert (1,75 Züge je Paar = volle Genauigkeit, 4 je Paar = 0) und Zeit
//          (4 s je Paar = volles Tempo, 12 s = keines; zählt 20 %). Ein Brett je Durchgang.
// Dauer:   etwa 1 Minute (6 Paare) bis 2–3 Minuten (18 Paare). Kein eigener Duell-Ablauf.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { Balken, KopfZeile, useStoppuhr } from '../../ablauf/kit'
import { paareBrett, paarePar, paareText, paareWertung, zeitText } from './Paare.logik'
import './gedaechtnis.css'

export * from './Paare.logik'

/** nach dem letzten Paar bleibt das Brett kurz stehen */
const ENDE_NACH_MS = 700
/** Platz für das Brett in Pixeln */
const BRETT_BREITE = 860
const BRETT_HOEHE = 462

export function Komponente({ stufe, start, onFertig }: FreiProps) {
  const brett = useMemo(() => paareBrett(rng(start), stufe), [start, stufe])
  const { karten, paare, spalten, zeilen } = brett
  const par = paarePar(paare)

  /** offen liegende, noch nicht gefundene Karten (0, 1 oder 2) */
  const [offen, setOffen] = useState<number[]>([])
  const [gefunden, setGefunden] = useState<ReadonlySet<number>>(() => new Set<number>())
  const [zuege, setZuege] = useState(0)
  /** alle Paare gefunden → Uhr hält an */
  const [aus, setAus] = useState(false)
  const sek = useStoppuhr(!aus)
  const beginn = useRef(0)
  const zudecken = useRef<ReturnType<typeof setTimeout>>()
  const ende = useRef<ReturnType<typeof setTimeout>>()
  const fertig = useRef(false)
  const melde = useRef(onFertig)
  melde.current = onFertig

  useEffect(() => {
    beginn.current = performance.now()
    return () => { clearTimeout(zudecken.current); clearTimeout(ende.current) }
  }, [])

  const klick = useCallback((i: number) => {
    if (fertig.current || aus || gefunden.has(i)) return
    // ein falsches Paar liegt noch offen: sofort umdrehen, die angeklickte Karte beginnt den nächsten Zug
    if (offen.length === 2) { clearTimeout(zudecken.current); setOffen([i]); return }
    if (offen.includes(i)) return
    if (!offen.length) { setOffen([i]); return }
    const a = offen[0]
    const zug = zuege + 1
    setZuege(zug)
    if (karten[a] !== karten[i]) {
      setOffen([a, i])
      zudecken.current = setTimeout(() => setOffen([]), brett.offenMs)
      return
    }
    const neu = new Set(gefunden)
    neu.add(a); neu.add(i)
    setGefunden(neu)
    setOffen([])
    if (neu.size < karten.length) return
    // geschafft: Zeit festhalten, kurz stehen lassen, dann melden (genau einmal)
    const dauer = (performance.now() - beginn.current) / 1000
    setAus(true)
    ende.current = setTimeout(() => {
      if (fertig.current) return
      fertig.current = true
      const w = paareWertung(paare, zug, dauer)
      melde.current({ leistung: w.leistung, richtig: paare, gesamt: paare, text: paareText(paare, zug, dauer) })
    }, ENDE_NACH_MS)
  }, [aus, gefunden, offen, zuege, karten, paare, brett.offenMs])

  const kante = Math.min(96, Math.floor((BRETT_HOEHE - (zeilen - 1) * 8) / zeilen), Math.floor((BRETT_BREITE - (spalten - 1) * 8) / spalten))
  const fehlpaar = offen.length === 2
  const gefundenePaare = gefunden.size / 2

  return (
    <div className="bt-lauf" style={{ gap: 14 }} data-bt-frei="paare" data-zuege={zuege} data-gefunden={gefundenePaare} data-paare={paare} data-fertig={aus ? '' : undefined}>
      <KopfZeile
        links={<span className="bt-chip bt-zahl" data-bt-paare>Paare {gefundenePaare} / {paare}</span>}
        mitte={<Balken anteil={gefundenePaare / paare} />}
        rechts={
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <span className="bt-chip bt-chip-akzent bt-zahl" data-bt-zuege>{zuege} {zuege === 1 ? 'Zug' : 'Züge'}</span>
            <span className="bt-chip bt-zahl" data-bt-zeit>{zeitText(sek)}</span>
          </span>
        }
      />

      <div className="bt-ged-karten" style={{ gridTemplateColumns: `repeat(${spalten}, ${kante}px)`, gridAutoRows: `${kante}px` }} data-bt-karten>
        {karten.map((motiv, i) => {
          const istGefunden = gefunden.has(i)
          const istOffen = offen.includes(i)
          const sichtbar = istGefunden || istOffen
          return (
            <button key={i} type="button" className="bt-ged-karte" data-karte={i} tabIndex={-1}
              data-offen={istOffen ? '' : undefined}
              data-fehl={istOffen && fehlpaar ? '' : undefined}
              data-gefunden={istGefunden ? '' : undefined}
              data-motiv={sichtbar ? motiv : undefined}
              aria-label={sichtbar ? `Karte ${i + 1}: ${motiv}${istGefunden ? ', gefunden' : ''}` : `Karte ${i + 1}, verdeckt`}
              onMouseDown={e => e.preventDefault()} onClick={() => klick(i)}>
              {sichtbar && <span className="bt-ged-karte-bild" style={{ fontSize: Math.round(kante * 0.54) }}>{motiv}</span>}
            </button>
          )
        })}
      </div>

      <div className="bt-klein bt-leise" data-bt-hinweis>
        {aus
          ? `Geschafft – ${paare} Paare in ${zuege} Zügen`
          : `Finde alle ${paare} Paare mit möglichst wenigen Zügen · Richtwert: ${par} Züge · ein Zug = zwei Karten`}
      </div>
    </div>
  )
}
