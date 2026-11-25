// Terra Incognita — Seegefecht: die Regeln.
//
// Ein kleines Sechseck-Feld (Radius 5). Der Wind bestimmt, wie weit ein Segler kommt; gefeuert wird mit der
// Breitseite (Backbord oder Steuerbord). Drei Munitionsarten, Entern, Drehbassen, Flucht über den Rand des Feldes.
// Ungeheuer haben eigene Muster (Krake hält fest, Seeschlange taucht ab, Geisterschiff segelt gegen den Wind).
//
// Alles hier ist reine Rechnung mit Ganzzahlen und festem Startwert (wie im Spielkern): Dieselbe Aufstellung und
// dieselben Befehle ergeben auf jedem PC denselben Verlauf — deshalb lässt sich jeder Kampf als Wiederholung ansehen.
import { abstand, drehung, RICHTUNGEN } from '../kern/hex'
import { streu3 } from '../kern/streu'
import type { Wind } from '../kern/wind'

export const RADIUS = 5
const S_KAMPF = 9301

export type SchiffArt = 'segler' | 'geist' | 'krake' | 'schlange' | 'fort'
export type Munition = 0 | 1 | 2
export const MUNITION: readonly { name: string; weite: number; text: string }[] = [
  { name: 'Kugeln', weite: 4, text: 'Vollkugeln schlagen Löcher in den Rumpf.' },
  { name: 'Kettenkugeln', weite: 2, text: 'Zerfetzen Segel und Takelage – der Gegner wird langsam.' },
  { name: 'Kartätschen', weite: 2, text: 'Ein Hagel aus Blei gegen die Mannschaft. Gut vor dem Entern.' },
]
/** Trefferaussicht je Kanone in Prozent nach Entfernung (1 … 4 Felder) */
export const TREFFER: readonly number[] = [0, 85, 70, 50, 30]

export type Zustand = 'kampf' | 'geflohen' | 'gestrichen' | 'gesunken' | 'geentert'
export type Ausgang = 'sieg' | 'niederlage' | 'flucht' | 'remis'

/** wie ein Schiff (oder Ungeheuer) in den Kampf geht */
export interface SchiffStart {
  /** 0 = Flaggschiff des Spielers, 1 … 2 = Begleitschiffe, ab 10 = Gegner */
  id: number
  seite: 0 | 1
  name: string
  art: SchiffArt
  /** Schiffsklasse (Zeichnung) */
  klasse: number
  rumpf: number
  rumpfMax: number
  crewMax: number
  /** Kanonen je Breitseite */
  kanonen: number
  /** Bewegungspunkte bei frischer Brise */
  bewegung: number
  /** Enterstärke in Prozent obendrauf (Enterhaken) */
  enter: number
  drehbassen: boolean
  navigator: boolean
  /** weniger Verluste an Mannschaft in Prozent (Schiffsärztin) */
  arzt: number
  /** Kampfgeist der Steuerung: 0 vorsichtig, 1 normal, 2 verwegen (entert gern) */
  mut: number
  /** Wucht der Angriffe eines Ungeheuers */
  staerke: number
  /** großer Gegner: zählt nur den Schaden, flieht nie, streicht nie */
  boss?: boolean
  /** Stufe 3 (Duell): Übernimmt die Mannschaft dieses Schiff eines Spielers, kämpft sie bis zuletzt — sie flieht nicht
   *  und streicht nicht von sich aus die Flagge (sonst entschiede ein verpasster Zug das Duell) */
  standhaft?: boolean
}

export interface KSchiff extends SchiffStart {
  q: number
  r: number
  kurs: number
  /** Zustand der Segel in Prozent (Kettenkugeln) */
  segel: number
  crew: number
  zustand: Zustand
  /** übrige Bewegungspunkte im laufenden Zug */
  mp: number
  /** in dieser Runde schon gefeuert: [Backbord, Steuerbord] */
  gefeuert: [boolean, boolean]
  enterVersuch: boolean
  /** von einer Krake gehalten: so viele eigene Züge ohne Fahrt */
  gehalten: number
  /** Seeschlange unter Wasser: nicht zu treffen */
  abgetaucht: boolean
  /** angerichteter Schaden am Rumpf der Gegner (für den großen Gegner) */
  schaden: number
}

