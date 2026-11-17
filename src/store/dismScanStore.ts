// ── Server: Health Check (DISM ScanHealth + sfc /verifyonly) — Hintergrund-Store ──
// Der Lauf überlebt einen Menüwechsel. Seit 17.11.2026 gilt: IMMER NUR EIN Health Check zur
// Zeit — über alle Admins hinweg (Sperre server_monitor/dism/sperre.json, siehe serverDism.ts).
// Grund: Während eines Sammellaufs mit 3 Servern gleichzeitig dauerten die Dienst-Prüfungen der
// übrigen Server 35–65 % länger (ScanHealth und SFC lesen große Teile des Systemlaufwerks, alle
// VMs liegen auf demselben Cluster-Speicher).
//   • Sammel-Lauf „alle Server“ und Einzel-Scan („prüfen“ auf der Kachel) teilen sich EINE
//     Warteschlange; ein Einzel-Scan wird vorn eingereiht (wartet nur auf den laufenden).
//   • Läuft gerade ein Health Check von einem anderen PC, wartet die Schlange (alle 60 s neu
//     nachsehen) und zeigt „wartet – Health Check läuft gerade auf …“.
//   • Zwischen zwei Scans 15 s Abstand. Pause/Abbrechen wirken auf die Schlange; was schon läuft,
//     läuft auf dem Server zu Ende.
// Jeder Server-Scan → Aktivitätsprotokoll; am Ende ein Bericht (.md + .json) auf dem Netzlaufwerk.

import { create } from 'zustand'
import {
  scanneServer, markiereLaeuft, entferneLaeuft, speichereBericht, dismNichtErreichbar, zustandText, sfcKurz,
  holeDismSperre, erneuereDismSperre, gibDismSperreFrei, DISM_SPERRE_LEBENSZEICHEN_MS,
  type DismErgebnis, type DismMeta, type DismSperre,
} from '../services/serverDism'
import { hostKey } from '../services/serverMonitor'
import { protokolliere } from '../services/aktivitaet'
import { istClusterKnoten } from '../services/serverSchonung'
import { eigenerRechner } from '../services/serverMelder'

/** Immer nur ein Server gleichzeitig (früher wählbar 1–4, Standard 3). */
export const DISM_STANDARD_PARALLEL = 1
const START_ABSTAND_MS = 15_000
/** Sperre belegt (anderer PC) → so lange warten, dann erneut versuchen. */
const SPERRE_WARTEN_MS = 60_000

export type DismPhase = 'wartet' | 'laeuft' | 'fertig'
export interface DismHostLauf { host: string; phase: DismPhase; seit?: number; ergebnis?: DismErgebnis; sammel: boolean }
export interface DismBericht { md: string; json: unknown; rel: string; ok: boolean; vorschlag: string; titel: string }
export interface DismSammelLauf {
  von: string
  start: number
  parallel: number
  /** alle Server dieses Laufs (Reihenfolge der Kacheln) */
  hosts: string[]
  /** laut Ping offline → nicht gescannt, im Bericht als „nicht erreichbar“ */
  uebersprungen: { host: string; grund: string }[]
  meta: Record<string, DismMeta>
  pausiert: boolean
  abgebrochen: boolean
  fertigAm?: number
  bericht?: DismBericht
  berichtFehler?: string
}
/** Die Schlange wartet, weil gerade woanders (anderer PC / Komplett-Diagnose) ein Health Check läuft. */
export interface DismWartet { host: string; von: string; rechner?: string; seit?: string; art?: DismSperre['art'] }

interface DismState {
  lauf: DismSammelLauf | null
  hosts: Record<string, DismHostLauf>
  einzelBerichte: Record<string, DismBericht>
  wartetAuf: DismWartet | null
  starteAlle: (hosts: string[], uebersprungen: { host: string; grund: string }[], meta: Record<string, DismMeta>, von: string, parallel?: number) => void
  starteEinzel: (host: string, meta: DismMeta | undefined, von: string) => void
  pause: () => void
  fortsetzen: () => void
  abbrechen: () => void
  schliesseLauf: () => void
}

interface Auftrag { host: string; sammel: boolean; meta?: DismMeta; von: string }
const schlange: Auftrag[] = []
let aktiv: Auftrag | null = null
let pumpeBelegt = false
let naechsterStart = 0
let pumpeTimer: ReturnType<typeof setTimeout> | null = null
/** Kennung dieses Fensters für die gemeinsame Sperre */
const TOKEN = `health#${Math.random().toString(36).slice(2, 10)}`

/** Nur für Tests: Zustand der Schlange zurücksetzen. */
export function _dismSchlangeZuruecksetzen(): void {
  schlange.length = 0; aktiv = null; pumpeBelegt = false; naechsterStart = 0
  if (pumpeTimer) { clearTimeout(pumpeTimer); pumpeTimer = null }
}

