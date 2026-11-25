// Terra Incognita — Karte: das Gelände eines Abschnitts als Bild („Kachel“), einmal gezeichnet und zwischengespeichert.
// Gezeichnet wird alles per Code: Küsten mit handgezogener Unruhe, Tuschelinien vor der Küste, Riffe, Eis, Tang.
// Eine Kachel hängt nur von Abschnitt, Feldbreite, Bildschirmdichte und Farbschema ab — nie vom Spielstand.
import { qAusSpalte } from '../kern/hex'
import { streu } from '../kern/streu'
import { BERG, EIS, FLACH, gelaende, istLand, LAND, RIFF, TANG, TIEF } from '../kern/welt'
import type { Palette } from './farben'
import { ECKEN, hoeheVon, zeileVon } from './geo'

interface Zelle { q: number; r: number; sp: number; x: number; y: number; g: number }

const S_ECKE = 4401, S_ZIER = 4402

/** Unruhe einer Ecke: dieselbe für alle drei Felder, die sich die Ecke teilen (sonst klafften Lücken) */
function eckeXY(z: Zelle, i: number, W: number, staerke: number, ox: number, oy: number): [number, number] {
  // Kennzahl der Ecke im Weltraster: x in Vierteln der Feldbreite, y in Sechsteln der Zeilenhöhe
  const ix = Math.round((z.sp + 0.25 + 0.5 * (z.r & 1) + ECKEN[i][0]) * 4)
  const iy = 6 * z.r + 3 + [-4, -2, 2, 4, 2, -2][i]
  const h = streu(ix, iy, S_ECKE)
  const dx = ((h & 0xFFFF) / 65535 - 0.5) * staerke * W, dy = (((h >>> 16) & 0xFFFF) / 65535 - 0.5) * staerke * W
  return [z.x + ECKEN[i][0] * W + dx + ox, z.y + ECKEN[i][1] * W + dy + oy]
}

function pfad(ctx: CanvasRenderingContext2D, zellen: readonly Zelle[], W: number, staerke: number, ox: number, oy: number): void {
  ctx.beginPath()
  for (const z of zellen) {
    for (let i = 0; i < 6; i++) { const [x, y] = eckeXY(z, i, W, staerke, ox, oy); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
    ctx.closePath()
  }
}

function leinwand(b: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, b); c.height = Math.max(1, h)
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}

