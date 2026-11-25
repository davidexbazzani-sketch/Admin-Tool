// ── Editor-Logik für „Benutzer & Rechte“ (reine Funktionen, testbar) ─────────
import { MENU_CATALOG, BEREICHE, kinderVon, unterbereicheVon, type MenuCatalogItem } from '../../../utils/menuCatalog'
import {
  menuePunktSichtbar, punktErlaubt, versteckteBereiche, rolleReicht, type BenutzerRecht, type RechteModus, type SichtKontext,
} from '../../../utils/sichtbarkeit'
import type { Screen } from '../../../types'

/** Menüpunkte, die als Zeile in der Liste stehen (Unterpunkte hängen am Obermenüpunkt). */
export const ZEILEN: MenuCatalogItem[] = MENU_CATALOG.filter(m => !m.elternteil)
/** Kategorien in Sidebar-Reihenfolge. */
export const KATEGORIEN: string[] = [...new Set(ZEILEN.map(m => m.category))]

export const LEERES_RECHT: BenutzerRecht = { modus: 'standard', menue: [], bereiche: {} }

export const hatUnterbereiche = (id: string) => kinderVon(id).length > 0 || !!BEREICHE[id as Screen]?.length

/** Haken eines Menüpunkts — ohne die Regel „Obermenüpunkt nur mit sichtbarem Unterpunkt“. */
export function punktAn(id: string, ctx: SichtKontext): boolean {
  return punktErlaubt(id, { ...ctx, gruender: false })
}

/** Modus wechseln, ohne dass sich ändert, was der Benutzer sieht (soweit möglich). */
export function modusWechseln(alt: BenutzerRecht, neu: RechteModus, ctx: SichtKontext): BenutzerRecht {
  if (neu === alt.modus) return alt
  if (neu === 'standard') return { ...alt, modus: 'standard', menue: [] }
  const erlaubt = ZEILEN.filter(m => rolleReicht(m, ctx.rolle))
  const an = erlaubt.filter(m => punktAn(m.id, { ...ctx, recht: alt })).map(m => m.id as string)
  if (neu === 'nur') return { ...alt, modus: 'nur', menue: an }
  return { ...alt, modus: 'ausser', menue: erlaubt.map(m => m.id as string).filter(id => !an.includes(id)) }
}

/** Haken eines Menüpunkts setzen (nur in den Modi „ausser“ und „nur“). */
export function punktSetzen(r: BenutzerRecht, id: string, sichtbar: boolean): BenutzerRecht {
  if (r.modus === 'standard') return r
  const ohne = r.menue.filter(x => x !== id)
  if (r.modus === 'nur') return { ...r, menue: sichtbar ? [...ohne, id] : ohne }
  return { ...r, menue: sichtbar ? ohne : [...ohne, id] }
}

/** Alle erlaubten Menüpunkte an oder aus (Modus „ausser“ bzw. „nur“). */
export function allePunkte(r: BenutzerRecht, an: boolean, ctx: Pick<SichtKontext, 'rolle'>, behalten: string[] = []): BenutzerRecht {
  const ids = ZEILEN.filter(m => rolleReicht(m, ctx.rolle)).map(m => m.id as string)
  if (r.modus === 'nur') return { ...r, menue: an ? ids : ids.filter(i => behalten.includes(i)) }
  if (r.modus === 'ausser') return { ...r, menue: an ? [] : ids.filter(i => !behalten.includes(i)) }
  return r
}

/** Unterbereich ein-/ausblenden: die Liste des Benutzers ersetzt beim Menüpunkt den Standard. */
export function bereichSetzen(r: BenutzerRecht, menuId: string, key: string, sichtbar: boolean, standardBereiche: Record<string, string[]>): BenutzerRecht {
  const aktuell = versteckteBereiche(menuId, { gruender: false, recht: r, standardBereiche })
  const neu = sichtbar ? aktuell.filter(k => k !== key) : [...new Set([...aktuell, key])]
  const bereiche = { ...r.bereiche, [menuId]: neu }
  // gleich wie Standard → eigener Eintrag unnötig
  const std = standardBereiche[menuId] || []
  if (neu.length === std.length && neu.every(k => std.includes(k))) delete bereiche[menuId]
  return { ...r, bereiche }
}

/** Eigene Liste beim Menüpunkt verwerfen (→ wieder wie Standard). */
export function bereichWieStandard(r: BenutzerRecht, menuId: string): BenutzerRecht {
  const bereiche = { ...r.bereiche }
  delete bereiche[menuId]
  return { ...r, bereiche }
}

/** Wie viele der erlaubten Menüpunkte sieht der Benutzer? */
export function zaehle(ctx: SichtKontext): { sichtbar: number; erlaubt: number } {
  const erlaubt = ZEILEN.filter(m => rolleReicht(m, ctx.rolle))
  return { sichtbar: erlaubt.filter(m => menuePunktSichtbar(m.id, ctx)).length, erlaubt: erlaubt.length }
}

/** Vorschau der Seitenleiste: Kategorien mit sichtbaren Punkten. */
export function vorschau(ctx: SichtKontext): { kategorie: string; punkte: string[] }[] {
  return KATEGORIEN.map(k => ({
    kategorie: k,
    punkte: ZEILEN.filter(m => m.category === k && menuePunktSichtbar(m.id, ctx)).map(m => m.label),
  })).filter(g => g.punkte.length)
}

export { unterbereicheVon }
