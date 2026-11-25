// Terra Incognita — Seegefecht: Ablauf. Aufstellung, Runden und Züge, Befehle des Spielers, die Steuerung der anderen,
// „Sofort auskämpfen“ und das Nachspielen (Wiederholung, Fortsetzen nach einem Abbruch).
//
// Ein Kampf ist durch seine Aufstellung (KampfStart) und die Befehle des Spielers vollständig bestimmt: Gegner und
// Würfel rechnen fest mit dem Startwert. Gespeichert wird deshalb nur das (siehe KampfAkte) — nie der ganze Verlauf.
import { abstand } from '../kern/hex'
import { kiZug } from './ki'
import {
  amRand, bewegungsPunkte, drehbassen, entere, fahre, feuere, fliehe, fnr, imFeld, istSchiff, lebt, protokoll, RADIUS, schiffBei,
  schiffMit, schrittKosten, seiteZu, wurf, type Aktion, type Ausgang, type Kampf, type KampfStart, type KSchiff, type SchiffStart,
} from './regeln'

export interface KampfAkte { start: KampfStart; aktionen: Aktion[] }

// ── gespeicherte Akten prüfen (sie kommen aus dem Spielstand: nie abstürzen, nichts Unsinniges durchlassen) ──
const ARTEN = ['segler', 'geist', 'krake', 'schlange', 'fort'] as const
const ganz = (x: unknown, von: number, bis: number, ersatz = von): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(von, Math.min(bis, Math.floor(x))) : ersatz)
export function pruefeSchiffStart(roh: unknown): SchiffStart | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Record<string, unknown>
  if (!ARTEN.includes(d.art as typeof ARTEN[number])) return null
  const rumpfMax = ganz(d.rumpfMax, 1, 100000, 10)
  const aus: SchiffStart = {
    id: ganz(d.id, 0, 99), seite: d.seite === 1 ? 1 : 0, name: typeof d.name === 'string' ? d.name.slice(0, 40) : '', art: d.art as SchiffStart['art'],
    klasse: ganz(d.klasse, 0, 6), rumpf: ganz(d.rumpf, 1, rumpfMax, rumpfMax), rumpfMax, crewMax: ganz(d.crewMax, 1, 500, 1), kanonen: ganz(d.kanonen, 0, 60), bewegung: ganz(d.bewegung, 0, 9),
    enter: ganz(d.enter, 0, 200), drehbassen: d.drehbassen === true, navigator: d.navigator === true, arzt: ganz(d.arzt, 0, 90), mut: ganz(d.mut, 0, 2), staerke: ganz(d.staerke, 0, 20),
  }
  if (d.boss === true) aus.boss = true
  if (d.standhaft === true) aus.standhaft = true
  return aus
}
function pruefeAktion(roh: unknown): Aktion | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Record<string, unknown>
  switch (d.a) {
    case 'fahre': return { a: 'fahre', q: ganz(d.q, -9, 9), r: ganz(d.r, -9, 9), kurs: ganz(d.kurs, 0, 5) }
    case 'feuer': return { a: 'feuer', seite: d.seite === 1 ? 1 : 0, mun: ganz(d.mun, 0, 2) as 0 | 1 | 2 }
    case 'entern': return { a: 'entern', ziel: ganz(d.ziel, 0, 99) }
    case 'fliehe': case 'fertig': case 'auto': case 'ki': return { a: d.a }
    default: return null
  }
}
/** eine gespeicherte Kampfakte prüfen; null, wenn sie unbrauchbar ist */
export function pruefeAkte(roh: unknown): KampfAkte | null {
  try {
    if (!roh || typeof roh !== 'object') return null
    const d = roh as { start?: Record<string, unknown>; aktionen?: unknown }
    const s = d.start
    if (!s || typeof s !== 'object' || !Array.isArray(s.schiffe)) return null
    const w = (s.wind && typeof s.wind === 'object' ? s.wind : {}) as Record<string, unknown>
    const schiffe = s.schiffe.slice(0, 6).map(pruefeSchiffStart)
    if (schiffe.some(x => !x)) return null
    const liste = schiffe as SchiffStart[]
    if (liste.filter(x => x.id === 0 && x.seite === 0).length !== 1 || !liste.some(x => x.seite === 1) || new Set(liste.map(x => x.id)).size !== liste.length) return null
    const start: KampfStart = {
      saat: ganz(s.saat, 0, 0xFFFFFFFF), wind: { richtung: ganz(w.richtung, 0, 5), staerke: ganz(w.staerke, 1, 3, 2) as 1 | 2 | 3 }, felsen: ganz(s.felsen, 0, 8),
      maxRunden: ganz(s.maxRunden, 1, 20, 12), ersterZug: s.ersterZug === 1 ? 1 : 0, nahe: s.nahe === true, schiffe: liste,
    }
    // Stufe 3: Wer steuert? Nur Flaggschiffe (0, im Duell auch 10), die es gibt — sonst bleibt es beim Flaggschiff 0
    if (Array.isArray(s.mensch)) {
      const m = s.mensch.filter((x): x is number => (x === 0 || x === 10) && liste.some(sch => sch.id === x && sch.art === 'segler'))
      if (m.length && m.includes(0) && new Set(m).size === m.length) start.mensch = m
      else return null
    }
    const aktionen = (Array.isArray(d.aktionen) ? d.aktionen.slice(0, 600) : []).map(pruefeAktion).filter((x): x is Aktion => !!x)
    return { start, aktionen }
  } catch { return null }
}

