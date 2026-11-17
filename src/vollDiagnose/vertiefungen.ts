// ── PC-Volldiagnose: Vertiefungen (gezielte Lese-Scans bis zur Ursache) ───────
// V1 Bluescreen/Ausschalten · V2 Programmabstürze · V3 Windows Update · V4 Tiefenprüfung
// (DISM ScanHealth + SFC /verifyonly, schwer) · V5 Datenträger. ALLES NUR LESEND.
// V6–V13 folgen in Etappe 2.

import { DISM_INNER, dismAusRoh, DISM_FEHLER, sfcAusRoh, sfcErgebnisAus, type DismErgebnis } from '../services/serverDism'
import { interpretModule, exceptionText } from '../utils/diagnosisAnalysis'
import { datumText, wuRelevant, type EreignisDaten, type Absturz, type WuFehler, type WuOk } from './auswertung'
import { ordneDatentraeger, lwAusText, lerneVolumes, type DatentraegerInfo } from './datentraeger'
import type { VdRoh, VdVertiefung, VdVertiefKontext } from './typen'
import { NUR_ASCII } from './skripte'

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? v as T[] : v == null || v === '' ? [] : [v as T])
const s = (v: unknown) => (v == null ? '' : String(v))
const n = (v: unknown) => { const x = Number(v); return isFinite(x) ? x : NaN }
const ISO_PS = String.raw`function Iso($d) { try { $d.ToUniversalTime().ToString('o') } catch { '' } }`

// ══ V1 Bluescreen / Ausschalten ═══════════════════════════════════════════════
export const V1_PS = String.raw`
${ISO_PS}
$o = [ordered]@{ ok = $true }
$grenze = (Get-Date).AddDays(-30)
$o.bugchecks = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 1001; StartTime = $grenze } -MaxEvents 60 -EA SilentlyContinue | Where-Object { $_.ProviderName -match 'BugCheck|WER-SystemErrorReporting' } | ForEach-Object { $m = ''; try { $m = (([string]$_.Message) -replace '\s+', ' ').Trim() } catch {}; [pscustomobject]@{ t = (Iso $_.TimeCreated); text = $(if ($m.Length -gt 400) { $m.Substring(0, 400) } else { $m }) } })
$o.kp41 = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = $grenze } -MaxEvents 60 -EA SilentlyContinue | ForEach-Object {
  $d = @{}; try { foreach ($x in ([xml]$_.ToXml()).Event.EventData.Data) { $d[[string]$x.Name] = [string]$x.'#text' } } catch {}
  [pscustomobject]@{ t = (Iso $_.TimeCreated); code = [string]$d['BugcheckCode']; taste = [string]$d['PowerButtonTimestamp']; schlaf = [string]$d['SleepInProgress']; standby = [string]$d['ConnectedStandbyInProgress'] } })
$o.whea = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; StartTime = $grenze } -MaxEvents 60 -EA SilentlyContinue | ForEach-Object { $m = ''; try { $m = (([string]$_.Message) -replace '\s+', ' ').Trim() } catch {}; [pscustomobject]@{ t = (Iso $_.TimeCreated); id = $_.Id; lv = [int]$_.Level; text = $(if ($m.Length -gt 300) { $m.Substring(0, 300) } else { $m }) } })
$o.memdiag = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-MemoryDiagnostics-Results'; StartTime = (Get-Date).AddDays(-120) } -MaxEvents 10 -EA SilentlyContinue | ForEach-Object { $m = ''; try { $m = (([string]$_.Message) -replace '\s+', ' ').Trim() } catch {}; [pscustomobject]@{ t = (Iso $_.TimeCreated); id = $_.Id; lv = [int]$_.Level; text = $(if ($m.Length -gt 200) { $m.Substring(0, 200) } else { $m }) } })
$o.tdr = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Display'; Id = 4101; StartTime = $grenze } -MaxEvents 200 -EA SilentlyContinue).Count
# LiveKernel: Windows schreibt je Vorfall ~10 Ereignisse → je Code aufeinanderfolgende binnen 2 min = 1 Vorfall
$lkv = New-Object System.Collections.Generic.List[object]
foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Windows Error Reporting'; Id = 1001; StartTime = $grenze } -MaxEvents 400 -EA SilentlyContinue | Where-Object { [string]$_.Message -match 'LiveKernelEvent' } | Sort-Object TimeCreated)) {
  $m = (([string]$e.Message) -replace '\s+', ' ').Trim()
  $c = [regex]::Match($m, 'P1:\s*([0-9A-Fa-f]+)').Groups[1].Value.ToLower()
  $l = $null; for ($i = $lkv.Count - 1; $i -ge 0; $i--) { if ($lkv[$i].code -eq $c) { $l = $lkv[$i]; break } }
  if ($l -and ($e.TimeCreated - $l.bis).TotalSeconds -le 120) { $l.n++; $l.bis = $e.TimeCreated }
  else { $lkv.Add([pscustomobject]@{ code = $c; von = $e.TimeCreated; bis = $e.TimeCreated; n = 1; text = $(if ($m.Length -gt 300) { $m.Substring(0, 300) } else { $m }) }) }
}
$o.livekernel = @($lkv.ToArray() | Select-Object -Last 40 | ForEach-Object { [pscustomobject]@{ t = (Iso $_.von); code = [string]$_.code; n = [int]$_.n; text = [string]$_.text } })
$o.drossel = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Processor-Power'; Id = 37; StartTime = $grenze } -MaxEvents 200 -EA SilentlyContinue).Count
$md = Join-Path $env:SystemRoot 'Minidump'
$o.dumps = @(if (Test-Path -LiteralPath $md) { Get-ChildItem -LiteralPath $md -Filter *.dmp -File -EA SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 15 | ForEach-Object { [pscustomobject]@{ n = $_.Name; t = (Iso $_.LastWriteTime); kb = [int]($_.Length / 1KB) } } })
$lk = Join-Path $env:SystemRoot 'LiveKernelReports'
$o.lkr = @(if (Test-Path -LiteralPath $lk) { Get-ChildItem -LiteralPath $lk -Recurse -File -Filter *.dmp -EA SilentlyContinue | Where-Object { $_.LastWriteTime -ge $grenze } | Sort-Object LastWriteTime -Descending | Select-Object -First 20 | ForEach-Object { [pscustomobject]@{ n = $_.Name; ordner = $_.Directory.Name; t = (Iso $_.LastWriteTime) } } })
$o.treiber = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-UserPnp'; Id = 20001, 20003; StartTime = (Get-Date).AddDays(-45) } -MaxEvents 80 -EA SilentlyContinue | ForEach-Object { $m = (([string]$_.Message) -replace '\s+', ' ').Trim(); [pscustomobject]@{ t = (Iso $_.TimeCreated); text = $(if ($m.Length -gt 300) { $m.Substring(0, 300) } else { $m }) } })
# Treiber/Firmware über Windows Update (Titel aus den Ereignisdaten; Store-Apps „9…-Name“ sind keine Treiber)
$o.wuTreiber = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 19; StartTime = (Get-Date).AddDays(-45) } -MaxEvents 150 -EA SilentlyContinue | ForEach-Object {
  $wd = @{}; try { foreach ($x in ([xml]$_.ToXml()).Event.EventData.Data) { $wd[[string]$x.Name] = [string]$x.'#text' } } catch {}
  $ti = [string]$wd['updateTitle']; if (-not $ti) { $ti = (([string]$_.Message) -replace '\s+', ' ').Trim() }
  [pscustomobject]@{ t = (Iso $_.TimeCreated); text = $(if ($ti.Length -gt 220) { $ti.Substring(0, 220) } else { $ti }) }
} | Where-Object { $_.text -match 'Treiber|Driver|Firmware|BIOS|Display|Graphics|Grafik|Audio|Network|Bluetooth|Chipset|System' -and $_.text -notmatch '^9[A-Z0-9]{11}-' } | Select-Object -First 30)
try { $b = Get-CimInstance Win32_BIOS -EA Stop; $o.bios = [string]$b.SMBIOSBIOSVersion; if ($b.ReleaseDate) { $o.biosDatum = $b.ReleaseDate.ToUniversalTime().ToString('o') } } catch {}
$o | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`

