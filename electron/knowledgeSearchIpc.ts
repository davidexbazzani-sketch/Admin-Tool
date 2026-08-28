// ── Wissenssuche: Bundles laden (Netzlaufwerk zuerst, lokal als Fallback) ─────
// Nutzt die vorhandene networkStorage-Schicht (dieselbe Basis wie alle Tool-Daten)
// statt eigener Pfadlogik. Reihenfolge: 1) \\...\Tool IT\knowledge\ vom Netz,
// 2) lokale Kopie unter app.getPath('userData')/knowledge. Läuft weiter, wenn das
// Laufwerk offline ist (Statusfeld `source` = 'net' | 'local').

import { ipcMain, app } from 'electron'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import * as ns from './networkStorage'

const REL_CORE = 'knowledge/knowledge.core.json'
const REL_SENS = 'knowledge/knowledge.sensitive.json'

function localDir(): string { return join(app.getPath('userData'), 'knowledge') }

function readLocal(name: string): unknown | null {
  try {
    const f = join(localDir(), name)
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'))
  } catch { /* kaputt/fehlt */ }
  return null
}

function builtAtOf(bundle: unknown): string | null {
  const m = (bundle as { meta?: { builtAt?: string } } | null)?.meta
  return m?.builtAt ?? null
}

// Ermittelt das Core-Bundle + Quelle (net/local). Netz zuerst.
async function loadCore(): Promise<{ core: unknown | null; source: 'net' | 'local' | null; dir: string | null }> {
  let core: unknown | null = null
  try { core = await ns.readJson(REL_CORE) } catch { core = null }
  if (core) return { core, source: 'net', dir: `${ns.getBasePath()}\\knowledge` }
  core = readLocal('knowledge.core.json')
  if (core) return { core, source: 'local', dir: localDir() }
  return { core: null, source: null, dir: null }
}

export function registerKnowledgeSearchIpc(): void {
  ipcMain.handle('knowledge:load', async (_e, loadSensitive: boolean = true) => {
    const { core, source, dir } = await loadCore()
    if (!core || !source) {
      return {
        ok: false, dir: null, core: null, sensitive: null, builtAt: null, source: null,
        error: 'Wissensindex nicht gefunden. Erwartet: knowledge.core.json auf dem Netzlaufwerk unter '
          + `${ns.getBasePath()}\\knowledge\\  oder lokal unter ${localDir()}`,
      }
    }
    let sensitive: unknown | null = null
    if (loadSensitive) {
      if (source === 'net') { try { sensitive = await ns.readJson(REL_SENS) } catch { sensitive = null } }
      else sensitive = readLocal('knowledge.sensitive.json')
    }
    return { ok: true, dir, core, sensitive, builtAt: builtAtOf(core), source }
  })

  ipcMain.handle('knowledge:status', async () => {
    const { core, source, dir } = await loadCore()
    if (!core || !source) return { ok: false, dir: null, builtAt: null, source: null }
    return { ok: true, dir, builtAt: builtAtOf(core), source }
  })
}
