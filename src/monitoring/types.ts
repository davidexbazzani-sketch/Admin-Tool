// ── PC-Überwachung über Zeit: Datenmodell ────────────────────────────────────
// Ein Auftrag (vom Ersteller geschrieben) und sein Zustand (vom prüfenden Rechner
// geschrieben) liegen in GETRENNTEN Dateien → keine gegenseitigen Überschreibungen.

export type MonBereich =
  | 'WLAN' | 'Netzwerk' | 'Erreichbarkeit' | 'Absturz & Neustart' | 'Programme' | 'SolidWorks' | 'SAP'
  | 'Office' | 'Dienste' | 'Festplatte' | 'Hardware & Treiber' | 'Anmeldung & Domäne' | 'Sicherheit'
  | 'Updates' | 'Leistung' | 'Benutzerprofil' | 'Drucken'

export type MonSchwere = 'kritisch' | 'warnung' | 'info'

/** Eine Ereignisprotokoll-Abfrage (Get-WinEvent -FilterHashtable). */
export interface MonEventQuelle { log: string; provider?: string[]; ids: number[] }

export interface MonKontrolle {
  id: string
  titel: string
  bereich: MonBereich
  beschreibung: string
  /** Suchbegriffe (klein) — zusätzlich zu Titel/Bereich/Beschreibung. */
  stichworte: string[]
  art: 'ereignis' | 'erreichbar' | 'messwert' | 'dienst'
  quellen?: MonEventQuelle[]
  /** Fester Text-Filter (Regex, ohne Groß/Klein) auf Meldung + Ereignisdaten, z. B. sldworks\.exe. */
  muster?: string
  /** Frei eingebbarer Wert (z. B. Programm- oder Dienstname). */
  param?: { label: string; platzhalter: string; pflicht?: boolean; art: 'programm' | 'dienst' | 'text' }
  messwert?: 'cpu' | 'ram' | 'disk-c'
  /** Grenze in Prozent: cpu/ram ≥ grenze, disk-c: frei ≤ grenze. */
  grenze?: number
  dienst?: string
  schwere: MonSchwere
  /** Wird bei „Bereich übernehmen“ mit ausgewählt. */
  standard?: boolean
}

/** Gewählte Kontrolle im Auftrag. */
export interface MonAuswahl { id: string; param?: string }

export interface MonPerson { username: string; displayName: string }

export interface MonAuftrag {
  version: 1
  id: string
  host: string
  serial?: string
  erstelltVon: MonPerson
  erstelltAm: string
  von: string                 // ISO — ab wann
  bis: string                 // ISO — bis wann (Ende der Laufzeit)
  kontrollen: MonAuswahl[]
  intervallMin: number        // Prüfabstand
  mail: boolean               // zusätzlich per E-Mail
  mailAn?: string
  /** z. B. „Nach Behebung: Standby-Netzwerk an …“ — steht in allen Meldungen. */
  anlass?: string
  /** Vorzeitig beendet. */
  abgebrochenAm?: string
  abgebrochenVon?: string
  /** „Jetzt prüfen“ angefordert (ISO) — der prüfende Rechner holt es beim nächsten Takt nach. */
  jetztPruefen?: string
  geaendertAm?: string
}

/** Rohes Ereignis vom PC (aus dem Sammler). */
export interface MonRohEreignis {
  k: string                   // Kontroll-ID
  log: string
  rid: number                 // RecordId
  id: number                  // Event-ID
  prov: string
  zeit: string                // ISO (Ortszeit des PCs mit Offset)
  msg: string
  props: string[]
  daten: Record<string, string>
}

/** Ein erkannter Treffer (gespeichert im Zustand). */
export interface MonTreffer {
  key: string                 // log#rid bzw. Art#Zeit
  kontrolle: string
  zeit: string
  titel: string               // kurz: „WLAN getrennt“
  detail: string              // z. B. Grund, Programm, Dienst
  schwere: MonSchwere
  /** Für die Auswertung: Programm/Modul/Code/Dienst/Grund. */
  merkmale?: Record<string, string>
  gemeldet?: boolean
}

export interface MonMeldung { at: string; art: 'treffer' | 'abschluss' | 'nicht-erreichbar' | 'wieder-erreichbar' | 'ende-ausstehend' | 'start'; text: string; mail?: 'ok' | 'fehler' | 'aus'; mailFehler?: string }

export interface MonMesswertStand { wert: number; at: string; ueber: number; gemeldet: boolean }

export interface MonZustand {
  version: 1
  id: string
  aktualisiertAm: string
  aktualisiertVon: string     // Rechner/Benutzer, der geprüft hat
  pruefungen: number
  erfolgreich: number         // Ereignisprotokolle gelesen
  letztePruefung?: string
  letzteErfolg?: string
  letzterFehler?: string
  naechstePruefung?: string
  /** Bis wann die Ereignisprotokolle vollständig gelesen sind (Uhr des PCs, ISO). */
  gelesenBis?: string
  gesehen: string[]           // log#rid — Doppel vermeiden
  treffer: MonTreffer[]
  meldungen: MonMeldung[]
  /** Erreichbarkeit (Ping). */
  erreichbar: { ok: number; fehl: number; fehlFolge: number; nichtSeit?: string; gemeldet?: boolean; zuletztOk?: string; ausfaelle: { von: string; bis?: string; grund?: string }[] }
  messwerte: Record<string, MonMesswertStand>
  dienste: Record<string, { status: string; at: string; gemeldet: boolean }>
  /** Treffer, die wegen der Ruhezeit noch nicht gemeldet sind. */
  letzteTrefferMeldung?: string
  /** Laufzeit vorbei, aber PC nicht erreichbar → einmal „Abschluss folgt“ gemeldet. */
  endeGemeldet?: boolean
  abschluss?: MonAbschluss
  /** Hinweise, z. B. Protokoll auf dem PC nicht vorhanden. */
  hinweise?: string[]
}

export interface MonAbschluss {
  at: string
  ende: string                // effektives Ende (bis oder Abbruch)
  vollstaendig: boolean       // Ereignisprotokolle bis zum Ende gelesen
  titel: string
  text: string                // Chat-Text (≤ 2000 Zeichen)
  langtext: string            // Mail-/Ansichtstext
  ursachen: string[]
  netLaufPfad?: string        // gespeicherte WLAN-Tiefenanalyse
}

/** Sammler-Antwort eines PCs. */
export interface MonSammlerAntwort {
  ok: boolean
  fehler?: string
  jetzt: string               // Uhr des PCs (ISO)
  boot?: string
  ereignisse: MonRohEreignis[]
  anzahl: Record<string, number>   // je Kontrolle gesamt (auch über dem Deckel)
  fehlend: string[]                // Kontrollen, deren Protokoll fehlt
  luecke?: { zeit: string; id: number; prov: string; msg: string }[]
  messwerte: Record<string, number>
  dienste: Record<string, string>  // Dienstname → Status (fehlt = 'nicht vorhanden')
  dauerMs?: number
}