/** Aufstellung: der Spieler im Westen, der Gegner im Osten, sechs Felder auseinander */
const PLAETZE: readonly (readonly [number, number])[][] = [
  [[-3, 1], [-4, 3], [-2, -1]],
  [[3, -1], [4, -3], [2, 1]],
]
const FESTUNG: readonly [number, number] = [4, -2]

export function neuerKampf(start: KampfStart): Kampf {
  const k: Kampf = { start, runde: 0, fels: [], schiffe: [], reihe: [], pos: 0, ende: null, zufall: 0, log: [], aktionen: [], spielerKI: false, mensch: start.mensch ? [...start.mensch] : [0] }
  const belegt = [0, 0]
  for (const sch of start.schiffe.slice(0, 6)) {
    let q: number, r: number
    if (sch.art === 'fort') [q, r] = FESTUNG
    else {
      let i = belegt[sch.seite]++
      while (i < 3 && sch.seite === 1 && start.schiffe.some(x => x.art === 'fort') && PLAETZE[1][i][0] === FESTUNG[0] && PLAETZE[1][i][1] === FESTUNG[1]) i++
      ;[q, r] = PLAETZE[sch.seite][Math.min(2, i)]
    }
    k.schiffe.push({ ...sch, q, r, kurs: sch.seite === 0 ? 0 : 3, segel: 100, crew: sch.crewMax, zustand: 'kampf', mp: 0, gefeuert: [false, false], enterVersuch: false, gehalten: 0, abgetaucht: false, schaden: 0 })
  }
  // Überfall: Der erste Gegner liegt zwei Felder vom Flaggschiff entfernt, die Breitseite auf ihn gerichtet
  const ich = k.schiffe.find(s => s.id === 0), erster = k.schiffe.find(s => s.seite === 1 && s.art !== 'fort')
  if (start.nahe && ich && erster) {
    ich.q = -1; ich.r = 1
    erster.q = 1; erster.r = -1
    for (let kurs = 0; kurs < 6; kurs++) if (seiteZu({ q: erster.q, r: erster.r, kurs }, ich.q, ich.r) >= 0 && schrittKosten(erster, kurs, start.wind) !== null) { erster.kurs = kurs; break }
  }
  // niemand beginnt mit dem Bug genau im Wind (sonst ist der erste Zug verschenkt)
  for (const s of k.schiffe) if (s.art === 'segler' && schrittKosten(s, s.kurs, start.wind) === null) s.kurs = (s.kurs + 1) % 6
  setzeFelsen(k)
  neueRunde(k)
  weiter(k)
  return k
}

