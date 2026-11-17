// ── PC-Volldiagnose: Ablage je Gerät auf dem Netzlaufwerk ─────────────────────
// diagnose/voll/<HOST>/<JJJJ-MM-TT_HHMMSS>.json + _index.json (höchstens 20 Läufe je Gerät).
// Für „neu seit letzter Diagnose“ und die Nachvollziehbarkeit bei Servern.

import { api } from '../electronAPI'
import type { VdLauf } from './typen'

export const VD_ORDNER = 'diagnose/voll'
const MAX = 20
const hk = (h: string) => (h || '').trim().toUpperCase().replace(/[^A-Z0-9_.-]/g, '_')
const pad = (n: number) => String(n).padStart(2, '0')
const stempel = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`

export interface VdIndexEintrag {
  datei: string
  am: string
  von: string
  geraet: string
  kritisch: number
  warnung: number
  hinweis: number
  typen: string[]
  richtung?: string
}

export async function ladeIndex(host: string): Promise<VdIndexEintrag[]> {
  const d = await api().netReadJsonAsync<VdIndexEintrag[]>(`${VD_ORDNER}/${hk(host)}/_index.json`).catch(() => null)
  return Array.isArray(d) ? d : []
}

export async function ladeLauf(datei: string): Promise<VdLauf | null> {
  const d = await api().netReadJsonAsync<VdLauf>(datei).catch(() => null)
  return d && d.host ? d : null
}

/** Letzter abgeschlossener Lauf dieses Geräts (für den Vergleich). */
export async function letzterLauf(host: string, ohneDatei?: string): Promise<VdIndexEintrag | null> {
  return (await ladeIndex(host)).find(e => e.datei !== ohneDatei) || null
}

export async function speichereLauf(l: VdLauf, richtungText = ''): Promise<string | null> {
  const dir = `${VD_ORDNER}/${hk(l.host)}`
  const datei = l.datei || `${dir}/${stempel(new Date(l.start))}.json`
  const ok = await api().netWriteJsonAsync(datei, { ...l, datei, abbruch: undefined }).catch(() => false)
  if (!ok) return null
  const eintrag: VdIndexEintrag = {
    datei, am: new Date(l.start).toISOString(), von: l.von, geraet: l.ziel?.geraet || 'pc',
    kritisch: l.befunde.filter(b => b.schwere === 'kritisch').length, warnung: l.befunde.filter(b => b.schwere === 'warnung').length, hinweis: l.befunde.filter(b => b.schwere === 'hinweis').length,
    typen: [...new Set(l.befunde.map(b => b.typ))], richtung: richtungText || undefined,
  }
  const alt = await ladeIndex(l.host)
  const neu = [eintrag, ...alt.filter(e => e.datei !== datei)]
  for (const weg of neu.slice(MAX)) await api().netDeleteFileAsync(weg.datei).catch(() => false)
  await api().netWriteJsonAsync(`${dir}/_index.json`, neu.slice(0, MAX)).catch(() => false)
  return datei
}
