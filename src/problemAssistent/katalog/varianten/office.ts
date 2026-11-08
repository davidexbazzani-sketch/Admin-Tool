// ── Weitere Beschreibungen (so sagen es Anwender) für BESTEHENDE Probleme — Gruppe „office“ ──
// Schlüssel = Problem-ID, Wert = 3 zusätzliche Beschreibungen in eigenen Worten.

export const VARIANTEN_OFFICE: Record<string, string[]> = {
  // ── katalog/office.ts ──
  'office-excel-absturz-oeffnen': [
    'Sobald ich meine Tabelle aufmache, ist Excel einfach weg – ohne Meldung.',
    'Excel geht kurz auf und verschwindet dann sofort wieder vom Bildschirm.',
    'Jedes Mal wenn ich eine Mappe doppelklicke, kommt nur „Microsoft Excel funktioniert nicht mehr“.',
  ],
  'office-word-startet-nicht': [
    'Ich klicke auf das Word-Symbol und es passiert gar nichts.',
    'Word blitzt kurz auf und ist dann wieder zu, ich komme nicht an meine Briefe.',
    'Seit heute früh lässt sich das Textprogramm nicht mehr öffnen.',
  ],
  'office-powerpoint-absturz': [
    'Meine Folien gehen auf und nach ein paar Sekunden schmiert das Programm ab.',
    'Beim Einfügen eines Bildes in die Präsentation schließt sich PowerPoint komplett.',
    'Kurz vor dem Termin beim Kunden stürzt mir die Präsentation ständig weg.',
  ],
  'office-programm-haengt': [
    'Excel ist total eingefroren, ich kann nichts mehr anklicken und oben steht nur noch der Programmname.',
    'Word reagiert seit zehn Minuten nicht, das Fenster wird weiß.',
    'Das Office-Fenster hängt fest und lässt sich nicht mal mehr schließen.',
  ],
  'office-startet-gar-nicht': [
    'Weder Word noch Excel noch Outlook gehen auf – das ganze Paket ist tot.',
    'Egal welches Microsoft-Programm ich starte, es kommt nur eine Fehlermeldung.',
    'Nach dem Neustart heute funktioniert überhaupt nichts mehr von Microsoft 365.',
  ],
  'office-update-haengt': [
    'Die Aktualisierung von Word und Excel steht seit Stunden bei 40 Prozent.',
    'Seit dem Mittag sehe ich das Fenster „Wir installieren Updates“ und nichts bewegt sich.',
    'Office lädt seit gestern Updates herunter und wird nie fertig.',
  ],
  'office-veraltet': [
    'Bei meiner Kollegin gibt es in Excel neue Knöpfe, die ich gar nicht habe.',
    'Im Kurs wurde eine Funktion gezeigt, die es in meinem Word nicht gibt.',
    'Mein Office scheint uralt zu sein, Copilot und Co. tauchen bei mir nie auf.',
  ],
  'office-nicht-lizenziert': [
    'Oben in Word ist eine rote Leiste und ich kann nur noch lesen, nicht mehr schreiben.',
    'Excel sagt, das Produkt sei deaktiviert und die meisten Funktionen sind gesperrt.',
    'Die Titelleiste zeigt „Nicht lizenziertes Produkt“ und Bearbeiten geht nicht mehr.',
  ],
  'office-anmeldung-wiederholt': [
    'Alle paar Minuten will Word, dass ich mein Passwort noch mal eintippe.',
    'Ich melde mich in Excel an, und eine Stunde später fragt es schon wieder.',
    'Ständig ploppt so ein Microsoft-Fenster auf, das meine Zugangsdaten haben will.',
  ],
  'office-falsches-konto': [
    'In Word steht oben rechts meine private Hotmail-Adresse statt der Firmenadresse.',
    'Office ist mit dem Konto meines Vorgängers angemeldet.',
    'Beim Speichern landet alles in meinem privaten OneDrive, weil das falsche Konto drin ist.',
  ],
  'office-anmeldung-fehlercode': [
    'Bei der Anmeldung in Word kommt nur „Etwas ist schiefgelaufen“ mit einem langen Code.',
    'Office lässt mich nicht einloggen, es erscheint immer eine Meldung mit CAA und Zahlen.',
    'Ich kann mich in Excel nicht anmelden, das Fenster bricht mit einem Fehler ab.',
  ],
  'office-addin-fehlt': [
    'Der enaio-Reiter in Word ist einfach verschwunden.',
    'Mir fehlt in Excel die Registerkarte von SAP Analysis, gestern war sie noch da.',
    'Das Zusatzprogramm, mit dem ich immer ablege, taucht im Menü nicht mehr auf.',
  ],
  'office-addin-abschalten': [
    'Excel stürzt nur ab, wenn das Zusatzmodul geladen ist – ohne läuft es.',
    'Im abgesicherten Modus funktioniert Word, normal gestartet schmiert es ab.',
    'Ein Plug-in reißt mir dauernd das Programm mit runter, kann man das abschalten?',
  ],
  'office-makros-blockiert': [
    'Oben in der Excel-Datei aus der Mail kommt ein roter Balken mit „Sicherheitsrisiko“.',
    'Die Makros in der Datei vom Lieferanten lassen sich nicht mehr aktivieren.',
    'Der Knopf „Inhalt aktivieren“ fehlt, stattdessen steht da, dass Makros gesperrt sind.',
  ],
  'office-geschuetzte-ansicht-leer': [
    'Der Anhang geht auf, aber das Fenster bleibt komplett grau.',
    'Dateien aus dem Internet zeigen nur einen leeren weißen Bereich mit gelber Leiste.',
    'In der Vorschau-Ansicht für Anhänge sieht man nichts vom Inhalt.',
  ],
  'office-nur-schreibgeschuetzt': [
    'Jede Datei öffnet bei mir mit dem Hinweis, dass ich sie nur lesen darf.',
    'Ich kann meine Änderungen nicht speichern, Word will immer eine Kopie anlegen.',
    'Neben dem Dateinamen steht ständig „Schreibgeschützt“, obwohl das meine eigene Datei ist.',
  ],
  'office-datei-gesperrt-benutzer': [
    'Excel sagt, die Liste sei von Herrn Meier gesperrt, aber der ist im Urlaub.',
    'Ich kann die gemeinsame Tabelle nur schreibgeschützt öffnen, weil sie angeblich jemand anders offen hat.',
    'Die Meldung „Datei wird verwendet“ kommt bei der Schichtplanung jeden Morgen.',
  ],
  'office-speichern-dauert': [
    'Wenn ich auf Speichern klicke, dreht sich der Kreis eine Minute lang.',
    'Unten steht ewig „Wird gespeichert…“ und ich kann nicht weiterarbeiten.',
    'Bei jedem Strg+S friert Excel kurz ein, das war früher nicht so.',
  ],
  'office-speichern-netzlaufwerk-fehler': [
    'Mein Dokument lässt sich nicht im Abteilungsordner ablegen, es kommt ein Fehler.',
    'Beim Speichern auf S: heißt es, der Pfad sei nicht verfügbar.',
    'Excel kann die Datei nicht zurück auf den Server schreiben, angeblich keine Verbindung.',
  ],
  'office-ungespeichert-wiederherstellen': [
    'Der Strom war weg und mein Bericht der letzten zwei Stunden ist nicht gesichert.',
    'Ich habe aus Versehen auf „Nicht speichern“ geklickt, ist die Arbeit jetzt verloren?',
    'Nach dem Absturz hat Word mir keine Wiederherstellung angeboten.',
  ],
  'office-sap-export-csv-spalten': [
    'Der Export aus SAP landet in Excel komplett in Spalte A.',
    'Statt ä und ö stehen in der exportierten Liste nur komische Zeichen.',
    'Die Werte aus der SAP-Liste sind durch Semikolons getrennt, aber nicht in Spalten aufgeteilt.',
  ],
  'office-sap-export-excel-leer': [
    'Wenn ich in SAP auf Tabellenkalkulation klicke, geht Excel auf, aber ohne Daten.',
    'Der Export aus der ALV-Liste startet nicht, Excel bleibt grau.',
    'Aus SAP nach Excel exportieren macht gar nichts mehr.',
  ],
  'office-excel-langsam': [
    'Bei unserer großen Kalkulation braucht jede Eingabe mehrere Sekunden.',
    'Unten steht ständig „Berechnen (4 Prozessoren)“ und Excel kriecht nur.',
    'Die Planungsdatei mit den vielen Formeln ist kaum noch bedienbar.',
  ],
  'office-word-tippen-verzoegert': [
    'Die Buchstaben erscheinen erst eine halbe Sekunde nach dem Tippen.',
    'Beim Scrollen durch mein Dokument ruckelt Word richtig stark.',
    'Der Cursor hinkt beim Schreiben immer hinterher.',
  ],
  'office-powerpoint-praesentation-schwarz': [
    'Ich drücke F5 und auf dem Beamer ist nur ein schwarzes Bild.',
    'Beim Präsentieren sehe ich auf dem Laptop meine Notizen, aber die Leinwand bleibt dunkel.',
    'Im Besprechungsraum wird die Leinwand schwarz, sobald die Bildschirmpräsentation startet.',
  ],
  'office-powerpoint-video-ton': [
    'Das Video in meiner Präsentation bleibt schwarz und spielt nicht los.',
    'Der Film auf Folie 4 läuft, aber man hört nichts.',
    'Beim Klick auf das eingebaute Video passiert gar nichts.',
  ],
  'office-drucken-haengt': [
    'Wenn ich in Excel auf Drucken gehe, friert alles für eine Minute ein.',
    'Die Druckvorschau in Word lädt und lädt und lädt.',
    'Beim Ausdrucken einer Tabelle hängt sich das ganze Programm auf.',
  ],
  'office-oeffnen-netzlaufwerk-langsam': [
    'Eine Datei vom Abteilungslaufwerk zu öffnen dauert fast eine Minute.',
    'Lokal geht alles flott, nur Dateien vom Server laden ewig.',
    'Beim Doppelklick auf Dokumente im S-Laufwerk passiert erst mal lange nichts.',
  ],
  'office-dateizuordnung-verloren': [
    'Meine Excel-Dateien haben auf einmal ein weißes Blatt als Symbol.',
    'Doppelklick auf ein Word-Dokument fragt mich, mit welcher App ich es öffnen will.',
    'Die .xlsx-Dateien gehen plötzlich im Editor auf statt in Excel.',
  ],
  'office-fenster-ausserhalb': [
    'Excel ist unten in der Taskleiste, aber auf dem Bildschirm sehe ich kein Fenster.',
    'Seit ich ohne Dockingstation arbeite, öffnet sich Word irgendwo im Nichts.',
    'Das Programm läuft, aber das Fenster ist irgendwo neben dem Monitor verschwunden.',
  ],
  'office-excel-doppelklick-leer': [
    'Ich klicke doppelt auf die Datei, Excel geht auf, aber zeigt keine Tabelle.',
    'Es öffnet sich nur ein graues Excel ohne Inhalt, erst über Datei → Öffnen geht es.',
    'Die Mappe aus dem Explorer lädt nicht, Excel bleibt leer.',
  ],
  'office-excel-kopieren-zwischen-dateien': [
    'Wenn ich von einer Mappe in die andere kopiere, kommen nur die Zahlen ohne Formeln an.',
    'Beim Einfügen in die zweite Excel-Datei wird ein Bild daraus statt Zellen.',
    'Inhalte einfügen bietet mir nur noch Text und Bild an, keine Formate.',
  ],
  'office-onenote-sync': [
    'Am Notizbuch ist ein gelbes Dreieck und die Kollegen sehen meine Notizen nicht.',
    'OneNote sagt, es könne nicht mit dem Server abgleichen.',
    'Meine Änderungen in OneNote kommen auf dem Handy nicht an.',
  ],
  'office-rechtschreibung-falsche-sprache': [
    'Word unterkringelt jedes zweite deutsche Wort rot, als wäre es Englisch.',
    'Tippfehler werden bei mir gar nicht mehr angestrichen.',
    'Die Prüfung schlägt mir englische Wörter vor, obwohl ich auf Deutsch schreibe.',
  ],
  'office-oberflaeche-englisch': [
    'Alle Menüs in Word heißen auf einmal File, Home und Insert.',
    'Seit dem Update spricht mein Excel nur noch Englisch.',
    'Ich finde mich nicht mehr zurecht, das ganze Office ist auf Englisch umgestellt.',
  ],
  'office-vorschau-explorer': [
    'Im Explorer zeigt das Vorschaufenster bei Word-Dateien nur „Keine Vorschau verfügbar“.',
    'Früher konnte ich Excel-Dateien rechts im Ordner kurz ansehen, jetzt kommt ein Fehler.',
    'Die Dokumentvorschau beim Anklicken einer Datei funktioniert nicht mehr.',
  ],
  'office-links-einschraenkungen': [
    'Klicke ich in Excel auf eine Internetadresse, kommt eine Meldung über Beschränkungen.',
    'Hyperlinks in meinen Word-Dokumenten öffnen den Browser nicht mehr.',
    'Bei jedem Link in einer Office-Datei heißt es, der Vorgang wurde abgebrochen.',
  ],
  'office-vorlagen-fehlen': [
    'Unter Datei → Neu finde ich unseren SKF-Briefbogen nicht mehr.',
    'Die PowerPoint-Vorlage mit unserem Logo ist bei mir nicht auswählbar.',
    'Bei den Kollegen gibt es die Firmenvorlagen, bei mir ist die Liste leer.',
  ],
  'office-word-formatierung-normal-dotm': [
    'Jedes neue Word-Dokument startet mit einer komischen Schrift und doppeltem Zeilenabstand.',
    'Ich muss bei jedem leeren Dokument erst die Formatierung richtig stellen.',
    'Die Grundeinstellung von Word hat sich verstellt und ich bekomme sie nicht zurück.',
  ],
  'office-excel-startmeldung': [
    'Jedes Mal wenn Excel startet, geht automatisch noch eine zweite Datei mit auf.',
    'Beim Start von Excel kommt immer eine Fehlermeldung, die ich wegklicken muss.',
    'Excel öffnet beim Hochfahren eine alte Makromappe, die ich gar nicht brauche.',
  ],
  'office-nicht-genug-arbeitsspeicher': [
    'Excel sagt beim Kopieren, die Ressourcen reichen nicht aus.',
    'Bei der großen SAP-Liste bricht Excel mit einer Meldung über zu wenig Speicher ab.',
    'Der Vorgang kann nicht abgeschlossen werden, steht da, weil der Speicher nicht reicht.',
  ],
  'office-autosave-grau': [
    'Der Schalter oben links für automatisches Speichern lässt sich nicht umlegen.',
    'Bei mir ist das automatische Speichern immer aus und grau.',
    'Ich möchte, dass Word von alleine sichert, aber der Knopf reagiert nicht.',
  ],
  'office-excel-formeln-rechnen-nicht': [
    'Wenn ich eine Zahl ändere, bleibt das Ergebnis der Formel einfach gleich.',
    'Excel aktualisiert die Summen erst, wenn ich F9 drücke.',
    'Die Werte in meiner Tabelle stimmen nicht, weil Excel nicht neu rechnet.',
  ],
  'office-excel-verknuepfungen': [
    'Meine Auswertung holt sich keine Daten mehr aus der anderen Excel-Datei.',
    'Beim Öffnen kommt „Verknüpfungen konnten nicht aktualisiert werden“.',
    'Die Bezüge auf die Quelldatei zeigen nur noch #BEZUG!.',
  ],
  'office-pdf-export': [
    'Wenn ich das Dokument als PDF exportieren will, kommt ein Fehler.',
    'Speichern unter PDF bricht in Excel einfach ab.',
    'Aus Word kann ich keine PDF mehr erstellen, es entsteht keine Datei.',
  ],
  'office-vertraulichkeit-keine-berechtigung': [
    'Ein verschlüsseltes Dokument vom Kollegen lässt sich bei mir nicht öffnen.',
    'Die Datei mit dem Vermerk „Vertraulich“ sagt, ich habe keine Berechtigung.',
    'Word meldet, dass ich mich mit einem berechtigten Konto anmelden muss.',
  ],
  'office-schriftart-fehlt': [
    'Unsere Hausschrift wird bei mir durch Calibri ersetzt.',
    'In der Schriftartenliste fehlt die SKF-Schrift, die alle anderen haben.',
    'Meine Präsentation sieht anders aus, weil die Firmenschrift bei mir nicht da ist.',
  ],
  'office-installation-fehlercode': [
    'Die Office-Installation bricht kurz vor Schluss mit einem Fehlercode ab.',
    'Ich wollte Office reparieren lassen, aber es kam „Etwas ist schiefgelaufen“ mit einer Nummer.',
    'Das Setup von Microsoft 365 hört bei der Hälfte auf und meldet einen Fehler.',
  ],
  'office-konfiguration-jeder-start': [
    'Jedes Mal beim Öffnen von Word kommt erst ein Fenster mit Fortschrittsbalken.',
    'Office richtet sich bei jedem Start neu ein, das dauert jedes Mal.',
    'Bevor Excel aufgeht, steht immer „Bitte warten, Office wird konfiguriert“.',
  ],
  'office-visio-project-fehlt': [
    'Auf dem neuen Laptop gibt es kein Visio mehr, auf dem alten hatte ich es.',
    'Meine Projektpläne gehen nicht auf, weil MS Project fehlt.',
    'Nach dem Neuaufsetzen sind meine Zeichenprogramme von Microsoft verschwunden.',
  ],
  'office-serienbrief-datenquelle': [
    'Word findet meine Adressliste aus Excel nicht, wenn ich den Seriendruck starte.',
    'Beim Empfänger auswählen kommt eine Meldung, dass die Tabelle nicht geöffnet werden kann.',
    'Die Verbindung vom Serienbrief zur Excel-Liste klappt nicht mehr.',
  ],
  'office-power-query-anmeldung': [
    'Beim Aktualisieren meiner Abfrage auf die SharePoint-Liste will Excel ständig Zugangsdaten.',
    'Daten aktualisieren schlägt fehl mit „Zugriff auf die Ressource ist verboten“.',
    'Meine Auswertung aus der Teams-Liste lädt keine neuen Daten mehr.',
  ],
  'office-eingebettetes-objekt': [
    'Die Excel-Tabelle in meiner Präsentation lässt sich per Doppelklick nicht mehr ändern.',
    'Word sagt, die Quellanwendung für das Objekt könne nicht gestartet werden.',
    'Das eingefügte Diagramm in Word lässt sich nicht bearbeiten.',
  ],
  'office-datei-beschaedigt': [
    'Beim Öffnen meiner Datei kommt „unlesbarer Inhalt gefunden“.',
    'Excel sagt, die Datei sei kaputt und könne nicht geöffnet werden.',
    'Mein Word-Dokument von gestern ist plötzlich defekt.',
  ],
  'office-copilot-fehlt': [
    'Bei mir gibt es in Word den KI-Knopf nicht, den die anderen haben.',
    'Der Copilot taucht in Excel und PowerPoint bei mir nirgends auf.',
    'Wir haben angeblich KI in Office, aber ich finde den Assistenten nicht.',
  ],
  'office-funktion-administrator-deaktiviert': [
    'Beim Klick auf Übersetzen steht da, mein Administrator habe das abgeschaltet.',
    'Die Designideen in PowerPoint sind bei mir gesperrt.',
    'Diktieren und ähnliche Online-Funktionen sind alle grau.',
  ],
  'office-diktieren-mikrofon': [
    'Ich klicke in Word auf Diktieren, aber es erkennt kein Wort.',
    'Die Spracheingabe findet mein Headset nicht.',
    'Word sagt beim Diktieren, es sei kein Mikrofon vorhanden.',
  ],

  // ── katalog/office2.ts ──
  'excel-csv-trennzeichen-speichern': [
    'Die Datei, die ich aus Excel als CSV speichere, nimmt das Portal nicht an.',
    'In meiner gespeicherten CSV stehen Kommas zwischen den Werten statt Strichpunkte.',
    'Der Upload in SAP meckert, weil Excel die Spalten falsch trennt.',
  ],
  'excel-nummern-werden-datum': [
    'Aus der Teilenummer 03-12 macht Excel einfach den 3. Dezember.',
    'Bei langen Seriennummern stehen auf einmal nur noch Nullen am Ende.',
    'Die Null vorne an unseren Lieferantennummern verschwindet immer.',
  ],
  'excel-sap-zahlen-als-text': [
    'Meine Summe über die SAP-Beträge ergibt einfach null.',
    'Die exportierten Werte haben ein grünes Dreieck und lassen sich nicht addieren.',
    'Das Minus steht bei den SAP-Zahlen hinten und Excel rechnet damit nicht.',
  ],
  'excel-dateiformat-passt-nicht': [
    'Beim Öffnen der Exportdatei warnt Excel, dass Format und Endung nicht übereinstimmen.',
    'Die .xls aus SAP sagt jedes Mal, die Datei könnte beschädigt oder unsicher sein.',
    'Ich muss bei jedem Export erst eine Warnung mit Ja bestätigen.',
  ],
  'excel-personal-xlsb-fehlt': [
    'Meine selbst aufgezeichneten Makros sind in Excel nicht mehr da.',
    'Die Makroliste ist leer, obwohl ich da jahrelang Sachen gesammelt habe.',
    'Seit dem Laptoptausch funktionieren meine Tastenkürzel-Makros nicht mehr.',
  ],
  'excel-xlam-netzlaufwerk-blockiert': [
    'Unser Abteilungs-Add-in vom Server lädt in Excel nicht mehr.',
    'Die Registerkarte von unserem eigenen Excel-Tool ist verschwunden.',
    'Das Makro-Add-in aus dem gemeinsamen Ordner wird blockiert.',
  ],
  'office-hyperlink-sicherheitshinweis': [
    'Jeder Klick auf einen Link zu einer Datei auf dem Server bringt eine Warnung.',
    'Word fragt bei Verweisen auf unser Laufwerk immer, ob das schädlich sein kann.',
    'In der Excel-Übersicht kommt bei jedem Dateilink ein Sicherheitsfenster.',
  ],
  'excel-makro-automatisierungsfehler-dotnet': [
    'Unser Makro bricht mit einem Automatisierungsfehler und einer langen Minuszahl ab.',
    'Auf dem neuen Rechner läuft das Excel-Tool nicht, es kommt ein Fehler mit ArrayList.',
    'Das Makro sagt „Automation error“ und bleibt stehen.',
  ],
  'excel-vba-kompilierungsfehler': [
    'Wenn ich das Makro starte, kommt „Fehler beim Kompilieren“.',
    'Excel meldet, ein Projekt oder eine Bibliothek sei nicht gefunden worden.',
    'Seit dem neuen Office läuft das alte Makro nicht mehr, es geht was mit Declare nicht.',
  ],
  'excel-zwischenablage-fehler': [
    'Excel sagt beim Einfügen, es gebe ein Problem mit der Zwischenablage.',
    'Kopieren innerhalb von Excel klappt, aber Einfügen bringt einen Fehler.',
    'Ich kann markierte Zellen nicht mehr einfügen, es kommt eine Meldung.',
  ],
  'excel-power-query-quelle-fehlt': [
    'Meine Abfrage findet die Quelldatei auf dem Laufwerk nicht mehr.',
    'Beim Aktualisieren sagt Power Query, die Datei existiere nicht.',
    'Die Auswertung vom Kollegen geht bei mir nicht, weil seine Datenquelle nicht gefunden wird.',
  ],
  'excel-ace-oledb-treiber-fehlt': [
    'Meine Datenverbindung zu der Access-Datei sagt, der Provider sei nicht registriert.',
    'Excel kann die Daten aus der Datenbank nicht laden, es fehlt angeblich ein Treiber.',
    'Beim Abrufen externer Daten kommt ein Fehler mit ACE.OLEDB.',
  ],
  'excel-analyse-funktionen-fehlen': [
    'Unter Daten fehlt bei mir der Knopf für die Datenanalyse.',
    'Ich brauche den Solver für eine Optimierung, finde ihn aber nicht.',
    'Die Analyse-Funktionen für Histogramme sind bei mir nicht da.',
  ],
  'office-blatt-dokumentschutz': [
    'Ich kann in der Liste nichts eintragen, Excel sagt, die Zelle sei geschützt.',
    'Das Word-Formular lässt sich nur an bestimmten Stellen ausfüllen.',
    'Beim Ändern einer Zahl kommt eine Meldung, dass das Blatt schreibgeschützt ist.',
  ],
  'excel-pfad-zu-lang-sharepoint': [
    'Die Datei im tiefen Teams-Ordner geht in Excel nicht auf, sie wird angeblich nicht gefunden.',
    'Excel kann im synchronisierten SharePoint-Ordner nicht speichern, der Pfad ist zu lang.',
    'Bei Dateien mit sehr langem Ordnerweg kommt immer ein Fehler.',
  ],
  'excel-druckt-viele-seiten': [
    'Meine Tabelle wird auf 30 Seiten verteilt ausgedruckt.',
    'Beim Drucken fehlen rechts die letzten Spalten.',
    'Der Ausdruck ist so klein, dass man nichts mehr lesen kann.',
  ],
  'word-serienbrief-email': [
    'Ich möchte den Serienbrief als Mail verschicken, aber der Punkt ist grau.',
    'Beim Senden der Serien-E-Mails passiert gar nichts.',
    'Die Seriendruck-Mail geht nicht raus, seitdem ich das neue Outlook habe.',
  ],
  'word-serienbrief-zahlenformat': [
    'Im Serienbrief steht der Betrag mit zehn Stellen hinter dem Komma.',
    'Das Datum kommt im Brief amerikanisch an, also Monat zuerst.',
    'Bei den Postleitzahlen fehlt im Serienbrief die Null vorne.',
  ],
  'word-verweisquelle-inhaltsverzeichnis': [
    'Im Dokument steht mehrmals „Fehler! Verweisquelle konnte nicht gefunden werden“.',
    'Das Inhaltsverzeichnis zeigt alte Seitenzahlen und fehlende Kapitel.',
    'Meine Querverweise funktionieren nach dem Umbau des Dokuments nicht mehr.',
  ],
  'word-aenderungen-kommentare-sichtbar': [
    'Im Dokument sind überall rote, durchgestrichene Textstellen und Sprechblasen.',
    'Beim Drucken erscheinen die Kommentare am Rand mit auf dem Papier.',
    'Die PDF an den Kunden enthielt noch alle Überarbeitungen.',
  ],
  'word-vorlage-alter-server': [
    'Alte Word-Dateien brauchen eine halbe Minute zum Öffnen.',
    'Beim Schließen eines Dokuments hängt Word lange, als würde es etwas suchen.',
    'Nur bestimmte ältere Dokumente öffnen extrem langsam, neue gehen schnell.',
  ],
  'office-bilder-leerer-rahmen': [
    'Statt des Logos sieht man im Dokument nur ein leeres Kästchen.',
    'Die Fotos in der Präsentation sind weg, da ist nur noch ein rotes Kreuz.',
    'In meinem Word-Bericht werden keine Grafiken mehr angezeigt.',
  ],
  'office-grafikfilter-fehlt': [
    'Beim Einfügen eines Bildes sagt Word, es fehle ein Grafikfilter.',
    'Ich kann keine PNG mehr in PowerPoint einfügen, es kommt ein Fehler.',
    'Bilder einfügen funktioniert in keinem Office-Programm mehr.',
  ],
  'word-formel-editor-alt': [
    'Die alten Formeln in meinem Skript lassen sich per Doppelklick nicht mehr öffnen.',
    'Word sagt bei den Gleichungen, das Objekt könne nicht bearbeitet werden.',
    'Meine Formeln aus alten Dokumenten sind nur noch Bilder.',
  ],
  'word-layout-anderer-pc': [
    'Beim Kollegen rutschen in meinem Dokument die Tabellen auf die nächste Seite.',
    'Das Layout verschiebt sich, sobald jemand anderes die Datei öffnet.',
    'Bei mir passt alles auf zwei Seiten, beim Chef sind es drei.',
  ],
  'office-dateidialog-haengt': [
    'Wenn ich auf Durchsuchen klicke, friert Word ein.',
    'Das Fenster zum Speichern unter kommt einfach nicht.',
    'Beim Öffnen einer Datei aus Excel heraus hängt alles minutenlang.',
  ],
  'ppt-onlinevideo': [
    'Das YouTube-Video in meiner Präsentation zeigt nur einen schwarzen Rahmen.',
    'Das eingebaute Stream-Video lädt während der Präsentation nicht.',
    'Videos aus dem Internet laufen in PowerPoint nicht ab.',
  ],
  'ppt-aufzeichnung-ohne-ton': [
    'Meine aufgezeichnete Präsentation hat kein Audio.',
    'Bei der Bildschirmaufnahme aus PowerPoint ist meine Stimme nicht drauf.',
    'Die Sprechertexte, die ich aufgenommen habe, sind stumm.',
  ],
  'ppt-video-export-haengt': [
    'Der Export meiner Folien als MP4 bleibt bei der Hälfte stehen.',
    'PowerPoint erstellt das Video nicht, die Leiste unten bewegt sich nicht mehr.',
    'Beim Umwandeln der Präsentation in einen Film bricht es immer ab.',
  ],
  'ppt-folienmaster': [
    'Ich kann das alte Logo auf den Folien nicht anklicken und nicht löschen.',
    'Die Fußzeile in der Präsentation lässt sich nicht ändern.',
    'Der Hintergrund jeder Folie ist fest und reagiert auf nichts.',
  ],
  'office-kontofehler-aufmerksamkeit': [
    'In Word ist oben ein gelber Balken mit „Kontofehler“.',
    'Office sagt, mein Konto brauche Aufmerksamkeit, aber beim Klick passiert nichts.',
    'Oben rechts beim Namen ist ein gelbes Warnzeichen.',
  ],
  'office-geraetelimit': [
    'Office sagt, ich habe es auf zu vielen Geräten installiert.',
    'Bei der Anmeldung heißt es, die maximale Anzahl Geräte sei erreicht.',
    'Ich kann Office auf dem neuen Laptop nicht aktivieren, weil das Limit voll ist.',
  ],
  'office-gemeinsam-genutzter-pc': [
    'Am Hallen-PC muss sich jeder in der Schicht neu in Office anmelden.',
    'Auf dem Gemeinschaftsrechner ist Office bei jedem Mitarbeiter wieder nicht aktiviert.',
    'Der Kollege von der Spätschicht kann Excel am Meister-PC nicht benutzen.',
  ],
  'office-zwei-versionen': [
    'Bei mir ist neben Microsoft 365 noch ein altes Office 2016 drauf.',
    'Auf dem neuen Laptop war eine Testversion von Office vorinstalliert.',
    'Im Startmenü gibt es Word zweimal und beide sehen unterschiedlich aus.',
  ],
  'office-speichert-in-onedrive': [
    'Wenn ich eine neue Datei speichere, schlägt Word immer die Cloud vor.',
    'Meine Dokumente landen alle in OneDrive, obwohl ich das nicht will.',
    'Ich finde meine gespeicherten Dateien nicht, sie sind irgendwo im OneDrive.',
  ],
  'office-nur-kopie-speichern': [
    'In Excel gibt es bei Datei nur noch „Kopie speichern“.',
    'Ich habe aus Versehen die Vorlage überschrieben, weil AutoSave an war.',
    'Der Menüpunkt „Speichern unter“ ist bei SharePoint-Dateien verschwunden.',
  ],
  'office-zuletzt-verwendet-leer': [
    'Die Liste der letzten Dateien in Word ist auf einmal komplett leer.',
    'Meine angehefteten Dokumente in Excel sind weg.',
    'Excel zeigt bei den zuletzt geöffneten Dateien nur uralte Einträge.',
  ],
  'office-datei-oeffnet-bei-anmeldung': [
    'Jeden Morgen beim Hochfahren geht automatisch eine alte Excel-Liste auf.',
    'Nach dem Einloggen öffnet sich ein Word-Dokument von allein.',
    'Wie bekomme ich weg, dass bei jedem Start diese eine Datei aufpoppt?',
  ],
  'office-vertraulichkeit-pflicht': [
    'Beim Speichern will Word, dass ich eine Vertraulichkeitsstufe auswähle.',
    'Bei mir fehlt der Knopf für Vertraulichkeit, den die anderen oben haben.',
    'Ich kann das Dokument nicht ablegen, ohne „Intern“ oder Ähnliches zu wählen.',
  ],
  'office-onenote-zwei-versionen': [
    'Meine Notizbücher sind im einen OneNote da und im anderen nicht.',
    'Ich habe zwei verschiedene OneNote-Programme und weiß nicht, welches richtig ist.',
    'Ein Link aus Teams öffnet OneNote, aber dort fehlen meine Notizen.',
  ],
  'office-access-fehlt': [
    'Die .accdb-Datei von der Abteilung lässt sich bei mir nicht öffnen.',
    'Windows weiß nicht, mit welchem Programm es die Datenbank öffnen soll.',
    'Bei mir gibt es kein Access im Startmenü, ich brauche es aber für die Datenbank.',
  ],
  'office-anhang-bearbeitet-weg': [
    'Ich habe den Anhang aus der Mail geändert und gespeichert, jetzt sind die Änderungen weg.',
    'Wo hat Word meine Datei abgelegt? Ich hatte sie direkt aus Outlook geöffnet.',
    'Die bearbeitete Excel-Datei aus der Mail finde ich nirgends mehr.',
  ],
}
