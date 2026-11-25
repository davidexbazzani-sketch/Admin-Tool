// Terra Incognita — das Kartenfenster: zwei übereinanderliegende Zeichenflächen.
//  „karte“: Gelände-Kacheln, Nebel, Orte, Namen, Umkehrlinie — wird nur neu gezeichnet, wenn sich etwas ändert.
//  „leben“: Schiff, geplante Route, Feld unter dem Mauszeiger — klein und billig.
// Es gibt KEINE Dauerschleife: Ein Bild wird nur auf Anforderung berechnet. Sanftes Wippen des Schiffs läuft mit
// höchstens 9 Bildern je Sekunde und nur, solange das Fenster im Vordergrund ist und kürzlich bedient wurde.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { abschnittKey, feldAus, feldNr, RICHTUNGEN, type Feld } from '../kern/hex'
import { kennt } from '../kern/nebel'
import { ortName } from '../kern/namen'
import type { Route } from '../kern/fahrt'
import type { Spiel } from '../kern/spiel'
import { streu } from '../kern/streu'
import { inselVon, istLand, gelaende, ortBei } from '../kern/welt'
import { istHell, palette, type Palette } from './farben'
import { ECKEN, feldBei, hoeheVon, KANTE, mitteX, mitteY, STUFE_START, STUFEN, zeileVon } from './geo'
import { holeKachel, kachelKey, leereKacheln, merkeKachel, zeichneKachel } from './kachel'
import { leereNebel, MASKE_KERN, MASKE_RAND, nebelBild } from './nebelbild'
import { schreibe, textBreite, zeichneFlasche, zeichneGegner, zeichneGeruecht, zeichneKreuz, zeichneOrt, zeichneSchiff } from './zeichen'

export interface KartenMarke { q: number; r: number; art: 'flasche' | 'ziel' | 'pirat' | 'krake' | 'schlange' | 'geist' | 'nest' | 'gross' | 'bund' | 'festung' | 'festungRuhe' | 'eigeneFestung' }

export interface KarteProps {
  spiel: Spiel
  /** ändert sich bei jedem Spielzug */
  rev: number
  /** geplante Route (Vorschau) und wie weit der Proviant auf ihr reicht (Zahl der Felder, die noch gedeckt sind) */
  route?: Route | null
  routeGedeckt?: number
  /** Felder, von denen der Proviant für den Weg in einen Hafen noch reicht (Feldnummern) */
  sicher?: ReadonlySet<number> | null
  marken?: readonly KartenMarke[]
  /** Dauer eines Schritts in ms (für die Bewegung des Schiffs) */
  schrittMs?: number
  onFeld?: (f: Feld) => void
  onHover?: (f: Feld | null) => void
}
export interface KarteHandle { zentriere: (q: number, r: number) => void; zoome: (richtung: number) => void; mitte: () => Feld }

/** was alte Karten ins Unbekannte schrieben */
const FERNE = ['terra incognita', 'mare incognitum', 'hic sunt dracones', 'ultima Thule', 'nondum cognita', 'finis terrae', 'mare tenebrarum']

/** für die Leistungsprüfung: wie viele Bilder wurden berechnet */
export const kartenZaehler = { karte: 0, leben: 0 }

const inselMitte = new Map<string, { q: number; r: number; x: number; y: number; felder: number }>()
function mitteDerInsel(key: string): { x: number; y: number; felder: number } | null {
  let m = inselMitte.get(key)
  if (!m) {
    const f = feldAus(key.slice(1)), insel = inselVon(f.q, f.r)
    if (!insel || insel.festland) return null
    let sx = 0, sy = 0
    for (const g of insel.felder) { sx += mitteX(g.q, g.r, 1); sy += g.r + 0.5 }
    m = { q: f.q, r: f.r, x: sx / insel.felder.length, y: sy / insel.felder.length, felder: insel.felder.length }
    inselMitte.set(key, m)
  }
  return m
}

