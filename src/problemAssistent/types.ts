// ── Problem-Assistent: Datenmodell des Problem-Katalogs ──────────────────────

export const PA_BEREICHE = [
  'Teams', 'Outlook & E-Mail', 'Office (Word/Excel/PowerPoint)', 'OneDrive & SharePoint', 'Browser',
  'Netzwerk & Internet', 'WLAN', 'VPN & Zscaler', 'Netzlaufwerke & Dateien',
  'Drucker & Scannen', 'Hardware & Geräte', 'Audio & Headset', 'Bildschirm & Grafik', 'Kamera & Mikrofon', 'Akku & Energie',
  'Windows & Oberfläche', 'Leistung & Speicher', 'Updates & Software', 'Anmeldung & Konto', 'Sicherheit',
  'SAP', 'SolidWorks & CAD', 'Smartphone & MFA', 'Weitere Programme', 'Telefonie & Sonstiges',
] as const
export type PaBereich = typeof PA_BEREICHE[number]

/** Ein Schritt der Lösung. `aktion` = ID aus aktionen.ts ODER „werkzeug:<id>“ (WERKZEUGE). */
export interface PaSchritt {
  aktion: string
  /** Fester Parameter für den Baustein; „{eingabe}“ = Wert aus `frage`. */
  param?: string
  /** Standardmäßig NICHT angehakt (z. B. kritische oder nur manchmal nötige Schritte). */
  optional?: boolean
  /** Abweichende Beschriftung im Assistenten. */
  titel?: string
}

export interface PaProblem {
  /** Eindeutig, kebab-case, mit Präfix der Datei (z. B. „teams-startet-nicht“). */
  id: string
  /** So, wie Anwender/Helpdesk es sagen: „Teams startet nicht“. */
  titel: string
  bereich: PaBereich
  /** Suchbegriffe: klein, Umlaute als ae/oe/ue/ss, Synonyme, Umgangssprache, Englisch, Fehlertexte/-codes. */
  stichworte: string[]
  /** So beschreiben Anwender/Helpdesk das Problem in eigenen Worten (ganze Sätze, verschiedene Blickwinkel) — für die Suche. */
  beschreibungen?: string[]
  /** 1–2 Sätze: typische Ursache(n). */
  ursache: string
  /** 1–3 Sätze: was die Schritte tun und was danach zu tun ist. */
  loesung: string
  schritte: PaSchritt[]
  /** Eingabe, die Schritte mit „{eingabe}“ brauchen. */
  frage?: { label: string; platzhalter: string; vorlagen?: string[]; art?: 'drucker' }
  /** Was das Tool nicht kann bzw. wer zuständig ist (Server, AD, Lizenz, Hardware-Tausch …). */
  hinweis?: string
  /** IDs aus src/monitoring/kontrollen.ts — für „danach überwachen“. */
  ueberwachen?: string[]
  /** Vorschlag für die Desktop-Nachricht an den Benutzer nach der Lösung. */
  nachricht?: string
  /** Passender Antrag in ServiceNow (exakter Name aus dem Katalog der ServiceNow Welt) — wird als Direktlink angeboten. */
  servicenow?: { name: string; wozu: string }
}