export interface KampfStart {
  saat: number
  wind: Wind
  /** Zahl der Felsen auf dem Feld */
  felsen: number
  maxRunden: number
  /** wer in jeder Runde zuerst zieht */
  ersterZug: 0 | 1
  /** Überfall: Der Gegner liegt schon nah, die Breitseite auf den Spieler gerichtet */
  nahe: boolean
  schiffe: SchiffStart[]
  /** Schiffe, die Menschen steuern (fehlt: nur das Flaggschiff 0). Im Duell (Stufe 3) beide Flaggschiffe: 0 und 10. */
  mensch?: number[]
}

export type Aktion =
  | { a: 'fahre'; q: number; r: number; kurs: number }
  | { a: 'feuer'; seite: 0 | 1; mun: Munition }
  | { a: 'entern'; ziel: number }
  | { a: 'fliehe' }
  | { a: 'fertig' }
  /** ab hier übernimmt die Mannschaft (Sofort auskämpfen) */
  | { a: 'auto' }
  /** nur diesen einen Zug spielt die Mannschaft (Duell: der Spieler hat zu lange gezögert) */
  | { a: 'ki' }

export type KEreignis =
  | { t: 'runde'; n: number }
  | { t: 'zug'; id: number }
  | { t: 'zieht'; id: number; weg: [number, number, number][] }
  | { t: 'feuer'; von: number; auf: number; seite: 0 | 1; mun: Munition; schuesse: number; treffer: number; rumpf: number; crew: number; segel: number; laengs: boolean }
  | { t: 'drehbasse'; von: number; auf: number; crew: number }
  | { t: 'enter'; von: number; auf: number; chance: number; ok: boolean; verlustA: number; verlustD: number }
  | { t: 'packt'; von: number; auf: number; rumpf: number; crew: number }
  | { t: 'biss'; von: number; auf: number; rumpf: number; crew: number; segel: number }
  | { t: 'taucht'; id: number; ab: boolean }
  | { t: 'gehalten'; id: number }
  | { t: 'flieht'; id: number }
  | { t: 'streicht'; id: number }
  | { t: 'sinkt'; id: number }
  | { t: 'abbruch' }
  | { t: 'ende'; ausgang: Ausgang }

/** der Zustand eines Schiffs nach einem Ereignis (für die Darstellung) */
export interface Bild { id: number; q: number; r: number; kurs: number; rumpf: number; crew: number; segel: number; zustand: Zustand; abgetaucht: boolean; gehalten: number }
export interface Eintrag { e: KEreignis; bild: Bild[] }

export interface Kampf {
  start: KampfStart
  runde: number
  /** Felsen (Feldnummern) */
  fels: number[]
  schiffe: KSchiff[]
  /** Reihenfolge der Züge in dieser Runde (Stellen in `schiffe`) */
  reihe: number[]
  pos: number
  ende: Ausgang | null
  /** Zähler für die Würfe */
  zufall: number
  log: Eintrag[]
  /** die Befehle des Spielers (für Wiederholung und Fortsetzen) */
  aktionen: Aktion[]
  /** die Mannschaft steuert auch das Flaggschiff */
  spielerKI: boolean
  /** Schiffe, die gerade Menschen steuern (aus start.mensch; wer „Sofort auskämpfen“ wählt, fällt heraus) */
  mensch: number[]
}

// ── Feld ──
export const fnr = (q: number, r: number): number => (q + 64) * 128 + (r + 64)
export const imFeld = (q: number, r: number): boolean => abstand(q, r, 0, 0) <= RADIUS
export const amRand = (q: number, r: number): boolean => abstand(q, r, 0, 0) === RADIUS
export const istFels = (k: Kampf, q: number, r: number): boolean => k.fels.includes(fnr(q, r))
export const lebt = (s: KSchiff): boolean => s.zustand === 'kampf'
export const istSchiff = (s: { art: SchiffArt }): boolean => s.art === 'segler' || s.art === 'geist'
export function schiffBei(k: Kampf, q: number, r: number): KSchiff | null {
  for (const s of k.schiffe) if (lebt(s) && s.q === q && s.r === r) return s
  return null
}
export const schiffMit = (k: Kampf, id: number): KSchiff | null => k.schiffe.find(s => s.id === id) ?? null

