// ── Spaltenfilter mit Excel-Zählwerten ──────────────────────────────────────
//
// Das Problem, das dieser Helfer löst: In den Filterlisten standen bisher die Zahlen der
// GESAMTEN Tabelle. Hakte man in der Endgeräte-Übersicht zwei Modelltypen an (415 Zeilen),
// zeigte die Status-Liste weiter „In use 604" — eine Zahl, die in 415 Zeilen gar nicht
// vorkommen kann.
//
// Naheliegend wäre, einfach alle Filter mitzuzählen. Das ist aber falsch: dann fielen in
// der Modelltyp-Liste alle NICHT gewählten Typen auf 0 und man könnte die Auswahl nicht
// mehr erweitern. Richtig ist die Excel-Regel:
//
//   **Jede Spalte zählt über alle ANDEREN Filter — ihren eigenen rechnet sie nicht mit.**
//
// Zusätzlich wird jeder Wert der Grundmenge mit 0 vorbelegt. Die angebotene Werteliste
// ändert sich dadurch nie, nur die Zahlen; ein angehakter Wert kann nie aus der Liste
// verschwinden, und man sieht auch, dass es einen Wert gibt, zu dem es gerade keine Zeile
// gibt.
//
// Die Spalten werden EINMAL deklariert — Zählen und Filtern benutzen denselben Ausleser.
// Vorher stand beides je Spalte getrennt im Code und wich stellenweise voneinander ab.

export interface Spalte<T> {
  id: string
  /**
   * Die Werte, unter denen die Zeile in dieser Spalte zählt. Eine LISTE, weil eine Zeile
   * mehrfach zählen kann (z. B. ein Benutzer mit mehreren Hostnamen). Leerer String ist
   * ein zulässiger Wert („(leer)" in der Anzeige).
   */
  werte: (z: T) => string[]
  /**
   * Die angehakten Werte. Leere Menge = diese Spalte filtert nicht — dieselbe Bedeutung
   * wie im bestehenden ColumnFilter.
   */
  gewaehlt: Set<string>
}

export interface SpaltenErgebnis<T> {
  /** Suche + alle Spaltenfilter angewandt — das, was die Tabelle zeigt. */
  zeilen: T[]
  /** Je Spalten-Id: Wert → Anzahl, gezählt über alle anderen Filter. */
  werte: Record<string, Map<string, number>>
}

/** Die Zeile passt zu dieser Spalte, sobald EINER ihrer Werte angehakt ist. */
function passt<T>(s: Spalte<T>, z: T): boolean {
  if (s.gewaehlt.size === 0) return true
  return s.werte(z).some(v => s.gewaehlt.has(v))
}

/**
 * @param suche Zusätzliche Bedingung (die freie Textsuche). Sie gilt IMMER — auch für die
 *              Zählwerte, denn sie schränkt die Tabelle sichtbar ein.
 */
export function spaltenFilter<T>(
  grundmenge: T[], spalten: Spalte<T>[], suche?: (z: T) => boolean,
): SpaltenErgebnis<T> {
  const trifftSuche = suche ?? (() => true)

  const zeilen = grundmenge.filter(z => trifftSuche(z) && spalten.every(s => passt(s, z)))

  // Vorbelegung: jeder vorkommende Wert mit 0, damit die Liste stabil bleibt.
  const werte: Record<string, Map<string, number>> = {}
  for (const s of spalten) {
    const m = new Map<string, number>()
    for (const z of grundmenge) for (const v of s.werte(z)) m.set(v, 0)
    werte[s.id] = m
  }

  // Je Spalte eine eigene Grundmenge: alle anderen Filter gelten, die eigene nicht.
  for (const s of spalten) {
    const m = werte[s.id]
    for (const z of grundmenge) {
      if (!trifftSuche(z)) continue
      if (!spalten.every(x => x.id === s.id || passt(x, z))) continue
      for (const v of s.werte(z)) m.set(v, (m.get(v) ?? 0) + 1)
    }
  }

  return { zeilen, werte }
}
