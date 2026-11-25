# Gegenlesen: Bereich `gespraech` („Gespräche führen“)

**Datum:** 25.11.2026 · **Rolle:** unabhängige Gegenleserin aus drei Blickwinkeln: Mediation und Führungskräfte-Training, konfliktscheuer Nutzer bzw. Nutzerin in einer übergriffigen Beziehung oder an einem Arbeitsplatz mit Mobbing, Faktenprüfung · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `src/coach/kern/inhaltTypen.ts`.
- Alle Dateien in `src/coach/inhalt/gespraech/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`. Dazu `besetzung.json`, `gemeinsam.json` (Fachhilfe `mobbing`, `belaestigung`, `seele`), `ueberzeugen/quellen.json` (`fisherury`), `flirten/quellen.json` (`huang2017`, `kluger2019`, `gottman1999`) sowie Figuren-Stellen in `smalltalk`, `stegreif`, `mut`, `aussprache`, `ueberzeugen`, `antrieb`.
- An der Quelle geprüft (Abstract, Verlags- oder Autorenseite, Presse der Universität):
  - Weger u. a. 2014: 115 Teilnehmende, 10 geschulte Gesprächspartner; verstanden fühlen: Zuhören > Rat und > Bestätigen; Zufriedenheit und Sympathie: Zuhören = Rat, beide > Bestätigen; kleine Effekte, ein Gespräch. **Stimmt.**
  - Kluger u. a. 2024 (online 2023): 664 Effektgrößen, r ≈ 0,39, am stärksten bei der Beziehung (r ≈ 0,51), 75 % Selbstauskünfte. **Stimmt.** (Der Wert r ≈ 0,21 ohne Selbstauskünfte in `quellen.json` war im Abstract nicht zu sehen; er steht in keinem Nutzertext.)
  - Eyal, Steffel & Epley 2018: 25 Experimente, Hineinversetzen nicht treffsicherer, teils selbstsicherer; direktes Fragen half. **Stimmt.**
  - Yeomans u. a. 2020: Führungskräfte aus Behörden, empfängliche Sprache → bessere Teampartner, Ratgeber, Vertreter; Online-Lexikon: seltener persönlich angegriffen; Anleitung wirkt. **Stimmt.** Die Gespräche drehten sich aber um umstrittene (politische) Sachfragen, nicht um „Streitfragen ihrer Arbeit“ → korrigiert.
  - Kluger & DeNisi 1996: 607 Effektgrößen, 23.663 Beobachtungen, d = 0,41, über ein Drittel verschlechtert; das Vorzeichen der Rückmeldung (positiv/negativ) erklärt das nicht. **Stimmt** (auch `v-0039`).
  - Parkes u. a. 2013: zwei Studien (20 und 350 Medizinstudierende); Studie 2 wertete Rückmeldungen über fünf Jahre aus – ein Zusammenhang, kein Experiment → Formulierung in `w-074`/`w-081` angepasst.
  - Kubany u. a. 1992 (Jugendliche, erdachte Lagen) und Rogers u. a. 2018 (Eröffnungssätze, Ich-Sprache plus beide Sichtweisen am besten bewertet). **Stimmt.**
  - Carrère & Gottman 1999: 124 frisch verheiratete Paare, sechs Jahre, erste drei Minuten, Einstieg entscheidend. **Stimmt.**
  - Adriani u. a. 2024: Scoping Review, sieben Studien, 185 Teilnehmende. Kern stimmt; „davon zwei experimentelle“ in `quellen.json` konnte ich nicht prüfen (steht in keinem Nutzertext).
  - Edmondson 1999 (51 Teams), Frazier u. a. 2017 (136 Stichproben, > 22.000 Personen, fast 5.000 Gruppen), Detert & Burris 2007 (3.149 Beschäftigte, 223 Leitungen), Detert & Edmondson 2011, Milliken u. a. 2003 (40 Interviews), Huang u. a. 2017 mit Kluger & Malloy 2019: Zahlen und Beleg-Stufen passen.