/** Zufallszahl 0 … n−1, fest aus Startwert und Zähler */
export function wurf(k: Kampf, n: number): number {
  k.zufall++
  return streu3(k.start.saat, k.zufall, n, S_KAMPF) % n
}

export function protokoll(k: Kampf, e: KEreignis): void {
  k.log.push({ e, bild: k.schiffe.map(s => ({ id: s.id, q: s.q, r: s.r, kurs: s.kurs, rumpf: s.rumpf, crew: s.crew, segel: s.segel, zustand: s.zustand, abgetaucht: s.abgetaucht, gehalten: s.gehalten })) })
}

// ── Fahrt ──
/** Kosten eines Schritts nach vorn auf diesem Kurs: mit dem Wind und raumschots 1, hoch am Wind 2, gegen den Wind
 *  geht es nicht. Ungeheuer und das Geisterschiff kümmert der Wind nicht. */
export function schrittKosten(s: { art: SchiffArt }, kurs: number, wind: Wind): number | null {
  if (s.art !== 'segler') return 1
  const a = drehung(kurs, wind.richtung)
  return a <= 1 ? 1 : a === 2 ? 2 : null
}

/** Bewegungspunkte für einen Zug */
export function bewegungsPunkte(k: Kampf, s: KSchiff): number {
  if (!lebt(s) || s.art === 'fort' || s.gehalten > 0) return 0
  let mp = s.bewegung
  if (s.art === 'segler') {
    mp += k.start.wind.staerke - 2 + (s.navigator ? 1 : 0)
    mp = Math.floor((mp * s.segel) / 100)
    if (s.segel > 0 && mp < 1) mp = 1
  }
  return Math.max(0, mp)
}

/** frei = Ungeheuer: fahren in jede Richtung, ohne zu drehen */
export const frei = (s: { art: SchiffArt }): boolean => s.art === 'krake' || s.art === 'schlange'

export interface Stelle { q: number; r: number; kurs: number; kosten: number; vor: number }
export const stelleKey = (q: number, r: number, kurs: number): number => fnr(q, r) * 8 + kurs

/** Alle Stellen (Feld und Kurs), die das Schiff mit `mp` Punkten erreicht — günstigster Weg zuerst gefunden.
 *  Andere Schiffe und Felsen versperren den Weg. */
export function erreichbar(k: Kampf, s: KSchiff, mp: number = s.mp): Map<number, Stelle> {
  const aus = new Map<number, Stelle>()
  const fr = frei(s)
  const start = stelleKey(s.q, s.r, fr ? 0 : s.kurs)
  aus.set(start, { q: s.q, r: s.r, kurs: s.kurs, kosten: 0, vor: -1 })
  const eimer: number[][] = [[start]]
  for (let c = 0; c <= mp; c++) {
    const liste = eimer[c]
    if (!liste) continue
    for (let i = 0; i < liste.length; i++) {
      const key = liste[i], st = aus.get(key) as Stelle
      if (st.kosten !== c) continue
      const weiter: [number, number, number, number][] = []
      if (fr) {
        for (let d = 0; d < 6; d++) weiter.push([st.q + RICHTUNGEN[d][0], st.r + RICHTUNGEN[d][1], d, 1])
      } else {
        weiter.push([st.q, st.r, (st.kurs + 1) % 6, 1], [st.q, st.r, (st.kurs + 5) % 6, 1])
        const kost = schrittKosten(s, st.kurs, k.start.wind)
        if (kost !== null) weiter.push([st.q + RICHTUNGEN[st.kurs][0], st.r + RICHTUNGEN[st.kurs][1], st.kurs, kost])
      }
      for (const [nq, nr, nk, kost] of weiter) {
        const neu = c + kost
        if (neu > mp) continue
        if (nq !== st.q || nr !== st.r) {
          if (!imFeld(nq, nr) || istFels(k, nq, nr)) continue
          const b = schiffBei(k, nq, nr)
          if (b && b !== s) continue
        }
        const nk2 = stelleKey(nq, nr, fr ? 0 : nk), alt = aus.get(nk2)
        if (alt && alt.kosten <= neu) continue
        aus.set(nk2, { q: nq, r: nr, kurs: nk, kosten: neu, vor: key })
        ;(eimer[neu] ??= []).push(nk2)
      }
    }
  }
  return aus
}

