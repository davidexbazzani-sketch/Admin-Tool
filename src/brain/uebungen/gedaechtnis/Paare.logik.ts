// Paare merken (Gedächtnis) — reine Logik ohne Oberfläche: Stufen, Brett, Richtwert, Wertung.
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'

export interface PaareStufe {
  spalten: number
  zeilen: number
  paare: number
  /** so lange bleibt ein falsches Paar offen liegen */
  offenMs: number
  /** 0 = bunt gemischte Motive · sonst: Motive nur aus so vielen ähnlichen Gruppen (schwerer zu unterscheiden und zu benennen) */
  gruppen: number
}

// Stufe → [Spalten, Zeilen, Gruppen]
const TABELLE: readonly (readonly [number, number, number])[] = [
  [4, 3, 0], [4, 4, 0], [5, 4, 0], [6, 4, 0], [7, 4, 0],
  [6, 5, 0], [8, 4, 0], [6, 6, 0], [6, 6, 3], [6, 6, 2],
]

/** Brett 4×3 mit 6 Paaren (Stufe 1) bis 6×6 mit 18 Paaren (ab Stufe 8); ab Stufe 9 ähnliche Motive. Offen-Zeit 1,2 s → 0,75 s. */
export function paareStufe(stufe: number): PaareStufe {
  const s = klemme(Math.round(stufe), 1, 10)
  const [spalten, zeilen, gruppen] = TABELLE[s - 1]
  return { spalten, zeilen, paare: (spalten * zeilen) / 2, offenMs: 1200 - 50 * (s - 1), gruppen }
}

/** Bunt gemischte Motive: verschiedene Dinge, Formen und Farben — leicht auseinanderzuhalten (Windows: Segoe UI Emoji) */
export const MOTIVE_BUNT: readonly string[] = [
  '🍎', '🚗', '🐶', '⭐', '⚽', '🎈', '🌵', '🐟', '🔑', '🎸', '🏠', '🍋',
  '🚀', '🦋', '🔔', '🍄', '🐢', '⚓', '🎲', '🌈', '🍩', '🐝', '💎', '🌻',
  '🐙', '🍉', '🎁', '🍀', '🔥', '⛄', '🎩', '🚲', '👑', '🥕', '🐧', '🌙',
]

/** Ähnliche Motive je Gruppe (Stufe 9–10): eindeutig verschieden, aber aus derselben Ecke — das Gedächtnis muss genauer sein */
export const MOTIV_GRUPPEN: readonly (readonly string[])[] = [
  ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'],
  ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🍍', '🥝', '🥕', '🌽', '🍆', '🥑', '🍅'],
  ['🚗', '🚕', '🚌', '🚑', '🚒', '🚜', '🚲', '🚀', '🚁', '⛵', '🚂', '🛵'],
]

/** `paare` verschiedene Motive: bunt gemischt oder gleichmäßig aus `gruppen` ähnlichen Gruppen */
export function paareMotive(r: Rng, paare: number, gruppen = 0): string[] {
  if (gruppen <= 0) return r.ausN(MOTIVE_BUNT, paare)
  const wahl = r.ausN(MOTIV_GRUPPEN, klemme(gruppen, 1, MOTIV_GRUPPEN.length)).map(g => r.misch(g))
  const motive: string[] = []
  // reihum aus jeder Gruppe eines, bis genug da sind
  for (let i = 0; motive.length < paare && i < 40; i++) {
    for (const g of wahl) if (i < g.length && motive.length < paare) motive.push(g[i])
  }
  return motive
}

export interface PaareBrett extends PaareStufe {
  /** Motiv je Karte, zeilenweise; jedes Motiv kommt genau zweimal vor */
  karten: string[]
}

/** Gemischtes Brett für eine Stufe. Gleicher Zufall + gleiche Stufe = gleiches Brett. */
export function paareBrett(r: Rng, stufe: number): PaareBrett {
  const s = paareStufe(stufe)
  const motive = paareMotive(r, s.paare, s.gruppen)
  return { ...s, karten: r.misch([...motive, ...motive]) }
}

/**
 * Richtwert für die Zahl der Züge (ein Zug = zwei Karten aufdecken).
 * Wer sich JEDE gesehene Karte merkt, braucht im Mittel etwa 1,6 Züge je Paar (weniger geht nur mit Glück)
 * und mit Pech etwa 1,75. Dort liegt der Richtwert: 6 Paare → 11 Züge, 12 → 21, 18 → 32.
 */
export const paarePar = (paare: number): number => Math.round(1.75 * paare)

/** Ab so vielen Zügen ist die Genauigkeit 0 (4 je Paar — so viel braucht man fast ohne Merken) */
export const paareSchlecht = (paare: number): number => 4 * paare

export interface PaareWertung { par: number; anteil: number; tempo: number; leistung: number }

/**
 * Güte aus Zügen und Zeit.
 *  • Züge: bis zum Richtwert 1, bei 4 Zügen je Paar 0, dazwischen gleichmäßig
 *  • Zeit: 4 s je Paar oder schneller = volles Tempo, 12 s je Paar = keines (zählt nur 20 %)
 * Damit steigt die Stufe bei etwa 2 Zügen je Paar in zügigem Tempo; ab etwa 2,7 Zügen je Paar sinkt sie.
 */
export function paareWertung(paare: number, zuege: number, sek: number): PaareWertung {
  const par = paarePar(paare)
  const schlecht = paareSchlecht(paare)
  const anteil = zuege <= par ? 1 : klemme((schlecht - zuege) / (schlecht - par), 0, 1)
  const tempo = tempoAus((sek * 1000) / Math.max(1, paare), 4000, 12000)
  return { par, anteil, tempo, leistung: guete(anteil, tempo) }
}

/** Zeit als m:ss */
export const zeitText = (sek: number): string => `${Math.floor(sek / 60)}:${String(Math.floor(sek % 60)).padStart(2, '0')}`

/** Ergebniszeile, z. B. „26 Züge (Richtwert 21) · 1:12 min“ */
export const paareText = (paare: number, zuege: number, sek: number): string =>
  `${zuege} Züge (Richtwert ${paarePar(paare)}) · ${zeitText(sek)} min`
