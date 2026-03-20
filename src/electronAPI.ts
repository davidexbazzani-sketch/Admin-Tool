// Type-safe wrapper around window.electronAPI exposed by preload
import type { AppUser, ActivityLog, AppConfig } from './types/auth'

export interface PSResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

export interface FileReadResult {
  success: boolean
  data?: string   // base64
  filePath?: string
  error?: string
}

declare global {
  interface Window {
    electronAPI: {
      // PowerShell
      runPowerShell(command: string, timeoutMs?: number): Promise<PSResult>
      checkAdmin(): Promise<boolean>

      // File dialogs
      openFileDialog(filters?: { name: string; extensions: string[] }[]): Promise<string | null>
      openFilesDialog(filters?: { name: string; extensions: string[] }[]): Promise<string[]>
      saveFileDialog(defaultPath?: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null>
      selectDirectory(): Promise<string | null>

      // File I/O
      readFile(filePath: string): Promise<FileReadResult>
      writeFile(filePath: string, dataBase64: string): Promise<{ success: boolean; error?: string }>

      // Settings
      getSettings(): Promise<Record<string, unknown>>
      setSetting(key: string, value: unknown): Promise<boolean>

      // Shell
      openExternal(url: string): Promise<void>
      openPath(filePath: string): Promise<{ success: boolean; error?: string }>

      // Cancel all PS processes
      cancelAll(): Promise<boolean>

      // Log to local file
      log(message: string): Promise<void>

      // Email
      composeEmail(opts: { to: string; cc: string; subject: string; body: string; attachmentPath?: string }): Promise<{ success: boolean; fallback?: boolean }>

      // App version
      getAppVersion(): Promise<string>

      // Progress events
      onQueryProgress(cb: (data: { deviceId: string; queryId: string; status: string }) => void): () => void

      // ── Auth ──────────────────────────────────────────────────────────────
      authInit(): Promise<{ isFirstRun: boolean; recoveryKey?: string; networkAvailable: boolean }>
      authLogin(username: string, password: string): Promise<{ success: boolean; user?: AppUser; error?: string }>
      authSso(): Promise<{ user: AppUser; windowsUsername: string }>
      authVerifyRecovery(key: string): Promise<boolean>
      authResetMasterPassword(newPassword: string): Promise<boolean>
      authHashPassword(password: string): Promise<string>
      authGetUsers(): Promise<AppUser[]>
      authCreateAdmin(params: { username: string; displayName: string; password: string; createdBy: string; role?: 'master_admin' | 'admin' | 'user' }): Promise<AppUser>
      authUpdateUser(userId: string, patch: Record<string, unknown>): Promise<boolean>
      authUpdatePassword(userId: string, newPassword: string): Promise<boolean>
      authDeleteUser(userId: string): Promise<boolean>

      // ── Activity logging ──────────────────────────────────────────────────
      logActivity(entry: {
        userId: string; username: string; displayName: string
        action: string; target?: string; screen: string; timestamp: string
      }): Promise<boolean>
      getLogs(monthKey?: string): Promise<ActivityLog[]>

      // ── App config ────────────────────────────────────────────────────────
      getAppConfig(): Promise<AppConfig>
      saveAppConfig(config: Record<string, unknown>): Promise<boolean>

      // ── Network storage (inventory, tasks, bugs, etc.) ───────────────────
      netReadJson<T = unknown>(relativePath: string): Promise<T | null>
      netWriteJson(relativePath: string, data: unknown): Promise<boolean>
      netExists(relativePath: string): Promise<boolean>
      netListDir(relativePath: string): Promise<string[]>
      netDeleteFile(relativePath: string): Promise<boolean>
      netIsAvailable(): Promise<boolean>
      netGetBasePath(): Promise<string>
      netSetBasePath(path: string): Promise<boolean>

      // ── System info ───────────────────────────────────────────────────────
      getWindowsUsername(): Promise<string>
      getHostname(): Promise<string>

      // ── Context menu ──────────────────────────────────────────────────────
      showContextMenu(): Promise<void>

      // ── E-Mail (nodemailer) ───────────────────────────────────────────────
      sendEmailRaw(opts: {
        to: string; subject: string; body: string; html?: boolean
        smtp: string; port: number; user?: string; pass?: string; from?: string
        useTls?: boolean
      }): Promise<boolean>

      // ── Heartbeat / crash detection ───────────────────────────────────────
      heartbeatSet(username: string): Promise<boolean>
      heartbeatClear(username: string): Promise<boolean>
      heartbeatCheck(username: string): Promise<{ username: string; timestamp: string } | null>
    }
    electronSend(channel: string): void
    electronDrop: { getPath(file: File): string }
  }
}

export const api = () => window.electronAPI
