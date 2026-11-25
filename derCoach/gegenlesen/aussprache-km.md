# Gegenlesen: `aussprache` (Kern) – Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Blick:** unabhängiges Fachlektorat (Sprecherziehung/Logopädie), Faktenprüfung, Didaktik, Sprache
**Geprüft:** `src/coach/inhalt/aussprache/` – `einheiten-2.json` (2-01…2-06), `einheiten-3.json` (3-01…3-05),
`lagen-2.json` (l-56…l-60), `lagen-3.json` (l-61…l-65), `vorrat-03.json` (v-0121…v-0200), `vorrat-04.json` (v-0201…v-0280),
`kurs.json` (Lerntage mit `"phase": "k"`/`"m"`), `tests.json` (fc-025…fc-040), `wissen.json` (w-014…018, w-048, w-049, w-089,
w-124, w-125), `quellen.json` (krause2002, pittman2001, boland2022, leegibbon2015, telefonband).
**Nicht geprüft:** Schwerpunkt-Dateien (`-n`, `-l`, `-s`).
**Maßstab:** `derCoach/08_ENTSCHEIDUNGEN.md`, `06_INHALT_REGELN_MUSTER.md` (Abschnitt 3 und 16), `src/coach/inhalt/LIESMICH.md`
(3a ff.), `05_LEHRPLAN.md` 3.1, `03_WISSEN_WIRKUNG.md` 9, `07_QUELLEN.md`, `kern/inhaltTypen.ts`, `besetzung.json`.
**Es wurde keine Inhaltsdatei geändert.**

## 1. Was geprüft wurde – und was in Ordnung ist

- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur aussprache` → **0 Fehler, 4 Hinweise**. Alle vier Hinweise betreffen
  Stufe 1 (v-0042, v-0057, fc-005, fc-011 – „keine brauchbare Antwort“, Folge der Empfehlung 3.4 aus `aussprache.md`), keiner
  die neuen Dateien. `--soll aussprache` meldet für die Übungstage ue-008…ue-018 **keine Lücke**. (Nebenbei: Ein Lauf meldete
  `_index.json: veraltet` – das betrifft den Gesamtstand, offenbar wird parallel an anderen Bereichen geschrieben.)
- **Kursplan:** Phase k = 20 Lerntage (6 E · 6 Ü · 4 L · 3 A · 1 S `aussprache-s-52`), Phase m = 18 (5 · 5 · 4 · 3 · 1 S
  `aussprache-s-53`). Bänder k `[3,6]`→`[4,7]`, m `[5,8]`→`[6,10]` – wie LIESMICH 3a. Lagen-Kennungen l-56…60 / l-61…65 richtig.
- **Laut/leise:** Alle 84 lauten Übungen (18 in Einheiten, 66 im Vorrat) verweisen auf eine **echte `stumm`-Übung derselben
  Fähigkeit** (per Skript geprüft; Stufe meist ±1). Damit ist Empfehlung 3.2 aus dem Stufe-1-Gegenlesen umgesetzt – sehr gut.
- **Tests:** 16 Szenarien, k: Stufen 4–7, m: 6–9 wie verlangt; Selbstbild/Verhalten unverändert.
- **Fachliches, das stimmt:** Heiserkeit „länger als vier Wochen → HNO-Praxis“ (2-04, v-0255); Logopädie nur über Schritt
  `fachhilfe` (2-04); keine Rufnummern; nichts zu Stottern/Lispeln; keine Wertung von Dialekt; Buchstabiertafel DIN 5009:2022
  (Salzwedel, Frankfurt, Offenbach, München, Essen, Rostock) korrekt; Gewohnheiten „meist um zwei Monate, Spanne 4–335 Tage“
  wie `08`; Lautbildungsorte (p/b/m Lippen, t/d/n Zungenspitze, k/g hinterer Gaumen), Lippenrundung, lang/kurz (Beet/Bett,
  Rate/Ratte, Wahl/Wall, Hüte/Hütte, Miete/Mitte) korrekt; Abspannen (Coblenzer/Muhar) richtig beschrieben; Stimmschonung
  („tragen statt schreien“, kein Räuspern, Flüstern keine Erholung) sachgerecht.
- **Quellen nachgeschlagen:**
  - `krause2002`: 14 Prozentpunkte (deutlich/normales Tempo) und rund 18 (deutlich/langsam) für gut hörende Zuhörer im
    Rauschen, fünf geübte Sprecher – von mehreren Sekundärquellen übereinstimmend berichtet (Krause & Braida 2009; ASHA-Handout
    der Arbeitsgruppe; Krause 2019 zitiert dieselben 14 Punkte). **Die Zahlen sind angemessen**, weil sie mit „rund“, „in einer
    Studie“ und der Grenze „nur fünf Sprecher, Labor“ stehen. Siehe kann-Befund K1.
  - `pittman2001`: fünf Sprecherinnen, 30 Erwachsene, Stimmengewirr, Vorteil ~15 % bei gleichem Pegel – stimmt, **aber** im
    Hörtest wurden nur die Aufnahmen **einer** der fünf Sprecherinnen verwendet (Befund M2).
  - `leegibbon2015`: drei Studien, 22 Kinder, „kein starker Beleg“ – stimmt.
  - `telefonband`: Seite nennt 300–3400 Hz und die s/f-Verwechslung – stimmt.
  - `boland2022`: Die Studie zeigt längere Sprecherwechsel über Zoom als im direkten Gespräch (ca. 135 ms gegenüber 487 ms);
    dass die kleinen Verzögerungen die Ursache sind, ist die Deutung der Autoren, nicht experimentell isoliert (Befund S6).
- **Didaktik insgesamt:** Die Einheiten folgen den Lehrplan-Stichworten (Stufe 2: 1–6, Stufe 3: 1–5), bauen auf Stufe 1 auf
  (Klar-Modus → normales Tempo; Satzende halten → Atem/Abspannen; Wenn-Dann → Merkmal pro Woche → Drei-Monats-Plan) und haben
  echte Verzweigungen mit Rettungswegen. Figuren passen zur Besetzung (Nadine Köhler „rechnet genau“, Lena „zurückhaltend“,
  Tante Renate „sagt, was sie denkt“, Tarek als Spaßvogel, Dr. Albers sachlich-knapp). Ton, Du-Form, „…“ sauber.

## 2. Befunde

Zählung: **muss 3 · sollte 9 · kann 12**.

### muss

**M1 – Lage `aussprache-l-56`, Knoten `k3b` ist von zwei Wegen aus unlogisch** (`lagen-2.json`)
- Zitat: `k2b` → „Weiterreden wie bisher, sie hat dich ja verstanden.“ (weiter `k3b`) und `k2c` → „„Ja, ja, kriegen wir hin.““
  (weiter `k3b`); `k3b` sagt dann: „Frau Köhler, kühl: „In Masse? Ich brauche zwölf Stück, genau zugeschnitten. Haben Sie mir
  zugehört?““ und die Rückmeldung zu „Sie haben sich verhört“ lautet „Gesagt hattest du „Masse“.“
- Begründung: Auf diesen beiden Wegen hat der Nutzer „Masse“ nie gesagt. Die Kundin reagiert auf etwas, das nicht passiert ist.
- Ersatz (Knoten `k3b` neutral fassen, Kennungen bleiben):
  - `sagt`: „Frau Köhler, kühl: „Moment – haben Sie ‚nach Maß‘ verstanden? Ich brauche zwölf Stück, genau zugeschnitten.““
  - Wahl 1 (wert 2): „„Ja, genau. | Nach Maß – | zwölf Platten, | genau zugeschnitten.““ – rueck: „Ruhig bestätigt, Vokal lang,
    mit Zahl abgesichert. So holst du das Gespräch zurück.“
  - Wahl 2 (wert 0, `rechtfertigen`): „„Hab ich doch gesagt.““ – rueck: „Wer der Kundin das Nachfragen übelnimmt, verliert sie.
    Bestätigen hätte einen Satz gekostet.“
  - Siehe auch S1 (Maß/Masse).

**M2 – `pittman2001`: Der Hörtest beruht auf einer Sprecherin, nicht auf fünf** (`quellen.json`, `einheiten-3.json`,
`wissen.json`)
- Zitate: Quelle: „Fünf Sprecherinnen sprachen Sätze … verstanden 30 Erwachsene … die im Lärm gesprochenen Sätze besser.“ ·
  3-04 `belegHinweis`: „zeigte eine Studie mit fünf Sprecherinnen“ · 3-04 `schaetzen`: „Fünf Sprecherinnen lasen Sätze …
  Zuhörer hörten die Sätze danach …“ · w-015 `belegHinweis`: „Eine Studie mit fünf Sprecherinnen.“
- Begründung: Laut Zusammenfassung wurden in Teil II „the sentences produced by one of the 5 talkers“ 30 Erwachsenen
  vorgespielt. Der Text macht den Befund breiter, als er ist – Regel „Beleg-Stufe ehrlich“ (Prüfliste 5).
- Ersatz:
  - Quelle: „… Fünf Sprecherinnen sprachen kurze Sätze in Ruhe und bei Rauschen; im Lärm wurden sie deutlich lauter und dehnten
    die Wörter etwas. Die Aufnahmen einer dieser Sprecherinnen hörten 30 Erwachsene im Stimmengewirr: Bei gleichem Pegel wurden
    die im Lärm gesprochenen Sätze besser verstanden (im Mittel rund 15 Prozent). Am 25.11.2026 an der Zusammenfassung geprüft.“
  - 3-04 `belegHinweis`: „Dass man im Lärm von selbst lauter spricht, zeigten fünf Sprecherinnen. Dass so gesprochene Sätze im
    Lärm besser verstanden werden, wurde mit den Aufnahmen einer Sprecherin geprüft – ein Einzelbefund. Näher rangehen,
    zuwenden und kurze Sätze sind Praxiswissen.“
  - 3-04 `schaetzen.frage`: „Eine Sprecherin las Sätze einmal in Ruhe und einmal bei Rauschen. Zuhörer hörten die Sätze danach
    in Stimmengewirr – gleich laut abgespielt. Wie kamen die im Lärm gesprochenen Sätze an?“
  - w-015 `belegHinweis`: „Ein Hörversuch mit den Aufnahmen einer Sprecherin. Die Tipps zu Nähe, Blick und kurzen Sätzen sind
    Praxiswissen.“

**M3 – `aussprache-v-0226`: phonetisch falsche Begründung „nich“ → „noch“** (`vorrat-04.json`)
- Zitat: `{ "t": "nich", "fehler": "„nicht“ – ohne t kann man „noch“ hören, und der Sinn dreht sich." }`
- Begründung: „nich“ [nɪç] und „noch“ [nɔx] unterscheiden sich in Vokal und Reibelaut, nicht im t. Das Weglassen des t erzeugt
  kein „noch“. Genau diese Art Fehler (Verneinung „im Wortende“) wurde in Stufe 1 schon korrigiert (`aussprache.md`, Nr. 10).
  Der Auftrag verlangt aber Stellen, „an denen der Sinn kippt“.
- Ersatz: den letzten Satz austauschen gegen eine echte Sinn-Kippe am Wortende, z. B. Teile
  `… { "t": "Liste." }, { "t": "Lena" }, { "t": "schick", "fehler": "„schickt“ – ohne t klingt es wie eine Bitte an Lena („Lena, schick …“) statt wie eine Ankündigung." }, { "t": "sie" }, { "t": "morgen." }`
  (Satz davor: „Die Kunde wollen die alte Liste.“ bleibt mit dem Fehler „Kunden“).

### sollte

**S1 – „Maß – Masse“ ist kein Wortpaar für Vokallänge** (`einheiten-2.json` 2-02 `aha`, `schaetzen`, Zeile im `nachsprechen`;
Merkkarte m1; `lagen-2.json` l-56 durchgehend)
- Zitat 2-02 `schaetzen`: „Was könnte der Lieferant verstehen, wenn das „a“ zu kurz gerät?“ – Lösung „„in Masse“ – also eine
  große Menge“. l-56 `k2` (wert 0): „„Klar, in Masse kein Problem.“ – das a knapp gesprochen.“
- Begründung: „Maß“ ist einsilbig, „Masse“ zweisilbig; ein kurzes a in „nach Maß“ ergibt „nach Mass“, nicht „in Masse“. Die
  l-56-Wahl ist zudem ein anderer Ausdruck („in Masse“), keine falsche Vokallänge. Außerdem ist „Maß“ mit kurzem a im Süden
  regional verbreitet (Bier-„Mass“) – das Beispiel streift die Regel „Dialekt kein Fehler“. Stufe 1 und die übrigen Stellen
  nutzen echte Paare (Miete/Mitte, Staat/Stadt, Beet/Bett).
- Ersatz: Paar **„Mitte/Miete“** oder **„bitten/bieten“** verwenden, z. B.
  - 2-02 `aha`: „Im Deutschen trägt die Länge des Vokals Bedeutung: „Staat“ oder „Stadt“, „Miete“ oder „Mitte“. Wer lange Vokale
    lang und kurze knapp spricht, erspart dem Ohr das Raten.“
  - 2-02 `schaetzen`: „Am Telefon sagt Nadine Köhler: „Wir zahlen zur Mitte des Monats.“ Was könnte die Buchhaltung verstehen,
    wenn das „i“ zu lang gerät?“ – Optionen: „„zur Mitte“ – das Wort ist eindeutig“ · „„die Miete des Monats“ – also eine
    Zahlung“ · „gar nichts – ein langes i fällt nicht auf“; richtig 1; Auflösung: „„Mitte“ mit kurzem i, „Miete“ mit langem:
    Ein gedehntes i schiebt das Wort zur Zahlung hin. Der Zusammenhang hilft oft – am Telefon und bei neuen Kunden aber nicht
    verlässlich.“
  - `nachsprechen` 2-02-b, Zeile 1: „Wir zahlen zur Mitte, nicht die Miete.“; Merkkarte m1: „Staat – Stadt, Miete – Mitte,
    Ofen – offen.“
  - l-56: Szene auf „Platten zum fünfzehnten – zur Monatsmitte“ und ein zweites Paar („Bitte bieten Sie mir …“ / „Ich bitte
    Sie …“) umbauen, oder `k2` neu: Wahl 0 „„Nach Mass – kein Problem.“ – das a knapp und schnell, ohne Zusatz.“ mit rueck „Knapp
    gesprochen und ohne zweites Wort: Sie ist nicht sicher, ob du „nach Maß“ meinst. Ein „genau zugeschnitten“ hätte es
    gesichert.“ (dann passt auch M1).

**S2 – Verschleifungen in Lautgruppen als „Fehler“ markiert** (`einheiten-2.json` 2-03-c; `vorrat-03.json` v-0135, v-0136)
- Zitat 2-03-c: „Markier die Stellen, an denen in einer Lautgruppe ein Laut fehlt.“ – „Pflichschulung“, „Herbsferien“,
  „Kontakdaten“; v-0135 „Markplatz“; 2-03 Karte: „Geschluckt wird kein Laut“.
- Begründung: Das Auslassen von t in Konsonantenhäufungen („Markplatz“, „Kontakdaten“) ist auch in der Standardaussprache bei
  normalem Tempo üblich (Krech u. a. 2009 beschreiben solche Reduktionen) und kostet kaum Verständnis. `06`, Abschnitt 3: „Umgangs-
  sprachliche Verschleifungen werden nicht als Fehler bezeichnet, sondern als Wahl.“
- Ersatz: Auftrag rahmen und Absolutheit nehmen:
  - 2-03-c `auftrag`: „So klang die Ansage in der lauten Werkhalle. Im Plausch ist das üblich – hier gehen Wörter unter. Markier
    die Stellen, an denen in einer Lautgruppe ein Laut verschliffen ist.“ (v-0135/v-0136 entsprechend: „… für die Durchsage zu
    stark verschliffen“).
  - 2-03 Karte, letzter Satz: „Wo es auf Klarheit ankommt, wird kein Laut geschluckt – gedehnt auch nicht. Im lockeren Gespräch
    darfst du verschleifen.“

**S3 – Gleiche Fähigkeit, widersprüchliche Lehre: „zwei“ im Lärm** (`einheiten-3.json` 3-04-d)
- Zitat: „Gleis drei, | nicht Gleis zwei.“
- Begründung: Stufe 1 (w-035) lehrt, dass „zwei“ und „drei“ leicht verwechselt werden, und v-0189 nutzt „Zimmer zwo, nicht
  drei“. Gerade im Lärm-Kapitel sollte die Musterzeile die sichere Form zeigen.
- Ersatz: „Gleis drei, | nicht Gleis zwo.“ (ebenso l-63 `k3` optional „Um zwo. | Vierzehn Uhr.“).

**S4 – Verlauf der Anspannung nicht im Wortlaut von `08`** (`einheiten-3.json` 3-02 Karte; `wissen.json` w-018)
- Zitat: „Die Anspannung steigt bis kurz vor dem Start und sinkt meist in der ersten Minute – wie schnell, ist verschieden.“
- Begründung: `08`/LIESMICH §8: „Gipfel kurz vor dem Start **oder** in der ersten Minute, danach sinkt sie“. Die Fassung schließt
  einen Gipfel in der ersten Minute aus.
- Ersatz: „Die Anspannung ist kurz vor dem Start oder in der ersten Minute am höchsten und sinkt danach – wie schnell, ist
  verschieden.“ (3-02 Karte und w-018 gleich). Im 3-02-`aha` außerdem „Unter Druck werden viele schneller …“ statt „wird man“
  (laut `belegHinweis` Praxiswissen).

**S5 – Sparring l-60 wiederholt Stufe 1 statt zu vertiefen** (`lagen-2.json` l-60; vgl. `lagen-1.json` l-52)
- Zitat l-60 `k2b`: „Tarek schreibt in den Chat: „Hallt bei dir.““ – „„Moment – ich nehme das Headset.““
- Begründung: Hall → Headset, Blick zur Kamera, „Pause wegen der Verzögerung“ ist der Kern von l-52 (Stufe 1) und kommt in l-59
  (Lautsprecher am Tisch) gleich noch einmal. Das Sparring der Phase Können sollte Neues verlangen.
- Ersatz: Technikpanne in `k2b` tauschen: „Nach deinem ersten Satz schreibt Tarek in den Chat: „Dein Ton ist abgehackt.““ – Wahl 2:
  „„Ich schalte die Kamera aus, dann wird der Ton stabiler.“ Dann kürzere Sinnschritte und die Zahl doppelt.“ – rueck „Bandbreite
  für den Ton, dazu kurze Schritte: So kommt auch bei wackeliger Leitung alles an.“

**S6 – `boland2022` wird als Ursachenbefund dargestellt** (`einheiten-2.json` 2-05 `belegHinweis`, Karte; `wissen.json` w-017;
`quellen.json`)
- Zitat 2-05: „Dass schon kleine Verzögerungen im Videogespräch den Sprecherwechsel verlangsamen, zeigte eine Forschergruppe.“ ·
  w-017: „Schon kleine Verzögerungen bei der Übertragung bringen den Takt eines Gesprächs durcheinander“.
- Begründung: Gemessen wurde: Im Videogespräch dauern Sprecherwechsel deutlich länger als im direkten Gespräch. Dass die
  kleinen Verzögerungen die Ursache sind, ist die Erklärung der Autoren. Quelle selbst „nach Berichten“ geprüft.
- Ersatz: 2-05 `belegHinweis`: „… Eine Forschergruppe fand, dass Sprecherwechsel im Videogespräch deutlich länger dauern als im
  direkten Gespräch; als Grund vermutet sie die kleinen Übertragungsverzögerungen. Die Tipps zum Sprechen sind Praxiswissen.“ –
  w-017 `text`: „Im Videogespräch dauern Sprecherwechsel länger, der Takt wird holpriger – vermutlich wegen kleiner
  Verzögerungen bei der Übertragung. Eine kurze Pause nach jeder Frage …“

**S7 – Tests der Meisterschaft mit zu leicht erkennbaren Fehlantworten** (`tests.json` fc-033, fc-035, fc-038, fc-040)
- Zitate: fc-033 „Glück – heute war der Raum eben ruhig.“ · fc-035 „Schneller üben, bis die Zunge mitkommt.“ · fc-038 „Noch
  lauter sprechen, damit sich die Stimme mit der Zeit an den Lärm gewöhnt.“ · fc-040 „„Du nuschelst halt“ – ehrlich und kurz.“
- Begründung: Auf Stufe 6–9 messen diese Fragen kaum Können: „schneller/lauter/nichts tun“ ist nach 40 Lerntagen sofort als
  falsch erkennbar (die Tendenzen `tempo`/`lautstaerke` sind das durchgehende Muster). Eine verlockende Fehlantwort je Frage hebt
  die Trennschärfe.
- Ersatz (je wert 0):
  - fc-033: „Weil du die Mundbewegung wie in der Übung übertrieben hast.“ – warum: „Übertreiben gehört in die Übung; im Vortrag
    wirkt es gestelzt. Klar im eigenen Tempo kommt von Endungen und Pausen.“
  - fc-035: „Zungenbrecher mit „nicht“ und „haben“, jeden Tag ein paar Minuten.“ – warum: „Wärmt auf, übt aber nicht deine
    Sätze im Alltagstempo. Genauer trifft es derselbe Satz in drei Tempostufen.“ (wert 0 oder 1, dann die bisherige
    1-Antwort auf 0 prüfen)
  - fc-038: „Öfter etwas trinken und zwischendurch räuspern, damit die Stimme frei bleibt.“ – warum: „Trinken hilft, Räuspern
    reizt eher – und die Ursache, das Anreden gegen die Musik, bleibt.“
  - fc-040: „„Insgesamt gut, nur manchmal etwas undeutlich.““ – warum: „Freundlich, aber ohne Spur: Sie weiß nicht, wo und wann.“

**S8 – Beste Antwort nicht eindeutig: Mikrofon** (`vorrat-03.json` v-0163)
- Zitat: Frage „Bei einer Ansprache im Freien wird deine Stimme nach fünf Minuten rau. Was hilft am ehesten?“ – „Ein Mikrofon
  nutzen, wenn eins da ist.“ (wert 1)
- Begründung: Wenn ein Mikrofon da ist, ist es die wirksamste Entlastung; die Frage schließt es nicht aus.
- Ersatz: Frage: „Bei einer Ansprache im Freien – ohne Mikrofon – wird deine Stimme nach fünf Minuten rau. Was hilft am
  ehesten?“; die Mikrofon-Antwort ersetzen durch „Eine kurze Pause machen und einen Schluck Wasser trinken.“ (wert 1, warum:
  „Entlastet kurz. Danach helfen vor allem kürzere Sätze, Lösen in den Pausen und Richtung.“)

**S9 – Logikbruch in Lage l-58** (`lagen-2.json` l-58 `k2c` → `k3b`)
- Zitat: `k2c` Wahl 0: „Mit der Restluft weiter: „Beim Lager, da drüben, wo die Bretter stehen.““ → `k3b`: „Frau Köhler: „Wie
  lange lagert das Holz? Das habe ich nicht mitbekommen.““
- Begründung: Auf diesem Weg hat der Nutzer die Lagerzeit nie erwähnt.
- Ersatz `k3b.sagt`: „Am Lager. Frau Köhler: „Ich habe hinten kaum etwas verstanden. Wie lange lagert das Holz hier?““ (passt zu
  beiden Wegen).

### kann

**K1 – `krause2002` nur über Sekundärquellen geprüft** (`quellen.json`, 3-01 `studie`, Merkkarte 3-01-m1, w-014): Die Zahlen
(14 / 18 Punkte, fünf Sprecher, gut hörende Zuhörer) werden von mehreren Darstellungen der Arbeitsgruppe gleich berichtet und
stehen gerundet mit Grenze – **angemessen**. Vor einer Freigabe für alle das Original (JASA 112(5)) einsehen. w-014 und 3-01
nennen zusätzlich `krause2019`, geben aber nur die 2002-Zahlen; ehrlicher: in w-014 ergänzen „… bei älteren Zuhörern in einer
zweiten Studie rund 14 gegenüber 23“ oder `krause2019` dort aus `quellen` nehmen.

**K2 – Datumsangaben ohne Nomen großschreiben** (`lagen-2.json` l-56 k3/k4b „Um den fünfzehnten“, l-60 Lage/k4/k4b „am
fünfzehnten“; `vorrat-03.json` v-0192): Nach Duden „am Fünfzehnten“, „um den Fünfzehnten“ (wie die eigenen Texte „am Ersten“ in
v-0152/v-0231). „am dreizehnten Juni“ bleibt klein.

**K3 – l-65 `k5b`: Lautsprecher ohne Mikrofon** (`lagen-3.json`): „Dr. Albers springt ein und holt einen Lautsprecher“ →
„… bringt ein Ersatzmikrofon“; Wahl 2 „mit dem Ersatzmikrofon in Ruhe der Schluss“.

**K4 – 2-04 `aha` zu bestimmt** (`einheiten-2.json`): „Die Stimme versackt selten aus Schwäche, sondern weil …“ → „Oft versackt die
Stimme nicht aus Schwäche, sondern weil …“ (Stufe P).

**K5 – Fachhilfe-Text passt nur halb** (2-04 endet mit `fachhilfe: logopaedie`): Der gemeinsame Text beginnt mit „Für die saubere
Anbahnung eines Lauts …“, hier geht es um die Stimme. Wunsch an den Hauptstrang (`gemeinsam.json` nicht ändern): Satz zur
Stimme nach vorn oder ein Thema `stimme`.

**K6 – Fähigkeit von 2-01-c** (`einheiten-2.json`): Sätze mit Lippenlauten, Prüfliste zu b/p/m und w/f – passt eher zu
`aussprache.konsonanten` als zu `oeffnung`. Kennung bleibt, nur das Feld `faehigkeit` (falls gewollt) und dann `leise` auf
v-0144 prüfen.

**K7 – v-0194 überträgt einen Befund** (`vorrat-03.json`): „Der Gewinn ist bei fast allen vorhanden, nur verschieden groß.“
stammt aus Anweisungsstudien (sofortiger Klar-Modus), nicht aus einer Woche Merkmalstraining. Ersatz: „Nach einer Woche lässt
sich das nicht sagen – Bewegungen festigen sich über viele Wiederholungen.“

**K8 – w-089 `belegHinweis` zu absolut** (`wissen.json`): „bei Erwachsenen ohne Störung gibt es keine Studien“ → „Erwachsene
ohne Störung hat die Übersicht nicht untersucht.“

**K9 – Mehrdeutige Zuordnungen** (`vorrat-03.json` v-0165; `einheiten-2.json` 2-05-a): „Mikrofon nah am Mund“ gilt auch im großen
Raum → ersetzen durch „das Handy nicht auf den Tisch legen“. In 2-05-a sind „der eigene Name gleich am Anfang“ (auch im Video)
und „stummschalten“ (auch in der Telefonkonferenz) nur über „eher“ eindeutig – ggf. „Kamera an, damit man deinen Mund sieht“
statt „stummschalten“.

**K10 – Lärm in der Produktionshalle ohne Gehörschutz** (l-63, 3-04-b, w-125): In lauten Hallen ist Gehörschutz üblich (ab
85 dB(A) Pflicht). Ein Satz in der Lage („Lena trägt Gehörschutz – Mundbild und Geste zählen jetzt doppelt“) wäre realistisch
und stützt die Lehre (Nähe, Gesicht, Geste).

**K11 – Position der besten Antwort in `lagen-3.json`**: In zehn Knoten mit drei Wahlen steht die beste nie an erster Stelle
(6 × an letzter). Bei der nächsten Überarbeitung zwei, drei Knoten umsortieren.

**K12 – Ungrammatische Mitschrift** (`vorrat-03.json` v-0156): „Wir treffen uns in der Staat“ – „der Staat“ passt nicht zu
„in der“, so würde niemand mitschreiben. Ersatz für den ersten Teil: „Wir“ „bitten“ (fehler: „Gemeint war „bieten“ – das ie kam
zu kurz an.“) „euch“ „Kaffee“ „am“ „großen“ „Platz.“ – der zweite Fehler („Hütten“) bleibt.

## 3. Urteil

**Freigabereif nach M1–M3.** Die neuen Phasen sind fachlich solide, ehrlich belegt und didaktisch ein echter Schritt über
Stufe 1 hinaus; die stillen Ersatzübungen sind jetzt durchgehend echte Stumm-Übungen. Die drei muss-Befunde sind kleine,
klar umrissene Text- und Logikkorrekturen (eine Lagen-Verzweigung, eine Belegbeschreibung, eine phonetisch falsche
Begründung). Die sollte-Befunde heben Genauigkeit (Maß/Masse, Verschleifung als Wahl, Wortlaut `08`) und die Trennschärfe der
Meisterschafts-Tests.

## 4. Umsetzung (25.11.2026)

Geändert nur Kern-Dateien in `src/coach/inhalt/aussprache/` (keine Kennung geändert, nichts gelöscht), danach
`node scripts/coach-index.mjs`. Prüfung: `coach-pruefe.mjs --nur aussprache` → **0 Fehler** (4 bekannte Stufe-1-Hinweise),
`--soll aussprache` → **leer**. Alle Lagen-Wege von l-56, l-58, l-60, l-63, l-65 nach der Änderung einzeln durchgegangen.

| Befund | Stand | Was / Grund |
|---|---|---|
| M1 | umgesetzt | l-56 `k3b` neutral („Moment – haben Sie ‚nach Maß‘ verstanden? …“), Wahlen „Ja, genau …“ (2) / „Hab ich doch gesagt.“ (0, `rechtfertigen`). Stimmt jetzt von `k2`, `k2b` und `k2c` aus. `ende2` neu gefasst („Klarheit an zwei Stellen …“), weil es auch über `k3b` erreicht wird und dort keine Vokale fehlten. |
| M2 | umgesetzt | Am Abstract geprüft (fünf Sprecherinnen; Teil II: Aufnahmen **einer** davon, 30 Erwachsene, Stimmengewirr, ~15 %). `quellen.json` pittman2001, 3-04 `belegHinweis` und `schaetzen.frage`, w-015 `belegHinweis` wie vorgeschlagen. |
| M3 | umgesetzt | v-0226: letzter Satz jetzt „Die Kunde[n] wollen die alte Liste. Lena schick[t] sie morgen.“ – echte Sinn-Kippe (Ankündigung ↔ Bitte). |
| S1 | umgesetzt | 2-02: `aha` (Staat/Stadt, Miete/Mitte), `schaetzen` auf „zur Mitte des Monats“ → „Miete“ umgebaut, Zeile in 2-02-b jetzt „Die Miete zahlen wir zur Mitte des Monats.“, Merkkarte m1. l-56: Maß/Masse als Vokalpaar entfernt – `k2` Wahl 0 ist jetzt eine schnelle Zusage ohne Absicherung (`tempo`), die Vokalarbeit trägt das echte Paar Mitte/Miete in `k3`/`k4b`. „nach Maß“ bleibt als Auftrag der Kundin (kein Lehrpaar mehr). |
| S2 | umgesetzt | 2-03-c Auftrag (laute Werkhalle, „im Plausch üblich“, „verschliffen“), v-0135 (Festlärm im Hintergrund) und v-0136 (am Telefon zugeschaltet) entsprechend gerahmt; 2-03-Karte: „Wo es auf Klarheit ankommt, fehlt kein Laut … Im Plausch darfst du verschleifen.“ (Karte dafür gekürzt, ≤ 420). Zusätzlich w-048 („wo es auf Klarheit ankommt, wird kein Laut geschluckt“). |
| S3 | umgesetzt | 3-04-d „nicht Gleis zwo“; l-63 `k3` „Um zwo. \| Vierzehn Uhr.“ |
| S4 | umgesetzt | Wortlaut `08` in 3-02-Karte und w-018; dazu „und“ → „oder“ in 3-02 `belegHinweis`, Merkkarte 3-02-m1 und v-0237 (gleicher Fehler, im Bericht nicht genannt). 3-02 `aha`: „werden viele schneller“. |
| S5 | umgesetzt | l-60 `k2b`: „Dein Ton ist abgehackt.“ → Kamera aus, kürzere Sinnschritte, Zahlen doppelt. Weiter jetzt nach `k3` (nicht `k2`, dort stünde „Zur Kamera“). `k3b` so gefasst, dass er von beiden Wegen passt (kein „Kopf hoch“/„gesenkter Blick“ mehr), `ende1` als Prinzipien statt als Behauptung („Technik geprüft …“), `ende2` passend zu beiden Zuwegen. |
| S6 | umgesetzt | Nachgeschlagen (Pressemitteilung University of Michigan: ca. 135 ms direkt vs. 487 ms über Zoom in einem Versuch; Ursache = Deutung der Autoren). 2-05 `belegHinweis` und Karte, w-017 `text` und `belegHinweis`, `quellen.json` boland2022 neu gefasst. |
| S7 | umgesetzt | fc-033: „Glück“ ersetzt durch „Mundbewegung wie in der Übung übertrieben“ (0). fc-035, fc-038, fc-040: verlockende Fehlantwort als **vierte** Antwort ergänzt (Zungenbrecher / Trinken+Räuspern / „Insgesamt gut, nur manchmal etwas undeutlich“, je 0) – die alten Fehlantworten bleiben, weil ihre `tendenz` (`tempo`, `lautstaerke`, `abwerten`) dem Coach Muster liefert. |
| S8 | umgesetzt | v-0163: „– ohne Mikrofon –“ in der Frage, Mikrofon-Antwort ersetzt durch „kurze Pause und ein Schluck Wasser“ (1). |
| S9 | umgesetzt | l-58 `k3b`: „Am Lager. Frau Köhler: „Ich habe hinten kaum etwas verstanden. Wie lange lagert das Holz hier?““ |
| K1 | teils | w-014 nennt jetzt auch die zweite Studie (ältere Zuhörer: rund 14 gegenüber rund 23 Punkten, aus `krause2019`, `geprueft`), Schluss vorsichtiger („den größeren Teil“). Original JASA 112(5) weiterhin nicht einsehbar – **offen für den Hauptstrang** vor der Freigabe für alle. |
| K2 | umgesetzt | „am/um den Fünfzehnten“ in l-56 und l-60 (Lage, `k4`, `k4b`) und v-0192. |
| K3 | umgesetzt | l-65 `k5b`: Ersatzmikrofon statt Lautsprecher (passt jetzt auch zu „Das Mikrofon weitergeben“); `ende3` auch für den Weg ohne Schreien stimmig („Nähe, Blick und kurze Sätze statt Kraft“). |
| K4 | umgesetzt | 2-04 `aha`: „Oft versackt die Stimme nicht aus Schwäche …“ |
| K5 | nicht hier lösbar | Betrifft `gemeinsam.json` (Thema `logopaedie` beginnt mit der Laut-Anbahnung). Wunsch an den Hauptstrang: Satz zur Stimme nach vorn oder eigenes Thema `stimme`. |
| K6 | bewusst nicht | Lippenarbeit gehört in diesem Kurs zur Fähigkeit `oeffnung` (vgl. stumme Übung v-0108 „Lippen arbeiten lassen“); 2-01-c bleibt so, `leise` v-0129 passt dazu. |
| K7 | umgesetzt | v-0194 Begründung: „… Bewegungen festigen sich über viele Wiederholungen.“ |
| K8 | umgesetzt | w-089 `belegHinweis`: „Erwachsene ohne Störung hat die Übersicht nicht untersucht.“ |
| K9 | umgesetzt | v-0165 „das Handy beim Sprechen nah am Mund lassen“; 2-05-a „Kamera an, damit man deinen Mund sieht“ statt „stummschalten“. |
| K10 | umgesetzt | l-63 Lage: „Ihr tragt beide Gehörschutz – Mundbild und Geste zählen jetzt doppelt.“; `k3b`: Lena tippt auf ihren Gehörschutz (statt Hand ans Ohr). 3-04-b/w-125 unverändert (Übung zu Hause bzw. Spickzettel ohne Halle-Bezug). |
| K11 | umgesetzt | Beste Wahl an erste Stelle gesetzt in l-61 `k3`, l-64 `k3`, l-65 `k4`. |
| K12 | umgesetzt | v-0156: statt „in der Staat“ jetzt „… am großen Platz und wandern zur Hölle.“ (Gemeint: „Höhle“, ö zu kurz) – grammatisch, so würde man es mitschreiben; der Vorschlag „Wir bitten euch Kaffee“ wäre selbst ungrammatisch gewesen. |
