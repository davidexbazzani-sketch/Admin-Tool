# Gegenlesen: Bereich `mut`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser (Verhaltenstherapie/Exposition nach Craske, schüchterner Nutzer, Faktenprüfung) · **Inhaltsdateien:** nicht geändert, nur Befunde mit Ersatztext.

## Was geprüft wurde

- **Neu:** `einheiten-2.json` (`mut-2-01` … `-06`), `einheiten-3.json` (`mut-3-01` … `-05`), `lagen-2.json` (`mut-l-06` … `-10`), `lagen-3.json` (`mut-l-11` … `-15`), `vorrat-03.json` (`mut-v-0091` … `-0170`), `vorrat-04.json` (`mut-v-0171` … `-0250`). Dazu die angehängten Lerntage `"phase": "k"`/`"m"` in `kurs.json`, die Szenarien `mut-fc-025` … `-040` in `tests.json`, die neuen Wissens-Einträge (`w-016` … `-019`, `-054`, `-056`, `-057`, `-064`, `-079`, `-089`, `-124`, `-125`) und die neuen Quellen (`brooks2015`, `savitsky2001`, `vervliet2013`, `shiban2013`).
- **Maßstab:** `08_ENTSCHEIDUNGEN.md`, `06_INHALT_REGELN_MUSTER.md` (Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (3a ff.), `05_LEHRPLAN.md` 3.3, `01_KONZEPT.md` §10 und §18, `besetzung.json`, `gegenlesen/mut.md`. Jede Lage habe ich Weg für Weg durchgespielt.
- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur mut` → **0 Fehler, 0 Hinweise**. Ein späterer Lauf meldete nur „`_index.json` veraltet“. Das kam von gleichzeitigen Änderungen in anderen Bereichen. `coach-index` habe ich nicht ausgeführt, weil es eine gemeinsame Datei ist. `--soll mut` meldet für `mut` nichts.
- **Eigene Zählskripte** (in `scratchpad/mutkm/`): Antwortlängen, beste = längste, Positionen, „Sie“ außerhalb wörtlicher Rede, Anführungszeichen, laut/leise-Paare. Die App mischt die Antworten (`Wahl.tsx`, `Gespraech.tsx`), die Position spielt also keine Rolle.
- **Quellen nachgeschlagen:**
  - `shiban2013`: 30 Patienten, viermal virtuelle Spinne, eine Gruppe in einem Kontext, eine in mehreren. Der Renewal-Test fand in einem neuen Raum statt, dazu kam ein Test mit einer echten Spinne. Die Rückkehr der Angst war geringer, auch beim echten Test. ✓ Eine Folgestudie derselben Gruppe (2015) fand den Vorteil nur kurzfristig, siehe K12.
  - `brooks2015`: kompetenter bei schweren Aufgaben und bei sachkundigen Gefragten, bei leichten kein Schaden. ✓
  - `vervliet2013`: bibliografisch ✓. Inhalt laut Quellentext: nicht löschen, sondern hemmen; Rückkehr nach Kontext, Zeit und Zustand. Eine Aussage, dass der Wiedereinstieg schneller geht als beim ersten Mal, steht dort **nicht**. Gefunden habe ich eher das Gegenteil, die schnelle Wiederkehr der Angst (siehe M1).
  - `savitsky2001`, `milliken2003`, `nemeth2001`, `levine2018`, `abiesber2022` und `givi2024` habe ich an den Quellentexten in `gespraech/quellen.json` abgeglichen. Die Wiedergaben passen, mit kleinen Zuspitzungen (K1, K2).

## Gesamteindruck

Die neuen Phasen vertiefen sinnvoll und wiederholen nicht nur:
- Das Nein hält beim Nachhaken.
- Der Einwand hat drei Teile.
- Die Bitte ist klar und leicht ablehnbar.
- Kritik wird gehört, nachgefragt und später sortiert.
- Die ersten 30 Sekunden sind vorbereitet.
- Mutproben und Sammelwoche folgen klaren Regeln.
- Abwechseln, Rückfall-Plan und Vortrag mit Probe-Treppe stehen am Ende.

Die Expositions-Logik ist im Kern richtig: Die Angst wird überstimmt, nicht gelöscht. Wechselnde Orte helfen, Krücken werden schrittweise abgebaut, nach einem Rückfall steigt man eine Sprosse tiefer ein statt bei null. Die rote Linie „erfundene Mehrheit“ (`w-057`) taucht nur zum Erkennen und Abwehren auf (`w-057`, `v-0227`, `v-0229`). Es gibt keine Rufnummern und nichts mit Minderjährigen. Die Fachhilfe `seele` steht in `3-05`. Die Sammelwoche-Regeln (`3-04`, `w-056`, `v-0234`) lehren ausdrücklich „kein Nachhaken, niemand, der nicht wegkann“.

**Die Hauptmängel:**
1. Eine wiederkehrende, nicht belegte Wirkbehauptung: Nach einem Rückfall gehe es „schneller als beim ersten Mal“.
2. Zweimal gibt es halbe Punkte fürs Nachhaken nach einem Nein in einer Mutprobe.
3. Sieben Logikfehler in Lagen und Dialogen.
4. Mehrere Schluss-Fazits loben auf schwachen Wegen genau das, was dort nicht geschehen ist.

**Zählung:** muss 5 · sollte 16 · kann 16

---

## MUSS

### M1 · Leistungsversprechen ohne Beleg: „Nach dem Rückfall geht es schneller als beim ersten Mal“

`vervliet2013` belegt nur, dass die alte Angst zurückkehren **kann** und dass sich die neue Erfahrung stärken lässt. Dass der zweite Anstieg schneller geht, ist für Menschen nicht belegt. In der Lernforschung ist eher die schnelle Wiederkehr der *Angst* beschrieben. Der Satz ist ein Wirkversprechen in einem Mythos-Eintrag mit Beleg U. Er wird in sechs Inhalten als Tatsache wiederholt.

| Datei | Kennung/Pfad | Zitat | Ersatz |
|---|---|---|---|
| wissen | `mut-w-089` text | „Mit ein paar Sprossen kommt sie meist schneller zurück als beim ersten Mal.“ | „Mit ein paar Sprossen holst du sie wieder nach vorn – du kennst den Weg schon.“ |
| einheiten-3 | `mut-3-05` Schritt `mythos`, warum | „… mit ein paar Sprossen holst du die neue meist schneller zurück als beim ersten Mal.“ | „… mit ein paar Sprossen holst du die neue wieder nach vorn.“ |
| einheiten-3 | `mut-3-05-b` Antwort „Zwei Sprossen tiefer …“, warum | „… Meist geht es danach schneller nach oben als beim ersten Mal.“ | „Ein leichterer Wiedereinstieg holt die neue Erfahrung zurück, ohne zu überfordern – dann Sprosse für Sprosse wieder hoch.“ (siehe auch S8) |
| lagen-3 | `mut-l-14` ende1, ende | „… Es ging schneller zurück nach oben als beim ersten Mal.“ | „Rückfall erkannt, wieder eingestiegen, die alte Angst als bekannte Welle genommen. Die neue Erfahrung war nicht weg – sie brauchte nur einen Anlauf.“ (behebt zugleich „eine Sprosse tiefer eingestiegen“ auf dem Weg k2/Wahl 2 „Gleich am Montag wieder den ganzen Rückblick“) |
| vorrat-04 | `mut-v-0201` Eintrag 4, warum | „Meist geht es schneller nach oben als beim ersten Mal.“ | „Geht die tiefere Sprosse wieder, ist der Weg nach oben frei.“ |
| vorrat-04 | `mut-v-0242` Antwort 1, warum | „Wer wieder einsteigt, ist meist schneller oben als beim ersten Mal.“ | „Rückfälle gehören zum Verlauf. Wer eine Sprosse tiefer wieder einsteigt, holt die neue Erfahrung zurück.“ |

**Mildern** (gleiche Richtung, „schnell“ streichen):
- `l-14` k2/Wahl 1, rueck: „holt die neue Erfahrung schnell zurück“ → „holt die neue Erfahrung zurück“
- `v-0198` Antwort 1, warum: „… schnell zurück“ → „… zurück“
- `v-0208` Antwort 1, warum: „kommt Carla meist schnell wieder hinein“ → „kommt Carla wieder hinein“
- `v-0241` Antwort 1, warum: „meist schnell zurück“ → „zurück“
- `fc-033` Antwort 2, warum: „stärkt sie schnell“ → „stärkt sie“

### M2 · Halbe Punkte fürs Nachhaken nach einem Nein in der Mutprobe

`01_KONZEPT` §18 sagt: „eine Bitte, ein Dank, kein Nachhaken nach einem Nein“. Die eigene Regel von `2-06` sagt das auch. Beide Stellen belohnen das Gegenteil mit `wert: 1`. Die Begründung sagt zwar „das übst du hier nicht“, der Punkt bleibt aber.

1. **einheiten-2, `mut-2-06-c`**, Antwort 2 (`wert: 1`): „Noch einmal nachfragen, ob sie dir wenigstens fünf Euro entgegenkommt – Handeln gehört auf dem Flohmarkt schließlich dazu.“
   - **Ersatz:** Die Antwort ersetzen durch `{ "text": "„Schade – trotzdem eine schöne Lampe.“ – und weitergehen, ohne es dir zu notieren.", "wert": 1, "warum": "Freundlich, kein Nachhaken – gut. Ohne Notiz geht der Beweis „Es war auszuhalten“ aber schnell verloren." }`.
   - Wahlweise kommt das Nachhaken als vierte Antwort dazu: `"wert": 0, "tendenz": "nachhaken", "warum": "Auf dem Flohmarkt ist Handeln üblich – für die Mutprobe gilt aber: eine Bitte, ein Dank, kein Nachhaken. Sonst übst du, ein Nein nicht stehen zu lassen."`
2. **lagen-2, `mut-l-09` k3**, Wahl 2 (`wert: 1`): „„Und achtzehn? Ich würde sie auch sofort mitnehmen.““
   - **Ersatz:** `"wert": 0, "tendenz": "nachhaken"`, rueck: „Auf dem Flohmarkt üblich – in der Mutprobe gilt aber: eine Bitte, ein Dank, kein Nachhaken. Geübt wird, ein Nein stehen zu lassen.“ (Weiter nach k3b bleibt.)

### M3 · Lagen-Logik: Figuren reagieren auf etwas, das auf diesem Weg nie gesagt wurde

1. **einheiten-3, `mut-3-03-b`** („Weihnachten bei dir?“), Weg k1/Wahl 3 → k2. Die Wahl lautet „„Ich weiß gar nicht, wie ich anfangen soll … es geht um Weihnachten.““. Renate antwortet in k2 aber auf ein Nein: „Nach allem, was ich früher … gekocht habe? Das hätte ich nicht von dir gedacht.“
   - **Ersatz Wahl 3:** „„Ich weiß gar nicht, wie ich anfangen soll … Weihnachten feiere ich dieses Jahr nicht bei mir.““, rueck: „Ehrlich und gesagt. Den Anlauf vorweg hättest du nicht gebraucht.“
2. **Gleicher Dialog**, Weg k1/Wahl 2 → k1b/Wahl 1 → k2/Wahl 2 → ende1. Renate sagt: „Dann bringst du am zweiten Feiertag aber deinen Kartoffelsalat mit.“ Der zweite Feiertag wurde auf diesem Weg nie angeboten.
   - **Ersatz k1b/Wahl 1:** „„Genau darüber wollte ich reden. Dieses Jahr feiere ich nicht bei mir. Am zweiten Feiertag komme ich gern.““ (≤ 140 Zeichen)
3. **lagen-2, `mut-l-07` ende1.** Der Text „Am Abend trägst du dir die Fortbildung für Januar in den Kalender ein.“ ist über k3/Wahl 2 (→ k3b) und k3/Wahl 3 („Okay. Schade.“) erreichbar. Dort ist der Januar nie gefallen. Außerdem stimmt das Fazit „Klar gebeten“ nach k2/Wahl 3 („Weiß nicht, ob das was wäre“) nicht.
   - **Ersatz sagt:** „Am Abend schreibst du die Fortbildung auf deine Liste fürs nächste Jahr.“
   - **Ersatz ende:** „Gebeten, ein Nein gehört – und gemerkt, dass es der Sache galt, nicht dir. Die nächste Bitte wird leichter.“
   - Dazu k3a: „Reichen Sie es im Januar ein.“ → „Reichen Sie es im Januar für den nächsten Termin ein.“ Die Anmeldung für März läuft ja Freitag ab.
4. **lagen-2, `mut-l-10`**, Weg k2/Wahl 3 („Das Lager ist noch nicht geschult.“) → k3/Wahl 3 → k4. Dr. Albers sagt: „Dann der Fünfzehnte.“ Der Fünfzehnte wurde auf diesem Weg nie vorgeschlagen.
   - **Ersatz k3/Wahl 3:** „„Ich weiß. Aber ohne Schulung gibt es im Lager erst mal Durcheinander. Der Fünfzehnte wäre sicherer.““
5. **lagen-3, `mut-l-13` k4.** Der Text lautet „Die Antwort: „Nee, sorry, wir müssen gleich los.““. Er ist auch über k3/Wahl 3 erreichbar („Warten, bis jemand allein vorbeikommt.“), dann spricht aber eine Einzelperson. k4b/Wahl 1 sagt ebenso „Sie mussten los.“
   - **Ersatz k4 sagt:** „Die Antwort: „Nee, sorry, gerade keine Zeit.““
   - **Ersatz k4b/Wahl 1:** „Sortieren: „Keine Zeit – das Nein galt der Lage, nicht mir.“ Dann weiter zum Fest.“
6. **lagen-3, `mut-l-13` ende3.** Der Text lautet „Am Abend steht auf deiner Liste kein Haken.“ und „Der Sammeltag ist ausgefallen … Die Bitten waren zu groß.“ Erreichbar ist das auch über k4b/Wahl 2 und k3b/Wahl 2, also nachdem schon gefragt wurde. Dann stimmen „kein Haken“, „ausgefallen“ und die Diagnose „zu groß“ nicht.
   - **Ersatz sagt:** „Am Abend fehlen auf deiner Liste ein paar Haken.“
   - **Ersatz ende:** „Der Sammeltag endete früher als geplant – kein Urteil, nur ein Hinweis. Nächstes Mal nach einem Nein oder Zögern sortieren: Bitte, Lage oder ich? Und die nächste Bitte gehen, notfalls eine kleinere.“
7. **lagen-3, `mut-l-15` k5b.** Der Text lautet „Nach der Versammlung hältst du den Kassenordner in der Hand.“, dann folgt Wahl 1 „Am nächsten Tag zum Vorstand …“ → k6/k7. Dort fragst du die Versammlung („Wer mag?“), und es wird abgestimmt, obwohl sie vorbei ist.
   - **Ersatz k5b sagt:** „In der Pause hält dir der Vorstand schon den Kassenordner hin.“
   - **Wahl 1:** „Noch in der Pause: „Ich habe vorhin zu schnell Ja gesagt. Die Kasse übernehme ich nicht.““
   - **Wahl 2:** „Den Ordner nehmen und dich ärgern.“

### M4 · Schluss-Fazit lobt auf schwachen Wegen das Gegenteil dessen, was geschah (ohne Rückweg)

1. **lagen-2, `mut-l-06` ende1:** „Ein Nein, mehrmals gehalten – ohne neue Gründe und ohne Gegenangriff.“ Das ist auch über k2/Wahl 1 erreichbar („… weil meine Schwester Geburtstag hat und ich diese Woche auch echt platt bin …“, also neue Gründe).
   - **Ersatz ende:** „Das Nein hat gehalten – auch beim dritten Anlauf. Tarek hat seine Lösung gefunden, du deinen Samstag behalten. Je weniger Gründe, desto weniger Angriffsfläche.“
2. **lagen-2, `mut-l-08` ende1:** „Der Anfang frei, die Kritik angehört, nachgefragt – und was stimmte, mitgenommen.“ Das ist auch über k2/Wahl 1 erreichbar („Ich bin ja kein großer Redner …“, `wert 0`, ohne Rückweg) und über k4/Wahl 2 (verteidigt, nichts angenommen).
   - **Ersatz ende:** „Kritik angehört und nachgefragt – so wurde aus „zu kompliziert“ ein konkreter Punkt. Die Kritik galt einem Detail, nicht dir.“ (ende1 wird nur über das Nachfragen in k3/k3b erreicht.)
3. **lagen-3, `mut-l-11` ende1:** „Geprobt wie im Ernstfall, den Blick bei den Zuhörern gehalten, eine Lücke offen zugegeben.“
   - Das ist auch nach k4b/Wahl 2 erreichbar („„Das glaube ich nicht.““, eine geratene Antwort wird verteidigt), nach k2/Wahl 2 (hektisch gekürzt) und nach k1/Wahl 2 (nur still gelesen).
   - **Ersatz ende:** „Die oberste Sprosse ist gegangen – zehn Minuten vor dem Verein, mit allem, was dazwischenkam. Was du mitnimmst: proben wie im Ernstfall, Blick zu den Zuhörern, Lücken offen zugeben.“
   - Ebenso ende2: „Der Vortrag war gut – das Ansehen hat ihn kleingemacht.“ ist auf denselben schwachen Wegen erreichbar. **Ersatz:** „Der Vortrag ist gehalten – das Zählen hat ihn kleiner gemacht, als er war.“
4. **lagen-3, `mut-l-13` ende1:** „Gefragt, Neins gehört, gedankt, weitergemacht. Die Neins waren nach Minuten vorbei – das Ja hat dir eine Tür geöffnet, die ohne die anderen Bitten zu geblieben wäre.“
   - Über k1/Wahl 3 → k1b/Wahl 1 → k3/Wahl 2 → k3b/Wahl 1 → k5 gibt es **kein einziges Nein**.
   - Dass das Ja des Chors von den anderen Bitten abhing, ist erfunden.
   - **Ersatz ende:** „Gefragt, gedankt, weitergemacht – auch nach einem Nein oder einer ausgelassenen Bitte. Am Ende stand ein Ja, das du ohne Fragen nie bekommen hättest.“
   - Dazu k6/Wahl 3, rueck: „Die Neins galten Budget und Zeit.“ → „Ein Nein ist keine Blamage – es galt der Bitte oder der Lage.“
5. **vorrat-03, `mut-v-0117` ende1:** „Ein Nein ohne Polster – und es hat gereicht. Die Krücke „gute Gründe“ brauchtest du nicht.“ Das ist auch über k2/Wahl 2 erreichbar (lange Begründung, `rechtfertigen`).
   - **Ersatz ende:** „Das Nein hat gehalten. Je weniger Polster, desto weniger muss es aushalten – „Es passt mir nicht“ genügt.“

### M5 · Widerspruch zur eigenen Lehre: neuer Ort „weckt eher nicht“

**vorrat-04, `mut-v-0247`** fragt „Kann das die alte Angst wieder wecken?“. Die Karte „eine Sprosse an einem neuen Ort“ steht unter „eher nicht“. Der Bereich lehrt aber das Gegenteil: `3-05` Karte („Typische Auslöser … neuer Ort“), `w-018`, `v-0245` („Neuer Ort, alte Angst – das ist typisch“), `v-0249` und `fc-033`. Ein neuer Ort ist der Musterfall für die Rückkehr der Angst; er beugt erst auf Dauer vor.
- **Ersatz Karte:** „eine geschaffte Sprosse ab und zu an wechselnden Orten wiederholen“ (Fach 1)

---

## SOLLTE

**S1 · Mutprobe-Beispiele mit Menschen, die bei der Arbeit nicht wegkönnen.** Die Regel steht in `01` §18, in der Karte von `2-06` selbst und in `w-123`. Die Phase 1 hat das Café-Rezept genau deshalb ersetzt. Vier neue Beispiele bitten Arbeitende um etwas, das nicht zu ihrer Dienstleistung gehört:
- **einheiten-3, `mut-3-04-c`:** „in einem kleinen Hofladen, ob du kurz zuschauen darfst, wie der Käse gemacht wird. Der Mann hinter dem Tresen …“. Die beste Begründung „es sagt mehr über seinen Tag als über deine Bitte“ deutet ohne Grundlage, die Bitte war hier wirklich aufdringlich.
  - **Ersatz beschreibung:** „Du fragst auf dem Flohmarkt einen Händler, ob er dir kurz erklärt, wie die alte Kamera funktioniert. Er antwortet gereizt: „Bin ich hier die Volkshochschule?““
  - **Ersatz beste Begründung:** „Ein schroffes Nein ist auch ein Nein – es galt der Bitte, nicht dir. Gesammelt ist gesammelt.“
- **einheiten-3, `mut-3-04-b`**, Eintrag 1: „In einer kleinen Werkstatt fragen, ob du bei einer Reparatur zuschauen darfst“
  - **Ersatz:** „Im Gemeinschaftsgarten fragen, ob du beim Veredeln zuschauen darfst“, warum: „Ungewöhnlich und kostet die anderen Zeit – ein Nein liegt nahe.“
- **vorrat-04, `mut-v-0203`**, Muster 2: „in einer kleinen Werkstatt fragen, ob ich zuschauen darf“
  - **Ersatz:** „im Gemeinschaftsgarten fragen, ob ich beim Veredeln zuschauen darf“
- **einheiten-2, `mut-2-06`**, Geschichte „Tarek und die Gärtnerei“: Tarek fragt den Gärtner bei der Arbeit, und das als Vorbild.
  - **Ersatz** des Anfangs: „Am Samstag stand er im Kleingartenverein am Zaun eines älteren Gärtners, der gerade seine Beete pflegte. Er fragte, ob er zehn Minuten zuschauen dürfe. „Heute nicht, ich hab gleich Besuch.“ …“
  - Später: „Zwei Wochen später fragte er eine andere Gärtnerin im Verein.“ (Rest bleibt, Titel „Tarek im Kleingarten“.)

**S2 · Mutprobe-Missionen ohne Einschalten.** `2-06` endet mit `mut-m-09`, `3-04` mit `mut-m-10`. Beide tragen `"mutprobe": true`. `MissionWahl` (`src/coach/ablauf/Mission.tsx`) zeigt sie unabhängig vom Schalter `profil.mutproben`. Laut `01` §10 haben Mutproben einen „eigenen Schalter“, und die Karte in `2-06` sagt selbst „du schaltest sie dort selbst ein“.
- **Empfehlung an den Hauptstrang (Technik):** Bei `m.mutprobe && !profil.mutproben` die `halb`-Fassung oder einen Hinweis „Mutproben sind ausgeschaltet – hier die kleine Fassung“ zeigen.
- **Inhaltlich gleichwertig:** Beide Einheiten mit `experiment` und `reflexion` enden lassen (`"mission"` entfällt). Experiment-Auftrag für `2-06`: „Wenn du Mutproben eingeschaltet hast: Geh diese Woche die unterste Mutprobe deiner Leiter. Sonst: Bitte eine vertraute Person um etwas, bei dem sie gut Nein sagen kann.“

**S3 · tests, `mut-fc-032`**, Antwort 3 (`wert: 1`): „„Probier es lieber tagsüber im Café.““. Damit bekommt das Erbitten der Telefonnummer einer fremden Person einen halben Punkt. Das ist keine Mutprobe nach dem Katalog und kann belästigend sein (Flirt-Regeln in §18).
- **Ersatz:** „„Dann wenigstens tagsüber und nicht in der Bahn.““, warum: „Der Ort wäre fairer. Eine Fremde um die Nummer zu bitten bleibt aber für den Anfang sehr groß – und kann aufdringlich wirken.“

**S4 · einheiten-2, `mut-2-06` aha:** „… und erlebt, dass es klein bleibt, verliert die Angst davor“. Das widerspricht der eigenen Lehre aus `3-05` und `w-018` („überstimmt, nicht gelöscht“) und klingt nach einem Versprechen.
- **Ersatz:** „Bei einer Mutprobe ist nicht das Ja das Ziel, sondern die Frage. Wer ein Nein freiwillig riskiert und erlebt, dass es klein bleibt, dem wird die Angst davor kleiner – nicht durch Nachdenken, sondern durch Tun.“

**S5 · einheiten-2, `mut-2-03` aha:** „Wer bittet, unterschätzt, wie oft andere Ja sagen – und fürchtet, schwach zu wirken. Beides trifft selten zu.“ Wörtlich heißt das, auch das Unterschätzen treffe selten zu. Damit widerspricht der Satz sich selbst.
- **Ersatz:** „Wer bittet, unterschätzt, wie oft andere Ja sagen – und fürchtet, schwach zu wirken. Beide Sorgen sind meist größer als die Wirklichkeit. Eine gute Bitte ist kurz, konkret und lässt ein Nein leicht.“

**S6 · Halbe Punkte für sachlich Falsches** (nach dem Muster aus `NACHARBEIT.md`):
- **einheiten-2, `mut-2-04-c` k1b**, Wahl 2 (`wert: 1`): „„Schon gut, ich weiß selbst, dass es nicht gut war.““ Das ist eine Selbstabwertung, die zum schwachen Ende führt.
  - **Ersatz:** `"wert": 0, "tendenz": "abwerten"`, rueck: „Du stimmst einem Urteil zu, das Miriam gar nicht gefällt hat – und beendest das Gespräch, bevor du etwas mitnehmen kannst.“
- **vorrat-04, `mut-v-0232`**, Antwort 3 (`wert: 1`): „Noch mehr Bitten pro Tag, damit es schneller geht.“ Die eigene Begründung sagt das Gegenteil („Tempo anpassen“).
  - **Ersatz:** „Weitermachen wie bisher und abwarten, ob die Müdigkeit vergeht.“ (`wert 1`), warum: „Dranbleiben ist gut. Erschöpfung ist aber ein Zeichen, das Tempo anzupassen – kleinere Bitten, ein, zwei Tage Pause.“ Wahlweise „Noch mehr Bitten …“ als vierte Antwort mit `wert 0`, `tendenz: zu_gross`.

**S7 · Fazit auf schwachen Wegen mit Rückweg (zu viel Lob, sachlich ungenau):**
- `2-01-d` ende1: „Würdigen, Nein – und beim Nachhaken dasselbe Nein noch einmal.“ Das ist auch nach „Nee, sorry.“ (kein Würdigen) und nach der Entschuldigung in k2 erreichbar.
  - **Ersatz:** „Das Nein hat gehalten, auch beim Nachhaken – und die Freundschaft auch. Am leichtesten geht es mit: würdigen, Nein, beim Nachhaken dasselbe Nein.“
- `2-04-c` ende1: „Nachgefragt, angenommen, was stimmt …“ Das ist auch nach k2/Wahl 2 (`rechtfertigen`) erreichbar.
  - **Ersatz:** „Nachgefragt – und dabei ein Werkzeug und ein Lob mitgenommen, die du ohne Nachfrage nie gehört hättest. Was stimmt, darfst du ohne Erklärung annehmen.“
- `l-12` ende1: „Selbst angesetzt, gleich zur Sache, beim Abwiegeln standgehalten. … und die Freundschaft ist eher gewachsen.“ Das ist auch über k2/Wahl 2 (kleingeredet) erreichbar, und „gewachsen“ ist unbelegt.
  - **Ersatz:** „Selbst angesetzt, den Wunsch gesagt, beim Abwiegeln drangeblieben. Die Befürchtung war größer als das Gespräch.“
- `l-15` ende1: „… ein Amt abgelehnt, um Hilfe gebeten und ein halbes Nein angenommen.“ Über k6/Wahl 1 → k7b fehlt die Abstimmung, „Gegenwind hereingeholt“ fehlt nach k3/Wahl 3.
  - **Ersatz:** „Vorgetragen, Gegenwind ausgehalten, beim Amt dein Nein vertreten und um Hilfe gebeten. Nicht alles lief glatt – aber du hast an diesem Abend jede Sprosse selbst gewählt.“
- `v-0227` ende1: „Du hast gewürdigt und dein Nein gehalten.“ Das ist auch nach k2/Wahl 3 (Aufdecken mit Ausrufezeichen) erreichbar.
  - **Ersatz:** „Lob und behauptete Mehrheit sind Hebel – kein Grund für ein Ja. Dein Nein hat gehalten; am ruhigsten hält es mit würdigen und wiederholen.“
- `l-08` ende3: „Ablesen und Rückzug haben dich geschützt“ ist auch ohne Ablesen erreichbar (k3b/Wahl 2).
  - **Ersatz:** „Ablesen oder Rückzug haben dich geschützt – …“

**S8 · einheiten-3, `mut-3-05-b`:** Die beste Antwort „Zwei Sprossen tiefer …“ passt nicht zur Regel, zur Merkkarte, zu `wenndann`, `w-125`, `l-14` und `v-0198` („**eine** Sprosse tiefer“). Die Antwort mit `wert 1` begründet zugleich „eine Stufe tiefer ist oft der sicherere Wiedereinstieg“ und beschreibt damit im Grunde die beste Antwort.
- **Ersatz beste:** „Eine Sprosse tiefer – ein kurzer Beitrag in der kleinen Runde – und dann bald wieder hoch.“
- **Ersatz warum (`wert 1`):** „Kann gelingen, wenn sie sich bereit fühlt. Nach drei Wochen Ausweichen ist ein etwas leichterer Wiedereinstieg aber oft sicherer.“

**S9 · Längen in Zweier-Knoten der Lagen erratbar.** Das Prüfskript zählt nur Fragen mit drei oder mehr Antworten, dort ist alles in Ordnung (lagen-2 5/19, lagen-3 13/26). In den Knoten mit zwei Wahlen ist die beste aber fast immer die längere: **lagen-2 11 von 14, lagen-3 14 von 16**. Insgesamt kommt lagen-3 damit auf 27 von 42. Phase 1 hat alle Knoten gezählt (Ziel: höchstens die Hälfte).
- **Ersatz-Beispiele** (schwache Wahl glaubwürdiger, Wert gleich):
  - `l-13` k4b/Wahl 2: „„Für heute reicht's – zwei Bitten sind ja auch schon was, der Rest kann warten.““
  - `l-14` k2b/Wahl 2: „Weiter abwarten – nächste Woche ist bestimmt weniger los, dann fällt es leichter.“
  - `l-15` k7b/Wahl 2: „Weiter allein machen – bis ich alle gefragt habe, bin ich auch fertig.“
  - `l-11` k1b/Wahl 2: „Bis Mitternacht weiter auswendig lernen, bis jeder Satz wirklich sitzt.“
- Ebenso `l-12` k1b, `l-13` k1b/k3b, `l-14` k1b/k3b, `l-15` k2b/k5b/k5c und in lagen-2 `l-06` k3/k3b, `l-08` k2b/k3b/k4, `l-09` k1b/k2b, `l-10` k1b/k4b/k4c.

**S10 · Beste Antworten behaupten Tatsachen, die nicht im Aufgabentext stehen:**
- `2-02-a`, beste: „Beim Los kommen Eltern oft nicht in die Ferien.“
  - **Ersatz frage:** „In der Teamrunde soll die Urlaubsplanung per Los entschieden werden. Du hältst das für ungerecht, weil Eltern dann oft nicht in die Schulferien kommen. Welcher Einstieg trägt am besten?“
- `fc-026`, beste: „Viele haben gerade erst neu gezahlt.“
  - **Ersatz frage:** „… erhöhen. Viele haben den Jahresbeitrag gerade erst bezahlt. Du hältst das für zu früh. …“
- `v-0177`, beste: „Damit die Kinder mittags nicht allein warten.“
  - **Ersatz frage:** „Nach deinem Vortrag im Elternbeirat zur Mittagsbetreuung fragt jemand spitz: …“

**S11 · Figur Frau Sommer, Anrede uneinheitlich.** Überall siezt sie (`v-0117`, `v-0227`, Phase 1), in `l-15` k5/k5c duzt sie.
- **Ersatz k5:** „Frau Sommer: „Und wo Sie schon so schön reden – Sie könnten doch die Kasse übernehmen! Der Kassenwart hört auf.““
- **Ersatz k5c:** „„Ach, was gibt's da zu überlegen! Sie sind doch so ordentlich.““

**S12 · Figur Jonas (stottert) in `v-0209`:** „In einer anderen Runde bekommt er keinen Ton heraus.“ Das vermischt Stottern mit Angst. `01` §18 sagt ausdrücklich: „keine Frage von Nervosität“.
- **Ersatz:** Lena statt Jonas: „Lena übt ihre Sprosse … In einer anderen Runde bleibt sie stumm.“ Die Antworten entsprechend: „Sie hat nur eine Lage geübt …“, „… sie ist eben eher der zurückhaltende Typ.“

**S13 · Testfrage gleicht Übung:** `fc-031` (Elternabend, sprechen nur mit Begleitperson daneben, `wert 1` als Zwischenschritt) gleicht `v-0113` (Lena, Elternabend, nur wenn die Freundin daneben sitzt).
- **Ersatz fc-031:**
  - frage: „Vor deinem ersten Beitrag in der Mieterversammlung überlegst du, was dir Halt gibt. …“
  - Antwort 3: „Die Versammlungsleiterin vorher bitten, dich aufzurufen, damit du dich nicht selbst melden musst.“ (`wert 1`), warum: „Als Zwischenschritt denkbar – als Bedingung wird es zur Krücke.“

**S14 · vorrat-03, `mut-v-0140`**, Antwort 3, warum: „Grundsätzlich schadet Fragen aber nicht.“ Das widerspricht `brooks2015` („Rat bei jemandem ohne Sachkenntnis zu suchen, kann schaden“) und `w-016`.
- **Ersatz:** „Stimmt: Wer sich auskennt, ist die richtige Adresse – bei Unkundigen fällt der Vorteil weg. Die Sorge, durch Fragen unfähig zu wirken, ist aber meist unbegründet.“

**S15 · einheiten-3, `mut-3-03` Karte:** „Ein schwieriges Gespräch suchst du, statt auf ihn zu warten.“ Der Satz ist grammatisch falsch, „ihn“ bezieht sich auf nichts.
- **Ersatz:** „Ein schwieriges Gespräch suchst du, statt darauf zu warten, dass der richtige Moment kommt.“

**S16 · lagen-3, `mut-l-13` k1**, Wahl 2: „Den Wunschzettel am Infotisch ausfüllen, ohne zu fragen.“ → k2 „Die Frau am Infotisch: „… Leider nein.““ Sie antwortet auf eine Frage, die nicht gestellt wurde.
- **Ersatz:** „Den Wunschzettel ausfüllen und wortlos am Infotisch abgeben.“

---

## KANN

- **K1 · `2-02` Karte:** „Eine echte Gegenstimme hilft Gruppen nachweislich, gründlicher nachzudenken.“ `nemeth2001` ist eine Laborstudie.
  - **Ersatz:** „In Laborstudien regte eine echte Gegenstimme Gruppen zu mehr und besseren Lösungen an.“
- **K2 · `w-017`:** „Was dich tagelang beschäftigt, ist bei anderen oft schnell eingeordnet.“ `savitsky2001` hat die Strenge des Urteils gemessen, nicht die Dauer (wie bei Gilovich in Phase 1).
  - **Ersatz:** „Was dich lange beschäftigt, sehen andere meist milder.“
- **K3 · Nutzer auf ein Geschlecht festgelegt:**
  - `2-04-c` k1/Wahl 3 „kein guter Moderator“ → „Moderieren kann ich einfach nicht.“
  - `fc-038` „als Kassenprüfer“ → „für die Kassenprüfung“
  - `l-15` k8/Wahl 2 „für einen Wichtigtuer gehalten“ → „für wichtigtuerisch gehalten“
  - `v-0196` „immer als Letzter sprechen“ → „immer zum Schluss sprechen“
- **K4 · Sprache:**
  - `fc-028` Antwort 3 „mir ihn zu leihen“ → „ihn mir zu leihen“
  - `fc-030` beste „Was will sie eigentlich wissen?“ (vorher „jemand“) → „Was will die Person eigentlich wissen?“
- **K5 · `2-05`:** Die Merkkarte m1 sagt „Blick an die Wand“, die Karte „Blick auf den Boden“. Einheitlich „Blick auf den Boden“.
- **K6 · `3-04`:** Die Karte sagt „für eine Woche“, der `zaehler` hat `"tage": 14`, der Vergleich spricht von „zwei Wochen“. Entweder `tage: 7` oder in der Karte „für eine oder zwei Wochen“.
- **K7 · `l-10` Kleinigkeiten:**
  - k2: „arbeitet es zehn Tage ohne Schulung“. Vom 1. bis zum 9. sind es neun Tage. **Ersatz:** „arbeitet es über eine Woche ohne Schulung“.
  - k5: „Sie schicken ihm die Liste“ (auf den Wegen über k4c/k4b nie angeboten) → „Sie schicken ihm eine Liste der offenen Punkte“.
  - k5: „Nach der Runde“ (über k4b ist es der nächste Morgen) → „Danach“.
  - k6: „Montag bin ich weg“ passt nach k5/Wahl 3 („irgendwann“) nur halb → „Diese Woche ist schlecht. Nächsten Dienstag?“
- **K8 · Dreimal dieselbe Lage „drittes Projekt, Rangfolge zurückgeben“:** `v-0224`, `v-0228`, dazu `l-10` k4. In `v-0228` lieber eine andere Überlast nehmen, etwa „Tarek bittet dich, seine Vertretung im Urlaub ganz zu übernehmen“ (Teil-Ja).
- **K9 · `v-0154`**, Antwort 2 (`wert 1`): „Drei weitere Lieder vorschlagen, bis er eins kennt.“ Das ist kein echtes Nachhaken, widerspricht aber dem Geist von „eine Bitte“.
  - **Ersatz:** „Noch ein zweites Lied vorschlagen – und dann gut sein lassen.“ (`wert 1`)
- **K10 · `fc-040`:** Die Begründung nennt „Hausarztpraxis“. Fachhilfe sollte nur als Schritt `fachhilfe` stehen. In Tests gibt es keinen solchen Schritt, und Phase 1 (`fc-003`) hat das genauso gemacht. Hinnehmbar, oder „… findet Unterstützung (Hilfe-Karte „Wenn es mehr ist“)“.
- **K11 · Figuren:**
  - In `v-0227` setzt Frau Sommer bewusst eine erfundene Mehrheit ein, ihre Rolle ist aber „redselig“. Eine namenlose „Kassiererin des Nachbarschaftsvereins“ passt besser zu einer Figur, die rote Hebel nutzt.
  - `l-11` nennt einen „Gartenverein“, `l-15` einen „Gemeinschaftsgarten“, beide mit Frau Sommer und Vorstand. Einheitlich benennen, sonst wirkt es wie ein Versehen.
- **K12 · `3-01`:**
  - Der belegHinweis könnte ergänzen, dass eine Folgestudie derselben Gruppe den Vorteil wechselnder Orte nur kurzfristig fand (Shiban u. a. 2015, vorher als Quelle prüfen und anlegen).
  - Die Karte sagt „Abwechseln fühlt sich schwerer an – das macht es haltbarer.“ → „… das kann es haltbarer machen.“
- **K13 · `quellen.json`:** Bei `praxis-mut` fehlt ein Leerzeichen (`"id": "praxis-mut","text"`). Nur Schönheit.
- **K14 · Testfragen nah an Übungen:**
  - Die Begründung von `fc-027` („So wird aus der Gewissheit eine Vermutung …“) ist fast wortgleich mit `2-03-c`.
  - `fc-026` hat dasselbe Antwortmuster wie `2-02-a` (Einwand, „hinterher schreiben“).
  - Eine Formulierung jeweils variieren.
- **K15 · `2-02-a`**, Antwort 4 (`wert 0`): Die Begründung „Besser als nichts – …“ widerspricht der Null.
  - **Ersatz:** „Die Entscheidung ist dann schon gefallen – und deine Befürchtung bleibt ungeprüft.“
- **K16 · `v-0219`**, Muster 2: „Eine Freundschaft, die ein ehrliches Gespräch nicht aushält, wäre wenig wert.“ Das ist hart für jemanden, der genau das fürchtet.
  - **Ersatz:** „Freundschaften halten meist mehr aus, als man vorher denkt – und ein ehrliches Gespräch gehört dazu.“

---

## Geprüft und in Ordnung

- **Kursplan:**
  - Phase k hat 20 Lerntage (6 E, 6 Ü, 4 L, 3 A, 1 S), Phase m hat 18 (5 E, 5 Ü, 4 L, 3 A, 1 S). Die Kennungen stimmen, und jede Lage folgt auf die Einheit, die sie voraussetzt.
  - Die Bänder liegen bei [3,6]/[4,7] und [5,8] bis [6,10].
  - Der Vorrat füllt die Übungstage (`--soll` ohne Befund).
- **Tests:** `fc-025` bis `-032` haben die Stufen 4 bis 7, `fc-033` bis `-040` die Stufen 6 bis 9. Bei der besten Antwort ist sie in 5 von 16 Fragen die längste.
- **Laut und leise:** Alle zehn lauten Übungen (`2-05-c`, `3-02-b`, `v-0094`, `-0095`, `-0110`, `-0111`, `-0174`, `-0175`, `-0183`, `-0184`) verweisen auf eine stumme Übung derselben Fähigkeit mit demselben Lernziel.
- **Längen:** keine Antwort in Lagen über 140 Zeichen.
- **Sprache:** kein „Sie“ außerhalb wörtlicher Rede, keine geraden Anführungszeichen, keine verbotenen Wörter.
- **Einfluss-Klassen:** `w-057` (rot) hat `preis` und `abwehr` und wird nur erkannt und abgewehrt (`v-0227`, `v-0229`). Schuld-Hebel und Lob als Hebel kommen nur als Angriff anderer vor. `w-054` und `w-056` sind `fair`.
- **Sicherheit:**
  - Die Fachhilfe `seele` steht in `3-05`, der Rückfall-Plan endet mit „Unterstützung holen“, und Alkohol als Krücke wird mit dem Hinweis auf Hilfe benannt (`fc-040`).
  - Es gibt keine Rufnummern und nichts mit Minderjährigen.
  - Die Mutproben-Regeln sind vollständig (`2-06` Karte mit „nichts mit Minderjährigen“, `3-04` Karte, `v-0234` als gute Lehrübung zur Regel).
- **Expositions-Logik:**
  - Lernen geschieht durch den Abgleich, nicht durchs Aushalten.
  - Krücken werden schrittweise abgebaut, auch Krücken, die mitwandern (`3-01-d`, `v-0195`) oder ihre Form wechseln (`v-0190`).
  - Abwechseln und gelegentliches Wiederholen werden ehrlich mit der kleinen Spinnenstudie und dem Hinweis „nicht eigens untersucht“ begründet.
  - Ein eingetretener, aber aushaltbarer Ausgang zählt als Lernen (`v-0213`, `v-0218`, `v-0220`). Das ist fachlich stark.
- **Neue Quellen:** Alle sind mit `geprueft: true` und Prüfvermerk versehen. Zahlen stehen nur bei geprüften Quellen.

---

## Umsetzung (25.11.2026)

Alle Änderungen nur in `src/coach/inhalt/mut/`; Kennungen unverändert, nichts gelöscht. Danach `node scripts/coach-index.mjs`. `node scripts/coach-pruefe.mjs --nur mut` → **0 Fehler**; `--soll mut` ohne Soll-Lücke. Übrig bleibt nur ein Hinweis zu `vorrat-02.json` (Stufe 1, zwei Wahlen, beste 7 von 7 die längste). Den Bericht verlangt dort nichts, die Datei bleibt deshalb unberührt.

Jede geänderte Lage habe ich danach Weg für Weg erneut durchgespielt, Rückmeldungen und Schlüsse gegen jeden Weg geprüft.

### MUSS

| Befund | Stand | Anmerkung |
|---|---|---|
| M1 „schneller als beim ersten Mal“ | umgesetzt | `w-089`, `3-05` Mythos, `3-05-b`, `l-14` ende1, `v-0201`, `v-0242` ersetzt. Gemildert: `l-14` k2, `v-0198`, `v-0208`, `v-0241`, `fc-033`. Auch `3-05-b` (neue beste) sagt nur noch „holt zurück“. Eine Suche nach „schnell/zügig/beim ersten Mal“ in Rückfall-Zusammenhängen findet nichts mehr. |
| M2 Nachhaken mit halbem Punkt | umgesetzt | `2-06-c`: Nachhaken jetzt `wert 0`, `tendenz: nachhaken`. Neue `wert 1`: „Schade – trotzdem eine schöne Lampe“ ohne Notiz. Das Nachhaken ist gekürzt, damit die längste Antwort nicht meist falsch ist. `l-09` k3/Wahl 2: `wert 0`, `nachhaken`, neue Rückmeldung. |
| M3.1/M3.2 `3-03-b` | umgesetzt, erweitert | k1/Wahl 3 sagt jetzt das Nein **und** das Angebot für den zweiten Feiertag. Sonst bliebe der Kartoffelsalat in ende1 über k1/Wahl 3 → k2/Wahl 2 unbegründet. k1b/Wahl 1 wie vorgeschlagen. |
| M3.3 `l-07` | umgesetzt | ende1 sagt/ende, k3a „für den nächsten Termin“. |
| M3.4 `l-10` | umgesetzt | k3/Wahl 3 nennt den Fünfzehnten. |
| M3.5/M3.6 `l-13` | umgesetzt, erweitert | k4, k4b, ende3 wie vorgeschlagen. Zusätzlich: ende2 sagt „die Bitten vom Vormittag“ statt „die Neins“, k6/Wahl 1 „wie es sich nach einer Stunde anfühlte“. Auf manchen Wegen gibt es nur ein Nein oder gar keins. |
| M3.7 `l-15` k5b | umgesetzt | Pause statt „nach der Versammlung“. |
| M4.1–M4.5 Schluss-Fazits | umgesetzt | `l-06`: „auch beim Nachhaken am Nachmittag“ statt „beim dritten Anlauf“, denn über k1/Wahl 1 gibt es nur zwei Anläufe. `l-08`, `l-11` (ende1 + ende2), `l-13` (ende1 + k6-Rückmeldung) und `v-0117` wie vorgeschlagen. |
| M5 `v-0247` | umgesetzt | Karte „eine geschaffte Sprosse ab und zu an wechselnden Orten wiederholen“ (eher nicht). |

### SOLLTE

| Befund | Stand | Anmerkung |
|---|---|---|
| S1 Arbeitende in Mutproben | umgesetzt, abgewandelt | `3-04-c`: Der Ersatz „Händler auf dem Flohmarkt erklärt die Kamera“ hätte wieder einen Arbeitenden um etwas außerhalb seines Verkaufs gebeten. Jetzt: Ein Mann fotografiert im Park, du fragst, ob du durch den Sucher schauen darfst. Er antwortet schroff, die Begründung lautet wie vorgeschlagen. `3-04-b` und `v-0203`: Lastenrad des Nachbarn leihen, statt des vorgeschlagenen Gemeinschaftsgartens: Dort wäre ein Nein eher unwahrscheinlich, die Rangfolge „Nein sehr wahrscheinlich“ hätte nicht gestimmt. `2-06` Geschichte wie vorgeschlagen („Tarek im Kleingarten“). |
| S2 Mutprobe-Missionen ohne Schalter | bewusst nicht im Inhalt | Ist bereits technisch gelöst: `Mission.tsx` zeigt bei `mutprobe && !profil.mutproben` nur einen Hinweis. Siehe offenen Punkt unten (Wegbeschreibung). |
| S3 `fc-032` | umgesetzt | „Dann wenigstens tagsüber und nicht in der Bahn.“ Die Begründung ist an „einen Fremden“ aus der Frage angepasst. |
| S4 `2-06` aha | umgesetzt | |
| S5 `2-03` aha | umgesetzt | |
| S6 `2-04-c` k1b, `v-0232` | umgesetzt | `v-0232`: neue `wert 1` „Weitermachen wie bisher …“. „Noch mehr Bitten …“ bleibt als `wert 0`, `zu_gross`. |
| S7 Fazits mit Rückweg | umgesetzt | `2-01-d`, `2-04-c`, `l-12` („dein Anliegen gesagt“, denn über k2/Wahl 3 → k3/Wahl 3 fällt der Wunsch nie wörtlich), `l-15` (eigene Fassung ohne „Gegenwind“ und „an diesem Abend“, die über k3/Wahl 2 bzw. k7b nicht stimmen), `v-0227`, `l-08` ende3 (dazu sagt: „viele noch Fragen zum Plan hatten“). Zusätzlich gefunden: `l-10` ende1 „Gegenwind ausgehalten“ stimmte über k3/Wahl 1 (eingeknickt) nicht und ist ersetzt. |
| S8 `3-05-b` | umgesetzt | |
| S9 Längen in Zweier-Knoten | umgesetzt | Schwache Wahl glaubwürdiger und länger: in lagen-2 `l-06` k3/k3b, `l-07` k1b, `l-08` k2b/k3b, `l-09` k1b, `l-10` k1b; in lagen-3 `l-11` k1b/k4b, `l-13` k1b/k3b/k4b, `l-14` k2b/k3b, `l-15` k7b. Der Hinweis des Prüfskripts ist für beide Dateien weg. |
| S10 Tatsachen nur in der besten Antwort | umgesetzt | `2-02-a`, `fc-026`, `v-0177`: Die Fragen tragen jetzt die Tatsache. |
| S11 Frau Sommer siezt | umgesetzt | `l-15` k5/k5c. |
| S12 Jonas in `v-0209` | umgesetzt | Lena; alle Antworten angepasst. |
| S13 `fc-031` | umgesetzt | Mieterversammlung, Versammlungsleiterin. Damit ist auch „dein Partner“ (gegen LIESMICH §5) weg. |
| S14 `v-0140` | umgesetzt | |
| S15 `3-03` Karte | umgesetzt | |
| S16 `l-13` k1 | umgesetzt | |

### KANN

| Befund | Stand | Anmerkung |
|---|---|---|
| K1 `2-02` Karte | umgesetzt | |
| K2 `w-017` | umgesetzt | |
| K3 Geschlecht | umgesetzt | Alle vier. Dazu `l-10` k7 „Bremser“ → „ich bremse alles aus“ und `w-057` „als Einziger“ → „die einzige Person“. |
| K4 Sprache | umgesetzt | |
| K5 `2-05` m1 | umgesetzt | |
| K6 `3-04` Zeitraum | umgesetzt | Karte und m1 „eine oder zwei Wochen“; `tage: 14` bleibt, weil der Vergleich und `3-04-a` („nächste Woche …“) mit zwei Wochen rechnen. |
| K7 `l-10` | umgesetzt | k2, k5. k6 lautet jetzt „Montags bin ich nie im Haus. Geht Dienstag?“, das passt auf allen drei Wegen („am Montag“, „irgendwann“, „nächste Woche“). Die Rückmeldung ist angepasst, denn auf zwei Wegen ist es kein halbes Nein. |
| K8 `v-0228` | umgesetzt | Neu: „Die ganze Vertretung“ mit Tarek (Teil-Ja: Kundenanfragen ja, der Rest nein). Kennung, Fähigkeit und Stufe bleiben. |
| K9 `v-0154` | umgesetzt, abgewandelt | „Noch ein zweites Lied vorschlagen“ wäre wieder ein zweiter Anlauf. Neue `wert 1`: „„Schade.“ Noch kurz zuhören und weitergehen, ohne es dir zu notieren.“ |
| K10 `fc-040` | bewusst nicht | In Tests gibt es keinen Fachhilfe-Schritt. „Hausarztpraxis“ ist keine Rufnummer, Phase 1 (`fc-003`) macht es genauso. Ob die Hilfe-Karte wirklich „Wenn es mehr ist“ heißt, ist im Bereich nicht prüfbar. |
| K11 Figuren | umgesetzt | `v-0227`: namenlose „Schriftführerin des Nachbarschaftsvereins“ statt Frau Sommer. `l-15` jetzt „Gartenverein“ wie `l-11`. |
| K12 `3-01` | umgesetzt | Quelle `shiban2015` geprüft (Bibliothekseintrag und Zusammenfassung, Behav Res Ther 71, 45–53): Wechselnde Räume verringerten die Rückkehr der Angst kurz nach dem Üben, in der Nachuntersuchung nicht mehr. Ergänzt sind belegHinweis, Studien-Grenze, Quellen und `w-018`. Karte und Merkkarte sagen jetzt „kann … haltbarer machen“. |
| K13 `quellen.json` Leerzeichen | umgesetzt | |
| K14 Tests nah an Übungen | umgesetzt | `fc-026`: andere beste Antwort und anderes Ausweichen, ohne „hinterher schreiben“. `fc-027`: Begründung neu formuliert. |
| K15 `2-02-a` | umgesetzt | |
| K16 `v-0219` | umgesetzt | |

### Offen für den Hauptstrang (außerhalb `mut/`)

- **Wegbeschreibung Mutproben:** Die Karte in `2-06` sagt „unter „Echtes Leben“ im Reiter „Mutproben“ … einschalten“. Der Hinweis in `Mission.tsx` sagt „unter Missionen → Mutproben“. Bitte eine Bezeichnung festlegen, dann passe ich die Karte an.
- **`vorrat-02.json` (Stufe 1):** Hinweis „beste Antwort 7 von 7 die längste“ in Zweier-Knoten. Nur auf Wunsch anfassen.
