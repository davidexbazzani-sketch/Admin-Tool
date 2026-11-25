// Geographie – typisierter Zugriff auf die fertige Weltkarte (geo/welt.json).
// Die Datei wird von scripts/brain-karte.mjs aus Natural Earth 1:110 Mio. (gemeinfrei) erzeugt:
// alle Flächen sind schon projiziert (Equal Earth, flächentreu), hier wird nur noch gelesen.
import roh from './welt.json'

export interface WeltLand {
  /** ISO-3166-Nummer als Text; Flächen ohne Nummer haben einen Namen (z. B. 'kosovo') */
  id: string
  /** SVG-Pfad aller Teilflächen im Zeichenraum (relativ, eine Nachkommastelle) */
  d: string
  /** Merkpunkt: Mitte des größten Kreises, der in die Hauptfläche passt */
  x: number
  y: number
  /** Breite und Höhe der Hauptfläche */
  b: number
  h: number
  /** gezeichnete Fläche aller Teile (mal `km2` = Quadratkilometer) */
  f: number
  /** Halbmesser des größten Kreises um den Merkpunkt – wie gut sich das Land treffen lässt */
  r: number
  /** Kennungen der Flächen mit gemeinsamer Landgrenze */
  nachbarn: string[]
  /** keine gemeinsame Grenze, aber sehr nah oder aus anderem Grund heikel → nie „grenzt nicht an“ behaupten */
  nah?: string[]
}

export type AusschnittName = 'welt' | 'europa' | 'afrika' | 'asien' | 'nordamerika' | 'suedamerika' | 'ozeanien'

export interface Welt {
  breite: number
  hoehe: number
  /** Quadratkilometer je Flächeneinheit des Zeichenraums */
  km2: number
  /** Zeichenpunkt = Equal-Earth-Punkt · k + (x, y) */
  proj: { k: number; x: number; y: number }
  /** [x, y, Breite, Höhe, senkrechte Streckung] */
  ausschnitte: Record<AusschnittName, [number, number, number, number, number]>
  laender: WeltLand[]
}

export const WELT = roh as unknown as Welt

const NACH_ID = new Map(WELT.laender.map(l => [l.id, l]))
export const weltLand = (id: string): WeltLand | undefined => NACH_ID.get(id)

export type Punkt = [number, number]

/**
 * Zerlegt einen Pfad aus welt.json in seine Ringe (absolute Punkte). Das Format ist bewusst schmal:
 * nur „m“ (der erste absolut, alle weiteren relativ zum Anfang des vorigen Rings), Linien als
 * relative Zahlenpaare und „z“.
 */
export function pfadRinge(d: string): Punkt[][] {
  const ringe: Punkt[][] = []
  const teile = d.match(/[mz]|-?(?:\d+\.?\d*|\.\d+)/g) ?? []
  let x = 0, y = 0, anfangX = 0, anfangY = 0
  let ring: Punkt[] | null = null
  for (let i = 0; i < teile.length; i++) {
    const t = teile[i]
    if (t === 'm') { ring = null; continue }
    if (t === 'z') { ring = null; x = anfangX; y = anfangY; continue }
    const dx = Number(t), dy = Number(teile[++i])
    x = Math.round((x + dx) * 10) / 10
    y = Math.round((y + dy) * 10) / 10
    if (!ring) { ring = []; ringe.push(ring); anfangX = x; anfangY = y }
    ring.push([x, y])
  }
  return ringe
}

/** Fläche eines Rings mit Vorzeichen (Schuhband-Formel) */
export function ringFlaeche(p: Punkt[]): number {
  let s = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1])
  return s / 2
}
