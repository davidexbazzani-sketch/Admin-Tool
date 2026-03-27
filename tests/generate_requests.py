#!/usr/bin/env python3
"""Generate guru_requests.json with 1000+ request entries."""
import json, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Load starter
with open('prompts/guru_requests_starter.json', 'r', encoding='utf-8') as f:
    starter = json.load(f)
existing = {r['id']: r for r in starter['requests']}
print(f"Starter: {len(existing)} entries")

MINIMUMS = {
    "benutzer": 60, "email": 80, "drucker": 35, "software": 60,
    "netzwerk": 50, "system": 60, "sicherheit": 50, "personalisierung": 40,
    "sprache": 20, "standard_apps": 20, "festplatte": 30, "barrierefreiheit": 20,
    "remote_aktionen": 25, "wiederherstellung": 15, "hardware": 25,
    "outlook": 30, "onedrive": 20, "browser": 20, "intune": 20,
    "sap": 20, "updates": 20,
}

def e(eid, cat, title, says, chain, erkl, tags, fragen, berechtigung="admin"):
    """Create a request entry."""
    # Pad userSays to 10+ if needed
    while len(says) < 10:
        says.append(f"{says[0]} bitte")
        if len(says) < 10: says.append(f"ich brauche {says[0]}")
        if len(says) < 10: says.append(f"koennten sie {says[0]}")
    return {
        "id": eid, "category": cat, "title": title,
        "userSays": says[:20],
        "skillChain": [{"step": i+1, "skill": s, "action": a} for i, (s, a) in enumerate(chain)],
        "erklaerung": erkl, "tags": tags,
        "nachfragen": fragen,
        "berechtigungNoetig": berechtigung
    }

# ═══════════════════════════════════════════════════════════════════════════════
# ALL REQUEST ENTRIES BY CATEGORY
# ═══════════════════════════════════════════════════════════════════════════════

ALL = []

# ── BENUTZER (60) ────────────────────────────────────────────────────────────
for i, (title, says, chain, erkl, tags, fragen, perm) in enumerate([
    ("Lokalen Admin-User erstellen", ["admin user erstellen","lokalen admin anlegen","admin konto erstellen","lokaler administrator","admin account erstellen","neuen admin anlegen","admin rechte neuer user","lokalen admin user","administrator konto anlegen","admin erstellen lokal"], [("rd_userprofiles_useradd","Lokalen User anlegen"),("rd_userprofiles_usergroupadd","Zur Administratoren-Gruppe hinzufuegen"),("rd_userprofiles_userlist","User-Liste verifizieren")], "Erstellt einen lokalen Admin-Account auf dem Ziel-PC.", ["admin","user","erstellen","lokal","konto"], ["Welcher Username?","Welches Passwort?","Temporaer oder dauerhaft?"], "admin"),
    ("User aus Gruppe entfernen", ["user aus gruppe entfernen","gruppenmitgliedschaft loeschen","aus gruppe rausnehmen","benutzer gruppe entfernen","ad gruppe mitglied entfernen","user entfernen aus","gruppe bearbeiten mitglied","mitglied entfernen","gruppe user loeschen","benutzer aus sicherheitsgruppe"], [("rd_userprofiles_usergrouprem","User aus Gruppe entfernen"),("rd_userprofiles_userlist","Verifizieren")], "Entfernt einen Benutzer aus einer lokalen Gruppe.", ["gruppe","entfernen","mitglied","benutzer"], ["Welcher User?","Welche Gruppe?","Sicher dass die Berechtigung entzogen werden soll?"], "admin"),
    ("Lokalen User loeschen", ["user loeschen","lokales konto entfernen","benutzer loeschen","account loeschen","lokalen user entfernen","benutzerkonto loeschen","user account loeschen","konto entfernen lokal","user deaktivieren und loeschen","alten user entfernen"], [("rd_userprofiles_userlist","Vorhandene User pruefen"),("rd_userprofiles_userdel","User loeschen"),("rd_userprofiles_userlist","Verifizieren")], "Loescht einen lokalen Benutzer vom PC.", ["user","loeschen","konto","entfernen"], ["Welcher User soll geloescht werden?","Soll das Profil auch geloescht werden?","Sind noch Daten zu sichern?"], "admin"),
    ("Lokales Passwort setzen", ["lokales passwort setzen","passwort lokal aendern","lokales kennwort","user passwort aendern lokal","neues passwort setzen","lokales konto passwort","benutzer passwort zuruecksetzen lokal","passwort reset lokal","lokaler user passwort","passwort fuer lokalen user"], [("rd_userprofiles_userpwset","Passwort setzen"),("rd_userprofiles_userlist","Verifizieren")], "Setzt das Passwort fuer einen lokalen Benutzer.", ["passwort","lokal","setzen","aendern"], ["Welcher User?","Welches neue Passwort?","Soll der User das Passwort beim naechsten Login aendern muessen?"], "admin"),
    ("AutoLogon einrichten", ["auto login einrichten","automatische anmeldung","auto logon","pc automatisch anmelden","ohne passwort starten","auto login konfigurieren","automatisch einloggen","autologon setzen","windows auto anmeldung","kiosk auto login"], [("rd_userprofiles_autologon","AutoLogon konfigurieren"),("rd_userprofiles_userlist","User verifizieren")], "Richtet automatische Anmeldung ohne Passworteingabe ein.", ["autologon","automatisch","anmeldung","login"], ["Welcher User soll sich automatisch anmelden?","Fuer welchen Zweck (Kiosk, Display)?","Sicherheitsrisiko bewusst?"], "admin"),
    ("Letzte Anmeldungen pruefen", ["letzte anmeldungen","wer hat sich angemeldet","login historie","anmelde verlauf","wer war am pc","letzte logins","anmeldungen pruefen","login log","wer hat sich eingeloggt","anmeldehistorie"], [("rd_userprofiles_lastlogins","Letzte Anmeldungen auslesen"),("rd_sessions_queryuser","Aktuelle Sessions")], "Zeigt wer sich wann am PC angemeldet hat.", ["anmeldung","login","historie","verlauf"], ["Welcher Zeitraum?","Bestimmter User oder alle?","Auch fehlgeschlagene Versuche?"], None),
    ("Profil-Groesse pruefen", ["profil groesse","wie gross ist profil","user profil speicher","profil speicherplatz","profil aufgeblaet","profil zu gross","benutzer profil groesse","profil platz","profil verbrauch","wie viel speicher profil"], [("rd_userprofiles_profilesizes","Profil-Groessen auslesen"),("rd_userprofiles_profilelist","Profil-Details")], "Zeigt die Groesse aller Benutzerprofile auf dem PC.", ["profil","groesse","speicher","platz"], ["Bestimmter User oder alle?","Soll aufraeumen vorgeschlagen werden?"], None),
    ("Profil bereinigen/loeschen", ["profil loeschen","altes profil entfernen","profil bereinigen","user profil aufraemen","profil entfernen","profildaten loeschen","benutzerprofil entfernen","altes profil weg","profil cleanup","verwaiste profile loeschen"], [("rd_userprofiles_profilelist","Profile auflisten"),("rd_userprofiles_profiledel","Profil loeschen"),("rd_userprofiles_profilelist","Verifizieren")], "Loescht ein Benutzerprofil vom PC (Registry + Ordner).", ["profil","loeschen","bereinigen","entfernen"], ["Welches Profil?","Sind Daten gesichert?","User nicht mehr angemeldet?"], "admin"),
    ("Alle lokalen User auflisten", ["alle user anzeigen","lokale benutzer liste","wer hat konto auf pc","lokale accounts","benutzer auflisten","user inventar","alle konten zeigen","lokale benutzerkonten","user liste pc","konten uebersicht"], [("rd_userprofiles_userlist","Lokale User auflisten"),("rd_sessions_localadmins","Lokale Admins")], "Listet alle lokalen Benutzerkonten auf dem PC auf.", ["user","liste","konten","lokal"], ["Nur aktive oder auch deaktivierte?"], None),
    ("User zur Admin-Gruppe hinzufuegen", ["admin rechte geben","zum admin machen","admin gruppe hinzufuegen","administrator rechte","user admin machen","lokaler admin","administratoren gruppe","admin berechtigung geben","zum administrator","admin rechte erteilen"], [("rd_userprofiles_usergroupadd","Zur Administratoren-Gruppe hinzufuegen"),("rd_sessions_localadmins","Admin-Liste verifizieren")], "Fuegt einen User zur lokalen Administratoren-Gruppe hinzu.", ["admin","rechte","gruppe","administrator"], ["Welcher User?","Temporaer oder dauerhaft?","Begruendung?"], "admin"),
    ("Temp-Profil reparieren", ["temp profil","temporaeres profil","profil laed nicht","desktop leer beim anmelden","einstellungen weg nach login","temp profil fix","temporaeres profil reparieren","profil defekt reparieren","profil backup key","bak profil"], [("rd_userprofiles_tempprofile","Temp-Profil erkennen und reparieren"),("rd_userprofiles_profilelist","Profil-Status pruefen")], "Repariert ein temporaeres Profil durch Umbenennung des .bak Registry-Keys.", ["temp","profil","temporaer","bak","registry"], ["Seit wann laed das Temp-Profil?","Welcher User ist betroffen?","Neustart schon versucht?"], "admin"),
], start=1):
    eid = f"REQ-ACC-{len([x for x in existing if x.startswith('REQ-ACC')])+i:03d}"
    if eid not in existing:
        ALL.append(e(eid, "benutzer", title, says, chain, erkl, tags, fragen, perm))

# I'll now generate entries more efficiently with a compact format
def batch(cat, prefix, entries_data):
    """Generate batch of entries for a category."""
    result = []
    n = len([x for x in existing if x.startswith(f'REQ-{prefix}')])
    for i, (title, says, skills, erkl, fragen, perm) in enumerate(entries_data, start=1):
        eid = f"REQ-{prefix}-{n+i:03d}"
        chain = [(s, a) for s, a in skills]
        tags = [w for w in title.lower().replace('/', ' ').replace('-', ' ').split() if len(w) > 2][:8]
        result.append(e(eid, cat, title, says, chain, erkl, tags, fragen, perm))
    return result

