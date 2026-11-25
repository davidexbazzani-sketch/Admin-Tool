# Gegenlesen: Schwerpunkte Nuscheln und Lispeln (`aussprache`, Phase Grundlagen)

**Datum:** 25.11.2026 · **Blick:** Logopädie (Artikulation, Sigmatismus bei Erwachsenen, Heilmittel-Richtlinie) und Faktenprüfung
**Geprüft:** `src/coach/inhalt/aussprache/` – `quellen-n/-l`, `einheiten-n/-l`, `lagen-n/-l`, `vorrat-n01/-l01`,
`leiter-n/-l`, `tests-n/-l`, `kurs-n/-l`. Zum Vergleich: Kern-Dateien, `gemeinsam.json` (Fachhilfe `logopaedie`, `notfall`),
`besetzung.json`, `derCoach/gegenlesen/aussprache.md`.
**Maßstab:** `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md`
(Abschnitt 3 Sonderregeln, Abschnitt 16 Prüfliste), `derCoach/05_LEHRPLAN.md` (3.1, 4, 6), `src/coach/kern/inhaltTypen.ts`.

## 1. Was geprüft wurde

- **Fachlich, Lispeln:** S-Laute (s/z, z = „ts“, x = „ks“), Bildung des S (Zähne fast aufeinander, Zunge hinter den
  Zähnen, schmaler Luftstrahl in der Mitte), die drei Formen (interdental = „th“-Klang, addental = stumpf, lateral =
  schlürfend, Luft an der Wange), Ruhelage (Spitze hinter den oberen Schneidezähnen am Gaumen, Lippen locker zu,
  Nasenatmung, Schlucken ohne Zungenvorstoß), Anbahnung vom T zum S, Laut-Leiter Laut → Silbe → Wort (Anfang, Mitte,
  Ende) → Satz → Text → Gespräch, Prüfhilfen (Spiegel, Handrücken, Aufnahme), nichts im Mund, kein Pressen.
  **Alle Übungswörter einzeln geprüft:** Jedes enthält ein echtes [s]/[z] (bzw. [ts]/[ks]). „st“/„sp“ am Wortanfang
  und „sch“ sind überall richtig ausgeschlossen (Stein, Sport, Entschuldigung als Gegenbeispiele; Fenster, Kiste,
  Espresso richtig als S-Wörter). Minimalpaare S/sch (Tasse – Tasche, Masse – Masche, Bus – Busch) stimmen.
  Seitliches Lispeln: Der Rat zur Logopädie steht vor jeder Übung (Karte vorab in `l-04`, erster Punkt jeder Prüfliste).
- **Fachlich, Nuscheln:** sechs Muster und Gegenmittel, Dialekt kein Nuscheln, „langsam genügt“ als Teil-Mythos
  (Stipancic 2016), Poltern → Logopädie, plötzlich verwaschene Sprache → Notfall 112 (über Fachhilfe `notfall`).
- **Fakten an der Quelle:** Singh u. a. 2024 (Healthcare 12(23), 2488: 20 Studien, 2601 Teilnehmende, 4 Studien mit
  Dauer, Median 59–66, Mittel 106–154, Spanne 4–335 Tage) – stimmt. AOK-Magazin (Formen, t-Verlängerung, Erwachsene,
  drei Studien mit nachgeahmtem Lispeln, Belgien/Brasilien ohne Bestätigung, Zuzahlung ohne Betrag) – stimmt.
  Banter Speech (seitliches Lispeln „far less likely to fix themselves“, Erwachsene bald behandeln) – stimmt.
  DocCheck Zungenruhelage (Papilla incisiva, Zungenrücken am Gaumen, Lippen locker, Zähne leicht berührend, Nase) –
  stimmt. G-BA Heilmittel-Richtlinie Zahnärzte (in Kraft seit 22.1.2022, Sprech- und Sprachtherapie zahnärztlich
  verordnungsfähig) – stimmt. Heilmittel-Richtlinie § 15: **Behandlungsbeginn innerhalb von 28 Tagen** nach Ausstellung
  – bisher nirgends berücksichtigt (siehe Korrektur 9 und offener Punkt 8). Stipancic 2016 und Harkin 2016 hat der
  Kern-Durchgang bereits am Volltext bestätigt.
