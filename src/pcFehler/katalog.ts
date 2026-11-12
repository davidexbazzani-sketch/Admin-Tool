// ── PC-Fehler: Katalog bekannter Fehlerbilder aus den Windows-Ereignisprotokollen ──
// Die Protokolle sind voller „Fehler", die keine sind (ein gesunder PC meldet in 7 Tagen
// dutzende). Deshalb zählt nur, was hier als echtes Fehlerbild hinterlegt ist; bekanntes
// Rauschen wird ausgeblendet, alles andere bleibt als „nicht zugeordnet" einsehbar.
// Jedes Fehlerbild nennt den Lösungsweg als Suchtext für „Gib dein Problem ein" — so greift
// immer der aktuelle Problem-Katalog, ohne dass hier feste Kennungen veralten können.

export type Schwere = 'hoch' | 'mittel' | 'niedrig'

/** Eine am PC zusammengezählte Fehlergruppe (7 Tage). */
export interface FehlerGruppe {
  log: string
  quelle: string
  id: number
  /** 1 = kritisch, 2 = Fehler, 3 = Warnung, 4 = Information (Office-Meldungen). */
  stufe: number
  anzahl: number
  zuerst: string
  zuletzt: string
  /** Abstürze: „programm.exe|modul.dll|code" · Office-Meldungen: „Programm|Text". */
  app: string
  text: string
}

export interface Regel {
  id: string
  /** Trifft die Gruppe? */
  wenn: { quelle?: RegExp; log?: RegExp; ids?: number[]; app?: RegExp; text?: RegExp; nichtText?: RegExp }
  titel: string | ((g: FehlerGruppe) => string)
  schwere: Schwere
  /** Was bedeutet das — ein Satz für den Admin. */
  bedeutung: string
  /** Lösungsweg: Suchtext für „Gib dein Problem ein". */
  suche: string | ((g: FehlerGruppe) => string)
  /** Erst ab so vielen Ereignissen in 7 Tagen ein Befund (Standard 1). */
  ab?: number
  /** Ab so vielen Ereignissen eine Stufe schwerer. */
  schwererAb?: number
  /** Mehrere Gruppen zu EINEM Befund je Programm zusammenfassen (Abstürze). */
  jeProgramm?: boolean
}

const exe = (g: FehlerGruppe) => (g.app.split('|')[0] || '').trim()
const prog = (g: FehlerGruppe) => exe(g).replace(/\.exe$/i, '')
const ABSTURZ = /^Application (Error|Hang)$/

/** Bekannte Programme: exe-Muster → Anzeigename + Suchtext. */
const PROGRAMME: { muster: RegExp; name: string; suche: string; schwere?: Schwere }[] = [
  { muster: /^outlook\.exe$/i, name: 'Outlook', suche: 'outlook stürzt ab' },
  { muster: /^winword\.exe$/i, name: 'Word', suche: 'word stürzt ab' },
  { muster: /^excel\.exe$/i, name: 'Excel', suche: 'excel stürzt ab' },
  { muster: /^powerpnt\.exe$/i, name: 'PowerPoint', suche: 'powerpoint stürzt ab' },
  { muster: /^onenote\.exe$/i, name: 'OneNote', suche: 'onenote stürzt ab' },
  { muster: /^(ms-teams|teams)\.exe$/i, name: 'Teams', suche: 'teams startet nicht' },
  { muster: /^msedge\.exe$/i, name: 'Edge', suche: 'edge startet nicht oder schließt sich sofort' },
  { muster: /^chrome\.exe$/i, name: 'Chrome', suche: 'google chrome reagiert nicht' },
  { muster: /^sldworks\.exe$/i, name: 'SolidWorks', suche: 'solidworks stürzt ab', schwere: 'hoch' },
  { muster: /^(saplogon|sapgui|saplgpad|nwbc)\.exe$/i, name: 'SAP', suche: 'sap gui stürzt ab' },
  { muster: /^(acrord32|acrobat)\.exe$/i, name: 'Adobe Acrobat', suche: 'adobe acrobat startet extrem langsam acrocef' },
  { muster: /^onedrive\.exe$/i, name: 'OneDrive', suche: 'onedrive stürzt ab' },
  { muster: /^explorer\.exe$/i, name: 'Windows-Explorer', suche: 'explorer stürzt ab taskleiste weg' },
  { muster: /^zsa(tunnel|tray|service|trayhelper)\.exe$/i, name: 'Zscaler', suche: 'zscaler startet nicht', schwere: 'hoch' },
  { muster: /^ax\.exe$|enaio/i, name: 'enaio', suche: 'enaio stürzt ab' },
  { muster: /xelion/i, name: 'Xelion', suche: 'xelion startet nicht' },
  { muster: /^dwm\.exe$/i, name: 'Windows-Bildschirmverwaltung (dwm)', suche: 'bildschirm wird kurz schwarz anzeigetreiber', schwere: 'hoch' },
  { muster: /^spoolsv\.exe$/i, name: 'Druckwarteschlange', suche: 'druckwarteschlange stürzt ab', schwere: 'hoch' },
  { muster: /^audiodg\.exe$/i, name: 'Windows-Audio', suche: 'kein ton audiodienst neu starten' },
]
const bekannt = (g: FehlerGruppe) => PROGRAMME.find(p => p.muster.test(exe(g)))

