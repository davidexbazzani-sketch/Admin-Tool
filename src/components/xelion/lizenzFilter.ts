// ── Filterlogik der Lizenz-Prüfung ──────────────────────────────────────────
// Gleiches Verhalten wie durchwahlFilter.ts (Excel-Autofilter): je Spalte die AUSGEBLENDETEN
// Werte, gezählt wird auf der Grundmenge, die alle ANDEREN Filter passiert. Bewusst ohne
// Oberfläche — der Export folgt genau dieser Auswahl.

import {
  EMPFEHLUNG_TEXT, TYP_TEXT, AD_TEXT, LIZENZ_TEXT, PC_TEXT, type LizenzEintrag, type PcZusammenfassung,
} from '../../services/xelionLizenzen'
import { durchwahlVon, tageSeit } from '../../services/rufnummerPruefung'
import { ausstattungsKlasse, type ZugewiesenesGeraet } from '../../services/xelionGeraete'

/** `geraete` = null: entfällt (keine Person) bzw. Geräteliste noch nicht geladen. */
export type LizenzZeile = LizenzEintrag & { pc: PcZusammenfassung; geraete: ZugewiesenesGeraet[] | null }

export type SpaltenId =
  | 'typ' | 'name' | 'user' | 'abteilung' | 'lizenz' | 'nummer' | 'vergabe' | 'adNummer'
  | 'ad' | 'anmeldung' | 'gruppe' | 'sammelruf' | 'status' | 'umleitung' | 'geraete' | 'pc' | 'hinweise' | 'empfehlung'

export interface SpaltenDef {
  id: SpaltenId
  titel: string
  werte: (z: LizenzZeile) => string[]
  leerText?: string
}

export function anmeldeKlasse(z: LizenzEintrag): string {
  if (z.ad.befund === 'entfaellt') return ''
  if (z.ad.befund === 'nicht-im-ad') return 'kein AD-Konto'
  if (z.ad.befund === 'ungeprueft') return 'ungeprüft'
  const t = tageSeit(z.ad.lastLogon)
  if (t === null) return 'nie / unbekannt'
  if (t <= 30) return 'letzte 30 Tage'
  if (t <= 90) return '31–90 Tage'
  if (t <= 180) return '91–180 Tage'
  return 'älter als 180 Tage'
}

export function vergabeKlasse(z: LizenzEintrag): string {
  if (!z.vergabe.length) return ''
  if (z.vergabe.some(v => v.ueber === 'nummer' && v.status !== 'vergeben')) return 'dort frei/gesperrt'
  if (z.vergabe.some(v => v.ueber === 'nummer' && v.name && !v.passt)) return 'andere Person'
  if (z.vergabe.some(v => v.ueber === 'name' && !z.durchwahlen.includes(v.durchwahl))) return 'andere Durchwahl'
  return 'passt'
}

export function adNummerKlasse(z: LizenzEintrag): string {
  if (z.ad.befund === 'entfaellt' || z.ad.befund === 'ungeprueft') return ''
  if (z.ad.telefon === null) return 'nicht ermittelt'
  if (!z.ad.telefon) return ''
  const d = durchwahlVon(z.ad.telefon)
  if (!z.durchwahlen.length) return 'nur im AD'
  return z.durchwahlen.includes(d) ? 'gleich' : 'ungleich'
}

export const SPALTEN_DEF: SpaltenDef[] = [
  { id: 'typ',        titel: 'Typ',               werte: z => [TYP_TEXT[z.typ]] },
  { id: 'name',       titel: 'Name',              werte: z => [z.name] },
  { id: 'user',       titel: 'Benutzer (Xelion)', werte: z => [z.userName], leerText: '(ohne Benutzer)' },
  { id: 'abteilung',  titel: 'Abteilung',         werte: z => [z.ad.abteilung], leerText: '(ohne Abteilung)' },
  { id: 'lizenz',     titel: 'Lizenz',            werte: z => [LIZENZ_TEXT[z.lizenz]] },
  { id: 'nummer',     titel: 'Durchwahl',         werte: z => (z.durchwahlen.length ? z.durchwahlen : z.nummern.length ? ['anderer Nummernkreis'] : ['']), leerText: '(keine Nummer)' },
  { id: 'vergabe',    titel: 'Vergabeliste',      werte: z => [vergabeKlasse(z)], leerText: '(nicht in der Liste)' },
  { id: 'adNummer',   titel: 'Rufnummer im AD',   werte: z => [adNummerKlasse(z)], leerText: '(keine im AD)' },
  { id: 'ad',         titel: 'AD-Status',         werte: z => [AD_TEXT[z.ad.befund]] },
  { id: 'anmeldung',  titel: 'Zuletzt angemeldet', werte: z => [anmeldeKlasse(z)], leerText: '(entfällt)' },
  { id: 'gruppe',     titel: 'Xelion-Gruppe (AD)', werte: z => (z.ad.xelionGruppen === null ? [''] : z.ad.xelionGruppen.length ? z.ad.xelionGruppen : ['keine']), leerText: '(nicht ermittelt)' },
  { id: 'sammelruf',  titel: 'Sammelrufe',        werte: z => (z.sammelrufe.length ? z.sammelrufe : ['']), leerText: '(keiner)' },
  { id: 'status',     titel: 'Xelion-Status',     werte: z => [z.userStatus], leerText: '(leer)' },
  { id: 'umleitung',  titel: 'Umleitung',         werte: z => [z.umleitungAktiv ? 'aktiv' : ''], leerText: '(keine)' },
  { id: 'geraete',    titel: 'Zugewiesene Geräte', werte: z => [z.geraete === null ? '' : ausstattungsKlasse(z.geraete)], leerText: '(entfällt)' },
  { id: 'pc',         titel: 'PC-Prüfung',        werte: z => [PC_TEXT[z.pc.zustand]] },
  { id: 'hinweise',   titel: 'Hinweise',          werte: z => [z.hinweise.length ? 'mit Hinweis' : ''], leerText: '(keine)' },
  { id: 'empfehlung', titel: 'Empfehlung',        werte: z => [EMPFEHLUNG_TEXT[z.empfehlung]] },
]

