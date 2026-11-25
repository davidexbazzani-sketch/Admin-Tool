// Zahlen-Symbol-Code (Tempo) — reine Logik: Stufen, Legende, Zeichenfolge, Wertung. Oberfläche: ZahlenSymbol.tsx.
import type { Rohergebnis } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { median } from '../../ablauf/kit'
import { FAMILIEN_ZAHL, glyphenVon } from './symbole.logik'
import { kommaZahl, mengenGuete, stufeFest } from './tempo.logik'

/** Dauer eines Trainings-Durchgangs in Sekunden */
export const ZS_DAUER = 60
/** Im Duell gilt für beide Spieler dieselbe feste Stufe (sonst wären die Aufgaben nicht gleich) */
export const ZS_DUELL_STUFE = 5
/** Antworten, die schneller kommen, kann niemand überlegt haben (Taste prellt, Doppelklick) → ohne Wirkung */
export const ZS_MIN_MS = 150
/** Ziffern 1–9 */
export const ZS_ZEICHEN = 9

export interface ZsStufe {
  /** aus so vielen Grundformen stammen die neun Zeichen (weniger = ähnlicher) */
  familien: number
  /** nach so vielen Zeichen wird die Legende neu gemischt (0 = nie) */
  mischenNach: number
  /** Zielwert „richtig − falsch“ in 60 s (erreicht = Güte 1) */
  ziel: number
}
const TAFEL: ZsStufe[] = [
  { familien: 9, mischenNach: 0, ziel: 46 },
  { familien: 8, mischenNach: 0, ziel: 44 },
  { familien: 7, mischenNach: 0, ziel: 42 },
  { familien: 6, mischenNach: 0, ziel: 40 },
  { familien: 5, mischenNach: 0, ziel: 38 },
  { familien: 5, mischenNach: 10, ziel: 36 },
  { familien: 4, mischenNach: 10, ziel: 34 },
  { familien: 4, mischenNach: 8, ziel: 32 },
  { familien: 3, mischenNach: 8, ziel: 31 },
  { familien: 3, mischenNach: 6, ziel: 30 },
]
export const zsStufe = (stufe: number): ZsStufe => TAFEL[stufeFest(stufe) - 1]

/**
 * Die neun Zeichen eines Durchgangs (Nummern in GLYPHEN), möglichst gleichmäßig auf `familien`
 * Grundformen verteilt: 9 Familien → alle verschieden · 3 Familien → dreimal drei Lagen derselben Form.
 */
export function zsZeichen(start: number, stufe: number): number[] {
  const { familien } = zsStufe(stufe)
  const r = rng(start).zweig('zeichen')
  const wahl = r.ausN(Array.from({ length: FAMILIEN_ZAHL }, (_, i) => i), familien)
  const zeichen: number[] = []
  wahl.forEach((f, i) => {
    const anzahl = Math.floor(ZS_ZEICHEN / familien) + (i < ZS_ZEICHEN % familien ? 1 : 0)
    zeichen.push(...r.ausN(glyphenVon(f), anzahl))
  })
  return zeichen
}

/** In welchem Legenden-Abschnitt liegt Aufgabe `nr`? (0, solange nicht neu gemischt wird) */
export function zsBlock(stufe: number, nr: number): number {
  const { mischenNach } = zsStufe(stufe)
  return mischenNach > 0 ? Math.floor(nr / mischenNach) : 0
}

/**
 * Legende eines Abschnitts: Stelle i gehört zur Ziffer i + 1. Beim Neumischen wechseln mindestens
 * sieben der neun Zeichen ihre Ziffer — sonst wäre es kein spürbarer Wechsel.
 */
export function zsLegende(start: number, stufe: number, block: number): number[] {
  let legende = rng(start).zweig('legende0').misch(zsZeichen(start, stufe))
  for (let b = 1; b <= block; b++) {
    const r = rng(start).zweig(`legende${b}`)
    const vorher = legende
    let neu = r.misch(vorher)
    for (let v = 0; v < 60 && neu.filter((g, i) => g === vorher[i]).length > 2; v++) neu = r.misch(vorher)
    legende = neu
  }
  return legende
}

/**
 * Welche Zeichen nacheinander gezeigt werden: Plätze 0..8 in `zsZeichen`. In je neun Aufgaben kommt jedes
 * Zeichen genau einmal vor, nie zweimal dasselbe hintereinander. Hängt nur vom Startwert ab.
 */
export function zsFolge(start: number, anzahl: number): number[] {
  const folge: number[] = []
  for (let beutel = 0; folge.length < anzahl; beutel++) {
    const neun = rng(start).zweig(`beutel${beutel}`).misch(Array.from({ length: ZS_ZEICHEN }, (_, i) => i))
    if (folge.length && neun[0] === folge[folge.length - 1]) [neun[0], neun[ZS_ZEICHEN - 1]] = [neun[ZS_ZEICHEN - 1], neun[0]]
    folge.push(...neun)
  }
  return folge.slice(0, anzahl)
}

export interface ZsAufgabe {
  /** das gezeigte Zeichen (Nummer in GLYPHEN) */
  glyphe: number
  /** die richtige Ziffer 1–9 nach der gerade gültigen Legende */
  ziffer: number
  block: number
}
/** Aufgabe Nummer `nr` (für Tests und Szenen; die Oberfläche rechnet dasselbe mit zwischengespeicherten Teilen). */
export function zsAufgabe(start: number, stufe: number, nr: number): ZsAufgabe {
  const block = zsBlock(stufe, nr)
  const glyphe = zsZeichen(start, stufe)[zsFolge(start, nr + 1)[nr]]
  return { glyphe, ziffer: zsLegende(start, stufe, block).indexOf(glyphe) + 1, block }
}

/** Zielwert für eine Dauer (die Tafel gilt für 60 s) */
export const zsZiel = (stufe: number, dauerSek: number = ZS_DAUER): number => zsStufe(stufe).ziel * dauerSek / 60

/** Wertung: Punkte = richtig − falsch, gemessen am Zielwert der Stufe. `zeiten` = ms je richtiger Antwort. */
export function zsWertung(stufe: number, richtig: number, falsch: number, dauerSek: number = ZS_DAUER, zeiten: number[] = []): Rohergebnis {
  const punkte = Math.max(0, richtig - falsch)
  const med = median(zeiten)
  return {
    leistung: mengenGuete(richtig, falsch, zsZiel(stufe, dauerSek)),
    richtig,
    gesamt: richtig + falsch,
    rtMs: zeiten.length ? Math.round(med) : undefined,
    text: `${punkte} ${punkte === 1 ? 'Punkt' : 'Punkte'}${zeiten.length ? ` · Ø ${kommaZahl(med / 1000)} s je Zeichen` : ''}`,
    duellPunkte: punkte,
  }
}
