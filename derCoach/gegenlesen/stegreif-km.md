# Gegenlesen: Bereich `stegreif`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser (Didaktik, Logik der Lagen, Faktenprüfung) · **Inhaltsdateien nicht geändert**

## Was geprüft wurde

- **Maßstab:** `08_ENTSCHEIDUNGEN.md` (geht vor), `06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (3a ff., 5–7), `05_LEHRPLAN.md` 3.9, `kern/inhaltTypen.ts`, `besetzung.json`, `gegenlesen/stegreif.md` (Phase 1). Dazu Code: `kern/gehirn/planer.ts` (Filter „ohne Zeitdruck“), `uebungen/Freitext.tsx` (Blitz), `uebungen/Sprechen.tsx` (Bühne), `uebungen/Wahl.tsx`/`Gespraech.tsx` (Mischen der Antworten).
- **Vollständig gelesen:** `einheiten-2.json` (2-01 … 2-06), `einheiten-3.json` (3-01 … 3-05), `lagen-2.json` (l-06 … l-10), `lagen-3.json` (l-11 … l-15), `vorrat-03.json` (v-0097 … v-0176), `vorrat-04.json` (v-0177 … v-0256), Lerntage k/m in `kurs.json`, `tests.json` fc-025 … fc-040, neue Einträge `wissen.json` (w-015 … w-019, w-046 … w-049, w-054, w-124, w-125), neue Quellen (`rogers-norton2011`, `kumar2018`, `mar2021`, `tullis2023`, `rozenblit2002`). **Jeden Weg** durch jede Lage und jeden Dialog nachverfolgt (l-06 … l-15, 3-02-d, 3-05-b, v-0167, v-0168, v-0172, v-0222, v-0223, v-0240, v-0241).
- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur stegreif` → **0 Fehler, 2 Hinweise**. Beide betreffen Phase 1 (`einheiten-1.json`: längste Antwort meist falsch; `vorrat-01.json`: beste Antwort in 7 von 9 Zwei-Wahl-Knoten die längste). `--soll stegreif`: nichts fehlt.
- **Eigene Zählung:** Auswahl/Kunstgriff/Tests mit ≥ 3 Antworten – beste = längste: einheiten-2 3/8, einheiten-3 4/8, vorrat-03 8/21, vorrat-04 9/28, Tests 7/16 (zusammen 31/81 = 38 %). Lagen: beste Wahl = längste in 10/26 (l-06–l-10) und 11/27 (l-11–l-15) Knoten – deutlich besser als Phase 1 (70 %). Keine Wahl in Lagen über 140 Zeichen. Die Stelle der besten Antwort ist egal: `Wahl.tsx` und `Gespraech.tsx` mischen die Antworten.
- **Kursplan:** k = 6 E, 6 Ü, 4 L, 3 A, 1 S (20); m = 5 E, 5 Ü, 4 L, 3 A, 1 S (18). Bänder [3,6] … [4,7] und [5,8] … [6,10] (ue-016 [5,9]). Test-Stufen k 4–7, m 6–9. Titel folgen Lehrplan 3.9 bzw. den geschärften Titeln in `08`. Missionen m-08/m-09/m-10 (Sprossen 8–10) erst in k/m, aufsteigend. Jede Lage steht nach der Einheit, die sie voraussetzt. **Stimmt.**
- **Laut/leise und Uhr:** Alle 17 lauten Übungen (`buehne`) nennen eine stille `stumm`-Übung **derselben Fähigkeit mit demselben Lernziel** (2-04-c→v-0099, 3-01-c→v-0177, 3-04-d→v-0180, v-0103…0106→v-0097…0100, v-0187…0192→v-0177/0186/0178/0179/0180/0181). **Blitz mit Uhr** (v-0136, v-0137, v-0144, v-0145): Der Planer lässt Blitz bei „ohne Zeitdruck“ zu (`planer.ts` Z. 41), `Blitz` blendet dann die Uhr aus (`Freitext.tsx` Z. 99); die Aufträge nennen keine Sekunden im Text – damit hat jede Blitz-Runde ihre Fassung ohne Zeitdruck. Blitz ist nicht laut, braucht also keinen stillen Ersatz. Einziger Rest: Bühnen-Prüflisten nennen Störungen, die es ohne Uhr nicht gibt (K5).
- **Einfluss-Klassen:** „rot“ steht nur an `kunstgriff` (3-02-a, v-0206, v-0216, v-0217, v-0250) und am Wissens-Eintrag w-048 – nie als Musterlösung, Mission oder Einsatz-Übung. Fragensalve, Strohmann, falsches Entweder-oder, Killerphrase, erschlichenes Ja sind wie in §7 rot. **Ausnahme: Ausweichen (v-0205, w-038) als `taktik` – siehe S1.** Keine Taktik-Mission. Fachhilfe kommt nicht vor (kein heikles Thema, das sie verlangt). Keine Rufnummern, kein „...“, „Sie“ nur in wörtlicher Rede, keine verbotenen Wörter.
- **Quellen nachgeschlagen:**
  - **rogers-norton2011** (Harvard-Seite, APA, ScienceDaily): vier Experimente, **1.139** Erwachsene (Ø 44 Jahre), drei mit Video einer gestellten Debatte, eins mit Tonausschnitten; ähnliche Ausweich-Antworten wurden nicht erkannt und **nicht schlechter** bewertet; schlecht kamen deutlich fremde und **stockende Antworten auf die richtige Frage** an; Erkennen **39 % → 88 %**, wenn die Frage eingeblendet blieb. **Alles korrekt** in der Quelle, in 3-02 (Studie) und w-017. Feinheit: K1.
  - **kumar2018** (APS Observer, UChicago News, Chicago Booth): Briefe, vier Experimente; Schreibende unterschätzten Freude und Überraschung, überschätzten Peinlichkeit; größte Lücke bei der eingeschätzten **Kompetenz**, Empfänger achten auf **Wärme**; wer viel Peinlichkeit erwartete, schrieb seltener. **Inhaltlich korrekt** in Quelle, w-018, 3-04 (Mythos, Aha). **Nicht bestätigt:** „vorab registriert“ – keine der zugänglichen Zusammenfassungen nennt das, den Volltext konnte ich nicht lesen (S17).
  - **mar2021** (PubMed/PMC): über 75 Stichproben, mehr als 33.000 Teilnehmende, Erzähltexte besser verstanden und behalten, robust. **Korrekt** in Quelle, w-015, 2-06.
  - **tullis2023** (Springer/PMC-Auszüge): Lernen verschlechterte die Einschätzung, was Neulinge wissen; weniger Stützen aufs eigene Wissen half nicht; Ursache: fehlende Hinweise auf das Wissen der anderen. **Korrekt** in Quelle, w-016, 3-03. Die Zahl „vier Experimente“ stand in den Auszügen nicht – unkritisch, keine Zahl im Lerntext.
  - Ohne eigene Websuche gegen vorhandene Quelltexte abgeglichen: `okeefe1999`/`allen1991` (2-02 korrekt), `gentner2003`/`alfieri2013` (2-03), `gollwitzer2006`/`webb2012` (2-05), `savitsky2003` (2-05, 3-01), `kross2014`/`low2021` (3-05, w-019), `eyal2018` (3-03 – siehe S6).

