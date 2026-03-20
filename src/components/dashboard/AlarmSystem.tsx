import React, { useEffect, useRef, useState } from 'react'
import { Bell, X, Check, CheckCheck, AlertTriangle } from 'lucide-react'
import { useDashboardStore, playAlarmSound } from '../../store/dashboardStore'
import type { ActiveAlarm } from '../../types/dashboard'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AlarmSystemProps {
  dashboardId: string
  userId: string
  children: React.ReactNode
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  } catch {
    return iso
  }
}

// ── Alarm Card (inside the dropdown panel) ────────────────────────────────────

interface AlarmCardProps {
  alarm: ActiveAlarm
  onAcknowledge: (id: string) => void
}

function AlarmCard({ alarm, onAcknowledge }: AlarmCardProps) {
  return (
    <div
      className={`rounded border px-3 py-2 space-y-1 transition-colors ${
        alarm.acknowledged
          ? 'border-border/40 bg-background/30 opacity-60'
          : 'border-red-700/60 bg-red-950/30'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground truncate">{alarm.widgetTitle}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{alarm.hostname}</div>
        </div>
        {!alarm.acknowledged && (
          <button
            type="button"
            onClick={() => onAcknowledge(alarm.id)}
            className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
          >
            <Check size={10} />
            Bestätigen
          </button>
        )}
      </div>

      <div className="text-[10px] text-muted-foreground">{alarm.conditionText}</div>

      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-mono font-semibold ${alarm.acknowledged ? 'text-muted-foreground' : 'text-red-400'}`}>
          Aktuell: {alarm.currentValue}
        </span>
        <span className="text-[10px] text-muted-foreground">{formatTime(alarm.triggeredAt)}</span>
      </div>

      {alarm.acknowledged && alarm.acknowledgedAt && (
        <div className="text-[10px] text-muted-foreground">
          Bestätigt {alarm.acknowledgedBy ? `von ${alarm.acknowledgedBy}` : ''} um {formatTime(alarm.acknowledgedAt)}
        </div>
      )}
    </div>
  )
}

// ── Alarm Modal Popup ─────────────────────────────────────────────────────────

interface AlarmModalProps {
  alarms: ActiveAlarm[]
  onAcknowledge: (id: string) => void
  onAcknowledgeAll: () => void
}

