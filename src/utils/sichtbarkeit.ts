// ── Wer sieht welchen Menüpunkt und welchen Unterbereich? (reine Funktionen, testbar) ──
// Seit 19.11.2026 die EINZIGE Auswertung für Sidebar, Bildschirm-Wache (App.tsx), Kacheln und
// Reiter in den Bildschirmen sowie die Alarm-Controller.
//
// Reihenfolge:
//   1. Gründer (Davidxe) sieht immer alles.
//   2. Feste Rollengrenze aus dem Katalog (adminOnly / masterAdminOnly) — hängt an den
//      Hintergrund-Abläufen, wird nie überstimmt.
//   3. Modus des Benutzers (Einstellungen → „Benutzer & Rechte“):
//      · 'nur'      → nur die ausgewählten Menüpunkte
//      · 'ausser'   → alle außer den ausgewählten (= Bedeutung des alten Per-Benutzer-Overrides)
//      · 'standard' → die globalen Regeln aus settings/menu_visibility.json (hidden/minRole)
//   4. Unterbereiche (Kacheln/Reiter, auch die Unterpunkte mit `elternteil`): die Liste des
//      Benutzers ersetzt je Menüpunkt die Standard-Liste („für alle ausgeblendet“).
//   5. Ein Obermenüpunkt mit Unterpunkten verschwindet, wenn keiner davon sichtbar ist.
//
// Schlüssel eines Benutzers ist die Corp ID (Windows-Anmeldung), kleingeschrieben — so lässt
// sich auch jemand einstellen, der das Tool noch nie geöffnet hat.

import { MENU_CATALOG, BEREICHE, kinderVon, type MenuCatalogItem } from './menuCatalog'
import type { MenuRole } from './menuVisibility'

export type Rolle = 'user' | 'admin' | 'master_admin'
export type RechteModus = 'standard' | 'ausser' | 'nur'

export interface BenutzerRecht {
  modus: RechteModus
  /** ausser → ausgeblendete Menüpunkte · nur → erlaubte Menüpunkte · standard → leer */
  menue: string[]
  /** je Menüpunkt die ausgeblendeten Unterbereiche (ersetzt je Menüpunkt den Standard) */
  bereiche: Record<string, string[]>
  geaendert?: { von: string; am: string }
}

export interface RechteDatei {
  version: 1
  /** für alle ausgeblendete Unterbereiche (gilt für jeden ohne eigene Liste beim Menüpunkt) */
  standard: { bereiche: Record<string, string[]> }
  /** Schlüssel = Corp ID kleingeschrieben */
  benutzer: Record<string, BenutzerRecht>
  /** wann aus settings/user_menu_overrides.json übernommen wurde */
  umgestellt?: string
}

export interface SichtKontext {
  rolle: Rolle
  gruender: boolean
  recht: BenutzerRecht | null
  standardBereiche: Record<string, string[]>
  /** globale Regeln (settings/menu_visibility.json) */
  hidden: Set<string>
  minRole: Record<string, MenuRole>
}

/** Im Modus „standard“ nie global ausblendbar (sonst sperrt man sich selbst aus). */
export const IMMER_GLOBAL: ReadonlySet<string> = new Set(['home', 'settings', 'user-logs', 'bug-mailbox'])

export const LEERE_RECHTE: RechteDatei = { version: 1, standard: { bereiche: {} }, benutzer: {} }

/** Corp ID eines Kontos (Windows-Anmeldung, sonst Benutzername), kleingeschrieben. */
export function corpKey(u: { windowsUsername?: string; username?: string } | null | undefined): string {
  return ((u?.windowsUsername || u?.username || '') + '').trim().toLowerCase()
}

/** Geschützter Gründer-Master: sieht immer alles, ist nicht änderbar. */
export function istGruender(u: { isFounder?: boolean; username?: string } | null | undefined): boolean {
  return !!u?.isFounder || (u?.username || '').toLowerCase() === 'davidxe'
}

const KATALOG = new Map<string, MenuCatalogItem>(MENU_CATALOG.map(m => [m.id, m]))

