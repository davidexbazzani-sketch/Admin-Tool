// ── SolidWorks-Diagnose: Ablage der Läufe + Verlauf + Referenz ────────────────
// Speicherort über die vorhandene Pfadauflösung (Netzlaufwerk zuerst, dann userData):
//   solidworks-diagnose/<PCNAME>/<yyyy-MM-dd_HHmm>/lauf.json (+ .txt/.json je Skript)
//   solidworks-diagnose/index.json  (Metadaten aller Läufe)
// Aufräumen: pro PC die letzten N Läufe behalten (Standard 10); Referenz-Läufe nie.

import { api } from '../electronAPI'
import type { SwLauf, SwLaufIndexItem } from './swCheck.types'

const ROOT = 'solidworks-diagnose'
const INDEX = `${ROOT}/index.json`
const RECENT_KEY = 'swdiag.recentHosts'
const KEEP_PER_PC = 10

function pcKey(pc: string): string { return pc.trim().replace(/[^A-Za-z0-9]/g, '_') }
function tsFolder(iso: string): string { return iso.replace(/[:T]/g, '-').slice(0, 16).replace(/-(\d\d)-(\d\d)$/, '_$1$2') }
function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}
async function writeText(path: string, text: string): Promise<void> {
  try { await api().netWriteRawFile(path, utf8ToBase64(text)) } catch { /* offline */ }
}

export async function saveLauf(lauf: SwLauf): Promise<{ ok: boolean; id: string }> {
  const dir = `${ROOT}/${pcKey(lauf.pc)}/${tsFolder(lauf.ranAt)}`
  try { await api().netWriteJson(`${dir}/lauf.json`, lauf) } catch { return { ok: false, id: lauf.id } }
  // Einzeldateien je Skript für die Handnutzung (best effort).
  for (const s of lauf.skripte) {
    if (!s.ok) continue
    const stem = s.id === 'bestandsaufnahme' ? 'bestandsaufnahme' : s.id === 'server' ? 'server' : s.id
    if (s.textBericht) await writeText(`${dir}/${stem}.txt`, s.textBericht)
    if (s.daten && s.ziel === 'client') await writeText(`${dir}/${stem}.json`, JSON.stringify(s.daten, null, 2))
  }
  // Index aktualisieren.
  try {
    const idx = (await api().netReadJson<{ items: SwLaufIndexItem[] }>(INDEX)) ?? { items: [] }
    const items = Array.isArray(idx.items) ? idx.items : []
    const prevRef = items.find(i => i.id === lauf.id)?.isReferenz
    const item: SwLaufIndexItem = {
      id: lauf.id, pc: lauf.pc, dir, ranAt: lauf.ranAt, ranBy: lauf.ranBy,
      auffaelligkeiten: lauf.auffaelligkeiten.length,
      swVersion: lauf.kennwerte?.swVersion, benutzer: lauf.kennwerte?.benutzer,
      skripte: lauf.skripte.map(s => s.id), isReferenz: prevRef,
    }
    const next = [item, ...items.filter(i => i.id !== lauf.id)]
    // Aufräumen: pro PC die letzten N (Referenzen nie).
    const perPc = new Map<string, number>()
    const keep: SwLaufIndexItem[] = []
    const drop: SwLaufIndexItem[] = []
    for (const it of next.sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1))) {
      if (it.isReferenz) { keep.push(it); continue }
      const key = pcKey(it.pc)
      const c = (perPc.get(key) ?? 0) + 1; perPc.set(key, c)
      if (c <= KEEP_PER_PC) keep.push(it); else drop.push(it)
    }
    await api().netWriteJson(INDEX, { items: keep })
    for (const d of drop) { for (const f of ['lauf.json', 'bestandsaufnahme.txt', 'bestandsaufnahme.json', 'server.txt']) { try { await api().netDeleteFile(`${d.dir}/${f}`) } catch { /* egal */ } } }
  } catch { /* Index-Fehler ignorieren, Lauf ist gespeichert */ }
  return { ok: true, id: lauf.id }
}

export async function listLaeufe(pc?: string): Promise<SwLaufIndexItem[]> {
  try {
    const idx = (await api().netReadJson<{ items: SwLaufIndexItem[] }>(INDEX)) ?? { items: [] }
    const items = Array.isArray(idx.items) ? idx.items : []
    const filtered = pc ? items.filter(i => i.pc.toLowerCase() === pc.trim().toLowerCase()) : items
    return filtered.sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1))
  } catch { return [] }
}

export async function loadLauf(idOrItem: string | SwLaufIndexItem): Promise<SwLauf | null> {
  try {
    let dir: string | undefined
    if (typeof idOrItem === 'string') {
      const items = await listLaeufe()
      dir = items.find(i => i.id === idOrItem)?.dir
    } else dir = idOrItem.dir
    if (!dir) return null
    return await api().netReadJson<SwLauf>(`${dir}/lauf.json`)
  } catch { return null }
}

/** Einen Lauf löschen (Index-Eintrag + Dateien). */
export async function deleteLauf(idOrItem: string | SwLaufIndexItem): Promise<void> {
  try {
    const idx = (await api().netReadJson<{ items: SwLaufIndexItem[] }>(INDEX)) ?? { items: [] }
    const items = Array.isArray(idx.items) ? idx.items : []
    const item = typeof idOrItem === 'string' ? items.find(i => i.id === idOrItem) : idOrItem
    if (item) {
      for (const f of ['lauf.json', 'bestandsaufnahme.txt', 'bestandsaufnahme.json', 'tiefenanalyse.txt', 'tiefenanalyse.json', 'server.txt']) {
        try { await api().netDeleteFile(`${item.dir}/${f}`) } catch { /* egal */ }
      }
    }
    const rmId = item?.id ?? (typeof idOrItem === 'string' ? idOrItem : idOrItem.id)
    await api().netWriteJson(INDEX, { items: items.filter(i => i.id !== rmId) })
  } catch { /* egal */ }
}

export async function setReferenz(id: string, isReferenz: boolean): Promise<void> {
  try {
    const idx = (await api().netReadJson<{ items: SwLaufIndexItem[] }>(INDEX)) ?? { items: [] }
    const items = (Array.isArray(idx.items) ? idx.items : []).map(i => i.id === id ? { ...i, isReferenz } : i)
    await api().netWriteJson(INDEX, { items })
  } catch { /* egal */ }
}

/** Läufe für den Export laden: neueste je PC (Standard) oder alle. */
export async function loadForExport(opts: { pcs?: string[]; nurLetzter?: boolean }): Promise<SwLauf[]> {
  const all = await listLaeufe()
  let items = all
  if (opts.pcs && opts.pcs.length) { const set = new Set(opts.pcs.map(p => p.toLowerCase())); items = items.filter(i => set.has(i.pc.toLowerCase())) }
  if (opts.nurLetzter !== false) {
    const seen = new Set<string>()
    items = items.filter(i => { const k = i.pc.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
  }
  const laeufe: SwLauf[] = []
  for (const it of items) { const l = await loadLauf(it); if (l) laeufe.push(l) }
  return laeufe
}

export function loadRecentHosts(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function pushRecentHost(host: string): void {
  const h = host.trim(); if (!h) return
  try {
    const cur = loadRecentHosts().filter(x => x.toLowerCase() !== h.toLowerCase())
    localStorage.setItem(RECENT_KEY, JSON.stringify([h, ...cur].slice(0, 15)))
  } catch { /* egal */ }
}
