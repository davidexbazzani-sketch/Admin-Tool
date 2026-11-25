# Terra Incognita

Entdecker-Spiel im Pausenraum (seit November 2026). Jeder Spieler ist Kapitän eines Segelschiffs mit Heimathafen
Hamburg; rundherum liegt ein per Code erzeugtes Meer, das **für alle Kollegen dasselbe** ist. Gebaut wird in drei
Stufen:

| Stufe | Inhalt | Stand |
|---|---|---|
| 1 | Entdecken, Handeln, Ausbauen, Atlas, Rätsel, Tagesfahrt, gemeinsame Karte | fertig (22.11.2026) |
| 2 | Gefechte (taktisch und „sofort auskämpfen“, Wiederholung), Piraten, Hinterhalt, Nester, Seeungeheuer, Begleitschiffe, Bündnisse, großer Gegner der Woche | fertig (23.11.2026) |
| 3 | Festungen (Bau, Ertrag, Lager, Schatzkammer, Wachschiffe), Überfälle auf Kollegen mit Schonfrist und Nebel, Vergeltung und Kopfgeld, Live-Duelle über eine Karte im Chat | fertig (23.11.2026) |

Entscheidungen des Nutzers für Stufe 2: Niederlage **hart** (geschleppt, halbe Ladung, ein Zehntel Gold, Rumpf schwer
beschädigt, Reparatur kostet), Piraten **sichtbar und aus dem Hinterhalt**, Kämpfe **kurz (2–4 Minuten)**, Bündnisse
**auf Anfrage**. Für Stufe 3: Duell-Einladung als **Karte im Chat** (wie 4 gewinnt und Brain-Duell) — ja; sichtbare
Spieltage („3 Tage nicht gespielt“ → im Nebel) — ja.

## Aufbau

| Ordner | Inhalt |
|---|---|
| `TerraIncognita.tsx`, `terra.css` | Wurzel des Raums. Farben nur als `--ti-…` unter `.ti-app`, hell über `.light .ti-app` |
| `kurzStand.ts` | kleine Auskunft für die Kachel im Pausenraum (eigenes Mini-Paket, lädt das Spiel nicht) |
| `kern/` | reine Spiellogik ohne React. Hängt nur von ihren Eingaben ab: kein Zufall ohne Startwert, keine Uhr |
| `kampf/` | Seegefecht (Stufe 2): `regeln.ts` (Feld, Fahrt, Breitseiten, Munition, Entern, Ungeheuer), `ki.ts` (Steuerung), `kampf.ts` (Ablauf, Nachspielen), `gegner.ts` (Piraten, Nester, Ungeheuer, großer Gegner); Stufe 3: `duell.ts` (Live-Duell als Dateifolge). Dieselben strengen Regeln wie `kern/` |
| `kern/festung.ts` | Stufe 3: Festung (Ertrag, Bau, Reparatur, Abholen), Belagerung, Berichte und ihre Reihenfolge (`werteAus` — dieselbe Rechnung für Angreifer und Verteidiger) |
| `netz/festungen.ts`, `netz/duell.ts` | Stufe 3 auf dem Netzlaufwerk: Inselanspruch, Angriffsberichte, Verbuchen; Duell-Dateien, Fristen, Einsatz. `netz/duellAntwort.ts`: Ablehnen direkt aus der Chat-Karte |
| `inhalt/` | Texte und Listen: Ereignisse, Naturwunder, Tiere, Kuriositäten, Offiziere, Legende |
| `karte/` | Zeichnen auf Canvas (Kacheln je Abschnitt mit Zwischenspeicher, Nebel, Zeichen) |
| `netz/` | gemeinsame Welt auf dem Netzlaufwerk: Schleuse, Hülle (Siegel), Abgleich |
| `ton/` | erzeugter Klang (Web Audio), keine Tondateien |
| `ansicht/` | Oberfläche: Kartentisch, Hafen, Blätter, Atlas, Rätsel, Tagesfahrt, Kapitäne, Einstellungen |
| `speicher.ts`, `zeit.ts` | Spielstand im Arbeitsspeicher und auf der Platte; Kalendertag in Berliner Zeit |

