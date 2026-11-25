// Terra Incognita — Live-Duell (Stufe 3): zwei Kapitäne, zwei Flaggschiffe, Zug um Zug übers Netzlaufwerk.
//
// Ein Duell ist eine Folge nummerierter Dateien (terra/duelle/<id>/z<n>.json, jede exklusiv angelegt — der Dateiserver
// entscheidet, was zuerst da war). Jede Datei nennt im versiegelten Inhalt die Kennung ihres Duells (d): Eine Datei aus
// einem anderen Duell, hierher kopiert, gilt nicht.
//   z0  Einladung (A): Schiff, Einsatz, Fassung der Regeln
//   z1  Antwort (B: angenommen mit Schiff, oder abgelehnt) — oder zurückgezogen (A)
//   z2… je ein Zug: die Befehle eines Kapitäns bis zum Ende SEINES Zugs, mit Prüfsumme des Gefechts danach. Zögert
//       einer zu lange, darf der andere den Zug der Mannschaft überlassen ('ki'; beim zweiten Mal in Folge für den
//       Rest: 'auto') — aber nur, wenn der Zögernde schon einmal selbst gezogen hat. Ist er nie erschienen, endet das
//       Duell ohne Gefecht ('fern': kein Einsatz). Außerdem: Aufgabe, Abbruch (Prüfsumme passt nicht), verfallen (nach
//       zwei Tagen nicht entschieden).
// Aus derselben Folge rechnet jeder PC denselben Stand (duellLage) — dieselbe Rechnung wie jedes Gefecht.
// Wie überall in kampf/: nur Ganzzahlen, kein Zufall ohne Startwert, keine Uhr.
import { streu } from '../kern/streu'
import { aktiv, auskaempfen, befehl, duellSieger, neuerKampf, pruefeSchiffStart, pruefsumme, spielerAmZug } from './kampf'
import type { Aktion, Kampf, KampfStart, SchiffStart } from './regeln'

/** Fassung der Duell-Regeln: steigt, wenn sich am Ablauf etwas ändert (2 = Dateien an ihr Duell gebunden, ein Zug je
 *  Datei, 'fern'). Dazu kommt ein Fingerabdruck der Kampfrechnung (duellFassung). */
export const DUELL_REGEL = 2
export const DUELL_RUNDEN = 10
/** so viele Tage nach der Einladung verfällt ein Duell, das nicht entschieden ist (unentschieden, kein Einsatz) */
export const DUELL_VERFALL = 2
export const EINSAETZE: readonly number[] = [0, 100, 500, 1000, 2500]

export interface DuellEinladung { a: string; an: string; b: string; bn: string; ein: number; regel: number; tag: number; schiff: SchiffStart }
export type DuellZug =
  | { d: string; t: 'zug'; id: 0 | 10; akt: Aktion[]; pruef: number; zeit: boolean }
  | { d: string; t: 'aufgabe'; id: 0 | 10 }
  | { d: string; t: 'fern'; id: 0 | 10 }
  | { d: string; t: 'abbruch' }
  | { d: string; t: 'verfallen' }
/** eine gelesene Datei: Nummer, Schreiber (Benutzer), Inhalt (noch ungeprüft) */
export interface DuellDatei { n: number; u: string; inhalt: unknown }

export type DuellGrund = 'kampf' | 'aufgabe' | 'abbruch' | 'verfallen' | 'fern'
export type DuellLage =
  | { phase: 'leer' }
  /** die Einladung stammt aus einer anderen Fassung des Tools (naechste: erste freie Nummer) */
  | { phase: 'fassung'; e: DuellEinladung; naechste: number }
  | { phase: 'einladung'; e: DuellEinladung }
  /** fassung: abgelehnt, weil der andere eine andere Fassung des Tools hat */
  | { phase: 'abgelehnt' | 'zurueck'; e: DuellEinladung; fassung?: boolean }
  /** amZug: wer zieht; fristen: so oft in Folge hat die Mannschaft für ihn gezogen; erschienen: Er hat schon selbst gezogen */
  | { phase: 'kampf'; e: DuellEinladung; k: Kampf; naechste: number; amZug: 0 | 10; fristen: number; erschienen: boolean }
  /** die eigene Rechnung weicht von der des anderen ab (Prüfsumme): dieser PC schreibt den Abbruch (naechste: erste freie Nummer) */
  | { phase: 'gestoert'; e: DuellEinladung; k: Kampf; naechste: number }
  | { phase: 'ende'; e: DuellEinladung; k: Kampf | null; sieger: 'a' | 'b' | null; grund: DuellGrund; naechste: number }

