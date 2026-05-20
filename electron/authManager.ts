import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import bcrypt from 'bcryptjs'
import * as ns from './networkStorage'
import { hostname } from 'os'
import { execSync } from 'child_process'

/** Look up AD display name for a Windows username */
function getAdDisplayName(username: string): string {
  try {
    const ps = `(Get-ADUser -Identity '${username.replace(/'/g, "''")}' -Properties DisplayName -EA Stop).DisplayName`
    const out = execSync(
      `powershell.exe -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 8000 }
    ).trim()
    if (out && out !== username) return out
  } catch { /* AD not available */ }
  // Fallback: try via WMI/Net User
  try {
    const out = execSync(`net user "${username}" /domain 2>nul`, { encoding: 'utf-8', windowsHide: true, timeout: 5000 })
    const match = out.match(/Full Name\s+(.+)/i) || out.match(/Vollst.*Name\s+(.+)/i)
    if (match) {
      const name = match[1].trim()
      if (name && name !== username) return name
    }
  } catch { /* fallback */ }
  return username
}

// ──────────────────────────────────────────────────────────────────────────────
// EMERGENCY AES-256 RECOVERY KEY
// This key is used ONLY for backup_recovery.dat — an absolute last-resort file.
// To decrypt manually: AES-256-CBC, key = "ITAdminToolEmergencyKey2024_SKF!" (32 chars ASCII)
// IV = "ITAdminToolIV001" (16 chars ASCII)
// Location on disk: <networkBase>/recovery/backup_recovery.dat
// ──────────────────────────────────────────────────────────────────────────────
const _KEY = 'ITAdminToolEmergencyKey2024_SKF!'  // 32 ASCII chars = 32 bytes
const _IV  = 'ITAdminToolIV001'                   // 16 ASCII chars = 16 bytes
const EMERGENCY_AES_KEY = Buffer.from(_KEY, 'ascii')
const EMERGENCY_AES_IV  = Buffer.from(_IV,  'ascii')

// ─── File paths (relative to network base) ───────────────────────────────────
const USERS_FILE          = 'users/users.json'
const RECOVERY_FILE       = 'recovery/master_recovery.dat'
const BACKUP_RECOVERY_FILE = 'recovery/backup_recovery.dat'
const LOGS_DIR            = 'logs'
const CONFIG_FILE         = 'config/app.json'

// ─── Initial master admin credentials ────────────────────────────────────────
const INITIAL_MASTER_USERNAME = 'Davidxe'
const INITIAL_MASTER_PASSWORD = 'Wartze_19'

// ─── Types (mirrored from src/types/auth.ts) ──────────────────────────────────
export interface AppUser {
  id: string
  username: string
  displayName: string
  passwordHash?: string
  role: 'master_admin' | 'admin' | 'user'
  blockedFeatures: string[]
  status: 'active' | 'disabled'
  createdAt: string
  lastLogin?: string
  createdBy?: string
  windowsUsername?: string
  corpId?: string
  isFounder?: boolean
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
}

// ─── Utility ─────────────────────────────────────────────────────────────────
export function generateUuid(): string {
  return randomBytes(16).toString('hex')
}

function aesEncrypt(text: string): string {
  const cipher = createCipheriv('aes-256-cbc', EMERGENCY_AES_KEY, EMERGENCY_AES_IV)
  return cipher.update(text, 'utf8', 'hex') + cipher.final('hex')
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function aesDecrypt(hex: string): string {
  const decipher = createDecipheriv('aes-256-cbc', EMERGENCY_AES_KEY, EMERGENCY_AES_IV)
  return decipher.update(hex, 'hex', 'utf8') + decipher.final('utf8')
}

// ─── Password hashing ─────────────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function generateRecoveryKey(): string {
  // 32 uppercase hex chars — easy to read/type
  return randomBytes(16).toString('hex').toUpperCase()
}

// ─── User CRUD ────────────────────────────────────────────────────────────────
export function getUsers(): AppUser[] {
  return ns.readJson<{ users: AppUser[] }>(USERS_FILE)?.users ?? []
}

export function saveUsers(users: AppUser[]): void {
  ns.writeJson(USERS_FILE, { users })
}

export function getUserById(id: string): AppUser | null {
  return getUsers().find(u => u.id === id) ?? null
}

export function getUserByUsername(username: string): AppUser | null {
  return getUsers().find(u => u.username.toLowerCase() === username.toLowerCase()) ?? null
}

export function getUserByWindowsUsername(winUser: string): AppUser | null {
  return getUsers().find(u => u.windowsUsername?.toLowerCase() === winUser.toLowerCase()) ?? null
}

export async function createOrGetSsoUser(windowsUsername: string): Promise<AppUser> {
  const users = getUsers()
  const now = new Date().toISOString()

  // Primary lookup: by stored windowsUsername
  let existing = getUserByWindowsUsername(windowsUsername)

  // Fallback: match by username (covers cases where windowsUsername wasn't stored yet)
  if (!existing) {
    existing = users.find(u => u.username.toLowerCase() === windowsUsername.toLowerCase()) ?? null
  }

  if (existing) {
    const idx = users.findIndex(u => u.id === existing!.id)
    if (idx >= 0) {
      // Update displayName from AD if it's still the raw username
      let dn = existing.displayName
      if (!dn || dn === existing.username || dn === windowsUsername) {
        dn = getAdDisplayName(windowsUsername)
      }
      users[idx] = { ...existing, displayName: dn, lastLogin: now, windowsUsername }
      saveUsers(users)
      return users[idx]
    }
    return existing
  }

  // New SSO user: look up real name from AD
  const adName = getAdDisplayName(windowsUsername)

  const newUser: AppUser = {
    id: generateUuid(),
    username: windowsUsername,
    displayName: adName,
    role: 'user',
    blockedFeatures: [],
    status: 'active',
    createdAt: now,
    lastLogin: now,
    windowsUsername,
  }
  users.push(newUser)
  saveUsers(users)
  return newUser
}

export async function createAdminUser(params: {
  username: string; displayName: string; password: string; createdBy: string
  role?: 'master_admin' | 'admin' | 'user'
}): Promise<AppUser> {
  const role = params.role ?? 'admin'
  const hash = role !== 'user' ? await hashPassword(params.password) : undefined
  const user: AppUser = {
    id: generateUuid(),
    username: params.username,
    displayName: params.displayName,
    passwordHash: hash,
    role,
    blockedFeatures: [],
    status: 'active',
    createdAt: new Date().toISOString(),
    createdBy: params.createdBy,
  }
  const users = getUsers()
  users.push(user)
  saveUsers(users)
  return user
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const users = getUsers()
  const idx = users.findIndex(u => u.id === userId)
  if (idx < 0) return false
  users[idx] = { ...users[idx], passwordHash: await hashPassword(newPassword) }
  saveUsers(users)
  return true
}

export function updateUser(userId: string, patch: Partial<AppUser>): boolean {
  const users = getUsers()
  const idx = users.findIndex(u => u.id === userId)
  if (idx < 0) return false
  users[idx] = { ...users[idx], ...patch }
  saveUsers(users)
  return true
}

export function deleteUser(userId: string): boolean {
  const users = getUsers()
  const idx = users.findIndex(u => u.id === userId)
  if (idx < 0) return false
  users.splice(idx, 1)
  saveUsers(users)
  return true
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function loginWithPassword(username: string, password: string): Promise<{ success: boolean; user?: AppUser; error?: string }> {
  // ── Offline/Test-Modus: Wenn Netzwerk nicht erreichbar, erlaube lokalen Login ──
  if (!ns.isNetworkAvailable()) {
    // Built-in offline accounts for testing without network
    const offlineAccounts: Array<{ username: string; password: string; displayName: string; role: 'master_admin' | 'admin' | 'user' }> = [
      { username: 'dbazzani', password: 'admin', displayName: 'David Bazzani', role: 'master_admin' },
      { username: 'adminx', password: 'Fifa0506', displayName: 'Admin X', role: 'master_admin' },
      { username: 'admin', password: 'admin', displayName: 'Admin (Offline)', role: 'admin' },
    ]
    const match = offlineAccounts.find(a => a.username.toLowerCase() === username.toLowerCase() && a.password === password)
    if (match) {
      const offlineUser: AppUser = {
        id: `offline-${match.username}`,
        username: match.username,
        displayName: match.displayName + ' (Offline)',
        role: match.role,
        blockedFeatures: [],
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      }
      return { success: true, user: offlineUser }
    }
    return { success: false, error: 'Netzwerk nicht erreichbar. Offline-Login: Verwende "dbazzani" / "admin" oder "adminx" / "Fifa0506"' }
  }

  const user = getUserByUsername(username)
  if (!user) return { success: false, error: 'Benutzer nicht gefunden' }
  if (user.status === 'disabled') return { success: false, error: 'Konto gesperrt' }
  if (!user.passwordHash) return { success: false, error: 'Kein Passwort hinterlegt' }
  const ok = await comparePassword(password, user.passwordHash)
  if (!ok) return { success: false, error: 'Falsches Passwort' }
  // Update displayName from AD if still the raw username
  let dn = user.displayName
  if (!dn || dn === user.username) {
    dn = getAdDisplayName(user.username)
  }
  updateUser(user.id, { lastLogin: new Date().toISOString(), displayName: dn })
  return { success: true, user: { ...user, displayName: dn, lastLogin: new Date().toISOString() } }
}

// ─── First-run initialization ────────────────────────────────────────────────
export async function initializeIfNeeded(): Promise<{ isFirstRun: boolean; recoveryKey?: string; networkAvailable: boolean }> {
  const networkAvailable = ns.isNetworkAvailable()
  if (!networkAvailable) return { isFirstRun: false, networkAvailable: false }

  ns.ensureDirs()

  const existing = ns.readJson<{ users: AppUser[] }>(USERS_FILE)
  if (existing?.users?.length) {
    // Backfill: ensure the initial master admin always has isFounder:true
    // (guards against users.json created before this flag was introduced)
    const users = existing.users
    const hasFounder = users.some(u => u.isFounder === true)
    if (!hasFounder) {
      const idx = users.findIndex(u => u.role === 'master_admin' && u.username.toLowerCase() === INITIAL_MASTER_USERNAME.toLowerCase())
      if (idx >= 0) {
        users[idx] = { ...users[idx], isFounder: true }
        ns.writeJson(USERS_FILE, { users })
      }
    }
    // Ensure second master admin 'adminx' exists
    if (!users.some(u => u.username.toLowerCase() === 'adminx')) {
      const ax = await hashPassword('Fifa0506')
      users.push({
        id: generateUuid(),
        username: 'adminx',
        displayName: 'Admin X',
        passwordHash: ax,
        role: 'master_admin',
        blockedFeatures: [],
        status: 'active',
        createdAt: new Date().toISOString(),
      })
      ns.writeJson(USERS_FILE, { users })
    }

    return { isFirstRun: false, networkAvailable: true }
  }

  // First run — create master admin
  const recoveryKey = generateRecoveryKey()
  const passwordHash = await hashPassword(INITIAL_MASTER_PASSWORD)

  const masterAdmin: AppUser = {
    id: generateUuid(),
    username: INITIAL_MASTER_USERNAME,
    displayName: 'David Bazzani',
    passwordHash,
    role: 'master_admin',
    blockedFeatures: [],
    status: 'active',
    createdAt: new Date().toISOString(),
    isFounder: true,
  }

  // Second master admin
  const secondAdminHash = await hashPassword('Fifa0506')
  const secondAdmin: AppUser = {
    id: generateUuid(),
    username: 'adminx',
    displayName: 'Admin X',
    passwordHash: secondAdminHash,
    role: 'master_admin',
    blockedFeatures: [],
    status: 'active',
    createdAt: new Date().toISOString(),
  }

  ns.writeJson(USERS_FILE, { users: [masterAdmin, secondAdmin] })

  // Recovery file: stores bcrypt hash of the recovery key
  const recoveryHash = await hashPassword(recoveryKey)
  ns.writeJson(RECOVERY_FILE, {
    recoveryKeyHash: recoveryHash,
    masterUserId: masterAdmin.id,
    createdAt: new Date().toISOString(),
  })

  // Backup recovery: AES-256 encrypted with emergency key (see comment at top of file)
  const backupPayload = JSON.stringify({
    recoveryKey,
    masterUserId: masterAdmin.id,
    passwordHash,
    createdAt: new Date().toISOString(),
  })
  ns.writeJson(BACKUP_RECOVERY_FILE, { encrypted: aesEncrypt(backupPayload) })

  return { isFirstRun: true, recoveryKey, networkAvailable: true }
}

// ─── Recovery ────────────────────────────────────────────────────────────────
export async function verifyRecoveryKey(key: string): Promise<boolean> {
  const data = ns.readJson<{ recoveryKeyHash: string }>(RECOVERY_FILE)
  if (!data?.recoveryKeyHash) return false
  return comparePassword(key, data.recoveryKeyHash)
}

export async function resetMasterPasswordViaRecovery(newPassword: string): Promise<boolean> {
  const users = getUsers()
  const idx = users.findIndex(u => u.role === 'master_admin')
  if (idx < 0) return false
  users[idx].passwordHash = await hashPassword(newPassword)
  saveUsers(users)
  return true
}

// ─── Activity logging ─────────────────────────────────────────────────────────
export function writeActivityLog(entry: Omit<ActivityLog, 'id' | 'sourceHost'>): void {
  try {
    const now = new Date()
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const filePath = `${LOGS_DIR}/activity-${monthKey}.json`
    const existing = ns.readJson<ActivityLog[]>(filePath) ?? []
    const log: ActivityLog = { ...entry, id: generateUuid(), sourceHost: hostname() }
    existing.push(log)
    ns.writeJson(filePath, existing)
  } catch { /* non-critical */ }
}

export function readActivityLogs(monthKey?: string): ActivityLog[] {
  if (monthKey) {
    return ns.readJson<ActivityLog[]>(`${LOGS_DIR}/activity-${monthKey}.json`) ?? []
  }
  // Read all log files
  const files = ns.listDir(LOGS_DIR).filter(f => f.startsWith('activity-') && f.endsWith('.json'))
  const all: ActivityLog[] = []
  for (const f of files) {
    const logs = ns.readJson<ActivityLog[]>(`${LOGS_DIR}/${f}`) ?? []
    all.push(...logs)
  }
  return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

// ─── App config ───────────────────────────────────────────────────────────────
export function getAppConfig(): AppConfig {
  return ns.readJson<AppConfig>(CONFIG_FILE) ?? { betaMode: true, networkBasePath: ns.getBasePath() }
}

export function saveAppConfig(config: Partial<AppConfig>): void {
  const existing = getAppConfig()
  ns.writeJson(CONFIG_FILE, { ...existing, ...config })
}
