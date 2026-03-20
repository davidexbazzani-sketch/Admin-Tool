import { create } from 'zustand'
import type { ActiveAlarm } from '../types/dashboard'

interface DashboardState {
  // Active alarms across all open widgets
  activeAlarms: ActiveAlarm[]
  addAlarm: (alarm: ActiveAlarm) => void
  acknowledgeAlarm: (alarmId: string, by: string) => void
  clearAlarm: (widgetId: string) => void

  // App-wide blink state (if any alarm has blinkEntireApp)
  isAppBlinking: boolean
  setAppBlinking: (v: boolean) => void

  // Currently playing alarm sound (stop on acknowledge)
  stopAlarmSound: (() => void) | null
  setStopAlarmSound: (fn: (() => void) | null) => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  activeAlarms: [],

  addAlarm: (alarm) => {
    const existing = get().activeAlarms.find(a => a.widgetId === alarm.widgetId && a.dashboardId === alarm.dashboardId)
    if (existing && !existing.acknowledged) return // already active
    set(s => ({ activeAlarms: [...s.activeAlarms.filter(a => !(a.widgetId === alarm.widgetId && a.dashboardId === alarm.dashboardId)), alarm] }))
  },

  acknowledgeAlarm: (alarmId, by) => {
    set(s => ({
      activeAlarms: s.activeAlarms.map(a =>
        a.id === alarmId
          ? { ...a, acknowledged: true, acknowledgedAt: new Date().toISOString(), acknowledgedBy: by }
          : a
      ),
    }))
    // Stop sound if active
    get().stopAlarmSound?.()
    get().setStopAlarmSound(null)
  },

  clearAlarm: (widgetId) => {
    set(s => ({ activeAlarms: s.activeAlarms.filter(a => a.widgetId !== widgetId) }))
  },

  isAppBlinking: false,
  setAppBlinking: (isAppBlinking) => set({ isAppBlinking }),

  stopAlarmSound: null,
  setStopAlarmSound: (fn) => set({ stopAlarmSound: fn }),
}))

// ── Sound generator (Web Audio API) ───────────────────────────────────────────
export function playAlarmSound(type: 'siren' | 'beep' | 'bell', volume: number): () => void {
  const ctx = new AudioContext()
  const gain = ctx.createGain()
  gain.gain.value = volume / 100
  gain.connect(ctx.destination)

  let stopped = false
  let timeouts: ReturnType<typeof setTimeout>[] = []

  function beep(freq: number, duration: number, startTime: number) {
    if (stopped) return
    const osc = ctx.createOscillator()
    osc.connect(gain)
    osc.frequency.value = freq
    osc.type = 'sine'
    osc.start(ctx.currentTime + startTime)
    osc.stop(ctx.currentTime + startTime + duration)
  }

  function playPattern() {
    if (stopped) return
    if (type === 'beep') {
      beep(880, 0.15, 0)
      beep(880, 0.15, 0.2)
    } else if (type === 'siren') {
      // Frequency sweep up
      const osc = ctx.createOscillator()
      osc.connect(gain)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(400, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.5)
      osc.frequency.linearRampToValueAtTime(400, ctx.currentTime + 1.0)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 1.0)
    } else if (type === 'bell') {
      beep(1046, 0.6, 0)
    }
    const t = setTimeout(playPattern, type === 'siren' ? 1100 : 600)
    timeouts.push(t)
  }

  playPattern()

  return () => {
    stopped = true
    timeouts.forEach(clearTimeout)
    gain.disconnect()
    ctx.close().catch(() => {})
  }
}
