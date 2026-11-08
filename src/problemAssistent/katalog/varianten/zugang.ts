// ── Weitere Beschreibungen (so sagen es Anwender) für BESTEHENDE Probleme — Gruppe „zugang“ ──
// Schlüssel = Problem-ID, Wert = 3 zusätzliche Beschreibungen in eigenen Worten.

export const VARIANTEN_ZUGANG: Record<string, string[]> = {
  // ══ VPN & Zscaler ═══════════════════════════════════════════════════════════
  'vpn-zscaler-nicht-angemeldet': [
    'Unten rechts beim Zscaler-Symbol steht, ich müsse mich erst einloggen.',
    'Das Zscaler-Fenster will meine Firmen-Mailadresse, vorher geht kein Internet.',
    'Seit heute Morgen ist Zscaler abgemeldet und keine Webseite lädt.',
  ],
  'vpn-intranet-homeoffice': [
    'Von zu Hause komme ich an keine Firmenseite und keinen Server ran, Google geht aber.',
    'Im Homeoffice läuft nur das Internet, alles Interne bleibt weiß oder läuft in einen Timeout.',
    'Sobald ich nicht im Werk bin, sind sämtliche internen Systeme für mich unerreichbar.',
  ],
  'vpn-zscaler-symbol-fehlt': [
    'Das blaue Z unten neben der Uhr ist verschwunden.',
    'Ich finde die Zscaler-App nirgends mehr, auch nicht bei den ausgeblendeten Symbolen.',
    'Zscaler startet beim Hochfahren nicht mehr mit, das Symbol bleibt weg.',
  ],
  'vpn-zscaler-nicht-installiert': [
    'Auf meinem neuen Laptop gibt es gar kein Zscaler, deshalb komme ich nicht ins Netz.',
    'Nach dem Neuaufsetzen fehlt das Programm für den Firmenzugang.',
    'Kollegen haben dieses Zscaler-Symbol, auf meinem Gerät ist es nicht drauf.',
  ],
  'vpn-zscaler-sperrseite': [
    'Statt der Webseite kommt eine Seite mit „Zugriff verweigert durch Unternehmensrichtlinie“.',
    'Eine Lieferantenseite ist plötzlich blockiert, es erscheint ein Hinweis von der Firma.',
    'Ich brauche diese Seite für die Arbeit, aber Zscaler lässt mich nicht drauf.',
  ],
  'vpn-zscaler-langsam': [
    'Seit Zscaler drauf ist, braucht jede Webseite eine halbe Ewigkeit.',
    'Downloads kriechen mit wenigen KB pro Sekunde, ohne Firmenlaptop ist die Leitung schnell.',
    'Alles fühlt sich total zäh an, sobald Zscaler verbunden ist.',
  ],
  'vpn-zscaler-zertifikat': [
    'Firefox zeigt bei fast jeder Seite „Warnung: Mögliches Sicherheitsrisiko erkannt“.',
    'Mein Python-Skript und Git meckern über ein nicht vertrauenswürdiges Zertifikat.',
    'Entwicklertools melden SSL-Fehler, Edge öffnet dieselben Seiten problemlos.',
  ],
  'vpn-zscaler-firmennetz-nicht-erkannt': [
    'Im Werk geht das Intranet seit kurzem genauso zäh wie von zu Hause.',
    'Obwohl ich im Büro am Kabel hänge, läuft alles über den Zscaler-Tunnel.',
    'Zscaler tut so, als wäre ich unterwegs, dabei sitze ich an meinem Platz in der Firma.',
  ],
  'vpn-cisco-verbindet-nicht': [
    'Beim Klick auf „Verbinden“ dreht sich Cisco kurz und bricht dann ab.',
    'AnyConnect kommt nicht mehr durch, es erscheint nur „Verbindungsversuch fehlgeschlagen“.',
    'Das VPN für die Fernwartung baut keine Verbindung mehr auf.',
  ],
  'vpn-cisco-zertifikat': [
    'Cisco sagt „Zertifikatsvalidierungsfehler“ und lässt mich nicht rein.',
    'Das VPN lehnt meine Anmeldung ab, obwohl Benutzername und Kennwort stimmen.',
    'Beim Verbinden kommt „Login failed“ bzw. „Kein gültiges Zertifikat gefunden“.',
  ],
  'vpn-cisco-zscaler-konflikt': [
    'Wenn ich Cisco einschalte, während Zscaler läuft, geht gar nichts mehr.',
    'Mit beiden Programmen aktiv laden weder Webseiten noch Laufwerke.',
    'Sobald ich das VPN starte, ist auch das normale Internet weg.',
  ],
  'vpn-nach-trennen-kein-internet': [
    'Nach dem Beenden der VPN-Verbindung lädt keine Webseite mehr.',
    'Erst wenn ich den Laptop neu starte, geht nach dem VPN das Internet wieder.',
    'Ich habe das VPN abgeschaltet und seitdem steht im Browser „Keine Verbindung“.',
  ],
  'vpn-zscaler-falsches-konto': [
    'In meiner Zscaler-App steht noch die Mailadresse meines Vorgängers.',
    'Zscaler ist auf meinem Laptop mit dem Konto eines Kollegen angemeldet.',
    'Ich habe den Rechner übernommen, aber Zscaler läuft unter fremdem Namen.',
  ],
  'vpn-einzelne-anwendung-homeoffice': [
    'Zu Hause klappt fast alles, nur unser Fachprogramm findet seinen Server nicht.',
    'Im Homeoffice geht genau eine Firmenanwendung nicht, im Werk schon.',
    'Ein bestimmtes System läuft nur, wenn ich vor Ort in der Firma bin.',
  ],
  'vpn-zscaler-anmeldeschleife': [
    'Das Zscaler-Anmeldefenster bleibt komplett leer.',
    'Ich melde mich in Zscaler an und lande immer wieder auf der gleichen Anmeldeseite.',
    'Beim Zscaler-Login dreht sich der Kreis endlos und nichts passiert.',
  ],
  'vpn-nach-kennwortaenderung-homeoffice': [
    'Ich habe zu Hause mein Passwort geändert, jetzt wollen Laufwerke und Intranet ständig ein Kennwort.',
    'Seit der Kennwortänderung im Homeoffice kommen dauernd Anmeldefenster.',
    'Nach dem neuen Passwort funktioniert von zu Hause der Zugriff auf Ordner nicht mehr.',
  ],
  'vpn-zscaler-veraltet': [
    'Zscaler ist noch auf einer alten Version, das Update kommt einfach nicht.',
    'Die IT sagt, mein Zscaler sei zu alt – aktualisiert wird er aber nicht.',
    'Die Zscaler-App zeigt eine Versionsnummer, die bei Kollegen längst neuer ist.',
  ],
  'vpn-vertrauensstellung-homeoffice': [
    'Mein Laptop war monatelang nur zu Hause, jetzt kommt beim Anmelden ein Domänenfehler.',
    'Windows sagt, die Vertrauensstellung zur Domäne sei fehlgeschlagen.',
    'Nach langer Zeit im Homeoffice klappt die Anmeldung mit dem Firmenkonto nicht mehr richtig.',
  ],
  'vpn-heimnetz-adresskonflikt': [
    'Zu Hause erreiche ich manche Firmenserver nicht, weil mein Router dieselben Adressen verteilt.',
    'Mein Heimnetz hat 10.x-Adressen und damit kollidiert irgendwas mit der Firma.',
    'Über den Hotspot geht es, über meinen eigenen Router erreiche ich bestimmte Server nicht.',
  ],
  'vpn-zscaler-netzwerkfehler': [
    'Im Hotel-WLAN zeigt Zscaler nur „Netzwerkfehler“ und es geht nichts.',
    'Zscaler meldet „Captive Portal erkannt“, obwohl ich längst online bin.',
    'Die Zscaler-App bleibt rot und behauptet, es gebe ein Netzwerkproblem.',
  ],
  'vpn-download-blockiert': [
    'Die Datei lädt bis 100 % und dann passiert nichts mehr.',
    'Mein Download wird mit einem Hinweis von der Firma gestoppt.',
    'Ein Setup vom Hersteller lässt sich nicht herunterladen, es bleibt hängen.',
  ],
  'vpn-remotedesktop-homeoffice': [
    'Von zu Hause komme ich per RDP nicht auf meinen Rechner im Büro.',
    'Die Remotedesktopverbindung sagt, der Remote-PC sei nicht erreichbar.',
    'Ich will mich von daheim auf meinen Arbeits-PC schalten, aber mstsc findet ihn nicht.',
  ],
  'vpn-privates-vpn': [
    'Ich habe mir ein VPN fürs Streaming installiert, seitdem geht der Firmenzugang nicht.',
    'Seit der Browser-Erweiterung mit VPN laden keine Firmenseiten mehr.',
    'Auf dem Laptop läuft NordVPN und jetzt funktioniert Zscaler nicht mehr.',
  ],
  'vpn-kundennetz-proxy': [
    'Beim Kunden im Netzwerk komme ich mit dem Laptop nirgendwo hin.',
    'Auf der Werft ist das LAN angeschlossen, aber ich habe kein Internet und kein Firmennetz.',
    'Im Firmennetz des Lieferanten blockiert deren Proxy offenbar alles.',
  ],
  'vpn-zscaler-internet-security-aus': [
    'Bei Zscaler ist der Dienst „Internet Security“ ausgegraut und steht auf aus.',
    'Die Zscaler-App sagt, der Schutz sei deaktiviert.',
    'In Zscaler steht bei einem Dienst „Ausgeschaltet“, ich habe nichts angefasst.',
  ],
  'vpn-zscaler-nach-funktionsupdate': [
    'Nach dem großen Windows-Upgrade verbindet sich Zscaler nicht mehr.',
    'Seit dem Update auf die neue Windows-Version ist Zscaler kaputt.',
    'Windows hat sich über Nacht aktualisiert, jetzt baut Zscaler keinen Tunnel mehr auf.',
  ],
  'vpn-zscaler-verbindung-haengt': [
    'Zscaler steht ewig auf „Connecting“ und kommt nie auf „Connected“.',
    'Die App versucht dauernd sich zu verbinden, ohne fertig zu werden.',
    'Das Zscaler-Symbol bleibt gelb und es dreht sich nur.',
  ],
  'vpn-kunden-vpn-fernwartung': [
    'Für die Fernwartung beim Kunden brauche ich deren FortiClient, der verbindet aber nicht.',
    'Der VPN-Zugang zur Anlage an Bord geht vom Firmenlaptop nicht.',
    'Das Kunden-VPN steigt sofort aus, sobald ich mich einwählen will.',
  ],
  'vpn-zscaler-warnseite-weiter': [
    'Jedes Mal muss ich bei der gleichen Seite auf „Weiter“ klicken.',
    'Zscaler zeigt immer wieder eine Vorsicht-Seite, bevor die Webseite kommt.',
    'Die Warnung von Zscaler kommt bei jedem Aufruf neu, obwohl ich sie bestätigt habe.',
  ],
  'vpn-zscaler-upload-blockiert': [
    'Ich kann eine Datei nicht auf das Portal des Kunden hochladen, es kommt eine Sperre.',
    'Beim Hochladen zu WeTransfer bricht es ab mit einem Hinweis der IT-Sicherheit.',
    'Das Senden einer Zeichnung über eine Webseite wird von Zscaler blockiert.',
  ],
  'vpn-neue-netze-ueber-zscaler': [
    'Die Weboberfläche der neuen Anlage im neuen Netz zeigt eine Zscaler-Sperrseite.',
    'Seit der Netzumstellung laufen interne Adressen in einen Timeout.',
    'Eine interne IP aus dem neuen Bereich landet beim Proxy statt direkt beim Gerät.',
  ],
  'vpn-zscaler-ausschalten-kennwort': [
    'Ich wollte Zscaler kurz deaktivieren, aber es fragt nach einem Passwort.',
    'Zum Testen soll Zscaler aus, ich kenne das Kennwort nicht.',
    'Zscaler lässt sich nicht beenden, es kommt eine Kennwortabfrage.',
  ],
  'vpn-zscaler-falsche-anmeldeadresse': [
    'Bei der Zscaler-Anmeldung kommt „Benutzer nicht gefunden“.',
    'Zscaler sagt, meine Domäne gebe es nicht.',
    'Mit meiner neuen Mailadresse nach der Heirat kann ich mich bei Zscaler nicht anmelden.',
  ],
  'vpn-zscaler-geraet-nicht-konform': [
    'Zscaler sagt, mein Gerät sei nicht vertrauenswürdig, deshalb sind interne Seiten gesperrt.',
    'Private Access verweigert mir den Zugang wegen der Gerätesicherheit.',
    'Es kommt eine Meldung, dass mein Laptop die Sicherheitsrichtlinien nicht erfüllt.',
  ],
  'vpn-dienstreise-ausland': [
    'Ich bin auf Montage in Asien und Teams und Outlook gehen nicht.',
    'Im Ausland kommt Zscaler nicht durch, im Hotel-WLAN geht gar nichts.',
    'Auf meiner Reise kann ich nicht auf die Firma zugreifen.',
  ],
  'vpn-heimnetz-geraete': [
    'Mit dem Firmenlaptop kann ich zu Hause nicht auf meinem Drucker drucken.',
    'Mein NAS daheim ist vom Dienstlaptop aus nicht sichtbar.',
    'Ich kann vom Firmenrechner nichts auf den Fernseher streamen.',
  ],

  // ══ Netzlaufwerke & Dateien ═════════════════════════════════════════════════
  'laufwerk-i-fehlt': [
    'Unser gemeinsames Laufwerk mit dem Buchstaben I ist im Explorer nicht mehr da.',
    'Unter „Dieser PC“ fehlt das Laufwerk SKF Marine.',
    'Mein I: zeigt plötzlich nur noch einen Unterordner statt der ganzen Ablage.',
  ],
  'laufwerk-rotes-x': [
    'Bei meinen Laufwerken ist ein rotes Kreuz und sie lassen sich nicht öffnen.',
    'Im Explorer steht bei allen Laufwerken „nicht verfügbar“.',
    'Morgens sind meine Netzwerkordner rot durchgestrichen.',
  ],
  'laufwerk-verbinden': [
    'Ich brauche zusätzlich das Projektlaufwerk von der Abteilung.',
    'Kannst du mir einen Ordner vom Server als Laufwerksbuchstaben einrichten?',
    'Ich möchte eine Freigabe dauerhaft im Explorer haben.',
  ],
  'laufwerk-trennen': [
    'Ich will ein altes Laufwerk loswerden, das brauche ich nicht mehr.',
    'Bitte entfernt das Laufwerk T:, das zeigt auf nichts mehr.',
    'Ein überflüssiger Laufwerksbuchstabe soll weg.',
  ],
  'laufwerk-i-falscher-buchstabe': [
    'Bei mir heißt das SKF-Marine-Laufwerk Z statt I.',
    'Meine Excel-Verknüpfungen gehen nicht, weil das Laufwerk einen anderen Buchstaben hat.',
    'Das gemeinsame Laufwerk ist unter dem falschen Buchstaben eingebunden.',
  ],
  'laufwerk-zugriff-verweigert': [
    'Beim Doppelklick auf den Ordner kommt „Sie verfügen nicht über die erforderlichen Berechtigungen“.',
    'In einen Unterordner komme ich nicht rein, die Kollegen schon.',
    'Windows sagt, mir fehlt die Berechtigung für diesen Ordner.',
  ],
  'laufwerk-neue-berechtigung': [
    'Ich habe die Freigabe für den Ordner bekommen, komme aber immer noch nicht rein.',
    'Die Rechte wurden mir zugewiesen, trotzdem kommt weiter „Zugriff verweigert“.',
    'Seit einer Stunde soll ich Zugriff haben, es funktioniert aber nicht.',
  ],
  'laufwerk-langsam': [
    'Das Öffnen einer Datei vom Server dauert ewig.',
    'Speichern auf I: braucht jedes Mal mehrere Minuten.',
    'Die Ordner auf dem Server laden quälend langsam.',
  ],
  'laufwerk-offline-veraltet': [
    'Ich sehe eine alte Version der Datei, die Kollegen die neue.',
    'Meine Änderungen kommen beim Kollegen nicht an.',
    'Die Dateien auf meinem Laufwerk sind nicht aktuell.',
  ],
  'laufwerk-offline-modus': [
    'Im Explorer steht beim Laufwerk „Offline“, obwohl ich im Netz bin.',
    'Die Symbole im Netzordner sind grau und ich arbeite angeblich offline.',
    'Das Laufwerk will einfach nicht auf „online“ wechseln.',
  ],
  'laufwerk-kennwortabfrage': [
    'Beim Öffnen von I: muss ich jedes Mal Benutzernamen und Passwort eingeben.',
    'Es kommt das Fenster „Netzwerkanmeldeinformationen eingeben“.',
    'Das Laufwerk will meine Zugangsdaten, obwohl ich angemeldet bin.',
  ],
  'laufwerk-explorer-haengt': [
    'Wenn ich auf „Dieser PC“ klicke, friert der Explorer ein.',
    'Der grüne Balken im Explorer läuft ewig und nichts passiert.',
    'Der Datei-Explorer reagiert nicht mehr, sobald ich ein Laufwerk anklicke.',
  ],
  'laufwerk-netzwerkpfad-nicht-gefunden': [
    'Fehlercode 0x80070035, der Netzwerkpfad sei nicht auffindbar.',
    'Windows findet den Server nicht und zeigt „Netzwerkpfad nicht gefunden“.',
    'Beim Zugriff auf die Freigabe kommt Systemfehler 53.',
  ],
  'laufwerk-homeoffice': [
    'Zu Hause kann ich nicht auf meine Laufwerke zugreifen.',
    'Im Homeoffice sind alle meine Netzlaufwerke rot.',
    'Von daheim komme ich nicht an I: und die Abteilungsordner.',
  ],
  'laufwerk-nach-anmeldung-nicht-verbunden': [
    'Nach dem Einloggen kommt die Meldung, die Laufwerke konnten nicht verbunden werden.',
    'Bei jedem Start erscheint unten rechts ein Hinweis zu nicht verbundenen Laufwerken.',
    'Morgens nach dem Hochfahren sind die Laufwerke nicht verbunden.',
  ],
  'laufwerk-abteilung-fehlt': [
    'Unsere Abteilungslaufwerke sind nach dem Einloggen verschwunden.',
    'S:, T: und U: sind heute nicht da.',
    'Die automatisch verbundenen Laufwerke fehlen auf einmal alle.',
  ],
  'laufwerk-g-portax': [
    'SolidWorks findet die Toolbox nicht, das Laufwerk G fehlt.',
    'Bei mir ist kein G: mehr da, PortaX geht nicht.',
    'Die Normteile in SolidWorks laden nicht, weil das CAD-Laufwerk fehlt.',
  ],
  'laufwerk-h-home-fehlt': [
    'Mein persönliches Laufwerk H ist weg.',
    'Ich finde meinen Home-Ordner auf dem Server nicht mehr.',
    'Das Laufwerk mit meinen eigenen Dateien fehlt im Explorer.',
  ],
  'laufwerk-datei-gesperrt': [
    'Excel sagt, die Datei sei von einem anderen Benutzer gesperrt.',
    'Ich kann die Datei nur schreibgeschützt öffnen, weil jemand anderes sie offen hat.',
    'Die Datei ist in Verwendung und lässt sich nicht bearbeiten.',
  ],
  'laufwerk-datei-geloescht': [
    'Ich habe aus Versehen eine Datei auf dem Server gelöscht.',
    'Eine Excel-Tabelle wurde mit einem alten Stand überschrieben.',
    'Kann man eine gelöschte Datei vom Netzlaufwerk wiederherstellen?',
  ],
  'laufwerk-pfad-zu-lang': [
    'Beim Kopieren kommt „Der Dateiname ist zu lang“.',
    'Ich kann eine Datei tief im Projektordner weder öffnen noch löschen.',
    'Windows meldet, Pfad und Name seien zu lang für das Ziel.',
  ],
  'laufwerk-kopieren-bricht-ab': [
    'Beim Kopieren einer großen Datei kommt „Unerwarteter Netzwerkfehler“.',
    'Das Kopieren auf den Server bricht kurz vor Schluss ab.',
    'Große Dateien lassen sich nicht vollständig vom Laufwerk holen.',
  ],
  'laufwerk-speicher-voll': [
    'Beim Speichern auf I: kommt „Nicht genügend Speicherplatz“.',
    'Das Laufwerk sagt, es sei voll, obwohl mein PC viel Platz hat.',
    'Ich kann nichts mehr auf mein Laufwerk legen, das Kontingent ist erschöpft.',
  ],
  'laufwerk-sicherheitswarnung': [
    'Beim Kopieren vom Laufwerk kommt „Diese Dateien können sich negativ auf Ihren Computer auswirken“.',
    'Excel öffnet Dateien vom Server nur in der geschützten Ansicht und Makros sind gesperrt.',
    'Beim Starten eines Programms vom Server kommt eine Sicherheitswarnung, Herausgeber unbekannt.',
  ],
  'laufwerk-nach-kennwortaenderung': [
    'Seit ich mein Passwort geändert habe, gehen die Laufwerke nicht mehr.',
    'Nach dem Kennwortwechsel sperrt sich mein Konto beim Laufwerkszugriff.',
    'Die Laufwerke verlangen nach der Passwortänderung das alte Kennwort.',
  ],
  'laufwerk-ordner-verschwunden': [
    'Ein Ordner im Laufwerk ist auf einmal nicht mehr da.',
    'Ich finde einen Projektordner auf dem Server nicht mehr.',
    'Gestern war der Ordner noch da, heute ist er weg.',
  ],
  'laufwerk-smb1-geraet': [
    'Die Freigabe an der alten Maschine lässt sich nicht verbinden.',
    'Unser altes NAS ist im Explorer nicht mehr erreichbar.',
    'Windows sagt, das Gerät nutze ein veraltetes, unsicheres Protokoll.',
  ],
  'laufwerk-gastzugriff-blockiert': [
    'Windows blockiert den Zugriff auf eine Freigabe ohne Passwort.',
    'Es kommt die Meldung, dass nicht authentifizierter Gastzugriff gesperrt ist.',
    'Das NAS ohne Kennwort ist plötzlich nicht mehr erreichbar.',
  ],
  'laufwerk-ordner-oeffnet-langsam': [
    'Ein Ordner mit vielen Bildern lädt ewig.',
    'Im Explorer steht lange „Wird bearbeitet“ bei großen Ordnern.',
    'Der Ordner mit den CAD-Zeichnungen öffnet sich quälend langsam.',
  ],
  'laufwerk-buchstabe-belegt': [
    'Das Laufwerk lässt sich nicht verbinden, weil der Buchstabe schon verwendet wird.',
    'Mein USB-Stick hat den Buchstaben vom Netzlaufwerk geklaut.',
    'Es kommt Systemfehler 85, der Gerätename sei schon in Gebrauch.',
  ],
  'laufwerk-fehler-1219': [
    'Windows sagt, mehrere Verbindungen mit unterschiedlichen Benutzernamen seien nicht zulässig.',
    'Beim Verbinden kommt Systemfehler 1219.',
    'Das Laufwerk lässt sich nicht verbinden, weil schon eine andere Anmeldung besteht.',
  ],
  'laufwerk-sharepoint-webdav': [
    'Ich will die Teams-Dateien als Laufwerk einbinden, das klappt nicht.',
    'SharePoint als Netzlaufwerk verbinden bringt einen Fehler.',
    'Die Bibliothek aus SharePoint lässt sich nicht unter einem Buchstaben verbinden.',
  ],
  'laufwerk-nach-pc-tausch': [
    'Auf meinem neuen Laptop fehlen meine Laufwerke.',
    'Nach dem PC-Wechsel muss ich alle Ordner neu verbinden.',
    'Seit der Neuinstallation sind meine Netzlaufwerke weg.',
  ],
  'laufwerk-schnellzugriff-netzordner': [
    'Der Explorer friert ein, weil im Schnellzugriff alte Netzwerkordner angeheftet sind.',
    'Beim Öffnen des Explorers hängt alles an einem angehefteten Ordner.',
    'Im Schnellzugriff sind tote Ordner vom alten Server und der Explorer bleibt stehen.',
  ],
  'laufwerk-fehlt-in-admin-programm': [
    'Im Setup sehe ich das Laufwerk I nicht.',
    'Ein Programm mit Administratorrechten findet meine Netzlaufwerke nicht.',
    'Im Speichern-Dialog fehlt das Laufwerk, wenn ich als Admin starte.',
  ],
  'laufwerk-servermigration': [
    'Nach dem Serverumzug zeigt mein Laufwerk noch auf den alten Server.',
    'Das Laufwerk geht seit dem Wochenende nicht, die Daten sind jetzt woanders.',
    'Die Freigabe ist auf einen neuen Server umgezogen, mein Laufwerk zeigt ins Leere.',
  ],
  'laufwerk-aenderungen-erst-nach-f5': [
    'Neue Dateien vom Kollegen sehe ich erst, wenn ich F5 drücke.',
    'Der Explorer aktualisiert den Netzordner nicht von selbst.',
    'Gespeicherte Dateien tauchen im Ordner erst nach ein paar Minuten auf.',
  ],
  'laufwerk-doppelt': [
    'Ich habe dasselbe Laufwerk zweimal unter verschiedenen Buchstaben.',
    'Im Explorer erscheint der gleiche Ordner doppelt.',
    'Einmal ist es I: und einmal Z:, aber dahinter ist dieselbe Ablage.',
  ],
  'laufwerk-fehler-67': [
    'Beim Verbinden kommt „Der Netzwerkname wurde nicht gefunden“.',
    'Systemfehler 67, obwohl der Server erreichbar ist.',
    'Die Freigabe gibt es angeblich nicht, der Server antwortet aber.',
  ],
  'laufwerk-arbeitsstationsdienst': [
    'Internet geht, aber kein einziges Laufwerk ist erreichbar.',
    'Fehler 0x800704cf, der Netzwerkstandort sei nicht erreichbar.',
    'Alle Laufwerke sind tot, obwohl Teams und Outlook gehen.',
  ],
  'laufwerk-verknuepfungen-alter-server': [
    'Meine Verknüpfungen auf dem Desktop zeigen auf einen Server, den es nicht mehr gibt.',
    'Beim Öffnen einer Verknüpfung kommt „Das Element wurde geändert oder verschoben“.',
    'Die Links zu meinen Projektordnern sind seit dem Umzug kaputt.',
  ],
  'laufwerk-dfs-pfad': [
    'Der Pfad über den Firmennamen geht nicht, über den Servernamen schon.',
    'Unter dem DFS-Pfad kommt „nicht erreichbar“.',
    'Der gemeinsame Namespace der Domäne öffnet sich bei mir nicht.',
  ],
  'laufwerk-vorgaengerversionen-leer': [
    'Unter „Vorgängerversionen“ steht, es gebe keine älteren Versionen.',
    'Ich wollte eine alte Version zurückholen, die Liste ist aber leer.',
    'Der Reiter mit den früheren Versionen zeigt nichts an.',
  ],
  'laufwerk-nach-neustart-weg': [
    'Ich verbinde mein Laufwerk jeden Morgen neu, nach dem Neustart ist es weg.',
    'Das Laufwerk merkt sich Windows nicht dauerhaft.',
    'Nach jedem Hochfahren fehlt mein selbst angelegtes Laufwerk wieder.',
  ],
  'laufwerk-offline-cache-voll': [
    'Mein C: ist voll und der Grund sind offline gespeicherte Netzordner.',
    'Der Ordner Windows CSC frisst Gigabytes auf meiner Festplatte.',
    'Offline verfügbar gemachte Ordner füllen meinen Laptop.',
  ],
  'laufwerk-pfad-leerzeichen': [
    'Mein Skript findet „skf Marine“ nicht, weil es nur bis „skf“ liest.',
    'Ein Programm schneidet den Pfad beim Leerzeichen ab.',
    'Die Batch-Datei meldet, der Pfad \\\\w3172\\skf wurde nicht gefunden.',
  ],
  'laufwerk-viele-kleine-dateien': [
    'Einen Ordner mit tausenden Dateien zu kopieren dauert Stunden.',
    'Das Kopieren vieler kleiner Dateien kriecht im Schneckentempo.',
    'Beim Kopieren steht seit Ewigkeiten „Zeit wird berechnet“.',
  ],
  'laufwerk-fremdes-konto': [
    'Mein Laufwerk ist mit dem Benutzer eines Kollegen verbunden.',
    'Ich sehe Ordner, die eigentlich nur ein Kollege sehen darf.',
    'Das Laufwerk läuft unter einem Admin-Konto statt unter meinem.',
  ],
  'laufwerk-ot-pc-freigabe': [
    'Der Rechner an der Maschine kommt seit der Netzumstellung nicht mehr an den Server.',
    'Der Messraum-PC kann keine Programme mehr vom Laufwerk laden.',
    'Die CNC-Programme lassen sich nicht mehr vom Server holen.',
  ],
  'laufwerk-suche-findet-nichts': [
    'Die Suche auf I: dauert ewig und findet nichts.',
    'Im Netzlaufwerk eine Datei zu suchen bringt keine Treffer.',
    'Ich suche nach einem Dateinamen auf dem Server und der Explorer findet ihn nicht.',
  ],
  'laufwerk-ohne-eigenschaften-kopieren': [
    'Windows fragt beim Kopieren, ob die Datei ohne Eigenschaften kopiert werden soll.',
    'Beim Kopieren auf das NAS kommt eine Meldung zu fehlenden Eigenschaften.',
    'Eine Datei mit grünem Namen will Windows nur ohne Eigenschaften kopieren.',
  ],
  'laufwerk-eigene-freigabe': [
    'Ich möchte einen Ordner auf meinem Laptop für Kollegen freigeben.',
    'Wie kann ich einem Kollegen Zugriff auf meinen lokalen Ordner geben?',
    'Die Freigabe auf meinem PC funktioniert für andere nicht.',
  ],
  'laufwerk-per-name-verweigert': [
    'Mit der IP-Adresse komme ich auf die Freigabe, mit dem Namen nicht.',
    'Über den Servernamen kommt „Zugriff verweigert“, über die IP geht es.',
    'Der Name des Servers fragt nach Kennwort, die Adresse nicht.',
  ],
  'laufwerk-element-nicht-gefunden': [
    'Ich kann eine Datei nicht löschen, es kommt „Element wurde nicht gefunden“.',
    'Ein Ordner lässt sich weder umbenennen noch löschen, Windows findet ihn angeblich nicht.',
    'Eine Datei mit Punkt am Ende lässt sich nicht entfernen.',
  ],
}
