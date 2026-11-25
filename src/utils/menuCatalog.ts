// ── Zentraler Menü-Katalog (Single Source of Truth) ──────────────────────────
// EINE Liste aller Menüpunkte. Sowohl die Sidebar als auch die Einstellungen
// (Menüpunkte ein-/ausblenden + pro Benutzer) speisen sich hieraus — so kann die
// Liste nie mehr veralten. NEUEN Screen hinzufuegen? -> hier eintragen (und in
// der Sidebar nur noch das Icon ITEM_ICONS ergaenzen).
//
// Reihenfolge = Reihenfolge in der Sidebar. Kategorien MUESSEN zusammenhaengend
// bleiben (die Sidebar gruppiert aufeinanderfolgende gleiche Kategorien).

import type { Screen } from '../types'

export interface MenuCatalogItem {
  id: Screen
  label: string
  category: string            // Anzeige-Gruppe (fuer Einstellungen + Sidebar-Kategorie)
  topLevel?: boolean          // eigenstaendiger Sidebar-Eintrag (nicht in Kategorie)
  adminOnly?: boolean         // benoetigt Admin- oder Master-Rolle
  masterAdminOnly?: boolean   // benoetigt Master-Rolle
  alwaysVisible?: boolean     // kann global NICHT ausgeblendet werden (Start/Einstellungen)
  /** Unterpunkt: steht NICHT in der Sidebar, sondern als Kachel im Obermenüpunkt
   *  (bleibt aber in den Einstellungen einzeln ein-/ausblendbar). */
  elternteil?: Screen
}

