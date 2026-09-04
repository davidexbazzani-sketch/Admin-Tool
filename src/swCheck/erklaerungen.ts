// ── SolidWorks-Analyse: ausführliche Erklärungen je Befund ────────────────────
// Für das „i" (Problem/Wirkung — ausführlich) und den Button „Ausführliche Erklärung"
// (was sich genau ändert, Vorteil, Nachteil, wann man es NICHT umstellen sollte).
// Gepflegtes Wissen — Grundlage sind die SOLIDWORKS-Leistungsoptionen und die realen
// SKF-Marine-Gegebenheiten (Netzablage/PDM, RDP, Defender, SMB).

export interface Erklaerung {
  wirkung: string     // ausführliches Problem + Auswirkung (ersetzt die kurze Zeile im „i")
  aenderung: string   // was sich beim Umstellen GENAU ändert
  vorteil: string
  nachteil: string
  wannNicht: string   // wann man es bewusst NICHT umstellen sollte
}

// Optionen — Schlüssel = SOLIDWORKS-Registry-Wertname (klein geschrieben).
const OPT: Record<string, Erklaerung> = {
  'verify on rebuild': {
    wirkung: 'Ist diese Option an, prüft SOLIDWORKS bei JEDEM Neuaufbau (Rebuild) jede Fläche gegen jede andere Fläche des Modells — nicht nur gegen die direkten Nachbarn. Der Aufwand wächst dadurch überproportional mit der Teilezahl; jeder Rebuild dauert um das 2- bis 10-fache länger. Da fast jede Änderung einen Rebuild auslöst, summiert sich das über den Arbeitstag stark.',
    aenderung: 'Der Wert wird von 1 (an) auf 0 (aus) gesetzt. SOLIDWORKS prüft dann nur noch benachbarte Flächen — die vom Hersteller empfohlene Standard-Arbeitsweise.',
    vorteil: 'Deutlich schnellere Rebuilds, besonders bei komplexen Teilen/Baugruppen — ohne Qualitätsverlust im normalen Konstruktionsalltag.',
    nachteil: 'Sehr seltene, exotische Geometriefehler (sich schneidende Flächen weit auseinanderliegender Bereiche) fallen erst später auf. In der Praxis kaum relevant.',
    wannNicht: 'Nur temporär anlassen, wenn gezielt eine besonders fehleranfällige Import-/Flächengeometrie geprüft wird — danach wieder ausschalten.',
  },
  'autoload components': {
    wirkung: 'Ist das aus, lädt SOLIDWORKS beim Öffnen einer Baugruppe von JEDER Komponente den vollständigen Feature-Baum samt aller Konstruktionsdaten — auch wenn man nur die Geometrie ansehen will. Über eine Netzfreigabe (PDM/Server) ist das der mit Abstand größte Zeitfresser beim Öffnen großer Baugruppen, weil pro Teil viele kleine Dateizugriffe anfallen.',
    aenderung: 'Der Wert wird auf 1 gesetzt: Komponenten werden reduziert/leichtgewichtig geladen (nur Grafikdaten). Der volle Baum kommt erst, wenn man ein Teil tatsächlich bearbeitet.',
    vorteil: 'Baugruppen öffnen viel schneller und brauchen deutlich weniger Arbeitsspeicher — der wirksamste Einzelhebel bei Netzablage.',
    nachteil: 'Zum Bearbeiten muss die Komponente kurz nachgeladen („aufgelöst") werden. Einzelne ältere Add-ins/Makros erwarten voll geladene Teile.',
    wannNicht: 'Wer nur sehr kleine Baugruppen bearbeitet oder Makros/Add-ins nutzt, die zwingend den vollen Baum brauchen, kann es aus lassen.',
  },
  'autoload sub assembly': {
    wirkung: 'Wie „Komponenten in reduzierter Darstellung laden", nur für Unterbaugruppen: Ohne diese Option wird auch jede Unterbaugruppe komplett geladen — bei tief verschachtelten Baugruppen ein spürbarer Zusatzaufwand beim Öffnen.',
    aenderung: 'Der Wert wird auf 1 gesetzt — Unterbaugruppen werden ebenfalls reduziert geladen.',
    vorteil: 'Schnelleres Öffnen und weniger Speicher bei verschachtelten Baugruppen.',
    nachteil: 'Unterbaugruppen müssen zum Bearbeiten kurz nachgeladen werden.',
    wannNicht: 'Nur belassen, wenn Unterbaugruppen fast immer sofort vollständig gebraucht werden.',
  },
  'large assembly threshold': {
    wirkung: 'Ab dieser Teilezahl schaltet SOLIDWORKS automatisch in den „Modus Große Baugruppe" (schaltet teure Anzeige-/Rechenfunktionen ab). Der Auslieferungswert 500 ist recht hoch — wer regelmäßig Baugruppen mit 200–500 Teilen öffnet, arbeitet unterhalb der Schwelle ohne diese Entlastung.',
    aenderung: 'Die Schwelle wird von 500 auf 300 gesenkt — der Modus greift also früher.',
    vorteil: 'Mittelgroße Baugruppen (300–500 Teile) laufen flüssiger, weil leistungshungrige Funktionen automatisch reduziert werden.',
    nachteil: 'Manche Anzeige-Details (z. B. bestimmte Kanten/Transparenzen) werden im Modus vereinfacht dargestellt.',
    wannNicht: 'Wer fast nur kleine Baugruppen bearbeitet und volle Anzeigequalität braucht, kann die Schwelle hoch lassen.',
  },
  'update mass properties while saving document': {
    wirkung: 'Ist das an, berechnet SOLIDWORKS bei JEDEM Speichern die Masseneigenschaften (Masse, Schwerpunkt …) der gesamten Baugruppe neu. Bei großen Baugruppen macht das jedes Speichern spürbar langsamer — und man speichert oft.',
    aenderung: 'Der Wert wird auf 0 gesetzt: Masseneigenschaften werden nur noch bei Bedarf (beim Abfragen) berechnet, nicht bei jedem Speichern.',
    vorteil: 'Schnelleres Speichern großer Baugruppen.',
    nachteil: 'Wenn ein nachgelagerter Prozess/eine Stückliste die im Dokument gespeicherte Masse ausliest, ist sie evtl. nicht auf dem letzten Stand.',
    wannNicht: 'NICHT ändern, wenn eure Stücklisten/Berechnungen die beim Speichern gespeicherte Masse zwingend aktuell brauchen — vorher mit der Konstruktion abstimmen.',
  },
  'rebuild assembly on load': {
    wirkung: 'Erzwingt bei jedem Öffnen einer Baugruppe einen kompletten Neuaufbau — auch wenn sich nichts geändert hat. Das kostet bei jedem Öffnen unnötig Zeit.',
    aenderung: 'Der Wert wird auf 0 gesetzt: SOLIDWORKS baut nur neu auf, wenn es nötig ist (Änderungen an Referenzen).',
    vorteil: 'Schnelleres Öffnen ohne überflüssigen Rebuild.',
    nachteil: 'Praktisch keiner — nötige Rebuilds laufen weiterhin automatisch.',
    wannNicht: 'Kaum ein Grund, es anzulassen.',
  },
  'resolve lightweight components': {
    wirkung: 'Hebt den Leichtbaumodus beim Öffnen wieder auf und lädt alle Komponenten voll — konterkariert damit die Beschleunigung durch das reduzierte Laden.',
    aenderung: 'Der Wert wird auf 0 gesetzt: Komponenten bleiben leichtgewichtig, bis man sie bearbeitet.',
    vorteil: 'Behält den Geschwindigkeitsvorteil des Leichtbaumodus.',
    nachteil: 'Zum Bearbeiten muss aufgelöst werden (kurzes Nachladen).',
    wannNicht: 'Nur belassen, wenn fast immer sofort alle Teile voll gebraucht werden.',
  },
  'check out-of-date lightweight components': {
    wirkung: 'Legt fest, ob beim Öffnen geprüft wird, ob leichtgewichtige Komponenten veraltet sind. Jede andere Einstellung als „Nie" löst beim Öffnen Prüfzugriffe über das Netz aus — bei Netzablage teuer.',
    aenderung: 'Der Wert wird auf 0 („Nie") gesetzt.',
    vorteil: 'Kein zusätzlicher Netzverkehr beim Öffnen.',
    nachteil: 'Veraltete Referenzen werden nicht automatisch beim Öffnen gemeldet (fallen aber spätestens beim Auflösen/Rebuild auf).',
    wannNicht: 'Wer in stark parallel bearbeiteten Projekten sofort über veraltete Referenzen informiert sein muss, kann „Immer/Nachfragen" belassen.',
  },
  'transparency quality': {
    wirkung: 'Hohe Transparenzqualität sieht schöner aus, kostet aber merklich Grafikleistung — besonders in RDP-Sitzungen (kein echter Grafikspeicher) und bei großen Baugruppen mit vielen transparenten Teilen.',
    aenderung: 'Die Qualität wird auf „niedrig" (1) gesetzt.',
    vorteil: 'Flüssigeres Drehen/Zoomen, spürbar in RDP.',
    nachteil: 'Transparente Flächen wirken etwas gröber.',
    wannNicht: 'An einem leistungsstarken lokalen Arbeitsplatz mit vielen Präsentations-/Rendering-Aufgaben kann hohe Qualität sinnvoll bleiben.',
  },
  'opengl multisample': {
    wirkung: 'Kantenglättung (Anti-Aliasing) glättet Modellkanten optisch. In RDP-Sitzungen bringt sie kaum sichtbaren Nutzen, kostet aber Grafikleistung — dort reine Kosten.',
    aenderung: 'Anti-Aliasing wird ausgeschaltet (0).',
    vorteil: 'Weniger Grafiklast, flüssigere Anzeige in RDP.',
    nachteil: 'Kanten wirken auf hochauflösenden lokalen Bildschirmen etwas „treppiger".',
    wannNicht: 'An einem lokalen Arbeitsplatz mit guter GPU und hohem Anspruch an die Darstellung kann man es anlassen.',
  },
  'use shaded preview': {
    wirkung: 'Erzeugt im Öffnen-Dialog eine schattierte 3D-Vorschau jeder markierten Datei — das kostet je Datei Rechen- und (bei Netzablage) Netzzeit.',
    aenderung: 'Die schattierte Vorschau wird abgeschaltet (0).',
    vorteil: 'Schnellerer Öffnen-Dialog, weniger Netzzugriffe.',
    nachteil: 'Keine 3D-Vorschau im Öffnen-Dialog (Dateiname/Metadaten bleiben).',
    wannNicht: 'Wer die Vorschau zum Wiedererkennen von Teilen aktiv nutzt, kann sie behalten.',
  },
  'auto curvature generation': {
    wirkung: 'Erzeugt automatisch Krümmungsdaten — bei Flächen-/Freiformmodellen rechenintensiv und selten nötig.',
    aenderung: 'Die automatische Krümmungserzeugung wird abgeschaltet (0).',
    vorteil: 'Weniger Rechenlast bei Flächenmodellen.',
    nachteil: 'Krümmungsanzeige wird erst auf Anforderung berechnet.',
    wannNicht: 'Wer ständig mit Krümmungsanalysen an Freiformflächen arbeitet, kann es anlassen.',
  },
  'use performance pipeline 2020': {
    wirkung: 'Ist das aus, läuft die alte, langsamere Grafik-Pipeline. Die neue Pipeline (ab 2020) nutzt die Grafikkarte deutlich effizienter.',
    aenderung: 'Die neue Grafik-Pipeline wird eingeschaltet (1).',
    vorteil: 'Schnellere, flüssigere 3D-Darstellung auf zertifizierten Grafikkarten.',
    nachteil: 'Auf sehr alten/nicht zertifizierten Grafiktreibern kann es selten zu Darstellungsfehlern kommen.',
    wannNicht: 'Nur aus lassen, wenn mit der neuen Pipeline nachweislich Grafikfehler auftreten (dann Treiberproblem).',
  },
  'load reference documents in memory': {
    wirkung: 'Der Hersteller empfiehlt das ausdrücklich bei Baugruppen mit vielen externen Referenzen: Referenzdokumente werden nur in den Speicher geladen, statt für jede Referenz ein eigenes Fenster samt Dateihandles zu öffnen — das spart Ressourcen und Netzzugriffe.',
    aenderung: 'Der Wert wird auf 1 gesetzt.',
    vorteil: 'Weniger offene Fenster/Handles, geringerer Netz- und Speicheraufwand bei vielen Referenzen.',
    nachteil: 'Referenzdokumente sind nicht als eigene Fenster sichtbar (Arbeitsweise ändert sich minimal).',
    wannNicht: 'Wer Referenzen bewusst in eigenen Fenstern offen halten will, kann es aus lassen.',
  },
  'use gpu silhouette edges': {
    wirkung: 'Ist das aus, berechnet die CPU die Silhouettenkanten der Darstellung statt der Grafikkarte — unnötige CPU-Last beim Drehen/Zoomen.',
    aenderung: 'Die Berechnung wird auf die Grafikkarte verlagert (1).',
    vorteil: 'Weniger CPU-Last, flüssigere Anzeige.',
    nachteil: 'Praktisch keiner auf zertifizierter Hardware.',
    wannNicht: 'Nur aus lassen, wenn die GPU nachweislich Kantenfehler produziert.',
  },
  'search web folders': {
    wirkung: 'Ist das an, sucht SOLIDWORKS externe Referenzen zusätzlich in Web-Ordnern. Hinter einem Proxy (z. B. Zscaler) läuft bei jeder nicht sofort auflösbaren Referenz ein Verbindungsversuch ins Leere, der bis zum Timeout hängt — ein klassischer, schwer greifbarer Verzögerer beim Öffnen.',
    aenderung: 'Die Web-Ordner-Suche wird abgeschaltet (0).',
    vorteil: 'Keine Timeout-Hänger mehr beim Auflösen von Referenzen.',
    nachteil: 'Referenzen, die tatsächlich in einem Web-Ordner liegen, werden nicht mehr automatisch dort gesucht (bei euch nicht der Fall).',
    wannNicht: 'Nur belassen, wenn CAD-Daten bewusst über Web-Ordner (WebDAV) eingebunden sind.',
  },
  'hide graphics card driver notifications': {
    wirkung: 'Der Wert 0xFFFFFFFF (4294967295) unterdrückt ALLE Grafiktreiber-Warnungen. SOLIDWORKS würde eigentlich melden, wenn der Grafiktreiber nicht zertifiziert ist oder Darstellungsprobleme drohen — diese wichtige Meldung erreicht den Anwender dann nie.',
    aenderung: 'Der Wert wird auf 0 gesetzt: Treiber-Warnungen werden wieder angezeigt.',
    vorteil: 'Der Anwender wird wieder gewarnt, wenn ein nicht zertifizierter/fehlerhafter Grafiktreiber Grafikprobleme verursacht — Ursachen werden früher sichtbar.',
    nachteil: 'Bei bekannt „unzertifizierter, aber funktionierender" Hardware kann eine wiederkehrende Warnung auftauchen.',
    wannNicht: 'Wenn eine Warnung bewusst dauerhaft unterdrückt werden soll (z. B. bekannter, akzeptierter Sonderfall), kann man es so lassen.',
  },
  'load envelope components lightweight': {
    wirkung: 'Hüllkomponenten (Envelopes) dienen nur als Referenz-Hülle und müssen nicht voll geladen werden. Voll geladen kosten sie unnötig Zeit und Speicher.',
    aenderung: 'Hüllkomponenten werden leichtgewichtig geladen (1).',
    vorteil: 'Weniger Ladezeit/Speicher.',
    nachteil: 'Praktisch keiner.',
    wannNicht: 'Kaum ein Grund dagegen.',
  },
}

