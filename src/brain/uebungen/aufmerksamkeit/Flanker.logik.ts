// Flanker — reine Logik (ohne Oberfläche): Stufen, Pfeilreihen erzeugen, prüfen, werten.
// Die Stufen-Tabelle steht ausführlich im Kopf von Flanker.tsx.
import type { Rohergebnis } from '../../kern/typen'
import type { Rng } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'
import { jeStufe, laengsterLauf, median, mittel, mischeBis, msText, unterschiedMs, zeitenRichtig, zieheFolge } from './gemeinsam.logik'

export type Richtung = 'links' | 'rechts'
/** kongruent: alle Pfeile gleich · inkongruent: die äußeren zeigen in die Gegenrichtung · neutral: außen nur Striche */
export type FlankerArt = 'kongruent' | 'inkongruent' | 'neutral'
export type FlankerZeichen = Richtung | 'strich'

export interface FlankerStufe {
  /** Anteil der Durchgänge mit entgegengesetzten Flanken */
  inkongruent: number
  /** Antwortfrist */
  fristMs: number
  /** so weit wandert die Reihe höchstens nach oben oder unten (0 = immer in der Mitte) */
  hubPx: number
}

export const FLANKER_STUFEN: readonly FlankerStufe[] = [
  { inkongruent: 0.30, fristMs: 1500, hubPx: 0 },
  { inkongruent: 0.34, fristMs: 1400, hubPx: 0 },
  { inkongruent: 0.38, fristMs: 1300, hubPx: 0 },
  { inkongruent: 0.42, fristMs: 1200, hubPx: 0 },
  { inkongruent: 0.46, fristMs: 1100, hubPx: 0 },
  { inkongruent: 0.50, fristMs: 1000, hubPx: 0 },
  { inkongruent: 0.55, fristMs: 900, hubPx: 30 },
  { inkongruent: 0.60, fristMs: 800, hubPx: 42 },
  { inkongruent: 0.65, fristMs: 700, hubPx: 54 },
  { inkongruent: 0.70, fristMs: 600, hubPx: 66 },
]
export const flankerStufe = (stufe: number): FlankerStufe => jeStufe(FLANKER_STUFEN, stufe)
export const FLANKER_ANZAHL = 30
/** mögliche Lagen der Reihe (× hubPx), wenn sie wandert */
export const FLANKER_LAGEN: readonly number[] = [-1, -0.5, 0, 0.5, 1]

export interface FlankerVersuch {
  /** Richtung des mittleren Pfeils = richtige Antwort */
  ziel: Richtung
  art: FlankerArt
  /** die fünf Zeichen von links nach rechts */
  reihe: FlankerZeichen[]
  /** senkrechte Lage −1..1 (× hubPx der Stufe) */
  lage: number
  /** 0..1: Länge der Pause vor dem Durchgang */
  zittern: number
}

const gegen = (r: Richtung): Richtung => (r === 'links' ? 'rechts' : 'links')

/** Die fünf Zeichen einer Reihe; das mittlere ist immer der Zielpfeil. */
export function flankerReihe(ziel: Richtung, art: FlankerArt): FlankerZeichen[] {
  const f: FlankerZeichen = art === 'neutral' ? 'strich' : art === 'kongruent' ? ziel : gegen(ziel)
  return [f, f, ziel, f, f]
}

/** Wie viele Durchgänge je Art: der Rest nach den inkongruenten teilt sich 2 : 1 in kongruent und neutral. */
export function flankerAnzahlen(stufe: number, n: number = FLANKER_ANZAHL): Record<FlankerArt, number> {
  const inkongruent = Math.round(n * flankerStufe(stufe).inkongruent)
  const neutral = Math.round((n - inkongruent) / 3)
  return { inkongruent, neutral, kongruent: n - inkongruent - neutral }
}

/**
 * Erzeugt n Durchgänge mit exakt den Anteilen der Stufe.
 * Regeln: je Art gleich viele Links- und Rechts-Ziele (bei ungerader Zahl entscheidet der Zufall) ·
 * nie mehr als dreimal dieselbe Antwort hintereinander · wandert die Reihe, steht sie nie zweimal an derselben Stelle.
 */
export function flankerVersuche(r: Rng, stufe: number, n: number = FLANKER_ANZAHL): FlankerVersuch[] {
  const s = flankerStufe(stufe)
  const zahl = flankerAnzahlen(stufe, n)
  const paare: { ziel: Richtung; art: FlankerArt }[] = []
  for (const art of ['kongruent', 'inkongruent', 'neutral'] as const) {
    const ungerade: Richtung = r.chance(0.5) ? 'links' : 'rechts'
    for (let i = 0; i < zahl[art]; i++) {
      const ziel: Richtung = i === zahl[art] - 1 && zahl[art] % 2 === 1 ? ungerade : i % 2 === 0 ? 'links' : 'rechts'
      paare.push({ ziel, art })
    }
  }
  const folge = mischeBis(r, paare, f => laengsterLauf(f.map(x => x.ziel)) <= 3)
  const lagen = s.hubPx > 0 ? zieheFolge(r, FLANKER_LAGEN, n, (k, bisher) => k !== bisher[bisher.length - 1]) : folge.map(() => 0)
  return folge.map((x, i) => ({ ziel: x.ziel, art: x.art, reihe: flankerReihe(x.ziel, x.art), lage: lagen[i], zittern: r() }))
}

export interface FlankerMessung { art: FlankerArt; richtig: boolean; ms: number | null }

/** Flanker-Effekt: mittlere Zeit der richtigen inkongruenten minus der richtigen kongruenten Antworten. */
export function flankerEffekt(m: readonly FlankerMessung[]): number | null {
  return unterschiedMs(zeitenRichtig(m.filter(x => x.art === 'inkongruent')), zeitenRichtig(m.filter(x => x.art === 'kongruent')))
}

/**
 * Wertung: Genauigkeit über alle Durchgänge (zu langsam = falsch); Tempo aus dem Median der richtigen Antworten,
 * gemessen an der Frist der Stufe.
 */
export function flankerWertung(m: readonly FlankerMessung[], fristMs: number): Rohergebnis {
  const zeiten = zeitenRichtig(m)
  const richtig = m.filter(x => x.richtig).length
  const effekt = flankerEffekt(m)
  const schnitt = zeiten.length ? `Ø ${Math.round(mittel(zeiten))} ms` : ''
  return {
    leistung: guete(m.length ? richtig / m.length : 0, tempoAus(median(zeiten), 0.3 * fristMs + 200, 0.8 * fristMs + 100)),
    richtig, gesamt: m.length,
    rtMs: zeiten.length ? Math.round(mittel(zeiten)) : undefined,
    text: effekt === null ? schnitt || undefined : `Flanker-Effekt ${msText(effekt)} · ${schnitt}`,
  }
}
