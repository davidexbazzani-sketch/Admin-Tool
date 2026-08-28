// ── Steckbrief-Seed: Betriebsgedächtnis der Server (Import-Datenbasis) ────────
// Quelle: resources/SKF_Marine_SERVER_STECKBRIEFE.md (Stand 25.08.2026). Wird von
// serverHistory.ts einmalig in server_monitor/history.json importiert. `role:true`
// = Stammdaten/Rolle (oben angeheftet), sonst datierte Historie. Bei neuen
// Steckbrief-Daten SEED_VERSION erhöhen — dann werden fehlende Einträge nachgezogen.

export const SEED_VERSION = 1

export interface SteckbriefSeed {
  host: string
  date?: string        // 'YYYY-MM-DD' (Ereignis); leer = Stammdaten
  role?: boolean       // Rolle/Stammdaten (angeheftet)
  source?: string
  text: string
}

export const SERVER_STECKBRIEF_SEED: SteckbriefSeed[] = [
  // ══ HCI-Plattform ═══════════════════════════════════════════════════════════
  { host: 'CL0128', role: true, source: 'WB → Server & RZ', text: 'Azure-Local-/HCI-Cluster „Marine Hamburg". Trägt ~30 VMs (Windows/Linux/Backup). 4 Hyper-V-Knoten W3135–W3138 (HPE ProLiant DL385 Gen10 Plus, AMD EPYC 7402 24-Core), Serverraum E15, Hermann-Blohm-Str. 5; bei Firmware-Updates zusätzlich W3153. Betreuung: DXC HCI-Team Malaysia + Wintel Indien + Backup Bulgarien; Hardware HPE; vor Ort Davide Bazzani, Sascha Herges, Karsten Bandlow.' },
  { host: 'CL0128', date: '2025-11-08', source: 'Mail CHG1395313', text: 'Für das Switch-IOS-Upgrade CHG1395313 alle Cluster-Server heruntergefahren; DXC stellte HCI-Kollegen für Power-off/-on.' },
  { host: 'CL0128', date: '2025-12-07', source: 'WB → Server & RZ', text: 'Reboots im Cluster; Ursache Switch-Upgrade CHG1395218, nicht die Hardware.' },
  { host: 'CL0128', date: '2026-01-26', source: 'RFC, Sunil Patel', text: 'DXC ergänzte im RFC die vollständige Server-/VM-Liste (av0013, cl0128, ddgeham01, dxcburtest01, w3139, w3142–w3152, w3161, w3163–w3169, w3172–w3174, w3294, w3336, w3366).' },
  { host: 'CL0128', date: '2026-01-31', source: 'CHG1461723/CHG0075218', text: 'USV-Test mit Stromausfall-Simulation. DXC band Linux- und Backup-Team ein (Cluster hostet auch deren VMs). Vorlauf für DXC: 1,5 h vor Power-off.' },
  { host: 'CL0128', date: '2026-02-13', source: 'Mail „Hamburg IT Infra"', text: 'Kapazitäts-Review: W3136 wieder in den Pool, 6 weniger kritische VMs dorthin. Verteilung: W3135=11, W3137=10, W3138=11, W3136=6 VMs.' },
  { host: 'CL0128', date: '2026-03-14', source: 'CHG0076257/CHG1494209', text: 'Firmware-/Treiberupdate aller Knoten (w3135–w3138 + w3153) durch Nicolas Chong, rollierend ohne VM-Downtime (14.–16.03.2026).' },
  { host: 'CL0128', date: '2026-05-01', source: 'Mail „w3135 Unexpected reboot"', text: 'VM-Platzierungsregel nach den W3135-Problemen: W3135 trägt nur noch 6 unkritische VMs; kritische Server (W3161, W3168, W3151, W3172, W3142, W3434) nur auf W3136/W3137/W3138. Auto-Balancing abgeschaltet.' },
  { host: 'CL0128', date: '2026-08-25', source: 'Mail „SQL Servers Stucks"', text: 'DXC bestätigt Standardvorgehen bei Knotenarbeiten: erst Wartungsmodus, dann Migration aller VMs auf übrige Knoten, dann Arbeit. Dauerthema seit Ende 2025: wiederkehrende unerwartete Reboots (Uncorrectable Machine Check Exceptions), trotz CPU-/Board-/Firmware-Tausch bis 08/2026 nicht endgültig gelöst.' },

  { host: 'W3135', role: true, source: 'WB → USV', text: 'HCI-Knoten 1. HPE ProLiant DL385 Gen10 Plus, S/N CZ2119035X. Seit 05/2026 nur noch 6 unkritische VMs (Live-Migration deaktiviert).' },
  { host: 'W3135', date: '2026-02-19', source: 'INC2732552', text: 'HP Hardware Monitoring Event ID 2825, ausgelöst durch ungeplanten Ausfall eines Server-Stromkreises bei Schneider-Electric-Wartung.' },
  { host: 'W3135', date: '2026-05-22', source: 'Mail, Riza Saberi', text: 'Unerwarteter Reboot, alle VMs betroffen. DXC-Healthchecks nach ABO; Knoten blieb im Cluster (kein Hardwarefehler gefunden).' },
  { host: 'W3135', date: '2026-05-29', source: 'Mail „w3135 Unexpected reboot"', text: 'Entscheidung: W3135 hostet künftig nur 6 unkritische VMs (W3173, W3446, W3367, X0378, DXCBURTest01, AV0013; optional W3139, W3336, W3472). Live-Migration/Auto-Balancing aus.' },
  { host: 'W3135', date: '2026-06-06', source: 'WB → Server & RZ', text: 'BIOS-/Firmware-Update genehmigt (16–18 Uhr CET), wegen Change-Freeze verschoben.' },

  { host: 'W3136', role: true, source: 'Mail „HPE Support Case 5402263296"', text: 'HCI-Knoten 2. HPE ProLiant DL385 Gen10 Plus, S/N CZ2119035T, iLO 10.170.32.6. Kritischer Knoten.' },
  { host: 'W3136', date: '2025-11-26', source: 'Mail HCI Cluster CL0128', text: 'Unerwarteter Host-Reboot, 9 VMs betroffen (W3150, W3168, W3172, W3173, W3174, W3294, W3336, W3367, W3472). HA funktionierte (Fast-Restart). HPE-Hardware-Case eröffnet.' },
  { host: 'W3136', date: '2026-02-13', source: 'Mail „Hamburg IT Infra"', text: 'Nach längerer Maintenance wieder im Pool, 6 weniger kritische VMs migriert.' },
  { host: 'W3136', date: '2026-02-19', source: 'INC2732553', text: 'Event ID 2825 im Zuge des Stromkreis-Ausfalls.' },
  { host: 'W3136', date: '2026-04-22', source: 'HPE-Case 5402263296', text: 'Techniker vor Ort: Guido Naepelt (HPE CDS), 19:00 — tauschte beide CPUs (2× P17336-001, EPYC 7402).' },
  { host: 'W3136', date: '2026-04-29', source: 'CHG1529280', text: 'Techniker vor Ort: Markus Gettkant (HPE) — Fehler erneut → Tausch Systemboard + CPU2 „auf Nummer sicher". W3136 offline, VMs auf anderen Knoten.' },
  { host: 'W3136', date: '2026-05-05', source: 'Mail „Server Upgrade W3294 RAM"', text: 'Rückkehr aus Maintenance schuf die Kapazität für das RAM-Upgrade von W3294.' },
  { host: 'W3136', date: '2026-08-14', source: 'Mail „Unexpected reboot … W3136"', text: 'Erneuter unerwarteter Reboot, 7 VMs betroffen (W3146, W3151, W3147, W3294, W3172, W3567, W3167). Folge: enaio-Lizenz auf W3168 gesperrt → W3168 und W3161 neu gestartet (W3161 hing, 2. Neustart).' },
  { host: 'W3136', date: '2026-08-13', source: 'Mail „HPE Case 5404542413"', text: 'HPE-Case 5404542413 eröffnet: Firmware Storage-Controller P816i-a SR Gen10 auf 8.23.' },
  { host: 'W3136', date: '2026-08-17', source: 'WB → Server & RZ', text: 'Davide fordert dokumentierte Root-Cause-Analyse (Ursache, Hardware/Firmware/Software, Prävention, Risiko andere Knoten). Antwort am 25.08.2026 noch aus.' },
  { host: 'W3136', date: '2026-08-25', source: 'CHG1629976/CHG0080134', text: 'Emergency Change 18:00–00:00 CET für das Controller-Firmware-Update. Reihenfolge (Riza Saberi): erst CPU-Tausch W3137 abschließen, 1 Tag beobachten, dann W3136.' },

  { host: 'W3137', role: true, source: 'Mail INC44042585', text: 'HCI-Knoten 3. HPE ProLiant DL385 Gen10 Plus, S/N CZ2119035V; Netzwerk über Marvell-25-GbE-Adapter in PCIe-Slot 3. Kritischer Knoten.' },
  { host: 'W3137', date: '2026-02-19', source: 'INC2732549', text: 'Event ID 2825 im Zuge des Stromkreis-Ausfalls.' },
  { host: 'W3137', date: '2026-07-15', source: 'INC44042585 / HPE 5404310013', text: 'NIC Port 2 down. Local Field Support fand keine losen Kabel. DXC schrieb wochenlang ausgeschiedene Kollegen (Tesch/Grosskopf) statt Davide an.' },
  { host: 'W3137', date: '2026-08-03', source: 'Mail INC44042585', text: 'Vor Ort: Davide prüfte den Knoten (identifiziert über S/N CZ2119035V), inspizierte die Verkabelung am Marvell-Adapter; VMs vorher evakuiert.' },
  { host: 'W3137', date: '2026-08-04', source: 'HPE-Case 5404310013', text: 'Lösung vor Ort: Davide tauschte die SFP-Transceiver zwischen Port 1 und Port 2 (PCIe-Slot 3) → Adapter 2 wieder ok, Failover Cluster Manager grün.' },
  { host: 'W3137', date: '2026-08-15', source: 'Mail „Unexpected reboot … W3137"', text: 'Unerwarteter Host-Reboot, 9 VMs betroffen (W3143, W3148, W3150, W3151, W3166, W3167, W3168, W3172, W3294). Healthcheck ohne Befund. HPE-Case 5404554752 eröffnet.' },
  { host: 'W3137', date: '2026-08-19', source: 'Mail „HPE Case 5404554752"', text: 'MCTP Discovery als Zwischenmaßnahme deaktiviert. Terminvorschlag HPE CDS: Reparatur 24.08. ~18:00 CET, Techniker Guido Naepelt (+49 171 3357533), Koordination Valentina Metodieva (dispi.nord@hpe.com).' },
  { host: 'W3137', date: '2026-08-24', source: 'CHG1628262/CHG0080106', text: 'Techniker vor Ort ab 18:00 CET: CPU-Tausch.' },
  { host: 'W3137', date: '2026-08-25', source: 'Mails „5404554752"/„SQL Servers Stucks"', text: 'ESKALIERT: Host startet nahezu stündlich neu, begann kurz nach dem Hardwaretausch. POST ASR standardmäßig aus — offene Rückfrage an HPE. Microsoft-Case 2608250030002364 eröffnet. Derzeit keine VMs auf dem Knoten (verteilt auf W3135/36/38).' },
  { host: 'W3137', date: '2026-08-25', source: 'Aktenlage', text: 'Korrektur: Case 5404554752 = W3137 (CZ2119035V), 5404542413 = W3136 (CZ2119035T). In älteren Einträgen war 5404554752 fälschlich W3136 zugeordnet.' },

  { host: 'W3138', role: true, source: 'WB → USV', text: 'HCI-Knoten 4. HPE ProLiant DL385 Gen10 Plus, S/N CZ2119035W. Kritischer Knoten.' },
  { host: 'W3138', date: '2026-02-19', source: 'INC2732551', text: 'Event ID 2825 im Zuge des Stromkreis-Ausfalls.' },
  { host: 'W3138', date: '2026-03-02', source: 'Mail „Multiple Unexpected reboot alert"', text: 'Unerwarteter Host-Reboot, 10 VMs betroffen (W3147, W3164, W3568, W3169, W3166, W3161, W3472, W3142, W3366, W3294). HPE empfahl SPP-/Firmware-Upgrade aller Hosts; Sascha Herges monierte die Häufung.' },
  { host: 'W3138', date: '2026-08-21', source: 'Mail „HPE Case 5404542413"', text: 'DXC erwog Controller-Firmware auf allen Knoten (w3135/37/38); nach HPE-Rücksprache blieb es bei W3136.' },

  { host: 'W3153', role: true, source: 'CHG0076257', text: 'Zählt bei Firmware-Updates zum Cluster (14.03.2026 mit w3135–w3138 geführt). Rolle sonst nicht dokumentiert.' },

  // ══ Produktive VMs ══════════════════════════════════════════════════════════
  { host: 'W3139', role: true, source: 'WB → Sonstiges', text: 'Rolle nicht dokumentiert. IP 10.170.32.27.' },
  { host: 'W3139', date: '2025-10-09', source: 'REQ0796681', text: 'Security Exception: lokales Konto ASRmigrator (Admin) für die Migrationsphase (Migration nicht über CAPAM möglich). Gleiche Ausnahme auf w3144, w3163, w3169, w3425, x0360. Später „Closed Incomplete".' },
  { host: 'W3139', date: '2026-02-19', source: 'Mail „Disk Capacity risks"', text: 'Disk-Kapazitätsrisiko (E:); durch Aufräumen gelöst, keine Erweiterung nötig.' },
  { host: 'W3139', date: '2026-05-29', source: 'Mail „w3135 Unexpected reboot"', text: 'Als zusätzlich auf W3135 verschiebbare unkritische VM benannt (mit W3336, W3472).' },

  { host: 'W3142', role: true, source: 'Mail „w3135 Unexpected reboot"', text: 'Rolle nicht dokumentiert, aber von DXC als kritisch eingestuft — läuft nur auf W3136/W3137/W3138.' },
  { host: 'W3142', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },

  { host: 'W3143', role: true, source: 'PB INC2893070/INC2230964', text: 'PortaX-Lizenzverwaltung (SolidWorks); Share \\\\w3143\\PortaX = Laufwerk G:. Betreuer A. Benien.' },
  { host: 'W3143', date: '2025-11-05', source: 'INC2610622/INC40160109', text: 'File-Restore über DXC.' },
  { host: 'W3143', date: '2026-02-14', source: 'CHG0075815/CHG1480413', text: 'Emergency-Patching: keine Patches installierbar auf 5 Servern (w3143, w3152, w3163, w3164, w3166). DXC eröffnete Microsoft-Case.' },
  { host: 'W3143', date: '2026-02-21', source: 'WB → Patching', text: '4 der 5 mit Microsoft-Lösung gepatcht — w3143 blieb fehlerhaft, Logs zurück an Microsoft.' },
  { host: 'W3143', date: '2026-03-14', source: 'CHG0076273/CHG1494417', text: 'Einzel-Patching im Firmware-Fenster 03:00–20:00 CET (Nitin Khapare, DXC).' },
  { host: 'W3143', date: '2026-07-03', source: 'PB INC2893070', text: '„Anmeldung für PortaX geht nicht": Lizenzverwaltung gestoppt und neu gestartet — erledigt.' },
  { host: 'W3143', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },

  { host: 'W3144', role: true, source: 'REQ0796681', text: 'Rolle nicht dokumentiert. IP 10.170.32.33.' },
  { host: 'W3144', date: '2025-10-09', source: 'REQ0796681', text: 'ASRmigrator-Security-Exception (siehe W3139).' },

  { host: 'W3146', role: true, source: 'PB INC2294304', text: 'Babtec Application Server (CAQ/Qualitätsmanagement). Betreuer D. Bazzani / C. Holst.' },
  { host: 'W3146', date: '2024-12-30', source: 'PB INC2294304', text: 'Dienst „Babtec Application Server" wiederholt 100 % CPU-Last; nach Neustart wieder ok (Georg Grosskopf).' },
  { host: 'W3146', date: '2025-09-22', source: 'INC2563117/RITM0867796', text: 'Antimalware-Ausnahme beantragt: Defender bremste Babtec massiv → Pfad-Ausnahme C:\\Program Files\\Babtec GmbH (zweite Ausnahme C:\\PortaX, INC2579421).' },
  { host: 'W3146', date: '2025-12-06', source: 'Mail „Server Upgrade W3146"', text: 'Hardware-Upgrade: RAM 16→32 GB, CPU 8→12 Kerne (06.12., ~1 h Downtime).' },
  { host: 'W3146', date: '2026-08-14', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },

  { host: 'W3147', role: true, text: 'Rolle nicht dokumentiert.' },
  { host: 'W3147', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },
  { host: 'W3147', date: '2026-08-14', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },

  { host: 'W3148', role: true, source: 'PB INC2790193', text: 'HELIOS PrintClient-Server (HiCAD-Zeichnungsdruck). Client-Registry HKLM\\SOFTWARE\\ISD…\\HELIOS PrintClient: Server=W3148, Ext=HSP, PrinterTimer=0x2710. Betreuer A. Benien.' },
  { host: 'W3148', date: '2026-04-09', source: 'PB INC2790193', text: '„Freigabe in HiCAD gestört" — gelöst über die PrintClient-Registry-Werte.' },
  { host: 'W3148', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },

  { host: 'W3149', role: true, source: 'Snapshot 10.08.2026', text: 'PRINT Services für Plossys/Easyprima (mit W3150, W3166). Dienstkonto Seal_Serv_AD (JN56426). Betreuer A. Benien.' },

  { host: 'W3150', role: true, source: 'Snapshot; v2; BRAIN', text: 'PRINT Services für Plossys/Easyprima (mit W3149, W3166). Früher Siemens-NX-Lizenzhost (überholt, aktuell W3152). Betreuer A. Benien.' },
  { host: 'W3150', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3150', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },

  { host: 'W3151', role: true, source: 'Mail „SQL Servers Stucks"', text: 'enaio-Datenbank; SQL-Instanz W3151\\MSS0488. Von DXC als kritisch eingestuft. Betreuer K. Bandlow.' },
  { host: 'W3151', date: '2026-08-14', source: 'Mail „Unexpected reboot … W3136"', text: 'Mit-betroffen vom W3136-Host-Reboot; enaio-Kette danach gezielt neu gestartet (siehe W3168, W3161).' },
  { host: 'W3151', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },
  { host: 'W3151', date: '2026-08-25', source: 'Mail „SQL Servers Stucks"', text: 'Im Zuge der SQL-Hänger geprüft: „everything looks good on the SQL instances W3169 and W3151\\MSS0488".' },

  { host: 'W3152', role: true, source: 'WB → Software', text: 'Lizenzserver EPLAN (EPLSNTETC3, Kd-Nr 154021700) UND Siemens NX (SLS, Port 29000, Composite-ID 65D28AE654F5, Sold-To 10211581). Betreuer D. Bazzani / A. Benien.' },
  { host: 'W3152', date: '2025-11-07', source: 'Mail „EPlan Update Server"', text: 'Vorbereitung EPLAN-Server-Update zum 16.12.2025 (Danny Röhle): aktueller Lizenzmanager auf W3152 nötig; W3172 nicht betroffen.' },
  { host: 'W3152', date: '2026-02-14', source: 'CHG0075815', text: 'Patch-Installationsfehler (einer der 5 Server, siehe W3143).' },
  { host: 'W3152', date: '2026-02-21', source: 'WB → Patching', text: 'Mit Microsoft-Lösung erfolgreich gepatcht.' },
  { host: 'W3152', date: '2026-07-14', source: 'Mail „Lizenzdatei NX 2512"', text: 'Lizenzdatei NX 2512 von Chiron Group (R. Mink) erhalten (~17 GB via SharePoint). Achtung: laut Chiron kein gültiger Softwarewartungsvertrag mehr.' },
  { host: 'W3152', date: '2026-11-30', source: 'WB → Sonstiges', text: 'EPLAN-Lizenzverlängerung bis 30.11.2026.' },

  { host: 'W3161', role: true, source: 'PB M10; WB → Server & RZ', text: 'enaio-Applikationsserver (Appconnector, Gateway, Servicemanager). Kritisch. Betreuer K. Bandlow. Bewährte Lösung bei enaio-Störungen: Kerndienste neu starten, notfalls Reboot (KB0016896).' },
  { host: 'W3161', date: '2025-10-23', source: 'PB INC2602465', text: '„No connection to enaio Server" — gelöst durch Reboot W3161 (A. Benien).' },
  { host: 'W3161', date: '2026-02-19', source: 'Mail „Disk Capacity risks"', text: 'Disk-Kapazitätsrisiko: D: nur 1,2 TB / 18,9 % frei → im März um 500 GB erweitert.' },
  { host: 'W3161', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },
  { host: 'W3161', date: '2026-05-29', source: 'Mail „w3135 Unexpected reboot"', text: 'Als kritischer Server eingestuft; darf nicht auf W3135 laufen.' },
  { host: 'W3161', date: '2026-08-14', source: 'Mail „Unexpected reboot … W3136"', text: 'Nach W3136-Reboot enaio-Lizenz auf W3168 gesperrt → W3168 und W3161 neu gestartet; W3161 hing, 2. Neustart. „W3161 is up now. Health check done."' },

  { host: 'W3163', role: true, source: 'BRAIN Kap. 10', text: 'FlowChief-Applikationsserver (Prozesssteuerung/Energiemonitoring), MSSQL-Instanz W3163\\FLOWCHIEF. Physisch oberster Server im linken Rack. IP 10.170.32.47. DB liegt NICHT hier, sondern auf W3167. Betreuer D. Bazzani.' },
  { host: 'W3163', date: '2025-10-09', source: 'REQ0796681', text: 'ASRmigrator-Security-Exception (siehe W3139).' },
  { host: 'W3163', date: '2025-10-29', source: 'INC2608783', text: 'Full-Backup angefragt. Befund: für Instanz W3163\\FLOWCHIEF kein SQL-Backup konfiguriert (nie beantragt, nicht vom DXC-DBA installiert) — DB lief ohne Datenbank-Backup.' },
  { host: 'W3163', date: '2025-11-03', source: 'INC2614561/INC40267221', text: 'Hardware-Upgrade wegen Performance: RAM 10→16 GB statisch (Incident+Change, kein Katalogprozess).' },
  { host: 'W3163', date: '2026-02-05', source: 'Mail 05.02.2026', text: 'Unerwarteter Neustart („Services and VMs are down"). K. Bandlow: mit Facility prüfen, ob Netzteile an USV und unterschiedlichen Stromkreisen/Phasen hängen (Verdacht Spannungsschwankung/Phasenausfall).' },
  { host: 'W3163', date: '2026-02-14', source: 'CHG0075815', text: 'Patch-Installationsfehler (einer der 5 Server, siehe W3143).' },
  { host: 'W3163', date: '2026-02-21', source: 'WB → Patching', text: 'Mit Microsoft-Lösung erfolgreich gepatcht.' },
  { host: 'W3163', date: '2026-02-24', source: 'Mail „USV Ausfall Donnerstag"', text: 'Sven Meyer: „FlowChief Server W3163 hat regelmäßig kurze Ausfälle, häufig am Wochenende."' },
  { host: 'W3163', date: '2026-07-13', source: 'Mail „FlowChief"', text: 'Klarstellung: Datenbank liegt auf W3167, nicht auf W3163.' },

  { host: 'W3164', role: true, text: 'Rolle nicht dokumentiert.' },
  { host: 'W3164', date: '2026-02-14', source: 'CHG0075815', text: 'Patch-Installationsfehler (einer der 5 Server, siehe W3143); am 21.02. mit Microsoft-Lösung gepatcht.' },
  { host: 'W3164', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },

  { host: 'W3165', role: true, source: 'WB → Server & RZ', text: 'SQL-Server (SQL Server 2019; 2022-Instanz beantragt). Anforderer K. Govindaraju.' },
  { host: 'W3165', date: '2026-02-19', source: 'Mail „Disk Capacity risks"', text: 'Disk-Kapazitätsrisiko auf G:; gelöst durch Löschen alter Backups.' },
  { host: 'W3165', date: '2026-05-06', source: 'Mail „SQL Server Instance 2022"', text: 'Neue SQL-Server-2022-Standard-Instanz parallel zur 2019er angefordert (App nur mit 2022 kompatibel). DXC-Weg: SKF legt ITEN an, dann installiert DXC.' },

  { host: 'W3166', role: true, source: 'Snapshot 10.08.2026', text: 'PRINT Services für Plossys/Easyprima (mit W3149, W3150). Dienstkonto Seal_Serv_AD. Betreuer A. Benien.' },
  { host: 'W3166', date: '2026-02-14', source: 'CHG0075815', text: 'Patch-Installationsfehler (einer der 5 Server, siehe W3143); am 21.02. gepatcht.' },
  { host: 'W3166', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },
  { host: 'W3166', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },

  { host: 'W3167', role: true, source: 'Mail „FlowChief"', text: 'FlowChief-Datenbank, SQL Server 2019 Standard (keine 10-GB-Grenze, MaxSize unbegrenzt, Autogrowth aktiv). Betreuer D. Bazzani.' },
  { host: 'W3167', date: '2026-02-19', source: 'Mail „Disk Capacity risks"', text: 'Disk-Kapazitätsrisiko auf E: und G:; durch Aufräumen gelöst.' },
  { host: 'W3167', date: '2026-07-12', source: 'FlowChief-Ticket #639329', text: '„Datenbank voll": kam vom FlowChief-internen 42-GB-Grenzwert, nicht vom SQL Server. To-do: Grenzwert im PlanExplorer anpassen + überfällige Archivierung nachholen (letztes Archiv Anfang 2024).' },
  { host: 'W3167', date: '2026-08-14', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3167', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },

  { host: 'W3168', role: true, source: 'WB → Server & RZ', text: 'enaio-Lizenzserver. Kritisch. Betreuer K. Bandlow. Bekanntes Verhalten: nach Absturz kann die enaio-Lizenz gesperrt bleiben → W3168 UND W3151 neu starten.' },
  { host: 'W3168', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3168', date: '2026-03-27', source: 'Mail „Hamburg IT infra Review"', text: 'S. Herges: „I am missing W3168 in Azure Local Insights." — Prüfauftrag an DXC; am 17.08.2026 noch offen.' },
  { host: 'W3168', date: '2026-08-14', source: 'Mail „Unexpected reboot … W3136"', text: 'Nach W3136-Reboot Lizenz gesperrt → Neustart W3168 und W3161.' },
  { host: 'W3168', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },

  { host: 'W3169', role: true, source: 'Mail „SQL Servers Stucks"', text: 'SQL-Server; tempdb auf E:\\MSSQLTempDB\\tempdb.mdf. IP 10.170.32.36. Betreuung DXC SQL-Team.' },
  { host: 'W3169', date: '2025-10-09', source: 'REQ0796681', text: 'ASRmigrator-Security-Exception (siehe W3139).' },
  { host: 'W3169', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },
  { host: 'W3169', date: '2026-04-22', source: 'HPE-Case 5402263296', text: 'Im HPE-Case mit aufgeführt.' },
  { host: 'W3169', date: '2026-08-25', source: 'Mail „SQL Servers Stucks"', text: 'Bei den SQL-Hängern: ein I/O-Vorgang auf E:\\MSSQLTempDB\\tempdb.mdf brauchte ~18,2 s. SQL-Instanzen laut DXC ok → Verdacht (K. Bandlow): Ursache im darunterliegenden Storage.' },

  { host: 'W3172', role: true, source: 'BRAIN; Snapshot', text: 'Zentraler Fileserver \\\\W3172\\SKF Marine\\… (alle Netzlaufwerke, u. a. 700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT = Datenbasis des IT Admin Tools). Kritisch. Betreuer D. Bazzani.' },
  { host: 'W3172', date: '2025-09-17', source: 'RITM0853250/RITM0813069', text: 'Neue Fileshares: 700 Application\\708 CNC Programmierung + Ablage Public\\Public\\Davide.' },
  { host: 'W3172', date: '2025-10-09', source: 'RITM0869124', text: 'Fileshare 700 Application\\701 Eplan eingerichtet.' },
  { host: 'W3172', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3172', date: '2026-01-26', source: 'PB INC2320067', text: 'Zugriffsproblem auf Laufwerk I:: Ursache nur fehlende feste Verbindung zu \\\\W3172\\SKF Marine.' },
  { host: 'W3172', date: '2026-02-19', source: 'Mail „Disk Capacity risks"', text: 'Disk-Kapazitätsrisiko: D: nur 4 TB / 15,9 % frei → im März um 250 GB erweitert.' },
  { host: 'W3172', date: '2026-06-08', source: 'WB → NIS2', text: 'NIS2-Dashboard Q1/2026 liegt hier (…\\Public\\Public\\NIS2\\NIS2_Dashboard_Q1_2026_SKF.html); Geschäftsführung stimmte darüber ab.' },
  { host: 'W3172', date: '2026-08-14', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3172', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },

  { host: 'W3294', role: true, source: 'WB → Software', text: 'Vericut-Lizenzserver (CGTech), Hostname W3294.corp.skf.net, MAC 00155D200B68, benötigt Sentinel License Server ≥ V9.8.1. Zusätzlich CNC-Programmierungs-Ablage (I:\\700 Application\\708 CNC Programmierung). Betreuer D. Bazzani.' },
  { host: 'W3294', date: '2025-10-20', source: 'INC2599098/INC40007632', text: 'P1-Restore: Produktionsordner …\\TransferV2 versehentlich gelöscht/verändert; Restore Stand 19.10. (Biser Draganov, DXC). Erfahrung: Restores nicht beschleunigbar, direkter Draht zu Bonameau beschleunigt Ticketannahme.' },
  { host: 'W3294', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3294', date: '2025-12-11', source: 'WB → Sonstiges', text: 'Neue permanente Lizenzkeys Vericut 9.6 (#124939).' },
  { host: 'W3294', date: '2026-02-04', source: 'WB → NIS2', text: 'SSL-Zertifikat w3294.corp.skf.net (Sectigo, 365 Tage) lief am 12.02.2026 ab; Auto-Renewal 30 Tage vorher. Zuständigkeit ging von K. Govindaraju an Davide.' },
  { host: 'W3294', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },
  { host: 'W3294', date: '2026-05-07', source: 'Mail „Server Upgrade W3294 RAM"', text: 'Hardware-Upgrade: RAM auf 32 GB (Kapazität erst nach Rückkehr von W3136 aus Maintenance).' },
  { host: 'W3294', date: '2026-07-02', source: 'WB → Software', text: 'Lizenzdatei Vericut 9.7 erhalten (Module: Verification 2, Multi-Axis 2, AUTO-DIFF 1, Machine Simulation 2, Probing 1). Einspielen noch offen.' },
  { host: 'W3294', date: '2026-08-14', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3294', date: '2026-08-15', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3137-Host-Reboot.' },

  { host: 'W3336', role: true, source: 'WB → Server & RZ', text: 'DirectMC. Braucht regelmäßig Neustart + Versionspflege (Davide). IP 10.170.32.69, Windows Server 2019 (Build 17763).' },
  { host: 'W3336', date: '2025-11-05', source: 'Mail „W3336: DirectMC"', text: 'Davide übernimmt Neustart/Versionspflege von DirectMC (vorher Michael).' },
  { host: 'W3336', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3336', date: '2026-05-24', source: 'Mail „Hardware upgrade W3336"', text: 'Hardware-Upgrade: RAM 4,3→32 GB, CPU ≥4 Kerne (im Patchfenster Sa 15–21 CET). Vorher: 2 logische Kerne, 4,3 GB.' },
  { host: 'W3336', date: '2026-05-21', source: 'INC2844463', text: 'Security-Alert: „IT Admin Tool.exe" (CORP\\bq8069) prüfte Erreichbarkeit von W3336 (Ping/SMB/RPC) → als „Multi-stage Execution & Lateral Movement" klassifiziert; tatsächlich das eigene Admin-Werkzeug.' },
  { host: 'W3336', date: '2026-05-29', source: 'WB → Server & RZ', text: 'Als zusätzlich auf W3135 verschiebbare unkritische VM benannt.' },

  { host: 'W3366', role: true, source: 'WB → Patching', text: 'Flexus Shopfloor. Gruppen „Marine IT Support" (Admins) und „Flexus Shopfloor" (RDP). Betreuer K. Bandlow. BESONDERHEIT: täglicher geplanter Reboot 04:30 CET (Scheduled Task) — kein Störfall.' },
  { host: 'W3366', date: '2025-12-28', source: 'Mail „Unplanned server reboot"', text: 'Gemeldeter „unplanned reboot" war der geplante 04:30-Task.' },
  { host: 'W3366', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },
  { host: 'W3366', date: '2026-05-23', source: 'CHG0077835/CHG1542732', text: 'Patching.' },
  { host: 'W3366', date: '2026-05-26', source: 'WB → Patching', text: 'Störung nach Patching: per RDP nicht erreichbar (Verdacht veralteter DNS-Cache). Shopfloor-Nutzer ab 07:00 CET ausgesperrt; K. Bandlow eskalierte URGENT. DXC (V. Murugeshan) stellte Verbindung wieder her, Berechtigungsgruppen intakt.' },

  { host: 'W3434', role: true, source: 'WB → Patching; WB → Netzwerk', text: 'Valantic WayRTS (Produktionsplanung/-steuerung) mit SQL-DB. Geschäftskritisch. Betreuer M. Hinrichs / K. Bandlow.' },
  { host: 'W3434', date: '2026-05-23', source: 'Mail „Approval Hamburg Patching"', text: 'Ausfall nach Patching CHG0077835/CHG1542732: WayRTS korrupt, verschärft durch Cluster-Ausfall der Vorwoche → „massive disruption". Ursache: ABO-Runbook nicht eingehalten.' },
  { host: 'W3434', date: '2026-06-22', source: 'WB → Patching', text: 'Konsequenz: neue Stop/Start-Prozedur (Dienste per ABO stoppen → patchen → Reboot → per ABO starten). DXC (Vijay Kumar) bestätigte nach Schulung mit K. Bandlow.' },
  { host: 'W3434', date: '2026-06-01', source: 'ITEN0018932/RITM1046297', text: 'Dynatrace-Monitoring (Firewall-Öffnung REQ0952886) konfiguriert. Offen: Downgrade der sysadmin-Logins + SQL-Patch mit Downtime-Freigabe.' },

  { host: 'W3446', role: true, source: 'WB → Netzwerk', text: 'wayRTS-Test-VM mit SQL-DB; im Dynatrace-Monitoring mit W3434. „hosted on premise".' },
  { host: 'W3446', date: '2026-06-01', source: 'ITEN0018932', text: 'Dynatrace-Firewall-Request und Monitoring gemeinsam mit W3434.' },

  { host: 'W3472', role: true, source: 'WB → Server & RZ', text: 'Rolle nicht dokumentiert.' },
  { host: 'W3472', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3472', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },
  { host: 'W3472', date: '2026-05-29', source: 'WB → Server & RZ', text: 'Als zusätzlich auf W3135 verschiebbare unkritische VM benannt.' },

  { host: 'W3425', role: true, source: 'REQ0796681', text: 'Rolle nicht dokumentiert. IP 10.170.32.17.' },
  { host: 'W3425', date: '2025-10-09', source: 'REQ0796681', text: 'ASRmigrator-Security-Exception (siehe W3139).' },

  { host: 'W3567', role: true, source: 'PB INC2566882', text: 'ACME-Zertifikatsdienst geplant (mit W3568/W3569, INC2566882 vom 18.09.2025, A. Benien/K. Bandlow). Ticket geschlossen; neues Ticket bei Wiederaufnahme.' },
  { host: 'W3567', date: '2026-08-14', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3568', role: true, source: 'PB INC2566882', text: 'ACME-Zertifikatsdienst geplant (mit W3567/W3569).' },
  { host: 'W3568', date: '2026-03-02', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3138-Host-Reboot.' },
  { host: 'W3569', role: true, source: 'PB INC2566882', text: 'ACME-Zertifikatsdienst geplant (mit W3567/W3568).' },

  // ══ Test- und Nebensysteme ══════════════════════════════════════════════════
  { host: 'W3173', role: true, source: 'WB → Server & RZ', text: 'enaio-Test. Betreuer K. Bandlow. Läuft im Pilot-Patching (jeden 1. Sonntag nach Microsoft-Patch-Release, 1 Woche vor Produktion).' },
  { host: 'W3173', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3173', date: '2025-12-28', source: 'Mail „Unplanned server reboot"', text: 'Reboot durch systeminitiiertes Security-Update trotz „manuell". DXC deaktivierte Auto-Update; K. Bandlow widersprach (Windows Update NICHT deaktivieren, patcht enaio bewusst außerhalb des Zyklus).' },
  { host: 'W3173', date: '2026-01-18', source: 'WB → Server & RZ', text: 'Pilot-Patching gestartet (bestätigt 14.02.: „W3173 is in Pilot and was updated last week").' },
  { host: 'W3173', date: '2026-05-29', source: 'WB → Server & RZ', text: 'Als eine der 6 unkritischen VMs für W3135 festgelegt.' },

  { host: 'W3367', role: true, source: 'WB → Netzwerk; BRAIN', text: 'Flexus-Test. (In Mail 13.02.2026 versehentlich „W3667".) Betreuer K. Bandlow.' },
  { host: 'W3367', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3367', date: '2026-05-29', source: 'WB → Server & RZ', text: 'Als eine der 6 unkritischen VMs für W3135 festgelegt.' },

  { host: 'X0378', role: true, source: 'Mail „Hamburg IT Infra"', text: 'EWEB-Test. Laut DXC (13.02.2026) die einzige VM in der Testumgebung der Marine-Hamburg-Landschaft.' },
  { host: 'X0378', date: '2025-11-08', source: 'CHG1395313', text: 'Beim Switch-IOS-Upgrade mit heruntergefahren.' },
  { host: 'X0378', date: '2026-05-29', source: 'WB → Server & RZ', text: 'Als eine der 6 unkritischen VMs für W3135 festgelegt.' },

  { host: 'X0360', role: true, source: 'REQ0796681', text: 'Rolle nicht dokumentiert. IP 10.170.32.31.' },
  { host: 'X0360', date: '2025-10-09', source: 'REQ0796681', text: 'ASRmigrator-Security-Exception (siehe W3139).' },
  { host: 'X0360', date: '2025-11-08', source: 'CHG1395313', text: 'Beim Switch-IOS-Upgrade mit heruntergefahren.' },
  { host: 'X0366', role: true, source: 'CHG1395313', text: 'Rolle nicht dokumentiert.' },
  { host: 'X0366', date: '2025-11-08', source: 'CHG1395313', text: 'Beim Switch-IOS-Upgrade mit heruntergefahren.' },

  { host: 'DXCBURTest01', role: true, source: 'Mail „Hamburg IT Infra"', text: 'Vom DXC-Projektteam für temporäre Testzwecke angelegt.' },
  { host: 'DXCBURTest01', date: '2026-05-29', source: 'WB → Server & RZ', text: 'Als eine der 6 unkritischen VMs für W3135 festgelegt.' },

  // ══ Backup und Storage ══════════════════════════════════════════════════════
  { host: 'ddgeham01', role: true, source: 'BRAIN; WB → NIS2', text: 'Data Domain DD6300, Backup-Storage Hamburg. ddgeham01.corp.skf.net, IP 10.170.32.23. KEINE iDRAC. Betreuung DXC Backup Bulgarien. S/N-Diskrepanz ungeklärt: DXC führt CKM01212305224, Gerät zeigt FXTET211400031 / P/N 100-555-367-01.' },
  { host: 'ddgeham01', date: '2026-03-16', source: 'INC6732104', text: 'Ausfall des Management-Links; Backups zeitweise ausgesetzt. Switch skfl-sw-deham-vE15-01 Port gi1/0/7: Port „up", MAC ausgelaufen — „Storage sendet nicht aktiv". Kabelprüfung vor Ort an Davide delegiert.' },
  { host: 'ddgeham01', date: '2026-07-25', source: 'WB → NIS2', text: 'Gerät down, Backups suspendiert.' },
  { host: 'ddgeham01', date: '2026-07-27', source: 'WB → NIS2', text: 'Reboot durch DXC erfolgreich; Ursache Netzwerkproblem / Duplicate IP.' },
  { host: 'ddgeham01', date: '2026-08-03', source: 'Mail „Data Domain down"', text: 'Erneut down: weder Web-GUI noch SSH noch Ping erreichbar. Netzwerkursache in Klärung, Backups betroffen.' },

  { host: 'AV0013', role: true, source: 'BRAIN; WB → Server & RZ', text: 'Avamar-Backup-Appliance. Restore-Anfragen über Gruppe „GIDC EE ITOC BG BURS DXC" (DXC-Referenz INC40xxxxxx).' },
  { host: 'AV0013', date: '2025-11-08', source: 'CHG1395313', text: 'Beim Switch-IOS-Upgrade heruntergefahren; danach „up and running after restart of services".' },
  { host: 'AV0013', date: '2026-05-29', source: 'WB → Server & RZ', text: 'Als eine der 6 unkritischen VMs für W3135 festgelegt.' },

  // ══ Cloud und Remote ════════════════════════════════════════════════════════
  { host: 'W5627', role: true, source: 'WB → Netzwerk', text: 'Azure-VM (nicht Teil des HCI-Clusters).' },
  { host: 'W5627', date: '2026-05-28', source: 'INC43304123/INC2852498', text: 'Alert nach geplantem Reboot von W5627/W5628; legitim, geschlossen.' },
  { host: 'W5627', date: '2026-07-24', source: 'Mail 24.07.2026', text: 'Hardware-Degradation → automatische Azure-Live-Migration mit 1,351 s Pause. Keine Aktion nötig.' },
  { host: 'W5627', date: '2026-08-17', source: 'Mail „Unexpected reboot … W3136"', text: 'Offener Punkt: lief mit vollem F:-Laufwerk fest. DXC meldete Alert, fand aber „enough space". S. Herges: „Is Azure not monitored?" — am 25.08.2026 unbeantwortet.' },
  { host: 'W5628', role: true, source: 'WB → Netzwerk', text: 'Azure-VM (nicht Teil des HCI-Clusters).' },
  { host: 'W5628', date: '2026-05-28', source: 'INC43304123/INC2852498', text: 'Alert nach geplantem Reboot von W5627/W5628; legitim, geschlossen.' },

  { host: 'AVDPRDA-PP-0', role: true, source: 'WB → Server & RZ', text: 'Azure Virtual Desktop Session Host (CAD-Remote-Apps: SolidWorks, HiCAD). Azure N-Series mit GPU (hohe Monatskosten). Projekt „Publish APPS to AVD" mit HCLTech.' },
  { host: 'AVDPRDA-PP-0', date: '2025-09-02', source: 'Mail „Project AVD"', text: 'AVD-Build fertig, SolidWorks-Installation; GPU-VMs laufen seit 02.09.2025 dauerhaft (vorher aus Kostengründen aus).' },
  { host: 'AVDPRDA-PP-1', role: true, source: 'WB → Server & RZ', text: 'Azure Virtual Desktop Session Host (CAD-Remote-Apps). Azure N-Series mit GPU.' },
  { host: 'AVDPRDA-PP-1', date: '2025-10-02', source: 'WB → Server & RZ', text: 'Windows-Update-Fehler (24H2/.NET); PortaX-Registrierung scheiterte an gesperrter cmd-/reg-Ausführung. AVD 1 hatte weiterhin Problem mit G-Laufwerks-Mapping (AVD 0 ok).' },

  { host: 'aznetapp01-4517', role: true, source: 'BRAIN Kap. 4.1', text: 'Azure-NetApp-Freigabe mit der zentralen SAP-GUI-Landschaftsdatei \\\\aznetapp01-4517.corp.skf.net\\SapGui-EndUser\\config\\users\\SAPUILandscape.xml (+ Includes). Jeder SAP-Logon-Start greift darauf zu (Cache „bei jedem Start aktualisieren").' },
  { host: 'aznetapp01-4517', date: '2026-08-25', source: 'eigene Messung', text: 'Gesunder Client: löst auf 10.185.27.244, Ping 22 ms (4/4, 0 % Verlust, TTL 247), DNS W1291.corp.skf.net (163.157.65.204). Lokale Ziele 1–3 ms → Freigabe NICHT im Hamburger LAN.' },

  // ══ Server außerhalb Hamburgs mit Berührungspunkten ═════════════════════════
  { host: 'W1291', role: true, source: 'Messung 25.08.2026', text: 'DNS-Server (auflösender DNS für die Clients), IP 163.157.65.204.' },
  { host: 'W1290', role: true, text: 'Ziel eines Brute-Force-Verdachts, IP 163.157.65.203.' },
  { host: 'W1290', date: '2025-09-26', source: 'INC2575578/INC2573549', text: '507 fehlgeschlagene Kerberos-/NTLM-Anmeldungen von X0507 (163.157.64.39); Konto W. Schmetz (Einkauf) gesperrt, CDO bat um Legitimation.' },
  { host: 'W2154', role: true, source: 'WB → NIS2', text: 'Domänencontroller; Diagnose-Server bei SAP-SSO-Störung.' },
  { host: 'W2154', date: '2026-05-07', source: 'INC2820953', text: 'Bei SAP-SSO-Störung als Diagnose-Server: „Please let us know the patching done on DC W2154 and confirm."' },
  { host: 'W3174', role: true, source: 'WB → NIS2', text: 'Diagnose-Server bei SAP-SSO-Störung.' },
  { host: 'W3174', date: '2025-11-26', source: 'WB → Server & RZ', text: 'Mit-betroffen vom W3136-Host-Reboot.' },
  { host: 'W3174', date: '2026-05-07', source: 'INC2820953', text: 'Mit W2154 als Diagnose-Server bei der SAP-SSO-Störung genannt.' },
  { host: 'W5221', role: true, source: 'WB → NIS2', text: 'Server SKF Lubrication. Betreut von Alexander Geppert-Horsinka.' },
  { host: 'W5221', date: '2026-02-01', source: 'WB → NIS2', text: 'Nach Notepad++-Supply-Chain-Vorfall („Chrysalis") auf 8.9.1 aktualisiert; 05/2026 nach Folge-Advisory (CVE-2026-48770/-48778/-48800) auf 8.9.6.1.' },
  { host: 'W5640', role: true, source: 'WB → NIS2', text: 'Server SKF Lubrication. Betreut von Alexander Geppert-Horsinka.' },
  { host: 'W5640', date: '2026-02-01', source: 'WB → NIS2', text: 'Notepad++ auf 8.9.1, danach 8.9.6.1 aktualisiert („W5640 and W5221 has been updated").' },
  { host: 'X0507', role: true, source: 'WB → NIS2', text: 'Quelle der 507 Fehlanmeldungen gegen W1290 (26.09.2025), IP 163.157.64.39.' },
  { host: 'enaiocore.skf.net', role: true, source: 'PB', text: 'Zentraler enaio-Core-Dienst; die Dokumentenablage aus SAP hängt daran.' },
  { host: 'enaiocore.skf.net', date: '2025-12-11', source: 'PB INC2658409', text: '„Kein Vorgang im enaio beim Angebot-Drucken": Ursache „Disabled VM avx-spoke14-sap-marine-pd-fra-hagw, TLS connection not possible to enaiocore.skf.net".' },
  { host: 'enaiocore.skf.net', date: '2025-10-01', source: 'PB INC2420887', text: '„Keine SAP-Belege im enaio abgelegt" → Ursache: Disks full on Storage.' },
  { host: 'avx-spoke14-sap-marine-pd-fra-hagw', role: true, source: 'PB INC2658409', text: 'Gateway-VM im SAP-Marine-Pfad; ihre Deaktivierung war Ursache des enaio-TLS-Problems vom 11.12.2025.' },
]
