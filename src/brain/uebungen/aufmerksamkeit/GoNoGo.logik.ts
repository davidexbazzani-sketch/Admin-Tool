// Go / No-Go — reine Logik (ohne Oberfläche): Stufen, Figurenfolge erzeugen, Regel prüfen, werten.
// Die Stufen-Tabelle steht ausführlich im Kopf von GoNoGo.tsx.
import type { Rohergebnis } from '../../kern/typen'
import type { Rng } from '../../kern/zufall'
import { guete, tempoAus } from '../../kern/wertung'
import { fuelle, jeStufe, laengsterLauf, median, mittel, mischeBis, zieheFolge } from './gemeinsam.logik'

export type GngForm = 'kreis' | 'quadrat' | 'dreieck' | 'stern' | 'kreuz' | 'raute'
/** alle Figuren unterscheiden sich in der FORM (nie nur in der Farbe) */
export const GNG_FORMEN: readonly GngForm[] = ['kreis', 'quadrat', 'dreieck', 'stern', 'kreuz', 'raute']
/** für die einfache Regel: nur Figuren, die sich auf einen Blick unterscheiden */
const GNG_KLAR: readonly GngForm[] = ['kreis', 'quadrat', 'dreieck', 'stern', 'kreuz']
export const GNG_FORMNAME: Record<GngForm, string> = { kreis: 'Kreis', quadrat: 'Quadrat', dreieck: 'Dreieck', stern: 'Stern', kreuz: 'Kreuz', raute: 'Raute' }

/**
 * 'eine'   — eine Go-Figur, eine No-Go-Figur
 * 'zwei'   — drei Go-Figuren, zwei No-Go-Figuren („drücke bei allem, nur nicht bei diesen beiden“)
 * 'gleich' — nicht drücken, wenn die Figur dieselbe ist wie die vorige
 */
export type GngRegel = 'eine' | 'zwei' | 'gleich'

export interface GngStufe {
  regel: GngRegel
  /** Abstand von Figur zu Figur */
  intervallMs: number
  /** davon am Ende leer (die Figur verschwindet, bevor die nächste kommt) */
  lueckeMs: number
  /** Anteil der No-Go-Durchgänge */
  noGoAnteil: number
}

export const GNG_STUFEN: readonly GngStufe[] = [
  { regel: 'eine', intervallMs: 1100, lueckeMs: 300, noGoAnteil: 0.30 },
  { regel: 'eine', intervallMs: 1000, lueckeMs: 300, noGoAnteil: 0.30 },
  { regel: 'eine', intervallMs: 900, lueckeMs: 250, noGoAnteil: 0.25 },
  { regel: 'eine', intervallMs: 800, lueckeMs: 250, noGoAnteil: 0.25 },
  { regel: 'zwei', intervallMs: 780, lueckeMs: 250, noGoAnteil: 0.25 },
  { regel: 'zwei', intervallMs: 740, lueckeMs: 230, noGoAnteil: 0.25 },
  { regel: 'zwei', intervallMs: 700, lueckeMs: 220, noGoAnteil: 0.25 },
  { regel: 'gleich', intervallMs: 700, lueckeMs: 220, noGoAnteil: 0.25 },
  { regel: 'gleich', intervallMs: 650, lueckeMs: 200, noGoAnteil: 0.25 },
  { regel: 'gleich', intervallMs: 600, lueckeMs: 200, noGoAnteil: 0.25 },
]
export const gngStufe = (stufe: number): GngStufe => jeStufe(GNG_STUFEN, stufe)
export const GNG_ANZAHL = 40

export interface GngVersuch { form: GngForm; go: boolean }

export interface GngPlan {
  regel: GngRegel
  /** Figuren, bei denen gedrückt wird (Regel 'gleich': alle vorkommenden Figuren) */
  go: GngForm[]
  /** Figuren, bei denen NICHT gedrückt wird (Regel 'gleich': leer) */
  noGo: GngForm[]
  versuche: GngVersuch[]
}

/** Die Regel selbst: Muss bei dieser Figur gedrückt werden? `vorige` = Figur unmittelbar davor (null am Anfang). */
export function gngIstGo(plan: Pick<GngPlan, 'regel' | 'noGo'>, form: GngForm, vorige: GngForm | null): boolean {
  return plan.regel === 'gleich' ? vorige === null || form !== vorige : !plan.noGo.includes(form)
}

