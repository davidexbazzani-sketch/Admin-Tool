// ── PC-Überwachung: Sammler (rein lesend, ein Aufruf je Durchgang) ───────────
// Liest auf dem Ziel-PC die Ereignisprotokolle SEIT dem letzten Durchgang (Uhr des
// PCs) — dadurch gehen keine Ereignisse verloren, auch wenn tagelang niemand prüft.
// Dazu Messwerte (CPU/RAM/C:) und Dienst-Zustände. Keine Änderung am PC.

import { api } from '../electronAPI'
import { b64, fernBefehl, getagged } from '../services/enaioInstall'
import { kontrolle, wirksamesMuster } from './kontrollen'
import type { MonAuswahl, MonRohEreignis, MonSammlerAntwort } from './types'

const TAG = '@@MONSAMMLER@@'
export const MAX_JE_KONTROLLE = 30

export const SAMMLER_INNER = String.raw`
$ErrorActionPreference = 'Continue'
$in = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$t0 = Get-Date
$seit = [DateTimeOffset]::Parse([string]$in.seit).LocalDateTime
$bis = $null; if ($in.bis) { $bis = [DateTimeOffset]::Parse([string]$in.bis).LocalDateTime }
$o = [ordered]@{ ok = $true; jetzt = (Get-Date).ToString('o'); ereignisse = @(); anzahl = @{}; fehlend = @(); messwerte = @{}; dienste = @{} }
try { $o.boot = (Get-CimInstance Win32_OperatingSystem -EA Stop).LastBootUpTime.ToString('o') } catch {}
$liste = New-Object System.Collections.Generic.List[object]
foreach ($q in @($in.q)) {
  if (-not $q) { continue }
  $fh = @{ LogName = [string]$q.log; StartTime = $seit; Id = @($q.ids | ForEach-Object { [int]$_ }) }
  if ($bis) { $fh.EndTime = $bis }
  if ($q.prov) { $fh.ProviderName = @($q.prov | ForEach-Object { [string]$_ }) }
  $ev = @()
  try { $ev = @(Get-WinEvent -FilterHashtable $fh -MaxEvents 400 -EA Stop) }
  catch {
    $m = [string]$_.Exception.Message
    if ($m -notmatch 'No events were found|keine Ereignisse gefunden|Es wurden keine') { $o.fehlend += ([string]$q.k + ' (' + [string]$q.log + '): ' + $m) }
    $ev = @()
  }
  $n = 0; $treffer = 0
  foreach ($e in $ev) {
    $msg = ''; try { $msg = [string]$e.Message } catch {}
    $msg = ($msg -replace '\s+', ' ').Trim()
    $props = @(); try { $props = @($e.Properties | Select-Object -First 14 | ForEach-Object { $v = [string]$_.Value; if ($v.Length -gt 200) { $v.Substring(0, 200) } else { $v } }) } catch {}
    if ($q.muster) { $txt = ([string]$e.ProviderName + ' ' + $msg + ' ' + ($props -join ' ')); if ($txt -notmatch [string]$q.muster) { continue } }
    $treffer++
    if ($n -ge [int]$in.max) { continue }
    $n++
    $daten = @{}
    try { $x = [xml]$e.ToXml(); foreach ($d in @($x.Event.EventData.Data)) { if ($d -and $d.Name) { $v = [string]$d.'#text'; if ($v.Length -gt 200) { $v = $v.Substring(0, 200) }; $daten[[string]$d.Name] = $v } } } catch {}
    if ($msg.Length -gt 400) { $msg = $msg.Substring(0, 400) }
    $liste.Add([ordered]@{ k = [string]$q.k; log = [string]$e.LogName; rid = [int64]$e.RecordId; id = [int]$e.Id; prov = [string]$e.ProviderName; zeit = $e.TimeCreated.ToString('o'); msg = $msg; props = @($props); daten = $daten })
  }
  $o.anzahl[[string]$q.k] = [int]$o.anzahl[[string]$q.k] + $treffer
}
$o.ereignisse = @($liste.ToArray())
if ($in.luecke) {
  $lv = [DateTimeOffset]::Parse([string]$in.luecke.von).LocalDateTime; $lb = [DateTimeOffset]::Parse([string]$in.luecke.bis).LocalDateTime
  $lu = @()
  try { $lu = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; StartTime = $lv; EndTime = $lb; Id = 1, 12, 13, 41, 42, 107, 506, 507, 1074, 6005, 6006, 6008 } -MaxEvents 80 -EA Stop | Where-Object { $_.ProviderName -match 'EventLog|User32|Kernel-Power|Power-Troubleshooter|Kernel-General' }) } catch {}
  $o.luecke = @($lu | Sort-Object TimeCreated | ForEach-Object { $m = ([string]$_.Message -replace '\s+', ' ').Trim(); if ($m.Length -gt 160) { $m = $m.Substring(0, 160) }; [ordered]@{ zeit = $_.TimeCreated.ToString('o'); id = [int]$_.Id; prov = [string]$_.ProviderName; msg = $m } })
}
foreach ($mw in @($in.mess)) {
  try {
    if ($mw -eq 'cpu') { $s = 0; for ($i = 0; $i -lt 3; $i++) { $s += [double](Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -EA Stop).PercentProcessorTime; if ($i -lt 2) { Start-Sleep -Seconds 1 } }; $o.messwerte.cpu = [math]::Round($s / 3) }
    elseif ($mw -eq 'ram') { $os = Get-CimInstance Win32_OperatingSystem -EA Stop; $o.messwerte.ram = [math]::Round(100 - 100 * [double]$os.FreePhysicalMemory / [double]$os.TotalVisibleMemorySize) }
    elseif ($mw -eq 'disk-c') { $d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -EA Stop; $o.messwerte.'disk-c' = [math]::Round(100 * [double]$d.FreeSpace / [math]::Max([double]1, [double]$d.Size), 1) }
  } catch {}
}
foreach ($dn in @($in.dienste)) { if (-not $dn) { continue }; $s = Get-Service -Name ([string]$dn) -EA SilentlyContinue; $o.dienste[[string]$dn] = $(if ($s) { [string]$s.Status } else { 'fehlt' }) }
$o.dauerMs = [int]((Get-Date) - $t0).TotalMilliseconds
'@@MONSAMMLER@@' + ($o | ConvertTo-Json -Depth 6 -Compress)
`

