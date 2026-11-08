// ── PC-Überwachung: Ablage auf dem Netzlaufwerk ──────────────────────────────
//   pc-ueberwachung/auftraege/<id>.json  – vom Ersteller geschrieben (Auftrag)
//   pc-ueberwachung/zustand/<id>.json    – vom prüfenden Rechner geschrieben (Zustand)
//   pc-ueberwachung/pruefer.json         – Sperre: nur EIN Rechner prüft
// Getrennte Dateien → Ersteller und Prüfer überschreiben sich nie gegenseitig.
// Nur die neuen, asynchronen Netz-Aufrufe (blockieren den Hauptprozess nicht).

import { api } from '../electronAPI'
import { leererZustand, normalisiereZustand } from './auswertung'
import type { MonAuftrag, MonZustand } from './types'

export const ROOT = 'pc-ueberwachung'
const AUFTRAEGE = `${ROOT}/auftraege`
const ZUSTAND = `${ROOT}/zustand`
const SPERRE = `${ROOT}/pruefer.json`
export const SPERRE_MS = 4 * 60_000

const sicher = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '_')
export const neueId = () => `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

function gueltigerAuftrag(j: unknown): j is MonAuftrag {
  const a = j as MonAuftrag
  return !!a && typeof a === 'object' && typeof a.id === 'string' && typeof a.host === 'string' && typeof a.von === 'string' && typeof a.bis === 'string'
    && Array.isArray(a.kontrollen) && !!a.erstelltVon && typeof a.erstelltVon.username === 'string'
}

export async function ladeAuftraege(): Promise<MonAuftrag[]> {
  let dateien: string[] = []
  try { dateien = (await api().netListDirAsync(AUFTRAEGE)).filter(f => f.endsWith('.json')) } catch { return [] }
  const out: MonAuftrag[] = []
  // neueste zuerst (ID beginnt mit dem Zeitstempel), höchstens 300
  for (const f of dateien.sort().reverse().slice(0, 300)) {
    try { const j = await api().netReadJsonAsync<MonAuftrag>(`${AUFTRAEGE}/${f}`); if (gueltigerAuftrag(j)) out.push({ ...j, intervallMin: Math.min(60, Math.max(2, Number(j.intervallMin) || 5)) }) } catch { /* fremde/kaputte Datei überspringen */ }
  }
  return out
}

export async function ladeAuftrag(id: string): Promise<MonAuftrag | null> {
  try { const j = await api().netReadJsonAsync<MonAuftrag>(`${AUFTRAEGE}/${sicher(id)}.json`); return gueltigerAuftrag(j) ? j : null } catch { return null }
}

export async function speichereAuftrag(a: MonAuftrag): Promise<boolean> {
  try { return await api().netWriteJsonAsync(`${AUFTRAEGE}/${sicher(a.id)}.json`, { ...a, geaendertAm: new Date().toISOString() }) } catch { return false }
}

export async function ladeZustand(id: string): Promise<MonZustand> {
  try { return normalisiereZustand(id, await api().netReadJsonAsync(`${ZUSTAND}/${sicher(id)}.json`)) } catch { return leererZustand(id) }
}

export async function speichereZustand(z: MonZustand): Promise<boolean> {
  try { return await api().netWriteJsonAsync(`${ZUSTAND}/${sicher(z.id)}.json`, z) } catch { return false }
}

export async function loescheUeberwachung(id: string): Promise<void> {
  try { await api().netDeleteFileAsync(`${AUFTRAEGE}/${sicher(id)}.json`) } catch { /* egal */ }
  try { await api().netDeleteFileAsync(`${ZUSTAND}/${sicher(id)}.json`) } catch { /* egal */ }
}

// ── Sperre: nur ein Rechner prüft ────────────────────────────────────────────

export interface Sperre { von: string; rechner?: string; am: string; token: string }
let meinToken: string | null = null

export async function leseSperre(): Promise<Sperre | null> {
  try { return await api().netReadJsonAsync<Sperre>(SPERRE) } catch { return null }
}

/** Holt bzw. verlängert die Sperre. true = dieser Rechner prüft. */
export async function sichereSperre(ich: string, rechner: string): Promise<boolean> {
  const l = await leseSperre()
  const frisch = !!l?.am && Date.now() - Date.parse(l.am) < SPERRE_MS
  if (frisch && l!.token !== meinToken) { meinToken = null; return false }
  const token = (frisch && meinToken) ? meinToken : `${ich}_${Math.random().toString(36).slice(2, 10)}`
  const ok = await api().netWriteJsonAsync(SPERRE, { von: ich, rechner, am: new Date().toISOString(), token }).catch(() => false)
  if (!ok) return false
  if (token !== meinToken) {
    // Gleichzeitiger Zugriff? Kurz warten und prüfen, wer gewonnen hat.
    await new Promise(r => setTimeout(r, 2500))
    const nach = await leseSperre()
    if (nach?.token !== token) return false
    meinToken = token
  }
  return true
}

export async function gibSperreFrei(): Promise<void> {
  if (!meinToken) return
  const l = await leseSperre()
  if (l?.token === meinToken) { try { await api().netDeleteFileAsync(SPERRE) } catch { /* egal */ } }
  meinToken = null
}

export const haltSperre = () => meinToken !== null
