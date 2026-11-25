// Gemeinsame Wertung für Spannen-Aufgaben (Zahlenspanne, Corsi-Blockspanne) — reine Logik.
// Eine Folge wird gezeigt, der Benutzer gibt sie wieder. Voll zählt nur die fehlerfreie Wiedergabe,
// für „fast richtig“ gibt es einen Teil.
import { guete } from '../../kern/wertung'

/** höchste Gutschrift für eine NICHT fehlerfreie Wiedergabe */
export const TEIL_HOECHSTENS = 0.6

/** Länge der längsten gemeinsamen Teilfolge (Reihenfolge bleibt erhalten, Lücken erlaubt) */
export function gemeinsameTeilfolge(a: readonly number[], b: readonly number[]): number {
  let vor = new Array<number>(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    const zeile = new Array<number>(b.length + 1).fill(0)
    for (let j = 1; j <= b.length; j++) zeile[j] = a[i - 1] === b[j - 1] ? vor[j - 1] + 1 : Math.max(vor[j], zeile[j - 1])
    vor = zeile
  }
  return vor[b.length]
}

export interface FolgeWertung {
  /** genau richtig wiedergegeben */
  exakt: boolean
  /** so viele Glieder stehen in der richtigen Reihenfolge (längste gemeinsame Teilfolge) */
  inReihe: number
  /** Gutschrift 0..1 für diesen Durchgang */
  gutschrift: number
}

/**
 * Wertet eine Wiedergabe.
 *  • fehlerfrei → 1
 *  • sonst höchstens 0,6: (Glieder in richtiger Reihenfolge − 1) / (Länge − 1) · 0,6.
 *    Das „− 1“ zieht den Zufall ab: ein einzelnes passendes Glied findet sich fast immer.
 *    Eine vertauschte Stelle bei Länge 6 gibt so 0,48, die Folge verkehrt herum gibt 0.
 *  Bei 4 Durchgängen heißt das: 3 fehlerfrei + 1 beinahe → Stufe steigt, 2 + 2 → Stufe bleibt,
 *  kein einziger fehlerfrei → Stufe sinkt.
 */
export function folgeWertung(soll: readonly number[], ist: readonly number[]): FolgeWertung {
  const exakt = soll.length === ist.length && soll.every((x, i) => x === ist[i])
  const inReihe = gemeinsameTeilfolge(soll, ist)
  const laenge = Math.max(soll.length, ist.length)
  const gutschrift = exakt ? 1 : laenge > 1 ? TEIL_HOECHSTENS * Math.max(0, inReihe - 1) / (laenge - 1) : 0
  return { exakt, inReihe, gutschrift }
}

export interface SpannenErgebnis {
  /** Güte 0..1: Mittel der Gutschriften über alle Durchgänge */
  leistung: number
  /** Glieder in richtiger Reihenfolge, über alle Durchgänge */
  richtig: number
  gesamt: number
  /** fehlerfreie Durchgänge */
  exakt: number
}

/** Fasst die Durchgänge zusammen. Nicht gespielte Durchgänge zählen als 0. Tempo zählt nicht. */
export function spannenErgebnis(wertungen: readonly (FolgeWertung | undefined)[], laenge: number, runden: number): SpannenErgebnis {
  let summe = 0, richtig = 0, exakt = 0
  for (let i = 0; i < runden; i++) {
    const w = wertungen[i]
    if (!w) continue
    summe += w.gutschrift
    richtig += Math.min(laenge, w.inReihe)
    if (w.exakt) exakt++
  }
  return { leistung: guete(runden ? summe / runden : 0), richtig, gesamt: runden * laenge, exakt }
}
