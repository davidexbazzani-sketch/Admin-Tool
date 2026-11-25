// Terra Incognita — die Gegner: Piraten, Piratennester, Seeungeheuer und der große Gegner der Woche.
// Stärke wächst mit der Entfernung von Hamburg (Stufe 1 … 9). Namen und Eigenheiten kommen fest aus dem Startwert.
import { streu } from '../kern/streu'
import type { SchiffStart } from './regeln'

export type GegnerArt = 'pirat' | 'krake' | 'schlange' | 'geist' | 'nest' | 'gross' | 'festung'
export type Gestalt = 'krake' | 'schlange' | 'geist' | 'admiral'

export interface Gegner {
  /** feste Kennung: Pirat und Ungeheuer je Revier und Tag, Nest je Ort, großer Gegner je Woche, Festung „f:<Besitzer>“ */
  id: string
  art: GegnerArt
  q: number
  r: number
  /** 1 … 9 */
  stufe: number
  saat: number
  /** nur beim großen Gegner */
  gestalt?: Gestalt
  /** Stufe 3, nur bei einer Festung: Besitzer (Benutzer) und Name der Festung */
  u?: string
  n?: string
}

const S_NAME = 9501
const VORNAMEN = ['Hinnerk', 'Grete', 'Klaas', 'Jan', 'Wiebke', 'Hein', 'Tjark', 'Fenja', 'Ole', 'Marten', 'Ilsabe', 'Jörn', 'Antje', 'Broder', 'Gesche', 'Lüder']
const BEINAMEN = ['Schwarzbart', 'Einaug', 'die Ratte', 'Pulverfass', 'Halsabschneider', 'Rotkopf', 'der Lange', 'Knochenhand', 'Säbelzahn', 'die Hexe', 'Krummbein', 'Silberzahn', 'der Grausame', 'Teerjacke', 'Sturmkrähe', 'Messerkling']
const PIRATENSCHIFFE = ['Rote Möwe', 'Seeteufel', 'Schwarze Witwe', 'Galgenvogel', 'Blutige Rose', 'Haifisch', 'Dreizack', 'Nachtfalke', 'Totenkopf', 'Wolf der See', 'Tückische Grete', 'Höllenhund']
const NESTER = ['Schmugglerbucht', 'Galgenriff', 'Teufelsloch', 'Rabenklippe', 'Totenmannsbucht', 'Säbelfjord', 'Pulverkammer', 'Krähennest-Bucht']

export interface PiratName { kapitaen: string; schiff: string }
export function piratName(saat: number): PiratName {
  const h = streu(saat, 1, S_NAME)
  return { kapitaen: `${VORNAMEN[h % VORNAMEN.length]} ${BEINAMEN[(h >>> 8) % BEINAMEN.length]}`, schiff: PIRATENSCHIFFE[(h >>> 16) % PIRATENSCHIFFE.length] }
}
export const nestName = (saat: number): string => NESTER[streu(saat, 2, S_NAME) % NESTER.length]

export const GESTALT_NAME: Record<Gestalt, string> = { krake: 'Die Krake von Skagen', schlange: 'Die Seeschlange vom Sund', geist: 'Der Fliegende Holländer', admiral: 'Admiral Rotbarts Flotte' }
export const GEGNER_NAME: Record<GegnerArt, string> = { pirat: 'Piraten', krake: 'Riesenkrake', schlange: 'Seeschlange', geist: 'Geisterschiff', nest: 'Piratennest', gross: 'Der große Gegner', festung: 'Festung' }

const GEGNER_ARTEN: readonly GegnerArt[] = ['pirat', 'krake', 'schlange', 'geist', 'nest', 'gross', 'festung']
const GESTALTEN: readonly Gestalt[] = ['krake', 'schlange', 'geist', 'admiral']
/** einen gespeicherten Gegner prüfen */
export function pruefeGegner(roh: unknown): Gegner | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Record<string, unknown>
  if (!GEGNER_ARTEN.includes(d.art as GegnerArt) || typeof d.id !== 'string') return null
  const zahl = (x: unknown, von: number, bis: number): number => (typeof x === 'number' && Number.isFinite(x) ? Math.max(von, Math.min(bis, Math.floor(x))) : von)
  const g: Gegner = { id: d.id.slice(0, 40), art: d.art as GegnerArt, q: zahl(d.q, -30000, 30000), r: zahl(d.r, -30000, 30000), stufe: zahl(d.stufe, 1, 9), saat: zahl(d.saat, 0, 0xFFFFFFFF) }
  if (GESTALTEN.includes(d.gestalt as Gestalt)) g.gestalt = d.gestalt as Gestalt
  if (g.art === 'festung') {
    if (typeof d.u !== 'string' || !/^[a-z0-9._-]{1,60}$/.test(d.u)) return null
    g.u = d.u
    g.n = typeof d.n === 'string' ? d.n.slice(0, 40) : ''
  }
  return g
}

/** Name, wie er im Logbuch steht */
export function gegnerTitel(g: Gegner): string {
  if (g.art === 'pirat') { const n = piratName(g.saat); return `${n.kapitaen} auf der „${n.schiff}“` }
  if (g.art === 'nest') return `das Piratennest ${nestName(g.saat)}`
  if (g.art === 'gross') return GESTALT_NAME[g.gestalt ?? 'krake']
  if (g.art === 'festung') return `die Festung „${g.n || 'ohne Namen'}“`
  return GEGNER_NAME[g.art]
}

