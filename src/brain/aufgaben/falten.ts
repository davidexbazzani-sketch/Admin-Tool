// Papier falten und lochen: Ein quadratisches Blatt wird gefaltet, dann gelocht.
// Wie sieht es aus, wenn man es wieder auffaltet? (räumliches Vorstellen in mehreren Schritten)
//
// Stufe 1: 1 Faltung, 1 Loch · 2: 1 Faltung, 2 Löcher · 3: 2 Faltungen über Kreuz, 1 Loch ·
// 4: 2 Faltungen in dieselbe Richtung · 5: 2 Faltungen, 2 Löcher · 6: 3 Faltungen, 1 Loch ·
// 7–8: 3 Faltungen, 2 Löcher · 9: 4 Faltungen, 1 Loch · 10: 4 Faltungen, 2 Löcher.
// Jede Faltung halbiert das Blatt; beim Auffalten spiegelt sich jedes Loch an der Faltkante.
import type { Form, FragenGenerator, Szene } from '../kern/typen'
import { S } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { mischeAuswahl } from './hilfen'

/** LR = linke Hälfte nach rechts klappen (es bleibt die rechte Hälfte liegen) usw. */
export type Falz = 'LR' | 'RL' | 'OU' | 'UO'
export interface Bereich { x0: number; x1: number; y0: number; y1: number }
export type Punkt = [number, number]

const senkrecht = (f: Falz) => f === 'LR' || f === 'RL'
export function falteBereich(b: Bereich, f: Falz): { bereich: Bereich; achse: number } {
  if (senkrecht(f)) { const m = (b.x0 + b.x1) / 2; return { bereich: f === 'LR' ? { ...b, x0: m } : { ...b, x1: m }, achse: m } }
  const m = (b.y0 + b.y1) / 2
  return { bereich: f === 'OU' ? { ...b, y0: m } : { ...b, y1: m }, achse: m }
}
const rund = (v: number) => Math.round(v * 1000) / 1000
const schluessel = (p: Punkt[]) => p.map(([x, y]) => `${rund(x)},${rund(y)}`).sort().join(';')
const eindeutig = (p: Punkt[]): Punkt[] => { const s = new Set<string>(); return p.filter(([x, y]) => { const k = `${rund(x)},${rund(y)}`; if (s.has(k)) return false; s.add(k); return true }) }

/** Auffalten: die Faltungen rückwärts, jedes Loch an der Faltkante spiegeln. `auslassen` überspringt eine Faltung (für falsche Antworten). */
export function entfalte(loecher: Punkt[], falze: Falz[], achsen: number[], auslassen = -1, falscheRichtung = -1): Punkt[] {
  let p = loecher.slice()
  for (let i = falze.length - 1; i >= 0; i--) {
    if (i === auslassen) continue
    const vert = senkrecht(falze[i]) !== (i === falscheRichtung)
    p = eindeutig([...p, ...p.map(([x, y]) => (vert ? [2 * achsen[i] - x, y] : [x, 2 * achsen[i] - y]) as Punkt)])
  }
  return p.filter(([x, y]) => x > 0 && x < 1 && y > 0 && y < 1)
}

interface Plan { falze: number; loecher: number; art: 'kreuz' | 'gleich' | 'frei'; optionen: number }
const PLAN: Plan[] = [
  { falze: 1, loecher: 1, art: 'frei', optionen: 4 },
  { falze: 1, loecher: 2, art: 'frei', optionen: 4 },
  { falze: 2, loecher: 1, art: 'kreuz', optionen: 4 },
  { falze: 2, loecher: 1, art: 'gleich', optionen: 4 },
  { falze: 2, loecher: 2, art: 'frei', optionen: 4 },
  { falze: 3, loecher: 1, art: 'frei', optionen: 4 },
  { falze: 3, loecher: 2, art: 'frei', optionen: 4 },
  { falze: 3, loecher: 2, art: 'frei', optionen: 5 },
  { falze: 4, loecher: 1, art: 'frei', optionen: 5 },
  { falze: 4, loecher: 2, art: 'frei', optionen: 6 },
]

export interface Faltung { falze: Falz[]; achsen: number[]; bereiche: Bereich[]; loecher: Punkt[] }

export function baue(r: Rng, stufe: number): Faltung {
  const plan = PLAN[klemme(Math.round(stufe), 1, 10) - 1]
  // Richtungen: höchstens zwei Faltungen je Richtung (sonst wird der Streifen zu schmal)
  let richtungen: boolean[]            // true = senkrechte Faltkante
  if (plan.art === 'kreuz') richtungen = r.misch([true, false])
  else if (plan.art === 'gleich') { const v = r.chance(0.5); richtungen = [v, v] }
  else {
    do { richtungen = Array.from({ length: plan.falze }, () => r.chance(0.5)) }
    while (richtungen.filter(Boolean).length > 2 || richtungen.filter(x => !x).length > 2)
  }
  const falze: Falz[] = richtungen.map(v => (v ? r.aus(['LR', 'RL'] as Falz[]) : r.aus(['OU', 'UO'] as Falz[])))
  const achsen: number[] = [], bereiche: Bereich[] = [{ x0: 0, x1: 1, y0: 0, y1: 1 }]
  for (const f of falze) {
    const { bereich, achse } = falteBereich(bereiche[bereiche.length - 1], f)
    achsen.push(achse); bereiche.push(bereich)
  }
  const b = bereiche[bereiche.length - 1]
  const gitter: Punkt[] = []
  for (const fx of [0.25, 0.5, 0.75]) for (const fy of [0.25, 0.5, 0.75]) gitter.push([b.x0 + fx * (b.x1 - b.x0), b.y0 + fy * (b.y1 - b.y0)])
  return { falze, achsen, bereiche, loecher: r.ausN(gitter, plan.loecher) }
}

