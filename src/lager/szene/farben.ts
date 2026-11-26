// Farben der 3D-Szene. Der Raum selbst sieht in beiden Designs gleich aus (wie im Foto),
// nur Umgebung und Licht passen sich an.

import type { LagerTyp } from '../typen'

export interface Palette {
  hintergrund: string
  wand: string
  teppich: string
  regal: string
  regalRueckwand: string
  kante: string
  monitor: string
  lichtHimmel: number
  lichtBoden: number
  lichtSonne: number
}

export const HELL: Palette = {
  hintergrund: '#eef0f3', wand: '#ddd9cf', teppich: '#76777a', regal: '#e4e4df', regalRueckwand: '#cfcfc9', kante: '#f2f2ee', monitor: '#1d1f23',
  lichtHimmel: 2.2, lichtBoden: 0.9, lichtSonne: 1.25,
}

export const DUNKEL: Palette = {
  hintergrund: '#0b0f17', wand: '#cfcbc1', teppich: '#68696c', regal: '#dcdcd6', regalRueckwand: '#c3c3bd', kante: '#ececE7', monitor: '#16181b',
  lichtHimmel: 1.9, lichtBoden: 0.75, lichtSonne: 1.1,
}

// Feste Farbe je Typ (Wunsch 26.11.2026): Tower orange, Mini-PC blau, ZBook grün, Laptops hellgrau
export const TYP_FARBE: Record<LagerTyp, string> = {
  tower: '#f97316',
  zbook: '#22c55e',
  elitebook: '#d4d7dc',
  minipc: '#3b82f6',
  sonstiges: '#8d6e63',
}

/** Farbe für Legende, Listen und Regalansicht — dieselbe wie im Raum. */
export const TYP_PUNKT: Record<LagerTyp, string> = TYP_FARBE

/** Rand um Geräte, die schon jemandem zugedacht sind (Namensschild in derselben Farbe). */
export const VORGESEHEN = '#d946ef'
export const KANTE = '#ffffff'
export const AUSWAHL = '#facc15'
export const TREFFER = '#06b6d4'

export const ZONE_FARBE = { blau: '#2563eb', rot: '#dc2626', gelb: '#eab308', grau: '#9ca3af' } as const

export const INVENTUR_FARBE = { stimmt: '#16a34a', abweichung: '#dc2626', offen: '#9ca3af' } as const