export type Ausgeblendet = Partial<Record<SpaltenId, Set<string>>>
export const KEIN_FILTER: Set<string> = new Set()

/** Vorgabe: Gruppenleitungen ausgeblendet — sie lenken bei der Lizenzfrage nur ab. */
export function vorgabeFilter(): Ausgeblendet {
  return { typ: new Set([TYP_TEXT.gruppe]) }
}

function suchfelder(z: LizenzZeile): string[] {
  return [z.name, z.userName, z.ad.sam, z.ad.abteilung, z.ad.anzeigename, z.nummern.join(' '),
    z.durchwahlen.join(' '), z.ad.telefon || '', z.sammelrufe.join(' '), z.grund, z.hinweise.join(' '), z.pc.text,
    ...(z.geraete ?? []).flatMap(g => [g.hostname, g.model, g.serial || ''])]
}

export function baueFilter(aus: Ausgeblendet, suche: string): Record<string, (z: LizenzZeile) => boolean> {
  const q = suche.trim().toLowerCase()
  const p: Record<string, (z: LizenzZeile) => boolean> = {
    suche: z => !q || suchfelder(z).some(x => (x || '').toLowerCase().includes(q)),
  }
  for (const d of SPALTEN_DEF) {
    const weg = aus[d.id]
    p[d.id] = weg && weg.size ? (z => d.werte(z).some(v => !weg.has(v))) : () => true
  }
  return p
}

export function wendeAn(zeilen: LizenzZeile[], p: Record<string, (z: LizenzZeile) => boolean>): LizenzZeile[] {
  return zeilen.filter(z => Object.values(p).every(f => f(z)))
}

export function zaehlwerte(
  zeilen: LizenzZeile[], p: Record<string, (z: LizenzZeile) => boolean>,
): Record<SpaltenId, Map<string, number>> {
  const r = {} as Record<SpaltenId, Map<string, number>>
  for (const d of SPALTEN_DEF) {
    const m = new Map<string, number>()
    for (const z of zeilen) {
      if (!Object.entries(p).every(([k, f]) => k === d.id || f(z))) continue
      for (const v of d.werte(z)) m.set(v, (m.get(v) || 0) + 1)
    }
    r[d.id] = m
  }
  return r
}

/** Nur diese Empfehlungen einblenden (Kacheln/Schnellgriffe); Typ-Filter bleibt wie er ist. */
export function nurEmpfehlungen(aus: Ausgeblendet, texte: string[]): Ausgeblendet {
  const behalten = new Set(texte)
  return { ...aus, empfehlung: new Set(Object.values(EMPFEHLUNG_TEXT).filter(t => !behalten.has(t))) }
}

export function filterBeschreibung(
  aus: Ausgeblendet, werte: Record<SpaltenId, Map<string, number>>, suche: string,
): string {
  const teile: string[] = []
  for (const d of SPALTEN_DEF) {
    const weg = aus[d.id]
    if (!weg || !weg.size) continue
    const alle = [...(werte[d.id]?.keys() ?? [])]
    const sichtbar = alle.filter(v => !weg.has(v)).map(v => v || (d.leerText ?? '(leer)'))
    if (!sichtbar.length) teile.push(`${d.titel}: nichts eingeblendet`)
    else if (sichtbar.length > 8) teile.push(`${d.titel}: ${sichtbar.length} von ${alle.length} Werten`)
    else teile.push(`${d.titel}: ${sichtbar.join(', ')}`)
  }
  if (suche.trim()) teile.push(`Suche: „${suche.trim()}“`)
  return teile.length ? `Filter — ${teile.join(' | ')}` : ''
}