// ── Zeichnen ──────────────────────────────────────────────────────────────────
const s = (v: number) => 10 + 80 * v
const blatt = (b: Bereich, gestrichelt: boolean): Form => ({
  typ: 'rechteck', x: s((b.x0 + b.x1) / 2), y: s((b.y0 + b.y1) / 2), b: 80 * (b.x1 - b.x0), h: 80 * (b.y1 - b.y0),
  fuell: gestrichelt ? 'leer' : 'halb', ton: gestrichelt ? 3 : 1, dick: gestrichelt ? 1.4 : 2.2, strich: gestrichelt,
})
const loch = ([x, y]: Punkt, gross: boolean): Form => ({ typ: 'punkt', x: s(x), y: s(y), g: gross ? 6 : 5, ton: 0 })
const GANZ: Bereich = { x0: 0, x1: 1, y0: 0, y1: 1 }

function schrittBilder(f: Faltung): { bilder: Szene[]; texte: string[] } {
  const bilder: Szene[] = [{ elemente: [blatt(GANZ, false)] }]
  const texte = ['Blatt']
  f.falze.forEach((falz, i) => {
    const b = f.bereiche[i + 1]
    // Faltkante hervorheben
    const kante: Form = senkrecht(falz)
      ? { typ: 'linie', x: s(f.achsen[i]), y: s(b.y0), x2: s(f.achsen[i]), y2: s(b.y1), ton: 2, dick: 3.4 }
      : { typ: 'linie', x: s(b.x0), y: s(f.achsen[i]), x2: s(b.x1), y2: s(f.achsen[i]), ton: 2, dick: 3.4 }
    bilder.push({ elemente: [blatt(GANZ, true), blatt(b, false), kante] })
    texte.push(`${i + 1}. Faltung`)
  })
  const ende = f.bereiche[f.bereiche.length - 1]
  bilder.push({ elemente: [blatt(GANZ, true), blatt(ende, false), ...f.loecher.map(p => loch(p, true))] })
  texte.push('lochen')
  return { bilder, texte }
}
const aufgefaltet = (p: Punkt[]): Szene => ({ elemente: [blatt(GANZ, false), ...p.map(q => loch(q, false))] })

export const erzeuge: FragenGenerator = (r, stufeRoh) => {
  const stufe = klemme(Math.round(stufeRoh), 1, 10)
  const plan = PLAN[stufe - 1]
  const f = baue(r, stufe)
  const richtig = entfalte(f.loecher, f.falze, f.achsen)
  // Falsche: typische Denkfehler zuerst
  const falsche: Punkt[][] = [
    f.loecher,                                                              // gar nicht aufgefaltet
    ...f.falze.map((_, i) => entfalte(f.loecher, f.falze, f.achsen, i)),    // eine Faltung vergessen
    ...f.falze.map((_, i) => entfalte(f.loecher, f.falze, f.achsen, -1, i)), // an der falschen Richtung gespiegelt
    richtig.map(([x, y]) => [1 - x, y] as Punkt),                           // seitenverkehrt
    richtig.map(([x, y]) => [x, 1 - y] as Punkt),                           // auf dem Kopf
    richtig.slice(1),                                                       // ein Loch zu wenig
  ]
  // falls das nicht reicht (symmetrische Fälle): richtig aufgefaltete Muster ANDERER Lochlagen
  const b = f.bereiche[f.bereiche.length - 1]
  for (const fx of r.misch([0.25, 0.5, 0.75])) for (const fy of r.misch([0.25, 0.5, 0.75])) {
    const anders: Punkt[] = [[b.x0 + fx * (b.x1 - b.x0), b.y0 + fy * (b.y1 - b.y0)], ...f.loecher.slice(1)]
    falsche.push(entfalte(eindeutig(anders), f.falze, f.achsen))
  }
  const brauchbar = falsche.filter(p => p.length > 0)
  const { optionen, richtig: index } = mischeAuswahl(r, richtig, brauchbar, p => S(aufgefaltet(p)), schluessel, plan.optionen)
  const { bilder, texte } = schrittBilder(f)
  return {
    aufgabe: 'Das Blatt wird gefaltet und dann gelocht. Wie sieht es aufgefaltet aus?',
    zeige: { art: 'schritte', teile: bilder, texte },
    optionen, richtig: index, spalten: plan.optionen,
    erklaerung: `Beim Auffalten spiegelt sich jedes Loch an der Faltkante — rückwärts, die letzte Faltung zuerst. Aus ${f.loecher.length === 1 ? 'einem Loch' : `${f.loecher.length} Löchern`} werden so ${richtig.length}.`,
    zeitSek: 35 + stufe * 8,
  }
}