/** Felsen: nicht neben einem Schiff, und das Wasser bleibt zusammenhängend (jeder kommt an den Rand, um zu fliehen) */
function setzeFelsen(k: Kampf): void {
  const frei: [number, number][] = []
  for (let q = -RADIUS; q <= RADIUS; q++) for (let r = -RADIUS; r <= RADIUS; r++) {
    if (abstand(q, r, 0, 0) > RADIUS - 1) continue
    if (k.schiffe.some(s => abstand(s.q, s.r, q, r) <= 1)) continue
    frei.push([q, r])
  }
  let n = 0, versuche = 0
  while (n < k.start.felsen && frei.length && versuche++ < 40) {
    const [q, r] = frei.splice(wurf(k, frei.length), 1)[0]
    k.fels.push(fnr(q, r))
    if (zusammenhaengend(k)) n++
    else k.fels.pop()
  }
}
function zusammenhaengend(k: Kampf): boolean {
  let alle = 0
  for (let q = -RADIUS; q <= RADIUS; q++) for (let r = -RADIUS; r <= RADIUS; r++) if (imFeld(q, r) && !k.fels.includes(fnr(q, r))) alle++
  const start = k.schiffe[0]
  const gesehen = new Set<number>([fnr(start.q, start.r)])
  const reihe: [number, number][] = [[start.q, start.r]]
  for (let i = 0; i < reihe.length; i++) {
    const [q, r] = reihe[i]
    for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const) {
      const nq = q + dq, nr = r + dr, n = fnr(nq, nr)
      if (!imFeld(nq, nr) || k.fels.includes(n) || gesehen.has(n)) continue
      gesehen.add(n); reihe.push([nq, nr])
    }
  }
  return gesehen.size === alle
}

export const aktiv = (k: Kampf): KSchiff | null => (k.ende ? null : k.schiffe[k.reihe[k.pos]] ?? null)
/** Muss ein Mensch jetzt einen Befehl geben? (gewöhnlich der Spieler mit dem Flaggschiff 0; im Duell auch 10) */
export const spielerAmZug = (k: Kampf): boolean => { if (k.ende) return false; const s = aktiv(k); return !!s && k.mensch.includes(s.id) }

function neueRunde(k: Kampf): void {
  k.runde++
  if (k.runde > k.start.maxRunden) {
    protokoll(k, { t: 'abbruch' })
    k.ende = 'remis'
    protokoll(k, { t: 'ende', ausgang: 'remis' })
    return
  }
  for (const s of k.schiffe) {
    s.gefeuert = [false, false]
    // die Seeschlange taucht in jeder ungeraden Runde ab und in jeder geraden auf
    if (s.art === 'schlange' && lebt(s)) s.abgetaucht = k.runde % 2 === 1
  }
  const zuerst = k.start.ersterZug, nr = (s: KSchiff): number => s.id
  const seite = (x: 0 | 1): number[] => k.schiffe.map((s, i) => [s, i] as const).filter(([s]) => s.seite === x && lebt(s)).sort((a, b) => nr(a[0]) - nr(b[0])).map(([, i]) => i)
  k.reihe = [...seite(zuerst), ...seite(zuerst === 0 ? 1 : 0)]
  k.pos = 0
  protokoll(k, { t: 'runde', n: k.runde })
  for (const s of k.schiffe) if (s.art === 'schlange' && lebt(s)) protokoll(k, { t: 'taucht', id: s.id, ab: s.abgetaucht })
  beginneZug(k)
}

