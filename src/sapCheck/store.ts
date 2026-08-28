// ── SAP-Fehlersuche: Verlauf & Baseline ──────────────────────────────────────
// Speichert Scans zentral (Netzlaufwerk) unter config/sap-scan/. Aus Datenschutz-
// gründen werden bei den Kategorien Ereignisse/Traces beim Speichern die Rohdaten
// entfernt (nur Metadaten bleiben im Befund selbst). Muster: userPresenceScan.

import { api } from '../electronAPI'
import type { SapScan, SapScanIndexItem } from './sapCheck.types'
import { ampelOf } from './sapCheck.types'

const DIR = 'config/sap-scan/scans'
const INDEX = 'config/sap-scan/index.json'
const RECENT_KEY = 'sapcheck.recentHosts'
const KEEP_PER_PC = 10

function scanId(pc: string, iso: string): string {
  const ts = iso.replace(/[:T]/g, '-').slice(0, 16)
  return `sapscan_${pc.replace(/[^A-Za-z0-9]/g, '_')}_${ts}`
}

// Rohdaten personenbezogener Kategorien vor dem Speichern entfernen.
function sanitize(scan: SapScan): SapScan {
  return {
    ...scan,
    befunde: scan.befunde.map(b => (b.kategorie === 'Ereignisse' || b.kategorie === 'Traces' || b.id === 'anmeldung.ticket') ? { ...b, rawData: undefined } : b),
  }
}

export async function saveScan(scan: SapScan): Promise<{ ok: boolean; id: string }> {
  const id = scanId(scan.pc, scan.ranAt)
  const clean = sanitize(scan)
  try { await api().netWriteJson(`${DIR}/${id}.json`, clean) } catch { return { ok: false, id } }
  // Index aktualisieren (Metadaten)
  try {
    const idx = (await api().netReadJson<{ items: SapScanIndexItem[] }>(INDEX)) ?? { items: [] }
    const items = Array.isArray(idx.items) ? idx.items : []
    const item: SapScanIndexItem = { id, pc: scan.pc, ranAt: scan.ranAt, ranBy: scan.ranBy, ampel: ampelOf(scan.befunde) }
    const next = [item, ...items.filter(i => i.id !== id)]
    // Aufräumen: pro PC nur die letzten N (Baselines nie löschen)
    const perPc = new Map<string, number>()
    const keep: SapScanIndexItem[] = []
    const drop: string[] = []
    for (const it of next) {
      if (it.isBaseline) { keep.push(it); continue }
      const c = (perPc.get(it.pc) ?? 0) + 1; perPc.set(it.pc, c)
      if (c <= KEEP_PER_PC) keep.push(it); else drop.push(it.id)
    }
    await api().netWriteJson(INDEX, { items: keep })
    for (const d of drop) { try { await api().netDeleteFile(`${DIR}/${d}.json`) } catch { /* egal */ } }
  } catch { /* Index-Fehler ignorieren, Scan ist gespeichert */ }
  return { ok: true, id }
}

export async function listScans(pc?: string): Promise<SapScanIndexItem[]> {
  try {
    const idx = (await api().netReadJson<{ items: SapScanIndexItem[] }>(INDEX)) ?? { items: [] }
    const items = Array.isArray(idx.items) ? idx.items : []
    const filtered = pc ? items.filter(i => i.pc.toLowerCase() === pc.toLowerCase()) : items
    return filtered.sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1))
  } catch { return [] }
}

export async function loadScan(id: string): Promise<SapScan | null> {
  try { return await api().netReadJson<SapScan>(`${DIR}/${id}.json`) } catch { return null }
}

export async function setBaseline(id: string, isBaseline: boolean): Promise<void> {
  try {
    const idx = (await api().netReadJson<{ items: SapScanIndexItem[] }>(INDEX)) ?? { items: [] }
    const items = (Array.isArray(idx.items) ? idx.items : []).map(i => i.id === id ? { ...i, isBaseline } : i)
    await api().netWriteJson(INDEX, { items })
  } catch { /* egal */ }
}

export async function loadBaseline(pc: string): Promise<SapScan | null> {
  const items = await listScans(pc)
  const base = items.find(i => i.isBaseline)
  return base ? loadScan(base.id) : null
}

// „Zuletzt gescannte PCs" (pro Gerät, localStorage).
export function loadRecentHosts(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function pushRecentHost(host: string): void {
  const h = host.trim(); if (!h) return
  try {
    const cur = loadRecentHosts().filter(x => x.toLowerCase() !== h.toLowerCase())
    localStorage.setItem(RECENT_KEY, JSON.stringify([h, ...cur].slice(0, 10)))
  } catch { /* egal */ }
}
