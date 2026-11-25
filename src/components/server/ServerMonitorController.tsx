// ── Server-Monitor: Hintergrund-Controller (global in App.tsx) ────────────────
// Läuft in jeder offenen Instanz. Zeigt ein menü-unabhängiges Popup + Sidebar-
// Blink für offline gemeldete Server (aus dem geteilten status.json). Der Ping
// (alle 5 min, 3-fach-Retry) und die Neustart-Abfrage (alle 5 min, EIN Server zur Zeit,
// ohne die Server, die der Rundlauf gerade gelesen hat) laufen nur in der claimenden Instanz.
// Dienst-/Einstellungs-Prüfung (inkl. SEAL-sysstatus): seit 17.11.2026 eigene Endlosschleife,
// immer nur EIN Server, 5 s Pause (services/serverRundlauf.ts) — unabhängig vom Ping-Takt.
// Neustarts erscheinen bei jedem Admin als Popup oben rechts (bis „Gelesen"), neue
// Ausfälle/Neustarts zusätzlich als Windows-Benachrichtigung, wenn das Tool im Hintergrund ist.
// Wer prüft und meldet (Mail): bevorzugt BQ8069 — andere PCs nur, solange BQ8069 aus ist
// (Herzschlag in server_monitor/melder.json, siehe services/serverMelder.ts).

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ServerOff, X, ExternalLink } from 'lucide-react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import {
  loadServerStatus, aktualisiereStatus, isStatusClaimed, offlineHostsForTiles,
  loadServerConfig, runPingCycle, runRebootCheck, runServerMetricsIfDue,
} from '../../services/serverMonitor'
import { starteRundlauf, vorziehen } from '../../services/serverRundlauf'
import { ladeEreignisse, ladeGelesen, markiereGelesen, offeneNeustarts, neustartUeberschrift, artText, titelVon, sendeWartende } from '../../services/serverEreignisse'
import { runZertifikatsScanIfDue } from '../../services/serverZertifikate'
import { useServerEreignisStore } from '../../store/serverEreignisStore'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'
import { ipcRenderer } from '../../utils/ipc'
import { ladeServerStumm, useServerStumm } from '../../services/serverStumm'
import { eigenerRechner, eigenesKonto, istBevorzugt, schreibeHerzschlag, HERZSCHLAG_MS } from '../../services/serverMelder'
import { darfAutomatik } from '../../services/automatikLeiter'
import { starteServerZiele } from '../../services/serverZieleKontext'
import { ladeServerLaeufe } from '../../services/serverLaeufe'

function windowsHinweis(titel: string, text: string, tag: string) {
  if (document.hasFocus() || useServerStumm.getState().stumm) return
  try {
    const n = new Notification(titel, { body: text, tag })
    n.onclick = () => ipcRenderer('window:focus')
  } catch { /* Benachrichtigungen nicht verfügbar */ }
}

const POLL_MS = 60 * 1000                // Status jede Minute lesen (Popup/Blink) — sonst wird aus „alle 5 min" ein 6-min-Takt
// Ping-Takt (Standard 5 min, nie schneller) und an/aus für Ping + Neustart-Erkennung:
// Einstellungen → „Automatik & Scans“ (services/serverLaeufe.ts)
const PING_TOLERANZ_MS = 20 * 1000       // Takt-Spiel: bei 4:40 schon fällig, damit es nicht auf 6 min rutscht
const NEUSTART_FRISCH_MS = 5 * 60 * 1000 // Startzeit, die der Rundlauf in dieser Zeit gelesen hat, nicht noch einmal abfragen

/** Darf DIESER PC die automatischen Server-Prüfungen machen? Nur der EINE Automatik-PC
 *  (BQ8069 bevorzugt, sonst genau eine Vertretung) — services/automatikLeiter.ts */
const darfPruefen = () => darfAutomatik()

