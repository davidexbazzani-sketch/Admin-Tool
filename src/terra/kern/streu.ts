// Terra Incognita — Streuung und Rauschen für die Welt-Erzeugung.
//
// WICHTIG: Die Welt ist für alle Kollegen dieselbe und muss es für immer bleiben (Taufnamen hängen an Feldern).
// Deshalb hier ausschließlich Ganzzahl-Rechnung (+, −, ·, ganzzahliges Teilen, Bit-Operationen). Keine
// Winkelfunktionen, kein Math.pow/exp/log, kein Math.random, keine Uhrzeit — deren Ergebnisse können sich
// zwischen Electron-Versionen in der letzten Stelle unterscheiden. `zweig` aus brain/kern/zufall.ts taugt für
// Koordinaten nicht: Es verknüpft per XOR, (q, r) und (r, q) ergäben denselben Strom — eine gespiegelte Welt.

function mische(h: number): number {
  h ^= h >>> 16; h = Math.imul(h, 0x7FEB352D)
  h ^= h >>> 15; h = Math.imul(h, 0x846CA68B)
  h ^= h >>> 16
  return h
}

/** fester Zufallswert (0 … 2³²−1) für ein Zahlenpaar und ein Salz; (a, b) und (b, a) sind verschieden */
export function streu(a: number, b: number, salz: number): number {
  let h = mische(((salz | 0) + 0x9E3779B9) | 0)
  h = mische((h + Math.imul(a | 0, 0x85EBCA6B)) | 0)
  h = mische(h ^ Math.imul(b | 0, 0xC2B2AE35))
  return h >>> 0
}

/** wie streu, aber mit drei Zahlen (z. B. Feld + Tag) */
export function streu3(a: number, b: number, c: number, salz: number): number {
  return streu(a, b, (streu(c, salz, 0x51ED270B) | 0))
}

/** weiches Gewicht 0 … 4096 für f in 0 … weite (3t² − 2t³) */
function glatt(f: number, weite: number): number {
  const t = Math.floor((f * 4096) / weite)
  return Math.floor((t * t * (12288 - 2 * t)) / 16777216)
}

/** Rauschen 0 … 65535: feste Werte auf einem Gitter im Abstand `weite`, dazwischen weich überblendet */
export function rauschen(x: number, y: number, weite: number, salz: number): number {
  const gx = Math.floor(x / weite), gy = Math.floor(y / weite)
  const wx = glatt(x - gx * weite, weite), wy = glatt(y - gy * weite, weite)
  const a = streu(gx, gy, salz) & 0xFFFF, b = streu(gx + 1, gy, salz) & 0xFFFF
  const c = streu(gx, gy + 1, salz) & 0xFFFF, d = streu(gx + 1, gy + 1, salz) & 0xFFFF
  const oben = a * (4096 - wx) + b * wx
  const unten = c * (4096 - wx) + d * wx
  return Math.floor((oben * (4096 - wy) + unten * wy) / 16777216)
}

/** drei Lagen Rauschen übereinander (grob, mittel, fein) → 0 … 65535 */
export function gebirge(x: number, y: number, weite: number, salz: number): number {
  const g = rauschen(x, y, weite, salz)
  const m = rauschen(x, y, Math.max(2, Math.floor(weite / 2)), salz + 101)
  const f = rauschen(x, y, Math.max(2, Math.floor(weite / 4)), salz + 202)
  return Math.floor((g * 4 + m * 2 + f) / 7)
}

/** Rauschen wird nicht über (q, r) gelegt, sondern über diese Ebene — dort sind die Abstände in alle Richtungen
 *  (fast) gleich, sonst wären Inseln schräg verzerrt. */
export const ebeneX = (q: number, r: number): number => 8 * q + 4 * r
export const ebeneY = (r: number): number => 7 * r
