// ── PC-Volldiagnose: gemeinsame Typen ────────────────────────────────────────
// Ablauf: Stufe 0 (Ziel lesen) → Stufe 1 (Rundumscan) → Vertiefungen → Ursachenbild →
// Maßnahmenplan. Alles bis zum Maßnahmenplan LIEST nur; eingegriffen wird erst nach der
// Bestätigung im Maßnahmenplan (Server: zusätzlich Hostname eintippen).

import type { DgFakten, DgPunkt } from '../problemAssistent/diagnose/types'

export type VdSchwere = 'kritisch' | 'warnung' | 'hinweis'
export const SCHWERE_RANG: Record<VdSchwere, number> = { kritisch: 0, warnung: 1, hinweis: 2 }

export type VdGeraet = 'pc' | 'server'

export type VdBereich =
  | 'stabilitaet' | 'integritaet' | 'updates' | 'datentraeger' | 'hardware' | 'dienste' | 'netz'
  | 'sicherheit' | 'leistung' | 'programme' | 'profil' | 'drucken' | 'server' | 'sonstiges'
export const BEREICH_TEXT: Record<VdBereich, string> = {
  stabilitaet: 'Stabilität', integritaet: 'Windows-Integrität', updates: 'Windows Update', datentraeger: 'Datenträger',
  hardware: 'Hardware & Treiber', dienste: 'Dienste & Aufgaben', netz: 'Netzwerk & Domäne', sicherheit: 'Sicherheit',
  leistung: 'Leistung & Speicher', programme: 'Programme', profil: 'Benutzer & Profil', drucken: 'Drucken',
  server: 'Server-Rollen', sonstiges: 'Sonstiges',
}

/** Fachdiagnosen, an die die Volldiagnose übergibt (vorhandene Werkzeuge der PC-Diagnose). */
export type VdFachdiagnose = 'netzdiagnose' | 'sap-fehlersuche' | 'solidworks-diagnose'
export const FACH_TEXT: Record<VdFachdiagnose, string> = {
  'netzdiagnose': 'Netzwerk-Diagnose', 'sap-fehlersuche': 'SAP Fehlersuche', 'solidworks-diagnose': 'SolidWorks Diagnose',
}

/** Stufe 0: was über das Ziel bekannt ist (nur gelesen). */
export interface VdZiel {
  host: string
  online: boolean
  winrm: boolean
  geraet: VdGeraet
  /** steht in der Server-Liste (Server-Monitor/Inventar) */
  bekannterServer: boolean
  produktTyp?: number
  os?: string
  build?: string
  boot?: string
  benutzer?: string
  sam?: string
  sitzung?: string
  gesperrt?: boolean
  modell?: string
  seriennummer?: string
  domaene?: string
  fehler?: string
}

/** Reihenfolge der Maßnahmen (Abhängigkeiten: erst sichern, dann Platz, dann Speicher → Dateien …). */
export type VdPhase = 'sicherung' | 'platz' | 'dateisystem' | 'komponenten' | 'systemdateien' | 'updates' | 'treiber' | 'dienste' | 'konfiguration' | 'programme' | 'neustart'
export const PHASEN: VdPhase[] = ['sicherung', 'platz', 'dateisystem', 'komponenten', 'systemdateien', 'updates', 'treiber', 'dienste', 'konfiguration', 'programme', 'neustart']
export const PHASE_TEXT: Record<VdPhase, string> = {
  sicherung: 'Daten sichern', platz: 'Speicherplatz', dateisystem: 'Dateisystem', komponenten: 'Komponentenspeicher', systemdateien: 'Systemdateien',
  updates: 'Windows Update', treiber: 'Treiber & Geräte', dienste: 'Dienste', konfiguration: 'Einstellungen', programme: 'Programme', neustart: 'Neustart',
}

export interface VdSchritt { aktion: string; param?: string; titel?: string; optional?: boolean }

export type VdLoesungsArt = 'aktionen' | 'problem' | 'werkzeug' | 'hinweis'

