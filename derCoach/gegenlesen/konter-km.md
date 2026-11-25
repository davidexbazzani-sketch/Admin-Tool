# Gegenlesen: Bereich `konter`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Fachlektor und Faktenprüfer · **Inhaltsdateien nicht geändert**

## Was geprüft wurde

- **Maßstab:** `08_ENTSCHEIDUNGEN.md` (geht vor), `06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (3a ff., 5–7), `05_LEHRPLAN.md` 3.4, `03_WISSEN_WIRKUNG.md` Abschnitt 5, Evidenzbericht (konter), `01_KONZEPT.md` Abschnitt 18, `kern/inhaltTypen.ts`, `besetzung.json`. Einen Bericht `gegenlesen/konter.md` zu Phase 1 gibt es nicht; verglichen habe ich mit `einheiten-1.json`, `vorrat-01.json` (v-0079–0082) und `wissen.json` w-050–054.
- **Vollständig gelesen:** `einheiten-2.json`, `einheiten-3.json`, `lagen-2.json`, `lagen-3.json`, `vorrat-02.json` (v-0083–0162), `vorrat-03.json` (v-0163–0242), `vorrat-04.json` (v-0243–0271, Lückenfüller Stufe 1), Lerntage k/m in `kurs.json`, `tests.json` fc-025–040, neue Einträge in `wissen.json` (w-013–016, 025, 047, 048, 055–059, 078, 079, 086, 087, 094, 095, 115, 116, 123–125), `konter/quellen.json` (ganz neu, acht Quellen), dazu `leiter.json`. **Jeden Weg durch jede Lage und jeden Dialog** habe ich nachverfolgt (l-06 bis l-15, 2-02-b, 3-04-b, v-0231, v-0232).
- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur konter` → **1 Fehler, 11 Hinweise**. Der Fehler ist `_index.json: veraltet` (siehe M1). Alle 11 Hinweise betreffen Stufe 1 (1-07, v-0039–0045, fc-003–016), nichts Neues. `--soll konter`: für konter fehlt nichts. Der in `gegenlesen/leben.md` erwähnte Gesamtfehler in `konter/einheiten-3.json` ist behoben.
- **Kursplan:** k = 6 E, 6 Ü, 4 L, 3 A, 1 S (20), m = 5 E, 5 Ü, 4 L, 3 A, 1 S (18). Bänder [3,6]–[4,7] und [5,8]–[6,10] (ue-016 [5,9]). Test-Stufen 4–7 und 6–9. Titel folgen dem Lehrplan 3.4. Formate der Übungstage sind aus dem Vorrat füllbar (geschichtenbau, szene, buehne, humorlabor, kunstgriff vorhanden). **Stimmt.**
- **Einfluss-Klassen:** „rot“ steht nur an `kunstgriff` und `auswahl` (Erkennen). Keine rote Taktik als Musterlösung, Mission oder Einsatz-Übung. Keine Taktik-Missionen. Fachhilfe nur als Schritt (`2-02` → `mobbing`). Keine Rufnummern, kein „...“ statt „…“. „Sie“ steht nur in wörtlicher Rede.
- **Quellen nachgeschlagen:**
  - **mesmer2012:** Der Volltext ist **nicht erreichbar** (Emerald, Bezahlschranke). Das Abstract bestätigt: 49 Studien, N = 8.532, nur positiver Humor, nur Zusammenhänge. Für Vorgesetzten-Humor nennt es: bessere Leistung, Zufriedenheit und Zusammenhalt der Mitarbeitenden, bessere Bewertung der Führungskraft, mehr Zufriedenheit mit ihr, weniger Rückzug. Negativen Humor nennen die Autoren ausdrücklich als ungeprüft. `w-116` und `3-01` (belegHinweis, Schritt d) geben das **korrekt** wieder. Der Quellentext sagt ehrlich „Volltext nicht gelesen“.
  - **czopp2006** (Europe PMC): drei Experimente. Ansprechen senkte spätere Stereotype. Ansprache, „besonders feindselige“, erzeugte negative Gefühle gegen die Person, die anspricht. **Korrekt** in `2-02` und `w-014`.
  - **lehmann2014** (Europe PMC): 54 gefilmte Teambesprechungen. Witz-Lachen-Muster sagten Leistung voraus, sofort und später (Bewertung durch Vorgesetzte). Bei hoher Arbeitsplatz-Unsicherheit galt das nicht. **Korrekt** in `2-05`, `w-015`, `w-025`. „Zwei Industriebetriebe“ steht nicht im Abstract; ohne Volltext ungeprüft, aber unkritisch.
  - **douglass2016** (Europe PMC): 21-Tage-Tagebuch. Bei ängstlichen Jugendlichen mehr Angst an solchen Tagen, soziale Angst auch an den Folgetagen. **Korrekt** in `2-03`, `w-086`, `w-055`.
  - **hoption2013** (Emerald-Abstract, APS-Bericht): 155 Studierende, Fallbeschreibung, vier Bedingungen. Bei Witzen über sich selbst wurde die Führungskraft höher bei „individueller Zuwendung“ eingeschätzt als bei aggressivem Humor. **Korrekt** in `2-04` („zugewandter“).
  - **gollwitzer2006** (94 Vergleiche) und **bitterly2017** (acht Experimente): Die Zahlen stimmen mit den geprüften Quelltexten überein. **keltner1998/2001** und **diderot** habe ich nicht eigens nachgeschlagen; sie decken sich mit dem, was ich über die Quellen weiß.

## Gesamteindruck

