// N-Back (Gedächtnis) — reine Logik ohne Oberfläche: Stufen, Folge, Wertung.
// Getestet in .tmp-test/brain/gedaechtnis_test.ts.
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'
import { guete } from '../../kern/wertung'

/** 3×3-Gitter, Felder zeilenweise 0..8 */
export const NBACK_FELDER = 9
/** Schritte, die gewertet werden können (ab dem n-ten Schritt) */
export const NBACK_WERTBAR = 20

export interface NBackStufe {
  /** wie viele Schritte zurück verglichen wird */
  n: number
  /** Abstand von Feld zu Feld */
  intervallMs: number
  /** so lange leuchtet das Feld */
  anMs: number
  /** Länge der Folge: 20 wertbare Schritte + n Schritte Vorlauf */
  schritte: number
}

// Stufe → [n, Abstand in ms]; je n wird der Abstand von 2,6 s auf 1,8 s kürzer
const TABELLE: readonly (readonly [number, number])[] = [
  [1, 2600], [1, 1800],
  [2, 2600], [2, 2200], [2, 1800],
  [3, 2600], [3, 2200], [3, 1800],
  [4, 2600], [4, 1800],
]

export function nbackStufe(stufe: number): NBackStufe {
  const [n, intervallMs] = TABELLE[klemme(Math.round(stufe), 1, 10) - 1]
  return { n, intervallMs, anMs: Math.min(1000, Math.round(intervallMs * 0.4)), schritte: NBACK_WERTBAR + n }
}

export interface NBackFolge {
  /** Feld je Schritt (0..8) */
  pos: number[]
  /** Treffer: dasselbe Feld wie vor n Schritten */
  ziel: boolean[]
  /** Köder: dasselbe Feld wie vor n−1 oder n+1 Schritten, aber KEIN Treffer */
  koeder: boolean[]
}

const laengsterLauf = (sortiert: readonly number[]): number => {
  let best = 0, lauf = 0
  sortiert.forEach((x, i) => { lauf = i > 0 && x === sortiert[i - 1] + 1 ? lauf + 1 : 1; best = Math.max(best, lauf) })
  return best
}

/**
 * Erzeugt eine Folge für n-Back.
 *  • 5–7 Treffer auf 20 wertbare Schritte (25–35 %; die Anzahl schwankt, damit Mitzählen nichts bringt)
 *  • höchstens 2 Treffer direkt hintereinander, Stellen zufällig verteilt
 *  • Köder (Feld von vor n−1 bzw. n+1 Schritten) — wer nur „kam mir bekannt vor“ drückt, fällt darauf herein
 *  • ab n = 2 keine zufälligen direkten Wiederholungen (nur als Köder bei n = 2)
 * `ziel` wird am Ende aus den Feldern selbst berechnet und stimmt deshalb immer.
 */
export function nbackFolge(r: Rng, n: number, schritte: number = NBACK_WERTBAR + n): NBackFolge {
  const wertbar = Math.max(1, schritte - n)
  const zielAnzahl = klemme(r.int(Math.round(wertbar * 0.25), Math.round(wertbar * 0.35)), 1, wertbar)
  const kandidaten = Array.from({ length: wertbar }, (_, i) => i + n)
  let stellen: number[] = []
  for (let versuch = 0; versuch < 300; versuch++) {
    stellen = r.ausN(kandidaten, zielAnzahl).sort((a, b) => a - b)
    if (laengsterLauf(stellen) <= 2) break
  }
  const istZiel = new Set(stellen)
  const koederP = n === 1 ? 0.12 : 0.22
  const felder = Array.from({ length: NBACK_FELDER }, (_, i) => i)
  const pos: number[] = []
  for (let i = 0; i < schritte; i++) {
    if (istZiel.has(i)) { pos.push(pos[i - n]); continue }
    const treffer = i >= n ? pos[i - n] : -1
    let p = -1
    // Köder nur dort, wo schon gewertet wird
    if (i >= n && r.chance(koederP)) {
      const k = [n - 1, n + 1].filter(d => d >= 1 && i - d >= 0).map(d => pos[i - d]).filter(x => x !== treffer)
      if (k.length) p = r.aus(k)
    }
    if (p < 0) {
      const vorher = n >= 2 && i >= 1 ? pos[i - 1] : -1
      p = r.aus(felder.filter(f => f !== treffer && f !== vorher))
    }
    pos.push(p)
  }
  const ziel = pos.map((p, i) => i >= n && p === pos[i - n])
  const koeder = pos.map((p, i) => !ziel[i] && i >= n && ((n > 1 && p === pos[i - (n - 1)]) || (i >= n + 1 && p === pos[i - (n + 1)])))
  return { pos, ziel, koeder }
}

export interface NBackWertung {
  treffer: number
  verpasst: number
  fehlalarme: number
  /** Schritte, bei denen gedrückt werden musste */
  ziele: number
  /** richtig entschiedene Schritte (Treffer + zu Recht nicht gedrückt) */
  richtigeSchritte: number
  /** Güte 0..1 */
  leistung: number
}

/**
 * Wertung: (Treffer − Fehlalarme) / Zahl der Ziele, nie unter 0.
 * Ein Fehlalarm kostet so viel wie ein verpasster Treffer. Nie drücken, immer drücken und Raten ergeben 0,
 * nur fehlerfrei ergibt 1. Tempo zählt nicht — hier geht es ums Behalten.
 */
export function nbackWertung(ziel: readonly boolean[], gedrueckt: readonly (boolean | undefined)[]): NBackWertung {
  let treffer = 0, verpasst = 0, fehlalarme = 0, ziele = 0
  ziel.forEach((z, i) => {
    const g = !!gedrueckt[i]
    if (z) { ziele++; if (g) treffer++; else verpasst++ } else if (g) fehlalarme++
  })
  const anteil = ziele ? klemme((treffer - fehlalarme) / ziele, 0, 1) : 0
  return { treffer, verpasst, fehlalarme, ziele, richtigeSchritte: ziel.length - verpasst - fehlalarme, leistung: guete(anteil) }
}

/** Ergebniszeile, z. B. „2-Back · 6 von 7 Treffern, 1 Fehlalarm“ */
export function nbackText(n: number, w: NBackWertung): string {
  const fa = w.fehlalarme === 0 ? 'kein Fehlalarm' : w.fehlalarme === 1 ? '1 Fehlalarm' : `${w.fehlalarme} Fehlalarme`
  return `${n}-Back · ${w.treffer} von ${w.ziele} Treffern, ${fa}`
}