/** Ein Lösungsweg. art „aktionen“/„problem“ greifen in Schritt 2 ein, „werkzeug“ öffnet ein Werkzeug, „hinweis“ beschreibt Handarbeit. */
export interface VdLoesung {
  id: string
  titel: string
  art: VdLoesungsArt
  /** Bausteine (IDs aus problemAssistent/aktionen.ts) — bei „problem“ aus dem Katalog übernommen. */
  schritte?: VdSchritt[]
  /** Katalogproblem (src/problemAssistent/katalog) */
  problem?: string
  /** Werkzeug (WERKZEUGE in aktionen.ts bzw. Fachdiagnose) */
  werkzeug?: string
  /** Handarbeit / Zuständigkeit (Hardware-Tausch, Domänen-Admin, DBA …) */
  hinweis?: string
  /** Was sich ändert bzw. was zu tun ist — Klartext für den Bestätigungsdialog. */
  wirkung: string
  phase: VdPhase
  dauer?: string
  /** Danach ist ein Neustart nötig (der Plan hängt EINEN Neustart ans Ende). */
  neustart?: boolean
  /** Eingabe, die Schritte mit „{eingabe}“ brauchen */
  frage?: { label: string; platzhalter: string; vorbelegt?: string }
  /** Nur auf diesem Gerätetyp anbieten (z. B. Server-Hinweise nicht am PC) */
  nur?: VdGeraet
}

/** Ein konkreter Fund dieses Laufs. */
export interface VdBefund {
  id: string
  /** Befund-Typ: Katalog-Schlüssel („integ-…“, „evt:…“, „v1-…“) oder „dg:<problem>“ (Regel der geführten Diagnose) */
  typ: string
  schwere: VdSchwere
  bereich: VdBereich
  titel: string
  /** Ergebnis in Klartext (was genau gefunden wurde) */
  text: string
  belege: string[]
  /** Prüfung bzw. Vertiefung, die den Befund geliefert hat */
  quelle: string
  ursacheOffen: boolean
  /** Vertiefungen, die die Ursache klären können */
  vertiefungen: string[]
  fachdiagnose?: VdFachdiagnose
  loesungen: VdLoesung[]
  problem?: string
  /** Aus der Vertiefung dieses Befunds (Belegkette) */
  eltern?: string
  /** Folge dieser Ursache (Ursachenbild) */
  folgeVon?: string
  /** Sonden, aus deren Messwerten der Befund stammt (für die Nachprüfung) */
  sonden?: string[]
  anzahl?: number
  zuerst?: string
  zuletzt?: string
  /** Seit der letzten Volldiagnose neu */
  neu?: boolean
  /** Passt zur vorab gewählten Richtung */
  passend?: boolean
  /** Ergebnis der Nachprüfung nach einer Maßnahme */
  nach?: 'behoben' | 'offen' | 'unklar'
}

/** Rohbefund einer Prüfung — der Katalog ergänzt Titel, Schwere, Bereich und Lösungen. */
export interface VdRoh {
  typ: string
  text: string
  belege?: string[]
  /** Schwere aus der Auswertung — mindestens die des Katalogs (der Katalog ist die Untergrenze) */
  schwere?: VdSchwere
  /** Genaue Schwere aus einer Vertiefung (überschreibt den Katalog, darf auch milder sein) */
  schwereFest?: VdSchwere
  titel?: string
  anzahl?: number
  zuerst?: string
  zuletzt?: string
  /** Parameter für Lösungsschritte („{eingabe}“), z. B. Dienstname */
  eingabe?: string
  /** dynamische Lösungen (zusätzlich bzw. statt Katalog) */
  loesungen?: VdLoesung[]
  problem?: string
  fachdiagnose?: VdFachdiagnose
  sonden?: string[]
  bereich?: VdBereich
  ursacheOffen?: boolean
  vertiefungen?: string[]
  /** Suchtext für den Problem-Katalog (wird vor dem Bauen des Befunds in `problem` aufgelöst) */
  suche?: string
  /** Passt zur gewählten Richtung */
  passend?: boolean
}

export type VdPruefStatus = 'wartet' | 'laeuft' | 'ok' | 'auffaellig' | 'fehler' | 'uebersprungen'
export interface VdPruefung {
  id: string
  titel: string
  bereich: VdBereich
  art: 'rundum' | 'vertiefung' | 'kontext'
  status: VdPruefStatus
  grund?: string
  dauerMs?: number
  punkte?: DgPunkt[]
  befunde?: number
}

