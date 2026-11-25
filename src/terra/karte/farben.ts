// Terra Incognita — Farben der Karte. Dunkel: Nachtkarte (tiefblau, goldene Tinte). Hell: Pergament (Sepia).
// Das Tool schaltet nur die Klasse .light am <html> um.

export interface Palette {
  hell: boolean
  see: string
  seeTief: string
  flach: string
  land: string
  landHoch: string
  tinte: string
  tinteLeise: string
  nebel: string
  nebelRand: string
  eis: string
  eisRand: string
  tang: string
  riff: string
  schrift: string
  schriftLeise: string
  akzent: string
  gefahr: string
  gut: string
  /** Körnung des Papiers: Deckkraft */
  korn: number
}

export const NACHT: Palette = {
  hell: false,
  see: '#0E2238', seeTief: '#0A1A2D', flach: '#1B4460', land: '#2A4A4F', landHoch: '#3B5C58',
  tinte: '#E2BF78', tinteLeise: 'rgba(226,191,120,0.55)', nebel: '#091524', nebelRand: '#1A3148',
  eis: 'rgba(214,232,244,0.78)', eisRand: 'rgba(240,248,255,0.9)', tang: '#7C8F4A', riff: '#F0A070',
  schrift: '#F3E3BC', schriftLeise: 'rgba(243,227,188,0.72)', akzent: '#FFD27A', gefahr: '#FF8A6B', gut: '#8FD6A8', korn: 0.05,
}
export const PERGAMENT: Palette = {
  hell: true,
  see: '#E7DCC0', seeTief: '#E2D6B8', flach: '#CFDCCB', land: '#E9D49B', landHoch: '#D9BD7C',
  tinte: '#4E3B26', tinteLeise: 'rgba(78,59,38,0.5)', nebel: '#C7B48B', nebelRand: '#DCCDA8',
  eis: 'rgba(255,255,255,0.86)', eisRand: 'rgba(120,150,170,0.8)', tang: '#6F7F3A', riff: '#A8482C',
  schrift: '#3A2A18', schriftLeise: 'rgba(58,42,24,0.7)', akzent: '#9A5B14', gefahr: '#A8321C', gut: '#2F7A4A', korn: 0.07,
}

export const istHell = (): boolean => typeof document !== 'undefined' && document.documentElement.classList.contains('light')
export const palette = (hell: boolean = istHell()): Palette => (hell ? PERGAMENT : NACHT)

export const SCHRIFT_ZIER = "Georgia, Cambria, 'Times New Roman', serif"
