# Gegenlesen: Bereich `flirten`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängige Gegenlesung (Einvernehmen und Sicherheit, Didaktik, Faktenprüfung) · **Inhaltsdateien nicht geändert**

## Was geprüft wurde

- **Maßstab:** `08_ENTSCHEIDUNGEN.md` (Einfluss-Klassen, Lehrplan-Abweichung `flirten`), `01_KONZEPT.md` §18 (Regeln für `flirten`, Missionen und Mutproben), `06_INHALT_REGELN_MUSTER.md` §16, `src/coach/inhalt/LIESMICH.md` §3a–7, `05_LEHRPLAN.md` 3.13, `besetzung.json`, `gemeinsam.json` (`fachhilfe.belaestigung`, `seele`), Bericht Phase 1 `gegenlesen/flirten.md`.
- **Vollständig gelesen:**
  - `einheiten-2.json` (2-01 bis 2-06) und `einheiten-3.json` (3-01 bis 3-05).
  - `lagen-2.json` (l-06 bis l-10) und `lagen-3.json` (l-11 bis l-15). In jeder Lage und jedem Dialog (2-04-c, 3-02-b) habe ich **jeden Weg** bis zum Fazit nachverfolgt.
  - `vorrat-03.json` (v-0096 bis v-0178, 83 Einträge) und `vorrat-04.json` (v-0179 bis v-0255, 77 Einträge). Beide haben zwei Forks Eintrag für Eintrag gelesen; ihre Befunde habe ich stichprobenhaft am Text nachgeprüft (v-0123, v-0130, v-0145, v-0167, v-0215, v-0248).
  - Die Lerntage k/m in `kurs.json` und `tests.json` fc-025 bis fc-040.
  - Die neuen Einträge in `wissen.json`: w-016 bis 019, w-034, w-059, w-064, w-065, w-089, w-115, w-125, w-126.
  - Die neuen Quellen `stgb177`, `moeller2017`, `vz-lovescam` und den erweiterten Eintrag `weber2010`.
  - `lagen-1.json` hat nur verlängerte falsche Antworten (Längenausgleich); das ist in Ordnung.
- **Prüfskript:**
  - `node scripts/coach-pruefe.mjs --nur flirten` ergibt **0 Fehler, 7 Hinweise**. Alle 7 betreffen Phase 1 und sind die bekannten „keine brauchbare Antwort“-Stellen (1-02, v-0002, v-0024, v-0073, v-0083, v-0087, fc-011, siehe Bericht Phase 1, offene Punkte 2 und 3).
  - `--soll flirten`: Es fehlt nichts.
  - Eigene Prüfung: Keine Antwort in Lagen, Einheiten oder Tests ist länger als 140 Zeichen. „Sie“ steht nur in der 3. Person, nie als Anrede. Kein „...“, keine doppelten Leerzeichen.
  - Länge der Antworten: Im Vorrat ist die beste Antwort in 16 von 35 bzw. 20 von 40 Fragen die längste. Die Lagen und Tests liegen laut Skript im Rahmen.
- **Kursplan:**
  - k: 6 E · 6 Ü · 4 L · 3 A · 1 S = 20.
  - m: 5 E · 5 Ü · 4 L · 3 A · 1 S = 18.
  - Bänder [3,6] bis [4,7] bzw. [5,8] bis [6,10] (ue-016 [5,9]). Test-Stufen 4–7 bzw. 6–9. Vorrat-Stufen 4–7 (k) und 6–9 (m).
  - Die Titel entsprechen dem Lehrplan 3.13. Jede Lage steht hinter der Einheit, die sie voraussetzt. Die Missionen verweisen auf die Sprossen 6–10. **Stimmt.**
