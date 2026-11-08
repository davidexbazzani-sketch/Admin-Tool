// ── Befehls-Test: einen Befehl ausführen, Ergebnis einordnen, auf den PC warten ──

import { api } from '../electronAPI'
import { b64, fernBefehl, getagged } from '../services/enaioInstall'
import type { PaAktion } from '../problemAssistent/motor'
import type { CmdDef } from '../utils/remoteCommands'
import { istNa, istVerbindungWeg, paramAnzeige, schwaerze } from './katalog'
import { BT_TAG, PS_PCINFO } from './skripte'
import type { BtEintrag, BtErgebnis, BtStatus } from './types'

export interface PcInfo { ok: boolean; produktTyp?: number; boot?: string; benutzer?: string; gesperrt?: boolean; rechner?: string; system?: string; fehler?: string }

/** Kurzinfo vom Test-PC (liest nur). */
export async function pcInfo(host: string, timeoutMs = 40_000): Promise<PcInfo> {
  try {
    const r = await api().runPowerShell(fernBefehl(host, PS_PCINFO, BT_TAG), timeoutMs)
    const j = getagged<PcInfo>(r.stdout, BT_TAG)
    if (j && j.ok !== false && j.boot) return { ...j, ok: true }
    return { ok: false, fehler: (j?.fehler || r.stderr || '').trim().slice(0, 300) || (r.timedOut ? 'Zeitüberschreitung' : 'keine Antwort') }
  } catch (e) { return { ok: false, fehler: e instanceof Error ? e.message : String(e) } }
}

/** Ein PowerShell-Stück auf dem Test-PC ausführen und das getaggte JSON lesen. */
export async function fernJson<T>(host: string, inner: string, payload?: unknown, timeoutMs = 120_000): Promise<T | null> {
  const r = await api().runPowerShell(fernBefehl(host, inner, BT_TAG, payload === undefined ? undefined : b64(JSON.stringify(payload))), timeoutMs)
  return getagged<T>(r.stdout, BT_TAG)
}

export async function lokalJson<T>(script: string, timeoutMs = 60_000): Promise<T | null> {
  const r = await api().runPowerShell(script, timeoutMs)
  return getagged<T>(r.stdout, BT_TAG)
}

/** Wartezeiten (nur für Oberflächentests verkürzbar: faktor 0.001). */
export const BT_ZEIT = { faktor: 1 }
export const schlaf = (ms: number) => new Promise(r => setTimeout(r, ms * BT_ZEIT.faktor))

/** Warten, bis der PC wieder per WinRM antwortet (optional: mit neuer Startzeit). */
export async function warteAufPc(host: string, opt: { maxMs: number; bootVorher?: string; abbrechen?: () => boolean; melde?: (t: string) => void }): Promise<PcInfo | null> {
  const bis = Date.now() + opt.maxMs
  const t0 = Date.now()
  await schlaf(opt.bootVorher ? 30_000 : 10_000)
  while (Date.now() < bis) {
    if (opt.abbrechen?.()) return null
    const i = await pcInfo(host, 25_000)
    if (i.ok && (!opt.bootVorher || (i.boot && i.boot !== opt.bootVorher))) return i
    opt.melde?.(`${opt.bootVorher ? 'Warte auf den Neustart' : 'Warte, bis der PC wieder antwortet'} … ${Math.round((Date.now() - t0) / 1000)} s`)
    await schlaf(15_000)
  }
  return null
}

/** Warten, bis der PC NICHT mehr antwortet (Herunterfahren). */
export async function warteBisWeg(host: string, maxMs: number, melde?: (t: string) => void): Promise<boolean> {
  const bis = Date.now() + maxMs
  let weg = 0
  while (Date.now() < bis) {
    await schlaf(15_000)
    const i = await pcInfo(host, 20_000)
    weg = i.ok ? 0 : weg + 1
    if (weg >= 2) return true
    melde?.('Warte, bis der PC aus ist …')
  }
  return false
}