/** Ursachenbild: bereichsübergreifende Erklärung mehrerer Befunde. */
export interface VdUrsache {
  id: string
  titel: string
  text: string
  belege: string[]
  /** Befund-IDs, die diese Ursache erklärt */
  befunde: string[]
  /** Hauptbefund (dessen Lösung zuerst kommt) */
  haupt?: string
  /** Phasen, deren Reparaturen bis zur Behebung der Ursache gesperrt sind (z. B. Platte defekt → keine DISM/SFC) */
  sperrt?: VdPhase[]
  /** Muss vor allem anderen behoben werden (z. B. Neustart) — andere Maßnahmen erst danach */
  zuerst?: boolean
  gewicht: number
}

export type VdMassStatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'uebersprungen'
export interface VdMassnahme {
  id: string
  loesung: VdLoesung
  befunde: string[]
  empfohlen: boolean
  gewaehlt: boolean
  gesperrt?: string
  eingabe?: string
  status: VdMassStatus
  zeilen?: string[]
  fehler?: string
  nachpruefung?: 'behoben' | 'offen' | 'unklar'
  nachText?: string
}

export interface VdKontext {
  /** Änderungsverlauf des PCs (letzte 30 Tage) */
  aenderungen: { am: string; kat: string; text: string }[]
  /** Proaktive Fehlersuche: letzter Stand */
  pcFehler?: { am: string; titel: string[] }
  /** Letzte Volldiagnose */
  vorher?: { am: string; typen: string[]; von: string }
}

/** Vor dem Start gewählte Richtung („ungefähr bekannt, worum es geht“). */
export interface VdRichtung {
  /** eingetippte Beschreibung */
  text?: string
  /** Oberthemen der geführten Diagnose (DgOber-IDs) */
  themen: string[]
  /** Unterthemen (DgUnter-IDs) */
  unter: string[]
  /** gewählter Vorschlag aus dem Problem-Katalog */
  problem?: string
}

export type VdLaufPhase = 'verbinden' | 'rundum' | 'vertiefen' | 'fertig' | 'abgebrochen' | 'fehler'

export interface VdLauf {
  id: string
  host: string
  von: string
  start: number
  ende?: number
  tage: number
  autoVertiefen: boolean
  richtung?: VdRichtung
  phase: VdLaufPhase
  ziel?: VdZiel
  fehler?: string
  pruefungen: VdPruefung[]
  befunde: VdBefund[]
  fakten: DgFakten
  ursachen: VdUrsache[]
  massnahmen: VdMassnahme[]
  /** Vertiefungen: laufend / fertig (IDs) */
  vertiefungLaeuft: string[]
  vertiefungFertig: string[]
  kontext?: VdKontext
  ausfuehrung?: { laeuft: boolean; start: number; ende?: number; nachpruefung?: 'laeuft' | 'fertig'; bestaetigtVon?: string; neustartAusgeloest?: boolean }
  abbruch?: boolean
  /** Ablage auf dem Netzlaufwerk (diagnose/voll/<HOST>/<Datum>.json) */
  datei?: string
  /** aus der PC-Suche: zugewiesene Person / Seriennummer (Dossier-Protokoll) */
  person?: string
  serial?: string
}

/** Definition einer Vertiefung (gezielter Lese-Scan). */
export interface VdVertiefung {
  id: string
  titel: string
  beschreibung: string
  last: 'leicht' | 'schwer'
  dauer: string
  geraet: 'pc' | 'beide'
  timeoutMs: number
  /** PowerShell (nur lesend!) und Nutzlast ($P) */
  skript: (ctx: VdVertiefKontext) => { ps: string; payload?: unknown }
  auswerten: (roh: Record<string, unknown>, ctx: VdVertiefKontext) => VdRoh[]
}
export interface VdVertiefKontext {
  host: string
  von: string
  tage: number
  geraet: VdGeraet
  /** Rohdaten des Rundumscans (z. B. 'ereignisse', 'zusatz') */
  roh: Record<string, unknown>
  /** Befunde, die die Vertiefung ausgelöst haben */
  ausloeser: VdBefund[]
  alle: VdBefund[]
  fakten: DgFakten
  kontext?: VdKontext
}
