# Gegenlesen: Bereich `lesen` („Menschen lesen“)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser mit vier Brillen: (1) Sozialpsychologie mit Blick auf Pseudowissenschaft (Lügenerkennung, Mikroausdrücke, NLP), (2) autistische Menschen und Menschen aus anderen Kulturen – werden sie falsch gelesen oder verdächtig gemacht?, (3) Ethik – Verstehen und Nachfragen oder Durchschauen und Manipulieren?, (4) Faktenprüfung · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md` (bes. Abschnitt 7 Einfluss-Klassen), `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `derCoach/03_WISSEN_WIRKUNG.md` Abschnitt 7 (Autorenregel: keine Deutung als sicher auflösen), `derCoach/05_LEHRPLAN.md` 3.10, `src/coach/kern/inhaltTypen.ts`.
- Alle Dateien in `src/coach/inhalt/lesen/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`.
- Kontext: `besetzung.json`, `gemeinsam.json` (Karte `einschaetzen`), Figuren-Übersicht in `gegenlesen/antrieb.md`, Nachbarbereiche `stimme` (Mythos 7-38-55, `stimme-w-080`), `flirten` (Signale, verschränkte Arme), `gespraech` (Quelle `eyal2018`). Fremde Quellen, die `lesen` nutzt: `mehrabian1967` (stimme), `eyal2018` (gespraech), `savitsky2003` (ruhe), `lee2020` (flirten), `kahneman2011` (ueberzeugen).
- **An der Quelle geprüft** (Abstract, Volltext-Auszüge oder Darstellungen der Autoren):
  - Bond & DePaulo 2006: 206 Arbeiten, 24.483 Urteilende, 54 % richtig; Fachleute nicht besser als Laien. **Stimmt.** (47 % Lügen / 61 % Wahrheiten aus eigener Kenntnis des Abstracts.)
  - Eyal, Steffel & Epley 2018: 25 Experimente; Hineinversetzen machte nicht treffsicherer, insgesamt eher ungenauer, und **nur gelegentlich** selbstsicherer; dass Nachfragen hilft, zeigte **der abschließende Versuch**. → Korrekturen in `1-07` und `w-005` (dort stand „nur sicherer“ bzw. „oft nur selbstsicherer“ und „in 25 Experimenten … Fragen schon“).
  - Jordan u. a. 2019: Zufallszuteilung METT / Schein-Training / keins; METT nicht besser, alle etwa beim Zufall. **Stimmt.**
  - Porter & ten Brinke 2008: 697 Ausdrücke, Mikroausdrücke in rund 2 %, nur obere oder untere Gesichtshälfte. **Stimmt.**
  - Kraus 2017: 5 Experimente, N = 1.772, Stimme allein im Mittel genauer; laut Zusatzmaterial gegenüber Bild **und** Stimme nur in 2 von 5 Experimenten deutlich. → Abschwächungen in `w-008`, `1-04`.
  - Ambady & Rosenthal 1992: 38 Studien, Ausschnitte unter fünf Minuten, kurze nicht schlechter als längere (zwischen Studien). **Stimmt.**
  - Sasson u. a. 2017: drei Studien, ungünstigere Erstwirkung autistischer Menschen nach wenigen Sekunden, verschwindet bei Abschrift. **Stimmt.**
  - Forer 1949: 39 Studierende, Mittel um 4,3 auf 0–5. **Stimmt** („über 4“).
  - Gunnery u. a. 2013: rund 71 % konnten das Duchenne-Lächeln auf Wunsch zeigen. **Stimmt** („viele“).
  - Epley 2014, deutscher Titel „Machen wir uns nichts vor!“: **nicht auffindbar**, offenbar keine deutsche Ausgabe → Korrektur in `quellen.json`.
