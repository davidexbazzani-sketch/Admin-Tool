// ── Vor der Software-Installation: Wer ist angemeldet – und wem gehört das Gerät? ──
// Reine Logik ohne Ein-/Ausgabe (testbar): rohe Anmeldedaten des Ziel-PCs auswerten,
// die Zuweisung aus Endgeräte-/Standort-Übersicht finden und beides abgleichen.
// Die Abfrage selbst steckt in anmeldeAbgleich.ts.

import { fuzzyNameMatch } from '../utils/nameMatch'

export type SitzungsStatus = 'aktiv' | 'gesperrt' | 'getrennt' | 'unbekannt'

export interface AngemeldeterBenutzer {
  /** wie vom PC gemeldet, z. B. „CORP\X12345" (bei quser ohne Domäne) */
  konto: string
  /** reine Kennung (Corp ID) */
  sam: string
  /** Anzeigename aus dem AD, falls auflösbar */
  name?: string
  status: SitzungsStatus
}

export interface Zuweisung {
  name: string
  /** Kennung, falls bekannt (Standort-Übersicht bzw. AD-Verzeichnis) */
  sam?: string
  quelle: string
}

/**
 * passt          = die zugewiesene Person ist angemeldet
 * fremd          = jemand ist angemeldet, aber nicht die zugewiesene Person → Hinweis
 * niemand        = gerade niemand angemeldet
 * ohne-zuweisung = jemand angemeldet, das Gerät ist aber niemandem zugewiesen (bekannt)
 * unbekannt      = Anmeldung ließ sich nicht ermitteln (PC aus, kein Zugriff …)
 */
export type AbgleichStufe = 'passt' | 'fremd' | 'niemand' | 'ohne-zuweisung' | 'unbekannt'

export interface AnmeldeAbgleich {
  host: string
  stufe: AbgleichStufe
  angemeldet: AngemeldeterBenutzer[]
  zuweisung: Zuweisung | null
  /** WinRM oder DCOM */
  weg?: string
  fehler?: string
  geprueftAm: number
}

/** Was der PC liefert (WinRM bzw. DCOM-Ausweg). */
export interface RohAnmeldung {
  konsole?: string
  explorer?: { konto: string; sitzung: number }[]
  gesperrt?: number[]
  quser?: string[]
}

const gleich = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
const RANG: Record<SitzungsStatus, number> = { aktiv: 0, gesperrt: 1, getrennt: 2, unbekannt: 3 }
/** Konten, die kein Mensch sind (Einrichtung/OOBE). */
const KEIN_MENSCH = /^(defaultuser\d*|system|lokaler dienst|local service|netzwerkdienst|network service)$/i

/** „CORP\X12345", „X12345@skf.net" oder „X12345" → „X12345". */
export function samAus(konto: string): string {
  return (String(konto ?? '').trim().split('\\').pop() ?? '').split('@')[0].trim()
}

/** Sieht der Text wie eine Kennung aus (kein Name)? z. B. X35982, ab12345 */
export function istKennung(s: string): boolean {
  const t = (s || '').trim()
  return t.length >= 4 && t.length <= 20 && !/\s|,/.test(t) && /\d/.test(t) && /^[a-z0-9._-]+$/i.test(t)
}

/**
 * quser-Ausgabe (deutsch oder englisch) → Benutzer, Sitzungs-ID, Zustand.
 * Spalten sind durch mindestens zwei Leerzeichen getrennt; bei getrennten Sitzungen fehlt
 * der Sitzungsname, deshalb wird die ID als erste reine Zahl hinter dem Namen gesucht.
 */
export function parseQuser(zeilen: string[]): { benutzer: string; sitzung: number | null; status: SitzungsStatus }[] {
  const aus: { benutzer: string; sitzung: number | null; status: SitzungsStatus }[] = []
  for (const roh of zeilen || []) {
    const z = String(roh ?? '').replace(/^[\s>]+/, '').trimEnd()
    if (!z || /^(benutzername|username)\b/i.test(z) || /no user exists|kein benutzer/i.test(z)) continue
    const teile = z.split(/\s{2,}/)
    const benutzer = teile[0]?.trim()
    if (!benutzer) continue
    const i = teile.findIndex((t, n) => n > 0 && /^\d+$/.test(t.trim()))
    let sitzung: number | null = null
    let zustand = ''
    if (i > 0) { sitzung = Number(teile[i].trim()); zustand = (teile[i + 1] || '').trim() }
    else {
      // Sitzungsname und ID nur durch EIN Leerzeichen getrennt (langer Sitzungsname)
      const m = z.match(/\s(\d+)\s+(\S+)/)
      if (m) { sitzung = Number(m[1]); zustand = m[2] }
    }
    const status: SitzungsStatus = /^(aktiv|active)/i.test(zustand) ? 'aktiv' : /^(getr|disc)/i.test(zustand) ? 'getrennt' : 'unbekannt'
    aus.push({ benutzer, sitzung, status })
  }
  return aus
}

