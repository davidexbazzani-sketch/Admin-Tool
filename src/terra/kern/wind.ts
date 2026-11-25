// Terra Incognita — Wind: dreht jeden Kalendertag, für alle Kollegen gleich, je Gebiet verschieden.
import { drehung, RICHTUNG_NAME } from './hex'
import { streu } from './streu'

export interface Wind {
  /** wohin der Wind weht (Richtung 0 … 5) */
  richtung: number
  /** 1 = leichte Brise, 2 = frische Brise, 3 = steifer Wind */
  staerke: 1 | 2 | 3
}

const S_WIND = 7001

/** Wind eines Gebiets an einem Tag (tag = Tagesnummer in Berliner Zeit) */
export function windIn(gebiet: number, tag: number): Wind {
  const w = streu(gebiet, tag, S_WIND)
  const s = (w >>> 9) % 10
  return { richtung: w % 6, staerke: s < 2 ? 1 : s < 8 ? 2 : 3 }
}

/** Stunden für ein Feld bei Grundtempo: [mit dem Wind, schräg von hinten, schräg von vorn, gegen den Wind] */
const STUNDEN: readonly (readonly number[])[] = [[], [11, 11, 13, 14], [8, 10, 14, 19], [7, 9, 17, 24]]
/** die schnellste denkbare Stundenzahl je Feld (für die Wegsuche) */
export const STUNDEN_MIN = 7

export function feldStunden(kurs: number, wind: Wind): number {
  return STUNDEN[wind.staerke][drehung(kurs, wind.richtung)]
}

export const WIND_STAERKE: readonly string[] = ['', 'leichte Brise', 'frische Brise', 'steifer Wind']
/** „aus Nordwest“ — Seeleute nennen die Richtung, aus der der Wind kommt */
export const windAus = (w: Wind): string => RICHTUNG_NAME[(w.richtung + 3) % 6]
export const windText = (w: Wind): string => `${WIND_STAERKE[w.staerke]} aus ${windAus(w)}`
