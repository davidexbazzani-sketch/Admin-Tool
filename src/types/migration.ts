// ── PC Migration Types ─────────────────────────────────────────────────────

export type MigrationPhase =
  | 'connect'    // Enter source/target hostnames, connect + WinRM check
  | 'analyzing'  // Analysis running on source PC
  | 'selection'  // Step 2: select what to migrate (checkboxes)
  | 'settings'   // Step 3: migration options
  | 'overview'   // Step 4: final summary before commit
  | 'migrating'  // Step 5: migration running
  | 'report'     // Step 5: done, showing report

export type MainTab = 'wizard' | 'history' | 'templates'

// ── Connection / Device info ───────────────────────────────────────────────

export interface PcInfo {
  hostname: string
  model: string
  os: string
  loggedUser: string   // SAM name without domain prefix
  connected: boolean
  winrmOk: boolean
  error?: string
}

// ── Analysis data ──────────────────────────────────────────────────────────

export interface FolderEntry {
  label: string         // 'Desktop', 'Dokumente', …
  localPath: string     // C:\Users\user\Documents
  sizeMb: number
  fileCount: number
  exists: boolean
  selected: boolean
}

export interface SoftwareEntry {
  name: string
  version: string
  publisher: string
  wingetId?: string         // if found in winget export
  isSystemComponent: boolean
  selected: boolean
}

export interface DriveEntry {
  letter: string            // 'H', 'S', …
  uncPath: string           // \\server\share
  selected: boolean
}

export interface PrinterEntry {
  name: string
  portName: string
  driverName: string
  isNetwork: boolean
  isSystemPrinter: boolean
  selected: boolean
}

export interface SettingEntry {
  key: string
  label: string
  description: string
  available: boolean
  selected: boolean
}

export interface MigrationAnalysis {
  sourceUser: string
  folders: FolderEntry[]
  software: SoftwareEntry[]
  drives: DriveEntry[]
  printers: PrinterEntry[]
  settings: SettingEntry[]
  analysisLog: string[]
  totalSizeMb: number
}

// ── Migration options ──────────────────────────────────────────────────────

export interface MigrationOptions {
  conflictMode: 'skip' | 'overwrite' | 'rename'
  autoInstallSoftware: boolean
  silentInstall: boolean
  excludeTempFiles: boolean
  createReport: boolean
  reportEmail: string
}

// ── Task tracking ──────────────────────────────────────────────────────────

export type TaskStatus = 'waiting' | 'running' | 'success' | 'error' | 'skipped' | 'warning'

export interface MigrationTask {
  id: string
  label: string
  category: 'files' | 'software' | 'drives' | 'printers' | 'settings'
  status: TaskStatus
  detail?: string
  output?: string           // truncated PS output for error diagnosis
  bytesCopied?: number
  filesCopied?: number
}

// ── Report ─────────────────────────────────────────────────────────────────

export interface MigrationReport {
  id: string
  date: string
  sourcePc: string
  targetPc: string
  sourceUser: string
  performedBy: string
  durationMs: number
  tasks: MigrationTask[]
  overallStatus: 'success' | 'partial' | 'failed'
  notes: string
}

// ── History (lightweight index stored in history.json) ─────────────────────

export interface MigrationHistoryEntry {
  id: string
  date: string
  sourcePc: string
  targetPc: string
  sourceUser: string
  performedBy: string
  durationMs: number
  overallStatus: 'success' | 'partial' | 'failed'
}

// ── Templates ──────────────────────────────────────────────────────────────

export interface MigrationTemplate {
  id: string
  name: string
  description: string
  createdBy: string
  createdAt: string
  folderLabels: string[]       // which folder labels to pre-select
  settingKeys: string[]        // which setting keys to pre-select
  conflictMode: MigrationOptions['conflictMode']
  excludeTempFiles: boolean
}
