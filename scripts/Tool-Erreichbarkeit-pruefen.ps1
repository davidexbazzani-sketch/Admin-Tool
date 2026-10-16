# ── Prüft GENAU das, was das Tool prüft — aber außerhalb des Tools ──────────
# Aufruf:  powershell -ExecutionPolicy Bypass -File .\Tool-Erreichbarkeit-pruefen.ps1 -Ziel DE5CG3485QN8
#
# Hintergrund: das Tool pingt NICHT mit ping.exe, sondern über .NET, und prüft
# zusätzlich TCP 445/135 sowie WinRM. Wenn ping.exe in der Eingabeaufforderung
# funktioniert, das Tool aber „offline" meldet, liegt der Unterschied genau hier.
param([string]$Ziel = $env:COMPUTERNAME)

$ErrorActionPreference = 'SilentlyContinue'
Write-Output "Ziel: $Ziel"
Write-Output ("Angemeldet als: {0}\{1}" -f $env:USERDOMAIN, $env:USERNAME)
Write-Output ''

# 1) ping.exe — das, was in der Eingabeaufforderung klappt
$pe = (ping.exe -n 1 -w 1500 $Ziel | Out-String)
Write-Output ("1) ping.exe                : " + $(if ($pe -match 'TTL=|Antwort von|Reply from') { 'OK' } else { 'KEINE ANTWORT' }))

# 2) .NET-Ping — das, was das Tool benutzt
$net = 'FEHLER'
try { $net = ((New-Object System.Net.NetworkInformation.Ping).Send($Ziel, 1500)).Status } catch { $net = 'Ausnahme: ' + $_.Exception.Message }
Write-Output ("2) .NET-Ping (Tool-Weg)    : " + $net)

# 3) TCP 445 / 135 — die Rückfallebenen des Tools
foreach ($port in 445, 135) {
  $t = New-Object System.Net.Sockets.TcpClient
  $ok = $false
  try { $ok = $t.ConnectAsync($Ziel, $port).Wait(2000) } catch { }
  try { $t.Close() } catch { }
  Write-Output ("3) TCP $port                : " + $(if ($ok) { 'offen' } else { 'zu / keine Antwort' }))
}

# 4) WinRM — dafür braucht das Tool die Fernzugriffe
$wsman = 'FEHLER'
try { Test-WSMan -ComputerName $Ziel -EA Stop | Out-Null; $wsman = 'OK' } catch { $wsman = 'nicht erreichbar: ' + $_.Exception.Message }
Write-Output ("4) WinRM (Test-WSMan)      : " + $wsman)

# 5) Läuft PowerShell überhaupt als Unterprozess? (Virenschutz/Richtlinie)
$unter = 'FEHLER'
try {
  $p = Start-Process powershell -ArgumentList '-NoProfile','-NonInteractive','-Command','exit 7' -Wait -PassThru -WindowStyle Hidden
  $unter = 'Exitcode ' + $p.ExitCode + $(if ($p.ExitCode -eq 7) { ' (OK)' } else { ' (UNERWARTET)' })
} catch { $unter = 'Ausnahme: ' + $_.Exception.Message }
Write-Output ("5) PowerShell als Unterproz: " + $unter)

# 6) Wie viele powershell.exe laufen gerade? (Tool-Stau erkennen)
$anz = @(Get-Process powershell -EA SilentlyContinue).Count
Write-Output ("6) laufende powershell.exe : " + $anz)
Write-Output ''
Write-Output 'Deutung:'
Write-Output '  1 OK + 2 FEHLER        -> ICMP ist nur für ping.exe erlaubt; das Tool fällt auf TCP zurück'
Write-Output '  1+2 OK, 3 beide zu     -> Firewall auf den Zielen geändert'
Write-Output '  4 nicht erreichbar     -> WinRM-Problem (GPO/Dienst), nicht das Tool'
Write-Output '  5 UNERWARTET/Ausnahme  -> Virenschutz/Richtlinie blockiert PowerShell-Starts'
Write-Output '  6 dauerhaft 8 und mehr -> Stau in der Warteschlange des Tools'
