// ── Änderungsverlauf je PC: Ablage, Lesen eines PCs, Hintergrund-Lauf ────────
// Ablage auf dem Netzlaufwerk (nur asynchrone Aufrufe — blockieren das Fenster nicht):
//   pc-verlauf/pcs/<HOST>.json   je PC: letzter Stand + Änderungen (12 Monate)
//   pc-verlauf/index.json        klein: Host → Fingerabdruck, damit der Lauf nicht jede Datei lesen muss
//   pc-verlauf/_scan_status.json Lauf-Status + Sperre (nur EIN Admin-Rechner liest)
//
// Netz-Schonung: höchstens GLEICHZEITIG PCs auf einmal, je Gruppe EIN powershell.exe, vorab nur
// ein Port-Test (kein Ping-Sturm, WinRM wird nie eingeschaltet), Pause zwischen den Gruppen,
// und ein PC, dessen Stand sich nicht geändert hat, schickt nur wenige hundert Bytes.
// Nur Client-PCs aus der Endgeräte-Übersicht — NIE Server.

import { api } from '../electronAPI'
import { listWeekendDevices } from '../services/weekendCheck'
import { loadServerConfig } from '../services/serverMonitor'
import { baueLeseSkript, TAG, type LeseModus } from './sammler'
import { leseAusgabe, uebernehme, type Antwort } from './logik'
import type { PcDatei, PcIndex } from './typen'
import { ladeUebersicht, merkeFehler, verarbeiteFehler, type FehlerMeldung, type PcFehlerUebersicht } from '../pcFehler/speicher'

/** Nur beim Lesen EINES PCs auf Knopfdruck kommen die Fehler im selben Besuch mit (die beiden Hintergrund-Scans sind getrennt). */
interface FehlerLauf { uebersicht: PcFehlerUebersicht | null; meldung: FehlerMeldung; mitBefund: number }

export const PC_VERLAUF_ID = 'pc-verlauf'
export const PC_VERLAUF_STATUS = 'pc-verlauf/_scan_status.json'
const ORDNER = 'pc-verlauf/pcs'
const INDEX = 'pc-verlauf/index.json'
const NACHLESE = 'pc-verlauf/_nachlese.json'

/** So viele PCs werden gleichzeitig gelesen. */
export const GLEICHZEITIG = 3
/** PCs je powershell.exe. */
export const GRUPPE = 12
export const PAUSE_MS = 1500
export const GRUPPEN_TIMEOUT_MS = 7 * 60_000
const EINZEL_TIMEOUT_MS = 110_000

/** Hostname groß und ohne Domäne; eine IP-Adresse bleibt, wie sie ist. */
export const hostKey = (h: string) => { const t = (h || '').trim(); return /^[0-9]{1,3}([.][0-9]{1,3}){3}$/.test(t) ? t : t.split('.')[0].toUpperCase() }
const pfad = (h: string) => `${ORDNER}/${hostKey(h).replace(/[^A-Z0-9_-]/g, '_')}.json`
export const tag = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
export const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function ladePc(host: string): Promise<PcDatei | null> {
  try {
    const d = await api().netReadJsonAsync<PcDatei>(pfad(host))
    return d && typeof d === 'object' && Array.isArray(d.aenderungen) ? d : null
  } catch { return null }
}

async function ladeIndex(): Promise<PcIndex | null> {
  try {
    const i = await api().netReadJsonAsync<PcIndex>(INDEX)
    return i && typeof i === 'object' ? i : {}
  } catch { return null }
}

/** Index frisch laden, nur die eigenen Einträge setzen, schreiben (andere Läufe gehen nicht verloren). */
async function merkeIndex(aend: Record<string, PcIndex[string] | null>): Promise<void> {
  if (!Object.keys(aend).length) return
  const frisch = await ladeIndex()
  if (!frisch) return
  for (const [h, e] of Object.entries(aend)) { if (e) frisch[h] = e; else delete frisch[h] }
  try { await api().netWriteJsonAsync(INDEX, frisch) } catch { /* nächster Lauf */ }
}

/** Welche PC-Dateien gibt es? null = Ordner nicht lesbar. */
async function vorhandeneDateien(): Promise<Set<string> | null> {
  try { return new Set((await api().netListDirAsync(ORDNER)).map(n => n.replace(/\.json$/i, '').toUpperCase())) } catch { return null }
}

