// ── Änderungsverlauf je PC: Vergleich, Ereignisse, Zusammenführen (reine Logik) ──
// Zwei Quellen, die sich ergänzen:
//   1. Was Windows selbst protokolliert (Installationen, Updates, neue Dienste, Treiber) —
//      mit genauem Zeitpunkt und schon beim ERSTEN Lesen für die letzten 14 Tage da.
//   2. Der Vergleich zweier gelesener Stände — findet auch, was Windows nirgends vermerkt
//      (Startart eines Dienstes, Autostart, feste Netzwerkeinstellungen, BIOS …), kennt aber
//      nur den Zeitraum zwischen den beiden Lesevorgängen.
// Meldet dieselbe Änderung beide Quellen, wird daraus EIN Eintrag (Vorher/Nachher + Zeitpunkt).

import type { Abschnitt, Aenderung, Art, Kat, PcDatei, RohAntwort, Stand, Zeilen } from './typen'

export const ABSCHNITTE: Abschnitt[] = ['sys', 'sw', 'swU', 'upd', 'drv', 'svc', 'auto', 'autoU', 'task', 'net', 'app']
const TAG_MS = 24 * 60 * 60 * 1000
/** So lange bleiben Änderungen gespeichert. */
export const AUFBEWAHREN_TAGE = 365
const MAX_EINTRAEGE = 3000

// Verglichen wird nur „deaktiviert oder nicht“: Zwischen Automatisch und Manuell stellt Windows
// viele Dienste selbst laufend um — das wäre Rauschen. (Ältere gespeicherte Stände nennen noch
// die genaue Startart; sie wird hier gleich behandelt, damit daraus keine Schein-Änderung wird.)
const startart = (s: string) => (s === 'Disabled' ? 'Deaktiviert' : s ? 'Aktiv' : '')

interface Spez {
  kat: Kat
  /** Spalten, die den Eintrag eindeutig machen. */
  key: (s: string[]) => string
  name: (s: string[]) => string
  /** Was verglichen wird (leer = nur „neu"/„entfernt"). */
  wert: (s: string[]) => string
  zusatz?: (s: string[]) => string
  /** Nur für Abschnitte je Benutzer: dessen Name. */
  benutzer?: (s: string[]) => string
  /** Zeitpunkt, den Windows selbst mitführt (JJJJMMTT, JJJJ-MM-TT oder ISO). */
  zeit?: (s: string[]) => string
}

const SPEZ: Record<Abschnitt, Spez> = {
  sys: { kat: 'system', key: s => s[0], name: s => s[0], wert: s => s[1] || '' },
  sw: { kat: 'software', key: s => s[0], name: s => s[0], wert: s => s[1] || '', zusatz: s => s[3] || '', zeit: s => s[2] || '' },
  swU: { kat: 'software', key: s => s[0] + '|' + s[1], name: s => s[1], wert: s => s[2] || '', zusatz: s => `nur für ${s[0]}`, benutzer: s => s[0], zeit: s => s[3] || '' },
  upd: { kat: 'update', key: s => s[0], name: s => s[0], wert: () => '', zusatz: s => s[2] || '', zeit: s => s[1] || '' },
  drv: { kat: 'treiber', key: s => s[0], name: s => s[0], wert: s => s[1] || '', zusatz: s => [s[3], s[4]].filter(Boolean).join(' · ') },
  svc: { kat: 'dienst', key: s => s[0], name: s => (s[2] && s[2] !== s[0] ? `${s[2]} (${s[0]})` : s[0]), wert: s => startart(s[1] || '') },
  auto: { kat: 'autostart', key: s => s[0] + '|' + s[1], name: s => s[1], wert: s => s[2] || '', zusatz: s => s[0] },
  autoU: { kat: 'autostart', key: s => s[0] + '|' + s[1], name: s => s[1], wert: s => s[2] || '', zusatz: s => `nur für ${s[0]}`, benutzer: s => s[0] },
  task: { kat: 'aufgabe', key: s => s[0], name: s => s[0].replace(/^\\/, ''), wert: () => '', zeit: s => s[1] || '' },
  net: {
    kat: 'netz', key: s => s[0], name: s => s[0],
    wert: s => (s[0] === 'hosts-Datei' ? `${s[1] || '0'} Einträge` : [s[1], s[2]].filter(Boolean).join(', ')),
    zeit: s => (s[0] === 'hosts-Datei' ? s[2] || '' : ''),
  },
  app: { kat: 'app', key: s => s[0], name: s => appName(s[0]), wert: s => s[1] || '' },
}

