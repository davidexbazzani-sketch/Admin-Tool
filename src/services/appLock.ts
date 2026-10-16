// ── Globale Programm-Sperre (Master-Admin-Kill-Switch) ───────────────────────
// Nur davidxe (Master-Admin/Founder) kann das gesamte Programm für ALLE anderen
// Nutzer sperren. Gesperrt = angemeldete Nutzer sehen nur den Sperrbildschirm,
// nichts wird gelöscht. Zentral auf dem Netzlaufwerk, damit es sofort für alle
// Instanzen gilt (auch bereits angemeldete – wird per Poll live erkannt).

import { api } from '../electronAPI'

export interface AppLock { locked: boolean; by?: string; at?: string; reason?: string }

const PATH = 'settings/app_lock.json'

export async function loadAppLock(): Promise<AppLock> {
  try {
    const s = await api().netReadJson<AppLock>(PATH)
    if (s && typeof s.locked === 'boolean') return s
  } catch { /* keine Datei = nicht gesperrt */ }
  return { locked: false }
}

export async function setAppLock(locked: boolean, by: string, reason?: string): Promise<boolean> {
  try { return await api().netWriteJson(PATH, { locked, by, at: new Date().toISOString(), reason } satisfies AppLock) }
  catch { return false }
}

/** Wer die Sperre umgeht (immer alles sieht) und sie allein setzen/aufheben darf: nur Davide. */
export function canBypassLock(user?: { username?: string; isFounder?: boolean } | null): boolean {
  if (!user) return false
  return user.isFounder === true || ['davidxe', 'bq8069'].includes((user.username || '').toLowerCase())
}
