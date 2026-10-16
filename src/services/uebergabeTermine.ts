// ── Übergabe-Termine (Checklisten) ────────────────────────────────────────────
// Termin je Checkliste (oder frei eingetragen) im gemeinsamen Kalender
// checklists/uebergabe-termine.json — für alle Admins sichtbar. Jede Änderung wird mit
// der Kennung des Bearbeiters protokolliert (verlauf + Notizen).
//
// Outlook (electron/outlookAktion.ts): echte Besprechungsanfrage an den Mitarbeiter,
// IT-Support als optionaler Teilnehmer (= „CC"); Verschieben/Absagen schickt ein Update.
// Postfach-Scan: Antworten der Mitarbeiter (eigenes Postfach + IT-Support-Postfach) →
// Zu-/Absage, Outlook-„Neue Zeit vorschlagen" oder Freitext („Freitag ab 10") →
// eindeutige Vorschläge werden automatisch umgetragen, der Rest als Vorschlag angezeigt.

import { api } from '../electronAPI'
import { batchAdLookup } from './adUserLookup'
import { readCentralAdUsers, buildNameIndex, lookupUserByName } from './adUserDirectory'
import { leseTerminVorschlag, leseAbsicht } from './terminParser'
import type { Checklist } from './checklists'

export const TERMIN_DATEI = 'checklists/uebergabe-termine.json'
export const IT_SUPPORT_MAIL = 'support.marine@skf.com'
export const RAEUME = ['E10', 'E11']

export type TerminStatus = 'geplant' | 'zugesagt' | 'abgesagt' | 'verschoben' | 'erledigt' | 'storniert'
export type TerminArt = 'neu' | 'refresh' | 'eigener'

export interface TerminNotiz { text: string; by: string; at: string }
export interface TerminVerlauf { text: string; by: string; at: string }
export interface MailVorschlag {
  mailId: string; von: string; empfangen: string; betreff: string; auszug: string
  start?: string; ende?: string; fundstelle?: string
  quelle: 'outlook' | 'text'; art: 'vorschlag' | 'absage' | 'zusage' | 'unklar'
  erledigt?: 'uebernommen' | 'verworfen'; erledigtBy?: string; erledigtAt?: string
}

export interface UebergabeTermin {
  id: string
  checklistId?: string
  titel: string                 // z. B. „Übergabe Max Muster" oder frei
  name: string
  corpId?: string
  email?: string
  art: TerminArt
  start: string                 // lokal „YYYY-MM-DDTHH:mm"
  ende: string
  raum: string
  status: TerminStatus
  /** Outlook-Termin (Besprechungsanfrage). geoeffnet = nur im Outlook-Fenster geöffnet, Absenden nicht bestätigt. */
  outlook?: { entryId: string; globalId?: string; gesendetAt: string; gesendetBy: string; veraltet?: boolean; geoeffnet?: boolean }
  /** Wie die Übergabe-Nachricht rausging: als Termin oder als reine Mail, direkt gesendet oder in Outlook geöffnet. */
  nachricht?: { art: 'termin' | 'mail'; weg: 'gesendet' | 'geoeffnet'; at: string; by: string; an: string }
  ersteAnmeldung?: { at: string; by: string; raum: string; weg?: 'gesendet' | 'geoeffnet' }
  notizen: TerminNotiz[]
  verlauf: TerminVerlauf[]
  vorschlaege: MailVorschlag[]
  createdBy: string; createdAt: string
  updatedBy?: string; updatedAt?: string
}

export interface TerminStore {
  version: 1
  termine: UebergabeTermin[]
  verarbeiteteMails: string[]
  letzterScan?: { at: string; by: string; treffer: number; fehler?: string[] }
  einstellungen?: { autoUebernehmen?: boolean; postfaecher?: string[] }
}

// ── Zeit-Helfer (lokale Zeit ohne Zeitzone) ───────────────────────────────────
const p2 = (n: number) => String(n).padStart(2, '0')
export function lokal(d: Date): string { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}` }
export function ausLokal(s: string): Date { const [d, t = '00:00'] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi) }
const outlookZeit = (s: string) => s.replace('T', ' ')
const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
export function zeitraumText(start: string, ende: string, kurz = false): string {
  const a = ausLokal(start), b = ausLokal(ende)
  const datum = `${kurz ? WT[a.getDay()].slice(0, 2) + '.' : WT[a.getDay()] + ','} ${p2(a.getDate())}.${p2(a.getMonth() + 1)}.${a.getFullYear()}`
  return kurz ? `${datum} ${p2(a.getHours())}:${p2(a.getMinutes())}–${p2(b.getHours())}:${p2(b.getMinutes())}`
    : `${datum} zwischen ${p2(a.getHours())}:${p2(a.getMinutes())} und ${p2(b.getHours())}:${p2(b.getMinutes())} Uhr`
}
const neueId = () => `ut_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
const jetzt = () => new Date().toISOString()

