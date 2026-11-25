// Türme von Hanoi — Logik ohne Oberfläche: Aufgabe erzeugen, Mindestzahl der Züge, Lösung, werten.
//
// Drei Stäbe. Immer nur die oberste Scheibe eines Stabs bewegen, nie eine größere auf eine kleinere.
// Ziel: alle Scheiben auf dem rechten Stab.
//
// Stufen (Scheiben · Start · Mindestzahl der Züge):
//    1  3 · Turm links      ·   7         6  6 · Turm links      ·  63
//    2  4 · Turm links      ·  15         7  6 · verteilt        ·  33–63
//    3  4 · verteilt        ·   9–15      8  7 · Turm links      · 127
//    4  5 · Turm links      ·  31         9  7 · verteilt        ·  65–127
//    5  5 · verteilt        ·  17–31     10  8 · verteilt        · 129–255
// „Turm links“ ist der klassische Fall mit 2ⁿ − 1 Zügen. „Verteilt“: Die Scheiben liegen zu Beginn
// zufällig (aber regelgerecht) auf allen drei Stäben, die größte nie schon am Ziel — sie muss also
// auf jeden Fall noch umziehen (daher mindestens 2ⁿ⁻¹ + 1 Züge). Das ist immer lösbar; das eingeübte
// Muster hilft dann nicht mehr, man muss wirklich vorausplanen.
//
// Mindestzahl für JEDE Ausgangslage: von der größten Scheibe abwärts — liegt Scheibe k nicht dort, wo
// sie hin soll, kostet das 2^(k−1) Züge, und die kleineren müssen sich vorher auf dem dritten Stab sammeln.
//
// Wertung: Züge gegen die Mindestzahl (25 % mehr Züge = 0,8 · 50 % mehr = 0,6 · mindestens 0,4) und
// Zeit gegen die Richtzeit von 8 s + 1,5 s je Mindestzug.
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'

export interface HanoiStufe { scheiben: number; verteilt: boolean }
export interface HanoiRaetsel {
  /** Zahl der Scheiben (Größen 1 … n) */
  n: number
  /** drei Stäbe, je von unten nach oben */
  start: number[][]
  /** Nummer des Zielstabs (0 links · 1 Mitte · 2 rechts) */
  ziel: number
  /** kleinste Zahl von Zügen */
  minimum: number
  verteilt: boolean
}
export type HanoiZug = [von: number, nach: number]

const STUFEN: HanoiStufe[] = [
  { scheiben: 3, verteilt: false },
  { scheiben: 4, verteilt: false },
  { scheiben: 4, verteilt: true },
  { scheiben: 5, verteilt: false },
  { scheiben: 5, verteilt: true },
  { scheiben: 6, verteilt: false },
  { scheiben: 6, verteilt: true },
  { scheiben: 7, verteilt: false },
  { scheiben: 7, verteilt: true },
  { scheiben: 8, verteilt: true },
]
export const hanoiStufe = (stufe: number): HanoiStufe => STUFEN[klemme(Math.round(stufe), 1, 10) - 1]

/** Stab jeder Scheibe: ort[k] für Scheibe k (ort[0] bleibt unbenutzt) */
export function hanoiOrte(staebe: readonly (readonly number[])[]): number[] {
  const ort: number[] = [-1]
  staebe.forEach((stab, s) => { for (const k of stab) ort[k] = s })
  return ort
}

/** Stäbe aus den Orten der Scheiben aufbauen (größte unten) */
export function hanoiStaebe(ort: readonly number[]): number[][] {
  const staebe: number[][] = [[], [], []]
  for (let k = ort.length - 1; k >= 1; k--) staebe[ort[k]].push(k)
  return staebe
}

/** Darf die oberste Scheibe von `von` auf `nach`? */
export function hanoiErlaubt(staebe: readonly (readonly number[])[], von: number, nach: number): boolean {
  if (von === nach || !staebe[von] || !staebe[nach] || !staebe[von].length) return false
  const scheibe = staebe[von][staebe[von].length - 1]
  const ziel = staebe[nach]
  return !ziel.length || ziel[ziel.length - 1] > scheibe
}

