# Gegenlesen: `src/coach/inhalt/leben.json` (Stufe 2 – Echtes Leben)

Stand 25.11.2026 · unabhängig gegengelesen gegen `kern/inhaltTypen.ts`, `kern/leben.ts`, `inhalt/LIESMICH.md`,
`derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/01_KONZEPT.md` (§10–13, §17, §18), `derCoach/06_INHALT_REGELN_MUSTER.md`
(§1–3, §13, §15), `derCoach/04_WISSEN_ANTRIEB.md`. Die Datei wurde **nicht** geändert.

Pfade: `vorhaben[i]` in der Reihenfolge der Datei (0 bewegung · 1 partnerschaft · 2 freunde · 3 lesen · 4 sprache ·
5 schlaf · 6 ordnung · 7 papierkram · 8 vorsorge · 9 weiterbildung · 10 kreatives · 11 draussen · 12 bildschirm ·
13 freundlichkeit · 14 herzensprojekt · 15 eigene).

**Ergebnis: 3 muss · 12 sollte · 17 kann.**

---

## Ohne Befund geprüft

- **Aufbau:** 16 Kategorien, 152 Ideen (15 × 10 + 2 bei „eigene“), je 6–8 Impulse; alle Ideen mit `titel`, `kleinster`,
  `wennDann`, `hindernis`. Kategorien decken die Liste aus `01` §13 vollständig ab. Alle 16 `zeichen` sind in der
  eingebauten lucide-react-Version vorhanden.
- **Erinnerungen:** 7 Arten × 3 Schärfen × je 7 Texte. Jeder Text der Arten `wennDann`, `kleinster`, `idee`,
  `rueckblick` enthält seinen Pflicht-Platzhalter; kein Platzhalter steht in der falschen Art; keine unbekannten
  Platzhalter. **`{name}`:** alle 25 Vorkommen stehen nach Komma am Satzende/vor Satzzeichen; mit dem Entfernen aus
  `waehleErinnerung` entsteht in allen Fällen ein korrekter Satz (maschinell geprüft), mit Namen ebenso. Kein `{name}`
  am Satzanfang.
- **Bereichsnamen in Erinnerungen:** keiner (nur „in Ruhe“ als Allerweltswort, „Auftritt“ s. K14).
- **Typen:** alle Kompass-Schritte gültig (`karte`, `lebensrad`, `reflexion`, `werte` mit `waehle: 5`, `wenndann`,
  `schreibreise` mit `insBuch: "kompass"`, `woop` mit vollständigem `beispiel`, `geschichte` mit `figur`). Figuren
  „Tante Renate“ und „Carla Demir“ stehen in `besetzung.json` und passen zu ihrer Rolle. `kompass.lebensrad` und
  `kompass.werteKarten` sind identisch mit den Listen in Station 1 bzw. 2. Pyramide: alle fünf `feld`-Werte genau
  einmal; `wochenCheck` passt in der Reihenfolge zu `Ziel.checks` (voran / hindert / nächster). Wenn-Dann-Vorschläge
  ergeben mit `Wenn ${wenn}, dann ${dann}` (Plan.tsx) korrekte Sätze.
- **Notfall:** alle sechs `ErnstfallArt` vorhanden, jede mit den sechs Etappen in richtiger Reihenfolge und genau drei
  Auswertungsfragen (die „drei Fragen“ aus den Danach-Schritten passen). Inhalt folgt `01` §11 und `04` (Woche: echte
  Bedingungen + Pannen-Pläne; Vortag: erster/letzter Satz; Stunde: Kaffee, Bewegung, Raum; fünf Minuten: runterfahren;
  Minute: Startroutine; danach: drei Fragen, dann Schluss). Umdeuten nur als Selbstgespräch („mein Körper macht sich
  bereit“, „also bereit“) – kein Leistungsversprechen. Vorstellungsgespräch entspricht der Korrektur aus `08`.
  Keine Medikamente, keine Rufnummern.
- **Sprache:** keine verbotenen Wörter, keine geraden Anführungszeichen, alle „…“ und ‚…‘ paarig, keine doppelten
  Leerzeichen, „Sie“ nur in wörtlicher Rede (`notfall[3]…vortag`) bzw. als Pronomen.
- **Mutproben:** alle 20 privat, keine am Arbeitsplatz, keine Täuschung, kein Festhalten, kein Flirt (Ausnahme-Risiko
  s. M3); fast überall „ein Nein ist in Ordnung“ bzw. „kein Nachhaken“; jede mit `halb` und `warum`.
- **Arschtritt-Ton:** frech, Box-Bildsprache, nie über Körper, Leistung oder Charakter, keine Beleidigung, kein
  Bodyshaming. Nur Feinheiten unter K8.

---

## muss

### M1 – Forschungszahlen ohne verknüpfte Quelle

LIESMICH §5: „Zahlen und Prozente nur mit einer Quelle, die `"geprueft": true` trägt.“ `Leben`/`KompassStation`
haben gar kein Feld `quellen`; die Spanne „fast ein Jahr“ stammt aus Singh u. a. 2024 (in `04` als `singh2024`
zitiert), diese Quelle ist in keiner `quellen.json` angelegt. `lally2010` (geprüft) trägt nur „meist um zwei Monate“
(Median 66 Tage, Spanne 18–254).

