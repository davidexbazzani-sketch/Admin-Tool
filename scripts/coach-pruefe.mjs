#!/usr/bin/env node
// Der Coach — Prüfung der Inhalte und der Grenze zum Tool (läuft nur beim Erstellen).
//
//   node scripts/coach-pruefe.mjs                 alles prüfen
//   node scripts/coach-pruefe.mjs --soll konter   was dem Vorrat für die Übungstage des Kursplans noch fehlt
//
// Fehler = muss behoben werden (Exitcode 1). Hinweis = bitte ansehen.
// Regeln: derCoach/06_INHALT_REGELN_MUSTER.md und src/coach/inhalt/LIESMICH.md.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baueIndex, INHALT } from './coach-index.mjs'

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..')
const COACH = join(WURZEL, 'src', 'coach')
const fehler = [], hinweise = []
const F = (wo, t) => fehler.push(`${wo}: ${t}`)
const H = (wo, t) => hinweise.push(`${wo}: ${t}`)
const istText = (x, min = 1) => typeof x === 'string' && x.trim().length >= min

function alle(ordner, endung) {
  const aus = []
  for (const n of readdirSync(ordner).sort()) {
    const p = join(ordner, n)
    if (statSync(p).isDirectory()) aus.push(...alle(p, endung))
    else if (endung.some(e => n.endsWith(e))) aus.push(p)
  }
  return aus
}
const rel = p => relative(WURZEL, p).replace(/\\/g, '/')

// ── Dateien lesen ──
const dateien = new Map()
for (const p of alle(INHALT, ['.json'])) {
  try { dateien.set(rel(p), JSON.parse(readFileSync(p, 'utf8'))) } catch (e) { F(rel(p), `kein gültiges JSON – ${e.message}`) }
}
const stamm = dateien.get('src/coach/inhalt/bereiche.json')
// Quellen: quellen.json (gemeinsam) und je Bereich <bereich>/quellen.json – eine Kennung nur einmal
const quellDateien = [...dateien].filter(([d]) => /^src\/coach\/inhalt\/([a-z]+\/)?quellen(-[nls])?\.json$/.test(d))
const quellenAlle = []
for (const [d, j] of quellDateien) for (const q of j.quellen ?? []) {
  if (quellenAlle.some(x => x.q.id === q.id)) F(d, `Quelle „${q.id}“ doppelt (auch in ${quellenAlle.find(x => x.q.id === q.id).d})`)
  if (!istText(q.text)) F(d, `Quelle „${q.id}“ ohne Text`)
  quellenAlle.push({ d, q })
}
const quellen = new Set(quellenAlle.map(x => x.q.id))
const quellenGeprueft = new Set(quellenAlle.filter(x => x.q.geprueft).map(x => x.q.id))
const faehig = new Map()
for (const b of stamm?.bereiche ?? []) for (const f of b.faehigkeiten) faehig.set(f.id, { bereich: b.id, spur: f.spur })
const BEREICHE = new Set((stamm?.bereiche ?? []).map(b => b.id))

const einheiten = [], vorrat = [], lagen = [], missionen = [], wissen = [], tests = [], kurse = []
for (const [d, j] of dateien) {
  if (Array.isArray(j.einheiten)) j.einheiten.forEach(e => einheiten.push({ d, e }))
  if (Array.isArray(j.eintraege) && /\/vorrat-[nls]?\d+\.json$/.test(d)) j.eintraege.forEach(v => vorrat.push({ d, v }))
  if (Array.isArray(j.lagen)) j.lagen.forEach(l => lagen.push({ d, l }))
  if (Array.isArray(j.missionen)) j.missionen.forEach(m => missionen.push({ d, m }))
  if (j.eintraege && j.ziel && j.bereich) wissen.push({ d, w: j })
  if (Array.isArray(j.szenarien)) tests.push({ d, t: j })
  if (Array.isArray(j.kurse)) j.kurse.forEach(k => kurse.push({ d, k }))
}
const vorratIds = new Map(vorrat.map(({ v }) => [v.kopf?.id, v]))
const missionIds = new Set(missionen.map(({ m }) => m.id))
const lageIds = new Set(lagen.map(({ l }) => l.id))
const einheitIds = new Set(einheiten.map(({ e }) => e.id))

// ── eindeutige Kennungen über alles ──
const gesehen = new Map()
const kennung = (id, wo) => { if (!istText(id)) { F(wo, 'Kennung fehlt'); return } if (gesehen.has(id)) F(wo, `Kennung „${id}“ doppelt (auch in ${gesehen.get(id)})`); else gesehen.set(id, wo) }

