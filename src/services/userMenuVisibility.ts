// ── Per-User Menu Visibility Service ──────────────────────────────────────────
// Master Admin can configure which menu items are visible for each individual
// user. Useful for kiosk-style accounts that should only see one menu point
// (e.g. a "presentation" account that just opens the hall display).
//
// Data shape (settings/user_menu_overrides.json):
//   {
//     "<userId>": { "hidden": ["query-menu", "trickbox", ...] }
//   }
//
// A user is "overridden" when their userId is present as a key. If present,
// the listed IDs are hidden FOR THAT USER (replaces the global visibility).
// If absent, the global menu_visibility rules apply.

import { api } from '../electronAPI'

const USER_OVERRIDES_PATH = 'settings/user_menu_overrides.json'

export interface UserMenuOverride {
  hidden: string[]
}

export type UserMenuOverrides = Record<string, UserMenuOverride>

export async function loadUserMenuOverrides(): Promise<UserMenuOverrides> {
  try {
    const data = await api().netReadJson<UserMenuOverrides>(USER_OVERRIDES_PATH)
    if (!data || typeof data !== 'object') return {}
    // Normalize: ensure every entry has a valid hidden array
    const out: UserMenuOverrides = {}
    for (const [userId, entry] of Object.entries(data)) {
      if (entry && Array.isArray(entry.hidden)) {
        out[userId] = { hidden: entry.hidden.filter(s => typeof s === 'string') }
      }
    }
    return out
  } catch {
    return {}
  }
}

export async function saveUserMenuOverrides(overrides: UserMenuOverrides): Promise<{ ok: boolean; error?: string }> {
  try {
    const ok = await api().netWriteJson(USER_OVERRIDES_PATH, overrides)
    if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function hasOverride(overrides: UserMenuOverrides, userId: string): boolean {
  return Object.prototype.hasOwnProperty.call(overrides, userId)
}

export function getHiddenForUser(overrides: UserMenuOverrides, userId: string): Set<string> | null {
  const entry = overrides[userId]
  if (!entry) return null
  return new Set(entry.hidden)
}
