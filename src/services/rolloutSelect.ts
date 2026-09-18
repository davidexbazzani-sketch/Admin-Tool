// ── Rollout-Auswahl: Abteilung / Vorgesetzter → Benutzer → Rechner ───────────
// Effizient: Verzeichnis + Geräte werden EINMAL geladen, danach in-memory aufgelöst
// (kein Live-AD-Sturm pro Benutzer). Für die Einzel-Benutzer-Suche wird weiterhin
// userPcs.ts (sucheBenutzer/ladeBenutzerPCs) verwendet.

import { api } from '../electronAPI'
import { readCentralAdUsers } from './adUserDirectory'
import { loadDevices, type EndpointDevice } from './endpointDevices'
import { samePerson } from './personMasterData'
import type { AdUserListItem } from './adUsersList'
import type { InventoryItem } from '../types/auth'

export interface UserDevice { hostname: string; model?: string; serial?: string }

const PC_KAT = /pc|laptop|notebook|workstation|desktop|client|rechner/i

export async function loadDirectory(): Promise<AdUserListItem[]> {
  const dir = await readCentralAdUsers()
  return dir?.users ?? []
}

export function departmentsOf(users: AdUserListItem[]): string[] {
  const s = new Set<string>()
  for (const u of users) { const d = (u.department || '').trim(); if (d) s.add(d) }
  return [...s].sort((a, b) => a.localeCompare(b, 'de'))
}

export function usersInDepartment(users: AdUserListItem[], dept: string): AdUserListItem[] {
  const d = dept.trim().toLowerCase()
  return users.filter(u => (u.department || '').trim().toLowerCase() === d)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
}

/** managerSam(lower) → direkte Reports. */
export function buildReportsIndex(users: AdUserListItem[]): Map<string, AdUserListItem[]> {
  const m = new Map<string, AdUserListItem[]>()
  for (const u of users) {
    const mgr = (u.managerSam || '').trim().toLowerCase()
    if (!mgr) continue
    if (!m.has(mgr)) m.set(mgr, [])
    m.get(mgr)!.push(u)
  }
  return m
}

/** Alle rekursiv unter `rootSam` stehenden Benutzer (ohne den Vorgesetzten selbst, Zyklen-Schutz). */
export function collectReports(index: Map<string, AdUserListItem[]>, rootSam: string): AdUserListItem[] {
  const out: AdUserListItem[] = []
  const seen = new Set<string>()
  const queue = [(rootSam || '').trim().toLowerCase()]
  while (queue.length) {
    const cur = queue.shift()!
    for (const u of index.get(cur) || []) {
      const k = u.sam.toLowerCase()
      if (seen.has(k)) continue
      seen.add(k); out.push(u); queue.push(k)
    }
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
}

/** Geräte-Index EINMAL laden → Funktion (sam, displayName) → zugewiesene Rechner (PC-artig). */
export async function loadDeviceIndex(): Promise<(sam: string, displayName: string) => UserDevice[]> {
  let inv: InventoryItem[] = []
  let eps: EndpointDevice[] = []
  try { const r = await api().netReadJson<InventoryItem[]>('inventory/inventory.json'); if (Array.isArray(r)) inv = r } catch { /* leer */ }
  try { eps = await loadDevices() } catch { /* leer */ }
  return (sam: string, displayName: string): UserDevice[] => {
    const samLc = (sam || '').trim().toLowerCase()
    const map = new Map<string, UserDevice>()
    const add = (host: string, model?: string, serial?: string) => {
      const h = (host || '').trim(); if (!h) return
      const key = h.toUpperCase()
      if (!map.has(key)) map.set(key, { hostname: key, model: model || undefined, serial: serial || undefined })
    }
    for (const d of eps) {
      if ((d.assignedTo && samePerson(d.assignedTo, displayName)) || (samLc && d.assignedTo.trim().toLowerCase() === samLc)) add(d.hostname, d.model, d.serial)
    }
    for (const it of inv) {
      const match = (it.assignedTo && samePerson(it.assignedTo, displayName))
        || (samLc && ((it.corpId && it.corpId.trim().toLowerCase() === samLc) || (it.assignedTo && it.assignedTo.trim().toLowerCase() === samLc)))
      if (match && it.name && (PC_KAT.test(it.category || '') || /^de/i.test(it.name))) add(it.name, it.model, it.serial)
    }
    return [...map.values()].sort((a, b) => a.hostname.localeCompare(b.hostname))
  }
}
