// ── Eigenes Protokoll für HTML-Folien (skfslide://) ─────────────────────────
//
// Warum nicht einfach die Datei anzeigen?
//
// Lokale HTML-Folien liefen bisher als `<iframe srcDoc>`. Dieses Dokument hat die Adresse
// `about:srcdoc` und damit KEINE echte Herkunft. Alles, was eine Herkunft braucht, fällt
// dort aus:
//   · `<script type="importmap">` wird nicht angewendet → `import … from 'three'` scheitert
//     und das ganze Modul-Skript bricht ab (realer Fall: der Flur-TV mit three.js).
//   · Relative Verweise (`bilder/logo.png`) zeigen ins Leere.
//   · Skripte von öffentlichen Servern (CDN) werden blockiert.
//
// `file://` direkt im <webview> ist auch kein Weg — bei UNC-Pfaden verweigert Chromium.
//
// Deshalb ein eigenes Schema: das <webview> lädt `skfslide://…`, der Hauptprozess liefert
// die Datei von der Platte. Für Chromium ist das eine normale, sichere Herkunft; Module,
// Importmaps, WebGL und relative Verweise verhalten sich wie auf einer echten Webseite.
//
// Adressform (das Schema ist `standard`, also `schema://host/pfad`):
//   skfslide://local/C:/Praesentation/seite.html   → C:\Praesentation\seite.html
//   skfslide://unc/server/freigabe/seite.html      → \\server\freigabe\seite.html
//
// SICHERHEIT: Es wird NICHT alles ausgeliefert, was auf der Platte liegt. Nur Dateien
// unterhalb eines Ordners, den der Renderer vorher ausdrücklich freigegeben hat
// (`erlaubeOrdner`, passiert beim Anzeigen einer Folie), und nur mit bekannter,
// anzeigbarer Dateiendung. Eine Folie kann damit nicht beliebige Dateien des Rechners
// in ihre Seite ziehen.

import { protocol, net, session, type Session } from 'electron'
import { existsSync, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { pathToFileURL } from 'url'

export const SLIDE_SCHEME = 'skfslide'

// ── Mitgelieferte Bibliotheken (Offline-Kopie der CDNs) ─────────────────────
//
// HTML-Folien wie der Flur-TV laden three.js, GSAP & Co. aus dem Internet. Erreicht der
// Anzeige-PC das CDN nicht (Zscaler/Proxy, kein Internet), startet die Szene nie und die
// Folie zeigt nur ihr Notfall-Logo. Deshalb liegen die Dateien im Build unter
// `slide-vendor/<host>/<pfad>` (befüllt mit `node scripts/slideVendor.mjs`). Anfragen an
// diese CDNs werden in der Folien-Sitzung auf `skfslide://vendor/<host>/<pfad>` umgeleitet,
// sofern eine lokale Kopie existiert — sonst geht die Anfrage normal ins Internet.

const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com']
let vendorDir = ''

/** Ordner der mitgelieferten Bibliotheken setzen (public/ bzw. dist/slide-vendor). */
export function setzeVendorOrdner(dir: string): void { vendorDir = dir }

/** CDN-Adresse → lokale Datei, oder null wenn keine Kopie vorliegt. */
function vendorDateiFuerCdn(url: string): string | null {
  if (!vendorDir) return null
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== 'https:' || !VENDOR_HOSTS.includes(u.hostname)) return null
  let teile: string[]
  try { teile = decodeURIComponent(u.pathname).split('/').filter(Boolean) } catch { return null }
  if (teile.length === 0 || teile.some(t => t === '..' || t.includes('\\'))) return null
  const datei = join(vendorDir, u.hostname, ...teile)
  try { return existsSync(datei) && statSync(datei).isFile() ? datei : null } catch { return null }
}

const MIME: Record<string, string> = {
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8', css: 'text/css; charset=utf-8',
  wasm: 'application/wasm', svg: 'image/svg+xml', png: 'image/png',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf',
}

