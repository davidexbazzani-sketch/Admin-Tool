// ── Server-Mitteilungen stumm schalten (Glocke am Menüpunkt „Server“) ─────────
// Pro Benutzer: einstellungen/server-stumm/<benutzer>.json auf dem Netzlaufwerk (jeder schreibt nur
// seine eigene Datei → nichts wird überschrieben; gilt auf jedem PC, an dem er sich anmeldet).
// Lokal zusätzlich zwischengespeichert, damit beim Start sofort richtig angezeigt wird.
// Stumm heißt nur: dieser Benutzer bekommt keine Popups/Windows-Hinweise/Blinken vom Server-Monitor.
// Ping, Dienst-Prüfung, Neustart- und Zertifikats-Erkennung laufen unverändert weiter (für alle anderen).
import { create } from 'zustand'
import { api } from '../electronAPI'

const ORDNER = 'einstellungen/server-stumm'
const sicher = (s: string) => (s || 'unbekannt').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60)
const lokalKey = (b: string) => `server-stumm:${sicher(b)}`

interface ServerStummState {
  stumm: boolean
  setStumm: (s: boolean) => void
}

export const useServerStumm = create<ServerStummState>(set => ({
  stumm: false,
  setStumm: stumm => set({ stumm }),
}))

/** Beim Anmelden laden: erst lokal (sofort), dann vom Netzlaufwerk (maßgeblich). */
export async function ladeServerStumm(benutzer: string): Promise<void> {
  if (!benutzer) return
  try { const l = localStorage.getItem(lokalKey(benutzer)); if (l !== null) useServerStumm.getState().setStumm(l === '1') } catch { /* egal */ }
  try {
    const d = await api().netReadJsonAsync<{ stumm?: boolean }>(`${ORDNER}/${sicher(benutzer)}.json`)
    if (d && typeof d.stumm === 'boolean') {
      useServerStumm.getState().setStumm(d.stumm)
      try { localStorage.setItem(lokalKey(benutzer), d.stumm ? '1' : '0') } catch { /* egal */ }
    }
  } catch { /* Netz nicht da → lokaler Stand bleibt */ }
}

/** Glocke umschalten – wirkt sofort, Speichern im Hintergrund. */
export async function setzeServerStumm(benutzer: string, stumm: boolean): Promise<boolean> {
  useServerStumm.getState().setStumm(stumm)
  try { localStorage.setItem(lokalKey(benutzer), stumm ? '1' : '0') } catch { /* egal */ }
  if (!benutzer) return false
  try { return await api().netWriteJsonAsync(`${ORDNER}/${sicher(benutzer)}.json`, { stumm, geaendert: new Date().toISOString() }) } catch { return false }
}
