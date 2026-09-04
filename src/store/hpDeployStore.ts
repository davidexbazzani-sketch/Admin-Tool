// ── Treiber-Installation (HP): Hintergrund-Store ─────────────────────────────
// Hält den Installations-Vorgang außerhalb der React-Komponente, damit er
// weiterläuft, wenn man den Menüpunkt wechselt (analog gpuDeployStore/swInstallStore).
//
// PRO-PC-PARALLELBETRIEB: Man kann einen weiteren PC starten, WÄHREND ein anderer
// noch installiert. Eine modulweite Warteschlange + ein globales Limit (GLOBAL_MAX)
// sorgen dafür, dass nie zu viele PCs gleichzeitig laufen (WinRM-Limit). Jeder PC läuft
// als eigener Auftrag; run() reiht neue PCs nur ein (blockiert nicht mehr global).

import { create } from 'zustand'
import { api } from '../electronAPI'
import { deployOneHost, type DriverItem, type HpDeployOptions, type HpDeployResult } from '../services/hpDrivers'

const GLOBAL_MAX = 4   // max gleichzeitig laufende PCs (Performance/WinRM: ≤10 parallel gesamt)

interface Job { host: string; items: DriverItem[]; opts: HpDeployOptions }

// Modul-lokal (nicht im State), damit sich überlappende run()-Aufrufe DIESELBE Queue teilen.
const queue: Job[] = []
let activeCount = 0
let aborted = false   // Stopp-Knopf: laufende Läufe brechen nach dem aktuellen Treiber ab

interface HpDeployState {
  activeHosts: string[]                       // hosts, die gerade installieren (lowercased)
  queuedHosts: string[]                       // hosts, die auf einen freien Slot warten
  phaseByHost: Record<string, string>         // aktuelle Phase je laufendem Host
  results: Record<string, HpDeployResult>     // key = host.toLowerCase()
  finishedTick: number
  run: (plan: { host: string; items: DriverItem[] }[], opts: HpDeployOptions) => Promise<void>
  cancel: () => void
  clearResults: () => void
}

export const useHpDeployStore = create<HpDeployState>((set, get) => {
  // Freie Slots mit wartenden Aufträgen füllen.
  const pump = () => {
    while (activeCount < GLOBAL_MAX && queue.length > 0) {
      const job = queue.shift()!
      const key = job.host.toLowerCase()
      activeCount++
      set(st => ({
        activeHosts: [...st.activeHosts, key],
        queuedHosts: st.queuedHosts.filter(h => h !== key),
        phaseByHost: { ...st.phaseByHost, [key]: 'Start …' },
      }))
      const beenden = (r?: HpDeployResult) => {
        activeCount--
        set(st => {
          const phaseByHost = { ...st.phaseByHost }; delete phaseByHost[key]
          return {
            activeHosts: st.activeHosts.filter(h => h !== key),
            phaseByHost,
            results: r ? { ...st.results, [key]: r } : st.results,
            finishedTick: st.finishedTick + 1,
          }
        })
        pump()
      }
      // deployOneHost fängt Fehler intern ab und liefert immer ein Ergebnis; .catch nur zur Sicherheit.
      void deployOneHost(job.host, job.items, job.opts, (s) => {
        set(st => ({ phaseByHost: { ...st.phaseByHost, [s.host.toLowerCase()]: s.phase } }))
      }, () => aborted).then(beenden).catch(() => beenden(undefined))
    }
  }

  return {
    activeHosts: [],
    queuedHosts: [],
    phaseByHost: {},
    results: {},
    finishedTick: 0,

    clearResults: () => { if (get().activeHosts.length === 0 && get().queuedHosts.length === 0) set({ results: {} }) },

    // Reiht die PCs des Plans ein (die noch nicht laufen/warten) und startet die Abarbeitung.
    // Blockiert NICHT, wenn schon andere PCs laufen — man kann jederzeit weitere PCs anstoßen.
    run: async (plan, opts) => {
      if (get().activeHosts.length === 0) aborted = false   // frischer Lauf → Abbruch-Flag zurücksetzen
      const aktiv = new Set(get().activeHosts)
      const wartend = new Set(queue.map(j => j.host.toLowerCase()))
      const neu = plan.filter(p => p.items.length && !aktiv.has(p.host.toLowerCase()) && !wartend.has(p.host.toLowerCase()))
      if (!neu.length) return
      for (const j of neu) queue.push({ host: j.host, items: j.items, opts })
      set(st => ({ queuedHosts: [...st.queuedHosts, ...neu.map(j => j.host.toLowerCase())] }))
      pump()
    },

    // Stopp: Warteschlange leeren, laufende Installer abbrechen (kill der PowerShell-Prozesse
    // am Admin-PC) und den Abbruch-Flag setzen → die Treiber-Schleifen beenden sich.
    cancel: () => {
      aborted = true
      queue.length = 0
      set({ queuedHosts: [] })
      try { void api().cancelAll() } catch { /* egal */ }
    },
  }
})