- `kompass.stationen[6].schritte[2].text`
  Zitat: „Neue Gewohnheiten brauchen meist um die zwei Monate, bis sie von selbst laufen – bei manchen viel kürzer, bei
  anderen fast ein Jahr. Die „21 Tage“ sind ein Mythos. …“
  Ersatz (Weg A, bevorzugt): in `inhaltTypen.ts` `KompassStation` um `quellen?: string[]` erweitern, an Station 7
  `"quellen": ["lally2010", "singh2024"]`, `singh2024` in `antrieb/quellen.json` anlegen (Singh, Manikandan, Fernandes
  u. a. 2024, Healthcare 12(23), 2488 – vor `"geprueft": true` nachschlagen). Text dann unverändert.
  Ersatz (Weg B, ohne Typänderung): „Neue Gewohnheiten brauchen meist Wochen bis Monate, bis sie von selbst laufen – bei
  manchen geht es schneller, bei anderen dauert es viel länger. Die „21 Tage“ sind ein Mythos. Ein ausgelassener Tag ist
  egal; wichtig ist, am nächsten wieder einzusteigen. Dabei hilft der Wochen-Check: Er fragt einmal pro Woche, was
  voranging.“
- `erinnerungen.spruch.normal[3]` (Erinnerungen können keine Quelle tragen)
  Zitat: „Gewohnheiten brauchen meist um die zwei Monate. Jeder Tag zählt mit.“
  Ersatz: „Gewohnheiten brauchen Wochen, nicht Tage. Jeder Tag zählt mit.“

### M2 – Mutproben mit Fremden ohne Ausschluss Minderjähriger

`01` §18: „nichts mit Minderjährigen“. Drei Mutproben richten sich an beliebige fremde Personen.

- `mutproben[2].auftrag` (mut-p-03)
  Zitat: „Bitte an einem Aussichtspunkt oder vor einer Sehenswürdigkeit eine fremde Person, ein Foto von dir oder euch zu
  machen. …“
  Ersatz: „Bitte an einem Aussichtspunkt oder vor einer Sehenswürdigkeit eine erwachsene fremde Person, ein Foto von dir
  oder euch zu machen. Biete an, danach auch eins von ihr zu machen. Ein Nein ist völlig in Ordnung.“
- `mutproben[1].auftrag` (mut-p-02)
  Zitat: „Bitte im Kino, Theater oder Konzert vor Beginn eine Person, einen Platz weiterzurücken, …“
  Ersatz: „Bitte im Kino, Theater oder Konzert vor Beginn eine erwachsene Person, einen Platz weiterzurücken, damit du
  neben deiner Begleitung sitzen kannst. Einmal fragen, bei Zögern sofort: „Kein Problem, danke!““
- `mutproben[13].auftrag` (mut-p-14)
  Zitat: „Wirf einer Straßenmusikerin oder einem Straßenmusiker etwas in den Hut und frag nach einem Wunschlied. …“
  Ersatz: „Frag eine erwachsene Straßenmusikerin oder einen erwachsenen Straßenmusiker nach einem Wunschlied und wirf
  etwas in den Hut – egal, ob sie es spielen. Ein Nein ist völlig in Ordnung.“ (löst zugleich K10a)

### M3 – mut-p-06 kann zum Bedrängen oder zum verdeckten Flirt werden

`01` §18: „niemand wird … bedrängt“, „kein Nachhaken nach einem Nein“; Flirt-Regeln gelten nur in `flirten`. „Eine
Person, die du seit Jahren nicht gesehen hast“ schließt frühere Partner, Schwärme und Menschen ein, die den Kontakt
bewusst beendet haben; das Nachhaken ist nicht ausgeschlossen.

- `mutproben[5].auftrag`
  Zitat: „Schreib einer Person, die du seit Jahren nicht gesehen hast, und schlag ein Treffen auf einen Kaffee vor. Ohne
  lange Erklärung, warum du dich jetzt meldest.“
  Ersatz: „Schreib einer früheren Freundin, einem früheren Freund oder jemandem aus Schule, Verein oder Nachbarschaft,
  die oder den du seit Jahren nicht gesehen hast, und schlag ein Treffen auf einen Kaffee vor – nicht an jemanden, der
  den Kontakt bewusst beendet hat, und keine frühere Beziehung. Ohne lange Erklärung. Eine Nachricht, kein Nachhaken.“
- `mutproben[5].warum` dazu passend
  Zitat: „… und erlebst oft, dass sie doch kommt.“
  Ersatz: „Du hältst aus, dass eine Antwort ausbleiben kann – und merkst, dass du danach trotzdem gut weitermachst.“

---

## sollte

### S1 – Rückblick-Texte unterstellen „diese Woche noch nichts“, der Code prüft das nicht

`waehleErinnerung` wählt `rueckblick`, sobald `letzteWoche > 0` – auch wenn das Vorhaben in dieser Woche schon erledigt
wurde (Kandidat bleibt, solange `dieseWoche < proWoche`). Dann sind folgende Texte falsch:

