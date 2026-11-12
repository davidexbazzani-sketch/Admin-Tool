// ── PC-Fehler: Warteliste für PCs, die beim Beheben nicht erreichbar waren ───
// Die Behebung wird nachgeholt, sobald der PC wieder online ist: Alle 2 Stunden prüft EIN
// Admin-Rechner (Sperre) die wartenden PCs und führt bei den erreichbaren den gemerkten
// Plan aus — dieselben unbemerkten Schritte, die der Admin beim Anlegen bestätigt hat.
// Nach 14 Tagen verfällt ein Eintrag (der Befund ist dann ohnehin neu zu beurteilen).
//   pc-fehler/warteliste.json            wartende Behebungen + die letzten Ergebnisse
//   pc-fehler/_warteliste_status.json    Lauf-Status + Sperre

import { api } from '../electronAPI'
import { fuehreFixAus, sindOnline, type FixPlan } from './beheben'
import { markiereBehoben } from './speicher'

const DATEI = 'pc-fehler/warteliste.json'
export const WARTELISTE_STATUS = 'pc-fehler/_warteliste_status.json'
/** So oft wird nach den wartenden PCs gesehen. */
export const WARTE_ABSTAND_MS = 2 * 60 * 60 * 1000
const VERFALL_MS = 14 * 24 * 60 * 60 * 1000

export interface WarteEintrag { id: string; plan: FixPlan; von: string; angelegtAm: string; versuche: number; letzterVersuch?: string }
export interface WarteErgebnis { host: string; titel: string; am: string; status: 'erledigt' | 'fehler' | 'verfallen'; text: string; von: string }
export interface Warteliste { v: 1; wartend: WarteEintrag[]; ergebnisse: WarteErgebnis[] }

export async function ladeWarteliste(): Promise<Warteliste | null> {
  try {
    const w = await api().netReadJsonAsync<Warteliste>(DATEI)
    if (w && Array.isArray(w.wartend)) return { v: 1, wartend: w.wartend, ergebnisse: Array.isArray(w.ergebnisse) ? w.ergebnisse : [] }
    return { v: 1, wartend: [], ergebnisse: [] }
  } catch { return null }
}

const kennung = (p: FixPlan) => `${p.host.toUpperCase()}|${p.befundKey}`

/** Frisch laden, ändern, schreiben — damit zwei Admins sich nichts überschreiben. */
async function aendere(fn: (w: Warteliste) => void): Promise<boolean> {
  const w = await ladeWarteliste()
  if (!w) return false
  fn(w)
  w.ergebnisse = w.ergebnisse.slice(-60)
  try { return await api().netWriteJsonAsync(DATEI, w) } catch { return false }
}

/** Behebung vormerken (derselbe Befund am selben PC nur einmal). */
export function merkeVor(plan: FixPlan, von: string): Promise<boolean> {
  return aendere(w => {
    const k = kennung(plan)
    w.wartend = w.wartend.filter(e => kennung(e.plan) !== k)
    w.wartend.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, plan, von, angelegtAm: new Date().toISOString(), versuche: 0 })
  })
}
export function streiche(id: string): Promise<boolean> { return aendere(w => { w.wartend = w.wartend.filter(e => e.id !== id) }) }

/** Ein Durchgang: verfallene streichen, erreichbare PCs beheben. Höchstens 3 PCs gleichzeitig. */
export async function laufWarteliste(onTick?: () => void): Promise<{ ok: boolean; summary: string }> {
  const w = await ladeWarteliste()
  if (!w) return { ok: false, summary: 'Netzlaufwerk nicht erreichbar.' }
  if (!w.wartend.length) return { ok: true, summary: 'Warteliste ist leer.' }
  const jetzt = Date.now()
  const verfallen = w.wartend.filter(e => jetzt - new Date(e.angelegtAm).getTime() > VERFALL_MS)
  const offen = w.wartend.filter(e => !verfallen.includes(e))
  const an = await sindOnline([...new Set(offen.map(e => e.plan.host))])
  const dran = offen.filter(e => an.has(e.plan.host.split('.')[0].toUpperCase()))
  const fertig: { id: string; erg: WarteErgebnis }[] = verfallen.map(e => ({ id: e.id, erg: { host: e.plan.host, titel: e.plan.befundTitel, am: new Date().toISOString(), status: 'verfallen' as const, text: 'PC war 14 Tage nicht erreichbar – Vormerkung verfallen.', von: e.von } }))
  const versucht = new Set<string>()
  let i = 0
  const arbeiter = async () => {
    while (i < dran.length) {
      const e = dran[i++]
      const r = await fuehreFixAus(e.plan, `${e.von} (Warteliste)`, true)
      versucht.add(e.id)
      if (r.status === 'erledigt') { await markiereBehoben(e.plan.host.split('.')[0].toUpperCase(), e.plan.befundKey) }
      // „offline" beim Verbinden (z. B. WinRM nicht erreichbar) → bleibt auf der Liste
      if (r.status !== 'offline') fertig.push({ id: e.id, erg: { host: e.plan.host, titel: e.plan.befundTitel, am: new Date().toISOString(), status: r.status, text: r.zeilen.slice(0, 4).join(' · ').slice(0, 400), von: e.von } })
      onTick?.()
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, dran.length) }, arbeiter))
  const weg = new Set(fertig.map(f => f.id))
  await aendere(x => {
    x.wartend = x.wartend.filter(e => !weg.has(e.id)).map(e => (versucht.has(e.id) || offen.some(o => o.id === e.id) ? { ...e, versuche: e.versuche + 1, letzterVersuch: new Date().toISOString() } : e))
    x.ergebnisse.push(...fertig.map(f => f.erg))
  })
  const erledigt = fertig.filter(f => f.erg.status === 'erledigt').length
  const fehler = fertig.filter(f => f.erg.status === 'fehler').length
  return { ok: true, summary: `Warteliste: ${offen.length} wartend · ${dran.length} erreichbar · ${erledigt} behoben${fehler ? ` · ${fehler} mit Fehler` : ''}${verfallen.length ? ` · ${verfallen.length} verfallen` : ''} · ${offen.length - dran.length} warten weiter` }
}