// ── Text-Regeln ──
const VERBOTEN = [/garantiert/i, /für immer/i, /nie wieder/i, /\bheil(en|ung)\b/i, /sprachfehler/i, /\bstotterer\b/i, /bekämpf/i, /besieg/i, /versager/i, /\bloser\b/i, /\balpha\b/i, /rumkriegen/i, /trick 17/i, /geheimwaffe/i, /gehirnwäsche/i, /\bdu musst\b/i, /reiß dich zusammen/i, /stell dich nicht so an/i]
const STOTTERN = [/flüssig/i, /\blangsamer\b/i, /entspann/i, /\batme\b/i, /\b(\p{L})-\1/iu]
function texte(x, pfad = '') {
  const aus = []
  if (typeof x === 'string') aus.push([pfad, x])
  else if (Array.isArray(x)) x.forEach((y, i) => aus.push(...texte(y, `${pfad}[${i}]`)))
  else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) if (!['id', 'ref', 'art', 'faehigkeit', 'faehigkeiten', 'quellen', 'mission', 'einheit', 'lage', 'weiter', 'start', 'tendenz', 'leise', 'bereich', 'schwerpunkt', 'umfeld', 'kanal', 'phase', 'link'].includes(k)) aus.push(...texte(v, pfad ? `${pfad}.${k}` : k))
  return aus
}
function pruefeTexte(wo, obj, o = {}) {
  for (const [pfad, t] of texte(obj)) {
    const erlaubt = /aussage$/.test(pfad) || o.mythos
    if (!erlaubt) for (const re of VERBOTEN) if (re.test(t)) F(wo, `verbotenes Wort (${re.source}) in ${pfad}: „${t.slice(0, 70)}“`)
    if (o.stottern) for (const re of STOTTERN) if (re.test(t)) F(wo, `im Schwerpunkt Stottern nicht erlaubt (${re.source}) in ${pfad}: „${t.slice(0, 70)}“`)
    // „musst du“ als Befehl ansehen; Fragen („Wo musst du …?“) und Entlastung („musst du nicht …“) sind in Ordnung
    if (/\bmusst du\b/i.test(t) && !/\bmusst du\b[^.!?]{0,25}\b(nicht|kein\w*)\b/i.test(t) && !/\bmusst du\b[^.!]*\?/i.test(t)) H(wo, `„musst du“ in ${pfad} – Befehl? Lieber Einladung: „${t.slice(0, 60)}…“`)
    if (/\p{L}’\p{L}/u.test(t)) H(wo, `typografischer Apostroph in ${pfad}`)
    if (/ {2,}/.test(t) || t !== t.trim()) F(wo, `überflüssige Leerzeichen in ${pfad}`)
  }
}
const laenge = (wo, feld, t, max) => { if (istText(t) && t.length > max) F(wo, `${feld} zu lang (${t.length} > ${max}): „${t.slice(0, 50)}…“`) }

