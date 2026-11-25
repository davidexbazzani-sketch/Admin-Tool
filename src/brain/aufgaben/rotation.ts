// Mentale Rotation: Welche Figur ist dieselbe wie die Vorlage — nur gedreht?
// Die falschen Antworten sind Spiegelbilder (lassen sich durch Drehen NICHT zur Deckung bringen)
// und ab Stufe 3 auch leicht veränderte Figuren.
//
// Stufe 1: 4 Kästchen, Vierteldrehungen · 2–3: 5 Kästchen · 4: 6 Kästchen · 5–6: Drehungen in
// 45°-Schritten, 6–7 Kästchen · 7–8: beliebige 30°-Schritte, 7–8 Kästchen, 6 Antworten ·
// 9–10: 15°-Schritte, 8–9 Kästchen, auch die Vorlage liegt schräg.
import type { FragenGenerator, Szene } from '../kern/typen'
import { S } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { mischeAuswahl } from './hilfen'
import { alsSzene, drehKennung, festeFigur, spiegle, verfremde, zufallsFigur, type Zellen } from './polyomino'

interface Plan { zellen: number; schritt: number; optionen: number; fremd: number; vorlageSchraeg?: boolean; kante: number }
const PLAN: Plan[] = [
  { zellen: 4, schritt: 90, optionen: 4, fremd: 0, kante: 4 },
  { zellen: 5, schritt: 90, optionen: 4, fremd: 0, kante: 4 },
  { zellen: 5, schritt: 90, optionen: 4, fremd: 1, kante: 4 },
  { zellen: 6, schritt: 90, optionen: 4, fremd: 1, kante: 4 },
  { zellen: 6, schritt: 45, optionen: 4, fremd: 1, kante: 4 },
  { zellen: 7, schritt: 45, optionen: 5, fremd: 2, kante: 4 },
  { zellen: 7, schritt: 30, optionen: 5, fremd: 2, kante: 4 },
  { zellen: 8, schritt: 30, optionen: 6, fremd: 2, kante: 4 },
  { zellen: 8, schritt: 15, optionen: 6, fremd: 3, vorlageSchraeg: true, kante: 5 },
  { zellen: 9, schritt: 15, optionen: 6, fremd: 3, vorlageSchraeg: true, kante: 5 },
]

interface Wahl { figur: Zellen; winkel: number; art: 'gleich' | 'spiegel' | 'fremd' }
const kennung = (w: Wahl) => `${drehKennung(w.figur)}|${((w.winkel % 360) + 360) % 360}`

export function baueRotation(r: Rng, stufe: number): { vorlage: Zellen; vorlageWinkel: number; richtig: Wahl; falsche: Wahl[]; plan: Plan } {
  const plan = PLAN[klemme(Math.round(stufe), 1, 10) - 1]
  const vorlage = plan.zellen <= 5 ? festeFigur(r, plan.zellen) : zufallsFigur(r, plan.zellen, plan.kante)
  const winkelPool = Array.from({ length: 360 / plan.schritt }, (_, i) => i * plan.schritt)
  const vorlageWinkel = plan.vorlageSchraeg ? r.aus(winkelPool) : 0
  // die richtige Antwort ist nie deckungsgleich mit der Vorlage (mindestens ein Schritt weiter)
  const richtig: Wahl = { figur: vorlage, winkel: r.aus(winkelPool.filter(w => w !== vorlageWinkel)), art: 'gleich' }
  const falsche: Wahl[] = []
  const spiegel = spiegle(vorlage)
  // veränderte Figuren (gedreht und manchmal gespiegelt)
  for (let i = 0; i < plan.fremd; i++) {
    const f = verfremde(r, vorlage, plan.kante)
    if (f) falsche.push({ figur: r.chance(0.5) ? f : spiegle(f), winkel: r.aus(winkelPool), art: 'fremd' })
  }
  // Spiegelbilder in verschiedenen Lagen füllen auf
  for (const w of r.misch(winkelPool)) falsche.push({ figur: spiegel, winkel: w, art: 'spiegel' })
  return { vorlage, vorlageWinkel, richtig, falsche, plan }
}

export const erzeuge: FragenGenerator = (r, stufeRoh) => {
  const stufe = klemme(Math.round(stufeRoh), 1, 10)
  const a = baueRotation(r, stufe)
  // EINE Kästchengröße für Vorlage und alle Antworten (sonst verrät oder verwirrt der Maßstab):
  // bei schrägen Lagen muss die Diagonale ins Bild passen
  const kante = (a.plan.schritt < 90 ? 56 : 72) / a.plan.kante
  const bild = (w: Wahl): Szene => alsSzene(w.figur, { winkel: w.winkel, ton: 1, kante })
  // erst die veränderten, dann Spiegelbilder — mischeAuswahl nimmt die ersten passenden
  const { optionen, richtig } = mischeAuswahl(r, a.richtig, a.falsche, w => S(bild(w)), kennung, a.plan.optionen)
  const grad = (((a.richtig.winkel - a.vorlageWinkel) % 360) + 360) % 360
  return {
    aufgabe: 'Welche Figur ist dieselbe wie die Vorlage — nur gedreht?',
    zeige: S(alsSzene(a.vorlage, { winkel: a.vorlageWinkel, ton: 2, kante })),
    optionen, richtig, spalten: a.plan.optionen,
    erklaerung: `Die richtige Figur ist die Vorlage, um ${grad}° im Uhrzeigersinn gedreht. Die anderen sind Spiegelbilder${a.plan.fremd ? ' oder an einem Kästchen verändert' : ''} — sie lassen sich durch Drehen nicht zur Deckung bringen.`,
    zeitSek: 30 + stufe * 6,
  }
}