export const MENU_CATALOG: MenuCatalogItem[] = [
  { id: 'home', label: 'Gib dein Problem ein', category: 'Start', topLevel: true, alwaysVisible: true },

  // Standort
  { id: 'location-overview',      label: 'Standort-Übersicht',     category: 'Standort' },
  { id: 'access-points',          label: 'Access Points',          category: 'Standort' },
  { id: 'client-geraete',         label: 'Client Geräte',          category: 'Standort' },
  { id: 'ot-devices',             label: 'OT-Geräte',              category: 'Standort', elternteil: 'client-geraete' },
  { id: 'pruffeld-zoll',          label: 'Halle & Zoll',           category: 'Standort', elternteil: 'client-geraete' },
  { id: 'verwaltungsgebaeude',    label: 'Verwaltungsgebäude',     category: 'Standort', elternteil: 'client-geraete' },
  { id: 'drucker-uebersicht',     label: 'Drucker Übersicht',      category: 'Standort' },
  { id: 'departments-overview',   label: 'Abteilungs-Übersicht',   category: 'Standort' },
  { id: 'organization-structure', label: 'Organisationsstruktur',  category: 'Standort' },

  // User
  { id: 'user-overview', label: 'Benutzer-Übersicht', category: 'User' },
  { id: 'user-info',     label: 'Benutzer Info',      category: 'User' },
  { id: 'gruppen-suche', label: 'Gruppen-Suche',      category: 'User', adminOnly: true },

  // IT Support
  { id: 'checklists',             label: 'Checklisten',             category: 'IT Support', adminOnly: true },
  { id: 'device-setup',           label: 'Geräte-Einrichtung',      category: 'IT Support', adminOnly: true },
  { id: 'hardware-inventory',     label: 'Hardware-Inventur',       category: 'IT Support', adminOnly: true },
  { id: 'accessory-inventory',    label: 'Zubehör Inventur',        category: 'IT Support', adminOnly: true },
  { id: 'software-installations', label: 'Software Installationen', category: 'IT Support', adminOnly: true },
  { id: 'pc-migration',           label: 'PC-Migration',            category: 'IT Support', adminOnly: true },
  { id: 'pc-diagnosis',           label: 'PC-Diagnose',             category: 'IT Support' },
  { id: 'employee-management',    label: 'Mitarbeiterverwaltung',   category: 'IT Support', adminOnly: true },
  { id: 'onboarding',             label: 'Onboarding',              category: 'IT Support', adminOnly: true },
  { id: 'treiber-installation',   label: 'Treiber-Installation',    category: 'IT Support', adminOnly: true },
  { id: 'support-tools',          label: 'Support Tools',           category: 'IT Support', adminOnly: true },
  { id: 'drucker',                label: 'Drucker',                 category: 'IT Support', adminOnly: true },
  { id: 'servicenow',             label: 'ServiceNow / Tickets',    category: 'IT Support', adminOnly: true },
  { id: 'ticket-assignment',      label: 'Zuweisung Tickets',       category: 'IT Support', adminOnly: true },

  // Infrastruktur
  { id: 'massenabfragen',     label: 'Massenabfragen',         category: 'Infrastruktur' },   // früherer Startbildschirm (Einzelabfrage, Datei-Import, Liste, Benutzer-Suche)
  { id: 'endpoint-devices',   label: 'Endgeräte-Übersicht',    category: 'Infrastruktur' },
  { id: 'gpu-driver-mgmt',    label: 'Grafik-/Treiber-Verwaltung', category: 'Infrastruktur', adminOnly: true },
  { id: 'infra-marine',       label: 'Infrastruktur Marine',   category: 'Infrastruktur' },
  { id: 'infra-projects',     label: 'Infrastruktur Projekte', category: 'Infrastruktur' },
  { id: 'server',             label: 'Server',                 category: 'Infrastruktur', adminOnly: true },
  { id: 'scheduled-tasks',    label: 'Geplante Aufgaben',      category: 'Infrastruktur', adminOnly: true },
  { id: 'presentation-mode',  label: 'Präsentationsmodus',     category: 'Infrastruktur', adminOnly: true },
  { id: 'user-presence',      label: 'Wo angemeldet?',         category: 'Infrastruktur' },
  { id: 'licenses',           label: 'Lizenzen-Kalender',      category: 'Infrastruktur', adminOnly: true },
  { id: 'proactive-radar',    label: 'Proaktives Radar',       category: 'Infrastruktur', adminOnly: true },
  { id: 'critical-devices',   label: 'Kritische Geräte',       category: 'Infrastruktur', adminOnly: true },
  { id: 'nis2',               label: 'NIS2',                   category: 'Infrastruktur', adminOnly: true },
  { id: 'software-inventory', label: 'Software-Inventar',      category: 'Infrastruktur', adminOnly: true },
  { id: 'network-radar',      label: 'Netzwerk-Radar',         category: 'Infrastruktur', adminOnly: true },
  { id: 'vlan-overview',      label: 'VLAN-Übersicht',         category: 'Infrastruktur', adminOnly: true },
  { id: 'backups',            label: 'Back-Ups',               category: 'Infrastruktur', adminOnly: true },
  { id: 'usv',                label: 'Netzwerkgeräte',         category: 'Infrastruktur' },   // Kennung bleibt 'usv' (gespeicherte Favoriten/Ausblendungen)
  { id: 'dashboards',         label: 'Dashboards',             category: 'Infrastruktur' },

  // Telefonie
  { id: 'xelion',            label: 'Diensthandy & Xelion', category: 'Telefonie' },
  { id: 'rufnummer-vergabe', label: 'Rufnummer Vergabe',    category: 'Telefonie', adminOnly: true },

  // Sonstiges
  { id: 'trickbox',       label: 'Trickbox',         category: 'Sonstiges' },
  { id: 'pdf-tools',      label: 'PDF-Werkzeuge',    category: 'Sonstiges' },
  { id: 'knowledge-base', label: 'Wissensdatenbank', category: 'Sonstiges' },
  { id: 'knowledge-search', label: 'Wissenssuche', category: 'Sonstiges' },
  { id: 'it-guru',        label: 'IT Guru',          category: 'Sonstiges' },
  { id: 'games',          label: 'Pausenraum',       category: 'Sonstiges' },
  // Räume des Pausenraums (Kacheln, nicht in der Sidebar)
  // „Der Coach“ (seit 25.11.2026) steht als oberste Kachel. masterAdminOnly + Gründer-Prüfung in der Kachel:
  // bis zur Freigabe durch den Auftraggeber nur für ihn sichtbar.
  { id: 'der-coach',      label: 'Der Coach',        category: 'Sonstiges', elternteil: 'games', masterAdminOnly: true },
  { id: 'vier-gewinnt',   label: '4 gewinnt',        category: 'Sonstiges', elternteil: 'games' },
  { id: 'brain-trainer',  label: 'Brain Trainer',    category: 'Sonstiges', elternteil: 'games' },
  { id: 'parla-italiano', label: 'Parla Italiano',   category: 'Sonstiges', elternteil: 'games' },
  { id: 'terra-incognita', label: 'Terra Incognita', category: 'Sonstiges', elternteil: 'games' },

  { id: 'results', label: 'Ergebnisse', category: 'Ergebnisse', topLevel: true },

  // Einstellungen
  // („Benutzerverwaltung“ ist seit 19.11.2026 die Kachel „Benutzer & Rechte“ in den Einstellungen.)
  { id: 'settings',        label: 'Einstellungen',      category: 'Einstellungen', alwaysVisible: true },
  { id: 'user-logs',       label: 'Benutzer-Logs',      category: 'Einstellungen', masterAdminOnly: true },
  { id: 'bug-mailbox',     label: 'Bug-Meldungen',      category: 'Einstellungen', masterAdminOnly: true },
]

