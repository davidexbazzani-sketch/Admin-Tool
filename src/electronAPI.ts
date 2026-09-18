// Type-safe wrapper around window.electronAPI exposed by preload
import type { AppUser, ActivityLog, AppConfig } from './types/auth'
import type { KnowledgeBundle } from './knowledge/knowledge.types'

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
      /** Gebuendeltes App-Asset (public/ bzw. dist/) als Base64 — fetch() ist im file://-Build blockiert. */
      readAsset(rel: string): Promise<{ success: boolean; data?: string; error?: string }>
      /** OCR eines Screenshots (Base64-PNG) offline via Windows.Media.Ocr — für „Zuweisung Tickets". */
      ocrImage(base64Png: string): Promise<{ ok: boolean; text?: string; error?: string }>

      // Settings
      getSettings(): Promise<Record<string, unknown>>
      setSetting(key: string, value: unknown): Promise<boolean>

      // Path configuration
      loadPathsConfig(): Promise<{ success: boolean; data: unknown }>
      savePathsConfig(config: unknown): Promise<{ success: boolean; error?: string }>

      // Shell
      openExternal(url: string): Promise<void>
      openPath(filePath: string): Promise<{ success: boolean; error?: string }>

      // SNMP (Drucker-Status/Neustart) — im Main-Prozess (UDP 161)
      snmpQuery(opts: {
        host: string
        op: 'get' | 'walk' | 'set'
        oids?: string[]           // get
        oid?: string              // walk / set
        version?: 'v1' | 'v2c'
        community?: string
        timeoutMs?: number
        retries?: number
        setType?: 'Integer' | 'OctetString'
        setValue?: string | number
      }): Promise<{ success: boolean; error?: string; varbinds?: { oid: string; type: string; value: string | number; hex?: string }[] }>

      // ServiceNow Table-API (REST via Main-Prozess) — Auth via SSO-Sitzung
      serviceNowRequest(opts: {
        instanceUrl: string
        method?: 'GET' | 'POST' | 'PATCH'; table: string; sysId?: string
        query?: string; fields?: string; limit?: number; body?: unknown
        auth?: { user: string; pass: string }   // Integrationskonto (Basic Auth); ohne = SSO-Sitzung
      }): Promise<{ success: boolean; status?: number; data?: unknown; error?: string; needsLogin?: boolean }>
      /** Datei-Anhang an einen ServiceNow-Datensatz hochladen (Attachment-API, binär). */
      serviceNowAttach(opts: {
        instanceUrl: string; table: string; sysId: string; fileName: string; contentType?: string; dataBase64: string
        auth?: { user: string; pass: string }
      }): Promise<{ success: boolean; status?: number; sysId?: string; error?: string; needsLogin?: boolean }>
      serviceNowCertDiag(): Promise<{
        at: string; url: string; count: number
        certs: { subjectName: string; issuerName: string; validExpiry: number }[]
      } | null>
      serviceNowLogin(instanceUrl: string): Promise<{ success: boolean; user?: string; error?: string }>
      serviceNowLogout(): Promise<{ success: boolean }>

      // Cancel all PS processes
      cancelAll(): Promise<boolean>

      // Log to local file
      log(message: string): Promise<void>

      // Email
      composeEmail(opts: { to: string; cc: string; subject: string; body: string; html?: boolean; attachmentPath?: string }): Promise<{ success: boolean; fallback?: boolean }>

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

      // ── Silent printing ───────────────────────────────────────────────────
      printHtml(html: string): Promise<{ success: boolean; error?: string }>

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
      netWriteRawFile(relativePath: string, base64Data: string): Promise<boolean>
      netReadRawFile(relativePath: string): Promise<string | null>

      // ── Wissensdatenbank (dedicated IPC) ──────────────────────────────────
      wbGetCategories(): Promise<Array<{ id: string; name: string; icon: string; articleCount: number; subcategories: Array<{ id: string; name: string; articleCount: number }> }>>
      wbGetArticles(subcategoryId: string): Promise<Array<{ id: string; title: string; description: string; tags: string[] }>>
      wbGetArticle(articleId: string): Promise<{ id: string; title: string; description: string; tags: string[]; steps: Array<{ title: string; content: string }>; relatedSkills: string[] } | null>
      wbSearch(query: string): Promise<Array<{ id: string; title: string; description: string; categoryName: string; subcategoryName: string; tags: string[] }>>
      wbEnsureGenerated(): Promise<{ exists: boolean; generated: boolean }>

      // ── Wissenssuche (MiniSearch-Volltextindex) ───────────────────────────
      knowledgeLoad(loadSensitive?: boolean): Promise<{ ok: boolean; dir: string | null; core: KnowledgeBundle | null; sensitive: KnowledgeBundle | null; builtAt: string | null; source: 'net' | 'local' | null; error?: string }>
      knowledgeStatus(): Promise<{ ok: boolean; dir: string | null; builtAt: string | null; source: 'net' | 'local' | null }>

      // ── System info ───────────────────────────────────────────────────────
      getWindowsUsername(): Promise<string>
      getHostname(): Promise<string>

      // ── Context menu ──────────────────────────────────────────────────────
      showContextMenu(): Promise<void>

      // ── E-Mail (Outlook COM / PowerShell / Nodemailer) ─────────────────────
      sendEmailRaw(opts: {
        to: string; subject: string; body: string; html?: boolean
        smtp: string; port: number; user?: string; pass?: string; from?: string
        useTls?: boolean; method?: 'outlook' | 'nodemailer' | 'powershell'
      }): Promise<{ success: boolean; error?: string; method?: string }>

      // ── Heartbeat / crash detection ───────────────────────────────────────
      heartbeatSet(username: string): Promise<boolean>
      heartbeatClear(username: string): Promise<boolean>
      heartbeatCheck(username: string): Promise<{ username: string; timestamp: string } | null>

      // ── Presentation mode (hall display) ──────────────────────────────────
      presentationOpen(opts?: { displayId?: number; previewPlaylistId?: string; autoClick?: boolean }): Promise<{ success: boolean }>
      presentationClose(): Promise<{ success: boolean }>
      presentationListDisplays(): Promise<Array<{
        id: number
        label: string
        bounds: { x: number; y: number; width: number; height: number }
        primary: boolean
        scaleFactor: number
      }>>
      // ── Edge-Anzeige (SSO): echte msedge.exe-Fenster im App-Modus ─────────
      edgeLaunch(opts: { url: string; displayId?: number; fullscreen?: boolean; ownProfile?: boolean }): Promise<{ success: boolean; displayId?: number; ownProfile?: boolean; error?: string }>
      edgeClose(displayId?: number): Promise<{ success: boolean; error?: string }>
      edgeStatus(displayId?: number): Promise<{ running: boolean; displayId?: number }>
      // USV: URL in Edge/Chrome öffnen + Notfallplan (DOCX)
      openInEdgeOrChrome(url: string): Promise<{ success: boolean; fallback?: boolean; error?: string }>
      usvOpenDoc(): Promise<{ success: boolean; error?: string }>

      // Task-Manager als eigenständiges Fenster (je Ziel-Host)
      taskmgrOpen(opts: { host: string; displayId?: number; admin?: boolean }): Promise<{ success: boolean }>
      taskmgrClose(host?: string): Promise<{ success: boolean }>
    }
    electronSend(channel: string): void
    electronDrop: { getPath(file: File): string }
  }
}

export const api = () => window.electronAPI