export function rolleReicht(item: Pick<MenuCatalogItem, 'adminOnly' | 'masterAdminOnly'> | undefined, rolle: Rolle): boolean {
  if (!item) return true
  if (item.masterAdminOnly) return rolle === 'master_admin'
  if (item.adminOnly) return rolle === 'master_admin' || rolle === 'admin'
  return true
}

function globalErlaubt(id: string, ctx: SichtKontext): boolean {
  if (IMMER_GLOBAL.has(id)) return true
  if (ctx.hidden.has(id)) return false
  const r = ctx.minRole[id]
  if (r === 'master_admin' && ctx.rolle !== 'master_admin') return false
  if (r === 'admin' && ctx.rolle === 'user') return false
  return true
}

/** Liste der ausgeblendeten Unterbereiche eines Menüpunkts für diesen Kontext. */
export function versteckteBereiche(menuId: string, ctx: Pick<SichtKontext, 'gruender' | 'recht' | 'standardBereiche'>): string[] {
  if (ctx.gruender) return []
  const eigen = ctx.recht?.bereiche?.[menuId]
  return Array.isArray(eigen) ? eigen : (ctx.standardBereiche[menuId] || [])
}

export function bereichSichtbar(menuId: string, key: string, ctx: Pick<SichtKontext, 'gruender' | 'recht' | 'standardBereiche'>): boolean {
  return !versteckteBereiche(menuId, ctx).includes(key)
}

/** Menüpunkt ohne die Prüfung „hat er sichtbare Unterpunkte?“ (für die Haken im Editor) */
export function punktErlaubt(id: string, ctx: SichtKontext): boolean {
  const item = KATALOG.get(id)
  if (!item) return true                      // nicht im Katalog (z. B. Remote Doc) → wie bisher
  if (ctx.gruender) return true
  if (!rolleReicht(item, ctx.rolle)) return false
  const r = ctx.recht
  if (item.elternteil) {
    const eltern = item.elternteil
    if (!punktErlaubt(eltern, ctx)) return false
    if (!bereichSichtbar(eltern, id, ctx)) return false
    if (!r || r.modus === 'standard') return globalErlaubt(id, ctx)
    // alte Override-Listen konnten auch Unterpunkte enthalten
    if (r.modus === 'ausser') return !r.menue.includes(id)
    return true                               // 'nur': Obermenüpunkt erlaubt → Unterpunkte auch
  }
  if (!r || r.modus === 'standard') return globalErlaubt(id, ctx)
  if (r.modus === 'nur') return r.menue.includes(id)
  return !r.menue.includes(id)
}

/** Bildschirme, die auch ohne einen ihrer Unterbereiche nutzbar bleiben (Hauptansicht bleibt immer). */
export const HAUPTANSICHT_BLEIBT: ReadonlySet<string> = new Set(['pc-diagnosis', 'hardware-inventory', 'server'])

/** Darf dieser Benutzer den Menüpunkt (bzw. Bildschirm) sehen? */
export function menuePunktSichtbar(id: string, ctx: SichtKontext): boolean {
  if (!punktErlaubt(id, ctx)) return false
  if (ctx.gruender) return true
  const kinder = kinderVon(id)
  if (kinder.length && !kinder.some(k => punktErlaubt(k.id, ctx))) return false
  // alle Reiter/Kacheln ausgeblendet → der Menüpunkt hätte keinen Inhalt mehr
  const tabs = BEREICHE[id as keyof typeof BEREICHE]
  if (tabs?.length && !HAUPTANSICHT_BLEIBT.has(id) && tabs.every(t => !bereichSichtbar(id, t.key, ctx))) return false
  return true
}

/** Sichtbarkeit aller Katalog-Punkte + ausgeblendete Unterbereiche je Menüpunkt (für den Store). */
export function berechneAlles(ctx: SichtKontext): { sichtbar: Record<string, boolean>; bereiche: Record<string, string[]> } {
  const sichtbar: Record<string, boolean> = {}
  for (const m of MENU_CATALOG) sichtbar[m.id] = menuePunktSichtbar(m.id, ctx)
  const bereiche: Record<string, string[]> = {}
  for (const id of Object.keys(BEREICHE)) {
    const v = versteckteBereiche(id, ctx)
    if (v.length) bereiche[id] = v
  }
  return { sichtbar, bereiche }
}