| Pfad | Zitat | Ersatz |
|---|---|---|
| `erinnerungen.rueckblick.sanft[3]` | „Letzte Woche {anzahl}-mal, {name}. Heute vielleicht das erste Mal in dieser Woche?“ | „Letzte Woche {anzahl}-mal, {name}. Heute wieder?“ |
| `erinnerungen.rueckblick.normal[0]` | „Letzte Woche {anzahl}-mal – heute Nummer eins?“ | „Letzte Woche {anzahl}-mal – heute die nächste?“ |
| `erinnerungen.rueckblick.normal[2]` | „Bilanz der letzten Woche: {anzahl}-mal. Diese Woche beginnt jetzt.“ | „Bilanz der letzten Woche: {anzahl}-mal. Daran kannst du heute anknüpfen.“ |
| `erinnerungen.rueckblick.normal[3]` | „Letzte Woche {anzahl}-mal, {name}. Machst du diese Woche auf?“ | „Letzte Woche {anzahl}-mal, {name}. Heute wieder dabei?“ |
| `erinnerungen.rueckblick.arschtritt[0]` | „Letzte Woche {anzahl}-mal. Das war kein Zufall. Nummer eins, los!“ | „Letzte Woche {anzahl}-mal. Daran knüpfst du an. Nächste Runde, los!“ |

Alternative ohne Textänderung (Hinweis an den Hauptstrang, `kern/leben.ts` Z. 92): Bedingung um
`&& dieseWoche(v, heute) === 0` ergänzen – so ist es im Beispiel aus `01` §13 gemeint („heute Nummer eins?“).

### S2 – Wenn-Dann-Erinnerungen behaupten, dass der Auslöser heute (gleich) kommt

Die Erinnerung kommt nach Wochenziel (Vorgabe 3×, mindestens 1×) und Zeitfenster, nicht nach dem Auslöser. Viele Ideen
haben seltene Auslöser (Monatsanfang, Geburtstag, Zeitumstellung, s. K1); dann wird z. B. „Der Auslöser kommt heute
bestimmt. Wenn ich Geburtstag habe, dann …“ angezeigt – sachlich falsch.

| Pfad | Zitat | Ersatz |
|---|---|---|
| `erinnerungen.wennDann.normal[1]` | „Der Auslöser kommt heute bestimmt. {wennDann}“ | „Halt heute Ausschau nach deinem Auslöser. {wennDann}“ |
| `erinnerungen.wennDann.normal[2]` | „Heute gilt: {wennDann}“ | „Dein Plan gilt weiter: {wennDann}“ |
| `erinnerungen.wennDann.arschtritt[3]` | „Der Moment kommt. Du bist bereit. {wennDann}“ | „Wenn der Moment kommt, bist du bereit. {wennDann}“ |
| `erinnerungen.wennDann.arschtritt[6]` | „Der Auslöser klopft gleich an. Mach auf: {wennDann}“ | „Klopft der Auslöser an, machst du auf: {wennDann}“ |

### S3 – Satzbruch bei selbst geschriebenem kleinsten Schritt

`erinnerungen.kleinster.arschtritt[5]` ist der einzige Text mit Wörtern **nach** einem Platzhalter. Der Platzhalter im
Formular (`Vorhaben.tsx` Z. 136: „z. B. Laufschuhe anziehen und einmal um den Block“) lädt zu Einträgen ohne Punkt ein
→ „Hopp! Laufschuhe anziehen und einmal um den Block Danach darfst du wieder sitzen.“
Zitat: „Hopp! {kleinster} Danach darfst du wieder sitzen.“
Ersatz: „Hopp! Zwei Minuten, dann hast du's hinter dir: {kleinster}“ (löst zugleich K8c)

### S4 – „Probier mal: Probier …“

`erinnerungen.idee.normal[2]` „Probier mal, {name}: {idee}“ trifft auf sechs Impulse, die selbst mit „Probier“
beginnen (`vorhaben[0].impulse[0]`, `[3].impulse[4]`, `[5].impulse[0]`, `[5].impulse[6]`, `[10].impulse[7]`,
`[11].impulse[5]`) → „Probier mal: Probier eine neue Spazierrunde …“.
Ersatz: „Ein Vorschlag, {name}: {idee}“

### S5 – Partnerschafts-Impulse in Ihr-Form

LIESMICH §5 verlangt Du-Form; die Impulse landen in Du-Rahmen („Probier mal: Kocht zusammen …“, „Nur ein Vorschlag:
Macht einen Spaziergang …“).

| Pfad | Zitat | Ersatz |
|---|---|---|
| `vorhaben[1].impulse[0]` | „Kocht zusammen ein Gericht aus einem Land, in dem ihr noch nie wart.“ | „Schlag vor, zusammen ein Gericht aus einem Land zu kochen, in dem ihr noch nie wart.“ |
| `vorhaben[1].impulse[1]` | „Macht einen Spaziergang an einen Ort, an dem ihr früher oft wart.“ | „Schlag einen Spaziergang an einen Ort vor, an dem ihr früher oft wart.“ |
| `vorhaben[1].impulse[3]` | „Plant einen Abend ohne Bildschirm: Spiel, Musik, Gespräch.“ | „Plan einen gemeinsamen Abend ohne Bildschirm: Spiel, Musik, Gespräch.“ |
| `vorhaben[1].impulse[6]` | „Schaut euch den Sonnenuntergang an einem schönen Platz an.“ | „Lade zum Sonnenuntergang an einem schönen Platz ein.“ |
| `vorhaben[1].impulse[7]` | „Lest euch gegenseitig eine Seite aus einem Buch vor, das ihr mögt.“ | „Lies eine Seite aus einem Buch vor, das ihr beide mögt – und lass dir eine vorlesen.“ |

### S6 – „Zweimal wird zur neuen Gewohnheit“ ist nicht belegt

