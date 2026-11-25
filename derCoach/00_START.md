# Der Coach – Auftrag an Claude Code

> **Stand 25.11.2026:** Entscheidungen und Korrekturen in [08_ENTSCHEIDUNGEN.md](08_ENTSCHEIDUNGEN.md) gehen dieser Datei vor (u. a. alle 14 Bereiche in Stufe 1, Bereichsseiten, rund 60 Lerntage je Bereich, Staffel, Einfluss-Klassen, korrigierte Zahlen).

Stand: 24.11.2026 · Auftraggeber: Davide · Ausgearbeitet von Claude (Chat) nach Sichtung des Projekts, vier Fragerunden mit Davide und Recherche. Nachträge vom selben Tag: drei weitere Bereiche (Aussprache, Nervosität, Überzeugen & Verkaufen) – in allen Dateien eingearbeitet.

> **Zuerst planen, noch nichts bauen.** Dieser Auftrag beginnt im Planmodus. Lies alles, analysiere den Code, stell deine Rückfragen und leg einen Umsetzungsplan vor. Geändert wird erst nach Davides Freigabe.

## 1. Worum es geht

Im Pausenraum des IT Admin Tools entsteht ein neuer Raum: **„Der Coach“**. Er ersetzt zwei ursprünglich getrennt geplante Mini-Apps (Kommunikation/Rhetorik und Motivation/Selbstbewusstsein) durch **eine** App und soll das Königsstück des Pausenraums werden.

Der Coach trainiert vierzehn frei wählbare Bereiche – von deutlicher Aussprache, Stimme, Smalltalk und Schlagfertigkeit über Überzeugen und Verkaufen, Nervosität, Mut und Selbstbewusstsein bis zu Antrieb und Lebenszielen. Alle Bereiche sind gleichrangig und einzeln abwählbar. Er führt durch eine persönliche **Reise** mit täglichem Training (10, 15 oder 30 Minuten), misst regelmäßig den Stand, erkennt Schwächen und trainiert sie gezielt nach. Entscheidend ist der Dreischritt **verstehen → üben → im echten Leben anwenden**.

**Davides Anspruch.** Der Coach soll mehr vermitteln als ein Regal voller Ratgeber: nur das Beste und Wirksamste aus Forschung und Praxis, so verpackt, dass man weitermachen will – mit einem Aha-Moment in jeder Einheit und sofort anwendbar im Alltag, bei der Arbeit, im Umgang mit Kollegen, Vorgesetzten, Frauen und Männern. Behandle ihn nicht als Mini-App, sondern als vollwertiges Produkt, an dem deine Arbeit gemessen wird: Nimm dir Zeit, sei gründlich und einfallsreich – innerhalb der Stufen und Leitplanken dieses Auftrags.

Später soll der Coach als **eigenständiges Produkt** aus dem Tool herausgelöst werden können. Das prägt die Architektur (siehe `02_TECHNIK.md`, Abschnitt „Host-Adapter“).

## 2. So gehst du vor

1. **Lesen** – alle Dateien in diesem Ordner in der Reihenfolge aus Abschnitt 3.
2. **Code analysieren (Pflicht, vor jedem Vorschlag)** – die bestehenden Räume sind das Vorbild. Lies mindestens:
   - `src/screens/Pausenraum.tsx`
   - `src/italiano/LIESMICH.md`, `src/italiano/inhalt/LIESMICH.md`, `src/brain/LIESMICH.md`, `src/terra/LIESMICH.md`
   - `src/italiano/ParlaItaliano.tsx`, `src/italiano/kern/speicher.ts`, `src/italiano/kern/inhalt.ts`, `src/italiano/kern/kasten.ts`, `src/italiano/kern/serie.ts`, `src/italiano/kurzStand.ts`, `src/italiano/Erinnerung.tsx`
   - `src/brain/kern/wertung.ts`, `src/brain/iq/irt.ts`, `src/brain/ablauf/ohneWiederholung.ts`
   - `electron/brainSpeicher.ts`, `electron/preload.ts`, `src/electronAPI.ts`
   - `src/utils/menuCatalog.ts`, `src/utils/featureRegistry.ts`, `src/types.ts`, `src/App.tsx` (Stellen mit `lazy(` und `Spaeter`)
   - `scripts/italiano-pruefe.mjs`, `scripts/terra-bilder.cjs`, `scripts/italiano-ton-auftrag.mjs`, `scripts/italiano-ton.cjs`
   - `package.json` (Abschnitt `build.files`)
