// ── Central Remote Command Registry ─────────────────────────────────────────
// Single source of truth for all remote commands.
// Used by both RemoteDoc.tsx and ScheduledTasks.tsx

export type ActionType = 'read' | 'write' | 'critical'

export interface CmdDef {
  id: string
  func: string
  when: string
  buildCmd: (hostname: string, input?: string) => string
  action: ActionType
  input?: { type: 'text' | 'dropdown' | 'service'; placeholder?: string; options?: string[] }
  templates?: { label: string; value: string }[]  // quick-fill buttons shown below input
  local?: boolean        // runs on admin PC, not remote
  longRunning?: boolean
  privacyConsent?: boolean  // show consent dialog before executing (screenshot)
  fileAction?: 'install' | 'transfer'  // open file dialog first, path passed as input
}

export interface Category {
  id: string
  label: string
  commands: CmdDef[]
}

// ── Helper to wrap a PS script block for remote execution ────────────────────
export function remote(hostname: string, script: string): string {
  return [
    `try {`,
    `  $r = Invoke-Command -ComputerName '${hostname}' -ScriptBlock { ${script} } -EA Stop`,
    `  if ($r -ne $null) { $r | ConvertTo-Json -Depth 4 -Compress } else { Write-Output '"OK"' }`,
    `} catch { Write-Output """ERR:$($_.Exception.Message)""" }`,
  ].join('\n')
}

// ── PS to run a cmd line locally (admin PC) ───────────────────────────────────
export function local(cmd: string): string {
  return `try { ${cmd} } catch { Write-Output "ERR:$($_.Exception.Message)" }`
}

