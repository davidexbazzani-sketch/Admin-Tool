import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import Store from 'electron-store'

// ─── Network base path ────────────────────────────────────────────────────────
// Default: SKF Marine network share where all tool data is stored centrally.
// Configurable via electron-store key 'networkBasePath'.
export const DEFAULT_NETWORK_BASE = '\\\\w3172\\skf Marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT'

const pathStore = new Store({ name: 'network-config' })

export function getBasePath(): string {
  return (pathStore.get('networkBasePath') as string | undefined) ?? DEFAULT_NETWORK_BASE
}

export function setBasePath(path: string): void {
  pathStore.set('networkBasePath', path)
}

// Sub-directories the tool creates on first run
const SUBDIRS = ['users', 'recovery', 'logs', 'config', 'templates', 'inventory', 'approvals', 'scheduled_tasks', 'bugs']

export function isNetworkAvailable(): boolean {
  try { return existsSync(getBasePath()) } catch { return false }
}

export function ensureDirs(): void {
  const base = getBasePath()
  if (!existsSync(base)) return
  for (const d of SUBDIRS) {
    const full = join(base, d)
    if (!existsSync(full)) mkdirSync(full, { recursive: true })
  }
}

export function readJson<T>(relativePath: string): T | null {
  try {
    const full = join(getBasePath(), relativePath)
    if (!existsSync(full)) return null
    return JSON.parse(readFileSync(full, 'utf8')) as T
  } catch { return null }
}

export function writeJson(relativePath: string, data: unknown): boolean {
  try {
    const full = join(getBasePath(), relativePath)
    const dir = full.substring(0, full.lastIndexOf('\\'))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(full, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch { return false }
}

export function listDir(relativePath: string): string[] {
  try {
    const full = join(getBasePath(), relativePath)
    if (!existsSync(full)) return []
    return readdirSync(full)
  } catch { return [] }
}

export function deleteFile(relativePath: string): void {
  try {
    const full = join(getBasePath(), relativePath)
    if (existsSync(full)) unlinkSync(full)
  } catch { /* ignore */ }
}

export function fileExists(relativePath: string): boolean {
  try { return existsSync(join(getBasePath(), relativePath)) } catch { return false }
}