Die Phasen k und m sind **fachlich ehrlich und didaktisch klar aufbauend**:
- Übersetzen, Grenze mit Rückweg, Necken mit Zeichen, Selbstironie mit Prüffragen, Rückgriff und Treppenwitz-Plan in k.
- Rang, unfaire Taktiken, Runde und Saal, Flop gegen Treffer und eigener Stil in m.
- Die Belege sind sauber abgestuft und die belegHinweise ehrlich. Wo Laborbefunde übertragen werden, steht das dabei.
- Die Lagen sind lebendig. Fast alle Rückmeldungen erklären das Warum.
- Die Längen der Antworten sind gemischt: Die beste Antwort ist in 48 von 130 Fragen mit mindestens drei Antworten die längste.

Die Mängel sitzen fast nur an drei Stellen:
1. **Wege in Lagen und Dialogen:** Auf manchen Wegen passen Rückmeldung oder Fazit nicht zum Gesagten.
2. **Drei beste Antworten widersprechen einer Regel, die der Bereich selbst lehrt:** l-13, v-0184, v-0269.
3. **Unfaire Tricks im Vorrat ohne Wissens-Eintrag:** Dazu gehört die Frage der roten Klasse bei v-0264 und v-0269.

**Zählung: 4 muss · 14 sollte · 16 kann.**

---

## Muss

### M1 – `_index.json` veraltet (Prüfskript-Fehler)
- **Datei:** `src/coach/inhalt/_index.json`
- **Befund:** `coach-pruefe.mjs --nur konter` meldet `FEHLER _index.json: veraltet`. Mit diesem Fehler ist der Bereich formal nicht abnahmereif.
- **Ersatz:** `node scripts/coach-index.mjs` laufen lassen, danach erneut prüfen. Das ist Sache des Hauptstrangs, keine Inhaltsänderung.

### M2 – Lage `konter-l-09`, Knoten `k4`: Der Insider gegen den Chef ist die beste Antwort
- **Datei:** `lagen-2.json`, `konter-l-09` › `k4` › wahl 1
- **Zitat:** „Machen wir. Wir liefern sie am Stück – nicht in drei Teilen.“ (wert 2, rueck „Zusage mit einem letzten, kleinen Rückgriff. Die Runde lacht …“)
- **Begründung:** Auf drei von fünf Wegen zu `k4` hat Dr. Albers die Kuchengeschichte nie erfahren:
  - `k2` → „Abwarten“
  - `k2` → `k2c` → Entschuldigung
  - `k3` → „Ach, nichts. Machen Sie ruhig weiter.“

  Dort ist der Rückgriff genau der Insider, den die Lage als Fehler lehrt (Prinzip „wer nicht dabei war, bekommt Hilfe“, Fazit „die mitnehmen, die nicht dabei waren“). Als beste Antwort ist er dort falsch.
- **Ersatz:** „Machen wir – und zwar am Stück. Nicht wie Miriams Geburtstagskuchen heute Morgen, der kam in drei Teilen.“ rueck: „Zusage mit einem letzten Rückgriff – und der halbe Satz Hilfe nimmt auch Albers mit.“

### M3 – Lage `konter-l-13`, Knoten `k3`: Die beste Antwort verspricht dem Kunden etwas Unhaltbares
- **Datei:** `lagen-3.json`, `konter-l-13` › `k3` › wahl 1
- **Zitat:** „Eine kleine, ja. Dafür fällt sie nicht aus. Darf ich zeigen, was in dem Preis steckt?“
- **Begründung:** „Fällt nicht aus“ ist ein absolutes Produktversprechen. Das verstößt gegen die Ehrlichkeitsregel (LIESMICH 5, `01` §18 „nur Wahres“), und das ausgerechnet in der Musterantwort beim Kunden. Dazu ist das „sie“ zweideutig (Insel oder Maschine).
- **Ersatz:** „Eine kleine, ja. Dafür steht die Maschine nicht mehr jede Woche still. Darf ich zeigen, was im Preis steckt?“

### M4 – `konter-v-0184`: Die beste Antwort kratzt vor der Kundin an der eigenen Verlässlichkeit
- **Datei:** `vorrat-03.json`, `konter-v-0184` (szene, konter.spiel, Stufe 8)
- **Zitat:** „Dann sind Sie uns voraus – bei uns ist es nicht mal der Kaffee.“ (wert 2, „der Witz geht auf euch“)
- **Begründung:** Der Bereich lehrt: Selbstironie nie über die Kernaufgabe (2-04, v-0134 „Als Projektleitung vor dem Kunden: ‚Planen war noch nie meine Stärke.‘ → kratzt an der Kernaufgabe“). Gegenüber einer möglichen Kundin, die „genau rechnet“ (`besetzung.json`), sagt die beste Antwort, bei euch komme nicht einmal der Kaffee pünktlich. Das widerspricht der eigenen Regel.
- **Ersatz:** „Dann fangen wir mit dem Pünktlichen an – danke für den Kaffee.“ warum: „Du spielst leicht mit, ohne über ihre Firma zu lachen und ohne deine eigene Verlässlichkeit kleinzumachen.“

---

## Sollte

### S1 – `konter-v-0269`: Die beste Antwort macht aus Ironie eine Entscheidung. Zur Fähigkeit siehe K14
- **Datei:** `vorrat-04.json`, `konter-v-0269` (kunstgriff, konter.zustimmen, Stufe 5, einfluss rot)
- **Zitat:** „Ironisches Zustimmen – wörtlich nehmen: ‚Danke. Dann setzen wir es so um.‘“ (wert 2, „der Einwand steht“)
- **Begründung:**
  - Wörtlich nehmen ist eine faire Konter-Technik. Diese Fassung erklärt aber einen ironischen Seufzer zur Zustimmung („setzen wir es so um“). Damit nähert sie sich der Familie, die der Bereich selbst rot nennt (w-059 „erfundene Absprache“: eine Zustimmung, die es nicht gab).
  - Das warum („der Einwand steht“) beschreibt ein anderes Ziel als der Satz.
  - Einordnung des Gegenzugs als „rot“: siehe S11.