// ── Speicher ──────────────────────────────────────────────────────────────────
const LEER: TerminStore = { version: 1, termine: [], verarbeiteteMails: [] }

export async function ladeTermine(): Promise<TerminStore> {
  try {
    const s = await api().netReadJson<TerminStore>(TERMIN_DATEI)
    if (s && Array.isArray(s.termine)) return { ...LEER, ...s, verarbeiteteMails: s.verarbeiteteMails ?? [] }
  } catch { /* leer */ }
  return { ...LEER, termine: [] }
}

/** Frisch laden → ändern → schreiben (mehrere Admins arbeiten parallel). */
async function aendere(fn: (s: TerminStore) => TerminStore | void): Promise<TerminStore | null> {
  const s = await ladeTermine()
  const neu = fn(s) || s
  try { return (await api().netWriteJson(TERMIN_DATEI, neu)) ? neu : null } catch { return null }
}

export async function aendereTermin(id: string, by: string, patch: Partial<UebergabeTermin>, verlaufText?: string): Promise<TerminStore | null> {
  return aendere(s => {
    const t = s.termine.find(x => x.id === id); if (!t) return
    Object.assign(t, patch, { updatedBy: by, updatedAt: jetzt() })
    if (verlaufText) t.verlauf.push({ text: verlaufText, by, at: jetzt() })
  })
}

export async function neuerTermin(t: Omit<UebergabeTermin, 'id' | 'notizen' | 'verlauf' | 'vorschlaege' | 'createdAt'> & { notiz?: string }): Promise<{ store: TerminStore | null; termin: UebergabeTermin }> {
  const termin: UebergabeTermin = {
    ...t, id: neueId(), notizen: t.notiz ? [{ text: t.notiz, by: t.createdBy, at: jetzt() }] : [],
    verlauf: [{ text: `Termin angelegt: ${zeitraumText(t.start, t.ende, true)}, Raum ${t.raum}`, by: t.createdBy, at: jetzt() }],
    vorschlaege: [], createdAt: jetzt(),
  }
  delete (termin as { notiz?: string }).notiz
  const store = await aendere(s => { s.termine.push(termin) })
  return { store, termin }
}

export async function notizHinzufuegen(id: string, text: string, by: string): Promise<TerminStore | null> {
  return aendere(s => { const t = s.termine.find(x => x.id === id); if (t && text.trim()) t.notizen.push({ text: text.trim(), by, at: jetzt() }) })
}

export async function loescheTermin(id: string): Promise<TerminStore | null> {
  return aendere(s => { s.termine = s.termine.filter(x => x.id !== id) })
}

export async function speichereEinstellungen(e: TerminStore['einstellungen']): Promise<TerminStore | null> {
  return aendere(s => { s.einstellungen = { ...s.einstellungen, ...e } })
}

/** Aktueller (nicht stornierter) Termin einer Checkliste. */
export function terminVon(store: TerminStore | null, checklistId: string): UebergabeTermin | undefined {
  return [...(store?.termine ?? [])].reverse().find(t => t.checklistId === checklistId && t.status !== 'storniert')
}

// ── Empfänger ─────────────────────────────────────────────────────────────────
/** Mailadresse des Mitarbeiters: AD über Corp-ID (UPN-Fallback steckt in batchAdLookup), sonst zentrales AD-Verzeichnis per Name. */
export async function emailFuer(name: string, corpId?: string): Promise<string> {
  if (corpId?.trim()) {
    try { const r = await batchAdLookup([corpId.trim()]); const e = r.get(corpId.trim())?.email; if (e) return e } catch { /* weiter */ }
  }
  try {
    const dir = await readCentralAdUsers()
    if (dir) { const hit = lookupUserByName(buildNameIndex(dir.users), name); if (hit?.email) return hit.email }
  } catch { /* leer */ }
  return ''
}

// ── Texte ─────────────────────────────────────────────────────────────────────
function vorname(name: string): string {
  const s = (name || '').trim()
  if (s.includes(',')) return s.split(',')[1].trim().split(/\s+/)[0] || s
  return s.split(/\s+/)[0] || s
}

