#!/usr/bin/env node
// Brain Trainer – Weltkarte bauen.
//
// Liest die gemeinfreie Karte „world-atlas“ (Natural Earth 1:110 Mio., TopoJSON) und schreibt daraus
// src/brain/geo/welt.json: alle Länder fertig projiziert als SVG-Pfade, dazu Merkpunkt, Größe,
// Fläche und Nachbarn. Zur Laufzeit wird nichts mehr gerechnet und keine Bibliothek gebraucht.
//
// Aufruf:   node scripts/brain-karte.mjs <Pfad zu countries-110m.json> [--pruefe]
//           --pruefe schreibt zusätzlich Prüflisten auf die Konsole (Nachbarn, kurze Grenzen, Beinahe-Nachbarn).
//
// Projektion: Equal Earth (flächentreu, Šavrič/Patterson/Jenny 2018) – ein kurzes Polynom, keine Bibliothek.
//             Weil sie flächentreu ist, ist die gezeichnete Fläche `f` ein ehrliches Maß für die echte Fläche.
// Zeichenraum: 1000 Einheiten breit, eine Nachkommastelle. Die Antarktis fehlt (kein Staat, frisst nur Platz).
//
// Was bewusst von den Rohdaten abweicht (alles andere bleibt, wie die Karte es zeigt):
//   • Ringe über den 180. Längengrad (Russland, Fidschi) werden „entrollt“ und rechts angesetzt –
//     sonst liefe ein Strich quer über die Karte und Tschukotka läge am linken Rand.
//   • Französisch-Guayana und die Krim sind in den Rohdaten ein eigener Ring eines Landes. Sie werden als
//     eigene, neutrale Fläche geführt: gezeichnet und anklickbar wie alles andere, aber nie Quiz-Ziel.
//     (Am Kartenbild ändert das nichts – alle Flächen sehen gleich aus.)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const quelle = process.argv[2]
const PRUEFE = process.argv.includes('--pruefe')
if (!quelle) {
  console.error('Aufruf: node scripts/brain-karte.mjs <Pfad zu countries-110m.json> [--pruefe]')
  process.exit(1)
}
const ZIEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'brain', 'geo', 'welt.json')

const BREITE = 1000
const RAND = 4
/** Erdradius (flächentreue Kugel) in km – für die Umrechnung Zeichenfläche → km² */
const ERDRADIUS = 6371.0072
/** so nah (in Zeicheneinheiten, etwa 70 km) gelten zwei Länder ohne gemeinsame Grenze als „Beinahe-Nachbarn“ */
const NAH = 2

// ── Kennungen ─────────────────────────────────────────────────────────────────
/** Gebiete ohne ISO-Nummer in den Rohdaten bekommen einen sprechenden Namen als Kennung */
const KENNUNG_OHNE_NUMMER = { 'N. Cyprus': 'nordzypern', Somaliland: 'somaliland', Kosovo: 'kosovo' }
/** Einzelne Ringe, die als eigene neutrale Fläche geführt werden: Land, Fenster [lonVon, lonBis, latVon, latBis], neue Kennung */
const AUFTEILEN = [
  { von: '250', fenster: [-60, -50, 0, 8], id: 'guayana', name: 'French Guiana' },
  { von: '643', fenster: [32, 37, 44, 46.5], id: 'krim', name: 'Crimea' },
]
const WEGLASSEN = new Set(['010']) // Antarktis

/**
 * Handkorrekturen der Nachbarschaft. Die Karte ist stark vereinfacht: am Tschadsee und bei Nachitschewan
 * sind kurze Grenzen beim Vereinfachen verrutscht. Geprüft mit --pruefe (alle Nachbarlisten gegengelesen).
 */
