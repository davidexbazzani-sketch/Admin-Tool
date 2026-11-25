// Der Coach — Serie, Wochenziel, Antrieb.
// Serie zählt Trainingstage. Tage, die nicht als Trainingstage gewählt sind, unterbrechen nicht. Ein einzelner
// ausgelassener Trainingstag ist rettbar: Wer am nächsten Trainingstag trainiert (auch nur das Kurztraining),
// behält die Serie. Zwei ausgelassene hintereinander beenden sie. Das Wochenziel zählt mehr als die Kette.
import type { CoachDaten } from './typen'
import { plusTage, wochenAnfang, wochentag } from './zeit'

/** Minuten, ab denen ein Tag als trainiert zählt (das Kurztraining sind drei) */
export const TRAINIERT_AB = 3
export const trainiert = (d: Pick<CoachDaten, 'tage'>, datum: string): boolean => (d.tage[datum]?.[0] ?? 0) >= TRAINIERT_AB
const istTrainingstag = (tage: number[], datum: string) => tage.includes(wochentag(datum))

export interface SerienStand {
  aktuell: number
  heute: boolean
  /** gestern war Trainingstag und ausgelassen → heute retten */
  rettbar: boolean
  woche: { geschafft: number; ziel: number }
}

export function serie(d: Pick<CoachDaten, 'tage' | 'profil'>, heute: string): SerienStand {
  const tage = d.profil.tage.length ? d.profil.tage : [1, 2, 3, 4, 5]
  const heuteTrainiert = trainiert(d, heute)
  let aktuell = heuteTrainiert ? 1 : 0
  let fehlend = 0
  for (let i = 1; i < 1000; i++) {
    const tag = plusTage(heute, -i)
    if (trainiert(d, tag)) { aktuell++; fehlend = 0; continue }
    if (!istTrainingstag(tage, tag)) continue
    if (++fehlend >= 2) break     // eine Lücke trägt, zwei nicht
  }
  // rettbar: der letzte Trainingstag vor heute wurde ausgelassen, davor läuft eine Serie, heute noch nichts
  let rettbar = false
  if (!heuteTrainiert) {
    let i = 1
    while (i < 8 && !istTrainingstag(tage, plusTage(heute, -i))) i++
    const letzterPlan = plusTage(heute, -i)
    rettbar = !trainiert(d, letzterPlan) && aktuell > 0
  } else rettbar = false
  const montag = wochenAnfang(heute)
  let geschafft = 0
  for (let i = 0; i < 7; i++) if (trainiert(d, plusTage(montag, i))) geschafft++
  return { aktuell, heute: heuteTrainiert, rettbar, woche: { geschafft, ziel: tage.length } }
}

export type Antrieb = 'neu' | 'fluss' | 'wackelt' | 'pause' | 'rueckkehr'

/** Zustand des Antriebs: ausgelassene Trainingstage seit dem letzten Training */
export function antrieb(d: Pick<CoachDaten, 'tage' | 'profil'>, heute: string): Antrieb {
  const tage = d.profil.tage.length ? d.profil.tage : [1, 2, 3, 4, 5]
  const alle = Object.keys(d.tage).filter(t => trainiert(d, t)).sort()
  if (!alle.length) return 'neu'
  const letzter = alle[alle.length - 1]
  if (letzter === heute) {
    const davor = alle[alle.length - 2]
    if (davor && verpasst(tage, davor, heute) >= 3) return 'rueckkehr'
    return 'fluss'
  }
  const n = verpasst(tage, letzter, heute)
  return n === 0 ? 'fluss' : n < 3 ? 'wackelt' : 'pause'
}

/** Trainingstage strikt zwischen zwei Daten */
function verpasst(tage: number[], von: string, bis: string): number {
  let n = 0
  for (let t = plusTage(von, 1); t < bis; t = plusTage(t, 1)) if (istTrainingstag(tage, t)) n++
  return n
}
