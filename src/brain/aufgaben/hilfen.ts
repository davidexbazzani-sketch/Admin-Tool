// Gemeinsame Helfer für Aufgaben-Generatoren.
import type { Darstellung, Frage } from '../kern/typen'
import { T } from '../kern/typen'
import type { Rng } from '../kern/zufall'

/** Richtige Antwort + falsche mischen. Doppelte (gleicher Schlüssel) fliegen raus. */
export function mischeAuswahl<A>(r: Rng, richtig: A, falsche: A[], zeige: (a: A) => Darstellung, schluessel: (a: A) => string, anzahl: number): { optionen: Darstellung[]; richtig: number } {
  const gesehen = new Set([schluessel(richtig)])
  const rest: A[] = []
  for (const f of falsche) {
    const k = schluessel(f)
    if (gesehen.has(k)) continue
    gesehen.add(k); rest.push(f)
    if (rest.length >= anzahl - 1) break
  }
  const alle = r.misch([{ a: richtig, ok: true }, ...rest.map(a => ({ a, ok: false }))])
  return { optionen: alle.map(x => zeige(x.a)), richtig: alle.findIndex(x => x.ok) }
}

/**
 * Zahlen-Auswahl: richtige Zahl + plausible falsche, aufsteigend sortiert (so verrät die Position nichts).
 * `kandidaten` sind bevorzugte Fallen (z. B. Ergebnis einer falschen Regel); fehlt etwas, kommen Nachbarn dazu.
 */
export function zahlAuswahl(r: Rng, richtig: number, kandidaten: number[], anzahl = 5, nurPositiv = false): { optionen: Darstellung[]; richtig: number } {
  const menge = new Set<number>([richtig])
  const nimm = (x: number) => { if (Number.isFinite(x) && Number.isInteger(x) && (!nurPositiv || x >= 0) && menge.size < anzahl) menge.add(x) }
  for (const k of r.misch(kandidaten)) nimm(k)
  const schritt = Math.max(1, Math.round(Math.abs(richtig) * 0.08))
  let i = 1
  while (menge.size < anzahl && i < 60) {
    nimm(richtig + (r.chance(0.5) ? 1 : -1) * (r.chance(0.5) ? i : i * schritt))
    i++
  }
  const sortiert = [...menge].sort((a, b) => a - b)
  return { optionen: sortiert.map(z => T(zahlText(z))), richtig: sortiert.indexOf(richtig) }
}

/** Zahl deutsch schreiben (Dezimalkomma, echtes Minuszeichen) */
export function zahlText(z: number, stellen = 2): string {
  const gerundet = Math.round(z * 10 ** stellen) / 10 ** stellen
  return String(gerundet).replace('.', ',').replace('-', '−')
}

/** Eingabe mit Lösungen vergleichen (ohne Groß/Klein, Leerzeichen, Punkt statt Komma, Minus-Varianten) */
export function normEingabe(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/\./g, ',')
}
export function eingabeRichtig(f: Pick<Frage, 'loesungen'>, eingabe: string): boolean {
  const e = normEingabe(eingabe)
  return !!e && (f.loesungen ?? []).some(l => normEingabe(l) === e)
}

/** Auswahl aus Texten (richtig + falsche), gemischt */
export function textAuswahl(r: Rng, richtig: string, falsche: string[], anzahl = 4): { optionen: Darstellung[]; richtig: number } {
  return mischeAuswahl(r, richtig, r.misch(falsche), T, s => s.trim().toLowerCase(), anzahl)
}
