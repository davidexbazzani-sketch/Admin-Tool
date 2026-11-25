// Terra Incognita — Sechseck-Raster (Spitze oben), axiale Koordinaten (q, r). Hier wird nur mit Ganzzahlen gerechnet.

export interface Feld { q: number; r: number }

/** die sechs Nachbarrichtungen, im Uhrzeigersinn ab Osten (Bildschirm: y wächst nach unten) */
export const RICHTUNGEN: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]
export const RICHTUNG_NAME: readonly string[] = ['Ost', 'Südost', 'Südwest', 'West', 'Nordwest', 'Nordost']
export const RICHTUNG_KURZ: readonly string[] = ['O', 'SO', 'SW', 'W', 'NW', 'NO']

export const nachbar = (q: number, r: number, richtung: number): Feld => ({ q: q + RICHTUNGEN[richtung][0], r: r + RICHTUNGEN[richtung][1] })

export function abstand(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q1 - q2, dr = r1 - r2
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

/** Richtung von einem Feld zum Nachbarfeld (0..5) oder -1, wenn die Felder nicht benachbart sind */
export function richtungZu(q1: number, r1: number, q2: number, r2: number): number {
  const dq = q2 - q1, dr = r2 - r1
  for (let i = 0; i < 6; i++) if (RICHTUNGEN[i][0] === dq && RICHTUNGEN[i][1] === dr) return i
  return -1
}

/** Unterschied zweier Richtungen in Sechstel-Drehungen: 0 = gleich … 3 = entgegengesetzt */
export function drehung(a: number, b: number): number {
  const d = Math.abs(a - b) % 6
  return d > 3 ? 6 - d : d
}

/** Text-Schlüssel eines Feldes (für Spielstand und Dateinamen) */
export const feldKey = (q: number, r: number): string => `${q},${r}`
export function feldAus(key: string): Feld {
  const i = key.indexOf(',')
  return { q: Number(key.slice(0, i)), r: Number(key.slice(i + 1)) }
}

/** Zahl-Schlüssel (für schnelle Mengen bei der Wegsuche); gilt für |q|, |r| < 32768 */
export const feldNr = (q: number, r: number): number => (q + 32768) * 65536 + (r + 32768)
export const nrZuFeld = (n: number): Feld => ({ q: Math.floor(n / 65536) - 32768, r: (n % 65536) - 32768 })

/** alle Felder im Umkreis n (einschließlich Mitte) */
export function umkreis(q: number, r: number, n: number): Feld[] {
  const aus: Feld[] = []
  for (let dq = -n; dq <= n; dq++) {
    const von = Math.max(-n, -dq - n), bis = Math.min(n, -dq + n)
    for (let dr = von; dr <= bis; dr++) aus.push({ q: q + dq, r: r + dr })
  }
  return aus
}

/** der Ring im Abstand genau n (n ≥ 1): 6·n Felder */
export function ring(q: number, r: number, n: number): Feld[] {
  const aus: Feld[] = []
  let cq = q + RICHTUNGEN[4][0] * n, cr = r + RICHTUNGEN[4][1] * n
  for (let seite = 0; seite < 6; seite++) {
    for (let i = 0; i < n; i++) { aus.push({ q: cq, r: cr }); cq += RICHTUNGEN[seite][0]; cr += RICHTUNGEN[seite][1] }
  }
  return aus
}

// ── Abschnitte (16 × 16 Felder im versetzten Raster — dort sind Abschnitte Rechtecke) ──
export const ABSCHNITT = 16

/** Spalte im versetzten Raster (ungerade Zeilen sind einen halben Schritt nach rechts gerückt) */
export const spalte = (q: number, r: number): number => q + (r - (r & 1)) / 2
export const qAusSpalte = (sp: number, r: number): number => sp - (r - (r & 1)) / 2

export interface AbschnittOrt { ax: number; ay: number; bit: number }
export function abschnittVon(q: number, r: number): AbschnittOrt {
  const sp = spalte(q, r)
  return { ax: sp >> 4, ay: r >> 4, bit: ((r & 15) << 4) | (sp & 15) }
}
export const abschnittKey = (ax: number, ay: number): string => `${ax}_${ay}`

/** grobe Himmelsrichtung von A nach B als Text (acht Richtungen) — für Gerüchte und Peilungen.
 *  Rechnet mit den Bildschirm-Verhältnissen des Rasters: x = 2q + r (in halben Feldbreiten), y = r·1,5/0,866. */
export function peilung(q1: number, r1: number, q2: number, r2: number): string {
  // x in Einheiten von 0,866 Feldhöhen, y in denselben Einheiten: x = (2dq + dr)·0,866·…; hier genügt das Verhältnis 4 : 7
  const x = 4 * (2 * (q2 - q1) + (r2 - r1)), y = 7 * (r2 - r1)
  if (x === 0 && y === 0) return 'hier'
  const ax = Math.abs(x), ay = Math.abs(y)
  // Grenzen bei 22,5° und 67,5°: tan = 0,4142 und 2,4142 → als Ganzzahl-Vergleich
  const flach = ay * 2414 < ax * 1000, steil = ay * 1000 > ax * 2414
  const ns = y < 0 ? 'Nord' : 'Süd', ow = x > 0 ? 'ost' : 'west'
  if (flach) return x > 0 ? 'Osten' : 'Westen'
  if (steil) return y < 0 ? 'Norden' : 'Süden'
  return `${ns}${ow}en`
}
