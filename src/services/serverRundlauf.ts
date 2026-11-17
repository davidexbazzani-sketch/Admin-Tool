// ── Dienst-Prüfung der Server als Rundlauf (Endlosschleife) ─────────────────
// Nutzerwunsch 17.11.2026: Die Dienst-/Einstellungs-Prüfung („Dienste & Prüfungen“) prüft
// immer nur EINEN Server zur Zeit, nacheinander in fester Reihenfolge (wie die Kacheln),
// mit 5 s Pause — nach dem letzten wieder der erste. Geprüft wird nur von BQ8069 (Konto
// des Nutzers); ist BQ8069 aus, übernimmt der nächste PC mit offenem Tool und gibt wieder
// ab, sobald BQ8069 zurück ist (Regel aus serverMelder.ts).
//
// Vorher (04.11.–17.11.): bei jedem 5-min-Ping ALLE Server, 2 gleichzeitig — das Zugriffs-
// protokoll vom 17.11. zeigte ~22 Prüfungen je Takt, der Takt war fast voll und ein Ping-
// Takt fiel aus. Jetzt hängt der Ping nicht mehr an der Dienst-Prüfung.
//
// Gemeinsamer Stand: server_monitor/rundlauf.json — wer die Schleife hat (Sperre mit
// Lebenszeichen, verwaist nach 5 min), welcher Server als nächster dran ist (ein neuer
// Besitzer macht dort weiter), Runde, gerade wieder erreichbare Server (zuerst prüfen).
// SEAL-`sysstatus` (30–50 s) läuft nur jede dritte Runde (bzw. sofort bei Fehler / nach
// einem Ausfall); dazwischen gilt das letzte SEAL-Ergebnis weiter.
// Zusätzlich hält die Schleife `status.pruefungLaeuft` frisch — ältere Tool-Versionen auf
// anderen PCs lassen ihre eigene 5-min-Gesamtprüfung dann aus.

import { api } from '../electronAPI'
import {
  loadServerConfig, loadServerStatus, aktualisiereStatus, mitStoerung, pruefeServerEinmal, runRebootCheck,
  meldeZiele, hostKey, type ServerTile, type ServerStatus,
} from './serverMonitor'
import { melde } from './serverEreignisse'
import { ladeSoll, speichereIst, type IstStand, type SollZustand, type Zusammenfassung } from './serverZustand'
import { eigeneKennung, eigenerRechner, eigenesKonto, BEVORZUGTER_MELDER } from './serverMelder'
import { istClusterKnoten } from './serverSchonung'

export const RUNDLAUF_PFAD = 'server_monitor/rundlauf.json'
/** Pause zwischen zwei Servern (Nutzerwunsch: 5 s). */
export const RUNDLAUF_PAUSE_MS = 5_000
/** Lebenszeichen des Besitzers — auch während langer Prüfungen (SEAL, Nachprüfung). */
export const LEBENSZEICHEN_MS = 60_000
/** Ohne Lebenszeichen gilt die Schleife als verwaist → ein anderer berechtigter PC übernimmt. */
export const SPERRE_VERWAIST_MS = 5 * 60_000
/** Kein Recht (BQ8069 ist an) bzw. fremde Sperre → so lange warten, dann erneut schauen. */
export const WARTEN_OHNE_RECHT_MS = 30_000
/** Keine prüfbaren Server (keiner mit Soll-Zustand / alle offline) → so lange warten. */
export const WARTEN_LEER_MS = 60_000
/** SEAL-`sysstatus` nur jede n-te Runde. */
export const SEAL_JEDE_RUNDE = 3
/** SEAL spätestens nach so langer Zeit wieder mitprüfen (falls Runden sehr lang werden). */
export const SEAL_HOECHSTENS_MS = 60 * 60_000
/** So viele Server HINTEREINANDER nicht erreichbar (laut Ping aber da) = Störung des prüfenden PCs. */
export const STOERUNG_FOLGE = 3
const STOERUNG_ART = 'Dienste & Prüfungen'