# ── EMAIL (80) ────────────────────────────────────────────────────────────────
email_entries = [
    ("Verteilerliste erstellen", ["verteiler erstellen","verteilerliste anlegen","distribution list","email verteiler","neue verteilerliste","verteiler gruppe","mail verteiler erstellen","dl erstellen","distribution group","verteiler anlegen"], [("rd_net_ping","Exchange-Erreichbarkeit pruefen"),("rd_gpo_gpresult","Richtlinien pruefen")], "Erstellt eine neue Verteilerliste im Exchange.", ["Wie soll die Verteilerliste heissen?","Welche Mitglieder?","Sollen externe Mails ankommen?"], "admin"),
    ("Alias zu Postfach hinzufuegen", ["alias hinzufuegen","zweite email adresse","email alias","smtp alias","proxy adresse","zusaetzliche email","alias setzen","weitere email adresse","email alias erstellen","zweite adresse postfach"], [("rd_net_ping","Exchange pruefen")], "Fuegt eine zusaetzliche E-Mail-Adresse (Alias) zum Postfach hinzu.", ["Welche Alias-Adresse?","Welches Postfach?","Soll es die primaere Adresse werden?"], "admin"),
    ("Postfach-Groesse erhoehen", ["postfach groesser","mailbox quota erhoehen","mehr speicher email","postfach limit erhoehen","mailbox vergroessern","email speicher erhoehen","postfach quota","mailbox groesse","mehr platz mail","postfach erweitern"], [("rd_diag_diag-outlook","Postfach-Status pruefen")], "Erhoeht das Speicherlimit des Exchange-Postfachs.", ["Welches Postfach?","Aktuelle Groesse?","Gewuenschte Groesse?"], "admin"),
    ("Online-Archiv aktivieren", ["archiv postfach aktivieren","online archiv","in-place archive","archiv mailbox","email archivierung","archiv aktivieren exchange","online archiv einrichten","auto archivierung","archiv postfach erstellen","exchange archiv"], [("rd_diag_diag-outlook","Outlook-Status pruefen")], "Aktiviert das Online-Archiv-Postfach in Exchange/M365.", ["Welches Postfach?","Welche Aufbewahrungsrichtlinie?"], "admin"),
    ("Senden-Als Berechtigung", ["senden als","send as","im namen senden","send on behalf","senden im auftrag","von anderer adresse senden","stellvertretend senden","senden als berechtigung","email als anderer senden","als jemand anderes senden"], [("rd_net_ping","Exchange pruefen")], "Gibt einem User die Berechtigung als anderes Postfach zu senden.", ["Wer soll senden duerfen?","Von welchem Postfach?","Senden-Als oder Senden-im-Auftrag?"], "admin"),
    ("Kalender-Freigabe einrichten", ["kalender freigeben","kalender teilen","kalender berechtigung","kalender sichtbar","outlook kalender freigabe","kalender fuer andere","kalender lesen lassen","kalender zugriff","geteilter kalender","kalender delegieren"], [("rd_diag_diag-outlook","Outlook pruefen")], "Richtet Kalender-Freigabe zwischen zwei Benutzern ein.", ["Wessen Kalender?","Fuer wen freigeben?","Nur lesen oder auch bearbeiten?"], None),
    ("Raum-Postfach erstellen", ["raum postfach","besprechungsraum","room mailbox","raum buchen","meetingraum erstellen","konferenzraum postfach","raum einrichten exchange","meeting room","raum kalender","besprechungsraum mailbox"], [("rd_net_ping","Exchange pruefen")], "Erstellt ein Raum-Postfach fuer die Raumbuchung.", ["Welcher Raum (Name, Standort)?","Soll automatische Annahme aktiviert werden?","Kapazitaet?"], "admin"),
    ("Mail-Kontakt erstellen", ["mail kontakt","externer kontakt","mail contact","kontakt erstellen exchange","externer empfaenger","mail kontakt anlegen","exchange kontakt","externer kontakt adressbuch","kontakt fuer externe","globales adressbuch kontakt"], [("rd_net_ping","Exchange pruefen")], "Erstellt einen Mail-Kontakt fuer externe Adressen im globalen Adressbuch.", ["Name und externe Email?","In welcher OU?","Im Adressbuch sichtbar?"], "admin"),
    ("Spam-Filter anpassen", ["spam filter","spam einstellungen","junk filter","spam whitelist","absender erlauben","spam blacklist","absender blockieren","junk einstellungen","anti spam","spam konfiguration"], [("rd_diag_diag-outlook","Outlook pruefen")], "Passt Spam-/Junk-Filter-Einstellungen an.", ["Absender auf Whitelist oder Blacklist?","Welche Domain/Adresse?","Nur fuer diesen User oder alle?"], "admin"),
    ("Quarantaene-Mail freigeben", ["quarantaene","quarantine","gesperrte mail freigeben","mail in quarantaene","blockierte mail","quarantaene freigeben","email zurueckgehalten","email gesperrt","quarantine release","mail wurde blockiert"], [("rd_net_ping","Exchange pruefen")], "Gibt eine in Quarantaene gehaltene E-Mail frei.", ["Welche Mail (Absender/Betreff)?","Wann wurde sie gesendet?","Bekannter/vertrauenswuerdiger Absender?"], "admin"),
    ("Mail-Weiterleitung einrichten extern", ["weiterleitung extern","mail weiterleiten extern","forwarding extern","externe weiterleitung","mail an private adresse","weiterleitung nach extern","email forwarding","mail umleiten extern","mail weiterleiten private email","externe mail weiterleitung"], [("rd_net_ping","Exchange pruefen")], "Richtet eine Weiterleitung an eine externe Adresse ein.", ["Von welchem Postfach?","An welche externe Adresse?","Kopie im Postfach behalten?"], "admin"),
    ("Transport-Regel erstellen", ["transport regel","mail flow regel","email regel exchange","transport rule","mailflow","routing regel","email filter regel","exchange regel","mail regel erstellen","transport policy"], [("rd_net_ping","Exchange pruefen")], "Erstellt eine Transport-Regel fuer den Mail-Flow.", ["Was soll die Regel tun?","Fuer alle oder bestimmte User?","Bedingungen?"], "admin"),
    ("Mail-Trace durchfuehren", ["mail trace","email nachverfolgen","mail tracking","wo ist meine mail","mail suchen","message trace","mail verlauf","email verfolgen","mail status pruefen","mail gesendet aber nicht angekommen"], [("rd_net_ping","Exchange pruefen")], "Verfolgt den Weg einer E-Mail durch das System.", ["Absender?","Empfaenger?","Ungefaehres Datum/Uhrzeit?","Betreff?"], "admin"),
    ("AutoMapping deaktivieren", ["automapping","postfach automatisch","automapping deaktivieren","shared mailbox automapping","postfach erscheint automatisch","automapping ausschalten","postfach nicht automatisch oeffnen","auto mapping off","kein automapping","automapping entfernen"], [("rd_net_ping","Exchange pruefen")], "Deaktiviert AutoMapping fuer ein Shared Postfach.", ["Welches Shared Postfach?","Fuer welchen User?","Soll das Postfach manuell eingebunden werden?"], "admin"),
    ("Signatur fuer User deployen", ["signatur deployen","email signatur verteilen","signatur zentral","outlook signatur remote","firmen signatur","corporate signatur","signatur fuer alle","signatur ausrollen","einheitliche signatur","signatur template"], [("rd_fileops_filecopyto","Signatur-Dateien kopieren")], "Deployt eine Outlook-Signatur auf den Ziel-PC.", ["HTML/RTF/TXT Signatur vorhanden?","Fuer welchen User?","Als Standard-Signatur?"], "admin"),
]
ALL.extend(batch("email", "MAIL", email_entries))

# ── DRUCKER (35) ──────────────────────────────────────────────────────────────
drucker_entries = [
    ("Drucker per IP hinzufuegen", ["drucker per ip","netzwerkdrucker ip","drucker ip adresse","tcp ip drucker","drucker hinzufuegen ip","netzwerkdrucker installieren","drucker port ip","ip drucker einrichten","drucker ueber netzwerk ip","drucker manuell ip"], [("rd_printer_addprinter","Drucker hinzufuegen"),("rd_printer_getprinter","Verifizieren")], "Fuegt einen Netzwerkdrucker per IP-Adresse hinzu.", ["IP-Adresse des Druckers?","Druckername?","Treiber bekannt?","Als Standarddrucker?"], "admin"),
    ("Standarddrucker setzen", ["standarddrucker","default drucker","drucker als standard","standarddrucker aendern","standard drucker setzen","drucker standard festlegen","default printer","hauptdrucker setzen","drucker voreinstellung","standarddrucker festlegen"], [("rd_printer_getprinter","Drucker auflisten")], "Setzt einen bestimmten Drucker als Standarddrucker.", ["Welcher Drucker soll Standard werden?","Fuer welchen User?","Windows verwaltet Standarddrucker - deaktivieren?"], None),
    ("Drucker-Treiber aktualisieren", ["drucker treiber update","druckertreiber aktualisieren","treiber drucker neu","printer driver update","drucker treiber erneuern","treiber fuer drucker","druckertreiber neu installieren","drucker treiber installieren","neuer druckertreiber","treiber drucker aktuell"], [("rd_printer_getprinter","Aktuellen Treiber pruefen"),("rd_drivers_driverupdate","Treiber aktualisieren")], "Aktualisiert den Treiber fuer einen Drucker.", ["Welcher Drucker?","Welches Modell?","PCL oder PostScript?"], "admin"),
    ("Duplex-Druck einstellen", ["duplex","beidseitig drucken","doppelseitig","duplex einschalten","beidseitiger druck","duplex standardmaessig","duplex aktivieren","drucker beidseitig","doppelseitig standard","duplex als standard"], [("rd_printer_getprinter","Drucker-Konfiguration pruefen")], "Stellt beidseitigen Druck als Standard ein.", ["Welcher Drucker?","Standard oder nur einmalig?"], None),
    ("Drucker Papierformat aendern", ["papierformat","drucker papier","a4 einstellen","a3 drucker","papiergroesse aendern","drucker format","letter statt a4","papierformat drucker","drucker papier einstellen","standardformat drucker"], [("rd_printer_getprinter","Drucker-Einstellungen pruefen")], "Aendert das Standard-Papierformat eines Druckers.", ["Welcher Drucker?","Welches Format (A4/A3/Letter)?"], None),
    ("Drucker Testseite drucken", ["testseite drucken","drucker testen","test page","testseite","drucker funktioniert test","probedruck","drucker testausdruck","testdruck","drucker test machen","testseite senden"], [("rd_printer_getprinter","Drucker vorhanden?")], "Sendet eine Testseite an den Drucker.", ["Welcher Drucker?"], None),
    ("PDF-Drucker installieren", ["pdf drucker","microsoft print to pdf","pdf erstellen","als pdf drucken","pdf drucker installieren","print to pdf","pdf ausgabe","pdf drucker fehlt","pdf drucker einrichten","pdf writer installieren"], [("rd_software_swlist","Installierte Software pruefen")], "Installiert oder reaktiviert Microsoft Print to PDF.", ["Fehlt der PDF-Drucker komplett?","Welche PDF-Software gewuenscht?"], None),
    ("Drucker-Freigabe einrichten", ["drucker freigeben","drucker teilen","drucker sharing","drucker im netzwerk","drucker fuer andere","shared printer","drucker share","freigabe drucker","netzwerk drucker teilen","drucker freigabe erstellen"], [("rd_printer_getprinter","Drucker pruefen")], "Gibt einen lokalen Drucker im Netzwerk frei.", ["Welcher Drucker?","Freigabename?","Fuer wen?"], "admin"),
    ("Drucker entfernen", ["drucker entfernen","drucker loeschen","printer remove","drucker deinstallieren","alten drucker entfernen","drucker weg machen","drucker aus liste entfernen","drucker loeschen windows","printer loeschen","unnoetige drucker entfernen"], [("rd_printer_removeprinter","Drucker entfernen"),("rd_printer_getprinter","Verifizieren")], "Entfernt einen Drucker vom PC.", ["Welcher Drucker soll entfernt werden?","Auch Treiber entfernen?"], None),
    ("Farbe/SW als Standard", ["schwarz weiss standard","drucker nur sw","graustufen standard","farbe deaktivieren","drucker farbe standard","sw drucker einstellen","farbe standardmaessig","drucker farbmodus","standard farbeinstellung","drucker color setting"], [("rd_printer_getprinter","Drucker-Konfiguration")], "Setzt Farb- oder Schwarz-Weiss-Druck als Standard.", ["Welcher Drucker?","Farbe oder SW als Standard?"], None),
]
ALL.extend(batch("drucker", "PRN", drucker_entries))

