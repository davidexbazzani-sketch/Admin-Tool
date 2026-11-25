# Gegenlesen: Schwerpunkt Stottern (`aussprache`, Phase Grundlagen)

**Datum:** 25.11.2026 · **Blick:** drei Brillen zugleich: Stottertherapeutin, erwachsener Mann, der seit der Kindheit
stottert und in der Selbsthilfe aktiv ist, und Faktenprüfer
**Geprüft:** `src/coach/inhalt/aussprache/` – `quellen-s.json`, `einheiten-s.json`, `lagen-s.json`, `vorrat-s01.json`,
`leiter-s.json`, `tests-s.json`, `kurs-s.json`. Kontext: `gemeinsam.json` (Fachhilfe `stottern`, `seele`,
`stottern-mission`), `besetzung.json` (Jonas Wegner).
**Maßstab:** `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md`
(Abschnitt 2, 3 „Schwerpunkt Stottern“, 16), `derCoach/05_LEHRPLAN.md` (Abschnitt 3.1, 4, 6, 7).

## 1. Was geprüft wurde

- **Fakten an der Quelle:**
  - Neumann u. a. 2017 (Ärzteblatt, Volltext): 1 % der Kinder und Jugendlichen, 0,8 % der Männer, 0,2 % der Frauen;
    Beginn meist zwischen 2 und 6 Jahren; Rückbildung bei 70–80 %; Erblichkeit 69–85 %; Sprechrestrukturierung
    „strong evidence“; Stottermodifikation und Kombination schwächer belegt; keine Medikamente, kein Atem-,
    Rhythmus- oder Hypnoseverfahren als Hauptbehandlung, keine Heilsversprechen; Überprüfung nach drei Monaten mit
    mindestens einer Sitzung pro Woche. Alles stimmt.
  - Patienteninformation ÄZQ/BÄK 2017 (PDF-Text gelesen): 50 von 1000 Kindern beginnen, bei drei Vierteln verliert es
    sich, meist innerhalb von zwei Jahren; Erwachsene unter 10 von 1000, bei ihnen bleibt es „fast immer“; familiäre
    Veranlagung, Eltern trifft keine Schuld; ohne Beleg: Medikamente, Atemtherapie, Homöopathie, Hypnose,
    Entspannungstechniken, Bachblüten; Tipps für Zuhörer. Stimmt.
  - BVSS-Faktencheck 2025 (PDF-Text gelesen): Eisberg mit sichtbaren und nicht sichtbaren Symptomen, Ursache
    neurologisch und vererbt, Mythen (Trauma, Schüchternheit, „richtig atmen“, „atme tief durch“), keine ungebetenen
    Ratschläge, „Advertising“, rund 100 Gruppen, kostenfreie telefonische Beratung. Stimmt.
  - Byrd u. a. 2017 (AJSLP): 173 Teilnehmende, mit Offenlegung eher freundlich, aufgeschlossen, selbstsicher, ohne sie
    eher unfreundlich und schüchtern. DOI stimmt.
  - Iverach u. a. 2018 (JFD 56, 55–68): 275 Erwachsene, 82 (29,8 %) mit sozialer Angststörung. Stimmt.
  - Menzies u. a. 2008 (JSLHR 51, 1451–1464): 32 Erwachsene, per Los Sprechrestrukturierung nach einem
    Verhaltenstherapie-Programm oder allein; nach 12 Monaten keine soziale Phobie mehr in der Programm-Gruppe,
    Sprechtraining allein ohne Wirkung darauf, keine Wirkung des Programms aufs Stottern. Stimmt. Die Gruppengrößen
    ließen sich nicht bestätigen (siehe Korrektur 5).
  - Beilby u. a. 2012 (JFD 37, 289–299): 20 Erwachsene, acht Wochen, Gewinne nach drei Monaten gehalten, keine
    Kontrollgruppe. Stimmt.
  - Craig u. a. 2009 (JFD 34, 61–71): 200 gegen 200, schlechter in Vitalität, sozialem und emotionalem Funktionieren
    und seelischer Gesundheit. Stimmt.
  - Meekings u. a. 2025 (JSLHR, DOI 10.1044/2024_JSLHR-24-00405, frei zugänglich): Die Zahl „90 bis 100 %“ steht in
    der Einleitung und fasst frühere Studien zusammen. Die Quelle sagt das selbst. Stimmt.
  - Van Riper 1973 und Sheehan (Hrsg.) 1970: Titel, Verlag und Jahr bestätigt. Siehe Korrektur 19 und 20.