const ganz = (x: unknown, von: number, bis: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(von, Math.min(bis, Math.floor(x))) : von)
const objekt = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : {})
const BENUTZER = /^[a-z0-9._-]{1,60}$/

/** ein Schiff fürs Duell: geprüft, auf glaubhafte Werte begrenzt, voller Rumpf, standhaft */
function duellSchiffAus(roh: unknown, id: 0 | 10): SchiffStart | null {
  const s = pruefeSchiffStart({ ...objekt(roh), id, seite: id === 0 ? 0 : 1 })
  if (!s || s.art !== 'segler') return null
  const rumpfMax = Math.min(s.rumpfMax, 90)
  return { ...s, id, seite: id === 0 ? 0 : 1, rumpf: rumpfMax, rumpfMax, crewMax: Math.min(s.crewMax, 40), kanonen: Math.min(s.kanonen, 16), bewegung: Math.min(s.bewegung, 7), enter: Math.min(s.enter, 50), arzt: Math.min(s.arzt, 33), mut: 1, staerke: 0, standhaft: true }
}

export function pruefeEinladung(roh: unknown, u: string): DuellEinladung | null {
  const d = objekt(roh)
  if (d.a !== u || typeof d.b !== 'string' || !BENUTZER.test(d.b) || d.b === u) return null
  const schiff = duellSchiffAus(d.schiff, 0)
  if (!schiff) return null
  return { a: u, an: typeof d.an === 'string' ? d.an.slice(0, 28) : u, b: d.b, bn: typeof d.bn === 'string' ? d.bn.slice(0, 28) : d.b, ein: ganz(d.ein, 0, 100000), regel: ganz(d.regel, 0, 2 ** 31), tag: ganz(d.tag, 0, 1e6), schiff }
}

/** fester Startwert aus der Kennung des Duells */
export function duellSaat(id: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0
  return streu(h, id.length, 9801)
}

/** Aufstellung: Wind, Felsen und wer beginnt kommen aus der Kennung — für beide gleich */
export function duellStart(id: string, e: DuellEinladung, b: SchiffStart): KampfStart {
  const saat = duellSaat(id)
  return {
    saat, wind: { richtung: saat % 6, staerke: (1 + ((saat >>> 4) % 3)) as 1 | 2 | 3 }, felsen: 2 + ((saat >>> 8) % 2), maxRunden: DUELL_RUNDEN,
    ersterZug: ((saat >>> 12) & 1) as 0 | 1, nahe: false, mensch: [0, 10], schiffe: [e.schiff, b],
  }
}

let fassungMerk: number | null = null
/** Die Fassung, die zwei Tools gemeinsam haben müssen: DUELL_REGEL und ein Fingerabdruck der Kampfrechnung — zwei
 *  feste Probegefechte, ganz von der Mannschaft gefochten (dauert wenige Millisekunden, einmal je Sitzung). Rechnen
 *  zwei Fassungen des Tools ein Gefecht verschieden (beide heißen „1.0.0“, sind aber zu verschiedenen Zeiten gebaut),
 *  kommt so gar kein Duell zwischen ihnen zustande — statt eines, das unterwegs auseinanderläuft. */
