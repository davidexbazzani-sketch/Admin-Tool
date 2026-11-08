// ── Weitere Beschreibungen (so sagen es Anwender) für BESTEHENDE Probleme — Gruppe „teams“ ──
// Schlüssel = Problem-ID, Wert = 3 zusätzliche Beschreibungen in eigenen Worten.
// Bereiche: Teams (kommunikation.ts, kommunikation2.ts) · Telefonie & Sonstiges (system.ts, system2.ts).

export const VARIANTEN_TEAMS: Record<string, string[]> = {
  // ══ Teams ═══════════════════════════════════════════════════════════════════
  'teams-startet-nicht': [
    'Ich klicke auf das Teams-Symbol und es tut sich überhaupt nichts.',
    'Heute früh geht mein Teams nicht auf, auch nach mehrmaligem Klicken nicht.',
    'Teams will einfach nicht hochkommen, es dreht sich nur kurz die Maus.',
  ],
  'teams-weisses-fenster': [
    'Teams geht auf, aber innen ist alles weiß, keine Chats, keine Knöpfe.',
    'Das Teams-Fenster bleibt komplett leer und lädt nie fertig.',
    'Ich sehe nur einen grauen Rahmen von Teams, der Inhalt fehlt.',
  ],
  'teams-grafikfehler': [
    'In Teams zucken Bildteile und es gibt schwarze Kästen über dem Chat.',
    'Die Teams-Oberfläche hat komische Streifen und flimmert beim Scrollen.',
    'Beim Öffnen von Teams wird das Fenster kurz schwarz und flackert dann.',
  ],
  'teams-anmeldeschleife': [
    'Teams will immer wieder mein Kennwort, ich komme nie rein.',
    'Ich melde mich an, Teams lädt kurz und dann kommt wieder das Anmeldefenster.',
    'Seit heute fragt Teams im Kreis nach meinem Konto, egal was ich eingebe.',
  ],
  'teams-fehler-caa20002': [
    'Beim Anmelden in Teams steht nur „Wir konnten Sie nicht anmelden“ mit caa20002.',
    'Teams zeigt den Code caa20002 und lässt mich nicht weiter.',
    'Nach dem Kontowechsel bekomme ich in Teams den Fehler 20002.',
  ],
  'teams-fehler-caa7000a': [
    'Im Homeoffice zeigt Teams caa7000a und sagt, es gibt keine Verbindung.',
    'Teams meldet einen Netzwerkfehler mit dem Code caa7000a, das Internet geht aber.',
    'Ohne Zscaler-Symbol unten rechts kommt in Teams immer caa7000a.',
  ],
  'teams-fehler-caa70004': [
    'Teams sagt, die Verbindung wurde abgelehnt, Fehler caa70004.',
    'Seit dem Hotel-WLAN kommt bei Teams caa70007 und es lädt nicht.',
    'Teams bricht mit caa70004 ab, Outlook verbindet aber normal.',
  ],
  'teams-fehler-caa20003': [
    'Teams meldet ein Autorisierungsproblem mit caa20003.',
    'Mein Laptop zeigt eine falsche Uhrzeit und Teams lässt mich mit 20003 nicht rein.',
    'Nach der Dienstreise klappt die Teams-Anmeldung nicht, Fehler caa20003.',
  ],
  'teams-fehler-caa82ee2': [
    'Teams braucht ewig und bricht dann mit caa82ee2 ab.',
    'Bei schlechtem WLAN kommt in Teams eine Zeitüberschreitung, Code caa82ee2.',
    'Die Anmeldung in Teams läuft in einen Timeout, angeblich caa82ee2.',
  ],
  'teams-fehler-caa82ee7': [
    'Teams sagt, der Server kann nicht gefunden werden, Fehler caa82ee7.',
    'Beim Start von Teams kommt caa82ee7, obwohl ich im Netz bin.',
    'Teams findet seine Server nicht, Fehlercode irgendwas mit 82ee7.',
  ],
  'teams-fehler-caa20004': [
    'Teams meldet, dass mein Gerät nicht zugelassen ist, Code 53003.',
    'Ich darf mich mit diesem Laptop angeblich nicht in Teams anmelden, caa20004.',
    'Teams sagt, der Zugriff ist durch Richtlinien der Organisation blockiert.',
  ],
  'teams-fehler-caa90018': [
    'Teams zeigt caa90018 und behauptet, meine Anmeldedaten sind falsch.',
    'Nach dem neuen Kennwort kommt bei Teams der Fehler 90018.',
    'Teams nimmt irgendwelche alten gespeicherten Daten und scheitert mit caa90018.',
  ],
  'teams-fehler-80090016': [
    'Teams meldet, das Trusted Platform Module funktioniert nicht, Code 80090016.',
    'Beim Anmelden in Teams und Outlook kommt ein TPM-Fehler 80090016.',
    'Nach dem Mainboard-Tausch bekomme ich in Teams 80090016.',
  ],
  'teams-anmeldung-blockiert': [
    'Teams sagt, mein Konto ist gesperrt, Fehler 4c7.',
    'Ich komme in Teams nicht rein, es heißt, die Anmeldung wurde blockiert.',
    'Bei Teams steht, dass mein Konto deaktiviert wurde oder ich keinen Zugriff habe.',
  ],
  'teams-kennwort-geaendert': [
    'Seit ich mein Kennwort geändert habe, ist Teams dauerhaft offline.',
    'Nach dem neuen Passwort will Teams sich nicht mehr verbinden.',
    'Ich habe heute das Kennwort gewechselt und seitdem lädt Teams nichts mehr.',
  ],
  'teams-falsches-konto': [
    'Teams öffnet mit meinem privaten Microsoft-Konto statt dem Firmenkonto.',
    'In Teams bin ich mit der Adresse eines Kollegen angemeldet, wie kommt das?',
    'Teams nimmt immer mein altes Konto vom Praktikum, nicht das richtige.',
  ],
  'teams-neuer-mitarbeiter': [
    'Der neue Kollege startet Teams und es bleibt bei „Wir richten alles ein“ stehen.',
    'Am ersten Arbeitstag lädt Teams beim Neuen endlos.',
    'Ein frisch angelegter Mitarbeiter kommt nicht über den Einrichtungsbildschirm von Teams hinaus.',
  ],
  'teams-lizenz-fehlt': [
    'Teams sagt, ich habe keine Lizenz für dieses Produkt.',
    'Beim Öffnen kommt „Ihre Organisation hat Teams deaktiviert“.',
    'Ich kann Teams nicht benutzen, weil mir angeblich die Berechtigung fehlt.',
  ],
  'teams-chats-fehlen': [
    'Meine ganzen Unterhaltungen in Teams sind weg, die Liste ist leer.',
    'Alte Chatnachrichten mit Kollegen werden nicht mehr angezeigt.',
    'In Teams sehe ich nur noch neue Chats, der Verlauf ist verschwunden.',
  ],
  'teams-nachricht-nicht-gesendet': [
    'Neben meinen Nachrichten in Teams steht ein rotes Ausrufezeichen und „nicht gesendet“.',
    'Ich schreibe im Teams-Chat, aber die Nachricht geht nie raus.',
    'Teams bleibt beim Senden hängen und zeigt dann einen Fehler an der Nachricht.',
  ],
  'teams-offline-nach-standby': [
    'Nach der Mittagspause steht in Teams oben „Sie sind offline“.',
    'Wenn ich den Laptop aufklappe, verbindet Teams sich nicht mehr von selbst.',
    'Nach dem Andocken zeigt Teams keine Verbindung, bis ich es neu starte.',
  ],
  'teams-kalender-fehlt': [
    'Links in Teams gibt es bei mir keinen Kalender mehr.',
    'Der Teams-Kalender ist leer, in Outlook stehen aber alle Termine.',
    'Teams zeigt meine Besprechungen nicht im Kalender an.',
  ],
  'teams-besprechungsknopf-fehlt': [
    'Im Outlook-Termin fehlt die Schaltfläche für die Teams-Besprechung.',
    'Ich kann aus Outlook keine Teams-Einladung mehr machen, der Knopf ist weg.',
    'Das Teams-Symbol im Kalender von Outlook ist verschwunden.',
  ],
  'teams-besprechungslink-fehlt': [
    'Ich klicke auf Teams-Besprechung, aber in der Einladung steht kein Link.',
    'Die Einladung geht raus, nur der Beitrittslink fehlt.',
    'Outlook fügt bei Teams-Terminen keinen Teilnahmelink mehr ein.',
  ],
  'teams-status-falsch': [
    'Ich sitze am PC, aber Teams zeigt mich die ganze Zeit gelb als abwesend.',
    'Mein Status bleibt auf „Beschäftigt“, obwohl die Besprechung vorbei ist.',
    'Teams setzt mich ständig auf abwesend, obwohl ich arbeite.',
  ],
  'teams-status-in-outlook-fehlt': [
    'In Outlook sieht man bei Kollegen keinen grünen oder roten Punkt mehr.',
    'Der Anwesenheitsstatus neben den Namen in Outlook ist verschwunden.',
    'Outlook zeigt bei allen „Status unbekannt“, Teams läuft aber.',
  ],
  'teams-benachrichtigungen-fehlen': [
    'Ich bekomme von Teams keine Popups mehr, wenn jemand schreibt.',
    'Neue Chats sehe ich nur, wenn ich Teams selbst aufmache.',
    'Unten rechts erscheint bei Teams-Nachrichten gar nichts mehr.',
  ],
  'teams-kein-klingelton': [
    'Bei Anrufen in Teams höre ich kein Klingeln, nur das Fenster blinkt.',
    'Teams macht bei neuen Nachrichten keinen Ton mehr.',
    'Wenn mich jemand über Teams anruft, bleibt es stumm.',
  ],
  'teams-headset-nicht-erkannt': [
    'Mein Headset taucht in den Teams-Geräteeinstellungen nicht auf.',
    'Teams findet den Kopfhörer nicht, Windows aber schon.',
    'In Teams steht bei Lautsprecher und Mikrofon nur das Laptop-Gerät.',
  ],
  'teams-mikrofon-geht-nicht': [
    'In der Besprechung sagen alle, sie hören mich nicht.',
    'Mein Mikro ist in Teams an, aber beim Testanruf kommt nichts an.',
    'Die anderen sehen mich reden, aber es kommt kein Ton von mir.',
  ],
  'teams-kamera-geht-nicht': [
    'Beim Einschalten der Kamera in Teams bleibt das Bild schwarz.',
    'Teams sagt, es wurde keine Kamera gefunden.',
    'Mein Video in Teams zeigt nur einen schwarzen Kasten.',
  ],
  'teams-kamera-belegt': [
    'Teams meldet, dass ein anderes Programm die Kamera benutzt.',
    'Ich kann die Kamera in Teams nicht anmachen, weil sie angeblich belegt ist.',
    'Die Webcam ist für Teams blockiert, obwohl sonst nichts offen ist.',
  ],
  'teams-bildschirmfreigabe-schwarz': [
    'Ich teile meinen Bildschirm, aber die anderen sehen nur Schwarz.',
    'Beim Präsentieren in Teams kommt bei den Teilnehmern kein Bild an.',
    'Die Kollegen sagen, mein geteilter Desktop ist dunkel.',
  ],
  'teams-freigabe-ausgegraut': [
    'Der Teilen-Knopf in der Besprechung ist grau und lässt sich nicht anklicken.',
    'Ich kann in der Teams-Besprechung meinen Bildschirm nicht freigeben.',
    'Bei mir fehlt die Option zum Präsentieren in Teams.',
  ],
  'teams-systemton-teilen': [
    'Ich zeige ein Video in Teams, aber die anderen hören den Ton nicht.',
    'Beim Teilen eines Films kommt bei den Teilnehmern nur das Bild an.',
    'Der Computersound wird in der Besprechung nicht mit übertragen.',
  ],
  'teams-ton-abgehackt': [
    'In Teams-Besprechungen klingen die anderen wie ein Roboter.',
    'Der Ton bricht in Teams ständig weg, man versteht nur jedes dritte Wort.',
    'Die Stimmen in Teams stocken und kommen verzerrt an.',
  ],
  'teams-besprechung-bricht-ab': [
    'Mitten in der Besprechung fliege ich aus Teams raus.',
    'Teams zeigt „Verbindung verloren“ und wirft mich aus dem Meeting.',
    'Ich muss mich in jeder längeren Besprechung mehrmals neu einwählen.',
  ],
  'teams-pc-langsam-in-besprechung': [
    'Sobald ich in einer Teams-Besprechung bin, wird der Laptop heiß und laut.',
    'Während Videokonferenzen reagiert mein PC kaum noch.',
    'In Teams-Meetings läuft der Lüfter auf Hochtouren und alles ruckelt.',
  ],
  'teams-traege': [
    'Teams ist super langsam, jeder Klick dauert Sekunden.',
    'Bis ein Chat aufgeht, vergeht in Teams eine halbe Ewigkeit.',
    'Teams hängt beim Wechseln zwischen Chats und Kanälen.',
  ],
  'teams-friert-ein': [
    'Teams hängt sich auf und Windows schreibt „Keine Rückmeldung“.',
    'Das Teams-Fenster wird weißlich und reagiert gar nicht mehr.',
    'Mehrmals am Tag friert Teams komplett ein.',
  ],
  'teams-absturz-beim-beitreten': [
    'Wenn ich auf „Jetzt teilnehmen“ klicke, schließt sich Teams.',
    'Teams stürzt jedes Mal ab, sobald ich einer Besprechung beitreten will.',
    'Beim Betreten eines Meetings ist Teams plötzlich weg.',
  ],
  'teams-klassisch-und-neu': [
    'Ich habe zwei Teams auf dem PC, ein altes und ein neues.',
    'Es starten immer zwei verschiedene Teams-Fenster.',
    'Im Startmenü gibt es „Microsoft Teams (classic)“ und das neue, was soll ich nehmen?',
  ],
  'teams-nicht-installiert': [
    'Auf meinem Laptop gibt es gar kein Teams.',
    'Ich finde Teams nirgends, weder im Startmenü noch in der Suche.',
    'Nach dem Neuaufsetzen fehlt Teams auf dem PC.',
  ],
  'teams-update-haengt': [
    'Teams sagt, meine Version ist veraltet, aktualisiert sich aber nicht.',
    'Kollegen haben neue Funktionen in Teams, ich nicht, mein Teams bleibt alt.',
    'Teams zeigt seit Tagen „Update wird installiert“ und nichts passiert.',
  ],
  'teams-gastorganisation': [
    'Ich komme nicht in den Bereich der Partnerfirma, bei der ich Gast bin.',
    'Der Wechsel zur anderen Organisation in Teams lädt endlos.',
    'Teams lässt mich nicht zu dem Mandanten des Kunden umschalten.',
  ],
  'teams-dateien-oeffnen-nicht': [
    'Wenn ich in Teams eine Word-Datei anklicke, öffnet sich nichts.',
    'Excel-Tabellen aus Teams lassen sich nicht in der App öffnen.',
    'Dateien aus dem Teams-Kanal öffnen sich nur im Browser oder gar nicht.',
  ],
  'teams-dateien-reiter-fehler': [
    'Im Kanal unter „Dateien“ kommt nur eine Fehlermeldung.',
    'Der Dateien-Bereich in unserem Team lädt nicht.',
    'Teams sagt bei den Kanaldateien, es ist ein Problem aufgetreten.',
  ],
  'teams-kanal-synchronisieren': [
    'Ich klicke im Kanal auf „Synchronisieren“, aber im Explorer kommt nichts an.',
    'Die Teams-Dateien lassen sich nicht mit OneDrive auf den PC holen.',
    'Der Kanalordner taucht nach dem Synchronisieren nicht im Explorer auf.',
  ],
  'teams-team-fehlt': [
    'Ein Team, in dem ich bin, wird mir nicht angezeigt.',
    'Ich wurde zu einem Team hinzugefügt, sehe es aber nicht.',
    'Ein Kanal unseres Teams fehlt bei mir in der Liste.',
  ],
  'teams-link-oeffnet-browser': [
    'Ein Klick auf den Besprechungslink öffnet nur Edge statt der App.',
    'Teams-Links landen immer im Browser oder im alten Teams.',
    'Ich muss bei jeder Einladung erst im Browser „In App öffnen“ klicken.',
  ],
  'teams-externe-besprechung': [
    'Bei Webex-Einladungen von Kunden kann ich nicht teilnehmen.',
    'Zoom-Meetings von Lieferanten funktionieren auf meinem Laptop nicht.',
    'Wenn eine fremde Firma per Teams einlädt, komme ich nicht in die Besprechung.',
  ],
  'teams-hintergrundeffekte-fehlen': [
    'Ich kann in Teams meinen Hintergrund nicht mehr unscharf machen.',
    'Die Option für virtuelle Hintergründe ist bei mir nicht da.',
    'Bei den Videoeffekten in Teams ist alles grau.',
  ],
  'teams-anrufe-klingeln-nicht': [
    'Kollegen sagen, sie rufen mich über Teams an, aber bei mir kommt nichts an.',
    'Bei mir landen alle Teams-Anrufe als verpasst, ohne dass es geklingelt hat.',
    'Ich bin über Teams telefonisch nicht erreichbar.',
  ],
  'teams-xelion-headset-konflikt': [
    'Ich drücke am Headset auf Annehmen, aber es geht Xelion statt Teams ran.',
    'Die Taste am Headset nimmt den Teams-Anruf nicht an, sondern öffnet Xelion.',
    'Wenn Teams und Xelion offen sind, reagiert der Headset-Knopf beim falschen Programm.',
  ],
  'teams-headset-tasten': [
    'Mit dem Knopf am Headset kann ich Teams-Anrufe nicht annehmen.',
    'Die Stummschalt-Taste am Kopfhörer macht in Teams nichts.',
    'Lauter, leiser und Auflegen am Headset funktionieren in Teams nicht.',
  ],
  'teams-bluetooth-blechern': [
    'Mit dem Bluetooth-Kopfhörer klinge ich in Teams wie aus der Dose.',
    'Sobald ich in Teams spreche, wird der Ton im Bluetooth-Headset ganz dumpf.',
    'Die Musik klingt gut, aber in der Besprechung ist der Ton blechern.',
  ],
  'teams-ton-aus-lautsprecher': [
    'Der Teams-Ton kommt aus dem Laptop, obwohl das Headset dran ist.',
    'In Besprechungen höre ich die anderen über die Lautsprecher statt im Kopfhörer.',
    'Teams nimmt immer die eingebauten Lautsprecher, nicht mein Headset.',
  ],
  'teams-autostart': [
    'Früher ging Teams beim Hochfahren automatisch auf, jetzt muss ich es selbst starten.',
    'Teams startet morgens nicht mehr von allein.',
    'Nach der Anmeldung an Windows fehlt Teams, bis ich es anklicke.',
  ],
  'teams-sprache-falsch': [
    'Teams ist bei mir plötzlich komplett auf Englisch.',
    'Die Menüs in Teams sind in einer fremden Sprache.',
    'Wie stelle ich Teams wieder auf Deutsch um?',
  ],
  'teams-bilder-laden-nicht': [
    'Im Teams-Chat sehe ich statt Bildern nur graue Kästen.',
    'GIFs und Screenshots von Kollegen werden in Teams nicht angezeigt.',
    'Fotos im Chat laden bei mir nie, es dreht sich nur.',
  ],
  'teams-aufzeichnung': [
    'Die Aufnahme der Besprechung lässt sich bei mir nicht abspielen.',
    'Ich klicke auf das Meeting-Video in Teams und es kommt ein Fehler.',
    'Das aufgezeichnete Teams-Video bleibt schwarz oder lädt nicht.',
  ],
  'teams-apps-fehlen': [
    'Ich kann in Teams keinen Planner-Reiter hinzufügen.',
    'Die App, die Kollegen in Teams nutzen, finde ich nicht im App-Bereich.',
    'Teams sagt, die App ist für mich nicht verfügbar.',
  ],
  'teams-kontakt-nicht-gefunden': [
    'Ich suche einen Kollegen in Teams, aber er wird nicht angezeigt.',
    'Die neue Kollegin finde ich in Teams nicht, in Outlook schon.',
    'Bei der Suche nach einem Namen bringt Teams keine Treffer.',
  ],
  'teams-externe-chat': [
    'Ich will einem Kunden über Teams schreiben, aber das geht nicht.',
    'Teams sagt, dass ich mit dieser externen Person nicht chatten kann.',
    'Externe Kontakte lassen sich bei mir nicht zum Chat hinzufügen.',
  ],
  'teams-telefon-fehlt': [
    'In Teams gibt es bei mir keine Tastatur zum Wählen von Nummern.',
    'Unter „Anrufe“ kann ich nur Kollegen anrufen, keine Telefonnummern.',
    'Kollegen können aus Teams normale Nummern anrufen, ich nicht.',
  ],
  'teams-datei-hochladen': [
    'Ich kann keine Datei in den Teams-Chat ziehen, es kommt ein Fehler.',
    'Beim Anhängen einer Datei in Teams bricht der Upload ab.',
    'Teams sagt beim Hochladen „Etwas ist schiefgegangen“.',
  ],
  'teams-webview2-fehlt': [
    'Beim Start von Teams kommt ein Hinweis, dass Edge WebView2 benötigt wird.',
    'Teams will eine WebView2-Laufzeit installieren und bricht dann ab.',
    'Ohne WebView2 startet Teams angeblich nicht.',
  ],
  'teams-speicher-voll': [
    'Teams geht nicht mehr auf und die Festplatte ist rot.',
    'Seit C: voll ist, stürzt Teams ständig ab.',
    'Windows meldet wenig Speicherplatz und Teams startet nicht mehr.',
  ],
  'teams-fenster-unsichtbar': [
    'Teams ist offen, aber ich sehe das Fenster nirgends auf dem Bildschirm.',
    'Nach dem Abstecken des zweiten Monitors ist das Teams-Fenster verschwunden.',
    'In der Taskleiste ist Teams da, aber beim Klick kommt kein Fenster.',
  ],
  'teams-symbol-fehlt': [
    'Unten rechts bei der Uhr ist das Teams-Symbol nicht mehr da.',
    'Ich finde Teams nicht mehr im Infobereich der Taskleiste.',
    'Das kleine Teams-Icon neben der Uhrzeit ist weg.',
  ],
  'teams-fernsteuerung-uac': [
    'Wenn ich per Teams die Steuerung übergebe, wird bei Admin-Fenstern alles schwarz.',
    'Der Kollege sieht bei der Fernsteuerung keine Administratorabfrage.',
    'Bei der Teams-Fernwartung friert das Bild ein, sobald eine Sicherheitsabfrage kommt.',
  ],
  'teams-unscharf': [
    'Auf dem großen Monitor ist Teams verschwommen.',
    'Die Schrift in Teams ist auf dem zweiten Bildschirm unscharf.',
    'Teams sieht auf dem externen Monitor zu groß und pixelig aus.',
  ],
  'teams-live-untertitel-fehlen': [
    'Ich finde in der Besprechung keine Live-Untertitel.',
    'Die Transkription in Teams startet nicht oder ist leer.',
    'Die Untertitel in Teams sind in der falschen Sprache.',
  ],
  'teams-aufzeichnen-knopf-fehlt': [
    'Ich will die Besprechung aufnehmen, aber „Aufzeichnung starten“ ist nicht da.',
    'Bei mir ist die Aufnahmefunktion in Teams ausgegraut.',
    'Unter „Weitere Aktionen“ fehlt bei mir das Aufzeichnen.',
  ],
  'teams-aufzeichnung-nicht-auffindbar': [
    'Wir haben die Besprechung aufgezeichnet, aber die Aufnahme ist nirgends.',
    'Wo landet die Teams-Aufnahme nach dem Meeting?',
    'Im Chat der Besprechung taucht die Aufzeichnung nicht auf.',
  ],
  'teams-gruppenraeume': [
    'Ich kann in meiner Besprechung keine Breakout-Räume anlegen.',
    'Die Teilnehmer kommen nicht in die Gruppenräume.',
    'Der Knopf für Gruppenräume fehlt bei mir in Teams.',
  ],
  'teams-whiteboard-laedt-nicht': [
    'Das Whiteboard in der Besprechung bleibt weiß und reagiert nicht.',
    'Ich kann im Teams-Whiteboard nichts zeichnen.',
    'Das Whiteboard lädt bei mir endlos, bei den anderen geht es.',
  ],
  'teams-reaktionen-hand-heben': [
    'Ich finde in der Besprechung keinen Knopf zum Melden.',
    'Die Emojis und „Hand heben“ sind bei mir in Teams nicht da.',
    'Die Reaktionsleiste in der Besprechung fehlt komplett.',
  ],
  'teams-steuerung-anfordern': [
    'Ich will beim geteilten Bildschirm die Steuerung übernehmen, aber die Option fehlt.',
    'Beim Teilen kann ich niemandem die Steuerung geben.',
    'In Teams gibt es bei mir kein „Steuerung anfordern“.',
  ],
  'teams-wartebereich': [
    'Externe Teilnehmer warten in der Lobby und ich bekomme es nicht mit.',
    'Die Gäste kommen aus dem Wartebereich nicht in meine Besprechung.',
    'Teams lässt die Teilnehmer warten, bis jemand sie hereinlässt.',
  ],
  'teams-einwahlnummer-fehlt': [
    'In meiner Teams-Einladung steht keine Telefonnummer zum Einwählen.',
    'Teilnehmer ohne Laptop können sich nicht per Telefon in die Besprechung einwählen.',
    'Die Einwahl per Telefon fehlt in meinen Einladungen.',
  ],
  'teams-powerpoint-live': [
    'Wenn ich eine PowerPoint in Teams präsentiere, lädt sie nicht.',
    'Die Folien über PowerPoint Live bleiben weiß.',
    'Beim Teilen der Präsentation in Teams kommt ein Fehler.',
  ],
  'teams-loop-komponenten': [
    'Loop-Elemente im Chat zeigen bei mir nur einen Ladekreis.',
    'Die gemeinsame Liste im Teams-Chat lässt sich nicht öffnen.',
    'Teams zeigt Loop-Komponenten nicht an, nur einen Link.',
  ],
  'teams-verbindung-wird-hergestellt': [
    'Beim Beitreten hängt Teams bei „Verbindung wird hergestellt“.',
    'Mein Anruf in Teams baut sich nie auf.',
    'Ich komme nicht in die Besprechung, Teams versucht ewig zu verbinden.',
  ],
  'teams-video-anderer-schwarz': [
    'Ich sehe die Kamerabilder der anderen nicht, nur schwarze Kacheln.',
    'Geteilte Bildschirme der Kollegen sind bei mir verpixelt oder schwarz.',
    'Die Videos der Teilnehmer frieren bei mir ein.',
  ],
  'teams-audiogeraet-wechselt': [
    'Mitten im Anruf springt Teams vom Headset auf die Lautsprecher.',
    'Teams wechselt während der Besprechung von selbst das Mikrofon.',
    'Im Gespräch ist plötzlich der Ton weg, weil Teams ein anderes Gerät nimmt.',
  ],
  'teams-outlook-absturz-besprechung': [
    'Sobald ich im Termin auf Teams-Besprechung klicke, schließt sich Outlook.',
    'Outlook stürzt beim Hinzufügen eines Teams-Links ab.',
    'Beim Anlegen einer Teams-Einladung friert Outlook ein und geht zu.',
  ],
  'teams-stellvertreter-besprechung': [
    'Ich verwalte den Kalender meiner Chefin, kann dort aber keine Teams-Besprechung erstellen.',
    'Im Kalender des Vorgesetzten fehlt mir der Teams-Knopf.',
    'Als Assistenz kann ich für meinen Chef keine Teams-Termine anlegen.',
  ],
  'teams-installation-fehler-0x80073d02': [
    'Beim Installieren von Teams kommt der Fehler 0x80073D02.',
    'Das Update von Teams bricht mit 0x80073CF9 ab.',
    'Teams lässt sich nicht installieren, weil angeblich etwas in Benutzung ist.',
  ],
  'teams-update-exe-fehlermeldung': [
    'Bei jeder Anmeldung kommt eine Meldung, dass Update.exe nicht gefunden wird.',
    'Nach dem Hochfahren erscheint ein Fehler vom alten Teams.',
    'Windows meldet beim Start, dass eine Datei von Teams fehlt.',
  ],
  'teams-skype-for-business-startet': [
    'Jeden Morgen geht Skype for Business auf und will mich anmelden.',
    'Skype for Business meldet ständig einen Anmeldefehler.',
    'Das alte Skype startet mit Windows, obwohl wir Teams haben.',
  ],
  'teams-im-browser': [
    'Teams im Browser lädt bei mir nicht.',
    'Die Webversion von Teams sagt, mein Browser wird nicht unterstützt.',
    'teams.microsoft.com bleibt bei mir weiß.',
  ],
  'teams-ungelesen-zaehler': [
    'Teams zeigt eine Zahl bei Chats, aber ich habe alles gelesen.',
    'Der rote Punkt bei Teams geht nicht weg.',
    'Bei Aktivität steht eine ungelesene Nachricht, die es nicht gibt.',
  ],
  'teams-suche-nachrichten': [
    'Die Suche in Teams findet die Nachricht von letzter Woche nicht.',
    'Ich suche eine Datei aus einem Chat, Teams findet nichts.',
    'Die Teams-Suche zeigt nur neue Ergebnisse.',
  ],
  'teams-netzlaufwerk-link': [
    'Ein Link auf unser Netzlaufwerk im Chat lässt sich nicht anklicken.',
    'Pfade wie \\\\server\\ordner werden in Teams nicht zum Link.',
    'Wenn ich einen Netzwerkpfad in Teams schicke, kann der Kollege ihn nicht öffnen.',
  ],
  'teams-profilbild': [
    'Ich will mein Foto in Teams ändern, aber es kommt ein Fehler.',
    'In Teams und Outlook ist noch mein altes Bild drin.',
    'Mein neues Profilbild wird in Teams nicht übernommen.',
  ],
  'teams-anzeigename-falsch': [
    'Mein Name ist in Teams falsch geschrieben.',
    'Nach der Hochzeit steht in Teams noch mein alter Nachname.',
    'Kollegen sehen bei mir einen falschen Namen.',
  ],
  'teams-team-erstellen': [
    'Ich will ein neues Team anlegen, aber es geht nur „Team beitreten“.',
    'Die Option zum Erstellen eines Teams fehlt bei mir.',
    'Teams lässt mich kein eigenes Team gründen.',
  ],
  'teams-gast-hinzufuegen': [
    'Ich kann einen externen Partner nicht in unser Team aufnehmen.',
    'Gäste aus anderen Firmen lassen sich nicht als Mitglied hinzufügen.',
    'Teams sagt, die Person kann nicht hinzugefügt werden, weil sie extern ist.',
  ],

  // ══ Telefonie & Sonstiges ═══════════════════════════════════════════════════
  'sonstiges-xelion-klingelt-nicht': [
    'Kunden sagen, sie haben mich angerufen, aber mein Telefon am PC hat nicht geläutet.',
    'Bei eingehenden Gesprächen passiert in Xelion gar nichts.',
    'Mein Softphone bleibt stumm, die Anrufe tauchen nur als verpasst auf.',
  ],
  'sonstiges-xelion-kein-ton': [
    'Ich höre den Anrufer, aber er hört mich in Xelion nicht.',
    'Beim Telefonieren über Xelion ist auf beiden Seiten Stille.',
    'Der Gesprächspartner sagt nur „Hallo? Hallo?“, obwohl ich spreche.',
  ],
  'sonstiges-xelion-anmeldung': [
    'Xelion zeigt oben rot „Verbindung zum Server verloren“.',
    'Ich komme in Xelion nicht rein, die Anmeldung schlägt fehl.',
    'Im Homeoffice ist mein Telefonprogramm dauernd offline.',
  ],
  'sonstiges-xelion-installieren': [
    'Auf meinem neuen Laptop gibt es kein Xelion.',
    'Das Telefonprogramm ist weg und muss wieder drauf.',
    'Xelion ist kaputt, kann man das neu aufspielen?',
  ],
  'sonstiges-jabra-tasten': [
    'Mit der Taste am Jabra kann ich keine Gespräche mehr annehmen.',
    'Auflegen über den Knopf am Kopfhörer funktioniert nicht.',
    'Die Bedienknöpfe am Headset reagieren beim Telefonieren nicht.',
  ],
  'sonstiges-jabra-dongle': [
    'Der kleine USB-Stick vom Jabra findet mein Headset nicht mehr.',
    'Das Funkheadset verbindet sich nicht mit dem Stecker am Laptop.',
    'Die LED am Jabra-Link blinkt nur und das Headset bleibt stumm.',
  ],
  'sonstiges-enaio-addin-fehlt': [
    'In Outlook ist der Knopf zum Ablegen in enaio verschwunden.',
    'Die enaio-Leiste in Outlook fehlt seit heute.',
    'Ich kann keine Mails mehr nach enaio schicken, das Add-in ist weg.',
  ],
  'sonstiges-enaio-startet-nicht': [
    'Das Dokumentenarchiv enaio geht nicht auf.',
    'enaio sagt, es kann keine Verbindung zum Server aufbauen.',
    'Beim Starten von enaio kommt eine Fehlermeldung und es schließt sich wieder.',
  ],
  'sonstiges-tel-links-falsches-programm': [
    'Wenn ich auf eine Telefonnummer klicke, geht Teams auf statt Xelion.',
    'Bei Nummern in Mails fragt Windows immer, mit welcher App ich anrufen will.',
    'Ein Klick auf eine Rufnummer öffnet Smartphone-Link statt meines Telefons.',
  ],
  'sonstiges-neustart-abbrechen': [
    'Mein PC will gleich neu starten, aber ich bin mitten in einer Präsentation.',
    'Da läuft ein Countdown zum Neustart, kann man den stoppen?',
    'Bitte den automatischen Neustart verhindern, ich muss noch etwas fertig machen.',
  ],
  'sonstiges-unklares-problem': [
    'Mein Rechner macht seit heute einfach komische Sachen.',
    'Irgendwas stimmt mit dem PC nicht, ich kann es aber nicht genau sagen.',
    'Alles ist irgendwie langsam und hakelig, keine Ahnung, woran es liegt.',
  ],
  'sonstiges-fehler-sporadisch': [
    'Der Fehler kommt nur manchmal, gerade jetzt ist er nicht da.',
    'Ab und zu hängt der PC, aber nicht, wenn die IT draufschaut.',
    'Das Problem tritt alle paar Tage auf und verschwindet wieder.',
  ],
  'sonstiges-xelion-gespraech-bricht-ab': [
    'Telefonate über Xelion brechen nach ein paar Minuten einfach ab.',
    'Beim Telefonieren in der Halle reißt die Verbindung immer wieder.',
    'Die Stimme am anderen Ende hakt und das Gespräch fällt dann weg.',
  ],
  'sonstiges-xelion-kontakte-fehlen': [
    'Wenn ich in Xelion einen Kollegen suche, kommt kein Ergebnis.',
    'Das Adressbuch im Telefonprogramm ist komplett leer.',
    'In Xelion finde ich die Durchwahl der Kollegen nicht mehr.',
  ],
  'sonstiges-xelion-rufumleitung-haengt': [
    'Meine Anrufe gehen alle zu einem Kollegen, obwohl ich wieder da bin.',
    'Seit dem Urlaub landet jeder Anruf direkt auf meiner Mailbox.',
    'Ich habe keine Weiterleitung eingestellt, trotzdem klingelt es woanders.',
  ],
  'sonstiges-xelion-rufnummer-falsch': [
    'Wenn ich anrufe, sieht der Kunde die Zentrale statt meiner Durchwahl.',
    'Beim Angerufenen erscheint eine falsche Nummer von mir.',
    'Meine ausgehende Rufnummer stimmt seit dem Umzug nicht mehr.',
  ],
  'sonstiges-xelion-status-falsch': [
    'In Xelion bin ich für die Kollegen immer rot, obwohl ich frei bin.',
    'Mein Telefonstatus zeigt „abwesend“, obwohl ich am Platz sitze.',
    'Die Anwesenheitsanzeige in Xelion stimmt bei mir nicht.',
  ],
  'sonstiges-xelion-autostart': [
    'Morgens muss ich Xelion immer selbst aufmachen, sonst bin ich nicht erreichbar.',
    'Das Telefonprogramm startet nicht mehr mit dem PC.',
    'Nach der Anmeldung fehlt Xelion, bis ich es von Hand starte.',
  ],
  'sonstiges-enaio-langsam': [
    'Die Suche in enaio dauert ewig.',
    'Dokumente in enaio aufzumachen geht nur noch im Schneckentempo.',
    'enaio hängt bei jedem Klick mehrere Sekunden.',
  ],
  'sonstiges-enaio-dokument-oeffnet-nicht': [
    'Ein PDF aus enaio lässt sich nicht öffnen.',
    'Die Vorschau in enaio bleibt weiß.',
    'Wenn ich in enaio auf eine Akte klicke, erscheint das Dokument nicht.',
  ],
}
