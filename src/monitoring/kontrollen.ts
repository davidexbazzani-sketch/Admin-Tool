// ── PC-Überwachung: Katalog der Kontrollen ───────────────────────────────────
// Alles hier ist rein lesend: Ereignisprotokolle (Get-WinEvent), Dienst-Status,
// Messwerte (CIM) und Ping. Neue Kontrolle = neuer Eintrag in KONTROLLEN.
// Suchbegriffe klein und ohne Umlaute pflegen (die Suche faltet ä→ae usw.).

import type { MonAuswahl, MonBereich, MonKontrolle } from './types'

const SYS = 'System'
const APP = 'Application'
const WLAN = 'Microsoft-Windows-WLAN-AutoConfig/Operational'
const NETPROF = 'Microsoft-Windows-NetworkProfile/Operational'
const DEFENDER = 'Microsoft-Windows-Windows Defender/Operational'

const SAP_EXE = 'saplogon\\.exe|sapgui\\.exe|sapfront\\.exe|saplgpad\\.exe|nwbc\\.exe'

export const KONTROLLEN: MonKontrolle[] = [
  // ── WLAN ──
  { id: 'wlan-trennung', titel: 'WLAN-Trennungen', bereich: 'WLAN', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Jede WLAN-Trennung mit dem Grund laut Windows (nicht: Benutzer wählt selbst ein anderes Netz).',
    stichworte: ['wlan', 'wifi', 'wi-fi', 'w-lan', 'funk', 'wireless', 'getrennt', 'trennung', 'abbruch', 'verbindung', 'internet', 'netz weg', 'aussetzer', 'disconnect'],
    quellen: [{ log: WLAN, ids: [8003] }] },
  { id: 'wlan-verbindungsfehler', titel: 'WLAN-Verbindung fehlgeschlagen', bereich: 'WLAN', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Windows versucht zu verbinden, es klappt aber nicht (Access Point, Signal, Profil).',
    stichworte: ['wlan', 'wifi', 'funk', 'verbindung', 'fehlgeschlagen', 'connect', 'access point', 'ap'],
    quellen: [{ log: WLAN, ids: [8002] }] },
  { id: 'wlan-anmeldung', titel: 'WLAN-Anmeldung (802.1X) fehlgeschlagen', bereich: 'WLAN', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Die Firmen-WLAN-Anmeldung (Zertifikat/RADIUS) schlägt fehl.',
    stichworte: ['wlan', 'wifi', '802.1x', 'dot1x', 'radius', 'zertifikat', 'anmeldung', 'authentifizierung', 'nps', 'eap'],
    quellen: [{ log: WLAN, ids: [11006, 12013] }] },

  // ── Erreichbarkeit ──
  { id: 'erreichbar', titel: 'PC nicht erreichbar (Ping)', bereich: 'Erreichbarkeit', schwere: 'warnung', standard: true, art: 'erreichbar',
    beschreibung: 'Meldet sofort, wenn der PC zweimal hintereinander nicht antwortet — und beim Wiederkommen, ob er aus war, im Standby oder das Netz weg war.',
    stichworte: ['ping', 'erreichbar', 'offline', 'online', 'weg', 'netz', 'netzwerk', 'wlan', 'lan', 'verbindung', 'aus', 'standby', 'antwortet nicht'] },

  // ── Netzwerk ──
  { id: 'netz-getrennt', titel: 'Netzwerk getrennt (alle Verbindungsarten)', bereich: 'Netzwerk', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Windows meldet „Netzwerk getrennt“ — egal ob LAN, WLAN oder VPN.',
    stichworte: ['netz', 'netzwerk', 'lan', 'ethernet', 'kabel', 'getrennt', 'internet', 'verbindung', 'netzwerkprofil'],
    quellen: [{ log: NETPROF, ids: [10001] }] },
  { id: 'lan-link', titel: 'LAN-Kabel / Link getrennt', bereich: 'Netzwerk', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Der Netzwerkadapter meldet „Link getrennt“ (Kabel, Dose, Switch-Port, Dockingstation).',
    stichworte: ['lan', 'ethernet', 'kabel', 'link', 'dose', 'switch', 'dock', 'dockingstation', 'netz', 'netzwerk'],
    quellen: [{ log: SYS, ids: [27] }], muster: 'e1[a-z]express|e2fexpress|rt640x64|rtcx21|link is disconnected|netzwerkverbindung wurde getrennt|verbindung.*getrennt' },
  { id: 'ip-konflikt', titel: 'IP-Adresskonflikt', bereich: 'Netzwerk', schwere: 'warnung', art: 'ereignis',
    beschreibung: 'Ein anderes Gerät benutzt dieselbe IP-Adresse.',
    stichworte: ['ip', 'konflikt', 'adresse', 'dhcp', 'doppelt', 'netz', 'netzwerk'],
    quellen: [{ log: SYS, provider: ['Tcpip'], ids: [4199] }] },
  { id: 'dns-fehler', titel: 'DNS-Namensauflösung fehlgeschlagen', bereich: 'Netzwerk', schwere: 'info', art: 'ereignis',
    beschreibung: 'Zeitüberschreitung bei der Namensauflösung (kommt in Maßen auch normal vor).',
    stichworte: ['dns', 'namensaufloesung', 'internet', 'netz', 'netzwerk', 'seite laedt nicht'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-DNS-Client'], ids: [1014] }] },
  { id: 'zscaler-dienst', titel: 'Zscaler läuft nicht', bereich: 'Netzwerk', schwere: 'warnung', art: 'dienst', dienst: 'ZSAService',
    beschreibung: 'Der Zscaler-Dienst (ZSAService) ist nicht gestartet — Internet/Intranet kann ausfallen.',
    stichworte: ['zscaler', 'proxy', 'internet', 'vpn', 'zsa', 'netz', 'netzwerk'] },

  // ── Absturz & Neustart ──
  { id: 'bluescreen', titel: 'Bluescreen (BSOD)', bereich: 'Absturz & Neustart', schwere: 'kritisch', standard: true, art: 'ereignis',
    beschreibung: 'Windows ist mit Bluescreen abgestürzt — mit Stop-Code und Bedeutung.',
    stichworte: ['bluescreen', 'bsod', 'absturz', 'stopcode', 'bugcheck', 'blau', 'abgestuerzt', 'neustart', 'crash'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-WER-SystemErrorReporting'], ids: [1001] }] },
  { id: 'unerwartet-aus', titel: 'Unerwartet ausgeschaltet / neu gestartet', bereich: 'Absturz & Neustart', schwere: 'kritisch', standard: true, art: 'ereignis',
    beschreibung: 'PC ging ohne ordentliches Herunterfahren aus (Strom, Taste, Hänger, Überhitzung).',
    stichworte: ['absturz', 'aus', 'ausgeschaltet', 'neustart', 'strom', 'kernel-power', 'einfrieren', 'friert ein', 'haengt', 'crash', 'abgestuerzt', 'reboot'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-Kernel-Power'], ids: [41] }, { log: SYS, provider: ['EventLog'], ids: [6008] }] },
  { id: 'neustart', titel: 'Neustart / Herunterfahren (geplant)', bereich: 'Absturz & Neustart', schwere: 'info', art: 'ereignis',
    beschreibung: 'Wer oder welches Programm den PC neu gestartet bzw. heruntergefahren hat (Updates, Benutzer, Software).',
    stichworte: ['neustart', 'reboot', 'herunterfahren', 'update', 'neu gestartet', 'aus'],
    quellen: [{ log: SYS, provider: ['User32'], ids: [1074] }] },

  // ── Programme ──
  { id: 'app-absturz', titel: 'Programm abgestürzt', bereich: 'Programme', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Jeder Programmabsturz mit Programm, fehlerhaftem Modul und Fehlercode. Optional nur ein bestimmtes Programm.',
    stichworte: ['absturz', 'abgestuerzt', 'programm', 'anwendung', 'app', 'crash', 'schliesst sich', 'beendet', 'application error'],
    quellen: [{ log: APP, provider: ['Application Error'], ids: [1000] }],
    param: { label: 'Nur Programm (optional)', platzhalter: 'z. B. EXCEL.EXE — leer = alle', art: 'programm' } },
  { id: 'app-haengt', titel: 'Programm reagiert nicht (aufgehängt)', bereich: 'Programme', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Programm hing und wurde beendet („keine Rückmeldung“).',
    stichworte: ['haengt', 'aufgehaengt', 'keine rueckmeldung', 'reagiert nicht', 'einfrieren', 'friert', 'programm', 'hang'],
    quellen: [{ log: APP, provider: ['Application Hang'], ids: [1002] }],
    param: { label: 'Nur Programm (optional)', platzhalter: 'z. B. OUTLOOK.EXE — leer = alle', art: 'programm' } },
  { id: 'explorer-absturz', titel: 'Explorer / Taskleiste abgestürzt', bereich: 'Programme', schwere: 'warnung', art: 'ereignis',
    beschreibung: 'Der Windows-Explorer (Taskleiste, Desktop, Ordner) ist abgestürzt.',
    stichworte: ['explorer', 'taskleiste', 'desktop', 'startmenue', 'ordner', 'absturz'],
    quellen: [{ log: APP, provider: ['Application Error'], ids: [1000] }], muster: 'explorer\\.exe' },
  { id: 'dotnet-fehler', titel: '.NET-Programmfehler', bereich: 'Programme', schwere: 'info', art: 'ereignis',
    beschreibung: 'Unbehandelte .NET-Ausnahme (oft Fachanwendungen und Add-ins).',
    stichworte: ['.net', 'dotnet', 'framework', 'programm', 'add-in', 'ausnahme'],
    quellen: [{ log: APP, provider: ['.NET Runtime'], ids: [1026] }] },

  // ── SolidWorks ──
  { id: 'sw-absturz', titel: 'SolidWorks abgestürzt', bereich: 'SolidWorks', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Absturz von SLDWORKS.exe mit fehlerhaftem Modul (z. B. Grafiktreiber).',
    stichworte: ['solidworks', 'sldworks', 'cad', 'absturz', 'abgestuerzt', 'crash', 'sw'],
    quellen: [{ log: APP, provider: ['Application Error'], ids: [1000] }], muster: 'sldworks\\.exe' },
  { id: 'sw-haengt', titel: 'SolidWorks reagiert nicht', bereich: 'SolidWorks', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'SLDWORKS.exe hing und wurde beendet.',
    stichworte: ['solidworks', 'sldworks', 'cad', 'haengt', 'keine rueckmeldung', 'einfrieren', 'sw'],
    quellen: [{ log: APP, provider: ['Application Hang'], ids: [1002] }], muster: 'sldworks\\.exe' },

  // ── SAP ──
  { id: 'sap-absturz', titel: 'SAP GUI abgestürzt', bereich: 'SAP', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Absturz von SAP Logon / SAP GUI / NWBC.',
    stichworte: ['sap', 'sapgui', 'saplogon', 'nwbc', 'absturz', 'abgestuerzt', 'crash'],
    quellen: [{ log: APP, provider: ['Application Error'], ids: [1000] }], muster: SAP_EXE },
  { id: 'sap-haengt', titel: 'SAP GUI reagiert nicht', bereich: 'SAP', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'SAP Logon / SAP GUI hing und wurde beendet.',
    stichworte: ['sap', 'sapgui', 'saplogon', 'haengt', 'keine rueckmeldung', 'einfrieren'],
    quellen: [{ log: APP, provider: ['Application Hang'], ids: [1002] }], muster: SAP_EXE },
  { id: 'kerberos-fehler', titel: 'Kerberos-Fehler (SSO / SAP-SNC)', bereich: 'Anmeldung & Domäne', schwere: 'info', art: 'ereignis',
    beschreibung: 'Kerberos-Fehlermeldungen — relevant für Single Sign-on und SAP mit SNC.',
    stichworte: ['kerberos', 'sso', 'snc', 'sap', 'anmeldung', 'ticket', 'spn'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-Security-Kerberos'], ids: [3, 4] }] },

  // ── Office ──
  { id: 'outlook-absturz', titel: 'Outlook abgestürzt / hängt', bereich: 'Office', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Absturz oder Hänger von OUTLOOK.EXE.',
    stichworte: ['outlook', 'mail', 'email', 'office', 'absturz', 'haengt', 'keine rueckmeldung'],
    quellen: [{ log: APP, provider: ['Application Error'], ids: [1000] }, { log: APP, provider: ['Application Hang'], ids: [1002] }], muster: 'outlook\\.exe' },
  { id: 'teams-absturz', titel: 'Teams abgestürzt / hängt', bereich: 'Office', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Absturz oder Hänger von Microsoft Teams.',
    stichworte: ['teams', 'besprechung', 'meeting', 'office', 'absturz', 'haengt'],
    quellen: [{ log: APP, provider: ['Application Error'], ids: [1000] }, { log: APP, provider: ['Application Hang'], ids: [1002] }], muster: 'ms-teams\\.exe|teams\\.exe' },
  { id: 'office-absturz', titel: 'Excel / Word / PowerPoint abgestürzt', bereich: 'Office', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Absturz oder Hänger von Excel, Word, PowerPoint oder OneNote.',
    stichworte: ['excel', 'word', 'powerpoint', 'onenote', 'office', 'absturz', 'haengt'],
    quellen: [{ log: APP, provider: ['Application Error'], ids: [1000] }, { log: APP, provider: ['Application Hang'], ids: [1002] }], muster: 'excel\\.exe|winword\\.exe|powerpnt\\.exe|onenote\\.exe' },

  // ── Dienste ──
  { id: 'dienst-absturz', titel: 'Dienst abgestürzt', bereich: 'Dienste', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Ein Windows-Dienst wurde unerwartet beendet. Optional nur ein bestimmter Dienst.',
    stichworte: ['dienst', 'service', 'abgestuerzt', 'beendet', 'absturz', 'scm'],
    quellen: [{ log: SYS, provider: ['Service Control Manager'], ids: [7031, 7034] }],
    param: { label: 'Nur Dienst (optional)', platzhalter: 'z. B. Spooler — leer = alle', art: 'dienst' } },
  { id: 'dienst-startfehler', titel: 'Dienst startet nicht', bereich: 'Dienste', schwere: 'warnung', art: 'ereignis',
    beschreibung: 'Ein Dienst konnte nicht gestartet werden oder endete mit Fehler.',
    stichworte: ['dienst', 'service', 'startet nicht', 'start', 'zeitueberschreitung', 'fehler'],
    quellen: [{ log: SYS, provider: ['Service Control Manager'], ids: [7000, 7001, 7009, 7011, 7023, 7024] }],
    param: { label: 'Nur Dienst (optional)', platzhalter: 'z. B. ZSAService — leer = alle', art: 'dienst' } },
  { id: 'dienst-laeuft', titel: 'Bestimmter Dienst läuft nicht', bereich: 'Dienste', schwere: 'warnung', art: 'dienst',
    beschreibung: 'Prüft bei jedem Durchgang, ob der angegebene Dienst läuft.',
    stichworte: ['dienst', 'service', 'laeuft nicht', 'gestoppt', 'status'],
    param: { label: 'Dienstname', platzhalter: 'z. B. Spooler, Audiosrv, ZSAService', pflicht: true, art: 'dienst' } },
  { id: 'audio-dienst', titel: 'Audio-Dienst läuft nicht', bereich: 'Dienste', schwere: 'warnung', art: 'dienst', dienst: 'Audiosrv',
    beschreibung: 'Windows-Audio (Audiosrv) ist gestoppt — kein Ton, Headset geht nicht.',
    stichworte: ['audio', 'ton', 'sound', 'headset', 'lautsprecher', 'mikrofon', 'jabra', 'dienst'] },

  // ── Drucken ──
  { id: 'spooler-absturz', titel: 'Druckwarteschlange abgestürzt', bereich: 'Drucken', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Der Druckspooler wurde unerwartet beendet (oft fehlerhafter Druckertreiber).',
    stichworte: ['drucker', 'drucken', 'spooler', 'druckwarteschlange', 'druck', 'absturz'],
    quellen: [{ log: SYS, provider: ['Service Control Manager'], ids: [7031, 7034] }], muster: 'druckwarteschlange|print spooler|spooler' },
  { id: 'spooler-laeuft', titel: 'Druckwarteschlange läuft nicht', bereich: 'Drucken', schwere: 'warnung', standard: true, art: 'dienst', dienst: 'Spooler',
    beschreibung: 'Der Dienst „Druckwarteschlange“ (Spooler) ist gestoppt.',
    stichworte: ['drucker', 'drucken', 'spooler', 'druckwarteschlange', 'dienst'] },

  // ── Festplatte ──
  { id: 'disk-fehler', titel: 'Festplatten-/SSD-Fehler', bereich: 'Festplatte', schwere: 'kritisch', standard: true, art: 'ereignis',
    beschreibung: 'Lese-/Schreibfehler, fehlerhafte Blöcke, Paging-Fehler, wiederholte E/A.',
    stichworte: ['festplatte', 'ssd', 'disk', 'platte', 'datentraeger', 'sektor', 'block', 'nvme', 'langsam'],
    quellen: [{ log: SYS, provider: ['disk'], ids: [7, 11, 51, 153] }] },
  { id: 'speicher-reset', titel: 'Speicher-Controller zurückgesetzt', bereich: 'Festplatte', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: '„Reset to device“ am NVMe/SATA-Controller — typisch für kurze Hänger.',
    stichworte: ['nvme', 'ssd', 'festplatte', 'reset', 'haenger', 'einfrieren', 'friert', 'controller', 'storahci', 'stornvme'],
    quellen: [{ log: SYS, provider: ['stornvme'], ids: [11, 129] }, { log: SYS, provider: ['storahci'], ids: [129] }] },
  { id: 'ntfs-fehler', titel: 'Dateisystem beschädigt (NTFS)', bereich: 'Festplatte', schwere: 'kritisch', art: 'ereignis',
    beschreibung: 'Windows meldet eine Beschädigung im Dateisystem.',
    stichworte: ['ntfs', 'dateisystem', 'beschaedigt', 'chkdsk', 'festplatte'],
    quellen: [{ log: SYS, provider: ['Ntfs'], ids: [55] }] },
  { id: 'disk-voll', titel: 'Laufwerk C: fast voll (≤ 10 % frei)', bereich: 'Festplatte', schwere: 'warnung', standard: true, art: 'messwert', messwert: 'disk-c', grenze: 10,
    beschreibung: 'Meldet, sobald auf C: höchstens 10 % frei sind.',
    stichworte: ['speicherplatz', 'voll', 'platz', 'festplatte', 'c:', 'laufwerk', 'frei'] },

  // ── Hardware & Treiber ──
  { id: 'whea', titel: 'Hardware-Fehler (WHEA)', bereich: 'Hardware & Treiber', schwere: 'kritisch', standard: true, art: 'ereignis',
    beschreibung: 'Prozessor, Arbeitsspeicher oder PCIe melden einen Hardware-Fehler.',
    stichworte: ['hardware', 'whea', 'cpu', 'prozessor', 'ram', 'arbeitsspeicher', 'pcie', 'mainboard', 'defekt'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-WHEA-Logger'], ids: [1, 17, 18, 19, 47] }] },
  { id: 'grafik-reset', titel: 'Grafiktreiber reagiert nicht (zurückgesetzt)', bereich: 'Hardware & Treiber', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Bild friert kurz ein / wird schwarz, Treiber wurde wiederhergestellt.',
    stichworte: ['grafik', 'grafikkarte', 'treiber', 'bildschirm', 'schwarz', 'flackern', 'monitor', 'nvidia', 'display', 'solidworks', 'cad', 'tdr'],
    quellen: [{ log: SYS, provider: ['Display'], ids: [4101] }] },
  { id: 'treiber-ladefehler', titel: 'Gerätetreiber konnte nicht geladen werden', bereich: 'Hardware & Treiber', schwere: 'info', art: 'ereignis',
    beschreibung: 'Ein Gerät (USB, Dock, Kamera …) wurde erkannt, der Treiber aber nicht geladen.',
    stichworte: ['treiber', 'usb', 'geraet', 'dock', 'dockingstation', 'kamera', 'headset', 'pnp'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-Kernel-PnP'], ids: [219] }] },
  { id: 'cpu-gedrosselt', titel: 'Prozessor gedrosselt (Firmware/Temperatur)', bereich: 'Hardware & Treiber', schwere: 'info', art: 'ereignis',
    beschreibung: 'Die Firmware begrenzt die Prozessorgeschwindigkeit — oft Wärme oder Netzteil/Dock.',
    stichworte: ['langsam', 'cpu', 'prozessor', 'temperatur', 'ueberhitzung', 'heiss', 'luefter', 'drosselung', 'netzteil'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-Kernel-Processor-Power'], ids: [37] }] },

  // ── Anmeldung & Domäne ──
  { id: 'dc-nicht-erreichbar', titel: 'Domäne nicht erreichbar / Vertrauensstellung', bereich: 'Anmeldung & Domäne', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Kein Domänencontroller erreichbar bzw. Computerkonto-Anmeldung an der Domäne fehlgeschlagen.',
    stichworte: ['domaene', 'domain', 'dc', 'netlogon', 'vertrauensstellung', 'anmeldung', 'ad', 'active directory'],
    quellen: [{ log: SYS, provider: ['NETLOGON'], ids: [5719, 3210] }] },
  { id: 'gpo-fehler', titel: 'Gruppenrichtlinie fehlgeschlagen', bereich: 'Anmeldung & Domäne', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Gruppenrichtlinien konnten nicht verarbeitet werden (Netz/DC/Berechtigung).',
    stichworte: ['gruppenrichtlinie', 'gpo', 'richtlinie', 'gpupdate', 'domaene', 'anmeldung', 'langsam'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-GroupPolicy'], ids: [1030, 1053, 1055, 1058, 1129] }] },
  { id: 'zeit-sync', titel: 'Zeitsynchronisierung fehlgeschlagen', bereich: 'Anmeldung & Domäne', schwere: 'info', art: 'ereignis',
    beschreibung: 'Die Uhr kann nicht mit der Domäne abgeglichen werden (Kerberos braucht die richtige Zeit).',
    stichworte: ['zeit', 'uhr', 'uhrzeit', 'ntp', 'w32time', 'kerberos'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-Time-Service'], ids: [129, 134] }] },
  { id: 'anmelde-fehler', titel: 'Fehlgeschlagene Anmeldungen', bereich: 'Anmeldung & Domäne', schwere: 'info', art: 'ereignis',
    beschreibung: 'Falsches Kennwort / gesperrtes Konto beim Anmelden an diesem PC.',
    stichworte: ['anmeldung', 'kennwort', 'passwort', 'gesperrt', 'login', 'logon', '4625'],
    quellen: [{ log: 'Security', ids: [4625] }] },

  // ── Sicherheit ──
  { id: 'defender-fund', titel: 'Defender: Schadsoftware gefunden', bereich: 'Sicherheit', schwere: 'kritisch', standard: true, art: 'ereignis',
    beschreibung: 'Microsoft Defender hat etwas gefunden bzw. entfernt.',
    stichworte: ['virus', 'defender', 'schadsoftware', 'malware', 'trojaner', 'sicherheit', 'bedrohung'],
    quellen: [{ log: DEFENDER, ids: [1116, 1117] }] },
  { id: 'defender-aus', titel: 'Defender-Echtzeitschutz aus', bereich: 'Sicherheit', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Der Echtzeitschutz wurde abgeschaltet.',
    stichworte: ['defender', 'echtzeitschutz', 'virenschutz', 'sicherheit', 'deaktiviert'],
    quellen: [{ log: DEFENDER, ids: [5001, 5010, 5012] }] },

  // ── Updates ──
  { id: 'update-fehler', titel: 'Windows-Update fehlgeschlagen', bereich: 'Updates', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Ein Update konnte nicht installiert werden.',
    stichworte: ['update', 'windows update', 'patch', 'kb', 'installation', 'fehlgeschlagen'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-WindowsUpdateClient'], ids: [20] }] },
  { id: 'update-installiert', titel: 'Update installiert', bereich: 'Updates', schwere: 'info', art: 'ereignis',
    beschreibung: 'Zur Einordnung: wann welches Update installiert wurde.',
    stichworte: ['update', 'windows update', 'patch', 'kb', 'installiert'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-WindowsUpdateClient'], ids: [19] }] },

  // ── Leistung ──
  { id: 'cpu-hoch', titel: 'Prozessor dauerhaft ausgelastet (≥ 90 %)', bereich: 'Leistung', schwere: 'warnung', standard: true, art: 'messwert', messwert: 'cpu', grenze: 90,
    beschreibung: 'Meldet, wenn die CPU zwei Durchgänge hintereinander bei mindestens 90 % liegt.',
    stichworte: ['langsam', 'cpu', 'prozessor', 'auslastung', 'performance', 'leistung', 'luefter', 'laut'] },
  { id: 'ram-hoch', titel: 'Arbeitsspeicher fast voll (≥ 90 %)', bereich: 'Leistung', schwere: 'warnung', standard: true, art: 'messwert', messwert: 'ram', grenze: 90,
    beschreibung: 'Meldet, wenn der Arbeitsspeicher zwei Durchgänge hintereinander zu mindestens 90 % belegt ist.',
    stichworte: ['langsam', 'ram', 'arbeitsspeicher', 'speicher', 'performance', 'leistung'] },
  { id: 'speicher-knapp', titel: 'Virtueller Speicher knapp', bereich: 'Leistung', schwere: 'warnung', standard: true, art: 'ereignis',
    beschreibung: 'Windows hat ein Programm wegen Speichermangel gemeldet (Resource-Exhaustion).',
    stichworte: ['langsam', 'speicher', 'arbeitsspeicher', 'ram', 'auslagerung', 'performance'],
    quellen: [{ log: SYS, provider: ['Microsoft-Windows-Resource-Exhaustion-Detector'], ids: [2004] }] },

  // ── Benutzerprofil ──
  { id: 'temp-profil', titel: 'Temporäres Profil / Profil nicht ladbar', bereich: 'Benutzerprofil', schwere: 'kritisch', standard: true, art: 'ereignis',
    beschreibung: 'Benutzer wurde mit temporärem Profil angemeldet bzw. das Profil konnte nicht geladen werden.',
    stichworte: ['profil', 'temporaer', 'temp', 'desktop leer', 'anmeldung', 'benutzerprofil'],
    quellen: [{ log: APP, provider: ['Microsoft-Windows-User Profiles Service'], ids: [1508, 1511, 1515] }] },
]

const NACH_ID = new Map(KONTROLLEN.map(k => [k.id, k]))
export const kontrolle = (id: string): MonKontrolle | undefined => NACH_ID.get(id)

export const BEREICHE: MonBereich[] = [
  'WLAN', 'Erreichbarkeit', 'Netzwerk', 'Absturz & Neustart', 'Programme', 'SolidWorks', 'SAP', 'Office',
  'Dienste', 'Drucken', 'Festplatte', 'Hardware & Treiber', 'Anmeldung & Domäne', 'Sicherheit', 'Updates', 'Leistung', 'Benutzerprofil',
]

/** Schnellwahl: was „WLAN“, „Absturz“ … auf einen Klick auswählt. */
export const SCHNELLWAHL: { titel: string; ids: string[] }[] = [
  { titel: 'WLAN-Probleme', ids: ['wlan-trennung', 'wlan-verbindungsfehler', 'wlan-anmeldung', 'erreichbar'] },
  { titel: 'LAN / Netzwerk', ids: ['netz-getrennt', 'lan-link', 'erreichbar', 'ip-konflikt', 'dc-nicht-erreichbar'] },
  { titel: 'Abstürze & Bluescreens', ids: ['bluescreen', 'unerwartet-aus', 'whea', 'grafik-reset', 'speicher-reset'] },
  { titel: 'Programme', ids: ['app-absturz', 'app-haengt'] },
  { titel: 'SolidWorks', ids: ['sw-absturz', 'sw-haengt', 'grafik-reset'] },
  { titel: 'SAP', ids: ['sap-absturz', 'sap-haengt', 'kerberos-fehler', 'erreichbar'] },
  { titel: 'Outlook / Teams / Office', ids: ['outlook-absturz', 'teams-absturz', 'office-absturz'] },
  { titel: 'Langsam / Hänger', ids: ['cpu-hoch', 'ram-hoch', 'speicher-knapp', 'speicher-reset', 'disk-voll', 'cpu-gedrosselt'] },
  { titel: 'Festplatte', ids: ['disk-fehler', 'speicher-reset', 'ntfs-fehler', 'disk-voll'] },
  { titel: 'Drucken', ids: ['spooler-absturz', 'spooler-laeuft'] },
  { titel: 'Anmeldung & Domäne', ids: ['dc-nicht-erreichbar', 'gpo-fehler', 'zeit-sync', 'temp-profil'] },
]

// ── Suche ────────────────────────────────────────────────────────────────────

export function falte(s: string): string {
  return (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[„“"()]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Kontrollen zur Eingabe (z. B. „wlan“, „absturz“, „sap hängt“) — beste zuerst. */
export function sucheKontrollen(eingabe: string, max = 12): MonKontrolle[] {
  const woerter = falte(eingabe).split(' ').filter(w => w.length >= 2)
  if (!woerter.length) return []
  const bewertet: { k: MonKontrolle; p: number }[] = []
  for (const k of KONTROLLEN) {
    const titel = falte(k.titel), bereich = falte(k.bereich), beschr = falte(k.beschreibung)
    let summe = 0, alle = true
    for (const w of woerter) {
      let p = 0
      if (titel.split(' ').some(t => t.startsWith(w))) p = Math.max(p, 6)
      else if (titel.includes(w)) p = Math.max(p, 4)
      if (k.stichworte.some(s => s === w)) p = Math.max(p, 6)
      else if (k.stichworte.some(s => s.startsWith(w) || s.split(' ').some(t => t.startsWith(w)))) p = Math.max(p, 4)
      if (bereich.startsWith(w) || bereich.split(' ').some(t => t.startsWith(w))) p = Math.max(p, 3)
      if (!p && beschr.includes(w)) p = 1
      if (!p) alle = false
      summe += p
    }
    if (!summe) continue
    if (alle) summe += 3                               // alle Wörter getroffen
    if (woerter.some(w => bereich === w || bereich.split(' ').some(t => t === w))) summe += 2   // „wlan“ → Bereich WLAN vor allem anderen
    if (k.standard) summe += 1
    if (k.schwere === 'info') summe -= 1
    bewertet.push({ k, p: summe })
  }
  return bewertet.sort((a, b) => b.p - a.p || a.k.titel.localeCompare(b.k.titel, 'de')).slice(0, max).map(x => x.k)
}

// ── Vorschläge nach Befunden / Behebungen ─────────────────────────────────────

/** Befund-IDs der Voll-Diagnose (diagnosisMapping) → passende Kontrollen. */
const DIAG_ZU_KONTROLLE: [RegExp, string[]][] = [
  [/^evt-1001$/, ['bluescreen', 'unerwartet-aus', 'whea']],
  [/^evt-(6008|41)$/, ['unerwartet-aus', 'bluescreen', 'whea']],
  [/^evt-(7034|7031)$/, ['dienst-absturz', 'dienst-startfehler']],
  [/^evt-1000$/, ['app-absturz', 'app-haengt']],
  [/^evt-(11|51)$/, ['disk-fehler', 'speicher-reset', 'ntfs-fehler']],
  [/^hw-disk-(unhealthy)$/, ['disk-fehler', 'speicher-reset', 'ntfs-fehler']],
  [/^hw-disk-low/, ['disk-voll']],
  [/^hw-ram-high$/, ['ram-hoch', 'speicher-knapp']],
  [/^hw-cpu-high$/, ['cpu-hoch', 'cpu-gedrosselt']],
  [/^hw-device-error$/, ['treiber-ladefehler']],
  [/^svc-spooler/, ['spooler-laeuft', 'spooler-absturz']],
  [/^svc-audio/, ['audio-dienst']],
  [/^svc-/, ['dienst-absturz', 'dienst-startfehler']],
  [/^net-wlan/, ['wlan-trennung', 'wlan-verbindungsfehler', 'wlan-anmeldung', 'erreichbar']],
  [/^net-(dc|sc)/, ['dc-nicht-erreichbar', 'gpo-fehler', 'zeit-sync']],
  [/^net-/, ['erreichbar', 'netz-getrennt', 'lan-link', 'dns-fehler']],
  [/^sec-threat/, ['defender-fund']],
  [/^sec-defender/, ['defender-aus', 'defender-fund']],
  [/^sec-lockout/, ['anmelde-fehler']],
  [/^upd-/, ['update-fehler', 'update-installiert']],
  [/^sw-zscaler/, ['zscaler-dienst']],
  [/^sw-outlook/, ['outlook-absturz']],
  [/^sw-teams/, ['teams-absturz']],
  [/^perf-/, ['cpu-hoch', 'ram-hoch', 'speicher-knapp']],
  [/^prof-temp/, ['temp-profil']],
]

/** Vorschläge zu Befund-IDs der Voll-Diagnose (Reihenfolge bleibt, keine Doppel). */
export function vorschlaegeFuerDiagnose(befundIds: string[]): string[] {
  const out: string[] = []
  for (const id of befundIds) {
    const treffer = DIAG_ZU_KONTROLLE.find(([re]) => re.test(id))
    for (const k of treffer?.[1] || []) if (!out.includes(k)) out.push(k)
  }
  return out
}

/** Standard-Vorschlag je Diagnose-Kachel. */
export const VORSCHLAG_WLAN = ['wlan-trennung', 'wlan-verbindungsfehler', 'wlan-anmeldung', 'erreichbar']
export const VORSCHLAG_LAN = ['netz-getrennt', 'lan-link', 'erreichbar']
export const VORSCHLAG_SOLIDWORKS = ['sw-absturz', 'sw-haengt', 'grafik-reset']
export const VORSCHLAG_SAP = ['sap-absturz', 'sap-haengt', 'kerberos-fehler']

export const auswahlAus = (ids: string[]): MonAuswahl[] => ids.filter(id => NACH_ID.has(id)).map(id => ({ id }))

/** Regex-Text für einen frei eingegebenen Programm-/Dienstnamen (wörtlich, ohne Groß/Klein). */
export function musterAusParam(p: string): string {
  const t = (p || '').trim()
  if (!t) return ''
  return t.split(/[;,]+/).map(s => s.trim()).filter(Boolean)
    .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
}

/** Wirksames Muster einer Auswahl (fest + Parameter). */
export function wirksamesMuster(k: MonKontrolle, a: MonAuswahl): string {
  const p = k.art === 'ereignis' ? musterAusParam(a.param || '') : ''
  if (k.muster && p) return `(?=.*(${k.muster}))(?=.*(${p}))`
  return k.muster || p
}

/** Kurzbeschreibung der Auswahl für Listen/Meldungen. */
export function auswahlText(a: MonAuswahl): string {
  const k = kontrolle(a.id)
  if (!k) return a.id
  return a.param?.trim() ? `${k.titel} (${a.param.trim()})` : k.titel
}
