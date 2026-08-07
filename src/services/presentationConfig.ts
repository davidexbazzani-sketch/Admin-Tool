// ── Presentation Mode Config Service ──────────────────────────────────────────
// Slides for the hall display can be persisted in three places:
//   - local:        electron-store, only on this machine (overrides everything)
//   - per-user:     network share, only visible to one specific Windows user
//                   account (= one kiosk). Lets master-admin push individual
//                   configs to specific hall displays.
//   - central:      network share, fallback for everyone without an override
//
// Resolution order for the player (PresentationPlayer): local → per-user → central → empty
// The editor (PresentationMode) can save explicitly to any of these targets.

import { api } from '../electronAPI'

// Wechsel-Inhalt einer Folie: zusätzliche Website/PDF, die im Rotations-
// Rhythmus die Haupt-URL der Folie ersetzt (z. B. Unterhaltungs-Folien,
// die alle 2 Tage durchgetauscht werden).
export interface SlideVariant {
  id: string
  title: string
  url: string
}

export interface SlideRotation {
  intervalHours: number      // Wechsel-Rhythmus in Stunden (48 = alle 2 Tage)
  anchorIso: string          // Startzeitpunkt (Datum + Uhrzeit, ISO) — ab hier wird gezählt
  variants: SlideVariant[]   // Wechsel-Inhalte; rotiert wird über [Haupt-URL, ...variants]
}

export interface Slide {
  id: string
  title: string
  url: string                // http(s) URL, UNC path (\\server\...) or local path (C:\...)
  durationSec: number
  zoom: number               // 0.5 .. 2.0 (Electron webview zoom factor)
  refreshIntervalSec: number // 0 = no refresh
  active: boolean
  rotation?: SlideRotation   // optional: zeitgesteuerte Wechsel-Inhalte
}

