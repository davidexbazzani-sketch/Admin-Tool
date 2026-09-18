// ── Per-Benutzer-Menü-Reihenfolge (Drag & Drop) ─────────────────────────────
// Jeder Nutzer kann die Sidebar-Menüpunkte selbst anordnen (verschieben). Die
// Reihenfolge wird pro Nutzer zentral auf dem Netzlaufwerk gespeichert; jeder
// Eintrag trägt seine (evtl. verschobene) Kategorie, damit die Sidebar-Gruppierung
// stimmt. Nicht enthalten sind Startbildschirm/Ergebnisse/Einstellungen (fix).

import { api } from '../electronAPI'

export interface MenuOrderEntry { id: string; category: string }
export interface UserMenuOrders { users: Record<string, MenuOrderEntry[]> }

const PATH = 'settings/user_menu_order.json'

export async function loadUserMenuOrders(): Promise<UserMenuOrders> {
  try {
    const d = await api().netReadJson<UserMenuOrders>(PATH)
    if (d && d.users && typeof d.users === 'object') return d
  } catch { /* noch keiner */ }
  return { users: {} }
}

export function getOrderForUser(orders: UserMenuOrders, userId: string): MenuOrderEntry[] | null {
  const e = orders.users?.[userId]
  if (!Array.isArray(e) || e.length === 0) return null
  return e.filter(x => x && typeof x.id === 'string' && typeof x.category === 'string')
}

export async function saveUserMenuOrder(userId: string, entries: MenuOrderEntry[]): Promise<boolean> {
  const orders = await loadUserMenuOrders()
  orders.users = orders.users || {}
  orders.users[userId] = entries.map(e => ({ id: e.id, category: e.category }))
  try { return await api().netWriteJson(PATH, orders) } catch { return false }
}

export async function clearUserMenuOrder(userId: string): Promise<boolean> {
  const orders = await loadUserMenuOrders()
  if (orders.users) delete orders.users[userId]
  try { return await api().netWriteJson(PATH, orders) } catch { return false }
}
