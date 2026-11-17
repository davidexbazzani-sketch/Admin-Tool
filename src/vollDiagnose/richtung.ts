// ── PC-Volldiagnose: Richtung („ungefähr bekannt, worum es geht“) ────────────
// Kategorien = Ober-/Unterthemen der geführten Diagnose. Beim Tippen: passende Unterthemen
// (Begriffs-Abgleich mit Synonymen/Stämmen) und passende Katalogprobleme (erkenne()).
// Wirkung: Sonden dieser Themen zuerst, ihre Regeln ohne imBereich-Bremse, Befunde dazu
// oben, passende leichte Vertiefungen automatisch, Fachdiagnose sofort anbietbar.

import { DG_THEMEN } from '../problemAssistent/diagnose/index'
import type { DgOber, DgUnter } from '../problemAssistent/diagnose/types'
import { woerter, konzept } from '../problemAssistent/suche'
import { PROBLEME } from '../problemAssistent/katalog'
import type { VdFachdiagnose, VdRichtung } from './typen'

export const RICHTUNG_THEMEN: DgOber[] = DG_THEMEN.filter(o => o.unter.length > 0)

const UNTER_ZU_OBER = new Map<string, DgOber>()
for (const o of RICHTUNG_THEMEN) for (const u of o.unter) UNTER_ZU_OBER.set(u.id, o)
export const oberVonUnter = (id: string) => UNTER_ZU_OBER.get(id)
export const unterVon = (id: string): DgUnter | undefined => UNTER_ZU_OBER.get(id)?.unter.find(u => u.id === id)

const LEER = new Set(['nicht', 'kein', 'keine', 'geht', 'gehen', 'ist', 'sind', 'wird', 'der', 'die', 'das', 'und', 'oder', 'mit', 'bei', 'ein', 'eine', 'mein', 'meine', 'immer', 'wieder', 'pc', 'rechner', 'computer', 'laptop', 'notebook', 'problem', 'probleme', 'fehler', 'oft', 'ganz', 'sehr', 'auch'].map(konzept))

function begriffe(text: string): Set<string> {
  return new Set(woerter(text).map(konzept).filter(k => k.length >= 3 && !LEER.has(k)))
}
const UNTER_BEGRIFFE = new Map<string, Set<string>>()
for (const o of RICHTUNG_THEMEN) for (const u of o.unter) UNTER_BEGRIFFE.set(u.id, begriffe(`${u.titel} ${u.beschreibung} ${o.titel}`))

/** Unterthemen, die zum Text passen (beste zuerst). */
export function passendeUnter(text: string, max = 4): { u: DgUnter; o: DgOber; punkte: number }[] {
  const b = begriffe(text)
  if (!b.size) return []
  const aus: { u: DgUnter; o: DgOber; punkte: number }[] = []
  for (const o of RICHTUNG_THEMEN) for (const u of o.unter) {
    const ub = UNTER_BEGRIFFE.get(u.id)!
    let p = 0
    for (const k of b) if (ub.has(k)) p += 1
    // Treffer im Titel zählen mehr
    for (const k of begriffe(u.titel)) if (b.has(k)) p += 0.5
    if (p >= 1) aus.push({ u, o, punkte: p })
  }
  return aus.sort((a, c) => c.punkte - a.punkte).slice(0, max)
}

/** Problem-Vorschläge (gleiche Erkennung wie „Gib dein Problem ein“) — derselbe, einmal gebaute Index. */
export function problemIndex() {
  return import('../problemAssistent/ProblemAssistent').then(m => m.ladeIndex())
}
export async function problemVorschlaege(text: string, max = 5): Promise<{ id: string; titel: string; bereich: string; sicher: boolean }[]> {
  if (!text.trim()) return []
  const [{ erkenne, suche }, ix] = await Promise.all([import('../problemAssistent/suche'), problemIndex()])
  const e = erkenne(ix, text)
  const liste = e.treffer.length ? e.treffer : suche(ix, text, max)
  return liste.slice(0, max).map((t, i) => ({ id: t.p.id, titel: t.p.titel, bereich: t.p.bereich, sicher: i === 0 && (e.sicherheit === 'hoch' || e.sicherheit === 'mittel') }))
}

