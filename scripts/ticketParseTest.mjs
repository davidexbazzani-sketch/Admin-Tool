// Test des Ticket-Text-Parsers gegen echte Tickets aus incident (3).xlsx.
// Baut aus jeder Zeile zwei Textblöcke (Label:Wert gleiche Zeile / Label\nWert)
// und prüft, dass group/ci/short/caller korrekt erkannt werden.
import { build } from 'esbuild'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const base = 'resources/Ticket Zuweisung/'
const out = join(tmpdir(), `tp_${process.pid}.mjs`)
await build({ entryPoints: ['src/services/zuweisung/ticketParse.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' })
const { parseTicketText } = await import('file://' + out.replace(/\\/g, '/'))

const optionen = JSON.parse(readFileSync('public/zuweisung/optionen.json', 'utf8'))
const wb = XLSX.read(readFileSync(base + 'incident (3).xlsx'), { type: 'buffer' })
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' })

const stripHtml = s => String(s).replace(/<[^>]+>/g, ' ').replace(/&#34;|&quot;/g, '"').replace(/\s+/g, ' ').trim()
const sample = rows.filter(r => r['Assignment group'] && r['Configuration Item'] && r['Caller'] && r['Short description']).slice(0, 60)

let ok = 0, fail = 0
const fails = []
for (const r of sample) {
  const group = r['Assignment group'], ci = r['Configuration Item'], sub = r['Subcategory'] || '', caller = r['Caller'], short = r['Short description']
  const desc = stripHtml(r['Description HTML'] || '')
  const blockA = `Number: ${r.Number}\nAssignment group: ${group}\nConfiguration Item: ${ci}\nSubcategory: ${sub}\nCaller: ${caller}\nShort description: ${short}\nDescription: ${desc}`
  const blockB = `Number\n${r.Number}\nAssignment group\n${group}\nConfiguration Item\n${ci}\nCaller\n${caller}\nShort description\n${short}\nDescription\n${desc}`
  for (const [tag, block] of [['A', blockA], ['B', blockB]]) {
    const p = parseTicketText(block, optionen)
    const good = p.group === group && p.ci === ci && p.caller === caller && (p.short || '').startsWith(short.slice(0, 20))
    if (good) ok++
    else { fail++; if (fails.length < 12) fails.push({ tag, nr: r.Number, exp: { group, ci, caller, short: short.slice(0, 30) }, got: { group: p.group, ci: p.ci, caller: p.caller, short: (p.short || '').slice(0, 30) } }) }
  }
}
console.log(`Parser: ${ok}/${ok + fail} Felder korrekt (${sample.length} Tickets × 2 Layouts)`)
for (const f of fails) console.log('  FAIL', JSON.stringify(f))
process.exit(fail ? 1 : 0)
