// „Lager einsehen“ — der Lagerraum als Daten (Maße in Metern, aus den Fotos geschätzt).
// EINE Stelle für Änderungen: Regale, Fächer, Schilder und Bodenbereiche.
//
// Koordinaten: x nach rechts (entlang der Rückwand), y nach oben, z zum Betrachter (Rückwand bei z = 0).
// Rückwand: vier Regale nebeneinander, Fächer A–T (je vier Böden + Bodenfach).
// Linke Wand: Regal 5 mit Schildern statt Buchstaben, Front zeigt nach +x.

import type { OrtId, R5Id, ZonenId } from './typen'

export const RAUM = { breite: 4.4, tiefe: 3.6, hoehe: 2.6 }

/** Höhe der Böden über dem Teppich (Oberkante). Index 0 = Bodenfach. */
const BOEDEN = [0.05, 0.62, 0.98, 1.34, 1.70]
const DECKE = 2.05          // oberster Boden (Monitore oben drauf, nur Kulisse)
export const BODEN_DICKE = 0.025
export const REGAL_TIEFE = 0.40
export const REGAL_HOEHE = DECKE + BODEN_DICKE

export interface Regal {
  nr: number
  /** Mitte der Regal-Grundfläche (Boden) */
  x: number
  z: number
  breite: number
  /** Drehung um die Hochachse: 0 = Front nach +z (Rückwand), π/2 = Front nach +x (linke Wand) */
  drehung: number
  /** Höhe der Böden (Oberkante), unten → oben, ohne Deckboden */
  boeden: number[]
  deck: number
  kreuzstreben?: boolean
}

export interface Fach {
  ort: OrtId
  regal: number
  ebene: number             // 0 = Bodenfach
  /** Beschriftung auf dem Aufkleber („C“, „Retired this Month“ …) */
  aufkleber: string
  /** zweites Schild an derselben Kante (z. B. „SKF - Eigentum“ an P) */
  zusatz?: string
  /** Schild sitzt links statt rechts an der Kante */
  aufkleberLinks?: boolean
  /** lichte Maße des Fachs */
  breite: number
  tiefe: number
  hoehe: number
  /** Oberkante des Bodens, auf dem die Geräte liegen */
  bodenY: number
}

export interface Zone {
  ort: OrtId
  label: string
  farbe: 'blau' | 'rot' | 'gelb' | 'grau'
  gestrichelt: boolean
  x: number
  z: number
  radius: number
}

const PI2 = Math.PI / 2

export const REGALE: Regal[] = [
  { nr: 1, x: 0.10 + 0.40, z: REGAL_TIEFE / 2, breite: 0.80, drehung: 0, boeden: BOEDEN, deck: DECKE },
  { nr: 2, x: 0.90 + 0.50, z: REGAL_TIEFE / 2, breite: 1.00, drehung: 0, boeden: BOEDEN, deck: DECKE },
  { nr: 3, x: 1.90 + 0.50, z: REGAL_TIEFE / 2, breite: 1.00, drehung: 0, boeden: BOEDEN, deck: DECKE },
  { nr: 4, x: 2.90 + 0.50, z: REGAL_TIEFE / 2, breite: 1.00, drehung: 0, boeden: BOEDEN, deck: DECKE },
  // linke Wand, weiter vorne im Raum
  { nr: 5, x: REGAL_TIEFE / 2, z: 2.05, breite: 1.00, drehung: PI2, boeden: [0.05, 0.43, 0.80, 1.17, 1.55], deck: DECKE, kreuzstreben: true },
]

/** Buchstaben je Regal, von UNTEN (Bodenfach) nach oben. */
const BUCHSTABEN: Record<number, string[]> = {
  1: ['E', 'D', 'C', 'B', 'A'],
  2: ['J', 'I', 'H', 'G', 'F'],
  3: ['O', 'N', 'M', 'L', 'K'],
  4: ['T', 'S', 'R', 'Q', 'P'],
}

/** Zusatzschilder an Regal 4 (wie im Foto) — gleiche Bedeutung wie die Fächer im linken Regal. */
export const ZUSATZ: Record<string, { text: string; r5: R5Id }> = {
  P: { text: 'SKF - Eigentum', r5: 'skf' },
  R: { text: 'Abholung Angemeldet', r5: 'angemeldet' },
  S: { text: 'Abholbereit / BIOS Gelöscht', r5: 'abholbereit' },
}

/** Linkes Regal, von unten nach oben. */
export const R5_FAECHER: { id: R5Id; text: string; kurz: string; links?: boolean }[] = [
  { id: 'pending', text: 'Pending disposal – BIOS-Passwort muss gelöscht werden', kurz: 'Pending disposal', links: true },
  { id: 'abholbereit', text: 'BIOS-Passwort gelöscht – Abholbereit', kurz: 'Abholbereit' },
  { id: 'angemeldet', text: 'Angemeldete Abholung', kurz: 'Angemeldete Abholung' },
  { id: 'skf', text: 'SKF Eigentum (nicht in der AMDB)', kurz: 'SKF Eigentum (nicht in der AMDB)', links: true },
  { id: 'retired', text: 'Retired this Month', kurz: 'Retired this Month' },
]

export const BUCHSTABEN_ALLE = 'ABCDEFGHIJKLMNOPQRST'.split('')

