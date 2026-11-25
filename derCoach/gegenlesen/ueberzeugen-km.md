# Gegenlesen: `ueberzeugen` – Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser (Verkauf/Verhandlung, Verbraucherschutz, Faktenprüfung) · **Inhaltsdateien:** nicht geändert

## Was geprüft wurde

- **Maßstab:** `08_ENTSCHEIDUNGEN.md` (geht vor), `06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3 und Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (§ 3a, § 4, § 5, § 7, § 8), `05_LEHRPLAN.md` (3.14, Stufe 2/3), `inhaltTypen.ts` (Umfelder), `besetzung.json`, der Bericht zu Phase 1 (`gegenlesen/ueberzeugen.md`).
- **Vollständig gelesen:** `einheiten-2.json` (2-01 … 2-06), `einheiten-3.json` (3-01 … 3-05), `lagen-2.json` (l-06 … l-10), `lagen-3.json` (l-11 … l-15), `vorrat-03.json` (v-0106 … v-0185, 80 Einträge), `vorrat-04.json` (v-0186 … v-0276, 91 Einträge), die neuen Lerntage in `kurs.json`, `fc-025` … `fc-040` in `tests.json`, die neuen Einträge in `wissen.json` (w-016 … w-019, w-032 … w-034, w-046, w-060, w-061, w-069, w-124) und die neuen Quellen (`zebregs2015`, `xu2023`, `galinsky2001`, `banas2010`, `bgb-widerruf`).
- **Jeder Weg durch jede Lage** und jeden Dialog wurde nachgegangen. Alle Preise und Prozentangaben wurden nachgerechnet.
- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur ueberzeugen` ergibt **0 Fehler und 11 Hinweise**. Alle Hinweise betreffen Phase 1: `v-0076`, `v-0077` und `v-0103` haben keine brauchbare Antwort; in `lagen-1` sind sechs Wahlen länger als 140 Zeichen; in `lagen-1` und `vorrat-02` ist die beste Antwort zu oft die längste. Für die neuen Dateien gibt es **keine** Meldung. `--soll ueberzeugen` meldet keine Lücke im Vorrat für die Übungstage `ue-008` … `ue-018`.
- **Kursplan:** k hat 20 Lerntage (6 E, 6 Ü, 4 L, 3 A, 1 S), m hat 18 (5 E, 5 Ü, 4 L, 3 A, 1 S). Die Bänder liegen bei [3,6]–[4,7] und [5,8]–[6,10]. Die Tests haben 8 + 8 Fragen, Stufen 4–7 bzw. 7–9. Alles stimmt.
- **Laut/leise:** `3-03-c` → `v-0186`, `3-04-b` → `v-0187`, `v-0198` → `v-0196`, `v-0199` → `v-0186`, `v-0212` → `v-0210`, `v-0213` → `v-0211`. Jede stille Übung übt dasselbe wie die laute, alle haben das Format `stumm`. **In Ordnung.**
- **Quellen an der Quelle geprüft:**
  - `banas2010`: 54 Fälle; Impfung schützt besser als keine Behandlung und als stützende Botschaften. Der Schutz nimmt etwa ab zwei Wochen ab. **Stimmt.**
  - `xu2023`: 50 Studien, 65 Vergleiche, rund 13.100 Personen. Insgesamt kein sicherer Unterschied (r = 0,016). Fallbeispiele liegen nur bei Gesundheitsbotschaften zur Vorsorge und bei Stichproben ohne Studierende vorn. **Stimmt.**
  - `zebregs2015`: Zahlen wirken stärker auf Überzeugungen und Einstellungen, Fälle stärker auf die Absicht zu handeln. Das deckt sich mit der Quellenangabe; im Kurs fehlen die Einstellungen, das ist vertretbar.
  - `galinsky2001`: Den Vorteil der ersten Zahl hoben drei Blickrichtungen auf: die **Alternativen der Gegenseite** (Exp. 1), die **Schmerzgrenze der Gegenseite** (Exp. 2) und das **eigene Ziel** (Exp. 3). Die **eigene** Alternative wurde nicht untersucht. Mehrere Stellen behaupten aber genau das, siehe Befund S1.
  - `bgb-widerruf`: § 312g BGB gibt das Widerrufsrecht bei Verträgen außerhalb von Geschäftsräumen und bei Fernabsatz. § 355 Abs. 2 setzt die Frist auf 14 Tage, Beginn bei Vertragsschluss, „soweit nichts anderes bestimmt ist“. Bei Warenkäufen beginnt sie meist erst mit dem Erhalt der Ware (§ 356 Abs. 2). Diese Angaben stammen aus eigener Kenntnis des Gesetzes, die Seiten wurden nicht neu abgerufen.
- **Einfluss-Klassen:**
  - **Rot** erscheint nur zum Erkennen: in `kunstgriff` (v-0113/114/116/117/130–132/149/175/238–240/242/250/251, 2-01-c, 3-02-b/c), in `auswahl` mit dem Ziel des Erkennens (v-0108), in `zuordnen` und als Antwort mit `wert: 0`. Rot ist nie beste Antwort zum Einsetzen, nie Musterlösung, nie Mission.
  - **Taktik**, die du selbst einsetzt, kommt nur im privaten Verkauf vor (Gartenstühle, Klavier, Sofa, Kombi, Rennrad), im privaten Kauf (Lastenrad, Gebrauchtwagen) und beim Kundenpreis. Nie gegenüber Kollegen; `3-01` und `l-14` schließen Taktik nach oben ausdrücklich aus.
  - Die neuen Taktik-Einträge `w-046` (Einheit) sowie die roten `w-060` (falsches Entweder-oder) und `w-061` (Kampf beim Chef) tragen `preis` und `abwehr`. Die Abgrenzungen aus LIESMICH § 7 sind richtig umgesetzt (echte und falsche Wahl, echte und künstliche Frist, kleine Zusage und erschlichenes Ja).
