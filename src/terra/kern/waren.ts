// Terra Incognita — Waren und Hafenmärkte. Was ein Hafen anbietet und verlangt, ergibt sich aus seinem Gebiet
// und seinem festen Zufallswert; Preise schwanken täglich leicht und geben unter Druck nach.
import { streu, streu3 } from './streu'
import type { Ort } from './welt'

export interface Ware {
  id: string
  name: string
  preis: number
  /** Gebiete, in denen die Ware erzeugt wird (dort billig zu kaufen) */
  herkunft: readonly number[]
  /** Gebiete, in denen sie begehrt ist (dort teuer zu verkaufen) */
  nachfrage: readonly number[]
}

export const WAREN: readonly Ware[] = [
  { id: 'salz', name: 'Salz', preis: 8, herkunft: [0, 5], nachfrage: [1, 2, 3, 8] },
  { id: 'hering', name: 'Hering', preis: 10, herkunft: [1, 0, 2], nachfrage: [5, 6, 4, 3] },
  { id: 'holz', name: 'Holz', preis: 12, herkunft: [3, 1, 8], nachfrage: [0, 5, 6, 2] },
  { id: 'tuch', name: 'Tuch', preis: 22, herkunft: [0, 4], nachfrage: [6, 2, 7, 8, 1, 9] },
  { id: 'eisen', name: 'Eisen', preis: 26, herkunft: [4, 3], nachfrage: [0, 5, 6, 1, 8] },
  { id: 'rum', name: 'Rum', preis: 34, herkunft: [6, 5, 8], nachfrage: [0, 1, 2, 4, 3] },
  { id: 'pelze', name: 'Pelze', preis: 48, herkunft: [2, 1], nachfrage: [5, 0, 4, 6] },
  { id: 'tee', name: 'Tee', preis: 56, herkunft: [7, 9], nachfrage: [0, 4, 3, 5, 1] },
  { id: 'kaffee', name: 'Kaffee', preis: 60, herkunft: [6, 7], nachfrage: [0, 3, 1, 4, 5] },
  { id: 'bernstein', name: 'Bernstein', preis: 78, herkunft: [4], nachfrage: [5, 6, 0, 7] },
  { id: 'gewuerze', name: 'Gewürze', preis: 96, herkunft: [6, 7, 9], nachfrage: [0, 2, 4, 5, 1, 3] },
  { id: 'porzellan', name: 'Porzellan', preis: 130, herkunft: [9, 7], nachfrage: [0, 4, 5, 3] },
]
export const wareNr = (id: string): number => WAREN.findIndex(w => w.id === id)

export interface Markt {
  /** Waren (Nummern), die der Hafen verkauft */
  angebot: number[]
  /** Waren, die er zu gutem Preis kauft */
  nachfrage: number[]
}

const S_MARKT = 8101, S_PREIS = 8102, S_TAG = 8103
const istHamburg = (o: Ort): boolean => o.q === 0 && o.r === 0

/** die n Einträge mit dem höchsten Streuwert — feste, vom Ort abhängige Auswahl */
function waehleN(kandidaten: number[], n: number, saat: number, salz: number): number[] {
  return kandidaten.map(k => ({ k, w: streu(saat, k, salz) })).sort((a, b) => b.w - a.w || a.k - b.k).slice(0, n).map(x => x.k).sort((a, b) => a - b)
}

export function marktVon(ort: Ort): Markt {
  if (istHamburg(ort)) {
    const angebot = [wareNr('salz'), wareNr('hering'), wareNr('tuch')]
    return { angebot, nachfrage: WAREN.map((_, i) => i).filter(i => !angebot.includes(i)) }
  }
  const herkunft = WAREN.map((w, i) => (w.herkunft.includes(ort.gebiet) ? i : -1)).filter(i => i >= 0)
  const angebot = waehleN(herkunft, ort.art === 'hafen' ? 3 : 1, ort.saat, S_MARKT)
  const begehrt = WAREN.map((w, i) => (w.nachfrage.includes(ort.gebiet) && !angebot.includes(i) ? i : -1)).filter(i => i >= 0)
  return { angebot, nachfrage: waehleN(begehrt, ort.art === 'hafen' ? 4 : 2, ort.saat, S_MARKT + 1) }
}

/** was der Spieler in einem Hafen zuletzt bewegt hat — drückt die Preise und erholt sich mit der Zeit auf See */
export interface Druck { v: number; k: number; std: number }
export type DruckBuch = Record<string, Record<string, Druck>>