`lally2010` (geprüft) trägt nur: einmal Auslassen schadet nicht wesentlich. Die zweite Hälfte ist eine Faustregel
(in `04` Z. 209 ohne Beleg-Stufe), hier als Tatsache formuliert.
Pfad: `erinnerungen.spruch.normal[1]`
Zitat: „Einmal auslassen ist egal. Zweimal wird leicht zur neuen Gewohnheit.“
Ersatz: „Einmal auslassen ist egal. Wichtig ist, dass du beim nächsten Mal wieder einsteigst.“

### S7 – „Erzähl von deinem Ziel“ widerspricht der eigenen Quelle `gollwitzer2009`

`gollwitzer2009` (in den Quellen des Coachs): Wird eine Absicht, die zum Selbstbild gehört, von anderen bemerkt, setzt
man sie im Schnitt **weniger** um; `04` führt „Wer es öffentlich ankündigt, zieht es durch“ als Mythos. Nachfragen
lassen (Fortschritt berichten) ist dagegen unbedenklich.

| Pfad | Zitat | Ersatz |
|---|---|---|
| `kompass.stationen[6].schritte[4].dann[2]` | „erzähle ich einer Person von meinem 90-Tage-Ziel“ | „bitte ich eine Person, mich in einer Woche nach meinem Wochenschritt zu fragen“ |
| `vorhaben[15].impulse[3]` | „Erzähl einer Person, was du dir vorgenommen hast.“ | „Bitte eine Person, dich in einer Woche zu fragen, wie es läuft.“ |
| `vorhaben[14].impulse[3]` | „Erzähl einer Person, warum dir das Projekt wichtig ist.“ | „Zeig einer Person, die es gut mit dir meint, einen ersten Zwischenstand.“ |

### S8 – „Ein bis zwei Minuten lang ausatmen“: wörtlich unmöglich, ohne Schwindel-Hinweis

Fünf der sechs Abläufe sagen nur „Ein bis zwei Minuten lang ausatmen.“ – das liest sich wie ein einziger Atemzug von
zwei Minuten. `06` §3 (`ruhe`, der Bereich trainiert den Notfallkoffer): Atemübungen tragen „Bei Schwindel aufhören und
normal atmen“.

- `notfall[0].etappen[3].schritte[0]` „Ein bis zwei Minuten lang ausatmen – länger aus als ein.“
- `notfall[1…5].etappen[3].schritte[0]` „Ein bis zwei Minuten lang ausatmen.“
  Ersatz (alle sechs): „Ein bis zwei Minuten ruhig atmen, dabei länger aus als ein. Wird dir schwummrig: normal
  weiteratmen.“

### S9 – falsches Wort „blinzeln“

Pfad: `vorhaben[8].ideen[3].wennDann`
Zitat: „Wenn mir auffällt, dass ich beim Lesen blinzle, dann mache ich innerhalb einer Woche einen Termin.“
(„blinzeln“ = mit den Lidern zucken; gemeint ist das Zusammenkneifen.)
Ersatz: „Wenn mir auffällt, dass ich beim Lesen die Augen zusammenkneife oder den Text weiter weghalte, dann mache ich
innerhalb einer Woche einen Termin.“

### S10 – Etappen „Stunde“, „fünf“, „Minute“ und „Danach“ erscheinen alle am Morgen des Termins (Code)

Hinweis an den Hauptstrang, nicht an die Datei: `ETAPPE_TAG` in `kern/leben.ts` setzt `stunde`, `fuenf`, `minute` auf
Tag 0 und `danach` auf [0, 2]; `Ernstfall.zeit` wird nicht genutzt. Am Tag des Termins stehen damit „Danach – Tu dir
etwas Gutes. Du hast es gemacht.“ und (über `auswertungOffen`, `<=` heute) die Nachbereitung schon **vor** dem Termin
auf „Heute“. Vorschlag: mit `zeit` die Etappen nach Uhrzeit freigeben; ohne `zeit` `danach` und die Auswertung erst ab
Tag + 1 (oder auf Klick „Ist vorbei“).

### S11 – Das Prüfskript liest `leben.json` gar nicht

`scripts/coach-pruefe.mjs` prüft verbotene Wörter, Anführungszeichen, Längen und Schritt-Typen nur in den Bereichs-
dateien; `leben.json` (117 KB Nutzertext) läuft an allen Prüfungen vorbei. Vorschlag: Datei in die Wort-/Zeichen-
Prüfung aufnehmen, Kompass-Schritte durch die vorhandene Schritt-Prüfung schicken, dazu: je Erinnerungsart der
Pflicht-Platzhalter, `{name}` nur mit Komma davor, jede `ErnstfallArt` mit allen sechs Etappen, Mutproben-Kennung
`mut-p-NN`. (Die hier genannten Prüfungen habe ich einmalig von Hand per Skript gemacht – alle grün, s. oben.)

### S12 – Forschungsaussagen im Kompass ohne Beleg-Stufe und Quelle

Die Karten bringen echte Befunde, aber ohne `beleg`/`quellen`, und zwei passende Quellen sind ungeprüft:

