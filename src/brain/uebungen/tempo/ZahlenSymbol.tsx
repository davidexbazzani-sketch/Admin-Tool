// Zahlen-Symbol-Code (Tempo): Eine Legende ordnet den Ziffern 1–9 neun abstrakte Zeichen zu.
// Es erscheint ein Zeichen nach dem anderen — die passende Ziffer drücken.
// Trainiert das Verarbeitungstempo: Zeichen erkennen, in der Legende nachschlagen (oder sich die
// Zuordnung merken) und umsetzen.
//
// Stufen (Formen = Grundformen, aus denen die neun Zeichen stammen; weniger Formen = mehr Zeichen, die sich
// nur in der Lage unterscheiden · Mischen = die Legende wird nach so vielen Zeichen neu gemischt ·
// Ziel = „richtig − falsch“ in 60 s für Güte 1):
//   1  9 Formen (alle verschieden) · kein Mischen · Ziel 46      6  5 Formen · Mischen alle 10 · Ziel 36
//   2  8 Formen · kein Mischen · Ziel 44                         7  4 Formen · Mischen alle 10 · Ziel 34
//   3  7 Formen · kein Mischen · Ziel 42                         8  4 Formen · Mischen alle  8 · Ziel 32
//   4  6 Formen · kein Mischen · Ziel 40                         9  3 Formen · Mischen alle  8 · Ziel 31
//   5  5 Formen · kein Mischen · Ziel 38                        10  3 Formen · Mischen alle  6 · Ziel 30
//
// Training: feste 60 Sekunden. In je neun Aufgaben kommt jedes Zeichen einmal vor, nie zweimal dasselbe
// hintereinander. Punkte = richtig − falsch; Güte = Punkte / Ziel der Stufe.
// Duell: genau `dauerSek`, feste Stufe 5, Zeichen, Legende und Folge nur aus dem Startwert → für beide gleich.
// Zeichensatz: symbole.logik.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { Balken, KopfZeile, Taste, useTasten, useUhr } from '../../ablauf/kit'
import { SzeneBild } from '../../figuren/Zeige'
import { GLYPHEN } from './symbole.logik'
import { ZS_DAUER, ZS_DUELL_STUFE, ZS_MIN_MS, zsBlock, zsFolge, zsLegende, zsStufe, zsWertung, zsZeichen } from './ZahlenSymbol.logik'
import { sofortKlick, stufeFest } from './tempo.logik'
import './tempo.css'

export * from './ZahlenSymbol.logik'

/** Anordnung wie auf dem Ziffernblock der Tastatur */
const BLOCK_TASTEN = [7, 8, 9, 4, 5, 6, 1, 2, 3]

