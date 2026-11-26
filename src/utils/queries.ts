import type { QueryDefinition } from '../types'

// Längere Skripte als String.raw (Backslashes bleiben, kein `${…}` darin); der Hostname wird erst beim Ausführen
// eingesetzt — in einfachen Anführungszeichen, ' verdoppelt.
const mitHost = (skript: string, h: string) => skript.replace(/__HOST__/g, () => h.replace(/'/g, "''"))

// Gemeinsame Bausteine: erst kurz prüfen, ob der PC auf WinRM (5985) antwortet — sonst wartet Invoke-Command
// bei ausgeschalteten/gesperrten PCs minutenlang und die Abfrage läuft ins Zeitlimit (30 s).
const BAUSTEINE = String.raw`$h = '__HOST__'
function Erreichbar([string]$n) {
  $t = New-Object Net.Sockets.TcpClient
  try { $a = $t.BeginConnect($n, 5985, $null, $null); if ($a.AsyncWaitHandle.WaitOne(2500) -and $t.Connected) { $t.EndConnect($a); return $true } } catch {} finally { $t.Close() }
  return $false
}
function Zt($t) { ([datetime]$t).ToString('dd.MM.yyyy HH:mm') }
function Nm([string]$konto) {
  $s = (($konto -split '\\')[-1]) -replace '[^A-Za-z0-9._-]', ''
  if (-not $s) { return '' }
  try { $f = ([adsisearcher]"(&(objectCategory=person)(sAMAccountName=$s))").FindOne(); if ($f -and $f.Properties['displayname'].Count) { return " ($($f.Properties['displayname'][0]))" } } catch {}
  return ''
}
function Lies([string]$filter, [string[]]$felder) { try { $s = New-Object DirectoryServices.DirectorySearcher($filter); foreach ($f in $felder) { [void]$s.PropertiesToLoad.Add($f) }; $s.FindOne() } catch { $null } }
function PcImAd { $n = (($h -split '\.')[0]) -replace '[^A-Za-z0-9_-]', ''; Lies "(&(objectCategory=computer)(name=$n))" @('lastlogontimestamp', 'pwdlastset') }
$so = New-PSSessionOption -OpenTimeout 8000 -OperationTimeout 18000 -NoMachineProfile
`

/**
 * Wer war zuletzt am PC angemeldet – und wann? Auf dem PC (WinRM, unsichtbar): jetzt angemeldeter Benutzer mit
 * „angemeldet seit“ (Start seines Explorers), Anmeldungen/Abmeldungen aus dem Systemprotokoll (Winlogon 7001/7002 –
 * klein und schnell, anders als das oft riesige Sicherheitsprotokoll), Windows-Anmeldebildschirm und Profil-Datum
 * als Rückfall. Namen löst der Admin-PC im AD auf. Nicht erreichbar → sofort Meldung + „zuletzt im Netz“ laut AD.
 */
const SKRIPT_LETZTE_ANMELDUNG = BAUSTEINE + String.raw`
if (-not (Erreichbar $h)) {
  'PC nicht erreichbar (ausgeschaltet, nicht im Netz oder WinRM gesperrt).'
  $c = PcImAd
  if ($c -and $c.Properties['lastlogontimestamp'].Count) { "Zuletzt im Netz laut AD: $(Zt ([datetime]::FromFileTime([int64]$c.Properties['lastlogontimestamp'][0]))) (bis zu 14 Tage ungenau)" }
} else {
  $r = $null; $fehler = ''
  try {
    $r = Invoke-Command -ComputerName $h -SessionOption $so -ErrorAction Stop -ScriptBlock {
      function Konto($sid) { try { (New-Object Security.Principal.SecurityIdentifier([string]$sid)).Translate([Security.Principal.NTAccount]).Value } catch { [string]$sid } }
      $akt = try { (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).UserName } catch { $null }
      $seit = $null
      if ($akt) {
        try {
          $ex = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -ErrorAction Stop | Where-Object { $o = Invoke-CimMethod -InputObject $_ -MethodName GetOwner; "$($o.Domain)\$($o.User)" -eq $akt } | Sort-Object CreationDate)
          if ($ex.Count) { $seit = $ex[0].CreationDate }
        } catch {}
      }
      $lp = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Authentication\LogonUI' -ErrorAction SilentlyContinue
      $profil = $null
      if ($lp.LastLoggedOnUserSID) { try { $up = Get-CimInstance Win32_UserProfile -Filter "SID='$($lp.LastLoggedOnUserSID)'" -ErrorAction Stop; $nt = Join-Path $up.LocalPath 'NTUSER.DAT'; if (Test-Path -LiteralPath $nt) { $profil = (Get-Item -LiteralPath $nt -Force).LastWriteTime } } catch {} }
      $wl = @(); $wlFehler = ''
      try { $wl = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Winlogon'; Id = 7001, 7002 } -MaxEvents 80 -ErrorAction Stop) }
      catch { if ($_.FullyQualifiedErrorId -notlike 'NoMatchingEventsFound*') { $wlFehler = $_.Exception.Message } }
      $cache = @{}
      $ev = foreach ($e in $wl) {
        $sid = [string]$e.Properties[1].Value
        if (-not $sid) { continue }
        if (-not $cache.ContainsKey($sid)) { $cache[$sid] = Konto $sid }
        [pscustomobject]@{ Zeit = $e.TimeCreated; Id = $e.Id; Konto = $cache[$sid] }
      }
      $erstes = $null; try { $erstes = (Get-WinEvent -LogName System -MaxEvents 1 -Oldest -ErrorAction Stop).TimeCreated } catch {}
      [pscustomobject]@{ Aktuell = $akt; Seit = $seit; LetzterSam = $lp.LastLoggedOnSAMUser; LetzterName = $lp.LastLoggedOnDisplayName; Profil = $profil; Ereignisse = @($ev); Erstes = $erstes; Fehler = $wlFehler }
    }
  } catch { $fehler = $_.Exception.Message }
  if ($fehler) { "PC antwortet, aber die WinRM-Verbindung ist fehlgeschlagen: $fehler" }
  else {
    $an = @($r.Ereignisse | Where-Object { $_ -and $_.Id -eq 7001 } | Sort-Object { [datetime]$_.Zeit } -Descending)
    # „seit“ = echte Anmeldung aus dem Protokoll; der Explorer-Start nur als Rückfall (Explorer startet auch mal neu)
    $seit = @($an | Where-Object { $r.Aktuell -and $_.Konto -eq $r.Aktuell } | Select-Object -First 1)
    $seitText = if ($seit.Count) { " – seit $(Zt $seit[0].Zeit)" } elseif ($r.Seit) { " – seit $(Zt $r.Seit)" } else { '' }
    if ($r.Aktuell) { "Jetzt angemeldet: $($r.Aktuell)$(Nm $r.Aktuell)$seitText" } else { 'Jetzt angemeldet: niemand' }
    $ab = @($r.Ereignisse | Where-Object { $_ -and $_.Id -eq 7002 })
    if ($an.Count) {
      $l = $an[0]
      $abm = @($ab | Where-Object { $_.Konto -eq $l.Konto -and [datetime]$_.Zeit -gt [datetime]$l.Zeit } | Sort-Object { [datetime]$_.Zeit } | Select-Object -First 1)
      $zusatz = if ($abm.Count) { ", abgemeldet am $(Zt $abm[0].Zeit)" } elseif ($r.Aktuell -and $r.Aktuell -eq $l.Konto) { ' (noch angemeldet)' } else { '' }
      "Zuletzt angemeldet: $($l.Konto)$(Nm $l.Konto) am $(Zt $l.Zeit)$zusatz"
      $weitere = @($an | Group-Object Konto | ForEach-Object { $_.Group[0] } | Where-Object { $_.Konto -ne $l.Konto } | Select-Object -First 4)
      if ($weitere.Count) { 'Davor angemeldet:'; foreach ($w in $weitere) { "  - $($w.Konto)$(Nm $w.Konto): zuletzt am $(Zt $w.Zeit)" } }
    } elseif ($r.LetzterSam) {
      "Zuletzt angemeldet: $($r.LetzterSam)$(if ($r.LetzterName) { " ($($r.LetzterName))" } else { Nm $r.LetzterSam })"
      if ($r.Profil) { "Wann: ungefähr – Profil zuletzt gespeichert am $(Zt $r.Profil)" } else { 'Wann: unbekannt' }
    } else { 'Zuletzt angemeldet: keine Anmeldung gefunden' }
    if ($r.Fehler) { "(Systemprotokoll nicht lesbar: $($r.Fehler))" } elseif ($r.Erstes) { "(Systemprotokoll reicht zurück bis $(Zt $r.Erstes))" }
  }
}`

/**
 * Wann wurde das Passwort zuletzt geändert? Für den jetzt (sonst zuletzt) angemeldeten Benutzer des PCs: pwdLastSet
 * und Ablauf (msDS-UserPasswordExpiryTimeComputed, berücksichtigt auch abweichende Kennwortrichtlinien) — per ADSI,
 * also ohne AD-Modul. Dazu das Computerkonto-Passwort (wechselt Windows selbst). Nicht erreichbar → sofort Meldung.
 */
const SKRIPT_PASSWORT = BAUSTEINE + String.raw`
$sam = $null; $quelle = ''; $hinweis = ''
if (-not (Erreichbar $h)) { $hinweis = 'PC nicht erreichbar (ausgeschaltet, nicht im Netz oder WinRM gesperrt) – angemeldeter Benutzer nicht ermittelbar.' }
else {
  try {
    $r = Invoke-Command -ComputerName $h -SessionOption $so -ErrorAction Stop -ScriptBlock {
      $a = try { (Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).UserName } catch { $null }
      $lp = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Authentication\LogonUI' -ErrorAction SilentlyContinue
      [pscustomobject]@{ A = $a; L = $lp.LastLoggedOnSAMUser }
    }
    if ($r.A) { $sam = $r.A; $quelle = 'jetzt angemeldet' } elseif ($r.L) { $sam = $r.L; $quelle = 'zuletzt angemeldet' }
  } catch { $hinweis = "PC antwortet, aber die WinRM-Verbindung ist fehlgeschlagen: $($_.Exception.Message)" }
}
if ($hinweis) { $hinweis }
if ($sam) {
  $s = (($sam -split '\\')[-1]) -replace '[^A-Za-z0-9._-]', ''
  $u = Lies "(&(objectCategory=person)(objectClass=user)(sAMAccountName=$s))" @('displayname', 'pwdlastset', 'useraccountcontrol', 'distinguishedname')
  if ($u) {
    $p = $u.Properties
    $nm = if ($p['displayname'].Count) { " ($($p['displayname'][0]))" } else { '' }
    "Benutzer: $sam$nm – $quelle"
    $pls = [int64]$p['pwdlastset'][0]
    if ($pls -gt 0) { $d = [datetime]::FromFileTime($pls); "Passwort zuletzt geändert: $($d.ToString('dd.MM.yyyy HH:mm')) (vor $([int][math]::Floor(((Get-Date) - $d).TotalDays)) Tagen)" }
    else { 'Passwort zuletzt geändert: – (muss bei der nächsten Anmeldung geändert werden)' }
    if (([int64]$p['useraccountcontrol'][0]) -band 0x10000) { 'Ablauf: Passwort läuft nie ab' }
    else {
      try {
        $b = New-Object DirectoryServices.DirectorySearcher([adsi]"LDAP://$($p['distinguishedname'][0])")
        $b.SearchScope = 'Base'; [void]$b.PropertiesToLoad.Add('msDS-UserPasswordExpiryTimeComputed')
        $x = $b.FindOne().Properties['msds-userpasswordexpirytimecomputed']
        if ($x.Count) {
          $ex = [int64]$x[0]
          if ($ex -gt 0 -and $ex -lt [int64]::MaxValue) {
            $ed = [datetime]::FromFileTime($ex); $rest = [int][math]::Floor(($ed - (Get-Date)).TotalDays)
            if ($ed -lt (Get-Date)) { "Ablauf: abgelaufen seit $($ed.ToString('dd.MM.yyyy HH:mm'))" } else { "Ablauf: $($ed.ToString('dd.MM.yyyy HH:mm')) (in $rest Tagen)" }
          } else { 'Ablauf: Passwort läuft nie ab' }
        }
      } catch {}
    }
  } else { "Benutzer: $sam – im AD nicht gefunden" }
} elseif (-not $hinweis) { 'Benutzer: niemand angemeldet und kein zuletzt angemeldeter Benutzer bekannt' }
$c = PcImAd
if ($c -and $c.Properties['pwdlastset'].Count) { "Computerkonto-Passwort (wechselt Windows selbst, etwa alle 30 Tage): $(Zt ([datetime]::FromFileTime([int64]$c.Properties['pwdlastset'][0])))" }`

export const QUERY_DEFINITIONS: QueryDefinition[] = [
  // ── Netzwerk & Erreichbarkeit ──────────────────────────────────────────────
  {
    id: 'net_ping',
    label: 'Gerät online? (Ping)',
    adminOnly: false,
    category: 'Netzwerk & Erreichbarkeit',
    psCommand: (h) =>
      `$r=Test-Connection -ComputerName "${h}" -Count 2 -Quiet; if($r){"ONLINE"}else{"OFFLINE"}`,
  },
  {
    id: 'net_ip',
    label: 'IP-Adresse',
    adminOnly: false,
    category: 'Netzwerk & Erreichbarkeit',
    psCommand: (h) =>
      `try{(Resolve-DnsName "${h}" -ErrorAction Stop | Where-Object{$_.Type -eq "A"} | Select-Object -First 1).IPAddress}catch{"Nicht auflösbar"}`,
  },
  {
    id: 'net_mac',
    label: 'MAC-Adresse',
    adminOnly: false,
    category: 'Netzwerk & Erreichbarkeit',
    psCommand: (h) =>
      `Get-WmiObject -Class Win32_NetworkAdapterConfiguration -ComputerName "${h}" -ErrorAction SilentlyContinue | Where-Object{$_.IPEnabled} | Select-Object -First 1 -ExpandProperty MACAddress`,
  },
  {
    id: 'net_adapter',
    label: 'Netzwerkadapter & Verbindungstyp',
    adminOnly: false,
    category: 'Netzwerk & Erreichbarkeit',
    psCommand: (h) =>
      `Get-WmiObject -Class Win32_NetworkAdapterConfiguration -ComputerName "${h}" -ErrorAction SilentlyContinue | Where-Object{$_.IPEnabled} | Select-Object Description,IPAddress,DefaultIPGateway | ConvertTo-Json -Compress`,
  },
  {
    id: 'net_ports',
    label: 'Offene Ports prüfen',
    adminOnly: false,
    category: 'Netzwerk & Erreichbarkeit',
    psCommand: (h) =>
      `@(80,443,3389,445,22) | ForEach-Object{ $p=$_; $r=Test-NetConnection -ComputerName "${h}" -Port $_ -WarningAction SilentlyContinue -InformationLevel Quiet; "$p/tcp: $(if($r){'offen'}else{'geschlossen'})" } | Out-String`,
  },
  {
    id: 'net_dns',
    label: 'DNS-Einträge',
    adminOnly: false,
    category: 'Netzwerk & Erreichbarkeit',
    psCommand: (h) =>
      `try{Resolve-DnsName "${h}" -ErrorAction Stop | Select-Object Name,Type,IPAddress,NameHost | ConvertTo-Json -Compress}catch{"Kein DNS-Eintrag gefunden"}`,
  },
  {
    id: 'net_lastonline',
    label: 'Letztes Online-Datum (AD)',
    adminOnly: false,
    category: 'Netzwerk & Erreichbarkeit',
    psCommand: (h) =>
      `try{$c=Get-ADComputer "${h}" -Properties lastLogonTimestamp -ErrorAction Stop; [DateTime]::FromFileTime($c.lastLogonTimestamp).ToString("dd.MM.yyyy HH:mm:ss")}catch{"AD nicht verfügbar oder Computer nicht gefunden"}`,
  },
  {
    id: 'net_vpn',
    label: 'VPN-Status',
    adminOnly: false,
    category: 'Netzwerk & Erreichbarkeit',
    psCommand: (h) =>
      `Get-VpnConnection -AllUserConnection -ErrorAction SilentlyContinue | Select-Object Name,ConnectionStatus,ServerAddress | ConvertTo-Json -Compress`,
  },

  // ── System & Hardware (ADMIN) ──────────────────────────────────────────────
  {
    id: 'sys_os',
    label: 'Betriebssystem & Build-Version',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `Get-CimInstance -ClassName Win32_OperatingSystem -ComputerName "${h}" -ErrorAction Stop | Select-Object Caption,Version,BuildNumber,OSArchitecture,LastBootUpTime | ConvertTo-Json -Compress`,
  },
  {
    id: 'sys_cpu_load',
    label: 'CPU-Auslastung (live)',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `(Get-WmiObject -Class Win32_Processor -ComputerName "${h}" -ErrorAction Stop | Measure-Object -Property LoadPercentage -Average).Average.ToString() + " %"`,
  },
  {
    id: 'sys_ram',
    label: 'RAM-Auslastung',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `$os=Get-CimInstance Win32_OperatingSystem -ComputerName "${h}" -ErrorAction Stop; $total=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $free=[math]::Round($os.FreePhysicalMemory/1MB,2); $used=[math]::Round($total-$free,2); "Gesamt: $($total) GB | Frei: $($free) GB | Belegt: $($used) GB"`,
  },
  {
    id: 'sys_disk',
    label: 'Festplatten & freier Speicher',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `Get-WmiObject -Class Win32_LogicalDisk -ComputerName "${h}" -Filter "DriveType=3" -ErrorAction Stop | Select-Object DeviceID,@{N="Gesamt_GB";E={[math]::Round($_.Size/1GB,1)}},@{N="Frei_GB";E={[math]::Round($_.FreeSpace/1GB,1)}} | ConvertTo-Json -Compress`,
  },
  {
    id: 'sys_bios',
    label: 'BIOS/UEFI Version & Seriennummer',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `Get-WmiObject Win32_BIOS -ComputerName "${h}" -ErrorAction Stop | Select-Object Manufacturer,Name,SMBIOSBIOSVersion,SerialNumber,ReleaseDate | ConvertTo-Json -Compress`,
  },
  {
    id: 'sys_uptime',
    label: 'Uptime / Letzter Neustart',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `$os=Get-CimInstance Win32_OperatingSystem -ComputerName "${h}" -ErrorAction Stop; $uptime=(Get-Date)-$os.LastBootUpTime; "Letzter Neustart: $($os.LastBootUpTime.ToString('dd.MM.yyyy HH:mm:ss')) | Uptime: $([math]::Floor($uptime.TotalDays))d $($uptime.Hours)h $($uptime.Minutes)m"`,
  },
  {
    id: 'sys_model',
    label: 'Modell & Hersteller',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `Get-WmiObject Win32_ComputerSystem -ComputerName "${h}" -ErrorAction Stop | Select-Object Manufacturer,Model,SystemType | ConvertTo-Json -Compress`,
  },
  {
    id: 'sys_ram_modules',
    label: 'Installierte RAM-Module',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `Get-WmiObject Win32_PhysicalMemory -ComputerName "${h}" -ErrorAction Stop | Select-Object BankLabel,@{N="Kapazität_GB";E={[math]::Round($_.Capacity/1GB,1)}},Speed,Manufacturer | ConvertTo-Json -Compress`,
  },
  {
    id: 'sys_cpu_model',
    label: 'CPU-Modell & Kerne',
    adminOnly: true,
    category: 'System & Hardware',
    psCommand: (h) =>
      `Get-WmiObject Win32_Processor -ComputerName "${h}" -ErrorAction Stop | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed | ConvertTo-Json -Compress`,
  },

  // ── Active Directory & Benutzer (ADMIN) ───────────────────────────────────
  {
    id: 'ad_user',
    label: 'Aktuell angemeldeter Benutzer',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) =>
      `try{(Get-WmiObject Win32_ComputerSystem -ComputerName "${h}" -ErrorAction Stop).UserName}catch{"Nicht verfügbar"}`,
  },
  {
    id: 'ad_lastlogon',
    label: 'Zuletzt angemeldeter Benutzer (wer & wann)',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) => mitHost(SKRIPT_LETZTE_ANMELDUNG, h),
  },
  {
    id: 'ad_pwd',
    label: 'Passwort zuletzt geändert',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) => mitHost(SKRIPT_PASSWORT, h),
  },
  {
    id: 'ad_details',
    label: 'AD-Computerobjekt Details',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) =>
      `try{Get-ADComputer "${h}" -Properties * -ErrorAction Stop | Select-Object Name,DNSHostName,Enabled,OperatingSystem,OperatingSystemVersion,Created,Modified,Description | ConvertTo-Json -Compress}catch{"AD-Modul nicht verfügbar"}`,
  },
  {
    id: 'ad_ou',
    label: 'OU-Zugehörigkeit',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) =>
      `try{(Get-ADComputer "${h}" -ErrorAction Stop).DistinguishedName}catch{"AD nicht verfügbar"}`,
  },
  {
    id: 'ad_sync',
    label: 'Letzte AD-Synchronisation',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) =>
      `try{$c=Get-ADComputer "${h}" -Properties lastLogonTimestamp,pwdLastSet -ErrorAction Stop; "lastLogonTimestamp: $([DateTime]::FromFileTime($c.lastLogonTimestamp).ToString('dd.MM.yyyy HH:mm')) | pwdLastSet: $([DateTime]::FromFileTime($c.pwdLastSet).ToString('dd.MM.yyyy HH:mm'))"}catch{"AD nicht verfügbar"}`,
  },
  {
    id: 'ad_bitlocker',
    label: 'BitLocker Status',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) =>
      `manage-bde -status -ComputerName "${h}" 2>&1`,
  },
  {
    id: 'ad_gpo',
    label: 'Gruppenrichtlinien (gpresult)',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) =>
      `gpresult /S "${h}" /r 2>&1`,
  },
  {
    id: 'ad_localadmins',
    label: 'Lokale Administratoren',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) =>
      `Get-LocalGroupMember -ComputerName "${h}" -Group "Administrators" -ErrorAction SilentlyContinue | Select-Object Name,PrincipalSource,ObjectClass | ConvertTo-Json -Compress`,
  },
  {
    id: 'ad_certs',
    label: 'Computerzertifikate',
    adminOnly: true,
    category: 'Active Directory & Benutzer',
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {Get-ChildItem Cert:\\LocalMachine\\My | Select-Object Subject,Issuer,NotAfter,Thumbprint} -ErrorAction SilentlyContinue | ConvertTo-Json -Compress`,
  },

  // ── Sicherheit & Compliance (ADMIN) ───────────────────────────────────────
  {
    id: 'sec_defender',
    label: 'Windows Defender Status',
    adminOnly: true,
    category: 'Sicherheit & Compliance',
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {Get-MpComputerStatus | Select-Object AMServiceEnabled,AntispywareEnabled,AntivirusEnabled,RealTimeProtectionEnabled,AntivirusSignatureLastUpdated} -ErrorAction SilentlyContinue | ConvertTo-Json -Compress`,
  },
  {
    id: 'sec_firewall',
    label: 'Firewall Status',
    adminOnly: true,
    category: 'Sicherheit & Compliance',
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction} -ErrorAction SilentlyContinue | ConvertTo-Json -Compress`,
  },
  {
    id: 'sec_pending_updates',
    label: 'Ausstehende Windows Updates',
    adminOnly: true,
    category: 'Sicherheit & Compliance',
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {if(Get-Module -ListAvailable PSWindowsUpdate){Import-Module PSWindowsUpdate; Get-WUList | Select-Object Title,Size,MsrcSeverity | ConvertTo-Json -Compress}else{"PSWindowsUpdate-Modul nicht installiert"}} -ErrorAction SilentlyContinue`,
  },
  {
    id: 'sec_updates',
    label: 'Letzte Windows Updates',
    adminOnly: true,
    category: 'Sicherheit & Compliance',
    psCommand: (h) =>
      `Get-HotFix -ComputerName "${h}" -ErrorAction SilentlyContinue | Sort-Object InstalledOn -Descending | Select-Object -First 15 HotFixID,Description,InstalledOn | ConvertTo-Json -Compress`,
  },
  {
    id: 'sec_uac',
    label: 'UAC Status',
    adminOnly: true,
    category: 'Sicherheit & Compliance',
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {(Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System).EnableLUA} -ErrorAction SilentlyContinue`,
  },
  {
    id: 'sec_autostart',
    label: 'Autostart-Programme',
    adminOnly: true,
    category: 'Sicherheit & Compliance',
    psCommand: (h) =>
      `Get-CimInstance Win32_StartupCommand -ComputerName "${h}" -ErrorAction SilentlyContinue | Select-Object Name,Command,Location,User | ConvertTo-Json -Compress`,
  },
  {
    id: 'sec_services',
    label: 'Dienste',
    adminOnly: true,
    category: 'Sicherheit & Compliance',
    psCommand: (h) =>
      `Get-Service -ComputerName "${h}" -ErrorAction SilentlyContinue | Select-Object Name,DisplayName,@{N='Status';E={$_.Status.ToString()}},@{N='StartType';E={$_.StartType.ToString()}} | Sort-Object DisplayName | ConvertTo-Json -Compress`,
  },

  // ── Software & Anwendungen (ADMIN) ────────────────────────────────────────
  {
    id: 'sw_installed',
    label: 'Installierte Software',
    adminOnly: true,
    category: 'Software & Anwendungen',
    // PROBLEM 3 FIX: Alle 3 Quellen abfragen:
    // 1. HKLM 64-bit + 32-bit (systemweite Installationen)
    // 2. HKU per SID-Enumeration via ProfileList: findet Software aller aktuell
    //    angemeldeten Benutzer (deren Hive ist in HKU automatisch geladen).
    //    Zuverlässiger als reg load/unload weil keine DAT-Dateien geöffnet werden müssen.
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock { $r=@(); $r+=Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -EA SilentlyContinue; $r+=Get-ItemProperty 'HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -EA SilentlyContinue; $sids=(Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' -EA SilentlyContinue).PSChildName; foreach($sid in $sids){$r+=Get-ItemProperty "registry::HKU\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" -EA SilentlyContinue}; $r | Where-Object{$_.DisplayName} | Select-Object DisplayName,DisplayVersion,Publisher,InstallDate | Sort-Object DisplayName -Unique | ConvertTo-Json -Compress -Depth 2 } -ErrorAction SilentlyContinue`,
  },
  {
    id: 'sw_office',
    label: 'Office-Version & Lizenz',
    adminOnly: true,
    category: 'Software & Anwendungen',
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {$o=Get-ItemProperty "HKLM:\\SOFTWARE\\Microsoft\\Office\\ClickToRun\\Configuration" -ErrorAction SilentlyContinue; if($o){"Version: $($o.VersionToReport) | Kanal: $($o.UpdateChannel) | Lizenz: $($o.LicenseType)"}else{"Office nicht gefunden"}} -ErrorAction SilentlyContinue`,
  },
  {
    id: 'sw_recent',
    label: 'Zuletzt installierte Programme',
    adminOnly: true,
    category: 'Software & Anwendungen',
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {Get-ItemProperty "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*" -ErrorAction SilentlyContinue | Where-Object{$_.InstallDate -and $_.DisplayName} | Sort-Object InstallDate -Descending | Select-Object -First 10 DisplayName,DisplayVersion,InstallDate} -ErrorAction SilentlyContinue | ConvertTo-Json -Compress`,
  },
  {
    id: 'sw_tasks',
    label: 'Geplante Tasks',
    adminOnly: true,
    category: 'Software & Anwendungen',
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object{$_.State -ne "Disabled"} | Select-Object TaskName,TaskPath,State | Select-Object -First 30} -ErrorAction SilentlyContinue | ConvertTo-Json -Compress`,
  },

  // ── Ereignisprotokoll (ADMIN) ─────────────────────────────────────────────
  {
    id: 'ev_errors',
    label: 'Letzte Fehler-Events',
    adminOnly: true,
    category: 'Ereignisprotokoll',
    psCommand: (h) =>
      `Get-EventLog -ComputerName "${h}" -LogName System -Newest 20 -EntryType Error -ErrorAction SilentlyContinue | Select-Object TimeGenerated,Source,EventID,Message | ConvertTo-Json -Compress`,
  },
  {
    id: 'ev_logins',
    label: 'Login-Ereignisse (4624/4625)',
    adminOnly: true,
    category: 'Ereignisprotokoll',
    psCommand: (h) =>
      `Get-WinEvent -ComputerName "${h}" -FilterHashtable @{LogName="Security";Id=4624,4625} -MaxEvents 20 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Id,Message | ConvertTo-Json -Compress`,
  },
  {
    id: 'ev_bsod',
    label: 'Letzte Abstürze / BSOD',
    adminOnly: true,
    category: 'Ereignisprotokoll',
    psCommand: (h) =>
      `Get-WinEvent -ComputerName "${h}" -FilterHashtable @{LogName="System";Id=41,1001,6008} -MaxEvents 10 -ErrorAction SilentlyContinue | Select-Object TimeCreated,Id,Message | ConvertTo-Json -Compress`,
  },

  // ── Nachrichten versenden (ADMIN) ─────────────────────────────────────────
  {
    id: 'msg_screen',
    label: 'Bildschirmnachricht senden',
    adminOnly: true,
    category: 'Nachrichten versenden',
    // msg.exe erfordert AllowRemoteRPC=1 im Terminal-Server-Registrierungsschlüssel
    // sowie eine aktive Benutzersitzung auf dem Zielgerät.
    // __MSG__ wird zur Laufzeit in QueryMenu durch den eingegebenen Text ersetzt.
    psCommand: (h) =>
      `$online=Test-Connection -ComputerName "${h}" -Count 1 -Quiet -EA SilentlyContinue; if(!$online){"Gerät nicht erreichbar: ${h}"; exit}; try{Invoke-Command -ComputerName "${h}" -ScriptBlock{Set-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -Name AllowRemoteRPC -Value 1 -Type DWord -EA Stop} -EA Stop}catch{}; $ses=cmd /c "query session /server:${h} 2>&1"; $cnt=($ses | Where-Object{$_ -match 'Active'}).Count; $out=cmd /c "msg * /SERVER:${h} /TIME:60 __MSG__ 2>&1"; if($LASTEXITCODE -eq 0){"Nachricht gesendet ($cnt aktive Sitzung(en))"}else{"Fehler: $out | Aktive Sitzungen: $cnt"}`,
  },
  {
    id: 'msg_voice',
    label: 'Sprachnachricht über Lautsprecher senden',
    adminOnly: true,
    category: 'Nachrichten versenden',
    // __MSG__ and __LANG__ are replaced at runtime (single-quote-escaped)
    psCommand: (h) =>
      `Invoke-Command -ComputerName "${h}" -ScriptBlock {param($t,$l);Add-Type -AssemblyName System.Speech;$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;try{$s.SelectVoiceByHints([System.Globalization.CultureInfo]::GetCultureInfo($l))}catch{};$s.Speak($t)} -ArgumentList '__MSG__','__LANG__'`,
  },
]

export const QUERY_CATEGORIES = [
  { key: 'Netzwerk & Erreichbarkeit',  icon: '🌐', adminOnly: false },
  { key: 'System & Hardware',          icon: '💻', adminOnly: true },
  { key: 'Active Directory & Benutzer',icon: '🔐', adminOnly: true },
  { key: 'Sicherheit & Compliance',    icon: '🛡️', adminOnly: true },
  { key: 'Software & Anwendungen',     icon: '📦', adminOnly: true },
  { key: 'Ereignisprotokoll',          icon: '📅', adminOnly: true },
  { key: 'Nachrichten versenden',      icon: '📢', adminOnly: true },
]
