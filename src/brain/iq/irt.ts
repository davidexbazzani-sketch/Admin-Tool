// IQ-Schätzung nach der Item-Response-Theorie (3-Parameter-Modell), reine Funktionen.
//
// Jede Aufgabe hat eine Schwierigkeit b (aus ihrer Stufe) und eine Ratewahrscheinlichkeit c
// (1 / Zahl der Auswahlen). Die Wahrscheinlichkeit einer richtigen Antwort bei Fähigkeit θ:
//     P = c + (1 − c) / (1 + e^(−A·(θ − b)))
// Geschätzt wird θ als Erwartungswert der Nachverteilung (EAP) mit der Normalverteilung als
// Vorwissen (Mittel 0, Streuung 1 — so ist „IQ“ definiert). IQ = 100 + 15 · θ.
//
// EHRLICHE GRENZE: b stammt aus den Bauregeln der Aufgaben (Stufe 1–10), NICHT aus einer Eichung
// an vielen Menschen. Das Verfahren ist das anerkannte; die Zahlenwerte sind eine Orientierung.
import type { IqGebiet } from '../kern/typen'

/** Trennschärfe (Steigung der Kurve). 1,5 entspricht ordentlich trennenden Aufgaben. */
export const A = 1.5
/** eine Stufe = 0,6 θ-Einheiten = 9 IQ-Punkte; Stufe 5,5 liegt beim Durchschnitt (θ = 0) */
export const THETA_JE_STUFE = 0.6
export const bVonStufe = (stufe: number): number => (stufe - 5.5) * THETA_JE_STUFE
export const stufeVonTheta = (theta: number): number => Math.max(1, Math.min(10, Math.round(theta / THETA_JE_STUFE + 5.5)))

export interface Antwort { b: number; c: number; richtig: boolean; gebiet: IqGebiet }

export function wahrscheinlich(theta: number, b: number, c: number): number {
  return c + (1 - c) / (1 + Math.exp(-A * (theta - b)))
}

const GITTER: number[] = Array.from({ length: 161 }, (_, i) => -4 + i * 0.05)
const normalDichte = (x: number, m: number, s: number): number => Math.exp(-0.5 * ((x - m) / s) ** 2)

/** Fähigkeit schätzen (EAP) mit Messfehler. Ohne Antworten: θ = Vorwissen-Mittel, se = Vorwissen-Streuung. */
export function schaetze(antworten: Antwort[], vorMittel = 0, vorStreuung = 1): { theta: number; se: number } {
  let summe = 0, summeT = 0, summeTT = 0
  for (const t of GITTER) {
    let l = normalDichte(t, vorMittel, vorStreuung)
    for (const a of antworten) { const p = wahrscheinlich(t, a.b, a.c); l *= a.richtig ? p : 1 - p }
    summe += l; summeT += l * t; summeTT += l * t * t
  }
  if (!(summe > 0)) return { theta: vorMittel, se: vorStreuung }
  const theta = summeT / summe
  return { theta, se: Math.sqrt(Math.max(1e-6, summeTT / summe - theta * theta)) }
}

export const iqVon = (theta: number): number => 100 + 15 * theta
/** Verteilungsfunktion der Normalverteilung (Abramowitz/Stegun, auf 7 Stellen genau) */
export function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp(-z * z / 2)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}
/** Prozentrang: so viel Prozent der Bevölkerung liegen darunter */
export const prozentrang = (iq: number): number => Math.round(phi((iq - 100) / 15) * 100)

export const IQ_MIN = 70
export const IQ_MAX = 145
/** z für den 90-%-Bereich */
export const Z90 = 1.645

export interface IqWert { iq: number; von: number; bis: number; prozentrang: number; theta: number; se: number }
export function iqWert(antworten: Antwort[]): IqWert {
  const { theta, se } = schaetze(antworten)
  const runde = (x: number) => Math.round(x)
  return { iq: runde(iqVon(theta)), von: runde(iqVon(theta - Z90 * se)), bis: runde(iqVon(theta + Z90 * se)), prozentrang: prozentrang(iqVon(theta)), theta, se }
}

/** Anzeige begrenzen: außerhalb von 70–145 kann der Test nicht mehr unterscheiden */
export function iqText(iq: number): string {
  return iq < IQ_MIN ? `unter ${IQ_MIN}` : iq > IQ_MAX ? `über ${IQ_MAX}` : String(iq)
}

/** Bereich in Worten: „104–120“, an den Rändern „unter 70 bis 92“ bzw. „128 bis über 145“; liegt er ganz außerhalb, nur „unter 70“ / „über 145“ */
export function bereichText(von: number, bis: number): string {
  if (bis < IQ_MIN) return iqText(bis)
  if (von > IQ_MAX) return iqText(von)
  return von < IQ_MIN || bis > IQ_MAX ? `${iqText(von)} bis ${iqText(bis)}` : `${von}–${bis}`
}

/** Prozentrang für Tabellen: an den Rändern „< 3“ bzw. „> 99“ (genauer kann der Test dort nicht unterscheiden) */
export function rangText(iq: number, rang: number): string {
  return iq < IQ_MIN ? '< 3' : iq > IQ_MAX || rang > 99 ? '> 99' : String(Math.max(1, rang))
}
/** Prozentrang als Satz: „etwa 84 von 100 Menschen liegen darunter“ */
export function rangSatz(iq: number, rang: number): string {
  if (iq < IQ_MIN) return 'weniger als 3 von 100 Menschen liegen darunter'
  if (iq > IQ_MAX || rang > 99) return 'mehr als 99 von 100 Menschen liegen darunter'
  return `etwa ${Math.max(1, rang)} von 100 Menschen liegen darunter`
}

export interface GebietProfil { gebiet: IqGebiet; richtig: number; gesamt: number; tendenz: number }
/**
 * Profil: je Gebiet richtig/gesamt und die „Tendenz“ = wie viel besser/schlechter als nach dem
 * eigenen Gesamtniveau zu erwarten (standardisiert, auf −1..+1 begrenzt). Bei wenigen Aufgaben
 * je Gebiet ist das nur ein Hinweis.
 */
export function profil(antworten: Antwort[], theta: number): GebietProfil[] {
  const gebiete = Array.from(new Set(antworten.map(a => a.gebiet)))
  return gebiete.map(g => {
    const eigene = antworten.filter(a => a.gebiet === g)
    let erwartet = 0, varianz = 0
    for (const a of eigene) { const p = wahrscheinlich(theta, a.b, a.c); erwartet += p; varianz += p * (1 - p) }
    const richtig = eigene.filter(a => a.richtig).length
    const z = varianz > 0 ? (richtig - erwartet) / Math.sqrt(varianz) : 0
    return { gebiet: g, richtig, gesamt: eigene.length, tendenz: Math.max(-1, Math.min(1, z / 2)) }
  })
}

/** Einstufung in Worten (übliche Bänder der IQ-Skala) */
export function einstufung(iq: number): string {
  return iq >= 130 ? 'weit überdurchschnittlich' : iq >= 115 ? 'überdurchschnittlich' : iq >= 108 ? 'oberer Durchschnitt'
    : iq >= 93 ? 'Durchschnitt' : iq >= 85 ? 'unterer Durchschnitt' : 'unterdurchschnittlich'
}