// ── Ausgabe aufbereiten ──────────────────────────────────────────────────────
const MAX_ZEILEN = 20
function aufbereiten(text: string, geheim?: boolean): string[] {
  if (geheim) return ['(Ausgabe enthält Schlüssel bzw. Passwörter – wird nicht gespeichert)']
  const z = schwaerze(text).split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim())
  const out = z.slice(0, MAX_ZEILEN).map(l => l.length > 300 ? l.slice(0, 300) + ' …' : l)
  if (z.length > MAX_ZEILEN) out.push(`… (${z.length - MAX_ZEILEN} weitere Zeilen)`)
  return out
}
function ersteZeile(zeilen: string[], fallback: string): string {
  const z = zeilen.find(l => l.trim() && !/^[[{]?$/.test(l.trim()))
  return (z || fallback).slice(0, 200)
}
/** CLIXML-Rauschen und Fortschrittsmeldungen aus stderr entfernen. */
function sauberStderr(s: string): string {
  return (s || '').split(/\r?\n/).filter(l => l.trim() && !/^#< CLIXML|^<Objs |<\/Objs>$|Preparing modules for first use/.test(l.trim())).join('\n').trim()
}

function einordnen(fehler: string, standard: BtStatus = 'fehler'): BtStatus {
  if (/Kein Benutzer angemeldet|NOUSER|Registry des Benutzers ist nicht geladen|ist nicht geladen \(abgemeldet/i.test(fehler)) return 'skip'
  if (istVerbindungWeg(fehler)) return 'weg'
  if (istNa(fehler)) return 'na'
  return standard
}

// ── Ausführen ────────────────────────────────────────────────────────────────

export interface AusfuehrKontext {
  host: string
  sam?: string
  aktion?: PaAktion
  befehl?: CmdDef
  /** Remote-Doc-Befehle immer per WinRM bauen (Einstellung aus Remote Doc nicht verändern). */
  baueRd?: (def: CmdDef, host: string, param: string | undefined) => string
}

export async function fuehreEintragAus(e: BtEintrag, ctx: AusfuehrKontext, param: string | undefined): Promise<BtErgebnis> {
  const t0 = Date.now()
  const am = new Date().toISOString()
  const pAnz = param === undefined ? undefined : paramAnzeige(e, param)
  const fertig = (status: BtStatus, text: string, zeilen?: string[]): BtErgebnis =>
    ({ status, text: schwaerze(text).slice(0, 300), zeilen, param: pAnz, dauerMs: Date.now() - t0, am })

  try {
    if (e.quelle === 'baustein') {
      if (!ctx.aktion) return fertig('fehler', 'Baustein nicht mehr im Katalog')
      const { fuehreAus } = await import('../problemAssistent/motor')
      const r = await fuehreAus(ctx.host, ctx.aktion, param ?? '', { sam: ctx.sam })
      const zeilen = aufbereiten(r.zeilen.join('\n'), e.geheim)
      if (r.ok) return fertig('ok', ersteZeile(zeilen, 'ohne Rückmeldung abgeschlossen'), zeilen)
      const f = r.fehler || 'Fehler ohne Text'
      if (f === 'Zeitüberschreitung') return fertig('zeit', `Keine Antwort innerhalb von ${Math.round(e.timeoutMs / 1000)} s`, zeilen)
      return fertig(einordnen(f), f, zeilen)
    }

    // Remote Doc
    if (!ctx.befehl || !ctx.baueRd) return fertig('fehler', 'Befehl nicht mehr im Katalog')
    const cmd = ctx.baueRd(ctx.befehl, ctx.host, param === '' ? undefined : param)
    const r = await api().runPowerShell(cmd, e.timeoutMs)
    const out = (r.stdout || '').trim()
    const err = sauberStderr(r.stderr || '')
    const zeilen = aufbereiten(out || err, e.geheim)
    if (r.timedOut) return fertig('zeit', `Keine Antwort innerhalb von ${Math.round(e.timeoutMs / 60000)} min`, zeilen)
    // Fehlererkennung wie Remote Doc (ERR:, Exitcode, success:false) — zusätzlich strenger: Fehlerkanal
    const errZeile = out.split(/\r?\n/).map(l => l.trim().replace(/^"/, '')).find(l => l.startsWith('ERR:'))
    if (errZeile) { const f = errZeile.slice(4).replace(/"$/, '').trim(); return fertig(einordnen(f), f, zeilen) }
    try {
      const j = JSON.parse(out)
      if (j && typeof j === 'object' && !Array.isArray(j)) {
        if ((j as Record<string, unknown>).success === false) { const f = String((j as Record<string, unknown>).error || (j as Record<string, unknown>).message || 'success = false'); return fertig(einordnen(f), f, zeilen) }
        if (typeof (j as Record<string, unknown>).Fehler === 'string') { const f = String((j as Record<string, unknown>).Fehler); return fertig(einordnen(f), f, zeilen) }
      }
    } catch { /* keine JSON-Ausgabe */ }
    if (r.exitCode !== 0) { const f = err || `Exitcode ${r.exitCode}`; return fertig(einordnen(f), f.split(/\r?\n/)[0], zeilen) }
    if (err) {
      const f = err.split(/\r?\n/).find(l => l.trim()) || err
      // Meldung im Fehlerkanal: ohne eigentliche Ausgabe = Fehler, mit Ausgabe = „lief, mit Fehlermeldung“
      const st = einordnen(f, out ? 'meldung' : 'fehler')
      return fertig(st, (st === 'meldung' ? 'Meldung: ' : '') + f, aufbereiten((out ? out + '\n' : '') + err, e.geheim))
    }
    return fertig('ok', ersteZeile(zeilen, 'ohne Ausgabe abgeschlossen'), zeilen)
  } catch (x) {
    const f = x instanceof Error ? x.message : String(x)
    return fertig(einordnen(f), f)
  }
}

/** Zufälliges Passwort für das Testkonto (nie gespeichert, nie angezeigt). */
export function testPasswort(): string {
  const a = new Uint32Array(4)
  crypto.getRandomValues(a)
  return 'Bt!' + [...a].map(n => n.toString(36)).join('').slice(0, 18) + 'Q7#'
}