// ── Datei lesen/prüfen ──────────────────────────────────────────────────────

const strListe = (x: unknown): string[] => Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string' && !!s))] : []
function bereichsMap(x: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  if (x && typeof x === 'object') for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = strListe(v)
  }
  return out
}

export function bereinigeRecht(x: unknown): BenutzerRecht | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const modus: RechteModus = o.modus === 'nur' || o.modus === 'ausser' ? o.modus : 'standard'
  const g = o.geaendert as { von?: unknown; am?: unknown } | undefined
  return {
    modus,
    menue: modus === 'standard' ? [] : strListe(o.menue),
    bereiche: bereichsMap(o.bereiche),
    ...(g && typeof g.von === 'string' && typeof g.am === 'string' ? { geaendert: { von: g.von, am: g.am } } : {}),
  }
}

export function bereinigeRechte(x: unknown): RechteDatei | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  const benutzer: Record<string, BenutzerRecht> = {}
  if (o.benutzer && typeof o.benutzer === 'object') {
    for (const [k, v] of Object.entries(o.benutzer as Record<string, unknown>)) {
      const r = bereinigeRecht(v)
      const key = k.trim().toLowerCase()
      if (r && key) benutzer[key] = r
    }
  }
  const std = (o.standard && typeof o.standard === 'object') ? (o.standard as Record<string, unknown>) : {}
  return { version: 1, standard: { bereiche: bereichsMap(std.bereiche) }, benutzer, ...(typeof o.umgestellt === 'string' ? { umgestellt: o.umgestellt } : {}) }
}

/** Hat das Recht überhaupt eine Wirkung? (sonst kann der Eintrag weg) */
export function rechtLeer(r: BenutzerRecht | null | undefined): boolean {
  return !r || (r.modus === 'standard' && Object.keys(r.bereiche || {}).length === 0)
}

// ── Umstieg vom alten Per-Benutzer-Override (Schlüssel = zufällige Benutzer-ID) ──

/** Alte Liste „ausgeblendet“ → neues Recht im Modus „ausser“; Unterpunkte werden zu Unterbereichen. */
export function rechtAusAltemOverride(hidden: string[]): BenutzerRecht {
  const menue: string[] = []
  const bereiche: Record<string, string[]> = {}
  for (const id of strListe(hidden)) {
    const eltern = KATALOG.get(id)?.elternteil
    if (eltern) (bereiche[eltern] ||= []).push(id)
    else menue.push(id)
  }
  return { modus: 'ausser', menue, bereiche }
}

/** Ganze alte Datei → neue Datei (über users.json auf Corp IDs abgebildet). */
export function umstellen(
  alt: Record<string, { hidden?: string[] }> | null | undefined,
  users: { id: string; username: string; windowsUsername?: string }[],
  jetzt: string,
): RechteDatei {
  const benutzer: Record<string, BenutzerRecht> = {}
  for (const [id, eintrag] of Object.entries(alt || {})) {
    const u = users.find(x => x.id === id)
    const key = corpKey(u)
    if (!u || !key || !Array.isArray(eintrag?.hidden)) continue
    benutzer[key] = { ...rechtAusAltemOverride(eintrag.hidden), geaendert: { von: 'Umstellung', am: jetzt } }
  }
  return { version: 1, standard: { bereiche: {} }, benutzer, umgestellt: jetzt }
}

/**
 * Eintrag für die ALTE Datei (ältere Tool-Versionen): Momentaufnahme „alles, was nicht sichtbar
 * ist“ — mit der alten Logik (Override ersetzt die globalen Regeln) ergibt das dieselbe Sidebar.
 * `null` = kein Eintrag nötig (der Benutzer folgt den globalen Regeln).
 */
export function altEintrag(ctx: SichtKontext): { hidden: string[] } | null {
  const r = ctx.recht
  if (ctx.gruender || !r) return null
  const kinderVersteckt = MENU_CATALOG.some(m => m.elternteil && !bereichSichtbar(m.elternteil, m.id, ctx))
  if (r.modus === 'standard' && !kinderVersteckt) return null
  const hidden = MENU_CATALOG.filter(m => !menuePunktSichtbar(m.id, ctx)).map(m => m.id as string)
  return { hidden }
}
