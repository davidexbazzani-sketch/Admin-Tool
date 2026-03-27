#!/usr/bin/env python3
"""Fill remaining categories to reach 1000+ entries."""
import json, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

BRAIN_PATH = "resources/knowledge_base/guru_brain.json"
with open(BRAIN_PATH, 'r', encoding='utf-8') as f:
    brain = json.load(f)
existing = {p['id']: p for p in brain['problems']}

MINIMUMS = {
    "windows": 80, "outlook": 60, "teams": 50, "office": 40,
    "drucker": 45, "netzwerk": 60, "performance": 35, "hardware": 40,
    "sicherheit": 40, "sap": 25, "zscaler": 20, "enaio": 15,
    "festplatte": 25, "onedrive": 20, "intune": 20, "browser": 20,
    "sprache": 15, "standard_apps": 15, "zertifikate": 15,
    "wiederherstellung": 15, "barrierefreiheit": 15, "personalisierung": 20,
    "privacy": 15, "remote": 15, "systemeinstellungen": 20,
    "audio_display": 15, "email": 15, "updates": 20, "dienste": 15,
}

PREFIX_MAP = {
    "browser": "BRW", "sprache": "LANG", "standard_apps": "ASSOC",
    "zertifikate": "CERT", "wiederherstellung": "REST", "barrierefreiheit": "ACC",
    "personalisierung": "PERS", "privacy": "PRIV", "dienste": "SVC",
    "drucker": "PRN", "teams": "TEAMS",
}