export type LeseStatus = 'neu' | 'geaendert' | 'gleich' | 'aus' | 'fehler'
export interface LeseErgebnis { host: string; status: LeseStatus; neueAenderungen: number; bytes: number; text?: string; datei?: PcDatei | null }

/** Eine Antwort einarbeiten und speichern. `dateien` = vorhandene Dateinamen (null = unbekannt). */
async function verarbeite(a: Antwort, index: PcIndex, dateien: Set<string> | null, indexNeu: Record<string, PcIndex[string] | null>, fl?: FehlerLauf): Promise<LeseErgebnis> {
  const host = hostKey(a.host)
  if (a.art === 'aus') return { host, status: 'aus', neueAenderungen: 0, bytes: 0 }
  if (a.art === 'fehler') return { host, status: 'fehler', neueAenderungen: 0, bytes: 0, text: a.text }
  const roh = a.roh
  // Fehler-Scan: unabhängig davon, ob sich am Stand des PCs etwas geändert hat
  if (fl?.uebersicht) { if (await verarbeiteFehler(host, roh.am, roh, fl.uebersicht, fl.meldung)) fl.mitBefund++ }
  // Unverändert und nichts Neues in der Ereignisanzeige → nur „heute gelesen" vermerken, keine Datei anfassen
  if (roh.gleich && !roh.ev.length && index[host]) {
    indexNeu[host] = { ...index[host], am: roh.am, evBis: roh.am }
    return { host, status: 'gleich', neueAenderungen: 0, bytes: a.bytes }
  }
  const alt = await ladePc(host)
  // Datei ist da, ließ sich aber nicht lesen (Netzaussetzer?) → NICHT überschreiben, sonst wäre der Verlauf weg
  if (!alt && dateien?.has(host.replace(/[^A-Z0-9_-]/g, '_'))) return { host, status: 'fehler', neueAenderungen: 0, bytes: a.bytes, text: 'Gespeicherter Verlauf nicht lesbar – nichts überschrieben.' }
  const neu = uebernehme(alt, roh, new Date())
  if (!neu) {
    // PC meldet „unverändert", aber hier fehlt der Stand → Fingerabdruck vergessen, nächstes Mal kommt alles
    indexNeu[host] = null
    return { host, status: 'fehler', neueAenderungen: 0, bytes: a.bytes, text: 'Stand fehlte – wird beim nächsten Lauf vollständig gelesen.' }
  }
  let ok = false
  try { ok = await api().netWriteJsonAsync(pfad(host), neu) } catch { ok = false }
  if (!ok) return { host, status: 'fehler', neueAenderungen: 0, bytes: a.bytes, text: 'Speichern auf dem Netzlaufwerk fehlgeschlagen.' }
  indexNeu[host] = { hash: roh.hash, am: roh.am, evBis: roh.am }
  const dazu = neu.aenderungen.length - (alt?.aenderungen.length || 0)
  return { host, status: alt ? (roh.gleich ? 'gleich' : 'geaendert') : 'neu', neueAenderungen: Math.max(0, dazu), bytes: a.bytes, datei: neu }
}

export async function leseGruppe(hosts: string[], index: PcIndex, timeoutMs: number, modus: LeseModus): Promise<Antwort[]> {
  const hashes: Record<string, string> = {}, seit: Record<string, string> = {}
  for (const h of hosts) { const e = index[hostKey(h)]; if (e?.hash) hashes[hostKey(h)] = e.hash; if (e?.evBis) seit[hostKey(h)] = e.evBis }
  const r = await api().runPowerShell(baueLeseSkript(hosts, hashes, seit, GLEICHZEITIG, modus), timeoutMs)
  const antworten = await leseAusgabe(r.stdout || '', TAG)
  // Ein einzelner PC (auch per IP gewählt) antwortet unter seinem echten Namen — das ist seine Antwort
  if (hosts.length === 1 && antworten.length === 1) return antworten
  const da = new Set(antworten.map(a => hostKey(a.host)))
  for (const h of hosts) if (!da.has(hostKey(h))) antworten.push({ host: hostKey(h), art: 'fehler', text: r.timedOut ? 'Zeitüberschreitung' : 'Keine Antwort' })
  return antworten
}

// Ein PC wird nie zweimal gleichzeitig gelesen (z. B. zwei Stellen im Tool zeigen denselben PC)
const laufend = new Map<string, Promise<LeseErgebnis>>()

