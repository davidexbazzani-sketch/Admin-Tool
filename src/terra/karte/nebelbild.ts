// Terra Incognita — Karte: der Nebel über dem Unbekannten. Je Abschnitt eine kleine Maske (6 Bildpunkte je Feld),
// die groß und weich gezeichnet wird: außen ein hellerer Dunstsaum, dahinter das Dunkel. Die Mitte eines
// unbekannten Feldes bleibt immer voll bedeckt.
import { abschnittKey, qAusSpalte } from '../kern/hex'
import { kennt, type Karte } from '../kern/nebel'

const M = 6
export const MASKE_RAND = M
export const MASKE_KERN = 16 * M

export type Nebel = 'frei' | 'voll' | HTMLCanvasElement

interface Eintrag { stand: number; bild: Nebel }
const speicher = new Map<string, Eintrag>()
let hilf: HTMLCanvasElement | null = null

function bits(a: Uint8Array | undefined): number {
  if (!a) return 0
  let n = 0
  for (let i = 0; i < 32; i++) { let b = a[i]; while (b) { n += b & 1; b >>= 1 } }
  return n
}

/** eine Lage: Farbe überall, um bekannte Felder herum weich ausgestanzt (innen bis r0 ganz frei, bis r1 auslaufend) */
function lage(ctx: CanvasRenderingContext2D, b: number, ax: number, ay: number, karte: Karte, farbe: string, r0: number, r1: number): void {
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, b, b)
  ctx.fillStyle = farbe
  ctx.fillRect(0, 0, b, b)
  ctx.globalCompositeOperation = 'destination-out'
  for (let ly = -2; ly <= 17; ly++) {
    const r = ay * 16 + ly
    for (let lx = -2; lx <= 17; lx++) {
      if (!kennt(karte, qAusSpalte(ax * 16 + lx, r), r)) continue
      const x = M * (lx + 0.25 + 0.5 * (r & 1)) + MASKE_RAND, y = M * (ly + 0.5) + MASKE_RAND
      const g = ctx.createRadialGradient(x, y, r0, x, y, r1)
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = g
      ctx.fillRect(x - r1, y - r1, 2 * r1, 2 * r1)
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Nebelbild eines Abschnitts: 'frei' (alles bekannt), 'voll' (nichts bekannt) oder eine Maske */
export function nebelBild(ax: number, ay: number, karte: Karte, farbe: string, saum: string): Nebel {
  // Kennzahl: wie viel in diesem und den acht Nachbar-Abschnitten bekannt ist — ändert sie sich, wird neu gezeichnet
  let stand = 0, eigen = 0
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const n = bits(karte.get(abschnittKey(ax + dx, ay + dy)))
    stand += n * (dx === 0 && dy === 0 ? 1000 : 1)
    if (dx === 0 && dy === 0) eigen = n
  }
  const key = `${ax}_${ay}_${farbe}`
  const alt = speicher.get(key)
  if (alt && alt.stand === stand) return alt.bild
  let bild: Nebel
  if (stand === 0) bild = 'voll'
  else {
    // Sind alle Felder samt zwei Feldern Rand bekannt, gibt es hier keinen Nebel
    let alle = eigen === 256
    if (alle) {
      rand: for (let ly = -2; ly <= 17; ly++) for (let lx = -2; lx <= 17; lx++) {
        if (lx >= 0 && lx < 16 && ly >= 0 && ly < 16) continue
        const r = ay * 16 + ly
        if (!kennt(karte, qAusSpalte(ax * 16 + lx, r), r)) { alle = false; break rand }
      }
    }
    if (alle) bild = 'frei'
    else {
      const b = MASKE_KERN + 2 * MASKE_RAND
      const c = alt && typeof alt.bild !== 'string' ? alt.bild : document.createElement('canvas')
      c.width = b; c.height = b
      const ctx = c.getContext('2d') as CanvasRenderingContext2D
      // 1) Dunstsaum: reicht bis dicht an die bekannten Felder
      lage(ctx, b, ax, ay, karte, saum, M * 0.5, M * 0.97)
      // 2) das Dunkel dahinter: weicht weiter zurück, sodass ein heller Rand stehen bleibt
      hilf ??= document.createElement('canvas')
      hilf.width = b; hilf.height = b
      lage(hilf.getContext('2d') as CanvasRenderingContext2D, b, ax, ay, karte, farbe, M * 0.85, M * 1.9)
      ctx.drawImage(hilf, 0, 0)
      bild = c
    }
  }
  if (alt && typeof alt.bild !== 'string' && alt.bild !== bild) alt.bild.width = 0
  speicher.set(key, { stand, bild })
  if (speicher.size > 600) {
    const [k, e] = speicher.entries().next().value as [string, Eintrag]
    if (typeof e.bild !== 'string') e.bild.width = 0
    speicher.delete(k)
  }
  return bild
}

export function leereNebel(): void {
  for (const e of speicher.values()) if (typeof e.bild !== 'string') e.bild.width = 0
  speicher.clear()
  if (hilf) { hilf.width = 0; hilf = null }
}
