// ── IT Admin Tool verteilen: Hintergrund-Store ───────────────────────────────
// Gleiches Muster wie die anderen Software-Kacheln: Läufe überleben einen Menüwechsel,
// höchstens zwei PCs gleichzeitig (das Setup ist gut 200 MB groß), Ergebnis ins
// Geräte-Dossier und ins Logbuch der Software-Installationen.
// Zusätzlich hält der Store die Ziel-Liste und den Ist-Stand je PC (höchstens 3 Abfragen
// gleichzeitig), damit beides nach einem Menüwechsel noch da ist.

import { create } from 'zustand'
import {
  installiereTool, toolSchritte, pruefeToolStand,
  type ToolErgebnis, type ToolOptionen, type ToolSchritt, type ToolSetup, type ToolStand, type SchrittStatus,
} from '../services/itAdminToolInstall'
import { logDeviceAction } from '../services/deviceDossier'
import { logStart, logEnde } from '../services/softwareInstallLog'
import { useAuthStore } from './authStore'

const MAX_PARALLEL = 2
const MAX_PRUEFUNGEN = 3

export interface ToolLauf {
  host: string
  optionen: ToolOptionen
  setupName: string
  phase: 'wartet' | 'laeuft' | 'fertig' | 'fehler'
  schritte: ToolSchritt[]
  ergebnis?: ToolErgebnis
  startzeit: number
  endzeit?: number
}
export interface ZielPc { host: string; serial?: string; von?: string }
export interface StandEintrag { laeuft: boolean; stand?: ToolStand; am?: number }

interface ToolState {
  ziele: ZielPc[]
  staende: Record<string, StandEintrag>     // Schlüssel = host.toLowerCase()
  laeufe: Record<string, ToolLauf>
  fuegeHinzu: (z: ZielPc) => void
  entferne: (host: string) => void
  leereZiele: () => void
  pruefe: (host: string) => void
  starte: (hosts: string[], setup: ToolSetup, optionen: ToolOptionen) => void
  verwerfe: (host: string) => void
}

const k = (h: string) => h.trim().toLowerCase()
const schlange: { key: string; setup: ToolSetup }[] = []
let aktiv = 0
const pruefSchlange: string[] = []
let pruefAktiv = 0

const wer = () => { const u = useAuthStore.getState().session?.user; return u?.displayName || u?.username || 'Tool' }

export const useItAdminToolStore = create<ToolState>((set, get) => {
  const setLauf = (key: string, f: (l: ToolLauf) => ToolLauf) => {
    set(st => (st.laeufe[key] ? { laeufe: { ...st.laeufe, [key]: f(st.laeufe[key]) } } : st))
  }
  const setStand = (key: string, e: StandEintrag) => set(st => ({ staende: { ...st.staende, [key]: e } }))

  const pumpePruefung = () => {
    while (pruefAktiv < MAX_PRUEFUNGEN && pruefSchlange.length) {
      const key = pruefSchlange.shift()!
      const ziel = get().ziele.find(z => k(z.host) === key)
      if (!ziel) { setStand(key, { laeuft: false }); continue }
      pruefAktiv++
      void pruefeToolStand(ziel.host)
        .catch(e => ({ ok: false, fehler: e instanceof Error ? e.message : String(e) } as ToolStand))
        .then(stand => { setStand(key, { laeuft: false, stand, am: Date.now() }) })
        .finally(() => { pruefAktiv--; pumpePruefung() })
    }
  }

  const pumpe = () => {
    while (aktiv < MAX_PARALLEL && schlange.length > 0) {
      const { key, setup } = schlange.shift()!
      const lauf = get().laeufe[key]
      if (!lauf) continue
      aktiv++
      setLauf(key, l => ({ ...l, phase: 'laeuft', startzeit: Date.now() }))
      const logId = logStart('IT Admin Tool', lauf.host, `${setup.name}${lauf.optionen.vorwarnSekunden ? ` · Vorwarnzeit ${lauf.optionen.vorwarnSekunden} s` : ' · ohne Vorwarnzeit'}`)

      const melde = (id: string, status: SchrittStatus, info?: string) => {
        setLauf(key, l => ({ ...l, schritte: l.schritte.map(s => (s.id === id ? { ...s, status, info: info ?? s.info } : s)) }))
      }

      const beenden = (erg: ToolErgebnis) => {
        aktiv--
        setLauf(key, l => ({ ...l, phase: erg.ok ? 'fertig' : 'fehler', ergebnis: erg, endzeit: Date.now() }))
        void logDeviceAction(lauf.host, undefined,
          `IT Admin Tool (neue Version): ${erg.ok ? 'installiert' : 'fehlgeschlagen'} — ${erg.text}`.slice(0, 1500),
          wer(), 'IT Admin Tool')
        void logId.then(id => logEnde(id, erg.ok ? 'ok' : 'fehler', erg.text))
        // Ist-Stand danach frisch zeigen
        if (get().ziele.some(z => k(z.host) === key)) get().pruefe(lauf.host)
        pumpe()
      }

      void installiereTool(lauf.host, setup, lauf.optionen, melde)
        .then(beenden)
        .catch(e => beenden({ ok: false, text: e instanceof Error ? e.message : String(e) }))
    }
  }

  return {
    ziele: [],
    staende: {},
    laeufe: {},

    fuegeHinzu: (z) => {
      const host = z.host.trim()
      if (!host || get().ziele.some(x => k(x.host) === k(host))) return
      set(st => ({ ziele: [...st.ziele, { ...z, host }] }))
      get().pruefe(host)
    },

    entferne: (host) => {
      const key = k(host)
      set(st => { const s = { ...st.staende }; delete s[key]; return { ziele: st.ziele.filter(z => k(z.host) !== key), staende: s } })
    },

    leereZiele: () => {
      const laufend = new Set(Object.entries(get().laeufe).filter(([, l]) => l.phase === 'laeuft' || l.phase === 'wartet').map(([key]) => key))
      set(st => ({ ziele: st.ziele.filter(z => laufend.has(k(z.host))) }))
    },

    pruefe: (host) => {
      const key = k(host)
      if (!key || get().staende[key]?.laeuft || pruefSchlange.includes(key)) return
      setStand(key, { ...get().staende[key], laeuft: true })
      pruefSchlange.push(key)
      pumpePruefung()
    },

    starte: (hosts, setup, optionen) => {
      for (const h of hosts) {
        const key = k(h)
        if (!key) continue
        const vorhanden = get().laeufe[key]
        if (vorhanden && (vorhanden.phase === 'laeuft' || vorhanden.phase === 'wartet')) continue
        set(st => ({
          laeufe: {
            ...st.laeufe,
            [key]: {
              host: h.trim(), optionen, setupName: setup.name, phase: 'wartet', startzeit: Date.now(),
              schritte: toolSchritte().map(s => ({ ...s, status: 'offen' as SchrittStatus })),
            },
          },
        }))
        schlange.push({ key, setup })
      }
      pumpe()
    },

    verwerfe: (host) => {
      const key = k(host)
      const l = get().laeufe[key]
      if (!l || l.phase === 'laeuft' || l.phase === 'wartet') return
      set(st => { const n = { ...st.laeufe }; delete n[key]; return { laeufe: n } })
    },
  }
})
