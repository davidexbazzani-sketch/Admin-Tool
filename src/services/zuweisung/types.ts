// ── Ticket-Zuweisung: Datenmodell (Regelwerk, Eingabe, Ergebnis, Abwesenheiten) ─
// 1:1 zur Struktur von ZUWEISUNG_Regeln.json / ZUWEISUNG_Abwesenheiten.json und der
// Referenz-Engine zuweisung_engine.py. Wird zur Laufzeit geladen, NIE fest verdrahtet.

export interface RegelUnterBed {
  gruppe?: string[]
  kw?: string
  ci?: string
  abteilung?: string[]
  auth?: boolean
}
export interface RegelUnter {
  id: string
  bed: RegelUnterBed
  primary: string
  vertretung?: string[]
  pool?: boolean
  hinweis?: string
}
export interface Regel {
  id: string
  thema: string
  gruppen: string[]          // Kurzformen (APPS|HR|APPS-EXT|INFRA|FS)
  ci?: string                // Regex auf das CI
  kw?: string                // Regex auf den Text
  kw_bei_ci?: boolean
  subcats?: string[]
  primary: string
  vertretung?: string[]
  pool?: boolean
  hinweis?: string
  unter?: RegelUnter[]
}
export interface Person {
  team: string               // APPS|HR|APPS-EXT|INFRA|FS
  status: string             // "aktiv…" oder "inaktiv…/ausgeschieden…"
  rolle?: string
  kalender?: boolean
}
export interface AbteilungsRegel {
  codes: string[]
  person: string
  beleg: string
}
export interface MelderRegel { person: string; thema: string }
export interface Gruppe { kurz: string; reihenfolge: string[] }

export interface RegelwerkMeta {
  titel?: string
  version?: string
  stand?: string
  generische_cis: string[]
  auth_signal: string
  fehler_signal: string
  [k: string]: unknown
}
export interface Regelwerk {
  meta: RegelwerkMeta
  gruppen: Record<string, Gruppe>
  abteilungen: Record<string, AbteilungsRegel>
  personen: Record<string, Person>
  regeln: Regel[]
  melder_regeln: Record<string, MelderRegel>
}

/** Eingabe wie in ServiceNow sichtbar. */
export interface Eingabe {
  group: string              // Assignment group (langer Queue-Name)
  ci?: string
  sub?: string               // Subcategory
  caller?: string            // Melder (Anzeigename)
  short: string              // Short description
  desc?: string              // Description (optional)
}

/** Rohes Engine-Ergebnis — 1:1 zu zuweisung_engine.predict (für den Paritätstest). */
export interface Ergebnis {
  id: string                 // Regel-ID bzw. MELDER/ABTEILUNG/NONE
  regel: string
  thema: string
  grund: string
  primary: string
  vertretung: string[]
  pool: boolean
  signal?: SignalArt         // welches Signal die Regel gefunden hat (nur Anzeige)
}
export type SignalArt = 'kw_bei_ci_short' | 'ci' | 'kw_bei_ci_text' | 'kw_short' | 'kw_desc' | 'subcat' | 'melder' | 'abteilung' | 'rest' | 'gruppen_reihenfolge'

// ── Abwesenheiten (Team-Kalender) ────────────────────────────────────────────
export interface Zeitraum { von: string; bis: string; tage: number }
export interface PersonAbwesenheit { tage: number; zeitraeume: Zeitraum[] }
export interface Abwesenheiten {
  quelle?: string
  blatt?: string
  stand_datei?: string
  zeitraum?: { von: string; bis: string } | null
  legende?: string
  betriebsfrei: string[]
  unbekannte_namen?: string[]
  personen: Record<string, PersonAbwesenheit>
}

/** Ein Glied der Vertretungskette mit Zustand (für die Anzeige in Schritt 2). */
export interface KetteGlied {
  name: string
  zustand: 'zuweisen' | 'abwesend' | 'inaktiv' | 'anwesend' | 'uebersprungen'
  von?: string
  bis?: string
}
export interface VertretungErgebnis {
  datum: string
  zuweisen: string
  kette: KetteGlied[]
  abwesend: { name: string; von: string; bis: string }[]
  hinweise: string[]
}
