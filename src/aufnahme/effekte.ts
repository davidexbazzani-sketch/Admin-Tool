// ── Bildschirmaufnahme: Bild zusammensetzen + Präsentations-Effekte ──────────
// Je Bild: aktiven Monitor einpassen (bei Wechsel: Schieben), optional Lupe (folgt der Maus),
// dann Effekte an der Mausposition: roter Schweif, Leuchtring, Spotlight; Titel-Einblendung.
// Alle Mauspunkte relativ zum Monitor (0…1) → passen auch bei Lupe und Monitorwechsel.

import type { Effekte } from './typen'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type Quelle = CanvasImageSource & { videoWidth?: number; videoHeight?: number; width?: number; height?: number; displayWidth?: number; displayHeight?: number }

export interface Ansicht {
  /** Lupe: aktueller Zoom (1 = aus) und Mittelpunkt (relativ 0…1), beides geglättet */
  zoom: number
  mitte: { x: number; y: number }
}
export interface SchweifPunkt { x: number; y: number; t: number; display: string }

// <video> hat videoWidth, Leinwand/Bild width, ein dekodiertes VideoFrame displayWidth
const groesse = (q: Quelle) => ({ w: q.videoWidth || q.displayWidth || q.width as number || 0, h: q.videoHeight || q.displayHeight || q.height as number || 0 })

/** Monitorbild einpassen; liefert die Abbildung „relativer Punkt → Ausgabe-Pixel“. */
export function zeichneMonitor(g: Ctx, q: Quelle, W: number, H: number, dx: number, ansicht?: Ansicht): ((rx: number, ry: number) => { x: number; y: number }) | null {
  const { w, h } = groesse(q)
  if (!w || !h) return null
  const s = Math.min(W / w, H / h)
  const dw = w * s, dh = h * s
  const ox = (W - dw) / 2 + dx, oy = (H - dh) / 2
  const z = Math.max(1, ansicht?.zoom || 1)
  const sw = w / z, sh = h / z
  const sx = Math.min(Math.max((ansicht?.mitte.x ?? 0.5) * w - sw / 2, 0), w - sw)
  const sy = Math.min(Math.max((ansicht?.mitte.y ?? 0.5) * h - sh / 2, 0), h - sh)
  g.drawImage(q, sx, sy, sw, sh, ox, oy, dw, dh)
  return (rx, ry) => ({ x: ox + (rx * w - sx) / sw * dw, y: oy + (ry * h - sy) / sh * dh })
}

/** Lupe glätten: Zoom und Mittelpunkt laufen weich hinterher. */
export function folgeAnsicht(a: Ansicht, ziel: { zoom: number; x: number; y: number }): Ansicht {
  const zoom = a.zoom + (ziel.zoom - a.zoom) * 0.14
  return { zoom: Math.abs(zoom - ziel.zoom) < 0.005 ? ziel.zoom : zoom, mitte: { x: a.mitte.x + (ziel.x - a.mitte.x) * 0.12, y: a.mitte.y + (ziel.y - a.mitte.y) * 0.12 } }
}

/** Schweif: nur die letzten `dauerMs` behalten. */
export function pflegeSchweif(punkte: SchweifPunkt[], neu: SchweifPunkt | null, jetzt: number, dauerMs = 520): SchweifPunkt[] {
  const aus = punkte.filter(p => jetzt - p.t <= dauerMs)
  if (neu) { const l = aus[aus.length - 1]; if (!l || l.display !== neu.display || Math.hypot(l.x - neu.x, l.y - neu.y) > 0.0004) aus.push(neu) }
  return aus.slice(-60)
}

export function zeichneEffekte(g: Ctx, W: number, H: number, e: Effekte, maus: { x: number; y: number } | null, schweif: { x: number; y: number; alter: number }[], jetzt: number): void {
  const k = W / 1920   // Strichstärken passend zur Ausgabegröße
  if (e.spotlight && maus) {
    const r = 170 * k
    const grad = g.createRadialGradient(maus.x, maus.y, r * 0.72, maus.x, maus.y, r * 1.12)
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.62)')
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
  }
  if (e.schweif && schweif.length > 1) {
    g.save()
    g.lineCap = 'round'; g.lineJoin = 'round'
    g.shadowColor = 'rgba(255,30,30,0.9)'; g.shadowBlur = 16 * k
    for (let i = 1; i < schweif.length; i++) {
      const a = schweif[i - 1], b = schweif[i]
      const frisch = 1 - b.alter          // 1 = gerade eben, 0 = gleich weg
      g.strokeStyle = `rgba(255,${Math.round(40 + 60 * frisch)},${Math.round(40 + 40 * frisch)},${(0.15 + 0.75 * frisch).toFixed(3)})`
      g.lineWidth = (3 + 9 * frisch) * k
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke()
    }
    // Funkeln: kleine helle Punkte entlang des Schweifs, leicht flackernd
    g.shadowBlur = 10 * k
    for (let i = 0; i < schweif.length; i += 3) {
      const p = schweif[i], frisch = 1 - p.alter
      const flimmern = 0.5 + 0.5 * Math.sin(jetzt / 45 + i * 1.7)
      g.fillStyle = `rgba(255,${Math.round(180 + 60 * flimmern)},${Math.round(160 + 60 * flimmern)},${(0.6 * frisch * flimmern).toFixed(3)})`
      const versatz = (Math.sin(i * 12.9898) * 43758.5453) % 1
      g.beginPath(); g.arc(p.x + versatz * 9 * k, p.y - versatz * 7 * k, (1.5 + 2.5 * frisch) * k, 0, Math.PI * 2); g.fill()
    }
    g.restore()
  }
  if (e.ring && maus) {
    g.save()
    g.beginPath(); g.arc(maus.x, maus.y, 30 * k, 0, Math.PI * 2)
    g.fillStyle = 'rgba(255,214,0,0.22)'; g.fill()
    g.lineWidth = 3 * k; g.strokeStyle = 'rgba(255,196,0,0.95)'; g.stroke()
    g.restore()
  }
}

