# Gegenlesen: Bereich `mut` („Mut & Souveränität“)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser aus drei Blickwinkeln: Verhaltenstherapie mit Schwerpunkt soziale Angst (Clark & Wells, Exposition nach Craske, Sicherheitsverhalten), schüchterner und leicht beschämbarer Nutzer, Faktenprüfung · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/01_KONZEPT.md` (Abschnitt 10 und 18: Regeln für Missionen und Mutproben, auch „keine Dienstleistenden, die nicht weg können“), `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `derCoach/04_WISSEN_ANTRIEB.md` Abschnitt 1, Lehrplan `05` Abschnitt 3.3, `gegenlesen/NACHARBEIT.md` und `gegenlesen/selbst.md` als Vergleich.
- Alle Dateien in `src/coach/inhalt/mut/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`. Dazu `besetzung.json`, `gemeinsam.json` (Fachhilfe `seele`), die gemeinsamen Quellen und die Nachbarbereiche `ruhe/` und `selbst/` auf Widersprüche (Stichwortkarte, Krücken, Glas, Zettel).
- An der Quelle geprüft (Abstract, Volltext oder Presse der Autoren):
  - Warnock-Parkes u. a. 2017: 47 Patienten, 98 % wirkten nach eigener Einschätzung besser als vorhergesagt, keine Kontrollgruppe. ✓
  - Ebrahimi u. a. 2019: g = 0,74 über 62 Vergleiche (30 RCTs), Wirkung hält an (Nachuntersuchung g = 1,11), technikgestützte Formen nicht schlechter. ✓
  - Wells u. a. 1995: Fallserie mit acht Personen, je eine Übung mit und ohne Schutzverhalten. ✓
  - Cristea, Kok & Cuijpers 2015: 49 Studien. Sie decken aber **alle** Bias-Trainings ab (Aufmerksamkeit und Deutung) und betreffen Angst **und** Depression. Die Effekte sind klein und nach Entfernen der Ausreißer bzw. nach Korrektur der Veröffentlichungsverzerrung nicht mehr signifikant. Die Wiedergabe in `mut` war zu eng („Spiele, die den Blick … trainieren“) und wurde korrigiert.
  - Flynn & Lake 2008: Die Hilfsbereitschaft wurde „um bis zur Hälfte“ unterschätzt. ✓ Bohns 2016: im Mittel etwa 48 %. ✓
  - Sandstrom, Boothby & Cooney 2022: eine Woche als Schnitzeljagd, Studierende. Danach weniger erwartete Ablehnung und mehr Zutrauen, auch eine Woche später noch. ✓
  - Boothby u. a. 2018: Labor, Wohnheim (über Monate) und Workshop. Bei Schüchternen war die Lücke größer (nur über Sekundärquellen bestätigt). ✓
  - A-Tjak u. a. 2015: 39 RCTs, besser als Kontrollbedingungen, kein signifikanter Unterschied zur KVT. ✓
  - Mayo-Wilson u. a. 2014: Einzel-KVT schnitt am besten ab, Selbsthilfe war besser als Warteliste. ✓
  - Gilovich u. a. 2000: Die Träger schätzten etwa die Hälfte, tatsächlich war es etwa ein Viertel. Die genaue Zahl („unter einem Viertel“) ließ sich nicht sicher bestätigen, darum gilt jetzt „etwa ein Viertel“.
  - McWilliam u. a. 2025 hat g = 1,17 (nicht 0,74). In `mut` steht 0,74 richtig bei Ebrahimi, siehe offenen Punkt 2.
