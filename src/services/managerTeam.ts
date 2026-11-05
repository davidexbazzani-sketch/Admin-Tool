// ── Everphone-Register → „Nach Manager" ───────────────────────────────────────
// Manager auswählen → alle Mitarbeiter darunter (direkt oder über alle Ebenen) mit
// ihren Diensthandys/Rufnummern aus dem Everphone-Register. Grundlage ist das zentrale
// AD-Verzeichnis (täglich aktualisiert, Feld „Manager" je Benutzer) — keine eigene
// AD-Abfrage. Gedacht für Anfragen wie „alle Handys meines Teams …".

import ExcelJS from 'exceljs'
import { api } from '../electronAPI'
import type { AdUserListItem } from './adUsersList'
import { findEverphoneForName, type EverphoneEntry } from './everphone'

export interface TeamMitglied {
  user: AdUserListItem
  ebene: number              // 1 = direkt unterstellt
  ueber?: string             // bei Ebene > 1: direkter Vorgesetzter (Anzeigename)
  everphone?: EverphoneEntry
}

/** Für die Suche: klein, Akzente weg; `ae` = Umlaute ausgeschrieben (ü→ue), sonst ü→u. */
export function suchForm(s: string, ae = true): string {
  let t = (s || '').toLowerCase()
  t = ae ? t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue') : t.replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
  return t.replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Passen alle Wortteile der Eingabe? „Muller", „Mueller" und „Müller" finden dasselbe. */
function passt(eingabe: string, text: string): boolean {
  for (const ae of [true, false]) {
    const teile = suchForm(eingabe, ae).split(' ').filter(Boolean)
    const t = suchForm(text, ae)
    if (teile.length && teile.every(x => t.includes(x))) return true
  }
  return false
}

/** Wer hat (laut AD-Verzeichnis) mindestens einen Mitarbeiter unter sich? */
function unterstellteJeManager(users: AdUserListItem[]): Map<string, AdUserListItem[]> {
  const m = new Map<string, AdUserListItem[]>()
  for (const u of users) {
    if (!u.managerSam) continue
    const k = u.managerSam.toUpperCase()
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(u)
  }
  return m
}

/**
 * Vorschläge für das Manager-Feld: aktive Benutzer, deren Name (oder Kennung) alle
 * eingegebenen Wortteile enthält — Vorgesetzte zuerst, dann alphabetisch.
 */
export function managerVorschlaege(users: AdUserListItem[], eingabe: string, max = 8): AdUserListItem[] {
  if (!suchForm(eingabe)) return []
  const unter = unterstellteJeManager(users)
  const treffer = users.filter(u => u.enabled && passt(eingabe, `${u.displayName} ${u.sam}`))
  const anzahl = (u: AdUserListItem) => unter.get(u.sam.toUpperCase())?.length || 0
  return treffer.sort((a, b) => (anzahl(b) > 0 ? 1 : 0) - (anzahl(a) > 0 ? 1 : 0) || a.displayName.localeCompare(b.displayName, 'de')).slice(0, max)
}

/** Anzahl Unterstellter laut Verzeichnis (direkt) — für die Vorschlagsliste. */
export function direktAnzahl(users: AdUserListItem[], sam: string): number {
  return users.filter(u => u.managerSam && u.managerSam.toUpperCase() === sam.toUpperCase() && u.enabled).length
}

/**
 * Alle Mitarbeiter unter einem Manager. `alleEbenen` = auch die Teams der
 * Teamleiter darunter. Nur aktive AD-Konten. Zyklen im AD (A ↔ B) werden abgefangen.
 */
export function teamVon(users: AdUserListItem[], managerSam: string, alleEbenen: boolean): TeamMitglied[] {
  const unter = unterstellteJeManager(users)
  const name = new Map(users.map(u => [u.sam.toUpperCase(), u.displayName]))
  const raus: TeamMitglied[] = []
  const gesehen = new Set<string>([managerSam.toUpperCase()])
  let ebene = 1
  let reihe = [managerSam.toUpperCase()]
  while (reihe.length) {
    const naechste: string[] = []
    for (const chef of reihe) {
      for (const u of unter.get(chef) || []) {
        const k = u.sam.toUpperCase()
        if (gesehen.has(k)) continue
        gesehen.add(k)
        if (u.enabled) raus.push({ user: u, ebene, ueber: ebene > 1 ? name.get(chef) : undefined })
        naechste.push(k)   // auch unter deaktivierten Teamleitern weitersuchen
      }
    }
    if (!alleEbenen) break
    reihe = naechste
    ebene++
  }
  return raus.sort((a, b) => a.ebene - b.ebene || (a.ueber || '').localeCompare(b.ueber || '', 'de') || a.user.displayName.localeCompare(b.user.displayName, 'de'))
}

/** Everphone-Eintrag je Mitarbeiter: zuerst über die E-Mail, sonst über den Namen. */
export function ordneEverphoneZu(team: TeamMitglied[], entries: EverphoneEntry[]): TeamMitglied[] {
  const perMail = new Map<string, EverphoneEntry>()
  for (const e of entries) if (e.email) perMail.set(e.email.trim().toLowerCase(), e)
  return team.map(m => {
    const mail = (m.user.email || '').trim().toLowerCase()
    const e = (mail && perMail.get(mail)) || findEverphoneForName(m.user.displayName, entries)
    return { ...m, everphone: e }
  })
}

// ── Nach Abteilung ───────────────────────────────────────────────────────────
export const OHNE_ABTEILUNG = '(ohne Abteilung)'
const abteilungVon = (u: AdUserListItem) => (u.department || '').trim() || OHNE_ABTEILUNG

/** Alle Abteilungen der aktiven Konten mit Personenzahl (Groß-/Kleinschreibung zusammengefasst). */
export function abteilungen(users: AdUserListItem[]): { name: string; anzahl: number }[] {
  const m = new Map<string, { name: string; anzahl: number }>()
  for (const u of users) {
    if (!u.enabled) continue
    const n = abteilungVon(u)
    const k = n.toLowerCase()
    const e = m.get(k)
    if (e) e.anzahl++; else m.set(k, { name: n, anzahl: 1 })
  }
  return [...m.values()].sort((a, b) => (a.name === OHNE_ABTEILUNG ? 1 : 0) - (b.name === OHNE_ABTEILUNG ? 1 : 0) || a.name.localeCompare(b.name, 'de'))
}

/** Passt die Abteilungs-Suche? (gleiche Toleranz wie bei Namen) */
export function abteilungPasst(name: string, eingabe: string): boolean {
  return !suchForm(eingabe) || passt(eingabe, name)
}

/** Alle aktiven Personen der gewählten Abteilungen (Ebene 0, `ueber` = Vorgesetzter). */
export function personenInAbteilungen(users: AdUserListItem[], gewaehlt: string[]): TeamMitglied[] {
  const set = new Set(gewaehlt.map(a => a.toLowerCase()))
  return users
    .filter(u => u.enabled && set.has(abteilungVon(u).toLowerCase()))
    .map(u => ({ user: u, ebene: 0, ueber: u.managerName }))
    .sort((a, b) => abteilungVon(a.user).localeCompare(abteilungVon(b.user), 'de') || a.user.displayName.localeCompare(b.user.displayName, 'de'))
}

// ── Kopieren / Export (für beide Ansichten) ──────────────────────────────────
/** titel = Überschrift, letzteSpalte = „Ebene" (Manager-Ansicht) oder „Vorgesetzter" (Abteilung). */
export interface ListenKopf { titel: string; dateiname: string; letzteSpalte: 'Ebene' | 'Vorgesetzter' }

const ebeneText = (m: TeamMitglied) => m.ebene === 1 ? 'direkt' : `Ebene ${m.ebene} (über ${m.ueber || '?'})`
const letzte = (k: ListenKopf, m: TeamMitglied) => k.letzteSpalte === 'Ebene' ? ebeneText(m) : (m.ueber || '')
const geraete = (e?: EverphoneEntry) => e ? (e.deviceCount || e.deviceIds.length) : 0

/** Tabulator-Text zum Einfügen in Excel/Outlook. */
export function alsText(k: ListenKopf, team: TeamMitglied[]): string {
  const kopf = ['Name', 'Rufnummer', 'Diensthandys', 'E-Mail', 'Abteilung', 'Funktion', k.letzteSpalte]
  const zeilen = team.map(m => [m.user.displayName, m.everphone?.phone || '', String(geraete(m.everphone)), m.user.email || '', (m.user.department || '').trim(), m.user.title || '', letzte(k, m)])
  return [k.titel, kopf.join('\t'), ...zeilen.map(z => z.join('\t'))].join('\r\n')
}

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(bin)
}

