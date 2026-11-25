// HCI-Fragebogen: Zustand der laufenden Abfrage(n).
// Gestartet wird nur von Hand, je Server im Reiter „HCI-Fragebogen“ — es gibt keinen Sammel-Lauf.
// Der Zustand liegt in einem Store, damit eine Abfrage das Schließen des Fensters überlebt.
// Startet jemand kurz nacheinander bei zwei Servern, läuft trotzdem immer nur EINE Abfrage zur Zeit.
import { create } from 'zustand'
import { hostKey } from '../services/serverMonitor'
import { istClusterKnoten } from '../services/serverSchonung'
import { erhebe, ladeEinstellungen } from './sammeln'

/** Pause, falls direkt hintereinander ein zweiter Server gestartet wurde */
export const HCI_PAUSE_MS = 5_000

export type HciPhase = 'wartet' | 'laeuft' | 'fertig' | 'fehler'
export interface HciLaufStand { phase: HciPhase; seit?: number; fehler?: string; am?: string }

interface HciState {
  hosts: Record<string, HciLaufStand>
  schlange: string[]
  aktiv: boolean
  /** zählt hoch, sobald ein Server fertig ist → die Ansicht lädt neu */
  marke: number
  /** EINEN Server abfragen (nur lesend). Cluster-Knoten werden nie abgefragt. */
  starte: (host: string, von: string) => void
}

let von = 'manuell'
const warte = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export const useHciStore = create<HciState>((set, get) => {
  async function pumpe() {
    if (get().aktiv) return
    set({ aktiv: true })
    try {
      let erster = true
      for (;;) {
        const [host, ...rest] = get().schlange
        if (!host) break
        if (!erster) await warte(HCI_PAUSE_MS)
        erster = false
        set(s => ({ schlange: rest, hosts: { ...s.hosts, [host]: { phase: 'laeuft', seit: Date.now() } } }))
        let stand: HciLaufStand
        try {
          const e = await ladeEinstellungen()
          const r = await erhebe(host, von, e)
          stand = r.ok ? { phase: 'fertig', am: r.bogen.erhoben?.am } : { phase: 'fehler', fehler: r.fehler }
        } catch (err) { stand = { phase: 'fehler', fehler: err instanceof Error ? err.message : String(err) } }
        set(s => ({ hosts: { ...s.hosts, [host]: stand }, marke: s.marke + 1 }))
      }
    } finally { set({ aktiv: false }) }
  }

  return {
    hosts: {}, schlange: [], aktiv: false, marke: 0,
    starte: (host, wer) => {
      von = wer || von
      const h = hostKey(host)
      if (!h || istClusterKnoten(h) || get().schlange.includes(h) || get().hosts[h]?.phase === 'laeuft') return
      set(s => ({ schlange: [...s.schlange, h], hosts: { ...s.hosts, [h]: { phase: 'wartet' } } }))
      void pumpe()
    },
  }
})