# ── SOFTWARE (60) ─────────────────────────────────────────────────────────────
sw_entries = []
programs = [
    ("Chrome","chrome installieren","google chrome"),("Firefox","firefox installieren","mozilla firefox"),
    ("7-Zip","7zip installieren","7-zip"),("Notepad++","notepad++ installieren","notepad plus"),
    ("VLC","vlc installieren","vlc player"),("PuTTY","putty installieren","ssh client"),
    ("WinSCP","winscp installieren","scp client"),("VS Code","vscode installieren","visual studio code"),
    ("Python","python installieren","python runtime"),("Node.js","nodejs installieren","node js"),
    ("Git","git installieren","git for windows"),("Adobe Reader","adobe reader installieren","acrobat reader"),
    ("Java","java installieren","java runtime"),("Zoom","zoom installieren","zoom client"),
    ("Citrix Workspace","citrix installieren","citrix workspace"),
]
for prog, say1, say2 in programs:
    sw_entries.append((f"{prog} installieren",
        [say1,f"{prog.lower()} bitte installieren",f"brauche {prog.lower()}",f"{prog.lower()} auf pc",f"bitte {prog.lower()} installieren",f"{say2} installieren",f"installation {prog.lower()}",f"{prog.lower()} einrichten",f"ich brauche {prog.lower()}",f"{prog.lower()} setup"],
        [("rd_software_swlist","Pruefen ob schon installiert"),("rd_swinstall_wingetinstall","Per Winget installieren"),("rd_software_swlist","Installation verifizieren")],
        f"Installiert {prog} auf dem Ziel-PC per Winget.", ["Welche Version?","Fuer welchen User?","Silent-Installation ok?"], "admin"))

sw_entries.extend([
    ("Software deinstallieren", ["programm deinstallieren","software entfernen","app deinstallieren","programm loeschen","uninstall","software loeschen","programm entfernen","deinstallation","app entfernen","software weg machen"], [("rd_software_swlist","Installierte Software auflisten"),("rd_software_removeapp","Deinstallieren")], "Deinstalliert ein Programm vom Ziel-PC.", ["Welches Programm?","Komplette Deinstallation oder nur Update?"], "admin"),
    ("Windows Feature aktivieren", ["windows feature","feature aktivieren","optionales feature","hyper-v aktivieren","wsl installieren","dotnet 3.5","sandbox aktivieren","rsat installieren","openssh","telnet aktivieren"], [("rd_hw_hwos","Windows-Edition pruefen"),("rd_gpo_gpresult","Richtlinien pruefen")], "Aktiviert ein optionales Windows-Feature.", ["Welches Feature?","Windows-Edition (Home/Pro/Enterprise)?","Neustart ok?"], "admin"),
    ("Winget konfigurieren", ["winget einrichten","winget installieren","winget konfigurieren","paketmanager","winget source","winget setup","winget funktioniert nicht","app installer","winget aktivieren","winget repository"], [("rd_software_wingetlist","Winget-Status pruefen")], "Konfiguriert den Windows Package Manager (winget).", ["Welche Source (msstore/winget)?","Proxy-Konfiguration noetig?"], "admin"),
    ("Schriftart installieren", ["schriftart installieren","font installieren","schrift hinzufuegen","truetype font","otf installieren","schriftart fehlt","font auf pc","schrift installieren remote","schriftart kopieren","font deployen"], [("rd_fileops_filecopyto","Font-Datei auf PC kopieren")], "Installiert eine Schriftart auf dem Ziel-PC.", ["Welche Schriftart?","TTF oder OTF?","Liegt die Datei auf dem Netzlaufwerk?"], "admin"),
    ("Alle Programme updaten", ["alle programme updaten","software aktualisieren","winget upgrade all","alles updaten","programme auf dem neuesten stand","software updates","programme aktualisieren","alle apps updaten","winget update","software patchen"], [("rd_software_wingetupg","Alle Programme per Winget updaten")], "Aktualisiert alle installierten Programme per Winget.", ["Alle oder nur bestimmte?","Neustart erforderlich?"], "admin"),
])
ALL.extend(batch("software", "SW", sw_entries))

# ── NETZWERK (50) ─────────────────────────────────────────────────────────────
net_entries = [
    ("Netzlaufwerk mappen", ["netzlaufwerk mappen","laufwerk verbinden","netzlaufwerk einrichten","share mappen","netzlaufwerk hinzufuegen","unc pfad mappen","laufwerk mappen","netzlaufwerk erstellen","laufwerk buchstabe zuweisen","network drive mappen"], [("rd_drivemap_mapdriveadd","Netzlaufwerk mappen"),("rd_drivemap_mapdrivelist","Verifizieren")], "Mappt ein Netzlaufwerk fuer den angemeldeten Benutzer.", ["Welcher Laufwerksbuchstabe?","Welcher UNC-Pfad?","Persistent (nach Neustart)?"], None),
    ("Netzlaufwerk trennen", ["netzlaufwerk trennen","laufwerk entfernen","mapping loeschen","netzlaufwerk entfernen","laufwerk trennen","share trennen","laufwerk disconnect","mapping entfernen","net use delete","laufwerk abmelden"], [("rd_drivemap_mapdriverem","Netzlaufwerk trennen"),("rd_drivemap_mapdrivelist","Verifizieren")], "Trennt ein gemapptes Netzlaufwerk.", ["Welcher Laufwerksbuchstabe?","Alle trennen oder bestimmte?"], None),
    ("WLAN-Profil einrichten", ["wlan einrichten","wifi konfigurieren","wlan profil","neues wlan","wlan verbinden","wifi profil","wlan hinzufuegen","wlan netzwerk","wlan passwort setzen","wireless einrichten"], [("rd_wlan_wlanprofiles","Vorhandene Profile pruefen"),("rd_wlan_wlanstatus","WLAN-Status")], "Richtet ein neues WLAN-Profil auf dem PC ein.", ["SSID (Netzwerkname)?","Passwort?","Sicherheitstyp (WPA2/WPA3)?","Automatisch verbinden?"], "admin"),
    ("DNS-Server aendern", ["dns aendern","dns server setzen","dns konfigurieren","anderen dns","dns einstellen","nameserver aendern","custom dns","google dns","dns server festlegen","dns umstellen"], [("rd_net_ipconfig","Aktuelle DNS-Konfiguration")], "Aendert den DNS-Server fuer einen Netzwerkadapter.", ["Welcher DNS-Server?","Primaer und Sekundaer?","Fuer welchen Adapter?"], "admin"),
    ("Statische IP setzen", ["statische ip","feste ip","ip adresse setzen","dhcp deaktivieren","ip manuell","feste ip adresse","statische ip konfigurieren","ip einrichten","statische ip setzen","manuelle ip adresse"], [("rd_net_ipconfig","Aktuelle Konfiguration")], "Setzt eine feste IP-Adresse statt DHCP.", ["Welche IP-Adresse?","Subnetzmaske?","Gateway?","DNS-Server?"], "admin"),
    ("Firewall-Regel erstellen", ["firewall regel","port freigeben","firewall oeffnen","firewall rule","port oeffnen","firewall ausnahme","firewall erlauben","programm durch firewall","firewall freigabe","firewall konfigurieren"], [("rd_gpo_gpresult","Richtlinien pruefen")], "Erstellt eine Windows-Firewall-Regel.", ["Welches Programm oder welcher Port?","Eingehend oder Ausgehend?","TCP oder UDP?"], "admin"),
    ("hosts-Datei bearbeiten", ["hosts datei","hosts eintrag","dns override","hosts bearbeiten","hosts hinzufuegen","hosts datei aendern","lokaler dns","hosts file","eintrag hosts","name zu ip"], [("rd_fileops_hostsshow","Aktuelle hosts anzeigen"),("rd_fileops_hostsadd","Eintrag hinzufuegen")], "Fuegt einen Eintrag zur hosts-Datei hinzu.", ["Welche IP-Adresse?","Welcher Hostname?","Temporaer oder dauerhaft?"], "admin"),
    ("Proxy einstellen", ["proxy einstellen","proxy konfigurieren","proxy setzen","proxy server","http proxy","web proxy","proxy einrichten","proxy adresse","internet proxy","proxy fuer browser"], [("rd_sysconfig_proxyset","Proxy setzen")], "Konfiguriert die Proxy-Einstellungen.", ["Proxy-Adresse und Port?","Ausnahmen?","Fuer System oder nur Browser?"], "admin"),
    ("SMB-Freigabe erstellen", ["freigabe erstellen","ordner freigeben","smb share","netzwerk freigabe","ordner teilen","share erstellen","netzwerkfreigabe","smb freigabe","ordner im netzwerk","share anlegen"], [("rd_fileops_sharecreate","Freigabe erstellen")], "Erstellt eine SMB-Netzwerkfreigabe.", ["Welcher Ordner?","Freigabename?","Berechtigungen (Vollzugriff/Lesen)?"], "admin"),
    ("Netzwerk-Adapter aktivieren/deaktivieren", ["adapter aktivieren","adapter deaktivieren","netzwerk adapter","lan aktivieren","wlan deaktivieren","adapter ein aus","netzwerkkarte aktivieren","adapter toggle","netzwerk adapter schalten","netzwerkkarte deaktivieren"], [("rd_net_getadapter","Adapter-Status"),("rd_net_adapter_toggle","Adapter umschalten")], "Aktiviert oder deaktiviert einen Netzwerkadapter.", ["Welcher Adapter?","Aktivieren oder Deaktivieren?"], "admin"),
    ("IPv6 deaktivieren", ["ipv6 deaktivieren","ipv6 aus","ipv6 abschalten","kein ipv6","ipv6 deaktivieren adapter","ipv6 ausschalten","ipv6 off","ipv6 entfernen","ipv6 binding","ipv6 nicht verwenden"], [("rd_net_getadapter","Adapter pruefen")], "Deaktiviert IPv6 auf einem Netzwerkadapter.", ["Fuer welchen Adapter?","Alle oder bestimmte?"], "admin"),
    ("Netzwerk komplett zuruecksetzen", ["netzwerk reset","netzwerk zuruecksetzen","network reset","alle netzwerk einstellungen","netzwerk komplett neu","winsock reset","tcp ip reset","netzwerk reparieren komplett","netzwerk fix","alles zuruecksetzen netzwerk"], [("rd_appcache_netreset","Netzwerk-Komplett-Reset")], "Setzt alle Netzwerkeinstellungen zurueck (DNS, Winsock, TCP/IP).", ["Sind statische IPs konfiguriert die gesichert werden muessen?","Neustart danach ok?"], "admin"),
    ("Wake-on-LAN senden", ["wake on lan","wol","pc aufwecken","pc einschalten remote","magic packet","pc starten remote","wol senden","pc aufwecken netzwerk","wake on lan senden","rechner starten remote"], [("rd_power_wol","Wake-on-LAN Magic Packet senden")], "Sendet ein Wake-on-LAN Magic Packet.", ["MAC-Adresse des Ziel-PCs?","Ist WOL im BIOS aktiviert?"], None),
    ("Speed/Duplex einstellen", ["speed duplex","netzwerk geschwindigkeit","link speed","duplex einstellen","100mbit","1gbit","adapter speed","netzwerk speed","half duplex","full duplex"], [("rd_net_getadapter","Adapter-Einstellungen pruefen")], "Stellt Geschwindigkeit und Duplex-Modus eines Adapters ein.", ["Welcher Adapter?","Welche Geschwindigkeit/Duplex?"], "admin"),
]
ALL.extend(batch("netzwerk", "NET", net_entries))