const GRENZE_DAZU = [
  ['148', '566'], // Tschad – Nigeria (rund 85 km im Tschadsee; fehlt in der Karte)
  ['792', '031'], // Türkei – Aserbaidschan (rund 17 km bei Nachitschewan; in der Karte nur ein Berührpunkt)
]
/** Grenzen, die es so nicht gibt oder die strittig sind. Sie fallen weg und gelten als „Beinahe-Nachbarn“. */
const GRENZE_WEG = [
  ['562', '120'], // Niger – Kamerun: in der Karte berühren sie sich im Tschadsee, in Wirklichkeit liegen Tschad und Nigeria dazwischen
  ['072', '894'], // Botswana – Sambia: rund 150 m am Sambesi, je nach Quelle Grenze oder Vierländereck → nie abfragen
]
/**
 * Paare ohne gemeinsame Grenze in der Karte, bei denen „grenzt nicht an“ trotzdem angreifbar wäre
 * (Exklaven, Überseegebiete, Ansprüche). Sie werden wie Beinahe-Nachbarn behandelt: nie behaupten.
 */
const NIE_BEHAUPTEN = [
  ['356', '004'], // Indien – Afghanistan (Kaschmir)
  ['724', '826'], // Spanien – Vereinigtes Königreich (Gibraltar)
  ['724', '504'], // Spanien – Marokko (Ceuta, Melilla)
  ['196', '826'], // Zypern – Vereinigtes Königreich (Militärbasen)
  ['208', '124'], // Dänemark – Kanada (Hans-Insel)
  ['250', '076'], // Frankreich – Brasilien (Französisch-Guayana)
  ['250', '740'], // Frankreich – Suriname (Französisch-Guayana)
  ['250', '528'], // Frankreich – Niederlande (Saint-Martin)
  ['840', '192'], // Vereinigte Staaten – Kuba (Stützpunkt Guantánamo)
]

// ── Ausschnitte (Längen-/Breitenfenster) ──────────────────────────────────────
// Fenster [lonVon, lonBis, latVon, latBis] und Streckung: Equal Earth zeichnet am Äquator zu schlank und im
// Norden zu breit. Für die Erdteil-Ansichten wird die Karte deshalb senkrecht gestreckt bzw. gestaucht
// (ein Faktor je Ansicht), damit die Länder dort so aussehen, wie man sie aus dem Atlas kennt.
const FENSTER = {
  europa: [-25, 45, 34, 72, 1.3],
  afrika: [-20, 53, -36, 38, 0.78],
  asien: [25, 150, -12, 56, 0.9],
  nordamerika: [-170, -50, 5, 75, 1.05],
  suedamerika: [-93, -30, -57, 14, 0.85],
  ozeanien: [110, 181, -48, 2, 0.85],
}

// ── TopoJSON lesen ────────────────────────────────────────────────────────────
const topo = JSON.parse(fs.readFileSync(quelle, 'utf8'))
const [sx, sy] = topo.transform.scale
const [tx, ty] = topo.transform.translate
// Bögen: quantisiert und als Differenzen gespeichert → aufsummieren, dann mit `transform` in Grad umrechnen
const boegen = topo.arcs.map(bogen => {
  let x = 0, y = 0
  return bogen.map(([dx, dy]) => { x += dx; y += dy; return [x * sx + tx, y * sy + ty] })
})
const bogenNr = i => (i < 0 ? ~i : i)
const bogenPunkte = i => (i < 0 ? boegen[~i].slice().reverse() : boegen[i])
/** Ring aus Bogen-Nummern → geschlossene Punktliste (erster Punkt steht am Ende noch einmal) */
function ringPunkte(nummern) {
  const p = []
  for (const i of nummern) {
    const b = bogenPunkte(i)
    for (let k = p.length ? 1 : 0; k < b.length; k++) p.push(b[k])
  }
  return p
}

// ── Projektion: Equal Earth ───────────────────────────────────────────────────
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2
function projiziere(lon, lat) {
  const l = (lon * Math.PI) / 180, p = (lat * Math.PI) / 180
  const t = Math.asin(M * Math.sin(p)), t2 = t * t, t6 = t2 * t2 * t2
  return [
    (l * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))),
    -t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)), // SVG: y nach unten
  ]
}

