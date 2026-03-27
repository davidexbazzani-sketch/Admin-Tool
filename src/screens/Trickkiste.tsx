import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'

interface Solution {
  problem: string
  steps: string[]
  commands?: string[]
}

interface SubCategory {
  name: string
  items: Solution[]
}

interface Category {
  icon: string
  name: string
  subcategories?: SubCategory[]
  items?: Solution[]
}

const KNOWLEDGE_BASE: Category[] = [
  {
    icon: '💼',
    name: 'Microsoft 365 Apps',
    subcategories: [
      {
        name: 'Outlook',
        items: [
          {
            problem: 'Outlook startet nicht / hängt beim Laden',
            steps: [
              'Outlook im abgesicherten Modus starten: outlook.exe /safe',
              'Add-ins deaktivieren: Datei → Optionen → Add-Ins → COM-Add-Ins → Alle deaktivieren',
              'Outlook-Profil reparieren: Systemsteuerung → Mail → Profile anzeigen',
              'Office Quick Repair ausführen: Systemsteuerung → Programme → Microsoft 365 → Ändern → Schnellreparatur',
            ],
            commands: ['outlook.exe /safe', 'outlook.exe /resetnavpane'],
          },
          {
            problem: 'Passwort-Abfrage erscheint ständig',
            steps: [
              'Anmeldedaten aus Windows Credential Manager löschen: Start → Anmeldeinformationsverwaltung → Windows-Anmeldeinformationen → Alle "MicrosoftOffice*" Einträge entfernen',
              'Modern Authentication prüfen: HKCU\\Software\\Microsoft\\Office\\16.0\\Common\\Identity → EnableADAL = 1',
              'Office abmelden und neu anmelden: Datei → Office-Konto → Abmelden',
            ],
            commands: ['cmdkey /list', 'cmdkey /delete:MicrosoftOffice*'],
          },
          {
            problem: 'Kalender synchronisiert nicht',
            steps: [
              'Outlook neu starten und auf Sync warten (bis zu 5 Minuten)',
              'Ordner manuell senden/empfangen: F9 drücken',
              'Exchange-Verbindung prüfen: Datei → Info → Verbindungsstatus',
              'Outlook-Profil löschen und neu erstellen',
              'Cached Exchange Mode deaktivieren und reaktivieren',
            ],
          },
          {
            problem: 'Signatur fehlt nach Update',
            steps: [
              'Signaturen manuell prüfen: %appdata%\\Microsoft\\Signatures',
              'Outlook-Add-In für Signaturen (z.B. Exclaimer) neu starten',
              'Registry-Schlüssel prüfen: HKCU\\Software\\Microsoft\\Office\\16.0\\Common\\MailSettings',
            ],
          },
          {
            problem: 'OST-Datei beschädigt (ScanPST)',
            steps: [
              'Outlook schließen',
              'ScanPST.exe ausführen: C:\\Program Files\\Microsoft Office\\root\\Office16\\SCANPST.EXE',
              'OST-Datei auswählen (Pfad: %localappdata%\\Microsoft\\Outlook\\)',
              'Reparatur durchführen und Outlook neu starten',
              'Falls nicht möglich: OST-Datei löschen, Outlook öffnet dann automatisch neue Datei',
            ],
            commands: ['%localappdata%\\Microsoft\\Outlook'],
          },
          {
            problem: 'Outlook zeigt "Verbindung wird hergestellt" dauerhaft',
            steps: [
              'Netzwerkverbindung prüfen',
              'Exchange-Server per Ping testen',
              'Outlook im Online-Modus starten: Senden/Empfangen → Offline arbeiten (deaktivieren)',
              'Autodiscover prüfen: outlook.exe /Autodiscover email@domain.de',
              'DNS-Einträge für Exchange prüfen',
            ],
            commands: ['outlook.exe /Autodiscover user@domain.de'],
          },
        ],
      },
      {
        name: 'Microsoft Teams',
        items: [
          {
            problem: 'Teams startet nicht / weißer Bildschirm',
            steps: [
              'Teams-Cache leeren (Ordner löschen): %appdata%\\Microsoft\\Teams',
              'Teams-Prozesse beenden: taskkill /F /IM Teams.exe',
              'Teams neu installieren',
              'Windows WebView2 Runtime aktualisieren',
            ],
            commands: ['taskkill /F /IM Teams.exe', 'del /q /s "%appdata%\\Microsoft\\Teams\\Cache\\*"'],
          },
          {
            problem: 'Kamera/Mikrofon wird nicht erkannt',
            steps: [
              'Windows-Datenschutzeinstellungen prüfen: Einstellungen → Datenschutz → Kamera/Mikrofon → Teams erlauben',
              'Treiber aktualisieren: Geräte-Manager → Kameras / Audio',
              'Teams-Cache leeren',
              'Andere App testen (Kamera-App) um Hardware-Fehler auszuschließen',
            ],
          },
          {
            problem: 'Teams-Cache leeren',
            steps: [
              'Teams vollständig beenden (Taskleiste → rechtsklick → Beenden)',
              'Cache-Ordner löschen: %appdata%\\Microsoft\\Teams\\Cache',
              'Weitere Ordner: blob_storage, databases, GPUCache, IndexedDB, Local Storage, tmp',
              'Teams neu starten',
            ],
            commands: ['%appdata%\\Microsoft\\Teams'],
          },
          {
            problem: 'Benachrichtigungen kommen nicht',
            steps: [
              'Windows-Benachrichtigungen prüfen: Einstellungen → System → Benachrichtigungen → Teams aktivieren',
              'Teams-Benachrichtigungseinstellungen: Profilein stellungen → Benachrichtigungen',
              'Ruhestatus/Fokus-Modus in Windows prüfen',
              'Teams-Status prüfen (nicht "Nicht stören")',
            ],
          },
          {
            problem: 'Status bleibt auf "Abwesend" hängen',
            steps: [
              'Status manuell setzen: Profilbild → Status → Verfügbar',
              'Status zurücksetzen: "Status-Nachricht" → Löschen',
              'Teams-Cache leeren',
              'Teams-App abmelden und neu anmelden',
            ],
          },
        ],
      },
      {
        name: 'OneDrive',
        items: [
          {
            problem: 'Synchronisation stoppt / Fehler',
            steps: [
              'OneDrive-Symbol in Taskleiste anklicken → Fehlermeldung lesen',
              'OneDrive neu starten: taskkill /F /IM OneDrive.exe, dann neu starten',
              'Dateinamen prüfen: Sonderzeichen, zu lange Pfade (>255 Zeichen)',
              'Speicherplatz prüfen (OneDrive und lokale Festplatte)',
              'OneDrive-Diagnose: OneDrive /reset',
            ],
            commands: ['taskkill /F /IM OneDrive.exe', '%localappdata%\\Microsoft\\OneDrive\\OneDrive.exe /reset'],
          },
          {
            problem: '"Dateien auf Abruf" Probleme',
            steps: [
              'Datei-Explorer → OneDrive → rechtsklick auf Ordner → "Immer auf diesem Gerät behalten"',
              'Online-only Dateien offline verfügbar machen',
              'Netzwerkverbindung sicherstellen',
            ],
          },
          {
            problem: 'OneDrive de- und neu verknüpfen',
            steps: [
              'OneDrive-Symbol → Einstellungen → Konto → Verknüpfung mit PC aufheben',
              'Erneut anmelden mit Microsoft-Konto',
              'Synchronisierungsordner auswählen',
              'Initiale Synchronisation abwarten',
            ],
          },
        ],
      },
    ],
  },
  {
    icon: '🖥️',
    name: 'Windows Allgemein',
    items: [
      {
        problem: 'PC friert ein / reagiert nicht',
        steps: [
          'Strg+Alt+Entf → Task-Manager öffnen → Nicht reagierende Prozesse beenden',
          'RAM-Auslastung prüfen: Task-Manager → Leistung',
          'Systemdatei-Reparatur: sfc /scannow (als Administrator)',
          'DISM-Tool: DISM /Online /Cleanup-Image /RestoreHealth',
          'Ereignisanzeige auf Fehler prüfen',
          'RAM-Test: mdsched.exe',
        ],
        commands: ['sfc /scannow', 'DISM /Online /Cleanup-Image /RestoreHealth', 'mdsched.exe'],
      },
      {
        problem: 'Langsamer Start (Autostart-Programme)',
        steps: [
          'Task-Manager → Autostart → Unnötige Programme deaktivieren',
          'Dienste prüfen: msconfig → Dienste → Nicht-Microsoft-Dienste deaktivieren',
          'Datenträger prüfen: chkdsk /f (nach Neustart)',
          'SSD-Gesundheit prüfen (CrystalDiskInfo)',
          'Windows-Suchindex neu erstellen',
        ],
        commands: ['msconfig', 'chkdsk /f /r'],
      },
      {
        problem: 'Windows Update hängt / schlägt fehl',
        steps: [
          'Windows Update-Problembehandlung ausführen: Einstellungen → System → Problembehandlung',
          'Update-Cache leeren: net stop wuauserv → C:\\Windows\\SoftwareDistribution löschen → net start wuauserv',
          'Windows Update-Dienste neu starten',
          'DISM und SFC ausführen',
        ],
        commands: ['net stop wuauserv', 'net stop bits', 'net start wuauserv', 'net start bits'],
      },
      {
        problem: 'Bluescreen (BSOD) — Ursache ermitteln',
        steps: [
          'Fehlercode notieren (z.B. MEMORY_MANAGEMENT, DRIVER_IRQL)',
          'Ereignisanzeige öffnen: eventvwr → Windows-Protokolle → System → Filter: Kritisch',
          'Minidump analysieren: C:\\Windows\\Minidump → WinDbg verwenden',
          'Zuletzt installierte Treiber/Updates deinstallieren',
          'RAM-Test durchführen: mdsched.exe',
          'WhoCrashed-Tool verwenden für einfache Analyse',
        ],
        commands: ['eventvwr', 'mdsched.exe', 'verifier /query'],
      },
      {
        problem: 'Druckerprobleme (Treiber, Spooler-Reset)',
        steps: [
          'Druckerspooler neu starten: net stop spooler → Inhalt von C:\\Windows\\System32\\spool\\PRINTERS löschen → net start spooler',
          'Drucker entfernen und neu hinzufügen',
          'Treiber neu installieren (vom Hersteller)',
          'Drucker-Status prüfen: online/offline',
        ],
        commands: ['net stop spooler', 'net start spooler'],
      },
      {
        problem: 'Ton funktioniert nicht',
        steps: [
          'Lautsprecher-Symbol in Taskleiste → rechtsklick → Audioprobleme beheben',
          'Audiogerät prüfen: Geräte-Manager → Audio',
          'Windows-Audiodienst neu starten: services.msc → Windows Audio',
          'Standard-Audiogerät festlegen: Systemsteuerung → Sound',
          'Realtek/Audiotreiber neu installieren',
        ],
        commands: ['services.msc'],
      },
      {
        problem: 'USB-Gerät wird nicht erkannt',
        steps: [
          'Anderen USB-Anschluss versuchen',
          'Gerät an anderem PC testen',
          'USB-Controller im Geräte-Manager → deinstallieren und neu starten',
          'Energieverwaltung prüfen: USB-Hub → Eigenschaften → Energieverwaltung → "Gerät kann ausgeschaltet werden" deaktivieren',
          'USB-Treiber aktualisieren',
        ],
      },
    ],
  },
  {
    icon: '🌐',
    name: 'Netzwerk & Internet',
    items: [
      {
        problem: 'Kein Internetzugang',
        steps: [
          'IP-Konfiguration erneuern: ipconfig /release && ipconfig /renew',
          'DNS-Cache leeren: ipconfig /flushdns',
          'TCP/IP zurücksetzen: netsh int ip reset',
          'Winsock zurücksetzen: netsh winsock reset',
          'Router/Switch-Verbindung prüfen',
          'Ping 8.8.8.8 testen',
        ],
        commands: ['ipconfig /release', 'ipconfig /renew', 'ipconfig /flushdns', 'netsh winsock reset', 'ping 8.8.8.8'],
      },
      {
        problem: 'VPN verbindet nicht',
        steps: [
          'Anmeldedaten prüfen',
          'VPN-Dienste prüfen: services.msc → IKE und AuthIP / Routing und RAS',
          'Firewall-Ausnahmen für VPN prüfen',
          'VPN-Verbindung löschen und neu erstellen',
          'VPN-Client neu installieren',
          'IT-Support kontaktieren für Server-seitige Probleme',
        ],
      },
      {
        problem: 'Netzlaufwerk nicht erreichbar',
        steps: [
          'Netzlaufwerk trennen und neu verbinden',
          'Server-Name per Ping testen',
          'Anmeldedaten prüfen: Anmeldeinformationsverwaltung',
          'Freigabe-Berechtigungen prüfen',
          'SMB-Protokollversion prüfen: Get-SmbClientConfiguration',
          'Netzwerk-Profil prüfen (Privat statt Öffentlich)',
        ],
        commands: ['net use', 'net use * /delete', 'ping server-name'],
      },
      {
        problem: 'WLAN verbindet sich nicht automatisch',
        steps: [
          'WLAN-Netzwerk vergessen und neu verbinden',
          'WLAN-Adapter im Geräte-Manager neu starten',
          'Treiber aktualisieren',
          'WLAN-Autoverbindung aktivieren: Netzwerk → Eigenschaften → Automatisch verbinden',
          'netsh wlan delete profile name="Netzwerkname"',
        ],
        commands: ['netsh wlan show profiles', 'netsh wlan delete profile name="WLAN-Name"'],
      },
      {
        problem: 'Proxy-Einstellungen Probleme',
        steps: [
          'Proxy-Einstellungen prüfen: Einstellungen → Netzwerk → Proxy',
          'IE/Edge-Proxy-Einstellungen: Internetoptionen → Verbindungen → LAN-Einstellungen',
          'Automatische Proxy-Erkennung deaktivieren/aktivieren',
          'WPAD-Konfiguration prüfen',
        ],
        commands: ['netsh winhttp show proxy', 'netsh winhttp reset proxy'],
      },
    ],
  },
  {
    icon: '🔐',
    name: 'Sicherheit & Anmeldung',
    items: [
      {
        problem: 'Benutzer gesperrt (AD Unlock)',
        steps: [
          'AD-Benutzer und Computer öffnen (dsa.msc)',
          'Benutzer suchen → rechtsklick → Eigenschaften → Konto → Konto entsperren',
          'PowerShell: Unlock-ADAccount -Identity Benutzername',
          'Ursache der Sperrung ermitteln: Security-Eventlog auf Event-ID 4740 prüfen',
        ],
        commands: ['Unlock-ADAccount -Identity "username"', 'Search-ADAccount -LockedOut | Unlock-ADAccount'],
      },
      {
        problem: 'Passwort vergessen / abgelaufen',
        steps: [
          'AD: Passwort zurücksetzen in AD-Benutzer und Computer',
          'PowerShell: Set-ADAccountPassword -Identity user -Reset -NewPassword (ConvertTo-SecureString "NeuPW!" -AsPlainText -Force)',
          '"Muss Kennwort bei nächster Anmeldung ändern" aktivieren',
          'Benutzer informieren und temporäres Passwort mitteilen',
        ],
        commands: ['Set-ADAccountPassword -Identity "username" -Reset -NewPassword (Read-Host -AsSecureString)'],
      },
      {
        problem: 'MFA-Probleme (Authenticator App)',
        steps: [
          'Microsoft Authenticator App neu registrieren',
          'Azure AD → Benutzer → Authentifizierungsmethoden → MFA zurücksetzen',
          'Backup-Code verwenden falls verfügbar',
          'Temporär MFA deaktivieren (nur mit Genehmigung)',
          'Zeit auf Smartphone synchronisieren (für TOTP)',
        ],
      },
      {
        problem: 'BitLocker Recovery Key anfordern',
        steps: [
          'Recovery Key in AD (falls konfiguriert): AD-Benutzer und Computer → Computer → BitLocker Recovery',
          'Azure AD / Intune: Endpunkt Manager → Geräte → Gerät auswählen → Recovery Keys',
          'Microsoft-Konto: account.microsoft.com/devices/recoverykey',
          'Nur mit Genehmigung des Datenschutzbeauftragten aushändigen',
        ],
        commands: ['manage-bde -protectors -get C:'],
      },
      {
        problem: '"Vertrauensstellung zwischen Arbeitsstation und Domäne fehlgeschlagen"',
        steps: [
          'Option 1 (schnell): netdom resetpwd /server:DC-Name /userd:Admin /passwordd:*',
          'Option 2: PC aus Domäne austragen (als lokaler Admin) und wieder einbinden',
          'Option 3 (PowerShell): Test-ComputerSecureChannel -Repair',
          'Falls keins funktioniert: Computerkonto in AD zurücksetzen und PC neu einbinden',
        ],
        commands: ['netdom resetpwd /server:DCNAME /userd:DOMAIN\\admin /passwordd:*', 'Test-ComputerSecureChannel -Repair'],
      },
    ],
  },
  {
    icon: '🖨️',
    name: 'Drucker & Hardware',
    items: [
      {
        problem: 'Drucker offline',
        steps: [
          'Drucker ein- und ausschalten',
          'Status prüfen: Systemsteuerung → Geräte und Drucker',
          'Druckerproperties → "Als Standard festlegen" + "Drucker offline verwenden" deaktivieren',
          'Druckspooler neu starten',
          'TCP/IP-Port des Druckers prüfen (IP-Adresse aktuell?)',
        ],
      },
      {
        problem: 'Druckspooler zurücksetzen',
        steps: [
          'net stop spooler',
          'Alle Dateien in C:\\Windows\\System32\\spool\\PRINTERS löschen (keine Unterordner!)',
          'net start spooler',
          'Druckaufträge erneut senden',
        ],
        commands: ['net stop spooler', 'del /Q /F /S "%systemroot%\\System32\\spool\\PRINTERS\\*.*"', 'net start spooler'],
      },
      {
        problem: 'Treiber neu installieren',
        steps: [
          'Drucker vollständig entfernen: Geräte und Drucker → rechtsklick → Gerät entfernen',
          'Alten Treiber entfernen: Drucker → Druckservereigenschaften → Treiber → Entfernen',
          'Neuen Treiber von Hersteller-Website herunterladen',
          'Drucker neu hinzufügen',
        ],
      },
      {
        problem: 'Scanner wird nicht erkannt',
        steps: [
          'WIA-Dienst prüfen: services.msc → Windows-Bilderfassung',
          'USB-Anschluss wechseln',
          'Treiber neu installieren',
          'TWAIN-Treiber vs. WIA-Treiber prüfen',
          'Scanner-Software neu installieren',
        ],
        commands: ['services.msc'],
      },
    ],
  },
  {
    icon: '📱',
    name: 'Mobile Geräte',
    items: [
      {
        problem: 'Exchange-Konto auf Handy einrichten',
        steps: [
          'E-Mail-App öffnen → Konto hinzufügen → Exchange/Outlook',
          'E-Mail-Adresse und Passwort eingeben',
          'Server: mail.firma.de (oder Autodiscover verwenden)',
          'SSL aktivieren, Port 443',
          'Bei MFA: App-Passwort oder Modern Auth verwenden',
          'MDM-Enrollment eventuell erforderlich',
        ],
      },
      {
        problem: 'MDM-Enrollment Probleme',
        steps: [
          'Gerät aus MDM austragen und neu einschreiben',
          'Intune-Portal: Benutzer → Geräte → Gerät löschen',
          'Auf Gerät: Einstellungen → Allgemein → Geräteverwaltung → Profil löschen',
          'Unternehmensportal-App neu installieren',
          'Enrollment-URL prüfen',
        ],
      },
      {
        problem: 'Diensthandy zurücksetzen (Remote Wipe über MDM)',
        steps: [
          '⚠️ Nur mit ausdrücklicher Genehmigung des Vorgesetzten!',
          'Intune-Portal: Geräte → Gerät auswählen → Zurücksetzen / Remote Wipe',
          'Oder über Exchange Admin Center: Mobile Geräte → Remotegerätezurücksetzung',
          'Benutzer informieren',
          'Gerät aus MDM austragen nach Wipe',
        ],
      },
    ],
  },
]

