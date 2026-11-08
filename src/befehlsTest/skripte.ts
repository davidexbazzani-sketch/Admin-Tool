// ── Befehls-Test: PowerShell für Vorbereitung, Aufräumen, Laufzeitwerte, Neustart ──
// Alles läuft auf dem TEST-PC (per WinRM) — nie auf Servern (Schranke in store.ts).

export const BT_TAG = '@@BT@@'

/** Kurzinfo: Rechnerart (1 = Arbeitsplatz), Benutzer, gesperrt, Startzeit. Liest nur. */
export const PS_PCINFO = String.raw`
$o = [ordered]@{ ok = $true }
try { $os = Get-CimInstance Win32_OperatingSystem -EA Stop; $o.produktTyp = [int]$os.ProductType; $o.boot = $os.LastBootUpTime.ToUniversalTime().ToString('o'); $o.system = [string]$os.Caption } catch {}
try { $o.benutzer = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}
$o.gesperrt = [bool](Get-Process -Name LogonUI -EA SilentlyContinue)
$o.rechner = [string]$env:COMPUTERNAME
'@@BT@@' + ($o | ConvertTo-Json -Compress)
`

/** Werte, die erst zur Laufzeit feststehen (liest nur). */
export const PS_WERTE = String.raw`
$o = [ordered]@{ ok = $true }
$o.jetzt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
try { $o.zeitzone = (Get-TimeZone).Id } catch {}
$u = $null; try { $u = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}
try { foreach ($l in @(quser 2>$null | Select-Object -Skip 1)) { if ([string]$l -match '\s(\d+)\s+(Aktiv|Active)\b') { $o.sitzung = $Matches[1]; break } } } catch {}
try { if ($u) { $np = Get-Process -Name notepad -IncludeUserName -EA SilentlyContinue | Where-Object { $_.UserName -ieq $u } | Select-Object -First 1; if ($np) { $o.pidNotepad = [string]$np.Id } } } catch {}
try { $o.adapter = [string](Get-NetAdapter -Physical -EA Stop | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1).Name } catch {}
try { $o.gruppeBenutzer = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-545')).Translate([System.Security.Principal.NTAccount]).Value.Split('\')[-1] } catch {}
'@@BT@@' + ($o | ConvertTo-Json -Compress)
`

