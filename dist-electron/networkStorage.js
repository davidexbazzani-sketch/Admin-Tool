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
const fs_1 = require("fs");
const path_1 = require("path");
const electron_store_1 = __importDefault(require("electron-store"));
// ─── Network base path ────────────────────────────────────────────────────────
// Default: SKF Marine network share where all tool data is stored centrally.
// Configurable via electron-store key 'networkBasePath'.
exports.DEFAULT_NETWORK_BASE = '\\\\w3172\\skf Marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT';
const pathStore = new electron_store_1.default({ name: 'network-config' });
function getBasePath() {
    return pathStore.get('networkBasePath') ?? exports.DEFAULT_NETWORK_BASE;
}
function setBasePath(path) {
    pathStore.set('networkBasePath', path);
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
        const full = (0, path_1.join)(base, d);
        if (!(0, fs_1.existsSync)(full))
            (0, fs_1.mkdirSync)(full, { recursive: true });
    }
}
function readJson(relativePath) {
    try {
        const full = (0, path_1.join)(getBasePath(), relativePath);
        if (!(0, fs_1.existsSync)(full))
            return null;
        return JSON.parse((0, fs_1.readFileSync)(full, 'utf8'));
    }
    catch {
        return null;
    }
}
function writeJson(relativePath, data) {
    try {
        const full = (0, path_1.join)(getBasePath(), relativePath);
        const dir = full.substring(0, full.lastIndexOf('\\'));
        if (!(0, fs_1.existsSync)(dir))
            (0, fs_1.mkdirSync)(dir, { recursive: true });
        (0, fs_1.writeFileSync)(full, JSON.stringify(data, null, 2), 'utf8');
        return true;
    }
    catch {
        return false;
    }
}
function listDir(relativePath) {
    try {
        const full = (0, path_1.join)(getBasePath(), relativePath);
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
        const full = (0, path_1.join)(getBasePath(), relativePath);
        if ((0, fs_1.existsSync)(full))
            (0, fs_1.unlinkSync)(full);
    }
    catch { /* ignore */ }
}
function fileExists(relativePath) {
    try {
        return (0, fs_1.existsSync)((0, path_1.join)(getBasePath(), relativePath));
    }
    catch {
        return false;
    }
}
