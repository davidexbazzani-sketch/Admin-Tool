// ── HTML-Folien vollständig machen ──────────────────────────────────────────
//
// Eine HTML-Folie wird im Player als `<iframe srcDoc>` angezeigt, weil Chromium
// `file://` im Top-Level eines <webview>/<iframe> blockiert (die Folie bliebe schwarz).
// `srcDoc` hat aber KEINE Basis-Adresse: `<img src="bilder/logo.png">` zeigt ins Leere.
// Genau deshalb sah eine HTML-Seite mit Bildern oder eigener CSS-Datei kaputt aus.
//
// Lösung: die verwiesenen Dateien einmal einlesen und als `data:`-URI fest in die Seite
// schreiben. Danach ist die Folie in sich vollständig und braucht kein Dateisystem mehr.
//
// Grenzen, die bewusst bleiben (und beim Hinzufügen angezeigt werden):
//   · Was das JavaScript der Seite erst zur Laufzeit nachlädt, kann hier niemand sehen.
//   · Verweise auf http(s) bleiben, wie sie sind — die lädt der Anzeige-PC selbst.
//
// Dieses Modul rechnet nur; das Lesen der Dateien wird hereingereicht, damit die
// Ersetzung ohne Netzlaufwerk prüfbar ist.

/** Dateiendung → MIME-Typ für die data:-URI. */
const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  ico: 'image/x-icon', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', eot: 'application/vnd.ms-fontobject',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav',
  json: 'application/json', pdf: 'application/pdf',
}

export function mimeFuer(pfad: string): string {
  const ext = (pfad.split(/[?#]/)[0].split('.').pop() || '').toLowerCase()
  return MIME[ext] || 'application/octet-stream'
}

/**
 * Ist das ein Verweis auf eine Datei NEBEN der HTML — also etwas, das eingebettet
 * werden muss? Alles mit Schema (http:, data:, mailto: …), Protokoll-relative
 * Adressen und reine Anker (#…) bleiben unangetastet.
 */
export function istLokalerVerweis(ref: string): boolean {
  const r = (ref || '').trim()
  if (!r) return false
  if (r.startsWith('#')) return false
  if (r.startsWith('//')) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(r)) return false   // http:, data:, file:, mailto:, javascript:
  return true
}

/** Verzeichnis einer Datei — funktioniert für UNC (\\srv\…) und Laufwerke (C:\…). */
export function ordnerVon(pfad: string): string {
  const p = (pfad || '').replace(/\//g, '\\')
  const i = p.lastIndexOf('\\')
  return i >= 0 ? p.slice(0, i) : ''
}

/**
 * Relativen Verweis auf einen Dateipfad auflösen. `..` und `.` werden aufgelöst,
 * Query und Anker abgeschnitten (`bild.png?v=2` ist dieselbe Datei).
 *
 * Verweise, die aus dem Ordner der HTML-Datei HERAUSFÜHREN, werden abgelehnt
 * (`null`): eine Folie soll nicht beliebige Pfade des Netzlaufwerks einsammeln können.
 */
export function loeseVerweisAuf(htmlPfad: string, ref: string): string | null {
  const basis = ordnerVon(htmlPfad)
  if (!basis) return null
  const sauber = (ref || '').split(/[?#]/)[0].replace(/\//g, '\\').trim()
  if (!sauber) return null
  if (/^[a-z]:\\/i.test(sauber) || sauber.startsWith('\\\\')) return null  // absolute Pfade nicht folgen

  const teile = basis.split('\\')
  const tiefeVorher = teile.length
  for (const t of sauber.split('\\')) {
    if (!t || t === '.') continue
    if (t === '..') { teile.pop(); continue }
    teile.push(t)
  }
  // Aus dem Ordner herausgelaufen?
  const ziel = teile.join('\\')
  if (teile.length < tiefeVorher || !ziel.toLowerCase().startsWith(basis.toLowerCase())) return null
  return ziel
}

// Verweise in HTML und CSS. Absichtlich mit regulären Ausdrücken statt einem Parser:
// die Seiten hier sind Exporte und Dashboards, kein beliebiges Web, und ein Parser
// brächte eine Abhängigkeit und einen zweiten Weg, Dinge falsch zusammenzusetzen.
const ATTR_RE = /\b(src|href|poster|data-src)\s*=\s*("([^"]*)"|'([^']*)')/gi
const CSS_URL_RE = /url\(\s*("([^"]*)"|'([^']*)'|([^)'"]+))\s*\)/gi