/** Testobjekte anlegen + Einstellungen sichern, die Befehle im Test verändern. */
export const PS_VORBEREITUNG = String.raw`
$z = New-Object System.Collections.Generic.List[string]
function Z([string]$t) { [void]$z.Add($t) }
function W([string]$pfad, [string]$name) { try { return (Get-ItemProperty -LiteralPath $pfad -Name $name -EA Stop).$name } catch { return $null } }
$d = 'C:\ITAdminToolTest'
try {
  if (-not (Test-Path -LiteralPath $d)) { New-Item -Path $d -ItemType Directory | Out-Null }
  foreach ($n in 'test.txt', 'umbenennen.txt', 'verschieben.txt', 'loeschen.txt', 'ITAdminTool-Testlauf.txt') { Set-Content -LiteralPath (Join-Path $d $n) -Value 'Testdatei IT Admin Tool' -Encoding UTF8 }
  Set-Content -LiteralPath (Join-Path $d 'test.cmd') -Value '@echo Testlauf IT Admin Tool' -Encoding ASCII
  Set-Content -LiteralPath (Join-Path $d 'test.ps1') -Value "'Testlauf IT Admin Tool'" -Encoding UTF8
  if (-not (Test-Path -LiteralPath 'C:\Temp')) { New-Item -Path 'C:\Temp' -ItemType Directory | Out-Null }
  Z 'Testordner C:\ITAdminToolTest mit Testdateien angelegt'
} catch { Z ('Testordner: ' + $_.Exception.Message) }
try {
  if (-not (Get-ScheduledTask -TaskName 'ITAdminToolTest' -EA SilentlyContinue)) {
    $a = New-ScheduledTaskAction -Execute 'C:\Windows\System32\whoami.exe'
    $t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddYears(5)
    $pr = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount
    Register-ScheduledTask -TaskName 'ITAdminToolTest' -Action $a -Trigger $t -Principal $pr | Out-Null
  }
  Z 'Testaufgabe ITAdminToolTest angelegt'
} catch { Z ('Testaufgabe: ' + $_.Exception.Message) }
try {
  $wl = @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.PhysicalMediaType -match '802\.11' -or $_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN' })
  if ($wl.Count -and (Get-Service WlanSvc -EA SilentlyContinue).Status -eq 'Running') {
    foreach ($n in 'ITAdminToolTest', 'ITAdminToolTest2') {
      $key = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
      $hex = -join ([Text.Encoding]::UTF8.GetBytes($n) | ForEach-Object { $_.ToString('X2') })
      $xml = '<?xml version="1.0"?><WLANProfile xmlns="http://www.microsoft.com/networking/WLAN/profile/v1"><name>' + $n + '</name><SSIDConfig><SSID><hex>' + $hex + '</hex><name>' + $n + '</name></SSID></SSIDConfig><connectionType>ESS</connectionType><connectionMode>manual</connectionMode><MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption><useOneX>false</useOneX></authEncryption><sharedKey><keyType>passPhrase</keyType><protected>false</protected><keyMaterial>' + $key + '</keyMaterial></sharedKey></security></MSM></WLANProfile>'
      $f = Join-Path $d ($n + '.xml')
      Set-Content -LiteralPath $f -Value $xml -Encoding UTF8
      $null = netsh wlan add profile filename="$f" user=all 2>&1
      Remove-Item -LiteralPath $f -Force -EA SilentlyContinue
    }
    Z 'WLAN-Testprofile angelegt (verbinden sich nie von selbst)'
  } else { Z 'Kein aktiver WLAN-Adapter – WLAN-Testprofile entfallen' }
} catch { Z ('WLAN-Testprofile: ' + $_.Exception.Message) }

# ── Sicherung der Einstellungen, die Befehle im Test verändern ──
$s = [ordered]@{}
$u = $null; try { $u = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}
$sid = $null; if ($u) { try { $sid = (New-Object System.Security.Principal.NTAccount($u)).Translate([System.Security.Principal.SecurityIdentifier]).Value } catch {} }
$hk = $null; if ($sid -and (Test-Path ('Registry::HKEY_USERS\' + $sid))) { $hk = 'Registry::HKEY_USERS\' + $sid }
$s.sid = $sid
$hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
try { $s.hostsB64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($hosts)) } catch {}
$s.rdpDeny = W 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections'
try { $s.rdpRegeln = @(Get-NetFirewallRule -Group '@FirewallAPI.dll,-28752' -EA Stop | ForEach-Object { @{ n = [string]$_.Name; e = [string]$_.Enabled } }) } catch { $s.rdpRegeln = @() }
$tp = 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Parameters'
$s.ntp = @{ Type = (W $tp 'Type'); NtpServer = (W $tp 'NtpServer') }
$up = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'
$s.uac = @{ EnableLUA = (W $up 'EnableLUA'); ConsentPromptBehaviorAdmin = (W $up 'ConsentPromptBehaviorAdmin'); PromptOnSecureDesktop = (W $up 'PromptOnSecureDesktop') }
try { $s.zeitzone = (Get-TimeZone).Id } catch {}
$s.ruhezustand = W 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' 'HibernateEnabled'
try { if ([string](powercfg /getactivescheme) -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') { $s.schema = $Matches[1] } } catch {}
function PW([string]$sub, [string]$set) {
  $q = @(powercfg /q $s.schema $sub $set 2>$null)
  $hex = @($q | ForEach-Object { if ([string]$_ -match '0x([0-9a-fA-F]{8})\s*$') { $Matches[1] } })
  if ($hex.Count -ge 2) { return @{ ac = [Convert]::ToInt64($hex[-2], 16); dc = [Convert]::ToInt64($hex[-1], 16) } }
  return $null
}
if ($s.schema) { $s.energie = @{ VIDEOIDLE = (PW 'SUB_VIDEO' 'VIDEOIDLE'); STANDBYIDLE = (PW 'SUB_SLEEP' 'STANDBYIDLE'); HIBERNATEIDLE = (PW 'SUB_SLEEP' 'HIBERNATEIDLE') } }
$s.ssPolicy = W 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop' 'ScreenSaverTimeout'
if ($hk) {
  $is = $hk + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
  $s.proxy = @{ ProxyEnable = (W $is 'ProxyEnable'); ProxyServer = (W $is 'ProxyServer'); ProxyOverride = (W $is 'ProxyOverride'); AutoConfigURL = (W $is 'AutoConfigURL') }
  $s.ssUser = W ($hk + '\Control Panel\Desktop') 'ScreenSaverTimeout'
  $s.druckerStd = W ($hk + '\Software\Microsoft\Windows NT\CurrentVersion\Windows') 'Device'
  $th = $hk + '\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
  $s.thema = @{ AppsUseLightTheme = (W $th 'AppsUseLightTheme'); SystemUsesLightTheme = (W $th 'SystemUsesLightTheme'); EnableTransparency = (W $th 'EnableTransparency') }
  $s.dpi = @{ LogPixels = (W ($hk + '\Control Panel\Desktop') 'LogPixels'); Win8DpiScaling = (W ($hk + '\Control Panel\Desktop') 'Win8DpiScaling') }
  $s.dateiendung = W ($hk + '\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced') 'HideFileExt'
  $s.lwX = W ($hk + '\Network\X') 'RemotePath'
}
Z ('Einstellungen gesichert (hosts, RDP, Proxy, Zeitserver, UAC, Zeitzone, Ruhezustand, Energie, Sperrzeit, Standarddrucker, Design, Skalierung' + $(if ($hk) { '' } else { ' – ohne Benutzereinstellungen: kein Benutzer angemeldet' }) + ')')
'@@BT@@' + (@{ ok = $true; zeilen = [string[]]$z.ToArray(); sicherung = $s } | ConvertTo-Json -Compress -Depth 6)
`

