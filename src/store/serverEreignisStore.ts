// ── Server-Monitor: Neustart-Meldungen, die dieser Nutzer noch nicht gelesen hat ──
// Gefüllt vom ServerMonitorController, angezeigt im Popup-Stapel oben rechts (ChatController).
import { create } from 'zustand'
import type { ServerEreignis } from '../services/serverEreignisse'

interface ServerEreignisState {
  offen: ServerEreignis[]
  gelesen: ((ids: string[]) => void) | null
  setOffen: (e: ServerEreignis[]) => void
  setGelesen: (f: ((ids: string[]) => void) | null) => void
  /** Popup „Status öffnen" → Server-Monitor öffnet die Lasche dieses Servers */
  oeffneHost: string | null
  /** welcher Reiter der Lasche (z. B. „zertifikate" aus der Zertifikats-Meldung) */
  oeffneReiter: 'status' | 'zertifikate' | null
  setOeffneHost: (h: string | null, reiter?: 'status' | 'zertifikate') => void
}

export const useServerEreignisStore = create<ServerEreignisState>((set) => ({
  offen: [],
  gelesen: null,
  setOffen: (offen) => set({ offen }),
  setGelesen: (gelesen) => set({ gelesen }),
  oeffneHost: null,
  oeffneReiter: null,
  setOeffneHost: (oeffneHost, reiter) => set({ oeffneHost, oeffneReiter: oeffneHost ? reiter || 'status' : null }),
}))
