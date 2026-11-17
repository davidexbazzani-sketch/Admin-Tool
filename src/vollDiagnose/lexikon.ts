// ── PC-Volldiagnose: Ereignis-Lexikon ─────────────────────────────────────────
// Basis sind die Fehlerbilder der Proaktiven Fehlersuche (src/pcFehler/katalog.ts, dort mit
// Rauschliste). Hier kommen Ereignisse dazu, die für eine Komplett-Diagnose wichtig sind
// (Dateisystem, Dienste allgemein, Domäne/Zeit/Kerberos, DNS/DHCP, VSS, Treiber, Defender,
// Secure Boot) und Server-Ereignisse (SQL, IIS, DFSR, Sicherung, DNS-Server, AD-Replikation).
// Reihenfolge der Auswertung: zuerst die Regeln der Proaktiven Fehlersuche, dann diese.
// `typ` verknüpft mit dem Lösungskatalog (katalog.ts) — ohne `typ` greift `suche` (Problem-Katalog).

import { REGELN as PF_REGELN, RAUSCHEN as PF_RAUSCHEN, type FehlerGruppe, type Regel } from '../pcFehler/katalog'
import { lwAusText, type DatentraegerInfo } from './datentraeger'

export interface VdEreignisRegel extends Regel {
  /** Befund-Typ im Lösungskatalog („evt:…“) — Standard „evt:<id>“ */
  typ?: string
  /** Eingabe für Lösungsschritte (z. B. Dienstname aus dem Ereignistext, Laufwerk) */
  eingabe?: (g: FehlerGruppe, geraete?: DatentraegerInfo) => string
  /** Je Eingabe (z. B. je Dienst) ein eigener Befund */
  jeEingabe?: boolean
  /** Nur auf Servern melden */
  nurServer?: boolean
}

const SCM_IDS = [7000, 7001, 7009, 7011, 7022, 7023, 7024, 7031, 7034, 7038, 7041, 7043]
/** Ort des Ereignisses: Zusatz „@…“ (Gerät aus dem Ereignis-Skript) vor dem Text. */
const ortText = (g: FehlerGruppe) => (g.app.startsWith('@') ? g.app.slice(1) + ' ' : '') + g.text
/** LiveKernel-Code (P1) der Gruppe: „@LiveKernel 141“ bzw. aus dem Text. */
export const lkCode = (g: FehlerGruppe) => (/^@LiveKernel\s+([0-9a-f]+)/i.exec(g.app)?.[1] || /P1:\s*([0-9a-f]+)/i.exec(g.text)?.[1] || '').toLowerCase()
const WER = /^Windows Error Reporting$/i
/** Dienste, deren Ausfall immer zählt (sonst erst ab mehreren Ereignissen). */
const WICHTIGE_DIENSTE = /Druckwarteschlange|Print Spooler|Windows-Audio|Windows Audio|Windows Update|wuauserv|Intelligenter Hintergrund|Background Intelligent|BITS|DNS-Client|DNS Client|Arbeitsstationsdienst|Workstation|Netlogon|Windows-Zeitgeber|Windows Time|W32Time|Kryptografie|Cryptographic|Windows-Verwaltungsinstrumentation|Windows Management Instrumentation|Benutzerprofildienst|User Profile Service|Gruppenrichtlinienclient|Group Policy Client|Windows-Firewall|Windows Defender Firewall|Microsoft Defender|Basisfiltermodul|Base Filtering Engine|Windows-Ereignisprotokoll|Windows Event Log|Aufgabenplanung|Task Scheduler|Windows Installer|IntuneManagementExtension|Microsoft Intune|Zscaler|ZSA|Remotedesktopdienste|Remote Desktop Services|SQL Server|World Wide Web|WWW|IIS|DFS|DNS-Server|DHCP-Server|Active Directory|VSS|Volumeschattenkopie|Volume Shadow Copy/i

