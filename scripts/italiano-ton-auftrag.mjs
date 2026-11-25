#!/usr/bin/env node
// Parla Italiano — Aufträge für die Sprachausgabe eines Levels zusammenstellen (ElevenLabs v4 über Higgsfield).
//
//   node scripts/italiano-ton-auftrag.mjs <Level>            die 10 Aufträge des Levels als JSON (für generate_audio_batch)
//   node scripts/italiano-ton-auftrag.mjs --umfang           Zeichenzahl und geschätzte Credits aller vorhandenen Level
//   node scripts/italiano-ton-auftrag.mjs --hole <Datei>     fertige Aufnahmen herunterladen; Datei = JSON-Liste [{ "index": 61, "url": "https://…" }, …]
//   node scripts/italiano-ton-auftrag.mjs --ersatz           einzelne Dialogzeilen neu vertonen (Liste: scripts/italiano-ton-ersatz.json)
//
// Je Lerntag zwei Aufnahmen: Kennzahl Tag×10+1 = die 12 Wörter, Tag×10+2 = der Dialog (jede Zeile ein Abschnitt mit
// der Stimme der Figur). Die Aufnahmen landen in .tmp-test/italiano/ton-roh/tNNN-w.mp3 und tNNN-d.mp3; daraus baut
// scripts/italiano-ton.cjs die kleinen Tondateien des Tools.
//
// WICHTIG — die Wortliste ist EIN Abschnitt („Zero. Uno. Due. …“), nicht ein Abschnitt je Wort: Die Sprachausgabe hat
// keine Sprach-Einstellung und rät die Sprache je Abschnitt. Ein einzelnes Wort, das es auch im Englischen gibt (zero,
// due, no …), sprach sie deshalb englisch aus (gemeldet am 24.11.2026; nachgemessen mit scripts/italiano-ton-pruefe.py:
// auch ein italienischer Vorspann als eigener Abschnitt half nicht). Im Zusammenhang der ganzen Liste bleibt sie beim
// Italienischen. Die Pausen zwischen den Wörtern (Satzende) reichen zum Teilen.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const INHALT = join(WURZEL, 'src', 'italiano', 'inhalt')
const ROH = join(WURZEL, '.tmp-test', 'italiano', 'ton-roh')
/** Credits je 1000 Zeichen (gemessen am 18.11.2026 mit estimate_audio_cost für elevenlabs_v4) */
const CREDITS_JE_1000 = 4.85

// Stimmen (Higgsfield-Vorgaben). Giulia und Ben sind die vom Nutzer gewählten Stimmen der Hörprobe A.
const STIMME = {
  giulia: '530df032-c311-483b-a750-cb3c9e1bcdfd',   // Gia
  ben: '95429266-c0ac-4137-a209-63b8812b0f23',      // Julian
  nonna: 'fa64fba4-ad02-405e-99d0-1f085d87c706',    // Mabel
  marco: '6f98d3dd-324f-4845-8c28-c1d1647a06cd',    // Marcus
  sofia: 'ca83ca7f-c186-493d-bd69-0d765fa861b2',    // Elena
  luca: 'ef70cc83-3015-4bad-9359-0ea968c43ec0',     // Caspian
  uomo: 'f1e8226e-2248-4d5f-b43c-0a79e9949dbf',     // Andre
  donna: '984ddbed-83d3-5388-84ce-02fe6c24befa',    // Livia
}
const WORT_STIMME = STIMME.giulia

const lies = level => JSON.parse(readFileSync(join(INHALT, `level-${String(level).padStart(2, '0')}.json`), 'utf8'))
const satz = t => (/[.!?…]$/.test(t.trim()) ? t.trim() : t.trim() + '.')
const gross = t => t.charAt(0).toUpperCase() + t.slice(1)
const zug = (text, stimme) => ({ text, voice_type: 'preset', voice_id: stimme })
/** abweichende Schreibweise einzelner Wörter NUR für die Sprachausgabe (scripts/italiano-ton-ersatz.json, Abschnitt
 *  „woerter“, Schlüssel Lerntag/Platz ab 0) — z. B. „Nò“ statt „No“, damit das Wort sicher italienisch gelesen wird.
 *  Der Text im Tool bleibt, wie er ist. */
const wortSchreibweise = (() => { try { return JSON.parse(readFileSync(join(WURZEL, 'scripts', 'italiano-ton-ersatz.json'), 'utf8')).woerter || {} } catch { return {} } })()
/** die Wörter eines Lerntags als EIN Abschnitt: jedes Wort ein eigener kleiner Satz (siehe Kopf der Datei) */
const wortliste = (tag, woerter) => woerter.map((w, i) => gross(satz(wortSchreibweise[`${tag}/${i}`] ?? w.it))).join(' ')

function auftraege(level) {
  const aus = []
  for (const t of lies(level).tage) {
    aus.push({ index: t.tag * 10 + 1, params: { model: 'elevenlabs_v4', prompt: `Parla Italiano t${String(t.tag).padStart(3, '0')} parole`, dialogue: [zug(wortliste(t.tag, t.woerter), WORT_STIMME)] } })
    aus.push({ index: t.tag * 10 + 2, params: { model: 'elevenlabs_v4', prompt: `Parla Italiano t${String(t.tag).padStart(3, '0')} dialogo`, dialogue: t.dialog.zeilen.map(z => zug(z.it, STIMME[z.wer] ?? STIMME.uomo)) } })
  }
  return aus
}
const zeichen = a => a.params.dialogue.reduce((s, z) => s + z.text.length, 0)

