// Aufgabenwechsel — reine Logik (ohne Oberfläche): Stufen, Durchgänge erzeugen, prüfen, werten.
// Die Stufen-Tabelle steht ausführlich im Kopf von Wechsel.tsx.
import type { Rohergebnis } from '../../kern/typen'
import type { Rng } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'
import { fuelle, jeStufe, median, mittel, mischeBis, msText, unterschiedMs, zeitenRichtig, zieheFolge } from './gemeinsam.logik'

/** Aufgabe A: gerade oder ungerade? · Aufgabe B: größer oder kleiner als 5? */
export type WechselAufgabe = 'paritaet' | 'groesse'
export type Seite = 'links' | 'rechts'
/** alle Ziffern außer der 5 (die wäre bei „größer oder kleiner als 5“ nicht entscheidbar) */
export const WECHSEL_ZIFFERN: readonly number[] = [1, 2, 3, 4, 6, 7, 8, 9]

/** Feste Zuordnung für beide Aufgaben: links = ungerade bzw. kleiner als 5 · rechts = gerade bzw. größer als 5 */
export const WECHSEL_BELEGUNG: Record<WechselAufgabe, Record<Seite, string>> = {
  paritaet: { links: 'ungerade', rechts: 'gerade' },
  groesse: { links: 'kleiner als 5', rechts: 'größer als 5' },
}
export const WECHSEL_FRAGE: Record<WechselAufgabe, string> = {
  paritaet: 'Gerade oder ungerade?',
  groesse: 'Größer oder kleiner als 5?',
}

/** Die richtige Seite für eine Ziffer in einer Aufgabe. */
export function wechselRichtig(aufgabe: WechselAufgabe, ziffer: number): Seite {
  if (aufgabe === 'paritaet') return ziffer % 2 === 0 ? 'rechts' : 'links'
  return ziffer > 5 ? 'rechts' : 'links'
}

export interface WechselStufe {
  /** 'aabb' = vorhersehbar immer zwei gleiche Aufgaben, dann Wechsel · 'zufall' = Wechsel kommen unvorhersehbar */
  folge: 'aabb' | 'zufall'
  /** Anteil der Übergänge mit Aufgabenwechsel (bei 'aabb' ergibt sich knapp die Hälfte) */
  wechselAnteil: number
  /** Antwortfrist ab Erscheinen der Ziffer */
  fristMs: number
  /** so lange steht der Aufgaben-Hinweis schon vor der Ziffer da (0 = erscheint zusammen mit ihr) */
  vorlaufMs: number
}

export const WECHSEL_STUFEN: readonly WechselStufe[] = [
  { folge: 'aabb', wechselAnteil: 0.5, fristMs: 3500, vorlaufMs: 600 },
  { folge: 'aabb', wechselAnteil: 0.5, fristMs: 3000, vorlaufMs: 600 },
  { folge: 'aabb', wechselAnteil: 0.5, fristMs: 2600, vorlaufMs: 500 },
  { folge: 'zufall', wechselAnteil: 0.30, fristMs: 2600, vorlaufMs: 400 },
  { folge: 'zufall', wechselAnteil: 0.35, fristMs: 2300, vorlaufMs: 400 },
  { folge: 'zufall', wechselAnteil: 0.42, fristMs: 2000, vorlaufMs: 300 },
  { folge: 'zufall', wechselAnteil: 0.50, fristMs: 1800, vorlaufMs: 300 },
  { folge: 'zufall', wechselAnteil: 0.50, fristMs: 1600, vorlaufMs: 150 },
  { folge: 'zufall', wechselAnteil: 0.50, fristMs: 1400, vorlaufMs: 0 },
  { folge: 'zufall', wechselAnteil: 0.50, fristMs: 1200, vorlaufMs: 0 },
]
export const wechselStufe = (stufe: number): WechselStufe => jeStufe(WECHSEL_STUFEN, stufe)
export const WECHSEL_ANZAHL = 32

