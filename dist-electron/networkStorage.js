"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_NETWORK_BASE = void 0;
exports.getBasePath = getBasePath;
exports.setBasePath = setBasePath;
exports.isNetworkAvailable = isNetworkAvailable;
exports.ensureDirs = ensureDirs;
exports.readJson = readJson;
exports.writeJson = writeJson;
exports.listDir = listDir;
exports.deleteFile = deleteFile;
exports.fileExists = fileExists;
exports.writeRawFile = writeRawFile;
exports.readRawFile = readRawFile;
const fs_1 = require("fs");
const electron_store_1 = __importDefault(require("electron-store"));
// ─── Network base path ────────────────────────────────────────────────────────
exports.DEFAULT_NETWORK_BASE = '\\\\w3172\\skf Marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT';
const pathStore = new electron_store_1.default({ name: 'network-config' });
function getBasePath() {
    return pathStore.get('networkBasePath') ?? exports.DEFAULT_NETWORK_BASE;
}
function setBasePath(path) {
    pathStore.set('networkBasePath', path);
}
// ── Safe UNC path join (path.join can break UNC \\server\share prefix) ────────
function safeJoin(base, relative) {
    // Normalize separators
    const b = base.replace(/\//g, '\\').replace(/\\+$/, '');
    const r = relative.replace(/\//g, '\\').replace(/^\\+/, '');
    const full = b + '\\' + r;
    // Log for debugging
    console.log(`[networkStorage] safeJoin: "${b}" + "${r}" = "${full}"`);
    return full;
}
// Sub-directories the tool creates on first run
const SUBDIRS = ['users', 'recovery', 'logs', 'config', 'templates', 'inventory', 'approvals', 'scheduled_tasks', 'bugs'];
function isNetworkAvailable() {
    try {
        return (0, fs_1.existsSync)(getBasePath());
    }
    catch {
        return false;
    }
}
function ensureDirs() {
    const base = getBasePath();
    if (!(0, fs_1.existsSync)(base))
        return;
    for (const d of SUBDIRS) {
        const full = safeJoin(base, d);
        if (!(0, fs_1.existsSync)(full))
            (0, fs_1.mkdirSync)(full, { recursive: true });
    }
}
function readJson(relativePath) {
    try {
        const base = getBasePath();
        let full = safeJoin(base, relativePath);
        // Smart path resolution: if base already ends with a segment that matches the
        // first segment of relativePath, avoid doubling (e.g. base=...\knowledge_base + rel=knowledge_base/file.json)
        if (!(0, fs_1.existsSync)(full)) {
            const relParts = relativePath.replace(/\//g, '\\').split('\\');
            const baseLower = base.toLowerCase();
            if (relParts.length > 1 && baseLower.endsWith(relParts[0].toLowerCase())) {
                const shortRel = relParts.slice(1).join('\\');
                const altFull = safeJoin(base, shortRel);
                console.log(`[networkStorage] readJson: "${full}" not found, trying without prefix: "${altFull}"`);
                if ((0, fs_1.existsSync)(altFull)) {
                    full = altFull;
                }
            }
        }
        console.log(`[networkStorage] readJson: "${relativePath}" → "${full}" exists=${(0, fs_1.existsSync)(full)}`);
        if (!(0, fs_1.existsSync)(full)) {
            console.log(`[networkStorage] readJson: file NOT FOUND: ${full}`);
            return null;
        }
        const raw = (0, fs_1.readFileSync)(full, 'utf8');
        console.log(`[networkStorage] readJson: read ${raw.length} chars (${Math.round(raw.length / 1024)} KB) from ${relativePath}`);
        const parsed = JSON.parse(raw);
        console.log(`[networkStorage] readJson: parsed OK, type=${typeof parsed}, isArray=${Array.isArray(parsed)}, keys=${typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).slice(0, 5).join(',') : 'N/A'}`);
        return parsed;
    }
    catch (err) {
        console.error(`[networkStorage] readJson ERROR for "${relativePath}":`, err);
        return null;
    }
}
function writeJson(relativePath, data) {
    try {
        const full = safeJoin(getBasePath(), relativePath);
        const dir = full.substring(0, full.lastIndexOf('\\'));
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        (0, fs_1.writeFileSync)(full, JSON.stringify(data, null, 2), 'utf8');
        return true;
    }
    catch (err) {
        console.error(`[networkStorage] writeJson ERROR for "${relativePath}":`, err);
        return false;
    }
}
function listDir(relativePath) {
    try {
        const full = safeJoin(getBasePath(), relativePath);
        if (!(0, fs_1.existsSync)(full))
            return [];
        return (0, fs_1.readdirSync)(full);
    }
    catch {
        return [];
    }
}
function deleteFile(relativePath) {
    try {
        const full = safeJoin(getBasePath(), relativePath);
        if ((0, fs_1.existsSync)(full))
            (0, fs_1.unlinkSync)(full);
    }
    catch { /* ignore */ }
}
function fileExists(relativePath) {
    try {
        return (0, fs_1.existsSync)(safeJoin(getBasePath(), relativePath));
    }
    catch {
        return false;
    }
}
function writeRawFile(relativePath, base64Data) {
    try {
        const full = safeJoin(getBasePath(), relativePath);
        const dir = full.substring(0, full.lastIndexOf('\\'));
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        (0, fs_1.writeFileSync)(full, Buffer.from(base64Data, 'base64'));
        return true;
    }
    catch {
        return false;
    }
}
function readRawFile(relativePath) {
    try {
        const full = safeJoin(getBasePath(), relativePath);
        if (!(0, fs_1.existsSync)(full))
            return null;
        return (0, fs_1.readFileSync)(full).toString('base64');
    }
    catch {
        return null;
    }
}
