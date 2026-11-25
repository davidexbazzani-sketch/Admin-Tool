// Symbol-Suche (Tempo) — reine Logik: Stufen, Aufgaben, Wertung. Oberfläche: SymbolSuche.tsx.
import type { Rohergebnis } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { median } from '../../ablauf/kit'
import { FAMILIEN_ZAHL, GLYPHEN, glyphenVon } from './symbole.logik'
import { kommaZahl, mengenGuete, stufeFest } from './tempo.logik'

/** Dauer eines Trainings-Durchgangs in Sekunden */
export const SS_DAUER = 60
/** Im Duell gilt für beide Spieler dieselbe feste Stufe (sonst wären die Aufgaben nicht gleich) */
export const SS_DUELL_STUFE = 5
/** Antworten, die schneller kommen, kann niemand überlegt haben (Doppelklick, Taste prellt) → ohne Wirkung */
export const SS_MIN_MS = 150

export interface SsStufe {
  /** Zeichen in der Reihe */
  laenge: number
  /** so viele Zeichen der Reihe sind Varianten der gesuchten (gleiche Grundform, andere Lage) */
  aehnlich: number
  /** Zielwert „richtig − falsch“ in 60 s (erreicht = Güte 1) */
  ziel: number
}
const TAFEL: SsStufe[] = [
  { laenge: 5, aehnlich: 0, ziel: 40 },
  { laenge: 5, aehnlich: 1, ziel: 37 },
  { laenge: 6, aehnlich: 1, ziel: 34 },
  { laenge: 6, aehnlich: 2, ziel: 31 },
  { laenge: 6, aehnlich: 3, ziel: 28 },
  { laenge: 7, aehnlich: 3, ziel: 26 },
  { laenge: 7, aehnlich: 4, ziel: 24 },
  { laenge: 7, aehnlich: 5, ziel: 22 },
  { laenge: 8, aehnlich: 5, ziel: 21 },
  { laenge: 8, aehnlich: 6, ziel: 20 },
]
export const ssStufe = (stufe: number): SsStufe => TAFEL[stufeFest(stufe) - 1]

export interface SsAufgabe {
  /** die beiden gesuchten Zeichen (Nummern in GLYPHEN) */
  ziele: number[]
  /** die Reihe, in der gesucht wird */
  reihe: number[]
  /** kommt eines der gesuchten Zeichen in der Reihe vor? */
  enthaelt: boolean
  /** Stelle des Treffers in der Reihe (−1 = keiner) */
  stelle: number
}

const BLOCK = 8
/** Ja/Nein-Folge: in jedem Achterblock genau vier Reihen mit Treffer — also die Hälfte, ohne lange Serien. */
export function ssEnthaelt(start: number, nr: number): boolean {
  const folge = rng(start).zweig(`ja${Math.floor(nr / BLOCK)}`).misch([true, true, true, true, false, false, false, false])
  return folge[nr % BLOCK]
}

/**
 * Aufgabe Nummer `nr` eines Durchgangs. Hängt nur von Startwert, Stufe und Nummer ab — im Duell sehen
 * beide Spieler dieselbe Folge, egal wie schnell sie sind.
 *   • die zwei gesuchten Zeichen stammen aus verschiedenen Familien
 *   • die Reihe hat keine doppelten Zeichen und höchstens EINEN Treffer
 *   • `aehnlich` Zeichen sind andere Lagen der gesuchten Grundformen, der Rest kommt aus fremden Familien
 */
export function ssAufgabe(start: number, stufe: number, nr: number): SsAufgabe {
  const { laenge, aehnlich } = ssStufe(stufe)
  const r = rng(start).zweig(`reihe${nr}`)
  const enthaelt = ssEnthaelt(start, nr)
  const familien = r.misch(Array.from({ length: FAMILIEN_ZAHL }, (_, i) => i))
  const ziele = [r.aus(glyphenVon(familien[0])), r.aus(glyphenVon(familien[1]))]
  const verwandte = r.misch([...glyphenVon(familien[0]), ...glyphenVon(familien[1])].filter(g => !ziele.includes(g)))
  const frei = laenge - (enthaelt ? 1 : 0)
  const nah = verwandte.slice(0, Math.min(aehnlich, frei))
  const fern = familien.slice(2, 2 + frei - nah.length).map(f => r.aus(glyphenVon(f)))
  const reihe = r.misch([...nah, ...fern, ...(enthaelt ? [r.aus(ziele)] : [])])
  return { ziele, reihe, enthaelt, stelle: reihe.findIndex(g => ziele.includes(g)) }
}

/** Zielwert für eine Dauer (die Tafel gilt für 60 s) */
export const ssZiel = (stufe: number, dauerSek: number = SS_DAUER): number => ssStufe(stufe).ziel * dauerSek / 60

/** Wertung: Punkte = richtig − falsch, gemessen am Zielwert der Stufe. `zeiten` = ms je richtiger Antwort. */
export function ssWertung(stufe: number, richtig: number, falsch: number, dauerSek: number = SS_DAUER, zeiten: number[] = []): Rohergebnis {
  const punkte = Math.max(0, richtig - falsch)
  const med = median(zeiten)
  return {
    leistung: mengenGuete(richtig, falsch, ssZiel(stufe, dauerSek)),
    richtig,
    gesamt: richtig + falsch,
    rtMs: zeiten.length ? Math.round(med) : undefined,
    text: `${punkte} ${punkte === 1 ? 'Punkt' : 'Punkte'}${zeiten.length ? ` · Ø ${kommaZahl(med / 1000)} s je Reihe` : ''}`,
    duellPunkte: punkte,
  }
}

/** nur für Tests: Familie eines Zeichens */
export const ssFamilie = (glyphe: number): number => GLYPHEN[glyphe].familie
