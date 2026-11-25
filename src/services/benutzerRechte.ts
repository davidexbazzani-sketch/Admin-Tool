// ── Benutzer & Rechte: Ablage auf dem Netzlaufwerk ───────────────────────────
// settings/benutzer_rechte.json (neu, Schlüssel = Corp ID) — Auswertung in utils/sichtbarkeit.ts.
// Ältere Tool-Versionen lesen weiter settings/user_menu_overrides.json (Schlüssel = Benutzer-ID):
// beim Speichern wird dort für den betroffenen Benutzer eine Momentaufnahme mitgeschrieben,
// damit Einschränkungen auch in alten Versionen greifen.
// Globale Regeln je Menüpunkt (Alle / ab Admin / nur Master / aus) bleiben in
// settings/menu_visibility.json (unverändertes Format).

import { api } from '../electronAPI'
import type { AppUser } from '../types/auth'
import { parseMenuVisibility, type MenuVisibility } from '../utils/menuVisibility'
import {
  bereinigeRechte, bereinigeRecht, umstellen, altEintrag, corpKey, istGruender, rechtLeer, LEERE_RECHTE,
  type RechteDatei, type BenutzerRecht, type SichtKontext, type Rolle,
} from '../utils/sichtbarkeit'

export const RECHTE_PFAD = 'settings/benutzer_rechte.json'
export const ALT_PFAD = 'settings/user_menu_overrides.json'
export const MENU_VISIBILITY_PATH = 'settings/menu_visibility.json'

type AltDatei = Record<string, { hidden?: string[] }>

/** Neue Datei lesen — `null`, wenn es sie (noch) nicht gibt oder sie nicht lesbar ist. */
export async function ladeRechte(): Promise<RechteDatei | null> {
  try { return bereinigeRechte(await api().netReadJsonAsync<unknown>(RECHTE_PFAD)) } catch { return null }
}

export async function ladeAltOverrides(): Promise<AltDatei> {
  try {
    const d = await api().netReadJsonAsync<AltDatei>(ALT_PFAD)
    return d && typeof d === 'object' ? d : {}
  } catch { return {} }
}

const gibtEs = async (pfad: string): Promise<boolean> => { try { return await api().netExists(pfad) } catch { return true } }

/**
 * Vor dem Schreiben: Datei frisch lesen. Ist sie da, aber nicht lesbar (Netzfehler, halb
 * geschrieben), wird NICHT geschrieben — sonst gingen die Einstellungen aller anderen verloren.
 */
async function ladeZumSchreiben(): Promise<RechteDatei> {
  const d = await ladeRechte()
  if (d) return d
  if (await gibtEs(RECHTE_PFAD)) throw new Error('Die Rechte-Datei ist gerade nicht lesbar (Netzlaufwerk). Bitte gleich noch einmal versuchen.')
  return { ...LEERE_RECHTE, benutzer: {}, standard: { bereiche: {} } }
}

export async function ladeGlobal(): Promise<MenuVisibility> {
  try { return parseMenuVisibility(await api().netReadJsonAsync<unknown>(MENU_VISIBILITY_PATH)) } catch { return parseMenuVisibility(null) }
}

/**
 * Für die Verwaltung: neue Datei laden; gibt es sie noch nicht, einmalig aus der alten
 * Override-Datei übernehmen und speichern (die alte Datei bleibt bestehen).
 */
export async function ladeRechteFuerVerwaltung(users: AppUser[], von: string): Promise<RechteDatei> {
  const vorhanden = await ladeRechte()
  if (vorhanden) return vorhanden
  if (await gibtEs(RECHTE_PFAD)) throw new Error('Die Rechte-Datei ist gerade nicht lesbar (Netzlaufwerk). Bitte gleich noch einmal öffnen.')
  const altRoh = await api().netReadJsonAsync<AltDatei>(ALT_PFAD).catch(() => null)
  if (!altRoh && await gibtEs(ALT_PFAD)) throw new Error('Die alte Menü-Datei ist gerade nicht lesbar (Netzlaufwerk). Bitte gleich noch einmal öffnen.')
  const neu = umstellen(altRoh && typeof altRoh === 'object' ? altRoh : {}, users, new Date().toISOString())
  if (Object.keys(neu.benutzer).length) neu.benutzer = Object.fromEntries(Object.entries(neu.benutzer).map(([k, r]) => [k, { ...r, geaendert: { von, am: neu.umgestellt! } }]))
  try { await api().netWriteJsonAsync(RECHTE_PFAD, neu) } catch { /* nächster Versuch beim nächsten Öffnen */ }
  return neu
}

/** Kontext für einen Benutzer aus der Verwaltungssicht (für Vorschau und alte Datei). */
export function kontextFuer(u: Pick<AppUser, 'role' | 'username' | 'isFounder'> & { windowsUsername?: string }, recht: BenutzerRecht | null, datei: RechteDatei, global: MenuVisibility): SichtKontext {
  return {
    rolle: u.role as Rolle,
    gruender: istGruender(u),
    recht,
    standardBereiche: datei.standard.bereiche,
    hidden: global.hidden,
    minRole: global.minRole,
  }
}

