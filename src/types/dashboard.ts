// ── Dashboard Types (Complete Rewrite) ────────────────────────────────────────

export type TileSize = 'small' | 'normal' | 'large'
export type TileStatus = 'ok' | 'warning' | 'error' | 'unknown' | 'loading'

export interface TileThresholds {
  green: string
  yellow: string | null
  red: string
}

export interface TileResult {
  status: TileStatus
  value: string
  raw?: string
  timestamp: string
}

export interface DashboardTile {
  id: string
  name: string
  hostnames: string[]          // one or more hostnames
  skillId: string              // rd_catId_cmdId format
  skillLabel: string           // display name of the skill
  skillParams?: Record<string, string>
  liveEnabled: boolean
  liveIntervalSeconds: number  // 15, 30, 60, 120, 300
  position: number
  size: TileSize
  thresholds: TileThresholds
  lastResults: Record<string, TileResult>  // hostname -> result
  history: Array<{ value: string; timestamp: string }>  // last 20 values (first hostname)
}

export interface Dashboard {
  id: string
  name: string
  createdAt: string
  tiles: DashboardTile[]
}

export interface DashboardsData {
  dashboards: Dashboard[]
  settings: DashboardSettings
}

export interface DashboardSettings {
  soundEnabled: boolean
  notificationsEnabled: boolean
  blinkEnabled: boolean
}

export interface DashboardTemplate {
  id: string
  name: string
  icon: string
  description: string
  tiles: Omit<DashboardTile, 'id' | 'lastResults' | 'history'>[]
}

// Default thresholds per skill type
export const DEFAULT_THRESHOLDS: Record<string, TileThresholds> = {
  rd_net_ping: { green: '< 50ms', yellow: '50-200ms', red: '> 200ms oder Timeout' },
  rd_procs_cpuload: { green: '< 50%', yellow: '50-85%', red: '> 85%' },
  rd_procs_ramload: { green: '< 70%', yellow: '70-90%', red: '> 90%' },
  rd_procs_diskfree: { green: '> 20% frei', yellow: '10-20% frei', red: '< 10% frei' },
  rd_disk_diskspace: { green: '> 20% frei', yellow: '10-20% frei', red: '< 10% frei' },
  rd_diskmgmt_diskfreepct: { green: '> 20% frei', yellow: '10-20% frei', red: '< 10% frei' },
  rd_diskmgmt_disksmart: { green: 'Healthy', yellow: 'Caution', red: 'Bad/Unknown' },
  default: { green: 'Erfolgreich', yellow: null, red: 'Fehler' },
}
