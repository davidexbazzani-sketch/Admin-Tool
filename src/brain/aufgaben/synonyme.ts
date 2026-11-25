// Synonym / Gegenteil (Sprache): zu einem Wort das bedeutungsgleiche oder das gegenteilige Wort finden.
// Zwei Frageformen, gemischt — das Zeichen in der Mitte hilft, sie nicht zu verwechseln:
//   „≈“ = bedeutet etwa dasselbe · „↔“ = Gegenteil.
// Alle Aufgaben sind von Hand geschrieben (sprachdaten/synonyme.ts).
//
// Stufen: fünf Schwierigkeitslagen (1 = Alltagswörter … 5 = Bildungswortschatz), die Stufe wandert gleichmäßig
// hindurch (Stufe 1 → Lage 1 · Stufe 5 → Lage 2/3 · Stufe 10 → Lage 5). Ab Lage 3 sind unter den falschen
// Antworten „Beinahe-Treffer“ (verwandte Bedeutung, andere Färbung) und ähnlich klingende Wörter.
// Immer vier Antworten. Die Richtzeit steigt von 16 auf 25 Sekunden.
import type { Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { hash32, klemme } from '../kern/zufall'
import { textAuswahl } from './hilfen'
import type { Lage } from './sprachdaten/analogien'
import { WORTPAARE, type WortPaar } from './sprachdaten/synonyme'

const JE_LAGE: WortPaar[][] = [1, 2, 3, 4, 5].map(t => WORTPAARE.filter(p => p.t === t))

/** Stufe 1–10 → Lage 1–5 als Kommazahl */
export const lagePunkt = (stufe: number): number => 1 + ((klemme(Math.round(stufe), 1, 10) - 1) * 4) / 9

export function lageFuer(r: Rng, stufe: number): Lage {
  const p = lagePunkt(stufe)
  const unten = Math.floor(p)
  return klemme(unten + (r() < p - unten ? 1 : 0), 1, 5) as Lage
}

/** alle Aufgaben, die auf einer Stufe vorkommen können */
export function vorrat(stufe: number): WortPaar[] {
  const p = lagePunkt(stufe)
  const unten = Math.floor(p)
  return p > unten ? [...JE_LAGE[unten - 1], ...JE_LAGE[unten]] : JE_LAGE[unten - 1]
}

export const kennung = (p: WortPaar): number => hash32(`wortpaar|${p.art}|${p.w}`)

const AUFGABE = {
  syn: (w: string) => `Welches Wort bedeutet etwa dasselbe wie „${w}“?`,
  geg: (w: string) => `Welches Wort ist das Gegenteil von „${w}“?`,
}

function erklaerung(p: WortPaar): string {
  const bedeutung = p.b ? `„${p.w}“ heißt: ${p.b}. ` : ''
  return p.art === 'syn'
    ? `${bedeutung}„${p.w}“ und „${p.r}“ bedeuten etwa dasselbe.`
    : `${bedeutung}Das Gegenteil von „${p.w}“ ist „${p.r}“.`
}

export function frageAus(r: Rng, p: WortPaar, stufe: number): Frage {
  const s = klemme(Math.round(stufe), 1, 10)
  const { optionen, richtig } = textAuswahl(r, p.r, p.f, 4)
  return {
    aufgabe: AUFGABE[p.art](p.w),
    zeige: T(`${p.w}  ${p.art === 'syn' ? '≈' : '↔'}  ?`),
    optionen, richtig,
    spalten: 2,
    erklaerung: erklaerung(p),
    zeitSek: 15 + s,
  }
}

export const erzeuge: FragenGenerator = (r, stufe) => {
  const s = klemme(Math.round(stufe), 1, 10)
  const lage = lageFuer(r, s)
  return frageAus(r, r.aus(JE_LAGE[lage - 1]), s)
}