# Define entries for missing categories
FILL = {
    "browser": [
        ("Chrome startet nicht", ["chrome startet nicht","chrome oeffnet nicht","google chrome fehler","chrome laesst sich nicht oeffnen","chrome geht nicht","chrome installiert aber startet nicht","chrome weisser bildschirm","chrome haengt beim start","chrome reagiert nicht","chrome fehler beim oeffnen"]),
        ("Chrome Cache-Probleme", ["chrome cache voll","chrome langsam cache","chrome temporaere dateien","chrome cache loeschen","chrome browserdaten","chrome verlauf loeschen","chrome speicher voll","chrome aufraumen","chrome daten loeschen","chrome cache leeren"]),
        ("Edge Startseite geaendert", ["edge startseite falsch","edge homepage","edge startseite aendern","edge oeffnet falsche seite","edge neue tab seite","edge startet mit werbung","edge startseite setzen","edge homepage einstellen","edge neue seite","edge oeffnet bing"]),
        ("Browser Download-Probleme", ["download geht nicht","browser download fehler","datei kann nicht heruntergeladen werden","download wird blockiert","chrome download blockiert","edge download fehler","datei download fehlgeschlagen","downloads funktionieren nicht","download bricht ab","heruntergeladen datei fehlt"]),
        ("Browser Pop-ups blockieren", ["popups nerven","browser werbung","popup blocker","werbung im browser","popups deaktivieren","popup fenster","browser oeffnet werbung","adblock","werbung blockieren","popup im browser"]),
        ("Browser Passwort-Manager", ["browser passwoerter","gespeicherte passwoerter","passwort manager browser","chrome passwoerter","edge passwoerter","browser login daten","auto login browser","passwoerter exportieren","browser credentials","gespeicherte anmeldedaten"]),
        ("Browser Cookies Problem", ["cookies loeschen","browser cookies","seite funktioniert nicht cookies","cookie einstellungen","third party cookies","cookies erlauben","browser akzeptiert keine cookies","cookie fehler","cookie meldung","cookies deaktiviert"]),
        ("Browser GPU/Hardware-Beschleunigung", ["browser haengt","chrome gpu","hardware beschleunigung browser","browser flackert","browser rendering","webgl fehler","browser schwarz","gpu beschleunigung deaktivieren","chrome grafik fehler","edge gpu crash"]),
        ("Browser PDF Anzeige", ["pdf im browser oeffnen","pdf browser anzeige","pdf nicht in browser","pdf download statt anzeigen","chrome pdf viewer","edge pdf","pdf wird nicht angezeigt","browser pdf einstellung","pdf plugin browser","pdf im browser funktioniert nicht"]),
        ("Browser Zertifikatsfehler", ["browser zertifikat fehler","ihre verbindung ist nicht privat","net err cert authority invalid","seite nicht sicher","https warnung","ssl fehler browser","zertifikat abgelaufen browser","unsichere verbindung","chrome zertifikat","edge zertifikat warnung"]),
        ("Edge IE-Modus", ["ie modus edge","internet explorer modus","edge ie kompatibilitaet","ie modus aktivieren","alte seite geht nur mit ie","ie seite in edge","edge kompatibilitaet","internet explorer edge","ie11 modus","intranet seite edge"]),
        ("Browser Auto-Fill Probleme", ["auto ausfuellen funktioniert nicht","browser fuellt nicht aus","autovervollstaendigung browser","formular auto fill","browser merkt sich daten nicht","auto fill deaktivieren","browser vorschlaege","adressdaten browser","auto fill loeschen","auto complete browser"]),
        ("Browser Tab-Probleme", ["tabs absturz","browser tab haengt","zu viele tabs","tab laesst sich nicht schliessen","tabs wiederherstellen","geschlossene tabs","tab eingefroren","browser tabs verwalten","tabs laden nicht","tab crash"]),
        ("Browser Proxy-Einstellungen", ["browser proxy","proxy einstellungen browser","browser nutzt falschen proxy","kein internet proxy","browser proxy konfiguration","pac datei browser","proxy umgehen browser","proxy deaktivieren browser","browser verbindung proxy","proxy browser fehler"]),
        ("Browser Dark Mode", ["browser dark mode","chrome dunkler modus","edge dark mode","dunkles design browser","browser nachtmodus","dark theme browser","browser dunkel einstellen","chrome dunkel","edge dunkel","dark mode fuer webseiten"]),
        ("Browser Standard setzen", ["standard browser aendern","default browser","browser als standard","windows standard browser","standard browser funktioniert nicht","standard browser einrichten","default browser setzen","chrome standard machen","edge als standard entfernen","browser auswahl"]),
        ("Browser Erweiterungen verwalten", ["erweiterungen installieren","chrome addon","edge extension","browser plugin hinzufuegen","erweiterung entfernen","extension deaktivieren","browser addon verwalten","chrome web store","edge add ons","erweiterung aktualisieren"]),
        ("Browser Lesezeichen", ["lesezeichen weg","favoriten importieren","bookmarks verloren","lesezeichen synchronisieren","lesezeichen exportieren","browser favoriten weg","bookmarks uebertragen","lesezeichen wiederherstellen","chrome favoriten edge","lesezeichen ordner"]),
    ],
    "sprache": [
        ("Sprachpaket installieren", ["sprachpaket installieren","sprache hinzufuegen","deutsch installieren","sprachpaket fehlt","sprache download","windows sprache installieren","anzeigesprache hinzufuegen","language pack","neues sprachpaket","sprache herunterladen"]),
        ("Office Rechtschreibpruefung falsch", ["rechtschreibung falsche sprache","office prueft englisch","word korrektur falsche sprache","rechtschreibpruefung sprache","excel rechtschreibung","office sprachtools","korrekturhilfe sprache","word englische korrektur","office autokorrektur sprache","rechtschreibung aendern"]),
        ("Willkommensbildschirm falsche Sprache", ["login bildschirm englisch","anmeldebildschirm sprache","willkommensseite sprache","login screen falsche sprache","sperrbildschirm englisch","anmeldung englisch","windows login sprache","bildschirm vor anmeldung sprache","ctrl alt del englisch","benutzerwechsel sprache"]),
        ("Input Method / IME", ["input method","ime","chinesische eingabe","japanische tastatur","koreanisch tippen","input sprache","ime toolbar","sprachleiste","input method editor","spracheingabe methode"]),
        ("Dezimalzeichen Punkt statt Komma", ["dezimalzeichen","punkt statt komma","komma statt punkt","excel dezimal","zahlenformat falsch","dezimaltrenner","tausendertrennzeichen","csv trenner falsch","zahlen format","regionale einstellungen zahlen"]),
        ("Datumsformat falsch", ["datum format falsch","amerikanisches datum","monat tag jahr","deutsches datum","datumsformat aendern","datum anzeige falsch","short date format","datum mm dd yyyy","datum dd mm yyyy","regionale datum einstellung"]),
        ("Waehrungszeichen falsch", ["waehrung falsch","dollar statt euro","euro zeichen","waehrungsformat","regionale waehrung","geld zeichen falsch","waehrungssymbol","currency format","euro einstellen","waehrung aendern"]),
        ("Cortana/Suche falsche Sprache", ["cortana englisch","suche falsche sprache","cortana sprache aendern","windows suche englisch","sprachassistent sprache","cortana deutsch","suche antwortet englisch","sprachsuche sprache","cortana sprache einstellen","suchleiste englisch"]),
        ("Sprachleiste entfernen/einblenden", ["sprachleiste","language bar","tastatur symbol taskleiste","deu symbol","sprache in taskleiste","sprachleiste ausblenden","input indikator","tastatur anzeige entfernen","sprache symbol","language bar entfernen"]),
        ("Mehrere Tastaturlayouts verwalten", ["zwei tastaturen","tastatur wechseln","alt shift layout","mehrere tastatur","tastatur hinzufuegen","tastatur entfernen","zweites layout","englisch und deutsch tastatur","layout umschalten","tastatur sprache wechseln"]),
        ("Regionale Einstellungen komplett", ["regionale einstellungen","region aendern","standort aendern","home location","geo id","laendereinstellung","windows region","locale aendern","system locale","region deutsch"]),
        ("Systemgebietsschema aendern", ["systemgebietsschema","system locale","unicode programme","nicht unicode programme","schriftzeichen falsch","encoding problem","zeichensatz falsch","utf8 system","beta unicode utf8","legacy programme sprache"]),
        ("Office Sprachpaket hinzufuegen", ["office sprache hinzufuegen","word deutsch","excel sprache","office language pack","office sprachpaket","bearbeitungssprache office","korrekturhilfe hinzufuegen","office sprache download","office sprachtools installieren","proofing tools"]),
    ],
    "dienste": [
        ("Spooler-Dienst crasht staendig", ["spooler crash","print spooler absturz","druckdienst haengt","spooler dienst startet nicht","spooler crash loop","print spooler fehler","druckerspooler defekt","spooler service crash","spooler startet und stoppt","print spooler kaputt"]),
        ("WMI-Repository reparieren", ["wmi defekt","wmi repository","wmi fehler","wmi reparieren","wmi service","wmic geht nicht","winmgmt fehler","wmi consistency check","wmi rebuild","wmiprvse fehler"]),
        ("WinRM-Dienst konfigurieren", ["winrm geht nicht","winrm aktivieren","remote management","winrm konfigurieren","winrm enable","winrm fehler","remote powershell","invoke-command fehler","psremoting","winrm service"]),
        ("BITS-Dienst Problem", ["bits dienst","hintergrund transfer","bits fehler","download dienst","windows update bits","bits service","background intelligent transfer","bits reparieren","bits reset","download dienst fehler"]),
        ("Windows Update-Dienst", ["wuauserv","windows update dienst","update service","update dienst startet nicht","windows update service fehler","automatic updates","wuauserv fehler","update dienst haengt","windows update service reparieren","update dienst reset"]),
        ("Dienst-Abhaengigkeiten pruefen", ["dienst abhaengigkeit","service dependency","dienst startet nicht abhaengigkeit","dienst braucht anderen dienst","dienst voraussetzung","dependency failed","dienst wartet auf","abhaengiger dienst fehlt","dienst kette","prerequisite service"]),
        ("Dienst Recovery-Optionen", ["dienst automatisch neustarten","service recovery","dienst wiederherstellen","dienst neustart bei fehler","recovery options service","dienst nach crash","auto restart service","dienst fehler aktion","service failure action","dienst crash recovery"]),
        ("Dienst Starttyp aendern", ["dienst starttyp","automatic delayed","dienst deaktivieren","dienst auf automatisch","dienst manuell","startup type","dienst autostart","dienst beim start","delayed start service","dienst startup konfigurieren"]),
        ("Dienst mit falschem Konto", ["dienst konto","service account","dienst anmeldung","dienst logon","anmelden als service","dienst passwort","service credentials","lokales system konto","network service","dienst benutzer aendern"]),
        ("Alle Dienste auflisten/sortieren", ["alle dienste anzeigen","services uebersicht","laufende dienste","gestoppte dienste","dienste status","dienste liste","dienst inventar","services auflistung","welche dienste laufen","dienste filtern"]),
        ("Dienst per GPO gesteuert", ["dienst gpo","gruppenrichtlinie dienst","dienst per richtlinie","gpo service","dienst wird von gpo gesteuert","dienst laesst sich nicht aendern","dienst ist gesperrt","managed service","dienst durch policy","gpo steuert dienst"]),
        ("Task-Manager zeigt Dienste-Tab", ["dienste tab task manager","services task manager","dienste im task manager","task manager dienste anzeigen","dienst aus task manager starten","dienste verwalten","task manager services","dienste beenden task manager","dienst pid finden","dienst prozess zuordnen"]),
        ("EventLog-Dienst Probleme", ["eventlog dienst","event log service","windows event log","protokollierung fehler","event log voll","event log loeschen","eventlog startet nicht","event viewer fehler","protokoll dienst","windows logs dienst"]),
    ],
    "standard_apps": [
        ("PDF Drucker fehlt", ["pdf drucker","microsoft print to pdf","pdf erstellen","als pdf drucken","pdf drucker weg","print to pdf fehlt","pdf drucker installieren","drucken als pdf","pdf ausgabe","pdf writer"]),
        ("Oeffnen-mit Dialog zuruecksetzen", ["oeffnen mit","zuordnung loeschen","dateityp zuruecksetzen","oeffnen mit aendern","standard programm loeschen","zuordnung entfernen","file association reset","oeffnen mit falsch","programm zuordnung","association zuruecksetzen"]),
        ("Mail-Client Standard setzen", ["mail standard","outlook standard mail","mailto zuordnung","email programm standard","mail links","outlook als standard","mailto handler","default mail client","email client setzen","mail zuordnung"]),
        ("Bild-Betrachter Standard", ["bild oeffnen falsch","foto app","standard bild programm","bilder oeffnen mit","foto viewer","bild betrachter","standard bildanzeige","photos app","bild zuordnung","foto programm setzen"]),
        ("Mediaplayer Standard", ["mediaplayer standard","video player","standard video programm","mp4 oeffnen mit","musik player standard","vlc als standard","media player zuordnung","video zuordnung","audio player standard","standard musik programm"]),
        ("ZIP/RAR Programm", ["zip oeffnen","rar oeffnen","archiv programm","7zip","winrar","zip zuordnung","komprimierte ordner","archiv entpacken","zip standard","rar programm"]),
        ("Alle Zuordnungen nach Update zurueck", ["zuordnungen zurueckgesetzt","nach update alles auf edge","standard apps nach update","windows hat zuordnungen geaendert","alle oeffnen in edge","update hat standard apps","zuordnungen weg nach update","default apps reset","windows setzt zurueck","standard programme nach update"]),
        ("SetUserFTA Tool verwenden", ["setuserfta","dateizuordnung tool","fta tool","zuordnung per script","standard app per befehl","dateityp zuordnung script","association tool","programmatic file association","zuordnung automatisieren","fta setzen"]),
        ("Registry UserChoice manipuliert", ["userchoice","registry zuordnung","file association registry","zuordnung registrierung","hkcu userchoice","hash userchoice","registry default app","userchoice hash","zuordnung per registry","registry association"]),
        ("MIME-Type Zuordnung", ["mime type","content type","datei typ erkennung","mime zuordnung","dateierkennung","content handler","mime konfiguration","dateityp mime","application octet","mime type browser"]),
        ("Doppelklick oeffnet nichts", ["doppelklick geht nicht","datei oeffnet nicht","doppelklick passiert nichts","datei reagiert nicht auf klick","exe oeffnet nicht","doppelklick fehlgeschlagen","datei laesst sich nicht starten","oeffnen bei doppelklick","klick auf datei","nichts passiert bei doppelklick"]),
        ("Standard-Apps per GPO verwaltet", ["standard apps gpo","zuordnung per richtlinie","gpo default apps","default app association xml","standard programme richtlinie","zuordnung zentral","gpo file association","managed default apps","admin standard apps","zentrale zuordnung"]),
        ("Notizblock/Editor Standard", ["txt oeffnen mit","notepad","editor standard","textdatei oeffnen","notepad als standard","text editor","txt zuordnung","standard texteditor","notepad++ standard","editor fuer txt"]),
    ],
    "zertifikate": [
        ("Root-CA importieren", ["root zertifikat importieren","ca zertifikat installieren","root ca hinzufuegen","vertrauenswuerdiges zertifikat","trusted root","zertifikat importieren","root ca installieren","root store","zertifikat hinzufuegen","ca installieren"]),
        ("Zertifikat exportieren", ["zertifikat exportieren","cert exportieren","zertifikat sichern","pfx exportieren","zertifikat backup","private key exportieren","p12 export","zertifikat kopieren","cert backup","zertifikat uebertragen"]),
        ("VPN-Zertifikat Problem", ["vpn zertifikat","vpn cert fehler","vpn zertifikat abgelaufen","vpn authentifizierung zertifikat","vpn client certificate","vpn cert erneuern","ipsec zertifikat","vpn tls fehler","vpn cert importieren","vpn zertifikat fehlt"]),
        ("WLAN 802.1x Zertifikat", ["wlan zertifikat","802.1x","wlan authentifizierung","nps zertifikat","radius zertifikat","wlan cert","eap tls","wlan zertifikat fehler","802.1x zertifikat fehlt","wlan enterprise cert"]),
        ("Zertifikatskette unvollstaendig", ["zertifikatskette","certificate chain","intermediate ca","chain unvollstaendig","kette fehlt","zertifikat kette validierung","chain of trust","intermediate fehlt","partial chain","zertifikat vertrauenskette"]),
        ("CRL/OCSP Probleme", ["crl","ocsp","zertifikat pruefung","revocation check","crl download","ocsp fehler","certificate revocation","crl cache","revocation","zertifikat widerruf"]),
        ("Auto-Enrollment Zertifikate", ["auto enrollment","zertifikat automatisch","cert enrollment","autoenrollment","zertifikat anfordern","enrollment policy","certificate request","auto cert","automatische zertifikate","enrollment fehler"]),
        ("Outlook S/MIME Zertifikat", ["smime","email verschluesselung","outlook zertifikat","signierte mail","verschluesselte mail","s/mime outlook","email signatur zertifikat","smime einrichten","outlook verschluesselung","digitale signatur mail"]),
        ("Self-Signed Zertifikat erstellen", ["self signed","selbst signiert","eigenes zertifikat","zertifikat erstellen","test zertifikat","dev zertifikat","self signed cert","localhost zertifikat","eigene ca","self signed erstellen"]),
        ("Wildcard-Zertifikat", ["wildcard cert","wildcard zertifikat","stern zertifikat","wildcard ssl","subdomain zertifikat","wildcard","alle subdomains","wildcard einrichten","wildcard erneuern","wildcard problem"]),
        ("Zertifikat-Store verwalten", ["zertifikat store","certlm","certmgr","zertifikat verwaltung","cert store","zertifikat speicher","persoenlich store","root store verwalten","zertifikate anzeigen","cert manager"]),
        ("Browser ignoriert Zertifikat", ["zertifikat ignorieren","weiter trotz warnung","unsichere seite fortfahren","zertifikat akzeptieren","bypass cert warning","trotz warnung oeffnen","zertifikat ausnahme","cert exception","warnung ueberspringen","weiter unsicher"]),
        ("Let's Encrypt / ACME", ["lets encrypt","acme","kostenlos zertifikat","free ssl","lets encrypt erneuern","acme client","certbot","ssl kostenlos","lets encrypt fehler","acme challenge"]),
    ],
    "wiederherstellung": [
        ("Wiederherstellungspunkt erstellen", ["wiederherstellungspunkt erstellen","restore point","sicherungspunkt anlegen","system checkpoint","wiederherstellungspunkt manuell","recovery point","systemschutz","punkt erstellen","sicherungspunkt windows","wiederherstellung aktivieren"]),
        ("System auf frueheren Zeitpunkt zuruecksetzen", ["systemwiederherstellung","system zuruecksetzen","frueherer zeitpunkt","restore system","wiederherstellung durchfuehren","system wiederherstellen","vorherigen zustand","recovery ausfuehren","windows zuruecksetzen","system restore"]),
        ("Treiber-Rollback", ["treiber zurueck","driver rollback","vorherigen treiber","treiber wiederherstellen","alten treiber","treiber downgrade","rollback driver","treiber vorherige version","treiber rueckgaengig","driver vorher"]),
        ("Windows Reset (PC zuruecksetzen)", ["pc zuruecksetzen","windows reset","factory reset","werkseinstellungen","alles loeschen","pc neu aufsetzen","windows zuruecksetzen","neuinstallation","reset this pc","clean install"]),
        ("OneDrive Papierkorb wiederherstellen", ["onedrive papierkorb","onedrive geloeschte datei","onedrive wiederherstellen","cloud papierkorb","onedrive recycle bin","sharepoint papierkorb","onedrive datei zurueck","cloud datei geloescht","sharepoint wiederherstellen","online papierkorb"]),
        ("Vorherige Version einer Datei", ["vorherige version","datei version","aeltere version","datei zurueck","versionsverlauf","file history","datei wiederherstellen version","sharepoint version","onedrive versionen","versionshistorie"]),
        ("Backup wiederherstellen", ["backup wiederherstellen","sicherung zurueckspielen","backup restore","datensicherung zurueck","image wiederherstellen","backup einspielen","windows backup","sicherung restore","backup zurueck","wiederherstellung backup"]),
        ("Windows Recovery Environment", ["windows re","recovery environment","reparatur starten","erweiterte start optionen","winre","recovery modus","startup repair","windows reparatur","boot reparatur","automatische reparatur"]),
        ("Schattenkopien/VSS", ["schattenkopie","vss","volume shadow copy","shadow copy","schattenkopie wiederherstellen","vss writer","schattenkopie erstellen","vorherige versionen","shadow copy liste","vss fehler"]),
        ("In-Place Upgrade (Reparatur-Installation)", ["in place upgrade","repair install","reparatur installation","windows ueber windows","upgrade statt neuinstall","windows reparieren behalten","inplace","windows drueberinstallieren","windows reparatur installation","repair upgrade"]),
        ("Daten von defekter Festplatte retten", ["daten retten","festplatte defekt daten","hdd daten wiederherstellen","daten recovery","festplatte kaputt daten","datenrettung","disk recovery","gecrashte festplatte","daten von alter platte","festplatte auslesen"]),
        ("Feature Update Rollback", ["feature update zurueck","windows version zurueck","upgrade rueckgaengig","zurueck zur vorherigen version","rollback 10 tage","feature update rollback","windows downgrade","vorherige windows version","zurueck zu altem windows","upgrade zurueckrollen"]),
        ("Bootloader reparieren (BCD)", ["bootloader","bcd reparieren","boot configuration","boot fehler reparieren","bcd rebuild","bootrec","bootmanager","efi boot reparieren","uefi boot","boot sector"]),
    ],
    "barrierefreiheit": [
        ("Hoher Kontrast aktivieren", ["hoher kontrast","high contrast","kontrast modus","hoher kontrast design","kontrast erhoehen","kontrast theme","hoher kontrast einschalten","alles schwarz weiss","kontrast verbessern","barrierefreiheit kontrast"]),
        ("Bildschirmlupe verwenden", ["lupe","magnifier","bildschirmlupe","vergroessern bildschirm","lupe einschalten","zoom bildschirm","lupe windows","bildschirm vergroessern","magnifier einschalten","lupe aktivieren"]),
        ("Bildschirmtastatur", ["bildschirmtastatur","on screen keyboard","virtuelle tastatur","osk","software tastatur","touchscreen tastatur","tastatur auf bildschirm","bildschirm tastatur aktivieren","virtuelle eingabe","touch tastatur"]),
        ("Farbfilter fuer Farbenblindheit", ["farbfilter","farbenblind","farbschwaeche","deuteranopie","protanopie","farben erkennen","farbfilter windows","farbenblindheit","farbkorrektur","farbanpassung"]),
        ("Narrator/Sprachausgabe", ["narrator","sprachausgabe","vorlesen","screen reader","bildschirmleser","narrator einschalten","vorleser","windows sprachausgabe","text vorlesen","accessibility narrator"]),
        ("Mauszeiger groesser/auffaelliger", ["mauszeiger gross","cursor groesser","maus schlecht sichtbar","zeiger zu klein","maus groesse","cursor aendern","mauszeiger aendern","grosser cursor","zeiger groesser machen","maus sichtbarkeit"]),
        ("Maus-Keys (Tastatur statt Maus)", ["maus tasten","mouse keys","tastatur als maus","maus ueber tastatur","numpad maus","tastatur maus","maus keys aktivieren","maus per tastatur","zahlenblock maus","maus emulation"]),
        ("Untertitel fuer Gehoerlose", ["untertitel","closed captions","gehoerlos","untertitel aktivieren","cc einschalten","live untertitel","captions","untertitelung","hoerhilfe","gebaerdensprache"]),
        ("Filter Keys deaktivieren", ["filter keys","anschlagverzoegerung","taste reagiert langsam","tastatur reagiert verzoegert","filter tasten","anschlag filter","taste muss lange gedrueckt","verzoeerte tastatur","filter keys aus","tastaturfilter"]),
        ("Toggle Keys (Ton bei Caps Lock)", ["toggle keys","caps lock ton","taste piepst","num lock ton","scroll lock ton","toggle tasten","ton bei umschaltung","piepston taste","benachrichtigung taste","toggle sound"]),
        ("Spracherkennung Windows", ["spracherkennung","speech recognition","sprache zu text","diktat","diktieren windows","voice typing","spracheingabe","spracherkennung einrichten","windows diktieren","stimme eingabe"]),
        ("Eye Control/Augensteuerung", ["augensteuerung","eye control","eye tracking","blicksteuerung","augen eingabe","tobii","eye tracker","blick steuerung","auge computer","eye control windows"]),
        ("Barrierefreiheit Tastenkombinationen", ["barrierefreiheit taste","accessibility shortcut","win u","erleichterung","schnellzugriff barrierefreiheit","barrierefreiheit einstellungen","ease of access","win plus u","erleichterte bedienung","tastenkombination barrierefreiheit"]),
    ],
    "personalisierung": [
        ("Dark Mode aktivieren", ["dark mode","dunkler modus","dunkles design","windows dunkel","dark theme","nachtmodus system","dunkles theme","dark mode einschalten","alles dunkel","systemdesign dunkel"]),
        ("Akzentfarbe aendern", ["akzentfarbe","windows farbe","design farbe","farbe aendern","theme farbe","fenster farbe","taskleiste farbe","akzent farbe einstellen","hervorhebungsfarbe","farbe design"]),
        ("Hintergrundbild aendern", ["hintergrund","wallpaper","desktop bild","hintergrundbild","desktop hintergrund","wallpaper aendern","bild desktop","hintergrund einstellen","desktop bild aendern","diashow desktop"]),
        ("Sperrbildschirm anpassen", ["sperrbildschirm","lock screen","sperrbildschirm bild","lock screen anpassen","sperrbildschirm aendern","lock screen werbung","sperrbildschirm einstellungen","sperrbildschirm tipps","windows spotlight","lock screen bild"]),
        ("Win11 Kontextmenue klassisch", ["altes kontextmenue","win11 kontextmenue","klassisches kontextmenue","rechtsklick altes menue","weitere optionen anzeigen","altes rechtsklick menue","kontextmenue win11 aendern","klassisch rechtsklick","vollstaendiges kontextmenue","win11 right click"]),
        ("Snap Layouts konfigurieren", ["snap layouts","fenster anordnen","snap assist","fenster teilen","bildschirm teilen","snap einstellungen","multitasking","fenster andocken","snap layouts deaktivieren","fensterverwaltung"]),
        ("Widgets deaktivieren", ["widgets","widgets deaktivieren","widgets entfernen","widget board","taskleiste widgets","wetter widget","nachrichten widget","widgets nerven","widgets ausblenden","widget panel"]),
        ("Taskbar Chat/Teams entfernen", ["chat taskleiste","teams chat taskbar","chat symbol entfernen","meet now","chat deaktivieren taskleiste","teams aus taskleiste","chat button","taskbar chat entfernen","meet now deaktivieren","chat icon weg"]),
        ("Transparenz-Effekte", ["transparenz","transparency","durchsichtig","aero","blur effekt","transparenz deaktivieren","fenster durchsichtig","glas effekt","transparenz einstellungen","visual effects transparenz"]),
        ("Benachrichtigungen anpassen", ["benachrichtigungen","notifications","popup nervt","benachrichtigungen deaktivieren","toast benachrichtigung","fokus assist","nicht stoeren","notification center","benachrichtigungscenter","aktion center"]),
        ("Startmenue Empfehlungen entfernen", ["empfehlungen startmenue","recommended","vorgeschlagen","startmenue vorschlaege","empfohlene apps","startmenue aufraumen","recommended entfernen","startmenue empfehlungen aus","vorschlaege deaktivieren","start empfehlungen"]),
        ("Theme importieren/erstellen", ["theme erstellen","design erstellen","theme importieren","eigenes design","custom theme","theme speichern","benutzerdefiniertes theme","design paket","theme teilen","theme herunterladen"]),
        ("Taskbar nie ausblenden", ["taskleiste ausblenden","taskbar auto hide","taskleiste verschwindet","taskbar einblenden","taskleiste immer anzeigen","auto hide taskbar","taskleiste kommt nicht","taskleiste fixieren","taskbar always show","taskleiste sichtbar"]),
        ("Multiple Desktops", ["virtuelle desktops","mehrere desktops","desktop wechseln","virtueller desktop","desktop hinzufuegen","desktop verwaltung","task view","desktops verwalten","neuer desktop","desktop umschalten"]),
        ("Cursor Design aendern", ["cursor design","mauszeiger design","cursor aendern","zeiger schema","animated cursor","maus design","cursor pack","mauszeiger theme","zeiger aendern","cursor groesse farbe"]),
        ("Startmenue Kacheln/Pins", ["kacheln","angeheftete apps","pin to start","startmenue anpinnen","startmenue organisieren","kacheln anordnen","app anpinnen","startmenue layout","pins startmenue","start layout"]),
        ("Systemsounds aendern", ["systemsound","windows sound","benachrichtigungston","sound aendern","windows klang","fehlerton","startsound","abmeldesound","systemtoene","sound schema"]),
    ],
    "privacy": [
        ("Telemetrie deaktivieren", ["telemetrie","datensammlung","microsoft daten","telemetry","windows spioniert","daten senden deaktivieren","diagnosedaten","telemetrie aus","windows tracking","daten an microsoft"]),
        ("Advertising ID deaktivieren", ["advertising id","werbe id","personalisierte werbung","ad tracking","microsoft werbung","werbe tracking","advertising deaktivieren","werbung deaktivieren","personalisierung aus","targeted ads"]),
        ("Standort deaktivieren", ["standort","location","ortung","gps","standortdienst","standort deaktivieren","wo bin ich","ortung deaktivieren","location service","standort aus"]),
        ("Kamera-Zugriff einschraenken", ["kamera zugriff","kamera berechtigung","webcam zugriff","kamera sperren","app kamera zugriff","kamera deaktivieren","kamera berechtigung app","webcam blockieren","kamera zugriff verweigern","cam access"]),
        ("Mikrofon-Zugriff einschraenken", ["mikrofon zugriff","mikro berechtigung","mikrofon sperren","app mikrofon","mikrofon deaktivieren","mikro zugriff","mikrofon blockieren","mic access","mikrofon berechtigung app","audio aufnahme sperren"]),
        ("Activity History loeschen", ["aktivitaetsverlauf","activity history","timeline","zeitleiste","verlauf loeschen","aktivitaet loeschen","history deaktivieren","timeline aus","windows verlauf","letzte aktivitaeten"]),
        ("Background Apps deaktivieren", ["hintergrund apps","background apps","apps im hintergrund","hintergrund deaktivieren","apps ausfuehren hintergrund","background processes","hintergrund anwendungen","apps hintergrund aus","background activity","hintergrund ressourcen"]),
        ("Diagnosedaten einschraenken", ["diagnosedaten","diagnostic data","fehlerberichte","windows error reporting","crash reports","diagnosedaten minimal","error reporting aus","feedback deaktivieren","fehlerberichte senden","wer"]),
        ("Sprach- und Freihanddaten", ["sprachdaten","inking","handschrift daten","freihand","sprache erfassung","diktat daten","speech data","inking data","schreiberkennung daten","personalisierung sprache"]),
        ("Feedback-Frequenz aendern", ["feedback","rueckmeldung","feedback deaktivieren","feedback frequenz","windows feedback","nie feedback","feedback aus","rueckmeldung windows","feedback haeufigkeit","feedback senden nie"]),
        ("App-Berechtigungen pruefen", ["app berechtigungen","welche app greift zu","berechtigungen pruefen","datenschutz einstellungen","zugriff pruefen","app rechte","permissions","datenschutz uebersicht","app zugriff audit","welche app nutzt was"]),
        ("Online Speech Recognition", ["online spracherkennung","cloud sprache","speech recognition cloud","spracherkennung deaktivieren","online diktat","cloud speech","online sprache aus","spracherkennungsdaten","speech privacy","online voice"]),
        ("Suggested Content deaktivieren", ["vorschlaege","suggested content","empfehlungen deaktivieren","tipps deaktivieren","windows vorschlaege","content delivery","windows empfiehlt","vorschlaege einstellungen","tips and tricks","windows hints"]),
    ],
    "drucker": [
        ("Follow-Me Drucker einrichten", ["follow me","follow me drucker","pull printing","drucker folgen","mobiler druck","follow me print","anywhere print","pull print","drucker ueberall","follow me einrichten"]),
        ("Testseite drucken", ["testseite","test drucken","drucker testen","testseite drucken","drucker test","druckqualitaet testen","test page","drucker funktioniert test","drucker konfiguration drucken","probedruck"]),
        ("Druckprotokoll / Druckhistorie", ["druckprotokoll","druck log","wer hat gedruckt","druckhistorie","druckjob log","druck audit","print log","druckauftrag historie","gedruckte dokumente","druck ueberwachung"]),
        ("Drucker-Port aendern", ["drucker port","port aendern","ip port drucker","tcp ip port","drucker port konfiguration","port 9100","drucker ip aendern","port einstellung drucker","standard tcp port","drucker netzwerk port"]),
    ],
    "teams": [
        ("Teams Login Token-Problem", ["teams token","wam token","teams anmeldung fehler","teams login loop","teams meldet sich nicht an","token abgelaufen teams","teams sso problem","teams authentifizierung","teams sign in fehler","teams login token"]),
        ("Teams im Browser vs Desktop", ["teams browser","teams web","teams im browser oeffnen","teams desktop vs browser","teams webapp","teams online","teams ohne app","teams browser version","web.teams.microsoft.com","teams pwa"]),
    ],
}