| Pfad | Aussage | passende Quelle |
|---|---|---|
| `kompass.stationen[1].schritte[0].text` | „ACT als Ganzes ist gut untersucht“; werte-passende Ziele werden eher verfolgt | `atjak2015`, `sheldon1999` (geprüft); `hayes2005` ungeprüft |
| `kompass.stationen[3].schritte[0].text` | Bestmögliches Selbst: kleine bis mittlere, eher kurzfristige Effekte; reines Träumen dämpft | fehlt (z. B. Heekerens & Eid 2021, Carrillo u. a. 2019); `oettingen2002` (geprüft) |
| `kompass.stationen[4].schritte[0].text` | Methode aus der Lebensplanung mit Design | `burnett2016` – `"geprueft": false` |
| `kompass.stationen[5].schritte[0].text` | langfristig eher Reue über Nicht-Versuchtes | fehlt (Gilovich & Medvec 1995) |
| `kompass.stationen[6].schritte[0].text` | Wenn-Dann trägt „deutlich besser“ | `gollwitzer2006` (geprüft) |

Ersatz: mit dem Feld aus M1 (Weg A) je Station `quellen` setzen, fehlende Quellen anlegen und prüfen. Texte können
bleiben (sie sind ehrlich formuliert); s. K16 zum Wort „deutlich“.

---

## kann

### K1 – Ideen mit seltenen oder einmaligen Auslösern passen schlecht zu Wochen-Erinnerungen

Vorgabe beim Anlegen ist 3× pro Woche (mindestens 1×). Bei diesen Ideen läuft die Wenn-Dann-Erinnerung fast immer ins
Leere (mit S2 wird sie wenigstens nicht falsch):
`vorhaben[1].ideen[4]` (Monatsbeginn) · `[2].ideen[2]` (Monatsanfang) · `[2].ideen[3]` (Geburtstagserinnerung) ·
`[2].ideen[4]` (erster Sonntag im Monat) · `[2].ideen[7]` (neues Vierteljahr) · `[3].ideen[8]` (Buch beendet) ·
`[4].ideen[6]` (Sprachpartner gefunden) · `[4].ideen[7]` (acht Wochen vor der Reise) · `[4].ideen[8]` (eine Woche
gelernt) · `[4].ideen[9]` (neues Semester) · `[6].ideen[5]` (Spendentüte voll) · `[6].ideen[9]` (ein Samstag im Monat)
· `[7].ideen[3]`, `[7].ideen[5]`, `[7].ideen[6]` (Monat, Kontoauszug, Gehalt) · `[8].ideen[1]`, `[8].ideen[8]`
(Vierteljahr) · `[8].ideen[2]` (Geburtstag) · `[8].ideen[4]` (Monatsanfang) · `[8].ideen[5]` (Impfpass gefunden) ·
`[8].ideen[9]` (Zeitumstellung) · `[9].ideen[4]` (Prüfungsdatum) · `[9].ideen[8]` (Monatsbeginn) · `[11].ideen[2]`
(erster Sonntag) · `[14].ideen[7]` (Gehalt).
Vorschlag: für die Kategorie `vorsorge` (und die übrigen Monats-/Jahres-Ideen) beim Übernehmen `proWoche` auf 1
vorschlagen oder die Art `wennDann` für sie auslassen; alternativ Auslöser wöchentlich formulieren, z. B.
`vorhaben[8].ideen[2].wennDann` „Wenn ich am Sonntagabend die Woche plane, dann hake ich einen Punkt meiner
Vorsorgeliste ab.“, `vorhaben[8].ideen[9].wennDann` „Wenn ich am ersten Samstag im Quartal einkaufe, dann sehe ich
vorher die Hausapotheke durch.“

### K2 – Rückblick mit „einmal“ wirkt überhöht

Bei `{anzahl}` = 1 wird „einmal“ eingesetzt: „Letzte Woche einmal! Die Form stimmt.“ · „Letzte Woche einmal. Die Serie
hat Hunger.“
- `erinnerungen.rueckblick.arschtritt[1]` → „Letzte Woche {anzahl}-mal. Du bist drin. Nicht abreißen lassen.“
- `erinnerungen.rueckblick.arschtritt[6]` → „Letzte Woche {anzahl}-mal. Da geht noch eine Runde.“
(„kein Zufall“ in `[0]` ist mit S1 schon ersetzt.)

### K3 – Teewasser-Logik

`vorhaben[0].ideen[4].wennDann` „Wenn das Teewasser kocht, dann mache ich Kniebeugen, bis es fertig ist.“ – wenn es
kocht, ist es fertig. → „Wenn ich den Wasserkocher einschalte, dann mache ich Kniebeugen, bis das Wasser kocht.“

### K4 – „trinke ich sie“ (die Tasse)

`vorhaben[11].ideen[4].wennDann` „Wenn ich morgens die Kaffeetasse in der Hand habe, dann trinke ich sie auf dem Balkon
oder im Garten.“ → „Wenn ich morgens meinen Kaffee in der Hand habe, dann trinke ich ihn auf dem Balkon oder im Garten.“

### K5 – Grammatik in Renates Geschichte

`kompass.stationen[5].schritte[1].text` „Dann hat ihre Enkelin sie in einen Kurs für Erwachsene angemeldet.“ →
„Dann hat ihre Enkelin sie bei einem Schwimmkurs für Erwachsene angemeldet.“

### K6 – Prüfung: „Die letzte Minute“ enthält Schritte nach dem Start

`notfall[2].etappen[4]` „Alle Aufgaben einmal ganz durchlesen.“ / „Mit der leichtesten anfangen.“ – die Aufgaben liegen
in der Minute davor meist noch nicht vor. → `titel`: „Die letzte Minute – und die erste“; Schritte: „Einmal lang
ausatmen, Füße auf den Boden.“ · „Wenn die Blätter da sind: alle Aufgaben einmal ganz durchlesen.“ · „Mit der
leichtesten anfangen.“

