// Der Coach — Inhalte nachladen. Jede Datei unter inhalt/ ist ein eigenes Teilpaket; geholt wird erst, was gebraucht
// wird. Das Verzeichnis (_index.json) kommt mit dem Raum und reicht dem Planer.
import type { BereichTests, Einheit, Gemeinsam, Lage, Mission, Quelle, VorratsEintrag, WissensSeite, Figur, Lesetext } from './inhaltTypen'
import type { InhaltsIndex } from './index'
import { LEERER_INDEX } from './index'

const lader = import.meta.glob<{ default: unknown }>(['../inhalt/**/*.json', '!../inhalt/_index.json', '!../inhalt/_register.json'])
const pfad = (d: string): string => `../inhalt/${d}`
const speicher = new Map<string, unknown>()
const laufend = new Map<string, Promise<unknown>>()

let index: InhaltsIndex | null = null
let indexLaden: Promise<InhaltsIndex> | null = null
export function ladeIndex(): Promise<InhaltsIndex> {
  if (index) return Promise.resolve(index)
  indexLaden ??= import('../inhalt/_index.json').then(m => { index = (m.default ?? m) as unknown as InhaltsIndex; return index }).catch(() => { index = LEERER_INDEX; return index })
  return indexLaden
}
export const indexJetzt = (): InhaltsIndex => index ?? LEERER_INDEX

export function ladeDatei<T>(d: string): Promise<T | null> {
  if (speicher.has(d)) return Promise.resolve(speicher.get(d) as T)
  const schon = laufend.get(d)
  if (schon) return schon as Promise<T | null>
  const hole = lader[pfad(d)]
  const p = hole ? hole().then(m => { speicher.set(d, m.default); return m.default as T }).catch(() => null) : Promise.resolve(null)
  laufend.set(d, p)
  void p.finally(() => laufend.delete(d))
  return p
}
export const schonDa = <T>(d: string): T | null => (speicher.get(d) as T) ?? null

export async function ladeEinheit(id: string): Promise<Einheit | null> {
  const e = (await ladeIndex()).einheiten[id]
  if (!e) return null
  return (await ladeDatei<{ einheiten: Einheit[] }>(e.d))?.einheiten.find(x => x.id === id) ?? null
}
export async function ladeVorrat(id: string): Promise<VorratsEintrag | null> {
  const v = (await ladeIndex()).vorrat[id]
  if (!v) return null
  return (await ladeDatei<{ eintraege: VorratsEintrag[] }>(v.d))?.eintraege.find(x => x.kopf.id === id) ?? null
}
export async function ladeLage(id: string): Promise<Lage | null> {
  const l = (await ladeIndex()).lagen[id]
  if (!l) return null
  return (await ladeDatei<{ lagen: Lage[] }>(l.d))?.lagen.find(x => x.id === id) ?? null
}
export async function ladeMission(id: string): Promise<Mission | null> {
  const m = (await ladeIndex()).missionen[id]
  if (!m) return null
  return (await ladeDatei<{ missionen: Mission[] }>(m.d))?.missionen.find(x => x.id === id) ?? null
}
export async function ladeMissionen(bereich: string): Promise<Mission[]> {
  const i = await ladeIndex()
  const dateien = [...new Set(Object.values(i.missionen).filter(m => m.b === bereich).map(m => m.d))]
  const alle = await Promise.all(dateien.map(d => ladeDatei<{ missionen: Mission[] }>(d)))
  return alle.flatMap(x => x?.missionen ?? []).filter(m => m.bereich === bereich && !m.entfallen)
}
export async function ladeMerkkarte(id: string): Promise<{ frage: string; antwort: string; einheit: string } | null> {
  const k = (await ladeIndex()).merkkarten[id]
  if (!k) return null
  const e = (await ladeDatei<{ einheiten: Einheit[] }>(k.d))?.einheiten.find(x => x.id === k.e)
  const m = e?.merkkarten.find(x => x.id === id)
  return m && e ? { frage: m.frage, antwort: m.antwort, einheit: e.titel } : null
}
export async function ladeWissen(bereich: string): Promise<WissensSeite | null> {
  const d = (await ladeIndex()).wissen[bereich as keyof InhaltsIndex['wissen']]
  return d ? ladeDatei<WissensSeite>(d) : null
}
export async function ladeTests(kurs: string): Promise<BereichTests | null> {
  const d = (await ladeIndex()).tests[kurs]
  return d ? ladeDatei<BereichTests>(d) : null
}
export const ladeGemeinsam = (): Promise<Gemeinsam | null> => ladeDatei<Gemeinsam>('gemeinsam.json')
/** Quellen liegen in quellen.json (gemeinsam) und je Bereich in <bereich>/quellen.json */
const QUELL_DATEIEN = Object.keys(lader).map(k => k.slice('../inhalt/'.length)).filter(d => d === 'quellen.json' || /^[a-z]+\/quellen(-[nls])?\.json$/.test(d))
export async function ladeQuellen(): Promise<Map<string, Quelle>> {
  const alle = await Promise.all(QUELL_DATEIEN.map(d => ladeDatei<{ quellen: Quelle[] }>(d)))
  return new Map(alle.flatMap(q => q?.quellen ?? []).map(x => [x.id, x]))
}
export const ladeBesetzung = async (): Promise<Figur[]> => (await ladeDatei<{ figuren: Figur[] }>('besetzung.json'))?.figuren ?? []
export async function ladeLesetext(id: string): Promise<Lesetext | null> {
  return (await ladeGemeinsam())?.lesetexte.find(l => l.id === id) ?? null
}

/** alle Dateien, die ein Verweis braucht (e:… v:… l:… m:… a:…) — vor einem Training auf einmal holen */
export async function ladeFuer(refs: string[]): Promise<void> {
  const i = await ladeIndex()
  const dateien = new Set<string>(['gemeinsam.json', ...QUELL_DATEIEN])
  for (const r of refs) {
    const [art, id] = [r.slice(0, 1), r.slice(2)]
    if (art === 'e' && i.einheiten[id]) dateien.add(i.einheiten[id].d)
    if (art === 'v' && i.vorrat[id]) dateien.add(i.vorrat[id].d)
    if (art === 'l' && i.lagen[id]) dateien.add(i.lagen[id].d)
    if (art === 'm' && i.merkkarten[id]) dateien.add(i.merkkarten[id].d)
  }
  await Promise.all([...dateien].map(d => ladeDatei(d)))
}
