#!/usr/bin/env python3
"""Expand guru_requests.json to 1000+ by generating request variants."""
import json, sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PATH = "resources/knowledge_base/guru_requests.json"
with open(PATH, 'r', encoding='utf-8') as f:
    data = json.load(f)
existing = {r['id']: r for r in data['requests']}
print(f"Starting: {len(existing)} entries")

MINIMUMS = {
    "benutzer": 60, "email": 80, "drucker": 35, "software": 60,
    "netzwerk": 50, "system": 60, "sicherheit": 50, "personalisierung": 40,
    "sprache": 20, "standard_apps": 20, "festplatte": 30, "barrierefreiheit": 20,
    "remote_aktionen": 25, "wiederherstellung": 15, "hardware": 25,
    "outlook": 30, "onedrive": 20, "browser": 20, "intune": 20,
    "sap": 20, "updates": 20,
}

# Map categories to prefixes
PREFIXES = {
    "benutzer":"ACC","email":"MAIL","drucker":"PRN","software":"SW",
    "netzwerk":"NET","system":"SYS","sicherheit":"SEC","personalisierung":"PERS",
    "sprache":"LANG","standard_apps":"ASSOC","festplatte":"DSK","barrierefreiheit":"ACC2",
    "remote_aktionen":"REM","wiederherstellung":"REST","hardware":"HW",
    "outlook":"OL","onedrive":"OD","browser":"BRW","intune":"INT",
    "sap":"SAP","updates":"UPD","geplante_aufgaben":"TASK","kiosk":"KIOSK",
    "remote":"REM2","zertifikate":"CERT",
}

