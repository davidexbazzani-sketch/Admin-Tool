// ── SolidWorks-Diagnose: Hintergrund-Store ───────────────────────────────────
// Hält den (Mehr-PC-)Scan außerhalb der React-Komponente, damit er weiterläuft,
// wenn man den Menüpunkt wechselt (analog gpuDeployStore). Berichte werden je PC
// sofort gespeichert (saveLauf), sodass nichts verloren geht.

import { create } from 'zustand'
import { runSwScan, runServerSkripte } from '../swCheck/runScan'
import { saveLauf, pushRecentHost } from '../swCheck/store'
import type { SwLauf, SwFortschritt } from '../swCheck/swCheck.types'

export interface SwScanProgress { done: number; total: number; pc: string; skripte: Record<string, SwFortschritt> }
export interface SwRunLogEntry { pc: string; ok: boolean; text: string }

interface SwScanState {
  running: boolean
  prog: SwScanProgress | null
  ergebnisse: SwLauf[]
  runLog: SwRunLogEntry[]
  error: string
  finishedTick: number          // erhöht sich bei Abschluss → Screen lädt Verlauf neu
  startedAt: number | null
  run: (hosts: string[], by: string, opts: { skripte: string[]; server: string }) => Promise<void>
  cancel: () => void
  clear: () => void
}

let abort = false

export const useSwScanStore = create<SwScanState>((set, get) => ({
  running: false,
  prog: null,
  ergebnisse: [],
  runLog: [],
  error: '',
  finishedTick: 0,
  startedAt: null,

  clear: () => { if (!get().running) set({ ergebnisse: [], runLog: [], error: '', prog: null }) },

  cancel: () => { abort = true; try { void import('../electronAPI').then(m => m.api().cancelAll()) } catch { /* egal */ } },

  run: async (hosts, by, opts) => {
    if (get().running) return
    if (hosts.length === 0) { set({ error: 'Keine PCs gewählt.' }); return }
    if (opts.skripte.length === 0) { set({ error: 'Kein Skript gewählt.' }); return }
    abort = false
    set({ running: true, error: '', ergebnisse: [], runLog: [], startedAt: Date.now(), prog: { done: 0, total: hosts.length, pc: '', skripte: {} } })
    const results: SwLauf[] = []
    const log: SwRunLogEntry[] = []
    try {
      // Server-Skripte EINMAL für den ganzen Sammellauf ausführen (nicht je PC — sonst
      // liefen sie z. B. bei 10 PCs 10× gegen denselben Server und erzeugten 10 identische
      // Serverberichte). Das Ergebnis wird jedem PC-Lauf über vorabServer nur noch zugeordnet.
      const serverHost = opts.server.trim() || 'w3143'
      const vorabServer = await runServerSkripte(serverHost, opts.skripte, {
        onProgress: p => set(st => (st.prog ? { prog: { ...st.prog, pc: st.prog.pc || `${serverHost} (einmalig)`, skripte: { ...st.prog.skripte, [p.id]: p } } } : {})),
        isAborted: () => abort,
      })
      for (let i = 0; i < hosts.length; i++) {
        if (abort) break
        const pc = hosts[i]
        set({ prog: { done: i, total: hosts.length, pc, skripte: {} } })
        const r = await runSwScan(pc, by, {
          skripte: opts.skripte, server: serverHost, vorabServer,
          onProgress: p => set(st => (st.prog ? { prog: { ...st.prog, skripte: { ...st.prog.skripte, [p.id]: p } } } : {})),
          isAborted: () => abort,
        })
        if (r.ok && r.lauf) {
          // WICHTIG: saveLauf MUSS awaitet werden. saveLauf aktualisiert index.json per
          // Read-Modify-Write; liefen mehrere gleichzeitig (void), überschrieben sie sich
          // gegenseitig (last-writer-wins) und PCs verschwanden aus dem Index — genau
          // deshalb fehlten Rechner nach einem nicht erreichbaren PC im Sammelbericht.
          results.push(r.lauf)
          await saveLauf(r.lauf); pushRecentHost(pc)
          log.push({ pc, ok: true, text: `${r.lauf.auffaelligkeiten.length} Auffälligkeiten` })
        } else {
          log.push({ pc, ok: false, text: r.error || 'Fehlgeschlagen' })
        }
        set({ ergebnisse: [...results], runLog: [...log] })
      }
    } finally {
      set(st => ({ running: false, prog: null, finishedTick: st.finishedTick + 1 }))
    }
  },
}))
