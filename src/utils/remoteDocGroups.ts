// ── Remote Doc – Kachel-Gruppen ──────────────────────────────────────────────
// Bündelt die vielen Einzel-Kategorien aus remoteCommands.ts zu ~12 großen
// Themen-Kacheln. Die Landing-Ansicht zeigt die Gruppen; ein Klick öffnet die
// zugehörigen Kategorien (vollflächig). Reine Metadaten – KEIN React/Icon hier
// (Icons werden im Screen gemappt, analog ITEM_ICONS in Sidebar.tsx).
//
// WICHTIG: categoryIds referenzieren die FINALEN Kategorie-IDs nach dem Merge in
// remoteCommands.ts (drivers→devmgr, remotetasks→tasks, diskmgmt→disk). Neue
// Kategorien: registry, restore, activation.

export interface CategoryGroup {
  id: string
  label: string
  icon: string        // Schlüssel für die Icon-Map im Screen (lucide-Name)
  hint: string        // kurze Beschreibung auf der Kachel
  categoryIds: string[]
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { id: 'g-network', label: 'Netzwerk & Verbindungen', icon: 'Network', hint: 'IP, DNS, WLAN, Freigaben, Laufwerke',
    categoryIds: ['net', 'wlan', 'shares', 'drivemap'] },
  { id: 'g-processes', label: 'Prozesse, Dienste & Aufgaben', icon: 'Activity', hint: 'Prozesse, Dienste, geplante Aufgaben',
    categoryIds: ['procs', 'proc', 'svc', 'tasks'] },
  { id: 'g-system', label: 'System & Wartung', icon: 'Wrench', hint: 'Reparatur, Cache, Browser, Einstellungen, Registry',
    categoryIds: ['repair', 'appcache', 'browser', 'explorer', 'envvars', 'sysconfig', 'fileassoc', 'registry'] },
  { id: 'g-updates', label: 'Updates & Wiederherstellung', icon: 'RefreshCw', hint: 'Windows-Update, GPO, Wiederherstellung, Lizenz',
    categoryIds: ['gpo', 'restore', 'activation'] },
  { id: 'g-software', label: 'Software & Programme', icon: 'Package', hint: 'Installieren, deinstallieren, Winget',
    categoryIds: ['software', 'swinstall'] },
  { id: 'g-files', label: 'Dateien & Übertragung', icon: 'FolderOpen', hint: 'Ordner durchsuchen, Dateien kopieren',
    categoryIds: ['fileops', 'filetransfer'] },
  { id: 'g-hardware', label: 'Hardware & Treiber', icon: 'CircuitBoard', hint: 'Geräte-Manager, Treiber, Audio, Hardware-Info',
    categoryIds: ['hw', 'devmgr', 'audio'] },
  { id: 'g-storage', label: 'Datenträger & Speicher', icon: 'HardDrive', hint: 'Partitionen, SMART, Aufräumen',
    categoryIds: ['disk'] },
  { id: 'g-users', label: 'Benutzer & Sitzungen', icon: 'Users', hint: 'Anmeldungen, Konten, Profile',
    categoryIds: ['sessions', 'userprofiles'] },
  { id: 'g-security', label: 'Sicherheit & Domäne', icon: 'ShieldCheck', hint: 'Firewall, Defender, Zertifikate, Domäne',
    categoryIds: ['security', 'certs', 'domain'] },
  { id: 'g-power', label: 'Energie, Neustart & Fernzugriff', icon: 'Power', hint: 'Energie, Neustart, RDP, Screenshot',
    categoryIds: ['power', 'reboot', 'rdp', 'screenshot'] },
  { id: 'g-special', label: 'Spezial-Apps & Diagnose', icon: 'Puzzle', hint: 'Zscaler, enaio, Diagnose-Checks, Extras',
    categoryIds: ['zscaler', 'enaio', 'diag', 'fun'] },
]

// catId -> Gruppe (für Suche/Favoriten-Sprung in die richtige Kachel)
const CAT_TO_GROUP: Map<string, CategoryGroup> = (() => {
  const m = new Map<string, CategoryGroup>()
  for (const g of CATEGORY_GROUPS) for (const c of g.categoryIds) m.set(c, g)
  return m
})()

export function groupForCategory(catId: string): CategoryGroup | undefined {
  return CAT_TO_GROUP.get(catId)
}