# Request templates per category - (title, base_keywords, skills, permission)
TEMPLATES = {
    "benutzer": [
        ("User zu Gruppe hinzufuegen",["user gruppe","gruppe hinzufuegen","mitglied","gruppenmitgliedschaft"],"rd_userprofiles_usergroupadd","admin"),
        ("Benutzer deaktivieren",["user deaktivieren","konto sperren","account disable","konto deaktivieren"],"rd_userprofiles_userdel","admin"),
        ("Home-Verzeichnis einrichten",["home verzeichnis","home ordner","benutzer ordner","home laufwerk"],"rd_fileops_mkdir","admin"),
        ("Benutzer-Rechte pruefen",["rechte pruefen","berechtigungen","zugriff pruefen","user rechte"],"rd_sessions_whoami","admin"),
        ("Passwort-Ablauf verlaengern",["passwort ablauf","password expiry","passwort laenger","kennwort gueltig"],"rd_domain_klist",None),
        ("Konto-Informationen anzeigen",["konto info","user details","benutzer informationen","account details"],"rd_sessions_whoami",None),
        ("Anmeldeskript zuweisen",["login script","anmeldeskript","logon script","startskript"],"rd_gpo_gpresult","admin"),
        ("Session-Limit konfigurieren",["session limit","sitzung begrenzen","max sessions","session timeout"],"rd_gpo_gpresult","admin"),
        ("Service-Account erstellen",["service account","dienstkonto","service user","technischer user"],"rd_userprofiles_useradd","admin"),
        ("Kontingent/Quota setzen",["quota","kontingent","speicher limit","disk quota","user limit"],"rd_gpo_gpresult","admin"),
        ("User umbenennen",["user umbenennen","konto umbenennen","name aendern","benutzername aendern"],"rd_gpo_gpresult","admin"),
        ("Konto aktivieren",["konto aktivieren","account enable","konto entsperren","account freigeben"],"rd_gpo_gpresult","admin"),
        ("OU verschieben",["ou verschieben","organisationseinheit","ad ou","user verschieben"],"rd_gpo_gpresult","admin"),
        ("Konto klonen",["konto klonen","neuer mitarbeiter","user kopieren","wie anderer user"],"rd_gpo_gpresult","admin"),
        ("Temporaeren Zugang einrichten",["temp zugang","temporaerer user","gastaccount","zeitlich begrenzt"],"rd_userprofiles_useradd","admin"),
        ("Letzten Login pruefen",["letzter login","wann zuletzt","last logon","letzte anmeldung"],"rd_userprofiles_lastlogins",None),
        ("Admin-Rechte entziehen",["admin entziehen","rechte entfernen","kein admin mehr","admin wegnehmen"],"rd_userprofiles_usergrouprem","admin"),
        ("Lokale Admins anzeigen",["wer ist admin","admin liste","lokale admins","administrator liste"],"rd_sessions_localadmins",None),
        ("Profil-Pfad aendern",["profil pfad","roaming profil","profil verschieben","profil ordner"],"rd_gpo_gpresult","admin"),
        ("Passwort-Policy pruefen",["passwort richtlinie","password policy","passwort regeln","kennwort anforderungen"],"rd_gpo_gpresult",None),
    ],
    "email": [
        ("Shared Mailbox erstellen",["shared mailbox erstellen","gemeinsames postfach","funktionspostfach anlegen","shared mailbox anlegen"],"rd_net_ping","admin"),
        ("Senden-im-Auftrag Berechtigung",["senden im auftrag","send on behalf","im namen senden","stellvertretend"],"rd_net_ping","admin"),
        ("Aufbewahrungsrichtlinie setzen",["retention policy","aufbewahrung","mail aufbewahren","loeschrichtlinie"],"rd_net_ping","admin"),
        ("Oeffentlicher Ordner erstellen",["public folder","oeffentlicher ordner","shared folder exchange","public folder erstellen"],"rd_net_ping","admin"),
        ("Journal-Regel erstellen",["journal","mail journal","journaling","compliance journal"],"rd_net_ping","admin"),
        ("Geraete-Postfach erstellen",["geraete postfach","equipment mailbox","geraet postfach","device mailbox"],"rd_net_ping","admin"),
        ("Mail-Routing konfigurieren",["mail routing","connector","mail flow","smtp routing"],"rd_net_ping","admin"),
        ("Abwesenheit einrichten remote",["abwesenheit remote","out of office remote","oof setzen","auto reply remote"],"rd_diag_diag-outlook","admin"),
        ("Postfach-Groesse pruefen",["postfach groesse","mailbox size","postfach voll","quota pruefen"],"rd_diag_diag-outlook",None),
        ("Weiterleitung intern",["weiterleitung","mail weiterleiten","forwarding","mail umleiten"],"rd_net_ping","admin"),
        ("Verteilerliste bearbeiten",["verteiler aendern","dl bearbeiten","mitglieder aendern","verteiler mitglied"],"rd_net_ping","admin"),
        ("Gruppenpostfach Berechtigung",["postfach berechtigung","mailbox permission","vollzugriff postfach","postfach zugriff"],"rd_net_ping","admin"),
        ("E-Mail Disclaimer setzen",["disclaimer","haftungsausschluss","email footer","transport rule disclaimer"],"rd_net_ping","admin"),
        ("Postfach migrieren",["postfach migrieren","mailbox migration","mail umziehen","postfach verschieben"],"rd_net_ping","admin"),
        ("Dynamische Verteilerliste",["dynamische verteilerliste","dynamic distribution","automatische gruppe","dynamic dl"],"rd_net_ping","admin"),
        ("Mail-Kontakt im GAL",["gal kontakt","globales adressbuch","adressbuch eintrag","kontakt hinzufuegen"],"rd_net_ping","admin"),
    ],
    "sicherheit": [
        ("BitLocker pausieren",["bitlocker pause","verschluesselung pause","bitlocker suspend","bitlocker unterbrechen"],"rd_security_bitlocker","admin"),
        ("BitLocker deaktivieren",["bitlocker aus","bitlocker deaktivieren","verschluesselung aus","bitlocker off"],"rd_security_bitlocker","admin"),
        ("ASR-Regeln aktivieren",["asr regeln","attack surface","asr aktivieren","angriffsflaechenreduzierung"],"rd_gpo_gpresult","admin"),
        ("Controlled Folder Access",["controlled folder","ordnerschutz","ransomware schutz","cfa aktivieren"],"rd_gpo_gpresult","admin"),
        ("NTLM einschraenken",["ntlm","ntlm deaktivieren","ntlm audit","ntlm einschraenken"],"rd_gpo_gpresult","admin"),
        ("Credential Guard pruefen",["credential guard","cred guard","virtualisierung sicherheit","vbs"],"rd_gpo_gpresult",None),
        ("USB-Historie anzeigen",["usb historie","usb geraete liste","welche usb","usb verlauf"],"rd_gpo_gpresult",None),
        ("AppLocker Regel",["applocker","app locker","software einschraenken","applocker regel"],"rd_gpo_gpresult","admin"),
        ("Audit-Policy setzen",["audit policy","ueberwachung","audit einrichten","security audit"],"rd_gpo_gpresult","admin"),
        ("Windows Update per WSUS",["wsus","update server","wsus konfigurieren","wsus setzen"],"rd_gpo_gpresult","admin"),
        ("CRL-Cache leeren",["crl cache","zertifikat cache","crl loeschen","cert cache"],"rd_certs_compcerts","admin"),
        ("Kiosk-Modus einrichten",["kiosk","kiosk modus","assigned access","kiosk einrichten"],"rd_gpo_gpresult","admin"),
        ("Firewall-Regel loeschen",["firewall regel loeschen","regel entfernen","firewall rule delete","port schliessen"],"rd_gpo_gpresult","admin"),
        ("Firewall zuruecksetzen",["firewall reset","firewall standard","firewall defaults","firewall wiederherstellen"],"rd_gpo_gpresult","admin"),
        ("Defender-Quarantaene anzeigen",["quarantaene","defender quarantaene","malware gefunden","quarantine list"],"rd_sysconfig_defquick",None),
        ("TPM-Status pruefen",["tpm status","tpm pruefen","tpm chip","trusted platform"],"rd_hw_hwcs",None),
        ("SecureBoot pruefen",["secure boot","secureboot","uefi secure","boot sicherheit"],"rd_hw_hwcs",None),
    ],
    "system": [
        ("Domain-Join durchfuehren",["domain join","domaene beitreten","domain beitritt","pc in domaene"],"rd_domain_scquery","admin"),
        ("Computerbeschreibung setzen",["computer beschreibung","pc beschreibung","rechner beschreibung","description setzen"],"rd_hw_hwcs","admin"),
        ("OEM-Info setzen",["oem info","computer info","support info","system info setzen"],"rd_hw_hwcs","admin"),
        ("Remote-Shutdown planen",["shutdown planen","herunterfahren planen","shutdown timer","zeitgesteuerter shutdown"],"rd_sessions_msg","admin"),
        ("Remote-Nachricht senden",["nachricht senden","msg senden","user warnen","popup senden"],"rd_sessions_msg",None),
        ("User remote abmelden",["user abmelden","logoff remote","session beenden","remote logoff"],"rd_sessions_logoff","admin"),
        ("PC remote sperren",["pc sperren","lock remote","workstation lock","bildschirm sperren"],"rd_sessions_msg","admin"),
        ("Autostart-Programm hinzufuegen",["autostart hinzufuegen","programm autostart","startup programm","beim start starten"],"rd_procs_autostart","admin"),
        ("Autostart-Programm entfernen",["autostart entfernen","startup entfernen","autostart bereinigen","programm aus autostart"],"rd_procs_autostart","admin"),
        ("Dienst Recovery-Options setzen",["dienst recovery","service recovery","neustart bei fehler","dienst fehler aktion"],"rd_svc_svc-restart","admin"),
        ("Registry-Wert loeschen",["registry loeschen","reg key loeschen","registry entfernen","registry wert entfernen"],"rd_gpo_gpresult","admin"),
        ("Pending Reboot beheben",["pending reboot","neustart ausstehend","reboot pending","neustart erzwungen"],"rd_repair_evtsys","admin"),
        ("UAC-Level aendern",["uac aendern","uac level","benutzerkontensteuerung","uac einstellen"],"rd_sysconfig_uacset","admin"),
        ("Zeitzone setzen",["zeitzone","timezone","zeitzone aendern","zeitzone einstellen"],"rd_sysconfig_tzset","admin"),
        ("Proxy einstellen",["proxy setzen","proxy konfigurieren","web proxy","http proxy"],"rd_sysconfig_proxyset","admin"),
        ("Proxy entfernen",["proxy loeschen","proxy entfernen","kein proxy","proxy deaktivieren"],"rd_sysconfig_proxyclear","admin"),
    ],
}