Außerhalb dieses Ordners: Menüeintrag (`utils/menuCatalog.ts`, `types.ts`, `Sidebar.tsx`, `App.tsx` mit `lazy`),
Kachel (`screens/Pausenraum.tsx`), lokale verschlüsselte Ablage (`electron/brainSpeicher.ts`: `terra`, `terraKarte`),
vier Netz-Funktionen (`electron/networkStorage.ts`: `createExclusiveAsync`, `readJsonStatusAsync`, `listDirStatusAsync`,
`deleteEmptyDirAsync` — die letzten beiden kamen mit Stufe 3), Bilder
(`public/terra/bilder/`, erzeugt mit `scripts/terra-bilder.cjs`, nicht im Repo).

## Was eingefroren ist — nie ändern, sobald jemand spielt

Taufnamen hängen an Feldern und Inselschlüsseln. Verschiebt sich die Welt, passen sie nicht mehr.

- **Die Welt** (`kern/streu.ts`, `welt.ts`, `gebiete.ts`, `hex.ts`): Startwert `WELT_SAAT = 130458`, nur Ganzzahlen,
  eigene Streuung je Feld. Prüfsumme über 200 Abschnitte: **1936389723**.
- **Was aus der Welt abgeleitet wird** (Gebiet und Stufe je Ort, Inselschlüssel, Ortsnamen, Art jedes Naturwunders,
  Märkte, Offiziere): Prüfsumme **3161979827**. Achtung: Die Listen `WUNDER`, `WAREN` und `OFFIZIERE` werden per
  „Streuwert modulo Länge“ zugeordnet — wer sie verlängert oder umsortiert, verschiebt alles. Neue Einträge brauchen
  deshalb einen eigenen Weg (z. B. eine zweite Liste für neue Gebiete), nicht das Anhängen an die alte.
- **Die Tagesaufgaben** je Fassung: Prüfsumme der Fassung 1: **3419173218**. Ändert sich, wie Aufgaben erzeugt werden,
  muss `TAGES_FASSUNG` (`kern/tagesfahrt.ts`) steigen — die neue Fassung bekommt dann ihre eigene Rangliste.
- **Dateiformate der gemeinsamen Welt**: Jede Datei trägt die Version des Schreibers (`pv`) und die älteste Version, die
  sie verstehen darf (`ab`). Stufe 2 und 3 bringen **neue Dateiarten** statt neuer Pflichtfelder, damit ältere
  Installationen weiterlaufen.

Die drei Prüfsummen stehen als Tests in `.tmp-test/terra/kern_test.ts` (Ordner nicht im Repo — deshalb stehen die
Zahlen auch hier). Nicht eingefroren sind Spielregeln (Preise, Lohn, Reichweiten, Regeln der Legende).

## Spielstand