// ── Übungen (Schritte mit und ohne Kopf) ──
const laengenStatistik = new Map()   // Datei → [Fragen mit ≥ 3 Antworten, davon beste = längste]
const AKTIV = new Set(['auswahl', 'wortwahl', 'kunstgriff', 'tonfall', 'szene', 'buendel', 'zuordnen', 'rangfolge', 'fehler', 'dialog', 'konter', 'blitz', 'umformulieren', 'anschluss', 'spiegeln', 'jaund', 'kern', 'humorlabor', 'bauplan', 'kritiker', 'sprechen', 'atem', 'lockern', 'anleitung', 'nachsprechen', 'klartext', 'lautleiter', 'routine', 'stumm', 'reflexion', 'wenndann', 'selbstbild', 'sammeln', 'zaehler', 'experiment', 'schaetzen'])
function pruefeKopf(wo, k, bereich) {
  if (!k) { F(wo, 'Kopf fehlt'); return }
  kennung(k.id, wo)
  if (!faehig.has(k.faehigkeit)) F(wo, `unbekannte Fähigkeit „${k.faehigkeit}“`)
  else if (bereich && faehig.get(k.faehigkeit).bereich !== bereich) F(wo, `Fähigkeit „${k.faehigkeit}“ gehört nicht zum Bereich ${bereich}`)
  if (!(Number.isInteger(k.stufe) && k.stufe >= 1 && k.stufe <= 10)) F(wo, `Stufe muss 1…10 sein`)
  if (!['wissen', 'koennen'].includes(k.kanal)) F(wo, 'Kanal muss wissen oder koennen sein')
  if (k.laut) {
    if (!k.leise) F(wo, 'laute Übung ohne stille Ersatzübung (leise)')
    else { const l = vorratIds.get(k.leise); if (!l) F(wo, `Ersatzübung „${k.leise}“ gibt es nicht`); else { if (l.kopf.laut) F(wo, `Ersatzübung „${k.leise}“ ist selbst laut`); if (l.kopf.faehigkeit !== k.faehigkeit) H(wo, `Ersatzübung „${k.leise}“ übt eine andere Fähigkeit`) } }
  }
  if (k.einfluss && !['fair', 'taktik', 'rot'].includes(k.einfluss)) F(wo, 'Einfluss-Klasse unbekannt')
}
function pruefeWahl(wo, antworten, o = {}) {
  if (!Array.isArray(antworten) || antworten.length < 2) { F(wo, 'mindestens zwei Antworten'); return }
  const beste = antworten.filter(a => a.wert === 2).length
  if (o.genauEine !== false && beste !== 1) F(wo, `genau eine beste Antwort nötig (wert 2), gefunden: ${beste}`)
  if (o.genauEine === false && beste < 1) F(wo, 'mindestens eine beste Antwort nötig')
  if (o.brauchbar !== false && antworten.length >= 3 && !antworten.some(a => a.wert === 1)) H(wo, 'keine brauchbare Antwort (wert 1)')
  const t = antworten.map(a => (a.text || '').trim().toLowerCase())
  if (new Set(t).size !== t.length) F(wo, 'Antworten doppelt')
  for (const a of antworten) {
    if (![0, 1, 2].includes(a.wert)) F(wo, `wert muss 0, 1 oder 2 sein: „${a.text}“`)
    laenge(wo, 'Antwort', a.text, 140)
    if (o.warum !== false) { if (!istText(a.warum)) F(wo, `Begründung fehlt bei „${(a.text || '').slice(0, 40)}“`); laenge(wo, 'Begründung', a.warum, 220) }
  }
}
function pruefeSchritt(wo, s, bereich) {
  const k = s.kopf
  if (k) pruefeKopf(wo, k, bereich)
  switch (s.art) {
    case 'karte': if (!istText(s.text)) F(wo, 'Text fehlt'); laenge(wo, 'Erklärkarte', s.text, 420); break
    case 'schaetzen': if (!istText(s.frage) || !istText(s.loesung) || !istText(s.aufloesung)) F(wo, 'Frage, Lösung oder Auflösung fehlt'); if (s.optionen && !(Number.isInteger(s.richtig) && s.optionen[s.richtig])) F(wo, 'richtige Option fehlt'); break
    case 'mythos': if (!['stimmt', 'teils', 'falsch'].includes(s.urteil) || !istText(s.warum) || !istText(s.aussage)) F(wo, 'Mythos unvollständig'); break
    case 'vergleich': for (const f of ['lage', 'schwach', 'stark', 'frage', 'unterschied']) if (!istText(s[f])) F(wo, `Feld ${f} fehlt`); break
    case 'studie': for (const f of ['frage', 'aufbau', 'ergebnis', 'grenze']) if (!istText(s[f])) F(wo, `Feld ${f} fehlt`); for (const q of s.quellen ?? []) if (!quellen.has(q)) F(wo, `Quelle „${q}“ fehlt`); break
    case 'auswahl': case 'wortwahl': case 'tonfall': case 'szene': if (!istText(s.frage)) F(wo, 'Frage fehlt'); pruefeWahl(wo, s.antworten); break
    case 'kunstgriff': pruefeWahl(wo, s.antworten); if (!istText(s.erklaerung)) F(wo, 'Erklärung fehlt'); if (k && !k.einfluss) H(wo, 'kunstgriff ohne Einfluss-Klasse'); break
    case 'buendel': if (!Array.isArray(s.zeichen) || s.zeichen.filter(z => z.stuetzt).length < 2) F(wo, 'Bündel braucht mindestens zwei stützende Zeichen'); break
    case 'zuordnen': {
      if (!Array.isArray(s.faecher) || s.faecher.length < 2) F(wo, 'mindestens zwei Fächer')
      if (!Array.isArray(s.karten) || s.karten.length < 4) F(wo, 'mindestens vier Karten')
      for (let i = 0; i < (s.faecher ?? []).length; i++) if (!s.karten?.some(c => c.fach === i)) F(wo, `Fach „${s.faecher[i]}“ ohne Karte`)
      for (const c of s.karten ?? []) if (!(c.fach >= 0 && c.fach < (s.faecher?.length ?? 0))) F(wo, `Karte mit ungültigem Fach: „${c.text}“`)
      break
    }
    case 'rangfolge': if (!Array.isArray(s.eintraege) || s.eintraege.length < 3) F(wo, 'mindestens drei Einträge'); for (const e of s.eintraege ?? []) if (!istText(e.warum)) F(wo, 'Begründung fehlt'); break
    case 'fehler': if (!Array.isArray(s.teile) || s.teile.filter(t => t.fehler).length < 2) F(wo, 'mindestens zwei markierte Fehlerstellen'); break
    case 'konter': if (!istText(s.spruch) || !Array.isArray(s.muster) || s.muster.length < 2 || !Array.isArray(s.kriterien) || s.kriterien.length < 2) F(wo, 'Konter braucht Spruch, mindestens zwei Muster und zwei Kriterien'); if (![1, 2, 3].includes(s.schaerfe)) F(wo, 'Schärfe 1…3'); break
    case 'blitz': if (!istText(s.auftrag) || !(s.sekunden > 0) || !(s.ziel > 0) || !Array.isArray(s.beispiele) || s.beispiele.length < 2) F(wo, 'Zeitdruck-Runde unvollständig'); if (/\d+\s*sekunden/i.test(s.auftrag)) F(wo, 'die Zeit steht nicht im Auftrag (sie entfällt bei „ohne Zeitdruck“)'); break
    case 'umformulieren': case 'anschluss': case 'spiegeln': case 'jaund': case 'kern': case 'humorlabor': case 'kritiker':
      if (!Array.isArray(s.kriterien) || s.kriterien.length < 2) F(wo, 'mindestens zwei Kriterien')
      if (!Array.isArray(s.muster) || s.muster.length < 2) F(wo, 'mindestens zwei Musterlösungen')
      break
    // (kern: Musterlösungen müssen die eigene Wortgrenze einhalten – Prüfung unten nach dem switch)
    case 'bauplan': if (!Array.isArray(s.felder) || s.felder.length < 2 || !Array.isArray(s.muster) || !s.muster.length) F(wo, 'Bauplan braucht Felder und Muster'); break
    case 'dialog': pruefeGespraech(wo, s.gespraech, bereich); break
    case 'atem': if (!s.takt || !(s.takt.aus > 0) || !istText(s.hinweis)) F(wo, 'Atemübung braucht Takt und Hinweis'); if (s.takt && s.takt.aus < s.takt.ein) F(wo, 'beim Atmen muss das Ausatmen länger sein als das Einatmen'); break
    case 'nachsprechen': case 'klartext': case 'lautleiter': case 'sprechen': if (!Array.isArray(s.pruefliste) || !s.pruefliste.length) F(wo, 'Prüfliste fehlt'); if (k && !k.laut) H(wo, `${s.art} ohne „laut“`); break
    case 'stumm': if (!istText(s.titel) || !Array.isArray(s.schritte) || s.schritte.length < 2 || !Array.isArray(s.pruefliste) || !s.pruefliste.length) F(wo, 'stille Übung braucht Titel, mindestens zwei Schritte und eine Prüfliste'); if (k?.laut) F(wo, 'stille Übung darf nicht laut sein'); break
    case 'mission': if (!missionIds.has(s.ref)) F(wo, `Mission „${s.ref}“ gibt es nicht`); break
    case 'fachhilfe': if (!['logopaedie', 'stottern', 'seele', 'notfall', 'belaestigung', 'mobbing'].includes(s.thema)) F(wo, 'Fachhilfe-Thema unbekannt'); break
    case 'reflexion': if (!istText(s.frage)) F(wo, 'Frage fehlt'); break
    default: break
  }
  if (s.art === 'kern' && s.hoechstWoerter > 0) for (const m of s.muster ?? []) { const n = (m.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)*/gu) ?? []).length; if (n > s.hoechstWoerter) F(wo, `Musterlösung hat ${n} Wörter, erlaubt sind ${s.hoechstWoerter}: „${m.slice(0, 60)}…“`) }
  if (s.art === 'selbstbild') for (const a of s.aussagen ?? []) { kennung(a.id, wo); if (!faehig.has(a.faehigkeit)) F(wo, `Selbstbild „${a.id}“: Fähigkeit unbekannt`) }
  // für die Statistik „beste Antwort = längste“ (Hinweis je Datei, siehe unten)
  if (Array.isArray(s.antworten) && s.antworten.length >= 3) {
    const datei = wo.split(' ')[0], laengen = s.antworten.map(a => (a.text || '').length), beste = s.antworten.findIndex(a => a.wert === 2)
    const st = laengenStatistik.get(datei) ?? [0, 0, 0], lang = laengen.indexOf(Math.max(...laengen)); laengenStatistik.set(datei, [st[0] + 1, st[1] + (beste >= 0 && laengen[beste] === Math.max(...laengen) ? 1 : 0), st[2] + (s.antworten[lang]?.wert === 0 ? 1 : 0)])
  }
  if (k?.einfluss === 'rot' && s.art !== 'kunstgriff' && s.art !== 'auswahl') F(wo, 'Klasse „rot“ nur zum Erkennen (kunstgriff, auswahl) – nie als Einsatz-Übung')
}