- **Korrekturen aus `08`:** „Aber du entscheidest“ kommt in den neuen Inhalten nicht als Wirkversprechen vor. Bei der ersten Zahl sind die Meta-Analyse und der Preis überzogener Zahlen richtig genannt (2-03-c, w-035, v-0123). Das Vorstellungsgespräch (3-03, l-12, v-0204) folgt der Korrektur. Es gibt keine Rufnummern und keinen `fachhilfe`-Schritt (bei diesen Themen nicht nötig).

**Gesamturteil:** Fachlich und ethisch sauber gebaut. Der Selbstschutz als Kunde (Küchenstudio, Autohaus, Schlüsseldienst, Fitnessstudio, Gewinnspiel, Anlageberater) ist eine echte Stärke, ebenso die Lagen l-08, l-10 und l-15 mit Grenzen und Gegenleistung. Die Befunde betreffen vor allem drei Dinge: die Neutralität des Nutzers, Rückmeldungen, die auf einzelnen Wegen nicht stimmen, und eine Zuspitzung der Galinsky-Studie.

**Zählung:** muss **3** · sollte **14** · kann **20**

---

## MUSS (vor der Freigabe)

### M1 – `lagen-2.json`, `ueberzeugen-l-08`, Knoten `k4`, Wahl 1, und `ende4`: Rechnung falsch, schwacher Weg wird gelobt
- **Zitat:** Wahl „„Na gut, 330.““ (`wert: 1`), Rückmeldung „Über deiner Grenze, aber ohne Gegenleistung.“, `ende4`: „Ein Vertrag über deiner Grenze.“
- **Begründung:** Laut Lage ist ein Festpreis mit allen Extrastunden „ab 360 machbar, bei drei Jahren Laufzeit ab 330“. Wer 330 mit allem **ohne** längere Laufzeit gibt, liegt unter der eigenen Grenze für dieses Paket. Die 320 gelten nur für den Vertrag mit Extras nach Aufwand. Rückmeldung und Fazit loben also einen Verlust.
- **Ersatz:** Wahl auf `wert: 0`, `tendenz: "nachgeben"`, `weiter: "ende2"`. Rückmeldung: „330 mit allem rechnet sich für dich nur bei drei Jahren – ohne Gegenleistung arbeitest du unter deiner eigenen Rechnung.“ Wenn `ende4` bleiben soll, dann so: „Abgeschlossen – aber 330 mit allem lohnt sich für dich nur bei längerer Laufzeit. Nachlass nur gegen etwas.“

### M2 – Geschlecht des Nutzers festgelegt (LIESMICH § 5)
| Datei | Kennung | Zitat | Ersatz |
|---|---|---|---|
| tests | `fc-028`, Antwort 2 | „„Ich bin der neue Sachbearbeiter.““ | „„Ich bin neu im Einkauf.““ |
| tests | `fc-028`, Antwort 3 | „„Ich bin der beste Einkäufer, den Sie je hatten – …““ | „„Mit mir haben Sie den besten Einkauf, den Sie je hatten – Sie werden schon sehen …““ |
| vorrat-04 | `v-0188`, Antwort 1 | „„Weil ich der Beste bin, den Sie heute sehen werden.““ | „„Weil ich von allen heute die beste Wahl bin.““ |
| vorrat-04 | `v-0189`, Antwort 2, `warum` | „… das fragt sich jeder Leser: Wie redet sie später über uns?“ | „Schuld bei anderen – wer zuhört, fragt sich: Wie wird über uns später geredet?“ |

### M3 – Elternrolle unterstellt (LIESMICH § 5: kein festgelegter Familienstand)
| Datei | Kennung | Zitat | Ersatz |
|---|---|---|---|
| tests | `fc-040` | „Am Ende deines Vorschlags im Elternrat …“ | „Am Ende deines Vorschlags im Vorstand des Fördervereins …“ |
| vorrat-04 | `v-0267` (Titel, Figur, Lage, Wahl k1/3) | „Der Einwand im Elternrat“, „ein Vater im Elternrat“, „Im Elternrat schlägst du vor, die Klassenkasse …“, „„Zwei Leute aus dem Elternrat.““ | „Der Einwand im Förderverein“, „ein Mitglied des Fördervereins“, „Im Förderverein schlägst du vor, die Vereinskasse künftig über ein gemeinsames Konto statt bar zu führen. Ein Mitglied meldet sich.“, „„Zwei Leute aus dem Vorstand.““; in k2 „für so eine kleine Klassenkasse“ → „für so eine kleine Vereinskasse“; „Vater:“ → „Mitglied:“ |

---

## SOLLTE

### S1 – Galinsky 2001 auf die **eigene** Alternative ausgedehnt (Ehrlichkeit des Belegs)
Die Studie zeigt: Der Zug der ersten Zahl verschwindet, wenn man an das **eigene Ziel** oder an die **Alternativen bzw. die Schmerzgrenze der Gegenseite** denkt. Die eigene Alternative wurde nicht untersucht.
| Datei | Kennung | Zitat | Ersatz |
|---|---|---|---|
| einheiten-2 | `2-05-m2` | „An das eigene Ziel und die eigene Alternative denken – vorher aufgeschrieben.“ | „An das eigene Ziel denken – oder an die Alternativen der Gegenseite. Am besten vorher aufschreiben.“ |
| einheiten-2 | `2-05`, Schritt `studie`, `grenze` | „… deine Zahl und deine Alternative vorher aufschreiben …“ | „… dein Ziel vorher aufschreiben und im Gespräch daran denken. Die eigene Alternative zu kennen ist Praxiswissen dazu.“ |
| einheiten-2 | `2-05-b`, Antwort 2, `warum` | „Mit Ziel und Alternative auf dem Zettel zieht dich die Zahl der anderen weniger …“ | „Mit deinem Ziel auf dem Zettel zieht dich die Zahl der anderen weniger – und dank der Alternative kannst du freundlich gehen.“ |
| wissen | `w-033` | `beleg: "B"`; belegHinweis „… Wer an das eigene Ziel denkt, wird … weniger gezogen.“ (passt nicht zum Titel „Die eigene Alternative kennen“) | `beleg: "P"`; belegHinweis: „Der Gedanke stammt aus dem Harvard-Konzept (Praxis). Experimentell belegt ist Verwandtes: Wer an das eigene Ziel denkt, wird von der ersten Zahl weniger gezogen.“ |

