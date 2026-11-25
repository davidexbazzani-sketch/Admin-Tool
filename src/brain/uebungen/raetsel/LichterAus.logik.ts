// Lichter aus — Logik ohne Oberfläche: Brett erzeugen, kürzeste Lösung berechnen, werten.
//
// Ein Klick schaltet das Feld und seine Nachbarn oben/unten/links/rechts um. Ziel: alle Lichter aus.
//
// Stufen (Brett · Klicks der kürzesten Lösung · Bretter je Durchgang):
//    1  3×3 · 2–3 · 3 Bretter        6  5×5 ·  7 · 2 Bretter
//    2  3×3 · 4–5 · 3 Bretter        7  5×5 · 10 · 1 Brett
//    3  4×4 ·  4  · 2 Bretter        8  6×6 ·  9 · 1 Brett
//    4  4×4 ·  6  · 2 Bretter        9  6×6 · 13 · 1 Brett
//    5  5×5 ·  5  · 2 Bretter       10  6×6 · 18 · 1 Brett
//
// Erzeugung: vom gelösten Brett aus k verschiedene Felder klicken — so ist jedes Brett lösbar.
// Der Richtwert („Par“) ist die kleinste Zahl von Klicks, berechnet über GF(2): Reihenfolge und
// doppelte Klicks spielen keine Rolle, also ist eine Lösung eine Menge von Feldern. Bei 4×4 und 5×5
// gibt es mehrere Lösungsmengen (16 bzw. 4); genommen wird die kleinste. Es wird neu gewürfelt
// (höchstens 60-mal), bis die kürzeste Lösung genau k Klicks hat.
//
// Wertung: Klicks gegen den Richtwert (Par = volle Güte, das Doppelte = halbe) und Zeit gegen die
// Richtzeit von 5 s + Par × (2 + Kantenlänge) s je Brett. Bei mehreren Brettern zählen die Summen.
import type { Rng } from '../../kern/zufall'
import { klemme, rng } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'

export interface LichterStufe { n: number; klicksVon: number; klicksBis: number; bretter: number }
export interface LichterBrett {
  n: number
  /** n·n Felder zeilenweise: Licht an? */
  an: boolean[]
  /** kürzeste Lösung: diese Felder je einmal klicken (Reihenfolge egal) */
  loesung: number[]
  /** Länge der kürzesten Lösung */
  par: number
}

const STUFEN: LichterStufe[] = [
  { n: 3, klicksVon: 2, klicksBis: 3, bretter: 3 },
  { n: 3, klicksVon: 4, klicksBis: 5, bretter: 3 },
  { n: 4, klicksVon: 4, klicksBis: 4, bretter: 2 },
  { n: 4, klicksVon: 6, klicksBis: 6, bretter: 2 },
  { n: 5, klicksVon: 5, klicksBis: 5, bretter: 2 },
  { n: 5, klicksVon: 7, klicksBis: 7, bretter: 2 },
  { n: 5, klicksVon: 10, klicksBis: 10, bretter: 1 },
  { n: 6, klicksVon: 9, klicksBis: 9, bretter: 1 },
  { n: 6, klicksVon: 13, klicksBis: 13, bretter: 1 },
  { n: 6, klicksVon: 18, klicksBis: 18, bretter: 1 },
]
export const lichterStufe = (stufe: number): LichterStufe => STUFEN[klemme(Math.round(stufe), 1, 10) - 1]

/** Felder, die ein Klick auf Feld i umschaltet (das Feld selbst und seine Nachbarn) */
export function lichterWirkung(n: number, i: number): number[] {
  const z = Math.floor(i / n), s = i % n
  const w = [i]
  if (z > 0) w.push(i - n)
  if (z < n - 1) w.push(i + n)
  if (s > 0) w.push(i - 1)
  if (s < n - 1) w.push(i + 1)
  return w
}

/** Brett nach einem Klick auf Feld i (neue Liste) */
export function lichterKlick(an: readonly boolean[], n: number, i: number): boolean[] {
  const neu = an.slice()
  for (const j of lichterWirkung(n, i)) neu[j] = !neu[j]
  return neu
}

export const lichterAus = (an: readonly boolean[]): boolean => an.every(x => !x)

/**
 * Kürzeste Lösung eines Bretts: Gleichungssystem über GF(2) lösen, dann unter allen Lösungen
 * (eine besondere + jede Kombination des Kerns) die mit den wenigsten Klicks wählen.
 * Gibt die zu klickenden Felder zurück, oder null, wenn das Brett unlösbar ist.
 */
