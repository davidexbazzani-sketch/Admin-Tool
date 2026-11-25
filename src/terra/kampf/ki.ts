// Terra Incognita — Seegefecht: die Steuerung der Gegner (und der eigenen Mannschaft beim „Sofort auskämpfen“).
//
// Ein Segler bewertet jede Stelle, die er in diesem Zug erreichen kann: Was richten die Breitseiten von dort an
// (Längsfeuer zählt anderthalbfach), lohnt Entern, welcher Schaden droht dort im nächsten Zug der Gegner (Gefahrenkarte
// aus allen Stellen, die jeder Gegner erreichen kann), wie nah will er sein. Dann fährt er hin und feuert mit der
// Munition, die am meisten bringt. Ungeheuer folgen ihren eigenen Mustern. Alles fest bestimmt — keine Würfel hier.
import { abstand, RICHTUNGEN } from '../kern/hex'
import {
  aktiveKanonen, amRand, enterChance, entere, erreichbar, erwartung, fahre, festungFeuert, fliehe, fnr, imFeld,
  istSchiff, kannEntern, krakePackt, lebt, MUNITION, protokoll, RADIUS, schlangeBeisst, seiteZu, staerke, stelleKey,
  TREFFER, wirkt, zieleVon, bestesZiel, feuere, bewegungsPunkte, type Kampf, type KSchiff, type Munition, type Stelle, type Wirkung,
} from './regeln'

const MUN: readonly Munition[] = [0, 1, 2]
/** alle Verschiebungen bis 4 Felder (für die Gefahrenkarte) */
const UMKREIS4: [number, number, number][] = []
for (let dq = -4; dq <= 4; dq++) for (let dr = -4; dr <= 4; dr++) { const d = abstand(dq, dr, 0, 0); if (d >= 1 && d <= 4) UMKREIS4.push([dq, dr, d]) }

export const feindeVon = (k: Kampf, s: KSchiff): KSchiff[] => k.schiffe.filter(z => lebt(z) && z.seite !== s.seite)

/** ab dieser Aussicht wird geentert (die eigene Mannschaft ist vorsichtiger als Piraten) */
export const enterSchwelle = (s: KSchiff): number => (s.seite === 0 ? 65 : [75, 62, 52][Math.max(0, Math.min(2, s.mut))])

/** Wert einer erwarteten Wirkung: ein Rumpfpunkt zählt 3, ein Mann 1 (wer entern will: 3), zehn Prozent Segel 1 */
function zielWert(s: KSchiff, z: KSchiff, e: Wirkung, entern: boolean): number {
  let w = e.rumpf * 3 + e.crew * (entern ? 3 : 1) + Math.floor(e.segel / 10)
  if (s.seite === 1 && z.id === 0) w = Math.floor((w * 6) / 5)          // die Gegner halten sich ans Flaggschiff
  return w
}

/** Will dieses Schiff entern? (Piraten mit Mut und genug Leuten, die eigene Mannschaft nur bei guter Aussicht) */
function willEntern(k: Kampf, s: KSchiff): boolean {
  if (s.art !== 'segler' || (s.seite === 1 && s.mut < 1)) return false
  const schwelle = enterSchwelle(s) - 10
  return k.schiffe.some(z => lebt(z) && z.seite !== s.seite && z.art === 'segler' && !z.boss && enterChance(s, z) >= schwelle)
}

/** Soll dieses Schiff das Weite suchen? Piraten bei zerschossenem Rumpf, wenn sie nicht klar vorn liegen; Begleiter
 *  früh; das Flaggschiff (nur wenn die Mannschaft steuert) bei einem Viertel Rumpf gegen eine Übermacht. */
export function sollFliehen(k: Kampf, s: KSchiff): boolean {
  if (!istSchiff(s) || s.boss || s.standhaft) return false
  const eigen = staerke(k, s.seite), fremd = staerke(k, s.seite === 0 ? 1 : 0)
  if (s.seite === 1) return s.art === 'segler' && s.rumpf * 100 <= s.rumpfMax * 30 && eigen < fremd
  if (s.id !== 0) return s.rumpf * 100 <= s.rumpfMax * 20
  return s.rumpf * 100 <= s.rumpfMax * 25 && eigen < fremd
}

