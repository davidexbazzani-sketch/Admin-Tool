#!/usr/bin/env node
// Der Coach — Inhaltsverzeichnis erzeugen: src/coach/inhalt/_index.json (läuft nur beim Erstellen, nicht im Tool).
//
//   node scripts/coach-index.mjs            Verzeichnis neu schreiben
//   node scripts/coach-index.mjs --pruefe   nur prüfen, ob es aktuell ist (Exitcode 1, wenn nicht)
//
// Das Verzeichnis enthält, was der Planer über die Inhalte wissen muss (Kursplan, Fähigkeit, Stufe, Merkmale, Datei),
// aber keine Texte. Nach jeder Änderung an den Inhalten ausführen; scripts/coach-pruefe.mjs meldet ein veraltetes
// Verzeichnis als Fehler.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
export const INHALT = join(WURZEL, 'src', 'coach', 'inhalt')
const ZIEL = join(INHALT, '_index.json')

function alleDateien(ordner) {
  const aus = []
  for (const n of readdirSync(ordner).sort()) {
    const p = join(ordner, n)
    if (statSync(p).isDirectory()) aus.push(...alleDateien(p))
    else if (n.endsWith('.json') && !n.startsWith('_')) aus.push(p)
  }
  return aus
}
const rel = p => relative(INHALT, p).replace(/\\/g, '/')
export const lies = p => JSON.parse(readFileSync(p, 'utf8'))

export function baueIndex() {
  const stamm = lies(join(INHALT, 'bereiche.json'))
  const idx = { iv: stamm.iv ?? 1, bereiche: stamm.bereiche, schwerpunkte: stamm.schwerpunkte, kurse: {}, einheiten: {}, vorrat: {}, lagen: {}, missionen: {}, merkkarten: {}, wissen: {}, tests: {} }
  for (const p of alleDateien(INHALT)) {
    const d = rel(p)
    const j = lies(p)
    if (Array.isArray(j.kurse)) for (const k of j.kurse) idx.kurse[k.kurs] = k.tage
    if (Array.isArray(j.einheiten)) for (const e of j.einheiten) {
      const kurs = e.schwerpunkt ? `${e.bereich}/${e.schwerpunkt}` : e.bereich
      const laut = e.schritte.some(s => s.kopf?.laut)
      idx.einheiten[e.id] = { kurs, d, f: e.faehigkeiten, mk: e.merkkarten.map(m => m.id), titel: e.titel, dauer: e.dauerMin, ...(e.mission ? { mission: e.mission } : {}), ...(laut ? { laut: 1 } : {}) }
      for (const m of e.merkkarten) idx.merkkarten[m.id] = { e: e.id, d }
    }
    if (Array.isArray(j.eintraege) && /\/vorrat-[nls]?\d+\.json$/.test(d)) for (const v of j.eintraege) {
      const k = v.kopf
      const b = k.faehigkeit.split('.')[0]
      const sp = k.id.match(/^aussprache-([nls])-v/)?.[1]
      idx.vorrat[k.id] = { b, a: v.art, f: k.faehigkeit, s: k.stufe, k: k.kanal, d,
        ...(k.laut ? { laut: 1 } : {}), ...(k.uhr ? { uhr: 1 } : {}), ...(k.leise ? { leise: k.leise } : {}), ...(k.test ? { test: 1 } : {}),
        ...(sp ? { sp: { n: 'nuscheln', l: 'lispeln', s: 'stottern' }[sp] } : {}), ...(v.entfallen ? { entf: 1 } : {}) }
    }
    if (Array.isArray(j.lagen)) for (const l of j.lagen) idx.lagen[l.id] = { b: l.bereich, d, phase: l.phase, titel: l.titel, f: l.faehigkeiten, s: l.stufe, ...(l.sparring ? { sparring: 1 } : {}), ...(l.schwerpunkt ? { sp: l.schwerpunkt } : {}) }
    if (Array.isArray(j.missionen)) for (const m of j.missionen) idx.missionen[m.id] = { b: m.bereich, stufe: m.stufe, titel: m.titel, d, ort: m.ort, ...(m.schwerpunkt ? { sp: m.schwerpunkt } : {}), ...(m.mutprobe ? { mutprobe: 1 } : {}) }
    if (j.eintraege && j.ziel && j.bereich) idx.wissen[j.bereich] = d
    if (Array.isArray(j.szenarien) && j.bereich) idx.tests[j.spur && j.spur !== 'kern' ? `${j.bereich}/${j.spur}` : j.bereich] = d
  }
  return idx
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = JSON.stringify(baueIndex())
  if (process.argv.includes('--pruefe')) {
    const alt = existsSync(ZIEL) ? readFileSync(ZIEL, 'utf8') : ''
    if (alt !== text) { console.error('Das Inhaltsverzeichnis ist veraltet: node scripts/coach-index.mjs'); process.exit(1) }
    console.log('Inhaltsverzeichnis aktuell.')
  } else {
    writeFileSync(ZIEL, text)
    const i = JSON.parse(text)
    console.log(`_index.json: ${Object.keys(i.kurse).length} Kurse, ${Object.keys(i.einheiten).length} Einheiten, ${Object.keys(i.vorrat).length} Vorrats-Einträge, ${Object.keys(i.lagen).length} Lagen, ${Object.keys(i.missionen).length} Missionen · ${(text.length / 1024).toFixed(0)} KB`)
  }
}
