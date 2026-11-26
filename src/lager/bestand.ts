// „Lager einsehen“ — Quellen zu EINEM Lagerbestand zusammenführen. Reine Funktion (kein Netzlaufwerk).
//
// Grundlage: Endgeräte-Übersicht (Geräte „In stock“, Leihrechner, Pending disposal …).
// Lagerliste aus der Mini-Inventur: ist sie neuer, überschreibt sie Kommentar/Status je Gerät.
// Letzte Inventur: gescannte Geräte, die gar nicht in der Asset-Datenbank stehen (meist SKF-Eigentum).
// Pick-Ups des Tools: abgeholte Geräte sind nicht mehr im Lager.

import { ALLE_ORTE } from './aufbau'
import { serialKey } from './reservierung'
import type { GeraeteQuelle, LagerGeraet, OrtId, RohGeraet, Vorgesehen } from './typen'
import { erkenneOrt, lagerTyp } from './zuordnung'

export interface BestandQuellen {
  endgeraete: RohGeraet[] | null
  endgeraeteStand?: string
  lagerliste?: { stand: string; zeilen: RohGeraet[] } | null
  inventur?: { titel: string; am: string; geraete: RohGeraet[] } | null
  abholungen?: { serial: string; datum: string; lieferant?: string }[]
  reservierungen?: Map<string, Vorgesehen[]>
  /** YYYY-MM-DD */
  heute: string
}

export interface LagerModell {
  geraete: LagerGeraet[]
  proOrt: Map<OrtId, LagerGeraet[]>
  /** in einem Pick-Up abgeholt, laut Daten aber noch im Lager */
  abgeholt: { serial: string; datum: string; kommentar: string }[]
  quellen: { endgeraete: number; lagerliste: number; inventur: number }
}

const LEIH_RE = /^\s*leih[\s-]?(rechner|ger(ae|ä)t|laptop|notebook|pc)/i

/** Gehört ein Gerät mit diesem Status ins Lager? */
export function imLager(r: RohGeraet): 'ja' | 'nein' | 'mitOrt' {
  const st = (r.state || '').toLowerCase()
  const sub = (r.substate || '').toLowerCase()
  if (LEIH_RE.test(r.kommentar || '') || /loaner/.test(sub)) return /retire|dispos|missing|stolen|lost|transit/.test(st) ? 'nein' : 'ja'
  if (/stock|lager/.test(st)) return 'ja'
  // „Pending disposal“ liegt noch im Lager — „Disposed“ (schon entsorgt) nicht
  if (/pending\s*dispos/.test(sub) && !/disposed|entsorgt/.test(st)) return 'ja'
  // ausgemustert: nur, wenn der Kommentar einen Ort im Lager nennt („Retired this Month“, Fach …)
  if (/retire/.test(st)) return 'mitOrt'
  if (!st) return 'mitOrt'
  return 'nein'
}

function mische(alt: RohGeraet | undefined, neu: RohGeraet): RohGeraet {
  if (!alt) return { ...neu }
  const out: RohGeraet = { ...alt }
  for (const k of Object.keys(neu) as (keyof RohGeraet)[]) {
    const v = neu[k]
    if (v !== undefined && (v !== '' || k === 'kommentar' || k === 'state' || k === 'substate' || k === 'assignedTo' || k === 'reservedFor')) out[k] = v
  }
  return out
}

