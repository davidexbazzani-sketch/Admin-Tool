// IQ-Test: Ablaufplan (welches Gebiet wann), adaptive Wahl der nächsten Stufe, Auswertung.
// Reine Funktionen — die Oberfläche steht in IqBereich.tsx, das Laden der Aufgaben in aufgaben.ts.
import type { IqEintrag, IqGebiet } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { iqWert, profil, schaetze, stufeVonTheta, type Antwort, type GebietProfil, type IqWert } from './irt'

export type TestLaenge = 10 | 20 | 30

export interface IqGebietInfo { id: IqGebiet; name: string; kurz: string; uebungen: string[] }
/** Die sieben Gebiete des Tests und die Übungen, die dazu passen (für „Hier liegt Potenzial“). */
export const IQ_GEBIETE: IqGebietInfo[] = [
  { id: 'figural', name: 'Figuren-Logik', kurz: 'Regeln in Mustern erkennen', uebungen: ['matrizen', 'figurenfolgen', 'passtnicht'] },
  { id: 'numerisch', name: 'Zahlen-Logik', kurz: 'Gesetzmäßigkeiten in Zahlenreihen', uebungen: ['zahlenreihen', 'rechenkette'] },
  { id: 'verbal', name: 'Sprach-Logik', kurz: 'Beziehungen zwischen Wörtern', uebungen: ['analogien', 'oberbegriff', 'synonyme'] },
  { id: 'raeumlich', name: 'Raumvorstellung', kurz: 'Drehen, falten, zusammensetzen', uebungen: ['rotation', 'wuerfel', 'falten', 'spiegel'] },
  { id: 'schluss', name: 'Schlussfolgern', kurz: 'Was folgt zwingend?', uebungen: ['schluss'] },
  { id: 'rechnen', name: 'Rechnerisches Denken', kurz: 'Textaufgaben durchdringen', uebungen: ['textaufgaben', 'schaetzen', 'kopfrechnen'] },
  { id: 'merken', name: 'Merkfähigkeit', kurz: 'Kurz behalten und abrufen', uebungen: ['merkfolge', 'zahlenspanne', 'nback', 'muster'] },
]
export const iqGebietName = (g: IqGebiet): string => IQ_GEBIETE.find(x => x.id === g)?.name ?? g

/** Richtwert für die Dauer (Minuten) */
export const DAUER_MIN: Record<TestLaenge, number> = { 10: 8, 20: 15, 30: 25 }

/**
 * Ablaufplan: jedes Gebiet gleich oft (Rest zufällig verteilt), gemischt — aber nie dasselbe
 * Gebiet zweimal direkt hintereinander.
 */
export function ablaufplan(r: Rng, n: TestLaenge): IqGebiet[] {
  const ids = IQ_GEBIETE.map(g => g.id)
  const voll = Math.floor(n / ids.length), rest = n - voll * ids.length
  // in Runden bauen: zuerst die „Zusatz“-Gebiete (Teilrunde), dann volle Runden mit je allen Gebieten.
  // Beginnt eine Runde mit dem Gebiet, mit dem die vorige endete, werden ihre ersten beiden getauscht.
  const plan: IqGebiet[] = r.ausN(ids, rest)
  for (let runde = 0; runde < voll; runde++) {
    const k = r.misch(ids)
    if (plan.length && k[0] === plan[plan.length - 1]) [k[0], k[1]] = [k[1], k[0]]
    plan.push(...k)
  }
  return plan
}

/**
 * Nächste Stufe: dort, wo die Aufgabe am meisten über die Person verrät — bei ihrer bisher
 * geschätzten Fähigkeit. Die ersten Aufgaben beginnen in der Mitte (Stufe 5/6).
 */
export function naechsteStufe(antworten: Antwort[]): number {
  if (!antworten.length) return 5
  return stufeVonTheta(schaetze(antworten).theta)
}

export interface IqAuswertung extends IqWert { profil: GebietProfil[]; richtig: number; gesamt: number }

export function werteAus(antworten: Antwort[]): IqAuswertung {
  const w = iqWert(antworten)
  return { ...w, profil: profil(antworten, w.theta), richtig: antworten.filter(a => a.richtig).length, gesamt: antworten.length }
}

/** Was gespeichert bzw. geteilt wird (keine einzelnen Antworten) */
export function alsEintrag(a: IqAuswertung, fragen: TestLaenge, dauerSek: number, wann: Date = new Date()): IqEintrag {
  return {
    t: wann.toISOString(), fragen, iq: a.iq, von: a.von, bis: a.bis, prozentrang: a.prozentrang,
    profil: a.profil.map(p => ({ gebiet: p.gebiet, richtig: p.richtig, gesamt: p.gesamt, tendenz: Math.round(p.tendenz * 100) / 100 })),
    dauerSek: Math.round(dauerSek),
  }
}

/** Gebiete mit dem größten Potenzial: klar unter dem eigenen Niveau, sonst die zwei schwächsten. */
export function potenzial(p: GebietProfil[]): GebietProfil[] {
  const sortiert = p.slice().sort((a, b) => a.tendenz - b.tendenz || a.richtig / Math.max(1, a.gesamt) - b.richtig / Math.max(1, b.gesamt))
  const deutlich = sortiert.filter(x => x.tendenz <= -0.2)
  return (deutlich.length ? deutlich : sortiert).slice(0, 2)
}
