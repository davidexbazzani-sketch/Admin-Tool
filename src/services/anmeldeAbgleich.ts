// ── Vor jeder Software-Installation: Wer ist angemeldet – und wem gehört das Gerät? ──
// Liest am Ziel-PC alle angemeldeten Benutzer (Konsole, jede Sitzung mit Desktop, gesperrt
// bzw. getrennt) und gleicht sie mit der Zuweisung aus der Endgeräte-/Standort-Übersicht ab.
// Ist jemand anderes als die zugewiesene Person angemeldet, zeigen die Kacheln vor dem Start
// einen Hinweis (AnmeldeCheck.tsx). Nur lesend — am PC wird nichts verändert.
//
// Weg: Invoke-Command (WinRM, braucht die Installation ohnehin). Ist WinRM zu, über CIM per
// DCOM + quser /server — ohne WinRM einzuschalten.

import { create } from 'zustand'
import { api } from '../electronAPI'
import { buildNameIndex, lookupUserByName } from './adUserDirectory'
import type { AdUserListItem } from './adUsersList'
import {
  werteAnmeldungAus, findeZuweisung, gleicheAb, kanonHost, istKennung, vermerkText,
  type AnmeldeAbgleich, type RohAnmeldung, type Zuweisung, type GeraetZuweisung, type InventarZuweisung,
} from './anmeldeAbgleichLogik'

export * from './anmeldeAbgleichLogik'

/** Höchstens so viele Prüfungen gleichzeitig (Netz-Schonung). */
const MAX_PARALLEL = 4
/** So alt darf ein Ergebnis beim Start einer Installation höchstens sein. */
export const FRISCH_FUER_START_MS = 2 * 60_000
/** Ein bestätigter Hinweis gilt so lange (z. B. für „Erneut versuchen"). */
const BESTAETIGT_MS = 10 * 60_000
/** So lange landet das Ergebnis als Vermerk im Installations-Logbuch. */
const VERMERK_MS = 30 * 60_000
const QUELLEN_MS = 5 * 60_000

