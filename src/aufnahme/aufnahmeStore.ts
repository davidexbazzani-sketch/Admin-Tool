// ── Bildschirmaufnahme: Zustand im Hauptfenster (Knopf, Start-/Fertig-Dialog) ──
import { create } from 'zustand'
import type { AufnahmeErgebnis, AufnahmeOptionen } from './typen'

export type AufnahmePhase = 'aus' | 'start' | 'laeuft' | 'fertig'

interface AufnahmeState {
  /** Controller läuft (nur im angemeldeten, nicht gesperrten Hauptfenster) */
  bereit: boolean
  setBereit: (b: boolean) => void
  phase: AufnahmePhase
  ergebnis: AufnahmeErgebnis | null
  /** Titel der laufenden Aufnahme (Dateiname-Vorschlag) */
  titel: string
  oeffneStart: () => void
  schliesse: () => void
  gestartet: (o: AufnahmeOptionen) => void
  fertig: (e: AufnahmeErgebnis | null) => void
}

export const useAufnahmeStore = create<AufnahmeState>((set, get) => ({
  bereit: false,
  setBereit: (bereit) => set({ bereit }),
  phase: 'aus',
  ergebnis: null,
  titel: '',
  oeffneStart: () => { if (get().phase === 'aus') set({ phase: 'start' }) },
  schliesse: () => set({ phase: 'aus', ergebnis: null }),
  gestartet: (o) => set({ phase: 'laeuft', titel: o.titel || '' }),
  fertig: (e) => set(e ? { phase: 'fertig', ergebnis: e } : { phase: 'aus', ergebnis: null }),
}))

// ── Zuletzt gewählte Einstellungen (nur Komfort, je PC) ───────────────────────
export type GemerkteOptionen = Omit<AufnahmeOptionen, 'ordner' | 'bildschirme' | 'titel'>
const SCHLUESSEL = 'aufnahme_optionen_v1'
export const STANDARD_OPTIONEN: GemerkteOptionen = {
  folgen: true, aufloesung: '1080', mikrofon: false, systemton: false, kamera: false,
  effekte: { schweif: true, ring: false, spotlight: false, lupe: false }, countdown: true, minimieren: true,
}
export function ladeGemerkt(): GemerkteOptionen {
  try {
    const roh = JSON.parse(localStorage.getItem(SCHLUESSEL) || 'null') as Partial<GemerkteOptionen> | null
    if (!roh || typeof roh !== 'object') return { ...STANDARD_OPTIONEN }
    // Einwilligungen (Mikrofon/Kamera) bewusst NICHT merken — jedes Mal neu zustimmen
    return { ...STANDARD_OPTIONEN, ...roh, mikrofon: false, kamera: false, effekte: { ...STANDARD_OPTIONEN.effekte, ...(roh.effekte || {}) } }
  } catch { return { ...STANDARD_OPTIONEN } }
}
export function merkeOptionen(o: GemerkteOptionen): void {
  try { localStorage.setItem(SCHLUESSEL, JSON.stringify({ ...o, mikrofon: false, kamera: false })) } catch { /* egal */ }
}