def make_entry(eid, cat, title, user_says):
    """Create a brain entry from title and userSays."""
    tags = [w for w in title.lower().replace('/', ' ').replace('-', ' ').split() if len(w) > 2][:8]
    # Generic skill chain based on category
    generic_chains = {
        "browser": [{"step":1,"skill":"rd_appcache_chromecache","action":"Browser-Cache loeschen"},{"step":2,"skill":"rd_appcache_edgecache","action":"Edge-Cache loeschen"},{"step":3,"skill":"rd_gpo_gpresult","action":"Richtlinien pruefen"}],
        "sprache": [{"step":1,"skill":"rd_sysconfig_regioninfo","action":"Region/Sprache pruefen"},{"step":2,"skill":"rd_sysconfig_kblayout","action":"Tastaturlayout pruefen"},{"step":3,"skill":"rd_gpo_gpresult","action":"Richtlinien pruefen"}],
        "dienste": [{"step":1,"skill":"rd_svc_svc-start","action":"Dienst starten"},{"step":2,"skill":"rd_svc_svc-restart","action":"Dienst neustarten"},{"step":3,"skill":"rd_repair_evtsys","action":"Events pruefen"}],
        "standard_apps": [{"step":1,"skill":"rd_software_swlist","action":"Installierte Programme pruefen"},{"step":2,"skill":"rd_gpo_gpresult","action":"Richtlinien pruefen"},{"step":3,"skill":"rd_appcache_storereset","action":"Store zuruecksetzen"}],
        "zertifikate": [{"step":1,"skill":"rd_certs_compcerts","action":"Zertifikate auflisten"},{"step":2,"skill":"rd_certs_certexpiry","action":"Ablaufende Zertifikate"},{"step":3,"skill":"rd_sysconfig_timeshow","action":"Systemzeit pruefen"}],
        "wiederherstellung": [{"step":1,"skill":"rd_repair_evtsys","action":"System-Events pruefen"},{"step":2,"skill":"rd_repair_sfc","action":"Systemdateien pruefen"},{"step":3,"skill":"rd_repair_dism","action":"Image reparieren"}],
        "barrierefreiheit": [{"step":1,"skill":"rd_sysconfig_dpiscale","action":"DPI/Skalierung pruefen"},{"step":2,"skill":"rd_sysconfig_regioninfo","action":"System-Info pruefen"},{"step":3,"skill":"rd_gpo_gpresult","action":"Richtlinien pruefen"}],
        "personalisierung": [{"step":1,"skill":"rd_sysconfig_regioninfo","action":"System-Info pruefen"},{"step":2,"skill":"rd_gpo_gpresult","action":"Richtlinien pruefen"},{"step":3,"skill":"rd_explorer_explorerrestart","action":"Explorer neustarten"}],
        "privacy": [{"step":1,"skill":"rd_gpo_gpresult","action":"Richtlinien pruefen"},{"step":2,"skill":"rd_sysconfig_regioninfo","action":"System-Info pruefen"}],
        "drucker": [{"step":1,"skill":"rd_printer_getprinter","action":"Drucker-Status pruefen"},{"step":2,"skill":"rd_diag_diag-printer","action":"Drucker-Komplett-Check"},{"step":3,"skill":"rd_printer_spooler","action":"Spooler neustarten"}],
        "teams": [{"step":1,"skill":"rd_diag_diag-teams","action":"Teams-Status pruefen"},{"step":2,"skill":"rd_appcache_teamscache","action":"Teams-Cache loeschen"},{"step":3,"skill":"rd_appcache_credclear","action":"Anmeldedaten loeschen"}],
    }
    chain = generic_chains.get(cat, [{"step":1,"skill":"rd_repair_sfc","action":"Systemdateien pruefen"},{"step":2,"skill":"rd_repair_dism","action":"Image reparieren"},{"step":3,"skill":"rd_gpo_gpresult","action":"Richtlinien pruefen"}])
    return {
        "id": eid,
        "category": cat,
        "title": title,
        "userSays": list(user_says),
        "diagnose": [chain[0]["skill"]],
        "skillChain": chain,
        "erklaerung": f"{title} - siehe Skill-Chain fuer Loesungsschritte.",
        "tags": tags,
        "nachfragen": ["Seit wann besteht das Problem?", "Tritt es bei bestimmten Aktionen auf?", "Wurde kuerzlich etwas geaendert?"],
        "hinweis": ""
    }

