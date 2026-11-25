# Der Coach – Entscheidungen und Korrekturen (Stand 25.11.2026)

**Diese Datei geht allen anderen Dateien in `derCoach/` vor.** Sie hält fest, was Davide am 24./25.11.2026
entschieden hat und was die Nachrecherche korrigiert hat. Der vollständige Umsetzungsplan liegt in
`C:\Users\User\.claude\plans\elegant-conjuring-catmull.md`; die Schreibanleitung für Inhalte in
`src/coach/inhalt/LIESMICH.md`, die technische Übersicht in `src/coach/LIESMICH.md`.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Annahmen aus `00`, Abschnitt 5 | gelten alle |
| Figur | heißt **Bruno**; aus vier Entwürfen hat Davide am 25.11.2026 **Entwurf 1** gewählt (Boxhalle, Arme verschränkt). Damit entstanden 10 Haltungen und 6 Raumbilder (12 Credits). Rohbilder in `.tmp-test/coach/bilder-roh/`, WebP in `public/coach/bilder/` |
| Bereiche | Beim Einstieg sieht man alle 14 und wählt frei. Jeder Bereich hat eine **eigene, immer erreichbare Seite** (Überblick, Wissen, Üben, Echtes Leben, Werkzeuge) – „wie eine eigene App“, nur die besten Tipps. Die getrennte Bibliothek entfällt |
| Kurs | tägliche, aufeinander aufbauende Lernpakete; **rund 60 Lerntage je Bereich** (Phasen Grundlagen 21 · Können 20 · Meisterschaft 18), Schwerpunkte je 15; zusammen rund 885 Lerntage; danach Freilauf/Meisterklasse |
| Verteilung | **Staffel**: 3 / 4 / 6 Bereiche (10 / 15 / 30 Minuten) bekommen neue Lektionen, die übrigen laufen über Wiederholungen mit und rücken nach; jederzeit änderbar bis „alle“ |
| Erste Lieferung | **alle 14 Bereiche** (Phase Grundlagen) plus die drei Schwerpunkte |
| Stufen | fünf statt sechs: 1 alles in Grundfassung · 2 Echtes Leben und Antrieb · 3 Können · 4 Stimme, Bild, Ton · 5 Meisterschaft |
| Sichtbarkeit | zunächst **nur Davide**; Freigabe für alle erst auf sein Wort |
| Higgsfield | 100 Credits, dazu 20 Reserve nur nach Meldung; Buchführung `credits.json` |
| `derCoach/` | darf ins Repository, nicht ins Setup |
| Einfluss und Manipulation | **dürfen hinein: alles erklären, Taktik trainieren.** Drei Klassen: fair · Taktik · rote Linie. Die rote Linie (erfundene Tatsachen, Ausnutzen von Abhängigkeit, Zermürben, Schuld einreden, ein Nein übergehen, Verführungsratgeber-Tricks) wird vollständig erklärt, erkannt und abgewehrt – ohne Einsatz-Übung und ohne Mission. Taktik-Missionen nur im Verkauf, in der Verhandlung, beim privaten Kauf. Flirt-Regeln aus `01`, Abschnitt 18, unverändert |
| Vergleichsaufnahmen | ja: höchstens acht, je 30 Sekunden, lokal und verschlüsselt, nur nach ausdrücklichem Ja |
| Ursprünglicher Auftrag | gilt neben den Dateien als Maßstab: „mehr Inhalt als Bücher“, die besten Bücher, die besten Tricks, Tiefenpsychologie, Lebensziele und Vorhaben-Pop-ups früh (Stufe 2), maximale Motivation bei ehrlichem Inhalt |

## Abweichungen von `02_TECHNIK.md`

