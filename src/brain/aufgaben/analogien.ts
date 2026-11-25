// Wort-Analogien (Sprache): „Hand : Finger = Fuß : ?“ — die Beziehung des ersten Wortpaars erkennen und
// auf das zweite übertragen. Alle Aufgaben sind von Hand geschrieben (sprachdaten/analogien.ts).
//
// Stufen: Die Aufgaben sind in fünf Schwierigkeitslagen eingeteilt (1 = Alltagswörter, offensichtliche
// Beziehung … 5 = Bildungswortschatz, feine Beziehung). Die Stufe wandert gleichmäßig durch die Lagen:
//   Stufe 1 → nur Lage 1 · Stufe 2 → Lage 1/2 · Stufe 3 → fast nur Lage 2 · Stufe 4–5 → Lage 2/3 ·
//   Stufe 6–7 → Lage 3/4 · Stufe 8–9 → Lage 4/5 · Stufe 10 → nur Lage 5.
// Stufe 1–3: vier Antworten · ab Stufe 4: fünf Antworten. Die Richtzeit steigt von 21 auf 30 Sekunden.
import type { Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { hash32, klemme } from '../kern/zufall'
import { textAuswahl } from './hilfen'
import { ANALOGIEN, BEZIEHUNG, type Analogie, type Lage } from './sprachdaten/analogien'

const JE_LAGE: Analogie[][] = [1, 2, 3, 4, 5].map(t => ANALOGIEN.filter(a => a.t === t))

/** Stufe 1–10 → Lage 1–5 als Kommazahl (1 · 1,44 · 1,89 · 2,33 · 2,78 · 3,22 · 3,67 · 4,11 · 4,56 · 5) */
export const lagePunkt = (stufe: number): number => 1 + ((klemme(Math.round(stufe), 1, 10) - 1) * 4) / 9

/** Lage für EINE Aufgabe: zwischen zwei Lagen wird nach dem Nachkommaanteil gemischt */
export function lageFuer(r: Rng, stufe: number): Lage {
  const p = lagePunkt(stufe)
  const unten = Math.floor(p)
  return klemme(unten + (r() < p - unten ? 1 : 0), 1, 5) as Lage
}

/** alle Aufgaben, die auf einer Stufe vorkommen können (für Tests und Auswertung) */
export function vorrat(stufe: number): Analogie[] {
  const p = lagePunkt(stufe)
  const unten = Math.floor(p)
  return p > unten ? [...JE_LAGE[unten - 1], ...JE_LAGE[unten]] : JE_LAGE[unten - 1]
}

/** die Gleichung, wie sie gezeigt wird */
export const gleichung = (a: Analogie): string => `${a.a} : ${a.b} = ${a.c} : ?`

/** Kennung einer Aufgabe (z. B. um schon gezeigte Aufgaben zu merken) */
export const kennung = (a: Analogie): number => hash32(`analogie|${a.a}|${a.b}|${a.c}`)

/** Aus einer Analogie eine Frage bauen (Antworten mischen, Spalten nach Wortlänge) */
export function frageAus(r: Rng, a: Analogie, stufe: number): Frage {
  const s = klemme(Math.round(stufe), 1, 10)
  const anzahl = s <= 3 ? 4 : 5
  const { optionen, richtig } = textAuswahl(r, a.d, a.f, anzahl)
  const laengste = Math.max(...optionen.map(o => (o.art === 'text' ? o.text.length : 0)))
  return {
    aufgabe: 'Welches Wort ergänzt die Gleichung?',
    zeige: T(gleichung(a)),
    optionen, richtig,
    // fünf kurze Wörter passen in eine Reihe; lange brauchen breitere Knöpfe
    spalten: optionen.length <= 4 ? 2 : laengste <= 9 ? 5 : 3,
    erklaerung: `${BEZIEHUNG[a.r]}: ${a.e} Gesucht: ${a.d}.`,
    zeitSek: 20 + s,
  }
}

export const erzeuge: FragenGenerator = (r, stufe) => {
  const s = klemme(Math.round(stufe), 1, 10)
  const lage = lageFuer(r, s)
  return frageAus(r, r.aus(JE_LAGE[lage - 1]), s)
}
