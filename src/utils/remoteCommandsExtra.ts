/**
 * Extra Remote Doc categories (26-30) + DIAG Skills
 * These are merged into CATEGORIES in remoteCommands.ts
 */
import { remote, local, type Category } from './remoteCommands'

// ── Audio COM Interface Add-Type block (needed for audio skills) ──────────────
const AUDIO_ADDTYPE = `Add-Type -TypeDefinition 'using System.Runtime.InteropServices;[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IAudioEndpointVolume{int f();int g();int h();int i();int SetMasterVolumeLevelScalar(float fLevel,System.Guid pguidEventContext);int j();int GetMasterVolumeLevelScalar(out float pfLevel);int k();int l();int m();int n();int SetMute([MarshalAs(UnmanagedType.Bool)]bool bMute,System.Guid pguidEventContext);int GetMute(out bool pbMute);}[Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IMMDevice{int Activate(ref System.Guid id,int clsCtx,int activationParams,out IAudioEndpointVolume aev);}[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IMMDeviceEnumerator{int f();int GetDefaultAudioEndpoint(int dataFlow,int role,out IMMDevice endpoint);}[ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]class MMDeviceEnumeratorComObject{}public class Audio{static IAudioEndpointVolume Vol(){var enumerator=new MMDeviceEnumeratorComObject()as IMMDeviceEnumerator;IMMDevice dev;Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0,1,out dev));IAudioEndpointVolume epv;var epvid=typeof(IAudioEndpointVolume).GUID;Marshal.ThrowExceptionForHR(dev.Activate(ref epvid,23,0,out epv));return epv;}public static float Volume{get{float v;Marshal.ThrowExceptionForHR(Vol().GetMasterVolumeLevelScalar(out v));return v;}set{Marshal.ThrowExceptionForHR(Vol().SetMasterVolumeLevelScalar(value,System.Guid.Empty));}}public static bool Mute{get{bool m;Marshal.ThrowExceptionForHR(Vol().GetMute(out m));return m;}set{Marshal.ThrowExceptionForHR(Vol().SetMute(value,System.Guid.Empty));}}}'`

