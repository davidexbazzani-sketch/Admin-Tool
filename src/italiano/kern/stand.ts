// Parla Italiano — was heute dran ist. Reine Rechnung auf dem Lernstand (gut zu testen).
//
// Regeln (Vorgabe des Nutzers, 18.11.2026):
//  • Am Tag ein Lernprogramm: die Lektion (rund 10 Minuten) und danach der Tagestest (5 Minuten)
//    zum Stoff des Vortags.
//  • Nach 5 Lerntagen kommt die große Prüfung. Erst wer sie besteht, steigt ein Level auf.
//  • Pro Kalendertag gibt es eine neue Lektion — die nächste öffnet am folgenden Tag.
import type { ItDaten } from './typen'
import { LEVEL_ANZAHL, TAGE_JE_LEVEL, levelVonTag } from './inhaltTypen'

export const LERNTAGE = LEVEL_ANZAHL * TAGE_JE_LEVEL
export const PRUEFUNGEN_JE_TAG = 2

export type Sperre = 'frei' | 'morgen' | 'pruefung' | 'ziel'

export interface TagesStand {
  level: number
  /** der Lerntag, der als nächster dran ist (null = alle 120 geschafft) */
  naechsterTag: number | null
  /** darf die nächste Lektion jetzt begonnen werden? */
  lektion: Sperre
  /** heute abgeschlossener Lerntag (null = heute noch keine Lektion) */
  heutigerTag: number | null
  /** steht der Tagestest noch aus? */
  testOffen: boolean
  /** Stoff des Tagestests: der Vortag — oder der Tag selbst, wenn es hier keinen Vortag gab */
  testStoff: number | null
  /** Level, dessen Prüfung ansteht (alle 5 Lerntage geschafft, noch nicht bestanden) */
  pruefungOffen: number | null
  /** Prüfungsversuche heute */
  versucheHeute: number
  /** Lerntag innerhalb des Levels, 0 … 5 */
  tagImLevel: number
}

export function tagesStand(d: ItDaten, heute: string): TagesStand {
  const level = d.level
  const pruefungOffen = level <= LEVEL_ANZAHL && d.lektionen >= level * TAGE_JE_LEVEL ? level : null
  const naechsterTag = d.lektionen < LERNTAGE ? d.lektionen + 1 : null
  const heuteFertig = Object.entries(d.lektionAm).filter(([, am]) => am === heute).map(([t]) => Number(t))
  const heutigerTag = heuteFertig.length ? Math.max(...heuteFertig) : null
  const lektion: Sperre = naechsterTag === null ? 'ziel' : pruefungOffen ? 'pruefung' : heutigerTag !== null ? 'morgen' : 'frei'
  const testOffen = heutigerTag !== null && d.sterne[heutigerTag] === undefined
  const testStoff = heutigerTag === null ? null : heutigerTag > 1 && d.lektionAm[heutigerTag - 1] ? heutigerTag - 1 : heutigerTag
  const versucheHeute = d.pruefungen.filter(p => p.am.slice(0, 10) === heute).length
  const imLevel = Math.max(0, Math.min(TAGE_JE_LEVEL, d.lektionen - (Math.min(level, LEVEL_ANZAHL) - 1) * TAGE_JE_LEVEL))
  return { level, naechsterTag, lektion, heutigerTag, testOffen, testStoff, pruefungOffen, versucheHeute, tagImLevel: level > LEVEL_ANZAHL ? TAGE_JE_LEVEL : imLevel }
}

/** Fortschritt durch den ganzen Kurs in Prozent (Lerntage + bestandene Prüfungen) */
export function kursFortschritt(d: Pick<ItDaten, 'lektionen' | 'level'>): number {
  const schritte = LERNTAGE + LEVEL_ANZAHL
  return Math.round(((d.lektionen + Math.min(LEVEL_ANZAHL, d.level - 1)) / schritte) * 100)
}

/** Niveau nach dem Europäischen Referenzrahmen, das mit dem Level erreicht ist */
export function erreichtesNiveau(level: number): string {
  if (level > 24) return 'B1'
  if (level > 20) return 'B1.1'
  if (level > 16) return 'A2'
  if (level > 12) return 'A2.1'
  if (level > 8) return 'A1'
  if (level > 4) return 'A1.1'
  return '–'
}

export const levelDesTags = levelVonTag
