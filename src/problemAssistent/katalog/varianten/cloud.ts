// ── Weitere Beschreibungen (so sagen es Anwender) für BESTEHENDE Probleme — Gruppe „cloud“ ──
// Schlüssel = Problem-ID, Wert = 3 zusätzliche Beschreibungen in eigenen Worten.

export const VARIANTEN_CLOUD: Record<string, string[]> = {
  // ══ OneDrive & SharePoint (office.ts) ═══════════════════════════════════════
  'onedrive-symbol-fehlt': [
    'Unten rechts bei der Uhr ist die blaue Wolke einfach nicht mehr da.',
    'Ich sehe gar nicht mehr, ob meine Dateien gesichert werden – das Wölkchen ist verschwunden.',
    'Auch unter dem kleinen Pfeil neben der Uhr finde ich OneDrive nicht.',
  ],
  'onedrive-startet-nicht-absturz': [
    'Ich klicke OneDrive im Startmenü an, es blinkt kurz auf und ist wieder weg.',
    'OneDrive geht auf und nach ein paar Sekunden zu, ohne Meldung.',
    'Die Synchronisierung läuft gar nicht mehr, weil sich das Programm immer selbst beendet.',
  ],
  'onedrive-sync-ausstehend': [
    'Bei meinen Dateien drehen sich seit Stunden die blauen Pfeile und nichts kommt in der Cloud an.',
    'Kollegen sehen meine Änderungen nicht, OneDrive hängt anscheinend fest.',
    'Die Wolke zeigt dauernd „Änderungen werden verarbeitet“ und wird nie fertig.',
  ],
  'onedrive-sync-angehalten': [
    'OneDrive sagt, die Synchronisierung ist pausiert, weil ich im Stromsparmodus bin.',
    'Am Handy-Hotspot lädt OneDrive nichts mehr hoch.',
    'Auf der Wolke ist ein Pause-Zeichen und meine Dateien bleiben auf dem alten Stand.',
  ],
  'onedrive-anmeldung-staendig': [
    'Jeden Morgen poppt ein Fenster auf, dass ich mich bei OneDrive anmelden soll.',
    'Ich gebe mein Passwort ein, und eine Stunde später will OneDrive es schon wieder.',
    'Die Wolke ist grau und meldet „Melden Sie sich an, um zu synchronisieren“.',
  ],
  'onedrive-falsches-konto': [
    'In meinem OneDrive-Ordner liegen Dateien vom Vorgänger, der den Laptop vorher hatte.',
    'OneDrive ist mit meiner privaten Hotmail-Adresse verbunden statt mit der Firma.',
    'Meine Firmenordner fehlen, stattdessen sehe ich meine Urlaubsfotos von zu Hause.',
  ],
  'onedrive-dateien-doppelt-rechnername': [
    'Neben meiner Excel-Liste liegt plötzlich eine zweite mit dem Namen meines Laptops hinten dran.',
    'Im Teams-Ordner gibt es jede Datei zweimal, einmal mit einem komischen Zusatz.',
    'OneDrive hat Kopien mit dem PC-Namen angelegt und ich weiß nicht, welche aktuell ist.',
  ],
  'onedrive-desktop-leer-nach-umzug': [
    'Auf meinem neuen Laptop ist der Desktop leer, auf dem alten war alles voll.',
    'Nach dem Gerätetausch finde ich meine Dokumente nicht mehr.',
    'Die Symbole und Ordner, die ich auf dem Desktop hatte, sind auf dem neuen Rechner verschwunden.',
  ],
  'onedrive-ordnersicherung-fehler': [
    'Ich will Desktop und Dokumente in OneDrive sichern, aber es kommt eine Fehlermeldung.',
    'Bei „Sicherung verwalten“ steht, dass der Ordner Dokumente nicht geschützt werden kann.',
    'OneDrive meckert über eine PST-Datei, wenn ich die Ordnersicherung einschalten will.',
  ],
  'onedrive-sharepoint-sync-geht-nicht': [
    'Ich klicke in Teams bei den Dateien auf „Synchronisieren“ und es tut sich gar nichts.',
    'Die Abteilungsablage aus SharePoint kommt einfach nicht in meinen Explorer.',
    'Nach dem Klick auf Synchronisieren fragt der Browser kurz etwas, danach passiert nichts.',
  ],
  'onedrive-verknuepfung-ordner-fehlt': [
    'Den Teams-Ordner, den ich zu meinen Dateien hinzugefügt habe, finde ich im Explorer nicht.',
    'Die Verknüpfung zum Projektordner zeigt nur ein Fehlersymbol.',
    'Im OneDrive steht der Ordner, lässt sich aber nicht öffnen.',
  ],
  'onedrive-hochladen-fehlgeschlagen': [
    'Excel zeigt oben einen gelben Balken, dass die Datei nicht hochgeladen werden konnte.',
    'Word sagt, das Hochladen ist blockiert und ich soll mich anmelden.',
    'Meine Änderungen an der SharePoint-Datei werden nicht gespeichert.',
  ],
  'onedrive-datei-wird-verwendet': [
    'OneDrive meldet, dass eine Datei nicht synchronisiert wird, weil sie offen ist – sie ist aber zu.',
    'Unsere Access-Datenbank im Teams-Ordner bekommt nie einen grünen Haken.',
    'Bei einer Datei ist ein roter Kreis und es heißt, sie wird von einem anderen Programm benutzt.',
  ],
  'onedrive-ungueltiger-name-pfad': [
    'OneDrive lädt eine Datei nicht hoch und meckert über den Dateinamen.',
    'Die Ordnerstruktur ist so tief, dass OneDrive manche Dateien nicht mehr synchronisiert.',
    'Eine Datei mit einem Punkt am Ende will OneDrive nicht in die Cloud bringen.',
  ],
  'onedrive-c-voll': [
    'Meine Festplatte ist rot, und der größte Brocken ist der OneDrive-Ordner.',
    'Seit ich die Teams-Ordner synchronisiere, habe ich kaum noch freien Platz.',
    'Windows warnt vor wenig Speicher, und OneDrive hat alles lokal heruntergeladen.',
  ],
  'onedrive-cloudspeicher-voll': [
    'OneDrive sagt, mein Speicherplatz ist aufgebraucht und es wird nichts mehr hochgeladen.',
    'Ich bekomme Mails, dass mein OneDrive fast voll ist.',
    'Neue Dateien bekommen ein Warnsymbol, weil kein Platz mehr in der Cloud ist.',
  ],
  'onedrive-nur-online-offline': [
    'Im Zug ohne Netz kann ich meine Dateien aus OneDrive nicht öffnen.',
    'Auf der Baustelle ohne Internet sagt Windows, die Datei ist nicht verfügbar.',
    'Dateien mit dem Wölkchen gehen nur auf, wenn ich online bin.',
  ],
  'onedrive-clouddateianbieter-0x8007016a': [
    'Beim Öffnen einer Datei aus dem Teams-Ordner kommt Fehler 0x8007016A.',
    'Ich kann im OneDrive nichts kopieren oder löschen, Windows meckert über den Cloudanbieter.',
    'Windows sagt, der Clouddateianbieter läuft nicht, wenn ich eine Datei verschieben will.',
  ],
  'onedrive-statussymbole-fehlen': [
    'Im Explorer sehe ich nicht mehr, welche Dateien synchronisiert sind – keine Haken, keine Wolken.',
    'Die kleinen Statussymbole neben den Dateien sind weg.',
    'Ich weiß nicht, ob meine Dateien gesichert sind, weil die Markierungen fehlen.',
  ],
  'onedrive-geloeschte-datei': [
    'Ich habe eine wichtige Datei im Teams-Ordner gelöscht, wie bekomme ich sie zurück?',
    'Ein ganzer Ordner ist im OneDrive weg, ich glaube, ich habe ihn aus Versehen entfernt.',
    'Im Windows-Papierkorb ist die Datei nicht, sie war aber im OneDrive.',
  ],
  'onedrive-massenloeschung-warnung': [
    'Es kam ein Fenster, dass ich sehr viele Dateien gelöscht hätte – das wollte ich nicht.',
    'OneDrive fragt, ob die entfernten Dateien auch in der Cloud gelöscht werden sollen.',
    'Ich habe einen Ordner aus dem OneDrive verschoben und jetzt kommt eine Löschwarnung.',
  ],
  'onedrive-version-veraltet': [
    'OneDrive meldet, dass meine Version zu alt ist und bald nicht mehr funktioniert.',
    'Bei mir steht im OneDrive-Fenster, ich soll aktualisieren, aber es passiert nichts.',
    'Die Wolke zeigt eine Warnung, dass diese Version nicht mehr unterstützt wird.',
  ],
  'onedrive-gemeinsam-bearbeiten-gesperrt': [
    'Wir wollen zu zweit in derselben Excel-Datei arbeiten, aber einer bekommt immer „gesperrt“.',
    'Die Datei ist angeblich von einer Kollegin in Bearbeitung, obwohl sie längst zu hat.',
    'Gleichzeitiges Arbeiten in der Teams-Datei klappt nicht, nur einer darf schreiben.',
  ],
  'onedrive-oeffnet-im-browser': [
    'Wenn ich in Teams auf eine Excel-Datei klicke, geht immer der Browser auf.',
    'Ich will die Datei in Word bearbeiten, sie öffnet sich aber nur online.',
    'Aus SharePoint öffnet sich alles in der Webversion statt im richtigen Programm.',
  ],
  'onedrive-sharepoint-zugriff-verweigert': [
    'Ich klicke auf den Link zur Abteilungsseite und bekomme „Kein Zugriff“.',
    'SharePoint sagt, ich soll Zugriff anfordern, obwohl ich gestern noch rein kam.',
    'Die Teamseite zeigt mir nur eine Fehlermeldung wegen fehlender Rechte.',
  ],
  'onedrive-im-explorer-oeffnen': [
    'Der Knopf „In Datei-Explorer öffnen“ in SharePoint macht bei mir nichts.',
    'Ich will die Bibliothek im Explorer ansehen, es kommt eine Fehlermeldung.',
    'Die Explorer-Ansicht der SharePoint-Ablage lädt nicht.',
  ],
  'onedrive-freigabe-extern': [
    'Ich möchte einem Lieferanten eine Datei aus OneDrive schicken, das Teilen klappt nicht.',
    'Beim Freigeben für eine externe Adresse kommt ein Hinweis, dass das nicht erlaubt ist.',
    'Der Kunde kann den Link, den ich geschickt habe, nicht öffnen.',
  ],
  'onedrive-sync-langsam-cpu': [
    'Der Lüfter dreht hoch und im Task-Manager frisst OneDrive die ganze CPU.',
    'Der Abgleich dauert Ewigkeiten, obwohl nur ein paar Dateien geändert wurden.',
    'Seit ich eine große Bibliothek eingebunden habe, ist der Laptop total zäh.',
  ],
  'onedrive-verbindung-fehler-0x8004de40': [
    'OneDrive sagt, es kann keine Verbindung herstellen, Fehler 0x8004de40.',
    'Internet geht, aber OneDrive meldet ein Verbindungsproblem.',
    'Beim Anmelden bei OneDrive kommt 0x8004deed und es geht nicht weiter.',
  ],
  'onedrive-bibliothek-bereits-synchronisiert': [
    'Beim Synchronisieren heißt es, die Bibliothek wird schon synchronisiert – ich finde sie aber nicht.',
    'OneDrive will einen Teams-Ordner nicht hinzufügen, weil er angeblich schon da ist.',
    'Ich bekomme die Meldung, dass dieser Ordner bereits eingebunden ist.',
  ],
  'onedrive-zweiter-ordner': [
    'Im Benutzerordner gibt es jetzt zwei OneDrive-Ordner, einer mit „(2)“ dahinter.',
    'Seit OneDrive neu eingerichtet wurde, liegen meine Dateien in zwei verschiedenen Ordnern.',
    'Ich weiß nicht, welcher der beiden OneDrive-Ordner der richtige ist.',
  ],
  'onedrive-dokumente-netzlaufwerk-umleitung': [
    'Mein Ordner Dokumente zeigt auf das H-Laufwerk und nicht auf OneDrive.',
    'Wenn ich auf Dokumente klicke, lande ich auf dem Server.',
    'Die Ordnersicherung geht nicht, weil Dokumente auf einem Netzlaufwerk liegt.',
  ],
  'onedrive-sharepoint-seite-weiss': [
    'Die Startseite unseres Intranets lädt und lädt, aber zeigt nichts an.',
    'Die Teamseite in SharePoint bleibt komplett weiß.',
    'Beim Öffnen der Abteilungsseite dreht sich nur der Kreis.',
  ],
  'onedrive-kontextmenue-fehlt': [
    'Wenn ich mit rechts auf einen OneDrive-Ordner klicke, gibt es kein „Speicherplatz freigeben“ mehr.',
    'Im Rechtsklick-Menü fehlen die OneDrive-Einträge wie „Immer behalten“.',
    'Ich finde die Option nicht mehr, um Dateien nur online zu halten.',
  ],
  'onedrive-nach-kennwortaenderung': [
    'Seit ich mein Passwort geändert habe, hat OneDrive ein rotes Kreuz.',
    'Nach dem Kennwortwechsel synchronisiert nichts mehr und Office will ständig eine Anmeldung.',
    'Ich habe heute ein neues Passwort bekommen, jetzt gehen OneDrive und Teams-Dateien nicht.',
  ],
  'onedrive-upload-grosse-dateien-abbruch': [
    'Ein großes Video lädt seit Stunden in OneDrive hoch und bricht immer wieder ab.',
    'Die CAD-Datei mit mehreren Gigabyte kommt nie in SharePoint an.',
    'Beim Hochladen großer Dateien bleibt der Fortschritt einfach stehen.',
  ],
  'onedrive-unterordner-fehlen-lokal': [
    'Im Browser sehe ich alle Ordner der Bibliothek, im Explorer fehlen ein paar.',
    'Neue Ordner, die Kollegen anlegen, tauchen bei mir lokal nicht auf.',
    'Nur ein Teil der Teams-Ablage ist auf meinem PC angekommen.',
  ],
  'onedrive-teams-datei-oeffnen-fehler': [
    'Wenn ich eine Datei aus Teams in Word öffnen will, kommt „konnte nicht geöffnet werden“.',
    'Excel startet, zeigt aber nur eine Fehlermeldung statt der Datei aus Teams.',
    'Dateien aus dem Teams-Kanal lassen sich in der Desktop-App nicht öffnen.',
  ],
  'onedrive-version-wiederherstellen': [
    'Ich habe aus Versehen eine Datei mit falschem Inhalt gespeichert und brauche den Stand von gestern.',
    'Ein Kollege hat meine Tabelle überschrieben – kann man das rückgängig machen?',
    'Wie komme ich an eine frühere Fassung meines Dokuments im OneDrive?',
  ],

  // ══ OneDrive & SharePoint (office2.ts) ══════════════════════════════════════
  'od-link-funktioniert-nicht': [
    'Ich habe einem Kollegen einen Link geschickt, bei ihm kommt nur eine Fehlerseite.',
    'Der Freigabelink sagt, er wurde für jemand anderen erstellt.',
    'Mein Kollege kann die Datei über den Link aus der Mail nicht aufmachen.',
  ],
  'od-pflichtfelder-unsichtbar': [
    'Ich habe eine Datei in SharePoint hochgeladen, aber die Kollegen sehen sie nicht.',
    'Bei meiner hochgeladenen Datei steht, dass Eigenschaften fehlen.',
    'Die Datei hat einen grünen Pfeil und ist nur für mich sichtbar.',
  ],
  'od-nicht-eingerichtet': [
    'Auf meinem neuen Laptop ist OneDrive gar nicht angemeldet, die Wolke ist grau.',
    'Ich bin neu im Unternehmen und habe kein OneDrive im Explorer.',
    'OneDrive richtet sich nicht von selbst ein, obwohl Kollegen sagen, das passiert automatisch.',
  ],
  'od-cloudvorgang-0x80070185': [
    'Beim Öffnen einer Datei mit Wolkensymbol kommt „Der Cloudvorgang war nicht erfolgreich“.',
    'Ich kann Dateien aus OneDrive nicht herunterladen, Fehler 0x80070185.',
    'Dateien, die nur online sind, gehen bei mir nicht auf.',
  ],
  'od-ordner-schreibgeschuetzt-schloss': [
    'Der synchronisierte Teams-Ordner hat ein kleines Schloss und ich kann nichts ändern.',
    'Meine Änderungen im SharePoint-Ordner werden nicht hochgeladen, der Ordner ist schreibgeschützt.',
    'Im Explorer sind alle Dateien der Abteilungsablage nur lesbar.',
  ],
  'od-liste-excel-export': [
    'Wenn ich die SharePoint-Liste nach Excel exportiere, bleibt Excel leer.',
    'Beim Export bekomme ich nur eine Datei query.iqy, die nicht aufgeht.',
    'Excel zeigt beim Öffnen der exportierten Liste einen Fehler zur Datenverbindung.',
  ],
  'od-anmeldung-fehlercode': [
    'OneDrive lässt mich nicht anmelden und zeigt 0x8004de85.',
    'Beim Einrichten von OneDrive kommt ein Fehlercode, der mit 0x8004de anfängt.',
    'Die Anmeldung an OneDrive bricht mit „Problem beim Herstellen der Verbindung“ ab.',
  ],
  'od-anmeldefenster-weiss': [
    'Ich klicke auf „Anmelden“ bei OneDrive und das Fenster bleibt komplett leer.',
    'Das Anmeldefenster von OneDrive ist weiß, ich kann nichts eintippen.',
    'Bei der OneDrive-Einrichtung dreht sich der Kreis, aber die Anmeldemaske kommt nie.',
  ],
  'od-bibliotheken-nach-pc-tausch': [
    'Auf dem neuen Laptop fehlen meine ganzen Teams-Ordner im Explorer.',
    'Nach dem Gerätetausch sind die synchronisierten SharePoint-Ablagen weg.',
    'Unter „SKF“ im Explorer ist auf dem neuen Rechner nichts mehr drin.',
  ],
  'od-dateityp-blockiert': [
    'Eine EXE-Datei lässt sich nicht in den Teams-Ordner hochladen.',
    'SharePoint lehnt meine Skriptdatei beim Hochladen ab.',
    'OneDrive synchronisiert eine bestimmte Dateiendung einfach nicht.',
  ],
  'od-desktop-fremde-symbole': [
    'Auf meinem Laptop erscheinen die Desktop-Symbole von meinem Büro-PC.',
    'Mein Desktop ist voller Verknüpfungen, die ich nur auf dem anderen Rechner hatte.',
    'Seit ich zwei Geräte habe, ist der Desktop auf beiden gemischt.',
  ],
  'od-synchronisierung-beenden': [
    'Ich brauche den alten Projektordner aus Teams nicht mehr auf meinem PC – wie bekomme ich ihn weg?',
    'Wie höre ich auf, eine SharePoint-Bibliothek zu synchronisieren, ohne dass etwas gelöscht wird?',
    'Ich will einen Teams-Ordner aus dem Explorer entfernen, aber nicht für die Kollegen löschen.',
  ],
  'od-sharepoint-korrelations-id': [
    'SharePoint zeigt „Leider ist ein Fehler aufgetreten“ und eine lange Nummer.',
    'Beim Öffnen der Liste kommt eine Fehlerseite mit Korrelations-ID.',
    'Unsere Teamseite bricht mit „Sorry, something went wrong“ ab.',
  ],

  // ══ Browser (office.ts) ═════════════════════════════════════════════════════
  'browser-webseite-laedt-nicht': [
    'Ich gebe eine Adresse ein und bekomme nur „Hmm, diese Seite ist nicht erreichbar“.',
    'Im Browser lädt keine Webseite, es kommt eine Zeitüberschreitung.',
    'Edge zeigt bei allen Seiten, dass die Verbindung nicht hergestellt werden konnte.',
  ],
  'browser-zertifikatsfehler-alle-seiten': [
    'Auf jeder Webseite kommt eine rote Warnung, dass die Verbindung nicht privat ist.',
    'Selbst Google und Microsoft zeigen bei mir einen Zertifikatsfehler.',
    'Der Browser warnt bei allen Seiten vor einem unsicheren Zertifikat.',
  ],
  'browser-zertifikatsfehler-eine-seite': [
    'Nur bei unserer internen Zeiterfassung kommt eine Zertifikatswarnung.',
    'Die Weboberfläche des Druckers meldet, die Seite sei nicht sicher.',
    'Bei einer Intranetseite steht „Nicht sicher“ vor der Adresse.',
  ],
  'browser-edge-langsam': [
    'Edge braucht ewig, bis eine Seite aufgeht, und reagiert zwischendurch gar nicht.',
    'Der Browser ist total träge, sogar das Tippen in der Adresszeile hängt.',
    'Edge friert ständig ein und zeigt „Keine Rückmeldung“.',
  ],
  'browser-benachrichtigungen-werbung': [
    'Unten rechts erscheinen dauernd Meldungen, mein PC sei infiziert.',
    'Ich bekomme ständig Werbefenster, obwohl ich gar nicht im Internet surfe.',
    'Irgendeine Webseite schickt mir ununterbrochen Benachrichtigungen mit Gewinnspielen.',
  ],
  'browser-startseite-umgeleitet': [
    'Beim Öffnen des Browsers kommt eine fremde Suchseite statt unserer Startseite.',
    'Meine Suchanfragen landen bei einer komischen Suchmaschine, die ich nicht kenne.',
    'Der Browser leitet mich immer wieder auf dubiose Seiten um.',
  ],
  'browser-download-blockiert': [
    'Ich will ein Programm herunterladen, aber der Browser sagt, es ist gefährlich.',
    'Der Download wird abgebrochen mit „Virus erkannt“.',
    'Edge lässt mich eine Datei nicht behalten, sie wird als unsicher markiert.',
  ],
  'browser-download-bricht-ab': [
    'Große Downloads hören mittendrin auf und zeigen „Fehler – Netzwerk“.',
    'Die Datei lädt bis zur Hälfte und dann ist Schluss.',
    'Beim Herunterladen eines Updates bricht der Browser immer wieder ab.',
  ],
  'browser-intranet-fragt-anmeldung': [
    'Bei unserer internen Seite kommt ein Fenster, das Benutzername und Kennwort will.',
    'Früher kam ich direkt ins Intranet, jetzt muss ich mich jedes Mal anmelden.',
    'Die Firmenseite fragt nach meinen Windows-Zugangsdaten.',
  ],
  'browser-m365-anmeldeschleife': [
    'Bei office.com lande ich nach der Anmeldung immer wieder auf der Anmeldeseite.',
    'Outlook im Web lädt, meldet mich ab und will mich wieder anmelden – endlos.',
    'Die Microsoft-Anmeldung im Browser springt hin und her und kommt nie an.',
  ],
  'browser-ie-modus': [
    'Unser altes Bestellportal funktioniert nur noch richtig im Internet Explorer.',
    'Eine alte Firmenanwendung zeigt in Edge nur Fehler, früher ging sie im IE.',
    'Für die alte Webanwendung brauche ich den Kompatibilitätsmodus.',
  ],
  'browser-edge-startet-nicht': [
    'Wenn ich auf Edge klicke, passiert gar nichts.',
    'Edge geht kurz auf und verschwindet sofort wieder.',
    'Ich kann keinen Browser öffnen, Edge stürzt beim Start ab.',
  ],
  'browser-weiss-rtx-desktop-manager': [
    'Nach dem Grafiktreiber-Update sind Edge und Chrome nur noch weiße Fenster.',
    'Seit dem NVIDIA-Update kann ich keine Webseite mehr sehen, alles weiß.',
    'Beide Browser zeigen keinen Inhalt mehr, seit ein neuer Treiber drauf ist.',
  ],
  'browser-chrome-profilfehler': [
    'Chrome sagt beim Start, mein Profil konnte nicht richtig geladen werden.',
    'Google Chrome geht nicht mehr auf und meldet einen Profilfehler.',
    'Beim Öffnen von Chrome kommt eine Fehlermeldung, dass Einstellungen fehlen.',
  ],
  'browser-seite-falsch-dargestellt': [
    'Unsere Webanwendung sieht komisch aus, Knöpfe sind verschoben und reagieren nicht.',
    'Seit dem Update der Seite fehlen bei mir Menüs, bei Kollegen nicht.',
    'Die Seite ist kaputt dargestellt, als ob die Formatierung fehlt.',
  ],
  'browser-pdf-oeffnet-nicht': [
    'Wenn ich auf ein PDF im Browser klicke, wird es nur heruntergeladen statt angezeigt.',
    'PDF-Links öffnen sich nicht, es passiert nichts oder ein leeres Fenster.',
    'Der Browser kann keine PDFs mehr anzeigen.',
  ],
  'browser-kamera-mikro-webseite': [
    'In Webex im Browser sieht mich niemand, die Kamera bleibt schwarz.',
    'Bei Teams im Browser funktioniert mein Mikrofon nicht.',
    'Die Webseite sagt, sie hat keinen Zugriff auf Kamera und Mikrofon.',
  ],
  'browser-favoriten-kennwoerter-weg': [
    'Alle meine Lesezeichen in Edge sind verschwunden.',
    'Edge hat meine gespeicherten Passwörter vergessen.',
    'Auf dem neuen PC fehlen meine ganzen Favoriten.',
  ],
  'browser-standardbrowser-falsch': [
    'Links aus Outlook gehen plötzlich in Chrome auf statt in Edge.',
    'Seit einem Update öffnet sich bei jedem Link der falsche Browser.',
    'Ich will, dass Links aus Teams im Edge öffnen, aber es kommt immer ein anderer Browser.',
  ],
  'browser-proxy-fehler': [
    'Der Browser meldet, dass keine Verbindung zum Proxyserver besteht.',
    'Seit ich aus dem Hotel zurück bin, geht im Browser nichts – Proxy-Fehler.',
    'Edge zeigt ERR_PROXY_CONNECTION_FAILED und lädt keine Seite.',
  ],
  'browser-zscaler-sperrseite': [
    'Eine Seite, die ich für die Arbeit brauche, zeigt eine Zscaler-Sperrseite.',
    'Beim Lieferantenportal kommt ein Hinweis, die Website ist gesperrt.',
    'Ich komme auf eine Webseite nicht drauf, es erscheint ein Blockiert-Bildschirm.',
  ],
  'browser-zscaler-anmeldung': [
    'Bevor ich ins Internet komme, will Zscaler eine Anmeldung im Browser.',
    'Bei jedem Start kommt eine Zscaler-Anmeldeseite statt meiner Startseite.',
    'Ohne Zscaler-Login lädt im Browser keine externe Seite.',
  ],
  'browser-dns-fehler': [
    'Der Browser sagt, die Adresse des Servers konnte nicht gefunden werden.',
    'Ich bekomme DNS_PROBE_FINISHED_NXDOMAIN bei Seiten, die eigentlich existieren.',
    'Webseiten werden nicht gefunden, obwohl die Adresse richtig geschrieben ist.',
  ],
  'browser-video-ruckelt-schwarz': [
    'Schulungsvideos im Browser stocken ständig.',
    'Bei YouTube höre ich Ton, aber das Bild bleibt schwarz.',
    'Videos im Intranet laufen total abgehackt.',
  ],
  'browser-kein-ton': [
    'Videos im Browser laufen, aber ich höre nichts.',
    'Bei Webseiten kommt kein Ton aus dem Headset, in anderen Programmen schon.',
    'Im Browser ist alles stumm, obwohl die Lautstärke aufgedreht ist.',
  ],
  'browser-drucken': [
    'Wenn ich im Browser auf Drucken klicke, bleibt die Vorschau leer.',
    'Die Druckvorschau in Edge lädt endlos und es kommt nichts aus dem Drucker.',
    'Aus dem Browser kann ich nichts mehr ausdrucken.',
  ],
  'browser-firmen-erweiterung-fehlt': [
    'Die Erweiterung, die alle Kollegen im Browser haben, fehlt bei mir.',
    'Unser Firmen-Add-on ist im Browser ausgegraut.',
    'Das Plugin für die Anmeldung ist aus Chrome verschwunden.',
  ],
  'browser-von-organisation-verwaltet': [
    'Ich kann im Browser die Startseite nicht ändern, da steht „von Ihrer Organisation verwaltet“.',
    'Manche Einstellungen in Edge sind grau und lassen sich nicht anklicken.',
    'Der Browser sagt, er wird von meiner Firma verwaltet – was bedeutet das?',
  ],
  'browser-sap-fiori': [
    'Das SAP-Launchpad im Browser bleibt leer.',
    'Fiori fragt ständig nach meinem Passwort, obwohl ich angemeldet bin.',
    'SAP im Browser lädt nicht, im SAP GUI geht es.',
  ],
  'browser-sitzung-abgelaufen-cookies': [
    'Im Lieferantenportal fliege ich alle paar Minuten raus.',
    'Die Schulungsplattform sagt ständig, meine Sitzung sei abgelaufen.',
    'Eine Webseite meckert, dass Cookies blockiert werden.',
  ],
  'browser-edge-update-fehler': [
    'Edge will sich aktualisieren, bricht aber mit einem Fehler ab.',
    'Unter „Info zu Microsoft Edge“ steht eine Fehlermeldung beim Suchen nach Updates.',
    'Mein Edge ist uralt und aktualisiert sich nicht.',
  ],
  'browser-chrome-veraltet': [
    'Chrome meldet, dass es nicht mehr aktuell ist.',
    'Ich brauche Chrome für ein Portal, aber es ist auf meinem PC nicht drauf.',
    'Eine Webseite sagt, meine Chrome-Version ist zu alt.',
  ],
  'browser-interne-seite-nicht-erreichbar': [
    'Google geht, aber unser Intranet lädt nicht.',
    'Im Homeoffice komme ich auf keine interne Webseite.',
    'Externe Seiten funktionieren, die Firmenportale nicht.',
  ],
  'browser-firefox-zertifikat': [
    'In Firefox kommt bei jeder Seite eine Sicherheitswarnung, in Edge nicht.',
    'Firefox meldet SEC_ERROR_UNKNOWN_ISSUER bei Seiten, die sonst gehen.',
    'Nur mein Firefox hat Probleme mit Zertifikaten.',
  ],
  'browser-smartscreen-seite-unsicher': [
    'Beim Klick auf einen Link aus einer Mail kam ein roter Bildschirm mit Warnung.',
    'Edge sagt, die Seite wurde als unsicher gemeldet.',
    'Ich habe eine Phishing-Warnung bekommen, als ich einen Link geöffnet habe.',
  ],
  'browser-popup-blocker-anwendung': [
    'Im Portal klicke ich auf „Bericht anzeigen“ und es öffnet sich kein Fenster.',
    'Die Webanwendung will ein neues Fenster öffnen, aber nichts passiert.',
    'In der Adresszeile erscheint ein Symbol, dass ein Pop-up blockiert wurde.',
  ],
  'browser-edge-laeuft-im-hintergrund': [
    'Ich habe Edge geschlossen, aber im Task-Manager laufen noch viele Edge-Prozesse.',
    'Edge beendet sich nie richtig, auch wenn alle Fenster zu sind.',
    'Obwohl der Browser zu ist, frisst Edge Arbeitsspeicher.',
  ],

  // ══ Browser (office2.ts) ════════════════════════════════════════════════════
  'web-edge-falsches-profil': [
    'Links aus Teams gehen in meinem privaten Edge auf statt im Firmenprofil.',
    'Ich habe zwei Profile in Edge und es wird immer das falsche benutzt.',
    'Klicke ich auf einen Link in Outlook, bin ich in Edge plötzlich nicht angemeldet.',
  ],
  'web-edge-sync-angehalten': [
    'Bei meinem Profilbild in Edge ist ein gelbes Ausrufezeichen, Synchronisierung pausiert.',
    'Edge will, dass ich mich erneut anmelde, damit Favoriten synchronisiert werden.',
    'Meine Favoriten gleichen sich zwischen Laptop und PC nicht mehr ab.',
  ],
  'web-intranet-startseite-fehlt': [
    'Edge startet mit MSN statt mit unserem Intranet.',
    'Früher kam beim Öffnen des Browsers die Firmenstartseite, jetzt nur ein neuer Tab.',
    'Auf dem neuen Laptop öffnet Edge nicht die Intranetseite.',
  ],
  'web-kennwort-speichern-fehlt': [
    'Edge fragt nicht mehr, ob ich mein Passwort speichern möchte.',
    'Die Abfrage zum Kennwort-Speichern kommt bei keiner Seite mehr.',
    'Bei einer bestimmten Seite merkt sich Edge das Kennwort nicht.',
  ],
  'web-alte-weboberflaeche-tls': [
    'Die Weboberfläche unserer USV lässt sich im Browser nicht mehr öffnen.',
    'Bei der Maschinensteuerung kommt ERR_SSL_VERSION_OR_CIPHER_MISMATCH.',
    'Das alte Gerät im Netz unterstützt angeblich kein sicheres Protokoll.',
  ],
  'web-http-wird-https': [
    'Ich tippe http ein und Edge macht daraus automatisch https, dann geht die Seite nicht.',
    'Die interne Seite ist nur per http erreichbar, Edge leitet aber immer um.',
    'Das Gerät im Netz kann kein https, der Browser erzwingt es aber.',
  ],
  'web-captcha-zscaler': [
    'Google zeigt mir bei jeder Suche „Ich bin kein Roboter“.',
    'Ich muss auf vielen Seiten ständig Bilder mit Ampeln anklicken.',
    'Es heißt, von meinem Netzwerk kommt ungewöhnlicher Datenverkehr.',
  ],
  'web-falsches-land-sprache': [
    'Google ist bei mir plötzlich auf Schwedisch.',
    'Onlineshops zeigen mir die niederländische Version und andere Preise.',
    'Webseiten denken, ich bin in einem anderen Land.',
  ],
  'web-file-links-intranet': [
    'Im Intranet sind Links auf Ordner im Netzlaufwerk, die beim Anklicken nichts tun.',
    'Ein file-Link auf der SharePoint-Seite öffnet keinen Ordner.',
    'Die Verknüpfung auf den Serverordner funktioniert im Browser nicht.',
  ],
  'web-edge-profilfehler': [
    'Edge meldet beim Start „Ein Profilfehler ist aufgetreten“.',
    'Meine Einstellungen in Edge sind nach jedem Neustart wieder weg.',
    'Edge sagt, einige Funktionen sind möglicherweise nicht verfügbar.',
  ],
  'web-m365-falsches-konto': [
    'Bei office.com bin ich automatisch mit dem Konto meines Vorgängers angemeldet.',
    'SharePoint öffnet sich im Browser mit meinem privaten Microsoft-Konto.',
    'Outlook im Web zeigt das Postfach eines Kollegen.',
  ],
  'web-zertifikat-auswaehlen': [
    'Beim Öffnen einer Seite kommt ein Fenster „Zertifikat auswählen“ mit mehreren Einträgen.',
    'Ich weiß nicht, welches Zertifikat ich bei der Abfrage nehmen soll.',
    'Die Webseite will ein Zertifikat, bevor sie aufgeht.',
  ],
  'web-hallen-dashboard': [
    'Der Infobildschirm in der Halle zeigt seit Stunden denselben Stand.',
    'Das Dashboard auf dem großen Monitor meldet sich nach einiger Zeit ab.',
    'Der Bildschirm mit den Produktionszahlen geht immer aus oder friert ein.',
  ],
  'web-clickonce': [
    'Wenn ich die Anwendung aus dem Intranet starte, wird nur eine .application-Datei heruntergeladen.',
    'Das Programm, das sich früher aus dem Browser installiert hat, startet nicht mehr.',
    'Die ClickOnce-Anwendung öffnet sich nicht aus Edge.',
  ],
  'web-chrome-doppelt': [
    'Ich habe zwei Chrome-Symbole und eines davon ist uralt.',
    'Chrome aktualisiert sich nicht, weil es doppelt installiert ist.',
    'Die Chrome-Verknüpfung startet eine andere Version als die im Startmenü.',
  ],
  'web-fremder-browser-installiert': [
    'Auf meinem PC ist plötzlich ein Browser namens Wave, den ich nie installiert habe.',
    'Seit dem PDF-Konverter startet OneLaunch bei jedem Hochfahren.',
    'Oben am Bildschirm ist eine Suchleiste aufgetaucht, die ich nicht kenne.',
  ],
  'web-browser-oeffnet-bei-anmeldung': [
    'Jedes Mal nach der Anmeldung geht Edge mit einer bestimmten Seite auf.',
    'Beim Hochfahren öffnet sich automatisch eine Werbeseite.',
    'Chrome startet von allein, sobald ich mich an Windows anmelde.',
  ],
  'web-chrome-geraet-nicht-verwaltet': [
    'In Chrome heißt es, mein Gerät muss verwaltet sein, in Edge klappt die Anmeldung.',
    'Chrome zeigt AADSTS53000, wenn ich mich bei Office anmelden will.',
    'Mit Chrome komme ich nicht in SharePoint, weil das Gerät angeblich nicht zugelassen ist.',
  ],
  'web-seite-von-organisation-blockiert': [
    'Edge sagt, meine Organisation hat diese Website blockiert.',
    'Beim Aufruf einer Seite kommt ERR_BLOCKED_BY_ADMINISTRATOR.',
    'Eine Webseite ist gesperrt, aber es ist keine Zscaler-Seite.',
  ],
  'web-pdf-formular-xfa': [
    'Ein Zollformular zeigt im Browser nur „Bitte warten…“.',
    'Ich kann das PDF-Formular vom Amt nicht ausfüllen, es lädt nicht richtig.',
    'Das PDF sagt, ich brauche einen anderen PDF-Viewer.',
  ],
  'web-erweiterung-nicht-unterstuetzt': [
    'Eine Erweiterung in Chrome wurde abgeschaltet, weil sie nicht mehr unterstützt wird.',
    'Mein Add-on in Edge ist plötzlich grau und deaktiviert.',
    'Die Browser-Erweiterung, die ich täglich nutze, ist nach einem Update verschwunden.',
  ],
}
