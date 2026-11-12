// ── Headset Vergabe – Verlauf & Tendenz (reine Rechenlogik, testbar) ─────────
// Zählt Headset-Übergaben je Monat bzw. Quartal, glättet mit einem gleitenden Ø über
// 3 Monate (bzw. 2 Quartale) und legt eine Trendgerade (kleinste Quadrate) über die
// ABGESCHLOSSENEN Zeiträume des gewählten Ausschnitts. Die laufende Periode zählt nicht
// in den Trend (sie ist noch unvollständig und würde ihn nach unten ziehen). Die Gerade
// wird in die Zukunft verlängert → „erwartet".

import { grundText, type HeadsetVergabe } from './headsetVergabe'

export type Raster = 'monat' | 'quartal'
export type Richtung = 'steigend' | 'fallend' | 'stabil' | 'unklar'

export const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez']

export interface Periode {
  key: string            // 'YYYY-MM' bzw. 'YYYY-Q1'
  kurz: string           // Achse: 'Mär' bzw. 'Q1'
  lang: string           // Tooltip: 'März 2026' bzw. '1. Quartal 2026'
  jahr: string
  anzahl: number
  /** noch nicht abgeschlossen (heute liegt darin) */
  laufend: boolean
  /** liegt nach heute — nur Trend-Erwartung */
  zukunft: boolean
  /** gleitender Ø (3 Monate bzw. 2 Quartale), nur abgeschlossene Perioden */
  schnitt?: number
  /** Wert der Trendgeraden (≥ 0) */
  trend?: number
  namen: string[]
  gruende: Record<string, number>
}

export interface HeadsetTrend {
  perioden: Periode[]
  richtung: Richtung
  /** Trendwert am Anfang/Ende der abgeschlossenen Perioden im Ausschnitt */
  trendVon: number | null
  trendBis: number | null
  /** Summe der Trendwerte über die Zukunfts-Perioden */
  erwartet: number | null
  erwartetPerioden: number
  letzte12: number
  vorige12: number
  /** Gründe der letzten 12 Monate, absteigend */
  gruende12: [string, number][]
  ersteMonat: string
  ohneDatum: number
}

const MONATE_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const plusMonate = (key: string, n: number) => { const [y, m] = key.split('-').map(Number); return ym(new Date(y, m - 1 + n, 1)) }
const quartalVon = (monat: string) => `${monat.slice(0, 4)}-Q${Math.floor((Number(monat.slice(5, 7)) - 1) / 3) + 1}`
const rund1 = (n: number) => Math.round(n * 10) / 10

function periodeVon(monat: string, raster: Raster): string { return raster === 'monat' ? monat : quartalVon(monat) }
function texte(key: string, raster: Raster): Pick<Periode, 'kurz' | 'lang' | 'jahr'> {
  const jahr = key.slice(0, 4)
  if (raster === 'quartal') { const q = key.slice(6); return { kurz: `Q${q}`, lang: `${q}. Quartal ${jahr}`, jahr } }
  const m = Number(key.slice(5, 7)) - 1
  return { kurz: MONATE_KURZ[m], lang: `${MONATE_LANG[m]} ${jahr}`, jahr }
}

/** Kleinste Quadrate y = a + b·x über die Punkte (x = Index). */
export function gerade(punkte: [number, number][]): { a: number; b: number } | null {
  const n = punkte.length
  if (n < 2) return null
  const sx = punkte.reduce((s, [x]) => s + x, 0), sy = punkte.reduce((s, [, y]) => s + y, 0)
  const sxx = punkte.reduce((s, [x]) => s + x * x, 0), sxy = punkte.reduce((s, [x, y]) => s + x * y, 0)
  const nenner = n * sxx - sx * sx
  if (!nenner) return null
  const b = (n * sxy - sx * sy) / nenner
  return { a: (sy - b * sx) / n, b }
}

/**
 * @param zeitraumMonate 12/24/36 … oder 0 = alles
 * @param heute für Tests
 */