// ── 20 Categories ─────────────────────────────────────────────────────────────
function buildCategories(): Category[] {
  return [
    // ── 1: Netzwerk & Konnektivität ──────────────────────────────────────────
    {
      id: 'net', label: 'Netzwerk & Konnektivität',
      commands: [
        { id: 'ping', func: 'Ping', when: 'Erste Diagnose ob PC an ist',
          buildCmd: (h) => local(`ping ${h}`), action: 'read' },
        { id: 'ping10', func: 'Erweiterter Ping (10x)', when: 'Paketverluste erkennen',
          buildCmd: (h) => remote(h, `Test-Connection -ComputerName $env:COMPUTERNAME -Count 10 | Select-Object Address,ResponseTime,StatusCode | ConvertTo-Json -Compress`),
          action: 'read' },
        { id: 'tracert', func: 'Netzwerkpfad verfolgen', when: 'Routing-Probleme',
          buildCmd: (h) => local(`tracert ${h}`), action: 'read', longRunning: true },
        { id: 'ipconfig', func: 'Komplette Netzwerkkonfiguration', when: 'IP, Gateway, DNS, DHCP',
          buildCmd: (h) => remote(h, `ipconfig /all`), action: 'read' },
        { id: 'flushdns', func: 'DNS-Cache leeren', when: 'Webseiten nicht erreichbar',
          buildCmd: (h) => remote(h, `ipconfig /flushdns; Write-Output "DNS-Cache geleert"`), action: 'write' },
        { id: 'ipreset', func: 'IP-Adresse erneuern (DHCP)', when: 'IP-Konflikt beheben',
          buildCmd: (h) => remote(h, `ipconfig /release; Start-Sleep 2; ipconfig /renew; ipconfig | Select-String 'IPv4'`), action: 'write' },
        { id: 'regdns', func: 'DNS-Registrierung erneuern', when: 'PC im DNS falsch aufgelöst',
          buildCmd: (h) => remote(h, `ipconfig /registerdns; Write-Output "DNS-Registrierung erneuert"`), action: 'write' },
        { id: 'winsock', func: 'Winsock zurücksetzen', when: 'Netzwerk nach Malware/Treibern',
          buildCmd: (h) => remote(h, `netsh winsock reset; Write-Output "Winsock zurückgesetzt – Neustart erforderlich"`), action: 'critical' },
        { id: 'tcpreset', func: 'TCP/IP-Stack zurücksetzen', when: 'Kein Internet trotz Verbindung',
          buildCmd: (h) => remote(h, `netsh int ip reset; Write-Output "TCP/IP zurückgesetzt – Neustart erforderlich"`), action: 'critical' },
        { id: 'nslookup', func: 'DNS-Auflösung testen', when: 'DNS funktioniert?',
          buildCmd: (h, i) => remote(h, `nslookup ${i || 'google.com'}`), action: 'read',
          input: { type: 'text', placeholder: 'Domain (z.B. google.com)' } },
        { id: 'arp', func: 'ARP-Tabelle anzeigen', when: 'Doppelte MACs finden',
          buildCmd: (h) => remote(h, `arp -a`), action: 'read' },
        { id: 'netstat', func: 'Aktive Verbindungen + Ports', when: 'Verdächtige Verbindungen',
          buildCmd: (h) => remote(h, `netstat -ano`), action: 'read' },
        { id: 'route', func: 'Routing-Tabelle', when: 'Routing-Probleme',
          buildCmd: (h) => remote(h, `route print`), action: 'read' },
        { id: 'getadapter', func: 'Netzwerkadapter anzeigen', when: 'Adapter aktiv/getrennt?',
          buildCmd: (h) => remote(h, `Get-NetAdapter | Select-Object Name,Status,LinkSpeed,MacAddress | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'adapter_toggle', func: 'Adapter aktivieren/deaktivieren', when: '„Kabel raus/rein" remote',
          buildCmd: (h, i) => {
            const parts = (i || '').split('|')
            const name = (parts[0] || '').trim()
            const act = (parts[1] || 'Enable').trim()
            return remote(h, `${act}-NetAdapter -Name '${name}' -Confirm:$false; Write-Output "${act} OK: ${name}"`)
          }, action: 'write', input: { type: 'text', placeholder: 'Adaptername|Enable oder Disable' } },
        { id: 'ipaddress', func: 'Alle IP-Adressen', when: 'Mehrere NICs / VPN',
          buildCmd: (h) => remote(h, `Get-NetIPAddress | Select-Object InterfaceAlias,IPAddress,PrefixLength,AddressFamily | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'testport', func: 'Port-Konnektivität testen', when: 'Dienst/Port erreichbar?',
          buildCmd: (_h, i) => {
            const parts = (i || '').split(':')
            const target = parts[0]?.trim() || ''
            const port = parseInt(parts[1] || '443', 10)
            return local(`Test-NetConnection -ComputerName '${target}' -Port ${port} | Select-Object ComputerName,RemotePort,TcpTestSucceeded | ConvertTo-Json -Compress`)
          }, action: 'read', input: { type: 'text', placeholder: 'Ziel:Port (z.B. 8.8.8.8:53)' } },
      ],
    },
    // ── 2: Gruppenrichtlinien & Updates ─────────────────────────────────────
    {
      id: 'gpo', label: 'Gruppenrichtlinien & Updates',
      commands: [
        { id: 'gpupdate', func: 'GPO neu anwenden', when: 'Nach GPO-Änderungen',
          buildCmd: (h) => remote(h, `gpupdate /force; Write-Output "GPO erfolgreich aktualisiert"`), action: 'write', longRunning: true },
        { id: 'gpresult', func: 'Angewendete GPOs anzeigen', when: 'Welche Richtlinien greifen?',
          buildCmd: (h) => remote(h, `gpresult /r 2>&1`), action: 'read' },
        { id: 'gphtml', func: 'GPO-Report als HTML', when: 'Detaillierte GPO-Analyse',
          buildCmd: (h) => remote(h, `gpresult /h C:\\temp\\gpreport.html /f; Write-Output "Report gespeichert: C:\\temp\\gpreport.html"`), action: 'write' },
        { id: 'usoscan', func: 'Update Scan starten', when: 'Update-Erkennung anstoßen',
          buildCmd: (h) => remote(h, `UsoClient StartScan; Write-Output "Scan gestartet"`), action: 'write' },
        { id: 'usodown', func: 'Updates herunterladen', when: 'Updates manuell laden',
          buildCmd: (h) => remote(h, `UsoClient StartDownload; Write-Output "Download gestartet"`), action: 'write' },
        { id: 'usoinst', func: 'Updates installieren', when: 'Updates remote installieren',
          buildCmd: (h) => remote(h, `UsoClient StartInstall; Write-Output "Installation gestartet"`), action: 'write' },
        { id: 'hotfix', func: 'Installierte Updates', when: 'Patch vorhanden?',
          buildCmd: (h) => remote(h, `Get-HotFix | Select-Object HotFixID,Description,InstalledOn | Sort-Object InstalledOn -Descending | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hotfixid', func: 'Bestimmtes Update suchen', when: 'Gezielt KB prüfen',
          buildCmd: (h, i) => remote(h, `$hf = Get-HotFix -Id '${i || 'KB000000'}' -EA SilentlyContinue; if ($hf) { $hf | Select-Object HotFixID,Description,InstalledOn | ConvertTo-Json -Compress } else { Write-Output '"Nicht gefunden"' }`),
          action: 'read', input: { type: 'text', placeholder: 'KB-Nummer z.B. KB5034441' } },
        { id: 'winupdlog', func: 'Update-Log generieren', when: 'Update-Fehler diagnostizieren',
          buildCmd: (h) => remote(h, `Get-WindowsUpdateLog; Write-Output "Log generiert: C:\\Windows\\Logs\\WindowsUpdate.log"`), action: 'read', longRunning: true },
      ],
    },
    // ── 3: System-Reparatur & Diagnose ───────────────────────────────────────
    {
      id: 'repair', label: 'System-Reparatur & Diagnose',
      commands: [
        { id: 'sfc', func: 'Systemdateien prüfen/reparieren', when: 'Bluescreens, korrupte Dateien',
          buildCmd: (h) => remote(h, `sfc /scannow 2>&1`), action: 'write', longRunning: true },
        { id: 'dism', func: 'Windows-Image reparieren', when: 'sfc kann Fehler nicht fixen',
          buildCmd: (h) => remote(h, `DISM /Online /Cleanup-Image /RestoreHealth 2>&1`), action: 'write', longRunning: true },
        { id: 'dismcheck', func: 'Image-Schnellcheck', when: 'Schnelle Diagnose',
          buildCmd: (h) => remote(h, `DISM /Online /Cleanup-Image /CheckHealth 2>&1`), action: 'read', longRunning: true },
        { id: 'chkdsk', func: 'Festplatte prüfen', when: 'Festplattenfehler, Abstürze',
          buildCmd: (h) => remote(h, `chkdsk C: /f /r /x 2>&1`), action: 'critical', longRunning: true },
        { id: 'evtsys', func: 'Letzte System-Events', when: 'Systemfehler nachverfolgen',
          buildCmd: (h) => remote(h, `Get-EventLog -LogName System -Newest 50 | Select-Object TimeGenerated,EntryType,Source,Message | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'evtapp', func: 'Letzte App-Fehler', when: 'App-Abstürze diagnostizieren',
          buildCmd: (h) => remote(h, `Get-EventLog -LogName Application -EntryType Error -Newest 20 | Select-Object TimeGenerated,Source,Message | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'evtcrit', func: 'Kritische Fehler (24h)', when: 'Schneller Problemüberblick',
          buildCmd: (h) => remote(h, `$t=(Get-Date).AddHours(-24); Get-WinEvent -FilterHashtable @{LogName='System','Application';Level=2;StartTime=$t} -MaxEvents 30 -EA SilentlyContinue | Select-Object TimeCreated,LevelDisplayName,ProviderName,Message | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'evtclear', func: 'Event-Log leeren', when: 'Nach Fehlerbehebung',
          buildCmd: (h, i) => remote(h, `Clear-EventLog -LogName '${i || 'System'}'; Write-Output "Log '${i || 'System'}' geleert"`),
          action: 'critical', input: { type: 'dropdown', options: ['System', 'Application', 'Security'] } },
        { id: 'repairvol', func: 'Laufwerk scannen', when: 'Moderne chkdsk-Alternative',
          buildCmd: (h) => remote(h, `Repair-Volume -DriveLetter C -Scan; Write-Output "Scan abgeschlossen"`), action: 'write', longRunning: true },
        { id: 'physicaldisk', func: 'Physische Disks Zustand', when: 'SSD-Wear, Fehler',
          buildCmd: (h) => remote(h, `Get-PhysicalDisk | Select-Object FriendlyName,MediaType,Size,HealthStatus,OperationalStatus | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'getdisk', func: 'Alle Disks Status', when: 'Disk offline/fehlerhaft?',
          buildCmd: (h) => remote(h, `Get-Disk | Select-Object Number,FriendlyName,OperationalStatus,HealthStatus,Size | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },
    // ── 4: Prozesse & Performance ────────────────────────────────────────────
    {
      id: 'procs', label: 'Prozesse & Performance',
      commands: [
        { id: 'topcpu', func: 'Top 20 CPU-Prozesse', when: 'Was belastet CPU?',
          buildCmd: (h) => remote(h, `Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Name,Id,CPU,WorkingSet | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'topram', func: 'Top 20 RAM-Prozesse', when: 'RAM zu hoch',
          buildCmd: (h) => remote(h, `Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 20 Name,Id,CPU,WorkingSet | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'killname', func: 'Prozess beenden (Name)', when: 'App hängt',
          buildCmd: (h, i) => remote(h, `Stop-Process -Name '${i}' -Force -EA Stop; Write-Output "Prozess '${i}' beendet"`),
          action: 'write', input: { type: 'text', placeholder: 'Prozessname z.B. notepad' } },
        { id: 'killpid', func: 'Prozess beenden (PID)', when: 'Gezielt per PID',
          buildCmd: (h, i) => remote(h, `Stop-Process -Id ${i} -Force -EA Stop; Write-Output "PID ${i} beendet"`),
          action: 'write', input: { type: 'text', placeholder: 'PID-Nummer' } },
        { id: 'cpuload', func: 'CPU-Auslastung', when: 'Schnellcheck',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_Processor | Select-Object Name,LoadPercentage,NumberOfCores | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'ramload', func: 'RAM-Auslastung', when: 'Speicher prüfen',
          buildCmd: (h) => remote(h, `$os=Get-CimInstance Win32_OperatingSystem; @{TotalGB=[math]::Round($os.TotalVisibleMemorySize/1MB,1);FreeGB=[math]::Round($os.FreePhysicalMemory/1MB,1);UsedPercent=[math]::Round((($os.TotalVisibleMemorySize-$os.FreePhysicalMemory)/$os.TotalVisibleMemorySize)*100,0)} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'diskfree', func: 'Freier Speicherplatz', when: 'Festplatte voll?',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}},@{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}},@{N='UsedPct';E={[math]::Round((($_.Size-$_.FreeSpace)/$_.Size)*100,0)}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'procuser', func: 'Prozesse mit Username', when: 'Welcher User welche Prozesse',
          buildCmd: (h) => remote(h, `Get-Process -IncludeUserName | Sort-Object CPU -Descending | Select-Object -First 30 Name,Id,CPU,UserName | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'autostart', func: 'Autostart-Programme', when: 'Langsames Hochfahren',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_StartupCommand | Select-Object Name,Command,Location,User | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },
    // ── 5: Dienste / Services — rendered as ServicePanel, no command rows ────
    {
      id: 'svc', label: 'Dienste / Services',
      commands: [
        { id: 'svc-stop', func: 'Dienst stoppen', when: 'Dienst anhalten',
          buildCmd: (h, i) => {
            const names = (i || '').split(',').map(s => s.trim()).filter(Boolean)
            const script = names.length
              ? names.map(n => `Stop-Service -Name '${n}' -Force -EA Stop; Write-Output "Gestoppt: ${n}"`).join('; ')
              : `Write-Output "Keine Dienste angegeben"`
            return remote(h, script)
          }, action: 'write', input: { type: 'service', placeholder: 'Dienstname' } },
        { id: 'svc-start', func: 'Dienst starten', when: 'Dienst aktivieren',
          buildCmd: (h, i) => {
            const names = (i || '').split(',').map(s => s.trim()).filter(Boolean)
            const script = names.length
              ? names.map(n => `Start-Service -Name '${n}' -EA Stop; Write-Output "Gestartet: ${n}"`).join('; ')
              : `Write-Output "Keine Dienste angegeben"`
            return remote(h, script)
          }, action: 'write', input: { type: 'service', placeholder: 'Dienstname' } },
        { id: 'svc-restart', func: 'Dienst neustarten', when: 'Dienst neu laden',
          buildCmd: (h, i) => {
            const names = (i || '').split(',').map(s => s.trim()).filter(Boolean)
            const script = names.length
              ? names.map(n => `Restart-Service -Name '${n}' -Force -EA Stop; Write-Output "Neugestartet: ${n}"`).join('; ')
              : `Write-Output "Keine Dienste angegeben"`
            return remote(h, script)
          }, action: 'write', input: { type: 'service', placeholder: 'Dienstname' } },
      ],
    },
    // ── 6: Benutzer & Sitzungen ──────────────────────────────────────────────
    {
      id: 'sessions', label: 'Benutzer & Sitzungen',
      commands: [
        { id: 'queryuser', func: 'Angemeldete Benutzer', when: 'Wer ist am PC?',
          buildCmd: (h) => remote(h, `query user 2>&1`), action: 'read' },
        { id: 'querysess', func: 'Alle Sessions', when: 'Getrennte RDP-Sessions',
          buildCmd: (h) => remote(h, `query session 2>&1`), action: 'read' },
        { id: 'logoff', func: 'Benutzer abmelden', when: 'Session beenden',
          buildCmd: (h, i) => remote(h, `logoff ${i}; Write-Output "Session ${i} abgemeldet"`),
          action: 'critical', input: { type: 'text', placeholder: 'Session-ID' } },
        { id: 'msg', func: 'Nachricht senden', when: 'Warnung vor Aktion',
          buildCmd: (h, i) => remote(h, `msg * '${(i || '').replace(/'/g, "''")}'; Write-Output "Nachricht gesendet"`),
          action: 'write', input: { type: 'text', placeholder: 'Nachrichtentext' } },
        { id: 'localadmins', func: 'Lokale Admins', when: 'Wer hat Admin-Rechte?',
          buildCmd: (h) => remote(h, `Get-LocalGroupMember -Group Administrators | Select-Object Name,ObjectClass,PrincipalSource | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'localusers', func: 'Lokale Benutzerkonten', when: 'Accounts auflisten',
          buildCmd: (h) => remote(h, `Get-LocalUser | Select-Object Name,Enabled,LastLogon,PasswordLastSet | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'whoami', func: 'User mit allen Rechten', when: 'Berechtigungsprobleme',
          buildCmd: (h) => remote(h, `whoami /all 2>&1`), action: 'read' },
      ],
    },
    // ── 7: Software & Programme ──────────────────────────────────────────────
    {
      id: 'software', label: 'Software & Programme',
      commands: [
        { id: 'swlist', func: 'Installierte Software', when: 'Software-Inventar',
          buildCmd: (h) => remote(h, `$paths=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); Get-ItemProperty $paths -EA SilentlyContinue | Where-Object {$_.DisplayName} | Select-Object DisplayName,DisplayVersion,Publisher | Sort-Object DisplayName | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'storeapps', func: 'Store Apps anzeigen', when: 'UWP-Apps',
          buildCmd: (h) => remote(h, `Get-AppxPackage | Select-Object Name,PackageFullName,Version | Sort-Object Name | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'removeapp', func: 'Store App deinstallieren', when: 'App entfernen',
          buildCmd: (h, i) => remote(h, `Get-AppxPackage -Name '*${i}*' | Remove-AppxPackage -EA Stop; Write-Output "App entfernt"`),
          action: 'critical', input: { type: 'text', placeholder: 'App-Name (Teilname)' } },
        { id: 'wingetlist', func: 'Winget: Programme listen', when: 'Modernes Inventar',
          buildCmd: (h) => remote(h, `winget list 2>&1`), action: 'read' },
        { id: 'wingetupg', func: 'Winget: Alle updaten', when: 'Updates anstoßen',
          buildCmd: (h) => remote(h, `winget upgrade --all --silent --accept-package-agreements --accept-source-agreements 2>&1`), action: 'write', longRunning: true },
      ],
    },
    // ── 8: Drucker ───────────────────────────────────────────────────────────
    {
      id: 'printer', label: 'Drucker',
      commands: [
        { id: 'getprinter', func: 'Drucker anzeigen', when: 'Diagnostizieren',
          buildCmd: (h) => remote(h, `Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'printjobs', func: 'Druckaufträge anzeigen', when: 'Warteschlange',
          buildCmd: (h, i) => remote(h, `Get-PrintJob -PrinterName '${i || '*'}' -EA SilentlyContinue | Select-Object Id,Document,UserName,JobStatus | ConvertTo-Json -Compress`),
          action: 'read', input: { type: 'text', placeholder: 'Druckername (leer = alle)' } },
        { id: 'deljob', func: 'Druckauftrag löschen', when: 'Hängender Auftrag',
          buildCmd: (h, i) => {
            const p = (i || '').split('|')
            return remote(h, `Remove-PrintJob -PrinterName '${p[0]?.trim()}' -ID ${p[1]?.trim()} -EA Stop; Write-Output "Auftrag gelöscht"`)
          }, action: 'write', input: { type: 'text', placeholder: 'Druckername|Job-ID' } },
        { id: 'clearjobs', func: 'Alle Aufträge löschen', when: 'Warteschlange leeren',
          buildCmd: (h, i) => remote(h, `$jobs=@(Get-PrintJob -PrinterName '${i}' -EA SilentlyContinue); foreach($j in $jobs){Remove-PrintJob -PrinterName '${i}' -ID $j.Id -EA SilentlyContinue}; Write-Output "Alle Aufträge gelöscht"`),
          action: 'write', input: { type: 'text', placeholder: 'Druckername' } },
        { id: 'spooler', func: 'Spooler neustarten', when: 'Universal-Fix',
          buildCmd: (h) => remote(h, `Restart-Service Spooler -Force -EA Stop; Write-Output "Spooler neugestartet"`), action: 'write' },
        { id: 'spoolerclean', func: 'Spooler bereinigen', when: 'Hartnäckige Probleme',
          buildCmd: (h) => remote(h, `Stop-Service Spooler -Force -EA SilentlyContinue; Remove-Item "C:\\Windows\\System32\\spool\\PRINTERS\\*" -Force -EA SilentlyContinue; Start-Service Spooler -EA Stop; Write-Output "Spooler bereinigt und neugestartet"`), action: 'critical' },
        { id: 'addprinter', func: 'Drucker hinzufügen', when: 'Remote installieren',
          buildCmd: (h, i) => remote(h, `Add-Printer -ConnectionName '${i}' -EA Stop; Write-Output "Drucker hinzugefügt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'UNC-Pfad z.B. \\\\server\\drucker' } },
        { id: 'removeprinter', func: 'Drucker entfernen', when: 'Alten löschen',
          buildCmd: (h, i) => remote(h, `Remove-Printer -Name '${i}' -EA Stop; Write-Output "Drucker entfernt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Druckername' } },
      ],
    },
    // ── 9: Festplatte & Speicher ─────────────────────────────────────────────
    {
      id: 'disk', label: 'Festplatte & Speicher',
      commands: [
        { id: 'diskspace', func: 'Laufwerke + Speicherplatz', when: 'Übersicht',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object DeviceID,@{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}},@{N='FreeGB';E={[math]::Round($_.FreeSpace/1GB,1)}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'wintemp', func: 'Windows Temp leeren', when: 'Platz freigeben',
          buildCmd: (h) => remote(h, `Remove-Item "C:\\Windows\\Temp\\*" -Recurse -Force -EA SilentlyContinue; Write-Output "Windows Temp geleert"`), action: 'write' },
        { id: 'usertemp', func: 'Benutzer Temp leeren', when: 'Platz freigeben',
          buildCmd: (h) => remote(h, `Remove-Item "$env:TEMP\\*" -Recurse -Force -EA SilentlyContinue; Write-Output "User Temp geleert"`), action: 'write' },
        { id: 'recycle', func: 'Papierkorb leeren', when: 'Platz freigeben',
          buildCmd: (h) => remote(h, `Clear-RecycleBin -Force -EA SilentlyContinue; Write-Output "Papierkorb geleert"`), action: 'write' },
        { id: 'physdisk2', func: 'Physische Disks', when: 'SSD/HDD Gesundheit',
          buildCmd: (h) => remote(h, `Get-PhysicalDisk | Select-Object FriendlyName,MediaType,Size,HealthStatus,OperationalStatus | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'volumes', func: 'Volumes anzeigen', when: 'Partitionen',
          buildCmd: (h) => remote(h, `Get-Volume | Where-Object {$_.DriveLetter} | Select-Object DriveLetter,FileSystemLabel,FileSystem,@{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}},@{N='FreeGB';E={[math]::Round($_.SizeRemaining/1GB,1)}},HealthStatus | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'defrag', func: 'HDD Defragmentieren', when: 'HDD langsam',
          buildCmd: (h) => remote(h, `Optimize-Volume -DriveLetter C -Defrag -Verbose 2>&1`), action: 'write', longRunning: true },
        { id: 'trim', func: 'SSD TRIM', when: 'SSD optimieren',
          buildCmd: (h) => remote(h, `Optimize-Volume -DriveLetter C -ReTrim -Verbose 2>&1`), action: 'write' },
      ],
    },
    // ── 10: Neustart & Herunterfahren ────────────────────────────────────────
    {
      id: 'reboot', label: 'Neustart & Herunterfahren',
      commands: [
        { id: 'rebootcount', func: 'Neustart mit Countdown', when: 'Geplanter Neustart',
          buildCmd: (h, i) => {
            const p = (i || '60|Neustart in Kürze').split('|')
            const sec = parseInt(p[0] || '60', 10)
            const msg = (p[1] || 'Neustart in Kürze').replace(/'/g, "''")
            return remote(h, `shutdown /r /t ${sec} /c '${msg}'; Write-Output "Neustart geplant in ${sec}s"`)
          }, action: 'critical', input: { type: 'text', placeholder: 'Sekunden|Nachricht z.B. 120|Bitte speichern' } },
        { id: 'rebootnow', func: 'Sofortiger Neustart', when: 'Dringend',
          buildCmd: (h) => remote(h, `shutdown /r /t 0; Write-Output "Neustart wird ausgeführt"`), action: 'critical' },
        { id: 'shutdown', func: 'Herunterfahren', when: 'Remote ausschalten',
          buildCmd: (h) => remote(h, `shutdown /s /t 0; Write-Output "Herunterfahren wird ausgeführt"`), action: 'critical' },
        { id: 'shutdownabort', func: 'Shutdown abbrechen', when: 'Versehentlichen stoppen',
          buildCmd: (h) => remote(h, `shutdown /a; Write-Output "Shutdown abgebrochen"`), action: 'write' },
        { id: 'rebootforce', func: 'Erzwungener Neustart', when: 'Apps blockieren',
          buildCmd: (h) => remote(h, `shutdown /r /f /t 60 /c "Erzwungener Neustart durch Admin"; Write-Output "Erzwungener Neustart in 60s"`), action: 'critical' },
      ],
    },
    // ── 11: Firewall & Sicherheit ────────────────────────────────────────────
    {
      id: 'security', label: 'Firewall & Sicherheit',
      commands: [
        { id: 'fwprofile', func: 'Firewall-Status', when: 'Aktiv?',
          buildCmd: (h) => remote(h, `Get-NetFirewallProfile | Select-Object Name,Enabled,DefaultInboundAction,DefaultOutboundAction | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'fwrules', func: 'Aktive Regeln', when: 'Analysieren',
          buildCmd: (h) => remote(h, `$r=@(Get-NetFirewallRule | Where-Object {$_.Enabled -eq 'True'}); $r | Select-Object DisplayName,Direction,Action,Profile | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'defstatus', func: 'Defender Status', when: 'Virenschutz OK?',
          buildCmd: (h) => remote(h, `Get-MpComputerStatus | Select-Object AMRunningMode,AntivirusEnabled,RealTimeProtectionEnabled,AntispywareSignatureLastUpdated | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'defthreats', func: 'Erkannte Bedrohungen', when: 'Malware?',
          buildCmd: (h) => remote(h, `$t=@(Get-MpThreatDetection -EA SilentlyContinue); if ($t) { $t | Select-Object ThreatName,SeverityID,DetectionTime,ActionSuccess | ConvertTo-Json -Compress } else { Write-Output '"Keine Bedrohungen gefunden"' }`), action: 'read' },
        { id: 'defsigupd', func: 'Signaturen aktualisieren', when: 'Defender updaten',
          buildCmd: (h) => remote(h, `Update-MpSignature -EA Stop; Write-Output "Signaturen aktualisiert"`), action: 'write', longRunning: true },
        { id: 'defscan', func: 'Defender Scan', when: 'Virenprüfung',
          buildCmd: (h, i) => remote(h, `Start-MpScan -ScanType ${i || 'QuickScan'} -EA Stop; Write-Output "Scan gestartet: ${i || 'QuickScan'}"`),
          action: 'write', longRunning: true, input: { type: 'dropdown', options: ['QuickScan', 'FullScan', 'CustomScan'] } },
        { id: 'bitlocker', func: 'BitLocker-Status', when: 'Verschlüsselt?',
          buildCmd: (h) => remote(h, `Get-BitLockerVolume | Select-Object MountPoint,EncryptionMethod,VolumeStatus,ProtectionStatus | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'bitlockerkey', func: 'BitLocker Recovery Key', when: 'User ausgesperrt',
          buildCmd: (h) => remote(h, `(Get-BitLockerVolume -MountPoint C:).KeyProtector | Where-Object {$_.KeyProtectorType -eq 'RecoveryPassword'} | Select-Object KeyProtectorId,RecoveryPassword | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },
    // ── 12: Hardware-Informationen ───────────────────────────────────────────
    {
      id: 'hw', label: 'Hardware-Informationen',
      commands: [
        { id: 'hwcs', func: 'PC-Modell, Hersteller, RAM', when: 'Hardware-Inventar',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,@{N='RAMmGB';E={[math]::Round($_.TotalPhysicalMemory/1GB,0)}},NumberOfProcessors,NumberOfLogicalProcessors | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwbios', func: 'BIOS + Seriennummer', when: 'Garantie/Support',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_BIOS | Select-Object Manufacturer,SMBIOSBIOSVersion,SerialNumber,ReleaseDate | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwcpu', func: 'CPU-Info', when: 'Prozessor, Kerne, Takt',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors,MaxClockSpeed,LoadPercentage | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwram', func: 'RAM-Module Details', when: 'Slots, Module',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_PhysicalMemory | Select-Object Tag,@{N='GB';E={[math]::Round($_.Capacity/1GB,0)}},Speed,Manufacturer,PartNumber | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwgpu', func: 'Grafikkarte', when: 'GPU, Treiber',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,VideoProcessor | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwnic', func: 'Netzwerkadapter (physisch)', when: 'NICs prüfen',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_NetworkAdapter | Where-Object {$_.PhysicalAdapter} | Select-Object Name,MACAddress,AdapterType,Speed | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'hwbat', func: 'Akku-Status (Laptop)', when: 'Akku-Zustand',
          buildCmd: (h) => remote(h, `$b=@(Get-CimInstance Win32_Battery -EA SilentlyContinue); if ($b) { $b | Select-Object Name,EstimatedChargeRemaining,BatteryStatus,EstimatedRunTime | ConvertTo-Json -Compress } else { Write-Output '"Kein Akku gefunden"' }`), action: 'read' },
        { id: 'hwos', func: 'OS-Version + Build', when: 'Windows-Version',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber,OSArchitecture,LastBootUpTime | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'sysinfo', func: 'Komplette Systeminfo', when: 'Alles auf einen Blick',
          buildCmd: (h) => remote(h, `systeminfo 2>&1`), action: 'read', longRunning: true },
        { id: 'baddev', func: 'Fehlerhafte Geräte', when: 'Treiber-Probleme',
          buildCmd: (h) => remote(h, `$d=@(Get-CimInstance Win32_PnPEntity | Where-Object {$_.ConfigManagerErrorCode -ne 0}); if ($d) { $d | Select-Object Name,DeviceID,ConfigManagerErrorCode | ConvertTo-Json -Compress } else { Write-Output '"Keine fehlerhaften Geräte gefunden"' }`), action: 'read' },
      ],
    },
    // ── 13: Netzlaufwerke & Freigaben ────────────────────────────────────────
    {
      id: 'shares', label: 'Netzlaufwerke & Freigaben',
      commands: [
        { id: 'smbshares', func: 'Alle Freigaben', when: 'Welche Ordner?',
          buildCmd: (h) => remote(h, `Get-SmbShare | Select-Object Name,Path,Description | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'smbsess', func: 'Aktive SMB-Verbindungen', when: 'Wer greift zu?',
          buildCmd: (h) => remote(h, `Get-SmbSession | Select-Object ClientComputerName,ClientUserName,NumOpens,SessionId | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'smbopenfiles', func: 'Offene Netzwerkdateien', when: 'Gesperrte finden',
          buildCmd: (h) => remote(h, `Get-SmbOpenFile | Select-Object FileId,ClientComputerName,ClientUserName,Path | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'closesmb', func: 'Netzwerkdatei schließen', when: 'Sperre freigeben',
          buildCmd: (h, i) => remote(h, `Close-SmbOpenFile -FileId ${i} -Force -EA Stop; Write-Output "Datei geschlossen: ID ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'File-ID (aus "Offene Dateien")' } },
        { id: 'netuse', func: 'Gemappte Laufwerke', when: 'Netzlaufwerke',
          buildCmd: (h) => remote(h, `net use 2>&1`), action: 'read' },
      ],
    },
    // ── 14: Geplante Aufgaben ────────────────────────────────────────────────
    {
      id: 'tasks', label: 'Geplante Aufgaben',
      commands: [
        { id: 'tasksall', func: 'Alle Tasks', when: 'Überblick',
          buildCmd: (h) => remote(h, `Get-ScheduledTask | Select-Object TaskName,TaskPath,@{N='State';E={$_.State.ToString()}} | Sort-Object TaskName | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'tasksrun', func: 'Laufende Tasks', when: 'Was läuft gerade?',
          buildCmd: (h) => remote(h, `$t=@(Get-ScheduledTask | Where-Object {$_.State -eq 'Running'}); $t | Select-Object TaskName,TaskPath | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'taskstart', func: 'Task starten', when: 'Sofort ausführen',
          buildCmd: (h, i) => remote(h, `Start-ScheduledTask -TaskName '${i}' -EA Stop; Write-Output "Task gestartet: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'taskstop', func: 'Task stoppen', when: 'Hängenden beenden',
          buildCmd: (h, i) => remote(h, `Stop-ScheduledTask -TaskName '${i}' -EA Stop; Write-Output "Task gestoppt: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'taskdisable', func: 'Task deaktivieren', when: 'Ausschalten',
          buildCmd: (h, i) => remote(h, `Disable-ScheduledTask -TaskName '${i}' -EA Stop; Write-Output "Task deaktiviert: ${i}"`),
          action: 'write', input: { type: 'text', placeholder: 'Task-Name' } },
      ],
    },
    // ── 15: Remote Desktop & Fernzugriff ────────────────────────────────────
    {
      id: 'rdp', label: 'Remote Desktop & Fernzugriff',
      commands: [
        { id: 'rdpopen', func: 'RDP-Verbindung öffnen', when: 'Remote aufschalten',
          buildCmd: (h) => local(`mstsc /v:${h}`), action: 'read', local: true },
        { id: 'rdpenable', func: 'RDP aktivieren', when: 'Remote Desktop einschalten',
          buildCmd: (h) => remote(h, `Set-ItemProperty -Path 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name fDenyTSConnections -Value 0 -EA Stop; Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -EA SilentlyContinue; Write-Output "RDP aktiviert"`), action: 'write' },
        { id: 'rdpfw', func: 'RDP Firewall freigeben', when: 'RDP erlauben',
          buildCmd: (h) => remote(h, `Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' -EA Stop; Write-Output "RDP-Firewall-Regeln aktiviert"`), action: 'write' },
        { id: 'msra', func: 'Remote-Unterstützung', when: 'Helfen ohne Abmeldung',
          buildCmd: (h) => local(`msra /offerRA ${h}`), action: 'read', local: true },
      ],
    },
    // ── 16: Zertifikate ──────────────────────────────────────────────────────
    {
      id: 'certs', label: 'Zertifikate',
      commands: [
        { id: 'compcerts', func: 'Computer-Zertifikate', when: 'VPN/WLAN-Probleme',
          buildCmd: (h) => remote(h, `Get-ChildItem Cert:\\LocalMachine\\My | Select-Object Subject,Thumbprint,NotAfter,Issuer | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'usercerts', func: 'Benutzer-Zertifikate', when: 'Smartcard, E-Mail',
          buildCmd: (h) => remote(h, `Get-ChildItem Cert:\\CurrentUser\\My | Select-Object Subject,Thumbprint,NotAfter,Issuer | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'certenroll', func: 'Auto-Enrollment triggern', when: 'Zertifikate abholen',
          buildCmd: (h) => remote(h, `certutil -pulse 2>&1; Write-Output "Enrollment ausgelöst"`), action: 'write' },
        { id: 'certexpiry', func: 'Bald ablaufende Zertifikate', when: 'Proaktiv erkennen',
          buildCmd: (h) => remote(h, `$d=(Get-Date).AddDays(30); Get-ChildItem Cert:\\LocalMachine\\My | Where-Object {$_.NotAfter -lt $d} | Select-Object Subject,NotAfter,Thumbprint | ConvertTo-Json -Compress`), action: 'read' },
      ],
    },
    // ── 17: DNS & Domäne ─────────────────────────────────────────────────────
    {
      id: 'domain', label: 'DNS & Domäne',
      commands: [
        { id: 'dclist', func: 'Domain Controller anzeigen', when: 'DC-Zuordnung',
          buildCmd: (h) => remote(h, `nltest /dsgetdc:$env:USERDNSDOMAIN 2>&1`), action: 'read' },
        { id: 'scquery', func: 'Secure Channel Status', when: 'Domain-Trust',
          buildCmd: (h) => remote(h, `nltest /sc_query:$env:USERDNSDOMAIN 2>&1`), action: 'read' },
        { id: 'testsc', func: 'Vertrauensstellung testen', when: 'Fehler beheben',
          buildCmd: (h) => remote(h, `$r=Test-ComputerSecureChannel -Verbose 2>&1; Write-Output $r`), action: 'read' },
        { id: 'resetpwd', func: 'Computer-Passwort reset', when: 'Trust reparieren',
          buildCmd: (h) => remote(h, `Reset-ComputerMachinePassword -EA Stop; Write-Output "Computer-Passwort zurückgesetzt"`), action: 'critical' },
        { id: 'aadstatus', func: 'Azure AD Status', when: 'AAD-Join prüfen',
          buildCmd: (h) => remote(h, `dsregcmd /status 2>&1`), action: 'read' },
        { id: 'klist', func: 'Kerberos-Tickets anzeigen', when: 'Auth-Probleme',
          buildCmd: (h) => remote(h, `klist 2>&1`), action: 'read' },
        { id: 'kpurge', func: 'Kerberos-Tickets löschen', when: 'Nach Gruppenänderung',
          buildCmd: (h) => remote(h, `klist purge 2>&1; Write-Output "Kerberos-Tickets gelöscht"`), action: 'write' },
      ],
    },
    // ── 18: WLAN & Netzwerkprofile ───────────────────────────────────────────
    {
      id: 'wlan', label: 'WLAN & Netzwerkprofile',
      commands: [
        { id: 'wlanprofiles', func: 'WLAN-Profile anzeigen', when: 'Diagnostizieren',
          buildCmd: (h) => remote(h, `netsh wlan show profiles 2>&1`), action: 'read' },
        { id: 'wlanstatus', func: 'WLAN-Status', when: 'Signal, Netzwerk',
          buildCmd: (h) => remote(h, `netsh wlan show interfaces 2>&1`), action: 'read' },
        { id: 'wlandardel', func: 'WLAN-Profil löschen', when: 'Falsches entfernen',
          buildCmd: (h, i) => remote(h, `netsh wlan delete profile name='${i}' 2>&1`),
          action: 'write', input: { type: 'text', placeholder: 'WLAN-Profilname' } },
        { id: 'wlanpwd', func: 'WLAN-Passwort anzeigen', when: 'Auslesen (Admin)',
          buildCmd: (h, i) => remote(h, `netsh wlan show profile name='${i}' key=clear 2>&1`),
          action: 'read', input: { type: 'text', placeholder: 'WLAN-Profilname' } },
      ],
    },
    // ── 19: Explorer & Shell ─────────────────────────────────────────────────
    {
      id: 'explorer', label: 'Explorer & Shell',
      commands: [
        { id: 'explorerrestart', func: 'Explorer neustarten', when: 'Taskleiste hängt',
          buildCmd: (h) => remote(h, `Stop-Process -Name explorer -Force -EA SilentlyContinue; Start-Sleep 1; Start-Process explorer; Write-Output "Explorer neugestartet"`), action: 'write' },
        { id: 'iconcache', func: 'Icon-Cache erneuern', when: 'Falsche Icons',
          buildCmd: (h) => remote(h, `ie4uinit -show; Write-Output "Icon-Cache erneuert"`), action: 'write' },
        { id: 'iconcachedel', func: 'Icon-Cache löschen', when: 'Beschädigte Icons',
          buildCmd: (h) => remote(h, `Stop-Process -Name explorer -Force -EA SilentlyContinue; Remove-Item "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer\\iconcache*" -Force -EA SilentlyContinue; Start-Process explorer; Write-Output "Icon-Cache gelöscht und Explorer neugestartet"`), action: 'write' },
      ],
    },
    // ── 21: Screenshot ───────────────────────────────────────────────────────
    {
      id: 'screenshot', label: 'Screenshot (Datenschutz)',
      commands: [
        { id: 'screencap', func: 'Remote-Screenshot aufnehmen', when: 'Bildschirm des Benutzers anzeigen',
          // CopyFromScreen cannot run in Session 0 (WinRM). Fix: write PS script directly via
          // UNC admin share, then register a ScheduledTask with LogonType Interactive so it runs
          // in the user's desktop session. Fetch result via UNC, clean up.
          buildCmd: (h) => {
            const hSafe = h.replace(/'/g, "''")
            // Build UNC paths without backtick (which breaks JS template literals).
            // PS single-quoted strings are fully literal, so '\\\\' + $hostname + '\\C$\\Temp'
            // produces \\hostname\C$\Temp at runtime.
            return [
              `$ErrorActionPreference = 'Stop'`,
              `$hostname = '${hSafe}'`,
              `try {`,
              `  $cs = Get-CimInstance -ComputerName $hostname -ClassName Win32_ComputerSystem -EA Stop`,
              `  $loggedOnUser = $cs.UserName`,
              `  if (-not $loggedOnUser) { throw 'Kein Benutzer angemeldet' }`,
              `  $adminTemp = '\\\\' + $hostname + '\\C$\\Temp'`,
              `  $scriptUNC = $adminTemp + '\\screenshot_task.ps1'`,
              `  $screenshotUNC = $adminTemp + '\\itadmin_screenshot.png'`,
              `  $scriptContent = @'`,
              `Add-Type -AssemblyName System.Windows.Forms`,
              `Add-Type -AssemblyName System.Drawing`,
              `New-Item -ItemType Directory -Path 'C:\\Temp' -Force | Out-Null`,
              `$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds`,
              `$bmp = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)`,
              `$g = [System.Drawing.Graphics]::FromImage($bmp)`,
              `$g.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)`,
              `$g.Dispose()`,
              `$bmp.Save('C:\\Temp\\itadmin_screenshot.png')`,
              `$bmp.Dispose()`,
              `'@`,
              `  New-Item -ItemType Directory -Path $adminTemp -Force -EA SilentlyContinue | Out-Null`,
              `  Set-Content -Path $scriptUNC -Value $scriptContent -Encoding UTF8 -Force`,
              `  Invoke-Command -ComputerName $hostname -ScriptBlock {`,
              `    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-WindowStyle Hidden -ExecutionPolicy Bypass -File C:\\Temp\\screenshot_task.ps1'`,
              `    $principal = New-ScheduledTaskPrincipal -UserId $using:loggedOnUser -LogonType Interactive -RunLevel Highest`,
              `    Register-ScheduledTask -TaskName 'ITAdminScreenshot' -Action $action -Principal $principal -Force | Out-Null`,
              `    Start-ScheduledTask -TaskName 'ITAdminScreenshot'`,
              `  }`,
              `  $waited = 0`,
              `  while (-not (Test-Path $screenshotUNC) -and $waited -lt 10) { Start-Sleep -Seconds 1; $waited++ }`,
              `  if (-not (Test-Path $screenshotUNC)) { throw 'Screenshot-Datei nicht erstellt (Timeout nach 10s)' }`,
              `  $bytes = [System.IO.File]::ReadAllBytes($screenshotUNC)`,
              `  $base64 = [Convert]::ToBase64String($bytes)`,
              `  Remove-Item $screenshotUNC -Force -EA SilentlyContinue`,
              `  Remove-Item $scriptUNC -Force -EA SilentlyContinue`,
              `  Invoke-Command -ComputerName $hostname -ScriptBlock { Unregister-ScheduledTask -TaskName 'ITAdminScreenshot' -Confirm:$false -EA SilentlyContinue }`,
              `  Write-Output $base64`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'read', local: true, privacyConsent: true, longRunning: true },
      ],
    },
    // ── 22: Software installieren ─────────────────────────────────────────────
    {
      id: 'swinstall', label: 'Software installieren',
      commands: [
        { id: 'wingetinstall', func: 'App per Winget installieren', when: 'Software remote installieren',
          buildCmd: (h, i) => remote(h, `winget install --id '${(i??'').replace(/'/g,"''")}' --silent --accept-package-agreements --accept-source-agreements 2>&1`),
          action: 'critical', input: { type: 'text', placeholder: 'Winget Package-ID z.B. Mozilla.Firefox' } },
        { id: 'wingsearch', func: 'Winget Pakete suchen', when: 'Verfügbare Apps finden',
          buildCmd: (h, i) => remote(h, `winget search '${(i??'').replace(/'/g,"''")}' 2>&1`),
          action: 'read', input: { type: 'text', placeholder: 'Suchbegriff z.B. Firefox' } },
        { id: 'fileinstall', func: 'Setup-Datei remote installieren', when: 'MSI/EXE von Datei',
          buildCmd: (h, i) => {
            if (!i) return `Write-Output "ERR:Keine Datei ausgewählt"`
            const src = i.replace(/'/g, "''")
            const fname = src.split('\\').pop() ?? 'setup'
            const ext   = fname.split('.').pop()?.toLowerCase() ?? ''
            const dst   = `C:\\Temp\\${fname}`.replace(/'/g, "''")
            const run   = ext === 'msi'
              ? `Start-Process msiexec -ArgumentList '/i','${dst}','/quiet','/norestart' -Wait`
              : `Start-Process '${dst}' -ArgumentList '/S','/silent','/quiet' -Wait`
            return local([
              `$src='${src}'; $h='${h.replace(/'/g,"''")}'; $dst="\\\\$h\\C$\\Temp"`,
              `New-Item -ItemType Directory -Path $dst -EA SilentlyContinue | Out-Null`,
              `Copy-Item $src "$dst\\${fname}"`,
              `Invoke-Command -ComputerName $h -ScriptBlock { ${run}; Write-Output 'Fertig' } -EA Stop`,
            ].join('; '))
          },
          action: 'critical', fileAction: 'install' },
      ],
    },
    // ── 23: Dateiübertragung ──────────────────────────────────────────────────
    {
      id: 'filetransfer', label: 'Dateiübertragung',
      commands: [
        { id: 'copyfiles', func: 'Dateien zum Remote-PC übertragen', when: 'Dateien remote kopieren',
          buildCmd: (h, i) => {
            if (!i) return `Write-Output "ERR:Keine Dateien ausgewählt"`
            const pairs = i.split('|').filter(Boolean)
            const copyLines = pairs.map(src => {
              const s = src.replace(/'/g, "''")
              const fname = s.split('\\').pop() ?? 'file'
              return `Copy-Item -Path '${s}' -Destination "\\\\${h}\\C$\\Temp\\${fname}" -Force`
            })
            return local([
              `New-Item -ItemType Directory -Path "\\\\${h}\\C$\\Temp" -EA SilentlyContinue | Out-Null`,
              ...copyLines,
              `Write-Output "${pairs.length} Datei(en) erfolgreich kopiert nach \\\\${h}\\C$\\Temp"`,
            ].join('; '))
          },
          action: 'write', fileAction: 'transfer' },
        { id: 'opentemp', func: 'Temp-Ordner auf Remote-PC öffnen', when: 'Übertragene Dateien prüfen',
          buildCmd: (h) => local(`Start-Process explorer "\\\\${h}\\C$\\Temp"; Write-Output "Explorer geöffnet: \\\\${h}\\C$\\Temp"`),
          action: 'read', local: true },
      ],
    },
    // ── 24: Laufwerk-Mapping ──────────────────────────────────────────────────
    {
      id: 'drivemap', label: 'Laufwerk-Mapping',
      commands: [
        { id: 'mapdriveadd', func: 'Netzlaufwerk verbinden (Benutzerkontext)', when: 'Laufwerk für angemeldeten Benutzer mappen',
          buildCmd: (h, i) => {
            const parts  = (i ?? '').split('|')
            const letter = (parts[0] ?? 'Z').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) || 'Z'
            const unc    = (parts[1] ?? '').trim()
            const hSafe  = h.replace(/'/g, "''")
            // Use -ArgumentList to pass letter and unc path — avoids all escaping issues with backslashes and spaces
            return [
              `try {`,
              `  $ErrorActionPreference = 'Stop'`,
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($ltr, $path, $persist)`,
              `    $out = net use "$($ltr):" "$path" /persistent:$(if($persist){'yes'}else{'no'}) 2>&1`,
              `    if ($LASTEXITCODE -ne 0) { throw ($out -join ' ') }`,
              `    Write-Output "OK: $($ltr): -> $path verbunden"`,
              `  } -ArgumentList '${letter}','${unc}',$true`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'write',
          input: { type: 'text', placeholder: 'Z|\\\\Server\\Share (Laufwerk|UNC-Pfad)' },
          templates: [
            { label: 'W3172 IT-Share', value: 'Z|\\\\W3172\\SKF Marine' },
            { label: 'W3172 Daten',    value: 'S|\\\\W3172\\Daten'      },
            { label: 'W3143 Ablage',   value: 'T|\\\\W3143\\Ablage'     },
            { label: 'W3143 Install',  value: 'U|\\\\W3143\\Software'   },
          ],
        },
        { id: 'mapdriverem', func: 'Netzlaufwerk trennen (Benutzerkontext)', when: 'Mapping für angemeldeten Benutzer entfernen',
          buildCmd: (h, i) => {
            const letter = (i ?? 'Z').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1) || 'Z'
            const hSafe  = h.replace(/'/g, "''")
            return [
              `try {`,
              `  $ErrorActionPreference = 'Stop'`,
              `  Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    param($ltr)`,
              `    $out = net use "$($ltr):" /delete /yes 2>&1`,
              `    if ($LASTEXITCODE -ne 0) { throw ($out -join ' ') }`,
              `    Write-Output "OK: $($ltr): getrennt"`,
              `  } -ArgumentList '${letter}'`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n')
          },
          action: 'write',
          input: { type: 'text', placeholder: 'Laufwerksbuchstabe z.B. Z' },
          templates: [
            { label: 'Z:', value: 'Z' }, { label: 'S:', value: 'S' },
            { label: 'T:', value: 'T' }, { label: 'U:', value: 'U' },
          ],
        },
        { id: 'mapdrivelist', func: 'Verbundene Laufwerke anzeigen', when: 'Welche Laufwerke gemappt?',
          buildCmd: (h) => {
            const hSafe = h.replace(/'/g, "''")
            return [
              `try {`,
              `  $maps = Invoke-Command -ComputerName '${hSafe}' -ScriptBlock {`,
              `    Get-SmbMapping -EA SilentlyContinue | Select-Object LocalPath,RemotePath,Status`,
              `  } -EA Stop`,
              `  if (-not $maps) { Write-Output '"(Keine gemappten Laufwerke)"'; exit }`,
              `  $maps | ConvertTo-Json -Compress`,
              `} catch { Write-Output """ERR:$($_.Exception.Message)""" }`,
            ].join('\n')
          },
          action: 'read' },
      ],
    },
    // ── 25: Treiber & Hardware ────────────────────────────────────────────────
    {
      id: 'drivers', label: 'Treiber & Hardware',
      commands: [
        { id: 'driverlist', func: 'Alle Treiber anzeigen', when: 'Treiberübersicht',
          buildCmd: (h) => remote(h, `Get-WindowsDriver -Online -EA SilentlyContinue | Select-Object ProviderName,Driver,Version,Date | Sort-Object ProviderName | ConvertTo-Json -Compress`),
          action: 'read' },
        { id: 'driverfail', func: 'Fehlerhafte Treiber', when: 'Probleme finden',
          buildCmd: (h) => remote(h, `Get-WmiObject Win32_PnPEntity | Where-Object {$_.ConfigManagerErrorCode -ne 0} | Select-Object Name,ConfigManagerErrorCode,DeviceID | ConvertTo-Json -Compress`),
          action: 'read' },
        { id: 'driverupdate', func: 'Treiber über Windows Update suchen', when: 'Treiber-Updates',
          buildCmd: (h) => remote(h, `$s=New-Object -ComObject Microsoft.Update.Session; $sc=$s.CreateUpdateSearcher(); $r=$sc.Search("IsInstalled=0 and Type='Driver'"); $r.Updates | ForEach-Object { "$($_.Title): $($_.Description)" } | ConvertTo-Json -Compress`),
          action: 'read', longRunning: true },
        { id: 'driverinf', func: 'Treiber-INF remote installieren', when: 'Manueller Treiber-Import',
          buildCmd: (h, i) => {
            if (!i) return `Write-Output "ERR:Keine INF-Datei ausgewählt"`
            const src = i.replace(/'/g, "''")
            const fname = src.split('\\').pop() ?? 'driver.inf'
            return local([
              `$h='${h.replace(/'/g,"''")}'; $dst="\\\\$h\\C$\\Temp"`,
              `New-Item -ItemType Directory -Path $dst -EA SilentlyContinue | Out-Null`,
              `Copy-Item '${src}' "$dst\\${fname}"`,
              `Invoke-Command -ComputerName $h -ScriptBlock { pnputil /add-driver "C:\\Temp\\${fname}" /install 2>&1 } -EA Stop`,
            ].join('; '))
          },
          action: 'critical', fileAction: 'install' },
      ],
    },
    // ── 20: Energie & Wake-on-LAN ────────────────────────────────────────────
    {
      id: 'power', label: 'Energie & Wake-on-LAN',
      commands: [
        { id: 'batreport', func: 'Akku-Bericht (Laptop)', when: 'Akku-Gesundheit',
          buildCmd: (h) => remote(h, `powercfg /batteryreport /output C:\\temp\\battery.html; Write-Output "Bericht: C:\\temp\\battery.html"`), action: 'read', longRunning: true },
        { id: 'powerenergy', func: 'Energie-Diagnose', when: 'Nicht in Standby',
          buildCmd: (h) => remote(h, `powercfg /energy /duration 10 /output C:\\temp\\energy.html 2>&1; Write-Output "Bericht: C:\\temp\\energy.html"`), action: 'read', longRunning: true },
        { id: 'sleepstudy', func: 'Standby-Analyse', when: 'Wacht ständig auf',
          buildCmd: (h) => remote(h, `powercfg /sleepstudy /output C:\\temp\\sleepstudy.html 2>&1; Write-Output "Bericht: C:\\temp\\sleepstudy.html"`), action: 'read' },
        { id: 'lastwake', func: 'Was hat PC aufgeweckt?', when: 'Ungewolltes Aufwachen',
          buildCmd: (h) => remote(h, `powercfg /lastwake 2>&1`), action: 'read' },
        { id: 'requests', func: 'Was verhindert Standby?', when: 'Schläft nicht ein',
          buildCmd: (h) => remote(h, `powercfg /requests 2>&1`), action: 'read' },
        { id: 'wol', func: 'Wake-on-LAN', when: 'PC remote einschalten',
          buildCmd: (_h, i) => {
            const mac = (i || '').replace(/[:-]/g, '').toUpperCase()
            if (mac.length !== 12) return `Write-Output "ERR:Ungültige MAC-Adresse"`
            const payload = 'FF'.repeat(6) + mac.repeat(16)
            const bytes = payload.match(/.{2}/g)!.map(b => `0x${b}`).join(',')
            return local(`$mac='${i}'; $bytes=[byte[]](${bytes}); $udp=New-Object System.Net.Sockets.UdpClient; $udp.Connect([System.Net.IPAddress]::Broadcast,9); $udp.Send($bytes,$bytes.Length) | Out-Null; $udp.Close(); Write-Output "Wake-on-LAN Magic Packet gesendet an $mac"`)
          }, action: 'write', input: { type: 'text', placeholder: 'MAC-Adresse z.B. AA:BB:CC:DD:EE:FF' } },
      ],
    },
  ]
}

export const CATEGORIES = buildCategories()