### S2 – Beste Antwort behauptet, was die Lage offenlässt
- **`einheiten-2`, `2-01-c` (kunstgriff), Antwort 3:** „Erfundene Sachkunde – nach Namen und Unterlagen fragen …“. Die Lage sagt bereits: „Auf deine Nachfrage kann er keinen einzigen Namen nennen.“ Die beste Antwort wiederholt also, was schon geschehen ist, und behauptet „erfunden“ als Tatsache, während die eigene Begründung „vermutlich“ sagt. **Ersatz:** „Vermutlich erfundene Sachkunde – das Gerät ohne den ‚Beirat‘ prüfen: Unterlagen, Tests, eigener Vergleich.“
- **`einheiten-3`, `3-02-c`, Antwort 2:** „Gespielter Kampf, künstliche Frist: …“. Die eigene `erklaerung` sagt dagegen: „Ob der Kampf beim Chef echt war, kannst du nicht wissen.“ **Ersatz:** „Vielleicht gespielt, sicher künstliche Frist: „Danke. Bitte schriftlich – gilt es, gilt es morgen auch.““ (`v-0175` macht es mit „Vermutlich …“ vor.)

### S3 – `einheiten-3`, `3-02-b`: Arbeitsplatten-Frage ist kein klares falsches Entweder-oder
- **Zitat:** „„Wollen Sie die Arbeitsplatte in Eiche oder in Granit?“ Du hast noch gar nicht entschieden, ob du hier kaufst.“ – Antwort 1 (wert 0): „So rutschst du in eine Entscheidung …“
- **Begründung:** In einer Küchenplanung gehört die Wahl der Platte zum Angebot. Sie bindet nicht. So wird eine normale Planungsfrage als rote Linie gelehrt. In `l-11`, k1 ist es durch „So, jetzt haben wir alles“ klarer, aber auch dort nur knapp.
- **Ersatz (Lage):** „Im Küchenstudio, nach der Planung. Der Berater schiebt dir den Auftrag hin: „Machen wir ihn mit Eiche oder mit Granit fertig? Dann unterschreiben Sie hier.“ Du hast noch gar nicht entschieden, ob du hier kaufst.“ In `l-11`, k1 entsprechend: „„So, jetzt haben wir alles. Unterschreiben wir mit Eiche oder mit Stein?““

### S4 – `einheiten-2`, `2-03-b` (Dialog „Geht da noch was?“), `ende1`: Fazit falsch auf zwei Wegen
- **Zitat:** „Erst gefragt, dann den Umfang statt nur den Preis verändert.“
- **Begründung:** Man kommt auch so zu `ende1`: über k1 Wahl 1 („Für Sie mache ich 1.200“) und k1b, oder über k1 Wahl 3 (Verteidigen) und k1c. Auf beiden Wegen wurde nicht „erst gefragt“, und der Preis hat schon Glaubwürdigkeit verloren.
- **Ersatz:** „Am Ende den Umfang statt nur den Preis verändert – Nachlass gegen Gegenleistung. Am stärksten ist es, wenn du gleich zu Beginn fragst, was hinter „zu teuer“ steckt.“

### S5 – `lagen-2.json`, `ueberzeugen-l-07`: Käufer mit „genau 5.500 gespart“ zahlt 5.700
- **Zitat:** k3: „„Ehrlich: Ich habe genau 5.500 gespart. …““ → Wahl 2 „Für 5.700 lege ich die fast neuen Winterreifen dazu.“ → `ende1`: „„Dann 5.700 mit den Winterreifen. Abgemacht.““
- **Ersatz k3:** „„Ehrlich: Fürs Auto wollte ich höchstens 5.500 ausgeben. Und neue Reifen brauche ich dann ja auch noch.““ (Dann ergibt 5.700 mit Reifen Sinn.)

### S6 – „letztes Wort“, dann doch nachgeben (l-07 und v-0124)
- **`l-07`, k2, Wahl 2 (wert 1):** „„5.750, das ist mein letztes Wort.““ führt nach k3, wo die beste Antwort „Für 5.500 nehmen Sie ihn so“ ist. Nach dem „letzten Wort“ verliert das an Glaubwürdigkeit, und das wird nirgends angesprochen. **Ersatz:** „„5.750 – da komme ich Ihnen entgegen.““
- **`vorrat-03`, `v-0124`, k2, Wahl 3:** „„1.500, letztes Wort.““ → k3, wo „Einverstanden“ (1.600) `wert: 2` hat. **Ersatz:** „„1.500 – mehr hatte ich nicht eingeplant.““

### S7 – `lagen-3.json`, `ueberzeugen-l-15`: Zahl fällt, die nie genannt wurde
- **Weg:** k5 Wahl 3 („18.000? Das kann nicht seriös sein.“) → k5b Wahl 1 → k6: Buchhalterin: „„24.000 gegen 18.000.““. Auf diesem Weg hast du 24.000 nie genannt.
- **Ersatz k5b, Wahl 1:** „„Entschuldigung. Unser Paket kostet 24.000 im Jahr, alles drin. Darf ich es neben Ihres legen?““ (139 Zeichen; sonst kürzer: „„Entschuldigung. Unseres: 24.000, alles drin. Legen wir beide nebeneinander?““)