function pruefeGespraech(wo, g, bereich) {
  if (!g || !Array.isArray(g.knoten)) { F(wo, 'Gespräch ohne Knoten'); return }
  const ids = new Map(g.knoten.map(k => [k.id, k]))
  if (!ids.has(g.start)) F(wo, `Start „${g.start}“ fehlt`)
  for (const k of g.knoten) {
    if (k.ende !== undefined) { if (k.wahl?.length) F(wo, `Knoten ${k.id}: Ende und Wahl zugleich`); continue }
    if (!k.wahl?.length) { F(wo, `Knoten ${k.id}: weder Wahl noch Ende`); continue }
    if (!k.wahl.some(w => w.wert === 2)) F(wo, `Knoten ${k.id}: keine beste Wahl`)
    for (const w of k.wahl) { if (!ids.has(w.weiter)) F(wo, `Knoten ${k.id}: Ziel „${w.weiter}“ fehlt`); if (!istText(w.rueck)) F(wo, `Knoten ${k.id}: Rückmeldung fehlt`); laenge(wo, 'Wahl', w.text, 180) }
    if (k.wahl.length >= 3) {
      const datei = wo.split(' ')[0], l = k.wahl.map(w => (w.text || '').length), b = k.wahl.findIndex(w => w.wert === 2)
      const st = laengenStatistik.get(datei) ?? [0, 0, 0], lang = l.indexOf(Math.max(...l)); laengenStatistik.set(datei, [st[0] + 1, st[1] + (b >= 0 && l[b] === Math.max(...l) ? 1 : 0), st[2] + (k.wahl[lang]?.wert === 0 ? 1 : 0)])
    }
  }
  // erreichbar und endet
  const erreicht = new Set(), stapel = [g.start]
  while (stapel.length) { const id = stapel.pop(); if (erreicht.has(id) || !ids.has(id)) continue; erreicht.add(id); for (const w of ids.get(id).wahl ?? []) stapel.push(w.weiter) }
  for (const k of g.knoten) if (!erreicht.has(k.id)) F(wo, `Knoten ${k.id} ist nicht erreichbar`)
  // jeder Weg endet: Tiefensuche mit Zustand (in Arbeit = Kreis; fertig = Ergebnis gemerkt)
  const zustand = new Map()
  const endet = x => {
    if (zustand.get(x) === 'arbeit') return false
    if (zustand.has(x)) return zustand.get(x)
    zustand.set(x, 'arbeit')
    const k = ids.get(x)
    const ok = !!k && (k.ende !== undefined || (k.wahl ?? []).every(w => endet(w.weiter)))
    zustand.set(x, ok)
    return ok
  }
  if (ids.has(g.start) && !endet(g.start)) F(wo, 'nicht jeder Weg endet (Kreis?)')
  if (!Array.isArray(g.prinzipien) || g.prinzipien.length < 2) F(wo, 'mindestens zwei Prinzipien')
}

