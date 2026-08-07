// ── PDF-Werkzeuge: Zustand-Store ─────────────────────────────────────────────
// Haelt die geoeffneten Dokumente (Tabs, nur im Speicher) und die persistente
// Personalisierung (Favoriten, Sichtbarkeit, Onboarding, Dark Mode).
// Persistiert wird ueber localStorage — bewusst NUR die Personalisierung, nicht
// die (binaeren) Dokumentdaten.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_FAVORITES, ONBOARDING_TASKS, type PdfGroupId } from '../config'

export interface PdfTab {
  id: string
  fileName: string
  data: Uint8Array          // aktueller Stand des Dokuments (wird bei Bearbeitung ersetzt)
  sourcePath?: string       // Original-Dateipfad (falls vom Datentraeger geoeffnet)
  dirty: boolean            // ungespeicherte Aenderungen
}

export interface RecentFile {
  path: string
  name: string
  openedAt: number
}

interface PdfToolsState {
  // Session (nicht persistiert)
  tabs: PdfTab[]
  activeTabId: string | null

  // Persistiert
  favorites: string[]       // geordnete Werkzeug-Ids im Schnellzugriff
  hiddenTools: string[]     // ausgeblendete Werkzeuge
  collapsedGroups: PdfGroupId[]
  recents: RecentFile[]
  onboardingDone: boolean
  darkMode: boolean

  // Tab-Aktionen
  addTab: (fileName: string, data: Uint8Array, sourcePath?: string) => string
  replaceActiveData: (data: Uint8Array, opts?: { dirty?: boolean; fileName?: string }) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  addRecent: (path: string, name: string) => void

  // Personalisierung
  setFavorites: (ids: string[]) => void
  pinTool: (id: string) => void
  unpinTool: (id: string) => void
  toggleHidden: (id: string) => void
  toggleGroup: (id: PdfGroupId) => void
  completeOnboarding: (taskIds: string[]) => void
  resetOnboarding: () => void
  resetPersonalization: () => void
  setDarkMode: (on: boolean) => void
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export const usePdfToolsStore = create<PdfToolsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      favorites: DEFAULT_FAVORITES,
      hiddenTools: [],
      collapsedGroups: [],
      recents: [],
      onboardingDone: false,
      darkMode: false,

      addTab: (fileName, data, sourcePath) => {
        const id = uid('tab')
        const tab: PdfTab = { id, fileName, data, sourcePath, dirty: false }
        set(s => ({ tabs: [...s.tabs, tab], activeTabId: id }))
        if (sourcePath) get().addRecent(sourcePath, fileName)
        return id
      },

      replaceActiveData: (data, opts) => set(s => ({
        tabs: s.tabs.map(t => t.id === s.activeTabId
          ? { ...t, data, dirty: opts?.dirty ?? true, fileName: opts?.fileName ?? t.fileName }
          : t),
      })),

      closeTab: (id) => set(s => {
        const tabs = s.tabs.filter(t => t.id !== id)
        const activeTabId = s.activeTabId === id ? (tabs.length ? tabs[tabs.length - 1].id : null) : s.activeTabId
        return { tabs, activeTabId }
      }),

      setActiveTab: (id) => set({ activeTabId: id }),

      addRecent: (path, name) => set(s => {
        const without = s.recents.filter(r => r.path !== path)
        return { recents: [{ path, name, openedAt: Date.now() }, ...without].slice(0, 12) }
      }),

      setFavorites: (ids) => set({ favorites: ids }),
      pinTool: (id) => set(s => s.favorites.includes(id) ? s : { favorites: [...s.favorites, id] }),
      unpinTool: (id) => set(s => ({ favorites: s.favorites.filter(f => f !== id) })),
      toggleHidden: (id) => set(s => ({
        hiddenTools: s.hiddenTools.includes(id) ? s.hiddenTools.filter(h => h !== id) : [...s.hiddenTools, id],
      })),
      toggleGroup: (id) => set(s => ({
        collapsedGroups: s.collapsedGroups.includes(id) ? s.collapsedGroups.filter(g => g !== id) : [...s.collapsedGroups, id],
      })),

      completeOnboarding: (taskIds) => set(() => {
        const picked = new Set<string>()
        for (const t of ONBOARDING_TASKS) {
          if (taskIds.includes(t.id)) t.tools.forEach(tool => picked.add(tool))
        }
        const favorites = picked.size > 0 ? Array.from(picked) : DEFAULT_FAVORITES
        return { favorites, onboardingDone: true }
      }),

      resetOnboarding: () => set({ onboardingDone: false }),

      resetPersonalization: () => set({
        favorites: DEFAULT_FAVORITES,
        hiddenTools: [],
        collapsedGroups: [],
      }),

      setDarkMode: (on) => set({ darkMode: on }),
    }),
    {
      name: 'pdftools.personalization',
      // Nur Personalisierung persistieren — keine (binaeren) Dokumentdaten.
      partialize: (s) => ({
        favorites: s.favorites,
        hiddenTools: s.hiddenTools,
        collapsedGroups: s.collapsedGroups,
        recents: s.recents,
        onboardingDone: s.onboardingDone,
        darkMode: s.darkMode,
      }),
    },
  ),
)