const NETZ_OBER = new Set(['netz', 'wlan', 'vpn'])
/** Fachdiagnose, die zur Richtung passt (Netzwerk, SAP, SolidWorks). */
export function fachVonRichtung(r?: VdRichtung | null): VdFachdiagnose | undefined {
  if (!r) return undefined
  const ober = new Set([...r.themen, ...r.unter.map(u => oberVonUnter(u)?.id || '')])
  if ([...ober].some(o => NETZ_OBER.has(o))) return 'netzdiagnose'
  if (ober.has('sap') || r.unter.some(u => u.startsWith('sap-'))) return 'sap-fehlersuche'
  if (r.unter.some(u => u.startsWith('fp-sw-'))) return 'solidworks-diagnose'
  const p = r.problem ? PROBLEME.find(x => x.id === r.problem) : undefined
  if (p) return fachVonBereich(p.bereich)
  return undefined
}
/**
 * Fachdiagnose schon aus dem getippten Text: klarer Unterthema-Treffer (≥ 1,5 Punkte) bzw. sicherer
 * Problem-Vorschlag im Bereich Netz/WLAN/VPN, SAP oder SolidWorks — ohne dass ein Chip gewählt ist.
 */
export function fachVonText(unter: { u: { id: string }; punkte: number }[], vorschlaege: { bereich: string; sicher: boolean }[]): VdFachdiagnose | undefined {
  const top = unter[0]
  if (top && top.punkte >= 1.5) { const f = fachVonRichtung({ themen: [], unter: [top.u.id] }); if (f) return f }
  const v = vorschlaege.find(x => x.sicher)
  return v ? fachVonBereich(v.bereich) : undefined
}
export function fachVonBereich(bereich: string): VdFachdiagnose | undefined {
  if (bereich === 'Netzwerk & Internet' || bereich === 'WLAN' || bereich === 'VPN & Zscaler') return 'netzdiagnose'
  if (bereich === 'SAP') return 'sap-fehlersuche'
  if (bereich === 'SolidWorks & CAD') return 'solidworks-diagnose'
  return undefined
}

/** Leichte Vertiefungen, die bei dieser Richtung immer mitlaufen. */
const VERTIEFUNG_JE_OBER: Record<string, string[]> = {
  stabilitaet: ['v1-bluescreen', 'v2-absturz', 'v5-datentraeger'],
  leistung: ['v5-datentraeger'],
  software: ['v3-update'],
  windows: ['v2-absturz'],
  office: ['v2-absturz'], outlook: ['v2-absturz'], teams: ['v2-absturz'], browser: ['v2-absturz'],
  bildschirm: ['v1-bluescreen'],
}

export interface RichtungsUmfang {
  /** Unterthemen, deren Regeln ohne imBereich-Bremse gelten */
  unter: Set<string>
  /** Sonden dieser Themen (laufen zuerst) */
  sonden: Set<string>
  /** leichte Vertiefungen, die immer mitlaufen */
  vertiefungen: string[]
  fach?: VdFachdiagnose
  /** Bereiche der Katalogprobleme (für „passend“ bei Ereignis-Befunden) */
  bereiche: Set<string>
}

export function umfangVon(r?: VdRichtung | null): RichtungsUmfang {
  const unter = new Set<string>()
  const sonden = new Set<string>()
  const vertiefungen = new Set<string>()
  const bereiche = new Set<string>()
  // Nur Text getippt (z. B. von „Gib dein Problem ein“ übernommen): klare Unterthema-Treffer gelten
  // wie angeklickt — sonst hätte der Text keine Wirkung auf den Scan
  if (r && !r.themen.length && !r.unter.length && !r.problem && r.text) {
    const implizit = passendeUnter(r.text, 2).filter(t => t.punkte >= 1.5).map(t => t.u.id)
    if (implizit.length) r = { ...r, unter: implizit }
  }
  if (r) {
    for (const o of RICHTUNG_THEMEN) {
      const ganz = r.themen.includes(o.id)
      for (const u of o.unter) {
        if (!ganz && !r.unter.includes(u.id)) continue
        unter.add(u.id)
        for (const s of u.sonden) sonden.add(s)
        for (const p of [...u.ohneBefund, ...u.regeln.map(x => x.problem)]) { const pb = PROBLEME.find(x => x.id === p); if (pb) bereiche.add(pb.bereich) }
      }
      if (ganz || o.unter.some(u => r.unter.includes(u.id))) for (const v of VERTIEFUNG_JE_OBER[o.id] || []) vertiefungen.add(v)
    }
    if (r.problem) { const p = PROBLEME.find(x => x.id === r.problem); if (p) bereiche.add(p.bereich) }
  }
  return { unter, sonden, vertiefungen: [...vertiefungen], fach: fachVonRichtung(r), bereiche }
}

/** Kurztext der Richtung („Outlook & E-Mail · PC friert ein“). */
export function richtungText(r?: VdRichtung | null): string {
  if (!r) return ''
  const teile = [
    ...r.themen.map(id => RICHTUNG_THEMEN.find(o => o.id === id)?.titel || id),
    ...r.unter.map(id => unterVon(id)?.titel || id),
  ]
  if (r.problem) { const p = PROBLEME.find(x => x.id === r.problem); if (p) teile.push(p.titel) }
  if (!teile.length && r.text) teile.push(`„${r.text}“`)
  return teile.join(' · ')
}
