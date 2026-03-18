Build a Windows desktop application for IT administrators using Electron.js + React + TypeScript.
The app runs PowerShell/CMD commands in the background and adapts its UI based on whether
the user has admin privileges or not.

---

## TECH STACK
- Electron.js (main process handles PowerShell/CMD execution)
- React + TypeScript (renderer)
- Tailwind CSS (styling)
- shadcn/ui components
- electron-store (persistent settings)
- xlsx, docx, pdf-parse libraries for file import/export
- nodemailer for email export

---

## DESIGN
- Dark, modern enterprise UI (dark navy/slate theme with blue accents)
- Sidebar navigation with icons
- Responsive layouts with cards and clean typography
- German language UI throughout
- Show/hide features based on admin vs. standard user privilege detection
  (check via PowerShell: `[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match "S-1-5-32-544")`)

---

## SCREEN 1 — HOME / INPUT (Startbildschirm)

Layout: 2-column card grid

### Card 1: Einzelabfrage
- Input field: "Hostname"
- Input field: "Seriennummer" — when focused, show a popup/dropdown:
  - Checkboxes (multi-select): [ ] DE  [ ] DEHAM  [ ] DESCH  [ ] Sonstige (opens free-text field)
  - The selected prefix(es) get prepended to the serial number to form the hostname
  - e.g. serial "12345678" + "DEHAM" → "DEHAM12345678"

### Card 2: Liste erstellen
- Two sub-sections: one for Hostnames, one for Seriennummern
- Dynamic list with [+] button to add rows
- Each Seriennummer row: same prefix popup as above (DE, DEHAM, DESCH, Sonstige)
- [−] button to remove rows
- Import button per section (see Card 3)

### Card 3: Datei-Import
- Button: "Datei importieren" (accepts .xlsx, .xls, .csv, .docx, .pdf)
- On Excel/CSV import: show a column-selector dialog
  - Display detected column headers
  - User selects which column(s) contain Hostnames or Seriennummern
  - Smart detection: also auto-detect columns named "Serial Number", "PC-Name",
    "Seriennummer", "Hostname", "Computer", "Device", "Asset", "SN", "Name" etc.
    (case-insensitive, fuzzy match)
- On Word/PDF import: extract text, use regex to find serial/hostname patterns automatically
- Imported values populate the list in Card 2

### Bottom: Primary CTA Button
- Large button: "Zur Abfrage →"
- Only active when at least one hostname or serial number is entered

---

## SCREEN 2 — ABFRAGE-MENÜ (Query Menu)

Triggered after clicking "Zur Abfrage". Shows all selected devices.
Each query item has a CHECKBOX (multi-select). User selects desired queries, then clicks "Abfrage starten".

Organize into collapsible accordion sections:

### 🌐 Netzwerk & Erreichbarkeit
- [ ] Gerät online? (ping -n 2)
- [ ] IP-Adresse (Resolve-DnsName / Test-Connection)
- [ ] MAC-Adresse (Get-NetAdapter via WMI)
- [ ] Netzwerkadapter & Verbindungstyp
- [ ] Offene Ports prüfen (Test-NetConnection)
- [ ] DNS-Einträge
- [ ] Letztes Online-Datum (lastLogonTimestamp aus AD)
- [ ] VPN-Status (Get-VpnConnection)

### 💻 System & Hardware (ADMIN ONLY)
- [ ] Betriebssystem & Build-Version (Get-ComputerInfo)
- [ ] CPU-Auslastung live (Get-Counter)
- [ ] RAM-Auslastung (Get-CimInstance Win32_OperatingSystem)
- [ ] Festplatten & freier Speicher (Get-PSDrive / Get-Disk)
- [ ] BIOS/UEFI Version & Seriennummer (Get-WmiObject Win32_BIOS)
- [ ] Uptime / Letzter Neustart
- [ ] Modell & Hersteller (Win32_ComputerSystem)
- [ ] Installierte RAM-Module (Win32_PhysicalMemory)
- [ ] CPU-Modell & Kerne