function baueFaecher(): Fach[] {
  const out: Fach[] = []
  for (const r of REGALE) {
    const innen = r.breite - 0.05
    r.boeden.forEach((y, ebene) => {
      const naechster = ebene + 1 < r.boeden.length ? r.boeden[ebene + 1] : r.deck
      const hoehe = naechster - BODEN_DICKE - y
      if (r.nr <= 4) {
        const b = BUCHSTABEN[r.nr][ebene]
        out.push({ ort: `fach:${b}`, regal: r.nr, ebene, aufkleber: b, zusatz: ZUSATZ[b]?.text,
          breite: innen, tiefe: REGAL_TIEFE - 0.02, hoehe, bodenY: y })
      } else {
        const f = R5_FAECHER[ebene]
        out.push({ ort: `r5:${f.id}`, regal: r.nr, ebene, aufkleber: f.text, aufkleberLinks: f.links,
          breite: innen, tiefe: REGAL_TIEFE - 0.02, hoehe, bodenY: y })
      }
    })
  }
  return out
}

export const FAECHER: Fach[] = baueFaecher()

/** Bodenbereiche abseits der Regale (farbige Kreise auf dem Teppich). */
export const ZONEN: Zone[] = [
  { ort: 'zone:timo', label: 'Timo (E10)', farbe: 'blau', gestrichelt: false, x: 1.55, z: 1.45, radius: 0.36 },
  { ort: 'zone:leih-timo', label: 'Leihrechner bei Timo', farbe: 'blau', gestrichelt: true, x: 1.55, z: 2.45, radius: 0.36 },
  { ort: 'zone:tim', label: 'Tim (E11)', farbe: 'rot', gestrichelt: false, x: 2.50, z: 1.45, radius: 0.36 },
  { ort: 'zone:leih-tim', label: 'Leihrechner bei Tim', farbe: 'rot', gestrichelt: true, x: 2.50, z: 2.45, radius: 0.36 },
  { ort: 'zone:leih-umlauf', label: 'Leihrechner im Umlauf', farbe: 'gelb', gestrichelt: false, x: 3.50, z: 1.45, radius: 0.40 },
  { ort: 'zone:ohne', label: 'Ohne Fach', farbe: 'grau', gestrichelt: false, x: 3.50, z: 2.50, radius: 0.40 },
]

export const ZONEN_LABEL: Record<ZonenId, string> = {
  timo: 'Timo (E10)', tim: 'Tim (E11)', 'leih-timo': 'Leihrechner bei Timo', 'leih-tim': 'Leihrechner bei Tim',
  'leih-umlauf': 'Leihrechner im Umlauf', ohne: 'Ohne Fach',
}

export const FACH_BY_ORT = new Map<OrtId, Fach>(FAECHER.map(f => [f.ort, f]))
export const ZONE_BY_ORT = new Map<OrtId, Zone>(ZONEN.map(z => [z.ort, z]))
export const REGAL_BY_NR = new Map<number, Regal>(REGALE.map(r => [r.nr, r]))

/** Alle Orte in Gehreihenfolge (Mini-Inventur): A–T, linkes Regal von oben, Bereiche. */
export const ALLE_ORTE: OrtId[] = [
  ...BUCHSTABEN_ALLE.map(b => `fach:${b}` as OrtId),
  ...[...R5_FAECHER].reverse().map(f => `r5:${f.id}` as OrtId),
  ...ZONEN.map(z => z.ort),
]

/** Anzeigename eines Orts („Fach C“, „Linkes Regal: Abholbereit“, „Leihrechner bei Tim“). */
export function ortName(ort: OrtId): string {
  if (ort.startsWith('fach:')) {
    const b = ort.slice(5)
    const z = ZUSATZ[b]
    return z ? `Fach ${b} (${z.text})` : `Fach ${b}`
  }
  if (ort.startsWith('r5:')) {
    const f = R5_FAECHER.find(x => `r5:${x.id}` === ort)
    return `Linkes Regal: ${f?.kurz ?? ort.slice(3)}`
  }
  return ZONEN_LABEL[ort.slice(5) as ZonenId] ?? ort
}

/** Kurzname für enge Stellen (Chips, 2D-Kacheln). */
export function ortKurz(ort: OrtId): string {
  if (ort.startsWith('fach:')) return ort.slice(5)
  if (ort.startsWith('r5:')) return R5_FAECHER.find(x => `r5:${x.id}` === ort)?.kurz ?? ort
  return ZONEN_LABEL[ort.slice(5) as ZonenId] ?? ort
}

/**
 * Punkt im Fach (lokal: u = von links, v = nach oben ab Boden-Oberkante, w = von vorne nach hinten)
 * → Weltkoordinaten. „Links“ ist aus Sicht von jemandem, der vor dem Regal steht.
 */
export function fachPunkt(f: Fach, u: number, v: number, w: number): [number, number, number] {
  const r = REGAL_BY_NR.get(f.regal)!
  const lx = u - f.breite / 2
  const lz = f.tiefe / 2 - w
  const c = Math.cos(r.drehung), s = Math.sin(r.drehung)
  return [r.x + lx * c + lz * s, f.bodenY + v, r.z - lx * s + lz * c]
}

/** Drehung der Geräte in einem Fach (gleich der Regal-Drehung). */
export function fachDrehung(f: Fach): number {
  return REGAL_BY_NR.get(f.regal)!.drehung
}