3. **Nachrecherchieren** – siehe Abschnitt 10.
4. **Rückfragen stellen** – die Liste in Abschnitt 11, ergänzt um alles, was dir beim Lesen auffällt.
5. **Plan vorlegen** – Inhalt siehe Abschnitt 7. Danach wartest du auf die Freigabe.
6. **Plan ablegen** – dein erster Schritt nach der Freigabe: Schreib den freigegebenen Plan nach `derCoach/08_UMSETZUNGSPLAN.md`, ganz oben mit einem Abschnitt „Stand“ (erledigt, in Arbeit, als Nächstes, offene Punkte). Schreib den Stand nach jedem Arbeitspaket fort. Die Umsetzung läuft über viele Sitzungen und mit wechselnden Modellen – jede neue Sitzung muss allein aus `00_START.md` und dieser Datei weiterarbeiten können.
7. **Umsetzen in Stufen** (Abschnitt 8), Arbeitspaket für Arbeitspaket. Nach jeder Stufe: Tests, Größenmessung, Abnahmeliste für Davide – und erst dann die nächste Stufe.

## 3. Pflichtlektüre in diesem Ordner

| Datei | Inhalt |
|---|---|
| `00_START.md` | dieser Auftrag |
| `01_KONZEPT.md` | Produktkonzept: Bereiche, Reise, Training, Übungsformate, Coach-Gehirn, Missionen, Kompass, Vorhaben, Optik, Ethik |
| `02_TECHNIK.md` | Einbindung ins Tool, Ordnerstruktur, Datenmodell, Algorithmen, Speicher, Budget, Tests, Stufen im Detail |
| `03_WISSEN_WIRKUNG.md` | Wissensbasis: Stimme, Ausdruck, Gespräche, Smalltalk, Schlagfertigkeit, Stegreif, Menschen lesen, Flirten – dazu **Aussprache** (mit den Schwerpunkten Nuscheln, Lispeln, Stottern) und **Überzeugen & Verkaufen** |
| `04_WISSEN_ANTRIEB.md` | Wissensbasis: Mut, **Nervosität**, Selbstbewusstsein, Antrieb und Ziele, Tiefenblick, Lern- und Motivationsdesign |
| `05_LEHRPLAN.md` | 115 Fähigkeiten, 270 Einheiten (14 Bereiche in drei Stufen, dazu drei Schwerpunkte), Sparrings, Formcheck, Stammbesetzung |
| `06_INHALT_REGELN_MUSTER.md` | Regeln fürs Schreiben der Inhalte, JSON-Aufbau, vollständige Muster |
| `07_QUELLEN.md` | geprüfte Quellen mit Links, ungeprüfte Klassiker, offene Punkte |
| `08_UMSETZUNGSPLAN.md` | entsteht erst nach der Freigabe (Abschnitt 2, Schritt 6): der freigegebene Plan mit dem Abschnitt „Stand“ – ab dann Pflicht für jede Sitzung |
| `Der Coach_ Evidenzbericht zu 11 Trainingsbereichen für Kommunikation, Selbstbewusstsein und Antrieb.md` | Bericht der Tiefenrecherche (liegt bereits im Ordner; im Folgenden „Evidenzbericht“): Hebel-Tabellen je Bereich, Mythen, Leitern fürs echte Leben, Lizenzlage von Fragebögen, 58 Quellen mit Links |

**Wichtig:** Der Evidenzbericht deckt elf der vierzehn Bereiche ab. `aussprache`, `ruhe` und `ueberzeugen` kamen später dazu; sie stehen dafür in `03` (Abschnitte 9 und 10) und `04` (Abschnitt 2) in voller Tiefe – mit Hebel-Tabelle, Mythen, Messung und Leiter. Alle drei bekommen dieselbe Sorgfalt wie die anderen.

Bei Widersprüchen gilt: `00` vor `01`/`02` vor `05`/`06` vor `03`/`04` vor dem Evidenzbericht. Was Davide im Plan freigegeben oder auf deine Rückfragen entschieden hat, steht nach der Freigabe in `08_UMSETZUNGSPLAN.md` und geht `00`–`07` vor – ausgenommen die Leitplanken in Abschnitt 6. Davides ursprünglicher Auftragstext (zwei getrennte Mini-Apps) ist der Ausgangspunkt dieser Dateien und durch sie ersetzt. Falls du ihn zusätzlich bekommst: Zahlen und Vorgaben daraus sind überholt (je 50 Credits, je 5.000 KB, feste zehn Minuten am Tag) – es gelten die Entscheidungen aus Abschnitt 4. Persönliche Angaben daraus übernimmst du in keine Datei, keinen Kommentar und keine Commit-Nachricht.