function beginneZug(k: Kampf): void {
  // die Reihe kann Schiffe enthalten, die inzwischen ausgefallen sind
  while (k.pos < k.reihe.length && !lebt(k.schiffe[k.reihe[k.pos]])) k.pos++
  if (k.pos >= k.reihe.length) { neueRunde(k); return }
  const s = k.schiffe[k.reihe[k.pos]]
  // (gehalten: In diesem Zug kommt das Schiff nicht von der Stelle — danach ist es wieder frei)
  s.mp = bewegungsPunkte(k, s)
  if (s.gehalten > 0) { s.gehalten--; protokoll(k, { t: 'gehalten', id: s.id }) }
  s.enterVersuch = false
  protokoll(k, { t: 'zug', id: s.id })
}

function pruefeEnde(k: Kampf): void {
  if (k.ende) return
  const ich = schiffMit(k, 0)
  let aus: Ausgang | null = null
  if (!ich || !lebt(ich)) aus = ich && ich.zustand === 'geflohen' ? 'flucht' : 'niederlage'
  else {
    const feinde = k.schiffe.filter(s => s.seite === 1)
    if (!feinde.some(lebt)) aus = feinde.some(s => s.zustand !== 'geflohen') ? 'sieg' : 'remis'
  }
  if (aus) { k.ende = aus; protokoll(k, { t: 'ende', ausgang: aus }) }
}

function beendeZug(k: Kampf, s: KSchiff): void {
  drehbassen(k, s)
  pruefeEnde(k)
}

function naechster(k: Kampf): void {
  if (k.ende) return
  k.pos++
  beginneZug(k)
}

/** die Steuerung zieht, bis der Spieler dran ist oder der Kampf zu Ende ist */
export function weiter(k: Kampf): void {
  let schutz = 0
  while (!k.ende && !spielerAmZug(k) && schutz++ < 400) {
    const s = aktiv(k)
    if (!s) break
    kiZug(k, s)
    pruefeEnde(k)
    if (k.ende) break
    beendeZug(k, s)
    naechster(k)
  }
}

/** Einen Befehl des Spielers ausführen. Ungültige Befehle ändern nichts und geben false zurück. */
export function befehl(k: Kampf, a: Aktion): boolean {
  if (!spielerAmZug(k)) return false
  const s = aktiv(k) as KSchiff
  let ok = false, zugEnde = false
  switch (a.a) {
    case 'fahre': ok = Number.isInteger(a.q) && Number.isInteger(a.r) && Number.isInteger(a.kurs) && fahre(k, s, a.q, a.r, a.kurs); break
    case 'feuer': ok = (a.seite === 0 || a.seite === 1) && (a.mun === 0 || a.mun === 1 || a.mun === 2) && feuere(k, s, a.seite, a.mun); break
    case 'entern': { const z = schiffMit(k, a.ziel); ok = !!z && entere(k, s, z); break }
    case 'fliehe': ok = fliehe(k, s); zugEnde = ok; break
    case 'fertig': ok = true; zugEnde = true; break
    case 'auto': case 'ki': ok = true; break
  }
  if (!ok) return false
  k.aktionen.push(a)
  pruefeEnde(k)
  if (k.ende) return true
  // 'auto': ab jetzt steuert die Mannschaft dieses Schiff; 'ki': nur für diesen einen Zug (Duell: zu lange gezögert)
  if (a.a === 'auto' || a.a === 'ki') {
    if (a.a === 'auto') { k.mensch = k.mensch.filter(id => id !== s.id); if (s.id === 0) k.spielerKI = true }
    if (lebt(s)) kiZug(k, s)
    pruefeEnde(k)
    if (!k.ende) { beendeZug(k, s); naechster(k); weiter(k) }
    return true
  }
  if (zugEnde || !lebt(s)) { beendeZug(k, s); naechster(k); weiter(k) }
  return true
}

/** Einen Kampf aus Aufstellung und Befehlen nachspielen. Ein Befehl, der nicht (mehr) passt, beendet das Nachspielen. */
export function nachspielen(akte: KampfAkte): Kampf {
  const k = neuerKampf(akte.start)
  for (const a of akte.aktionen) { if (k.ende || !befehl(k, a)) break }
  return k
}