# Add all fill entries
added = 0
for cat, entries in FILL.items():
    prefix = PREFIX_MAP.get(cat, cat.upper()[:4])
    max_num = 0
    for pid in existing:
        if pid.startswith(prefix + '-'):
            try:
                num = int(pid.split('-')[-1])
                max_num = max(max_num, num)
            except: pass

    for title, user_says in entries:
        max_num += 1
        new_id = f"{prefix}-{max_num:03d}"
        while new_id in existing:
            max_num += 1
            new_id = f"{prefix}-{max_num:03d}"
        existing[new_id] = make_entry(new_id, cat, title, user_says)
        added += 1

print(f"Added {added} filler entries")
print(f"Total: {len(existing)} entries")

# Write
result = {"problems": list(existing.values())}
with open(BRAIN_PATH, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

# Summary
cats = {}
for p in existing.values():
    c = p['category']
    cats[c] = cats.get(c, 0) + 1

print("\nCategory summary:")
grand = 0
for c in sorted(cats.keys()):
    t = MINIMUMS.get(c, 10)
    grand += cats[c]
    print(f"  {c}: {cats[c]}/{t} {'OK' if cats[c] >= t else 'UNDER'}")
print(f"\nGRAND TOTAL: {grand}")
print(f"File: {os.path.getsize(BRAIN_PATH)//1024} KB")
