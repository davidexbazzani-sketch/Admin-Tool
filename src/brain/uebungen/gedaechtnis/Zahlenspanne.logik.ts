// Zahlenspanne (Gedächtnis) — reine Logik ohne Oberfläche: Stufen und Ziffernfolgen.
// Die Wertung steht in spanne.logik.ts (gemeinsam mit der Blockspanne).
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'

export const SPANNE_RUNDEN = 4
/** so lange steht eine Ziffer da … */
export const ZIFFER_AN_MS = 800
/** … danach ist das Feld kurz leer (zusammen 1 s je Ziffer) */
export const ZIFFER_PAUSE_MS = 200

export interface SpanneStufe { laenge: number; rueckwaerts: boolean }

/**
 * Vorwärts und rückwärts wechseln sich ab, damit die Schwierigkeit gleichmäßig steigt
 * (rückwärts ist bei gleicher Länge deutlich schwerer — ein Block „erst alles vorwärts, dann
 * rückwärts“ hätte beim Wechsel einen Knick nach unten):
 * Stufe 1–3 vorwärts 3/4/5 · 4 rückwärts 4 · 5 vorwärts 6 · 6 rückwärts 5 · 7 vorwärts 7 ·
 * 8–10 rückwärts 6/7/8.
 */
export const SPANNE_STUFEN: readonly SpanneStufe[] = [
  { laenge: 3, rueckwaerts: false }, { laenge: 4, rueckwaerts: false }, { laenge: 5, rueckwaerts: false },
  { laenge: 4, rueckwaerts: true }, { laenge: 6, rueckwaerts: false }, { laenge: 5, rueckwaerts: true },
  { laenge: 7, rueckwaerts: false }, { laenge: 6, rueckwaerts: true }, { laenge: 7, rueckwaerts: true }, { laenge: 8, rueckwaerts: true },
]
export function spanneStufe(stufe: number): SpanneStufe {
  return SPANNE_STUFEN[klemme(Math.round(stufe), 1, 10) - 1]
}

/** drei Ziffern hintereinander auf- oder absteigend (z. B. 4-5-6 oder 9-8-7) — zu leicht als Block zu merken */
const hatTreppe = (f: readonly number[]): boolean =>
  f.some((x, i) => i >= 2 && ((x - f[i - 1] === 1 && f[i - 1] - f[i - 2] === 1) || (x - f[i - 1] === -1 && f[i - 1] - f[i - 2] === -1)))

/**
 * Ziffernfolge 0–9.
 *  • bis 10 Ziffern: keine Ziffer doppelt (wie in den üblichen Tests), also auch nie zwei gleiche hintereinander
 *  • länger: Wiederholungen erlaubt, aber nie direkt hintereinander
 *  • keine „Treppen“ aus drei Ziffern (4-5-6, 9-8-7)
 */
export function spanneFolge(r: Rng, laenge: number): number[] {
  const ziffern = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  let f: number[] = []
  for (let versuch = 0; versuch < 200; versuch++) {
    if (laenge <= ziffern.length) f = r.ausN(ziffern, laenge)
    else {
      f = []
      for (let i = 0; i < laenge; i++) f.push(r.aus(ziffern.filter(z => z !== f[i - 1])))
    }
    if (!hatTreppe(f)) break
  }
  return f
}

/** Was eingegeben werden soll: die Folge selbst oder (rückwärts) von hinten nach vorn */
export const spanneSoll = (folge: readonly number[], rueckwaerts: boolean): number[] =>
  rueckwaerts ? folge.slice().reverse() : folge.slice()

/** Ergebniszeile, z. B. „Spanne 6 vorwärts · 3 von 4 fehlerfrei“ */
export const spanneText = (s: SpanneStufe, exakt: number, runden: number = SPANNE_RUNDEN): string =>
  `Spanne ${s.laenge} ${s.rueckwaerts ? 'rückwärts' : 'vorwärts'} · ${exakt} von ${runden} fehlerfrei`