export type SlideMediaType = 'url' | 'image' | 'pdf' | 'unknown'

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|bmp|avif|ico)(\?|#|$)/i
const PDF_EXT_RE = /\.pdf(\?|#|$)/i

// Auto-detect what kind of media a slide URL represents.
//   - 'image'    image/*  (jpg/png/gif/webp/svg/bmp/avif/ico)
//   - 'pdf'      .pdf
//   - 'url'      http(s)://… (also data:, file:// other than the above)
//   - 'unknown'  empty / unparseable
export function detectSlideMediaType(url: string): SlideMediaType {
  const u = url.trim()
  if (!u) return 'unknown'
  if (IMAGE_EXT_RE.test(u)) return 'image'
  if (PDF_EXT_RE.test(u)) return 'pdf'
  if (/^https?:\/\//i.test(u)) return 'url'
  if (/^file:\/\//i.test(u)) return 'url' // arbitrary local site
  if (/^\\\\/.test(u) || /^[a-z]:\\/i.test(u)) {
    // UNC path or drive letter — without an extension match it's ambiguous
    return 'url' // treat as path to an html file or similar; webview will handle
  }
  return 'unknown'
}

// Chromium-PDF-Viewer-Parameter: Toolbar + Seitenleiste ausblenden und die
// Seite in den Bildschirm einpassen — die Folie soll wie Vollbild wirken,
// nicht wie ein PDF-Reader-Fenster. Die Parameter werden beim Speichern fest
// in die Folien-URL geschrieben, damit auch ältere Player-Versionen auf den
// Anzeige-PCs sie anwenden (kein Update der Kiosk-PCs nötig).
const PDF_VIEW_FRAGMENT = 'toolbar=0&navpanes=0&scrollbar=0&view=Fit'

export function withPdfViewParams(url: string): string {
  const u = url.trim()
  if (!u || !PDF_EXT_RE.test(u) || u.includes('#')) return u
  return `${u}#${PDF_VIEW_FRAGMENT}`
}

// Convert a local file path or UNC path into a file:// URL that <webview>/<img>
// can consume. http(s) URLs and existing file:// URLs are returned untouched.
//
// WICHTIG: Der Pfad wird URL-kodiert (encodeURI). Dateinamen enthalten oft
// Leerzeichen oder Umlaute (z. B. "Info Übersicht.html"); ohne Kodierung
// laedt das <webview> die Datei nicht und die Folie bleibt schwarz. encodeURI
// erhaelt Schema und Slashes ("file://", "/") und kodiert nur Sonderzeichen.
export function slideSrcUrl(raw: string): string {
  const s = raw.trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s) || /^file:\/\//i.test(s) || /^data:/i.test(s)) return withPdfViewParams(s)
  // UNC path: \\server\share\path → file://server/share/path
  if (s.startsWith('\\\\')) {
    return withPdfViewParams(encodeURI('file:' + s.replace(/\\/g, '/')))
  }
  // Local path: C:\path\file → file:///C:/path/file
  if (/^[a-z]:\\/i.test(s)) {
    return withPdfViewParams(encodeURI('file:///' + s.replace(/\\/g, '/')))
  }
  return s
}

// Liefert den Dateisystem-Pfad zurueck, wenn die URL auf eine LOKALE/UNC
// HTML-Datei zeigt — sonst null. Das <webview> kann lokale file://-HTML nicht
// zuverlaessig laden (Folie bleibt schwarz); der Player liest solche Dateien
// stattdessen ein und zeigt sie als data:-URL an.
export function localHtmlFsPath(url: string): string | null {
  const s = (url || '').trim()
  if (!s) return null
  if (!/\.html?($|[?#])/i.test(s)) return null
  // UNC (\\server\...) oder Laufwerk (C:\...)
  if (/^\\\\/.test(s) || /^[a-z]:\\/i.test(s)) return s
  // file://-URL zurueck in einen Dateipfad wandeln
  if (/^file:\/\//i.test(s)) {
    try {
      const u = new URL(s)
      const path = decodeURIComponent(u.pathname)
      if (u.host) return `\\\\${u.host}${path.replace(/\//g, '\\')}`   // UNC
      return path.replace(/^\//, '').replace(/\//g, '\\')             // /C:/x → C:\x
    } catch { return null }
  }
  return null  // http(s):// HTML laedt das webview normal
}

// ── Media upload (PDFs/Bilder) ────────────────────────────────────────────────
// Lokale Dateien sind auf anderen PCs nicht erreichbar — der Player dort zeigt
// dann nur Schwarz. Deshalb werden lokal ausgewählte Medien auf den zentralen
// Netzwerk-Speicher kopiert und die Folie referenziert den UNC-Pfad.

const MEDIA_DIR = 'config/presentation/media'

// Lokaler Laufwerkspfad (C:\...) — nur auf diesem PC erreichbar.
// UNC-Pfade (\\server\...) und http(s)-URLs sind für alle erreichbar.
export function isLocalDrivePath(p: string): boolean {
  return /^[a-z]:\\/i.test(p.trim())
}

export async function uploadMediaToShare(localPath: string): Promise<
  { ok: true; uncPath: string } | { ok: false; error: string }
> {
  try {
    const read = await api().readFile(localPath)
    if (!read.success || !read.data) {
      return { ok: false, error: read.error ?? 'Datei konnte nicht gelesen werden' }
    }
    const basename = localPath.split(/[\\/]/).pop() ?? 'datei'
    const safe = basename.replace(/[^a-zA-Z0-9._\-äöüÄÖÜß ]/g, '_')
    const rel = `${MEDIA_DIR}/${Date.now()}_${safe}`
    const ok = await api().netWriteRawFile(rel, read.data)
    if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen' }
    const base = await api().netGetBasePath()
    const uncPath = `${base.replace(/[\\/]+$/, '')}\\${rel.replace(/\//g, '\\')}`
    return { ok: true, uncPath }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

// Whether this slide can actually be played (has a usable target).
export function isPlayableSlide(s: Slide): boolean {
  if (!s.active) return false
  const t = detectSlideMediaType(s.url)
  return t !== 'unknown'
}

// ── Zeitgesteuerte Rotation (Wechsel-Inhalte) ─────────────────────────────────
// Die Auswahl des aktiven Inhalts ist DETERMINISTISCH aus Startzeitpunkt +
// Rhythmus berechnet. Dadurch zeigen alle Player denselben Inhalt und der
// Wechsel passiert auf dem Anzeige-PC selbst — auch wenn der Admin-PC aus ist.
// Pool = [Haupt-URL, Variante 1, Variante 2, ...], Index 0 = Haupt-URL.

export function makeNewVariant(): SlideVariant {
  return {
    id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    url: '',
  }
}

export function activeRotationIndex(slide: Slide, now: Date): number {
  const rot = slide.rotation
  if (!rot || rot.variants.length === 0) return 0
  const anchor = Date.parse(rot.anchorIso)
  if (!Number.isFinite(anchor)) return 0
  const intervalMs = Math.max(1, rot.intervalHours) * 3600_000
  const elapsed = now.getTime() - anchor
  if (elapsed < 0) return 0
  return Math.floor(elapsed / intervalMs) % (rot.variants.length + 1)
}

// Die gerade gültige URL einer Folie (Haupt-URL oder aktive Variante).
export function activeSlideUrl(slide: Slide, now: Date): string {
  const idx = activeRotationIndex(slide, now)
  if (idx === 0 || !slide.rotation) return slide.url
  const variantUrl = slide.rotation.variants[idx - 1]?.url?.trim()
  return variantUrl || slide.url
}

// Zeitpunkt des nächsten Wechsels (null wenn keine Rotation konfiguriert).
export function nextRotationSwitch(slide: Slide, now: Date): Date | null {
  const rot = slide.rotation
  if (!rot || rot.variants.length === 0) return null
  const anchor = Date.parse(rot.anchorIso)
  if (!Number.isFinite(anchor)) return null
  const intervalMs = Math.max(1, rot.intervalHours) * 3600_000
  const elapsed = now.getTime() - anchor
  const steps = elapsed < 0 ? 0 : Math.floor(elapsed / intervalMs) + 1
  return new Date(anchor + steps * intervalMs)
}

export type TransitionType =
  | 'fade'        // simple opacity cross-fade (default — same as before)
  | 'cinematic'   // old zooms out slightly, new slides in from the right
  | 'cube'        // 3D cube rotation
  | 'flip'        // 3D card flip
  | 'circle'      // new slide grows from a circle in the middle
  | 'blur'        // old blurs while fading, new sharpens in from blur

export type StatusBarPosition = 'none' | 'top' | 'bottom'

export interface PresentationConfig {
  version: number
  lastModified: string
  modifiedBy: string
  slides: Slide[]
  loop: boolean
  transitionMs: number              // transition duration between slides
  transitionType?: TransitionType   // default 'fade'
  statusBar?: StatusBarPosition     // default 'none'
  serviceNowAutoLogin?: boolean     // periodisch den ServiceNow "Sitzung abgelaufen"-Dialog wegklicken
}

export type StorageMode = 'central' | 'local' | 'user'

const CONFIG_PATH = 'config/presentation/slides.json'
const LOCAL_STORE_KEY = 'presentationConfigLocal'
// Vorschau-Session: der EXAKTE Editor-Inhalt beim Klick auf "Praesentation
// starten". Wird lokal (electron-store) abgelegt und vom Player mit hoechster
// Prioritaet geladen — so laeuft IMMER genau das, was im Editor steht (auch
// eine brandneue, noch nicht gespeicherte Praesentation).
const PREVIEW_SESSION_KEY = 'presentationPreviewSession'
export const PREVIEW_SESSION_SENTINEL = '__session__'

function userConfigPath(username: string): string {
  const safe = username.toLowerCase().replace(/[^a-z0-9._-]/g, '_')
  return `config/presentation/users/${safe}.json`
}

export function makeEmptyConfig(): PresentationConfig {
  return {
    version: 1,
    lastModified: '',
    modifiedBy: '',
    slides: [],
    loop: true,
    transitionMs: 600,
    transitionType: 'fade',
    statusBar: 'none',
    serviceNowAutoLogin: false,
  }
}

const ALLOWED_TRANSITIONS: ReadonlyArray<TransitionType> = ['fade', 'cinematic', 'cube', 'flip', 'circle', 'blur']
const ALLOWED_STATUSBAR: ReadonlyArray<StatusBarPosition> = ['none', 'top', 'bottom']

function normalizeTransitionType(t: unknown): TransitionType {
  return (typeof t === 'string' && (ALLOWED_TRANSITIONS as ReadonlyArray<string>).includes(t)) ? (t as TransitionType) : 'fade'
}
function normalizeStatusBar(s: unknown): StatusBarPosition {
  return (typeof s === 'string' && (ALLOWED_STATUSBAR as ReadonlyArray<string>).includes(s)) ? (s as StatusBarPosition) : 'none'
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

function normalizeRotation(raw: unknown): SlideRotation | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Partial<SlideRotation>
  if (!Array.isArray(r.variants)) return undefined
  const variants: SlideVariant[] = r.variants
    .filter((v): v is SlideVariant => !!v && typeof v === 'object' && typeof (v as Partial<SlideVariant>).id === 'string')
    .map(v => ({
      id: v.id,
      title: typeof v.title === 'string' ? v.title : '',
      url: typeof v.url === 'string' ? v.url : '',
    }))
  if (variants.length === 0) return undefined
  return {
    intervalHours: Math.max(1, Number(r.intervalHours) || 24),
    anchorIso: typeof r.anchorIso === 'string' ? r.anchorIso : '',
    variants,
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
      rotation: normalizeRotation(s.rotation),
    })),
    loop: data.loop !== false,
    transitionMs: Number(data.transitionMs) || 600,
    transitionType: normalizeTransitionType(data.transitionType),
    statusBar: normalizeStatusBar(data.statusBar),
    serviceNowAutoLogin: data.serviceNowAutoLogin === true,
  }
}

// ── Multi-Playlist container (central storage) ───────────────────────────────
// All central playlists live in ONE file: config/presentation/slides.json.
// The container holds the list + an active-id pointer (= which playlist the
// player should show by default). Per-user and local overrides are still
// single-config and not affected.

export interface Playlist {
  id: string
  name: string
  version: number
  lastModified: string
  modifiedBy: string
  slides: Slide[]
  loop: boolean
  transitionMs: number
  transitionType?: TransitionType
  statusBar?: StatusBarPosition
  serviceNowAutoLogin?: boolean
}

export interface PlaylistsContainer {
  version: 2
  activePlaylistId: string
  playlists: Playlist[]
}

function makePlaylistId(): string {
  return `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function makeDefaultPlaylist(name = 'Standard'): Playlist {
  return { ...makeEmptyConfig(), id: makePlaylistId(), name }
}

// Convert a Playlist into the PresentationConfig shape the rest of the app uses
export function playlistToConfig(p: Playlist): PresentationConfig {
  return {
    version: p.version,
    lastModified: p.lastModified,
    modifiedBy: p.modifiedBy,
    slides: p.slides,
    loop: p.loop,
    transitionMs: p.transitionMs,
    transitionType: p.transitionType,
    statusBar: p.statusBar,
    serviceNowAutoLogin: p.serviceNowAutoLogin,
  }
}

function configToPlaylist(c: PresentationConfig, id: string, name: string): Playlist {
  return { id, name, ...c }
}

function normalizePlaylist(raw: unknown): Playlist | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<Playlist>
  if (!r.id || !r.name) return null
  const cfg = normalize(raw)
  return { id: r.id, name: r.name, ...cfg }
}

function normalizeContainer(raw: unknown): PlaylistsContainer | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<PlaylistsContainer>
  if (r.version !== 2 || !Array.isArray(r.playlists)) return null
  const playlists = r.playlists.map(normalizePlaylist).filter((p): p is Playlist => p !== null)
  if (playlists.length === 0) return null
  const activeId = typeof r.activePlaylistId === 'string' && playlists.some(p => p.id === r.activePlaylistId)
    ? r.activePlaylistId
    : playlists[0].id
  return { version: 2, activePlaylistId: activeId, playlists }
}

// Reads the central playlists file. Auto-migrates from legacy single-config
// (the old slides.json that just held one config) into a container with one
// "Standard" playlist. Returns null only when the file is completely missing.
export async function loadPlaylistsContainer(): Promise<PlaylistsContainer | null> {
  try {
    const data = await api().netReadJson<unknown>(CONFIG_PATH)
    if (!data) return null
    // New format: container with version=2
    const container = normalizeContainer(data)
    if (container) return container
    // Legacy format: single config (version=1, has slides)
    const legacyConfig = normalize(data)
    if (legacyConfig.slides.length > 0 || legacyConfig.lastModified) {
      const migrated: PlaylistsContainer = {
        version: 2,
        activePlaylistId: '',
        playlists: [configToPlaylist(legacyConfig, makePlaylistId(), 'Standard')],
      }
      migrated.activePlaylistId = migrated.playlists[0].id
      return migrated
    }
    return null
  } catch {
    return null
  }
}

async function saveContainer(container: PlaylistsContainer): Promise<SaveResult> {
  try {
    const ok = await api().netWriteJson(CONFIG_PATH, container)
    if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function loadCentral(): Promise<PresentationConfig | null> {
  const r = await loadCentralWithName()
  return r ? r.config : null
}

async function loadCentralWithName(): Promise<{ config: PresentationConfig; name: string } | null> {
  const container = await loadPlaylistsContainer()
  if (!container) return null
  const active = container.playlists.find(p => p.id === container.activePlaylistId)
    ?? container.playlists[0]
  return active ? { config: playlistToConfig(active), name: active.name } : null
}

// Eine bestimmte Playlist direkt laden (fuer die Vorschau aus dem Editor —
// umgeht die lokale/zentrale Aufloesung, damit "Praesentation starten" exakt
// die gerade bearbeitete Playlist zeigt).
export async function loadPlaylistConfigById(id: string): Promise<{ config: PresentationConfig; name: string } | null> {
  const container = await loadPlaylistsContainer()
  if (!container) return null
  const pl = container.playlists.find(p => p.id === id)
  return pl ? { config: playlistToConfig(pl), name: pl.name } : null
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

async function loadUserOverrideFor(username: string): Promise<PresentationConfig | null> {
  if (!username) return null
  try {
    const data = await api().netReadJson<PresentationConfig>(userConfigPath(username))
    if (!data) return null
    return normalize(data)
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

// Player resolution chain — checks a Windows-user-specific override first,
// then the local/central fallback. Used by PresentationPlayer to pick up
// admin-pushed configs for the kiosk account.
export async function loadConfigForPlayer(username?: string): Promise<{
  config: PresentationConfig
  source: StorageMode | 'empty'
  playlistName?: string
}> {
  const local = await loadLocal()
  if (local) return { config: local, source: 'local', playlistName: 'Lokale Konfiguration' }
  if (username) {
    const userCfg = await loadUserOverrideFor(username)
    if (userCfg) return { config: userCfg, source: 'user', playlistName: 'Individuelle Konfiguration' }
  }
  const central = await loadCentralWithName()
  if (central) return { config: central.config, source: 'central', playlistName: central.name }
  return { config: makeEmptyConfig(), source: 'empty' }
}

// Zentrale Aufloesung fuer den Player MIT klarer Prioritaet:
//   1. Per-User-Override  → erlaubt das LIVE-Bearbeiten der laufenden Praesentation
//                           eines bestimmten Kiosks (gewinnt immer, auch ueber
//                           Preview/Lokal — sonst greift "Fuer User speichern" nicht).
//   2. Preview-Playlist   → "Praesentation starten" aus dem Editor.
//   3. Lokale Konfig      → nur auf diesem Rechner.
//   4. Zentrale Playlist  → Standard fuer alle.
export interface ResolvedPlayerConfig {
  config: PresentationConfig
  source: StorageMode | 'empty'
  playlistName?: string
}
export async function resolvePlayerConfig(username?: string, previewPlaylistId?: string): Promise<ResolvedPlayerConfig> {
  // 0. Vorschau-Session (Editor: "Praesentation starten") — zeigt EXAKT den
  //    aktuellen Editor-Inhalt (auch neu/ungespeichert). Hoechste Prioritaet,
  //    auch ueber einem User-Override, weil der Admin bewusst diese Vorschau
  //    auf DIESEM Rechner startet.
  if (previewPlaylistId === PREVIEW_SESSION_SENTINEL) {
    const sess = await loadPreviewSession()
    if (sess) return { config: sess, source: 'local', playlistName: 'Vorschau' }
  }
  // 1. Per-User-Override (Live-Edit eines Kiosks) — hoechste Prioritaet
  if (username) {
    const userCfg = await loadUserOverrideFor(username)
    if (userCfg) return { config: userCfg, source: 'user', playlistName: 'Individuelle Konfiguration' }
  }
  // 2. Preview-Playlist (Editor: "Praesentation starten" fuer eine gespeicherte Playlist)
  if (previewPlaylistId && previewPlaylistId !== PREVIEW_SESSION_SENTINEL) {
    const r = await loadPlaylistConfigById(previewPlaylistId)
    if (r) return { config: r.config, source: 'central', playlistName: r.name }
  }
  // 3. Lokale Konfiguration
  const local = await loadLocal()
  if (local) return { config: local, source: 'local', playlistName: 'Lokale Konfiguration' }
  // 4. Zentrale aktive Playlist
  const central = await loadCentralWithName()
  if (central) return { config: central.config, source: 'central', playlistName: central.name }
  return { config: makeEmptyConfig(), source: 'empty' }
}

// ── User-override loaders (used by the master-admin client editor) ───────────

export async function loadUserOverride(username: string): Promise<PresentationConfig | null> {
  return loadUserOverrideFor(username)
}

export async function listUserOverrides(): Promise<{
  username: string
  lastModified: string
  modifiedBy: string
  slideCount: number
}[]> {
  try {
    const files = await api().netListDir('config/presentation/users')
    if (!Array.isArray(files)) return []
    const out: { username: string; lastModified: string; modifiedBy: string; slideCount: number }[] = []
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue
      try {
        const data = await api().netReadJson<PresentationConfig>(`config/presentation/users/${f}`)
        if (!data) continue
        out.push({
          username: f.replace(/\.json$/i, ''),
          lastModified: data.lastModified ?? '',
          modifiedBy: data.modifiedBy ?? '',
          slideCount: Array.isArray(data.slides) ? data.slides.length : 0,
        })
      } catch { /* skip malformed */ }
    }
    out.sort((a, b) => a.username.localeCompare(b.username, 'de', { sensitivity: 'base' }))
    return out
  } catch {
    return []
  }
}

// ── Savers ────────────────────────────────────────────────────────────────────

export interface SaveResult {
  ok: boolean
  error?: string
}

// PDF-Folien beim Speichern mit den Vollbild-Viewer-Parametern versehen, damit
// auch bereits existierende Folien (und alte Player) sie bekommen.
// Gilt auch für alle Rotations-Varianten.
function withFullscreenPdfSlides(config: PresentationConfig): PresentationConfig {
  return {
    ...config,
    slides: config.slides.map(s => ({
      ...s,
      url: withPdfViewParams(s.url),
      rotation: s.rotation
        ? { ...s.rotation, variants: s.rotation.variants.map(v => ({ ...v, url: withPdfViewParams(v.url) })) }
        : undefined,
    })),
  }
}

// Save central — updates the currently-active playlist within the container.
// If the container does not exist yet (fresh install), creates one with a
// single "Standard" playlist.
export async function saveCentral(rawConfig: PresentationConfig, modifiedBy: string): Promise<SaveResult> {
  const config = withFullscreenPdfSlides(rawConfig)
  const container = (await loadPlaylistsContainer()) ?? {
    version: 2 as const,
    activePlaylistId: '',
    playlists: [makeDefaultPlaylist()],
  }
  if (!container.activePlaylistId) container.activePlaylistId = container.playlists[0].id
  const idx = container.playlists.findIndex(p => p.id === container.activePlaylistId)
  if (idx < 0) {
    // shouldn't happen but be defensive
    container.playlists.push(makeDefaultPlaylist())
    container.activePlaylistId = container.playlists[container.playlists.length - 1].id
  }
  const targetIdx = container.playlists.findIndex(p => p.id === container.activePlaylistId)
  const prev = container.playlists[targetIdx]
  const next: Playlist = {
    ...prev,
    ...config,
    id: prev.id,
    name: prev.name,
    lastModified: new Date().toISOString(),
    modifiedBy,
  }
  container.playlists[targetIdx] = next
  return saveContainer(container)
}

// Save the config explicitly into a specific playlist (used when editor knows
// which playlist it edited — avoids races when active changes mid-edit).
export async function savePlaylist(playlistId: string, rawConfig: PresentationConfig, modifiedBy: string): Promise<SaveResult> {
  const config = withFullscreenPdfSlides(rawConfig)
  const container = await loadPlaylistsContainer()
  if (!container) return { ok: false, error: 'Playlists-Container nicht gefunden' }
  const idx = container.playlists.findIndex(p => p.id === playlistId)
  if (idx < 0) return { ok: false, error: `Playlist '${playlistId}' existiert nicht mehr` }
  container.playlists[idx] = {
    ...container.playlists[idx],
    ...config,
    id: container.playlists[idx].id,
    name: container.playlists[idx].name,
    lastModified: new Date().toISOString(),
    modifiedBy,
  }
  return saveContainer(container)
}

// ── Playlist CRUD ────────────────────────────────────────────────────────────

export async function createPlaylist(name: string, modifiedBy: string, copyFromId?: string): Promise<{ ok: boolean; playlist?: Playlist; error?: string }> {
  const container = (await loadPlaylistsContainer()) ?? {
    version: 2 as const,
    activePlaylistId: '',
    playlists: [],
  }
  const source = copyFromId ? container.playlists.find(p => p.id === copyFromId) : undefined
  const base = source ? playlistToConfig(source) : makeEmptyConfig()
  const playlist: Playlist = {
    ...base,
    id: makePlaylistId(),
    name: name.trim() || 'Neue Playlist',
    lastModified: new Date().toISOString(),
    modifiedBy,
    // For copies: keep slides but reset slide IDs so users can edit independently
    slides: base.slides.map(s => ({ ...s, id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` })),
  }
  container.playlists.push(playlist)
  if (!container.activePlaylistId) container.activePlaylistId = playlist.id
  const res = await saveContainer(container)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, playlist }
}

// Aus einer beliebigen (z. B. gerade auf einem Kiosk bearbeiteten) Konfiguration
// eine neue, zentrale Playlist anlegen — damit sie fuer alle App-Nutzer sichtbar
// wird. Slides bekommen frische IDs, damit sie unabhaengig editierbar sind.
export async function createPlaylistFromConfig(name: string, rawConfig: PresentationConfig, modifiedBy: string): Promise<{ ok: boolean; playlist?: Playlist; error?: string }> {
  const config = withFullscreenPdfSlides(rawConfig)
  const container = (await loadPlaylistsContainer()) ?? {
    version: 2 as const,
    activePlaylistId: '',
    playlists: [],
  }
  const playlist: Playlist = {
    ...config,
    id: makePlaylistId(),
    name: name.trim() || 'Neue Playlist',
    lastModified: new Date().toISOString(),
    modifiedBy,
    slides: config.slides.map(s => ({ ...s, id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` })),
  }
  container.playlists.push(playlist)
  if (!container.activePlaylistId) container.activePlaylistId = playlist.id
  const res = await saveContainer(container)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, playlist }
}

export async function renamePlaylist(id: string, newName: string, modifiedBy: string): Promise<SaveResult> {
  const container = await loadPlaylistsContainer()
  if (!container) return { ok: false, error: 'Playlists-Container nicht gefunden' }
  const idx = container.playlists.findIndex(p => p.id === id)
  if (idx < 0) return { ok: false, error: `Playlist '${id}' existiert nicht` }
  container.playlists[idx] = {
    ...container.playlists[idx],
    name: newName.trim() || container.playlists[idx].name,
    lastModified: new Date().toISOString(),
    modifiedBy,
  }
  return saveContainer(container)
}

export async function deletePlaylist(id: string): Promise<SaveResult> {
  const container = await loadPlaylistsContainer()
  if (!container) return { ok: false, error: 'Playlists-Container nicht gefunden' }
  if (container.playlists.length <= 1) {
    return { ok: false, error: 'Die letzte Playlist kann nicht geloescht werden' }
  }
  container.playlists = container.playlists.filter(p => p.id !== id)
  if (container.activePlaylistId === id) {
    container.activePlaylistId = container.playlists[0].id
  }
  return saveContainer(container)
}

export async function setActivePlaylist(id: string): Promise<SaveResult> {
  const container = await loadPlaylistsContainer()
  if (!container) return { ok: false, error: 'Playlists-Container nicht gefunden' }
  if (!container.playlists.some(p => p.id === id)) {
    return { ok: false, error: `Playlist '${id}' existiert nicht` }
  }
  container.activePlaylistId = id
  return saveContainer(container)
}

export async function saveLocal(config: PresentationConfig, modifiedBy: string): Promise<SaveResult> {
  const next: PresentationConfig = {
    ...withFullscreenPdfSlides(config),
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

// ── Vorschau-Session ("Praesentation starten" aus dem Editor) ─────────────────
// Speichert den aktuellen Editor-Inhalt lokal, damit der Player exakt diese
// Slides zeigt — unabhaengig davon, ob/wo gespeichert wurde.
export async function savePreviewSession(config: PresentationConfig): Promise<void> {
  try { await api().setSetting(PREVIEW_SESSION_KEY, withFullscreenPdfSlides(config)) } catch { /* best effort */ }
}
export async function loadPreviewSession(): Promise<PresentationConfig | null> {
  try {
    const all = await api().getSettings()
    const raw = (all as Record<string, unknown>)[PREVIEW_SESSION_KEY]
    if (!raw) return null
    return normalize(raw)
  } catch {
    return null
  }
}

export async function saveUserOverride(username: string, config: PresentationConfig, modifiedBy: string): Promise<SaveResult> {
  if (!username) return { ok: false, error: 'Kein Benutzername angegeben' }
  const next: PresentationConfig = { ...withFullscreenPdfSlides(config), lastModified: new Date().toISOString(), modifiedBy }
  try {
    const ok = await api().netWriteJson(userConfigPath(username), next)
    if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function clearUserOverride(username: string): Promise<SaveResult> {
  if (!username) return { ok: false, error: 'Kein Benutzername angegeben' }
  try {
    await api().netDeleteFile(userConfigPath(username))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