export interface RundlaufBesitzer { token: string; rechner: string; konto?: string; benutzer?: string }
export interface RundlaufStand {
  besitzer?: RundlaufBesitzer
  /** Lebenszeichen des Besitzers (ISO) */
  at?: string
  /** gerade in Prüfung (Hostname) */
  aktuell?: string
  aktuellSeit?: string
  /** als nächstes dran (Hostname) — ein neuer Besitzer macht hier weiter */
  naechster?: string
  runde: number
  rundeSeit?: string
  /** gerade wieder erreichbar → als nächstes prüfen (danach geht es beim Zeiger weiter) */
  vorziehen?: string[]
  zuletzt?: { host: string; am: string; ok: boolean; dauerMs?: number; mitSeal?: boolean }
  /** Server in der Reihenfolge (Anzeige „12/22“) und Position des aktuellen/letzten */
  anzahl?: number
  position?: number
}

// ── reine Funktionen (testbar) ─────────────────────────────────────────────

/** Reihenfolge = Kacheln wie im Server-Bildschirm (position), ohne Cluster-Knoten und Dubletten. */
export function reihenfolge(tiles: ServerTile[]): string[] {
  const gesehen = new Set<string>()
  return [...tiles]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map(t => (t.hostname || '').trim())
    .filter(h => {
      if (!h || istClusterKnoten(h)) return false
      const k = hostKey(h)
      if (gesehen.has(k)) return false
      gesehen.add(k)
      return true
    })
}

export interface Wahl { host: string; index: number; vorgezogen: boolean; umlauf: boolean }

/**
 * Nächster Server: zuerst einer aus `vorziehen` (in der Reihenfolge vorhanden, nicht offline),
 * sonst ab `naechster` weiter. `umlauf` = dabei über das Ende hinaus zurück zum Anfang (→ neue Runde).
 * Offline-Server (laut Ping) werden übersprungen. `null` = nichts prüfbar.
 */
export function naechsterHost(reihe: string[], stand: Pick<RundlaufStand, 'naechster' | 'vorziehen'>, offline: (hostKey: string) => boolean): Wahl | null {
  if (!reihe.length) return null
  const keys = reihe.map(hostKey)
  for (const v of stand.vorziehen || []) {
    const i = keys.indexOf(hostKey(v))
    if (i >= 0 && !offline(keys[i])) return { host: reihe[i], index: i, vorgezogen: true, umlauf: false }
  }
  let start = stand.naechster ? keys.indexOf(hostKey(stand.naechster)) : 0
  if (start < 0) start = 0
  for (let n = 0; n < keys.length; n++) {
    const i = (start + n) % keys.length
    if (offline(keys[i])) continue
    return { host: reihe[i], index: i, vorgezogen: false, umlauf: start + n >= keys.length }
  }
  return null
}

/** Stand nach der Prüfung des gewählten Servers: Zeiger weiter, ggf. neue Runde, `vorziehen` abgebaut. */
export function weiter(stand: RundlaufStand, reihe: string[], w: Wahl, jetzt: string): RundlaufStand {
  const s: RundlaufStand = { ...stand, anzahl: reihe.length, position: w.index + 1 }
  if (w.vorgezogen) {
    s.vorziehen = (stand.vorziehen || []).filter(v => hostKey(v) !== hostKey(w.host))
    if (!s.vorziehen.length) delete s.vorziehen
    return s
  }
  let runde = stand.runde || 1
  let rundeSeit = stand.rundeSeit || jetzt
  if (w.umlauf) { runde++; rundeSeit = jetzt }
  const n = w.index + 1
  if (n >= reihe.length) { runde++; rundeSeit = jetzt }
  s.runde = runde
  s.rundeSeit = rundeSeit
  s.naechster = reihe[n % reihe.length]
  // ein vorgezogener Server, der jetzt regulär dran war, muss nicht noch einmal vorgezogen werden
  if (s.vorziehen) { s.vorziehen = s.vorziehen.filter(v => hostKey(v) !== hostKey(w.host)); if (!s.vorziehen.length) delete s.vorziehen }
  return s
}

/** Darf `token` die Schleife (weiter) führen? Frei = kein Besitzer, verwaist oder ich selbst. */
export function sperreFrei(stand: RundlaufStand | null | undefined, token: string, jetzt = Date.now()): boolean {
  if (!stand?.besitzer) return true
  if (stand.besitzer.token === token) return true
  const t = Date.parse(stand.at || '')
  return isNaN(t) || jetzt - t >= SPERRE_VERWAIST_MS
}