/** der Weg zu einer erreichbaren Stelle (ohne den Ausgangspunkt) */
export function wegZu(stellen: Map<number, Stelle>, ziel: Stelle): Stelle[] {
  const aus: Stelle[] = []
  let st: Stelle | undefined = ziel
  while (st && st.vor >= 0) { aus.push(st); st = stellen.get(st.vor) }
  return aus.reverse()
}

export function fahre(k: Kampf, s: KSchiff, q: number, r: number, kurs: number): boolean {
  if (!lebt(s) || s.mp <= 0) return false
  const stellen = erreichbar(k, s, s.mp)
  const ziel = stellen.get(stelleKey(q, r, frei(s) ? 0 : ((kurs % 6) + 6) % 6))
  if (!ziel || ziel.kosten === 0) return false
  const weg = wegZu(stellen, ziel)
  s.q = ziel.q; s.r = ziel.r; s.kurs = ziel.kurs
  s.mp -= ziel.kosten
  protokoll(k, { t: 'zieht', id: s.id, weg: weg.map(w => [w.q, w.r, w.kurs]) })
  return true
}

export function fliehe(k: Kampf, s: KSchiff): boolean {
  if (!lebt(s) || !istSchiff(s) || s.boss || !amRand(s.q, s.r) || s.mp < 1) return false
  s.zustand = 'geflohen'
  s.mp = 0
  protokoll(k, { t: 'flieht', id: s.id })
  return true
}

// ── Breitseiten ──
/** alle Keile k, in denen (dq, dr) liegt: dq,dr = a·R[k] + b·R[k+1] mit a, b ≥ 0 (auf einer Linie: zwei Keile) */
function keile(dq: number, dr: number): number {
  let maske = 0
  for (let k = 0; k < 6; k++) {
    const x1 = RICHTUNGEN[k][0], y1 = RICHTUNGEN[k][1], x2 = RICHTUNGEN[(k + 1) % 6][0], y2 = RICHTUNGEN[(k + 1) % 6][1]
    const a = dq * y2 - dr * x2, b = x1 * dr - y1 * dq
    if (a >= 0 && b >= 0) maske |= 1 << k
  }
  return maske
}
// Nachschlagetafel: für jede Verschiebung bis 4 Felder und jeden Kurs die Seite (−1, 0 = Backbord, 1 = Steuerbord)
const TAFEL = new Map<number, Int8Array>()
for (let dq = -4; dq <= 4; dq++) {
  for (let dr = -4; dr <= 4; dr++) {
    if ((!dq && !dr) || abstand(dq, dr, 0, 0) > 4) continue
    const m = keile(dq, dr), seiten = new Int8Array(6)
    for (let kurs = 0; kurs < 6; kurs++) seiten[kurs] = m & (1 << ((kurs + 1) % 6)) ? 1 : m & (1 << ((kurs + 4) % 6)) ? 0 : -1
    TAFEL.set((dq + 8) * 32 + (dr + 8), seiten)
  }
}
/** Auf welcher Breitseite liegt ein Feld? 0 = Backbord (links), 1 = Steuerbord (rechts), −1 = Bug oder Heck / zu weit */
export function seiteZu(von: { q: number; r: number; kurs: number }, zq: number, zr: number): -1 | 0 | 1 {
  const t = TAFEL.get((zq - von.q + 8) * 32 + (zr - von.r + 8))
  return t ? (t[von.kurs] as -1 | 0 | 1) : -1
}

/** Liegt (dq, dr) genau auf der Linie der Richtung d (vorwärts)? */
function aufLinie(dq: number, dr: number, d: number): boolean {
  const x = RICHTUNGEN[d][0], y = RICHTUNGEN[d][1]
  return dq * y - dr * x === 0 && (x !== 0 ? dq * x > 0 : dr * y > 0)
}
/** Längsfeuer: Der Schütze liegt genau vor dem Bug oder hinter dem Heck des Ziels — die Kugeln fegen über das ganze Deck */
export function laengs(von: { q: number; r: number }, z: KSchiff): boolean {
  if (!istSchiff(z)) return false
  const dq = von.q - z.q, dr = von.r - z.r
  return aufLinie(dq, dr, z.kurs) || aufLinie(dq, dr, (z.kurs + 3) % 6)
}

