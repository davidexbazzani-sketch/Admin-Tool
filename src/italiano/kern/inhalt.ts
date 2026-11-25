// Parla Italiano — Lerninhalte laden. Jedes Level ist ein eigenes Teilpaket und wird erst
// geholt, wenn es gebraucht wird (aktuelles Level, fällige Wiederholungen, Rückblick).
import type { LevelInhalt, TagInhalt, Wort } from './inhaltTypen'
import { LEVEL_ANZAHL, levelVonTag, tagVonKennung } from './inhaltTypen'

const lader = import.meta.glob<{ default: LevelInhalt }>('../inhalt/level-*.json')
const pfadVon = (level: number): string => `../inhalt/level-${String(level).padStart(2, '0')}.json`

const speicher = new Map<number, LevelInhalt>()
const laufend = new Map<number, Promise<LevelInhalt | null>>()

/** Level, für die es Inhalte gibt (für Anzeigen wie „bis Level 8 fertig“) */
export const vorhandeneLevel = (): number[] => Array.from({ length: LEVEL_ANZAHL }, (_, i) => i + 1).filter(l => pfadVon(l) in lader)
export const gibtEsLevel = (level: number): boolean => pfadVon(level) in lader

export function ladeLevel(level: number): Promise<LevelInhalt | null> {
  const da = speicher.get(level)
  if (da) return Promise.resolve(da)
  const schon = laufend.get(level)
  if (schon) return schon
  const hole = lader[pfadVon(level)]
  const p: Promise<LevelInhalt | null> = hole
    ? hole().then(m => { speicher.set(level, m.default); return m.default }).catch(() => null)
    : Promise.resolve(null)
  laufend.set(level, p)
  void p.finally(() => laufend.delete(level))
  return p
}

export async function ladeTag(tag: number): Promise<TagInhalt | null> {
  if (tag < 1) return null
  const l = await ladeLevel(levelVonTag(tag))
  return l?.tage.find(t => t.tag === tag) ?? null
}

/** mehrere Level auf einmal (z. B. alle bis zum aktuellen für das freie Training) */
export async function ladeLevelBis(level: number): Promise<LevelInhalt[]> {
  const alle = await Promise.all(Array.from({ length: Math.max(0, Math.min(LEVEL_ANZAHL, level)) }, (_, i) => ladeLevel(i + 1)))
  return alle.filter((x): x is LevelInhalt => !!x)
}

export interface WortMitOrt { kennung: number; tag: number; platz: number; w: Wort }

/** Wörter zu ihren Kennungen holen (lädt die nötigen Level nach) */
export async function ladeWoerter(kennungen: readonly number[]): Promise<WortMitOrt[]> {
  const level = [...new Set(kennungen.map(k => levelVonTag(tagVonKennung(k))))]
  await Promise.all(level.map(ladeLevel))
  const aus: WortMitOrt[] = []
  for (const k of kennungen) {
    const tag = tagVonKennung(k), platz = k % 100
    const w = speicher.get(levelVonTag(tag))?.tage.find(t => t.tag === tag)?.woerter[platz - 1]
    if (w) aus.push({ kennung: k, tag, platz, w })
  }
  return aus
}

/** alle Wörter eines Lerntags mit Kennung */
export const woerterVon = (t: TagInhalt): WortMitOrt[] => t.woerter.map((w, i) => ({ kennung: t.tag * 100 + i + 1, tag: t.tag, platz: i + 1, w }))
