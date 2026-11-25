// Der Coach — Fähigkeits-Schätzung: je Fähigkeit Wissen (w), Können (k), Tun (t) als θ zwischen −3 und +3.
// Regeln aus derCoach/02_TECHNIK.md, Abschnitt 6 (geprüft in .tmp-test/coach/kern_test.ts):
//   Schwierigkeit b = (Stufe − 5,5) × 0,6 · erwartet = 1 / (1 + e^(−(θ − b))) · θ ← θ + K × (Ergebnis − erwartet)
//   K = max(0,12; 0,5 / √(n + 1)); Formate mit Selbstbewertung und schon gesehene Wissens-Aufgaben zählen halb.
// Die Aufgabenstufe wird aus θ abgeleitet (Ziel: etwa vier von fünf gelingen), begrenzt durch das Band des Kursplans.
import type { Faehigkeitsstand } from '../typen'
import { klemme } from '../zufall'

export const leererStand = (): Faehigkeitsstand => ({ w: 0, k: 0, t: 0, nw: 0, nk: 0, nt: 0, zuletzt: 0, q: [] })
export const bVonStufe = (stufe: number): number => (stufe - 5.5) * 0.6
export const p = (theta: number): number => 1 / (1 + Math.exp(-theta))
export const erwartet = (theta: number, stufe: number): number => p(theta - bVonStufe(stufe))
export const kFaktor = (n: number): number => Math.max(0.12, 0.5 / Math.sqrt(n + 1))

export type Kanal3 = 'w' | 'k' | 't'

export interface Beleg3 { kanal: Kanal3; stufe: number; ergebnis: number; halb?: boolean }

/** einen Beleg verbuchen (rein: gibt einen neuen Stand zurück) */
export function verbuche(s: Faehigkeitsstand | undefined, b: Beleg3, tag: number): Faehigkeitsstand {
  const alt = s ?? leererStand()
  const nKey = (b.kanal === 'w' ? 'nw' : b.kanal === 'k' ? 'nk' : 'nt') as 'nw' | 'nk' | 'nt'
  const theta = alt[b.kanal]
  const n = alt[nKey]
  const e = klemme(b.ergebnis, 0, 1)
  const K = kFaktor(n) * (b.halb ? 0.5 : 1)
  const neu = klemme(theta + K * (e - erwartet(theta, b.stufe)), -3, 3)
  const q = b.kanal === 't' ? alt.q : [...alt.q, e].slice(-10)
  return { ...alt, [b.kanal]: neu, [nKey]: n + 1, zuletzt: tag, q }
}

/** Tun verblasst: ohne neue Mission je 30 Tage ein Zehntel des Abstands zum Startwert (0) */
export function tunHeute(s: Faehigkeitsstand, tag: number): number {
  const tage = Math.max(0, tag - s.zuletzt)
  return s.t * Math.pow(0.9, tage / 30)
}

/** Form 0..1 = 0,3 × Wissen + 0,4 × Können + 0,3 × Tun (als Wahrscheinlichkeit); null bei weniger als sechs Belegen */
export function form(s: Faehigkeitsstand | undefined, tag: number): number | null {
  if (!s || s.nw + s.nk + s.nt < 6) return null
  return 0.3 * p(s.w) + 0.4 * p(s.k) + 0.3 * p(tunHeute(s, tag))
}

/** Wissen − Tun > 0,3 bei mindestens sechs Wissens-Belegen → kleinere Mission statt neuer Lektion */
export function luecke(s: Faehigkeitsstand | undefined, tag: number): boolean {
  return !!s && s.nw >= 6 && p(s.w) - p(tunHeute(s, tag)) > 0.3
}

/** passende Aufgabenstufe: so, dass etwa 80 % gelingen (b = θ − 1,39), im Band [von, bis]; Notbremse über die letzten zehn */
export function stufeFuer(s: Faehigkeitsstand | undefined, kanal: 'w' | 'k', band: [number, number]): number {
  const theta = s ? s[kanal] : 0
  let stufe = Math.round((theta - 1.39) / 0.6 + 5.5)
  if (s && s.q.length >= 6) {
    const quote = s.q.reduce((a, b) => a + b, 0) / s.q.length
    if (quote > 0.9) stufe += 1
    else if (quote < 0.7) stufe -= 1
  }
  return klemme(stufe, band[0], band[1])
}

/** Ergebnis einer Auswahl mit gestuften Antworten: 2 → 1, 1 → 0,5, 0 → 0 */
export const ergebnisAusWert = (wert: 0 | 1 | 2): number => wert / 2