/** wie viele Kanonen schießen: Ist mehr als die Hälfte der Mannschaft ausgefallen, nur noch jede zweite */
export const aktiveKanonen = (s: KSchiff): number => (s.crew * 2 < s.crewMax ? Math.ceil(s.kanonen / 2) : s.kanonen)

/** Wirkt diese Munition auf dieses Ziel überhaupt? */
export function wirkt(z: { art: SchiffArt }, mun: Munition): boolean {
  if (z.art === 'geist' || z.art === 'fort') return mun === 0
  return true
}

export interface Wirkung { rumpf: number; crew: number; segel: number }
/** Wirkung je Treffer */
export function jeTreffer(z: KSchiff, mun: Munition, d: number, lang: boolean): Wirkung {
  switch (z.art) {
    case 'segler':
      if (mun === 0) return { rumpf: lang ? 3 : 2, crew: 0, segel: 0 }
      if (mun === 1) return { rumpf: 0, crew: 0, segel: lang ? 15 : 10 }
      return { rumpf: 0, crew: (d <= 1 ? 3 : 2) + (lang ? 1 : 0), segel: 0 }
    case 'geist': return { rumpf: mun === 0 ? (d <= 1 ? 2 : 1) : 0, crew: 0, segel: 0 }
    case 'fort': return { rumpf: mun === 0 ? 2 : 0, crew: 0, segel: 0 }
    case 'krake': return { rumpf: mun === 0 ? 2 : 1, crew: 0, segel: 0 }
    case 'schlange': return { rumpf: mun === 1 ? 1 : 2, crew: 0, segel: 0 }
  }
}

/** Ziele einer Breitseite mit dieser Munition (in Reichweite, auf dieser Seite, nicht abgetaucht) */
export function zieleVon(k: Kampf, s: KSchiff, pos: { q: number; r: number; kurs: number }, seite: 0 | 1, mun: Munition): KSchiff[] {
  const weite = MUNITION[mun].weite
  return k.schiffe.filter(z => lebt(z) && z.seite !== s.seite && !z.abgetaucht && wirkt(z, mun) && abstand(pos.q, pos.r, z.q, z.r) <= weite && seiteZu(pos, z.q, z.r) === seite)
}

/** erwartete Wirkung einer Breitseite (in Hundertsteln) — für die Vorschau und die Steuerung */
export function erwartung(s: KSchiff, pos: { q: number; r: number }, z: KSchiff, mun: Munition, kanonen: number = aktiveKanonen(s)): Wirkung {
  const d = abstand(pos.q, pos.r, z.q, z.r)
  if (d < 1 || d > MUNITION[mun].weite || !wirkt(z, mun)) return { rumpf: 0, crew: 0, segel: 0 }
  const t100 = kanonen * TREFFER[d], j = jeTreffer(z, mun, d, laengs(pos, z))
  const crewExtra = mun === 0 && z.art === 'segler' ? Math.floor(t100 / 2) : 0
  return { rumpf: t100 * j.rumpf, crew: Math.floor(((t100 * j.crew + crewExtra) * (100 - z.arzt)) / 100), segel: t100 * j.segel }
}

/** das lohnendste Ziel einer Breitseite (meiste erwartete Wirkung; bei Gleichstand das mit der kleinsten Nummer) */
export function bestesZiel(s: KSchiff, pos: { q: number; r: number }, ziele: readonly KSchiff[], mun: Munition): KSchiff | null {
  let beste: KSchiff | null = null, bw = -1
  for (const z of ziele) {
    const e = erwartung(s, pos, z, mun)
    const w = e.rumpf * 3 + e.crew + Math.floor(e.segel / 4)
    if (w > bw || (w === bw && beste && z.id < beste.id)) { beste = z; bw = w }
  }
  return beste
}

