# Gegenlesen: Bereich `antrieb`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser aus drei Blickwinkeln: Motivationspsychologie (Gewohnheit, Aufschieben, Rückfall, Zielablösung), Nutzer, die erschöpft sind oder keine klaren Ziele haben, Faktenprüfung · **Inhaltsdateien:** nicht geändert. Hier stehen nur Befunde mit Ersatztext.

## Was geprüft wurde

- **Neu:** `einheiten-2.json` (`antrieb-2-01` … `-06`), `einheiten-3.json` (`antrieb-3-01` … `-05`), `lagen-2.json` (`antrieb-l-06` … `-10`), `lagen-3.json` (`antrieb-l-11` … `-15`), `vorrat-03.json` (`antrieb-v-0096` … `-0175`), `vorrat-04.json` (`antrieb-v-0176` … `-0255`). Dazu die 38 angehängten Lerntage `"phase": "k"`/`"m"` in `kurs.json`, die Szenarien `antrieb-fc-025` … `-040`, die neuen Wissens-Einträge (`w-017`, `-018`, `-019`, `-047` … `-050`, `-060`, `-061`, `-089`, `-097`, `-098`, `-124`) und die neuen Quellen (`bonezzi2011`, `wrosch2003`, `wood2016`, `verplanken2016`, `buehler1994`, `wendsche2017`, `larimer1999`).
- **Maßstab:** `08_ENTSCHEIDUNGEN.md` (v. a. Zeile `antrieb` unter „Lehrplan-Abweichungen k/m“), `06_INHALT_REGELN_MUSTER.md` (Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (3a, 5, 7, 8), `besetzung.json`, `gemeinsam.json` (Fachhilfe `seele`), Kompass in `leben.json` (Stationen 1–7, `pyramide`, `wochenCheck`, `rueckblick`), `gegenlesen/antrieb.md`. Figuren habe ich über alle Bereiche abgeglichen (Lena, Jule, Tarek, Carla, Sven).
- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur antrieb` → **0 Fehler, 0 Hinweise** (18 Einheiten, 15 Lagen, 255 Vorrat, 10 Missionen).
- **Eigenes Zählskript** (`scratchpad/antriebkm/analyse.js`): Beste Antwort ist die längste in Einheiten 6/14, Lagen 21/56, Vorrat 22/53, Tests 6/16. Die falsche Antwort ist die längste in etwa ebenso vielen Fällen. **Unauffällig.** Keine Lagen-Antwort ist länger als 140 Zeichen. Kein „Sie“ außerhalb wörtlicher Rede, keine geraden Anführungszeichen, keine Prozentzahl, keine Rufnummer, keine laute Übung (also kein `leise` nötig).
- **Kursplan:** k hat 20 Lerntage (6 E, 6 Ü, 4 L, 3 A, 1 S), m hat 18 (5 E, 5 Ü, 4 L, 3 A, 1 S). Die Bänder laufen von [3,6] bis [4,7] und von [5,8] bis [6,10]. Jeder Übungstag übt die Fähigkeiten der Einheit davor. Jede Lage steht nach der Einheit, die sie voraussetzt. Die Formate der Übungstage gibt es im Vorrat. **In Ordnung.**
- **Tests:** Die Stufen liegen bei k zwischen 4 und 7, bei m zwischen 6 und 9. Je Phase sind alle acht Fähigkeiten abgedeckt. **In Ordnung.**
- **An der Quelle nachgeschlagen:**
  - `bonezzi2011`: Drei Experimente (Wörter bilden, Spenden, Aufsätze Korrektur lesen). In der Mitte war die Anstrengung niedriger. Mit „to-go“-Anzeige stieg die Leistung stetig bis zum Ende. Rat der Autoren: „früh zurück, gegen Ende nach vorn schauen“. ✓ (`3-04`, `w-017`, `w-049` geben das richtig wieder.)
  - `verplanken2016`: 800 Teilnehmende, je zur Hälfte frisch umgezogen, Programm für nachhaltiges Verhalten. Es wirkte bei Umgezogenen stärker, das Fenster lag bei etwa drei Monaten (gemessen nach acht Wochen, Selbstauskunft). ✓
  - `wendsche2017`: 86 Veröffentlichungen, k = 91, N = 38.124. Abschalten hängt zusammen mit weniger Erschöpfung (r ≈ −0,36), besserem Schlaf und mehr Wohlbefinden. Arbeit in der Freizeit hängt mit weniger Abschalten zusammen. ✓
  - `steel2007`: Am stärksten hängt geringe **Gewissenhaftigkeit** mit Aufschieben zusammen (Selbstkontrolle, Ablenkbarkeit, Organisation). Abneigung gegen die Aufgabe, Selbstwirksamkeit, Impulsivität und ferne Belohnung gehören zu den starken Zusammenhängen, sind aber nicht „die stärksten“ → S7.
  - `wrosch2003`, `buehler1994`, `larimer1999`, `wood2016` habe ich aus eigener Kenntnis gegen die Quellentexte abgeglichen. Die Wiedergaben passen.
- **Gewohnheitsdauer:** steht überall richtig als „meist Wochen bis Monate“ (`3-02`, `v-0201`, `l-15`). Eine feste Zahl oder ein Wirkversprechen kommt nicht vor. ✓
- **Erschöpfung/Depression:** `3-03` endet mit `fachhilfe` `seele`, nennt keine Diagnose und keine Rufnummer und verweist auf Hausarztpraxis bzw. psychotherapeutische Sprechstunde. „Burn-out“ und „Depression“ stehen nur als falsche Antwort mit `tendenz: diagnose` (`l-12`, `v-0222`). Das ist vorbildlich. Ausnahme: M1.
- **Einfluss-Klassen:** Der Bereich setzt keine Einflusstechnik gegenüber anderen ein. `w-047` … `-050` sind `fair` (Selbstmanagement). Nichts gehört zur roten Linie. ✓

## Gesamteindruck

Die beiden Phasen vertiefen wirklich und wiederholen nicht:
- Aus dem Kompass wird ein 90-Tage-Vorhaben.
- Das Aufschieben wird nach Gefühl sortiert (k), dann nach dem eigenen Muster mit Selbstschutz (m).
- Gewohnheiten werden am Auslöser umgelenkt (k), dann in Stufen gesteigert und über Umbrüche gerettet (m).
- Rückfälle werden mit einer Landkarte geplant.
- Die Energie bekommt einen Plan (k), dann folgt die klare Grenze zur Erschöpfung (m).
- Der Durchhänger in der Mitte und der Rückblick mit „weiter, anpassen, loslassen“ stehen am Ende.

Die neue Forschung ist sauber eingeordnet: Bonezzi als Laborbefund, Wrosch als Befragung, Wendsche als Zusammenhang, Marlatt als Denkmodell. Für Perfektionisten ist der offene Punkt 1 aus Phase 1 erledigt: `2-04` sagt „Auch nach zweimal: der Rückweg-Plan, kein Urteil“. Die Sparrings „Die Woche, in der alles dazwischenkommt“ und „Ein Jahr später“ verbinden den Stoff gut.

**Die Hauptmängel:**
1. Ein Sicherheitsbefund: Sinnlosigkeits-Gedanken werden nur als Anlass zum „Nachdenken“ über Hilfe eingeordnet.
2. Viele Lagen haben Knoten, die auf einzelnen Wegen nicht zur vorigen Wahl passen. Einmal behauptet die beste Antwort sogar etwas, das auf dem Weg nie geschah.
3. Doppelungen: mit dem Kompass (`ziel[1]`, Quartals-Schreibreise) und innerhalb der Wissens-Seite (`w-097`/`w-093`, `w-098`/`w-099`).
4. Figurenbrüche bei Lena (Tabellen), Jule (Café) und Sven (erschöpft und zugleich im Training).
5. Vier Stellen legen das Geschlecht oder den Familienstand des Nutzers fest.

**Zählung:** muss 2 · sollte 24 · kann 22

---

## MUSS

### M1 · Gedanken, dass alles keinen Sinn hat, sind „über Hilfe nachdenken“

In `v-0224` steht die Karte „Gedanken, dass alles keinen Sinn mehr hat“ im Fach „über Hilfe nachdenken“. Solche Gedanken können auf eine Krise deuten. Dann ist Hilfe *suchen* dran, und zwar bald. Die Fachhilfe `seele` in `gemeinsam.json` sagt ausdrücklich: „sprich bitte noch heute mit jemandem“. Eine Übung, die „nachdenken“ als richtige Einordnung belohnt, widerspricht dem. In `3-03-a` ist die Einordnung von „alles sinnlos oder hoffnungslos“ als „genauer hinschauen“ ähnlich weich. Der Auftrag sagt dort immerhin „und Hilfe zu suchen“.

| Datei | Kennung/Pfad | Zitat | Ersatz |
|---|---|---|---|
| vorrat-04 | `antrieb-v-0224` auftrag, faecher[1] | „Kurz müde – oder ein Grund, über Hilfe nachzudenken?“ · Fach „über Hilfe nachdenken“ | „Kurz müde – oder ein Grund, dir Hilfe zu holen?“ · Fach „Hilfe holen“ |
| vorrat-04 | `antrieb-v-0224` karten[5] | „Gedanken, dass alles keinen Sinn mehr hat“ | „seit Wochen das Gefühl, dass alles keinen Sinn mehr hat“ (Dauer wie bei den anderen Karten; der Akut-Fall gehört in die Karte von `3-03`, s. u.) |
| einheiten-3 | `antrieb-3-03-a` faecher[1] | „genauer hinschauen“ | „Hilfe holen“ |
| einheiten-3 | `antrieb-3-03` Schritt 2 (karte), am Ende anfügen | – | „Kommen Gedanken, nicht mehr leben zu wollen, warte nicht: Sprich noch heute mit jemandem – der Hilfe-Hinweis unten zeigt, wo.“ (Die Karte hat 386 Zeichen. Dafür „, einem freien Wochenende“ und „Er sagt nur: Das ist ein guter Grund für Hilfe.“ streichen.) |

### M2 · Sparring `l-10`: Die beste Schlussantwort behauptet, was auf dem Weg nicht geschah

`antrieb-l-10` k5, wahl[0] (`wert: 2`): „Bericht geschafft, Fotobuch auf Sparflamme. Geholfen hat die Notfall-Fassung. Nächste Woche wieder dreimal.“

Der Knoten k5 wird von **allen** Wegen erreicht, auch von k1 „Dann fällt das Fotobuch diese Woche eben ganz aus“ → k2b „Diese Woche ist eh gelaufen“ → k3 „fällt dann eben aus“ → k4 „zwei Stunden aufholen“. Auf diesem Weg gab es keine Notfall-Fassung und keine Sparflamme. Für die volle Punktzahl muss der Nutzer also etwas Falsches über seine Woche sagen. Das ist der wiederkehrende Fehler „beste Antwort behauptet Tatsachen, die nicht im Text stehen“, hier mitten in der Bewertung des Sparrings.

| Datei | Kennung/Pfad | Ersatz |
|---|---|---|
| lagen-2 | `antrieb-l-10` k5 wahl[0] text | „Bericht geschafft. Was beim Fotobuch half und was nicht, schreibe ich auf – für volle Wochen gilt ab jetzt die Notfall-Fassung.“ (129 Zeichen) |
| lagen-2 | dito rueck | „Was lief, was half, was kommt – ohne Urteil. So wird aus der Woche Wissen, ganz gleich, wie sie gelaufen ist.“ |

---

## SOLLTE

### Abgrenzung zum Kompass (`leben.json`) und Doppelungen

**S1 · `wissen.json` `ziel[1]` beschreibt den Kompass, nicht die Phase Können.**
`Bereichsseite.tsx` zeigt `ziel[i]` mit dem Chip der Phase (g/k/m). `ziel[1]` lautet „Du findest Ziele, die wirklich deine sind – auch über Werte, wenn dir kein großes Ziel einfällt –, und machst daraus Wochenschritte, die in den Alltag passen.“ Das sind genau die Kompass-Stationen Werte, Spuren und Ziel-Pyramide (bis „Diese Woche“). Laut `08` stehen die bewusst **nicht** in `antrieb`. Was Phase k wirklich lehrt (2-01 … 2-06), fehlt dort.
- **Ersatz `ziel[1]`:** „Du machst aus einer Richtung – etwa aus deinem Kompass – ein Vorhaben für 90 Tage, nimmst dem Aufschieben den Anfang, lenkst Gewohnheiten am Auslöser um, planst Rückfälle und deine Energie ein und findest, wo ein Plan hakt.“
- **Dazu `ziel[2]` (m)** angleichen. „Kommst nach jedem Ausrutscher ohne Drama zurück“ ist Stoff von k (2-04). Mitte, Rückblick und Loslassen fehlen. **Ersatz:** „Du kennst dein Aufschiebe-Muster, lässt Gewohnheiten in kleinen Stufen wachsen, merkst, wann Erschöpfung Hilfe braucht, kommst durch die zähe Mitte und entscheidest im Rückblick: weiter, anpassen oder loslassen.“

**S2 · `3-05` Schreibreise „Dein Quartal“ doppelt den Kompass-Rückblick.** `3-05` sagt selbst „der Kompass hat dafür eigene Fragen“. Dann folgen vier Fragen, von denen zwei fast wortgleich dort stehen: `kompass.rueckblick` „Welches Ziel trägt noch, und welches darf gehen?“ und „Was hat dir beim Dranbleiben am meisten geholfen?“. Sie landen auch noch im selben Buch (`insBuch: "kompass"`). Vorschlag: Die Schreibreise bleibt bei dem, was nur `antrieb` lehrt (Plan, Mitte, Rückfall), und die Entscheidung übt die Einheit mit Zuordnen und Auswahl.
- `fragen[2]` → „Welche Stelle im Plan hat am häufigsten gehakt – Auslöser, Größe, Hindernis oder Zeit?“
- `fragen[3]` → „Was baust du beim nächsten Vorhaben von Anfang an anders?“
- `insBuch` → `"erfolg"`. Die Karte sagt dann: „… der Kompass hat dafür eigene Fragen zu Werten und Zielen; hier geht es um deine Pläne.“

**S3 · `w-097` doppelt `w-093`, und die Karte in `3-01` heißt „Sei perfekt!“, erklärt aber den Selbstschutz.** `w-093` (Phase 1) lautet: „Manche schieben, um sich zu schützen … Besonders die Sorge vor Fehlern und Bewertung geht mit mehr Aufschieben einher.“ `w-097` sagt dasselbe noch einmal mit gleicher Quelle und gleichem `belegHinweis`. In `3-01` trägt die Karte den Titel „Tiefenblick: „Sei perfekt!““, beschreibt dann aber nur Covingtons Selbstschutz („Ich hatte ja keine Zeit“). Den Antreiber nennt sie gar nicht.
- **`w-097` text** → „Ein Denkmodell aus der Transaktionsanalyse: Der innere Antreiber „Sei perfekt!“ zeigt sich beim Aufschieben oft als Polieren – fünfmal neu anfangen, die Schrift ändern, noch einen Ratgeber lesen. Es fühlt sich nach Arbeit an und schützt doch vor dem Abschicken. Erlauber-Satz: „Die erste Fassung darf schlecht sein – gut wird sie beim Überarbeiten.“ Frage für heute: Was polierst du gerade, statt es zu zeigen?“
- **`3-01` Schritt 4 (karte) text** → „Ein Denkmodell, kein Befund über dich: Der innere Antreiber „Sei perfekt!“ zeigt sich oft als Polieren statt Abschicken. Dahinter kann Selbstschutz stecken: Was nie fertig wird, kann niemand bewerten. Die Sorge vor Fehlern und Bewertung hängt in Studien tatsächlich mit mehr Aufschieben zusammen. Wer sich darin wiedererkennt, kann einen Erlauber-Satz probieren: „Die erste Fassung darf schlecht sein.““ (402 Zeichen)

**S4 · `w-098` „Müde – oder erschöpft?“ doppelt `w-099` „Wenn der Antrieb über Wochen fehlt“.** Beide nennen dieselben Zeichen (Wochen, Freude, hoffnungslos), denselben Weg (Hausarztpraxis) und denselben Satz „Coach stellt keine Diagnose/ersetzt keine Therapie“. Vorschlag: `w-098` bekommt einen eigenen Kern, die *Probe*.
- **Ersatz `w-098` text:** „Eine einfache Probe: Wird es nach einem freien Wochenende, ein paar frühen Abenden oder einer Woche Urlaub besser? Dann war es Müdigkeit – plane Erholung fest ein wie einen Termin. Hilft nichts davon, und das über Wochen, ist es mehr als Müdigkeit: Dann gilt der nächste Eintrag.“
- `quellen` → `["praxis-antrieb", "wendsche2017"]`. `ekers2014` (Verhaltensaktivierung) trägt die Warnzeichen nicht.

### Fakten und Didaktik

**S5 · `2-06-b`: Die beste Antwort ändert zwei Stellen, die Einheit lehrt „genau eine“.** Die Karte sagt: „Meist hakt es an genau einer Stelle. Die änderst du – nicht gleich alles.“ Die `rangfolge` belohnt „genau diese eine Stelle“. Die beste Antwort in `2-06-b` lautet aber „Schritt und Moment: …“.
- **Ersatz text:** „Den Schritt: nach dem Abendessen nur 20 Minuten – die lange Stunde bekommt der Samstag.“
- **warum:** „Der Auslöser bleibt, nur nach dem Essen. Was nicht passte, war die Größe: Eine Stunde ist für müde Abende zu viel.“
- wahl[3] warum („Er isst vorher einen Riegel“) → „Löst den Hunger, nicht die Größe. Eine ganze Stunde um acht bleibt für viele Abende zu viel.“

**S6 · `3-04-a`: Die beste Antwort erfindet eine Prüfung.** In der Frage steht „Woche sieben von zwölf ihres Tabellen-Kurses“, die Antwort sagt „Noch fünf Wochen bis zur Prüfung“. **Ersatz:** „„Noch fünf Wochen – heute ist das nächste Kapitel dran.““

**S7 · `2-02` Schritt 1 (`schaetzen`), aufloesung: „am stärksten“ stimmt nicht.** Bei Steel (2007) hängen Gewissenhaftigkeit und Selbstkontrolle stärker zusammen. **Ersatz:** „Abneigung gegen die Aufgabe, eine Belohnung, die weit weg liegt, und Zweifel, es zu können, gehörten zu den stärksten Zusammenhängen – neben Eigenschaften wie Impulsivität und wenig Gewissenhaftigkeit. Es geht also selten um Faulheit – oft um das Gefühl am Anfang.“ Der Quellentext `steel2007` in `antrieb/quellen.json` (Phase 1) sagt ebenfalls „am stärksten“. Bitte dort mit „… gehören zu den stärksten Zusammenhängen; am stärksten hängt geringe Gewissenhaftigkeit mit Aufschieben zusammen“ angleichen.

**S8 · `fc-031`: Brauchbare und beste Antwort sind kaum zu unterscheiden.** Die beste Antwort sagt „Das Wochenende … darf frei sein“. Die Antwort mit `wert: 1` sagt „das Wochenende gehört eben mir“, entscheidet also genau das. Ihre Begründung („lässt sie liegen“) stimmt dann nicht.
- **Ersatz wahl[3] text:** „„Zwanzig Kreuze in acht Wochen – passt schon, ich mache einfach so weiter.““
- **warum:** „Freundlich und berechtigt. Ob das Wochenende einen eigenen Auslöser braucht oder bewusst frei bleibt, entscheidet sie so aber nicht.“
- Dazu im ersten warum „Wochenende-Muster“ → „Wochenend-Muster“.

**S9 · `v-0228`: „Drei Vorhaben“, aber vier Einträge, und Platz 3 und 4 sind kaum zu trennen.** „Das, das dir Kraft gibt“ und „Das, das dir … Freude macht und dich auflädt“ sagen fast dasselbe. Die Reihenfolge ist nur zu raten.
- frage → „Vier Vorhaben, wenig Kraft: Welches parkst du zuerst? Von zuerst parken nach zuletzt parken.“
- eintraege[2] → „Das, das dir Kraft gibt, aber viel Zeit frisst.“ / warum „Eher behalten – vielleicht in kleiner Fassung, damit es weniger Zeit kostet.“
- eintraege[3] → „Das, das kaum Zeit kostet und dich auflädt.“ / warum „Kostet fast nichts und gibt viel – das bleibt bis zuletzt.“

### Nutzer neutral (LIESMICH §5)

**S10 · Geschlecht des Nutzers festgelegt**

| Datei | Kennung/Pfad | Zitat | Ersatz |
|---|---|---|---|
| einheiten-2 | `antrieb-2-05` Schritt `gespraechskarte`, anlass | „Mit Familie, Partner oder Mitbewohnern absprechen, …“ | „Mit den Menschen, mit denen du zusammenlebst, absprechen, …“ |
| lagen-3 | `antrieb-l-11` k2 wahl[1] text | „Ich bin halt Perfektionist“ | „Ich bin halt perfektionistisch“ (103 Zeichen) |
| vorrat-04 | `antrieb-v-0229` satz | „„Wenn ich jetzt etwas parke, bin ich ein Aufgeber.““ | „„Wenn ich jetzt etwas parke, gebe ich auf.““ (Die Muster passen unverändert.) |
| lagen-2 | `antrieb-l-08` ende1 sagt | „Er antwortet: „Bentornato!“ – willkommen zurück.“ (italienisch männlich) | „Er antwortet: „Che bello!“ – wie schön, du bist zurück.“ |

**S11 · Familienstand festgelegt:** `v-0120` vorlage „„Den Antrag fürs Elterngeld mache ich, wenn ich durchblicke.““ unterstellt dem Nutzer ein Kind. **Ersatz:** „„Den Antrag auf den Zuschuss zur Fortbildung mache ich, wenn ich durchblicke.““ Muster 1 dann: „„Heute rufe ich bei der zuständigen Stelle an und frage, welche Nachweise ich brauche.““

### Figuren

**S12 · Lena „hat mit Tabellen kaum gearbeitet“ (`2-01-c`).** In fünf anderen Bereichen ist Lena gerade die Tabellen-Kundige: Sie erklärt dir eine knifflige Tabelle (`ausdruck-v-0001`), hilft dir bei einer schwierigen Tabelle (`lesen/vorrat-03`), findet den Rechenfehler in der Tabelle (`selbst-1`) und erklärt sie am Bildschirm (`aussprache-n-v-0013`). Ihr Tabellen-Kurs (`1-03`, `l-09`, `3-04-a`) passt nur, wenn es um ein Aufbauthema geht.
- **Ersatz frage:** „Lena will in den nächsten 90 Tagen lernen, Auswertungen mit Formeln selbst zu bauen. Bisher hat sie Tabellen vor allem geprüft, nicht gebaut. Welches Ziel passt für den Anfang?“

**S13 · Jule fängt „in einer neuen Backstube“ an, mit Probezeit (`v-0137`).** In `antrieb` (`l-06`, `l-14`, `fc-030`, `v-0098`) und in vier weiteren Bereichen führt Jule ihr eigenes Café.
- frage → „Jule zieht in drei Wochen mit ihrem Café in neue Räume – mit neuem Arbeitsweg. Was kann sie dafür nutzen?“
- wahl[2] text → „Alle Vorhaben auf die Zeit nach der Neueröffnung verschieben.“

**S14 · Jules Café: ein halbes Jahr alt, aber seit einem Jahr Tortenkurse.** `l-06` (Phase k) sagt „hat seit einem halben Jahr ihr eigenes kleines Café“. `l-14` (Phase m, wenige Wochen später) sagt „Seit einem Jahr gibt sie dort jeden Freitagabend einen Tortenkurs“ und „Ein ganzes Jahr!“.
- **Ersatz in `l-06` lage:** „Jule hat seit gut einem Jahr ihr eigenes kleines Café.“ (`k1b` „seit der Eröffnung“ passt weiter.)

**S15 · Sven: erst wochenlang erschöpft, dann Trainingscoaching.** In `3-03-b` ist Sven „seit Wochen erschöpft, auch nach dem Wochenende“ (Lauftraining, Vereinsvorsitz). Die richtige Antwort lautet dort: Vorhaben parken, Hausarztpraxis. Zwei Lerntage später (`l-13`) hat derselbe Sven in Woche sechs „null Bock“, und die beste Antwort ist „das liegt nicht an dir … Zwischenziel“, ohne Frage nach der Erschöpfung. Für den Nutzer widerspricht `l-13` damit der Botschaft von `3-03`. Dazu kommen `fc-034` (Liegestütze) und `fc-039` (Vereinsvorsitz).
- **Ersatz in `3-03-b`:** Sven durch eine namenlose Figur ersetzen: „Ein Bekannter aus dem Verein ist seit Wochen erschöpft, auch nach dem Wochenende. Auf seiner Liste: die neue Stelle als Teamleiter, die Renovierung der Wohnung, Lauftraining, der Vorsitz im Verein. Was hilft ihm am ehesten?“

### Lagen: Wege, die nicht zusammenpassen

**S16 · `l-06` ende2: Das Fazit stimmt nicht auf jedem Weg.** Über k1 → k2 („Dann frag sie doch heute …“, `wert 2`) → k3 („Abends nach Ladenschluss“, `wert 0`) ist der erste Schritt gefunden. Das Fazit sagt trotzdem „Es fehlte … am passenden ersten Schritt und an einem festen Zeitfenster“.
- **Ersatz ende:** „Kein Drama – große, unklare Aufgaben liegen bei vielen lange. Es fehlte nicht an Willen. Gefehlt hat mindestens eins von beidem: ein kleiner, klarer erster Schritt oder ein festes Zeitfenster in einer frischen Stunde.“

**S17 · `l-07`: Der Weg über „Nüsse am Platz“ (k3 wahl[2]) passt nicht zu k4 und ende3.** In k4 heißt es „Dann gehe ich die Runde allein“, in ende3 „Ihr geht wieder“ und „Der Plan hing an Miriam“. Auf diesem Weg gab es keine Runde und keinen Plan mit Miriam.
- k4 wahl[0] text → „„Ich bleib bei meinem Plan – heute eben allein.““
- k4 wahl[1] rueck → „Ein Ausrutscher, mehr nicht – aber er zeigt: Für Tage allein fehlt dir noch ein fester Ablauf.“
- ende3 sagt → „Am nächsten Tag um drei klopft Miriam an deinen Tisch: „Kommst du mit raus?““
- ende3 ende → „An diesem einen Tag hat der Automat gewonnen – für Tage allein fehlte noch ein Plan. Damit es kein Muster wird: Leg fest, was du um drei tust, wenn niemand mitkommt.“

**S18 · `l-08`: drei Stellen hängen vom Weg ab.**
- **k1b nach k1 wahl[2]:** Auf „Läuft so nebenher, ich bin nur nicht zum Zählen gekommen“ passt Tareks „Im Ernst? … Das ist nicht einfach weg.“ nicht. **Ersatz k1b sagt:** „Tarek zieht eine Augenbraue hoch: „Vor dem Urlaub konntest du schon im Restaurant bestellen. Das ist nicht einfach weg. Aber sag ehrlich – wie lange ist es her?““
- **k3 wahl[2] rueck:** „Abends bist du gerade aber leer“ wurde nur auf dem Weg über k2 wahl[1] gesagt. **Ersatz:** „Gut, dass es heute losgeht. Eine ganze Lektion am Abend nach Wochen voller Abgaben ist aber viel – das macht den Einstieg wacklig.“
- **ende1 ende:** Das Fazit nennt „Gründe statt Urteile, eine kleine Fassung zur frischen Zeit“ auch auf Wegen über „zu faul“ (k2 wahl[0]) und „heute Abend eine ganze Lektion“ (k3 wahl[2]). **Ersatz:** „Du bist zurück. Was einen Rückweg leicht macht: die Lücke nicht als Neuanfang bei null sehen, Gründe statt Urteile, eine kleine Fassung zur frischen Zeit statt Nachholen – und ein Plan für den nächsten Urlaub. Nicht alles davon hat heute geklappt; das Wiederkommen schon.“

**S19 · `l-09` k3 nach k2 wahl[0]:** Auf „Vielleicht ist eine Stunde einfach zu lang“ antwortet Lena „Nur zwei Abende?“. Zwei Abende hat niemand vorgeschlagen.
- **Ersatz k3 sagt:** „Lena überlegt: „Wenn ich ehrlich bin, gehen nur Dienstag und Donnerstag. Dann brauche ich ja ewig – der Kurs geht zwölf Wochen.““
- Dazu die Lage: „Ihr Plan: jeden Abend eine Stunde lernen“ → „Ihr Plan: an jedem Werktag abends eine Stunde lernen“. Sonst bleibt offen, was mit den Wochenenden war. Das passt dann auch zu „30 Minuten am Samstag“ als neuem Baustein.

**S20 · `l-11` k2 nach k1 wahl[2]:** Auf „Irgendwie hakt es, ich weiß selbst nicht genau, woran“ fragt Miriam „Nicht gut genug für wen?“. Von „nicht gut genug“ war nicht die Rede.
- **Ersatz k2 sagt:** „Miriam: „Lass mich raten: Es ist dir nicht gut genug. Nicht gut genug für wen – für Dr. Albers oder für dich?““

**S21 · `l-12`: zwei Knoten setzen Gesagtes voraus.**
- **k2 nach k1 wahl[1]:** Auf „Dann gönn dir heute Abend mal was Schönes“ sagt Carla „Seit dem Sommer, ehrlich gesagt.“, ohne dass jemand nach der Dauer gefragt hat. **Ersatz k2 sagt:** „Carla seufzt: „Ehrlich gesagt geht das schon seit dem Sommer. Ich schlafe, aber erholt bin ich nicht. Und selbst das Töpfern macht mir keinen Spaß mehr.““
- **k4:** „Und du meinst wirklich, ich soll damit zur Ärztin?“ setzt voraus, dass du das geraten hast. Auf den Wegen über „Burn-out“ und „Wochenplan“ (k2 wahl[0], wahl[2]) ist das nicht passiert. **Ersatz:** „Carla überlegt: „Den Kurs kann die Kollegin aus dem Atelier bis Februar übernehmen. Und sonst? Meinst du, ich sollte damit zur Ärztin?““

**S22 · `l-13`: zwei Knoten setzen Gesagtes voraus.**
- **k1b nach k1 wahl[1]:** Auf „Dann mach erst mal zwei Wochen Pause“ passt Svens „Klingt, als wär ich der Einzige, der in der Mitte schlappmacht“ nicht, denn von „Mitte“ war keine Rede. **Ersatz:** „Sven: „Pause? Dann fang ich im April bei null an. Bin ich eigentlich der Einzige, der mittendrin so schlappmacht?““
- **k4 nach k3 wahl[0]:** Auf „Egal warum – angefangen ist angefangen“ antwortet Sven „Doch, das gilt noch.“ **Ersatz:** „Sven überlegt: „Eigentlich will ich immer noch im Mai über die Linie – mal wieder auf etwas stolz sein. Aber die nächsten Wochen sind trotzdem zäh.““

**S23 · `l-14` k2 nach k1 wahl[1] und k1b wahl[0]:** Jule beantwortet „Was wolltest du damals mit den Kursen?“, obwohl auf diesen Wegen „Dann hör auf“ bzw. „Was ist am Freitag so schwer?“ gefragt wurde.
- **Ersatz k2 sagt:** „Jule: „Weißt du, warum ich überhaupt damit angefangen habe? Ich wollte, dass mehr Leute ins Café finden. Und ich wollte zeigen, was ich kann.““

**S24 · `l-15` k3 setzt „den Urlaub“ voraus.** „Und nach dem Urlaub? Wie bist du wieder reingekommen?“ passt nur nach k2 wahl[2]. Nach „Irgendwie lief es einfach“, nach „zu faul“ und nach k1 „Super! Ich habe total viel gelesen“ war von Urlaub oder Lücke nie die Rede.
- **Ersatz k3 sagt:** „Renate: „Und als es mal nicht lief – wie bist du wieder reingekommen?““
- wahl[0] text → „„Nach dem Urlaub erst gar nicht, wochenlang. Dann mit einer Seite pro Abend – ohne etwas nachzuholen.““ (102 Zeichen)

---

## KANN

| # | Datei | Kennung/Pfad | Befund | Vorschlag |
|---|---|---|---|---|
| K1 | einheiten-2 | `2-01` mission `m-09`, `2-02` mission `m-08` | Sprosse 9 kommt im Kurs vor Sprosse 8. `m-09` („Drei Termine … Wochenrückblick“) passt inhaltlich eher zu `2-06` | `m-09` an `2-06` hängen (Wochenrückblick passt zur Plan-Prüfung) und `2-01` mit `reflexion` enden lassen – oder so lassen |
| K2 | einheiten-2 | `2-01` Karte, `2-01-a` | Die vier Prüfungen und „in meiner Hand“ wiederholen die Prüffragen der Ziel-Pyramide (`pyramide.pruefFragen`) | als Brücke vertretbar; in der Karte „wie im Kompass“ ergänzen, damit es als Wiederholung erkennbar ist |
| K3 | einheiten-2 | `2-01-b` wahl[1] | „das Bastelprojekt, das ihn seit Langem reizt“: Diese Tatsache steht nicht in der Frage | „… an einem Bastelprojekt, das seine Neugier weckt“ |
| K4 | einheiten-2 | `2-02-b` wahl[0] | „Miriam fragen“: Dass Miriam es weiß, steht nicht im Text | „Heute in der Buchhaltung fragen, welche Belege nötig sind – das dauert zwei Minuten.“ |
| K5 | einheiten-2 | `2-03-a` karten[2] | „Er muss eine Weile an nichts denken.“ liest sich als Zwang oder Stimmung, nicht als Nutzen | „Er kann eine Weile an nichts denken.“ |
| K6 | einheiten-2 | `2-03-b` wahl[1] warum | „das Bedürfnis, abends noch etwas zu lesen“: In der Frage steht nur, dass er Mails liest | „… und auf dem Nachttisch wartet etwas anderes für die letzten Minuten des Tages.“ |
| K7 | einheiten-2 | `2-03-c` muster[1] | „Danach ist der Hunger meist kleiner“: unbelegte Körper-Aussage; die Dusche stillt nicht das Bedürfnis Hunger | „„Wenn ich die Tasche abstelle, gehe ich erst unter die Dusche – zum Ankommen. Danach koche ich in Ruhe, statt im Stehen zu naschen.““ |
| K8 | einheiten-2 | `2-03` Karte „Umbrüche nutzen“ | „ein Programm für neue Gewohnheiten“: Das Programm galt umweltfreundlichem Verhalten. „Langer Urlaub“ ist nicht untersucht | „ein Programm für umweltfreundliches Verhalten“; „aus einem langen Urlaub kommt“ streichen oder „vermutlich auch“ |
| K9 | einheiten-2 | `2-06` geschichte | Tareks „Mitbewohnerin“ passt nicht gut zu `smalltalk` („Mein Vater zieht zu uns“, eigene Wohnung) | „An allen war seine Familie zu Hause … gespielt wird, wenn die anderen beim Sport sind.“ |
| K10 | einheiten-2 | `2-06-a` | „Jeden Abend ein ganzes Kapitel“ (zu groß) und „Keller an einem Samstag“ (Zeit zu knapp) lassen sich beide in beide Fächer legen | im Auftrag unterscheiden: „Zeit zu knapp = einmaliges Vorhaben, das länger dauert als geplant“ |
| K11 | einheiten-3 | `3-01` belegHinweis, quellen | Die Einteilung in fünf Muster und „die meisten haben ein, zwei Lieblingsmuster“ ist Praxiswissen, steht aber nicht so da | belegHinweis ergänzen: „Die Einteilung in fünf Muster ist Praxiswissen.“; `praxis-antrieb` in die Quellen |
| K12 | einheiten-3 | `3-01-c` wahl[1] | „mit Dr. Albers … sprechen“: Dass er den Kurs verlangt, steht nicht in der Frage | „… oder mit der Person sprechen, die ihn erwartet“ |
| K13 | einheiten-3 | `3-02-m3` | fast dieselbe Merkkarte wie `2-03-m3` (Umzug) | „Was tust du vor einem Umzug für deine Gewohnheiten?“ / „Neue Auslöser festlegen, bevor sich zufällige Abläufe einschleifen.“ |
| K14 | einheiten-3 | `3-02-b` wahl[1] warum | „gewinnt die guten Gewohnheiten zurück“ klingt nach Zusage | „… hat gute Chancen, die guten Gewohnheiten mitzunehmen und alte leichter zurückzulassen.“ |
| K15 | lagen-2 | `l-10` k3 wahl[0] | „Die fünf Minuten Fotos“ setzt den Fünf-Minuten-Plan voraus. Den gibt es auf dem Weg über k2b „eh gelaufen“ nicht | „„Gern, ich komme! Fünf Minuten Fotos schaffe ich dann morgens.““ |
| K16 | lagen-2 | `l-10` k3 wahl[1] rueck | „lädt eher auf, als er kostet“ ist pauschal | „… kann gerade in einer harten Woche eher aufladen als kosten. Ein Plan darf sich biegen.“ |
| K17 | lagen-2 | `l-10` k1 | Herr Petersen (Kunde) „will die Zahlen früher“, aber es geht um einen Quartalsbericht | „Die Geschäftsführung will die Zahlen früher.“ |
| K18 | lagen-3 | `l-12` lage | Carla „gibt“ einen Töpferkurs. In `smalltalk-1` war sie gerade „zum ersten Mal in einem Töpferkurs“ | Zeitsprung erwähnen („seit dem Frühjahr leitet sie selbst einen Anfängerkurs“) oder die Lage auf „organisiert die Ausstellung ihres Töpferkurses“ umbauen |
| K19 | lagen-3 | `l-14` k4 wahl[2] | „einmal im Monat, sonntags“: Wir sitzen sonntags in ihrem geöffneten Café, zu hat es montags (`l-06`) | „einmal im Monat, an einem ruhigen Nachmittag“ |
| K20 | tests | `fc-029`, `fc-030`, `fc-035` | Aufbau und Antworten fast wie `2-04-a`, `2-05-b` und `3-03-d`. Der Formcheck misst so eher Wiedererkennen (wie `fc-012` in Phase 1) | jeweils die beste Antwort anders bauen, z. B. bei `fc-030` „Ein festes Ende: um sieben schließt sie ab und geht eine Runde, bevor sie heimfährt.“ |
| K21 | tests | `fc-031` | „Lenas Notizbuch“ ist das Requisit aus `l-09`. Dort lernt Lena dienstags, donnerstags und samstags, hier „keins am Wochenende“ | Figur tauschen: „Nach acht Wochen zeigt Carlas Trainingsheft …“ |
| K22 | wissen, vorrat | `w-061` (B ohne belegHinweis) · `v-0187` wahl[3] warum „musst am Ende du“ · `v-0111` M2, `v-0183` M1 („meine Schwester“), `v-0109` („meiner Tochter“), `v-0191` („Meine Kinder“) · `v-0101` „in ihrer Hand“ ohne Bezugsperson · `v-0164` „ich bin hoffnungslos“ (Warnwort aus `3-03`) · `v-0180` Fach „Überforderung“ statt „zu groß“ · `v-0223` „aber du suchst schon fachliche Hilfe“ · `v-0237` „mit dem meisten Wohlbefinden“ · `v-0136` Tarek kauft jeden Abend Bier | Kleinigkeiten | `w-061` belegHinweis: „Mehrfach gezeigt, meist mit Studierenden; wie groß der Puffer sein sollte, ist nicht untersucht.“ · „entscheidest am Ende du“ · Musterlösungen ohne eigene Verwandte („frage ich im Freundeskreis“) · „in deiner Hand“ · „ich bin ein hoffnungsloser Fall“ · „zu groß“ · „und du hast dir schon fachliche Hilfe geholt“ · „eher mit hohem Wohlbefinden“ · Bier → „eine Tüte Chips“ |

---

## Geprüft und in Ordnung

- **Ehrlichkeit:** Alle Zahlen (90 Tage, 38.000 Beschäftigte, zwölf Studien) haben geprüfte Quellen. Kein Wirkversprechen: „Die Stimmung folgt oft, nicht immer“, „Hinweise, dass es sich üben lässt“, Zusammenhänge sind als Zusammenhänge benannt. B-, D- und U-Einheiten haben ehrliche Hinweise. Die Rückfallvorbeugung ist als Denkmodell aus der Suchtbehandlung gekennzeichnet.
- **Erschöpfung:** Keine Diagnose, Weg zur Praxis, Vorhaben „mit Datum parken“ statt Durchhalten, „Pausieren ist nicht Aufgeben“. Die Lage `l-12` übt das Gespräch mit einer Kollegin, ohne Druck („Magst du …?“).
- **Menschen ohne Ziele bzw. Perfektionisten:** Loslassen ist ausdrücklich ein guter Ausgang (`3-05`, `l-14`, `l-15` „Klavier bewusst loslassen“ mit `wert: 2`). Wrosch ist richtig mit dem zweiten Teil wiedergegeben (neue Richtung). Ausdrücklich gilt: „Auch nach zwanzig Tagen: kein Urteil“.
- **Lagen:** Alle Zeitangaben habe ich nachgerechnet (`l-11`: Frist 10 Tage, „Eine Woche später … übermorgen“ ✓; `l-08`: zwei Wochen Urlaub plus drei Wochen Abgaben = fünf ✓; `l-09`: Dienstag und Donnerstag in drei Wochen ergeben höchstens sechs, also fünf Kreuze möglich ✓; `l-13`: Woche 6 von 12, Zwischenziel in drei Wochen ✓; `2-04-d` 48 von höchstens rund 69 Tagen ✓; `v-0220`/`v-0253` 6 × 3 = 18, 5 × 2 = 10 ✓). Alle Schluss-Fazits auf schwachen Wegen beginnen ohne Lob („Kein Drama – …“, „Eine verpasste Gelegenheit“). Ausnahmen stehen unter M2, S16 und S18.
- **Figuren:** Jonas, Carla (bis auf K18), Miriam, Nadine Köhler, Frau Sommer, Tante Renate und Dr. Albers sind stimmig. Tarek klettert in `fc-032`, `fc-037` und `v-0097`. Damit ist die Spannung aus Phase 1 („Sportmuffel“) aufgelöst.
- **Sprache:** Du-Form, „…“, keine verbotenen Wörter. „du musst“ kommt nur als zitierter schlechter Rat vor (`v-0192`).

## Urteil

**Freigabereif nach den zwei Muss-Punkten.** Die Sollte-Punkte sind vor allem Weg-Logik in den Lagen, Figurenbrüche, die neutrale Ansprache und die Abgrenzung zum Kompass. Sie sollten vor der Freigabe für alle gemacht werden, betreffen aber keine fachliche Grundaussage. Prüfskript: **0 Fehler, 0 Hinweise**.

---

## Umsetzung (25.11.2026)

Alle Muss- und Sollte-Befunde sind umgesetzt, die Kann-Befunde bis auf einen ebenfalls. Kennungen sind unverändert, gelöscht wurde nichts. Danach habe ich alle Wege jeder Lage `l-06` … `l-15` über eine Liste der eingehenden Kanten je Knoten erneut durchgesehen. **Prüfskript:** `--nur antrieb` meldet 0 Fehler und 0 Hinweise, `--soll antrieb` ist leer, `_index.json` ist neu gebaut.

### Muss

| # | Stand | Was genau |
|---|---|---|
| M1 | umgesetzt | `v-0224`: Auftrag „… ein Grund, dir Hilfe zu holen?“, Fach „Hilfe holen“, Karte „seit Wochen das Gefühl, dass alles keinen Sinn mehr hat“. `3-03-a`: Auftrag „… ein Grund, dir Hilfe zu holen?“, Fach „Hilfe holen“. `3-03`, Karte (Schritt 2): „Bei Gedanken, nicht mehr leben zu wollen, warte nicht: Sprich noch heute mit jemandem – der Hilfe-Hinweis am Ende zeigt, wo.“ Damit es unter 420 Zeichen bleibt, habe ich „einem freien Wochenende“ und „Er sagt nur …“ gestrichen und „der wichtigste Schritt, darüber zu sprechen“ zu „hilft zuerst ein Gespräch“ gekürzt. Statt „unten“ steht „am Ende“, weil der `fachhilfe`-Schritt `seele` der letzte Schritt der Einheit ist. Zusätzlich endet Merkkarte `3-03-m1` mit „Bei Gedanken, nicht mehr leben zu wollen: noch heute.“ Im Text steht keine Rufnummer. |
| M2 | umgesetzt | `l-10` k5 wahl[0] und rueck wie vorgeschlagen (129 Zeichen). Weil k5 von allen Wegen erreicht wird, habe ich auch `ende1` angepasst. Bisher behauptete es einen Eintrag auf der Landkarte, den der Weg über „War halt eine volle Woche“ nie gemacht hatte. Jetzt: sagt „Im Kalender stehen wieder drei Fotobuch-Termine …“, ende „Was diese Woche geholfen und was gefehlt hat, gehört auf deine Rückfall-Landkarte.“ |

### Sollte

| # | Stand | Was genau / Grund |
|---|---|---|
| S1 | umgesetzt | `ziel[1]` und `ziel[2]` wörtlich wie vorgeschlagen. |
| S2 | umgesetzt | `3-05`: `fragen[2]` und `[3]` ersetzt, `insBuch: "erfolg"`, Karte mit „… eigene Fragen zu Werten und Zielen; hier geht es um deine Pläne.“ |
| S3 | umgesetzt | `w-097` hat jetzt den Kern „Polieren“, der Erlauber-Satz ist erweitert. Den `belegHinweis` habe ich behalten, er stimmt weiter. `3-01`, Schritt 4: Text wie vorgeschlagen (402 Zeichen). |
| S4 | umgesetzt | `w-098` beschreibt jetzt die Probe, Quellen `praxis-antrieb` und `wendsche2017`. Den Verweis „der nächste Eintrag“ habe ich durch den Titel „Wenn der Antrieb über Wochen fehlt“ ersetzt. In der Datei steht `w-099` vor `w-098`, „der nächste“ wäre also falsch gewesen. |
| S5 | umgesetzt | `2-06-b`: Text und beide warum wie vorgeschlagen. |
| S6 | umgesetzt | `3-04-a`: „Noch fünf Wochen – heute ist das nächste Kapitel dran.“ Denselben Fehler gab es in `l-09` k4 wahl[1] („wenn du die Prüfung bestehst“). Dort steht jetzt „wenn du am Ende des Kurses die Formeln kannst“. |
| S7 | umgesetzt | `2-02`, `aufloesung` wie vorgeschlagen. Der Quellentext `steel2007` in `quellen.json` ist angeglichen: Am stärksten hängt geringe Gewissenhaftigkeit (Selbstkontrolle, Ablenkbarkeit, Organisation) mit Aufschieben zusammen. |
| S8 | umgesetzt | `fc-031` wahl[3]: „Zwanzig Kreuze in acht Wochen – das passt schon, ich mache einfach genau so weiter wie bisher.“ Die Antwort ist absichtlich etwas länger als vorgeschlagen, damit im Formcheck Können die beste Antwort höchstens in vier von acht Fragen die längste ist. Das warum steht wie vorgeschlagen da, das Wort „Wochenende-Muster“ fällt damit weg. |
| S9 | umgesetzt | `v-0228`: Frage und Einträge 3 und 4 wie vorgeschlagen. |
| S10 | umgesetzt | `2-05` Gesprächskarte, `l-11` „perfektionistisch“, `v-0229` „gebe ich auf“ und `l-08` „Che bello!“ – wie schön, du bist zurück. |
| S11 | umgesetzt | `v-0120`: Zuschuss zur Fortbildung, Muster „bei der zuständigen Stelle“. |
| S12 | umgesetzt | `2-01-c`: Frage wie vorgeschlagen, und die beste Antwort lautet jetzt „zwei neue Formeln“ statt „Funktionen“. Dazu sagt `l-09` jetzt „Tabellen-Aufbaukurs“. Den Kurs in `1-03` (Stufe 1) habe ich nicht angefasst. |
| S13 | umgesetzt | `v-0137`: Frage und wahl[2] wie vorgeschlagen. |
| S14 | umgesetzt | `l-06`: Das Café gibt es „seit gut einem Jahr“. |
| S15 | umgesetzt | In `3-03-b` steht eine namenlose Figur: „Ein Bekannter …“. Seine Liste habe ich vom Vorschlag abgewandelt: „die Kasse im Chor“ statt „Vorsitz im Verein“, sonst sähe man darin Svens Vereinsvorsitz aus `fc-039`. Sven kommt in `antrieb` jetzt nur noch als Läufer und Vereinsvorsitzender vor, nie als Erschöpfter. |
| S16 | umgesetzt | `l-06` ende2: Text wie vorgeschlagen. Ich habe die drei Wege dorthin geprüft. |
| S17 | umgesetzt | `l-07` k4 wahl[0] und wahl[1] rueck, ende3 sagt und ende wie vorgeschlagen. Zusätzlich k4 wahl[2] rueck: „du bleibst im neuen Ablauf“ stimmte auf dem Weg über die Nüsse nicht. Jetzt steht dort „Die halbe Pause – weg vom Bildschirm und am Automaten vorbei.“ |
| S18 | umgesetzt, abgewandelt | Der Vorschlag für k1b („wie lange ist es her?“) passte nicht zum Weg über k1 wahl[1], auf dem du die fünf Wochen schon genannt hast. Jetzt: „Tarek schaut dich über den Becher an: „… So was ist nicht einfach weg. Aber sag ehrlich: Wie steht's wirklich?““ Die Antwort k1b wahl[1] beginnt deshalb mit „Ehrlich? Es ist weg. …“ statt mit „Doch.“ k3 wahl[2] rueck steht wie vorgeschlagen da. ende1 schließt nicht mit „Nicht alles davon hat heute geklappt“, denn auf dem besten Weg hat alles geklappt. Stattdessen: „Schau, ob dir einer dieser Bausteine heute noch gefehlt hat.“ Zusätzlich ende3: „Der Wiedereinstieg kam“ statt „hat geklappt“. |
| S19 | umgesetzt | `l-09`: k3 sagt und Lage („an jedem Werktag“) wie vorgeschlagen. Passend dazu sagt k3 wahl[1] „bei jedem Werktag“. |
| S20 | umgesetzt, abgewandelt | „Lass mich raten …“ hätte auf den beiden Wegen nicht gepasst, auf denen du „nicht gut genug“ schon selbst gesagt hast. Jetzt: „Miriam: „Ich kenn das – meistens steckt dahinter: nicht gut genug. Aber nicht gut genug für wen? …““ Zusätzlich ende1: „Was gegen dieses Muster hilft: es erkennen …“ statt „Was hier geholfen hat“. Das lobt nicht auf schwachen Wegen. |
| S21 | umgesetzt | `l-12`: k2 wie vorgeschlagen. k4 lautet: „… Und die Müdigkeit … Meinst du, ich sollte damit mal zur Ärztin?“ |
| S22 | umgesetzt | `l-13`: k1b „Pause? Dann komm ich doch gar nicht mehr rein. …“ („nie wieder“ ist ein verbotenes Wort). k4 steht wie vorgeschlagen da. Dazu kam ein dritter Bruch: k2 „Und was soll da helfen?“ folgte auch auf die Frage „Wie viele Läufe …?“. k1 wahl[2] ist deshalb jetzt eine Aussage („Du bist schon sechs Wochen dabei – schau mal, wie viel du schon geschafft hast.“), und k2 lautet „Mag sein. Aber wie komm ich durch die nächsten Wochen?“ |
| S23 | umgesetzt, abgewandelt | `l-14` k2: „Jule überlegt: „Angefangen habe ich ja aus zwei Gründen: …““ Das passt auf alle drei Wege. Dazu k3: Das „Eigentlich schon.“ am Anfang ist weg, weil es nur auf „Hat sich das erfüllt?“ antwortete. |
| S24 | umgesetzt, abgewandelt | `l-15` k3: „Und gab es auch Zeiten, in denen es nicht lief? Wie bist du da wieder reingekommen?“ „Als es mal nicht lief“ hätte nach „Super! Ich habe total viel gelesen“ eine Lücke vorausgesetzt. wahl[0] steht wie vorgeschlagen da. |

### Kann

| # | Stand | Grund |
|---|---|---|
| K1 | umgesetzt | `m-09` steht jetzt am Ende von `2-06` (Wochenrückblick passt zur Plan-Prüfung). `2-01` endet mit der Reflexion „Wie lautet dein Vorhaben für die nächsten 90 Tage – und besteht es alle vier Prüfungen?“ Sprosse 8 kommt damit vor Sprosse 9. |
| K2 | umgesetzt | In der Karte heißt es jetzt „Vier Prüfungen, zum Teil wie im Kompass:“. „Zum Teil“, weil die Lernziel-Prüfung im Kompass nicht vorkommt. |
| K3–K10 | umgesetzt | wie vorgeschlagen. Bei K8 habe ich den Urlaub ganz gestrichen, sonst wäre die Karte zu lang geworden. Bei K9 heißt es jetzt „jemand zu Hause … wenn die anderen beim Sport sind“. Bei K10 steht die Erklärung zu „Zeit zu knapp“ im Auftrag. |
| K11–K14 | umgesetzt | wie vorgeschlagen. Bei K12 steht jetzt „… mit der Person, die den Kurs erwartet, über einen anderen Weg sprechen“. |
| K15–K17 | umgesetzt | Bei K15 sagt die Rückmeldung jetzt „Und mit fünf Minuten am Morgen bleibt der Faden trotzdem“. Das „Du verschiebst die kleine Fassung“ setzte den Fünf-Minuten-Plan voraus. |
| K18 | umgesetzt | `l-12`, Lage: Carla „hilft seit dem Frühjahr im Anfängerkurs ihres Töpferateliers mit“. So passen auch „Den Kurs kann die Kollegin übernehmen“ und das Ende ohne weitere Änderungen. |
| K19 | umgesetzt | „einmal im Monat, an einem ruhigen Nachmittag“. |
| K20 | umgesetzt | `fc-029`: Die beste Antwort sieht den Ausrutscher jetzt als Hinweis auf eine riskante Lage („Acht Wochen sind nicht weg …“). `fc-030`: „Ein festes Ende: Um sieben schließt sie ab, lässt den Laptop im Café und geht eine Runde …“; die Antwort mit `wert: 1` ist länger geworden. `fc-035`: „Sortieren: Was gibt ihm Kraft, was kostet nur? …“ |
| K21 | umgesetzt | `fc-031`: Carlas Trainingsheft (Carla läuft dreimal pro Woche, siehe `l-12`). |
| K22 | umgesetzt | alles wie vorgeschlagen. Bei `v-0109` und `v-0191` steht jetzt Sven statt Tochter und Kinder. Bei `v-0136` sind es Chips statt Bier und „ein Apfel“ statt alkoholfreiem Bier. |

### Offen für den Hauptstrang (außerhalb von `antrieb/`)

- `antrieb-w-099` („Wenn der Antrieb über Wochen fehlt“, Phase 1) nennt „alles sinnlos oder hoffnungslos“ als Grund für Unterstützung. Den Satz für den Akut-Fall („nicht mehr leben wollen → noch heute“) habe ich dort nicht ergänzt, denn der Bericht verlangt das nicht, und Wissens-Einträge können keinen `fachhilfe`-Schritt tragen. Er wäre aber eine sinnvolle Ergänzung.
- Jule über die Bereiche hinweg: In `smalltalk/vorrat-02` eröffnet sie das Café gerade erst, in `antrieb` k/m hat sie es seit gut einem Jahr. Das ist als Zeitsprung vertretbar, im Figurenblatt aber nirgends festgehalten.
- Die übrigen Fehler im Gesamtlauf des Prüfskripts gehören zu `stegreif`, nicht zu `antrieb`.
