// Terra Incognita — kurze Auskunft für die Kachel im Pausenraum. Bewusst winzig: Liest nur den lokalen Spielstand
// und zieht weder die Welt noch die Karte nach (eigenes Mini-Paket, das Spiel selbst wird hier nicht geladen).
import { KLASSEN, RAENGE, rangVon } from './kern/schiff'

export interface TerraKurz { kapitaen: string; schiff: string; rang: string; ruhm: number; funde: number; offen: number }

interface Ipc { terraLaden(benutzer: string): Promise<{ ok: boolean; daten: string | null }> }

export async function ladeTerraKurz(benutzer: string): Promise<TerraKurz | null> {
  const api = (window as unknown as { electronAPI?: Partial<Ipc> }).electronAPI
  if (!api || typeof api.terraLaden !== 'function' || !benutzer) return null
  try {
    const r = await api.terraLaden(benutzer.toLowerCase())
    if (!r.ok || !r.daten) return null
    const d = JSON.parse(r.daten) as { kapitaen?: unknown; klasse?: unknown; ruhm?: unknown; entdeckt?: unknown }
    if (typeof d.kapitaen !== 'string' || !d.kapitaen) return null
    const ruhm = typeof d.ruhm === 'number' ? d.ruhm : 0
    let funde = 0, offen = 0
    if (d.entdeckt && typeof d.entdeckt === 'object') for (const e of Object.values(d.entdeckt as Record<string, { anspruch?: number; gemeldet?: boolean }>)) { if (e?.anspruch === 3) continue; funde++; if (!e?.gemeldet) offen++ }
    return { kapitaen: d.kapitaen.slice(0, 28), schiff: KLASSEN[typeof d.klasse === 'number' ? Math.max(0, Math.min(KLASSEN.length - 1, d.klasse)) : 0].name, rang: RAENGE[rangVon(ruhm)].name, ruhm, funde, offen }
  } catch { return null }
}