### K7 – Kaffee einheitlich und genauer

`notfall[2].etappen[2].schritte[0]` sagt „Keinen zusätzlichen Kaffee – lieber Wasser.“, die übrigen fünf „Kaffee
weglassen“. Für Menschen, die morgens immer Kaffee trinken, ist das Weglassen am Ernstfalltag selbst eine Störung.
→ in `notfall[0,1,3,4,5].etappen[2].schritte[0]` „Keinen zusätzlichen Kaffee – lieber Wasser.“

### K8 – Feinschliff Arschtritt (kein Regelverstoß)

a) `erinnerungen.wennDann.arschtritt[2]` „Das hast du selbst so festgelegt, {name}. Abgemacht ist abgemacht: …“ – leiser
Pflicht-/Schuldhebel (`06` §13: keine Schuldgefühle). → „Dein eigener Plan, {name}. Der gilt: {wennDann}“
b) `erinnerungen.spruch.arschtritt[4]` „Der beste Moment war gestern. Der zweitbeste ist jetzt.“ – bekanntes Sprichwort
(`06` §1: nichts übernehmen) mit Vorwurf-Unterton. → „Der perfekte Moment kommt nicht. Der jetzige reicht.“
c) `erinnerungen.kleinster.arschtritt[5]` „… Danach darfst du wieder sitzen.“ – unterstellt Herumsitzen; mit S3 erledigt.

### K9 – Übernommene Redensarten

`06` §1: „Alle Sätze selbst geschrieben.“ Sehr bekannte Sprüche: `erinnerungen.spruch.normal[5]` „Fertig ist besser als
perfekt.“ → „Erledigt schlägt perfekt.“; `erinnerungen.spruch.sanft[5]` „Langsam ist auch eine Geschwindigkeit.“ →
„Langsam kommst du auch an.“ (Geschmackssache.)

### K10 – Mutproben-Feinheiten

a) mut-p-14: Geld vor der Bitte erzeugt leichten Zugzwang – mit M2 gelöst.
b) `mutproben[17].auftrag` (mut-p-18) „… zu einem kleinen Fest im Hof ein. Ein Zettel im Treppenhaus reicht.“ → „…
zu einem kleinen Fest im Hof ein, wo die Hausordnung das zulässt. Ein Zettel im Treppenhaus reicht.“
c) `mutproben[11].auftrag` (mut-p-12) – Satz ergänzen: „Ein Nein nimmst du freundlich hin und kaufst wie geplant – oder
eben nicht.“ (macht klar: keine Drohung mit Abbruch)
d) `mutproben[18].halb` (mut-p-19) enthält mit „was nervt dich manchmal“ dieselbe Kritikfrage wie der Auftrag – kaum
„halb“. → „Frag nur: „Was schätzt du an mir?“ – und nimm die Antwort ohne Abwinken an.“

### K11 – Frage-Erinnerungen mit offener „Wann“-Frage

Die Karte bietet Knöpfe (Gemacht / Später / Heute nicht), keine Zeitangabe. `erinnerungen.frage.normal[2]` „Wann passt
„{titel}“ heute, {name}?“, `normal[4]` „Jetzt oder später – wann kommt „{titel}“ dran?“, `normal[6]` „Was brauchst du,
damit „{titel}“ heute klappt?“, `arschtritt[5]` „Jetzt, gleich oder sofort – wann ist „{titel}“ dran?“ lassen sich mit
den Knöpfen nicht beantworten. → z. B. „Passt „{titel}“ heute noch, {name}?“ · „„{titel}“ – jetzt oder später?“ ·
„Steht „{titel}“ heute auf dem Plan?“ · „Jetzt, gleich oder sofort – „{titel}“?“

### K12 – Pyramiden-Beispiel mit festem Monat

`kompass.pyramide.stufen[2].beispiel` „Bis Ende März schaffe ich eine Tagestour von 15 Kilometern.“ – stimmt je nach
Monat nicht als 90-Tage-Ziel. → „In zwölf Wochen schaffe ich eine Tagestour von 15 Kilometern.“

### K13 – Praxis statt Berufsbezeichnung

`vorhaben[8].ideen[0].titel` „Kontrolle beim Zahnarzt“ → „Kontrolle in der Zahnarztpraxis“; `vorhaben[8].ideen[1].titel`
„Gesundheits-Check beim Hausarzt“ → „Gesundheits-Check in der Hausarztpraxis“ (sonst in der Datei überall „Praxis“).

### K14 – „einfach“ und „Auftritt“

- `06` §1: kein „einfach“ als Verharmlosung. `vorhaben[1].ideen[7].hindernis` „einfach fragen“ → „direkt fragen“;
  `vorhaben[13].ideen[5].hindernis` „einfach fragen und merken“ → „nachfragen und merken“;
  `vorhaben[12].ideen[8].kleinster` „Beim nächsten Warten einfach umschauen.“ → „Beim nächsten Warten nur umschauen.“
- `erinnerungen.spruch.arschtritt[3]` „Kein Applaus ohne Auftritt.“ – „Auftritt“ ist Teil des Bereichsnamens „Stimme &
  Auftritt“; verrät nichts, wer ganz sicher gehen will: „Kein Applaus ohne Anpfiff. Rein da.“

### K15 – Zeitangaben in Station 4