/** Testobjekte entfernen + gesicherte Einstellungen zurückstellen ($b64 = { s: Sicherung }). */
export const PS_AUFRAEUMEN = String.raw`
$in = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$s = $in.s
$z = New-Object System.Collections.Generic.List[string]
function Z([string]$t) { [void]$z.Add($t) }
function W([string]$pfad, [string]$name) { try { return (Get-ItemProperty -LiteralPath $pfad -Name $name -EA Stop).$name } catch { return $null } }
function Setze([string]$pfad, [string]$name, $wert, [string]$typ, [string]$was) {
  $cur = W $pfad $name
  if ($null -eq $wert) {
    if ($null -ne $cur) { Remove-ItemProperty -LiteralPath $pfad -Name $name -EA SilentlyContinue; Z ($was + ': zurückgestellt (Wert entfernt)') }
    return
  }
  if (('' + $cur) -eq ('' + $wert)) { return }
  if (-not (Test-Path -LiteralPath $pfad)) { New-Item -Path $pfad | Out-Null }
  Set-ItemProperty -LiteralPath $pfad -Name $name -Value $wert -Type $typ
  Z ($was + ': zurückgestellt')
}
function Versuch([string]$was, [scriptblock]$sb) { try { & $sb } catch { Z ($was + ': ' + $_.Exception.Message) } }
$d = 'C:\ITAdminToolTest'
$hk = $null; if ($s.sid -and (Test-Path ('Registry::HKEY_USERS\' + $s.sid))) { $hk = 'Registry::HKEY_USERS\' + $s.sid }

# ── Testobjekte ──
Versuch 'Testaufgaben' { foreach ($n in 'ITAdminToolTest', 'ITAdminToolTest2') { if (Get-ScheduledTask -TaskName $n -EA SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false; Z ('Aufgabe ' + $n + ' entfernt') } } }
Versuch 'Testkonto' { if (Get-LocalUser -Name 'ITAdminTest' -EA SilentlyContinue) { Remove-LocalUser -Name 'ITAdminTest'; Z 'Testkonto ITAdminTest entfernt' } }
Versuch 'Testfreigabe' { if (Get-SmbShare -Name 'ITAdminToolTest$' -EA SilentlyContinue) { Remove-SmbShare -Name 'ITAdminToolTest$' -Force; Z 'Testfreigabe entfernt' } }
Versuch 'Defender-Ausnahme' { if (@((Get-MpPreference).ExclusionPath) -contains ($d + '\Ausnahme')) { Remove-MpPreference -ExclusionPath ($d + '\Ausnahme'); Z 'Defender-Testausnahme entfernt' } }
Versuch 'Testvariable' {
  if ($null -ne [Environment]::GetEnvironmentVariable('ITADMINTOOL_TEST', 'Machine')) { [Environment]::SetEnvironmentVariable('ITADMINTOOL_TEST', $null, 'Machine'); Z 'Systemvariable ITADMINTOOL_TEST entfernt' }
  if ($hk -and ($null -ne (W ($hk + '\Environment') 'ITADMINTOOL_TEST'))) { Remove-ItemProperty -LiteralPath ($hk + '\Environment') -Name 'ITADMINTOOL_TEST'; Z 'Benutzervariable ITADMINTOOL_TEST entfernt' }
}
Versuch 'PATH' {
  $envKey = 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment'
  $k = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($envKey, $false)
  $raw = [string]$k.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); $k.Close()
  $teile = $raw -split ';'
  $rest = @($teile | Where-Object { $_.TrimEnd('\') -ine ($d + '\bin') })
  if ($rest.Count -ne $teile.Count) {
    $k = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($envKey, $true)
    try { $k.SetValue('Path', ($rest -join ';'), [Microsoft.Win32.RegistryValueKind]::ExpandString); Z 'Test-Eintrag aus PATH entfernt' } finally { $k.Close() }
  }
}
Versuch 'Registry-Testschlüssel' { if (Test-Path -LiteralPath 'HKLM:\SOFTWARE\ITAdminToolTest') { Remove-Item -LiteralPath 'HKLM:\SOFTWARE\ITAdminToolTest' -Recurse -Force; Z 'Registry-Testschlüssel entfernt' } }
Versuch 'WLAN-Testprofile' {
  # netsh meldet auch bei fehlendem Profil Exitcode 0 → vorher nachsehen, ob es das Profil gibt
  $da = @(netsh wlan show profiles 2>$null | ForEach-Object { if ([string]$_ -match ':\s*(ITAdminToolTest2?)\s*$') { $Matches[1] } })
  foreach ($n in @($da | Select-Object -Unique)) { $null = netsh wlan delete profile name="$n" 2>&1; Z ('WLAN-Testprofil ' + $n + ' entfernt') }
}
Versuch 'Testlaufwerk' { if ($hk -and -not $s.lwX -and (Test-Path -LiteralPath ($hk + '\Network\X'))) { $rp = [string](W ($hk + '\Network\X') 'RemotePath'); if ($rp -like '*w3172*') { Remove-Item -LiteralPath ($hk + '\Network\X') -Recurse -Force; Z 'Testlaufwerk X: entfernt (wirkt nach der nächsten Anmeldung)' } } }

# ── Einstellungen zurückstellen ──
Versuch 'hosts' {
  if ($s.hostsB64) {
    $h = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
    $orig = [Convert]::FromBase64String([string]$s.hostsB64)
    $cur = [byte[]]@(); try { $cur = [IO.File]::ReadAllBytes($h) } catch {}
    if ([Convert]::ToBase64String($cur) -ne [string]$s.hostsB64) { [IO.File]::WriteAllBytes($h, $orig); Z 'hosts-Datei wiederhergestellt' }
  }
}
Versuch 'RDP' {
  Setze 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server' 'fDenyTSConnections' $s.rdpDeny 'DWord' 'Remote-Desktop'
  foreach ($r in @($s.rdpRegeln)) { if (-not $r.n) { continue }; $c = Get-NetFirewallRule -Name $r.n -EA SilentlyContinue; if ($c -and ([string]$c.Enabled -ne [string]$r.e)) { Set-NetFirewallRule -Name $r.n -Enabled ([string]$r.e); Z ('Firewall-Regel ' + $r.n + ': zurückgestellt') } }
}
Versuch 'Zeitserver' {
  $tp = 'HKLM:\SYSTEM\CurrentControlSet\Services\W32Time\Parameters'
  $vor = '' + (W $tp 'Type') + '|' + (W $tp 'NtpServer')
  if ($s.ntp) { Setze $tp 'Type' $s.ntp.Type 'String' 'Zeitquelle'; Setze $tp 'NtpServer' $s.ntp.NtpServer 'String' 'Zeitserver' }
  if ($vor -ne ('' + (W $tp 'Type') + '|' + (W $tp 'NtpServer'))) { Restart-Service w32time -Force -EA SilentlyContinue; $null = w32tm /resync /nowait 2>&1 }
}
Versuch 'UAC' { if ($s.uac) { $up = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System'; foreach ($n in 'EnableLUA', 'ConsentPromptBehaviorAdmin', 'PromptOnSecureDesktop') { Setze $up $n $s.uac.$n 'DWord' ('UAC ' + $n) } } }
Versuch 'Zeitzone' { if ($s.zeitzone -and (Get-TimeZone).Id -ne $s.zeitzone) { Set-TimeZone -Id $s.zeitzone; Z ('Zeitzone zurückgestellt: ' + $s.zeitzone) } }
Versuch 'Ruhezustand' { if ($null -ne $s.ruhezustand -and ('' + (W 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' 'HibernateEnabled')) -ne ('' + $s.ruhezustand)) { $null = powercfg /hibernate $(if ([int]$s.ruhezustand -eq 1) { 'on' } else { 'off' }) 2>&1; Z 'Ruhezustand zurückgestellt' } }
Versuch 'Energie' {
  if ($s.schema) {
    $akt = ''; if ([string](powercfg /getactivescheme) -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') { $akt = $Matches[1] }
    $geaendert = $false
    if ($akt -ne $s.schema) { $null = powercfg /setactive $s.schema 2>&1; $geaendert = $true; Z 'Energiesparplan zurückgestellt' }
    $sub = @{ VIDEOIDLE = 'SUB_VIDEO'; STANDBYIDLE = 'SUB_SLEEP'; HIBERNATEIDLE = 'SUB_SLEEP' }
    foreach ($n in 'VIDEOIDLE', 'STANDBYIDLE', 'HIBERNATEIDLE') {
      $v = $s.energie.$n; if (-not $v) { continue }
      $q = @(powercfg /q $s.schema $sub[$n] $n 2>$null)
      $hex = @($q | ForEach-Object { if ([string]$_ -match '0x([0-9a-fA-F]{8})\s*$') { $Matches[1] } })
      $ac = $null; $dc = $null; if ($hex.Count -ge 2) { $ac = [Convert]::ToInt64($hex[-2], 16); $dc = [Convert]::ToInt64($hex[-1], 16) }
      if ($ac -ne [int64]$v.ac) { $null = powercfg /setacvalueindex $s.schema $sub[$n] $n ([int64]$v.ac) 2>&1; $geaendert = $true; Z ('Energie ' + $n + ' (Netz) zurückgestellt') }
      if ($dc -ne [int64]$v.dc) { $null = powercfg /setdcvalueindex $s.schema $sub[$n] $n ([int64]$v.dc) 2>&1; $geaendert = $true; Z ('Energie ' + $n + ' (Akku) zurückgestellt') }
    }
    if ($geaendert) { $null = powercfg /setactive $s.schema 2>&1 }
  }
}
Versuch 'Sperrzeit' { Setze 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Control Panel\Desktop' 'ScreenSaverTimeout' $s.ssPolicy 'String' 'Sperrzeit (Richtlinie)' }
if ($hk) {
  Versuch 'Proxy' { if ($s.proxy) { $is = $hk + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings'; Setze $is 'ProxyEnable' $s.proxy.ProxyEnable 'DWord' 'Proxy an/aus'; foreach ($n in 'ProxyServer', 'ProxyOverride', 'AutoConfigURL') { Setze $is $n $s.proxy.$n 'String' ('Proxy ' + $n) } } }
  Versuch 'Sperrzeit Benutzer' { Setze ($hk + '\Control Panel\Desktop') 'ScreenSaverTimeout' $s.ssUser 'String' 'Sperrzeit (Benutzer)' }
  Versuch 'Standarddrucker' { if ($s.druckerStd) { Setze ($hk + '\Software\Microsoft\Windows NT\CurrentVersion\Windows') 'Device' $s.druckerStd 'String' 'Standarddrucker' } }
  Versuch 'Design' { if ($s.thema) { $th = $hk + '\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'; foreach ($n in 'AppsUseLightTheme', 'SystemUsesLightTheme', 'EnableTransparency') { Setze $th $n $s.thema.$n 'DWord' ('Design ' + $n) } } }
  Versuch 'Skalierung' { if ($s.dpi) { foreach ($n in 'LogPixels', 'Win8DpiScaling') { Setze ($hk + '\Control Panel\Desktop') $n $s.dpi.$n 'DWord' ('Skalierung ' + $n) } } }
  Versuch 'Dateiendungen' { Setze ($hk + '\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced') 'HideFileExt' $s.dateiendung 'DWord' 'Dateiendungen anzeigen' }
  Versuch 'Testverknüpfungen' {
    $prof = [string](W ('HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\' + $s.sid) 'ProfileImagePath')
    if ($prof) { foreach ($dt in @(Join-Path $prof 'Desktop') + @(Get-ChildItem -LiteralPath $prof -Directory -Filter 'OneDrive*' -EA SilentlyContinue | ForEach-Object { Join-Path $_.FullName 'Desktop' })) { Get-ChildItem -LiteralPath $dt -Filter '*ITAdminToolTest*.lnk' -EA SilentlyContinue | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force; Z ('Testverknüpfung entfernt: ' + $_.Name) } } }
  }
} else { Z 'Kein Benutzer angemeldet – Benutzereinstellungen (Proxy, Design, Skalierung …) wurden nicht zurückgestellt' }

# ── Testdateien ──
Versuch 'Testordner' { if (Test-Path -LiteralPath $d) { Remove-Item -LiteralPath $d -Recurse -Force; Z 'Testordner C:\ITAdminToolTest entfernt' } }
Versuch 'Testdatei C:\Temp' { foreach ($f in 'C:\Temp\ITAdminTool-Testdatei.txt') { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force; Z ('Entfernt: ' + $f) } } }
if ($z.Count -eq 0) { Z 'Nichts zu tun – alles war schon sauber' }
'@@BT@@' + (@{ ok = $true; zeilen = [string[]]$z.ToArray() } | ConvertTo-Json -Compress)
`