const BUGCHECK_NAME: Record<number, string> = {
  0x0a: 'IRQL_NOT_LESS_OR_EQUAL', 0x19: 'BAD_POOL_HEADER', 0x1a: 'MEMORY_MANAGEMENT', 0x1e: 'KMODE_EXCEPTION_NOT_HANDLED', 0x24: 'NTFS_FILE_SYSTEM',
  0x3b: 'SYSTEM_SERVICE_EXCEPTION', 0x4e: 'PFN_LIST_CORRUPT', 0x50: 'PAGE_FAULT_IN_NONPAGED_AREA', 0x74: 'BAD_SYSTEM_CONFIG_INFO', 0x77: 'KERNEL_STACK_INPAGE_ERROR',
  0x7a: 'KERNEL_DATA_INPAGE_ERROR', 0x7b: 'INACCESSIBLE_BOOT_DEVICE', 0x7e: 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED', 0x9c: 'MACHINE_CHECK_EXCEPTION',
  0x9f: 'DRIVER_POWER_STATE_FAILURE', 0xa0: 'INTERNAL_POWER_ERROR', 0xc2: 'BAD_POOL_CALLER', 0xc4: 'DRIVER_VERIFIER_DETECTED_VIOLATION', 0xd1: 'DRIVER_IRQL_NOT_LESS_OR_EQUAL',
  0xed: 'UNMOUNTABLE_BOOT_VOLUME', 0xef: 'CRITICAL_PROCESS_DIED', 0xf4: 'CRITICAL_OBJECT_TERMINATION', 0x101: 'CLOCK_WATCHDOG_TIMEOUT', 0x109: 'CRITICAL_STRUCTURE_CORRUPTION',
  0x10e: 'VIDEO_MEMORY_MANAGEMENT_INTERNAL', 0x113: 'VIDEO_DXGKRNL_FATAL_ERROR', 0x116: 'VIDEO_TDR_FAILURE', 0x117: 'VIDEO_TDR_TIMEOUT_DETECTED', 0x119: 'VIDEO_SCHEDULER_INTERNAL_ERROR',
  0x124: 'WHEA_UNCORRECTABLE_ERROR', 0x12b: 'FAULTY_HARDWARE_CORRUPTED_PAGE', 0x133: 'DPC_WATCHDOG_VIOLATION', 0x139: 'KERNEL_SECURITY_CHECK_FAILURE',
  0x13a: 'KERNEL_MODE_HEAP_CORRUPTION', 0x14f: 'PDC_WATCHDOG_TIMEOUT', 0x154: 'UNEXPECTED_STORE_EXCEPTION', 0x15f: 'CONNECTED_STANDBY_WATCHDOG_TIMEOUT_LIVEDUMP',
}
/** LiveKernelEvent-Codes (P1) laut Bugcheck-Referenz — nur die, deren Bedeutung sicher ist. */
export const LK_NAME: Record<string, string> = {
  '117': 'VIDEO_TDR_TIMEOUT_DETECTED', '141': 'VIDEO_ENGINE_TIMEOUT_DETECTED', '144': 'BUGCODE_USB3_DRIVER', '15f': 'CONNECTED_STANDBY_WATCHDOG_TIMEOUT',
  '193': 'VIDEO_DXGKRNL_LIVEDUMP', '1a1': 'WIN32K_CALLOUT_WATCHDOG', '1a5': 'USB_DRIPS_BLOCKER_SURPRISE_REMOVAL', '1a6': 'BLUETOOTH_ERROR_RECOVERY',
  '1a8': 'VIDEO_DXGKRNL_BLACK_SCREEN', '1b0': 'VIDEO_MINIPORT_FAILED', '1b8': 'VIDEO_MINIPORT_BLACK_SCREEN', '1c8': 'MANUALLY_INITIATED_POWER_BUTTON_HOLD',
  '1dd': 'BUGCODE_MBBADAPTER_DRIVER', '1de': 'BUGCODE_WIFIADAPTER_DRIVER',
}
export const LK_GRAFIK = /^(117|141|193|1a8|1b0|1b8)$/
export interface LkVorfall { t: string; code: string; n: number; text: string }
export function leseLiveKernel(v: unknown): LkVorfall[] {
  return arr<{ t: unknown; code?: unknown; n?: unknown; text: unknown }>(v).map(x => ({ t: s(x.t), code: (s(x.code) || /P1:\s*([0-9a-f]+)/i.exec(s(x.text))?.[1] || '').toLowerCase(), n: n(x.n) || 1, text: s(x.text) }))
}
export const lkText = (x: LkVorfall) => `${datumText(x.t)}: Live-Kernel 0x${x.code.toUpperCase() || '?'}${LK_NAME[x.code] ? ' ' + LK_NAME[x.code] : ''}${x.n > 1 ? ` (${x.n} Meldungen)` : ''}`

const HW = new Set([0x124, 0x9c, 0x101, 0x12b])
const SPEICHER = new Set([0x1a, 0x4e, 0x109])
const UNSICHER = new Set([0x50, 0x19, 0xc2, 0x139, 0x13a])
const PLATTE = new Set([0x7a, 0x77, 0xf4, 0xed, 0x24, 0x7b, 0x154])
const GRAFIK = new Set([0x116, 0x119, 0x10e, 0x113, 0x117])
const TREIBER = new Set([0xd1, 0x0a, 0x7e, 0x3b, 0x1e, 0x9f, 0xc4, 0x133, 0x14f, 0x15f, 0xa0])
const SYSTEM = new Set([0xef, 0x74])

/** „0x0000007e (0x…)“ → 0x7e; 0x1000007e → 0x7e. */
export function bugcheckCode(text: string): number | null {
  const m = /0x([0-9a-f]{8})\b/i.exec(text || '')
  if (!m) return null
  let c = parseInt(m[1], 16)
  if (c >= 0x10000000 && c < 0x20000000) c -= 0x10000000
  return c
}
export const bugcheckText = (c: number) => `0x${c.toString(16).toUpperCase()}${BUGCHECK_NAME[c] ? ' ' + BUGCHECK_NAME[c] : ''}`

/** Treiber-Installation aus UserPnp 20001/20003 bzw. WU-Ereignis 19. */
export function treiberAusText(t: string): string {
  const m = /(?:des Treibers|install driver|Treiber)\s+(\S+\.inf|\S+)/i.exec(t || '') || /(?:Folgendes Update wurde erfolgreich installiert|successfully installed the following update):\s*(.+)$/i.exec(t || '')
  return (m?.[1] || '').replace(/[.,]$/, '').slice(0, 120)
}