// ── Einheiten ──
for (const { d, e } of einheiten) {
  const wo = `${d} ${e.id}`
  kennung(e.id, wo)
  if (!BEREICHE.has(e.bereich)) F(wo, `Bereich „${e.bereich}“ unbekannt`)
  const muster = e.schwerpunkt ? new RegExp(`^${e.bereich}-${e.schwerpunkt[0]}-\\d\\d$`) : new RegExp(`^${e.bereich}-[123]-\\d\\d$`)
  if (!muster.test(e.id)) F(wo, 'Kennung passt nicht zum Schema <bereich>-<stufe>-<nr>')
  laenge(wo, 'Titel', e.titel, 48); laenge(wo, 'Aha', e.aha, 220); laenge(wo, 'Regel', e.regel, 90)
  for (const f of ['titel', 'aha', 'regel']) if (!istText(e[f])) F(wo, `${f} fehlt`)
  if (!['A', 'B', 'P', 'D', 'U'].includes(e.beleg)) F(wo, 'Beleg-Stufe fehlt')
  if (['B', 'D', 'U'].includes(e.beleg) && !istText(e.belegHinweis)) H(wo, `Beleg ${e.beleg} ohne belegHinweis`)
  if (e.beleg === 'A' && !(e.quellen ?? []).length) F(wo, 'Beleg A ohne Quelle')
  for (const q of e.quellen ?? []) if (!quellen.has(q)) F(wo, `Quelle „${q}“ fehlt in quellen.json`)
  for (const f of e.faehigkeiten ?? []) if (!faehig.has(f)) F(wo, `Fähigkeit „${f}“ unbekannt`)
  if (!(e.dauerMin >= 4 && e.dauerMin <= 8)) H(wo, `Dauer ${e.dauerMin} Minuten`)
  const s = e.schritte ?? []
  if (s.length < 5 || s.length > 9) F(wo, `${s.length} Schritte (5 bis 9)`)
  const formate = new Set(s.map(x => x.art))
  if (formate.size < 3) F(wo, 'mindestens drei verschiedene Formate')
  if (s.filter(x => AKTIV.has(x.art) && x.art !== 'schaetzen').length < 2) F(wo, 'mindestens zwei aktive Schritte')
  if (s[0] && !['schaetzen', 'mythos', 'vergleich', 'auswahl', 'zuordnen', 'konter', 'studie'].includes(s[0].art)) F(wo, `erster Schritt soll Neugier wecken (nicht „${s[0].art}“)`)
  for (let i = 1; i < s.length; i++) if (s[i].art === s[i - 1].art && s[i].art !== 'atem') F(wo, `Format „${s[i].art}“ zweimal hintereinander`)
  const letzter = s[s.length - 1]
  if (e.mission) { if (letzter?.art !== 'mission' || letzter.ref !== e.mission) F(wo, 'letzter Schritt muss die Mission sein'); if (!missionIds.has(e.mission)) F(wo, `Mission „${e.mission}“ gibt es nicht`) }
  else if (!['reflexion', 'fachhilfe'].includes(letzter?.art)) F(wo, 'ohne Mission endet die Einheit mit reflexion oder fachhilfe')
  s.forEach((x, i) => pruefeSchritt(`${wo} Schritt ${i + 1} (${x.art})`, x, e.bereich))
  if (!Array.isArray(e.merkkarten) || e.merkkarten.length < 2 || e.merkkarten.length > 3) F(wo, '2 bis 3 Merkkarten')
  for (const m of e.merkkarten ?? []) { kennung(m.id, wo); if (!new RegExp(`^${e.id}-m\\d$`).test(m.id ?? '')) F(wo, `Merkkarte „${m.id}“: Kennung <einheit>-m<n>`) ; if (!istText(m.frage) || !istText(m.antwort)) F(wo, 'Merkkarte unvollständig') }
  if (e.schwerpunkt === 'lispeln' && !s.some(x => x.art === 'fachhilfe')) F(wo, 'Lispeln: Baustein fachhilfe fehlt')
  if (e.schwerpunkt === 'stottern') { if (letzter?.art !== 'fachhilfe' && !s.some(x => x.art === 'fachhilfe')) F(wo, 'Stottern: Einheit endet mit fachhilfe'); if (s.some(x => x.kopf?.uhr || x.art === 'blitz')) F(wo, 'Stottern: keine Übung mit Uhr') }
  pruefeTexte(wo, e, { stottern: e.schwerpunkt === 'stottern' })
}

// ── Vorrat ──
for (const { d, v } of vorrat) {
  const wo = `${d} ${v.kopf?.id ?? '?'}`
  const b = v.kopf?.faehigkeit?.split('.')[0]
  if (!/^[a-z]+-([nls]-)?v-\d{4}$/.test(v.kopf?.id ?? '')) F(wo, 'Kennung <bereich>-v-<nnnn> (Schwerpunkt <bereich>-<n|l|s>-v-<nnnn>)')
  if (!v.kopf) { F(wo, 'Vorrats-Eintrag ohne Kopf'); continue }
  pruefeSchritt(`${wo} (${v.art})`, v, b)
  pruefeTexte(wo, v, { stottern: /^aussprache-s-/.test(v.kopf.id) })
}

