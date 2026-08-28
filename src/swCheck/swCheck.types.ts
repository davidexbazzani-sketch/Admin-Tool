// ── SolidWorks-Diagnose: Datenmodell ─────────────────────────────────────────
// Ein Lauf = ein Ziel-PC zu einem Zeitpunkt, mit den Ergebnissen der gewählten
// Skripte. Jedes Skript liefert TextBericht + strukturierte Daten (inkl. der vom
// Skript bereits fertig gerechneten Auffälligkeiten und Kennwerte).

export interface SwSkript {
  id: string
  titel: string
  datei: string                         // .ps1 unter public/diagnose/solidworks/
  ziel: 'client' | 'server'
  ausgaben: ('txt' | 'json')[]
  standard: boolean
  parameter?: Record<string, string>    // z. B. { Server: 'w3143' }
  remoteArgs?: string                    // zusätzliche PS-Schalter beim Remote-Aufruf (literal)
  timeoutMs?: number                     // Skript-spezifischer Timeout (Default 180s)
  fileBased?: boolean                    // schwere Skripte: in-shell mit -Ausgabeordner laufen lassen,
                                         // Ergebnis aus der Ziel-Datei lesen (Skript serialisiert selbst,
                                         // -Depth 8; vermeidet die langsame Wrapper-Serialisierung)
}

/** Vom PS-Skript gelieferte Kennwerte (für den Sammel-Export, Kapitel 3). */
export interface SwKennwerte {
  swVersion?: string
  benutzer?: string
  ip?: string
  toolboxPfad?: string
  autoRecover?: string
  backupPfad?: string
  defenderSw?: boolean
  defenderPortaX?: boolean
  energieplan?: string
  adapterEnergie?: string
  latenzW3143?: number | null
  cFreiPct?: number | null
  gpu?: string
  uptimeTage?: number | null
  abstuerze30d?: number | null
  [k: string]: unknown
}

export interface SwDaten {
  Auffaelligkeiten?: string[]
  Kennwerte?: SwKennwerte
  Benutzerstatus?: string
  [k: string]: unknown
}

export interface SwSkriptResult {
  id: string
  titel: string
  ziel: 'client' | 'server'
  ok: boolean
  textBericht: string
  daten?: SwDaten
  fehler?: string
  dauerMs: number
}

export interface SwLauf {
  id: string
  pc: string
  ranAt: string                 // ISO
  ranBy: string
  dauerMs: number
  toolVersion: string
  winrm: 'ok' | 'fehler'
  skripte: SwSkriptResult[]
  auffaelligkeiten: string[]    // aggregiert über alle Skripte (dedupliziert)
  kennwerte?: SwKennwerte       // aus dem Client-Skript
  fehler?: string               // Gesamtfehler (z. B. Vorprüfung fehlgeschlagen)
}

export interface SwLaufIndexItem {
  id: string
  pc: string
  dir: string                   // Ablageordner relativ zur Basis
  ranAt: string
  ranBy: string
  auffaelligkeiten: number
  swVersion?: string
  benutzer?: string
  skripte: string[]
  isReferenz?: boolean
}

export interface SwFortschritt {
  id: string                    // skript-id
  titel: string
  status: 'wartet' | 'läuft' | 'fertig' | 'fehler'
}
