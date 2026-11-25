// Terra Incognita — Gegner auf der Seekarte: Piraten und Ungeheuer (ziehen täglich weiter), Piratennester (fest),
// Überfälle aus dem Hinterhalt und der große Gegner der Woche.
//
// Eine eigene Lage über der Welt mit eigenem Salz: Sie liest nur, wo Wasser ist, und verschiebt nichts an der
// eingefrorenen Welt. Für alle Kollegen am selben Tag dieselben Gegner am selben Ort. Die Heimatsee bleibt sicher,
// und rund um jede Siedlung (drei Felder) liegt niemand auf der Lauer — aus einem Hafen kommt man immer heraus.
import type { Gegner, GegnerArt, Gestalt } from '../kampf/gegner'
import { gebietVon, HEIMATSEE, stufeVon } from './gebiete'
import { abstand, feldNr, qAusSpalte, ring, spalte, umkreis } from './hex'
import { kennt, type Karte } from './nebel'
import type { TiStand } from './stand'
import { streu, streu3 } from './streu'
import { gelaende, istLand, istOffen, orteNahe, RIFF } from './welt'

const REVIER = 9, NEST_REVIER = 27
const S_GEGNER = 9401, S_GEGNER_ORT = 9402, S_NEST = 9404, S_NEST_ORT = 9405, S_HINTERHALT = 9406, S_GROSS = 9407

/** Piraten je Revier und Tag in Promille, nach Gebiet. Sie leben vom Handel: viele auf den Handelsstraßen,
 *  wenige im Eis und auf der offenen See, keine am Rand der Welt. */
export const PIRATEN: readonly number[] = [0, 120, 60, 220, 180, 250, 220, 120, 80, 0]
/** Ungeheuer je Revier und Tag in Promille: [Krake, Seeschlange, Geisterschiff], erst ab Stufe 2 */
const UNGEHEUER: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [0, 0, 60], [0, 0, 50], [0, 0, 0], [0, 0, 0], [0, 30, 0], [30, 40, 0], [40, 60, 0], [60, 0, 0], [80, 60, 60],
]

/** Gibt es diese Art Gegner in diesem Gebiet überhaupt? */
function gibtEs(art: GegnerArt, gebiet: number): boolean {
  const [krake, schlange, geist] = UNGEHEUER[gebiet] ?? [0, 0, 0]
  switch (art) {
    case 'pirat': return (PIRATEN[gebiet] ?? 0) > 0
    case 'krake': return krake > 0
    case 'schlange': return schlange > 0
    case 'geist': return geist > 0
    default: return false
  }
}

/** liegt hier niemand auf der Lauer? (Heimatsee, nah an einer Siedlung, kein offenes Wasser) */
function geschuetzt(q: number, r: number): boolean {
  if (!istOffen(gelaende(q, r)) || gebietVon(q, r) === HEIMATSEE) return true
  return orteNahe(q, r, 3).some(o => o.art === 'hafen' || o.art === 'dorf')
}

const revierCache = new Map<string, Gegner | null>()
/** der Gegner eines Reviers an einem Tag (oder keiner) */
export function revierGegner(cx: number, cy: number, tag: number): Gegner | null {
  const key = `${cx}_${cy}_${tag}`
  const schon = revierCache.get(key)
  if (schon !== undefined) return schon
  let g: Gegner | null = null
  const mr = cy * REVIER + 4, mq = qAusSpalte(cx * REVIER + 4, mr)
  const gebiet = gebietVon(mq, mr), mitte = stufeVon(mq, mr)
  if (gebiet !== HEIMATSEE && mitte >= 1) {
    const w = streu3(cx, cy, tag, S_GEGNER) % 1000
    const p = PIRATEN[gebiet], [kr, sc, gs] = mitte >= 2 ? UNGEHEUER[gebiet] : [0, 0, 0]
    const art: GegnerArt | null = w < p ? 'pirat' : w < p + kr ? 'krake' : w < p + kr + sc ? 'schlange' : w < p + kr + sc + gs ? 'geist' : null
    if (art) {
      for (let i = 0; i < 12; i++) {
        const h = streu3(cx, cy, tag * 16 + i, S_GEGNER_ORT)
        const r = cy * REVIER + ((h >>> 8) % REVIER), q = qAusSpalte(cx * REVIER + (h % REVIER), r)
        // (der Platz kann jenseits einer Gebietsgrenze liegen: Dort muss es diese Art auch geben — keine Piraten am Rand der Welt)
        if (geschuetzt(q, r) || !gibtEs(art, gebietVon(q, r))) continue
        g = { id: `${art[0]}${cx}_${cy}_${tag}`, art, q, r, stufe: Math.max(1, stufeVon(q, r)), saat: streu3(cx, cy, tag, S_GEGNER + 7) }
        break
      }
    }
  }
  if (revierCache.size > 6000) revierCache.clear()
  revierCache.set(key, g)
  return g
}