/**
 * Einen PC JETZT lesen (z. B. sobald er in „Gib dein Problem ein“ gewählt wurde).
 * Nur lesend; setzt voraus, dass WinRM am PC schon erreichbar ist — eingeschaltet wird hier nichts.
 */
export function lesePcJetzt(host: string): Promise<LeseErgebnis> {
  const k = hostKey(host)
  const schon = laufend.get(k)
  if (schon) return schon
  const p = (async (): Promise<LeseErgebnis> => {
    try {
      const [index, dateien] = await Promise.all([ladeIndex(), vorhandeneDateien()])
      if (!index) return { host: k, status: 'fehler', neueAenderungen: 0, bytes: 0, text: 'Netzlaufwerk nicht erreichbar.' }
      // Den Fingerabdruck nur mitschicken, wenn der gespeicherte Stand auch wirklich da ist
      const ix = dateien && !dateien.has(k.replace(/[^A-Z0-9_-]/g, '_')) ? {} : index
      const [a] = await leseGruppe([host], ix, EINZEL_TIMEOUT_MS, 'beides')
      const indexNeu: Record<string, PcIndex[string] | null> = {}
      const fl: FehlerLauf = { uebersicht: await ladeUebersicht(), meldung: {}, mitBefund: 0 }
      const e = await verarbeite(a, ix, dateien, indexNeu, fl)
      await merkeIndex(indexNeu)
      await merkeFehler(fl.meldung)
      if (!e.datei && (e.status === 'gleich' || e.status === 'fehler')) e.datei = await ladePc(k)
      return e
    } catch (err) {
      return { host: k, status: 'fehler', neueAenderungen: 0, bytes: 0, text: err instanceof Error ? err.message : String(err) }
    } finally { laufend.delete(k) }
  })()
  laufend.set(k, p)
  return p
}

/** Client-PCs, die gelesen werden: Endgeräte-Übersicht „In use" + „Active" — ohne Server. */
export async function zielPcs(): Promise<string[]> {
  const [geraete, server] = await Promise.all([
    listWeekendDevices(),
    loadServerConfig().then(c => new Set((c.tiles || []).map(t => hostKey(t.hostname)))).catch(() => new Set<string>()),
  ])
  return geraete.map(g => g.hostname.trim()).filter(h => { const k = hostKey(h); return !!k && !server.has(k) && !/^W\d{3,5}$/.test(k) })
}

export interface LaufErgebnis {
  ok: boolean; summary: string; gelesen: number; gesamt: number
  /** Abgebrochen, weil WinRM offensichtlich gestört ist — heute nicht noch einmal anlaufen. */
  nichtWiederholen?: boolean
}

/** Windows hat den Start von PowerShell am Admin-PC verweigert (Sicherheitssoftware, vgl. INC2844463)? */
export const istStartBlockiert = (e: unknown) => /EPERM|EACCES|access is denied|zugriff verweigert/i.test(e instanceof Error ? e.message : String(e))
/** Abbruch-Ergebnis dafür: nicht umgehen, nicht wiederholen, klar melden. */
export function startBlockiert(name: string, gesamt: number, e: unknown): LaufErgebnis {
  return { ok: false, nichtWiederholen: true, gelesen: 0, gesamt, summary: `${name} abgebrochen: Die Sicherheitssoftware am Admin-PC hat den Start von PowerShell blockiert (${e instanceof Error ? e.message : String(e)}). Bitte an die IT-Security melden und das IT Admin Tool über den offiziellen Weg freigeben lassen (vgl. INC2844463).` }
}

/** Ab so vielen Verbindungsfehlern OHNE einen einzigen gelesenen PC wird der Lauf abgebrochen. */
export const ABBRUCH_AB = 10

/**
 * Ein Durchgang über alle Client-PCs. `nurFehlende` = nur PCs, die heute noch nicht gelesen
 * wurden (Nachlese für Rechner, die beim ersten Durchgang aus waren).
 */
