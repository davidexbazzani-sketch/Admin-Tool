// ── Diagnose-Thema „Abstürze, Bluescreen & Start“ ───────────────────────────
// stbs = Bluescreens (Fehlercodes, Abbilder, WHEA) · stpw = Ausschalten/Neustarts (Kernel-Power 41, 1074, Hitze)
// stboot = Start/BitLocker/TPM/Secure Boot/chkdsk · stapp = Programmabstürze (1000/1002, .NET, Side-by-Side)
// sthang = Einfrieren/Hänger (TDR, LiveKernelEvent, E/A, Ressourcen) · stdown = Herunterfahren/Abmelden
// Alles NUR LESEND.
import { liste, ja, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde, DgWert } from '../types'

/** Enthält die Liste der Bluescreen-Codes (z. B. „0x133“) einen der gesuchten? */
const hatCode = (v: DgWert | undefined, codes: string[]): boolean => liste(v).some(c => codes.includes(c.toLowerCase()))
/** Bluescreen-Zusammenfassung für Befunde. */
const bsInfo = (anz: DgWert | undefined, vor: DgWert | undefined): string => (num(anz) > 0 ? ` – ${anz}× in 90 Tagen` : '') + (num(vor) >= 0 ? `, zuletzt vor ${zahl(vor)} Tagen` : '')

/** Gemeinsame PowerShell-Helfer: Ereignisse sicher lesen (unbekannter Anbieter wirft sonst „Falscher Parameter“), Feld aus EventData lesen. */
const FELD = String.raw`
function EvSt([hashtable]$fh, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $fh -MaxEvents $max -EA Stop) } catch { return @() } }
function DatenFeldSt($ev, [string]$name) {
  try { $xml = [xml]$ev.ToXml(); $kn = @($xml.Event.EventData.Data | Where-Object { $_.Name -eq $name }); if ($kn.Count) { return [string]$kn[0].'#text' } } catch {}
  return $null
}
`