- **Ersatz:** „Ironisches Zustimmen – wörtlich nehmen: ‚Danke! Dann nutze ich die Glückssträhne: Mein Einwand ist …‘“ warum: „Du nimmst die Zustimmung beim Wort, ohne eine Entscheidung zu behaupten – und der Einwand kommt doch noch auf den Tisch.“

### S2 – Lage `konter-l-07`: Die Schrank-Geschichte wird zweimal erzählt
- **Datei:** `lagen-2.json`, `konter-l-07`
- **Weg:** `k1` „Mitlachen und die Geschichte erzählen“ → `k1b` → `k2b` → `k3` „Du erzählst die Schrank-Geschichte, alle lachen.“
- **Begründung:** Auf diesem Weg hast du die Geschichte schon in `k1` erzählt. Dazu kommt: `k3` „Ach was, war doch nicht schlimm.“ (wert 0, rueck „heißt es vielleicht wieder Krümel“) führt nach `ende1` mit dem Fazit „der Name geht“. Das widerspricht sich.
- **Ersatz:**
  - `k3.sagt`: „Später, am Grill, sagt Sven leise: ‚Sorry wegen Krümel. Wusste nicht, dass dich das nervt.‘“ (ohne den ersten Satz)
  - Die Antwort „Ach was …“ auf einen neuen Endknoten `ende4` lenken: sagt „Den Rest des Abends steht ihr zusammen am Grill.“, ende „Kein Drama – nur hast du die Grenze am Ende halb zurückgenommen. Beim nächsten Mal genügt: ‚Schon gut. Jetzt weißt du's.‘“

### S3 – Dialog `konter-2-02-b`: Du gehst – und stehst dann noch da
- **Datei:** `einheiten-2.json`, `konter-2-02` › Schritt 4 › `k1` › wahl 3
- **Zitat:** „Mit den Schultern zucken und gehen.“ → `k2` „Er hebt die Hände: ‚Schon gut, schon gut.‘ Kurze Stille.“ → „Danke. Kommst du nachher mit zur Besprechung?“
- **Begründung:** Nach dem Gehen ist das Gespräch in `k2` nicht mehr möglich.
- **Ersatz:** wahl 3: „Mit den Schultern zucken und dir weiter Kaffee einschenken.“ rueck: „Die Grenze steht – ein ruhiger Satz mehr hätte sie gefestigt.“

### S4 – Dialog `konter-3-04-b`, `ende2`: Ein „Sorry“ wird empfohlen, obwohl es schon gesagt wurde
- **Datei:** `einheiten-3.json`, `konter-3-04` › Schritt 5 › `ende2`
- **Weg:** `k1` (Entschuldigung) → `k2` → „Siehst du, also doch drei Wochen!“ → `ende2`
- **Zitat:** „Ein kurzes ‚Sorry, das war daneben‘ unter vier Augen kann ihn heute noch aus der Welt schaffen.“
- **Begründung:** Auf diesem Weg hast du dich schon entschuldigt. Der Fehler war das Nachlegen.
- **Ersatz:** ende: „Kein Drama – aber der Spruch bleibt hängen. Unter vier Augen hilft heute noch ein kurzes Wort: ‚Das war daneben – auch das mit den drei Wochen.‘“

### S5 – Lage `konter-l-08`, `k4`: Lena dankt für einen Mut, den sie auf zwei Wegen nicht gezeigt hat
- **Datei:** `lagen-2.json`, `konter-l-08` › `k4`
- **Zitat:** „‚Danke für heute‘, sagt sie. ‚In meinem alten Job hätte ich mich das nicht getraut.‘“
- **Begründung:** „Das“ meint ihren Witz über Tareks Mails (`k2`). Über `k2b` (du hast sie „beschützt“) und `k2c` (du hast sie mitgeneckt) hat sie keinen Witz gemacht.
- **Ersatz:** „Auf dem Heimweg geht Lena ein Stück mit dir. ‚Danke für heute‘, sagt sie. ‚Ich hatte ein bisschen Angst vor dem Abend.‘“

### S6 – Dialog `konter-v-0232`, `ende2`: Lena ist still, obwohl sie nichts gehört hat
- **Datei:** `vorrat-03.json`, `konter-v-0232`
- **Weg:** `k1` wahl 2 oder 3 → `k2` „Entschuldigung, ich wollte Ihnen nicht widersprechen.“ → `ende2` „Lena bleibt den Abend über still.“
- **Begründung:** Auf diesem Weg ist Lena am Buffet und kommt nicht zurück an den Tisch.
- **Ersatz:** `ende2.sagt`: „Das Gespräch plätschert weiter. Der Witz über Lena bleibt am Stehtisch hängen.“

### S7 – Test `konter-fc-028`: Die beste Antwort ist keine Selbstironie
- **Datei:** `tests.json`, `konter-fc-028` (konter.selbstironie)
- **Zitat:** „‚Ich teste gerade, wer genau hinschaut – Sie haben bestanden.‘“ (wert 2, „Selbstironie über eine Kleinigkeit“)
- **Begründung:**
  - Der Satz lacht nicht über dich. Er ist eine gespielte Ausrede mit Kompliment.
  - Derselbe „Test“-Witz ist in `fc-039` die falsche Antwort („klingt wie eine Ausrede“).
  - Für einen Einstufungstest misst das die Fähigkeit schief.