export function werteHeadsetsAus(eintraege: HeadsetVergabe[], raster: Raster, zeitraumMonate: number, heute = new Date()): HeadsetTrend {
  const jetztMonat = ym(heute)
  const mitDatum = eintraege.filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.datum || ''))
  const ohneDatum = eintraege.length - mitDatum.length
  const monate = mitDatum.map(e => e.datum.slice(0, 7)).filter(m => m <= jetztMonat).sort()
  const ersteMonat = monate[0] || jetztMonat

  // 12-Monats-Vergleich immer auf Monatsbasis (abgeschlossene Monate)
  const ende12 = plusMonate(jetztMonat, -1), start12 = plusMonate(jetztMonat, -12), start24 = plusMonate(jetztMonat, -24)
  const inMonat = (e: HeadsetVergabe, von: string, bis: string) => { const m = e.datum.slice(0, 7); return m >= von && m <= bis }
  const letzte12Liste = mitDatum.filter(e => inMonat(e, start12, ende12))
  const vorige12 = mitDatum.filter(e => inMonat(e, start24, plusMonate(start12, -1))).length
  const g = new Map<string, number>()
  for (const e of letzte12Liste) { const t = grundText(e.grund); g.set(t, (g.get(t) || 0) + 1) }
  const gruende12 = [...g].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))

  // Alle Perioden vom ersten Eintrag bis heute + Zukunft (3 Monate bzw. 1 Quartal)
  const zukunftMonate = raster === 'monat' ? 3 : 3
  const keys: string[] = []
  for (let m = ersteMonat; m <= plusMonate(jetztMonat, zukunftMonate); m = plusMonate(m, 1)) {
    const k = periodeVon(m, raster)
    if (keys[keys.length - 1] !== k) keys.push(k)
  }
  const jetztKey = periodeVon(jetztMonat, raster)
  const alle: Periode[] = keys.map(k => ({ key: k, ...texte(k, raster), anzahl: 0, laufend: k === jetztKey, zukunft: k > jetztKey, namen: [], gruende: {} }))
  const index = new Map(alle.map((p, i) => [p.key, i]))
  for (const e of mitDatum) {
    const i = index.get(periodeVon(e.datum.slice(0, 7), raster))
    if (i === undefined || alle[i].zukunft) continue
    const p = alle[i]
    p.anzahl++; p.namen.push(e.name)
    const t = grundText(e.grund); p.gruende[t] = (p.gruende[t] || 0) + 1
  }
  // gleitender Ø über die ganze Reihe (damit der Ausschnitt am Anfang schon Werte hat)
  const fenster = raster === 'monat' ? 3 : 2
  alle.forEach((p, i) => {
    if (p.laufend || p.zukunft || i < fenster - 1) return
    p.schnitt = rund1(alle.slice(i - fenster + 1, i + 1).reduce((s, x) => s + x.anzahl, 0) / fenster)
  })

  // Ausschnitt
  let perioden = alle
  if (zeitraumMonate > 0) {
    const ab = periodeVon(plusMonate(jetztMonat, -(zeitraumMonate - 1)), raster)
    perioden = alle.filter(p => p.key >= ab)
  }

  // Trend über die abgeschlossenen Perioden im Ausschnitt
  const fertig = perioden.map((p, i) => [i, p] as const).filter(([, p]) => !p.laufend && !p.zukunft)
  const mindest = raster === 'monat' ? 4 : 3
  let richtung: Richtung = 'unklar', trendVon: number | null = null, trendBis: number | null = null, erwartet: number | null = null
  const ger = fertig.length >= mindest ? gerade(fertig.map(([i, p]) => [i, p.anzahl])) : null
  const zukunft = perioden.filter(p => p.zukunft)
  if (ger) {
    const wert = (i: number) => Math.max(0, ger.a + ger.b * i)
    perioden = perioden.map((p, i) => ({ ...p, trend: rund1(wert(i)) }))
    const i0 = fertig[0][0], i1 = fertig[fertig.length - 1][0]
    trendVon = rund1(wert(i0)); trendBis = rund1(wert(i1))
    const schnitt = fertig.reduce((s, [, p]) => s + p.anzahl, 0) / fertig.length
    const diff = ger.b * (i1 - i0)
    const rel = schnitt > 0 ? diff / schnitt : 0
    richtung = Math.abs(rel) >= 0.15 && Math.abs(diff) >= 0.5 ? (diff > 0 ? 'steigend' : 'fallend') : 'stabil'
    erwartet = Math.round(perioden.reduce((s, p, i) => s + (p.zukunft ? wert(i) : 0), 0))
  }

  return {
    perioden, richtung, trendVon, trendBis, erwartet, erwartetPerioden: zukunft.length,
    letzte12: letzte12Liste.length, vorige12, gruende12, ersteMonat, ohneDatum,
  }
}
