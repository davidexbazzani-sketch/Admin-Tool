// ── Standort → „Drucker Übersicht“: Drucker auf den Lageplänen verorten ──────
// Gleiches Prinzip wie OT-Geräte / Halle & Zoll / Verwaltungsgebäude (Position normiert
// 0..1 → zoomunabhängig), aber mit EIGENER Ablage und ZWEI Plänen als Grundlage:
// Halle & Zoll (Gesamtübersicht) und Verwaltungsgebäude (Grundriss) — ohne deren Geräte.
// Feld `hostname` = Druckername (Warteschlange, z. B. PMD634), `arbeitsplatz` = Raum/Standort.
// Nur asynchrone Netz-Aufrufe (blockieren den Hauptprozess nicht).

import { api } from '../electronAPI'
import type { OtDevice } from './otDevices'

export type DruckerPlanId = 'halle' | 'verwaltung'
export interface DruckerPlan { id: DruckerPlanId; titel: string; asset: string; raumLabel: string }

export const DRUCKER_PLAENE: DruckerPlan[] = [
  { id: 'halle', titel: 'Halle & Zoll', asset: 'pruffeld-zoll/gesamtuebersicht.pdf', raumLabel: 'Standort / Halle' },
  { id: 'verwaltung', titel: 'Verwaltungsgebäude', asset: 'verwaltungsgebaeude/grundriss.pdf', raumLabel: 'Raumnummer' },
]

export interface DruckerMarker extends OtDevice { plan: DruckerPlanId; ip?: string }

interface Store { version: number; drucker: DruckerMarker[]; updatedAt?: string }
const FILE = 'drucker-uebersicht/drucker.json'