/** alle Piraten und Ungeheuer, die heute im Umkreis n liegen */
export function gegnerNahe(q: number, r: number, n: number, tag: number): Gegner[] {
  const sp = spalte(q, r), aus: Gegner[] = []
  for (let cy = Math.floor((r - n) / REVIER); cy <= Math.floor((r + n) / REVIER); cy++) {
    for (let cx = Math.floor((sp - n - 1) / REVIER); cx <= Math.floor((sp + n + 1) / REVIER); cx++) {
      const g = revierGegner(cx, cy, tag)
      if (g && abstand(q, r, g.q, g.r) <= n) aus.push(g)
    }
  }
  return aus
}

const nestCache = new Map<string, Gegner | null>()
/** das Piratennest eines großen Reviers (fest, unabhängig vom Tag): versteckt in einer Bucht an einer Küste */
export function revierNest(nx: number, ny: number): Gegner | null {
  const key = `${nx}_${ny}`
  const schon = nestCache.get(key)
  if (schon !== undefined) return schon
  let g: Gegner | null = null
  const mr = ny * NEST_REVIER + 13, mq = qAusSpalte(nx * NEST_REVIER + 13, mr)
  const gebiet = gebietVon(mq, mr), mitte = stufeVon(mq, mr)
  if (mitte >= 2 && PIRATEN[gebiet] > 0 && streu(nx, ny, S_NEST) % 100 < 40) {
    for (let i = 0; i < 24; i++) {
      const h = streu3(nx, ny, i, S_NEST_ORT)
      const r = ny * NEST_REVIER + ((h >>> 8) % NEST_REVIER), q = qAusSpalte(nx * NEST_REVIER + (h % NEST_REVIER), r)
      if (geschuetzt(q, r) || gelaende(q, r) === RIFF) continue
      // in einer Bucht: mindestens zwei Landfelder als Nachbarn
      let land = 0
      for (const f of ring(q, r, 1)) if (istLand(gelaende(f.q, f.r))) land++
      if (land < 2) continue
      if (orteNahe(q, r, 5).some(o => o.art === 'hafen')) continue
      g = { id: `n${nx}_${ny}`, art: 'nest', q, r, stufe: Math.max(2, stufeVon(q, r)), saat: streu(nx, ny, S_NEST + 1) }
      break
    }
  }
  if (nestCache.size > 3000) nestCache.clear()
  nestCache.set(key, g)
  return g
}
export function nesterNahe(q: number, r: number, n: number): Gegner[] {
  const sp = spalte(q, r), aus: Gegner[] = []
  for (let ny = Math.floor((r - n) / NEST_REVIER); ny <= Math.floor((r + n) / NEST_REVIER); ny++) {
    for (let nx = Math.floor((sp - n - 1) / NEST_REVIER); nx <= Math.floor((sp + n + 1) / NEST_REVIER); nx++) {
      const g = revierNest(nx, ny)
      if (g && abstand(q, r, g.q, g.r) <= n) aus.push(g)
    }
  }
  return aus
}
/** nach so vielen Tagen ist ein ausgehobenes Nest wieder besetzt */
export const NEST_ERHOLUNG = 7

// ── der große Gegner der Woche ──
/** Wochennummer (Montag bis Sonntag) aus der Tagesnummer */
export const wocheVon = (tag: number): number => Math.floor((tag + 3) / 7)
const GESTALTEN: readonly Gestalt[] = ['krake', 'schlange', 'geist', 'admiral']
const grossCache = new Map<number, Gegner>()
/** Wo liegt der große Gegner heute? Für alle derselbe, jede Woche eine andere Gestalt, jeden Tag ein anderer Ort —
 *  aber immer 18 bis 26 Felder vor Hamburg, damit ihn jedes Schiff ab dem Kutter erreicht. */