// ── Geometrie-Helfer ──────────────────────────────────────────────────────────
/** Längengrade eines Rings stetig machen (Sprung über ±180° herausnehmen) */
function entrolle(p) {
  let versatz = 0
  const aus = [[p[0][0], p[0][1]]]
  for (let i = 1; i < p.length; i++) {
    const d = p[i][0] - p[i - 1][0]
    if (d > 180) versatz -= 360
    else if (d < -180) versatz += 360
    aus.push([p[i][0] + versatz, p[i][1]])
  }
  return aus
}
/** Fläche mit Vorzeichen (Schuhband-Formel) */
function flaeche(p) {
  let s = 0
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1])
  return s / 2
}
function rahmen(ringe) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of ringe) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return [x0, y0, x1, y1]
}
/** liegt der Punkt in der Fläche? (gerade/ungerade über alle Ringe, Löcher zählen also mit) */
function drin(x, y, ringe) {
  let c = false
  for (const r of ringe) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
  }
  return c
}
function abstandStrecke(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}
function abstandRinge(x, y, ringe) {
  let m = Infinity
  for (const r of ringe) for (let i = 0, j = r.length - 1; i < r.length; j = i++) m = Math.min(m, abstandStrecke(x, y, r[j][0], r[j][1], r[i][0], r[i][1]))
  return m
}
/**
 * Merkpunkt: der Punkt in der Fläche, der am weitesten vom Rand weg ist (Mittelpunkt des größten
 * Kreises, der hineinpasst). Grobes Gitter, dann viermal um den besten Punkt verfeinern.
 */
function innenpunkt(ringe) {
  const [x0, y0, x1, y1] = rahmen(ringe)
  let schritt = Math.max(x1 - x0, y1 - y0) / 24
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: -1 }
  const pruefe = (x, y) => {
    if (!drin(x, y, ringe)) return
    const r = abstandRinge(x, y, ringe)
    if (r > best.r) best = { x, y, r }
  }
  for (let x = x0; x <= x1 + 1e-9; x += schritt) for (let y = y0; y <= y1 + 1e-9; y += schritt) pruefe(x, y)
  for (let runde = 0; runde < 5; runde++) {
    const { x: mx, y: my } = best
    const s = schritt / 4
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) pruefe(mx + i * s, my + j * s)
    schritt = s
  }
  if (best.r < 0) {
    // entartete Fläche: Schwerpunkt der Ecken
    const p = ringe[0]
    best = { x: p.reduce((s, q) => s + q[0], 0) / p.length, y: p.reduce((s, q) => s + q[1], 0) / p.length, r: 0 }
  }
  return best
}

// ── Länder aufbauen ───────────────────────────────────────────────────────────
/** @type {{ id: string, name: string, vielecke: { nummern: number[][], grad: number[][][] }[] }[]} */
const gebiete = []
for (const g of topo.objects.countries.geometries) {
  const id = g.id ?? KENNUNG_OHNE_NUMMER[g.properties.name]
  if (!id) throw new Error('Gebiet ohne Kennung: ' + g.properties.name)
  if (WEGLASSEN.has(id)) continue
  const roh = g.type === 'Polygon' ? [g.arcs] : g.arcs
  const vielecke = roh.map(ringe => ({
    nummern: ringe,
    grad: ringe.map(nummern => {
      const p = entrolle(ringPunkte(nummern))
      const a = p[0], z = p[p.length - 1]
      if (Math.abs(a[0] - z[0]) > 1e-6 || Math.abs(a[1] - z[1]) > 1e-6) throw new Error('Ring schließt nicht: ' + g.properties.name)
      p.pop()
      return p
    }),
  }))
  // einzelne Ringe als eigene neutrale Fläche abspalten
  for (const regel of AUFTEILEN.filter(r => r.von === id)) {
    const [l0, l1, b0, b1] = regel.fenster
    const treffer = vielecke.filter(v => {
      const [x0, y0, x1, y1] = rahmen([v.grad[0]])
      return x0 >= l0 && x1 <= l1 && y0 >= b0 && y1 <= b1
    })
    if (treffer.length !== 1) throw new Error(`Aufteilen ${regel.id}: ${treffer.length} Ringe im Fenster (erwartet 1)`)
    vielecke.splice(vielecke.indexOf(treffer[0]), 1)
    gebiete.push({ id: regel.id, name: regel.name, vielecke: treffer })
  }
  gebiete.push({ id, name: g.properties.name, vielecke })
}

