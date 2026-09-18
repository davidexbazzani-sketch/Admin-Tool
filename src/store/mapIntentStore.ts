// ── Gemeinsame „Absicht" für die drei Karten-Screens (OT / Prüffeld&Zoll / Verwaltungsgebäude) ─
// Wird gesetzt, BEVOR per setScreen auf eine Karte gewechselt wird. Der Ziel-Screen
// liest die Absicht (wenn sie ihm gilt): 'focus' = Marker aufblinken lassen,
// 'place' = Platzieren-Modus + Hostname für den nächsten Klick vorbelegen.
import { create } from 'zustand'
import type { Screen } from '../types'

export type MapMode = 'focus' | 'place'
export interface MapIntent { screen: Screen; hostname: string; mode: MapMode }

interface MapIntentState {
  intent: MapIntent | null
  setIntent: (i: MapIntent) => void
  clear: () => void
}

export const useMapIntentStore = create<MapIntentState>((set) => ({
  intent: null,
  setIntent: (intent) => set({ intent }),
  clear: () => set({ intent: null }),
}))
