// Nonogramm — Logik ohne Oberfläche: Bild erzeugen, Hinweise bilden, Eindeutigkeit prüfen, werten.
//
// Stufen (Größe · Anteil gefüllter Felder · Richtzeit):
//    1   5×5  · 68 % · 0:45        4   8×8 · 64 % · 2:30        7  10×10 · 64 % · 5:00
//    2   5×5  · 60 % · 1:00        5   8×8 · 57 % · 3:15        8  10×10 · 59 % · 6:00
//    3   5×5  · 52 % · 1:15        6   8×8 · 50 % · 4:00        9  10×10 · 54 % · 7:00
//                                                              10  10×10 · 50 % · 8:00
// Weniger gefüllte Felder heißt: kürzere, zerstückelte Blöcke und weniger sichere Überschneidungen —
// man muss öfter zwischen Zeilen und Spalten hin- und herschließen.
//
// Erzeugung: zufälliges Bild (etwa jedes dritte spiegelbildlich, das ergibt kleine „Figuren“), keine
// leere Zeile/Spalte. Angenommen wird ein Bild nur, wenn der Linien-Löser es aus den Hinweisen allein
// vollständig herleitet: Dann ist die Lösung eindeutig UND ohne Raten zu finden. Sonst neu würfeln
// (höchstens 400-mal, dabei wird das Bild allmählich etwas voller; Notfall: ein Rahmen).
//
// Wertung: vor allem die Zeit gegen die Richtzeit; jedes fälschlich gefüllte Feld kostet 2 % (höchstens 30 %).
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'
import { tempoAus } from '../../kern/wertung'

export interface NonoStufe { n: number; dichte: number; richtSek: number }
export interface NonoRaetsel {
  n: number
  /** n·n Felder zeilenweise: 1 = gefüllt, 0 = leer */
  bild: number[]
  /** Hinweise je Zeile (von links) und je Spalte (von oben); leere Linie = [] */
  zeilen: number[][]
  spalten: number[][]
  /** so viele Bilder wurden gewürfelt, bis eines eindeutig war */
  versuche: number
}

const STUFEN: NonoStufe[] = [
  { n: 5, dichte: 0.68, richtSek: 45 },
  { n: 5, dichte: 0.60, richtSek: 60 },
  { n: 5, dichte: 0.52, richtSek: 75 },
  { n: 8, dichte: 0.64, richtSek: 150 },
  { n: 8, dichte: 0.57, richtSek: 195 },
  { n: 8, dichte: 0.50, richtSek: 240 },
  { n: 10, dichte: 0.64, richtSek: 300 },
  { n: 10, dichte: 0.59, richtSek: 360 },
  { n: 10, dichte: 0.54, richtSek: 420 },
  { n: 10, dichte: 0.50, richtSek: 480 },
]
export const nonoStufe = (stufe: number): NonoStufe => STUFEN[klemme(Math.round(stufe), 1, 10) - 1]

/** Hinweise einer Linie: Längen der zusammenhängenden Blöcke (leere Linie → []) */
export function nonoHinweise(linie: readonly (number | boolean)[]): number[] {
  const h: number[] = []
  let lauf = 0
  for (const z of linie) {
    if (z === 1 || z === true) lauf++
    else if (lauf) { h.push(lauf); lauf = 0 }
  }
  if (lauf) h.push(lauf)
  return h
}

export const nonoGleich = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i])

/** Hinweise aller Zeilen und Spalten eines Bildes */
export function nonoAlleHinweise(bild: readonly number[], n: number): { zeilen: number[][]; spalten: number[][] } {
  const zeilen: number[][] = [], spalten: number[][] = []
  for (let z = 0; z < n; z++) zeilen.push(nonoHinweise(bild.slice(z * n, z * n + n)))
  for (let s = 0; s < n; s++) spalten.push(nonoHinweise(Array.from({ length: n }, (_, z) => bild[z * n + s])))
  return { zeilen, spalten }
}

/** Alle Lagen der Blöcke eines Hinweises in einer Linie der Länge n, je als Bitmaske (Bit i = Feld i gefüllt) */
export function nonoLagen(hinweis: readonly number[], n: number): number[] {
  const aus: number[] = []
  const geh = (k: number, ab: number, maske: number): void => {
    if (k === hinweis.length) { aus.push(maske); return }
    let rest = -1
    for (let j = k; j < hinweis.length; j++) rest += hinweis[j] + 1      // Mindestlänge der restlichen Blöcke
    for (let p = ab; p + rest <= n; p++) geh(k + 1, p + hinweis[k] + 1, maske | (((1 << hinweis[k]) - 1) << p))
  }
  geh(0, 0, 0)
  return aus
}

export interface NonoLoesung {
  /** alle Felder hergeleitet → Lösung eindeutig und ohne Raten erreichbar */
  geloest: boolean
  /** die Hinweise widersprechen sich (kommt bei erzeugten Rätseln nicht vor) */
  widerspruch: boolean
  /** n·n Felder: 1 = gefüllt, 0 = leer, −1 = offen */
  feld: number[]
  /** Runden über alle Zeilen und Spalten, bis sich nichts mehr änderte */
  durchgaenge: number
}

/**
 * Linien-Löser: schließt je Zeile/Spalte aus allen noch möglichen Lagen der Blöcke, welche Felder
 * sicher gefüllt bzw. sicher leer sind — wiederholt, bis sich nichts mehr ändert.
 */