export function duellFassung(): number {
  if (fassungMerk !== null) return fassungMerk
  let h = 0x811c9dc5
  const mische = (x: number): void => { h = Math.imul(h ^ (x | 0), 16777619) >>> 0 }
  const probe = (id: 0 | 10, klasse: number, kanonen: number): SchiffStart | null => duellSchiffAus({ name: id ? 'Probe B' : 'Probe A', art: 'segler', klasse, rumpf: 70, rumpfMax: 70, crewMax: 32, kanonen, bewegung: 5, enter: 20, drehbassen: id === 0, navigator: id === 10, arzt: 10, mut: 1, staerke: 0 }, id)
  try {
    for (const [kennung, ka, kb] of [['probe-eins', 3, 4], ['probe-zwei', 5, 2]] as const) {
      const a = probe(0, ka, 8 + ka), b = probe(10, kb, 8 + kb)
      if (!a || !b) { mische(-1); continue }
      const e: DuellEinladung = { a: 'a', an: 'A', b: 'b', bn: 'B', ein: 0, regel: DUELL_REGEL, tag: 0, schiff: a }
      const k = neuerKampf(duellStart(kennung, e, b))
      befehl(k, { a: 'ki' })
      befehl(k, { a: 'ki' })
      auskaempfen(k)
      mische(pruefsumme(k)); mische(k.aktionen.length); mische(k.log.length); mische(k.runde)
    }
  } catch { mische(-2) }
  fassungMerk = DUELL_REGEL * 1000000 + (h % 1000000)
  return fassungMerk
}

/** Aus der Folge der Dateien den Stand des Duells rechnen (id: Kennung des Duells — daraus kommen Wind, Felsen und wer
 *  beginnt; jede Datei muss sie nennen). Gelesen wird lückenlos ab z0 (Nummer = Stelle). Weicht die eigene Rechnung
 *  von der Prüfsumme in einer Datei ab, heißt das 'gestoert': Dann schreibt dieser PC den Abbruch (unentschieden,
 *  kein Einsatz) — es sei denn, dahinter steht schon ein Abschluss. */