/** Schaden an Mannschaft abziehen (die Schiffsärztin rettet einen Teil) */
function verliertCrew(z: KSchiff, n: number): number {
  const v = Math.min(z.crew, Math.floor((n * (100 - z.arzt)) / 100))
  z.crew -= v
  return v
}
function verliertRumpf(s: KSchiff | null, z: KSchiff, n: number): number {
  const v = Math.min(z.rumpf, n)
  z.rumpf -= v
  if (s) s.schaden += v
  return v
}

export function kannFeuern(k: Kampf, s: KSchiff, seite: 0 | 1, mun: Munition): boolean {
  return lebt(s) && istSchiff(s) && !s.gefeuert[seite] && !s.enterVersuch && s.kanonen > 0 && zieleVon(k, s, s, seite, mun).length > 0
}

export function feuere(k: Kampf, s: KSchiff, seite: 0 | 1, mun: Munition): boolean {
  if (!kannFeuern(k, s, seite, mun)) return false
  const z = bestesZiel(s, s, zieleVon(k, s, s, seite, mun), mun) as KSchiff
  s.gefeuert[seite] = true
  const d = abstand(s.q, s.r, z.q, z.r), lang = laengs(s, z), n = aktiveKanonen(s)
  let treffer = 0
  for (let i = 0; i < n; i++) if (wurf(k, 100) < TREFFER[d]) treffer++
  const j = jeTreffer(z, mun, d, lang)
  const rumpf = verliertRumpf(s, z, treffer * j.rumpf)
  const crew = verliertCrew(z, treffer * j.crew + (mun === 0 && z.art === 'segler' ? Math.floor(treffer / 2) : 0))
  const segel = Math.min(z.segel, treffer * j.segel)
  z.segel -= segel
  protokoll(k, { t: 'feuer', von: s.id, auf: z.id, seite, mun, schuesse: n, treffer, rumpf, crew, segel, laengs: lang })
  pruefeSchiff(k, z)
  return true
}

/** Festung: feuert in alle Richtungen auf das nächste Ziel bis 3 Felder */
export function festungFeuert(k: Kampf, s: KSchiff): void {
  const ziele = k.schiffe.filter(z => lebt(z) && z.seite !== s.seite && !z.abgetaucht && abstand(s.q, s.r, z.q, z.r) <= 3)
  if (!ziele.length) return
  ziele.sort((a, b) => abstand(s.q, s.r, a.q, a.r) - abstand(s.q, s.r, b.q, b.r) || a.id - b.id)
  const z = ziele[0], d = abstand(s.q, s.r, z.q, z.r)
  let treffer = 0
  for (let i = 0; i < s.kanonen; i++) if (wurf(k, 100) < TREFFER[d]) treffer++
  const rumpf = verliertRumpf(s, z, treffer * 2), crew = istSchiff(z) ? verliertCrew(z, Math.floor(treffer / 2)) : 0
  protokoll(k, { t: 'feuer', von: s.id, auf: z.id, seite: 1, mun: 0, schuesse: s.kanonen, treffer, rumpf, crew, segel: 0, laengs: false })
  pruefeSchiff(k, z)
}

// ── Entern ──
/** Aussicht beim Entern in Prozent: Mannschaft gegen Mannschaft; wer sich verteidigt, hat Deckung (ein Viertel mehr),
 *  Drehbassen kosten die Angreifer noch einmal ein Viertel */
export function enterChance(a: KSchiff, d: KSchiff): number {
  const sa = a.crew * (100 + a.enter), sd = Math.floor((d.crew * (100 + d.enter) * 125 * (d.drehbassen ? 125 : 100)) / 10000)
  if (sa <= 0) return 0
  return Math.max(5, Math.min(95, Math.floor((sa * 100) / (sa + sd))))
}
export function kannEntern(a: KSchiff, d: KSchiff): boolean {
  return lebt(a) && lebt(d) && a.art === 'segler' && d.art === 'segler' && !d.boss && a.seite !== d.seite && abstand(a.q, a.r, d.q, d.r) === 1 && !a.enterVersuch && !a.gefeuert[0] && !a.gefeuert[1] && a.crew > 0
}
export function entere(k: Kampf, a: KSchiff, d: KSchiff): boolean {
  if (!kannEntern(a, d)) return false
  a.enterVersuch = true
  const chance = enterChance(a, d), ok = wurf(k, 100) < chance
  let va = 0, vd = 0
  if (ok) {
    va = Math.min(a.crew - 1, Math.floor((Math.floor(d.crew / 3) * (100 - a.arzt)) / 100))
    a.crew -= Math.max(0, va)
    d.zustand = 'geentert'
  } else {
    va = verliertCrew(a, Math.ceil(a.crew / 4))
    vd = verliertCrew(d, Math.floor(d.crew / 8))
  }
  protokoll(k, { t: 'enter', von: a.id, auf: d.id, chance, ok, verlustA: va, verlustD: vd })
  pruefeSchiff(k, a); pruefeSchiff(k, d)
  return true
}

