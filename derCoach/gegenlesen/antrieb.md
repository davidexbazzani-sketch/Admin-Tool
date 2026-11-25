# Gegenlesen: Bereich `antrieb` („Antrieb & Ziele“)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser aus drei Blickwinkeln: Motivationspsychologie (Zielsetzung, Selbstbestimmung, Gewohnheiten, Aufschieben), Nutzer, die erschöpft oder niedergeschlagen sind oder keine klaren Lebensziele haben, Faktenprüfung (Replikationskrise) · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md` (bes. Abschnitt 8), `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `src/coach/kern/inhaltTypen.ts`, frühere Berichte (`selbst.md` als Vorlage).
- Alle Dateien in `src/coach/inhalt/antrieb/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`. Dazu `besetzung.json`, `gemeinsam.json` (Fachhilfe `seele`) und die fremden Quellen, die `antrieb` nutzt: `gollwitzer2006`, `harkin2016` (aussprache), `singh2024` (aussprache/quellen-n), `breines2012`, `frankl1946` (selbst), `hayes2005` (mut), `kahler1975` (ruhe).
- **Figuren-Abgleich:** alle Stellen mit Sven, Carla, Tarek, Lena, Jule und Tante Renate in den `lagen*.json` und `einheiten*.json` aller anderen Bereiche.
- **An der Quelle geprüft** (Abstract, Volltext oder Presse der Autoren):
  - Wang, Wang & Gai 2021: 21 Arbeiten, 24 Effekte, 15.907 Teilnehmende, g = 0,336 (KI 0,229–0,443), angeleitet (g = 0,465) stärker als nur schriftlich (g = 0,277), nach Trim-and-Fill g = 0,242. **Stimmt.**
  - Oettingen & Mayer 2002, Studie 4: Hüftoperation, Physiotherapeuten bewerteten die Erholung nach zwei Wochen schlechter, je schöner die Fantasien waren. **Stimmt.**
  - Kappes & Oettingen 2011: Vergleich mit hinterfragenden, negativen und neutralen Fantasien, Blutdruck und Selbstauskunft, Studie 4 mit Wasser bei Durst und Prüfungserfolg. **Stimmt** (die Einheit `antrieb-1-01` gibt das richtig wieder).
  - Kirgios u. a. 2020: 6.792 Teilnehmende, +10–14 % Wahrscheinlichkeit wöchentlichen Trainings, Wirkung **bis 17 Wochen nach dem Programm**, Zusatznutzen der Anleitung klein. Damit ist „kleinerer, aber anhaltender Nutzen“ (`w-016`) gedeckt.
  - Milkman u. a. 2021: 61.293 Mitglieder, 54 Programme, 45 % steigerten die Besuche um 9–27 %, Spitze war die Belohnung für die Rückkehr nach einem verpassten Training, nur 8 % wirkten nach den vier Wochen messbar nach. **Stimmt.**
  - Hagger u. a. 2016: 23 Labore, 2.141 Teilnehmende, d = 0,04. **Stimmt.**
  - Vohs u. a. 2021: 36 Labore, 3.531 Teilnehmende. Der vorab festgelegte Test war **nicht signifikant** (d = 0,06), nur explorativ ohne Ausschlüsse d = 0,08. Größer bei Müden (explorativ). → Korrektur in `w-082`.
  - Wohl u. a. 2010: 119 Erstsemester, Effekt nur bei starken Aufschiebern, Beobachtungsstudie. **Stimmt.**
  - Rozental u. a. 2018: 12 Studien, 21 Vergleiche, 718 Teilnehmende, g = 0,34, KVT g = 0,55 bei drei Studien. **Stimmt** (Quelle derzeit unbenutzt).