- **Ersatz:** „‚Ich konnte mich heute Morgen nicht entscheiden – also hab ich beide genommen.‘“ warum: „Selbstironie über eine Kleinigkeit – du lachst über dich, und der Moment ist aufgelöst.“

### S8 – Tests fc-025 bis fc-040: Die falsche Antwort ist leicht zu erraten
- **Datei:** `tests.json`
- **Befund:**
  - In sechs von 16 neuen Szenarien (fc-025, 031, 034, 035, 039, 040) ist die Rechtfertigung jeweils die lange, atemlose Antwort mit „… “ am Ende. Sie ist immer wert 0 und in fünf Fällen die längste.
  - Über alle neuen Dateien enden 25 von 33 Antworten mit „…“ als wert 0.
  - Für Übungen ist das Absicht (Rechtfertigen erkennen). Für Einstufung und Formcheck macht es die Wahl erratbar.
  - Dazu fehlen in k Szenarien zu `konter.zustimmen` und in m zu `konter.umdeuten`; `rueckfrage` (k) und `necken` (m) kommen je doppelt vor.
- **Ersatz:**
  - Mindestens drei Rechtfertigungen kurz und glatt fassen:
    - fc-040 „‚Ist ja nicht weit, ich fahr gern.‘“ (wert 0, rechtfertigen)
    - fc-034 „‚Nein, das hab ich so nie gesagt.‘“ (wert 0, rechtfertigen: verteidigt, statt nach dem Einwand zu fragen)
    - fc-035 „‚Die stimmt. Ich hab sie geprüft.‘“ (wert 0)
  - Bei der nächsten Aufstockung fc-031 (Stufe 7, k) auf `konter.zustimmen` drehen und eines der beiden `necken` in m (fc-033 oder fc-038) auf `konter.umdeuten`.

### S9 – `konter-v-0190`: Die stille Ersatzübung hat ein anderes Lernziel
- **Datei:** `vorrat-03.json`, `konter-v-0190` (buehne, „lustige Geschichte mit Pointe … Rückgriff auf den Anfang“), `leise: konter-v-0164`
- **Begründung:** v-0164 übt das Tragen fremder Witze, nicht Erzählen, Pointe und Rückgriff (`06` Abschnitt 3: „demselben Lernziel“).
- **Ersatz:** eine neue stumme Übung, z. B. `konter-v-0272` (`stumm`, konter.spiel, Stufe 8), Titel „Die Anekdote im Kopf“. Schritte: „Wähl ein kleines Missgeschick dieser Woche.“ · „Leg innerlich Lage, Wendung und Pointe fest – die Pointe ganz ans Ende.“ · „Such ein Stichwort vom Anfang für einen Rückgriff.“ · „Erzähl sie innerlich einmal durch, mit Pause vor der Pointe.“ Prüfliste: „Pointe am Ende?“ · „Stichwort für den Rückgriff?“ · „Unter 90 Sekunden?“. Dann `leise: konter-v-0272`. Übergangsweise geht `konter-v-0233` (geschichtenbau, still).

### S10 – Falsches Entweder-oder: in konter rot, in gespraech Taktik
- **Datei:** `wissen.json`, `konter-w-058` (rot) ↔ `gespraech/wissen.json`, `gespraech-w-057` „Die Entweder-oder-Falle“ (taktik)
- **Begründung:** Für denselben Kunstgriff stehen zwei Klassen auf zwei Bereichsseiten. Inhaltlich ist es vertretbar, weil die konter-Fassung dem anderen eine schlimme Absicht anhängt. Das steht aber nirgends.
- **Ersatz:** im `text` von w-058 ergänzen: „… und eine davon ist schlimm – oft mit einem Vorwurf an dich verbunden. Anders als die bloße Entweder-oder-Frage (siehe Gespräche) hängt sie dir eine Absicht an.“ Alternativ Abstimmung mit dem Hauptstrang.

### S11 – Unfaire Tricks im Vorrat ohne Wissens-Eintrag (darunter v-0264, v-0269)
- **Dateien:** `vorrat-02.json` v-0162, `vorrat-03.json` v-0191, v-0202, `vorrat-04.json` v-0247, v-0264, v-0268, v-0269
- **Befund:** Diese `kunstgriff`-Fragen benennen Tricks, die auf der Wissens-Seite nicht vorkommen:
  - „alle Vernünftigen“
  - Ausweichen auf die Person
  - Fragensalve
  - Reizen
  - Etikett
  - Zustimmung abringen (Ja-Kette)
  - ironisches Zustimmen

  Die vier aus `vorrat-04` laufen schon in Grundlagen-Übungstagen (ue-007, Band [2,5]), lange vor 3-02. Die Seite soll „wie eine eigene App“ alles Gelehrte zeigen (`08`).