/** Zeichnet die Kachel eines Abschnitts. null = dort ist nur offene See (nichts zu zeichnen). */
export function zeichneKachel(ax: number, ay: number, W: number, dichte: number, pal: Palette): HTMLCanvasElement | null {
  const bw = 16 * W, bh = hoeheVon(W), ZEILE = zeileVon(W)
  const zellen: Zelle[] = []
  let etwas = false
  for (let r = ay * 16 - 2; r < ay * 16 + 18; r++) {
    for (let sp = ax * 16 - 2; sp < ax * 16 + 18; sp++) {
      const q = qAusSpalte(sp, r), g = gelaende(q, r)
      if (g !== TIEF && g !== 1) etwas = true
      zellen.push({ q, r, sp, x: W * (sp + 0.25 + 0.5 * (r & 1)) - ax * bw, y: ZEILE * W * (r + 0.5) - ay * bh, g })
    }
  }
  if (!etwas) {
    // nur Wasser: höchstens ein paar Wellenzeichen — die lohnen keine eigene Kachel
    return null
  }
  const rand = Math.ceil(1.3 * W)
  const [kachel, ctx] = leinwand(Math.ceil(bw * dichte), Math.ceil(bh * dichte))
  const [hilf, hx] = leinwand(Math.ceil((bw + 2 * rand) * dichte), Math.ceil((bh + 2 * rand) * dichte))
  ctx.scale(dichte, dichte)
  hx.scale(dichte, dichte)
  const land = zellen.filter(z => istLand(z.g))
  const flach = zellen.filter(z => z.g === FLACH || z.g === RIFF || istLand(z.g))
  const unruhe = 0.2
  const rund = 0.14 * W
  const leere = (): void => { hx.save(); hx.setTransform(1, 0, 0, 1, 0, 0); hx.clearRect(0, 0, hilf.width, hilf.height); hx.restore(); hx.globalCompositeOperation = 'source-over' }
  const male = (zl: readonly Zelle[], farbe: string, breite: number, staerke = unruhe): void => {
    pfad(hx, zl, W, staerke, rand, rand)
    hx.fillStyle = farbe; hx.strokeStyle = farbe; hx.lineJoin = 'round'; hx.lineWidth = Math.max(0.01, breite)
    hx.fill(); hx.stroke()
  }
  const uebertrage = (alpha: number, weich = 0): void => {
    ctx.save()
    ctx.globalAlpha = alpha
    if (weich > 0) ctx.filter = `blur(${weich}px)`
    ctx.drawImage(hilf, -rand, -rand, bw + 2 * rand, bh + 2 * rand)
    ctx.restore()
  }

  // 1) flaches Wasser: heller Saum um Küsten und Bänke, weich verlaufend
  if (flach.length) { leere(); male(flach, pal.flach, 0.5 * W, 0.1); uebertrage(pal.hell ? 0.75 : 0.62, 0.3 * W) }

  // 2) Tang und Eis
  for (const z of zellen) {
    if (z.g === TANG) {
      const h = streu(z.q, z.r, S_ZIER)
      ctx.strokeStyle = pal.tang; ctx.globalAlpha = 0.7; ctx.lineWidth = Math.max(0.8, W * 0.035); ctx.lineCap = 'round'
      for (let i = 0; i < 3; i++) {
        const x = z.x + (((h >>> (i * 5)) & 31) / 31 - 0.5) * W * 0.7, y = z.y + (((h >>> (i * 5 + 3)) & 31) / 31 - 0.5) * W * 0.6, l = W * 0.16
        ctx.beginPath(); ctx.moveTo(x - l, y); ctx.quadraticCurveTo(x - l / 2, y - l * 0.7, x, y); ctx.quadraticCurveTo(x + l / 2, y + l * 0.7, x + l, y); ctx.stroke()
      }
      ctx.globalAlpha = 1
    } else if (z.g === EIS) {
      const h = streu(z.q, z.r, S_ZIER + 1)
      ctx.fillStyle = pal.eis; ctx.strokeStyle = pal.eisRand; ctx.lineWidth = Math.max(0.6, W * 0.02); ctx.lineJoin = 'round'
      const n = 2 + (h & 1)
      for (let i = 0; i < n; i++) {
        const x = z.x + (((h >>> (i * 6)) & 31) / 31 - 0.5) * W * 0.62, y = z.y + (((h >>> (i * 6 + 3)) & 31) / 31 - 0.5) * W * 0.52, a = W * (0.16 + ((h >>> (i * 4 + 12)) & 7) / 60)
        ctx.beginPath()
        for (let e = 0; e < 5; e++) { const w = (e / 5) * Math.PI * 2 + ((h >>> e) & 7) / 9, rr = a * (0.75 + ((h >>> (e * 3)) & 3) / 9); const px = x + Math.cos(w) * rr, py = y + Math.sin(w) * rr * 0.8; if (e === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) }
        ctx.closePath(); ctx.fill(); ctx.stroke()
      }
    }
  }

  if (land.length) {
    // 3) Tuschelinien vor der Küste (wie auf alten Seekarten): zwei feine Linien im Abstand
    const linien: readonly [number, number][] = [[0.17 * W, pal.hell ? 0.42 : 0.5], [0.34 * W, pal.hell ? 0.22 : 0.26]]
    const dicke = Math.max(0.7, W * 0.022)
    for (const [abstandPx, alpha] of linien) {
      leere()
      male(land, pal.tinte, rund + 2 * abstandPx)
      hx.globalCompositeOperation = 'destination-out'
      male(land, '#000', rund + 2 * (abstandPx - dicke))
      uebertrage(alpha)
    }
    // 4) Land: Tintenrand, darauf die Fläche
    leere()
    male(land, pal.tinte, rund + 2 * Math.max(1, W * 0.035))
    uebertrage(1)
    leere()
    male(land, pal.land, rund)
    uebertrage(1)
    // 5) Berge und Bäume
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const z of land) {
      const h = streu(z.q, z.r, S_ZIER + 2)
      if (z.g === BERG) {
        const n = 1 + (h & 1)
        for (let i = 0; i < n; i++) {
          const x = z.x + (i ? 0.2 : -0.08) * W + (((h >>> 4) & 15) / 15 - 0.5) * W * 0.12, y = z.y + (i ? 0.1 : 0) * W, a = W * (i ? 0.17 : 0.24)
          ctx.fillStyle = pal.landHoch
          ctx.beginPath(); ctx.moveTo(x - a, y + a * 0.6); ctx.lineTo(x, y - a * 0.75); ctx.lineTo(x + a, y + a * 0.6); ctx.closePath(); ctx.fill()
          ctx.strokeStyle = pal.tinte; ctx.lineWidth = Math.max(0.8, W * 0.03)
          ctx.beginPath(); ctx.moveTo(x - a, y + a * 0.6); ctx.lineTo(x, y - a * 0.75); ctx.lineTo(x + a, y + a * 0.6); ctx.stroke()
          ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(0.6, W * 0.018)
          ctx.beginPath(); ctx.moveTo(x, y - a * 0.75); ctx.lineTo(x + a * 0.25, y + a * 0.1); ctx.moveTo(x + a * 0.3, y - a * 0.3); ctx.lineTo(x + a * 0.55, y + a * 0.3); ctx.stroke()
          ctx.globalAlpha = 1
        }
      } else if (z.g === LAND && W >= 16 && h % 5 < 2) {
        ctx.fillStyle = pal.tinte; ctx.globalAlpha = pal.hell ? 0.5 : 0.45
        const n = 2 + ((h >>> 3) & 1)
        for (let i = 0; i < n; i++) {
          const x = z.x + (((h >>> (6 + i * 5)) & 31) / 31 - 0.5) * W * 0.5, y = z.y + (((h >>> (9 + i * 5)) & 31) / 31 - 0.5) * W * 0.42, a = W * 0.055
          ctx.beginPath(); ctx.arc(x, y - a, a, 0, Math.PI * 2); ctx.fill()
          ctx.fillRect(x - a * 0.18, y - a * 0.2, a * 0.36, a * 1.3)
        }
        ctx.globalAlpha = 1
      }
    }
  }

  // 6) Riffe: kleine Kreuze, wie Seekarten Untiefen zeichnen
  ctx.strokeStyle = pal.riff; ctx.lineCap = 'round'
  for (const z of zellen) {
    if (z.g !== RIFF) continue
    const h = streu(z.q, z.r, S_ZIER + 3)
    ctx.lineWidth = Math.max(0.8, W * 0.03); ctx.globalAlpha = 0.85
    const n = 3 + (h & 1)
    for (let i = 0; i < n; i++) {
      const x = z.x + (((h >>> (i * 6)) & 31) / 31 - 0.5) * W * 0.66, y = z.y + (((h >>> (i * 6 + 3)) & 31) / 31 - 0.5) * W * 0.56, a = W * 0.06
      ctx.beginPath(); ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a); ctx.moveTo(x + a, y - a); ctx.lineTo(x - a, y + a); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  hilf.width = 0   // Hilfsbild gleich wieder freigeben
  return kachel
}

