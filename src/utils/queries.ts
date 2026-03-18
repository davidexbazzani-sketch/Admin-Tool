import type { QueryDefinition } from '../types'

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
      `$os=Get-CimInstance Win32_OperatingSystem -ComputerName "${h}" -ErrorAction Stop; $total=[math]::Round($os.TotalVisibleMemorySize/1MB,2); $free=[math]::Round($os.FreePhysicalMemory/1MB,2); $used=[math]::Round($total-$free,2); "Gesamt: ${total} GB | Frei: ${free} GB | Belegt: ${used} GB"`,
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
    label: 'Laufende Dienste',
    adminOnly: true,
    category: 'Sicherheit & Compliance',
    psCommand: (h) =>
      `Get-Service -ComputerName "${h}" -ErrorAction SilentlyContinue | Where-Object{$_.Status -eq "Running"} | Select-Object Name,DisplayName,StartType | ConvertTo-Json -Compress`,
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
    // PROBLEM 2 FIX: Ping-Test vor dem Senden + /TIME:60 für längere Anzeigedauer.
    // msg.exe erfordert keine speziellen Dienste auf Domain-Maschinen (nutzt RPC/Named Pipes).
    // __MSG__ wird zur Laufzeit in QueryMenu durch den eingegebenen Text ersetzt.
    psCommand: (h) =>
      `$online=Test-Connection -ComputerName "${h}" -Count 1 -Quiet -ErrorAction SilentlyContinue; if($online){ $out=cmd /c "msg * /SERVER:${h} /TIME:60 __MSG__ 2>&1"; if($LASTEXITCODE -eq 0){"Nachricht gesendet"}else{"Fehler: $out"} }else{"Gerät nicht erreichbar: ${h}"}`,
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
