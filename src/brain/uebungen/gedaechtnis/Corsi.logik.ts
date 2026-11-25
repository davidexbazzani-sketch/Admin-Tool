// Corsi-Blockspanne (Gedächtnis) — reine Logik ohne Oberfläche: Stufen, Anordnung, Blockfolgen.
// Die Wertung steht in spanne.logik.ts (gemeinsam mit der Zahlenspanne).
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'

export const CORSI_RUNDEN = 4
/** so lange leuchtet ein Block … */
export const BLOCK_AN_MS = 600
/** … und so lange ist danach Pause (zusammen 0,8 s je Block) */
export const BLOCK_PAUSE_MS = 200

/** Brett in Pixeln und Kantenlänge eines Blocks */
export const CORSI_BRETT = { breite: 560, hoehe: 372, block: 70 }

/**
 * Feste, bewusst unregelmäßige Anordnung der 9 Blöcke (linke obere Ecke in Pixeln auf dem Brett).
 * Kein Raster: die Lage lässt sich nicht als „Zeile 2, Spalte 3“ in Worte fassen — es zählt das räumliche Merken.
 */
export const CORSI_BLOECKE: readonly { x: number; y: number }[] = [
  { x: 34, y: 26 }, { x: 241, y: 8 }, { x: 442, y: 45 },
  { x: 140, y: 115 }, { x: 336, y: 134 }, { x: 12, y: 216 },
  { x: 470, y: 205 }, { x: 196, y: 276 }, { x: 353, y: 288 },
]

export interface CorsiStufe { laenge: number; rueckwaerts: boolean }

/**
 * Gleiche und umgekehrte Reihenfolge wechseln sich ab, damit die Schwierigkeit gleichmäßig steigt:
 * Stufe 1–3 gleiche Reihenfolge 3/4/5 · 4 umgekehrt 4 · 5 gleich 6 · 6 umgekehrt 5 · 7 gleich 7 ·
 * 8–10 umgekehrt 6/7/8.
 */
export const CORSI_STUFEN: readonly CorsiStufe[] = [
  { laenge: 3, rueckwaerts: false }, { laenge: 4, rueckwaerts: false }, { laenge: 5, rueckwaerts: false },
  { laenge: 4, rueckwaerts: true }, { laenge: 6, rueckwaerts: false }, { laenge: 5, rueckwaerts: true },
  { laenge: 7, rueckwaerts: false }, { laenge: 6, rueckwaerts: true }, { laenge: 7, rueckwaerts: true }, { laenge: 8, rueckwaerts: true },
]
export function corsiStufe(stufe: number): CorsiStufe {
  return CORSI_STUFEN[klemme(Math.round(stufe), 1, 10) - 1]
}

/**
 * Blockfolge (Nummern 0..8).
 *  • bis 9 Blöcke: kein Block doppelt (wie im Original), also auch nie derselbe Block zweimal hintereinander
 *  • länger: Wiederholungen erlaubt, aber nie direkt hintereinander
 */
export function corsiFolge(r: Rng, laenge: number): number[] {
  const bloecke = CORSI_BLOECKE.map((_, i) => i)
  if (laenge <= bloecke.length) return r.ausN(bloecke, laenge)
  const f: number[] = []
  for (let i = 0; i < laenge; i++) f.push(r.aus(bloecke.filter(b => b !== f[i - 1])))
  return f
}

/** Was angeklickt werden soll: die Folge selbst oder (rückwärts) von hinten nach vorn */
export const corsiSoll = (folge: readonly number[], rueckwaerts: boolean): number[] =>
  rueckwaerts ? folge.slice().reverse() : folge.slice()

/** Ergebniszeile, z. B. „Blockspanne 5 vorwärts · 3 von 4 fehlerfrei“ */
export const corsiText = (s: CorsiStufe, exakt: number, runden: number = CORSI_RUNDEN): string =>
  `Blockspanne ${s.laenge} ${s.rueckwaerts ? 'rückwärts' : 'vorwärts'} · ${exakt} von ${runden} fehlerfrei`