- **Haltung:** Alle Texte wurden auf Beschämung, Mitleid, „Fix-it“-Ton, Flüssigkeit als Ziel, Defekt-Sprache,
  Person-zuerst-Sprache und die verbotenen Wörter durchsucht. Gelesen wurde auch, wie Jonas gezeichnet ist und wie
  realistisch die Zuhörer-Tipps sind.
- **Sicherheit:** Keine Übung hat eine Uhr, eine Zählung, eine Tempo-Angabe oder ein Ton-Beispiel. Jede der sechs
  Einheiten endet mit `fachhilfe` `stottern` (in s-05 und s-06 kommt danach die Mission). Die Leiter beginnt klein und
  ist freiwillig, jede Sprosse hat eine Halb-Fassung, und die einzige Mutprobe (`s-m-04`) ist privat.
- **Didaktik:** Länge der Einheiten, Aufbau, beste und brauchbare Antworten, Verzweigungen der Lagen. Testfragen
  wurden mit dem Vorrat und den Lagen verglichen.
- **Technik:** `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur aussprache` vorher und nachher.
  Ergebnis: **0 Fehler, 0 Hinweise**.

## 2. Gesamteindruck

Der Schwerpunkt ist ungewöhnlich gut. Die Haltung stimmt fast durchgehend: Es zählt, *dass* gesprochen wird, nicht wie
es klingt. Offenheit ist eine Wahl, keine Pflicht. Die Techniken sind nur Kostproben mit klarem Verweis auf
Fachleute. Die Leitlinie wird ehrlich wiedergegeben, auch dass sie abgelaufen ist und die Stottermodifikation nur
„kann“ bekommt. Jonas ist weder Held noch Opfer: Er ist selbstverständlich offen, verweist auf Selbsthilfe und
gibt der Idee in der Besprechung den Ball zurück. Die Zuhörer-Tipps decken sich mit BÄK und BVSS. Die Fehler, die
ich gefunden habe, waren einzelne Wörter, die Stottern doch als „Fehler“ rahmen, zwei Logiklücken in den Lagen,
Testfragen, die Übungen wörtlich glichen, und kleine sachliche Unschärfen.

## 3. Korrekturen

