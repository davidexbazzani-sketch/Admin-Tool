// Parla Italiano — Eigennamen des Kurses sammeln (für die Wortkacheln beim „Satz bauen“).
//
// Auf den Kacheln steht der Satzanfang klein, damit der Großbuchstabe nicht verrät, welches Wort vorn steht.
// Groß bleiben muss, was auch mitten im Satz groß geschrieben wird: Namen, Städte, Länder …
// Dieses Skript liest alle Level und schreibt genau diese Wörter nach src/italiano/kern/eigennamen.ts.
//
//   node scripts/italiano-namen.mjs            schreibt die Liste
//   node scripts/italiano-namen.mjs --zeige    zeigt zusätzlich, wie oft jedes Wort groß/klein vorkommt
//
// Nach Änderungen an den Lerninhalten neu ausführen (italiano-pruefe.mjs meldet, wenn die Liste veraltet ist).
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORDNER = join(WURZEL, 'src', 'italiano', 'inhalt')
export const ZIELDATEI = join(WURZEL, 'src', 'italiano', 'kern', 'eigennamen.ts')

// dieselben Regeln wie in src/italiano/kern/antwort.ts
const kern = t => t.replace(/^[«"“„(¿¡.…\-–—]+/, '').replace(/[»"”“).,;:!?…\-–—]+$/, '')
const SATZENDE = /[.!?…]["»”)]?$/
const ZITATBEGINN = /^[«"“„]/
const istGross = w => w[0] !== w[0].toLowerCase()

/**
 * Keine Namen, obwohl sie mitten im Satz groß vorkommen:
 *  • Höflichkeitsformen («La ringrazio», «Come sta Lei?») – am Satzanfang sagt der Großbuchstabe nichts
 *  • Reste aus deutschen Übungssätzen und betonte Silben
 * Von selbst fällt außerdem alles weg, was mehr als dreimal so oft klein wie groß vorkommt («piazza», «mare»,
 * «vecchio»: im Italienischen schreibt man «piazza del Campo», «ponte Vecchio» ohnehin meist klein).
 */
const KEINE_NAMEN = new Set(['La', 'Le', 'Lei', 'Sua', 'Suo', 'Suoi', 'Sue', 'Loro', 'Voi', 'Vi', 'SE', 'Silbe', 'GRA'])
/** die Hauptfiguren – immer dabei */
const FIGUREN = ['Ben', 'Giulia', 'Rosa', 'Marco', 'Sofia', 'Luca']

export function sammleNamen() {
  const gross = new Map(), klein = new Map()
  const lies = (text, mittendrin) => {
    if (typeof text !== 'string') return
    let anfang = !mittendrin
    for (const r of text.replace(/[‘’‛`´]/g, "'").replace(/\s+/g, ' ').trim().split(' ')) {
      const k = kern(r)
      if (k && !anfang && !ZITATBEGINN.test(r)) { const g = istGross(k); const m = g ? gross : klein; const w = g ? k : k.toLowerCase(); m.set(w, (m.get(w) ?? 0) + 1) }
      // nach Doppelpunkt oder Gedankenstrich kann ein neuer Satz beginnen – solche Stellen zählen nicht als Beleg
      anfang = SATZENDE.test(r) || /[:–—]$/.test(r) || (!k && (anfang || /^[–—:]$/.test(r)))
    }
  }
  for (const datei of readdirSync(ORDNER).filter(x => /^level-\d\d\.json$/.test(x)).sort()) {
    const l = JSON.parse(readFileSync(join(ORDNER, datei), 'utf8'))
    for (const t of l.tage) {
      for (const w of t.woerter) { lies(w.it, true); lies(w.bsp?.it, false); for (const a of w.auch ?? []) lies(a, true) }
      for (const b of t.grammatik.beispiele ?? []) lies(b.it, false)
      for (const z of t.dialog.zeilen) lies(z.it, false)
      for (const r of t.dialog.rollenspiel ?? []) { lies(r.richtig, false); for (const f of r.falsch ?? []) lies(f, false) }
    }
    lies(l.pruefung?.lesetext?.it, false)
  }
  const namen = new Set(FIGUREN)
  for (const [w, n] of gross) if (!KEINE_NAMEN.has(w) && w.length > 1 && (klein.get(w.toLowerCase()) ?? 0) <= 3 * n) namen.add(w)
  return { namen: [...namen].sort((a, b) => a.localeCompare(b, 'it')), gross, klein }
}

export const dateiText = namen => `// Erzeugt von scripts/italiano-namen.mjs — nicht von Hand ändern.
// Wörter, die im Kurs auch mitten im Satz groß stehen (Namen, Städte, Länder): Sie bleiben auf den Wortkacheln groß.
export const EIGENNAMEN: readonly string[] = ${JSON.stringify(namen)}
`

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { namen, gross, klein } = sammleNamen()
  writeFileSync(ZIELDATEI, dateiText(namen), 'utf8')
  console.log(`${namen.length} Wörter, die mitten im Satz groß stehen → ${ZIELDATEI}`)
  if (process.argv.includes('--zeige')) {
    const zeilen = namen.map(w => ({ w, g: gross.get(w) ?? 0, k: klein.get(w.toLowerCase()) ?? 0 }))
    console.log('\nauch klein belegt (prüfen!): ' + zeilen.filter(z => z.k > 0).sort((a, b) => b.k - a.k).map(z => `${z.w} groß ${z.g}/klein ${z.k}`).join(' · '))
    console.log('\nnur groß belegt: ' + zeilen.filter(z => z.k === 0).map(z => `${z.w} ${z.g}`).join(' · '))
    const raus = [...gross.keys()].filter(w => !namen.includes(w))
    console.log('\nnicht übernommen: ' + raus.map(w => `${w} groß ${gross.get(w)}/klein ${klein.get(w.toLowerCase()) ?? 0}`).join(' · '))
  }
}
