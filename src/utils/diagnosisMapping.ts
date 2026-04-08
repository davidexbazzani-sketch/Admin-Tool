// ── PC-Diagnose: Fehler-zu-Skill Mapping ──────────────────────────────────────
// Zentrale Wissensbasis die Diagnose-Ergebnisse auf Fehler, Erklärungen und
// passende Remote Doc Skills mapped.

export type Severity = 'critical' | 'warning' | 'info'

export interface DiagFinding {
  id: string
  severity: Severity
  category: string       // Diagnose-Bereich (event-logs, hardware, services, etc.)
  title: string
  description: string
  causes: string[]
  solution: string
  skillId?: string       // Remote Doc Skill ID
  skillCategory?: string // Remote Doc Category ID
  skillInput?: string    // Vorbelegter Input für den Skill
  rawData?: unknown      // Original-Daten für Detail-Ansicht
}

export interface DiagRule {
  id: string
  pattern?: RegExp
  eventIds?: number[]
  check: string          // Welcher Check hat den Fehler produziert
  severity: Severity
  title: string | ((match: string) => string)
  description: string
  causes: string[]
  solution: string
  skillId?: string
  skillCategory?: string
  skillInput?: string | ((match: string) => string)
}

// ══════════════════════════════════════════════════════════════════════════════
// MAPPING-REGELN (60+)
// ══════════════════════════════════════════════════════════════════════════════

