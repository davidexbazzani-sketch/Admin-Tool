// ── Änderungsverlauf je PC: das Leseskript ───────────────────────────────────
// Läuft AUF dem Ziel-PC (Invoke-Command) und liest NUR — es wird nichts verändert, nichts
// installiert, WinRM wird nicht eingeschaltet. Geschont werden PC und Netz:
//   • niedrige Priorität am PC, nur Registry/Dateiliste/Ereignisanzeige (kein Win32_Product,
//     kein Win32_PnPSignedDriver),
//   • der PC rechnet selbst einen Fingerabdruck seines Stands. Stimmt er mit dem bekannten
//     überein, kommt nur „unverändert" zurück (wenige hundert Bytes),
//   • sonst kommt der Stand gepackt (gzip) zurück — typisch 5–15 KB.
// Wichtig: Ein Abschnitt, der sich nicht lesen ließ, ist `null` (unbekannt) und NIE leer —
// sonst sähe es beim Vergleich so aus, als wäre alles entfernt worden.
//
// Keine Backticks und kein „${" im PowerShell-Text (String.raw / Template-Literal).

export const TAG = '@@PCV@@'

/** Abschnitte des Stands — Reihenfolge = Reihenfolge im Fingerabdruck. */
export const ABSCHNITTE = ['sys', 'sw', 'swU', 'upd', 'drv', 'svc', 'auto', 'autoU', 'task', 'net', 'app'] as const

