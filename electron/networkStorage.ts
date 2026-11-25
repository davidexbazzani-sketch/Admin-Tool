import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, promises as fsp } from 'fs'
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
const SUBDIRS = ['users', 'recovery', 'logs', 'config', 'templates', 'inventory', 'approvals', 'scheduled_tasks', 'bugs', 'backups']

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

// ── Asynchrone Varianten (Chat u. a. häufige Abfragen) ────────────────────────
// Die obigen Funktionen arbeiten synchron und halten den Hauptprozess an, solange das
// Netzlaufwerk antwortet. Für alles, was regelmäßig im Hintergrund läuft, diese nehmen.
// Ohne Log je Aufruf (safeJoin protokolliert sonst jeden Takt).
function joinQuiet(relative: string): string {
  return getBasePath().replace(/\//g, '\\').replace(/\\+$/, '') + '\\' + relative.replace(/\//g, '\\').replace(/^\\+/, '')
}

export async function listDirAsync(relativePath: string): Promise<string[]> {
  try { return await fsp.readdir(joinQuiet(relativePath)) } catch { return [] }
}

export async function readJsonAsync<T>(relativePath: string): Promise<T | null> {
  try { return JSON.parse(await fsp.readFile(joinQuiet(relativePath), 'utf8')) as T } catch { return null }
}

/** Schreibt erst in eine Hilfsdatei und benennt dann um — Leser sehen nie eine halbe Datei. */
export async function writeJsonAsync(relativePath: string, data: unknown): Promise<boolean> {
  const full = joinQuiet(relativePath)
  const tmp = `${full}.${process.pid}.${Date.now()}.tmp`
  try {
    await fsp.mkdir(full.substring(0, full.lastIndexOf('\\')), { recursive: true })
    await fsp.writeFile(tmp, JSON.stringify(data), 'utf8')
    await fsp.rename(tmp, full)
    return true
  } catch (err) {
    try { await fsp.unlink(tmp) } catch { /* schon weg */ }
    console.error(`[networkStorage] writeJsonAsync ERROR for "${relativePath}":`, err)
    return false
  }
}

export async function deleteFileAsync(relativePath: string): Promise<boolean> {
  try { await fsp.unlink(joinQuiet(relativePath)); return true } catch { return false }
}

/** Legt eine Datei nur an, wenn es sie noch nicht gibt — der Dateiserver entscheidet, wer zuerst war
 *  (Terra Incognita: Erstentdecker). 'ok' = angelegt, 'vorhanden' = gab es schon, 'fehler' = nicht möglich.
 *  Weg 1: Hilfsdatei schreiben und per festem Verweis (Hardlink) unter dem Zielnamen sichtbar machen —
 *  das Ziel entsteht in einem Schritt mit vollständigem Inhalt. Weg 2 (kann der Server keine Verweise):
 *  exklusiv öffnen ('wx') und schreiben. */
export async function createExclusiveAsync(relativePath: string, data: unknown): Promise<'ok' | 'vorhanden' | 'fehler'> {
  const full = joinQuiet(relativePath)
  const tmp = `${full}.${process.pid}.${Date.now()}.${Math.floor(Math.random() * 1e6)}.tmp`
  const text = JSON.stringify(data)
  try {
    await fsp.mkdir(full.substring(0, full.lastIndexOf('\\')), { recursive: true })
  } catch { return 'fehler' }
  try {
    await fsp.writeFile(tmp, text, 'utf8')
    try {
      await fsp.link(tmp, full)
      return 'ok'
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'EEXIST') return 'vorhanden'
      // Verweise nicht unterstützt → Weg 2
    } finally {
      try { await fsp.unlink(tmp) } catch { /* schon weg */ }
    }
  } catch { /* Hilfsdatei ließ sich nicht schreiben → Weg 2 versucht es direkt */ }
  let fh: Awaited<ReturnType<typeof fsp.open>> | null = null
  try {
    fh = await fsp.open(full, 'wx')
    await fh.writeFile(text, 'utf8')
    return 'ok'
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST' && !fh) return 'vorhanden'
    // angelegt, aber nicht beschrieben → wieder entfernen, sonst bliebe eine leere Datei als „vergeben“ zurück
    if (fh) { try { await fh.close() } catch { /* egal */ } fh = null; try { await fsp.unlink(full) } catch { /* egal */ } }
    return 'fehler'
  } finally {
    if (fh) { try { await fh.close() } catch { /* egal */ } }
  }
}

