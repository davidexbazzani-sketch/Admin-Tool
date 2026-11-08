// ── Weitere Beschreibungen aus ECHTEN Tickets (Field-Service/Infrastruktur, Okt 2025 – Nov 2026) ──
// Die Tickets sind knapp und oft als erledigte Maßnahme formuliert („Laufwerk I gemapped“, „PW zurückgesetzt“,
// „Computer Zertifikat erneuert“). Damit „Gib dein Problem ein“ auch so formulierte Eingaben erkennt,
// stehen sie hier je Problem-ID. Keine Namen von Mitarbeitern.

export const VARIANTEN_TICKETS: Record<string, string[]> = {
  // ══ Konto, Kennwort, MFA ════════════════════════════════════════════════════
  'konto-kennwort-vergessen': ['Passwort reset', 'Passwort-Reset','PW zurückgesetzt', 'PW-Zurücksetzung', 'Passwort zurücksetzen im Homeoffice', 'Passwort neu aufgesetzt', 'Account PW neu', 'PW reset Unterstützung', 'Kennwort zurücksetzen für Mitarbeiter'],
  'konto-gesperrt': ['Account entsperrt', 'Kontosperrung aufheben', 'Kontosperrung aufgehoben', 'Passwort entsperrt', 'Konto entsperren', 'PC entsperrt nach Passwort reset'],
  'konto-deaktiviert': ['Account reaktivieren', 'Account wieder aktiviert'],
  'konto-mfa-authenticator': ['Authenticator eingerichtet', 'Authenticator App auf anderes Handy übertragen', 'Authentificator ändern', 'Kontowiederherstellung Authenticator', 'Account Wiederherstellung', 'Konto wiederhergestellt', 'Accountwiederherstellung', 'Authenticator neu verbinden', 'Passwort zurücksetzen im HO, Authenticator neu verbinden'],
  'mfa-weitere-informationen-erforderlich': ['TAP eingerichtet', 'Temporary Access Pass erstellt', 'befristeten Zugangspass eingerichtet'],
  'sicherheit-bitlocker-wiederherstellungsschluessel': ['Bitlocker Recovery', 'Bitlocker Recovery Key', 'Bitlocker reset', 'Bitlocker Wiederherstellungskey', 'Bitlocker inkl. PW', 'Bitlocker wiederhergestellt', 'Bitlocker gesperrt'],

  // ══ Zscaler, Internet, WLAN, LAN ═══════════════════════════════════════════
  'vpn-zscaler-nicht-angemeldet': ['Zscaler Anmeldung', 'Zscaler einrichten', 'Zscaler aktivieren', 'Zscaler aktiviert', 'Zscaler eingerichtet', 'Zscaler reauthenticate', 'Zscaler Einstellung', 'Zscaler Anmeldung bei Laptop eintragen', 'ESS Anmeldung Zscaler', 'Passwort reset und Zscaler Anmeldung', 'Zscaler neu eingerichtet inkl. Passwort'],
  'netz-kein-internet-verbunden': ['Internet Problem', 'Internetprobleme', 'kein Internet, Zscaler aktiviert', 'Internetverbindung, Zscaler aktiviert'],
  'wlan-keine-verbindung-herstellen': ['WLAN Probleme', 'WLAN Problem', 'WLAN repariert', 'WLAN Konfiguration', 'WLAN eingerichtet', 'WLAN eingestellt', 'WLAN und Zscaler'],
  'mfa-diensthandy-firmen-wlan': ['Handy WLAN eingerichtet', 'Handy WLAN Problem', 'Handy WLAN verbunden', 'Diensthandy ins WLAN bringen'],

  // ══ Laufwerke ══════════════════════════════════════════════════════════════
  'laufwerk-verbinden': ['Laufwerk I gemapped', 'Laufwerk I mappen', 'Laufwerk I verbunden', 'Laufwerk I neu verbunden', 'Laufwerk I neu gemapped', 'Netzlaufwerk gemapped', 'Laufwerk Q mapping', 'Laufwerk Q und R mappen', 'Laufwerk eingebunden', 'Einrichtung der Laufwerke', 'Laufwerk I inkl. Fileshare', 'Laufwerk I mappen auf Server'],
  'laufwerk-rechte-antrag-vorbereiten': ['Laufwerk Zugriff beantragt', 'Zugriff Laufwerk beantragen', 'Ordnerzugriff beantragt', 'Fileshare Zugriff beantragt', 'Zugang zum Laufwerk beantragt', 'Laufwerk G beantragt', 'Laufwerk I beantragt', 'Berechtigung auf Ordner beantragt', 'Zugriff auf Matrix-Ordner eingerichtet'],
  'laufwerk-datei-geloescht': ['Fileshareordner wiederhergestellt', 'Ordner wiederhergestellt', 'Datei wiederhergestellt'],

  // ══ Drucker ════════════════════════════════════════════════════════════════
  'drucker-verbinden': ['Drucker eingerichtet', 'Drucker einrichten', 'Drucker neu angebunden', 'Drucker wiederhergestellt', 'Drucker eingestellt', 'Druckerumzug, Neuinstallation', 'Druckerprobleme behoben'],
  'drucker-etikettendrucker': ['Etikettendrucker repariert', 'Etikettendrucker Reset', 'Etikettendrucker zurückgesetzt'],

  // ══ Zertifikat ═════════════════════════════════════════════════════════════
  'sicherheit-zertifikat-abgelaufen': ['Computer Zertifikat erneuert', 'Computerzertifikat erneuert', 'Computerzertifikat wiederhergestellt', 'Maschinenzertifikat erneuern', 'Computer Zertifikat abgelaufen'],

  // ══ Outlook ════════════════════════════════════════════════════════════════
  'outlook-gruppenpostfach-fehlt': ['Postfach eingebunden', 'Postfächer eingerichtet', 'Postfach im Outlook eingebunden', 'Shared Mailbox eingebunden', 'Gruppenpostfach in Outlook einbinden', 'Postfach eingerichtet'],
  'outlook-ost-zu-gross': ['OST-Datei erneuert', 'Outlook OST Datei erneuert', 'Outlookdatei erneuert', 'Outlook Cache gelöscht'],
  'outlook-neues-profil-scheitert': ['Outlook Profil erneuert', 'Outlook neu aufgesetzt', 'Outlook Reset', 'Outlook neu eingerichtet', 'SKF-Outlook eingerichtet', 'Outlook Postfach eingerichtet', 'Outlook neuinstalliert'],
  'outlook-geloeschte-wiederherstellen': ['Outlookordner wiederhergestellt', 'Outlook Inbox wiederhergestellt', 'Outlook Serientermine wiederhergestellt', 'Outlook wiederhergestellt'],
  'outlook-enaio-addin-fehlt': ['Enaio installiert', 'Enaio Outlook AddIn installiert', 'Enaio Office-Add-in Installation', 'Enaio wieder eingebunden', 'Enaio AddIn aktiviert', 'Enaio Problem', 'Enaio deinstalliert und neu installiert'],

  // ══ Teams, OneDrive ════════════════════════════════════════════════════════
  'teams-startet-nicht': ['Teams neu installiert', 'Teams neu eingerichtet', 'Teams Cache gelöscht', 'Teams Cache zurückgesetzt', 'Teams Cache geleert', 'Teamsprobleme'],
  'od-nicht-eingerichtet': ['OneDrive eingerichtet', 'OneDrive synchronisiert', 'OneDrive-Ordner eingebunden', 'OneDrive Cache gelöscht', 'OneDrive Problem'],

  // ══ Windows, Treiber, Updates, Sprache ═════════════════════════════════════
  'update-treiber-bios-veraltet': ['Treiberupdate', 'Treiber-Updates installiert','Treiberupdates installiert', 'Dockingstation Treiberupdate', 'Treiber installiert', 'Treiber neu installiert'],
  'konto-gpo-fehlgeschlagen': ['Richtlinien erneuert', 'Richtlinien wiederhergestellt', 'GP-Update gemacht', 'Gruppenrichtlinien neu angewendet'],
  'update-haengt': ['Updates installiert', 'Updateprobleme', 'Windows Updates erzwungen installiert', 'Windows Update auf dem Production Screen'],
  'windows-anzeigesprache-falsch': ['Spracheinstellung', 'Spracheinstellungen', 'Spracheinstellung vorgenommen', 'Windows Spracheinstellung', 'Rechner teilweise Englisch'],
  'office-oberflaeche-englisch': ['Office Sprache umgeändert', 'Sprache umstellen Windows und Office', 'Office Sprachpaket installiert', 'Outlook Sprache installiert'],
  'web-datum-us-format': ['Browser auf deutsch gestellt', 'Browsersprache auf Deutsch', 'SAP Fiori Spracheinstellung', 'Fiori auf Deutsch umgestellt'],

  // ══ Audio, Bildschirm, Hardware ════════════════════════════════════════════
  'audio-kein-ton': ['Soundprobleme', 'Soundprobleme behoben', 'Audiotreiber', 'Audioeinstellungen inkl. Treiberupdate', 'kein Sound'],
  'audio-neues-headset-einrichten': ['Headset eingerichtet', 'Headset Einstellung', 'Headset fixen', 'Headset Problem', 'Headset neu eingerichtet', 'Headset wiederhergestellt', 'Headset repariert'],
  'bildschirm-zweiter-monitor': ['Bildschirmeinstellungen', 'Bildschirme eingerichtet', 'Bildschirme eingestellt', 'Bildschirme ausgerichtet', 'Bildschirm Problem', 'Bildschirmeinstellung angepasst'],
  'hardware-touch-falsche-stelle': ['Touchbildschirm eingerichtet', 'Touch Bildschirm Einstellungen korrigiert', 'Touchscreen reset', 'Touchbildschirm neu gestartet', 'Touchbildschirme eingerichtet'],
  'kamera-externe-webcam': ['Webcam eingerichtet', 'Kameratreiber aktualisiert'],
  'hardware-laptop-heiss-luefter': ['Lüfterprobleme', 'Lüfter Problem'],
  'hardware-usb-nicht-erkannt': ['USB Problem Schnittstellen behoben', 'USB-Anschlüsse gehen nicht'],

  // ══ Xelion, Handy ══════════════════════════════════════════════════════════
  'sonstiges-xelion-installieren': ['Xelion Problem', 'Xelion neu aufgesetzt', 'Xelion Anmeldung Fix', 'Xelion installiert'],
  'sonstiges-xelion-rufumleitung-haengt': ['Xelion Rufnummerweiterleitung raus genommen', 'Xelion Weiterleitung entfernt'],
  'mfa-unternehmensportal-registrierung': ['Handy einrichten', 'Handyeinrichtung', 'iPhone Einrichtung', 'iPad Einrichtung', 'Handy eingerichtet', 'Unternehmensportal am Handy eingerichtet', 'Handy neu synchronisiert', 'Unternehmensportal Problem gelöst'],

  // ══ PDF, Adobe, SAP ════════════════════════════════════════════════════════
  'programm-pdf-fremdviewer-uebernimmt': ['Adobe als Standard Programm', 'Adobe Reader als Standard', 'PDF Standard Apps Einstellungen', 'PDF-XChange umgestellt', 'PDF Einstellung eingerichtet', 'PDF-Reader eingestellt'],
  'programm-acrobat-formular-rechnet-nicht': ['Java Script in Adobe aktiviert', 'Adobe JavaScript aktiviert', 'Java Script aktiviert'],
  'sap-snc-fehler': ['Ich komme nicht ins SAP', 'Ich komme nicht in SAP rein', 'SAP lässt mich nicht rein', 'Komme nicht mehr ins SAP, Anmeldung klappt nicht', 'SAP Anmeldung geht nicht'],
  'sap-fiori-browser': ['Einrichtung SAP Fiori', 'Fiori eingerichtet'],
  'sap-gui-fehlt-veraltet': ['SAP neu installiert', 'SAP Neuinstallation'],
}
