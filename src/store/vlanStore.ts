/**
 * Globaler Zustand-Store für die VLAN-Übersicht. Übersteht Screen-Wechsel — der
 * Scan läuft weiter, auch wenn der Nutzer den Screen verlässt (Muster: radarStore).
 *
 * Abbruch/Neustart-Sicherheit: Ein monoton steigendes Scan-Token verhindert, dass
 * ein gestoppter, noch laufender Scan „wiederbelebt" wird, wenn sofort ein neuer
 * startet (das bloße Zurücksetzen eines gemeinsamen abortFlag würde genau das tun).
 * Ein Scan wirkt nur auf den Store, solange sein Token das aktuelle ist.
 */
import { create } from 'zustand'
import type { VlanDevice } from '../services/vlans'

interface VlanState {
  scanning: boolean
  phase: 'ping' | 'resolve' | ''
  progress: number
  total: number
  up: number
  devices: VlanDevice[]
  subnets: string[]
  site: string
  capped: boolean
  partial: boolean          // Ergebnis stammt aus einem abgebrochenen Scan
  scanDate: string | null
  error: string | null

  startScan: (subnets: string[], site: string) => void
  updateProgress: (phase: 'ping' | 'resolve', done: number, total: number, up: number) => void
  finishScan: (devices: VlanDevice[], capped: boolean, scanDate: string, partial?: boolean) => void
  failScan: (error: string) => void
  stopScan: () => void
  loadCached: (devices: VlanDevice[], subnets: string[], site: string, scanDate: string, capped: boolean) => void
}

// Abbruch-Handle + Scan-Token außerhalb von React (überstehen Unmounts)
let abortFlag = false
let scanToken = 0
/** Startet einen neuen Scan-Kontext: hebt einen alten Abbruch auf und vergibt ein neues Token. */
export function beginScanToken(): number { abortFlag = false; return ++scanToken }
export function currentScanToken(): number { return scanToken }
/** Markiert den aktuell laufenden Scan als abgebrochen (Token bleibt unverändert). */
export function abortScan(): void { abortFlag = true }
/** true, wenn der Scan mit diesem Token abgebrochen ODER von einem neueren abgelöst wurde. */
export function isScanAborted(token: number): boolean { return abortFlag || token !== scanToken }
/** true, wenn der aktuell laufende Scan per Stop abgebrochen wurde. */
export function wasAborted(): boolean { return abortFlag }

export const useVlanStore = create<VlanState>((set) => ({
  scanning: false,
  phase: '',
  progress: 0,
  total: 0,
  up: 0,
  devices: [],
  subnets: [],
  site: '',
  capped: false,
  partial: false,
  scanDate: null,
  error: null,

  startScan: (subnets, site) => set({ scanning: true, phase: 'ping', progress: 0, total: 0, up: 0, subnets, site, capped: false, partial: false, error: null }),
  updateProgress: (phase, done, total, up) => set({ phase, progress: done, total, up }),
  finishScan: (devices, capped, scanDate, partial = false) => set({ scanning: false, phase: '', devices, capped, scanDate, partial }),
  failScan: (error) => set({ scanning: false, phase: '', error }),
  stopScan: () => set({ scanning: false, phase: '' }),
  loadCached: (devices, subnets, site, scanDate, capped) => set({ devices, subnets, site, scanDate, capped, partial: false }),
}))
