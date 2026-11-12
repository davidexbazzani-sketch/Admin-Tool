// ── „Gib dein Problem ein“ von außen vorbelegen ──────────────────────────────
// Andere Stellen im Tool (z. B. Proaktives Radar → PC-Fehler) springen mit PC und Problem
// direkt in den Assistenten: Vorgabe setzen, auf die Startseite wechseln — der Assistent
// übernimmt sie und leert sie wieder.

import { create } from 'zustand'

export interface PaVorgabe {
  host: string
  serial?: string
  person?: string
  /** Text fürs Problemfeld. */
  suche: string
  /** Wenn bekannt: dieses Problem gleich öffnen. */
  problemId?: string
}

export const usePaVorgabe = create<{ vorgabe: PaVorgabe | null; setze: (v: PaVorgabe | null) => void }>(set => ({
  vorgabe: null,
  setze: vorgabe => set({ vorgabe }),
}))