Kursplan mit Lerntagen (E Einheit · Ü Übungstag · L Lage · A Anwendung · S Sparring) und die neue Inhaltsart
„Lage“ · Rundencheck statt Sparring je Runde · Formcheck je Bereich nach 20 seiner Lerntage · Schwierigkeit aus
dem Fähigkeitswert innerhalb eines Bandes je Phase · Host-Schnittstelle erweitert · Kennungen nie an Positionen
gebunden (Fortschritt = Menge erledigter Lerntage) · Kalendertag in Ortszeit · Größenmessung über Vite ·
Export/Import/Löschen schon in Stufe 1 · Kachel und Erinnerung nennen nie Bereiche · keine festen Geldbeträge.
Im Bereich `aussprache` zählen Kern-Lagen ab `aussprache-l-51` und der Sparring-Lerntag heißt `aussprache-s-51`
(weil `aussprache-l-01…`/`aussprache-s-01…` die Lispeln- und Stottern-Einheiten sind).

## Korrekturen aus der Nachrecherche

| Stelle | Bisher | Richtig |
|---|---|---|
| Stottern, Häufigkeit (`03` 9.7, Muster `aussprache-s-01`) | etwa einer von hundert Erwachsenen | weniger als einer von hundert (etwa 0,8 % der Männer, 0,2 % der Frauen); Kinder mindestens fünf von hundert |
| Stottern, Therapie (`03` 9.7) | beide Wege gleichrangig „belegt“ | Sprechrestrukturierung: starke Empfehlung; Stottermodifikation und Kombination: „kann“ |
| Heiserkeit (`03` 9.5) | länger als drei Wochen | länger als **vier** Wochen (S2k-Leitlinie Dysphonien 2022) |
| Zuzahlung Logopädie | 10 % plus 10 Euro | ändert sich zum 1.1.2027 → kein fester Betrag im Text |
| Rituale (`04` 2.1, `brooks2016`) | „senkte die Angst“ | Studie **zurückgezogen** → gestrichen; Routinen stützen sich auf die Sport-Meta-Analyse |
| Verlauf der Aufregung (`04` 2.1) | „ohne Ausnahme“ | Gipfel kurz vor dem Start oder in der ersten Minute, danach sinkt sie – wie schnell, ist verschieden |
| Umdeuten (`ruhe-1-03`) | „schneidet besser ab“ | man erlebt die Aufregung eher als Vorfreude (begeisterter), aber nicht weniger Angst; Leistungsgewinn nach einer Wiederholung unsicher (B, umstritten) |
| Atmen direkt vor dem Auftritt | „kaum untersucht“ | Körper reagiert schon in einer Sitzung messbar; fürs Gefühl nur kleine Einzelstudien; für eine einzelne Minute keine Daten |
| „Aber du entscheidest“ (`ueberzeugen-1-01`) | „wer die Freiheit lässt, hört öfter Ja“ | saubere Studien zeigen keinen sicheren Effekt → Haltung, kein Wirkversprechen |
| Vorstellungsgespräch | Einzelstudie | Meta-Analysen: Stärken ehrlich herausstellen wirkt; Flunkern bringt im Schnitt nichts |
| Erste Zahl in der Verhandlung | Einzelstudien | Meta-Analyse 2025: wer zuerst nennt, liegt vorn; überzogene Zahlen kosten Abschlüsse |
| Gewohnheiten (`04` 4) | im Mittel rund zwei Monate | meist um zwei Monate (Median), im Durchschnitt drei bis fünf; Spanne 4 bis 335 Tage |
| Erinnerungen (`04` 6) | nutzen sich ab | wirken vor allem kurz danach; ob sie nachlassen, ist uneinheitlich |
| „85 Prozent Treffer“ (`04` 6) | Beleg B | Rechenmodell ohne Menschenstudie → D, als Richtwert |
| Mischen (`04` 6) | stützt „nie zweimal dasselbe Format“ | belegt ist das Mischen ähnlicher Inhalte; Formatwechsel ist Gestaltung; Wortschatz in `ausdruck` geblockt üben |
| „Langsam sprechen genügt“ (`03` 9.4) | Mythos | hilft oft, aber unzuverlässig – deutliche Mundbewegung macht den Gewinn stabil |
| Seitliches Lispeln (`03` 9.6) | „allein am schwersten zu ändern“ | nicht belegbar → „verschwindet selten von selbst, hier zuerst zur Logopädie“ |
| Durchsetzungsfähigkeit | zwei Effektgrößen | unveröffentlicht, nur Wartelisten-Vergleich → keine Zahl |
| Schlagfertigkeit | 13 Techniken | ergänzt um Metaebene, Allzwecksätze, ruhiges Wiederholen, „Gerade weil“ |

