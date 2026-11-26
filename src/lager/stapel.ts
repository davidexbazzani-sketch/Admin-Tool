// „Lager einsehen“ — Geräte eines Fachs (oder Bodenbereichs) als Stapel anordnen. Reine Funktion,
// genutzt von der 3D-Ansicht und den Tests. Lokale Koordinaten im Fach:
//   u = von links, v = nach oben ab Boden-Oberkante, w = von vorne nach hinten (alles in Metern).

import { TYP_REIHE, type LagerTyp } from './typen'

export interface Kasten { breite: number; tiefe: number; hoehe: number }

export interface StapelGeraet { serial: string; typ: LagerTyp; markiert?: boolean }

export interface Platzierung {
  serial: string
  typ: LagerTyp
  /** Mitte unten des Geräts */
  u: number
  v: number
  w: number
  /** Maße (Breite, Höhe, Tiefe) */
  b: number
  h: number
  t: number
  /** kleine Drehung um die Hochachse (Bogenmaß), damit Stapel nicht wie gedruckt wirken */
  dreh: number
  markiert: boolean
}

export interface StapelGruppe {
  typ: LagerTyp
  anzahl: number
  gezeichnet: number
  /** belegte Breite */
  u0: number
  u1: number
  /** Oberkante des höchsten Stapels */
  oben: number
  serials: string[]
}

export interface StapelErgebnis { platz: Platzierung[]; gruppen: StapelGruppe[] }

interface Mass { b: number; h: number; t: number; max: number }

/** Abstand zwischen zwei Stapeln derselben Art (Tower stehen sichtbar getrennt). */
const abstandVon = (typ: LagerTyp) => (typ === 'tower' ? 0.03 : typ === 'minipc' ? 0.014 : 0.01)

/** Gerätemaße (aus den Fotos geschätzt). Tower stehen, wenn das Fach hoch genug ist, sonst liegen sie. */
export function geraeteMass(typ: LagerTyp, fachHoehe: number): Mass {
  switch (typ) {
    case 'minipc': return { b: 0.177, h: 0.034, t: 0.175, max: 8 }
    case 'elitebook': return { b: 0.32, h: 0.02, t: 0.22, max: 10 }
    case 'zbook': return { b: 0.36, h: 0.026, t: 0.25, max: 8 }
    case 'tower': return fachHoehe >= 0.42 ? { b: 0.17, h: 0.40, t: 0.38, max: 1 } : { b: 0.40, h: 0.17, t: 0.36, max: 2 }
    default: return { b: 0.30, h: 0.09, t: 0.28, max: 3 }
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967295
}

const RAND = 0.03

export function stapele(kasten: Kasten, geraete: StapelGeraet[]): StapelErgebnis {
  const gruppenRoh = TYP_REIHE.map(typ => {
    const g = geraete.filter(x => x.typ === typ)
    // markierte zuletzt → landen oben/vorne
    g.sort((a, b) => Number(!!a.markiert) - Number(!!b.markiert) || a.serial.localeCompare(b.serial))
    const m = geraeteMass(typ, kasten.hoehe)
    const proStapel = Math.max(1, Math.min(m.max, Math.floor((kasten.hoehe - 0.015) / m.h)))
    const reihen = Math.max(1, Math.floor((kasten.tiefe - 0.01) / m.t))
    const proSpalte = proStapel * reihen
    return { typ, g, m, p: m.b + abstandVon(typ), proStapel, reihen, proSpalte, bedarf: Math.ceil(g.length / proSpalte), spalten: 0 }
  }).filter(x => x.g.length > 0)

  if (!gruppenRoh.length) return { platz: [], gruppen: [] }

  const W = kasten.breite - 2 * RAND
  const breiteMit = (luecke: number, sp: (x: typeof gruppenRoh[number]) => number) =>
    gruppenRoh.reduce((s, x) => s + sp(x) * x.p - (x.p - x.m.b), 0) + (gruppenRoh.length - 1) * luecke

  // Abstände zwischen Stapeln nur, wenn dann noch alles passt
  if (breiteMit(0.01, x => x.bedarf) > W) for (const x of gruppenRoh) x.p = x.m.b
  let luecke = 0.04
  let massstab = 1
  if (breiteMit(luecke, x => x.bedarf) <= W) {
    for (const x of gruppenRoh) x.spalten = x.bedarf
  } else {
    luecke = 0.01
    if (breiteMit(luecke, x => x.bedarf) <= W) {
      for (const x of gruppenRoh) x.spalten = x.bedarf
    } else {
      // jede Gruppe bekommt mindestens eine Spalte, der Rest nach Bedarf
      for (const x of gruppenRoh) x.spalten = 1
      const eine = breiteMit(luecke, () => 1)
      if (eine > W) {
        massstab = W / eine          // zu schmal selbst für je einen Stapel → etwas kleiner zeichnen
      } else {
        let frei = W - eine
        for (;;) {
          const kandidat = gruppenRoh
            .filter(x => x.spalten < x.bedarf && x.p <= frei)
            .sort((a, b) => (b.bedarf - b.spalten) / b.bedarf - (a.bedarf - a.spalten) / a.bedarf)[0]
          if (!kandidat) break
          kandidat.spalten++
          frei -= kandidat.p
        }
      }
    }
  }

  const platz: Platzierung[] = []
  const gruppen: StapelGruppe[] = []
  let cursor = RAND
  for (const x of gruppenRoh) {
    const b = x.m.b * massstab, t = x.m.t * Math.min(1, massstab + 0.1), h = x.m.h
    const pitch = x.p * massstab
    const kap = x.spalten * x.proSpalte
    const gezeichnet = Math.min(x.g.length, kap)
    let oben = 0
    for (let i = 0; i < gezeichnet; i++) {
      const spalte = Math.floor(i / x.proSpalte)
      const inSpalte = i % x.proSpalte
      // hinten zuerst füllen, damit die letzten (markierten) vorne oben liegen
      const reihe = x.reihen - 1 - Math.floor(inSpalte / x.proStapel)
      const ebene = inSpalte % x.proStapel
      const d = x.g[i]
      const r = hash(d.serial)
      const lose = x.typ === 'tower' ? 0.3 : 1
      platz.push({
        serial: d.serial, typ: x.typ,
        u: cursor + spalte * pitch + b / 2 + (r - 0.5) * 0.006 * lose,
        v: ebene * h,
        w: 0.01 + reihe * t + t / 2 + (hash(d.serial + 'w') - 0.5) * 0.006 * lose,
        b, h, t,
        dreh: (hash(d.serial + 'd') - 0.5) * 0.05 * lose,
        markiert: !!d.markiert,
      })
      oben = Math.max(oben, (ebene + 1) * h)
    }
    const u1 = cursor + Math.max(1, Math.min(x.spalten, Math.ceil(gezeichnet / x.proSpalte))) * pitch - (pitch - b)
    gruppen.push({ typ: x.typ, anzahl: x.g.length, gezeichnet, u0: cursor, u1, oben, serials: x.g.map(d => d.serial) })
    cursor += x.spalten * pitch - (pitch - b) + luecke
  }
  return { platz, gruppen }
}