/** Alle lokalen Verweise einer HTML- oder CSS-Datei (ohne Duplikate, Reihenfolge erhalten). */
export function findeVerweise(inhalt: string): string[] {
  const out: string[] = []
  const add = (v?: string) => {
    const r = (v || '').trim()
    if (r && istLokalerVerweis(r) && !out.includes(r)) out.push(r)
  }
  for (const m of inhalt.matchAll(ATTR_RE)) add(m[3] ?? m[4])
  for (const m of inhalt.matchAll(CSS_URL_RE)) add(m[2] ?? m[3] ?? m[4])
  return out
}

export interface EinbettErgebnis {
  html: string
  /** Verweise, die nicht gelesen werden konnten — werden dem Nutzer gezeigt. */
  fehlend: string[]
  /** Wie viele Dateien eingebettet wurden. */
  eingebettet: number
}

/**
 * Liest eine Datei und gibt sie als Base64 zurück (oder null, wenn sie fehlt).
 * Wird hereingereicht, damit diese Datei ohne Netzlaufwerk prüfbar bleibt.
 */
export type DateiLeser = (pfad: string) => Promise<string | null>

const TEXT_ALS_TEXT = new Set(['css'])

function base64NachText(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
}

/**
 * Alle lokalen Verweise der Seite durch `data:`-URIs ersetzen.
 *
 * CSS-Dateien werden als TEXT eingebettet und selbst noch einmal durchsucht — eine
 * Stylesheet-Datei verweist typischerweise weiter auf Bilder und Schriften. Ohne diesen
 * zweiten Schritt bliebe die halbe Gestaltung leer.
 *
 * `tiefe` begrenzt diese Verschachtelung (CSS in CSS), damit ein Ringbezug nicht ewig läuft.
 */
export async function bettetVerweiseEin(
  html: string, htmlPfad: string, lies: DateiLeser, tiefe = 3,
): Promise<EinbettErgebnis> {
  const fehlend: string[] = []
  let eingebettet = 0
  const cache = new Map<string, string | null>()

  async function ersetze(inhalt: string, pfad: string, rest: number): Promise<string> {
    if (rest <= 0) return inhalt
    const verweise = findeVerweise(inhalt)
    let out = inhalt
    for (const ref of verweise) {
      const ziel = loeseVerweisAuf(pfad, ref)
      if (!ziel) { if (!fehlend.includes(ref)) fehlend.push(ref); continue }

      let ersatz = cache.get(ziel)
      if (ersatz === undefined) {
        const b64 = await lies(ziel).catch(() => null)
        if (b64 === null) {
          ersatz = null
        } else {
          const mime = mimeFuer(ziel)
          if (TEXT_ALS_TEXT.has((ziel.split('.').pop() || '').toLowerCase())) {
            // CSS: erst die darin enthaltenen Verweise auflösen, dann einbetten.
            const css = await ersetze(base64NachText(b64), ziel, rest - 1)
            ersatz = `data:${mime};base64,${btoa(unescape(encodeURIComponent(css)))}`
          } else {
            ersatz = `data:${mime};base64,${b64}`
          }
        }
        cache.set(ziel, ersatz)
      }

      if (ersatz === null) { if (!fehlend.includes(ref)) fehlend.push(ref); continue }
      // Nur exakt diesen Verweis ersetzen (in Anführungszeichen bzw. in url(...)).
      const q = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const vorher = out
      out = out
        .replace(new RegExp(`(["'])${q}\\1`, 'g'), (_m, z) => `${z}${ersatz}${z}`)
        .replace(new RegExp(`url\\(\\s*${q}\\s*\\)`, 'g'), `url(${ersatz})`)
      if (out !== vorher) eingebettet++
    }
    return out
  }

  return { html: await ersetze(html, htmlPfad, tiefe), fehlend, eingebettet }
}