Offen: aktueller Stand der Stotter-Leitlinie (Überarbeitung überfällig) · keine Studien zur Behandlung des
Lispelns bei Erwachsenen · kein belastbarer deutscher Richtwert fürs Sprechtempo · Rechte der eingebundenen
Bildmodelle vor einem Verkauf schriftlich bei Higgsfield klären; Bilder und Ton als KI-erzeugt kennzeichnen.

## Abweichungen vom Lehrplan (`05`) in Stufe 1 – Stand 25.11.2026

Die Inhalte gehen dem Lehrplan vor; Begründungen stehen in `derCoach/gegenlesen/<bereich>.md`.

| Bereich | Abweichung | Grund |
|---|---|---|
| alle | Einheiten der Stufe 1 lehren teils Fähigkeiten mit, die der Lehrplan erst für Stufe 2 vorsieht | sonst setzten Lagen, Sparring und Tests Ungelehrtes voraus |
| alle | Missionen, die im Lehrplan nicht auf der Leiter stehen, sind als `experiment`-Schritt eingebaut | jede Leiter behält genau zehn Sprossen |
| ruhe | E1 endet mit Fachhilfe `seele`, E5 mit Reflexion | Hilfe-Hinweis gleich in der ersten Einheit |
| aussprache | Kern-Lagen `aussprache-l-51…`, Sparring-Lerntag `aussprache-s-51` | Kennungs-Kollision mit Lispeln/Stottern |
| aussprache/lispeln | Lage `l-l-01` erst nach der Anbahnung (`l-04`) | Lage verlangt das neue S |
| mut | Einheit 7 „Ein Nein sagen, ein Nein hören“ statt „Erste Hilfe für den Moment“; Sparring „Der Abend mit der Mutprobe“ | doppelte `ruhe`; Lagen setzten Nein voraus |
| smalltalk | Namen merken: Abruf in wachsenden Abständen statt Merkbild; Sparring „Die Weihnachtsfeier“ | Morris 2005 |
| stegreif | Sparring „Die Fragerunde“, keine echten Organisationen (Toastmasters) in der Leiter | Marken-Regel |
| gespraech | Rückmeldung, Absprache, nach oben, Konflikt in Einheiten 4–7; Sparring „Das Jahresgespräch“ | Lagen setzten sie voraus |
| antrieb | Energie in Einheit 6; Sparring „Der Neustart im Januar“ | Stufe 1 hätte sonst keine Energie-Einheit |
| stimme | Sparring „Die zehn Minuten vorn“; Leiter aus Lehrplan 3.6 und Evidenzbericht zusammengeführt | Lehrplan §4 hatte keine Leiter für `stimme` |
| ausdruck | Einheit 6 „Sag, was genau gut war“; Einheit 3 als Streichtest; Sparring „Der Text, der raus muss“ | Zahl ohne Grundlage; „eigentlich“ trägt oft Bedeutung |
| lesen | Sparring „Die Verhandlung mit Nadine“; Stimme in Einheit 4, eigene Wirkung in Einheit 6 | jede Fähigkeit bekommt eine Einheit |

## Entscheidungen vom 25.11.2026 (Abend) – ganze App in einem Zug

