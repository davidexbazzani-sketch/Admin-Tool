// ── Weitere Beschreibungen (so sagen es Anwender) für BESTEHENDE Probleme — Gruppe „konto“ ──
// Schlüssel = Problem-ID, Wert = 3 zusätzliche Beschreibungen in eigenen Worten.
// Bereiche: Anmeldung & Konto · Sicherheit · SAP · SolidWorks & CAD (Probleme aus system.ts / system2.ts).

export const VARIANTEN_KONTO: Record<string, string[]> = {
  // ══ Anmeldung & Konto ════════════════════════════════════════════════════════
  'konto-gesperrt': [
    'Ich komme nicht mehr in Windows rein, es heißt nur, das Konto sei blockiert.',
    'Nach dem dritten Versuch mit dem Passwort ist jetzt Schluss, der Rechner lässt mich nicht mehr.',
    'Mein Account wurde dichtgemacht, bitte wieder freischalten.',
  ],
  'konto-sperrt-sich-immer-wieder': [
    'Kaum habt ihr mich freigeschaltet, bin ich eine Stunde später wieder ausgesperrt.',
    'Seit dem Passwortwechsel muss ich jeden Tag beim Helpdesk anrufen, weil alles blockiert ist.',
    'Irgendwas versucht ständig, sich mit meinem alten Passwort anzumelden – vielleicht das Handy.',
  ],
  'konto-kennwort-abgelaufen': [
    'Windows sagt beim Anmelden, mein Passwort ist nicht mehr gültig und muss neu.',
    'Die Gültigkeit meines Zugangs-Passworts ist heute abgelaufen, was muss ich tun?',
    'Ich werde gezwungen, ein neues Passwort zu vergeben, bevor ich arbeiten kann.',
  ],
  'konto-kennwort-vergessen': [
    'Nach dem Urlaub weiß ich mein Passwort einfach nicht mehr.',
    'Ich habe keine Ahnung mehr, welches Passwort ich zuletzt gesetzt habe.',
    'Mir fällt mein Windows-Passwort nicht mehr ein, kann man das neu setzen?',
  ],
  'konto-pin-funktioniert-nicht': [
    'Meine vierstellige Anmelde-PIN wird nicht mehr angenommen, es kommt „Etwas ist schiefgelaufen“.',
    'Windows bietet die PIN-Anmeldung nicht mehr an und sagt, sie sei nicht verfügbar.',
    'Seit dem Update geht die schnelle Anmeldung mit Zahlen nicht mehr, nur noch mit Passwort.',
  ],
  'konto-pin-vergessen': [
    'Ich weiß die Zahlenkombination für die Windows-Anmeldung nicht mehr.',
    'Meine Hello-PIN ist mir entfallen, das Passwort kenne ich aber noch.',
    'Wie setze ich die PIN zurück, mit der ich mich sonst am Laptop anmelde?',
  ],
  'konto-gesichtserkennung': [
    'Die Kamera erkennt mein Gesicht nicht mehr, ich muss immer die PIN eintippen.',
    'Der Fingersensor am Laptop reagiert nicht mehr beim Anmelden.',
    'Windows sagt, es könne die Kamera für Hello nicht finden.',
  ],
  'konto-vertrauensstellung': [
    'Beim Anmelden kommt eine Meldung, dass die Verbindung zwischen PC und Firmennetz gestört ist.',
    'Der Rechner war lange nicht im Büro, jetzt lässt er keinen Domänen-Benutzer mehr rein.',
    'The trust relationship between this workstation and the primary domain failed.',
  ],
  'konto-temporaeres-profil': [
    'Nach dem Anmelden ist mein Desktop leer und unten rechts steht etwas von vorübergehendem Profil.',
    'Alle meine Einstellungen und Verknüpfungen sind weg, als wäre ich das erste Mal am PC.',
    'Was ich heute gespeichert habe, war nach dem Abmelden wieder verschwunden.',
  ],
  'konto-zeitabweichung-kerberos': [
    'Die Uhrzeit am Laptop geht zehn Minuten falsch und jetzt klappt die Anmeldung nicht.',
    'Seit die Batterie leer war, stimmt das Datum nicht und ich komme an nichts mehr ran.',
    'Laut Fehlermeldung unterscheidet sich die Zeit zwischen meinem PC und dem Server zu stark.',
  ],
  'konto-sso-geht-nicht': [
    'Jede interne Seite und jedes Laufwerk will plötzlich mein Passwort, sonst ging das automatisch.',
    'Die automatische Windows-Anmeldung im Intranet funktioniert nicht mehr.',
    'Ich muss mich überall von Hand anmelden, obwohl ich am PC schon angemeldet bin.',
  ],
  'konto-m365-anmeldeaufforderung': [
    'Outlook, Teams und OneDrive wollen ständig, dass ich mich bei Microsoft neu anmelde.',
    'Alle paar Stunden poppt das Fenster „Bei Ihrem Konto anmelden“ auf.',
    'Ich gebe meine Firmenadresse zigmal am Tag ein, weil Office mich immer wieder abmeldet.',
  ],
  'konto-geraet-nicht-entra': [
    'Bei dsregcmd steht AzureAdJoined auf NO, früher war das YES.',
    'Unser Laptop taucht im Microsoft-Portal nicht mehr als Firmengerät auf.',
    'Die Geräteregistrierung bei Microsoft ist anscheinend verloren gegangen.',
  ],
  'konto-gruppenmitgliedschaft-wirkt-nicht': [
    'Ich habe die Freigabe für den Abteilungsordner bekommen, komme aber immer noch nicht rein.',
    'Laut Kollegen bin ich jetzt in der richtigen Gruppe, der Zugriff wird trotzdem verweigert.',
    'Die neuen Rechte sind angeblich gesetzt, aber bei mir kommt „Zugriff verweigert“.',
  ],
  'konto-anmeldung-dauert-lange': [
    'Morgens steht der Bildschirm minutenlang auf „Willkommen“, bevor der Desktop kommt.',
    'Das Hochfahren geht schnell, aber das Anmelden dauert ewig.',
    'Nach dem Passwort dreht sich der Kreis fünf Minuten lang.',
  ],
  'konto-kein-anmeldeserver': [
    'Zu Hause sagt Windows, es gibt derzeit keinen Server, der meine Anmeldung prüfen kann.',
    'Ich bekomme beim Anmelden „Kein Anmeldeserver verfügbar“ und komme nicht rein.',
    'There are currently no logon servers available to service the logon request.',
  ],
  'konto-gpo-fehlgeschlagen': [
    'gpupdate meldet, dass die Computerrichtlinie nicht erfolgreich verarbeitet werden konnte.',
    'Die Firmeneinstellungen wie Laufwerke und Drucker kommen bei mir nicht an.',
    'Bei mir fehlen die Vorgaben, die alle anderen PCs automatisch bekommen.',
  ],
  'konto-falsches-konto-gespeichert': [
    'Office zeigt oben immer noch meinen Mädchennamen bzw. meine alte Adresse an.',
    'Auf dem übernommenen Laptop ist noch der Vorgänger in Outlook und Teams angemeldet.',
    'Beim Anmelden schlägt Microsoft immer das Konto einer Kollegin vor.',
  ],
  'konto-netzwerkanmeldeinformationen': [
    'Beim Öffnen eines Servers kommt ein Fenster, das Benutzername und Passwort will.',
    'Windows-Sicherheit fragt nach Anmeldedaten, wenn ich auf eine Freigabe klicke.',
    'Enter network credentials pops up when I open the file server.',
  ],
  'konto-kennwort-geaendert-homeoffice': [
    'Ich habe zu Hause mein Passwort geändert und jetzt klappt nichts mehr, weder Laufwerke noch Outlook.',
    'Am Laptop geht nur noch das alte Passwort, im Browser schon das neue.',
    'Seit dem Passwortwechsel im Homeoffice sind Windows und das Firmennetz nicht mehr synchron.',
  ],
  'konto-mfa-authenticator': [
    'Ich habe ein neues Diensthandy und bekomme die Bestätigung zur Anmeldung nicht mehr.',
    'Die App mit der Zahl für die Anmeldung zeigt einfach nichts an.',
    'Bei der Microsoft-Anmeldung kommt keine Push-Nachricht aufs Handy.',
  ],
  'konto-anmeldemethode-nicht-zulaessig': [
    'Windows sagt, diese Art der Anmeldung ist für mein Konto an diesem PC nicht erlaubt.',
    'Ich darf mich an der Maschine der Kollegin nicht anmelden, es kommt eine Richtlinien-Meldung.',
    'Per Remotedesktop werde ich abgewiesen, weil ich angeblich keine Berechtigung habe.',
  ],
  'konto-deaktiviert': [
    'Mein Vertrag wurde verlängert, aber das Konto ist abgeschaltet worden.',
    'Beim Anmelden steht, mein Konto sei deaktiviert – ich arbeite aber noch hier.',
    'Der Zugang eines Aushilfskollegen geht seit heute nicht mehr.',
  ],
  'konto-profildienst-anmeldung-fehlgeschlagen': [
    'Nach dem Passwort kommt nur, das Benutzerprofil konnte nicht geladen werden.',
    'Ich komme nicht in meine Sitzung, der Profildienst verweigert die Anmeldung.',
    'The User Profile Service failed the sign-in, user profile cannot be loaded.',
  ],
  'konto-kennwort-falsch-obwohl-richtig': [
    'Ich tippe mein Passwort ganz sicher richtig ein und trotzdem heißt es, es sei falsch.',
    'An einem anderen PC klappt mein Kennwort, hier wird es immer abgelehnt.',
    'Ich habe es zehnmal probiert, die Daten stimmen, aber Windows lässt mich nicht rein.',
  ],
  'konto-kennwortaenderung-abgelehnt': [
    'Jedes neue Passwort, das ich mir ausdenke, wird nicht akzeptiert.',
    'Beim Ändern kommt, das Kennwort erfülle die Anforderungen an Länge und Komplexität nicht.',
    'Ich kann mein Passwort nicht ändern, obwohl ich es schon mehrmals versucht habe.',
  ],
  'konto-tresor-speichert-nicht': [
    'Ich setze den Haken „Anmeldedaten speichern“, aber am nächsten Tag fragt es wieder.',
    'Windows merkt sich keine Passwörter mehr, weder für Laufwerke noch für Programme.',
    'Mein Programm fragt bei jedem Start erneut nach dem Kennwort.',
  ],
  'konto-wam-fehler-caa50021': [
    'Teams zeigt bei der Anmeldung nur „Etwas ist schiefgelaufen“ mit dem Code CAA50021.',
    'Outlook meldet Fehler 1001, wenn ich mich anmelden will.',
    'Die Microsoft-Anmeldung in den Office-Programmen bricht mit einem Fehlercode ab.',
  ],
  'konto-erstanmeldung-homeoffice': [
    'Ich habe den neuen Laptop nach Hause geschickt bekommen und kann mich nicht anmelden.',
    'Der neue Rechner sagt beim allerersten Anmelden, dass er das Konto nicht prüfen kann.',
    'Mit dem Ersatzgerät komme ich zu Hause nicht über den Anmeldebildschirm hinaus.',
  ],
  'konto-geraet-nicht-konform': [
    'Microsoft sagt, mein Gerät entspreche nicht den Sicherheitsrichtlinien der Firma.',
    'Teams und Outlook verweigern den Zugriff, weil der Laptop angeblich nicht sicher genug ist.',
    'Beim Öffnen von SharePoint kommt „Sie können von hier aus nicht darauf zugreifen“.',
  ],
  'konto-nach-entsperren-kein-zugriff': [
    'Morgens nach dem Entsperren sind alle Netzlaufwerke rot und die Anmeldung im Intranet geht nicht.',
    'Wenn der PC über Nacht nur gesperrt war, muss ich mich überall neu anmelden.',
    'Nach dem Wochenende im gesperrten Zustand funktioniert nichts, bis ich mich abmelde.',
  ],
  'konto-smartcard-anmeldung-scheitert': [
    'Die Karte steckt, aber die Anmeldung damit wird jedes Mal abgelehnt.',
    'Mit der Chipkarte komme ich nicht in Windows, mit Passwort schon.',
    'Windows meldet, dass diese Smartcard nicht verwendet werden kann.',
  ],
  'konto-smartcard-pin-gesperrt': [
    'Ich habe die PIN meiner Firmenkarte dreimal falsch eingegeben, jetzt ist sie blockiert.',
    'Meine Corp-ID wird gelesen, aber das Zertifikat darauf ist wohl nicht mehr gültig.',
    'Die Chipkarte verlangt einen Entsperrcode, den ich nicht habe.',
  ],
  'konto-hello-einrichtung-scheitert': [
    'Wenn ich eine PIN anlegen will, kommt nur ein Fehler mit 0x801C03ED.',
    'Bei den Anmeldeoptionen ist „PIN hinzufügen“ grau und lässt sich nicht anklicken.',
    'Die Einrichtung von Windows Hello bricht jedes Mal mit „Etwas ist schiefgelaufen“ ab.',
  ],
  'konto-remotedesktop-anmeldedaten-falsch': [
    'Wenn ich mich auf den Rechner im Büro schalte, werden meine Zugangsdaten abgelehnt.',
    'mstsc sagt, die Anmeldeinformationen hätten nicht funktioniert, obwohl sie stimmen.',
    'Remotedesktop nimmt meine PIN nicht, mit dem Passwort habe ich es noch nicht versucht.',
  ],
  'konto-neues-profil-ordner': [
    'Mein Benutzerordner heißt plötzlich anders und alle Dateien vom Desktop sind weg.',
    'Unter C:\\Benutzer gibt es meinen Namen jetzt doppelt, einmal mit Zusatz dahinter.',
    'Windows hat mir ein komplett neues, leeres Profil angelegt.',
  ],
  'konto-kerberos-header-zu-gross': [
    'Eine interne Webanwendung zeigt nur „Bad Request – Request Header Or Cookie Too Large“.',
    'Bei mir kommt im Intranet ein Fehler 400, bei Kollegen öffnet sich die Seite normal.',
    'Die Seite meldet, das Header-Feld sei zu lang, und lädt nicht.',
  ],
  'konto-pc-von-kollege-gesperrt': [
    'Am gemeinsamen Arbeitsplatz steht auf dem Sperrbildschirm der Name eines Kollegen, der schon weg ist.',
    'Der Schichtkollege hat seinen PC nur gesperrt und ist in den Feierabend gegangen.',
    'Ich muss an den Rechner, aber dort ist noch jemand anderes angemeldet und gesperrt.',
  ],

  // ══ Sicherheit ═══════════════════════════════════════════════════════════════
  'sicherheit-defender-fund': [
    'Unten rechts kam die Meldung, dass Windows-Sicherheit eine gefährliche Datei entdeckt hat.',
    'Mein Virenschutz schlägt Alarm wegen einer Datei aus dem Download-Ordner.',
    'Windows hat einen Trojaner gemeldet und irgendwas in Quarantäne geschoben.',
  ],
  'sicherheit-echtzeitschutz-aus': [
    'In Windows-Sicherheit ist der Viren- und Bedrohungsschutz rot markiert.',
    'Der Virenschutz meldet, dass er ausgeschaltet ist und mein Gerät gefährdet sei.',
    'Real-time protection is off and I cannot turn it back on.',
  ],
  'sicherheit-signaturen-veraltet': [
    'Windows-Sicherheit sagt, die Schutzdefinitionen seien seit Tagen nicht aktualisiert worden.',
    'Das Update für den Virenschutz schlägt immer wieder fehl.',
    'Meine Antivirus-Updates sind veraltet, laut Meldung über eine Woche alt.',
  ],
  'sicherheit-bitlocker-wiederherstellungsschluessel': [
    'Beim Einschalten kommt ein blauer Bildschirm, der eine lange Zahlenreihe verlangt.',
    'Der Laptop will nach dem BIOS-Update einen 48-stelligen Schlüssel von mir.',
    'Mein Rechner startet nicht, sondern fragt nach dem Wiederherstellungsschlüssel für das Laufwerk.',
  ],
  'sicherheit-bitlocker-pausiert': [
    'Bei der Laufwerksverschlüsselung steht „Schutz angehalten“.',
    'Nach dem Treiberupdate ist die Verschlüsselung von C: nur noch pausiert.',
    'Intune meldet mein Gerät als unsicher, weil BitLocker nicht aktiv schützt.',
  ],
  'sicherheit-bitlocker-nicht-verschluesselt': [
    'Laut Explorer ist mein Laufwerk C: nicht verschlüsselt, das Schloss-Symbol fehlt.',
    'Die Geräteverschlüsselung wurde auf dem neuen Laptop nie eingeschaltet.',
    'Der Compliance-Bericht sagt, die Festplatte sei unverschlüsselt.',
  ],
  'sicherheit-firewall-aus': [
    'Windows warnt, dass die Firewall für das Domänennetzwerk deaktiviert ist.',
    'Im Sicherheitscenter ist der Netzwerkschutz rot markiert.',
    'Jemand hat die Windows-Firewall ausgeschaltet und jetzt kommt ständig eine Warnung.',
  ],
  'sicherheit-phishing-link-geklickt': [
    'Ich habe auf einen Link in einer gefälschten Mail geklickt und mein Passwort eingegeben.',
    'Die Mail sah aus wie von Microsoft, ich habe den Anhang geöffnet und jetzt mache ich mir Sorgen.',
    'I clicked a link in a fake email and entered my credentials.',
  ],
  'sicherheit-browser-werbung-umleitung': [
    'Im Browser öffnen sich ständig fremde Seiten und überall ist Werbung eingeblendet.',
    'Meine Startseite und Suchmaschine haben sich von allein geändert.',
    'Bei jeder Google-Suche lande ich auf irgendeiner dubiosen Seite.',
  ],
  'sicherheit-hosts-manipuliert': [
    'Wenn ich unsere Firmenseite aufrufe, lande ich auf einer ganz anderen Adresse.',
    'Bestimmte Webseiten zeigen bei mir eine fremde Seite, bei Kollegen die richtige.',
    'Der Rechner leitet einen Servernamen auf eine falsche IP-Adresse um.',
  ],
  'sicherheit-zertifikat-abgelaufen': [
    'Das Firmen-WLAN verbindet nicht mehr, Windows meckert über ein ungültiges Zertifikat.',
    'Mein Gerätezertifikat für die Netzanmeldung ist laut Meldung abgelaufen.',
    'Seit heute komme ich nicht mehr ins Netzwerk, die Anmeldung per Zertifikat scheitert.',
  ],
  'sicherheit-smartscreen-blockiert': [
    'Beim Starten eines Programms kommt das blaue Fenster „Der Computer wurde durch Windows geschützt“.',
    'Windows verhindert das Öffnen einer heruntergeladenen Datei wegen unbekanntem Herausgeber.',
    'Defender SmartScreen prevented an unrecognized app from starting.',
  ],
  'sicherheit-usb-stick-gesperrt': [
    'Mein USB-Stick wird zwar erkannt, ich kann aber nichts darauf speichern.',
    'Externe Festplatten werden am Firmenlaptop gesperrt.',
    'Beim Einstecken des Sticks kommt eine Meldung, dass Wechseldatenträger nicht erlaubt sind.',
  ],
  'sicherheit-verdacht-fremdzugriff': [
    'Der Mauszeiger bewegt sich von selbst und Fenster öffnen sich ohne mein Zutun.',
    'Ich habe das Gefühl, dass jemand anderes auf meinem Rechner unterwegs ist.',
    'Auf meinem PC laufen Programme, die ich nie installiert habe.',
  ],
  'sicherheit-tpm-fehler': [
    'Windows-Sicherheit zeigt bei „Sicherheitsprozessor“ eine Problemmeldung an.',
    'Der Sicherheitschip im Laptop meldet, er sei nicht bereit.',
    'Nach dem BIOS-Update gibt es eine Warnung zum Trusted Platform Module.',
  ],
  'sicherheit-zertifikatswarnung-browser': [
    'Fast jede Webseite zeigt mir eine Warnung, die Verbindung sei nicht sicher.',
    'Edge meldet NET::ERR_CERT_AUTHORITY_INVALID auf ganz normalen Seiten.',
    'Your connection is not private appears on almost every website.',
  ],
  'sicherheit-mfa-anfragen-unerwartet': [
    'Mein Handy zeigt ständig Anmeldebestätigungen, obwohl ich gerade gar nichts mache.',
    'Ich bekomme mitten in der Nacht Anfragen zum Genehmigen einer Anmeldung.',
    'Jemand scheint sich mit meinem Konto anmelden zu wollen, die App fragt dauernd nach.',
  ],
  'sicherheit-defender-fehlalarm': [
    'Der Virenscanner hat mein Excel mit Makros einfach weggenommen.',
    'Unser internes Werkzeug wurde von Windows als Bedrohung gelöscht, dabei ist es harmlos.',
    'Eine wichtige Datei ist nach einer Defender-Meldung verschwunden.',
  ],
  'sicherheit-ordnerzugriff-blockiert': [
    'Mein Programm darf nichts mehr im Dokumente-Ordner speichern, Windows blockiert das.',
    'Beim Speichern auf den Desktop kommt eine Meldung, dass eine Änderung verhindert wurde.',
    'Unauthorized changes blocked – controlled folder access stopped my app.',
  ],
  'sicherheit-scam-warnseite-hotline': [
    'Auf dem Bildschirm steht in Rot, mein PC sei gesperrt und ich solle eine Hotline anrufen.',
    'Eine Webseite piept laut und zeigt eine angebliche Microsoft-Warnung mit Telefonnummer.',
    'Der Browser lässt sich nicht mehr schließen, überall Warnungen vor Viren.',
  ],
  'sicherheit-usb-stick-gefunden': [
    'Auf dem Parkplatz lag ein USB-Stick, ich habe ihn eingesteckt um den Besitzer zu finden.',
    'Ein Vertreter hat uns einen Stick dagelassen, darf ich den an den PC stecken?',
    'Ich habe einen fremden Speicherstick eingesteckt und jetzt ist mir mulmig.',
  ],
  'sicherheit-bitlocker-schluessel-jeder-start': [
    'Jedes Mal beim Hochfahren muss ich wieder den langen Wiederherstellungscode eingeben.',
    'Seit ein paar Tagen fragt der Laptop nach jedem Neustart den BitLocker-Schlüssel ab.',
    'Immer wenn das Dock angesteckt ist, verlangt der Rechner beim Start den Schlüssel.',
  ],
  'sicherheit-kennwort-datenleck-warnung': [
    'Edge zeigt mir an, dass eines meiner gespeicherten Passwörter geleakt wurde.',
    'Chrome sagt, mein Passwort sei bei einem Datendiebstahl aufgetaucht.',
    'Ich habe eine Warnung bekommen, dass mein Kennwort nicht mehr sicher ist.',
  ],
  'sicherheit-windows-sicherheit-oeffnet-nicht': [
    'Wenn ich auf das Schild-Symbol klicke, passiert gar nichts.',
    'Die Sicherheits-App öffnet sich und bleibt komplett weiß.',
    'Windows sagt, ich brauche eine neue App, um diesen windowsdefender-Link zu öffnen.',
  ],
  'sicherheit-verschluesselungstrojaner-verdacht': [
    'Alle meine Dateien haben auf einmal eine komische Endung und lassen sich nicht öffnen.',
    'Auf dem Desktop liegt eine Textdatei, die Geld in Bitcoin für meine Daten verlangt.',
    'Die Dateien im Netzlaufwerk sind verschlüsselt, niemand kann sie mehr öffnen.',
  ],
  'sicherheit-secure-boot-zertifikate': [
    'Im Ereignisprotokoll taucht ständig eine Meldung zu den Secure-Boot-Schlüsseln auf.',
    'Laut Windows müssen die UEFI-Zertifikate aktualisiert werden, bevor sie ablaufen.',
    'Event 1801: Secure Boot CA and keys need to be updated on this device.',
  ],

  // ══ SAP ══════════════════════════════════════════════════════════════════════
  'sap-startet-nicht': [
    'Ich klicke auf das SAP-Symbol und es passiert einfach gar nichts.',
    'Das Anmeldefenster von SAP geht seit heute Morgen nicht mehr auf.',
    'Bei mir öffnet sich das Logon-Pad nicht, auch nicht nach mehrmaligem Klicken.',
  ],
  'sap-verbindungsliste-leer': [
    'In SAP Logon steht kein einziges System mehr, die Liste ist komplett leer.',
    'Unser Produktivsystem fehlt plötzlich in der Auswahl.',
    'Ich sehe nur noch einen Teil der SAP-Systeme, die anderen sind verschwunden.',
  ],
  'sap-snc-fehler': [
    'Beim Öffnen des SAP-Systems kommt eine SNC- oder GSS-API-Fehlermeldung.',
    'Die automatische Anmeldung an SAP funktioniert nicht mehr, es kommt ein Fehler zur sicheren Verbindung.',
    'SAP meldet „SNCERR_GSSAPI“ und lässt mich nicht rein.',
  ],
  'sap-haengt': [
    'SAP ist eingefroren, ich kann nichts mehr anklicken.',
    'Die Sanduhr dreht sich ewig, mitten in der Buchung.',
    'Das SAP-Fenster ist weiß geworden und oben steht „Keine Rückmeldung“.',
  ],
  'sap-stuerzt-ab': [
    'SAP schließt sich mitten in der Arbeit einfach von selbst.',
    'Beim Wechsel zwischen zwei Transaktionen verschwindet die SAP GUI komplett.',
    'Es kommt eine Windows-Meldung, dass SAP Frontend beendet wurde.',
  ],
  'sap-excel-export': [
    'Wenn ich eine Liste in die Tabellenkalkulation übernehmen will, öffnet sich nichts.',
    'Der Export der ALV-Liste nach Excel klappt nicht mehr.',
    'Beim Klick auf das Excel-Symbol in SAP passiert nichts bzw. kommt ein Fehler.',
  ],
  'sap-druck-geht-nicht': [
    'Ich schicke einen Druck aus SAP ab, aber am Drucker kommt nichts raus.',
    'Der Lieferschein aus SAP wird nicht gedruckt, obwohl das Ausgabegerät stimmt.',
    'In SP01 steht der Auftrag, auf Papier kommt er aber nie an.',
  ],
  'sap-darstellung-fehlerhaft': [
    'In SAP sind Teile der Masken kaputt dargestellt oder fehlen ganz.',
    'Die Symbole in SAP sehen komisch aus, manche Felder sind verschoben.',
    'Seit dem Update sieht die SAP-Oberfläche verpixelt und durcheinander aus.',
  ],
  'sap-gui-fehlt-veraltet': [
    'Auf meinem neuen Laptop ist kein SAP drauf.',
    'Ich brauche die neuere SAP-Version, mit meiner alten geht ein Programm nicht.',
    'SAP meldet beim Anmelden, dass meine Frontend-Version zu alt ist.',
  ],
  'sap-verbindung-abgebrochen': [
    'Mitten in der Arbeit fliegt SAP raus mit „Verbindung zum Partner unterbrochen“.',
    'Ich werde ständig aus SAP gekickt, vor allem im WLAN.',
    'SAP meldet WSAECONNRESET und ich muss mich neu anmelden.',
  ],
  'sap-kennwort-abfrage': [
    'SAP will auf einmal ein Passwort von mir, sonst ging die Anmeldung von allein.',
    'Mein SAP-Benutzer sei gesperrt, steht in der Meldung.',
    'Beim Login sagt SAP, Name oder Kennwort sei nicht richtig.',
  ],
  'sap-langsam': [
    'Jeder Klick in SAP dauert ewig, das Arbeiten ist eine Qual.',
    'Transaktionen brauchen bei mir viel länger als bei den Kollegen.',
    'SAP reagiert total träge, vor allem seit ich im Homeoffice bin.',
  ],
  'sap-pdf-anzeige': [
    'Die Rechnung aus SAP wird in der Druckvorschau nur als graue Fläche angezeigt.',
    'Wenn ich ein Formular in SAP anzeigen will, bleibt das PDF-Fenster leer.',
    'SAP öffnet die Belegvorschau nicht, es kommt ein Adobe-Fehler.',
  ],
  'sap-fiori-browser': [
    'Das Fiori-Launchpad bleibt im Browser leer bzw. lädt endlos.',
    'Die SAP-Kacheln im Browser werden nicht angezeigt.',
    'SAP im Browser fragt immer wieder nach Anmeldung und lädt dann nicht.',
  ],
  'sap-verknuepfung-oeffnet-nicht': [
    'Ein Kollege hat mir einen SAP-Link per Mail geschickt, der öffnet sich nicht.',
    'Doppelklick auf die .sap-Datei startet nicht SAP, sondern fragt nach einem Programm.',
    'Die Verknüpfung zur Transaktion auf meinem Desktop funktioniert nicht mehr.',
  ],
  'sap-html-bereiche-weiss': [
    'Das Startbild von SAP bleibt komplett weiß.',
    'In manchen Transaktionen ist ein großer weißer Kasten, wo Inhalte sein sollten.',
    'Die HTML-Ansicht in SAP lädt nicht, seit Edge aktualisiert wurde.',
  ],
  'sap-mehrfachanmeldung': [
    'SAP sagt, ich sei schon angemeldet, obwohl ich gerade erst den PC eingeschaltet habe.',
    'Bei der Anmeldung kommt die Frage, ob ich die andere Anmeldung beenden will.',
    'Mein SAP-Benutzer ist angeblich noch auf einem anderen Gerät eingeloggt.',
  ],
  'sap-homeoffice-geht-nicht': [
    'Im Büro komme ich in SAP, zu Hause nicht.',
    'Von daheim aus findet SAP Logon den Server nicht.',
    'Im Homeoffice bricht die SAP-Anmeldung sofort ab.',
  ],
  'sap-verbindungsliste-veraltet': [
    'In meiner SAP-Liste stehen Systeme, die es gar nicht mehr gibt.',
    'Einige SAP-Einträge sind doppelt vorhanden und einer davon funktioniert nicht.',
    'Ich verbinde mich aus Versehen immer mit dem alten Server.',
  ],
  'sap-download-zugriff-verweigert': [
    'Beim Speichern einer Datei aus SAP heißt es „Zugriff verweigert“.',
    'Den Upload einer Datei in SAP lehnt das System ab.',
    'SAP kann die Liste nicht in meinen Ordner herunterladen.',
  ],
  'sap-favoriten-weg': [
    'Meine selbst angelegten Ordner im SAP Logon sind auf dem neuen Laptop nicht mehr da.',
    'Nach dem Profilwechsel fehlen meine eigenen SAP-Verbindungen.',
    'Die Einträge, die ich mir selbst gebaut hatte, sind alle verschwunden.',
  ],
  'sap-skripting-deaktiviert': [
    'Unser Excel-Tool, das SAP fernsteuert, meldet, dass Scripting abgeschaltet ist.',
    'Die Skriptaufzeichnung in SAP ist bei mir ausgegraut.',
    'SAP GUI scripting support is not enabled on my PC.',
  ],
  'sap-anmeldesprache-falsch': [
    'Nach der Anmeldung ist SAP komplett auf Englisch.',
    'Alle Texte in den Transaktionen erscheinen in der falschen Sprache.',
    'SAP startet bei mir auf Englisch, die Kollegen haben es auf Deutsch.',
  ],
  'sap-maximale-modi': [
    'Ich kann kein weiteres SAP-Fenster mehr öffnen, angeblich sind es zu viele.',
    'SAP lässt mich keinen neuen Modus mehr aufmachen.',
    'Beim Öffnen einer neuen Sitzung kommt, die Höchstzahl sei erreicht.',
  ],
  'sap-anlagen-oeffnen-nicht': [
    'An der Bestellung hängt ein PDF, das sich aus SAP nicht öffnen lässt.',
    'In der Anlagenliste passiert beim Doppelklick gar nichts.',
    'Die angehängten Dokumente am Auftrag kann ich nicht ansehen.',
  ],
  'sap-keine-berechtigung-transaktion': [
    'SAP sagt, ich bin für diese Transaktion nicht berechtigt.',
    'Beim Aufruf der Transaktion kommt „Sie haben keine Berechtigung“.',
    'Meine neue Aufgabe braucht eine SAP-Transaktion, die ich nicht öffnen darf.',
  ],
  'sap-schriftgroesse-masken-abgeschnitten': [
    'In SAP ist die Schrift riesig und die Hälfte der Felder passt nicht auf den Bildschirm.',
    'Auf dem großen Monitor ist SAP winzig, auf dem Laptop riesig.',
    'Unten fehlen die Knöpfe der Maske, weil alles zu groß dargestellt wird.',
  ],
  'sap-komponente-nicht-registriert': [
    'SAP meldet beim Start, eine Komponente sei nicht korrekt installiert.',
    'Beim Öffnen einer Transaktion kommt ein Fehler zu einem ActiveX-Steuerelement.',
    'SAP stürzt mit „Klasse nicht registriert“ ab.',
  ],
  'sap-logon-startet-langsam': [
    'Bis das SAP-Anmeldefenster aufgeht, vergehen mehrere Minuten.',
    'SAP Logon lädt ewig, bevor ich überhaupt ein System auswählen kann.',
    'Morgens dauert es extrem lange, bis SAP sich öffnet.',
  ],
  'sap-message-server-nicht-erreichbar': [
    'SAP Logon meldet einen Fehler beim Lastverteilen und verbindet nicht.',
    'Es kommt „partner not reached“ zusammen mit Logon balancing error 88.',
    'Das SAP-System lässt sich nicht verbinden, der Message-Server antwortet nicht.',
  ],

  // ══ SolidWorks & CAD ═════════════════════════════════════════════════════════
  'cad-solidworks-stuerzt-ab': [
    'SolidWorks verabschiedet sich mitten in der Konstruktion ohne Vorwarnung.',
    'Bei mir kommt ständig der Fehlerbericht von SolidWorks und dann ist alles weg.',
    'Beim Erstellen einer Zeichnung schließt sich SolidWorks einfach.',
  ],
  'cad-solidworks-lizenz-nicht-verfuegbar': [
    'Beim Start sagt SolidWorks, dass keine Lizenz mehr frei ist.',
    'Es kommt der Fehler -15,10,10061 und SolidWorks startet nicht.',
    'Could not obtain a license for SOLIDWORKS, cannot connect to license server.',
  ],
  'cad-solidworks-langsam-grafik': [
    'Wenn ich das Modell drehe, ruckelt es wie eine Diashow.',
    'SolidWorks ist extrem zäh, sobald ich eine Baugruppe bewege.',
    'Die Grafik in SolidWorks hängt hinterher, das Arbeiten macht keinen Spaß.',
  ],
  'cad-solidworks-haengt': [
    'SolidWorks ist eingefroren und reagiert auf keinen Klick mehr.',
    'Das Programm zeigt seit zehn Minuten „Keine Rückmeldung“.',
    'Beim Speichern bleibt SolidWorks einfach stehen.',
  ],
  'cad-solidworks-startet-nicht': [
    'Ich klicke auf SolidWorks und nichts passiert.',
    'Das Startbild von SolidWorks erscheint gar nicht erst.',
    'SolidWorks öffnet sich nicht, im Task-Manager läuft aber ein Prozess.',
  ],
  'cad-grafiktreiber-nicht-zertifiziert': [
    'Beim Start meldet SolidWorks, mein Grafiktreiber sei nicht freigegeben.',
    'SolidWorks Rx sagt, die Grafikkarte werde nicht unterstützt.',
    'Es kommt der Hinweis, dass der installierte NVIDIA-Treiber nicht getestet ist.',
  ],
  'cad-browser-nach-nvidia-treiber': [
    'Seit dem neuen Grafiktreiber öffnet sich Edge nicht mehr.',
    'Chrome stürzt direkt nach dem Start ab, seit NVIDIA etwas installiert hat.',
    'Nach dem Grafikupdate sind alle Browserfenster nur noch schwarz.',
  ],
  'cad-grafiktreiber-reset': [
    'In SolidWorks wird der Bildschirm kurz schwarz und kommt dann wieder.',
    'Windows meldet, der Anzeigetreiber hat nicht mehr reagiert und wurde wiederhergestellt.',
    'Beim Drehen großer Modelle flackert alles schwarz und SolidWorks hängt kurz.',
  ],
  'cad-toolbox-nicht-erreichbar': [
    'Die Normteile wie Schrauben und Muttern lassen sich nicht mehr einfügen.',
    'SolidWorks findet die Toolbox-Datenbank nicht.',
    'Der Bohrungsassistent zeigt keine Größen mehr an.',
  ],
  'cad-pdm-tresor': [
    'Ich komme nicht mehr in unseren PDM-Tresor, die Anmeldung schlägt fehl.',
    'Der Tresor im Explorer zeigt nur eine Fehlermeldung zum Server.',
    'PDM sagt, der Archivserver sei nicht erreichbar.',
  ],
  'cad-datei-schreibgeschuetzt': [
    'Meine Baugruppe öffnet nur noch schreibgeschützt.',
    'SolidWorks sagt, die Datei werde von einem anderen Benutzer verwendet.',
    'Ich kann das Teil öffnen, aber nicht speichern, weil es gesperrt ist.',
  ],
  'cad-3d-maus': [
    'Die SpaceMouse bewegt das Modell in SolidWorks nicht mehr.',
    'Meine 3Dconnexion-Maus leuchtet, reagiert aber nicht.',
    'Mit der 3D-Maus kann ich in SolidWorks nichts mehr drehen.',
  ],
  'cad-step-iges-oeffnet-nicht': [
    'Ein Lieferant hat mir eine .stp-Datei geschickt, die ich nicht öffnen kann.',
    'Windows weiß nicht, mit welchem Programm es eine IGES-Datei öffnen soll.',
    'Ich brauche einen Viewer, um mir ein 3D-Modell vom Kunden anzusehen.',
  ],
  'cad-speichern-fehlgeschlagen': [
    'SolidWorks meldet beim Speichern, dass die Datei nicht geschrieben werden konnte.',
    'Mein Teil lässt sich nicht im Projektordner speichern.',
    'Es kommt „Speichern fehlgeschlagen“ und ich habe Angst um meine Arbeit.',
  ],
  'cad-speicher-grosse-baugruppe': [
    'Bei der großen Anlage meldet SolidWorks, der Arbeitsspeicher werde knapp.',
    'Sobald ich die Hauptbaugruppe öffne, ist der RAM voll und alles hängt.',
    'SolidWorks warnt vor wenig Speicher, wenn ich viele Teile geladen habe.',
  ],
  'cad-autorecover-backup': [
    'Nach dem Absturz hat SolidWorks mir keine Wiederherstellung angeboten.',
    'Die automatische Sicherung von SolidWorks scheint nicht zu funktionieren.',
    'Ich finde keine Backup-Dateien von meiner Konstruktion.',
  ],
  'cad-addin-fehlt': [
    'Der PDM-Reiter in SolidWorks ist verschwunden.',
    'Unter Extras fehlt die Toolbox, die ich sonst immer nutze.',
    'Eine Zusatzanwendung lädt beim Start von SolidWorks nicht mehr.',
  ],
  'cad-solidworks-installation-update': [
    'Für ein neues Projekt brauche ich die aktuelle SolidWorks-Version.',
    'Auf der neuen Workstation ist noch kein SolidWorks installiert.',
    'Wir sollen auf das neueste Service Pack aktualisieren.',
  ],
  'cad-zeichnung-druck-plotter': [
    'Meine A1-Zeichnung kommt auf A4 verkleinert aus dem Drucker.',
    'Den Großformatdrucker gibt es bei mir in der Druckerliste nicht.',
    'Beim Plotten wird die Zeichnung am Rand abgeschnitten.',
  ],
  'cad-oberflaeche-unscharf': [
    'Die Schrift und die Symbole in SolidWorks sind verschwommen.',
    'Auf dem 4K-Monitor sind die Knöpfe in SolidWorks winzig klein.',
    'Seit ich den zweiten Bildschirm habe, sieht SolidWorks unscharf aus.',
  ],
  'cad-oeffnen-speichern-langsam': [
    'Das Öffnen der Hauptbaugruppe dauert eine Viertelstunde.',
    'Speichern im Projektordner auf dem Server zieht sich ewig hin.',
    'Große Baugruppen laden bei mir unendlich langsam, bei Kollegen schneller.',
  ],
  'cad-pdm-tresoransicht-fehlt': [
    'Im Explorer ist der PDM-Tresor links nicht mehr zu sehen.',
    'Auf dem neuen PC fehlt mir die lokale Tresoransicht komplett.',
    'Wo ist mein PDM-Ordner? Der war immer im Explorer unter „Dieser PC“.',
  ],
  'cad-pdm-einchecken-fehler': [
    'Beim Einchecken meldet PDM, die Datei werde noch verwendet.',
    'Ich kann die Zeichnung nicht auschecken, obwohl niemand sie offen hat.',
    'PDM bricht den Check-in mit einer Fehlermeldung ab.',
  ],
  'cad-lizenz-aktivierung-einzelplatz': [
    'Nach dem PC-Tausch will SolidWorks neu aktiviert werden.',
    'Es kommt der Aktivierungsassistent und die Aktivierung schlägt fehl.',
    'SolidWorks sagt, meine Lizenz sei auf diesem Rechner nicht aktiviert.',
  ],
  'cad-lizenz-ausleihen': [
    'Ich will SolidWorks mit auf die Baustelle nehmen, aber das Ausleihen klappt nicht.',
    'Die ausgeliehene Lizenz lässt sich nicht zurückgeben.',
    'Offline startet SolidWorks nicht, obwohl ich die Lizenz geliehen hatte.',
  ],
  'cad-vorlagen-fehlen': [
    'Beim Anlegen einer neuen Zeichnung fehlt unser Firmen-Schriftfeld.',
    'SolidWorks findet die Dokumentvorlagen nicht mehr.',
    'In der Materialliste fehlen unsere eigenen Werkstoffe.',
  ],
  'cad-edrawings-oeffnet-nicht': [
    'Ich habe eine .easm-Datei bekommen und kann sie nicht anschauen.',
    'Ein Kunde schickt eDrawings-Dateien, mein PC kennt dieses Format nicht.',
    'Die Datei mit der Endung .edrw lässt sich nicht öffnen.',
  ],
  'cad-dwg-dxf-oeffnet-nicht': [
    'Ich habe eine AutoCAD-Zeichnung bekommen und kann sie nicht öffnen.',
    'Mein PC findet kein Programm für .dxf-Dateien.',
    'Wie kann ich mir eine DWG vom Lieferanten ansehen?',
  ],
  'cad-grafik-artefakte': [
    'Im Modell fehlen Kanten und Flächen blinken beim Drehen.',
    'SolidWorks zeigt komische Streifen und Flecken auf den Bauteilen.',
    'Die Schattierung meiner Teile ist fehlerhaft, manche Flächen sind durchsichtig.',
  ],
  'cad-vorschaubilder-explorer': [
    'Im Explorer sehe ich bei meinen SolidWorks-Teilen keine kleinen Vorschaubilder mehr.',
    'Statt der Modell-Vorschau zeigt Windows nur weiße Symbole.',
    'Die Miniaturansichten für sldprt und sldasm fehlen.',
  ],
  'cad-datei-neuere-version': [
    'Ein Lieferant hat mir ein Modell geschickt, das meine SolidWorks-Version nicht öffnen kann.',
    'SolidWorks sagt, die Datei stamme aus einer neueren Version.',
    'This file was created in a newer version of SOLIDWORKS and cannot be opened.',
  ],
  'cad-referenzen-nicht-gefunden': [
    'Beim Öffnen der Baugruppe fragt SolidWorks, wo die einzelnen Teile liegen.',
    'Meine Baugruppe ist voller fehlender Teile mit Fragezeichen.',
    'SolidWorks findet die verknüpften Bauteile nicht mehr.',
  ],
}
