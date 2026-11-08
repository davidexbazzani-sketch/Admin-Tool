// ── Weitere Beschreibungen (so sagen es Anwender) für BESTEHENDE Probleme — Gruppe „drucker“ ──
// Schlüssel = Problem-ID, Wert = 3 zusätzliche Beschreibungen in eigenen Worten.
// Bereiche: Drucker & Scannen · Hardware & Geräte (arbeitsplatz.ts / arbeitsplatz2.ts).

export const VARIANTEN_DRUCKER: Record<string, string[]> = {
  // ══ Drucker & Scannen ═══════════════════════════════════════════════════════
  'drucker-druckt-nicht': [
    'Ich klicke auf Drucken, aber am Gerät kommt einfach kein Blatt an.',
    'Mein Dokument steht seit einer halben Stunde in der Liste und rührt sich nicht.',
    'Seit heute Morgen kriege ich nichts mehr aufs Papier, die Aufträge stauen sich.',
  ],
  'drucker-verbinden': [
    'Ich bin neu hier und brauche den Kopierer im Büro auf meinem Laptop.',
    'Wie bekomme ich den Drucker auf dem Gang auf meinen Rechner?',
    'Bitte richtet mir das Gerät neben meinem Platz ein, ich finde es nicht in der Auswahl.',
  ],
  'drucker-fehlt-nach-umzug': [
    'Ich sitze jetzt in einem anderen Gebäude und mein Drucker von früher ist viel zu weit weg.',
    'Nach dem Büroumzug finde ich das Gerät auf unserer neuen Etage nicht.',
    'Seit dem Abteilungswechsel drucke ich immer noch am alten Standort.',
  ],
  'drucker-standard-wechselt': [
    'Jedes Mal ist ein anderer Drucker vorausgewählt, je nachdem, wo ich zuletzt gedruckt habe.',
    'Mein Hauptdrucker wird ständig durch den zuletzt benutzten ersetzt.',
    'Windows stellt mir dauernd eigenmächtig einen anderen Drucker als Vorgabe ein.',
  ],
  'drucker-speichern-unter-statt-druck': [
    'Wenn ich drucke, öffnet sich ein Fenster zum Ablegen einer Datei statt eines Ausdrucks.',
    'Der Drucker will mein Dokument als Datei abspeichern, statt es auszudrucken.',
    'Statt Papier bekomme ich nur ein Fenster, in dem ich einen Dateinamen eingeben soll.',
  ],
  'drucker-auftrag-nicht-loeschbar': [
    'Ich habe den Auftrag abgebrochen, aber er bleibt einfach in der Liste stehen.',
    'Ein Dokument hängt seit gestern in der Schlange und lässt sich nicht wegklicken.',
    'Beim Abbrechen passiert nichts, der Eintrag zeigt nur noch an, dass er entfernt wird.',
  ],
  'drucker-offline': [
    'Mein Drucker ist in Windows grau und dahinter steht, dass er nicht verbunden ist.',
    'Der Kopierer läuft, aber mein Laptop behauptet, er sei nicht erreichbar.',
    'Nach dem Aufklappen des Laptops zeigt der Drucker an, dass er getrennt ist.',
  ],
  'drucker-zeichensalat': [
    'Aus dem Drucker kommen Seiten voller seltsamer Symbole statt meines Textes.',
    'Der Drucker spuckt Blatt für Blatt wirre Buchstaben aus und hört nicht auf.',
    'Mein Ausdruck sieht aus wie Programmcode, lauter unverständliche Zeichen.',
  ],
  'drucker-scan-ordner': [
    'Ich scanne am Kopierer in meinen Ordner, aber das Gerät meldet einen Fehler beim Senden.',
    'Der Multifunktionsdrucker kann meine Scans nicht mehr auf dem Laufwerk ablegen.',
    'Beim Scannen auf die Freigabe steht am Display „Senden fehlgeschlagen“.',
  ],
  'drucker-scan-mail': [
    'Ich scanne an meine Adresse, aber im Postfach kommt nie etwas an.',
    'Die Mail vom Kopierer mit meinem Scan fehlt, obwohl das Gerät „gesendet“ anzeigt.',
    'Seit gestern bekomme ich keine gescannten Dokumente mehr per E-Mail.',
  ],
  'drucker-scanner-usb': [
    'Mein Dokumentenscanner am Platz wird vom Laptop nicht mehr gefunden.',
    'Die Scan-Software sagt, dass kein Gerät angeschlossen ist, obwohl das Kabel steckt.',
    'Seit ich ihn ans Dock gesteckt habe, erkennt der PC den Tischscanner nicht.',
  ],
  'drucker-treiber-nicht-verfuegbar': [
    'Unter meinem Drucker steht in Windows, dass die Software dafür fehlt.',
    'Ich kann den Drucker nicht mehr benutzen, Windows zeigt ihn mit einem Warnhinweis an.',
    'Der Drucker hat in der Liste ein Warnsymbol und seine Eigenschaften öffnen sich nicht.',
  ],
  'drucker-fehler-0x11b': [
    'Windows will beim Verbinden des Druckers plötzlich ein Administratorkennwort von mir.',
    'Seit dem Sicherheitsupdate scheitert das Einrichten des Netzwerkdruckers mit 11b.',
    'Beim Installieren des Druckers kommt eine Abfrage nach Adminrechten, die ich nicht habe.',
  ],
  'drucker-fehler-0x709': [
    'Ich will meinen Drucker als Vorgabe einstellen, aber Windows sagt, der Vorgang geht nicht.',
    'Beim Rechtsklick auf „Als Standard festlegen“ kommt eine Fehlermeldung mit 709.',
    'Mein Lieblingsdrucker lässt sich einfach nicht zum Hauptdrucker machen.',
  ],
  'drucker-entfernen': [
    'In meiner Liste ist noch der Drucker vom alten Büro, den will ich loswerden.',
    'Bitte nehmt den abgebauten Kopierer aus meiner Druckerauswahl raus.',
    'Wie werde ich einen Drucker los, den es gar nicht mehr gibt?',
  ],
  'drucker-doppelt': [
    'Ich habe den gleichen Drucker zweimal in der Auswahl und weiß nicht, welcher richtig ist.',
    'Mein Drucker taucht zweifach auf, einmal mit einem Zusatz hinten am Namen.',
    'In der Druckerliste stehen zwei identische Einträge für denselben Kopierer.',
  ],
  'drucker-langsam': [
    'Bis mein Ausdruck rauskommt, vergehen fünf Minuten.',
    'Ich drucke und kann in Ruhe Kaffee holen, bevor das Blatt erscheint.',
    'Der Drucker braucht ewig, besonders bei Zeichnungen und großen PDFs.',
  ],
  'drucker-spooler-absturz': [
    'Mein Druckdienst geht dauernd aus und dann sind alle Drucker verschwunden.',
    'Nach ein paar Minuten bricht die Warteschlange zusammen und ich muss neu starten.',
    'Windows meldet immer wieder, dass der Druckdienst unerwartet beendet wurde.',
  ],
  'drucker-nur-schwarzweiss': [
    'Mein Diagramm kommt nur in Grautönen aus dem Farbdrucker.',
    'Ich brauche den Ausdruck bunt, aber er kommt ohne Farbe heraus.',
    'Seit kurzem fehlt bei mir jede Farbe auf dem Papier.',
  ],
  'drucker-duplex': [
    'Ich möchte Vorder- und Rückseite bedrucken, aber jede Seite kommt auf ein eigenes Blatt.',
    'Die Option für doppelseitigen Druck ist bei mir verschwunden.',
    'Früher hat der Drucker auf beiden Seiten gedruckt, jetzt nur noch vorne.',
  ],
  'drucker-liste-leer': [
    'In der Druckerauswahl ist gar nichts mehr drin.',
    'Alle meine Drucker sind über Nacht verschwunden.',
    'Wenn ich drucken will, zeigt mir das Programm keinen einzigen Drucker an.',
  ],
  'drucker-zugriff-verweigert': [
    'Beim Verbinden des Druckers sagt Windows, ich habe keine Berechtigung.',
    'Ich darf den Drucker angeblich nicht benutzen, obwohl die Kollegen das können.',
    'Der Drucker lässt sich nicht hinzufügen, weil der Zugriff abgelehnt wird.',
  ],
  'drucker-pdf-adobe': [
    'Word-Dateien druckt er, aber sobald ich ein PDF drucke, passiert nichts.',
    'Acrobat bleibt stehen, sobald ich eine Zeichnung an den Drucker schicke.',
    'Das PDF vom Lieferanten will einfach nicht aus dem Drucker kommen.',
  ],
  'drucker-sap-druck': [
    'Mein Lieferschein aus SAP kommt nirgends heraus.',
    'Wenn ich in SAP auf Drucken gehe, landet nichts am Drucker.',
    'Aus dem SAP-System kann ich keine Belege mehr ausdrucken.',
  ],
  'drucker-etikettendrucker': [
    'Unser Aufkleberdrucker im Versand tut gar nichts mehr.',
    'Der Etikettendrucker im Lager reagiert nicht, wenn ich Aufkleber ausgebe.',
    'Die Versandaufkleber kommen nicht mehr aus dem Labeldrucker.',
  ],
  'drucker-homeoffice': [
    'Von zu Hause aus kann ich nicht auf den Drucker im Büro drucken.',
    'Im Home Office bleiben meine Ausdrucke für die Firma einfach hängen.',
    'Ich will von daheim etwas ins Büro schicken, damit es ein Kollege abholt, aber es geht nicht.',
  ],
  'drucker-testseite': [
    'Kann man mal prüfen, ob mein Drucker überhaupt etwas annimmt?',
    'Ich möchte nur kurz ausprobieren, ob ein Ausdruck vom PC am Gerät ankommt.',
    'Bitte schickt mal eine Probeseite an meinen Drucker.',
  ],
  'drucker-druckt-mehrfach': [
    'Mein Dokument kommt dreimal hintereinander aus dem Drucker.',
    'Ich habe einmal gedruckt und es hört nicht auf, Seiten auszugeben.',
    'Nach dem Neustart druckt der Drucker meine Datei schon wieder.',
  ],
  'drucker-druckdialog-haengt': [
    'Sobald ich Strg+P drücke, friert Excel für Minuten ein.',
    'Das Druckfenster öffnet sich nicht und das Programm reagiert nicht mehr.',
    'Beim Klick auf Drucken hängt Word und zeigt „Keine Rückmeldung“.',
  ],
  'drucker-scan-ordner-zugriff': [
    'Der Scan war erfolgreich, aber ich komme an den Ordner mit meinen Scans nicht ran.',
    'Das Laufwerk mit meinen gescannten Dateien hat ein rotes Kreuz.',
    'Ich finde meine eingescannten Dokumente nicht, der Ordner ist nicht erreichbar.',
  ],
  'drucker-fehlerzustand': [
    'Der Drucker blinkt orange und im Display steht eine Störung.',
    'Mein Drucker zeigt an, dass das Papier klemmt, aber ich finde nichts.',
    'Windows sagt bei meinem Drucker „Fehler“ und es kommt nichts mehr raus.',
  ],
  'drucker-nach-update': [
    'Seit dem Update heute Nacht druckt bei mir gar nichts mehr.',
    'Nach dem Patchday kann ich keine Dokumente mehr ausdrucken.',
    'Windows hat Updates installiert und jetzt streikt mein Drucker.',
  ],
  'drucker-pdf-drucker-fehlt': [
    'Ich will ein Dokument als PDF speichern, aber der PDF-Drucker ist nicht mehr da.',
    'In der Druckerauswahl fehlt die Möglichkeit, eine PDF-Datei zu erzeugen.',
    'Wo ist der Microsoft-PDF-Drucker hin? Den habe ich immer benutzt.',
  ],
  'drucker-offline-verwenden': [
    'In der Warteschlange steht, dass das Drucken angehalten ist.',
    'Ich habe aus Versehen auf Pause geklickt und jetzt druckt nichts mehr.',
    'Meine Aufträge sammeln sich, weil der Drucker auf offline gestellt ist.',
  ],
  'drucker-papierformat-letter': [
    'Am Kopierer steht, ich soll Papier im amerikanischen Format einlegen.',
    'Der Drucker wartet auf ein anderes Papier und druckt nicht weiter.',
    'Beim Drucken der englischen Vorlage verlangt das Gerät ein fremdes Papierformat.',
  ],
  'drucker-welcher-drucker': [
    'Wie heißt eigentlich der Drucker, der neben meinem Büro steht?',
    'Ich weiß nicht, welchen Drucker ich in der Liste auswählen muss.',
    'Welcher der vielen PMD-Einträge ist der Drucker in unserer Abteilung?',
  ],
  'drucker-scan-programm-wia': [
    'Die Scan-App sagt, es ist kein Scanner verbunden.',
    'Windows-Fax und -Scan findet meinen Scanner nicht mehr.',
    'Beim Scannen kommt die Meldung, dass kein Gerät gefunden wurde.',
  ],
  'drucker-a3-format': [
    'Ich muss eine große Zeichnung drucken, aber das große Papierformat lässt sich nicht auswählen.',
    'Mein großer Plan kommt immer verkleinert auf normalem Papier raus.',
    'Das große Papierfach wird im Druckdialog gar nicht angeboten.',
  ],
  'drucker-falsches-papierfach': [
    'Der Drucker nimmt das Firmenbriefpapier, obwohl ich normales Papier will.',
    'Meine Ausdrucke kommen auf dem farbigen Papier aus dem zweiten Fach.',
    'Der Drucker wartet, dass ich Papier von Hand einlege.',
  ],
  'drucker-leere-seiten': [
    'Es kommen nur weiße Blätter aus dem Drucker.',
    'Der Ausdruck ist komplett leer, obwohl das Dokument Text hat.',
    'Das Papier läuft durch, aber es steht nichts drauf.',
  ],
  'drucker-auftrag-verschwindet': [
    'Der Auftrag ist sofort aus der Liste weg, aber am Drucker kommt nichts an.',
    'Windows schickt meinen Ausdruck ab, doch er landet nirgends.',
    'Mein Druck ist verschwunden – kein Fehler, kein Papier.',
  ],
  'drucker-falscher-drucker-programm': [
    'Mein Excel-Ausdruck kommt im anderen Stockwerk raus.',
    'Das Programm druckt immer noch auf den Drucker an meinem alten Platz.',
    'Ich suche meinen Ausdruck – er kam an einem ganz anderen Gerät heraus.',
  ],
  'drucker-tonerwarnung-bleibt': [
    'Ich habe die Kartusche getauscht, aber der Drucker meldet weiter, dass sie fast leer ist.',
    'Trotz frischer Kartusche kommt immer noch die Warnung.',
    'Der Drucker erkennt die neue Tonerkartusche nicht.',
  ],
  'drucker-druckbild-streifen': [
    'Auf meinen Ausdrucken sind graue Striche.',
    'Die Schrift ist verwischt und es gibt dunkle Flecken.',
    'Der Ausdruck ist viel heller als sonst und hat Streifen.',
  ],
  'drucker-heften-lochen-fehlt': [
    'Ich möchte meine Unterlagen gleich getackert ausdrucken, finde die Option aber nicht.',
    'Der Kopierer kann Löcher stanzen, doch im Druckmenü steht davon nichts.',
    'Die Broschürenfunktion ist bei mir nicht auswählbar.',
  ],
  'drucker-fremder-drucker-wsd': [
    'Plötzlich habe ich einen Drucker in der Liste, den ich nie eingerichtet habe.',
    'Seit dem Home Office steht der Drucker meiner Nachbarn bei mir drin.',
    'Ein unbekanntes Gerät hat sich selbst als Drucker installiert.',
  ],
  'drucker-seal-wizard-fehlt': [
    'Ich finde das SEAL-Programm zum Druckerhinzufügen nicht auf meinem Rechner.',
    'Der Assistent für die PMD-Drucker startet bei mir nicht.',
    'Auf meinem neuen Laptop fehlt das Programm, mit dem man Firmendrucker verbindet.',
  ],
  'drucker-nach-geraetetausch': [
    'Unser Kopierer wurde gegen ein neues Modell getauscht und seitdem druckt er bei mir nicht.',
    'Der neue Drucker hat den alten Namen, aber meine Ausdrucke kommen nicht an.',
    'Seit der Drucker ausgewechselt wurde, kommen nur Fehler.',
  ],
  'drucker-etiketten-verrutscht': [
    'Der Strichcode landet halb auf dem nächsten Aufkleber.',
    'Die Aufkleber sind verschoben, zwischen zwei bedruckten bleibt einer leer.',
    'Der Code auf den Etiketten ist am Rand angeschnitten und lässt sich nicht scannen.',
  ],
  'drucker-ausdruck-abgeschnitten': [
    'Am Rand fehlt bei meinem Ausdruck ein Stück Text.',
    'Die Tabelle passt nicht aufs Blatt, die rechte Spalte fehlt.',
    'Unten fehlt auf jeder Seite die letzte Zeile.',
  ],
  'drucker-falsche-schrift': [
    'Auf dem Ausdruck sind die Umlaute durch kleine Vierecke ersetzt.',
    'Der Drucker nimmt eine ganz andere Schriftart als auf dem Bildschirm.',
    'Statt ä, ö und ü stehen auf dem Papier Fragezeichen.',
  ],
  'drucker-scan-adressbuch': [
    'Am Kopierer finde ich mich nicht in der Empfängerliste.',
    'Ich bin neu und kann am Scanner meine Mailadresse nicht auswählen.',
    'Mein Name fehlt in der Auswahl am Multifunktionsgerät.',
  ],
  'drucker-nicht-gefunden': [
    'Beim Verbinden sagt der Assistent, dass es diesen Drucker nicht gibt.',
    'Ich tippe die PMD-Nummer ein und Windows kennt sie nicht.',
    'Der Druckername vom Etikett wird beim Hinzufügen nicht gefunden.',
  ],

  // ══ Hardware & Geräte ═══════════════════════════════════════════════════════
  'hardware-maus-tastatur-faellt-aus': [
    'Meine Maus bleibt alle paar Minuten kurz stehen und macht dann weiter.',
    'Die Tastatur am Dock ist zwischendurch für ein paar Sekunden ohne Funktion.',
    'Immer wieder setzen Maus und Tastatur kurz aus, dann geht es wieder.',
  ],
  'hardware-usb-nicht-erkannt': [
    'Windows meldet beim Einstecken, dass das Gerät nicht richtig funktioniert hat.',
    'Mein USB-Gerät taucht als unbekannter Eintrag im Geräte-Manager auf.',
    'Beim Anstecken kommt eine Meldung, dass das zuletzt angeschlossene Gerät eine Fehlfunktion hatte.',
  ],
  'hardware-bluetooth-koppelt-nicht': [
    'Meine neue Funkmaus taucht beim „Gerät hinzufügen“ gar nicht auf.',
    'Ich bekomme meine kabellose Tastatur nicht mit dem Laptop verbunden.',
    'Beim Verbinden dreht sich nur der Kreis und dann bricht es ab.',
  ],
  'hardware-bluetooth-fehlt': [
    'In den Einstellungen gibt es bei mir gar keinen Bluetooth-Eintrag mehr.',
    'Das Bluetooth-Symbol ist weg und ich kann nichts verbinden.',
    'Mein Laptop scheint überhaupt keine Funkverbindung für Headset und Maus mehr zu haben.',
  ],
  'hardware-dock-nicht-erkannt': [
    'Ich stecke den Laptop an die Station, aber es passiert gar nichts.',
    'Am Dock gehen weder Monitore noch Maus, der Laptop merkt nicht, dass er angeschlossen ist.',
    'Die Dockingstation reagiert überhaupt nicht auf meinen Laptop.',
  ],
  'hardware-dock-usb-tot': [
    'Am Dock kommt das Bild, aber die Maus dort bewegt sich nicht.',
    'Die USB-Buchsen an der Station funktionieren nicht mehr.',
    'Tastatur und Maus gehen nur, wenn ich sie direkt am Laptop anstecke.',
  ],
  'hardware-dock-lan': [
    'Am Schreibtisch habe ich über das Kabel an der Station kein Netz.',
    'Der Netzwerkstecker am Dock bringt keine Verbindung, nur das WLAN geht.',
    'Über die Dockingstation komme ich nicht ins Firmennetz.',
  ],
  'hardware-touchpad': [
    'Ich kann den Mauszeiger mit dem Finger nicht mehr bewegen.',
    'Die Fläche unter der Tastatur tut gar nichts mehr, wenn ich darüber wische.',
    'Unterwegs ohne Maus bin ich aufgeschmissen, weil der Zeiger nicht reagiert.',
  ],
  'hardware-fingerabdruck': [
    'Ich lege den Finger auf den Sensor, aber Windows erkennt mich nicht mehr.',
    'Die Anmeldung per Finger klappt seit dem Update nicht.',
    'Windows sagt, der Leser für den Finger sei nicht verfügbar.',
  ],
  'hardware-gelbes-ausrufezeichen': [
    'Im Geräte-Manager hat ein Eintrag ein Warndreieck.',
    'Ein Gerät ist als unbekannt aufgeführt und hat keine passende Software.',
    'Nach der Neuinstallation fehlt für ein paar Geräte die Software.',
  ],
  'hardware-usb-stick': [
    'Ich stecke meinen Stick ein, aber im Explorer erscheint kein Laufwerk.',
    'Meine externe Platte wird nicht angezeigt, obwohl sie leuchtet.',
    'Der Speicherstick taucht nicht unter „Dieser PC“ auf.',
  ],
  'hardware-laptop-heiss-luefter': [
    'Mein Notebook wird so warm, dass man es kaum auf dem Schoß halten kann.',
    'Der Ventilator rauscht die ganze Zeit wie ein Föhn.',
    'Der Laptop pustet ständig laut, auch wenn ich nur Mails lese.',
  ],
  'hardware-bluescreen': [
    'Mein Rechner ist mit einem blauen Fehlerbildschirm abgestürzt.',
    'Der PC startet einfach neu, mitten in der Arbeit.',
    'Ich bekomme immer wieder einen blauen Bildschirm mit einem traurigen Smiley.',
  ],
  'hardware-ssd-fehler': [
    'Windows warnt, dass mit dem Laufwerk etwas nicht stimmt.',
    'Dateien lassen sich nicht mehr öffnen und es kommen Fehler beim Lesen.',
    'Ich habe Angst, dass mein Speicher im Laptop gleich kaputtgeht.',
  ],
  'hardware-kartenleser': [
    'Ich stecke die Karte aus der Kamera ein, aber nichts passiert.',
    'Der Schlitz für die Speicherkarte am Laptop liest nichts.',
    'Die Fotos von der kleinen Kamerakarte bekomme ich nicht auf den PC.',
  ],
  'hardware-desksharing-dock': [
    'An einem freien Schreibtisch funktioniert die Station nicht mit meinem Laptop.',
    'Im Flex-Büro gehen Monitor und Tastatur am fremden Platz nicht.',
    'Nur an meinem eigenen Platz geht alles, an anderen Tischen nicht.',
  ],
  'hardware-thunderbolt-genehmigung': [
    'Beim Anstecken der Station kommt eine Meldung, dass ich das Gerät zulassen muss.',
    'Das neue Dock wird gesperrt, bis jemand es freigibt.',
    'Windows fragt, ob ich dem angeschlossenen Gerät vertraue, und dann geht nichts.',
  ],
  'hardware-touchscreen': [
    'Wenn ich auf den Bildschirm tippe, reagiert nichts.',
    'Der Eingabestift schreibt nicht mehr auf dem Display.',
    'Die Bedienung mit dem Finger am Laptop-Bildschirm geht nicht mehr.',
  ],
  'hardware-funkmaus-ruckelt': [
    'Meine kabellose Maus hakt und der Zeiger hüpft über den Bildschirm.',
    'Die Maus mit dem kleinen USB-Stecker reagiert nur stockend.',
    'Der Mauszeiger bleibt hängen und macht dann einen Satz nach vorne.',
  ],
  'hardware-bios-firmware': [
    'Kann man bei meinem Laptop die Systemsoftware auf den neuesten Stand bringen?',
    'HP empfiehlt eine neue Gerätesoftware für meinen Laptop, wie geht das?',
    'Die Grundsoftware meines Laptops ist wohl veraltet, bitte aktualisieren.',
  ],
  'hardware-barcode-scanner': [
    'Der Zebra-Handscanner piept, aber im Feld kommt nichts an.',
    'Beim Einlesen des Strichcodes erscheinen falsche Buchstaben.',
    'Die Pistole im Lager schreibt komische Zeichen statt der Artikelnummer.',
  ],
  'hardware-usb-c-adapter': [
    'Mein kleiner Reiseadapter für HDMI und Netzwerk tut nichts.',
    'Über den Typ-C-Verteiler bekomme ich kein Bild auf den Beamer.',
    'Der Mehrfachadapter am Laptop wird nicht erkannt.',
  ],
  'hardware-fn-tasten': [
    'Die Tasten für Lautstärke und Helligkeit oben auf der Tastatur machen nichts.',
    'Mit der Taste zum Stummschalten passiert nichts mehr.',
    'Statt der Sonderfunktion kommt immer F1 bis F12.',
  ],
  'hardware-langsam-am-dock': [
    'Sobald ich angedockt bin, wird der Laptop total zäh.',
    'Unterwegs ist der Rechner schnell, am Schreibtisch kriecht er.',
    'Am Dock braucht jedes Programm ewig, ohne Dock nicht.',
  ],
  'hardware-tastatur-verzoegert': [
    'Beim Tippen fehlen Buchstaben, die Tastatur kommt nicht hinterher.',
    'Ich muss jede Taste lange drücken, damit sie zählt.',
    'Die Buchstaben erscheinen erst eine Sekunde nach dem Tippen.',
  ],
  'hardware-bluetooth-trennt': [
    'Meine Funktastatur verliert dauernd die Verbindung und verbindet sich neu.',
    'Die kabellose Maus fällt alle paar Minuten aus und ist dann wieder da.',
    'Die Verbindung zur Maus über Funk reißt ständig ab.',
  ],
  'hardware-maus-doppelklick': [
    'Ein Klick öffnet bei mir sofort die Datei, als hätte ich zweimal geklickt.',
    'Beim Verschieben lässt die Maus die Datei plötzlich fallen.',
    'Die linke Taste klickt manchmal doppelt, obwohl ich nur einmal drücke.',
  ],
  'hardware-zeiger-springt-beim-tippen': [
    'Während ich schreibe, landet der Cursor plötzlich woanders im Text.',
    'Beim Tippen wird ständig Text markiert und überschrieben.',
    'Mein Handgelenk berührt die Fläche unter der Tastatur und der Zeiger hüpft.',
  ],
  'hardware-usb-ton-staendig': [
    'Alle paar Sekunden höre ich das Geräusch für An- und Abstecken.',
    'Der PC macht ständig „ding-dong“, obwohl ich nichts einstecke.',
    'Dauernd ertönt der Ton, dass ein Gerät verbunden oder getrennt wurde.',
  ],
  'hardware-externe-festplatte-trennt': [
    'Beim Kopieren großer Ordner auf die USB-Platte bricht es immer ab.',
    'Die externe Platte verschwindet mitten im Kopieren aus dem Explorer.',
    'Das Sichern auf meine USB-Platte dauert ewig und bricht mit Fehler ab.',
  ],
  'hardware-smartcard-leser': [
    'Mein Kartenleser für die Signaturkarte wird nicht gefunden.',
    'Das Programm sagt, es findet keine Karte, obwohl sie im Leser steckt.',
    'Das Lesegerät für meine Karte leuchtet, aber der PC sieht es nicht.',
  ],
  'hardware-barcode-com-port': [
    'Unser Lagerprogramm sagt, der Scanner an COM3 sei nicht verbunden.',
    'Nach dem Umstecken findet die Software den Handscanner nicht mehr.',
    'Der Scanner läuft über einen seriellen Anschluss, und das Programm findet ihn nicht.',
  ],
  'hardware-barcode-kein-enter': [
    'Nach dem Scannen muss ich jedes Mal selbst die Eingabetaste drücken.',
    'Der Scanner schreibt die Nummer, springt aber nicht in die nächste Zeile.',
    'Beim neuen Handscanner fehlt der Zeilenumbruch nach dem Code.',
  ],
  'hardware-touch-falsche-stelle': [
    'Wenn ich auf den Hallenbildschirm tippe, klickt es an einer anderen Stelle.',
    'Die Berührung auf dem einen Monitor bewegt den Zeiger auf dem anderen.',
    'Der Touchmonitor trifft immer ein Stück daneben.',
  ],
  'hardware-bluetooth-geraet-entfernen': [
    'Ich bekomme das alte Headset nicht aus der Liste der Funkgeräte.',
    'Beim Entfernen des Geräts kommt nur ein Fehler und es bleibt stehen.',
    'Die alte Maus steht noch in den verbundenen Geräten und lässt sich nicht löschen.',
  ],
  'hardware-presenter': [
    'Mit dem Klicker kann ich in PowerPoint nicht weiterschalten.',
    'Die Fernbedienung für Präsentationen reagiert nicht.',
    'Der rote Punkt leuchtet, aber die Folien bleiben stehen.',
  ],
  'hardware-usb-stromstoss': [
    'Windows meldet, dass ein USB-Anschluss zu viel Strom gezogen hat.',
    'Beim Anschließen der Festplatte kommt eine Warnung zum USB-Anschluss.',
    'Ein Fenster sagt, der USB-Port wurde zum Schutz abgeschaltet.',
  ],
  'hardware-startet-nicht-blinkcode': [
    'Mein Laptop geht nicht an, nur die Großschreibtaste blinkt.',
    'Beim Einschalten bleibt der Bildschirm schwarz und es kommen Töne.',
    'Die kleine Lampe an der Tastatur blinkt in einem Muster, sonst passiert nichts.',
  ],
  'hardware-numlock-aus': [
    'Beim Hochfahren muss ich jedes Mal erst die Num-Taste drücken.',
    'Der Zahlenbereich rechts schreibt nach dem Start keine Ziffern.',
    'Morgens funktionieren die Zahlen rechts auf der Tastatur nicht.',
  ],
  'hardware-laptop-tastatur-tot': [
    'Die Tastatur im Notebook selbst reagiert nicht, eine USB-Tastatur schon.',
    'Seit mir Kaffee über den Laptop gelaufen ist, gehen manche Tasten nicht.',
    'Die eingebauten Tasten tun nichts mehr, nur die externe Tastatur geht.',
  ],
}