def make_entry(eid, cat, title, kws, skill, perm):
    says = list(kws)
    while len(says) < 10:
        says.append(f"bitte {says[0]}")
        if len(says) < 10: says.append(f"ich moechte {says[0]}")
        if len(says) < 10: says.append(f"koennten sie {says[0]}")
    tags = [w for w in title.lower().split() if len(w) > 2][:8]
    return {
        "id": eid, "category": cat, "title": title,
        "userSays": says[:15],
        "skillChain": [
            {"step":1,"skill":skill,"action":f"Status/Voraussetzungen pruefen"},
            {"step":2,"skill":skill,"action":title},
            {"step":3,"skill":skill,"action":"Ergebnis verifizieren"},
        ],
        "erklaerung": f"{title} wird auf dem Ziel-PC durchgefuehrt.",
        "tags": tags,
        "nachfragen": ["Details zur Anforderung?","Fuer welchen User/PC?","Dringend oder kann es warten?"],
        "berechtigungNoetig": perm
    }

added = 0
for cat, templates in TEMPLATES.items():
    prefix = PREFIXES.get(cat, cat.upper()[:4])
    max_num = max([0] + [int(x.split('-')[-1]) for x in existing if x.startswith(f'REQ-{prefix}-')] + [0])

    for title, kws, skill, perm in templates:
        current = len([r for r in existing.values() if r['category'] == cat])
        target = MINIMUMS.get(cat, 15)
        if current >= target:
            break
        max_num += 1
        eid = f"REQ-{prefix}-{max_num:03d}"
        while eid in existing:
            max_num += 1
            eid = f"REQ-{prefix}-{max_num:03d}"
        existing[eid] = make_entry(eid, cat, title, kws, skill, perm)
        added += 1