/** mitTermin = als Outlook-Termin (Hinweis „Neue Zeit vorschlagen"); false = reine Mail. */
export function baueEinladung(o: { name: string; art: TerminArt; start: string; ende: string; raum: string; bearbeiter: string; mitTermin?: boolean }): { subject: string; body: string } {
  const wann = zeitraumText(o.start, o.ende)
  const refresh = o.art === 'refresh'
  const zeilen = [
    `Hallo ${vorname(o.name)},`,
    '',
    refresh
      ? `dein neuer Rechner ist bereit und ersetzt dein bisheriges Gerät. Die Übergabe findet am ${wann} im Raum ${o.raum} statt – komm einfach in diesem Zeitraum vorbei.`
      : `dein neuer Rechner ist bereit. Die Übergabe findet am ${wann} im Raum ${o.raum} statt – komm einfach in diesem Zeitraum vorbei.`,
    '',
    refresh
      ? 'Bitte bring dein bisheriges Gerät (Altgerät) sowie dein Handy (zwecks Authentifizierung) mit.'
      : 'Bitte bring dein Handy (zwecks Authentifizierung) mit.',
    '',
    o.mitTermin === false
      ? 'Falls du es in diesem Zeitraum nicht schaffst, gib uns bitte kurz Bescheid und nenne uns einen alternativen Terminvorschlag – einfach auf diese Mail antworten.'
      : 'Falls du es in diesem Zeitraum nicht schaffst, gib uns bitte kurz Bescheid und nenne uns einen alternativen Terminvorschlag – einfach auf diese Einladung antworten oder in Outlook „Neue Zeit vorschlagen" nutzen.',
    '',
    'Viele Grüße',
    o.bearbeiter,
    'IT-Support · SKF Marine',
  ]
  const kurz = zeitraumText(o.start, o.ende, true)
  return { subject: `${refresh ? 'Austausch deines Rechners' : 'Übergabe deines neuen Rechners'} – ${kurz} Uhr, Raum ${o.raum}`, body: zeilen.join('\n') }
}

export function baueErstanmeldeMail(o: { name: string; raum: string; bearbeiter: string; wann?: string }): { subject: string; body: string } {
  return {
    subject: 'Kurz vorbeikommen: erste Anmeldung an deinem neuen Rechner',
    body: [
      `Hallo ${vorname(o.name)},`,
      '',
      'damit dein neuer Rechner schon vorab deine persönliche Software installieren kann, musst du dich einmal kurz selbst daran anmelden.',
      '',
      `Bitte komm dafür ${o.wann?.trim() ? o.wann.trim() + ' ' : ''}kurz in Raum ${o.raum} vorbei – das dauert nur wenige Minuten. Bitte bring dein Handy (zwecks Authentifizierung) mit.`,
      '',
      'Falls es dir gerade nicht passt, gib uns bitte kurz Bescheid, wann du vorbeikommen kannst.',
      '',
      'Viele Grüße',
      o.bearbeiter,
      'IT-Support · SKF Marine',
    ].join('\n'),
  }
}

// ── Outlook ───────────────────────────────────────────────────────────────────
/** anzeigen = Termin nur im Outlook-Fenster öffnen (Benutzer prüft und sendet selbst). */
export async function sendeEinladung(o: { to: string; cc: string; subject: string; body: string; start: string; ende: string; raum: string; anzeigen?: boolean }): Promise<{ ok: boolean; entryId?: string; globalId?: string; error?: string }> {
  const r = await api().outlookAktion({
    aktion: 'meeting-create', anzeigen: !!o.anzeigen, subject: o.subject, body: o.body, location: `Raum ${o.raum}`,
    start: outlookZeit(o.start), end: outlookZeit(o.ende),
    required: [o.to], optional: o.cc.split(/[;,]/).map(x => x.trim()).filter(Boolean),
  })
  return r.ok ? { ok: true, entryId: String(r.entryId || ''), globalId: String(r.globalId || '') } : { ok: false, error: String(r.error || 'Outlook-Fehler') }
}

