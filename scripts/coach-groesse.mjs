#!/usr/bin/env node
// Der Coach — Größe und Credits messen (läuft nur beim Erstellen, nie im Tool).
//
//   node scripts/coach-groesse.mjs
//
// Baut das Frontend einmal im Speicher (nichts wird nach dist/ geschrieben) und fragt Vite, welche Teilpakete
// Module aus src/coach/ enthalten. Prüft dabei, dass nichts davon im Hauptpaket (Start) landet.
// Dazu: Bilder und Ton unter public/coach/ und die verbrauchten Higgsfield-Credits aus derCoach/credits.json.
// Richtwert 15 MB, Obergrenze 20 MB extra im Setup · Credits: 100, dazu 20 Reserve nur nach Meldung.
import { build } from 'vite'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const RICHTWERT = 15 * 1024 * 1024, GRENZE = 20 * 1024 * 1024
const CREDITS = 100, RESERVE = 20
const istCoach = id => id.replace(/\\/g, '/').includes('/src/coach/')
const mb = n => `${(n / 1024 / 1024).toFixed(2)} MB`
const kb = n => `${(n / 1024).toFixed(0)} KB`

let bundle = null
await build({
  root: WURZEL,
  logLevel: 'error',
  build: { write: false, emptyOutDir: false, reportCompressedSize: false },
  plugins: [{ name: 'coach-groesse', generateBundle(_, b) { bundle = b } }],
})
if (!bundle) { console.error('Kein Bündel erhalten.'); process.exit(1) }

const chunks = Object.values(bundle).filter(c => c.type === 'chunk')
const assets = new Map(Object.values(bundle).filter(c => c.type === 'asset').map(a => [a.fileName, a]))
const groesse = c => Buffer.byteLength(c.code ?? '', 'utf8')
const assetGroesse = a => (typeof a.source === 'string' ? Buffer.byteLength(a.source) : a.source.length)

// Hauptpaket: Einstiege und alles, was sie fest einbinden
const fest = new Set()
const sammle = name => { if (fest.has(name)) return; fest.add(name); for (const i of chunks.find(c => c.fileName === name)?.imports ?? []) sammle(i) }
for (const c of chunks.filter(c => c.isEntry)) sammle(c.fileName)
let fehler = 0
for (const n of fest) {
  const c = chunks.find(x => x.fileName === n)
  const coachIn = (c?.moduleIds ?? []).filter(istCoach)
  if (coachIn.length) { fehler++; console.log(`FEHLER  Hauptpaket ${n} enthält Coach-Module: ${coachIn.slice(0, 3).map(x => x.split('/src/')[1]).join(', ')}`) }
}

// Coach-Teilpakete: reine (nur Coach) und gemischte
let rein = 0, gemischt = 0, css = 0, inhalt = 0, nInhalt = 0
const zeilen = []
for (const c of chunks) {
  const ids = c.moduleIds ?? []
  const coach = ids.filter(istCoach)
  if (!coach.length) continue
  const g = groesse(c)
  // Bibliotheken (lucide, zustand), die nur der Coach nutzt, landen in seinen Teilpaketen – sie zählen zum Coach
  const nurCoach = coach.length === ids.filter(x => !x.startsWith('\0') && !x.includes('node_modules')).length
  if (nurCoach) rein += g; else gemischt += g
  if (coach.every(x => /\/src\/coach\/inhalt\//.test(x.replace(/\\/g, '/')))) { inhalt += g; nInhalt++ }
  for (const f of c.viteMetadata?.importedCss ?? []) { const a = assets.get(f); if (a && nurCoach) css += assetGroesse(a) }
  zeilen.push([g, c.fileName, nurCoach ? '' : ' (gemischt)'])
}
zeilen.sort((a, b) => b[0] - a[0])

// public/coach
const ordnerGroesse = p => !existsSync(p) ? 0 : readdirSync(p).reduce((s, n) => { const q = join(p, n); const st = statSync(q); return s + (st.isDirectory() ? ordnerGroesse(q) : st.size) }, 0)
const bilder = ordnerGroesse(join(WURZEL, 'public', 'coach', 'bilder'))
const ton = ordnerGroesse(join(WURZEL, 'public', 'coach', 'ton'))
const gesamt = rein + css + bilder + ton

console.log('Der Coach – Größe')
console.log(`  Code und Oberfläche   ${mb(rein - inhalt)}`)
console.log(`  Inhalte (${nInhalt} Teilpakete) ${mb(inhalt)}`)
console.log(`  CSS                   ${kb(css)}`)
console.log(`  Bilder                ${mb(bilder)}`)
console.log(`  Ton                   ${mb(ton)}`)
console.log(`  zusammen              ${mb(gesamt)}  (Richtwert ${mb(RICHTWERT)}, Obergrenze ${mb(GRENZE)})`)
if (gemischt) console.log(`  in gemischten Teilpaketen (Pausenraum, App): ${kb(gemischt)}`)
console.log('  größte Teilpakete: ' + zeilen.slice(0, 5).map(([g, n, x]) => `${n} ${kb(g)}${x}`).join(' · '))
if (gesamt > GRENZE) { fehler++; console.log('FEHLER  Obergrenze überschritten') } else if (gesamt > RICHTWERT) console.log('Hinweis Richtwert überschritten')

// Credits
const datei = join(WURZEL, 'derCoach', 'credits.json')
if (existsSync(datei)) {
  const posten = JSON.parse(readFileSync(datei, 'utf8')).posten ?? []
  const summe = posten.reduce((s, p) => s + p.credits, 0)
  console.log(`Higgsfield: ${summe.toFixed(2)} von ${CREDITS} Credits verbraucht (Reserve ${RESERVE} nur nach Meldung) – ${posten.length} Posten`)
  if (summe > CREDITS + RESERVE) { fehler++; console.log('FEHLER  Credit-Rahmen samt Reserve überschritten') } else if (summe > CREDITS) console.log('Hinweis Reserve angebrochen – Davide muss das wissen')
}
process.exit(fehler ? 1 : 0)
