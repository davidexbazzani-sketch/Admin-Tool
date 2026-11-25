// Der Coach — Grenze zum Programm, in dem er läuft. Nur host/adminTool.ts kennt das IT Admin Tool; ein eigenes
// Produkt liefert später einen anderen Adapter. kern/ importiert nie etwas aus host/.

export type AblageName = 'coach' | 'coachBuch' | 'coachTon'
export interface LadeAntwort { ok: boolean; daten: string | null; verschluesselung: boolean; fehler?: string }
export interface Ablage {
  laden(benutzer: string): Promise<LadeAntwort>
  speichern(benutzer: string, json: string): Promise<{ ok: boolean; fehler?: string }>
  loeschen(benutzer: string): Promise<boolean>
  beiseite(benutzer: string, art: 'defekt' | 'alt'): Promise<boolean>
}

export interface CoachHost {
  /** angemeldeter Benutzer; leer = nicht angemeldet */
  benutzer(): string
  /** Vorschlag für die Anrede */
  anzeigeName(): string
  /** ist der Raum gerade der sichtbare Bildschirm? */
  raumOffen(): boolean
  /** darf der Benutzer den Raum sehen? */
  darfSehen(): boolean
  /** zeigt gerade ein anderer Raum eine Erinnerungskarte? */
  andereKarteSichtbar(): boolean
  /** ruft bei Änderungen von Benutzer, Bildschirm oder Sichtbarkeit; gibt die Abmeldung zurück */
  beobachte(rueckruf: () => void): () => void
  ablage(name: AblageName): Ablage
  kannOeffnen(ziel: 'parla-italiano'): boolean
  oeffne(ziel: 'der-coach' | 'parla-italiano' | 'pausenraum'): void
  /** Windows-Hinweis; der Text enthält nie Persönliches */
  benachrichtige(titel: string, text: string): void
  /** Datei speichern (Export); false = abgebrochen oder fehlgeschlagen */
  speichereDatei(vorschlag: string, inhalt: string): Promise<boolean>
  /** Datei laden (Import); null = abgebrochen */
  ladeDatei(): Promise<string | null>
  bildPfad(datei: string): string
  tonPfad(datei: string): string
}
