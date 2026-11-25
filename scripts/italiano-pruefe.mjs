#!/usr/bin/env node
// Parla Italiano — Prüfung der Lerninhalte (src/italiano/inhalt/level-NN.json).
//
//   node scripts/italiano-pruefe.mjs            alle vorhandenen Level prüfen
//   node scripts/italiano-pruefe.mjs 7 8        nur Level 7 und 8 prüfen (Dubletten gegen ALLE vorhandenen)
//   node scripts/italiano-pruefe.mjs --bekannt 9   alle Wörter der Level 1–8 ausgeben (für Autoren)
//   node scripts/italiano-pruefe.mjs --geschichte 9   Nebenfiguren, Schauplätze und offene Fragen der Level 1–8
//
// Fehler = muss behoben werden (Exitcode 1). Hinweis = bitte ansehen.
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORDNER = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'italiano', 'inhalt')
const SPRECHER = ['ben', 'giulia', 'nonna', 'marco', 'sofia', 'luca', 'uomo', 'donna']
const ARTEN = ['n', 'v', 'a', 'p', 'x']

const args = process.argv.slice(2)
const dateien = readdirSync(ORDNER).filter(f => /^level-\d\d\.json$/.test(f)).sort()
const alle = new Map()   // level → Inhalt
const leseFehler = []
for (const f of dateien) {
  const nr = Number(f.slice(6, 8))
  try { alle.set(nr, JSON.parse(readFileSync(join(ORDNER, f), 'utf8'))) }
  catch (e) { leseFehler.push(`${f}: kein gültiges JSON — ${e.message}`) }
}

