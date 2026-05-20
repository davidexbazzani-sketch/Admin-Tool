// ── Auth Types ────────────────────────────────────────────────────────────────
// Must stay in sync with electron/authManager.ts (AppUser interface)

export type AppRole = 'master_admin' | 'admin' | 'user'

export interface AppUser {
  id: string
  username: string
  displayName: string
  passwordHash?: string          // only stored for admin / master_admin
  role: AppRole
  blockedFeatures: string[]      // feature IDs blocked for this admin (empty = all allowed)
  status: 'active' | 'disabled'
  createdAt: string
  lastLogin?: string
  createdBy?: string
  windowsUsername?: string       // populated for SSO users
  corpId?: string
  isFounder?: boolean            // only Davidxe — set at first-run, never via UI
}

export interface AppSession {
  user: AppUser
  loginMethod: 'password' | 'sso'
  loginTime: string
}

export interface ActivityLog {
  id: string
  userId: string
  username: string
  displayName: string
  action: string
  target?: string
  screen: string
  timestamp: string
  sourceHost: string
}

export interface AppConfig {
  betaMode: boolean
  networkBasePath: string
  knowledgeBasePath: string   // relative path under networkBasePath, default "knowledge_base"
  adSearchHamburg: boolean    // true = search only Hamburg office first
  adSearchAll: boolean        // true = search all locations
}

export interface InventoryItem {
  id: string
  name: string
  ip?: string
  description?: string
  category: string
  addedAt: string
  addedBy: string
  assignedTo?: string   // ServiceNow Zuweisung (Assigned to)
  // AD-aufgeloeste Daten zum Benutzer in `assignedTo` (befuellt via Button
  // "AD-Daten aktualisieren" in der Standort-Uebersicht)
  department?: string   // AD: Department / Abteilung
  jobTitle?: string     // AD: Title / Stellenbezeichnung
  adLookupAt?: string   // ISO timestamp des letzten erfolgreichen Lookups
}

export interface ScheduledTask {
  id: string
  name: string
  devices: string[]
  commands: Array<{
    catId: string
    cmdId: string
    input?: string
    notifyEmail?: string
    notifySubject?: string
    notifyBody?: string
    schedule?: {
      type: 'once' | 'recurring'
      time: string
      date?: string
      days?: number[]
      repeat?: 'weekly' | 'biweekly' | 'monthly'
    }
  }>
  schedule: {
    type: 'once' | 'recurring'
    dates?: string[]             // ISO date strings for 'once'
    days?: number[]              // 0=Sun..6=Sat for 'recurring'
    time: string                 // "HH:MM"
    startDate?: string
    endDate?: string
    repeat?: 'weekly' | 'biweekly' | 'monthly'
  }
  rebootOptions?: {
    preRebootEmail?: { enabled: boolean; recipients: string; minutesBefore: number; subject?: string; body?: string }
    onlineNotification?: { enabled: boolean; recipients: string; checkServices: string[]; subject?: string; body?: string }
  }
  status: 'active' | 'paused'
  createdAt: string
  createdBy: string
  lastRun?: string
  lastResult?: 'success' | 'error'
}

export interface UserEmailConfig {
  email: string        // sender address (used as From:)
  smtp: string
  port: number
  useTls: boolean      // STARTTLS (recommended for port 587)
  smtpUser?: string    // SMTP username (usually same as email for O365)
  smtpPass?: string    // SMTP password or App Password
  notifyEmail: string  // address to receive crash/notification emails
  emailMethod?: 'outlook' | 'nodemailer' | 'powershell'  // sending method (default: outlook)
}

export interface BugReport {
  id: string
  subject: string
  description: string
  category: 'bug' | 'improvement' | 'question' | 'other'
  priority: 'low' | 'medium' | 'high' | 'critical'
  status: 'new' | 'in_progress' | 'resolved'
  submittedBy: string
  submittedByDisplay: string
  submittedAt: string
  sourceHost: string
  currentScreen: string
  screenshots: string[]           // base64 images
  conversation: Array<{
    id: string
    authorId: string
    authorDisplay: string
    text: string
    timestamp: string
  }>
  readByAdmin: boolean
}

export interface ApprovalRequest {
  id: string
  requestedBy: string
  requestedByDisplay: string
  command: string
  devices: string[]
  reason?: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: string
  respondedAt?: string
  respondedBy?: string
  comment?: string
  expiresAt?: string             // approval expires after 24h
}