export async function aktualisiereEinladung(t: UebergabeTermin, bearbeiter: string): Promise<{ ok: boolean; error?: string }> {
  if (!t.outlook?.entryId) return { ok: false, error: 'Zu diesem Termin gibt es keine Outlook-Einladung.' }
  const txt = t.art === 'eigener' ? null : baueEinladung({ name: t.name, art: t.art, start: t.start, ende: t.ende, raum: t.raum, bearbeiter })
  const r = await api().outlookAktion({
    aktion: 'meeting-update', entryId: t.outlook.entryId, start: outlookZeit(t.start), end: outlookZeit(t.ende),
    location: `Raum ${t.raum}`, ...(txt ? { subject: txt.subject, body: txt.body } : {}),
  })
  return r.ok ? { ok: true } : { ok: false, error: String(r.error || 'Outlook-Fehler') }
}

export async function sageEinladungAb(t: UebergabeTermin): Promise<{ ok: boolean; error?: string }> {
  if (!t.outlook?.entryId) return { ok: true }
  const r = await api().outlookAktion({ aktion: 'meeting-cancel', entryId: t.outlook.entryId })
  return r.ok ? { ok: true } : { ok: false, error: String(r.error || 'Outlook-Fehler') }
}

export async function sendeMail(to: string, cc: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const r = await api().sendEmailRaw({ to, cc, subject, body, smtp: '', port: 587 })
  return r.success ? { ok: true } : { ok: false, error: r.error || 'Senden fehlgeschlagen' }
}

/** Mail nur im Outlook-Fenster öffnen (Benutzer prüft und sendet selbst). */
export async function oeffneMail(to: string, cc: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const r = await api().composeEmail({ to, cc, subject, body })
  return r.success ? { ok: true } : { ok: false, error: r.fallback ? 'Outlook nicht erreichbar — es wurde ein einfaches Mailfenster (mailto) geöffnet.' : 'Outlook-Fenster konnte nicht geöffnet werden.' }
}

// ── Postfach-Scan ─────────────────────────────────────────────────────────────
interface ScanTreffer { id: string; postfach: string; von: string; betreff: string; empfangen: string; klasse: number; text: string; vorschlagStart: string; vorschlagEnde: string }

const OFFEN: TerminStatus[] = ['geplant', 'zugesagt', 'verschoben', 'abgesagt']