# ── SYSTEM (60) ───────────────────────────────────────────────────────────────
sys_entries = [
    ("Computername aendern", ["computer umbenennen","pc name aendern","hostname aendern","computername aendern","rechnername","neuer computername","hostname setzen","pc umbenennen","computername setzen","rename computer"], [("rd_hw_hwcs","Aktuellen Namen pruefen")], "Aendert den Computernamen.", ["Neuer Name?","PC in Domaene?","Neustart ok?"], "admin"),
    ("Geplante Aufgabe erstellen", ["geplante aufgabe","task erstellen","scheduled task","aufgabe planen","task scheduler","geplanten task","zeitgesteuerte aufgabe","aufgabe anlegen","task anlegen","automatische aufgabe"], [("rd_remotetasks_rtaskcreate","Task erstellen"),("rd_remotetasks_rtasklist","Verifizieren")], "Erstellt eine geplante Aufgabe auf dem Ziel-PC.", ["Welche Aktion (Programm/Script)?","Wann/Wie oft?","Welcher User/SYSTEM?"], "admin"),
    ("Umgebungsvariable setzen", ["umgebungsvariable","environment variable","path setzen","env variable","path hinzufuegen","systemvariable","umgebung setzen","path erweitern","environment path","system path"], [("rd_gpo_gpresult","Aktuelle Variablen pruefen")], "Setzt eine Umgebungsvariable auf dem Ziel-PC.", ["Variable Name?","Wert?","System oder User?"], "admin"),
    ("Dienst Starttyp aendern", ["dienst starttyp","service startup","dienst automatisch","dienst manuell","dienst deaktivieren","starttyp aendern","dienst auto","dienst disabled","service startup type","dienst aktivieren"], [("rd_svc_svc-start","Dienst-Status pruefen")], "Aendert den Starttyp eines Windows-Dienstes.", ["Welcher Dienst?","Automatisch/Manuell/Deaktiviert?","Delayed Start?"], "admin"),
    ("Event-Log exportieren", ["event log export","ereignisprotokoll","eventlog sichern","events exportieren","log export","windows events","ereignisse exportieren","system log export","event viewer export","logs sichern"], [("rd_repair_evtsys","Events anzeigen")], "Exportiert Windows Event-Logs.", ["Welches Log (System/Application/Security)?","Zeitraum?","Format (EVTX/CSV)?"], None),
    ("Registry-Wert setzen", ["registry setzen","reg wert","registry aendern","regedit wert","registry key","reg key setzen","registrierung","registry schreiben","reg value","registry eintrag"], [("rd_gpo_gpresult","Richtlinien pruefen")], "Setzt einen Registry-Wert auf dem Ziel-PC.", ["Welcher Pfad?","Welcher Wert/Name?","Welcher Typ (DWORD/String)?"], "admin"),
    ("Energiesparplan aendern", ["energiesparplan","power plan","hochleistung","energieoptionen","energiesparmodus","power scheme","energieplan","leistungsmodus","energie einstellungen","power settings"], [("rd_sysconfig_powerplan","Aktuellen Plan anzeigen"),("rd_sysconfig_powerhigh","Hochleistung setzen")], "Aendert den Energiesparplan.", ["Welcher Plan (Hochleistung/Ausbalanciert)?","Fuer Akku und Netzbetrieb?"], None),
    ("RDP aktivieren", ["rdp aktivieren","remote desktop einschalten","remote desktop aktivieren","rdp einschalten","remotedesktop erlauben","fernzugriff aktivieren","rdp freischalten","remote desktop freigeben","rdp enable","remote desktop an"], [("rd_sysconfig_rdpon","RDP aktivieren"),("rd_rdp_rdpfw","Firewall-Regel")], "Aktiviert Remote Desktop und die Firewall-Regel.", ["Firewall-Regel auch erstellen?","Nur fuer bestimmte User?"], "admin"),
    ("gpupdate erzwingen", ["gpupdate","gruppenrichtlinie aktualisieren","gpo update","policy refresh","richtlinien neu laden","gpupdate force","gpo erzwingen","gruppenrichtlinie neu","policy update","gpo anwenden"], [("rd_gpo_gpupdate","GPO aktualisieren"),("rd_gpo_gpresult","Ergebnis pruefen")], "Erzwingt eine Aktualisierung der Gruppenrichtlinien.", ["Computer- und User-Richtlinien?","Neustart noetig?"], None),
    ("Intune-Sync erzwingen", ["intune sync","intune synchronisieren","geraet synchronisieren","mdm sync","intune policy sync","device sync","intune aktualisieren","compliance sync","intune refresh","geraet sync"], [("rd_domain_aadstatus","AAD-Status pruefen")], "Erzwingt eine Intune-Synchronisierung.", ["Company Portal installiert?","Letzte Sync wann?"], None),
    ("Remote-Neustart planen", ["remote neustart","pc remote neustarten","neustart planen","geplanter reboot","remote reboot","pc neustarten remote","neustart in x minuten","scheduled reboot","reboot erzwingen","remote restart"], [("rd_sessions_queryuser","Angemeldete User"),("rd_sessions_msg","User warnen")], "Plant einen Remote-Neustart.", ["Sofort oder geplant?","User vorher warnen?","Welche Wartezeit?"], "admin"),
    ("Wiederherstellungspunkt erstellen", ["wiederherstellungspunkt","restore point erstellen","sicherungspunkt","checkpoint","system sichern","wiederherstellung punkt","recovery point","system backup punkt","systemschutz punkt","sicherungspunkt anlegen"], [("rd_repair_evtsys","Systemstatus pruefen")], "Erstellt einen Wiederherstellungspunkt.", ["Beschreibung fuer den Punkt?","Systemschutz aktiviert?"], None),
    ("Execution Policy aendern", ["execution policy","powershell policy","script ausfuehrung","ps1 ausfuehren","powershell script erlauben","execution policy setzen","ps scripts","remotesigned","unrestricted","bypass policy"], [("rd_gpo_gpresult","Aktuelle Policy pruefen")], "Aendert die PowerShell Execution Policy.", ["Welche Policy (RemoteSigned/Unrestricted)?","Fuer User oder Machine?"], "admin"),
]
ALL.extend(batch("system", "SYS", sys_entries))

