// ── Laden von Regelwerk / Abwesenheiten / Doku / Optionen + Engine-Erzeugung ──
// Vorrang Netzlaufwerk (zentrale, pflegbare Fassung) → sonst gebündelte Datei
// (public/zuweisung/…). Muster wie knowledgeSearchIpc ("net first, local fallback").
// Zusätzlich: Melder-Anzeigename → Abteilung aus der AD-Liste (readCentralAdUsers).

import { api } from '../../electronAPI'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from '../adUserDirectory'
import { createEngine, type Engine } from './engine'
import type { Regelwerk, Abwesenheiten } from './types'

const NET_DIR = 'zuweisung'                       // …\Tool IT\zuweisung\ (Netzlaufwerk)
const ASSET_DIR = 'zuweisung'                     // public/zuweisung/ (gebündelt)

export interface Optionen { queues: string[]; cis: string[]; subcats: string[] }
export interface ZuwBundle {
  engine: Engine
  regelwerk: Regelwerk
  abwesenheiten: Abwesenheiten | null
  markdown: string
  optionen: Optionen
  quelleRegeln: 'net' | 'bundle'
  quelleAbwesenheiten: 'net' | 'bundle' | 'keine'
  geladenAm: string
}

function b64ToUtf8(b64: string): string {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder('utf-8').decode(bytes)
}
async function readAssetText(rel: string): Promise<string> {
  const r = await api().readAsset(rel)
  if (!r.success || !r.data) throw new Error(r.error || `Asset nicht lesbar: ${rel}`)
  return b64ToUtf8(r.data)
}
async function readAssetJson<T>(rel: string): Promise<T> {
  return JSON.parse(await readAssetText(rel)) as T
}
/** Netzlaufwerk zuerst (falls vorhanden), sonst gebündelt. */
async function loadJsonNetFirst<T>(name: string): Promise<{ data: T; quelle: 'net' | 'bundle' }> {
  try {
    const net = await api().netReadJson<T>(`${NET_DIR}/${name}`)
    if (net && typeof net === 'object') return { data: net, quelle: 'net' }
  } catch { /* Netz nicht erreichbar → Bündel */ }
  return { data: await readAssetJson<T>(`${ASSET_DIR}/${name}`), quelle: 'bundle' }
}

export async function loadZuwBundle(): Promise<ZuwBundle> {
  const rw = await loadJsonNetFirst<Regelwerk>('ZUWEISUNG_Regeln.json')
  let abwesenheiten: Abwesenheiten | null = null
  let quelleAbwesenheiten: ZuwBundle['quelleAbwesenheiten'] = 'keine'
  try {
    const abw = await loadJsonNetFirst<Abwesenheiten>('ZUWEISUNG_Abwesenheiten.json')
    if (abw.data && abw.data.personen) { abwesenheiten = abw.data; quelleAbwesenheiten = abw.quelle }
  } catch { /* optional */ }
  let optionen: Optionen = { queues: [], cis: [], subcats: [] }
  try { optionen = await readAssetJson<Optionen>(`${ASSET_DIR}/optionen.json`) } catch { /* aus Regelwerk ableiten */ }
  if (!optionen.queues?.length) optionen.queues = Object.keys(rw.data.gruppen || {})
  let markdown = ''
  try { markdown = await readAssetText(`${ASSET_DIR}/SKF_Marine_TICKET_ZUWEISUNG.md`) } catch { markdown = '# Doku nicht gefunden' }

  return {
    engine: createEngine(rw.data),
    regelwerk: rw.data,
    abwesenheiten,
    markdown,
    optionen,
    quelleRegeln: rw.quelle,
    quelleAbwesenheiten,
    geladenAm: new Date().toISOString(),
  }
}

// ── Melder (Anzeigename) → Abteilung („CODE Rest", z. B. „S212 Design Sealings") ─
let _adIndex: ReturnType<typeof buildNameIndex> | null = null
let _adNames: string[] | null = null
async function ensureAd(): Promise<void> {
  if (_adIndex && _adNames) return
  const dir = await readCentralAdUsers()
  const users = dir?.users ?? []
  _adIndex = buildNameIndex(users)
  _adNames = users.map(u => u.displayName).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'))
}
/** Abteilung des Melders aus dem AD-Cache (leer, wenn unbekannt). */
export async function resolveDept(caller: string): Promise<string> {
  if (!caller?.trim()) return ''
  await ensureAd()
  const hit = _adIndex ? lookupUserByName(_adIndex, caller.trim()) : null
  return hit?.department || ''
}
/** Alle AD-Anzeigenamen (für die Caller-Autocomplete). */
export async function loadCallerNames(): Promise<string[]> {
  await ensureAd()
  return _adNames ?? []
}
