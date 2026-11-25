// Wertung: aus einem Durchgang werden Brain-Punkte (0..1000), daraus der Stand je Gebiet.
// Reine Funktionen — getestet in .tmp-test/brain/.
import type { BrainDaten, Gebiet, Lauf } from './typen'
import { GEBIETE } from './typen'
import { klemme } from './zufall'

export const STUFE_MIN = 1
export const STUFE_MAX = 10
/** ab dieser Güte geht es eine Stufe hoch (z. B. 9 von 10 richtig und zügig) … */
export const HOCH_AB = 0.8
/** … und darunter eine herunter (z. B. nur 6 von 10 richtig) */
export const RUNTER_UNTER = 0.55

/**
 * Brain-Punkte eines Durchgangs: jede Stufe ist 100 Punkte wert, die Güte (0..1) füllt die Stufe.
 * Stufe 1 mit Güte 0,5 → 50 · Stufe 10 fehlerfrei und schnell → 1000.
 */
export function brainPunkte(stufe: number, leistung: number): number {
  const s = klemme(Math.round(stufe), STUFE_MIN, STUFE_MAX)
  return Math.round(100 * (s - 1) + 100 * klemme(leistung, 0, 1))
}

/** Nächste Stufe nach einem Durchgang (passt sich selbst an). */
export function naechsteStufe(stufe: number, leistung: number): number {
  if (leistung >= HOCH_AB) return klemme(stufe + 1, STUFE_MIN, STUFE_MAX)
  if (leistung < RUNTER_UNTER) return klemme(stufe - 1, STUFE_MIN, STUFE_MAX)
  return klemme(stufe, STUFE_MIN, STUFE_MAX)
}

/**
 * Güte aus Genauigkeit und Tempo.
 * anteil = richtig/gesamt · tempo 0..1 (1 = sehr schnell). Genauigkeit zählt 80 %, Tempo 20 % —
 * und Tempo nur, soweit richtig geantwortet wurde (schnelles Raten lohnt sich nicht).
 */
export function guete(anteil: number, tempo = 1): number {
  const a = klemme(anteil, 0, 1)
  return klemme(a * (0.8 + 0.2 * klemme(tempo, 0, 1)), 0, 1)
}

/** Tempo 0..1 aus einer Zeit: bei `gut` (oder schneller) 1, bei `langsam` (oder langsamer) 0. */
export function tempoAus(ms: number, gut: number, langsam: number): number {
  if (!(ms > 0) || langsam <= gut) return 0
  return klemme((langsam - ms) / (langsam - gut), 0, 1)
}

// ── Stand je Übung und Gebiet ─────────────────────────────────────────────────
const TAG_MS = 86400_000

/** Aktueller Stand einer Übung: gleitendes Mittel der letzten Durchgänge (jüngere zählen mehr). */
export function standUebung(laeufe: Lauf[], uebung: string, bis: number = Date.now()): number | null {
  let wert: number | null = null
  for (const l of laeufe) {
    if (l.u !== uebung) continue
    if (new Date(l.t).getTime() > bis) continue
    wert = wert === null ? l.p : wert * 0.6 + l.p * 0.4
  }
  return wert === null ? null : Math.round(wert)
}

/** Stand eines Gebiets: Mittel über die geübten Übungen des Gebiets (ungeübte zählen nicht). */
export function standGebiet(laeufe: Lauf[], gebiet: Gebiet, bis: number = Date.now()): number | null {
  const ids = new Set<string>()
  for (const l of laeufe) if (l.g === gebiet && new Date(l.t).getTime() <= bis) ids.add(l.u)
  if (!ids.size) return null
  let summe = 0
  for (const id of ids) summe += standUebung(laeufe, id, bis) ?? 0
  return Math.round(summe / ids.size)
}

export interface GebietStand { gebiet: Gebiet; jetzt: number | null; vorher: number | null; laeufe: number; zuletzt: string | null }

/** Brain-Profil: Stand je Gebiet jetzt und vor `tageZurueck` Tagen. */
export function profil(d: Pick<BrainDaten, 'laeufe'>, tageZurueck = 30, jetzt: number = Date.now()): GebietStand[] {
  return GEBIETE.map(g => {
    const eigene = d.laeufe.filter(l => l.g === g.id)
    return {
      gebiet: g.id,
      jetzt: standGebiet(d.laeufe, g.id, jetzt),
      vorher: standGebiet(d.laeufe, g.id, jetzt - tageZurueck * TAG_MS),
      laeufe: eigene.length,
      zuletzt: eigene.length ? eigene[eigene.length - 1].t : null,
    }
  })
}

/** Brain-Index: Mittel der Gebiete, in denen es schon einen Stand gibt. */
export function brainIndex(staende: GebietStand[], feld: 'jetzt' | 'vorher' = 'jetzt'): number | null {
  const w = staende.map(s => s[feld]).filter((x): x is number => x !== null)
  return w.length ? Math.round(w.reduce((a, b) => a + b, 0) / w.length) : null
}

/** Punkte in Worten (für Stufen-Anzeige) */
export function stufeAusPunkten(p: number): number { return klemme(Math.floor(p / 100) + 1, STUFE_MIN, STUFE_MAX) }
