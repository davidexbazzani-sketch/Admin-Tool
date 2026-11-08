// ── Diagnose-Thema „Hardware: USB, Maus, Tastatur & Akku“ ───────────────────
// hwgeraet = Geräte-Manager (Fehlercodes, verwaiste Filter, USB-Energiesparen) · hweingabe = Maus-/Tastatur-/Touchpad-
// Einstellungen des Benutzers · hwbt = Bluetooth · akbat = Akku · akenergie = Standby/Ruhezustand/Energieplan
// hwdock = Dockingstation/Thunderbolt/USB-C. Alles NUR LESEND.
import { ja, liste, nein, num, txt } from '../motor'
import type { DgOber, DgSonde } from '../types'

/** Ereignisse sicher lesen (unbekannter Anbieter wirft sonst „Falscher Parameter“) und EventData-Feld lesen. */
const EV = String.raw`
function EvHw([hashtable]$fh, [int]$max) { try { return @(Get-WinEvent -FilterHashtable $fh -MaxEvents $max -EA Stop) } catch { return @() } }
function DatenFeldHw($ev, [string]$name) {
  try { $xml = [xml]$ev.ToXml(); $kn = @($xml.Event.EventData.Data | Where-Object { $_.Name -eq $name }); if ($kn.Count) { return [string]$kn[0].'#text' } } catch {}
  return $null
}
`
/** powercfg-Wert (Wechselstrom, Gleichstrom) der aktiven Energieeinstellung lesen; -1 = nicht vorhanden. */
const PC = String.raw`
function PcWertHw([string]$sub, [string]$set) {
  $o = @(powercfg /q SCHEME_CURRENT $sub $set 2>$null | ForEach-Object { [string]$_ })
  $h = @($o | ForEach-Object { if ($_ -match ':\s*(0x[0-9a-fA-F]+)\s*$') { [Convert]::ToInt64($Matches[1], 16) } })
  if ($h.Count -ge 2) { return @($h[$h.Count - 2], $h[$h.Count - 1]) }
  return @(-1, -1)
}
function OderNull($v) { if ($v -ge 0) { return $v }; return $null }
`