export const SAMMLER_BLOCK = String.raw`{
  param($alt, $seit)
  $ErrorActionPreference = 'SilentlyContinue'; $ProgressPreference = 'SilentlyContinue'
  try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = 'BelowNormal' } catch {}
  $T = [char]9
  $pc = ([string]$env:COMPUTERNAME).ToUpper()
  $altHash = ''; if ($alt -is [System.Collections.IDictionary]) { $altHash = [string]$alt[$pc] } elseif ($alt) { $altHash = [string]$alt }
  $s = ''; if ($seit -is [System.Collections.IDictionary]) { $s = [string]$seit[$pc] } elseif ($seit) { $s = [string]$seit }
  $jetzt = Get-Date
  $ab = $jetzt.AddDays(-14)
  if ($s) { try { $ab = ([datetime]::Parse($s, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind)).ToLocalTime() } catch {} }
  if ($ab -lt $jetzt.AddDays(-35)) { $ab = $jetzt.AddDays(-35) }
  function Neu { ,(New-Object System.Collections.Generic.List[string]) }
  function Zeilen($l) { ,@($l | Sort-Object -Unique) }
  function Iso($d) { ([datetime]$d).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

  # ── System: BIOS, Modell, Windows-Build (nur Registry) ──
  $sys = $null
  try {
    $l = Neu
    $b = Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\BIOS' -EA Stop
    $l.Add('BIOS' + $T + ([string]$b.BIOSVersion).Trim())
    $l.Add('Modell' + $T + ([string]$b.SystemProductName).Trim())
    $cv = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -EA Stop
    $l.Add('Windows-Build' + $T + [string]$cv.CurrentBuild + '.' + [string]$cv.UBR)
    $l.Add('Windows-Version' + $T + [string]$cv.DisplayVersion)
    $sys = Zeilen $l
  } catch {}

  # ── Programme (Uninstall-Schlüssel) ──
  function LiesUninstall($pfad, $vor, $l) {
    foreach ($e in @(Get-ItemProperty -Path ($pfad + '\*') -EA SilentlyContinue)) {
      $n = ([string]$e.DisplayName).Trim()
      if (-not $n -or $e.SystemComponent -eq 1 -or $e.ParentKeyName) { continue }
      if ($n -match '^(Security )?Update for |^Hotfix for |\(KB\d{6,}\)') { continue }
      $l.Add($vor + $n + $T + [string]$e.DisplayVersion + $T + [string]$e.InstallDate + $T + [string]$e.Publisher)
    }
  }
  $sw = $null
  try {
    if (-not (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')) { throw 'kein Uninstall' }
    $l = Neu
    LiesUninstall 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall' '' $l
    LiesUninstall 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall' '' $l
    $sw = Zeilen $l
  } catch {}

  # ── Autostart für alle Benutzer ──
  $auto = $null
  try {
    $l = Neu
    foreach ($p in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run')) {
      $k = Get-Item $p -EA SilentlyContinue
      if ($k) { foreach ($n in $k.GetValueNames()) { if ($n) { $l.Add('Alle Benutzer' + $T + $n + $T + [string]$k.GetValue($n)) } } }
    }
    $o = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\StartUp'
    foreach ($f in @(Get-ChildItem -LiteralPath $o -File -Force -EA SilentlyContinue)) { if ($f.Name -ne 'desktop.ini') { $l.Add('Autostart-Ordner' + $T + $f.Name + $T) } }
    $auto = Zeilen $l
  } catch {}

  # ── Je angemeldetem Benutzer (geladene Registry): Programme + Autostart ──
  $benutzer = Neu; $swU = Neu; $autoU = Neu
  try {
    foreach ($k in @(Get-ChildItem Registry::HKEY_USERS -EA SilentlyContinue)) {
      $sid = [string]$k.PSChildName
      if ($sid -notmatch '^S-1-5-21-[\d-]+$' -and $sid -notmatch '^S-1-12-1-[\d-]+$') { continue }
      $name = $sid
      try { $name = ((New-Object Security.Principal.SecurityIdentifier($sid)).Translate([Security.Principal.NTAccount]).Value -split '\\')[-1] } catch {}
      $benutzer.Add($name)
      LiesUninstall ('Registry::HKEY_USERS\' + $sid + '\Software\Microsoft\Windows\CurrentVersion\Uninstall') ($name + $T) $swU
      $rk = Get-Item ('Registry::HKEY_USERS\' + $sid + '\Software\Microsoft\Windows\CurrentVersion\Run') -EA SilentlyContinue
      if ($rk) { foreach ($n in $rk.GetValueNames()) { if ($n) { $autoU.Add($name + $T + $n + $T + [string]$rk.GetValue($n)) } } }
    }
  } catch {}

  # ── Windows-Updates ──
  $upd = $null
  try {
    $l = Neu
    foreach ($q in @(Get-HotFix -EA Stop)) {
      $d = ''; try { if ($q.InstalledOn) { $d = ([datetime]$q.InstalledOn).ToString('yyyy-MM-dd') } } catch {}
      if ($q.HotFixID) { $l.Add([string]$q.HotFixID + $T + $d + $T + [string]$q.Description) }
    }
    if ($l.Count) { $upd = Zeilen $l }
  } catch {}

  # ── Treiber anderer Hersteller (Registry-Klassen, kein WMI) ──
  $drv = $null
  try {
    $l = Neu
    foreach ($k in @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class' -EA Stop)) {
      $kl = [string]$k.GetValue('Class')
      foreach ($u in @($k.GetSubKeyNames())) {
        if ($u -notmatch '^\d{4}$') { continue }
        $d = $null; try { $d = $k.OpenSubKey($u) } catch {}
        if (-not $d) { continue }
        $desc = ([string]$d.GetValue('DriverDesc')).Trim(); $prov = ([string]$d.GetValue('ProviderName')).Trim()
        if ($desc -and $prov -and $prov -ne 'Microsoft' -and $prov -notmatch '^\(') {
          $l.Add($desc + $T + [string]$d.GetValue('DriverVersion') + $T + [string]$d.GetValue('DriverDate') + $T + $prov + $T + $kl)
        }
        $d.Close()
      }
    }
    $drv = Zeilen $l
  } catch {}

  # ── Dienste: Name + deaktiviert ja/nein ──
  # Windows stellt viele Dienste selbst laufend zwischen Automatisch und Manuell um. Das ist
  # keine Aenderung am PC und wuerde den Fingerabdruck staendig kippen (dann kaeme jedes Mal
  # der volle Stand statt "unveraendert"). Aussagekraeftig ist nur: deaktiviert oder nicht.
  $svc = $null
  try {
    $l = Neu
    foreach ($d in @(Get-Service -EA SilentlyContinue)) {
      $n = [string]$d.Name
      if (-not $n -or $n -match '_[0-9a-f]{4,8}$') { continue }
      $st = 'Aktiv'; try { if ([string]$d.StartType -eq 'Disabled') { $st = 'Disabled' } } catch {}
      $l.Add($n + $T + $st + $T + [string]$d.DisplayName)
    }
    if ($l.Count -gt 20) { $svc = Zeilen $l }
  } catch {}

  # ── Geplante Aufgaben außerhalb von \Microsoft (nur Dateiliste) ──
  $task = $null
  try {
    $wurzel = Join-Path $env:SystemRoot 'System32\Tasks'
    if (-not (Test-Path -LiteralPath $wurzel)) { throw 'keine Aufgaben' }
    $l = Neu
    $alle = @(Get-ChildItem -LiteralPath $wurzel -Recurse -File -Force -EA SilentlyContinue)
    if (-not $alle.Count) { throw 'nicht lesbar' }
    foreach ($f in $alle) {
      $rel = $f.FullName.Substring($wurzel.Length)
      if ($rel -like '\Microsoft\*' -or $rel -match 'ITAdminTool_|[Uu]pdate|Telemetry|OneDrive (Reporting|Standalone|Startup)') { continue }
      $rel = $rel -replace 'S-1-(5-21|12-1)-[\d-]+', 'S-x' -replace '\{[0-9A-Fa-f-]{36}\}', '{x}' -replace '\d+\.\d+\.\d+(\.\d+)?', '*'
      $l.Add($rel + $T + (Iso $f.CreationTime))
    }
    $task = Zeilen $l
  } catch {}

  # ── Netzwerk: feste Einstellungen je Adapter + hosts-Datei (ortsunabhängig) ──
  $net = $null
  try {
    $l = Neu
    $namen = 'HKLM:\SYSTEM\CurrentControlSet\Control\Network\{4D36E972-E325-11CE-BFC1-08002BE10318}'
    foreach ($k in @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces' -EA Stop)) {
      $g = [string]$k.PSChildName
      $c = Get-ItemProperty -LiteralPath ($namen + '\' + $g + '\Connection') -EA SilentlyContinue
      if (-not $c -or -not $c.Name) { continue }
      $dhcp = 'DHCP an'; if ([int]$k.GetValue('EnableDHCP', 1) -eq 0) { $dhcp = 'feste IP ' + ((@($k.GetValue('IPAddress')) -join ',')) + ' Gateway ' + ((@($k.GetValue('DefaultGateway')) -join ',')) }
      $dns = ([string]$k.GetValue('NameServer')).Trim()
      $l.Add([string]$c.Name + $T + $dhcp + $T + $(if ($dns) { 'fester DNS ' + $dns } else { 'DNS automatisch' }))
    }
    $hf = Get-Item -LiteralPath (Join-Path $env:SystemRoot 'System32\drivers\etc\hosts') -EA SilentlyContinue
    if ($hf) {
      $eintraege = @(Get-Content -LiteralPath $hf.FullName -EA SilentlyContinue | Where-Object { $_ -match '^\s*[0-9a-fA-F:.]+\s+\S' }).Count
      $l.Add('hosts-Datei' + $T + [string]$eintraege + $T + (Iso $hf.LastWriteTime))
    }
    $net = Zeilen $l
  } catch {}

  # ── Apps aus dem Store/Intune (z. B. neues Teams, neues Outlook, Unternehmensportal) ──
  $app = $null
  try {
    $l = Neu
    foreach ($a in @(Get-AppxPackage -AllUsers -EA Stop)) {
      if ($a.IsFramework -or [string]$a.SignatureKind -eq 'System' -or $a.IsResourcePackage -or $a.IsBundle) { continue }
      $n = [string]$a.Name
      if ($n -match '^Microsoft\.(Bing|Xbox|Zune|Gaming|GetHelp|Getstarted|People|YourPhone|549981C3F5F10|MicrosoftSolitaire|MicrosoftStickyNotes|Paint|ScreenSketch|Windows\.Photos|WindowsCalculator|WindowsCamera|WindowsAlarms|WindowsMaps|WindowsSoundRecorder|WindowsFeedbackHub|WindowsNotepad|Todos|PowerAutomateDesktop|Copilot|StorePurchaseApp|HEIFImageExtension|HEVCVideoExtension|VP9VideoExtensions|WebMediaExtensions|WebpImageExtension|RawImageExtension|AV1VideoExtension|AVCEncoderVideoExtension|MPEG2VideoExtension|Services\.Store|SecHealthUI|LanguageExperiencePack|MicrosoftOfficeHub|OutlookForWindows\.Sparkle|Wallet|MixedReality|3DBuilder|Messaging|OneConnect|Print3D|SkypeApp|Whiteboard\.Sparkle|ApplicationCompatibilityEnhancements|WidgetsPlatformRuntime|StartExperiencesApp|CrossDevice|Edge\.GameAssist|WindowsTerminal|WindowsStore|DesktopAppInstaller|Windows\.DevHome)|^MicrosoftWindows\.|^Clipchamp|^MicrosoftCorporationII\.(QuickAssist|MicrosoftFamily)|^Microsoft\.Windows\.(?!RemoteDesktop)|^SpotifyAB|^Disney|^king\.com|^Facebook|^BytedancePte') { continue }
      $l.Add($n + $T + [string]$a.Version)
    }
    if ($l.Count) { $app = Zeilen $l }
  } catch {}

  # ── Ereignisse mit genauem Zeitpunkt (seit dem letzten Lesen, höchstens 35 Tage) ──
  $ev = Neu
  function Werte($e) { ,@($e.Properties | ForEach-Object { [string]$_.Value }) }
  try {
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'MsiInstaller'; Id = 1033, 1034; StartTime = $ab } -MaxEvents 300 -EA Stop)) {
      $p = Werte $e
      if ($p.Count -lt 4 -or $p[3] -ne '0' -or -not $p[0]) { continue }
      $ev.Add((Iso $e.TimeCreated) + $T + $(if ($e.Id -eq 1033) { 'MSI+' } else { 'MSI-' }) + $T + $p[0] + $T + $p[1] + $T + $(if ($p.Count -gt 4) { $p[4] } else { '' }))
    }
  } catch {}
  try {
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Service Control Manager'; Id = 7045; StartTime = $ab } -MaxEvents 200 -EA Stop)) {
      $p = Werte $e
      if ($p.Count -lt 3 -or -not $p[0]) { continue }
      # Kernel-Treiber aus dem Treiberspeicher meldet schon die Geräte-Einrichtung (PNP) — nicht doppelt
      if ($p[2] -match 'ernel' -and ($p[1] -match 'DriverStore' -or $p[1] -like '*drivers?wd?*' -or $p[0] -match '^(KslD|MpKsl)')) { continue }
      $ev.Add((Iso $e.TimeCreated) + $T + $(if ($p[2] -match 'ernel') { 'KRN+' } else { 'SVC+' }) + $T + $p[0] + $T + $p[1] + $T + $(if ($p.Count -gt 4) { $p[4] } else { '' }))
    }
  } catch {}
  try {
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WindowsUpdateClient'; Id = 19; StartTime = $ab } -MaxEvents 400 -EA Stop)) {
      $p = Werte $e
      if (-not $p.Count -or -not $p[0]) { continue }
      # Store-Apps (9XXXXXXXXXXX-Name) und Virendefinitionen sind kein Hinweis auf eine Ursache
      if ($p[0] -match '^9[A-Z0-9]{11}-|KB2267602|Security Intelligence|Sicherheitsinformations') { continue }
      $ev.Add((Iso $e.TimeCreated) + $T + 'WU' + $T + $p[0] + $T + $T)
    }
  } catch {}
  try {
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Kernel-PnP/Configuration'; Id = 400; StartTime = $ab } -MaxEvents 300 -EA Stop)) {
      $p = Werte $e
      if ($p.Count -lt 6 -or -not $p[5] -or $p[5] -eq 'Microsoft' -or -not $p[4]) { continue }
      $name = ''
      try {
        $dk = Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Enum\' + $p[0]) -EA Stop
        $name = [string]$dk.FriendlyName; if (-not $name) { $name = [string]$dk.DeviceDesc }
        if ($name -match ';') { $name = ($name -split ';')[-1] }
      } catch {}
      if (-not $name) { $name = ([string]$p[$p.Count - 1]) -replace '\.inf_.*$', '.inf' }
      $ev.Add((Iso $e.TimeCreated) + $T + 'PNP' + $T + $name.Trim() + $T + $p[4] + $T + $p[5])
    }
  } catch {}

  # ── Fehler der letzten 7 Tage aus ALLEN Ereignisprotokollen, schon am PC zusammengezaehlt ──
  # Je Protokoll/Quelle/Kennung EINE Zeile (Anzahl, erstes und letztes Auftreten, ein Beispieltext).
  # Ueber das Netz geht nur diese Zusammenfassung, nie die einzelnen Ereignisse.
  #   Zeile: Protokoll, Quelle, Kennung, Stufe, Anzahl, zuerst, zuletzt, Programm, Text
  $fe = $null
  try {
    $g = @{}
    $msF = [int64]7 * 24 * 60 * 60 * 1000
    function Merke($e, [string]$log, [string]$app, [string]$fest) {
      $k = $log + $T + [string]$e.ProviderName + $T + [string]$e.Id + $T + $app
      $x = $g[$k]
      if (-not $x) {
        $txt = $fest
        if (-not $txt) { try { $txt = [string]$e.Message } catch {} }
        $txt = (($txt -replace '\s+', ' ').Trim()); if ($txt.Length -gt 240) { $txt = $txt.Substring(0, 240) }
        $x = @{ n = 0; a = $e.TimeCreated; z = $e.TimeCreated; t = $txt; lv = [int]$e.Level }
        $g[$k] = $x
      }
      $x.n++
      if ($e.TimeCreated -gt $x.z) { $x.z = $e.TimeCreated }
      if ($e.TimeCreated -lt $x.a) { $x.a = $e.TimeCreated }
    }
    $xpF = '*[System[(Level=1 or Level=2) and TimeCreated[timediff(@SystemTime) <= ' + $msF + ']]]'
    $grenze = $jetzt.AddDays(-7)
    foreach ($lg in @(Get-WinEvent -ListLog * -EA SilentlyContinue | Where-Object { $_.RecordCount -gt 0 -and $_.LastWriteTime -ge $grenze -and $_.LogName -ne 'Security' })) {
      foreach ($e in @(Get-WinEvent -LogName $lg.LogName -FilterXPath $xpF -MaxEvents 300 -EA SilentlyContinue)) {
        $app = ''
        if ($e.ProviderName -eq 'Application Error' -or $e.ProviderName -eq 'Application Hang') {
          $p = Werte $e
          if ($p.Count) { $app = [string]$p[0]; if ($e.Id -eq 1000 -and $p.Count -gt 6) { $app = $app + '|' + [string]$p[3] + '|' + [string]$p[6] } }
        }
        Merke $e ([string]$lg.LogName) $app ''
      }
    }
    # Warnungen, die auf Hardware- oder Treiberschaeden hinweisen (sonst zaehlen nur Fehler)
    $xpW = '*[System[Provider[@Name=''Display'' or @Name=''disk'' or @Name=''Ntfs'' or @Name=''volmgr'' or @Name=''stornvme'' or @Name=''storahci'' or @Name=''Microsoft-Windows-WHEA-Logger'' or @Name=''Microsoft-Windows-Resource-Exhaustion-Detector''] and Level=3 and TimeCreated[timediff(@SystemTime) <= ' + $msF + ']]]'
    foreach ($e in @(Get-WinEvent -LogName 'System' -FilterXPath $xpW -MaxEvents 300 -EA SilentlyContinue)) { Merke $e 'System' '' '' }
    # Fehlermeldungen, die Office dem Benutzer gezeigt hat (Outlook, Excel, Word ...)
    $xpO = '*[System[TimeCreated[timediff(@SystemTime) <= ' + $msF + ']]]'
    foreach ($e in @(Get-WinEvent -LogName 'OAlerts' -FilterXPath $xpO -MaxEvents 200 -EA SilentlyContinue)) {
      $p = Werte $e
      $prog = ''; $meld = ''
      if ($p.Count) { $prog = [string]$p[0] }
      if ($p.Count -gt 1) { $meld = [string]$p[1] }
      if (-not $meld) { continue }
      $kurzM = (($meld -replace '\s+', ' ').Trim()); if ($kurzM.Length -gt 120) { $kurzM = $kurzM.Substring(0, 120) }
      Merke $e 'OAlerts' ($prog + '|' + $kurzM) $meld
    }
    $l = Neu
    foreach ($k in @($g.Keys | Sort-Object { -[int]$g[$_].n } | Select-Object -First 80)) {
      $x = $g[$k]; $s = $k -split $T
      $l.Add($s[0] + $T + $s[1] + $T + $s[2] + $T + [string]$x.lv + $T + [string]$x.n + $T + (Iso $x.a) + $T + (Iso $x.z) + $T + $s[3] + $T + [string]$x.t)
    }
    $fe = @($l)
  } catch {}
  # Netzlaufwerk I: je angemeldetem Domaenen-Benutzer: steht die dauerhafte Verbindung in seiner Registry?
  #   Zeile: Benutzer, Zielpfad (leer = nicht verbunden)
  $lw = $null
  try {
    $l = Neu
    foreach ($k in @(Get-ChildItem Registry::HKEY_USERS -EA SilentlyContinue)) {
      $sid = [string]$k.PSChildName
      if ($sid -notmatch '^S-1-5-21-[\d-]+$' -and $sid -notmatch '^S-1-12-1-[\d-]+$') { continue }
      $konto = ''; try { $konto = (New-Object Security.Principal.SecurityIdentifier($sid)).Translate([Security.Principal.NTAccount]).Value } catch {}
      if (-not $konto) { continue }
      $t2 = $konto -split '\\'
      # lokale Konten (z. B. lokaler Administrator) haben kein Firmenlaufwerk
      if ($t2.Count -lt 2 -or $t2[0] -ieq $pc) { continue }
      $ziel = ''; try { $ziel = [string](Get-ItemProperty -LiteralPath ('Registry::HKEY_USERS\' + $sid + '\Network\I') -EA Stop).RemotePath } catch {}
      $l.Add($t2[-1] + $T + $ziel)
    }
    $lw = @($l)
  } catch {}

  # ── Fingerabdruck + Antwort ──
  $teile = New-Object System.Collections.Generic.List[string]
  foreach ($x in @(@('sys', $sys), @('sw', $sw), @('swU', @($swU | Sort-Object -Unique)), @('upd', $upd), @('drv', $drv), @('svc', $svc), @('auto', $auto), @('autoU', @($autoU | Sort-Object -Unique)), @('task', $task), @('net', $net), @('app', $app))) {
    $teile.Add('#' + [string]$x[0]); if ($null -ne $x[1]) { foreach ($z in @($x[1])) { $teile.Add([string]$z) } } else { $teile.Add('?') }
  }
  $sha = [Security.Cryptography.SHA256]::Create()
  $hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($teile -join [char]10)))[0..11] | ForEach-Object { $_.ToString('x2') })
  $aus = [ordered]@{ v = 1; host = $pc; am = (Iso $jetzt); hash = $hash; ev = @($ev | Sort-Object -Unique); fe = $fe; lw = $lw }
  if ($altHash -and $altHash -eq $hash) { $aus.gleich = $true }
  else {
    $aus.benutzer = @($benutzer | Sort-Object -Unique)
    $aus.sys = $sys; $aus.sw = $sw; $aus.swU = @($swU | Sort-Object -Unique); $aus.upd = $upd; $aus.drv = $drv; $aus.svc = $svc
    $aus.auto = $auto; $aus.autoU = @($autoU | Sort-Object -Unique); $aus.task = $task; $aus.net = $net; $aus.app = $app
  }
  $json = ConvertTo-Json -InputObject ([pscustomobject]$aus) -Depth 3 -Compress
  $roh = [Text.Encoding]::UTF8.GetBytes($json)
  $ms = New-Object IO.MemoryStream
  $gz = New-Object IO.Compression.GZipStream($ms, [IO.Compression.CompressionMode]::Compress)
  $gz.Write($roh, 0, $roh.Length); $gz.Close()
  '@@PCV@@' + $pc + '|OK|' + [Convert]::ToBase64String($ms.ToArray())
}`