## Gesamteindruck

Die Phasen k und m **vertiefen wirklich**, statt zu wiederholen: Gestern – heute – morgen bekommt Gewichte, die Meinung ein Fazit mit „wenn/außer“, der Vergleich seine Grenze, die Überraschungsfrage vier Sorten mit je einem Bauplan, der Blackout drei Wenn-Dann-Sätze, dazu ein Geschichten-Vorrat. In m kommen Bogen vor Publikum, unbequeme Frage, Erklären für Laien, Dank und Druck dazu – jedes mit ehrlich begrenztem Beleg. Die Sparrings („Einspringen für Carla“, „Der Tag der offenen Tür“) fassen die Phase gut zusammen, die Rückmeldungen erklären fast immer das Warum, schwache Wege enden mit „Kein Drama“ und einem Rat. Die neuen Quellen sind sauber wiedergegeben – einschließlich des unbequemen Teils von Rogers & Norton (stockendes ehrliches Antworten kommt schlechter an).

Die Mängel sitzen an drei Stellen:
1. **Wege in Lagen und Dialogen:** Auf mehreren Wegen reagiert eine Figur auf etwas, das nie gesagt wurde („Fallschirm?“, „Freitag. Gut.“, „Ich probier's mit dem Briefkasten“), oder ein Schluss lobt nach einer schwachen letzten Wahl.
2. **Tatsachen in besten Antworten, die nicht im Text stehen** („Großkunden“ statt Lieferanten, „Räder im Flur“, „das Fest ist bezahlt“).
3. **Einfluss-Klasse beim Ausweichen** und einige **Figuren-Brüche** (Carla und Lena verabschiedet, Jules Rolle im Kochkurs).

---

## Muss (13)

| # | Datei | Kennung/Pfad | Zitat | Begründung | Ersatz |
|---|---|---|---|---|---|
| M1 | lagen-2 | `stegreif-l-06` k3, Wahl 2 (wert 2) | „Dafür: kein Streit mit **Großkunden**. …“ | Die zwei Zögernden sind laut Lage **Lieferanten**, keine Kunden. Die beste Antwort behauptet etwas Falsches. | „Dafür: kein Streit mit zwei wichtigen Lieferanten. Dagegen: zwei Abläufe kosten Zeit. Fazit: nein – außer bis Jahresende als Übergang.“ (unter 140 Zeichen) |
| M2 | lagen-2 | `stegreif-l-07` k1, Wahl 1 (wert 1) → `k2` | k2: Tarek: „**Fallschirm?** Wir springen hier nirgends runter. Der Vergleich hinkt.“ | Auf diesem Weg hast du keinen Fallschirm erwähnt („Damit Fehler auffallen, bevor Geld rausgeht.“). Tarek antwortet auf ein Bild, das es nicht gab. | Wahl 1 `weiter: "k1c"`, neuer Knoten `k1c`: sagt „Tarek: „Fehler? Ich mach doch keine. Das ist Misstrauen.““ · Wahl A (wert 2, → k2): „„Kein Misstrauen – wie beim Fallschirm: Einer packt, einer prüft. Jeder übersieht mal was.““, rueck „Jetzt mit Bild: Der Zweite sieht, was der Erste übersieht.“ · Wahl B (wert 0, `ausweichen`, → ende2): „„Na ja, ist halt so.““, rueck „Lena hört zu – und lernt, dass die Regel keinen Grund hat.“ |
| M3 | lagen-2 | `stegreif-l-08` k4, Wahl 2 (wert 0, `schwimmen`) → `ende1` | ende1: „… Zum Schluss: ein Satz. So bleibt ein Termin gut, auch wenn er nicht nach Plan läuft.“ | Die letzte Wahl war Schwimmen ohne Ende – das Fazit lobt genau das Gegenteil. | Wahl 2 `weiter: "ende2"` (ende2 passt: „… und „Kurz gesagt“ zum Schluss“). |
| M4 | lagen-2 | `stegreif-l-09` k2, Wahl 1 („da fällt mir gerade nichts ein“) und Wahl 2 (Lebensmittelvergiftung erfinden) → k3 → `ende1` | ende1 sagt: „Später am Herd fragt dich jemand: „Und, wie ging das mit dem **Bauern** weiter?““; Fazit „Geschichten aus dem Vorrat, Brücken vom Stichwort …“ | Auf diesen Wegen wurde die Bauern-Geschichte nie erzählt (bzw. eine erfundene) – die Nachfrage ist unmöglich, das Fazit lobt den Bluff mit. | ende1 sagt: „Später am Herd knüpft jemand an das an, was du in der Runde erzählt hast.“ · Wahl 2 (Bluff) `weiter: "k2b"`, neuer Knoten `k2b`: Jule: „„Oh je – wo war das denn?““ · Wahl A (wert 2, → k3): „„Ehrlich? Ausgedacht. Die echte Panne: ein Platten auf der Radtour – ein Bauer hat uns gerettet.““, rueck „Stark zurückgenommen – und die echte Geschichte ist sowieso besser.“ · Wahl B (wert 0, `bluffen`, → ende2): „„In Spanien, glaube ich – lange her.““, rueck „Der Bluff wächst. Nachfragen kann er nicht aushalten.“ |
| M5 | lagen-3 | `stegreif-l-11` k1 Wahl 3 (wert 2) und k4 Wahl 2 (wert 2) | „„**Unsere Räder stehen im Flur.** …““ / „„Kurz gesagt: Räder raus aus dem Flur …““ | Dass die Räder im Flur stehen, steht nirgends in der Lage – die beste Antwort erfindet das Problem. | In `lage` nach dem ersten Satz ergänzen: „Bisher stehen die Fahrräder im Hausflur.“ |
| M6 | lagen-3 | `stegreif-l-11` k4, Wahl 1 (wert 0, `entschuldigen`) → `ende1` | ende1: „Ein Bogen in einer Minute, der wahre Teil zuerst, eine Salve sortiert, **ein Schluss-Satz**. So überstehst du auch eine Versammlung mit Gegenwind.“ | Die letzte Wahl war ein unsicheres Auslaufen – das Fazit lobt den Schluss-Satz. | Wahl 1 `weiter: "ende3"`, neu: sagt „Der Hausverwalter: „Gut, dann stimmen wir nächsten Monat ab.““, ende „Kein Drama – die Fragen hast du gut überstanden. Nur das Ende ist verpufft: Beim nächsten Mal mit „Kurz gesagt: …“ schließen.“ |
| M7 | lagen-3 | `stegreif-l-12` k1 Wahl 1 (ohne Bild) bzw. k4 Wahl 1 („Das müsste ich nachfragen“) → `ende1` | ende1 sagt: „Herr Petersen: „Ich probier's mit dem **Briefkasten**. Und **Papier bestelle ich trotzdem**.““ | Auf diesen Wegen kennt er weder das Bild „Briefkasten“ noch die Papier-Möglichkeit. | ende1 sagt: „Herr Petersen: „Gut. Ich probier's.““ |
| M8 | lagen-3 | `stegreif-l-13` k4, Wahl 1 (wert 0, `rechtfertigen`) und Wahl 3 („Na gut.“ – und hinsetzen) → `ende1` | ende1: „Tassen werden gehoben. Carla wird rot …“ – Fazit „… eine Tat, eine Wirkung, ein Glas. Danke sagen braucht keine schönen Worte – nur konkrete.“ | Nach dem Diskutieren mit ihrer Bescheidenheit bzw. ohne Glas lobt das Fazit genau den Abschluss, der fehlte. | Wahl 1 und 3 `weiter: "ende3"`, neu: sagt „Dr. Albers hebt die Tasse: „Auf Carla!““, ende „Kein Drama – der Dank ist angekommen. Beim nächsten Mal: Abwinken annehmen, ein kurzer Satz, dann selbst das Glas heben.“ |
| M9 | lagen-3 | `stegreif-l-14` k1, Wahl 2 („Dann schicke ich Ihnen die Folien per Mail.“) → `k2` | k2: Werkstattleiter: „Und wenn **Ihre feste Person** im Urlaub ist?“ | Auf diesem Weg wurde keine feste Person erwähnt. | Wahl 2 `weiter: "k1b"`; k1b sagt: „Sie hebt die Hand: „Bitte keine Folien. Ein Satz.““ (passt dann zu Wahl 1 und 2). |
| M10 | lagen-3 | `stegreif-l-14` k3 Wahl 1/2 + k4 Wahl 2 → `ende1` | ende1 sagt: „Nadine Köhler, schon in der Tür: „**Freitag.** Gut.““ | „Freitag“ fällt nur in k3 Wahl 3 bzw. k4 Wahl 3. Auf anderen Wegen antwortet sie auf nichts. | ende1 sagt: „Nadine Köhler, schon in der Tür: „Gut. Wir hören voneinander.““ |
| M11 | einheiten-3 | `stegreif-3-05-b` (Dialog), k2 Wahl 2 (`bluffen`) → `ende2` | ende2: „Der Plan geht durch, **wie er war**. Miriam schaut auf ihr Handy.“ – „… beim nächsten Mal: Erst „Ja, und“, dann prüfen.“ | Auf diesem Weg hast du Miriams Idee angenommen – der Plan hat sich geändert, Miriam hat keinen Grund zum Rückzug, und der Rat trifft den Fehler (Bluff) nicht. | k2 Wahl 2 `weiter: "ende3"`, neu: sagt „Dr. Albers notiert: „Also keine Zusatzkosten.““, ende „Kein Drama – die Idee hast du gut angenommen. Nur die Zahl war geraten: Was du nicht weißt, lieferst du nach, auch im Schwung.“ |
| M12 | vorrat-03 | `stegreif-v-0223` (Dialog), k1 Wahl 3 („Das klären wir noch.“) → `k2` | k2: Dr. Albers: „Dann klären Sie bis Freitag, **ob das Budget kommt**.“ | Auf diesem Weg war vom Budget nie die Rede. | k2 sagt: „Dr. Albers: „Dann klären Sie bis Freitag, woher die Leute kommen.““ |
| M13 | vorrat-04 | `stegreif-v-0241` (Dialog), k1 Wahl 3 → k2 → `ende1` | ende1 sagt: „Nadine Köhler: „**Freitag also.**““ | Auf dem Weg „Darf ich erst das Paket zu Ende vorstellen?“ fällt „Freitag“ nie. | ende1 sagt: „Nadine Köhler: „Gut. Dann hören wir voneinander.““ |

## Sollte (17)

| # | Datei | Kennung/Pfad | Zitat | Begründung | Ersatz |
|---|---|---|---|---|---|
| S1 | vorrat-04 (neu) und wissen (Phase 1) | `stegreif-v-0205` Kopf `"einfluss": "taktik"`; `stegreif-w-038` `"einfluss": "taktik"` | „Die Antwort, die keine ist: Man nimmt die Frage freundlich an und spricht über etwas anderes.“ | **Gegen LIESMICH §7 sollte das `rot` sein.** (1) `taktik` heißt „erklären **und trainieren**“; der Bereich lehrt in 3-02, w-017, w-124 das Gegenteil. Eine gelbe „Taktik“-Marke auf der Bereichsseite (`Bereichsseite.tsx`) wirkt wie eine Erlaubnis. (2) Das Mittel wirkt nur, **solange es niemand durchschaut** (Rogers & Norton: Erkennen 39 % → 88 %) – es täuscht vor, die Frage sei beantwortet. Das ist strukturell ein Strohmann der Frage (§7: rot). (3) §7 trennt bei Entweder-oder und kleiner Zusage nach demselben Muster: echt = Taktik, verschleiert = rot. Hier: Brücke **nach** der Antwort = fair (w-017), Brücke **statt** Antwort = rot. (4) Im selben Bereich ordnet `v-0220` „„Gute Frage“ – und dann über etwas anderes reden“ schon unter „Kunstgriff“ ein, zusammen mit Strohmann und falschem Entweder-oder. (5) Als Taktik fehlte zudem der `preis` in v-0205. | v-0205 und w-038: `"einfluss": "rot"`. In v-0205 `erklaerung` nach dem ersten Satz ergänzen: „Ein unfairer Kunstgriff – hier nur zum Erkennen.“ Entscheidung in `08` (Lehrplan-Abweichungen bzw. LIESMICH §7) nachtragen, damit andere Bereiche gleich einstufen. |
| S2 | einheiten-3 | `stegreif-3-02-d` k1, Wahl 3 (wert 1) | „„Lassen Sie uns lieber nach vorn schauen.““ | Das ist reines Ausweichen; derselbe Satz steht in `v-0209` als „weicht aus“, ein ähnlicher in 3-02-b ist wert 0. Widersprüchliche Bewertung in der Einheit, die „erst antworten“ lehrt. | Wahl 3 → `wert: 0, tendenz: "ausweichen"`, rueck „Nach vorn ist richtig – aber erst nach der Antwort. So ist es Ausweichen, und alle merken es.“ Neue Wahl (wert 1, → k2): „„Zwei Zulieferungen fehlten.““, rueck „Der Grund stimmt – dein eigener Anteil fehlt noch.“ |
| S3 | einheiten-3 | `stegreif-3-02-d` ende1 / ende2 | ende1: „… so ist eine unbequeme Frage **in zwei Sätzen** erledigt.“ · ende2: „… beim nächsten Mal: **die Antwort in den ersten Satz**, dann der Termin.“ | ende1 wird auch über k2b (nach Rechtfertigen) erreicht; ende2 auch nach bester erster Antwort (Fehler war nur „so bald wie möglich“). | ende1: „Ehrlich antworten, eigenen Anteil nennen, Termin geben – so ist eine unbequeme Frage schnell erledigt.“ · ende2: „Kein Drama – beim nächsten Mal: die ehrliche Antwort zuerst und ein fester Termin statt „so bald wie möglich“.“ |
| S4 | einheiten-3 | `stegreif-3-05-b` k2b, Wahl 1 (wert 2) → `ende1` | ende1: „… **und ehrlich bleiben, wo du etwas nicht weißt**.“ | Auf diesem Weg kommt die Kostenfrage nie; das Fazit lobt Ungeprüftes, Dr. Albers nickt ohne eigenen Satz. | k2b Wahl 1 `weiter: "k2"` – dann kommt die Kostenfrage auf beiden guten Wegen. |
| S5 | einheiten-3 | `stegreif-3-03-c` (rangfolge), 4. Eintrag | „„Ist das verständlich – oder soll ich es Ihnen einmal zeigen?““ – „Nachfragen statt raten …“ | Das ist im Kern „Alles klar?“ – das bewertet 3-03-d zwei Schritte später mit 0. Widerspruch in derselben Einheit. | „„Probieren Sie es gleich einmal – ich schaue zu.““, warum „Nachfragen statt raten: Was er selbst tut, zeigt, ob es angekommen ist.“ |
| S6 | einheiten-3 | `stegreif-3-03-d`, Antwort 2 (warum) | „Gesichter lesen macht nicht treffsicherer – fragen schon.“ | `eyal2018` zeigt: **sich hineinzuversetzen** machte nicht treffsicherer – nicht, dass Gesichter nichts verraten. Der Satz widerspricht zudem dem Bereich `lesen`. | „Ein Gesicht zeigt dir, ob jemand unsicher ist – nicht, was genau fehlt. Fragen zeigt es.“ |
| S7 | einheiten-3, vorrat-04, lagen-2, vorrat-04 | Figuren | 3-04-c „Beim **Abschiedsessen für Carla** …“; v-0196 „Eine Minute beim **Abschied von Lena** aus dem Team“; l-09 „Jule Marek **leitet** heute“, 3-04-b Muster „Jule, an diesem Tisch **hast du uns beigebracht** …“, v-0240 „**Du leitest** heute vertretungsweise den Kochkurs“ (Jule ist dabei) | Carla bleibt in l-13 (danach im Kursplan), l-10 und in `antrieb`, `ausdruck`, `smalltalk` im Haus; Lena ist laut Besetzung „neue Kollegin“. Jule ist laut Besetzung „Bekannte aus dem Kochkurs“, mal Kursleiterin, mal Teilnehmerin. (Für den parallelen Figuren-Abgleich.) | 3-04-c: „Beim Abschiedsessen für eine Kollegin, die in Rente geht …“ (namenlos, Antworten ohne „Carla“, Apfel bleibt). v-0196: „Abschied einer Kollegin aus dem Team“ (namenlos – neue Namen außerhalb der Besetzung sind nicht erlaubt; also „Du hast uns gezeigt …“ ohne Namen). l-09: „Die Kursleiterin begrüßt euch, Jule sitzt neben dir“ – oder Jule bleibt Leiterin und v-0240 wird „Die Kursleiterin ist krank, du springst ein. Jule ist dabei.“ 3-04-b Muster 1: „Jule, an diesem Tisch hast du mir gezeigt …“. |
| S8 | vorrat-03 | `stegreif-v-0172` k2 Wahl 1, rueck | „Beide Pläne verbunden – **das Bedenken mit dem vielen Essen** gleich mit gelöst.“ | k2 erreicht man nur ohne das Bedenken (das kam nur in der Wahl, die nach k2b führt). | „Beide Pläne verbunden – Jules Idee trägt den Abend, deine bekommt einen Platz.“ |
| S9 | vorrat-03 | `stegreif-v-0171` Karte 3, Fach „baut aus“ | „„Spannend, das nehme ich mit auf die Liste.““ | Das ist Aufschieben, nicht Ausbauen – in v-0170 ist „Lass uns das nachher besprechen“ nur wert 1. Mehrdeutig. | „„Ja, und wer mag, probiert es gleich aus.““ |
| S10 | vorrat-03 | `stegreif-v-0143` Karte 4, Fach „Wendung“ | „„Ich habe gelacht und einfach gefragt.““ | In 2-06-a (Muster 1) gehört „gelacht, gefragt“ zum **Schluss**. Zwei Antworten auf dieselbe Geschichte. | Karte: „„Ich merkte es erst beim dritten Namen.““ (Wendung). |
| S11 | vorrat-03/04, tests | beste Antworten mit Tatsachen außerhalb des Textes | v-0173: „Mit ruhigen Räumen wären **die meisten** dafür“ (Text: „viele wünschen sich“); v-0213: „**Letzte Woche** haben Sie zu lange gewartet“ (Text: „Einmal hast du zu spät geantwortet“); v-0244: „**das Fest ist bezahlt**“; fc-025: „nächstes Jahr **leite ich** selbst eine Tour“ (Text: „willst“) | Wiederkehrender Fehler: Die beste Antwort darf nicht mehr behaupten als der Text. | v-0173: „„Geteilt: kürzere Wege, aber lauter. Mein Eindruck: Mit ein paar ruhigen Räumen wären viele zufrieden.““ · v-0213: „„Immer – nein. Einmal habe ich zu spät geantwortet, das stimmt.““ · v-0244: „„Ja, letztes Jahr gab es ein Minus. Deshalb haben wir dieses Jahr Sponsoren gesucht – und gefunden.““ · fc-025: „„… – und nächstes Jahr will ich selbst eine Tour leiten.““ |
| S12 | vorrat-04 | `stegreif-v-0219`, `stegreif-v-0251` (Muster) | v-0219 M1 „Kosten trägt der Verein … **weil die Halle vorher belegt war**“ vs. M2 „Viertens: **Vorher gab es keine Halle**.“; v-0251 M1 „**zwei Monate** zu spät … **falsche Kontonummer**“ | Muster erfinden Fakten, die der Auftrag nicht gibt – und widersprechen sich (v-0219). | Fakten in den Auftrag: v-0219 „Du weißt: Start im April, der Verein trägt die Kosten, mitmachen kann jeder, vorher war die Halle belegt.“ – M2 „Viertens: Vorher war die Halle belegt.“ · v-0251 „Du weißt: Das Geld kam zwei Monate zu spät, wegen einer falschen Kontonummer.“ |
| S13 | vorrat-04 | `stegreif-v-0253` | nur **ein** Muster | `06` §1: freie Antworten mit zwei bis drei Musterlösungen. | 2. Muster: „Erster Satz: „Dieses Jahr hat unser Chor zum ersten Mal ohne Noten gesungen.“ Geschichte: „Beim Probenwochenende fiel der Strom aus – wir haben bei Kerzen weitergesungen, auswendig.“ Dank: „Danke an alle, die geblieben sind.“ Letzter Satz: „Auf ein Jahr ohne Noten – und mit Strom!“ |
| S14 | tests, lagen | fast doppelte Prüfungen | fc-033 ≈ v-0193 (erster und letzter Satz, fast wortgleich); fc-040 ≈ 3-05-a („keinen Fehler machen“ / „du“-Satz); fc-027 ≈ v-0131/l-07 k2 (Vergleich hinkt → „Stimmt, … Aber …“); fc-034 ≈ 3-02-b/v-0208; fc-036 ≈ v-0205; fc-029 ≈ v-0150; l-14 k3 ≈ v-0241 k1 (Schulungs-Idee, beste Antwort fast wortgleich); l-11 k3 ≈ 3-02-a („… ist das nicht sowieso schon beschlossen/entschieden?“) | Der Formcheck und die Lagen messen so Wiedererkennen statt Übertragen – derselbe offene Punkt wie in Phase 1. | Je Paar das Lernziel behalten, Lage und Fehlerart wechseln. Beispiele: fc-033 „Bei der Einweihung …“ → Frage nach dem **Ende** („Die Mitte wird lang – was tust du?“); l-14 k3 andere Idee: „„Könnten Sie das auch für unsere Filiale übernehmen?““; l-11 k3 ohne „sowieso beschlossen“, Spitze z. B. „„… und wer haftet, wenn ein Rad wegkommt?““ |
| S15 | lagen-2/3 | Schlüsse, die auf gemischten Wegen loben | l-06 ende1 (Albers: „Dann rufen wir Mittwoch gemeinsam an“ – auch ohne deine Bitte; Fazit „zwei Baupläne …“ auch nach Abwerten in k2); l-07 ende1 („die Grenze selbst zugegeben“ – auch über den Zahnarzt-Weg); l-12 ende1 („nachgefragt statt geraten“ – auch nach „Das erkläre ich Ihnen lieber nicht“); l-14 ende1 („eine unerwartete Idee annehmen“ – auch nach Abblocken); l-10 ende1 | Fazit klingt wie ein Zeugnis, auch wenn unterwegs 0-Wahlen lagen. | Fazit als Regel statt als Leistung fassen, z. B. l-07: „Ein Vergleich mit demselben Prinzip, die Grenze selbst zugeben, der Kern für die, die es anwenden – daran misst du solche Gespräche.“ · l-06 sagt: „Dr. Albers: „Gut. Mittwoch sprechen wir über die zwei.““ |
| S16 | tests | `stegreif-fc-028` | „… warum du jeden Monat einen kleinen Betrag zurücklegst, statt einmal im Jahr viel. Welcher Vergleich trifft das Prinzip?“ | Der Grund steht nicht im Text; „Kleinvieh macht auch Mist“ (wert 1) trifft ein mögliches Prinzip ebenso gut wie das Zähneputzen. Die beste Antwort ist so nicht eindeutig. | Frage ergänzen: „Dein Grund: Ein bisschen jeden Monat hält man leichter durch als einmal im Jahr einen großen Kraftakt.“ |
| S17 | quellen, wissen, einheiten-3 | `kumar2018`, `stegreif-w-018`, `stegreif-3-04` (belegHinweis) | „**Vorab registrierte** Versuche mit Dankesbriefen“ | In APS, UChicago und Chicago Booth nicht bestätigt; Volltext nicht lesbar. | Am Volltext prüfen; sonst „Vier Versuche mit Dankesbriefen“. |

## Kann (19)

| # | Datei | Kennung | Zitat → Vorschlag | Grund |
|---|---|---|---|---|
| K1 | einheiten-3 | `3-02` aha | „Dann sieht es **jeder**.“ → „Dann sehen es fast alle.“ | 88 %, nicht 100 %. |
| K2 | einheiten-3 | `3-05` Karte | „Was unter kleinem Druck geprobt ist, **trägt unter großem**.“ → „… trägt eher auch unter großem.“ | Meta-Analyse aus dem Sport, kein Versprechen. |
| K3 | einheiten-2 | `2-05` Mythos, warum | „wie sichtbar ihre **Unsicherheit** ist“ → „… ihre Nervosität …“ | Savitsky maß Nervosität. „Eine Pause wirkt oft wie Absicht“ ist Praxiswissen – ggf. „oft“ → „manchmal“. |
| K4 | einheiten-2 | `2-05-a` Karte 4 | „Du merkst, dass du über etwas anderes redest als gefragt.“ (Fach „nach der Frage fragen“) | Wer abschweift, kennt die Frage meist noch; v-0158 rät „Zurück zu Ihrer Frage“. Karte ersetzen: „Eine lange Zwischenfrage hat dich weit weggeführt.“ |
| K5 | einheiten-2/3, vorrat-03/04 | alle `buehne`-Prüflisten | „nach der Störung zum Plan zurückgefunden“, „rechtzeitig zum letzten Satz“ | Bei „ohne Zeitdruck“ zeigt `Buehne` keine Störungen und keine Uhr (`Sprechen.tsx` Z. 149–153) – der Punkt ist dann nicht abhakbar. „… (falls eine Störung kam)“ anhängen, oder die Komponente blendet solche Punkte aus. |
| K6 | lagen-3 | `l-15` k1 Wahl 2; ende2 | „verlässt **es** heute noch das Haus“ → „verlässt Ihre Bestellung heute noch das Haus“; „die schwerste Lage **überhaupt**“ → „eine der schwersten Lagen“ | Bezug; Übertreibung. |
| K7 | lagen-3 | `l-11` k2 Wahl 1 | „Und **gefragt hätte ich Sie vorher sollen**.“ → „Und ich hätte Sie vorher fragen sollen.“ | Grammatik (Ersatzinfinitiv). |
| K8 | vorrat-03 | `v-0115` M2; `v-0116` Karte 2 | „Fazit: ja, außer wir finden **keinen** Ausgleich“ → „Fazit: ja – wenn es für die Wochenenden einen Ausgleich gibt.“; „Wir **sind** danach an der frischen Luft **gewesen**“ → „Wir sind an der frischen Luft statt im Bus.“ | doppelte Verneinung; Zeitform. |
| K9 | vorrat-03 | `v-0141` M2 | „Schild: ‚Experiment‘. Er war als Erstes weg.“ → „Schild: ‚Aus Versehen mit Salz – heute gratis‘. Er war als Erstes weg.“ | „Experiment“ verschleiert den Fehler – das Muster soll „Fehler offen zugeben“ zeigen. |
| K10 | vorrat-03 | `v-0133` M1/M2 | Grenzen („aufräumen hilft beim Rechner nicht immer“, „Der Rechner sagt dir nicht, wo er zu voll ist“) | Fachlich schief (Windows zeigt die Belegung). M2: „Der Unterschied: Beim Rechner siehst du die Unordnung nicht – du musst nachschauen.“ |
| K11 | vorrat-04 | `v-0228` M2 | „Der Unterschied: Am Ende zahlst du etwas mehr …“ | Der Aufpreis ist das Prinzip, nicht die Grenze; Ratenkauf ist selbst ein Kredit. Grenze z. B.: „Der Unterschied: Beim Bruder kannst du verhandeln – bei der Bank steht das Extra vorher fest.“ |
| K12 | vorrat-04 | `v-0224` | „**Dein Neffe** fragt …“ → „Das Kind deiner Nachbarn fragt …“ | LIESMICH §5: keine festgelegte Familie (Tante Renate steht in der Besetzung, ein Neffe nicht). |
| K13 | einheiten-3 | `3-03-b` Antwort 3 | „… Die **Mail** sieht echt aus …“ (gefragt: Phishing-**Link**) → „Wie ein falscher Briefträger, der deinen Schlüssel ‚zur Prüfung‘ will: Der Link führt auf eine echt wirkende Seite, die dein Passwort will.“ | fachlich genauer. |
| K14 | einheiten-2 | `2-03-d` M1 | „verlierst du den, kommst du an keinen mehr heran“ | w-049 sagt richtig „Ersatz nur, wenn du vorgesorgt hast“ – angleichen. |
| K15 | vorrat-04 | `v-0214` Antwort 1 | „Dann erfahren Sie es **als Erste**.“ → „Sobald es raus ist, sage ich es Ihnen.“ | Versprechen, das du nicht halten kannst. |
| K16 | einheiten-3 | `3-02-a` erklaerung | „„Entschieden ist noch nichts …““ | Steht nicht in der Lage; Lage ergänzen: „Entschieden ist noch nichts.“ |
| K17 | vorrat-03 | `v-0107`, `v-0160` | Frau Sommer „am **Zaun**“, „Ihrem **Umbau**“ | Sonst wohnt ihr im selben Mietshaus (l-11, v-0167, v-0201, 3-04-a). „im Treppenhaus“, „mit Ihrer Renovierung“. (Für den Figuren-Abgleich.) |
| K18 | einheiten-2/3 | Missionen | 2-01 (Gestern – heute – morgen) → m-08 „Was – Was heißt das – Was jetzt“; 3-04 (Tat – Wirkung – Glas) → m-09 „mit Gestern, Heute, Morgen“ | Mission übt einen Nachbar-Bauplan. Leiter nicht ändern; stattdessen im `experiment` der Einheit oder in der Karte einen Satz: „Die Mission nimmt die Schwester des Bauplans.“ |
| K19 | vorrat-03 | `v-0167` ende1 | „… und was du nicht weißt, lieferst du nach.“ | Über k2b kommt die Nichtwissen-Frage nie. „Was los ist, was es heißt – und was du nicht weißt, lieferst du nach, statt zu raten.“ als allgemeine Regel lassen oder k2b-Weg über k2 führen. |

---

## Didaktik – Einzelurteil der Einheiten

| Einheit | Aufbau | Urteil |
|---|---|---|
| 2-01 G-H-M mit Richtung | vergleich → karte → rangfolge → auswahl → umformulieren → zuordnen → Mission | vertieft 1-03/l-03 gut (Gewichte, Bitte am Ende); Mission-Bauplan abweichend (K18) |
| 2-02 Dafür, dagegen, Fazit | schaetzen → karte → auswahl → bauplan → fehler → experiment → reflexion | sauber belegt (O'Keefe/Allen), „Ja, wenn / Nein, außer“ als Kern stark |
| 2-03 Vergleich und Grenze | auswahl → karte → studie → zuordnen → auswahl → umformulieren → experiment → reflexion | gute Suchtechnik (Prinzip → Bereiche abklopfen) |
| 2-04 Überraschungsfrage | vergleich → karte → zuordnen → auswahl → buehne → auswahl → reflexion | vier Sorten/vier Pläne – klar, übertragbar |
| 2-05 Blackout-Plan | mythos → karte → studie → zuordnen → umformulieren → auswahl → reflexion | vertieft w-123 mit Wenn-Dann (Beleg A) – nicht gedoppelt |
| 2-06 Geschichten-Vorrat | studie → geschichte → karte → geschichtenbau → zuordnen → auswahl → experiment → reflexion | Carlas Karteikarte trägt; neu und nützlich |
| 3-01 Bogen | vergleich → karte → auswahl → rangfolge → buehne → auswahl → reflexion | „letzter Satz als Notausgang“ – stark |
| 3-02 Unbequeme Frage | studie → karte → kunstgriff → auswahl → umformulieren → dialog → reflexion | ehrlich zum Befund (Ausweichen wirkt oft!); S2/S3 im Dialog |
| 3-03 Erklären für Laien | schaetzen → karte → kern → auswahl → rangfolge → auswahl → experiment → reflexion | gute Belegkette (Rozenblit, Tullis, Eyal); S5/S6 |
| 3-04 Trinkspruch und Dank | mythos → karte → zuordnen → geschichtenbau → auswahl → buehne → Mission | Übertragung von Briefen auf Gesprochenes gekennzeichnet; S7 (Carla) |
| 3-05 Unter Druck | auswahl → studie → karte → dialog → zuordnen → stumm → Mission | gute Verbindung von zeit und jaund; M11/S4 im Dialog |

Alle Einheiten: 7 Minuten, 6–8 Schritte, ≥ 3 Formate, ≥ 2 aktive, erster Schritt weckt Neugier, kein Format zweimal hintereinander, 2–3 Merkkarten, Längen eingehalten (Prüfskript).

## Urteil

**Freigabereif für Davide: nach den 13 Muss-Punkten.** Sie sind alle klein (meist ein `weiter` oder ein `sagt` ändern) und betreffen nur Lagen und Dialoge, eine Lage und zwei beste Antworten mit falschen oder fehlenden Tatsachen. S1 (Ausweichen als `rot`) sollte zusammen mit dem Hauptstrang entschieden und in `08` festgehalten werden, weil w-038 aus Phase 1 mitbetroffen ist. S7 (Carla, Lena, Jule) bitte mit dem Figuren-Abgleich zusammenführen. S14 (fast doppelte Prüfungen) wie in Phase 1 vor der Freigabe für alle.

---

## Umsetzung (26.11.2026)

Alle Änderungen nur in `src/coach/inhalt/stegreif/`; danach `node scripts/coach-index.mjs`. Ergebnis: `node scripts/coach-pruefe.mjs --nur stegreif` → **0 Fehler, 0 Hinweise**; `--soll stegreif` leer. Jeder Weg der geänderten Lagen und Dialoge (l-06 … l-15, 3-02-d, 3-05-b, v-0167, v-0172, v-0223, v-0240, v-0241) wurde mit einem Wege-Skript neu durchlaufen: keine toten Knoten, keine Schleifen, kein Ende, das auf einem Weg etwas Ungesagtes aufgreift.

### Muss

| # | Stand | Umsetzung |
|---|---|---|
| M1 | umgesetzt | l-06 k3: „kein Streit mit zwei wichtigen Lieferanten“. |
| M2 | umgesetzt | l-07: Wahl 1 → neuer Knoten `k1c` (Tarek: „Fehler? Ich mach doch keine. Das ist Misstrauen.“), Wahl A mit Fallschirm → k2, Wahl B „Na ja, ist halt so.“ (`aufgeben`) → ende2. Jetzt kennt Tarek auf jedem Weg zu k2 das Bild. |
| M3 | umgesetzt | l-08 k4 Wahl 2 → ende2. |
| M4 | umgesetzt | l-09 ende1 sagt neutral („knüpft an das an, was du in der Runde erzählt hast“); Bluff → neuer Knoten `k2b` (Zurücknehmen → k3, Weiterbluffen → ende2); Fazit um „Echtes statt Erfundenes“ ergänzt. |
| M5 | umgesetzt | l-11 Lage: „Bisher stehen die Fahrräder im Hausflur.“ |
| M6 | umgesetzt | l-11 k4 Wahl 1 → neues `ende3`. Rat leicht angepasst: „Kein Drama – abgestimmt wird trotzdem. Nur das Ende ist verpufft …“ (der vorgeschlagene Satz „die Fragen hast du gut überstanden“ hätte auf Wegen mit 0- und 1-Wahlen gelobt). |
| M7 | umgesetzt | l-12 ende1: „Gut. Ich probier's.“ |
| M8 | umgesetzt | l-13 k4 Wahl 1 und 3 → neues `ende3` (Dr. Albers hebt die Tasse). |
| M9 | umgesetzt | l-14 k1 Wahl 2 → k1b; k1b sagt „Bitte keine Folien. Ein Satz.“ (passt zu Schnelldurchlauf und Mail). |
| M10 | umgesetzt | l-14 ende1: „Gut. Wir hören voneinander.“ |
| M11 | umgesetzt | 3-05-b k2 Wahl 2 → neues `ende3` („Also keine Zusatzkosten.“, Rat zum Raten im Schwung). |
| M12 | umgesetzt | v-0223 k2: „… woher die Leute kommen.“ |
| M13 | umgesetzt | v-0241 ende1: „Gut. Dann hören wir voneinander.“ |

### Sollte

| # | Stand | Umsetzung |
|---|---|---|
| S1 | umgesetzt | v-0205 und w-038 → `einfluss: "rot"`. v-0205: Erklärung nennt den unfairen Kunstgriff „hier nur zum Erkennen“, warum er nur unbemerkt wirkt, den Preis (Vertrauen), die Abwehr und „Fair ist die Brücke erst nach der Antwort“. w-038: Text entsprechend, Preis/Abwehr bleiben, Beleg jetzt B mit `rogers-norton2011` und `belegHinweis`. Die Entscheidung steht schon in `08` (Lehrplan-Abweichungen) und LIESMICH §7. Keine Einsatz-Übung trainiert das Ausweichen; im Bereich trägt keine Übung mehr `taktik`. **Wertungen vereinheitlicht:** 3-02-d k1 „nach vorn schauen“ jetzt 0/`ausweichen` (wie v-0209); v-0200 „Ihre Zufriedenheit liegt uns am Herzen“ (Antwort auf eine andere Frage) von 1 auf 0/`ausweichen`, dafür neue 1-Antwort „Im Sommer gab es längere Wartezeiten.“ Bewusst gelassen: l-11 k2 „Darüber können wir gern nach der Versammlung reden“ (wert 1) – ein Aufschub mit Angebot, keine Brücke zu einem anderen Thema; die Rückmeldung benennt das Ausweichen schon. |
| S2 | umgesetzt | 3-02-d k1 Wahl 3 → 0/`ausweichen`, Rückmeldung „… So ist es Ausweichen, und Dr. Albers fragt nach.“ (statt „alle merken es“ – das widerspräche Rogers & Norton). Neue Wahl „Zwei Zulieferungen fehlten.“ (1, → k2). Weil auf diesem Weg der späte Hinweis fehlt, sagt Dr. Albers in ende1 nur noch „Gut.“ |
| S3 | umgesetzt | 3-02-d ende1/ende2 wie vorgeschlagen. |
| S4 | umgesetzt | 3-05-b k2b Wahl 1 → k2. |
| S5 | umgesetzt | 3-03-c 4. Eintrag „Probieren Sie es gleich einmal – ich schaue zu.“, warum „Prüfen statt raten …“. |
| S6 | umgesetzt | 3-03-d: „Ein Gesicht verrät dir vielleicht, dass sie unsicher ist – aber nicht, was genau fehlt. Das zeigen erst Fragen oder ihr eigenes Tun.“ |
| S7 | umgesetzt (nach `derCoach/figuren.md`) | 3-04-c namenlos „eine Kollegin, die in Rente geht“ (Apfel bleibt, kein „Carla“ in den Antworten) – Carla steht in l-13 gleich danach wieder im Haus. v-0196 „Abschied einer Kollegin“, ohne Namen (Lena ist neu). l-09: erster Kochkursabend am Donnerstag, die Kursleiterin bittet um die Runde, Jule sitzt daneben und fragt (Teilnehmerin); Rückmeldung „Die Kursleiterin hört mit …“. 3-04-b Muster: „hast du mir gezeigt …“. v-0240: „Die Kursleiterin ist krank, der Donnerstagskurs kocht trotzdem – und du hast den Abend übernommen. Jule ist dabei.“ Zusätzlich v-0148 („Heute machen wir Brot“ klang nach Kursleitung) → „Heute ist Brot dran – endlich! …“. |
| S8 | umgesetzt | v-0172 k2 Rückmeldung wie vorgeschlagen. |
| S9 | umgesetzt | v-0171 Karte 3 „Ja, und wer mag, probiert es gleich aus.“ |
| S10 | umgesetzt | v-0143: Wendung „Ich merkte es erst beim dritten Namen.“; die Schluss-Karte jetzt „Ich habe gelacht, gefragt – und kannte danach alle Namen.“ (wie 2-06-a). |
| S11 | umgesetzt | v-0173, v-0213, v-0244, fc-025 wie vorgeschlagen. |
| S12 | umgesetzt | v-0219 und v-0251: Fakten in den Auftrag („Du weißt: …“), v-0219 M2 „Vorher war die Halle belegt.“; v-0251 zusätzlich „inzwischen ist alles angekommen“ (stand in M2). |
| S13 | umgesetzt | v-0253 zweites Muster (Chor ohne Noten). |
| S14 | umgesetzt | fc-027: jetzt „Grenze vorab selbst nennen“ (neue Fehlerart `zensor`, Abwarten = 1). fc-029: Pannen- statt Vorschlagsfrage (Hallenschlüssel). fc-033: Frage nach dem letzten Satz (Auslaufen = 0). fc-034: Vereinsfahrt teurer, neue Fehlerart `kleinreden`. fc-036: Hausverwaltung und Heizung unter vier Augen, neue Fehlerart `nachgeben`. fc-040: Fehlerarten `auswendig` und `gruebeln` statt „keinen Fehler machen“. l-14 k3: neue Idee „das Paket auch für die zweite Werkstatt“ (passt zu `figuren.md`), neue beste Antwort, Schluss-Satz angepasst. l-11 k3: Spitze jetzt „warum soll auch zahlen, wer gar kein Rad hat?“ – dazu in der Lage „jede Partei bekommt einen Schlüssel – darum zahlen auch alle“, damit die beste Antwort nichts erfindet. (Der Vorschlag „wer haftet …“ hätte in der besten Antwort eine Tatsache verlangt, die nirgends steht.) |
| S15 | umgesetzt | Fazits als Maßstab statt als Zeugnis: l-06 (dazu sagt Dr. Albers „Mittwoch sprechen wir über die zwei.“), l-07, l-12, l-14, l-10 („… schau, welches Stück heute saß und welches noch wackelt“), dazu l-09, l-11, l-13. |
| S16 | umgesetzt | fc-028: Grund in der Frage; warum der 1-Antwort angepasst. |
| S17 | umgesetzt (Angabe gestrichen) | „Vorab registriert“ ließ sich nicht sicher bestätigen: Die Arbeit trägt das Schlagwort „preregistered“, aber welche Versuche vorab registriert waren, ist ohne Volltext nicht klar; auch die Zahl der Versuche ist in den Zusammenfassungen uneinheitlich (Abstract drei, UChicago vier). Darum in `kumar2018`, w-018 und 3-04 (`belegHinweis`) nur noch „Experimente mit Dankesbriefen“, ohne Zahl. |

### Kann

| # | Stand | Umsetzung |
|---|---|---|
| K1 | umgesetzt | „Dann sehen es fast alle.“ |
| K2 | umgesetzt | „… trägt eher auch unter großem.“ |
| K3 | umgesetzt | 2-05 Mythos, `belegHinweis` und Merkkarte m3: „Nervosität“; „oft“ → „manchmal sogar“. |
| K4 | umgesetzt | 2-05-a Karte: „Eine lange Zwischenfrage hat dich weit weggeführt.“ |
| K5 | umgesetzt | In allen Bühnen-Prüflisten, die eine Störung, einen Zuruf, ein Abwinken oder die Uhr voraussetzen, steht jetzt „(falls eine kam)“ bzw. „(falls die Uhr lief)“: 2-04-c, 3-01-c, 3-04-d, v-0103, v-0104, v-0105, v-0188, v-0189, v-0191. |
| K6 | umgesetzt | l-15 „verlässt Ihre Bestellung …“, „eine der schwersten Lagen“. |
| K7 | umgesetzt | „Und ich hätte Sie vorher fragen sollen.“ |
| K8 | umgesetzt | v-0115 M2, v-0116 Karte 2. |
| K9 | umgesetzt | v-0141 M2 mit ehrlichem Schild. |
| K10 | umgesetzt | v-0133: M1 „… manchmal ist der Speicher schlicht zu klein“, M2 „Beim Rechner siehst du die Unordnung erst, wenn du nachschaust.“ |
| K11 | umgesetzt (eigene Fassung) | v-0228 M2: „Wie wenn dir jemand das Geld fürs Fahrrad vorstreckt und du es in kleinen Raten zurückzahlst. Der Unterschied: Die Bank will dafür ein Extra, und das steht vorher fest.“ |
| K12 | umgesetzt | v-0224 „Das Kind deiner Nachbarn …“. |
| K13 | umgesetzt | 3-03-b: beste Antwort spricht vom Link und der echt wirkenden Seite; die 1-Antwort ebenfalls „Link“ statt „Mail“. |
| K14 | umgesetzt | 2-03-d M1: „… hilft dir nur noch, was du vorher als Ersatz hinterlegt hast.“ |
| K15 | umgesetzt | v-0214 „Sobald es raus ist, sage ich es Ihnen.“ |
| K16 | umgesetzt | 3-02-a Lage: „Entschieden ist noch nichts.“ |
| K17 | umgesetzt | v-0107: „im Treppenhaus“, „Ihrer Renovierung“ (auch im `warum`). v-0160 brauchte keine Änderung (kein Zaun, kein Umbau). |
| K18 | umgesetzt (ohne Leiter-Änderung) | 2-01 Karte: „Geht es um eine Panne oder ein schnelles Update ohne Rückblick, nimm die Schwester …“ (m-08). 3-04 Karte: Trinkspruch „– Heute, Gestern, Morgen im Festkleid“ (m-09); dafür „Der Abschluss – Wunsch oder Glas“ gekürzt (Kartenlänge). |
| K19 | umgesetzt | v-0167 k2b Wahl 1 → k2; damit kommt die Nichtwissen-Frage auf jedem Weg zu ende1. |

### Phase-1-Hinweise (Auftrag des Hauptstrangs)

- `einheiten-1.json` (längste Antwort meist falsch): in 1-01-b und 1-06-b je die lange falsche Antwort gekürzt („Eine ausführliche Fassung Wort für Wort auswendig lernen.“, „Abbrechen – wenn nichts mehr kommt, ist die Quelle erschöpft.“). Hinweis weg.
- `vorrat-01.json` (Zweier-Knoten): v-0022 k2 und v-0023 k2 je die schwächere Antwort verlängert. Hinweis weg. Nebenbei v-0022 „Ein anderer Vater“ → „Ein Vater“ (sonst wäre der Nutzer als Vater festgelegt, LIESMICH §5).
- Tests Können/Meisterschaft: Nach den neuen Aufgaben ist die beste Antwort in je höchstens der Hälfte die längste.

### Offen für den Hauptstrang

- `stegreif-fc-022` (Phase 1, Tests): „Dein Neffe fragt …“ – dieselbe Frage wie K12, nicht angefasst, weil nicht beauftragt.
- `stegreif-m-08`/`m-09` (Leiter) bleiben unverändert; die Brücke steht jetzt in den Karten (K18).