export interface SammlerAuftrag {
  seit: string                 // ISO
  bis?: string                 // ISO (Ende der Laufzeit, wenn schon vorbei)
  kontrollen: MonAuswahl[]
  luecke?: { von: string; bis: string }
}

/** Nutzlast für den Sammler aus den gewählten Kontrollen. */
export function sammlerNutzlast(a: SammlerAuftrag): { seit: string; bis: string | null; q: unknown[]; max: number; luecke: unknown; mess: string[]; dienste: string[] } {
  const q: unknown[] = []
  const mess: string[] = []
  const dienste: string[] = []
  for (const aw of a.kontrollen) {
    const k = kontrolle(aw.id)
    if (!k) continue
    if (k.art === 'ereignis') {
      const muster = wirksamesMuster(k, aw)
      for (const qu of k.quellen || []) q.push({ k: aw.id, log: qu.log, prov: qu.provider || null, ids: qu.ids, muster: muster || null })
    } else if (k.art === 'messwert' && k.messwert && !mess.includes(k.messwert)) mess.push(k.messwert)
    else if (k.art === 'dienst') { const d = (k.dienst || aw.param || '').trim(); if (d && /^[A-Za-z0-9_.\- ]{1,80}$/.test(d) && !dienste.includes(d)) dienste.push(d) }
  }
  return { seit: a.seit, bis: a.bis || null, q, max: MAX_JE_KONTROLLE, luecke: a.luecke || null, mess, dienste }
}