// ── Lagen ──
for (const { d, l } of lagen) {
  const wo = `${d} ${l.id}`
  kennung(l.id, wo)
  if (!/^[a-z]+-([nls]-)?l-\d\d$/.test(l.id)) F(wo, 'Kennung <bereich>-l-<nn> (Schwerpunkt <bereich>-<n|l|s>-l-<nn>)')
  if (l.schwerpunkt && !l.id.startsWith(`${l.bereich}-${l.schwerpunkt[0]}-l-`)) F(wo, 'Lage eines Schwerpunkts: <bereich>-<n|l|s>-l-<nn>')
  if (l.bereich === 'aussprache' && !l.schwerpunkt && !(Number(l.id.slice(-2)) >= 51)) F(wo, 'Lagen im Kern von aussprache zählen ab 51 (aussprache-l-01… sind die Lispeln-Einheiten)')
  for (const f of l.faehigkeiten ?? []) if (!faehig.has(f)) F(wo, `Fähigkeit „${f}“ unbekannt`)
  for (const f of ['titel', 'lage', 'einleitung', 'transfer']) if (!istText(l[f])) F(wo, `${f} fehlt`)
  pruefeGespraech(wo, l, l.bereich)
  pruefeTexte(wo, l, { stottern: l.schwerpunkt === 'stottern' })
}

// ── Missionen und Leitern ──
const leitern = new Map()
for (const { d, m } of missionen) {
  const wo = `${d} ${m.id}`
  kennung(m.id, wo)
  if (!/^[a-z]+-([nls]-)?m-\d\d$/.test(m.id)) F(wo, 'Kennung <bereich>-m-<nn>')
  if (!(m.stufe >= 1 && m.stufe <= 10)) F(wo, 'Sprosse 1…10')
  for (const f of ['titel', 'auftrag', 'planVorlage']) if (!istText(m[f])) F(wo, `${f} fehlt`)
  if (!['privat', 'beruf', 'beides'].includes(m.ort)) F(wo, 'Ort privat/beruf/beides')
  if (m.mutprobe && m.ort !== 'privat') F(wo, 'Mutproben nur im Privatleben')
  const key = `${m.bereich}/${m.schwerpunkt ?? 'kern'}`
  leitern.set(key, [...(leitern.get(key) ?? []), m.stufe])
  pruefeTexte(wo, m, { stottern: m.schwerpunkt === 'stottern' })
}
for (const [k, s] of leitern) { const fehlt = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter(x => !s.includes(x)); if (fehlt.length) H(`Leiter ${k}`, `Sprossen fehlen: ${fehlt.join(', ')}`) }

// ── Wissens-Seiten ──
for (const { d, w } of wissen) {
  const wo = `${d}`
  if (!BEREICHE.has(w.bereich)) F(wo, 'Bereich unbekannt')
  if (!Array.isArray(w.ziel) || w.ziel.length !== 3) F(wo, 'Zielbild braucht drei Sätze')
  for (const e of w.eintraege) {
    const ewo = `${wo} ${e.id}`
    kennung(e.id, ewo)
    if (!['hebel', 'taktik', 'formulierung', 'fehler', 'mythos', 'dahinter', 'buch', 'umfeld', 'spickzettel'].includes(e.art)) F(ewo, `Art „${e.art}“ unbekannt`)
    if (!['A', 'B', 'P', 'D', 'U'].includes(e.beleg)) F(ewo, 'Beleg-Stufe fehlt')
    if (e.beleg === 'A' && !(e.quellen ?? []).length) F(ewo, 'Beleg A ohne Quelle')
    for (const q of e.quellen ?? []) if (!quellen.has(q)) F(ewo, `Quelle „${q}“ fehlt in quellen.json`)
    for (const f of e.faehigkeiten ?? []) if (!faehig.has(f)) F(ewo, `Fähigkeit „${f}“ unbekannt`)
    if (e.art === 'taktik' && !e.einfluss) H(ewo, 'Taktik ohne Einfluss-Klasse')
    if (e.einfluss === 'rot' && (!istText(e.abwehr))) F(ewo, 'rote Linie ohne Abwehr')
    if (e.art === 'mythos' && !['stimmt', 'teils', 'falsch'].includes(e.urteil)) F(ewo, 'Mythos ohne Urteil')
    if (/\d+\s*(%|Prozent)/.test(e.text) && !(e.quellen ?? []).some(q => quellenGeprueft.has(q))) F(ewo, 'Zahl ohne geprüfte Quelle')
    pruefeTexte(ewo, e, { mythos: e.art === 'mythos' })
  }
  pruefeTexte(`${wo} (Kopf der Seite)`, { kern: w.kern, einleitung: w.einleitung, ziel: w.ziel })
  const bInfo = stamm.bereiche.find(b => b.id === w.bereich)
  for (const f of bInfo?.faehigkeiten ?? []) if (!f.spur && !w.eintraege.some(e => e.art === 'hebel' && (e.faehigkeiten ?? []).includes(f.id)) && !w.eintraege.some(e => (e.faehigkeiten ?? []).includes(f.id))) F(wo, `Fähigkeit „${f.id}“ ohne Eintrag auf der Wissens-Seite`)
  const zaehl = a => w.eintraege.filter(e => e.art === a).length
  if (zaehl('hebel') < 8) H(wo, `nur ${zaehl('hebel')} Hebel (Ziel 10–15)`)
  if (zaehl('mythos') < 5) H(wo, `nur ${zaehl('mythos')} Mythen (Ziel rund 8)`)
  if (zaehl('buch') < 6) H(wo, `nur ${zaehl('buch')} Buch-Einträge (Ziel 8–12)`)
}