const ERHOLUNG_STUNDEN = 6

/** Druck auf den heutigen Stand bringen (je 6 Stunden auf See erholt sich eine Einheit) */
export function druckJetzt(d: Druck | undefined, stunden: number): Druck {
  if (!d) return { v: 0, k: 0, std: stunden }
  const weg = Math.max(0, Math.floor((stunden - d.std) / ERHOLUNG_STUNDEN))
  if (!weg) return d
  return { v: Math.max(0, d.v - weg), k: Math.max(0, d.k - weg), std: d.std + weg * ERHOLUNG_STUNDEN }
}

export interface Preise {
  /** Preis, zu dem der Spieler kaufen kann (null = wird hier nicht angeboten) */
  kauf: number | null
  /** Preis, den der Hafen dem Spieler zahlt */
  verkauf: number
  /** 'angebot' | 'nachfrage' | '' */
  rolle: 'angebot' | 'nachfrage' | ''
}

/**
 * Preise einer Ware in einem Hafen.
 * @param tag Tagesnummer (Preise schwanken täglich um bis zu ±8 %)
 * @param handel Handelsvorteil in Tausendsteln (Dolmetscherin)
 */
export function preise(ort: Ort, ware: number, tag: number, druck: Druck | undefined, stunden: number, handel = 0): Preise {
  const w = WAREN[ware], m = marktVon(ort), d = druckJetzt(druck, stunden)
  const fest = streu(ort.saat, ware, S_PREIS)
  const heute = 92 + (streu3(ort.saat, ware, tag, S_TAG) % 17)                 // 92 … 108 %
  const dorf = ort.art !== 'hafen'
  if (m.angebot.includes(ware)) {
    const grund = (72 + (fest % 14)) * (dorf ? 115 : 100)                        // Dörfer sind teurer
    const teurer = 1000 + Math.min(500, 10 * d.k)                               // je gekaufter Einheit 1 % teurer
    const kauf = Math.max(1, Math.ceil((w.preis * grund * heute * teurer * (1000 - handel)) / 1e12))
    // zurückverkaufen im selben Hafen lohnt nie: höchstens 60 % des Kaufpreises
    return { kauf, verkauf: Math.max(1, Math.floor((kauf * 60) / 100)), rolle: 'angebot' }
  }
  const billiger = Math.max(450, 1000 - 15 * d.v)                               // je verkaufter Einheit 1,5 % weniger
  if (m.nachfrage.includes(ware)) {
    // Hamburg kauft alles, zahlt aber etwas weniger als ein Hafen, der genau diese Ware sucht
    const grund = istHamburg(ort) ? (124 + (fest % 22)) * 100 : (140 + (fest % 50)) * (dorf ? 88 : 100)
    return { kauf: null, verkauf: Math.max(1, Math.floor((w.preis * grund * heute * billiger * (1000 + handel)) / 1e12)), rolle: 'nachfrage' }
  }
  return { kauf: null, verkauf: Math.max(1, Math.floor((w.preis * 55 * heute * billiger * (1000 + handel)) / 1e10)), rolle: '' }
}

/** Proviant: Gold je Tag Vorrat */
export function proviantPreis(ort: Ort): number {
  if (istHamburg(ort)) return 3
  return (ort.art === 'hafen' ? 3 : 5) + ort.stufe
}

/** Lohn der Kartographen-Gilde je neu vermessenem Feld (vor dem Zuschlag durch den Kartographen) */
export const feldLohn = (stufe: number): number => 1 + Math.floor(stufe / 3)

/** Ruhm für eine Entdeckung: [Grundwert, je Stufe] */
const RUHM: Record<string, readonly [number, number]> = {
  hafen: [40, 8], dorf: [14, 3], quelle: [8, 2], ruine: [24, 6], wunder: [60, 15], einsiedler: [16, 4],
  wrack: [14, 4], fischgrund: [6, 1], strudel: [12, 3], treibgut: [4, 1],
}
export function ruhmFuer(art: string, stufe: number): number {
  const r = RUHM[art]
  return r ? r[0] + r[1] * stufe : 0
}
/** Ruhm für eine neue Insel: wächst mit ihrer Größe */
export const ruhmInsel = (felder: number, stufe: number): number => 10 + Math.min(30, 2 * felder) + 2 * stufe
/** Gold, das die Gilde für eine gemeldete Entdeckung zahlt */
export const goldFuerRuhm = (ruhm: number): number => ruhm * 2
