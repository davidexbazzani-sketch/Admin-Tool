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
}

export const MENU_CATALOG: MenuCatalogItem[] = [
  { id: 'home', label: 'Startbildschirm', category: 'Start', topLevel: true, alwaysVisible: true },

  // Standort
  { id: 'location-overview',      label: 'Standort-Übersicht',     category: 'Standort' },
  { id: 'access-points',          label: 'Access Points',          category: 'Standort' },
  { id: 'departments-overview',   label: 'Abteilungs-Übersicht',   category: 'Standort' },
  { id: 'organization-structure', label: 'Organisationsstruktur',  category: 'Standort' },

  // User
  { id: 'user-overview', label: 'Benutzer-Übersicht', category: 'User' },
  { id: 'user-info',     label: 'Benutzer Info',      category: 'User' },
  { id: 'gruppen-suche', label: 'Gruppen-Suche',      category: 'User', adminOnly: true },

  // IT Support
  { id: 'checklists',             label: 'Checklisten',             category: 'IT Support', adminOnly: true },
  { id: 'hardware-inventory',     label: 'Hardware-Inventur',       category: 'IT Support', adminOnly: true },
  { id: 'accessory-inventory',    label: 'Zubehör Inventur',        category: 'IT Support', adminOnly: true },
  { id: 'software-installations', label: 'Software Installationen', category: 'IT Support', adminOnly: true },
  { id: 'pc-migration',           label: 'PC-Migration',            category: 'IT Support', adminOnly: true },
  { id: 'pc-diagnosis',           label: 'PC-Diagnose',             category: 'IT Support' },
  { id: 'employee-management',    label: 'Mitarbeiterverwaltung',   category: 'IT Support', adminOnly: true },
  { id: 'onboarding',             label: 'Onboarding',              category: 'IT Support', adminOnly: true },
  { id: 'servicenow',             label: 'ServiceNow / Tickets',    category: 'IT Support', adminOnly: true },

  // Infrastruktur
  { id: 'endpoint-devices',   label: 'Endgeräte-Übersicht',    category: 'Infrastruktur' },
  { id: 'infra-marine',       label: 'Infrastruktur Marine',   category: 'Infrastruktur' },
  { id: 'infra-projects',     label: 'Infrastruktur Projekte', category: 'Infrastruktur' },
  { id: 'scheduled-tasks',    label: 'Geplante Aufgaben',      category: 'Infrastruktur', adminOnly: true },
  { id: 'presentation-mode',  label: 'Präsentationsmodus',     category: 'Infrastruktur', adminOnly: true },
  { id: 'user-presence',      label: 'Wo angemeldet?',         category: 'Infrastruktur' },
  { id: 'licenses',           label: 'Lizenzen-Kalender',      category: 'Infrastruktur', adminOnly: true },
  { id: 'software-inventory', label: 'Software-Inventar',      category: 'Infrastruktur', adminOnly: true },
  { id: 'network-radar',      label: 'Netzwerk-Radar',         category: 'Infrastruktur', adminOnly: true },
  { id: 'backups',            label: 'Back-Ups',               category: 'Infrastruktur', adminOnly: true },
  { id: 'usv',                label: 'USV',                    category: 'Infrastruktur' },
  { id: 'dashboards',         label: 'Dashboards',             category: 'Infrastruktur' },

  // Telefonie
  { id: 'xelion',            label: 'Diensthandy & Xelion', category: 'Telefonie' },
  { id: 'rufnummer-vergabe', label: 'Rufnummer Vergabe',    category: 'Telefonie', adminOnly: true },

  // Sonstiges
  { id: 'trickbox',       label: 'Trickbox',         category: 'Sonstiges' },
  { id: 'pdf-tools',      label: 'PDF-Werkzeuge',    category: 'Sonstiges' },
  { id: 'knowledge-base', label: 'Wissensdatenbank', category: 'Sonstiges' },
  { id: 'it-guru',        label: 'IT Guru',          category: 'Sonstiges' },

  { id: 'results', label: 'Ergebnisse', category: 'Ergebnisse', topLevel: true },

  // Einstellungen
  { id: 'settings',        label: 'Einstellungen',      category: 'Einstellungen', alwaysVisible: true },
  { id: 'user-management', label: 'Benutzerverwaltung', category: 'Einstellungen', masterAdminOnly: true },
  { id: 'user-logs',       label: 'Benutzer-Logs',      category: 'Einstellungen', masterAdminOnly: true },
  { id: 'bug-mailbox',     label: 'Bug-Meldungen',      category: 'Einstellungen', masterAdminOnly: true },
]