export function lichterLoese(an: readonly boolean[], n: number): number[] | null {
  const N = n * n
  const m: number[][] = []
  for (let i = 0; i < N; i++) {
    const zeile: number[] = new Array(N + 1).fill(0)
    for (const j of lichterWirkung(n, i)) zeile[j] = 1
    zeile[N] = an[i] ? 1 : 0
    m.push(zeile)
  }
  const pivot: number[] = []          // Spalte des führenden Eintrags je Zeile
  let zeile = 0
  for (let spalte = 0; spalte < N && zeile < N; spalte++) {
    let p = -1
    for (let z = zeile; z < N; z++) if (m[z][spalte]) { p = z; break }
    if (p < 0) continue
    if (p !== zeile) { const t = m[p]; m[p] = m[zeile]; m[zeile] = t }
    for (let z = 0; z < N; z++) {
      if (z === zeile || !m[z][spalte]) continue
      for (let k = spalte; k <= N; k++) m[z][k] ^= m[zeile][k]
    }
    pivot.push(spalte)
    zeile++
  }
  for (let z = zeile; z < N; z++) if (m[z][N]) return null            // 0 = 1 → unlösbar
  const istPivot: boolean[] = new Array(N).fill(false)
  for (const p of pivot) istPivot[p] = true
  const frei: number[] = []
  for (let k = 0; k < N; k++) if (!istPivot[k]) frei.push(k)
  const x0: number[] = new Array(N).fill(0)
  pivot.forEach((sp, z) => { x0[sp] = m[z][N] })
  const kern: number[][] = frei.map(f => {
    const v: number[] = new Array(N).fill(0)
    v[f] = 1
    pivot.forEach((sp, z) => { v[sp] = m[z][f] })
    return v
  })
  let best = x0, bestGewicht = x0.reduce((a, b) => a + b, 0)
  const d = Math.min(kern.length, 12)                                  // n ≤ 6: höchstens 4
  for (let kombi = 1; kombi < (1 << d); kombi++) {
    const x = x0.slice()
    for (let b = 0; b < d; b++) if (kombi & (1 << b)) for (let k = 0; k < N; k++) x[k] ^= kern[b][k]
    const g = x.reduce((a, c) => a + c, 0)
    if (g < bestGewicht) { best = x; bestGewicht = g }
  }
  const felder: number[] = []
  for (let k = 0; k < N; k++) if (best[k]) felder.push(k)
  return felder
}

/** Ein neues Brett. Gleicher Zufall + gleiche Stufe = gleiches Brett. */
export function lichterErzeuge(r: Rng, stufe: number): LichterBrett {
  const st = lichterStufe(stufe)
  const n = st.n, N = n * n
  const k = r.int(st.klicksVon, st.klicksBis)
  const alle = Array.from({ length: N }, (_, i) => i)
  let best: LichterBrett | null = null
  for (let versuch = 0; versuch < 60; versuch++) {
    let an: boolean[] = new Array(N).fill(false)
    for (const i of r.ausN(alle, k)) an = lichterKlick(an, n, i)
    if (lichterAus(an)) continue
    const loesung = lichterLoese(an, n)
    if (!loesung || !loesung.length) continue
    if (!best || loesung.length > best.par) best = { n, an, loesung, par: loesung.length }
    if (loesung.length === k) break
  }
  if (!best) {
    // praktisch unerreichbar — ein einzelner Klick in die Mitte ist immer ein gültiges Brett
    const i = Math.floor(N / 2)
    best = { n, an: lichterKlick(new Array(N).fill(false), n, i), loesung: [i], par: 1 }
  }
  return best
}

/** Alle Bretter eines Durchgangs — verschieden voneinander (auf 3×3 gibt es nur wenige). */
export function lichterDurchgang(start: number, stufe: number): LichterBrett[] {
  const st = lichterStufe(stufe)
  const bretter: LichterBrett[] = []
  for (let salz = 0; bretter.length < st.bretter; salz++) {
    const b = lichterErzeuge(rng(start).zweig(`lichter${salz}`), stufe)
    // ein Brett, das es in diesem Durchgang schon gab, wird übersprungen (nach 20 Würfen nicht mehr → endet sicher)
    if (salz < 20 && bretter.some(x => x.an.join() === b.an.join())) continue
    bretter.push(b)
  }
  return bretter
}

/** Richtzeit für ein Brett in Sekunden */
export const lichterRichtSek = (n: number, par: number): number => 5 + par * (2 + n)

/**
 * Güte eines gelösten Durchgangs: Klicks gegen den Richtwert (Par = 1,0 · das 1,5-fache = 0,75 ·
 * das Doppelte = 0,5 · darüber mindestens 0,4), dazu die Zeit gegen die Richtzeit.
 */
export function lichterLeistung(zuege: number, par: number, ms: number, richtMs: number): number {
  const sorgfalt = par > 0 ? klemme(1 - 0.5 * (zuege - par) / par, 0.4, 1) : 0
  return guete(sorgfalt, tempoAus(ms, richtMs * 0.5, richtMs * 2))
}

/** Güte nach „Aufgeben“: höchstens 0,4 — je nach Anteil der schon gelösten Bretter. */
export const lichterAufgabeLeistung = (geloest: number, bretter: number): number =>
  bretter > 0 ? klemme(0.45 * geloest / bretter, 0, 0.4) : 0