/** Alte Datei für alle Konten dieser Corp ID nachziehen (ältere Tool-Versionen). */
async function altNachziehen(key: string, recht: BenutzerRecht | null, datei: RechteDatei, users: AppUser[]): Promise<void> {
  const betroffen = users.filter(u => corpKey(u) === key)
  if (!betroffen.length) return
  const global = await ladeGlobal()
  let alt: AltDatei
  try {
    const d = await api().netReadJsonAsync<AltDatei>(ALT_PFAD)
    if (d && typeof d === 'object') alt = d
    else if (await gibtEs(ALT_PFAD)) return       // da, aber nicht lesbar → lieber nichts schreiben
    else alt = {}
  } catch { return }
  let geaendert = false
  for (const u of betroffen) {
    const e = altEintrag(kontextFuer(u, recht, datei, global))
    if (e) { alt[u.id] = e; geaendert = true }
    else if (alt[u.id]) { delete alt[u.id]; geaendert = true }
  }
  if (geaendert) { try { await api().netWriteJsonAsync(ALT_PFAD, alt) } catch { /* nur Rückwärtskompatibilität */ } }
}

/**
 * Recht eines Benutzers speichern (`null` = eigene Einstellung entfernen). Liest die Datei
 * frisch (zwei Verwaltende gleichzeitig überschreiben sich nur beim selben Benutzer).
 */
export async function speichereRecht(corpId: string, recht: BenutzerRecht | null, users: AppUser[], von: string): Promise<{ ok: boolean; datei: RechteDatei; error?: string }> {
  const key = corpId.trim().toLowerCase()
  let datei: RechteDatei
  try { datei = await ladeZumSchreiben() } catch (e) { return { ok: false, datei: LEERE_RECHTE, error: e instanceof Error ? e.message : String(e) } }
  const sauber = recht ? bereinigeRecht(recht) : null
  if (!sauber || rechtLeer(sauber)) delete datei.benutzer[key]
  else datei.benutzer[key] = { ...sauber, geaendert: { von, am: new Date().toISOString() } }
  let ok = false
  try { ok = await api().netWriteJsonAsync(RECHTE_PFAD, datei) } catch { ok = false }
  if (!ok) return { ok: false, datei, error: 'Netzlaufwerk nicht erreichbar oder keine Schreibrechte.' }
  await altNachziehen(key, datei.benutzer[key] || null, datei, users)
  return { ok: true, datei }
}

/** Für alle ausgeblendete Unterbereiche speichern (Standard). */
export async function speichereStandardBereiche(bereiche: Record<string, string[]>): Promise<{ ok: boolean; datei: RechteDatei; error?: string }> {
  let datei: RechteDatei
  try { datei = await ladeZumSchreiben() } catch (e) { return { ok: false, datei: LEERE_RECHTE, error: e instanceof Error ? e.message : String(e) } }
  datei.standard = { bereiche: Object.fromEntries(Object.entries(bereiche).filter(([, v]) => v.length)) }
  let ok = false
  try { ok = await api().netWriteJsonAsync(RECHTE_PFAD, datei) } catch { ok = false }
  return { ok, datei }
}

/** Globale Regeln (Alle / ab Admin / nur Master / aus) speichern — unverändertes Format. */
export async function speichereGlobal(v: MenuVisibility): Promise<boolean> {
  try { return await api().netWriteJsonAsync(MENU_VISIBILITY_PATH, { hidden: [...v.hidden], minRole: { ...v.minRole } }) } catch { return false }
}

// ── Für die eigene Sitzung (Sidebar) ─────────────────────────────────────────

export interface MeineRechte { recht: BenutzerRecht | null; standardBereiche: Record<string, string[]>; global: MenuVisibility }

/**
 * Rechte des angemeldeten Benutzers. Gibt es die neue Datei noch nicht, gilt der alte
 * Override (Schlüssel = Benutzer-ID) — umgerechnet, ohne etwas zu schreiben.
 */
export async function ladeMeineRechte(user: Pick<AppUser, 'id' | 'username'> & { windowsUsername?: string }): Promise<MeineRechte> {
  const [datei, global] = await Promise.all([ladeRechte(), ladeGlobal()])
  if (datei) return { recht: datei.benutzer[corpKey(user)] || null, standardBereiche: datei.standard.bereiche, global }
  const alt = await ladeAltOverrides()
  const e = alt[user.id]
  if (!e || !Array.isArray(e.hidden)) return { recht: null, standardBereiche: {}, global }
  const r = umstellen({ x: e }, [{ id: 'x', username: user.username, windowsUsername: user.windowsUsername }], '').benutzer[corpKey(user)] || null
  return { recht: r, standardBereiche: {}, global }
}
