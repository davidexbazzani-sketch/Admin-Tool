// ── Toner-Warnung: offene (noch nicht bestätigte) Warnungen dieses Nutzers ───────
// Gefüllt vom TonerWarnungController, angezeigt im Popup-Stapel oben rechts (ChatController).
import { create } from 'zustand'
import type { TonerWarnung } from '../services/tonerWarnung'

interface TonerWarnungState {
  offen: TonerWarnung[]                  // aktiv und von MIR noch nicht bestätigt
  bestaetigen: ((ids: string[]) => void) | null
  setOffen: (w: TonerWarnung[]) => void
  setBestaetigen: (f: ((ids: string[]) => void) | null) => void
}

export const useTonerWarnungStore = create<TonerWarnungState>((set) => ({
  offen: [],
  bestaetigen: null,
  setOffen: (offen) => set({ offen }),
  setBestaetigen: (bestaetigen) => set({ bestaetigen }),
}))