export const DIAG_RULES: DiagRule[] = [
  // ── EVENT-LOG FEHLER ────────────────────────────────────────────────────
  { id: 'evt-6008', eventIds: [6008], check: 'event-logs', severity: 'critical',
    title: 'Unerwarteter Shutdown / Absturz', description: 'Der PC wurde nicht ordnungsgemäß heruntergefahren — er hat sich aufgehängt oder ist abgestürzt.',
    causes: ['Bluescreen (BSOD)', 'Stromausfall', 'Überhitzung', 'Defekter RAM oder Festplatte'],
    solution: 'Prüfen Sie die Event-Logs auf Bluescreen-Einträge (BugCheck). Führen Sie sfc /scannow und DISM aus.',
    skillId: 'evtcrit', skillCategory: 'repair' },
  { id: 'evt-1001', eventIds: [1001], check: 'event-logs', severity: 'critical', pattern: /BugCheck/i,
    title: 'Bluescreen (BSOD) aufgetreten', description: 'Windows hat einen kritischen Fehler erkannt und musste neu starten.',
    causes: ['Fehlerhafter Treiber', 'Defekter RAM', 'Beschädigte Systemdateien', 'Inkompatible Software'],
    solution: 'SFC und DISM Reparatur ausführen. Treiber prüfen. RAM-Test durchführen.',
    skillId: 'sfcdism', skillCategory: 'appcache' },
  { id: 'evt-41', eventIds: [41], check: 'event-logs', severity: 'critical',
    title: 'Kernel-Power Fehler — PC wurde unerwartet ausgeschaltet', description: 'Das System wurde ohne ordnungsgemäßes Herunterfahren ausgeschaltet.',
    causes: ['Stromausfall', 'Power-Button gedrückt', 'Überhitzung', 'Defektes Netzteil'],
    solution: 'Netzteil und Stromversorgung prüfen. Bei Laptops: Akku-Status checken.',
    skillId: 'evtcrit', skillCategory: 'repair' },
  { id: 'evt-7034', eventIds: [7034], check: 'event-logs', severity: 'warning',
    title: 'Dienst unerwartet beendet', description: 'Ein Windows-Dienst wurde unerwartet beendet.',
    causes: ['Fehler im Dienst', 'Ressourcen-Mangel', 'Konflikt mit anderem Programm'],
    solution: 'Den betroffenen Dienst neu starten. Event-Details prüfen welcher Dienst betroffen ist.',
    skillId: 'svc-restart', skillCategory: 'svc' },
  { id: 'evt-7031', eventIds: [7031], check: 'event-logs', severity: 'warning',
    title: 'Dienst-Absturz — Wiederherstellungsaktion ausgeführt', description: 'Ein Dienst ist abgestürzt und Windows hat die konfigurierte Wiederherstellungsaktion ausgeführt.',
    causes: ['Fehler im Dienst', 'Fehlende Abhängigkeit', 'Beschädigte Installation'],
    solution: 'Prüfen welcher Dienst abgestürzt ist und ob er jetzt wieder läuft.',
    skillId: 'svc-restart', skillCategory: 'svc' },
  { id: 'evt-1000', eventIds: [1000], check: 'event-logs', severity: 'warning',
    title: 'Anwendung abgestürzt', description: 'Eine Anwendung hat einen Fehler verursacht und wurde beendet.',
    causes: ['Software-Bug', 'Inkompatibilität', 'Beschädigte Installation', 'Fehlende DLL'],
    solution: 'Die betroffene Anwendung reparieren oder neu installieren. SFC ausführen bei Systemanwendungen.',
    skillId: 'sfc', skillCategory: 'repair' },
  { id: 'evt-11', eventIds: [11], check: 'event-logs', severity: 'critical',
    title: 'Festplatten-E/A-Fehler (Disk)', description: 'Der Controller hat einen Fehler auf der Festplatte erkannt.',
    causes: ['Defekte Sektoren', 'Kabel locker', 'Festplatte am Ende der Lebensdauer'],
    solution: 'SMART-Status prüfen. CHKDSK ausführen. Bei vielen Fehlern: Festplatte austauschen.',
    skillId: 'disksmart', skillCategory: 'diskmgmt' },
  { id: 'evt-51', eventIds: [51], check: 'event-logs', severity: 'warning',
    title: 'Festplatten-Paging-Fehler', description: 'Windows konnte nicht auf die Auslagerungsdatei zugreifen.',
    causes: ['Festplatten-Fehler', 'Zu wenig freier Speicher', 'Fragmentierung'],
    solution: 'Festplatte prüfen und freien Speicher sicherstellen.',
    skillId: 'chkdskrun', skillCategory: 'diskmgmt' },

  // ── HARDWARE ────────────────────────────────────────────────────────────
  { id: 'hw-disk-unhealthy', check: 'hardware', severity: 'critical', pattern: /HealthStatus.*(Warning|Unhealthy|Unknown)/i,
    title: 'Festplatte defekt oder fehlerhaft', description: 'Die physische Festplatte meldet einen nicht-gesunden Zustand.',
    causes: ['Festplatte am Ende der Lebensdauer', 'Defekte Sektoren', 'Überhitzung'],
    solution: 'Daten sofort sichern! Festplatte austauschen lassen.',
    skillId: 'disksmart', skillCategory: 'diskmgmt' },
  { id: 'hw-disk-low10', check: 'hardware', severity: 'warning', pattern: /frei.*([0-9]\.)/i,
    title: (m) => `Festplatte ${m} fast voll (unter 10% frei)`, description: 'Auf der Festplatte ist weniger als 10% freier Speicher.',
    causes: ['Zu viele Dateien', 'Großer Teams/Outlook Cache', 'Temp-Dateien', 'Windows Updates'],
    solution: 'Temp-Dateien leeren, alte Dateien löschen, Papierkorb leeren.',
    skillId: 'wintemp', skillCategory: 'disk' },
  { id: 'hw-disk-low5', check: 'hardware', severity: 'critical', pattern: /frei.*([0-4]\.)/i,
    title: (m) => `Festplatte ${m} kritisch voll (unter 5% frei)`, description: 'Auf der Festplatte ist fast kein Platz mehr! Programme können abstürzen.',
    causes: ['Dringender Platzmangel'],
    solution: 'Sofort Temp-Dateien leeren, Papierkorb leeren. Große Dateien suchen.',
    skillId: 'wintemp', skillCategory: 'disk' },
  { id: 'hw-device-error', check: 'hardware', severity: 'warning', pattern: /ConfigManagerErrorCode/i,
    title: 'Gerät mit Treiber-Fehler', description: 'Ein Gerät im Geräte-Manager hat einen Fehler-Code.',
    causes: ['Fehlender/veralteter Treiber', 'Hardware-Defekt', 'Treiber-Konflikt'],
    solution: 'Im Geräte-Manager den Treiber aktualisieren oder das Gerät neu installieren.',
    skillId: 'deverror', skillCategory: 'devmgr' },
  { id: 'hw-ram-high', check: 'hardware', severity: 'warning',
    title: 'RAM-Auslastung über 85%', description: 'Der Arbeitsspeicher ist stark ausgelastet.',
    causes: ['Zu viele Programme offen', 'Speicherleck in einer Anwendung', 'Zu wenig RAM'],
    solution: 'Nicht benötigte Programme schließen. RAM-fressende Prozesse identifizieren.',
    skillId: 'topram', skillCategory: 'procs' },
  { id: 'hw-cpu-high', check: 'hardware', severity: 'warning',
    title: 'CPU-Auslastung dauerhaft über 80%', description: 'Der Prozessor ist stark ausgelastet.',
    causes: ['Ein Prozess blockiert die CPU', 'Malware', 'Indexierung läuft', 'Windows Update'],
    solution: 'CPU-fressende Prozesse identifizieren und ggf. beenden.',
    skillId: 'topcpu', skillCategory: 'procs' },
  { id: 'hw-battery-bad', check: 'hardware', severity: 'warning', pattern: /battery.*(degraded|poor|replace)/i,
    title: 'Akku verschlissen', description: 'Der Laptop-Akku hat deutlich an Kapazität verloren.',
    causes: ['Normaler Verschleiß', 'Alter des Geräts'],
    solution: 'Akku-Bericht prüfen und ggf. Akku austauschen lassen.',
    skillId: 'batreport', skillCategory: 'power' },

  // ── DIENSTE ─────────────────────────────────────────────────────────────
  { id: 'svc-spooler-stopped', check: 'services', severity: 'warning', pattern: /Spooler/i,
    title: 'Druckdienst (Spooler) gestoppt', description: 'Der Druckdienst läuft nicht — Drucken ist nicht möglich.',
    causes: ['Dienst abgestürzt', 'Beschädigter Druckauftrag', 'Treiber-Problem'],
    solution: 'Spooler-Dienst neustarten.',
    skillId: 'svc-restart', skillCategory: 'svc', skillInput: 'Spooler' },
  { id: 'svc-bits-stopped', check: 'services', severity: 'warning', pattern: /BITS/i,
    title: 'BITS-Dienst gestoppt', description: 'Der Hintergrund-Dateiübertragungsdienst läuft nicht — Windows Updates funktionieren nicht.',
    causes: ['Dienst abgestürzt', 'Beschädigte Update-Komponenten'],
    solution: 'BITS-Dienst neustarten. Bei wiederholtem Fehler: Windows Update Reset.',
    skillId: 'svc-restart', skillCategory: 'svc', skillInput: 'BITS' },
  { id: 'svc-wuauserv-stopped', check: 'services', severity: 'warning', pattern: /wuauserv/i,
    title: 'Windows Update-Dienst gestoppt', description: 'Windows kann keine Updates suchen oder installieren.',
    causes: ['Dienst deaktiviert', 'Beschädigte Update-Komponenten'],
    solution: 'Update-Dienst neustarten. Bei wiederholtem Fehler: Update-Reset durchführen.',
    skillId: 'wupdatereset', skillCategory: 'appcache' },
  { id: 'svc-audio-stopped', check: 'services', severity: 'warning', pattern: /AudioSrv|Audiosrv/i,
    title: 'Audio-Dienst gestoppt', description: 'Der Windows Audio-Dienst läuft nicht — kein Sound.',
    causes: ['Dienst abgestürzt', 'Treiber-Problem'],
    solution: 'Audio-Dienst neustarten.',
    skillId: 'svc-restart', skillCategory: 'svc', skillInput: 'AudioSrv' },
  { id: 'svc-winrm-stopped', check: 'services', severity: 'info', pattern: /WinRM/i,
    title: 'WinRM-Dienst gestoppt', description: 'Remote-Verwaltung über WinRM ist nicht verfügbar.',
    causes: ['Dienst nicht konfiguriert', 'Absichtlich deaktiviert'],
    solution: 'WinRM aktivieren für Remote-Management.',
    skillId: 'svc-start', skillCategory: 'svc', skillInput: 'WinRM' },
  { id: 'svc-generic-stopped', check: 'services', severity: 'warning',
    title: (m) => `Dienst "${m}" gestoppt (sollte laufen)`, description: 'Ein Dienst der auf "Automatisch" steht, läuft nicht.',
    causes: ['Dienst abgestürzt', 'Abhängigkeit fehlgeschlagen', 'Startfehler'],
    solution: 'Den Dienst neustarten.',
    skillId: 'svc-restart', skillCategory: 'svc', skillInput: (m) => m },

  // ── NETZWERK ────────────────────────────────────────────────────────────
  { id: 'net-dns-fail', check: 'network', severity: 'critical',
    title: 'DNS-Auflösung funktioniert nicht', description: 'Der PC kann keine Hostnamen auflösen — Internet und interne Dienste nicht erreichbar.',
    causes: ['DNS-Server nicht erreichbar', 'Netzwerkkabel getrennt', 'Falscher DNS konfiguriert'],
    solution: 'DNS-Cache leeren. Netzwerkverbindung prüfen.',
    skillId: 'flushdns', skillCategory: 'net' },
  { id: 'net-gateway-fail', check: 'network', severity: 'critical',
    title: 'Gateway nicht erreichbar', description: 'Der Standard-Gateway ist nicht erreichbar — keine Netzwerkverbindung.',
    causes: ['Netzwerkkabel getrennt', 'Switch/Router Problem', 'Falsches VLAN'],
    solution: 'Netzwerkkabel prüfen. IP-Konfiguration prüfen.',
    skillId: 'ipconfig', skillCategory: 'net' },
  { id: 'net-dc-fail', check: 'network', severity: 'critical',
    title: 'Domain Controller nicht erreichbar', description: 'Kein Domain Controller erreichbar — Anmeldung und GPO-Updates funktionieren nicht.',
    causes: ['Netzwerk-Problem', 'DC ausgefallen', 'DNS-Problem'],
    solution: 'Netzwerk und DNS prüfen. Kerberos-Tickets erneuern.',
    skillId: 'kpurge', skillCategory: 'domain' },
  { id: 'net-sc-broken', check: 'network', severity: 'critical',
    title: 'Domain-Vertrauensstellung defekt', description: 'Der Secure Channel zwischen PC und Domain ist unterbrochen.',
    causes: ['PC-Passwort abgelaufen', 'PC zu lange offline', 'Domain-Problem'],
    solution: 'Computer-Passwort zurücksetzen. PC muss ggf. neu in die Domäne.',
    skillId: 'resetpwd', skillCategory: 'domain' },
  { id: 'net-adapter-disconnected', check: 'network', severity: 'warning', pattern: /Disconnected|Getrennt|MediaDisconnected/i,
    title: 'Netzwerkadapter getrennt', description: 'Ein Netzwerkadapter hat keine Verbindung.',
    causes: ['Kabel nicht eingesteckt', 'WLAN nicht verbunden', 'Adapter deaktiviert'],
    solution: 'Kabel prüfen oder WLAN verbinden.',
    skillId: 'getadapter', skillCategory: 'net' },
  { id: 'net-wlan-disconnected', check: 'network', severity: 'warning',
    title: 'WLAN nicht verbunden', description: 'Der WLAN-Adapter ist nicht mit einem Netzwerk verbunden.',
    causes: ['WLAN ausgeschaltet', 'Außer Reichweite', 'Falsches Passwort'],
    solution: 'WLAN-Status prüfen und verbinden.',
    skillId: 'wlanstatus', skillCategory: 'wlan' },

  // ── SICHERHEIT ──────────────────────────────────────────────────────────
  { id: 'sec-defender-outdated', check: 'security', severity: 'warning',
    title: 'Defender-Signaturen veraltet', description: 'Die Virenschutz-Definitionen sind älter als 7 Tage.',
    causes: ['Kein Internet', 'Update-Dienst gestört', 'PC lange offline'],
    solution: 'Defender-Signaturen manuell aktualisieren.',
    skillId: 'defsigupd', skillCategory: 'security' },
  { id: 'sec-threat-found', check: 'security', severity: 'critical',
    title: 'Malware/Bedrohung erkannt', description: 'Windows Defender hat eine Bedrohung gefunden.',
    causes: ['Infizierte Datei heruntergeladen', 'USB-Stick', 'E-Mail-Anhang'],
    solution: 'Sofort einen Defender-Scan ausführen und Bedrohungen entfernen.',
    skillId: 'defquick', skillCategory: 'security' },
  { id: 'sec-defender-disabled', check: 'security', severity: 'critical',
    title: 'Windows Defender deaktiviert', description: 'Der Echtzeitschutz ist ausgeschaltet — der PC ist ungeschützt.',
    causes: ['Manuell deaktiviert', 'Anderer Virenscanner installiert', 'GPO'],
    solution: 'Defender-Status prüfen und Echtzeitschutz aktivieren.',
    skillId: 'defstatus', skillCategory: 'security' },
  { id: 'sec-bitlocker-off', check: 'security', severity: 'info',
    title: 'BitLocker nicht aktiv', description: 'Die Festplatte ist nicht verschlüsselt.',
    causes: ['Nie aktiviert', 'TPM-Problem', 'Nicht von der IT konfiguriert'],
    solution: 'BitLocker-Status prüfen. Ggf. Intune-Compliance checken.',
    skillId: 'bitlocker', skillCategory: 'security' },
  { id: 'sec-lockout', check: 'security', severity: 'warning',
    title: 'Kontosperrungen erkannt', description: 'Es gab kürzlich Kontosperrungen — möglicherweise ein falsches Passwort gespeichert.',
    causes: ['Falsches Passwort in einer App', 'Altes WLAN-Passwort', 'Credential Manager'],
    solution: 'Credential Manager prüfen und alte Einträge entfernen.',
    skillId: 'log-sec-lockout', skillCategory: 'eventlogs' },
  { id: 'sec-cert-expiring', check: 'security', severity: 'warning',
    title: 'Zertifikat läuft bald ab', description: 'Ein oder mehrere Zertifikate laufen in den nächsten 30 Tagen ab.',
    causes: ['Automatische Erneuerung fehlgeschlagen', 'Manuelles Zertifikat'],
    solution: 'Zertifikate im Zertifikatsspeicher prüfen.',
    skillId: 'log-sec-all', skillCategory: 'eventlogs' },

  // ── UPDATES ─────────────────────────────────────────────────────────────
  { id: 'upd-outdated30', check: 'updates', severity: 'warning',
    title: 'Letztes Windows Update vor über 30 Tagen', description: 'Der PC hat seit über 30 Tagen kein Update installiert.',
    causes: ['Update-Dienst defekt', 'Netzwerk-Problem', 'GPO blockiert Updates'],
    solution: 'Windows Update manuell starten. Update-Dienste prüfen.',
    skillId: 'usoscan', skillCategory: 'gpo' },
  { id: 'upd-pending', check: 'updates', severity: 'info',
    title: 'Updates ausstehend', description: 'Es sind Updates verfügbar die noch nicht installiert wurden.',
    causes: ['Neustart erforderlich', 'Download läuft noch'],
    solution: 'Updates installieren und PC neustarten.',
    skillId: 'usoinst', skillCategory: 'gpo' },
  { id: 'upd-gpo-old', check: 'updates', severity: 'info',
    title: 'GPO-Anwendung veraltet', description: 'Die Gruppenrichtlinien wurden seit längerem nicht aktualisiert.',
    causes: ['PC offline', 'DC nicht erreichbar', 'Netzwerk-Problem'],
    solution: 'GPO-Update manuell starten.',
    skillId: 'gpupdate', skillCategory: 'gpo' },

  // ── SOFTWARE ────────────────────────────────────────────────────────────
  { id: 'sw-teams-cache', check: 'software', severity: 'warning',
    title: 'Teams Cache über 500 MB', description: 'Der Microsoft Teams Cache ist sehr groß und kann Teams verlangsamen.',
    causes: ['Lange Nutzung ohne Cache-Bereinigung'],
    solution: 'Teams Cache löschen (Teams wird dabei geschlossen).',
    skillId: 'teamscache', skillCategory: 'appcache' },
  { id: 'sw-outlook-ost', check: 'software', severity: 'warning',
    title: 'Outlook OST-Datei über 5 GB', description: 'Die Outlook-Datendatei ist sehr groß und kann Outlook verlangsamen.',
    causes: ['Großes Postfach', 'Alte E-Mails nicht archiviert'],
    solution: 'Alte E-Mails archivieren. Outlook Cache neu aufbauen.',
    skillId: 'outlookcache', skillCategory: 'appcache' },
  { id: 'sw-zscaler-off', check: 'software', severity: 'warning', pattern: /Zscaler.*(Stopped|gestoppt)/i,
    title: 'Zscaler nicht aktiv', description: 'Zscaler läuft nicht — Webfilterung und VPN sind deaktiviert.',
    causes: ['Dienst abgestürzt', 'Deinstalliert', 'Firewall blockiert'],
    solution: 'Zscaler-Dienst neustarten.',
    skillId: 'svc-restart', skillCategory: 'svc', skillInput: 'ZSATunnel' },

  // ── PERFORMANCE ─────────────────────────────────────────────────────────
  { id: 'perf-uptime14', check: 'performance', severity: 'warning',
    title: 'PC seit über 14 Tagen nicht neugestartet', description: 'Ein regelmäßiger Neustart ist wichtig für Updates und Stabilität.',
    causes: ['Benutzer fährt nie herunter', 'Nur Standby genutzt'],
    solution: 'PC neustarten lassen.',
    skillId: 'log-shutdown', skillCategory: 'eventlogs' },
  { id: 'perf-uptime30', check: 'performance', severity: 'critical',
    title: 'PC seit über 30 Tagen nicht neugestartet!', description: 'Dringend neustarten — Updates können nicht angewendet werden.',
    causes: ['Benutzer fährt nie herunter'],
    solution: 'Neustart dringend erforderlich.',
    skillId: 'log-shutdown', skillCategory: 'eventlogs' },
  { id: 'perf-autostart', check: 'performance', severity: 'warning',
    title: (m) => `Zu viele Autostart-Programme (${m})`, description: 'Viele Autostart-Programme verlangsamen den Systemstart.',
    causes: ['Software installiert sich in den Autostart'],
    solution: 'Nicht benötigte Autostart-Programme deaktivieren.',
    skillId: 'autostart', skillCategory: 'procs' },
  { id: 'perf-temp-large', check: 'performance', severity: 'info',
    title: 'Temp-Ordner über 1 GB', description: 'Die temporären Dateien belegen viel Speicherplatz.',
    causes: ['Normale Nutzung', 'Fehlgeschlagene Installationen'],
    solution: 'Temp-Dateien leeren.',
    skillId: 'wintemp', skillCategory: 'disk' },

  // ── BENUTZERPROFIL ──────────────────────────────────────────────────────
  { id: 'prof-temp', check: 'profile', severity: 'critical',
    title: 'Temporäres Profil erkannt', description: 'Der Benutzer arbeitet mit einem temporären Profil — Einstellungen und Dateien gehen beim Abmelden verloren!',
    causes: ['Registry .bak Eintrag', 'Profil konnte nicht geladen werden', 'Festplatte voll'],
    solution: 'Temp-Profil in der Registry reparieren. PC danach neustarten.',
    skillId: 'tempprofile', skillCategory: 'userprofiles' },
  { id: 'prof-large', check: 'profile', severity: 'info',
    title: (m) => `Benutzerprofil sehr groß (${m})`, description: 'Ein großes Profil verlangsamt An- und Abmeldung.',
    causes: ['Viele Dateien auf dem Desktop', 'Große Downloads', 'OneDrive Sync'],
    solution: 'Nicht benötigte Dateien löschen. Downloads-Ordner aufräumen.',
    skillId: 'profilesizes', skillCategory: 'userprofiles' },
]

/** Find matching rules for a raw finding */
export function matchRules(check: string, rawText: string, eventId?: number): DiagRule[] {
  return DIAG_RULES.filter(r => {
    if (r.check !== check) return false
    if (r.eventIds && eventId && r.eventIds.includes(eventId)) return true
    if (r.pattern && r.pattern.test(rawText)) return true
    return false
  })
}

/** Create a DiagFinding from a rule and optional context */
export function createFinding(rule: DiagRule, context: string = '', rawData?: unknown): DiagFinding {
  return {
    id: `${rule.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    severity: rule.severity,
    category: rule.check,
    title: typeof rule.title === 'function' ? rule.title(context) : rule.title,
    description: rule.description,
    causes: rule.causes,
    solution: rule.solution,
    skillId: rule.skillId,
    skillCategory: rule.skillCategory,
    skillInput: typeof rule.skillInput === 'function' ? rule.skillInput(context) : rule.skillInput,
    rawData,
  }
}