const neueId = () => `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const clamp01 = (n: number): number => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0))

function normalisiere(raw: unknown): DruckerMarker | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<DruckerMarker>
  const jetzt = new Date().toISOString()
  return {
    id: typeof r.id === 'string' && r.id ? r.id : neueId(),
    plan: r.plan === 'verwaltung' ? 'verwaltung' : 'halle',
    page: Number.isFinite(Number(r.page)) ? Math.max(1, Math.round(Number(r.page))) : 1,
    x: clamp01(Number(r.x) || 0), y: clamp01(Number(r.y) || 0),
    hostname: typeof r.hostname === 'string' ? r.hostname : '',
    arbeitsplatz: typeof r.arbeitsplatz === 'string' ? r.arbeitsplatz : '',
    notes: typeof r.notes === 'string' ? r.notes : '',
    ip: typeof r.ip === 'string' && r.ip ? r.ip : undefined,
    createdBy: typeof r.createdBy === 'string' ? r.createdBy : '',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : jetzt,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : jetzt,
    placedBy: typeof r.placedBy === 'string' ? r.placedBy : undefined,
    placedAt: typeof r.placedAt === 'string' ? r.placedAt : undefined,
  }
}

let zuletztGesehen = 0   // Anzahl beim letzten erfolgreichen Lesen (Schutz vor Überschreiben bei Netzaussetzer)

export async function ladeDrucker(): Promise<DruckerMarker[]> {
  const s = await api().netReadJsonAsync<Store>(FILE)
  const l = s && Array.isArray(s.drucker) ? s.drucker.map(normalisiere).filter((d): d is DruckerMarker => d !== null) : []
  if (s) zuletztGesehen = l.length
  return l
}

async function speichere(f: (l: DruckerMarker[]) => DruckerMarker[]): Promise<boolean> {
  // frisch lesen → ändern → schreiben (mehrere Admins gleichzeitig)
  let s: Store | null = null
  try { s = await api().netReadJsonAsync<Store>(FILE) } catch { return false }
  if (!s && zuletztGesehen > 0) return false   // Datei war schon da, jetzt nicht lesbar → nicht leer überschreiben
  const aktuell = s && Array.isArray(s.drucker) ? s.drucker.map(normalisiere).filter((d): d is DruckerMarker => d !== null) : []
  const neu = f(aktuell)
  const ok = await api().netWriteJsonAsync(FILE, { version: 1, drucker: neu, updatedAt: new Date().toISOString() } satisfies Store).catch(() => false)
  if (ok) { zuletztGesehen = neu.length; standorteGeaendert(neu) }
  return ok
}

// ── Standorte für den Knopf hinter dem Drucker-„i“ (einmal laden, für alle Knöpfe) ──
let cache: { at: number; liste: DruckerMarker[] } | null = null
let laufend: Promise<DruckerMarker[]> | null = null
const hoerer = new Set<() => void>()

/** Alle eingezeichneten Drucker — höchstens alle `maxAlterMs` neu vom Netzlaufwerk. */
export function druckerStandorte(maxAlterMs = 60_000): Promise<DruckerMarker[]> {
  if (cache && Date.now() - cache.at < maxAlterMs) return Promise.resolve(cache.liste)
  if (!laufend) {
    laufend = ladeDrucker()
      .then(l => { cache = { at: Date.now(), liste: l }; return l })
      .catch(() => cache?.liste || [])
      .finally(() => { laufend = null })
  }
  return laufend
}
export const standortVon = (liste: DruckerMarker[], name: string): DruckerMarker | undefined => liste.find(m => gleicherDrucker(m.hostname, name))
/** Benachrichtigt, sobald sich die Standorte ändern (eingezeichnet, verschoben, entfernt). */
export function abonniereStandorte(f: () => void): () => void { hoerer.add(f); return () => { hoerer.delete(f) } }
function standorteGeaendert(liste: DruckerMarker[]) { cache = { at: Date.now(), liste }; for (const f of hoerer) { try { f() } catch { /* egal */ } } }

export async function legeDruckerAn(d: { plan: DruckerPlanId; page: number; x: number; y: number; name?: string; ip?: string; raum?: string; von: string }): Promise<DruckerMarker> {
  const jetzt = new Date().toISOString()
  const name = (d.name || '').trim()
  const m: DruckerMarker = {
    id: neueId(), plan: d.plan, page: Math.max(1, Math.round(d.page) || 1), x: clamp01(d.x), y: clamp01(d.y),
    hostname: name, arbeitsplatz: (d.raum || '').trim(), notes: '', ip: d.ip || undefined,
    createdBy: d.von, createdAt: jetzt, updatedAt: jetzt,
    ...(name ? { placedBy: d.von, placedAt: jetzt } : {}),
  }
  await speichere(l => [...l, m])
  return m
}

export async function aendereDrucker(id: string, patch: Partial<Pick<DruckerMarker, 'hostname' | 'arbeitsplatz' | 'notes' | 'ip' | 'x' | 'y'>>, von?: string): Promise<boolean> {
  const jetzt = new Date().toISOString()
  return speichere(l => l.map(d => {
    if (d.id !== id) return d
    const n = { ...d, ...patch, updatedAt: jetzt }
    if (patch.hostname !== undefined && patch.hostname.trim() && !d.placedAt) { n.placedBy = von || d.createdBy; n.placedAt = jetzt }
    return n
  }))
}

export async function loescheDrucker(id: string): Promise<boolean> { return speichere(l => l.filter(d => d.id !== id)) }

const kanon = (s: string) => (s || '').trim().toLowerCase().replace(/^\\\\[^\\]+\\/, '')
export const gleicherDrucker = (a: string, b: string) => !!kanon(a) && kanon(a) === kanon(b)

export function sucheDrucker(liste: DruckerMarker[], q: string): DruckerMarker[] {
  const t = q.trim().toLowerCase()
  const s = [...liste].sort((a, b) => (a.hostname || '~').localeCompare(b.hostname || '~', 'de', { numeric: true }))
  if (!t) return s
  return s.filter(d => [d.hostname, d.arbeitsplatz, d.ip || '', d.notes].some(x => x.toLowerCase().includes(t)))
}