// Piratenschiffe je Stufe (Entfernung von Hamburg in Schritten zu 14 Feldern). Gedacht ist: Wer mit dem Schiff
// unterwegs ist, das man dort üblicherweise fährt (Kutter in Stufe 1, Schoner in 2, Brigg in 3, Fregatte ab 4), ist
// den Piraten leicht überlegen — weiter draußen holen sie auf.
const P_KLASSE = [1, 1, 2, 3, 4, 4, 4, 4, 4, 4]
const P_KANONEN = [2, 2, 3, 5, 7, 8, 8, 9, 9, 10]
const P_RUMPF = [10, 10, 18, 26, 36, 42, 46, 50, 54, 58]
const P_CREW = [7, 7, 12, 18, 26, 30, 33, 36, 38, 40]
const P_FAHRT = [4, 4, 5, 4, 5, 5, 5, 5, 5, 5]
const st = (n: number): number => Math.max(1, Math.min(9, n))

function pirat(id: number, saat: number, stufe: number, anteil = 100): SchiffStart {
  const s = st(stufe), h = streu(saat, 3, S_NAME), n = piratName(saat)
  const rumpf = Math.max(6, Math.floor((P_RUMPF[s] * anteil) / 100))
  return {
    id, seite: 1, name: n.schiff, art: 'segler', klasse: P_KLASSE[s], rumpf, rumpfMax: rumpf, crewMax: Math.max(4, Math.floor((P_CREW[s] * anteil) / 100)),
    kanonen: Math.max(1, Math.floor((P_KANONEN[s] * anteil) / 100)), bewegung: P_FAHRT[s], enter: 20, drehbassen: s >= 3 && h % 2 === 0, navigator: false, arzt: 0,
    mut: (h >>> 4) % 3, staerke: 0,
  }
}

/** die Schiffe (oder Ungeheuer) eines Gegners. `eigeneKlasse` bestimmt die Wucht des großen Gegners: Er ist für jeden
 *  bezwingbar, auch allein — er zählt nur den Schaden, den einer anrichtet. */
export function gegnerSchiffe(g: Gegner, eigeneKlasse: number, grossRest = 0, grossMax = 0): SchiffStart[] {
  const s = st(g.stufe), h = streu(g.saat, 4, S_NAME)
  switch (g.art) {
    case 'pirat': {
      const aus = [pirat(10, g.saat, s)]
      // weit draußen fährt jeder dritte Pirat mit einem kleineren Begleiter
      if (s >= 5 && h % 3 === 0) aus.push({ ...pirat(11, g.saat ^ 0x5bd1e995, s - 2, 70), name: `${aus[0].name} II` })
      return aus
    }
    case 'nest':
      return [
        { id: 10, seite: 1, name: nestName(g.saat), art: 'fort', klasse: 0, rumpf: 16 + 6 * s, rumpfMax: 16 + 6 * s, crewMax: 1, kanonen: 2 + s, bewegung: 0, enter: 0, drehbassen: false, navigator: false, arzt: 0, mut: 1, staerke: 0 },
        pirat(11, g.saat, s, 85),
        { ...pirat(12, g.saat ^ 0x27d4eb2f, s - 1, 70), name: piratName(g.saat ^ 0x27d4eb2f).schiff },
      ]
    case 'krake':
      return [{ id: 10, seite: 1, name: 'Riesenkrake', art: 'krake', klasse: 0, rumpf: 18 + 7 * s, rumpfMax: 18 + 7 * s, crewMax: 1, kanonen: 0, bewegung: 3, enter: 0, drehbassen: false, navigator: false, arzt: 0, mut: 2, staerke: 1 + Math.floor(s / 2) }]
    case 'schlange':
      return [{ id: 10, seite: 1, name: 'Seeschlange', art: 'schlange', klasse: 0, rumpf: 14 + 6 * s, rumpfMax: 14 + 6 * s, crewMax: 1, kanonen: 0, bewegung: 5, enter: 0, drehbassen: false, navigator: false, arzt: 0, mut: 2, staerke: 1 + Math.floor(s / 2) }]
    case 'geist':
      return [{ id: 10, seite: 1, name: 'Geisterschiff', art: 'geist', klasse: 3, rumpf: 16 + 6 * s, rumpfMax: 16 + 6 * s, crewMax: 12, kanonen: 2 + s, bewegung: 4, enter: 0, drehbassen: false, navigator: false, arzt: 0, mut: 1, staerke: 0 }]
    case 'gross': {
      const k = Math.max(0, Math.min(6, eigeneKlasse)), rest = Math.max(1, grossRest), max = Math.max(rest, grossMax)
      const gestalt = g.gestalt ?? 'krake'
      const basis = { id: 10, seite: 1 as const, rumpf: rest, rumpfMax: max, enter: 0, drehbassen: false, navigator: false, arzt: 0, mut: 1, boss: true }
      if (gestalt === 'krake') return [{ ...basis, name: GESTALT_NAME.krake, art: 'krake', klasse: 0, crewMax: 1, kanonen: 0, bewegung: 3, staerke: 2 + k }]
      if (gestalt === 'schlange') return [{ ...basis, name: GESTALT_NAME.schlange, art: 'schlange', klasse: 0, crewMax: 1, kanonen: 0, bewegung: 5, staerke: 1 + k }]
      if (gestalt === 'geist') return [{ ...basis, name: 'Fliegender Holländer', art: 'geist', klasse: 4, crewMax: 30, kanonen: 3 + 2 * k, bewegung: 4, staerke: 0 }]
      return [
        { ...basis, name: 'Rotbarts „Königin der Meere“', art: 'segler', klasse: 4, crewMax: 30 + 8 * k, kanonen: 4 + 2 * k, bewegung: 4, staerke: 0 },
        { ...pirat(11, g.saat, Math.max(1, k), 60), name: 'Rotbarts Wachschiff' },
      ]
    }
    // eine Festung kämpft mit dem, was ihr Besitzer gebaut hat (kern/festung.ts: festungSchiffe)
    case 'festung': return []
  }
}