export default function ServerMonitorController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const setServerAlarmCount = useAppStore(s => s.setServerAlarmCount)
  const setScreen = useAppStore(s => s.setScreen)

  const [offline, setOffline] = useState<string[]>([])
  const [popupOpen, setPopupOpen] = useState(false)
  const lastSignature = useRef<string>('')
  const busy = useRef(false)
  const bekannteNeustarts = useRef<Set<string> | null>(null)
  const bekannteOffline = useRef<Set<string> | null>(null)
  const setOffeneNeustarts = useServerEreignisStore(s => s.setOffen)
  const setGelesenFn = useServerEreignisStore(s => s.setGelesen)

  // Zugriffsprotokoll + Schonung der Cluster-Knoten: Servernamen, Knoten und Benutzer an den
  // Hauptprozess (einmal nach dem Login, dann alle 15 min) — services/serverZieleKontext.ts
  useEffect(() => { if (username) starteServerZiele() }, [username])

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    busy.current = true
    try {
      let status = await loadServerStatus()
      const now = Date.now()

      // 0) Wer prüft und meldet? Nur der EINE Automatik-PC — BQ8069, sonst genau eine Vertretung.
      const [ich, konto] = await Promise.all([eigenerRechner(), eigenesKonto()])
      const recht = { darf: await darfPruefen() }

      // 1) Ping fällig + nicht fremd-geclaimt → claimen und ausführen (nur, wenn eingeschaltet).
      const laeufe = recht.darf ? await ladeServerLaeufe() : null
      const pingDue = !status.pingRunAt || (now - new Date(status.pingRunAt).getTime()) >= (laeufe?.ping.minuten ?? 5) * 60_000 - PING_TOLERANZ_MS
      if (recht.darf && laeufe?.ping.an && pingDue && !isStatusClaimed(status, now)) {
        const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
        const at = new Date().toISOString()
        // In den FRISCHEN Stand schreiben (die Dienst-Schleife schreibt parallel) …
        await aktualisiereStatus(f => ({ ...f, running: { by: claimToken, at }, pingVon: { rechner: ich || 'unbekannt', konto: konto || undefined, benutzer: user?.displayName || username, at } }))
        // … und erst nach kurzer Zufallspause gegenlesen: schreibt ein zweiter Lauf fast gleichzeitig,
        // gewinnt nur einer (vorher liefen Ping + Neustart-Abfrage in jedem dritten Takt doppelt)
        await new Promise(r => setTimeout(r, 1000 + Math.floor(Math.random() * 2000)))
        const check = await loadServerStatus()
        if (check.running?.by === claimToken) {
          const ping = await runPingCycle(user?.displayName || username)
          // Mails, die ein anderer PC von Hand erkannt, aber für BQ8069 vorgemerkt hat, jetzt verschicken
          await sendeWartende().catch(() => undefined)
          // 2) Gerade wieder erreichbare Server prüft die Dienst-Schleife als nächstes (Rundlauf, 1 Server zur Zeit)
          if (ping.wiederDa.length) await vorziehen(ping.wiederDa).catch(() => null)
          // 3) Neustart/Herunterfahren erkennen — alle 5 min, EIN Server zur Zeit; was der Rundlauf
          //    in den letzten 5 min schon gelesen hat, wird nicht noch einmal abgefragt
          if (laeufe.neustart.an) await runRebootCheck(user?.displayName || username, undefined, { throttle: 1, frischMs: NEUSTART_FRISCH_MS, auto: true })
        }
        status = await loadServerStatus()
      }

      // 3) Offline-Menge → Popup + Blink (in JEDER Instanz).
      // Nur aktuell konfigurierte Kacheln zählen — gelöschte Server nie als Alarm.
      const cfg = await loadServerConfig()
      const off = offlineHostsForTiles(status, cfg.tiles)
      // Glocke durchgestrichen → keine Popups, kein Blinken, keine Windows-Hinweise für DIESEN Benutzer
      const stumm = useServerStumm.getState().stumm
      setOffline(off)
      setServerAlarmCount(stumm ? 0 : off.length)
      const sig = off.slice().sort().join('|')
      if (sig && sig !== lastSignature.current && !stumm) setPopupOpen(true)
      if (off.length === 0) setPopupOpen(false)
      lastSignature.current = sig
      // neue Ausfälle → Windows-Hinweis (wenn das Tool im Hintergrund ist)
      const neuOff = bekannteOffline.current ? off.filter(h => !bekannteOffline.current!.has(h)) : []
      bekannteOffline.current = new Set(off)
      if (neuOff.length) windowsHinweis(neuOff.length === 1 ? `Server offline: ${neuOff[0]}` : `${neuOff.length} Server offline`, neuOff.join(', '), 'server-offline')

      // 3b) Neustart-Meldungen, die ICH noch nicht gelesen habe → Popup oben rechts
      const [ereignisse, gelesen] = await Promise.all([ladeEreignisse(), ladeGelesen(username)])
      if (ereignisse) {
        const offen = offeneNeustarts(ereignisse, gelesen)
        const neu = bekannteNeustarts.current ? offen.filter(e => !bekannteNeustarts.current!.has(e.id)) : []
        bekannteNeustarts.current = new Set(offen.map(e => e.id))
        setOffeneNeustarts(stumm ? [] : offen)
        if (neu.length) windowsHinweis(
          neu.length === 1
            ? (neu[0].typ === 'zertifikat' ? titelVon(neu[0]) : neu[0].typ === 'pruefung' ? `Server-Prüfung: Probleme auf ${neu[0].host}` : `${neustartUeberschrift(neu[0])}: ${neu[0].host}`)
            : `${neu.length} Server-Meldungen`,
          neu.map(e => e.typ === 'zertifikat' ? `${e.host}: ${e.zert?.cn || ''} · ${e.zert?.verwendung || ''}`
            : e.typ === 'pruefung' ? `${e.host}: ${(e.probleme || []).slice(0, 3).join(', ')}`
            : `${e.host}: ${artText(e).split(' — ')[0]}, gestartet ${e.boot || ''}${e.grund ? ` · ${e.grund}` : ''}`).join('\n'), 'server-meldung')
      }

      // 4) Auslastungs-Scan (RAM/Festplatte) – 1×/Tag laut Zeitplan (11:00), self-gated + eigener Claim.
      // 5) Zertifikate – 1×/Tag laut Zeitplan (07:00), self-gated + eigener Claim (meldet Ablauf per Mail)
      //    Beide wie die Prüfungen oben: bevorzugt auf BQ8069.
      if (recht.darf) {
        await runServerMetricsIfDue(user?.displayName || username)
        await runZertifikatsScanIfDue(user?.displayName || username)
      }
    } catch { /* still */ } finally {
      busy.current = false
    }
  }, [isAdmin, username, user?.displayName, setServerAlarmCount, setOffeneNeustarts])

  // Herzschlag NUR auf BQ8069: jede Minute „ich bin da“ (unabhängig davon, ob gerade ein Lauf
  // beschäftigt ist) — solange er frisch ist, lassen alle anderen PCs Prüfungen + Meldungen aus.
  // Abmelden/Schließen → „weg“, damit sofort ein anderer übernimmt.
  useEffect(() => {
    if (!username || !isAdmin) return
    let aktiv = true
    let t: ReturnType<typeof setInterval> | null = null
    const name = () => useAuthStore.getState().session?.user.displayName || username
    void Promise.all([eigenerRechner(), eigenesKonto()]).then(([ich, konto]) => {
      if (!aktiv || !istBevorzugt(ich, konto)) return
      void schreibeHerzschlag(name())
      t = setInterval(() => { void schreibeHerzschlag(name()) }, HERZSCHLAG_MS)
    })
    return () => {
      aktiv = false
      if (t) { clearInterval(t); void schreibeHerzschlag(name(), true) }
    }
  }, [username, isAdmin])

  // Dienst-Prüfung als Endlosschleife: immer nur EIN Server, 5 s Pause, nach dem letzten wieder der
  // erste — nur auf BQ8069 bzw. als Vertretung, solange BQ8069 aus ist (services/serverRundlauf.ts).
  // Abmelden/Schließen gibt die Schleife frei, damit sofort ein anderer berechtigter PC übernimmt.
  useEffect(() => {
    if (!username || !isAdmin) return
    const stop = starteRundlauf({
      by: () => useAuthStore.getState().session?.user.displayName || username,
      darf: darfPruefen,
    })
    const beimSchliessen = () => stop()
    window.addEventListener('beforeunload', beimSchliessen)
    return () => { window.removeEventListener('beforeunload', beimSchliessen); stop() }
  }, [username, isAdmin])

  // Glocke: beim Anmelden laden; Umschalten wirkt sofort (stumm → alles weg, wieder an → beim nächsten Lauf wieder da)
  const stumm = useServerStumm(s => s.stumm)
  useEffect(() => { if (username) void ladeServerStumm(username) }, [username])
  const erstesMal = useRef(true)
  useEffect(() => {
    if (stumm) { setPopupOpen(false); setServerAlarmCount(0); setOffeneNeustarts([]); return }
    if (erstesMal.current) { erstesMal.current = false; return }
    // wieder laut: aktuellen Stand zeigen, aber keine Windows-Hinweise für Altes nachholen
    lastSignature.current = ''
    void tick()
  }, [stumm]) // eslint-disable-line react-hooks/exhaustive-deps

  // „Gelesen" → sofort aus dem Popup, Speichern im Hintergrund
  useEffect(() => {
    if (!username) return
    setGelesenFn((ids: string[]) => {
      const st = useServerEreignisStore.getState()
      st.setOffen(st.offen.filter(e => !ids.includes(e.id)))
      void markiereGelesen(username, ids)
    })
    return () => setGelesenFn(null)
  }, [username, setGelesenFn])

  useEffect(() => {
    if (!username) return
    // Erster Lauf entzerrt: sonst greifen beim Start alle Controller gleichzeitig
    // aufs Netzlaufwerk zu und das Fenster hakt in den ersten Sekunden.
    const startAbbrechen = ersterLaufEntzerrt(() => { void tick() })
    const t = setInterval(() => { void tick() }, POLL_MS)
    // Beim Zurückkehren ins Fenster nachsehen — gebündelt und entzerrt über den
    // gemeinsamen Melder, damit nicht alle Controller gleichzeitig loslaufen.
    const abmelden = onAppFocus(() => { void tick() })
    return () => { clearInterval(t); abmelden(); startAbbrechen() }
  }, [tick, username])

  if (stumm || !popupOpen || offline.length === 0) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-red-500/50 bg-card shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-red-500/10 rounded-t-xl">
          <AlertTriangle className="text-red-400 animate-pulse" size={20} />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">Server offline</h2>
            <p className="text-[11px] text-muted-foreground">
              {offline.length} Server {offline.length === 1 ? 'ist' : 'sind'} nicht erreichbar (3× kein Ping).
            </p>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          {offline.map(h => (
            <div key={h} className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-center gap-3">
              <ServerOff className="text-red-400 shrink-0" size={16} />
              <span className="text-sm font-semibold text-foreground font-mono">{h}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={() => { setScreen('server'); setPopupOpen(false) }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border"
          ><ExternalLink size={12} />Zum Server-Monitor</button>
          <div className="ml-auto" />
          <button
            onClick={() => setPopupOpen(false)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border"
          >Verstanden</button>
        </div>
      </div>
    </div>
  )
}