`kompass.stationen[3].schritte[1].anleitung` „Schreib zehn bis fünfzehn Minuten am Stück …“ bei `minuten: 12` und
Station mit 15 Minuten inklusive WOOP. → „Schreib etwa zehn Minuten am Stück …“

### K16 – „deutlich besser“ bei Wenn-Dann

`kompass.stationen[6].schritte[0].text` „… trägt laut vielen Studien deutlich besser als ein bloßer Vorsatz.“ – deckt
sich mit `gollwitzer2006` (d = 0,65). Nach meiner Erinnerung kommt eine neuere, viel größere Meta-Analyse (Sheeran u. a.,
um 2024) auf einen kleineren Mittelwert – **bitte prüfen**, ich habe es nicht nachgeschlagen. Vorsichtiger: „… hilft
laut vielen Studien spürbar mehr als ein bloßer Vorsatz.“

### K17 – Werte-Karte als Verbform

`kompass.werteKarten[3]` und `kompass.stationen[1].schritte[1].karten[3]` „Beitrag leisten“ – alle anderen Karten sind
Hauptwörter. → „Beitrag“ (beide Listen gleich halten). Achtung: Wenn gewählte Werte als Text gespeichert werden, ist das
eine Kennungsänderung – dann lieber lassen.

---

## Umsetzung

Stand 25.11.2026 · nur `src/coach/inhalt/leben.json` geändert (84 Texte), Aufbau unverändert: 16 Kategorien,
152 Ideen, gleiche Impulszahl je Kategorie, Kennungen `mut-p-01…20`, Stationen `kompass-1…7`, Etappen-IDs; 7 Texte
je Art × Schärfe; `kompass.lebensrad`/`werteKarten` weiter identisch mit Station 1/2. Vorgabe: keine neuen Felder, keine
neuen Quellen; in `leben.json` keine Prozent- oder Tageszahlen aus Studien, keine Autorennamen.
Geprüft: JSON gültig · `node scripts/coach-pruefe.mjs --nur leben` 0 Fehler, 0 Hinweise (der eine Gesamtfehler liegt in
`konter/einheiten-3.json`) · eigener Durchlauf über alle 147 Erinnerungstexte mit Beispielwerten (mit/ohne Schlusspunkt
bei `{kleinster}`/`{wennDann}`, mit/ohne Namen, `{anzahl}` = 1 und 3, `{idee}` mit allen Impulsen): keine Platzhalter
übrig, kein Text nach `{kleinster}`/`{wennDann}`/`{idee}`, `{titel}` nur in „…“, keine Verbdoppelung Text × Impuls,
kein doppeltes „heute“, alle ≤ 140 Zeichen.