const Karte = forwardRef<KarteHandle, KarteProps>(function Karte(props, ref) {
  const huelle = useRef<HTMLDivElement>(null)
  const cKarte = useRef<HTMLCanvasElement>(null)
  const cLeben = useRef<HTMLCanvasElement>(null)
  const p = useRef(props)
  p.current = props
  const z = useRef({
    kam: { x: 0, y: 0, stufe: STUFE_START }, b: 0, h: 0, dichte: 1, pal: palette() as Palette,
    bildKarte: 0, bildLeben: 0, hover: null as Feld | null, ziehen: null as null | { x: number; y: number; kx: number; ky: number; weit: boolean },
    schiff: { x: 0, y: 0, vonX: 0, vonY: 0, start: 0, dauer: 0, links: false, q: NaN, r: NaN }, letzteEingabe: 0, korn: null as CanvasPattern | null, kornFuer: '',
  })

  useImperativeHandle(ref, () => ({
    zentriere: (q, r) => { const s = z.current, W = STUFEN[s.kam.stufe]; s.kam.x = mitteX(q, r, W); s.kam.y = mitteY(r, W); fordere(true, true) },
    zoome: richtung => zoome(richtung, z.current.b / 2, z.current.h / 2),
    mitte: () => { const s = z.current; return feldBei(s.kam.x, s.kam.y, STUFEN[s.kam.stufe]) },
  }))

  function fordere(karte: boolean, leben: boolean): void {
    const s = z.current
    if (karte && !s.bildKarte) s.bildKarte = requestAnimationFrame(() => { s.bildKarte = 0; zeichneKarte() })
    if (leben && !s.bildLeben) s.bildLeben = requestAnimationFrame(() => { s.bildLeben = 0; zeichneLeben() })
  }

  function zoome(richtung: number, mx: number, my: number): void {
    const s = z.current, alt = STUFEN[s.kam.stufe]
    const neuStufe = Math.max(0, Math.min(STUFEN.length - 1, s.kam.stufe + richtung))
    if (neuStufe === s.kam.stufe) return
    const neu = STUFEN[neuStufe]
    // der Punkt unter dem Mauszeiger bleibt, wo er ist
    const wx = (s.kam.x - s.b / 2 + mx) / alt, wy = (s.kam.y - s.h / 2 + my) / (alt * zeileVon(alt))
    s.kam.stufe = neuStufe
    s.kam.x = wx * neu - mx + s.b / 2
    s.kam.y = wy * neu * zeileVon(neu) - my + s.h / 2
    setzeSchiffSofort()
    fordere(true, true)
  }

  function setzeSchiffSofort(): void {
    const s = z.current, st = p.current.spiel.stand, W = STUFEN[s.kam.stufe]
    s.schiff.x = mitteX(st.q, st.r, W); s.schiff.y = mitteY(st.r, W); s.schiff.dauer = 0; s.schiff.q = st.q; s.schiff.r = st.r
  }

  function kornMuster(ctx: CanvasRenderingContext2D, pal: Palette): CanvasPattern | null {
    const s = z.current, key = pal.hell ? 'h' : 'd'
    if (s.korn && s.kornFuer === key) return s.korn
    const c = document.createElement('canvas')
    c.width = 160; c.height = 160
    const k = c.getContext('2d') as CanvasRenderingContext2D
    for (let i = 0; i < 2600; i++) {
      const h = streu(i, 7, 991)
      k.fillStyle = (h >>> 20) & 1 ? `rgba(255,255,255,${pal.korn})` : `rgba(0,0,0,${pal.korn * 1.3})`
      k.fillRect(h % 160, (h >>> 8) % 160, 1 + ((h >>> 16) & 1), 1)
    }
    s.korn = ctx.createPattern(c, 'repeat'); s.kornFuer = key
    return s.korn
  }

  function zeichneKarte(): void {
    const c = cKarte.current
    if (!c) return
    const s = z.current, { spiel, sicher, marken } = p.current
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    const pal = s.pal, W = STUFEN[s.kam.stufe], bw = 16 * W, bh = hoeheVon(W), dichte = s.dichte
    kartenZaehler.karte++
    // Kamera auf ganze Gerätepunkte runden, sonst entstehen Nähte zwischen den Kacheln
    const links = Math.round((s.kam.x - s.b / 2) * dichte) / dichte, oben = Math.round((s.kam.y - s.h / 2) * dichte) / dichte
    ctx.setTransform(dichte, 0, 0, dichte, 0, 0)
    ctx.fillStyle = pal.see
    ctx.fillRect(0, 0, s.b, s.h)
    const ax0 = Math.floor(links / bw), ax1 = Math.floor((links + s.b) / bw), ay0 = Math.floor(oben / bh), ay1 = Math.floor((oben + s.h) / bh)
    const beginn = performance.now()
    let fehlt = false
    for (let ay = ay0; ay <= ay1; ay++) {
      for (let ax = ax0; ax <= ax1; ax++) {
        const dx = ax * bw - links, dy = ay * bh - oben
        const nb = nebelBild(ax, ay, spiel.karte, pal.nebel, pal.nebelRand)
        if (nb === 'voll') {
          ctx.fillStyle = pal.nebel; ctx.fillRect(dx, dy, bw, bh)
          // hin und wieder eine Beschriftung im Unbekannten, wie auf alten Karten
          const h = streu(ax, ay, 4471)
          if (h % 7 === 0 && W >= 18) {
            ctx.save()
            ctx.translate(dx + bw / 2, dy + bh / 2); ctx.rotate((((h >>> 8) % 21) - 10) / 60)
            ctx.globalAlpha = pal.hell ? 0.2 : 0.16
            ctx.font = `italic ${Math.round(W * 0.62)}px Georgia, Cambria, 'Times New Roman', serif`
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.tinte
            ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${Math.round(W * 0.12)}px`
            ctx.fillText(FERNE[(h >>> 4) % FERNE.length], 0, 0)
            ctx.restore()
          }
          continue
        }
        const key = kachelKey(ax, ay, W, dichte, pal.hell)
        let e = holeKachel(key)
        if (!e) {
          // höchstens ein paar Millisekunden Kachelarbeit je Bild — der Rest kommt im nächsten
          if (performance.now() - beginn < 7) { merkeKachel(key, zeichneKachel(ax, ay, W, dichte, pal)); e = holeKachel(key) }
          else fehlt = true
        }
        if (e?.bild) ctx.drawImage(e.bild, dx, dy, bw, bh)
        if (nb !== 'frei') { ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(nb, MASKE_RAND, MASKE_RAND, MASKE_KERN, MASKE_KERN, dx, dy, bw, bh) }
      }
    }
    if (fehlt) fordere(true, false)
    // Körnung des Papiers über allem, auch über dem Nebel
    const korn = kornMuster(ctx, pal)
    if (korn) { ctx.save(); ctx.translate(-(((links % 160) + 160) % 160), -(((oben % 160) + 160) % 160)); ctx.fillStyle = korn; ctx.fillRect(0, 0, s.b + 160, s.h + 160); ctx.restore() }
    // Kompasslinien wie auf einer Portolankarte: von Hamburg aus und von sechs Nebenrosen im Abstand von 48 Feldern
    ctx.save()
    ctx.strokeStyle = pal.tinte; ctx.lineWidth = 1
    const weit = (s.b + s.h) * 3
    for (let i = 0; i < 7; i++) {
      const rq = i === 0 ? 0 : RICHTUNGEN[i - 1][0] * 48, rr = i === 0 ? 0 : RICHTUNGEN[i - 1][1] * 48
      const mx = mitteX(rq, rr, W) - links, my = mitteY(rr, W) - oben
      if (Math.abs(mx) > weit || Math.abs(my) > weit) continue
      ctx.globalAlpha = i === 0 ? (pal.hell ? 0.1 : 0.075) : (pal.hell ? 0.07 : 0.05)
      ctx.beginPath()
      const strahlen = i === 0 ? 32 : 16
      for (let k = 0; k < strahlen; k++) { const w = (k / strahlen) * Math.PI * 2; ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(w) * weit, my + Math.sin(w) * weit) }
      ctx.stroke()
    }
    ctx.restore()

    const sichtbar = (x: number, y: number, rand = W): boolean => x > -rand && y > -rand && x < s.b + rand && y < s.h + rand
    // Umkehrlinie: bis hierhin reicht der Proviant für den Weg in einen Hafen
    if (sicher && sicher.size) {
      ctx.save()
      ctx.strokeStyle = pal.akzent; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1.4, W * 0.05); ctx.lineCap = 'round'
      ctx.setLineDash([W * 0.16, W * 0.2])
      ctx.beginPath()
      const f0 = feldBei(links, oben, W), f1 = feldBei(links + s.b, oben + s.h, W)
      for (let r = f0.r - 1; r <= f1.r + 1; r++) {
        const qa = feldBei(links, mitteY(r, W), W).q - 1, qb = feldBei(links + s.b, mitteY(r, W), W).q + 1
        for (let q = qa; q <= qb; q++) {
          if (!sicher.has(feldNr(q, r))) continue
          const x = mitteX(q, r, W) - links, y = mitteY(r, W) - oben
          for (let k = 0; k < 6; k++) {
            const nq = q + RICHTUNGEN[k][0], nr = r + RICHTUNGEN[k][1]
            if (sicher.has(feldNr(nq, nr))) continue
            // nur dort eine Linie, wo wirklich der Proviant die Grenze ist: nicht an der Küste, nicht am Rand des Bekannten
            if (!kennt(spiel.karte, nq, nr) || istLand(gelaende(nq, nr))) continue
            const [a, b] = KANTE[k]
            ctx.moveTo(x + ECKEN[a][0] * W, y + ECKEN[a][1] * W); ctx.lineTo(x + ECKEN[b][0] * W, y + ECKEN[b][1] * W)
          }
        }
      }
      ctx.stroke()
      ctx.restore()
    }

    // Orte, Inselnamen, Gerüchte, Schatzkreuze, Flaschenpost
    const st = spiel.stand, gross = Math.max(6, Math.min(15, W * 0.3))
    // rang: 0 = Hafenstadt, 1 = Insel, 2 = Dorf, 3 = Naturwunder — wichtige Namen bekommen zuerst ihren Platz
    const namen: { text: string; x: number; y: number; g: number; kursiv: boolean; leise?: boolean; rang: number; ausweich: number }[] = []
    const belegt: { x0: number; y0: number; x1: number; y1: number }[] = []
    for (const [key, e] of Object.entries(st.entdeckt)) {
      if (e.t === 'i') {
        if (!e.name || s.kam.stufe < 1) continue
        const m = mitteDerInsel(key)
        if (!m) continue
        const x = m.x * W - links, y = m.y * zeileVon(W) * W - oben
        if (sichtbar(x, y, 4 * W)) namen.push({ text: e.name, x, y: y - W * 0.1, g: Math.max(10, Math.min(20, W * (0.34 + Math.min(0.3, m.felder / 90)))), kursiv: true, rang: 1, ausweich: W * 0.62 })
        continue
      }
      const x = mitteX(e.q, e.r, W) - links, y = mitteY(e.r, W) - oben
      if (!sichtbar(x, y)) continue
      const erledigt = (e.art === 'wrack' || e.art === 'treibgut') && st.erledigt[key.slice(1)] === 1
      const a = e.art === 'hafen' ? gross * 1.15 : gross
      ctx.globalAlpha = erledigt ? 0.4 : 1
      zeichneOrt(ctx, e.art, x, y, a, pal, false)
      ctx.globalAlpha = 1
      belegt.push({ x0: x - a, y0: y - a, x1: x + a, y1: y + a })
      if (!e.besucht && !erledigt && e.art !== 'fischgrund' && e.art !== 'strudel') { ctx.fillStyle = pal.akzent; ctx.beginPath(); ctx.arc(x + gross * 0.95, y - gross * 0.95, Math.max(2, gross * 0.24), 0, Math.PI * 2); ctx.fill() }
      if ((e.art === 'hafen' || e.art === 'dorf') && s.kam.stufe >= 1) { const o = ortBei(e.q, e.r); if (o) namen.push({ text: ortName(o), x, y: y + gross + Math.max(8, W * 0.26), g: Math.max(10, W * (e.art === 'hafen' ? 0.36 : 0.3)), kursiv: false, leise: e.art === 'dorf', rang: e.art === 'hafen' ? 0 : 2, ausweich: -(2 * gross + Math.max(16, W * 0.52)) }) }
      else if (e.art === 'wunder' && e.name && s.kam.stufe >= 2) namen.push({ text: e.name, x, y: y + gross + Math.max(8, W * 0.24), g: Math.max(9, W * 0.28), kursiv: true, rang: 3, ausweich: -(2 * gross + Math.max(16, W * 0.48)) })
    }
    for (const g of st.geruechte) {
      if (st.entdeckt[`o${g.q},${g.r}`]) continue
      // ungefähre Lage: bis zu zwei Felder daneben
      const h = streu(g.q, g.r, 5511), q = g.q + (h % 5) - 2, r = g.r + ((h >>> 8) % 5) - 2
      const x = mitteX(q, r, W) - links, y = mitteY(r, W) - oben
      if (sichtbar(x, y)) zeichneGeruecht(ctx, x, y, gross * 0.9, pal)
    }
    for (const k of st.schatzkarten) {
      if (k.gehoben) continue
      const x = mitteX(k.q, k.r, W) - links, y = mitteY(k.r, W) - oben
      if (sichtbar(x, y)) zeichneKreuz(ctx, x + gross * 1.1, y - gross * 1.1, gross * 0.55, pal)
    }
    for (const m of marken ?? []) {
      const x = mitteX(m.q, m.r, W) - links, y = mitteY(m.r, W) - oben
      // (Hinweise von Bündnis-Kameraden zeigen gerade dorthin, wo man selbst noch nicht war)
      if (!sichtbar(x, y, 3 * W) || (m.art !== 'bund' && !kennt(spiel.karte, m.q, m.r))) continue
      if (m.art === 'flasche') zeichneFlasche(ctx, x, y, gross * 0.8, pal)
      else if (m.art !== 'ziel') { zeichneGegner(ctx, m.art, x, y, gross * (m.art === 'gross' ? 1.15 : m.art === 'bund' ? 0.85 : 1.15), pal); belegt.push({ x0: x - gross, y0: y - gross, x1: x + gross, y1: y + gross }) }
    }
    // Namen setzen: der Reihe nach, jeder an der ersten freien Stelle (Wunschplatz, dann ausweichen); sonst entfällt er
    namen.sort((a, b) => a.rang - b.rang)
    for (const n of namen) {
      const opt = { kursiv: n.kursiv, fett: !n.kursiv && !n.leise, farbe: n.leise ? pal.schriftLeise : pal.schrift, weit: n.kursiv ? 0.6 : 0 }
      const halb = textBreite(ctx, n.text, n.g, opt) / 2 + 2, hoch = n.g * 0.62
      const versuche = n.rang === 1 ? [0, -n.ausweich, n.ausweich, -2 * n.ausweich, 2 * n.ausweich] : [0, n.ausweich]
      for (const dy of versuche) {
        const r = { x0: n.x - halb, y0: n.y + dy - hoch, x1: n.x + halb, y1: n.y + dy + hoch }
        if (belegt.some(b => r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0)) continue
        belegt.push(r)
        schreibe(ctx, n.text, n.x, n.y + dy, n.g, pal, opt)
        break
      }
    }
  }

  function zeichneLeben(): void {
    const c = cLeben.current
    if (!c) return
    const s = z.current, { spiel, route, routeGedeckt } = p.current
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    const pal = s.pal, W = STUFEN[s.kam.stufe], dichte = s.dichte
    kartenZaehler.leben++
    const links = Math.round((s.kam.x - s.b / 2) * dichte) / dichte, oben = Math.round((s.kam.y - s.h / 2) * dichte) / dichte
    ctx.setTransform(dichte, 0, 0, dichte, 0, 0)
    ctx.clearRect(0, 0, s.b, s.h)
    const jetzt = performance.now()
    // Schiff: gleitet vom alten aufs neue Feld
    let sx = s.schiff.x, sy = s.schiff.y, bewegt = false
    if (s.schiff.dauer > 0) {
      const t = Math.min(1, (jetzt - s.schiff.start) / s.schiff.dauer), weich = t * t * (3 - 2 * t)
      const zx = mitteX(spiel.stand.q, spiel.stand.r, W), zy = mitteY(spiel.stand.r, W)
      sx = s.schiff.vonX + (zx - s.schiff.vonX) * weich; sy = s.schiff.vonY + (zy - s.schiff.vonY) * weich
      if (t >= 1) { s.schiff.dauer = 0; s.schiff.x = zx; s.schiff.y = zy } else bewegt = true
    }
    // geplante Route
    if (route && route.felder.length) {
      ctx.save()
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      const gedeckt = routeGedeckt ?? route.felder.length
      let px = mitteX(spiel.stand.q, spiel.stand.r, W) - links, py = mitteY(spiel.stand.r, W) - oben
      for (let i = 0; i < route.felder.length; i++) {
        const f = route.felder[i], x = mitteX(f.q, f.r, W) - links, y = mitteY(f.r, W) - oben
        const reicht = i < gedeckt, fremd = !kennt(spiel.karte, f.q, f.r)
        ctx.strokeStyle = reicht ? pal.akzent : pal.gefahr; ctx.fillStyle = ctx.strokeStyle
        ctx.globalAlpha = fremd ? 0.6 : 0.95
        ctx.lineWidth = Math.max(1.6, W * 0.07)
        ctx.setLineDash(fremd ? [W * 0.06, W * 0.2] : [W * 0.2, W * 0.16])
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke()
        ctx.setLineDash([])
        ctx.beginPath(); ctx.arc(x, y, Math.max(2, W * (i === route.felder.length - 1 ? 0.16 : 0.07)), 0, Math.PI * 2); ctx.fill()
        px = x; py = y
      }
      ctx.restore()
    }
    // Feld unter dem Mauszeiger
    if (s.hover && !s.ziehen?.weit) {
      const x = mitteX(s.hover.q, s.hover.r, W) - links, y = mitteY(s.hover.r, W) - oben
      ctx.save()
      ctx.strokeStyle = pal.schrift; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, W * 0.04); ctx.lineJoin = 'round'
      ctx.beginPath()
      for (let i = 0; i < 6; i++) { const ex = x + ECKEN[i][0] * W * 0.94, ey = y + ECKEN[i][1] * W * 0.94; if (i === 0) ctx.moveTo(ex, ey); else ctx.lineTo(ex, ey) }
      ctx.closePath(); ctx.stroke()
      ctx.restore()
    }
    // Wippen: nur im Vordergrund und kurz nach einer Eingabe
    const lebendig = document.hasFocus() && !document.hidden && jetzt - s.letzteEingabe < 30000
    const wippen = lebendig ? Math.sin(jetzt / 520) * Math.max(0.6, W * 0.03) : 0
    const a = Math.max(8, Math.min(26, W * 0.46))
    zeichneSchiff(ctx, sx - links, sy - oben - a * 0.25, a, spiel.stand.klasse, s.schiff.links, pal, wippen)
    if (bewegt) fordere(false, true)
  }

  // Größe, Bildschirmdichte, Farbschema
  useEffect(() => {
    const el = huelle.current, k = cKarte.current, l = cLeben.current
    if (!el || !k || !l) return
    const s = z.current
    const passeAn = (): void => {
      const r = el.getBoundingClientRect()
      const dichte = Math.min(2, Math.max(1, Math.round((window.devicePixelRatio || 1) * 4) / 4))
      if (dichte !== s.dichte) { leereKacheln(); s.dichte = dichte }
      s.b = Math.max(1, Math.floor(r.width)); s.h = Math.max(1, Math.floor(r.height))
      for (const c of [k, l]) { c.width = Math.round(s.b * dichte); c.height = Math.round(s.h * dichte); c.style.width = `${s.b}px`; c.style.height = `${s.h}px` }
      fordere(true, true)
    }
    const st = p.current.spiel.stand, W = STUFEN[s.kam.stufe]
    s.kam.x = mitteX(st.q, st.r, W); s.kam.y = mitteY(st.r, W)
    setzeSchiffSofort()
    s.letzteEingabe = performance.now()
    passeAn()
    const ro = new ResizeObserver(passeAn)
    ro.observe(el)
    const schema = new MutationObserver(() => { const hell = istHell(); if (hell !== s.pal.hell) { s.pal = palette(hell); leereKacheln(); leereNebel(); fordere(true, true) } })
    schema.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const wippUhr = window.setInterval(() => { if (document.hasFocus() && !document.hidden && performance.now() - s.letzteEingabe < 30000) fordere(false, true) }, 110)
    return () => {
      ro.disconnect(); schema.disconnect(); window.clearInterval(wippUhr)
      if (s.bildKarte) cancelAnimationFrame(s.bildKarte)
      if (s.bildLeben) cancelAnimationFrame(s.bildLeben)
      s.bildKarte = 0; s.bildLeben = 0
      leereKacheln(); leereNebel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Spielzug: Schiff gleiten lassen, Kamera folgt, Karte neu
  useEffect(() => {
    const s = z.current, st = props.spiel.stand, W = STUFEN[s.kam.stufe]
    if (Number.isNaN(s.schiff.q)) setzeSchiffSofort()
    else if (s.schiff.q !== st.q || s.schiff.r !== st.r) {
      const zx = mitteX(st.q, st.r, W), zy = mitteY(st.r, W)
      const nah = Math.abs(zx - s.schiff.x) < W * 2.5 && Math.abs(zy - s.schiff.y) < W * 2.5
      if (zx !== s.schiff.x) s.schiff.links = zx < s.schiff.x
      s.schiff.vonX = s.schiff.x; s.schiff.vonY = s.schiff.y; s.schiff.start = performance.now(); s.schiff.dauer = nah ? (props.schrittMs ?? 200) : 0
      s.schiff.x = zx; s.schiff.y = zy; s.schiff.q = st.q; s.schiff.r = st.r
      // Kamera nachführen, wenn das Schiff dem Rand nahe kommt (oder weit gesprungen ist)
      const rx = zx - (s.kam.x - s.b / 2), ry = zy - (s.kam.y - s.h / 2), rand = Math.min(s.b, s.h) * 0.22
      if (!nah) { s.kam.x = zx; s.kam.y = zy }
      else {
        if (rx < rand) s.kam.x -= rand - rx; else if (rx > s.b - rand) s.kam.x += rx - (s.b - rand)
        if (ry < rand) s.kam.y -= rand - ry; else if (ry > s.h - rand) s.kam.y += ry - (s.h - rand)
      }
    }
    s.letzteEingabe = performance.now()
    fordere(true, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.rev, props.spiel])
  useEffect(() => { fordere(false, true) }, [props.route, props.routeGedeckt]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fordere(true, false) }, [props.sicher, props.marken]) // eslint-disable-line react-hooks/exhaustive-deps

  // Eingaben
  const feldVon = (e: { clientX: number; clientY: number }): Feld => {
    const s = z.current, r = (huelle.current as HTMLDivElement).getBoundingClientRect()
    return feldBei(s.kam.x - s.b / 2 + e.clientX - r.left, s.kam.y - s.h / 2 + e.clientY - r.top, STUFEN[s.kam.stufe])
  }
  return (
    <div ref={huelle} className="ti-karte" data-ti-karte
      onPointerDown={e => { const s = z.current; s.letzteEingabe = performance.now(); (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId); s.ziehen = { x: e.clientX, y: e.clientY, kx: s.kam.x, ky: s.kam.y, weit: false } }}
      onPointerMove={e => {
        const s = z.current
        s.letzteEingabe = performance.now()
        if (s.ziehen) {
          const dx = e.clientX - s.ziehen.x, dy = e.clientY - s.ziehen.y
          if (!s.ziehen.weit && Math.abs(dx) + Math.abs(dy) > 5) s.ziehen.weit = true
          if (s.ziehen.weit) { s.kam.x = s.ziehen.kx - dx; s.kam.y = s.ziehen.ky - dy; fordere(true, true) }
          return
        }
        const f = feldVon(e)
        if (!s.hover || s.hover.q !== f.q || s.hover.r !== f.r) { s.hover = f; fordere(false, true); p.current.onHover?.(f) }
      }}
      onPointerUp={e => { const s = z.current, zg = s.ziehen; s.ziehen = null; if (zg && !zg.weit) p.current.onFeld?.(feldVon(e)) }}
      onPointerLeave={() => { const s = z.current; if (s.hover) { s.hover = null; fordere(false, true); p.current.onHover?.(null) } }}
      onWheel={e => { const r = (huelle.current as HTMLDivElement).getBoundingClientRect(); z.current.letzteEingabe = performance.now(); zoome(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top) }}
    >
      <canvas ref={cKarte} />
      <canvas ref={cLeben} />
    </div>
  )
})

export default Karte
export { abschnittKey }
