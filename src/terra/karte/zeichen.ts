// Terra Incognita — Karte: Zeichen für Orte, das Schiff und Markierungen. Alles per Code mit dem Tuschestrich.
import type { Palette } from './farben'

type C = CanvasRenderingContext2D

/** Zeichen eines Ortes; a = halbe Größe in Bildpunkten */
export function zeichneOrt(ctx: C, art: string, x: number, y: number, a: number, pal: Palette, hervor = false): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1, a * 0.16)
  ctx.strokeStyle = pal.tinte; ctx.fillStyle = pal.tinte
  if (hervor) { ctx.shadowColor = pal.akzent; ctx.shadowBlur = a * 1.2 }
  switch (art) {
    case 'hafen': {
      // Stadtzeichen: Kreis mit Anker
      ctx.fillStyle = pal.hell ? '#FFF7E2' : '#10263B'
      ctx.beginPath(); ctx.arc(0, 0, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.shadowBlur = 0
      ctx.beginPath()
      ctx.moveTo(0, -a * 0.55); ctx.lineTo(0, a * 0.55)
      ctx.moveTo(-a * 0.3, -a * 0.25); ctx.lineTo(a * 0.3, -a * 0.25)
      ctx.moveTo(-a * 0.55, a * 0.15); ctx.quadraticCurveTo(-a * 0.45, a * 0.6, 0, a * 0.58); ctx.quadraticCurveTo(a * 0.45, a * 0.6, a * 0.55, a * 0.15)
      ctx.stroke()
      ctx.beginPath(); ctx.arc(0, -a * 0.62, a * 0.11, 0, Math.PI * 2); ctx.stroke()
      break
    }
    case 'dorf': {
      ctx.beginPath(); ctx.moveTo(-a * 0.7, a * 0.6); ctx.lineTo(-a * 0.7, -a * 0.05); ctx.lineTo(-a * 0.2, -a * 0.6); ctx.lineTo(a * 0.3, -a * 0.05); ctx.lineTo(a * 0.3, a * 0.6); ctx.closePath()
      ctx.fillStyle = pal.hell ? '#FFF7E2' : '#10263B'; ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(a * 0.3, a * 0.6); ctx.lineTo(a * 0.3, a * 0.15); ctx.lineTo(a * 0.6, -a * 0.2); ctx.lineTo(a * 0.9, a * 0.15); ctx.lineTo(a * 0.9, a * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke()
      break
    }
    case 'quelle': {
      ctx.beginPath(); ctx.moveTo(0, -a * 0.85); ctx.bezierCurveTo(a * 0.75, -a * 0.05, a * 0.6, a * 0.75, 0, a * 0.75); ctx.bezierCurveTo(-a * 0.6, a * 0.75, -a * 0.75, -a * 0.05, 0, -a * 0.85); ctx.closePath()
      ctx.fillStyle = pal.hell ? '#DDEBEA' : '#1C4B66'; ctx.fill(); ctx.stroke()
      break
    }
    case 'ruine': {
      ctx.beginPath()
      ctx.moveTo(-a * 0.8, a * 0.7); ctx.lineTo(a * 0.8, a * 0.7)
      ctx.moveTo(-a * 0.55, a * 0.7); ctx.lineTo(-a * 0.55, -a * 0.55)
      ctx.moveTo(-a * 0.05, a * 0.7); ctx.lineTo(-a * 0.05, -a * 0.2)
      ctx.moveTo(a * 0.5, a * 0.7); ctx.lineTo(a * 0.5, -a * 0.65)
      ctx.moveTo(-a * 0.75, -a * 0.6); ctx.lineTo(-a * 0.3, -a * 0.6)
      ctx.moveTo(a * 0.3, -a * 0.7); ctx.lineTo(a * 0.72, -a * 0.7)
      ctx.stroke()
      break
    }
    case 'wunder': {
      // Stern mit acht Strahlen
      ctx.beginPath()
      for (let i = 0; i < 16; i++) { const w = (i / 16) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? a * 0.38 : i % 4 ? a * 0.7 : a; const px = Math.cos(w) * r, py = Math.sin(w) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) }
      ctx.closePath()
      ctx.fillStyle = pal.akzent; ctx.fill(); ctx.stroke()
      break
    }
    case 'einsiedler': {
      ctx.beginPath(); ctx.moveTo(-a * 0.6, a * 0.65); ctx.lineTo(-a * 0.6, 0); ctx.lineTo(0, -a * 0.5); ctx.lineTo(a * 0.6, 0); ctx.lineTo(a * 0.6, a * 0.65); ctx.closePath()
      ctx.fillStyle = pal.hell ? '#FFF7E2' : '#10263B'; ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(a * 0.25, -a * 0.45); ctx.bezierCurveTo(a * 0.5, -a * 0.8, a * 0.1, -a * 0.85, a * 0.4, -a * 1.15); ctx.stroke()
      break
    }
    case 'wrack': {
      ctx.beginPath()
      ctx.moveTo(-a * 0.85, a * 0.1); ctx.quadraticCurveTo(-a * 0.4, a * 0.75, a * 0.5, a * 0.5); ctx.lineTo(a * 0.85, a * 0.05)
      ctx.moveTo(-a * 0.2, a * 0.5); ctx.lineTo(a * 0.25, -a * 0.85)
      ctx.moveTo(a * 0.02, -a * 0.2); ctx.lineTo(a * 0.55, -a * 0.35)
      ctx.stroke()
      break
    }
    case 'fischgrund': {
      ctx.beginPath(); ctx.moveTo(-a * 0.85, 0); ctx.quadraticCurveTo(-a * 0.1, -a * 0.7, a * 0.45, 0); ctx.quadraticCurveTo(-a * 0.1, a * 0.7, -a * 0.85, 0); ctx.closePath()
      ctx.moveTo(a * 0.45, 0); ctx.lineTo(a * 0.9, -a * 0.4); ctx.lineTo(a * 0.9, a * 0.4); ctx.closePath()
      ctx.stroke()
      break
    }
    case 'strudel': {
      ctx.beginPath()
      for (let i = 0; i <= 44; i++) { const w = (i / 44) * Math.PI * 4.6, r = a * (0.1 + (0.85 * i) / 44); const px = Math.cos(w) * r, py = Math.sin(w) * r * 0.8; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) }
      ctx.stroke()
      break
    }
    case 'treibgut': {
      ctx.beginPath(); ctx.rect(-a * 0.5, -a * 0.4, a, a * 0.8)
      ctx.moveTo(-a * 0.5, -a * 0.4); ctx.lineTo(a * 0.5, a * 0.4); ctx.moveTo(a * 0.5, -a * 0.4); ctx.lineTo(-a * 0.5, a * 0.4)
      ctx.stroke()
      break
    }
    default: { ctx.beginPath(); ctx.arc(0, 0, a * 0.4, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.restore()
}

/** Das Schiff von der Seite; a = halbe Länge. Größere Klassen haben mehr Masten. `links` = Bug zeigt nach links. */
export function zeichneSchiff(ctx: C, x: number, y: number, a: number, klasse: number, links: boolean, pal: Palette, wippen = 0): void {
  ctx.save()
  ctx.translate(x, y + wippen)
  if (links) ctx.scale(-1, 1)
  ctx.rotate(wippen * 0.02)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const rumpf = pal.hell ? '#5A4127' : '#2B1E12', segel = pal.hell ? '#FFFDF4' : '#F6EBCD'
  ctx.shadowColor = pal.hell ? 'rgba(60,40,10,0.35)' : 'rgba(0,0,0,0.6)'; ctx.shadowBlur = a * 0.35; ctx.shadowOffsetY = a * 0.08
  // Rumpf
  ctx.beginPath(); ctx.moveTo(-a, -a * 0.02); ctx.lineTo(a * 1.02, -a * 0.1); ctx.quadraticCurveTo(a * 0.75, a * 0.42, a * 0.4, a * 0.42); ctx.lineTo(-a * 0.62, a * 0.42); ctx.quadraticCurveTo(-a * 0.95, a * 0.36, -a, -a * 0.02); ctx.closePath()
  ctx.fillStyle = rumpf; ctx.fill()
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0
  ctx.strokeStyle = pal.tinte; ctx.lineWidth = Math.max(1, a * 0.07); ctx.stroke()
  // Masten und Segel
  const masten = klasse <= 1 ? [0.05] : klasse <= 3 ? [-0.3, 0.36] : [-0.5, 0.05, 0.55]
  const hoehe = klasse === 0 ? 1.15 : klasse <= 2 ? 1.4 : 1.6
  for (let i = 0; i < masten.length; i++) {
    const mx = masten[i] * a, h = a * hoehe * (masten.length === 3 && i === 1 ? 1.08 : i === 0 && masten.length > 1 ? 0.92 : 1)
    ctx.strokeStyle = pal.tinte; ctx.lineWidth = Math.max(1, a * 0.06)
    ctx.beginPath(); ctx.moveTo(mx, 0); ctx.lineTo(mx, -h); ctx.stroke()
    ctx.fillStyle = segel
    if (klasse <= 2) {
      // Schratsegel (Dreieck / Trapez)
      ctx.beginPath(); ctx.moveTo(mx + a * 0.05, -h * 0.95); ctx.quadraticCurveTo(mx + a * 0.62, -h * 0.5, mx + a * 0.52, -a * 0.12); ctx.lineTo(mx + a * 0.05, -a * 0.14); ctx.closePath(); ctx.fill(); ctx.stroke()
    } else {
      // Rahsegel: zwei bis drei gewölbte Tücher übereinander
      const zahl = klasse >= 4 ? 3 : 2
      for (let s = 0; s < zahl; s++) {
        const oben = -h * (0.96 - s * (0.86 / zahl)), unten = -h * (0.96 - (s + 1) * (0.86 / zahl)) - a * 0.03, b = a * (0.2 + 0.07 * s)
        ctx.beginPath(); ctx.moveTo(mx - b, oben); ctx.lineTo(mx + b, oben); ctx.quadraticCurveTo(mx + b * 1.5, (oben + unten) / 2, mx + b * 1.08, unten); ctx.lineTo(mx - b * 1.08, unten); ctx.quadraticCurveTo(mx - b * 0.75, (oben + unten) / 2, mx - b, oben); ctx.closePath(); ctx.fill(); ctx.stroke()
      }
    }
  }
  // Wimpel
  ctx.fillStyle = pal.akzent
  const top = masten[masten.length > 1 ? 1 : 0] * a, th = a * hoehe * (masten.length === 3 ? 1.08 : 1)
  ctx.beginPath(); ctx.moveTo(top, -th); ctx.lineTo(top - a * 0.36, -th - a * 0.09); ctx.lineTo(top, -th - a * 0.2); ctx.closePath(); ctx.fill()
  ctx.restore()
}

/** Kreuz einer Schatzkarte */
export function zeichneKreuz(ctx: C, x: number, y: number, a: number, pal: Palette): void {
  ctx.save()
  ctx.strokeStyle = pal.gefahr; ctx.lineWidth = Math.max(1.5, a * 0.26); ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(x - a, y - a); ctx.lineTo(x + a, y + a); ctx.moveTo(x + a, y - a); ctx.lineTo(x - a, y + a); ctx.stroke()
  ctx.restore()
}

/** Fragezeichen eines Gerüchts (ungefähre Lage) */
export function zeichneGeruecht(ctx: C, x: number, y: number, a: number, pal: Palette): void {
  ctx.save()
  ctx.setLineDash([a * 0.35, a * 0.35]); ctx.strokeStyle = pal.tinteLeise; ctx.lineWidth = Math.max(1, a * 0.1)
  ctx.beginPath(); ctx.arc(x, y, a * 1.5, 0, Math.PI * 2); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = pal.akzent; ctx.font = `italic bold ${Math.round(a * 1.6)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('?', x, y + a * 0.08)
  ctx.restore()
}

/** Flaschenpost */
export function zeichneFlasche(ctx: C, x: number, y: number, a: number, pal: Palette): void {
  ctx.save()
  ctx.translate(x, y); ctx.rotate(-0.5)
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, a * 0.14); ctx.strokeStyle = pal.tinte; ctx.fillStyle = pal.hell ? '#CFE3D2' : '#2F6A5E'
  ctx.beginPath(); ctx.moveTo(-a * 0.9, -a * 0.34); ctx.lineTo(a * 0.25, -a * 0.34); ctx.lineTo(a * 0.5, -a * 0.14); ctx.lineTo(a * 0.95, -a * 0.14); ctx.lineTo(a * 0.95, a * 0.14); ctx.lineTo(a * 0.5, a * 0.14); ctx.lineTo(a * 0.25, a * 0.34); ctx.lineTo(-a * 0.9, a * 0.34); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.restore()
}

/** Gegner auf der Karte (Stufe 2): Pirat, Ungeheuer, Nest, großer Gegner; dazu der Wimpel für Funde von Bündnis-Kameraden */
export function zeichneGegner(ctx: C, art: string, x: number, y: number, a: number, pal: Palette): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  const rot = pal.hell ? '#A8321C' : '#FF6B4F', tinte = pal.tinte
  ctx.lineWidth = Math.max(1, a * 0.14)
  // Piraten und Ungeheuer: ein roter Gefahrenkreis — wer ihm zu nahe kommt, wird gestellt
  if (art === 'pirat' || art === 'krake' || art === 'schlange' || art === 'geist') {
    ctx.save(); ctx.strokeStyle = rot; ctx.globalAlpha = 0.75; ctx.lineWidth = Math.max(1.2, a * 0.1)
    ctx.setLineDash([a * 0.28, a * 0.2]); ctx.beginPath(); ctx.arc(0, -a * 0.15, a * 1.55, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  }
  switch (art) {
    case 'pirat': {
      // ein dunkler Segler mit roter Flagge
      ctx.fillStyle = pal.hell ? '#2A2522' : '#141414'; ctx.strokeStyle = tinte
      ctx.beginPath(); ctx.moveTo(-a, -a * 0.05); ctx.lineTo(a, -a * 0.12); ctx.quadraticCurveTo(a * 0.7, a * 0.45, a * 0.35, a * 0.45); ctx.lineTo(-a * 0.6, a * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -a * 1.35); ctx.stroke()
      ctx.fillStyle = pal.hell ? '#4A4038' : '#3A3430'
      ctx.beginPath(); ctx.moveTo(a * 0.06, -a * 1.25); ctx.quadraticCurveTo(a * 0.75, -a * 0.7, a * 0.6, -a * 0.12); ctx.lineTo(a * 0.06, -a * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.fillStyle = rot; ctx.beginPath(); ctx.moveTo(0, -a * 1.35); ctx.lineTo(-a * 0.55, -a * 1.2); ctx.lineTo(0, -a * 1.02); ctx.closePath(); ctx.fill()
      break
    }
    case 'krake': {
      ctx.strokeStyle = pal.hell ? '#6E2A55' : '#C76BA4'; ctx.lineWidth = Math.max(1.4, a * 0.2)
      for (let i = 0; i < 5; i++) { const w = Math.PI * (0.15 + i * 0.175); ctx.beginPath(); ctx.moveTo(Math.cos(w) * a * 0.3, Math.sin(w) * a * 0.3); ctx.quadraticCurveTo(Math.cos(w) * a * 1.1 + a * 0.3, Math.sin(w) * a * 0.9, Math.cos(w) * a * 1.2, Math.sin(w) * a * 1.25); ctx.stroke() }
      ctx.fillStyle = pal.hell ? '#8E3B6E' : '#A1477E'; ctx.beginPath(); ctx.ellipse(0, -a * 0.2, a * 0.6, a * 0.75, 0, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'schlange': {
      ctx.strokeStyle = pal.hell ? '#2C6A4A' : '#5DBA88'; ctx.lineWidth = Math.max(1.6, a * 0.26)
      ctx.beginPath(); ctx.moveTo(-a * 1.1, a * 0.3); ctx.bezierCurveTo(-a * 0.6, -a * 0.6, -a * 0.2, a * 0.8, a * 0.3, 0); ctx.quadraticCurveTo(a * 0.6, -a * 0.5, a * 0.9, -a * 0.3); ctx.stroke()
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(a * 0.95, -a * 0.32, a * 0.22, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'geist': {
      ctx.globalAlpha = 0.85
      ctx.strokeStyle = pal.hell ? '#2F6A5E' : '#BFF5E6'; ctx.fillStyle = pal.hell ? 'rgba(47,106,94,0.25)' : 'rgba(191,245,230,0.22)'
      ctx.beginPath(); ctx.moveTo(-a, -a * 0.05); ctx.lineTo(a, -a * 0.12); ctx.quadraticCurveTo(a * 0.7, a * 0.45, a * 0.35, a * 0.45); ctx.lineTo(-a * 0.6, a * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke()
      ctx.setLineDash([a * 0.2, a * 0.15]); ctx.beginPath(); ctx.moveTo(-a * 0.2, 0); ctx.lineTo(-a * 0.2, -a * 1.2); ctx.moveTo(a * 0.4, 0); ctx.lineTo(a * 0.4, -a * 1.05); ctx.stroke()
      break
    }
    case 'nest': {
      // Totenkopf über gekreuzten Knochen
      ctx.strokeStyle = tinte; ctx.lineWidth = Math.max(1.2, a * 0.18)
      ctx.beginPath(); ctx.moveTo(-a * 0.8, a * 0.2); ctx.lineTo(a * 0.8, a * 0.9); ctx.moveTo(a * 0.8, a * 0.2); ctx.lineTo(-a * 0.8, a * 0.9); ctx.stroke()
      ctx.fillStyle = pal.hell ? '#FFF7E2' : '#E9E2D0'; ctx.lineWidth = Math.max(1, a * 0.12)
      ctx.beginPath(); ctx.arc(0, -a * 0.25, a * 0.55, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-a * 0.2, -a * 0.3, a * 0.13, 0, Math.PI * 2); ctx.arc(a * 0.2, -a * 0.3, a * 0.13, 0, Math.PI * 2); ctx.fill()
      break
    }
    case 'gross': {
      ctx.strokeStyle = rot; ctx.lineWidth = Math.max(1.5, a * 0.14)
      ctx.setLineDash([a * 0.3, a * 0.22]); ctx.beginPath(); ctx.arc(0, 0, a * 1.7, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
      // ein Schädel in Rot (gezeichnet — ein Schriftzeichen käme auf Windows als buntes Emoji)
      ctx.fillStyle = rot
      ctx.beginPath(); ctx.arc(0, -a * 0.2, a * 0.75, 0, Math.PI * 2); ctx.fill()
      ctx.fillRect(-a * 0.42, a * 0.3, a * 0.84, a * 0.45)
      ctx.fillStyle = pal.hell ? '#F6EDD6' : '#0E2238'
      ctx.beginPath(); ctx.arc(-a * 0.28, -a * 0.22, a * 0.2, 0, Math.PI * 2); ctx.arc(a * 0.28, -a * 0.22, a * 0.2, 0, Math.PI * 2); ctx.fill()
      ctx.fillRect(-a * 0.06, a * 0.32, a * 0.12, a * 0.4)
      break
    }
    case 'bund': {
      ctx.strokeStyle = tinte; ctx.lineWidth = Math.max(1, a * 0.12)
      ctx.beginPath(); ctx.moveTo(0, a * 0.7); ctx.lineTo(0, -a * 0.8); ctx.stroke()
      ctx.fillStyle = pal.akzent; ctx.beginPath(); ctx.moveTo(0, -a * 0.8); ctx.lineTo(a * 0.9, -a * 0.5); ctx.lineTo(0, -a * 0.2); ctx.closePath(); ctx.fill()
      break
    }
    // Stufe 3: Festungen — die eigene in Gold, fremde mit roter Flagge (angreifbar) oder blass (geschützt, im Nebel)
    case 'festung': case 'festungRuhe': case 'eigeneFestung': {
      if (art === 'festungRuhe') ctx.globalAlpha = 0.55
      const eigen = art === 'eigeneFestung'
      ctx.fillStyle = eigen ? pal.akzent : pal.hell ? '#6B5B48' : '#B8AC94'; ctx.strokeStyle = tinte; ctx.lineWidth = Math.max(1, a * 0.12)
      // Turm mit Zinnen
      ctx.beginPath()
      ctx.moveTo(-a * 0.7, a * 0.75); ctx.lineTo(-a * 0.55, -a * 0.35); ctx.lineTo(-a * 0.7, -a * 0.35); ctx.lineTo(-a * 0.7, -a * 0.75)
      ctx.lineTo(-a * 0.38, -a * 0.75); ctx.lineTo(-a * 0.38, -a * 0.55); ctx.lineTo(-a * 0.13, -a * 0.55); ctx.lineTo(-a * 0.13, -a * 0.75)
      ctx.lineTo(a * 0.13, -a * 0.75); ctx.lineTo(a * 0.13, -a * 0.55); ctx.lineTo(a * 0.38, -a * 0.55); ctx.lineTo(a * 0.38, -a * 0.75)
      ctx.lineTo(a * 0.7, -a * 0.75); ctx.lineTo(a * 0.7, -a * 0.35); ctx.lineTo(a * 0.55, -a * 0.35); ctx.lineTo(a * 0.7, a * 0.75); ctx.closePath()
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = pal.hell ? '#2A2522' : '#0E2238'; ctx.beginPath(); ctx.arc(0, a * 0.75, a * 0.22, Math.PI, 0); ctx.fill()
      // Fahnenstange mit Wimpel
      ctx.beginPath(); ctx.moveTo(0, -a * 0.75); ctx.lineTo(0, -a * 1.5); ctx.stroke()
      ctx.fillStyle = eigen ? pal.akzent : art === 'festung' ? rot : tinte
      ctx.beginPath(); ctx.moveTo(0, -a * 1.5); ctx.lineTo(a * 0.75, -a * 1.32); ctx.lineTo(0, -a * 1.12); ctx.closePath(); ctx.fill()
      break
    }
  }
  ctx.restore()
}

const schriftVon = (groesse: number, kursiv?: boolean, fett?: boolean): string => `${kursiv ? 'italic ' : ''}${fett ? '600 ' : ''}${Math.round(groesse)}px Georgia, Cambria, 'Times New Roman', serif`
/** Breite einer Beschriftung in Bildpunkten */
export function textBreite(ctx: C, text: string, groesse: number, opt: { kursiv?: boolean; fett?: boolean; weit?: number } = {}): number {
  ctx.save()
  ctx.font = schriftVon(groesse, opt.kursiv, opt.fett)
  const b = ctx.measureText(text).width + (opt.weit ?? 0) * text.length
  ctx.restore()
  return b
}

/** Beschriftung mit hellem/dunklem Saum, damit sie auf jedem Untergrund lesbar bleibt */
export function schreibe(ctx: C, text: string, x: number, y: number, groesse: number, pal: Palette, opt: { kursiv?: boolean; fett?: boolean; farbe?: string; weit?: number } = {}): void {
  ctx.save()
  ctx.font = schriftVon(groesse, opt.kursiv, opt.fett)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  if (opt.weit) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${opt.weit}px`
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2.5, groesse * 0.28)
  ctx.strokeStyle = pal.hell ? 'rgba(239,227,200,0.9)' : 'rgba(8,18,32,0.9)'
  ctx.strokeText(text, x, y)
  ctx.fillStyle = opt.farbe ?? pal.schrift
  ctx.fillText(text, x, y)
  ctx.restore()
}