const ohneArtikel = s => s.replace(/^(il|lo|la|i|gli|le|un|uno|una)\s+/i, '').replace(/^(l'|un'|gl')/i, '')
const norm = s => ohneArtikel(String(s).toLowerCase().trim()).replace(/[?!.,;:«»"]/g, '').replace(/\s+/g, ' ').trim()

if (args[0] === '--bekannt') {
  const bis = Number(args[1]) || 99
  for (const [nr, inhalt] of [...alle].sort((a, b) => a[0] - b[0])) {
    if (nr >= bis) continue
    const w = (inhalt.tage || []).flatMap(t => (t.woerter || []).map(x => x.it))
    console.log(`Level ${nr}: ${w.join(' · ')}`)
  }
  process.exit(0)
}

// Was in der Geschichte schon feststeht (Namen der Nebenfiguren, Schauplätze, offene Fragen) — für Autoren späterer Level
if (args[0] === '--geschichte') {
  const bis = Number(args[1]) || 99
  for (const [nr, inhalt] of [...alle].sort((a, b) => a[0] - b[0])) {
    if (nr >= bis) continue
    const namen = new Set()
    for (const t of inhalt.tage || []) for (const z of t.dialog?.zeilen || []) if (z.als) namen.add(`${z.als} (${z.wer})`)
    console.log(`\nLevel ${nr} — Nebenfiguren: ${[...namen].join(', ') || '–'}`)
    for (const t of inhalt.tage || []) console.log(`  Tag ${t.tag} «${t.dialog?.titel}» · ${t.dialog?.ort} → ${t.dialog?.folge}`)
  }
  process.exit(0)
}

const pruefen = args.length ? args.map(Number).filter(n => alle.has(n)) : [...alle.keys()]
const fehler = [...leseFehler]
const hinweise = []
const F = (wo, text) => fehler.push(`${wo}: ${text}`)
const H = (wo, text) => hinweise.push(`${wo}: ${text}`)

const istText = (x, min = 1) => typeof x === 'string' && x.trim().length >= min
const VOKAL = /^h?[aeiouàèéìíòóùú]/i
const S_IMPURA = /^(s[bcdfglmnpqrtv]|z|gn|ps|pn|x|y[aeiou])/i

function pruefeHygiene(wo, text, italienisch) {
  if (typeof text !== 'string') return
  if (/[‘’‚‛]/.test(text)) F(wo, `typografischer Apostroph — bitte das gerade ' verwenden: „${text.slice(0, 60)}“`)
  if (/\t/.test(text) || / {2,}/.test(text) || text !== text.trim()) F(wo, `überflüssige Leerzeichen/Tabs: „${text.slice(0, 60)}“`)
  if (italienisch && /[äöüßÄÖÜ]/.test(text)) F(wo, `deutsche Buchstaben in italienischem Text: „${text.slice(0, 60)}“`)
  if (italienisch && /[a-zà-ù]'\s+[a-zà-ù]/i.test(text) && /\b(l|un|dell|nell|all|sull|dall|quest|quell|c|d|dov|com|anch|cos|trent|quarant|sessant|vent)'\s/i.test(text)) F(wo, `Leerzeichen nach Apostroph: „${text.slice(0, 60)}“`)
}

function pruefeAuswahl(wo, richtig, falsch, anzahl = 3) {
  if (!istText(richtig)) { F(wo, 'richtige Antwort fehlt'); return }
  if (!Array.isArray(falsch) || falsch.length !== anzahl || !falsch.every(x => istText(x))) { F(wo, `braucht genau ${anzahl} falsche Antworten`); return }
  const alleAntw = [richtig, ...falsch].map(x => x.trim().toLowerCase())
  if (new Set(alleAntw).size !== alleAntw.length) F(wo, `Antworten doppelt: ${[richtig, ...falsch].join(' | ')}`)
  for (const a of [richtig, ...falsch]) if (a.length > 95) H(wo, `Antwort sehr lang (${a.length} Zeichen): „${a.slice(0, 50)}…“`)
}

function pruefeWort(wo, w) {
  if (!w || typeof w !== 'object') { F(wo, 'kein Eintrag'); return }
  for (const k of ['it', 'de', 'aus']) if (!istText(w[k])) F(wo, `Feld „${k}“ fehlt`)
  if (!ARTEN.includes(w.art)) F(wo, `Feld „art“ muss eines von ${ARTEN.join('/')} sein`)
  if (!w.bsp || !istText(w.bsp.it) || !istText(w.bsp.de)) F(wo, 'Beispielsatz (bsp.it / bsp.de) fehlt')
  if (!istText(w.it) || !istText(w.aus)) return
  pruefeHygiene(wo + ' it', w.it, true); pruefeHygiene(wo + ' de', w.de, false)
  pruefeHygiene(wo + ' bsp.it', w.bsp?.it, true); pruefeHygiene(wo + ' bsp.de', w.bsp?.de, false)
  if (w.hinweis !== undefined) { if (!istText(w.hinweis)) F(wo, 'leerer Hinweis'); else if (w.hinweis.length > 140) H(wo, `Hinweis lang (${w.hinweis.length})`) }
  if (w.it.length > 42) H(wo, `„it“ lang (${w.it.length} Zeichen)`)
  if (w.bsp?.it?.length > 85) H(wo, `Beispielsatz lang (${w.bsp.it.length} Zeichen)`)
  // Aussprachehilfe: gleiche Buchstaben wie das Wort, mindestens eine betonte (große) Silbe
  const glatt = s => s.toLowerCase().replace(/[-?!.,…]/g, '').replace(/\s+/g, ' ').trim()
  if (glatt(w.aus) !== glatt(w.it)) F(wo, `Aussprachehilfe passt nicht zum Wort: „${w.it}“ ↔ „${w.aus}“`)
  if (!/[A-ZÀ-Ù]{1,}/.test(w.aus.replace(/^[A-ZÀ-Ù](?=[a-zà-ù])/, ''))) F(wo, `Aussprachehilfe ohne betonte Silbe in Großbuchstaben: „${w.aus}“`)
  // Betonung je Wort: höchstens eine betonte Silbe; endet ein Wort auf einen Akzentvokal (caffè, città), ist die letzte Silbe betont
  const itTeile = w.it.replace(/[?!.,…]/g, '').split(/\s+/), ausTeile = w.aus.replace(/[?!.,…]/g, '').split(/\s+/)
  if (itTeile.length === ausTeile.length) itTeile.forEach((teil, i) => {
    const silben = ausTeile[i].replace(/^[a-zà-ù]+'/i, '').split('-')   // «l'AN-no»: der Artikel vor dem Apostroph zählt nicht mit
    const betont = silben.filter(x => x.length > 0 && x === x.toUpperCase() && /[A-ZÀ-Ù]/.test(x) && (silben.length > 1 || x.length > 1 || /[ÀÈÉÌÒÙ]/.test(x)))
    if (silben.length > 1 && betont.length > 1) H(wo, `Aussprachehilfe mit mehreren betonten Silben in einem Wort: „${w.aus}“`)
    if (/[àèéìòù]$/i.test(teil) && silben.length > 1 && silben[silben.length - 1] !== silben[silben.length - 1].toUpperCase()) F(wo, `Betonung: „${teil}“ endet auf einen Akzent, also ist die LETZTE Silbe betont — „${w.aus}“`)
    if (silben.length > 1 && betont.length === 0 && teil.length > 3 && !/^(per|con|del|della|dello|dei|degli|delle|nel|nella|sul|sulla|alla|allo|agli|alle|dal|dalla|una|uno|gli|che|non|mi|ti|ci|vi|si|lo|la|le|li|un|il|di|da|in|su|tra|fra|ed|ad)$/i.test(teil)) H(wo, `Aussprachehilfe: „${ausTeile[i]}“ ohne betonte Silbe („${w.aus}“)`)
  })
  // Nomen: bestimmter Artikel und Artikelregel
  if (w.art === 'n') {
    const m = /^(il|lo|la|i|gli|le)\s+(.+)$/i.exec(w.it) || /^(l')(.+)$/i.exec(w.it)
    if (!m) F(wo, `Nomen ohne bestimmten Artikel: „${w.it}“`)
    else {
      const art = m[1].toLowerCase(), n = m[2]
      const vokal = VOKAL.test(n), sImp = S_IMPURA.test(n)
      if (art === 'il' && (vokal || sImp)) F(wo, `Artikel: „${w.it}“ — vor Vokal steht l', vor s+Konsonant/z/gn/ps steht lo`)
      if (art === 'lo' && !sImp) F(wo, `Artikel: „${w.it}“ — „lo“ nur vor s+Konsonant, z, gn, ps, x, y`)
      if (art === "l'" && !vokal) F(wo, `Artikel: „${w.it}“ — „l'“ nur vor Vokal`)
      if (art === 'la' && vokal && !/^h/i.test(n)) F(wo, `Artikel: „${w.it}“ — vor Vokal steht l'`)
      if (art === 'i' && (vokal || sImp)) F(wo, `Artikel: „${w.it}“ — vor Vokal oder s+Konsonant/z/gn steht gli`)
      if (art === 'gli' && !vokal && !sImp) F(wo, `Artikel: „${w.it}“ — „gli“ nur vor Vokal oder s+Konsonant/z/gn/ps`)
    }
  }
  // Beispielsatz sollte das Wort enthalten (weicher Abgleich über den Wortstamm)
  const kern = norm(w.it).split(' ').sort((a, b) => b.length - a.length)[0] || ''
  const stamm = kern.length > 5 ? kern.slice(0, kern.length - 3) : kern.slice(0, Math.max(2, kern.length - 1))
  if (stamm && w.bsp?.it && !w.bsp.it.toLowerCase().includes(stamm.toLowerCase())) H(wo, `Beispielsatz enthält das Wort nicht erkennbar: „${w.it}“ ↔ „${w.bsp.it}“`)
}

function pruefeTag(L, t, i) {
  const soll = (L - 1) * 5 + i + 1
  const wo = `Level ${L} Tag ${soll}`
  if (!t || typeof t !== 'object') { F(wo, 'fehlt'); return }
  if (t.tag !== soll) F(wo, `Feld „tag“ ist ${t.tag}, erwartet ${soll}`)
  if (!istText(t.titel, 5)) F(wo, 'Titel fehlt')
  if (!istText(t.ziel, 15) || !/^Danach kannst du /.test(t.ziel || '')) F(wo, 'Ziel muss mit „Danach kannst du “ beginnen')
  // Wörter
  if (!Array.isArray(t.woerter) || t.woerter.length !== 12) F(wo, `braucht genau 12 Wörter (hat ${t.woerter?.length ?? 0})`)
  else t.woerter.forEach((w, k) => pruefeWort(`${wo} Wort ${k + 1}`, w))
  // Grammatik
  const g = t.grammatik
  if (!g || typeof g !== 'object') F(wo, 'Grammatik fehlt')
  else {
    if (!istText(g.titel, 4)) F(wo, 'Grammatik: Titel fehlt')
    if (!istText(g.erklaerung, 120)) F(wo, 'Grammatik: Erklärung fehlt oder ist zu kurz')
    else if (g.erklaerung.length > 800) F(wo, `Grammatik: Erklärung zu lang (${g.erklaerung.length} > 800 Zeichen)`)
    if (g.tabelle !== undefined) {
      const tb = g.tabelle
      if (!tb || !Array.isArray(tb.kopf) || !Array.isArray(tb.zeilen) || !tb.zeilen.length || tb.zeilen.some(z => !Array.isArray(z) || z.length !== tb.kopf.length)) F(wo, 'Grammatik: Tabelle unvollständig (jede Zeile braucht so viele Zellen wie der Kopf)')
      else if (tb.kopf.length > 4 || tb.zeilen.length > 9) H(wo, 'Grammatik: Tabelle groß (höchstens 4 Spalten, 9 Zeilen)')
    }
    if (!Array.isArray(g.beispiele) || g.beispiele.length < 3 || g.beispiele.some(b => !istText(b?.it) || !istText(b?.de))) F(wo, 'Grammatik: mindestens 3 Beispiele (it + de)')
    if (!Array.isArray(g.uebungen) || g.uebungen.length !== 8) F(wo, `Grammatik: braucht genau 8 Übungen (hat ${g.uebungen?.length ?? 0})`)
    else {
      const saetze = new Set()
      g.uebungen.forEach((u, k) => {
        const w2 = `${wo} Grammatik-Übung ${k + 1}`
        if (!istText(u?.satz) || (u.satz.match(/___/g) || []).length !== 1) { F(w2, 'Satz braucht genau eine Lücke „___“'); return }
        if (saetze.has(u.satz)) F(w2, 'Satz doppelt'); saetze.add(u.satz)
        pruefeAuswahl(w2, u.loesung, u.falsch)
        if (!istText(u.de)) F(w2, 'Übersetzung „de“ fehlt')
        pruefeHygiene(w2, u.satz, false)
      })
    }
  }
  // Dialog
  const d = t.dialog
  if (!d || typeof d !== 'object') F(wo, 'Dialog fehlt')
  else {
    if (!istText(d.titel) || !istText(d.ort)) F(wo, 'Dialog: Titel und Ort nötig')
    if (!istText(d.folge, 15) || !/\?\s*$/.test(d.folge || '')) F(wo, 'Dialog: „folge“ muss eine offene Frage auf Deutsch sein (endet mit ?)')
    if (!Array.isArray(d.zeilen) || d.zeilen.length < 6 || d.zeilen.length > 10) F(wo, `Dialog: 6 bis 10 Zeilen (hat ${d.zeilen?.length ?? 0})`)
    else d.zeilen.forEach((z, k) => {
      const w2 = `${wo} Dialog Zeile ${k + 1}`
      if (!SPRECHER.includes(z?.wer)) F(w2, `unbekannter Sprecher „${z?.wer}“ (erlaubt: ${SPRECHER.join(', ')})`)
      if ((z?.wer === 'uomo' || z?.wer === 'donna') && !istText(z.als)) F(w2, 'freie Rolle braucht „als“ (z. B. "Barista")')
      if (!istText(z?.it) || !istText(z?.de)) F(w2, 'it und de nötig')
      else { if (z.it.length > 125) F(w2, `Zeile zu lang (${z.it.length} > 125 Zeichen)`); pruefeHygiene(w2, z.it, true); pruefeHygiene(w2, z.de, false) }
    })
    if (!Array.isArray(d.fragen) || d.fragen.length !== 3) F(wo, 'Dialog: genau 3 Fragen')
    else d.fragen.forEach((q, k) => { if (!istText(q?.frage)) F(`${wo} Dialog Frage ${k + 1}`, 'Frage fehlt'); pruefeAuswahl(`${wo} Dialog Frage ${k + 1}`, q?.richtig, q?.falsch) })
    if (!Array.isArray(d.rollenspiel) || d.rollenspiel.length < 2 || d.rollenspiel.length > 3) F(wo, 'Dialog: 2 oder 3 Rollenspiele')
    else d.rollenspiel.forEach((r, k) => {
      const w2 = `${wo} Rollenspiel ${k + 1}`
      if (!istText(r?.lage, 10) || !istText(r?.de)) F(w2, 'lage und de nötig')
      pruefeAuswahl(w2, r?.richtig, r?.falsch)
      for (const a of [r?.richtig, ...(r?.falsch || [])]) pruefeHygiene(w2, a, true)
    })
  }
  // Wissen
  if (!t.wissen || !istText(t.wissen.titel) || !istText(t.wissen.text, 80)) F(wo, '„wissen“ (titel + text) fehlt')
  else if (t.wissen.text.length > 430) F(wo, `„wissen“ zu lang (${t.wissen.text.length} > 430 Zeichen)`)
}

for (const L of pruefen) {
  const inhalt = alle.get(L)
  if (inhalt.level !== L) F(`Level ${L}`, `Feld „level“ ist ${inhalt.level}`)
  if (!Array.isArray(inhalt.tage) || inhalt.tage.length !== 5) { F(`Level ${L}`, 'braucht genau 5 Lerntage'); continue }
  inhalt.tage.forEach((t, i) => pruefeTag(L, t, i))
  const lt = inhalt.pruefung?.lesetext
  if (!lt || !istText(lt.titel) || !istText(lt.it)) F(`Level ${L}`, 'pruefung.lesetext (titel + it) fehlt')
  else {
    if (lt.it.length < 350 || lt.it.length > 950) F(`Level ${L} Lesetext`, `Länge ${lt.it.length} — erlaubt 350 bis 950 Zeichen`)
    pruefeHygiene(`Level ${L} Lesetext`, lt.it, true)
    if (!Array.isArray(lt.fragen) || lt.fragen.length !== 4) F(`Level ${L} Lesetext`, 'genau 4 Fragen')
    else lt.fragen.forEach((q, k) => { if (!istText(q?.frage)) F(`Level ${L} Lesetext Frage ${k + 1}`, 'Frage fehlt'); pruefeAuswahl(`Level ${L} Lesetext Frage ${k + 1}`, q?.richtig, q?.falsch) })
  }
}

// Dubletten: jedes Wort nur einmal im ganzen Kurs (über ALLE vorhandenen Level)
const gesehen = new Map()   // norm → [{L, tag, it, art}]
for (const [L, inhalt] of [...alle].sort((a, b) => a[0] - b[0])) {
  for (const t of inhalt.tage || []) for (const w of t.woerter || []) {
    if (!istText(w?.it)) continue
    const k = norm(w.it)
    if (!gesehen.has(k)) gesehen.set(k, [])
    gesehen.get(k).push({ L, tag: t.tag, it: w.it, art: w.art })
  }
}
for (const [k, orte] of gesehen) {
  if (orte.length < 2) continue
  if (!orte.some(o => pruefen.includes(o.L))) continue
  const text = `„${k}“ kommt mehrfach als neues Wort vor: ${orte.map(o => `Level ${o.L} Tag ${o.tag} (${o.it})`).join(', ')}`
  if (new Set(orte.map(o => o.art)).size === orte.length) hinweise.push(`Dublette? ${text} — verschiedene Wortarten, bitte prüfen`)
  else fehler.push(`Dublette: ${text} — das spätere Level nimmt ein anderes Wort`)
}

// Namensliste für die Wortkacheln («Satz bauen»): muss zu den Inhalten passen, sonst steht ein Name klein auf der Kachel
try {
  const { sammleNamen, dateiText, ZIELDATEI } = await import('./italiano-namen.mjs')
  let ist = ''
  try { ist = readFileSync(ZIELDATEI, 'utf8') } catch { /* fehlt */ }
  if (ist.replace(/\r\n/g, '\n') !== dateiText(sammleNamen().namen)) fehler.push('Die Namensliste src/italiano/kern/eigennamen.ts ist veraltet — bitte „node scripts/italiano-namen.mjs“ ausführen')
} catch (e) { hinweise.push('Namensliste konnte nicht geprüft werden: ' + (e?.message || e)) }

const woerter = [...alle.values()].reduce((s, i) => s + (i.tage || []).reduce((a, t) => a + (t.woerter?.length || 0), 0), 0)
if (hinweise.length) { console.log(`\n${hinweise.length} Hinweis(e):`); for (const h of hinweise) console.log('  · ' + h) }
if (fehler.length) { console.log(`\n${fehler.length} FEHLER:`); for (const f of fehler) console.log('  ✗ ' + f) }
console.log(`\nGeprüft: Level ${pruefen.sort((a, b) => a - b).join(', ') || '–'} · vorhanden ${alle.size} von 24 Leveln · ${woerter} Wörter insgesamt · ${fehler.length} Fehler, ${hinweise.length} Hinweise`)
process.exit(fehler.length ? 1 : 0)