/** „MSTeams" → „Microsoft Teams (neu)" usw.; sonst der Paketname ohne Herausgeber-Präfix. */
function appName(paket: string): string {
  const bekannt: Record<string, string> = {
    MSTeams: 'Microsoft Teams (neu)', 'Microsoft.OutlookForWindows': 'Outlook (neu)', 'Microsoft.CompanyPortal': 'Unternehmensportal',
    'Microsoft.MicrosoftEdge.Stable': 'Microsoft Edge', 'Microsoft.OneDriveSync': 'OneDrive', 'Microsoft.Office.OneNote': 'OneNote',
  }
  return bekannt[paket] || paket
}

/** JJJJMMTT / JJJJ-MM-TT / ISO → Millisekunden (NaN, wenn unlesbar). */
function zeitMs(z: string): number {
  if (!z) return NaN
  if (/^\d{8}$/.test(z)) return new Date(+z.slice(0, 4), +z.slice(4, 6) - 1, +z.slice(6, 8), 12).getTime()
  if (/^\d{4}-\d{2}-\d{2}$/.test(z)) return new Date(+z.slice(0, 4), +z.slice(5, 7) - 1, +z.slice(8, 10), 12).getTime()
  return new Date(z).getTime()
}
/** Auf „JJJJ-MM-TT" bringen, wenn die Quelle nur den Tag kennt; ISO bleibt ISO. */
function zeitNorm(z: string): string {
  if (/^\d{8}$/.test(z)) return `${z.slice(0, 4)}-${z.slice(4, 6)}-${z.slice(6, 8)}`
  return z
}

/** Zeitpunkt einer Änderung für Sortierung und „letzte 14 Tage". */
export function zeitpunkt(a: Aenderung): number {
  const t = a.am ? zeitMs(a.am) : NaN
  return isNaN(t) ? new Date(a.bis).getTime() : t
}

/** Kennt die Änderung den genauen Tag (bzw. die Uhrzeit)? */
export function genau(a: Aenderung): 'zeit' | 'tag' | 'zeitraum' {
  if (!a.am) return 'zeitraum'
  return a.am.length > 10 ? 'zeit' : 'tag'
}

const norm = (s: string) => (s || '').toLowerCase().replace(/\(r\)|\(tm\)|®|™/g, '').replace(/[^a-z0-9äöüß]+/g, '')
const kb = (s: string) => (s.match(/KB\d{6,}/i)?.[0] || '').toUpperCase()

/** Schlüssel, unter dem dieselbe Änderung aus beiden Quellen zusammenfindet. */
export function kanon(a: Aenderung): string[] {
  if (a.kat === 'update') { const k = kb(a.name) || kb(a.key || ''); return k ? [`update|${k}`] : [`update|${norm(a.name)}`] }
  const aus = [`${a.kat}|${norm(a.name)}`]
  if (a.key && norm(a.key) !== norm(a.name)) aus.push(`${a.kat}|${norm(a.key)}`)
  return aus
}

function mkId(kat: Kat, art: Art, key: string, alt = '', neu = '', wann = ''): string {
  return [kat, art, key, alt, neu, wann].join('|').slice(0, 300)
}

export function standAus(r: RohAntwort): Stand {
  const s = { am: r.am, hash: r.hash, benutzer: Array.isArray(r.benutzer) ? r.benutzer : [] } as Stand
  for (const a of ABSCHNITTE) { const z = r[a]; s[a] = Array.isArray(z) ? z.filter(x => typeof x === 'string') : null }
  return s
}

interface Gruppe { werte: Set<string>; zeile: string[] }
function gruppiere(zeilen: string[], sp: Spez, nurBenutzer?: Set<string>): Map<string, Gruppe> {
  const m = new Map<string, Gruppe>()
  for (const z of zeilen) {
    const s = z.split('\t')
    if (sp.benutzer && nurBenutzer && !nurBenutzer.has(sp.benutzer(s).toLowerCase())) continue
    const k = sp.key(s)
    if (!k) continue
    const g = m.get(k) || { werte: new Set<string>(), zeile: s }
    g.werte.add(sp.wert(s)); g.zeile = s
    m.set(k, g)
  }
  return m
}
const liste = (s: Set<string>) => [...s].filter(Boolean).sort().join(' / ')

