// Figurenfolgen: Wie sieht das nächste Bild aus? (figural-logisches Denken)
//
// Jedes Bild besteht aus bis zu drei „Spuren“, die sich von Bild zu Bild nach einer Regel ändern:
//   Zeiger  – Pfeil in der Mitte, dreht sich
//   Läufer  – Figur auf einem Ring mit 8 Plätzen, wandert
//   Zähler  – Punkte unten, werden mehr/weniger
//   Kern    – Figur in der Mitte, Füllung wechselt im Dreier-Takt
// Schrittarten: gleichmäßig (immer gleich viel) · wachsend (+1, +2, +3 …) · im Wechsel (nur jedes zweite Mal).
//
// Stufe 1–2: eine Spur, gleichmäßig · 3–5: zwei Spuren · 6: drei Spuren ·
// 7–8: zwei Spuren, eine mit wachsendem Schritt · 9–10: drei Spuren, eine wachsend oder im Wechsel.
import type { Form, FormTyp, Fuellung, FragenGenerator, Szene } from '../kern/typen'
import { S } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { mischeAuswahl } from './hilfen'

type Schritt = 'gleich' | 'wachsend' | 'wechsel'
interface Lauf { a0: number; k: number; art: Schritt }
/** Wert im Bild i (0 = erstes Bild) */
const wert = (l: Lauf, i: number): number =>
  l.a0 + (l.art === 'gleich' ? l.k * i : l.art === 'wachsend' ? l.k * (i * (i + 1)) / 2 : l.k * Math.ceil(i / 2))
const fest = (a0: number): Lauf => ({ a0, k: 0, art: 'gleich' })

interface Spuren {
  zeiger?: { dreh: Lauf }                                   // Schritt in 45°-Einheiten
  laeufer?: { platz: Lauf; form: FormTyp; fuell: Fuellung }  // Platz 0..7 im Uhrzeigersinn, oben = 0
  zaehler?: { anzahl: Lauf }                                 // 1..6 Punkte
  kern?: { fuell: Lauf; form: FormTyp }                      // 0 leer, 1 schraffiert, 2 voll
}
interface Bild { zeiger?: number; laeufer?: number; zaehler?: number; kern?: number }

const mod = (a: number, n: number) => ((a % n) + n) % n
const FUELL: Fuellung[] = ['leer', 'schraffur', 'voll']

function bildVon(s: Spuren, i: number): Bild {
  return {
    zeiger: s.zeiger ? mod(wert(s.zeiger.dreh, i), 8) : undefined,
    laeufer: s.laeufer ? mod(wert(s.laeufer.platz, i), 8) : undefined,
    zaehler: s.zaehler ? wert(s.zaehler.anzahl, i) : undefined,
    kern: s.kern ? mod(wert(s.kern.fuell, i), 3) : undefined,
  }
}
const schluessel = (b: Bild) => `${b.zeiger ?? '-'}|${b.laeufer ?? '-'}|${b.zaehler ?? '-'}|${b.kern ?? '-'}`

function zeichne(s: Spuren, b: Bild): Szene {
  const e: Form[] = []
  // Ring als dünne Hilfslinie, damit die Plätze lesbar sind
  if (s.laeufer) e.push({ typ: 'kreis', x: 50, y: 46, g: 68, ton: 3, dick: 1.2, strich: true })
  if (s.kern && b.kern !== undefined) e.push({ typ: s.kern.form, x: 50, y: 46, g: s.zeiger ? 40 : 30, fuell: FUELL[b.kern], ton: 2, dick: 2.6 })
  if (s.zeiger && b.zeiger !== undefined) e.push({ typ: 'pfeil', x: 50, y: 46, g: 30, dreh: b.zeiger * 45, fuell: 'voll', ton: 0, dick: 2 })
  if (s.laeufer && b.laeufer !== undefined) {
    const w = (-90 + 45 * b.laeufer) * Math.PI / 180
    e.push({ typ: s.laeufer.form, x: 50 + 34 * Math.cos(w), y: 46 + 34 * Math.sin(w), g: 13, fuell: s.laeufer.fuell, ton: 1, dick: 2.4 })
  }
  if (s.zaehler && b.zaehler !== undefined) {
    const n = b.zaehler
    for (let i = 0; i < n; i++) e.push({ typ: 'punkt', x: 50 + (i - (n - 1) / 2) * 11, y: 93, g: 7.5, ton: 0 })
  }
  return { elemente: e }
}