### S8 – Fazit oder Rückmeldung passen auf schwächeren Wegen nicht
- **`vorrat-03`, `v-0123`, `ende1`:** „Eine begründbare erste Zahl, Ruhe danach, Nachlass möglichst gegen Gegenleistung …“. Man kommt auch dorthin über k1 Wahl 1 (die Käuferin setzt die erste Zahl) und über k2 Wahl 2 („400, weil Sie so nett sind“). **Ersatz:** „Abgeschlossen. Am meisten bleibt, wenn du die erste begründete Zahl selbst setzt und Nachlass nur gegen etwas gibst – die Rückmeldungen zeigen, wo es hakte.“
- **`vorrat-03`, `v-0168`, `ende3`:** „Ohne die Frage nach dem Interesse gibt es nur Ja oder Nein …“. Über k1 Wahl 1 und k2 Wahl 2 **wurde** nach dem Interesse gefragt. **Ersatz:** „Wer ihr Interesse nicht aufgreift, kann nur das ganze Paket anbieten – Ja oder Nein.“ Außerdem k2, Wahl 3, Rückmeldung „Fast der volle Umfang zum Bruchteil des Preises“: Es ist der **volle** Umfang für 650 von 900, also rund 72 %. **Ersatz:** „Der volle Umfang für gut zwei Drittel des Preises.“
- **`vorrat-04`, `v-0258`, `ende1`:** „… erzählt jedem, wie ehrlich du warst.“ Man erreicht es auch über „„Bist du sicher?““ und „„Dann nimm es halt, wenn du meinst.““ (beide wert 1), also ohne das Wissen auszusprechen. Zudem antwortet Sven in k2 („Hm. Stimmt eigentlich.“) auf ein Argument, das auf diesem Weg nie fiel. **Ersatz:** k1 Wahl 3 → „„Bist du sicher? Du wolltest doch eins mit Gepäckträger.““ und k2 Wahl 2 zu einem eigenen Ende: „Sven kauft es – und fährt es selten. Ein klarer Satz hätte ihm mehr geholfen.“

### S9 – `vorrat-04`, `v-0243`: sachlich falsche Antwort als „brauchbar“
- **Zitat:** „Du kannst widerrufen, aber nur, wenn der Vertreter einverstanden ist.“ (`wert: 1`)
- **Begründung:** Das ist rechtlich falsch, das Widerrufsrecht braucht keine Zustimmung. Nach der Regel aus `NACHARBEIT.md` (wie bei `v-0077`) gilt `wert: 0`. Das Prüfskript meldet danach „keine brauchbare Antwort“ – das ist gewollt.
- **Ersatz:** `wert: 0`, `warum`: „Falsch: Für den Widerruf brauchst du kein Einverständnis – eine klare Erklärung in der Frist genügt.“

### S10 – `tests.json`, `fc-032`, Antwort 4: widerspricht der eigenen Lehre
- **Zitat:** „„Für 500 nehme ich das billigere Holzöl.““ (`wert: 0`, „Weniger Qualität ohne zu fragen, ob sie das will“)
- **Begründung:** `2-03` lehrt gerade, beim Nachlass den Umfang zu ändern. Hier wird die Änderung offen angesagt, die Kundin kann also wählen.
- **Ersatz:** Den Text zur verdeckten Verschlechterung machen: „„Na gut, 500.“ – und dann heimlich das billigere Holzöl nehmen.“ (`wert: 0`, `tendenz: "verschleiern"`, `warum`: „Eine verdeckte Verschlechterung – fällt sie auf, ist das Vertrauen weg.“). Oder `wert: 1` mit `warum`: „Umfang gegen Preis ist erlaubt – sag aber, was das für den Schrank bedeutet, und lass sie wählen.“

### S11 – Aggressive Reaktionen mal `wert: 1`, mal `wert: 0`
- **Uneinheitlich:** `2-01-c` („laut einen Lügner nennen“), `v-0117` („laut beschimpfen“) und `v-0175` („der Lüge überführen“) haben `wert: 0`. Dagegen haben `fc-038`, Antwort 3 („ihn beschimpfen und die Tür zuschlagen“), `v-0113`, Antwort 3 („… bei den Nachbarn öffentlich bloßstellen“) und `v-0242`, Antwort 3 („Ihr verbieten, mit dem Mann je wieder zu sprechen“) `wert: 1`.
- **Ersatz (Text entschärfen, wert 1 bleibt):** `fc-038`: „Angst und Zeitdruck: „Kein Bedarf.“ – und die Tür schließen.“ · `v-0113`: „Gespielte Nähe: kurz „Kein Interesse“ sagen und die Tür schließen.“ · `v-0242`: „Angst und Zeitdruck: ihr raten, den Mann nicht mehr hereinzulassen.“

### S12 – Lagen der Meisterschaft wiederholen die Einheit fast wörtlich (Übertragen statt Wiedererkennen)
- **`l-12`** übernimmt die Geschichte aus `3-03-a` (Lager, Mindestbestände für zwanzig Teile) und die Englisch-Grenze aus `3-03-d` samt Abendkurs, fast Wort für Wort. Die besten Antworten erkennt man wieder, statt sie zu übertragen. **Ersatz:** In der Lage eine andere Geschichte („Du hast in deinem Betrieb die Reklamationen neu geordnet; Rückfragen von Kunden kamen danach nur noch halb so oft“) und eine andere Grenze („Tabellen kannst du gut, Auswertungen mit Makros noch nicht – dafür lernst du gerade an einem echten Beispiel“), dazu die Wahlen anpassen.
- **`l-13`** übernimmt Verein, Online-Kalender, acht Euro, Ostern und den Einwand „Das haben wir vor Jahren schon mal probiert“ samt bester Antwort („Woran ist es damals gescheitert?“) aus `3-04` (Vergleich, 3-04-c, Bühne). **Ersatz:** anderer Gegenstand, etwa ein gemeinsamer Getränkeeinkauf übers Netz statt Bar-Kasse, und ein anderer Einwand („Das macht doch wieder nur einer allein.“).

### S13 – `einheiten-3`, `3-02`, zweite Karte (Widerrufsrecht): Telefon fehlt
- **Zitat:** „Bei Verträgen an der Haustür, unterwegs außerhalb von Geschäftsräumen oder im Internet hast du in der Regel 14 Tage Widerrufsrecht.“
- **Begründung:** Fernabsatz umfasst auch Telefon, Brief und Katalog. Gerade der Vertrag am Telefon kommt im Bereich oft vor (v-0116, v-0239, v-0249). Wichtige Ausnahme vom Laden-Grundsatz: Ein Kredit oder eine Finanzierung ist auch im Laden widerrufbar (§ 495 BGB) – häufig bei Auto und Küche.
- **Ersatz:** „Bei Verträgen an der Haustür, unterwegs außerhalb von Geschäftsräumen, am Telefon oder im Internet hast du in der Regel 14 Tage Widerrufsrecht. Für den gewöhnlichen Kauf im Laden gilt es nicht – wer dort unterschreibt, ist meist gebunden. Ausnahmen gibt es, etwa eine Finanzierung. Darum gilt besonders im Laden: …“ (Länge ≤ 420 prüfen, sonst den letzten Satz kürzen.)

