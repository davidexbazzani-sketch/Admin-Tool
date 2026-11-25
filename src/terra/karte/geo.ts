// Terra Incognita — Karte: Umrechnung zwischen Feldern und Bildpunkten.
// Maß ist die Feldbreite W (in CSS-Pixeln). Ein Abschnitt (16 × 16 Felder) ist ein Rechteck von 16·W mal hoeheVon(W).
import { qAusSpalte, spalte, type Feld } from '../kern/hex'

/** Zeilenabstand im Verhältnis zur Feldbreite (√3 / 2) — der ideale Wert */
const ZEILE_IDEAL = 0.8660254037844386
/** erlaubte Feldbreiten (Zoomstufen) */
export const STUFEN: readonly number[] = [13, 18, 25, 34, 46, 62]
export const STUFE_START = 3

/** Höhe eines Abschnitts in CSS-Pixeln: auf ein Vielfaches von 4 gerundet, damit Kacheln bei jeder üblichen
 *  Bildschirmdichte (1, 1,25, 1,5, 1,75, 2) auf ganzen Gerätepunkten liegen und ohne Naht aneinanderstoßen */
export const hoeheVon = (W: number): number => Math.round((16 * ZEILE_IDEAL * W) / 4) * 4
/** tatsächlicher Zeilenabstand je Feldbreite bei dieser Zoomstufe */
export const zeileVon = (W: number): number => hoeheVon(W) / (16 * W)

export const mitteX = (q: number, r: number, W: number): number => W * (spalte(q, r) + 0.25 + 0.5 * (r & 1))
export const mitteY = (r: number, W: number): number => zeileVon(W) * W * (r + 0.5)

/** das Feld unter einem Bildpunkt */
export function feldBei(x: number, y: number, W: number): Feld {
  const z = zeileVon(W)
  const r0 = Math.floor(y / (z * W))
  let bestQ = 0, bestR = 0, bestD = Infinity
  for (let r = r0 - 1; r <= r0 + 1; r++) {
    const sp0 = Math.floor(x / W - 0.25 - 0.5 * (r & 1) + 0.5)
    for (let sp = sp0 - 1; sp <= sp0 + 1; sp++) {
      const dx = x - W * (sp + 0.25 + 0.5 * (r & 1)), dy = y - z * W * (r + 0.5)
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; bestQ = qAusSpalte(sp, r); bestR = r }
    }
  }
  return { q: bestQ, r: bestR }
}

/** die sechs Ecken eines Feldes um seine Mitte (Spitze oben), als Versatz in Einheiten von W: oben, rechts oben,
 *  rechts unten, unten, links unten, links oben */
export const ECKEN: readonly (readonly [number, number])[] = [
  [0, -0.5773502691896258], [0.5, -0.2886751345948129], [0.5, 0.2886751345948129],
  [0, 0.5773502691896258], [-0.5, 0.2886751345948129], [-0.5, -0.2886751345948129],
]
/** die Kante zum Nachbarn in Richtung k (0 = Ost … 5 = Nordost) liegt zwischen diesen beiden Ecken */
export const KANTE: readonly (readonly [number, number])[] = [[1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 1]]

export interface Kamera {
  /** Mitte des Bildes in Welt-Bildpunkten (bei der Feldbreite der Stufe) */
  x: number
  y: number
  /** Zoomstufe (Index in STUFEN) */
  stufe: number
}