/** Gefahrenkarte: höchster Schaden (Hundertstel Rumpfpunkte), den die Gegner im nächsten Zug an jedem Feld anrichten könnten */
export function gefahrKarte(k: Kampf, s: KSchiff): Map<number, number> {
  const gefahr = new Map<number, number>()
  for (const e of feindeVon(k, s)) {
    const lokal = new Map<number, number>()
    const hoch = (key: number, w: number): void => { if ((lokal.get(key) ?? 0) < w) lokal.set(key, w) }
    if (e.art === 'fort') {
      for (const [dq, dr, d] of UMKREIS4) if (d <= 3 && imFeld(e.q + dq, e.r + dr)) hoch(fnr(e.q + dq, e.r + dr), e.kanonen * TREFFER[d] * 2)
    } else if (e.art === 'krake' || e.art === 'schlange') {
      const w = (2 + e.staerke) * 100
      for (const st of erreichbar(k, e, e.bewegung).values()) for (const [dq, dr] of RICHTUNGEN) if (imFeld(st.q + dq, st.r + dr)) hoch(fnr(st.q + dq, st.r + dr), w)
    } else {
      const kan = aktiveKanonen(e)
      if (kan <= 0) continue
      const mp = e.gehalten > 0 ? 0 : bewegungsPunkte(k, { ...e, gehalten: 0 })
      for (const st of erreichbar(k, e, mp).values()) {
        for (const [dq, dr, d] of UMKREIS4) {
          const q = st.q + dq, r = st.r + dr
          if (!imFeld(q, r) || seiteZu(st, q, r) < 0) continue
          hoch(fnr(q, r), kan * TREFFER[d] * 2)
        }
      }
    }
    for (const [key, w] of lokal) gefahr.set(key, (gefahr.get(key) ?? 0) + w)
  }
  return gefahr
}

function bewerte(s: KSchiff, st: Stelle, feinde: readonly KSchiff[], gefahr: Map<number, number>, fliehen: boolean, entern: boolean): number {
  const g = gefahr.get(fnr(st.q, st.r)) ?? 0
  if (fliehen) return -(RADIUS - abstand(st.q, st.r, 0, 0)) * 100000 - g - st.kosten
  let w = 0
  for (const seite of [0, 1] as const) {
    let beste = 0
    for (const z of feinde) {
      if (z.abgetaucht) continue
      const d = abstand(st.q, st.r, z.q, z.r)
      if (d < 1 || d > 4 || seiteZu(st, z.q, z.r) !== seite) continue
      for (const mun of MUN) {
        if (MUNITION[mun].weite < d || !wirkt(z, mun)) continue
        const v = zielWert(s, z, erwartung(s, st, z, mun), entern)
        if (v > beste) beste = v
      }
    }
    w += beste
  }
  if (s.art === 'segler') {
    for (const z of feinde) {
      if (z.art !== 'segler' || z.boss || abstand(st.q, st.r, z.q, z.r) !== 1) continue
      const ch = enterChance(s, z)
      if (ch >= enterSchwelle(s)) w = Math.max(w, ch * 1200)
    }
  }
  let nah = 99
  for (const z of feinde) { const d = abstand(st.q, st.r, z.q, z.r); if (d < nah) nah = d }
  const ideal = entern ? 1 : s.kanonen > 0 ? 2 : 1
  w -= Math.abs(nah - ideal) * 300
  w -= Math.floor((g * [180, 100, 60][Math.max(0, Math.min(2, s.mut))]) / 100) * 2
  if (amRand(st.q, st.r)) w -= 400
  return w - st.kosten
}

/** nach der Fahrt: entern oder feuern (je Breitseite die Munition, die am meisten bringt) */
function angreifen(k: Kampf, s: KSchiff, entern: boolean): void {
  if (!lebt(s)) return
  if (s.art === 'segler') {
    let beste: KSchiff | null = null, bc = 0
    for (const z of feindeVon(k, s)) {
      if (!kannEntern(s, z)) continue
      const c = enterChance(s, z)
      if (c > bc || (c === bc && beste && z.id < beste.id)) { beste = z; bc = c }
    }
    if (beste && bc >= enterSchwelle(s)) { entere(k, s, beste); return }
  }
  for (const seite of [0, 1] as const) {
    let wahl = -1, bw = 0
    for (const mun of MUN) {
      const ziele = zieleVon(k, s, s, seite, mun)
      if (!ziele.length) continue
      const z = bestesZiel(s, s, ziele, mun) as KSchiff
      const v = zielWert(s, z, erwartung(s, s, z, mun), entern)
      if (v > bw) { bw = v; wahl = mun }
    }
    if (wahl >= 0 && lebt(s)) feuere(k, s, seite, wahl as Munition)
  }
}