// ── Tests ──
for (const { d, t } of tests) {
  for (const s of t.szenarien) {
    kennung(s.id, `${d} ${s.id}`); if (!faehig.has(s.faehigkeit)) F(`${d} ${s.id}`, 'Fähigkeit unbekannt'); pruefeWahl(`${d} ${s.id}`, s.antworten, { warum: false })
    if (Array.isArray(s.antworten) && s.antworten.length >= 3) {
      const l = s.antworten.map(a => (a.text || '').length), b = s.antworten.findIndex(a => a.wert === 2)
      const st = laengenStatistik.get(d) ?? [0, 0, 0], lang = l.indexOf(Math.max(...l)); laengenStatistik.set(d, [st[0] + 1, st[1] + (b >= 0 && l[b] === Math.max(...l) ? 1 : 0), st[2] + (s.antworten[lang]?.wert === 0 ? 1 : 0)])
    }
  }
  for (const s of [...(t.selbstbild ?? []), ...(t.verhalten ?? [])]) { kennung(s.id, `${d} ${s.id}`); if (!faehig.has(s.faehigkeit)) F(`${d} ${s.id}`, 'Fähigkeit unbekannt') }
  const ziel = t.spur && t.spur !== 'kern' ? 12 : 24
  if (t.szenarien.length < (ziel === 12 ? 12 : 16)) H(d, `nur ${t.szenarien.length} Szenario-Aufgaben (Ziel ${ziel})`)
  pruefeTexte(d, t, { stottern: t.spur === 'stottern' })
}

// ── Beste Antwort zu oft die längste? (leicht zu erraten) ──
for (const [d, [n, laengste, falsch]] of laengenStatistik) {
  if (n >= 10 && laengste / n > 0.5) H(d, `beste Antwort ist in ${laengste} von ${n} Fragen die längste – Längen angleichen (Ziel: höchstens die Hälfte)`)
  if (n >= 10 && falsch / n > 0.7) H(d, `die längste Antwort ist in ${falsch} von ${n} Fragen eine falsche – auch so lässt sich raten (Ziel: gemischt)`)
}

// ── Hilfe-Rufnummern nur in den Fachhilfe-Texten (gemeinsam.json), damit sie an einer Stelle stimmen ──
for (const [d, j] of dateien) {
  if (d.endsWith('/gemeinsam.json')) continue
  for (const [pfad, t] of texte(j)) if (/116\s?117|116\s?123|116\s?016|0800\s?123\s?99\s?00|0800\s?111\s?0\s?(111|222)/.test(t)) F(`${d} ${pfad}`, 'Hilfe-Rufnummer außerhalb der Fachhilfe-Texte – stattdessen Schritt „fachhilfe“')
}

// ── Testfragen sollen Übertragen messen, nicht Wiedererkennen ──
const woerter = t => new Set((t || '').toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 3))
const aehnlich = (a, b) => { const x = woerter(a), y = woerter(b); if (x.size < 5 || y.size < 5) return 0; let n = 0; for (const w of x) if (y.has(w)) n++; return n / Math.min(x.size, y.size) }
const uebungsFragen = [
  ...vorrat.map(({ v }) => [v.kopf.id, v.frage ?? v.auftrag ?? v.lage ?? '']),
  ...einheiten.flatMap(({ e }) => (e.schritte ?? []).filter(s => s.kopf).map(s => [s.kopf.id, s.frage ?? s.auftrag ?? s.lage ?? ''])),
]
for (const { d, t } of tests) for (const s of t.szenarien) {
  const b = s.id.split('-')[0]
  const treffer = uebungsFragen.find(([id, f]) => id.startsWith(b + '-') && aehnlich(s.frage, f) >= 0.75)
  if (treffer) H(`${d} ${s.id}`, `Testfrage gleicht fast wörtlich der Übung ${treffer[0]} – misst Wiedererkennen statt Übertragen`)
}

// ── Kurspläne ──
const vorratListe = vorrat.map(({ v }) => v)
for (const { d, k } of kurse) {
  const wo = `${d} Kurs ${k.kurs}`
  const vorkommen = new Map()
  for (const t of k.tage) {
    if (t.art !== 'E' && t.art !== 'L') kennung(t.id, `${wo} ${t.id}`)   // E- und L-Tage tragen die Kennung ihres Inhalts
    if (t.art === 'E') { if (!einheitIds.has(t.einheit)) F(wo, `Einheit „${t.einheit}“ fehlt`); vorkommen.set(t.einheit, (vorkommen.get(t.einheit) ?? 0) + 1); if (t.id !== t.einheit) F(wo, `Lerntag ${t.id}: Kennung = Einheit`) }
    if (t.art === 'L' || t.art === 'S') { if (!lageIds.has(t.lage)) F(wo, `Lage „${t.lage}“ fehlt`); if (t.art === 'L' && t.id !== t.lage) F(wo, `Lerntag ${t.id}: Kennung = Lage`) }
    if (t.art === 'U') {
      for (const f of t.faehigkeiten) if (!faehig.has(f)) F(wo, `${t.id}: Fähigkeit „${f}“ unbekannt`)
      for (const [laut, ohneZeit] of [[false, false], [false, true]]) {
        const n = vorratListe.filter(v => t.faehigkeiten.includes(v.kopf.faehigkeit) && (!t.formate.length || t.formate.includes(v.art)) && v.kopf.stufe >= t.band[0] - 1 && v.kopf.stufe <= t.band[1] + 1 && !v.kopf.test && (laut || !v.kopf.laut || v.kopf.leise) && (!ohneZeit || !v.kopf.uhr || v.art === 'blitz')).length
        if (n < t.anzahl * 2) (n < t.anzahl ? F : H)(wo, `${t.id}: nur ${n} passende Vorrats-Einträge (${laut ? 'laut' : 'leise'}${ohneZeit ? ', ohne Zeitdruck' : ''}) für ${t.anzahl} Aufgaben – Ziel: doppelt so viele`)
      }
    }
  }
  for (const [e, n] of vorkommen) if (n > 1) F(wo, `Einheit ${e} kommt ${n}-mal vor`)
  for (const { e } of einheiten) if ((e.schwerpunkt ? `${e.bereich}/${e.schwerpunkt}` : e.bereich) === k.kurs && !vorkommen.has(e.id)) F(wo, `Einheit ${e.id} steht in keinem Lerntag`)
}