export function Komponente({ stufe, start, modus, dauerSek, onPunkte, onFertig }: FreiProps) {
  const duell = modus === 'duell'
  const st = duell ? ZS_DUELL_STUFE : stufeFest(stufe)
  const dauer = duell && dauerSek && dauerSek > 0 ? dauerSek : ZS_DAUER
  const regel = zsStufe(st)

  const zeichen = useMemo(() => zsZeichen(start, st), [start, st])
  // genug Aufgaben für die ganze Dauer — schneller als ZS_MIN_MS je Antwort geht es nicht
  const folge = useMemo(() => zsFolge(start, Math.ceil(dauer * 1000 / ZS_MIN_MS) + 18), [start, dauer])

  const [nr, setNr] = useState(0)
  const [letzte, setLetzte] = useState<{ nr: number; gut: boolean; soll: number } | null>(null)
  // Zählerstand als Ref: zwei Eingaben im selben Augenblick dürfen nicht doppelt zählen
  const lauf = useRef({ nr: 0, richtig: 0, falsch: 0, zeiten: [] as number[], seit: 0 })
  const fertig = useRef(false)

  useEffect(() => { lauf.current.seit = performance.now() }, [])

  const schliesseAb = useCallback(() => {
    if (fertig.current) return
    fertig.current = true
    const l = lauf.current
    onFertig(zsWertung(st, l.richtig, l.falsch, dauer, l.zeiten))
  }, [onFertig, st, dauer])

  const rest = useUhr(dauer, schliesseAb)

  const antworte = useCallback((ziffer: number) => {
    if (fertig.current) return
    const l = lauf.current
    const jetzt = performance.now()
    const ms = jetzt - l.seit
    if (!l.seit || ms < ZS_MIN_MS) return
    const soll = zsLegende(start, st, zsBlock(st, l.nr)).indexOf(zeichen[folge[l.nr % folge.length]]) + 1
    const gut = soll === ziffer
    if (gut) { l.richtig++; l.zeiten.push(ms) } else l.falsch++
    l.nr++
    l.seit = jetzt
    setLetzte({ nr: l.nr, gut, soll })
    setNr(l.nr)
    onPunkte?.(Math.max(0, l.richtig - l.falsch))
  }, [onPunkte, start, st, zeichen, folge])

  useTasten({
    '1': () => antworte(1), '2': () => antworte(2), '3': () => antworte(3),
    '4': () => antworte(4), '5': () => antworte(5), '6': () => antworte(6),
    '7': () => antworte(7), '8': () => antworte(8), '9': () => antworte(9),
  })

  const block = zsBlock(st, nr)
  const legende = useMemo(() => zsLegende(start, st, block), [start, st, block])
  const glyphe = zeichen[folge[nr % folge.length]]
  const punkte = Math.max(0, lauf.current.richtig - lauf.current.falsch)
  const bisMischen = regel.mischenNach > 0 ? regel.mischenNach - (nr % regel.mischenNach) : 0

  return (
    <div className="bt-lauf" data-bt-frei="zahlensymbol" data-nr={nr} data-block={block} data-glyphe={glyphe}
      data-richtig={lauf.current.richtig} data-falsch={lauf.current.falsch}>
      <KopfZeile
        links={<span className="bt-chip bt-chip-warm bt-zahl" data-bt-rest>{rest} s</span>}
        mitte={<Balken anteil={rest / dauer} warm />}
        rechts={<span className="bt-chip bt-chip-akzent bt-zahl">{punkte} {punkte === 1 ? 'Punkt' : 'Punkte'}</span>}
      />
      <div className="bt-aufgabe">Welche Ziffer gehört zu dem Zeichen?</div>

      <div className="bt-tempo-zs-oben">
        <div key={block} className="bt-tempo-zs-legende" data-neu={block > 0 ? '' : undefined} data-bt-legende>
          {legende.map((g, i) => (
            <div key={i} className="bt-tempo-zs-zelle" data-ziffer={i + 1} data-glyphe={g}>
              <span className="bt-zahl">{i + 1}</span>
              <SzeneBild szene={GLYPHEN[g].szene} className="bt-tempo-zs-bild" titel={`Zeichen für ${i + 1}`} />
            </div>
          ))}
        </div>
        <div className="bt-klein bt-leise bt-tempo-zs-hinweis">
          {regel.mischenNach > 0
            ? <>
              {block > 0 && <b key={block} className="bt-tempo-zs-gemischt">Neu gemischt! </b>}
              Die Legende wird alle {regel.mischenNach} Zeichen neu gemischt — nächstes Mal in <span className="bt-zahl">{bisMischen}</span>.
            </>
            : 'Die Legende bleibt den ganzen Durchgang gleich.'}
        </div>
      </div>

      <div className="bt-tempo-zs-mitte">
        <div className="bt-tempo-zs-reiz" data-bt-reiz>
          <SzeneBild szene={GLYPHEN[glyphe].szene} className="bt-z-voll" titel="gezeigtes Zeichen" />
          {letzte && <i key={letzte.nr} className={`bt-tempo-blitz ${letzte.gut ? 'bt-blitz-gut' : 'bt-blitz-schlecht'}`} aria-hidden="true" />}
        </div>
        <div className="bt-tempo-zs-block">
          {BLOCK_TASTEN.map(z => (
            <button key={z} type="button" className="bt-feld bt-tempo-zs-taste" data-bt-ziffer={z} {...sofortKlick(() => antworte(z))}>{z}</button>
          ))}
        </div>
      </div>

      <div className="bt-klein bt-leise" style={{ minHeight: 20 }}>
        {letzte && !letzte.gut
          ? <span style={{ color: 'var(--bt-schlecht)', fontWeight: 600 }} data-bt-falsch>Falsch — richtig war die {letzte.soll}.</span>
          : <>Tasten <Taste>1</Taste>–<Taste>9</Taste> (auch Ziffernblock) oder die Felder anklicken · richtig +1, falsch −1</>}
      </div>
    </div>
  )
}