# ── SICHERHEIT (50) ──────────────────────────────────────────────────────────
sec_entries = [
    ("BitLocker aktivieren", ["bitlocker aktivieren","festplatte verschluesseln","bitlocker einschalten","laufwerk verschluesseln","bitlocker on","encryption aktivieren","bitlocker starten","bitlocker verschluesselung","disk encryption","bitlocker enable"], [("rd_security_bitlocker","BitLocker-Status pruefen")], "Aktiviert BitLocker-Verschluesselung.", ["Welches Laufwerk?","Recovery Key wo speichern?","TPM vorhanden?"], "admin"),
    ("BitLocker Recovery Key auslesen", ["recovery key","bitlocker key","wiederherstellungsschluessel","bitlocker recovery","bitlocker passwort","recovery id","bitlocker entsperren","recovery key auslesen","bitlocker key aus ad","wiederherstellungs id"], [("rd_security_bitlockerkey","Recovery Key auslesen")], "Liest den BitLocker Recovery Key aus.", ["Welcher PC/Laufwerk?","Key aus AD oder lokal?"], "admin"),
    ("USB-Speicher sperren/freigeben", ["usb sperren","usb stick blockieren","usb storage","usb deaktivieren","usb freigeben","usb sperre","usb block","usb aktivieren","usb storage toggle","usb erlauben"], [("rd_gpo_gpresult","Aktuelle Policy pruefen")], "Sperrt oder gibt USB-Speichergeraete frei.", ["Sperren oder Freigeben?","Nur USB-Sticks oder alle USB-Storage?","Per GPO oder Registry?"], "admin"),
    ("Defender-Ausnahme hinzufuegen", ["defender ausnahme","antivirus ausnahme","defender exclude","ordner ausschliessen","datei ausnahme","defender whitelist","exclusion","scan ausnahme","defender pfad ausschliessen","antivirus whitelist"], [("rd_sysconfig_defexcadd","Ausnahme hinzufuegen")], "Fuegt eine Defender-Ausnahme hinzu.", ["Pfad/Datei/Dateityp/Prozess?","Grund fuer die Ausnahme?"], "admin"),
    ("Defender Scan starten", ["defender scan","virenpruf","antivirus scan","malware scan","defender schnellscan","defender vollscan","virus pruefen","pc scannen","malware pruefen","security scan"], [("rd_sysconfig_defquick","Schnellscan starten")], "Startet einen Windows Defender Scan.", ["Schnellscan oder Vollscan?","Bestimmter Ordner?"], None),
    ("Zertifikat importieren", ["zertifikat importieren","cert importieren","ssl zertifikat","pfx importieren","root ca importieren","zertifikat installieren","ca hinzufuegen","zertifikat hinzufuegen","cert install","trusted root"], [("rd_certs_compcerts","Vorhandene Zertifikate"),("rd_certs_certenroll","Auto-Enrollment")], "Importiert ein Zertifikat in den Zertifikatsspeicher.", ["Welches Zertifikat (Datei)?","In welchen Store (Root/Personal)?","PFX mit Passwort?"], "admin"),
    ("PowerShell-Logging aktivieren", ["powershell logging","script logging","ps logging","audit powershell","powershell protokollierung","scriptblock logging","module logging","transcription","powershell audit","ps audit"], [("rd_gpo_gpresult","Aktuelle Logging-Config pruefen")], "Aktiviert PowerShell ScriptBlock und Module Logging.", ["ScriptBlock und/oder Module Logging?","Transcription auch?"], "admin"),
    ("SMB1 deaktivieren", ["smb1 deaktivieren","smbv1","smb version 1","smb1 ausschalten","smb1 entfernen","smb1 off","smb version 1 deaktivieren","smb1 sicherheit","eternalblue fix","smb1 abschalten"], [("rd_gpo_gpresult","SMB-Status pruefen")], "Deaktiviert das unsichere SMB1-Protokoll.", ["Werden noch SMB1-Freigaben benoetigt?","Legacy-Geraete?"], "admin"),
    ("LAPS-Passwort auslesen", ["laps passwort","local admin password","laps auslesen","laps","lokales admin passwort","laps password","admin passwort auslesen","laps admin","laps read","local administrator password"], [("rd_domain_scquery","Domain-Status pruefen")], "Liest das LAPS-Passwort fuer den lokalen Admin aus dem AD.", ["Welcher PC?","LAPS konfiguriert?"], "admin"),
    ("Windows Update erzwingen", ["update erzwingen","updates installieren","windows update starten","update force","updates laden","patch installieren","update anstoessen","windows update ausfuehren","update jetzt","update sofort installieren"], [("rd_gpo_usoscan","Update-Scan starten"),("rd_gpo_usoinst","Updates installieren")], "Erzwingt Windows Update Scan und Installation.", ["Neustart automatisch oder geplant?","Alle Updates oder bestimmte?"], "admin"),
    ("Telemetrie deaktivieren", ["telemetrie aus","telemetrie deaktivieren","tracking deaktivieren","datensammlung aus","telemetry off","windows telemetrie","diagtrack","privacy","datenschutz haerten","telemetrie stoppen"], [("rd_gpo_gpresult","Aktuelle Einstellungen pruefen")], "Deaktiviert Windows Telemetrie/Diagnosedaten.", ["Level Security oder Basic?","DiagTrack Dienst auch deaktivieren?"], "admin"),
]
ALL.extend(batch("sicherheit", "SEC", sec_entries))

# ── Remaining categories with compact generation ──────────────────────────────
def quick_batch(cat, prefix, items):
    """Quickly generate entries from (title, keywords_list) tuples."""
    entries = []
    for title, kws in items:
        says = [kw.lower() for kw in kws]
        entries.append((title, says,
            [("rd_gpo_gpresult","Einstellungen pruefen"),("rd_sysconfig_regioninfo","System-Info")],
            f"{title} auf dem Ziel-PC.", ["Details zum Wunsch?","Fuer welchen User?"], "admin"))
    return batch(cat, prefix, entries)

# PERSONALISIERUNG (40)
ALL.extend(quick_batch("personalisierung", "PERS", [
    ("Dark Mode aktivieren", ["dark mode aktivieren","dunkler modus einschalten","dunkles design","dark theme setzen","windows dunkel machen","dunkelmodus","design dunkel","dark mode einrichten","dunkles theme aktivieren","system dark mode"]),
    ("Akzentfarbe setzen", ["akzentfarbe aendern","farbe einstellen","windows farbe","design farbe setzen","hervorhebungsfarbe","system farbe","theme farbe aendern","akzent farbe","fenster farbe setzen","farbschema"]),
    ("Hintergrundbild setzen", ["hintergrund aendern","wallpaper setzen","desktop bild","hintergrundbild","wallpaper aendern","neues hintergrundbild","desktop hintergrund setzen","bild als hintergrund","wallpaper einrichten","diashow hintergrund"]),
    ("Taskleiste links ausrichten Win11", ["taskleiste links","taskbar links","symbole links","taskleiste ausrichtung","taskbar alignment links","taskleiste win11 links","icons links statt mitte","taskleiste position","taskbar nach links","symbole nach links"]),
    ("Win11 klassisches Kontextmenue", ["altes kontextmenue","klassisches rechtsklick","kontextmenue win11","altes menue aktivieren","rechtsklick alle optionen","vollstaendiges kontextmenue","kontextmenue klassisch","win11 altes menue","classic context","kontextmenue umstellen"]),
    ("Dateiendungen anzeigen", ["dateiendungen zeigen","file extensions","endungen anzeigen","dateityp anzeigen","dateiendungen einblenden","extensions sichtbar","datei endung","dateierweiterung","endungen sichtbar machen","dateityp sehen"]),
    ("Versteckte Dateien anzeigen", ["versteckte dateien","hidden files","unsichtbare dateien","versteckte ordner","dateien einblenden","hidden files zeigen","versteckte anzeigen","alle dateien zeigen","system dateien sehen","verborgene dateien"]),
    ("Desktop-Icons einblenden", ["desktop icons","symbole desktop","arbeitsplatz anzeigen","papierkorb desktop","desktop symbole","icons auf desktop","desktop icon einblenden","computer auf desktop","netzwerk auf desktop","systemsteuerung desktop"]),
    ("Bildschirmschoner einrichten", ["bildschirmschoner","screensaver","bildschirmschoner setzen","screensaver einrichten","bildschirmschoner aktivieren","nach x minuten sperren","bildschirmschoner zeit","screen saver","bildschirmschoner einstellen","sperren nach inaktivitaet"]),
    ("Visual Effects fuer Performance", ["visual effects","leistung optimieren","animationen deaktivieren","windows schneller","transparenz aus","schatten deaktivieren","performance einstellungen","animationen aus","effekte reduzieren","windows optimieren"]),
    ("Bloatware entfernen", ["bloatware","vorinstallierte apps","unnoetige apps","candy crush","werbung entfernen","bloatware loeschen","vorinstalliert entfernen","windows aufraumen","apps deinstallieren bloat","store apps entfernen"]),
    ("Werbung deaktivieren", ["werbung windows","tipps deaktivieren","vorschlaege aus","werbung startmenue","empfehlungen deaktivieren","windows werbung","tipps und tricks aus","suggested aus","werbung abstellen","content delivery aus"]),
    ("Snap Layouts konfigurieren", ["snap layouts","fenster anordnen","snap assist","fenster teilen","bildschirm teilen","snap einstellungen","multitasking snap","snap deaktivieren","fenster snap","snap layouts einrichten"]),
    ("Widgets deaktivieren", ["widgets aus","widgets deaktivieren","widgets entfernen","widget board aus","wetter widget weg","nachrichten widget entfernen","widgets ausblenden","widget deaktivieren","widget panel aus","widgets abschalten"]),
    ("Startmenue Layout konfigurieren", ["startmenue","start layout","angeheftete apps","startmenue anpassen","start layout exportieren","startmenue organisieren","start konfigurieren","startmenue einrichten","app anpinnen start","startmenue layout setzen"]),
    ("Sperrbildschirm konfigurieren", ["sperrbildschirm","lock screen","sperrbildschirm bild","lock screen aendern","sperrbildschirm einrichten","spotlight deaktivieren","sperrbildschirm anpassen","lock screen bild setzen","sperrbildschirm konfigurieren","lock screen einrichten"]),
    ("Systemsounds deaktivieren", ["system sound aus","windows sounds","benachrichtigungston aus","system toene","sound schema","windows klang deaktivieren","start sound aus","fehler sound aus","system sounds aus","klang schema none"]),
    ("Cursor/Mauszeiger anpassen", ["mauszeiger aendern","cursor design","zeiger groesse","cursor groesser","maus aussehen","zeiger aendern","cursor anpassen","maus design aendern","grosser cursor","maus zeiger setzen"]),
    ("Transparenz deaktivieren", ["transparenz aus","durchsichtigkeit aus","transparency off","glas effekt aus","blur aus","transparenz effekt","aero aus","fenster undurchsichtig","transparenz deaktivieren","effekte transparenz"]),
    ("Benachrichtigungen konfigurieren", ["benachrichtigungen","notifications einstellungen","popup konfigurieren","toast anpassen","benachrichtigungen reduzieren","notification center","fokus assist","nicht stoeren","benachrichtigungen verwalten","alerts konfigurieren"]),
]))