/** einzeln neu zu vertonende Dialogzeilen (scripts/italiano-ton-ersatz.json): Kennzahl 100000 + Tag×100 + Zeile,
 *  Aufnahme tNNN-eZZ.mp3 (ZZ = Zeile ab 0) */
function ersatzAuftraege() {
  const datei = join(WURZEL, 'scripts', 'italiano-ton-ersatz.json')
  if (!existsSync(datei)) return []
  const aus = []
  for (const [k, e] of Object.entries(JSON.parse(readFileSync(datei, 'utf8')).zeilen || {})) {
    const [tag, nr] = k.split('/').map(Number)
    const z = lies(Math.floor((tag - 1) / 5) + 1).tage.find(t => t.tag === tag)?.dialog.zeilen[nr]
    if (!z) throw new Error(`Ersatz ${k}: diese Dialogzeile gibt es nicht`)
    const text = [e.vor, e.text ?? z.it, e.nach].filter(Boolean).join(' ')
    aus.push({ index: 100000 + tag * 100 + nr, params: { model: 'elevenlabs_v4', prompt: `Parla Italiano t${String(tag).padStart(3, '0')} riga ${nr}`, dialogue: [zug(text, STIMME[z.wer] ?? STIMME.uomo)] } })
  }
  return aus
}
/** Kennzahl → Dateiname der Roh-Aufnahme (ohne Endung) */
const rohName = index => index >= 100000
  ? `t${String(Math.floor((index - 100000) / 100)).padStart(3, '0')}-e${String(index % 100).padStart(2, '0')}`
  : `t${String(Math.floor(index / 10)).padStart(3, '0')}-${index % 10 === 1 ? 'w' : 'd'}`
const vorhanden = index => ['mp3', 'wav', 'ogg'].some(e => existsSync(join(ROH, `${rohName(index)}.${e}`)))

const [arg, wert] = process.argv.slice(2)
if (arg === '--umfang') {
  let summe = 0
  for (const f of readdirSync(INHALT).filter(x => /^level-\d\d\.json$/.test(x)).sort()) {
    const level = Number(f.slice(6, 8))
    const n = auftraege(level).reduce((s, a) => s + zeichen(a), 0)
    summe += n
    console.log(`Level ${String(level).padStart(2)}: ${String(n).padStart(5)} Zeichen ≈ ${(n / 1000 * CREDITS_JE_1000).toFixed(1).padStart(5)} Credits`)
  }
  console.log(`Summe: ${summe} Zeichen ≈ ${(summe / 1000 * CREDITS_JE_1000).toFixed(0)} Credits · geschätzte Sprechzeit ${(summe / 13.5 / 60).toFixed(0)} min`)
} else if (arg === '--hole') {
  const liste = JSON.parse(readFileSync(wert, 'utf8'))
  mkdirSync(ROH, { recursive: true })
  let n = 0
  for (const { index, url } of liste) {
    const endung = (/\.(mp3|wav|ogg|m4a)(\?|$)/i.exec(url) || [, 'mp3'])[1].toLowerCase()
    const ziel = join(ROH, `${rohName(index)}.${endung}`)
    const r = await fetch(url)
    if (!r.ok) { console.log(`FEHLER ${index}: HTTP ${r.status}`); continue }
    writeFileSync(ziel, Buffer.from(await r.arrayBuffer()))
    n++
  }
  console.log(`${n} von ${liste.length} Aufnahmen geholt → ${ROH}`)
} else if (arg === '--alle' && /^\d+$/.test(wert || '')) {
  // alle Aufträge eines Levels, auch die schon erledigten (zum Gegenprüfen dessen, was abgeschickt wurde)
  console.log(JSON.stringify(auftraege(Number(wert))))
} else if (arg === '--ersatz') {
  // einzelne Dialogzeilen neu vertonen (siehe scripts/italiano-ton-ersatz.json); „--ersatz alle“ zeigt auch die erledigten
  const a = ersatzAuftraege()
  const fehlend = wert === 'alle' ? a : a.filter(x => !vorhanden(x.index))
  console.error(`Ersatzzeilen: ${a.length} Aufträge, ${a.reduce((s, x) => s + zeichen(x), 0)} Zeichen ≈ ${(a.reduce((s, x) => s + zeichen(x), 0) / 1000 * CREDITS_JE_1000).toFixed(1)} Credits · noch nicht vorhanden: ${a.filter(x => !vorhanden(x.index)).length}`)
  console.log(JSON.stringify(fehlend))
} else if (/^\d+$/.test(arg || '')) {
  const a = auftraege(Number(arg))
  const fehlend = a.filter(x => !vorhanden(x.index))
  console.error(`Level ${arg}: ${a.length} Aufträge, ${a.reduce((s, x) => s + zeichen(x), 0)} Zeichen ≈ ${(a.reduce((s, x) => s + zeichen(x), 0) / 1000 * CREDITS_JE_1000).toFixed(1)} Credits · noch nicht vorhanden: ${fehlend.length}`)
  console.log(JSON.stringify(fehlend))
} else {
  console.error('Aufruf: node scripts/italiano-ton-auftrag.mjs <Level> | --ersatz | --umfang | --hole <Datei>')
  process.exit(2)
}
