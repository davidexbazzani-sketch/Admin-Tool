// ── Enaio Capture: Hintergrund-Store ─────────────────────────────────────────
// Wie enaioInstallStore — überlebt einen Menüwechsel, schreibt ins Geräte-Dossier und
// ins Logbuch. Zusätzlich die Klick-Anleitung für den Schritt, dessen Fenster gerade am
// Ziel-PC offen ist. Nur EIN Capture-Lauf gleichzeitig (es gibt ohnehin nur wenige
// Scan-Arbeitsplätze, und die Fenster brauchen jemanden am PC).

import { create } from 'zustand'
import {
  installiereCapture, captureSchritte,
  type CaptureErgebnis, type CaptureHinweis, type CaptureOptionen, type CaptureSchritt, type SchrittStatus,
} from '../services/enaioCapture'
import { logDeviceAction } from '../services/deviceDossier'
import { logStart, logEnde } from '../services/softwareInstallLog'
import { useAuthStore } from './authStore'

export interface CaptureLauf {
  host: string
  optionen: CaptureOptionen
  phase: 'laeuft' | 'fertig' | 'fehler'
  schritte: CaptureSchritt[]
  hinweis: CaptureHinweis | null
  ergebnis?: CaptureErgebnis
  startzeit: number
}

interface CaptureState {
  lauf: CaptureLauf | null
  starte: (host: string, o: CaptureOptionen) => void
  verwerfe: () => void
}

export const useEnaioCaptureStore = create<CaptureState>((set, get) => ({
  lauf: null,

  starte: (host, optionen) => {
    if (get().lauf?.phase === 'laeuft') return
    const h = host.trim()
    set({
      lauf: {
        host: h, optionen, phase: 'laeuft', hinweis: null, startzeit: Date.now(),
        schritte: captureSchritte(optionen).map(s => ({ ...s, status: 'offen' as SchrittStatus })),
      },
    })
    const upd = (f: (l: CaptureLauf) => CaptureLauf) => set(st => (st.lauf ? { lauf: f(st.lauf) } : st))
    const melde = (id: string, status: SchrittStatus, info?: string) =>
      upd(l => ({ ...l, schritte: l.schritte.map(s => (s.id === id ? { ...s, status, info: info ?? s.info } : s)) }))
    const hinweis = (x: CaptureHinweis | null) => upd(l => ({ ...l, hinweis: x }))

    const teile = [optionen.kofax && 'Kofax', optionen.twain && 'TWAIN fi-7160', optionen.isis && 'ISIS fi-6140', optionen.data2sap && 'DATA2SAP'].filter(Boolean)
    const logId = logStart('Enaio Capture', h, teile.length ? `mit ${teile.join(', ')}` : undefined)

    const beenden = (erg: CaptureErgebnis) => {
      upd(l => ({ ...l, phase: erg.ok ? 'fertig' : 'fehler', ergebnis: erg, hinweis: null }))
      const u = useAuthStore.getState().session?.user
      void logDeviceAction(h, undefined, `Enaio Capture (Scan-Arbeitsplatz): ${erg.ok ? 'eingerichtet' : 'fehlgeschlagen'} — ${erg.text}`.slice(0, 800),
        u?.displayName || u?.username || 'Tool', 'Enaio Capture')
      void logId.then(id => logEnde(id, erg.ok ? 'ok' : 'fehler', erg.text))
    }
    void installiereCapture(h, optionen, melde, hinweis)
      .then(beenden)
      .catch(e => beenden({ ok: false, text: e instanceof Error ? e.message : String(e), nacharbeit: [] }))
  },

  verwerfe: () => { if (get().lauf?.phase !== 'laeuft') set({ lauf: null }) },
}))