/**
 * SEAL-`sysstatus` diesmal mitprüfen? Nur jede dritte Runde — außer: gerade wieder erreichbar
 * (vorgezogen), letzter SEAL-Stand fehlt / hatte einen Fehler (dann sofort wieder, damit Alarm
 * und Entwarnung schnell kommen) oder ist älter als 60 min.
 */
export function mitSealPruefen(runde: number, vorgezogen: boolean, vorher: IstStand | null, soll: SollZustand, jetzt = Date.now()): boolean {
  const ids = new Set(soll.punkte.filter(p => p.typ === 'seal').map(p => p.id))
  if (!ids.size) return false
  if (vorgezogen) return true
  if (!vorher || !vorher.erreichbar) return true
  const alt = vorher.ergebnisse.filter(e => ids.has(e.id))
  if (!alt.length) return true
  if (alt.some(e => !e.ok)) return true
  const zuletzt = Date.parse(vorher.sealAm || vorher.am || '')
  if (isNaN(zuletzt) || jetzt - zuletzt >= SEAL_HOECHSTENS_MS) return true
  return (runde || 1) % SEAL_JEDE_RUNDE === 0
}

/** Ein nicht erreichbarer Server der laufenden Folge (mit Stand VOR seiner Prüfung). */
export interface StoerungsGlied { host: string; vorherIst: IstStand | null; vorherZ?: Zusammenfassung }
export interface StoerungsStand { folge: StoerungsGlied[]; aktiv: boolean }
export const KEINE_STOERUNG: StoerungsStand = { folge: [], aktiv: false }
/**
 * Störung des prüfenden PCs erkennen: STOERUNG_FOLGE Server hintereinander per WinRM nicht
 * erreichbar, obwohl der Ping sie sieht → liegt am PC (Rechte, WinRM, Zscaler), nicht an den Servern.
 * `zuruecksetzen` = diese Server bekommen ihren alten Stand zurück (Kacheln nicht verfälschen).
 */
export function naechsteStoerung(s: StoerungsStand, glied: StoerungsGlied, erreichbar: boolean): { stand: StoerungsStand; zuruecksetzen: StoerungsGlied[]; setzen: boolean; aufheben: boolean } {
  if (erreichbar) return { stand: KEINE_STOERUNG, zuruecksetzen: [], setzen: false, aufheben: s.aktiv }
  const folge = [...s.folge, glied]
  if (s.aktiv) return { stand: { folge, aktiv: true }, zuruecksetzen: [glied], setzen: false, aufheben: false }
  if (folge.length >= STOERUNG_FOLGE) return { stand: { folge, aktiv: true }, zuruecksetzen: folge, setzen: true, aufheben: false }
  return { stand: { folge, aktiv: false }, zuruecksetzen: [], setzen: false, aufheben: false }
}

const kurz = (r?: string) => (r || '').trim().toUpperCase().split('.')[0]
const uhr = (iso?: string) => { const t = Date.parse(iso || ''); return isNaN(t) ? '' : new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) }

/** Anzeige im Server-Bildschirm (Chip neben „Meldungen von …“). */
export function rundlaufText(s: RundlaufStand | null | undefined, jetzt = Date.now()): { aktiv: boolean; text: string; titel: string } {
  const titel = [
    'Dienste & Prüfungen laufen automatisch als Rundlauf:',
    '• immer nur EIN Server zur Zeit, 5 s Pause bis zum nächsten',
    '• Reihenfolge wie die Kacheln — nach dem letzten wieder der erste',
    `• geprüft wird von ${BEVORZUGTER_MELDER}; ist ${BEVORZUGTER_MELDER} aus, übernimmt der nächste PC mit offenem Tool`,
    `• SEAL-sysstatus (Plossys) nur jede ${SEAL_JEDE_RUNDE}. Runde bzw. sofort bei einem Fehler`,
    '• gerade wieder erreichbare Server kommen sofort dran',
    'Nur lesend — es wird nichts auf den Servern geändert.',
  ].join('\n')
  const t = Date.parse(s?.at || '')
  if (!s?.besitzer || isNaN(t) || jetzt - t >= SPERRE_VERWAIST_MS) {
    return { aktiv: false, text: 'Dienst-Prüfung pausiert – kein berechtigter PC mit offenem Tool', titel }
  }
  const wer = s.besitzer.konto ? kurz(s.besitzer.konto.split('\\').pop()) : kurz(s.besitzer.rechner)
  const wo = s.aktuell ? `${s.aktuell}${s.position && s.anzahl ? ` (${s.position}/${s.anzahl})` : ''}`
    : s.zuletzt ? `zuletzt ${s.zuletzt.host}${s.position && s.anzahl ? ` (${s.position}/${s.anzahl})` : ''}` : 'startet'
  const runde = s.runde ? ` · Runde ${s.runde}${s.rundeSeit ? ` seit ${uhr(s.rundeSeit)}` : ''}` : ''
  return { aktiv: true, text: `Dienst-Prüfung: ${wo}${runde} · ${wer || 'unbekannt'}`, titel }
}

