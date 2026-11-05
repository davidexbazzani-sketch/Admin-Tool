// ── FreeCAD (3D-Viewer): Hintergrund-Store für die Ferninstallation ──────────
// Gleiches Muster wie die anderen Software-Kacheln: der Lauf überlebt einen Menüwechsel,
// höchstens zwei PCs gleichzeitig (das Setup ist rund 500 MB groß), Ergebnis ins
// Geräte-Dossier und ins Logbuch der Software-Installationen.

import { create } from 'zustand'
import {
  installiereFreeCad, freeCadSchritte,
  type FreeCadErgebnis, type FreeCadOptionen, type FreeCadSchritt, type SchrittStatus,
} from '../services/freecadInstall'
import { logDeviceAction } from '../services/deviceDossier'
import { logStart, logEnde } from '../services/softwareInstallLog'
import { useAuthStore } from './authStore'

const MAX_PARALLEL = 2

export interface FreeCadLauf {
  host: string
  optionen: FreeCadOptionen
  phase: 'wartet' | 'laeuft' | 'fertig' | 'fehler'
  schritte: FreeCadSchritt[]
  ergebnis?: FreeCadErgebnis
  startzeit: number
  endzeit?: number
}

interface FreeCadState {
  laeufe: Record<string, FreeCadLauf>      // Schlüssel = host.toLowerCase()
  starte: (host: string, optionen: FreeCadOptionen) => void
  verwerfe: (host: string) => void
}

const schlange: string[] = []
let aktiv = 0

export const useFreeCadInstallStore = create<FreeCadState>((set, get) => {
  const setLauf = (key: string, f: (l: FreeCadLauf) => FreeCadLauf) => {
    set(st => (st.laeufe[key] ? { laeufe: { ...st.laeufe, [key]: f(st.laeufe[key]) } } : st))
  }

  const pumpe = () => {
    while (aktiv < MAX_PARALLEL && schlange.length > 0) {
      const key = schlange.shift()!
      const lauf = get().laeufe[key]
      if (!lauf) continue
      aktiv++
      setLauf(key, l => ({ ...l, phase: 'laeuft', startzeit: Date.now() }))
      const logId = logStart('FreeCAD', lauf.host, [
        lauf.optionen.verknuepfen ? `STEP/IGES verknüpfen${lauf.optionen.erzwingen ? ' (auch statt anderer Programme)' : ''}` : 'ohne Verknüpfung',
        lauf.optionen.desktop ? '' : 'ohne Desktop-Verknüpfung',
      ].filter(Boolean).join(' · ') || undefined)

      const melde = (id: string, status: SchrittStatus, info?: string) => {
        setLauf(key, l => ({ ...l, schritte: l.schritte.map(s => (s.id === id ? { ...s, status, info: info ?? s.info } : s)) }))
      }

      const beenden = (erg: FreeCadErgebnis) => {
        aktiv--
        setLauf(key, l => ({ ...l, phase: erg.ok ? 'fertig' : 'fehler', ergebnis: erg, endzeit: Date.now() }))
        const wer = (() => { const u = useAuthStore.getState().session?.user; return u?.displayName || u?.username || 'Tool' })()
        void logDeviceAction(lauf.host, undefined,
          `FreeCAD (3D-Viewer): ${erg.uebersprungen ? 'war schon installiert' : 'installiert'} — ${erg.ok ? 'erfolgreich' : 'fehlgeschlagen'}: ${erg.text}`.slice(0, 1500),
          wer, 'FreeCAD')
        void logId.then(id => logEnde(id, erg.ok ? 'ok' : 'fehler', erg.text))
        pumpe()
      }

      void installiereFreeCad(lauf.host, lauf.optionen, melde)
        .then(beenden)
        .catch(e => beenden({ ok: false, text: e instanceof Error ? e.message : String(e) }))
    }
  }

  return {
    laeufe: {},

    starte: (host, optionen) => {
      const key = host.trim().toLowerCase()
      if (!key) return
      const vorhanden = get().laeufe[key]
      if (vorhanden && (vorhanden.phase === 'laeuft' || vorhanden.phase === 'wartet')) return
      set(st => ({
        laeufe: {
          ...st.laeufe,
          [key]: {
            host: host.trim(), optionen, phase: 'wartet', startzeit: Date.now(),
            schritte: freeCadSchritte().map(s => ({ ...s, status: 'offen' as SchrittStatus })),
          },
        },
      }))
      schlange.push(key)
      pumpe()
    },

    verwerfe: (host) => {
      const key = host.trim().toLowerCase()
      const l = get().laeufe[key]
      if (!l || l.phase === 'laeuft' || l.phase === 'wartet') return
      set(st => { const n = { ...st.laeufe }; delete n[key]; return { laeufe: n } })
    },
  }
})