// ── Zwischenspeicher: gedeckelt nach Bildpunkten, die am längsten nicht gebrauchte Kachel fliegt zuerst ──
interface Eintrag { bild: HTMLCanvasElement | null; punkte: number }
const speicher = new Map<string, Eintrag>()
let belegt = 0
/** 16 Millionen Bildpunkte = 64 MB */
export const KACHEL_DECKEL = 16_000_000
export const kachelBelegt = (): number => belegt
export const kachelAnzahl = (): number => speicher.size

export function kachelKey(ax: number, ay: number, W: number, dichte: number, hell: boolean): string { return `${ax}_${ay}_${W}_${dichte}_${hell ? 1 : 0}` }

/** fertige Kachel aus dem Speicher (undefined = noch nicht gezeichnet) */
export function holeKachel(key: string): Eintrag | undefined {
  const e = speicher.get(key)
  if (e) { speicher.delete(key); speicher.set(key, e) }      // als „zuletzt gebraucht“ nach hinten
  return e
}

export function merkeKachel(key: string, bild: HTMLCanvasElement | null): void {
  const punkte = bild ? bild.width * bild.height : 0
  speicher.set(key, { bild, punkte })
  belegt += punkte
  while (belegt > KACHEL_DECKEL && speicher.size > 1) {
    const [k, e] = speicher.entries().next().value as [string, Eintrag]
    if (k === key) break
    if (e.bild) e.bild.width = 0
    belegt -= e.punkte
    speicher.delete(k)
  }
}

/** alles freigeben (beim Verlassen des Raums, beim Wechsel des Farbschemas oder der Bildschirmdichte) */
export function leereKacheln(): void {
  for (const e of speicher.values()) if (e.bild) e.bild.width = 0
  speicher.clear()
  belegt = 0
}