- **Haltung und Sprache:** keine verbotenen Wörter, kein „Sprachfehler“, keine Heilversprechen, Du-Form, Figuren nur
  aus der Besetzung (Frau Sommer, Herr Petersen, Tante Renate, Nadine Köhler, Miriam, Tarek, Lena, Carla, Sven,
  Dr. Albers), Telefonnummern nur aus den freien Blöcken (030 23125 467, 040 66969 234), keine Hilfe-Rufnummern im
  Text. Jede Lispeln-Einheit hat `fachhilfe` `logopaedie`; `n-02` endet mit `fachhilfe` `notfall`.
- **Didaktik:** Dauer 6–7 Minuten, Aufbau, beste Antworten, `wert: 1`, laute Übungen mit `leise`, Testfragen gegen
  Übungen, Lagen auf Logik je Pfad.
- **Technik:** `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur aussprache` → **0 Fehler,
  0 Hinweise** (vorher und nachher). Die gleichzeitig gemeldeten Fehler in `ueberzeugen/` stammen aus dem parallelen
  Durchgang und wurden nicht angefasst.

## 2. Korrekturen (direkt vorgenommen)

Kennungen und Struktur unverändert; geändert wurde nur Text.

| # | Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|---|
| 1 | einheiten-l.json | `aussprache-l-04` (aha, karte, anleitung Schritt 3, regel, `-m1`) | „Die Zunge bleibt – nur die Luft strömt weiter“ / „die Zunge liegen lassen“ → „Die Zunge gibt nur einen schmalen Spalt frei, und die Luft strömt weiter“ / „die Zunge nur ganz wenig lösen“; Regel „bleibt fast, wo sie beim T war“ | **Fachlich:** Bleibt die Zunge im Verschluss, entsteht ein gehaltenes T, keine Reibung. Bei der Anbahnung über das T löst sich die Spitze minimal (t-Verlängerung) |
| 2 | vorrat-l01.json | `aussprache-l-v-0007` (beste Antwort) | „bleibt genau dort … Die Zungenspitze bewegt sich nicht“ → „bleibt fast genau dort … löst sich nur ganz wenig“; „Trick“ → „Kern“ | wie 1 |
| 3 | vorrat-l01.json | `aussprache-l-v-0017` (Schritt 2) | „Zunge liegen lassen – darf sich nicht bewegen“ → „nur ganz wenig lösen – gibt nur einen schmalen Spalt frei“ | wie 1 |
| 4 | einheiten-l.json | `aussprache-l-01-b` (Antwort 1) | „Ändern ist in jedem Alter möglich“ → „Auch Erwachsene können das S noch umlernen“ | Überversprechen: Zur Behandlung Erwachsener gibt es keine Studien (08, „Offen“) |
| 5 | vorrat-l01.json | `aussprache-l-v-0008` | wie 4 | wie 4 |
| 6 | einheiten-l.json | `aussprache-l-05-a` (Stufe Satz) | „Die Seife liegt im Haus.“ → „Die Tasse ist leer.“ | Übungssätze alltagstauglich (06, Abschnitt 3); zwei echte S bleiben |
| 7 | lagen-l.json | `aussprache-l-l-01` k1b | „Den Körnern oder den Sesam?“ → „Mit Körnern oder mit Sesam?“ | Grammatik |
| 8 | lagen-l.json | `aussprache-l-l-01` k2b (Antwort 2) | „sonst hättest du nicht umgedreht“ → „… das Wort nicht umgangen“ | unverständlich |
| 9 | vorrat-l01.json | `aussprache-l-v-0019` (Schritt 3, warum) | „Ruhig mehrere Praxen anfragen; Wartezeiten sind häufig.“ → „… und die Behandlung muss bald nach der Ausstellung beginnen – frag darum ruhig schon vorher bei mehreren Praxen nach einem Platz.“ | Heilmittel-Richtlinie § 15: Beginn binnen 28 Tagen, sonst verfällt die Verordnung – bei langen Wartelisten eine echte Falle |
| 10 | lagen-l.json | `aussprache-l-l-01` k2 (Antwort 3) | „Rot werden und schnell die Tüte nehmen.“ (wert 0) → „Nichts sagen und schnell mit der Tüte gehen.“ | Haltung: Erröten ist keine Wahl – es mit 0 zu bewerten, beschämt |
| 11 | lagen-n.json | `aussprache-n-l-03` k3b (Antwort 2) | „Rot werden und schnell zum nächsten Punkt.“ → „Nichts sagen und …“ | wie 10 |
| 12 | leiter-l.json | `aussprache-l-m-01` | ergänzt: „Spürst du Luft an der Seite? Dann sprich das zuerst bei der Logopädie an.“ | Sonderregel Lispeln: Bei seitlicher Luft steht der Rat vor jeder Übung – hier fehlte die Folge |
| 13 | leiter-l.json | `aussprache-l-m-05` | ergänzt: „Spürst du Luft an der Seite, übe nicht allein weiter – zuerst zur Logopädie.“ | wie 12; erste Mission mit eigenständigem Üben des neuen S |
| 14 | tests-l.json | `aussprache-l-fc-010` | Espresso statt Kaffee (Antwort 1 wörtlich wie `aussprache-l-v-0034`) → neue Übertragungslage: Wohnort „Sassenberg“ in der Vorstellungsrunde, drei neu begründete Antworten | Testfrage glich einer Übung fast wörtlich (misst Wiedererkennen statt Übertragen). Gleiche Fähigkeit, Stufe, Kennung |
| 15 | lagen-n.json | `aussprache-n-l-02` k2 (Antwort 2) | „Sieben Zeichen ohne Luft“ → „Sechs Zeichen …“ | A-2-4-7-0-3 sind sechs Zeichen |
| 16 | lagen-n.json | `aussprache-n-l-03` ende1 | Miriam: „Zweimal getippt heute. Am Anfang der Woche hätte ich zehnmal getippt.“ / „zwei Zeichen, zweimal umgeschaltet“ → „Heute musste ich kaum tippen. Vor ein paar Wochen wäre das noch anders gewesen.“ / „Name, Runde, Verabschiedung – die festen Momente haben getragen.“ | Logik: Es ist Montagmorgen (= Anfang der Woche); und der Weg zu ende1 geht auch ganz ohne Zeichen |
| 17 | einheiten-n.json | `aussprache-n-05-b` k2 (Antwort 1) | „in zwanzig Minuten unser Angebot zeigen“ → „unser Angebot zeigen – \| zwanzig Minuten genügen.“ | Doppeldeutig („in zwanzig Minuten“ = gleich nachher) – ausgerechnet in einer Klarheits-Übung |
| 18 | tests-n.json | `aussprache-n-fc-009` | „in der du als Erste sprichst“ → „in der du den Anfang machst“ | Nutzer nicht aufs Geschlecht festlegen |
| 19 | vorrat-n01.json | `aussprache-n-v-0014` (Antwort 2) | „Mund zu – das Glas war im Weg.“ → „Weg gesprochen – …“; warum „warum du dich dahinter versteckst“ → „warum es gerade bei diesem Thema passiert“ | Ins Glas sprechen ist laut eigener Karte „weg gesprochen“ (wie Hand vor dem Mund); Begründung ohne Vorwurf |
| 20 | vorrat-n01.json | `aussprache-n-v-0016` | „Meine Stimme ist tiefer als gedacht.“ → „… höher als gedacht.“ | Auf der Aufnahme fehlt der Knochenschall mit den tiefen Anteilen (Quelle `stimmeaufnahme`) – sie klingt höher |
| 21 | vorrat-n01.json | `aussprache-n-v-0017` (Teil „Dienstag“) | „Satzende versackt:“ → „Verwaschen:“ | „Dienstag“ steht mitten im Satz |

