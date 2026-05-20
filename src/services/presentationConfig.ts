// ── Presentation Mode Config Service ──────────────────────────────────────────
// Slides for the hall display can be persisted in two places:
//   - central: network share via netWriteJson, visible to all admins
//   - local:   electron-store, only on this machine (overrides central when set)
//
// loadConfig() prefers local if present (so a user testing privately keeps their
// draft), otherwise falls back to central. Each save target has its own function.

import { api } from '../electronAPI'

export interface Slide {
  id: string
  title: string
  url: string
  durationSec: number
  zoom: number               // 0.5 .. 2.0 (Electron webview zoom factor)
  refreshIntervalSec: number // 0 = no refresh
  active: boolean
}

export interface PresentationConfig {
  version: number
  lastModified: string
  modifiedBy: string
  slides: Slide[]
  loop: boolean
  transitionMs: number       // crossfade duration between slides
}

export type StorageMode = 'central' | 'local'

const CONFIG_PATH = 'config/presentation/slides.json'
const LOCAL_STORE_KEY = 'presentationConfigLocal'

export function makeEmptyConfig(): PresentationConfig {
  return {
    version: 1,
    lastModified: '',
    modifiedBy: '',
    slides: [],
    loop: true,
    transitionMs: 600,
  }
}

export function makeNewSlide(): Slide {
  return {
    id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    url: '',
    durationSec: 60,
    zoom: 1.0,
    refreshIntervalSec: 0,
    active: true,
  }
}

function normalize(raw: unknown): PresentationConfig {
  const data = raw as Partial<PresentationConfig> | null
  if (!data || !Array.isArray(data.slides)) return makeEmptyConfig()
  return {
    version: data.version ?? 1,
    lastModified: data.lastModified ?? '',
    modifiedBy: data.modifiedBy ?? '',
    slides: data.slides.map(s => ({
      id: s.id,
      title: s.title ?? '',
      url: s.url ?? '',
      durationSec: Number(s.durationSec) || 60,
      zoom: Number(s.zoom) || 1.0,
      refreshIntervalSec: Number(s.refreshIntervalSec) || 0,
      active: s.active !== false,
    })),
    loop: data.loop !== false,
    transitionMs: Number(data.transitionMs) || 600,
  }
}

// ── Loaders ───────────────────────────────────────────────────────────────────

async function loadCentral(): Promise<PresentationConfig | null> {
  try {
    const data = await api().netReadJson<PresentationConfig>(CONFIG_PATH)
    if (!data) return null
    return normalize(data)
  } catch {
    return null
  }
}

async function loadLocal(): Promise<PresentationConfig | null> {
  try {
    const all = await api().getSettings()
    const raw = (all as Record<string, unknown>)[LOCAL_STORE_KEY]
    if (!raw) return null
    return normalize(raw)
  } catch {
    return null
  }
}

export interface LoadResult {
  config: PresentationConfig
  source: StorageMode | 'empty'
}

export async function loadConfig(): Promise<LoadResult> {
  const local = await loadLocal()
  if (local) return { config: local, source: 'local' }
  const central = await loadCentral()
  if (central) return { config: central, source: 'central' }
  return { config: makeEmptyConfig(), source: 'empty' }
}

// Player always reads from the central+local resolution chain — same as the UI.
// Kept as a separate alias for clarity in player code.
export async function loadConfigForPlayer(): Promise<PresentationConfig> {
  const res = await loadConfig()
  return res.config
}

// ── Savers ────────────────────────────────────────────────────────────────────

export interface SaveResult {
  ok: boolean
  error?: string
}

export async function saveCentral(config: PresentationConfig, modifiedBy: string): Promise<SaveResult> {
  const next: PresentationConfig = {
    ...config,
    lastModified: new Date().toISOString(),
    modifiedBy,
  }
  try {
    const ok = await api().netWriteJson(CONFIG_PATH, next)
    if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function saveLocal(config: PresentationConfig, modifiedBy: string): Promise<SaveResult> {
  const next: PresentationConfig = {
    ...config,
    lastModified: new Date().toISOString(),
    modifiedBy,
  }
  try {
    const ok = await api().setSetting(LOCAL_STORE_KEY, next)
    if (!ok) return { ok: false, error: 'Lokale Konfiguration konnte nicht geschrieben werden.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function clearLocal(): Promise<SaveResult> {
  try {
    await api().setSetting(LOCAL_STORE_KEY, null)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