// ── Regeln in Worten ──────────────────────────────────────────────────────────
const artText = (l: Lauf, einheit: (n: number) => string, richtung: (k: number) => string): string => {
  const n = Math.abs(l.k)
  if (l.art === 'gleich') return `jedes Mal ${einheit(n)} ${richtung(l.k)}`
  if (l.art === 'wachsend') return `${richtung(l.k)}, und der Schritt wird jedes Mal größer (${einheit(n)}, dann ${einheit(2 * n)}, dann ${einheit(3 * n)} …)`
  return `nur bei jedem zweiten Bild ${einheit(n)} ${richtung(l.k)}`
}
const uhr = (k: number) => (k > 0 ? 'im Uhrzeigersinn' : 'gegen den Uhrzeigersinn')
function regelTexte(s: Spuren): string[] {
  const t: string[] = []
  if (s.zeiger) t.push(`Der Pfeil dreht sich ${artText(s.zeiger.dreh, n => `um ${n * 45}°`, uhr)}`)
  if (s.laeufer) t.push(`Die kleine Figur wandert ${artText(s.laeufer.platz, n => (n === 1 ? 'einen Platz' : `${n} Plätze`), uhr)}`)
  if (s.zaehler) t.push(`Die Punkte unten: ${artText(s.zaehler.anzahl, n => (n === 1 ? 'einer' : `${n}`), k => (k > 0 ? 'mehr' : 'weniger'))}`)
  if (s.kern) t.push(`Die Füllung der mittleren Figur wechselt ${s.kern.fuell.art === 'wechsel' ? 'bei jedem zweiten Bild' : 'bei jedem Bild'} (leer → gestreift → voll → leer …)`)
  return t
}

// ── Bauen ─────────────────────────────────────────────────────────────────────
const KERNFORMEN: FormTyp[] = ['quadrat', 'kreis', 'sechseck', 'raute']
const LAUFFORMEN: FormTyp[] = ['kreis', 'quadrat', 'dreieck', 'stern']

function schrittArt(r: Rng, stufe: number): Schritt {
  if (stufe >= 9) return r.aus(['wachsend', 'wechsel', 'wechsel'] as Schritt[])
  if (stufe >= 7) return r.aus(['wachsend', 'wachsend', 'gleich'] as Schritt[])
  return 'gleich'
}

function baueSpuren(r: Rng, stufe: number): { spuren: Spuren; bilder: number } {
  const anzahlSpuren = stufe <= 2 ? 1 : stufe <= 5 ? 2 : stufe === 6 ? 3 : stufe <= 8 ? 2 : 3
  // allein taugt der „Kern“ nicht (nur drei Zustände → zu wenige verschiedene Antworten)
  const arten = anzahlSpuren === 1
    ? r.ausN(['zeiger', 'laeufer', 'zaehler'] as const, 1)
    : r.ausN(['zeiger', 'laeufer', 'zaehler', 'kern'] as const, anzahlSpuren)
  const s: Spuren = {}
  // höchstens EINE Spur bekommt die schwierige Schrittart, die anderen bleiben gleichmäßig
  let schwerVergeben = false
  const art = (): Schritt => {
    if (schwerVergeben) return 'gleich'
    const a = schrittArt(r, stufe)
    if (a !== 'gleich') schwerVergeben = true
    return a
  }
  const klein = stufe <= 1
  for (const a of arten) {
    if (a === 'zeiger') s.zeiger = { dreh: { a0: r.int(0, 7), k: (klein ? 2 : r.aus([1, 2, 3])) * r.aus([1, -1]), art: art() } }
    if (a === 'laeufer') s.laeufer = { platz: { a0: r.int(0, 7), k: (klein ? 1 : r.aus([1, 2, 3])) * r.aus([1, -1]), art: art() }, form: r.aus(LAUFFORMEN), fuell: 'voll' }
    if (a === 'zaehler') { const hoch = r.chance(0.6); const sa = art(); s.zaehler = { anzahl: { a0: hoch ? 1 : 6, k: hoch ? 1 : -1, art: sa === 'wachsend' ? 'wechsel' : sa } } }
    if (a === 'kern') { const sa = art(); s.kern = { fuell: { a0: r.int(0, 2), k: 1, art: sa === 'wachsend' ? 'wechsel' : sa }, form: r.aus(KERNFORMEN) } }
  }
  const hatSchwer = [s.zeiger?.dreh, s.laeufer?.platz, s.zaehler?.anzahl, s.kern?.fuell].some(l => l && l.art !== 'gleich')
  return { spuren: s, bilder: hatSchwer ? 5 : 4 }
}

