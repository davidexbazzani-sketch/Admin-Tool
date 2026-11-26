// „Lager einsehen“ — EINZIGE Stelle, die Daten liest. Nur asynchron (blockiert nichts) und nur lesend.
// Stufe 1 (sofort für den Raum): Endgeräte-Übersicht, Lagerliste, Pick-Ups.
// Stufe 2 (danach): letzte Inventur, Checklisten, neue Mitarbeiter.

import { api } from '../electronAPI'
import { fachText } from '../services/inventurEigentum'
import type { ChecklisteRoh, MitarbeiterRoh } from './reservierung'
import type { RohGeraet } from './typen'

export const LAGERLISTE_DATEI = 'hardware-inventory/lager.json'

export interface Lagerliste {
  version: 1
  stand: string          // ISO — wann importiert
  von: string
  datei: string          // Dateiname bzw. „ServiceNow (live)“
  zeilen: RohGeraet[]
}

export interface Stufe1 {
  endgeraete: RohGeraet[] | null
  endgeraeteStand?: string
  endgeraeteFehler?: string
  lagerliste: Lagerliste | null
  abholungen: { serial: string; datum: string; lieferant?: string }[]
}

export interface Stufe2 {
  inventur: { titel: string; am: string; geraete: RohGeraet[] } | null
  checklisten: ChecklisteRoh[]
  mitarbeiter: MitarbeiterRoh[]
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v))

async function lies<T>(pfad: string): Promise<T | null> {
  try { return (await api().netReadJsonAsync<T>(pfad)) ?? null } catch { return null }
}

export async function ladeStufe1(): Promise<Stufe1> {
  const [ep, liste, pu] = await Promise.all([
    lies<{ devices?: Record<string, unknown>[]; importedAt?: string }>('endpoint-devices/devices.json'),
    lies<Lagerliste>(LAGERLISTE_DATEI),
    lies<{ pickups?: { datum?: string; lieferant?: string; geraete?: { serial?: string }[] }[] }>('hardware-inventory/pickups.json'),
  ])
  const endgeraete = Array.isArray(ep?.devices)
    ? ep!.devices.map(d => ({
      serial: s(d.serial), hostname: s(d.hostname), modell: s(d.model), kommentar: s(d.comments),
      state: s(d.state), substate: s(d.substate), assignedTo: s(d.assignedTo),
    }))
    : null
  const abholungen: Stufe1['abholungen'] = []
  for (const p of pu?.pickups || []) for (const g of p.geraete || []) if (g.serial) abholungen.push({ serial: g.serial, datum: s(p.datum), lieferant: s(p.lieferant) })
  return {
    endgeraete,
    endgeraeteStand: ep?.importedAt,
    endgeraeteFehler: endgeraete ? undefined : 'Endgeräte-Übersicht nicht lesbar (Netzlaufwerk?)',
    lagerliste: liste && Array.isArray(liste.zeilen) ? liste : null,
    abholungen,
  }
}

interface RunKurz { id: string; importedAt?: string; title?: string; status?: string }
interface RunVoll {
  title?: string; importedAt?: string; completedAt?: string
  devices?: { serial: string; deviceType?: string; comment?: string; epComment?: string; fachNachgetragen?: string; status?: string; substate?: string; scanned?: boolean }[]
  extras?: { serial: string; epComment?: string; fachNachgetragen?: string }[]
}

export async function ladeStufe2(): Promise<Stufe2> {
  const [idx, cl, emp] = await Promise.all([
    lies<{ runs?: RunKurz[] }>('hardware-inventory/runs.json'),
    lies<{ checklists?: ChecklisteRoh[] }>('checklists/checklists.json'),
    lies<{ employees?: MitarbeiterRoh[] }>('employees/employees.json'),
  ])
  let inventur: Stufe2['inventur'] = null
  const letzte = [...(idx?.runs || [])].sort((a, b) => s(b.importedAt).localeCompare(s(a.importedAt)))[0]
  if (letzte?.id) {
    const run = await lies<RunVoll>(`hardware-inventory/runs/${letzte.id}.json`)
    if (run) {
      const geraete: RohGeraet[] = []
      // nur, was damals wirklich im Lager gescannt wurde
      for (const d of run.devices || []) if (d.scanned) geraete.push({ serial: d.serial, typText: d.deviceType, kommentar: fachText(d), state: d.status || 'In stock', substate: d.substate })
      for (const x of run.extras || []) geraete.push({ serial: x.serial, kommentar: fachText({ epComment: x.epComment, fachNachgetragen: x.fachNachgetragen }), state: 'In stock' })
      inventur = { titel: run.title || letzte.title || 'Inventur', am: run.completedAt || run.importedAt || '', geraete }
    }
  }
  return {
    inventur,
    checklisten: Array.isArray(cl?.checklists) ? cl!.checklists : [],
    mitarbeiter: Array.isArray(emp?.employees) ? emp!.employees : [],
  }
}
