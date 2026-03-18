export type Screen = 'home' | 'query-menu' | 'results' | 'xelion' | 'trickkiste' | 'settings'

export type Prefix = 'DE' | 'DEHAM' | 'DESCH' | 'Sonstige'

export interface DeviceEntry {
  id: string
  type: 'hostname' | 'serial'
  value: string         // raw input
  prefixes?: Prefix[]   // only for serial
  customPrefix?: string // only when Sonstige selected
  // Resolved hostnames (one serial can produce multiple via multi-prefix)
  resolvedHostnames: string[]
}

export type QueryId =
  // Network
  | 'net_ping' | 'net_ip' | 'net_mac' | 'net_adapter'
  | 'net_ports' | 'net_dns' | 'net_lastonline' | 'net_vpn'
  // System (admin)
  | 'sys_os' | 'sys_cpu_load' | 'sys_ram' | 'sys_disk'
  | 'sys_bios' | 'sys_uptime' | 'sys_model' | 'sys_ram_modules' | 'sys_cpu_model'
  // AD (admin)
  | 'ad_user' | 'ad_details' | 'ad_ou' | 'ad_sync'
  | 'ad_bitlocker' | 'ad_gpo' | 'ad_localadmins' | 'ad_certs'
  // Security (admin)
  | 'sec_defender' | 'sec_firewall' | 'sec_pending_updates'
  | 'sec_updates' | 'sec_uac' | 'sec_autostart' | 'sec_services'
  // Software (admin)
  | 'sw_installed' | 'sw_office' | 'sw_recent' | 'sw_tasks'
  // Events (admin)
  | 'ev_errors' | 'ev_logins' | 'ev_bsod'
  // Nachrichten (admin)
  | 'msg_screen' | 'msg_voice'

export interface QueryDefinition {
  id: QueryId
  label: string
  adminOnly: boolean
  psCommand: (hostname: string) => string
  category: string
}

export type QueryStatus = 'pending' | 'running' | 'done' | 'error' | 'timeout'

export interface QueryResult {
  queryId: QueryId
  hostname: string
  status: QueryStatus
  output: string
  error?: string
  timestamp: number
}

export interface AppSettings {
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  exportPath: string
  adDomain: string
  adServer: string
  theme: 'dark' | 'light'
}

export interface XelionEntry {
  id: string
  value: string // name or corp-id
}
