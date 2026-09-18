// ── OT-Geräte aus Checklisten aktuell halten — DEPRECATED / Shim ─────────────
// Die Marker-Umschreibung beim Geräte-Refresh läuft jetzt zentral über
// moveDeviceOnAllMaps() in deviceMaps.ts: über ALLE drei Karten (OT-Geräte,
// Prüffeld & Zoll, Verwaltungsgebäude) und das Neugerät heißt IMMER „DE" +
// Seriennummer (das alte Präfix DEHAM/DESCH wird NICHT übernommen).
//
// Frühere Version hier hatte zwei Fehler: sie behielt das alte Präfix (DEHAM →
// DEHAM statt DE) und arbeitete nur auf der OT-Karte. Dieser Shim delegiert
// deshalb auf die korrekte Logik, damit kein Alt-Import das falsche Verhalten
// wiederbelebt. Nicht mehr aktiv verwendet.

import { moveDeviceOnAllMaps } from './deviceMaps'

export interface OtReplaceResult { updated: number; entries: { alt: string; neu: string; arbeitsplatz: string }[] }

/** @deprecated Bitte moveDeviceOnAllMaps() verwenden (alle Karten, immer „DE"+Serial). */
export async function replaceOtDevice(oldDeviceId: string, newDeviceSerial: string): Promise<OtReplaceResult> {
  const moved = await moveDeviceOnAllMaps(oldDeviceId, newDeviceSerial)
  const entries = moved.flatMap(m => m.entries)
  return { updated: entries.length, entries }
}