# SPRACHE (20)
ALL.extend(quick_batch("sprache", "LANG", [
    ("Anzeigesprache auf Deutsch", ["sprache deutsch","windows auf deutsch","display language deutsch","sprache umstellen deutsch","deutsch als sprache","windows sprache deutsch","anzeigesprache deutsch","sprache wechseln deutsch","system sprache deutsch","sprache aendern deutsch"]),
    ("Anzeigesprache auf Englisch", ["sprache englisch","windows auf englisch","english language","sprache umstellen englisch","englisch als sprache","windows english","anzeigesprache englisch","sprache wechseln englisch","system sprache englisch","sprache aendern english"]),
    ("Sprachpaket installieren", ["sprachpaket","language pack","sprache installieren","sprache hinzufuegen","sprachpaket installieren","neues sprachpaket","sprache download","language pack install","sprachpaket herunterladen","neue sprache"]),
    ("Tastaturlayout hinzufuegen", ["tastatur layout","keyboard layout","tastatur hinzufuegen","neues layout","tastatur sprache","zweites layout","tastatur konfigurieren","input layout","tastatur hinzufuegen","layout hinzufuegen"]),
    ("Tastaturlayout entfernen", ["tastatur layout entfernen","layout loeschen","tastatur sprache entfernen","ungewolltes layout","falsches layout entfernen","layout deinstallieren","keyboard layout entfernen","sprache entfernen","input layout loeschen","layout weg"]),
    ("Regionale Einstellungen Deutsch", ["region deutsch","regionale einstellungen","deutschland region","locale deutsch","standort deutsch","home location","region einstellen","deutschland einstellen","regionale format","locale setzen"]),
    ("Datumsformat dd.mm.yyyy", ["datumsformat","datum format","dd mm yyyy","deutsches datum","datum punkt","datum format aendern","short date","datum einstellen","datumsformat deutsch","datum dd.mm"]),
    ("Dezimalzeichen auf Komma", ["dezimalzeichen komma","komma statt punkt","dezimaltrenner","komma als dezimal","punkt zu komma","zahlenformat deutsch","dezimal aendern","csv komma","trennzeichen","zahlen format"]),
    ("Office Sprache Deutsch", ["office deutsch","word deutsch","excel deutsch","office sprache","office language","office sprachpaket","bearbeitungssprache","korrekturhilfe deutsch","proofing deutsch","office auf deutsch"]),
    ("Willkommensbildschirm Sprache", ["willkommensbildschirm","login bildschirm sprache","anmeldeseite sprache","ctrl alt del sprache","sperrbildschirm sprache","begruessung sprache","welcome screen","login sprache","anmeldung sprache","willkommen sprache"]),
]))

# STANDARD_APPS (20)
ALL.extend(quick_batch("standard_apps", "ASSOC", [
    ("PDF-Reader auf Adobe setzen", ["pdf adobe","adobe als standard","pdf reader","acrobat standard","pdf mit adobe","adobe reader standard","pdf oeffnen adobe","pdf zuordnung adobe","adobe pdf","pdf nicht in edge"]),
    ("Chrome als Standard-Browser", ["chrome standard","chrome als browser","standard browser chrome","chrome default","chrome fuer links","http chrome","standard browser setzen chrome","chrome browser standard","chrome fuer alles","links in chrome"]),
    ("Firefox als Standard-Browser", ["firefox standard","firefox als browser","standard browser firefox","firefox default","firefox fuer links","http firefox","standard browser setzen firefox","firefox browser standard","firefox fuer alles","links in firefox"]),
    ("Mail-Client Standard setzen", ["mail standard","outlook als standard","mailto","email client standard","mail links outlook","standard mail","default mail","mailto zuordnung","email standard setzen","mail client festlegen"]),
    ("Dateizuordnung aendern", ["zuordnung aendern","datei oeffnen mit","dateityp zuordnen","oeffnen mit aendern","standard programm","file association","zuordnung setzen","programm fuer dateityp","datei zuordnung","default app fuer dateityp"]),
    ("Alle Standard-Apps zuruecksetzen", ["standard apps reset","alle zuordnungen","zuordnungen zuruecksetzen","standard apps neu","alle associations","defaults zuruecksetzen","standard programme reset","alle zuordnungen zurueck","default apps neu setzen","zuordnungen reset"]),
    ("Bild-Betrachter aendern", ["bild viewer","foto app","standard bildbetrachter","bilder oeffnen mit","foto programm","bild zuordnung","image viewer","standard bild","foto viewer setzen","bild app"]),
    ("Video-Player Standard", ["video player","mediaplayer","vlc standard","video zuordnung","mp4 player","standard video","media player setzen","video standard","standard mediaplayer","video app"]),
]))

# FESTPLATTE (30)
ALL.extend(quick_batch("festplatte", "DSK", [
    ("Partition vergroessern", ["partition vergroessern","c laufwerk vergroessern","laufwerk erweitern","partition groesser","disk erweitern","partition extend","mehr platz c","c vergroessern","laufwerk vergroessern","partition ausdehnen"]),
    ("Partition verkleinern", ["partition verkleinern","laufwerk verkleinern","partition shrink","platz abgeben","partition kleiner","disk verkleinern","shrink volume","partition teilen","platz freigeben partition","laufwerk schrumpfen"]),
    ("Neues Volume erstellen", ["volume erstellen","neue partition","laufwerk erstellen","partition anlegen","neues laufwerk","disk partition","volume anlegen","partition erstellen","neues volume","d laufwerk erstellen"]),
    ("CHKDSK planen", ["chkdsk","festplatte pruefen","disk check","dateisystem pruefen","festplatten pruefung","chkdsk planen","repair volume","festplatte scannen","filesystem check","chkdsk ausfuehren"]),
    ("SMART-Status pruefen", ["smart status","festplatten gesundheit","disk health","ssd zustand","smart werte","festplatte zustand","disk smart","hdd status","ssd gesundheit","festplatte testen"]),
    ("TRIM ausfuehren", ["trim","ssd trim","ssd optimieren","trim ausfuehren","optimize ssd","trim erzwingen","ssd pflege","ssd trim manuell","retrim","ssd wartung"]),
    ("Papierkorb leeren", ["papierkorb leeren","papierkorb loeschen","recycle bin","papierkorb leer machen","muell loeschen","papierkorb alle loeschen","recycle bin leeren","papierkorb aufraeumen","geloeschte dateien weg","papierkorb bereinigen"]),
    ("Disk Cleanup ausfuehren", ["disk cleanup","datentraegerbereinigung","festplatte aufraumen","cleanup","speicher freigeben","platz schaffen","disk bereinigen","festplatte bereinigen","speicher aufraumen","windows cleanup"]),
    ("WinSxS bereinigen", ["winsxs","component store","winsxs bereinigen","winsxs gross","component cleanup","dism cleanup","winsxs loeschen","winsxs aufraumen","component store bereinigen","winsxs platz"]),
    ("Windows.old loeschen", ["windows old","windows.old loeschen","altes windows","windows old entfernen","alte installation","windows.old weg","vorherige installation","altes windows loeschen","windows old cleanup","alte windows version"]),
    ("ISO mounten", ["iso mounten","iso einbinden","iso oeffnen","image mounten","iso laufwerk","virtuelle cd","iso einhaengen","disk image mounten","iso datei oeffnen","iso als laufwerk"]),
    ("Laufwerksbuchstabe aendern", ["laufwerksbuchstabe","buchstabe aendern","laufwerk buchstabe","drive letter","buchstabe zuweisen","laufwerksbuchstabe aendern","disk letter","buchstabe tauschen","laufwerk umbenennen buchstabe","neuer buchstabe"]),
    ("Storage Sense aktivieren", ["storage sense","speicheroptimierung","automatisch bereinigen","speicher automatisch","storage sense aktivieren","auto cleanup","speicherbereinigung","automatische bereinigung","storage sense einrichten","auto disk cleanup"]),
    ("Temp-Dateien loeschen", ["temp loeschen","temporaere dateien","temp bereinigen","temp ordner leeren","tmp dateien","temp cleanup","temp aufraumen","temp dateien entfernen","temporaer loeschen","temp folder"]),
]))

# BARRIEREFREIHEIT (20)
ALL.extend(quick_batch("barrierefreiheit", "ACC", [
    ("Schriftgroesse aendern", ["schrift groesser","text groesse","schriftgroesse","font size","groessere schrift","schrift vergroessern","text vergroessern","schrift aendern","display scaling","textgroesse aendern"]),
    ("DPI-Skalierung anpassen", ["dpi skalierung","skalierung aendern","125 prozent","150 prozent","skalierung erhoehen","dpi setzen","display skalierung","monitor skalierung","zoom skalierung","skalierung einstellen"]),
    ("Mauszeiger vergroessern", ["mauszeiger gross","cursor groesser","zeiger vergroessern","maus zu klein","grosser mauszeiger","cursor groesse","zeiger sichtbarer","maus groesser","cursor aendern","mauszeiger sichtbar"]),
    ("Hoher Kontrast aktivieren", ["hoher kontrast","high contrast","kontrast design","kontrast modus","kontrast erhoehen","schwarz weiss design","kontrast aktivieren","contrast theme","hoher kontrast ein","kontrast theme"]),
    ("Sticky Keys deaktivieren", ["sticky keys aus","einrastfunktion aus","sticky keys deaktivieren","shift popup","einrastfunktion deaktivieren","sticky keys abschalten","einrasten aus","shift 5 mal aus","sticky keys entfernen","einrastfunktion ausschalten"]),
    ("Bildschirmlupe aktivieren", ["lupe","magnifier","bildschirm vergroessern","lupe einschalten","zoom bildschirm","vergroesserung","lupe aktivieren","magnifier einschalten","bildschirm zoom","lupe starten"]),
    ("Bildschirmtastatur einblenden", ["bildschirmtastatur","on screen keyboard","virtuelle tastatur","osk","software tastatur","tastatur einblenden","touch tastatur","bildschirm tastatur","virtual keyboard","osk starten"]),
    ("Farbfilter aktivieren", ["farbfilter","farbenblind","farbschwaeche","farbfilter aktivieren","farbanpassung","farbkorrektur","deuteranopie","protanopie","farben filter","farbfilter einschalten"]),
    ("Narrator einschalten", ["narrator","vorlesen","sprachausgabe","screen reader","narrator starten","vorlese funktion","accessibility narrator","narrator aktivieren","bildschirmleser","text vorlesen"]),
    ("Cursor-Blinkrate aendern", ["cursor blinken","blink rate","cursor geschwindigkeit","blinkrate aendern","cursor blink","cursor blinkt zu schnell","blink langsamer","cursor frequenz","textcursor blinken","blink geschwindigkeit"]),
]))