### S14 – `vorrat-03`, `v-0132`: „deine Familie“
- **Zitat:** „Ein Fotograf hat Probebilder von deiner Familie gemacht.“
- **Ersatz:** „Ein Fotograf hat zu Hause Probebilder von dir gemacht.“

---

## KANN

| # | Datei | Kennung | Zitat / Stelle | Begründung | Ersatz |
|---|---|---|---|---|---|
| K1 | einheiten-2 | `2-03`, Karte | „Eine Zahl wirkt klarer als eine Spanne – die lädt ein, sich das untere Ende zu nehmen.“ | Zu pauschal: Eine Spanne, deren **unteres** Ende schon die eigene Zahl ist, kann sogar besser abschneiden (Ames & Mason 2015, „bolstering range“ – aus eigener Kenntnis, nicht neu nachgeschlagen). Schlecht ist die Spanne, die unter die eigene Zahl reicht. | „Eine klare Zahl ist sicherer als eine Spanne – reicht die Spanne unter deine Zahl, nimmt sich der andere das untere Ende.“ |
| K2 | quellen | `bgb-widerruf` | „sie beginnt meist mit Vertragsschluss“ | Bei Warenkäufen beginnt sie meist erst mit dem Erhalt der Ware (§ 356 Abs. 2), und nicht vor einer ordentlichen Belehrung (§ 356 Abs. 3). | „… sie beginnt mit Vertragsschluss, soweit nichts anderes bestimmt ist – bei Waren meist erst mit Erhalt (§ 356 Abs. 2).“ |
| K3 | tests | `fc-031` | Steuererklärung für den Nachbarn vorbereiten | Rechtlich heikel: Hilfe in Steuersachen ist nur für Angehörige frei (§ 6 Nr. 2 StBerG; bei Entgelt klar unzulässig). Antwort 2 fragt sogar nach „dem Geld“. | Anlass tauschen: „Du bietest einem Nachbarn an, gegen ein kleines Entgelt seine Hecke zu schneiden. Er sagt: „Ach, das mach ich lieber selbst.““ – Antwort 2: „„Klar. Was ist dir daran wichtig – das Geld oder dass sie so wird, wie du sie willst?““ |
| K4 | tests | `fc-027`, Antwort 3 | „„Du könntest damit die Enkel sonntags sehen …““ | Die beste Antwort setzt Enkel voraus, die in der Frage nicht vorkommen. | Frage ergänzen: „… Sie erzählt oft, dass sie ihre Enkel zu selten sieht.“ |
| K5 | vorrat-04 | `v-0188`, Antwort 2 | „„Sie suchen jemanden gegen Lieferengpässe …““ | Die beste Antwort bringt eine Tatsache, die in der Frage fehlt. | Frage: „„Warum sollten wir gerade Sie nehmen?“ – Die Stelle soll Lieferengpässe verhindern.“ |
| K6 | vorrat-04 | `v-0254`, Antwort 2 | „Das große lohnt erst ab dem zweiten Standort.“ | Tatsache nicht in der Frage. | Frage ergänzen: „… Das große lohnt sich erst, wenn sie den zweiten Standort eröffnet.“ |
| K7 | vorrat-03 | `v-0180`, Antwort 1 | „ihr Problem vom letzten Monat … Notfall in zwei Stunden …“ | Tatsache nicht in der Frage. | Frage: „Nadine Köhler hatte letzten Monat einen Serverausfall und wusste nicht, wen sie anrufen soll. Du darfst … nur drei Punkte hervorheben.“ |
| K8 | tests | `fc-029` | „einen **neuen** Lieferanten“ ↔ „Seit drei Monaten liefert er bei uns“ | Widerspruch. | „Du empfiehlst Dr. Albers, einen Lieferanten, der seit drei Monaten zur Probe liefert, fest zu nehmen.“ |
| K9 | tests | `fc-033`, Antwort 3, `warum` | „Ein Nachschlag nach dem Ja …“ | Falscher Begriff (ein Nachschlag sind zusätzliche Kosten). Zudem kann ein verschwiegener, bekannter Mangel auch privat haftbar machen (§ 444 BGB). | „Nach dem Ja ist es zu spät – sie fühlt sich hereingelegt, und ein bekannter, verschwiegener Mangel kann dich sogar haftbar machen.“ |
| K10 | kurs | Phase k | `l-07` steht nach `2-03`, aber vor `2-05` | l-07 übt Grenze, Alternative und „Möglichkeiten statt Mitte“ – das ist Stoff aus 2-05. | `ueberzeugen-l-07` hinter `ue-012` setzen und `l-08` dafür vor `2-06` lassen. Oder in 2-03 den Satz zur eigenen Grenze ergänzen. |
| K11 | einheiten-2/-3 | `2-05`, `3-01` | Missionen `m-06` und `m-07` waren schon die Missionen von `1-06` und `1-07`. | Erlaubt (LIESMICH § 3a), aber wiederholend. Für 2-05 passt eine eigene Verhandlungsaufgabe besser. | 2-05: `experiment` „Vor deiner nächsten Verhandlung – Kauf, Verkauf, Vertrag –: Zahl, Grenze und Alternative auf einen Zettel und mitnehmen.“, danach `reflexion`. |
| K12 | lagen-3 | `l-13`, Lage | „Tante Renate als Kassenwartin“ | Renate ist laut Besetzung Familie. Im Sportverein ist sie überraschend und nicht falsch, wirkt aber konstruiert. | „eine Kassenwartin“ (namenlos); in `v-0226` entsprechend. |
| K13 | vorrat-04 | `v-0202`, Muster 1 | „Die Deko hat Miriam gemacht“ | Miriam ist Arbeitskollegin, nicht im Kochkurs. | „Die Deko hat eine andere aus dem Kurs gemacht …“ |
| K14 | vorrat-03 | `v-0139`, Muster 2 | „Bei Familie Petersen …“ | Herr Petersen ist der langjährige IT-Kunde. | „Bei Familie Hansen …“ |
| K15 | lagen-2 | `l-10`, Lage ↔ k3 | „eröffnet eine zweite Werkstatt“ ↔ „Letzten Monat ist das Bestellprogramm zwei Tage ausgefallen“ | Zeitlich unklar. | „Nadine Köhler hat vor drei Monaten eine zweite Werkstatt mit acht Leuten eröffnet …“ |
| K16 | lagen-3 | `l-11`, k3 | „„Montag kann ich nichts versprechen.““ | Über k2b fiel der Montag nie, das wirkt wie eine Antwort ohne Frage. | „„Heute ist der Preis sicher, Montag kann ich nichts versprechen. Ich gehe mal zu meinem Chef …““ |
| K17 | lagen-3 | `l-15`, k2 | Werkstattleiter und Buchhalterin antworten auf eine Frage, die über k1 Wahl 2 und k1b Wahl 2 nie gestellt wurde. | Kleiner Bruch im Ablauf. | k2 einleiten: „Nadine: „Sagen Sie beide kurz, was Ihnen wichtig ist.“ Werkstattleiter: …“ |
| K18 | lagen-2 | `l-09`, k1, Wahl 3, Rückmeldung | „dabei hatte sie euch diesen Termin gegeben“ | Holprig. | „… dabei hattet ihr genau diesen Anruf verabredet.“ |
| K19 | vorrat-04 | `v-0209`, Muster | „Ich fange Freitag nachmittags an, dann trifft es nur zwei Arbeitstage“ | Die Tagesrechnung lässt sich nicht nachvollziehen (drei Tage Arbeit ab Freitagnachmittag?). | „… Ich fange Freitagmittag an und arbeite Samstag durch – dann ist nur Ihr Montag betroffen. Passt das?“ |
| K20 | diverse | `3-02` (9 Schritte, 7 Min.), `3-02` wenndann, `v-0155` k2/3, `v-0193`/`v-0256`, `2-04` schaetzen, `3-04-c` ↔ `l-13`, `v-0207` | – | Kleinigkeiten: **3-02** hat 9 Schritte für 7 Minuten, also das `experiment` streichen (die `reflexion` genügt). **wenndann** „Wenn mir nur zwei Möglichkeiten angeboten werden,“ → „… bevor ich mich entschieden habe,“. **v-0155**: „Bis dahin kann ich den Termin nicht halten“ könnte auch wahr sein; besser „„Bis dahin habe ich noch drei andere Anfragen.“ – stimmt aber nicht“. **v-0193** und **v-0256** legen in Mustern/Karten Kinder, Vater bzw. Bruder fest; Vorschlag: „eine Angehörige gepflegt“, „ein Verwandter von dir“. **2-04 schaetzen**: „ihre Leser hielten sogar die Umfrage für kürzer“ stammt aus einer Nebenstudie → „In einer Nebenstudie hielten Leser der kurzen Mail sogar die Umfrage für kürzer.“ **3-04-c** siezt im Sportverein, **l-13** duzt: angleichen. **v-0207**: Muster gegen den Wunsch des Chefs → Auftrag „Schreib den Satz, den du deinem Chef fürs Angebot vorschlägst“. | wie beschrieben |

