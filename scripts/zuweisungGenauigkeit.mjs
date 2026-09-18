// Genauigkeits-Beleg: Engine über die historischen Tickets (incident (3).xlsx)
// laufen lassen und die Trefferquote MIT vs. OHNE Description vergleichen.
// Zeigt den Beitrag der Beschreibung. Hinweis: ohne AD-Abteilungsdaten bleibt die
// Abteilungs-Regel (nur APPS) hier inaktiv → echte Quote im Tool ist eher höher.
import { build } from 'esbuild'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const base = 'resources/Ticket Zuweisung/'
const out = join(tmpdir(), `eng_${process.pid}.mjs`)
await build({ entryPoints: ['src/services/zuweisung/engine.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { createEngine } = await import(pathToFileURL(out).href)

const R = JSON.parse(readFileSync(base + 'ZUWEISUNG_Regeln.json', 'utf8'))
const eng = createEngine(R)
const inaktiv = new Set(Object.entries(R.personen).filter(([, v]) => !(v.status || 'aktiv').startsWith('aktiv')).map(([n]) => n))

const wb = XLSX.read(readFileSync(base + 'incident (3).xlsx'), { type: 'buffer' })
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })
const stripHtml = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&#34;|&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

const sel = rows.filter(r => r['Assigned to'] && !inaktiv.has(r['Assigned to']) && r['Assignment group'])

function run(useDesc) {
  let h1 = 0, h2 = 0
  for (const r of sel) {
    const p = eng.zuweisen({ group: r['Assignment group'], ci: r['Configuration Item'], sub: r['Subcategory'], caller: r['Caller'], short: r['Short description'], desc: useDesc ? stripHtml(r['Description HTML']) : '' }, { dept: '' })
    const a = r['Assigned to']
    if (p.primary === a) h1++
    if (p.primary === a || (p.vertretung || []).includes(a)) h2++
  }
  return { h1, h2 }
}
const n = sel.length
const ohne = run(false)
const mit = run(true)
const pct = x => (x * 100 / Math.max(1, n)).toFixed(1)
console.log(`Historische Tickets mit aktivem „Assigned to": n=${n}`)
console.log(`OHNE Description:  Haupt ${pct(ohne.h1)}%   Haupt+Vertretung ${pct(ohne.h2)}%`)
console.log(`MIT  Description:  Haupt ${pct(mit.h1)}%   Haupt+Vertretung ${pct(mit.h2)}%`)
console.log(`Beitrag Description: Haupt +${((mit.h1 - ohne.h1) * 100 / Math.max(1, n)).toFixed(1)} pp,  +Vertretung +${((mit.h2 - ohne.h2) * 100 / Math.max(1, n)).toFixed(1)} pp`)
console.log('(Ohne AD-Abteilungsdaten; Abteilungs-Regel APPS hier inaktiv → im Tool eher höher.)')
