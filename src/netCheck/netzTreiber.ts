// Netzwerk-Diagnose: Netzwerk-Treiber (WLAN/LAN/WWAN) prüfen und aktualisieren.
// Grundlage ist die vorhandene HP-Treiber-Erkennung (HP CMSL am Admin-PC + PnP-Inventar am Ziel, siehe
// services/hpDrivers.ts). Installiert wird ABGESICHERT (SYSTEM-Aufgabe am PC), weil der Treibertausch die
// Verbindung kurz trennt. Nie auf Servern, nie BIOS/Firmware, nie automatisch wiederholt.
import { create } from 'zustand'
import { scanOneHost, deployOneHost, istNetzwerkTreiber, type DriverItem, type HpHostReport, type HpDeployResult } from '../services/hpDrivers'
import { istBekannterServer } from '../services/itAdminToolInstall'
import { PER_KLICK } from '../services/aktivitaet'

export type NetzTreiberPhase = 'idle' | 'pruefen' | 'bereit' | 'installieren' | 'fertig' | 'fehler'

export interface NetzTreiberStand {
  phase: NetzTreiberPhase
  report?: HpHostReport
  /** Netzwerk-Treiber, die zu DIESEM PC passen */
  items: DriverItem[]
  /** passende Netz-SoftPaqs, die aber nicht zur Hardware passen (nur gezählt) */
  nichtPassend: number
  fehler?: string
  schritt?: string
  ergebnis?: HpDeployResult
  at?: string
}

/** Aus dem HP-Bericht die Netzwerk-Treiber holen, die zu diesem PC passen (rein, testbar). */
export function netzTreiberAus(r: HpHostReport): { items: DriverItem[]; nichtPassend: number } {
  const netz = r.items.filter(i => (i.klasse === 'normal' || i.klasse === 'kritisch') && istNetzwerkTreiber(i))
  // Nur Treiber, die nachweislich zu einem Gerät in diesem PC gehören (ohne Hardware-Liste: keiner)
  const passt = (i: DriverItem) => i.anwendbar && !i.matchUnsicher
  const rang = (i: DriverItem) => i.status === 'veraltet' ? 0 : i.status === 'unbekannt' ? 1 : 2
  return {
    items: netz.filter(passt).sort((a, b) => rang(a) - rang(b) || a.name.localeCompare(b.name)),
    nichtPassend: netz.filter(i => !passt(i)).length,
  }
}

/** Vorauswahl: nur sicher passende, nachweislich veraltete Treiber. */
export function vorausgewaehlt(i: DriverItem): boolean {
  return i.status === 'veraltet' && i.anwendbar && !i.matchUnsicher
}

const LEER: NetzTreiberStand = { phase: 'idle', items: [], nichtPassend: 0 }

interface Store {
  byHost: Record<string, NetzTreiberStand>
  pruefe: (host: string, frischerKatalog?: boolean) => Promise<void>
  installiere: (host: string, items: DriverItem[], by: string, benutzerInformieren: boolean) => Promise<void>
}

const key = (h: string) => h.trim().toUpperCase()

export const useNetzTreiber = create<Store>((set, get) => {
  const setze = (host: string, p: Partial<NetzTreiberStand>) =>
    set(s => ({ byHost: { ...s.byHost, [key(host)]: { ...(s.byHost[key(host)] || LEER), ...p } } }))
  return {
    byHost: {},
    pruefe: async (host, frischerKatalog = false) => {
      const st = get().byHost[key(host)]
      if (st && (st.phase === 'pruefen' || st.phase === 'installieren')) return
      setze(host, { phase: 'pruefen', fehler: undefined, ergebnis: undefined, schritt: 'Treiber am PC lesen und mit dem HP-Katalog vergleichen …' })
      try {
        const r = await scanOneHost(host, frischerKatalog)
        if (!r.online) { setze(host, { phase: 'fehler', fehler: r.error || 'PC nicht erreichbar (WinRM/offline).', report: r, items: [], schritt: undefined }); return }
        const { items, nichtPassend } = netzTreiberAus(r)
        setze(host, { phase: r.error && !items.length ? 'fehler' : 'bereit', report: r, items, nichtPassend, fehler: r.error, at: new Date().toISOString(), schritt: undefined })
      } catch (e) {
        setze(host, { phase: 'fehler', fehler: e instanceof Error ? e.message : String(e), schritt: undefined })
      }
    },
    installiere: async (host, items, by, benutzerInformieren) => {
      const st = get().byHost[key(host)]
      if (!items.length || st?.phase === 'installieren') return
      if (await istBekannterServer(host)) { setze(host, { phase: 'fehler', fehler: `${host} ist ein Server — dort installiert das Tool keine Treiber.` }); return }
      setze(host, { phase: 'installieren', fehler: undefined, ergebnis: undefined, schritt: 'Start …' })
      try {
        const r = await deployOneHost(host, items, {
          rebootMode: 'notify', by, notifyUser: benutzerInformieren, netzAbgesichert: true,
          ausloeser: PER_KLICK('Netzwerk-Diagnose → Netzwerk-Treiber'),
        }, s => setze(host, { schritt: s.phase }))
        setze(host, { phase: 'fertig', ergebnis: r, schritt: undefined, at: r.ranAt })
      } catch (e) {
        setze(host, { phase: 'fehler', fehler: e instanceof Error ? e.message : String(e), schritt: undefined })
      }
    },
  }
})
