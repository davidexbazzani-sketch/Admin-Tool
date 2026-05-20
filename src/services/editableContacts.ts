// ── Editable Contacts Service ─────────────────────────────────────────────────
// Manages Incident Response contact data as editable JSON on network share.
// Falls back to hardcoded defaults if JSON not available.

import { api } from '../electronAPI'
import {
  CONTACTS_IT_EMERGENCY, CONTACTS_NIS2_DE, CONTACTS_EXTERNAL,
  CONTACTS_SERVER, CONTACTS_NETWORK, CONTACTS_CLIENT, CONTACTS_POWER,
  CONTACTS_MANAGEMENT, CONTACTS_MANAGERS,
  type ContactEntry,
} from '../data/incidentResponseData'

const CONTACTS_PATH = 'config/incident_response/contacts.json'
const HISTORY_PATH = 'config/incident_response/contacts_history.json'

export interface ContactCategory {
  id: string
  title: string
  description?: string
  icon?: string
  order: number
  columns: string[]
  infoText?: string
  contacts: EditableContact[]
}

export interface EditableContact {
  id: string
  name: string
  function?: string
  email: string | null
  phone: string | null
  role?: string
  note?: string
  active: boolean
}

export interface ContactsConfig {
  version: number
  lastModified: string
  modifiedBy: string
  comment: string
  categories: ContactCategory[]
}

export interface HistoryEntry {
  timestamp: string
  user: string
  action: string
  detail: string
}

// Convert existing hardcoded contacts to editable format
function contactToEditable(c: ContactEntry, idx: number): EditableContact {
  return {
    id: `${c.name.replace(/\s+/g, '_').toLowerCase()}_${idx}`,
    name: c.name,
    function: c.function,
    email: c.email,
    phone: c.phone,
    active: true,
  }
}

export function buildDefaultContacts(): ContactsConfig {
  return {
    version: 1,
    lastModified: new Date().toISOString(),
    modifiedBy: 'system',
    comment: 'Initial migration from hardcoded data',
    categories: [
      { id: 'it-emergency', title: 'Interne IT-Notfallkontakte (SKF Marine)', description: 'Direkte Erreichbarkeit des IT-/OT-Teams im Notfall', icon: 'Phone', order: 1, columns: ['name', 'email', 'phone'], contacts: CONTACTS_IT_EMERGENCY.map(contactToEditable) },
      { id: 'nis2-de', title: 'NIS2 OT-Security-Ansprechpartner Deutschland', description: 'Diese Personen muessen vor einer BSI-Erstmeldung kontaktiert werden', icon: 'Shield', order: 2, columns: ['name', 'email', 'phone'], infoText: 'Diese Personen muessen vor einer BSI-Erstmeldung kontaktiert und in die Bewertung einbezogen werden (siehe Eskalationsweg, Stufe 5).', contacts: CONTACTS_NIS2_DE.map(contactToEditable) },
      { id: 'bsi-external', title: 'BSI und externe Dienstleister', icon: 'Building2', order: 3, columns: ['name', 'email', 'phone'], contacts: CONTACTS_EXTERNAL.map(contactToEditable) },
      { id: 'server', title: 'Serverprobleme', icon: 'Server', order: 4, columns: ['name', 'email', 'phone'], contacts: CONTACTS_SERVER.map(contactToEditable) },
      { id: 'network', title: 'Netzwerkprobleme', icon: 'Wifi', order: 5, columns: ['name', 'email', 'phone'], contacts: CONTACTS_NETWORK.map(contactToEditable) },
      { id: 'client', title: 'Computer-/Userprobleme', icon: 'Monitor', order: 6, columns: ['name', 'email', 'phone'], contacts: CONTACTS_CLIENT.map(contactToEditable) },
      { id: 'power', title: 'Stromausfall', icon: 'Zap', order: 7, columns: ['name', 'email', 'phone'], contacts: CONTACTS_POWER.map(contactToEditable) },
      { id: 'management', title: 'Geschaeftsleitung und Prokuristen (SKF Marine)', icon: 'Crown', order: 8, columns: ['name', 'function', 'email', 'phone'], contacts: CONTACTS_MANAGEMENT.map(contactToEditable) },
      { id: 'managers', title: 'Manager SKF Marine - Fachbereiche', icon: 'Users', order: 9, columns: ['name', 'function', 'email', 'phone'], infoText: 'Bei Vorfaellen mit Auswirkung auf die jeweiligen Fachbereiche: die zustaendigen Manager ueber die geschaetzte Ausfallzeit informieren.', contacts: CONTACTS_MANAGERS.map(contactToEditable) },
    ],
  }
}

export async function loadContacts(): Promise<ContactsConfig> {
  try {
    const data = await api().netReadJson<ContactsConfig>(CONTACTS_PATH)
    if (data && Array.isArray(data.categories)) return data
  } catch { /* fallback */ }
  // First run: create from defaults
  const defaults = buildDefaultContacts()
  try { await api().netWriteJson(CONTACTS_PATH, defaults) } catch { /* ok */ }
  return defaults
}

export async function saveContacts(config: ContactsConfig, user: string): Promise<{ success: boolean; error?: string }> {
  config.lastModified = new Date().toISOString()
  config.modifiedBy = user
  try {
    await api().netWriteJson(CONTACTS_PATH, config)
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function addHistoryEntry(entry: HistoryEntry): Promise<void> {
  try {
    const existing = await api().netReadJson<HistoryEntry[]>(HISTORY_PATH) || []
    existing.unshift(entry)
    await api().netWriteJson(HISTORY_PATH, existing.slice(0, 200))
  } catch { /* ok */ }
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    return await api().netReadJson<HistoryEntry[]>(HISTORY_PATH) || []
  } catch { return [] }
}
