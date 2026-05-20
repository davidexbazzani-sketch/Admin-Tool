// ── Central Feature Registry ────────────────────────────────────────────────
// Every feature that can be permission-controlled lives here.
// When adding new features: add an entry here — it automatically appears
// in the UserManagement permission editor.

export interface FeatureDef {
  id: string
  label: string
  category: string
  /** If true: normal users (SSO) cannot access this feature */
  userBlocked?: boolean
  /** If true: only master_admin can access (not configurable per admin) */
  masterAdminOnly?: boolean
  /** Short description shown in permission editor */
  description?: string
}

export const FEATURES: FeatureDef[] = [
  // ── Startbildschirm ──────────────────────────────────────────────────────
  { id: 'home', label: 'Startbildschirm', category: 'Grundfunktionen', description: 'Hostname/Seriennummer eingeben und Abfragen starten' },

  // ── Abfrage-Menü ─────────────────────────────────────────────────────────
  { id: 'query-menu', label: 'Abfrage-Menü', category: 'Grundfunktionen', description: 'Abfragekategorien auswählen' },
  { id: 'query-menu.network', label: 'Abfrage: Netzwerk', category: 'Abfrage-Menü', userBlocked: true },
  { id: 'query-menu.system', label: 'Abfrage: System', category: 'Abfrage-Menü', userBlocked: true },
  { id: 'query-menu.security', label: 'Abfrage: Sicherheit', category: 'Abfrage-Menü', userBlocked: true },
  { id: 'query-menu.software', label: 'Abfrage: Software', category: 'Abfrage-Menü', userBlocked: true },

  // ── Ergebnisse ───────────────────────────────────────────────────────────
  { id: 'results', label: 'Ergebnisse', category: 'Grundfunktionen', description: 'Abfrageergebnisse ansehen und exportieren' },

  // ── Benutzer Info ─────────────────────────────────────────────────────────
  { id: 'user-info', label: 'Benutzer Info', category: 'Grundfunktionen', description: 'AD-Benutzerprofile abrufen' },
  { id: 'user-info.reset-password', label: 'Benutzer Info: Passwort zurücksetzen', category: 'Benutzer Info', userBlocked: true, description: 'AD-Passwort eines Benutzers zurücksetzen' },
  { id: 'user-info.unlock-account', label: 'Benutzer Info: Konto entsperren', category: 'Benutzer Info', userBlocked: true, description: 'Gesperrtes AD-Konto entsperren' },
  { id: 'user-info.export', label: 'Benutzer Info: Export', category: 'Benutzer Info', description: 'Benutzerprofil exportieren' },

  // ── Diensthandy & Xelion ─────────────────────────────────────────────────
  { id: 'xelion', label: 'Diensthandy & Xelion', category: 'Grundfunktionen', description: 'Xelion-Telefonnummern prüfen' },

  // ── Remote Doc ───────────────────────────────────────────────────────────
  { id: 'remote-doc', label: 'Remote Doc', category: 'Remote Doc', description: 'Remote-PC-Verwaltung', userBlocked: true },
  { id: 'remote-doc.read', label: 'Remote Doc: Lese-Befehle', category: 'Remote Doc', description: 'Informationen abfragen (Ping, Systeminfo, etc.)' },
  { id: 'remote-doc.write', label: 'Remote Doc: Schreibbefehle', category: 'Remote Doc', userBlocked: true, description: 'Konfigurationen ändern (GPUpdate, Registry, etc.)' },
  { id: 'remote-doc.critical', label: 'Remote Doc: Kritische Befehle', category: 'Remote Doc', userBlocked: true, description: 'Shutdown, Restart, Dienste stoppen' },
  { id: 'remote-doc.services', label: 'Remote Doc: Dienste verwalten', category: 'Remote Doc', userBlocked: true, description: 'Windows-Dienste starten/stoppen/neustarten' },
  { id: 'remote-doc.screenshot', label: 'Remote Doc: Screenshot', category: 'Remote Doc', userBlocked: true, description: 'Bildschirm-Screenshot des Ziel-PCs aufnehmen' },
  { id: 'remote-doc.software', label: 'Remote Doc: Software installieren', category: 'Remote Doc', userBlocked: true, description: 'Software remote installieren (Datei/Winget)' },
  { id: 'remote-doc.filetransfer', label: 'Remote Doc: Dateiübertragung', category: 'Remote Doc', userBlocked: true, description: 'Dateien auf Ziel-PC übertragen' },
  { id: 'remote-doc.drives', label: 'Remote Doc: Netzlaufwerke', category: 'Remote Doc', userBlocked: true, description: 'Netzlaufwerke mappen/trennen' },
  { id: 'remote-doc.drivers', label: 'Remote Doc: Treiber', category: 'Remote Doc', userBlocked: true, description: 'Treiber prüfen und installieren' },

  // ── Trickbox ────────────────────────────────────────────────────────────
  { id: 'trickbox', label: 'Trickbox', category: 'Grundfunktionen', description: 'Hilfreiche Tipps und Skripte' },

  // ── Einstellungen ─────────────────────────────────────────────────────────
  { id: 'settings', label: 'Einstellungen', category: 'Grundfunktionen', description: 'Programmeinstellungen verwalten' },

  // ── Standort-Übersicht ───────────────────────────────────────────────────
  { id: 'location-overview', label: 'Standort-Übersicht', category: 'Grundfunktionen', description: 'Geräte nach Kategorie anzeigen und verwalten' },
  { id: 'location-overview.manage', label: 'Standort-Übersicht: Objekte verwalten', category: 'Standort-Übersicht', masterAdminOnly: true, description: 'Geräte hinzufügen, bearbeiten, importieren' },

  // ── Geplante Aufgaben ─────────────────────────────────────────────────────
  { id: 'scheduled-tasks', label: 'Geplante Aufgaben', category: 'Grundfunktionen', userBlocked: true, description: 'Wiederkehrende Aufgaben einrichten' },

  // ── Infrastruktur Marine ──────────────────────────────────────────────────
  { id: 'infra-marine', label: 'Infrastruktur Marine', category: 'Infrastruktur', description: 'Infrastruktur-Uebersicht: Incident Response, Berechtigungen, etc.' },
  { id: 'infra-marine.send-email', label: 'Infrastruktur Marine: E-Mail senden', category: 'Infrastruktur', userBlocked: true, description: 'Incident-E-Mails an Kontakte versenden' },
  { id: 'infra-marine.permissions', label: 'Infrastruktur Marine: Berechtigungen', category: 'Infrastruktur', description: 'Berechtigungs-Uebersicht und SNOW-Links fuer neue Mitarbeiter' },
  { id: 'infra-marine.permissions.check', label: 'Infrastruktur Marine: Berechtigungs-Check', category: 'Infrastruktur', userBlocked: true, description: 'AD-Gruppenmitgliedschaft eines Users pruefen' },
  { id: 'infra-marine.toner', label: 'Infrastruktur Marine: Tonerbestellung', category: 'Infrastruktur', description: 'Druckerpatronen ueber Hilker & Pahl bestellen' },
  { id: 'infra-marine.visitor', label: 'Infrastruktur Marine: Externe Besucher', category: 'Infrastruktur', description: 'Externe Besucher beim Empfang anmelden' },
  { id: 'infra-marine.server-perf', label: 'Infrastruktur Marine: Server Performance Check', category: 'Infrastruktur', userBlocked: true, description: 'Server-Performance analysieren und DXC-Aufruest-Mail senden' },
  { id: 'infra-marine.edit-contacts', label: 'Infrastruktur Marine: Kontakte verwalten', category: 'Infrastruktur', masterAdminOnly: true, description: 'Incident Response Kontaktverzeichnisse bearbeiten' },
  { id: 'infra-marine.edit-permissions', label: 'Infrastruktur Marine: Berechtigungs-Katalog verwalten', category: 'Infrastruktur', masterAdminOnly: true, description: 'Berechtigungen-Katalog bearbeiten' },

  // ── Software Installationen ──────────────────────────────────────────────
  { id: 'software-installations', label: 'Software Installationen', category: 'Software', userBlocked: true, description: 'Software remote auf Zielrechner installieren' },
  { id: 'software-installations.solidworks', label: 'SolidWorks 2024 SP5', category: 'Software', userBlocked: true, description: 'SolidWorks-Installation Schritte 1-9 automatisiert' },

  // ── Praesentationsmodus ──────────────────────────────────────────────────
  { id: 'presentation-mode', label: 'Praesentationsmodus', category: 'Praesentation', userBlocked: true, description: 'Webseiten in Endlosschleife im Vollbild anzeigen (Hallen-Display)' },
  { id: 'presentation-mode.edit', label: 'Praesentationsmodus: Slides verwalten', category: 'Praesentation', userBlocked: true, description: 'Slides hinzufuegen, bearbeiten, loeschen' },

  // ── Benutzerverwaltung (Master Admin only) ────────────────────────────────
  { id: 'user-management', label: 'Benutzerverwaltung', category: 'Administration', masterAdminOnly: true, description: 'Benutzer anlegen, bearbeiten, Berechtigungen vergeben' },
  { id: 'user-logs', label: 'Benutzer-Logs', category: 'Administration', masterAdminOnly: true, description: 'Aktivitätsprotokolle aller Benutzer einsehen' },
  { id: 'bug-mailbox', label: 'Bug-Meldungen', category: 'Administration', masterAdminOnly: true, description: 'Bug-Meldungen und Verbesserungsvorschläge verwalten' },
]

export function getFeaturesByCategory(): Map<string, FeatureDef[]> {
  const map = new Map<string, FeatureDef[]>()
  for (const f of FEATURES) {
    if (!map.has(f.category)) map.set(f.category, [])
    map.get(f.category)!.push(f)
  }
  return map
}

export function getAdminConfigurableFeatures(): FeatureDef[] {
  return FEATURES.filter(f => !f.masterAdminOnly)
}
