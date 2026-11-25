// ── Passwort-Freigabe für die Einstellungen „Für alle“ ──────────────────────
// Prüfung im Main-Prozess (bcrypt-Hash, Wartezeit nach 5 Fehlversuchen). Die Freigabe gilt,
// bis man die Einstellungen verlässt, auf „Sperren“ klickt oder 30 Minuten vergangen sind.
// Erfolg und Fehlversuch kommen ins Aktivitätsprotokoll — nie das Passwort selbst.
import { create } from 'zustand'
import { api } from '../electronAPI'
import { protokolliere } from '../services/aktivitaet'

export const FREIGABE_MS = 30 * 60_000

interface Z {
  offenBis: number
  oeffne: () => void
  sperre: () => void
}

export const useZugang = create<Z>(set => ({
  offenBis: 0,
  oeffne: () => set({ offenBis: Date.now() + FREIGABE_MS }),
  sperre: () => set({ offenBis: 0 }),
}))

export const istOffen = (offenBis: number, jetzt = Date.now()) => offenBis > jetzt

export type PruefErgebnis = { ok: true } | { ok: false; text: string }

export async function pruefePasswort(pw: string): Promise<PruefErgebnis> {
  let r: { ok: boolean; warteSek?: number; rest?: number }
  try { r = await api().verwaltungPruefe(pw) } catch { return { ok: false, text: 'Die Prüfung ist gerade nicht möglich.' } }
  if (r.ok) {
    useZugang.getState().oeffne()
    protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: 'Bereich „Für alle“ entsperrt' })
    return { ok: true }
  }
  protokolliere({ art: 'manuell', quelle: 'Einstellungen', aktion: 'Falsches Passwort für den Bereich „Für alle“' })
  if (r.warteSek) return { ok: false, text: `Zu viele Fehlversuche. Bitte ${r.warteSek} Sekunden warten.` }
  return { ok: false, text: r.rest ? `Falsches Passwort. Noch ${r.rest} Versuch${r.rest === 1 ? '' : 'e'}, dann 60 Sekunden Pause.` : 'Falsches Passwort.' }
}
