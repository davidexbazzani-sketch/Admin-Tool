import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarClock, UserPlus, ExternalLink } from 'lucide-react'
import { useAuthStore, useIsAdmin, useIsMasterAdmin } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import {
  listEmployees, loadReminderDismissals, dismissReminder, computeActiveReminders,
  formatGermanDate, type ActiveReminder,
} from '../../services/employees'
import { loadUserMenuOverrides, getHiddenForUser } from '../../services/userMenuVisibility'
import { computeMenuVisible } from '../../utils/menuVisibility'

/**
 * Wird einmal im authentifizierten Teil der App gemountet (siehe App.tsx).
 *
 * Zeigt ein blockierendes Popup, wenn ein neuer Mitarbeiter in 5 / 3 / 1 Tagen
 * beginnt. Das Popup laesst sich NUR ueber "Ich bestaetige, dies gelesen zu
 * haben" schliessen (per-User-Bestaetigung, zentral gespeichert).
 *
 * Sichtbarkeit: Nur Benutzer, denen der Menuepunkt "Mitarbeiterverwaltung"
 * eingeblendet ist, sehen das Popup (Logik spiegelt die Sidebar-Regeln wider).
 */
const POLL_MS = 5 * 60 * 1000
const MENU_ID = 'employee-management' as const

function daysLabel(days: number): string {
  if (days <= 0) return 'heute'
  if (days === 1) return 'morgen'
  return `in ${days} Tagen`
}

export default function EmployeeReminderController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const isAdmin = useIsAdmin()
  const isMaster = useIsMasterAdmin()
  const hiddenMenuIds = useAppStore(s => s.hiddenMenuIds)
  const menuMinRole = useAppStore(s => s.menuMinRole)
  const setReminderCount = useAppStore(s => s.setEmployeeReminderCount)
  const setScreen = useAppStore(s => s.setScreen)

  const [userOverride, setUserOverride] = useState<Set<string> | null>(null)
  const [reminders, setReminders] = useState<ActiveReminder[]>([])
  const [popupOpen, setPopupOpen] = useState(false)
  const lastSignature = useRef<string>('')

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

  const menuVisible = useCallback((): boolean => computeMenuVisible(MENU_ID, {
    isAdmin, isMaster, userOverride, hidden: hiddenMenuIds, minRole: menuMinRole, builtinAdminOnly: true,
  }), [isAdmin, isMaster, userOverride, hiddenMenuIds, menuMinRole])

  const tick = useCallback(async () => {
    if (!username) return
    if (!menuVisible()) { setReminders([]); setReminderCount(0); return }
    try {
      const [emps, dismissals] = await Promise.all([listEmployees(), loadReminderDismissals(username)])
      const active = computeActiveReminders(emps, dismissals)
      setReminders(active)
      setReminderCount(active.length)
      const sig = active.map(a => `${a.employee.id}:${a.threshold}:${a.employee.startDate}`).sort().join('|')
      if (sig && sig !== lastSignature.current) setPopupOpen(true)
      if (active.length === 0) setPopupOpen(false)
      lastSignature.current = sig
    } catch { /* still */ }
  }, [username, menuVisible, setReminderCount])

  useEffect(() => {
    if (!username) return
    tick()
    const t = setInterval(tick, POLL_MS)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [tick, username])

  async function confirmAll() {
    for (const r of reminders) {
      await dismissReminder(username, r.employee.id, r.threshold, r.employee.startDate)
    }
    setReminders([])
    setReminderCount(0)
    setPopupOpen(false)
  }

  if (!popupOpen || reminders.length === 0) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-blue-500/50 bg-card shadow-2xl">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border bg-blue-500/10 rounded-t-xl">
          <CalendarClock className="text-blue-400 animate-pulse" size={20} />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">Neue Mitarbeiter — Erinnerung</h2>
            <p className="text-[11px] text-muted-foreground">
              {reminders.length === 1 ? 'Ein neuer Mitarbeiter beginnt bald.' : `${reminders.length} neue Mitarbeiter beginnen bald.`}
            </p>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          {reminders.map(r => (
            <div key={r.employee.id + r.threshold} className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <div className="flex items-start gap-3">
                <UserPlus className="text-blue-400 shrink-0 mt-0.5" size={16} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">{daysLabel(r.daysRemaining).replace(/^./, c => c.toUpperCase())}</span> beginnt ein neuer Mitarbeiter:
                    {' '}<span className="font-semibold">{r.employee.vorname} {r.employee.name}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Eintritt: <span className="text-foreground font-medium">{formatGermanDate(r.employee.startDate)}</span>
                    {r.employee.globalId && <span className="ml-2 font-mono">{r.employee.globalId}</span>}
                    {r.employee.manager && <span className="ml-2">· Manager: {r.employee.manager}</span>}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={() => { setScreen('employee-management'); setPopupOpen(false) }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 border border-border"
          ><ExternalLink size={12} />Zur Mitarbeiterverwaltung</button>
          <div className="ml-auto" />
          <button
            onClick={confirmAll}
            className="inline-flex items-center gap-1 px-4 py-2 rounded-md text-xs font-semibold bg-blue-500/20 text-blue-100 border border-blue-500/40 hover:bg-blue-500/30"
          >Ich bestätige, dies gelesen zu haben</button>
        </div>
      </div>
    </div>
  )
}
