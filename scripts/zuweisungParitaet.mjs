// Paritätstest der Ticket-Zuweisungs-Engine gegen die 303 Referenzfälle.
// Bündelt src/services/zuweisung/engine.ts via esbuild und vergleicht das rohe
// zuweisen()-Ergebnis exakt mit "erwartet" (regel, id, primary, vertretung, pool).
// Aufruf:  node scripts/zuweisungParitaet.mjs
import { build } from 'esbuild'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pathToFileURL } from 'url'

const BASE = 'resources/Ticket Zuweisung/'
const outfile = join(tmpdir(), `zuw_engine_${process.pid}.mjs`)

await build({
  entryPoints: ['src/services/zuweisung/engine.ts'],
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
})
const { createEngine } = await import(pathToFileURL(outfile).href)

const R = JSON.parse(readFileSync(BASE + 'ZUWEISUNG_Regeln.json', 'utf8'))
const T = JSON.parse(readFileSync(BASE + 'ZUWEISUNG_Testfaelle.json', 'utf8'))
const eng = createEngine(R)

const eq = (a, b) => JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
let ok = 0
const fails = []
for (const f of T.faelle) {
  const e = f.eingabe, exp = f.erwartet
  const r = eng.zuweisen(
    { group: e.group, ci: e.ci, sub: e.sub, caller: e.caller, short: e.short, desc: e.desc },
    { dept: f.abteilung_melder },
  )
  const same = r.regel === exp.regel && r.id === exp.id && r.primary === exp.primary
    && eq(r.vertretung, exp.vertretung) && (!('pool' in exp) || r.pool === exp.pool)
  if (same) ok++
  else fails.push({ nr: e.nr, group: e.group, ci: e.ci, sub: e.sub, short: (e.short || '').slice(0, 60),
    erwartet: { regel: exp.regel, id: exp.id, primary: exp.primary, vertretung: exp.vertretung, pool: exp.pool },
    bekommen: { regel: r.regel, id: r.id, primary: r.primary, vertretung: r.vertretung, pool: r.pool } })
}

console.log(`\nParität: ${ok}/${T.faelle.length}` + (ok === T.faelle.length ? '  ✓ ALLE' : `  ✗ ${fails.length} Abweichungen`))
if (eng.regexErrors.length) { console.log(`\nREGEX NICHT KOMPILIERBAR (${eng.regexErrors.length}):`); for (const p of eng.regexErrors) console.log('  ', p.wo, '::', p.muster, '::', p.fehler) }
if (eng.regexFallbacks.length) { console.log(`\nRegex nur mit 'i' statt 'iu' (mögliche Semantik-Differenz, ${eng.regexFallbacks.length}):`); for (const p of eng.regexFallbacks.slice(0, 20)) console.log('  ', p.wo, '::', p.muster) }
if (fails.length) { console.log(`\nErste ${Math.min(fails.length, 40)} Abweichungen:`); for (const x of fails.slice(0, 40)) console.log('  ' + JSON.stringify(x)) }
process.exit(fails.length ? 1 : 0)