// Maßnahmen (Defender/SMB/RDP/Energie/…) — Muster auf Titel/Fundort.
const MASS: { test: RegExp; e: Erklaerung }[] = [
  { test: /virenschutz|prozess.*ausnahme|solidworks-prozesse/i, e: {
    wirkung: 'Ohne Prozess-Ausnahmen prüft Microsoft Defender jede Aktion der SOLIDWORKS-Prozesse und jeden Zugriff auf jede Teiledatei einzeln in Echtzeit. Bei Baugruppen mit tausenden Teilen — lokal wie auf der Freigabe — ist das der spürbarste Einzelposten: Öffnen und Neuaufbau werden von Sekunden auf Minuten gebremst.',
    aenderung: 'Die SOLIDWORKS-Programme (sldworks.exe, sldworks_fs.exe, swShellFileLauncher.exe, swBoEngine.exe, swbgproc.exe, SLDIM.exe, sldToolboxUpdater.exe) werden zentral von der Defender-Echtzeitprüfung ausgenommen.',
    vorteil: 'Deutlich schnelleres Öffnen/Rebuild; die CAD-Prozesse arbeiten ohne ständige Scan-Unterbrechung.',
    nachteil: 'Die genannten Prozesse werden nicht mehr in Echtzeit gescannt — Standard-Empfehlung von Dassault, aber eine bewusste Sicherheitsausnahme.',
    wannNicht: 'Nicht selbst am Endgerät setzen — läuft zentral über das Defender-Team (Ticket). Nur nach deren Freigabe.',
  } },
  { test: /netzwerkdatei|disablescanningnetworkfiles|network files/i, e: {
    wirkung: 'Ist die Echtzeitprüfung von Netzwerkdateien aktiv, scannt Defender jede CAD-Datei auf der Freigabe bei JEDEM Lesezugriff neu. Beim Öffnen einer großen Baugruppe werden so tausende Netz-Dateizugriffe zusätzlich gescannt — der teuerste Einzelposten bei Netzablage.',
    aenderung: 'Entweder die CAD-Freigaben als Pfad ausnehmen ODER (per Richtlinie) DisableScanningNetworkFiles = true für dieses Gerät.',
    vorteil: 'CAD-Dateien auf der Freigabe werden nicht mehr bei jedem Zugriff gescannt — großer Geschwindigkeitsgewinn.',
    nachteil: 'Dateien auf den ausgenommenen Netzpfaden werden nicht mehr in Echtzeit geprüft (der Server sollte selbst geschützt sein).',
    wannNicht: 'Nur für gezielte CAD-Freigaben, nicht pauschal für alle Netzlaufwerke — und zentral über das Defender-Team.',
  } },
  { test: /portax/i, e: {
    wirkung: 'PortaX/PDM arbeitet beim Ein- und Auschecken mit sehr vielen kleinen Dateien. Ohne Ausnahme prüft Defender jede einzelne davon in Echtzeit — jeder Check-in/Check-out wird dadurch spürbar langsamer.',
    aenderung: 'Der PortaX-/PDM-Arbeitsordner (lokaler Cache und/oder Netzfreigabe) wird von der Defender-Echtzeitprüfung ausgenommen.',
    vorteil: 'Deutlich schnelleres Ein-/Auschecken und Synchronisieren.',
    nachteil: 'Der Vault-Arbeitsordner wird nicht mehr in Echtzeit gescannt.',
    wannNicht: 'Zentral über das Defender-Team; nur den tatsächlichen PortaX-Arbeitsordner ausnehmen, nichts Übergeordnetes.',
  } },
  { test: /benumeratehwbeforesw|hardwaregrafik|rdp-sitzung/i, e: {
    wirkung: 'In einer RDP-Sitzung nutzt SOLIDWORKS standardmäßig keine Hardware-Grafik, sondern rendert in Software — das ist beim 3D-Arbeiten spürbar langsam. Der Richtlinienwert bEnumerateHWBeforeSW=1 erlaubt der Sitzung, zuerst die (virtuelle) Hardware-Grafik zu nutzen.',
    aenderung: 'Der HKLM-Richtlinienwert bEnumerateHWBeforeSW wird auf 1 gesetzt (Terminal Services).',
    vorteil: 'Flüssigere 3D-Darstellung in RDP, sofern die Gegenseite GPU-Grafik anbietet.',
    nachteil: 'Es ist ein Richtlinien-Schlüssel — eine zentrale GPO kann ihn wieder überschreiben; ohne passende GPU auf dem RDP-Host bringt er nichts.',
    wannNicht: 'Auf reinen lokalen Arbeitsplätzen (ohne RDP) irrelevant. Wenn eine GPO das zentral steuert, dort ändern.',
  } },
  { test: /bandbreitendrosselung|enablebandwidththrottling/i, e: {
    wirkung: 'Die SMB-Bandbreitendrosselung des Windows-Clients begrenzt absichtlich den Durchsatz zu Netzfreigaben. Beim Öffnen großer CAD-Baugruppen über die Freigabe bremst das die vielen Dateizugriffe zusätzlich aus.',
    aenderung: 'Set-SmbClientConfiguration -EnableBandwidthThrottling $false — die Drosselung wird abgeschaltet.',
    vorteil: 'Voller SMB-Durchsatz zur Freigabe, schnelleres Laden großer Baugruppen.',
    nachteil: 'Auf sehr schmalen/geteilten Leitungen (z. B. VPN) könnte SOLIDWORKS die Leitung stärker auslasten.',
    wannNicht: 'Nicht abschalten, wenn die Drosselung bewusst zum Schutz einer schmalen WAN-/VPN-Anbindung gesetzt wurde. Wirkt erst auf neue Verbindungen (ggf. Neustart).',
  } },
  { test: /smb-cache|cachelifetime|auslieferungswert/i, e: {
    wirkung: 'Die SMB-Client-Caches (Verzeichnis-, Datei-Metadaten-, „Datei nicht gefunden"-Cache) stehen auf den Windows-Standardwerten. Für die vielen kleinen, wiederholten Metadaten-Zugriffe beim CAD-Öffnen sind diese Caches oft zu knapp bemessen.',
    aenderung: 'Die Cache-Lebensdauern werden auf CAD-taugliche Werte angehoben (mehr/kürzere Wiederholungszugriffe werden aus dem Cache bedient).',
    vorteil: 'Weniger wiederholte Metadaten-Anfragen über das Netz, spürbar beim Öffnen vieler kleiner Referenzdateien.',
    nachteil: 'Änderungen an Dateien auf der Freigabe werden vom Client minimal verzögert bemerkt (Cache-Lebensdauer).',
    wannNicht: 'Ohne definierten Zielwert nicht blind ändern — die konkreten Werte mit dem Server-/Storage-Team abstimmen.',
  } },
  { test: /smb-signierung|requiresecuritysignature|signierung erzwungen/i, e: {
    wirkung: 'Erzwungene SMB-Signierung prüft/signiert jedes SMB-Paket kryptografisch. Das erhöht die Sicherheit gegen Manipulation, kostet aber messbar Durchsatz — bei den vielen kleinen CAD-Netzzugriffen macht sich das bemerkbar.',
    aenderung: 'Set-SmbClientConfiguration -RequireSecuritySignature $false — die erzwungene Signierung wird abgeschaltet.',
    vorteil: 'Höherer SMB-Durchsatz, schnelleres Laden über die Freigabe.',
    nachteil: 'SICHERHEITS-HERABSTUFUNG: schwächt den Schutz gegen SMB-Manipulation (Man-in-the-Middle). Oft ist die Signierung per GPO/Compliance vorgeschrieben.',
    wannNicht: 'NUR nach ausdrücklicher Freigabe der IT-Sicherheit ändern — häufig per GPO erzwungen (wird dann wieder gesetzt). Im Zweifel NICHT umstellen.',
  } },
  { test: /energieplan|hoechstleistung|höchstleistung/i, e: {
    wirkung: 'Steht der Energieplan auf „Ausbalanciert" (oder Energiesparen), taktet die CPU zur Stromersparnis herunter und reagiert träger. Beim rechenintensiven CAD-Arbeiten (Rebuild, Öffnen) kostet das Leistung.',
    aenderung: 'Der aktive Energieplan wird auf „Höchstleistung" gesetzt (CPU bleibt auf hoher Taktrate).',
    vorteil: 'Konstant hohe CPU-Leistung, schnellere Rebuilds/Öffnen.',
    nachteil: 'Höherer Stromverbrauch und Wärme; auf Laptops kürzere Akkulaufzeit.',
    wannNicht: 'Auf Laptops im mobilen Akkubetrieb bewusst überlegen — dort kann „Ausbalanciert" gewollt sein. Der Altwert wird gesichert und ist wiederherstellbar.',
  } },
  { test: /tote suchpfade|dateipositionen/i, e: {
    wirkung: 'In „Extras > Systemoptionen > Dateipositionen" stehen Suchpfade, die ins Leere zeigen (gelöscht/umbenannt/nicht erreichbar). SOLIDWORKS arbeitet diese Liste bei JEDER Referenzauflösung von oben nach unten ab und wartet bei jedem toten Pfad auf den Fehlschlag — das summiert sich.',
    aenderung: 'Die toten Einträge werden aus der Dateipositionen-Liste entfernt oder korrigiert (kein automatischer 1-Klick — die Liste ist anwender-/projektspezifisch).',
    vorteil: 'Schnellere Referenzauflösung ohne Warten auf tote Pfade.',
    nachteil: 'Ein Pfad, der nur temporär nicht erreichbar ist (Netz/Berechtigung), sollte nicht vorschnell gelöscht werden.',
    wannNicht: 'Nicht löschen, wenn der Pfad nur gerade nicht erreichbar ist (z. B. Netzlaufwerk offline) — erst prüfen, ob er dauerhaft tot ist.',
  } },
  { test: /add-in.*doppelt|defektem pfad|mehrfach registriert/i, e: {
    wirkung: 'Ein Add-in ist mit doppeltem oder defektem Pfad registriert. SOLIDWORKS versucht beim Start jede Registrierung zu laden — doppelte/defekte Einträge verlängern den Start und können Fehler werfen.',
    aenderung: 'Die überzähligen/defekten Add-in-Registrierungen werden bereinigt (je DLL nur ein gültiger Eintrag).',
    vorteil: 'Schnellerer, stabilerer SOLIDWORKS-Start.',
    nachteil: 'Wird das falsche der doppelten Registrierungen entfernt, muss das Add-in ggf. neu registriert werden.',
    wannNicht: 'Nur bereinigen, wenn klar ist, welcher Eintrag der gültige ist.',
  } },
  { test: /add-ins verlaengern|start erheblich/i, e: {
    wirkung: 'Die geladenen Add-ins verlängern den SOLIDWORKS-Start deutlich. Jedes beim Start automatisch geladene Add-in kostet Zeit — nicht ständig gebrauchte Add-ins müssen nicht automatisch starten.',
    aenderung: 'Selten genutzte Add-ins werden von „beim Start laden" auf „nur bei Bedarf" umgestellt (Extras > Zusatzanwendungen).',
    vorteil: 'Schnellerer Programmstart.',
    nachteil: 'Ein nur bei Bedarf geladenes Add-in muss vor der ersten Nutzung einmal manuell aktiviert werden.',
    wannNicht: 'Add-ins, die täglich sofort gebraucht werden (z. B. PDM/PortaX, Toolbox), beim Start belassen.',
  } },
  { test: /profil in der registry sehr gross|anwenderprofil.*gross/i, e: {
    wirkung: 'Das SOLIDWORKS-Anwenderprofil in der Registry ist stark angewachsen (viele tausend Werte, z. B. „zuletzt geöffnet"-Listen, Fensterlayouts). Ein sehr großes Profil kann Start und einzelne Aktionen verlangsamen.',
    aenderung: 'Kein automatischer Fix — bei Bedarf setzt man ausgewählte Bereiche der SOLIDWORKS-Einstellungen zurück (über das SOLIDWORKS-Einstellungswerkzeug), nicht die ganze Registry.',
    vorteil: 'Schlankeres Profil, potenziell schnellerer Start.',
    nachteil: 'Ein Zurücksetzen verwirft persönliche Anpassungen (Layouts, Verknüpfungen).',
    wannNicht: 'Nicht blind zurücksetzen — vorher die Einstellungen sichern; nur bei nachweisbaren Problemen.',
  } },
  { test: /grafikzuordnung|usergpupreferences|hohe leistung/i, e: {
    wirkung: 'Windows kann pro Programm festlegen, welche Grafikkarte genutzt wird. Fehlt für sldworks.exe die Zuordnung „Hohe Leistung", läuft SOLIDWORKS auf Systemen mit zwei GPUs evtl. auf der schwächeren (integrierten) Grafik.',
    aenderung: 'Für sldworks.exe wird in den Windows-Grafikeinstellungen „Hohe Leistung" (dedizierte GPU) hinterlegt.',
    vorteil: 'SOLIDWORKS nutzt die leistungsfähige Grafikkarte.',
    nachteil: 'Auf Geräten mit nur einer GPU ohne Wirkung; minimal höherer Stromverbrauch auf Laptops.',
    wannNicht: 'Auf Single-GPU-Systemen nicht nötig.',
  } },
  { test: /speicherintegritaet|hvci|speicher-integrit/i, e: {
    wirkung: 'Die Speicher-Integrität (HVCI/Core Isolation) ist eine Sicherheitsfunktion, die Treiber in einer virtualisierten Umgebung absichert. Sie kann bei rechen-/grafikintensiven Anwendungen wie CAD eine bekannte, messbare Leistungsminderung verursachen.',
    aenderung: 'Kein Tool-Fix — HVCI ist eine bewusste Sicherheitsentscheidung. Ein Abschalten müsste zentral/über die Sicherheit erfolgen.',
    vorteil: 'Abgeschaltet: etwas mehr CPU-/Treiber-Leistung.',
    nachteil: 'SICHERHEITSFUNKTION: Abschalten schwächt den Schutz vor Treiber-/Kernel-Angriffen.',
    wannNicht: 'NICHT eigenmächtig abschalten — nur nach Abwägung mit der IT-Sicherheit. Meist bewusst aktiviert lassen.',
  } },
  { test: /autorecover-pfad|autorecover.*falsch/i, e: {
    wirkung: 'Der AutoRecover-Pfad (automatische Sicherung bei Absturz) zeigt auf einen ungültigen/nicht mehr vorhandenen Ordner. Im Ernstfall läuft die automatische Sicherung ins Leere — der Anwender merkt es erst, wenn er nach einem Absturz nichts wiederherstellen kann.',
    aenderung: 'Der AutoRecover-Pfad wird auf einen gültigen, lokal schnellen Ordner gesetzt (Extras > Systemoptionen > Sicherungen/Wiederherstellen).',
    vorteil: 'Automatische Sicherung funktioniert wieder — Datenverlust bei Absturz wird verhindert.',
    nachteil: 'Liegt der Pfad auf einer langsamen Netzfreigabe, kostet jede Sicherung Zeit — daher lokal wählen.',
    wannNicht: 'Kein Grund, einen kaputten Pfad zu belassen — nur nicht auf eine langsame Netzfreigabe legen.',
  } },
  { test: /freigabemessung.*uebersprungen|freigabemessung/i, e: {
    wirkung: 'Die Freigabemessung (Durchsatz/Latenz zur CAD-Freigabe) wurde übersprungen, weil die Diagnose-Sitzung ohne Netzzugriff lief (Doppelhop). Damit fehlt der aussagekräftigste Wert, um ein Netz-Performanceproblem zu belegen.',
    aenderung: 'Kein Einstellungs-Fix — die Messung muss im Anwenderkontext (direkt am PC angemeldet) wiederholt werden.',
    vorteil: 'Mit gültiger Messung lässt sich ein Netzproblem gegenüber Netzwerk/Storage belegen.',
    nachteil: 'Keiner — reine Diagnose-Einschränkung.',
    wannNicht: 'Kein Umstellen nötig; nur die Messung im richtigen Kontext nachholen.',
  } },
  { test: /doppelhop|nicht geprueft|netzpfade konnten nicht/i, e: {
    wirkung: 'Aus der Remote-Diagnosesitzung ist kein Netzzugriff möglich (klassischer „Doppelhop"-Effekt). Netzpfade konnten daher nicht geprüft werden — „nicht gefunden" bedeutet hier NICHT „tot", sondern nur „aus dieser Sitzung nicht sichtbar".',
    aenderung: 'Kein Fix — betroffene Netzpfade im Anwenderkontext (am PC angemeldet) gegenprüfen.',
    vorteil: '—',
    nachteil: '—',
    wannNicht: 'Keine Netzpfade allein aufgrund dieser Meldung löschen — sie sind aus der Sitzung nur unsichtbar.',
  } },
]

/** Ausführliche Erklärung zu einem Befund finden (per Registry-Name der Option ODER Titel/Fundort der Maßnahme). */
export function findeErklaerung(opts: { name?: string; titel?: string; fundort?: string }): Erklaerung | undefined {
  const n = (opts.name || '').trim().toLowerCase()
  if (n && OPT[n]) return OPT[n]
  const hay = `${opts.titel || ''} ${opts.fundort || ''}`
  for (const m of MASS) if (m.test.test(hay)) return m.e
  return undefined
}