- **Zur Einordnung „rot“ bei v-0264 (Etikett „Bedenkenträger vom Dienst“) und v-0269 (ironisches Zustimmen):**
  - **Passt zur Konvention aus Phase 1.** w-050–054 führen schon Lächerlich machen, Unterstellung, Killerphrase, vergiftetes Lob und Verallgemeinerung als „rot“, ebenso v-0079–0082.
  - Das Etikett ist eine Killerphrase in Etikettenform (ersetzt das Argument, wie w-052).
  - Das ironische Zustimmen ist das Gegenstück zum vergifteten Lob (w-053): Hohn in Zustimmung verpackt.
  - Nach dem Wortlaut von `08` (rote Linie = erfundene Tatsachen, Ausnutzen von Abhängigkeit, Zermürben, Schuld einreden, Nein übergehen, Verführungsratgeber-Tricks) gehört **keiner** dieser Kunstgriffe zur roten Linie, auch w-050–054 nicht. „Rot“ steht hier faktisch für „nur erkennen und abwehren“.
  - Zur Laufzeit hat die Klasse am Kopf keine Wirkung. Sie wird nur auf der Wissens-Seite angezeigt, und das Prüfskript verlangt sie an jedem `kunstgriff`.
  - **mesmer2012 trägt dazu nichts bei:** Die Meta-Analyse erfasst nur positiven Humor. Negativer Humor ist laut den Autoren ungeprüft. Etikett und Ironie sind herabsetzender Humor (`martin2003`, aggressiver Stil). Richtig ist darum, dass v-0264/v-0269 keine Quelle und keinen Befund behaupten.
  - **Urteil:** Klasse so lassen. Aber die Tricks gehören auf die Wissens-Seite, und die Lesart von „rot“ gehört in LIESMICH (K1).
- **Ersatz (neue Wissens-Einträge, Gruppe „Unfaire Tricks – erkennen und abwehren“, beleg P, einfluss rot, quellen `praxis-konter`/`schopenhauer`):**
  - w-050–059 sind voll und w-060/061 sind Formulierungen. Frei sind w-062–069, also z. B. **`konter-w-064` „Das Etikett“**. Die Kennung bestimmt nicht die Reihenfolge; die Einträge im Array hinter w-059 einfügen:
    - text „‚Unser Bedenkenträger vom Dienst.‘ Ein Name ersetzt das Argument – wer ein Etikett trägt, muss nicht mehr ernst genommen werden.“
    - preis „Wirkt bei allen, die das Argument hören wollten, billig.“
    - abwehr „Das Etikett umdeuten und den Punkt trotzdem bringen: ‚Ich nenne es Risikoprüfung. Das Risiko ist …‘“
  - **`konter-w-065` „Ironisches Zustimmen“**:
    - text „‚Ja, ja, du hast natürlich wie immer recht.‘ Zustimmung als Hohn – der Einwand soll lächerlich wirken, ohne widerlegt zu werden.“
    - preis „Wer es oft tut, gilt als jemand, mit dem man nicht reden kann.“
    - abwehr „Beim Wort nehmen, ohne eine Entscheidung zu behaupten: ‚Danke! Dann hör dir den Einwand kurz an: …‘“
  - **`konter-w-066` „Reizen, bis du die Fassung verlierst“** (Schopenhauer: den Gegner zornig machen):
    - preis „Fliegt auf, sobald du ruhig bleibst.“
    - abwehr „Ausatmen, zurück zum Punkt.“

  Analog bei Gelegenheit Fragensalve, Ausweichen auf die Person und „alle Vernünftigen“.

### S12 – `konter-v-0183`: Der Bräutigam der Cousine ist kein Schwager
- **Datei:** `vorrat-03.json`, `konter-v-0183` › Antwort 4
- **Zitat:** „‚Der war schwach, Schwager!‘“
- **Begründung:** Schwager ist der Bruder des Ehepartners oder der Mann der Schwester, nicht der Mann der Cousine.
- **Ersatz:** „‚Der war schwach, Herr Bräutigam!‘“

### S13 – Gleiche Antwort, ungleiche Wertung: „alles gut“ beim Einlenken
- **Dateien:** `lagen-2.json` `konter-l-07` › `k3`: „Ach was, war doch nicht schlimm.“ = **0** (kleinreden) ↔ `lagen-3.json` `konter-l-14` › `k4`: „Nein, nein, alles gut.“ = **1**
- **Begründung:** Beide Male lenkt jemand ein, und beide Antworten nehmen die Grenze zurück. l-14 begründet sogar genauso („die Grenze bleibt unsichtbar“). l-14 `k4` hat außerdem zwei Antworten mit wert 1.
- **Ersatz:** l-14 `k4` wahl 1: `"wert": 0, "tendenz": "kleinreden"`, rueck: „Friedlich – doch du nimmst die Grenze zurück, und beim nächsten Fest fragt er wieder.“

### S14 – Einheit `konter-3-03` führt zu einer Mission, die sie nicht lehrt
- **Datei:** `einheiten-3.json`, `konter-3-03` › `mission: konter-m-09` („Erzähl in einer Gruppe eine kurze lustige Geschichte … mit der Pointe am Ende“)
- **Begründung:** 3-03 lehrt: für alle antworten, Witze der anderen tragen, Hochschaukeln stoppen. Erzählen und Pointe kommen nicht vor (die Geschichten-Übung steht nur im Vorrat, v-0233). Der Sprung ist didaktisch unvermittelt.
- **Ersatz:** vor die Mission einen Schritt `experiment` setzen: „Trag in der nächsten Runde einen Witz eines anderen: lachen, ein Stück dazulegen, zurück zur Sache.“ (dauer „woche“, nachfrage „Wessen Witz hast du getragen – und wie hat die Runde reagiert?“). Die Mission m-09 erst in `3-05` (Stil) verlinken und dort m-10 durch `experiment` ersetzen. Oder einen Schritt `geschichtenbau` (Lage – Wendung – Pointe) in 3-03 aufnehmen.

---

## Kann

