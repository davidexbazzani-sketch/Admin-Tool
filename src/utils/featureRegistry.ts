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

  // ── Trickkiste ───────────────────────────────────────────────────────────
  { id: 'trickkiste', label: 'Trickkiste', category: 'Grundfunktionen', description: 'Hilfreiche Tipps und Skripte' },

  // ── Einstellungen ─────────────────────────────────────────────────────────
  { id: 'settings', label: 'Einstellungen', category: 'Grundfunktionen', description: 'Programmeinstellungen verwalten' },

  // ── Standort-Übersicht ───────────────────────────────────────────────────
  { id: 'location-overview', label: 'Standort-Übersicht', category: 'Grundfunktionen', description: 'Geräte nach Kategorie anzeigen und verwalten' },
  { id: 'location-overview.manage', label: 'Standort-Übersicht: Objekte verwalten', category: 'Standort-Übersicht', masterAdminOnly: true, description: 'Geräte hinzufügen, bearbeiten, importieren' },

  // ── Geplante Aufgaben ─────────────────────────────────────────────────────
  { id: 'scheduled-tasks', label: 'Geplante Aufgaben', category: 'Grundfunktionen', userBlocked: true, description: 'Wiederkehrende Aufgaben einrichten' },

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