/**
 * Erzeugt die Figurenfolge eines Durchgangs.
 * Regeln: exakt der verlangte No-Go-Anteil · die ersten beiden Figuren sind Go (der Rhythmus muss erst entstehen) ·
 * höchstens zwei No-Go hintereinander · höchstens acht Go hintereinander.
 */
export function gngPlan(r: Rng, stufe: number, n: number = GNG_ANZAHL): GngPlan {
  const s = gngStufe(stufe)
  const nNoGo = Math.round(n * s.noGoAnteil)
  const istGo = mischeBis(r, [...fuelle(nNoGo, false), ...fuelle(n - nNoGo, true)],
    f => f[0] && f[1] && laengsterLauf(f, x => !x) <= 2 && laengsterLauf(f, x => x) <= 8)

  if (s.regel === 'eine') {
    const [go, noGo] = r.ausN(GNG_KLAR, 2)
    return { regel: s.regel, go: [go], noGo: [noGo], versuche: istGo.map(g => ({ form: g ? go : noGo, go: g })) }
  }

  if (s.regel === 'zwei') {
    const formen = r.ausN(GNG_FORMEN, 5)
    const go = formen.slice(0, 3), noGo = formen.slice(3)
    const goFolge = zieheFolge(r, go, n - nNoGo)
    const noGoFolge = zieheFolge(r, noGo, nNoGo)
    let a = 0, b = 0
    return { regel: s.regel, go, noGo, versuche: istGo.map(g => ({ form: g ? goFolge[a++] : noGoFolge[b++], go: g })) }
  }

  // 'gleich': vier Figuren; No-Go ist die Wiederholung der vorigen
  const formen = r.ausN(GNG_FORMEN, 4)
  const versuche: GngVersuch[] = []
  for (let i = 0; i < n; i++) {
    const vorige = versuche[i - 1]?.form
    const form = i === 0 ? r.aus(formen) : istGo[i] ? r.aus(formen.filter(f => f !== vorige)) : vorige
    versuche.push({ form, go: istGo[i] })
  }
  return { regel: s.regel, go: formen, noGo: [], versuche }
}

export interface GngMessung { go: boolean; gedrueckt: boolean; ms: number | null }

export interface GngZahlen { treffer: number; verpasst: number; fehlalarme: number; gewartet: number }

export function gngZahlen(m: readonly GngMessung[]): GngZahlen {
  return {
    treffer: m.filter(x => x.go && x.gedrueckt).length,
    verpasst: m.filter(x => x.go && !x.gedrueckt).length,
    fehlalarme: m.filter(x => !x.go && x.gedrueckt).length,
    gewartet: m.filter(x => !x.go && !x.gedrueckt).length,
  }
}

/**
 * Wertung: Trefferquote × (1 − Fehlalarmquote).
 * Ein Fehlalarm (gedrückt, obwohl No-Go) wiegt damit rund dreimal so schwer wie ein verpasster Go-Reiz, weil es
 * viel weniger No-Go-Durchgänge gibt — und „immer drücken“ ergibt genau wie „nie drücken“ null.
 * Das Tempo kommt aus dem Median der Treffer-Reaktionszeiten, gemessen am Takt der Stufe.
 */
export function gngWertung(m: readonly GngMessung[], intervallMs: number): Rohergebnis {
  const z = gngZahlen(m)
  const nGo = z.treffer + z.verpasst, nNoGo = z.fehlalarme + z.gewartet
  const trefferQuote = nGo ? z.treffer / nGo : 0
  const fehlalarmQuote = nNoGo ? z.fehlalarme / nNoGo : 0
  const zeiten = m.filter(x => x.go && x.gedrueckt && x.ms !== null).map(x => x.ms as number)
  const tempo = tempoAus(median(zeiten), 220 + 0.1 * intervallMs, 300 + 0.37 * intervallMs)
  const teile = [
    `${z.fehlalarme} ${z.fehlalarme === 1 ? 'Fehlalarm' : 'Fehlalarme'}`,
    `${z.verpasst} verpasst`,
    ...(zeiten.length ? [`Ø ${Math.round(mittel(zeiten))} ms`] : []),
  ]
  return {
    leistung: guete(trefferQuote * (1 - fehlalarmQuote), tempo),
    richtig: z.treffer + z.gewartet, gesamt: m.length,
    rtMs: zeiten.length ? Math.round(mittel(zeiten)) : undefined,
    text: teile.join(' · '),
  }
}