export async function postfachScan(by: string, tage = 21): Promise<{ ok: boolean; store?: TerminStore | null; neu: number; umgetragen: number; error?: string; hinweise?: string[] }> {
  const vorher = await ladeTermine()
  const grenze = Date.now() - 86400000
  const aktiv = vorher.termine.filter(t => OFFEN.includes(t.status) && t.email && ausLokal(t.ende).getTime() > grenze)
  if (!aktiv.length) return { ok: true, store: vorher, neu: 0, umgetragen: 0, hinweise: ['Keine offenen Termine mit Mailadresse — nichts zu prüfen.'] }
  const absender = [...new Set(aktiv.map(t => t.email!.toLowerCase()))]
  const postfaecher = vorher.einstellungen?.postfaecher ?? [IT_SUPPORT_MAIL]
  const r = await api().outlookAktion({ aktion: 'scan', tage, maxItems: 1500, absender, postfaecher }, 180000)
  if (!r.ok) return { ok: false, neu: 0, umgetragen: 0, error: String(r.error || 'Postfach konnte nicht gelesen werden') }
  const treffer = (Array.isArray(r.treffer) ? r.treffer : []) as ScanTreffer[]
  const auto = vorher.einstellungen?.autoUebernehmen !== false
  let neu = 0, umgetragen = 0

  const store = await aendere(s => {
    const bekannt = new Set(s.verarbeiteteMails)
    // älteste zuerst, damit die neueste Antwort am Ende gewinnt
    for (const m of [...treffer].sort((a, b) => a.empfangen.localeCompare(b.empfangen))) {
      if (bekannt.has(m.id)) continue
      const empfangen = ausLokal(m.empfangen.replace(' ', 'T'))
      const t = [...s.termine].reverse().find(x => OFFEN.includes(x.status) && x.email?.toLowerCase() === m.von
        && (!x.outlook?.gesendetAt || empfangen.getTime() >= new Date(x.outlook.gesendetAt).getTime() - 60000))
      bekannt.add(m.id); s.verarbeiteteMails.push(m.id)
      if (!t) continue
      neu++
      const auszug = m.text.replace(/\s+/g, ' ').trim().slice(0, 400)
      const basis = { mailId: m.id, von: m.von, empfangen: m.empfangen, betreff: m.betreff, auszug }
      let v: MailVorschlag
      if (m.vorschlagStart && m.vorschlagEnde) {
        v = { ...basis, quelle: 'outlook', art: 'vorschlag', start: m.vorschlagStart.replace(' ', 'T'), ende: m.vorschlagEnde.replace(' ', 'T'), fundstelle: 'Outlook „Neue Zeit vorschlagen"' }
      } else {
        const tv = leseTerminVorschlag(m.text, empfangen, { start: ausLokal(t.start), ende: ausLokal(t.ende) })
        const absicht = m.klasse === 55 ? 'absage' : m.klasse === 56 ? 'zusage' : leseAbsicht(m.text)
        v = tv ? { ...basis, quelle: 'text', art: 'vorschlag', start: lokal(tv.start), ende: lokal(tv.ende), fundstelle: tv.fundstelle + (tv.eindeutig ? '' : ' (nicht eindeutig)') }
          : { ...basis, quelle: 'text', art: absicht }
        if (!tv && absicht === 'zusage' && t.status === 'geplant') { t.status = 'zugesagt'; t.verlauf.push({ text: `Zusage erkannt (Mail vom ${m.empfangen})`, by: `Postfach-Scan (${by})`, at: jetzt() }); v.erledigt = 'uebernommen' }
        if (!tv && absicht === 'absage') { t.status = 'abgesagt'; t.verlauf.push({ text: `Absage ohne neuen Vorschlag erkannt (Mail vom ${m.empfangen}) — bitte nachfassen`, by: `Postfach-Scan (${by})`, at: jetzt() }) }
        if (tv && auto && tv.eindeutig) v.erledigt = 'uebernommen'
      }
      if (v.quelle === 'outlook' && auto) v.erledigt = 'uebernommen'
      if (v.art === 'vorschlag' && v.erledigt === 'uebernommen' && v.start && v.ende) {
        const alt = zeitraumText(t.start, t.ende, true)
        t.start = v.start; t.ende = v.ende; t.status = 'verschoben'
        if (t.outlook) t.outlook.veraltet = true
        t.verlauf.push({ text: `Automatisch umgetragen: ${alt} → ${zeitraumText(v.start, v.ende, true)} (Mail von ${m.von}, ${m.empfangen}: „${v.fundstelle}")`, by: `Postfach-Scan (${by})`, at: jetzt() })
        t.updatedBy = `Postfach-Scan (${by})`; t.updatedAt = jetzt()
        v.erledigtBy = `Postfach-Scan (${by})`; v.erledigtAt = jetzt()
        umgetragen++
      }
      t.vorschlaege.push(v)
    }
    s.letzterScan = { at: jetzt(), by, treffer: neu, fehler: Array.isArray(r.fehler) ? (r.fehler as string[]) : undefined }
  })
  return { ok: true, store, neu, umgetragen, hinweise: Array.isArray(r.fehler) ? (r.fehler as string[]) : undefined }
}

/** Offenen Vorschlag übernehmen (verschiebt den Termin) oder verwerfen. */
export async function vorschlagEntscheiden(terminId: string, mailId: string, uebernehmen: boolean, by: string): Promise<TerminStore | null> {
  return aendere(s => {
    const t = s.termine.find(x => x.id === terminId); const v = t?.vorschlaege.find(x => x.mailId === mailId)
    if (!t || !v) return
    v.erledigt = uebernehmen ? 'uebernommen' : 'verworfen'; v.erledigtBy = by; v.erledigtAt = jetzt()
    if (uebernehmen && v.start && v.ende) {
      const alt = zeitraumText(t.start, t.ende, true)
      t.start = v.start; t.ende = v.ende; t.status = 'verschoben'
      if (t.outlook) t.outlook.veraltet = true
      t.verlauf.push({ text: `Vorschlag übernommen: ${alt} → ${zeitraumText(v.start, v.ende, true)} (Mail von ${v.von})`, by, at: jetzt() })
      t.updatedBy = by; t.updatedAt = jetzt()
    }
  })
}

/** Kennung für den Verlauf: „Anzeigename (Login)". */
export function kennung(user?: { displayName?: string; username?: string } | null): string {
  const d = user?.displayName?.trim(), u = user?.username?.trim()
  return d && u && d !== u ? `${d} (${u})` : d || u || 'unbekannt'
}

/** Standard-Vorschlag: nächster Werktag 08:00–13:00. */
export function standardZeitraum(): { datum: string; von: string; bis: string } {
  const d = new Date(); d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return { datum: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, von: '08:00', bis: '13:00' }
}

export function artVon(c: Checklist): TerminArt { return c.deviceType === 'refresh' ? 'refresh' : 'neu' }
