// ── Netzwerk-Diagnose: Persistenz der Läufe (Netzlaufwerk/userData) ──────────

import { api } from '../electronAPI'
import { analysiere } from './analyse'
import type { NetLauf } from './types'

const ROOT = 'netzwerk-diagnose'
const INDEX = `${ROOT}/index.json`
const KEEP_PER_PC = 10
const RECENT_KEY = 'netcheck.recentHosts'

export interface NetIndexEintrag {
  pc: string; ip?: string; rolle: string; ranAt: string; ranBy: string
  pfad: string; ok: boolean; fehler?: string; befunde: number; hoch: number; disconnects: number
}
interface IndexFile { version: number; laeufe: NetIndexEintrag[] }

function sani(s: string): string { return (s || '').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_') }
function laufPfad(l: NetLauf): string { return `${ROOT}/${sani(l.pc)}/${l.ranAt.slice(0, 16).replace(/[:T]/g, '-')}/lauf.json` }

export async function saveLauf(l: NetLauf): Promise<void> {
  const pfad = laufPfad(l)
  await api().netWriteJson(pfad, l)
  const bef = l.ok ? analysiere(l) : []
  const eintrag: NetIndexEintrag = {
    pc: l.pc, ip: l.ip, rolle: l.rolle, ranAt: l.ranAt, ranBy: l.ranBy, pfad, ok: l.ok, fehler: l.fehler,
    befunde: bef.length, hoch: bef.filter(b => b.gewicht === 'HOCH').length, disconnects: l.daten?.ereignisse?.disconnects ?? 0,
  }
  const idx = (await api().netReadJson<IndexFile>(INDEX)) ?? { version: 1, laeufe: [] }
  idx.laeufe = idx.laeufe.filter(e => e.pfad !== pfad)
  idx.laeufe.unshift(eintrag)
  // Pro PC nur die letzten KEEP_PER_PC behalten (alte Dateien löschen).
  const proPc = new Map<string, NetIndexEintrag[]>()
  for (const e of idx.laeufe) { const k = e.pc.toLowerCase(); if (!proPc.has(k)) proPc.set(k, []); proPc.get(k)!.push(e) }
  const behalten: NetIndexEintrag[] = []
  for (const arr of proPc.values()) {
    arr.sort((a, b) => b.ranAt.localeCompare(a.ranAt))
    behalten.push(...arr.slice(0, KEEP_PER_PC))
    for (const alt of arr.slice(KEEP_PER_PC)) { try { await api().netDeleteFile(alt.pfad) } catch { /* egal */ } }
  }
  idx.laeufe = behalten.sort((a, b) => b.ranAt.localeCompare(a.ranAt))
  await api().netWriteJson(INDEX, idx)
}

export async function listLaeufe(): Promise<NetIndexEintrag[]> {
  return (await api().netReadJson<IndexFile>(INDEX))?.laeufe ?? []
}
export async function loadLauf(pfad: string): Promise<NetLauf | null> {
  try { return await api().netReadJson<NetLauf>(pfad) } catch { return null }
}
export async function deleteLauf(pfad: string): Promise<void> {
  try { await api().netDeleteFile(pfad) } catch { /* egal */ }
  const idx = (await api().netReadJson<IndexFile>(INDEX)) ?? { version: 1, laeufe: [] }
  idx.laeufe = idx.laeufe.filter(e => e.pfad !== pfad)
  await api().netWriteJson(INDEX, idx)
}

// Zuletzt verwendete Hosts (lokal, für Schnellauswahl).
export function loadRecentHosts(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') as string[] } catch { return [] }
}
export function pushRecentHost(host: string): void {
  const h = (host || '').trim(); if (!h) return
  try {
    const cur = loadRecentHosts().filter(x => x.toLowerCase() !== h.toLowerCase())
    cur.unshift(h)
    localStorage.setItem(RECENT_KEY, JSON.stringify(cur.slice(0, 40)))
  } catch { /* egal */ }
}