export const useDismScanStore = create<DismState>((set, get) => {
  const setHost = (k: string, f: (h: DismHostLauf | undefined) => DismHostLauf | undefined) => set(st => {
    const neu = f(st.hosts[k])
    const hosts = { ...st.hosts }
    if (neu) hosts[k] = neu; else delete hosts[k]
    return { hosts }
  })

  /** Einen Server scannen (Sammel oder Einzel) — Protokoll + Kachel-Status inklusive. */
  const fuehreAus = async (host: string, von: string, sammel: boolean): Promise<DismErgebnis> => {
    const k = hostKey(host)
    setHost(k, () => ({ host, phase: 'laeuft', seit: Date.now(), sammel }))
    await markiereLaeuft(host, von)
    let e: DismErgebnis
    try { e = await scanneServer(host, von) }
    catch (err) {
      e = dismNichtErreichbar(host, err instanceof Error ? err.message : String(err), von)
      await entferneLaeuft(host)
    }
    setHost(k, h => ({ host, phase: 'fertig', seit: h?.seit, ergebnis: e, sammel }))
    protokolliere({
      art: 'manuell', quelle: 'Server · Health Check', ziel: host,
      aktion: 'Health Check ausgeführt (nur gelesen): DISM /Online /Cleanup-Image /ScanHealth + sfc /verifyonly',
      ergebnis: `DISM ${zustandText[e.zustand]} – ${e.text}${e.sfc ? ` · SFC ${sfcKurz[e.sfc.zustand]} – ${e.sfc.text}` : ''}`.slice(0, 300),
      details: [e.meldung, e.fehlerCode && `Fehlercode ${e.fehlerCode}`, e.beschaedigt.length ? `${e.beschaedigt.length} beschädigte Komponente(n)` : '',
        e.sfc?.meldung && `SFC: ${e.sfc.meldung}`, e.sfc?.dateien.length ? `${e.sfc.dateien.length} beanstandete Systemdatei(en)` : ''].filter(Boolean) as string[],
    })
    return e
  }

  const pruefeEnde = () => {
    const l = get().lauf
    if (!l || l.fertigAm || aktiv?.sammel) return
    const offen = schlange.some(a => a.sammel)
    if (offen && !l.abgebrochen) return
    for (let i = schlange.length - 1; i >= 0; i--) if (schlange[i].sammel) schlange.splice(i, 1)
    const fertigAm = Date.now()
    set(st => (st.lauf ? { lauf: { ...st.lauf, fertigAm } } : st))
    const hs = get().hosts
    const liste: DismErgebnis[] = [
      ...l.hosts.map(h => hs[hostKey(h)]?.ergebnis).filter((e): e is DismErgebnis => !!e),
      ...l.uebersprungen.map(u => dismNichtErreichbar(u.host, u.grund, l.von)),
    ]
    const name = l.abgebrochen ? `abgebrochen-${liste.length}-Server` : `alle-${liste.length}-Server`
    void speichereBericht(liste, l.meta, l.von, name)
      .then(b => set(st => (st.lauf ? { lauf: { ...st.lauf, bericht: { ...b, vorschlag: b.rel.split('/').pop() || 'HealthCheck-Bericht.md', titel: `Health-Check-Bericht · ${liste.length} Server${l.abgebrochen ? ' (abgebrochen)' : ''}` } } } : st)))
      .catch(err => set(st => (st.lauf ? { lauf: { ...st.lauf, berichtFehler: err instanceof Error ? err.message : String(err) } } : st)))
  }

  /** Nächsten Auftrag starten — höchstens EINER läuft, und nur mit der gemeinsamen Sperre. */
  const pumpe = async () => {
    if (pumpeTimer) { clearTimeout(pumpeTimer); pumpeTimer = null }
    if (aktiv || pumpeBelegt) return
    const l = get().lauf
    const sammelDarf = !!l && !l.fertigAm && !l.pausiert && !l.abgebrochen
    const i = schlange.findIndex(a => !a.sammel || sammelDarf)
    if (i < 0) { set({ wartetAuf: null }); pruefeEnde(); return }
    const warte = naechsterStart - Date.now()
    if (warte > 0) { pumpeTimer = setTimeout(() => { void pumpe() }, warte); return }
    const a = schlange[i]
    pumpeBelegt = true
    let r: { ok: boolean; belegt?: DismSperre }
    try { r = await holeDismSperre(TOKEN, a.host, a.von, { art: 'health', rechner: await eigenerRechner().catch(() => '') || undefined }) }
    catch { r = { ok: false } }
    finally { pumpeBelegt = false }
    if (!r.ok) {
      set({ wartetAuf: r.belegt ? { host: r.belegt.host, von: r.belegt.von, rechner: r.belegt.rechner, seit: r.belegt.seit, art: r.belegt.art } : { host: '', von: '' } })
      pumpeTimer = setTimeout(() => { void pumpe() }, SPERRE_WARTEN_MS)
      return
    }
    set({ wartetAuf: null })
    // inzwischen aus der Schlange genommen (Abbrechen)? → Sperre zurückgeben, neu wählen
    const j = schlange.indexOf(a)
    if (j < 0) { await gibDismSperreFrei(TOKEN); void pumpe(); return }
    schlange.splice(j, 1)
    aktiv = a
    naechsterStart = Date.now() + START_ABSTAND_MS
    const herz = setInterval(() => { void erneuereDismSperre(TOKEN) }, DISM_SPERRE_LEBENSZEICHEN_MS)
    void fuehreAus(a.host, a.von, a.sammel)
      .then(async e => {
        if (a.sammel) return
        const k = hostKey(a.host)
        const b = await speichereBericht([e], { [k]: a.meta || {} }, a.von, k).catch(() => null)
        if (b) set(st => ({ einzelBerichte: { ...st.einzelBerichte, [k]: { ...b, vorschlag: b.rel.split('/').pop() || `HealthCheck_${k}.md`, titel: `Health-Check-Bericht · ${k}` } } }))
      })
      .finally(async () => {
        clearInterval(herz)
        await gibDismSperreFrei(TOKEN).catch(() => undefined)
        aktiv = null
        void pumpe()
      })
  }

  return {
    lauf: null,
    hosts: {},
    einzelBerichte: {},
    wartetAuf: null,

    starteAlle: (hosts, uebersprungen, meta, von) => {
      const l = get().lauf
      if (l && !l.fertigAm) return
      // Riegel: Cluster-Knoten (HCI) nie per DISM — nur Ping (serverSchonung.ts)
      const eindeutig = [...new Map(hosts.map(h => [hostKey(h), h.trim()])).values()].filter(h => h && !istClusterKnoten(h))
      for (let i = schlange.length - 1; i >= 0; i--) if (schlange[i].sammel) schlange.splice(i, 1)
      // Server, die gerade laufen bzw. schon einzeln eingereiht sind, nicht doppelt (Ergebnis kommt trotzdem in den Bericht)
      const belegt = new Set([...(aktiv ? [hostKey(aktiv.host)] : []), ...schlange.map(a => hostKey(a.host))])
      const neu = eindeutig.filter(h => !belegt.has(hostKey(h)))
      schlange.push(...neu.map(h => ({ host: h, sammel: true, meta: meta[hostKey(h)], von })))
      naechsterStart = 0
      set(st => {
        const hs: Record<string, DismHostLauf> = {}
        for (const [k, h] of Object.entries(st.hosts)) if (h.phase === 'laeuft' || (h.phase === 'wartet' && !h.sammel)) hs[k] = h
        for (const h of neu) hs[hostKey(h)] = { host: h, phase: 'wartet', sammel: true }
        return {
          hosts: hs,
          lauf: { von, start: Date.now(), parallel: DISM_STANDARD_PARALLEL, hosts: eindeutig, uebersprungen, meta, pausiert: false, abgebrochen: false },
        }
      })
      void pumpe()
    },

    starteEinzel: (host, meta, von) => {
      if (istClusterKnoten(host)) return   // Cluster-Knoten nur per Ping
      const k = hostKey(host)
      if (aktiv && hostKey(aktiv.host) === k) return   // läuft gerade
      // wartet er schon (Sammel-Lauf oder Einzel)? → nach vorn holen, Zugehörigkeit bleibt
      const i = schlange.findIndex(a => hostKey(a.host) === k)
      const auftrag: Auftrag = i >= 0 ? schlange.splice(i, 1)[0] : { host: host.trim(), sammel: false, meta, von }
      schlange.unshift(auftrag)
      setHost(k, h => (h?.phase === 'laeuft' ? h : { host: auftrag.host, phase: 'wartet', sammel: auftrag.sammel }))
      void pumpe()
    },

    pause: () => set(st => (st.lauf && !st.lauf.fertigAm ? { lauf: { ...st.lauf, pausiert: true } } : st)),
    fortsetzen: () => { set(st => (st.lauf && !st.lauf.fertigAm ? { lauf: { ...st.lauf, pausiert: false } } : st)); void pumpe() },
    abbrechen: () => {
      const wartend: string[] = []
      for (let i = schlange.length - 1; i >= 0; i--) if (schlange[i].sammel) wartend.push(schlange.splice(i, 1)[0].host)
      set(st => {
        if (!st.lauf || st.lauf.fertigAm) return st
        const hosts = { ...st.hosts }
        for (const h of wartend) { const k = hostKey(h); if (hosts[k]?.phase === 'wartet') delete hosts[k] }
        return { hosts, lauf: { ...st.lauf, abgebrochen: true, pausiert: false } }
      })
      pruefeEnde()
      void pumpe()
    },
    schliesseLauf: () => set(st => {
      if (st.lauf && !st.lauf.fertigAm) return st
      // Ergebnisse der Sammel-Läufe aus der Live-Ansicht nehmen (Kachel zeigt dann status.json)
      const hosts: Record<string, DismHostLauf> = {}
      for (const [k, h] of Object.entries(st.hosts)) if (h.phase === 'laeuft' || h.phase === 'wartet' || !h.sammel) hosts[k] = h
      return { lauf: null, hosts }
    }),
  }
})