export const SONDEN_HARDWARE: DgSonde[] = [
  {
    id: 'hwgeraet', titel: 'Geräte-Manager (Fehlercodes, Tastatur-/Maus-Filter, USB-Energiesparen)', modus: 'system', timeoutMs: 90000,
    ps: PC + String.raw`
$fg = @(Get-CimInstance Win32_PnPEntity -Filter 'ConfigManagerErrorCode <> 0' -EA SilentlyContinue | Where-Object { [int]$_.ConfigManagerErrorCode -ne 45 })
Fakt 'fehlerAnzahl' $fg.Count
Fakt 'fehlerGeraete' @($fg | Select-Object -First 12 | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })
Punkt 'Geräte mit Fehler' $(if ($fg.Count) { 'warn' } else { 'ok' }) $(if ($fg.Count) { (@($fg | Select-Object -First 6 | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })) -join ', ' } else { 'keine' })
foreach ($paar in @(@('code43', @(43)), @('code10', @(10)), @('code28', @(28, 1, 18)), @('code22', @(22)), @('code52', @(52)), @('code39', @(19, 39)), @('code31', @(31)))) {
  $tr = @($fg | Where-Object { $paar[1] -contains [int]$_.ConfigManagerErrorCode })
  Fakt $paar[0] $tr.Count
  Fakt ($paar[0] + 'Geraete') @($tr | Select-Object -First 5 | ForEach-Object { [string]$_.Name })
}
$usb = @($fg | Where-Object { [string]$_.PNPClass -match '^(USB|USBDevice)$' -or [string]$_.Name -match '(?i)USB' })
$unbek = @($fg | Where-Object { [string]$_.Name -match '(?i)Unbekanntes USB|Unknown USB' })
Fakt 'usbFehler' $usb.Count; Fakt 'unbekanntUsb' $unbek.Count
Fakt 'kbdFehler' @($fg | Where-Object { [string]$_.PNPClass -eq 'Keyboard' }).Count
Fakt 'mausFehler' @($fg | Where-Object { [string]$_.PNPClass -eq 'Mouse' }).Count
Punkt 'USB-Geräte' $(if ($unbek.Count) { 'fehler' } elseif ($usb.Count) { 'warn' } else { 'ok' }) $(if ($unbek.Count) { '„USB-Gerät nicht erkannt“ (' + $unbek.Count + '×)' } elseif ($usb.Count) { '' + $usb.Count + ' USB-Gerät(e) mit Fehler' } else { 'alle in Ordnung' })
function FilterHw([string]$guid) { $k = Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Control\Class\' + $guid) -EA SilentlyContinue; if (-not $k) { return @() }; return @(@($k.UpperFilters) + @($k.LowerFilters) | Where-Object { $_ }) }
$kf = @(FilterHw '{4d36e96b-e325-11ce-bfc1-08002be10318}')
$mf = @(FilterHw '{4d36e96f-e325-11ce-bfc1-08002be10318}')
$kfTot = @($kf | Where-Object { -not (Test-Path -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $_)) })
$mfTot = @($mf | Where-Object { -not (Test-Path -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $_)) })
Fakt 'filterTastatur' @($kf); Fakt 'filterMaus' @($mf); Fakt 'verwaistTastatur' @($kfTot); Fakt 'verwaistMaus' @($mfTot)
Punkt 'Tastatur-Filtertreiber' $(if ($kfTot.Count) { 'fehler' } else { 'ok' }) ((@($kf) -join ', ') + $(if ($kfTot.Count) { ' · VERWAIST: ' + ($kfTot -join ', ') } else { '' }))
Punkt 'Maus-Filtertreiber' $(if ($mfTot.Count) { 'fehler' } else { 'ok' }) ((@($mf) -join ', ') + $(if ($mfTot.Count) { ' · VERWAIST: ' + ($mfTot -join ', ') } else { '' }))
$kbd = @(Get-CimInstance Win32_Keyboard -EA SilentlyContinue)
$zg = @(Get-CimInstance Win32_PointingDevice -EA SilentlyContinue)
$tpd = @(Get-CimInstance Win32_PnPEntity -EA SilentlyContinue | Where-Object { [string]$_.Name -match '(?i)touch ?pad|Synaptics|ELAN|Precision|Präzisions' })
Fakt 'tastaturen' $kbd.Count; Fakt 'zeigegeraete' @($zg | ForEach-Object { [string]$_.Name }); Fakt 'touchpadGeraet' ($tpd.Count -gt 0)
Punkt 'Eingabegeräte' 'info' ('' + $kbd.Count + ' Tastatur(en), ' + $zg.Count + ' Zeigegerät(e)' + $(if ($tpd.Count) { ', Touchpad vorhanden' } else { '' }))
$us = @(PcWertHw '2a737441-1930-4402-8d77-b2bebba308a3' '48e6b7a6-50f5-4782-a5d4-53bb8f07e226')
Fakt 'usbSuspendAc' (OderNull $us[0]); Fakt 'usbSuspendDc' (OderNull $us[1])
Punkt 'USB-Energiesparen (selektives Anhalten)' $(if ($us[0] -eq 1) { 'info' } else { 'ok' }) $(if ($us[0] -lt 0) { 'Einstellung nicht sichtbar' } elseif ($us[0] -eq 1) { 'an – USB-Geräte dürfen schlafen gelegt werden' } else { 'aus' })
`,
  },
  {
    id: 'hweingabe', titel: 'Maus-, Tastatur- und Touchpad-Einstellungen des Benutzers', modus: 'profil', timeoutMs: 60000,
    ps: String.raw`
NeedHive
function RegHw([string]$pfad, [string]$name) { $it = Get-ItemProperty -LiteralPath ($uHive + $pfad) -Name $name -EA SilentlyContinue; if ($it) { return $it.$name }; return $null }
function BitHw($v) { if ($null -eq $v -or [string]$v -eq '') { return $null }; try { return ([int64][string]$v -band 1) -eq 1 } catch { return $null } }
$tp = RegHw '\Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad\Status' 'Enabled'
$lo = RegHw '\Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad' 'LeaveOnWithMouse'
$taps = RegHw '\Software\Microsoft\Windows\CurrentVersion\PrecisionTouchPad' 'TapsEnabled'
Fakt 'touchpadAn' $(if ($null -eq $tp) { $null } else { [int]$tp -eq 1 })
Fakt 'touchpadAusBeiMaus' $(if ($null -eq $lo) { $null } else { [int]$lo -eq 0 })
Fakt 'tippenAus' $(if ($null -eq $taps) { $null } else { [int]$taps -eq 0 })
Punkt 'Touchpad (Einstellungen)' $(if ($null -ne $tp -and [int]$tp -eq 0) { 'fehler' } else { 'info' }) $(if ($null -eq $tp) { 'kein Präzisions-Touchpad eingestellt' } else { $(if ([int]$tp -eq 1) { 'an' } else { 'AUSGESCHALTET' }) + $(if ($null -ne $lo -and [int]$lo -eq 0) { ' · schaltet sich bei angeschlossener Maus ab' } else { '' }) + $(if ($null -ne $taps -and [int]$taps -eq 0) { ' · Antippen zum Klicken aus' } else { '' }) })
$swap = RegHw '\Control Panel\Mouse' 'SwapMouseButtons'
$sens = RegHw '\Control Panel\Mouse' 'MouseSensitivity'
$trail = RegHw '\Control Panel\Mouse' 'MouseTrails'
$dbl = RegHw '\Control Panel\Mouse' 'DoubleClickSpeed'
$upm = RegHw '\Control Panel\Desktop' 'UserPreferencesMask'
$klick = $null; if ($upm -is [byte[]] -and $upm.Length -ge 2) { $klick = ($upm[1] -band 0x80) -ne 0 }
Fakt 'tastenVertauscht' ([string]$swap -eq '1'); Fakt 'mausTempo' $(if ($sens) { [int][string]$sens } else { $null }); Fakt 'mausspur' ($trail -and [int][string]$trail -ge 2)
Fakt 'doppelklickMs' $(if ($dbl) { [int][string]$dbl } else { $null }); Fakt 'klickEinrasten' $klick
Punkt 'Maus' $(if ([string]$swap -eq '1' -or $klick -or ($trail -and [int][string]$trail -ge 2)) { 'warn' } else { 'ok' }) ('Tasten ' + $(if ([string]$swap -eq '1') { 'VERTAUSCHT' } else { 'normal' }) + ', Tempo ' + [string]$sens + '/20, Doppelklick ' + [string]$dbl + ' ms' + $(if ($klick) { ', KlickEinrasten AN' } else { '' }) + $(if ($trail -and [int][string]$trail -ge 2) { ', Mausspur AN' } else { '' }))
$sk = BitHw (RegHw '\Control Panel\Accessibility\StickyKeys' 'Flags')
$fk = BitHw (RegHw '\Control Panel\Accessibility\Keyboard Response' 'Flags')
$mk = BitHw (RegHw '\Control Panel\Accessibility\MouseKeys' 'Flags')
$tk = BitHw (RegHw '\Control Panel\Accessibility\ToggleKeys' 'Flags')
Fakt 'einrastAn' $sk; Fakt 'anschlagAn' $fk; Fakt 'tastaturmausAn' $mk; Fakt 'umschalttonAn' $tk
$an = @(); if ($sk) { $an += 'Einrastfunktion' }; if ($fk) { $an += 'Anschlagverzögerung' }; if ($mk) { $an += 'Tastaturmaus' }; if ($tk) { $an += 'Umschalttöne' }
Punkt 'Eingabehilfen' $(if ($an.Count) { 'warn' } else { 'ok' }) $(if ($an.Count) { 'eingeschaltet: ' + ($an -join ', ') } else { 'alle aus' })
$kd = RegHw '\Control Panel\Keyboard' 'KeyboardDelay'; $ks = RegHw '\Control Panel\Keyboard' 'KeyboardSpeed'
Fakt 'tastaturDelay' $(if ($null -ne $kd) { [int][string]$kd } else { $null }); Fakt 'tastaturSpeed' $(if ($null -ne $ks) { [int][string]$ks } else { $null })
$pre = Get-ItemProperty -LiteralPath ($uHive + '\Keyboard Layout\Preload') -EA SilentlyContinue
$lay = @(); if ($pre) { $lay = @($pre.PSObject.Properties | Where-Object { $_.Name -match '^\d+$' } | Sort-Object { [int]$_.Name } | ForEach-Object { [string]$_.Value }) }
Fakt 'layouts' @($lay); Fakt 'layout1' $(if ($lay.Count) { $lay[0] } else { $null })
$deutsch = ($lay.Count -gt 0 -and $lay[0] -match '(?i)0407$|0807$|0c07$')
Punkt 'Tastaturlayout' $(if ($lay.Count -gt 1 -or -not $deutsch) { 'warn' } else { 'ok' }) $(if ($lay.Count) { (@($lay) -join ', ') + $(if ($deutsch) { ' (Deutsch zuerst)' } else { ' (NICHT Deutsch zuerst)' }) + $(if ($lay.Count -gt 1) { ' · mehrere Layouts – Umschalten mit Alt+Umschalt möglich' } else { '' }) } else { 'nicht lesbar' })
$nlD = (Get-ItemProperty -LiteralPath 'Registry::HKEY_USERS\.DEFAULT\Control Panel\Keyboard' -Name InitialKeyboardIndicators -EA SilentlyContinue).InitialKeyboardIndicators
$nlA = $null; if ($null -ne $nlD) { try { $nlA = ([int64][string]$nlD -band 2) -ne 0 } catch {} }
Fakt 'numlockAnmeldung' $nlA
Punkt 'NumLock am Anmeldebildschirm' 'info' $(if ($null -eq $nlA) { 'unbekannt' } elseif ($nlA) { 'an' } else { 'aus' })
`,
  },
  {
    id: 'hwbt', titel: 'Bluetooth (Adapter, Dienst, Flugmodus, gekoppelte Geräte)', modus: 'system', timeoutMs: 60000,
    ps: String.raw`
$bt = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Bluetooth'" -EA SilentlyContinue)
$radio = @($bt | Where-Object { [string]$_.PNPDeviceID -match '^(USB|PCI|ACPI|SDIO|UART)\\' })
Fakt 'adapterVorhanden' ($radio.Count -gt 0)
if ($radio.Count) {
  $r0 = $radio[0]
  Fakt 'adapterName' ([string]$r0.Name); Fakt 'adapterCode' ([int]$r0.ConfigManagerErrorCode)
  Punkt 'Bluetooth-Adapter' $(if ([int]$r0.ConfigManagerErrorCode -eq 0) { 'ok' } else { 'fehler' }) ([string]$r0.Name + $(if ([int]$r0.ConfigManagerErrorCode -eq 22) { ' – DEAKTIVIERT (Code 22)' } elseif ([int]$r0.ConfigManagerErrorCode -ne 0) { ' – Fehler Code ' + $r0.ConfigManagerErrorCode } else { '' }))
} else { Fakt 'adapterName' $null; Fakt 'adapterCode' $null; Punkt 'Bluetooth-Adapter' 'fehler' 'kein Bluetooth-Adapter gefunden' }
$gek = @($bt | Where-Object { [string]$_.PNPDeviceID -match '^(BTHENUM\\DEV_|BTHLE\\DEV_)' } | ForEach-Object { [string]$_.Name } | Select-Object -Unique)
$btF = @($bt | Where-Object { [int]$_.ConfigManagerErrorCode -ne 0 -and [int]$_.ConfigManagerErrorCode -ne 45 })
$ohne = @($btF | Where-Object { [string]$_.Name -match '(?i)Peripherieger|Peripheral Device' })
Fakt 'gekoppelt' @($gek); Fakt 'fehlerGeraete' @($btF | Select-Object -First 8 | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' }); Fakt 'ohneTreiber' $ohne.Count
Punkt 'Gekoppelte Geräte' 'info' $(if ($gek.Count) { (@($gek | Select-Object -First 8)) -join ', ' } else { 'keine' })
if ($btF.Count) { Punkt 'Bluetooth-Einträge mit Fehler' 'warn' ((@($btF | Select-Object -First 5 | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })) -join ', ') }
$sv = Get-Service -Name bthserv -EA SilentlyContinue
Fakt 'dienst' $(if ($sv) { [string]$sv.Status } else { $null }); Fakt 'dienstStart' $(if ($sv) { [string]$sv.StartType } else { $null })
Punkt 'Bluetooth-Unterstützungsdienst' $(if (-not $sv) { 'info' } elseif ([string]$sv.Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($sv) { [string]$sv.Status + ' (' + [string]$sv.StartType + ')' } else { 'nicht vorhanden' })
$fm = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState' -EA SilentlyContinue).'(default)'
Fakt 'flugmodus' ($fm -eq 1)
Punkt 'Flugzeugmodus' $(if ($fm -eq 1) { 'fehler' } else { 'ok' }) $(if ($fm -eq 1) { 'AN – Funk ist abgeschaltet' } else { 'aus' })
$spar = $null
if ($radio.Count) { try { $pw = @(Get-CimInstance -Namespace 'root\wmi' -ClassName MSPower_DeviceEnable -EA Stop | Where-Object { [string]$_.InstanceName -like ([string]$radio[0].PNPDeviceID + '*') }); if ($pw.Count) { $spar = [bool]$pw[0].Enable } } catch {} }
Fakt 'energiesparenAn' $spar
if ($null -ne $spar) { Punkt 'Adapter darf zum Energiesparen abgeschaltet werden' $(if ($spar) { 'warn' } else { 'ok' }) $(if ($spar) { 'ja' } else { 'nein' }) }
`,
  },
  {
    id: 'akbat', titel: 'Akku (Ladestand, Kapazität, Ladezyklen, Ladegrenze, Netzwechsel)', modus: 'system', timeoutMs: 60000,
    ps: EV + String.raw`
$enc = Get-CimInstance Win32_SystemEnclosure -EA SilentlyContinue | Select-Object -First 1
$laptop = @($enc.ChassisTypes | Where-Object { @(8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32) -contains [int]$_ }).Count -gt 0
$bat = @(Get-CimInstance Win32_Battery -EA SilentlyContinue)
Fakt 'laptop' $laptop; Fakt 'vorhanden' ($bat.Count -gt 0)
if ($bat.Count) {
  $b0 = $bat[0]; $proz = [int]$b0.EstimatedChargeRemaining; $bs = [int]$b0.BatteryStatus
  $stTxt = switch ($bs) { 1 { 'entlädt (Akkubetrieb)' } 2 { 'am Netz' } 3 { 'voll geladen' } 4 { 'niedrig' } 5 { 'kritisch' } 6 { 'lädt' } 7 { 'lädt (hoch)' } 8 { 'lädt (niedrig)' } 9 { 'lädt (kritisch)' } 11 { 'teilweise geladen' } default { 'unbekannt' } }
  $amNetz = @(2, 3, 6, 7, 8, 9, 11) -contains $bs
  $laedt = @(6, 7, 8, 9) -contains $bs
  try { $ws = Get-CimInstance -Namespace 'root\wmi' -ClassName BatteryStatus -EA Stop | Select-Object -First 1; if ($ws) { $amNetz = [bool]$ws.PowerOnline; $laedt = [bool]$ws.Charging } } catch {}
  Fakt 'prozent' $proz; Fakt 'status' $stTxt; Fakt 'amNetz' $amNetz; Fakt 'laedt' $laedt
  Punkt 'Ladestand' $(if ($amNetz -and -not $laedt -and $proz -lt 90) { 'warn' } else { 'ok' }) ('' + $proz + ' % · ' + $stTxt + $(if ($amNetz) { ' · Netzteil erkannt' + $(if ($laedt) { ', lädt' } else { ', lädt NICHT' }) } else { '' }))
} else {
  Punkt 'Akku' $(if ($laptop) { 'fehler' } else { 'info' }) $(if ($laptop) { 'Laptop, aber KEIN Akku erkannt' } else { 'kein Akku (Desktop-PC)' })
}
$design = $null; $voll = $null; $zyk = $null
try { $design = [double](Get-CimInstance -Namespace 'root\wmi' -ClassName BatteryStaticData -EA Stop | Select-Object -First 1).DesignedCapacity } catch {}
try { $voll = [double](Get-CimInstance -Namespace 'root\wmi' -ClassName BatteryFullChargedCapacity -EA Stop | Select-Object -First 1).FullChargedCapacity } catch {}
try { $zyk = [int](Get-CimInstance -Namespace 'root\wmi' -ClassName BatteryCycleCount -EA Stop | Select-Object -First 1).CycleCount } catch {}
$kap = $null; if ($design -gt 0 -and $voll -gt 0) { $kap = [math]::Round(100 * $voll / $design) }
Fakt 'designMWh' $design; Fakt 'vollMWh' $voll; Fakt 'kapazitaetProzent' $kap; Fakt 'zyklen' $(if ($zyk -gt 0) { $zyk } else { $null })
if ($bat.Count) { Punkt 'Akku-Gesundheit' $(if ($null -eq $kap) { 'info' } elseif ($kap -lt 50) { 'fehler' } elseif ($kap -lt 70) { 'warn' } else { 'ok' }) $(if ($null -ne $kap) { '' + $kap + ' % der Neukapazität (' + [math]::Round($voll / 1000, 1) + ' von ' + [math]::Round($design / 1000, 1) + ' Wh)' + $(if ($zyk -gt 0) { ', ' + $zyk + ' Ladezyklen' } else { '' }) } else { 'Kapazität nicht lesbar' }) }
$lg = $null
try { $lg = (@(Get-CimInstance -Namespace 'root\HP\InstrumentedBIOS' -ClassName HP_BIOSEnumeration -EA Stop | Where-Object { [string]$_.Name -match '(?i)Battery (Care|Health)|Adaptive Battery|Battery Charge' } | ForEach-Object { [string]$_.Name + ' = ' + [string]$_.CurrentValue })) -join '; ' } catch {}
Fakt 'ladegrenze' $(if ($lg) { $lg } else { $null }); Fakt 'ladegrenzeAktiv' $(if ($lg) { $lg -match '(?i)Maximize my battery health|80 ?%|= *Enable' } else { $null })
if ($lg) { Punkt 'Ladegrenze (HP-BIOS)' 'info' $lg }
$nw = @(EvHw @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 105; StartTime = (Get-Date).AddDays(-7) } 500).Count
Fakt 'netzwechsel7' $nw
if ($bat.Count) { Punkt 'Wechsel Netz/Akku (7 Tage)' $(if ($nw -ge 30) { 'warn' } else { 'ok' }) ('' + $nw + '×') }
`,
  },
  {
    id: 'akenergie', titel: 'Energie (Standby, Ruhezustand, Energieplan, Aufwachen, Deckel)', modus: 'system', timeoutMs: 90000,
    ps: EV + PC + String.raw`
$schema = [string](powercfg /getactivescheme 2>$null | Out-String)
$guid = ''; if ($schema -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') { $guid = $Matches[1].ToLower() }
$plan = switch ($guid) { '381b4222-f694-41f0-9685-ff5bb260df2e' { 'Ausbalanciert' } '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' { 'Höchstleistung' } 'a1841308-3541-4fab-bc81-f71556f20b4a' { 'Energiesparmodus' } 'e9a42b02-d5df-448d-aa00-03f14749eb61' { 'Ultimative Leistung' } default { if ($schema -match '\(([^)]+)\)') { $Matches[1] } else { $guid } } }
$planAnz = @(powercfg /list 2>$null | Where-Object { $_ -match '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-' }).Count
$ovl = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes' -EA SilentlyContinue
$effAc = ([string]$ovl.ActiveOverlayAcPowerScheme -eq '961cc777-2547-4f9d-8174-7d86181b8a7a'); $effDc = ([string]$ovl.ActiveOverlayDcPowerScheme -eq '961cc777-2547-4f9d-8174-7d86181b8a7a')
$gesp = @(Get-ChildItem -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings' -EA SilentlyContinue).Count -gt 0
Fakt 'energieplan' $plan; Fakt 'sparplan' ($guid -eq 'a1841308-3541-4fab-bc81-f71556f20b4a'); Fakt 'planAnzahl' $planAnz; Fakt 'overlayEffizienz' ($effAc -or $effDc); Fakt 'gesperrt' $gesp
Punkt 'Energieplan' $(if ($guid -eq 'a1841308-3541-4fab-bc81-f71556f20b4a' -or $effAc) { 'warn' } else { 'ok' }) ($plan + ' (' + $planAnz + ' Plan/Pläne vorhanden)' + $(if ($effAc -or $effDc) { ' · Energiemodus „Beste Energieeffizienz“' + $(if ($effAc) { ' am Netz' } else { ' im Akkubetrieb' }) } else { '' }) + $(if ($gesp) { ' · per Richtlinie vorgegeben' } else { '' }))
$sb = @(PcWertHw 'SUB_SLEEP' 'STANDBYIDLE'); $hi = @(PcWertHw 'SUB_SLEEP' 'HIBERNATEIDLE'); $vi = @(PcWertHw 'SUB_VIDEO' 'VIDEOIDLE')
$li = @(PcWertHw 'SUB_BUTTONS' 'LIDACTION'); $pb = @(PcWertHw 'SUB_BUTTONS' 'PBUTTONACTION')
$lo = @(PcWertHw 'SUB_BATTERY' 'BATLEVELLOW'); $kr = @(PcWertHw 'SUB_BATTERY' 'BATACTIONCRIT'); $es = @(PcWertHw 'SUB_ENERGYSAVER' 'ESBATTTHRESHOLD'); $pm = @(PcWertHw 'SUB_PROCESSOR' 'PROCTHROTTLEMAX')
Fakt 'standbyAcSek' (OderNull $sb[0]); Fakt 'standbyDcSek' (OderNull $sb[1]); Fakt 'ruheAcSek' (OderNull $hi[0]); Fakt 'ruheDcSek' (OderNull $hi[1])
Fakt 'bildAusAcSek' (OderNull $vi[0]); Fakt 'bildAusDcSek' (OderNull $vi[1]); Fakt 'deckelAc' (OderNull $li[0]); Fakt 'deckelDc' (OderNull $li[1]); Fakt 'netzschalterAc' (OderNull $pb[0])
Fakt 'akkuWarnungProzent' (OderNull $lo[1]); Fakt 'kritischAktion' (OderNull $kr[1]); Fakt 'sparmodusAb' (OderNull $es[1]); Fakt 'procMaxDc' (OderNull $pm[1])
function ZeitHw($v) { if ($v -lt 0) { return '–' }; if ($v -eq 0) { return 'nie' }; if ($v -ge 0x7fffffff) { return 'nie' }; if ($v -lt 120) { return '' + $v + ' s' }; return '' + [math]::Round($v / 60) + ' min' }
function AktHw($v) { switch ([int]$v) { 0 { 'nichts' } 1 { 'Energie sparen' } 2 { 'Ruhezustand' } 3 { 'Herunterfahren' } 4 { 'Bildschirm aus' } default { '–' } } }
Punkt 'Zeiten (Netz / Akku)' $(if ($vi[0] -gt 0 -and $vi[0] -le 60) { 'warn' } else { 'info' }) ('Bildschirm aus ' + (ZeitHw $vi[0]) + ' / ' + (ZeitHw $vi[1]) + ' · Energie sparen ' + (ZeitHw $sb[0]) + ' / ' + (ZeitHw $sb[1]) + ' · Ruhezustand ' + (ZeitHw $hi[0]) + ' / ' + (ZeitHw $hi[1]))
if ($li[0] -ge 0) { Punkt 'Deckel zuklappen (Netz / Akku)' $(if ($li[0] -eq 3 -or $li[1] -eq 3) { 'warn' } else { 'info' }) ((AktHw $li[0]) + ' / ' + (AktHw $li[1])) }
if ($lo[1] -ge 0) { Punkt 'Akkuwarnung / kritischer Akku' $(if ($lo[1] -ge 40 -or $kr[1] -eq 3) { 'warn' } else { 'info' }) ('Warnung bei ' + $lo[1] + ' %, bei kritischem Stand: ' + (AktHw $kr[1]) + $(if ($es[1] -ge 0) { ' · Energiesparmodus ab ' + $es[1] + ' %' } else { '' })) }
$av = [string](powercfg /a 2>$null | Out-String)
$teil = @($av -split '(?i)nicht verf|not available')
$verf = [string]$teil[0]
$ms = $verf -match 'S0'; $hib = $verf -match '(?i)Ruhezustand|Hibernate'
Fakt 'modernStandby' $ms; Fakt 'ruhezustandVerfuegbar' $hib
Punkt 'Verfügbare Energiesparzustände' $(if (-not $hib) { 'info' } else { 'ok' }) ($(if ($ms) { 'Modern Standby (S0)' } elseif ($verf -match 'S3') { 'klassischer Standby (S3)' } else { 'Standby unbekannt' }) + $(if ($hib) { ', Ruhezustand' } else { ', KEIN Ruhezustand' }))
$req = @()
try { $req = @(powercfg /requests 2>$null | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^\s*\[' } | ForEach-Object { $_.Trim() }) } catch {}
Fakt 'anforderungen' @($req | Select-Object -First 8)
Punkt 'Was den Standby gerade verhindert' $(if ($req.Count) { 'warn' } else { 'ok' }) $(if ($req.Count) { (@($req | Select-Object -First 4)) -join ' · ' } else { 'nichts (bzw. nur mit Adminrechten lesbar)' })
$wa = @(powercfg /devicequery wake_armed 2>$null | ForEach-Object { [string]$_ } | Where-Object { $_.Trim() -and $_ -notmatch '^(KEIN|NONE)' })
$netzW = @($wa | Where-Object { $_ -match '(?i)Ethernet|Network|Netzwerk|LAN|Wi-?Fi|Wireless|GbE|Realtek|Intel\(R\) (I|Ethernet)' }).Count -gt 0
Fakt 'weckGeraete' @($wa | Select-Object -First 10); Fakt 'netzWecker' $netzW
Punkt 'Geräte, die den PC wecken dürfen' $(if ($netzW) { 'warn' } else { 'info' }) $(if ($wa.Count) { (@($wa | Select-Object -First 5)) -join ', ' } else { 'keine' })
$aw = @(EvHw @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Power-Troubleshooter'; Id = 1; StartTime = (Get-Date).AddDays(-7) } 300)
$quellen = @($aw | ForEach-Object { DatenFeldHw $_ 'WakeSourceText' } | Where-Object { $_ } | Group-Object | Sort-Object Count -Descending | Select-Object -First 3 | ForEach-Object { [string]$_.Name + ' (' + $_.Count + '×)' })
$sl = @(EvHw @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 42; StartTime = (Get-Date).AddDays(-7) } 300).Count
Fakt 'aufwachen7' $aw.Count; Fakt 'standby7' $sl; Fakt 'weckQuellen' @($quellen)
Punkt 'Standby / Aufwachen (7 Tage)' $(if ($aw.Count -ge 10) { 'warn' } else { 'info' }) ('' + $sl + '× eingeschlafen, ' + $aw.Count + '× aufgewacht' + $(if ($quellen.Count) { ' · geweckt durch: ' + ($quellen -join ', ') } else { '' }))
`,
  },
  {
    id: 'hwdock', titel: 'Dockingstation, Thunderbolt und USB-C', modus: 'system', timeoutMs: 60000,
    ps: EV + String.raw`
$pnp = @(Get-CimInstance Win32_PnPEntity -EA SilentlyContinue)
$dg = @($pnp | Where-Object { [string]$_.Name -match '(?i)dock|thunderbolt|usb4|displaylink|usb-c|type-c|billboard|USB Ethernet|USB GbE|USB 10/100|Realtek USB|ASIX' })
$dockDa = @($dg | Where-Object { [string]$_.Name -match '(?i)dock|DisplayLink|Billboard|USB GbE|USB Ethernet|Realtek USB' -and [int]$_.ConfigManagerErrorCode -eq 0 }).Count -gt 0
$dF = @($dg | Where-Object { [int]$_.ConfigManagerErrorCode -ne 0 -and [int]$_.ConfigManagerErrorCode -ne 45 })
Fakt 'dockErkannt' $dockDa; Fakt 'dockGeraete' @($dg | Select-Object -First 10 | ForEach-Object { [string]$_.Name }); Fakt 'dockFehler' @($dF | Select-Object -First 6 | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })
Punkt 'Dock/Adapter erkannt' $(if ($dF.Count) { 'fehler' } elseif ($dockDa) { 'ok' } else { 'info' }) $(if ($dg.Count) { (@($dg | Select-Object -First 5 | ForEach-Object { [string]$_.Name })) -join ', ' } else { 'kein Dock/USB-C-Gerät angeschlossen' })
if ($dF.Count) { Punkt 'Dock-Geräte mit Fehler' 'fehler' ((@($dF | Select-Object -First 4 | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })) -join ', ') }
$tbC = @($pnp | Where-Object { [string]$_.Name -match '(?i)Thunderbolt.*(Controller|Router)|USB4.*(Router|Host)' }).Count -gt 0
$tbS = $null; foreach ($nm in @('ThunderboltService', 'TbtHostControllerService')) { $sv = Get-Service -Name $nm -EA SilentlyContinue; if ($sv) { $tbS = [string]$sv.Status; break } }
Fakt 'tbController' $tbC; Fakt 'tbDienst' $tbS
Punkt 'Thunderbolt/USB4' 'info' ($(if ($tbC) { 'Controller vorhanden' } else { 'kein Controller sichtbar' }) + $(if ($tbS) { ', Dienst ' + $tbS } else { '' }))
$uc = @($pnp | Where-Object { [string]$_.Name -match '(?i)UCSI|USB Connector Manager' -and [int]$_.ConfigManagerErrorCode -ne 0 })
$hub = @($pnp | Where-Object { [string]$_.PNPClass -eq 'USB' -and [string]$_.Name -match '(?i)Hub' -and [int]$_.ConfigManagerErrorCode -ne 0 -and [int]$_.ConfigManagerErrorCode -ne 45 })
Fakt 'ucsiFehler' $uc.Count; Fakt 'usbHubFehler' $hub.Count
Punkt 'USB-C-Steuerung / USB-Hubs' $(if ($uc.Count -or $hub.Count) { 'fehler' } else { 'ok' }) ('' + $uc.Count + ' USB-C-Fehler, ' + $hub.Count + ' USB-Hub(s) mit Fehler')
$lan = @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { [string]$_.InterfaceDescription -match '(?i)USB|Dock|Thunderbolt|DisplayLink' })
Fakt 'dockLan' $(if ($lan.Count) { [string]$lan[0].InterfaceDescription } else { $null }); Fakt 'dockLanStatus' $(if ($lan.Count) { [string]$lan[0].Status } else { $null })
if ($lan.Count) { Punkt 'Netzwerk über Dock/Adapter' $(if ([string]$lan[0].Status -eq 'Up') { 'ok' } else { 'warn' }) ([string]$lan[0].InterfaceDescription + ': ' + [string]$lan[0].Status) }
$bat = Get-CimInstance Win32_Battery -EA SilentlyContinue | Select-Object -First 1
$amNetz = $null; if ($bat) { $amNetz = @(2, 3, 6, 7, 8, 9, 11) -contains [int]$bat.BatteryStatus }
Fakt 'akku' ([bool]$bat); Fakt 'amNetz' $amNetz
if ($bat) { Punkt 'Stromversorgung' $(if ($dockDa -and -not $amNetz) { 'warn' } else { 'info' }) $(if ($amNetz) { 'am Netz (' + [int]$bat.EstimatedChargeRemaining + ' %)' } else { 'Akkubetrieb (' + [int]$bat.EstimatedChargeRemaining + ' %)' }) }
$nw = @(EvHw @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Kernel-Power'; Id = 105; StartTime = (Get-Date).AddDays(-7) } 500).Count
Fakt 'netzwechsel7' $nw
Punkt 'Wechsel Netz/Akku (7 Tage)' $(if ($nw -ge 30) { 'warn' } else { 'ok' }) ('' + $nw + '× – sehr häufig = Dock/Kabel trennt kurz')
$dl = Get-Service -Name DisplayLinkManager -EA SilentlyContinue
Fakt 'displayLinkDienst' $(if ($dl) { [string]$dl.Status } else { $null })
if ($dl) { Punkt 'DisplayLink-Dienst' $(if ([string]$dl.Status -eq 'Running') { 'ok' } else { 'fehler' }) ([string]$dl.Status) }
`,
  },
]

