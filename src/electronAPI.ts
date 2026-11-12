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

/** ServiceNow-Integrationskonto: Client-ID + Secret → OAuth (Vorrang), sonst Benutzer + Passwort → Basic Auth. */
export interface SnAuthPayload {
  user?: string
  pass?: string
  clientId?: string
  clientSecret?: string
  /** REST API Key (ServiceNow, Header x-sn-apikey) — hat Vorrang vor OAuth/Basic */
  apiKey?: string
}

/** Strukturierte Fehlerangaben einer ServiceNow-Anfrage (ohne Zugangsdaten/Token). */
export interface SnDiag {
  method: 'apikey' | 'oauth' | 'basic' | 'sso'
  /** WWW-Authenticate der Antwort — verrät, welche Anmeldeart ServiceNow verlangt (z. B. API_KEY) */
  wwwAuth?: string
  /** connect = keine HTTP-Antwort · token = OAuth-Token nicht erhalten · api = Table-API hat abgelehnt */
  stage: 'connect' | 'token' | 'api'
  status?: number
  attempts?: { grant: string; status: number; error?: string; description?: string; netError?: string }[]
  snMessage?: string
  snDetail?: string
  netError?: string
  table?: string
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
        auth?: SnAuthPayload   // Integrationskonto (OAuth bzw. Basic Auth); ohne = SSO-Sitzung
      }): Promise<{ success: boolean; status?: number; data?: unknown; error?: string; needsLogin?: boolean; diag?: SnDiag }>
      /** Datei-Anhang an einen ServiceNow-Datensatz hochladen (Attachment-API, binär). */
      serviceNowAttach(opts: {
        instanceUrl: string; table: string; sysId: string; fileName: string; contentType?: string; dataBase64: string
        auth?: SnAuthPayload
      }): Promise<{ success: boolean; status?: number; sysId?: string; error?: string; needsLogin?: boolean }>
      serviceNowCertDiag(): Promise<{
        at: string; url: string; count: number
        certs: { subjectName: string; issuerName: string; validExpiry: number }[]
      } | null>
      /** Kompletter Fehlerbericht (nur lesende Aufrufe; Secret/Passwort/Token entfernt). */
      serviceNowFullDiag(opts: { instanceUrl: string; auth?: SnAuthPayload; kontext?: string[] }): Promise<{ success: boolean; text?: string; zusammenfassung?: string[]; error?: string }>
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
      /** Asynchron im Hauptprozess (blockiert nicht) — für häufige Abfragen wie den Chat. */
      netListDirAsync(relativePath: string): Promise<string[]>
      netReadJsonAsync<T = unknown>(relativePath: string): Promise<T | null>
      netWriteJsonAsync(relativePath: string, data: unknown): Promise<boolean>
      netDeleteFileAsync(relativePath: string): Promise<boolean>
      netIsAvailable(): Promise<boolean>
      netGetBasePath(): Promise<string>
      netSetBasePath(path: string): Promise<boolean>
      netWriteRawFile(relativePath: string, base64Data: string): Promise<boolean>
      /** Lokale Datei aufs Netzlaufwerk kopieren (asynchron, ohne Base64 — für große Videos) */
      netCopyLocalFileAsync(localPath: string, relativePath: string): Promise<{ ok: boolean; bytes?: number; error?: string }>
      /** Ordner einer HTML-Folie fuer das skfslide://-Protokoll freigeben. */
      slideAllowFolder(htmlPfad: string): Promise<boolean>
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
        to: string; cc?: string; subject: string; body: string; html?: boolean
        smtp: string; port: number; user?: string; pass?: string; from?: string
        useTls?: boolean; method?: 'outlook' | 'nodemailer' | 'powershell'
        attachmentPath?: string
        /** nur fürs Aktivitätsprotokoll (wird vor dem IPC-Aufruf entfernt) */
        protokoll?: { art: 'automatisch' | 'manuell'; quelle: string }
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
      /** Outlook per COM im Benutzerkontext: meeting-create/-update/-cancel, scan (siehe electron/outlookAktion.ts). */
      outlookAktion(eingabe: Record<string, unknown>, timeoutMs?: number): Promise<Record<string, unknown>>
      /** Weboberfläche eines Netzwerkgeräts im Tool-Fenster öffnen; Benutzer/Passwort werden automatisch eingetragen. */
      netzgeraetOpenWeb(opts: { url: string; title?: string; user?: string; pass?: string }): Promise<{ success: boolean; error?: string }>

      // Task-Manager als eigenständiges Fenster (je Ziel-Host)
      taskmgrOpen(opts: { host: string; displayId?: number; admin?: boolean }): Promise<{ success: boolean }>
      taskmgrClose(host?: string): Promise<{ success: boolean }>
      soundfixOpen(opts: { host: string; displayId?: number }): Promise<{ success: boolean }>
      soundfixClose(host?: string): Promise<{ success: boolean }>
    }
    electronSend(channel: string): void
    electronDrop: { getPath(file: File): string }
  }
}

// ── Mailversand mitprotokollieren (Aktivitätsprotokoll, services/aktivitaet.ts) ──
// Das von contextBridge gelieferte Objekt ist eingefroren → einmal eine Kopie mit umhülltem
// sendEmailRaw anlegen. Automatische Absender übergeben `protokoll: { art, quelle }`.
type MailOpts = Parameters<Window['electronAPI']['sendEmailRaw']>[0]
type MailHook = (o: MailOpts, r: { success: boolean; error?: string; method?: string }) => void
let mailHook: MailHook | null = null
/** Wird von services/aktivitaet.ts beim Start gesetzt. */
export function setzeMailHook(h: MailHook): void { mailHook = h }
let umhuellt: Window['electronAPI'] | null = null
let quelle: Window['electronAPI'] | null = null
export const api = (): Window['electronAPI'] => {
  const e = window.electronAPI
  if (!e) return e
  if (umhuellt && quelle === e) return umhuellt
  try {
    const kopie = { ...e } as Window['electronAPI']
    const roh = e.sendEmailRaw
    if (typeof roh === 'function') {
      kopie.sendEmailRaw = async (o: MailOpts) => {
        const { protokoll, ...rest } = o
        const r = await roh(rest)
        try { mailHook?.({ ...rest, protokoll }, r) } catch { /* nie stören */ }
        return r
      }
    }
    umhuellt = kopie; quelle = e
    return kopie
  } catch { return e }
}