export function grosserGegner(tag: number): Gegner {
  const schon = grossCache.get(tag)
  if (schon) return schon
  const w = wocheVon(tag)
  const gestalt = GESTALTEN[((w % 4) + 4) % 4]
  let q = 20, r = 0
  for (let versuch = 0; versuch < 9; versuch++) {
    const d = 18 + ((streu(w, tag + versuch * 977, S_GROSS) >>> 4) % 9), feld = ring(0, 0, d)
    const start = streu3(w, tag, versuch, S_GROSS) % feld.length
    let gefunden = false
    for (let i = 0; i < feld.length; i++) {
      const f = feld[(start + i) % feld.length]
      if (geschuetzt(f.q, f.r) || gelaende(f.q, f.r) === RIFF) continue
      q = f.q; r = f.r; gefunden = true
      break
    }
    if (gefunden) break
  }
  const g: Gegner = { id: `w${w}`, art: 'gross', q, r, stufe: Math.max(1, stufeVon(q, r)), saat: streu(w, 0, S_GROSS + 1), gestalt }
  if (grossCache.size > 60) grossCache.clear()
  grossCache.set(tag, g)
  return g
}

// ── was der Spieler auf See angeht ──
/** Ist dieser Gegner für diesen Spieler heute noch da? (bezwungen, umgangen oder freigekauft: nicht mehr; ein
 *  ausgehobenes Nest erst nach einer Woche wieder) */
export function nochDa(s: TiStand, g: Gegner, tag: number): boolean {
  const e = s.kampf.erledigt[g.id]
  if (e === undefined) return true
  return g.art === 'nest' ? tag - e >= NEST_ERHOLUNG : false
}

/** Wen sieht man auf der Karte? Piraten und Ungeheuer auf bekannten Feldern bis `weite`, Nester auf bekannten Feldern
 *  im weiteren Umkreis, den großen Gegner, sobald sein Feld bekannt ist. */
export function sichtbareGegner(s: TiStand, karte: Karte, tag: number, weite: number): Gegner[] {
  const aus: Gegner[] = []
  for (const g of gegnerNahe(s.q, s.r, weite, tag)) if (kennt(karte, g.q, g.r) && nochDa(s, g, tag)) aus.push(g)
  for (const g of nesterNahe(s.q, s.r, 60)) if (kennt(karte, g.q, g.r) && nochDa(s, g, tag)) aus.push(g)
  const gross = grosserGegner(tag)
  if (kennt(karte, gross.q, gross.r)) aus.push(gross)
  return aus
}

/** Felder, um die die Kursplanung herumführt: das Feld jedes sichtbaren Piraten oder Ungeheuers und seine Nachbarn
 *  (wer dort landet, wird gestellt). Nester und der große Gegner stellen niemanden. */
export function meideFelder(s: TiStand, karte: Karte, tag: number, weite: number): Set<number> {
  const aus = new Set<number>()
  for (const g of gegnerNahe(s.q, s.r, weite, tag)) {
    if (!kennt(karte, g.q, g.r) || !nochDa(s, g, tag)) continue
    for (const f of umkreis(g.q, g.r, 1)) aus.add(feldNr(f.q, f.r))
  }
  return aus
}

/** Wer stellt das Schiff hier? Ein Pirat oder Ungeheuer auf dem Nachbarfeld (oder demselben) — außer bei der Jolle:
 *  Ein offenes Boot ist keine Beute und zu klein, um bemerkt zu werden. */
export function stelltHier(s: TiStand, tag: number): Gegner | null {
  if (s.klasse < 1 || s.imHafen !== null) return null
  const nah = gegnerNahe(s.q, s.r, 1, tag).filter(g => nochDa(s, g, tag))
  nah.sort((a, b) => abstand(s.q, s.r, a.q, a.r) - abstand(s.q, s.r, b.q, b.r) || (a.id < b.id ? -1 : 1))
  return nah[0] ?? null
}

/** Überfall aus dem Hinterhalt? Nie in der Heimatsee, nie auf eine Jolle, höchstens alle 60 Züge; je nach Gebiet
 *  0 bis 6 Promille je Schritt (im Mittel etwa einer an jedem dritten Spieltag). Fest bestimmt aus dem Spielstand. */
export function hinterhalt(s: TiStand): Gegner | null {
  if (s.klasse < 1 || s.imHafen !== null) return null
  const gebiet = gebietVon(s.q, s.r)
  if (gebiet === HEIMATSEE || s.zug - s.kampf.hinterhalt < 60) return null
  if (streu3(s.saat, s.zug, 77, S_HINTERHALT) % 1000 >= Math.floor(PIRATEN[gebiet] / 40)) return null
  return { id: `h${s.zug}`, art: 'pirat', q: s.q, r: s.r, stufe: Math.max(1, stufeVon(s.q, s.r)), saat: streu3(s.saat, s.zug, 78, S_HINTERHALT) }
}

/** nur für Tests */
export function leereGegnerCache(): void { revierCache.clear(); nestCache.clear(); grossCache.clear() }
export { REVIER }