/** Titel-Einblendung unten links: 0,4 s einblenden, `sichtbarMs` stehen, 0,6 s ausblenden. */
export function zeichneTitel(g: Ctx, W: number, H: number, titel: string, unterzeile: string, seitStartMs: number, sichtbarMs = 5000): void {
  if (!titel || seitStartMs < 0 || seitStartMs > sichtbarMs + 600) return
  const a = seitStartMs < 400 ? seitStartMs / 400 : seitStartMs > sichtbarMs ? 1 - (seitStartMs - sichtbarMs) / 600 : 1
  const k = W / 1920
  g.save()
  g.globalAlpha = Math.max(0, Math.min(1, a))
  g.font = `600 ${Math.round(40 * k)}px "Segoe UI", sans-serif`
  const b = Math.max(g.measureText(titel).width, (g.font = `${Math.round(24 * k)}px "Segoe UI", sans-serif`, g.measureText(unterzeile).width)) + 64 * k
  const x = 48 * k, y = H - 170 * k, h = 118 * k
  g.fillStyle = 'rgba(17,24,39,0.86)'
  g.beginPath(); (g as CanvasRenderingContext2D).roundRect?.(x, y, b, h, 14 * k); if (!(g as CanvasRenderingContext2D).roundRect) g.rect(x, y, b, h); g.fill()
  g.fillStyle = '#ef4444'; g.fillRect(x, y, 8 * k, h)
  g.fillStyle = '#fff'; g.font = `600 ${Math.round(40 * k)}px "Segoe UI", sans-serif`; g.fillText(titel, x + 32 * k, y + 54 * k)
  g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = `${Math.round(24 * k)}px "Segoe UI", sans-serif`; g.fillText(unterzeile, x + 32 * k, y + 92 * k)
  g.restore()
}

/** Kamera-Blase (Selbstaufnahme) einzeichnen: Mittelpunkt relativ, Größe relativ zur Bildhöhe. */
export interface KameraPlatz { x: number; y: number; groesse: number; form: 'kreis' | 'rechteck'; spiegeln: boolean }
export function zeichneKamera(g: Ctx, q: Quelle, W: number, H: number, p: KameraPlatz): void {
  const { w, h } = groesse(q)
  if (!w || !h) return
  const d = p.groesse * H
  const bw = p.form === 'kreis' ? d : d * 4 / 3, bh = d
  const cx = p.x * W, cy = p.y * H
  const x = Math.round(cx - bw / 2), y = Math.round(cy - bh / 2)
  // Ausschnitt aus der Kamera in passender Form (mittig zuschneiden)
  const ziel = bw / bh, quelle = w / h
  const sw = quelle > ziel ? h * ziel : w, sh = quelle > ziel ? h : w / ziel
  const sx = (w - sw) / 2, sy = (h - sh) / 2
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = d * 0.08; g.shadowOffsetY = d * 0.02
  g.beginPath()
  if (p.form === 'kreis') g.arc(cx, cy, d / 2, 0, Math.PI * 2)
  else { const r = d * 0.08; (g as CanvasRenderingContext2D).roundRect ? (g as CanvasRenderingContext2D).roundRect(x, y, bw, bh, r) : g.rect(x, y, bw, bh) }
  g.fillStyle = '#000'; g.fill()
  g.shadowColor = 'transparent'
  g.clip()
  if (p.spiegeln) { g.translate(x + bw, y); g.scale(-1, 1); g.drawImage(q, sx, sy, sw, sh, 0, 0, bw, bh) }
  else g.drawImage(q, sx, sy, sw, sh, x, y, bw, bh)
  g.restore()
  g.save()
  g.lineWidth = Math.max(2, d * 0.025); g.strokeStyle = 'rgba(255,255,255,0.92)'
  g.beginPath()
  if (p.form === 'kreis') g.arc(cx, cy, d / 2, 0, Math.PI * 2)
  else { const r = d * 0.08; (g as CanvasRenderingContext2D).roundRect ? (g as CanvasRenderingContext2D).roundRect(x, y, bw, bh, r) : g.rect(x, y, bw, bh) }
  g.stroke()
  g.restore()
}