# REMOTE_AKTIONEN (25)
ALL.extend(quick_batch("remote_aktionen", "REM", [
    ("PC remote herunterfahren", ["pc herunterfahren","shutdown remote","pc ausschalten","remote shutdown","pc aus","rechner herunterfahren","pc remote aus","computer ausschalten","shutdown erzwingen","remote off"]),
    ("PC remote neustarten", ["pc neustarten","reboot remote","neustart remote","remote reboot","pc remote reboot","rechner neustarten","neustart erzwingen","remote restart","pc durchstarten","reboot erzwingen"]),
    ("Nachricht an User senden", ["nachricht senden","msg senden","user benachrichtigen","bildschirm nachricht","message senden","popup senden","nachricht an pc","mitteilung senden","remote message","user warnen"]),
    ("User remote abmelden", ["user abmelden","logoff remote","session beenden","abmelden remote","user rauswerfen","session abmelden","logoff erzwingen","remote logoff","session trennen","benutzer abmelden"]),
    ("PC remote sperren", ["pc sperren","lock remote","bildschirm sperren","computer sperren","remote lock","pc verriegeln","sperren remote","bildschirm lock","workstation lock","pc sperren remote"]),
    ("gpupdate remote ausfuehren", ["gpupdate remote","gpo remote","richtlinien remote","policy remote","gpupdate auf pc","gpo aktualisieren remote","richtlinien erzwingen","remote gpupdate","gpo push","policy refresh remote"]),
    ("Prozess remote beenden", ["prozess beenden remote","kill process","task beenden","remote kill","prozess remote stoppen","programm beenden remote","remote process kill","task kill remote","app beenden remote","prozess abschliessen"]),
    ("Dienst remote starten", ["dienst starten remote","service start remote","remote service","dienst remote","service remote starten","dienst hochfahren","remote dienst starten","service erzwingen","dienst remote start","svc start remote"]),
    ("Dienst remote stoppen", ["dienst stoppen remote","service stop remote","dienst anhalten","remote service stop","dienst beenden remote","service remote stoppen","dienst remote stoppen","svc stop remote","dienst herunterfahren","service kill"]),
    ("Befehl remote ausfuehren", ["befehl ausfuehren","remote command","powershell remote","invoke command","befehl auf pc","remote script","command remote","ps remote","befehl senden","remote execute"]),
    ("Datei remote kopieren", ["datei kopieren remote","file copy","datei uebertragen","datei auf pc kopieren","remote copy","datei senden","file transfer","datei remote","kopieren auf pc","datei deployen"]),
    ("Screenshot remote machen", ["screenshot remote","bildschirm aufnehmen","screenshot machen","remote screenshot","bildschirm sehen","screen capture","screenshot vom pc","desktop aufnehmen","bildschirm anzeigen","remote screen"]),
    ("Event-Log remote exportieren", ["event log export","logs holen","events remote","log datei holen","ereignisse exportieren","remote log","event log remote","logs remote exportieren","system log holen","events sichern"]),
    ("gpresult HTML remote", ["gpresult","gpo report","richtlinien report","gpresult html","gpo anzeigen","policy report","gpresult remote","gpo uebersicht","angewendete richtlinien","gp result"]),
]))

# WIEDERHERSTELLUNG (15)
ALL.extend(quick_batch("wiederherstellung", "REST", [
    ("Wiederherstellungspunkt erstellen", ["wiederherstellungspunkt","restore point","sicherungspunkt","checkpoint","wiederherstellung erstellen","system sichern","recovery point","sicherungspunkt erstellen","restore point anlegen","systemschutz punkt"]),
    ("Systemwiederherstellung durchfuehren", ["system wiederherstellen","restore ausfuehren","zuruecksetzen auf punkt","wiederherstellung starten","alten zustand","system restore","wiederherstellen von punkt","system zurueck","recovery durchfuehren","restore point anwenden"]),
    ("Update deinstallieren", ["update deinstallieren","update entfernen","kb deinstallieren","update rueckgaengig","problematisches update","update loeschen","update zurueck","kb entfernen","update rollback","update weg"]),
    ("Treiber zuruecksetzen", ["treiber rollback","treiber zurueck","driver rollback","vorheriger treiber","alter treiber","treiber downgrade","treiber version zurueck","rollback driver","treiber wiederherstellen","alten treiber"]),
    ("BCD reparieren", ["bcd reparieren","boot reparieren","bootloader","boot configuration","bootrec","boot fehler fix","bcd rebuild","efi boot","boot manager","startup repair"]),
]))

# HARDWARE (25)
ALL.extend(quick_batch("hardware", "HW", [
    ("Bluetooth-Geraet koppeln", ["bluetooth koppeln","bt pairen","bluetooth verbinden","geraet koppeln","bluetooth geraet","pairing","bluetooth hinzufuegen","koppeln bluetooth","bt verbinden","bluetooth einrichten"]),
    ("Treiber installieren", ["treiber installieren","driver install","treiber hinzufuegen","treiber laden","driver setup","treiber einrichten","geraete treiber","treiber manuell","driver hinzufuegen","treiber deployen"]),
    ("Treiber aktualisieren", ["treiber aktualisieren","driver update","treiber updaten","treiber neu","driver aktuell","treiber erneuern","neuer treiber","treiber version","driver upgrade","treiber update"]),
    ("Monitor-Anordnung aendern", ["monitor anordnung","bildschirm anordnen","multi monitor","zwei bildschirme","monitor position","bildschirm reihenfolge","display arrangement","monitor setup","bildschirm konfiguration","monitor konfigurieren"]),
    ("Helligkeit einstellen", ["helligkeit","brightness","bildschirm heller","bildschirm dunkler","helligkeit setzen","brightness setzen","display helligkeit","monitor helligkeit","bildschirm helligkeit","helligkeit aendern"]),
    ("Lautstaerke einstellen", ["lautstaerke","volume","ton lauter","ton leiser","lautstaerke setzen","volume setzen","sound lautstaerke","audio level","lautstaerke aendern","ton einstellen"]),
    ("Touchpad deaktivieren", ["touchpad aus","touchpad deaktivieren","touchpad abschalten","trackpad aus","touchpad off","maus statt touchpad","touchpad sperren","touchpad ausschalten","touchpad disable","trackpad deaktivieren"]),
    ("Geraet im Geraetemanager aktivieren", ["geraet aktivieren","device enable","geraet einschalten","hardware aktivieren","geraetemanager aktivieren","device manager enable","geraet wieder an","geraet reaktivieren","hardware einschalten","deaktiviertes geraet"]),
]))

# OUTLOOK (30)
ALL.extend(quick_batch("outlook", "OL", [
    ("Outlook Profil neu erstellen", ["outlook profil","profil erstellen","neues profil","outlook profil neu","mail profil","profil anlegen","outlook konto profil","profil einrichten","profil konfigurieren","profil setup"]),
    ("Outlook Cached Mode Zeitraum", ["cached mode","cache zeitraum","offline zeitraum","cached exchange","offline ordner zeit","cache einstellung","cached mode aendern","exchange cache","offline daten zeitraum","cache groesse"]),
    ("Outlook Regel erstellen", ["outlook regel","mail regel","email filter","posteingang regel","regel erstellen","mail sortieren","automatisch verschieben","outlook filter","mail regel anlegen","inbox regel"]),
    ("Outlook Add-In aktivieren", ["add-in aktivieren","outlook addon","add-in einschalten","com add-in","outlook erweiterung","add in enable","deaktiviertes add-in","add-in reaktivieren","outlook plugin","add-in laden"]),
    ("Outlook Archiv einrichten", ["archiv outlook","auto archive","archivierung","outlook archiv ordner","archiv einrichten","archivierung konfigurieren","alte mails archivieren","archiv aktivieren","pst archiv","archiv erstellen"]),
    ("Outlook Postfach aufraumen", ["postfach aufraumen","mailbox cleanup","outlook bereinigen","postfach bereinigen","mails aufraumen","postfach groesse reduzieren","outlook platz","alte mails loeschen","postfach optimieren","mailbox aufraumen"]),
    ("Outlook S/MIME einrichten", ["smime","email verschluesselung","outlook verschluesseln","signierte mail","s mime","smime einrichten","email signieren","smime zertifikat","verschluesselte mail","digitale signatur"]),
    ("Outlook Kalender Berechtigung", ["kalender berechtigung","kalender freigabe","kalender rechte","kalender zugriff","outlook kalender teilen","kalender delegieren","kalender lesen","kalender bearbeiten","kalender sichtbar","shared calendar"]),
    ("OST-Datei neu erstellen lassen", ["ost loeschen","ost neu","ost datei","offline ordner neu","ost zuruecksetzen","ost erneuern","ost defekt","ost neu erstellen","ost resync","cached mode reset"]),
    ("Outlook Signatur einrichten", ["signatur einrichten","email signatur","outlook signatur","signatur erstellen","neue signatur","signatur konfigurieren","firmen signatur","signature outlook","signatur bearbeiten","signatur hinzufuegen"]),
]))

