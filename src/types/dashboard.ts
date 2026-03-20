// ── Dashboard Builder Types ────────────────────────────────────────────────────

export type WidgetType =
  | 'online-status'      // Ping check
  | 'service-status'     // Windows service status
  | 'cpu-usage'          // CPU load %
  | 'ram-usage'          // RAM usage
  | 'disk-usage'         // Disk space C:
  | 'uptime'             // Time since last boot
  | 'system-info'        // WMI system info
  | 'logged-in-user'     // Currently logged in user
  | 'event-log-errors'   // Error count in event log
  | 'windows-update'     // Pending updates
  | 'quick-actions'      // Buttons for common admin actions
  | 'clock'              // Current time/date
  | 'note'               // Static text/note
  | 'text-label'         // Styled text element
  | 'divider'            // Visual separator
  | 'counter'            // Big number / counter
  | 'table'              // Multi-device data table

export type WidgetMode = 'edit' | 'live'

export type AlarmConditionType =
  | 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'ne'
  | 'offline' | 'changed' | 'stopped' | 'running'

export interface WidgetStyle {
  backgroundColor: string
  borderRadius: number
  borderColor: string
  borderWidth: number
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'none'
  shadow: boolean
  opacity: number
  titleVisible: boolean
  titleColor: string
  textColor: string
  fontSize: number
  fontFamily: string
  fontBold: boolean
  fontItalic: boolean
  textAlign: 'left' | 'center' | 'right'
}

export interface QuickAction {
  id: string
  label: string
  command: string
  confirmRequired: boolean
  color: string
}

export interface TableColumn {
  field: string
  label: string
  width?: number
}

export interface Threshold {
  id: string
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'ne'
  value: number | string
  color: string
  label?: string
}

export interface AlarmCondition {
  type: AlarmConditionType
  field?: string
  value?: number | string
}

export interface AlarmActions {
  blink: boolean
  blinkEntireApp: boolean
  sound: boolean
  soundType: 'siren' | 'beep' | 'bell'
  soundVolume: number
  popup: boolean
  log: boolean
}

export interface AlarmConfig {
  enabled: boolean
  condition: AlarmCondition
  actions: AlarmActions
}

export interface WidgetConfig {
  title?: string
  targets: string[]             // hostnames
  refreshInterval: number       // seconds
  autoRefresh: boolean
  displayFormat?: string        // 'tile'|'gauge'|'bar'|'number'|'list'
  services?: string[]           // for service-status
  actions?: QuickAction[]       // for quick-actions
  text?: string                 // for note/text-label
  fields?: string[]             // for system-info: which fields to show
  columns?: TableColumn[]       // for table
  showTimestamp?: boolean
  showRefreshButton?: boolean
}

export interface DashboardElement {
  id: string
  type: WidgetType
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
  style: WidgetStyle
  config: WidgetConfig
  alarm?: AlarmConfig
  thresholds?: Threshold[]
  locked?: boolean
}

export interface DashboardConfig {
  id: string
  name: string
  description?: string
  createdBy: string
  createdByDisplay: string
  createdAt: string
  updatedAt: string
  background: { color: string; imageBase64?: string }
  gridEnabled: boolean
  gridSize: number
  defaultRefreshInterval: number
  canvasWidth: number
  canvasHeight: number
  elements: DashboardElement[]
  isShared?: boolean
  sharedAt?: string
  sharedBy?: string
}

export interface ActiveAlarm {
  id: string
  widgetId: string
  dashboardId: string
  widgetTitle: string
  hostname: string
  conditionText: string
  currentValue: string | number
  triggeredAt: string
  acknowledged: boolean
  acknowledgedAt?: string
  acknowledgedBy?: string
}

// ── Default values ─────────────────────────────────────────────────────────────
export const DEFAULT_WIDGET_STYLE: WidgetStyle = {
  backgroundColor: '#1e1e2e',
  borderRadius: 8,
  borderColor: '#333355',
  borderWidth: 1,
  borderStyle: 'solid',
  shadow: true,
  opacity: 1,
  titleVisible: true,
  titleColor: '#a0a0c0',
  textColor: '#e0e0f0',
  fontSize: 14,
  fontFamily: 'Inter, sans-serif',
  fontBold: false,
  fontItalic: false,
  textAlign: 'left',
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  targets: [],
  refreshInterval: 60,
  autoRefresh: true,
  displayFormat: 'tile',
  showTimestamp: true,
  showRefreshButton: true,
}

export const DEFAULT_ALARM_CONFIG: AlarmConfig = {
  enabled: false,
  condition: { type: 'offline' },
  actions: {
    blink: true,
    blinkEntireApp: false,
    sound: false,
    soundType: 'beep',
    soundVolume: 70,
    popup: true,
    log: true,
  },
}
