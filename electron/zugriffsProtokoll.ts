// ── Server-Zugriffsprotokoll + Schonung der Cluster-Knoten (Hauptprozess) ──────
// Jeder PowerShell-Aufruf aus der Oberfläche läuft über IPC 'ps:run' (alle Fenster).
// Dort wird vorher geprüft, welche Server der Befehl anspricht (serverZiele.ts):
//   · Cluster-Knoten (HCI-Hosts, vom Dienstleister verwaltet) dürfen nur angepingt
//     werden — alles andere wird NICHT ausgeführt (Antwort mit Erklärtext).
//   · Jeder Zugriff auf einen bekannten Server wird festgehalten: Zeit, Dauer, Server,
//     Quelle (Funktion), Art (Ping/lesend/ändernd), Ergebnis, Admin-PC, Benutzer.
//     NIE der Befehlstext (keine Geheimnisse im Protokoll).
//
// Ablage: <Netzlaufwerk>\server_monitor\zugriffe\<JJJJ-MM-TT>_<PC>.jsonl — ein Schreiber
// je PC (kein Überschreiben zwischen Tool-Instanzen), gepuffert und alle 60 s angehängt.
// Netzlaufwerk weg → Einträge bleiben im Speicher (höchstens 5000). 90 Tage aufbewahrt.
// Das Protokoll darf einen Aufruf nie stören: alles in try, „feuern und vergessen“.
import { promises as fsp, appendFileSync, mkdirSync } from 'fs'
import { hostname } from 'os'
import { STANDARD_KNOTEN, baueMuster, erkenneZiele, kurzName, sperrText, type Muster, type ZielKontext, type ZugriffArt } from './serverZiele'

export interface ZugriffMeta { quelle?: string; art?: ZugriffArt }
export type ZugriffErgebnis = 'ok' | 'fehler' | 'zeitlimit' | 'gesperrt'
export interface ZugriffEintrag {
  /** Start (ISO, inkl. Wartezeit in der Warteschlange des Tools) */
  t: string
  /** Dauer in ms */
  ms: number
  /** angesprochene Server (Kurzname) */
  h: string[]
  /** Quelle/Funktion im Tool */
  q: string
  a: ZugriffArt
  e: ZugriffErgebnis
  /** Fehlerart (z. B. „Zugriff verweigert“), nur bei e = 'fehler' — nie der Fehlertext (enthält oft Skriptteile) */
  x?: string
  pc: string
  u: string
}
export interface ZugriffFilter { host?: string; von: string; bis: string; max?: number }
export interface ZugriffLadeErgebnis { eintraege: ZugriffEintrag[]; gekappt: boolean; dateien: number; fehler?: string }
export interface ZugriffKontext { namen?: string[]; knoten?: string[]; ipNamen?: Record<string, string>; benutzer?: string }

export const ZUGRIFF_ORDNER = 'server_monitor\\zugriffe'
export const AUFBEWAHREN_TAGE = 90
const MAX_PUFFER = 5000
const DATEI_RE = /^(\d{4}-\d{2}-\d{2})_.+\.jsonl$/i

// ── Einrichtung (main.ts; Tests übergeben einen eigenen Ordner) ───────────────
let basis: () => string = () => ''
let pc = (hostname() || 'UNBEKANNT').toUpperCase()
let flushMs = 60_000
export function richteEin(o: { basis: () => string; pc?: string; flushMs?: number }): void {
  basis = o.basis
  if (o.pc) pc = o.pc.toUpperCase()
  if (o.flushMs) flushMs = o.flushMs
}

// ── Kontext (von der Oberfläche geschoben) ────────────────────────────────────
let kontext: ZielKontext & { benutzer: string } = { namen: [], knoten: [...STANDARD_KNOTEN], ipNamen: {}, benutzer: '' }
let muster: Muster = baueMuster(kontext)