/** Syntaxprüfung auf DEM ADMIN-PC: liest eine JSON-Datei [{k, s: [skript…]}] und parst jedes Skript. */
export function psSyntax(datei: string): string {
  return String.raw`
$f = '` + datei.replace(/'/g, "''") + String.raw`'
$liste = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8) | ConvertFrom-Json
$aus = @{}
foreach ($e in $liste) {
  $befund = ''
  foreach ($code in @($e.s)) {
    $tok = $null; $err = $null
    $null = [System.Management.Automation.Language.Parser]::ParseInput($code, [ref]$tok, [ref]$err)
    if ($err -and $err.Count) { $x = $err[0]; $befund = ('Zeile ' + $x.Extent.StartLineNumber + ': ' + $x.Message); break }
  }
  $aus[[string]$e.k] = $befund
}
Remove-Item -LiteralPath $f -Force -EA SilentlyContinue
'@@BT@@' + ($aus | ConvertTo-Json -Compress)
`
}

/** Testdatei auf DEM ADMIN-PC (für „Datei zum Ziel-PC kopieren“). */
export const PS_TESTDATEI_LOKAL = String.raw`
$f = Join-Path $env:TEMP 'ITAdminTool-Testdatei.txt'
Set-Content -LiteralPath $f -Value 'Testdatei IT Admin Tool (Befehls-Test)' -Encoding UTF8
'@@BT@@' + (@{ ok = $true; pfad = $f } | ConvertTo-Json -Compress)
`

/** Aufräumen auf DEM ADMIN-PC: Testdatei + vom Test-PC geholte Datei auf dem Desktop. */
export const PS_AUFRAEUMEN_LOKAL = String.raw`
$n = 0
foreach ($f in @((Join-Path $env:TEMP 'ITAdminTool-Testdatei.txt'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ITAdminTool-Testlauf.txt'))) { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force -EA SilentlyContinue; $n++ } }
'@@BT@@' + (@{ ok = $true; n = $n } | ConvertTo-Json -Compress)
`
