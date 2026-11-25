// Terra Incognita — Bündnisse: wer gehört wozu? (reine Rechnung über die öffentlichen Lage-Dateien)
//
// Ein Bündnis gibt es, wenn sein Gründer es in seiner Lage führt UND die Gründungsurkunde auf dem Netzlaufwerk ihm
// gehört (exklusiv angelegt — ein Name, ein Gründer). Mitglied ist nur, wer selbst „Mitglied“ sagt UND in der Liste des
// Gründers steht: So kann sich niemand selbst hineinschreiben, und niemand wird gegen seinen Willen aufgenommen.
// Austreten wirkt sofort (die eigene Lage sagt es); Entlassen ebenso (die Liste des Gründers sagt es).
import type { BundStand } from './stand'

export interface BundLage {
  /** Kennung des Bündnisses */
  k: string
  /** g = Gründer, m = Mitglied, a = Antrag */
  r: 'g' | 'm' | 'a'
  /** nur beim Gründer: Name, Flagge, Mitglieder, abgelehnte Anträge */
  n?: string
  fl?: [number, number, number, number]
  m?: string[]
  x?: string[]
}
export interface BundKapitaen { u: string; n: string; ruhm: number; b?: BundLage | null }
export interface Bund {
  key: string
  name: string
  fl: [number, number, number, number]
  gruender: string
  /** Mitglieder samt Gründer */
  mitglieder: string[]
  /** offene Anträge */
  antraege: string[]
  ruhm: number
}

export const BUND_MAX = 12
export const BUND_PREIS = 1000
/** ab diesem Rang (Matrose) darf man ein Bündnis gründen */
export const BUND_RANG = 2

/** Kennung aus dem Namen: klein, ohne Umlaute, nur Buchstaben, Ziffern und Bindestrich */
export function bundKey(name: string): string {
  return name.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

/** Lage-Teil aus dem eigenen Stand */
export function bundLageVon(b: BundStand | null): BundLage | undefined {
  if (!b) return undefined
  if (b.rolle === 'gruender') return { k: b.key, r: 'g', n: b.name, fl: b.fl, m: b.mitglieder.slice(0, BUND_MAX), x: b.nein.slice(-30) }
  return { k: b.key, r: b.rolle === 'mitglied' ? 'm' : 'a' }
}

/** Was in einer fremden Lage steht, in eine sichere Form bringen */
export function sauberesBund(roh: unknown): BundLage | null {
  if (!roh || typeof roh !== 'object') return null
  const d = roh as Record<string, unknown>
  if (typeof d.k !== 'string' || !/^[a-z0-9-]{1,40}$/.test(d.k) || (d.r !== 'g' && d.r !== 'm' && d.r !== 'a')) return null
  const aus: BundLage = { k: d.k, r: d.r }
  if (d.r === 'g') {
    const namen = (x: unknown): string[] => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string').map(v => v.slice(0, 60)).slice(0, 40) : [])
    const fl = Array.isArray(d.fl) ? d.fl : []
    aus.n = typeof d.n === 'string' ? d.n.slice(0, 28) : d.k
    aus.fl = [0, 1, 2, 3].map(i => (typeof fl[i] === 'number' && Number.isFinite(fl[i]) ? Math.max(0, Math.min(40, Math.floor(fl[i] as number))) : 0)) as [number, number, number, number]
    aus.m = namen(d.m).slice(0, BUND_MAX)
    aus.x = namen(d.x)
  }
  return aus
}

/** Alle Bündnisse aus den Lagen der Kapitäne. `urkundeOk(key, gruender)`: Gehört die Gründungsurkunde diesem Gründer? */
export function buendeAus(kapitaene: readonly BundKapitaen[], urkundeOk: (key: string, gruender: string) => boolean): Bund[] {
  const aus: Bund[] = []
  const nachKey = new Map<string, BundKapitaen[]>()
  for (const c of kapitaene) if (c.b) (nachKey.get(c.b.k) ?? nachKey.set(c.b.k, []).get(c.b.k) as BundKapitaen[]).push(c)
  for (const [key, leute] of nachKey) {
    const gruender = leute.filter(c => c.b?.r === 'g' && urkundeOk(key, c.u)).sort((a, b) => (a.u < b.u ? -1 : 1))[0]
    if (!gruender || !gruender.b) continue
    const liste = new Set(gruender.b.m ?? []), nein = new Set(gruender.b.x ?? [])
    const mitglieder = [gruender.u, ...leute.filter(c => c.u !== gruender.u && c.b?.r === 'm' && liste.has(c.u)).map(c => c.u)].slice(0, BUND_MAX)
    const antraege = leute.filter(c => c.b?.r === 'a' && !liste.has(c.u) && !nein.has(c.u)).map(c => c.u)
    let ruhm = 0
    for (const u of mitglieder) ruhm += kapitaene.find(c => c.u === u)?.ruhm ?? 0
    aus.push({ key, name: gruender.b.n ?? key, fl: gruender.b.fl ?? [0, 0, 1, 0], gruender: gruender.u, mitglieder, antraege, ruhm })
  }
  return aus.sort((a, b) => b.ruhm - a.ruhm || (a.key < b.key ? -1 : 1))
}

export type BundWandel = 'gleich' | 'aufgenommen' | 'abgelehnt' | 'entlassen' | 'aufgeloest'
/** Was hat sich für mich geändert? Nur wenn die Lage des Gründers gelesen ist (sonst „gleich“ — nichts überstürzen). */
export function bundWandel(ich: string, mein: BundStand | null, gruenderLage: BundLage | null | undefined, gruenderGelesen: boolean): BundWandel {
  if (!mein || mein.rolle === 'gruender' || !gruenderGelesen) return 'gleich'
  if (!gruenderLage || gruenderLage.r !== 'g' || gruenderLage.k !== mein.key) return mein.rolle === 'antrag' ? 'abgelehnt' : 'aufgeloest'
  const drin = (gruenderLage.m ?? []).includes(ich)
  if (mein.rolle === 'antrag') return drin ? 'aufgenommen' : (gruenderLage.x ?? []).includes(ich) ? 'abgelehnt' : 'gleich'
  return drin ? 'gleich' : 'entlassen'
}

/** Bonus gegen den großen Gegner: ein Zehntel je Bündnis-Kamerad, der diese Woche mitgekämpft hat (höchstens drei) */
export function bundBonus(ich: string, bund: Bund | null, mitgekaempft: ReadonlySet<string>): number {
  if (!bund || !bund.mitglieder.includes(ich)) return 0
  let n = 0
  for (const u of bund.mitglieder) if (u !== ich && mitgekaempft.has(u)) n++
  return 10 * Math.min(3, n)
}
