// „Lager einsehen“ (Hardware-Inventur) — gemeinsame Typen. Reine Daten, kein React, kein three.

export type LagerTyp = 'tower' | 'zbook' | 'elitebook' | 'minipc' | 'sonstiges'

/** Reihenfolge im Fach von links nach rechts. */
export const TYP_REIHE: LagerTyp[] = ['tower', 'zbook', 'elitebook', 'minipc', 'sonstiges']

export const TYP_LABEL: Record<LagerTyp, string> = {
  tower: 'Tower',
  zbook: 'ZBook',
  elitebook: 'EliteBook',
  minipc: 'Mini-PC',
  sonstiges: 'Sonstiges',
}

/** Fächer des linken Regals (Schilder statt Buchstaben). */
export type R5Id = 'retired' | 'skf' | 'angemeldet' | 'abholbereit' | 'pending'
/** Bereiche auf dem Boden. */
export type ZonenId = 'timo' | 'tim' | 'leih-timo' | 'leih-tim' | 'leih-umlauf' | 'ohne'

/** Ort im Lager: Fach mit Buchstabe, Fach im linken Regal oder Bodenbereich. */
export type OrtId = `fach:${string}` | `r5:${R5Id}` | `zone:${ZonenId}`

export interface LeihInfo {
  benutzer?: string   // „Aktueller Benutzer“, wenn es ein Name ist
  datum?: string      // Übergabe-Datum (TT.MM.JJJJ)
  raum?: string       // z. B. „E10“
}

/** Ergebnis der Ort-Erkennung für EIN Gerät. */
export interface Zuordnung {
  ort: OrtId
  grund: string        // z. B. „Kommentar: Ort: E-10“
  hinweise: string[]   // Auffälligkeiten (mehrdeutig, Fach gibt es nicht …)
  leih?: LeihInfo      // gesetzt, wenn es ein Leihrechner ist
}

export interface Vorgesehen {
  name: string
  quelle: string       // „Checkliste TASK…“, „Neuer Mitarbeiter (Start 01.12.)“, „ServiceNow: Reserved for“ …
}

export type GeraeteQuelle = 'endgeraete' | 'lagerliste' | 'inventur'

export interface LagerGeraet {
  serial: string       // normalisiert (UPPERCASE, ohne Leerzeichen)
  hostname: string
  modell: string
  typ: LagerTyp
  kommentar: string
  state: string
  substate: string
  ort: OrtId
  grund: string
  hinweise: string[]
  leih?: LeihInfo
  vorgesehen: Vorgesehen[]
  quelle: GeraeteQuelle
}

/** Ein Gerät, wie es eine Quelle liefert (vor der Ort-Erkennung). */
export interface RohGeraet {
  serial: string
  hostname?: string
  modell?: string
  typText?: string     // Gerätetyp aus der Inventur (Laptop, Mini PC …)
  kommentar?: string
  state?: string
  substate?: string
  assignedTo?: string
  reservedFor?: string
}