---

## Didaktik – Kurzurteil der Einheiten

| Einheit | Urteil |
|---|---|
| `2-01` | Starker Einstieg mit der deutschen Hotelstudie. Sieben Prinzipien mit „Stimmt es?“ als Trennfrage – klar und ehrlich. S2 beachten. |
| `2-02` | Gut. Die Schätzfrage gibt die uneinheitliche Forschung korrekt wieder. |
| `2-03` | Gut (Wert – Zahl – Pause, Gegenleistung). Das Fazit des Dialogs (S4) und die Spanne (K1) verbessern. |
| `2-04` | Sehr praxisnah (Betreff, Fehler finden, Bauplan). |
| `2-05` | Inhaltlich gut. Die Zuspitzung der Studie korrigieren (S1). |
| `2-06` | Sehr gut. Brunos Geschichte „Nadines Stapel“ trägt die Einheit. |
| `3-01` | Gut. Taktik nach oben wird ausdrücklich ausgeschlossen. Die Studie (Milliken 2003) ist ehrlich als kleine erkundende Studie eingeordnet. |
| `3-02` | Wichtig und stark (Impfung, Abwehrfragen, Gesetz). S2, S3, S13 und die Länge beachten. |
| `3-03` | Sehr gut, folgt der Korrektur aus `08`. Getarntes Eigenlob ist mit Sezer 2018 belegt. |
| `3-04` | Gut. Der Nachteil ist ehrlich als „im Schnitt nur ein wenig“ gekennzeichnet (offener Punkt 3 aus Phase 1 umgesetzt). |
| `3-05` | Gut. Die Stile sind als Denkmodell gekennzeichnet, Grant 2013 ist richtig wiedergegeben. |

Die besten Antworten sind über die neuen Dateien gut gemischt: Das Prüfskript meldet keine Häufung bei „längste = beste“ und keine bei „längste = falsche“. Alle Wahlen in den Lagen sind ≤ 140 Zeichen.

---

## Umsetzung (25.11.2026)

Alle Änderungen nur in `src/coach/inhalt/ueberzeugen/`; danach `node scripts/coach-index.mjs`. Prüfskript: `--nur ueberzeugen` **0 Fehler, 11 Hinweise** (dieselben elf aus Phase 1 wie vorher, keiner zu den neuen Dateien); `--soll ueberzeugen` leer. Keine Kennung geändert, nichts gelöscht.

**Zusätzlich zum Bericht:** Widerrufsrecht am 25.11.2026 auf gesetze-im-internet.de nachgelesen (§ 312c, § 312g Abs. 1–3, § 355 Abs. 1–2, § 356 Abs. 2–4, § 495 Abs. 1–2). Aggressive Reaktionen (Beschimpfen, Bloßstellen, Verbieten) haben jetzt einheitlich `wert: 0` (Text bleibt, `tendenz` gesetzt) – statt sie wie in S11 vorgeschlagen zu entschärfen. Damit die Aufgaben eine brauchbare Antwort behalten, kam je eine ruhige Antwort mit `wert: 1` dazu.