/** Excel-Datei speichern (Speichern-Dialog). */
export async function exportiereTeam(k: ListenKopf, team: TeamMitglied[]): Promise<{ ok: boolean; abgebrochen?: boolean; pfad?: string; fehler?: string }> {
  const sicher = k.dateiname.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
  const pfad = await api().saveFileDialog(`${sicher} – Diensthandys ${new Date().toISOString().slice(0, 10)}.xlsx`, [{ name: 'Excel', extensions: ['xlsx'] }])
  if (!pfad) return { ok: false, abgebrochen: true }
  try {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'IT Admin Tool'; wb.created = new Date()
    const ws = wb.addWorksheet('Liste')
    ws.addRow([`${k.titel} · Stand ${new Date().toLocaleString('de-DE')}`]).font = { bold: true }
    ws.addRow([])
    const kopf = ws.addRow(['Name', 'Rufnummer', 'Diensthandys', 'Geräte-IDs', 'E-Mail', 'Abteilung', 'Funktion', k.letzteSpalte, 'Corp-ID'])
    kopf.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } } })
    for (const m of team) {
      ws.addRow([m.user.displayName, m.everphone?.phone || '', geraete(m.everphone), (m.everphone?.deviceIds || []).join(', '), m.user.email || '', (m.user.department || '').trim(), m.user.title || '', letzte(k, m), m.user.sam])
    }
    ws.columns = [{ width: 28 }, { width: 18 }, { width: 12 }, { width: 28 }, { width: 32 }, { width: 24 }, { width: 28 }, { width: 30 }, { width: 10 }]
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 9 } }
    ws.views = [{ state: 'frozen', ySplit: 3 }]
    const buf = await wb.xlsx.writeBuffer() as ArrayBuffer
    const r = await api().writeFile(pfad, b64(buf))
    if (!r.success) return { ok: false, fehler: r.error || 'Datei konnte nicht gespeichert werden' }
    api().openPath(pfad).catch(() => {})
    return { ok: true, pfad }
  } catch (e) { return { ok: false, fehler: e instanceof Error ? e.message : String(e) } }
}
