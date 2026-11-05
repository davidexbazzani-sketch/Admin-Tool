// ── Enaio: Hintergrund-Store für Entfernen + Neuinstallation ─────────────────
// Gleiches Muster wie jabraInstallStore: der Lauf überlebt einen Menüwechsel, höchstens
// zwei PCs gleichzeitig (Kopie des Client-Ordners belastet das Netz), Ergebnis ins
// Geräte-Dossier.

import { create } from 'zustand'
import {
  installiereEnaio, enaioSchritte, type EnaioErgebnis, type EnaioSchritt, type SchrittStatus,
} from '../services/enaioInstall'
import { logDeviceAction } from '../services/deviceDossier'
import { logStart, logEnde } from '../services/softwareInstallLog'
import { useAuthStore } from './authStore'

const MAX_PARALLEL = 2

export interface EnaioOptionen { entfernen: boolean; outlookBeenden: boolean }

export interface EnaioLauf {
  host: string
  optionen: EnaioOptionen
  phase: 'wartet' | 'laeuft' | 'fertig' | 'fehler'
  schritte: EnaioSchritt[]
  ergebnis?: EnaioErgebnis
  startzeit: number
  endzeit?: number
}

interface EnaioState {
  laeufe: Record<string, EnaioLauf>      // Schlüssel = host.toLowerCase()
  starte: (host: string, optionen: EnaioOptionen) => void
  verwerfe: (host: string) => void
}

const schlange: string[] = []
let aktiv = 0

export const useEnaioInstallStore = create<EnaioState>((set, get) => {
  const setLauf = (key: string, f: (l: EnaioLauf) => EnaioLauf) => {
    set(st => (st.laeufe[key] ? { laeufe: { ...st.laeufe, [key]: f(st.laeufe[key]) } } : st))
  }

  const pumpe = () => {
    while (aktiv < MAX_PARALLEL && schlange.length > 0) {
      const key = schlange.shift()!
      const lauf = get().laeufe[key]
      if (!lauf) continue
      aktiv++
      setLauf(key, l => ({ ...l, phase: 'laeuft', startzeit: Date.now() }))
      const logId = logStart('Enaio', lauf.host, [
        lauf.optionen.entfernen ? 'mit vorherigem vollständigen Entfernen' : '',
        lauf.optionen.entfernen && lauf.optionen.outlookBeenden ? 'Outlook beendet' : '',
      ].filter(Boolean).join(' · ') || undefined)

      const melde = (id: string, status: SchrittStatus, info?: string) => {
        setLauf(key, l => ({ ...l, schritte: l.schritte.map(s => (s.id === id ? { ...s, status, info: info ?? s.info } : s)) }))
      }

      const beenden = (erg: EnaioErgebnis) => {
        aktiv--
        setLauf(key, l => ({ ...l, phase: erg.ok ? 'fertig' : 'fehler', ergebnis: erg, endzeit: Date.now() }))
        const wer = (() => { const u = useAuthStore.getState().session?.user; return u?.displayName || u?.username || 'Tool' })()
        const weg = erg.entfernt
          ? `\nVorher entfernt: ${erg.entfernt.filter(e => e.ok).length} Punkt(e)${erg.entfernt.some(e => !e.ok) ? `, nicht entfernt: ${erg.entfernt.filter(e => !e.ok).map(e => e.was).join('; ')}` : ''}`
          : ''
        void logDeviceAction(lauf.host, undefined,
          `Enaio: ${lauf.optionen.entfernen ? 'vollständig entfernt und neu installiert' : 'installiert'} — ${erg.ok ? 'erfolgreich' : 'fehlgeschlagen'}: ${erg.text}${weg}`.slice(0, 1500),
          wer, 'Enaio')
        const nichtWeg = erg.entfernt?.filter(e => !e.ok).length ?? 0
        void logId.then(id => logEnde(id, erg.ok ? 'ok' : 'fehler',
          `${erg.text}${erg.neustartNoetig ? ' Neustart ausstehend.' : ''}${nichtWeg ? ` Beim Entfernen ${nichtWeg} Punkt(e) nicht entfernt.` : ''}`))
        pumpe()
      }

      void installiereEnaio(lauf.host, lauf.optionen, melde)
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
            schritte: enaioSchritte(optionen.entfernen).map(s => ({ ...s, status: 'offen' as SchrittStatus })),
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