| Befund | Stand | Umsetzung / Grund |
|---|---|---|
| M1 | umgesetzt (Weg B) | Station 7 „Geduld einplanen“: „Bis etwas von allein läuft, dauert es meist Wochen bis Monate – bei manchen länger. … Ein ausgelassener Tag wirft dich nicht zurück; …“ · `spruch.normal[3]`: „Gewohnheiten wachsen über Wochen und Monate. Jeder Tag zählt mit.“ Kein Quellenfeld (Vorgabe). |
| M2 | umgesetzt, erweitert | „erwachsene“ bei mut-p-02, -03 (dazu „Ein Nein ist völlig in Ordnung.“), -14 (Ersatztext, Bitte vor dem Geld); zusätzlich bei allen weiteren Proben mit fremden Einzelpersonen: -01 (Stand, an dem Erwachsene verkaufen), -04 Auftrag + halb, -05, -15, -18 halb („erwachsene Person aus der Nachbarschaft“). Betriebe/Vereine (-07, -10, -11, -12, -13, -20) unverändert. |
| M3 | umgesetzt | mut-p-06: Mensch aus früherem Freundeskreis, Schule, Verein oder Nachbarschaft; ausdrücklich keine frühere Beziehung, niemand, der den Kontakt selbst beendet hat; „eine Nachricht, kein Nachhaken“ (statt „frühere Freundin“ – im Deutschen doppeldeutig). `warum` nach Ersatztext. |
| S1 | umgesetzt (Text) | fünf Rückblick-Texte so, dass sie auch nach einem Erfolg in dieser Woche stimmen („heute wieder?“, „Daran kannst du heute anknüpfen.“ …). Die Code-Alternative (`kern/leben.ts` Z. 92) bleibt Hinweis an den Hauptstrang. |
| S2 | umgesetzt | `normal[1]` „Sobald dein Auslöser kommt, weißt du, was zu tun ist:“, `normal[2]` „Dein Plan gilt weiter:“, `arschtritt[3]` „Kommt der Moment, bist du bereit:“ (ohne doppeltes „Wenn … Wenn“), `arschtritt[6]` nach Ersatz; zusätzlich `normal[5]` „Achte auf deinen Moment, wann immer er kommt:“. |
| S3 | umgesetzt | `kleinster.arschtritt[5]` „Hopp! Ein Schritt, keine Diskussion: {kleinster}“ (statt Ersatzvorschlag, weil schon zwei „Zwei Minuten“-Texte in der Schärfe stehen). Kein Erinnerungstext hat mehr Wörter nach einem Platzhalter. |
| S4 | umgesetzt, erweitert | `idee.normal[2]` „Ein Vorschlag, {name}: {idee}“. Alle Text × Impuls-Kombinationen geprüft; dabei behoben: „Nur ein Vorschlag: Schlag … vor“ (Impulse umformuliert, s. S5 und `freunde` „Verabrede dich fürs Wochenende …“), „Trainingsplan geändert: Plan …“ → „Programmwechsel:“, „Mal mit der anderen Hand“ → „Zeichne mit der anderen Hand“ (eindeutig), doppeltes „heute“ → `sanft[4]` „Etwas Kleines für zwischendurch:“, `normal[3]` „Zur Abwechslung:“, `normal[5]` „Frisch im Angebot:“, `arschtritt[1]` „Diesmal wird's anders.“; `schlaf`-Impuls „Geh morgen …“ → „in der nächsten Mittagspause“. |
| S5 | umgesetzt | fünf Impulse in Du-Form; [0] und [1] abweichend vom Ersatz („Koch/Geh mit deiner Partnerin oder deinem Partner …“), damit kein „Vorschlag: Schlag vor“ entsteht. Keine weiteren Ihr-Imperative in der Datei. |
| S6 | umgesetzt | nach Ersatz. |
| S7 | umgesetzt | alle drei nach Ersatz. |
| S8 | umgesetzt | alle sechs: „Ein paar ruhige Atemrunden: normal ein, lang aus. Wird dir schwummrig, atme normal weiter.“ |
| S9 | umgesetzt | nach Ersatz. |
| S10 | bewusst nicht | Code (`ETAPPE_TAG`, `auswertungOffen` in `kern/leben.ts`) – Auftrag erlaubt nur `leben.json`; Hinweis an den Hauptstrang bleibt offen. |
| S11 | bewusst nicht | Code. `scripts/coach-pruefe.mjs` hat inzwischen einen Abschnitt für `leben.json` (Platzhalter, `{name}`, Etappen, `mut-p-NN`, Kompass-Schritte, Texte); die übrigen Ideen bleiben beim Hauptstrang. |
| S12 | teilweise (Text) | Kein `quellen`-Feld, keine neuen Quellen (Vorgabe). Stattdessen vorsichtig formuliert: Station 2 „Studien deuten außerdem darauf hin, dass …“ (Quellen geprüft), Station 4 „Studien deuten darauf hin, dass sie Stimmung und Zuversicht heben kann – eher ein wenig und eher für kurze Zeit“ (ohne „klein bis mittel“), Station 7 s. K16. Station 5 (Herkunft der Methode) und 6 („Befragungen deuten darauf hin“) waren schon vorsichtig – unverändert. Die Verknüpfung mit Quellen bleibt offen. |
| K1 | bewusst nicht | eigentlich eine Code-/Vorgabefrage (`proWoche` 1 für Monats- und Jahres-Ideen); mit S2 sind die Texte nicht mehr falsch. Die vorgeschlagenen Auslöser bleiben selten (Vorsorge ist jährlich) – keine echte Verbesserung. |
| K2 | umgesetzt | `arschtritt[1]`, `[6]` nach Vorschlag; `[0]` mit S1. |
| K3, K4, K5 | umgesetzt | nach Vorschlag. |
| K6 | umgesetzt | Titel „Die letzte Minute – und die erste“, Schritt „Wenn die Blätter da sind: …“. |
| K7 | umgesetzt | überall „Keinen zusätzlichen Kaffee – …“ (Wasser-Hinweis je Ablauf beibehalten). |
| K8 | umgesetzt | a) „Dein eigener Plan, {name}. Der gilt:“; b) „Der perfekte Moment kommt nicht. Der jetzige reicht.“; c) mit S3. |
| K9 | umgesetzt | „Erledigt schlägt perfekt.“ · „Langsam kommst du auch an.“ (`06` §1: Sätze selbst geschrieben). |
| K10 | umgesetzt | a) mit M2; b) „wo die Hausordnung das zulässt“; c) „Ein Nein nimmst du freundlich hin, ohne weiter zu verhandeln.“ (ohne „oder eben nicht“, das als Drohung lesbar wäre); d) „Frag nur: „Was schätzt du an mir?“ – und nimm die Antwort an, ohne abzuwinken.“ |
| K11 | umgesetzt | „Passt „{titel}“ heute noch, {name}?“ · „„{titel}“ – jetzt oder später?“ · „Bekommt „{titel}“ heute ein paar Minuten?“ (statt „auf dem Plan“, zu nah an `normal[5]`) · „Jetzt, gleich oder sofort – „{titel}“?“ |
| K12 | umgesetzt | Beispiel „In zwölf Wochen …“; dazu `hilfe` „– mit klarer Frist.“ statt „mit Datum“, damit Hilfe und Beispiel zusammenpassen. |
| K13 | umgesetzt | nach Vorschlag. |
| K14 | umgesetzt | drei „einfach“ ersetzt; „Kein Applaus ohne erste Runde. Rein da.“ (Box-Bild statt „Anpfiff“). Übrige „einfach“ in der Datei sind Eigenschaftswörter („einfacher Wecker“) bzw. „statt einfach anpacken“ (beschreibt das Falsche) – bleiben. |
| K15 | umgesetzt | „Schreib etwa zehn Minuten am Stück …“ |
| K16 | umgesetzt | „… hilft laut vielen Studien spürbar mehr als ein bloßer Vorsatz.“ |
| K17 | bewusst nicht | gewählte Werte werden als Text gespeichert (`kompass.werte`, Anzeige in `Kompass.tsx`) – Umbenennen wäre eine Kennungsänderung. |