function AlarmModal({ alarms, onAcknowledge, onAcknowledgeAll }: AlarmModalProps) {
  // Show the first unacknowledged popup-triggered alarm
  const alarm = alarms[0]
  if (!alarm) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal box */}
      <div className="relative z-10 w-full max-w-md mx-4 rounded-xl overflow-hidden shadow-2xl border border-red-700/60">
        {/* Header */}
        <div className="bg-red-900/90 px-5 py-4 flex items-center gap-3">
          <AlertTriangle className="text-red-300 shrink-0" size={22} />
          <div>
            <div className="text-base font-bold text-white tracking-wide">ALARM</div>
            <div className="text-[11px] text-red-300">Systembenachrichtigung</div>
          </div>
          {alarms.length > 1 && (
            <div className="ml-auto text-[11px] text-red-300 shrink-0">
              {alarms.length} aktive Alarme
            </div>
          )}
        </div>

        {/* Body */}
        <div className="bg-[#1a0a0a] px-5 py-4 space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">{alarm.widgetTitle}</span>
              <span className="text-[11px] text-muted-foreground font-mono">{alarm.hostname}</span>
            </div>

            <div className="text-xs text-muted-foreground">{alarm.conditionText}</div>

            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 rounded bg-red-950/60 border border-red-800/40 px-3 py-2">
                <div className="text-[10px] text-red-400/70 mb-0.5">Aktueller Wert</div>
                <div className="text-sm font-mono font-bold text-red-300">{alarm.currentValue}</div>
              </div>
              <div className="flex-1 rounded bg-background border border-border px-3 py-2">
                <div className="text-[10px] text-muted-foreground mb-0.5">Ausgelöst um</div>
                <div className="text-[11px] font-mono text-foreground">{formatDateTime(alarm.triggeredAt)}</div>
              </div>
            </div>
          </div>

          {alarms.length > 1 && (
            <div className="rounded border border-border/40 bg-background/40 px-3 py-2">
              <div className="text-[10px] text-muted-foreground mb-1">Weitere aktive Alarme</div>
              <div className="space-y-0.5">
                {alarms.slice(1).map(a => (
                  <div key={a.id} className="text-[10px] text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse" />
                    <span className="font-medium">{a.widgetTitle}</span>
                    <span className="text-muted-foreground">({a.hostname})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="bg-[#1a0a0a] border-t border-red-900/40 px-5 py-3 flex gap-2">
          <button
            type="button"
            onClick={() => onAcknowledge(alarm.id)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Check size={14} />
            Alarm bestätigen
          </button>
          {alarms.length > 1 && (
            <button
              type="button"
              onClick={onAcknowledgeAll}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded bg-background border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
            >
              <CheckCheck size={14} />
              Alle
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AlarmSystem({ dashboardId, userId, children }: AlarmSystemProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const {
    activeAlarms,
    acknowledgeAlarm,
    isAppBlinking,
    setAppBlinking,
    setStopAlarmSound,
  } = useDashboardStore()

  // Filter alarms for this dashboard
  const dashboardAlarms = activeAlarms.filter(a => a.dashboardId === dashboardId)
  const unacknowledged = dashboardAlarms.filter(a => !a.acknowledged)
  const popupAlarms = unacknowledged // show all unacknowledged in the modal (popup flag is per widget config)

  // Track which alarm IDs we've already started sound for
  const soundedAlarms = useRef<Set<string>>(new Set())

  // Handle new alarms: start sound
  useEffect(() => {
    for (const alarm of unacknowledged) {
      if (!soundedAlarms.current.has(alarm.id)) {
        soundedAlarms.current.add(alarm.id)
        // We don't have the alarm actions here (they're on the widget element),
        // but the store may have the stop fn — play if this is the first active sound
        // The widget renderer is responsible for calling playAlarmSound and addAlarm.
        // AlarmSystem handles the global blinking and acknowledgement.
      }
    }

    // Clean up sound IDs for acknowledged alarms
    for (const alarm of dashboardAlarms) {
      if (alarm.acknowledged) {
        soundedAlarms.current.delete(alarm.id)
      }
    }
  }, [unacknowledged, dashboardAlarms])

  // Manage app blinking
  useEffect(() => {
    // In practice, the blinkEntireApp flag lives on the alarm config of the widget.
    // Here we check if any unacknowledged alarm should blink the app.
    // Since ActiveAlarm doesn't carry actions, we conservatively blink when there are
    // unacknowledged alarms — widgets that set blinkEntireApp will call setAppBlinking themselves.
    // This effect ensures we turn OFF blinking when all alarms are cleared.
    const hasAny = unacknowledged.length > 0
    if (!hasAny) {
      setAppBlinking(false)
    }
  }, [unacknowledged, setAppBlinking])

  // Close panel when clicking outside
  useEffect(() => {
    if (!panelOpen) return
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [panelOpen])

  function handleAcknowledge(alarmId: string) {
    acknowledgeAlarm(alarmId, userId)
    // Stop sound
    const { stopAlarmSound } = useDashboardStore.getState()
    stopAlarmSound?.()
    setStopAlarmSound(null)
  }

  function handleAcknowledgeAll() {
    for (const alarm of unacknowledged) {
      acknowledgeAlarm(alarm.id, userId)
    }
    const { stopAlarmSound } = useDashboardStore.getState()
    stopAlarmSound?.()
    setStopAlarmSound(null)
  }

  return (
    <div className="relative w-full h-full">
      {/* App blinking overlay */}
      {isAppBlinking && (
        <div
          className="pointer-events-none absolute inset-0 z-[100] rounded animate-pulse border-4 border-red-500"
          aria-hidden="true"
        />
      )}

      {/* Dashboard content */}
      {children}

      {/* Bell button + panel — positioned absolute within this container */}
      <div
        ref={panelRef}
        className="absolute top-3 right-3 z-50 flex flex-col items-end gap-1"
      >
        {/* Bell button */}
        <button
          type="button"
          onClick={() => setPanelOpen(prev => !prev)}
          className={`relative flex items-center justify-center w-9 h-9 rounded-full border transition-colors shadow-lg ${
            unacknowledged.length > 0
              ? 'bg-red-900/80 border-red-600 hover:bg-red-800/80 text-red-300'
              : 'bg-card border-border hover:border-primary text-muted-foreground hover:text-foreground'
          }`}
          title="Alarme"
          aria-label={`Alarme (${unacknowledged.length} aktiv)`}
        >
          <Bell size={16} className={unacknowledged.length > 0 ? 'animate-pulse' : ''} />

          {/* Badge */}
          {unacknowledged.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {unacknowledged.length > 99 ? '99+' : unacknowledged.length}
            </span>
          )}
        </button>

        {/* Alarm dropdown panel */}
        {panelOpen && (
          <div className="w-80 max-h-[70vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Bell size={14} className="text-foreground" />
                <span className="text-sm font-semibold text-foreground">Alarme</span>
                {unacknowledged.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-semibold">
                    {unacknowledged.length} aktiv
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unacknowledged.length > 1 && (
                  <button
                    type="button"
                    onClick={handleAcknowledgeAll}
                    className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
                    title="Alle bestätigen"
                  >
                    <CheckCheck size={11} />
                    Alle bestätigen
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-background/60"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Alarm list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {dashboardAlarms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  <Bell size={24} className="mx-auto mb-2 opacity-30" />
                  Keine Alarme für dieses Dashboard.
                </div>
              ) : (
                <>
                  {/* Unacknowledged first */}
                  {unacknowledged.map(alarm => (
                    <AlarmCard
                      key={alarm.id}
                      alarm={alarm}
                      onAcknowledge={handleAcknowledge}
                    />
                  ))}

                  {/* Acknowledged (muted) */}
                  {dashboardAlarms.filter(a => a.acknowledged).length > 0 && (
                    <>
                      {unacknowledged.length > 0 && (
                        <div className="text-[10px] text-muted-foreground text-center py-1">— Bestätigt —</div>
                      )}
                      {dashboardAlarms
                        .filter(a => a.acknowledged)
                        .map(alarm => (
                          <AlarmCard
                            key={alarm.id}
                            alarm={alarm}
                            onAcknowledge={handleAcknowledge}
                          />
                        ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal popup for alarms with popup action */}
      {popupAlarms.length > 0 && (
        <AlarmModal
          alarms={popupAlarms}
          onAcknowledge={handleAcknowledge}
          onAcknowledgeAll={handleAcknowledgeAll}
        />
      )}
    </div>
  )
}

// Re-export playAlarmSound so widget renderers can import it from here if needed
export { playAlarmSound }