/** Zähler muss in allen Bildern (auch im gesuchten) zwischen 1 und 6 bleiben */
const zaehlerOk = (s: Spuren, bilder: number): boolean => {
  if (!s.zaehler) return true
  for (let i = 0; i <= bilder; i++) { const n = wert(s.zaehler.anzahl, i); if (n < 1 || n > 6) return false }
  return true
}
/** Die gezeigten Bilder müssen sich unterscheiden (sonst ist die Regel nicht ablesbar) */
const lesbar = (s: Spuren, bilder: number): boolean => {
  const k = Array.from({ length: bilder + 1 }, (_, i) => schluessel(bildVon(s, i)))
  return new Set(k).size >= bilder
}

export const erzeuge: FragenGenerator = (r, stufeRoh) => {
  const stufe = klemme(Math.round(stufeRoh), 1, 10)
  let spuren: Spuren = {}, bilder = 4
  for (let v = 0; v < 60; v++) {
    const b = baueSpuren(r, stufe)
    spuren = b.spuren; bilder = b.bilder
    if (zaehlerOk(spuren, bilder) && lesbar(spuren, bilder)) break
  }
  const richtig = bildVon(spuren, bilder)
  // Falsche: je eine Spur um einen kleinen Betrag daneben, dazu „einfach das letzte Bild noch einmal“
  const falsche: Bild[] = [bildVon(spuren, bilder - 1)]
  const dreh = (b: Bild, d: number): Bild => ({ ...b, zeiger: b.zeiger === undefined ? undefined : mod(b.zeiger + d, 8) })
  const platz = (b: Bild, d: number): Bild => ({ ...b, laeufer: b.laeufer === undefined ? undefined : mod(b.laeufer + d, 8) })
  const zahl = (b: Bild, d: number): Bild => ({ ...b, zaehler: b.zaehler === undefined ? undefined : klemme(b.zaehler + d, 1, 7) })
  const kern = (b: Bild, d: number): Bild => ({ ...b, kern: b.kern === undefined ? undefined : mod(b.kern + d, 3) })
  const varianten: ((b: Bild) => Bild)[] = []
  if (spuren.zeiger) varianten.push(b => dreh(b, 1), b => dreh(b, -1), b => dreh(b, 2), b => dreh(b, 4))
  if (spuren.laeufer) varianten.push(b => platz(b, 1), b => platz(b, -1), b => platz(b, 2), b => platz(b, -2))
  if (spuren.zaehler) varianten.push(b => zahl(b, 1), b => zahl(b, -1))
  if (spuren.kern) varianten.push(b => kern(b, 1), b => kern(b, 2))
  for (const v of r.misch(varianten)) falsche.push(v(richtig))
  // Kombinationen, falls es zu wenige verschiedene gibt
  for (const v of r.misch(varianten)) for (const w of r.misch(varianten)) falsche.push(w(v(richtig)))
  const anzahl = stufe <= 3 ? 4 : stufe <= 6 ? 5 : 6
  const { optionen, richtig: index } = mischeAuswahl(r, richtig, falsche, b => S(zeichne(spuren, b)), schluessel, anzahl)
  return {
    aufgabe: 'Welches Bild setzt die Folge fort?',
    zeige: { art: 'folge', teile: [...Array.from({ length: bilder }, (_, i) => zeichne(spuren, bildVon(spuren, i))), null] },
    optionen, richtig: index, spalten: anzahl,
    erklaerung: regelTexte(spuren).join('. ') + '.',
    zeitSek: 35 + stufe * 7,
  }
}