export interface WechselVersuch {
  ziffer: number
  aufgabe: WechselAufgabe
  /** true = andere Aufgabe als im Durchgang davor · false = dieselbe · null = erster Durchgang */
  wechsel: boolean | null
  richtig: Seite
  /** beide Aufgaben verlangen bei dieser Ziffer dieselbe Seite (1, 3, 6, 8) */
  kongruent: boolean
  /** 0..1: Länge der Pause vor dem Durchgang */
  zittern: number
}

const andere = (a: WechselAufgabe): WechselAufgabe => (a === 'paritaet' ? 'groesse' : 'paritaet')

/** längste Strecke ohne Wechsel (in Übergängen) */
const laengsteWiederholung = (wechsel: readonly boolean[]): number => {
  let best = 0, lauf = 0
  for (const w of wechsel) { lauf = w ? 0 : lauf + 1; if (lauf > best) best = lauf }
  return best
}

/**
 * Erzeugt n Durchgänge.
 * Regeln: 'aabb' wechselt streng nach je zwei Durchgängen · 'zufall' hat exakt den verlangten Anteil an Wechseln und
 * nie mehr als sechsmal dieselbe Aufgabe hintereinander · jede Ziffer kommt gleich oft, nie zweimal hintereinander.
 */
export function wechselVersuche(r: Rng, stufe: number, n: number = WECHSEL_ANZAHL): WechselVersuch[] {
  const s = wechselStufe(stufe)
  const erste: WechselAufgabe = r.chance(0.5) ? 'paritaet' : 'groesse'
  // wechsel[i] = Übergang von Durchgang i zu i + 1
  let wechsel: boolean[]
  if (s.folge === 'aabb') wechsel = Array.from({ length: n - 1 }, (_, i) => i % 2 === 1)
  else {
    const k = Math.round((n - 1) * s.wechselAnteil)
    wechsel = mischeBis(r, [...fuelle(k, true), ...fuelle(n - 1 - k, false)], f => laengsteWiederholung(f) <= 5)
  }
  const ziffern = zieheFolge(r, WECHSEL_ZIFFERN, n, (k, bisher) => k !== bisher[bisher.length - 1])
  const liste: WechselVersuch[] = []
  let aufgabe = erste
  for (let i = 0; i < n; i++) {
    const w = i === 0 ? null : wechsel[i - 1]
    if (w) aufgabe = andere(aufgabe)
    const ziffer = ziffern[i]
    liste.push({
      ziffer, aufgabe, wechsel: w,
      richtig: wechselRichtig(aufgabe, ziffer),
      kongruent: wechselRichtig('paritaet', ziffer) === wechselRichtig('groesse', ziffer),
      zittern: r(),
    })
  }
  return liste
}

export interface WechselMessung { wechsel: boolean | null; richtig: boolean; ms: number | null }

/** Wechselkosten: mittlere Zeit der richtigen Antworten nach einem Wechsel minus nach einer Wiederholung. */
export function wechselKosten(m: readonly WechselMessung[]): number | null {
  return unterschiedMs(zeitenRichtig(m.filter(x => x.wechsel === true)), zeitenRichtig(m.filter(x => x.wechsel === false)))
}

/**
 * Wertung: Genauigkeit über alle Durchgänge (zu langsam = falsch); Tempo aus dem Median der richtigen Antworten,
 * gemessen an der Frist der Stufe.
 */
export function wechselWertung(m: readonly WechselMessung[], fristMs: number): Rohergebnis {
  const zeiten = zeitenRichtig(m)
  const richtig = m.filter(x => x.richtig).length
  const kosten = wechselKosten(m)
  const schnitt = zeiten.length ? `Ø ${Math.round(mittel(zeiten))} ms` : ''
  return {
    leistung: guete(m.length ? richtig / m.length : 0, tempoAus(median(zeiten), 0.3 * fristMs + 300, 0.85 * fristMs + 100)),
    richtig, gesamt: m.length,
    rtMs: zeiten.length ? Math.round(mittel(zeiten)) : undefined,
    text: kosten === null ? schnitt || undefined : `Wechselkosten ${msText(kosten)} · ${schnitt}`,
  }
}
