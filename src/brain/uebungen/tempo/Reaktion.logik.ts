// Reaktionszeit (Tempo) — reine Logik: Stufen, Versuchsplan, Wertung. Oberfläche: Reaktion.tsx.
import type { Rohergebnis } from '../../kern/typen'
import { rng } from '../../kern/zufall'
import { tempoAus } from '../../kern/wertung'
import { median } from '../../ablauf/kit'
import { stufeFest, tempoGuete } from './tempo.logik'

export type Richtung = 'links' | 'rechts' | 'oben' | 'unten'
/** Reihenfolge ist wichtig: Stufen mit 2 Richtungen nehmen die ersten beiden */
export const RICHTUNGEN: readonly Richtung[] = ['links', 'rechts', 'oben', 'unten']

export interface RkStufe {
  /** einfache Reaktion (ein Signal) oder Wahlreaktion (Pfeil → passende Taste) */
  art: 'einfach' | 'wahl'
  /** Wahlreaktion: 2 (links/rechts) oder 4 Richtungen; einfach: 0 */
  richtungen: number
  /** so viele Versuche sind „Stopp – nicht reagieren“ */
  stopps: number
  /** gewertete Versuche (einschließlich Stopp-Versuche) */
  versuche: number
  /** Wartezeit vor dem Signal in ms (zufällig dazwischen) */
  warteVon: number
  warteBis: number
  /** Median der Reaktionszeit: ab hier volles Tempo … */
  gutMs: number
  /** … und ab hier keines mehr */
  langsamMs: number
  /** ohne Reaktion nach dieser Zeit gilt der Versuch als verpasst */
  maxMs: number
}

const einfach = (versuche: number, warteVon: number, warteBis: number, gutMs: number, langsamMs: number): RkStufe =>
  ({ art: 'einfach', richtungen: 0, stopps: 0, versuche, warteVon, warteBis, gutMs, langsamMs, maxMs: 1500 })
const wahl = (richtungen: number, stopps: number, versuche: number, warteVon: number, gutMs: number, langsamMs: number): RkStufe =>
  ({ art: 'wahl', richtungen, stopps, versuche, warteVon, warteBis: 2200, gutMs, langsamMs, maxMs: 1800 })

const TAFEL: RkStufe[] = [
  einfach(6, 1500, 3000, 280, 700),
  einfach(7, 1200, 3500, 250, 620),
  einfach(8, 1200, 4000, 220, 540),
  wahl(2, 0, 8, 900, 400, 900),
  wahl(2, 0, 10, 900, 350, 800),
  wahl(4, 0, 10, 900, 430, 950),
  wahl(4, 0, 10, 900, 380, 850),
  wahl(4, 2, 10, 900, 450, 950),
  wahl(4, 2, 10, 900, 410, 880),
  wahl(4, 2, 10, 700, 380, 820),
]
export const reaktionStufe = (stufe: number): RkStufe => TAFEL[stufeFest(stufe) - 1]

/** Reaktionen unter 100 ms nach dem Signal sind geraten, nicht reagiert → Frühstart */
export const RK_FRUEH_MS = 100
/** so lange muss man bei „Stopp“ stillhalten */
export const RK_STOPP_MS = 1200

export interface RkVersuch { art: 'einfach' | 'pfeil' | 'stopp'; richtung?: Richtung }

/** Der Plan eines Durchgangs: welcher Reiz in welchem Versuch kommt. Gleicher Startwert = gleicher Plan. */
export function reaktionPlan(start: number, stufe: number): RkVersuch[] {
  const st = reaktionStufe(stufe)
  if (st.art === 'einfach') return Array.from({ length: st.versuche }, (): RkVersuch => ({ art: 'einfach' }))
  const r = rng(start).zweig('plan')

  // Stopp-Versuche: nie der erste, nie zwei hintereinander
  let stopps: number[] = []
  if (st.stopps > 0) {
    const stellen = Array.from({ length: st.versuche - 1 }, (_, i) => i + 1)
    for (let v = 0; v < 200; v++) {
      stopps = r.ausN(stellen, st.stopps).sort((a, b) => a - b)
      if (stopps.every((s, i) => i === 0 || s - stopps[i - 1] > 1)) break
    }
  }

  // Richtungen: aus einem Topf, in dem jede Richtung gleich oft liegt — aber etwas mehr Lose als Versuche.
  // So kommt keine Richtung gehäuft, und trotzdem lässt sich die letzte nicht durch Mitzählen vorhersagen.
  // Nie dreimal dieselbe hintereinander.
  const los = st.versuche - stopps.length
  const erlaubt = RICHTUNGEN.slice(0, st.richtungen)
  const jeRichtung = Math.ceil(los / erlaubt.length) + 1
  const topf = erlaubt.flatMap(x => Array.from({ length: jeRichtung }, () => x))
  let folge = r.misch(topf).slice(0, los)
  for (let v = 0; v < 200 && folge.some((x, i) => i >= 2 && x === folge[i - 1] && x === folge[i - 2]); v++) folge = r.misch(topf).slice(0, los)

  const plan: RkVersuch[] = []
  let k = 0
  for (let i = 0; i < st.versuche; i++) plan.push(stopps.includes(i) ? { art: 'stopp' } : { art: 'pfeil', richtung: folge[k++] })
  return plan
}

/** Wartezeit vor dem Signal. `anlauf` zählt die Wiederholungen nach einem Frühstart (jede bekommt eine neue Zeit). */
export function reaktionWarte(start: number, stufe: number, nr: number, anlauf = 0): number {
  const st = reaktionStufe(stufe)
  return rng(start).zweig(`warte${nr}.${anlauf}`).int(st.warteVon, st.warteBis)
}

/** Ist die Eingabe die richtige Antwort auf diesen Reiz? (`frei` = Leertaste oder Klick ins Feld) */
export function reaktionRichtig(v: RkVersuch, eingabe: 'frei' | Richtung): boolean {
  if (v.art === 'stopp') return false
  if (v.art === 'einfach') return eingabe === 'frei'
  return eingabe === v.richtung
}

export interface RkStand {
  /** Reaktionszeiten der richtigen Antworten (ms) */
  zeiten: number[]
  /** richtige Antworten + richtig ausgelassene Stopp-Versuche */
  richtig: number
  /** abgeschlossene Versuche (ohne Frühstarts) */
  gewertet: number
  fruehstarts: number
}

/**
 * Wertung: Median der richtigen Reaktionen gegen die Richtzeiten der Stufe, verrechnet mit der Genauigkeit.
 * Jeder Frühstart zählt als zusätzlicher, falscher Versuch.
 */
export function reaktionWertung(stufe: number, s: RkStand): Rohergebnis {
  const st = reaktionStufe(stufe)
  const gesamt = st.versuche + s.fruehstarts
  const med = median(s.zeiten)
  const tempo = s.zeiten.length ? tempoAus(med, st.gutMs, st.langsamMs) : 0
  const teile = [s.zeiten.length ? `Ø ${Math.round(med)} ms` : 'keine gültige Reaktion']
  if (s.fruehstarts) teile.push(`${s.fruehstarts} ${s.fruehstarts === 1 ? 'Frühstart' : 'Frühstarts'}`)
  return {
    leistung: tempoGuete(s.richtig / gesamt, tempo),
    richtig: s.richtig,
    gesamt,
    rtMs: s.zeiten.length ? Math.round(med) : undefined,
    text: teile.join(' · '),
  }
}
