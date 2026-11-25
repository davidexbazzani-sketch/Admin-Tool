# Gegenlesen: Bereich `stegreif` („Schnell denken & Stegreif“)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser (Rhetorik/Improvisation, Blick eines Nutzers, der unter Druck blockiert, Faktenprüfung) · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `src/coach/kern/inhaltTypen.ts`.
- Alle Dateien in `src/coach/inhalt/stegreif/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`.
- Kontext: `besetzung.json`, `gemeinsam.json` (Werkzeug `blackout` – passt wortgleich zu `stegreif-w-037`/`w-123`), `quellen.json`, `ruhe/` und `konter/` auf Widersprüche, frühere Berichte (`ruhe.md`, `NACHARBEIT.md`).
- Fakten an der Quelle (Abstract, Verlags-/Repositoriumsseite oder Volltext): Sio & Lortie-Forgues 2024 (169 Studien, 844 Effekte, 0,53 → 0,29–0,32 – stimmt), Haase u. a. 2023 (332 Effekte, g = 0,53 – stimmt; keine Publikationsverzerrung gefunden – ergänzt), Gaertig & Simmons 2018 (11 Studien, 4806 Teilnehmende – stimmt; Feinheit siehe Korrekturen), Tenney u. a. 2007 (zwei Experimente, Studierende – stimmt), Laske & DiGennaro Reed 2024 (0/2/5/12 je Minute, 5 unschädlich, 12 schädlich, vor allem Füllgeräusche – stimmt), Felsman u. a. 2020 (20 Minuten Impro, Gelassenheit bei Ungewissem, Einfälle nur in einem Teil der Maße – stimmt), Stivers u. a. 2009 (zehn Sprachen, Spanne ±250 ms um den Mittelwert, Absagen/Nicht-Antworten später – stimmt), Bransford & Johnson 1972 (Thema vorher / hinterher / gar nicht; „hinterher“ half nicht – stimmt), Alfieri u. a. 2013 (57 Experimente, d ≈ 0,5, große Streuung – „mäßig“ passt), Scott u. a. 2004 (70 Studien, 97 Effekte – stimmt), Quintilian X 6,5 und X 7,8–9 sowie 7,24–27 (Plan darf weichen; Finden, Ordnen, Formulieren nicht zugleich ohne Gewohnheit; täglich, auch allein und still – stimmt), Cicero De oratore I 149–153 (Stegreif nützlich, mit Bedenkzeit nützlicher, Schreiben am besten; schlecht drauflosreden lehrt schlecht reden – stimmt), Minto (1985, 1996 überarbeitet – stimmt). Stichproben ohne Befund: Cowan 2001, Murdock 1962, Beilock & Carr 2005, Simons u. a. 2016, Gentner u. a. 2003, Brennan & Williams 1995, Abrahams 2023.
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur stegreif` vorher und nachher je **0 Fehler, 0 Hinweise**. Eigene Zählung: In 17 von 48 Auswahl-/Testfragen (35 %) ist die beste Antwort die längste.

## Gesamteindruck

Ein starker Bereich. Die Haltung stimmt durchgehend: Blockieren wird als Folge von belegtem Arbeitsspeicher erklärt, nicht als Schwäche; jedes schlechte Ende einer Lage beginnt mit „Kein Drama“; „Weiß ich nicht“ gilt als brauchbare halbe Antwort, nicht als Versagen. Die Baupläne (Punkt – Grund – Beispiel – Punkt, Antwort zuerst/Pyramide, Drei Dinge, Gestern – heute – morgen, Problem – Lösung – Nutzen, Was – Was heißt das – Was jetzt) sind richtig erklärt und mit guten, alltagsnahen Musterlösungen belegt. Die `kern`-Übungen haben erreichbare Wortgrenzen (12–20), alle Muster liegen darunter. Die Belege sind ehrlich eingestuft, die Replikationslage (Sio 2024, Kahneman, Ramirez & Beilock) ist offen benannt. Die Mängel waren eine Unschärfe bei Gaertig 2018, ein paar Logik- und Sprachfehler und eine Doppelung mit einer Lage im Bereich `ruhe`.

## Korrekturen (Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Fakten und Beleg (7)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten-1 | `stegreif-1-04` (belegHinweis) | „dass offen genannte Unsicherheit nicht schlechter ankommt als Bluffen, zeigen Laborstudien“ → „dass ein sicher vorgetragener Fehler mehr schadet als offen gezeigte Unsicherheit, zeigen Laborstudien“ | Bluffen wurde nicht untersucht. Belegt ist (Tenney 2007): Ein Fehler schadet sicher Auftretenden mehr. |
| einheiten-1 | `stegreif-1-04-c` (warum, Antwort 1) | „Offen genannte Unsicherheit wurde in Versuchen nicht schlechter bewertet als Gewissheit.“ → „In Versuchen schadete ein sicher vorgetragener Fehler mehr als offen gezeigte Unsicherheit.“ | Gaertig 2018 untersuchte unsichere *Ratschläge* („wahrscheinlich“, Spannen). Wer sich selbst als unsicher zeigte („Ich bin nicht sicher“), wurde **schlechter** bewertet. Auf „Die Zahl habe ich nicht hier“ passt nur Tenney. |
| wissen | `stegreif-w-008` (belegHinweis) | „… offen genannte Unsicherheit wurde nicht schlechter bewertet. Es sind Laborstudien, meist mit Studierenden.“ → „… Ein Rat mit offen genannter Unsicherheit („wahrscheinlich“) wurde nicht schlechter bewertet als ein sicherer – wer sich selbst als unsicher zeigt, wirkt aber etwas weniger kompetent. Darum: sicher sagen, was du weißt. Labor- und Online-Versuche.“ | wie oben; Gaertig arbeitete mit Online-Teilnehmenden, nicht mit Studierenden. Die Folgerung stützt genau die gelehrte Antwortform. |
| wissen | `stegreif-w-033` (belegHinweis) | „Offen genannte Unsicherheit …“ → „Ein Rat mit offen genannter Unsicherheit …“ | wie oben |
| wissen | `stegreif-w-085` (Mythos, text) | „… offen genannte Unsicherheit wird in Versuchen nicht schlechter bewertet.“ → „… ein Rat mit offen genannter Unsicherheit („wahrscheinlich“) wurde in Versuchen nicht schlechter bewertet als ein sicherer.“ | wie oben |
| einheiten-1 | `stegreif-1-01` (Karte) | „… wer viel vorbereitet hat, klingt auch spontan geordnet“ → „… wer viel schreibt, klingt auch spontan geordnet“ | Cicero (I 150) nennt ausdrücklich das Schreiben; so steht es auch in `w-100` und in der Quelle. |
| quellen | `haase2023` | ergänzt: gedruckt in Band 19(4), 708–736; kulturelle Erfahrung unter den stärksten Methoden; divergent schwächer als konvergent; „keine Hinweise auf Publikationsverzerrung – anders als Sio & Lortie-Forgues (2024)“ | Vollständigkeit und Ehrlichkeit; die alte Formulierung „reines Training des divergenten Denkens schwächer“ war ungenau. |

### Didaktik und Logik (5)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten-1 | `stegreif-1-06` (aha) | „Einfälle lassen sich aufwärmen wie Muskeln.“ → „Einfälle lassen sich aufwärmen.“ | Widerspruch zu `stegreif-v-0061`, wo „das Gehirn ist ein Muskel“ ausdrücklich als schiefes Bild gilt. |
| einheiten-1 | `stegreif-1-03` (schaetzen, aufloesung) | „Drei Punkte passen also sicher hinein“ → „… gut hinein“ | Cowan misst Wortlisten im Labor; „sicher“ verspricht mehr, als die Übertragung trägt (der belegHinweis sagt das selbst). |
| wissen | `stegreif-w-011` | „Ein Server, der volläuft, ist ein Kühlschrank **vor** dem Großeinkauf.“ → „… **nach** dem Großeinkauf.“ | Vor dem Einkauf ist der Kühlschrank leer – das Bild sagte das Gegenteil (richtig in `v-0067`). |
| wissen | `stegreif-w-094` (titel) | „Erfinden und Bewerten zugleich geht schlecht“ → „Finden, ordnen, formulieren – nicht alles zugleich“ | Quintilian (X 7,9) spricht von Finden, Ordnen und Formulieren, nicht vom Bewerten; der Text war richtig, der Titel nicht. |
| vorrat-01 | `stegreif-v-0007` (Muster 2) | „… abschalten, weil ich weiß, dass mich niemand vermisst“ → „… weil ich weiß, dass nichts Wichtiges an mir vorbeigeht“ | Der alte Grund passte nicht zu „erreichbar für Notfälle“. |

### Widerspruch zu `ruhe` (1)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen-1 | `stegreif-l-03` (lage, k2 Wahl 1 rueck, k3 Wahl 3) | Onkel wird **70**; „Siebzig Jahre …“; „Als ich zwölf war, hast du mir das **Radfahren** beigebracht – und bist neben mir hergerannt.“ → Onkel wird **60**; „Sechzig Jahre …“; „Als ich zehn war, hast du mir am See das **Schwimmen** beigebracht – und bist die ganze Zeit neben mir hergeschwommen.“ | In `ruhe-l-03` wird **Tante Renate** siebzig, und **sie** hat dir das Radfahren beigebracht. Wer beide Bereiche übt, hätte zwei Familiengeschichten gehabt, die sich widersprechen. Nebenbei: Mit zwölf Radfahren lernen war unglaubwürdig. |

### Sprache (5)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen-1 | `stegreif-l-04` (lage) | „Du steigst ins Erdgeschoss in den Fahrstuhl.“ → „Du steigst im Erdgeschoss in den Fahrstuhl.“ | Grammatik |
| tests | `stegreif-fc-009` (frage) | „… etwas, das du kurz verstehen musst“ → „… etwas, das du nicht sofort verstehst“ | unklar; zudem nah an der verbotenen Wendung „du musst“ |
| vorrat-01 | `stegreif-v-0013` (Eintrag 1) | „letztes Jahr war es fast doppelt so viel“ → „letztes Jahr waren es fast doppelt so viele“ | Bezug auf „Rückmeldungen“ |
| vorrat-01 | `stegreif-v-0045` (k2b, Wahl 2, rueck) | „Für sie heißt das: Er weiß es nicht.“ → „Für sie klingt das nach: Ich weiß es nicht.“ | Der Nutzer wurde als „er“ bezeichnet; jetzt neutral und wie in `v-0023`. |
| vorrat-02 | `stegreif-v-0074` (Karte 3) | „… wie eine Kasse im Supermarkt mit nur einer offenen Kasse“ → „… wie ein Supermarkt mit nur einer offenen Kasse“ | doppelt gemoppelt |

**Summe: 18 Korrekturen** (7 Fakten/Beleg, 5 Didaktik/Logik, 1 Widerspruch zu `ruhe` in drei Stellen derselben Lage, 5 Sprache). Danach `coach-index.mjs` neu erzeugt; `coach-pruefe.mjs --nur stegreif`: **0 Fehler, 0 Hinweise**.

## Offene Punkte (Ermessen – nicht geändert)

1. **Fast doppelte Testfragen.** Der Formcheck misst sonst Wiedererkennen statt Übertragen. Betroffen: `fc-019` ≈ `v-0091` (Brücke vom Gesprächsthema, sogar die falsche Antwort „warten, bis das Thema vorbei ist, dann von vorn“ fast wortgleich), `fc-016` ≈ `v-0081` („Ja, und ich bringe …“ / „Ja, aber …“ / „Können wir machen“), `fc-020` ≈ `v-0092` (Wortkette zum Erlebnis), `fc-018` ≈ `v-0082` (Bedenken erst ausbauen, dann als Frage), `fc-024` ≈ `v-0072` (Vergleich mit Zufall statt Ursache), `fc-010` ≈ `1-04-c`/`v-0044` (zugeben und nachliefern). **Empfehlung:** sechs neue Szenarien mit gleichem Lernziel, aber anderer Lage und anderer Fehlerart; in `NACHARBEIT.md` aufnehmen.
2. **Lagen: beste Wahl meist die längste.** In den Auswahlfragen ist es mit 35 % gut. In Lagen und Dialogen aber ist die beste Wahl in 32 von 46 Knoten (70 %) die längste. Wer rät, kommt so oft durch. **Empfehlung:** In Stufe 2 bei etwa zehn Knoten die schwache Wahl ausführlicher oder die beste knapper machen (z. B. `l-01` k1, `l-02` k2, `l-05` k2).
3. **Stelle der besten Antwort.** In 44 von 48 Auswahl- und Testfragen steht sie an erster oder zweiter Stelle, nur viermal an dritter, nie an vierter. **Empfehlung:** bei einigen Fragen umstellen (reine Reihenfolge, kein Inhalt).
4. **Missions-Sprossen vs. Kursreihenfolge.** Einheit 2 führt zur Mission auf Sprosse 5, Einheit 3 zu Sprosse 7, Einheit 6 zu Sprosse 2. Die Schwierigkeit springt also. Das ist vertretbar (die Leiter ist eine eigene Ordnung), sollte aber bewusst so sein. **Empfehlung:** Hauptstrang bestätigt oder ordnet die Sprossen nach dem Kursverlauf.
5. **Gleicher Titel in zwei Bereichen.** `stegreif-w-002` und `konter-w-008` heißen beide „Vorrat schlägt Geistesblitz“. Inhaltlich passt es zusammen. **Empfehlung:** einen Titel ändern, damit die Suche nicht zwei gleiche Treffer zeigt.
6. **Gaertig 2018 noch einmal am Volltext.** Die Verlagsseite war gesperrt. Gesichert aus Zusammenfassungen: Unsichere Ratschläge wurden nicht schlechter bewertet, bei freier Wahl oft vorgezogen; Ausnahme „wahrscheinlich“ bei sonst sicher auftretenden Ratgebern; wer sagt „Ich bin nicht sicher“, wirkt weniger kompetent. Die Quelle `gaertig2018` ist so korrekt.
7. **`v-0087`/`v-0088` (Wortketten) im Format `jaund`.** Das Format passt technisch, ist aber fürs Annehmen von Ideen gedacht. **Empfehlung:** bei Gelegenheit ein eigenes Format oder `umformulieren` – nicht dringend.
8. **`v-0044` „Die Frage im Baumarkt“**, die Lage spricht vom „Laden eines Freundes“. Kleiner Bruch; Titel „Die Frage im Farbenladen“ wäre stimmiger.
9. **Cicero „mit kurzer Bedenkzeit“ (`1-01`, `w-100`).** Bei Cicero heißt es „nach genommener Bedenkzeit“; „kurz“ steht nicht da. Harmlos.
10. **Quelle `schneider-profis` mit `geprueft: false`** und `praxis-stegreif` (Sammelquelle, `false`): Beide nur ohne Zahlen und für P-Einträge genutzt – regelkonform. Erscheinungsjahr Schneider (1982 als stern-Buch) bei Gelegenheit nachtragen.

## Didaktik – Einzelurteil der Einheiten

| Einheit | Dauer realistisch | Aufbau | Bemerkung |
|---|---|---|---|
| `1-01` Vorbereitete Spontaneität | ja (6) | mythos → karte → zuordnen → auswahl → bauplan → reflexion → Mission | Entlastet sofort: „Die Bausteine sind nicht neu.“ Gut für Menschen, die sich bei Spontanfragen schämen. |
| `1-02` Antwort zuerst | knapp (7) | vergleich → studie → karte → rangfolge → umformulieren → auswahl → Mission | PGBP sauber erklärt; Studie ehrlich begrenzt. |
| `1-03` Drei Dinge | ja (7) | schaetzen → karte → blitz → bauplan → auswahl → sprechen (mit stiller Ersatzübung) → Mission | „Fallen dir nur zwei ein, sag zwei“ nimmt Druck raus. |
| `1-04` Zeit gewinnen | knapp (7) | schaetzen → karte → zuordnen → dialog → auswahl → reflexion → Mission | Kern des Bereichs; der Dialog fängt auch die schwache Wahl freundlich auf. |
| `1-05` Der Kern in einem Satz | ja (6) | vergleich → karte → kern (15 Wörter) → fehler → auswahl → Mission | Wortgrenze fair, Muster deutlich darunter. |
| `1-06` Wortfluss | ja (6) | studie → karte → blitz (60 s) → auswahl → umformulieren → reflexion → Mission | Ehrlich zur kleinen Wirkung; der Vergleich als Sonderform ist gut eingeführt. |
| `1-07` Ja, und | knapp (7) | vergleich → studie → karte → jaund → zuordnen → anschluss → Mission | Bewerten wird nicht verboten, nur verschoben – wichtig gegen falsches „alles gut finden“. |

Die Einheiten bauen sinnvoll aufeinander auf; Blitz-Runden haben erreichbare Ziele (3–8 Einfälle in 20–60 Sekunden) und gelten bei „ohne Zeitdruck“ nicht (das Prüfskript bestätigt, dass jeder Übungstag ohne Uhr und leise doppelt gefüllt ist). Jede Auswahlfrage hat genau eine beste und eine brauchbare Antwort; die `wert: 1`-Antworten sind wirklich brauchbar. Die Lagen sind auf jedem Weg folgerichtig, alle schwachen Wege enden mit „Kein Drama“ und einem konkreten Rat. Missionen steigen sinnvoll an, jede hat eine halbe Fassung, Taktik oder rote Linie kommen nur als Erkennen vor (`w-038`, `w-039`). Kursplan: 7 E, 7 Ü, 4 L, 2 A, 1 S wie vorgeschrieben. Besetzung eingehalten, keine echten Firmen oder Marken.

## Urteil

**Freigabereif: ja.** Alle eindeutigen Fehler sind behoben, das Prüfskript meldet 0 Fehler und 0 Hinweise. Die offenen Punkte 1 (fast doppelte Testfragen) und 2 (beste Wahl in Lagen meist die längste) sollten vor der Freigabe für alle Nutzer erledigt sein; für die Freigabe an Davide blockieren sie nicht.