export function setzeKontext(k: ZugriffKontext): void {
  try {
    const ipNamen: Record<string, string> = {}
    if (k.ipNamen && typeof k.ipNamen === 'object') for (const [ip, n] of Object.entries(k.ipNamen)) if (typeof n === 'string' && n) ipNamen[ip.trim()] = kurzName(n)
    kontext = {
      namen: Array.isArray(k.namen) ? [...new Set(k.namen.map(n => kurzName(String(n))).filter(Boolean))] : kontext.namen,
      // Die festen Knoten bleiben IMMER gesperrt — die Oberfläche kann nur ergänzen.
      knoten: [...new Set([...STANDARD_KNOTEN, ...(Array.isArray(k.knoten) ? k.knoten.map(n => String(n)) : kontext.knoten)].map(kurzName).filter(Boolean))],
      ipNamen: k.ipNamen ? ipNamen : kontext.ipNamen,
      benutzer: typeof k.benutzer === 'string' ? k.benutzer.slice(0, 120) : kontext.benutzer,
    }
    muster = baueMuster(kontext)
  } catch { /* alter Kontext bleibt */ }
}
export const aktuellerKontext = () => kontext

// ── Vor/nach jedem ps:run ─────────────────────────────────────────────────────
type PsErgebnis = { stdout?: string; stderr?: string; exitCode?: number; timedOut?: boolean }

/**
 * Fehlerart statt Fehlertext: PowerShell schreibt bei Fehlern oft den Anfang des SKRIPTS in stderr
 * („try { Invoke-Command … } : Zugriff verweigert“) — der Befehlstext darf nie ins Protokoll.
 */
export function fehlerArt(stderr?: string, exitCode?: number): string {
  const s = String(stderr || '')
  if (/Zugriff verweigert|Access is denied|access denied|0x80070005|nicht berechtigt|not authorized|Unauthorized/i.test(s)) return 'Zugriff verweigert'
  if (/nicht aufgel[öo]st|could not be resolved|Name.*unbekannt|No such host|Host.*nicht gefunden/i.test(s)) return 'Name nicht auflösbar'
  if (/Zeit(ü|ue)berschreitung|timed out|timeout|Timeout/i.test(s)) return 'Zeitüberschreitung'
  if (/WinRM|WS-Management|Remoteserver|remote server|keine Verbindung|cannot connect|cannot complete the operation|Verbindung.*herstellen/i.test(s)) return 'Verbindung (WinRM) fehlgeschlagen'
  if (/RPC|0x800706BA|0x800706be/i.test(s)) return 'RPC nicht verfügbar'
  return typeof exitCode === 'number' && exitCode !== 0 ? `Fehler (Exit-Code ${exitCode})` : 'Fehler'
}

export function vorAusfuehrung(befehl: string, meta?: ZugriffMeta): { gesperrt?: string; fertig: (r: PsErgebnis) => void } {
  const nichts = { fertig: () => { /* kein Server angesprochen */ } }
  let erk
  try { erk = erkenneZiele(String(befehl || ''), muster, meta?.art) } catch { return nichts }
  const quelle = String(meta?.quelle || '').trim().slice(0, 80) || 'Fernbefehl (erkannt)'
  const start = Date.now()
  if (erk.gesperrt.length) {
    try {
      for (const tr of erk.treffer) einreihen({ t: new Date(start).toISOString(), ms: 0, h: tr.hosts, q: quelle, a: tr.art, e: 'gesperrt', pc, u: kontext.benutzer || 'unbekannt' })
    } catch { /* nie stören */ }
    return { gesperrt: sperrText(erk.gesperrt), fertig: () => { /* nicht ausgeführt */ } }
  }
  if (!erk.treffer.length) return nichts
  const treffer = erk.treffer
  return {
    fertig: (r: PsErgebnis) => {
      try {
        const ms = Date.now() - start
        const fehler = !!r && ((typeof r.exitCode === 'number' && r.exitCode !== 0) || (!String(r.stdout || '').trim() && !!String(r.stderr || '').trim()))
        const e: ZugriffErgebnis = r?.timedOut ? 'zeitlimit' : fehler ? 'fehler' : 'ok'
        // Ein Skript kann melden, dass es tatsächlich geändert hat ("__zugriff":"aendern" in der
        // JSON-Ausgabe, z. B. ensureWinRM nach einem Startversuch) — dann gilt der Zugriff als ändernd.
        const geaendert = /"__zugriff"\s*:\s*"aendern"/.test(String(r?.stdout || ''))
        for (const tr of treffer) {
          const a: ZugriffArt = geaendert && tr.art !== 'ping' ? 'aendern' : tr.art
          einreihen({ t: new Date(start).toISOString(), ms, h: tr.hosts, q: quelle, a, e, ...(e === 'fehler' ? { x: fehlerArt(r?.stderr, r?.exitCode) } : {}), pc, u: kontext.benutzer || 'unbekannt' })
        }
      } catch { /* nie stören */ }
    },
  }
}

