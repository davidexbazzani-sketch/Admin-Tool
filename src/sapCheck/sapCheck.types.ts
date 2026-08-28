// ── SAP-Fehlersuche: Datenmodell ─────────────────────────────────────────────
// Ein Befund = eine bewertete Prüfung mit Messwert, Erwartung, Bewertung,
// Begründung, Empfehlung und Rohdaten. `unbekannt` ist ein vollwertiges Ergebnis
// und trägt IMMER einen Grund (WinRM weg, Zugriff verweigert, Datei fehlt …).

export type SapBewertung = 'ok' | 'hinweis' | 'warnung' | 'fehler' | 'unbekannt'

export type SapKategorie =
  | 'Anmeldung'         // I (Kerberos/SNC/Hello — höchste Ursachen-Priorität)
  | 'Installation'      // A
  | 'Konfiguration'     // B
  | 'Ressourcen'        // C
  | 'Netzwerk'          // D
  | 'Drucken'           // E
  | 'Ereignisse'        // F
  | 'Traces'            // G
  | 'Browser'           // H

export interface SapBefund {
  id: string
  kategorie: SapKategorie
  titel: string
  quelle: string              // woher der Wert stammt (Registry/Datei/PowerShell/…)
  wert: string                // gemessener Wert (menschenlesbar)
  erwartung: string           // Erwartungswert / Referenz
  bewertung: SapBewertung
  begruendung: string
  empfehlung?: string
  vergleichbar: boolean        // taugt der Wert für den Zwei-PC-Vergleich?
  rawData?: string             // Rohausgabe (Log/Registry/Skript) zum Aufklappen
  belege?: string[]            // Ticketnummern (INC…) — „Bekannt aus …" (aus rules.ts)
}

export interface SapScanMeta {
  toolVersion: string
  dauerMs: number
  winrm: 'ok' | 'aktiviert' | 'fehler'
  angemeldeterBenutzer?: string
}

export interface SapScan {
  pc: string
  ranAt: string               // ISO
  ranBy: string
  befunde: SapBefund[]
  meta: SapScanMeta
}

/** Zusammenfassung nach Schweregrad (für die Ampel). */
export interface SapAmpel {
  fehler: number
  warnung: number
  hinweis: number
  ok: number
  unbekannt: number
}

export function ampelOf(befunde: SapBefund[]): SapAmpel {
  const a: SapAmpel = { fehler: 0, warnung: 0, hinweis: 0, ok: 0, unbekannt: 0 }
  for (const b of befunde) a[b.bewertung]++
  return a
}

/** Sortier-Rang: Fehler zuerst, ok/unbekannt zuletzt. */
export const BEWERTUNG_RANG: Record<SapBewertung, number> = {
  fehler: 0, warnung: 1, hinweis: 2, unbekannt: 3, ok: 4,
}

// Anzeige-/Prüfreihenfolge nach Häufigkeit der TATSÄCHLICHEN Ursachen (Phase 6):
// Kerberos/SNC → Zscaler-Anmeldestatus → Konfigurationsfreigabe → Windows-Updates/
// Neustart → Energie → SAP-GUI/Optionen → Rest. Kleiner = weiter oben.
const URSACHE_PREFIXE: string[] = [
  'anmeldung.ticket', 'net.kerberos', 'anmeldung.hello', 'anmeldung.',  // Kerberos/SNC/Anmeldung
  'res.zscaler', 'net.zscaler',                                         // Zscaler-Anmeldestatus
  'config.share', 'config.central', 'config.compare', 'config.include', // Konfigurationsfreigabe
  'res.updates', 'res.reboot',                                          // Windows-Updates/Neustart
  'res.power',                                                          // Energie
  'install.', 'config.',                                               // SAP-GUI/Optionen
]
/** Ursachen-Priorität eines Befunds (kleiner = wichtiger); unbekannte IDs ans Ende. */
export function ursachePrio(id: string): number {
  const i = URSACHE_PREFIXE.findIndex(p => id.startsWith(p))
  return i === -1 ? URSACHE_PREFIXE.length : i
}

/** IDs/Kategorien, die für die „erste drei Kategorien"-Folgefehler-Regel zählen. */
export function istKernursache(b: SapBefund): boolean {
  return b.id.startsWith('anmeldung.ticket') || b.id.startsWith('net.kerberos') ||
    b.id.startsWith('res.zscaler') || b.id.startsWith('config.share') || b.id.startsWith('config.central')
}

/** Sortierung für die Ergebnisliste: erst Schwere, dann Ursachen-Priorität. */
export function sortBefunde(befunde: SapBefund[]): SapBefund[] {
  return [...befunde].sort((x, y) =>
    (BEWERTUNG_RANG[x.bewertung] - BEWERTUNG_RANG[y.bewertung]) || (ursachePrio(x.id) - ursachePrio(y.id)))
}

// ── Vergleich ─────────────────────────────────────────────────────────────────
export interface SapVergleichZeile {
  id: string
  kategorie: SapKategorie
  titel: string
  wertA: string
  wertB: string
  bewertungA: SapBewertung
  bewertungB: SapBewertung
  unterschied: boolean          // Werte weichen ab (nur wenn beide vergleichbar)
  nichtVergleichbar: boolean     // mind. einer ist unbekannt / nicht vergleichbar
  beideAuffaellig: boolean       // „gemeinsamer Nenner"
}

export interface SapVergleich {
  a: { pc: string; ranAt: string }
  b: { pc: string; ranAt: string }
  zeilen: SapVergleichZeile[]
  massenereignis: SapVergleichZeile[]   // beide auffällig bei Kerberos/SNC/DNS/Config-Freigabe
}

/** Eintrag im Verlauf/Index (Metadaten, keine Rohinhalte). */
export interface SapScanIndexItem {
  id: string
  pc: string
  ranAt: string
  ranBy: string
  ampel: SapAmpel
  isBaseline?: boolean
}