function asArr<T>(v: unknown): T[] { return Array.isArray(v) ? v as T[] : v === undefined || v === null ? [] : [v as T] }

/** Rohantwort → sauberes Objekt (ConvertTo-Json macht aus 1-Element-Listen Objekte). */
export function normalisiereAntwort(j: unknown): MonSammlerAntwort | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : Number(v))
  const ereignisse: MonRohEreignis[] = asArr<Record<string, unknown>>(o.ereignisse).filter(e => e && typeof e === 'object').map(e => ({
    k: String(e.k || ''), log: String(e.log || ''), rid: num(e.rid) || 0, id: num(e.id) || 0, prov: String(e.prov || ''),
    zeit: String(e.zeit || ''), msg: String(e.msg || ''), props: asArr<unknown>(e.props).map(x => String(x ?? '')),
    daten: e.daten && typeof e.daten === 'object' ? Object.fromEntries(Object.entries(e.daten as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])) : {},
  }))
  const zahlen = (v: unknown): Record<string, number> => v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, num(x)]).filter(([, x]) => isFinite(x as number))) : {}
  return {
    ok: o.ok !== false,
    fehler: typeof o.fehler === 'string' ? o.fehler : undefined,
    jetzt: String(o.jetzt || new Date().toISOString()),
    boot: typeof o.boot === 'string' ? o.boot : undefined,
    ereignisse,
    anzahl: zahlen(o.anzahl),
    fehlend: asArr<unknown>(o.fehlend).map(String),
    luecke: o.luecke !== undefined ? asArr<Record<string, unknown>>(o.luecke).map(l => ({ zeit: String(l.zeit || ''), id: num(l.id) || 0, prov: String(l.prov || ''), msg: String(l.msg || '') })) : undefined,
    messwerte: zahlen(o.messwerte),
    dienste: o.dienste && typeof o.dienste === 'object' ? Object.fromEntries(Object.entries(o.dienste as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')])) : {},
    dauerMs: num(o.dauerMs) || undefined,
  }
}

/** Einen Durchgang auf dem Ziel-PC ausführen (WinRM muss erreichbar sein). */
export async function sammle(host: string, a: SammlerAuftrag): Promise<MonSammlerAntwort> {
  const leer = (fehler: string): MonSammlerAntwort => ({ ok: false, fehler, jetzt: new Date().toISOString(), ereignisse: [], anzahl: {}, fehlend: [], messwerte: {}, dienste: {} })
  try {
    const r = await api().runPowerShell(fernBefehl(host, SAMMLER_INNER, TAG, b64(JSON.stringify(sammlerNutzlast(a)))), 120000)
    const j = getagged<unknown>(r.stdout, TAG)
    if (!j) return leer((r.stderr || '').trim().slice(0, 300) || (r.timedOut ? 'Zeitüberschreitung' : 'Keine Antwort vom PC'))
    if ((j as { ok?: boolean }).ok === false) return leer(String((j as { fehler?: string }).fehler || 'Abfrage fehlgeschlagen'))
    return normalisiereAntwort(j) || leer('Antwort nicht lesbar')
  } catch (e) { return leer(e instanceof Error ? e.message : String(e)) }
}

/** Erreichbar? (Ping → 445 → 135 → 5985), vom prüfenden Rechner aus. */
export async function istErreichbar(host: string): Promise<boolean> {
  const h = host.replace(/'/g, "''")
  try {
    const r = await api().runPowerShell(
      `$h='${h}'; $on=$false; try { $on = Test-Connection -ComputerName $h -Count 1 -Quiet -EA SilentlyContinue } catch {}; ` +
      `if (-not $on) { foreach ($p in 445,135,5985) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync($h, $p).Wait(2500)) { $on = $true }; $t.Close() } catch {}; if ($on) { break } } }; ` +
      `if ($on) { 'ONLINE' } else { 'OFFLINE' }`, 20000)
    return (r.stdout || '').includes('ONLINE')
  } catch { return false }
}