**Nach Art:** Fachlich (Phonetik, Physik) 5 (1–3, 20, 19) · Ehrlichkeit/Überversprechen 2 (4, 5) · Recht und Weg zur
Logopädie 3 (9, 12, 13) · Haltung 3 (10, 11, 18) · Logik und Klarheit 5 (8, 15, 16, 17, 21) · Sprache/Grammatik 2 (6, 7) ·
Tests 1 (14). Zusammen **21 Korrekturen** in 9 Dateien.

## 3. Offene Punkte (nicht geändert, Empfehlung)

1. **Lispeln: Lage vor Anbahnung (wichtig, Didaktik).** Im Kursplan kommt `aussprache-l-l-01` („Sechs Sesambrötchen“,
   Fähigkeit `einschleifen`, „mit dem neuen S“, Frau Sommer lobt das neue S) als 7. Lerntag – **vor** `l-04` „Vom T zum S“.
   Der Nutzer hat das neue S da noch gar nicht angebahnt. **Empfehlung:** Kursplan `kurs-l.json` umstellen (L-01 hinter
   `l-05`, L-02 hinter `l-06`, A-Tag an die Stelle von L-01) – oder die Lage auf „das gemiedene Wort trotzdem sagen“
   umschreiben (ohne „neues S“, Frau Sommers Lob streichen). Das ist eine Strukturfrage für den Hauptstrang.