- Aus eigener Kenntnis ohne Befund geprüft: DePaulo 2003 (158 Hinweise, Blick kaum), Hartwig & Bond 2011 (Linsenmodell, Hinweise schwach), Vrij u. a. 2010, Wiseman u. a. 2012 (drei Studien, NLP-Blickrichtung), Barrett u. a. 2019, Cowen u. a. 2021 (6 Mio. Videos, 144 Länder, 16 Ausdrücke), Jack u. a. 2012, Aviezer u. a. 2012 (Tennis, Körper statt Gesicht, Illusion vom Gesicht), Willis & Todorov 2006 (5 Experimente, 100 ms, mehr Zeit → sicherer), Zaki u. a. 2008, Gilovich u. a. 1998, Savitsky & Gilovich 2003, Friedman & Elliot 2008, Nisbett & Wilson 1977 (118), Blanch-Hartigan u. a. 2012, Premack & Woodruff 1978, Mehrabian & Wiener / Ferris 1967 (Wörter wie „thanks“, „maybe“). Deutsche Buchtitel von Ekman (2), Navarro, Barrett, Gladwell, Pease, Kahneman stimmen.
- **Nicht gedeckt** durch die angegebenen Quellen: „oft aber selbstsicherer“ in `w-088` (siehe offene Punkte).
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur lesen`. Vorher **0 Fehler, 0 Hinweise**, nachher **0 Fehler, 0 Hinweise**.

## Gesamteindruck

Ein ungewöhnlich sauberer Bereich – genau das Gegenteil eines Körpersprache-Ratgebers. Der rote Faden „beobachten, vergleichen, bündeln, fragen“ zieht sich durch alle 85 Vorratsübungen, alle fünf Lagen und alle Missionen. Keine Aufgabe löst eine Deutung als sicher auf; die besten Antworten lauten fast immer „spricht eher für … – so prüfst du es“.

**Pseudowissenschaft:** 7-38-55, „Lügner schauen weg“, NLP-Blickrichtung, Mikroausdrücke als Lügendetektor, das unfälschbare Lächeln, Gesten-Wörterbücher (Pease als Warnbeispiel) – alles richtig als Mythos eingeordnet, mit passenden Quellen. Nirgends wird Lügenerkennung versprochen; im Gegenteil wird ein Seminar mit „fast jede Lüge“ als rote Masche erkannt (`v-0051`).

**Neurodivergenz und Kultur:** stark. Diagnosen aus dem Alltag sind ausdrücklich falsche Antworten (`v-0060`, `fc-015`, `w-079`). Wenig Blickkontakt und wenig Mimik werden mit Autismus, Temperament und Kultur erklärt, nie als verdächtig (`v-0026`, `w-011`, `w-015`, `w-078`). „Wer still ist, ist nicht verdächtig“ (`1-03`). Das „Double-Empathy“-Modell (Milton) ist als Denkmodell gekennzeichnet. Eine Stelle belohnte ein Kultur-Klischee mit `wert: 1` – behoben.

**Ethik:** Lesen dient durchweg dem Verstehen. Die Verkaufslagen `l-02` und `l-05` enden ausdrücklich mit „verstehen, nicht drücken“; erfundene Eile ist dort eine rote Linie mit eigener Tendenz. Rote Techniken (Cold Reading, gespielte Gefühle, Körpersprache-Vorwurf, Trefferliste) stehen nur in `kunstgriff` und auf der Wissens-Seite mit `abwehr` – keine Mission, keine Einsatzübung. „Ein Nein gilt“ (`v-0071`), „Ruhe ist auch eine Antwort“ (`v-0081`), Essen und Körper nicht vor allen ansprechen (`v-0084`).

Die Mängel waren klein: zwei Überdehnungen der Eyal-Studie, eine zu glatte Darstellung der Kraus-Befunde, ein fehlender Quellenbeleg in `1-06`, ein erfundener deutscher Buchtitel, zwei Lagen-Enden, die nicht auf jedem Weg passten, zwei Szenen, deren Begründung Fakten nachreichte, und drei `wert: 1`-Antworten, die nicht brauchbar waren.

## Korrekturen (alle Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Fakten und Quellen (10)

| Datei | Kennung | Vorher → Nachher | Grund |
|---|---|---|---|
| einheiten-1 | `lesen-1-07` belegHinweis | „In 25 Experimenten machte Hineinversetzen nicht treffsicherer, Fragen schon.“ → „… nicht treffsicherer; im abschließenden Versuch machte Nachfragen treffsicherer.“ | Eyal 2018: Nachfragen wurde nur im letzten Versuch geprüft. |
| einheiten-1 | `lesen-1-07` Karte „Die Prüf-Frage“ | „nicht genauer – nur sicherer“ → „nicht genauer – manchmal nur sicherer“ | Laut Abstract stieg die Sicherheit nur gelegentlich. |
| einheiten-1 | `lesen-1-07-m2` | „In Experimenten kaum – eher selbstsicherer.“ → „In Experimenten nicht – manchmal nur selbstsicherer.“ | wie oben |
| wissen | `lesen-w-005` text | „oft nur selbstsicherer“ → „manchmal nur selbstsicherer“ | wie oben |
| wissen | `lesen-w-005` belegHinweis | „25 Experimente … zeigen das für Gefühle, Vorlieben und Meinungen.“ → „… zeigen das fürs Hineinversetzen (…); dass Nachfragen treffsicherer macht, zeigte der abschließende Versuch.“ | wie oben |
| wissen | `lesen-w-008` text + belegHinweis | „In mehreren Experimenten schätzten Menschen Gefühle genauer ein …“ → „Über fünf Experimente hinweg … im Mittel etwas genauer …“; Hinweis ergänzt: „gegenüber Bild und Stimme zusammen war der Vorsprung nur in zwei davon deutlich“ | Kraus 2017, Zusatzmaterial: Exp. 1, 4, 5 ohne deutlichen Unterschied zur Kombination. |
| einheiten-1 | `lesen-1-04` Karte „Das Bündel“ und `lesen-1-04-b` (vierte Antwort, warum) | „sogar genauer als mit Bild“ → „sogar etwas genauer als mit Bild“ (Karte: „In Versuchen …“, um unter 420 Zeichen zu bleiben) | wie oben; kleine Effekte |
| einheiten-1 | `lesen-1-06` quellen | `…, "jordan2019", "gilovich1998"` → `…, "jordan2019", "porter2008", "gilovich1998", "savitsky2003"` | Die Karte sagt „Flüchtige Gesichtsausdrücke sind selten“ (Porter 2008), `1-06-a` und die Karte behandeln Nervosität beim Reden – das zeigt Savitsky & Gilovich 2003, nicht Gilovich 1998 (Lüge, Ekel). |
| tests | `lesen-fc-014` (zweite Antwort) | „das Training half in Prüfungen nicht“ → „in einer unabhängigen Prüfung nicht“ | Es gibt eine unabhängige Prüfung (Jordan 2019); die Begründung sagt selbst „in einer Studie“. |
| quellen | `epley-mindwise` | „(deutsch: Machen wir uns nichts vor!)“ → „New York: Knopf (eine deutsche Ausgabe war am 25.11.2026 nicht auffindbar)“ | Deutscher Titel nicht belegbar; Händler führen nur die englische Ausgabe. |

### Lagen- und Szenen-Logik (5)

| Datei | Kennung | Vorher → Nachher | Grund |
|---|---|---|---|
| einheiten-1 | `lesen-1-07-d` Knoten `ende1` sagt | „Tarek nickt. „Genau. Ich glaub, das sag ich ihm morgen.““ → „Tarek nickt langsam. „Ich glaub, ich sag ihm morgen, dass ich gern gefragt worden wäre.““ | `ende1` wird auch über „Albers meint das bestimmt nicht so“ erreicht – darauf passt „Genau“ nicht. |
| lagen-1 | `lesen-l-03` Knoten `ende1` ende | „… das Bündel schon: schnelles Aufstehen, harte Teller, eine spitze Bemerkung.“ → „… das Bündel schon: das Aufstehen gegen ihre Gewohnheit und was danach kam.“ | Harte Teller gibt es nur auf dem Weg über `k2`, die spitze Bemerkung nur über `k2b`; über `k2c` keins von beiden. Der Schluss gilt jetzt auf jedem Weg. |
| lagen-1 | `lesen-l-03` Knoten `k3b`, erste Wahl | „… Aber sag mal – ist dir das mit Weihnachten nicht egal?“ → „… Aber sag mal – geht dir das mit Weihnachten nach?“ | Die verneinte Frage war missverständlich (klingt nach „Ist es dir egal?“) und als beste Antwort keine offene Prüf-Frage. |
| vorrat-01 | `lesen-v-0032` lage | „Nach deinem Vorschlag in der Teamrunde ist es still. …“ → „Teamrunde kurz nach dem Mittagessen. Nach deinem Vorschlag ist es still. …“ | Die Begründung zu „Tarek gähnt“ beruft sich auf „kurz nach dem Mittagessen“, das stand nicht in der Lage – unfaire Auswahl. |
| vorrat-01 | `lesen-v-0033` lage | „Beim Elternabend im Sportverein …“ → „Beim Elternabend in der zugigen Halle des Sportvereins …“ | Die Begründung zu den verschränkten Armen beruft sich auf „die zugige Halle“, die vorher nicht genannt war. |

### Ethik, Vielfalt und Bewertung (5)

| Datei | Kennung | Vorher → Nachher | Grund |
|---|---|---|---|
| vorrat-02 | `lesen-v-0055` dritte Antwort (`wert: 1`) | „In ihrer Heimat lächelt man bei so etwas bestimmt immer, das hat also gar nichts weiter zu bedeuten.“ → „Erst mal nichts hineinlesen und bei der Sache bleiben.“; warum entsprechend („… später kurz nachfragen hilft“) | Ein Kultur-Klischee („bestimmt immer“) bekam Teilpunkte. Das widerspricht dem Bereich und trifft genau die Menschen, die er schützen will. Die neue Wahl ist wirklich brauchbar, aber unvollständig. |
| vorrat-01 | `lesen-v-0013` vierte Antwort (`wert: 1`) | „Meistens ist den Leuten einfach kalt – alle anderen Bedeutungen kann man getrost vergessen.“ → „Vielleicht ist ihm einfach kalt – an die harmlose Erklärung denke ich zuerst.“; warum angepasst | „Alle anderen Bedeutungen vergessen“ ist eine neue feste Deutung, also nicht brauchbar. |
| vorrat-02 | `lesen-v-0051` dritte Antwort (`wert: 1`) | „Übertreibung – aber ein bisschen wird schon dran sein, sonst würden sie es ja nicht so verkaufen.“ → „Übertreibung – an der Stimme hört man zwar manches, aber sicher nicht „fast jede Lüge“.“; warum angepasst | Der alte Grund („sonst würden sie es nicht verkaufen“) ist derselbe Fehlschluss wie die `wert: 0`-Antwort „Wenn es so teuer ist …“. |
| einheiten-1 | `lesen-1-05-a` dritte Antwort, warum | „Er hat vermutlich einfach Hunger und eine Verabredung.“ → „Vielleicht hat er einfach Hunger oder ist verabredet.“ | Die Begründung deutete selbst mit Gewissheitston – im Bereich, der genau das abtrainiert. |
| vorrat-02 | `lesen-v-0048` letzter Eintrag, warum | „Druck mit erfundener Eile – sie überhört das Zögern und überschreitet eine rote Linie.“ → „Druck statt Frage – das Zögern wird überhört. Ist die Knappheit erfunden, ist das eine rote Linie.“ | Ob die Plätze knapp sind, sagt die Aufgabe nicht; „erfunden“ war unterstellt. |

### Sprache (3)

| Datei | Kennung | Vorher → Nachher | Grund |
|---|---|---|---|
| vorrat-02 | `lesen-v-0062` frage | „Was zeigt am schnellsten, dass …“ → „Was zeigt ihr am ehesten, dass …“ | Superlativ ohne Beleg |
| vorrat-02 | `lesen-v-0062` zweite Antwort, warum | „die schnellsten Zeichen von Wärme“ → „gut lesbare Zeichen von Wärme“ | wie oben |
| tests | `lesen-fc-022` zweite Antwort, warum | „die schnellsten Zeichen von Wärme“ → „gut lesbare Zeichen von Wärme“ | wie oben |

**Summe: 23 Korrekturen** (Fakten und Quellen 10 · Logik 5 · Ethik/Bewertung 5 · Sprache 3). Danach Index neu erzeugt, Prüfskript: 0 Fehler, 0 Hinweise.

## Offene Punkte (Ermessen, nicht geändert)

1. **`w-088` „Polizisten erkennen Lügen“:** Der Halbsatz „– oft aber selbstsicherer“ steht in keiner der angegebenen Quellen (`bond2006`, `hartwig2011`). *Empfehlung:* entweder Kassin, Meissner & Norwick (2005, Polizisten selbstsicherer, nicht treffsicherer) als geprüfte Quelle ergänzen oder den Halbsatz streichen.
2. **`gemeinsam.json`, Karte `einschaetzen` (Hauptstrang):** Schritt 1 „Achte in den ersten Minuten darauf, wie die Person sonst wirkt – ihr Normalzustand“ widerspricht `lesen-1-03-b` (die Grundlinie zeigt sich nicht beim Kennenlernen, sondern über mehrere gewöhnliche Tage). Das Wort „Normalzustand“ meidet der Bereich bewusst. *Vorschlag:* „Kennst du die Person: Wie ist sie sonst? Kennst du sie nicht: Was ändert sich im Lauf des Gesprächs?“
3. **Einfluss-Klasse von `v-0079`** (Kollege hält sich für Lügenerkenner): Das ist Selbsttäuschung, keine Einflusstechnik gegen dich; `rot` passt nur halb. *Empfehlung:* lassen, wenn `kunstgriff` immer eine Klasse braucht; sonst die Klasse weglassen (LIESMICH 7: Einordnen ohne eigene Technik trägt kein `einfluss`).
4. **Tendenz `bloßstellen`** (`v-0084`, `fc-020`, eine weitere Stelle in einem anderen Bereich) ist die einzige Tendenz mit ß; sonst ASCII (`gekraenkt`, `glaeubig`). Für die Mustererkennung bereichsübergreifend vereinheitlichen (Hauptstrang).
5. **Fähigkeit `lesen.gesicht` ohne eigene Einheit:** In Stufe 1 lehrt keine Einheit „Gesichter brauchen Lage“ (kommt erst in Stufe 2). `1-06` führt `gesicht` als Fähigkeit ohne Gesichts-Übung; der Übungstag `ue-006` übt es dann mit neun Vorratsaufgaben (Duchenne, Kultur, Stirnrunzeln). Die Begründungen erklären genug, sodass es trägt. *Empfehlung:* in `1-06` die Karte um „Ein Gesicht allein reicht nicht“ ergänzen oder `ue-006` bewusst so lassen.
6. **Vorgriff auf die Prüf-Frage in `l-01`/`l-02`:** vertretbar. Beide Lagen verlangen nur „Beobachtung nennen + offen fragen“, nicht das dreiteilige Muster aus `1-07`. Vorbereitet wird das durch `1-02` (die Karte: „Eine Beobachtung lässt sich viel leichter ansprechen“) und `1-05` (Ausweg-Satz). Kein Eingriff nötig; *optional:* in `1-03` beim „Wenn …, dann …“ eine dritte Zeile „… spreche ich die Beobachtung unter vier Augen an“.
7. **Erst Wärme, dann Kompetenz** (`w-013`, `w-033`, `w-123`, `v-0062`, `fc-022`) stützt sich nur auf `fiske2007` mit `geprueft: false`, trägt aber Beleg B. *Empfehlung:* Quelle nachschlagen und auf `true` setzen; das Rezept („Name, Lächeln, Interesse zuerst“) ist eher P als B.
8. **Häufigkeitswort ohne Beleg:** Das Aha von `1-05` lautet „Abwendung heißt … meist eher „Ich muss gleich woanders sein““, ebenso `v-0015`. `w-010` ist ausgewogener („oder „Mir reicht's““). *Vorschlag:* „oft eher“ statt „meist eher“.
9. **Andere Gründe für Signale:** Müdigkeit, Kälte, Kultur und Autismus sind gut abgedeckt. Schmerz und Krankheit kommen nur am Rand vor (Kopfweh in `v-0053`, Heiserkeit in `v-0041`), soziale Angst gar nicht ausdrücklich. *Empfehlung für Stufe 2* („Gesichter brauchen Lage“, „Vorbehalte hören“): Schmerz, chronische Erkrankung, Medikamente, Hörminderung und soziale Angst ausdrücklich als Gründe nennen.
10. **Ähnlichkeit Tests ↔ Übungen:** `fc-022` gleicht im Aufbau `v-0062`: neue Person, Ablenker „Kompetenz zuerst“, beste Antwort Name + Zuwendung, „abwarten“ mit `wert: 1`. `fc-023` gleicht `v-0064` (Freundlichkeit statt Satz). Nicht wortgleich, aber leicht wiederzuerkennen. *Empfehlung:* eine der beiden Test-Lagen umbauen (z. B. `fc-022` als Rückmeldung nach einem Missverständnis).
11. **Figuren:** Alle passen zu `besetzung.json` (Petersen hört schlecht, Köhler rechnet und schaut auf die Uhr, Carla hat ihre Routine, Jonas ohne Stotter-Bezug, aber auch ohne Klischee). Leichte Punkte:
    - Tante Renate „sagt, was sie denkt“, überspielt in `l-03` aber ihre Enttäuschung. Die Lage lebt gerade von dieser Abweichung; ein Satz in `lage` („Sonst sagt sie sofort, was ihr nicht passt“) würde die Grundlinie sichtbar machen.
    - In `l-01` holt Lena freitags ihre Mutter von der Physiotherapie ab. Laut `smalltalk` kommt sie aus Leipzig. Das ist kein harter Widerspruch.
    - In `l-01` bietest du über `k2` (dritte Wahl) an, die Anrufe zu übernehmen, danach tauscht Lena mit Tarek. Das ist vertretbar.
12. **`v-0079`, Begründung zur dritten Antwort** („kaum Unterschiede zwischen Menschen beim Lügenerkennen“): Das stammt aus Bond & DePaulo 2008 (individuelle Unterschiede), nicht aus 2006. Im Vorrat stehen keine Quellen, daher unkritisch. Bei Gelegenheit `bond2008` als Quelle anlegen.

## Urteil

**Freigabereif: ja.** Fachlich ehrlich, frei von Körpersprache-Hokuspokus, respektvoll gegenüber autistischen Menschen und anderen Kulturen. Der Bereich lehrt durchgehend Nachfragen statt Durchschauen. Die 23 Korrekturen sind eingearbeitet. Die offenen Punkte blockieren die Freigabe nicht; Punkt 1 (ein ungedeckter Halbsatz) und Punkt 2 (Widerspruch in der gemeinsamen Karte) sollten zeitnah erledigt werden.