### MUSS

| Befund | Stand | Umsetzung |
|---|---|---|
| M1 `l-08` k4 | umgesetzt | „Na gut, 330.“ → `wert: 0`, `tendenz: nachgeben`, Rückmeldung aus dem Bericht. `ende4` bleibt (nur über diese Wahl erreichbar), neu: „Abgeschlossen – aber 330 mit allem lohnt sich für dich nur bei längerer Laufzeit. Nachlass nur gegen etwas.“; die Szene sagt jetzt, dass sich 330 ohne längere Laufzeit kaum trägt. |
| M2 Geschlecht | umgesetzt | `fc-028` („Ich bin neu im Einkauf.“; Antwort 3 neutral: „Mit mir wird die Zusammenarbeit so gut wie nie zuvor – Sie werden schon sehen.“), `v-0188`, `v-0189` wie vorgeschlagen. |
| M3 Elternrolle | umgesetzt | `fc-040` und `v-0267` → Förderverein, Vereinskasse, Vorstand. Die Figur heißt „ein Mann aus dem Förderverein“ (statt „ein Mitglied“), damit „seine/ihn“ in den Rückmeldungen stimmen; Sprecher „Mitglied:“. |

### SOLLTE

| Befund | Stand | Umsetzung |
|---|---|---|
| S1 Galinsky | umgesetzt | `2-05-m2`, `2-05` Studie (`grenze`), `2-05-b` (`warum`) wie vorgeschlagen; `w-033` → Beleg P mit neuem Hinweis. Die Quelle `galinsky2001` war schon richtig. |
| S2 beste Antwort behauptet | umgesetzt | `2-01-c`: „Vermutlich erfundene Sachkunde – das Gerät ohne den angeblichen Beirat prüfen: …“ (Begründung angepasst). `3-02-c`: „Vielleicht gespielt, sicher künstliche Frist: …“; die Antwort mit `wert: 1` beginnt aus demselben Grund jetzt mit „Vielleicht gespielt:“. |
| S3 Arbeitsplatte | umgesetzt | `3-02-b` mit dem Ersatz aus dem Bericht; beste Antwort jetzt „Weder noch – ob ich hier kaufe, entscheide ich erst.“ (passt zu „Dann unterschreiben Sie hier“). `l-11` k1: „Machen wir den Auftrag mit Eiche oder mit Stein fertig?“ – nicht „Unterschreiben wir mit …“, weil „Eiche, glaube ich“ (→ k1b „trage ich ein“) sonst schon eine Unterschrift wäre. |
| S4 `2-03-b` ende1 | umgesetzt | Text aus dem Bericht; stimmt auf allen drei Wegen nach `k2`. |
| S5 `l-07` k3 | umgesetzt | „Fürs Auto wollte ich höchstens 5.500 ausgeben. …“ – passt auch über k1b. |
| S6 „letztes Wort“ | umgesetzt | `l-07` k2: „5.750 – da komme ich Ihnen entgegen.“ (Rückmeldung angepasst). `v-0124` k2: **nicht** „mehr hatte ich nicht eingeplant“ (die Grenze liegt bei 1.600 – das wäre eine kleine Unwahrheit), sondern „1.500 – da komme ich Ihnen entgegen.“ |
| S7 `l-15` k5b | umgesetzt | kürzere Fassung: „Entschuldigung. Unseres: 24.000, alles drin. Legen wir beide nebeneinander?“ |
| S8 Fazits | umgesetzt | `v-0123` ende1 (leicht umformuliert, damit es auch auf dem besten Weg passt), `v-0168` ende3 und k2-Rückmeldung („gut zwei Drittel“: 650 / 900 ≈ 72 %). `v-0258`: „Bist du sicher?“ führt jetzt zum neuen Knoten `k1b` (Sven: „Wieso?“ – dort sagst du, was du weißt, oder schweigst → `ende2`); so fällt das Argument auf jedem Weg nach `k2`. „Dann nimm es halt …“ führt zum neuen `ende4` („Sven kauft es – und fährt es selten …“). Alle Wege nachgegangen. |
| S9 `v-0243` | umgesetzt | `wert: 0`, Begründung aus dem Bericht. Zusätzlich eine richtige brauchbare Antwort: „Beim Unternehmen anrufen und sagen, dass du den Vertrag widerrufst.“ (`wert: 1` – der Widerruf braucht keine Form, § 355 Abs. 1; schriftlich ist als Beleg sicherer). |
| S10 `fc-032` | umgesetzt | zweite Variante: „Für 500 nehme ich das billigere Holzöl.“ → `wert: 1` mit der Begründung aus dem Bericht (passt zur Lehre aus `2-03`). |
| S11 aggressive Reaktionen | umgesetzt (anders) | Nach Vorgabe des Hauptstrangs `wert: 0` mit `tendenz: angreifen` bzw. `bevormunden`: `fc-038` (beschimpfen), `v-0113` (bloßstellen), `v-0242` (verbieten). Je eine ruhige Antwort mit `wert: 1` ergänzt (Texte aus dem Bericht). Damit sind `2-01-c`, `v-0117`, `v-0175`, `fc-038`, `v-0113`, `v-0242` einheitlich. Scharfe, aber nicht beschimpfende Antworten mit `wert: 1` („Das ist Ihr Job, nicht mein Problem“, „Das ist undemokratisch!“, „Das ist doch ein Trick!“) bleiben – ihre Rückmeldungen nennen den Ton schon. |
| S12 `l-12` / `l-13` | umgesetzt | **`l-12`** neu: Bewerbung im Kundendienst eines Versandhändlers; Geschichte „feste Rückrufzeiten, zweite Anrufe nur noch halb so oft“ mit einer Kollegin (prüft zusätzlich: eigener Anteil statt Aneignen); Grenze: das Bestellprogramm des Händlers ist unbekannt, ein ähnliches kennst du seit fünf Jahren; die Bedarfsfrage am Ende knüpft an die Geschichte an. Den Vorschlag „Tabellen/Makros“ nicht genommen, weil `v-0208` genau diese Grenze schon als Muster hat. **`l-13`** neu: Chips statt Schlüssel für Halle und Geräteraum (600 Euro; zwei verlorene Schlüssel = 500 Euro für neue Schlösser; Geräteraum allein 200). Der Einwand ist jetzt eine Sorge („Und wenn der Chip nicht geht?“); die beste Antwort fragt nach der schlimmsten Lage und bietet dann eine konkrete Lösung; kleiner Schritt = erst der Geräteraum. Kassenwartin namenlos (K12). Alle Wege und Fazits nachgegangen, alle Wahlen ≤ 140 Zeichen, Zahlen nachgerechnet, „beste = längste“ in `lagen-3` unter der Hälfte gehalten. |
| S13 `3-02` Widerrufsrecht | umgesetzt | Am Gesetz geprüft; Karte jetzt (403 Zeichen): Haustür, sonst außerhalb von Geschäftsräumen, Telefon, Internet → in der Regel 14 Tage, ohne Begründung; gewöhnlicher Kauf im Laden nicht; Ausnahmen: Finanzierung meist auch im Laden widerrufbar (§ 495), Maßanfertigung oft gar nicht (§ 312g Abs. 2 Nr. 1). Allgemein gehalten, keine Rechtsberatung. |
| S14 `v-0132` | umgesetzt | „Ein Fotograf hat zu Hause Probebilder von dir gemacht.“ |

