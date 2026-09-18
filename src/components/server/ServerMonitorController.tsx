// ── Server-Monitor: Hintergrund-Controller (global in App.tsx) ────────────────
// Läuft in jeder offenen Instanz. Zeigt ein menü-unabhängiges Popup + Sidebar-
// Blink für offline gemeldete Server (aus dem geteilten status.json). Der Ping
// (alle 10 min, 3-fach-Retry) und die Reboot-Abfrage (2×/Tag) werden nur von der
// claimenden Instanz ausgeführt (Single-Runner).

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ServerOff, X, ExternalLink } from 'lucide-react'
import { useAuthStore, useIsAdmin } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import {
  loadServerStatus, saveServerStatus, isStatusClaimed, offlineHostsForTiles,
  loadServerConfig, runPingCycle, runRebootCheck, runServerMetricsIfDue,
} from '../../services/serverMonitor'

const POLL_MS = 2 * 60 * 1000            // Status alle 2 min lesen (Popup/Blink)
const PING_INTERVAL_MS = 10 * 60 * 1000  // Ping alle 10 min
const REBOOT_INTERVAL_MS = 12 * 60 * 60 * 1000  // Reboot-Check 2×/Tag

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

  const tick = useCallback(async () => {
    if (!isAdmin || !username || busy.current) return
    busy.current = true
    try {
      let status = await loadServerStatus()
      const now = Date.now()

      // 1) Ping fällig + nicht fremd-geclaimt → claimen und ausführen.
      const pingDue = !status.pingRunAt || (now - new Date(status.pingRunAt).getTime()) >= PING_INTERVAL_MS
      if (pingDue && !isStatusClaimed(status, now)) {
        const claimToken = `${username}#${Math.random().toString(36).slice(2, 10)}`
        await saveServerStatus({ ...status, running: { by: claimToken, at: new Date().toISOString() } })
        const check = await loadServerStatus()
        if (check.running?.by === claimToken) {
          await runPingCycle(user?.displayName || username)
          // 2) Reboot-Check (2×/Tag) im selben Claim-Fenster.
          const s2 = await loadServerStatus()
          if (!s2.rebootRunAt || (Date.now() - new Date(s2.rebootRunAt).getTime()) >= REBOOT_INTERVAL_MS) {
            await runRebootCheck(user?.displayName || username)
          }
        }
        status = await loadServerStatus()
      }

      // 3) Offline-Menge → Popup + Blink (in JEDER Instanz).
      // Nur aktuell konfigurierte Kacheln zählen — gelöschte Server nie als Alarm.
      const cfg = await loadServerConfig()
      const off = offlineHostsForTiles(status, cfg.tiles)
      setOffline(off)
      setServerAlarmCount(off.length)
      const sig = off.slice().sort().join('|')
      if (sig && sig !== lastSignature.current) setPopupOpen(true)
      if (off.length === 0) setPopupOpen(false)
      lastSignature.current = sig

      // 4) Auslastungs-Scan (RAM/Festplatte) – 1×/Tag laut Zeitplan (11:00), self-gated + eigener Claim.
      await runServerMetricsIfDue(user?.displayName || username)
    } catch { /* still */ } finally {
      busy.current = false
    }
  }, [isAdmin, username, user?.displayName, setServerAlarmCount])

  useEffect(() => {
    if (!username) return
    void tick()
    const t = setInterval(() => { void tick() }, POLL_MS)
    const onFocus = () => { void tick() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [tick, username])

  if (!popupOpen || offline.length === 0) return null

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