- Aus eigener Kenntnis ohne Befund geprüft: Gollwitzer & Sheeran 2006 (94 Vergleiche, d = 0,65), Harkin 2016 (138 Studien, d = 0,40, stärker beim Festhalten oder Berichten), Locke & Latham 2002/2006 (Lernziel bei neuen, komplexen Aufgaben), Ryan & Deci 2000, Sheldon & Elliot 1999, Deci u. a. 1999 (128 Experimente), Dai u. a. 2014, Milkman u. a. 2014, Steel 2007 (691 Korrelationen), Sirois & Pychyl 2013, Sirois u. a. 2017 (r = 0,23 / −0,22), Lally 2010, Singh 2024 (Median 59–66, Mittel 106–154, Spanne 4–335 Tage), Gollwitzer u. a. 2009, Klein u. a. 2020, Puetz 2006, Palmer 2024 (154 Studien), Albulescu 2022, Ekers 2014 (26 RCTs), Breines & Chen 2012, Morisano 2010.
- **Nicht bestätigen konnte ich** die 14 % aus Klasnja 2019 (PubMed und PMC haben die Abfrage gesperrt). Die Quelle wird im Bereich nirgends verwendet.
- Die Behauptung „Lally: 66 Tage Durchschnitt“ steht **nirgends** im Bereich. Überall steht richtig „meist um zwei Monate (Median), im Durchschnitt drei bis fünf, Spanne 4–335“, wie in LIESMICH Abschnitt 8 verlangt.
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur antrieb`. Vorher **0 Fehler, 0 Hinweise**, nachher **0 Fehler, 0 Hinweise**.

## Gesamteindruck

Ein sehr guter, ehrlicher Bereich. Die Kernidee lautet: Antrieb kommt eher nach dem Anfangen, und Pläne, Auslöser und kleine Schritte ersetzen Willenskraft. Sie ist fachlich sauber und warm verpackt. Die Replikationskrise ist vorbildlich verarbeitet: Der Willenstank steht als Mythos da, die 21 Tage ebenso. WOOP erscheint mit bereinigtem Effekt, Serien mit der Grenze „Konsum und Apps“, Koppeln mit „bescheiden, kann nachlassen“, „Ziele öffentlich machen“ als „teils“.

Für Menschen ohne Ziele ist der Bereich ungewöhnlich gut gebaut. Es gibt Werte statt Lebensplan (`w-006`, `w-086`), Neugier-Experimente (`w-032`, `v-0025`), einen Spickzettel „Wenn du nicht weißt, was du willst“, eine Reflexion in `1-01` mit ausdrücklicher Erlaubnis („Fällt dir keins ein, ist das in Ordnung“) und die Wahl „Nichts Bestimmtes“ in der Sparring-Lage mit `wert: 1`.

Auch Selbstoptimierungsdruck wird aktiv abgebaut: „Du entscheidest, was zählt“, „Pausieren ist nicht Aufgeben“ (`w-115`), Burkeman und Seneca als Gegengift, „bewusst beenden“ in `m-10`.

Erschöpfung und Depression kommen in `1-01` vor, als Karte „Wenn es mehr ist“ plus `fachhilfe` `seele`, und in `w-099`, im Text ohne Rufnummern. Die „Arschtritt“-Sätze (`w-044`) sind energisch, aber nie gegen die Person gerichtet. Alle wert-0-Rückmeldungen sind ohne Beschämung („Kein Drama – so geht es vielen“).

Die Mängel waren:
- eine ungenaue Wiedergabe der Vohs-Studie,
- eine zu starke Einordnung von d = 0,40 als „mittel“,
- zwei leichte Gesundheits-Überdehnungen beim Schlaf,
- mehrere Zähl- und Weg-Fehler in den Lagen,
- eine Abwertung der zurückhaltenden Lena als „brauchbare“ Antwort,
- eine Testfrage, die fast wortgleich einer Übung entsprach.

## Korrekturen (alle Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Fakten und Quellen (5)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| wissen | `antrieb-w-082` (belegHinweis) | „Eine weitere Laborreihe fand einen kleinen Effekt.“ → „Auch eine zweite große Laborreihe fand im vorab festgelegten Test keinen sicheren Effekt, nur in einer Zusatzauswertung einen sehr kleinen.“ | Vohs 2021: Der konfirmatorische Test war nicht signifikant (d = 0,06). „Fand einen kleinen Effekt“ hätte den Mythos halb wieder aufgewertet. |
| wissen | `antrieb-w-009` | „ein mittlerer Effekt (d = 0,40)“ → „ein kleiner bis mittlerer Effekt (d = 0,40)“ | d = 0,40 liegt zwischen klein (0,2) und mittel (0,5). Die Autoren sprechen von „small-to-moderate“. |
| einheiten | `antrieb-1-05` (Schritt `schaetzen`, Option und Lösung) | „hilft, im Mittel mittelstark“ → „hilft, im Mittel klein bis mittel“ | wie oben |
| wissen | `antrieb-w-100` | „Auslöser, Reiz, Handlung und Belohnung“ → „Auslöser, Verlangen, Handlung und Belohnung“ | Clears vier Schritte sind cue, craving, response, reward. „Reiz“ ist ein Doppel zu „Auslöser“, das Verlangen fehlte. |
| quellen | `clear2018` | „Auslöser, Reiz, …“ → „Auslöser, Verlangen, …“ | wie oben |

### Gesundheit und überzogene Aussagen (3)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| tests | `antrieb-fc-019` | beste Antwort „Schlafmangel drückt Stimmung und Antrieb – und damit genau das Lernen, für das du ihn opferst.“ → „Schlafmangel drückt die Stimmung und macht ängstlicher – schlechte Bedingungen fürs Lernen.“ · Begründung zu „Der Körper gewöhnt sich daran“: „Schlafmangel wirkt auch nach Wochen – …“ → „Darauf solltest du nicht bauen: Schlafverlust drückte in vielen Studien die Stimmung und machte ängstlicher.“ | Die Quelle (Palmer 2024) misst Gefühle, nicht Lernleistung und nicht wochenlangen Schlafmangel. Jetzt steht nur, was die Quelle trägt. |
| wissen | `antrieb-w-079` | „Das hält ein paar Tage – dann fehlt die Energie für alles.“ → „… – doch Schlafmangel drückt die Stimmung, und mit ihr den Antrieb.“ | „für alles“ war ohne Beleg. Jetzt deckt die Quelle die Aussage, wie in `w-042`. |
| vorrat-02 | `antrieb-v-0075` (dritte Antwort, warum) | „Weniger Schlaf drückt Stimmung und Antrieb – und damit das Lernen.“ → „Weniger Schlaf drückt die Stimmung – schlechte Bedingungen fürs Lernen.“ | wie `fc-019` |

### Logik und Anzahlen in den Lagen (5)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen | `antrieb-l-02` ende1 | Sven tippt „… Abends nach der Arbeit. Frühjahr: zehn Kilometer.“ · ende „… – und eine Etappe, die zu seinem Stand passt.“ → Sven tippt „Wenn's zäh wird: kleine Runde statt aufhören. Laufen abends, nicht morgens.“ · ende „… das Hindernis in ihm und ein Plan dafür. Eine Etappe, die zu seinem Stand passt, macht das große Ziel noch greifbarer.“ | ende1 wird auch über „Du entscheidest“ (k4) und über k4b erreicht („Ich meld mich gleich morgen an“). Auf diesen Wegen hat niemand zehn Kilometer vorgeschlagen. Der Schluss gilt jetzt auf jedem Weg. |
| lagen | `antrieb-l-03` ende1 | „Ein Jahr Stillstand, gelöst in einer Mittagspause“ → „… aufgebrochen in einer Mittagspause“ | Nach einer gelesenen Seite ist nichts „gelöst“. Das wäre ein kleines Überversprechen. |
| lagen | `antrieb-l-04` k3 (dritte Wahl, Text und rueck) | „nur fünfzehn“ / „Fünfzehn von zwanzig“ → „nur vierzehn“ / „Vierzehn von zwanzig“ | Du gehst „meistens“ mit, Lena sagt „fast jeden Tag“. Fünfzehn wären alle 15 Tage der drei Wochen. |
| lagen | `antrieb-l-05` k4 | „Montag und Dienstag hast du gelesen … drei leere Kästchen“ → „Dienstag und Mittwoch hast du gelesen …“ | Nach Montag und Dienstag bleiben bis Samstag vier leere Tage, nicht drei. Mittwoch bis Samstag passt nicht zu „drei Tage nichts“. |
| lagen | `antrieb-l-05` k1c (zweite Wahl, rueck) | „fünf Baustellen gleichzeitig“ → „vier Baustellen gleichzeitig“ | In k1 werden vier Vorsätze genannt, das rueck dort sagt richtig „Vier Vorsätze“. |

### Haltung und Figuren (3)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen | `antrieb-l-04` k3 (zweite Wahl, `wert: 1`) | „Lachend: „Streberin.““ / „Lockerer Spaß unter Kollegen – passt.“ → „„Siebzehn – stark. Ich hab gar nicht mitgezählt.““ / „Anerkennung für Lena – schön. Für dich lohnt das Zählen trotzdem: …“ | Lena ist laut Besetzung „zurückhaltend, genau“. In `konter-l` wird sie bei genau so einem Spruch über ihre Ordnung rot. Eine Etikettierung ihrer Genauigkeit als „passt“ zu bewerten, widerspricht dem und dem Grundsatz „nie beschämend“. Die Wahl ist jetzt wirklich brauchbar. |
| tests | `antrieb-fc-002` | „Lena soll zum ersten Mal zwei neue Auszubildende einarbeiten“ → „Miriam soll …“ | Lena ist die neue Kollegin, die du laut `gespraech-l` und `selbst-l` selbst einarbeitest. Dass sie Auszubildende einarbeitet, passt nicht. |
| vorrat-01 | `antrieb-v-0026` k1 | „Alle reden ständig von ihren Zielen. Ich hab keins.“ → „… von ihren großen Lebenszielen. Ich hab keins.“ | In `v-0003` will Jule „endlich fit werden“, in `flirten` plant sie eine Radtour an die Ostsee, in `smalltalk` hat sie ihre Konditorinnen-Prüfung bestanden. „Kein großes Lebensziel“ ist stimmig und trifft den Kern der Übung genauer. |

### Didaktik (1)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| tests | `antrieb-fc-012` | Die vier Antworten waren inhaltlich die vier Einträge der Übung `antrieb-v-0046` („Fünf Minuten mit Wecker“, „leichtester Teil“, „Schreibtisch aufräumen“, „auf Lust warten“). Neu: „Zehn Minuten, nur die drei ältesten Mails – dann darf ich aufhören“ (2), „Erst einen neuen Ordner-Aufbau fürs Postfach überlegen …“ (0, ausweichen), „Die Mails bis nach dem Mittagessen liegen lassen“ (0, aufschieben), „Einmal durchscrollen, um zu sehen, wie schlimm es ist“ (1). | Testfragen dürfen keinen Übungen gleichen, sonst misst der Formcheck Wiedererkennen statt Können. Dieselbe Fähigkeit wird jetzt mit neuen Antworten geprüft. Die Längen bleiben gemischt (die längste Antwort ist eine falsche). |

**Summe: 17 Korrekturen** (Fakten 5 · Gesundheit/Überdehnung 3 · Lagen-Logik/Anzahlen 5 · Haltung/Figuren 3 · Didaktik 1).

## Geprüft und in Ordnung

- **Kursplan:** 21 Lerntage in der vorgeschriebenen Reihenfolge E Ü E Ü E Ü L A E Ü L E Ü E Ü L A E Ü L S. Die Bänder steigen von [1,3] auf [2,5], die Formate kommen im Vorrat vor (Prüfskript ohne Hinweis).
- **Einheiten:** 6–7 Minuten, aufbauend. Ziel und Hindernis → Wenn-Dann → Zwei-Minuten-Fassung → WOOP (verbindet 1–3) → Zählen → Umgebung und Energie → Rückweg. Die Musterlösungen für WOOP (`1-04-b`, auch mit einem Wert als Einstieg), Wenn-Dann (`v-0033` „Hindernis als Auslöser“) und „Ziel konkret“ (`v-0013`) sind gut und alltagsnah.
- **Missionen:** Sprosse 1–7 folgen genau den Einheiten 1–7, jede mit Wenn-Dann-Vorlage und halber Fassung. `m-10` erlaubt ausdrücklich, ein Vorhaben „bewusst zu beenden“.
- **Antworten:** Jede Auswahl hat genau eine beste Antwort. Die wert-1-Antworten sind brauchbar und erklären, was fehlt. Lagen haben gemischt zwei und drei Wahlen. Jeder Weg in l-01, l-03, l-04, l-05 und den drei Vorrats-Dialogen endet logisch.
- **Beleg-Stufen:** ehrlich gesetzt. Jede B-, D- und U-Einordnung hat einen Hinweis (Mythen tragen U mit Urteil), A nur mit Meta-Analyse, Bücher als „aus dem Gedächtnis“ mit `geprueft: false` und ohne Zahlen.
- **Sprache:** Du-Form, kein „du musst“, keine echten Marken (nur Gattungsbegriffe wie „Energydrink“, „Streamingdienst“), keine verbotenen Wörter. Kein Superlativ ohne Beleg gefunden.

## Offene Punkte (Ermessen, nicht geändert)

1. **„Nie zweimal“ und „zweimal nicht“** (`1-07` Titel, Regel, Karte; `w-012`): ehrlich als abgeleitete Faustregel markiert. Für Perfektionisten kann „zweimal nicht“ wie ein neues Verbot klingen. *Empfehlung:* lassen, aber in der Stufe 2 einmal ausdrücklich sagen „Auch nach zweimal: einfach der Rückweg-Plan, kein Urteil“. `w-036` und `m-07` tun das schon.
2. **Erschöpfung außerhalb von `1-01`:** Die Energie-Einheit `1-06` und die Lage `l-04` (Erkältung, Überstunden) verweisen nicht auf `seele`. *Empfehlung:* in `1-06` (Karte „Energie ist kein Bonus“) einen Halbsatz „Bleibt die Erschöpfung über Wochen, sprich mit deiner Hausarztpraxis“ ergänzen. Ich habe es nicht gemacht, weil die Karte nahe an 420 Zeichen liegt und es eine inhaltliche Erweiterung ist.
3. **`fc-016` ähnelt `1-07-a` im Aufbau** (Nachholen / auf Neustart warten / kleinste Fassung / Grund notieren). Die Lage ist eine andere (Grippe, Vokabeln), es ist also Transfer und keine Kopie. Bei Bedarf eine Antwort variieren.
4. **Unbenutzte Quellen** `klasnja2019`, `morisano2010`, `rozental2018`: bereit für spätere Phasen. Die 14 % bei Klasnja konnte ich nicht selbst bestätigen (Abfrage gesperrt). Vor der ersten Verwendung bitte noch einmal nachschlagen.
5. **`w-082`** nennt neben Schlaf und Pausen auch „Hunger“ als Grund für Müdigkeit. Das ist alltagsnah, aber ohne Quelle. Vertretbar, weil keine Zahl und kein Versprechen daran hängt.

## Figuren: Übersicht über alle Bereiche und Widersprüche

| Figur | Was sie über alle Bereiche ist | in `antrieb` | Befund |
|---|---|---|---|
| **Sven** | alter Freund, stichelt, meint es gut. Arbeitet laut `konter-l` „jetzt im Haus“, wird laut `selbst-l` Abteilungsleiter und hat ein neues Haus. Quizabend (`flirten`), kommt zu spät zum Kino (`gespraech`), leiht sich Auto und Umzugshilfe (`mut`), Handyladen (`ueberzeugen`) | läuft nicht, will einen Marathon, „seit ich nur noch im Büro sitze“, stichelt zum Januar-Vorsatz, Morgenroutine, 10.000 Schritte | passt |
| **Tante Renate** | Familie, sagt, was sie denkt, „Kind“. Wird 70 (`ruhe`), hat dir das Radfahren beigebracht (`ruhe`), Kaffee bei ihr (`konter`), möchte nicht als Letzte erfahren, was du vorhast (`gespraech`) | Neujahrsfrühstück, fragt nach Vorsätzen | passt |
| **Tarek Yılmaz** | Kollege, Spaßvogel, hilfsbereit. Klettert in der Halle und fährt ein neues Rennrad (`smalltalk`), hat die Zusage für eine Wohnung (`smalltalk`), Spätdienste (`selbst`), liefert Zahlen zu spät (`gespraech`) | Kellerraum als Hobbyraum, will morgens laufen und schaut Serien, Neapel-Urlaub, Trainingsplan als Pflicht (`fc-006`), Waage (`v-0061`), Programmieren | **leichte Spannung:** Der sportliche Kletterer und Rennradler wirkt in `fc-006` und `v-0061` eher wie ein Sportmuffel. Kein harter Widerspruch. Bei Gelegenheit `fc-006` oder `v-0061` auf Miriam oder Jonas umstellen. |
| **Lena Brandt** | neue Kollegin, zurückhaltend und genau. Kommt aus Leipzig, war in der Buchhaltung, läuft gern früh 10 km und vermisst ihre Laufgruppe (`smalltalk`). **Du** arbeitest sie ein (`gespraech`, `selbst`, `aussprache-s`) | Mittagsrunde mit dir, zählt genau (17 von 20), Tabellen-Kurs, neue Software, weniger naschen | Der Widerspruch „Lena arbeitet Azubis ein“ ist **behoben** (`fc-002` → Miriam). Die „Streberin“-Wahl ist **behoben**. Rest passt (genau, läuft gern). |
| **Carla Demir** | Projektleiterin, vor Auftritten aufgeregt, hat ihre Routine (`ruhe`, `selbst`). Töpferkurs (`smalltalk`), leitet Besprechungen (`stegreif`) | Schwimmen, Kreuze, Englisch, WOOP mit Fitnessstudio, große Präsentation vor der Geschäftsleitung | passt |
| **Jule Marek** | Bekannte aus dem Kochkurs, offen und direkt. Konditorin (Prüfung bestanden, `smalltalk`), Radtour an die Ostsee (`flirten`), Praktikum (`gespraech`) | „endlich fit werden“ mit dem Rad, hat „kein großes Lebensziel“ | **behoben** über `v-0026` („großen Lebenszielen“) |

**Widersprüche in anderen Bereichen (nur gemeldet):**
- Zwei 60. Geburtstage „deines Onkels“: in `aussprache-l` (am Familientisch, mit Renate) und in `stegreif-l` (im Gasthaus, zwanzig Gäste, Renate klopft ans Glas). Das kann dieselbe Feier sein, wird aber unterschiedlich beschrieben. *Empfehlung:* in einer der beiden Lagen „Geburtstag deines Onkels“ ohne Zahl oder einen anderen Anlass nehmen.
- Lena „seit drei Tagen“ (`konter-l`), „seit einer Woche“ (`aussprache-l`), „seit drei Wochen“ (`smalltalk-l`): unterschiedliche Zeitpunkte, kein Widerspruch.
- Sven „arbeitet jetzt im Haus“ (`konter-l`), in `selbst-l` ein „Treffen alter Schulfreunde“, bei dem du erfährst, dass er Abteilungsleiter wird. Das ist vereinbar. Würde aber irgendwo stehen, dass ihr euch selten seht, kollidierte es mit „im Haus“.

## Urteil

**Freigabereif: ja.** Nach den 17 Korrekturen hält der Bereich allen drei Brillen stand. Er ist inhaltlich ehrlich, für Menschen ohne Ziele und für Erschöpfte schonend und trotzdem energisch, die Lagen sind auf jedem Weg stimmig. Die offenen Punkte sind Ermessensfragen für eine spätere Runde. Prüfskript: **0 Fehler, 0 Hinweise**.