### KANN

| Befund | Stand | Umsetzung / Grund |
|---|---|---|
| K1 Spanne | umgesetzt | sinngemäß; Karte `2-03` an anderer Stelle gekürzt („Drückt er den Preis: erst fragen …“), damit sie ≤ 420 bleibt. |
| K2 `bgb-widerruf` | umgesetzt | Quellentext neu: § 312c, § 312g Abs. 1/2, § 355 Abs. 1/2, § 356 Abs. 2/3, § 495 Abs. 1; Link auf § 312g; „keine Rechtsberatung“. |
| K3 `fc-031` | umgesetzt | Hecke statt Steuererklärung (alle drei Antworten angepasst). |
| K4 `fc-027` | umgesetzt | Enkel in der Frage. |
| K5 `v-0188` | umgesetzt | Lieferengpässe und Mindestbestände in der Frage. |
| K6 `v-0254` | umgesetzt | „das große lohnt sich erst mit einem zweiten Standort“ in der Frage. |
| K7 `v-0180` | umgesetzt | Serverausfall in der Frage. |
| K8 `fc-029` | umgesetzt | wie vorgeschlagen. |
| K9 `fc-033` | umgesetzt | wie vorgeschlagen (130 Zeichen). |
| K10 Kursplan k | umgesetzt (anders) | Neue Reihenfolge: … 2-05 · ue-012 · **l-07** · 2-06 · ue-013 · **l-09** · a-005 · **l-08** · s-02. So steht l-07 nach 2-05, l-09 direkt nach 2-06, und keine zwei Lagen folgen direkt aufeinander. Zählung unverändert (6 E, 6 Ü, 4 L, 3 A, 1 S). |
| K11 Mission `2-05` | bewusst nicht | Die Einheit verweist auf Sprosse 6 – erlaubt (LIESMICH § 3a). Ein Tausch gegen `experiment` würde den Ablauf der Anwendungstage („mission“) berühren; Geschmack, kein Fehler. |
| K12 Tante Renate | umgesetzt | `l-13` und `v-0226` namenlos („die Kassenwartin“). |
| K13 `v-0202` | umgesetzt | „Die Deko kam von zwei anderen aus dem Kurs …“ |
| K14 `v-0139` | umgesetzt (anders) | „Bei einer Familie im Neubaugebiet …“ – namenlos statt „Hansen“, weil die „Bäckerei Hansen“ schon als Kundin vorkommt. |
| K15 `l-10` | umgesetzt | „hat vor drei Monaten eine zweite Werkstatt … eröffnet“. |
| K16 `l-11` k3 | umgesetzt | „Heute ist der Preis sicher, Montag kann ich nichts versprechen …“ |
| K17 `l-15` k2 | umgesetzt | Nadines Einleitung vorangestellt. |
| K18 `l-09` | umgesetzt | wie vorgeschlagen. |
| K19 `v-0209` | umgesetzt | wie vorgeschlagen (nachgerechnet: Freitagmittag + Samstag ≈ zwei Tage, Montag der dritte). |
| K20 | teilweise | umgesetzt: `wenndann` in 3-02 („Wenn ich zwischen zwei Möglichkeiten wählen soll, bevor ich mich entschieden habe,“), `v-0155` (erfundener Zeitdruck jetzt eindeutig: „– obwohl er noch frei wäre.“), `v-0193` („eine Angehörige gepflegt“, „mich um meine Familie gekümmert“), `v-0256` („ein Verwandter von dir“), `2-04` schätzen (Nebenstudie), `3-04-c` duzt jetzt, `v-0207` (Satz, den du dem Chef vorschlägst). **Bewusst nicht:** das `experiment` in `3-02` streichen – 9 Schritte liegen in der Regel (5–9), und der Schritt überträgt die Abwehr in den echten Kauf. |

### Nur außerhalb des Bereichs lösbar / offen für den Hauptstrang

- `tests.json`, **`fc-010`** (Phase 1, nicht Teil dieses Berichts): „Beim Elternabend fragt dich **ein anderer Vater** …“ legt Geschlecht und Elternrolle fest (LIESMICH § 5). Nicht geändert, weil Stufe-1-Inhalte nur auf ausdrücklichen Befund angefasst werden – sollte nachgezogen werden (z. B. „Auf einem Fest fragt dich jemand …“).
- Die elf Hinweise des Prüfskripts zu Phase 1 (`v-0076`, `v-0077`, `v-0103` ohne `wert: 1`; sechs lange Wahlen in `lagen-1`; „beste = längste“ in `lagen-1`/`vorrat-02`) bestehen weiter.
