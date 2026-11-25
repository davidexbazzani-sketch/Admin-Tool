# Der Coach – Inhalte schreiben

Diese Datei ist die Schreibanleitung für alles unter `src/coach/inhalt/`. Sie gilt zusammen mit
`derCoach/06_INHALT_REGELN_MUSTER.md` (Stil, Muster je Format, Prüfliste in Abschnitt 16) und dem
Umsetzungsplan. Wo sich beide widersprechen, gilt diese Datei.

**Vorbild ist der fertige Bereich `konter/`.** Wer einen Bereich schreibt, liest zuerst alle sieben Dateien
dort – sie zeigen Aufbau, Länge, Ton und Dichte, die erwartet werden.

## 1. Dateien je Bereich

| Datei | Oberster Schlüssel | Inhalt (Stufe 1 = Phase Grundlagen) |
|---|---|---|
| `<b>/wissen.json` | `bereich, kern, einleitung, ziel[3], eintraege[]` | Wissens-Seite: 10–15 Hebel, 20–30 Taktiken/Formulierungen, ~8–10 Fehler, ~8 Mythen, 4–6 „Was dahinter steckt“, 8–12 Bücher, 5 Umfelder, 3–5 Spickzettel |
| `<b>/einheiten-1.json` | `einheiten[]` | 7 Einheiten `<b>-1-01` … `<b>-1-07` |
| `<b>/lagen-1.json` | `lagen[]` | 4 Lagen `<b>-l-01` … `-04`, dazu `<b>-l-05` mit `"sparring": true` (Abschluss der Phase) |
| `<b>/vorrat-01.json` | `eintraege[]` | mindestens 80 Übungen `<b>-v-0001` … (jede mit Kopf) |
| `<b>/leiter.json` | `missionen[]` | 10 Missionen `<b>-m-01` … `-10`, Sprosse 1–10 |
| `<b>/tests.json` | `bereich, spur, szenarien[], selbstbild[], verhalten[]` | 24 Szenario-Aufgaben `<b>-fc-001` …, 5 Selbstbild `<b>-sb-1` …, 3 Verhalten `<b>-vh-1` … |
| `<b>/kurs.json` | `kurse[]` | Kursplan mit 21 Lerntagen: 7 E, 7 Ü, 4 L, 2 A, 1 S (Muster: `konter/kurs.json`) |
| `<b>/quellen.json` | `quellen[]` | die Quellen dieses Bereichs (`id, text, link?, geprueft`) |

Gemeinsame Dateien (`bereiche.json`, `gemeinsam.json`, `quellen.json`, `besetzung.json`) **nicht ändern** –
Wünsche dazu als Notiz zurückgeben. Eine Quellen-Kennung gibt es nur einmal über alle Dateien; Kennungen gelten
überall. Was schon in `quellen.json` oder in `<anderer Bereich>/quellen.json` steht, wird einfach verwendet, nicht
neu angelegt (vorher mit `grep -r '"id": "…"' src/coach/inhalt/*/quellen.json` suchen).

`umfeld` einer Lage ist eine der Werte aus `inhaltTypen.ts`; Prüfung → `vorgesetzte` oder `fremde`, Feier → `familie`.

Schwerpunkte des Bereichs `aussprache` sind eigene Kurse mit eigenen Dateien im Ordner `aussprache/`
(`quellen-n.json`, `einheiten-n.json`, `lagen-n.json`, `vorrat-n01.json`, `leiter-n.json`, `tests-n.json`, `kurs-n.json`; ebenso `-l`, `-s`):

| Was | Nuscheln (Lispeln `l`, Stottern `s` entsprechend) |
|---|---|
| Kurs | `aussprache/nuscheln` – 15 Lerntage: 6 E, 5 Ü, 2 L, 1 A, 1 S |
| Einheiten | `aussprache-n-01` … `-06`, mit `"schwerpunkt": "nuscheln"`, `"stufe": 1` |
| Lagen | `aussprache-n-l-01`, `-02`, Sparring `aussprache-n-l-03` (alle mit `"schwerpunkt"`) |
| Vorrat | `aussprache-n-v-0001` …, mindestens 50 |
| Missionen | `aussprache-n-m-01` … `-10`, mit `"schwerpunkt"` |
| Tests | `"spur": "nuscheln"`, 12 Szenarien `aussprache-n-fc-001` …, Selbstbild `aussprache-n-sb-1` …, Verhalten `aussprache-n-vh-1` … |
| Lerntage | `aussprache-n-ue-001`, `aussprache-n-a-001`, `aussprache-n-s-01` |

