// ── Weitere Beschreibungen (so sagen es Anwender) für BESTEHENDE Probleme — Gruppe „windows“ ──
// Schlüssel = Problem-ID, Wert = 3 zusätzliche Beschreibungen in eigenen Worten.
// Bereiche: Windows & Oberfläche · Leistung & Speicher · Updates & Software (Probleme aus system.ts / system2.ts).

export const VARIANTEN_WINDOWS: Record<string, string[]> = {
  // ══ Windows & Oberfläche ═════════════════════════════════════════════════════
  'windows-startmenue-oeffnet-nicht': [
    'Ich klicke unten links auf das Windows-Symbol und es passiert einfach gar nichts.',
    'Wenn ich die Windows-Taste drücke, geht kein Menü mehr auf.',
    'Mein Start-Knopf ist tot, ich komme an keine Programme mehr ran.',
  ],
  'windows-taskleiste-reagiert-nicht': [
    'Die Leiste unten lässt sich nicht mehr anklicken, alles andere geht aber.',
    'Ich kann in der unteren Leiste kein Programm mehr öffnen, sie ist wie festgefroren.',
    'Klicks auf die Symbole unten bewirken nichts, auch die Uhr reagiert nicht.',
  ],
  'windows-taskleiste-fehlt': [
    'Unten am Bildschirm ist der ganze Balken mit den Programmen weg.',
    'Ich sehe keine Uhr und keinen Startknopf mehr, nur noch den Desktop.',
    'Nach dem Abdocken vom Monitor ist meine untere Leiste nicht mehr da.',
  ],
  'windows-desktop-symbole-weg': [
    'Auf meinem Bildschirm ist nur noch das Hintergrundbild, alle Verknüpfungen fehlen.',
    'Meine ganzen Dateien und Programme auf dem Desktop sind wie weggezaubert.',
    'Nach dem Anmelden ist der Desktop komplett leer, sonst lagen da viele Sachen.',
  ],
  'windows-symbole-vorschau-falsch': [
    'Bei manchen Dateien wird ein weißes Blatt statt des richtigen Programmsymbols angezeigt.',
    'Die kleinen Bilder im Ordner zeigen alte oder falsche Inhalte.',
    'Meine Excel-Dateien haben plötzlich das Symbol von einem anderen Programm.',
  ],
  'windows-suche-findet-nichts': [
    'Ich tippe den Namen eines Programms ein und Windows zeigt keine Treffer.',
    'Die Suche unten links bleibt leer, egal was ich eingebe.',
    'Dateien, die ich gestern gespeichert habe, findet die Suche einfach nicht.',
  ],
  'windows-suchfeld-keine-eingabe': [
    'Ich klicke in die Suche, aber die Buchstaben erscheinen dort nicht.',
    'Das Suchfenster geht auf, doch meine Tastatur schreibt da nichts hinein.',
    'Beim Tippen in die Suchleiste passiert nichts, der Cursor blinkt nicht mal.',
  ],
  'windows-explorer-stuerzt-ab': [
    'Mein Dateifenster schließt sich ständig von selbst, mitten beim Arbeiten.',
    'Immer wieder flackert der Bildschirm, die Leiste verschwindet kurz und alle Ordner sind zu.',
    'Wenn ich Ordner öffne, kommt „Windows-Explorer funktioniert nicht mehr“.',
  ],
  'windows-explorer-langsam-netzlaufwerk': [
    'Das Öffnen eines Ordners dauert ewig, oben läuft nur der grüne Balken.',
    'Bis meine Laufwerke im Dateifenster erscheinen, vergeht fast eine Minute.',
    'Der Explorer hängt jedes Mal, wenn ich auf „Dieser PC“ klicke.',
  ],
  'windows-schnellzugriff-kaputt': [
    'Meine angehefteten Ordner links im Explorer sind verschwunden.',
    'Ich kann einen Ordner links nicht mehr abpinnen, er kommt immer wieder.',
    'Beim Klick auf die Favoriten links im Dateifenster hängt alles.',
  ],
  'windows-infobereich-symbole-fehlen': [
    'Unten rechts neben der Uhr fehlen das Lautsprecher- und das Netzwerksymbol.',
    'Ich sehe die kleine Zscaler-Wolke nicht mehr in der Ecke.',
    'Die Uhrzeit unten rechts ist weg und die Symbole daneben auch.',
  ],
  'windows-benachrichtigungen-fehlen': [
    'Ich bekomme keine kleinen Hinweisfenster mehr, wenn eine Mail oder Nachricht kommt.',
    'Rechts unten ploppt seit Tagen nichts mehr auf, auch keine Terminerinnerung.',
    'Windows zeigt mir keinerlei Meldungen mehr an, nicht mal von Teams.',
  ],
  'windows-uhrzeit-falsch': [
    'Die Uhr am PC geht ein paar Minuten nach und stimmt nicht mit dem Handy überein.',
    'Bei mir steht ein ganz falsches Datum unten rechts.',
    'Seit dem Akkuwechsel zeigt der Laptop eine völlig falsche Zeit an.',
  ],
  'windows-uhr-eine-stunde-falsch': [
    'Meine Uhr ist genau sechzig Minuten vor, seit die Zeitumstellung war.',
    'Termine in Outlook sind alle um eine Stunde verschoben, weil die PC-Uhr falsch geht.',
    'Ich war auf Dienstreise und jetzt hängt die Uhrzeit eine Stunde daneben.',
  ],
  'windows-bildschirm-geht-zu-schnell-aus': [
    'Nach zwei Minuten ohne Mausbewegung muss ich schon wieder mein Kennwort eingeben.',
    'Beim Lesen von langen Dokumenten sperrt sich der PC ständig.',
    'Der Bildschirm wird viel zu früh schwarz und gesperrt.',
  ],
  'windows-schwarzer-bildschirm-nach-anmeldung': [
    'Nach dem Kennwort sehe ich nur eine schwarze Fläche und die Maus.',
    'Der Desktop kommt nach der Anmeldung nicht, alles bleibt dunkel.',
    'Ich habe mich angemeldet, aber außer dem Mauspfeil ist nichts zu sehen.',
  ],
  'windows-herunterfahren-haengt': [
    'Beim Ausschalten dreht sich der Kreis endlos und der PC geht nicht aus.',
    'Der Rechner bleibt bei „Wird heruntergefahren“ stehen, ich muss den Knopf drücken.',
    'Am Feierabend will ich ausschalten, aber der Laptop läuft ewig weiter.',
  ],
  'windows-fehler-trotz-herunterfahren': [
    'Ich schalte jeden Abend aus, aber der Fehler ist morgens immer noch da.',
    'Ausschalten hilft nicht, nur ein Neustart behebt das Problem für kurze Zeit.',
    'Laut Task-Manager läuft der PC seit Wochen, obwohl ich ihn täglich herunterfahre.',
  ],
  'windows-tastatur-falsches-layout': [
    'Wenn ich Z drücke, kommt Y heraus und die Umlaute fehlen.',
    'Die Sonderzeichen sind alle an der falschen Stelle, das @ geht nicht mehr.',
    'Meine Tastatur schreibt wie eine amerikanische, statt ß kommt ein Minus.',
  ],
  'windows-kontextmenue-langsam': [
    'Nach dem Klick mit der rechten Maustaste dauert es Sekunden, bis das Menü kommt.',
    'Das Menü mit Kopieren und Umbenennen erscheint nur sehr verzögert.',
    'Wenn ich mit rechts auf eine Datei klicke, hängt das Fenster kurz.',
  ],
  'windows-falsches-standardprogramm': [
    'Meine Word-Dateien gehen plötzlich mit einem anderen Programm auf.',
    'Bilder öffnen sich im Browser statt in der Fotoanzeige.',
    'Beim Doppelklick nimmt Windows immer die falsche Anwendung.',
  ],
  'windows-pdf-oeffnet-im-browser': [
    'Jede PDF geht im Browser-Fenster auf, ich will aber Adobe benutzen.',
    'Beim Doppelklick auf eine PDF startet Edge und nicht der Acrobat.',
    'Ich kann PDFs nicht bearbeiten, weil sie immer im Internet-Browser landen.',
  ],
  'windows-verknuepfung-fehlt': [
    'Ich finde das Programm nicht mehr im Startmenü, obwohl es installiert ist.',
    'Das Symbol zum Starten von SAP ist vom Desktop verschwunden.',
    'Wo ist die Verknüpfung hin? Ich kann die Anwendung nicht mehr anklicken.',
  ],
  'windows-einstellungen-oeffnen-nicht': [
    'Das Zahnrad für die Einstellungen geht auf und sofort wieder zu.',
    'Die Windows-Einstellungen lassen sich nicht starten, auch nicht über Rechtsklick.',
    'Eingebaute Apps wie der Rechner reagieren nicht mehr auf Klicks.',
  ],
  'windows-fenster-ausserhalb-bildschirm': [
    'Das Programm läuft unten in der Leiste, aber das Fenster ist nirgends zu sehen.',
    'Seit ich den zweiten Monitor abgesteckt habe, öffnet sich ein Fenster ins Leere.',
    'Ich sehe nur einen kleinen Rand des Fensters ganz am Bildschirmrand.',
  ],
  'windows-hintergrundbild-schwarz': [
    'Mein Desktop-Hintergrund ist nur noch schwarz statt des Firmenbilds.',
    'Das SKF-Hintergrundbild fehlt, alles ist einfarbig dunkel.',
    'Ich kann kein eigenes Bild mehr als Hintergrund einstellen, es bleibt schwarz.',
  ],
  'windows-papierkorb-beschaedigt': [
    'Beim Löschen kommt eine Meldung, der Papierkorb auf C: sei kaputt und soll geleert werden.',
    'Windows fragt, ob es den beschädigten Papierkorb leeren darf.',
    'Ich kann keine Dateien mehr in den Papierkorb verschieben, es kommt ein Fehler.',
  ],
  'windows-screenshot-geht-nicht': [
    'Mit Windows+Umschalt+S passiert nichts mehr, der Bildschirm wird nicht grau.',
    'Ich kann keinen Ausschnitt mehr vom Bildschirm machen.',
    'Das Ausschneide-Werkzeug startet nicht, ich brauche aber ein Bild vom Fehler.',
  ],
  'windows-fehlermeldung-nach-anmeldung': [
    'Jeden Morgen poppt nach dem Einloggen ein Fehlerfenster auf.',
    'Direkt nach dem Start kommt eine Meldung, dass etwas nicht gefunden wurde.',
    'Beim Hochfahren erscheint immer eine Box mit einem Fehler, die ich wegklicken muss.',
  ],
  'windows-beschraenkungen-meldung': [
    'Beim Öffnen von Laufwerk C: kommt, dass der Vorgang wegen Einschränkungen abgebrochen wurde.',
    'Ich darf ein Programm nicht starten, Windows verweist auf meinen Administrator.',
    'Eine Meldung sagt, die Aktion sei auf diesem Computer nicht erlaubt.',
  ],
  'windows-ordner-aktualisiert-nicht': [
    'Neu gespeicherte Dateien tauchen im Ordner erst auf, wenn ich F5 drücke.',
    'Gelöschte Dateien stehen weiter in der Liste, bis ich den Ordner neu öffne.',
    'Der Explorer zeigt einen alten Stand an, die Anzeige aktualisiert sich nicht.',
  ],
  'windows-ziehen-ablegen-geht-nicht': [
    'Ich kann Dateien nicht mehr mit der Maus in einen anderen Ordner ziehen.',
    'Einen Anhang aus Outlook auf den Desktop ziehen funktioniert nicht.',
    'Beim Verschieben mit gedrückter Maustaste erscheint nur ein Verbotsschild.',
  ],
  'windows-anzeigesprache-falsch': [
    'Auf einmal sind alle Menüs von Windows auf Englisch.',
    'Mein Startmenü und die Einstellungen sprechen kein Deutsch mehr.',
    'Nach dem Update ist Windows in einer anderen Sprache.',
  ],
  'windows-startmenue-zurueckgesetzt': [
    'Meine angepinnten Programme im Startmenü sind alle weg, wie bei einem neuen PC.',
    'Im Start sind nur noch die Standard-Apps, meine eigenen Symbole fehlen.',
    'Die Anordnung im Startmenü ist nach dem Neustart verschwunden.',
  ],
  'windows-zwischenablage-geht-nicht': [
    'Strg+C und Strg+V machen nichts, es wird nichts eingefügt.',
    'Ich kopiere einen Text, aber beim Einfügen kommt etwas Altes.',
    'Kopieren aus Excel nach Outlook funktioniert überhaupt nicht mehr.',
  ],
  'windows-datei-in-benutzung': [
    'Ich will einen Ordner löschen, aber Windows sagt, er sei in einem anderen Programm geöffnet.',
    'Eine Datei lässt sich nicht verschieben, weil sie angeblich verwendet wird.',
    'Beim Umbenennen kommt immer „Die Aktion kann nicht abgeschlossen werden“.',
  ],
  'windows-zahlenformat-falsch': [
    'Excel macht aus meinen Kommazahlen plötzlich Datumswerte.',
    'Beträge werden mit Punkt statt Komma angezeigt.',
    'Das Datum steht in amerikanischer Reihenfolge, Monat vor Tag.',
  ],
  'windows-bildschirmtastatur-springt-auf': [
    'Jedes Mal, wenn ich in ein Feld klicke, erscheint unten eine Tastatur auf dem Bildschirm.',
    'Am Touch-Laptop poppt ständig das virtuelle Tastenfeld auf.',
    'Die Tastatur zum Antippen verdeckt die Hälfte meines Fensters.',
  ],
  'windows-schrift-kaestchen-fontcache': [
    'In den Menüs stehen nur leere Rechtecke statt Buchstaben.',
    'Überall in Windows sind die Texte in einer komischen Schrift.',
    'Statt ä und ö sehe ich in Dialogen Fragezeichen.',
  ],
  'windows-zwischenablage-verlauf-leer': [
    'Wenn ich die Windows-Taste und V drücke, steht da nichts.',
    'Ich möchte mehrere Sachen kopieren und später auswählen, das klappt nicht.',
    'Die Liste mit meinen letzten Kopien ist immer leer.',
  ],
  'windows-tastenkuerzel-gehen-nicht': [
    'Windows-Taste und E öffnet keinen Explorer mehr.',
    'Mit Windows+L kann ich den PC nicht mehr sperren.',
    'Alle Kombinationen mit der Windows-Taste funktionieren nicht.',
  ],
  'windows-pdf-vorschau-explorer': [
    'Rechts im Explorer sehe ich bei PDF-Dateien keine Vorschau.',
    'Das Vorschaufenster bleibt bei PDFs weiß, bei Bildern geht es.',
    'Ich möchte in eine PDF schauen, ohne sie zu öffnen, aber die Vorschau ist leer.',
  ],
  'windows-zip-entpacken-fehler': [
    'Beim Auspacken eines ZIP-Archivs kommt eine Fehlermeldung.',
    'Windows sagt, der komprimierte Ordner sei ungültig.',
    'Ich kann die Datei vom Kunden nicht entpacken.',
  ],
  'windows-sperrbildschirm-haengt': [
    'Am Sperrbildschirm kann ich kein Kennwort eingeben, nichts reagiert.',
    'Nach der Mittagspause kommt das Anmeldefeld nicht, nur das Bild.',
    'Ich drücke Strg+Alt+Entf, aber der Bildschirm bleibt stehen.',
  ],
  'windows-konsolenfenster-blitzt-auf': [
    'Immer wieder erscheint kurz ein schwarzes Fenster und verschwindet.',
    'Mitten beim Tippen geht ein dunkles Fenster auf und klaut mir den Fokus.',
    'Alle paar Minuten flackert ein Befehlsfenster über den Bildschirm.',
  ],
  'windows-infocenter-oeffnet-nicht': [
    'Ein Klick auf Uhr und Datum zeigt keinen Kalender mehr.',
    'Das Feld mit WLAN, Lautstärke und Helligkeit unten rechts öffnet nicht.',
    'Ich komme nicht mehr an die Schnellschalter in der Ecke rechts unten.',
  ],
  'windows-erzaehler-lupe-versehentlich': [
    'Der PC liest mir alles vor, was ich anklicke.',
    'Auf einmal ist alles riesig vergrößert und folgt der Maus.',
    'Eine Computerstimme spricht ständig und um die Fenster ist ein blauer Rahmen.',
  ],

  // ══ Leistung & Speicher ══════════════════════════════════════════════════════
  'leistung-pc-sehr-langsam': [
    'Alles am Rechner dauert ewig, selbst das Öffnen von Outlook.',
    'Mein Computer ist seit Tagen total zäh und reagiert verzögert.',
    'Jeder Klick braucht mehrere Sekunden, so kann ich nicht arbeiten.',
  ],
  'leistung-cpu-100-luefter': [
    'Der Laptop rauscht wie ein Föhn, obwohl ich nur E-Mails lese.',
    'Im Task-Manager steht der Prozessor die ganze Zeit ganz oben am Anschlag.',
    'Das Gerät wird heiß und die Lüftung hört gar nicht mehr auf.',
  ],
  'leistung-arbeitsspeicher-voll': [
    'Sobald ich mehrere Programme offen habe, wird alles träge und hängt.',
    'Der Task-Manager zeigt beim Speicher über 90 Prozent belegt.',
    'Mit vielen Browser-Tabs und Excel gleichzeitig geht gar nichts mehr.',
  ],
  'leistung-meldung-virtueller-speicher': [
    'Windows warnt, dass der Speicher knapp wird und ich Programme schließen soll.',
    'Es kommt ein Hinweis, das System habe zu wenig virtuellen Arbeitsspeicher.',
    'Plötzlich schließen sich Programme mit einer Meldung über wenig Speicher.',
  ],
  'leistung-festplatte-voll': [
    'Der Balken bei Laufwerk C ist rot und es ist kaum noch Platz frei.',
    'Ich kann nichts mehr speichern, weil die Festplatte voll ist.',
    'Windows meldet ständig, dass der Speicherplatz zur Neige geht.',
  ],
  'leistung-windows-ordner-gross': [
    'Der Ordner C:\\Windows ist riesig, obwohl ich da nie etwas abgelegt habe.',
    'Updates fressen mir immer mehr Platz auf dem Laufwerk weg.',
    'WinSxS belegt laut Analyse viele Gigabyte, kann man das verkleinern?',
  ],
  'leistung-onedrive-belegt-platz': [
    'Seit OneDrive eingerichtet ist, wird mein Laufwerk C immer voller.',
    'Alle Teams-Dateien liegen lokal auf dem Laptop und nehmen Platz weg.',
    'Die Synchronisierung lädt alles herunter, jetzt ist die Platte voll.',
  ],
  'leistung-pc-friert-ein': [
    'Das Bild bleibt komplett stehen, nicht mal die Maus bewegt sich noch.',
    'Mein Rechner hängt sich auf und ich muss den Ausschalter gedrückt halten.',
    'Mehrmals am Tag friert alles ein und nur ein harter Neustart hilft.',
  ],
  'leistung-bluescreen': [
    'Plötzlich wurde der Bildschirm blau mit einem traurigen Smiley und der PC startete neu.',
    'Ich hatte einen blauen Fehlerbildschirm mit einem langen Code darauf.',
    'Der Computer stürzt mit einer blauen Seite ab und sammelt Fehlerinformationen.',
  ],
  'leistung-pc-startet-staendig-neu': [
    'Der Rechner bootet mehrmals am Tag ohne Vorwarnung neu.',
    'Mitten in der Arbeit geht der PC aus und fährt wieder hoch.',
    'Mein Laptop macht immer wieder einen Neustart, ohne dass ich etwas tue.',
  ],
  'leistung-pc-geht-einfach-aus': [
    'Ohne Meldung ist der Bildschirm schwarz und der Rechner aus.',
    'Der Laptop schaltet sich mitten im Meeting einfach ab.',
    'Manchmal ist der PC von einer Sekunde auf die andere stromlos.',
  ],
  'leistung-hochfahren-langsam': [
    'Vom Einschalten bis ich arbeiten kann vergehen zehn Minuten.',
    'Morgens dauert der Start des Computers eine Ewigkeit.',
    'Nach dem Anschalten dreht sich der Kreis endlos lange.',
  ],
  'leistung-datentraeger-100': [
    'Im Task-Manager steht beim Datenträger dauernd hundert Prozent.',
    'Die Festplatte arbeitet ununterbrochen und alles ist langsam.',
    'Das Laufwerk ist voll ausgelastet, obwohl ich nichts kopiere.',
  ],
  'leistung-ssd-fehler': [
    'Windows warnt, dass mit dem Laufwerk etwas nicht stimmt.',
    'Beim Speichern kommen Lesefehler und Dateien sind beschädigt.',
    'Die Festplatte macht Probleme und das Ereignisprotokoll zeigt Datenträgerfehler.',
  ],
  'leistung-langsam-nach-update': [
    'Seit dem letzten Patchday ist mein Rechner viel langsamer.',
    'Nach den Windows-Updates gestern ist alles träge geworden.',
    'Vor dem Update lief alles flüssig, jetzt hängt der PC ständig.',
  ],
  'leistung-gedrosselt-energieplan': [
    'Mein Rechner ist am Netzteil genauso langsam wie im Akkubetrieb.',
    'Der Prozessor kommt nie richtig auf Touren, alles läuft im Sparmodus.',
    'Das Energieprofil steht auf Stromsparen und der PC ist deshalb lahm.',
  ],
  'leistung-defender-scan-bremst': [
    'Jeden Mittag läuft ein Virenscan und der PC ist dann kaum benutzbar.',
    'Im Task-Manager zieht „Antimalware Service Executable“ die ganze Leistung.',
    'Der Virenschutz prüft ständig etwas und alles wird langsam.',
  ],
  'leistung-suchindexer-last': [
    'Der Windows-Suchdienst arbeitet ununterbrochen und belastet die Festplatte.',
    'Im Task-Manager steht „Microsoft Windows Search Indexer“ ganz oben.',
    'Seit Outlook neu eingerichtet ist, indiziert der PC ohne Ende.',
  ],
  'leistung-softwareverteilung-im-hintergrund': [
    'Das Softwarecenter installiert gerade etwas und der PC ist dadurch langsam.',
    'Im Hintergrund läuft eine Installation, die alles ausbremst.',
    'Der Rechner ist träge, weil gerade Programme verteilt werden.',
  ],
  'leistung-mikroruckler': [
    'Alle paar Sekunden bleibt die Maus kurz hängen.',
    'Beim Tippen stockt der Text immer wieder für einen Moment.',
    'Videos und Mauszeiger ruckeln regelmäßig für den Bruchteil einer Sekunde.',
  ],
  'leistung-programm-startet-langsam': [
    'Nur ein bestimmtes Programm braucht Minuten zum Öffnen, alles andere ist schnell.',
    'SAP geht bei mir ewig nicht auf, bei Kollegen schon.',
    'Ein Programm zeigt lange nur den Startbildschirm, bevor es reagiert.',
  ],
  'leistung-dienst-hohe-last': [
    'Ein Diensthost-Prozess frisst dauerhaft Prozessorleistung.',
    'Im Task-Manager steht ein svchost-Eintrag mit hoher Last ganz oben.',
    'Ein Windows-Dienst im Hintergrund lastet den PC ständig aus.',
  ],
  'leistung-dienste-starten-nicht': [
    'Nach dem Hochfahren laufen wichtige Windows-Dienste nicht.',
    'Ich muss nach jedem Start Dienste von Hand anstoßen, sonst geht nichts.',
    'Einige Funktionen gehen erst, wenn man die Dienste manuell startet.',
  ],
  'leistung-ram-weniger-als-verbaut': [
    'Der Laptop hat 16 GB, Windows zeigt aber nur die Hälfte an.',
    'In den Systeminformationen steht weniger Speicher, als eingebaut sein sollte.',
    'Ein Teil vom Arbeitsspeicher ist anscheinend nicht nutzbar.',
  ],
  'leistung-nur-ein-benutzer-langsam': [
    'Wenn sich mein Kollege an meinem PC anmeldet, ist alles schnell, bei mir nicht.',
    'Nur in meinem Konto ist der Rechner langsam.',
    'Mit einem anderen Benutzer läuft der PC normal, mit meinem träge.',
  ],
  'leistung-nach-standby-haengt': [
    'Wenn ich den Laptop aufklappe, ist alles erst mal minutenlang zäh.',
    'Nach dem Ruhezustand hängen Programme und die Maus ruckelt.',
    'Aus dem Energiesparmodus kommt der PC nur schwerfällig zurück.',
  ],
  'leistung-hardwarefehler-whea': [
    'In der Ereignisanzeige stehen viele Hardware-Fehler mit WHEA-Logger.',
    'Der PC meldet einen schwerwiegenden Hardwarefehler im Protokoll.',
    'Das Protokoll ist voll mit Fehlern zu Prozessor oder PCI-Express.',
  ],
  'leistung-bluescreen-driver-power-state': [
    'Beim Zuklappen oder Abziehen vom Dock kommt ein blauer Bildschirm.',
    'Der Bluescreen nennt einen Fehler zum Energiezustand eines Treibers.',
    'Jedes Mal beim Aufwachen aus dem Standby stürzt der Laptop blau ab.',
  ],
  'leistung-bluescreen-nach-update': [
    'Seit der Installation eines neuen Treibers stürzt Windows mit blauem Bild ab.',
    'Nach dem Update gestern habe ich schon zweimal einen Bluescreen gehabt.',
    'Der blaue Fehlerbildschirm tritt erst auf, seit ein Update installiert wurde.',
  ],
  'leistung-bluescreen-memory-management': [
    'Der Bluescreen sagt etwas von Speicherverwaltung.',
    'Mein PC stürzt mit einem Fehler zum Arbeitsspeicher ab.',
    'Immer wieder Abstürze mit Speicherfehlern – ist der RAM kaputt?',
  ],
  'leistung-explorer-hohe-last': [
    'Der Windows-Explorer belegt dauerhaft einen großen Teil der CPU.',
    'Im Task-Manager steht explorer.exe immer ganz oben bei der Auslastung.',
    'Seit ich einen bestimmten Ordner geöffnet habe, rechnet der Explorer ununterbrochen.',
  ],
  'leistung-dwm-grafiklast': [
    'Beim Verschieben von Fenstern ruckelt alles und die Grafiklast ist hoch.',
    'Der Desktopfenster-Manager zieht viel Leistung, obwohl nichts passiert.',
    'Mit zwei Monitoren am Dock wird die Darstellung zäh und flackert.',
  ],
  'leistung-c-laeuft-immer-wieder-voll': [
    'Ich habe aufgeräumt, aber nach ein paar Tagen ist C wieder voll.',
    'Irgendwas schreibt mein Laufwerk ständig zu, der Platz schrumpft täglich.',
    'Freier Speicher verschwindet immer wieder, obwohl ich nichts speichere.',
  ],
  'leistung-laufwerk-d-fehlt': [
    'Meine zweite Festplatte mit den Daten taucht im Explorer nicht mehr auf.',
    'Das Laufwerk D: ist weg, gestern war es noch da.',
    'Unter „Dieser PC“ fehlt die interne Datenplatte.',
  ],
  'leistung-systemunterbrechungen': [
    'Im Task-Manager steht „Systemunterbrechungen“ mit hoher Prozessorlast.',
    'Ein Eintrag namens System interrupts bremst den ganzen Rechner.',
    'Die Hardware-Interrupts belasten die CPU und der Ton knackt.',
  ],
  'leistung-alte-profile-belegen-platz': [
    'Am Schicht-PC haben sich hunderte Leute angemeldet und die Platte ist voll.',
    'Unter C:\\Users liegen unzählige alte Benutzerordner.',
    'Der Hallenrechner hat keinen Platz mehr, weil jedes Profil Gigabytes belegt.',
  ],

  // ══ Updates & Software ═══════════════════════════════════════════════════════
  'update-haengt': [
    'Die Updates stehen seit Stunden bei 0 Prozent und bewegen sich nicht.',
    'Beim Herunterladen der Aktualisierungen geht es einfach nicht weiter.',
    'Windows zeigt seit gestern „Wird installiert – 45 %“ und bleibt dort stehen.',
  ],
  'update-fehlercode': [
    'Bei den Windows-Aktualisierungen steht nur „Fehler“ mit einer langen Nummer.',
    'Ein Sicherheitsupdate schlägt jedes Mal wieder fehl.',
    'Im Updateverlauf sind lauter rote Einträge „Installation fehlgeschlagen“.',
  ],
  'update-zu-wenig-speicher': [
    'Windows sagt, es braucht mehr freien Speicherplatz für das Update.',
    'Das große Update bricht ab, weil die Festplatte zu voll ist.',
    'Für die Aktualisierung soll ich erst Platz schaffen.',
  ],
  'update-server-nicht-erreichbar': [
    'Bei der Suche nach Updates meldet Windows, dass es keine Verbindung bekommt.',
    'Im Homeoffice findet mein PC keine Updates, im Büro schon.',
    'Die Updatesuche bricht ab, weil der Server nicht erreichbar ist.',
  ],
  'update-neustart-staendig-verlangt': [
    'Ich habe schon dreimal neu gestartet, aber Windows will immer noch einen Neustart.',
    'Die gelbe Meldung „Neustart erforderlich“ geht nicht weg.',
    'Jeden Tag fordert mich Windows wieder zum Neustarten auf.',
  ],
  'update-wird-rueckgaengig-gemacht': [
    'Beim Neustart steht „Updates konnten nicht abgeschlossen werden, Änderungen werden rückgängig gemacht“.',
    'Nach jedem Update-Neustart dreht sich der Kreis lange und dann ist alles wie vorher.',
    'Das Update wird installiert und beim Hochfahren wieder entfernt.',
  ],
  'update-funktionsupdate-scheitert': [
    'Das große Windows-Upgrade auf die neue Version klappt bei mir nicht.',
    'Alle Kollegen haben schon die neue Windows-Version, ich nicht.',
    'Die Installation der neuen Windows-Version bricht immer wieder ab.',
  ],
  'update-programm-installation-scheitert': [
    'Das Setup eines Programms bricht mittendrin mit einem Fehler ab.',
    'Ich bekomme die Software einfach nicht auf meinen Rechner.',
    'Die Installation läuft kurz und dann kommt „fehlgeschlagen“.',
  ],
  'update-andere-installation-laeuft': [
    'Das Setup sagt, ich soll warten, bis eine andere Installation fertig ist.',
    'Es kommt immer, dass bereits eine Installation ausgeführt wird, obwohl ich nichts installiere.',
    'Im Softwarecenter steht Fehler 1618, angeblich läuft schon etwas.',
  ],
  'update-installer-dienst-fehler': [
    'Bei jeder MSI-Datei kommt, dass auf den Installationsdienst nicht zugegriffen werden kann.',
    'Der Windows Installer funktioniert nicht, keine Installation startet.',
    'Programme lassen sich weder installieren noch entfernen, es kommt ein Installer-Fehler.',
  ],
  'update-softwarecenter-zeigt-programm-nicht': [
    'Die IT hat mir ein Programm freigegeben, aber im Softwarecenter sehe ich es nicht.',
    'Das Programm, das der Kollege im Softwarecenter hat, fehlt bei mir.',
    'Unter Anwendungen im Softwarecenter ist die Software nicht aufgelistet.',
  ],
  'update-softwarecenter-oeffnet-nicht': [
    'Das Softwarecenter startet nicht oder zeigt nur eine leere Seite.',
    'Beim Öffnen des Softwarecenters kommt, dass es keine Verbindung herstellen kann.',
    'Im Softwarecenter steht gar nichts, keine Programme und keine Updates.',
  ],
  'update-softwarecenter-download-haengt': [
    'Im Softwarecenter bleibt die Installation beim Herunterladen ewig stehen.',
    'Der Fortschritt beim Download eines Programms bewegt sich nicht.',
    'Die Software wird seit Stunden heruntergeladen und nichts passiert.',
  ],
  'update-unternehmensportal-app': [
    'Ich klicke im Unternehmensportal auf Installieren, aber die App kommt nicht.',
    'Die Installation über Intune bleibt hängen oder schlägt fehl.',
    'Im Unternehmensportal steht bei der App „Fehler bei der Installation“.',
  ],
  'update-programm-startet-nicht': [
    'Ich klicke auf das Programmsymbol und es tut sich gar nichts.',
    'Die Anwendung erscheint kurz im Task-Manager und verschwindet wieder.',
    'Seit gestern lässt sich ein bestimmtes Programm nicht mehr öffnen.',
  ],
  'update-programm-stuerzt-ab': [
    'Das Programm schließt sich mitten in der Arbeit ohne Meldung.',
    'Mehrmals täglich kommt „Programm funktioniert nicht mehr“.',
    'Die Software crasht immer an derselben Stelle.',
  ],
  'update-treiber-bios-veraltet': [
    'HP meldet, dass für meinen Laptop neue Treiber verfügbar sind.',
    'Mein BIOS ist laut Prüfung uralt und sollte aktualisiert werden.',
    'Die Treiber auf meinem Gerät sind seit Jahren nicht erneuert worden.',
  ],
  'update-adminrechte-verlangt': [
    'Beim Installieren fragt Windows nach einem Administrator-Kennwort, das ich nicht habe.',
    'Ich darf auf meinem Rechner keine Programme einrichten.',
    'Das Setup verlangt erhöhte Rechte und bricht ohne sie ab.',
  ],
  'update-java-fehlt': [
    'Ein Programm sagt, es braucht Java, um zu starten.',
    'Die Anwendung meldet, die installierte Java-Version sei zu alt bzw. falsch.',
    'Eine JAR-Datei lässt sich nicht öffnen, weil Java fehlt.',
  ],
  'update-dotnet-fehlt': [
    'Ein älteres Programm verlangt beim Start das .NET Framework 3.5.',
    'Windows fragt, ob es eine fehlende Funktion herunterladen soll, und scheitert dann.',
    'Das Tool startet nicht, weil eine .NET-Version fehlt.',
  ],
  'update-vcredist-fehlt': [
    'Beim Start kommt, dass eine DLL-Datei auf dem Computer fehlt.',
    'Das Programm kann nicht gestartet werden, weil MSVCP140.dll nicht gefunden wurde.',
    'Eine Laufzeitbibliothek von Microsoft fehlt für unsere Anwendung.',
  ],
  'update-pdf-reader-oeffnet-nicht': [
    'Adobe geht gar nicht mehr auf, auch nicht über das Startmenü.',
    'Beim Doppelklick auf eine PDF passiert nichts, Acrobat startet nicht.',
    'Der PDF-Reader hängt beim Öffnen von Dateien.',
  ],
  'update-windows-nicht-aktiviert': [
    'Unten rechts steht ein Wasserzeichen, ich soll Windows aktivieren.',
    'In den Einstellungen heißt es, Windows sei nicht lizenziert.',
    'Mein Hintergrund lässt sich nicht ändern, weil die Aktivierung fehlt.',
  ],
  'update-gpo-software-fehlt': [
    'Ein Programm, das automatisch kommen sollte, ist bei mir nie installiert worden.',
    'Die Software, die alle per Anmeldung bekommen, fehlt auf meinem Gerät.',
    'Bei den Kollegen wurde das Programm automatisch verteilt, bei mir nicht.',
  ],
  'update-programm-verschwunden': [
    'Gestern war das Programm noch da, heute ist es weg.',
    'Eine Anwendung ist über Nacht von meinem PC verschwunden.',
    'Jemand oder etwas hat mein Programm einfach entfernt.',
  ],
  'update-seit-update-defekt': [
    'Seit Windows sich aktualisiert hat, funktioniert ein Programm nicht mehr richtig.',
    'Nach dem letzten Patch geht der Drucker bzw. eine Funktion nicht mehr.',
    'Vor dem Update war alles gut, jetzt kommen Fehler.',
  ],
  'update-pc-nicht-aktuell': [
    'Mein Rechner hat seit Monaten keine Sicherheitsupdates bekommen.',
    'Laut Update-Verlauf ist das letzte Update uralt.',
    'Die IT-Sicherheit sagt, mein PC sei nicht auf dem neuesten Stand.',
  ],
  'update-fehler-0x80070643': [
    'Ein Update für die Wiederherstellungsumgebung schlägt immer wieder fehl.',
    'Im Verlauf steht dasselbe Sicherheitsupdate zigmal mit Fehler.',
    'Windows versucht jeden Monat dasselbe Update und scheitert.',
  ],
  'update-fehler-0x800f0922': [
    'Das Update bricht bei der Installation ab, Fehlercode endet auf 0922.',
    'Im Homeoffice scheitert das kumulative Update immer.',
    'Windows meldet, dass Updates nicht installiert werden konnten, wegen Verbindung oder Partition.',
  ],
  'update-fehler-0x80070005': [
    'Beim Installieren kommt „Zugriff verweigert“ mit dem Code 0x80070005.',
    'Das Update scheitert an fehlenden Berechtigungen.',
    'Ein Programm lässt sich nicht installieren, weil der Zugriff abgelehnt wird.',
  ],
  'update-softwarecenter-erkennung-0x87d00324': [
    'Das Programm ist installiert, aber das Softwarecenter zeigt „Fehlgeschlagen“.',
    'Im Softwarecenter steht ein Fehler, obwohl die Software läuft.',
    'Die Installation hat geklappt, trotzdem meldet das Softwarecenter einen Fehlercode.',
  ],
  'update-unternehmensportal-fehlt': [
    'Ich finde das Unternehmensportal nicht auf meinem Rechner.',
    'Die App für die Firmen-Software startet nicht.',
    'Mir wurde gesagt, ich soll im Unternehmensportal nachsehen, aber es ist nicht da.',
  ],
  'update-microsoft-store-geht-nicht': [
    'Der Store öffnet sich nicht oder bleibt leer.',
    'Apps aus dem Microsoft Store lassen sich nicht herunterladen.',
    'Beim Installieren einer Store-App kommt ein Fehler.',
  ],
  'update-acrobat-testversion-anmeldung': [
    'Adobe will, dass ich mich anmelde, sonst geht nichts.',
    'Acrobat sagt, der Testzeitraum sei vorbei.',
    'Bei Adobe erscheint ein Fenster zum Kaufen bzw. Anmelden.',
  ],
  'update-dotnet-runtime-fehlt': [
    'Ein Programm meldet, dass ich eine .NET-Laufzeit installieren muss.',
    'Beim Start kommt ein Fenster „To run this application, you must install .NET“.',
    'Das neue Tool verlangt eine Desktop Runtime, die nicht da ist.',
  ],
  'update-deinstallation-geht-nicht': [
    'Ich will ein altes Programm loswerden, aber die Deinstallation bricht ab.',
    'Unter Apps fehlt der Knopf zum Entfernen oder er tut nichts.',
    'Ein Programm bleibt in der Liste, auch nach dem Deinstallieren.',
  ],
  'update-installer-fehler-2503': [
    'Bei der Installation kommt „Interner Fehler 2503“.',
    'Das Setup bricht mit Fehler 2502 ab.',
    'Eine MSI-Installation endet immer mit einem internen Fehler.',
  ],
  'update-treiber-ueber-windows-update': [
    'Windows Update installiert mir immer wieder einen alten Grafiktreiber.',
    'Ich habe den richtigen Treiber installiert, aber am nächsten Tag ist der alte wieder da.',
    'Über die Updates kommt ständig ein falscher Treiber, der Probleme macht.',
  ],
}