export function nonoLoese(zeilen: readonly (readonly number[])[], spalten: readonly (readonly number[])[], n: number): NonoLoesung {
  const feld: number[] = new Array(n * n).fill(-1)
  const voll = (1 << n) - 1
  const lz = zeilen.map(h => nonoLagen(h, n))
  const ls = spalten.map(h => nonoLagen(h, n))
  let durchgaenge = 0, widerspruch = false, weiter = true
  const linie = (lagen: number[], idx: (i: number) => number): boolean => {
    let gefuellt = 0, leer = 0
    for (let i = 0; i < n; i++) { const w = feld[idx(i)]; if (w === 1) gefuellt |= 1 << i; else if (w === 0) leer |= 1 << i }
    let und = voll, oder = 0, anzahl = 0
    for (const l of lagen) {
      if ((l & leer) || (l & gefuellt) !== gefuellt) continue
      und &= l; oder |= l; anzahl++
    }
    if (!anzahl) { widerspruch = true; return false }
    let neu = false
    for (let i = 0; i < n; i++) {
      if (feld[idx(i)] !== -1) continue
      if (und & (1 << i)) { feld[idx(i)] = 1; neu = true }
      else if (!(oder & (1 << i))) { feld[idx(i)] = 0; neu = true }
    }
    return neu
  }
  while (weiter && !widerspruch && durchgaenge < 4 * n * n) {
    weiter = false
    durchgaenge++
    for (let z = 0; z < n && !widerspruch; z++) if (linie(lz[z], i => z * n + i)) weiter = true
    for (let s = 0; s < n && !widerspruch; s++) if (linie(ls[s], i => i * n + s)) weiter = true
  }
  return { geloest: !widerspruch && feld.every(w => w !== -1), widerspruch, feld, durchgaenge }
}

/** Notfall-Bild, das der Linien-Löser sicher herleitet: ein Rahmen */
export function nonoRahmen(n: number): number[] {
  const b: number[] = []
  for (let z = 0; z < n; z++) for (let s = 0; s < n; s++) b.push(z === 0 || s === 0 || z === n - 1 || s === n - 1 ? 1 : 0)
  return b
}

const fertig = (bild: number[], n: number, versuche: number): NonoRaetsel => ({ n, bild, ...nonoAlleHinweise(bild, n), versuche })

/** Ein neues Rätsel. Gleicher Zufall + gleiche Stufe = gleiches Rätsel. */
export function nonoErzeuge(r: Rng, stufe: number): NonoRaetsel {
  const st = nonoStufe(stufe)
  const n = st.n
  for (let versuch = 1; versuch <= 400; versuch++) {
    const dichte = st.dichte + Math.min(0.14, Math.floor(versuch / 25) * 0.02)
    const spiegel = r.chance(0.35)
    const bild: number[] = new Array(n * n).fill(0)
    for (let z = 0; z < n; z++) for (let s = 0; s < n; s++) {
      if (spiegel && s >= Math.ceil(n / 2)) bild[z * n + s] = bild[z * n + (n - 1 - s)]
      else bild[z * n + s] = r.chance(dichte) ? 1 : 0
    }
    // keine leere Zeile oder Spalte (wäre ein geschenkter Hinweis „0“)
    for (let z = 0; z < n; z++) {
      let leer = true
      for (let s = 0; s < n; s++) if (bild[z * n + s]) { leer = false; break }
      if (leer) { const s = r.int(0, n - 1); bild[z * n + s] = 1; if (spiegel) bild[z * n + (n - 1 - s)] = 1 }
    }
    for (let s = 0; s < n; s++) {
      let leer = true
      for (let z = 0; z < n; z++) if (bild[z * n + s]) { leer = false; break }
      if (leer) { const z = r.int(0, n - 1); bild[z * n + s] = 1; if (spiegel) bild[z * n + (n - 1 - s)] = 1 }
    }
    // ein fast volles Bild wäre witzlos
    const gefuellt = bild.reduce((a, b) => a + b, 0)
    if (gefuellt > n * n * 0.85) continue
    const h = nonoAlleHinweise(bild, n)
    if (nonoLoese(h.zeilen, h.spalten, n).geloest) return { n, bild, ...h, versuche: versuch }
  }
  return fertig(nonoRahmen(n), n, 401)
}

/** Güte eines gelösten Rätsels: Zeit gegen die Richtzeit; fälschlich gefüllte Felder kosten je 2 % (höchstens 30 %). */
export function nonoLeistung(stufe: number, ms: number, fehler: number): number {
  const richt = nonoStufe(stufe).richtSek * 1000
  const sorgfalt = 1 - Math.min(0.3, Math.max(0, fehler) * 0.02)
  return klemme(sorgfalt * (0.55 + 0.45 * tempoAus(ms, richt * 0.4, richt * 2)), 0, 1)
}

/** Güte nach „Aufgeben“: höchstens 0,3 — je nach Anteil der richtig gefüllten Felder (falsche zählen dagegen). */
export const nonoAufgabeLeistung = (richtig: number, falsch: number, gesamt: number): number =>
  gesamt > 0 ? klemme(0.3 * (richtig - falsch) / gesamt, 0, 0.3) : 0