/** Liest JSON und sagt dazu, WARUM nichts kam: 'fehlt' (Datei gibt es sicher nicht), 'kaputt' (nicht lesbar
 *  als JSON) oder 'fehler' (Laufwerk nicht erreichbar o. Ä.). readJsonAsync liefert in allen drei Fällen null. */
export async function readJsonStatusAsync(relativePath: string): Promise<{ status: 'ok' | 'fehlt' | 'kaputt' | 'fehler'; daten?: unknown }> {
  let text: string
  try { text = await fsp.readFile(joinQuiet(relativePath), 'utf8') }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return { status: 'fehler' }
    // ENOENT kommt auch, wenn das Laufwerk selbst nicht antwortet → „fehlt“ nur, wenn die Wurzel erreichbar ist
    try { await fsp.access(getBasePath().replace(/\//g, '\\').replace(/\\+$/, '')) } catch { return { status: 'fehler' } }
    return { status: 'fehlt' }
  }
  try { return { status: 'ok', daten: JSON.parse(text) } } catch { return { status: 'kaputt' } }
}

/** Wie listDirAsync, sagt aber, ob das Verzeichnis wirklich leer ist (oder fehlt) — oder ob das Laufwerk nicht
 *  antwortet (Terra Incognita: „keine Berichte“ darf nie aus einem Laufwerksfehler entstehen). */
export async function listDirStatusAsync(relativePath: string): Promise<{ ok: boolean; namen: string[] }> {
  try { return { ok: true, namen: await fsp.readdir(joinQuiet(relativePath)) } }
  catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return { ok: false, namen: [] }
    // ENOENT kommt auch, wenn das Laufwerk selbst nicht antwortet → „leer“ nur, wenn die Wurzel erreichbar ist
    try { await fsp.access(getBasePath().replace(/\//g, '\\').replace(/\\+$/, '')) } catch { return { ok: false, namen: [] } }
    return { ok: true, namen: [] }
  }
}

/** Ein LEERES Verzeichnis entfernen (rmdir: Liegt noch etwas darin, bleibt es stehen). */
export async function deleteEmptyDirAsync(relativePath: string): Promise<boolean> {
  try { await fsp.rmdir(joinQuiet(relativePath)); return true } catch { return false }
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

/**
 * Eine LOKALE Datei aufs Netzlaufwerk kopieren — asynchron und ohne sie in den Speicher zu
 * laden (für große Dateien wie Videos; writeRawFile schickt alles als Base64 durch die IPC).
 * Kopiert erst in „<ziel>.part" und benennt danach um, damit ein Anzeige-PC nie eine halbe
 * Datei abspielt. Nie überschreiben: der Zielname ist neu (Zeitstempel im Namen).
 */
export async function copyLocalFileAsync(localPath: string, relativePath: string): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  try {
    if (/(^|[\\/])\.\.([\\/]|$)/.test(relativePath)) return { ok: false, error: 'Ungültiger Zielpfad' }
    const full = safeJoin(getBasePath(), relativePath)
    const dir = full.substring(0, full.lastIndexOf('\\'))
    await fsp.mkdir(dir, { recursive: true })
    const st = await fsp.stat(localPath)
    if (!st.isFile()) return { ok: false, error: 'Keine Datei: ' + localPath }
    const teil = full + '.part'
    await fsp.copyFile(localPath, teil)
    const kopie = await fsp.stat(teil)
    if (kopie.size !== st.size) { await fsp.unlink(teil).catch(() => {}); return { ok: false, error: `Kopie unvollständig (${kopie.size} von ${st.size} Bytes)` } }
    await fsp.rename(teil, full)
    return { ok: true, bytes: st.size }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function readRawFile(relativePath: string): string | null {
  try {
    const full = safeJoin(getBasePath(), relativePath)
    if (!existsSync(full)) return null
    return readFileSync(full).toString('base64')
  } catch { return null }
}