export function baueBestand(q: BestandQuellen): LagerModell {
  const herkunft = new Map<string, GeraeteQuelle>()
  const roh = new Map<string, RohGeraet>()
  const inAmdb = new Set<string>()

  const ep = q.endgeraete || []
  for (const d of ep) {
    const k = serialKey(d.serial)
    if (!k) continue
    inAmdb.add(k)
    roh.set(k, mische(roh.get(k), { ...d, serial: k }))
    herkunft.set(k, 'endgeraete')
  }
  let ausListe = 0
  const liste = q.lagerliste
  if (liste && liste.zeilen.length) {
    const neuer = !q.endgeraeteStand || liste.stand > q.endgeraeteStand
    for (const z of liste.zeilen) {
      const k = serialKey(z.serial)
      if (!k) continue
      inAmdb.add(k)
      const vorhanden = roh.get(k)
      if (!vorhanden || neuer) {
        roh.set(k, vorhanden ? mische(vorhanden, { ...z, serial: k }) : { ...z, serial: k })
        herkunft.set(k, 'lagerliste')
        ausListe++
      }
    }
  }
  let ausInventur = 0
  for (const g of q.inventur?.geraete || []) {
    const k = serialKey(g.serial)
    if (!k || roh.has(k)) continue
    roh.set(k, { ...g, serial: k, state: g.state || 'In stock' })
    herkunft.set(k, 'inventur')
    ausInventur++
  }

  // Pick-Ups
  const abholung = new Map<string, { datum: string }>()
  for (const a of q.abholungen || []) {
    const k = serialKey(a.serial)
    if (!k) continue
    const alt = abholung.get(k)
    if (!alt || a.datum > alt.datum) abholung.set(k, { datum: a.datum })
  }

  const geraete: LagerGeraet[] = []
  const abgeholt: LagerModell['abgeholt'] = []
  for (const [k, r] of roh) {
    const lager = imLager(r)
    if (lager === 'nein') continue
    const ab = abholung.get(k)
    if (ab && ab.datum <= q.heute) {
      if (lager === 'ja') abgeholt.push({ serial: k, datum: ab.datum, kommentar: r.kommentar || '' })
      continue
    }
    // Ausgemusterte (alle aus der Vergangenheit stehen in der Liste!) nur, wenn der Kommentar ein Schild des linken Regals nennt
    if (lager === 'mitOrt' && !erkenneOrt({ kommentar: r.kommentar, inAmdb: true }).ort.startsWith('r5:')) continue
    const z = erkenneOrt({ kommentar: r.kommentar, state: r.state, substate: r.substate, inAmdb: inAmdb.has(k), abholungAngemeldet: !!ab })
    const vorgesehen: Vorgesehen[] = [...(q.reservierungen?.get(k) || []).map(v => ({ ...v }))]
    const dazu = (name: string | undefined, quelle: string) => {
      const n = (name || '').trim()
      if (!n || n === '(empty)') return
      if (z.leih?.benutzer && n.toLowerCase() === z.leih.benutzer.toLowerCase()) return
      const gleich = vorgesehen.find(v => v.name.toLowerCase() === n.toLowerCase())
      if (gleich) { if (!gleich.quelle.includes(quelle)) gleich.quelle += ` · ${quelle}` }
      else vorgesehen.push({ name: n, quelle })
    }
    dazu(r.reservedFor, 'ServiceNow: Reserved for')
    if (!z.leih) dazu(r.assignedTo, 'ServiceNow: Assigned to')
    geraete.push({
      serial: k,
      hostname: (r.hostname || '').trim().toUpperCase(),
      modell: (r.modell || '').trim(),
      typ: lagerTyp(r.modell, r.typText),
      kommentar: (r.kommentar || '').trim(),
      state: (r.state || '').trim(),
      substate: (r.substate || '').trim(),
      ort: z.ort, grund: z.grund, hinweise: z.hinweise, leih: z.leih,
      vorgesehen,
      quelle: herkunft.get(k) || 'endgeraete',
    })
  }
  geraete.sort((a, b) => a.serial.localeCompare(b.serial))
  const proOrt = new Map<OrtId, LagerGeraet[]>(ALLE_ORTE.map(o => [o, []]))
  for (const g of geraete) {
    const l = proOrt.get(g.ort)
    if (l) l.push(g); else proOrt.set(g.ort, [g])
  }
  return { geraete, proOrt, abgeholt, quellen: { endgeraete: ep.length, lagerliste: ausListe, inventur: ausInventur } }
}

/** Suche über Seriennummer, Hostname, Modell, Kommentar, Namen. */
export function sucheGeraete(m: LagerModell, text: string): LagerGeraet[] {
  const t = text.trim().toLowerCase()
  if (!t) return []
  const k = serialKey(text)
  return m.geraete.filter(g => g.serial.includes(k) || g.hostname.toLowerCase().includes(t) || g.modell.toLowerCase().includes(t)
    || g.kommentar.toLowerCase().includes(t) || (g.leih?.benutzer || '').toLowerCase().includes(t)
    || g.vorgesehen.some(v => v.name.toLowerCase().includes(t)))
}