Fähigkeiten mit `spur` gehören nur in ihren Schwerpunkt. **Wegen der Lispeln-Einheiten `aussprache-l-01` … zählen
im Kern von `aussprache` die Lagen ab `aussprache-l-51` und der Sparring-Lerntag ist `aussprache-s-51`**
(`aussprache-s-01` ist die erste Stottern-Einheit).

## 2. Kennungen

Eingefroren ab Auslieferung. Nie an die Reihenfolge gebunden denken: Die Reihenfolge steht allein im
Kursplan. Übungen in Einheiten: `<einheit>-a`, `-b`, … ; Merkkarten: `<einheit>-m1`, `-m2`(, `-m3`).
Lerntage: E- und L-Tage tragen die Kennung ihres Inhalts, sonst `<b>-ue-001`, `<b>-a-001`, `<b>-s-01`.
Wissens-Einträge `<b>-w-001` (Lücken in der Zählung sind erlaubt und sinnvoll, z. B. Hebel ab 001, Taktiken
ab 020, Fehler ab 070, Mythen ab 080, Dahinter ab 090, Bücher ab 100, Umfeld ab 110, Spickzettel ab 120).

## 3. Kursplan der Phase Grundlagen

Reihenfolge wie bei `konter`: E · Ü · E · Ü · E · Ü · L · A(mission) · E · Ü · L · E · Ü · E · Ü · L · A(nachbereitung) · E · Ü · L · S.
Ein Übungstag übt die Fähigkeiten der Einheit davor (und eine ältere), Band anfangs `[1,3]`, später `[2,5]`,
`anzahl` 5–6, 3–5 Formate. **Stille Ersatzübungen** für laute Aufgaben sind am besten echte stumme Übungen im Format
`stumm` (mit Kopf: `{ "art": "stumm", "kopf": …, "titel", "schritte": […], "sekunden", "pruefliste": […] }` – z. B. Mundbild
im Spiegel ohne Ton, innerlich sprechen, Zungenlage fühlen), nicht nur Wissensfragen. **Der Vorrat muss jeden Übungstag doppelt füllen** – auch leise (laute Übungen
brauchen `leise` = Kennung einer stillen Vorrats-Übung derselben Fähigkeit) und ohne Zeitdruck (Übungen mit
`uhr` zählen dann nicht). `node scripts/coach-pruefe.mjs --soll <b>` zeigt, was fehlt.

## 3a. Phasen „Können“ (k) und „Meisterschaft“ (m) – ab Stufe 3

Je Bereich (nicht für die Schwerpunkte – die sind mit Stufe 1 vollständig):

| | Können (k) | Meisterschaft (m) |
|---|---|---|
| Einheiten | `<b>-2-01` … `-06` in `einheiten-2.json` (`"stufe": 2`) | `<b>-3-01` … `-05` in `einheiten-3.json` (`"stufe": 3`) |
| Lagen | `<b>-l-06` … `-09` + Sparring `<b>-l-10` in `lagen-2.json` | `<b>-l-11` … `-14` + Sparring `<b>-l-15` in `lagen-3.json` |
| Lerntage (an `kurs.json` **anhängen**, `"phase": "k"` bzw. `"m"`) | 20: 6 E, 6 Ü, 4 L, 3 A, 1 S – Ü `<b>-ue-008…`, A `<b>-a-003…`, S `<b>-s-02` | 18: 5 E, 5 Ü, 4 L, 3 A, 1 S – S `<b>-s-03` |
| Band der Übungstage | `[3, 6]` bis `[4, 7]` | `[5, 8]` bis `[6, 10]` |
| Vorrat | neue Datei(en) `vorrat-03.json` …, Nummern fortlaufend nach der höchsten vorhandenen; je Phase rund 80 | dito |
| Tests | an `tests.json` anhängen: 8 Szenarien je Phase (`<b>-fc-025` …), Stufen 4–7 bzw. 6–9 | |