export function buildExtraCategories(): Category[] {
  return [
    // ── 26: Audio & Display ──────────────────────────────────────────────────
    {
      id: 'audio', label: 'Audio & Display',
      commands: [
        { id: 'volshow', func: 'Lautstärke anzeigen', when: 'Aktuelle Lautstärke',
          buildCmd: (h) => remote(h, `${AUDIO_ADDTYPE}; @{Volume=[math]::Round([Audio]::Volume*100);Muted=[Audio]::Mute} | ConvertTo-Json`), action: 'read' },
        { id: 'volset', func: 'Lautstärke setzen', when: 'Lautstärke ändern',
          buildCmd: (h, i) => remote(h, `${AUDIO_ADDTYPE}; [Audio]::Volume = ${(parseInt(i || '50') / 100).toFixed(2)}; @{Volume=${i || '50'}} | ConvertTo-Json`), action: 'write',
          input: { type: 'text', placeholder: '0-100 (Prozent)' } },
        { id: 'volmute', func: 'Stumm schalten / Aufheben', when: 'Ton an/aus',
          buildCmd: (h, i) => remote(h, `${AUDIO_ADDTYPE}; [Audio]::Mute = ${i === 'an' ? '$false' : '$true'}; @{Muted=[Audio]::Mute} | ConvertTo-Json`), action: 'write',
          input: { type: 'dropdown', options: ['stumm', 'an'] } },
        { id: 'audiodevplay', func: 'Standard-Wiedergabegerät', when: 'Welches Ausgabegerät?',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_SoundDevice | Select @{N='Gerät';E={$_.Name}},@{N='Status';E={$_.Status}},@{N='Hersteller';E={$_.Manufacturer}} | ConvertTo-Json`), action: 'read' },
        { id: 'audiodevrec', func: 'Standard-Aufnahmegerät', when: 'Welches Mikrofon?',
          buildCmd: (h) => remote(h, `Get-PnpDevice -Class AudioEndpoint | Where Status -eq 'OK' | Select @{N='Gerät';E={$_.FriendlyName}},@{N='Status';E={$_.Status}} | ConvertTo-Json`), action: 'read' },
        { id: 'audiodevall', func: 'Alle Audio-Geräte', when: 'Audio-Inventar',
          buildCmd: (h) => remote(h, `Get-PnpDevice -Class AudioEndpoint | Select @{N='Gerät';E={$_.FriendlyName}},@{N='Status';E={$_.Status}} | ConvertTo-Json`), action: 'read' },
        { id: 'audiosvcrestart', func: 'Audio-Dienst neustarten', when: 'Kein Ton',
          buildCmd: (h) => remote(h, `Restart-Service AudioSrv -Force; Restart-Service AudioEndpointBuilder -Force; @{AudioSrv=(Get-Service AudioSrv).Status;AudioEndpointBuilder=(Get-Service AudioEndpointBuilder).Status} | ConvertTo-Json`), action: 'write' },
        { id: 'brightshow', func: 'Helligkeit anzeigen', when: 'Aktuelle Helligkeit (Laptop)',
          buildCmd: (h) => remote(h, `(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness).CurrentBrightness`), action: 'read' },
        { id: 'brightset', func: 'Helligkeit setzen', when: 'Helligkeit ändern (Laptop)',
          buildCmd: (h, i) => remote(h, `(Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightnessMethods).WmiSetBrightness(5,${i || '50'}); Write-Output 'Helligkeit auf ${i || '50'}% gesetzt'`), action: 'write',
          input: { type: 'text', placeholder: '0-100 (Prozent)' } },
        { id: 'resshow', func: 'Auflösung anzeigen', when: 'Bildschirmauflösung',
          buildCmd: (h) => remote(h, `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { @{DeviceName=$_.DeviceName;Bounds="$($_.Bounds.Width)x$($_.Bounds.Height)";Primary=$_.Primary} } | ConvertTo-Json`), action: 'read' },
        { id: 'nightmode', func: 'Nachtmodus an/aus', when: 'Blaulichtfilter',
          buildCmd: (h, i) => remote(h, `$p='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\CloudStore\\Store\\DefaultAccount\\Current\\default$windows.data.bluelightreduction.bluelightreductionstate\\windows.data.bluelightreduction.bluelightreductionstate'; if('${i}'  -eq 'an'){Set-ItemProperty -Path $p -Name Data -Value ([byte[]](2,0,0,0,1,0,0,0))}else{Remove-ItemProperty -Path $p -Name Data -EA SilentlyContinue}; Write-Output 'Nachtmodus ${i || 'an'}'`), action: 'write',
          input: { type: 'dropdown', options: ['an', 'aus'] } },
        { id: 'monitorinfo', func: 'Monitor-Anordnung anzeigen', when: 'Multi-Monitor Setup',
          buildCmd: (h) => remote(h, `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::AllScreens | ForEach-Object { @{Name=$_.DeviceName;Resolution="$($_.Bounds.Width)x$($_.Bounds.Height)";Position="X=$($_.Bounds.X) Y=$($_.Bounds.Y)";Primary=$_.Primary;WorkingArea="$($_.WorkingArea.Width)x$($_.WorkingArea.Height)"} } | ConvertTo-Json`), action: 'read' },
        { id: 'displayswitch', func: 'Bildschirm duplizieren/erweitern', when: 'Anzeige-Modus',
          buildCmd: (h, i) => { const m: Record<string,string> = {Duplizieren:'/clone',Erweitern:'/extend','Nur intern':'/internal','Nur extern':'/external'}; return remote(h, `Start-Process DisplaySwitch.exe -ArgumentList '${m[i||'Erweitern']||'/extend'}'; Write-Output 'DisplaySwitch ${i||'Erweitern'}'`) }, action: 'write',
          input: { type: 'dropdown', options: ['Duplizieren', 'Erweitern', 'Nur intern', 'Nur extern'] } },
        { id: 'refreshrate', func: 'Bildwiederholrate anzeigen', when: 'Hz prüfen',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_VideoController | Select Name,CurrentRefreshRate,MaxRefreshRate,VideoModeDescription | ConvertTo-Json`), action: 'read' },
        { id: 'scalingshow', func: 'Bildschirm-Skalierung anzeigen', when: 'DPI/Skalierung',
          buildCmd: (h) => remote(h, `$dpi=(Get-ItemProperty 'HKCU:\\Control Panel\\Desktop\\WindowMetrics' -EA SilentlyContinue).AppliedDPI; $scale=(Get-ItemProperty 'HKCU:\\Control Panel\\Desktop' -EA SilentlyContinue).LogPixels; @{AppliedDPI=$dpi;LogPixels=$scale;ScalePercent=if($dpi){[math]::Round($dpi/96*100)}else{'N/A'}} | ConvertTo-Json`), action: 'read' },
      ],
    },

    // ── 27: Datei-Operationen auf Ziel-PC ────────────────────────────────────
    {
      id: 'fileops', label: 'Datei-Operationen auf Ziel-PC',
      commands: [
        // ── Explorer / Direktzugriff ──────────────────────────────────────
        { id: 'openexplorer', func: 'Explorer auf Ziel-PC öffnen (C$)', when: 'Direktzugriff auf Dateisystem des Ziel-PCs über Admin-Share',
          buildCmd: (h) => local(`Start-Process explorer.exe "\\\\${h}\\C$"; Write-Output "Explorer geöffnet: \\\\${h}\\C$"`), action: 'read' },
        { id: 'openexplorerpath', func: 'Explorer auf Ziel-PC öffnen (Pfad)', when: 'Bestimmten Ordner des Ziel-PCs im Explorer öffnen',
          buildCmd: (h, i) => {
            const p = (i || 'C$').replace(/^([A-Za-z]):\\/, '$1$\\').replace(/^([A-Za-z]):/,'$1$\\')
            return local(`Start-Process explorer.exe "\\\\${h}\\${p}"; Write-Output "Explorer geöffnet: \\\\${h}\\${p}"`)
          }, action: 'read',
          input: { type: 'text', placeholder: 'z.B. C:\\Users oder D:\\Daten' } },

        // ── Ordner durchsuchen ────────────────────────────────────────────
        { id: 'dirlist', func: 'Ordner-Inhalt anzeigen', when: 'Dateien und Ordner auf dem Ziel-PC auflisten',
          buildCmd: (h, i) => remote(h, `Get-ChildItem -Path '${i || 'C:\\'}' -Force | Select Mode,Length,LastWriteTime,Name | ConvertTo-Json`), action: 'read',
          input: { type: 'text', placeholder: 'z.B. C:\\Users oder C:\\Temp' } },
        { id: 'filedetail', func: 'Datei-Details anzeigen', when: 'Größe, Datum und Attribute einer Datei prüfen',
          buildCmd: (h, i) => remote(h, `$f=Get-Item '${i}' -Force; @{Name=$f.Name;FullName=$f.FullName;Length=$f.Length;Created=$f.CreationTime;Modified=$f.LastWriteTime;Attributes=$f.Attributes.ToString()} | ConvertTo-Json`), action: 'read',
          input: { type: 'text', placeholder: 'z.B. C:\\Windows\\System32\\config.sys' } },

        // ── Dateien kopieren / übertragen ─────────────────────────────────
        { id: 'filecopyto', func: 'Datei zum Ziel-PC kopieren', when: 'Eine Datei von deinem Admin-PC zum Ziel-PC übertragen',
          buildCmd: (h, i) => local(`Copy-Item -Path '${i}' -Destination '\\\\${h}\\C$\\Temp\\' -Force; Write-Output "Kopiert nach \\\\${h}\\C$\\Temp\\"`), action: 'write',
          input: { type: 'text', placeholder: 'z.B. C:\\Setup\\installer.exe' }, fileAction: 'transfer' },
        { id: 'filecopyfrom', func: 'Datei vom Ziel-PC holen', when: 'Eine Datei vom Ziel-PC auf deinen Desktop kopieren',
          buildCmd: (h, i) => local(`$dest=[Environment]::GetFolderPath('Desktop'); Copy-Item "\\\\${h}\\C$\\${i?.replace('C:\\','')}" -Destination $dest -Force; Write-Output "Kopiert nach $dest"`), action: 'read',
          input: { type: 'text', placeholder: 'z.B. C:\\Temp\\logfile.txt' } },

        // ── Dateien verwalten ─────────────────────────────────────────────
        { id: 'mkdir', func: 'Ordner erstellen', when: 'Neuen Ordner auf dem Ziel-PC anlegen',
          buildCmd: (h, i) => remote(h, `New-Item -Path '${i}' -ItemType Directory -Force | Select FullName | ConvertTo-Json`), action: 'write',
          input: { type: 'text', placeholder: 'z.B. C:\\Temp\\MeinOrdner' } },
        { id: 'filerename', func: 'Datei umbenennen', when: 'Eine Datei auf dem Ziel-PC umbenennen',
          buildCmd: (h, i) => { const [src, dst] = (i || '|').split('|'); return remote(h, `Rename-Item '${src}' -NewName '${dst}'; Write-Output 'Umbenannt: ${dst}'`) }, action: 'write',
          input: { type: 'filepipe', placeholder: 'Alter Pfad|Neuer Name', labels: ['Aktueller Dateipfad', 'Neuer Dateiname'], examples: ['C:\\Temp\\alt.txt', 'neu.txt'] } },
        { id: 'filemove', func: 'Datei verschieben', when: 'Eine Datei auf dem Ziel-PC in einen anderen Ordner verschieben',
          buildCmd: (h, i) => { const [src, dst] = (i || '|').split('|'); return remote(h, `Move-Item '${src}' -Destination '${dst}' -Force; Write-Output 'Verschoben nach: ${dst}'`) }, action: 'write',
          input: { type: 'filepipe', placeholder: 'Quellpfad|Zielpfad', labels: ['Quellpfad (Datei)', 'Zielpfad (Ordner)'], examples: ['C:\\Temp\\datei.txt', 'C:\\Users\\Public\\'] } },
        { id: 'filedelete', func: 'Datei löschen', when: 'Eine Datei auf dem Ziel-PC unwiderruflich löschen',
          buildCmd: (h, i) => remote(h, `Remove-Item '${i}' -Force -Confirm:$false; Write-Output 'Gelöscht: ${i}'`), action: 'critical',
          input: { type: 'text', placeholder: 'z.B. C:\\Temp\\alte_datei.log' } },
        { id: 'rmdir', func: 'Ordner löschen (inkl. Inhalt)', when: 'Ordner mit allem Inhalt unwiderruflich löschen',
          buildCmd: (h, i) => remote(h, `Remove-Item '${i}' -Recurse -Force -Confirm:$false; Write-Output 'Gelöscht: ${i}'`), action: 'critical',
          input: { type: 'text', placeholder: 'z.B. C:\\Temp\\AlterOrdner' } },

        // ── Programme starten ─────────────────────────────────────────────
        { id: 'runexeuser', func: 'EXE im Benutzerkontext starten', when: 'Ein Programm als der angemeldete Benutzer auf dem Ziel-PC starten',
          buildCmd: (h, i) => remote(h, [
            `$user=$null`,
            `try { $user=(Get-CimInstance Win32_ComputerSystem).UserName } catch {}`,
            `if (-not $user) { try { $q=quser 2>$null; $al=@($q|Where-Object{$_ -and $_ -notmatch '^\\s*USERNAME'}); $ln=$al|Where-Object{$_ -match 'Active|Aktiv'}|Select-Object -First 1; if(-not $ln -and $al.Count -gt 0){$ln=$al[0]}; if($ln){$p=($ln -replace '^[> ]+','') -split '\\s{2,}'; $u=$p[0]; if($u -and $u -notmatch '\\\\'){$u="$env:USERDOMAIN\\$u"}; $user=$u} } catch {} }`,
            `if (-not $user) { try { $pr=Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop|Select-Object -First 1; if($pr){$ow=Invoke-CimMethod -InputObject $pr -MethodName GetOwner -EA Stop; $user="$($ow.Domain)\\$($ow.User)"} } catch {} }`,
            `if (-not $user) { Write-Output 'ERR:Kein Benutzer angemeldet'; exit }`,
            `$a=New-ScheduledTaskAction -Execute '${i}'`,
            `$t=New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(3)`,
            `Register-ScheduledTask -TaskName 'TempRun' -Action $a -Trigger $t -User $user -Force | Out-Null`,
            `Start-Sleep 5`,
            `Unregister-ScheduledTask -TaskName 'TempRun' -Confirm:$false`,
            `Write-Output "Gestartet als $user"`,
          ].join('; ')), action: 'write',
          input: { type: 'text', placeholder: 'z.B. C:\\Program Files\\App\\app.exe' } },
        { id: 'runexesystem', func: 'EXE als SYSTEM starten', when: 'Ein Programm mit SYSTEM-Rechten auf dem Ziel-PC starten (für Installationen)',
          buildCmd: (h, i) => remote(h, `$a=New-ScheduledTaskAction -Execute '${i}'; $p=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount; Register-ScheduledTask -TaskName 'TempSys' -Action $a -Principal $p -Force | Out-Null; Start-ScheduledTask -TaskName 'TempSys'; Start-Sleep 3; Unregister-ScheduledTask -TaskName 'TempSys' -Confirm:$false; Write-Output 'Gestartet als SYSTEM'`), action: 'critical',
          input: { type: 'text', placeholder: 'z.B. C:\\Temp\\setup.exe /quiet' } },
        { id: 'runbat', func: 'BAT/CMD-Datei ausführen', when: 'Ein Batch-Script auf dem Ziel-PC ausführen',
          buildCmd: (h, i) => remote(h, `cmd.exe /c '${i}' 2>&1`), action: 'critical',
          input: { type: 'text', placeholder: 'z.B. C:\\Scripts\\cleanup.bat' } },
        { id: 'runps', func: 'PowerShell-Script ausführen', when: 'Ein PS1-Script auf dem Ziel-PC ausführen',
          buildCmd: (h, i) => remote(h, `& '${i}' 2>&1`), action: 'critical',
          input: { type: 'text', placeholder: 'z.B. C:\\Scripts\\fix.ps1' } },

        // ── Berechtigungen / hosts / Freigaben ───────────────────────────
        { id: 'aclshow', func: 'NTFS-Berechtigungen anzeigen', when: 'Datei- oder Ordnerrechte auf dem Ziel-PC prüfen',
          buildCmd: (h, i) => remote(h, `(Get-Acl '${i}').Access | Select IdentityReference,FileSystemRights,AccessControlType | ConvertTo-Json`), action: 'read',
          input: { type: 'text', placeholder: 'z.B. C:\\Users\\Public' } },
        { id: 'hostsshow', func: 'hosts-Datei anzeigen', when: 'Lokale DNS-Overrides auf dem Ziel-PC anzeigen',
          buildCmd: (h) => remote(h, `Get-Content "$env:SystemRoot\\System32\\drivers\\etc\\hosts" | Where-Object {$_ -and $_ -notmatch '^\\s*#'}`), action: 'read' },
        { id: 'hostsadd', func: 'hosts-Eintrag hinzufügen', when: 'Einen lokalen DNS-Override auf dem Ziel-PC setzen',
          buildCmd: (h, i) => remote(h, `Add-Content "$env:SystemRoot\\System32\\drivers\\etc\\hosts" -Value '${i}'; Write-Output 'Eintrag hinzugefügt: ${i}'`), action: 'write',
          input: { type: 'text', placeholder: 'z.B. 192.168.1.100 server.local' } },
        { id: 'hostsreset', func: 'hosts-Datei zurücksetzen', when: 'Alle lokalen DNS-Overrides entfernen',
          buildCmd: (h) => remote(h, `$default="# Copyright (c) 1993-2009 Microsoft Corp.\`r\`n#\`r\`n# This file maps host names to IP addresses.\`r\`n# 127.0.0.1 localhost"; Set-Content "$env:SystemRoot\\System32\\drivers\\etc\\hosts" -Value $default; Write-Output 'hosts-Datei zurückgesetzt'`), action: 'critical' },
        { id: 'sharecreate', func: 'Netzwerkfreigabe erstellen', when: 'Einen Ordner auf dem Ziel-PC als Netzwerkfreigabe freigeben',
          buildCmd: (h, i) => { const [name, path] = (i || '|').split('|'); return remote(h, `New-SmbShare -Name '${name}' -Path '${path}' -FullAccess 'Everyone' | ConvertTo-Json`) }, action: 'write',
          input: { type: 'filepipe', placeholder: 'Freigabename|Ordnerpfad', labels: ['Freigabename', 'Ordnerpfad'], examples: ['MeineFreigabe', 'C:\\Daten\\Shared'] } },
      ],
    },

    // ── 28: Benutzer & Profile ────────────────────────────────────────────────
    {
      id: 'userprofiles', label: 'Benutzer & Profile',
      commands: [
        // ── Übersicht ─────────────────────────────────────────────────────
        { id: 'userlist', func: 'Alle lokalen Benutzer', when: 'Konten-Inventar — wer hat ein lokales Konto?',
          buildCmd: (h) => remote(h, `Get-LocalUser | Select @{N='Benutzer';E={$_.Name}},@{N='Aktiviert';E={$_.Enabled}},@{N='Beschreibung';E={$_.Description}},@{N='Letzte Anmeldung';E={if($_.LastLogon){$_.LastLogon.ToString('dd.MM.yyyy HH:mm')}else{'Nie'}}},@{N='Passwort gesetzt';E={if($_.PasswordLastSet){$_.PasswordLastSet.ToString('dd.MM.yyyy')}else{'—'}}} | ConvertTo-Json`), action: 'read' },
        { id: 'groupmembers', func: 'Gruppen-Mitglieder anzeigen', when: 'Wer ist in welcher Gruppe?',
          buildCmd: (h, i) => remote(h, `$group='${(i || 'Administrators').replace(/'/g, "''")}'; try { $members = Get-LocalGroupMember -Group $group -EA Stop | Select @{N='Name';E={$_.Name}},@{N='Typ';E={$_.ObjectClass}},@{N='Quelle';E={$_.PrincipalSource}}; if($members){$members | ConvertTo-Json -Compress}else{Write-Output '"Keine Mitglieder"'} } catch { Write-Output "ERR:$($_.Exception.Message)" }`), action: 'read',
          input: { type: 'text', placeholder: 'Gruppenname' },
          templates: [
            { label: 'Administratoren', value: 'Administrators' },
            { label: 'Remote Desktop', value: 'Remote Desktop Users' },
            { label: 'Benutzer', value: 'Users' },
            { label: 'Netzwerk', value: 'Network Configuration Operators' },
          ] },
        { id: 'grouplist', func: 'Alle lokalen Gruppen', when: 'Gruppen-Übersicht',
          buildCmd: (h) => remote(h, `Get-LocalGroup | Select @{N='Gruppe';E={$_.Name}},@{N='Beschreibung';E={$_.Description}} | ConvertTo-Json -Compress`), action: 'read' },
        { id: 'lastlogins', func: 'Zuletzt angemeldete User', when: 'Login-Historie — wer hat sich wann angemeldet?',
          buildCmd: (h) => remote(h, `Get-WinEvent -FilterHashtable @{LogName='Security';Id=4624} -MaxEvents 20 -EA SilentlyContinue | ForEach-Object { $xml=[xml]$_.ToXml(); @{Zeitpunkt=$_.TimeCreated.ToString('dd.MM.yyyy HH:mm');Benutzer=$xml.Event.EventData.Data[5].'#text';'Anmeldetyp'=$xml.Event.EventData.Data[8].'#text'} } | ConvertTo-Json`), action: 'read' },

        // ── Domain-User hinzufügen (AD-Lookup) ────────────────────────────
        { id: 'adduserbyid', func: 'Domain-User zur Gruppe hinzufügen', when: 'Corp-ID oder Name eingeben — AD wird automatisch geprüft',
          buildCmd: (h, i) => {
            const parts = (i || '').split('|')
            const corpIdOrName = (parts[0] || '').trim()
            const group = (parts[1] || 'Administrators').trim()
            if (!corpIdOrName) return remote(h, `@{Fehler='Bitte Corp-ID oder Name eingeben'} | ConvertTo-Json -Compress`)
            const safe = corpIdOrName.replace(/'/g, "''")
            const gSafe = group.replace(/'/g, "''")
            return remote(h, [
              `$input = '${safe}'`,
              `$group = '${gSafe}'`,
              `$adUser = $null`,
              `# Versuch 1: Exakter SamAccountName (Corp-ID)`,
              `try { $adUser = Get-ADUser -Identity $input -Properties DisplayName,SamAccountName,Enabled -EA Stop } catch {}`,
              `# Versuch 2: Suche nach Name (Vor- oder Nachname)`,
              `if (-not $adUser) { try { $found = Get-ADUser -Filter "Name -like '*$input*' -or DisplayName -like '*$input*' -or Surname -like '*$input*' -or GivenName -like '*$input*'" -Properties DisplayName,SamAccountName,Enabled -EA Stop; if($found -is [array]){$adUser=$found[0]}else{$adUser=$found} } catch {} }`,
              `if (-not $adUser) { @{Fehler="Benutzer '$input' nicht im AD gefunden. Bitte Corp-ID oder exakten Namen prüfen."} | ConvertTo-Json -Compress; exit }`,
              `if (-not $adUser.Enabled) { @{Warnung="Benutzer $($adUser.SamAccountName) ($($adUser.DisplayName)) ist im AD deaktiviert!"} | ConvertTo-Json -Compress; exit }`,
              `$sam = $adUser.SamAccountName`,
              `$domain = (Get-ADDomain -EA SilentlyContinue).NetBIOSName`,
              `if (-not $domain) { $domain = $env:USERDOMAIN }`,
              `$fullName = "$domain\\$sam"`,
              `# Zur Gruppe hinzufügen`,
              `try { Add-LocalGroupMember -Group $group -Member $fullName -EA Stop } catch {`,
              `  if ($_.Exception.Message -match 'already a member') { @{Info="$fullName ist bereits Mitglied von '$group'";Benutzer=$adUser.DisplayName;'Corp-ID'=$sam} | ConvertTo-Json -Compress; exit }`,
              `  else { Write-Output "ERR:$($_.Exception.Message)"; exit }`,
              `}`,
              `@{Ergebnis='Erfolgreich hinzugefügt';Benutzer=$adUser.DisplayName;'Corp-ID'=$sam;Konto=$fullName;Gruppe=$group;'AD-Status'='Aktiv'} | ConvertTo-Json -Compress`,
            ].join('\n'))
          }, action: 'write',
          input: { type: 'useradd' } },

        // ── Gruppen bearbeiten ────────────────────────────────────────────
        { id: 'usergroupadd', func: 'User zu Gruppe hinzufügen', when: 'Lokalen oder Domain-User einer Gruppe zuweisen',
          buildCmd: (h, i) => {
            const parts = (i || '').split('|')
            const user = (parts[0] || '').trim()
            const group = (parts[1] || 'Administrators').trim()
            if (!user) return remote(h, `@{Fehler='Bitte Benutzername eingeben'} | ConvertTo-Json -Compress`)
            return remote(h, [
              `try {`,
              `  Add-LocalGroupMember -Group '${group.replace(/'/g, "''")}' -Member '${user.replace(/'/g, "''")}' -EA Stop`,
              `  $members = Get-LocalGroupMember -Group '${group.replace(/'/g, "''")}' | Select @{N='Name';E={$_.Name}},@{N='Typ';E={$_.ObjectClass}}`,
              `  @{Ergebnis='${user} hinzugefügt zu ${group}';'Aktuelle Mitglieder'=$members} | ConvertTo-Json -Compress -Depth 3`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n'))
          }, action: 'write',
          input: { type: 'usergroup' } },
        { id: 'usergrouprem', func: 'User aus Gruppe entfernen', when: 'Rechte entziehen — z.B. Admin-Rechte wegnehmen',
          buildCmd: (h, i) => {
            const parts = (i || '').split('|')
            const user = (parts[0] || '').trim()
            const group = (parts[1] || 'Administrators').trim()
            if (!user) return remote(h, `@{Fehler='Bitte Benutzername eingeben'} | ConvertTo-Json -Compress`)
            return remote(h, [
              `try {`,
              `  Remove-LocalGroupMember -Group '${group.replace(/'/g, "''")}' -Member '${user.replace(/'/g, "''")}' -EA Stop`,
              `  $members = Get-LocalGroupMember -Group '${group.replace(/'/g, "''")}' | Select @{N='Name';E={$_.Name}},@{N='Typ';E={$_.ObjectClass}}`,
              `  @{Ergebnis='${user} entfernt aus ${group}';'Verbleibende Mitglieder'=$members} | ConvertTo-Json -Compress -Depth 3`,
              `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
            ].join('\n'))
          }, action: 'write',
          input: { type: 'usergroup' } },

        // ── Lokale User verwalten ─────────────────────────────────────────
        { id: 'useradd', func: 'Lokalen User anlegen', when: 'Neues lokales Konto erstellen (kein Domain-Account)',
          buildCmd: (h, i) => {
            const parts = (i || '').split('|')
            const name = (parts[0] || '').trim()
            const pw = (parts[1] || '').trim()
            if (!name || !pw) return remote(h, `@{Fehler='Bitte Username und Passwort eingeben'} | ConvertTo-Json -Compress`)
            return remote(h, [
              `$pw = ConvertTo-SecureString '${pw.replace(/'/g, "''")}' -AsPlainText -Force`,
              `New-LocalUser -Name '${name.replace(/'/g, "''")}' -Password $pw -FullName '${name.replace(/'/g, "''")}'`,
              `$u = Get-LocalUser '${name.replace(/'/g, "''")}'`,
              `@{Ergebnis='Benutzer erstellt';Benutzer=$u.Name;Aktiviert=$u.Enabled;SID=$u.SID.Value} | ConvertTo-Json -Compress`,
            ].join('; '))
          }, action: 'write',
          input: { type: 'userpass' } },
        { id: 'userdel', func: 'Lokalen User löschen', when: 'Konto entfernen',
          buildCmd: (h, i) => remote(h, `Remove-LocalUser -Name '${(i || '').replace(/'/g, "''")}' -Confirm:$false; Write-Output 'User ${i} gelöscht'`), action: 'critical',
          input: { type: 'text', placeholder: 'Username' },
          templates: [
            { label: 'Alle Benutzer zuerst anzeigen', value: '' },
          ] },
        { id: 'userpwset', func: 'Lokales Passwort ändern', when: 'Passwort zurücksetzen',
          buildCmd: (h, i) => {
            const parts = (i || '').split('|')
            const name = (parts[0] || '').trim()
            const pw = (parts[1] || '').trim()
            if (!name || !pw) return remote(h, `@{Fehler='Bitte Username und Passwort eingeben'} | ConvertTo-Json -Compress`)
            return remote(h, `$pw=ConvertTo-SecureString '${pw.replace(/'/g, "''")}' -AsPlainText -Force; Set-LocalUser -Name '${name.replace(/'/g, "''")}' -Password $pw; @{Ergebnis='Passwort geändert';Benutzer='${name}'} | ConvertTo-Json -Compress`)
          }, action: 'write',
          input: { type: 'userpass' } },
        { id: 'autologon', func: 'AutoAnmeldung konfigurieren', when: 'Auto-Login setzen — PC meldet sich automatisch an',
          buildCmd: (h, i) => { const [user, pw] = (i || '|').split('|'); return remote(h, `$rp='HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon'; Set-ItemProperty $rp -Name AutoAdminLogon -Value 1; Set-ItemProperty $rp -Name DefaultUserName -Value '${user}'; Set-ItemProperty $rp -Name DefaultPassword -Value '${pw}'; @{Ergebnis='AutoLogon aktiviert';Benutzer='${user}';Hinweis='Wird beim nächsten Neustart wirksam'} | ConvertTo-Json -Compress`) }, action: 'critical',
          input: { type: 'userpass' } },

        // ── Profile ───────────────────────────────────────────────────────
        { id: 'profilelist', func: 'Benutzerprofile mit Größe', when: 'Profil-Inventar — welche Profile existieren?',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_UserProfile | Where {!$_.Special} | ForEach-Object { $size=0; try{$size=[math]::Round((Get-ChildItem $_.LocalPath -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1)}catch{}; @{Profil=$_.LocalPath;'Größe (MB)'=$size;'Letzte Nutzung'=if($_.LastUseTime){$_.LastUseTime.ToString('dd.MM.yyyy')}else{'—'};Geladen=$_.Loaded} } | ConvertTo-Json`), action: 'read', longRunning: true },
        { id: 'profilesizes', func: 'Profil-Größe pro User', when: 'Wer braucht am meisten Platz?',
          buildCmd: (h) => remote(h, `Get-ChildItem C:\\Users -Directory | ForEach-Object { $size=[math]::Round((Get-ChildItem $_.FullName -Recurse -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum/1MB,1); @{Benutzer=$_.Name;'Größe (MB)'=$size} } | Sort-Object 'Größe (MB)' -Descending | ConvertTo-Json`), action: 'read', longRunning: true },
        { id: 'profiledel', func: 'Benutzerprofil löschen', when: 'Profil-Ordner und Registry-Eintrag bereinigen',
          buildCmd: (h, i) => remote(h, `$p=Get-CimInstance Win32_UserProfile | Where LocalPath -like '*${(i || '').replace(/'/g, "''").replace(/\\/g, '\\\\')}*'; if($p){Remove-CimInstance $p; Write-Output 'Profil gelöscht: ${i}'}else{Write-Output 'Profil nicht gefunden'}`), action: 'critical',
          input: { type: 'text', placeholder: 'Username (Teil des Profilpfads)' },
          templates: [
            { label: 'Profile zuerst anzeigen', value: '' },
          ] },
        { id: 'tempprofile', func: 'Temp-Profil erkennen + reparieren', when: 'Benutzer hat ein temporäres Profil — .bak in Registry fixen',
          buildCmd: (h) => remote(h, `$bak=Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList' | Where {$_.PSChildName -match '\\.bak$'}; if($bak){$bak | ForEach-Object { $orig=$_.PSChildName -replace '\\.bak$',''; Rename-Item $_.PSPath -NewName ($_.PSChildName+'.old') -Force; Write-Output "Gefunden+repariert: $($_.PSChildName)" }}else{Write-Output 'Kein Temp-Profil gefunden'}`), action: 'write' },
      ],
    },

    // ── 29: Datenträger-Verwaltung ────────────────────────────────────────────
    {
      id: 'diskmgmt', label: 'Datenträger-Verwaltung',
      commands: [
        { id: 'volumes', func: 'Volumes/Partitionen', when: 'Laufwerke-Übersicht',
          buildCmd: (h) => remote(h, `Get-Volume | Where DriveLetter | Select @{N='Laufwerk';E={$_.DriveLetter+':'}},@{N='Bezeichnung';E={$_.FileSystemLabel}},@{N='Dateisystem';E={$_.FileSystem}},@{N='Größe (GB)';E={[math]::Round($_.Size/1GB,1)}},@{N='Frei (GB)';E={[math]::Round($_.SizeRemaining/1GB,1)}},@{N='Zustand';E={$_.HealthStatus}} | ConvertTo-Json`), action: 'read' },
        { id: 'disksmart', func: 'Festplatten-Gesundheit SMART', when: 'SSD/HDD Zustand',
          buildCmd: (h) => remote(h, `Get-PhysicalDisk | Select @{N='Festplatte';E={$_.FriendlyName}},@{N='Typ';E={$_.MediaType}},@{N='Zustand';E={$_.HealthStatus}},@{N='Status';E={$_.OperationalStatus}},@{N='Größe (GB)';E={[math]::Round($_.Size/1GB,1)}},@{N='Bus';E={$_.BusType}} | ConvertTo-Json`), action: 'read' },
        { id: 'diskfreepct', func: 'Freier Speicher mit Prozent', when: 'Platz-Übersicht',
          buildCmd: (h) => remote(h, `Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select @{N='Laufwerk';E={$_.DeviceID}},@{N='Größe (GB)';E={[math]::Round($_.Size/1GB,1)}},@{N='Frei (GB)';E={[math]::Round($_.FreeSpace/1GB,1)}},@{N='Frei (%)';E={[math]::Round($_.FreeSpace/$_.Size*100,1)}} | ConvertTo-Json`), action: 'read' },
        { id: 'partshrink', func: 'Partition verkleinern', when: 'Platz freigeben',
          buildCmd: (h, i) => { const [dl, mb] = (i || 'C|1024').split('|'); return remote(h, `$p=Get-Partition -DriveLetter '${dl}'; $sup=Get-PartitionSupportedSize -DiskNumber $p.DiskNumber -PartitionNumber $p.PartitionNumber; $newSize=$p.Size-(${mb}*1MB); Resize-Partition -DiskNumber $p.DiskNumber -PartitionNumber $p.PartitionNumber -Size $newSize; Write-Output 'Verkleinert um ${mb} MB'`) }, action: 'critical',
          input: { type: 'diskpart' } },
        { id: 'partgrow', func: 'Partition vergrößern', when: 'Maximum nutzen — freien Platz nutzen',
          buildCmd: (h, i) => remote(h, `$p=Get-Partition -DriveLetter '${i || 'C'}'; $max=(Get-PartitionSupportedSize -DiskNumber $p.DiskNumber -PartitionNumber $p.PartitionNumber).SizeMax; Resize-Partition -DiskNumber $p.DiskNumber -PartitionNumber $p.PartitionNumber -Size $max; Write-Output 'Partition ${i || 'C'}: auf Maximum vergrößert'`), action: 'critical',
          input: { type: 'driveletter' } },
        { id: 'newvol', func: 'Neues Volume erstellen', when: 'Neue Partition auf freiem Speicher',
          buildCmd: (h, i) => { const [dn, dl] = (i || '0|E').split('|'); return remote(h, `$p=New-Partition -DiskNumber ${dn} -UseMaximumSize -DriveLetter '${dl}'; Format-Volume -DriveLetter '${dl}' -FileSystem NTFS -Confirm:$false; Write-Output 'Volume ${dl}: erstellt'`) }, action: 'critical',
          input: { type: 'diskvol' } },
        { id: 'changeletter', func: 'Laufwerksbuchstabe ändern', when: 'Buchstabe tauschen',
          buildCmd: (h, i) => { const [old, nw] = (i || 'D|E').split('|'); return remote(h, `$p=Get-Partition -DriveLetter '${old}'; Set-Partition -InputObject $p -NewDriveLetter '${nw}'; Write-Output '${old}: → ${nw}:'`) }, action: 'write',
          input: { type: 'diskletter' } },
        { id: 'diskinit', func: 'Datenträger initialisieren', when: 'Neue Festplatte einrichten (GPT/MBR)',
          buildCmd: (h, i) => { const [dn, style] = (i || '1|GPT').split('|'); return remote(h, `Initialize-Disk -Number ${dn} -PartitionStyle ${style} -Confirm:$false; Write-Output 'Disk ${dn} als ${style} initialisiert'`) }, action: 'critical',
          input: { type: 'diskvol' } },
        { id: 'chkdskrun', func: 'CHKDSK ausführen', when: 'Dateisystem prüfen/reparieren',
          buildCmd: (h, i) => remote(h, `Repair-Volume -DriveLetter '${i || 'C'}' -Scan | ConvertTo-Json`), action: 'write', longRunning: true,
          input: { type: 'driveletter' } },
        { id: 'trimssd', func: 'TRIM (SSD)', when: 'SSD optimieren — freie Blöcke zurückgeben',
          buildCmd: (h, i) => remote(h, `Optimize-Volume -DriveLetter '${i || 'C'}' -ReTrim -Verbose 2>&1`), action: 'write', longRunning: true,
          input: { type: 'driveletter' } },
        { id: 'defraghdd', func: 'Defragmentierung (HDD)', when: 'HDD defragmentieren — nur für mechanische Festplatten',
          buildCmd: (h, i) => remote(h, `Optimize-Volume -DriveLetter '${i || 'C'}' -Defrag -Verbose 2>&1`), action: 'write', longRunning: true,
          input: { type: 'driveletter' } },
        { id: 'emptybin', func: 'Papierkorb leeren', when: 'Papierkorb leer',
          buildCmd: (h) => remote(h, `Clear-RecycleBin -Force -Confirm:$false; Write-Output 'Papierkorb geleert'`), action: 'write' },
        { id: 'delwinold', func: 'Windows.old löschen', when: 'Altes Windows entfernen',
          buildCmd: (h) => remote(h, `if(Test-Path 'C:\\Windows.old'){Remove-Item 'C:\\Windows.old' -Recurse -Force; Write-Output 'Windows.old gelöscht'}else{Write-Output 'Windows.old nicht vorhanden'}`), action: 'critical', longRunning: true },
        { id: 'winsxsclean', func: 'WinSxS bereinigen', when: 'Komponentenspeicher',
          buildCmd: (h) => remote(h, `DISM /Online /Cleanup-Image /StartComponentCleanup /ResetBase 2>&1`), action: 'write', longRunning: true },
        { id: 'top10big', func: 'Top 10 größte Dateien', when: 'Platzfresser finden',
          buildCmd: (h, i) => remote(h, `Get-ChildItem '${i || 'C:\\'}' -Recurse -File -Force -EA SilentlyContinue | Sort Length -Descending | Select -First 10 FullName,@{N='SizeMB';E={[math]::Round($_.Length/1MB,1)}},LastWriteTime | ConvertTo-Json`), action: 'read', longRunning: true,
          input: { type: 'text', placeholder: 'Startpfad z.B. C:\\Users' },
          templates: [
            { label: 'C:\\', value: 'C:\\' },
            { label: 'C:\\Users', value: 'C:\\Users' },
            { label: 'C:\\Temp', value: 'C:\\Temp' },
            { label: 'D:\\', value: 'D:\\' },
          ] },
        { id: 'storagesense', func: 'Storage Sense aktivieren', when: 'Auto-Bereinigung',
          buildCmd: (h) => remote(h, `$rp='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy'; if(!(Test-Path $rp)){New-Item $rp -Force|Out-Null}; Set-ItemProperty $rp -Name '01' -Value 1 -Type DWord; Set-ItemProperty $rp -Name '04' -Value 1 -Type DWord; Write-Output 'Storage Sense aktiviert'`), action: 'write' },
      ],
    },

    // ── 30: Geplante Aufgaben auf Ziel-PC ─────────────────────────────────────
    {
      id: 'remotetasks', label: 'Geplante Aufgaben (Ziel-PC)',
      commands: [
        { id: 'rtasklist', func: 'Aktive Tasks anzeigen', when: 'Überblick',
          buildCmd: (h) => remote(h, `Get-ScheduledTask | Where State -ne 'Disabled' | Select @{N='Aufgabe';E={$_.TaskName}},@{N='Status';E={$_.State}},@{N='Nächste Ausführung';E={$info=$_|Get-ScheduledTaskInfo -EA SilentlyContinue;if($info.NextRunTime){$info.NextRunTime.ToString('dd.MM.yyyy HH:mm')}else{'—'}}} | ConvertTo-Json`), action: 'read' },
        { id: 'rtaskdetail', func: 'Task-Details', when: 'Einzelheiten',
          buildCmd: (h, i) => remote(h, `$t=Get-ScheduledTask -TaskName '${i}'; $info=$t | Get-ScheduledTaskInfo; @{Name=$t.TaskName;Path=$t.TaskPath;State=$t.State;Actions=$t.Actions|ForEach-Object{$_.Execute+' '+$_.Arguments};Triggers=$t.Triggers|ForEach-Object{$_.ToString()};LastRun=$info.LastRunTime;LastResult=$info.LastTaskResult;NextRun=$info.NextRunTime} | ConvertTo-Json`), action: 'read',
          input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'rtaskdisable', func: 'Task deaktivieren', when: 'Task ausschalten',
          buildCmd: (h, i) => remote(h, `Disable-ScheduledTask -TaskName '${i}'; Write-Output 'Deaktiviert: ${i}'`), action: 'write',
          input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'rtaskenable', func: 'Task aktivieren', when: 'Task einschalten',
          buildCmd: (h, i) => remote(h, `Enable-ScheduledTask -TaskName '${i}'; Write-Output 'Aktiviert: ${i}'`), action: 'write',
          input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'rtaskrun', func: 'Task sofort ausführen', when: 'Jetzt starten',
          buildCmd: (h, i) => remote(h, `Start-ScheduledTask -TaskName '${i}'; Write-Output 'Gestartet: ${i}'`), action: 'write',
          input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'rtaskdelete', func: 'Task löschen', when: 'Task entfernen',
          buildCmd: (h, i) => remote(h, `Unregister-ScheduledTask -TaskName '${i}' -Confirm:$false; Write-Output 'Gelöscht: ${i}'`), action: 'critical',
          input: { type: 'text', placeholder: 'Task-Name' } },
        { id: 'rtaskcreate', func: 'Neuen Task erstellen', when: 'Task anlegen',
          buildCmd: (h, i) => { const [name, exe, time] = (i || '||').split('|'); return remote(h, `$a=New-ScheduledTaskAction -Execute '${exe}'; $t=New-ScheduledTaskTrigger -Daily -At '${time || '08:00'}'; Register-ScheduledTask -TaskName '${name}' -Action $a -Trigger $t -User 'SYSTEM' | Select TaskName,State | ConvertTo-Json`) }, action: 'write',
          input: { type: 'text', placeholder: 'TaskName|ExePfad|Uhrzeit (z.B. MyTask|C:\\script.ps1|08:00)' } },
        { id: 'rtaskcustom', func: 'Custom vs Microsoft Tasks', when: 'Eigene Tasks filtern',
          buildCmd: (h) => remote(h, `Get-ScheduledTask | Where TaskPath -notlike '\\Microsoft\\*' | Select TaskName,TaskPath,State | ConvertTo-Json`), action: 'read' },
      ],
    },

    // ── DIAG-Skills (10 Gesundheits-Checks für IT Guru) ──────────────────────
    {
      id: 'diag', label: 'Diagnose-Checks (IT Guru)',
      commands: [
        { id: 'diag-outlook', func: 'DIAG: Outlook-Gesundheit', when: 'Outlook komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{ostSize='';addins=0;disabled=0;crashing=0;enaiostatus='';cachedmode='';ramMB=0}
$profiles=Get-ChildItem "$env:LOCALAPPDATA\\Microsoft\\Outlook\\*.ost" -EA SilentlyContinue
if($profiles){$r.ostSize=[math]::Round(($profiles|Measure-Object Length -Sum).Sum/1GB,2)}
$addins=(Get-ChildItem 'HKCU:\\Software\\Microsoft\\Office\\Outlook\\Addins' -EA SilentlyContinue).Count
$r.addins=$addins
$disabled=(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\DisabledItems' -EA SilentlyContinue)
if($disabled){$r.disabled=($disabled.PSObject.Properties|Where Name -ne 'PSPath'|Where Name -ne 'PSParentPath'|Where Name -ne 'PSChildName'|Where Name -ne 'PSProvider'|Where Name -ne 'PSDrive').Count}
$crash=(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\CrashingAddinList' -EA SilentlyContinue)
if($crash){$r.crashing=($crash.PSObject.Properties|Where Name -notmatch '^PS').Count}
$ol=Get-Process outlook -EA SilentlyContinue
if($ol){$r.ramMB=[math]::Round($ol.WorkingSet64/1MB,0)}
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-teams', func: 'DIAG: Teams-Gesundheit', when: 'Teams komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{running=$false;cpuPct=0;ramMB=0;cacheSizeMB=0;camera='';mic='';ping=$false}
$t=Get-Process ms-teams,Teams -EA SilentlyContinue|Select -First 1
if($t){$r.running=$true;$r.ramMB=[math]::Round($t.WorkingSet64/1MB,0)}
$cache="$env:LOCALAPPDATA\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache"
if(Test-Path $cache){$r.cacheSizeMB=[math]::Round((Get-ChildItem $cache -Recurse -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum/1MB,0)}
$cam=Get-PnpDevice -Class Camera -EA SilentlyContinue|Where Status -eq OK
$r.camera=if($cam){'OK'}else{'Nicht gefunden'}
$mic=Get-PnpDevice -Class AudioEndpoint -EA SilentlyContinue|Where Status -eq OK|Select -First 1
$r.mic=if($mic){$mic.FriendlyName}else{'Nicht gefunden'}
$r.ping=Test-Connection 8.8.8.8 -Count 1 -Quiet
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-network', func: 'DIAG: Netzwerk-Komplett', when: 'Netzwerk komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{ping8888=$false;dnsGoogle='';gatewayPing=$false;dhcp='';apipa=$false;proxy='';zscaler='';vpn='';adapterStatus=''}
$r.ping8888=Test-Connection 8.8.8.8 -Count 1 -Quiet
try{$r.dnsGoogle=(Resolve-DnsName google.com -EA Stop|Select -First 1).IPAddress}catch{$r.dnsGoogle='FEHLER'}
$gw=(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue|Select -First 1).NextHop
if($gw){$r.gatewayPing=Test-Connection $gw -Count 1 -Quiet}
$ip=Get-NetIPAddress -AddressFamily IPv4|Where{$_.IPAddress -notmatch '^(127|169\\.254)'}|Select -First 1
$r.dhcp=if($ip.PrefixOrigin -eq 'Dhcp'){'DHCP'}else{'Statisch'}
$r.apipa=(Get-NetIPAddress -AddressFamily IPv4|Where{$_.IPAddress -match '^169\\.254'}).Count -gt 0
$prx=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -EA SilentlyContinue
$r.proxy=if($prx.ProxyEnable -eq 1){$prx.ProxyServer}else{'Kein Proxy'}
$zsc=Get-Service ZscalerService -EA SilentlyContinue
$r.zscaler=if($zsc){$zsc.Status.ToString()}else{'Nicht installiert'}
$vpnA=Get-NetAdapter|Where{$_.InterfaceDescription -match 'VPN|Tunnel|TAP|Cisco|Juniper'}
$r.vpn=if($vpnA){$vpnA.Status}else{'Kein VPN'}
$r.adapterStatus=(Get-NetAdapter|Where Status -eq 'Up'|Select -First 1).Name
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-performance', func: 'DIAG: Performance-Komplett', when: 'Performance komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{cpuPct=0;ramFreeMB=0;ramTotalMB=0;diskFreePct=0;top5='';autostartCount=0;tempSizeMB=0;uptimeDays=0;powerPlan=''}
$r.cpuPct=[math]::Round((Get-CimInstance Win32_Processor).LoadPercentage,0)
$os=Get-CimInstance Win32_OperatingSystem
$r.ramFreeMB=[math]::Round($os.FreePhysicalMemory/1KB,0)
$r.ramTotalMB=[math]::Round($os.TotalVisibleMemorySize/1KB,0)
$disk=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$r.diskFreePct=[math]::Round($disk.FreeSpace/$disk.Size*100,1)
$r.top5=(Get-Process|Sort CPU -Descending|Select -First 5 ProcessName,@{N='CPU';E={[math]::Round($_.CPU,1)}},@{N='RAM_MB';E={[math]::Round($_.WorkingSet64/1MB,0)}}|ConvertTo-Json -Compress)
$r.autostartCount=(Get-CimInstance Win32_StartupCommand).Count
$tmp="$env:TEMP"
if(Test-Path $tmp){$r.tempSizeMB=[math]::Round((Get-ChildItem $tmp -Recurse -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum/1MB,0)}
$r.uptimeDays=[math]::Round(((Get-Date)-(Get-CimInstance Win32_OperatingSystem).LastBootUpTime).TotalDays,1)
$r.powerPlan=(powercfg /getactivescheme 2>&1).ToString()
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-auth', func: 'DIAG: Authentifizierung-Komplett', when: 'Auth komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{secureChannel=$false;kerberosTickets=0;timeDiffSec=0;dnsDomain='';lockout=$false;badPwdCount=0}
try{$r.secureChannel=Test-ComputerSecureChannel}catch{$r.secureChannel=$false}
$tickets=klist 2>&1
$r.kerberosTickets=($tickets|Select-String '#\\d+').Count
try{$dc=[System.DirectoryServices.ActiveDirectory.Domain]::GetComputerDomain().DomainControllers[0].Name
$dcTime=Invoke-Command -ComputerName $dc -ScriptBlock{Get-Date} -EA Stop
$r.timeDiffSec=[math]::Abs(((Get-Date)-$dcTime).TotalSeconds)}catch{$r.timeDiffSec=-1}
$r.dnsDomain=$env:USERDNSDOMAIN
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-printer', func: 'DIAG: Drucker-Komplett', when: 'Drucker komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{spoolerStatus='';jobCount=0;printers=@();defaultPrinter=''}
$r.spoolerStatus=(Get-Service Spooler).Status.ToString()
$r.jobCount=(Get-PrintJob -PrinterName * -EA SilentlyContinue).Count
$r.printers=Get-Printer|Select Name,PortName,DriverName,PrinterStatus|ConvertTo-Json -Compress
$r.defaultPrinter=(Get-CimInstance Win32_Printer|Where Default -eq $true).Name
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-zscaler', func: 'DIAG: Zscaler-Komplett', when: 'Zscaler komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{service='';tunnel='';cert='';proxy='';httpTest=''}
$svc=Get-Service ZscalerService -EA SilentlyContinue
$r.service=if($svc){$svc.Status.ToString()}else{'Nicht installiert'}
$tun=Get-Process ZSATunnel -EA SilentlyContinue
$r.tunnel=if($tun){'Läuft'}else{'Gestoppt'}
$certs=Get-ChildItem Cert:\\LocalMachine\\Root|Where{$_.Subject -match 'Zscaler'}
$r.cert=if($certs){if($certs[0].NotAfter -lt (Get-Date)){'ABGELAUFEN: '+$certs[0].NotAfter}else{'OK bis '+$certs[0].NotAfter}}else{'Nicht gefunden'}
$prx=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -EA SilentlyContinue
$r.proxy=if($prx.ProxyEnable){'Aktiv: '+$prx.ProxyServer}else{'Kein Proxy'}
try{$web=Invoke-WebRequest 'http://ip.zscaler.com' -UseBasicParsing -TimeoutSec 5;$r.httpTest='OK ('+$web.StatusCode+')'}catch{$r.httpTest='FEHLER: '+$_.Exception.Message}
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-enaio', func: 'DIAG: enaio-Komplett', when: 'enaio komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{addinLoaded=$false;disabled=0;crashing=0;dllVersion='';cacheSizeMB=0}
$addins=Get-ChildItem 'HKCU:\\Software\\Microsoft\\Office\\Outlook\\Addins' -EA SilentlyContinue|Where{(Get-ItemProperty $_.PSPath).FriendlyName -match 'enaio|OS_'}
$r.addinLoaded=$addins.Count -gt 0
$dis=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\DisabledItems' -EA SilentlyContinue
if($dis){$r.disabled=($dis.PSObject.Properties|Where Name -notmatch '^PS').Count}
$crash=Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Office\\16.0\\Outlook\\Resiliency\\CrashingAddinList' -EA SilentlyContinue
if($crash){$r.crashing=($crash.PSObject.Properties|Where Name -notmatch '^PS').Count}
$dll=Get-ChildItem 'C:\\Program Files*\\enaio\\*.dll' -EA SilentlyContinue|Select -First 1
if($dll){$r.dllVersion=$dll.VersionInfo.FileVersion}
$cache="$env:LOCALAPPDATA\\enaio"
if(Test-Path $cache){$r.cacheSizeMB=[math]::Round((Get-ChildItem $cache -Recurse -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum/1MB,0)}
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-hardware', func: 'DIAG: Hardware-Komplett', when: 'Hardware komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{errorDevices=@();battery='';audioDevices=0;usbErrors=0;bluetooth=''}
$err=Get-PnpDevice|Where Status -ne 'OK'|Select FriendlyName,Status,InstanceId
$r.errorDevices=if($err){$err|ConvertTo-Json -Compress}else{'[]'}
$bat=Get-CimInstance Win32_Battery -EA SilentlyContinue
$r.battery=if($bat){"$($bat.EstimatedChargeRemaining)% - Status: $($bat.Status)"}else{'Kein Akku'}
$r.audioDevices=(Get-PnpDevice -Class AudioEndpoint -EA SilentlyContinue|Where Status -eq OK).Count
$r.usbErrors=(Get-PnpDevice|Where{$_.Class -eq 'USB' -and $_.Status -ne 'OK'}).Count
$bt=Get-PnpDevice -Class Bluetooth -EA SilentlyContinue|Where Status -eq OK
$r.bluetooth=if($bt){'OK'}else{'Nicht verfügbar'}
$r | ConvertTo-Json`), action: 'read' },

        { id: 'diag-disk', func: 'DIAG: Datenträger-Komplett', when: 'Datenträger komplett prüfen',
          buildCmd: (h) => remote(h, `
$r=@{volumes='';smartStatus='';tempSizeMB=0;downloadsSizeMB=0;binSizeMB=0;pagefileSizeMB=0}
$r.volumes=(Get-Volume|Where DriveLetter|Select DriveLetter,@{N='SizeGB';E={[math]::Round($_.Size/1GB,1)}},@{N='FreeGB';E={[math]::Round($_.SizeRemaining/1GB,1)}},HealthStatus|ConvertTo-Json -Compress)
$r.smartStatus=(Get-PhysicalDisk|Select FriendlyName,HealthStatus,MediaType|ConvertTo-Json -Compress)
$tmp="$env:TEMP"
if(Test-Path $tmp){$r.tempSizeMB=[math]::Round((Get-ChildItem $tmp -Recurse -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum/1MB,0)}
$dl=[Environment]::GetFolderPath('UserProfile')+'\\Downloads'
if(Test-Path $dl){$r.downloadsSizeMB=[math]::Round((Get-ChildItem $dl -Recurse -Force -EA SilentlyContinue|Measure-Object Length -Sum).Sum/1MB,0)}
$pf=Get-CimInstance Win32_PageFileUsage -EA SilentlyContinue
if($pf){$r.pagefileSizeMB=$pf.AllocatedBaseSize}
$r | ConvertTo-Json`), action: 'read', longRunning: true },
      ],
    },
  ]
}
