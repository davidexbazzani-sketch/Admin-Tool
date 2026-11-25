// Parla Italiano — Karteikasten (Wiederholung zur richtigen Zeit).
// Jedes gelernte Wort liegt in einem von fünf Fächern. Richtig → ein Fach weiter und später
// wieder dran; falsch → zurück in Fach 1 und morgen wieder dran.
import type { KastenEintrag } from './typen'

export const FAECHER = 5
/** Abstand bis zur nächsten Wiederholung, je Fach (Fach 1 = morgen) */
export const ABSTAND = [0, 1, 3, 7, 16, 35]
/** ab diesem Fach gilt ein Wort als „sicher“ */
export const SICHER_AB = 4

export type Kasten = Record<number, KastenEintrag>

/** neues Wort aus der Lektion: Fach 1, morgen fällig */
export const neuerEintrag = (heuteNr: number): KastenEintrag => [1, heuteNr + ABSTAND[1], 0, 0]

export function bewerte(e: KastenEintrag | undefined, richtig: boolean, heuteNr: number): KastenEintrag {
  const [fach, faellig, r, f] = e ?? [1, heuteNr, 0, 0]
  if (!richtig) return [1, heuteNr + ABSTAND[1], r, f + 1]
  // noch nicht fällig und trotzdem richtig (z. B. in der Lektion geübt): Fach bleibt, Zähler steigt
  if (faellig > heuteNr) return [fach, faellig, r + 1, f]
  const neu = Math.min(FAECHER, fach + 1)
  return [neu, heuteNr + ABSTAND[neu], r + 1, f]
}

/** fällige Wörter, die dringendsten zuerst (lange überfällig, niedriges Fach) */
export function faellige(kasten: Kasten, heuteNr: number, ausser?: (kennung: number) => boolean): number[] {
  return Object.entries(kasten)
    .filter(([k, e]) => e[1] <= heuteNr && !(ausser && ausser(Number(k))))
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || Number(a[0]) - Number(b[0]))
    .map(([k]) => Number(k))
}

export interface KastenStand { gelernt: number; sicher: number; faellig: number; jeFach: number[] }
export function kastenStand(kasten: Kasten, heuteNr: number): KastenStand {
  const jeFach = Array(FAECHER + 1).fill(0) as number[]
  let sicher = 0, faellig = 0
  const alle = Object.values(kasten)
  for (const e of alle) {
    jeFach[Math.max(1, Math.min(FAECHER, e[0]))]++
    if (e[0] >= SICHER_AB) sicher++
    if (e[1] <= heuteNr) faellig++
  }
  return { gelernt: alle.length, sicher, faellig, jeFach }
}

/** Wörter, die besonders oft falsch waren (für „Meine Stolpersteine“) */
export function stolpersteine(kasten: Kasten, anzahl: number): number[] {
  return Object.entries(kasten)
    .filter(([, e]) => e[3] >= 2 && e[3] * 2 >= e[2])
    .sort((a, b) => b[1][3] - a[1][3] || a[1][0] - b[1][0])
    .slice(0, anzahl)
    .map(([k]) => Number(k))
}