// Ringe jenseits des 180. Längengrads an das Hauptland ansetzen (Wrangel-Insel, Fidschi)
for (const g of gebiete) {
  let haupt = g.vielecke[0], groesste = -1
  for (const v of g.vielecke) {
    const f = Math.abs(flaeche(v.grad[0].map(([l, b]) => projiziere(l, b))))
    if (f > groesste) { groesste = f; haupt = v }
  }
  const mitte = v => { const [x0, , x1] = rahmen([v.grad[0]]); return (x0 + x1) / 2 }
  const bezug = mitte(haupt)
  for (const v of g.vielecke) {
    const versatz = Math.round((bezug - mitte(v)) / 360) * 360
    if (versatz) v.grad = v.grad.map(r => r.map(([l, b]) => [l + versatz, b]))
  }
  g.haupt = haupt
}

// ── projizieren und in den Zeichenraum legen ──────────────────────────────────
for (const g of gebiete) for (const v of g.vielecke) v.roh = v.grad.map(r => r.map(([l, b]) => projiziere(l, b)))
const [gx0, gy0, gx1, gy1] = rahmen(gebiete.flatMap(g => g.vielecke.flatMap(v => v.roh)))
const MASS = (BREITE - 2 * RAND) / (gx1 - gx0)
const HOEHE = Math.ceil((gy1 - gy0) * MASS + 2 * RAND)
const zeichne = ([x, y]) => [(x - gx0) * MASS + RAND, (y - gy0) * MASS + RAND]
for (const g of gebiete) for (const v of g.vielecke) v.punkte = v.roh.map(r => r.map(zeichne))
/** km² je Flächeneinheit des Zeichenraums */
const KM2 = (ERDRADIUS / MASS) ** 2

// ── SVG-Pfad: relativ, eine Nachkommastelle, so knapp wie möglich ─────────────
const zehntel = x => Math.round(x * 10)
function zahl(n) {
  // n in Zehnteln → „1.2“, „.5“, „-3“
  const v = n < 0 ? '-' : ''
  const a = Math.abs(n)
  const ganz = Math.floor(a / 10), rest = a % 10
  return v + (ganz || !rest ? String(ganz) : '') + (rest ? '.' + rest : '')
}
function pfad(g) {
  let d = ''
  let letzte = ''
  const dazu = t => {
    // Trenner nur, wo er nötig ist: nicht vor „-“ und nicht vor „.“ nach einer Zahl mit Komma
    if (letzte && !/[a-z]$/i.test(d) && !(t[0] === '-') && !(t[0] === '.' && letzte.includes('.'))) d += ' '
    d += t; letzte = t
  }
  let stand = [0, 0]
  let erster = true
  for (const v of g.vielecke) {
    for (const ring of v.punkte) {
      const p = []
      for (const q of ring) {
        const z = [zehntel(q[0]), zehntel(q[1])]
        if (!p.length || p[p.length - 1][0] !== z[0] || p[p.length - 1][1] !== z[1]) p.push(z)
      }
      while (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop()
      if (p.length < 3) continue // beim Runden zu einem Strich zusammengefallen
      // ein kleines „m“ am Pfadanfang gilt als absolut, alle folgenden Paare sind relative Linien
      d += 'm'; letzte = ''
      dazu(zahl(erster ? p[0][0] : p[0][0] - stand[0])); dazu(zahl(erster ? p[0][1] : p[0][1] - stand[1]))
      for (let i = 1; i < p.length; i++) { dazu(zahl(p[i][0] - p[i - 1][0])); dazu(zahl(p[i][1] - p[i - 1][1])) }
      d += 'z'; letzte = ''
      stand = p[0]; erster = false
    }
  }
  return d
}

// ── Nachbarn: Länder, die sich einen Bogen teilen ─────────────────────────────
const bogenBesitzer = new Map()
for (const g of gebiete) for (const v of g.vielecke) for (const ring of v.nummern) for (const i of ring) {
  const k = bogenNr(i)
  if (!bogenBesitzer.has(k)) bogenBesitzer.set(k, new Set())
  bogenBesitzer.get(k).add(g.id)
}
const paar = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)
/** Paar → Länge der gemeinsamen Grenze in Zeicheneinheiten */
const grenzen = new Map()
for (const [k, besitzer] of bogenBesitzer) {
  if (besitzer.size < 2) continue
  const p = boegen[k].map(([l, b]) => projiziere(l, b))
  let laenge = 0
  for (let i = 1; i < p.length; i++) laenge += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) * MASS
  const ids = [...besitzer]
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) grenzen.set(paar(ids[i], ids[j]), (grenzen.get(paar(ids[i], ids[j])) ?? 0) + laenge)
}
const kennt = new Set(gebiete.map(g => g.id))
for (const [a, b] of GRENZE_DAZU) { if (!kennt.has(a) || !kennt.has(b)) throw new Error(`GRENZE_DAZU: unbekannt ${a}/${b}`); if (!grenzen.has(paar(a, b))) grenzen.set(paar(a, b), 0) }
for (const [a, b] of GRENZE_WEG) { if (!grenzen.delete(paar(a, b))) throw new Error(`GRENZE_WEG: keine Grenze ${a}/${b}`) }
for (const [a, b] of NIE_BEHAUPTEN) { if (!kennt.has(a) || !kennt.has(b)) throw new Error(`NIE_BEHAUPTEN: unbekannt ${a}/${b}`); if (grenzen.has(paar(a, b))) throw new Error(`NIE_BEHAUPTEN: ${a}/${b} sind in der Karte Nachbarn`) }
const nachbarn = new Map(gebiete.map(g => [g.id, []]))
for (const k of grenzen.keys()) { const [a, b] = k.split('|'); nachbarn.get(a).push(b); nachbarn.get(b).push(a) }

