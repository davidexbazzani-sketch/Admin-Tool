// Aufmerksamkeit — gemeinsame reine Helfer der vier Übungen (ohne React, ohne Oberfläche):
// Stufen-Tabellen, Folgen mit Regeln (gleichmäßig verteilt, ohne unerwünschte Wiederholungen), Mittelwerte.
import type { Rng } from '../../kern/zufall'
import { klemme } from '../../kern/zufall'

/** Stufe auf eine ganze Zahl 1..10 bringen */
export const stufeGanz = (stufe: number): number => klemme(Math.round(stufe) || 1, 1, 10)

/** Wert der Stufe aus einer Tabelle mit zehn Einträgen */
export const jeStufe = <T>(tabelle: readonly T[], stufe: number): T => tabelle[stufeGanz(stufe) - 1]

/** Mittelwert (0 bei leerer Liste) */
export const mittel = (w: readonly number[]): number => (w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0)

/** Median (0 bei leerer Liste) — unempfindlich gegen einzelne Ausreißer, deshalb Grundlage der Tempo-Wertung */
export function median(w: readonly number[]): number {
  if (!w.length) return 0
  const s = w.slice().sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

/** Unterschied zweier Mittelwerte in ganzen ms (z. B. inkongruent − kongruent); null, wenn eine Seite leer ist */
export const unterschiedMs = (a: readonly number[], b: readonly number[]): number | null =>
  (a.length && b.length ? Math.round(mittel(a) - mittel(b)) : null)

/** „140 ms“ bzw. „−20 ms“ (mit echtem Minuszeichen) */
export const msText = (ms: number): string => `${Math.round(ms) < 0 ? '−' : ''}${Math.abs(Math.round(ms))} ms`

/** n-mal derselbe Wert */
export const fuelle = <T>(n: number, wert: T): T[] => Array.from({ length: Math.max(0, n) }, () => wert)

/** Länge der längsten Strecke gleicher Werte hintereinander (optional nur für Werte, die `zaehlt` annimmt) */
export function laengsterLauf<T>(folge: readonly T[], zaehlt: (wert: T) => boolean = () => true): number {
  let best = 0, lauf = 0
  for (let i = 0; i < folge.length; i++) {
    if (!zaehlt(folge[i])) { lauf = 0; continue }
    lauf = i > 0 && folge[i] === folge[i - 1] ? lauf + 1 : 1
    if (lauf > best) best = lauf
  }
  return best
}

/**
 * Zieht n Werte aus gleichmäßig gefüllten Beuteln (jeder Wert kommt so gleich oft wie möglich vor).
 * `erlaubt` darf einen Kandidaten ablehnen (z. B. „nicht derselbe wie eben“). Liegt im Beutel nichts
 * Erlaubtes, kommt ein weiterer Beutel dazu; ist die Regel gar nicht erfüllbar, gilt der erste Wert.
 */
export function zieheFolge<T>(r: Rng, werte: readonly T[], n: number, erlaubt: (kandidat: T, bisher: readonly T[]) => boolean = () => true): T[] {
  const beutel: T[] = []
  const folge: T[] = []
  for (let i = 0; i < n; i++) {
    let j = beutel.findIndex(k => erlaubt(k, folge))
    for (let nach = 0; j < 0 && nach < 3; nach++) {
      beutel.push(...r.misch(werte))
      j = beutel.findIndex(k => erlaubt(k, folge))
    }
    folge.push(beutel.splice(Math.max(0, j), 1)[0])
  }
  return folge
}

/**
 * Mischt die Liste so oft neu, bis `ok` die Reihenfolge annimmt (höchstens `versuche` Mal).
 * Die Zusammensetzung bleibt dabei exakt erhalten. Findet sich nichts, gilt die letzte Mischung —
 * die Regeln der Übungen sind so gewählt, dass das praktisch nicht vorkommt (siehe Tests).
 */
export function mischeBis<T>(r: Rng, liste: readonly T[], ok: (folge: T[]) => boolean, versuche = 500): T[] {
  let folge = r.misch(liste)
  for (let i = 1; i < versuche && !ok(folge); i++) folge = r.misch(liste)
  return folge
}

/** Reaktionszeiten der richtigen Antworten */
export const zeitenRichtig = (m: readonly { richtig: boolean; ms: number | null }[]): number[] =>
  m.filter(x => x.richtig && x.ms !== null).map(x => x.ms as number)
