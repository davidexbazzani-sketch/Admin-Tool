import { api } from '../electronAPI'
import type { FavoritesData, FavoriteDevice, FavoriteSkill } from '../types/favorites'

/** Per-user favorites file on network share */
function favPath(username: string): string {
  return `users/${username}/favorites.json`
}

export async function loadFavorites(username: string): Promise<FavoritesData> {
  const data = await api().netReadJson<FavoritesData>(favPath(username))
  return data ?? { devices: [], skills: [] }
}

export async function saveFavorites(username: string, data: FavoritesData): Promise<void> {
  await api().netWriteJson(favPath(username), data)
}

// ── Device helpers ─────────────────────────────────────────────────────────────

export function addDevice(data: FavoritesData, hostname: string, label?: string): FavoritesData {
  if (data.devices.some(d => d.hostname.toLowerCase() === hostname.toLowerCase())) return data
  const maxPos = data.devices.reduce((m, d) => Math.max(m, d.position), -1)
  const device: FavoriteDevice = {
    hostname,
    label: label || undefined,
    addedAt: new Date().toISOString(),
    position: maxPos + 1,
  }
  return { ...data, devices: [...data.devices, device] }
}

export function removeDevice(data: FavoritesData, hostname: string): FavoritesData {
  return { ...data, devices: data.devices.filter(d => d.hostname.toLowerCase() !== hostname.toLowerCase()) }
}

export function updateDeviceLabel(data: FavoritesData, hostname: string, label: string): FavoritesData {
  return {
    ...data,
    devices: data.devices.map(d =>
      d.hostname.toLowerCase() === hostname.toLowerCase()
        ? { ...d, label: label.trim() || undefined }
        : d
    ),
  }
}

export function moveDevice(data: FavoritesData, hostname: string, direction: 'up' | 'down'): FavoritesData {
  const sorted = [...data.devices].sort((a, b) => a.position - b.position)
  const idx = sorted.findIndex(d => d.hostname.toLowerCase() === hostname.toLowerCase())
  if (idx < 0) return data
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= sorted.length) return data
  const tmp = sorted[idx].position
  sorted[idx] = { ...sorted[idx], position: sorted[swapIdx].position }
  sorted[swapIdx] = { ...sorted[swapIdx], position: tmp }
  return { ...data, devices: sorted }
}

export function isDeviceFavorite(data: FavoritesData, hostname: string): boolean {
  return data.devices.some(d => d.hostname.toLowerCase() === hostname.toLowerCase())
}

// ── Skill helpers ──────────────────────────────────────────────────────────────

export function addSkill(data: FavoritesData, skill: Omit<FavoriteSkill, 'addedAt' | 'position'>): FavoritesData {
  if (data.skills.some(s => s.skillId === skill.skillId)) return data
  const maxPos = data.skills.reduce((m, s) => Math.max(m, s.position), -1)
  const newSkill: FavoriteSkill = {
    ...skill,
    addedAt: new Date().toISOString(),
    position: maxPos + 1,
  }
  return { ...data, skills: [...data.skills, newSkill] }
}

export function removeSkill(data: FavoritesData, skillId: string): FavoritesData {
  return { ...data, skills: data.skills.filter(s => s.skillId !== skillId) }
}

export function moveSkill(data: FavoritesData, skillId: string, direction: 'up' | 'down'): FavoritesData {
  const sorted = [...data.skills].sort((a, b) => a.position - b.position)
  const idx = sorted.findIndex(s => s.skillId === skillId)
  if (idx < 0) return data
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= sorted.length) return data
  const tmp = sorted[idx].position
  sorted[idx] = { ...sorted[idx], position: sorted[swapIdx].position }
  sorted[swapIdx] = { ...sorted[swapIdx], position: tmp }
  return { ...data, skills: sorted }
}

export function isSkillFavorite(data: FavoritesData, skillId: string): boolean {
  return data.skills.some(s => s.skillId === skillId)
}
