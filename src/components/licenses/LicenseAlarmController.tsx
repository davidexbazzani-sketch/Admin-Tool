import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Calendar, X, ExternalLink } from 'lucide-react'
import { useAuthStore, useIsAdmin, useIsMasterAdmin } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import {
  listLicenses, loadDismissals, dismissAlarm, computeActiveAlarms,
  sendPendingEmails, formatGermanDate,
  type ActiveAlarm,
} from '../../services/licenses'
import { loadUserMenuOverrides, getHiddenForUser } from '../../services/userMenuVisibility'
import { computeMenuVisible } from '../../utils/menuVisibility'

/**
 * Wird einmal im authentifizierten Teil der App gemountet (siehe App.tsx).
 *
 * Aufgaben:
 *   1. Pollt zentral (alle 5 Min + Window-Focus) Lizenzen + Dismissals des
 *      aktuellen Benutzers und schreibt die Alarm-Anzahl in den App-Store
 *      (damit der Sidebar-Eintrag rot blinken kann).
 *   2. Versendet ausstehende E-Mail-Erinnerungen (Dedup über Netzlaufwerk-Log).
 *   3. Zeigt ein blockierendes Popup mit allen offenen Alarmen; das Popup
 *      bleibt sichtbar, bis der Benutzer die Einträge per "Verstanden"
 *      wegklickt (per-User-Dismissal).
 *
 * Sichtbarkeit: Nur Benutzer, denen der Menüpunkt eingeblendet ist, sehen
 * das Popup. Visibility-Logik spiegelt die Sidebar-Logik wider.
 */
const POLL_MS = 5 * 60 * 1000           // 5 Minuten
const MENU_ID = 'licenses' as const

export default function LicenseAlarmController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const isMaster = useIsMasterAdmin()
  const hiddenMenuIds = useAppStore(s => s.hiddenMenuIds)
  const menuMinRole = useAppStore(s => s.menuMinRole)
  const setLicensesAlarmCount = useAppStore(s => s.setLicensesAlarmCount)
  const setScreen = useAppStore(s => s.setScreen)

  const [userOverride, setUserOverride] = useState<Set<string> | null>(null)
  const [alarms, setAlarms] = useState<ActiveAlarm[]>([])
  const [popupOpen, setPopupOpen] = useState(false)
  const lastAlarmSignature = useRef<string>('')

  // Per-User-Override laden (gleiche Mechanik wie Sidebar)
  useEffect(() => {
    if (!username) return
    let cancelled = false
    ;(async () => {
      try {
        const o = await loadUserMenuOverrides()
        if (!cancelled) setUserOverride(getHiddenForUser(o, user?.id || ''))
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [username, user?.id])

  // Sichtbarkeit für diesen User berechnen (Sidebar-Regeln 1:1)
  const menuVisible = useCallback((): boolean => computeMenuVisible(MENU_ID, {
    isAdmin, isMaster, userOverride, hidden: hiddenMenuIds, minRole: menuMinRole, builtinAdminOnly: true,
  }), [isAdmin, isMaster, userOverride, hiddenMenuIds, menuMinRole])

  const tick = useCallback(async () => {
    if (!username) return

    // ── E-Mail-Aufholversand ──────────────────────────────────────────────
    // Läuft IMMER, sobald irgendein User das Tool öffnet — unabhängig davon,
    // ob für ihn der Menüpunkt sichtbar ist. So gehen Erinnerungen, die in
    // einer Funkstille-Phase fällig gewesen wären, beim nächsten Start raus
    // (Dedup über Netzlaufwerk-Log verhindert Doppelversand).
    sendPendingEmails(username).catch(() => {})

    // ── Popup / Sidebar-Blink: nur für User mit sichtbarem Menüpunkt ───────
    if (!menuVisible()) {
      setAlarms([])
      setLicensesAlarmCount(0)
      return
    }
    try {
      const [licenses, dismissals] = await Promise.all([listLicenses(), loadDismissals(username)])
      const active = computeActiveAlarms(licenses, dismissals)
      setAlarms(active)
      setLicensesAlarmCount(active.length)

      // Neue Alarme seit letztem Tick → Popup öffnen
      const sig = active.map(a => `${a.license.id}:${a.threshold}:${a.license.expiryDate}`).sort().join('|')
      if (sig && sig !== lastAlarmSignature.current) {
        setPopupOpen(true)
      }
      if (active.length === 0) setPopupOpen(false)
      lastAlarmSignature.current = sig
    } catch {
      // still
    }
  }, [username, menuVisible, setLicensesAlarmCount])

  useEffect(() => {
    if (!username) return
    tick()
    const t = setInterval(tick, POLL_MS)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [tick, username])

  async function handleDismiss(a: ActiveAlarm) {
    await dismissAlarm(username, a.license.id, a.threshold, a.license.expiryDate)
    const next = alarms.filter(x => !(x.license.id === a.license.id && x.threshold === a.threshold))
    setAlarms(next)
    setLicensesAlarmCount(next.length)
    if (next.length === 0) setPopupOpen(false)
  }

  if (!popupOpen || alarms.length === 0) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-red-500/50 bg-card shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-red-500/10 rounded-t-xl">
          <AlertTriangle className="text-red-400 animate-pulse" size={20} />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">Lizenz-Ablauf-Warnung</h2>
            <p className="text-[11px] text-muted-foreground">
              {alarms.length} Lizenz{alarms.length === 1 ? '' : 'en'} laufen bald aus.
            </p>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          {alarms.map(a => (
            <div key={a.license.id + a.threshold} className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
              <div className="flex items-start gap-3">
                <Calendar className="text-red-400 shrink-0 mt-0.5" size={16} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground truncate">{a.license.name}</h3>
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-200 font-medium">
                      noch {a.daysRemaining} Tage
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Läuft am <span className="text-foreground font-medium">{formatGermanDate(a.license.expiryDate)}</span> ab
                    <span className="ml-2 opacity-70">· Schwelle {a.threshold} Tage</span>
                  </p>
                  {a.license.comment1 && <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">{a.license.comment1}</p>}
                  {a.license.comment2 && <p className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap">{a.license.comment2}</p>}
                </div>
                <button
                  onClick={() => handleDismiss(a)}
                  title="Verstanden — diese Warnung nicht mehr anzeigen (bis Lizenz verlängert wird)"
                  className="shrink-0 p-1 rounded text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                ><X size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={() => { setScreen('licenses'); setPopupOpen(false) }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border"
          >
            <ExternalLink size={12} />Zum Lizenzen-Kalender
          </button>
          <div className="ml-auto" />
          <button
            onClick={() => alarms.forEach(handleDismiss)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs bg-red-500/20 text-red-200 border border-red-500/40 hover:bg-red-500/30"
          >Alle als verstanden markieren</button>
          <button
            onClick={() => setPopupOpen(false)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border"
          >Später</button>
        </div>
      </div>
    </div>
  )
}