/** Unterpunkte eines Obermenüpunkts (z. B. „Client Geräte“ → OT-Geräte, Halle & Zoll, Verwaltungsgebäude). */
export function kinderVon(id: string): MenuCatalogItem[] { return MENU_CATALOG.filter(m => m.elternteil === id) }
/** Obermenüpunkt eines Unterpunkts (oder undefined). */
export function elternVon(id: string): Screen | undefined { return MENU_CATALOG.find(m => m.id === id)?.elternteil }

// ── Unterbereiche innerhalb eines Menüpunkts (Kacheln oder Reiter der ersten Ebene) ──
// Lassen sich in Einstellungen → „Benutzer & Rechte“ je Benutzer (oder für alle) ausblenden.
// `key` = der Zustandswert, mit dem der Bildschirm den Bereich öffnet — NIE umbenennen, sonst
// gehen gespeicherte Ausblendungen verloren. Neuer Bildschirm mit Kacheln/Reitern? → hier
// eintragen und im Bildschirm `useBereiche(id)` bzw. `useBereichZustand(id, start)` benutzen
// (src/store/menuSichtbarStore.ts). Unterpunkte mit `elternteil` (Pausenraum, Client Geräte)
// stehen NICHT hier, sondern kommen aus MENU_CATALOG (kinderVon).
export interface BereichDef { key: string; label: string }

