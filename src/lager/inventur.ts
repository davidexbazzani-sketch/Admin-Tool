// „Lager einsehen“ — Mini-Inventur: Soll je Fach aus der ServiceNow-Liste, Abgleich mit der Zählung. Reine Funktionen.

import { ALLE_ORTE, ortKurz } from './aufbau'
import { imLager } from './bestand'
import { serialKey } from './reservierung'
import { TYP_LABEL, TYP_REIHE, type LagerTyp, type OrtId, type RohGeraet } from './typen'
import { erkenneOrt, lagerTyp } from './zuordnung'

export type Stueck = Partial<Record<LagerTyp, number>>
export type SollTabelle = Partial<Record<OrtId, Stueck>>

export interface SollGeraet { serial: string; typ: LagerTyp; ort: OrtId; modell: string; kommentar: string }

export interface Zaehlung {
  status: 'stimmt' | 'abweichung'
  ist: Stueck
  notiz?: string
  am: string
  von: string
}

export interface MiniInventurDatei {
  version: 1
  id: string
  titel: string
  gestartetAm: string
  gestartetVon: string
  datei: string
  soll: SollTabelle
  sollGeraete: SollGeraet[]
  /** im Lager laut Liste, aber kein Fach erkennbar */
  ohne: { serial: string; modell: string; kommentar: string }[]
  zaehlung: Partial<Record<OrtId, Zaehlung>>
  status: 'offen' | 'abgeschlossen'
  abgeschlossenAm?: string
  abgeschlossenVon?: string
  verlauf: { am: string; von: string; was: string }[]
}

/** Orte, die bei der Mini-Inventur gezählt werden (verliehene Rechner und „Ohne Fach“ lassen sich nicht zählen). */
export const ZAEHL_ORTE: OrtId[] = ALLE_ORTE.filter(o => o !== 'zone:leih-umlauf' && o !== 'zone:ohne')

/** Spalten einer ServiceNow-Liste erkennen (Kopfzeilen, Groß/Klein egal). */
export function erkenneSpalten(koepfe: string[]): Partial<Record<keyof RohGeraet, string>> {
  const n = (s: string) => s.toLowerCase().replace(/[\s_\-./]+/g, '')
  const finde = (...namen: string[]) => koepfe.find(k => namen.includes(n(k)))
    ?? koepfe.find(k => namen.some(x => n(k).includes(x)))
  return {
    serial: finde('serialnumber', 'seriennummer', 'serial', 'sn'),
    modell: finde('model', 'modell', 'modelname', 'modelid'),
    state: finde('state', 'status', 'installstatus'),
    substate: finde('substate', 'substatus', 'verwendung'),
    kommentar: finde('comments', 'comment', 'kommentar', 'kommentarzumasset', 'bemerkung'),
    assignedTo: finde('assignedto', 'zugewiesenan'),
    reservedFor: finde('reservedfor', 'reserviertfuer'),
    hostname: finde('configurationitem', 'hostname', 'computername', 'pcname'),
  }
}

/** Zeilen einer Liste → Rohgeräte (nur mit Seriennummer). */
export function zeilenAusTabelle(rows: Record<string, unknown>[], spalten: Partial<Record<keyof RohGeraet, string>>): RohGeraet[] {
  const s = (r: Record<string, unknown>, k?: string) => (k ? String(r[k] ?? '').trim() : '')
  const out: RohGeraet[] = []
  for (const r of rows) {
    const serial = serialKey(s(r, spalten.serial))
    if (!serial || serial === '(EMPTY)') continue
    const leer = (v: string) => (v === '(empty)' ? '' : v)
    out.push({
      serial, modell: s(r, spalten.modell), state: s(r, spalten.state), substate: s(r, spalten.substate),
      kommentar: s(r, spalten.kommentar), assignedTo: leer(s(r, spalten.assignedTo)), reservedFor: leer(s(r, spalten.reservedFor)),
      hostname: leer(s(r, spalten.hostname)),
    })
  }
  return out
}

export function berechneSoll(zeilen: RohGeraet[]): { soll: SollTabelle; sollGeraete: SollGeraet[]; ohne: MiniInventurDatei['ohne']; nichtImLager: number } {
  const soll: SollTabelle = {}
  const sollGeraete: SollGeraet[] = []
  const ohne: MiniInventurDatei['ohne'] = []
  let nichtImLager = 0
  const gesehen = new Set<string>()
  for (const z of zeilen) {
    if (gesehen.has(z.serial)) continue
    gesehen.add(z.serial)
    const lager = imLager(z)
    if (lager === 'nein') { nichtImLager++; continue }
    if (lager === 'mitOrt' && !erkenneOrt({ kommentar: z.kommentar, inAmdb: true }).ort.startsWith('r5:')) { nichtImLager++; continue }
    const ort = erkenneOrt({ kommentar: z.kommentar, state: z.state, substate: z.substate, inAmdb: true }).ort
    const typ = lagerTyp(z.modell)
    if (ort === 'zone:ohne') { ohne.push({ serial: z.serial, modell: z.modell || '', kommentar: z.kommentar || '' }); continue }
    sollGeraete.push({ serial: z.serial, typ, ort, modell: z.modell || '', kommentar: z.kommentar || '' })
    const t = (soll[ort] ||= {})
    t[typ] = (t[typ] || 0) + 1
  }
  return { soll, sollGeraete, ohne, nichtImLager }
}

export const summe = (s: Stueck | undefined) => TYP_REIHE.reduce((a, t) => a + (s?.[t] || 0), 0)

/** Unterschied Soll ↔ Ist als Text („Mini-PC 2 statt 3 · EliteBook 1 statt 0“); '' wenn gleich. */
export function unterschied(soll: Stueck | undefined, ist: Stueck | undefined): string {
  const teile: string[] = []
  for (const t of TYP_REIHE) {
    const a = soll?.[t] || 0, b = ist?.[t] || 0
    if (a !== b) teile.push(`${TYP_LABEL[t]} ${b} statt ${a}`)
  }
  return teile.join(' · ')
}

export type OrtZustand = { zustand: 'stimmt' | 'abweichung' | 'offen'; text?: string }

/** Zustand je zu zählendem Ort (für 3D, 2D und Liste). */
export function abgleich(inv: Pick<MiniInventurDatei, 'soll' | 'zaehlung'>): Map<OrtId, OrtZustand> {
  const m = new Map<OrtId, OrtZustand>()
  for (const ort of ZAEHL_ORTE) {
    const z = inv.zaehlung[ort]
    if (!z) { m.set(ort, { zustand: 'offen' }); continue }
    if (z.status === 'stimmt') { m.set(ort, { zustand: 'stimmt' }); continue }
    const text = unterschied(inv.soll[ort], z.ist)
    m.set(ort, text ? { zustand: 'abweichung', text } : { zustand: 'stimmt' })
  }
  return m
}

export function abweichungen(inv: Pick<MiniInventurDatei, 'soll' | 'zaehlung'>): { ort: OrtId; text: string }[] {
  return [...abgleich(inv)].filter(([, z]) => z.zustand === 'abweichung').map(([ort, z]) => ({ ort, text: `${ortKurz(ort)}: ${z.text}` }))
}
