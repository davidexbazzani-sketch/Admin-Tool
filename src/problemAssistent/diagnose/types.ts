// ── Geführte Diagnose „Keine Ahnung, was das Problem ist?“ ──────────────────
// Oberthema → Unterthema → gezielte, NUR LESENDE Prüfungen („Sonden“) auf dem Ziel-PC
// → Messwerte („Fakten“) → Regeln → Befunde mit Begründung → passendes Problem mit Lösung.

/** Ein Messwert. Namen immer „<sondenId>.<name>“, z. B. „ol.ostMaxGB“. */
export type DgWert = string | number | boolean | null | string[]
export type DgFakten = Record<string, DgWert>

/** Sichtbarer Prüfpunkt (was geprüft wurde und mit welchem Ergebnis). */
export interface DgPunkt { t: string; s: 'ok' | 'warn' | 'fehler' | 'info'; x?: string }

/**
 * Sonde = ein lesendes PowerShell-Stück. Verfügbar wie in Bausteinen (Zeile, Ja, Groesse …; bei
 * „profil“ zusätzlich $uProf/$uLocal/$uRoam/$uHive/$uSid/UserProcs) und dazu:
 *   Fakt 'name' $wert          → Messwert „<id>.name“ (Zahl, Text, $true/$false, Liste)
 *   Punkt 'Titel' 'ok|warn|fehler|info' 'Text'
 * Eine Sonde ändert NIE etwas und wirft keine Fehler für „nicht vorhanden“ (dann Fakt … $false).
 */
export interface DgSonde {
  id: string
  titel: string
  modus: 'system' | 'profil' | 'benutzer'
  timeoutMs?: number
  ps: string
}

/** Regel: wenn sie zutrifft, ist das Problem `problem` die (wahrscheinliche) Ursache. */
export interface DgRegel {
  id: string
  /** Darf fehlende Fakten nicht als Treffer werten (Helfer num/ja/txt/liste aus ./motor). */
  wenn: (f: DgFakten) => boolean
  /** Kurze Begründung mit Messwert, z. B. „OST-Datei 48 GB“. */
  befund: (f: DgFakten) => string
  /** ID aus dem Problem-Katalog — dort steht die Lösung. */
  problem: string
  /** 3 = eindeutig die Ursache · 2 = sehr wahrscheinlich · 1 = möglicher Beitrag */
  schwere: 1 | 2 | 3
}

/** Rückfrage an den Anwender (wird zum Fakt „frage.<id>“ = 'ja' | 'nein'). */
export interface DgFrage { id: string; text: string }

export interface DgUnter {
  id: string
  titel: string
  /** Woran man das Unterthema erkennt (Anwendersprache). */
  beschreibung: string
  sonden: string[]
  fragen?: DgFrage[]
  regeln: DgRegel[]
  /** Findet keine Regel etwas: diese Probleme als häufigste Lösungen anbieten. */
  ohneBefund: string[]
}

export interface DgOber {
  id: string
  titel: string
  /** Name eines lucide-Symbols (siehe KeineAhnung.tsx → SYMBOLE). */
  symbol: string
  beschreibung: string
  unter: DgUnter[]
}

export interface DgBefund { regel: string; problem: string; text: string; schwere: 1 | 2 | 3 }

export interface DgSondenErgebnis { id: string; titel: string; ok: boolean; fehler?: string; punkte: DgPunkt[]; dauerMs: number }