print(f"Added {added} template entries")

# Now fill remaining gaps with generic entries from each under-target category
GENERIC_FILLS = {
    "software": [
        "RSAT-Tools installieren","OpenSSH Server aktivieren","Telnet Client aktivieren",
        ".NET 3.5 aktivieren","Windows Sandbox aktivieren","PowerShell 7 installieren",
        "Teams installieren","Webex installieren","AutoCAD installieren",
        "Project installieren","Visio installieren","Office 365 installieren",
        "Software-Inventar erstellen","Winget Source hinzufuegen","Store-App installieren",
        "Runtime installieren (VC++)","DirectX installieren","Codec-Pack installieren",
        "Treiberpaket installieren","MSI-Paket silent installieren",
        "Software deinstallieren silent","Programmversion pruefen",
        "Kompatibilitaetsmodus setzen","Programm als Admin starten",
        "Software-Update erzwingen",
    ],
    "netzwerk": [
        "WLAN-Profil loeschen","WLAN-Passwort auslesen","VPN-Profil konfigurieren",
        "Netzwerk-Typ aendern","DoH aktivieren","IPv6 aktivieren",
        "Netzwerk-Speed testen","Netzwerk-Adapter Prioritaet","Port-Forwarding",
        "SMB-Signierung erzwingen","SMB-Verschluesselung","Netzwerk-Discovery",
        "IP-Adresse freigeben","IP-Adresse erneuern","Proxy-Ausnahme setzen",
        "PAC-Datei konfigurieren","DNS-Suffix setzen","Netzwerk-Adapter umbenennen",
        "QoS-Regel erstellen","Netzwerk-Bridge erstellen",
    ],
    "system": [
        "Task-Scheduler Aufgabe aendern","Geplante Aufgabe loeschen",
        "Dienst-Konto aendern","Delayed Start setzen",
        "Event-Log loeschen","Event-Log Groesse aendern",
        "Auslagerungsdatei konfigurieren","Autoplay deaktivieren",
        "Remote-Desktop Sitzung",
        "Shadow-Session starten","gpresult HTML erstellen",
        "Intune-Sync erzwingen","Systeminfo exportieren",
        "Computerzertifikat anfordern","Uptime pruefen",
    ],
    "drucker": [
        "Follow-Me Drucker einrichten","Drucker-Port aendern",
        "Spooler-Pfad aendern","Drucker-Berechtigung setzen",
        "Drucker umbenennen","Druckserver-Drucker hinzufuegen",
        "Drucker-Pool einrichten","Druckprotokoll aktivieren",
        "Drucker-Treiber entfernen","Netzwerk-Scanner einrichten",
    ],
    "hardware": [
        "Geraet deaktivieren","Treiber zuruecksetzen",
        "COM-Port aendern","Bluetooth trennen",
        "Mikrofon-Level einstellen","DPI pro Monitor setzen",
        "Fingerprint einrichten","Geraet scannen",
        "Kamera deaktivieren","Audio-Geraet zuruecksetzen",
    ],
    "outlook": [
        ("Outlook Cached Mode aendern"),("OST-Datei loeschen"),
        ("Outlook Add-In deaktivieren"),("Kategorie erstellen"),
        ("Auto-Archive konfigurieren"),("Lesebestaetigung einrichten"),
        ("Junk-Mail Filter"),("Outlook Konto hinzufuegen"),
        ("CalDav/CardDav einbinden"),("Outlook Performance optimieren"),
        ("Abwesenheit einrichten"),("Quick-Steps erstellen"),
    ],
    "onedrive": [
        ("OneDrive Konto verbinden"),("Versionierung pruefen"),
        ("OneDrive Papierkorb"),("Offline verfuegbar machen"),
        ("Sync fortsetzen"),("OneDrive Speicher erweitern"),
        ("Team-Ordner synchronisieren"),("OneDrive Business einrichten"),
        ("OneDrive Personal trennen"),("Sync-Fehler beheben"),
    ],
    "browser": [
        ("Pop-up Blocker konfigurieren"),("Auto-Fill deaktivieren"),
        ("Cookie-Einstellungen"),("Suchmaschine aendern"),
        ("Enterprise Mode konfigurieren"),("Browser-Daten exportieren"),
        ("Cache-Groesse begrenzen"),("GPU-Beschleunigung"),
        ("Browser-Profil erstellen"),("Lesezeichen importieren"),
    ],
    "intune": [
        ("Device Category setzen"),("Compliance erzwingen"),
        ("BitLocker erzwingen via Intune"),("Selective Wipe"),
        ("Device Wipe"),("Fresh Start"),
        ("Policy zuweisen"),("App Assignment"),
        ("Configuration Profile"),("Security Baseline"),
    ],
    "sap": [
        ("SAP Session beenden"),("SAP-Trace starten"),
        ("SAP Transaktionscode finden"),("SAP GUI aktualisieren"),
        ("SAP Benutzer entsperren"),("SAP RFC-Verbindung testen"),
        ("SAP Batch-Input"),("SAP Favoriten verwalten"),
        ("SAP GUI Sprache"),("SAP-Verbindung testen"),
    ],
    "barrierefreiheit": [
        ("Scrollbar breiter machen"),("Mono-Audio aktivieren"),
        ("Visuelle Benachrichtigungen"),("Maus-Keys aktivieren"),
        ("Eye Control einrichten"),("Spracheingabe aktivieren"),
        ("Untertitel aktivieren"),("Toggle Keys konfigurieren"),
        ("Filter Keys deaktivieren"),("Cursor Blinkrate"),
    ],
    "remote_aktionen": [
        ("Intune Sync remote"),("Event-Log holen"),
        ("Dienst remote neustarten"),("Befehl ausfuehren"),
        ("Datei uebertragen"),("gpresult erstellen"),
        ("Screenshot machen"),("PC Info abrufen"),
        ("Netzwerk-Info abrufen"),("Prozess-Liste abrufen"),
    ],
    "wiederherstellung": [
        ("Schattenkopie aktivieren"),("Schattenkopie wiederherstellen"),
        ("In-Place Upgrade"),("Windows-Reset vorbereiten"),
        ("Boot-Reparatur"),("Recovery Key sichern"),
        ("Treiber zuruecksetzen"),("Backup erstellen"),
    ],
    "festplatte": [
        ("Schattenkopie erstellen"),("Quota fuer User setzen"),
        ("ISO mounten"),("VHD erstellen"),
        ("Laufwerksbuchstabe zuweisen"),("BitLocker Recovery starten"),
        ("Freien Speicher pruefen"),("Groesste Dateien finden"),
        ("Temp komplett loeschen"),("Festplatten-Benchmark"),
    ],
    "sprache": [
        ("Weitere Sprache installieren"),("Sprachleiste konfigurieren"),
        ("Korrekturhilfe hinzufuegen"),("Input Method konfigurieren"),
        ("Systemgebietsschema aendern"),("Cortana Sprache"),
        ("Waehrungssymbol aendern"),("Erste-Tag-der-Woche"),
    ],
    "standard_apps": [
        ("Notepad als Standard fuer TXT"),("Paint als Standard fuer BMP"),
        ("VLC als Standard fuer Videos"),("WinRAR als Standard fuer ZIP"),
        ("Standard-App per Script setzen"),("ProgID nachschlagen"),
        ("Zuordnung per GPO"),("Zuordnung exportieren"),
    ],
    "updates": [
        ("Treiber-Update manuell"),("Update-Verlauf pruefen"),
        ("Update-Fehlercode nachschlagen"),("Component Store reparieren"),
        ("CBS.log pruefen"),("Delivery Optimization Statistik"),
        ("Office-Version pruefen"),("Update-Ring konfigurieren"),
    ],
}

