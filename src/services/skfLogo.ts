// ── SKF Marine logo renderer ──────────────────────────────────────────────────
// Priority:
//   1. If `public/skf-marine-logo.png` exists in the build, use that 1:1.
//   2. Otherwise, draw a canvas fallback (big bold "SKF" + "SKF Marine"
//      caption in SKF blue) so the document always has *some* logo.
//
// The loader is kicked off the first time anyone asks for the logo; the
// result is cached. PDF/Vorschau callers should `await ensureSkfLogo()`
// before they need the data URL, or call `getSkfLogoDataUrl()` after that
// returns (it gives the loaded image if ready, otherwise the canvas fallback).

const SKF_BLUE = '#0066b3'
const LOGO_FILE = './skf-marine-logo.png'
const FALLBACK_ASPECT = 400 / 160

let cached: string | null = null
let cachedAspect: number = FALLBACK_ASPECT
let fileTried = false
let filePromise: Promise<{ url: string; aspect: number } | null> | null = null

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function measureAspect(dataUrl: string): Promise<number> {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const a = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : FALLBACK_ASPECT
      resolve(a)
    }
    img.onerror = () => resolve(FALLBACK_ASPECT)
    img.src = dataUrl
  })
}

async function tryLoadLogoFile(): Promise<{ url: string; aspect: number } | null> {
  try {
    const res = await fetch(LOGO_FILE)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.startsWith('image/')) return null
    const blob = await res.blob()
    const url = await blobToDataUrl(blob)
    const aspect = await measureAspect(url)
    return { url, aspect }
  } catch {
    return null
  }
}

// Asynchronous loader — preferred entry point. Resolves with the data URL +
// intrinsic aspect ratio. Idempotent and cached.
export async function ensureSkfLogo(): Promise<{ url: string; aspect: number }> {
  if (cached) return { url: cached, aspect: cachedAspect }
  if (!fileTried) {
    fileTried = true
    filePromise = tryLoadLogoFile()
  }
  const loaded = await (filePromise ?? Promise.resolve(null))
  if (loaded) {
    cached = loaded.url
    cachedAspect = loaded.aspect
    return loaded
  }
  const url = renderCanvasFallback()
  if (url) cached = url
  cachedAspect = FALLBACK_ASPECT
  return { url, aspect: cachedAspect }
}

// Synchronous accessor — returns the cached data URL if available, otherwise
// the canvas fallback while kicking off the async file load in the background.
export function getSkfLogoDataUrl(): string {
  if (cached) return cached
  if (!fileTried) {
    fileTried = true
    filePromise = tryLoadLogoFile().then(loaded => {
      if (loaded) { cached = loaded.url; cachedAspect = loaded.aspect }
      return loaded
    })
  }
  return renderCanvasFallback()
}

export function getSkfLogoAspect(): number {
  return cachedAspect
}

function renderCanvasFallback(): string {
  // Only cache successful results — if the first attempt failed (e.g. canvas
  // not yet available) we retry on the next call instead of caching ''.
  if (cached) return cached

  try {
    // Hi-DPI render: 2x internal pixels for crispness when scaled down.
    const SCALE = 2
    const W = 400 * SCALE
    const H = 160 * SCALE
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    // ── Big "SKF" — heavy block letters in SKF blue ──────────────────────
    ctx.fillStyle = SKF_BLUE
    ctx.font = `900 ${110 * SCALE}px "Arial Black", "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    // Slight horizontal stretch to mimic the wide stance of the real logo
    ctx.save()
    ctx.translate(W / 2, 55 * SCALE)
    ctx.scale(1.15, 1)
    ctx.fillText('SKF', 0, 0)
    ctx.restore()

    // ── "SKF Marine" caption ─────────────────────────────────────────────
    ctx.fillStyle = SKF_BLUE
    ctx.font = `500 ${40 * SCALE}px "Helvetica Neue", Arial, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('SKF Marine', W / 2, 125 * SCALE)

    const url = canvas.toDataURL('image/png')
    if (url && url.startsWith('data:image/png')) cached = url
    return url
  } catch {
    return ''
  }
}

// Approximate intrinsic aspect ratio (width / height) of the rendered logo,
// for callers that need to fit it into a box.
export const SKF_LOGO_ASPECT = 400 / 160
