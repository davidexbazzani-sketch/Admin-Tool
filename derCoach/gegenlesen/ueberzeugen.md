# Gegenlesen: Bereich `ueberzeugen` („Überzeugen & Verkaufen“)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser mit drei Brillen: Verkaufstrainerin und Verhandlerin, Verbraucherschützer und Ethiker, Faktenprüfer · **Stand:** Phase Grundlagen

## Was geprüft wurde

- **Regeln:** `src/coach/inhalt/LIESMICH.md` (besonders Abschnitt 7, Einfluss-Klassen), `derCoach/08_ENTSCHEIDUNGEN.md` (geht vor: Taktik darf trainiert werden, die rote Linie wird nur erkannt und abgewehrt), `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16, Muster `ueberzeugen-1-03`), `src/coach/kern/inhaltTypen.ts`.
- **Alle Dateien in `src/coach/inhalt/ueberzeugen/`:** `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`. Dazu `besetzung.json`, die gemeinsamen Quellen (`flynn2008`, `bohns2016`, `aristoteles`, `schopenhauer`, `kahler1975`) und die früheren Berichte samt `NACHARBEIT.md`.
- **Fakten an der Quelle geprüft** (Abstract, Volltext-Auszug oder verlässliche Zusammenfassung):
  - Petrowsky u. a. 2025: 90 Studien, N = 16.334, 374 Effekte. Wer zuerst nennt, liegt vorn; ehrgeizige Angebote bringen weniger Abschlüsse und einen schlechteren subjektiven Wert. **Stimmt.**
  - Fillon u. a. 2023: 52 Experimente, N = 19.528, g = 0,44; sieben Studien mit geringem Verzerrungsrisiko, g = 0,11 [−0,18; 0,40]. **Stimmt.**
  - Feeley, Anker & Aloe 2012: Effekt auf das gesagte Ja r = 0,126, auf das Tun r = 0,052 (nicht signifikant). **Stimmt.**
  - Burger & Caputo 2015 (Low-Ball verlässlich wirksam) **stimmt.**
  - Burger 1999: frühere Meta-Analysen fanden r = 0,09 bis 0,17. Die Aussage zu „unähnlichen Bitten“ war überzogen, siehe Korrekturen.
  - Ho, Powell & Stanley 2021: Geschönte Selbstdarstellung hängt im Mittel praktisch nicht mit der Bewertung zusammen; die ehrliche hängt mit besseren Bewertungen zusammen. **Stimmt.** Peck & Levashina 2017 **stimmt.**
  - Sezer, Gino & Norton 2018: neun Studien, darunter ein Feldexperiment und eine Tagebuchstudie. **Stimmt.**
  - Grant 2013: 340 Callcenter-Kräfte, drei Monate, 24 % und 32 % laut Mitteilung der Fachgesellschaft. **Stimmt.**
  - Franke & Park 2006: 155 Stichproben, über 31.000 Verkäufer; anpassendes Verkaufen wirkt stärker als Kundenorientierung. **Stimmt.**
  - Itani, Goad & Jaramillo 2019: meta-analytisches Modell über rund 20 Jahre Forschung. **Stimmt.**
  - O'Keefe & Hoeken 2021: 1.149 Studien, 30 Varianten, Median r ≈ 0,10, Vorhersageintervalle schließen beide Richtungen ein. **Stimmt.**
  - O'Keefe & Jensen 2006/2009 (zur Rahmung) und Montoya 2017: 268 Kurven; die 81 Arbeiten habe ich nicht bestätigen können. Rains 2013: k = 20, N = 4.942. Barton u. a. 2022: 131 Studien, 416 Effekte. Curhan u. a. 2022: Pausen ab 3 Sekunden, kein Nachteil für die Gegenseite. **Stimmen.**
- **Nicht replizierte Befunde:** Priming, Ego-Depletion und Langer 1978 („weil“) kommen nicht vor. Kahneman wird mit dem ausdrücklichen Ausschluss der Priming-Befunde zitiert. Der Köder-Effekt ist mit Frederick 2014 ehrlich als wackelig markiert. Die Bohner-Hotelstudie ist als Gegenbeleg zum „Die meisten Gäste“-Kniff richtig eingesetzt.
- **Technik:** `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur ueberzeugen`. Vorher 0 Fehler und 0 Hinweise, nachher **0 Fehler und 2 Hinweise**. Die zwei Hinweise lauten „keine brauchbare Antwort“ bei `v-0077` und `v-0103`; sie sind gewollt (siehe NACHARBEIT, „Alle Bereiche“). Alle JSON-Dateien lassen sich einlesen.

## Gesamteindruck

Der Bereich ist stark. Die Haltung „entscheiden helfen statt überreden“ zieht sich durch alles. Die drei Einfluss-Klassen sind sauber umgesetzt, und die Abwehr ist für jede Taktik und jede rote Technik konkret und alltagstauglich („Was zahle ich insgesamt?“, „Es bleibt beim Nein.“, Zeitgrenze gegen Zermürben).

Der Selbstschutz als Kunde wird ungewöhnlich gut trainiert: Lage `l-04` (Handyvertrag) bündelt die Ja-Kette, den Kontrast, die erfundene Frist, die eingeredete Schuld und den Nachschlag. Dazu kommen die Kunstgriffe `v-0078` bis `v-0084`, der Spickzettel `w-123` und die Tests `fc-016` und `fc-018`.

Die Korrekturen aus `08` sind umgesetzt: „Aber du entscheidest“ steht als Haltung ohne Wirkversprechen, und bei der ersten Zahl sind die Meta-Analyse und der Preis überzogener Zahlen genannt. Der Hauptfehler war eine falsche Wirkungsaussage zur Verlust-Rahmung, dazu kleinere Unstimmigkeiten in Pfaden, Rollen und Bewertungen.

**Einfluss-Klassen im Einzelnen:**
- **Fair** (`w-020` bis `w-031`) besteht durchweg den Transparenz-Test.
- **Taktik** (`w-035` bis `w-045`): Anker, Schweigen, Kontrast, Fuß in der Tür, Tür ins Gesicht, Gegenseitigkeit, Rahmung, echte Knappheit, „Ich muss das abstimmen“, Wahl zwischen zwei Ja und Vertrautheit tragen alle `preis` und `abwehr`, und beides ist konkret und richtig.
- **Rot** (`w-050` bis `w-059`) erscheint nur in `kunstgriff`, `auswahl` und `zuordnen` zum Erkennen, als schwache Antwort mit `wert: 0` oder als Abwehr-Lage. Nie als Musterlösung, Mission oder beste Antwort.
- **Taktik-Übungen** mit Einsatz spielen nur beim privaten Verkauf (Fahrrad, Sofa, Nähmaschine), beim Autokauf, in der Kundenverhandlung und beim Vereinsangebot. Nie gegen Kollegen. `l-02`, `w-111`, `w-114` und `m-04` schließen Taktik nach oben und unter Kollegen ausdrücklich aus.
- `06`, Abschnitt 3 („Tricks nur im kunstgriff, nie als Empfehlung“) ist durch `08` abgelöst. Das Trainieren von Taktik ist dort erlaubt.

## Korrekturen (alle Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Fakten und Beleg (3)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| wissen | `ueberzeugen-w-041` (Rahmung) | Text: „Dieselbe Sache als Verlust beschreiben wirkt oft stärker als als Gewinn – Verluste wiegen etwa doppelt so schwer.“ → „Dieselbe Sache als drohenden Verlust beschreiben statt als Gewinn. Die Idee dahinter: Bei Entscheidungen wiegen Verluste etwa doppelt so schwer. Ob eine Botschaft dadurch mehr überzeugt, ist aber nicht gesichert – im Schnitt machte die Rahmung in Studien kaum einen Unterschied.“ Beleg **A → U**, `belegHinweis` neu (Verlustabneigung belegt, Rahmung von Botschaften nur sehr kleine, unzuverlässige Unterschiede). | Die Verlustabneigung bei Entscheidungen (Brown 2024) trägt keine Aussage über die Überzeugungskraft von Botschaften. Die Meta-Analysen von O'Keefe & Jensen (2006, 2009) fanden: Verlust-gerahmte Botschaften überzeugen **nicht** generell mehr, bei Vorsorge eher die Gewinn-Rahmung. O'Keefe & Hoeken 2021 (im Eintrag selbst zitiert) zählt Gewinn- und Verlust-Rahmung zu den Gestaltungswahlen mit Median r ≈ 0,10 und ohne verlässliche Richtung. Taktik-Klasse, `preis` und `abwehr` bleiben. |
| wissen | `ueberzeugen-w-038` (Fuß in der Tür), `belegHinweis` | „… die Wirkung schwindet, wenn beide Bitten nichts miteinander zu tun haben.“ → „Stärker scheint die Wirkung, wenn beide Bitten zueinander passen – die Daten dazu sind dünn.“ | Burger 1999 schreibt, die Daten zur Ähnlichkeit seien „sparse“, und hat sie ausdrücklich nicht meta-analysiert. Er empfiehlt, die zweite Bitte als Fortsetzung der ersten zu bauen. Ein „Schwinden“ ist nicht belegt; schon Freedman & Fraser fanden einen (kleineren) Effekt bei unähnlichen Bitten. |
| quellen | `burger1999` | wie oben; ergänzt um „r etwa 0,09 bis 0,17“ | an der Quelle abgeglichen |

### Didaktik und Stimmigkeit (6)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen | `ueberzeugen-l-03`, Knoten `k3`, Wahl 3 | „Ihr Schweigen hat dich 20 Euro gekostet …“ → „Ihr Schweigen hat dich Geld gekostet …“ | Über `k2`, Wahl 2, kommt man ohne Angebot von 310 zu `k3`. Dann stimmt „20 Euro“ nicht (von 350 auf 290 wären es 60). |
| lagen | `ueberzeugen-l-03`, `ende1` | „Wir machen es mit 310.“ → „Wir machen es.“ | Derselbe Pfad: Die 310 wurden dort nie genannt. |
| vorrat-02 | `ueberzeugen-v-0091`, `k2`, Wahl 2 | „… hat dich 400 Euro gekostet …“ → „… mehrere hundert Euro …“ | Über `k1b` hat man 8.700 genannt, dann sind es 300 Euro. |
| vorrat-02 | `ueberzeugen-v-0078` (Ja-Kette) | „Und Sie mögen keinen Papierkram?“ – „Nein.“ → „Und Papierkram ist Ihnen lästig, stimmt's?“ – „Ja.“ | In einer Ja-Kette, die das Wort „Ja“ lehrt, stand ein „Nein“. Das verwirrt beim Erkennen. |
| vorrat-02 | `ueberzeugen-v-0077`, Antwort 4 | `wert` 1 → **0** (Begründung unverändert) | Sachlich falsch („verstärken sich bei Fachleuten“, laut eigener Begründung nicht belegt). Regel aus NACHARBEIT „Alle Bereiche“. |
| vorrat-02 | `ueberzeugen-v-0103`, Antwort 4 | `wert` 1 → **0**; Begründung „Richtig erkannt. Unfair wird sie erst …“ → „Richtig erkannt, aber falsch bewertet: Unfair wird sie erst …“ | „immer unfair“ widerspricht der Lehre des Eintrags (die Alternativfrage ist fair, wenn der andere schon will). |

### Sprache, Besetzung, Marken (3)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| vorrat-01 | `ueberzeugen-v-0002`, Antwort 2 | „Danke fürs Angebot. Ich brauche keinen – aber frag doch Tarek, der sucht einen.“ → „… – aber ich höre mich gern um, ob jemand einen sucht.“ | Frau Sommer wird in allen anderen Antworten gesiezt. Tarek ist laut Besetzung ein Kollege, den die Nachbarin nicht kennt. |
| vorrat-02 | `ueberzeugen-v-0054`, Antwort 3 | „Rufen Sie gern bei Frau Demir an – wir betreuen ihr Büro seit vier Jahren.“ → „Rufen Sie gern bei Herrn Petersen an – wir betreuen ihn seit sechs Jahren.“ | Carla Demir ist laut Besetzung Projektleiterin (Kollegin), keine Kundin. Herr Petersen ist der langjährige Kunde; „sechs Jahre“ wie in `w-024`. |
| vorrat-02 | `ueberzeugen-v-0091`, `k3` und Wahlen 1 und 2 | „neuen TÜV“ → „Hauptuntersuchung neu machen“ / „neuer Hauptuntersuchung“ | TÜV ist eine echte Organisation bzw. Marke (Regel LIESMICH 5). |

**Summe: 12 Korrekturen** (3 Fakten/Beleg, 6 Didaktik/Stimmigkeit, 3 Sprache/Besetzung/Marke). Danach Index neu erzeugt. Prüfskript: 0 Fehler, 2 gewollte Hinweise.

## Offene Punkte (Ermessen – nicht geändert)

1. **„Drei“ oder „vier“ Fragen.** `ueberzeugen-1-02` lehrt im Aha, in der Karte und in Merkkarte m1 vier Fragen (Lage, Problem, Folgen, Wunsch). Die Regel derselben Einheit sagt „Erst drei Fragen …“, ebenso `w-070`, der Spickzettel `w-120` und die Mission `m-05`. **Empfehlung:** einheitlich „die vier Fragen“. In der Mission reicht ausdrücklich „mindestens drei“, etwa als Regel: „Erst die vier Fragen, dann zusammenfassen – dann der Vorschlag.“
2. **„Der stärkste Vertrauensbeweis: sagen, für wen dein Angebot nichts ist.“** Das steht in `1-05` (Karte, Merkkarte m2) und in `v-0052` (Auftrag). Die Einheit trägt Beleg A (zweiseitige Botschaften), der Superlativ ist aber Praxiswissen. **Empfehlung:** „ein starker Vertrauensbeweis“.
3. **Zweiseitige Botschaften als A.** Das stimmt in der Richtung (Allen 1991, O'Keefe 1999). O'Keefe & Hoeken 2021 zählen „einseitig gegen zweiseitig“ aber zu den kleinen, im Einzelfall unsicheren Unterschieden. **Empfehlung:** im `belegHinweis` von `w-006`, `w-023` und `1-05` ergänzen: „Der Unterschied ist im Schnitt klein.“
4. **Nachahmen: fair, Taktik oder rot?** `w-031` („Spiegeln“, Worte wiederholen) gilt als fair. `w-059` („Gespielte Nähe“) zählt dagegen auch das „absichtliche Nachahmen von Haltung und Worten“ zur roten Linie. Erfundene Gemeinsamkeiten und vorgetäuschtes Interesse sind klar rot. Bloßes Nachahmen ist keine Lüge, eher Taktik oder Unsinn. **Empfehlung:** In `w-059` die rote Linie auf „Gemeinsamkeit erfinden, Interesse vortäuschen“ begrenzen. Das Nachahmen der Haltung gehört zum Mythos `w-086`.
5. **Mythos `w-086`** („Spiegle die Körpersprache, dann mag man dich“, Urteil `falsch`): Die zitierte Quelle (Maddux 2008) misst Verhandlungsergebnisse, nicht das Gemögtwerden, und der Text räumt selbst „Vorteile“ ein. Zur Verbindung von Nachahmen und Sympathie gibt es Befunde, aber auch Fehlschläge beim Wiederholen. **Empfehlung:** Urteil `teils`, Text: „Ein kleiner Effekt ist möglich, aber wackelig – und wer es merkt, fühlt sich gespielt.“
6. **`v-0076`** („Welcher Satz überschreitet die rote Linie?“): Die Antwort mit `wert: 1` („Viele Kunden nehmen dieses Paket – ohne zu wissen, ob es stimmt“) ist ebenfalls eine erfundene Tatsache, also auch rot. **Empfehlung:** die Antwort eindeutig machen, etwa „… – und es stimmt“ mit `wert: 0` und der Begründung „Wahre Bewährtheit: Taktik, keine rote Linie“.
7. **`v-0088`** (Rangfolge der Vorbereitung auf den Autokauf): Die Reihenfolge Rahmen → Alternative → erste Zahl → Zeitgrenze ist plausibel, aber nicht zwingend. Die Zeitgrenze kann genauso gut früher stehen. **Empfehlung:** als `auswahl` („Was fehlt in deiner Vorbereitung?“) oder als `zuordnen` umbauen.
8. **`v-0084`** (Wasserrohrbruch): Die Abwehr ist richtig. Für den Verbraucherschutz fehlt aber der wichtigste erste Schritt: **den Haupthahn selbst zudrehen** und die Versicherung anrufen (viele haben einen eigenen Notdienst). **Empfehlung:** einen Satz in `erklaerung` und in `w-058` (`abwehr`) ergänzen.
9. **Tests, die Übungen fast gleichen** (das Prüfskript erkennt sie nicht):
   - `fc-024` ≈ `v-0003` (Begründung wörtlich gleich)
   - `fc-023` ≈ `1-07-b` und `v-0075` (Preis zuerst nennen)
   - `fc-018` ≈ `v-0080` (gleiche Prüffrage „Hätte ich … gleich …?“)
   - `fc-006` ≈ `1-02-c`
   - `fc-014` ≈ `v-0055`
   - `fc-016` ≈ `1-07-c`
   - `fc-005` ≈ `l-01` k2
   - `fc-013` ≈ `1-05-b`

   **Empfehlung:** Für mindestens `fc-024`, `fc-023`, `fc-018` und `fc-006` neue Lagen mit gleichem Lernziel schreiben.
10. **`v-0045`, Antwort 4** („Na ja, irgendwer musste es ja machen“, `wert: 1`): Die Antwort weicht aus und lässt die Helfer unerwähnt. **Empfehlung:** `wert: 0` oder durch eine echte Teilantwort ersetzen („Den größten Teil ja.“).
11. **`v-0077`** trägt `einfluss: "taktik"`, ist aber eine reine Wissensfrage über die Forschung. Nach LIESMICH 7 gehört dort kein `einfluss` hin. Ebenso `v-0076` (`rot`, reines Erkennen ist aber erlaubt). Nur zur Kenntnis.
12. **`w-003`, `belegHinweis`** „Stichproben aus den USA“: Das konnte ich nicht bestätigen. Franke & Park nennen 155 Stichproben, die Herkunft fand ich nicht. **Empfehlung:** streichen oder am Volltext prüfen.
13. **Quellen mit `geprueft: false`:** `fisherury`, `voss2016`, `carnegie1936`, `kahneman2011`, `brehm1966`, `goffman1955`, `pink2012`, `praxis-ueberzeugen`, dazu das gemeinsame `kahler1975`. Sie werden nur ohne Zahlen benutzt; das ist regelkonform. **Empfehlung:** Angaben einmal nachschlagen. Montoya 2017 („81 Arbeiten“) bitte noch einmal am Volltext bestätigen.
14. **Prüfskript:** `kern`, `einleitung` und `ziel` sind hier frei von „du musst“ (von Hand geprüft).

## Didaktik – Einzelurteil der Einheiten

| Einheit | Dauer realistisch | Aufbau | Bemerkung |
|---|---|---|---|
| `1-01` | ja (6) | vergleich → karte → mythos → studie → zuordnen → auswahl → mission | Starker Einstieg. Die Studie zu „Aber du entscheidest“ ist vorbildlich ehrlich. |
| `1-02` | ja (6) | schaetzen → karte → zuordnen → anschluss → auswahl → mission | Gut. Nur „drei/vier Fragen“ (offener Punkt 1). |
| `1-03` | ja (6) | wie das Muster in `06` | Entspricht dem Muster, jetzt mit „Sie“ gegenüber Kunden. |
| `1-04` | ja (7) | vergleich → karte → auswahl → umformulieren → bauplan → reflexion → mission | Das Bauplan-Muster ist konkret und ehrlich. Gut für Nicht-Verkäufer. |
| `1-05` | ja (7) | vergleich → studie → karte → umformulieren → auswahl → zuordnen → mission | Inhaltlich gut; Superlativ siehe offener Punkt 2. |
| `1-06` | eher 7, knapp | vergleich → karte → rangfolge → dialog → auswahl → mission | Der Dialog mit dem Neffen (Gesicht wahren) ist die beste Szene des Bereichs. |
| `1-07` | ja (7) | schaetzen → karte → umformulieren → auswahl (Taktik, privat) → kunstgriff (rot) → reflexion → mission | Abschluss, Anker und Selbstschutz gut verzahnt. |

Die beste Antwort ist nicht immer die längste (zum Beispiel `1-06-c`, `1-07-b`, `l-03` k3, `v-0063`). Brauchbare Antworten mit `wert: 1` sind überwiegend wirklich brauchbar. Die Lagen sind realistisch. Nadine Köhler, Dr. Albers und der Handyvertrag haben je einen guten Ausgang und auch ein gutes Nein (`l-05`, `ende4`). Die Musterlösungen in `umformulieren` und `bauplan` sind konkret, wahr und ohne Übertreibung. Die Selbstdarstellung nennt Leistungen offen und belegt (Sonderregel `06`).

## Urteil

**Freigabereif: ja.** Die einzige sachlich falsche Lehre (Verlust-Rahmung „wirkt oft stärker“) ist korrigiert. Die rote Linie wird nirgends trainiert, und der Selbstschutz ist gut ausgebaut. Die offenen Punkte 1, 4, 6, 8 und 9 sollten vor der Freigabe für alle erledigt sein und gehören in `NACHARBEIT.md`.