/** Rohdaten → angemeldete Benutzer (je Kennung einmal, bester Zustand zuerst). */
export function werteAnmeldungAus(roh: RohAnmeldung | null | undefined): AngemeldeterBenutzer[] {
  if (!roh) return []
  // LogonUI.exe läuft in einer Sitzung = Bildschirm gesperrt (quser meldet dann trotzdem „Aktiv")
  const gesperrt = new Set((Array.isArray(roh.gesperrt) ? roh.gesperrt : roh.gesperrt != null ? [roh.gesperrt as unknown as number] : []).map(Number))
  const qs = parseQuser(Array.isArray(roh.quser) ? roh.quser : roh.quser ? [String(roh.quser)] : [])
    .map(q => q.sitzung != null && gesperrt.has(q.sitzung) && q.status !== 'getrennt' ? { ...q, status: 'gesperrt' as SitzungsStatus } : q)
  const jeSitzung = new Map<number, SitzungsStatus>()
  const jeBenutzer = new Map<string, SitzungsStatus>()
  for (const q of qs) {
    if (q.sitzung != null) jeSitzung.set(q.sitzung, q.status)
    const k = samAus(q.benutzer).toLowerCase()
    const alt = jeBenutzer.get(k)
    if (!alt || RANG[q.status] < RANG[alt]) jeBenutzer.set(k, q.status)
  }
  const liste = new Map<string, AngemeldeterBenutzer>()
  const dazu = (konto: string, status: SitzungsStatus) => {
    const sam = samAus(konto)
    if (!sam || KEIN_MENSCH.test(sam)) return
    const k = sam.toLowerCase()
    const alt = liste.get(k)
    if (!alt) { liste.set(k, { konto: konto.trim(), sam, status }); return }
    if (RANG[status] < RANG[alt.status]) alt.status = status
    if (!alt.konto.includes('\\') && konto.includes('\\')) alt.konto = konto.trim()
  }
  const explorer = Array.isArray(roh.explorer) ? roh.explorer : roh.explorer ? [roh.explorer as unknown as { konto: string; sitzung: number }] : []
  for (const e of explorer) {
    if (!e?.konto) continue
    const s = Number(e.sitzung)
    const status: SitzungsStatus = gesperrt.has(s) ? 'gesperrt'
      : jeSitzung.get(s) ?? jeBenutzer.get(samAus(e.konto).toLowerCase()) ?? (gleich(samAus(roh.konsole || ''), samAus(e.konto)) ? 'aktiv' : 'unbekannt')
    dazu(e.konto, status)
  }
  if (roh.konsole) dazu(roh.konsole, jeBenutzer.get(samAus(roh.konsole).toLowerCase()) ?? 'unbekannt')
  for (const q of qs) dazu(q.benutzer, q.status)
  return [...liste.values()].sort((a, b) => RANG[a.status] - RANG[b.status] || a.sam.localeCompare(b.sam))
}

// ── Zuweisung ────────────────────────────────────────────────────────────────

/** Wie canonicalHost (deviceDossier): Kurzname in Großbuchstaben, IP unverändert. */
export function kanonHost(h: unknown): string {
  const t = String(h ?? '').trim()
  if (!t) return ''
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t) || t.includes(':')) return t.toUpperCase()
  return t.split('.')[0].toUpperCase()
}
/** Wie serialFromHostname (deviceMasterData): Präfix DE/DEHAM/DESCH abschneiden. */
function serieAus(h: string): string {
  const k = kanonHost(h)
  const rest = k.startsWith('DEHAM') ? k.slice(5) : k.startsWith('DESCH') ? k.slice(5) : k.startsWith('DE') ? k.slice(2) : ''
  return /^[A-Z0-9]{5,}$/.test(rest) ? rest : ''
}
const normSerie = (s: unknown) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '')
const text = (v: unknown) => String(v ?? '').trim()

export interface GeraetZuweisung { hostname?: string; serial?: string; assignedTo?: string }
export interface InventarZuweisung { name?: string; assignedTo?: string; corpId?: string }