/** Zug ausführen: neue Stäbe, oder null, wenn der Zug nicht erlaubt ist */
export function hanoiZiehe(staebe: readonly (readonly number[])[], von: number, nach: number): number[][] | null {
  if (!hanoiErlaubt(staebe, von, nach)) return null
  const neu = staebe.map(s => s.slice())
  neu[nach].push(neu[von].pop() as number)
  return neu
}

export const hanoiGeloest = (staebe: readonly (readonly number[])[], ziel: number): boolean =>
  staebe.every((s, i) => i === ziel || s.length === 0)

/** Kleinste Zahl von Zügen, um aus dieser Lage alle Scheiben auf den Zielstab zu bringen */
export function hanoiMinimum(staebe: readonly (readonly number[])[], ziel: number): number {
  const ort = hanoiOrte(staebe)
  let summe = 0, soll = ziel
  for (let k = ort.length - 1; k >= 1; k--) {
    if (ort[k] === soll) continue
    summe += 2 ** (k - 1)
    soll = 3 - ort[k] - soll            // die kleineren müssen erst auf den dritten Stab
  }
  return summe
}

/** Kürzeste Zugfolge aus dieser Lage zum Ziel */
export function hanoiLoesung(staebe: readonly (readonly number[])[], ziel: number): HanoiZug[] {
  const ort = hanoiOrte(staebe)
  const zuege: HanoiZug[] = []
  // bringt die Scheiben 1 … k auf den Stab `nach`
  const bringe = (k: number, nach: number): void => {
    for (; k >= 1; k--) {
      if (ort[k] === nach) continue
      const dritter = 3 - ort[k] - nach
      bringe(k - 1, dritter)
      zuege.push([ort[k], nach])
      ort[k] = nach
      // ab hier steht der Turm 1 … k−1 geschlossen auf `dritter` und zieht nach `nach` um
    }
  }
  bringe(ort.length - 1, ziel)
  return zuege
}

/** Wie viele der größten Scheiben liegen schon endgültig am Ziel? (für den Fortschritt) */
export function hanoiAmZiel(staebe: readonly (readonly number[])[], ziel: number): number {
  const ort = hanoiOrte(staebe)
  let a = 0
  for (let k = ort.length - 1; k >= 1 && ort[k] === ziel; k--) a++
  return a
}

/** Eine neue Aufgabe. Gleicher Zufall + gleiche Stufe = gleiche Aufgabe. */
export function hanoiErzeuge(r: Rng, stufe: number): HanoiRaetsel {
  const st = hanoiStufe(stufe)
  const n = st.scheiben
  const ziel = 2
  let ort: number[] = [-1, ...new Array<number>(n).fill(0)]
  if (st.verteilt) {
    for (let versuch = 0; versuch < 50; versuch++) {
      const o: number[] = [-1]
      for (let k = 1; k <= n; k++) o.push(k === n ? r.int(0, 1) : r.int(0, 2))   // die größte nie schon am Ziel
      const belegt = new Set(o.slice(1))
      if (belegt.size < 3) continue                     // wirklich auf alle drei Stäbe verteilt
      ort = o
      break
    }
  }
  const start = hanoiStaebe(ort)
  return { n, start, ziel, minimum: hanoiMinimum(start, ziel), verteilt: st.verteilt }
}

/** Richtzeit in Sekunden */
export const hanoiRichtSek = (minimum: number): number => 8 + minimum * 1.5

/** Güte einer gelösten Aufgabe: Züge gegen die Mindestzahl, dazu die Zeit gegen die Richtzeit. */
export function hanoiLeistung(zuege: number, minimum: number, ms: number): number {
  const sorgfalt = minimum > 0 ? klemme(1 - 0.8 * (zuege / minimum - 1), 0.4, 1) : 0
  const richt = hanoiRichtSek(minimum) * 1000
  return guete(sorgfalt, tempoAus(ms, richt * 0.5, richt * 2))
}

/** Güte nach „Aufgeben“: höchstens 0,3 — je nach Anteil der Scheiben, die schon endgültig am Ziel liegen. */
export const hanoiAufgabeLeistung = (amZiel: number, n: number): number => (n > 0 ? klemme(0.3 * amZiel / n, 0, 0.3) : 0)