// ── gemeinsamer Stand (rundlauf.json) ──────────────────────────────────────

export async function ladeRundlauf(): Promise<RundlaufStand | null> {
  try {
    const s = await api().netReadJsonAsync<RundlaufStand>(RUNDLAUF_PFAD)
    return s && typeof s === 'object' ? { ...s, runde: Number(s.runde) || 1 } : null
  } catch { return null }
}

// Lesen+Schreiben von rundlauf.json in diesem Fenster strikt nacheinander (Schleife, Lebenszeichen, Controller)
let standKette: Promise<unknown> = Promise.resolve()
export function aendereRundlauf(fn: (s: RundlaufStand) => RundlaufStand | null): Promise<RundlaufStand | null> {
  const p = standKette.then(async () => {
    const alt = (await ladeRundlauf()) || { runde: 1 }
    const neu = fn(alt)
    if (!neu) return alt
    try { await api().netWriteJsonAsync(RUNDLAUF_PFAD, neu) } catch { /* nächster Durchgang */ }
    return neu
  })
  standKette = p.catch(() => null)
  return p
}

/** Gerade wieder erreichbare Server (aus dem Ping) als nächstes prüfen lassen. */
export function vorziehen(hosts: string[]): Promise<RundlaufStand | null> {
  const neu = hosts.map(h => (h || '').trim()).filter(Boolean)
  if (!neu.length) return Promise.resolve(null)
  return aendereRundlauf(s => {
    const da = new Set((s.vorziehen || []).map(hostKey))
    const v = [...(s.vorziehen || []), ...neu.filter(h => !da.has(hostKey(h)))]
    return { ...s, vorziehen: v }
  })
}

// ── die Schleife ────────────────────────────────────────────────────────────

export interface RundlaufOptionen {
  /** Anzeigename für Historie/Meldungen */
  by: () => string
  /** Darf dieser PC prüfen? (BQ8069 bzw. Vertretung, wenn BQ8069 aus ist) */
  darf: () => Promise<boolean>
  /** nur für Tests */
  warte?: (ms: number) => Promise<void>
  /** nur für Tests: Lebenszeichen-Takt */
  lebenszeichenMs?: number
}

let aktiveSchleife: { stop: () => void } | null = null

/** Läuft in diesem Fenster gerade eine Schleife? (nur für Tests/Anzeige) */
export const rundlaufAktiv = () => !!aktiveSchleife

/**
 * Startet die Endlosschleife (pro Fenster nur einmal). Rückgabe: Stop-Funktion — gibt die
 * Sperre frei, damit sofort ein anderer berechtigter PC übernehmen kann.
 */
