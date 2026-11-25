// Zahlen verbinden (Tempo) — reine Logik: Stufen, Reihenfolge, Lage der Kreise, Wertung. Oberfläche: Verbinden.tsx.
import type { Rohergebnis } from '../../kern/typen'
import type { Rng } from '../../kern/zufall'
import { tempoAus } from '../../kern/wertung'
import { kommaZahl, stufeFest, tempoGuete } from './tempo.logik'

/** Zeichenraum des Spielfelds (wird als SVG auf die verfügbare Breite gebracht) */
export const VB_BREITE = 1000
export const VB_HOEHE = 430
/** Zeitstrafe je Fehlklick */
export const VB_STRAFE_MS = 1000

export interface VbStufe {
  /** Kreise je Feld */
  anzahl: number
  /** Zahlen und Buchstaben im Wechsel (1 – A – 2 – B …) statt nur Zahlen */
  gemischt: boolean
  /** Felder je Durchgang */
  felder: number
  /** Zeit je Kreis (mit Strafzeiten): ab hier volles Tempo … */
  gutMs: number
  /** … und ab hier keines mehr */
  langsamMs: number
}
const TAFEL: VbStufe[] = [
  { anzahl: 8, gemischt: false, felder: 3, gutMs: 650, langsamMs: 2000 },
  { anzahl: 11, gemischt: false, felder: 3, gutMs: 700, langsamMs: 2100 },
  { anzahl: 14, gemischt: false, felder: 2, gutMs: 750, langsamMs: 2250 },
  { anzahl: 17, gemischt: false, felder: 2, gutMs: 800, langsamMs: 2400 },
  { anzahl: 20, gemischt: false, felder: 2, gutMs: 850, langsamMs: 2550 },
  { anzahl: 10, gemischt: true, felder: 3, gutMs: 1050, langsamMs: 3150 },
  { anzahl: 14, gemischt: true, felder: 2, gutMs: 1150, langsamMs: 3450 },
  { anzahl: 18, gemischt: true, felder: 2, gutMs: 1250, langsamMs: 3750 },
  { anzahl: 21, gemischt: true, felder: 2, gutMs: 1330, langsamMs: 4000 },
  { anzahl: 24, gemischt: true, felder: 2, gutMs: 1400, langsamMs: 4200 },
]
export const vbStufe = (stufe: number): VbStufe => TAFEL[stufeFest(stufe) - 1]

const BUCHSTABEN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** Beschriftungen in der Reihenfolge, in der sie anzuklicken sind */
export function vbFolge(anzahl: number, gemischt: boolean): string[] {
  return Array.from({ length: anzahl }, (_, i) => (!gemischt ? String(i + 1) : i % 2 === 0 ? String(i / 2 + 1) : BUCHSTABEN[(i - 1) / 2]))
}

export interface VbKreis { x: number; y: number; text: string }
export interface VbFeld {
  /** in der Reihenfolge, in der sie anzuklicken sind */
  kreise: VbKreis[]
  radius: number
  /** wahr, wenn die zufällige Lage nicht gelang und das Raster einspringen musste (kommt praktisch nicht vor) */
  raster: boolean
}

/** Radius nach Anzahl: wenige Kreise dürfen größer sein */
export const vbRadius = (anzahl: number): number => (anzahl <= 12 ? 27 : anzahl <= 18 ? 25 : 23)
/** kleinster erlaubter Abstand zweier Mittelpunkte (Kreise berühren sich nie) */
export const vbAbstand = (radius: number): number => 2 * radius + 22
/** Abstand der Mittelpunkte vom Rand des Felds */
export const vbRand = (radius: number): number => radius + 8

/**
 * Ein Feld: die Kreise liegen zufällig, überlappen nie und bleiben ganz im Feld.
 * Jeder Kreis wird gewürfelt und verworfen, solange er einem anderen zu nahe kommt; klappt das nicht,
 * beginnt die Lage von vorn. Als letzte Sicherheit gibt es ein gemischtes Raster.
 */
export function vbFeld(r: Rng, anzahl: number, gemischt: boolean): VbFeld {
  const texte = vbFolge(anzahl, gemischt)
  const radius = vbRadius(anzahl)
  const rand = vbRand(radius)
  const abstand2 = vbAbstand(radius) ** 2
  for (let anlauf = 0; anlauf < 80; anlauf++) {
    const punkte: { x: number; y: number }[] = []
    for (let i = 0; i < anzahl; i++) {
      let gesetzt = false
      for (let v = 0; v < 300 && !gesetzt; v++) {
        const x = r.int(rand, VB_BREITE - rand), y = r.int(rand, VB_HOEHE - rand)
        if (punkte.every(p => (p.x - x) ** 2 + (p.y - y) ** 2 >= abstand2)) { punkte.push({ x, y }); gesetzt = true }
      }
      if (!gesetzt) break
    }
    if (punkte.length === anzahl) return { kreise: punkte.map((p, i) => ({ ...p, text: texte[i] })), radius, raster: false }
  }
  // Raster: so viele Spalten, dass die Zellen etwa quadratisch sind; Plätze gemischt vergeben
  const spalten = Math.ceil(Math.sqrt(anzahl * VB_BREITE / VB_HOEHE))
  const zeilen = Math.ceil(anzahl / spalten)
  const plaetze = r.misch(Array.from({ length: spalten * zeilen }, (_, i) => i)).slice(0, anzahl)
  return {
    kreise: plaetze.map((p, i) => ({
      x: Math.round((p % spalten + 0.5) * VB_BREITE / spalten),
      y: Math.round((Math.floor(p / spalten) + 0.5) * VB_HOEHE / zeilen),
      text: texte[i],
    })),
    radius, raster: true,
  }
}

/**
 * Wertung: Zeit je Kreis (jeder Fehlklick kostet zusätzlich VB_STRAFE_MS) gegen die Richtzeiten der Stufe,
 * verrechnet mit der Genauigkeit (Treffer / alle Klicks).
 */
export function vbWertung(stufe: number, treffer: number, fehler: number, zeitMs: number): Rohergebnis {
  const st = vbStufe(stufe)
  const klicks = treffer + fehler
  const jeKreis = treffer ? (zeitMs + fehler * VB_STRAFE_MS) / treffer : 0
  return {
    leistung: tempoGuete(klicks ? treffer / klicks : 0, treffer ? tempoAus(jeKreis, st.gutMs, st.langsamMs) : 0),
    richtig: treffer,
    gesamt: klicks,
    rtMs: treffer ? Math.round(jeKreis) : undefined,
    text: treffer ? `Ø ${kommaZahl(jeKreis / 1000, 2)} s je Kreis${fehler ? ` · ${fehler} ${fehler === 1 ? 'Fehlklick' : 'Fehlklicks'}` : ''}` : 'kein Kreis getroffen',
  }
}