// ── Beinahe-Nachbarn: keine gemeinsame Grenze, aber näher als NAH ─────────────
const alleRinge = new Map(gebiete.map(g => [g.id, g.vielecke.map(v => v.punkte[0])]))
const rahmenVon = new Map(gebiete.map(g => [g.id, rahmen(alleRinge.get(g.id))]))
function abstandGebiete(a, b) {
  const ra = alleRinge.get(a), rb = alleRinge.get(b)
  let m = Infinity
  for (const r of ra) for (const [x, y] of r) m = Math.min(m, abstandRinge(x, y, rb))
  for (const r of rb) for (const [x, y] of r) m = Math.min(m, abstandRinge(x, y, ra))
  return m
}
const nah = new Map(gebiete.map(g => [g.id, []]))
const nahListe = []
const vonHand = new Set([...GRENZE_WEG, ...NIE_BEHAUPTEN].map(([a, b]) => paar(a, b)))
for (let i = 0; i < gebiete.length; i++) for (let j = i + 1; j < gebiete.length; j++) {
  const a = gebiete[i].id, b = gebiete[j].id
  if (grenzen.has(paar(a, b))) continue
  if (vonHand.has(paar(a, b))) { nah.get(a).push(b); nah.get(b).push(a); nahListe.push([-1, gebiete[i].name, gebiete[j].name]); continue }
  const [ax0, ay0, ax1, ay1] = rahmenVon.get(a), [bx0, by0, bx1, by1] = rahmenVon.get(b)
  if (ax0 - NAH > bx1 || bx0 - NAH > ax1 || ay0 - NAH > by1 || by0 - NAH > ay1) continue
  const m = abstandGebiete(a, b)
  if (m < NAH) { nah.get(a).push(b); nah.get(b).push(a); nahListe.push([m, gebiete[i].name, gebiete[j].name]) }
}