export const BEREICHE: Partial<Record<Screen, BereichDef[]>> = {
  'software-installations': [
    { key: 'solidworks', label: 'SolidWorks 2024 SP5' },
    { key: 'xelion', label: 'Xelion Desktop' },
    { key: 'jabra', label: 'Jabra Software' },
    { key: 'enaio', label: 'Enaio' },
    { key: 'freecad', label: '3D-Viewer (FreeCAD)' },
    { key: 'vcredist', label: 'Visual C++ Laufzeit' },
    { key: 'itadmintool', label: 'IT Admin Tool' },
  ],
  'pc-diagnosis': [
    { key: 'voll', label: 'Komplett-Diagnose' },
    { key: 'sap', label: 'SAP Fehlersuche' },
    { key: 'sw', label: 'SolidWorks Diagnose' },
    { key: 'netz', label: 'Netzwerk Probleme' },
    { key: 'ueberwachung', label: 'Überwachung über Zeit' },
  ],
  'presentation-mode': [
    { key: 'browse', label: 'Vorhandene Präsentationen' },
    { key: 'editor', label: 'Präsentationen erstellen und bearbeiten' },
    { key: 'kiosks', label: 'Kiosk-Clients' },
    { key: 'edge', label: 'Edge-Anzeige (SSO)' },
  ],
  'nis2': [
    { key: 'access', label: 'Zugänge-Check' },
    { key: 'awareness', label: 'Awareness-Schulung' },
  ],
  'treiber-installation': [
    { key: 'auswahl', label: 'PC Auswahl' },
    { key: 'rollout', label: 'Rollout' },
  ],
  'hardware-inventory': [
    { key: 'lost', label: 'Verlorene Geräte' },
    { key: 'pickups', label: 'Pick-Ups' },
  ],
  'infra-marine': [
    { key: 'incident-response', label: 'Incident Response' },
    { key: 'permissions', label: 'Berechtigungen beantragen' },
    { key: 'toner', label: 'Tonerbestellung' },
    { key: 'visitor', label: 'Externe Besucher' },
    { key: 'server-perf', label: 'Server Performance' },
  ],
  'drucker': [
    { key: 'uebersicht', label: 'Übersicht' },
    { key: 'lager', label: 'Toner-Lager' },
    { key: 'charts', label: 'Charts' },
    { key: 'verbinden', label: 'Drucker verbinden' },
  ],
  'onboarding': [
    { key: 'overview', label: 'Übersicht' },
    { key: 'deploy', label: 'Verteilen' },
    { key: 'map', label: 'Karten-Editor' },
    { key: 'settings', label: 'Einstellungen' },
  ],
  'ticket-assignment': [
    { key: 'a', label: 'Ticket eingeben' },
    { key: 'c', label: 'Team-Übersicht' },
    { key: 'kalender', label: 'Abwesenheiten' },
    { key: 'd', label: 'Hilfe' },
  ],
  'accessory-inventory': [
    { key: 'bestand', label: 'Bestand' },
    { key: 'headsets', label: 'Headset Vergabe' },
  ],
  'usv': [
    { key: 'usv', label: 'USV' },
    { key: 'telefonanlage', label: 'Telefonanlage' },
  ],
  'proactive-radar': [
    { key: 'leasing', label: 'Geräte-Leasing' },
    { key: 'hygiene', label: 'AD-Hygiene' },
    { key: 'weekend', label: 'Wochenend-Check' },
    { key: 'fehler', label: 'PC-Fehler' },
  ],
  'network-radar': [
    { key: 'health', label: 'Health Score' },
    { key: 'patterns', label: 'Muster-Erkennung' },
  ],
  'xelion': [
    { key: 'bestand', label: 'Durchwahlen prüfen' },
    { key: 'lizenzen', label: 'Lizenzen' },
    { key: 'query', label: 'Abfrage' },
    { key: 'everphone', label: 'Everphone-Register' },
  ],
  'pc-migration': [
    { key: 'wizard', label: 'Assistent' },
    { key: 'history', label: 'Verlauf' },
    { key: 'templates', label: 'Vorlagen' },
  ],
  'user-presence': [
    { key: 'single', label: 'Einzelne Suche' },
    { key: 'mass', label: 'Massen-Scan' },
    { key: 'dns', label: 'DNS-Check' },
    { key: 'winrm', label: 'WinRM/DNS-Fehler' },
  ],
  'location-overview': [
    { key: 'Computer', label: 'Computer' },
    { key: 'Server', label: 'Server' },
    { key: 'Drucker', label: 'Drucker' },
    { key: 'Sonstige', label: 'Sonstige' },
  ],
  'drucker-uebersicht': [
    { key: 'halle', label: 'Halle & Zoll' },
    { key: 'verwaltung', label: 'Verwaltungsgebäude' },
  ],
  // Server: Reiter im Server-Fenster („Status“ bleibt immer) + das Feld „Health Check“ im Kopf
  'server': [
    { key: 'einrichten', label: 'Reiter „Einrichten“' },
    { key: 'zertifikate', label: 'Reiter „Zertifikate“' },
    { key: 'software', label: 'Reiter „Software“' },
    { key: 'diagnose', label: 'Reiter „Komplett-Diagnose“' },
    { key: 'health', label: 'Reiter „Schnell-Health-Check“' },
    { key: 'hci', label: 'Reiter „HCI-Fragebogen“' },
    { key: 'healthcheck', label: 'Health Check (DISM + SFC) im Kopf' },
  ],
}

/** Unterbereiche eines Menüpunkts für die Rechte-Ansicht: Unterpunkte (elternteil) + BEREICHE. */
export function unterbereicheVon(id: string): BereichDef[] {
  return [...kinderVon(id).map(k => ({ key: k.id as string, label: k.label })), ...(BEREICHE[id as Screen] || [])]
}