| Thema | Entscheidung |
|---|---|
| Umfang | Stufen 2 bis 5 ohne Zwischenhalt fertigstellen |
| Stimme und Szenenbilder | Claude wählt selbst (Stimmproben per Spracherkennung gegengehört, jedes Bild geprüft); Davide sieht alles am Ende und kann tauschen lassen |
| Credits | Reserve darf genutzt werden – höchstens 120 insgesamt; Verbrauch im Abschlussbericht |
| Sichtbarkeit am Ende | vorerst nur Davide (`FREIGEGEBEN = false` bleibt) |
| Git | committen und auf GitHub pushen erlaubt (Davide, 25.11.2026) – auf dem Zweig `der-coach`; Zusammenführen in `main` erst auf sein Wort; Ordner `--ids/` bleibt draußen |
| Stottern `s-l-01` k3 | bleibt 0 Punkte, Rückmeldung verständnisvoll |
| Stegreif-Leiter | Sprossen folgen der Reihenfolge der Einheiten |
| Beleg-Stufe Soziometer/Bindung/Scham | B, im Text als Modell gekennzeichnet |

## Umsetzung Stufen 2–4 (25.11.2026, Abend) – Entscheidungen von Claude

| Thema | Entscheidung und Grund |
|---|---|
| Brunos Stimme | **Gideon** (Higgsfield-Vorgabe, elevenlabs_v4). Vier Proben, alle Deutsch erkannt mit 0 % Wortfehlern; Gideon ist mit Abstand die tiefste (Grundton ≈ 98 Hz gegenüber 133–165 Hz) und passt zu einem älteren Boxtrainer. |
| Ton-Umfang | 18 Aufnahmen: 8 geführte Übungen (Runterfahren in 60 s + 7 Werkzeuge im Notfallkoffer) und 10 Vorsprech-Sätze (Aussprache/Stimme). Jede wurde mit Whisper gegengehört (Deutsch ≥ 0,9, Wortfehler ≤ 8 %; zwei Einleitungen neu formuliert). Nur auf Knopfdruck, nie automatisch. |
| Betonungs-Hörbeispiele (Tonfall) | **verworfen.** Die Sprachausgabe setzt Betonung nicht verlässlich: Gemessen an Lautheit und Tonhöhe je Wort lag in allen Fassungen eines Satzes meist dasselbe Wort vorn; Großbuchstaben am Satzanfang wurden teils buchstabiert („W‑E‑R“). Hörbeispiele, die falsch betonen, würden Falsches lehren – Tonfall bleibt mit markierter Schrift. |
| Szenenbilder | 24 Szenen (17 „Menschen lesen“, 7 Smalltalk) + 3 Publikumsbilder für die Bühne (klein, groß, Video). Nur Szenen mit sichtbarer Körpersprache, keine Telefonate, nichts aus Flirten. Jedes Bild gegen die Beschreibung geprüft; das Bild ergänzt den Text, ersetzt ihn nie. Feste Figuren-Aussehen: Miriam (Anfang 30, kurze Locken, senfgelbe Bluse), Tarek (um 30, kurzer Bart, graue Kapuzenjacke), Jonas (um 35, dunkelblond, schwarze Brille, Flanellhemd), Jule (um 40, rotes Haar im Dutt, gestreifte Schürze), Dr. Albers (um 55, grau, randlose Brille, dunkelblaues Sakko), Lena (um 25, Pferdeschwanz, beige Strickjacke). |
| Aufnahme-Auswertung | Tempo (Silben je Sekunde Sprechzeit), Pausen, Abfall am Satzende, Lautstärke- und Tonhöhen-Spannweite – **nur gegen die eigene Startaufnahme**, keine Normwerte. Bei Schwerpunkt Stottern zeigt der Coach weder Tempo noch Pausen. Töne werden nur mit „Vergleichsaufnahmen behalten“ abgelegt (verschlüsselt, höchstens acht, Startaufnahme bleibt). |
| Vorhaben-Erinnerungen | eigene Karte unten rechts, nur außerhalb des Raums, nie neben der Trainings- oder Italienisch-Karte; Obergrenze je Tag, Ruhezeiten, zwei Stunden Abstand; nach dreimal Wegklicken einmal „leiser, kleiner, pausieren?“ |
| Ernstfall | Termin mit optionaler Uhrzeit; ohne Uhrzeit gilt er erst am Folgetag als vorbei (keine Nachbereitung vor dem Termin). In 7 Tagen: `ruhe` zuerst; am Vortag und am Tag: kein neuer Stoff („Sicher bleiben“). |
| Widerspruch | „Das stimmt so nicht“ in der Ecke: die Fähigkeit wird eine Woche lang im gezielten Üben nachgeprüft – mit Aufgaben, nicht mit dem Gefühl. |

