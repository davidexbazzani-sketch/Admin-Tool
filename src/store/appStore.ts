import { create } from 'zustand'
import type { DeviceEntry, Screen, QueryId, QueryResult, AppSettings, XelionEntry } from '../types'

interface AppState {
  // Navigation
  screen: Screen
  setScreen: (s: Screen) => void

  // Admin status
  isAdmin: boolean
  adminChecked: boolean
  setIsAdmin: (v: boolean) => void
  setAdminChecked: (v: boolean) => void

  // Device list (from Home screen)
  devices: DeviceEntry[]
  setDevices: (d: DeviceEntry[]) => void
  addDevice: (d: DeviceEntry) => void
  removeDevice: (id: string) => void
  clearDevices: () => void

  // Selected queries
  selectedQueryIds: QueryId[]
  setSelectedQueryIds: (ids: QueryId[]) => void
  toggleQuery: (id: QueryId) => void

  // Query results
  results: QueryResult[]
  setResults: (r: QueryResult[]) => void
  updateResult: (r: QueryResult) => void
  clearResults: () => void

  // Settings
  settings: AppSettings
  setSettings: (s: AppSettings) => void
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void

  // Xelion
  xelionEntries: XelionEntry[]
  setXelionEntries: (e: XelionEntry[]) => void

  // IT Guru hostname (passed from Home screen)
  guruHostname: string
  setGuruHostname: (h: string) => void

  // Onboarding: Mitarbeiter-Vorauswahl (aus der Mitarbeiterverwaltung)
  onboardingPreselectId: string | null
  setOnboardingPreselectId: (id: string | null) => void

  // Loading
  isQuerying: boolean
  setIsQuerying: (v: boolean) => void

  // Menu visibility (master admin controls which items are visible for all users)
  hiddenMenuIds: Set<string>
  setHiddenMenuIds: (ids: Set<string>) => void
  // Per-Menüpunkt konfigurierte Mindest-Rolle ('admin' = erst ab Admin,
  // 'master_admin' = nur Master). Fehlt ein Eintrag → für alle sichtbar.
  menuMinRole: Record<string, 'admin' | 'master_admin'>
  setMenuMinRole: (m: Record<string, 'admin' | 'master_admin'>) => void

  // Lizenzen-Alarm: > 0 = Menüpunkt blinkt rot (so viele aktive Alarme)
  licensesAlarmCount: number
  setLicensesAlarmCount: (n: number) => void

  // Mitarbeiter-Erinnerung: > 0 = so viele neue Mitarbeiter beginnen bald
  employeeReminderCount: number
  setEmployeeReminderCount: (n: number) => void

  // Server-Monitor: > 0 = so viele Server aktuell offline (Menüpunkt blinkt rot)
  serverAlarmCount: number
  setServerAlarmCount: (n: number) => void

  // Globaler Rot-Blink (z. B. Hardware-Inventur: Falsch-Scan)
  errorFlashActive: boolean
  errorFlashMessage: string
  setErrorFlash: (active: boolean, message?: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  screen: 'home',
  setScreen: (screen) => set({ screen }),

  isAdmin: false,
  adminChecked: false,
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setAdminChecked: (adminChecked) => set({ adminChecked }),

  devices: [],
  setDevices: (devices) => set({ devices }),
  addDevice: (d) => set((s) => ({ devices: [...s.devices, d] })),
  removeDevice: (id) => set((s) => ({ devices: s.devices.filter((d) => d.id !== id) })),
  clearDevices: () => set({ devices: [] }),

  selectedQueryIds: [],
  setSelectedQueryIds: (selectedQueryIds) => set({ selectedQueryIds }),
  toggleQuery: (id) =>
    set((s) => ({
      selectedQueryIds: s.selectedQueryIds.includes(id)
        ? s.selectedQueryIds.filter((q) => q !== id)
        : [...s.selectedQueryIds, id],
    })),

  results: [],
  setResults: (results) => set({ results }),
  updateResult: (r) =>
    set((s) => {
      const idx = s.results.findIndex(
        (x) => x.queryId === r.queryId && x.hostname === r.hostname
      )
      if (idx >= 0) {
        const next = [...s.results]
        next[idx] = r
        return { results: next }
      }
      return { results: [...s.results, r] }
    }),
  clearResults: () => set({ results: [] }),

  settings: {
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    exportPath: '',
    adDomain: '',
    adServer: '',
    theme: 'dark',
  },
  setSettings: (settings) => set({ settings }),
  updateSetting: (key, value) =>
    set((s) => ({ settings: { ...s.settings, [key]: value } })),

  xelionEntries: [],
  setXelionEntries: (xelionEntries) => set({ xelionEntries }),

  guruHostname: '',
  setGuruHostname: (guruHostname) => set({ guruHostname }),

  onboardingPreselectId: null,
  setOnboardingPreselectId: (onboardingPreselectId) => set({ onboardingPreselectId }),

  isQuerying: false,
  setIsQuerying: (isQuerying) => set({ isQuerying }),

  hiddenMenuIds: new Set(),
  setHiddenMenuIds: (hiddenMenuIds) => set({ hiddenMenuIds }),
  menuMinRole: {},
  setMenuMinRole: (menuMinRole) => set({ menuMinRole }),

  licensesAlarmCount: 0,
  setLicensesAlarmCount: (licensesAlarmCount) => set({ licensesAlarmCount }),

  employeeReminderCount: 0,
  setEmployeeReminderCount: (employeeReminderCount) => set({ employeeReminderCount }),

  serverAlarmCount: 0,
  setServerAlarmCount: (serverAlarmCount) => set({ serverAlarmCount }),

  errorFlashActive: false,
  errorFlashMessage: '',
  setErrorFlash: (active, message = '') => set({ errorFlashActive: active, errorFlashMessage: active ? message : '' }),
}))