export function werteV1(d: Record<string, unknown>, ctx: VdVertiefKontext): VdRoh[] {
  const roh: VdRoh[] = []
  const bcs = arr<{ t: string; text: string }>(d.bugchecks).map(b => ({ t: s(b.t), code: bugcheckCode(s(b.text)), text: s(b.text) }))
  const kp = arr<{ t: string; code: string; taste: string; schlaf: string; standby: string }>(d.kp41)
  // Kernel-Power 41 mit Code, aber ohne Bluescreen-Ereignis → auch als Absturz zählen
  for (const k of kp) { const c = parseInt(s(k.code), 10); if (c > 0 && !bcs.some(b => Math.abs(new Date(b.t).getTime() - new Date(k.t).getTime()) < 15 * 60_000)) bcs.push({ t: s(k.t), code: c, text: `Kernel-Power 41 mit Code ${c}` }) }
  const codes = bcs.filter(b => b.code !== null) as { t: string; code: number; text: string }[]
  const erster = codes.map(c => c.t).sort()[0]
  const treiber = [
    // UserPnp 20001 = Treiber installiert (20003 „Hinzufügen von Dienst“ ist nur die Dienst-Registrierung)
    ...arr<{ t: string; text: string }>(d.treiber).filter(x => (/0x0\b|0x00000000/.test(s(x.text)) || !/0x[0-9a-f]{8}/i.test(s(x.text))) && !/Hinzufügen von Dienst|adding (the )?service/i.test(s(x.text))).map(x => ({ t: s(x.t), name: treiberAusText(s(x.text)) || 'Treiber', quelle: 'Geräteinstallation' })),
    ...arr<{ t: string; text: string }>(d.wuTreiber).map(x => ({ t: s(x.t), name: treiberAusText(s(x.text)) || s(x.text).slice(0, 80), quelle: 'Windows Update' })),
    ...(ctx.kontext?.aenderungen || []).filter(a => a.kat === 'treiber').map(a => ({ t: a.am, name: a.text, quelle: 'Änderungsverlauf' })),
  ].filter(x => x.t)
  const vorErstem = erster ? treiber.filter(x => { const dt = new Date(erster).getTime() - new Date(x.t).getTime(); return dt >= 0 && dt <= 3 * 86400_000 }) : []
  const zaehle = (set: Set<number>) => codes.filter(c => set.has(c.code))
  const codeListe = [...new Map(codes.map(c => [c.code, codes.filter(x => x.code === c.code).length])).entries()].map(([c, k]) => `${bugcheckText(c)}: ${k}×`)
  const dumps = arr<{ n: string; t: string; kb: number }>(d.dumps)
  const lkr = arr<{ n: string; ordner: string; t: string }>(d.lkr)
  const belegeBasis = [
    ...(codeListe.length ? [`Bluescreen-Codes (30 Tage): ${codeListe.join(' · ')}`] : []),
    ...(dumps.length ? [`Speicherabbilder: ${dumps.slice(0, 5).map(x => `${x.n} (${datumText(x.t)})`).join(', ')}`] : []),
    ...(lkr.length ? [`Live-Kernel-Berichte: ${[...new Set(lkr.map(x => x.ordner))].join(', ')}`] : []),
    ...(d.bios ? [`BIOS ${s(d.bios)}${d.biosDatum ? ' vom ' + datumText(s(d.biosDatum)).slice(0, 10) : ''}`] : []),
  ]
  const wheaSchwer = arr<{ lv: number; text: string; t: string }>(d.whea).filter(w => n(w.lv) <= 2)
  const memFehler = arr<{ lv: number; text: string; id: number }>(d.memdiag).filter(m => n(m.lv) <= 3 && /fehler|error|problem/i.test(s(m.text)) && !/keine fehler|no errors/i.test(s(m.text)))
  if (zaehle(HW).length || wheaSchwer.length) roh.push({ typ: 'v1-hardware', text: `Hardwarefehler: ${zaehle(HW).length} Bluescreen(s) mit Hardware-Code, ${wheaSchwer.length} schwere WHEA-Meldung(en)`, belege: [...belegeBasis, ...wheaSchwer.slice(0, 3).map(w => `WHEA ${datumText(w.t)}: ${w.text.slice(0, 200)}`)] })
  const speicherCodes = new Set(codes.filter(c => SPEICHER.has(c.code) || UNSICHER.has(c.code)).map(c => c.code))
  if (memFehler.length || zaehle(SPEICHER).length >= 2 || (speicherCodes.size >= 2 && !vorErstem.length)) roh.push({ typ: 'v1-speicher', text: `Arbeitsspeicher verdächtig: ${speicherCodes.size} verschiedene Speicher-Codes${memFehler.length ? ', Speicherdiagnose meldet Fehler' : ''}`, belege: [...belegeBasis, ...memFehler.map(m => `Speicherdiagnose: ${m.text}`)] })
  if (zaehle(PLATTE).length) roh.push({ typ: 'v1-datentraeger', text: `${zaehle(PLATTE).length} Bluescreen(s) mit Datenträger-Code (Auslagerungs- bzw. Bootgerät nicht lesbar)`, belege: belegeBasis })
  const lkAlle = leseLiveKernel(d.livekernel)
  const lk = lkAlle.filter(x => LK_GRAFIK.test(x.code))
  const tdr = n(d.tdr) || 0, gBs = zaehle(GRAFIK).length
  if (gBs || tdr >= 2 || lk.length) {
    const teile = [gBs && `${gBs} Bluescreen(s)`, tdr && `${tdr}× „Anzeigetreiber wurde wiederhergestellt“`, lk.length && `${lk.length}× Grafik hing und wurde ohne Bluescreen zurückgesetzt`].filter(Boolean)
    const tage = new Set(lk.map(x => x.t.slice(0, 10)))
    // Seit wann? Nur wenn der Beginn sicher im 30-Tage-Fenster liegt: Treiberänderungen 3 Tage davor
    const beginn = lk.map(x => x.t).sort()[0]
    const klar = !!beginn && new Date(beginn).getTime() - (Date.now() - 30 * 86400_000) > 3 * 86400_000
    const GRAFIK_TREIBER = /Grafik|Graphics|Display|Video|NVIDIA|GeForce|Quadro|RTX|Radeon|AMD|Intel.*(UHD|Iris|Arc|System)/i
    const davor = klar ? treiber.filter(x => { const dt = new Date(beginn).getTime() - new Date(x.t).getTime(); return dt >= 0 && dt <= 3 * 86400_000 }).sort((a, b) => Number(GRAFIK_TREIBER.test(b.name)) - Number(GRAFIK_TREIBER.test(a.name))) : []
    // Einzelne Vorfälle an einem Tag: Hinweis; wiederkehrend bzw. mit Bluescreen: Warnung (Katalog)
    roh.push({ typ: 'v1-grafik', schwereFest: gBs || tdr >= 3 || lk.length >= 4 || tage.size >= 2 ? undefined : 'hinweis',
      text: `Grafiktreiber (30 Tage): ${teile.join(', ')}${klar && lk.length ? ` – seit ${datumText(beginn).slice(0, 10)}` : ''}${davor.length ? `; kurz davor geändert: ${[...new Set(davor.map(x => x.name))].slice(0, 2).join(', ')}` : ''}`,
      belege: [...(davor.length ? [`Treiberänderungen in den 3 Tagen vor dem ersten Grafik-Hänger (${datumText(beginn)}):`, ...davor.slice(0, 5).map(x => `  ${datumText(x.t)} · ${x.quelle}: ${x.name}`)] : []),
        ...belegeBasis, ...lk.slice(-5).reverse().map(lkText)] })
  }
  if (zaehle(SYSTEM).length) roh.push({ typ: 'v1-systemdateien', text: `${zaehle(SYSTEM).length} Bluescreen(s) „kritischer Prozess beendet“ – passt zu beschädigten Systemdateien`, belege: belegeBasis })
  const treiberCodes = codes.filter(c => TREIBER.has(c.code) || UNSICHER.has(c.code))
  if (treiberCodes.length && !roh.some(r => r.typ === 'v1-hardware')) {
    const kb = /KB\d{6,8}/i.exec(vorErstem.map(x => x.name).join(' '))?.[0]
    roh.push({ typ: 'v1-treiber', schwereFest: vorErstem.length ? 'kritisch' : 'warnung',
      text: vorErstem.length ? `${treiberCodes.length} Bluescreen(s) mit Treiber-Code – in den 3 Tagen vor dem ersten Absturz geändert: ${[...new Set(vorErstem.map(x => x.name))].slice(0, 3).join(', ')}`
        : `${treiberCodes.length} Bluescreen(s) mit Treiber-Code – keine Treiberänderung direkt davor gefunden; Treiberstand prüfen`,
      belege: [...belegeBasis, ...vorErstem.slice(0, 6).map(x => `${datumText(x.t)} · ${x.quelle}: ${x.name}`)], eingabe: kb })
  }
  // Ausschalten ohne Bluescreen: Ein/Aus-Taste, Stromverlust, Hitze. Die gedrückt gehaltene Taste
  // hinterlässt oft keinen Zeitstempel in Kernel-Power 41, aber einen LiveKernel-Bericht 0x1C8
  // (wird nach dem Neustart geschrieben → bis 60 min danach bzw. 5 min davor).
  const ohneCode = kp.filter(k => s(k.code) === '0' || s(k.code) === '')
  const halten = lkAlle.filter(x => x.code === '1c8')
  const gehalten = (k: { t: string }) => halten.some(x => { const dt = new Date(x.t).getTime() - new Date(k.t).getTime(); return dt >= -5 * 60_000 && dt <= 60 * 60_000 })
  const taste = ohneCode.filter(k => (s(k.taste) && s(k.taste) !== '0') || gehalten(k))
  const strom = ohneCode.filter(k => !taste.includes(k))
  const drossel = n(d.drossel) || 0
  if (taste.length) roh.push({ typ: 'v1-ausschalter', text: `${taste.length}× mit der Ein/Aus-Taste hart ausgeschaltet (30 Tage)`, belege: taste.slice(0, 5).map(k => `${datumText(k.t)}${gehalten(k) ? ' (Taste gedrückt gehalten, Live-Kernel 0x1C8)' : ''}`) })
  if (strom.length && drossel >= 3) roh.push({ typ: 'v1-hitze', text: `${strom.length}× plötzlich aus und ${drossel}× Prozessor-Drosselung – passt zu Überhitzung`, belege: strom.slice(0, 5).map(k => datumText(k.t)) })
  else if (strom.length) roh.push({ typ: 'v1-strom', schwereFest: strom.length >= 2 ? undefined : 'hinweis',
    text: `${strom.length}× plötzlich aus – ohne Bluescreen und ohne erkannten Tastendruck (Strom, Netzteil, Akku – oder Ein/Aus-Taste lange gedrückt)`,
    belege: strom.slice(0, 5).map(k => `${datumText(k.t)}${s(k.schlaf) === '1' ? ' (im Standby)' : ''}${s(k.standby) === 'true' ? ' (im Modern Standby)' : ''}`) })
  else if (drossel >= 3 && !roh.length) roh.push({ typ: 'v1-hitze', text: `${drossel}× Prozessor-Drosselung durch die Firmware (30 Tage)`, belege: [] })
  if (!roh.length && (codes.length || ctx.ausloeser.some(b => b.typ === 'evt:bluescreen' || b.typ === 'evt:hart-aus'))) roh.push({ typ: 'v1-unklar', text: codes.length ? `${codes.length} Bluescreen(s) ohne eindeutiges Muster` : 'Abstürze/Ausschalten ohne auswertbare Details', belege: belegeBasis })
  return roh
}

