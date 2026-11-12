// ── Änderungsverlauf je PC: Datenmodell ──────────────────────────────────────

export type Kat = 'software' | 'update' | 'treiber' | 'dienst' | 'autostart' | 'aufgabe' | 'netz' | 'system' | 'app'
export type Art = 'neu' | 'entfernt' | 'geaendert'

export const KAT_TEXT: Record<Kat, string> = {
  software: 'Programm', update: 'Windows-Update', treiber: 'Treiber', dienst: 'Dienst', autostart: 'Autostart',
  aufgabe: 'Geplante Aufgabe', netz: 'Netzwerk', system: 'System', app: 'App',
}

/** Abschnitte, wie sie der PC liefert: je Abschnitt Zeilen mit Tab-getrennten Spalten. null = nicht lesbar. */
export type Abschnitt = 'sys' | 'sw' | 'swU' | 'upd' | 'drv' | 'svc' | 'auto' | 'autoU' | 'task' | 'net' | 'app'

export type Zeilen = Record<Abschnitt, string[] | null>

/** Antwort des Leseskripts. Bei `gleich` fehlen die Abschnitte (Stand unverändert). */
export interface RohAntwort extends Partial<Zeilen> {
  v: number
  host: string
  am: string
  hash: string
  ev: string[]
  gleich?: boolean
  benutzer?: string[]
  /** Fehlergruppen der letzten 7 Tage aus allen Ereignisprotokollen (src/pcFehler). null = nicht lesbar. */
  fe?: string[] | null
  /** Netzlaufwerk I: je angemeldetem Benutzer („Benutzer⇥Zielpfad", leer = nicht verbunden). null = nicht lesbar. */
  lw?: string[] | null
  /** Antwort des reinen Fehler-Scans: enthält keinen Stand des PCs. */
  nurFehler?: boolean
}

/** Zuletzt gelesener Stand eines PCs (Vergleichsbasis für das nächste Mal). */
export interface Stand extends Zeilen {
  am: string
  hash: string
  /** Benutzer, deren Registry beim Lesen geladen war (nur für die gelten swU/autoU). */
  benutzer: string[]
}

export interface Aenderung {
  id: string
  kat: Kat
  art: Art
  name: string
  /** Roh-Schlüssel (Dienstname, KB-Nummer …) zum Zusammenführen mit Windows-Ereignissen. */
  key?: string
  alt?: string
  neu?: string
  /** Genauer Zeitpunkt aus Windows selbst: ISO mit Uhrzeit oder nur „JJJJ-MM-TT". */
  am?: string
  /** Sonst: irgendwann zwischen zwei Lesevorgängen. */
  von?: string
  bis: string
  /** windows = Windows hat es selbst protokolliert · vergleich = fiel beim Vergleich zweier Stände auf. */
  quelle: 'windows' | 'vergleich' | 'beides'
  zusatz?: string
}

/** Datei je PC auf dem Netzlaufwerk: pc-verlauf/pcs/<HOST>.json */
export interface PcDatei {
  v: 1
  host: string
  /** Erstes Lesen — davor kennt das Tool nur, was Windows selbst protokolliert hat. */
  erstAm: string
  gelesenAm: string
  /** Ereignisse sind bis hierhin eingelesen. */
  evBis: string
  stand: Stand | null
  aenderungen: Aenderung[]
}

/** Kleine Übersicht für den Hintergrund-Scan: pc-verlauf/index.json (Host → Fingerabdruck). */
export interface IndexEintrag { hash: string; am: string; evBis: string }
export type PcIndex = Record<string, IndexEintrag>
