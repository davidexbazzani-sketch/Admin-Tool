"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUuid = generateUuid;
exports.hashPassword = hashPassword;
exports.comparePassword = comparePassword;
exports.generateRecoveryKey = generateRecoveryKey;
exports.getUsers = getUsers;
exports.saveUsers = saveUsers;
exports.getUserById = getUserById;
exports.getUserByUsername = getUserByUsername;
exports.getUserByWindowsUsername = getUserByWindowsUsername;
exports.createOrGetSsoUser = createOrGetSsoUser;
exports.createAdminUser = createAdminUser;
exports.updateUserPassword = updateUserPassword;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.loginWithPassword = loginWithPassword;
exports.initializeIfNeeded = initializeIfNeeded;
exports.verifyRecoveryKey = verifyRecoveryKey;
exports.resetMasterPasswordViaRecovery = resetMasterPasswordViaRecovery;
exports.writeActivityLog = writeActivityLog;
exports.readActivityLogs = readActivityLogs;
exports.getAppConfig = getAppConfig;
exports.saveAppConfig = saveAppConfig;
const crypto_1 = require("crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const ns = __importStar(require("./networkStorage"));
const os_1 = require("os");
// ──────────────────────────────────────────────────────────────────────────────
// EMERGENCY AES-256 RECOVERY KEY
// This key is used ONLY for backup_recovery.dat — an absolute last-resort file.
// To decrypt manually: AES-256-CBC, key = "ITAdminToolEmergencyKey2024_SKF!" (32 chars ASCII)
// IV = "ITAdminToolIV001" (16 chars ASCII)
// Location on disk: <networkBase>/recovery/backup_recovery.dat
// ──────────────────────────────────────────────────────────────────────────────
const _KEY = 'ITAdminToolEmergencyKey2024_SKF!'; // 32 ASCII chars = 32 bytes
const _IV = 'ITAdminToolIV001'; // 16 ASCII chars = 16 bytes
const EMERGENCY_AES_KEY = Buffer.from(_KEY, 'ascii');
const EMERGENCY_AES_IV = Buffer.from(_IV, 'ascii');
// ─── File paths (relative to network base) ───────────────────────────────────
const USERS_FILE = 'users/users.json';
const RECOVERY_FILE = 'recovery/master_recovery.dat';
const BACKUP_RECOVERY_FILE = 'recovery/backup_recovery.dat';
const LOGS_DIR = 'logs';
const CONFIG_FILE = 'config/app.json';
// ─── Initial master admin credentials ────────────────────────────────────────
const INITIAL_MASTER_USERNAME = 'Davidxe';
const INITIAL_MASTER_PASSWORD = 'Wartze_19';
// ─── Utility ─────────────────────────────────────────────────────────────────
function generateUuid() {
    return (0, crypto_1.randomBytes)(16).toString('hex');
}
function aesEncrypt(text) {
    const cipher = (0, crypto_1.createCipheriv)('aes-256-cbc', EMERGENCY_AES_KEY, EMERGENCY_AES_IV);
    return cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function aesDecrypt(hex) {
    const decipher = (0, crypto_1.createDecipheriv)('aes-256-cbc', EMERGENCY_AES_KEY, EMERGENCY_AES_IV);
    return decipher.update(hex, 'hex', 'utf8') + decipher.final('utf8');
}
// ─── Password hashing ─────────────────────────────────────────────────────────
async function hashPassword(password) {
    return bcryptjs_1.default.hash(password, 12);
}
async function comparePassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
function generateRecoveryKey() {
    // 32 uppercase hex chars — easy to read/type
    return (0, crypto_1.randomBytes)(16).toString('hex').toUpperCase();
}
// ─── User CRUD ────────────────────────────────────────────────────────────────
function getUsers() {
    return ns.readJson(USERS_FILE)?.users ?? [];
}
function saveUsers(users) {
    ns.writeJson(USERS_FILE, { users });
}
function getUserById(id) {
    return getUsers().find(u => u.id === id) ?? null;
}
function getUserByUsername(username) {
    return getUsers().find(u => u.username.toLowerCase() === username.toLowerCase()) ?? null;
}
function getUserByWindowsUsername(winUser) {
    return getUsers().find(u => u.windowsUsername?.toLowerCase() === winUser.toLowerCase()) ?? null;
}
async function createOrGetSsoUser(windowsUsername) {
    const users = getUsers();
    const now = new Date().toISOString();
    // Primary lookup: by stored windowsUsername
    let existing = getUserByWindowsUsername(windowsUsername);
    // Fallback: match by username (covers cases where windowsUsername wasn't stored yet)
    if (!existing) {
        existing = users.find(u => u.username.toLowerCase() === windowsUsername.toLowerCase()) ?? null;
    }
    if (existing) {
        const idx = users.findIndex(u => u.id === existing.id);
        if (idx >= 0) {
            users[idx] = { ...existing, lastLogin: now, windowsUsername };
            saveUsers(users);
            return users[idx];
        }
        return existing;
    }
    const newUser = {
        id: generateUuid(),
        username: windowsUsername,
        displayName: windowsUsername,
        role: 'user',
        blockedFeatures: [],
        status: 'active',
        createdAt: now,
        lastLogin: now,
        windowsUsername,
    };
    users.push(newUser);
    saveUsers(users);
    return newUser;
}
async function createAdminUser(params) {
    const role = params.role ?? 'admin';
    const hash = role !== 'user' ? await hashPassword(params.password) : undefined;
    const user = {
        id: generateUuid(),
        username: params.username,
        displayName: params.displayName,
        passwordHash: hash,
        role,
        blockedFeatures: [],
        status: 'active',
        createdAt: new Date().toISOString(),
        createdBy: params.createdBy,
    };
    const users = getUsers();
    users.push(user);
    saveUsers(users);
    return user;
}
async function updateUserPassword(userId, newPassword) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0)
        return false;
    users[idx] = { ...users[idx], passwordHash: await hashPassword(newPassword) };
    saveUsers(users);
    return true;
}
function updateUser(userId, patch) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0)
        return false;
    users[idx] = { ...users[idx], ...patch };
    saveUsers(users);
    return true;
}
function deleteUser(userId) {
    const users = getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx < 0)
        return false;
    users.splice(idx, 1);
    saveUsers(users);
    return true;
}
// ─── Login ────────────────────────────────────────────────────────────────────
async function loginWithPassword(username, password) {
    const user = getUserByUsername(username);
    if (!user)
        return { success: false, error: 'Benutzer nicht gefunden' };
    if (user.status === 'disabled')
        return { success: false, error: 'Konto gesperrt' };
    if (!user.passwordHash)
        return { success: false, error: 'Kein Passwort hinterlegt' };
    const ok = await comparePassword(password, user.passwordHash);
    if (!ok)
        return { success: false, error: 'Falsches Passwort' };
    updateUser(user.id, { lastLogin: new Date().toISOString() });
    return { success: true, user: { ...user, lastLogin: new Date().toISOString() } };
}
// ─── First-run initialization ────────────────────────────────────────────────
async function initializeIfNeeded() {
    const networkAvailable = ns.isNetworkAvailable();
    if (!networkAvailable)
        return { isFirstRun: false, networkAvailable: false };
    ns.ensureDirs();
    const existing = ns.readJson(USERS_FILE);
    if (existing?.users?.length) {
        // Backfill: ensure the initial master admin always has isFounder:true
        // (guards against users.json created before this flag was introduced)
        const users = existing.users;
        const hasFounder = users.some(u => u.isFounder === true);
        if (!hasFounder) {
            const idx = users.findIndex(u => u.role === 'master_admin' && u.username.toLowerCase() === INITIAL_MASTER_USERNAME.toLowerCase());
            if (idx >= 0) {
                users[idx] = { ...users[idx], isFounder: true };
                ns.writeJson(USERS_FILE, { users });
            }
        }
        return { isFirstRun: false, networkAvailable: true };
    }
    // First run — create master admin
    const recoveryKey = generateRecoveryKey();
    const passwordHash = await hashPassword(INITIAL_MASTER_PASSWORD);
    const masterAdmin = {
        id: generateUuid(),
        username: INITIAL_MASTER_USERNAME,
        displayName: 'David Bazzani',
        passwordHash,
        role: 'master_admin',
        blockedFeatures: [],
        status: 'active',
        createdAt: new Date().toISOString(),
        isFounder: true,
    };
    ns.writeJson(USERS_FILE, { users: [masterAdmin] });
    // Recovery file: stores bcrypt hash of the recovery key
    const recoveryHash = await hashPassword(recoveryKey);
    ns.writeJson(RECOVERY_FILE, {
        recoveryKeyHash: recoveryHash,
        masterUserId: masterAdmin.id,
        createdAt: new Date().toISOString(),
    });
    // Backup recovery: AES-256 encrypted with emergency key (see comment at top of file)
    const backupPayload = JSON.stringify({
        recoveryKey,
        masterUserId: masterAdmin.id,
        passwordHash,
        createdAt: new Date().toISOString(),
    });
    ns.writeJson(BACKUP_RECOVERY_FILE, { encrypted: aesEncrypt(backupPayload) });
    return { isFirstRun: true, recoveryKey, networkAvailable: true };
}
// ─── Recovery ────────────────────────────────────────────────────────────────
async function verifyRecoveryKey(key) {
    const data = ns.readJson(RECOVERY_FILE);
    if (!data?.recoveryKeyHash)
        return false;
    return comparePassword(key, data.recoveryKeyHash);
}
async function resetMasterPasswordViaRecovery(newPassword) {
    const users = getUsers();
    const idx = users.findIndex(u => u.role === 'master_admin');
    if (idx < 0)
        return false;
    users[idx].passwordHash = await hashPassword(newPassword);
    saveUsers(users);
    return true;
}
// ─── Activity logging ─────────────────────────────────────────────────────────
function writeActivityLog(entry) {
    try {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const filePath = `${LOGS_DIR}/activity-${monthKey}.json`;
        const existing = ns.readJson(filePath) ?? [];
        const log = { ...entry, id: generateUuid(), sourceHost: (0, os_1.hostname)() };
        existing.push(log);
        ns.writeJson(filePath, existing);
    }
    catch { /* non-critical */ }
}
function readActivityLogs(monthKey) {
    if (monthKey) {
        return ns.readJson(`${LOGS_DIR}/activity-${monthKey}.json`) ?? [];
    }
    // Read all log files
    const files = ns.listDir(LOGS_DIR).filter(f => f.startsWith('activity-') && f.endsWith('.json'));
    const all = [];
    for (const f of files) {
        const logs = ns.readJson(`${LOGS_DIR}/${f}`) ?? [];
        all.push(...logs);
    }
    return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
// ─── App config ───────────────────────────────────────────────────────────────
function getAppConfig() {
    return ns.readJson(CONFIG_FILE) ?? { betaMode: true, networkBasePath: ns.getBasePath() };
}
function saveAppConfig(config) {
    const existing = getAppConfig();
    ns.writeJson(CONFIG_FILE, { ...existing, ...config });
}
