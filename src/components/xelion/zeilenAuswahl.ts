// ── Zeilenauswahl wie in Excel ──────────────────────────────────────────────
//
// Reine Logik, bewusst ohne Oberfläche: wer welche Zeilen ausgewählt hat, entscheidet
// darüber, auf welche Zeilen eine Sammel-Aktion wirkt. Das soll prüfbar sein.
//
// Verhalten:
//   · Klick               → genau diese Zeile (alles andere fällt weg)
//   · Strg + Klick        → diese Zeile dazu bzw. weg, der Rest bleibt
//   · Umschalt + Klick    → Bereich vom Anker bis hierher (ersetzt die Auswahl)
//   · Strg + Umschalt     → Bereich zusätzlich zur bestehenden Auswahl
//
// Der **Anker** ist die letzte ohne Umschalt angeklickte Zeile — genau wie in Excel
// bleibt er bei Umschalt-Klicks stehen, damit man den Bereich nachziehen kann.
//
// Ausgewählt wird über die **Durchwahl**, nicht über die Zeilennummer: Farbmarkierungen
// hängen ebenfalls an der Durchwahl, sonst würden Auswahl und Wirkung auseinanderlaufen.

export interface Modifikatoren {
  strg: boolean
  shift: boolean
}

export interface AuswahlStand {
  auswahl: Set<string>
  anker: string | null
}

export function leereAuswahl(): AuswahlStand {
  return { auswahl: new Set(), anker: null }
}

/**
 * `sichtbar` ist die Reihenfolge der aktuell angezeigten Zeilen — der Umschalt-Bereich
 * richtet sich nach dem, was man sieht, nicht nach der ursprünglichen Liste.
 */
export function naechsteAuswahl(
  stand: AuswahlStand, sichtbar: string[], geklickt: string, mod: Modifikatoren,
): AuswahlStand {
  if (!geklickt) return stand

  if (mod.shift && stand.anker) {
    const a = sichtbar.indexOf(stand.anker)
    const b = sichtbar.indexOf(geklickt)
    // Ist der Anker nicht mehr sichtbar (Filter geändert), verhält sich Umschalt wie
    // ein einfacher Klick — ein Bereich ohne Anfang wäre geraten.
    if (a < 0 || b < 0) return { auswahl: new Set([geklickt]), anker: geklickt }
    const bereich = sichtbar.slice(Math.min(a, b), Math.max(a, b) + 1)
    const auswahl = mod.strg ? new Set([...stand.auswahl, ...bereich]) : new Set(bereich)
    return { auswahl, anker: stand.anker }
  }

  if (mod.strg) {
    const auswahl = new Set(stand.auswahl)
    if (auswahl.has(geklickt)) auswahl.delete(geklickt); else auswahl.add(geklickt)
    return { auswahl, anker: geklickt }
  }

  return { auswahl: new Set([geklickt]), anker: geklickt }
}

/**
 * Auswahl auf die sichtbaren Zeilen eindampfen. Wird nach jeder Filteränderung
 * aufgerufen: eine Sammel-Aktion darf nie Zeilen treffen, die man gerade nicht sieht —
 * das ist in einem Werkzeug, an dessen Ende eine Kündigung steht, die gefährliche Richtung.
 * Gibt `null` zurück, wenn sich nichts ändert (dann kein neuer Zustand, kein Neuzeichnen).
 */
export function aufSichtbareKuerzen(stand: AuswahlStand, sichtbar: string[]): AuswahlStand | null {
  if (stand.auswahl.size === 0 && stand.anker === null) return null
  const da = new Set(sichtbar)
  const bleibt = [...stand.auswahl].filter(d => da.has(d))
  const ankerBleibt = stand.anker && da.has(stand.anker) ? stand.anker : null
  if (bleibt.length === stand.auswahl.size && ankerBleibt === stand.anker) return null
  return { auswahl: new Set(bleibt), anker: ankerBleibt }
}

/** Alle sichtbaren Zeilen auswählen (Anker auf die erste, damit Umschalt weiterarbeitet). */
export function alleSichtbaren(sichtbar: string[]): AuswahlStand {
  return { auswahl: new Set(sichtbar), anker: sichtbar[0] ?? null }
}