- **K1 – Lesart von „rot“ festhalten.** `src/coach/inhalt/LIESMICH.md` 7: Satz ergänzen: „Unfaire Kunstgriffe im Streitgespräch (Schopenhauer: Killerphrase, Strohmann, Etikett, Lacher holen …) laufen ebenfalls als `rot` – nur erkennen und abwehren.“ Dazu: An `kunstgriff`-Fragen ohne jede Einflusstechnik (v-0248 Kunde unterbricht, v-0260 Spitzname „Professor“, v-0261 Einladung zum Lästern, v-0262 Dauerwitz) ist „rot“ ein Etikett für etwas, das keine Taktik ist. Besser Format `auswahl`/`szene` ohne `einfluss`. Bei v-0248 ist die Unterstellung „um dich zu hetzen“ bei einem ungeduldigen Kunden gewagt.
- **K2 – „schärfer, als sie merken“** (`2-03` Karte, `3-01` Schritt a aufloesung, `3-01-m1`): Dass Ranghöhere ihre Schärfe nicht merken, steht so nicht im Quellentext von keltner1998/2001. Entweder den Quellentext um den Befund zu unterschiedlichen Sichtweisen von Neckenden und Geneckten ergänzen (am Volltext prüfen) oder abschwächen: „… und Ranghöhere necken oft schärfer – der andere kann schlecht zurück.“
- **K3 – `konter-3-05` belegHinweis:** „bestätigen Meta-Analysen“. Unter den Quellen ist nur eine Meta-Analyse (schneider2018); martin2003 ist die Fragebogen-Studie. → „bestätigt eine Meta-Analyse als Zusammenhang“.
- **K4 – `konter-2-01` Karte / `w-016`:** Das Modell nennt das Ohr „Appell“. → „… bewusst mit dem Wunsch-Ohr hören (bei Schulz von Thun: Appell-Ohr).“
- **K5 – `konter-l-11` `k5` wahl 1:** „mit allen Fehlern, die ich heute gemacht habe. Wird ein langes Dokument.“ ist Selbstironie über die eigene Leitungsaufgabe vor dem Chef, gegen die Regel aus 2-04. → „Natürlich – vom Chef auf Zeit, mit Stempel. Freitag früh liegt sie bei Ihnen.“ In `k2` wahl 1 sagt die rueck „Du nimmst den Fehler auf deine Kappe“, gemeint ist aber Teilen. → „Du machst den Fehler klein, indem du dich danebenstellst …“
- **K6 – `konter-l-15` `k5` wahl 1:** „Das war das Jahr: …“. Beim Jahresauftakt stellst du das kommende Jahr vor. → „Das wird unser Jahr: eine Übergabestelle, vielleicht ein Maskottchen – und hoffentlich mehr Lacher als mein erster Witz.“
- **K7 – `konter-v-0149`** Antwort 2 (echte Sorge „Ist irgendwas los bei dir?“) = wert 1. Auf echte Sorge mit Überzeichnen zu antworten, wischt sie weg. → wert 0, warum: „Eher echte Sorge als Spruch – hier passt ein ehrliches Wort, kein Überzeichnen.“ (Dann fehlt wert 1; als brauchbare Antwort ergänzen: „‚Du gehst ja immer als Letzte – wie schaffst du das?‘“ = 1, „Fast harmlos – ein Spruch über eine Gewohnheit, nur mit leichtem Unterton.“)
- **K8 – Jule Marek** (`besetzung`: „Bekannte aus dem Kochkurs“) wird in v-0255 („Und du willst Konditorin sein?“, warum „trifft ihren Beruf“) und v-0223 („erste eigene Tortenverkostung“) zur angehenden Konditorin. Das ist neu und für eine Kochkurs-Bekannte überraschend. → v-0255 warum: „Trifft ihren Stolz – kein Necken mehr.“, Text: „‚Und dafür hast du drei Kochkurse gemacht?‘“
- **K9 – `konter-v-0176`** Muster 2 „seine Mails ziehen Wartenummern“ sagt vor dem Kunden immer noch: Antworten dauern. → „Unser Chef hat die großen Linien im Blick – für die Mails hat er uns.“
- **K10 – Der „Test“-Witz** ist dreimal beste Antwort (fc-028, v-0218 „wie flexibel ihr seid. Bestanden!“, v-0227 „testet gerade, wie geduldig Sie sind“) und einmal falsch (fc-039). Wird mit S7 entschärft. Sonst bei v-0227 Muster 1 ersetzen: „… er sammelt gerade Spannung für Sie.“
- **K11 – `konter-v-0104`** (Arm um die Schulter, „Schätzchen“): Kriterium ergänzen: „bei Wiederholung: melden (Vorgesetzte, Betriebsrat, Beschwerdestelle)“. Im Vorrat gibt es keinen `fachhilfe`-Schritt, ein Hinweis auf „belaestigung“ ginge nur über eine Einheit.
- **K12 – `konter-v-0090`** Karte „‚Wer hat das denn abgesegnet?‘“ = übersetzen. Das ist genauso gut eine Rückfrage (unklar, was gemeint ist). Eindeutiger: „‚Das hätte ich gern vorher gewusst.‘ – über deinen Plan“.
- **K13 – `konter-v-0122`** Muster 1 „Bei deinem Ordnungssinn brauchst du ja kein Ablagesystem.“ trägt keine Pointe. → „Bei deinem Ordnungssinn sortiert sich der Schrank vor Ehrfurcht selbst.“
- **K14 – Fähigkeiten der Lückenfüller gedehnt** (`vorrat-04`): v-0261/v-0262 (Lästern, Dauerwitz) als `konter.spiel`, v-0269 (wörtlich nehmen) als `konter.zustimmen`, v-0248 (Kunde unterbricht) als `konter.ruhe`. Die Schätzung dieser Fähigkeiten wird dadurch unscharf. Vertretbar, weil der Vorrat die Übungstage füllen muss. Bei der nächsten Runde passendere Fähigkeiten wählen (v-0261/0262 → `konter.grenze`).
- **K15 – `konter-2-01-b`** Muster 2 „‚Du willst, dass ich erst lese, dann frage? Mach ich. …‘“ klingt schnell schnippisch, gegen das eigene Kriterium „ohne Unterton“. → „‚Stimmt, ich lese sie gleich. Nur kurz: Soll ich bis Freitag liefern?‘“
- **K16 – `konter-l-06` `k2c` wahl 2 und `konter-l-09` `k2c` wahl 2:** „Ich sag ja nur, was alle denken.“ passt in l-06 nicht zum vorherigen Satz („Und das sagst du erst jetzt …?“). → in l-06: „‚Man wird ja wohl noch fragen dürfen.‘“ (tendenz rechtfertigen).