/**
 * Der komplette Weg eines 'ps:run' (main.ts): prüfen → gesperrt beantworten ODER ausführen → protokollieren.
 * `ausfuehren` = runPowerShell aus powerShellRunner.ts (im Test austauschbar).
 */
export async function psGeschuetzt<R extends PsErgebnis>(
  befehl: string, timeoutMs: number, meta: ZugriffMeta | undefined,
  ausfuehren: (befehl: string, timeoutMs: number) => Promise<R>,
): Promise<R | { stdout: string; stderr: string; exitCode: number; timedOut: boolean }> {
  const z = vorAusfuehrung(befehl, meta)
  if (z.gesperrt) return { stdout: '', stderr: z.gesperrt, exitCode: -1, timedOut: false }
  const res = await ausfuehren(befehl, timeoutMs)
  z.fertig(res)
  return res
}

// ── Puffer + Schreiben ────────────────────────────────────────────────────────
const puffer: ZugriffEintrag[] = []
let verworfen = 0
let timer: ReturnType<typeof setTimeout> | null = null
let laeuft: Promise<void> | null = null
let letzterErfolg = 0
let aufgeraeumtAm = ''

const zwei = (n: number) => String(n).padStart(2, '0')
/** Lokales Datum JJJJ-MM-TT (wie das Aktivitätsprotokoll). */
export const tagVon = (d: Date) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`
const pfad = (...teile: string[]) => teile.map((t, i) => (i === 0 ? t.replace(/[\\/]+$/, '') : t.replace(/^[\\/]+|[\\/]+$/g, ''))).join('\\')
const pcDatei = () => pc.replace(/[^A-Z0-9_-]/gi, '_')

function einreihen(e: ZugriffEintrag): void {
  puffer.push(e)
  if (puffer.length > MAX_PUFFER) { const weg = puffer.length - MAX_PUFFER; puffer.splice(0, weg); verworfen += weg }
  plane()
}
function plane(): void {
  if (timer) return
  timer = setTimeout(() => { timer = null; void leeren() }, flushMs)
  ;(timer as { unref?: () => void }).unref?.()
}

/** Puffer jetzt anhängen (asynchron, blockiert den Hauptprozess nie). */
export function leeren(): Promise<void> {
  if (laeuft) return laeuft.then(() => (puffer.length ? leeren() : undefined))
  laeuft = (async () => {
    const teil = puffer.splice(0, puffer.length)
    if (!teil.length) return
    const b = basis()
    if (!b) { puffer.unshift(...teil); kappe(); plane(); return }
    const ordner = pfad(b, ZUGRIFF_ORDNER)
    const nachTag = new Map<string, ZugriffEintrag[]>()
    for (const e of teil) { const tg = tagVon(new Date(e.t)); const l = nachTag.get(tg); if (l) l.push(e); else nachTag.set(tg, [e]) }
    try { await fsp.mkdir(ordner, { recursive: true }) } catch { /* evtl. schon da / Netz weg → appendFile entscheidet */ }
    const rest: ZugriffEintrag[] = []
    for (const [tg, liste] of nachTag) {
      try {
        await fsp.appendFile(pfad(ordner, `${tg}_${pcDatei()}.jsonl`), liste.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8')
        letzterErfolg = Date.now()
      } catch { rest.push(...liste) }
    }
    if (rest.length) { puffer.unshift(...rest); kappe(); plane() }
    else await raeumeAuf(ordner).catch(() => undefined)
  })().finally(() => { laeuft = null })
  return laeuft
}
function kappe(): void {
  if (puffer.length > MAX_PUFFER) { const weg = puffer.length - MAX_PUFFER; puffer.splice(0, weg); verworfen += weg }
}

/** Beim Beenden: synchron anhängen — nur wenn das Netzlaufwerk vor Kurzem erreichbar war (sonst hinge das Beenden). */
export function leerenBeimBeenden(): void {
  try {
    if (!puffer.length || Date.now() - letzterErfolg > 5 * 60_000) return
    const b = basis(); if (!b) return
    const ordner = pfad(b, ZUGRIFF_ORDNER)
    try { mkdirSync(ordner, { recursive: true }) } catch { /* schon da */ }
    const nachTag = new Map<string, ZugriffEintrag[]>()
    for (const e of puffer.splice(0, puffer.length)) { const tg = tagVon(new Date(e.t)); const l = nachTag.get(tg); if (l) l.push(e); else nachTag.set(tg, [e]) }
    for (const [tg, liste] of nachTag) appendFileSync(pfad(ordner, `${tg}_${pcDatei()}.jsonl`), liste.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8')
  } catch { /* Beenden nie stören */ }
}

/** Einmal am Tag: Dateien älter als 90 Tage löschen (alle PCs). */
async function raeumeAuf(ordner: string): Promise<void> {
  const heute = tagVon(new Date())
  if (aufgeraeumtAm === heute) return
  aufgeraeumtAm = heute
  const grenze = new Date(); grenze.setHours(0, 0, 0, 0); grenze.setDate(grenze.getDate() - AUFBEWAHREN_TAGE)
  const vor = tagVon(grenze)
  for (const n of await fsp.readdir(ordner)) {
    const m = DATEI_RE.exec(n)
    if (m && m[1] < vor) await fsp.unlink(pfad(ordner, n)).catch(() => undefined)
  }
}

// ── Lesen (Dialog „Tool-Zugriffe“, Zeile bei Ausfällen) ───────────────────────
export async function ladeZugriffe(f: ZugriffFilter): Promise<ZugriffLadeErgebnis> {
  const von = Date.parse(f?.von), bis = Date.parse(f?.bis)
  if (!isFinite(von) || !isFinite(bis) || bis < von) return { eintraege: [], gekappt: false, dateien: 0, fehler: 'Ungültiger Zeitraum' }
  const host = f.host ? kurzName(f.host) : ''
  const passt = (e: ZugriffEintrag) => {
    if (!e || typeof e.t !== 'string' || !Array.isArray(e.h)) return false
    const t = Date.parse(e.t)
    if (!(t >= von && t <= bis)) return false
    return !host || e.h.some(x => kurzName(String(x)) === host)
  }
  const out: ZugriffEintrag[] = []
  let dateien = 0
  let fehler: string | undefined
  const b = basis()
  if (b) {
    const ordner = pfad(b, ZUGRIFF_ORDNER)
    let namen: string[] = []
    try { namen = await fsp.readdir(ordner) } catch (e) { if ((e as { code?: string })?.code !== 'ENOENT') fehler = 'Protokollordner nicht lesbar' }
    const ab = tagVon(new Date(von - 86_400_000)), bisTag = tagVon(new Date(bis + 86_400_000))
    for (const n of namen) {
      const m = DATEI_RE.exec(n)
      if (!m || m[1] < ab || m[1] > bisTag) continue
      dateien++
      let txt = ''
      try { txt = await fsp.readFile(pfad(ordner, n), 'utf8') } catch { continue }
      for (const zeile of txt.split(/\r?\n/)) {
        if (!zeile.trim()) continue
        try { const e = JSON.parse(zeile) as ZugriffEintrag; if (passt(e)) out.push(e) } catch { /* kaputte Zeile überspringen */ }
      }
    }
  } else fehler = 'Netzlaufwerk nicht eingerichtet'
  // eigene, noch nicht geschriebene Einträge dazu
  for (const e of puffer) if (passt(e)) out.push(e)
  out.sort((a, c) => a.t.localeCompare(c.t))
  const max = Math.max(1, Math.min(20_000, f.max ?? 5000))
  const gekappt = out.length > max
  return { eintraege: gekappt ? out.slice(-max) : out, gekappt, dateien, ...(fehler ? { fehler } : {}) }
}

/** Nur für Tests/Diagnose. */
export function _zustand(): { puffer: number; verworfen: number; letzterErfolg: number } {
  return { puffer: puffer.length, verworfen, letzterErfolg }
}
export function _puffer(): ZugriffEintrag[] { return puffer }
/** Nur für Tests: „heute schon aufgeräumt“ vergessen. */
export function _vergissAufraeumen(): void { aufgeraeumtAm = '' }