const schluessel = (host: string) => kanonHost(host).toLowerCase()
const psq = (s: string) => s.replace(/'/g, "''")

// ── Abfrage am PC ────────────────────────────────────────────────────────────

/** Läuft auf dem Ziel-PC (bzw. per DCOM von hier aus) und liefert RohAnmeldung als JSON. */
const REMOTE_BLOCK = `{
  $r = [ordered]@{ konsole = ''; explorer = @(); gesperrt = @(); quser = @() }
  try { $cs = Get-CimInstance Win32_ComputerSystem -EA Stop; if ($cs.UserName) { $r.konsole = [string]$cs.UserName } } catch {}
  $ex = @()
  try {
    foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop)) {
      $o = Invoke-CimMethod -InputObject $p -MethodName GetOwner -EA SilentlyContinue
      if ($o.User) { $ex += [pscustomobject]@{ konto = [string]("$($o.Domain)\\$($o.User)"); sitzung = [int]$p.SessionId } }
    }
  } catch {}
  $r.explorer = $ex
  try { $r.gesperrt = @(Get-Process -Name LogonUI -EA SilentlyContinue | ForEach-Object { [int]$_.SessionId }) } catch {}
  try { $r.quser = @(quser 2>$null | ForEach-Object { [string]$_ }) } catch {}
  ConvertTo-Json -InputObject ([pscustomobject]$r) -Depth 4 -Compress
}`

export function anmeldeSkript(host: string): string {
  const h = psq(host.trim())
  return [
    `$ErrorActionPreference = 'SilentlyContinue'`,
    `$h = '${h}'`,
    `$sb = ${REMOTE_BLOCK}`,
    `$weg = ''; $json = ''; $fehler = ''`,
    `function Offen([string]$ziel, [int]$port) { try { $t = New-Object Net.Sockets.TcpClient; $ok = $t.ConnectAsync($ziel, $port).Wait(2000); $t.Close(); return $ok } catch { return $false } }`,
    `if (Offen $h 5985) {`,
    `  try {`,
    `    $so = New-PSSessionOption -OpenTimeout 10000 -OperationTimeout 25000`,
    `    $json = @(Invoke-Command -ComputerName $h -ScriptBlock $sb -SessionOption $so -EA Stop) | Where-Object { "$_" -like '{*' } | Select-Object -Last 1`,
    `    if ($json) { $weg = 'WinRM' }`,
    `  } catch { $fehler = $_.Exception.Message }`,
    `}`,
    // Ausweg ohne WinRM: CIM über DCOM (RPC 135) + quser /server
    `if (-not $json) {`,
    `  if (Offen $h 135) {`,
    `    try {`,
    `      $co = New-CimSessionOption -Protocol Dcom`,
    `      $cs = New-CimSession -ComputerName $h -SessionOption $co -OperationTimeoutSec 15 -EA Stop`,
    `      $r = [ordered]@{ konsole = ''; explorer = @(); gesperrt = @(); quser = @() }`,
    `      $c = Get-CimInstance -CimSession $cs -ClassName Win32_ComputerSystem -EA SilentlyContinue; if ($c.UserName) { $r.konsole = [string]$c.UserName }`,
    `      $ex = @()`,
    `      foreach ($p in @(Get-CimInstance -CimSession $cs -ClassName Win32_Process -Filter "Name='explorer.exe'" -EA SilentlyContinue)) {`,
    `        $o = Invoke-CimMethod -InputObject $p -MethodName GetOwner -EA SilentlyContinue`,
    `        if ($o.User) { $ex += [pscustomobject]@{ konto = [string]("$($o.Domain)\\$($o.User)"); sitzung = [int]$p.SessionId } }`,
    `      }`,
    `      $r.explorer = $ex`,
    `      $r.gesperrt = @(Get-CimInstance -CimSession $cs -ClassName Win32_Process -Filter "Name='LogonUI.exe'" -EA SilentlyContinue | ForEach-Object { [int]$_.SessionId })`,
    `      Remove-CimSession $cs -EA SilentlyContinue`,
    `      try { $r.quser = @(quser /server:$h 2>$null | ForEach-Object { [string]$_ }) } catch {}`,
    `      $json = ConvertTo-Json -InputObject ([pscustomobject]$r) -Depth 4 -Compress`,
    `      $weg = 'DCOM'`,
    `    } catch { if (-not $fehler) { $fehler = $_.Exception.Message } }`,
    `  } elseif (-not $fehler) { $fehler = 'PC nicht erreichbar (ausgeschaltet oder nicht im Netz).' }`,
    `}`,
    `'@@ANMELDUNG@@' + (ConvertTo-Json -InputObject ([pscustomobject]@{ weg = $weg; fehler = [string]$fehler; daten = [string]$json }) -Compress)`,
  ].join('\n')
}

/** Ausgabe von anmeldeSkript → Rohdaten (oder Fehler). */
export function leseAnmeldeAntwort(stdout: string, stderr = ''): { daten: RohAnmeldung | null; weg?: string; fehler: string } {
  const zeile = (stdout || '').split(/\r?\n/).map(s => s.trim()).find(s => s.startsWith('@@ANMELDUNG@@'))
  if (!zeile) return { daten: null, fehler: kurz(stderr) || 'Keine Antwort vom PC.' }
  try {
    const aus = JSON.parse(zeile.slice('@@ANMELDUNG@@'.length)) as { weg?: string; fehler?: string; daten?: string }
    let daten: RohAnmeldung | null = null
    try { if (aus.daten) daten = JSON.parse(aus.daten) as RohAnmeldung } catch { daten = null }
    return { daten, weg: aus.weg || undefined, fehler: daten ? '' : kurz(aus.fehler || '') || 'Anmeldung ließ sich nicht lesen.' }
  } catch {
    return { daten: null, fehler: 'Antwort vom PC unlesbar.' }
  }
}

function kurz(s: string): string {
  const t = (s || '').replace(/\s+/g, ' ').trim()
  return t.length > 220 ? t.slice(0, 217) + '…' : t
}

// ── Zuweisung + Namen ────────────────────────────────────────────────────────

let quellenCache: { zeit: number; geraete: GeraetZuweisung[]; inventar: InventarZuweisung[] } | null = null
async function ladeQuellen(): Promise<{ geraete: GeraetZuweisung[]; inventar: InventarZuweisung[] }> {
  if (quellenCache && Date.now() - quellenCache.zeit < QUELLEN_MS) return quellenCache
  const [ep, inv] = await Promise.all([
    api().netReadJsonAsync<{ devices?: GeraetZuweisung[] }>('endpoint-devices/devices.json').catch(() => null),
    api().netReadJsonAsync<InventarZuweisung[]>('inventory/inventory.json').catch(() => null),
  ])
  quellenCache = {
    zeit: Date.now(),
    geraete: Array.isArray(ep?.devices) ? ep.devices : [],
    inventar: Array.isArray(inv) ? inv : [],
  }
  return quellenCache
}

interface Verzeichnis { bySam: Map<string, AdUserListItem>; index: Map<string, AdUserListItem> }
let verzCache: { zeit: number; v: Verzeichnis } | null = null
async function ladeVerzeichnis(): Promise<Verzeichnis> {
  if (verzCache && Date.now() - verzCache.zeit < QUELLEN_MS) return verzCache.v
  const d = await api().netReadJsonAsync<{ users?: AdUserListItem[] }>('config/user-overview/ad-users.json').catch(() => null)
  const users = Array.isArray(d?.users) ? d.users : []
  const v: Verzeichnis = { bySam: new Map(users.filter(u => u.sam).map(u => [u.sam.toLowerCase(), u])), index: buildNameIndex(users) }
  verzCache = { zeit: Date.now(), v }
  return v
}

/** Kennung → Anzeigename direkt aus dem AD (für Konten, die nicht im Verzeichnis stehen). */
async function adNamen(sams: string[]): Promise<Map<string, string>> {
  const liste = [...new Set(sams.filter(s => /^[a-z0-9._-]{2,30}$/i.test(s)))]
  const aus = new Map<string, string>()
  if (!liste.length) return aus
  const skript = [
    `Import-Module ActiveDirectory -EA SilentlyContinue`,
    `$gc = ''; try { $gc = (Get-ADRootDSE -EA Stop).dnsHostName + ':3268' } catch {}`,
    `foreach ($s in @(${liste.map(s => `'${psq(s)}'`).join(',')})) {`,
    `  $u = $null`,
    `  try { $u = Get-ADUser -Filter "SamAccountName -eq '$s'" -Properties DisplayName -EA Stop | Select-Object -First 1 } catch {}`,
    `  if (-not $u -and $gc) { try { $u = Get-ADUser -Filter "SamAccountName -eq '$s'" -Server $gc -Properties DisplayName -EA Stop | Select-Object -First 1 } catch {} }`,
    `  if ($u) { $n = [string]$u.DisplayName; if (-not $n) { $n = [string]$u.Name }; '@@AD@@' + $s + '|' + $n }`,
    `}`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(skript, 20000)
    for (const z of (r.stdout || '').split(/\r?\n/)) {
      const m = z.trim().match(/^@@AD@@([^|]+)\|(.+)$/)
      if (m) aus.set(m[1].toLowerCase(), m[2].trim())
    }
  } catch { /* ohne Namen weiter */ }
  return aus
}

function ergaenzeKennung(z: Zuweisung, v: Verzeichnis): Zuweisung {
  if (z.sam) return z
  if (istKennung(z.name)) {
    const u = v.bySam.get(z.name.trim().toLowerCase())
    return u ? { ...z, name: u.displayName || z.name, sam: u.sam } : { ...z, sam: z.name.trim() }
  }
  const u = lookupUserByName(v.index, z.name)
  return u ? { ...z, sam: u.sam } : z
}

/** Eine vollständige Prüfung (ohne Cache). */
export async function pruefeAnmeldung(host: string): Promise<AnmeldeAbgleich> {
  const h = host.trim()
  const [roh, quellen, verz] = await Promise.all([
    api().runPowerShell(anmeldeSkript(h), 70000)
      .then(r => leseAnmeldeAntwort(r.stdout ?? '', r.stderr ?? ''))
      .catch(e => ({ daten: null, weg: undefined, fehler: e instanceof Error ? e.message : 'Abfrage fehlgeschlagen.' })),
    ladeQuellen(),
    ladeVerzeichnis(),
  ])
  let angemeldet = werteAnmeldungAus(roh.daten).map(b => ({ ...b, name: verz.bySam.get(b.sam.toLowerCase())?.displayName || undefined }))
  const ohneName = angemeldet.filter(b => !b.name).map(b => b.sam)
  if (ohneName.length) {
    const ad = await adNamen(ohneName)
    angemeldet = angemeldet.map(b => b.name ? b : { ...b, name: ad.get(b.sam.toLowerCase()) })
  }
  const roheZuweisung = findeZuweisung(h, quellen.geraete, quellen.inventar)
  const zuweisung = roheZuweisung ? ergaenzeKennung(roheZuweisung, verz) : null
  return {
    host: kanonHost(h),
    stufe: gleicheAb(angemeldet, zuweisung, roh.fehler),
    angemeldet,
    zuweisung,
    weg: roh.weg,
    fehler: roh.fehler || undefined,
    geprueftAm: Date.now(),
  }
}

// ── Store: Ergebnisse teilen (Statuszeile ↔ Hinweis vor dem Start) ───────────

let frei = MAX_PARALLEL
const warteschlange: (() => void)[] = []
async function mitPlatz<T>(f: () => Promise<T>): Promise<T> {
  if (frei > 0) frei--
  else await new Promise<void>(r => warteschlange.push(r))
  try { return await f() } finally {
    const naechster = warteschlange.shift()
    if (naechster) naechster(); else frei++
  }
}

interface Eintrag { laeuft: boolean; ergebnis?: AnmeldeAbgleich }
interface AnmeldeState {
  eintraege: Record<string, Eintrag>
  /** Prüft (oder nimmt ein Ergebnis, das höchstens maxAlterMs alt ist). */
  pruefe: (host: string, maxAlterMs?: number) => Promise<AnmeldeAbgleich>
}

const laufend = new Map<string, Promise<AnmeldeAbgleich>>()

export const useAnmeldeStore = create<AnmeldeState>((set, get) => ({
  eintraege: {},
  pruefe: (host, maxAlterMs = 0) => {
    const k = schluessel(host)
    const alt = get().eintraege[k]?.ergebnis
    if (alt && maxAlterMs > 0 && Date.now() - alt.geprueftAm <= maxAlterMs) return Promise.resolve(alt)
    const offen = laufend.get(k)
    if (offen) return offen
    set(s => ({ eintraege: { ...s.eintraege, [k]: { ...s.eintraege[k], laeuft: true } } }))
    const p = mitPlatz(() => pruefeAnmeldung(host))
      .catch((e): AnmeldeAbgleich => ({
        host: kanonHost(host), stufe: 'unbekannt', angemeldet: [], zuweisung: null,
        fehler: e instanceof Error ? e.message : 'Prüfung fehlgeschlagen.', geprueftAm: Date.now(),
      }))
      .then(ergebnis => {
        set(s => ({ eintraege: { ...s.eintraege, [k]: { laeuft: false, ergebnis } } }))
        return ergebnis
      })
      .finally(() => laufend.delete(k))
    laufend.set(k, p)
    return p
  },
}))

/** Ergebnis aus dem Speicher, wenn es höchstens maxAlterMs alt ist. */
export function frischesErgebnis(host: string, maxAlterMs: number): AnmeldeAbgleich | null {
  const e = useAnmeldeStore.getState().eintraege[schluessel(host)]?.ergebnis
  return e && Date.now() - e.geprueftAm <= maxAlterMs ? e : null
}

// ── Bestätigter Hinweis + Vermerk fürs Logbuch ───────────────────────────────

const bestaetigt = new Map<string, number>()
export function merkeBestaetigung(host: string): void { bestaetigt.set(schluessel(host), Date.now()) }
export function istBestaetigt(host: string): boolean {
  const t = bestaetigt.get(schluessel(host))
  return !!t && Date.now() - t < BESTAETIGT_MS
}

/** „Angemeldet: … · zugewiesen: …" für den Logbuch-Eintrag, wenn kurz vorher geprüft wurde. */
export function anmeldeVermerk(host: string): string {
  const e = useAnmeldeStore.getState().eintraege[schluessel(host)]?.ergebnis
  if (!e || Date.now() - e.geprueftAm > VERMERK_MS) return ''
  return vermerkText(e, istBestaetigt(host))
}