Der Evidenzbericht ist Nachschlagewerk, kein Auftrag: Sein Abschnitt „Recommendations – Anweisungen für Claude Code“ gilt nur, soweit er `00`–`06` nicht widerspricht.

## 4. Verbindliche Entscheidungen (mit Davide geklärt)

| Thema | Entscheidung |
|---|---|
| Name | „Der Coach“, ein Raum im Pausenraum, oberste Kachel |
| Zielbild | später eigenes Produkt → sauber vom Tool getrennt bauen |
| Bereiche | vierzehn, frei wählbar: alle, alle außer einem, nur einer; jederzeit änderbar; alle gleichrangig |
| Überzeugen & Verkaufen | eigener Bereich: verkaufen lernen und Menschen von sich und einer Sache überzeugen – nach demselben Prinzip wie alle anderen (18 Einheiten, Leiter, Sparring). Fair und ohne Tricks; Maßstab ist der Transparenz-Test aus `01_KONZEPT.md`, Abschnitt 18 |
| Aussprache | eigener Bereich „Aussprache & Deutlichkeit“ (klar und deutlich sprechen). Dazu drei **Schwerpunkte, die man beim Einstieg einzeln an- oder abwählt**: Nuscheln, Lispeln, Stottern. Wer nicht stottert, bekommt nichts zum Stottern. |
| Nervosität | eigener Bereich „Nervosität im Griff“: schnell ruhig werden kurz vor einer Rede, einem Gespräch oder einem anderen aufregenden Moment |
| Einstieg | kurze Einführung, dann Bereichswahl |
| Tägliche Dauer | 10, 15 oder 30 Minuten, täglich umstellbar; einzelne Übungen und Tests jederzeit frei wählbar |
| Coach-Figur | eine feste Figur: erfahrener Trainer, Mann um die 55, Boxtrainer-Ausstrahlung – ruhig, wach, hat alles gesehen |
| Coach-Ton | vom Nutzer wählbar: ruhig, klar (sportlich-direkt), trocken (humorvoll) |
| Optik | „Trainingscamp“: kraftvoll, kontrastreich, Energie wie im Boxgym |
| Spielanteil | dezent (Serie, Fortschritt je Bereich), dazu eine **sichtbare Reise** |
| Coach-Gehirn | der Coach lernt den Nutzer kennen: regelmäßige Tests und Selbsteinschätzungen, erkennt Defizite, trainiert sie verstärkt nach; Motivation hoch halten, nie langweilig, nie nervig |
| Echtes Leben | sanfte, selbst gewählte Leiter **plus** freiwillige harte Ablehnungs-Challenges |
| Sichtbarkeit | **nichts** ist für Kollegen sichtbar – kein Level, keine Rangliste |
| Mikrofon | Sprech-Übungen mit lokaler Auswertung, aber **selten** und immer überspringbar („gerade nicht allein“). Ausnahme siehe Abschnitt 5, „Laut üben“ |
| Flirten | eigener Bereich „Kennenlernen & Flirten“, **opt-in**, für alle Geschlechter, respektvoll, ohne Manipulationstechniken |
| Budget Higgsfield | höchstens **100 Credits** für Bilder und Ton zusammen |
| Budget Größe | Davide hat das Limit gelockert: **Richtwert 15 MB, Obergrenze 20 MB** zusätzliche Installer-Größe; nach jeder Stufe messen und melden |
| Inhalte | Claude (Chat) liefert Wissensbasis, Lehrplan und Muster; **du schreibst die übrigen Inhalte** nach `06_INHALT_REGELN_MUSTER.md` und recherchierst nach |

## 5. Annahmen (nicht ausdrücklich bestätigt – im Planmodus kurz rückfragen)

