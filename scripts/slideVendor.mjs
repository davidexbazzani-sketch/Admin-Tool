// Lädt die Internet-Bibliotheken der HTML-Folien (three.js, GSAP, Weltkarte …) einmalig
// herunter und legt sie unter public/slide-vendor/<host>/<pfad> ab. Der Präsentations-
// Player liefert sie dann lokal aus (electron/slideProtocol.ts → installiereSlideVendor),
// damit Folien auch auf Anzeige-PCs laufen, die das CDN nicht erreichen (Zscaler/Proxy).
//
// Aufruf:  node scripts/slideVendor.mjs [weitere-URL …]
// Relative Importe in JS-Modulen werden rekursiv mitgeladen.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ZIEL = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'slide-vendor')

const START = [
  // SKF_Marine_IT_FlurTV.html
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/EffectComposer.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/RenderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/UnrealBloomPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/ShaderPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/OutputPass.js',
  'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/postprocessing/Pass.js',
  'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json',
  ...process.argv.slice(2),
]

const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g

const gesehen = new Set()
async function lade(url) {
  if (gesehen.has(url)) return
  gesehen.add(url)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const u = new URL(url)
  const datei = join(ZIEL, u.hostname, ...decodeURIComponent(u.pathname).split('/').filter(Boolean))
  await mkdir(dirname(datei), { recursive: true })
  await writeFile(datei, buf)
  console.log('✓', url)
  if (/\.m?js$/.test(u.pathname)) {
    const text = buf.toString('utf8')
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3]
      // Nur relative Pfade folgen — nackte Namen ('three') löst die Importmap der Folie auf.
      if (spec && (spec.startsWith('./') || spec.startsWith('../'))) await lade(new URL(spec, url).toString())
    }
  }
}

for (const url of START) await lade(url)
console.log(`\n${gesehen.size} Dateien unter ${ZIEL}`)
