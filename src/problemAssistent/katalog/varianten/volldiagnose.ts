// ── Varianten: Formulierungen der Komplett-Diagnose für bestehende Probleme (16.11.2026) ──
// Die Komplett-Diagnose (src/vollDiagnose/katalog.ts) verweist ihre Befund-Typen per `problem` bzw.
// `imKatalog` auf diese Probleme. Damit man sie in „Gib dein Problem ein“ auch mit dem Wortlaut der
// Befunde (bzw. den Ereignissen dahinter) findet, stehen hier deren Formulierungen – höchstens 6 je Problem.

export const VARIANTEN_VOLLDIAGNOSE: Record<string, string[]> = {
  'update-installation-neustart-ausstehend': [
    'Neustart nach Updates steht aus, weitere Updates scheitern.',
    'Die Komplett-Diagnose meldet: Neustart nach Updates steht aus.',
    'Updates warten auf einen Neustart.',
    'Windows wartet nach den Updates auf einen echten Neustart.',
  ],
  'leistung-festplatte-voll': [
    'Das Systemlaufwerk ist fast voll.',
    'Die Komplett-Diagnose meldet: Systemlaufwerk ist fast voll.',
    'Auf C: sind nur noch wenige Gigabyte frei, Updates scheitern.',
  ],
  'update-fehlercode': [
    'Windows-Updates schlagen immer wieder fehl.',
    'Die Komplett-Diagnose meldet Fehlercodes von Windows Update.',
    'Update-Fehler ohne bekannte Ursache.',
  ],
  'leistung-dienste-starten-nicht': [
    'Ein wichtiger Dienst läuft nicht, obwohl er auf Automatisch steht.',
    'Ein Dienst stürzt immer wieder ab oder startet nicht (Dienststeuerungs-Manager 7031, 7034).',
    'Die Komplett-Diagnose meldet gestoppte automatische Dienste.',
  ],
  'leistung-hardwarefehler-whea': [
    'Die Hardware meldet Fehler (WHEA-Logger) – Prozessor, Speicher oder Steckkarte.',
    'Die Komplett-Diagnose meldet Hardwarefehler (Prozessor, Speicher, Steckkarte).',
  ],
  'hardware-ssd-fehler': [
    'Die eingebaute Festplatte bzw. SSD meldet Fehler.',
    'Die Komplett-Diagnose meldet: Datenträger ist defekt bzw. fällt bald aus.',
    'SMART bzw. die Zuverlässigkeitszähler melden, dass die Platte bald ausfällt.',
  ],
  'update-programm-stuerzt-ab': [
    'Ein Programm stürzt ab oder reagiert nicht mehr („Keine Rückmeldung“).',
    'Die Komplett-Diagnose meldet: Programm stürzt in eigenem Code ab.',
    'Absturzursache nicht eindeutig, das Programm stürzt aber immer wieder ab.',
  ],
  'hardware-hitze-drosselung-last': [
    'Der Prozessor wird gedrosselt – Hitze bzw. Energie.',
    'Die Komplett-Diagnose meldet Überhitzung bzw. Drosselung.',
    'Kernel-Processor-Power meldet, dass die Firmware die Prozessorleistung begrenzt.',
  ],
  'netz-dns-langsam': [
    'Die Namensauflösung (DNS) läuft in Zeitüberschreitungen.',
    'DNS-Client-Ereignis 1014: Zeitüberschreitung bei der Namensauflösung.',
  ],
  'netz-pc-per-name-nicht-erreichbar': [
    'Der PC kann sich nicht im DNS anmelden (Ereignis 8015 bzw. 8018).',
    'Die dynamische DNS-Registrierung des PCs schlägt fehl.',
  ],
  'netz-lan-169-254': [
    'Der PC bekommt keine IP-Adresse vom DHCP.',
    'DHCP-Client meldet 1001 bzw. 1002 – keine Adresse erhalten.',
  ],
  'netz-lan-trennt': [
    'Netzwerkkabel: Die Verbindung bricht ab, die Netzwerkkarte meldet „Link down“.',
    'Die Komplett-Diagnose meldet Abbrüche der LAN-Verbindung.',
  ],
  'hardware-code-31-treiber-laden': [
    'Der Treiber eines Geräts lässt sich nicht laden.',
    'Kernel-PnP meldet, dass ein Gerätetreiber nicht geladen werden konnte.',
  ],
  'bildschirm-livekernelevent-141': [
    'Der Grafiktreiber musste im Betrieb zurückgesetzt werden (LiveKernelEvent 141 bzw. 117).',
    'Die Komplett-Diagnose meldet Grafik-Hänger ohne Bluescreen.',
    'Bild friert kurz ein, der Zuverlässigkeitsverlauf zeigt Hardwarefehler 117.',
  ],
  'hardware-dock-trennt-staendig': [
    'Der USB-Treiber musste zurückgesetzt werden, Maus und Monitore am Dock sind kurz weg.',
    'LiveKernelEvent 144 bzw. 1A5 – USB am Dock setzt sich zurück.',
  ],
  'update-dotnet-programm-absturz': [
    'Ein .NET-Programm stürzt mit unbehandeltem Fehler ab.',
    'Das Programm stürzt in .NET ab (unbehandelte Ausnahme).',
  ],
  'sicherheit-signaturen-veraltet': [
    'Die Virensignaturen lassen sich nicht aktualisieren (Defender 2001).',
    'Das Update der Defender-Sicherheitsintelligenz schlägt fehl.',
  ],
  'sicherheit-defender-fund': [
    'Der Virenschutz hat eine Bedrohung erkannt.',
    'Schadsoftware gefunden, die Bereinigung ist fehlgeschlagen.',
  ],
  'leistung-bluescreen-memory-management': [
    'Verdacht auf defekten Arbeitsspeicher – wechselnde Bluescreen-Codes.',
    'Die Komplett-Diagnose meldet: Verdacht auf defekten Arbeitsspeicher.',
  ],
  'leistung-bluescreen-kernel-data-inpage-error': [
    'Bluescreens durch den Datenträger – die Auslagerungsdatei ist nicht lesbar.',
    'Die Komplett-Diagnose meldet Bluescreens durch die Festplatte bzw. SSD.',
  ],
  'leistung-bluescreen-critical-process-died': [
    'Abstürze passen zu beschädigten Systemdateien (kritischer Prozess beendet).',
  ],
  'hardware-bluescreen': [
    'Die Bluescreen-Ursache ist nicht eindeutig.',
    'Die Komplett-Diagnose meldet Bluescreens.',
    'Der PC hatte mehrere Bluescreens in den letzten Tagen.',
  ],
  'office-addin-abschalten': [
    'Ein Add-in bringt das Office-Programm zum Absturz.',
    'Office hat ein Add-in wegen Abstürzen deaktiviert.',
  ],
  'update-fehler-0x80073701': [
    'Updates scheitern am beschädigten Komponentenspeicher.',
  ],
  'update-zu-wenig-speicher': [
    'Updates scheitern an zu wenig Speicherplatz.',
  ],
  'update-server-nicht-erreichbar': [
    'Die Update-Quelle ist nicht erreichbar (Zscaler, Proxy oder WSUS).',
    'Windows Update erreicht seinen Update-Server nicht.',
  ],
  'update-fehler-0x80070422-dienst-aus': [
    'Der Update-Dienst ist abgeschaltet.',
  ],
  'hardware-ssd-verschleiss-hoch': [
    'Die SSD nähert sich dem Lebensende.',
  ],
  'hardware-ssd-heiss-drosselt': [
    'Der Datenträger wird zu heiß.',
  ],
  'windows-uhrzeit-falsch': [
    'Die Zeitsynchronisierung schlägt fehl (Time-Service).',
    'Der Zeitdienst erreicht seine Zeitquelle nicht.',
  ],
  'leistung-pc-geht-einfach-aus': [
    'Plötzlich aus ohne Absturz – Stromversorgung?',
    'Der PC wurde hart ausgeschaltet oder ist abgestürzt (Kernel-Power 41).',
  ],
  'leistung-pc-friert-ein': [
    'Der Benutzer hat den PC hart ausgeschaltet, weil er hing.',
  ],
  'konto-anmeldung-dauert-lange': [
    'Der Anmeldeprozess (Winlogon) meldet Fehler.',
  ],
  'windows-suche-findet-nichts': [
    'Die Datenbank der Windows-Suche ist beschädigt.',
  ],
  'konto-gpo-fehlgeschlagen': [
    'Die Gruppenrichtlinien-Verarbeitung meldet Fehler.',
  ],
  'netz-anmeldeserver-nicht-verfuegbar': [
    'Der Domänencontroller ist zeitweise nicht erreichbar.',
  ],
  'wlan-trennt-staendig': [
    'Der WLAN-Adapter setzt sich zurück, die Verbindung bricht ab.',
  ],
  'wlan-keine-verbindung-herstellen': [
    'Die WLAN-Verbindung schlägt oft fehl.',
  ],
  'leistung-arbeitsspeicher-voll': [
    'Der Arbeitsspeicher wird knapp (Ressourcenknappheit erkannt).',
  ],
  'konto-kerberos-krb-ap-err-modified': [
    'Kerberos-Anmeldefehler im Ereignisprotokoll des PCs.',
  ],
  'vpn-zscaler-dienst-startet-nicht': [
    'Der Zscaler-Dienst stürzt ab oder startet nicht.',
  ],
  'update-vcredist-fehlt': [
    'Ein Programm startet nicht, weil eine Visual-C++-Laufzeit fehlt (SideBySide).',
  ],
  'windows-explorer-stuerzt-ab': [
    'Der Explorer stürzt in einer fremden Shell-Erweiterung ab.',
  ],
  'leistung-bluescreen-nach-update': [
    'Bluescreens hängen mit einer Treiberänderung zusammen.',
  ],
  'bildschirm-kurz-schwarz': [
    'Abstürze bzw. schwarze Bildschirme durch den Grafiktreiber.',
  ],
}