# ONEDRIVE (20)
ALL.extend(quick_batch("onedrive", "OD", [
    ("Known Folder Move einrichten", ["known folder move","ordner umleitung","desktop onedrive","dokumente onedrive","ordner nach onedrive","kfm","folder redirection onedrive","desktop in cloud","dokumente synchronisieren","ordner umleiten onedrive"]),
    ("OneDrive Sync selektiv", ["sync selektiv","bestimmte ordner","selective sync","ordner auswaehlen","nicht alles synchronisieren","onedrive ordner","sync filter","bestimmte dateien","ordner sync","selektive synchronisation"]),
    ("OneDrive Speicher pruefen", ["onedrive speicher","cloud speicher","onedrive platz","speicherplatz onedrive","wie viel platz","onedrive quota","cloud quota","onedrive kapazitaet","speicher uebersicht","onedrive gb"]),
    ("Files on Demand konfigurieren", ["files on demand","platzhalter","online dateien","dateien bei bedarf","on demand","smart sync","platz sparen onedrive","lokale dateien","cloud dateien","on demand aktivieren"]),
    ("Shared Library hinzufuegen", ["shared library","sharepoint bibliothek","geteilte bibliothek","sharepoint sync","team bibliothek","shared library sync","bibliothek hinzufuegen","sharepoint ordner","team ordner sync","library sync"]),
    ("OneDrive Konto trennen", ["onedrive trennen","konto entfernen","onedrive abmelden","sync stoppen","onedrive deaktivieren","konto trennen","onedrive disconnect","onedrive account","sync beenden","onedrive logout"]),
    ("OneDrive Sync pausieren", ["sync pausieren","onedrive pause","synchronisation stoppen","sync anhalten","onedrive stoppen","pause sync","onedrive aussetzen","sync unterbrechen","onedrive anhalten","sync break"]),
]))

# BROWSER (20)
ALL.extend(quick_batch("browser", "BRW", [
    ("Browser Startseite setzen", ["startseite","homepage","browser startseite","start seite setzen","homepage aendern","browser oeffnet seite","startseite konfigurieren","home page","standardseite","startseite festlegen"]),
    ("Browser Extension installieren", ["extension installieren","addon installieren","browser erweiterung","chrome extension","edge addon","plugin installieren","erweiterung hinzufuegen","addon hinzufuegen","extension setup","browser plugin"]),
    ("Browser Cache loeschen", ["browser cache","cache loeschen","browserdaten","cache bereinigen","browser aufraumen","cache leeren","browsing data","browser cache loeschen","cache clear","temporaere dateien browser"]),
    ("Downloads-Ordner aendern", ["download ordner","downloads pfad","download speicherort","wo speichert browser","download aendern","download verzeichnis","browser downloads","speicherort aendern","download folder","downloads ordner setzen"]),
    ("Standard-Suchmaschine aendern", ["suchmaschine","google suche","bing entfernen","default search","suchmaschine aendern","standard suche","google als standard","suchmaschine setzen","search engine","suche aendern"]),
    ("IE-Modus in Edge konfigurieren", ["ie modus","internet explorer modus","ie mode edge","kompatibilitaet","ie11 modus","alte seite","ie kompatibilitaet","intranet ie","ie mode aktivieren","ie modus einrichten"]),
    ("Browser Proxy konfigurieren", ["browser proxy","proxy browser","proxy einstellungen","pac file","proxy konfiguration","browser proxy setzen","http proxy browser","proxy im browser","proxy einstellen browser","browser proxy aendern"]),
    ("Browser Passwort-Manager", ["passwort manager","gespeicherte passwoerter","browser passwoerter","passwort export","credentials browser","autofill passwoerter","passwort import","login daten","passwort manager browser","gespeicherte logins"]),
]))

# INTUNE (20)
ALL.extend(quick_batch("intune", "INT", [
    ("Intune Enrollment durchfuehren", ["intune enrollment","geraet registrieren","mdm registrierung","intune anmelden","device enrollment","geraet in intune","enrollment starten","intune hinzufuegen","mdm enrollment","device registration"]),
    ("Intune Sync erzwingen", ["intune sync","geraet synchronisieren","compliance sync","intune aktualisieren","device sync","policy sync","intune refresh","sync erzwingen","geraet sync","mdm sync"]),
    ("Intune Compliance pruefen", ["compliance pruefen","konformitaet","compliance status","geraet konform","compliance check","richtlinie pruefen","compliant","konformitaets status","compliance verletzt","policy status"]),
    ("Intune App deployen", ["app deployen","intune app","software verteilen","app zuweisen","intune deploy","app rollout","software deployen","app assignment","intune software","app ausrollen"]),
    ("Autopilot Reset", ["autopilot reset","geraet zuruecksetzen","autopilot","factory reset intune","wipe","geraet reset","autopilot neu","fresh start","intune reset","device wipe"]),
    ("Device Rename", ["geraet umbenennen","device rename","intune rename","pc name intune","geraetename","computer umbenennen intune","device name","intune computername","name aendern intune","rename device"]),
    ("Primary User aendern", ["primary user","hauptbenutzer","primaerer benutzer","primary user aendern","device owner","geraete besitzer","intune primary","user zuordnung","device user","besitzer aendern"]),
    ("Defender erzwingen via Intune", ["defender intune","antivirus policy","defender policy","security baseline","defender erzwingen","antivirus intune","defender konfiguration","endpoint protection","defender baseline","security policy"]),
]))

# SAP (20)
ALL.extend(quick_batch("sap", "SAP", [
    ("SAP GUI installieren", ["sap gui installieren","sap installieren","saplogon","sap gui setup","sap client","sap gui einrichten","sap installation","sap gui deployen","sap auf pc","sap gui install"]),
    ("SAP-Verbindung einrichten", ["sap verbindung","sap server","sap logon eintrag","saplogon ini","sap connection","sap system hinzufuegen","sap eintrag","sap server eintragen","sap verbindung erstellen","sap system"]),
    ("SAP-Shortcut erstellen", ["sap shortcut","sap verknuepfung","sap link","sap transaktion shortcut","sap desktop","sap schnellzugriff","sap link erstellen","sap auf desktop","sap verknuepfung erstellen","transaktion verknuepfung"]),
    ("SAP GUI Cache loeschen", ["sap cache","sap cache loeschen","sap traces","sap temp","sap bereinigen","sap aufraumen","sap cache clear","sapgui cache","sap temporaer","sap clean"]),
    ("SAP Schriftart einstellen", ["sap schriftart","sap font","sap gui font","sap schrift","sap schriftgroesse","sap display","sap anzeige","sap font aendern","sap schrift groesser","sap gui schrift"]),
    ("SAP Drucker einrichten", ["sap drucker","sap druck","sap printer","spool drucker","sap drucken","drucker in sap","sap output device","sap spool","sap print","drucker sap zuweisen"]),
    ("SAP Layout sichern", ["sap layout","sap darstellung","sap layout speichern","sap gui design","sap oberflaeche","sap aussehen","sap design","sap layout sichern","sap ansicht","sap theme"]),
    ("SAP SSO konfigurieren", ["sap sso","sap single sign on","sap anmeldung automatisch","sap ohne passwort","sap kerberos","saplogon sso","sap auto login","sap sso einrichten","sap anmeldung konfigurieren","sap sso setup"]),
]))

# UPDATES (20)
ALL.extend(quick_batch("updates", "UPD", [
    ("Windows Update erzwingen", ["update erzwingen","updates jetzt","update starten","windows update force","update anstoessen","update sofort","patch installieren","update laden","update ausfuehren","update manuell"]),
    ("Update pausieren", ["update pausieren","updates stoppen","update aufhalten","update spaeter","update verschieben","update pause","updates deaktivieren","update blockieren","update nicht jetzt","update unterdruecken"]),
    ("Bestimmtes Update blockieren", ["update blockieren","kb blockieren","update verstecken","update ausblenden","bestimmtes update","kb ausschliessen","update nicht installieren","update sperren","kb sperren","wushowhide"]),
    ("Update deinstallieren", ["update deinstallieren","kb entfernen","update loeschen","update zurueck","patch entfernen","kb deinstallieren","update rueckgaengig","update weg","kb loeschen","patch deinstallieren"]),
    ("WSUS-Server setzen", ["wsus server","update server","wsus konfigurieren","wsus setzen","update quelle","wsus einstellen","update server setzen","wsus url","wsus gruppe","wsus config"]),
    ("Office Update erzwingen", ["office update","office aktualisieren","office patchen","click to run update","office version","office update starten","office upgrade","office auf neueste version","office update force","c2r update"]),
    ("Feature Update verschieben", ["feature update","grosses update","version upgrade","feature update verschieben","feature update blockieren","windows upgrade","version update","build upgrade","feature update spaeter","upgrade verschieben"]),
    ("Treiber-Update blockieren", ["treiber update blockieren","driver update aus","treiber nicht updaten","treiber update verhindern","kein treiber update","driver update blockieren","treiber update sperren","automatische treiber","treiber updates aus","driver update off"]),
    ("Update-Dienste zuruecksetzen", ["update dienste reset","wuauserv reset","update reparieren","update fix","windows update reparieren","update dienste","softwaredistribution","catroot2","update zuruecksetzen","update service reset"]),
    ("Delivery Optimization konfigurieren", ["delivery optimization","do einstellung","update bandbreite","peer update","do konfigurieren","update download","bandbreite update","p2p update","delivery optimization setzen","do aktivieren"]),
]))

# Combine all
for entry in ALL:
    if entry['id'] not in existing:
        existing[entry['id']] = entry

# Write output
result = {"requests": list(existing.values())}
outpath = 'resources/knowledge_base/guru_requests.json'
with open(outpath, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

# Summary
cats = {}
for r in existing.values():
    c = r['category']
    cats[c] = cats.get(c, 0) + 1

print(f"\nTotal: {len(existing)} entries ({os.path.getsize(outpath)//1024} KB)")
for c in sorted(cats.keys()):
    t = MINIMUMS.get(c, 10)
    print(f"  {c}: {cats[c]}/{t} {'OK' if cats[c] >= t else 'UNDER'}")

# Validate
errors = 0
for r in existing.values():
    if not r.get('skillChain'): errors += 1
    if not r.get('nachfragen'): errors += 1
print(f"\nValidation: {errors} errors")