/** zu Ende kämpfen lassen (Sofort auskämpfen, oder ein unterbrochener Kampf) */
export function auskaempfen(k: Kampf): void {
  if (k.ende) return
  if (spielerAmZug(k) && k.mensch.length === 1) befehl(k, { a: 'auto' })
  else { k.spielerKI = true; k.mensch = []; weiter(k) }
}

/** Duell (Stufe 3): Wer hat gewonnen? 0 = das Schiff mit der Nummer 0, 1 = das mit der Nummer 10, null = noch offen
 *  oder unentschieden. Wer flieht oder die Flagge streicht, hat verloren; wer am Ende noch kämpft, gewinnt. */
export function duellSieger(k: Kampf): 0 | 1 | null {
  if (!k.ende) return null
  const a = schiffMit(k, 0), b = schiffMit(k, 10)
  const la = !!a && lebt(a), lb = !!b && lebt(b)
  return la && !lb ? 0 : lb && !la ? 1 : null
}

/** Prüfsumme über den Stand des Gefechts (Duell: Beide PCs müssen nach jedem Zug genau dasselbe sehen) */
export function pruefsumme(k: Kampf): number {
  let h = 0x811c9dc5 ^ k.zufall
  const mische = (x: number): void => { h = Math.imul(h ^ (x | 0), 16777619) >>> 0 }
  mische(k.runde); mische(k.pos); mische(k.ende ? ['sieg', 'niederlage', 'flucht', 'remis'].indexOf(k.ende) + 1 : 0)
  for (const s of k.schiffe) {
    mische(s.id); mische(s.q); mische(s.r); mische(s.kurs); mische(s.rumpf); mische(s.crew); mische(s.segel); mische(s.mp)
    mische(['kampf', 'geflohen', 'gestrichen', 'gesunken', 'geentert'].indexOf(s.zustand))
  }
  return h >>> 0
}

export interface KampfBilanz {
  ausgang: Ausgang
  /** Gegner, die bezwungen sind (gesunken, gestrichen, geentert) */
  bezwungen: KSchiff[]
  geentert: KSchiff[]
  geflohen: KSchiff[]
  /** Rumpf des Flaggschiffs nach dem Kampf */
  rumpf: number
  /** Schaden, den die eigene Seite am Rumpf der Gegner angerichtet hat */
  schaden: number
  /** Rumpf der Begleitschiffe nach dem Kampf (Nummer → Rumpf) */
  geleit: Record<number, number>
  runden: number
}
export function bilanz(k: Kampf): KampfBilanz {
  const feinde = k.schiffe.filter(s => s.seite === 1), ich = schiffMit(k, 0) as KSchiff
  const geleit: Record<number, number> = {}
  for (const s of k.schiffe) if (s.seite === 0 && s.id !== 0) geleit[s.id] = Math.max(0, s.rumpf)
  return {
    ausgang: k.ende ?? 'remis',
    bezwungen: feinde.filter(s => s.zustand === 'gesunken' || s.zustand === 'gestrichen' || s.zustand === 'geentert'),
    geentert: feinde.filter(s => s.zustand === 'geentert'),
    geflohen: feinde.filter(s => s.zustand === 'geflohen'),
    rumpf: Math.max(0, ich.rumpf),
    schaden: k.schiffe.filter(s => s.seite === 0).reduce((n, s) => n + s.schaden, 0),
    geleit,
    runden: Math.min(k.runde, k.start.maxRunden),
  }
}

/** Kann der Spieler jetzt fliehen? (am Rand des Feldes und noch Fahrt im Schiff) */
export const kannFliehen = (k: Kampf): boolean => { const s = aktiv(k); return !!s && spielerAmZug(k) && istSchiff(s) && amRand(s.q, s.r) && s.mp >= 1 }

export { schiffBei }
