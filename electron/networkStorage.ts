import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'
import Store from 'electron-store'

// ─── Network base path ────────────────────────────────────────────────────────
export const DEFAULT_NETWORK_BASE = '\\\\w3172\\skf Marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT'

const pathStore = new Store({ name: 'network-config' })

export function getBasePath(): string {
  return (pathStore.get('networkBasePath') as string | undefined) ?? DEFAULT_NETWORK_BASE
}

export function setBasePath(path: string): void {
  pathStore.set('networkBasePath', path)
}

// ── Safe UNC path join (path.join can break UNC \\server\share prefix) ────────
function safeJoin(base: string, relative: string): string {
  // Normalize separators
  const b = base.replace(/\//g, '\\').replace(/\\+$/, '')
  const r = relative.replace(/\//g, '\\').replace(/^\\+/, '')
  const full = b + '\\' + r
  // Log for debugging
  console.log(`[networkStorage] safeJoin: "${b}" + "${r}" = "${full}"`)
  return full
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
    const full = safeJoin(base, d)
    if (!existsSync(full)) mkdirSync(full, { recursive: true })
  }
}

export function readJson<T>(relativePath: string): T | null {
  try {
    const base = getBasePath()
    let full = safeJoin(base, relativePath)

    // Smart path resolution: if base already ends with a segment that matches the
    // first segment of relativePath, avoid doubling (e.g. base=...\knowledge_base + rel=knowledge_base/file.json)
    if (!existsSync(full)) {
      const relParts = relativePath.replace(/\//g, '\\').split('\\')
      const baseLower = base.toLowerCase()
      if (relParts.length > 1 && baseLower.endsWith(relParts[0].toLowerCase())) {
        const shortRel = relParts.slice(1).join('\\')
        const altFull = safeJoin(base, shortRel)
        console.log(`[networkStorage] readJson: "${full}" not found, trying without prefix: "${altFull}"`)
        if (existsSync(altFull)) {
          full = altFull
        }
      }
    }

    console.log(`[networkStorage] readJson: "${relativePath}" → "${full}" exists=${existsSync(full)}`)
    if (!existsSync(full)) {
      console.log(`[networkStorage] readJson: file NOT FOUND: ${full}`)
      return null
    }
    const raw = readFileSync(full, 'utf8')
    console.log(`[networkStorage] readJson: read ${raw.length} chars (${Math.round(raw.length/1024)} KB) from ${relativePath}`)
    const parsed = JSON.parse(raw) as T
    console.log(`[networkStorage] readJson: parsed OK, type=${typeof parsed}, isArray=${Array.isArray(parsed)}, keys=${typeof parsed === 'object' && parsed !== null ? Object.keys(parsed as Record<string,unknown>).slice(0,5).join(',') : 'N/A'}`)
    return parsed
  } catch (err) {
    console.error(`[networkStorage] readJson ERROR for "${relativePath}":`, err)
    return null
  }
}

export function writeJson(relativePath: string, data: unknown): boolean {
  try {
    const full = safeJoin(getBasePath(), relativePath)
    const dir = full.substring(0, full.lastIndexOf('\\'))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(full, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error(`[networkStorage] writeJson ERROR for "${relativePath}":`, err)
    return false
  }
}

export function listDir(relativePath: string): string[] {
  try {
    const full = safeJoin(getBasePath(), relativePath)
    if (!existsSync(full)) return []
    return readdirSync(full)
  } catch { return [] }
}

export function deleteFile(relativePath: string): void {
  try {
    const full = safeJoin(getBasePath(), relativePath)
    if (existsSync(full)) unlinkSync(full)
  } catch { /* ignore */ }
}

export function fileExists(relativePath: string): boolean {
  try { return existsSync(safeJoin(getBasePath(), relativePath)) } catch { return false }
}

export function writeRawFile(relativePath: string, base64Data: string): boolean {
  try {
    const full = safeJoin(getBasePath(), relativePath)
    const dir = full.substring(0, full.lastIndexOf('\\'))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(full, Buffer.from(base64Data, 'base64'))
    return true
  } catch { return false }
}

export function readRawFile(relativePath: string): string | null {
  try {
    const full = safeJoin(getBasePath(), relativePath)
    if (!existsSync(full)) return null
    return readFileSync(full).toString('base64')
  } catch { return null }
}