/** Drehbassen am Ende eines Zuges: kleine Schwenkgeschütze gegen die Mannschaft jedes Nachbarn */
export function drehbassen(k: Kampf, s: KSchiff): void {
  if (!s.drehbassen || !lebt(s)) return
  for (const z of k.schiffe) {
    if (!lebt(z) || z.seite === s.seite || z.art !== 'segler' || abstand(s.q, s.r, z.q, z.r) !== 1) continue
    const v = verliertCrew(z, 1 + wurf(k, 2))
    protokoll(k, { t: 'drehbasse', von: s.id, auf: z.id, crew: v })
    pruefeSchiff(k, z)
  }
}

// ── Ungeheuer ──
/** Krake: Fangarme um das Schiff — Schaden, und im nächsten Zug kommt es nicht von der Stelle */
export function krakePackt(k: Kampf, s: KSchiff, z: KSchiff): void {
  const w = 1 + Math.floor(s.staerke / 2)
  const rumpf = verliertRumpf(s, z, w + wurf(k, 2)), crew = istSchiff(z) ? verliertCrew(z, w) : 0
  if (lebt(z) && istSchiff(z)) z.gehalten = 1
  protokoll(k, { t: 'packt', von: s.id, auf: z.id, rumpf, crew })
  pruefeSchiff(k, z)
}
/** Seeschlange: Biss aus nächster Nähe, sonst ein Schlag mit dem Schwanz ins Rigg */
export function schlangeBeisst(k: Kampf, s: KSchiff, z: KSchiff): void {
  const d = abstand(s.q, s.r, z.q, z.r)
  let rumpf = 0, crew = 0, segel = 0
  if (d === 1) { rumpf = verliertRumpf(s, z, 2 + s.staerke + wurf(k, 2)); crew = istSchiff(z) ? verliertCrew(z, 1) : 0 }
  else if (d === 2 && z.art === 'segler') { segel = Math.min(z.segel, 15); z.segel -= segel }
  else return
  protokoll(k, { t: 'biss', von: s.id, auf: z.id, rumpf, crew, segel })
  pruefeSchiff(k, z)
}

/** Ist ein Schiff am Ende? Rumpf null: gesunken (der große Gegner: bezwungen). Niemand mehr an Deck: gestrichen. */
export function pruefeSchiff(k: Kampf, z: KSchiff): void {
  if (!lebt(z)) return
  if (z.rumpf <= 0) { z.zustand = 'gesunken'; z.gehalten = 0; protokoll(k, { t: 'sinkt', id: z.id }) }
  else if (z.art === 'segler' && z.crew <= 0) { z.zustand = 'gestrichen'; protokoll(k, { t: 'streicht', id: z.id }) }
  else return
  // eine Krake, die versinkt, lässt los
  for (const s of k.schiffe) if (s.gehalten > 0 && !k.schiffe.some(x => lebt(x) && x.art === 'krake' && abstand(x.q, x.r, s.q, s.r) <= 1)) s.gehalten = 0
}

/** Stärke einer Seite: grob Rumpf × Feuerkraft (für die Steuerung: lohnt Weiterkämpfen?) */
export function staerke(k: Kampf, seite: 0 | 1): number {
  let n = 0
  for (const s of k.schiffe) if (lebt(s) && s.seite === seite) n += s.rumpf * Math.max(1, aktiveKanonen(s) + (frei(s) ? 2 + s.staerke : 0))
  return n
}