// ── Inhaltsverzeichnis aktuell? ──
const idxDatei = join(INHALT, '_index.json')
if (!existsSync(idxDatei) || readFileSync(idxDatei, 'utf8') !== JSON.stringify(baueIndex())) F('_index.json', 'veraltet – node scripts/coach-index.mjs')

// ── Grenze zum Tool und Code-Regeln ──
const ERLAUBT = new Set(['react', 'react-dom', 'lucide-react', 'zustand', 'zustand/middleware'])
for (const p of alle(COACH, ['.ts', '.tsx'])) {
  const q = readFileSync(p, 'utf8')
  const r = rel(p)
  const istAdapter = r.endsWith('src/coach/host/adminTool.ts')
  for (const m of q.matchAll(/(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^import\s+['"]([^'"]+)['"]/gm)) {
    const ziel = m[1] ?? m[2] ?? m[3]
    if (ziel.startsWith('.')) {
      const abs = resolve(dirname(p), ziel)
      if (!abs.startsWith(COACH) && !istAdapter) F(r, `importiert von außerhalb des Coaches: ${ziel}`)
    } else if (!ERLAUBT.has(ziel) && !istAdapter) F(r, `Paket „${ziel}“ ist im Coach nicht erlaubt`)
  }
  const ohneKommentar = q.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  if (/[:<(,]\s*any\b|\bas any\b/.test(ohneKommentar)) F(r, 'TypeScript-Typ „any“')
  if (/kern\//.test(r) && !/kern\/(zeit|speicher)\.ts$/.test(r) && /\bnew Date\(|Date\.now\(|Math\.random\(/.test(ohneKommentar)) F(r, 'Uhr oder Zufall ohne Startwert in kern/ (nur zeit.ts)')
  if (/kern\//.test(r) && /from ['"]\.\.?\/(\.\.\/)?host\//.test(q) && !/kern\/speicher\.ts$/.test(r)) F(r, 'kern/ darf host/ nicht importieren (Ausnahme: speicher.ts)')
  if (/\bdark:/.test(q)) F(r, 'Tailwind-„dark:“-Klassen greifen im Tool nie – Farben nur über --dc-…')
}

// ── Soll-Liste für einen Bereich ──
const sollArg = process.argv.indexOf('--soll')
if (sollArg > 0) {
  const b = process.argv[sollArg + 1]
  for (const { k } of kurse.filter(x => x.k.kurs.split('/')[0] === b)) for (const t of k.tage.filter(x => x.art === 'U')) {
    for (const f of t.faehigkeiten) for (const a of t.formate) {
      const n = vorratListe.filter(v => v.kopf.faehigkeit === f && v.art === a && v.kopf.stufe >= t.band[0] - 1 && v.kopf.stufe <= t.band[1] + 1).length
      if (n < 2) console.log(`${t.id}: ${f} × ${a} × Stufe ${t.band.join('–')}: ${n}`)
    }
  }
}

// ── Bericht ──   --nur <bereich> zeigt nur Meldungen zu diesem Bereich (Exitcode ebenso)
const nurArg = process.argv.indexOf('--nur')
const nur = nurArg > 0 ? process.argv[nurArg + 1] : null
const passt = t => !nur || t.includes(`inhalt/${nur}/`) || t.includes(`${nur}-`) || t.includes(`${nur}.`) || t.includes(`${nur}/`) || t.startsWith('_index')
const F2 = fehler.filter(passt), H2 = hinweise.filter(passt)
const zahl = (x, n) => `${x.length} ${n}`
console.log(`Der Coach – Inhalte: ${zahl(einheiten, 'Einheiten')}, ${zahl(lagen, 'Lagen')}, ${zahl(vorrat, 'Vorrats-Einträge')}, ${zahl(missionen, 'Missionen')}, ${zahl(wissen, 'Wissens-Seiten')}, ${zahl(kurse, 'Kurspläne')}`)
if (nur) {
  const zaehle = (liste, f) => liste.filter(f).length
  console.log(`Bereich ${nur}: ${zaehle(einheiten, x => x.e.bereich === nur)} Einheiten, ${zaehle(lagen, x => x.l.bereich === nur)} Lagen, ${zaehle(vorrat, x => x.v.kopf?.faehigkeit?.startsWith(nur + '.'))} Vorrat, ${zaehle(missionen, x => x.m.bereich === nur)} Missionen, ${zaehle(tests, x => x.t.bereich === nur)} Test-Dateien`)
}
for (const h of H2) console.log('Hinweis  ' + h)
for (const f of F2) console.log('FEHLER   ' + f)
console.log(`${F2.length} Fehler, ${H2.length} Hinweise${nur ? ` (nur ${nur}; gesamt ${fehler.length} Fehler)` : ''}`)
process.exit(F2.length ? 1 : 0)