/** Was ist zwischen zwei gelesenen Ständen anders? Nicht lesbare Abschnitte werden übersprungen. */
export function vergleiche(alt: Stand, neu: Stand): Aenderung[] {
  const aus: Aenderung[] = []
  const von = alt.am, bis = neu.am
  const vonMs = new Date(von).getTime() - TAG_MS, bisMs = new Date(bis).getTime() + TAG_MS
  // Abschnitte je Benutzer nur für Benutzer vergleichen, die BEIDE Male angemeldet waren
  const beide = new Set(alt.benutzer.map(b => b.toLowerCase()).filter(b => neu.benutzer.some(n => n.toLowerCase() === b)))
  for (const ab of ABSCHNITTE) {
    const a = alt[ab], n = neu[ab]
    if (!a || !n) continue
    const sp = SPEZ[ab]
    const ga = gruppiere(a, sp, sp.benutzer ? beide : undefined), gn = gruppiere(n, sp, sp.benutzer ? beide : undefined)
    const eintrag = (art: Art, key: string, g: Gruppe, altW: string, neuW: string) => {
      const z = sp.zeit ? sp.zeit(g.zeile) : ''
      const t = zeitMs(z)
      const am = art !== 'entfernt' && !isNaN(t) && t >= vonMs && t <= bisMs ? zeitNorm(z) : undefined
      aus.push({ id: mkId(sp.kat, art, key, altW, neuW, bis.slice(0, 10)), kat: sp.kat, art, name: sp.name(g.zeile), key, alt: altW || undefined, neu: neuW || undefined, am, von, bis, quelle: 'vergleich', zusatz: sp.zusatz?.(g.zeile) || undefined })
    }
    for (const [k, g] of gn) {
      const v = ga.get(k)
      if (!v) { eintrag('neu', k, g, '', liste(g.werte)); continue }
      const a1 = liste(v.werte), n1 = liste(g.werte)
      if (a1 !== n1) eintrag('geaendert', k, g, a1, n1)
    }
    for (const [k, g] of ga) if (!gn.has(k)) eintrag('entfernt', k, g, liste(g.werte), '')
  }
  // Modell ändert sich nicht — ein anderes Modell heißt: der Hostname gehört jetzt einem anderen Gerät
  return aus
}

/** Erstes Lesen: aus den Datumsangaben, die Windows mitführt (Installationsdatum, Update-Datum …). */
export function ausErstkontakt(stand: Stand, tage: number, jetzt: Date): Aenderung[] {
  const aus: Aenderung[] = []
  const ab = jetzt.getTime() - tage * TAG_MS
  for (const sec of ['sw', 'swU', 'upd', 'task', 'net'] as Abschnitt[]) {
    const sp = SPEZ[sec], z = stand[sec]
    if (!z || !sp.zeit) continue
    for (const [k, g] of gruppiere(z, sp)) {
      const zt = sp.zeit(g.zeile), t = zeitMs(zt)
      if (isNaN(t) || t < ab || t > jetzt.getTime() + TAG_MS) continue
      // hosts-Datei: „geändert", alles andere: neu bzw. aktualisiert (das Vorher kennt Windows nicht)
      const art: Art = sec === 'net' ? 'geaendert' : 'neu'
      const w = liste(g.werte)
      aus.push({ id: mkId(sp.kat, art, k, '', w, zeitNorm(zt).slice(0, 10)), kat: sp.kat, art, name: sp.name(g.zeile), key: k, neu: w || undefined, am: zeitNorm(zt), bis: stand.am, quelle: 'windows', zusatz: sp.zusatz?.(g.zeile) || undefined })
    }
  }
  return aus
}