export const SONDEN_STABILITAET: DgSonde[] = [
  {
    id: 'stbs', titel: 'Bluescreens (Fehlercodes, Speicherabbilder, Hardwarefehler, frische Treiber)', modus: 'system', timeoutMs: 90000,
    ps: FELD + String.raw`
$bcName = @{ '0xa' = 'IRQL_NOT_LESS_OR_EQUAL'; '0x19' = 'BAD_POOL_HEADER'; '0x1a' = 'MEMORY_MANAGEMENT'; '0x1e' = 'KMODE_EXCEPTION_NOT_HANDLED'; '0x24' = 'NTFS_FILE_SYSTEM'; '0x3b' = 'SYSTEM_SERVICE_EXCEPTION'; '0x4e' = 'PFN_LIST_CORRUPT'; '0x50' = 'PAGE_FAULT_IN_NONPAGED_AREA'; '0x77' = 'KERNEL_STACK_INPAGE_ERROR'; '0x7a' = 'KERNEL_DATA_INPAGE_ERROR'; '0x7b' = 'INACCESSIBLE_BOOT_DEVICE'; '0x7e' = 'SYSTEM_THREAD_EXCEPTION_NOT_HANDLED'; '0x7f' = 'UNEXPECTED_KERNEL_MODE_TRAP'; '0x9f' = 'DRIVER_POWER_STATE_FAILURE'; '0xa0' = 'INTERNAL_POWER_ERROR'; '0xc2' = 'BAD_POOL_CALLER'; '0xd1' = 'DRIVER_IRQL_NOT_LESS_OR_EQUAL'; '0xe6' = 'DRIVER_VERIFIER_DMA_VIOLATION'; '0xef' = 'CRITICAL_PROCESS_DIED'; '0xf4' = 'CRITICAL_OBJECT_TERMINATION'; '0x101' = 'CLOCK_WATCHDOG_TIMEOUT'; '0x10d' = 'WDF_VIOLATION'; '0x116' = 'VIDEO_TDR_FAILURE'; '0x117' = 'VIDEO_TDR_TIMEOUT_DETECTED'; '0x124' = 'WHEA_UNCORRECTABLE_ERROR'; '0x133' = 'DPC_WATCHDOG_VIOLATION'; '0x139' = 'KERNEL_SECURITY_CHECK_FAILURE'; '0x13a' = 'KERNEL_MODE_HEAP_CORRUPTION'; '0x154' = 'UNEXPECTED_STORE_EXCEPTION'; '0x1a8' = 'BUGCODE_USB3_DRIVER' }
function NameSt([string]$cd) { if ($bcName.ContainsKey($cd)) { return $cd + ' ' + $bcName[$cd] }; return $cd }
$bsL = New-Object System.Collections.Generic.List[object]
foreach ($ev in @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; Id = 1001; StartTime = (Get-Date).AddDays(-90) } 50)) {
  $roh = ''; try { $roh = [string]$ev.Properties[0].Value } catch {}
  if (-not $roh) { $roh = [string]$ev.Message }
  if ($roh -match '0x([0-9a-fA-F]{1,8})\b') { $bsL.Add(@{ code = '0x' + ([Convert]::ToInt64($Matches[1], 16)).ToString('x'); zeit = $ev.TimeCreated }) }
}
# Kernel-Power 41 mit Fehlercode = Bluescreen, auch wenn kein Bericht geschrieben wurde
foreach ($ev in @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = (Get-Date).AddDays(-90) } 100)) {
  $bc = DatenFeldSt $ev 'BugcheckCode'
  if ($bc -and $bc -ne '0') {
    $zt = $ev.TimeCreated
    if (-not @($bsL | Where-Object { [math]::Abs(($_.zeit - $zt).TotalMinutes) -lt 15 }).Count) { $bsL.Add(@{ code = '0x' + ([int64]$bc).ToString('x'); zeit = $zt }) }
  }
}
$sortiert = @($bsL | Sort-Object { $_.zeit } -Descending)
$n30 = @($sortiert | Where-Object { $_.zeit -gt (Get-Date).AddDays(-30) }).Count
Fakt 'anzahl90' $sortiert.Count; Fakt 'anzahl30' $n30
Fakt 'codes' @($sortiert | ForEach-Object { [string]$_.code } | Select-Object -Unique)
if ($sortiert.Count) {
  $vor = [math]::Round(((Get-Date) - $sortiert[0].zeit).TotalDays, 1)
  $haeuf = @($sortiert | ForEach-Object { [string]$_.code } | Group-Object | Sort-Object Count -Descending)[0].Name
  Fakt 'letzterCode' ([string]$sortiert[0].code); Fakt 'letzteVorTagen' $vor; Fakt 'haeufigsterCode' $haeuf
  Punkt 'Bluescreens (90 Tage)' $(if ($sortiert.Count -ge 2) { 'fehler' } else { 'warn' }) ('' + $sortiert.Count + '×, davon ' + $n30 + '× in 30 Tagen · Codes: ' + ((@($sortiert | ForEach-Object { [string]$_.code } | Select-Object -Unique | ForEach-Object { NameSt $_ })) -join ', '))
  Punkt 'Letzter Bluescreen' 'info' ((NameSt ([string]$sortiert[0].code)) + ' vor ' + $vor + ' Tagen')
} else { Fakt 'letzterCode' $null; Punkt 'Bluescreens (90 Tage)' 'ok' 'keine' }
$mini = $null
try { $mini = @(Get-ChildItem -LiteralPath 'C:\Windows\Minidump' -Filter '*.dmp' -File -EA Stop).Count } catch { if (-not (Test-Path -LiteralPath 'C:\Windows\Minidump')) { $mini = 0 } }
$md = Test-Path -LiteralPath 'C:\Windows\MEMORY.DMP'
$cc = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl' -EA SilentlyContinue
$dumpAus = ($null -ne $cc -and $cc.CrashDumpEnabled -eq 0)
Fakt 'minidumps' $mini; Fakt 'memoryDmp' $md; Fakt 'dumpAus' $dumpAus; Fakt 'autoNeustart' ($null -ne $cc -and $cc.AutoReboot -eq 1)
Punkt 'Speicherabbilder' $(if ($dumpAus) { 'warn' } else { 'info' }) ($(if ($null -ne $mini) { '' + $mini + ' Minidump(s)' } else { 'Minidumps nicht lesbar' }) + $(if ($md) { ', MEMORY.DMP vorhanden' } else { '' }) + $(if ($dumpAus) { ' · Abbilder sind ABGESCHALTET' } else { '' }))
$wh = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; StartTime = (Get-Date).AddDays(-30) } 200).Count
Fakt 'whea30' $wh
Punkt 'Hardwarefehler (WHEA, 30 Tage)' $(if ($wh) { 'warn' } else { 'ok' }) ('' + $wh)
$tr = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-UserPnp'; Id = 20001, 20003; StartTime = (Get-Date).AddDays(-14) } 200).Count
$wu = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 19; StartTime = (Get-Date).AddDays(-14) } 200).Count
Fakt 'treiber14' $tr; Fakt 'updates14' $wu
Punkt 'Frisch installiert (14 Tage)' 'info' ('' + $tr + ' Treiberinstallation(en), ' + $wu + ' Windows-Update(s)')
`,
  },
  {
    id: 'stpw', titel: 'Ausschalten und Neustarts (unerwartet, Ein/Aus-Taste, Updates, Hitze, Akku)', modus: 'system', timeoutMs: 90000,
    ps: FELD + String.raw`
$k41 = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = (Get-Date).AddDays(-30) } 100)
$mitBc = 0; $knopf = 0
foreach ($ev in $k41) {
  $bc = DatenFeldSt $ev 'BugcheckCode'
  if ($bc -and $bc -ne '0') { $mitBc++; continue }
  $pb = DatenFeldSt $ev 'PowerButtonTimestamp'; $lp = DatenFeldSt $ev 'LongPowerButtonPressDetected'
  if (($pb -and $pb -ne '0') -or $lp -eq 'true') { $knopf++ }
}
$hart = $k41.Count - $mitBc - $knopf
if ($hart -lt 0) { $hart = 0 }
Fakt 'kp41Anzahl30' $k41.Count; Fakt 'mitBugcheck30' $mitBc; Fakt 'knopf30' $knopf; Fakt 'hartAus30' $hart
Punkt 'Unerwartet aus (Kernel-Power 41, 30 Tage)' $(if ($k41.Count -ge 2) { 'fehler' } elseif ($k41.Count) { 'warn' } else { 'ok' }) ('' + $k41.Count + '× · davon ' + $mitBc + '× Bluescreen, ' + $knopf + '× per Ein/Aus-Taste erzwungen, ' + $hart + '× einfach aus')
$e6008 = @(EvSt @{ LogName = 'System'; Id = 6008; StartTime = (Get-Date).AddDays(-30) } 100).Count
$starts = @(EvSt @{ LogName = 'System'; Id = 6005; StartTime = (Get-Date).AddDays(-30) } 500).Count
Fakt 'unerwartet6008' $e6008; Fakt 'starts30' $starts
$nst = @(EvSt @{ LogName = 'System'; ProviderName = 'User32'; Id = 1074; StartTime = (Get-Date).AddDays(-30) } 200)
$updEv = @($nst | Where-Object { $prc = ''; try { $prc = [string]$_.Properties[0].Value } catch {}; $prc -match '(?i)TrustedInstaller|MoUsoCoreWorker|musnotification|usoclient|MoNotificationUx|IntuneWindowsAgent|IntuneManagementExtension|omadmclient|wuauclt' -or [string]$_.Properties[2].Value -match '(?i)Aktualisierung|Service Pack|Update|Upgrade' })
$upd = $updEv.Count
Fakt 'neustarts30' $nst.Count; Fakt 'updateNeustarts30' $upd
if ($nst.Count) {
  $wer0 = ''; $grund = ''; $werU = ''
  try { $wer0 = Split-Path ([string]$nst[0].Properties[0].Value -replace '\s*\(.*$', '') -Leaf; $grund = [string]$nst[0].Properties[2].Value } catch {}
  if ($updEv.Count) { try { $werU = Split-Path ([string]$updEv[0].Properties[0].Value -replace '\s*\(.*$', '') -Leaf } catch {} }
  Fakt 'letzterAusloeser' $wer0; Fakt 'letzterUpdateAusloeser' $werU
  Punkt 'Geplante Neustarts/Herunterfahren (30 Tage)' $(if ($upd -ge 2) { 'warn' } else { 'info' }) ('' + $nst.Count + '×, davon ' + $upd + '× durch Updates/Softwareverteilung · zuletzt: ' + $wer0 + $(if ($grund) { ' (' + $grund + ')' } else { '' }))
} else { Punkt 'Geplante Neustarts/Herunterfahren (30 Tage)' 'info' 'keine' }
$kpw = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Level = 1, 2, 3; StartTime = (Get-Date).AddDays(-30) } 300)
$therm = @($kpw | Where-Object { [string]$_.Message -match '(?i)therm|überhitz|temperatur' }).Count
Fakt 'thermik30' $therm
Punkt 'Hitze-Abschaltungen/-Warnungen (30 Tage)' $(if ($therm) { 'warn' } else { 'ok' }) ('' + $therm)
$temp = $null
try { $tz = @(Get-CimInstance -Namespace 'root\wmi' -ClassName MSAcpi_ThermalZoneTemperature -EA Stop); if ($tz.Count) { $temp = [math]::Round((([double]($tz | Measure-Object CurrentTemperature -Maximum).Maximum) / 10) - 273.15) } } catch {}
Fakt 'tempC' $temp
$wh = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; StartTime = (Get-Date).AddDays(-30) } 200).Count
Fakt 'whea30' $wh
Punkt 'Hardwarefehler (WHEA, 30 Tage)' $(if ($wh) { 'warn' } else { 'ok' }) ('' + $wh)
$bat = Get-CimInstance Win32_Battery -EA SilentlyContinue | Select-Object -First 1
Fakt 'akku' ([bool]$bat); Fakt 'akkuProzent' $(if ($bat) { [int]$bat.EstimatedChargeRemaining } else { $null })
$cc = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\CrashControl' -EA SilentlyContinue
Fakt 'autoNeustart' ($null -ne $cc -and $cc.AutoReboot -eq 1)
Punkt 'Gerät' 'info' ($(if ($bat) { 'Laptop mit Akku (' + [int]$bat.EstimatedChargeRemaining + ' %)' } else { 'ohne Akku (Desktop)' }) + ' · ' + $starts + ' Start(s) in 30 Tagen' + $(if ($null -ne $temp) { ' · ' + $temp + ' °C' } else { '' }))
`,
  },
  {
    id: 'stboot', titel: 'Start (BitLocker, TPM, Secure Boot, Datenträgerprüfung, BIOS)', modus: 'system', timeoutMs: 90000,
    ps: FELD + String.raw`
$blL = $false; $blVer = $null; $blSchutz = $null; $blProz = $null; $prot = @()
try { $bv = Get-BitLockerVolume -MountPoint 'C:' -EA Stop; if ($bv) { $blL = $true; $blVer = [string]$bv.VolumeStatus; $blSchutz = [string]$bv.ProtectionStatus; $blProz = [double]$bv.EncryptionPercentage; $prot = @($bv.KeyProtector | ForEach-Object { [string]$_.KeyProtectorType }) } } catch {}
if (-not $blL) {
  try {
    $evol = Get-CimInstance -Namespace 'root\cimv2\Security\MicrosoftVolumeEncryption' -ClassName Win32_EncryptableVolume -Filter "DriveLetter='C:'" -EA Stop
    if ($evol) { $blL = $true; $blSchutz = $(if ($evol.ProtectionStatus -eq 1) { 'On' } else { 'Off' }); $blVer = $(if ($evol.ConversionStatus -eq 1) { 'FullyEncrypted' } elseif ($evol.ConversionStatus -eq 0) { 'FullyDecrypted' } else { 'EncryptionInProgress' }) }
  } catch {}
}
$pausiert = $blL -and $blVer -eq 'FullyEncrypted' -and $blSchutz -eq 'Off'
Fakt 'blLesbar' $blL; Fakt 'blStatus' $blVer; Fakt 'blSchutz' $blSchutz; Fakt 'blProzent' $blProz; Fakt 'blProtektoren' @($prot)
Fakt 'blPausiert' $(if ($blL) { $pausiert } else { $null }); Fakt 'blTpmPin' $(if ($prot.Count) { $prot -contains 'TpmPin' } else { $null })
if ($blL) { Punkt 'BitLocker (C:)' $(if ($pausiert) { 'warn' } elseif ($blSchutz -eq 'On') { 'ok' } else { 'info' }) ([string]$blVer + ', Schutz ' + [string]$blSchutz + $(if ($prot.Count) { ' · ' + ($prot -join ', ') } else { '' })) }
else { Punkt 'BitLocker (C:)' 'info' 'nicht lesbar (Adminrechte nötig)' }
$rec = 0
# nur echte Starts im Wiederherstellungsmodus bzw. Entsperren mit dem Wiederherstellungsschlüssel (nicht „Sicherung des Schlüssels“)
$blRx = '(?i)recovery (was|has been) (triggered|initiated)|unlocked (by|with|using) (a |the )?recovery|entered recovery|Wiederherstellung wurde (ausgelöst|eingeleitet|gestartet)|Wiederherstellungsmodus|mit (dem|einem) Wiederherstellungs(kennwort|schlüssel) entsperrt'
$rec += @(EvSt @{ LogName = 'Microsoft-Windows-BitLocker/BitLocker Management'; StartTime = (Get-Date).AddDays(-30) } 300 | Where-Object { [string]$_.Message -match $blRx }).Count
$rec += @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-BitLocker-Driver'; StartTime = (Get-Date).AddDays(-30) } 100 | Where-Object { [string]$_.Message -match $blRx }).Count
Fakt 'blWiederherstellung30' $rec
Punkt 'BitLocker-Wiederherstellung (30 Tage)' $(if ($rec -ge 2) { 'fehler' } elseif ($rec) { 'warn' } else { 'ok' }) $(if ($rec) { '' + $rec + ' Hinweis(e) auf Wiederherstellungsmodus' } else { 'keine Hinweise' })
$tpmDa = $null; $tpmOk = $null
try { $tp = Get-Tpm -EA Stop; $tpmDa = [bool]$tp.TpmPresent; $tpmOk = [bool]$tp.TpmReady } catch {
  try { $tw = Get-CimInstance -Namespace 'root\cimv2\Security\MicrosoftTpm' -ClassName Win32_Tpm -EA Stop; if ($tw) { $tpmDa = $true; $tpmOk = [bool]$tw.IsEnabled_InitialValue -and [bool]$tw.IsActivated_InitialValue } else { $tpmDa = $false } } catch {}
}
$tpmPnp = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='SecurityDevices'" -EA SilentlyContinue | Where-Object { [string]$_.Name -match '(?i)Trusted Platform|TPM' }).Count -gt 0
if ($tpmPnp -and -not $tpmDa) { $tpmDa = $true; $tpmOk = $null }   # ohne Adminrechte meldet Get-Tpm fälschlich „kein TPM“
elseif (-not $tpmPnp -and $null -eq $tpmDa) { $tpmDa = $false; $tpmOk = $false }
Fakt 'tpmVorhanden' $tpmDa; Fakt 'tpmBereit' $tpmOk
Punkt 'Sicherheitschip (TPM)' $(if ($null -eq $tpmDa -or ($tpmDa -and $null -eq $tpmOk)) { 'info' } elseif ($tpmOk) { 'ok' } else { 'fehler' }) $(if ($null -eq $tpmDa) { 'nicht lesbar (Adminrechte nötig)' } elseif (-not $tpmDa) { 'kein TPM gefunden' } elseif ($null -eq $tpmOk) { 'vorhanden (Bereitschaft nur mit Adminrechten lesbar)' } elseif ($tpmOk) { 'bereit' } else { 'vorhanden, aber NICHT bereit' })
$sb = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\SecureBoot\State' -Name UEFISecureBootEnabled -EA SilentlyContinue).UEFISecureBootEnabled
Fakt 'secureBoot' $(if ($null -eq $sb) { $null } else { $sb -eq 1 })
Punkt 'Secure Boot' $(if ($null -eq $sb) { 'info' } elseif ($sb -eq 1) { 'ok' } else { 'warn' }) $(if ($null -eq $sb) { 'unbekannt (Legacy-BIOS?)' } elseif ($sb -eq 1) { 'an' } else { 'AUS' })
$fs = [string](fsutil dirty query C: 2>$null | Out-String)
$dirty = $null
if ($fs -match '(?i)\bNICHT\b|\bNOT\b') { $dirty = $false } elseif ($fs -match '(?i)fehlerhaft|\bdirty\b') { $dirty = $true }
Fakt 'dirty' $dirty
$chk = @(EvSt @{ LogName = 'Application'; Id = 1001; StartTime = (Get-Date).AddDays(-30) } 300 | Where-Object { $_.ProviderName -match '(?i)Wininit|Chkdsk' }).Count
Fakt 'chkdsk30' $chk
Punkt 'Datenträgerprüfung beim Start' $(if ($dirty -or $chk -ge 3) { 'warn' } else { 'ok' }) ('' + $chk + '× gelaufen (30 Tage)' + $(if ($dirty) { ' · C: ist als fehlerhaft markiert – Prüfung beim nächsten Start' } elseif ($null -eq $dirty) { ' · Markierung nicht lesbar' } else { '' }))
$bios = Get-CimInstance Win32_BIOS -EA SilentlyContinue
if ($bios) {
  $jahre = $null; try { $jahre = [math]::Round(((Get-Date) - $bios.ReleaseDate).TotalDays / 365, 1) } catch {}
  Fakt 'biosVersion' ([string]$bios.SMBIOSBIOSVersion); Fakt 'biosAlterJahre' $jahre
  Punkt 'BIOS' $(if ($jahre -ge 3) { 'warn' } else { 'info' }) ([string]$bios.SMBIOSBIOSVersion + $(if ($null -ne $jahre) { ' (' + $jahre + ' Jahre alt)' } else { '' }))
}
$kb = EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Boot'; Id = 27 } 1
$art = $null; if ($kb) { $art = [int](DatenFeldSt $kb 'BootType') }
$hb = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name HiberbootEnabled -EA SilentlyContinue).HiberbootEnabled
Fakt 'schnellstart' ($hb -eq 1); Fakt 'letzterStartSchnellstart' $(if ($null -eq $art) { $null } else { $art -eq 1 })
Punkt 'Schnellstart' 'info' ($(if ($hb -eq 1) { 'an' } else { 'aus' }) + $(if ($art -eq 1) { ' · letzter Start war KEIN echter Neustart' } else { '' }))
`,
  },
  {
    id: 'stapp', titel: 'Programmabstürze und Hänger (14 Tage)', modus: 'system', timeoutMs: 90000,
    ps: FELD + String.raw`
function EigSt($ev, [int]$i) { try { return [string]$ev.Properties[$i].Value } catch { return '' } }
$ab = @(EvSt @{ LogName = 'Application'; ProviderName = 'Application Error'; Id = 1000; StartTime = (Get-Date).AddDays(-14) } 300)
$hg = @(EvSt @{ LogName = 'Application'; ProviderName = 'Application Hang'; Id = 1002; StartTime = (Get-Date).AddDays(-14) } 300)
$abD = @($ab | ForEach-Object { [pscustomobject]@{ app = (EigSt $_ 0); modul = (EigSt $_ 3); code = (EigSt $_ 6) } } | Where-Object { $_.app })
$gr = @($abD | Group-Object app | Sort-Object Count -Descending)
Fakt 'abstuerze14' $abD.Count
Fakt 'apps' @($gr | Select-Object -First 5 | ForEach-Object { [string]$_.Name + ' (' + $_.Count + '×)' })
if ($gr.Count) {
  $topM = @($gr[0].Group | Group-Object modul | Sort-Object Count -Descending)[0].Name
  Fakt 'topApp' ([string]$gr[0].Name); Fakt 'topAppAnzahl' $gr[0].Count; Fakt 'topModul' ([string]$topM)
  Punkt 'Programmabstürze (14 Tage)' $(if ($gr[0].Count -ge 3) { 'fehler' } else { 'warn' }) ('' + $abD.Count + '× · ' + ((@($gr | Select-Object -First 4 | ForEach-Object { [string]$_.Name + ' ' + $_.Count + '×' })) -join ', ') + ' · häufigstes Modul: ' + $topM)
} else { Fakt 'topApp' $null; Fakt 'topAppAnzahl' 0; Punkt 'Programmabstürze (14 Tage)' 'ok' 'keine' }
$hgA = @($hg | ForEach-Object { EigSt $_ 0 } | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending)
Fakt 'haenger14' $hg.Count
Fakt 'topHaengerApp' $(if ($hgA.Count) { [string]$hgA[0].Name } else { $null }); Fakt 'topHaengerAnzahl' $(if ($hgA.Count) { $hgA[0].Count } else { 0 })
Punkt '„Keine Rückmeldung“ (14 Tage)' $(if ($hg.Count -ge 5) { 'warn' } else { 'ok' }) $(if ($hgA.Count) { '' + $hg.Count + '× · ' + ((@($hgA | Select-Object -First 4 | ForEach-Object { [string]$_.Name + ' ' + $_.Count + '×' })) -join ', ') } else { 'keine' })
$expA = @($abD | Where-Object { $_.app -match '(?i)^explorer\.exe$' }).Count
$shA = @($abD | Where-Object { $_.app -match '(?i)ShellExperienceHost|StartMenuExperienceHost|SearchHost' }).Count
$gfA = @($abD | Where-Object { $_.modul -match '(?i)^(igd|nvwgf|nvd3d|nvoglv|atidxx|amdxx|aticfx|atio6|d3d1[0-2])' }).Count
$net1026 = @(EvSt @{ LogName = 'Application'; ProviderName = '.NET Runtime'; Id = 1026; StartTime = (Get-Date).AddDays(-14) } 100).Count
$netA = $net1026 + @($abD | Where-Object { $_.code -match '(?i)e0434352' -or $_.modul -match '(?i)^(clr|coreclr|mscorwks)\.dll$' }).Count
$sxs = @(EvSt @{ LogName = 'Application'; ProviderName = 'SideBySide'; StartTime = (Get-Date).AddDays(-14) } 100 | Where-Object { $_.Level -le 2 }).Count
Fakt 'explorerAbst14' $expA; Fakt 'shellAbst14' $shA; Fakt 'grafikModulAbst14' $gfA; Fakt 'dotnet14' $netA; Fakt 'sxs14' $sxs
Punkt 'Besondere Absturzmuster' $(if ($expA -or $shA -or $gfA -or $netA -or $sxs) { 'warn' } else { 'ok' }) ('Explorer ' + $expA + '×, Startmenü/Shell ' + $shA + '×, Grafiktreiber-Modul ' + $gfA + '×, .NET ' + $netA + '×, Side-by-Side ' + $sxs + '×')
$idx = $null
try { $rm = Get-CimInstance Win32_ReliabilityStabilityMetrics -OperationTimeoutSec 20 -EA Stop | Select-Object -First 1; if ($rm) { $idx = [math]::Round([double]$rm.SystemStabilityIndex, 1) } } catch {}
Fakt 'stabilitaetsIndex' $idx
if ($null -ne $idx) { Punkt 'Zuverlässigkeitsindex (1–10)' $(if ($idx -lt 3) { 'fehler' } elseif ($idx -lt 6) { 'warn' } else { 'ok' }) ('' + $idx) }
`,
  },
  {
    id: 'sthang', titel: 'Einfrieren und kurze Hänger (Grafik, Datenträger, Speicher, Drosselung)', modus: 'system', timeoutMs: 90000,
    ps: FELD + String.raw`
$tdr = @(EvSt @{ LogName = 'System'; ProviderName = 'Display'; Id = 4101; StartTime = (Get-Date).AddDays(-14) } 200).Count
Fakt 'tdr14' $tdr
Punkt '„Anzeigetreiber wurde wiederhergestellt“ (14 Tage)' $(if ($tdr -ge 2) { 'fehler' } elseif ($tdr) { 'warn' } else { 'ok' }) ('' + $tdr + '×')
$lk = New-Object System.Collections.Generic.List[string]
foreach ($wd in @('C:\ProgramData\Microsoft\Windows\WER\ReportArchive', 'C:\ProgramData\Microsoft\Windows\WER\ReportQueue')) {
  foreach ($od in @(Get-ChildItem -LiteralPath $wd -Directory -EA SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-30) })) {
    if ($od.Name -match '^(Kernel|LiveKernelEvent)_([0-9a-fA-F]+)_') { $lk.Add($Matches[2].ToLower()) }
  }
}
Fakt 'liveKernel30' $lk.Count; Fakt 'liveKernelCodes' @($lk | Select-Object -Unique)
Punkt 'LiveKernelEvents (30 Tage)' $(if ($lk.Count -ge 2) { 'warn' } else { 'ok' }) $(if ($lk.Count) { '' + $lk.Count + '× · Codes ' + ((@($lk | Select-Object -Unique)) -join ', ') } else { 'keine' })
$res = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Resource-Exhaustion-Detector'; Id = 2004; StartTime = (Get-Date).AddDays(-14) } 100).Count
Fakt 'ressourcen14' $res
Punkt '„Virtueller Arbeitsspeicher knapp“ (14 Tage)' $(if ($res) { 'warn' } else { 'ok' }) ('' + $res + '×')
$io = @(EvSt @{ LogName = 'System'; Id = 129, 153; StartTime = (Get-Date).AddDays(-14) } 300 | Where-Object { $_.ProviderName -match '(?i)^disk$|stor|nvme|iaStor' }).Count
Fakt 'io14' $io
Punkt 'Datenträger antwortet verzögert (153/129, 14 Tage)' $(if ($io -ge 3) { 'fehler' } elseif ($io) { 'warn' } else { 'ok' }) ('' + $io + '×')
$d37 = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Processor-Power'; Id = 37; StartTime = (Get-Date).AddDays(-7) } 200).Count
Fakt 'drossel37' $d37
Punkt 'Prozessor durch Firmware gedrosselt (7 Tage)' $(if ($d37) { 'warn' } else { 'ok' }) ('' + $d37 + '×')
$exH = @(EvSt @{ LogName = 'Application'; ProviderName = 'Application Hang'; Id = 1002; StartTime = (Get-Date).AddDays(-14) } 300 | Where-Object { $na = ''; try { $na = [string]$_.Properties[0].Value } catch {}; $na -match '(?i)^explorer\.exe$' }).Count
Fakt 'explorerHaenger14' $exH
Punkt 'Explorer/Taskleiste hängt (14 Tage)' $(if ($exH -ge 3) { 'warn' } else { 'ok' }) ('' + $exH + '×')
$zw = 0
foreach ($ev in @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 41; StartTime = (Get-Date).AddDays(-30) } 100)) {
  $pb = DatenFeldSt $ev 'PowerButtonTimestamp'; $lp = DatenFeldSt $ev 'LongPowerButtonPressDetected'
  if (($pb -and $pb -ne '0') -or $lp -eq 'true') { $zw++ }
}
Fakt 'zwangsAus30' $zw
Punkt 'Per Ein/Aus-Taste hart ausgeschaltet (30 Tage)' $(if ($zw) { 'warn' } else { 'ok' }) ('' + $zw + '×')
$wh = @(EvSt @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WHEA-Logger'; StartTime = (Get-Date).AddDays(-30) } 200).Count
Fakt 'whea30' $wh
Punkt 'Hardwarefehler (WHEA, 30 Tage)' $(if ($wh) { 'warn' } else { 'ok' }) ('' + $wh + '×')
`,
  },
  {
    id: 'stdown', titel: 'Herunterfahren und Abmelden (Dauer, Bremser, Profil, Offlinedateien, Sitzungen)', modus: 'system', timeoutMs: 90000,
    ps: FELD + String.raw`
$sd = @(EvSt @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 200; StartTime = (Get-Date).AddDays(-30) } 10)
if ($sd.Count) {
  $zeiten = @($sd | ForEach-Object { [double](DatenFeldSt $_ 'ShutdownTime') } | Where-Object { $_ -gt 0 })
  $letzt = [math]::Round([double](DatenFeldSt $sd[0] 'ShutdownTime') / 1000)
  $max = $(if ($zeiten.Count) { [math]::Round(($zeiten | Measure-Object -Maximum).Maximum / 1000) } else { $null })
  Fakt 'herunterfahrenSek' $letzt; Fakt 'herunterfahrenMaxSek' $max
  Punkt 'Dauer des Herunterfahrens (laut Windows)' $(if ($letzt -ge 90) { 'warn' } else { 'ok' }) ('zuletzt ' + $letzt + ' s, längste ' + $max + ' s (30 Tage)')
} else { Punkt 'Dauer des Herunterfahrens (laut Windows)' 'info' 'keine Messung vorhanden (Protokoll leer oder nicht lesbar)' }
$br = @(EvSt @{ LogName = 'Microsoft-Windows-Diagnostics-Performance/Operational'; Id = 201, 202, 203; StartTime = (Get-Date).AddDays(-30) } 40)
$brems = @($br | ForEach-Object { $fn = DatenFeldSt $_ 'FriendlyName'; if (-not $fn) { $fn = DatenFeldSt $_ 'Name' }; $fn } | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object -First 5 | ForEach-Object { [string]$_.Name })
Fakt 'bremser' @($brems)
Punkt 'Was das Herunterfahren bremst (laut Windows)' $(if ($brems.Count) { 'warn' } else { 'ok' }) $(if ($brems.Count) { $brems -join ', ' } else { 'nichts gemeldet' })
$p1530 = @(EvSt @{ LogName = 'Application'; Id = 1530; StartTime = (Get-Date).AddDays(-14) } 200 | Where-Object { $_.ProviderName -match '(?i)User Profile' }).Count
Fakt 'profil1530' $p1530
Punkt 'Benutzerprofil wird festgehalten (1530, 14 Tage)' $(if ($p1530 -ge 3) { 'warn' } else { 'ok' }) ('' + $p1530 + '×')
$csc = Get-Service -Name CscService -EA SilentlyContinue
$cscStart = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\CSC' -Name Start -EA SilentlyContinue).Start
$off = ($null -ne $csc -and [string]$csc.Status -eq 'Running' -and $cscStart -ne 4)
Fakt 'offlineDateien' $off
Punkt 'Offlinedateien' 'info' $(if ($off) { 'aktiv (Synchronisierung beim Abmelden möglich)' } else { 'aus' })
$ctl = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control' -Name WaitToKillServiceTimeout -EA SilentlyContinue
$warte = $null; if ($ctl) { $warte = [int]([string]$ctl.WaitToKillServiceTimeout) }
$mm = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' -Name ClearPageFileAtShutdown -EA SilentlyContinue).ClearPageFileAtShutdown
Fakt 'wartezeitMs' $warte; Fakt 'pagefileLoeschen' ($mm -eq 1)
Punkt 'Einstellungen beim Herunterfahren' $(if ($mm -eq 1 -or $warte -gt 20000) { 'warn' } else { 'ok' }) ('Dienste-Wartezeit ' + $(if ($null -ne $warte) { '' + $warte + ' ms' } else { 'Standard' }) + $(if ($mm -eq 1) { ' · Auslagerungsdatei wird beim Herunterfahren GELÖSCHT (dauert lange)' } else { '' }))
$sitz = @(Get-Process -Name explorer -EA SilentlyContinue | ForEach-Object { $_.SessionId } | Select-Object -Unique).Count
Fakt 'sitzungen' $sitz
Punkt 'Angemeldete Benutzer' $(if ($sitz -ge 2) { 'warn' } else { 'ok' }) ('' + $sitz + ' Sitzung(en) mit Desktop')
$skr = @(Get-ChildItem -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Group Policy\Scripts\Shutdown' -EA SilentlyContinue).Count
Fakt 'shutdownSkripte' $skr
if ($skr) { Punkt 'Skripte beim Herunterfahren (Gruppenrichtlinie)' 'info' ('' + $skr) }
$hb = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Power' -Name HiberbootEnabled -EA SilentlyContinue).HiberbootEnabled
Fakt 'schnellstart' ($hb -eq 1)
`,
  },
]