/**
 * Wem ist der PC zugewiesen? Maßgeblich ist die Endgeräte-Übersicht (ServiceNow-Import, per
 * Hostname oder Seriennummer); die Kennung kommt aus der Standort-Übersicht, aber nur, wenn
 * dort dieselbe Person steht. Fehlt der PC in den Endgeräten, gilt die Standort-Übersicht.
 */
export function findeZuweisung(host: string, geraete: GeraetZuweisung[], inventar: InventarZuweisung[]): Zuweisung | null {
  const h = kanonHost(host)
  if (!h) return null
  const serie = serieAus(h)
  // Mehrere Treffer (z. B. alter Datensatz ohne Zuweisung): den mit Zuweisung nehmen
  const besser = <T extends { assignedTo?: unknown }>(l: T[]): T | undefined => l.find(x => text(x.assignedTo)) ?? l[0]
  const ep = besser(geraete.filter(d => kanonHost(d.hostname) === h))
    ?? (serie ? besser(geraete.filter(d => normSerie(d.serial) === serie)) : undefined)
  const inv = besser(inventar.filter(i => kanonHost(i.name) === h))
  const epName = text(ep?.assignedTo)
  const invName = text(inv?.assignedTo)
  const invSam = text(inv?.corpId)
  if (epName) {
    const dieselbe = !!invName && (gleich(invName, epName) || fuzzyNameMatch(invName, epName))
    return { name: epName, sam: dieselbe && invSam ? invSam : undefined, quelle: 'Endgeräte-Übersicht' }
  }
  if (invName) return { name: invName, sam: invSam || undefined, quelle: 'Standort-Übersicht' }
  return null
}

// ── Abgleich ─────────────────────────────────────────────────────────────────

/**
 * Ist dieser angemeldete Benutzer die zugewiesene Person? Sind beide Kennungen bekannt, zählt
 * nur die Kennung (zwei Leute mit gleichem Namen, Admin-Konto der Person = anderes Konto).
 */
export function istZugewiesenePerson(b: AngemeldeterBenutzer, z: Zuweisung): boolean {
  if (z.sam) return gleich(b.sam, z.sam)
  if (gleich(b.sam, z.name)) return true          // Zuweisung enthält die Kennung
  return !!b.name && fuzzyNameMatch(b.name, z.name)
}

export function gleicheAb(angemeldet: AngemeldeterBenutzer[], zuweisung: Zuweisung | null, fehler?: string): AbgleichStufe {
  if (fehler && angemeldet.length === 0) return 'unbekannt'
  if (angemeldet.length === 0) return 'niemand'
  if (!zuweisung) return 'ohne-zuweisung'
  return angemeldet.some(b => istZugewiesenePerson(b, zuweisung)) ? 'passt' : 'fremd'
}

// ── Texte ────────────────────────────────────────────────────────────────────

const STATUS_TEXT: Record<SitzungsStatus, string> = { aktiv: 'aktiv', gesperrt: 'gesperrt', getrennt: 'getrennt', unbekannt: '' }

export function benutzerText(b: AngemeldeterBenutzer, mitStatus = true): string {
  const wer = b.name ? `${b.name} (${b.sam})` : b.konto || b.sam
  const st = mitStatus ? STATUS_TEXT[b.status] : ''
  return st ? `${wer} – ${st}` : wer
}

export function zuweisungText(z: Zuweisung | null): string {
  if (!z) return 'niemandem (keine Zuweisung bekannt)'
  return z.sam && !gleich(z.sam, z.name) ? `${z.name} (${z.sam})` : z.name
}

export const STUFE_TITEL: Record<AbgleichStufe, string> = {
  passt: 'Die zugewiesene Person ist angemeldet',
  fremd: 'Nicht die zugewiesene Person ist angemeldet',
  niemand: 'Gerade ist niemand angemeldet',
  'ohne-zuweisung': 'Gerät ist niemandem zugewiesen',
  unbekannt: 'Angemeldeter Benutzer nicht ermittelbar',
}

/** Kurzer Vermerk fürs Installations-Logbuch. */
export function vermerkText(e: AnmeldeAbgleich, bestaetigt: boolean): string {
  const wer = e.angemeldet.length ? e.angemeldet.map(b => benutzerText(b)).join(', ') : e.stufe === 'unbekannt' ? 'nicht ermittelbar' : 'niemand'
  const teil = [`Angemeldet: ${wer}`, `zugewiesen: ${zuweisungText(e.zuweisung)}`]
  if (e.stufe === 'fremd') teil.push(bestaetigt ? 'nicht dieselbe Person – Hinweis bestätigt' : 'nicht dieselbe Person')
  return teil.join(' · ')
}