---

## Was gut ist (nicht ändern)

- **2-02 / 3-02 / l-12:** Grenze mit Rückweg, ruhig wiederholen, Strohmann geraderücken, Lacher mit Sache beantworten und hinter den Taktiken die echte Sorge finden. Hier ist der Bereich auf Meisterschafts-Niveau, und die belegHinweise sind vorbildlich ehrlich.
- **3-01 / l-11:** Humor nach oben und unten, „höfliches Lachen von unten ist kein Beweis“: genau, ohne zu moralisieren.
- **3-04 / Spickzettel w-123:** Flop gegen Treffer ist eine klare, merkfähige Unterscheidung.
- **2-06:** Wenn-Dann-Plan mit ehrlicher Grenze („Untersucht wurden Gesundheit, Lernen und Alltag, nicht Schlagfertigkeit“).
- **v-0194, v-0197, v-0199, v-0239:** Hilfe holen bei Wiederholung und Herkunft, Eintreten für Abwesende und Betroffene. Verantwortungsvoll und alltagsnah.
- Die Figuren passen zu `besetzung.json`. Sven als Dauer-Necker ist schlüssig mit `gespraech` (Unpünktlichkeit). Petersens Schwerhörigkeit wird in l-13 gut genutzt, ohne ihn vorzuführen.

---

## Umsetzung (25.11.2026)

Geändert nur in `src/coach/inhalt/konter/`. Keine Kennung geändert, nichts gelöscht. Nach jeder Änderung an einer Lage oder einem Dialog sind alle Wege dorthin noch einmal durchgegangen.

**Prüfung:** Mit einer Kopie des Prüfskripts, die den fremden Fehler beim Bau des Inhaltsverzeichnisses überspringt, meldet konter **0 Fehler**. Es bleiben dieselben 11 Hinweise aus Stufe 1. `--soll konter` ist leer. Das Original `coach-pruefe.mjs` bricht im Moment ab, weil `ausdruck/wissen.json` (parallele Arbeit) kein gültiges JSON ist. `node scripts/coach-index.mjs` durfte ich nicht ausführen (siehe M1).

### Muss
- **M1** – bewusst nicht. `_index.json` wird im Hauptstrang neu gebaut (`node scripts/coach-index.mjs`). Der Lauf war hier gesperrt und wäre am kaputten `ausdruck/wissen.json` gescheitert.
- **M2** – umgesetzt, gekürzt: „Machen wir – und zwar am Stück. Nicht wie Miriams Kuchen heute Morgen, der kam in drei Teilen.“ Die Antwort passt auf allen fünf Wegen zu `k4`. Zusätzlich sagt die rueck der wert-0-Antwort jetzt „Überreizt: …“ statt „Ein Rückgriff zu viel“, denn auf dem Weg über „Abwarten“ gab es vorher keinen Rückgriff.
- **M3** – umgesetzt, abgewandelt: „Eine kleine, ja. Dafür fällt die Nachfolgerin seltener aus als die alte Dame. Darf ich zeigen, was im Preis steckt?“ Das ist ein Vergleich statt eines absoluten Versprechens, und „sie“ ist nicht mehr zweideutig. Ein **zusätzlicher Wegefund**: In `k2` griff Petersen mit „Eine Nachfolgerin, ja“ ein Wort auf, das nur auf dem besten Weg aus `k1` gefallen war. Jetzt heißt es „Eine Nachfolgerin bräuchte sie wohl.“, und das passt auf jedem Weg.
- **M4** – umgesetzt wie vorgeschlagen.

### Sollte
- **S1** – umgesetzt, kürzer: „Ironisches Zustimmen – beim Wort nehmen: ‚Danke! Dann noch kurz mein Einwand: …‘“ Mit der langen Fassung war die beste Antwort in `vorrat-04` zu oft die längste. Der Text des neuen Eintrags w-065 lautet gleich.
- **S2** – umgesetzt. `k3` erzählt die Geschichte nicht mehr ein zweites Mal. „Ach was …“ führt zum neuen `ende4`, in dem Sven beim Abschied wieder ein „Krümel“ herausrutscht. Das Fazit dort sagt, dass die Grenze halb zurückgenommen wurde.
- **S3** – umgesetzt.
- **S4** – umgesetzt, abgewandelt. Der Vorschlag „auch das mit den drei Wochen“ passt nicht auf den Weg ohne Entschuldigung. Jetzt heißt es: „Unter vier Augen hilft heute noch ein kurzer Satz: ‚Der Spruch über die Buchhaltung war daneben. Tut mir leid.‘“ Das passt auf beiden Wegen.
- **S5** – umgesetzt.
- **S6** – umgesetzt. Das passt auch auf den Wegen, auf denen Lena schon zurück ist.
- **S7** – umgesetzt (fc-028).
- **S8** – umgesetzt:
  - Drei Rechtfertigungen sind jetzt kurz und glatt (fc-034, fc-035, fc-040). Bei fc-034 und fc-040 ist dafür der Angriff etwas länger, damit nicht die beste Antwort automatisch die längste ist.
  - fc-031, fc-033 und fc-038 habe ich nicht umgebaut, weil ihre Fähigkeit am Lernstand hängt. Stattdessen gibt es zwei neue Szenarien: **fc-041** (`konter.zustimmen`, Stufe 6, k) und **fc-042** (`konter.umdeuten`, Stufe 8, m).
  - In k/m ist die beste Antwort jetzt in 8 von 18 Szenarien die längste.
