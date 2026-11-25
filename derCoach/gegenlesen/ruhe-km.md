# Gegenlesen: Bereich `ruhe`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Fachlektor und Faktenprüfer · **Inhaltsdateien nicht geändert**

## Was geprüft wurde

- **Maßstab:** `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md` (Sonderregeln Abschnitt 3, Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (3a ff.), `05_LEHRPLAN.md` 3.2, `04_WISSEN_ANTRIEB.md` Abschnitt 2, `01_KONZEPT.md` Abschnitt 18, `kern/inhaltTypen.ts`, `besetzung.json`, `gegenlesen/ruhe.md`.
- **Gelesen, vollständig:** `einheiten-2.json`, `einheiten-3.json`, `lagen-2.json`, `lagen-3.json`, `vorrat-03.json` (v-0106 bis v-0182), `vorrat-04.json` (v-0183 bis v-0263), die Lerntage der Phasen k und m in `kurs.json`, `tests.json` fc-025 bis fc-040, die neuen Einträge in `wissen.json` (w-017 bis 019, w-041 bis 044, w-096, w-124), die neuen Quellen in `ruhe/quellen.json` sowie `leiter.json`. Jeden Weg durch jede Lage habe ich nachverfolgt.
- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur ruhe` ergibt **0 Fehler, 3 Hinweise**. Alle drei betreffen Stufe 1 (v-0031, fc-006, fc-012), nichts Neues. `--soll ruhe`: Für ruhe fehlt nichts.
- **Kursplan:** Die Phase k hat 6 E, 6 Ü, 4 L, 3 A und 1 S (20 Lerntage), die Phase m hat 5 E, 5 Ü, 4 L, 3 A und 1 S (18). Die Bänder sind [3,6] bis [4,7] sowie [5,8] bis [6,10]. Die Test-Stufen liegen bei 4–7 und 6–9. Die Einheiten-Titel folgen dem Lehrplan. Das stimmt alles.
- **Quellen an der Quelle nachgeschlagen (Abstract oder Volltext):**
  - **Hofmann u. a. 2009** (Volltext PMC): 202 Studierende, unvorbereitete Rede von zehn Minuten vor der Kamera. Beim Unterdrücken stieg der Puls stärker als bei den beiden anderen Gruppen. Beim Gefühl war nur Umdeuten besser als Unterdrücken; Annehmen unterschied sich nicht vom Unterdrücken. `ruhe-3-01` (Studie, Merkkarte m2) und `ruhe-w-043` geben das **korrekt** wieder.
  - **Low u. a. 2021:** g = 0,67 nach Ausschluss eines Ausreißers, geringe Streuung (I² ≈ 17 %), wirkt bei Anfängern wie Erfahrenen, Sport und andere Druck-Berufe. **Korrekt.**
  - **Toth u. a. 2020:** 37 Studien, r = 0,13. **Korrekt.**
  - **England u. a. 2012:** klinische Stichprobe, sechs Gruppensitzungen. In der Akzeptanz-Gruppe erreichten bis zur Nachuntersuchung mehr Teilnehmende die Remission, sonst gab es vergleichbare Verbesserungen. **Korrekt.**
  - **Brozovich & Heimberg 2008:** Übersichtsarbeit zum Nachgrübeln (post-event processing) bei sozialer Angststörung. **Korrekt.**
  - **Mulkens u. a. 2001:** Die Angst sank, das tatsächliche Erröten in den Verhaltenstests nicht. **Beide** Verfahren wirkten (Konzentration auf die Aufgabe und Konfrontation). Siehe S3.
  - **Bögels 2006:** Beide Verfahren wirkten stark (Konzentration auf die Aufgabe und angewandte Entspannung). Nach einem Jahr lag die Konzentration auf die Aufgabe vorn.
  - **Öst 1987:** Fundstelle bestätigt. Die Zahl „18 kontrollierte Studien“ konnte ich ohne Volltext nicht bestätigen. Sie steht nur in `quellen.json`, nicht im Lerntext.
  - **Ferrari 2019:** 27 randomisierte Studien bestätigt. Den Wert g = 1,37 für Grübeln konnte ich nicht nachprüfen (siehe K7).
- **Sicherheitsregeln:**
  - Keine Studie `brooks2016`, keine Rituale als Beleg, keine Medikamentenempfehlung, keine Rufnummern im Text.
  - Umdeuten verspricht nirgends Leistung oder weniger Angst („Gutes Umdeuten“, kein Wirkversprechen).
  - Alkohol erscheint in Lagen nur als Krücke mit Rückmeldung.
  - Schwindel-Hinweise stehen in fast allen Atemübungen (Ausnahmen in S10).
  - Hauptlücke: der Fachhilfe-Schritt (M2).

## Gesamteindruck

Die Phasen k und m sind fachlich solide und didaktisch deutlich mehr als Wiederholung:
- **Neu gegenüber Stufe 1:** angewandte Entspannung in Stufen, Proben unter Druck, Wenn-Dann-Pläne mit zweiter Stufe, Handgriff gegen Versteck, Annehmen mit Wofür, verdecktes Wegdrücken, eigene Rangliste mit ehrlicher Messung, Rückwärtsplan, Auswerten statt Grübeln.
- **Belege:** Die Beleg-Hinweise sind fast überall ehrlich. Wo Ergebnisse aus Sport oder Klinik übertragen werden, steht das dabei.
- **Antworten:** Die Rückmeldungen erklären fast immer das Warum. Die Längen der Antworten sind gemischt.
- **Sprache und Figuren:** Ton, Du-Form und Anführungszeichen „…“ passen. Die Figuren stimmen mit `besetzung.json` überein.

Die Mängel liegen vor allem hier:
- **Logik der Lagen:** Rückmeldungen setzen eine Probe oder einen Plan voraus, die es auf dem gewählten Weg nicht gab.
- **Eine Lücke in einer Einheit:** Carla nutzt in 2-04 eine Stufe, die sie nie geübt hat.
- **Fachhilfe fehlt beim Tiefenblick.**
- **Zu viel Vertrauen in eine Messung über sechs Anlässe.**
- **Mehrere Formcheck-Fragen** liegen wieder sehr nah an den Übungen.

---

## MUSS (vor Freigabe ändern)

### M1 – `einheiten-2.json`, `ruhe-2-04`, Schritt `ruhe-2-04-b` (auswahl): Carla nutzt ein Stichwort, das sie nie geübt hat

- **Zitat (Frage):** „Carla Demir hat drei Wochen lang jeden Abend die lange Fassung geübt. Morgen präsentiert sie. Was nimmt sie für die Minute vor der Tür?“
- **Zitat (beste Antwort):** „Die schnelle Fassung: langsam ausatmen, ihr Wort, Schultern sinken lassen.“ – warum: „… die Kurzfassung, die ihr Körper schon kennt.“
- **Begründung:** Die Einheit lehrt selbst, dass angewandte Entspannung in Stufen aufbaut: lang, nur loslassen, Stichwort beim Ausatmen, schnell. Die Karte sagt: „Jede Stufe braucht … Übung.“ Bei Öst 1987 entsteht das Stichwort erst durch die eigene Stufe. Carla hat laut Frage **nur** die lange Fassung geübt. Ihr Körper kennt das Wort also nicht, und die Begründung der besten Antwort stimmt innerhalb der Aufgabe nicht. Wer das Prinzip der Einheit verstanden hat, wird hier für falsch erklärt oder verunsichert.
- **Ersatz (Frage):** „Carla Demir hat drei Wochen lang geübt: erst die lange Fassung, dann nur loslassen, zuletzt mit ihrem Wort „ruhig“ beim Ausatmen. Morgen präsentiert sie. Was nimmt sie für die Minute vor der Tür?“
- Die Antworten bleiben, wie sie sind.

### M2 – `einheiten-3.json`, `ruhe-3-02` und `ruhe-3-05`: Fachhilfe fehlt beim Tiefenblick und beim Grübeln

- **Zitat 1 (`ruhe-3-02`, reflexion):** „… Wühlt dich das Thema stark auf, sprich mit einem Menschen, dem du vertraust.“
- **Zitat 2 (`ruhe-3-05`):** endet ohne Hilfe-Hinweis. Laut belegHinweis ist das Nachgrübeln „vor allem an Menschen mit starker Angst“ untersucht.
- **Begründung:**
  - `01_KONZEPT.md` §18 verlangt den Hilfe-Hinweis „an passenden Stellen (Angst, Selbstwert, **Tiefenblick**)“. `ruhe-3-02` ist *die* Tiefenblick-Einheit (alte Sorge um das Ansehen, Adler, Antreiber).
  - Der Auftrag verlangt für Panik und Angststörung den Weg über den Schritt `fachhilfe`, nicht über einen selbst formulierten Satz.
  - In den Phasen k und m gibt es keinen einzigen `fachhilfe`-Schritt. Die Hinweise stehen nur in Stufe 1 (`ruhe-1-01`, `ruhe-w-095`).
  - Das Prüfskript erlaubt `fachhilfe` auch mitten in einer Einheit. `ruhe-3-02` hat 8 Schritte, `ruhe-3-05` hat 7.
- **Ersatz:**
  - `ruhe-3-02`: vor `{ "art": "mission", "ref": "ruhe-m-09" }` den Schritt `{ "art": "fachhilfe", "thema": "seele" }` einfügen (dann 9 Schritte). In der Reflexion den letzten Satz streichen: „Welche Falle tappt bei dir am häufigsten zu – und wie lautet deine Prüffrage dafür?“
  - `ruhe-3-05`: nach der Reflexion als letzten Schritt `{ "art": "fachhilfe", "thema": "seele" }` anhängen.

### M3 – `lagen-2.json`, `ruhe-l-06`, Knoten `k5` und `ende1`: Rückmeldung lobt eine Probe, die es nicht gab

- **Weg:** `k1` („Erst den Text perfekt machen …“ oder „Abwarten …“) → `k1b` „Ihn gehen lassen und den Text zu Hause noch zweimal still lesen.“ → `k4` → `k5`.
- **Zitat (`k5`, Wahl 1, rueck):** „Die Probe mit Tarek zahlt sich aus: Für diese Frage hattest du einen Plan.“
- **Zitat (`ende1`):** „Fahrplan, Probe mit Uhr, eine Probe vor Publikum mit Zwischenfrage – und ein Plan für die Technik. … Aber keine traf dich unvorbereitet.“
- **Begründung:** Auf diesem Weg gab es weder eine Probe mit Tarek noch einen Preis-Plan noch einen Technik-Plan. Die Rückmeldung behauptet etwas, das der Nutzer gerade ausgeschlagen hat. Der Auftrag fordert ausdrücklich Lagen, die logisch sind und deren Fazit stimmt.
- **Ersatz (`k5`, Wahl 1, rueck):** „Ruhig angenommen und in deinen Ablauf eingebaut. Wer so eine Frage in der Probe schon einmal gehört hat, findet diesen Satz leichter.“
- **Ersatz (`ende1`, ende):** „Die Pannen kamen – der Beamer, die Preisfrage. Was trägt, wird früh angelegt: ein Fahrplan, Proben mit Uhr, eine Probe vor Publikum mit Zwischenfrage. Wer das hat, steht keiner Panne unvorbereitet gegenüber.“

### M4 – `lagen-3.json`, `ruhe-l-14`, Knoten `k3b`: Frau Sommer flüstert, obwohl sie nicht da ist

- **Weg:** `k1` Wahl 1 („Zusagen. Dann der Mini-Fahrplan …“) → `k2` → `k3` Wahl 2 (große Zahl) → `k3b`.
- **Zitat:** „Frau Sommer flüstert neben dir: „So viele? Letztes Jahr waren es dreihundert!““
- **Begründung:** Neben dir sitzt Frau Sommer nur auf dem Weg über `k1b` („Ich setze mich neben dich, wenn du willst.“). Auf dem Hauptweg ist sie nicht da. Das ist ein Logikfehler in der Lage.
- **Ersatz (`k3b`, sagt):** „Auf deinem Handy leuchtet eine Nachricht von Frau Sommer auf: „So viele? Letztes Jahr waren es dreihundert!““

### M5 – `einheiten-3.json`, `ruhe-3-03`, erster Schritt (schaetzen): Die als falsch gewertete Antwort ist mindestens so richtig

- **Zitat:** Frage: „… vorher 70, nach dem Telefonat 30. Was sagt dir das über das Atmen?“ Optionen: „Es hat die Anspannung um 40 Punkte gesenkt.“ · „Wenig – nach dem Gespräch sinkt die Anspannung ohnehin.“ (richtig) · „Gar nichts.“
- **Begründung:** Die Einheit lehrt selbst, dass ein Vorher-nachher-Vergleich um das ganze Gespräch die Wirkung des Werkzeugs nicht vom natürlichen Absinken trennt (Merkkarte m2, `ruhe-v-0225`). Streng genommen sagt die Zahl also *gar nichts* über das Atmen. Wer „Gar nichts“ wählt, hat das Prinzip am besten verstanden und wird als falsch gewertet. Die beste Antwort ist nicht eindeutig.
- **Ersatz (dritte Option):** „Dass Atmen bei dir nicht wirkt.“ Damit ist sie klar falsch, und „Wenig – …“ bleibt eindeutig die beste.

---

## SOLLTE (fachlich oder didaktisch klar besser)

### S1 – Sechs Anlässe als „brauchbares Muster“ und „nachweislich“ (mehrere Dateien)

- **Zitate:**
  - `wissen.json` `ruhe-w-044` belegHinweis: „… nach etwa sechs Anlässen ein brauchbares Muster.“
  - `ruhe-3-03` Karte: „Nach etwa sechs Anlässen siehst du ein Muster.“
  - `ruhe-3-03-b`: „Lena hat sechs Anlässe gemessen. … 15 … 12 … 5“
  - `ruhe-v-0228`: „Nach etwa sechs Anlässen vergleichen. – Erst dann zeigt sich ein Muster.“
  - `ruhe-v-0233` anlass: „Die nächsten sechs aufregenden Momente“
  - `ruhe-v-0234` anlass: „Nach mindestens sechs gemessenen Anlässen.“
  - `lagen-3.json` `ruhe-l-12` `k4` rueck: „Du greifst zu dem, was bei dir **nachweislich** wirkt“
- **Begründung:** Bei drei Werkzeugen im Wechsel sind sechs Anlässe **zwei Messungen je Werkzeug**. Selbsteinschätzungen von 0 bis 100 schwanken von Tag zu Tag um mehr als die 3 Punkte zwischen 15 und 12. Daraus wird kein „brauchbares Muster“, und „nachweislich“ widerspricht der eigenen Aussage „Keine Gewissheit, aber eine ehrliche Beobachtung“ (`ruhe-3-03`). Die vorläufige Haltung in `ruhe-3-03-b` ist gut. Es geht nur um die Zahl und das Wort.
- **Ersatz:**
  - `ruhe-w-044` belegHinweis: „Eine Beobachtung an dir selbst, kein Beweis – nach drei, vier Anlässen je Werkzeug zeigt sich ein erstes Muster.“
  - `ruhe-3-03` Karte, vorletzter Satz: „Nach drei, vier Anlässen je Werkzeug – also rund zehn – siehst du ein erstes Muster.“
  - `ruhe-3-03-b` Frage: „Lena hat zwölf Anlässe gemessen, jedes Werkzeug viermal. …“
  - `ruhe-v-0228`: „Nach drei, vier Anlässen je Werkzeug vergleichen.“
  - `ruhe-v-0233` anlass: „Deine nächsten aufregenden Momente – Anrufe, Besprechungen, Gespräche –, bis jedes Werkzeug drei-, viermal dran war.“; Muster „Wechsel: A – B – C – A – B – C – A – B – C.“
  - `ruhe-v-0234` anlass: „Wenn jedes Werkzeug drei-, viermal gemessen ist.“
  - `ruhe-l-12` `k4` rueck: „Du greifst zu dem, was bei dir laut deiner eigenen Messung am meisten bringt – ohne lange zu überlegen.“

### S2 – Weitere Rückmeldungen, die einen Plan oder eine Probe voraussetzen (`lagen-2.json` `ruhe-l-07`, `lagen-3.json` `ruhe-l-14`)

- **Zitate:**
  - `ruhe-l-07` `k3` Wahl 1 rueck: „Die Pause wirkt überlegt, und deine Gründe kanntest du aus der Probe.“ Auch erreichbar über `k1` Wahl 2/3, ohne Probe.
  - `ruhe-l-07` `k4` Wahl 1: „Dein Plan: „Ich schalte kurz das Bild aus …““, rueck „Der vorbereitete Plan greift …“. Erreichbar ohne Pläne.
  - `ruhe-l-14` `k4` Wahl 1: „Dein Plan für die Technik: …“. Der Mini-Fahrplan in `k1` enthält auf keinem Weg einen Technik-Plan.
- **Begründung:** Wie M3, nur weniger auffällig.
- **Ersatz:**
  - `ruhe-l-07` `k3` rueck: „Die Pause wirkt überlegt – und gibt dir Zeit, deine Gründe zu ordnen.“
  - `ruhe-l-07` `k4` Wahl 1 text: „„Ich schalte kurz das Bild aus, damit der Ton bleibt.“ – und ruhig weiter.“ rueck: „Ein ruhiger Satz, und die Technik ist kein Thema mehr. Liegt der Plan schon bereit, kommt er noch schneller.“
  - `ruhe-l-14` `k4` Wahl 1 text: „Ruhig das Wichtigste in einem Satz: „Ich verstehe Sie schlecht – kurz das Wichtigste: Samstag ab zwölf, für alle.““

### S3 – `einheiten-2.json`, `ruhe-2-05`, erster Schritt (schaetzen): Mulkens 2001 ungenau wiedergegeben

- **Zitat:** „Menschen mit starker Angst vor dem Erröten übten, den Blick auf die Aufgabe zu richten … Die Angst sank – rot wurden sie ungefähr gleich oft.“
- **Begründung:**
  - Gemessen wurde das Erröten in Verhaltenstests (Gesichtsfarbe und Temperatur), nicht, wie *oft* jemand rot wird.
  - Die Vergleichsgruppe mit Konfrontation (Übung im Aushalten) senkte die Angst ebenfalls. Nach einem Jahr gab es keinen Unterschied mehr.
  - Der Befund „Angst hängt an der Aufmerksamkeit, nicht an der Farbe“ bleibt richtig. Die Frage legt aber nahe, nur der Blick auf die Aufgabe habe geholfen.
- **Ersatz:**
  - Option 2: „Die Angst sank – rot wurden sie im Test ähnlich stark.“
  - Lösung: „Die Angst sank, die Röte blieb“ (unverändert).
  - Auflösung: „Die Angst hing weniger an der Farbe als an der Aufmerksamkeit darauf. Auch Übungen im Aushalten senkten die Angst; das Erröten selbst blieb. Bei Zittern und Schwitzen zeigte sich Ähnliches: Wer aufhört, das Zeichen zu beobachten, hat weniger Angst davor.“

### S4 – `einheiten-2.json`, `ruhe-2-04`: Wie lange jede Stufe dauert, ist zu knapp angegeben, und das Experiment überspringt die Stufen

- **Zitat (Karte):** „Jede Stufe braucht ein paar Tage Übung.“
- **Zitat (experiment):** „Übe sieben Tage lang die Kurzfassung – einmal am Abend in Ruhe und einmal vor einem Anruf …“
- **Begründung:**
  - Bei Öst üben Teilnehmende jede Stufe etwa ein bis zwei Wochen; das Programm dauert rund zwölf Sitzungen.
  - Das Experiment springt direkt zur Kurzfassung. Die Anleitung „Die Kurzfassung“ ist Anspannen und Loslassen in kurz, also unproblematisch. Der Text vermischt aber „Kurzfassung“ (kurz anspannen, mit dem Ausatmen loslassen) und „schnelle Fassung“ (nur Atemzug mit Wort).
  - Auch `ruhe-2-04-m2` sagt zur „schnellen Fassung“: „Langsam ausatmen, innerlich dein Wort …“. Das setzt die Stichwort-Stufe voraus.
- **Ersatz:**
  - Karte, letzter Satz: „Jede Stufe braucht etwa ein bis zwei Wochen Übung – darum fängst du jetzt an, nicht erst vor dem nächsten großen Termin.“
  - Experiment: „Übe sieben Tage lang jeden Abend die Kurzfassung aus Anspannen und Loslassen und sag beim Loslassen innerlich dein Wort. So bereitest du die nächste Stufe vor. Notier jedes Mal deine Anspannung vorher und nachher.“

### S5 – `vorrat-04.json`, `ruhe-v-0246`: Beste Antwort widerspricht der eigenen Regel „Am Tag nichts Neues“

- **Zitat:** Am Morgen der großen Rede fünf Minuten für einen ausgefallenen Gast übernehmen. Wert 2: „Zusagen und einen Mini-Fahrplan machen …“; wert 1: „Freundlich absagen …“ – „Legitim und klug. …“
- **Begründung:**
  - `ruhe-3-04-b` und `ruhe-v-0249` lehren: Am großen Tag kommt nichts Neues dazu (keine neuen Folien, kein neuer Witz). Ein zusätzlicher, ungeprobter Fünf-Minuten-Beitrag am selben Morgen ist genau das.
  - Die Rückmeldung zur wert-1-Antwort nennt das Absagen selbst „klug“. So ist die beste Antwort nicht eindeutig.
- **Ersatz (Frage verkleinern, damit Zusagen eindeutig vertretbar ist):** „Am Morgen deiner großen Rede bittet dich eine Kollegin, zusätzlich den nächsten Programmpunkt anzusagen – zwei, drei Sätze, weil die Moderatorin ausfällt. Du willst gern helfen. Was tust du?“
- Die Antworten bleiben. Rückmeldung zur Absage neu: „Legitim. Für zwei, drei Sätze reicht aber ein Mini-Fahrplan – dein Geprobtes bleibt unberührt.“

### S6 – `vorrat-03.json`, `ruhe-v-0152` (rangfolge): Reihenfolge widerspricht „erst der Körper“

- **Zitat:** Reihenfolge: „Die Frage kurz beantworten oder vertagen.“ → „Einmal ausatmen.“ → „„Ich war bei …“ …“ → „Etwas langsamer weiter.“
- **Begründung:** `ruhe-2-06-c` (Dialog, `k1`), `ruhe-l-08` `k3`, `ruhe-l-10` `k6` und `ruhe-v-0149` lehren: erst Pause und Ausatmen, dann antworten. In einer festen Rangfolge wird diese Reihenfolge hier als falsch gewertet.
- **Ersatz:** Reihenfolge „Kurze Pause, einmal ausatmen.“ (warum: „Erst bekommt der Körper Zeit – die Pause wirkt überlegt.“) → „Die Frage kurz beantworten oder vertagen.“ (warum: „Dann bekommt die Person ihre Antwort.“) → „„Ich war bei …“ – Blick aufs Stichwort.“ → „Etwas langsamer weiter.“

### S7 – `einheiten-2.json`, `ruhe-2-03-b` (zuordnen): Zwei Karten sind unklar oder widersprechen dem Kurs

- **Zitat 1:** „„Bei allen Pannen improvisiere ich.““ → Fach „Auslöser fehlt“. Die Handlung („improvisiere“) ist genauso unbestimmt, die Karte passt also auch zu „Handlung fehlt“.
- **Zitat 2:** „„Irgendwann atme ich dann einmal tief durch.““ Die Karte gehört richtig zu „Auslöser fehlt“, übt aber nebenbei „tief durchatmen“ ein. Das hat der Bereich als halb falsch eingeordnet („nicht tief ein – lang aus“).
- **Ersatz:**
  - Karte 5: „„Wenn es losgeht, mache ich irgendwas, damit es läuft.““ → Fach 2 („Handlung fehlt“). Alternativ eindeutig für „Auslöser fehlt“: „„Zwischendurch schaue ich auf meine Karte.““
  - Karte 2: „„Irgendwann atme ich dann einmal lang aus.““

### S8 – `tests.json`: Formcheck misst wieder Wiedererkennen statt Übertragen

Der offene Punkt 2 aus `gegenlesen/ruhe.md` wiederholt sich:

| Test | fast gleich wie | Ersatz-Idee (gleiches Lernziel, neue Lage) |
|---|---|---|
| `ruhe-fc-029` (lange Fassung im Treppenhaus / Kurzfassung / ums Haus gehen) | `ruhe-2-04-b` (Carla), `ruhe-v-0167` | „Im Wartezimmer beim Zahnarzt merkst du, wie sich deine Schultern hochziehen. Du hast die Stufen zwei Wochen geübt. Was nimmst du?“ – wert 2: „Einen Atemzug mit deinem Wort, Schultern sinken lassen.“ · wert 1: „Ein Magazin nehmen und dich ablenken.“ · wert 0: „Die Schultern bewusst festhalten, damit sie nicht zittern.“ |
| `ruhe-fc-032` (flacher Atem: tief einatmen / Pause am Satzende / Wasser) | `ruhe-v-0180`, `ruhe-v-0175` | Lage am Telefon: „Mitten im Telefonat mit der Versicherung merkst du, dass dir die Luft knapp wird.“ – wert 2: „Den Satz beenden, die Gegenseite reden lassen und dabei lang ausatmen.“ |
| `ruhe-fc-036` (Messung vor/nach Telefonat) | `ruhe-3-03` schaetzen, `ruhe-v-0225`, `ruhe-v-0231` | Übertragung auf eine andere Lage: „Eine Freundin sagt, Kamillentee vor Prüfungen helfe ihr – nach der Prüfung sei sie immer viel ruhiger. Was ist davon zu halten?“ |
| `ruhe-fc-027` („Hoffnung ist kein Plan“, „improvisiere irgendwie“) | `ruhe-2-03-a`, `ruhe-v-0145`, `ruhe-v-0153` | Begründungen wortgleich. Neue Panne statt Hänger, z. B. „Die Schulleitung kommt zu spät, und du musst anfangen.“ |

### S9 – `vorrat-04.json`, `ruhe-v-0203` (zuordnen „Welcher Tiefenblick passt?“): Zwei Karten sind unklar

- **Zitat:** „„Wenn ich nicht glänze, bin ich nichts wert.““ → Fach „die Sorge, gewogen zu werden“. Passt ebenso zum Antreiber „Sei perfekt!“.
- **Zitat:** „„Gleich merken alle, dass ich hier nicht hingehöre.““ → Fach „Sorge, gewogen zu werden“. „merken alle“ passt ebenso zum Scheinwerfer.
- **Ersatz:**
  - Karte 1: „„Die anderen können das alle besser als ich.““ (Minderwertigkeitsgefühl nach Adler, eindeutig „Sorge, gewogen zu werden“).
  - Karte 4: „„Wenn die mich heute schwach finden, bin ich in der Gruppe unten durch.““

### S10 – Atemübungen ohne „Nicht am Steuer“ (`vorrat-03.json` `ruhe-v-0170`, `ruhe-v-0181`, `ruhe-v-0182`; `vorrat-04.json` Muster von `ruhe-v-0242`)

- **Zitat (`ruhe-v-0170`):** „Fünf Runden. Wird dir schwummrig: aufhören und normal weiteratmen.“
- **Begründung:** Sonderregel `ruhe` (06, Abschnitt 3): „Atemübungen tragen den Hinweis: Bei Schwindel aufhören und normal atmen; nicht am Steuer.“ Der Schwindel-Teil ist vorhanden, der Steuer-Teil fehlt. `ruhe-2-04` (atem) und das Werkzeug `seufzer` haben ihn. `ruhe-v-0241` zeigt sogar, dass „am Steuer“ ein Thema ist.
- **Ersatz:** jeweils „Wird dir schwummrig: aufhören und normal weiteratmen. Nicht am Steuer.“ In `ruhe-v-0181` und `ruhe-v-0182` den Satz um „Nicht am Steuer.“ ergänzen.

### S11 – `vorrat-03.json`, `ruhe-v-0165` (zuordnen „Gestützt oder nicht eigens untersucht?“): Eine Karte steht im falschen Fach

- **Zitat:** „Anspannen und Loslassen wirkt bei allen Menschen gleich gut.“ → Fach „nicht eigens untersucht“.
- **Begründung:** Die Aussage ist nicht „nicht untersucht“, sondern durch die Streuung in allen Studien eher widerlegt. Der Kurs lehrt selbst: „Studien zeigen Mittelwerte“ (`ruhe-fc-037`, `ruhe-v-0236`). So entsteht ein schiefes Bild davon, was „nicht untersucht“ heißt.
- **Ersatz:** „Wer die schnelle Fassung geübt hat, tritt danach besser auf.“ → Fach 1 („nicht eigens untersucht“).

---

## KANN (Feinschliff)

- **K1 – Fazit-Texte gelten nicht für jeden Weg** (`ruhe-l-07`, `-09`, `-11`, `-12`, `-15`, jeweils `ende1`). Sie beschreiben den Idealweg als „du hast …“, z. B. `ruhe-l-15`: „… Rangliste statt Sekt …“, obwohl man über `k4b` (Sekt) dorthin gelangt. Stufe 1 macht es genauso, das ist also üblich. Wo es leicht geht, besser neutral formulieren, z. B. `ruhe-l-15`: „Von der Zusage bis zum Zettel in der Nacht: Falle erkennen, rückwärts planen, in Stufen proben, den Antreiber durchschauen, die Rangliste statt eines Glases, Welle und Panne nehmen, auswerten ohne Grübeln. Das ist Meisterschaft – nicht ohne Aufregung, sondern mit ihr.“
- **K2 – `ruhe-2-01`, Schätzfrage als Tatsache:** „Wann entscheidet sich meist, wie gut die erste Minute … läuft? – Schon in den Tagen davor“ ist als Befund gerahmt und hat keinen Beleg. Ersatz: „Wann wird meist festgelegt, was dir in der ersten Minute zur Verfügung steht?“ (Auflösung bleibt).
- **K3 – `ruhe-2-01-c` (rangfolge „letzte Stunde“):** Die Schritte 2 und 3 („Technik ausprobieren“, „mit zwei Anwesenden plaudern“) lassen sich sinnvoll tauschen. Entweder „Mit zwei Anwesenden …“ streichen oder in `warum` klarstellen, dass Technik vor den Gesprächen kommt, „solange der Raum noch leer ist“.
- **K4 – `ruhe-2-06`, zu nah an Stufe 1:** Aha und Merkkarte wiederholen fast wörtlich den Spickzettel `ruhe-w-121` („Erst der Körper, dann der Kopf.“). Neu ist das Bild der „Welle mit Auslöser“. Das könnte das Aha stärker tragen, etwa: „Wellen mittendrin haben Auslöser – wer seine kennt, wird von keiner überrascht. …“
- **K5 – `ruhe-w-096`, belegHinweis:** „Die Fallen stammen aus der kognitiven Therapie“ stimmt nur für Katastrophe, Gedankenlesen und Perfektion. Scheinwerfer (Gilovich) und Kampf gegen das Gefühl (Hofmann, ACT) kommen aus anderen Richtungen. Ersatz: „Katastrophe, Gedankenlesen und Perfektion stammen aus der kognitiven Therapie, der Scheinwerfer aus der Sozialpsychologie, der Kampf gegen das Gefühl aus der Forschung zum Annehmen. …“
- **K6 – `ruhe-3-04`, belegHinweis:** „Wenn-Dann-Pläne und der Dreischritt Wunsch – Hindernis – Plan gut“. Für WOOP ist der Effekt klein (wang2021: g = 0,34, nach Korrektur der Veröffentlichungsverzerrung ≈ 0,24). Ersatz: „Wenn-Dann-Pläne gut, der Dreischritt Wunsch – Hindernis – Plan mit kleinem, aber belegtem Effekt, …“
- **K7 – `ruhe-3-05`, Studie, grenze:** „Übungen in Selbstmitgefühl senken in randomisierten Studien zudem das Grübeln deutlich.“ Der Wert für Grübeln aus ferrari2019 (g = 1,37) ließ sich nicht nachprüfen und beruht wohl auf wenigen Studien. Ersatz: „… senken in einigen randomisierten Studien zudem das Grübeln.“ Die Angabe in `quellen.json` (`ferrari2019`) einmal am Volltext prüfen.
- **K8 – Reihenfolge der Missionen:** Im Kurs kommt zuerst Sprosse 8 (`ruhe-2-01`), dann 7 (`ruhe-2-06`), dann 6 (`ruhe-3-01`), dann 9 und 10. Die Leiter läuft also kurz rückwärts. Außerdem passt `ruhe-m-06` („Als Erster etwas sagen … den Gipfel schnell hinter sich“) nur lose zu „Annehmen statt wegdrücken“. Vorschlag: `ruhe-2-01` → `ruhe-m-06`, `ruhe-3-01` → `ruhe-m-08`. Oder es bleibt so, mit Begründung in `08`.
- **K9 – Alkohol-Szenen leicht überzeichnet** (`ruhe-l-09` `k2b`, `ruhe-l-15` `k4b`): „Der Wein steigt dir sofort in den Kopf. Die Stichworte verschwimmen.“ Nach einem Glas ist das unglaubwürdig und schwächt die ehrliche Botschaft. Dazu die Rückmeldung „Das Glas zur Beruhigung hebst du dir … für danach auf“. Ersatz `k2b`: „Dir wird warm, und du merkst, dass du schneller sprichst als geprobt.“ Rückmeldung: „Gut gefangen. Beim nächsten Mal trägt die Startroutine – ohne Glas.“
- **K10 – `ruhe-l-12` `k2b`:** „Wach liegen darf sein. Ruhen hilft auch.“ „Ruhen hilft auch“ ist ein Volkssatz ohne Beleg. Er ist harmlos; ehrlicher wäre: „Wach liegen darf sein. Eine kurze Nacht übersteht man.“
- **K11 – `ruhe-l-10` `k4`, Wahl 2:** Die Tendenz `katastrophe` passt schlecht zu „Sie schreibt bestimmt auf, was alles falsch ist.“, das ist eher Gedankenlesen. Wenn es keine eigene Tendenz gibt, `nach_innen` verwenden.
- **K12 – `ruhe-fc-039` (Stromausfall):** Die beste Antwort spricht im Halbdunkel einfach weiter. Ein Halbsatz zur Sicherheit wäre klug: „… „Solange das Licht nicht wiederkommt, bleiben alle sitzen – ich mache ohne Mikrofon weiter.““
- **K13 – `ruhe-v-0176` (Schwindel):** Gute Sicherheitsantwort. Für wiederholten Schwindel könnte der Satz „Kommt das öfter vor, sprich mit deiner Hausarztpraxis.“ in die Begründung.
- **K14 – Sonderregel „nach jedem Werkzeug Anspannung vorher/nachher“:** Die Anleitungen „Die Kurzfassung“ (`ruhe-2-04`) und „Platz machen“ (`ruhe-3-01`) haben keine Messung, der Typ `anleitung` kennt kein `messen`. In Stufe 1 ist das genauso. Als Wunsch an die Technik notieren: `messen` auch für `anleitung`.
- **K15 – `ruhe-l-06`, einleitung:** Die Einleitung kündigt „Pläne für die wahrscheinlichsten Pannen“ an, bevor `ruhe-2-03` sie lehrt. Stufe 1 hat Wenn-Dann schon eingeführt, also nur eine Kleinigkeit. Ersatz: „… den Fahrplan, Proben wie im Ernstfall und einen ersten Plan für eine Panne.“
- **K16 – Quellen:**
  - `hofmann2009` steht nicht in `ruhe/quellen.json`, sondern in der gemeinsamen `quellen.json`. Laut LIESMICH ist das richtig, keine Änderung nötig.
  - `oest1987`: Die Angabe „in 18 kontrollierten Studien“ am Volltext bestätigen.
  - `england2012`: Ergänzen, dass es eine **klinische** Stichprobe war (Menschen mit Redeangst im Sinne der Diagnose).

## Zusammenfassung

| Schwere | Anzahl | Kennungen |
|---|---|---|
| muss | 5 | M1 `ruhe-2-04-b` · M2 `ruhe-3-02`/`ruhe-3-05` (fachhilfe) · M3 `ruhe-l-06` k5/ende1 · M4 `ruhe-l-14` k3b · M5 `ruhe-3-03` schaetzen |
| sollte | 11 | S1 „sechs Anlässe“/„nachweislich“ · S2 `ruhe-l-07`/`ruhe-l-14` Plan-Rückmeldungen · S3 `ruhe-2-05` Mulkens · S4 `ruhe-2-04` Stufen-Dauer · S5 `ruhe-v-0246` · S6 `ruhe-v-0152` · S7 `ruhe-2-03-b` · S8 Formcheck-Doppel · S9 `ruhe-v-0203` · S10 „Nicht am Steuer“ · S11 `ruhe-v-0165` |
| kann | 16 | K1–K16 |

**Urteil:** Nach M1 bis M5 freigabereif für Davide. Fachlich trägt die Phase. Die neuen Quellen sind, soweit nachgeschlagen, korrekt wiedergegeben, und die Regeln aus `08` sind eingehalten. Die Punkte unter „sollte“ verbessern vor allem Ehrlichkeit (S1, S3) und Eindeutigkeit (S5 bis S9) und sollten vor einer Freigabe für alle erledigt sein.

---

## Umsetzung (25.11.2026)

Alle Änderungen nur in `src/coach/inhalt/ruhe/`; Kennungen unverändert, nichts gelöscht. Danach `node scripts/coach-index.mjs`; `node scripts/coach-pruefe.mjs --nur ruhe`: **0 Fehler**, 3 Hinweise (alle Stufe 1, wie vorher); `--soll ruhe`: nichts offen. Jede Lage in `lagen-2/3` nach der Änderung Weg für Weg erneut durchgegangen – auch die, die der Bericht nicht nannte.

### MUSS

| Befund | Stand |
|---|---|
| M1 `ruhe-2-04-b` | umgesetzt – Carla übt jetzt **sechs** Wochen alle drei Stufen bis zum Wort (drei Wochen passten nicht zur neuen Angabe „ein bis zwei Wochen je Stufe“ aus S4). Die Begründung der besten Antwort sagt nicht mehr „Kurzfassung“ (das ist in der Einheit das Anspannen-Loslassen), sondern „ein Atemzug mit dem Wort“; „drei Wochen“ in der falschen Antwort angepasst |
| M2 `ruhe-3-02`, `ruhe-3-05` | umgesetzt wie vorgeschlagen: `fachhilfe` `seele` vor der Mission bzw. als letzter Schritt; der selbst formulierte Hilfesatz in der Reflexion gestrichen |
| M3 `ruhe-l-06` k5/ende1 | umgesetzt (Ersatz übernommen; „keiner Panne unvorbereitet“ zu „den Pannen nicht unvorbereitet“ abgeschwächt). Zusätzlich k5 Wahl 2 und 3: „du hattest die Antwort parat“ / „Dein Plan war kürzer“ galten auf dem Weg ohne Probe nicht – jetzt auf den Preisteil im Vortrag bezogen |
| M4 `ruhe-l-14` k3b | umgesetzt, aber **anders als vorgeschlagen**: Eine Handy-Nachricht passt nicht, während du live telefonierst, und auf dem Weg über `k1b` sitzt Frau Sommer neben dir. Jetzt fragt die Moderatorin nach („So viele? Das wäre ja ein Rekord!“), und dir fällt die richtige Zahl ein – stimmt auf allen Wegen |
| M5 `ruhe-3-03` schaetzen | umgesetzt („Dass Atmen bei dir nicht wirkt.“) |

### SOLLTE

| Befund | Stand |
|---|---|
| S1 sechs Anlässe / „nachweislich“ | umgesetzt an allen genannten Stellen; Karte `ruhe-3-03` gekürzt („Nach drei, vier Anlässen je Werkzeug zeigt sich ein erstes Muster“, sonst > 420 Zeichen). Zusätzlich gleichgezogen: Experiment `ruhe-3-03` (statt „drei Wochen“ „bis jedes drei-, viermal dran war“), Begründungen in `ruhe-3-03-b`, `ruhe-v-0231` („über viele Anlässe“), `ruhe-v-0242` (Anlass und Wechsel A/B viermal) |
| S2 Plan-Rückmeldungen `ruhe-l-07`, `ruhe-l-14` | umgesetzt wie vorgeschlagen. Ebenso nachgezogen: `ruhe-l-07` k3 Wahl 3 und k5 Wahl 1 („welcher Plan gegriffen hat“ → „was gegriffen hat und welcher Plan noch fehlt“); `ruhe-l-10` k3 Wahl 1 („Dein Technik-Plan … Der Plan stand schon“ war auf den Wegen ohne Pläne falsch) |
| S3 `ruhe-2-05` Mulkens | umgesetzt wie vorgeschlagen |
| S4 `ruhe-2-04` Stufen-Dauer | umgesetzt; Dauer an der Quelle geprüft (Öst: Training meist 10–12 Sitzungen, sechs Bausteine) und in `quellen.json` `oest1987` vermerkt. Karte gekürzt (Zeichengrenze), Merkkarte m2 ergänzt: „Wenn die Stufen davor sitzen: …“ |
| S5 `ruhe-v-0246` | umgesetzt; zusätzlich die beste Antwort an die kleine Aufgabe angepasst (statt Kernsatz/drei Stichworte: „die zwei, drei Sätze kurz notieren und einmal halblaut sagen“) und die Begründung zur „Hoffen“-Antwort |
| S6 `ruhe-v-0152` | umgesetzt (erst Pause/Ausatmen, dann antworten) |
| S7 `ruhe-2-03-b` | umgesetzt: Karte 2 „lang aus“, Karte 5 als eindeutige „Auslöser fehlt“-Variante („Zwischendurch schaue ich auf meine Karte.“) – so bleiben die drei Fächer mit je zwei Karten besetzt |
| S8 Formcheck | umgesetzt: `ruhe-fc-027` (verspätete Schulleitung), `-029` (Wartezimmer, schnelle Fassung), `-032` (Telefonat mit der Versicherung), `-036` (Kamillentee) neu, gleiche Fähigkeit und Stufe. Bei `-029` „zwei Wochen“ ersetzt durch „über Wochen, bis zu deinem Wort“ (passt zu S4) |
| S9 `ruhe-v-0203` | umgesetzt wie vorgeschlagen |
| S10 „Nicht am Steuer“ | umgesetzt in `ruhe-v-0170`, `-0181`, `-0182` (dort auch „aufhören und“ ergänzt) und im Muster von `-0242`. Sonst keine Atemübung der Phasen k/m ohne den Hinweis gefunden |
| S11 `ruhe-v-0165` | umgesetzt wie vorgeschlagen |

### KANN

| Befund | Stand |
|---|---|
| K1 Fazit-Texte | umgesetzt für `ruhe-l-07`, `-09`, `-11`, `-12`, `-15` und zusätzlich `ruhe-l-08` (ende1 „Statt zu verstecken, hast du …“ falsch nach „Hände unter den Tisch“), `ruhe-l-10` (ende1), `ruhe-l-13` (ende1 samt „mit deinem Hänger-Plan auf der Karte“), `ruhe-l-14` (ende1: „ehrlich korrigiert“ nur auf einem Weg; „Frau Sommer umarmt dich“ → „ist begeistert“). `ruhe-l-15`: „bis zum Zettel in der Nacht“ → „bis zur Nacht danach“ (Weg über k7 Wahl 3 ohne Zettel); k3 „Die Probe vor deiner kleinen Runde“ → „Eine Probe vor einer kleinen Runde“ |
| K2 `ruhe-2-01` Schätzfrage | umgesetzt |
| K3 `ruhe-2-01-c` | umgesetzt über `warum` („solange der Raum noch leer ist“ / „Läuft die Technik, ist der Kopf frei für Menschen“) |
| K4 `ruhe-2-06` | umgesetzt: Aha trägt jetzt die Auslöser; neue Merkkarte `ruhe-2-06-m3` zu den Auslösern. „wird von keiner überrascht“ bewusst nicht übernommen (Versprechen) → „erkennt sie früher“ |
| K5 `ruhe-w-096` | umgesetzt; gleicher Fehler auch im belegHinweis von `ruhe-3-02` korrigiert |
| K6 `ruhe-3-04` | umgesetzt (ohne Zahl im Text) |
| K7 `ruhe-3-05` | umgesetzt („in einigen randomisierten Studien … das Grübeln“). g = 1,37 steht im Abstract von Ferrari 2019; wie viele der 27 Studien Grübeln gemessen haben, ließ sich nicht klären – siehe offene Punkte |
| K8 Reihenfolge der Missionen | **bewusst nicht** umgesetzt: `ruhe-m-08` („Zwei Minuten mit Fahrplan“) passt inhaltlich genau zu `ruhe-2-01`, `ruhe-m-06` („Als Erster etwas sagen“) gar nicht – der Tausch würde die Passung für eine schönere Leiter-Reihenfolge opfern; Fortschritt zählt ohnehin nach Menge. Die lose Passung von `ruhe-m-06` zu `ruhe-3-01` bleibt; sie ließe sich nur in `leiter.json` (Stufe 1) beheben → offener Punkt |
| K9 Alkohol-Szenen | umgesetzt in `ruhe-l-09` k2b und `ruhe-l-15` k4b (nüchterner geschildert, Rückmeldung „ohne Glas“); Wasser „ein Schluck“ statt „ein großes Glas“ mitten in der Rede |
| K10 `ruhe-l-12` k2b | umgesetzt |
| K11 `ruhe-l-10` k4 | umgesetzt mit Tendenz `gedankenlesen` (gibt es schon in `lesen`, `gespraech`, `flirten`) statt `nach_innen` |
| K12 `ruhe-fc-039` | umgesetzt („Bleiben Sie bitte sitzen, bis das Licht wieder da ist – …“) |
| K13 `ruhe-v-0176` | umgesetzt (Hausarztpraxis bei wiederholtem Schwindel) |
| K14 `messen` für `anleitung` | nur außerhalb lösbar (Typ in `kern/inhaltTypen.ts`) → offener Punkt |
| K15 `ruhe-l-06` Einleitung | umgesetzt (`ruhe-l-06` liegt im Kurs vor `ruhe-2-03`) |
| K16 Quellen | `oest1987`: „18 kontrollierte Studien“ im Abstract bestätigt, Stufen-Dauer ergänzt. `england2012`: klinische Stichprobe ergänzt (bestätigt). `hofmann2009`: keine Änderung nötig |

### Offen für den Hauptstrang (außerhalb von `ruhe/`)

- `selbst/quellen.json` `ferrari2019`: g = 1,37 für Grübeln steht so im Abstract; die Zahl der Studien dahinter ist unbekannt (vermutlich wenige). Beim Bereich `selbst` vermerken, falls die Zahl dort im Text genutzt wird.
- `kern/inhaltTypen.ts`: Wunsch `messen` auch für `anleitung` (K14; betrifft Stufe 1 ebenso).
- `ruhe/leiter.json` (Stufe 1): `ruhe-m-06` passt nur lose zu „Annehmen statt wegdrücken“ (`ruhe-3-01`); entweder Missionstext erweitern (z. B. „… und die Aufregung dabei benennen“) oder die Abweichung in `08_ENTSCHEIDUNGEN.md` begründen.