/** Code aus dem Text („0x80070005") — hilft der Suche. */
const code = (t: string) => t.match(/0x[0-9a-fA-F]{6,8}/)?.[0] || ''

export const REGELN: Regel[] = [
  // ── Programme stürzen ab oder hängen ──
  {
    id: 'absturz-bekannt', wenn: { quelle: ABSTURZ, app: new RegExp(PROGRAMME.map(p => p.muster.source).join('|'), 'i') },
    titel: g => `${bekannt(g)?.name || prog(g)} stürzt ab oder hängt`,
    schwere: 'mittel', ab: 2, schwererAb: 6, jeProgramm: true,
    bedeutung: 'Windows hat Abstürze bzw. „Keine Rückmeldung“ dieses Programms protokolliert.',
    suche: g => bekannt(g)?.suche || `${prog(g)} stürzt ab`,
  },
  {
    id: 'absturz-sonstige', wenn: { quelle: ABSTURZ, app: /\.exe/i },
    titel: g => `${exe(g)} stürzt ab oder hängt`,
    schwere: 'niedrig', ab: 4, schwererAb: 15, jeProgramm: true,
    bedeutung: 'Ein Programm ist mehrfach abgestürzt oder hat nicht mehr reagiert.',
    suche: g => `${prog(g)} stürzt ab`,
  },
  {
    id: 'laufzeit-fehlt', wenn: { quelle: /^SideBySide$/ },
    titel: 'Programm startet nicht – Laufzeit fehlt (Visual C++)', schwere: 'niedrig', ab: 2,
    bedeutung: 'Ein Programm findet eine benötigte Laufzeit-Bibliothek nicht.',
    suche: 'programm startet nicht visual c++ laufzeit fehlt',
  },
  // ── Absturz des ganzen PCs ──
  {
    id: 'bluescreen', wenn: { quelle: /WER-SystemErrorReporting|^BugCheck$/, ids: [1001] },
    titel: 'Bluescreen', schwere: 'hoch',
    bedeutung: 'Windows ist mit einem Bluescreen abgestürzt und hat neu gestartet.',
    suche: 'pc stürzt mit bluescreen ab',
  },
  {
    id: 'hart-aus', wenn: { quelle: /Kernel-Power$|^EventLog$/, ids: [41, 6008] },
    titel: 'PC wurde hart ausgeschaltet oder ist abgestürzt', schwere: 'mittel', schwererAb: 3,
    bedeutung: 'Windows wurde nicht sauber heruntergefahren (Absturz, Stromausfall, Einschalter lange gedrückt).',
    suche: 'pc geht einfach aus startet von alleine neu',
  },
  // ── Hardware ──
  {
    id: 'platte-intern', wenn: { quelle: /^(disk|Ntfs|volmgr|stornvme|storahci)$/i, text: /Harddisk0\b|Volume C:|\\Device\\HarddiskVolume\d+|stornvme|storahci|Datei(system)?struktur|file system structure/i },
    titel: 'Festplatte/SSD meldet Fehler', schwere: 'hoch',
    bedeutung: 'Der eingebaute Datenträger meldet Lese-/Schreib- oder Dateisystemfehler – Daten sichern, Tausch prüfen.',
    suche: 'festplatte defekt fehler smart',
  },
  {
    id: 'platte-extern', wenn: { quelle: /^disk$/i },
    titel: 'Externer Datenträger (USB) meldet Fehler', schwere: 'niedrig', ab: 5,
    bedeutung: 'Ein angeschlossener Datenträger (nicht die eingebaute Platte) meldet Fehler.',
    suche: 'externe festplatte wird nicht erkannt',
  },
  {
    id: 'hardware-whea', wenn: { quelle: /WHEA-Logger/ },
    titel: 'Hardwarefehler (Prozessor, Speicher oder Steckkarte)', schwere: 'hoch',
    bedeutung: 'Die Hardware selbst hat einen Fehler gemeldet – häufig Vorbote von Abstürzen.',
    suche: 'hardwarefehler pc stürzt ab arbeitsspeicher testen',
  },
  {
    id: 'grafik-haengt', wenn: { quelle: /^Display$/, ids: [4101] },
    titel: 'Grafiktreiber hat sich aufgehängt', schwere: 'mittel', ab: 2, schwererAb: 8,
    bedeutung: 'Der Bildschirm wurde kurz schwarz: „Anzeigetreiber reagiert nicht mehr und wurde wiederhergestellt“.',
    suche: 'bildschirm wird kurz schwarz anzeigetreiber wurde wiederhergestellt',
  },
  {
    id: 'speicher-knapp', wenn: { quelle: /Resource-Exhaustion-Detector/, ids: [2004] },
    titel: 'Arbeitsspeicher wird knapp', schwere: 'mittel', schwererAb: 5,
    bedeutung: 'Windows hat zu wenig freien Arbeitsspeicher festgestellt – Programme werden langsam oder beendet.',
    suche: 'arbeitsspeicher voll pc langsam',
  },
  // ── Dienste ──
  {
    id: 'dienst-druck', wenn: { quelle: /^Service Control Manager$/, ids: [7000, 7001, 7009, 7011, 7022, 7023, 7024, 7031, 7034], text: /Druckwarteschlange|Print Spooler|Spooler/i },
    titel: 'Druckdienst stürzt ab oder startet nicht', schwere: 'hoch',
    bedeutung: 'Ohne den Dienst „Druckwarteschlange“ kann an diesem PC nicht gedruckt werden.',
    suche: 'druckwarteschlange stürzt ab',
  },
  {
    id: 'dienst-audio', wenn: { quelle: /^Service Control Manager$/, ids: [7000, 7001, 7009, 7011, 7022, 7023, 7024, 7031, 7034], text: /Windows-Audio|Windows Audio|Audiosrv/i },
    titel: 'Audiodienst stürzt ab oder startet nicht', schwere: 'mittel',
    bedeutung: 'Ohne den Dienst „Windows-Audio“ gibt es keinen Ton.',
    suche: 'kein ton audiodienst neu starten',
  },
  {
    id: 'dienst-zscaler', wenn: { quelle: /^Service Control Manager$/, ids: [7000, 7001, 7009, 7011, 7022, 7023, 7024, 7031, 7034], text: /Zscaler|ZSA/ },
    titel: 'Zscaler-Dienst stürzt ab oder startet nicht', schwere: 'hoch',
    bedeutung: 'Ohne Zscaler gibt es kein Internet und keinen Zugriff auf interne Anwendungen.',
    suche: 'zscaler startet nicht',
  },
  {
    id: 'dienst-intune', wenn: { quelle: /^Service Control Manager$/, ids: [7000, 7001, 7009, 7011, 7022, 7023, 7024, 7031, 7034], text: /Intune/i },
    titel: 'Intune-Dienst stürzt ab oder startet nicht', schwere: 'mittel',
    bedeutung: 'Ohne den Intune-Dienst kommen keine Programme und Richtlinien mehr auf den PC.',
    suche: 'intune synchronisiert nicht unternehmensportal',
  },
  // ── Anmeldung, Domäne, Profil ──
  {
    id: 'vertrauen', wenn: { quelle: /^NETLOGON$/i, ids: [3210, 5722, 5805] },
    titel: 'Vertrauensstellung zur Domäne gestört', schwere: 'hoch',
    bedeutung: 'Der PC kann sich nicht mehr an der Domäne ausweisen – Anmeldungen schlagen bald fehl.',
    suche: 'vertrauensstellung zwischen arbeitsstation und domäne',
  },
  {
    id: 'profil', wenn: { quelle: /User Profiles Service|User Profile Service/i, ids: [1500, 1502, 1508, 1511, 1515] },
    titel: 'Benutzerprofil wird nicht geladen (temporäres Profil)', schwere: 'hoch',
    bedeutung: 'Windows konnte das Profil eines Benutzers nicht laden; er arbeitet in einem temporären Profil und verliert Daten.',
    suche: 'temporäres profil angemeldet',
  },
  {
    id: 'richtlinien', wenn: { quelle: /GroupPolicy/i, ids: [1030, 1055, 1058, 1129] },
    titel: 'Gruppenrichtlinien werden nicht angewendet', schwere: 'niedrig', ab: 15,
    bedeutung: 'Der PC erreicht die Domäne oft nicht, um Richtlinien zu holen (bei Notebooks außer Haus normal – daher erst ab vielen Fehlern).',
    suche: 'gruppenrichtlinien werden nicht angewendet gpupdate',
  },
  // ── Updates und Installationen ──
  {
    id: 'update-fehler', wenn: { quelle: /WindowsUpdateClient/, ids: [20, 25], nichtText: /9[A-Z0-9]{11}-|Security Intelligence|KB2267602/ },
    titel: 'Windows-Update schlägt fehl', schwere: 'mittel', ab: 3,
    bedeutung: 'Ein Windows-Update lässt sich wiederholt nicht installieren.',
    suche: g => `windows update fehler ${code(g.text)}`.trim(),
  },
  {
    id: 'installation', wenn: { quelle: /^MsiInstaller$/, ids: [1024, 10005, 11708] },
    titel: 'Installation eines Programms fehlgeschlagen', schwere: 'niedrig', ab: 2,
    bedeutung: 'Ein Installationspaket ist mit Fehler abgebrochen.',
    suche: 'installation fehlgeschlagen',
  },
  // ── Drucken ──
  {
    id: 'druck-auftrag', wenn: { log: /PrintService/i, ids: [372] },
    titel: 'Druckaufträge schlagen fehl', schwere: 'mittel', ab: 3,
    bedeutung: 'Dokumente konnten nicht gedruckt werden.',
    suche: 'drucker druckt nicht auftrag bleibt hängen',
  },
  {
    id: 'druck-treiber', wenn: { log: /PrintService/i, ids: [215, 808, 4909] },
    titel: 'Druckertreiber lässt sich nicht laden', schwere: 'mittel', ab: 2,
    bedeutung: 'Ein Druckertreiber ist beschädigt oder passt nicht.',
    suche: 'druckertreiber lässt sich nicht installieren',
  },
  // ── Netzwerk ──
  {
    id: 'wlan-adapter', wenn: { quelle: /^Netwtw\d+$/i, ids: [5002, 5005, 5007, 5010] },
    titel: 'WLAN-Adapter setzt sich zurück', schwere: 'mittel', ab: 3,
    bedeutung: 'Der WLAN-Treiber meldet Abstürze des Adapters – Verbindung bricht ab.',
    suche: 'wlan trennt sich ständig',
  },
  {
    id: 'wlan-verbindung', wenn: { quelle: /WLAN-AutoConfig/, ids: [8002, 11006, 12013] },
    titel: 'WLAN-Verbindung schlägt oft fehl', schwere: 'niedrig', ab: 20,
    bedeutung: 'Der PC konnte sich häufig nicht mit dem WLAN verbinden.',
    suche: 'wlan verbindet nicht',
  },
  // ── Sicherheit ──
  {
    id: 'virenschutz-fund', wenn: { quelle: /Windows Defender/, ids: [1008, 1119] },
    titel: 'Schadsoftware gefunden – Bereinigung fehlgeschlagen', schwere: 'hoch',
    bedeutung: 'Der Virenschutz hat etwas gefunden und konnte es nicht entfernen.',
    suche: 'virus gefunden defender',
  },
  {
    id: 'virenschutz-aus', wenn: { quelle: /Windows Defender/, ids: [3002, 5001, 5010, 5012] },
    titel: 'Virenschutz ist aus oder gestört', schwere: 'mittel',
    bedeutung: 'Der Echtzeitschutz von Defender wurde abgeschaltet oder funktioniert nicht.',
    suche: 'defender echtzeitschutz aus',
  },
  {
    id: 'bitlocker-schluessel', wenn: { quelle: /BitLocker-API/, ids: [846] },
    titel: 'BitLocker-Wiederherstellungsschlüssel wird nicht gesichert', schwere: 'mittel',
    bedeutung: 'Der Schlüssel konnte nicht im Verzeichnis hinterlegt werden – bei einer BitLocker-Abfrage fehlt er dann.',
    suche: 'bitlocker wiederherstellungsschlüssel',
  },
  // ── Fehlermeldungen, die Office dem Benutzer gezeigt hat ──
  {
    id: 'office-meldung', wenn: { log: /^OAlerts$/, text: /fehler|error|nicht |kann |konnte|failed|problem|ungültig|beschädigt|0x[0-9a-fA-F]{4,}/i, nichtText: /möchten sie|do you want|wirklich|speichern\?|save your changes|are you sure/i },
    titel: g => `${(g.app.split('|')[0] || 'Office').replace(/^Microsoft /, '')} zeigt wiederholt eine Fehlermeldung`,
    schwere: 'niedrig', ab: 3, schwererAb: 10, jeProgramm: true,
    bedeutung: 'Diese Meldung hat der Benutzer mehrfach auf dem Bildschirm gesehen.',
    suche: g => `${(g.app.split('|')[0] || '').replace(/^Microsoft /, '')} ${g.text}`.trim().slice(0, 140),
  },
]

