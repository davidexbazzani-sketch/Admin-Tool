// ── Menü-Sichtbarkeit: zentrale Logik + Speicher-Format ──────────────────────
// Der Master-Admin steuert unter "Einstellungen → Menüpunkte ein-/ausblenden"
// pro Menüpunkt EINEN von vier Zuständen:
//   'all'    → für alle sichtbar (Benutzer, Admin, Master)
//   'admin'  → erst ab Admin sichtbar (Admin + Master)
//   'master' → nur für Master-Admin sichtbar
//   'hidden' → für niemanden sichtbar (komplett ausgeblendet)
//
// Persistiert in settings/menu_visibility.json:
//   { hidden: string[], minRole: { [id]: 'admin' | 'master_admin' } }
// Alt-Format (masterOnly: string[]) wird beim Laden migriert (→ minRole master).
//
// Diese Datei ist die EINZIGE Quelle der Sichtbarkeits-Auswertung. Sidebar und
// die Hintergrund-Controller (Lizenz-/Mitarbeiter-Alarme) nutzen sie, damit die
// Logik nie auseinanderläuft.

export type MenuRole = 'admin' | 'master_admin'
export type MenuVisibilityState = 'all' | 'admin' | 'master' | 'hidden'

export interface MenuVisibility {
  hidden: Set<string>
  minRole: Record<string, MenuRole>
}

interface MenuVisibilityFile {
  hidden?: string[]
  minRole?: Record<string, MenuRole>
  masterOnly?: string[]   // Alt-Format (Rückwärtskompatibilität)
}

// Rohdaten aus menu_visibility.json → normalisierte Sichtbarkeit (inkl. Migration).
export function parseMenuVisibility(data: unknown): MenuVisibility {
  const d = (data ?? {}) as MenuVisibilityFile
  const hidden = new Set<string>(Array.isArray(d.hidden) ? d.hidden : [])
  const minRole: Record<string, MenuRole> = {}
  if (d.minRole && typeof d.minRole === 'object') {
    for (const [id, role] of Object.entries(d.minRole)) {
      if (role === 'admin' || role === 'master_admin') minRole[id] = role
    }
  }
  // Migration Alt-Format: masterOnly-Einträge waren zugleich in hidden. Sie
  // bedeuteten "nur Master sieht es" → neue Darstellung: minRole master + NICHT
  // mehr komplett hidden.
  if (Array.isArray(d.masterOnly)) {
    for (const id of d.masterOnly) {
      if (!minRole[id]) minRole[id] = 'master_admin'
      hidden.delete(id)
    }
  }
  return { hidden, minRole }
}

// Serialisieren für das Speichern.
export function serializeMenuVisibility(v: MenuVisibility): { hidden: string[]; minRole: Record<string, MenuRole> } {
  return { hidden: [...v.hidden], minRole: { ...v.minRole } }
}

// Aktueller Zustand eines Menüpunkts (für die Einstellungs-UI).
export function menuStateOf(id: string, v: MenuVisibility): MenuVisibilityState {
  if (v.hidden.has(id)) return 'hidden'
  const r = v.minRole[id]
  if (r === 'master_admin') return 'master'
  if (r === 'admin') return 'admin'
  return 'all'
}

// Zustand setzen (liefert eine NEUE MenuVisibility zurück, immutabel).
export function withMenuState(id: string, state: MenuVisibilityState, v: MenuVisibility): MenuVisibility {
  const hidden = new Set(v.hidden)
  const minRole = { ...v.minRole }
  hidden.delete(id)
  delete minRole[id]
  if (state === 'hidden') hidden.add(id)
  else if (state === 'admin') minRole[id] = 'admin'
  else if (state === 'master') minRole[id] = 'master_admin'
  return { hidden, minRole }
}

// ── Auswertung: darf dieser Nutzer den Menüpunkt sehen? ──────────────────────
export interface VisibilityContext {
  isAdmin: boolean                    // Admin ODER Master
  isMaster: boolean
  userOverride: Set<string> | null    // per-Benutzer-Override (hidden-Set) oder null
  hidden: Set<string>
  minRole: Record<string, MenuRole>
  alwaysVisibleGlobal?: Set<string>   // nie global ausblendbar (Home, Einstellungen, …)
  builtinAdminOnly?: boolean          // fest im Katalog verankerte Rolle
  builtinMasterOnly?: boolean
}

export function computeMenuVisible(id: string, ctx: VisibilityContext): boolean {
  // 1. Fest im Katalog verankerte Rollen-Anforderung (immer bindend)
  if (ctx.builtinMasterOnly) return ctx.isMaster
  if (ctx.builtinAdminOnly && !ctx.isAdmin) return false

  // 2. Per-Benutzer-Override ist für Nicht-Master maßgeblich (kann alles ausblenden)
  if (ctx.userOverride && !ctx.isMaster) {
    return !ctx.userOverride.has(id)
  }

  // 3. Nie ausblendbare globale Einträge
  if (ctx.alwaysVisibleGlobal?.has(id)) return true

  // 4. Komplett ausgeblendet
  if (ctx.hidden.has(id)) return false

  // 5. Konfigurierte Mindest-Rolle
  const req = ctx.minRole[id]
  if (req === 'master_admin' && !ctx.isMaster) return false
  if (req === 'admin' && !ctx.isAdmin) return false

  return true
}