- Nach Quellenbeschreibung und Fachstand, ohne neuen Abruf: Craske 2014 (das Sinken der Angst während der Übung sagt den Erfolg nicht verlässlich voraus), McManus 2008, Blakey & Abramowitz 2016 (Befunde begrenzt und gemischt), Butler („Buch auf Rezept“) und Jiang (100 Tage, keine Studie). Durchsetzungsfähigkeit steht wie verlangt **ohne Effektgröße** (`speed2018`, `w-011`).
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur mut`. Vorher: 0 Fehler, 0 Hinweise. Nachher: **0 Fehler, 0 Hinweise** (insgesamt 0 Fehler). Zusätzlich habe ich mit einem eigenen Zählskript geprüft, wie oft die beste Antwort die längste ist. Das Prüfskript zählt die Lagen dabei nicht mit.

## Gesamteindruck

Der Bereich ist fachlich stark und für schüchterne Menschen behutsam gebaut. Er stellt den Abgleich „befürchtet – passiert“ statt des Aushaltens ins Zentrum, so wie es Craske lehrt. Krücken werden schrittweise abgebaut, und es steht ehrlich dabei, dass ihr Nutzen umstritten ist (Blakey). Die Leiter beginnt bei 30 bis 40, ein Nein gilt als Erfolg, und der Weg zur Fachhilfe `seele` steht gleich in Einheit 1 (ohne Rufnummern im Text). Gefühle werden nie als falsche Antwort gewertet. Die Rückmeldungen sind nicht beschämend.

Die Mängel lagen woanders:
- Mehrere Lagen hatten Wege, auf denen ein Knoten etwas voraussetzt, das auf diesem Weg nie geschehen ist.
- In den Lagen war die beste Antwort in 29 von 32 Knoten die längste.
- Eine Mutprobe und eine Übung richteten sich an Café- bzw. Restaurant-Personal (Konzept-Regel).
- Zwei Studien waren ungenau wiedergegeben.
- Dazu kamen kleinere Sprachfehler.

## Korrekturen (alle Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Sicherheit und Ethik (4)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| leiter | `mut-m-10` (auftrag) | „… oder im Café, ob du dir das Rezept für den Kuchen abschreiben darfst.“ → „… oder auf dem Flohmarkt, ob du zwei Teile zum Preis von einem bekommst. Nicht bei Menschen, die bei der Arbeit nicht wegkönnen und kaum Nein sagen dürfen.“ | `01`, Abschnitt 18: Keine Zwangslage für Dienstleistende, die nicht weg können. Café-Personal kann einem Gast schwer ausweichen und darf ein Hausrezept oft gar nicht herausgeben. Auf dem Flohmarkt ist Feilschen üblich, ein Nein ist dort leicht. Sprosse 10 bleibt. |
| vorrat-02 | `mut-v-0084` (Karten 1 und 5) | „im Café fragen, ob du das Kuchenrezept abschreiben darfst“ (passt) → „auf dem Flohmarkt fragen, ob du zwei Teile zum Preis von einem bekommst“ (passt). „im Restaurant fragen, ob du kurz einen Blick in die Küche werfen darfst“ (passt) → „die Bedienung im vollen Restaurant um etwas Ungewöhnliches bitten“ (**passt nicht**) | Gleiche Regel. Die Übung lehrte bisher das Gegenteil. Jetzt lehrt sie die Regel selbst. |
| wissen | `mut-w-123` (Spickzettel „Regeln für Mutproben“) | „nicht in Bahn oder Aufzug.“ → „nicht in Bahn oder Aufzug, nicht bei Dienstleistenden, die nicht wegkönnen.“ | Der dritte Teil der Konzept-Regel fehlte. |
| wissen | `mut-w-113` | „Der beste Übungsplatz für Mutproben …“ → „Ein guter Übungsplatz für Missionen und Mutproben … – auch nicht Menschen, die bei der Arbeit nicht wegkönnen.“ | „Mutproben auf dem Amt“ widersprach derselben Regel. Außerdem war es ein Superlativ ohne Beleg. |

`mut-m-09` (Buchtipp bei einer anderen Kundin, die stöbert) ist in Ordnung. Das Konzept nennt genau dieses Beispiel, und die Person kann leicht weitergehen. Auch die halbe Fassung „die Buchhändlerin fragen“ ist in Ordnung, weil das zu ihrer Arbeit gehört (siehe offenen Punkt 4).

### Fakten und Quellen (5)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten | `mut-1-03` (Schritt `schaetzen`: Option 3 und auflösung) | „nach den Berichten (über die Studie) unter einem Viertel“ → „etwa ein Viertel“ | Die genaue Zahl ist nicht sicher bestätigt. „Etwa ein Viertel“ deckt die Angaben ab. Der Zusatz „nach den Berichten“ klang nach ungeprüfter Zweitquelle. |
| wissen | `mut-w-006` | wie oben | wie oben |
| einheiten | `mut-1-04` (Schritt `mythos`, warum) | „Solche Spiele zeigten über 49 Studien nur kleine Effekte“ → „Solche Bildschirm-Trainings zeigten in einer Auswertung von 49 Studien zu Angst und Depression nur kleine Effekte“ | Cristea 2015 umfasst alle Bias-Trainings, nicht nur Aufmerksamkeitsspiele, und auch Depression. |
| wissen | `mut-w-086` | „Spiele, die den Blick weg von bedrohlichen Gesichtern trainieren, zeigten über 49 Studien …“ → „Bildschirm-Trainings, die Aufmerksamkeit oder Deutungen umlenken sollen – etwa den Blick weg von bedrohlichen Gesichtern –, zeigten in einer Auswertung von 49 Studien zu Angst und Depression nur kleine Effekte. Nach Bereinigung waren sie nicht mehr sicher.“ | wie oben |
| vorrat-01 | `mut-v-0019` (Karte 5) | „wie lange sich andere an unser peinliches T-Shirt erinnern“ → „wie viele unser peinliches T-Shirt bemerken“ | Gilovich hat gemessen, wie viele das T-Shirt bemerkten, nicht wie lange sie sich erinnern. |

### Logik der Lagen und Dialoge (9)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen | `mut-l-01` k2b, Wahl 2 | `weiter: ende3` → `ende2` (Text zusätzlich verlängert, siehe Didaktik) | `ende3` lautet „Nacharbeit, weil die falsche Regel angewendet wurde“. Lena hatte die Regel aber gerade erklärt. |
| lagen | `mut-l-01` ende1 (ende) | „… Ergebnis abgeglichen. Genau dieser Abgleich …“ → „Befürchtung benannt, Frage gestellt – und Lena hatte dieselbe Frage. Der Abgleich „befürchtet – passiert“ macht die nächste Frage leichter.“ | Auch die Wahlen 0 und 1 in k3 („Glück gehabt“) führen zu `ende1`. Dort war aber nichts abgeglichen worden. |
| lagen | `mut-l-02` k4 (sagt + Wahl 1) | „Draußen denkst du an deinen Zettel.“ / „…, 70. Passiert …“ → „… an deine Befürchtung von vorhin.“ / ohne „70“ | Über k1, Wahl 1 (Handy) gab es keinen Zettel und keine Zahl. |
| lagen | `mut-l-03` k1b, Wahl 2 | `weiter: k3` → `k3b`; rueck „Gesagt ist gesagt. Nur …“ → „Sicher – nur denkst du hinterher: Gut gegangen, wegen des Handys.“ | Wer abliest, kann in k3 keinen frei gesprochenen Satz mehr wählen. `k3b` („deinen Satz sagen“) passt. |
| lagen | `mut-l-03` k2 (sagt) | „Sie: „Ja, zum ersten Mal. …““ → „Sie erzählt: „Ich bin zum ersten Mal hier und hatte noch nie Ton in der Hand.““ | Über k1, Wahl 1 („zurücklächeln und schweigen“) gab es keine Frage, auf die sie hätte antworten können. |
| lagen | `mut-l-03` k3b (sagt) | „Weil du die ganze Zeit an deinen Satz gedacht hast“ → „Weil du die ganze Zeit bei deinem Satz warst“ | Der Satz passt jetzt auf beide Zuwege (Kopf-Probe und Handy). |
| lagen | `mut-l-03` ende1 (ende) | „Krücke weg, Blick nach außen, Sprosse gegangen. …“ → „Mitgemacht statt zugeschaut. So fühlt sich eine Sprosse an: … Jede Krücke, die du heute weggelassen hast, kommt auf die Beweisliste.“ | Der Satz behauptete auch auf Wegen mit Ablesen und Kopf-Probe „Krücke weg, Sprosse gegangen“. |
| lagen | `mut-l-05` ende1 (sagt) | Sven: „Respekt. Du hast heute alles mitgenommen.“ → „Respekt. Vor all den Leuten.“ | Über k1b, Wahl 2 wird die Mutprobe ausgelassen. „Alles mitgenommen“ stimmte dann nicht. |
| vorrat-02 | `mut-v-0073` (k2, Wahl 3, und ende1) | „Stimmt. Ich übe das gerade. Der Nachtisch wird gut.“ → „Stimmt. Ich übe das gerade – und es bleibt dabei.“; ende1: „Na gut. Aber der Nachtisch muss gut sein.“ → „Renate seufzt, dann lacht sie: „Na gut. Dann frag ich deinen Cousin.““ | Über k1, Wahl 2 („Nein.“) wurde nie ein Nachtisch angeboten. |

### Didaktik (5)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen | 14 Knoten in `l-01`, `l-02`, `l-03` | Schwache Wahlen glaubwürdiger und länger formuliert (Inhalt und Wert gleich): `l-01` k1/W2, k2/W1, k2b/W2, k2c/W2, k3/W2 · `l-02` k1/W2, k1b/W2, k2/W1, k2c/W2, k3/W2, k4/W2 · `l-03` k1/W3, k1b/W2, k2/W3 | Die beste Antwort war in **29 von 32** Lage-Knoten die längste, jetzt in **16 von 32** (höchstens die Hälfte). Ein unsicherer Nutzer lernte sonst „nimm die längste“. In `l-01` k2/W1 enthält die Entschuldigungs-Fassung jetzt auch die Frage. Das passt zur Rückmeldung „Die Frage ist gestellt“. |
| einheiten | `mut-1-07-b` (Antwort 2, `wert: 1`) | „Sie hat sicher einen Grund. Ich hätte meine Bitte besser begründen sollen.“ → „Sie hat sicher ihre Gründe. Vielleicht frag ich ein andermal.“; warum angepasst | Die halbe Wertung belohnte Selbstvorwürfe („hätte besser begründen sollen“). Das widerspricht der Lehre „ein Nein gilt der Bitte“ (`NACHARBEIT`: sachlich falsche halbe Punkte). Statt auf 0 zu setzen, ist sie jetzt eine echte brauchbare Antwort. |
| einheiten | `mut-1-02-m1` (frage) | „Was lernst du aus einer Mutprobe am meisten?“ → „… aus einer Mission …“ | „Mutprobe“ ist der Fachbegriff für die harten, freiwilligen Challenges (ab Stufe 2). In Einheit 2 geht es um Missionen. |
| tests | `mut-fc-002` | Mail statt Anruf, „Schreib-Mensch“ → nach dem Vereinstraining nicht mehr zusammensitzen, „Gruppen-Mensch“, erste Sprosse „eine halbe Stunde mitgehen“ | Fast wortgleich mit `mut-v-0002` (Mail statt Anruf, „Mail-Mensch“). Testfragen dürfen Übungen nicht gleichen. Lernziel und Werte sind gleich geblieben. |
| tests | `mut-fc-004` (Antwort 3) | „Mindestens zwei Eltern verdrehen die Augen oder tuscheln.“ → „Mindestens zwei Eltern lachen oder tuscheln, während ich frage.“ | Fast wortgleich mit `mut-1-02-a` („Mindestens zwei verdrehen die Augen“). |

Dazu kommt `mut-w-024` (Beispiel): Ziel „Einwand anmelden (90)“ → „(85)“. Es ist dieselbe Leiter wie in `mut-1-05-a` (25/40/55 … 85). Die beiden Zahlen widersprachen sich.

### Sprache (6)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen | `mut-l-03` k2, Wahl 3 | „ob du als Letzte drankommen kannst“ → „ob du zum Schluss drankommen kannst – dann hast du mehr Zeit, dich zu sammeln“ | Die Form legte den Nutzer auf weiblich fest (der Nutzer ist „du“). Gleichzeitig ist das ein Ausgleich der Längen. |
| lagen | `mut-l-03` k1b und k2 (sagt) | „Du kommst als viertes an die Reihe.“ → „Vor dir sind drei andere dran.“ | „als viertes“ ist grammatisch falsch und müsste „als Vierte/r“ heißen (ebenfalls gegendert). |
| vorrat-01 | `mut-v-0003` (frage) | „nach dem bekanntesten Modell“ → „nach einem bekannten Modell“ | Superlativ ohne Beleg. |
| vorrat-01 | `mut-v-0016` (warum) | „das heute führende Lernmodell“ → „ein heute verbreitetes Lernmodell“ | wie oben |
| vorrat-02 | `mut-v-0055` (Karte 6) | „die Antwort einfach sagen“ → „die Antwort direkt sagen“ | Regel `06`: kein „einfach“ als Verharmlosung. Gerade das fällt Ängstlichen nicht leicht. |
| vorrat-01 | `mut-v-0041` (Muster 1) | „knallrot und stotternd“ → „knallrot und mit zitternder Stimme“ | Stottern sollte nicht als Schreckbild für Blamage dienen. Der Coach hat einen eigenen Schwerpunkt Stottern und die Figur Jonas. |

Außerdem `mut-v-0082` k1b: „Wortlos die Tür zuziehen.“ → „Wortlos umdrehen und gehen.“ Man steht vor Frau Sommers Tür und zieht nicht ihre zu.

**Zusammen: 31 Korrekturen**, davon ist eine der Sammelposten mit 14 Ausgleichen der Längen. Nach Art: Sicherheit/Ethik 4, Fakten/Quellen 5, Logik der Lagen 9, Didaktik 6 (Längen als ein Posten), Sprache 7. Die Anzahl der Fragen, bei denen die beste Antwort die längste ist: Einheiten 0/7, Lagen 16/32, Tests 11/24, Vorrat 3/18 und 17/36.

## Geprüft und in Ordnung

- **Zahlen:** g = 0,74, 98 %, 47, acht Personen, 49 Studien, 39 Studien, „um bis zur Hälfte“, „etwa die Hälfte / ein Viertel“. Alle Zahlen stehen bei Quellen mit `geprueft: true` und stimmen. Quellen mit `geprueft: false` (`baumeister1995`, `mowrer1960`, `aristoteles-ethik`, `jeffers1987`, `hayes2005`, `lazarsfeld`, `praxis-mut` sowie die gemeinsamen `tangney2007`, `brown2012`, `adler1927`, `kahler1975`, `seneca`, `harris2011`) kommen nur ohne Zahlen vor.
- **Beleg-Stufen** sind ehrlich: Exposition A, Leiter mit A und dem Hinweis „Reihenfolge offen“, Krücken B mit Blakey als Gegenstimme, Mythen U, Denkmodelle D (Mowrer „in Einzelheiten widerlegt“, Adler, Antreiber). Die Nein-Formel ist als Praxiswissen gekennzeichnet. Bei Ablehnungs-Übungen steht offen: „keine kontrollierten Studien“.
- **Sicherheit:** Alle Mutproben sind `ort: privat` und mit „ein Nein ist ein Erfolg“ formuliert: eine Bitte, ein Dank, kein Nachhaken. Am Arbeitsplatz gibt es keine Mutproben (`w-110`, `v-0080`). Die Fachhilfe `seele` mit der Karte „Wenn es mehr ist“ steht in Einheit 1, dazu `w-095` und `fc-003` (Panik, Alkohol → Hausarztpraxis). Im Inhalt stehen keine Rufnummern. Die rote Linie (Schuld einreden, Zermürben, erfundene Eile) kommt nur zum Erkennen und Abwehren vor. „Erst das kleine Ja“ ist richtig als Taktik mit `preis` und `abwehr` eingeordnet.
- **Leiter:** Die Missionen bauen von Sprosse 1 bis 10 auf. Jede hat eine halbe Fassung. Einstieg 30 bis 40, Wiederholen, Orte wechseln und „kleiner schneiden statt aufgeben“ stehen in Regel, Merkkarte, Mission, Wissen und Spickzettel ohne Widerspruch.
- **Sprache:** Kein „du musst“ und kein „musst du“, auch nicht in `kern`, `einleitung` und `ziel`. Es gibt nur Figuren aus der Besetzung, die Du-Form ist durchgehalten, und kein Gefühl wird als falsche Antwort gewertet.
- **Nachbarbereiche:** Die Stichwortkarte ist in `mut` (`1-06`, `v-0056`, `v-0057`) und in `ruhe` gleichermaßen ein **Werkzeug**. Sie wird erst zur Krücke, wenn man glaubt, ohne sie gehe es schief. Das ist kein Widerspruch. Zu `selbst` habe ich keinen Widerspruch gefunden.

## Offene Punkte (Ermessen – nicht geändert)

1. **Lehrplan nachziehen:** Einheit 7 heißt im Lehrplan `05` „Erste Hilfe für den Moment“ (Atem, Notfallkoffer). Umgesetzt ist sie als „Ein Nein sagen, ein Nein hören“. Das ist folgerichtig, denn der Atem gehört zu `ruhe`, und Leiter und Kurs passen dazu. **Empfehlung:** `05` Abschnitt 3.3 anpassen. Dann „Nein sagen in drei Teilen“ in Stufe 2 umbenennen, damit es nicht doppelt vorkommt.
2. **`w-002` nennt `mcwilliam2025` neben „g = 0,74“.** Die Zahl gehört zu Ebrahimi. McWilliam fand g = 1,17 bei starker Streuung. Falsch ist das nicht, kann aber missverstanden werden. **Empfehlung:** einen Halbsatz ergänzen („eine neuere Auswertung fand einen noch größeren, aber stark schwankenden Effekt“) oder `mcwilliam2025` dort streichen.
3. **Fast doppelte Testfragen, die noch übrig sind:**
   - `fc-009` ≈ `v-0036`: gleiche halbe Antwort „ausatmen und weiter zuhören“ mit fast gleicher Begründung.
   - `fc-022` ≈ `v-0086`: Einwand mit Entschuldigung.
   - `fc-018` übernimmt den Abwehrsatz aus `w-051` wörtlich.
   - `fc-010` ≈ Glas bzw. Tasse in `1-06`.

   **Empfehlung:** in `NACHARBEIT.md` aufnehmen.
4. **`mut-m-09`:** In einer **Bücherei** (Lesesaal) kann ein Gespräch andere stören. **Empfehlung:** „in einer Buchhandlung oder auf einem Büchermarkt“. Bei der halben Fassung eher „um einen Buchtipp“ statt „nach ihrem Lieblingsbuch“ fragen, das ist weniger persönlich.
5. **Spannung zu `ruhe`:** In `ruhe` gibt es das Prinzip „nichts Loses in zitternden Händen“ und ein „großes Glas Wasser“. In `mut` gelten Zittern verstecken (Arme verschränken, Tasse festhalten, `fc-010`, `v-0054`) und das Glas als Halt als Krücke. Beides lässt sich vereinbaren: Das Blatt weglegen, damit es nicht raschelt, ist praktisch. Das Zittern verbergen, damit es niemand sieht, ist eine Krücke. **Empfehlung:** in `ruhe` einen Halbsatz ergänzen oder in `mut-1-06` die Unterscheidung „wozu?“ an diesem Beispiel zeigen.
6. **Reihenfolge der Leiter:** Die Sprossen folgen den Einheiten, nicht strikt der Schwierigkeit. `m-04` (zwei Details am Gegenüber) ist für viele leichter als `m-02` und `m-03`. Weil der Nutzer selbst wählt und der Coach „knapp über dem Gewohnten“ vorschlägt, ist das unkritisch. Ich empfehle nur, es im Hinterkopf zu behalten.
7. **Experiment in `mut-1-07`** („bitte um etwas Kleines, bei dem ein Nein gut möglich ist“) ist schon eine kleine Mutprobe, vor „Die erste Mutprobe“ in Stufe 2. Es ist privat und harmlos, also in Ordnung. Wer sehr ängstlich ist, findet es vielleicht früh. **Empfehlung:** den Zusatz „gern bei einer vertrauten Person“.
8. **Quelle `gilovich2000`** (gemeinsame Datei) trägt `geprueft: true`, nennt aber keine Zahlen. **Empfehlung:** die Werte aus dem Volltext nachtragen (Schätzung etwa 50 %, tatsächlich etwa 25 %, Studie 1). Die Datei gehört nicht zu `mut`, deshalb habe ich sie nicht angefasst.
9. **`mut-v-0084`** hat nach der Korrektur zwei Karten „passt“ und vier „passt nicht“. Das ist in Ordnung, könnte aber mit einer dritten harmlosen Bitte („auf dem Wochenmarkt nach einer einzelnen Möhre statt eines Bundes fragen“) ausgeglichen werden. Das würde allerdings die Struktur ändern.

## Urteil

**Freigabereif: ja** (für Davide, nach den Korrekturen oben). Die offenen Punkte blockieren nicht. Die Punkte 1–4 sollten vor der Freigabe für alle erledigt sein.
