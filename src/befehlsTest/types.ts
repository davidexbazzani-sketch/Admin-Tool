// ── Befehls-Test: alle Befehle des Tools einmal echt auf einem Test-PC ausführen ──

export type BtQuelle = 'baustein' | 'remotedoc'
export type BtRisiko = 'lesen' | 'aendern' | 'kritisch'

/** Reihenfolge: harmlos → ändernd → kritisch → Verbindung kurz weg → abmelden → Neustart → aus. */
export type BtPhase = 'lesen' | 'lesen-lang' | 'aendern' | 'aendern-lang' | 'kritisch' | 'trennt' | 'abmelden' | 'neustart' | 'aus'

export const BT_PHASEN: { id: BtPhase; titel: string; info: string }[] = [
  { id: 'lesen', titel: 'Lesend', info: 'nur anzeigen, ändert nichts' },
  { id: 'lesen-lang', titel: 'Lesend (lang)', info: 'lesend, dauert länger' },
  { id: 'aendern', titel: 'Ändernd', info: 'Caches, Einstellungen, Dienste' },
  { id: 'aendern-lang', titel: 'Ändernd (lang)', info: 'Reparaturen, Scans, Updates' },
  { id: 'kritisch', titel: 'Kritisch', info: 'Zurücksetzen, Löschen, Entfernen' },
  { id: 'trennt', titel: 'Netz kurz weg', info: 'danach wartet der Lauf auf den PC' },
  { id: 'abmelden', titel: 'Abmelden', info: 'meldet den Benutzer ab' },
  { id: 'neustart', titel: 'Neustart', info: 'wartet jeweils, bis der PC wieder da ist' },
  { id: 'aus', titel: 'Herunterfahren', info: 'ganz zum Schluss' },
]

/** Was nach dem Befehl geprüft wird. */
export type BtNachher = 'trennt' | 'neustart' | 'kein-neustart' | 'aus'

export interface BtEintrag {
  key: string                 // 'pa:<id>' bzw. 'rd:<kategorie>:<id>'
  quelle: BtQuelle
  id: string
  titel: string
  gruppe: string
  risiko: BtRisiko
  phase: BtPhase
  /** Reihenfolge innerhalb der Phase (klein = früher). */
  prio: number
  /** Ausführungsart (Baustein: system/profil/benutzer/lokal; Remote Doc: fern/admin-pc). */
  art: string
  /** Testwert (kann Platzhalter wie {drucker} enthalten) — undefined = Befehl braucht keinen. */
  wert?: string
  /** Woher der Testwert kommt (Anzeige). */
  herkunft?: 'auto' | 'fest' | 'eigen' | 'leer'
  /** Befehl braucht eine Eingabe, für die es keinen sicheren Testwert gibt. */
  fehlt?: string
  paramLabel?: string
  /** Läuft im Test NIE automatisch (Grund) — wird nur auf Syntax geprüft. */
  sperre?: string
  nachher?: BtNachher
  /** Ausgabe enthält Geheimnisse (Schlüssel, Passwörter) → wird nicht gespeichert. */
  geheim?: boolean
  timeoutMs: number
}

export type BtStatus = 'offen' | 'laeuft' | 'ok' | 'meldung' | 'na' | 'fehler' | 'zeit' | 'weg' | 'skip' | 'gesperrt'

export const BT_STATUS: Record<BtStatus, { titel: string; ton: 'ok' | 'warn' | 'fehler' | 'neutral' }> = {
  offen: { titel: 'offen', ton: 'neutral' },
  laeuft: { titel: 'läuft', ton: 'neutral' },
  ok: { titel: 'funktioniert', ton: 'ok' },
  meldung: { titel: 'lief, mit Fehlermeldung', ton: 'warn' },
  na: { titel: 'trifft nicht zu', ton: 'warn' },
  fehler: { titel: 'Fehler', ton: 'fehler' },
  zeit: { titel: 'Zeitüberschreitung', ton: 'fehler' },
  weg: { titel: 'PC danach weg', ton: 'fehler' },
  skip: { titel: 'übersprungen', ton: 'neutral' },
  gesperrt: { titel: 'nicht automatisch', ton: 'neutral' },
}

export interface BtErgebnis {
  status: BtStatus
  /** Kurzbefund (eine Zeile). */
  text: string
  /** Ausgabe (gekürzt, geschwärzt). */
  zeilen?: string[]
  /** Verwendeter Testwert (geschwärzt). */
  param?: string
  dauerMs: number
  am: string
  /** Syntaxprüfung: '' = in Ordnung, sonst Befund. */
  syntax?: string
}

export interface BtOptionen {
  remoteDoc: boolean
  /** Herunterfahren als allerletzten Befehl ausführen (PC ist danach aus). */
  herunterfahren: boolean
  /** Druckername für die Drucker-Befehle (leer = Drucker-Befehle überspringen). */
  drucker: string
}

export type BtZustand = 'vorbereitung' | 'laeuft' | 'wartet' | 'pausiert' | 'fertig' | 'abgebrochen'

export interface BtLauf {
  id: string
  pc: string
  von: string
  start: string
  ende?: string
  optionen: BtOptionen
  zustand: BtZustand
  hinweis?: string
  /** Reihenfolge der Schlüssel (fest beim Start). */
  reihenfolge: string[]
  ergebnisse: Record<string, BtErgebnis>
  /** Sicherung der Einstellungen vom Test-PC (für das Zurückstellen am Ende). */
  sicherung?: unknown
  vorbereitet?: boolean
  aufgeraeumt?: boolean
  aufraeumZeilen?: string[]
  /** Testwerte, die der Benutzer selbst eingetragen hat (Schlüssel → Wert). */
  eigeneWerte?: Record<string, string>
}

export interface BtEinstellung {
  pc: string
  optionen: BtOptionen
  eigeneWerte: Record<string, string>
}

/** Kurzstand je Befehl (für die Anzeige im Problem-Assistenten). */
export interface BtStand { [key: string]: { s: BtStatus; am: string; pc: string; t?: string } }
