// ── Server-Monitor: Hintergrund-Controller (global in App.tsx) ────────────────
// Läuft in jeder offenen Instanz. Zeigt ein menü-unabhängiges Popup + Sidebar-
// Blink für offline gemeldete Server (aus dem geteilten status.json). Der Ping
// (alle 5 min, 3-fach-Retry) und die Reboot-Abfrage (alle 15 min + sofort für Server,
// die wieder erreichbar sind) werden nur von der claimenden Instanz ausgeführt.
// Dienst-/Einstellungs-Prüfung (inkl. SEAL-sysstatus): bei jedem 5-min-Ping für alle Server,
// netzschonend gestaffelt (siehe runZustandsPruefung).
// Neustarts erscheinen bei jedem Admin als Popup oben rechts (bis „Gelesen"), neue
// Ausfälle/Neustarts zusätzlich als Windows-Benachrichtigung, wenn das Tool im Hintergrund ist.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ServerOff, X, ExternalLink } from 'lucide-react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import {
  loadServerStatus, saveServerStatus, isStatusClaimed, offlineHostsForTiles,
  loadServerConfig, runPingCycle, runRebootCheck, runServerMetricsIfDue, runZustandsPruefung,
} from '../../services/serverMonitor'
import { ladeEreignisse, ladeGelesen, markiereGelesen, offeneNeustarts, neustartUeberschrift, artText, titelVon } from '../../services/serverEreignisse'
import { runZertifikatsScanIfDue } from '../../services/serverZertifikate'
import { useServerEreignisStore } from '../../store/serverEreignisStore'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'
import { ipcRenderer } from '../../utils/ipc'
import { ladeServerStumm, useServerStumm } from '../../services/serverStumm'

function windowsHinweis(titel: string, text: string, tag: string) {
  if (document.hasFocus() || useServerStumm.getState().stumm) return
  try {
    const n = new Notification(titel, { body: text, tag })
    n.onclick = () => ipcRenderer('window:focus')
  } catch { /* Benachrichtigungen nicht verfügbar */ }
}

const POLL_MS = 60 * 1000                // Status jede Minute lesen (Popup/Blink) — sonst wird aus „alle 5 min" ein 6-min-Takt
const PING_INTERVAL_MS = 5 * 60 * 1000   // Ping alle 5 min
const PING_TOLERANZ_MS = 20 * 1000       // Takt-Spiel: bei 4:40 schon fällig, damit es nicht auf 6 min rutscht

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

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    busy.current = true
    try {
      let status = await loadServerStatus()
      const now = Date.now()

      // 1) Ping fällig + nicht fremd-geclaimt → claimen und ausführen.
      const pingDue = !status.pingRunAt || (now - new Date(status.pingRunAt).getTime()) >= PING_INTERVAL_MS - PING_TOLERANZ_MS
      if (pingDue && !isStatusClaimed(status, now)) {
        const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
        await saveServerStatus({ ...status, running: { by: claimToken, at: new Date().toISOString() } })
        const check = await loadServerStatus()
        if (check.running?.by === claimToken) {
          const ping = await runPingCycle(user?.displayName || username)
          // 2) Dienste/Einstellungen ALLER Server bei jedem 5-min-Ping — gestaffelt (max. 2 gleichzeitig,
          //    Pausen), wieder erreichbare zuerst; überlappende Läufe verhindert die Sperre im Status.
          const zp = await runZustandsPruefung(user?.displayName || username, undefined, { auto: true, zuerst: ping.wiederDa })
          // 3) Neustart/Herunterfahren erkennen — ebenfalls alle 5 min für ALLE Server: die Startzeit
          //    der eben geprüften Server ist schon bekannt, nur die übrigen werden leicht abgefragt (max. 3 gleichzeitig).
          await runRebootCheck(user?.displayName || username, undefined, { bekannt: zp.boots, throttle: 3 })
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
      await runServerMetricsIfDue(user?.displayName || username)
      // 5) Zertifikate – 1×/Tag laut Zeitplan (07:00), self-gated + eigener Claim
      await runZertifikatsScanIfDue(user?.displayName || username)
    } catch { /* still */ } finally {
      busy.current = false
    }
  }, [isAdmin, username, user?.displayName, setServerAlarmCount, setOffeneNeustarts])

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