Sonderfall `aussprache` (Kern): Lagen ab `aussprache-l-56` (k: 56–59, Sparring 60; m: 61–64, Sparring 65), Sparring-Lerntage
`aussprache-s-52`, `aussprache-s-53`. Die Titel der Einheiten stehen als Stichworte in `derCoach/05_LEHRPLAN.md`
(„Stufe 2 – Können“, „Stufe 3 – Meisterschaft“) – ausarbeiten, Titel schärfen erlaubt, Fähigkeit und Absicht bleiben.
Was in Stufe 1 schon vorweggenommen wurde, steht in `derCoach/08_ENTSCHEIDUNGEN.md` (Lehrplan-Abweichungen) und in
den Einheiten selbst – nicht doppeln, sondern vertiefen. Die Leiter (`leiter.json`) bleibt bei zehn Sprossen;
Einheiten der Phasen k und m verweisen auf die oberen Sprossen (5–10) oder enden mit `experiment`/`reflexion`.

**Neue Formate ab Stufe 2** (Typen in `kern/inhaltTypen.ts`): `geschichte` (Bruno erzählt), `geschichtenbau` (mit Kopf),
`gespraechskarte`, `fahrplan` (Ernstfall eintragen), `leiter` (eigene Angst-Leiter), `werte`, `lebensrad`,
`schreibreise`, `woop`, `buehne` (laut, mit Kopf, braucht `leise`), `stumm` (still, mit Kopf). Werkzeug-Formate ohne
Kopf zählen wie `reflexion` als nachdenkender Schritt.

## 4. Einheiten (Prüfskript prüft das)

5–9 Schritte, mindestens drei Formate, nie dasselbe Format zweimal hintereinander, mindestens zwei aktive
Schritte, der erste weckt Neugier (`schaetzen`, `mythos`, `vergleich`, `auswahl`, `zuordnen`, `konter`, `studie`).
Mit Mission ist der letzte Schritt `{ "art": "mission", "ref": … }` und `"mission"` steht auch in der Einheit;
ohne Mission endet sie mit `reflexion` oder `fachhilfe`. Titel ≤ 48 Zeichen, Aha ≤ 220, Regel ≤ 90,
Erklärkarte ≤ 420, Antwort ≤ 140, Begründung ≤ 220. Dauer 5–7 Minuten. 2–3 Merkkarten.
Jede Einheit hat Beleg-Stufe und Quellen; bei B, D, U einen `belegHinweis`, der ehrlich sagt, was belegt ist
und was nicht.

Antworten (`auswahl` u. ä.): genau eine mit `wert: 2`, möglichst eine brauchbare mit `wert: 1`, jede mit
`warum`. Falsche Antworten dürfen eine `tendenz` tragen (z. B. `rechtfertigen`, `angreifen`, `ausweichen`,
`vermeiden`, `ueberspielen`, `abwerten`) – daraus erkennt der Coach Muster. Die beste Antwort steht nicht
immer an derselben Stelle. **Längen gemischt halten:** Die beste Antwort ist in höchstens der Hälfte der Fragen die
längste – und die längste Antwort ist auch nicht meistens eine falsche (Überkorrektur). Das Prüfskript meldet beides
je Datei, auch für Tests und Lagen.

## 5. Sprache

- Deutsch, Du-Form, kurze Sätze, Alltagswörter. „Sie“ nur in wörtlicher Rede.
- Figuren mit Namen nur aus `besetzung.json`; ihre festen Fakten (Alter, Familie, Wohnen, Zeitleisten, Aussehen) stehen
  verbindlich in `derCoach/figuren.md` – jede Figurenszene dagegen prüfen. Dein Vorgesetzter ist Dr. Albers, eine Chefin
  gibt es nicht. **Namenlose Nebenfiguren in einer Rolle** („ein Verkäufer“, „die Mitarbeiterin
  der Praxis“, „eine Käuferin“) sind erlaubt. Firmen- und Ortsnamen nur erkennbar erfunden und allgemein („Bäckerei Hansen“),
  nie eine echte, bekannte Marke. Die Anrede des Nutzers ist `{name}`: ohne Namen fällt eine Anrede am Satzanfang/-ende
  weg, mitten im Satz steht „[dein Name]“.
