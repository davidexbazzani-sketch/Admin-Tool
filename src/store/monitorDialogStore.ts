// Öffnet den Dialog „Überwachung einrichten“ von überall (z. B. nach einer Behebung).
import { create } from 'zustand'

export interface MonVorlage {
  host?: string
  serial?: string
  person?: string
  /** Kontroll-IDs aus monitoring/kontrollen.ts */
  kontrollen?: string[]
  anlass?: string
}

interface S {
  offen: boolean
  vorlage: MonVorlage | null
  oeffne: (v?: MonVorlage) => void
  schliesse: () => void
}

export const useMonitorDialog = create<S>(set => ({
  offen: false,
  vorlage: null,
  oeffne: v => set({ offen: true, vorlage: v || null }),
  schliesse: () => set({ offen: false, vorlage: null }),
}))
