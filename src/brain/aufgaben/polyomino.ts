// Figuren aus Kästchen (Polyominos) — gemeinsame Grundlage für „Mentale Rotation“, „Spiegelbild“
// und „Was passt nicht?“. Wichtig ist die Händigkeit: Eine Figur heißt hier „händig“, wenn ihr
// Spiegelbild durch KEINE Drehung mit ihr zur Deckung kommt (wie linke und rechte Hand).
import type { Form, Szene } from '../kern/typen'
import type { Rng } from '../kern/zufall'

export type Zellen = [number, number][]

/** nach links oben schieben und sortieren */
export function normal(z: Zellen): Zellen {
  const mx = Math.min(...z.map(p => p[0])), my = Math.min(...z.map(p => p[1]))
  return z.map(([x, y]) => [x - mx, y - my] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0])
}
/** Vierteldrehungen im Uhrzeigersinn */
export function drehe(z: Zellen, viertel: number): Zellen {
  let k = normal(z)
  for (let i = 0; i < (((viertel % 4) + 4) % 4); i++) k = normal(k.map(([x, y]) => [-y, x] as [number, number]))
  return k
}
/** an der senkrechten Achse spiegeln */
export const spiegle = (z: Zellen): Zellen => normal(z.map(([x, y]) => [-x, y] as [number, number]))
export const schluesselVon = (z: Zellen): string => normal(z).map(p => p.join(',')).join(';')
/** kleinster Schlüssel über alle vier Drehungen = Kennung „bis auf Drehung“ */
export const drehKennung = (z: Zellen): string => [0, 1, 2, 3].map(v => schluesselVon(drehe(z, v))).sort()[0]
export const gleichBisAufDrehung = (a: Zellen, b: Zellen): boolean => drehKennung(a) === drehKennung(b)
export const istHaendig = (z: Zellen): boolean => !gleichBisAufDrehung(z, spiegle(z))
/** Zahl der verschiedenen Lagen bei Vierteldrehungen (1, 2 oder 4) */
export const drehLagen = (z: Zellen): number => new Set([0, 1, 2, 3].map(v => schluesselVon(drehe(z, v)))).size

/**
 * Bekannte händige Figuren (4 und 5 Kästchen) mit VIER verschiedenen Drehlagen.
 * (S und Z fehlen bewusst: sie sehen nach einer halben Drehung gleich aus.)
 */
export const HAENDIG: Zellen[] = [
  [[0, 0], [0, 1], [0, 2], [1, 2]],                 // L
  [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],         // F
  [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],         // P
  [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3]],         // N
  [[0, 1], [1, 0], [1, 1], [1, 2], [1, 3]],         // Y
  [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]],         // langes L
]
/** Eine feste Figur mit `n` Kästchen in zufälliger Lage und Händigkeit (mehr Abwechslung) */
export function festeFigur(r: Rng, n: number): Zellen {
  const basis = r.aus(HAENDIG.filter(h => h.length === n))
  return drehe(r.chance(0.5) ? spiegle(basis) : basis, r.int(0, 3))
}

/**
 * Zufällige händige Figur mit `n` Kästchen (wächst Kästchen für Kästchen), mit vier verschiedenen Drehlagen.
 * `maxKante` begrenzt die Ausdehnung, damit sie ins Bild passt.
 */
export function zufallsFigur(r: Rng, n: number, maxKante = 4): Zellen {
  for (let versuch = 0; versuch < 200; versuch++) {
    const z: Zellen = [[0, 0]]
    const hat = (x: number, y: number) => z.some(p => p[0] === x && p[1] === y)
    let sicherung = 0
    while (z.length < n && sicherung++ < 400) {
      const [bx, by] = r.aus(z)
      const [dx, dy] = r.aus([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][])
      const x = bx + dx, y = by + dy
      if (hat(x, y)) continue
      const xs = [...z.map(p => p[0]), x], ys = [...z.map(p => p[1]), y]
      if (Math.max(...xs) - Math.min(...xs) >= maxKante || Math.max(...ys) - Math.min(...ys) >= maxKante) continue
      z.push([x, y])
    }
    if (z.length === n && istHaendig(z) && drehLagen(z) === 4) return normal(z)
  }
  return normal(HAENDIG[n >= 5 ? 1 : 0])
}

/** Eine kleine Änderung: ein Kästchen an eine andere Stelle setzen (Figur bleibt zusammenhängend und händig). */
export function verfremde(r: Rng, z: Zellen, maxKante = 4): Zellen | null {
  for (let versuch = 0; versuch < 80; versuch++) {
    const k = normal(z).slice()
    const weg = r.int(0, k.length - 1)
    const rest = k.filter((_, i) => i !== weg)
    if (!zusammenhaengend(rest)) continue
    const [bx, by] = r.aus(rest)
    const [dx, dy] = r.aus([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][])
    const neu: [number, number] = [bx + dx, by + dy]
    if (rest.some(p => p[0] === neu[0] && p[1] === neu[1])) continue
    const kandidat = normal([...rest, neu])
    const breite = Math.max(...kandidat.map(p => p[0])) + 1, hoehe = Math.max(...kandidat.map(p => p[1])) + 1
    if (breite > maxKante || hoehe > maxKante) continue
    if (gleichBisAufDrehung(kandidat, z) || gleichBisAufDrehung(kandidat, spiegle(z))) continue
    return kandidat
  }
  return null
}

export function zusammenhaengend(z: Zellen): boolean {
  if (!z.length) return false
  const offen = [z[0]], gesehen = new Set([z[0].join(',')])
  while (offen.length) {
    const [x, y] = offen.pop() as [number, number]
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = z.find(p => p[0] === x + dx && p[1] === y + dy)
      if (n && !gesehen.has(n.join(','))) { gesehen.add(n.join(',')); offen.push(n) }
    }
  }
  return gesehen.size === z.length
}

/**
 * Zeichnet die Figur mittig in den Raum 0..100. `winkel` dreht frei (Grad, im Uhrzeigersinn) —
 * die Kästchen werden dafür um die Bildmitte gedreht. `kante` = Kästchengröße (sonst passend zur Figur).
 */
export function alsSzene(z: Zellen, o: { winkel?: number; ton?: 0 | 1 | 2 | 3; kante?: number } = {}): Szene {
  const k = normal(z)
  const breite = Math.max(...k.map(p => p[0])) + 1, hoehe = Math.max(...k.map(p => p[1])) + 1
  // bei freier Drehung muss die Diagonale ins Bild passen
  const platz = o.winkel && o.winkel % 90 !== 0 ? 58 : 76
  const kante = o.kante ?? Math.min(22, platz / Math.max(breite, hoehe))
  const w = ((o.winkel ?? 0) * Math.PI) / 180
  const cos = Math.cos(w), sin = Math.sin(w)
  const elemente: Form[] = k.map(([x, y]) => {
    const px = (x + 0.5 - breite / 2) * kante, py = (y + 0.5 - hoehe / 2) * kante
    return { typ: 'rechteck', x: 50 + px * cos - py * sin, y: 50 + px * sin + py * cos, b: kante, h: kante, dreh: o.winkel ?? 0, fuell: 'voll', ton: o.ton ?? 1, dick: 0.8, eckig: true }
  })
  return { elemente }
}