| Thema | Annahme |
|---|---|
| Stimme des Coaches | vertont werden nur ausgewählte Teile: geführte Atem- und Vorstellungsübungen, Hörbeispiele für Betonung, Pausen und Tonfall |
| KI-Feedback | alles läuft offline mit Musterlösungen und Kriterien; die Stelle für späteres KI-Feedback wird als Schnittstelle vorgesehen, aber nicht angeschlossen |
| Erinnerungen | Karte unten rechts im Tool (wie bei Parla Italiano); eine Windows-Benachrichtigung ist als Option vorhanden und standardmäßig aus |
| Laut üben | In `aussprache` (und bei den Atem- und Sprechübungen in `ruhe`) ist lautes Sprechen der Kern – die Regel „Sprech-Übungen selten“ gilt dort nicht. Dafür gibt es einen Schalter „Ich kann gerade laut sprechen“; ist er aus, kommt zu jeder lauten Übung eine leise Ersatzübung. Aufnehmen bleibt freiwillig. |
| Schwerpunkt Stottern | Ist er gewählt, laufen Sprech-Übungen in der ganzen App ohne Zeitdruck (keine Stoppuhr, kein Tempo-Urteil). Ziel ist leichteres, freieres Sprechen – nicht „fehlerfrei“. |
| Reihenfolge | Die beiden neuen Bereiche kommen in Stufe 1 (zusammen mit `konter`), `smalltalk` und `mut` rücken in Stufe 2 |
| Umsetzung | in sechs Stufen, nicht in einem Durchlauf |
| Name der Figur | „Bruno“ (Vorschlag); Alternativen: „Hannes“, „Kalle“ |
| Sprache | Deutsch, Du-Form; Texte liegen in Inhaltsdateien, damit später eine Übersetzung möglich ist |

## 6. Leitplanken (nicht verhandelbar)

**Technik**
- Alles liegt unter `src/coach/`. Von außen wird nur über `src/coach/host/` zugegriffen. Erlaubte Importe sonst: `react`, `lucide-react`, `zustand` und eigene Dateien.
- Keine neuen npm-Pakete. Kein Netzwerk zur Laufzeit. Nichts aus `src/coach/` landet im Hauptpaket (Nachladen wie bei Parla Italiano).
- Benutzerdaten nur lokal und verschlüsselt über `electron/brainSpeicher.ts` (neue Ablage `coach`). Nichts auf dem Netzlaufwerk.
- TypeScript ohne `any`. Benennungen, Kommentare und Texte auf Deutsch, wie in den anderen Räumen.
- Farben nur über eigene Variablen `--dc-…` unter `.dc-app`; hell und dunkel müssen beide stimmen.
- Kennungen von Inhalten sind eingefroren, sobald sie ausgeliefert sind (der Lernstand hängt daran).
- Andere Räume werden nicht verändert, außer an den in `02_TECHNIK.md` genannten Stellen.
- Kein `git commit`, kein `git push` ohne Auftrag. Der Ordner `derCoach/` wird nicht eingecheckt, bevor Davide entschieden hat, ob das Konzept ins Repository darf.

**Inhalt**
- Ehrlich: Jede Aussage trägt eine Beleg-Stufe (A, B, P, D, U – siehe `06`). Zahlen nur mit Quelle aus `07_QUELLEN.md` oder nach eigener Prüfung; sonst ohne Zahl formulieren. Keine Heilsversprechen.
- **Sprechen und Redefluss:** Die Schwerpunkte Lispeln und Stottern ersetzen keine Logopädie (Sprech- und Sprachtherapie). Kein Heilversprechen, keine Diagnose, kein „Stotter-Zähler“. Jeder Schwerpunkt nennt den Weg zur Fachperson und zur Selbsthilfe. Plötzlich verwaschene Sprache ist ein Notfall (112) – dieser Hinweis steht im Bereich `aussprache` gut sichtbar. Einzelheiten in `01_KONZEPT.md`, Abschnitt 18, und `03`, Abschnitt 9.
- Der Coach ist Training, keine Therapie. Kein klinischer Fragebogen, keine Diagnose. Fremde Fragebögen nur mit Lizenz – Standard sind eigene Formulierungen (Lizenzlage im Evidenzbericht, Abschnitt „Messung und Lizenzen“).
- Keine Manipulationstechniken, nirgends. Für die Bereiche Flirten und Überzeugen & Verkaufen gelten die Regeln aus `01_KONZEPT.md`, Abschnitt 18: Druck, falsche Knappheit, erfundene Belege und andere Verkaufstricks werden nur gelehrt, damit man sie erkennt und abwehrt.
- Eigene Formulierungen: keine wörtlichen Übernahmen aus Büchern, keine echten Personen, keine Marken.
- Bürotauglich. Erinnerungen und Kachel zeigen standardmäßig nichts Persönliches („Diskret-Modus“).