export const THEMEN_STABILITAET: DgOber[] = [
  {
    id: 'stabilitaet', titel: 'Abstürze, Bluescreen & Start', symbol: 'Bug', beschreibung: 'Bluescreen, PC geht einfach aus, startet nicht richtig, BitLocker-Abfrage, Programme stürzen ab, PC friert ein, Herunterfahren dauert ewig',
    unter: [
      {
        id: 'st-bluescreen', titel: 'Bluescreen (blauer Bildschirm mit Fehlercode)', beschreibung: 'Blauer oder schwarzer Bildschirm mit „Auf Ihrem PC ist ein Problem aufgetreten“, danach Neustart',
        sonden: ['stbs', 'sys'],
        regeln: [
          { id: 'dpc', wenn: f => hatCode(f['stbs.codes'], ['0x133']), befund: f => `Bluescreen DPC_WATCHDOG_VIOLATION (0x133)${bsInfo(f['stbs.anzahl90'], f['stbs.letzteVorTagen'])}`, problem: 'leistung-bluescreen-dpc-watchdog-violation', schwere: 3 },
          { id: 'power-state', wenn: f => hatCode(f['stbs.codes'], ['0x9f', '0xa0']), befund: f => `Bluescreen DRIVER_POWER_STATE_FAILURE (0x9F) – Treiber beim Standby/Abdocken${bsInfo(f['stbs.anzahl90'], f['stbs.letzteVorTagen'])}`, problem: 'leistung-bluescreen-driver-power-state', schwere: 3 },
          { id: 'video-tdr', wenn: f => hatCode(f['stbs.codes'], ['0x116', '0x117']), befund: f => `Bluescreen VIDEO_TDR_FAILURE (0x116) – Grafiktreiber${bsInfo(f['stbs.anzahl90'], f['stbs.letzteVorTagen'])}`, problem: 'bildschirm-bluescreen-video-tdr', schwere: 3 },
          { id: 'ssd', wenn: f => hatCode(f['stbs.codes'], ['0x7a', '0x77', '0x24', '0xf4', '0x154']), befund: f => `Bluescreen mit Lesefehler vom Datenträger (${txt(f['stbs.codes'])})${bsInfo(f['stbs.anzahl90'], f['stbs.letzteVorTagen'])}`, problem: 'leistung-bluescreen-kernel-data-inpage-error', schwere: 3 },
          { id: 'kritischer-prozess', wenn: f => hatCode(f['stbs.codes'], ['0xef']), befund: f => `Bluescreen CRITICAL_PROCESS_DIED (0xEF)${bsInfo(f['stbs.anzahl90'], f['stbs.letzteVorTagen'])}`, problem: 'leistung-bluescreen-critical-process-died', schwere: 3 },
          { id: 'speicher', wenn: f => hatCode(f['stbs.codes'], ['0x1a', '0x19', '0x50', '0x4e', '0xc2', '0x13a']), befund: f => `Bluescreen mit Speicherfehler (${txt(f['stbs.codes'])}) – Arbeitsspeicher oder Treiber`, problem: 'leistung-bluescreen-memory-management', schwere: 2 },
          { id: 'whea', wenn: f => hatCode(f['stbs.codes'], ['0x124']) || num(f['stbs.whea30']) > 0, befund: f => `Hardwarefehler (WHEA): ${hatCode(f['stbs.codes'], ['0x124']) ? 'Bluescreen 0x124, ' : ''}${f['stbs.whea30'] ?? 0} WHEA-Meldung(en) in 30 Tagen`, problem: 'leistung-hardwarefehler-whea', schwere: 2 },
          { id: 'treiber-neu', wenn: f => hatCode(f['stbs.codes'], ['0x139', '0x3b', '0x7e', '0xd1', '0xa', '0x1e', '0x7f', '0x10d', '0xe6', '0x101']) && (num(f['stbs.treiber14']) > 0 || num(f['stbs.updates14']) > 0), befund: f => `Treiber-Bluescreen (${txt(f['stbs.codes'])}) nach ${f['stbs.treiber14']} Treiber- und ${f['stbs.updates14']} Windows-Installation(en) in 14 Tagen`, problem: 'leistung-bluescreen-nach-update', schwere: 2 },
        ],
        ohneBefund: ['leistung-bluescreen', 'hardware-bluescreen', 'leistung-bluescreen-kein-speicherabbild'],
      },
      {
        id: 'st-aus', titel: 'PC geht einfach aus oder startet von selbst neu', beschreibung: 'Bildschirm plötzlich schwarz, PC ist aus oder fährt ohne Vorwarnung neu hoch – offene Arbeit ist weg',
        sonden: ['stpw', 'stbs', 'sys'],
        regeln: [
          { id: 'bluescreen-neustart', wenn: f => num(f['stpw.mitBugcheck30']) > 0 || num(f['stbs.anzahl30']) > 0, befund: f => `Hinter den Neustarts stecken Bluescreens (${num(f['stbs.anzahl30']) > 0 ? f['stbs.anzahl30'] : f['stpw.mitBugcheck30']}× in 30 Tagen${txt(f['stbs.letzterCode']) ? ', zuletzt ' + txt(f['stbs.letzterCode']) : ''}) – Windows startet danach automatisch neu`, problem: 'leistung-pc-startet-staendig-neu', schwere: 3 },
          { id: 'update-neustart', wenn: f => num(f['stpw.updateNeustarts30']) >= 2, befund: f => `${f['stpw.updateNeustarts30']} Neustarts in 30 Tagen wurden von Updates bzw. der Softwareverteilung ausgelöst (zuletzt ${txt(f['stpw.letzterUpdateAusloeser'])})`, problem: 'update-intune-neustart-angekuendigt', schwere: 2 },
          { id: 'eingefroren', wenn: f => num(f['stpw.knopf30']) > 0, befund: f => `${f['stpw.knopf30']}× wurde der PC per Ein/Aus-Taste hart ausgeschaltet – er war vorher eingefroren`, problem: 'leistung-pc-friert-ein', schwere: 2 },
          { id: 'hitze', wenn: f => num(f['stpw.thermik30']) > 0 || num(f['stpw.tempC']) >= 90, befund: f => (num(f['stpw.thermik30']) > 0 ? `${f['stpw.thermik30']} Hitze-Meldung(en) in 30 Tagen` : `Temperatur ${f['stpw.tempC']} °C`), problem: 'akku-ueberhitzung-standby-aus', schwere: 2 },
          { id: 'whea', wenn: f => num(f['stpw.whea30']) > 0, befund: f => `${f['stpw.whea30']} Hardwarefehler (WHEA) in 30 Tagen`, problem: 'leistung-hardwarefehler-whea', schwere: 2 },
          { id: 'akku-aus', wenn: f => ja(f['stpw.akku']) && num(f['stpw.hartAus30']) >= 1, befund: f => `Laptop ging ${f['stpw.hartAus30']}× in 30 Tagen ohne Bluescreen einfach aus (Akku/Stromversorgung?)`, problem: 'akku-geht-aus-trotz-ladung', schwere: 2 },
          { id: 'desktop-aus', wenn: f => nein(f['stpw.akku']) && num(f['stpw.hartAus30']) >= 2, befund: f => `PC ging ${f['stpw.hartAus30']}× in 30 Tagen ohne Bluescreen einfach aus (Netzteil/Stromversorgung?)`, problem: 'leistung-pc-geht-einfach-aus', schwere: 2 },
          { id: 'einmal-aus', wenn: f => num(f['stpw.hartAus30']) >= 1, befund: f => `${f['stpw.hartAus30']}× unerwartet ausgegangen (Kernel-Power 41) in 30 Tagen`, problem: 'leistung-pc-geht-einfach-aus', schwere: 1 },
        ],
        ohneBefund: ['leistung-pc-geht-einfach-aus', 'leistung-pc-startet-staendig-neu', 'akku-geht-aus-trotz-ladung', 'akku-pc-geht-unter-last-aus'],
      },
      {
        id: 'st-start', titel: 'PC startet nicht richtig oder BitLocker fragt bei jedem Start', beschreibung: 'Blauer BitLocker-Bildschirm will den Wiederherstellungsschlüssel, „Laufwerk wird überprüft“, Start dauert ewig oder bricht ab',
        sonden: ['stboot', 'pfstart', 'sys'],
        fragen: [{ id: 'bitlocker', text: 'Erscheint beim Start der blaue BitLocker-Bildschirm mit der Frage nach dem Wiederherstellungsschlüssel?' }],
        regeln: [
          { id: 'bl-jeder-start', wenn: f => num(f['stboot.blWiederherstellung30']) >= 2, befund: f => `${f['stboot.blWiederherstellung30']} Hinweise auf BitLocker-Wiederherstellung in 30 Tagen`, problem: 'sicherheit-bitlocker-schluessel-jeder-start', schwere: 3 },
          { id: 'tpm', wenn: f => nein(f['stboot.tpmBereit']), befund: f => (nein(f['stboot.tpmVorhanden']) ? 'Kein Sicherheitschip (TPM) gefunden' : 'Sicherheitschip (TPM) ist vorhanden, aber nicht bereit'), problem: 'sicherheit-tpm-fehler', schwere: 3 },
          { id: 'chkdsk', wenn: f => ja(f['stboot.dirty']) || num(f['stboot.chkdsk30']) >= 3, befund: f => (ja(f['stboot.dirty']) ? 'Laufwerk C: ist als fehlerhaft markiert – die Prüfung läuft bei jedem Start' : `Datenträgerprüfung lief ${f['stboot.chkdsk30']}× in 30 Tagen beim Start`), problem: 'leistung-chkdsk-bei-jedem-start', schwere: 3 },
          { id: 'bl-anwender', wenn: f => f['frage.bitlocker'] === 'ja', befund: f => 'Laut Anwender verlangt BitLocker beim Start den Wiederherstellungsschlüssel' + (ja(f['stboot.blTpmPin']) ? ' (Start-PIN ist eingerichtet)' : ''), problem: 'sicherheit-bitlocker-wiederherstellungsschluessel', schwere: 2 },
          { id: 'bl-pausiert', wenn: f => ja(f['stboot.blPausiert']), befund: () => 'BitLocker-Schutz ist angehalten (pausiert) – C: ist verschlüsselt, aber ungeschützt', problem: 'sicherheit-bitlocker-pausiert', schwere: 2 },
          { id: 'secure-boot', wenn: f => nein(f['stboot.secureBoot']), befund: () => 'Secure Boot ist ausgeschaltet – BitLocker misstraut dann oft dem Start', problem: 'sicherheit-secure-boot-deaktiviert', schwere: 2 },
          { id: 'boot-lang', wenn: f => num(f['pfstart.bootSek']) >= 180, befund: f => `Letzter Start dauerte laut Windows ${f['pfstart.bootSek']} s`, problem: 'leistung-hochfahren-langsam', schwere: 2 },
          { id: 'updates', wenn: f => ja(f['sys.neustartAusstehend']), befund: () => 'Updates warten auf einen Neustart – beim nächsten Start werden sie eingespielt (kann dauern)', problem: 'update-arbeiten-an-updates-haengt-beim-start', schwere: 1 },
        ],
        ohneBefund: ['leistung-automatische-reparatur-beim-start', 'sicherheit-bitlocker-wiederherstellungsschluessel', 'hardware-start-haengt-hp-logo', 'hardware-startet-ins-bios'],
      },
      {
        id: 'st-programm', titel: 'Ein Programm stürzt immer wieder ab', beschreibung: 'Programm schließt sich plötzlich, „… funktioniert nicht mehr“, Fenster friert mit „Keine Rückmeldung“ ein',
        sonden: ['stapp'],
        regeln: [
          { id: 'explorer', wenn: f => num(f['stapp.explorerAbst14']) >= 2, befund: f => `Explorer ist in 14 Tagen ${f['stapp.explorerAbst14']}× abgestürzt`, problem: 'windows-explorer-stuerzt-ab', schwere: 3 },
          { id: 'dotnet', wenn: f => num(f['stapp.dotnet14']) >= 2, befund: f => `${f['stapp.dotnet14']} .NET-Abstürze in 14 Tagen (Ereignis 1026 / clr.dll)`, problem: 'update-dotnet-programm-absturz', schwere: 3 },
          { id: 'grafik', wenn: f => num(f['stapp.grafikModulAbst14']) >= 1, befund: f => `${f['stapp.grafikModulAbst14']} Absturz/Abstürze im Grafiktreiber-Modul`, problem: 'bildschirm-tdr-3d-modelle', schwere: 2 },
          { id: 'shell', wenn: f => num(f['stapp.shellAbst14']) >= 2, befund: f => `Startmenü/Shell (ShellExperienceHost, StartMenuExperienceHost) ${f['stapp.shellAbst14']}× abgestürzt`, problem: 'windows-shellexperiencehost-0xc000027b', schwere: 2 },
          { id: 'sxs', wenn: f => num(f['stapp.sxs14']) >= 1, befund: f => `${f['stapp.sxs14']} Side-by-Side-Fehler (fehlende Laufzeitbibliothek, z. B. Visual C++)`, problem: 'update-start-fehler-0xc000007b', schwere: 2 },
          { id: 'office-haengt', wenn: f => num(f['stapp.topHaengerAnzahl']) >= 3 && /^(excel|winword|powerpnt|onenote)\.exe$/i.test(txt(f['stapp.topHaengerApp'])), befund: f => `${txt(f['stapp.topHaengerApp'])} hing in 14 Tagen ${f['stapp.topHaengerAnzahl']}× („Keine Rückmeldung“)`, problem: 'office-programm-haengt', schwere: 2 },
          { id: 'top-app', wenn: f => num(f['stapp.topAppAnzahl']) >= 3, befund: f => `${txt(f['stapp.topApp'])} ist in 14 Tagen ${f['stapp.topAppAnzahl']}× abgestürzt (fehlerhaftes Modul: ${txt(f['stapp.topModul'])})`, problem: 'update-programm-stuerzt-ab', schwere: 2 },
          { id: 'index', wenn: f => num(f['stapp.stabilitaetsIndex']) < 3, befund: f => `Zuverlässigkeitsindex nur ${zahl(f['stapp.stabilitaetsIndex'])} von 10`, problem: 'programm-fachprogramm-absturz-hersteller-infos', schwere: 1 },
        ],
        ohneBefund: ['update-programm-stuerzt-ab', 'programm-fachprogramm-absturz-hersteller-infos', 'update-programm-startet-nicht'],
      },
      {
        id: 'st-einfrieren', titel: 'PC friert ein oder hängt immer wieder kurz', beschreibung: 'Bild steht, Maus bewegt sich nicht oder nur ruckartig, nach Sekunden geht es weiter – oder nur noch Ausschalten hilft',
        sonden: ['sthang', 'sys'],
        regeln: [
          { id: 'livekernel', wenn: f => liste(f['sthang.liveKernelCodes']).some(c => ['141', '117', '1a8', '193'].includes(c)), befund: f => `${f['sthang.liveKernel30']} LiveKernelEvent(s) in 30 Tagen (Codes ${txt(f['sthang.liveKernelCodes'])}) – Grafik- oder USB-Treiber hängt`, problem: 'bildschirm-livekernelevent-141', schwere: 3 },
          { id: 'io', wenn: f => num(f['sthang.io14']) >= 3, befund: f => `Datenträger antwortete in 14 Tagen ${f['sthang.io14']}× verzögert (Ereignis 153/129)`, problem: 'hardware-disk-153-129-reset', schwere: 3 },
          { id: 'tdr', wenn: f => num(f['sthang.tdr14']) >= 2, befund: f => `Grafiktreiber musste in 14 Tagen ${f['sthang.tdr14']}× neu gestartet werden (Ereignis 4101)`, problem: 'bildschirm-kurz-schwarz', schwere: 2 },
          { id: 'ressourcen', wenn: f => num(f['sthang.ressourcen14']) > 0, befund: f => `${f['sthang.ressourcen14']}× „Virtueller Arbeitsspeicher knapp“ in 14 Tagen`, problem: 'leistung-meldung-virtueller-speicher', schwere: 2 },
          { id: 'ram', wenn: f => num(f['sys.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher fast voll (${f['sys.ramFreiProzent']} % frei)`, problem: 'leistung-arbeitsspeicher-voll', schwere: 2 },
          { id: 'explorer', wenn: f => num(f['sthang.explorerHaenger14']) >= 3, befund: f => `Explorer/Taskleiste hing in 14 Tagen ${f['sthang.explorerHaenger14']}×`, problem: 'windows-taskleiste-reagiert-nicht', schwere: 2 },
          { id: 'whea', wenn: f => num(f['sthang.whea30']) > 0, befund: f => `${f['sthang.whea30']} Hardwarefehler (WHEA) in 30 Tagen`, problem: 'leistung-hardwarefehler-whea', schwere: 2 },
          { id: 'zwangsaus', wenn: f => num(f['sthang.zwangsAus30']) > 0, befund: f => `PC musste ${f['sthang.zwangsAus30']}× per Ein/Aus-Taste ausgeschaltet werden`, problem: 'leistung-pc-friert-ein', schwere: 1 },
        ],
        ohneBefund: ['leistung-pc-friert-ein', 'leistung-mikroruckler', 'leistung-nach-standby-haengt', 'bildschirm-livekernelevent-141'],
      },
      {
        id: 'st-herunterfahren', titel: 'Herunterfahren oder Abmelden dauert ewig', beschreibung: '„Wird heruntergefahren“ oder „Wird abgemeldet“ dreht minutenlang, PC geht gar nicht aus',
        sonden: ['stdown', 'sys'],
        regeln: [
          { id: 'profil-1530', wenn: f => num(f['stdown.profil1530']) >= 3, befund: f => `Benutzerprofil wurde in 14 Tagen ${f['stdown.profil1530']}× von Programmen festgehalten (Ereignis 1530)`, problem: 'konto-abmelden-haengt', schwere: 3 },
          { id: 'pagefile-loeschen', wenn: f => ja(f['stdown.pagefileLoeschen']), befund: () => 'Die Auslagerungsdatei wird bei jedem Herunterfahren gelöscht (ClearPageFileAtShutdown)', problem: 'windows-herunterfahren-haengt', schwere: 3 },
          { id: 'dauer', wenn: f => num(f['stdown.herunterfahrenSek']) >= 90 || num(f['stdown.herunterfahrenMaxSek']) >= 180, befund: f => `Herunterfahren dauerte zuletzt ${f['stdown.herunterfahrenSek']} s (längste ${f['stdown.herunterfahrenMaxSek']} s)${liste(f['stdown.bremser']).length ? ' – gebremst durch ' + txt(f['stdown.bremser']) : ''}`, problem: 'windows-herunterfahren-haengt', schwere: 2 },
          { id: 'offline', wenn: f => ja(f['stdown.offlineDateien']) && (num(f['stdown.herunterfahrenSek']) >= 60 || num(f['stdown.profil1530']) > 0), befund: () => 'Offlinedateien sind aktiv und synchronisieren beim Abmelden', problem: 'laufwerk-abmelden-haengt-offline', schwere: 2 },
          { id: 'sitzungen', wenn: f => num(f['stdown.sitzungen']) >= 2, befund: f => `${f['stdown.sitzungen']} Benutzer sind gleichzeitig angemeldet`, problem: 'konto-herunterfahren-andere-angemeldet', schwere: 2 },
          { id: 'bremser', wenn: f => liste(f['stdown.bremser']).length > 0, befund: f => `Windows meldet als Bremse beim Herunterfahren: ${txt(f['stdown.bremser'])}`, problem: 'windows-herunterfahren-haengt', schwere: 1 },
          { id: 'wartezeit', wenn: f => num(f['stdown.wartezeitMs']) > 20000, befund: f => `Windows wartet beim Herunterfahren bis zu ${Math.round(num(f['stdown.wartezeitMs']) / 1000)} s auf Dienste`, problem: 'windows-herunterfahren-haengt', schwere: 1 },
          { id: 'updates', wenn: f => ja(f['sys.neustartAusstehend']), befund: () => 'Updates warten auf Installation beim Herunterfahren/Neustart', problem: 'update-neustart-staendig-verlangt', schwere: 1 },
        ],
        ohneBefund: ['windows-herunterfahren-haengt', 'konto-abmelden-haengt', 'akku-faehrt-nicht-herunter'],
      },
    ],
  },
]