2. **Nuscheln: „Vier Wochen später“ (`n-06`).** Der Text vergleicht mit der Startaufnahme „vor vier Wochen“; im Kursplan
   ist die Einheit der 14. Lerntag. Wer täglich lernt, ist erst zwei Wochen dabei. **Empfehlung:** Titel/Texte auf
   „einige Wochen“ ändern oder die Einheit technisch frühestens 28 Tage nach dem Start freigeben.
3. **Dialekt gegen „schlaffe Laute“ (`n-01` Karte und `n-01-a`, `n-v-0010`).** „p und b, t und d klingen gleich“ und
   „Gabel“ ≈ „Kabel“ sind in fränkischen, sächsischen, schwäbischen Mundarten **Dialektmerkmal** (Lenisierung) –
   ausgerechnet `n-01-c` nennt einen fränkischen Klang. Das widerspricht „Dialekt ist kein Muster“. **Empfehlung:** Die
   Beispiele auf fehlende Endungen („nich“, „is“, „habn“) legen oder ergänzen: „– sofern es nicht zu deinem Dialekt gehört“.
4. **Fast-Doubletten Test ↔ Übung** (Prüfskript meldet sie nicht): `l-fc-003` ≈ `l-v-0004` (wert-0-Begründung wörtlich
   gleich), `l-fc-006` ≈ `l-v-0015` (Kieferorthopädin sieht Zusammenhang), `l-fc-011` ≈ `l-v-0035` („Du lispelst ja ein
   bisschen“), `l-fc-001` ≈ `l-01-a`/`l-v-0010` („th“). **Empfehlung:** wie `l-fc-010` in neue Lagen kleiden.
5. **`wert: 1` für Vermeiden.** `l-v-0034` „Einfach auf die Sesambrötchen zeigen“ (1) – in `l-l-01` ist derselbe Fingerzeig 0;
   `l-l-02` k2 „Bis abends“ (1, Tendenz `vermeiden`). **Empfehlung:** einheitlich 0 oder die 1 ausdrücklich begründen
   („du bekommst, was du willst“).
6. **`l-v-0007`, Antwort „Zähne bewusst fast schließen“ (1).** In der Praxis ist der Zahnreihenschluss beim interdentalen
   Lispeln ein üblicher erster Griff – fachlich fast gleichwertig. **Empfehlung:** Begründung „Hilft oft als erster Schritt;
   dazu …“ statt Abwertung, oder beide Teile in die beste Antwort.