| # | Datei · Kennung | vorher → nachher | Grund |
|---|---|---|---|
| 1 | `einheiten-s` · `aussprache-s-02`, Schritt `schaetzen` (`aufloesung`) | Satz ergänzt: „Schränkt dich die Angst vor dem Sprechen stark ein, frag in deiner Hausarztpraxis nach psychotherapeutischer Hilfe – als Ergänzung zur Stottertherapie.“ | Bisher fehlte der Hinweis auf psychotherapeutische Hilfe bei starker sozialer Angst. Er steht jetzt direkt nach der Zahl (knapp jeder Dritte), ohne Rufnummer. „Als Ergänzung“, weil laut Leitlinie Psychotherapie allein das Stottern nicht behandelt |
| 2 | `einheiten-s` · `aussprache-s-02`, `vergleich` (`unterschied`) | „… und du hast dich selbst kleiner gemacht.“ → „… und du hast weniger gesagt, als du sagen wolltest.“ | Ein Urteil über die Person, das beschämt. Wörter tauschen ist eine verbreitete Bewältigung. Der neue Satz benennt die Folge, ohne zu werten |
| 3 | `einheiten-s` · `aussprache-s-03`, 2. Schritt `karte` | „Anfangs klingt sie ungewohnt, mit Übung natürlicher.“ → „…; im Alltag braucht sie dauerhaft Aufmerksamkeit.“ | Ehrlichkeit: Die Sprechrestrukturierung wirkt nur, solange man sie anwendet (BVSS: „ständiges Anwenden“). Ein stotternder Leser würde sonst einen Teil der Wahrheit vermissen |
| 4 | `einheiten-s` · `aussprache-s-04-c`, Antwort wert 0 | „… nicht Fehlerlosigkeit.“ → „… nicht Perfektion.“ | Stottern ist kein Fehler. Dieselbe Einheitenreihe sagt an anderer Stelle selbst: „etwas, das kein Fehler ist“ |
| 5 | `einheiten-s` · `aussprache-s-06`, `schaetzen` | „die Hälfte vorher zusätzlich“ → „eine per Los bestimmte Gruppe vorher zusätzlich“ | Die Gruppengrößen von Menzies 2008 ließen sich nicht bestätigen. Belegt ist die zufällige Verteilung |
| 6 | `einheiten-s` · `aussprache-s-06-b` (`kritiker`), 2. Muster | „Die meisten am Telefon wollen mir helfen.“ → „Viele warten, wenn ich kurz sage, was los ist.“ | Zu rosig, und das merkt jeder, dem schon aufgelegt wurde. Der neue Satz ist realistisch und verbindet sich mit dem offenen Satz |
| 7 | `lagen-s` · `aussprache-s-l-01`, Knoten `k3`, Antwort wert 0 (`rueck`) | „Das Verstecken kostet dich mehr Kraft als die Runde je bemerkt hat.“ → „Verstecken kostet oft mehr Kraft als das Stottern selbst. Die Runde hat vor allem gehört, wer du bist und was du machst.“ | Falsche Grammatik (Komma fehlt), unklarer Sinn |
| 8 | `lagen-s` · `aussprache-s-l-02`, Knoten `ende2` | sagt: „Der Termin ist noch offen.“ → „Für heute ist das Telefon wieder weggelegt.“; ende: „Kein Drama – der Anruf läuft nicht weg. …“ → „Kein Drama – ob der Termin auf anderem Weg zustande kommt oder noch offen ist: Der eigene Anruf läuft nicht weg. …“ | Logiklücke: Zu `ende2` führen auch „jemand anderes ruft an“ und „persönlich hingehen“. Dort ist der Termin sehr wohl gemacht |
| 9 | `lagen-s` · `aussprache-s-l-03`, Knoten `k4` (`sagt`) | Tarek: „Sorry, dass ich dir reingegrätscht bin. Wie soll ich's machen?“ → „Sag mal – wenn du an einem Wort hängst: Soll ich dann einspringen oder lieber warten?“ | Logiklücke: Über `k1` → `k1c` → `k3` erreicht man `k4`, ohne dass Tarek eingesprungen ist. Die neue Frage passt auf jedem Weg, die drei Antworten bleiben stimmig |
| 10 | `lagen-s` · `aussprache-s-l-03`, Knoten `ende1` | „Nicht fehlerfrei – frei.“ → „Nicht perfekt – frei.“ | Wie Nr. 4: Stottern nicht als Fehler rahmen. Das Wortspiel bleibt |
| 11 | `tests-s` · `aussprache-s-fc-001` | Neue Lage (der Nachbar fragt nach der Kindheit) mit neuen Antworten; Fähigkeit, Stufe und Wert-Reihenfolge (1/2/0) bleiben gleich | War fast wörtlich `aussprache-s-v-0001`. Ein Formcheck misst dann Wiedererkennen, nicht Wissen |
| 12 | `tests-s` · `aussprache-s-fc-002`, Antwort wert 1 | „Männer und Frauen etwa gleich oft“ mit wert 1 („Fast …“) → „Männer etwa doppelt so oft wie Frauen“, wert 1, „Die Richtung stimmt, die Zahl nicht: … etwa viermal so oft.“ | Gleich oft gegenüber viermal so oft ist nicht „fast richtig“. Wert 1 gehört nur zu einer wirklich brauchbaren Antwort |
| 13 | `tests-s` · `aussprache-s-fc-003` | Neue Lage (Jonas in der Kantine): Blick halten und warten (2), aufs Handy schauen (1), „Ganz ruhig, lass dir Zeit.“ (0) | Glich `aussprache-s-v-0005` und `v-0018` fast wörtlich. Jetzt wird zusätzlich der „ungebetene Rat“ geprüft |
| 14 | `tests-s` · `aussprache-s-fc-009` | Neue Lage (Fahrkartenschalter, der Mann rät den Ort) mit neuen Antworten | War Wort für Wort `aussprache-s-v-0036` und glich `aussprache-s-l-03` `k2` |
| 15 | `tests-s` · `aussprache-s-fc-011` | Neue Lage (Carla fragt nach dem Termin) mit neuen Antworten | Glich `aussprache-s-v-0037` und `aussprache-s-l-03` `k3` fast wörtlich |
| 16 | `vorrat-s01` · `v-0015` (wert 2), `v-0025` (2. Muster), `v-0028` (beide Muster) | „Das ist angeboren.“ / „Stottern ist angeboren, kein Schreck-Erbe.“ → „Die Veranlagung dazu ist angeboren.“ / „Die Veranlagung ist angeboren – ein Schreck löst Stottern nicht aus.“; `v-0028`, 1. Muster: „Meist ist der Schreck nur zufällig kurz vorher passiert“ → „Oft fällt ein Erlebnis nur zufällig in die Zeit, in der das Stottern beginnt“ | Sachlich ungenau: Stottern selbst beginnt meist mit 2 bis 6 Jahren, angeboren ist die Veranlagung. „Meist“ war eine unbelegte Häufigkeit; die neue Form folgt dem BVSS-Faktencheck |
| 17 | `vorrat-s01` · `v-0026`, 2. Muster | „Ein guter Kurs macht das Sprechen leichter und die Angst kleiner.“ → „Eine gute Therapie kann das Sprechen leichter und die Angst kleiner machen.“ | Die Übung verlangt „kein Versprechen“, die Musterlösung versprach aber etwas |
| 18 | `vorrat-s01` · `v-0027`, 2. Muster | „Was im Kopf passiert, verstärkt es höchstens.“ → „Gedanken und Gefühle verstärken es höchstens.“ | Missverständlich, weil das Gehirn auch „im Kopf“ ist und der Satz davor gerade das Gehirn als Ursache nennt |
| 19 | `quellen-s` · `vanriper` | „Aus dem Gedächtnis, nicht nachgeschlagen“, `geprueft: false` → bibliografisch bestätigt, `geprueft: true` | Titel, Verlag und Jahr bestätigt. Die Bezeichnung „Nicht-Vermeidungs-Ansatz“ steht auch im BVSS-Faktencheck |
| 20 | `quellen-s` · `sheehan` | „(1970) … Herkunft des Eisberg-Bilds“ → „(Hrsg., 1970) … üblicherweise als Herkunft genannt; Titel, Verlag, Jahr bestätigt, die Zuschreibung nicht“; bleibt `geprueft: false` | Sheehan ist Herausgeber. Dass das Eisberg-Bild aus diesem Buch stammt, ließ sich nicht nachweisen; im Text der Einheit wird das aber auch nicht behauptet |

