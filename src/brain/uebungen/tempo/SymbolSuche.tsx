// Symbol-Suche (Tempo): links zwei gesuchte Zeichen, rechts eine Reihe — kommt eines der beiden darin vor?
// Trainiert das schnelle Vergleichen von Formen (Wahrnehmungstempo) bei kurzem Behalten der Suchzeichen.
//
// Stufen (Reihe = Zeichen in der Reihe · ähnlich = davon Varianten der gesuchten Grundformen, also gleiche
// Form in anderer Lage · Ziel = „richtig − falsch“ in 60 s für Güte 1):
//   1  Reihe 5 · ähnlich 0 · Ziel 40        6  Reihe 7 · ähnlich 3 · Ziel 26
//   2  Reihe 5 · ähnlich 1 · Ziel 37        7  Reihe 7 · ähnlich 4 · Ziel 24
//   3  Reihe 6 · ähnlich 1 · Ziel 34        8  Reihe 7 · ähnlich 5 · Ziel 22
//   4  Reihe 6 · ähnlich 2 · Ziel 31        9  Reihe 8 · ähnlich 5 · Ziel 21
//   5  Reihe 6 · ähnlich 3 · Ziel 28       10  Reihe 8 · ähnlich 6 · Ziel 20
//
// Training: feste 60 Sekunden, so viele Reihen wie möglich. Die Hälfte der Reihen enthält einen Treffer
// (in jedem Achterblock genau vier). Punkte = richtig − falsch; Güte = Punkte / Ziel der Stufe.
// Duell: genau `dauerSek`, feste Stufe 5, Aufgabenfolge nur aus dem Startwert → für beide Spieler gleich.
// Zeichensatz: symbole.logik.ts (13 Grundformen, 56 Zeichen).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FreiProps } from '../../kern/typen'
import { Balken, KopfZeile, Taste, useTasten, useUhr } from '../../ablauf/kit'
import { SzeneBild } from '../../figuren/Zeige'
import { GLYPHEN } from './symbole.logik'
import { SS_DAUER, SS_DUELL_STUFE, SS_MIN_MS, ssAufgabe, ssWertung } from './SymbolSuche.logik'
import { sofortKlick, stufeFest } from './tempo.logik'
import './tempo.css'

export * from './SymbolSuche.logik'

export function Komponente({ stufe, start, modus, dauerSek, onPunkte, onFertig }: FreiProps) {
  const duell = modus === 'duell'
  const st = duell ? SS_DUELL_STUFE : stufeFest(stufe)
  const dauer = duell && dauerSek && dauerSek > 0 ? dauerSek : SS_DAUER

  const [nr, setNr] = useState(0)
  const [blitz, setBlitz] = useState<{ nr: number; gut: boolean } | null>(null)
  // Zählerstand als Ref: zwei Eingaben im selben Augenblick dürfen nicht doppelt zählen
  const lauf = useRef({ nr: 0, richtig: 0, falsch: 0, zeiten: [] as number[], seit: 0 })
  const fertig = useRef(false)

  useEffect(() => { lauf.current.seit = performance.now() }, [])

  const schliesseAb = useCallback(() => {
    if (fertig.current) return
    fertig.current = true
    const l = lauf.current
    onFertig(ssWertung(st, l.richtig, l.falsch, dauer, l.zeiten))
  }, [onFertig, st, dauer])

  const rest = useUhr(dauer, schliesseAb)

  const antworte = useCallback((ja: boolean) => {
    if (fertig.current) return
    const l = lauf.current
    const jetzt = performance.now()
    const ms = jetzt - l.seit
    if (!l.seit || ms < SS_MIN_MS) return
    const gut = ssAufgabe(start, st, l.nr).enthaelt === ja
    if (gut) { l.richtig++; l.zeiten.push(ms) } else l.falsch++
    l.nr++
    l.seit = jetzt
    setBlitz({ nr: l.nr, gut })
    setNr(l.nr)
    onPunkte?.(Math.max(0, l.richtig - l.falsch))
  }, [onPunkte, start, st])

  useTasten({ j: () => antworte(true), n: () => antworte(false) })

  const aufgabe = useMemo(() => ssAufgabe(start, st, nr), [start, st, nr])
  const punkte = Math.max(0, lauf.current.richtig - lauf.current.falsch)
  const kante = aufgabe.reihe.length <= 6 ? 88 : 76

  return (
    <div className="bt-lauf" data-bt-frei="symbolsuche" data-nr={nr} data-richtig={lauf.current.richtig} data-falsch={lauf.current.falsch}>
      <KopfZeile
        links={<span className="bt-chip bt-chip-warm bt-zahl" data-bt-rest>{rest} s</span>}
        mitte={<Balken anteil={rest / dauer} warm />}
        rechts={<span className="bt-chip bt-chip-akzent bt-zahl">{punkte} {punkte === 1 ? 'Punkt' : 'Punkte'}</span>}
      />
      <div className="bt-aufgabe">Kommt eines der beiden gesuchten Zeichen in der Reihe vor?</div>

      <div className="bt-tempo-ss-buehne">
        <div className="bt-tempo-ss-tafel" data-art="ziele">
          <span className="bt-label">Gesucht</span>
          <div className="bt-tempo-ss-zeichen">
            {aufgabe.ziele.map((g, i) => (
              <span key={i} className="bt-tempo-zeichen" data-ziel="" style={{ width: 88, height: 88 }} data-glyphe={g}>
                <SzeneBild szene={GLYPHEN[g].szene} className="bt-z-voll" titel="gesuchtes Zeichen" />
              </span>
            ))}
          </div>
        </div>
        <div className="bt-tempo-ss-tafel" data-art="reihe">
          <span className="bt-label">Reihe</span>
          <div className="bt-tempo-ss-zeichen">
            {aufgabe.reihe.map((g, i) => (
              <span key={i} className="bt-tempo-zeichen" style={{ width: kante, height: kante }} data-glyphe={g}>
                <SzeneBild szene={GLYPHEN[g].szene} className="bt-z-voll" titel="Zeichen der Reihe" />
              </span>
            ))}
          </div>
          {blitz && <i key={blitz.nr} className={`bt-tempo-blitz ${blitz.gut ? 'bt-blitz-gut' : 'bt-blitz-schlecht'}`} aria-hidden="true" />}
        </div>
      </div>

      <div className="bt-antwortleiste">
        <button type="button" className="bt-knopf bt-knopf-leise bt-knopf-gross bt-tempo-antwort" data-bt-antwort="nein" {...sofortKlick(() => antworte(false))}>
          Nein <Taste>N</Taste>
        </button>
        <button type="button" className="bt-knopf bt-knopf-leise bt-knopf-gross bt-tempo-antwort" data-bt-antwort="ja" {...sofortKlick(() => antworte(true))}>
          Ja <Taste>J</Taste>
        </button>
      </div>
      <div className="bt-klein bt-leise">
        Richtig +1, falsch −1 — genau hinsehen lohnt sich. Die Zeichen müssen in Form <b>und</b> Lage übereinstimmen.
      </div>
    </div>
  )
}
