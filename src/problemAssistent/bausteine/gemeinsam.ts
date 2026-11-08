// ── Problem-Assistent: gemeinsame PowerShell-Bruchstücke für alle Baustein-Dateien ──
// (eigene Datei — aktionen.ts und bausteine/*.ts importieren von hier, kein Ring-Import)

export const OFFICE_C2R = String.raw`
$c2r = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' -EA SilentlyContinue
$exe = Join-Path $env:CommonProgramFiles 'Microsoft Shared\ClickToRun\OfficeClickToRun.exe'
if (-not (Test-Path -LiteralPath $exe)) { $exe = 'C:\Program Files\Common Files\Microsoft Shared\ClickToRun\OfficeClickToRun.exe' }
if (-not $c2r -or -not (Test-Path -LiteralPath $exe)) { throw 'Microsoft 365 (Klick-und-Los) ist auf diesem PC nicht installiert.' }
$plat = [string]$c2r.Platform; if (-not $plat) { $plat = 'x64' }
$kult = [string]$c2r.ClientCulture; if (-not $kult) { $kult = 'de-de' }
`
export const DRUCKER_PS = String.raw`
function DruckerListe { try { @(Get-Printer -EA Stop | ForEach-Object { [pscustomobject]@{ Name = [string]$_.Name; Port = [string]$_.PortName; Treiber = [string]$_.DriverName; Status = [string]$_.PrinterStatus; Typ = [string]$_.Type } }) } catch { @(Get-WmiObject Win32_Printer -EA SilentlyContinue | ForEach-Object { [pscustomobject]@{ Name = [string]$_.Name; Port = [string]$_.PortName; Treiber = [string]$_.DriverName; Status = $(if ($_.WorkOffline) { 'Offline' } else { [string]$_.PrinterStatus }); Typ = $(if ($_.Network) { 'Verbindung' } else { 'Lokal' }) } }) } }
function DruckerSuche([string]$n) { $t = $n.Trim(); $l = DruckerListe; $x = @($l | Where-Object { $_.Name -ieq $t }); if (-not $x.Count) { $x = @($l | Where-Object { $_.Name -like ('*' + $t + '*') }) }; $x }
function SealApw { foreach ($p in 'C:\Program Files\SEAL Systems\SEAL Add Printer Wizard\sealapw.exe', 'C:\Program Files (x86)\SEAL Systems\SEAL Add Printer Wizard\sealapw.exe') { if (Test-Path -LiteralPath $p) { return $p } }; return $null }
`
export const OFFICE_APPS = `'OUTLOOK','WINWORD','EXCEL','POWERPNT','ONENOTE','MSACCESS','MSPUB','lync'`