/**
 * Bekanntes Rauschen: steht bei praktisch jedem gesunden PC im Protokoll und ist kein Anlass
 * zum Handeln. Wird ausgeblendet (nicht gelöscht — in der Detailansicht mitgezählt).
 */
export const RAUSCHEN = new RegExp([
  'StateRepository', 'WMI-Activity', '^Microsoft-Windows-WMI$', 'LessPrivilegedAppContainer', 'StorDiag', 'DistributedCOM', '^Microsoft-Windows-WinRM$',
  'Install-Agent', 'Windows-ApplicationModel-Store', 'CloudStore', 'AppXDeployment', 'AppReadiness', 'AppModel-Runtime', 'Kernel-EventTracing',
  'CodeIntegrity', 'CloudRestoreLauncher', 'Perflib', 'PerfNet', 'PerfOS', 'DeviceAssociationService', 'Immersive-Shell', 'Kernel-Boot', 'StorageManagement',
  'Diagnosis-Scheduled', 'Windows Firewall', 'NlaSvc', 'BitLocker-Driver', '^ESENT$', 'CAPI2', 'Security-SPP', 'TaskScheduler',
  'DeviceManagement-Enterprise-Diagnostics', '^Microsoft-Windows-AAD$', '^Schannel$', 'Bits-Client', 'DeliveryOptimization', 'PushNotification',
  'Windows Search', 'SettingSync', 'Shell-Core', 'Hyper-V', 'VHDMP', 'WebAuthN', 'TPM-WMI', 'ModernDeployment', 'SMBClient', 'SMBServer',
  'Time-Service', 'DeviceSetupManager', 'UserModePowerService', 'Eventlog$', 'Ntfs \\(Microsoft-Windows-Ntfs\\)', 'Biometrics', 'Crypto-DPAPI',
  'Known Folders', 'Winlogon', 'RestartManager', 'VSS$', 'volsnap', 'Dhcp', 'IPv6', 'Tcpip', 'HttpEvent', 'LSA', 'LsaSrv', 'Kerberos', 'Security-Kerberos',
  'TerminalServices', 'RemoteDesktop', 'Wininit', 'User Device Registration', 'Workplace Join', 'Partition', 'Ntfs/Operational', 'OneCore', 'Dwm-Core',
  'BitLocker-API', 'NETLOGON', 'GroupPolicy', 'Kernel-PnP', 'Kernel-General', 'FilterManager', 'Complus', 'COM\\+', 'MSDTC', 'Customer Experience', 'SecurityCenter',
  'Service Control Manager', 'BTHUSB', 'BTHPORT', 'e1[dir]express', 'e2fexpress', 'UmRdpService', 'SgrmBroker', 'Wcmsvc', 'WLAN-AutoConfig', 'Windows Defender', 'MsiInstaller',
  'WindowsUpdateClient', 'Servicing', '^\\.NET Runtime', 'Windows Error Reporting',
  // Office-Dialoge, die keine Fehlermeldung sind (Rückfragen wie „Änderungen speichern?")
  '^OAlerts$', 'Office.*Alerts',
].join('|'), 'i')