### 🔐 Active Directory & Benutzer (ADMIN ONLY)
- [ ] Aktuell angemeldeter Benutzer (quser / Get-WmiObject)
- [ ] AD-Computerobjekt Details
- [ ] OU-Zugehörigkeit
- [ ] Letzte AD-Synchronisation
- [ ] BitLocker Status (manage-bde -status)
- [ ] Gruppenrichtlinien (gpresult /r)
- [ ] Lokale Administratoren (Get-LocalGroupMember)
- [ ] Computerzertifikate

### 🛡️ Sicherheit & Compliance (ADMIN ONLY)
- [ ] Windows Defender Status (Get-MpComputerStatus)
- [ ] Firewall Status (Get-NetFirewallProfile)
- [ ] Ausstehende Windows Updates (Get-WUList via PSWindowsUpdate)
- [ ] Letzte Windows Updates (Get-HotFix)
- [ ] UAC Status
- [ ] Autostart-Programme (Get-CimInstance Win32_StartupCommand)
- [ ] Laufende Dienste (Get-Service)

### 📦 Software & Anwendungen (ADMIN ONLY)
- [ ] Installierte Software (Get-WmiObject Win32_Product oder Registry-Abfrage)
- [ ] Office-Version & Lizenz
- [ ] Zuletzt installierte Programme
- [ ] Geplante Tasks (Get-ScheduledTask)

### 📅 Ereignisprotokoll (ADMIN ONLY)
- [ ] Letzte Fehler-Events (Get-EventLog -Newest 20 -EntryType Error)
- [ ] Login-Ereignisse (Security Log 4624/4625)
- [ ] Letzte Abstürze / BSOD (System Log)

---

## SCREEN 3 — ERGEBNIS-ANZEIGE

After queries run, show results in a clean table/card layout per device.

### Export Options (shown as button group):
- [📊 In Programm anzeigen] — default, scrollable table in app
- [📁 Excel Export] — xlsx with one sheet per query category
- [📄 Word Export] — formatted .docx report
- [🖨️ PDF Export] — styled PDF report
- Speicherort: file path picker dialog

### Email Option:
- Button: [📧 Per E-Mail versenden]
- Opens dialog: To, CC, Subject (pre-filled), attach export file
- Uses system default mail client (mailto: protocol) OR nodemailer SMTP config

---

## SCREEN 4 — DIENSTHANDY / XELION CHECK

Sidebar nav item: "📱 Diensthandy & Xelion"

### Eingabe (3 options, tabbed):
- Tab 1: Einzelabfrage — Name oder Corp-ID eingeben
- Tab 2: Liste — dynamische Liste wie auf Screen 1
- Tab 3: Alle Mitarbeiter — Standort-Filter: "Hamburg - Hermann Blohm Strasse"
  (query AD: filter by Office attribute)

### Abfrage-Optionen (checkboxes):
- [ ] Alle hinterlegten Rufnummern anzeigen (AD attributes: telephoneNumber, mobile, ipPhone)
- [ ] "Kein Xelion Account aber Diensthandy vorhanden"
      — show users who have a value in "mobile" but nothing in "telephoneNumber" (Allgemein/General tab)
- [ ] Passwort zuletzt zurückgesetzt (AD attribute: pwdLastSet)

Results shown in table, same export options as Screen 2.

---

## SCREEN 5 — TRICKKISTE (IT-Problemlösung)

Sidebar nav item: "🧰 Trickkiste"

Static knowledge base, rendered as collapsible accordion.
Structure the content with these categories and populate with the most common
real-world IT issues and their concise solutions:

### 💼 Microsoft 365 Apps
#### Outlook
- Outlook startet nicht / hängt beim Laden
- Passwort-Abfrage erscheint ständig
- Kalender synchronisiert nicht
- Signatur fehlt nach Update
- OST-Datei beschädigt (ScanPST)
- Outlook zeigt "Verbindung wird hergestellt" dauerhaft

