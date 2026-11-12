// ── Problem-Katalog: Lücken aus der Ticket-Auswertung (Field-Service/Infrastruktur, Okt 2025 – Nov 2026) ──
// 954 echte Tickets gegen „Gib dein Problem ein“ geprüft (.tmp-test/tickets_probe.ts). Diese Themen kamen
// mehrfach vor, fehlten aber im Katalog: SAP Kinit (25×), Coscom (≈20×), EuroPar (≈15×), Gravur-Software,
// Netzwerkdose patchen, Remotedesktop-Zugang, Fernzugriff beantragen, PC neu aufsetzen.
// Neue Bausteine: ../bausteine/tickets5.ts.
import type { PaBereich, PaProblem } from '../types'

const SAP: PaBereich = 'SAP'
const PROG: PaBereich = 'Weitere Programme'
const NETZ: PaBereich = 'Netzwerk & Internet'
const VPN: PaBereich = 'VPN & Zscaler'
const UPD: PaBereich = 'Updates & Software'
const LW: PaBereich = 'Netzlaufwerke & Dateien'
const KONTO: PaBereich = 'Anmeldung & Konto'

export const PROBLEME_TICKETS5: PaProblem[] = [
  // ══ SAP · Kinit ═════════════════════════════════════════════════════════════
  {
    id: 'sap-kinit-ticket',
    titel: 'SAP-Anmeldung geht nicht – Kerberos-Ticket mit Kinit neu holen („SAP Kinit“)',
    bereich: SAP,
    stichworte: ['sap kinit', 'kinit', 'sap kinit ausfuehren', 'kerberos ticket sap', 'mit kerberos', 'sap anmeldung kinit', 'sap sso kinit', 'ticket manager', 'sap ticket abgelaufen', 'sap kein ticket', 'sap single sign on kinit', 'kinit sap logon'],
    beschreibungen: [
      'SAP lässt mich nicht mehr automatisch rein, ich muss wohl Kinit machen.',
      'SAP Kinit bitte, die Anmeldung an SAP klappt seit heute Morgen nicht.',
      'Beim Öffnen der SAP-Verbindung kommt eine Kerberos- bzw. SNC-Fehlermeldung, gestern ging es noch.',
      'Nach dem Kennwortwechsel geht SAP nicht mehr, das Kerberos-Ticket muss neu.',
      'Ticket: SAP Kinit für den Benutzer durchgeführt.',
      'SAP single sign-on stopped working, kinit needed.',
    ],
    ursache: 'Für die SAP-Anmeldung braucht der PC ein gültiges Kerberos-Ticket. Ist es abgelaufen (z. B. nach Kennwortwechsel, langer Pause oder Wechsel ins Homeoffice) oder wurde Kinit nie ausgeführt, lehnt SAP die automatische Anmeldung ab.',
    loesung: 'Die Prüfung zeigt, ob MIT Kerberos (Kinit) installiert ist und welche Tickets vorhanden sind. Danach öffnet das Tool beim Benutzer das Kinit-Fenster bzw. den Kerberos Ticket Manager; der Benutzer gibt dort sein Kennwort ein. Anschließend SAP Logon neu starten.',
    schritte: [
      { aktion: 'sap-kinit-pruefen' },
      { aktion: 'sap-kinit-starten' },
      { aktion: 'kerberos-erneuern', optional: true, titel: 'Windows-Kerberos-Tickets zusätzlich erneuern' },
    ],
    hinweis: 'Ist MIT Kerberos nicht installiert, läuft SAP-SSO über die Windows-Anmeldung — dann hilft „Kerberos-Tickets erneuern“ bzw. die SAP-Fehlersuche. Gesperrte SAP-Benutzer entsperrt nur der Key-User/die SAP-Basis.',
    nachricht: 'Bitte geben Sie im geöffneten Kerberos-Fenster Ihr Windows-Kennwort ein und starten Sie danach SAP Logon neu.',
  },

  // ══ Coscom ══════════════════════════════════════════════════════════════════
  {
    id: 'programm-coscom-startet-nicht',
    titel: 'Coscom startet nicht oder meldet „keine Lizenz“ (WibuKey/CodeMeter-Dongle)',
    bereich: PROG,
    stichworte: ['coscom', 'coscom startet nicht', 'coscom fehler', 'coscom problem', 'coscom haengt', 'coscom lizenz', 'wibukey', 'wibu', 'codemeter', 'dongle coscom', 'coscom kritisch', 'coscom geht nicht', 'coscom neu starten', 'factorydirector', 'tooldirector'],
    beschreibungen: [
      'Coscom startet nicht mehr, es passiert einfach nichts.',
      'Coscom macht Probleme, die Lizenz wird nicht gefunden.',
      'Coscom hängt beim Start, wir können in der Fertigung nicht arbeiten – kritisch.',
      'Seit dem Neustart findet Coscom den Dongle nicht mehr.',
      'Ticket: Coscom startet nicht, alle Prozesse beendet und neu gestartet.',
      'Coscom Fehler, WibuKey neu installiert.',
    ],
    ursache: 'Meist hängt ein alter Coscom-Prozess im Hintergrund oder der Lizenzdienst (WibuKey bzw. CodeMeter) läuft nicht bzw. erkennt den USB-Dongle nicht. Seltener sind Programmdateien oder die WibuKey-Installation beschädigt.',
    loesung: 'Die Prüfung zeigt Installation, Lizenzdienste, ob der Dongle am USB erkannt wird, laufende Prozesse und die letzten Fehler. Danach werden die hängenden Coscom-Prozesse beendet und die Lizenzdienste neu gestartet — Coscom anschließend neu öffnen.',
    schritte: [
      { aktion: 'coscom-pruefen' },
      { aktion: 'coscom-neustart' },
      { aktion: 'usb-energiesparen-aus', optional: true, titel: 'USB-Energiesparen aus (Dongle schläft ein)' },
    ],
    hinweis: 'Hilft das nicht: Dongle ab- und wieder anstecken (anderer USB-Port, nicht am Hub). Ist WibuKey beschädigt, wird es über die Softwareverteilung neu installiert; Coscom-Neuinstallation ebenfalls über die Softwareverteilung bzw. den Coscom-Key-User. Das Tool löscht keine Registry-Bereiche der Lizenzsoftware.',
    nachricht: 'Coscom wurde neu gestartet. Bitte öffnen Sie das Programm erneut — bei weiteren Problemen melden Sie sich direkt bei uns.',
  },
  {
    id: 'programm-coscom-einrichten',
    titel: 'Coscom auf einem PC einrichten bzw. Coscom-Zugang für einen Mitarbeiter',
    bereich: PROG,
    stichworte: ['coscom einrichten', 'coscom einrichtung', 'coscom eingerichtet', 'coscom installieren', 'coscom neuinstallation', 'coscom account', 'coscom konto', 'coscom benutzer anlegen', 'coscom verbunden', 'coscom neu eingestellt'],
    beschreibungen: [
      'Der neue Kollege in der Fertigung braucht Coscom auf seinem PC.',
      'Coscom muss auf dem Tauschrechner eingerichtet werden.',
      'Coscom-Account für den Mitarbeiter anlegen.',
      'Ticket: Coscom Neuinstallation und Einrichtung.',
      'Coscom ist auf dem neuen PC noch nicht verbunden.',
    ],
    ursache: 'Coscom wird über die Softwareverteilung installiert; der Zugang (Benutzer in Coscom) und die Lizenz (Dongle bzw. Lizenzserver) werden getrennt eingerichtet.',
    loesung: 'Die Prüfung zeigt, ob Coscom und die Lizenzsoftware schon installiert sind und der Dongle erkannt wird. Fehlt Coscom, über die Software-Kachel bzw. das Unternehmensportal (Intune) installieren; das Coscom-Konto legt der Coscom-Key-User an.',
    schritte: [
      { aktion: 'coscom-pruefen' },
      { aktion: 'software-suchen', param: 'Coscom' },
      { aktion: 'werkzeug:software' },
    ],
    hinweis: 'Konten in Coscom legt der Coscom-Key-User an — das Tool ändert keine Coscom-Benutzer.',
  },

  // ══ EuroPar ═════════════════════════════════════════════════════════════════
  {
    id: 'programm-europar-einrichten',
    titel: 'EuroPar auf einem (neuen) PC einrichten – Ordner, Laufwerk Q: und Umgebungsvariablen',
    bereich: PROG,
    stichworte: ['europar', 'europar einrichten', 'europar eingerichtet', 'europar einrichtung', 'europar neuer pc', 'europar tauschrechner', 'euro par', 'europar umgebungsvariablen', 'euro_eurn', 'euro_wrkn', 'eurnc', 'cmdnc0', 'schnittdaten', 'c:\\local', 'europar profil'],
    beschreibungen: [
      'EuroPar muss auf dem neuen Rechner eingerichtet werden.',
      'Nach dem PC-Tausch läuft EuroPar nicht, die Umgebungsvariablen fehlen.',
      'EuroPar findet seine Daten nicht – Q: ist nicht da.',
      'Ticket: EuroPar eingerichtet (kritisch).',
      'Für den neuen Mitarbeiter EuroPar einrichten.',
      'EuroPar-Umgebungsvariablen setzen.',
    ],
    ursache: 'EuroPar braucht die Ordner C:\\EuroPAR, C:\\Local und C:\\SCHNITTDATEN vom alten PC, das Laufwerk Q: und die Umgebungsvariablen EURO_EURN=Q:, EURO_WRKN=C:\\local sowie Q:\\Eurnc\\cmdnc0 im PATH. Beim PC-Tausch fehlt meist eins davon.',
    loesung: 'Die Prüfung zeigt, was fehlt (Ordner, .ini-Dateien, Q:, Variablen). Die Umgebungsvariablen setzt das Tool direkt (vorhandener PATH bleibt erhalten); danach ab- und anmelden. Die Ordner überträgt die EuroPAR-Kachel der Geräte-Einrichtung vom Altgerät.',
    schritte: [
      { aktion: 'europar-pruefen' },
      { aktion: 'europar-umgebung' },
      { aktion: 'lw-anzeigen', optional: true, titel: 'Verbundene Laufwerke anzeigen (Q:?)' },
    ],
    hinweis: 'Ordner C:\\EuroPAR, C:\\Local und C:\\SCHNITTDATEN kommen beim PC-Tausch über die Geräte-Einrichtung (EuroPAR-Kachel) vom Altgerät — nie leer neu anlegen.',
    nachricht: 'EuroPar wurde eingerichtet. Bitte melden Sie sich einmal ab und wieder an, dann EuroPar starten.',
  },
  {
    id: 'programm-europar-fehler',
    titel: 'EuroPar startet nicht oder meldet Fehler (Datenübertragung gestört, .ini-Datei, Editor)',
    bereich: PROG,
    stichworte: ['europar fehler', 'europar startet nicht', 'europar geht nicht', 'europar datenuebertragung', 'europar ini', 'ini datei europar', 'europar editor', 'europar kritisch', 'europar problem', 'europar profil neu'],
    beschreibungen: [
      'EuroPar startet nicht, kritisch für die Fertigung.',
      'EuroPar Datenübertragung gestört.',
      'EuroPar meldet einen Fehler beim Öffnen des Editors.',
      'Ticket: EuroPar Fehler, in der .ini-Datei unter C:\\lokal fehlte eine 0.',
      'Seit dem neuen Profil geht EuroPar nicht mehr.',
    ],
    ursache: 'Häufig ist eine .ini-Datei in C:\\Local beschädigt, leer oder enthält einen falschen Wert; außerdem fehlende Umgebungsvariablen, ein fehlendes Laufwerk Q: oder ein neues Windows-Profil ohne EuroPar-Einstellungen.',
    loesung: 'Die Prüfung listet die .ini-Dateien (leere Dateien sind markiert), Ordner, Q: und Variablen. Fehlende Variablen setzt das Tool; eine fehlerhafte .ini-Datei mit der Sicherung bzw. dem Kollegen-PC vergleichen und korrigieren.',
    schritte: [
      { aktion: 'europar-pruefen' },
      { aktion: 'europar-umgebung', optional: true },
      { aktion: 'zg-lw-vorgaengerversionen', param: 'C:\\Local', optional: true, titel: 'Ältere Versionen von C:\\Local anzeigen' },
    ],
    hinweis: '.ini-Dateien ändert das Tool nicht automatisch — Werte mit einem funktionierenden PC vergleichen und von Hand korrigieren.',
  },

  // ══ Gravur ══════════════════════════════════════════════════════════════════
  {
    id: 'programm-gravur-ngrav-zugriff',
    titel: 'Gravur-Software (NGrav/SignPro) läuft nur beim Admin – andere Benutzer „Zugriff verweigert“',
    bereich: PROG,
    stichworte: ['ngrav', 'signpro', 'gravur', 'gravurmaschine', 'gravur software', 'ngrav zugriff verweigert', 'signpro fehler', 'oeffentliche dokumente', 'gravier'],
    beschreibungen: [
      'NGrav für die Gravurmaschine läuft bei meinem Kollegen nicht.',
      'Die Gravursoftware meldet Zugriff verweigert, beim Admin geht es.',
      'SignPro startet bei anderen Benutzern mit Fehler.',
      'Ticket: Ngrav für Gravurmaschine gefixt – Rechte auf Öffentliche Dokumente gesetzt.',
      'Gravurmaschine: Software kann ihre Dateien nicht speichern.',
    ],
    ursache: 'Die Gravur-Software legt ihre Daten unter „Öffentliche Dokumente“ ab; nach der Installation durch den Admin dürfen andere Benutzer dort nicht schreiben.',
    loesung: 'Das Tool gibt der Gruppe „Benutzer“ Ändern-Rechte auf die NGrav-/SignPro-Ordner unter C:\\Users\\Public\\Documents. Danach die Software beim betroffenen Benutzer neu starten.',
    schritte: [{ aktion: 'ngrav-schreibrechte' }],
  },

  // ══ Netzwerkdose ════════════════════════════════════════════════════════════
  {
    id: 'netz-dose-patchen',
    titel: 'Netzwerkdose ohne Verbindung – Dose muss gepatcht bzw. der Switchport freigeschaltet werden',
    bereich: NETZ,
    stichworte: ['dose patchen', 'lan patchen', 'lan gepatcht', 'gepatched', 'patchen', 'netzwerkdose', 'lan dose', 'dose tot', 'lan verbindung herstellen', 'lan anschluss', 'switchport', 'switch port', 'port freischalten', 'maschine patchen', 'kabel steckt kein netz', 'patchfeld'],
    beschreibungen: [
      'An der Netzwerkdose am neuen Arbeitsplatz kommt kein Netz.',
      'LAN-Verbindung herstellen, die Dose ist wohl nicht gepatcht.',
      'Die Maschine braucht einen Netzanschluss, Dose muss gepatcht werden.',
      'Ticket: LAN gepatcht inkl. Zscaler.',
      'Kabel steckt, aber das Lämpchen an der Dose bleibt aus.',
      'Netzwerkdose für den Drucker freischalten.',
    ],
    ursache: 'Die Dose ist im Verteiler nicht auf einen Switch gepatcht oder der Switchport ist deaktiviert bzw. im falschen Netz (VLAN). Am PC selbst ist dann alles in Ordnung — es gibt keine Verbindung („Kabel nicht angeschlossen“) oder nur eine 169.254-Adresse.',
    loesung: 'Die Prüfung zeigt, ob der PC überhaupt eine Verbindung (Link) an der Dose hat und welche Adresse er bekommt. Ohne Link: Dose im Verteiler patchen; Link, aber falsches Netz: Switchport bzw. VLAN über ServiceNow beantragen.',
    schritte: [
      { aktion: 'net-status' },
      { aktion: 'netz4-ip-details' },
    ],
    hinweis: 'Patchen im Verteiler bzw. Freischalten des Switchports geschieht vor Ort bzw. über das Netzwerkteam — das Tool ändert nichts am Netzwerk.',
    servicenow: { name: 'Switch port activation/deactivation', wozu: 'Switchport freischalten lassen' },
  },

  // ══ Remotedesktop / Fernzugriff ═════════════════════════════════════════════
  {
    id: 'netz-rdp-zugang-einrichten',
    titel: 'Remotedesktop-Zugang auf einen PC einrichten (RDP freischalten, Benutzer berechtigen)',
    bereich: NETZ,
    stichworte: ['rdp', 'rdp einrichten', 'rdp zugang', 'rdp verbindung einrichten', 'remotedesktop einrichten', 'remote desktop', 'remote zugang einrichten', 'remotedesktopbenutzer', 'mstsc', 'rdp eingerichtet', 'remote rechner verbindung', 'remote dienste aktivieren'],
    beschreibungen: [
      'Ich möchte mich per Remotedesktop auf meinen Büro-PC verbinden, das geht nicht.',
      'RDP-Zugang für den Kollegen auf den Rechner im Serverraum einrichten.',
      'Remote Desktop ist auf dem PC ausgeschaltet.',
      'Ticket: RDP Verbindung eingerichtet.',
      'Mein Benutzer darf sich nicht per Remotedesktop anmelden.',
    ],
    ursache: 'Remotedesktop ist auf dem Ziel-PC ausgeschaltet, eine Gruppenrichtlinie verbietet es, die Firewall-Regeln sind zu oder der Benutzer steht nicht in „Remotedesktopbenutzer“.',
    loesung: 'Die Prüfung zeigt alle vier Punkte. Freischalten (Remotedesktop einschalten, Benutzer in „Remotedesktopbenutzer“ aufnehmen) geht mit Bestätigung in Remote Doc. Aus dem Homeoffice zusätzlich Fernzugriff (ZPA) beantragen.',
    schritte: [
      { aktion: 'rdp-zugang-pruefen' },
      { aktion: 'werkzeug:remote-doc' },
    ],
    hinweis: 'Gruppenmitgliedschaften und Firewall-Regeln ändern Lösungsbausteine bewusst nie — in Remote Doc: „Remote-Desktop aktivieren“ und „User zu Gruppe hinzufügen“.',
    servicenow: { name: 'ZPA Client Role: Request or Check or Change Remote Access for a User', wozu: 'Fernzugriff aus dem Homeoffice (ZPA) beantragen' },
  },
  {
    id: 'vpn-fernzugriff-beantragen',
    titel: 'Fernzugriff (ZPA) beantragen – Laufwerk, Anwendung oder PC aus dem Homeoffice erreichen',
    bereich: VPN,
    stichworte: ['remote zugriff beantragen', 'remotezugriff beantragt', 'fernzugriff beantragen', 'zpa', 'zpa zugang', 'zpa fileshare', 'homeoffice zugriff beantragen', 'homeoffice remote berechtigung', 'ho zugriff', 'remote zugang beantragt', 'laufwerk homeoffice beantragen', 'zscaler private access'],
    beschreibungen: [
      'Ich brauche von zu Hause Zugriff auf das Laufwerk I.',
      'Remote-Zugriff für den Mitarbeiter beantragen.',
      'Im Homeoffice komme ich nicht an unsere Anwendung, im Büro schon.',
      'Ticket: HomeOffice Remote Berechtigung beantragt.',
      'ZPA Fileshare Zugang einrichten.',
    ],
    ursache: 'Aus dem Homeoffice gehen interne Laufwerke, Anwendungen und PCs über Zscaler Private Access (ZPA). Dafür braucht der Benutzer immer die Grundrolle „Remote Access“ (ZPA Client Role, AD-Gruppe Azure_AD_SSO_Akamai_EAA_Client) und zusätzlich je Anwendung die passende ZPA-Rolle (z. B. SAP: „Marine Production“ + „Marine Non Production“, enaio: „Marine enaio“, Babtec: „Marine Babtec“, Laufwerke: „Marine Fileservers“).',
    loesung: 'Der Zscaler-Zustand wird geprüft (angemeldet, verbunden). Fehlt die Berechtigung, wird sie über ServiceNow beantragt (ZPA Client Role). Danach Zscaler neu anmelden.',
    schritte: [
      { aktion: 'zscaler-status' },
      { aktion: 'zpa-rollen-pruefen', titel: 'Alle Fernzugriff-Berechtigungen (Marine-Anwendungen) im AD anzeigen' },
      { aktion: 'net-test', optional: true },
    ],
    hinweis: 'Benötigte Fernzugriff-Gruppen bei SKF Marine (AD): SAP → EAA_SAP_Marine_Prod + EAA_SAP_Marine_NonProd („Marine Production“/„Marine Non Production“) · enaio → EAA_Enaoi · Babtec → EAA_Babtec_Marine · Fileserver → EAA_File_Servers_Marine_Prod · Solidworks → EAA_Solidworks_Marine. Im Antrag „ZPA Client Role“ ist zu sehen, welche Rollen der Benutzer schon hat. Die Berechtigung vergibt das Zscaler-/Netzwerkteam — das Tool ändert keine Berechtigungen.',
    servicenow: { name: 'ZPA Client Role: Request or Check or Change Remote Access for a User', wozu: 'ZPA-Fernzugriff beantragen bzw. vorhandene Rollen prüfen' },
  },
  {
    id: 'vpn-enaio-homeoffice',
    titel: 'enaio geht im Homeoffice nicht, im Büro schon (ZPA-Rolle „Marine enaio“ fehlt)',
    bereich: VPN,
    stichworte: ['enaio homeoffice', 'enaio zu hause', 'enaio von zuhause', 'enaio remote', 'enaio zpa', 'marine enaio', 'enaio ho', 'enaio nur im buero', 'enaio keine verbindung homeoffice'],
    beschreibungen: [
      'Im Homeoffice komme ich nicht ins enaio, im Büro geht es.',
      'enaio findet von zu Hause aus den Server nicht.',
      'Ablage nach enaio klappt im Homeoffice nicht.',
      'Neuer Mitarbeiter: enaio geht nur im Büro.',
      'Ticket: enaio im Homeoffice – ZPA-Rolle Marine enaio beantragt.',
    ],
    ursache: 'Im Homeoffice erreicht enaio seinen Server nur über Zscaler Private Access. Dafür braucht der Benutzer die Grundrolle „Remote Access“ (ZPA Client Role, AD-Gruppe Azure_AD_SSO_Akamai_EAA_Client) UND die ZPA-Rolle „Marine enaio“; fehlt eine davon oder ist Zscaler nicht angemeldet, gibt es keine Verbindung.',
    loesung: 'Zscaler-Zustand und Verbindung werden geprüft und die Zscaler-App geöffnet. Ist Zscaler angemeldet und enaio geht trotzdem nicht, fehlt die Grundrolle „Remote Access“ oder die Rolle „Marine enaio“ — im Antrag „ZPA Client Role“ nachsehen und beantragen.',
    schritte: [
      { aktion: 'zscaler-status' },
      { aktion: 'net-test' },
      { aktion: 'zpa-rollen-pruefen', param: 'enaio', titel: 'Fernzugriff-Berechtigung für enaio im AD prüfen (EAA_Enaoi)' },
      { aktion: 'zscaler-tray' },
      { aktion: 'tchat-enaio-pruefen', optional: true, titel: 'enaio-Installation und Add-in prüfen' },
    ],
    hinweis: 'Benötigte ZPA-Rolle: „Marine enaio“. Die Berechtigung vergibt das Zscaler-/Netzwerkteam auf Antrag — das Tool ändert keine Berechtigungen.',
    servicenow: { name: 'ZPA Client Role: Request or Check or Change Remote Access for a User', wozu: 'Rolle „Marine enaio“ prüfen bzw. beantragen' },
  },
  {
    id: 'vpn-babtec-homeoffice',
    titel: 'Babtec geht im Homeoffice nicht, im Büro schon (ZPA-Rolle „Marine Babtec“ fehlt)',
    bereich: VPN,
    stichworte: ['babtec homeoffice', 'babtec zu hause', 'babtec von zuhause', 'babtec remote', 'babtec zpa', 'marine babtec', 'babtec ho', 'babtec nur im buero', 'babtec keine verbindung', 'babtec zugang'],
    beschreibungen: [
      'Im Homeoffice komme ich nicht ins Babtec.',
      'Babtec verbindet sich von zu Hause aus nicht mit der Datenbank.',
      'Babtec geht nur im Büro, nicht im Homeoffice.',
      'Ticket: Babtec Zugang Problem – Homeoffice.',
      'Neuer Mitarbeiter braucht Babtec im Homeoffice.',
    ],
    ursache: 'Im Homeoffice erreicht Babtec seinen Server nur über Zscaler Private Access. Dafür braucht der Benutzer die Grundrolle „Remote Access“ (ZPA Client Role, AD-Gruppe Azure_AD_SSO_Akamai_EAA_Client) UND die ZPA-Rolle „Marine Babtec“; fehlt eine davon oder ist Zscaler nicht angemeldet, gibt es keine Verbindung.',
    loesung: 'Zscaler-Zustand und Verbindung werden geprüft und die Zscaler-App geöffnet. Ist Zscaler angemeldet und Babtec geht trotzdem nicht, fehlt die Grundrolle „Remote Access“ oder die Rolle „Marine Babtec“ — im Antrag „ZPA Client Role“ nachsehen und beantragen.',
    schritte: [
      { aktion: 'zscaler-status' },
      { aktion: 'net-test' },
      { aktion: 'zpa-rollen-pruefen', param: 'Babtec', titel: 'Fernzugriff-Berechtigung für Babtec im AD prüfen (EAA_Babtec_Marine)' },
      { aktion: 'zscaler-tray' },
      { aktion: 'software-suchen', param: 'Babtec', optional: true, titel: 'Babtec-Installation prüfen' },
    ],
    hinweis: 'Benötigte ZPA-Rolle: „Marine Babtec“. Die Berechtigung vergibt das Zscaler-/Netzwerkteam auf Antrag — das Tool ändert keine Berechtigungen.',
    servicenow: { name: 'ZPA Client Role: Request or Check or Change Remote Access for a User', wozu: 'Rolle „Marine Babtec“ prüfen bzw. beantragen' },
  },

  // ══ PDF-Anhänge (aus dem Test mit dem Nutzer, 07.11.2026) ════════════════════
  {
    id: 'outlook-pdf-anhang-oeffnet-nicht',
    titel: 'PDF-Anhänge lassen sich in Outlook nicht öffnen (andere Anhänge schon) – Adobe nicht als Standard',
    bereich: 'Outlook & E-Mail',
    stichworte: ['pdf anhang', 'pdf anhaenge', 'pdf anlage', 'pdf anhang outlook', 'pdf oeffnet nicht', 'pdf geht nicht auf', 'pdf anhang oeffnet nicht', 'adobe standard', 'adobe als standard', 'pdf standardprogramm', 'pdf falsches programm', 'pdf oeffnen mit', 'adobe standardprogramm', 'pdf standard app'],
    beschreibungen: [
      'Ich kann keine PDF-Anhänge in Outlook öffnen.',
      'Word- und Excel-Anhänge gehen auf, nur bei PDFs passiert nichts.',
      'Doppelklick auf den PDF-Anhang fragt jedes Mal, mit welchem Programm ich ihn öffnen will.',
      'PDF-Anhänge öffnen sich im Browser bzw. in einem anderen Programm statt in Adobe.',
      'Seit dem Update ist Adobe nicht mehr Standard für PDF.',
      'Outlook: PDF attachment does not open, Adobe is not the default app.',
    ],
    ursache: 'Für .pdf ist kein oder das falsche Standardprogramm eingestellt (Adobe nicht Standard, Edge oder ein anderer Viewer hat übernommen) oder Adobe fehlt bzw. ist beschädigt. Seltener ist der Anlagen-Zwischenspeicher von Outlook voll – dann gehen aber auch andere Anhänge nicht auf.',
    loesung: 'Die Prüfung zeigt die PDF-Zuordnung des Benutzers und ob Adobe installiert ist. Ist Adobe nicht Standard, öffnet das Tool beim Benutzer den Windows-Dialog „Wie möchten Sie diese Datei öffnen?“ – Adobe wählen und „Immer“ anhaken. Gehen auch andere Anhänge nicht auf: zusätzlich den Anlagen-Zwischenspeicher leeren.',
    schritte: [
      { aktion: 'win4-dateizuordnungen', param: '.pdf' },
      { aktion: 'pdf-standard-adobe' },
      { aktion: 'ol-anhaenge-temp', optional: true, titel: 'Anlagen-Zwischenspeicher leeren (wenn auch andere Anhänge nicht aufgehen)' },
    ],
    hinweis: 'Windows erlaubt nur dem Benutzer selbst, die PDF-Zuordnung festzulegen – das Tool öffnet den Dialog dafür direkt auf seinem Bildschirm. Fehlt Adobe, über die Software-Kachel installieren.',
    nachricht: 'Bitte wählen Sie im geöffneten Fenster „Adobe Acrobat“ und setzen Sie den Haken bei „Immer diese App verwenden“. Danach öffnen sich PDF-Anhänge wieder.',
  },

  // ══ Programm installieren ════════════════════════════════════════════════════
  {
    id: 'update-programm-installieren',
    titel: 'Programm installieren (z. B. Babtec, Corel Draw, Snagit, PDF-XChange, FSPP, eDrawings, VLC)',
    bereich: UPD,
    stichworte: ['software installieren', 'programm installieren', 'software installation', 'installation', 'installiert', 'babtec', 'corel', 'corel draw', 'snagit', 'greenshot', 'pdf24', 'pdf-xchange', 'pdf xchange', 'kleopatra', 'secsign', 'fspp', 'wago', 'splan', 'signpro', 'pathfinder', 'vlc', 'edrawings', 'gopro', 'zoom installieren', 'software bestellung', 'ac-client', 'mdesign', 'm-design'],
    beschreibungen: [
      'Der Mitarbeiter braucht Babtec auf seinem Rechner.',
      'Bitte Corel Draw installieren.',
      'Snagit bzw. Greenshot für Screenshots einrichten.',
      'Ticket: Software für einen Kundentermin installiert (Zoom).',
      'Kleopatra und SecSign installieren für verschlüsselte Mails.',
      'FSPP installieren.',
      'PDF24 bzw. PDF-XChange installiert.',
    ],
    frage: { label: 'Welches Programm?', platzhalter: 'z. B. Babtec, Corel, Snagit', vorlagen: ['Babtec', 'Corel', 'Snagit', 'PDF-XChange', 'FSPP'] },
    ursache: 'Standardprogramme kommen über das Unternehmensportal (Intune) bzw. das Unternehmensportal, Sonderprogramme über die Software-Kachel des Tools oder eine Bestellung (Lizenz).',
    loesung: 'Erst wird geprüft, ob das Programm schon (in einer anderen Version) installiert ist. Danach über die Software-Kachel installieren bzw. im Unternehmensportal anbieten; braucht es eine Lizenz, über ServiceNow bestellen.',
    schritte: [
      { aktion: 'software-suchen', param: '{eingabe}' },
      { aktion: 'intune-apps-sync', optional: true, titel: 'Unternehmensportal (Intune) aktualisieren' },
      { aktion: 'werkzeug:software' },
    ],
    hinweis: 'Programme mit Lizenz (Adobe Pro, Corel, Visio …) vorher über ServiceNow bestellen bzw. die Lizenz klären.',
  },

  // ══ Neu aufsetzen ═══════════════════════════════════════════════════════════
  {
    id: 'update-pc-neu-aufsetzen',
    titel: 'PC neu aufsetzen (Reimage) – wann es nötig ist und was vorher gesichert sein muss',
    bereich: UPD,
    stichworte: ['reimage', 'reimaged', 'neu aufsetzen', 'neu aufgesetzt', 'pc reimage', 'laptop reimage', 'wipe and load', 'neuinstallation windows', 'windows neu installieren', 'rechner neu aufsetzen', 'plattmachen'],
    beschreibungen: [
      'Der Laptop muss komplett neu aufgesetzt werden, es hilft nichts mehr.',
      'PC reimagen – was muss ich vorher sichern?',
      'Windows ist so kaputt, dass wir den Rechner neu installieren müssen.',
      'Ticket: Laptop reimaged.',
      'Rechner neu aufgesetzt nach Fehlern.',
    ],
    ursache: 'Wenn Reparaturen (SFC/DISM, Profil neu, Updates zurücksetzen) nicht helfen oder das System beschädigt ist, wird der PC über die Softwareverteilung neu aufgesetzt. Lokale Daten außerhalb von OneDrive gehen dabei verloren.',
    loesung: 'Vorher prüft das Tool den PC-Überblick, ob OneDrive Desktop/Dokumente sichert und den BitLocker-Zustand. Lokale Ordner (z. B. C:\\EuroPAR, C:\\Local) und PST-Dateien vorher sichern; das Neuaufsetzen selbst über ServiceNow beantragen bzw. die Softwareverteilung.',
    schritte: [
      { aktion: 'info-ueberblick' },
      { aktion: 'od-ordnersicherung-pruefen' },
      { aktion: 'bitlocker-status' },
    ],
    hinweis: 'Vor dem Neuaufsetzen: Fachprogramm-Ordner (EuroPar, Coscom), PST-Archive und Browser-Favoriten sichern. Das Tool setzt keinen PC neu auf.',
    servicenow: { name: 'Reinstall PC with Windows 10 (Wipe and load)', wozu: 'Neuaufsetzen beantragen' },
  },

  // ══ Berechtigungen: häufigste Ursachen laut Field Service ═══════════════════
  {
    id: 'laufwerk-homeoffice-berechtigung-fehlt',
    titel: 'Laufwerke gehen im Homeoffice nicht – ZPA-Rolle „Marine Fileservers“ fehlt',
    bereich: LW,
    stichworte: ['marine fileservers', 'marine fileserver', 'fileserver homeoffice', 'laufwerk homeoffice berechtigung', 'homeoffice laufwerk rolle', 'zpa fileserver', 'eaa file servers', 'i laufwerk zuhause beantragen', 'laufwerke nur im buero', 'homeoffice keine laufwerke'],
    beschreibungen: [
      'Im Homeoffice sehe ich das Laufwerk I: nicht, im Büro geht alles.',
      'Von zu Hause komme ich nicht an unseren Abteilungsordner.',
      'Zscaler ist verbunden, aber die Netzlaufwerke bleiben rot.',
      'Neuer Mitarbeiter: Laufwerke gehen nur in der Firma, nicht zu Hause.',
      'Ticket: ZPA-Rolle Marine Fileservers beantragt.',
    ],
    ursache: 'Im Homeoffice laufen die Netzlaufwerke über Zscaler Private Access. Dafür braucht der Benutzer die ZPA-Rolle „Marine Fileservers“ (AD-Gruppe EAA_File_Servers_Marine_Prod). Fehlt sie, bleiben I: und die Abteilungslaufwerke zu Hause getrennt, obwohl Zscaler angemeldet ist – im Büro geht alles. Das ist bei SKF Marine die häufigste Ursache.',
    loesung: 'Im AD wird geprüft, ob der Benutzer die Rolle hat. Fehlt sie, wird sie in ServiceNow („ZPA Client Role“) beantragt. Nach der Zuweisung Zscaler ab- und wieder anmelden (bzw. PC neu starten) und die Laufwerke neu verbinden.',
    schritte: [
      { aktion: 'zpa-rollen-pruefen', param: 'Fileserver', titel: 'Homeoffice-Berechtigung für die Marine-Fileserver im AD prüfen (EAA_File_Servers_Marine_Prod)' },
      { aktion: 'zscaler-status' },
      { aktion: 'lw-neu-verbinden', optional: true, titel: 'Nach Zuweisung der Rolle: Laufwerke neu verbinden' },
    ],
    hinweis: 'Benötigte ZPA-Rolle: „Marine Fileservers“ (EAA_File_Servers_Marine_Prod). Die Rolle vergibt das Zscaler-/Netzwerkteam auf Antrag – das Tool ändert keine Berechtigungen. Hat der Benutzer die Rolle schon, liegt es am Zscaler-Zustand („Netzlaufwerke im Homeoffice nicht erreichbar“).',
    servicenow: { name: 'ZPA Client Role: Request or Check or Change Remote Access for a User', wozu: 'Rolle „Marine Fileservers“ beantragen bzw. prüfen' },
  },
  {
    id: 'laufwerk-abteilungsordner-keine-berechtigung',
    titel: 'Kein Zugriff auf den Abteilungsordner – Berechtigung fehlt (Vergleich mit den Kollegen)',
    bereich: LW,
    stichworte: ['abteilungsordner', 'abteilungsordner kein zugriff', 'abteilungsordner fehlt', 'ordner der abteilung', 'kollegen haben zugriff', 'kollege kann ich nicht', 'ordner nicht sichtbar', 'ordner leer berechtigung', 'neuer mitarbeiter ordner', 'gleiche rechte wie kollege'],
    beschreibungen: [
      'Ich komme nicht in unseren Abteilungsordner, die Kollegen schon.',
      'Den Ordner meiner Abteilung sehe ich auf I: gar nicht.',
      'Neue Mitarbeiterin hat keinen Zugriff auf den Ordner ihrer Abteilung.',
      'Zugriff verweigert auf den Ordner Einkauf, auch im Büro.',
      'Ich brauche dieselben Ordnerrechte wie mein Kollege.',
    ],
    ursache: 'Ordner auf W3172 sind über AD-Gruppen freigegeben („RW/RO access to \\\\W3172\\SKF Marine\\…“). Fehlt dem Benutzer die Gruppe – häufig nach Abteilungswechsel, bei neuen Mitarbeitern oder nach langer Abwesenheit –, sieht er den Ordner nicht (zugriffsbasierte Aufzählung) oder bekommt „Zugriff verweigert“. Das gilt im Büro genauso wie im Homeoffice.',
    loesung: 'Der Abgleich im AD zeigt, welche Ordnerberechtigungen die Abteilungskollegen haben und dem Benutzer fehlen – mit Gruppenname für den Antrag. Optional wird ein konkreter Pfad mit dem Konto des Benutzers getestet (bekannte Gruppe, aber Anmeldung noch alt → ab- und wieder anmelden).',
    schritte: [
      { aktion: 'rechte-kollegen-vergleich' },
      { aktion: 'rechte-pruefen', param: '{eingabe}', optional: true, titel: 'Konkreten Ordner mit dem Konto des Benutzers testen' },
      { aktion: 'kerberos-erneuern', optional: true, titel: 'Wurde die Gruppe gerade vergeben: Anmeldetickets erneuern' },
    ],
    frage: { label: 'Pfad des Ordners (optional)', platzhalter: 'z. B. I:\\Einkauf' },
    hinweis: 'Rechte vergibt DXC auf Antrag des Ordnerverantwortlichen bzw. der Führungskraft – das Tool ändert keine Berechtigungen. Im Homeoffice zusätzlich die ZPA-Rolle „Marine Fileservers“ prüfen.',
    servicenow: { name: 'Fileshare Access Request', wozu: 'Ordnerzugriff in ServiceNow beantragen' },
  },
  {
    id: 'berechtigung-fehlt-kollegen-vergleich',
    titel: 'Kollegen können es, ich nicht – fehlende Berechtigung finden (Vergleich aller AD-Gruppen)',
    bereich: KONTO,
    stichworte: ['berechtigung fehlt', 'keine berechtigung', 'kollege kann es', 'kollegen koennen', 'bei kollegen geht es', 'nur bei mir nicht', 'fehlende rechte', 'rechte fehlen', 'ad gruppe fehlt', 'gruppenmitgliedschaft fehlt', 'zugriff fehlt'],
    beschreibungen: [
      'Bei meinen Kollegen geht das Programm, bei mir kommt „keine Berechtigung“.',
      'Ich habe nicht dieselben Rechte wie mein Kollege.',
      'Mir fehlt irgendeine Berechtigung, aber welche?',
      'Seit dem Abteilungswechsel geht einiges nicht mehr.',
      'Kollege sieht das Postfach, ich nicht.',
    ],
    ursache: 'Berechtigungen hängen an AD-Gruppen (Ordner, Postfächer, Lizenzen, Software, Homeoffice-Rollen, Fachanwendungen). Fehlt dem Benutzer eine Gruppe, die seine Kollegen haben, gehen genau diese Dinge nicht – häufig nach Abteilungswechsel oder wenn bei neuen Mitarbeitern nicht alles bestellt wurde.',
    loesung: 'Der Vergleich im AD zeigt jede Gruppe, die die meisten Kollegen haben und dem Benutzer fehlt – mit Art, Fehlerbild und dem passenden ServiceNow-Antrag. Die Führungskraft bzw. der Gruppenverantwortliche bestellt sie; danach ab- und wieder anmelden.',
    schritte: [{ aktion: 'rechte-alle-vergleich' }, { aktion: 'zpa-rollen-pruefen', optional: true, titel: 'Homeoffice-Rollen (ZPA) zusätzlich einzeln anzeigen' }],
    hinweis: 'Das Tool vergibt keine Berechtigungen. Nicht jede Abweichung ist ein Fehler (andere Aufgabe, andere Rolle) – entscheidend ist, ob das Fehlerbild zum Problem passt.',
    servicenow: { name: 'Manage My AD Security Groups', wozu: 'Gruppenverantwortliche: Mitglieder einer AD-Gruppe verwalten' },
  },
  {
    id: 'neuer-mitarbeiter-berechtigungen-pruefen',
    titel: 'Neuer Mitarbeiter: Wurden alle Berechtigungen bestellt? (Abgleich mit den Kollegen)',
    bereich: KONTO,
    stichworte: ['neuer mitarbeiter berechtigungen', 'neue mitarbeiterin rechte', 'onboarding berechtigungen', 'berechtigungen vergessen', 'manager hat vergessen', 'rechte nicht bestellt', 'neuer kollege kein zugriff', 'erster arbeitstag kein zugriff', 'neueinstellung rechte', 'onboarding rechte'],
    beschreibungen: [
      'Neuer Mitarbeiter kommt nirgends rein – wurden die Berechtigungen bestellt?',
      'Die Führungskraft hat beim Onboarding die Rechte vergessen.',
      'Neue Kollegin sieht die Abteilungslaufwerke und das Gruppenpostfach nicht.',
      'Am ersten Tag geht SAP und enaio nicht.',
      'Bitte prüfen, ob der Neue dieselben Rechte hat wie das Team.',
    ],
    ursache: 'Bei neuen Mitarbeitern bestellt die Führungskraft Geräte und Software, vergisst aber oft die Berechtigungen (Abteilungsordner, Gruppenpostfach, Homeoffice-Rollen, Fachanwendungen). Dann fehlen dem Neuen Gruppen, die alle Kollegen haben.',
    loesung: 'Der Abgleich im AD listet alle Gruppen, die das Team hat und der neue Mitarbeiter noch nicht – je mit Fehlerbild und ServiceNow-Antrag, damit die Führungskraft gezielt nachbestellen kann.',
    schritte: [{ aktion: 'rechte-alle-vergleich' }, { aktion: 'zpa-rollen-pruefen', titel: 'Homeoffice-Rollen (ZPA) des neuen Mitarbeiters' }],
    hinweis: 'Das Tool vergibt keine Berechtigungen. Die Liste an die Führungskraft geben; sie bestellt die fehlenden Gruppen in ServiceNow.',
    servicenow: { name: 'IT Onboarding of Personal Accounts', wozu: 'Onboarding-Antrag (Konto) – fehlende Berechtigungen gezielt nachbestellen' },
  },
]