// ══ V2 Programmabstürze ═══════════════════════════════════════════════════════
export const V2_PS = String.raw`
${ISO_PS}
$o = [ordered]@{ ok = $true }
$grenze = (Get-Date).AddDays(-30)
$o.crashes = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000; StartTime = $grenze } -MaxEvents 500 -EA SilentlyContinue | ForEach-Object {
  $p = @(); try { $p = @($_.Properties | ForEach-Object { $_.Value }) } catch {}
  if ($p.Count -gt 6) { $code = ''; try { $code = ('0x{0:x8}' -f [uint32]$p[6]) } catch { $code = [string]$p[6] }
    [pscustomobject]@{ app = [string]$p[0]; appVer = [string]$p[1]; modul = [string]$p[3]; modVer = [string]$p[4]; code = $code; offset = $(if ($p.Count -gt 7) { [string]$p[7] } else { '' }); appPfad = $(if ($p.Count -gt 10) { [string]$p[10] } else { '' }); modPfad = $(if ($p.Count -gt 11) { [string]$p[11] } else { '' }); t = (Iso $_.TimeCreated) } } })
$o.dotnet = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = '.NET Runtime'; Id = 1026; StartTime = $grenze } -MaxEvents 40 -EA SilentlyContinue | ForEach-Object { $m = (([string]$_.Message) -replace '\s+', ' ').Trim(); [pscustomobject]@{ t = (Iso $_.TimeCreated); text = $(if ($m.Length -gt 500) { $m.Substring(0, 500) } else { $m }) } })
# Office-Add-ins (Maschine + angemeldeter Benutzer) und von Office abgeschaltete Add-ins
$sid = $null
try { $u = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).UserName; if ($u) { $sid = (New-Object System.Security.Principal.NTAccount($u)).Translate([System.Security.Principal.SecurityIdentifier]).Value } } catch {}
$wurzeln = @('HKLM:\SOFTWARE\Microsoft\Office', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office')
if ($sid -and (Test-Path ('Registry::HKEY_USERS\' + $sid))) { $wurzeln += ('Registry::HKEY_USERS\' + $sid + '\Software\Microsoft\Office') }
function Dll([string]$progId) {
  foreach ($c in 'HKLM:\SOFTWARE\Classes', 'HKLM:\SOFTWARE\WOW6432Node\Classes') {
    $clsid = [string](Get-ItemProperty -LiteralPath (Join-Path $c ($progId + '\CLSID')) -EA SilentlyContinue).'(default)'
    if ($clsid) { foreach ($c2 in 'HKLM:\SOFTWARE\Classes\CLSID', 'HKLM:\SOFTWARE\WOW6432Node\Classes\CLSID') { $v = [string](Get-ItemProperty -LiteralPath (Join-Path $c2 ($clsid + '\InprocServer32')) -EA SilentlyContinue).'(default)'; if ($v) { return $v } } }
  }
  return ''
}
$o.addins = @(foreach ($w in $wurzeln) { foreach ($app in 'Outlook', 'Word', 'Excel', 'PowerPoint') {
  $k = Join-Path $w ($app + '\Addins')
  if (Test-Path -LiteralPath $k) { foreach ($a in @(Get-ChildItem -LiteralPath $k -EA SilentlyContinue)) { $p = Get-ItemProperty -LiteralPath $a.PSPath -EA SilentlyContinue; [pscustomobject]@{ app = $app; id = [string]$a.PSChildName; name = [string]$p.FriendlyName; lb = [int]$p.LoadBehavior; dll = (Dll ([string]$a.PSChildName)) } } }
} })
$o.abgeschaltet = @(if ($sid) { foreach ($app in 'Outlook', 'Word', 'Excel', 'PowerPoint') {
  foreach ($teil in 'DisabledItems', 'CrashingAddinList') {
    $k = 'Registry::HKEY_USERS\' + $sid + '\Software\Microsoft\Office\16.0\' + $app + '\Resiliency\' + $teil
    if (Test-Path -LiteralPath $k) { $p = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
      foreach ($pr in @($p.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) {
        $txt = [string]$pr.Name
        if ($pr.Value -is [byte[]]) { try { $txt = ([Text.Encoding]::Unicode.GetString($pr.Value) -replace '[^\x20-\x7EÀ-ſ\\:.]', ' ' -replace '\s+', ' ').Trim() } catch {} }
        [pscustomobject]@{ app = $app; art = $teil; text = $(if ($txt.Length -gt 200) { $txt.Substring(0, 200) } else { $txt }) } } } } } })
$o.module = @(foreach ($m in @($P.module)) { $pf = [Environment]::ExpandEnvironmentVariables([string]$m)
  if ($pf -and (Test-Path -LiteralPath $pf)) { $sig = ''; try { $sg = Get-AuthenticodeSignature -LiteralPath $pf -EA SilentlyContinue; if ($sg.SignerCertificate) { $sig = [string]$sg.SignerCertificate.Subject } } catch {}
    $vi = (Get-Item -LiteralPath $pf -EA SilentlyContinue).VersionInfo; [pscustomobject]@{ pfad = $pf; signiert = $sig; firma = [string]$vi.CompanyName; version = [string]$vi.FileVersion } } })
$o | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`

const OFFICE_APP = /^(outlook|winword|excel|powerpnt|onenote|msaccess|mspub|visio|lync|teams)\.exe$/i
const OFFICE_MODUL = /^(mso|mso\d+win32client|mso20win32client|mso30win32client|mso40uiwin32client|mso50win32client|mso98win32client|olmapi32|outlook|wwlib|excel|ppcore|oart|riched20|msosvg)\b/i
const GRAFIK_MODUL = /^(ig[a-z0-9]+|nvwgf|nvd3d|nvoglv|nvldumd|atig|atiumd|aticfx|amdxx|amdvlk|d3d\d+|dxgi|igd)/i
const LAUFZEIT_MODUL = /^(msvcp\d+|vcruntime\d+|msvcr\d+|ucrtbase|concrt\d+|mfc\d+)\w*\.dll$/i
const DOTNET_MODUL = /^(clr|coreclr|mscorwks|clrjit|mscorlib\.ni|system\.\S+\.ni)\.dll$/i
const SYS_MODUL = /^(ntdll|kernelbase|kernel32|combase|msvcrt)\.dll$/i
const SAP_APP = /^(saplogon|sapgui|saplgpad|nwbc)\.exe$/i
const SW_APP = /^sldworks\.exe$/i

export interface AbsturzGruppe { app: string; modul: string; code: string; anzahl: number; modPfad: string; appPfad: string; appVer: string; letzte: string }
export function gruppiereAbstuerze(c: Absturz[]): AbsturzGruppe[] {
  const m = new Map<string, AbsturzGruppe>()
  for (const x of c) {
    const k = `${x.app.toLowerCase()}|${x.modul.toLowerCase()}|${x.code}`
    const g = m.get(k) || { app: x.app, modul: x.modul, code: x.code, anzahl: 0, modPfad: x.modPfad, appPfad: x.appPfad, appVer: x.appVer, letzte: '' }
    g.anzahl++; if (x.t > g.letzte) g.letzte = x.t; if (!g.modPfad && x.modPfad) g.modPfad = x.modPfad
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => b.anzahl - a.anzahl)
}