## 7. Was dein Plan enthalten muss

1. **Befund** – was du im Code vorgefunden hast und welche Muster du übernimmst (mit Dateipfaden).
2. **Abweichungen** – wo du von `02_TECHNIK.md` abweichen willst und warum.
3. **Datenmodell** – endgültige Typen für Inhalte und Lernstand.
4. **Stufenplan** – je Stufe: Dateien, Lieferumfang, Tests, erwartete Größe, Credits. Teile jede Stufe in Arbeitspakete, die in eine Sitzung passen, und kennzeichne jedes als **Routine** (klar beschrieben, nach vorhandenem Muster) oder **anspruchsvoll** (Entwurfsentscheidung, Rechenregeln, heikle Inhalte). Davide wählt danach Modell und Denkaufwand.
5. **Inhaltsplan** – welche Einheiten, Pools und Missionen in welcher Stufe entstehen; wie du Qualität sicherst (Prüfskript, Stichproben, Quellen).
6. **Recherche-Ergebnis** – was du nachgeprüft hast, was du geändert hast, was offen bleibt.
7. **Risiken** – mit Gegenmaßnahme.
8. **Rückfragen** – offene Entscheidungen für Davide.

## 8. Stufen im Überblick

| Stufe | Ziel | Kern |
|---|---|---|
| 1 Fundament | spielbar | Gerüst, Einstieg mit Schwerpunkt-Wahl, Heute, Trainings-Lauf mit den fünfzehn Grundformaten, einfaches Aufnehmen und Anhören, Notfallkoffer v1, Serie, Reise v1, Erinnerung; Inhalte Stufe 1 für `konter`, `ruhe`, `aussprache` und die drei Schwerpunkte; erste drei Bilder |
| 2 Coach-Gehirn | er lernt dich kennen | Fähigkeiten-Schätzung, Einstufung, Formcheck, Sparring, adaptiver Planer, „Ecke“; Inhalte Stufe 1 für alle übrigen Bereiche |
| 3 Echtes Leben | Transfer | Missionen und Leitern, harte Challenges, Notfallkoffer vollständig mit Ernstfall-Fahrplan und Startroutine, Nachbereitung, persönliche Schätze, Gesprächskarte; Inhalte Stufe 2 |
| 4 Antrieb | Ziele und Vorhaben | Kompass, Vorhaben mit Erinnerungen, Erfolgsbuch, Durchhänger-Logik |
| 5 Stimme, Bild, Ton | Sinne | Auswertung der Aufnahmen (Tempo, Pausen, Satzende), Vorher-Nachher-Vergleich, Bühne, Bilder fürs Menschen-Lesen, Ton |
| 6 Meisterschaft | rund | Inhalte Stufe 3, Bibliothek, Barrierefreiheit, Export/Löschen, Budget-Abnahme, Ablöse-Prüfung |

Einzelheiten: `02_TECHNIK.md`, Abschnitt 13.

## 9. Abnahme je Stufe

- `npx tsc -p tsconfig.electron.json` und `npx vite build` laufen fehlerfrei.
- Logiktests unter `.tmp-test/coach/` sind grün; neue Logik hat Tests.
- `node scripts/coach-pruefe.mjs` meldet 0 Fehler.
- `node scripts/coach-groesse.mjs` zeigt den Stand gegen das Budget (Größe und Credits).
- Oberflächen-Szenen (headless Electron, wie bei den anderen Räumen) für die neuen Bildschirme, hell und dunkel.
- `src/coach/LIESMICH.md` ist aktuell.
- Eine kurze Abnahmeliste für Davide: Was ist neu, wie probiert er es aus, was ist offen.

## 10. Recherche-Auftrag an dich

Die Wissensbasis ist gründlich, aber nicht lückenlos. Bevor du Inhalte einer Stufe schreibst:

1. Lies die Abschnitte des Bereichs in `03`/`04` und im Evidenzbericht und die Einträge in `07`.
2. Prüfe jede Zahl und jede Studienaussage, die du in einen Inhalt übernehmen willst, an der Quelle. Was in `07` unter „ungeprüft“ oder „aus der Tiefenrecherche“ steht, **musst** du vor Verwendung nachschlagen.
3. Suche gezielt nach Neuerem und nach Widerspruch (Replikationen, Meta-Analysen). Die offenen Punkte stehen in `07`, Abschnitt D.
4. Vertiefe dort, wo die Wissensbasis dünn ist: deutsche Sprechwissenschaft (Stimme, Artikulation), Stilkunde, Schlagfertigkeit (nur Technik-Systematik, eigene Beispiele), Körpersprache-Bündel, Speed-Dating-Forschung, Aufschieben, Erinnerungs-Gestaltung.
5. **Für `aussprache`, `ruhe` und `ueberzeugen` gibt es keinen Evidenzbericht.** Für `ueberzeugen` heißt das: Verkaufsforschung (anpassendes Verkaufen, Zuhören, Bedarfsfragen), Überzeugungsforschung (zweiseitige Botschaften, Wahlfreiheit, Einfluss-Prinzipien samt gescheiterter Wiederholungen), Verhandeln, Selbstdarstellung im Vorstellungsgespräch. Recherchiere in allen dreien besonders gründlich nach, bevor du Inhalte schreibst: die S3-Leitlinie Redeflussstörungen (sie wird gerade überarbeitet – nimm die gültige Fassung), deutsche Fachliteratur zur Therapie des Lispelns bei Erwachsenen, Sprecherziehung zum deutlichen Sprechen, Forschung zu deutlichem Sprechen („clear speech“), zu Lampenfieber, Atemtechniken, Umdeuten von Aufregung und Startroutinen. Die offenen Fragen stehen in `07`, Abschnitt D.
6. Trag neue Quellen in `07_QUELLEN.md` ein und passe Beleg-Stufen an. Wenn Recherche einer Vorgabe aus `01`–`06` widerspricht: nicht stillschweigend ändern, sondern Davide vorlegen.

## 11. Rückfragen, die du im Planmodus stellst

1. Stimmen die Annahmen aus Abschnitt 5?
2. Soll die Figur „Bruno“ heißen? Soll Davide die Figur vor der Bildproduktion aus vier Entwürfen wählen (rund 3 Credits)?
3. Stehen dir die Higgsfield-Werkzeuge in deiner Sitzung zur Verfügung? Wenn nicht: Du erzeugst Auftragsdateien, Davide lässt sie in Claude (Chat) ausführen.
4. Reihenfolge der Bereiche: Stufe 1 mit `konter`, `ruhe`, `aussprache` (samt Schwerpunkten), danach `smalltalk`, `mut`, `ueberzeugen`, `stegreif`, `gespraech`, `selbst`, `antrieb`, `stimme`, `ausdruck`, `lesen`, `flirten` – passt das?
5. Darf `derCoach/` ins Git-Repository, oder soll der Ordner in `.gitignore`?
6. Soll der Coach für alle Benutzer sichtbar starten oder zunächst nur für Davide (Menü-Sichtbarkeit)?
7. Gibt es Wörter oder Themen, die Davide im Coach nicht haben möchte?
8. Die beiden neuen Bereiche teilen sich das Budget von 100 Credits (vier Bilder, zwei geführte Übungen und zehn Vorsprech-Sätze durch Umschichtung). Reicht das, oder sollen dafür rund 20 Credits dazukommen?
9. Dürfen Vergleichsaufnahmen der eigenen Stimme gespeichert werden (bis zu acht, lokal und verschlüsselt), oder soll gar nichts gespeichert werden?

## 12. Start

Empfohlen ist ein Start direkt im Planmodus. Der Text für Claude Code (ohne Umlaute, nach Projektkonvention):

```
Lies derCoach/00_START.md vollstaendig und halte dich genau daran. Bleib im Planmodus: erst lesen, Code analysieren, nachrecherchieren, Rueckfragen stellen und einen Umsetzungsplan vorlegen. Noch nichts aendern.
```

Für jede spätere Sitzung der Umsetzung – nach der Freigabe, sobald `08_UMSETZUNGSPLAN.md` existiert:

```
Lies derCoach/00_START.md und derCoach/08_UMSETZUNGSPLAN.md vollstaendig. Arbeite das naechste offene Arbeitspaket aus dem Abschnitt "Stand" ab, pruefe es (Abschnitt 9, soweit es das Paket betrifft), schreib den Stand fort und halt dann an.
```
