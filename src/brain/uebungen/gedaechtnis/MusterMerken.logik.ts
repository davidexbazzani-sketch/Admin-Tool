// Muster merken (Gedächtnis) — reine Logik ohne Oberfläche: Stufen, Muster, Wertung.
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'
import { guete } from '../../kern/wertung'

export const MUSTER_RUNDEN = 5

export interface MusterStufe {
  /** Kantenlänge des Gitters (n × n) */
  n: number
  /** Zahl der leuchtenden Felder */
  k: number
  /** so lange ist das Muster zu sehen */
  zeigeMs: number
}

// Stufe → [Gitter, Felder]
const TABELLE: readonly (readonly [number, number])[] = [
  [3, 3], [3, 4],
  [4, 5], [4, 6], [4, 7],
  [5, 8], [5, 9], [5, 10],
  [6, 11], [6, 12],
]

/** Gitter 3×3 mit 3 Feldern (Stufe 1) bis 6×6 mit 12 Feldern (Stufe 10); Zeigezeit 2,4 s → 1,86 s (je Stufe 60 ms kürzer) */
export function musterStufe(stufe: number): MusterStufe {
  const s = klemme(Math.round(stufe), 1, 10)
  const [n, k] = TABELLE[s - 1]
  return { n, k, zeigeMs: 2400 - 60 * (s - 1) }
}

/**
 * k verschiedene Felder eines n×n-Gitters (zeilenweise 0..n²−1), aufsteigend sortiert.
 * Muster, die ganz in einer Zeile oder einer Spalte liegen, werden verworfen (zu leicht).
 */
export function musterFelder(r: Rng, n: number, k: number): number[] {
  const alle = Array.from({ length: n * n }, (_, i) => i)
  const anzahl = klemme(k, 1, n * n)
  let f: number[] = []
  for (let versuch = 0; versuch < 100; versuch++) {
    f = r.ausN(alle, anzahl).sort((a, b) => a - b)
    const eineZeile = f.every(x => Math.floor(x / n) === Math.floor(f[0] / n))
    const eineSpalte = f.every(x => x % n === f[0] % n)
    if (anzahl < 2 || !(eineZeile || eineSpalte)) break
  }
  return f
}

export interface MusterWertung {
  /** markiert und Teil des Musters */
  richtig: number
  /** markiert, aber nicht Teil des Musters */
  falsch: number
  /** Teil des Musters, aber nicht markiert */
  verpasst: number
  /** Gutschrift 0..1: (richtig − falsch) / k, nie unter 0 */
  gutschrift: number
  fehlerfrei: boolean
}

export function musterWertung(muster: readonly number[], markiert: readonly number[]): MusterWertung {
  const soll = new Set(muster)
  const ist = new Set(markiert)
  let richtig = 0, falsch = 0
  ist.forEach(x => { if (soll.has(x)) richtig++; else falsch++ })
  const k = soll.size
  return { richtig, falsch, verpasst: k - richtig, gutschrift: k ? klemme((richtig - falsch) / k, 0, 1) : 0, fehlerfrei: richtig === k && falsch === 0 }
}

export interface MusterErgebnis { leistung: number; richtig: number; gesamt: number; fehlerfrei: number }

/** Fasst die Durchgänge zusammen. Nicht gespielte Durchgänge zählen als 0. Tempo zählt nicht. */
export function musterErgebnis(wertungen: readonly (MusterWertung | undefined)[], k: number, runden: number = MUSTER_RUNDEN): MusterErgebnis {
  let summe = 0, richtig = 0, fehlerfrei = 0
  for (let i = 0; i < runden; i++) {
    const w = wertungen[i]
    if (!w) continue
    summe += w.gutschrift
    richtig += w.richtig
    if (w.fehlerfrei) fehlerfrei++
  }
  return { leistung: guete(runden ? summe / runden : 0), richtig, gesamt: runden * k, fehlerfrei }
}

/** Ergebniszeile, z. B. „Gitter 5×5 mit 8 Feldern · 3 von 5 fehlerfrei“ */
export const musterText = (s: MusterStufe, fehlerfrei: number, runden: number = MUSTER_RUNDEN): string =>
  `Gitter ${s.n}×${s.n} mit ${s.k} Feldern · ${fehlerfrei} von ${runden} fehlerfrei`
