// Der Coach — Zufall nur mit Startwert: gleicher Startwert, gleiche Folge (gleicher Tag → gleicher Plan; Tests).
// Nach dem Vorbild von src/brain/kern/zufall.ts (nachgebaut, nicht importiert — der Coach bleibt eigenständig).

export interface Rng {
  (): number
  int(von: number, bis: number): number
  aus<T>(liste: readonly T[]): T
  misch<T>(liste: readonly T[]): T[]
  zweig(salz: number | string): Rng
}

/** Text → 32-Bit-Zahl (FNV-1a) */
export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

export function rng(start: number | string): Rng {
  let a = (typeof start === 'string' ? hash32(start) : start >>> 0) || 0x9e3779b9
  const basis = a
  const r = (() => {   // mulberry32
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
  // Zweig: Startwert aus Basis UND Salz gemischt (nicht nur XOR — sonst wären Zweige symmetrisch)
  r.zweig = salz => rng(hash32(`${basis}|${salz}`))
  return r
}

export const klemme = (x: number, von: number, bis: number): number => Math.max(von, Math.min(bis, x))
