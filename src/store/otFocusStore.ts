// ── OT-Geräte: „auf der Karte zeigen"-Fokus ──────────────────────────────────
// Wird vom Geräte-Dossier gesetzt („Standort anzeigen") und vom OT-Geräte-Screen
// gelesen: der passende Marker leuchtet dann auf.

import { create } from 'zustand'

interface OtFocusState {
  hostname: string | null
  setFocus: (h: string) => void
  clear: () => void
}

export const useOtFocusStore = create<OtFocusState>((set) => ({
  hostname: null,
  setFocus: (h) => set({ hostname: (h || '').trim() || null }),
  clear: () => set({ hostname: null }),
}))