export function werteV2(d: Record<string, unknown>, ctx: VdVertiefKontext): VdRoh[] {
  const roh: VdRoh[] = []
  const crashes = arr<Absturz>(d.crashes).map(x => ({ ...x, code: s(x.code).toLowerCase() }))
  const gruppen = gruppiereAbstuerze(crashes)
  const addins = arr<{ app: string; id: string; name: string; lb: number; dll: string }>(d.addins)
  const aus = arr<{ app: string; art: string; text: string }>(d.abgeschaltet)
  const module = arr<{ pfad: string; signiert: string; firma: string; version: string }>(d.module)
  const shellext = arr<{ dll: string; name: string; hersteller: string }>((ctx.roh.zusatz as Record<string, unknown> | undefined)?.shellext)
  const dotnet = arr<{ t: string; text: string }>(d.dotnet)
  const datei = (p: string) => (p.split('\\').pop() || p).toLowerCase()
  // Viele verschiedene Programme im selben Systemmodul → Systemdateien/Speicher
  const sysApps = new Set(gruppen.filter(g => SYS_MODUL.test(g.modul)).map(g => g.app.toLowerCase()))
  if (sysApps.size >= 3) roh.push({ typ: 'v2-systemdll', text: `${sysApps.size} verschiedene Programme stürzen in ntdll/KERNELBASE ab`, belege: gruppen.filter(g => SYS_MODUL.test(g.modul)).slice(0, 6).map(g => `${g.app} → ${g.modul} (${g.code}) ${g.anzahl}×`) })
  for (const g of gruppen.slice(0, 8)) {
    if (g.anzahl < 2 && gruppen.length > 3) continue
    const app = g.app.toLowerCase(), mod = g.modul.toLowerCase()
    const info = interpretModule(g.modul, g.modPfad)
    const mi = module.find(x => datei(x.pfad) === mod)
    const fach = SAP_APP.test(app) ? 'sap-fehlersuche' as const : SW_APP.test(app) ? 'solidworks-diagnose' as const : undefined
    const kopf = `${g.app} → ${g.modul}${g.code ? ` (${g.code}${exceptionText(g.code) ? ' ' + exceptionText(g.code) : ''})` : ''}: ${g.anzahl}× in 30 Tagen`
    const belege = [kopf, ...(g.modPfad ? [`Modul: ${g.modPfad}`] : []), ...(mi ? [`Hersteller: ${mi.firma || '—'} · signiert: ${mi.signiert ? mi.signiert.replace(/^CN=([^,]+).*/, '$1') : 'nein'} · Version ${mi.version || g.modPfad}`] : []), ...(g.appVer ? [`Programmversion ${g.appVer}`] : []), ...(info.hint ? [info.hint] : [])]
    const basis = { titel: `${g.app.replace(/\.exe$/i, '')} stürzt ab (${g.modul})`, belege, anzahl: g.anzahl, zuletzt: g.letzte, suche: `${g.app.replace(/\.exe$/i, '')} stürzt ab`, fachdiagnose: fach }
    if (SYS_MODUL.test(g.modul) && sysApps.size >= 3) continue
    const appKurz = app.replace(/\.exe$/, '')
    const appName = ({ outlook: 'Outlook', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint' } as Record<string, string>)[appKurz]
    const addin = OFFICE_APP.test(app) ? addins.find(a => a.dll && datei(a.dll) === mod) : undefined
    const abgeschaltet = appName ? aus.filter(a => a.app === appName) : []
    if (addin || (OFFICE_APP.test(app) && !OFFICE_MODUL.test(mod) && info.kind === 'shellext')) {
      roh.push({ ...basis, typ: 'v2-addin', text: `${appName || g.app} stürzt im Add-in ${addin ? `„${addin.name || addin.id}“` : g.modul} ab`, eingabe: addin && appName ? `${appName}: ${addin.id}` : undefined, belege: [...belege, ...abgeschaltet.slice(0, 3).map(a => `Office hat abgeschaltet (${a.art}): ${a.text}`)] })
    } else if (OFFICE_APP.test(app) && (OFFICE_MODUL.test(mod) || mod === app)) {
      roh.push({ ...basis, typ: 'v2-office', text: `${appName || g.app} stürzt in Office selbst ab (${g.modul})`, belege: [...belege, ...abgeschaltet.slice(0, 3).map(a => `Office hat abgeschaltet (${a.art}): ${a.text}`)] })
    } else if (GRAFIK_MODUL.test(mod) || info.kind === 'gpu') {
      roh.push({ ...basis, typ: 'v2-grafik', text: `${g.app} stürzt im Grafiktreiber ab (${g.modul})` })
    } else if (LAUFZEIT_MODUL.test(mod)) {
      roh.push({ ...basis, typ: 'v2-laufzeit', text: `${g.app} stürzt in der Visual-C++-Laufzeit ${g.modul} ab` })
    } else if (DOTNET_MODUL.test(mod) || g.code === '0xe0434352' || dotnet.some(x => x.text.toLowerCase().includes(app))) {
      const dn = dotnet.find(x => x.text.toLowerCase().includes(app))
      roh.push({ ...basis, typ: 'v2-dotnet', text: `${g.app} beendet sich mit einer .NET-Ausnahme`, belege: [...belege, ...(dn ? [`.NET: ${dn.text.slice(0, 300)}`] : [])] })
    } else if (app === 'explorer.exe' && (info.kind === 'shellext' || shellext.some(x => datei(x.dll) === mod))) {
      const se = shellext.find(x => datei(x.dll) === mod)
      roh.push({ ...basis, typ: 'v2-shellext', text: `Explorer stürzt in ${se ? `„${se.name || g.modul}“ (${se.hersteller.replace(/^CN=([^,]+).*/, '$1') || 'unbekannter Hersteller'})` : g.modul} ab`, eingabe: se?.dll })
    } else if (mod === app || (g.modPfad && g.appPfad && g.modPfad.toLowerCase().startsWith(g.appPfad.toLowerCase().replace(/[^\\]+$/, '')))) {
      roh.push({ ...basis, typ: 'v2-programm', text: `${g.app} stürzt in eigenem Code ab (${g.modul})` })
    } else {
      roh.push({ ...basis, typ: 'v2-unklar', text: `${g.app} stürzt in ${g.modul} ab – nicht eindeutig zuzuordnen` })
    }
  }
  return roh
}

// ══ V3 Windows Update ═════════════════════════════════════════════════════════
export const V3_PS = String.raw`
${ISO_PS}
$o = [ordered]@{ ok = $true }
try {
  $sess = New-Object -ComObject Microsoft.Update.Session
  $su = $sess.CreateUpdateSearcher()
  $anz = $su.GetTotalHistoryCount()
  $o.verlauf = @(if ($anz -gt 0) { $su.QueryHistory(0, [math]::Min($anz, 150)) | ForEach-Object { $ti = [string]$_.Title; $gu = ''; try { $gu = ([string]$_.UpdateIdentity.UpdateID).Trim('{}').ToLower() } catch {}
    [pscustomobject]@{ t = (Iso $_.Date); titel = $(if ($ti.Length -gt 160) { $ti.Substring(0, 160) } else { $ti }); erg = [int]$_.ResultCode; hr = ('0x{0:x8}' -f [int]$_.HResult); op = [int]$_.Operation; guid = $gu; dienst = ([string]$_.ServiceID).Trim('{}').ToLower() } } })
} catch { $o.verlaufFehler = [string]$_.Exception.Message }
$pol = @{}
foreach ($k in 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate', 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU') {
  $p = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
  if ($p) { foreach ($n in 'WUServer', 'WUStatusServer', 'UseWUServer', 'DisableWindowsUpdateAccess', 'DoNotConnectToWindowsUpdateInternetLocations', 'SetDisableUXWUAccess', 'DeferQualityUpdates', 'DeferQualityUpdatesPeriodInDays', 'PauseQualityUpdatesStartTime', 'NoAutoUpdate', 'AUOptions', 'TargetReleaseVersionInfo', 'ProductVersion') { if ($p.$n -ne $null) { $pol[$n] = [string]$p.$n } } }
}
$o.richtlinien = $pol
$o.dienste = @(foreach ($n in 'wuauserv', 'BITS', 'CryptSvc', 'TrustedInstaller', 'msiserver', 'UsoSvc', 'WaaSMedicSvc', 'DoSvc') { $s = Get-Service -Name $n -EA SilentlyContinue; if ($s) { [pscustomobject]@{ n = $s.Name; d = $s.DisplayName; st = [string]$s.StartType; s = [string]$s.Status } } })
try { $lw = [string]$env:SystemDrive; $d = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $lw + "'") -EA Stop; $o.freiGB = [math]::Round($d.FreeSpace / 1GB, 1) } catch {}
try { $ds = Get-Item -LiteralPath (Join-Path $env:SystemRoot 'SoftwareDistribution\DataStore\DataStore.edb') -EA Stop; $o.datastoreMB = [math]::Round($ds.Length / 1MB) } catch {}
try { $o.winhttp = ((& (Join-Path $env:SystemRoot 'System32\netsh.exe') winhttp show proxy 2>&1 | Out-String) -replace '\s+', ' ').Trim() } catch {}
try { $z = Get-Service -Name ZSAService -EA SilentlyContinue; if ($z) { $o.zscaler = [string]$z.Status } } catch {}
if ($pol['UseWUServer'] -eq '1' -and $pol['WUServer']) {
  try { $uri = [Uri]$pol['WUServer']; $t = New-Object System.Net.Sockets.TcpClient; $o.wsusErreichbar = [bool]$t.ConnectAsync($uri.Host, $uri.Port).Wait(3000); $t.Close() } catch { $o.wsusErreichbar = $false }
}
$o.neustart = [bool]((Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'))
$o | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`

/** Fehlercodes von Windows Update → Ursache (nur sichere Zuordnungen). */
export const WU_KLASSE: Record<string, { typ: string; text: string }> = {
  '0x80073701': { typ: 'v3-komponenten', text: 'ERROR_SXS_ASSEMBLY_MISSING – Komponente fehlt' },
  '0x800f081f': { typ: 'v3-komponenten', text: 'CBS_E_SOURCE_MISSING – Quelldateien fehlen' },
  '0x800f0831': { typ: 'v3-komponenten', text: 'CBS_E_STORE_CORRUPTION – Manifest fehlt/defekt' },
  '0x80073712': { typ: 'v3-komponenten', text: 'ERROR_SXS_COMPONENT_STORE_CORRUPT – Komponentenspeicher defekt' },
  '0x800f0988': { typ: 'v3-komponenten', text: 'Komponentenspeicher braucht Bereinigung/Reparatur' },
  '0x8007000d': { typ: 'v3-komponenten', text: 'ERROR_INVALID_DATA – beschädigte Update-Daten' },
  '0x80070070': { typ: 'v3-platz', text: 'ERROR_DISK_FULL – zu wenig Speicherplatz' },
  '0x80070bc9': { typ: 'v3-neustart', text: 'ERROR_FAIL_REBOOT_REQUIRED – Neustart erforderlich' },
  '0x80240030': { typ: 'v3-verbindung', text: 'Proxy-Format ungültig' },
  '0x8024402c': { typ: 'v3-verbindung', text: 'Proxy-/Servername nicht auflösbar' },
  '0x80244022': { typ: 'v3-verbindung', text: 'HTTP 503 – Dienst nicht verfügbar' },
  '0x80244018': { typ: 'v3-verbindung', text: 'HTTP 403 – vom Proxy abgelehnt' },
  '0x8024401b': { typ: 'v3-verbindung', text: 'HTTP 407 – Proxy-Anmeldung nötig' },
  '0x8024401c': { typ: 'v3-verbindung', text: 'Zeitüberschreitung beim Server' },
  '0x80072ee2': { typ: 'v3-verbindung', text: 'Zeitüberschreitung der Verbindung' },
  '0x80072ee7': { typ: 'v3-verbindung', text: 'Servername nicht auflösbar' },
  '0x80072efe': { typ: 'v3-verbindung', text: 'Verbindung abgebrochen' },
  '0x80072f8f': { typ: 'v3-verbindung', text: 'TLS-Fehler (oft falsche Uhrzeit)' },
  '0x800f0954': { typ: 'v3-verbindung', text: 'Update-Quelle (WSUS/Windows Update) für Features nicht erreichbar' },
  '0x800f0922': { typ: 'v3-verbindung', text: 'Verbindung zu Windows Update bzw. zu wenig Platz in der Systempartition' },
  '0x80248007': { typ: 'v3-cache', text: 'WU_E_DS_NODATA – Update-Datenbank unvollständig' },
  '0x80246007': { typ: 'v3-cache', text: 'Download nicht abgeschlossen' },
  '0x80240034': { typ: 'v3-cache', text: 'Download fehlgeschlagen' },
  '0x80070005': { typ: 'v3-cache', text: 'Zugriff verweigert (Update-Ordner/Rechte)' },
  '0x80070020': { typ: 'v3-cache', text: 'Datei von anderem Prozess gesperrt' },
}

export function werteV3(d: Record<string, unknown>, ctx: VdVertiefKontext): VdRoh[] {
  const roh: VdRoh[] = []
  const verlauf = arr<{ t: string; titel: string; erg: number; hr: string; op: number; guid?: string; dienst?: string }>(d.verlauf)
  const integ = ctx.roh.integritaet as Record<string, unknown> | undefined
  // Erfolge (Verlauf + Ereignis 19): was danach doch installiert wurde, ist kein Problem mehr
  const ok: WuOk[] = [...verlauf.filter(v => v.erg === 2 || v.erg === 3).map(v => ({ t: s(v.t), titel: s(v.titel), guid: s(v.guid) })), ...arr<WuOk>(integ?.wuOk)]
  const fehlAlle: WuFehler[] = verlauf.filter(v => v.erg === 4 || v.erg === 5).map(v => ({ t: s(v.t), id: 0, code: s(v.hr).toLowerCase(), kb: /KB\d{6,8}/i.exec(s(v.titel))?.[0] || '', titel: s(v.titel), guid: s(v.guid), dienst: s(v.dienst), text: s(v.titel) }))
  const fehl = wuRelevant(fehlAlle, ok).relevant.map(f => ({ t: f.t, titel: s(f.titel), hr: f.code }))
  // Codes auch aus dem Rundumscan (Ereignisse 20/25/31 ohne Store/Signaturen/später installiert + Setup-Protokoll)
  const evCodes = [...wuRelevant(arr<WuFehler>(integ?.wuFehler), ok).relevant, ...arr<WuFehler>(integ?.setupFehler)]
  const codes = new Map<string, { n: number; kb: Set<string>; titel: Set<string> }>()
  const add = (c: string, kb: string, titel: string) => { c = (c || '').toLowerCase(); if (!/^0x[0-9a-f]{8}$/.test(c) || c === '0x00000000') return; const e = codes.get(c) || { n: 0, kb: new Set<string>(), titel: new Set<string>() }; e.n++; if (kb) e.kb.add(kb); if (titel) e.titel.add(titel.slice(0, 80)); codes.set(c, e) }
  for (const v of fehl) add(v.hr, /KB\d{6,8}/i.exec(v.titel)?.[0] || '', v.titel)
  for (const v of evCodes) add(v.code, v.kb, '')
  const klassen = new Map<string, string[]>()
  const unbekannt: string[] = []
  for (const [c, e] of codes) {
    const k = WU_KLASSE[c]
    const zeile = `${c}${k ? ' – ' + k.text : ''}: ${e.n}×${e.kb.size ? ' · ' + [...e.kb].slice(0, 3).join(', ') : ''}`
    if (k) klassen.set(k.typ, [...(klassen.get(k.typ) || []), zeile]); else unbekannt.push(zeile)
  }
  const pol = (d.richtlinien || {}) as Record<string, string>
  const dienste = arr<{ n: string; d: string; st: string; s: string }>(d.dienste)
  const aus = dienste.filter(x => x.st === 'Disabled' && x.n !== 'WaaSMedicSvc')
  const frei = n(d.freiGB)
  for (const [typ, zeilen] of klassen) roh.push({ typ, text: `Update-Fehler: ${zeilen.length} passende Fehlercode(s)`, belege: zeilen.slice(0, 6) })
  if (isFinite(frei) && frei < 10 && !klassen.has('v3-platz')) roh.push({ typ: 'v3-platz', text: `Nur ${frei.toLocaleString('de-DE')} GB frei – Funktions- und kumulative Updates brauchen deutlich mehr`, belege: [] })
  if (d.neustart && !klassen.has('v3-neustart') && (codes.size || fehl.length)) roh.push({ typ: 'v3-neustart', text: 'Ein Neustart nach Updates steht aus – weitere Updates scheitern bis dahin', belege: [] })
  for (const x of aus) roh.push({ typ: 'v3-dienst', titel: `Update-Dienst „${x.d}“ ist deaktiviert`, text: `Dienst ${x.n} hat den Starttyp „Deaktiviert“`, eingabe: x.n, belege: [`Status: ${x.s}`] })
  const polHinweise = [
    pol.DisableWindowsUpdateAccess === '1' && 'Zugriff auf Windows Update per Richtlinie gesperrt',
    pol.NoAutoUpdate === '1' && 'Automatische Updates per Richtlinie aus',
    pol.PauseQualityUpdatesStartTime && `Qualitätsupdates pausiert seit ${pol.PauseQualityUpdatesStartTime}`,
    pol.DeferQualityUpdates === '1' && `Qualitätsupdates werden ${pol.DeferQualityUpdatesPeriodInDays || '?'} Tage zurückgestellt`,
    pol.UseWUServer === '1' && d.wsusErreichbar === false && `WSUS-Server ${pol.WUServer} nicht erreichbar`,
  ].filter(Boolean) as string[]
  if (polHinweise.length) roh.push({ typ: 'v3-richtlinie', text: polHinweise.join(' · '), belege: Object.entries(pol).slice(0, 10).map(([k, v]) => `${k} = ${v}`) })
  if (klassen.has('v3-verbindung') && d.zscaler && d.zscaler !== 'Running') {
    const r = roh.find(x => x.typ === 'v3-verbindung'); if (r) r.belege = [...(r.belege || []), `Zscaler-Dienst: ${s(d.zscaler)}`, ...(d.winhttp ? [`WinHTTP-Proxy: ${s(d.winhttp).slice(0, 160)}`] : [])]
  }
  // Immer wieder dasselbe Update ohne zugeordneten Code
  const jeKb = new Map<string, number>()
  for (const v of fehl) { const kb = /KB\d{6,8}/i.exec(v.titel)?.[0]; if (kb && !WU_KLASSE[v.hr.toLowerCase()]) jeKb.set(kb, (jeKb.get(kb) || 0) + 1) }
  const dauer = [...jeKb.entries()].filter(([, k]) => k >= 3)
  if (dauer.length) roh.push({ typ: 'v3-kb', text: `Immer wieder fehlgeschlagen: ${dauer.map(([kb, k]) => `${kb} (${k}×)`).join(', ')}`, eingabe: dauer[0][0], belege: fehl.filter(v => dauer.some(([kb]) => v.titel.includes(kb))).slice(0, 4).map(v => `${datumText(v.t)}: ${v.titel} → ${v.hr}`) })
  if (unbekannt.length && !roh.some(r => r.typ !== 'v3-richtlinie')) roh.push({ typ: 'v3-unklar', text: `Update-Fehlercode(s) ohne bekannte Zuordnung`, belege: unbekannt.slice(0, 6), suche: `windows update fehler ${unbekannt[0].split(':')[0]}` })
  if (d.verlaufFehler && !roh.length) roh.push({ typ: 'v3-cache', text: 'Der Update-Verlauf ließ sich nicht lesen – Update-Datenbank vermutlich beschädigt', belege: [s(d.verlaufFehler).slice(0, 200)] })
  return roh
}

// ══ V4 Tiefenprüfung: DISM ScanHealth + SFC /verifyonly (schwer) ══════════════
export const V4_PS = String.raw`
$__dism = @(& {
${DISM_INNER}
})
$o = [ordered]@{ ok = $true; dism = [string]($__dism | Select-Object -Last 1) }
if ($o.dism -notmatch '"laeuftSchon"\s*:\s*true') {
  $start = (Get-Date).AddSeconds(-5).ToString('yyyy-MM-dd HH:mm:ss')
  # sfc schreibt UTF-16: zum Einlesen kurz auf Unicode stellen (sonst „m³ssen“); scheitert das ohne
  # Konsole, bleiben nur NUL-Zeichen zu entfernen — die Auswertung verträgt kaputte Umlaute
  $altEnc = $null; try { $altEnc = [Console]::OutputEncoding; [Console]::OutputEncoding = [Text.Encoding]::Unicode } catch {}
  $sfcRoh = (& (Join-Path $env:SystemRoot 'System32\sfc.exe') /verifyonly 2>&1 | Out-String) -replace [char]0, ''
  try { if ($altEnc) { [Console]::OutputEncoding = $altEnc } } catch {}
  $o.sfcCode = $LASTEXITCODE
  $o.sfc = @(($sfcRoh -split '[\r\n]+') | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '\d+\s*%\s*(complete|abgeschlossen)' -and $_ -notmatch '^\s*\d+\s*%' } | Select-Object -Last 12)
  $sr = New-Object System.Collections.Generic.List[string]
  try {
    $pf = Join-Path $env:SystemRoot 'Logs\CBS\CBS.log'
    $fs = [IO.File]::Open($pf, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
    try { if ($fs.Length -gt 20971520) { [void]$fs.Seek($fs.Length - 20971520, [IO.SeekOrigin]::Begin) }; $txt = (New-Object IO.StreamReader($fs)).ReadToEnd() } finally { $fs.Dispose() }
    foreach ($z in ($txt -split "\r?\n")) {
      if ($z.Length -lt 19 -or [string]::CompareOrdinal($z.Substring(0, 19), $start) -lt 0) { continue }
      if ($z -match '\[SR\]' -and $z -match 'Cannot|do not match|corrupt|Repair|Verify complete|repaired|not verify') { if ($sr.Count -lt 150) { $sr.Add($z) } }
    }
  } catch {}
  $o.sr = $sr.ToArray()
}
$o | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`

// SFC-Auswertung liegt zentral beim Health Check der Server (services/serverDism.ts) — hier weitergereicht
export { sfcAusRoh, type SfcZustand } from '../services/serverDism'

export function werteV4(d: Record<string, unknown>, ctx: VdVertiefKontext): { roh: VdRoh[]; dism: DismErgebnis | null } {
  const roh: VdRoh[] = []
  let dj: Record<string, unknown> | null = null
  try { dj = JSON.parse(s(d.dism) || 'null') } catch { dj = null }
  const e = dj ? dismAusRoh(ctx.host, dj, ctx.von) : null
  if (e) {
    const beschaedigt = e.beschaedigt.slice(0, 12).map(b => `${b.art}: ${b.datei}`)
    const belege = [...(e.meldung ? [`DISM: ${e.meldung}`] : []), ...(e.dauerS ? [`Dauer ${Math.round(e.dauerS / 60)} min`] : []), ...beschaedigt]
    if (e.zustand === 'reparierbar') roh.push({ typ: 'v4-reparierbar', text: `${e.gefunden ?? e.beschaedigt.length} beschädigte Komponente(n) im Komponentenspeicher – reparierbar`, belege })
    else if (e.zustand === 'nicht_reparierbar') roh.push({ typ: 'v4-nicht-reparierbar', text: 'Komponentenspeicher beschädigt und nicht mehr reparierbar', belege })
    else if (e.zustand === 'laeuft_schon') roh.push({ typ: 'v4-laeuft-schon', text: 'Auf dem Gerät lief bereits ein DISM-Vorgang', belege: [] })
    else if (e.zustand === 'fehler' || e.zustand === 'unklar' || e.zustand === 'nicht_unterstuetzt') roh.push({ typ: 'v4-dism-fehler', text: `DISM: ${e.text}${e.fehlerCode && DISM_FEHLER[e.fehlerCode] ? ' – ' + DISM_FEHLER[e.fehlerCode] : ''}`, belege: e.ausgabe.slice(-5) })
  }
  const sfc = sfcAusRoh(arr<string>(d.sfc).map(s), arr<string>(d.sr).map(s))
  const sfcBelege = [...(sfc.meldung ? [`SFC: ${sfc.meldung}`] : []), ...(sfc.dateien.length ? [`Betroffene Dateien: ${sfc.dateien.slice(0, 15).join(', ')}`] : [])]
  if (sfc.zustand === 'verletzungen') roh.push({ typ: 'v4-systemdateien', text: `SFC hat Integritätsverletzungen gefunden${sfc.dateien.length ? ` (${sfc.dateien.length} Datei(en))` : ''}`, belege: sfcBelege })
  else if (sfc.zustand === 'neustart' || sfc.zustand === 'blockiert') roh.push({ typ: 'v4-sfc-blockiert', text: sfc.zustand === 'neustart' ? 'SFC: Systemreparatur steht aus – erst neu starten' : 'SFC konnte den Vorgang nicht ausführen', belege: sfcBelege })
  // Für den Server-Reiter „Schnell-Health-Check“: SFC-Teil mitgeben (die Tiefenprüfung macht dasselbe wie der Health Check)
  if (e && e.zustand !== 'laeuft_schon' && arr<string>(d.sfc).length) e.sfc = sfcErgebnisAus(arr<string>(d.sfc).map(s), arr<string>(d.sr).map(s), { exitCode: typeof d.sfcCode === 'number' ? d.sfcCode : undefined })
  return { roh, dism: e }
}

// ══ V5 Datenträger ════════════════════════════════════════════════════════════
export const V5_PS = String.raw`
${ISO_PS}
$o = [ordered]@{ ok = $true }
$o.platten = @(Get-PhysicalDisk -EA SilentlyContinue | ForEach-Object {
  $rc = $_ | Get-StorageReliabilityCounter -EA SilentlyContinue
  [pscustomobject]@{ nr = [string]$_.DeviceId; name = [string]$_.FriendlyName; media = [string]$_.MediaType; bus = [string]$_.BusType; health = [string]$_.HealthStatus; op = (@($_.OperationalStatus) -join ','); gb = [math]::Round($_.Size / 1GB); fw = [string]$_.FirmwareVersion
    temp = $rc.Temperature; tempMax = $rc.TemperatureMax; wear = $rc.Wear; rUnk = $rc.ReadErrorsUncorrected; rKorr = $rc.ReadErrorsCorrected; wUnk = $rc.WriteErrorsUncorrected; std = $rc.PowerOnHours } })
$o.vorhersage = @(Get-CimInstance -Namespace 'root\wmi' -ClassName MSStorageDriver_FailurePredictStatus -EA SilentlyContinue | ForEach-Object { [pscustomobject]@{ inst = [string]$_.InstanceName; fail = [bool]$_.PredictFailure; grund = [int]$_.Reason } })
$o.volumes = @(Get-Volume -EA SilentlyContinue | Where-Object { $_.DriveLetter -and [string]$_.DriveType -eq 'Fixed' } | ForEach-Object {
  $dirty = ''; if ([string]$_.FileSystem -match 'NTFS|ReFS') { try { $dirty = ((& (Join-Path $env:SystemRoot 'System32\fsutil.exe') dirty query ([string]$_.DriveLetter + ':') 2>&1 | Out-String) -replace '\s+', ' ').Trim() } catch {} }
  [pscustomobject]@{ lw = [string]$_.DriveLetter; fs = [string]$_.FileSystem; health = [string]$_.HealthStatus; dirty = $dirty; freiGB = [math]::Round($_.SizeRemaining / 1GB, 1); gb = [math]::Round($_.Size / 1GB, 1) } })
try { $cl = ([string]$env:SystemDrive).TrimEnd(':'); $o.cDisk = [string](Get-Partition -DriveLetter $cl -EA Stop).DiskNumber } catch { $o.cDisk = '' }
# Wechsellaufwerke und Gerätenamen der Laufwerke (Zuordnung der Ereignisse: eingebaut / USB / abgezogen)
try { $o.wechselLw = @(Get-Volume -EA Stop | Where-Object { $_.DriveLetter -and [string]$_.DriveType -eq 'Removable' } | ForEach-Object { [string]$_.DriveLetter }) } catch { $o.wechselLw = @() }
try { $o.vols = @(& (Join-Path $env:SystemRoot 'System32\fltmc.exe') volumes 2>$null | ForEach-Object { if ([string]$_ -match '^\s*([A-Za-z]):\s+(\\Device\\\S+)') { [pscustomobject]@{ lw = $Matches[1].ToUpper(); dev = $Matches[2] } } }) } catch { $o.vols = @() }
$o.ereignisse = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'disk', 'Ntfs', 'Microsoft-Windows-Ntfs', 'stornvme', 'storahci', 'volmgr', 'iaStorA', 'iaStorAC', 'iaStorAVC'; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 200 -EA SilentlyContinue | Where-Object { $_.Level -le 3 } | Select-Object -First 120 | ForEach-Object { $m = (([string]$_.Message) -replace '\s+', ' ').Trim(); [pscustomobject]@{ t = (Iso $_.TimeCreated); q = [string]$_.ProviderName; id = $_.Id; text = $(if ($m.Length -gt 220) { $m.Substring(0, 220) } else { $m }) } })
$o.chkdsk = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Wininit', 'Chkdsk'; StartTime = (Get-Date).AddDays(-60) } -MaxEvents 5 -EA SilentlyContinue | ForEach-Object { $m = (([string]$_.Message) -replace '\s+', ' ').Trim(); [pscustomobject]@{ t = (Iso $_.TimeCreated); text = $(if ($m.Length -gt 600) { $m.Substring(0, 600) } else { $m }) } })
$o | ConvertTo-Json -Depth 4 -Compress ${NUR_ASCII}
`

export function werteV5(d: Record<string, unknown>, ctx: VdVertiefKontext): VdRoh[] {
  const roh: VdRoh[] = []
  const platten = arr<Record<string, unknown>>(d.platten)
  const vh = arr<{ inst: string; fail: boolean; grund: number }>(d.vorhersage)
  const ev = arr<{ t: string; q: string; id: number; text: string }>(d.ereignisse)
  const vol = arr<{ lw: string; fs: string; health: string; dirty: string; freiGB: number; gb: number }>(d.volumes)
  const chk = arr<{ t: string; text: string }>(d.chkdsk)
  // Welche Ereignisse gehören zur eingebauten Platte, welche zu einem USB-Stick, der nicht mehr steckt?
  const info: DatentraegerInfo = lerneVolumes(ev.map(e => e.text), {
    sysDisk: s(d.cDisk) || undefined, disks: platten.map(p => ({ nr: s(p.nr), bus: s(p.bus) })), festeLw: vol.map(v => s(v.lw)),
    wechselLw: arr<unknown>(d.wechselLw).map(s), vols: arr<{ lw: unknown; dev: unknown }>(d.vols).map(x => ({ lw: s(x.lw), dev: s(x.dev) })),
  })!
  const plattenNr = (t: string) => /\\Device\\Harddisk(\d+)/i.exec(t)?.[1]
  const vorhanden = (nr?: string) => nr !== undefined && platten.some(p => s(p.nr) === nr)
  const evJe = new Map<string, number>()
  for (const e of ev) { const nr = plattenNr(e.text); if (vorhanden(nr)) evJe.set(nr!, (evJe.get(nr!) || 0) + 1) }
  // „wechsel“ ohne vorhandene Platte = abgezogener Stick (vorhandene USB-Platten → v5-usb-dock unten)
  const weg = ev.filter(e => ordneDatentraeger(e.text, info, ctx.geraet) === 'wechsel' && !vorhanden(plattenNr(e.text)))
  const evIntern = ev.filter(e => !weg.includes(e) && !(vorhanden(plattenNr(e.text)) && /USB|SD|MMC/i.test(s(platten.find(p => s(p.nr) === plattenNr(e.text))?.bus))))
  let defekt = false
  for (const p of platten) {
    const nr = s(p.nr), name = s(p.name) || `Platte ${nr}`
    const health = s(p.health), op = s(p.op)
    const rUnk = n(p.rUnk), wUnk = n(p.wUnk), wear = n(p.wear), temp = n(p.temp), tempMax = n(p.tempMax)
    const fail = vh.some(v => v.fail)
    const belege = [`${name} · ${s(p.media) || '?'} · ${s(p.bus) || '?'} · ${s(p.gb)} GB · Firmware ${s(p.fw) || '?'}`, `Zustand: ${health || '?'} (${op || '?'})`,
      ...(isFinite(rUnk) || isFinite(wUnk) ? [`Unkorrigierte Lese-/Schreibfehler: ${isFinite(rUnk) ? rUnk : '?'} / ${isFinite(wUnk) ? wUnk : '?'}`] : []),
      ...(isFinite(wear) ? [`Verschleiß: ${wear} %`] : []), ...(isFinite(temp) ? [`Temperatur: ${temp} °C${isFinite(tempMax) ? ` (max. ${tempMax} °C)` : ''}`] : []),
      ...(isFinite(n(p.std)) ? [`Betriebsstunden: ${n(p.std).toLocaleString('de-DE')}`] : []), ...(evJe.get(nr) ? [`${evJe.get(nr)} Fehler-/Warnereignis(se) dieser Platte (30 Tage)`] : [])]
    if ((health && !/^Healthy$|^Gesund$/i.test(health)) || /Predictive Failure|Vorhersagefehler/i.test(op) || rUnk > 0 || wUnk > 0 || (fail && platten.length === 1)) {
      defekt = true
      roh.push({ typ: 'v5-defekt', titel: `Datenträger defekt bzw. fällt bald aus: ${name}`, text: `${name}: Zustand „${health || '?'}“${rUnk > 0 || wUnk > 0 ? `, ${rUnk || 0} unkorrigierte Lese- und ${wUnk || 0} Schreibfehler` : ''}${fail ? ', SMART meldet Ausfallvorhersage' : ''}`, belege })
    } else if (wear >= 80) roh.push({ typ: 'v5-verschleiss', titel: `SSD-Verschleiß hoch: ${name} (${wear} %)`, text: `${name}: Verschleiß ${wear} %`, belege })
    else if (temp >= 65 || tempMax >= 80) roh.push({ typ: 'v5-temperatur', titel: `Datenträger heiß: ${name}`, text: `${name}: ${isFinite(temp) ? temp : '?'} °C${isFinite(tempMax) ? `, Höchstwert ${tempMax} °C` : ''}`, belege })
    if (/USB/i.test(s(p.bus)) && (evJe.get(nr) || 0) > 0) roh.push({ typ: 'v5-usb-dock', titel: `Fehler am USB-Datenträger ${name}`, text: `${evJe.get(nr)} Fehlerereignis(se) an ${name} (über USB angebunden)`, belege })
  }
  const schmutzig = vol.filter(v => /is dirty|ist fehlerhaft|ist als fehlerhaft/i.test(v.dirty) && !/not dirty|nicht fehlerhaft|ist nicht/i.test(v.dirty))
  // NTFS-Fehler nur der vorhandenen, eingebauten Laufwerke (50 = verzögertes Schreiben gescheitert → Datenverlust)
  const ntfs = evIntern.filter(e => /Ntfs/i.test(e.q) && [50, 55, 98, 137, 140].includes(Number(e.id)))
  const chkFund = chk.filter(c => /beschädigt|korrigiert|repariert|fehlerhafte Sektoren|corrupt|fixed|repaired|bad sectors|found problems|Probleme gefunden/i.test(c.text) && !/keine Probleme|no problems|found no problems/i.test(c.text))
  if (!defekt && (schmutzig.length || ntfs.length || chkFund.length)) {
    // Laufwerk für chkdsk: das markierte bzw. das aus den Ereignissen — sonst offen lassen (Frage im Plan)
    const feste = vol.map(v => s(v.lw).toUpperCase() + ':')
    const ausEv = [...ntfs.map(e => lwAusText(e.text, info)), ...chkFund.map(c => lwAusText(c.text, info))].filter(x => x && feste.includes(x))
    const lw = schmutzig[0]?.lw ? schmutzig[0].lw.toUpperCase() + ':' : ausEv[0] || ''
    const alleLw = [...new Set([...schmutzig.map(v => v.lw.toUpperCase() + ':'), ...ausEv])]
    roh.push({ typ: 'v5-dateisystem', text: `Dateisystem${alleLw.length ? ` (${alleLw.join(', ')})` : ''}: ${schmutzig.length ? `Laufwerk ${schmutzig.map(v => v.lw + ':').join(', ')} als fehlerhaft markiert` : ''}${ntfs.length ? `${schmutzig.length ? ', ' : ''}${ntfs.length} NTFS-Fehlermeldung(en)` : ''}${chkFund.length ? `${schmutzig.length || ntfs.length ? ', ' : ''}chkdsk hat Fehler gefunden` : ''}`,
      eingabe: lw || undefined,
      belege: [...ntfs.slice(0, 3).map(e => `${datumText(e.t)} ${e.q} ${e.id}: ${e.text.slice(0, 160)}`), ...chkFund.slice(0, 2).map(c => `chkdsk ${datumText(c.t)}: ${c.text.slice(0, 200)}`),
        ...(lw ? [] : ['Laufwerk aus den Meldungen nicht eindeutig – vor chkdsk das Laufwerk prüfen'])] })
  }
  if (weg.length) {
    const zielName = (t: string) => { const lw = lwAusText(t, info); if (lw) return `Laufwerk ${lw}`; const m = /\\Device\\Harddisk(\d+)\\/i.exec(t); if (m) return `Datenträger ${m[1]}`; const hv = /\\Device\\HarddiskVolume(\d+)/i.exec(t); return hv ? `Volume ${hv[1]}` : '?' }
    const ziele = [...new Set(weg.map(e => zielName(e.text)))].sort()
    roh.push({ typ: 'v5-wechseldatentraeger', text: `${weg.length} Datenträger-/Dateisystemfehler betreffen einen Datenträger, der nicht mehr angeschlossen ist bzw. als Wechseldatenträger hängt (${ziele.slice(0, 4).join(', ')})`,
      belege: weg.slice(0, 5).map(e => `${datumText(e.t)} ${e.q} ${e.id}: ${e.text.slice(0, 150)}`) })
  }
  if (!roh.some(r => r.typ !== 'v5-wechseldatentraeger') && ctx.ausloeser.length) roh.push({ typ: 'v5-unauffaellig', text: `${platten.length} Datenträger geprüft – keine Hardware-Schäden, Dateisystem sauber`,
    belege: platten.slice(0, 3).map(p => `${s(p.name)}: ${s(p.health)}${isFinite(n(p.wear)) ? `, Verschleiß ${n(p.wear)} %` : ''}${evJe.get(s(p.nr)) ? ` · ${evJe.get(s(p.nr))} Fehler-/Warnereignis(se) in 30 Tagen (vorübergehend, z. B. Standby/Treiber)` : ''}`) })
  return roh
}

// ══ Verzeichnis ═══════════════════════════════════════════════════════════════
export const VERTIEFUNGEN: Record<string, VdVertiefung> = {
  'v1-bluescreen': {
    id: 'v1-bluescreen', titel: 'Bluescreen- und Absturz-Analyse', last: 'leicht', dauer: 'ca. 30–60 s', geraet: 'beide', timeoutMs: 180_000,
    beschreibung: 'Bluescreen-Codes, Speicherabbilder, Live-Kernel-Berichte, Hardware- und Speicherdiagnose-Meldungen, Ein/Aus-Taste vs. Stromverlust, Drosselung und Treiberänderungen vor dem ersten Absturz (30 Tage).',
    skript: () => ({ ps: V1_PS }), auswerten: werteV1,
  },
  'v2-absturz': {
    id: 'v2-absturz', titel: 'Programmabsturz-Analyse', last: 'leicht', dauer: 'ca. 30–60 s', geraet: 'beide', timeoutMs: 180_000,
    beschreibung: 'Abstürze der letzten 30 Tage je Programm und Modul, Ausnahmecodes, Hersteller und Signatur der Module, Office-Add-ins und von Office abgeschaltete Add-ins, .NET-Fehler.',
    skript: ctx => {
      const ev = ctx.roh.ereignisse as EreignisDaten | undefined
      const module = ev ? gruppiereAbstuerze(ev.crashes).slice(0, 10).map(g => g.modPfad).filter(Boolean) : []
      return { ps: V2_PS, payload: { module } }
    },
    auswerten: werteV2,
  },
  'v3-update': {
    id: 'v3-update', titel: 'Windows-Update-Analyse', last: 'leicht', dauer: 'ca. 20–60 s', geraet: 'beide', timeoutMs: 180_000,
    beschreibung: 'Update-Verlauf mit Fehlercodes, Richtlinien (WSUS/Zurückstellung), Update-Dienste, Platz, Update-Datenbank, Proxy/Zscaler und WSUS-Erreichbarkeit.',
    skript: () => ({ ps: V3_PS }), auswerten: werteV3,
  },
  'v4-tiefe': {
    id: 'v4-tiefe', titel: 'Tiefenprüfung: DISM ScanHealth + SFC', last: 'schwer', dauer: '10–35 min, spürbare Last', geraet: 'beide', timeoutMs: 80 * 60_000,
    beschreibung: 'Prüft den ganzen Komponentenspeicher (DISM /ScanHealth) und danach alle Systemdateien (sfc /verifyonly) – nur Prüfung, repariert nichts. Betroffene Dateien kommen aus CBS.log.',
    skript: () => ({ ps: V4_PS }), auswerten: (d, ctx) => werteV4(d, ctx).roh,
  },
  'v5-datentraeger': {
    id: 'v5-datentraeger', titel: 'Datenträger-Analyse', last: 'leicht', dauer: 'ca. 20–40 s', geraet: 'beide', timeoutMs: 150_000,
    beschreibung: 'SMART/Zuverlässigkeitszähler je Platte, Ausfallvorhersage, Zuordnung der Fehlerereignisse zur Platte, USB/Dock, „fehlerhaft“-Markierung je Laufwerk und letzte chkdsk-Ergebnisse.',
    skript: () => ({ ps: V5_PS }), auswerten: werteV5,
  },
}