- **Der Nutzer hat kein festgelegtes Geschlecht, Alter, Familienstand oder Beziehung.** Nie „als Mutter/Vater“, „deine
  Freundinnen“, „die Retterin“, „dein Partner“ (männlich) für den Nutzer – neutral fassen („dein Kind“, „deine Leute“,
  „in der Rolle des Retters“ nur als Modellbegriff, „die Person, mit der du zusammenlebst“), oder die Lage so bauen, dass
  es keine Rolle spielt. Figuren aus der Besetzung behalten ihr Geschlecht.
- Deutsche Anführungszeichen „…“, Apostroph `'`. Keine doppelten Leerzeichen.
- Verboten (Prüfskript): garantiert, für immer, nie wieder, heilen, Sprachfehler, Stotterer, bekämpfen, besiegen,
  Versager, Loser, Alpha, rumkriegen, Trick 17, Geheimwaffe, Gehirnwäsche, „du musst“, „reiß dich zusammen“,
  „stell dich nicht so an“. Im Schwerpunkt Stottern zusätzlich: flüssig, langsamer, entspann…, atme,
  nachgeahmte Wiederholungen („K-K-…“).
- Zahlen und Prozente nur mit einer Quelle, die `"geprueft": true` trägt. Lieber „etwa jeder Dritte“ mit
  Quelle als eine erfundene Genauigkeit. Keine Zitate aus Büchern – Kernideen in eigenen Worten,
  Bücher als Quelle nennen.
- Energie in der Verpackung, Ehrlichkeit im Inhalt: Bruno feuert an, verspricht aber nichts, was die
  Forschung nicht trägt.

## 6. Beleg-Stufen

A belegt (mehrere Studien/Übersichtsarbeiten) · B gestützt (einzelne gute Studien) · P Praxiswissen ·
D Denkmodell (hilft beim Verstehen, kein Befund – Tiefenpsychologie, Klassiker) · U umstritten oder widerlegt
(für Mythen). Beleg A braucht eine Quelle. Eine zurückgezogene Studie wird nie verwendet.

## 7. Einfluss-Klassen

Jede Taktik auf der Wissens-Seite und jede Übung, die eine Einflusstechnik einsetzt, trägt `einfluss`:

- `fair` – wirkt auch, wenn der andere es durchschaut. Erklären und trainieren.
- `taktik` – nutzt bekannte Wirkungen ohne Lüge (Anker, Kontrast, kleine Zusage zuerst, Rahmung, Schweigen,
  „Ich muss das abstimmen“). Erklären mit Mechanik, Stärke laut Forschung, `preis` und `abwehr` – und trainieren.
  Taktik-Missionen nur im Verkauf, in der Verhandlung oder beim privaten Kauf, nie gegenüber Kollegen.
- `rot` – erfundene Tatsachen, Ausnutzen von Abhängigkeit, Zermürben, Schuld einreden, ein Nein übergehen,
  Verführungsratgeber-Tricks. Vollständig erklären, erkennen, `abwehr` angeben – **nie** als Musterlösung,
  Mission oder Einsatz-Übung (nur `kunstgriff`/`auswahl` zum Erkennen).
  Dazu zählen auch die **unfairen Kunstgriffe im Streitgespräch** (Killerphrase, Strohmann, Etikett, vergiftetes Lob,
  ironisches Zustimmen, Lacher holen, Reizen, Fragensalve, erschlichenes Ja): Sie gehören nicht zur roten Linie im
  engen Sinn aus `08`, laufen aber als `rot` = „nur erkennen und abwehren“ (Entscheidung 25.11.2026).
  Abgrenzung: Eine **echte** Entweder-oder-Frage („Lieber Dienstag oder Donnerstag?“) ist `taktik`; das **falsche**
  Entweder-oder, das andere Möglichkeiten verschweigt, um zu drängen, ist `rot`. Ebenso ist die „kleine Zusage zuerst“
  `taktik`, das „erschlichene Ja“ (Zustimmung zu etwas Harmlosem, später als Zusage zum Eigentlichen ausgegeben) `rot`.
  Eine **echte** Frist zu nennen ist `fair`; **erfundener oder künstlicher Zeitdruck** („nur noch heute“, „muss jetzt
  sofort entschieden werden“, ohne dass es stimmt) ist eine erfundene Tatsache und damit `rot`.
  **Ausweichen:** Die Brücke **nach** der Antwort („Ja, das kostet mehr – und dafür …“) ist `fair`; die Brücke **statt**
  der Antwort („Gute Frage – lassen Sie uns nach vorn schauen …“, ohne zu antworten) wirkt nur, solange niemand es
  merkt, und ist `rot` (nur erkennen und abwehren) – Entscheidung 25.11.2026.