export function duellLage(id: string, dateien: readonly DuellDatei[], fassung: number = duellFassung()): DuellLage {
  let frei = 0
  while (frei < dateien.length && dateien[frei].n === frei) frei++
  const z0 = dateien[0]
  if (!z0 || z0.n !== 0) return { phase: 'leer' }
  const e = pruefeEinladung(z0.inhalt, z0.u)
  if (!e) return { phase: 'leer' }
  if (e.regel !== fassung) return { phase: 'fassung', e, naechste: frei }
  if (objekt(z0.inhalt).d !== id) return { phase: 'leer' }
  const z1 = dateien[1]
  if (!z1 || z1.n !== 1) return { phase: 'einladung', e }
  const a1 = objekt(z1.inhalt)
  if (z1.u === e.a) return { phase: 'zurueck', e }                          // A hat zurückgezogen (oder die Zeit lief ab)
  if (z1.u !== e.b || a1.d !== id || a1.ja !== true) return { phase: 'abgelehnt', e, ...(a1.d === id && a1.grund === 'fassung' ? { fassung: true } : {}) }
  const bSchiff = duellSchiffAus(a1.schiff, 10)
  if (!bSchiff) return { phase: 'abgelehnt', e }
  const k = neuerKampf(duellStart(id, e, bSchiff))
  /** verpasste Züge in Folge je Schiff (die Mannschaft zog für den Kapitän), und ob er schon selbst gezogen hat */
  const frist: Record<number, number> = { 0: 0, 10: 0 }
  const gezogen: Record<number, boolean> = { 0: false, 10: false }
  const besitzer = (x: number): string => (x === 0 ? e.a : e.b)
  const ende = (grund: DuellGrund, sieger: 'a' | 'b' | null = null): DuellLage => ({ phase: 'ende', e, k, sieger, grund, naechste: frei })
  /** ein Abschluss (Abbruch, Aufgabe, Verfall, nie erschienen) — gilt unabhängig vom Gefecht */
  const abschluss = (d: DuellDatei, z: Record<string, unknown>): DuellLage | null => {
    if (z.t === 'abbruch') return ende('abbruch')
    if (z.t === 'verfallen') return ende('verfallen')
    if (z.t === 'aufgabe') { const x = z.id === 10 ? 10 : 0; return besitzer(x) === d.u ? ende('aufgabe', x === 0 ? 'b' : 'a') : ende('abbruch') }
    return null
  }
  for (let i = 2; i < frei; i++) {
    const d = dateien[i], z = objekt(d.inhalt)
    if ((d.u !== e.a && d.u !== e.b) || z.d !== id) return ende('abbruch')
    const schluss = abschluss(d, z)
    if (schluss) return schluss
    const s = aktiv(k)
    if (z.t === 'fern') {
      // der Kapitän am Zug ist nie erschienen (hat noch nie selbst gezogen): kein Gefecht, kein Einsatz
      const x = z.id === 10 ? 10 : 0
      if (!s || s.id !== x || !spielerAmZug(k) || gezogen[x] || d.u === besitzer(x)) return ende('abbruch')
      return ende('fern')
    }
    // ein Zug: Er muss vom richtigen Kapitän für das Schiff am Zug kommen (oder als Fristablauf vom anderen — dann nur,
    // wenn der Säumige schon einmal selbst gezogen hat), und jeder Befehl muss gelten. Mit dem letzten Befehl endet
    // der Zug, keiner früher.
    const x = z.id === 10 ? 10 : z.id === 0 ? 0 : -1
    if (z.t !== 'zug' || !s || s.id !== x || !spielerAmZug(k) || !Array.isArray(z.akt) || z.akt.length < 1 || z.akt.length > 60) return ende('abbruch')
    const zeit = z.zeit === true
    const akt = z.akt as Aktion[]
    if (zeit ? (d.u === besitzer(x) || !gezogen[x] || akt.length !== 1 || (akt[0]?.a !== 'ki' && akt[0]?.a !== 'auto')) : d.u !== besitzer(x)) return ende('abbruch')
    let zugZuEnde = false
    for (const a of akt) {
      if (zugZuEnde) return ende('abbruch')                                   // Befehle nach dem Ende des Zugs
      const runde = k.runde, pos = k.pos
      if (!a || typeof a !== 'object' || !befehl(k, a)) return ende('abbruch')
      zugZuEnde = !!k.ende || k.runde !== runde || k.pos !== pos
    }
    if (!zugZuEnde) return ende('abbruch')
    if (typeof z.pruef === 'number' && z.pruef !== pruefsumme(k)) {
      // Die eigene Rechnung weicht ab. Steht dahinter schon ein Abschluss, gilt er (so sehen es beide); sonst schreibt
      // dieser PC den Abbruch an die erste freie Stelle.
      for (let j = i + 1; j < frei; j++) {
        const dj = dateien[j], zj = objekt(dj.inhalt)
        if ((dj.u !== e.a && dj.u !== e.b) || zj.d !== id || zj.t === 'fern') return ende('abbruch')
        const sj = abschluss(dj, zj)
        if (sj) return sj
      }
      return { phase: 'gestoert', e, k, naechste: frei }
    }
    frist[x] = zeit ? frist[x] + 1 : 0
    if (!zeit) gezogen[x] = true
    if (k.ende) break
  }
  if (k.ende) { const w = duellSieger(k); return ende('kampf', w === 0 ? 'a' : w === 1 ? 'b' : null) }
  const s = aktiv(k), amZug: 0 | 10 = s && s.id === 10 ? 10 : 0
  return { phase: 'kampf', e, k, naechste: frei, amZug, fristen: frist[amZug], erschienen: gezogen[amZug] }
}

/** die Befehle eines eigenen Zugs als Dateiinhalt (mit Prüfsumme des Gefechts danach) */
export const zugInhalt = (d: string, id: 0 | 10, akt: readonly Aktion[], k: Kampf, zeit = false): DuellZug => ({ d, t: 'zug', id, akt: akt.slice(), pruef: pruefsumme(k), zeit })