7. **Beste Antwort oft die längste** (`l-01-b`, `n-06-b`, `l-fc-012`, `l-v-0033`, `l-fc-005`). Leicht zu erraten.
   **Empfehlung:** kürzen oder die brauchbare Antwort länger fassen.
8. **Fachhilfe-Text `logopaedie` (`gemeinsam.json`, nicht meine Datei).** (a) Die 28-Tage-Frist fehlt; Rat: „Frag zuerst
   bei Praxen nach einem Platz – die Behandlung muss binnen vier Wochen nach der Verordnung beginnen.“ (b) „einen Teil
   der Kosten plus einen festen Betrag je Verordnung“ beschreibt die heutige Zuzahlungsform; ändert sich zum 1.1.2027
   auch die Form, muss der Satz mit. **Wunsch an den Hauptstrang.**
9. **Stille Ersatzübungen.** Lispeln verweist oft auf Zuordnungsaufgaben (`l-05-a` → `l-v-0037` „Welche Stufe?“,
   `l-v-0045`…`0048` → `0033/0037/0039`). Echte stumme Artikulation üben nur `l-v-0003`, `-0009`, `-0012`, `-0033`.
   **Empfehlung:** zwei, drei stumme Spiegel-Aufgaben je Stufe der Laut-Leiter ergänzen und die Verweise darauf legen.
10. **Kleinigkeiten:** `n-03` „eine Nachfrage im Chat zählt mit“ – gemeint ist wohl der Chat während eines Videocalls;
    so schreiben. `l-02` (schaetzen): Knochenschall erklärt vor allem die Klangfarbe; dass man das eigene S schlecht hört,
    liegt mehr an der Gewöhnung – die Auflösung sagt „zum Teil“, das reicht. `l-l-02`: Ein Kunde schickt ein Muster an
    deine Privatadresse – etwas ungewöhnlich; „ins Homeoffice“ wäre glaubwürdiger. `n-v-0008` „Bank“/„Bang“ – „Bang“ ist
    kaum ein deutsches Wort; „Rat“/„Rad“ ginge nicht (Auslautverhärtung), besser „Tank“/„Dank“.
11. **Quelle `praxis-lispeln`** ist `geprueft: false` (Praxiswissen, ohne Zahlen) – zulässig. Vor einer Freigabe für alle
    wäre ein Lehrbuch der Artikulationstherapie als Beleg schön.

## 4. Urteil

- **Lispeln: freigabereif – ja, mit einer Bedingung.** Fachlich nach den Korrekturen sauber: richtige S-Bildung, klare
  Formen, ehrliche Grenzen, der Weg zur Logopädie (auch über die Zahnarztpraxis) stimmt, jede Einheit hat `fachhilfe`,
  nichts im Mund, kein Heilversprechen, Ton nie beschämend. **Bedingung:** Punkt 3.1 (Lage vor der Anbahnung) lösen.
  Punkte 3.4–3.9 verbessern, sind keine Hürde.
- **Nuscheln: freigabereif – ja.** Muster, Gegenmittel, Dialekt, Teil-Mythos „langsam“, Poltern und Notfall sind ehrlich und
  richtig. Empfohlen vor der Freigabe: 3.2 („vier Wochen“) und 3.3 (Dialekt-Beispiel).

## 5. Leseliste für Davide (Lispeln)

1. `einheiten-l.json`, alle sechs Einheiten `aussprache-l-01` … `-06` – besonders `l-04` „Vom T zum S“ (Korrektur 1).
2. `lagen-l.json`, `aussprache-l-l-01` „Sechs Sesambrötchen“ – und dazu Punkt 3.1 (wo sie im Kurs steht).
3. `vorrat-l01.json`, `aussprache-l-v-0019` (Weg zur Logopädie, 28-Tage-Frist) und `aussprache-l-v-0007`.
4. `leiter-l.json`, `aussprache-l-m-04` (Verordnung oder bewusst allein starten).
5. `gemeinsam.json`, Fachhilfe `logopaedie` – mit Punkt 3.8 im Kopf.
