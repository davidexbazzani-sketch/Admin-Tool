// Parla Italiano — Serie (Lerntage in Folge) und Joker.
// Bürogerecht: Samstag und Sonntag unterbrechen die Serie nicht. Ein verpasster Arbeitstag
// unterbricht sie — außer es ist ein Joker da (einen gibt es je Level-Aufstieg, höchstens zwei).
import type { ItDaten } from './typen'
import { istWochenende, plusTage, tagNummer } from './zeit'

/** so viele beantwortete Aufgaben machen einen Kalendertag zum Lerntag */
export const LERNTAG_AB = 12
export const JOKER_MAX = 2

export const hatGelernt = (d: Pick<ItDaten, 'tage'>, datum: string): boolean => (d.tage[datum]?.[0] ?? 0) >= LERNTAG_AB

export interface SerienStand { aktuell: number; laengste: number; heuteGelernt: boolean; /** heute noch nicht gelernt, die Serie läuft aber noch */ offen: boolean }

export function serie(d: Pick<ItDaten, 'tage' | 'jokerTage'>, heute: string): SerienStand {
  const joker = new Set(d.jokerTage)
  const zaehlt = (datum: string) => hatGelernt(d, datum) || joker.has(datum)
  const heuteGelernt = hatGelernt(d, heute)
  // aktuelle Serie: von heute rückwärts
  let aktuell = heuteGelernt ? 1 : 0
  for (let i = 1; i < 800; i++) {
    const tag = plusTage(heute, -i)
    if (zaehlt(tag)) aktuell++
    else if (!istWochenende(tag)) break
  }
  // längste Serie über alle Tage
  const alle = [...new Set([...Object.keys(d.tage).filter(t => hatGelernt(d, t)), ...d.jokerTage])].sort()
  let laengste = 0, lauf = 0, vorher = ''
  for (const tag of alle) {
    if (!vorher) lauf = 1
    else {
      let luecke = false
      for (let n = tagNummer(vorher) + 1; n < tagNummer(tag); n++) if (!istWochenende(plusTage(vorher, n - tagNummer(vorher)))) { luecke = true; break }
      lauf = luecke ? 1 : lauf + 1
    }
    if (lauf > laengste) laengste = lauf
    vorher = tag
  }
  return { aktuell, laengste: Math.max(laengste, aktuell), heuteGelernt, offen: !heuteGelernt && aktuell > 0 }
}

/**
 * Beim Öffnen: verpasste Arbeitstage seit dem letzten Lerntag mit Jokern überbrücken, falls genug da sind.
 * Reichen die Joker nicht für alle verpassten Tage, wird keiner verbraucht (die Serie ist dann ohnehin vorbei).
 */
export function setzeJokerEin(d: ItDaten, heute: string): { daten: ItDaten; eingesetzt: string[] } {
  if (d.joker <= 0) return { daten: d, eingesetzt: [] }
  const gelernt = Object.keys(d.tage).filter(t => hatGelernt(d, t)).concat(d.jokerTage).sort()
  const letzter = gelernt[gelernt.length - 1]
  if (!letzter || letzter >= heute) return { daten: d, eingesetzt: [] }
  const verpasst: string[] = []
  for (let n = tagNummer(letzter) + 1; n < tagNummer(heute); n++) {
    const tag = plusTage(letzter, n - tagNummer(letzter))
    if (!istWochenende(tag)) verpasst.push(tag)
    if (verpasst.length > d.joker) return { daten: d, eingesetzt: [] }
  }
  if (!verpasst.length) return { daten: d, eingesetzt: [] }
  return { daten: { ...d, joker: d.joker - verpasst.length, jokerTage: [...d.jokerTage, ...verpasst].slice(-60) }, eingesetzt: verpasst }
}