#### Teams
- Teams startet nicht / weißer Bildschirm
- Kamera/Mikrofon wird nicht erkannt
- Teams-Cache leeren (Pfad: %appdata%\Microsoft\Teams)
- Benachrichtigungen kommen nicht
- Status bleibt auf "Abwesend" hängen

#### OneDrive
- Synchronisation stoppt / Fehler
- "Dateien auf Abruf" Probleme
- OneDrive de- und neu verknüpfen

### 🖥️ Windows Allgemein
- PC friert ein / reagiert nicht (RAM, Prozesse prüfen, SFC /scannow)
- Langsamer Start (Autostart-Programme, Dienste)
- Windows Update hängt / schlägt fehl
- Bluescreen (BSOD) — Ursache ermitteln (WinDbg, Event Viewer)
- Druckerprobleme (Treiber, Spooler-Reset)
- Ton funktioniert nicht
- USB-Gerät wird nicht erkannt

### 🌐 Netzwerk & Internet
- Kein Internetzugang (ipconfig /release /renew, DNS flush)
- VPN verbindet nicht
- Netzlaufwerk nicht erreichbar
- WLAN verbindet sich nicht automatisch
- Proxy-Einstellungen Probleme

### 🔐 Sicherheit & Anmeldung
- Benutzer gesperrt (AD Unlock)
- Passwort vergessen / abgelaufen
- MFA-Probleme (Authenticator App)
- BitLocker Recovery Key anfordern
- "Vertrauensstellung zwischen Arbeitsstation und Domäne fehlgeschlagen"
  → Solution: netdom resetpwd oder PC aus Domäne/wieder einbinden

### 🖨️ Drucker & Hardware
- Drucker offline
- Druckspooler zurücksetzen (net stop spooler, del spool files, net start spooler)
- Treiber neu installieren
- Scanner wird nicht erkannt

### 📱 Mobile Geräte
- Exchange-Konto auf Handy einrichten
- MDM-Enrollment Probleme
- Diensthandy zurücksetzen (Remote Wipe über MDM)

Add a search bar at the top of Trickkiste that filters across all categories in real-time.

---

## SCREEN 6 — EINSTELLUNGEN (Settings)

Sidebar nav item: "⚙️ Einstellungen"
- SMTP-Server Konfiguration (für E-Mail-Versand)
- Standard-Exportpfad festlegen
- AD-Domain / LDAP-Verbindungseinstellungen
- App-Theme (Dark/Light)
- Über das Programm (Version, Info)

---

## FOLDER STRUCTURE
/
├── electron/
│   ├── main.ts          (Electron main process)
│   ├── preload.ts       (IPC bridge)
│   └── powerShellRunner.ts  (executes PS commands safely)
├── src/
│   ├── components/
│   ├── screens/
│   │   ├── Home.tsx
│   │   ├── QueryMenu.tsx
│   │   ├── Results.tsx
│   │   ├── XelionCheck.tsx
│   │   ├── Trickkiste.tsx
│   │   └── Settings.tsx
│   ├── store/           (app state)
│   ├── utils/
│   │   ├── fileImport.ts
│   │   ├── exportUtils.ts
│   │   └── adUtils.ts
│   └── App.tsx
├── package.json
└── electron-builder.config.js

---

## IMPORTANT IMPLEMENTATION NOTES
1. PowerShell commands run via `child_process.spawn('powershell', [...])` in main process
2. IPC channels: renderer → main for all PS execution (security boundary)
3. Admin detection on app start; store result in app state
4. All PS commands should have timeout handling (30s default) and error catching
5. Show loading spinners during query execution
6. For multi-device queries, run in parallel with Promise.all and show progress
7. Sensitive AD queries only exposed when isAdmin === true
8. Use electron-builder for packaging as .exe installer