## Lehrplan-Abweichungen der Phasen Können/Meisterschaft (25.11.2026)

| Bereich | Abweichung | Grund |
|---|---|---|
| ruhe | Titel geschärft („Drei Pannen, drei Pläne“, „Hände, Stimme, Röte: Zeichen für Zeichen“); 3-05 übt drei Fähigkeiten; Lage l-14 steht im Kursplan vor l-13 | keine eigene Fähigkeit „danach auswerten“; l-13 setzt 3-05 voraus |
| aussprache | Titel geschärft („Die Stimme trägt: Atem und Satzende“, „Dein Sprechbild: ein Merkmal pro Woche“, „Klar aus Gewohnheit: Plan für drei Monate“); „Deutlich unter Druck“ verweist auf `ruhe`, „Die Stimme trägt“ auf `stimme` | nicht doppeln, sondern verweisen |
| konter | „Nachbereiten: aus dem Treppenwitz wird Vorrat“; zusätzliche `vorrat-04.json` mit niedrigen Stufen | Lücken der Grundlagen-Übungstage gefüllt, ohne gegengelesene Übungstage zu ändern |
| stimme | Fähigkeiten `auftritt` und `bild` bekommen erst in Phase k/m eigene Einheiten (2-02, 2-03, 2-06, 3-01, 3-05); 3-02 lehrt „ehrlich sicher statt übersicher“ | in Phase 1 ohne eigene Einheit; Beleg `tenney2007` |
| ausdruck | Titel „Positiv fassen – ohne zu schummeln“, „Heikles elegant sagen“; Sparring k „Die heikle Bitte nach oben“ (Dr. Albers) statt „Mail an die Chefin“; Sparring m „Die Rede zu Renates Siebzigstem“ | Besetzung hat keine Chefin; Kern der Übung bleibt |
| gespraech | Stufe-2-Einheiten vertiefen (Lob mit Blick nach vorn, Maßstäbe statt Halbe-halbe, Widerspruch in der Runde, Prioritäten nach oben); Titel „Vom Streit zur Lösung für beide“, „Widersprechen, wenn alle nicken“, „Nach oben: Prioritäten statt Überstunden“ | Stufe 1 hatte die Grundformen schon |
| smalltalk | Titel „Namen, die bleiben“, „In eine Runde hinein“, „Ein Vorrat an Themen“, „Wiedersehen: da anknüpfen, wo ihr wart“; „Stille aushalten“ übt `tiefe`/`themen`, „Dein Netz pflegen“ `themen`/`einstieg`; Aushorchen im Plauderton als rote Linie (nur erkennen) | keine eigene Fähigkeit für Stille/Netz; Social Engineering gehört zum Erkennen |
| selbst | Titel „Vergleichen: der Stich als Wegweiser“, „Grenzen setzen – und halten“, „Glaubwürdige Sätze für schwere Momente“, „Aufrecht: Platz nehmen ohne Entschuldigung“, „Alte Antreiber: was sie dir einmal gaben“; Tiefenblick-Modelle (Schatten, Drama-Dreieck, Riemann) nur als Denkmodell (D), Fachhilfe `seele` in allen Einheiten der Meisterschaft | Präsenz statt Blickzwang; Tiefenpsychologie ehrlich gekennzeichnet |
| lesen | Können-Sparring „Der Termin in der Praxis“ neu; Meisterschaft-Sparring = „Die Besprechungsrunde“ aus dem Lehrplan | Lehrplan nennt nur ein Sparring |
| mut | k1 „Ein Nein, das hält“ statt „Nein sagen in drei Teilen“ (die drei Teile lehrt schon 1-07); Titel „Kritik hören, ohne einzuknicken“, „Um etwas bitten: klar und leicht ablehnbar“; Sparring m „Die Mitgliederversammlung“; Mutproben nur über den Reiter „Mutproben“ (leben.json), nicht gedoppelt | vertiefen statt wiederholen |
| lesen (Nachtrag) | Lagen stehen im Kursplan nach der Einheit, die sie voraussetzt (k: l-06, 08, 07, 09; m: l-12, 13, 14, 11); Mission m-10 erst am Ende von 3-05 | Reihenfolge folgt dem Stoff |
| antrieb | Können: Kompass-Einheiten des Lehrplans (Lebensrad, Werte, Spuren, bestmögliches Selbst, drei Leben, Ziel-Pyramide) stehen im eigenen Bereich „Kompass“ (leben.json) – 2-01 „Vom Kompass zum Vorhaben“ verweist dorthin, 2-02…06 vertiefen (Aufschieben, alte Gewohnheiten umlenken, Rückfälle, Energie, Plan-Diagnose); Sparrings „Die Woche, in der alles dazwischenkommt“ und „Ein Jahr später“ | nicht doppeln; Kompass ist Stufe 2 der App |
| flirten | Sparrings „Die Fotogruppe“ (k) und „Das Sommerfest bei Jule“ (m), weil „Der Kochkurs“ schon das Grundlagen-Sparring ist; zusätzlich Liebesbetrug (rot, nur erkennen), Rechtslage § 177 StGB und Erstarren, Eingreifen als Freund, einen Korb geben; queere Menschen sichtbar mitgemeint | Sicherheit und Respekt; Konzept §18 |
| ueberzeugen | 2-01 „Einfluss-Prinzipien – fair genutzt“ mit sieben Prinzipien (Neuausgabe 2021: „Einheit“); 2-05 „Verhandeln mit Interessen und Alternative“ (Titel kürzer); Sparrings „Der zweite Standort“ und „Der große Auftrag“; 3-02 mit gesetzlichem Widerrufsrecht (§ 312g/§ 355 BGB) | aktueller Stand; Titel ≤ 48 Zeichen |
| ueberzeugen (Nachtrag) | Kursplan k: l-07 nach 2-05, l-09 direkt nach 2-06; Lagen l-12/l-13 neu gebaut, damit sie Übertragen statt Wiedererkennen prüfen | Lage nach ihrer Einheit; Transfer |
| stegreif | Titel geschärft („Gestern – heute – morgen mit Richtung“, „Dafür, dagegen, Fazit: Stellung beziehen“, „Der Vergleich aus dem Alltag – und seine Grenze“, „Die Überraschungsfrage: Sorte erkennen“, „Der Blackout-Plan: drei Hänger, drei Sätze“, „Stegreif vor Publikum: der Bogen“, „Die unbequeme Frage: erst antworten“, „Erklären für Laien: erst das Bild“); Sparrings „Einspringen für Carla“ und „Der Tag der offenen Tür“; 3-04 überträgt Dank-Studien (Briefe) auf gesprochenen Dank – gekennzeichnet | vertiefen statt wiederholen |
| Einfluss: Ausweichen | Brücke nach der Antwort = fair; Brücke statt Antwort = rot (nur erkennen) – betrifft `stegreif-w-038` (Phase 1) und `stegreif-v-0205` | wirkt nur, solange es niemand durchschaut (Rogers & Norton 2011: 39 % → 88 % erkannt) |