/**
 * Zwei getrennte Scans (Nutzerwunsch 11.11.2026 — in den Einstellungen einzeln schaltbar):
 *   stand  = aktueller Stand des PCs (Änderungsverlauf)      → src/pcVerlauf
 *   fehler = Fehler aus allen Ereignisprotokollen (7 Tage)   → src/pcFehler
 *   beides = nur für das Lesen EINES PCs auf Knopfdruck/in „Gib dein Problem ein“
 * Jeder Scan schickt nur seinen Teil des Skripts zum PC.
 */
export type LeseModus = 'stand' | 'fehler' | 'beides'

const kompakt = (s: string) => s.split('\n').map(z => z.trim()).filter(z => z && !z.startsWith('#')).join('\n')
function zerlege() {
  const b = SAMMLER_BLOCK
  const marke = (m: string) => { const i = b.indexOf(m); if (i < 0) throw new Error('Leseskript: Abschnitt fehlt – ' + m); return i }
  const iStand = marke('  # ── System:'), iFehler = marke('  # ── Fehler der letzten 7 Tage'), iHash = marke('  # ── Fingerabdruck + Antwort'), iAus = marke('  $json = ConvertTo-Json')
  const kopf = b.slice(0, iStand), stand = b.slice(iStand, iFehler), fehler = b.slice(iFehler, iHash), hash = b.slice(iHash, iAus), ausgabe = b.slice(iAus)
  const werte = '  function Werte($e) { ,@($e.Properties | ForEach-Object { [string]$_.Value }) }\n'
  const nurFehler = '  $aus = [ordered]@{ v = 1; host = $pc; am = (Iso $jetzt); hash = \'\'; ev = @(); nurFehler = $true; fe = $fe; lw = $lw }\n'
  return {
    beides: kompakt(b),
    stand: kompakt(kopf + stand + hash + ausgabe),
    fehler: kompakt(kopf + werte + fehler + nurFehler + ausgabe),
  }
}
/** Ohne Kommentare und Einrückung — so klein wie möglich, weil der Block zu jedem PC geschickt wird. */
export const SAMMLER: Record<LeseModus, string> = zerlege()
export const SAMMLER_KOMPAKT = SAMMLER.beides

