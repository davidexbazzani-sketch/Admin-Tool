// Winziger Zwischenspeicher: Ein Duell wurde im Chat angenommen bzw. gestartet → das Spiel (wird erst dann geladen)
// soll genau dieses Duell öffnen. Brain-Duell: Kennung. Seegefecht (Terra Incognita): Kennung und bis wann die
// Einladung gilt (echte Zeit in ms).
import { create } from 'zustand'

interface DuellZustand {
  /** Kennung des Brain-Duells, das als Nächstes geöffnet werden soll */
  anstehend: string | null
  setze: (id: string | null) => void
  /** Seegefecht-Einladung, die im Chat angenommen wurde (Terra Incognita fragt beim Öffnen noch einmal nach) */
  terra: { id: string; bis: number } | null
  setzeTerra: (t: { id: string; bis: number } | null) => void
}

export const useDuellStore = create<DuellZustand>(set => ({
  anstehend: null,
  setze: anstehend => set({ anstehend }),
  terra: null,
  setzeTerra: terra => set({ terra }),
}))