Keine Kennung geändert, nichts gelöscht, die Struktur ist unverändert (`weiter`-Ziele, Wert-Verteilung, Anzahl der
Antworten). `_index.json` wurde per Skript neu erzeugt.

## 4. Offene Punkte (Ermessen – nicht geändert)

1. **Quelle für „ohne Entschuldigung“ ergänzen.** Der offene Satz ohne Entschuldigung ist Kern von `s-05` und vieler
   Übungen, stützt sich bisher aber nur auf Praxis und BVSS. Passend wäre Byrd, Croft, Gkalitsiou & Hampton (2017):
   *Clinical utility of self-disclosure for adults who stutter: Apologetic versus informative statements.* Journal of
   Fluency Disorders 54, 1–13. 338 Teilnehmende; eine sachliche Offenlegung wirkt besser als keine, eine
   entschuldigende nicht. *Empfehlung:* als `byrd2017b` in `quellen-s.json` aufnehmen (vorher Zusammenfassung an der
   Quelle lesen) und in `s-05` ergänzen. Ich habe es nicht selbst eingetragen, weil es eine neue Kennung wäre.
2. **`s-06` verweist auf Mission `s-m-03`, der Lehrplan sagt „die erste Stufe“.** `s-m-01` ist schon die Mission von
   `s-05`, darum ist `s-m-03` (das getauschte Wort) folgerichtig und passt zum `wenndann`. *Empfehlung:* so lassen und
   den Lehrplan nachziehen.