/** Dienstname aus dem Text des Dienststeuerungs-Managers („Der Dienst "X" …“, „The X service …“). */
export function dienstAusText(t: string): string {
  const m = /Dienst\s+"([^"]+)"|Dienst\s+„([^“”]+)[“”]|Dienst\s+'([^']+)'|The\s+(.+?)\s+service\b|service\s+"([^"]+)"|Dienst\s+(.+?)\s+(?:wurde|ist|hat|konnte|reagiert)/i.exec(t || '')
  return ((m && (m[1] || m[2] || m[3] || m[4] || m[5] || m[6])) || '').trim()
}
/** Programm aus .NET-Runtime-Meldungen („Anwendung: x.exe“ / „Application: x.exe“). */
const dotnetApp = (g: FehlerGruppe) => (/(?:Anwendung|Application):\s*([^\s]+\.exe)/i.exec(g.text)?.[1] || '').toLowerCase()

export const LEXIKON: VdEreignisRegel[] = [
  // ── Datenträger / Dateisystem ──
  { id: 'lx-dateisystem', typ: 'evt:lx-dateisystem', wenn: { quelle: /^(Ntfs|Microsoft-Windows-Ntfs)$/i, ids: [55, 98, 130, 137, 140] },
    titel: 'Dateisystem meldet Fehler (NTFS)', schwere: 'mittel', schwererAb: 5, bedeutung: 'NTFS meldet Beschädigungen bzw. Reparaturen.', suche: 'chkdsk bei jedem start festplatte fehler',
    eingabe: (g, k) => lwAusText(ortText(g), k), jeEingabe: true },
  { id: 'lx-chkdsk', typ: 'evt:lx-dateisystem', wenn: { quelle: /^(Wininit|Chkdsk)$/i, ids: [1001, 26212, 26213, 26214, 26226], text: /beschädigt|repariert|korrigiert|corrupt|fixed|repaired|bad sectors|fehlerhafte Sektoren|Probleme gefunden|found problems/i },
    titel: 'Datenträgerprüfung hat Fehler gefunden', schwere: 'mittel', bedeutung: 'Beim Start hat chkdsk Fehler gefunden bzw. repariert.', suche: 'chkdsk bei jedem start festplatte fehler',
    eingabe: (g, k) => lwAusText(ortText(g), k), jeEingabe: true },
  { id: 'lx-schattenkopien', typ: 'evt:lx-schattenkopien', wenn: { quelle: /^volsnap$/i, ids: [25, 33, 35, 36] },
    titel: 'Schattenkopien mangels Platz gelöscht', schwere: 'niedrig', bedeutung: 'Vorgängerversionen/Wiederherstellungspunkte wurden gelöscht.', suche: 'laufwerk c voll' },
  { id: 'lx-vss', typ: 'evt:lx-vss', wenn: { quelle: /^VSS$/i, ids: [8193, 8194, 12289, 12292, 12293, 13] }, ab: 2,
    titel: 'Schattenkopien (VSS) schlagen fehl', schwere: 'niedrig', bedeutung: 'Der Volumeschattenkopie-Dienst meldet Fehler.', suche: 'wiederherstellungspunkt fehler vss' },

  // ── Hardware / Treiber ──
  { id: 'lx-drosselung', typ: 'evt:lx-drosselung', wenn: { quelle: /Kernel-Processor-Power/i, ids: [37] }, ab: 3,
    titel: 'Prozessor wird gedrosselt', schwere: 'mittel', bedeutung: 'Die Firmware begrenzt die Prozessorleistung (Hitze/Energie).', suche: 'lüfter laut pc heiß langsam' },
  { id: 'lx-treiber-laden', typ: 'evt:lx-treiber-laden', wenn: { quelle: /Kernel-PnP/i, ids: [219, 411, 441], nichtText: /WUDFRd|\\Driver\\WudfRd|SWD\\|ROOT\\/i }, ab: 3,
    titel: 'Treiber eines Geräts lässt sich nicht laden', schwere: 'niedrig', bedeutung: 'Windows konnte einen Gerätetreiber nicht laden.', suche: 'gerät wird nicht erkannt treiber fehler',
    eingabe: g => (/für das Gerät\s+(\S+)|for the device\s+(\S+)/i.exec(g.text)?.slice(1).find(Boolean) || '') },
  { id: 'lx-ramtest', typ: 'v1-speicher', wenn: { quelle: /MemoryDiagnostics-Results/i },
    titel: 'Windows-Speicherdiagnose meldet Fehler', schwere: 'hoch', bedeutung: 'Der Speichertest hat Fehler im Arbeitsspeicher gefunden.', suche: 'hardwarefehler pc stürzt ab arbeitsspeicher testen' },
  // LiveKernelEvent: Windows setzt einen hängenden Treiber ohne Bluescreen zurück. Das Ereignis-Skript
  // zählt je Code einen Vorfall pro 2 Minuten („@LiveKernel <P1>“). Codes laut Bugcheck-Referenz.
  { id: 'lx-livekernel-taste', typ: 'v1-ausschalter', wenn: { quelle: WER, ids: [1001], app: /^@LiveKernel 1c8$/i },
    titel: 'Ein/Aus-Taste wurde gedrückt gehalten (PC hing)', schwere: 'niedrig', schwererAb: 3,
    bedeutung: 'Jemand hat den PC über die gedrückt gehaltene Ein/Aus-Taste hart ausgeschaltet (MANUALLY_INITIATED_POWER_BUTTON_HOLD) – meist, weil er hing.', suche: 'pc friert ein' },
  { id: 'lx-livekernel', typ: 'evt:lx-livekernel', wenn: { quelle: WER, ids: [1001], app: /^@LiveKernel (117|141|193|1a8|1b0|1b8)$/i },
    titel: 'Grafiktreiber musste im Betrieb zurückgesetzt werden', schwere: 'mittel', schwererAb: 6,
    bedeutung: 'Die Grafik hing (z. B. 0x141 VIDEO_ENGINE_TIMEOUT_DETECTED, 0x117 TDR) und wurde ohne Bluescreen zurückgesetzt – Bild friert kurz ein bzw. wird schwarz.', suche: 'bildschirm wird kurz schwarz anzeigetreiber wurde wiederhergestellt' },
  { id: 'lx-livekernel-usb', typ: 'evt:lx-livekernel-usb', wenn: { quelle: WER, ids: [1001], app: /^@LiveKernel (144|1a5)$/i }, ab: 2,
    titel: 'USB-Treiber musste im Betrieb zurückgesetzt werden', schwere: 'niedrig', schwererAb: 6,
    bedeutung: 'Der USB-Controller bzw. ein USB-Gerät hing (0x144 USB3-Treiber, 0x1A5 USB beim Abziehen) – oft Dock oder Hub.', suche: 'usb geräte gehen kurz weg dock' },
  { id: 'lx-livekernel-wlan', typ: 'evt:wlan-adapter', wenn: { quelle: WER, ids: [1001], app: /^@LiveKernel (1dd|1de)$/i },
    titel: 'WLAN- bzw. Mobilfunkadapter musste zurückgesetzt werden', schwere: 'mittel', schwererAb: 4,
    bedeutung: 'Der Treiber des WLAN- (0x1DE) bzw. Mobilfunkadapters (0x1DD) hing und wurde zurückgesetzt – die Verbindung bricht dabei ab.', suche: 'wlan bricht ab' },
  { id: 'lx-livekernel-sonst', typ: 'evt:lx-livekernel-sonst', wenn: { quelle: WER, ids: [1001], text: /LiveKernelEvent/i }, ab: 2,
    titel: g => `Ein Treiber musste im Betrieb zurückgesetzt werden (Code 0x${lkCode(g).toUpperCase() || '?'})`, schwere: 'niedrig',
    bedeutung: 'Windows hat einen hängenden Treiber ohne Bluescreen zurückgesetzt (z. B. Standby, Bluetooth, Speicher-Controller).', suche: 'pc hängt kurz',
    eingabe: g => lkCode(g), jeEingabe: true },

  // ── Dienste allgemein (die Proaktive Fehlersuche kennt nur Druck/Audio/Zscaler/Intune) ──
  { id: 'lx-dienst', typ: 'evt:lx-dienst', wenn: { quelle: /^Service Control Manager$/, ids: SCM_IDS, text: WICHTIGE_DIENSTE },
    titel: g => `Dienst „${dienstAusText(g.text) || 'unbekannt'}“ stürzt ab oder startet nicht`, schwere: 'mittel', schwererAb: 5,
    bedeutung: 'Ein wichtiger Dienst ist abgestürzt bzw. startet nicht.', suche: g => `dienst ${dienstAusText(g.text)} startet nicht`.trim(),
    eingabe: g => dienstAusText(g.text), jeEingabe: true },
  { id: 'lx-dienst-sonst', typ: 'evt:lx-dienst', wenn: { quelle: /^Service Control Manager$/, ids: [7031, 7034, 7023, 7024] }, ab: 4,
    titel: g => `Dienst „${dienstAusText(g.text) || 'unbekannt'}“ stürzt wiederholt ab`, schwere: 'niedrig', schwererAb: 12,
    bedeutung: 'Ein Dienst ist mehrfach abgestürzt.', suche: g => `dienst ${dienstAusText(g.text)} abgestürzt`.trim(),
    eingabe: g => dienstAusText(g.text), jeEingabe: true },

  // ── Domäne, Zeit, Anmeldung ──
  { id: 'lx-kein-dc', typ: 'evt:lx-kein-dc', wenn: { quelle: /^NETLOGON$/i, ids: [5719, 5783] }, ab: 5,
    titel: 'Domänencontroller zeitweise nicht erreichbar', schwere: 'niedrig', schwererAb: 30, bedeutung: 'Kein Domänencontroller gefunden.', suche: 'domäne nicht erreichbar anmeldeserver nicht verfügbar' },
  { id: 'lx-kein-dc-lsa', typ: 'evt:lx-kein-dc', wenn: { quelle: /^LsaSrv$/i, ids: [40960, 40961] }, ab: 10,
    titel: 'Anmeldung an der Domäne scheitert (kein DC)', schwere: 'niedrig', bedeutung: 'Die Anmeldung über Kerberos/NTLM erreicht keinen DC.', suche: 'domäne nicht erreichbar anmeldeserver nicht verfügbar' },
  { id: 'lx-zeit', typ: 'evt:lx-zeit', wenn: { quelle: /Time-Service|^W32Time$/i, ids: [24, 29, 36, 47, 50, 129, 134] }, ab: 3,
    titel: 'Zeitsynchronisierung schlägt fehl', schwere: 'mittel', bedeutung: 'Der Zeitdienst erreicht seine Zeitquelle nicht.', suche: 'uhrzeit falsch zeit synchronisieren' },
  { id: 'lx-kerberos', typ: 'evt:lx-kerberos', wenn: { quelle: /Security-Kerberos|^Kerberos$/i, ids: [3, 4, 7, 14] }, ab: 3,
    titel: 'Kerberos-Anmeldefehler', schwere: 'mittel', bedeutung: 'Kerberos-Tickets werden abgelehnt.', suche: 'kerberos fehler anmeldung' },
  { id: 'lx-gpo', typ: 'evt:lx-gpo', wenn: { quelle: /GroupPolicy/i, ids: [1085, 1096, 1125, 7006, 7016, 7320] }, ab: 3,
    titel: 'Gruppenrichtlinien-Erweiterung meldet Fehler', schwere: 'niedrig', bedeutung: 'Teile der Richtlinien wurden nicht angewendet.', suche: 'gruppenrichtlinien werden nicht angewendet gpupdate' },
  { id: 'lx-winlogon', typ: 'evt:lx-winlogon', wenn: { quelle: /^Winlogon$/i, ids: [4005] },
    titel: 'Anmeldeprozess unerwartet beendet', schwere: 'mittel', bedeutung: 'Winlogon wurde unerwartet beendet.', suche: 'anmeldung dauert lange willkommen' },

  // ── Netzwerk ──
  { id: 'lx-ip-konflikt', typ: 'evt:lx-ip-konflikt', wenn: { quelle: /^Tcpip$/i, ids: [4199] },
    titel: 'IP-Adresskonflikt', schwere: 'hoch', bedeutung: 'Ein anderes Gerät nutzt dieselbe IP-Adresse.', suche: 'ip adresskonflikt' },
  { id: 'lx-dns', typ: 'evt:lx-dns', wenn: { quelle: /DNS[- ]Client/i, ids: [1014] }, ab: 20,
    titel: 'DNS-Zeitüberschreitungen', schwere: 'niedrig', bedeutung: 'DNS-Server antworten nicht rechtzeitig.', suche: 'internet langsam seiten laden nicht dns' },
  { id: 'lx-dns-registrierung', typ: 'evt:lx-dns-registrierung', wenn: { quelle: /DNS[- ]Client/i, ids: [8015, 8016, 8018, 8019, 8020] }, ab: 2,
    titel: 'DNS-Registrierung schlägt fehl', schwere: 'niedrig', bedeutung: 'Der PC kann sich nicht im DNS anmelden.', suche: 'dns registrierung' },
  { id: 'lx-dhcp', typ: 'evt:lx-dhcp', wenn: { quelle: /Dhcp-Client/i, ids: [1001, 1002, 1003] }, ab: 3,
    titel: 'Keine IP-Adresse vom DHCP', schwere: 'mittel', bedeutung: 'Der PC bekam keine IP-Adresse bzw. verlor sie.', suche: 'keine ip adresse 169.254' },
  { id: 'lx-lan', typ: 'evt:lx-lan', wenn: { quelle: /^(e1[a-z]express|e1[a-z]\d+x64|e2fexpress|e1cexpress)$/i, ids: [27, 32] }, ab: 5,
    titel: 'LAN-Verbindung bricht ab', schwere: 'niedrig', bedeutung: 'Der Netzwerkadapter meldet Verbindungsabbrüche.', suche: 'lan verbindung bricht ab' },

  // ── Datenbanken von Windows (Suche, Update) ──
  { id: 'lx-suchindex', typ: 'evt:lx-suchindex', wenn: { quelle: /^ESENT$/i, ids: [413, 455, 474, 476, 489, 490], text: /SearchIndexer|Windows\.edb|Windows Search|Suche/i },
    titel: 'Suchindex-Datenbank beschädigt', schwere: 'niedrig', bedeutung: 'Die Datenbank der Windows-Suche meldet Fehler.', suche: 'windows suche findet nichts' },
  { id: 'lx-wu-datenbank', typ: 'evt:lx-wu-datenbank', wenn: { quelle: /^ESENT$/i, ids: [413, 455, 474, 476, 489, 490], text: /DataStore|SoftwareDistribution|wuaueng/i },
    titel: 'Update-Datenbank beschädigt', schwere: 'mittel', bedeutung: 'Die Datenbank von Windows Update meldet Fehler.', suche: 'windows update hängt' },

  // ── Programme ──
  { id: 'lx-dotnet', typ: 'evt:lx-dotnet', wenn: { quelle: /^\.NET Runtime$/i, ids: [1025, 1026] }, ab: 2, jeProgramm: true,
    titel: g => `${dotnetApp(g) || '.NET-Programm'} stürzt mit .NET-Fehler ab`, schwere: 'niedrig', schwererAb: 8,
    bedeutung: 'Ein .NET-Programm wurde mit einer unbehandelten Ausnahme beendet.', suche: g => `${dotnetApp(g).replace(/\.exe$/, '')} stürzt ab`.trim() },

  // ── Sicherheit ──
  { id: 'lx-defender-signatur', typ: 'evt:lx-defender-signatur', wenn: { quelle: /Windows Defender/i, ids: [2001, 2003, 2004, 2006] }, ab: 2,
    titel: 'Virensignaturen lassen sich nicht aktualisieren', schwere: 'mittel', bedeutung: 'Defender konnte seine Signaturen nicht aktualisieren.', suche: 'defender signaturen veraltet' },
  { id: 'lx-bedrohung', typ: 'evt:lx-bedrohung', wenn: { quelle: /Windows Defender/i, ids: [1116, 1117] },
    titel: 'Virenschutz hat eine Bedrohung erkannt', schwere: 'mittel', bedeutung: 'Defender hat Schadsoftware erkannt bzw. blockiert.', suche: 'virus gefunden defender' },
  { id: 'lx-secureboot', typ: 'evt:lx-secureboot', wenn: { quelle: /TPM-WMI/i, ids: [1801] },
    titel: 'Secure-Boot-Zertifikate müssen aktualisiert werden', schwere: 'niedrig', bedeutung: 'Secure-Boot-Zertifikate/-Schlüssel stehen zur Aktualisierung an.', suche: 'bios update secure boot' },

  // ── Server ──
  { id: 'lx-sql-io', typ: 'evt:lx-sql-io', wenn: { quelle: /^MSSQL(SERVER|\$.+)$/i, ids: [823, 824, 825, 833] }, nurServer: true,
    titel: 'SQL Server: E/A- bzw. Datenbankfehler', schwere: 'hoch', bedeutung: 'Lese-/Schreibfehler in Datenbankdateien.', suche: 'sql server fehler' },
  { id: 'lx-sql-voll', typ: 'evt:lx-sql-voll', wenn: { quelle: /^MSSQL(SERVER|\$.+)$/i, ids: [1101, 1105, 9002] }, nurServer: true,
    titel: 'SQL Server: Datenbank oder Protokoll voll', schwere: 'hoch', bedeutung: 'Kein Platz mehr in Datenbank bzw. Protokoll.', suche: 'sql server fehler' },
  { id: 'lx-iis', typ: 'evt:lx-iis', wenn: { quelle: /^(WAS|Microsoft-Windows-WAS)$/i, ids: [5002, 5009, 5010, 5011, 5013] }, nurServer: true,
    titel: 'IIS: Anwendungspool fällt aus', schwere: 'mittel', bedeutung: 'Ein IIS-Anwendungspool wurde deaktiviert bzw. sein Prozess beendet.', suche: 'iis anwendungspool' },
  { id: 'lx-dfsr', typ: 'evt:lx-dfsr', wenn: { quelle: /^DFSR$/i, ids: [2213, 4012, 5002, 5008, 5014] }, nurServer: true,
    titel: 'DFS-Replikation gestört', schwere: 'mittel', bedeutung: 'Die DFS-Replikation meldet Fehler.', suche: 'dfs replikation' },
  { id: 'lx-sicherung', typ: 'evt:lx-sicherung', wenn: { quelle: /Microsoft-Windows-Backup/i, ids: [5, 8, 9, 19, 20, 49, 517, 521, 546, 561] }, nurServer: true,
    titel: 'Windows-Sicherung schlägt fehl', schwere: 'hoch', bedeutung: 'Die Windows Server-Sicherung meldet Fehler.', suche: 'sicherung fehlgeschlagen' },
  { id: 'lx-dns-server', typ: 'evt:lx-dns-server', wenn: { quelle: /^(DNS|Microsoft-Windows-DNS-Server-Service)$/i, ids: [4000, 4004, 4013, 4015] }, nurServer: true,
    titel: 'DNS-Server-Dienst meldet Fehler', schwere: 'mittel', bedeutung: 'Der DNS-Server lädt Zonen nicht bzw. wartet auf das AD.', suche: 'dns server' },
  { id: 'lx-ad-replikation', typ: 'evt:lx-ad-replikation', wenn: { quelle: /NTDS Replication|ActiveDirectory_DomainService/i, ids: [1311, 1865, 1925, 1988, 2042, 2087, 2088, 2108] }, nurServer: true,
    titel: 'Active-Directory-Replikation gestört', schwere: 'hoch', bedeutung: 'Domänencontroller replizieren nicht sauber.', suche: 'active directory replikation' },
]

/** Auswertungsreihenfolge: spezifische Regeln der Proaktiven Fehlersuche zuerst, dann das Lexikon. */
export const ALLE_REGELN: VdEreignisRegel[] = [...PF_REGELN, ...LEXIKON]
/** Rauschen: Gruppen ohne Regel, die bei gesunden Geräten immer auftreten. */
export const RAUSCHEN = PF_RAUSCHEN
/** Ereignisregeln, deren Thema eine eigene Prüfung schon abdeckt (kein doppelter Befund). */
export const ABGEDECKT = new Set(['update-fehler'])