export default function Trickkiste() {
  const [search, setSearch] = useState('')
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set())
  const [openSubcategories, setOpenSubcategories] = useState<Set<string>>(new Set())
  const [openItems, setOpenItems] = useState<Set<string>>(new Set())

  const searchLower = search.toLowerCase()

  const filteredData = useMemo(() => {
    if (!searchLower) return KNOWLEDGE_BASE
    return KNOWLEDGE_BASE.map((cat) => {
      const filteredItems = cat.items?.filter(
        (item) =>
          item.problem.toLowerCase().includes(searchLower) ||
          item.steps.some((s) => s.toLowerCase().includes(searchLower))
      )
      const filteredSubs = cat.subcategories?.map((sub) => ({
        ...sub,
        items: sub.items.filter(
          (item) =>
            item.problem.toLowerCase().includes(searchLower) ||
            item.steps.some((s) => s.toLowerCase().includes(searchLower))
        ),
      })).filter((sub) => sub.items.length > 0)

      if ((filteredItems?.length ?? 0) === 0 && (filteredSubs?.length ?? 0) === 0) return null
      return { ...cat, items: filteredItems, subcategories: filteredSubs }
    }).filter(Boolean) as Category[]
  }, [searchLower])

  function toggleCat(key: string) {
    setOpenCategories((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleSub(key: string) {
    setOpenSubcategories((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleItem(key: string) {
    setOpenItems((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">🧰 Trickbox</h1>
        <p className="text-sm text-muted-foreground mt-1">IT-Problemlösungen und häufige Fehler</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Suche in allen Kategorien..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
        />
      </div>

      {/* Knowledge base */}
      <div className="space-y-3">
        {filteredData.map((cat) => {
          const catOpen = openCategories.has(cat.name) || !!searchLower

          return (
            <div key={cat.name} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => toggleCat(cat.name)}
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-card hover:bg-accent/40 transition-colors"
              >
                <span className="text-xl">{cat.icon}</span>
                <span className="flex-1 text-left text-sm font-semibold text-foreground">{cat.name}</span>
                {catOpen ? <ChevronDown size={15} className="text-muted-foreground" /> : <ChevronRight size={15} className="text-muted-foreground" />}
              </button>

              {catOpen && (
                <div className="border-t border-border divide-y divide-border">
                  {/* Subcategories */}
                  {cat.subcategories?.map((sub) => {
                    const subKey = `${cat.name}::${sub.name}`
                    const subOpen = openSubcategories.has(subKey) || !!searchLower
                    return (
                      <div key={sub.name}>
                        <button
                          onClick={() => toggleSub(subKey)}
                          className="w-full flex items-center gap-3 px-6 py-2.5 hover:bg-accent/30 transition-colors text-left"
                        >
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">{sub.name}</span>
                          {subOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                        {subOpen && (
                          <div className="pl-6 divide-y divide-border/50">
                            {sub.items.map((item) => <SolutionItem key={item.problem} item={item} catName={`${cat.name}::${sub.name}`} openItems={openItems} toggleItem={toggleItem} search={searchLower} />)}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Direct items */}
                  {cat.items?.map((item) => <SolutionItem key={item.problem} item={item} catName={cat.name} openItems={openItems} toggleItem={toggleItem} search={searchLower} />)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function highlight(text: string, search: string) {
  if (!search) return <>{text}</>
  const idx = text.toLowerCase().indexOf(search)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/30 text-primary rounded px-0.5">{text.slice(idx, idx + search.length)}</mark>
      {text.slice(idx + search.length)}
    </>
  )
}

function SolutionItem({ item, catName, openItems, toggleItem, search }: {
  item: Solution
  catName: string
  openItems: Set<string>
  toggleItem: (k: string) => void
  search: string
}) {
  const key = `${catName}::${item.problem}`
  const isOpen = openItems.has(key) || !!search

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        onClick={() => toggleItem(key)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/20 transition-colors text-left"
      >
        {isOpen ? <ChevronDown size={13} className="text-primary shrink-0" /> : <ChevronRight size={13} className="text-muted-foreground shrink-0" />}
        <span className="text-sm text-foreground">{highlight(item.problem, search)}</span>
      </button>
      {isOpen && (
        <div className="px-10 pb-4 space-y-3">
          <ol className="space-y-1.5 list-decimal list-inside">
            {item.steps.map((step, i) => (
              <li key={i} className="text-xs text-muted-foreground leading-relaxed">
                {highlight(step, search)}
              </li>
            ))}
          </ol>
          {item.commands && item.commands.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Befehle:</p>
              {item.commands.map((cmd) => (
                <code key={cmd} className="block text-[11px] font-mono bg-muted px-3 py-1.5 rounded text-primary">{cmd}</code>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