- Beleg-Stufen: A nur bei Meta-Analysen (`w-001`, `w-005`, `w-012`), sonst B/P/D/U mit Hinweis. Bücher und Denkmodelle (Rosenberg, Gordon, Schulz von Thun, Watzlawick, Berne, Stone, Patterson, Scott, Fisher & Ury) stehen ohne Zahlen. In Ordnung.
- Wege durch alle Dialoge und Lagen von Hand abgegangen (jeder Knoten, jede Wahl).
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur gespraech`. Vorher: 0 Fehler, 0 Hinweise. Nachher: **0 Fehler, 0 Hinweise**.

## Gesamteindruck

Ein fachlich sauberer, praxisnaher Bereich mit klarer Linie: erst verstehen (Spiegeln, offene Fragen, Fragen statt Gedankenlesen), dann klar sagen (Beobachtung statt Urteil, Ich-Botschaft mit machbarem Wunsch), empfänglich widersprechen, auch nach oben, Konflikte über Interessen lösen und mit wer–was–bis wann schließen. Die Einheiten bauen aufeinander auf und liegen bei 6–7 Minuten. Die Lagen sind lebensnah, mit Reparatur-Wegen („zweite Chance“) und ehrlichen, nicht strafenden Enden („Kein Drama – aber …“). Ein Nein und ein Zurückstecken kommen als legitime Ausgänge vor. Die Musterlösungen in `umformulieren`, `spiegeln` und `bauplan` sind gut: konkret, verschieden in der Spielart, in eigenen Worten.

Für die zweite Brille ist der Bereich bemerkenswert sorgfältig: Wissens-Einleitung, `w-115` („Wenn Reden nicht mehr reicht“), die Karte in `1-07`, `m-10` sowie die Sicherheits-Aufgaben `v-0081` (Vorgesetzte schikaniert) und `v-0088` (Partner droht) sagen klar: Bei Drohung, Mobbing und Gewalt liegt es nicht an der Formulierung – Hilfe holen. Rote Gesprächstricks (Gaslighting, Schweigen als Strafe, Schuld einreden) kommen nur zum Erkennen und Abwehren vor. Rufnummern stehen nur in `gemeinsam.json`.

Die Mängel: ein überzogener Leitsatz ohne Beleg („Menschen folgen dem, der sie verstanden hat“), der der eigenen Studie im Kurs widersprach; eine unbelegte Zahl; zwei Logikbrüche in Gesprächswegen; eine Test- und eine Vorratsfrage, bei der `wert: 1` nicht brauchbar bzw. für Betroffene schädlich war; die Fachhilfe in `1-07` mit dem falschen Thema; kleine Sprachfehler.

## Korrekturen (alle Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Fakten und Belege (6)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| wissen | `kern` | „Menschen folgen dem, der sie verstanden hat. Erst verstehen, dann klar sagen …“ → „Erst verstehen, dann sprechen: zeigen, dass du gehört hast, klar sagen, was du siehst und was du dir wünschst – und am Ende festhalten, wer was bis wann tut.“ | Kein Beleg dafür, dass Menschen „folgen“. Weger 2014 zeigt sogar gleiche Zufriedenheit nach Rat und Zuhören. |
| einheiten | `gespraech-1-01` (aha) | „Menschen folgen dem, der sie verstanden hat. Ein Satz, der zeigt, dass du verstanden hast, öffnet mehr als der beste Rat.“ → „Ein Satz, der zeigt, dass du verstanden hast, gehört vor jeden Rat. Danach fühlt sich der andere gehört – und du weißt, ob dein Rat überhaupt gefragt ist.“ | wie oben; „öffnet mehr als der beste Rat“ widersprach dem `studie`-Schritt derselben Einheit. |
| einheiten | `gespraech-1-01` (karte) | „Das kostet zehn Sekunden und erspart oft zehn Minuten Missverständnis.“ → „Das kostet einen Satz und erspart oft ein langes Missverständnis.“ | Zahlen ohne Quelle (LIESMICH 5). |
| einheiten | `gespraech-1-06` (schaetzen, frage) | „… widersprachen einander bei Streitfragen ihrer Arbeit … wie wurde er eingeschätzt?“ → „… diskutierten zu zweit umstrittene Sachfragen, bei denen sie verschiedener Meinung waren … wie schätzte das Gegenüber ihn ein?“ | Yeomans 2020: umstrittene (politische) Sachfragen, bewertet vom Gesprächspartner. |
| wissen | `gespraech-w-074` (belegHinweis) | „… gefiel das Sandwich, die Leistung stieg dadurch nicht.“ → „… gefiel das Sandwich; mit besserer Leistung hing es nicht zusammen.“ | Parkes 2013, Studie 2 ist eine Auswertung von Akten, kein Experiment. |
| wissen | `gespraech-w-081` (text) | „… besser wurde die Leistung dadurch aber nicht.“ → „… mit besserer Leistung hing es aber nicht zusammen.“ | wie oben |

### Sicherheit und Verantwortung (4)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten | `gespraech-1-07` (fachhilfe) | `"thema": "belaestigung"` → `"thema": "mobbing"` | Die Einheit spielt am Arbeitsplatz (Raumbuchung, Kollege), die Karte davor nennt „gezielt schikaniert … im Betrieb“. `mobbing` nennt Betriebsrat, Personalabteilung, Aufschreiben und bei Drohung 110. (Siehe offener Punkt 1.) |
| einheiten | `gespraech-1-07` (karte „Wenn es kein Streit mehr ist“) | „… ist das keine Frage der richtigen Frage.“ → „… ist das keine Frage der richtigen Frage – und es liegt nicht an dir.“ | Für Betroffene von Mobbing oder Gewalt: Die Verantwortung ausdrücklich zurückgeben. |
| wissen | `gespraech-w-114` (Umfeld Freunde und Partnerschaft) | Satz ergänzt: „Das gilt für Streit unter Gleichen: Hast du Angst vor deinem Partner oder deiner Partnerin, liegt es nicht an deinen Worten – dann hol dir Hilfe.“ | „Sanft beginnen“ als einziger Rat zur Partnerschaft konnte in einer übergriffigen Beziehung wie „sprich halt besser“ wirken. |
| vorrat-02 | `gespraech-v-0074` (Gaslighting, erste Antwort) | „Wohl nur ein Missverständnis – am besten selbst noch mal genauer zuhören.“ (wert 1) → „Ruhig nachfragen, wie sie sich an die Abmachung erinnert.“ (wert 1), warum: „Ein fairer erster Schritt. Beim dritten Mal in einem Monat reicht er aber nicht – das Muster lässt dich sonst an dir zweifeln.“ | Teilpunkte für Selbstzweifel bei wiederholtem Absprechen der Wahrnehmung waren für Betroffene schädlich. Die neue Antwort ist brauchbar, ohne die Schuld zu verschieben. |

### Didaktik und Logik der Wege (6)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten | `gespraech-1-04-c` (frage) | „Bei vielen Fachwörtern haben die Kunden ratlos geschaut.“ → „Bei den Fachwörtern haben die Kunden mehrmals nachgefragt.“ | Die beste Antwort („haben die Kunden nachgefragt“) beschrieb eine andere Beobachtung als die Lage. Jetzt passen Lage und Musterantwort zusammen. |
| einheiten | `gespraech-1-05-b` (dialog, ende1) | „Und das Popcorn geht heute auf mich.“ → „Und beim nächsten Mal geht das Popcorn auf mich.“ | Über den Weg k1 → k2b („nach dem Film“) → k2 → ende1 war der Film schon vorbei. |
| lagen | `gespraech-l-04` k2c (sagt) | „Echt? Du hattest es doch auch eingetragen …“ → „Echt? Bei mir sind es die Betriebsferien von meinem Freund, die liegen fest. Aber du hattest es doch auch eingetragen …“ | Auf dem Weg über k2c erfuhr man Miriams Interesse nie, das Ende nennt es aber („Betriebsferien und eine Hochzeit“). |
| vorrat-01 | `gespraech-v-0029` ende1 (sagt) | „Gut, dass Sie fragen.“ → „Gut, dass wir drüber gesprochen haben.“ | Über die Wahl „Das kriegen wir schon irgendwie hin“ (ohne Frage) passte der Dank nicht. |
| tests | `gespraech-fc-008` (frage) | „Welcher Satz trägt keinen versteckten Vorwurf?“ → „Welcher Satz sagt am klarsten, worum es geht – ohne Urteil über die Person?“ | Auch die `wert: 1`-Antwort („Ich hab mich übergangen gefühlt.“) trägt keinen versteckten Vorwurf – nach der alten Frage gab es zwei richtige Antworten. |
| tests | `gespraech-fc-011` (dritte Antwort) | „Wenn sie gleich mehrere Punkte auf einmal anspricht, damit alles gesagt ist.“ (wert 1, warum: „… überfordern“) → „Wenn sie unter vier Augen und ohne Publikum kommt, damit niemand sein Gesicht wahren muss.“ (wert 1, warum: „Hilft, weil der andere sich nicht vor allen verteidigen muss. Wirksam wird sie aber erst, wenn sie bei der Aufgabe bleibt.“) | Die alte `wert: 1`-Antwort war laut eigener Begründung nicht brauchbar. |

### Sprache (3)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten | `gespraech-1-07-c` (beste Antwort, warum) | „nach seinem Interesse“ → „nach ihrem Interesse“ | Carla ist eine Frau; der Satz geht mit „sie“ weiter. |
| wissen | `gespraech-w-002` (titel) | „Zusammenfassen lässt sich verstanden fühlen“ → „Wer zusammenfasst, zeigt Verstehen“ | Der alte Titel war kein grammatischer Satz. |
| vorrat-01 | `gespraech-v-0047` (erster Teil) | „… heute zweimal klingeln lassen hast.“ → „… heute zweimal hast klingeln lassen.“ | Ersatzinfinitiv in Standardsprache. |

Zusammen: **19 Korrekturen** (Fakten 6, Sicherheit 4, Didaktik/Logik 6, Sprache 3).

## Geprüft und in Ordnung

- **Einheiten:** 7 Einheiten, 6–7 Minuten, 6–8 Schritte, Neugier am Anfang, Mission am Ende; Längen gemischt (Prüfskript ohne Hinweis). Jede Musterlösung ist besser als die Vorlage und erfüllt die eigenen Kriterien.
- **Lagen:** Alle Wege von `l-01` bis zum Sparring `l-05` sind logisch (nach den zwei Korrekturen). Gute Reparatur-Knoten. Das Sparring prüft alle sieben Fähigkeiten.
- **Kursplan:** 21 Lerntage, 7 E · 7 Ü · 4 L · 2 A · 1 S, Reihenfolge wie vorgegeben, Übungstage passen zu den Einheiten davor.
- **Leiter:** Sprossen 1–7 folgen den Einheiten, 8–10 steigern sinnvoll (Rückmeldung, Widerspruch in der Runde, aufgeschobenes Gespräch). `m-05` („mit jemandem, mit dem du gut kannst“) und `m-10` („Geht es um Drohung oder Mobbing, hol dir zuerst Unterstützung“) sind für konfliktscheue Menschen gut abgestuft.
- **Rote Linie:** `w-051`–`w-053`, `v-0074`, `v-0082`, `v-0093`, `v-0094` nur als Erkennen/Abwehren, jeweils mit Weg zur Unterstützung bei Mustern.
- **Figuren:** passen zu `besetzung.json` und zu den anderen Bereichen (Frau Sommer: Treppenhaus, Garten, Tochter, Enkel; Herr Petersen hört schlecht; Lena neu und eingearbeitet; Nadine Köhler „inzwischen Kundin“).
- **Tests:** keine Testfrage gleicht einer Übung; Fähigkeiten und Stufen sauber verteilt.

## Offene Punkte (Ermessen – nicht geändert)

1. **Fachhilfe bei Gewalt zu Hause.** Mit `mobbing` in `1-07` fehlt im Kurs der Weg zum Hilfetelefon für häusliche Gewalt, obwohl die Karte auch „zu Hause“ nennt und `v-0088` (Partner droht) eine Drohung im Paar zeigt. *Empfehlung an den Hauptstrang:* in der Bereichsseite neben `w-115` beide Fachhilfen anbieten (`mobbing` und `belaestigung`) oder bei `sicherheit: true`-Aufgaben die passende Fachhilfe einblenden (`v-0081` → `mobbing`, `v-0088` → `belaestigung`). Das ist eine Änderung an Struktur oder Technik und deshalb nicht von mir umgesetzt.
2. **Totschlagargument als „rot“** (`w-050`, `v-0073`). Die rote Linie umfasst laut LIESMICH erfundene Tatsachen, Ausnutzen von Abhängigkeit, Zermürben, Schuld einreden, ein Nein übergehen. „Das haben wir schon immer so gemacht“ ist eher eine unfaire Abkürzung als Manipulation. *Empfehlung:* `einfluss: "taktik"` mit `preis`/`abwehr` wie jetzt – oder die Klasse bewusst so lassen und in der Gruppe erklären.
3. **`gespraech-fc-014`**, `wert: 1` für „Du weißt sicher, worum es geht.“ Die Begründung sagt selbst: „klingt nach Anklage“. *Empfehlung:* `wert: 0` mit `tendenz: "andeuten"` oder eine brauchbare Mittelantwort (z. B. „Können wir heute Abend über die Sache von letzter Woche reden?“).
4. **Jule Marek:** In `1-03-c` spricht sie von ihrem Praktikum, in `smalltalk` hat sie ihren sicheren Job gekündigt und eröffnet ein Café. Mit einem Praktikum vor der Café-Eröffnung vereinbar, aber ungewohnt. *Empfehlung:* „Mein Probetag in der Bäckerei war … na ja“ oder so lassen.
5. **`quellen.json`:** `adriani2024` „davon zwei experimentelle“ und `kluger2024` „Leistung r ≈ 0,21 ohne Selbstauskünfte“ konnte ich am Abstract nicht prüfen. Beide stehen in keinem Nutzertext. *Empfehlung:* beim nächsten Durchgang am Volltext prüfen oder streichen.
6. **`w-086`** („Gute Teams haben keinen Streit“, Quelle `edmondson1999`): „wird eher mehr diskutiert“ ist eine Folgerung aus dem Lernverhalten, kein eigener Befund der Studie. Als U-Mythos vertretbar; ein „eher“ steht schon da.

## Urteil

**Freigabereif: ja.** Nach den Korrekturen keine sachlichen Fehler mehr, die Sicherheitslinie hält aus Sicht von Betroffenen, und das Prüfskript meldet 0 Fehler, 0 Hinweise. Punkt 1 sollte der Hauptstrang vor der Freigabe für alle entscheiden; die Punkte 2–6 sind Feinschliff.