export const THEMEN_HARDWARE: DgOber[] = [
  {
    id: 'hardware', titel: 'Hardware: USB, Maus, Tastatur & Akku', symbol: 'Usb', beschreibung: 'USB-Gerät geht nicht, Maus/Tastatur/Touchpad spinnt, Bluetooth, Akku lädt nicht, Standby, Dockingstation',
    unter: [
      {
        id: 'hw-usb', titel: 'USB-Gerät wird nicht erkannt oder geht nicht', beschreibung: 'Meldung „USB-Gerät wurde nicht erkannt“, Stick/Scanner/Headset tut nichts, gelbes Ausrufezeichen im Geräte-Manager',
        sonden: ['hwgeraet'],
        fragen: [{ id: 'trennt', text: 'Verbindet und trennt sich das Gerät immer wieder (Windows spielt ständig den USB-Ton)?' }],
        regeln: [
          { id: 'code43', wenn: f => num(f['hwgeraet.code43']) > 0, befund: f => `Gerät meldet „nicht erkannt“ (Code 43): ${txt(f['hwgeraet.code43Geraete'])}`, problem: 'hardware-usb-nicht-erkannt', schwere: 3 },
          { id: 'code28', wenn: f => num(f['hwgeraet.code28']) > 0, befund: f => `Treiber fehlt (Code 28): ${txt(f['hwgeraet.code28Geraete'])}`, problem: 'hardware-gelbes-ausrufezeichen', schwere: 3 },
          { id: 'code10', wenn: f => num(f['hwgeraet.code10']) > 0, befund: f => `Gerät kann nicht gestartet werden (Code 10): ${txt(f['hwgeraet.code10Geraete'])}`, problem: 'hardware-code-10-startet-nicht', schwere: 3 },
          { id: 'code39', wenn: f => num(f['hwgeraet.code39']) > 0, befund: f => `Treiber kann nicht geladen werden (Code 19/39): ${txt(f['hwgeraet.code39Geraete'])}`, problem: 'hardware-code-19-39-filter', schwere: 3 },
          { id: 'code22', wenn: f => num(f['hwgeraet.code22']) > 0, befund: f => `Gerät ist deaktiviert (Code 22): ${txt(f['hwgeraet.code22Geraete'])}`, problem: 'hardware-geraet-deaktiviert-code22', schwere: 2 },
          { id: 'code31', wenn: f => num(f['hwgeraet.code31']) > 0, befund: f => `Windows kann den Treiber nicht laden (Code 31): ${txt(f['hwgeraet.code31Geraete'])}`, problem: 'hardware-code-31-treiber-laden', schwere: 2 },
          { id: 'code52', wenn: f => num(f['hwgeraet.code52']) > 0, befund: f => `Treibersignatur ungültig (Code 52): ${txt(f['hwgeraet.code52Geraete'])}`, problem: 'hardware-treiber-signatur-code52', schwere: 2 },
          { id: 'usb-schlaf', wenn: f => f['frage.trennt'] === 'ja' && num(f['hwgeraet.usbSuspendAc']) === 1, befund: () => 'Gerät trennt sich ständig und USB-Energiesparen (selektives Anhalten) ist an', problem: 'hardware-usb-ton-staendig', schwere: 2 },
        ],
        ohneBefund: ['hardware-usb-stick', 'hardware-usb-nicht-erkannt', 'hardware-erst-nach-neustart-erkannt', 'hardware-usb-alle-anschluesse-tot'],
      },
      {
        id: 'hw-maus', titel: 'Maus oder Touchpad spinnt', beschreibung: 'Touchpad reagiert nicht, Maustasten vertauscht, Zeiger zieht eine Spur, Doppelklick klappt nicht, Maus fällt kurz aus',
        sonden: ['hweingabe', 'hwgeraet'],
        regeln: [
          { id: 'touchpad-aus', wenn: f => nein(f['hweingabe.touchpadAn']), befund: () => 'Touchpad ist in den Windows-Einstellungen ausgeschaltet', problem: 'hardware-touchpad-in-einstellungen-aus', schwere: 3 },
          { id: 'tasten', wenn: f => ja(f['hweingabe.tastenVertauscht']), befund: () => 'Linke und rechte Maustaste sind vertauscht', problem: 'hardware-maustasten-vertauscht', schwere: 3 },
          { id: 'filter', wenn: f => liste(f['hwgeraet.verwaistMaus']).length > 0 || num(f['hwgeraet.mausFehler']) > 0, befund: f => (liste(f['hwgeraet.verwaistMaus']).length > 0 ? `Verwaister Maus-Filtertreiber: ${txt(f['hwgeraet.verwaistMaus'])}` : `${f['hwgeraet.mausFehler']} Maus-Gerät(e) mit Fehler im Geräte-Manager`), problem: 'hardware-maus-code-39-nach-deinstallation', schwere: 3 },
          { id: 'klickeinrasten', wenn: f => ja(f['hweingabe.klickEinrasten']), befund: () => 'KlickEinrasten ist eingeschaltet – die Maus „hält“ den Klick fest', problem: 'hardware-maus-klickeinrasten', schwere: 3 },
          { id: 'mausspur', wenn: f => ja(f['hweingabe.mausspur']), befund: () => 'Mausspur ist eingeschaltet', problem: 'hardware-mausspur', schwere: 2 },
          { id: 'tippen', wenn: f => ja(f['hweingabe.tippenAus']), befund: () => 'Touchpad: „Antippen zum Klicken“ ist ausgeschaltet', problem: 'hardware-touchpad-tippen-klickt-nicht', schwere: 2 },
          { id: 'doppelklick', wenn: f => num(f['hweingabe.doppelklickMs']) > 0 && num(f['hweingabe.doppelklickMs']) <= 250, befund: f => `Doppelklick-Geschwindigkeit sehr schnell eingestellt (${f['hweingabe.doppelklickMs']} ms)`, problem: 'hardware-doppelklick-geht-nicht', schwere: 2 },
          { id: 'tempo', wenn: f => num(f['hweingabe.mausTempo']) <= 3 || num(f['hweingabe.mausTempo']) >= 19, befund: f => `Zeigergeschwindigkeit extrem eingestellt (${f['hweingabe.mausTempo']} von 20)`, problem: 'hardware-mauszeiger-zu-langsam', schwere: 1 },
        ],
        ohneBefund: ['hardware-maus-tastatur-faellt-aus', 'hardware-touchpad', 'hardware-funkmaus-ruckelt', 'hardware-zeiger-wandert'],
      },
      {
        id: 'hw-tastatur', titel: 'Tastatur schreibt falsch oder gar nicht', beschreibung: 'Tasten reagieren verzögert oder bleiben „hängen“, Ziffernblock bewegt die Maus, falsche Zeichen (Y/Z), PC piept',
        sonden: ['hweingabe', 'hwgeraet'],
        fragen: [{ id: 'zeichen', text: 'Schreibt die Tastatur falsche Zeichen (z. B. Y und Z vertauscht, Sonderzeichen an falscher Stelle)?' }],
        regeln: [
          { id: 'filter', wenn: f => liste(f['hwgeraet.verwaistTastatur']).length > 0, befund: f => `Verwaister Tastatur-Filtertreiber: ${txt(f['hwgeraet.verwaistTastatur'])} – Tastatur bleibt tot`, problem: 'hardware-tastatur-code-39-nach-deinstallation', schwere: 3 },
          { id: 'einrast', wenn: f => ja(f['hweingabe.einrastAn']), befund: () => 'Einrastfunktion ist an – Umschalt/Strg/Alt bleiben „hängen“', problem: 'hardware-einrastfunktion', schwere: 3 },
          { id: 'anschlag', wenn: f => ja(f['hweingabe.anschlagAn']), befund: () => 'Anschlagverzögerung ist an – kurze Tastendrücke werden ignoriert', problem: 'hardware-tastatur-verzoegert', schwere: 3 },
          { id: 'tastaturmaus', wenn: f => ja(f['hweingabe.tastaturmausAn']), befund: () => 'Tastaturmaus ist an – der Ziffernblock bewegt den Mauszeiger', problem: 'hardware-ziffernblock-bewegt-maus', schwere: 3 },
          { id: 'layout', wenn: f => f['frage.zeichen'] === 'ja' && (liste(f['hweingabe.layouts']).length > 1 || (txt(f['hweingabe.layout1']) !== '' && !/(0407|0807|0c07)$/i.test(txt(f['hweingabe.layout1'])))), befund: f => `Tastaturlayouts: ${txt(f['hweingabe.layouts'])} – mit Alt+Umschalt wird versehentlich umgeschaltet`, problem: 'windows-tastatur-falsches-layout', schwere: 2 },
          { id: 'geraetefehler', wenn: f => num(f['hwgeraet.kbdFehler']) > 0, befund: f => `${f['hwgeraet.kbdFehler']} Tastatur-Gerät(e) mit Fehler im Geräte-Manager`, problem: 'hardware-laptop-tastatur-tot', schwere: 2 },
          { id: 'piept', wenn: f => ja(f['hweingabe.umschalttonAn']), befund: () => 'Umschalttöne sind an – PC piept bei Feststell-/NumLock-Taste', problem: 'hardware-tastatur-piept', schwere: 2 },
          { id: 'numlock', wenn: f => nein(f['hweingabe.numlockAnmeldung']), befund: () => 'NumLock ist am Anmeldebildschirm aus (PIN über den Ziffernblock geht nicht)', problem: 'hardware-numlock-anmeldebildschirm', schwere: 1 },
        ],
        ohneBefund: ['hardware-tastatur-verzoegert', 'hardware-tastatur-nach-anmeldung-tot', 'hardware-laptop-tastatur-tot', 'windows-tastatur-falsches-layout'],
      },
      {
        id: 'hw-bluetooth', titel: 'Bluetooth geht nicht', beschreibung: 'Bluetooth-Schalter fehlt oder ist ausgegraut, Maus/Headset koppelt nicht oder trennt sich ständig',
        sonden: ['hwbt'],
        fragen: [{ id: 'koppeln', text: 'Lässt sich das Gerät gar nicht erst koppeln?' }, { id: 'trennt', text: 'Ist das Gerät gekoppelt, trennt sich aber immer wieder?' }],
        regeln: [
          { id: 'kein-adapter', wenn: f => nein(f['hwbt.adapterVorhanden']), befund: () => 'Es ist kein Bluetooth-Adapter vorhanden bzw. sichtbar', problem: 'hardware-bluetooth-fehlt', schwere: 3 },
          { id: 'deaktiviert', wenn: f => num(f['hwbt.adapterCode']) === 22, befund: f => `Bluetooth-Adapter ist im Geräte-Manager deaktiviert (${txt(f['hwbt.adapterName'])})`, problem: 'hardware-geraet-deaktiviert-code22', schwere: 3 },
          { id: 'adapter-fehler', wenn: f => num(f['hwbt.adapterCode']) > 0 && num(f['hwbt.adapterCode']) !== 22, befund: f => `Bluetooth-Adapter meldet Fehler Code ${f['hwbt.adapterCode']} (${txt(f['hwbt.adapterName'])})`, problem: 'hardware-bt-adapter-fehler-code', schwere: 3 },
          { id: 'flugmodus', wenn: f => ja(f['hwbt.flugmodus']), befund: () => 'Flugzeugmodus ist eingeschaltet – Bluetooth ist abgeschaltet', problem: 'wlan-flugzeugmodus', schwere: 3 },
          { id: 'dienst', wenn: f => f['hwbt.dienst'] != null && txt(f['hwbt.dienst']) !== '' && txt(f['hwbt.dienst']) !== 'Running', befund: f => `Bluetooth-Unterstützungsdienst läuft nicht (${txt(f['hwbt.dienst'])}, Start: ${txt(f['hwbt.dienstStart'])})`, problem: 'hardware-bluetooth-fehlt', schwere: 2 },
          { id: 'ohne-treiber', wenn: f => num(f['hwbt.ohneTreiber']) > 0, befund: f => `${f['hwbt.ohneTreiber']}× „Bluetooth-Peripheriegerät“ ohne Treiber`, problem: 'hardware-bt-peripheriegeraet-ohne-treiber', schwere: 2 },
          { id: 'trennt', wenn: f => f['frage.trennt'] === 'ja' && ja(f['hwbt.energiesparenAn']), befund: () => 'Gerät trennt sich und der Bluetooth-Adapter darf zum Energiesparen abgeschaltet werden', problem: 'hardware-bluetooth-trennt', schwere: 2 },
          { id: 'koppeln', wenn: f => f['frage.koppeln'] === 'ja' && ja(f['hwbt.adapterVorhanden']), befund: f => `Adapter in Ordnung (${txt(f['hwbt.adapterName'])}), Kopplung scheitert trotzdem – alte Kopplung entfernen und neu koppeln`, problem: 'hardware-bluetooth-koppelt-nicht', schwere: 1 },
        ],
        ohneBefund: ['hardware-bluetooth-koppelt-nicht', 'hardware-bluetooth-trennt', 'hardware-bt-ersatzgeraet-koppelt-nicht'],
      },
      {
        id: 'ak-akku', titel: 'Akku lädt nicht oder hält nicht lange', beschreibung: '„Angeschlossen, wird nicht geladen“, Akku ist nach kurzer Zeit leer, lädt nur bis 80 %, Ladesymbol springt',
        sonden: ['akbat', 'akenergie'],
        regeln: [
          { id: 'kein-akku', wenn: f => ja(f['akbat.laptop']) && nein(f['akbat.vorhanden']), befund: () => 'Laptop, aber Windows erkennt keinen Akku', problem: 'akku-nicht-erkannt', schwere: 3 },
          { id: 'verschlissen', wenn: f => num(f['akbat.kapazitaetProzent']) < 50, befund: f => `Akku hat nur noch ${f['akbat.kapazitaetProzent']} % seiner ursprünglichen Kapazität${num(f['akbat.zyklen']) > 0 ? ` (${f['akbat.zyklen']} Ladezyklen)` : ''}`, problem: 'akku-haelt-nicht', schwere: 3 },
          { id: 'laedt-nicht', wenn: f => ja(f['akbat.amNetz']) && nein(f['akbat.laedt']) && num(f['akbat.prozent']) < 90 && !ja(f['akbat.ladegrenzeAktiv']), befund: f => `Netzteil erkannt, aber der Akku lädt nicht (${f['akbat.prozent']} %)`, problem: 'akku-laedt-nicht', schwere: 3 },
          { id: 'ladegrenze', wenn: f => ja(f['akbat.ladegrenzeAktiv']) && num(f['akbat.prozent']) <= 85, befund: f => `Ladegrenze im BIOS aktiv (${txt(f['akbat.ladegrenze'])}) – lädt absichtlich nur bis ca. 80 %`, problem: 'akku-nur-bis-80', schwere: 3 },
          { id: 'geschwaecht', wenn: f => (num(f['akbat.kapazitaetProzent']) >= 50 && num(f['akbat.kapazitaetProzent']) < 70) || num(f['akbat.zyklen']) >= 800, befund: f => `Akku geschwächt: ${f['akbat.kapazitaetProzent'] ?? '?'} % Restkapazität${num(f['akbat.zyklen']) > 0 ? `, ${f['akbat.zyklen']} Ladezyklen` : ''}`, problem: 'akku-haelt-nicht', schwere: 2 },
          { id: 'flackert', wenn: f => num(f['akbat.netzwechsel7']) >= 30, befund: f => `Wechsel zwischen Netz und Akku ${f['akbat.netzwechsel7']}× in 7 Tagen – Kabel, Buchse oder Netzteil wackelt`, problem: 'akku-ladesymbol-flackert', schwere: 2 },
          { id: 'warnung-frueh', wenn: f => num(f['akenergie.akkuWarnungProzent']) >= 40, befund: f => `Akkuwarnung ist auf ${f['akenergie.akkuWarnungProzent']} % eingestellt`, problem: 'akku-warnung-zu-frueh', schwere: 2 },
          { id: 'kritisch-aus', wenn: f => num(f['akenergie.kritischAktion']) === 3, befund: () => 'Bei kritischem Akkustand fährt der Laptop herunter statt in den Ruhezustand', problem: 'akku-kritisch-herunterfahren-statt-ruhezustand', schwere: 1 },
        ],
        ohneBefund: ['akku-haelt-nicht', 'akku-laedt-nicht', 'akku-hp-meldung-ersetzen', 'akku-langsames-ladegeraet'],
      },
      {
        id: 'ak-energie', titel: 'Standby, Ruhezustand und Energiesparen', beschreibung: 'PC geht nicht in den Standby oder wacht von selbst auf, Bildschirm geht zu schnell aus, Zuklappen fährt herunter, Ruhezustand fehlt',
        sonden: ['akenergie'],
        regeln: [
          { id: 'anforderung', wenn: f => liste(f['akenergie.anforderungen']).length > 0, befund: f => `Standby wird gerade verhindert durch: ${txt(f['akenergie.anforderungen'])}`, problem: 'akku-kein-standby', schwere: 3 },
          { id: 'netz-weckt', wenn: f => ja(f['akenergie.netzWecker']) && num(f['akenergie.aufwachen7']) >= 3, befund: f => `Netzwerkkarte darf den PC wecken – ${f['akenergie.aufwachen7']}× aufgewacht in 7 Tagen${liste(f['akenergie.weckQuellen']).length ? ' (' + txt(f['akenergie.weckQuellen']) + ')' : ''}`, problem: 'akku-wacht-sofort-wieder-auf', schwere: 3 },
          { id: 'zuklappen-aus', wenn: f => num(f['akenergie.deckelAc']) === 3 || num(f['akenergie.deckelDc']) === 3, befund: () => 'Beim Zuklappen ist „Herunterfahren“ eingestellt', problem: 'akku-zuklappen-faehrt-herunter', schwere: 3 },
          { id: 'wacht-oft', wenn: f => num(f['akenergie.aufwachen7']) >= 10, befund: f => `PC ist in 7 Tagen ${f['akenergie.aufwachen7']}× aufgewacht${liste(f['akenergie.weckQuellen']).length ? ' – geweckt durch ' + txt(f['akenergie.weckQuellen']) : ''}`, problem: 'akku-standby-wacht-auf', schwere: 2 },
          { id: 'bildschirm', wenn: f => num(f['akenergie.bildAusAcSek']) > 0 && num(f['akenergie.bildAusAcSek']) <= 60, befund: f => `Bildschirm geht am Netz schon nach ${f['akenergie.bildAusAcSek']} s aus`, problem: 'akku-bildschirm-zu-schnell-aus', schwere: 2 },
          { id: 'sparmodus', wenn: f => ja(f['akenergie.sparplan']) || ja(f['akenergie.overlayEffizienz']), befund: f => `Energieplan „${txt(f['akenergie.energieplan'])}“${ja(f['akenergie.overlayEffizienz']) ? ' mit Energiemodus „Beste Energieeffizienz“' : ''} bremst den PC`, problem: 'akku-energiemodus-langsam', schwere: 2 },
          { id: 'kein-ruhezustand', wenn: f => nein(f['akenergie.ruhezustandVerfuegbar']), befund: () => 'Ruhezustand ist auf diesem PC nicht verfügbar (abgeschaltet)', problem: 'akku-ruhezustand-fehlt', schwere: 1 },
          { id: 'gesperrt', wenn: f => ja(f['akenergie.gesperrt']), befund: () => 'Energieeinstellungen werden per Richtlinie vorgegeben', problem: 'akku-energieoptionen-gesperrt', schwere: 1 },
        ],
        ohneBefund: ['akku-kein-standby', 'akku-standby-wacht-auf', 'akku-wacht-nicht-auf', 'akku-wochenende-leer-ruhezustand'],
      },
      {
        id: 'hw-dock', titel: 'Dockingstation, Thunderbolt oder USB-C geht nicht', beschreibung: 'Am Dock gehen Monitore, USB oder Netzwerk nicht, Laptop lädt am Dock nicht, alles trennt sich alle paar Minuten',
        sonden: ['hwdock'],
        fragen: [{ id: 'amDock', text: 'Hängt der Laptop gerade an der Dockingstation?' }],
        regeln: [
          { id: 'dock-fehler', wenn: f => liste(f['hwdock.dockFehler']).length > 0, befund: f => `Dock-Geräte mit Fehler: ${txt(f['hwdock.dockFehler'])}`, problem: 'hardware-dock-nicht-erkannt', schwere: 3 },
          { id: 'nicht-erkannt', wenn: f => f['frage.amDock'] === 'ja' && nein(f['hwdock.dockErkannt']), befund: () => 'Laptop hängt laut Anwender am Dock, Windows sieht aber kein Dock', problem: 'hardware-dock-nicht-erkannt', schwere: 3 },
          { id: 'usb-c', wenn: f => num(f['hwdock.ucsiFehler']) > 0, befund: f => `USB-C-Steuerung (UCSI) meldet ${f['hwdock.ucsiFehler']} Fehler`, problem: 'hardware-usb-c-anschluss-tot', schwere: 3 },
          { id: 'hub', wenn: f => num(f['hwdock.usbHubFehler']) > 0, befund: f => `${f['hwdock.usbHubFehler']} USB-Hub(s) mit Fehler – USB am Dock tot`, problem: 'hardware-dock-usb-tot', schwere: 2 },
          { id: 'lan', wenn: f => f['hwdock.dockLanStatus'] != null && txt(f['hwdock.dockLanStatus']) !== '' && txt(f['hwdock.dockLanStatus']) !== 'Up', befund: f => `Netzwerk am Dock ist ${txt(f['hwdock.dockLanStatus'])} (${txt(f['hwdock.dockLan'])})`, problem: 'hardware-dock-lan', schwere: 2 },
          { id: 'trennt', wenn: f => num(f['hwdock.netzwechsel7']) >= 30, befund: f => `Stromquelle wechselte in 7 Tagen ${f['hwdock.netzwechsel7']}× – das Dock trennt sich immer wieder kurz`, problem: 'hardware-dock-trennt-staendig', schwere: 2 },
          { id: 'laedt-nicht', wenn: f => ja(f['hwdock.dockErkannt']) && ja(f['hwdock.akku']) && nein(f['hwdock.amNetz']), befund: () => 'Dock ist verbunden, der Laptop läuft aber auf Akku', problem: 'hardware-dock-laedt-nicht', schwere: 2 },
          { id: 'tb-dienst', wenn: f => f['hwdock.tbDienst'] != null && txt(f['hwdock.tbDienst']) !== '' && txt(f['hwdock.tbDienst']) !== 'Running', befund: f => `Thunderbolt-Dienst läuft nicht (${txt(f['hwdock.tbDienst'])})`, problem: 'hardware-thunderbolt-controller-fehlt', schwere: 1 },
        ],
        ohneBefund: ['hardware-dock-nicht-erkannt', 'hardware-dock-usb-tot', 'hardware-desksharing-dock', 'hardware-dock-trennt-staendig'],
      },
    ],
  },
]
