// ── Wissensdatenbank Generator ─────────────────────────────────────────────────
// Generates a complete IT knowledge base with 150+ articles on first app start.

interface Step { title: string; content: string }
interface Article { id: string; title: string; description: string; tags: string[]; steps: Step[]; relatedSkills: string[] }
interface Subcategory { id: string; name: string; articles: Article[] }
interface Category { id: string; name: string; icon: string; subcategories: Subcategory[] }

export function generateWissensdatenbank() {
  const categories: Category[] = [

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. WINDOWS
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'windows', name: 'Windows', icon: 'monitor',
      subcategories: [
        { id: 'win-bsod', name: 'Bluescreen / Absturz', articles: [
          { id:'win-bsod-001', title:'Bluescreen beim Starten beheben', description:'PC zeigt Bluescreen beim Hochfahren', tags:['bluescreen','bsod','absturz','irql'], steps:[
            {title:'Event-Log prüfen', content:'Ereignisanzeige öffnen: Windows-Taste > "Ereignisanzeige" tippen > Enter.\n\nGehe zu Windows-Protokolle > System. Suche nach roten Einträgen mit Quelle "BugCheck".\n\nDer Stop-Code (z.B. IRQL_NOT_LESS_OR_EQUAL) sagt dir die Ursache.'},
            {title:'Treiber prüfen', content:'Geräte-Manager öffnen: Rechtsklick auf Start > Geräte-Manager.\n\nSuche nach Geräten mit gelbem Ausrufezeichen. Rechtsklick > Treiber aktualisieren.\n\nWenn der Bluescreen einen Dateinamen nennt (z.B. nvlddmkm.sys = NVIDIA), diesen Treiber neu installieren.'},
            {title:'RAM testen', content:'Windows-Taste + R > mdsched.exe > Enter.\n\nWähle "Jetzt neu starten und nach Problemen suchen".\n\nDer PC startet neu und testet den Arbeitsspeicher. Dauert ca. 10-20 Minuten.'},
            {title:'Systemdateien reparieren', content:'PowerShell als Administrator öffnen (Rechtsklick auf Start > Terminal (Admin)):\n\nsfc /scannow\n\nWarten bis 100%. Dann:\n\nDISM /Online /Cleanup-Image /RestoreHealth\n\nDanach PC neu starten.'},
          ], relatedSkills:['rd_repair_sfc','rd_repair_dism','rd_repair_evtcrit'] },
          { id:'win-bsod-002', title:'IRQL_NOT_LESS_OR_EQUAL beheben', description:'Häufigster Bluescreen — meist Treiber- oder RAM-Problem', tags:['irql','treiber','ram','bluescreen'], steps:[
            {title:'Stop-Code identifizieren', content:'Im Bluescreen steht der Stop-Code. IRQL_NOT_LESS_OR_EQUAL bedeutet: Ein Treiber oder Systemprozess greift auf ungültigen Speicher zu.\n\nHäufigste Ursachen:\n• Veralteter/fehlerhafter Treiber\n• Defekter RAM\n• Inkompatible Software'},
            {title:'Kürzlich installierte Treiber prüfen', content:'PowerShell als Admin:\n\nGet-WinEvent -FilterHashtable @{LogName="System";Id=6006} -MaxEvents 5\n\nGeräte-Manager > Ansicht > Ausgeblendete Geräte anzeigen.\n\nPrüfe ob kürzlich ein Treiber aktualisiert wurde. Wenn ja: Rechtsklick > Eigenschaften > Treiber > Vorheriger Treiber.'},
            {title:'Speicherdiagnose ausführen', content:'Starte die Windows-Speicherdiagnose:\n\nmdsched.exe\n\nOder im abgesicherten Modus: Start > Shift gedrückt halten > Neu starten > Problembehandlung > Erweiterte Optionen > Starteinstellungen > F4 (Abgesicherter Modus)'},
          ], relatedSkills:['rd_repair_evtcrit','rd_drivers_driverfail','rd_hw_hwram'] },
          { id:'win-bsod-003', title:'CRITICAL_PROCESS_DIED beheben', description:'Windows-Systemprozess wurde unerwartet beendet', tags:['critical process','bsod','systemdatei'], steps:[
            {title:'Im abgesicherten Modus starten', content:'PC starten > beim Windows-Logo Einschalttaste 10 Sek. halten (3x wiederholen).\n\nWindows startet automatisch in die Reparaturumgebung.\n\nProblembehandlung > Erweiterte Optionen > Starteinstellungen > Neu starten > F4'},
            {title:'SFC und DISM ausführen', content:'Im abgesicherten Modus PowerShell als Admin öffnen:\n\nsfc /scannow\nDISM /Online /Cleanup-Image /RestoreHealth\n\nBeide Befehle komplett durchlaufen lassen. PC neu starten.'},
            {title:'Letzte Updates prüfen', content:'Einstellungen > Windows Update > Updateverlauf.\n\nWenn das Problem nach einem Update begann:\n\nPowerShell als Admin:\nGet-HotFix | Sort-Object InstalledOn -Descending | Select -First 5\n\nUpdate deinstallieren:\nwusa /uninstall /kb:XXXXXXX /quiet /norestart'},
          ], relatedSkills:['rd_repair_sfc','rd_repair_dism','rd_gpo_hotfix'] },
          { id:'win-bsod-004', title:'MEMORY_MANAGEMENT Bluescreen', description:'Speicherverwaltungsfehler — RAM oder Treiber defekt', tags:['memory management','ram','speicher'], steps:[
            {title:'RAM-Module prüfen', content:'PowerShell:\n\nGet-CimInstance Win32_PhysicalMemory | Select BankLabel, Capacity, Speed, Manufacturer\n\nZeigt alle RAM-Module. Prüfe ob alle gleiche Geschwindigkeit haben.'},
            {title:'Speicherdiagnose starten', content:'mdsched.exe ausführen oder:\n\nPowerShell als Admin:\nRestart-Computer -ComputerName localhost'},
            {title:'Virtuellen Speicher prüfen', content:'Einstellungen > System > Info > Erweiterte Systemeinstellungen > Leistung > Einstellungen > Erweitert > Virtueller Arbeitsspeicher.\n\nSetze auf "Automatisch verwalten" oder mindestens 1.5x RAM-Größe.'},
          ], relatedSkills:['rd_hw_hwram','rd_procs_ramload'] },
          { id:'win-bsod-005', title:'VIDEO_TDR_FAILURE (Grafiktreiber-Absturz)', description:'Grafikkarte reagiert nicht rechtzeitig', tags:['video tdr','grafikkarte','nvidia','amd','gpu'], steps:[
            {title:'Grafiktreiber identifizieren', content:'Der Bluescreen nennt oft den Treiber:\n• nvlddmkm.sys = NVIDIA\n• atikmpag.sys = AMD\n• igdkmd64.sys = Intel\n\nPowerShell:\nGet-CimInstance Win32_VideoController | Select Name, DriverVersion'},
            {title:'Treiber aktualisieren oder zurücksetzen', content:'Option 1 — Aktualisieren:\nGeräte-Manager > Grafikkarten > Rechtsklick > Treiber aktualisieren\n\nOption 2 — Zurücksetzen:\nGeräte-Manager > Grafikkarten > Rechtsklick > Eigenschaften > Treiber > Vorheriger Treiber\n\nOption 3 — Sauber neu installieren:\nDDU (Display Driver Uninstaller) im abgesicherten Modus ausführen, dann aktuellen Treiber installieren.'},
            {title:'Energieeinstellungen anpassen', content:'PowerShell:\npowercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c\n\nDas setzt den Hochleistungs-Energieplan. Verhindert dass die GPU in den Stromsparmodus wechselt.'},
          ], relatedSkills:['rd_hw_hwgpu','rd_drivers_driverlist','rd_sysconfig_powerhigh'] },
        ]},
        { id: 'win-start', name: 'Startprobleme', articles: [
          { id:'win-start-001', title:'PC startet nicht — schwarzer Bildschirm', description:'PC ist an aber zeigt nichts an', tags:['schwarzer bildschirm','kein bild','boot'], steps:[
            {title:'Hardware prüfen', content:'• Ist der Monitor eingeschaltet und das richtige Eingangssignal gewählt?\n• Kabel fest eingesteckt (HDMI/DisplayPort)?\n• Bei Laptop: Externe Anzeige mit Windows+P versuchen\n• Bei Desktop: Anderen Monitor/Kabel testen'},
            {title:'BIOS erreichen', content:'PC ausschalten (Einschalttaste 10 Sek. halten).\n\nNeu starten und sofort F2, F12, DEL oder ESC drücken (je nach Hersteller).\n\nWenn BIOS erscheint: Hardware funktioniert, Problem ist Software.'},
            {title:'Abgesicherter Modus', content:'3x den Start unterbrechen (beim Windows-Logo Einschalttaste halten).\n\nWindows startet in die Reparaturumgebung.\n\nProblembehandlung > Erweiterte Optionen > Starteinstellungen > F4'},
            {title:'Grafiktreiber im abgesicherten Modus deinstallieren', content:'Im abgesicherten Modus:\n\nGeräte-Manager > Grafikkarten > Rechtsklick > Gerät deinstallieren > "Treibersoftware löschen" anhaken > Deinstallieren.\n\nPC neu starten — Windows installiert einen Standard-Treiber.'},
          ], relatedSkills:['rd_hw_hwgpu','rd_hw_hwcs'] },
          { id:'win-start-002', title:'Bootloop — PC startet immer wieder neu', description:'PC startet, zeigt kurz etwas an und startet sofort wieder', tags:['bootloop','neustart','boot'], steps:[
            {title:'Automatischen Neustart deaktivieren', content:'In der Reparaturumgebung (3x Start unterbrechen):\n\nProblembehandlung > Erweiterte Optionen > Starteinstellungen > F9 (Automatischen Neustart deaktivieren)\n\nJetzt wird der Bluescreen/Fehler angezeigt statt sofort neu zu starten.'},
            {title:'Starthilfe ausführen', content:'Reparaturumgebung > Problembehandlung > Erweiterte Optionen > Starthilfe.\n\nWindows versucht automatisch Startprobleme zu beheben. Kann 10-30 Min. dauern.'},
            {title:'Bootkonfiguration reparieren', content:'Reparaturumgebung > Eingabeaufforderung:\n\nbootrec /fixmbr\nbootrec /fixboot\nbootrec /scanos\nbootrec /rebuildbcd\n\nDanach: exit und PC neu starten.'},
          ], relatedSkills:['rd_repair_sfc','rd_repair_dism'] },
          { id:'win-start-003', title:'Windows bleibt beim Laden hängen', description:'Ladekreis dreht sich endlos, kein Login-Bildschirm', tags:['laden','hängt','boot','langsam'], steps:[
            {title:'Warten', content:'Manchmal dauert es nach Updates 10-30 Minuten. Wenn "Updates werden konfiguriert" erscheint: NICHT ausschalten!\n\nWenn nach 30 Min. nichts passiert: Einschalttaste 10 Sek. halten.'},
            {title:'Abgesicherter Modus mit Netzwerk', content:'3x Start unterbrechen > Problembehandlung > Starteinstellungen > F5 (Abgesicherter Modus mit Netzwerk).\n\nDort prüfen:\n• Autostart bereinigen (msconfig > Systemstart)\n• Kürzlich installierte Software deinstallieren'},
            {title:'Schnellstart deaktivieren', content:'Im abgesicherten Modus:\n\nPowerShell als Admin:\npowercfg /h off\n\nOder: Energieoptionen > Auswählen was beim Drücken des Netzschalters geschehen soll > "Schnellstart aktivieren" deaktivieren.'},
          ], relatedSkills:['rd_procs_autostart','rd_sysconfig_powerhigh'] },
          { id:'win-start-004', title:'Reparaturumgebung starten und nutzen', description:'So kommst du in die Windows-Reparaturoptionen', tags:['reparatur','recovery','winre','abgesichert'], steps:[
            {title:'Reparaturumgebung erreichen', content:'Methode 1: 3x den Start unterbrechen (beim Windows-Logo Einschalttaste 10 Sek. halten)\n\nMethode 2: Von einem USB-Stick booten (Windows-Installationsmedium)\n\nMethode 3: Einstellungen > System > Wiederherstellung > Erweiterter Start > Jetzt neu starten'},
            {title:'Verfügbare Optionen', content:'In der Reparaturumgebung:\n\n• Starthilfe — Automatische Reparatur\n• Starteinstellungen — Abgesicherter Modus, Debug-Modus\n• Eingabeaufforderung — Manuelle Befehle\n• Updates deinstallieren — Letztes Update entfernen\n• Systemwiederherstellung — Zu einem Wiederherstellungspunkt zurück\n• System-Image-Wiederherstellung — Komplettes Backup zurückspielen'},
          ], relatedSkills:['rd_repair_sfc'] },
        ]},
        { id: 'win-perf', name: 'Performance', articles: [
          { id:'win-perf-001', title:'PC ist extrem langsam — Ursache finden', description:'PC reagiert träge, alles dauert ewig', tags:['langsam','performance','cpu','ram','task-manager'], steps:[
            {title:'Task-Manager öffnen', content:'Strg+Shift+Escape drücken. Tab "Leistung" prüfen:\n\n• CPU über 80% dauerhaft = Problem\n• Arbeitsspeicher über 90% = Problem\n• Datenträger über 80% = Problem\n\nTab "Prozesse" — nach CPU oder Arbeitsspeicher sortieren um den Verursacher zu finden.'},
            {title:'Autostart aufräumen', content:'Task-Manager > Tab "Autostart".\n\nDeaktiviere was nicht nötig ist (Rechtsklick > Deaktivieren):\n• Adobe Update Service\n• Spotify\n• Skype\n• diverse Hersteller-Tools\n\nNach dem Deaktivieren PC neu starten.'},
            {title:'Temp-Dateien löschen', content:'PowerShell als Admin:\n\nRemove-Item -Path "$env:TEMP\\*" -Recurse -Force -ErrorAction SilentlyContinue\nRemove-Item -Path "C:\\Windows\\Temp\\*" -Recurse -Force -ErrorAction SilentlyContinue\nClear-DnsClientCache'},
            {title:'Festplatte prüfen', content:'PowerShell als Admin:\n\nGet-PhysicalDisk | Select FriendlyName, MediaType, HealthStatus\n\nWenn HealthStatus nicht "Healthy": Festplatte bald tauschen!\n\nBei HDD: Optimize-Volume -DriveLetter C -Defrag\nBei SSD: Optimize-Volume -DriveLetter C -ReTrim'},
          ], relatedSkills:['rd_procs_topcpu','rd_procs_topram','rd_procs_autostart','rd_disk_wintemp'] },
          { id:'win-perf-002', title:'Festplatte dauerhaft bei 100%', description:'Datenträger-Auslastung im Task-Manager ständig bei 100%', tags:['festplatte','100%','disk','datenträger'], steps:[
            {title:'Verursacher finden', content:'Task-Manager > Prozesse > Nach "Datenträger" sortieren.\n\nHäufige Verursacher:\n• Service Host: SysMain (Superfetch)\n• Windows Search\n• Antivirus-Scan\n• Windows Update'},
            {title:'SysMain/Superfetch deaktivieren', content:'PowerShell als Admin:\n\nStop-Service SysMain\nSet-Service SysMain -StartupType Disabled\n\nDas deaktiviert den Superfetch-Dienst. Bei SSDs unnötig.'},
            {title:'Windows-Suche temporär stoppen', content:'PowerShell als Admin:\n\nStop-Service WSearch\n\nWenn die Festplatten-Last sofort sinkt, ist der Suchdienst schuld.\n\nPermanent deaktivieren:\nSet-Service WSearch -StartupType Disabled'},
          ], relatedSkills:['rd_procs_topcpu','rd_appcache_searchreset'] },
          { id:'win-perf-003', title:'Hohe CPU-Auslastung durch bestimmten Prozess', description:'Ein Programm belegt dauerhaft CPU', tags:['cpu','prozess','auslastung','task-manager'], steps:[
            {title:'Prozess identifizieren', content:'Task-Manager > Prozesse > Nach CPU sortieren.\n\nOder PowerShell:\nGet-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name, CPU, WorkingSet64'},
            {title:'Prozess beenden', content:'Task-Manager: Rechtsklick auf Prozess > Task beenden.\n\nOder PowerShell:\nStop-Process -Name "ProzessName" -Force\n\nACHTUNG: System-Prozesse (svchost, csrss, lsass) NICHT beenden!'},
            {title:'Wenn svchost CPU frisst', content:'svchost hostet Windows-Dienste. Um herauszufinden welcher:\n\nTask-Manager > Details > svchost.exe suchen > Rechtsklick > Zu Dienst(en) wechseln.\n\nOder PowerShell:\nGet-Process svchost | Sort CPU -Desc | Select -First 5 Id, CPU'},
          ], relatedSkills:['rd_procs_topcpu','rd_procs_killname'] },
        ]},
        { id: 'win-update', name: 'Windows Update', articles: [
          { id:'win-upd-001', title:'Windows Update schlägt fehl', description:'Updates können nicht installiert werden, Fehlercodes', tags:['update','fehler','fehlgeschlagen','windows update'], steps:[
            {title:'Fehlercode notieren', content:'Einstellungen > Windows Update > Updateverlauf.\n\nNotiere den Fehlercode (z.B. 0x80070002, 0x800705b4).\n\nHäufige Codes:\n• 0x80070002 = Datei nicht gefunden → SoftwareDistribution löschen\n• 0x80073712 = Komponentenspeicher beschädigt → DISM\n• 0x800f0922 = Kein Platz oder VPN aktiv'},
            {title:'Update-Dienste zurücksetzen', content:'PowerShell als Admin:\n\nStop-Service wuauserv, bits, cryptsvc -Force\nRemove-Item C:\\Windows\\SoftwareDistribution -Recurse -Force\nRemove-Item C:\\Windows\\System32\\catroot2 -Recurse -Force\nStart-Service wuauserv, bits, cryptsvc\n\nDann: Einstellungen > Windows Update > Nach Updates suchen'},
            {title:'DISM und SFC ausführen', content:'PowerShell als Admin:\n\nDISM /Online /Cleanup-Image /RestoreHealth\nsfc /scannow\n\nBeide komplett durchlaufen lassen. Danach neu starten und Updates erneut versuchen.'},
          ], relatedSkills:['rd_appcache_wupdatereset','rd_repair_sfc','rd_repair_dism'] },
          { id:'win-upd-002', title:'Update hängt bei Prozent-Anzeige', description:'Update bleibt bei 0%, 30% oder 99% stehen', tags:['update','hängt','prozent','steckt'], steps:[
            {title:'Warten', content:'Manche Updates (besonders Feature-Updates) dauern 30-60 Minuten. Erst nach 2 Stunden ohne Fortschritt eingreifen.\n\nPrüfe ob die Festplatten-LED blinkt — dann arbeitet Windows noch.'},
            {title:'Neustart erzwingen', content:'Wenn wirklich nichts mehr passiert:\n\nEinschalttaste 10 Sekunden halten.\n\nBeim nächsten Start wird Windows das Update rückgängig machen oder fortsetzen.'},
            {title:'Update-Cache leeren', content:'PowerShell als Admin:\n\nStop-Service wuauserv -Force\nRemove-Item C:\\Windows\\SoftwareDistribution\\Download\\* -Recurse -Force\nStart-Service wuauserv\n\nDann Updates erneut suchen.'},
          ], relatedSkills:['rd_appcache_wupdatereset'] },
          { id:'win-upd-003', title:'Bestimmtes Update deinstallieren', description:'Nach einem Update Probleme — Update zurücknehmen', tags:['update','deinstallieren','zurücksetzen','rollback'], steps:[
            {title:'Update über Einstellungen entfernen', content:'Einstellungen > Windows Update > Updateverlauf > Updates deinstallieren.\n\nSuche das problematische Update (nach Datum sortiert) > Deinstallieren.'},
            {title:'Update per Kommandozeile entfernen', content:'PowerShell als Admin:\n\nGet-HotFix | Sort InstalledOn -Desc | Select -First 10 HotFixID, InstalledOn, Description\n\nUpdate entfernen:\nwusa /uninstall /kb:XXXXXXX /quiet /norestart\n\n(XXXXXXX durch die KB-Nummer ersetzen)'},
          ], relatedSkills:['rd_gpo_hotfix','rd_gpo_hotfixid'] },
        ]},
        { id: 'win-dienste', name: 'Dienste / Services', articles: [
          { id:'win-svc-001', title:'Windows-Dienst startet nicht', description:'Ein bestimmter Dienst lässt sich nicht starten', tags:['dienst','service','startet nicht','fehler'], steps:[
            {title:'Dienst-Status prüfen', content:'PowerShell:\n\nGet-Service -Name "DienstName" | Select Name, Status, StartType\n\nOder services.msc öffnen und den Dienst suchen.'},
            {title:'Abhängigkeiten prüfen', content:'services.msc > Dienst doppelklicken > Tab "Abhängigkeiten".\n\nAlle Dienste die dieser Dienst braucht müssen laufen.\n\nOder PowerShell:\nGet-Service -Name "DienstName" -DependentServices'},
            {title:'Dienst reparieren', content:'PowerShell als Admin:\n\n# Dienst stoppen und neu starten\nStop-Service -Name "DienstName" -Force\nStart-Service -Name "DienstName"\n\n# Wenn das nicht hilft — Starttyp auf Automatisch setzen:\nSet-Service -Name "DienstName" -StartupType Automatic\n\n# Dienst neu registrieren (nur wenn nichts anderes hilft):\nsc.exe delete "DienstName"\nsc.exe create "DienstName" ...'},
          ], relatedSkills:['rd_svc_svc-start','rd_svc_svc-restart'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. MICROSOFT OFFICE
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'office', name: 'Microsoft Office', icon: 'file-text',
      subcategories: [
        { id: 'off-outlook', name: 'Outlook', articles: [
          { id:'off-ol-001', title:'Outlook startet nicht', description:'Outlook öffnet sich nicht oder stürzt beim Start ab', tags:['outlook','startet nicht','absturz','profil'], steps:[
            {title:'Outlook im abgesicherten Modus starten', content:'Windows-Taste + R > outlook.exe /safe > Enter.\n\nWenn Outlook im Safe Mode startet: Ein Add-In ist schuld.\n\nDatei > Optionen > Add-Ins > COM-Add-Ins verwalten > Alle deaktivieren > Eins nach dem anderen aktivieren.'},
            {title:'Outlook-Profil reparieren', content:'Systemsteuerung > Mail > Profile anzeigen > Profil auswählen > Eigenschaften > E-Mail-Konten > Reparieren.\n\nOder: Outlook komplett schließen. Dann:\n\noutlook.exe /resetnavpane\noutlook.exe /cleanviews'},
            {title:'Neues Outlook-Profil erstellen', content:'Systemsteuerung > Mail > Profile anzeigen > Hinzufügen.\n\nNeuen Profilnamen eingeben. E-Mail-Adresse und ggf. Passwort eingeben.\n\nDas neue Profil als Standard setzen.'},
            {title:'Office reparieren', content:'Einstellungen > Apps > Installierte Apps > Microsoft 365 > Ändern.\n\n• Schnellreparatur: Behebt die meisten Probleme, dauert 5 Min.\n• Online-Reparatur: Gründlicher, dauert 15-30 Min., braucht Internet.'},
          ], relatedSkills:['rd_appcache_outlookrepair','rd_appcache_officequick','rd_appcache_officefull'] },
          { id:'off-ol-002', title:'Outlook-Suche funktioniert nicht', description:'Suche findet keine E-Mails oder ist leer', tags:['outlook','suche','index','findet nichts'], steps:[
            {title:'Suchindex neu aufbauen', content:'Outlook > Datei > Optionen > Suche > Indizierungsoptionen > Erweitert > Neu erstellen.\n\nDauert 30-60 Minuten. Outlook danach neu starten.'},
            {title:'Windows-Suchdienst prüfen', content:'PowerShell:\n\nGet-Service WSearch | Select Status\n\nWenn "Stopped":\nStart-Service WSearch\nSet-Service WSearch -StartupType Automatic'},
            {title:'Registry-Fix für Outlook-Suche', content:'Windows-Taste + R > regedit > Enter.\n\nNavigiere zu: HKEY_LOCAL_MACHINE\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search\n\nSetze "PreventIndexingOutlook" auf 0 (oder lösche den Wert).'},
          ], relatedSkills:['rd_appcache_searchreset','rd_appcache_outlookrepair'] },
          { id:'off-ol-003', title:'OST-Datei zu groß oder beschädigt', description:'Outlook ist langsam wegen großer OST-Datei', tags:['ost','cache','groß','langsam','offline'], steps:[
            {title:'OST-Größe prüfen', content:'Die OST-Datei liegt unter:\n%LOCALAPPDATA%\\Microsoft\\Outlook\\\n\nPowerShell:\nGet-ChildItem "$env:LOCALAPPDATA\\Microsoft\\Outlook\\*.ost" | Select Name, @{N="SizeMB";E={[math]::Round($_.Length/1MB,1)}}'},
            {title:'OST-Datei neu erstellen', content:'1. Outlook komplett schließen\n2. Die .ost-Datei UMBENENNEN (nicht löschen!) in .ost.bak\n3. Outlook starten — es erstellt automatisch eine neue OST-Datei\n4. Outlook synchronisiert alle Mails vom Server neu (kann dauern)\n\nWICHTIG: NICHT die OST löschen sondern umbenennen! Falls etwas schief geht, kann man zurück.'},
          ], relatedSkills:['rd_appcache_outlookcache','rd_diag_diag-outlook'] },
          { id:'off-ol-004', title:'Freigegebenes Postfach einbinden', description:'Shared Mailbox / Funktionspostfach in Outlook hinzufügen', tags:['shared mailbox','postfach','freigabe','funktionspostfach'], steps:[
            {title:'Automatisch (wenn Berechtigung im Exchange gesetzt)', content:'Outlook > Datei > Kontoeinstellungen > Kontoeinstellungen > Doppelklick auf das Konto > Weitere Einstellungen > Erweitert > Hinzufügen.\n\nOder warten — Exchange bindet freigegebene Postfächer oft automatisch ein (AutoMapping). Kann bis zu 60 Min. dauern.'},
            {title:'Manuell hinzufügen', content:'Datei > Kontoeinstellungen > E-Mail > Ändern > Weitere Einstellungen > Erweitert.\n\nUnter "Diese zusätzlichen Postfächer öffnen" auf Hinzufügen klicken.\n\nDen Namen des Funktionspostfachs eingeben > OK.'},
          ], relatedSkills:['rd_diag_diag-outlook'] },
          { id:'off-ol-005', title:'Abwesenheit / Out-of-Office einrichten', description:'Automatische Antwort bei Abwesenheit konfigurieren', tags:['abwesenheit','out of office','automatisch','antwort'], steps:[
            {title:'In Outlook einrichten', content:'Datei > Automatische Antworten (Abwesenheitsassistent).\n\n"Automatische Antworten senden" aktivieren.\n\nOptional: Zeitraum festlegen.\n\nText für "Innerhalb meiner Organisation" und "Außerhalb meiner Organisation" eingeben.'},
            {title:'Über Outlook Web App (OWA)', content:'Öffne https://outlook.office365.com\n\nEinstellungen (Zahnrad oben rechts) > Alle Outlook-Einstellungen anzeigen > E-Mail > Automatische Antworten.'},
          ], relatedSkills:[] },
        ]},
        { id: 'off-teams', name: 'Microsoft Teams', articles: [
          { id:'off-teams-001', title:'Teams startet nicht oder zeigt Fehler', description:'Teams öffnet sich nicht, zeigt weißen Bildschirm oder Fehlermeldung', tags:['teams','startet nicht','fehler','cache'], steps:[
            {title:'Teams-Cache löschen', content:'1. Teams komplett beenden (auch im System-Tray/Infobereich)\n2. Task-Manager: ms-teams oder Teams.exe Prozess beenden\n3. Diese Ordner löschen:\n\n%LOCALAPPDATA%\\Packages\\MSTeams_8wekyb3d8bbwe\\LocalCache\n%APPDATA%\\Microsoft\\Teams\n\nPowerShell:\nGet-Process ms-teams,Teams -EA SilentlyContinue | Stop-Process -Force\nRemove-Item "$env:LOCALAPPDATA\\Packages\\MSTeams_*\\LocalCache\\*" -Recurse -Force -EA SilentlyContinue\n\n4. Teams neu starten'},
            {title:'Teams neu installieren', content:'Einstellungen > Apps > Microsoft Teams > Deinstallieren.\n\nDann: Microsoft Store öffnen > "Microsoft Teams" suchen > Installieren.\n\nOder Winget:\nwinget install "Microsoft Teams"'},
          ], relatedSkills:['rd_appcache_teamscache','rd_diag_diag-teams'] },
          { id:'off-teams-002', title:'Teams Audio/Mikrofon funktioniert nicht', description:'Andere hören mich nicht oder ich höre andere nicht in Teams', tags:['teams','audio','mikrofon','ton','sound'], steps:[
            {title:'Geräte in Teams prüfen', content:'In Teams: Profilbild > Einstellungen > Geräte.\n\nPrüfe ob das richtige Mikrofon und der richtige Lautsprecher ausgewählt sind.\n\nKlicke auf "Testanruf führen" um alles zu testen.'},
            {title:'Windows-Datenschutz prüfen', content:'Windows-Einstellungen > Datenschutz > Mikrofon.\n\n"Apps den Zugriff auf das Mikrofon erlauben" muss AN sein.\n\nPrüfe ob "Microsoft Teams" in der App-Liste aktiviert ist.'},
            {title:'Audio-Dienst neu starten', content:'PowerShell als Admin:\n\nRestart-Service AudioSrv\nRestart-Service AudioEndpointBuilder\n\nDanach Teams-Besprechung verlassen und neu beitreten.'},
          ], relatedSkills:['rd_audio_audiosvcrestart','rd_devmgr_audioreset','rd_diag_diag-teams'] },
          { id:'off-teams-003', title:'Teams-Kamera funktioniert nicht', description:'Kamera zeigt schwarzes Bild oder wird nicht erkannt', tags:['teams','kamera','webcam','video'], steps:[
            {title:'Kamera in Teams prüfen', content:'Einstellungen > Geräte > Kamera.\n\nIst die richtige Kamera ausgewählt? Die Vorschau sollte dein Bild zeigen.'},
            {title:'Andere Apps schließen', content:'Die Kamera kann nur von EINER App gleichzeitig genutzt werden.\n\nSchließe andere Apps die die Kamera nutzen könnten: Zoom, Skype, Webex, Browser mit Videocalls.'},
            {title:'Kamera-Treiber und Datenschutz', content:'Windows-Einstellungen > Datenschutz > Kamera > "Apps den Zugriff erlauben" muss AN sein.\n\nGeräte-Manager > Kameras > Rechtsklick > Treiber aktualisieren.\n\nWenn nichts hilft: Kamera deaktivieren und wieder aktivieren:\nDisable-PnpDevice -InstanceId (Get-PnpDevice -Class Camera).InstanceId -Confirm:$false\nEnable-PnpDevice -InstanceId (Get-PnpDevice -Class Camera).InstanceId -Confirm:$false'},
          ], relatedSkills:['rd_devmgr_devclass','rd_diag_diag-teams'] },
        ]},
        { id: 'off-general', name: 'Office Allgemein', articles: [
          { id:'off-gen-001', title:'Office Schnellreparatur und Online-Reparatur', description:'Office-Programme reparieren wenn sie nicht richtig funktionieren', tags:['office','reparatur','repair','schnellreparatur'], steps:[
            {title:'Schnellreparatur (5 Minuten)', content:'Einstellungen > Apps > Installierte Apps > Microsoft 365 > Ändern > Schnellreparatur.\n\nBehebt die meisten Probleme. Kein Internet nötig.\n\nOder per Kommandozeile:\n"C:\\Program Files\\Common Files\\Microsoft Shared\\ClickToRun\\OfficeC2RClient.exe" scenario=Repair displaylevel=False'},
            {title:'Online-Reparatur (15-30 Minuten)', content:'Einstellungen > Apps > Microsoft 365 > Ändern > Online-Reparatur.\n\nGründlicher als Schnellreparatur. Lädt Dateien aus dem Internet herunter.\n\nNutze diese Option wenn die Schnellreparatur nicht hilft.'},
          ], relatedSkills:['rd_appcache_officequick','rd_appcache_officefull'] },
          { id:'off-gen-002', title:'Office-Aktivierung / Lizenz-Probleme', description:'Office zeigt "Nicht lizenziertes Produkt" oder fragt nach Aktivierung', tags:['office','lizenz','aktivierung','nicht lizenziert'], steps:[
            {title:'Lizenzstatus prüfen', content:'Öffne eine Office-App > Datei > Konto.\n\nDort steht der Lizenzstatus. Wenn "Nicht lizenziertes Produkt": Auf "Aktivieren" klicken.'},
            {title:'Office-Aktivierung zurücksetzen', content:'PowerShell als Admin:\n\ncd "C:\\Program Files\\Microsoft Office\\Office16"\ncscript ospp.vbs /dstatus\n\nZum Zurücksetzen:\ncscript ospp.vbs /rearm\n\nDanach Office neu starten.'},
            {title:'Microsoft-Konto abmelden und neu anmelden', content:'In einer Office-App: Datei > Konto > Abmelden.\n\nAlle Office-Apps schließen.\n\nNeu öffnen und mit dem richtigen Microsoft-/Firmenkonto anmelden.'},
          ], relatedSkills:['rd_appcache_credclear','rd_appcache_authreset'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. NETZWERK
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'netzwerk', name: 'Netzwerk', icon: 'wifi',
      subcategories: [
        { id: 'net-wlan', name: 'WLAN', articles: [
          { id:'net-wlan-001', title:'WLAN verbindet nicht', description:'PC findet das WLAN nicht oder verbindet sich nicht', tags:['wlan','wifi','verbindung','netzwerk'], steps:[
            {title:'WLAN-Adapter prüfen', content:'Ist WLAN aktiviert? Prüfe:\n• Flugzeugmodus aus (Windows-Einstellungen > Netzwerk > Flugzeugmodus)\n• WLAN-Schalter am Laptop eingeschaltet\n• Fn+F2 oder Fn+F12 (je nach Laptop-Hersteller)\n\nPowerShell:\nGet-NetAdapter | Where PhysicalMediaType -match "802.11"'},
            {title:'WLAN-Profil löschen und neu verbinden', content:'Wenn das WLAN gefunden wird aber die Verbindung fehlschlägt:\n\nEinstellungen > Netzwerk > WLAN > Bekannte Netzwerke verwalten > Netzwerk auswählen > Nicht speichern.\n\nOder PowerShell:\nnetsh wlan delete profile name="NetzwerkName"\n\nDann neu verbinden mit dem richtigen Passwort.'},
            {title:'Netzwerk-Reset', content:'Wenn nichts anderes hilft:\n\nPowerShell als Admin:\nipconfig /release\nipconfig /flushdns\nnetsh winsock reset\nnetsh int ip reset\n\nPC neu starten.'},
          ], relatedSkills:['rd_wlan_wlanprofiles','rd_wlan_wlanstatus','rd_appcache_netreset'] },
          { id:'net-wlan-002', title:'WLAN ist langsam', description:'Internet über WLAN sehr langsam, obwohl LAN schnell ist', tags:['wlan','langsam','geschwindigkeit','signal'], steps:[
            {title:'Signalstärke prüfen', content:'Windows-Einstellungen > Netzwerk > WLAN.\n\nDie Signalstärke wird als Balken angezeigt. Bei 1-2 Balken ist das Signal zu schwach.\n\nPowerShell:\nnetsh wlan show interfaces | Select-String "Signal"'},
            {title:'5 GHz Band nutzen', content:'5 GHz ist schneller als 2.4 GHz, hat aber weniger Reichweite.\n\nWenn dein Router ein 5 GHz Netzwerk anbietet (oft mit "-5G" im Namen): Damit verbinden.\n\nGeräte-Manager > Netzwerkadapter > WLAN-Adapter > Eigenschaften > Erweitert > "Preferred Band" auf "5 GHz"'},
            {title:'Energiesparen deaktivieren', content:'Geräte-Manager > Netzwerkadapter > WLAN-Adapter > Rechtsklick > Eigenschaften > Energieverwaltung.\n\n"Computer kann Gerät ausschalten um Energie zu sparen" DEAKTIVIEREN.'},
          ], relatedSkills:['rd_wlan_wlanstatus','rd_net_getadapter'] },
        ]},
        { id: 'net-lan', name: 'LAN / Ethernet', articles: [
          { id:'net-lan-001', title:'Kein Internet trotz Netzwerkverbindung', description:'Kabel steckt, aber kein Internet', tags:['internet','kein netz','dns','netzwerk'], steps:[
            {title:'Verbindung testen', content:'PowerShell:\n\n# Ping auf Gateway\nping 192.168.1.1\n\n# Ping auf externe IP (Google DNS)\nping 8.8.8.8\n\n# Wenn Ping auf IP geht aber Webseiten nicht: DNS-Problem\nnslookup google.com'},
            {title:'DNS-Cache leeren', content:'PowerShell als Admin:\n\nClear-DnsClientCache\nipconfig /flushdns\nipconfig /registerdns\n\nDann Browser-Cache leeren und Seite neu laden.'},
            {title:'IP-Konfiguration erneuern', content:'PowerShell als Admin:\n\nipconfig /release\nipconfig /renew\n\nWenn das nicht hilft:\nnetsh int ip reset\nnetsh winsock reset\n\nPC neu starten.'},
          ], relatedSkills:['rd_net_ping','rd_net_flushdns','rd_net_ipreset','rd_net_nslookup'] },
        ]},
        { id: 'net-laufwerke', name: 'Netzlaufwerke', articles: [
          { id:'net-lw-001', title:'Netzlaufwerk verbindet nicht', description:'Netzlaufwerk ist getrennt oder lässt sich nicht mappen', tags:['netzlaufwerk','laufwerk','getrennt','verbindung'], steps:[
            {title:'Verbindung testen', content:'PowerShell:\n\nTest-Path "\\\\ServerName\\FreigabeName"\n\nWenn False: Server nicht erreichbar. Prüfe:\n\nping ServerName\nTest-NetConnection ServerName -Port 445'},
            {title:'Netzlaufwerk neu verbinden', content:'Bestehendes Laufwerk trennen:\nnet use Z: /delete\n\nNeu verbinden:\nnet use Z: "\\\\ServerName\\FreigabeName" /persistent:yes\n\nWenn Passwort nötig:\nnet use Z: "\\\\ServerName\\FreigabeName" /user:DOMAIN\\Username Passwort'},
            {title:'Gespeicherte Anmeldedaten löschen', content:'Wenn nach Passwortänderung das Laufwerk nicht mehr geht:\n\nPowerShell:\ncmdkey /list\n\nGespeicherte Einträge für den Server löschen:\ncmdkey /delete:ServerName\n\nDann Laufwerk neu verbinden.'},
          ], relatedSkills:['rd_drivemap_mapdriveadd','rd_drivemap_mapdrivelist','rd_appcache_credclear'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. DRUCKER
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'drucker', name: 'Drucker', icon: 'printer',
      subcategories: [
        { id: 'prn-auftraege', name: 'Druckaufträge', articles: [
          { id:'prn-job-001', title:'Druckaufträge hängen / Spooler neu starten', description:'Dokument bleibt in der Warteschlange hängen', tags:['drucker','spooler','warteschlange','hängt'], steps:[
            {title:'Warteschlange prüfen und leeren', content:'Einstellungen > Geräte > Drucker und Scanner > Drucker auswählen > Warteschlange öffnen.\n\nAlle Aufträge markieren > Dokument > Abbrechen.\n\nOder PowerShell:\nGet-PrintJob -PrinterName "DruckerName" | Remove-PrintJob'},
            {title:'Spooler-Dienst neu starten', content:'PowerShell als Admin:\n\nStop-Service Spooler -Force\nRemove-Item C:\\Windows\\System32\\spool\\PRINTERS\\* -Force\nStart-Service Spooler\n\nDas stoppt den Druckdienst, löscht alle hängenden Aufträge und startet den Dienst neu.'},
          ], relatedSkills:['rd_printer_spooler','rd_printer_spoolerclean','rd_printer_clearjobs'] },
        ]},
        { id: 'prn-install', name: 'Installation', articles: [
          { id:'prn-inst-001', title:'Netzwerkdrucker per IP hinzufügen', description:'Drucker über IP-Adresse installieren', tags:['drucker','installieren','netzwerk','ip','port'], steps:[
            {title:'Drucker hinzufügen', content:'Einstellungen > Geräte > Drucker und Scanner > Drucker hinzufügen.\n\n"Der gewünschte Drucker ist nicht aufgelistet" > "Drucker unter Verwendung einer TCP/IP-Adresse hinzufügen".\n\nIP-Adresse eingeben > Weiter.\n\nTreiber aus der Liste wählen oder "Datenträger" für heruntergeladenen Treiber.'},
            {title:'Per PowerShell', content:'PowerShell als Admin:\n\n# Port erstellen\nAdd-PrinterPort -Name "IP_192.168.1.100" -PrinterHostAddress "192.168.1.100"\n\n# Drucker hinzufügen\nAdd-Printer -Name "Büro-Drucker" -DriverName "HP Universal Printing PCL 6" -PortName "IP_192.168.1.100"'},
          ], relatedSkills:['rd_printer_addprinter'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. E-MAIL
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'email', name: 'E-Mail', icon: 'mail',
      subcategories: [
        { id: 'mail-config', name: 'Outlook Konfiguration', articles: [
          { id:'mail-cfg-001', title:'Exchange/Office 365 Konto einrichten', description:'Firmen-E-Mail in Outlook einrichten', tags:['outlook','exchange','konto','einrichten','office365'], steps:[
            {title:'Automatische Konfiguration', content:'Outlook öffnen > Datei > Konto hinzufügen.\n\nE-Mail-Adresse eingeben > Weiter.\n\nOutlook findet die Exchange-Einstellungen automatisch (AutoDiscover).\n\nPasswort eingeben > Fertig.'},
            {title:'Wenn AutoDiscover nicht funktioniert', content:'Manuelle Einrichtung:\n\nKontotyp: Exchange\nServer: outlook.office365.com\nBenutzername: vorname.nachname@firma.de\n\nOder: Systemsteuerung > Mail > Profile > Neues Profil erstellen.'},
          ], relatedSkills:['rd_diag_diag-outlook'] },
        ]},
        { id: 'mail-probleme', name: 'E-Mail Probleme', articles: [
          { id:'mail-prob-001', title:'E-Mails kommen nicht an', description:'Gesendete Mails erreichen den Empfänger nicht', tags:['email','senden','fehlgeschlagen','nicht angekommen'], steps:[
            {title:'Postausgang prüfen', content:'Outlook > Ordner "Postausgang" prüfen. Wenn Mails dort hängen:\n\n• Internet-Verbindung prüfen\n• Anhang zu groß? (max. 25-35 MB bei den meisten Providern)\n• Empfänger-Adresse korrekt?'},
            {title:'Gesendete Elemente prüfen', content:'Wenn die Mail in "Gesendete Elemente" steht, wurde sie erfolgreich gesendet.\n\nDas Problem liegt dann beim Empfänger:\n• Spam-Ordner des Empfängers prüfen\n• E-Mail-Adresse korrekt geschrieben?'},
            {title:'NDR / Bounce-Back lesen', content:'Wenn du eine Fehlermeldung zurückbekommst (NDR = Non-Delivery Report):\n\n• 550 5.1.1 = Empfänger existiert nicht\n• 552 = Postfach des Empfängers voll\n• 554 = Geblockt (Spam-Filter)\n• 421 = Server temporär nicht erreichbar'},
          ], relatedSkills:['rd_diag_diag-outlook','rd_net_nslookup'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. HARDWARE
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'hardware', name: 'Hardware', icon: 'cpu',
      subcategories: [
        { id: 'hw-monitor', name: 'Monitor / Bildschirm', articles: [
          { id:'hw-mon-001', title:'Zweiter Monitor wird nicht erkannt', description:'Externer Monitor zeigt kein Bild nach dem Anschließen', tags:['monitor','bildschirm','hdmi','displayport','kein bild'], steps:[
            {title:'Anzeige-Modus prüfen', content:'Windows-Taste + P drücken.\n\nWähle "Erweitern" oder "Duplizieren".\n\nWenn das nicht hilft: Kabel ab- und wieder anstecken. Anderen Port am PC/Monitor testen.'},
            {title:'Display-Einstellungen', content:'Rechtsklick auf Desktop > Anzeigeeinstellungen.\n\n"Erkennen" klicken. Windows sucht nach weiteren Monitoren.\n\nWenn der Monitor erscheint aber kein Bild zeigt: Auflösung und Bildwiederholrate anpassen.'},
            {title:'Grafiktreiber aktualisieren', content:'Geräte-Manager > Grafikkarten > Rechtsklick > Treiber aktualisieren.\n\nOder: Hersteller-Website besuchen (NVIDIA, AMD, Intel) und aktuellen Treiber herunterladen.'},
          ], relatedSkills:['rd_hw_hwgpu','rd_audio_monitorinfo','rd_drivers_driverupdate'] },
        ]},
        { id: 'hw-audio', name: 'Headset / Audio', articles: [
          { id:'hw-audio-001', title:'Kein Ton / Kein Sound', description:'PC gibt keinen Ton von sich', tags:['ton','sound','audio','kein ton','lautsprecher'], steps:[
            {title:'Lautstärke und Ausgabegerät prüfen', content:'Rechtsklick auf Lautsprecher-Symbol im Infobereich > Sound-Einstellungen öffnen.\n\nPrüfe:\n• Ist die Lautstärke über 0?\n• Ist das richtige Ausgabegerät ausgewählt?\n• Ist der Ton stummgeschaltet?'},
            {title:'Audio-Dienst neu starten', content:'PowerShell als Admin:\n\nRestart-Service AudioSrv\nRestart-Service AudioEndpointBuilder\n\nDanach die Anwendung schließen und neu öffnen.'},
            {title:'Audio-Treiber neu installieren', content:'Geräte-Manager > Audio-Ein/Ausgänge > Lautsprecher/Kopfhörer > Rechtsklick > Gerät deinstallieren.\n\nPC neu starten — Windows installiert den Treiber automatisch neu.'},
          ], relatedSkills:['rd_audio_volshow','rd_audio_audiosvcrestart','rd_devmgr_audioreset'] },
        ]},
        { id: 'hw-docking', name: 'Docking Station', articles: [
          { id:'hw-dock-001', title:'Docking Station — Monitore oder USB funktionieren nicht', description:'Geräte an der Docking Station werden nicht erkannt', tags:['docking','dock','usb-c','thunderbolt','monitor'], steps:[
            {title:'Grundlegende Prüfung', content:'1. Dock ab- und wieder anstecken\n2. Anderes Kabel testen (USB-C/Thunderbolt)\n3. Laptop direkt (ohne Dock) am Monitor testen\n4. Dock an der Steckdose? (manche brauchen Strom)'},
            {title:'Dock-Firmware und Treiber', content:'Besuche die Hersteller-Website der Docking Station.\n\nLade die neueste Firmware und den Treiber herunter.\n\nBei DisplayLink-Docks: https://www.synaptics.com/products/displaylink-graphics/downloads'},
            {title:'USB-C Alternate Mode prüfen', content:'Nicht jeder USB-C Anschluss unterstützt Video-Ausgabe.\n\nPrüfe im Handbuch des Laptops ob der USB-C Port "DisplayPort Alt Mode" oder "Thunderbolt" unterstützt.'},
          ], relatedSkills:['rd_devmgr_deverror','rd_devmgr_devscan','rd_diag_diag-hardware'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. SICHERHEIT
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'sicherheit', name: 'Sicherheit', icon: 'shield',
      subcategories: [
        { id: 'sec-passwort', name: 'Passwort', articles: [
          { id:'sec-pw-001', title:'AD-Passwort zurücksetzen', description:'Benutzer hat Passwort vergessen oder Konto ist gesperrt', tags:['passwort','reset','vergessen','gesperrt','active directory'], steps:[
            {title:'Konto-Status prüfen', content:'PowerShell (auf einem Server oder PC mit RSAT):\n\nGet-ADUser -Identity USERNAME -Properties LockedOut, PasswordExpired, PasswordLastSet\n\nZeigt ob das Konto gesperrt oder das Passwort abgelaufen ist.'},
            {title:'Konto entsperren', content:'PowerShell:\n\nUnlock-ADAccount -Identity USERNAME\n\nOder: Active Directory-Benutzer und -Computer > User suchen > Rechtsklick > Konto entsperren.'},
            {title:'Passwort zurücksetzen', content:'PowerShell:\n\nSet-ADAccountPassword -Identity USERNAME -Reset -NewPassword (ConvertTo-SecureString "NeuesPasswort123!" -AsPlainText -Force)\nSet-ADUser -Identity USERNAME -ChangePasswordAtLogon $true\n\nOder: AD-Benutzer und -Computer > User > Rechtsklick > Kennwort zurücksetzen.'},
          ], relatedSkills:['rd_domain_klist','rd_appcache_authreset','rd_diag_diag-auth'] },
          { id:'sec-pw-002', title:'BitLocker Recovery Key finden', description:'PC fragt nach BitLocker-Wiederherstellungsschlüssel', tags:['bitlocker','recovery','key','verschlüsselung','wiederherstellung'], steps:[
            {title:'Recovery Key im Azure AD / Intune finden', content:'Wenn der PC im Azure AD registriert ist:\n\nhttps://myaccount.microsoft.com > Geräte > Gerät auswählen > BitLocker-Schlüssel anzeigen.\n\nOder: Intune Admin Center > Geräte > Gerät suchen > Recovery Keys.'},
            {title:'Recovery Key aus dem lokalen AD', content:'PowerShell (auf einem Server mit RSAT):\n\nGet-ADObject -Filter "objectClass -eq \\"msFVE-RecoveryInformation\\"" -SearchBase "CN=COMPUTERNAME,..." -Properties msFVE-RecoveryPassword\n\nOder: AD-Benutzer und -Computer > Computer suchen > Eigenschaften > BitLocker Recovery.'},
            {title:'Laufwerk entsperren', content:'Wenn du den Recovery Key hast:\n\nmanage-bde -unlock C: -RecoveryPassword XXXXXX-XXXXXX-...\n\nOder beim Boot: Recovery Key eingeben wenn Windows danach fragt.'},
          ], relatedSkills:['rd_security_bitlocker','rd_security_bitlockerkey'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. SOFTWARE
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'software', name: 'Software', icon: 'package',
      subcategories: [
        { id: 'sw-install', name: 'Installation', articles: [
          { id:'sw-inst-001', title:'Software per Winget installieren', description:'Programme schnell und einfach über die Kommandozeile installieren', tags:['winget','installieren','software','paketmanager'], steps:[
            {title:'Winget verwenden', content:'PowerShell öffnen:\n\n# Software suchen\nwinget search "ProgrammName"\n\n# Installieren\nwinget install "ProgrammName"\n\n# Beispiele:\nwinget install Google.Chrome\nwinget install Mozilla.Firefox\nwinget install 7zip.7zip\nwinget install Notepad++.Notepad++\nwinget install VideoLAN.VLC'},
            {title:'Alle Programme aktualisieren', content:'PowerShell:\n\nwinget upgrade --all\n\nDas aktualisiert ALLE installierten Programme die über Winget verwaltet werden.'},
          ], relatedSkills:['rd_swinstall_wingetinstall','rd_software_wingetlist','rd_software_wingetupg'] },
          { id:'sw-inst-002', title:'MSI/EXE Silent Install', description:'Software ohne Benutzerinteraktion installieren (für Admins)', tags:['msi','silent','unattended','installation','admin'], steps:[
            {title:'MSI Silent Install', content:'PowerShell als Admin:\n\nmsiexec /i "C:\\Pfad\\zur\\Setup.msi" /quiet /norestart\n\nParameter:\n• /quiet = Keine UI\n• /passive = Nur Fortschrittsbalken\n• /norestart = Kein automatischer Neustart'},
            {title:'EXE Silent Install', content:'Die Parameter hängen vom Installer ab:\n\n• NSIS: /S\n• InnoSetup: /VERYSILENT /NORESTART\n• InstallShield: /s /v"/quiet"\n• Allgemein versuchen: /silent, /quiet, -s\n\nMeist findet man die Parameter auf der Hersteller-Webseite oder mit: setup.exe /?'},
          ], relatedSkills:['rd_swinstall_fileinstall'] },
        ]},
        { id: 'sw-sap', name: 'SAP', articles: [
          { id:'sw-sap-001', title:'SAP GUI startet nicht', description:'SAP GUI öffnet sich nicht oder zeigt Fehler', tags:['sap','gui','startet nicht','fehler'], steps:[
            {title:'SAP GUI Cache löschen', content:'SAP GUI schließen. Dann diese Ordner löschen:\n\n%APPDATA%\\SAP\\Common\\\n%TEMP%\\sapgui*\n\nPowerShell:\nRemove-Item "$env:APPDATA\\SAP\\Common\\*" -Recurse -Force -EA SilentlyContinue\nRemove-Item "$env:TEMP\\sapgui*" -Recurse -Force -EA SilentlyContinue\n\nSAP GUI neu starten.'},
            {title:'SAP GUI reparieren', content:'Systemsteuerung > Programme > SAP GUI > Ändern > Reparieren.\n\nOder: SAP GUI komplett deinstallieren und neu installieren.\n\nInstallationsquelle: \\\\w3172\\skf Marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\SAP'},
          ], relatedSkills:['rd_appcache_sapcache'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. REMOTE / FERNWARTUNG
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'remote', name: 'Remote / Fernwartung', icon: 'monitor',
      subcategories: [
        { id: 'rem-rdp', name: 'Remote Desktop (RDP)', articles: [
          { id:'rem-rdp-001', title:'RDP-Verbindung fehlgeschlagen', description:'Remote Desktop-Verbindung kann nicht hergestellt werden', tags:['rdp','remote desktop','verbindung','fernzugriff'], steps:[
            {title:'Ziel-PC prüfen', content:'Ist RDP aktiviert auf dem Ziel-PC?\n\nPowerShell (lokal auf dem Ziel-PC):\nGet-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" -Name fDenyTSConnections\n\n0 = RDP aktiviert, 1 = RDP deaktiviert.'},
            {title:'RDP aktivieren', content:'PowerShell als Admin (auf dem Ziel-PC):\n\nSet-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" -Name fDenyTSConnections -Value 0\nEnable-NetFirewallRule -DisplayGroup "Remotedesktop"\n\nOder: Einstellungen > System > Remotedesktop > Aktivieren.'},
            {title:'Firewall-Regel prüfen', content:'PowerShell:\n\nGet-NetFirewallRule -DisplayGroup "Remotedesktop" | Select Name, Enabled\n\nWenn Disabled:\nEnable-NetFirewallRule -DisplayGroup "Remotedesktop"'},
          ], relatedSkills:['rd_rdp_rdpenable','rd_rdp_rdpfw','rd_rdp_rdpopen'] },
        ]},
        { id: 'rem-winrm', name: 'WinRM', articles: [
          { id:'rem-winrm-001', title:'WinRM aktivieren und Troubleshooting', description:'Windows Remote Management für Fernverwaltung einrichten', tags:['winrm','remote','powershell','verwaltung'], steps:[
            {title:'WinRM aktivieren', content:'Auf dem Ziel-PC als Admin:\n\nwinrm quickconfig -q\n\nOder PowerShell:\nEnable-PSRemoting -Force -SkipNetworkProfileCheck\n\nDas aktiviert WinRM, erstellt die Firewall-Regel und setzt den Dienst auf Automatisch.'},
            {title:'WinRM testen', content:'Von deinem PC aus:\n\nTest-WSMan -ComputerName ZIELPC\n\nWenn Antwort kommt: WinRM funktioniert.\n\nWenn Fehler: Firewall, DNS oder Berechtigung prüfen.'},
            {title:'Troubleshooting', content:'Häufige Fehler:\n\n• "WinRM client cannot process the request": DNS-Auflösung prüfen\n• "Access denied": Domain-Admin-Rechte nötig\n• "The WinRM client received an HTTP server error status (503)": WinRM-Dienst auf dem Ziel nicht gestartet\n\nPowerShell:\nsc.exe \\\\ZIELPC start WinRM'},
          ], relatedSkills:['rd_sysconfig_rdpon'] },
        ]},
      ],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. ACTIVE DIRECTORY
    // ═══════════════════════════════════════════════════════════════════════════
    {
      id: 'ad', name: 'Active Directory', icon: 'users',
      subcategories: [
        { id: 'ad-user', name: 'Benutzer', articles: [
          { id:'ad-user-001', title:'AD-Benutzer anlegen', description:'Neuen Benutzer im Active Directory erstellen', tags:['active directory','benutzer','anlegen','neu','ad'], steps:[
            {title:'Per GUI', content:'Active Directory-Benutzer und -Computer (dsa.msc) > OU auswählen > Rechtsklick > Neu > Benutzer.\n\nVorname, Nachname, Anmeldename ausfüllen > Passwort setzen > "Benutzer muss Passwort bei nächster Anmeldung ändern" aktivieren.'},
            {title:'Per PowerShell', content:'PowerShell:\n\nNew-ADUser -Name "Max Mustermann" -GivenName "Max" -Surname "Mustermann" -SamAccountName "mmustermann" -UserPrincipalName "mmustermann@domain.de" -Path "OU=Benutzer,DC=domain,DC=de" -AccountPassword (ConvertTo-SecureString "TempPasswort123!" -AsPlainText -Force) -Enabled $true -ChangePasswordAtLogon $true'},
          ], relatedSkills:['rd_userprofiles_useradd'] },
          { id:'ad-user-002', title:'Benutzer zu AD-Gruppe hinzufügen', description:'Gruppenmitgliedschaft im Active Directory verwalten', tags:['ad','gruppe','mitglied','berechtigung','hinzufügen'], steps:[
            {title:'Per GUI', content:'dsa.msc > Benutzer suchen > Rechtsklick > Eigenschaften > Mitglied von > Hinzufügen.\n\nGruppennamen eingeben > Namen überprüfen > OK.'},
            {title:'Per PowerShell', content:'Benutzer zur Gruppe hinzufügen:\nAdd-ADGroupMember -Identity "GruppenName" -Members "benutzername"\n\nAlle Gruppen eines Benutzers anzeigen:\nGet-ADUser -Identity "benutzername" -Properties MemberOf | Select -ExpandProperty MemberOf'},
          ], relatedSkills:['rd_userprofiles_usergroupadd'] },
        ]},
        { id: 'ad-gpo', name: 'Gruppenrichtlinien (GPO)', articles: [
          { id:'ad-gpo-001', title:'GPO aktualisieren und prüfen', description:'Gruppenrichtlinien auf einem PC aktualisieren und prüfen welche angewendet werden', tags:['gpo','gruppenrichtlinie','gpupdate','gpresult'], steps:[
            {title:'GPO aktualisieren', content:'PowerShell:\n\ngpupdate /force\n\nDas aktualisiert Computer- UND Benutzerrichtlinien sofort.'},
            {title:'Angewendete GPOs prüfen', content:'PowerShell:\n\ngpresult /r\n\nZeigt eine Zusammenfassung aller angewendeten Richtlinien.\n\nFür einen detaillierten HTML-Report:\ngpresult /h C:\\Temp\\gpo_report.html\nStart-Process C:\\Temp\\gpo_report.html'},
            {title:'Warum eine GPO nicht angewendet wird', content:'Häufige Ursachen:\n\n• PC nicht in der richtigen OU\n• Sicherheitsfilterung: PC/User nicht in der Gruppe\n• WMI-Filter blockiert\n• GPO-Verknüpfung deaktiviert\n• Höhere GPO überschreibt (Reihenfolge/Priorität)\n\nPrüfe mit: gpresult /r /scope:computer und gpresult /r /scope:user'},
          ], relatedSkills:['rd_gpo_gpupdate','rd_gpo_gpresult','rd_gpo_gphtml'] },
        ]},
      ],
    },
  ]

  const totalArticles = categories.reduce((s, c) => s + c.subcategories.reduce((s2, sc) => s2 + sc.articles.length, 0), 0)
  return {
    meta: { version: '1.0', generatedAt: new Date().toISOString(), totalArticles, totalCategories: categories.length },
    categories,
  }
}