/** Ereignis-Zeilen des PCs („Zeit⇥Art⇥Name⇥…") → Änderungen. */
export function ausEreignissen(ev: string[], bis: string): Aenderung[] {
  const aus: Aenderung[] = []
  const z = ev.map(e => e.split('\t')).filter(s => s.length >= 3 && !isNaN(new Date(s[0]).getTime()))
  const mk = (kat: Kat, art: Art, s: string[], extra: Partial<Aenderung>): Aenderung => ({
    id: mkId(kat, art, s[2], extra.alt, extra.neu, s[0].slice(0, 13)), kat, art, name: s[2], am: s[0], bis, quelle: 'windows', ...extra,
  })
  // Installationen: Entfernen + Installieren desselben Programms kurz nacheinander = Aktualisierung
  const plus = z.filter(s => s[1] === 'MSI+'), minus = z.filter(s => s[1] === 'MSI-')
  const verbraucht = new Set<string[]>()
  const gesehen = new Set<string>()
  for (const p of plus) {
    const stunde = `${p[2]}|${p[3]}|${p[0].slice(0, 13)}`
    if (gesehen.has(stunde)) continue
    gesehen.add(stunde)
    const t = new Date(p[0]).getTime()
    const m = minus.find(x => !verbraucht.has(x) && x[2] === p[2] && Math.abs(new Date(x[0]).getTime() - t) <= 15 * 60_000)
    if (m) verbraucht.add(m)
    if (m && m[3] !== p[3]) aus.push(mk('software', 'geaendert', p, { alt: m[3] || undefined, neu: p[3] || undefined, zusatz: p[4] || undefined }))
    else aus.push(mk('software', 'neu', p, { neu: p[3] || undefined, zusatz: [p[4], m ? 'erneut installiert' : ''].filter(Boolean).join(' · ') || undefined }))
  }
  for (const m of minus) if (!verbraucht.has(m)) aus.push(mk('software', 'entfernt', m, { alt: m[3] || undefined, zusatz: m[4] || undefined }))
  const pnp = new Set<string>()
  const treiber = z.filter(s => s[1] === 'PNP')
  // Treiber, die über Windows Update kamen, stehen doppelt da (Update + Geräte-Einrichtung) → nur der Treiber
  const perUpdate = (t: string[]) => z.some(w => w[1] === 'WU' && !!t[3] && w[2].includes(t[3]) && Math.abs(new Date(w[0]).getTime() - new Date(t[0]).getTime()) <= 10 * 60_000)
  const dienste = new Set<string>()
  for (const s of z) {
    if (s[1] === 'SVC+') {
      // Derselbe Dienst mehrfach (jede neue Programmversion legt ihn neu an) → je Tag einmal
      const k = `${s[2]}|${s[0].slice(0, 10)}`
      if (dienste.has(k)) continue
      dienste.add(k)
      aus.push(mk('dienst', 'neu', s, { key: s[2], zusatz: s[3] || undefined }))
    }
    else if (s[1] === 'KRN+') aus.push(mk('treiber', 'neu', s, { key: s[2], zusatz: ['Kernel-Treiber', s[3]].filter(Boolean).join(' · ') }))
    else if (s[1] === 'WU') {
      if (treiber.some(t => !!t[3] && s[2].includes(t[3]) && Math.abs(new Date(t[0]).getTime() - new Date(s[0]).getTime()) <= 10 * 60_000)) continue
      aus.push(mk('update', 'neu', s, {}))
    }
    else if (s[1] === 'PNP') {
      const k = `${s[2]}|${s[3]}|${s[0].slice(0, 10)}`
      if (pnp.has(k)) continue
      pnp.add(k)
      aus.push(mk('treiber', 'neu', s, { neu: s[3] || undefined, zusatz: [s[4], perUpdate(s) ? 'über Windows Update' : ''].filter(Boolean).join(' · ') || undefined }))
    }
  }
  return aus
}

/** Dieselbe Änderung aus Windows-Protokoll und Vergleich → ein Eintrag. */
function verschmelze(a: Aenderung, b: Aenderung): Aenderung {
  const v = a.quelle === 'vergleich' ? a : b.quelle === 'vergleich' ? b : null
  const w = v === a ? b : a
  if (!v) {
    // beide aus Windows (z. B. Installationsdatum + Installer-Ereignis): den genaueren Zeitpunkt behalten
    const besser = (a.am || '').length >= (b.am || '').length ? a : b, anderer = besser === a ? b : a
    return { ...anderer, ...besser, name: besser.name.length >= anderer.name.length ? besser.name : anderer.name, alt: besser.alt || anderer.alt, neu: besser.neu || anderer.neu, art: besser.art === 'geaendert' || anderer.art !== 'geaendert' ? besser.art : anderer.art, zusatz: besser.zusatz || anderer.zusatz }
  }
  const am = (w.am || '').length >= (v.am || '').length ? w.am : v.am
  return {
    ...v, am, quelle: 'beides',
    name: a.kat === 'update' && w.name.length > v.name.length ? w.name : v.name,
    alt: v.alt || w.alt, neu: v.neu || w.neu, zusatz: v.zusatz || w.zusatz,
  }
}

function passtZeitlich(a: Aenderung, b: Aenderung): boolean {
  const spanne = (x: Aenderung): [number, number] => {
    if (x.am) { const t = zeitMs(x.am); const halb = x.am.length > 10 ? 0 : TAG_MS / 2; return [t - halb, t + halb] }
    return [new Date(x.von || x.bis).getTime(), new Date(x.bis).getTime()]
  }
  const [a1, a2] = spanne(a), [b1, b2] = spanne(b)
  return a1 <= b2 + TAG_MS && b1 <= a2 + TAG_MS
}