- **S9** – umgesetzt. Neue stumme Übung **`konter-v-0272`** „Die Anekdote im Kopf“ (konter.spiel, Stufe 8) in `vorrat-04.json`. Sie ist jetzt die `leise`-Übung zu v-0190.
- **S10** – umgesetzt im Text von w-058, wie vorgeschlagen. Ob die Klassen über beide Bereiche hinweg gleich sein sollen, entscheidet der Hauptstrang (unten).
- **S11** – umgesetzt. Sieben neue Einträge in der Gruppe „Unfaire Tricks – erkennen und abwehren“, alle P, `rot`, mit preis und abwehr, eingefügt hinter w-059:
  - w-062 „alle Vernünftigen“
  - w-063 Ausweichen auf die Person
  - w-064 Etikett
  - w-065 Ironisches Zustimmen
  - w-066 Reizen
  - w-067 Fragensalve
  - w-068 „Das erschlichene Ja“

  Bei w-068 steht ausdrücklich, dass es sich von der ehrlichen „kleinen Zusage zuerst“ (Taktik) unterscheidet. Schopenhauer ist nur dort als Quelle genannt, wo der Kunstgriff bei ihm vorkommt (Etikett, Person, Reizen).
- **S12** – umgesetzt.
- **S13** – umgesetzt. Das Fazit von l-14 ist als Regel formuliert und stimmt deshalb auch auf diesem Weg.
- **S14** – umgesetzt als Variante „geschichtenbau“: neuer Schritt `konter-3-03-e` (Lage – Wendung – Pointe) vor der Mission m-09 und Merkkarte `konter-3-03-m3`. Die Missionen 3-03/3-05 sind nicht verschoben.

### Kann
- **K1** – Den Satz in LIESMICH §7 trägt der Hauptstrang nach (siehe unten). Innerhalb von konter ist bei v-0248 die Unterstellung „um dich zu hetzen“ entschärft: „Dauerndes Unterbrechen setzt dich unter Druck – …“. v-0248, v-0260, v-0261 und v-0262 bleiben `kunstgriff` mit „rot“. Ein anderes Format würde die Übungstage verändern, und das Prüfskript verlangt die Klasse an jedem `kunstgriff`.
- **K2** – umgesetzt als Abschwächung (2-03 Karte, 3-01 Schätzfrage, 3-01-m1): „… necken oft schärfer – der andere kann schlecht zurück.“
- **K3** – umgesetzt.
- **K4** – umgesetzt in w-016 und in der Karte von 2-01 („im Modell: Appell-Ohr“). Die Karte ist sprachlich gestrafft, damit sie bei 420 Zeichen bleibt.
- **K5** – umgesetzt (beste Antwort in `k5` und rueck in `k2`).
- **K6** – umgesetzt. Zusätzlich ist das Fazit von l-15 `ende1` als Regel formuliert („Einen Flop leicht nehmen …“). Vorher behauptete es Taten, die man auf Angriffs-Wegen nicht getan hatte.
- **K7** – umgesetzt. Die Sorge-Antwort hat jetzt wert 0. Neue wert-1-Antwort, ohne Geschlecht formuliert: „Bei dir brennt ja abends immer als Letztes das Licht – wohnst du hier?“
- **K8** – umgesetzt in v-0255 und v-0223. Die Tortenverkostung ist jetzt ein Abend mit Rezepten aus dem Kochkurs, „großer Tag“ heißt jetzt „Abend“.
- **K9, K10** (v-0227), **K12, K13, K15, K16** – umgesetzt.
- **K11** – bewusst nicht. In den `kriterien` einer Konter-Übung wäre „bei Wiederholung melden“ nicht prüfbar, und Fachhilfe gehört als Schritt in eine Einheit. Das ist eine mögliche Idee für eine spätere Einheit mit `fachhilfe: belaestigung`.
- **K14** – bewusst nicht. Ein anderer Fähigkeitsbezug würde die Füllung der Übungstage verschieben. Das bleibt, wie vorgeschlagen, für die nächste Runde.

### Offen für den Hauptstrang
- **K1 / LIESMICH §7:** Es fehlt ein Satz dazu, dass unfaire Kunstgriffe im Streitgespräch (Schopenhauer: Killerphrase, Strohmann, Etikett, Lacher holen …) als `rot` laufen, also „nur erkennen und abwehren“, auch wenn sie nicht zur roten Linie aus `08` gehören.
- **Entweder-oder:** `konter-w-058` ist `rot`, `gespraech-w-057` dagegen `taktik`. Der Text von w-058 grenzt die Fassung mit unterstellter Absicht jetzt ab. Ob beide Seiten einheitlich sein sollen, entscheidet der Hauptstrang. Dasselbe gilt für das neue w-068 im Verhältnis zur „kleinen Zusage zuerst“ (`taktik`) in anderen Bereichen.
- **M1:** `node scripts/coach-index.mjs` erst laufen lassen, wenn `ausdruck/wissen.json` wieder gültiges JSON ist.