/** Lokale Kopie ausliefern — mit CORS-Kopf, weil die Folie eine andere Herkunft hat. */
async function vendorAntwort(url: URL): Promise<Response> {
  let teile: string[]
  try { teile = decodeURIComponent(url.pathname).split('/').filter(Boolean) } catch { return new Response('Ungültig', { status: 400 }) }
  // Erster Teil ist der CDN-Host — die Datei muss über die echte CDN-Adresse auffindbar sein.
  const datei = vendorDateiFuerCdn(`https://${teile.join('/')}`)
  if (!datei) return new Response('Nicht gefunden', { status: 404 })
  try {
    const buf = await readFile(datei)
    const endung = (datei.split('.').pop() || '').toLowerCase()
    return new Response(buf, {
      status: 200,
      headers: { 'Content-Type': MIME[endung] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' },
    })
  } catch {
    return new Response('Lesefehler', { status: 500 })
  }
}

/** CDN-Anfragen einer Sitzung auf die lokale Kopie umleiten (falls vorhanden). */
function installiereVendorUmleitung(ses: Session): void {
  ses.webRequest.onBeforeRequest(
    { urls: VENDOR_HOSTS.map(h => `https://${h}/*`) },
    (details, callback) => {
      const datei = vendorDateiFuerCdn(details.url)
      if (!datei) { callback({}); return }
      const u = new URL(details.url)
      callback({ redirectURL: `${SLIDE_SCHEME}://vendor/${u.hostname}${u.pathname}` })
    },
  )
}

/** Endungen, die als Folieninhalt sinnvoll sind. Alles andere wird abgelehnt. */
const ERLAUBTE_ENDUNGEN = new Set([
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'map',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'ico',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'mp4', 'webm', 'ogv', 'mp3', 'ogg', 'wav', 'm4a',
  'pdf', 'txt', 'csv', 'glb', 'gltf', 'bin', 'hdr', 'ktx2',
])

/** Freigegebene Ordner (klein geschrieben, mit abschließendem Trenner). */
const erlaubteOrdner = new Set<string>()
/** Begrenzt, damit die Liste über Wochen Laufzeit nicht unbegrenzt wächst. */
const MAX_ORDNER = 50

function normOrdner(p: string): string {
  const t = p.trim().replace(/\//g, '\\').replace(/\\+$/, '')
  return t ? t.toLowerCase() + '\\' : ''
}

/**
 * Den Ordner einer HTML-Folie freigeben. Wird vom Renderer aufgerufen, bevor er die
 * Folie anzeigt — nur was hier drinsteht, liefert das Protokoll aus.
 */
export function erlaubeOrdner(htmlPfad: string): void {
  const p = (htmlPfad || '').trim().replace(/\//g, '\\')
  if (!p) return
  const i = p.lastIndexOf('\\')
  if (i < 0) return
  const ordner = normOrdner(p.slice(0, i))
  if (!ordner) return
  if (erlaubteOrdner.has(ordner)) return
  if (erlaubteOrdner.size >= MAX_ORDNER) {
    // Ältesten Eintrag verwerfen (Set behält die Einfügereihenfolge).
    const ersterOrdner = erlaubteOrdner.values().next().value
    if (ersterOrdner) erlaubteOrdner.delete(ersterOrdner)
  }
  erlaubteOrdner.add(ordner)
}

/** Liegt die Datei unterhalb eines freigegebenen Ordners? */
export function istFreigegeben(dateiPfad: string): boolean {
  const p = (dateiPfad || '').toLowerCase().replace(/\//g, '\\')
  for (const o of erlaubteOrdner) if (p.startsWith(o)) return true
  return false
}

/**
 * `skfslide://host/pfad` → Windows-Dateipfad. Gibt null zurück, wenn die Adresse nicht
 * passt oder aus dem freigegebenen Bereich herausführt.
 */
export function pfadAusUrl(url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  if (u.protocol !== `${SLIDE_SCHEME}:`) return null

  // %20 & Co. zurückwandeln; Query und Anker gehören nicht zum Dateinamen.
  let rest: string
  try { rest = decodeURIComponent(u.pathname) } catch { return null }
  rest = rest.replace(/^\/+/, '')
  if (!rest) return null
  // Hochgeschobene Pfade ("..") schon an der Adresse abweisen.
  if (rest.split(/[\\/]/).some(t => t === '..')) return null

  const host = u.hostname.toLowerCase()
  let pfad: string
  if (host === 'local') {
    pfad = rest.replace(/\//g, '\\')
    if (!/^[a-z]:\\/i.test(pfad)) return null
  } else if (host === 'unc') {
    pfad = '\\\\' + rest.replace(/\//g, '\\')
  } else {
    return null
  }

  const endung = (pfad.split('.').pop() || '').toLowerCase()
  if (!ERLAUBTE_ENDUNGEN.has(endung)) return null
  if (!istFreigegeben(pfad)) return null
  return pfad
}

/** Muss VOR `app.whenReady()` laufen, sonst gilt das Schema nicht als sicher. */
export function registriereSlideSchema(): void {
  protocol.registerSchemesAsPrivileged([{
    scheme: SLIDE_SCHEME,
    privileges: {
      standard: true,      // schema://host/pfad — Grundlage für relative Verweise
      secure: true,        // zählt als sichere Herkunft (Module, Importmaps)
      supportFetchAPI: true,
      stream: true,        // Videos/Audio mit Sprungmarken
      corsEnabled: true,
    },
  }])
}

/**
 * Sitzungen (Partitionen), in denen das Schema zusätzlich bedient wird.
 * WICHTIG: `protocol.handle` gilt nur für die Standard-Sitzung — das <webview> des
 * Players läuft aber in `persist:presentation`. Ohne Anmeldung dort ist `skfslide://`
 * unbekannt, das Laden scheitert und der Player fällt auf srcDoc zurück
 * (→ Importmap greift nicht, three.js-Folien wie der Flur-TV bleiben leer).
 */
export const SLIDE_PARTITIONS = ['persist:presentation']

/** Nach `app.whenReady()` aufrufen. */
export function bedieneSlideProtokoll(): void {
  const handler = async (request: Request): Promise<Response> => {
    // Mitgelieferte Bibliotheken: keine Ordner-Freigabe nötig, nur der Vendor-Ordner.
    try {
      const u = new URL(request.url)
      if (u.hostname === 'vendor') return await vendorAntwort(u)
    } catch { /* fällt unten in 403 */ }
    const pfad = pfadAusUrl(request.url)
    if (!pfad) return new Response('Nicht erlaubt', { status: 403 })
    try {
      if (!existsSync(pfad) || !statSync(pfad).isFile()) {
        return new Response('Nicht gefunden', { status: 404 })
      }
      // net.fetch über file:// liefert Streaming und den richtigen Inhaltstyp.
      return await net.fetch(pathToFileURL(pfad).toString())
    } catch {
      return new Response('Lesefehler', { status: 500 })
    }
  }
  protocol.handle(SLIDE_SCHEME, handler)
  for (const partition of SLIDE_PARTITIONS) {
    const ses = session.fromPartition(partition)
    ses.protocol.handle(SLIDE_SCHEME, handler)
    // Nur in der Folien-Sitzung — die App selbst lädt nichts von diesen CDNs.
    installiereVendorUmleitung(ses)
  }
}
