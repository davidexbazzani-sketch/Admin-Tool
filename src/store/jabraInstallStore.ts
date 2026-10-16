// ── Jabra Direct: Hintergrund-Store für die stille Installation ─────────────
// Der Lauf gehört bewusst NICHT in die React-Komponente: er wird von zwei Stellen
// aus gestartet (Kachel „Jabra Software" und Daylis → Sound Fix, Schritt 4) und muss
// einen Menüwechsel überleben. Gleiches Muster wie hpDeployStore/xelionInstallStore.

import { create } from 'zustand'
import { installiereJabra, JABRA_SCHRITTE, type JabraErgebnis, type JabraSchritt, type SchrittStatus } from '../services/jabraInstall'
import { logDeviceAction } from '../services/deviceDossier'
import { useAuthStore } from './authStore'

// Installationen sind schwer (181 MB Kopie + Installer). Mehr als zwei PCs gleichzeitig
// bringt nichts und belastet nur das Netz — der Rest wartet in der Schlange.
const MAX_PARALLEL = 2

export interface JabraLauf {
  host: string
  phase: 'wartet' | 'laeuft' | 'fertig' | 'fehler'
  schritte: JabraSchritt[]
  ergebnis?: JabraErgebnis
  startzeit: number
  endzeit?: number
}

interface JabraState {
  laeufe: Record<string, JabraLauf>          // Schlüssel = host.toLowerCase()
  starte: (host: string) => void
  verwerfe: (host: string) => void
}

const schlange: string[] = []
let aktiv = 0

function frischeSchritte(): JabraSchritt[] {
  return JABRA_SCHRITTE.map(s => ({ ...s, status: 'offen' as SchrittStatus }))
}

export const useJabraInstallStore = create<JabraState>((set, get) => {
  const setLauf = (key: string, f: (l: JabraLauf) => JabraLauf) => {
    set(st => (st.laeufe[key] ? { laeufe: { ...st.laeufe, [key]: f(st.laeufe[key]) } } : st))
  }

  const pumpe = () => {
    while (aktiv < MAX_PARALLEL && schlange.length > 0) {
      const key = schlange.shift()!
      const lauf = get().laeufe[key]
      if (!lauf) continue
      aktiv++
      setLauf(key, l => ({ ...l, phase: 'laeuft', startzeit: Date.now() }))

      const melde = (id: string, status: SchrittStatus, info?: string) => {
        setLauf(key, l => ({ ...l, schritte: l.schritte.map(s => (s.id === id ? { ...s, status, info: info ?? s.info } : s)) }))
      }

      const beenden = (erg: JabraErgebnis) => {
        aktiv--
        setLauf(key, l => ({ ...l, phase: erg.ok ? 'fertig' : 'fehler', ergebnis: erg, endzeit: Date.now() }))
        const wer = (() => { const u = useAuthStore.getState().session?.user; return u?.displayName || u?.username || 'Tool' })()
        void logDeviceAction(lauf.host, undefined,
          `Jabra Direct: stille Installation ${erg.ok ? 'erfolgreich' : 'fehlgeschlagen'} — ${erg.text}`.slice(0, 400),
          wer, 'Jabra Software')
        pumpe()
      }

      void installiereJabra(lauf.host, melde)
        .then(beenden)
        .catch(e => beenden({ ok: false, text: e instanceof Error ? e.message : String(e) }))
    }
  }

  return {
    laeufe: {},

    starte: (host: string) => {
      const key = host.trim().toLowerCase()
      if (!key) return
      const vorhanden = get().laeufe[key]
      if (vorhanden && (vorhanden.phase === 'laeuft' || vorhanden.phase === 'wartet')) return   // läuft schon
      set(st => ({
        laeufe: { ...st.laeufe, [key]: { host: host.trim(), phase: 'wartet', schritte: frischeSchritte(), startzeit: Date.now() } },
      }))
      schlange.push(key)
      pumpe()
    },

    // Ergebnis wegklicken (nur wenn nichts mehr läuft) — der Lauf selbst wird nie abgebrochen.
    verwerfe: (host: string) => {
      const key = host.trim().toLowerCase()
      const l = get().laeufe[key]
      if (!l || l.phase === 'laeuft' || l.phase === 'wartet') return
      set(st => { const n = { ...st.laeufe }; delete n[key]; return { laeufe: n } })
    },
  }
})