/** Neue Änderungen zu den gespeicherten: Doppelte raus, beide Quellen zusammenführen, Altes verwerfen. */
export function fuegeHinzu(vorhanden: Aenderung[], neue: Aenderung[], jetzt: Date): Aenderung[] {
  const aus = [...vorhanden]
  const ids = new Set(aus.map(a => a.id))
  const nachKanon = new Map<string, number[]>()
  const merke = (a: Aenderung, i: number) => { for (const k of kanon(a)) { const l = nachKanon.get(k) || []; l.push(i); nachKanon.set(k, l) } }
  aus.forEach(merke)
  for (const n of neue) {
    if (ids.has(n.id)) continue
    let ziel = -1
    for (const k of kanon(n)) {
      for (const i of nachKanon.get(k) || []) {
        const e = aus[i]
        if (!passtZeitlich(e, n)) continue
        // „entfernt" und „neu" derselben Sache sind zwei verschiedene Vorgänge — außer eine Seite kennt Vorher UND Nachher
        const vertraeglich = e.art === n.art || e.art === 'geaendert' || n.art === 'geaendert'
        if (!vertraeglich) continue
        if (e.quelle === n.quelle && e.quelle === 'vergleich') continue
        ziel = i; break
      }
      if (ziel >= 0) break
    }
    if (ziel >= 0) { aus[ziel] = verschmelze(aus[ziel], n); merke(aus[ziel], ziel) }
    else { aus.push(n); merke(n, aus.length - 1) }
    ids.add(n.id)
  }
  const grenze = jetzt.getTime() - AUFBEWAHREN_TAGE * TAG_MS
  return aus.filter(a => zeitpunkt(a) >= grenze).sort((a, b) => zeitpunkt(b) - zeitpunkt(a)).slice(0, MAX_EINTRAEGE)
}

/** Antwort eines PCs einarbeiten. `null` zurück = Antwort „unverändert", aber hier fehlt der Stand → voll neu lesen. */
export function uebernehme(datei: PcDatei | null, roh: RohAntwort, jetzt: Date): PcDatei | null {
  if (roh.gleich && !datei?.stand) return null
  const neue = ausEreignissen(Array.isArray(roh.ev) ? roh.ev : [], roh.am)
  let stand = datei?.stand || null
  if (!roh.gleich) {
    const frisch = standAus(roh)
    if (stand) {
      neue.push(...vergleiche(stand, frisch))
      // Was sich diesmal nicht lesen ließ, bleibt als Vergleichsbasis erhalten
      for (const a of ABSCHNITTE) if (frisch[a] == null) (frisch as Zeilen)[a] = stand[a]
    } else {
      neue.push(...ausErstkontakt(frisch, 14, jetzt))
    }
    stand = frisch
  } else if (stand) {
    stand = { ...stand, am: roh.am }
  }
  return {
    v: 1, host: roh.host, erstAm: datei?.erstAm || roh.am, gelesenAm: roh.am, evBis: roh.am, stand,
    aenderungen: fuegeHinzu(datei?.aenderungen || [], neue, jetzt),
  }
}

/** Änderungen der letzten `tage` Tage, neueste zuerst. */
export function letzteTage(liste: Aenderung[], tage: number, jetzt = new Date()): Aenderung[] {
  const ab = jetzt.getTime() - tage * TAG_MS
  return liste.filter(a => zeitpunkt(a) >= ab).sort((a, b) => zeitpunkt(b) - zeitpunkt(a))
}

/** gzip+Base64 des PCs → Antwort. */
export async function entpacke(b64: string): Promise<RohAntwort> {
  const bin = atob(b64.trim())
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const strom = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(strom).text()
  return JSON.parse(text.replace(/^﻿/, '')) as RohAntwort
}

export type Antwort =
  | { host: string; art: 'ok'; roh: RohAntwort; bytes: number }
  | { host: string; art: 'aus' }
  | { host: string; art: 'fehler'; text: string }

/** Ausgabe des Leseskripts → je PC eine Antwort. */
export async function leseAusgabe(stdout: string, tag: string): Promise<Antwort[]> {
  const aus: Antwort[] = []
  for (const zeile of (stdout || '').split(/\r?\n/)) {
    const z = zeile.trim()
    if (!z.startsWith(tag)) continue
    const [host, art, ...rest] = z.slice(tag.length).split('|')
    if (!host) continue
    if (art === 'AUS') aus.push({ host, art: 'aus' })
    else if (art === 'FEHLER') aus.push({ host, art: 'fehler', text: rest.join('|').slice(0, 300) })
    else if (art === 'OK') {
      try { const b = rest.join('|'); aus.push({ host, art: 'ok', roh: await entpacke(b), bytes: Math.round(b.length * 0.75) }) }
      catch { aus.push({ host, art: 'fehler', text: 'Antwort des PCs unlesbar.' }) }
    }
  }
  return aus
}