export async function runPcVerlaufScan(_by: string, onTick?: () => void, nurFehlende = false): Promise<LaufErgebnis> {
  const index = await ladeIndex()
  if (!index) return { ok: false, summary: 'Netzlaufwerk nicht erreichbar – Änderungsverlauf nicht gelesen.', gelesen: 0, gesamt: 0 }
  const alle = await zielPcs()
  if (!alle.length) return { ok: false, summary: 'Keine genutzten PCs in der Endgeräte-Übersicht gefunden.', gelesen: 0, gesamt: 0 }
  const heute = tag(new Date().toISOString())
  const offen = alle.filter(h => tag(index[hostKey(h)]?.am || '') !== heute)
  const dateien = await vorhandeneDateien()
  const z = { neu: 0, geaendert: 0, gleich: 0, aus: 0, fehler: 0, aenderungen: 0, bytes: 0 }
  let geantwortet = 0, verbFehler = 0, ersterFehler = ''
  for (let i = 0; i < offen.length; i += GRUPPE) {
    const gruppe = offen.slice(i, i + GRUPPE)
    let antworten: Antwort[] = []
    try { antworten = await leseGruppe(gruppe, index, GRUPPEN_TIMEOUT_MS, 'stand') } catch (e) { if (istStartBlockiert(e)) return startBlockiert('Änderungsverlauf', alle.length, e); antworten = gruppe.map(h => ({ host: hostKey(h), art: 'fehler' as const, text: 'Gruppe fehlgeschlagen' })) }
    const indexNeu: Record<string, PcIndex[string] | null> = {}
    for (const a of antworten) {
      if (a.art === 'ok') geantwortet++
      else if (a.art === 'fehler') { verbFehler++; if (!ersterFehler) ersterFehler = a.text }
      const e = await verarbeite(a, index, dateien, indexNeu)
      z[e.status]++; z.aenderungen += e.neueAenderungen; z.bytes += e.bytes
    }
    for (const [h, e] of Object.entries(indexNeu)) { if (e) index[h] = e; else delete index[h] }
    await merkeIndex(indexNeu)
    onTick?.()
    // Notbremse: Port offen, aber kein einziger PC antwortet richtig → WinRM ist gestört (z. B. fängt
    // ein Proxy/Zscaler Port 5985 ab) oder die Berechtigung fehlt. Dann nicht hunderte PCs durchprobieren.
    if (geantwortet === 0 && verbFehler >= ABBRUCH_AB) {
      return {
        ok: false, nichtWiederholen: true, gelesen: 0, gesamt: alle.length,
        summary: `Änderungsverlauf abgebrochen: Bei ${verbFehler} PCs war der WinRM-Port offen, aber keiner ließ sich lesen (${(ersterFehler || 'ohne Fehlertext').slice(0, 160)}). Vermutlich ist WinRM gestört (Proxy/Zscaler auf Port 5985) oder die Berechtigung fehlt – die übrigen ${Math.max(0, offen.length - i - gruppe.length)} PCs wurden nicht mehr angefragt.`,
      }
    }
    if (i + GRUPPE < offen.length) await pause(PAUSE_MS)
  }
  const gelesen = z.neu + z.geaendert + z.gleich
  const schon = alle.length - offen.length
  const teile = [
    `${gelesen + schon} von ${alle.length} PCs gelesen`,
    schon ? `${schon} schon vorher` : '',
    `${z.geaendert} mit neuem Stand`, `${z.gleich} unverändert`, z.neu ? `${z.neu} erstmals erfasst` : '',
    `${z.aus} aus/nicht erreichbar`, z.fehler ? `${z.fehler} Fehler` : '',
    `${z.aenderungen} neue Änderung(en)`, `übertragen ${Math.max(1, Math.round(z.bytes / 1024))} KB`,
  ].filter(Boolean)
  return { ok: true, summary: `${nurFehlende ? 'Nachlese' : 'Änderungsverlauf'}: ${teile.join(' · ')}`, gelesen, gesamt: alle.length }
}

/** Nachlese: höchstens einmal je Tag, frühestens 3 Std. nach dem Hauptlauf, nicht mehr nach 17 Uhr. */
export async function nachleseFaellig(lastRunAt: string | null | undefined, jetzt = new Date(), datei = NACHLESE): Promise<boolean> {
  if (!lastRunAt) return false
  const l = new Date(lastRunAt)
  if (isNaN(l.getTime()) || tag(lastRunAt) !== tag(jetzt.toISOString())) return false
  if (jetzt.getTime() - l.getTime() < 3 * 60 * 60_000 || jetzt.getHours() >= 17) return false
  try { const n = await api().netReadJsonAsync<{ tag?: string }>(datei); if (n?.tag === tag(jetzt.toISOString())) return false } catch { return false }
  return true
}
export async function merkeNachlese(jetzt = new Date(), datei = NACHLESE): Promise<void> {
  try { await api().netWriteJsonAsync(datei, { tag: tag(jetzt.toISOString()) }) } catch { /* egal */ }
}