- **Lokal und verschlüsselt** (`%APPDATA%\IT Admin Tool\terra\`, Electron safeStorage = Windows-DPAPI): `.ti` der
  Spielstand, `.tk` die aufgedeckte Karte. Gespielt wird ausschließlich damit; das Spiel wartet nie aufs Netz.
- Es läuft immer nur ein Schreibvorgang (im Renderer und noch einmal im Hauptprozess).
- **Nie überschreiben, was sich nicht lesen ließ**: Eine unlesbare Datei wird beiseitegelegt (`….defekt-<Zeit>`).
  Wird eine Sicherung übernommen, bleibt der bisherige Stand als `….alt-<Zeit>` liegen (je drei jüngste).
- Ein Stand aus einer neueren Tool-Version wird nicht geöffnet.
- **Sicherung** auf dem Netzlaufwerk (`terra/sicherung/<benutzer>.<a|b>.json`, AES-GCM, zwei Generationen): beim
  Einlaufen in einen Hafen, höchstens alle zehn Minuten. Ein Platz mit unklarem Inhalt wird nie angefasst.

## Gemeinsame Welt (Ordner `terra/` im Tool-Verzeichnis des Netzlaufwerks)

| Pfad | Inhalt | Regel |
|---|---|---|
| `kapitaene/<benutzer>.lage.<nr>.json` | Name, Schiff, Rang, Zahlen für die Ranglisten | jeder schreibt nur seine eigenen |
| `kapitaene/<benutzer>.stamm.<nr>.json` | das „Buch“: letzte Taufen, Flaschenpost, Geschenke, Quittungen | Nummer exklusiv angelegt |
| `funde/s<q/32>_<r/32>/<ort>.json` | wer einen Ort zuerst gemeldet hat | exklusiv angelegt — der Dateiserver entscheidet |
| `tage/f<Fassung>/<tag>/<benutzer>.json` | Ergebnis der Tagesfahrt | einmal geschrieben |
| `sicherung/<benutzer>.<a|b>.json` | verschlüsselte Sicherung | nur der Besitzer |
| `aufsicht.json` | ausgeblendete Taufnamen und Flaschenpost | Masteradmin |
| `buende/<kennung>.json` | Gründungsurkunde eines Bündnisses (Stufe 2) | exklusiv angelegt — ein Name, ein Gründer |
| `gross/w<woche>.json` | „bezwungen“ samt den Beiträgen aller, wie sie der Anlegende sah (Stufe 2) | exklusiv angelegt — genau einer je Woche |
| `festungen/<q>_<r>.json` | Anspruch auf eine Insel (Stufe 3) | exklusiv angelegt — eine Festung je Insel; wer aufgibt, löscht ihn |
| `angriffe/<verteidiger>/<n>.json` | Angriffsbericht Nr. n: Ausgang, Grundlage, Beute, Schaden, Kampfakte (Stufe 3) | exklusiv angelegt — der Dateiserver bestimmt die Reihenfolge |
| `angriffe/<verteidiger>/b_<angreifer>.json` | „wird gerade belagert“ (nur ein Hinweis) | schreibt der Angreifer; alte räumt der Verteidiger weg |
| `duelle/<kennung>/z<n>.json` | Live-Duell: z0 Einladung, z1 Antwort, ab z2 je ein Zug (Stufe 3) | exklusiv angelegt — wer zuerst schreibt, gilt |

Stufe 2 in den bestehenden Dateien (keine Pflichtfelder, ältere Tools lesen darüber hinweg): Die Lage trägt `b`
(Bündnis: Gründer mit Mitgliederliste, Mitglied oder Antrag), `gr`/`gp` (Beitrag zum großen Gegner diese und vorige
Woche) und `kz` (Siege); das Buch (stamm) trägt `gb` (Wochen, deren Anteil ausgezahlt ist — das Buch gilt, ein
zurückgespielter Stand bekommt nichts doppelt).
- **Bündnis**: Mitglied ist nur, wer selbst „Mitglied“ sagt UND in der Liste des Gründers steht; ein Gründer zählt nur
  mit Urkunde. Eine Ablehnung bleibt stehen, bis der Antragsteller sie gesehen hat — danach darf er es noch einmal
  versuchen. Gründer gehen nicht über (wer gründet, kann auflösen; eine Übergabe gibt es noch nicht).
- **Großer Gegner**: Jeder bringt bei seinem ersten Angriff der Woche seinen Anteil am Lebensbalken mit
  (`grossAnteil`, je Schiff so viel, wie es in etwa fünf Angriffen anrichtet). Ist der Balken leer, legt der Erste den
  „bezwungen“-Vermerk exklusiv an; danach rechnen alle ihren Anteil aus der Liste im Vermerk (25 Gold je Punkt
  Lebensbalken, nach Anteil am Schaden). Entkommt er, gibt es nach der Woche zwei Fünftel.

Stufe 3 in den bestehenden Dateien: Die Lage trägt `fe` (das Bild der Festung: Bauten, Schaden, Lager, verbuchte
Berichte `g`, letzter gezählter Überfall `lz`, Schutz bis `sb`) und `kg` (Kopfgeld auf diesen Kapitän); das Buch trägt `dz`
(verbuchte Duelle, die Gold bewegt haben: ±), `do` (offene Duelle samt Pfand) und `fz` (zugestellte Angriffsberichte mit
verbuchter Beute). Was nur ein Spiel betrifft (`gb`, `dz`, `do`, `fz`), zieht nur ein älterer Stand DESSELBEN Spiels nach —
ein Neuanfang zahlt keine alten Einsätze. Dateien dieses Tools tragen Version 2 (`PV`); liest ein Tool sein eigenes Buch mit
höherer Version, weiß es, dass auf einem anderen PC ein neueres läuft, und veröffentlicht nichts mehr. Die Lage wird auch
ohne sichtbare Änderung höchstens alle fünf Minuten neu geschrieben, wenn weitergespielt wurde (am Zugzähler erkennt ein
zweiter PC desselben Spielers, dass er nicht mehr maßgeblich ist).
- **Festung, freiwillig:** Angreifen kann nur, wer selbst eine Festung hat; angegriffen werden nur Festungen, nie ein
  Schiff. Wer drei Tage nicht gespielt hat (Lage-Tag), liegt im Nebel. Neue Festung: drei Tage im Bau geschützt.
- **Überfälle, Reihenfolge:** Vor dem Angriff liest der Angreifer frisch alle Berichte über der verbuchten Nummer und hält
  seine Grundlage (`basis`) fest. Nach einem Sieg legt er die nächste Nummer exklusiv an. Ein Sieg zählt nur, wenn die
  Festung an dem Tag nicht geschützt war UND seit seiner Grundlage kein anderer Sieg gezählt hat — sonst gilt er als Übung
  (keine Beute, Schiff wieder heil). Niederlage, Flucht, Rückzug gelten sofort (wie gegen Piraten), der Bericht dient dem
  Verteidiger zur Kenntnis. Stürzt der Angreifer zwischen Schreiben und Verbuchen ab, erkennt er seinen Bericht wieder.
- **Verbuchen (Verteidiger):** der Reihe nach, jeder Bericht einmal (`gebucht`); der Kampf in der Akte wird nachgerechnet —
  passt der Ausgang nicht, zählt der Bericht nicht. Ein zurückgespielter Stand verbucht die noch liegenden Berichte erneut
  (die letzten 20 bleiben liegen). Schonfrist: der Tag des Überfalls und der nächste. Vergeltung: 7 Tage Belohnung der
  Admiralität; Kopfgeld auf den Plünderer: ein Viertel des Beutewerts, 7 Tage — es wird nur EINMAL ausgezahlt (ein
  zählender, noch unverbuchter Überfall mit Kopfgeld lässt den nächsten leer ausgehen), beim Verbuchen geht nur der
  kassierte Teil ab. Berichtsnummern mehr als 500 über dem Verbuchten übergeht jeder (untergeschobene Riesen-Nummern).
- **Lager zu, solange nicht alles verbucht ist:** Abholen und Ausbessern erst, wenn alle Berichte SICHER gelesen und
  verbucht sind (das Verzeichnis wird über `listDirStatusAsync` gelesen — ein Laufwerksfehler sieht nie wie „keine
  Berichte“ aus) und keine Belagerung von heute anliegt (Hinweis `b_<angreifer>.json`, im Festungsraum zu sehen).
- **Beute genau einmal:** Zugestellte Berichte stehen im Buch (`fz`); ein zurückgespielter Stand mit demselben offenen
  Bericht schließt ihn ab, ohne noch einmal auszuzahlen. Ein Bericht, der sich dauerhaft nicht zustellen lässt, kann ab
  dem nächsten Tag im Festungsraum verworfen werden (ein Sieg gilt dann als Übung).
- **Inselanspruch:** Gehört er beim Abgleich nicht mehr dem Besitzer der Festung (ein älterer Stand nach dem Aufgeben),
  gilt der Anspruch — diese Festung steht nicht mehr; fehlt er, wird er neu angelegt. Ein fremder Anspruch ist verwaist
  (und darf ersetzt werden), wenn sein Besitzer seither veröffentlicht hat, dort keine Festung mehr zeigt und der Anspruch
  älter als einen Tag ist. Aufgeben löscht nur den eigenen Anspruch.
- **Duell:** eine Folge exklusiv angelegter Dateien, je Zug genau eine (vom Beginn bis zum Ende des eigenen Zugs; steuert
  die Mannschaft das andere Schiff, ist der nächste Zug die nächste Datei). Jede Datei nennt ihr Duell (`d`) — eine
  hierher kopierte gilt nicht. Jeder PC rechnet daraus denselben Kampf (Prüfsumme je Zug — weicht sie ab, schreibt dieser PC
  den Abbruch an die erste freie Stelle: unentschieden). Duelle gibt es nur zwischen gleicher Fassung: `duellFassung()` =
  Regel × 1 000 000 + Fingerabdruck der Kampfrechnung (zwei feste Probegefechte) — zwei „1.0.0“, die verschieden rechnen,
  kommen gar nicht erst zusammen (Absage mit Grund). Fristen: Wer noch nie selbst gezogen hat, ist nach 3 Minuten „nicht
  angetreten“ (`fern`: kein Gefecht, kein Einsatz) — die Mannschaft kämpft nie für einen, der das Duell nicht gesehen hat;
  danach überlässt nach 90 s der andere den Zug der Mannschaft (beim zweiten Mal in Folge für den Rest). Aufgabe,
  Ablehnen, Zurückziehen (Einladung gilt 10 Minuten — gemessen an der Zeit der Einladung —, nur am selben Tag), Verfall
  nach zwei Tagen (auch „gestört“).
- **Einsatz als Pfand:** Er geht beim Einladen bzw. Annehmen aus der Kasse — vor dem Schreiben der Datei, und der Stand ist
  dann gesichert. Am Ende: doppelt an den Sieger, nichts an den Verlierer, zurück bei Unentschieden, Abbruch, Ablehnung,
  Rückzug, Verfall, „nicht angetreten“. Ein zurückgespielter Stand übernimmt offene Duelle samt Pfand (`do`) und zahlt einen
  verlorenen Einsatz nach (`dz`). Duelle beschädigen kein Schiff. Der Einladende räumt die Dateien eines Duells weg, wenn
  es entschieden ist, die Frist um ist und der Gegner es verbucht hat (oder es um nichts ging, oder nach einem Monat).
- **Nach „Im Hintergrund warten“** bleibt die eigene Einladung im Blick (alle 10–20 s, nur bei offenem Raum): Nimmt der
  andere an, kommt das Gefecht auf den Bildschirm; nach zehn Minuten wird sie zurückgezogen.
- Die Nummer steht im Dateinamen: Ein Abgleich ist ein Blick ins Verzeichnis; gelesen wird nur Neues.
- Jede Datei ist versiegelt (HMAC über Art, Benutzer, Nummer, Versionen, Inhalt). Das Siegel muss zum Dateinamen
  passen; Fund-Dateien tragen zusätzlich ihren Ort im Inhalt. Verworfenes wird gemerkt und übergangen — eine
  untergeschobene Datei mit hoher Nummer verdeckt die echte nicht. (Kein Schutz gegen jemanden, der den Quelltext kennt.)
- **Geschenke**: nummeriert im Buch des Absenders, mit laufender Summe; der Empfänger verbucht alles über seiner
  höchsten Nummer und quittiert im eigenen Buch. **Das Buch gilt**: Bevor ein PC verbucht oder veröffentlicht, muss er
  die neueste Fassung seines eigenen Buchs kennen. Ein zurückgespielter Stand wird nachgezogen (nichts doppelt, nichts
  kommt zurück); ein neu begonnenes Spiel übernimmt nur die Nummern.
- **Zwei PCs desselben Benutzers**: Ist ein anderes Gerät weiter, veröffentlicht und verbucht dieser PC nichts, bis der
  Spieler in den Einstellungen entscheidet (Sicherung übernehmen oder bewusst hier weiterspielen).
- Öffentlich sind nur Kalendertage, nie Uhrzeiten. Wann jemand zuletzt gespielt hat, wird nicht angezeigt — nur, ob
  eine Festung „im Nebel“ liegt (drei Tage nicht gespielt; vom Nutzer so freigegeben).

## Damit das Tool nicht langsamer wird

- Das Spiel ist ein eigenes Teilpaket (`lazy`), rund 440 KB (gzip etwa 150 KB); vor dem Öffnen der Kachel ist nichts
  davon geladen.
- Ist der Raum zu, läuft nichts: keine Abfragen, keine Zeitgeber, kein Ton, Bildspeicher freigegeben.
- **Schleuse** (`netz/schleuse.ts`) für alle Netz-Zugriffe des Spiels: höchstens zwei gleichzeitig; antwortet das
  Laufwerk nicht (8 s), Pause von 30 s bis 5 min, danach genau ein Versuch. Hintergrund: Hängende Zugriffe belegen die
  wenigen Arbeitsfäden des Hauptprozesses — ohne Schleuse könnte ein totes Laufwerk das ganze Tool bremsen.
- Abgleich alle 90 s und nur bei Fenster im Vordergrund; nur die asynchronen Netz-Funktionen.
- Live-Duell: nur solange es auf dem Bildschirm ist, ein Blick ins Duell-Verzeichnis alle 3 s (Fenster im Hintergrund:
  8 s; selbst am Zug: 10 s; ein Zug wartet aufs Schreiben: 4 s); eine eigene offene Einladung im Hintergrund alle 10–20 s;
  entschieden: gar nicht mehr. Wer da ist, weiß der Chat (kein eigener Blick aufs Laufwerk). Lesen und Anlegen eines
  Duells laufen streng nacheinander. Auch die Karte im Chat geht durch die Schleuse; nur das Ablehnen direkt aus der
  Chat-Karte (ein Klick im Chat, Raum zu) nicht — dort höchstens eine Absage zugleich, nach 8 s wartet niemand mehr.
- Karte: keine Dauerschleife. Abschnitte werden einmal gezeichnet (Deckel 64 MB), neues Bild nur bei Änderung.
- Der Hauptprozess bekommt durch das Spiel keinen Zeitgeber und keinen Dienst.

## Spielregeln, die man kennen sollte

- Zeiteinheit ist die Stunde (24 h = 1 Tag Proviant). Der Wind dreht je Gebiet jeden Kalendertag.
- Proviant null → die Mannschaft bringt das Schiff in den letzten Hafen, halbe Ladung über Bord, sonst nichts.
  Hamburg füllt immer auf vier Tage auf; in jeder Hafenstadt gibt es Arbeit, solange die Kasse fast leer ist
  (kein Weg, reich zu werden) — festfahren kann man sich nirgends.
- **Der Rand der Welt** (Westen, ab 78 Feldern) hat weder Hafen noch Dorf. Bei vorsichtiger Rechnung
  (`.tmp-test/terra/reich_test.ts`) erkundet die Brigg 1 % davon, die Fregatte 19 %, das Entdeckerschiff 71 %.
- **Die Legende der Fortuna** (8 Kapitel): Jedes Kapitel liegt in bestimmten Gebieten und erst ab einer Entfernung
  (`abStufe`, Stufen zu 14 Feldern); das letzte in einem Wrack ganz draußen am Rand (Stufe 9).
- **Gefechte** (Stufe 2): Sechseck-Feld mit Radius 5, gegen den Wind keine Fahrt, Breitseite nur zur Seite (Längsfeuer
  vor Bug oder Heck: anderthalbfach), Munition Kugeln (4 Felder) / Kettenkugeln / Kartätschen (2 Felder), Entern nur
  nebeneinander (Verteidiger ein Viertel stärker), Flucht über den Rand, höchstens 12 Runden (großer Gegner 6). Ein
  Kampf ist durch Aufstellung + Befehle bestimmt: gespeichert wird nur das (Chronik, Wiederholung, laufender Kampf, der
  nach einem Schließen des Tools weitergeht).
- **Piraten** (eigene Lage über der Welt, Salz 94xx): je Revier 9×9 und Tag höchstens ein Pirat oder Ungeheuer, nie in
  der Heimatsee, nie drei Felder um eine Siedlung, keine Piraten am Rand der Welt. Wer neben einem landet, wird gestellt
  (Jolle nie). Hinterhalt: 0–6 ‰ je Schritt nach Gebiet, frühestens 60 Züge nach dem letzten. Zoll = 20 × (1 + Stufe)²,
  höchstens die halbe Kasse. Nester fest (Revier 27×27), nach 7 Tagen wieder besetzt.
- **Niederlage** (hart): ein Zehntel Gold, halbe Ladung, Rumpf auf ein Zehntel, in den letzten Hafen. Reparatur je
  Punkt (4 + Stufe) × (2 + Klasse) / 2. Hamburg flickt umsonst auf die Hälfte, wenn das Gold nicht reicht.
- **Festung** (Stufe 3): ab Bootsmann, 5.000 Gold, auf einer getauften, gemeldeten Insel außerhalb der Heimatsee, das
  Schiff davor. Ertrag in Hundertsteln Einheiten je Stunde = 4·(2+Stufe)·(100+5·Ausbau)/Preis der Ware, bis das Lager
  voll ist (Lagerhaus 48–96 Stunden Ertrag — schon das kleinste fasst zwei Tage, wie vom Nutzer gewünscht; Schatzkammer
  schützt 8–32 Stunden).
  Beute: die Hälfte dessen, was nicht in der Schatzkammer liegt — höchstens so viel der Laderaum fasst. Wehr: Mauern
  34/50/68/88/110 Rumpf, Türme 3/4/5/6/8 Kanonen (Reichweite 3), Kette −1 Runde und +1 Pfahl je Stufe, Wachschiffe
  Schoner / zwei Schoner / Brigg und Schoner. Kräfte (Mannschaft gegen Mannschaft, `stufe3_test`): Brigg nimmt den
  Grundausbau fast immer, die Fregatte den mittleren meistens und den starken etwa jedes zweite Mal; die volle Festung
  schafft ein einzelnes Schiff nie, mit zwei Begleitschiffen etwa jedes zweite Mal.
- Tempo (Test-Bot, 110 Schritte = ein Spieltag von 10–15 Minuten; vier Bots, gemessen am 23.11.2026 mit
  `spiel_test lang`): Kutter Tag 1, Schoner 10, Brigg 20, Fregatte 36, Ostindienfahrer 62. Das Entdeckerschiff
  schafft in 85 Spieltagen nur einer von vier Bots (um Tag 79) — gewollt: Rand der Welt nach rund drei Monaten.

## Tests (`.tmp-test/terra/`, nicht im Repo)

| Datei | Was | Aufruf |
|---|---|---|
| `kern_test.ts` | Raster, Welt (eingefroren), Fahrt, Handel, Spielstand | esbuild-Bündel, dann `node` |
| `spiel_test.ts` | Rätsel (lösbar), Tagesfahrt, Ereignisse, Landgang, Legende, Bot; `lang` = 10.000 Startwerte + Tempo | ebenso |
| `regel_test.cjs` | Regelprüfung für `kern/`: kein Zufall ohne Startwert, keine Uhr, keine ungenauen Rechenfunktionen | `node` |
| `reich_test.ts` | Erreichbarkeit je Schiffsklasse, Rand der Welt, Fundorte der Legende | esbuild, `node` |
| `netz_test.ts` | Schleuse und Siegel | esbuild, `node` |
| `welt_sim.ts` + `sim_klient.ts` | gemeinsame Welt mit nachgestellten Kollegen: feste Fälle und Zufallsläufe | zwei Bündel, `node` |
| `mutation.cjs` | Gegenprobe: baut Fehler ein und prüft, ob `welt_sim` sie findet (`node mutation.cjs Bündnis` = nur diese) | `node` |
| `kampf_test.ts` | Gefechte: fest bestimmt, Wiederholung = Original, endet immer, Siegquoten, Ungeheuer, ungültige Befehle | esbuild, `node` |
| `stufe2_test.ts` | Piraten auf der Karte, Hinterhalt, Spielstand 2, Niederlage/Beute/Kopfgeld, Zoll, Flucht, Werft, Bündnis-Regeln, großer Gegner | esbuild, `node` |
| `stufe3_test.ts` | Festung (Ertrag, Bau, Schutz, Belagerung, Reihenfolge der Berichte, Verbuchen), Spielstand 3, Duell (Dateifolge, Fristen, Aufgabe, Missbrauch), Kräfteverhältnis | esbuild, `node` |
| `welt_sim.ts` F16–F19 | Überfälle zweier Angreifer zugleich, Absturz, Rückspielen, Fälschungen, Nebel; Duelle mit Chat-Karte, Pfand, Frist, „für den Rest“ (der andere spielt allein weiter), nicht angetreten, Aufgabe, Ablauf, Hintergrund, Buch (`dz`/`do`), Neuanfang; Gründung um die Wette; Abholen bei Laufwerksfehler und Belagerung, Kopfgeld einmal, Riesen-Nummer, Bericht verwerfen, Beute nach Rückspielen, verwaister Inselanspruch | wie oben |
| `ui_duell.cjs` | Live-Duell mit zwei Fenstern gegen dasselbe (im Hauptprozess nachgebildete) Laufwerk | `electron` |
| `main_test.cjs` | echter Hauptprozess: Ablage, exklusiv anlegen (zwei Prozesse, 1.000 Dateien) | `electron` |
| `ui_main.cjs` + `szenen.tsx` | Oberfläche (Vite auf 5199): kachel, einstieg, karte, hafen, tafeln, leistung, raetsel, see, zwei, schmal, defekt, kampf, gefechte, buende, festung, belagerung (`&hell=1` = helles Design) | `electron … "szene=…"` |
| `alles.sh` | alles oben der Reihe nach (ohne `mutation.cjs` und `spiel_test lang`) | `bash` |
| `prod_main.cjs` | echter Build: nichts vorab geladen, Bilder da, nach Verlassen läuft nichts | `electron` |
| `bot.ts`, `bot_lauf.ts` | Bot für Tempo und „kein Festfahren“ | esbuild, `node` |

In der Claude-Shell vor jedem `electron`-Aufruf `ELECTRON_RUN_AS_NODE` entfernen.

## Noch nicht am echten Netzlaufwerk geprüft

- „Exklusiv anlegen“ ist nur verlässlich, wenn das Tool-Verzeichnis auf einem einzelnen Dateiserver liegt (kein
  gespiegeltes Laufwerk, keine Offline-Dateien). Lokal mit zwei Prozessen geprüft (beide Wege: fester Verweis und
  exklusives Öffnen); am echten Laufwerk einmal bestätigen.
- Mehrere echte Kollegen gleichzeitig (nur nachgestellt geprüft).