3. **Figur „eine Mitarbeiterin der Praxis“ in `s-l-02`.** Sie ist keine Figur aus `besetzung.json`, das Prüfskript
   lässt sie zu. Für einen Fremden am Telefon ist das realistisch. *Empfehlung:* so lassen oder „Fremde“ als erlaubte
   Nebenfigur in der LIESMICH festhalten.
4. **`fc-010`, beste Antwort: „Sie bekommen trotzdem alle Zahlen.“** Das „trotzdem“ deutet einen Mangel an. Besser
   wäre etwa „Am Inhalt ändert das nichts.“ Das ist aber nah an `v-0040`/`v-0061`. *Empfehlung:* auf
   „Sie bekommen alle Zahlen – manchmal mit einer kleinen Pause.“ ändern, wenn Davide zustimmt.
5. **`l-01` `k3`, wert 0 für „Ich hoffe, es hat keiner gemerkt.“** Ein sehr menschlicher Gedanke. Die Rückmeldung ist
   jetzt freundlich. Ein Leser aus der Selbsthilfe könnte eine 0 dafür trotzdem hart finden. *Empfehlung:* wert 1 wäre
   vertretbar. Es bleibt eine Geschmacksfrage, und die Tendenz „verstecken“ ist ein nützliches Signal.
6. **`v-0021`, „Angst und Vermeiden belasten viele mehr als das Hörbare“ mit „Gut gestützt“.** Belegt ist, dass
   Sprechangst häufig ist und behandelbar. Den Vergleich „mehr als das Hörbare“ trägt die Forschung nur indirekt.
   *Empfehlung:* „Gut gestützt“ durch „Für viele zutreffend“ ersetzen.
7. **`l-03` `k3`, wert 1: „Hier wärst du gern sichtbar gewesen“** unterstellt dem Nutzer einen Wunsch.
   *Empfehlung:* „Hier hättest du kurz selbst antworten können – Details per Mail hätten gereicht.“
8. **Die Leitlinie ist abgelaufen** (AWMF 049-013, Fassung 2016). Das steht ehrlich in `belegHinweis` und `quellen`.
   Erscheint eine neue Fassung, sollten `s-03`, `v-0006`, `v-0013`, `v-0019`, `fc-004` und `fc-005` nachgeprüft werden.
9. **Fachhilfe-Text in `gemeinsam.json`** nennt eine Telefonnummer der BVSS. Das ist zulässig, weil es nicht in den
   `-s`-Dateien steht. Ich habe die Nummer nicht geprüft. *Empfehlung:* vor der Freigabe einmal auf bvss.de
   abgleichen.

## 5. Urteil

**Freigabereif: ja** – mit den Korrekturen oben. Die offenen Punkte sind Verbesserungen, keine Hindernisse. Am meisten
lohnt Punkt 1 (Quelle für „ohne Entschuldigung“).

## 6. Leseliste für Davide

1. `aussprache-s-01` ganz: der Ton für alles Weitere („nicht deine Schuld“, Chor-Studie, Antwort auf „Denk erst nach“).
2. `aussprache-s-02`, die `aufloesung` des ersten Schritts: Hier steht jetzt der Hinweis auf psychotherapeutische
   Hilfe. Passt Platz und Ton?
3. `aussprache-s-04` (Kostproben): die einzige laute Übung. Prüfe, ob „Kennenlernen ja – üben gehört zu Fachleuten“
   für dich richtig dosiert ist.
4. `aussprache-s-05`, der Dialog mit Lena: Offenheit als Wahl, auch der Weg ohne offenen Satz bekommt wert 1.
5. Lage `aussprache-s-l-01` (Jonas' Vorstellung und das Gespräch an der Kaffeemaschine) und das Sparring
   `aussprache-s-l-03`: Ist Jonas so, wie du ihn haben willst?
6. Die Tests `fc-001`, `fc-003`, `fc-009`, `fc-011`: neu geschrieben, bitte einmal lesen.
7. Leiter `s-m-01` bis `s-m-10`: Die Reihenfolge vom vertrauten Gespräch bis zum Beitrag in der Runde ist das Rückgrat
   des Schwerpunkts.
