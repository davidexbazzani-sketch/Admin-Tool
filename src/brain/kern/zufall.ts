// Zufall mit Startwert — dieselbe Zahl ergibt immer dieselben Aufgaben.
// Wichtig für Duelle (beide Spieler bekommen dieselbe Folge) und für Tests (reproduzierbar).

export interface Rng {
  /** 0 ≤ x < 1 */
  (): number
  /** ganze Zahl von..bis (beide eingeschlossen) */
  int(von: number, bis: number): number
  /** ein Element */
  aus<T>(liste: readonly T[]): T
  /** n verschiedene Elemente (höchstens so viele, wie da sind) */
  ausN<T>(liste: readonly T[], n: number): T[]
  /** neue, gemischte Liste */
  misch<T>(liste: readonly T[]): T[]
  /** wahr mit Wahrscheinlichkeit p */
  chance(p: number): boolean
  /** eigener, unabhängiger Zufall (z. B. je Aufgabe) */
  zweig(salz: number | string): Rng
}

/** Text → 32-Bit-Zahl (für Startwerte aus Kennungen) */
export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function rng(start: number | string): Rng {
  let a = (typeof start === 'string' ? hash32(start) : start >>> 0) || 0x9e3779b9
  const basis = a
  // mulberry32
  const r = (() => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }) as Rng
  r.int = (von, bis) => von + Math.floor(r() * (bis - von + 1))
  r.aus = liste => liste[Math.floor(r() * liste.length)]
  r.misch = liste => {
    const k = liste.slice()
    for (let i = k.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [k[i], k[j]] = [k[j], k[i]] }
    return k
  }
  r.ausN = (liste, n) => r.misch(liste).slice(0, Math.max(0, n))
  r.chance = p => r() < p
  r.zweig = salz => rng((basis ^ hash32(String(salz))) >>> 0 || 1)
  return r
}

/** frischer Startwert (nicht für Sicherheit — nur für Abwechslung) */
export const neuerStart = (): number => (Math.floor(Math.random() * 0xffffffff) ^ (Date.now() & 0xffffffff)) >>> 0

/** Wert auf einen Bereich begrenzen */
export const klemme = (x: number, von: number, bis: number): number => Math.max(von, Math.min(bis, x))