Übungen, die Techniken nur **einordnen** lassen (z. B. `zuordnen` mit den Fächern fair / Taktik / rot), tragen kein
`einfluss` – sie setzen selbst keine Technik ein.

Für `flirten` gelten die Regeln aus `derCoach/01_KONZEPT.md`, Abschnitt 18, unverändert (Respekt, ein Nein ist
ein Nein, keine Masche, Mutproben nur privat).

## 8. Recherche-Korrekturen (gelten überall)

| Thema | Richtig |
|---|---|
| Stottern, Häufigkeit | Erwachsene: weniger als einer von hundert (Leitlinie: etwa 0,8 % der Männer, 0,2 % der Frauen); Kinder: mindestens fünf von hundert |
| Stottern, Therapie | Sprechrestrukturierung: starke Empfehlung; Stottermodifikation und Kombination: „kann“ |
| Heiserkeit | länger als **vier** Wochen → Arztpraxis (S2k-Leitlinie Dysphonien 2022) |
| Zuzahlung Logopädie | kein fester Betrag im Text (ändert sich zum 1.1.2027) |
| Rituale vor Auftritten (Brooks 2016) | Studie zurückgezogen → nicht verwenden; Routinen stützen sich auf die Sport-Meta-Analyse |
| Verlauf der Aufregung | Gipfel kurz vor dem Start oder in der ersten Minute, danach sinkt sie – wie schnell, ist verschieden |
| Umdeuten („Ich bin aufgeregt“) | man erlebt die Aufregung eher als Vorfreude (begeisterter), weniger Angst hat man nicht; ob die Leistung steigt, ist nach einer Wiederholung unsicher (B, umstritten) |
| Atmen direkt vor dem Auftritt | Körper reagiert schon in einer Sitzung messbar; fürs Gefühl nur kleine Einzelstudien; für eine einzelne Minute keine Daten |
| „Aber du entscheidest“ | keine sichere Wirkung in sauberen Studien → Haltung, kein Wirkversprechen |
| Vorstellungsgespräch | Stärken ehrlich herausstellen wirkt; Flunkern bringt im Schnitt nichts |
| Erste Zahl in der Verhandlung | wer zuerst nennt, liegt im Schnitt vorn; überzogene Zahlen kosten Abschlüsse |
| Gewohnheiten | meist um zwei Monate (Median), im Durchschnitt drei bis fünf; Spanne 4 bis 335 Tage |
| Erinnerungen | wirken vor allem kurz danach; ob sie sich abnutzen, ist uneinheitlich |
| „85 Prozent Treffer“ | Rechenmodell ohne Menschenstudie → D, als Richtwert |
| Mischen beim Lernen | belegt für ähnliche Inhalte, nicht für wechselnde Formate; Wortschatz geblockt üben |
| „Langsam sprechen genügt“ | hilft oft, aber unzuverlässig – deutliche Mundbewegung macht den Gewinn stabil |
| Seitliches Lispeln | „verschwindet selten von selbst, hier zuerst zur Logopädie“ (keine Rangfolge der Schwierigkeit) |
| Durchsetzungsfähigkeit | keine Effektgröße nennen |

## 9. Ablauf je Bereich

1. Recherche: Abschnitt des Bereichs in `derCoach/03_WISSEN_WIRKUNG.md` bzw. `04_WISSEN_ANTRIEB.md`, Evidenzbericht,
   Lehrplan `05_LEHRPLAN.md` (Einheiten der Stufe 1), Sonderregeln in `06`. Jede Zahl an der Quelle prüfen.
2. `quellen.json` des Bereichs, dann `wissen.json`.
3. Einheiten, dann Lagen, dann Vorrat nach Soll-Liste, Leiter, Tests, Kursplan.
4. `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur <b>` → 0 Fehler, Hinweise ansehen.
5. Unabhängiges Gegenlesen; Befunde in `derCoach/gegenlesen/<b>.md`.
6. Erst dann setzt der Hauptstrang in `bereiche.json` `"freigegeben": true`.
