// Keine Aufgabe zweimal: innerhalb eines Durchgangs nie, über Durchgänge hinweg möglichst nicht.
//
// Jede Aufgabe kommt aus ihrem eigenen Zufalls-Zweig (Startwert + Nummer). Bei Aufgaben mit kleinem Vorrat
// (z. B. Wort-Analogien: einige Dutzend je Stufe) träfe der Zufall sonst oft dieselbe Aufgabe noch einmal.
// Deshalb: Ist die gezogene Aufgabe schon dran gewesen, wird aus einem Neben-Zweig neu gezogen.
// Das bleibt berechenbar — gleicher Startwert = gleiche Folge, also bekommen im Duell beide dasselbe.
import type { Frage, FragenGenerator } from '../kern/typen'
import { hash32, rng } from '../kern/zufall'

const VERSUCHE = 12

/** Woran man „dieselbe Aufgabe“ erkennt: Aufgabentext + Gezeigtes. Zeigt eine Aufgabe nichts, zählt die Auswahl (ohne Reihenfolge). */
export function frageKennung(f: Frage): string {
  const gezeigt = f.zeige || f.vorab
  return JSON.stringify([f.aufgabe, f.zeige ?? null, f.vorab?.zeige ?? null, gezeigt ? null : f.optionen.map(o => JSON.stringify(o)).sort()])
}

export interface Gezogen { frage: Frage; kennung: string; hash: number }

/**
 * Zieht die Aufgabe für `salz` (meist die laufende Nummer).
 * @param imLauf   Kennungen, die in diesem Durchgang schon dran waren — werden nie wiederholt, solange der Vorrat reicht
 * @param vermeide Hashes zuletzt gesehener Aufgaben aus früheren Durchgängen — werden gemieden, wenn es anders geht
 */
export function zieheFrage(erzeuge: FragenGenerator, start: number, stufe: number, salz: number | string, imLauf: ReadonlySet<string>, vermeide?: ReadonlySet<number>): Gezogen {
  let ersatz: Gezogen | null = null   // neu in diesem Durchgang, aber kürzlich gesehen
  let letzte: Gezogen | null = null
  for (let v = 0; v < VERSUCHE; v++) {
    const frage = erzeuge(rng(start).zweig(v === 0 ? salz : `${salz}/${v}`), stufe)
    const kennung = frageKennung(frage)
    const z: Gezogen = { frage, kennung, hash: hash32(kennung) }
    letzte = z
    if (imLauf.has(kennung)) continue
    if (!vermeide?.has(z.hash)) return z
    ersatz ??= z
  }
  return ersatz ?? letzte!
}

/** Zieht eine ganze Folge (Nummern 0 … anzahl−1) — für Tests und überall, wo die Folge vorab gebraucht wird. */
export function zieheFolge(erzeuge: FragenGenerator, start: number, stufe: number, anzahl: number, vermeide?: ReadonlySet<number>): Gezogen[] {
  const imLauf = new Set<string>()
  const aus: Gezogen[] = []
  for (let nr = 0; nr < anzahl; nr++) {
    const z = zieheFrage(erzeuge, start, stufe, nr, imLauf, vermeide)
    imLauf.add(z.kennung)
    aus.push(z)
  }
  return aus
}
