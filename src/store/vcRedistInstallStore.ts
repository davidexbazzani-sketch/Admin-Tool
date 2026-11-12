// ── Visual C++ Laufzeit: Hintergrund-Store für die Ferninstallation ──────────
// Wie bei FreeCAD: der Lauf überlebt einen Menüwechsel, höchstens drei PCs gleichzeitig,
// Ergebnis ins Geräte-Dossier und ins Logbuch der Software-Installationen.

import { create } from 'zustand'
import { installiereVc, vcSchritte, vcPaket, type VcErgebnis, type VcOptionen, type VcSchritt, type VcSchrittStatus } from '../services/vcRedistInstall'
import { logDeviceAction } from '../services/deviceDossier'
import { logStart, logEnde } from '../services/softwareInstallLog'
import { useAuthStore } from './authStore'

const MAX_PARALLEL = 3

export interface VcLauf {
  host: string
  optionen: VcOptionen
  phase: 'wartet' | 'laeuft' | 'fertig' | 'fehler'
  schritte: VcSchritt[]
  ergebnis?: VcErgebnis
  startzeit: number
  endzeit?: number
}

interface VcState {
  laeufe: Record<string, VcLauf>
  starte: (host: string, optionen: VcOptionen) => void
  verwerfe: (host: string) => void
}

const schlange: string[] = []
let aktiv = 0

export const useVcRedistInstallStore = create<VcState>((set, get) => {
  const setLauf = (key: string, f: (l: VcLauf) => VcLauf) => {
    set(st => (st.laeufe[key] ? { laeufe: { ...st.laeufe, [key]: f(st.laeufe[key]) } } : st))
  }

  const pumpe = () => {
    while (aktiv < MAX_PARALLEL && schlange.length > 0) {
      const key = schlange.shift()!
      const lauf = get().laeufe[key]
      if (!lauf) continue
      aktiv++
      setLauf(key, l => ({ ...l, phase: 'laeuft', startzeit: Date.now() }))
      const auswahl = lauf.optionen.pakete.map(id => { const p = vcPaket(id); return p ? `${p.reihe.split(' ')[0]} ${p.arch}` : id }).join(', ')
      const logId = logStart('Visual C++', lauf.host, `${auswahl}${lauf.optionen.auchVorhandene ? ' · auch vorhandene neu' : ''}`)
      const melde = (id: string, status: VcSchrittStatus, info?: string) => {
        setLauf(key, l => ({ ...l, schritte: l.schritte.map(s => (s.id === id ? { ...s, status, info: info ?? s.info } : s)) }))
      }
      const beenden = (erg: VcErgebnis) => {
        aktiv--
        setLauf(key, l => ({ ...l, phase: erg.ok ? 'fertig' : 'fehler', ergebnis: erg, endzeit: Date.now() }))
        const wer = (() => { const u = useAuthStore.getState().session?.user; return u?.displayName || u?.username || 'Tool' })()
        void logDeviceAction(lauf.host, undefined, `Visual C++ Laufzeit — ${erg.ok ? 'erfolgreich' : 'mit Fehlern'}: ${erg.text}`.slice(0, 1500), wer, 'Visual C++')
        void logId.then(id => logEnde(id, erg.ok ? 'ok' : 'fehler', erg.text))
        pumpe()
      }
      void installiereVc(lauf.host, lauf.optionen, melde)
        .then(beenden)
        .catch(e => beenden({ ok: false, text: e instanceof Error ? e.message : String(e) }))
    }
  }

  return {
    laeufe: {},
    starte: (host, optionen) => {
      const key = host.trim().toLowerCase()
      if (!key || !optionen.pakete.length) return
      const vorhanden = get().laeufe[key]
      if (vorhanden && (vorhanden.phase === 'laeuft' || vorhanden.phase === 'wartet')) return
      set(st => ({
        laeufe: {
          ...st.laeufe,
          [key]: { host: host.trim(), optionen, phase: 'wartet', startzeit: Date.now(), schritte: vcSchritte().map(s => ({ ...s, status: 'offen' as VcSchrittStatus })) },
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