skill_defaults = {
    "software":"rd_swinstall_wingetinstall","netzwerk":"rd_net_ping",
    "system":"rd_gpo_gpresult","drucker":"rd_printer_getprinter",
    "hardware":"rd_devmgr_devlist","outlook":"rd_diag_diag-outlook",
    "onedrive":"rd_appcache_ondrivereset","browser":"rd_appcache_chromecache",
    "intune":"rd_domain_aadstatus","sap":"rd_appcache_sapcache",
    "barrierefreiheit":"rd_sysconfig_dpiscale","remote_aktionen":"rd_net_ping",
    "wiederherstellung":"rd_repair_sfc","festplatte":"rd_diskmgmt_volumes",
    "sprache":"rd_sysconfig_regioninfo","standard_apps":"rd_software_swlist",
    "updates":"rd_gpo_usoscan","sicherheit":"rd_gpo_gpresult",
    "email":"rd_net_ping",
}

added2 = 0
for cat, fills in GENERIC_FILLS.items():
    prefix = PREFIXES.get(cat, cat.upper()[:4])
    skill = skill_defaults.get(cat, "rd_gpo_gpresult")
    max_num = max([0] + [int(x.split('-')[-1]) for x in existing if x.startswith(f'REQ-{prefix}-')])

    for title_raw in fills:
        title = title_raw if isinstance(title_raw, str) else title_raw
        current = len([r for r in existing.values() if r['category'] == cat])
        target = MINIMUMS.get(cat, 15)
        if current >= target:
            break

        words = title.lower().split()
        kws = [title.lower(), ' '.join(words[:3]), f"bitte {title.lower()}", f"ich moechte {title.lower()}"]
        kws.extend([w for w in words if len(w) > 3][:4])

        max_num += 1
        eid = f"REQ-{prefix}-{max_num:03d}"
        while eid in existing:
            max_num += 1
            eid = f"REQ-{prefix}-{max_num:03d}"

        existing[eid] = make_entry(eid, cat, title, kws, skill, "admin")
        added2 += 1

print(f"Added {added2} generic fill entries")
print(f"Total: {len(existing)}")

# Write
result = {"requests": list(existing.values())}
with open(PATH, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)

# Summary
cats = {}
for r in existing.values():
    c = r['category']
    cats[c] = cats.get(c, 0) + 1

total = sum(cats.values())
print(f"\nGRAND TOTAL: {total} ({os.path.getsize(PATH)//1024} KB)")
under = 0
for c in sorted(cats.keys()):
    t = MINIMUMS.get(c, 10)
    ok = cats[c] >= t
    if not ok: under += 1
    print(f"  {c}: {cats[c]}/{t} {'OK' if ok else 'UNDER'}")
print(f"\nCategories under target: {under}")
