// ── Checklists Service ───────────────────────────────────────────────────────
// Stores device-handover checklists centrally on the network share. Every
// checklist has a unique id and can be re-opened + re-exported as PDF later.

import { api } from '../electronAPI'

export type DeviceType = 'new' | 'refresh'

export interface Checklist {
  id: string
  taskNumber: string         // e.g. TASK1087336
  name: string               // employee display name
  corpId: string             // e.g. OO6552
  technician: string         // tool user who created this
  deviceType: DeviceType
  newDeviceSerial: string    // serial number of the new device
  oldDeviceId?: string       // only set when deviceType === 'refresh' (SN or hostname)
  comment?: string
  signatureDataUrl?: string  // PNG data URL captured in the preview
  signatureDate?: string     // ISO timestamp when signed
  createdAt: string          // ISO
  createdBy: string          // tool user id / username
  updatedAt?: string         // ISO — touched on every save
  priority?: boolean         // "Hohe Priorität" — orange markiert in der Übersicht
  notiz?: string             // freie Notiz je Eintrag, direkt aus der Übersicht bearbeitbar
  manualSoftware?: string[]  // manuell in der Übersicht ergänzte Software (zusätzlich zur Auto-Erkennung)
  // ── Abschluss (Geraet uebergeben + Checkliste unterschrieben) ─────────────
  completed?: boolean        // true = in "Alle erledigten Checklisten" verschoben
  completedAt?: string       // ISO — wann die Uebergabe bestaetigt wurde
  completedBy?: string       // wer die Uebergabe bestaetigt hat
  // ── Hardware-Status (nur Bestandsmitarbeiter; neue laufen ueber die
  //    Mitarbeiterverwaltung). "ready" schaltet die Abhol-Mail frei. ────────────
  hardwareReady?: boolean
  hardwareType?: string      // laptop | zbook | tower | minipc | none | inprogress
  hardwareLocation?: string  // Abhol-Ort / Raum (kommt in die Abhol-Mail)
  hardwareBy?: string        // Bearbeiter
  hardwareAt?: string        // ISO
}

const STORE_FILE = 'checklists/checklists.json'

interface StoreFile {
  version: number
  checklists: Checklist[]
}

function newId(): string {
  return `cl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function makeEmptyStore(): StoreFile {
  return { version: 1, checklists: [] }
}

async function loadStore(): Promise<StoreFile> {
  try {
    const data = await api().netReadJson<StoreFile>(STORE_FILE)
    if (!data || !Array.isArray(data.checklists)) return makeEmptyStore()
    return { version: data.version ?? 1, checklists: data.checklists }
  } catch {
    return makeEmptyStore()
  }
}

async function saveStore(store: StoreFile): Promise<boolean> {
  try {
    return await api().netWriteJson(STORE_FILE, store)
  } catch {
    return false
  }
}

export async function listChecklists(): Promise<Checklist[]> {
  const store = await loadStore()
  // Newest first
  return [...store.checklists].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

export async function getChecklist(id: string): Promise<Checklist | null> {
  const store = await loadStore()
  return store.checklists.find(c => c.id === id) ?? null
}

export async function createChecklist(data: Omit<Checklist, 'id' | 'createdAt'>): Promise<{ ok: boolean; checklist?: Checklist; error?: string }> {
  const store = await loadStore()
  const item: Checklist = {
    ...data,
    id: newId(),
    createdAt: new Date().toISOString(),
  }
  store.checklists.push(item)
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
  return { ok: true, checklist: item }
}

export async function updateChecklist(id: string, patch: Partial<Checklist>): Promise<{ ok: boolean; checklist?: Checklist; error?: string }> {
  const store = await loadStore()
  const idx = store.checklists.findIndex(c => c.id === id)
  if (idx < 0) return { ok: false, error: 'Checkliste nicht gefunden' }
  const updated: Checklist = {
    ...store.checklists[idx],
    ...patch,
    id: store.checklists[idx].id,                   // keep stable
    createdAt: store.checklists[idx].createdAt,     // keep stable
    updatedAt: new Date().toISOString(),
  }
  store.checklists[idx] = updated
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
  return { ok: true, checklist: updated }
}

export async function deleteChecklist(id: string): Promise<{ ok: boolean; error?: string }> {
  const store = await loadStore()
  store.checklists = store.checklists.filter(c => c.id !== id)
  const ok = await saveStore(store)
  if (!ok) return { ok: false, error: 'Netzlaufwerk nicht erreichbar oder Schreibrechte fehlen.' }
  return { ok: true }
}