const psq = (s: string) => s.replace(/'/g, "''")
const istHost = (h: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(h)

/**
 * Skript für den Admin-PC: prüft zuerst nur, ob der WinRM-Port offen ist (kein Ping-Sturm,
 * WinRM wird NICHT eingeschaltet), und fragt dann höchstens `gleichzeitig` PCs auf einmal ab.
 * Antwortzeilen:  @@PCV@@HOST|OK|<gzip+base64>   ·   @@PCV@@HOST|AUS   ·   @@PCV@@HOST|FEHLER|Text
 */
export function baueLeseSkript(hosts: string[], hashes: Record<string, string>, seit: Record<string, string>, gleichzeitig = 3, modus: LeseModus = 'beides'): string {
  const ziele = hosts.map(h => h.trim()).filter(istHost)
  const tabelle = (m: Record<string, string>) => '@{ ' + ziele
    .map(h => [h.split('.')[0].toUpperCase(), m[h.split('.')[0].toUpperCase()] || ''] as const)
    .filter(([, w]) => /^[0-9a-zA-Z:.+-]{1,40}$/.test(w))
    .map(([k, w]) => `'${psq(k)}' = '${psq(w)}'`).join('; ') + ' }'
  return [
    `$ErrorActionPreference = 'SilentlyContinue'; $ProgressPreference = 'SilentlyContinue'`,
    `$ziele = @(${ziele.map(h => `'${psq(h)}'`).join(', ')})`,
    `$alt = ${tabelle(hashes)}`,
    `$seit = ${tabelle(seit)}`,
    `function Kurz([string]$n) { if ($n -match '^[0-9.]+$') { $n } else { $n.Split('.')[0].ToUpper() } }`,
    `$probe = @{}`,
    `foreach ($z in $ziele) { try { $c = New-Object Net.Sockets.TcpClient; $probe[$z] = @($c, $c.ConnectAsync($z, 5985)) } catch { $probe[$z] = $null } }`,
    `try { [void][Threading.Tasks.Task]::WaitAll(@($probe.Values | Where-Object { $_ } | ForEach-Object { $_[1] }), 2500) } catch {}`,
    `$offen = @()`,
    `foreach ($z in $ziele) {`,
    `  $p = $probe[$z]; $ok = $false`,
    `  if ($p) { try { $ok = ($p[1].Status -eq 'RanToCompletion') -and $p[0].Connected } catch {}; try { $p[0].Close() } catch {} }`,
    `  if ($ok) { $offen += $z } else { '${TAG}' + (Kurz $z) + '|AUS' }`,
    `}`,
    `if ($offen.Count) {`,
    `  $sb = ${SAMMLER[modus]}`,
    `  $so = New-PSSessionOption -OpenTimeout 8000 -OperationTimeout 90000 -NoMachineProfile`,
    `  $fehler = @()`,
    `  Invoke-Command -ComputerName $offen -ScriptBlock $sb -ArgumentList $alt, $seit -SessionOption $so -ThrottleLimit ${Math.max(1, Math.min(5, gleichzeitig))} -ErrorAction SilentlyContinue -ErrorVariable fehler | ForEach-Object { [string]$_ } | Where-Object { $_ -like '${TAG}*' }`,
    `  foreach ($f in @($fehler)) { $n = [string]$f.TargetObject; if ($n) { '${TAG}' + (Kurz $n) + '|FEHLER|' + (([string]$f.Exception.Message) -replace '\\s+', ' ') } }`,
    `}`,
  ].join('\n')
}

/** Nur zum Testen am eigenen Rechner: führt den Block lokal aus (ohne Fernzugriff). */
export function baueLokalSkript(hash = '', seit = '', modus: LeseModus = 'beides'): string {
  return [
    `$sb = ${SAMMLER[modus]}`,
    `& $sb '${psq(hash)}' '${psq(seit)}'`,
  ].join('\n')
}
