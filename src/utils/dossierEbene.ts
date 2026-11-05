// ── Stapelreihenfolge der „i"-Fenster (Personen-, Geräte-, Drucker-Dossier) ──────
// Die drei Fenster werden nebeneinander in App.tsx gezeichnet (…DossierSlot). Damit beim
// Öffnen aus einem anderen Fenster heraus (Person → Gerät → Person …) immer das ZULETZT
// geöffnete oben liegt, bekommt jedes Öffnen eine fortlaufende Ebene.

let ebene = 0

/** Nächste Ebene für ein gerade geöffnetes Dossier-Fenster. */
export function naechsteEbene(): number {
  return ++ebene
}

/** z-index über allen normalen Dialogen (z-50/z-[60]) — „i" wird oft aus Dialogen heraus geöffnet. */
export function dossierZIndex(e: number): number {
  return 1000 + e
}