function kiSegler(k: Kampf, s: KSchiff): void {
  const feinde = feindeVon(k, s)
  if (!feinde.length) return
  // Piraten am Ende: fliehen, wenn es geht, sonst die Flagge streichen
  if (s.seite === 1 && s.art === 'segler' && !s.boss && !s.standhaft && (s.rumpf * 100 <= s.rumpfMax * 15 || s.crew * 100 <= s.crewMax * 15)) {
    if (!fliehe(k, s)) { s.zustand = 'gestrichen'; protokoll(k, { t: 'streicht', id: s.id }) }
    return
  }
  const fliehen = sollFliehen(k, s)
  if (fliehen && fliehe(k, s)) return
  const entern = willEntern(k, s)
  const stellen = erreichbar(k, s, s.mp)
  const gefahr = gefahrKarte(k, s)
  let beste: Stelle | null = null, bw = -1e18, bk = 0
  for (const [key, st] of stellen) {
    const w = bewerte(s, st, feinde, gefahr, fliehen, entern)
    if (w > bw || (w === bw && key < bk)) { beste = st; bw = w; bk = key }
  }
  if (beste && beste.kosten > 0) fahre(k, s, beste.q, beste.r, beste.kurs)
  if (fliehen && fliehe(k, s)) return
  angreifen(k, s, entern)
}

/** das nächste Ziel eines Ungeheuers (bei Gleichstand das Flaggschiff, dann die kleinste Nummer) */
function naechstesZiel(s: KSchiff, feinde: readonly KSchiff[]): KSchiff | null {
  let beste: KSchiff | null = null, bd = 99
  for (const z of feinde) {
    const d = abstand(s.q, s.r, z.q, z.r)
    if (d < bd || (d === bd && beste && z.id < beste.id)) { beste = z; bd = d }
  }
  return beste
}

/** Ein Ungeheuer schwimmt so nah wie möglich an sein Ziel heran (am liebsten genau `wunsch` Felder) */
function schwimme(k: Kampf, s: KSchiff, ziel: KSchiff, mp: number, wunsch: number): void {
  const stellen = erreichbar(k, s, mp)
  let beste: Stelle | null = null, bw = -1e9, bk = 0
  for (const [key, st] of stellen) {
    const w = -Math.abs(abstand(st.q, st.r, ziel.q, ziel.r) - wunsch) * 100 - st.kosten
    if (w > bw || (w === bw && key < bk)) { beste = st; bw = w; bk = key }
  }
  if (beste && beste.kosten > 0) fahre(k, s, beste.q, beste.r, beste.kurs)
}

function kiKrake(k: Kampf, s: KSchiff): void {
  const feinde = feindeVon(k, s)
  const ziel = naechstesZiel(s, feinde)
  if (!ziel) return
  if (abstand(s.q, s.r, ziel.q, ziel.r) > 1) schwimme(k, s, ziel, s.mp, 1)
  const nah = feindeVon(k, s).filter(z => abstand(s.q, s.r, z.q, z.r) === 1)
  const opfer = nah.find(z => z.id === ziel.id) ?? nah.sort((a, b) => a.id - b.id)[0]
  if (opfer) krakePackt(k, s, opfer)
}

function kiSchlange(k: Kampf, s: KSchiff): void {
  const feinde = feindeVon(k, s)
  const ziel = naechstesZiel(s, feinde)
  if (!ziel) return
  // unter Wasser heranschwimmen (zwei Felder Abstand: beim Auftauchen ist sie dann gleich da), oben zubeißen
  if (s.abgetaucht) { schwimme(k, s, ziel, s.mp, 2); return }
  if (abstand(s.q, s.r, ziel.q, ziel.r) > 1) schwimme(k, s, ziel, Math.min(s.mp, 2), 1)
  const nah = feindeVon(k, s).filter(z => abstand(s.q, s.r, z.q, z.r) === 1)
  const opfer = nah.find(z => z.id === ziel.id) ?? nah.sort((a, b) => a.id - b.id)[0]
  if (opfer) { schlangeBeisst(k, s, opfer); return }
  const weiter = feindeVon(k, s).filter(z => z.art === 'segler' && abstand(s.q, s.r, z.q, z.r) === 2).sort((a, b) => a.id - b.id)[0]
  if (weiter) schlangeBeisst(k, s, weiter)
}

/** ein Zug der Steuerung für dieses Schiff */
export function kiZug(k: Kampf, s: KSchiff): void {
  if (!lebt(s)) return
  if (s.art === 'fort') festungFeuert(k, s)
  else if (s.art === 'krake') kiKrake(k, s)
  else if (s.art === 'schlange') kiSchlange(k, s)
  else kiSegler(k, s)
}

export { stelleKey }
