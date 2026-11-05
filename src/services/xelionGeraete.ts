// ── Zugewiesene Rechner je Person (für die Xelion-Lizenzen) ─────────────────────
// Frage dahinter: Wer hat eine Xelion-Lizenz, aber keinen PC oder nur einen Mini-
// Desktop (ohne Headset-Arbeitsplatz)? Quellen wie im Personen-„i": Endgeräte-Übersicht
// (Leasing, mit Modell) und Standort-Inventar (Kategorie „Computer"). Beide Dateien
// werden EINMAL gelesen, danach wird je Person im Speicher aufgelöst.

import { api } from '../electronAPI'
import { loadDevices, classifyModel, type EndpointDevice } from './endpointDevices'
import { samePerson } from './personMasterData'
import type { InventoryItem } from '../types/auth'

export interface ZugewiesenesGeraet {
  hostname: string
  model: string
  /** Modell-Typ aus der Endgeräte-Übersicht („Desktop Mini", „Laptop Standard" …). */
  typ: string
  serial?: string
}

/** Ausgemusterte/verlorene Geräte zählen nicht als „hat einen PC". */
const NICHT_MEHR_DA = /retired|disposed|ausgemustert|verschrott|stolen|gestohlen|lost|verloren/i

export const KEIN_PC = 'kein PC zugewiesen'
export const TYP_UNBEKANNT = 'Modell unbekannt'

/** Typ eines Geräts: Kategorie aus dem Modellnamen, sonst „anderes Modell" bzw. unbekannt. */
export function geraeteTyp(model: string): string {
  const m = (model || '').trim()
  if (!m) return TYP_UNBEKANNT
  return classifyModel(m) || `anderes Modell (${m})`
}

/**
 * Filterwert je Person: alle Typen sortiert und mit „+" verbunden. Ein einziger Wert je
 * Zeile, damit „nur Desktop Mini" exakt filterbar ist — eine Person mit Mini UND Laptop
 * steht unter „Desktop Mini + Laptop Standard", nicht unter „Desktop Mini".
 */
export function ausstattungsKlasse(geraete: ZugewiesenesGeraet[]): string {
  if (!geraete.length) return KEIN_PC
  return [...new Set(geraete.map(g => g.typ))].sort((a, b) => a.localeCompare(b, 'de')).join(' + ')
}

export function geraeteText(geraete: ZugewiesenesGeraet[] | null): string {
  if (geraete === null) return ''
  if (!geraete.length) return KEIN_PC
  return geraete.map(g => `${g.typ} · ${g.hostname}${g.model && !g.typ.includes(g.model) ? ` (${g.model})` : ''}`).join('; ')
}

export type GeraeteSuche = (name: string, sam?: string) => ZugewiesenesGeraet[]

export async function ladeGeraeteIndex(): Promise<GeraeteSuche> {
  let geraete: EndpointDevice[] = []
  let inventar: InventoryItem[] = []
  try { geraete = (await loadDevices()).filter(d => d.hostname && !NICHT_MEHR_DA.test(`${d.state} ${d.substate}`)) } catch { /* Quelle optional */ }
  try {
    const items = await api().netReadJson<InventoryItem[]>('inventory/inventory.json')
    if (Array.isArray(items)) inventar = items.filter(it => it.category === 'Computer' && it.name)
  } catch { /* Quelle optional */ }

  return (name: string, sam?: string) => {
    const samLc = (sam || '').trim().toLowerCase()
    const istEr = (zugewiesen: string, corpId?: string) =>
      (!!zugewiesen && samePerson(zugewiesen, name))
      || (!!samLc && (zugewiesen.trim().toLowerCase() === samLc || (corpId || '').trim().toLowerCase() === samLc))
    const nachHost = new Map<string, ZugewiesenesGeraet>()
    for (const d of geraete) {
      if (!istEr(d.assignedTo || '')) continue
      const h = d.hostname.trim().toUpperCase()
      nachHost.set(h, { hostname: h, model: d.model, typ: geraeteTyp(d.model), serial: d.serial || undefined })
    }
    // Inventar nur ergänzen — die Endgeräte-Übersicht kennt das Modell zuverlässiger
    for (const it of inventar) {
      if (!istEr(it.assignedTo || '', it.corpId)) continue
      const h = it.name.trim().toUpperCase()
      if (!nachHost.has(h)) nachHost.set(h, { hostname: h, model: it.model || '', typ: geraeteTyp(it.model || ''), serial: it.serial || undefined })
    }
    return [...nachHost.values()].sort((a, b) => a.hostname.localeCompare(b.hostname))
  }
}