export function starteRundlauf(o: RundlaufOptionen): () => void {
  if (aktiveSchleife) return aktiveSchleife.stop
  let aktiv = true
  const token = `rl#${Math.random().toString(36).slice(2, 10)}`
  const warteRoh = o.warte || ((ms: number) => new Promise<void>(r => setTimeout(r, ms)))
  // Warten, das beim Stoppen sofort endet
  let wecken: (() => void) | null = null
  const warte = (ms: number) => new Promise<void>(r => {
    let fertig = false
    const ende = () => { if (!fertig) { fertig = true; wecken = null; r() } }
    wecken = ende
    void warteRoh(ms).then(ende)
  })
  const iso = () => new Date().toISOString()

  const gebeFrei = async () => {
    await aendereRundlauf(s => s.besitzer?.token === token ? { ...s, besitzer: undefined, aktuell: undefined, aktuellSeit: undefined, at: iso() } : null).catch(() => null)
    await aktualisiereStatus(f => f.pruefungLaeuft?.by === token ? { ...f, pruefungLaeuft: undefined } : f).catch(() => false)
  }

  let besitzer = false
  const schleife = async () => {
    let stoerung: StoerungsStand = KEINE_STOERUNG
    while (aktiv) {
      try {
        // 1) Recht prüfen (BQ8069 bzw. Vertretung) — ohne Recht: abgeben und warten
        if (!(await o.darf())) {
          if (besitzer) { await gebeFrei(); besitzer = false }
          await warte(WARTEN_OHNE_RECHT_MS); continue
        }
        // 2) Sperre: frei/verwaist/meine? Sonst warten (der andere gibt nach seinem Server ab)
        const stand = await ladeRundlauf()
        if (!sperreFrei(stand, token)) { besitzer = false; await warte(WARTEN_OHNE_RECHT_MS); continue }
        if (!besitzer || stand?.besitzer?.token !== token) {
          const [rechner, konto] = await Promise.all([eigenerRechner(), eigenesKonto()])
          await aendereRundlauf(s => ({ ...s, besitzer: { token, rechner: rechner || 'unbekannt', konto: konto || undefined, benutzer: o.by() }, at: iso() }))
          // Gegenprobe nach kurzer Zufallspause — zwei PCs, die gleichzeitig übernehmen wollten
          await warte(1000 + Math.floor(Math.random() * 2000))
          if (!aktiv) break
          if ((await ladeRundlauf())?.besitzer?.token !== token) { besitzer = false; continue }
          besitzer = true
        }
        // 3) nächster Server mit Soll-Zustand — Server ohne Soll werden ohne Fernabfrage übersprungen
        const [cfg, status] = await Promise.all([loadServerConfig(), loadServerStatus()])
        const reihe = reihenfolge(cfg.tiles)
        const aktuellerStand = (await ladeRundlauf()) || { runde: 1 }
        const offline = (key: string) => status.servers[key]?.online === false
        let zeiger: RundlaufStand = aktuellerStand
        const verbraucht = new Set<string>()   // übersprungene „vorziehen“-Einträge
        let wahl = naechsterHost(reihe, zeiger, offline)
        let soll = wahl ? await ladeSoll(wahl.host) : null
        for (let n = 0; wahl && !soll?.punkte.length && n < reihe.length; n++) {
          if (wahl.vorgezogen) verbraucht.add(hostKey(wahl.host))
          zeiger = weiter(zeiger, reihe, wahl, iso())
          wahl = naechsterHost(reihe, zeiger, offline)
          soll = wahl ? await ladeSoll(wahl.host) : null
        }
        const zeigerFelder = (s: RundlaufStand): RundlaufStand => ({
          ...s, naechster: zeiger.naechster, runde: zeiger.runde || s.runde, rundeSeit: zeiger.rundeSeit || s.rundeSeit,
          vorziehen: (s.vorziehen || []).filter(v => !verbraucht.has(hostKey(v))),
        })
        if (!wahl || !soll?.punkte.length) {
          // nichts prüfbar (kein Server mit Soll-Zustand bzw. alle offline) → in Ruhe warten
          await aendereRundlauf(s => s.besitzer?.token === token ? { ...zeigerFelder(s), at: iso(), aktuell: undefined, anzahl: reihe.length } : null)
          await warte(WARTEN_LEER_MS); continue
        }
        const gewaehlt = wahl
        const tile = cfg.tiles.find(t => hostKey(t.hostname) === hostKey(gewaehlt.host))
        if (!tile) continue
        const k = hostKey(gewaehlt.host)
        const start = iso()
        await aendereRundlauf(s => s.besitzer?.token === token ? { ...zeigerFelder(s), at: start, aktuell: gewaehlt.host, aktuellSeit: start, anzahl: reihe.length, position: gewaehlt.index + 1 } : null)

        // 4) prüfen — Lebenszeichen auch während langer Prüfungen
        const herz = setInterval(() => {
          void aendereRundlauf(s => s.besitzer?.token === token ? { ...s, at: iso() } : null)
          void aktualisiereStatus(f => ({ ...f, pruefungLaeuft: { by: token, at: iso() } })).catch(() => false)
        }, o.lebenszeichenMs ?? LEBENSZEICHEN_MS)
        const von = await eigeneKennung().catch(() => '')
        const runde = zeiger.runde || 1
        const vorherZ: Zusammenfassung | undefined = (status.servers[k] as ServerStatus | undefined)?.pruefung
        const t0 = Date.now()
        let e: Awaited<ReturnType<typeof pruefeServerEinmal>> = null
        try {
          e = await pruefeServerEinmal(tile, { von, mitSeal: (sl, vorher) => mitSealPruefen(runde, gewaehlt.vorgezogen, vorher, sl) })
        } finally { clearInterval(herz) }
        const dauerMs = Date.now() - t0

        if (e) {
          // 5) Störung des PCs? (mehrere Server hintereinander per WinRM weg, Ping sieht sie)
          const st = naechsteStoerung(stoerung, { host: e.host, vorherIst: e.vorher, vorherZ }, e.erreichbar)
          stoerung = st.stand
          for (const g of st.zuruecksetzen) if (g.vorherIst) await speichereIst(g.host, g.vorherIst).catch(() => undefined)
          const fehler = (e.zusammenfassung.fehler || 'keine Antwort per WinRM').slice(0, 300)
          await aktualisiereStatus(f => {
            const servers = { ...f.servers }
            const basis = (h: string) => servers[hostKey(h)] || { online: true, consecutiveFailures: 0 }
            if (!stoerung.aktiv) servers[k] = { ...basis(e!.host), pruefung: e!.zusammenfassung }
            for (const g of st.zuruecksetzen) {
              const alt = basis(g.host)
              servers[hostKey(g.host)] = g.vorherZ ? { ...alt, pruefung: g.vorherZ } : { ...alt, pruefung: undefined }
            }
            const abfrageStoerung = st.setzen ? mitStoerung(f, STOERUNG_ART, { von, at: iso(), fehler, server: st.stand.folge.length })
              : st.aufheben || (e!.erreichbar && f.abfrageStoerung?.[STOERUNG_ART]) ? mitStoerung(f, STOERUNG_ART, null) : f.abfrageStoerung
            return { ...f, servers, abfrageStoerung, pruefungLaeuft: { by: token, at: iso() } }
          })
          // 6) neues Problem sofort melden (Popup, Mail, Historie)
          if (e.ereignis && !stoerung.aktiv) await melde([e.ereignis], meldeZiele(cfg.tiles), o.by()).catch(() => [])
          // 7) Startzeit gleich mit auswerten (keine weitere Fernabfrage; nur bei neuem Start wird der Grund gelesen)
          if (e.boot) await runRebootCheck(o.by(), [e.host], { bekannt: { [k]: e.boot }, auto: true }).catch(() => undefined)
        }

        // 8) Zeiger weiter
        await aendereRundlauf(s => {
          if (s.besitzer?.token !== token) return null
          const n = weiter(s, reihe, gewaehlt, iso())
          return {
            ...n, at: iso(), aktuell: undefined, aktuellSeit: undefined,
            zuletzt: e ? { host: e.host, am: iso(), ok: e.erreichbar && e.probleme === 0, dauerMs, mitSeal: e.mitSeal || undefined } : s.zuletzt,
          }
        })
        // 9) Pause bis zum nächsten Server
        await warte(RUNDLAUF_PAUSE_MS)
      } catch {
        await warte(WARTEN_OHNE_RECHT_MS)
      }
    }
    if (besitzer) { besitzer = false; await gebeFrei() }
  }

  const stop = () => {
    if (!aktiv) return
    aktiv = false
    aktiveSchleife = null
    // sofort freigeben (Fenster wird evtl. gleich geschlossen) — die Schleife gibt am Ende noch einmal frei
    if (besitzer) void gebeFrei()
    try { (wecken as (() => void) | null)?.() } catch { /* egal */ }
  }
  aktiveSchleife = { stop }
  void schleife().finally(() => { if (aktiveSchleife?.stop === stop) aktiveSchleife = null })
  return stop
}