// ── Ausschnitte ───────────────────────────────────────────────────────────────
/** Name → [x, y, Breite, Höhe, senkrechte Streckung] im Zeichenraum */
const ausschnitte = { welt: [0, 0, BREITE, HOEHE, 1] }
for (const [name, [l0, l1, b0, b1, streckung]] of Object.entries(FENSTER)) {
  const rand = []
  for (let i = 0; i <= 24; i++) {
    const l = l0 + ((l1 - l0) * i) / 24, b = b0 + ((b1 - b0) * i) / 24
    rand.push(zeichne(projiziere(l, b0)), zeichne(projiziere(l, b1)), zeichne(projiziere(l0, b)), zeichne(projiziere(l1, b)))
  }
  const [x0, y0, x1, y1] = rahmen([rand])
  const xa = Math.max(0, Math.floor(x0)), ya = Math.max(0, Math.floor(y0))
  ausschnitte[name] = [xa, ya, Math.min(BREITE, Math.ceil(x1)) - xa, Math.min(HOEHE, Math.ceil(y1)) - ya, streckung]
}

// ── Ausgabe ───────────────────────────────────────────────────────────────────
const r1 = x => Math.round(x * 10) / 10
const r2 = x => Math.round(x * 100) / 100
const sortiert = l => l.slice().sort()
const laender = gebiete.map(g => {
  const haupt = g.haupt.punkte
  const punkt = innenpunkt(haupt)
  const [x0, y0, x1, y1] = rahmen([haupt[0]])
  let f = 0
  for (const v of g.vielecke) v.punkte.forEach((ring, i) => { f += (i ? -1 : 1) * Math.abs(flaeche(ring)) })
  const land = { id: g.id, d: pfad(g), x: r1(punkt.x), y: r1(punkt.y), b: r1(x1 - x0), h: r1(y1 - y0), f: r2(f), r: r2(punkt.r), nachbarn: sortiert(nachbarn.get(g.id)) }
  if (nah.get(g.id).length) land.nah = sortiert(nah.get(g.id))
  return land
})
// proj: Zeichenpunkt = Equal-Earth-Punkt · k + (x, y) – damit lässt sich ein Punkt bei Bedarf zurückrechnen
const r5 = x => Math.round(x * 1e5) / 1e5
const welt = {
  breite: BREITE, hoehe: HOEHE, km2: Math.round(KM2 * 10) / 10,
  proj: { k: r5(MASS), x: r5(RAND - gx0 * MASS), y: r5(RAND - gy0 * MASS) },
  ausschnitte, laender,
}
fs.mkdirSync(path.dirname(ZIEL), { recursive: true })
const text = JSON.stringify(welt)
fs.writeFileSync(ZIEL, text + '\n', 'utf8')

const name = new Map(gebiete.map(g => [g.id, g.name]))
if (PRUEFE) {
  console.log('\n── Nachbarn ──')
  for (const g of gebiete) console.log(`${g.id.padEnd(11)} ${g.name}: ${sortiert(nachbarn.get(g.id).map(n => name.get(n))).join(', ') || '—'}`)
  console.log('\n── kurze Grenzen (< 1,5 Einheiten ≈ 50 km) ──')
  for (const [k, laenge] of [...grenzen].sort((a, b) => a[1] - b[1])) if (laenge < 1.5) { const [a, b] = k.split('|'); console.log(`${laenge.toFixed(2).padStart(5)}  ${name.get(a)} – ${name.get(b)}`) }
  console.log(`\n── Beinahe-Nachbarn (Abstand < ${NAH} Einheiten, keine gemeinsame Grenze) ──`)
  for (const [m, a, b] of nahListe.sort((p, q) => p[0] - q[0])) console.log(`${(m < 0 ? 'Hand' : m.toFixed(2)).padStart(5)}  ${a} – ${b}`)
  console.log('\n── Flächen (km², aus der Karte) ──')
  for (const l of laender.slice().sort((a, b) => b.f - a.f)) console.log(`${String(Math.round(l.f * KM2)).padStart(9)}  ${name.get(l.id)}  (r ${l.r}, ${l.b}×${l.h})`)
  console.log('\n── Ausschnitte ──')
  console.log(JSON.stringify(ausschnitte))
}
console.log(`welt.json: ${laender.length} Länder und Gebiete, ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB, Zeichenraum ${BREITE} × ${HOEHE}, 1 Einheit² = ${KM2.toFixed(1)} km²`)
console.log(`geschrieben: ${ZIEL}`)