- **Quellen nachgeschlagen:**
  - **§ 177 StGB** ([gesetze-im-internet.de](https://www.gesetze-im-internet.de/stgb/__177.html)): Abs. 1 stellt **sexuelle Handlungen** gegen den erkennbaren Willen unter Strafe. Abs. 2 erfasst Fälle ohne erkennbaren Gegenwillen: Die Person kann keinen Willen bilden oder äußern (Nr. 1), ihre Willensbildung ist erheblich eingeschränkt und der Täter hat sich ihrer Zustimmung nicht versichert (Nr. 2), sie wird überrascht (Nr. 3), ihr droht ein Übel (Nr. 4, 5). Der Quelleneintrag `stgb177` gibt das **richtig** wieder, zwei Texte nicht (siehe M1).
  - **moeller2017** ([ScienceDaily](https://www.sciencedaily.com/releases/2017/06/170607085350.htm), [EurekAlert](https://www.eurekalert.org/pub_releases/2017-06/w-mrv060617.php)): 298 Frauen einer Stockholmer Notfallklinik; 70 % deutliches, 48 % extremes Erstarren. **Korrekt**, ebenso die Einordnung „Studie mit Frauen nach einem Übergriff“ in w-089 und 3-03. Nirgends wird Betroffenen eine Schuld gegeben.
  - **vz-lovescam** ([Verbraucherzentrale](https://www.verbraucherzentrale.de/wissen/digitale-welt/onlinedienste/love-scamming-so-schuetzen-sie-sich-vor-liebesbetrug-93503), Stand 10.4.2025):
    - Die Warnzeichen stimmen: Liebesschwüre, Schicksalsschläge, Geldbitten, Ausreden statt Treffen, Fotos.
    - Die Schutztipps stimmen: Rückwärtssuche, nie Geld, mit Vertrauten reden. Videochat gilt als **kein Beweis** für Seriosität – genau so steht es im Text.
    - Für Betroffene stimmt es ebenfalls: abbrechen, Chats sichern, Anzeige.
    - Auf der Seite steht **nicht**, dass Betrüger von der Plattform weglocken (v-0144, siehe K-F1-8).
    - Nicht übernommen ist der Rat der Seite, bei schon überwiesenem Geld sofort die Bank anzurufen (K12).
  - **weber2010** ([Abstract](https://informahealthcare.com/doi/full/10.1080/08824091003738149)): 642 Studierende, fünf Videos, ein männlicher Schauspieler spricht eine Frau an. Vorstellung durch Dritte und direkte Vorstellung galten als am angemessensten, die Vorstellung durch Dritte als am wirksamsten. **Bestätigt**; damit ist der offene Punkt aus Phase 1 erledigt.

## Gesamteindruck

Die Phasen k und m sind **ethisch klar und didaktisch gut aufgebaut**. Die Reihenfolge führt vom Gespräch über Einladung, Schreiben, erstes Treffen, Maschen und Leiter (k) zu Dranbleiben, Wünschen, Einvernehmen, Korb und Vermittlung (m).

**Einvernehmen:**
- „Nur ein Ja ist ein Ja“, „ein Ja gilt für jetzt und für das eine“, „Schweigen, Stillhalten, Erstarren sind kein Ja“ und „ein Nein gilt auch nach einem Ja“ stehen in Einheit, Merkkarten, Spickzettel (w-126), Lagen (l-13, l-15) und Tests (fc-036, -037, -040).
- Besonders gut: Das **eigene Nein des Nutzers** wird geübt (l-13 k3, l-08 k3/k3b). Das Erstarren zeigt auch ein **Mann** (l-15 k6b, v-0227) – kein Geschlechterklischee.

**Rote Linie:**
- Negging, Push-Pull, „letzter Widerstand“, Liebesbetrug, Schuld für die Anfahrt und „Nein heißt eigentlich Ja“ stehen nur in `kunstgriff`/`auswahl` zum Erkennen, immer mit Abwehr. Keine Masche ist beste Antwort, Musterlösung oder Mission.
- Eingreifen als Freund ist stark gebaut (l-09: aus der Gruppe weggezogen, „letzter Widerstand“).

**Abhängige:** Auszubildende (v-0123), Patientin, Kundin, Nachtzug (v-0130) und Arbeitsplatz-Mittagspause (fc-033) sind ausgeschlossen. Die Missionen sind alle `privat`.

**Erstes Treffen:** belebter Ort, eigener Heimweg, jemand weiß Bescheid, kurz planen, nichts von Geld, Ausweis oder Adresse – in Karte, Spickzettel w-125, l-08, Tests.

**Queere Menschen** sind jetzt sichtbar und ohne Klischee mitgemeint: queerer Stammtisch, queeres Sommerfest, ein Freund, der Männer datet, männlicher Partner im Sparring m, Freundin in fc-035. Damit ist der offene Punkt 4 aus Phase 1 erledigt.

Die Mängel sitzen an vier Stellen:
1. **Rechtslage** zu weit und zu verkürzt formuliert (M1).
2. **Wege in Lagen**, auf denen Rede und Gegenrede nicht zusammenpassen. Einer davon (l-15 k6b → k6) führt nach einem Erstarren ohne Frage in einen Kuss (M2).
3. **Neutralität des Nutzers:** „dein Partner/deine Partnerin“, „als Physiotherapeut“, „als Erster“ (M3, M4).
4. Ein paar Stellen, an denen **Mitgehen gegen das eigene Gefühl** als „Ja“ oder als eigener Fehler erscheint (S2).

**Zählung: 5 muss · 29 sollte · 41 kann.** (Die Vorratsdateien wurden von zwei Forks gelesen; ihre Muss-Befunde sind in M3/M4 zusammengefasst, ihre Hinweise auf doppelte Tests in S29.)

---

## Muss

### M1 – § 177 StGB zu weit und unvollständig wiedergegeben

**Stellen:**
- `einheiten-3.json` `flirten-3-03`, Schritt `karte` „Was ein Ja ist – und was nicht“: „Und in Deutschland ist seit 2016 strafbar, sich über den erkennbaren Willen eines anderen hinwegzusetzen.“
- `wissen.json` `flirten-w-018`: „Seit 2016 ist in Deutschland strafbar, sich über den erkennbaren Willen eines anderen hinwegzusetzen.“

**Begründung:**
- So allgemein ist der Satz falsch: Strafbar sind **sexuelle Handlungen** gegen den erkennbaren Willen, nicht jedes Hinwegsetzen über einen Willen.
- Gerade für diese Einheit fehlt der wichtige Teil: Abs. 2 schützt auch, wer **keinen Willen bilden oder äußern kann** (z. B. erstarrt oder stark betrunken) oder **überrascht** wird. Ohne ihn liest man „erkennbarer Wille“ und „Schweigen ist kein Ja“ nebeneinander und schließt: Wer nichts sagt, ist rechtlich ungeschützt.
- Ehrlich wäre außerdem: Die Regel „nur ein Ja ist ein Ja“ geht **bewusst weiter** als das Gesetz. Sie ist Haltung, nicht Gesetzestext.

**Ersatz 3-03 (Karte, letzter Satz):** „Das Gesetz (§ 177 StGB, seit 2016) stellt sexuelle Handlungen gegen den erkennbaren Willen unter Strafe – und auch, wenn jemand ausnutzt, dass ein anderer gar nicht widersprechen kann oder überrascht wird. Die Regel ‚nur ein Ja ist ein Ja‘ geht noch weiter: Sie ist Achtung, nicht nur Pflicht.“ (Die Karte bleibt unter 420 Zeichen, wenn „Wer betrunken ist, kann nicht frei zustimmen.“ in die Merkkarte wandert, wo er schon steht.)

**Ersatz w-018 (3. Satz):** „Seit 2016 sind in Deutschland sexuelle Handlungen gegen den erkennbaren Willen strafbar – ebenso, wenn jemand ausnutzt, dass ein anderer nicht widersprechen kann.“

### M2 – `lagen-3.json` `flirten-l-15`, Weg k5 → k6b → k6: nach dem Erstarren ein Kuss ohne Frage

**Ablauf:**
- k5, wert 0: „Ihn ohne zu fragen küssen“ führt zu k6b: „Er erstarrt kurz und tritt einen halben Schritt zurück.“
- Beste Wahl in k6b: „Sofort zurücktreten: „Entschuldige – ich hätte fragen sollen.““ – weiter nach **k6**: „Er lächelt. „Gern. Aber nur küssen heute …“ Ihr küsst euch.“

**Begründung:**
- Auf diesem Weg hat niemand gefragt. „Gern“ antwortet auf eine Frage, die nie gestellt wurde.
- Ausgerechnet in der Sparring-Lage zur Meisterschaft folgt auf ein Erstarren (laut Bereich „kein Ja“) unmittelbar ein Kuss, und das Fazit lobt (ende1: „Am Ende hast du gefragt …“) – auf diesem Weg falsch.
- l-13 löst denselben Fall richtig: Nach dem Zurückweichen sagt sie „Lieber noch nicht“.

**Ersatz:** k6b, wert 2 → neues Ende `ende5`:
- Wahl: „Sofort zurücktreten: „Entschuldige – ich hätte fragen sollen. Gute Nacht!““
- `ende5`, sagt: „Er nickt, noch etwas überrumpelt. „Gute Nacht.“ Am nächsten Tag schreibt er: „Alles gut. Nächstes Mal frag einfach.““
- `ende5`, ende: „Sein Erstarren hast du sofort gelten lassen und dich entschuldigt – richtig. Davor fehlte die Frage: Ein schöner Abend ist kein Ja. Beim nächsten Mal: erst fragen, dann küssen.“

### M3 – Dem Nutzer wird eine Beziehung zugeschrieben (LIESMICH §5)

| Datei | Kennung | Zitat | Ersatz |
|---|---|---|---|
| tests | `flirten-fc-037` (frage) | „Ihr kuschelt auf dem Sofa. Deine Partnerin sagt nichts …“ | „Ihr trefft euch seit ein paar Wochen und kuschelt auf dem Sofa. Sie sagt nichts, liegt aber auf einmal ganz still und schaut zur Seite.“ |
| vorrat-04 | `flirten-v-0215` (frage) | „Ihr seid seit Wochen zusammen. Heute sagt dein Partner mitten in einem nahen Moment …“ | „Ihr seid seit ein paar Wochen ein Paar. Mitten in einem nahen Moment sagt er: „Warte – doch nicht.““ |
| vorrat-04 | `flirten-v-0227` (beschreibung) | „Ihr seid seit einem Monat zusammen. Beim Kuscheln wird dein Partner plötzlich still …“ | „Ihr seid seit einem Monat ein Paar. Beim Kuscheln wird er plötzlich still …“ |
| vorrat-04 | `flirten-v-0250` (beschreibung) | „Ihr trefft euch seit zwei Monaten. Beim Spaziergang sagt dein Partner: …“ | „… Beim Spaziergang sagt er: …“ (wer sich erst trifft, ist auch noch kein „Partner“) |

**Begründung:** LIESMICH §5 nennt „dein Partner“ ausdrücklich als verbotene Festlegung. Mit „ihr seid ein Paar“ bleiben die Lagen gleich; das Possessiv „dein Partner/deine Partnerin“ legt Beziehung und Rolle fest.

### M4 – Der Nutzer wird als Mann festgelegt (LIESMICH §5)

| Datei | Kennung | Zitat | Ersatz |
|---|---|---|---|
| vorrat-03 | `flirten-v-0130` karten[2] | „die Patientin, die du als Physiotherapeut behandelst“ | „eine Patientin, die du in deiner Praxis behandelst“ |
| vorrat-03 | `flirten-v-0167` (satz) | „„… denkt sie bestimmt, ich bin so einer, der alle anmacht.““ | „„… hält sie mich bestimmt für jemanden, der alle anmacht.““ |
| lagen-2 | `flirten-l-07` k1 (sagt) | Sven: „Schreib ihr bloß nicht als Erster.“ | „Schreib ihr bloß nicht zuerst.“ |

**Begründung:** Wörtliche Rede legt hier den Nutzer selbst fest, nicht eine Figur.

### M5 – `lagen-2.json` `flirten-l-10` (Sparring k): Die beste Antwort ist nicht ausführbar

**Das Problem:**
- k4: „Sie lächelt. „Gern! **Gib mir deine Nummer**, ich schreib dir.“ Zwei Tage vergehen ohne Nachricht.“
- Beste Wahl: „Einmal kurz schreiben: „Hey, hier ist {name} …““. Du hast ihre Nummer aber gar nicht.
- Dazu passt die Wahl mit wert 1 („Warten – sie hat ja gesagt, sie schreibt.“) nicht zu k5: „Sie antwortet: „Sorry, Chaoswoche! Samstag um neun passt.““ Auf diesem Weg gab es weder eine Nachricht noch „neun Uhr“.

**Begründung:** Eine unmögliche beste Antwort im Abschluss-Sparring; dazu bricht die Logik auf einem Weg.

**Ersatz:**
- k4 sagt: „Sie lächelt. „Gern! Lass uns Nummern tauschen, ich schreib dir.“ Zwei Tage vergehen ohne Nachricht.“
- k5 sagt: „Sie schreibt: „Sorry, Chaoswoche! Samstag, neun Uhr am Kai – bin dabei.“ Samstag am Kai: …“ (der Rest bleibt)

---

## Sollte

### Einvernehmen und Sicherheit

**S1 – `einheiten-3.json` `flirten-3-03-c` (umformulieren)**
- Zitat Auftrag: „Mach aus dem Drängen eine Frage, auf die ein Nein ganz leicht fällt.“ Zitat Muster 1: „„Ist das gerade okay für dich – oder sollen wir eine Pause machen? …““
- Die Vorlage „hab dich nicht so“ setzt ein **Zögern** voraus. Nach der eigenen Regel („ein Zögern gilt“) kommt danach zuerst **aufhören**, dann fragen. Muster 1 fragt, ob es weitergehen darf, und macht „Pause“ zur Ausnahme. Muster 2 macht es richtig.
- Ersatz Auftrag: „Mach aus dem Drängen einen Satz, der aufhört und das Nein ganz leicht macht.“
- Ersatz Kriterium 1: „hält zuerst inne“.
- Ersatz Muster 1: „„Lass uns kurz aufhören. Ist alles okay bei dir? Wir müssen heute gar nichts.““

**S2 – Mitgehen gegen das eigene Gefühl erscheint als „Ja“ oder als eigener Fehler**
- `tests.json` `flirten-fc-027`, warum zu „„Okay …“ – und mitgehen“: „Ein Ja gegen dein Gefühl.“
- `lagen-2.json` `flirten-l-08` ende2: „Gegen das eigene Gefühl zu handeln, um höflich zu sein, schützt niemanden.“
- Begründung: Der Bereich lehrt zu Recht, dass Mitgehen und Stillhalten kein Ja sind. Hier wird das Mitgehen aber selbst „Ja“ genannt bzw. als Versäumnis der Nutzerin oder des Nutzers dargestellt. Für jemanden, der aus Höflichkeit oder Angst mitgegangen ist und dann bedrängt wurde, liest sich das wie eine Mitschuld – das Gegenteil dessen, was `moeller2017` lehren soll.
- Ersatz fc-027 warum: „Du musst nicht mitgehen, nur weil Nein unhöflich wirkt. Und mitgehen heißt nicht, zu irgendetwas Ja gesagt zu haben.“
- Ersatz l-08 ende2: „Aus Höflichkeit mitzugehen ist menschlich – und verpflichtet dich zu nichts. Beim nächsten Mal: Ein öffentlicher Ort beim ersten Treffen ist dein gutes Recht, und deine Meinung darfst du bis zuletzt ändern.“

**S3 – `lagen-3.json` `flirten-l-13` k3: Die Lage setzt das Ja des Nutzers voraus**
- Zitat: „An ihrer Haustür fragt sie diesmal: „Darf ich dich küssen?“ Ihr küsst euch.“
- Begründung: In der Einvernehmens-Lage antwortet der Nutzer nicht – sein Ja wird unterstellt. Danach soll er gerade lernen, sein eigenes Nein zu sagen.
- Ersatz: „… fragt sie diesmal: „Darf ich dich küssen?“ Du sagst Ja, ihr küsst euch.“

**S4 – `lagen-2.json` `flirten-l-10` k2, beste Wahl: Frage nach dem Alleinwohnen**
- Zitat: „„… Ist das Alleinwohnen neu für dich?““
- Begründung: Eine Frau, die man kaum kennt, erwähnt nebenbei, dass sie allein wohnt. Die beste Antwort hakt genau dort nach. Aus Sicht einer Frau, die oft bedrängt wurde, ist das ein Warnzeichen. „Eine Ebene tiefer“ geht auch ohne die Wohnlage.
- Ersatz: „„Dann hat die Schlaflosigkeit wenigstens ein gutes Bild gemacht. Sind die frühen Morgen jetzt deine Fotozeit?““
- Ebenso in der rueck: „… behutsam, denn sie hat es selbst angeboten.“ bleibt.

**S5 – `vorrat-04.json` `flirten-v-0248` (queeres Sommerfest), wert 1**
- Zitat: „„Du bist doch bestimmt nicht allein hier, oder?““
- Begründung: Wenn eine fremde Person fragt, ob jemand allein ist, kennen viele Frauen das als ungutes Zeichen. Das ist nicht „brauchbar“. (Fork 2)
- Ersatz: wert 0, `tendenz: "ueberziehen"`, warum: „Klingt, als wolltest du wissen, ob jemand auf sie aufpasst. Frag nach der Lage, nicht nach ihrer Begleitung.“
- Neue Antwort mit wert 1: „„Schönes Fest, oder?““ – warum: „Freundlich und leicht. Mit Namen und einer echten Frage wird eher ein Gespräch daraus.“

**S6 – `vorrat-03.json` `flirten-v-0123`, wert 1 „„Warte bis nach ihrer Prüfung.““**
- Begründung: §18 sagt „nie gegenüber Auszubildenden“. Auch nach der Prüfung hängen Übernahme und Zeugnis oft vom Ausbilder ab; Auszubildende können zudem minderjährig sein. Die eigene Begründung sagt selbst, dass das Gefälle bleibt. (Fork 1)
- Ersatz: „„Lass es, solange sie in irgendeiner Weise von dir abhängt.““ – wert 1, warum: „Die richtige Richtung. Solange sie bei dir lernt, gibt es keinen passenden Moment.“

**S7 – `vorrat-04.json` `flirten-v-0214`, wert 1: Die Begründung passt nicht zur Antwort**
- Antwort: „Ihr sagen, dass ihr euch nüchtern wiederseht, und ein Taxi rufen.“ Die Begründung bemängelt aber, ob sie sicher ankommt.
- Ersatz Text: „Nein sagen und ihr eine gute Nacht wünschen.“ – warum: „Richtig entschieden. Ob sie sicher heimkommt – Taxi, Freundinnen, eine Nachricht –, gehört dazu.“ (Fork 2)

**S8 – `vorrat-04.json` `flirten-v-0224` (zuordnen), Fach „Ja“**
- Zitat: „Er fragt: „Darf ich dich küssen?“ – und wartet.“
- Begründung: Seine Frage ist ein Wunsch, noch keine Zustimmung zu einem Schritt. In einer Übung zu „nur ein Ja ist ein Ja“ verwirrt das. (Fork 2; dieselbe Unschärfe in `flirten-3-03-a` „Sie fragt selbst: …“, dort als Initiative noch vertretbar.)
- Ersatz: „Er sagt: „Ja, komm her“ – und zieht dich zu sich.“

**S9 – `vorrat-03.json` `flirten-v-0121` (beste Antwort, warum)**
- Zitat: „So weißt du, dass es ein echtes Ja ist.“
- Begründung: Ein zweiter Ausweg macht ein Nein leichter, beweist aber kein Ja. (Fork 1)
- Ersatz: „Ein Ja mit Zögern bekommt einen zweiten, leichten Ausweg. So bleibt ein Nein auch später leicht.“

**S10 – `vorrat-03.json` `flirten-v-0171`, warum**
- Zitat: „Eine Bitte um Begründung – sie soll dein Nein erklären und dich trösten.“
- Begründung: Das Nein ist ihres.
- Ersatz: „… sie soll ihr Nein erklären und dich trösten.“ (Fork 1)

### Logik der Lagen (jeder Weg)

**S11 – Gegenrede passt nicht zur Wahl mit wert 1 („auch“ ohne Bezug)**
- `einheiten-2.json` `flirten-2-04-c` k2: „Sie lächelt. „Fand ich auch nett. …““ Auf dem Weg „„Klar, mach's gut!““ hat niemand gesagt, dass es nett war.
  - Ersatz: „Sie lächelt. „War schön mit dir. Ich weiß nur noch nicht, wie meine nächsten Wochen aussehen.““
- `lagen-2.json` `flirten-l-10` k2: „„Danke! Ich stand um sechs am Kai …““ Nach „„Ging mir genauso.““ gab es nichts zu danken.
  - Ersatz: „Sie lächelt. „Das Hafenbild ist um sechs am Kai entstanden – ich konnte nicht schlafen. Seit ich allein wohne, bin ich morgens oft wach.““ (mit S4 abstimmen)
- `lagen-2.json` `flirten-l-10` k6: „„Fand ich auch schön. …““ Nach „„Okay, bis Dienstag!““ fehlt der Bezug.
  - Ersatz: „Sie zögert kurz. „War schön heute. Ich weiß nur noch nicht, ob ich gerade für mehr als Fotografieren bereit bin.““

**S12 – `lagen-2.json` `flirten-l-07`**
- k2, wert 1 („Weiterschreiben wie bisher, ohne Vorschlag.“) führt nach k3: „Ihre Antwort: „Sonntag klappt leider nicht …““ – auf diesem Weg hat niemand Sonntag vorgeschlagen.
- Ersatz:
  - wert 1 bekommt `"weiter": "ende2"`.
  - ende2 (ende) lautet dann: „Der Anfang ist im Chat eingeschlafen – durch Warten, Wartespiele oder weil niemand ein Treffen vorgeschlagen hat. Beim nächsten Mal: schreiben, wenn du Lust hast, sagen, was du meinst – und ein Treffen vorschlagen.“
- Dazu k1b, rueck der besten Wahl: „Gut umentschieden.“ Auf dem Weg über wert 0 („ich schreib erst am Donnerstag“) wird nichts umentschieden, die Taktik wird ausgeführt.
  - Ersatz: „Eine Nachricht mit Bezug, ohne Spiel – dann ist sie dran.“

**S13 – `lagen-2.json` `flirten-l-06` k2**
- Zitat: „„Ich hab meinen Job gewechselt und gemerkt, … Da dachte ich: Jetzt oder nie.““
- Begründung: Das antwortet auf „Was hat dich im Frühjahr rausgebracht?“. Nach „„Und wo wohnst du?““ oder dem Übertrumpfen („acht Jahre im Verein“) kommt es aus dem Nichts.
- Ersatz: „Sie erzählt trotzdem weiter: „Ich hab im Winter den Job gewechselt und gemerkt, dass ich die Wochenenden nur noch verschlafe. Da dachte ich: Jetzt oder nie.““

**S14 – `lagen-2.json` `flirten-l-09`: ende2 und k4 passen nicht zu allen Wegen**
- ende2 (sagt): „Später erzählen die Freundinnen der jungen Frau, dass ihnen der Abend unheimlich war.“ ende2 wird auch über k3, wert 0 erreicht (Sven will bei einer **anderen** Person nachhaken), und auf diesem Weg ist die junge Frau längst wieder bei ihren Freundinnen.
  - Ersatz: „Später am Abend ist die Stimmung gekippt. Einige Gäste gehen früher, Sven ist schlecht gelaunt.“
- k4: „Sven seufzt. „Ehrlich gesagt …““ Nach der Wahl „„Ich find das falsch.“ – und weggehen.“ ist man nicht mehr bei Sven.
  - Ersatz: „Etwas später steht Sven wieder neben dir und seufzt. „Ehrlich gesagt …““

**S15 – Fazit lobt auf schwächeren Wegen bzw. die Lage widerspricht sich**
- `lagen-3.json` `flirten-l-11` ende1: „Freundlich mit dir geredet und das Gute gesehen – so bleibst du offen.“ Es wird auch über k4, wert 1 erreicht („„Egal, die Nächste.““ – laut rueck „Geprüft hast du den Satz damit aber nicht“).
  - Ersatz: „Du bist offen geblieben. Was den Weg dahin trägt: Fakt und Deutung trennen, einmal klar nachfassen, ein Nein mit Dank annehmen – und danach freundlich mit dir reden und das Gute sehen. Dranbleiben heißt hier: an dir dranbleiben.“
- `lagen-3.json` `flirten-l-15` ende3 (sagt): „In den nächsten Tagen antwortet er nur noch knapp“. Auf den Wegen k1b und k3 (vor k4) habt ihr noch gar keine Nummern getauscht.
  - Ersatz: „Er wird still und hält Abstand. Auch Jule merkt, dass etwas nicht stimmt.“
- Ebenda k2: „dass er **tagsüber** als Krankenpfleger arbeitet … „Nach einer **Nachtschicht** …““
  - Ersatz: „dass er als Krankenpfleger im Schichtdienst arbeitet“.

### Fakten und Belege

**S16 – `einheiten-2.json` `flirten-2-05`, Schritt `studie`, ergebnis**
- Zitat: „Ein Beleg, dass die Maschen wirken, fand sich nirgends.“
- Begründung: Hall & Canterberry 2011 haben die Wirkung gar nicht geprüft (Befragungen zu Haltungen). „Fand sich nirgends“ klingt, als hätten sie gesucht.
- Ersatz: „Ob die Maschen wirken, hat die Studie nicht geprüft – Belege dafür gibt es auch sonst keine.“

**S17 – `wissen.json` `flirten-w-115`**
- Zitat 1: „ob Mann, Frau oder jemand dazwischen“. „Dazwischen“ beschreibt nichtbinäre Menschen als Zwischenstufe; viele erleben das als abwertend.
  - Ersatz: „ob Mann, Frau oder nichtbinär“ (oder „egal welchen Geschlechts“).
- Zitat 2: „galt in Studien als wirksamster Einstieg“. Es ist eine einzige Bewertungsstudie (`weber2010`).
  - Ersatz: „galt in einer Studie als wirksamster Einstieg“.

**S18 – `vorrat-03.json` `flirten-v-0145` (kunstgriff, rot)**
- Zitat beste Antwort: „Lob durch Abwertung anderer – du sollst dich besonders fühlen …“; erklaerung: „… oft gepaart mit Druck …“.
- Begründung:
  - Ein einziger Satz nach einem ersten Date wird sicher als Masche gedeutet. Das widerspricht dem Bündel-Prinzip des Bereichs.
  - v-0177 bewertet fast denselben Satz nur als „vage“.
  - „oft gepaart mit Druck“ hat keine Quelle.
- Ersatz beste Antwort: „Ein Lob auf Kosten anderer – einmal kann es ehrlich sein; als Muster ist es eine Masche.“
- Erklärung entsprechend: „Achte aufs Muster, nicht auf den einen Satz.“ (Fork 1)

### Bewertung und Didaktik

**S19 – `einheiten-2.json` `flirten-2-05-a` (kunstgriff)**
- Wahl mit wert 1: „Ihn laut vor allen auslachen.“ Jemanden vor allen bloßzustellen ist nicht „brauchbar“; im Bereich `konter` läuft „Lacher holen“ als rot.
  - Ersatz: „Ihm knapp sagen: „Das war eher ein halbes Kompliment.““ – warum: „Klar benannt. Ob sie das von dir will, weiß nur sie – erst sie zu fragen, schont sie mehr.“
- Dazu die lage: „sagt ein Gast zu deiner Freundin“. Im Flirt-Bereich liest sich das als Partnerin des Nutzers.
  - Ersatz: „zu einer Freundin von dir“.
- Ebenso die erklaerung: „als Freund Rückhalt geben“.
  - Ersatz: „im Freundeskreis Rückhalt geben“.

**S20 – `einheiten-3.json` `flirten-3-05-a`, wert 1**
- Zitat: „„Wenn sie mal bei dir ist, sag mir Bescheid, dann komm ich ganz zufällig auch vorbei.““
- Begründung: Ein gespielter Zufall ist eine kleine Täuschung. Die Freundin weiß nicht, worum es geht, und kann nicht frei entscheiden. w-033 (preis) und v-0087 warnen ausdrücklich vor dem „zufälligen“ Auftauchen.
- Ersatz: wert 0, `tendenz: "taktieren"`, warum: „Ein gespielter Zufall – sie weiß nicht, worum es geht, und kann nicht frei Ja oder Nein sagen.“
- Neue Antwort mit wert 1: „„Klingt nett. Wenn sie mal Lust hat, kannst du uns ja vorstellen.““ – warum: „Offen und ohne Druck. Ob die Freundin vorher gefragt wird, bleibt aber in der Schwebe.“

**S21 – `vorrat-04.json` `flirten-v-0212`: Bewertung widerspricht Begründung und fc-035**
- „Es lieber nie sagen …“ steht auf wert 0, die Begründung sagt „Darfst du entscheiden“. In fc-035 steht dieselbe Antwort auf wert 1.
- Ersatz: wert 1, tendenz entfernen. (Fork 2)

**S22 – `vorrat-04.json` `flirten-v-0251`, wert 1**
- Zitat: „Gleich Schluss machen, um nicht verletzt zu werden.“ In v-0181 ist dasselbe Verhalten wert 0 (`vermeiden`).
- Ersatz: wert 0, `tendenz: "vermeiden"`. Neue Antwort mit wert 1: „„Ich will bleiben – lass uns irgendwann in Ruhe darüber reden.““ (Fork 2)

**S23 – `vorrat-04.json` `flirten-v-0184` (buendel)**
- Die Lage sagt „Du hast einmal nachgefasst“. Zeichen 3 („Vorschlag … nicht beantwortet“) setzt einen zweiten Versuch voraus.
- Ersatz Zeichen 3: „Auf deinen Terminvorschlag kam kein Gegenvorschlag.“ (Fork 2)

**S24 – `vorrat-04.json` `flirten-v-0243`, Muster 2**
- Es fehlt der Ausweg, den das eigene Kriterium „leicht ablehnbar“ verlangt. „Jules Kochkurs“ klingt, als leite Jule den Kurs; „Grillgeschick“ passt nicht zum Kochkurs.
- Ersatz: „„Hi, ich bin {name}, aus dem Kochkurs mit Jule – die Person mit den angebrannten Zwiebeln. Lust auf einen Spaziergang? Kein Muss.““ (Fork 2)

**S25 – `vorrat-03.json` `flirten-v-0176` (rangfolge)**
- Zitat: „von deutlich und frei bis vage oder drängend“. Ob vage oder drängend schlechter ist, lässt sich so nicht ableiten.
- Ersatz: „… zuerst klar und frei, dann vage, zuletzt drängend.“ (Fork 1)

**S26 – `vorrat-03.json` `flirten-v-0124` (Grammatik)**
- Zitat: „„Ich hab dir den Umzug geholfen, …““
- Ersatz: „„Ich hab dir beim Umzug geholfen, …““ (Fork 1)

**S27 – Wiederholen statt aufbauen (Vorrat)**
- `flirten-v-0111` (Stufe 5) ist fast dieselbe Lage wie v-0002 (Stufe 2): „Diese Woche ist voll“.
- `flirten-v-0153`: Die beste Antwort steht wörtlich in w-032 und v-0084.
- Ersatz v-0111: Lage „„Diese Woche ist schlecht – aber ich würd's gern nachholen!““ mit beste Antwort „„Schön! Sag einfach, wann es bei dir passt.““ – unterscheidet echten Aufschub von leisem Nein.
- Ersatz v-0153: die beste Antwort neu formulieren. (Fork 1)

**S28 – `tests.json` `flirten-fc-039`**
- Die Begründung zu wert 1 behauptet „nur ist sie gerade nicht da“; davon steht in der Frage nichts.
- Außerdem ist „„… du bist doch mit Jule befreundet?““ genau der Einstieg über Bekannte, den 3-05 lehrt (w-060: „Woher kennst du die Gastgeber?“). Unheimlich wirkt nur „Ich hab dich auf ihren Fotos gesehen“, und auch die Frage nennt eine „Bekannte“, nicht Jule.
- Ersatz Frage: „… eine Person, die du von Fotos einer Bekannten kennst. Die Bekannte ist heute nicht da. Was passt?“
- Ersatz falsche Antwort: „„Hi, ich bin {name} – ich kenn dich von Jules Fotos! Du warst doch auf ihrer Hochzeit, oder?““ (wert 0 bleibt, Begründung bleibt).

**S29 – Tests ähneln Übungen (Formcheck misst Gedächtnis)**
- fc-027 ↔ v-0122, v-0127 (zu ihm gehen, lieber Spaziergang)
- fc-035 ↔ v-0212 (beste Freundin, „füreinander bestimmt“)
- fc-036 ↔ v-0214 (betrunken, wortgleich „Fürsorge statt Gelegenheit“)
- fc-037 ↔ v-0227 (Kuscheln, still; wortgleiche Begründung)
- fc-040 ↔ v-0215 (Nein mitten in der Nähe)
- fc-029 ↔ v-0242 (Vermittlung, „frag ihn vorher“)
- l-14 k3 ↔ 3-05-c (Jule stellt eine Freundin vor, „ihr mögt/hasst beide …“)
- Gleiche Fähigkeit ist gewollt (siehe Phase 1, offener Punkt 6). Lage und Wortlaut der Tests sollten aber weiter wegrücken, zum Beispiel:
  - fc-036: Einschlafen statt Alkohol.
  - fc-037: Rückmeldung per Nachricht am nächsten Tag („Gestern war mir das zu schnell“).
  - fc-027: zweites Treffen, Vorschlag „gleich zu mir, da ist es ruhiger“. (Forks 1 und 2)

---

## Kann

### Einheiten
- **K1** `2-01` schaetzen, aufloesung: „Es wollte meist mehr.“ Kardas 2022 zeigt, dass man das Interesse des Gegenübers unterschätzt, nicht, dass es „meist“ mehr Tiefe wollte. → „Es war meist interessierter, als du denkst.“
- **K2** `2-02` und `w-016` belegHinweis: „nicht zu Verabredungen“. `bohns2019` untersucht genau romantische Annäherungen (das Nein ist schwerer, als Werbende denken). → „Das schwere Nein ist auch für romantische Annäherungen gezeigt; wie oft andere Ja sagen, nur für Bitten im Alltag.“
- **K3** `2-05` mythos: „Wer viele Fremde in kurzer Zeit anspricht, belästigt einige davon.“ Klingt nach Befund. → „… trifft zwangsläufig auch Menschen, die das als Belästigung erleben.“
- **K4** `2-04-b` „Eine Freundin weiß, wo du bist.“ → „Jemand, dem du vertraust, weiß, wo du bist.“ Ebenso `l-08` ende3: „schreibst deiner Freundin“ → „schreibst der Freundin“ (in der Lage eingeführt) – „deine Freundin“ ist im Flirt-Bereich doppeldeutig.
- **K5** `3-01` quellen: `montoya2017` wird zitiert, aber in der Einheit nicht verwendet (keine Wiederkehr-Aussage). Entweder streichen oder einen Satz zur Vertrautheit ergänzen.
- **K6** `3-02` belegHinweis: „Werte können für Dauerhaftes aber sehr wohl zählen“ – das stützt `eastwick2008` nicht (dort: Vorab-Wünsche sagen die erste Anziehung kaum voraus). → streichen oder „… über Dauerhaftes sagt die Studie nichts“.
- **K7** `3-03` und `w-126`: „Wer betrunken ist, kann nicht frei zustimmen.“ Das Gesetz unterscheidet (erheblich eingeschränkt → Zustimmung versichern, Abs. 2 Nr. 2). Die Regel der App ist bewusst strenger; das in den belegHinweis: „Die Regel ist strenger als das Gesetz – mit Absicht.“
- **K8** `3-04` Karte, aha, Merkkarte, schreibreise: „wie einen Freund“, „Brief wie an einen Freund“ → „wie jemanden, den du gernhast“ / „an einen guten Freund oder eine gute Freundin“.
- **K9** `3-05` aha: „Die wirksamste Vorstellung kommt von jemandem, der euch beide kennt.“ Eine Bewertungsstudie → „Als wirksamste Vorstellung galt in einer Studie die durch jemanden, der euch beide kennt.“
- **K10** `3-05-b` auftrag: Dass der Bekannte Männer datet, steht nicht da. → „… mit der du einen Bekannten, der ebenfalls Männer datet, fragst …“. Muster 2 nennt keinen „echten Anknüpfungspunkt“ (Kriterium 2) → „… ihr steht beide auf alte Filme …“.
- **K11** `3-05-c` beste Antwort: „„Jule übertreibt gern.““ behauptet etwas über Jule, das nicht im Text steht. → „„Keine Sorge, du musst jetzt nicht witzig sein. Ich bin {name} – …““

### Wissen und Tests
- **K12** `w-059` (Liebesbetrug): Er steht in der Gruppe „Maschen der Verführungsratgeber“, ist aber Betrug. → eigene Gruppe „Betrug im Netz – erkennen und abwehren“. abwehr ergänzen (Verbraucherzentrale): „Ist schon Geld geflossen: sofort die Bank anrufen.“
- **K13** `fc-032` „ihr Nein“, „ihre Ehrlichkeit“ und `fc-034` „bis er das Thema anspricht“: Pronomen ohne eingeführtes Gegenüber → „die Person“ bzw. „bis die andere Person …“.
- **K14** `fc-036` beste Antwort: „Ihn sicher nach Hause bringen lassen …“ ist missverständlich → „Dafür sorgen, dass er sicher heimkommt, und ein Treffen nüchtern vorschlagen.“
- **K15** `fc-038` wert 1 „Weiterlesen, bis es nicht mehr wehtut …“: Laut eigener Begründung hält das den Schmerz am Laufen; „brauchbar“ ist fraglich → wert 0 (`gruebeln`) und als wert 1 „Den Chat eine Woche nicht öffnen.“

### Lagen
- **K16** `l-06` ende4: Wird auch nach „„Schade, Samstag wär besser gewesen.““ erreicht; der Seufzer bleibt unerwähnt. → „Das Treffen steht – Ort und Zeit musste aber sie festlegen, und ein Seufzer über den Tag hat das Ja getrübt. …“
- **K17** `l-09` ende1 (sagt): „„Vielleicht geh ich … wirklich mal mit in deinen Kochkurs.““ Auf dem Weg über wert 1 wurde kein Kurs vorgeschlagen → „„Vielleicht such ich mir wirklich mal einen Kurs.““ · ende3 „Die Masche war gestoppt“ stimmt auf dem Weg über k3, wert 1 (weggegangen) nicht sicher → „Den Fehler hast du benannt – aber …“.
- **K18** `l-10` ende3: Die Liste nennt die verteidigte Bemerkung übers Aussehen (k1b) nicht → „… oder eine Bemerkung übers Aussehen verteidigt …“.
- **K19** `l-11` k1 wert 1 „Ihr Profil in der App prüfen, ob sie online war.“ Kontrolle ist kaum „brauchbar“ → wert 0 (`kontrollieren`) und als wert 1 „Dich ablenken und morgen wieder draufschauen.“
- **K20** `l-13` ende1: Wird auch nach dem ungefragten Kussversuch (k1 → k1b) erreicht; das Fazit beginnt mit „fragen statt raten“, ohne den Fehler zu nennen. Vertretbar, weil sie danach selbst „noch nicht“ sagt und die rueck in k1b klar ist.
- **K21** `l-15` ende3: deckt den Weg k1b (Nachlegen mit „ich bin auch Single“) nicht ab → „… oder Peinliches nachgelegt …“.

### Vorrat (Fork 1, `vorrat-03`)
- **K-F1-1** `v-0106`, `v-0107`: Pronomen wechseln (das Gegenüber „es“ → „sie“) → „Die Person …“.
- **K-F1-2** `v-0125`: Rangfolge mischt zwei Maßstäbe (leicht zu beenden gegen belebt) → Platz 2 „Spaziergang über den belebten Wochenmarkt“.
- **K-F1-3** `v-0172`, `v-0173`: Plätze 1 und 2 lassen sich vertretbar tauschen → einen klarer abstufen.
- **K-F1-4** `v-0109` karten[4]: „bei knappen Antworten an der Oberfläche bleiben“ als „trägt“ missverständlich → „bei knappen Antworten auf eine persönliche Frage wieder leichter werden“.
- **K-F1-5** `v-0150`: „nach drei Tagen absichtlichem Warten“ → „absichtlichen Wartens“. `v-0156`: „erlaubt dir, wann du willst zu antworten“ → „erlaubt dir, zu antworten, wann du willst“.
- **K-F1-6** `v-0133`: „Du hast es dir mit dem Rad selbst eingeteilt“ → „Du bist mit dem Rad da und willst allein heimfahren.“
- **K-F1-7** `v-0134`, `v-0135` erklaerung: „als Freund“, „als Gastgeber oder Freund“ → „im Freundeskreis“, „wer Gastgeber ist oder dabei ist“.
- **K-F1-8** `v-0144` erklaerung: „aus der Plattform gelockt, damit Schutz und Melden wegfallen“ steht nicht bei der Verbraucherzentrale (geprüft). Plausibel, aber ohne Quelle → streichen oder eine Quelle aufnehmen.

### Vorrat (Fork 2, `vorrat-04`)
- **K-F2-1** Die beste Antwort steht in 39 von 40 Fragen an erster Stelle. Für Nutzer folgenlos (die App mischt), nur Ordnung nach LIESMICH §4.
- **K-F2-2** `v-0223`, warum zu wert 1: „Richtig. Der Kern: …“ klingt wie die beste Antwort → „Stimmt – nur fehlt der Kern: Ein Zurückweichen ist ein Nein, nie ein Spiel.“
- **K-F2-3** `v-0254`: „Solche Sätze werden durch Schweigen bestätigt.“ – die Antwort ist aber kein Schweigen → „Wegschauen bestätigt solche Sätze. Ein klares Wort kostet wenig.“
- **K-F2-4** `v-0215`: `tendenz: "rechtfertigen"` bei „Fragen, was er denn plötzlich hat“ → `"beharren"`.
- **K-F2-5** `v-0216` Muster 1: „„… Kuscheln wir einfach?““ schlägt direkt nach einer Grenze andere Nähe vor → „„Okay. Danke, dass du's sagst. Magst du noch einen Film schauen?““
- **K-F2-6** `v-0216` vorlage: „wir sind doch schon so lange zusammen“ → „wir kennen uns doch lange genug“.
- **K-F2-7** `v-0193`: „… das gilt nur jetzt und für das eine.“ Bezug unklar → „Ein Ja gilt nur für jetzt und für das eine.“
- **K-F2-8** `v-0181`, `v-0229`: „Mit einer Freundin darüber reden“ → „Mit jemandem, dem du vertraust, darüber reden“.
- **K-F2-9** `v-0233` Muster 1: verschachtelte Anführungszeichen → innen ‚Immer‘.
- **K-F2-10** `v-0187`: „Zappeln-Lassen“ → „Zappelnlassen“ (ebenso `l-07` ende1/ende4).
- **K-F2-11** `v-0202`: „Seine Antwort“ nach „Die Person antwortet“ → „Die Antwort“.
- **K-F2-12** `v-0255` (Nachstellung): Möglich wäre „Hört es nicht auf, nimmt die Polizei das auf.“ – nur mit § 238 StGB als geprüfter Quelle; sonst so lassen.

---

## Geprüft und in Ordnung

- **§18-Regeln:**
  - Kein Eintrag lehrt Annäherung an Abhängige, Dienstleistende im Dienst, Menschen in Bahn, Aufzug oder nachts auf der Straße.
  - Kein Nachhaken nach einem Nein; ein Zögern gilt überall sofort (l-06 k3b, l-10 k3b/k6, l-13 k2, 3-01-a, fc-033).
  - Berührung und Kuss nur nach Frage. Die Gegenbeispiele sind immer falsch mit `ueberdeuten`/`beharren`.
- **Rote Linie:** nur zum Erkennen, immer mit Abwehr (2-03-b, 2-05-a, l-09, v-0134, v-0135, v-0144, v-0145, v-0222, v-0223, v-0228). `einfluss: rot` steht nie an einer Mission oder Musterlösung. Taktik-Missionen gibt es keine.
- **Fachhilfe** nur als Schritt (3-03 `belaestigung`, 3-04 `seele`), keine Rufnummern im Bereich.
  - Hinweis an den Hauptstrang: Die gemeinsame Karte `belaestigung` nennt keine Anlaufstelle speziell für sexualisierte Gewalt. 116 016 deckt das für Frauen ab, für andere fehlt ein Hinweis. Die Karte ist eine gemeinsame Datei und nicht Gegenstand dieser Prüfung.
- **Erwachsene:** keine Minderjährigen. „Junge Frau“ (l-09) steht klar im Erwachsenenrahmen einer Gartenfeier. Auszubildende kommen nur als Gegenbeispiel vor.
- **Erstarren** ohne Schuldzuweisung (w-089, 3-03, l-15 k6b, v-0227). Die Zahl ist korrekt und richtig eingegrenzt („Studie betrifft Übergriffe, nicht jedes Zögern“). Ausnahme S2.
- **Liebesbetrug:** stimmt mit der Verbraucherzentrale überein, auch „Video ist kein sicherer Beweis“.
- **Didaktik:**
  - Jede Einheit hat 6–8 Schritte, mindestens drei Formate, zwei aktive, einen Neugier-Einstieg und 2 Merkkarten.
  - Die Belege sind ehrlich abgestuft (U für Maschen, P für Praxis, B mit belegHinweis).
  - Neue Werkzeug-Formate sind passend eingesetzt (geschichte, gespraechskarte, leiter, woop, werte, schreibreise, wenndann).
  - Die stummen Übungen sind echt still. Laute Übungen gibt es im Bereich nicht.
- **Besetzung:** nur Jule, Sven und Bruno sowie namenlose Rollen. Jule bleibt „Bekannte aus dem Kochkurs“ und ist offen und direkt; Sven bleibt der alte Freund, der stichelt und es gut meint.
- **Sprache:** Du-Form, „Sie“ nur in der 3. Person, kein „...“, keine verbotenen Wörter, keine Marken.
- **Gemischte Gegenüber:** Die Sparrings wechseln (Phase g Jule, k eine Frau aus der Fotogruppe, m ein Mann). Das Geschlecht des Nutzers bleibt offen – außer an den Stellen in M3/M4.

## Urteil

**Für „nur Davide“: freigabereif nach M1 bis M5.** Das sind fünf kleine, eindeutige Textänderungen (zwei Sätze Rechtslage, ein neues Ende in l-15, Pronomen, Nummerntausch in l-10). Vor einer Freigabe für andere würde ich zusätzlich S1 bis S4 (Einvernehmen, Sicherheit, keine Mitschuld) und S11 bis S15 (Wege in Lagen) umsetzen. Nach den Änderungen bitte `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur flirten` laufen lassen (neues Ende `ende5` in l-15).

---

## Umsetzung (25.11.2026)

Eingearbeitet in `src/coach/inhalt/flirten/` (einheiten-2/3, lagen-2/3, vorrat-03/04, Tests fc-025…040, wissen, quellen). Stufe-1-Dateien (einheiten-1, lagen-1, vorrat-01/02, Tests fc-001…024) nicht angefasst; `lagen-1.json` nur gelesen – dort entsteht nirgends körperliche Nähe, kein Ende gibt eine Mitschuld. Kennungen unverändert, nichts gelöscht. Danach `node scripts/coach-index.mjs`; `node scripts/coach-pruefe.mjs --nur flirten` → **0 Fehler, 7 Hinweise** (die bekannten aus Phase 1); `--soll flirten` → nichts fehlt. Alle Wege jeder Lage und beider Dialoge per Skript abgelaufen (kein Knoten unerreichbar, keine Wahl über 140 Zeichen) und jedes Ende gegen jeden Weg dorthin gelesen.

§ 177 StGB selbst auf gesetze-im-internet.de nachgelesen: Abs. 1 sexuelle Handlungen gegen den erkennbaren Willen; Abs. 2 u. a. Nr. 1 (kann keinen Willen bilden oder äußern), Nr. 2 (erheblich eingeschränkt, sofern sich der Täter nicht der Zustimmung versichert), Nr. 3 (Überraschungsmoment). Verbraucherzentrale (Stand 10.4.2025) erneut gelesen: „Zahlungen, wenn noch möglich, sofort rückgängig“ und „allenfalls ein schneller Anruf“ stehen dort; dass Betrüger von der Plattform weglocken, steht dort **nicht** (Polizei-NRW-Seiten, die es sagen sollen, waren nicht erreichbar → nicht übernommen, siehe K-F1-8).

### Muss

| Befund | Stand |
|---|---|
| M1 | **umgesetzt.** 3-03 Karte: „Das Gesetz (§ 177 StGB) bestraft sexuelle Handlungen gegen den erkennbaren Willen – und auch, wenn jemand ausnutzt, dass ein anderer nicht widersprechen kann oder überrascht wird. „Nur ein Ja ist ein Ja“ geht weiter: aus Achtung.“ (Betrunken-Satz steht weiter in Merkkarte m1; Karte 420 Zeichen). w-018 wie vorgeschlagen, ergänzt um „oder überrascht wird“; belegHinweise von 3-03, w-018, w-089, w-126 nennen die Regel der App als bewusst strenger als das Gesetz. Quelle `stgb177` um Abs. 2 Nr. 2 (Zustimmung versichern) und Nr. 4/5 präzisiert. |
| M2 | **umgesetzt, strenger als vorgeschlagen.** l-15 k6b führt nie mehr zu k6 (Kuss). Beste Wahl „Entschuldige, ich hätte fragen sollen. Alles okay bei dir?“ (erst aufhören, dann nach ihm fragen – nicht, ob es doch geht) → neues `ende5` ohne Kuss: Er geht und schreibt am nächsten Tag „Danke, dass du gleich aufgehört hast. Ich brauch ein bisschen.“; das Fazit nennt den Fehler (fehlende Frage) und lässt die Entscheidung bei ihm. Neue Wahl wert 1 „Erschrocken zurücktreten und nichts sagen“ → ebenfalls `ende5` (Fazit passt auf beide Wege). „Komm, jetzt sei nicht so“ → neues `ende6` (Grenzüberschreitung klar benannt, „Sein Rückzug ist sein gutes Recht“) statt des milden ende3. Den Kuss (k6) erreicht man nur noch über „Darf ich dich küssen?“ und sein ausdrückliches „Gern“. Der Vorschlag „Nächstes Mal frag einfach“ wurde bewusst nicht übernommen – er hätte nach einem Erstarren schon das nächste Mal in Aussicht gestellt. Dazu ende1 „winkt von der Straßenecke“ (er begleitet dich zu *deiner* Tür, das „Treppenhaus“ passte nicht) und ende4 „ein weiteres Treffen“ (auf dem Weg über k4 gab es schon das zweite). |
| M3 | **umgesetzt:** fc-037 (neu gebaut, siehe S29), v-0215, v-0227 („ihr seid ein Paar … er“), v-0250 („sagt er“). |
| M4 | **umgesetzt:** v-0130 („eine Patientin, die du in deiner Praxis behandelst“), v-0167, l-07 k1 („nicht zuerst“). |
| M5 | **umgesetzt:** l-10 k4 „Lass uns Nummern tauschen“; k5 „Dann kommt ihre Nachricht: „Sorry, Chaoswoche! Samstag, neun Uhr am Kai – ich bin dabei.““ – passt nach eigener Nachricht und nach Warten. |

### Sollte

| Befund | Stand |
|---|---|
| S1 | **umgesetzt:** 3-03-c Auftrag „einen Satz, der aufhört …“, Kriterien „hält zuerst inne“ und „fragt danach, wie es dem anderen geht – nicht, ob es weitergeht“, Muster 1 wie vorgeschlagen. Dieselbe Regel überall nachgezogen: Fach in 3-03-a „kein Ja – aufhören, dann nachfragen“, w-034 („Ein Zögern ist ein Nein – erst aufhören, dann fragen, wie es dem anderen geht“), w-065 (Beispiel „Lass uns kurz aufhören – alles okay bei dir?“ statt „Sollen wir eine Pause machen?“), w-126 Punkt 2, v-0195 Muster 2. |
| S2 | **umgesetzt:** fc-027 warum („Mitgehen ist keine Pflicht, nur weil Nein unhöflich wirkt. Und mitgehen heißt nicht, zu irgendetwas Ja gesagt zu haben.“ – „du musst“ ist ein verbotenes Wort); l-08 ende2 („… verpflichtet dich zu nichts. Gut, dass du gegangen bist. …“). Ebenso l-13 ende4: „Ein Ja aus Rücksicht ist kein Ja“ → „Mitzugehen verpflichtet dich zu nichts – gut, dass du gegangen bist, als es sich falsch anfühlte …“. |
| S3 | **umgesetzt** („Du sagst Ja, ihr küsst euch.“). |
| S4 | **umgesetzt, anders:** Sie erwähnt das Alleinwohnen gar nicht mehr („Seit dem Umzug hierher bin ich morgens oft wach.“); beste Antwort „… Sind die frühen Morgen eher schön oder eher zäh?“ (Erleben, eine Ebene tiefer); die Übertrumpf-Antwort entsprechend angepasst. |
| S5 | **umgesetzt** (v-0248: wert 0 `ueberziehen` und neue Antwort wert 1 „Schönes Fest, oder?“). |
| S6 | **umgesetzt,** warum geschärft: „Die richtige Richtung, aber mit Hintertür. Solange sie bei ihm lernt, gibt es keinen passenden Moment – ein klares Nein hilft ihm mehr.“ |
| S7–S10 | **umgesetzt** wie vorgeschlagen (v-0224: „Auf deine Frage sagt er: „Ja, komm her“ – und lächelt.“). Dieselbe Unschärfe in 3-03-a ebenfalls behoben: „Du fragst: „Darf ich?“ Er nickt und sagt: „Komm her.““ |
| S11 | **umgesetzt** (2-04-c k2, l-10 k2, l-10 k6). |
| S12 | **umgesetzt;** zusätzlich ende2 „sagt“ an alle drei Wege angepasst („Zwei Wochen später ist Funkstille. Keiner von euch schreibt mehr.“ – auf dem Weg über k1b wurde nie geschrieben). |
| S13 | **umgesetzt, ohne „trotzdem“** (hätte auf dem besten Weg nicht gepasst): „Sie erzählt weiter: „Im Winter hab ich den Job gewechselt …““ |
| S14 | **umgesetzt, gründlicher:** Der Weg „Weiterfeiern“ (k2b) bekommt ein eigenes `ende4` – die Freundinnen finden die junge Frau vorn an der Straße und bringen sie heim; Fazit ohne jede Schuld an sie. ende2 gilt nur noch für „Bleib nett“ und erzählt das (Sven versucht es noch einmal, die Person geht). k4: „Später am Abend setzt sich Sven zu dir …“ |
| S15 | **umgesetzt** (l-11 ende1, l-15 ende3, l-15 k2 „im Schichtdienst“). |
| S16, S17 | **umgesetzt** (2-05 Studie; w-115 „ob Mann, Frau oder nichtbinär“ und „in einer Studie“). |
| S18 | **umgesetzt** (v-0145: beste Antwort, warum, Begründung zu wert 1 und Erklärung aufs Muster gestellt; „oft gepaart mit Druck“ gestrichen). |
| S19 | **umgesetzt;** „Ihn laut vor allen auslachen“ bleibt als wert 0 (`angreifen`) mit Begründung erhalten. |
| S20 | **umgesetzt;** dazu die Begründung „Vermittlung … gilt als besonders wirksam“ → „galt in einer Studie …“. |
| S21–S26 | **umgesetzt** (v-0212, v-0251 mit neuer wert-1-Antwort, v-0184, v-0243, v-0176, v-0124). |
| S27 | **umgesetzt:** v-0111 neu als echter Aufschub („… aber ich würd's gern nachholen!“; beste Antwort „Gern! Sag einfach, welcher Tag nächste Woche dir passt.“, alle Antworten angepasst); v-0153 Frage und beste Antwort neu formuliert. |
| S28 | **umgesetzt;** „auf ihrer Hochzeit“ → „auf ihrem Geburtstag“ (keine neue Tatsache über Jule erfinden). |
| S29 | **umgesetzt – Tests neu gebaut statt umformuliert:** fc-027 (zweites Treffen, „gleich zu mir, da ist es ruhiger“), fc-029 (du sollst vermitteln: die Nachbarin vorher fragen), fc-035 (Bekannte aus dem Kletterverein; falsch: an der Wand fragen = Abhängigkeit), fc-036 (die Person schläft auf dem Sofa ein – Schlaf statt Alkohol), fc-037 (Rückmeldung per Nachricht am nächsten Morgen), fc-040 (abgesagte Übernachtung – ein Nein nach einer Zusage). l-14 k3 rückt von 3-05-c weg (Jule stellt vor und wird weggerufen, Anknüpfung „neu im Viertel“); die Antwort in k4 angepasst. |

### Kann

| Befund | Stand |
|---|---|
| K1–K4, K6–K11 | **umgesetzt** (K4 auch v-0246 „der Freund“; K8 in 3-04 Aha, Karte, Schreibreise „Ein Brief an jemanden, den du gernhast“, Regel, Merkkarte, außerdem w-019 und l-11 ende4; K11 ohne „du musst“: „Keine Sorge, niemand erwartet ein Wortspiel. …“). |
| K5 | **bewusst nicht:** `montoya2017` trägt im belegHinweis von 3-01 den Satz zur Vertrautheit; die Quelle ist damit belegt verwendet. |
| K12 | **umgesetzt:** eigene Gruppe „Betrug im Netz – erkennen und abwehren“; abwehr „Ist schon Geld geflossen: schnell die Bank anrufen – vielleicht lässt sich die Zahlung noch aufhalten.“ (so vorsichtig wie die Verbraucherzentrale); Quelle `vz-lovescam` ergänzt. |
| K13, K15 | **umgesetzt** (fc-032, fc-034; fc-038 mit neuer wert-1-Antwort). |
| K14 | **erledigt durch S29** (fc-036 neu gebaut). |
| K16–K19, K21 | **umgesetzt** (K16 wegneutral: „… freudig annehmen, ohne Seufzer …“; K17 samt ende3 „Den Fehler hast du benannt“; K19 mit neuer wert-1-Antwort „Dich ablenken und morgen wieder draufschauen.“). |
| K20 | **bewusst nicht:** wie im Bericht vertretbar – auf dem Weg über k1b ist die Rückmeldung klar, und ende1 („beide haben es sofort angenommen“) stimmt auf jedem Weg. |
| K-F1-1 … K-F1-7 | **umgesetzt** (v-0106/0107 „die Person … sie“; v-0125 Wochenmarkt; v-0172 Platz 2 „erst beim Abschied sagen“, v-0173 Platz 2 „mit Arbeit eindecken“ – jetzt eindeutig gestuft; v-0109; v-0150/0156; v-0133; v-0134/0135). |
| K-F1-8 | **umgesetzt ohne neue Quelle:** v-0144 behauptet nicht mehr, Betrüger lockten von der Plattform weg; beste Antwort und Erklärung begründen „in der App bleiben“ nur noch mit deren Schutz (Melden, Blockieren). |
| K-F2-1 | **bewusst nicht:** `uebungen/Wahl.tsx` mischt die Antworten (`rng(…).misch`); Umsortieren in der Datei hätte für Nutzer keine Wirkung. |
| K-F2-2 … K-F2-11 | **umgesetzt.** |
| K-F2-12 | **bewusst nicht:** ohne geprüfte Quelle zu § 238 StGB keine neue Rechtsaussage. |

### Zusätzlich (beim Durchgehen aller Wege gefunden)

- 3-02-b ende1: „Sie lehnt sich an deine Schulter“ → „Sie lächelt … Ihr bleibt noch eine Weile auf der Bank sitzen.“ (keine Nähe ohne erkennbares Einverständnis).
- Längen: Durch die Änderungen lagen einheiten-3, vorrat-04 und die Meisterschafts-Tests über der Hälfte „beste = längste“ → falsche Antworten verlängert (fc-037, fc-040, v-0202, v-0214) bzw. die beste gekürzt (3-05-c). Für `flirten` gibt es keinen Längen-Hinweis mehr.

### Nur außerhalb des Bereichs lösbar (für den Hauptstrang)

- `gemeinsam.json` → `fachhilfe.belaestigung` nennt keine Anlaufstelle speziell bei sexualisierter Gewalt für Menschen, die nicht Frauen sind (aus dem Gegenlesen übernommen; nicht geändert).
