"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.killAllProcesses = killAllProcesses;
exports.runPowerShell = runPowerShell;
exports.runCmd = runCmd;
const child_process_1 = require("child_process");
// ── Active process registry (for cancel-all support) ─────────────────────────
const activeProcesses = new Set();
function killAllProcesses() {
    for (const proc of activeProcesses) {
        try {
            proc.kill('SIGTERM');
        }
        catch { /* already exited */ }
    }
    activeProcesses.clear();
}
// ── UTF-8 encoding header prepended to every PS command ───────────────────────
// Wrapped in try-catch: [Console]::OutputEncoding can throw when PowerShell runs
// without an attached console (child process of a GUI app like Electron).
const PS_UTF8_HEADER = 'try{[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$OutputEncoding=[System.Text.Encoding]::UTF8}catch{};';
// ── PowerShell runner ─────────────────────────────────────────────────────────
function runPowerShell(command, timeoutMs = 30000) {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const proc = (0, child_process_1.spawn)('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-Command', PS_UTF8_HEADER + command,
        ], {
            windowsHide: true,
        });
        activeProcesses.add(proc);
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
        }, timeoutMs);
        proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
        proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
        proc.on('close', (code) => {
            clearTimeout(timer);
            activeProcesses.delete(proc);
            resolve({
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: code ?? -1,
                timedOut,
            });
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            activeProcesses.delete(proc);
            resolve({
                stdout: '',
                stderr: err.message,
                exitCode: -1,
                timedOut: false,
            });
        });
    });
}
// ── CMD runner ────────────────────────────────────────────────────────────────
function runCmd(command, timeoutMs = 30000) {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const proc = (0, child_process_1.spawn)('cmd', ['/c', command], { windowsHide: true });
        activeProcesses.add(proc);
        const timer = setTimeout(() => {
            timedOut = true;
            proc.kill('SIGTERM');
        }, timeoutMs);
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            clearTimeout(timer);
            activeProcesses.delete(proc);
            resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? -1, timedOut });
        });
        proc.on('error', (err) => {
            clearTimeout(timer);
            activeProcesses.delete(proc);
            resolve({ stdout: '', stderr: err.message, exitCode: -1, timedOut: false });
        });
    });
}
