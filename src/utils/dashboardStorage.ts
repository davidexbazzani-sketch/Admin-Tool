// ── Dashboard Storage (Complete Rewrite) ──────────────────────────────────────
import { api } from '../electronAPI'
import type { DashboardsData, Dashboard, DashboardTile, DashboardTemplate, TileSize } from '../types/dashboard'

function dashPath(username: string): string {
  return `users/${username}/dashboards.json`
}

export async function loadDashboards(username: string): Promise<DashboardsData> {
  const data = await api().netReadJson<DashboardsData>(dashPath(username))
  return data ?? {
    dashboards: [],
    settings: { soundEnabled: false, notificationsEnabled: true, blinkEnabled: true },
  }
}

export async function saveDashboards(username: string, data: DashboardsData): Promise<void> {
  await api().netWriteJson(dashPath(username), data)
}

export function createDashboard(name: string): Dashboard {
  return {
    id: `dash-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: new Date().toISOString(),
    tiles: [],
  }
}

export function createTile(opts: {
  name: string
  hostnames: string[]
  skillId: string
  skillLabel: string
  liveEnabled?: boolean
  liveIntervalSeconds?: number
  size?: TileSize
  thresholds?: { green: string; yellow: string | null; red: string }
  position?: number
}): DashboardTile {
  const { DEFAULT_THRESHOLDS } = require('../types/dashboard')
  return {
    id: `tile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: opts.name,
    hostnames: opts.hostnames,
    skillId: opts.skillId,
    skillLabel: opts.skillLabel,
    liveEnabled: opts.liveEnabled ?? true,
    liveIntervalSeconds: opts.liveIntervalSeconds ?? 30,
    position: opts.position ?? 0,
    size: opts.size ?? 'normal',
    thresholds: opts.thresholds ?? DEFAULT_THRESHOLDS[opts.skillId] ?? DEFAULT_THRESHOLDS.default,
    lastResults: {},
    history: [],
  }
}

// ── Dashboard Templates ───────────────────────────────────────────────────────

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    id: 'empty',
    name: 'Leeres Dashboard',
    icon: '📋',
    description: 'Keine Kacheln, selbst aufbauen',
    tiles: [],
  },
  {
    id: 'server',
    name: 'Server-Monitoring',
    icon: '🖥️',
    description: 'Ping, CPU, RAM, Disk, Uptime für einen Server',
    tiles: [
      { name: 'Ping', hostnames: [], skillId: 'rd_net_ping', skillLabel: 'Ping', liveEnabled: true, liveIntervalSeconds: 30, position: 0, size: 'small', thresholds: { green: '< 50ms', yellow: '50-200ms', red: 'Timeout' } },
      { name: 'CPU', hostnames: [], skillId: 'rd_procs_cpuload', skillLabel: 'CPU-Auslastung', liveEnabled: true, liveIntervalSeconds: 30, position: 1, size: 'normal', thresholds: { green: '< 50%', yellow: '50-85%', red: '> 85%' } },
      { name: 'RAM', hostnames: [], skillId: 'rd_procs_ramload', skillLabel: 'RAM-Auslastung', liveEnabled: true, liveIntervalSeconds: 30, position: 2, size: 'normal', thresholds: { green: '< 70%', yellow: '70-90%', red: '> 90%' } },
      { name: 'Disk C:', hostnames: [], skillId: 'rd_procs_diskfree', skillLabel: 'Freier Speicher', liveEnabled: true, liveIntervalSeconds: 60, position: 3, size: 'normal', thresholds: { green: '> 20% frei', yellow: '10-20%', red: '< 10%' } },
    ],
  },
  {
    id: 'printer',
    name: 'Drucker-Status',
    icon: '🖨️',
    description: 'Spooler-Status für wichtige Drucker',
    tiles: [
      { name: 'Spooler', hostnames: [], skillId: 'rd_printer_spooler', skillLabel: 'Spooler neustarten', liveEnabled: true, liveIntervalSeconds: 60, position: 0, size: 'small', thresholds: { green: 'Running', yellow: null, red: 'Stopped' } },
    ],
  },
  {
    id: 'security',
    name: 'Sicherheits-Übersicht',
    icon: '🛡️',
    description: 'Defender, BitLocker, Updates, Firewall',
    tiles: [
      { name: 'Defender', hostnames: [], skillId: 'rd_security_defstatus', skillLabel: 'Defender-Status', liveEnabled: true, liveIntervalSeconds: 300, position: 0, size: 'normal', thresholds: { green: 'Aktiv', yellow: null, red: 'Inaktiv' } },
      { name: 'BitLocker', hostnames: [], skillId: 'rd_security_bitlocker', skillLabel: 'BitLocker-Status', liveEnabled: true, liveIntervalSeconds: 300, position: 1, size: 'normal', thresholds: { green: 'On', yellow: null, red: 'Off' } },
    ],
  },
]

// ── Threshold evaluation ──────────────────────────────────────────────────────

export function evaluateStatus(value: string, _thresholds: { green: string; yellow: string | null; red: string }): 'ok' | 'warning' | 'error' {
  const v = value.toLowerCase().trim()
  // Error patterns
  if (v.startsWith('err:') || v.includes('timeout') || v.includes('fehler') || v.includes('error') || v.includes('stopped') || v.includes('offline') || v.includes('false') || v.includes('nicht erreichbar') || v.includes('fail')) {
    return 'error'
  }
  // Warning patterns
  if (v.includes('warning') || v.includes('caution') || v.includes('pending') || v.includes('startpending')) {
    return 'warning'
  }
  // Parse percentage
  const pctMatch = v.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1])
    // For disk free: lower is worse
    if (v.includes('frei') || v.includes('free')) {
      if (pct < 10) return 'error'
      if (pct < 20) return 'warning'
      return 'ok'
    }
    // For CPU/RAM: higher is worse
    if (pct > 85) return 'error'
    if (pct > 50) return 'warning'
    return 'ok'
  }
  // Parse ms (ping)
  const msMatch = v.match(/(\d+)\s*ms/)
  if (msMatch) {
    const ms = parseInt(msMatch[1])
    if (ms > 200) return 'error'
    if (ms > 50) return 'warning'
    return 'ok'
  }
  // Default: success
  if (v.includes('ok') || v.includes('online') || v.includes('running') || v.includes('true') || v.includes('healthy') || v.includes('active') || v.includes('enabled')) {
    return 'ok'
  }
  return 'ok'
}
