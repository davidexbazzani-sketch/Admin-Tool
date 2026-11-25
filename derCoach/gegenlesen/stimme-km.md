# Gegenlesen: `stimme` – Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Blick:** unabhängiges Lektorat (Sprecherziehung/Stimmpflege, Präsentationscoaching), Faktenprüfung, Didaktik, Sprache
**Geprüft:** `src/coach/inhalt/stimme/` – `einheiten-2.json` (2-01…2-06), `einheiten-3.json` (3-01…3-05), `lagen-2.json` (l-06…l-10),
`lagen-3.json` (l-11…l-15), `vorrat-03.json` (v-0124…v-0209), `vorrat-04.json` (v-0210…v-0289), `kurs.json` (Lerntage `"phase": "k"`/`"m"`),
`tests.json` (fc-025…fc-040, sb-6…8, vh-4), `wissen.json` (w-016…019, w-049…051, w-055, w-088, w-095, w-124, w-125), `quellen.json` (shu2014, dechene2010).
Die Änderungen in `vorrat-01.json` (`"ton"` bei v-0008, Hauptstrang) und `vorrat-02.json` (v-0103, 4. Antwort – Umsetzung von Punkt 7 aus `stimme.md`) sind kein Befund.
**Maßstab:** `08_ENTSCHEIDUNGEN.md`, `06_INHALT_REGELN_MUSTER.md` (Abschnitt 3 und 16), `src/coach/inhalt/LIESMICH.md` (3a ff.), `05_LEHRPLAN.md` 3.6,
`07_QUELLEN.md`, `01_KONZEPT.md`, `kern/inhaltTypen.ts`, `besetzung.json`, Vorgehen wie `gegenlesen/stimme.md`.
**Es wurde keine Inhaltsdatei geändert.**

## 1. Was geprüft wurde – und was in Ordnung ist

- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur stimme` → **0 Fehler, 0 Hinweise** (gesamt 15 Fehler in anderen Bereichen).
  `--soll stimme` meldet für ue-008…ue-018 **keine Lücke**.
- **Kursplan:** k = 20 Lerntage (6 E · 6 Ü · 4 L · 3 A · 1 S `stimme-s-02`), m = 18 (5 · 5 · 4 · 3 · 1 S `stimme-s-03`). Bänder k `[3,6]`→`[4,7]`,
  m `[5,8]`→`[6,10]` – wie LIESMICH 3a. Einheiten folgen dem Lehrplan 3.6 Stufe 2/3 Titel für Titel; Abweichung aus `08` (auftritt/bild erst in k/m) ist umgesetzt.
- **Laut/leise:** Alle 36 lauten Vorrats-Übungen und alle 8 lauten Einheiten-Übungen verweisen auf eine echte `stumm`-Übung **derselben Fähigkeit**
  (Skript). Bei vier Paaren ist das Lernziel vertauscht (S14).
- **Tests:** 16 Szenarien, k: Stufen 4–7, m: 6–9; Selbstbild sb-6…8 und Verhalten vh-4 passend zu den neuen Fähigkeiten.
- **Stimmgesundheit vorbildlich:** nie drücken, nie gegen Lärm anschreien, Mikrofon nutzen, schlucken statt räuspern, Flüstern schont nicht
  (fc-034), Rührung mit Pause statt Pressen (l-11, l-15), „bewusst tiefer sprechen“ als Fehler (v-0251, v-0281, v-0289), Atemübung v-0136 mit Schwindel-Hinweis.
- **Einfluss-Klassen:** Wiederholung des Kernsatzes (w-050, v-0257, v-0259) korrekt als `taktik` mit `preis`, `abwehr` und der Bedingung „nur für
  Wahres“; keine rote Linie als Übung, Musterlösung oder Mission. Keine Fachhilfe außer als Schritt, keine Rufnummern, keine Marken.
- **Figuren** konsistent mit `besetzung.json` (Dr. Albers sachlich-knapp; Herr Petersen hört schlecht – „Lauter, bitte!“, Frage zurückgeben;
  Jonas antwortet „ruhig, mit kleinen Pausen“ und bekommt Raum, ohne dass für ihn gesprochen wird; Miriam neckt; Sven stichelt; Frau Köhler jetzt Kundin).
- **Quellen nachgeschlagen:** `shu2014` und die Einschränkung Wang u. a. 2022 (JCP 32(3), 484–491: Vorteil der Drei nur ohne Vorstellungsbilder, mit Bildern
  wirken mehr Aussagen besser) – **stimmt**; `dechene2010` (51 Studien, mittlere Effekte; Kritik der späteren systematischen Übersicht: Daten nicht
  verfügbar, Publikationsverzerrung nicht geprüft) – **stimmt**; `graeber2024` (73 % / rund ein Drittel Abnahme binnen eines Tages) – stimmt, zwei
  Nebensätze sind weiter gefasst als die Studie (S16). Aus eigener Kenntnis bestätigt: Savitsky & Gilovich 2003, Tenney u. a. 2007, Brennan & Williams 1995,
  Murdock 1962, Chen u. a. 2013, Antonakis u. a. 2011, Hostetter 2011, Bourhis & Allen 1998.
- **Rechnungen nachgerechnet** (richtig): v-0160 (2.400/Jahr ≈ 10/Tag), v-0162 (180.000 Blatt ≈ 750/Tag ≈ 7,5 cm), v-0164, v-0170 (1.200/Monat ≈ 60/Tag),
  l-09 (32 → 9 Stunden ≈ ein Tag), fc-025, 2-02-c (2.400 Stunden > ein Arbeitsjahr).
- **Sprache:** Du-Form, „Sie“ nur in wörtlicher Rede (Skript), „…“, keine doppelten Leerzeichen, keine ASCII-Anführungszeichen.

## 2. Befunde

Zählung: **muss 8 · sollte 16 · kann 14**.

### muss

**M1 – Rechenfehler in der Einheit „Zahl mit Bild“** (`einheiten-2.json`, `stimme-2-02-a`, 1. Karte)
- Zitat: „„1.200 Anrufe im Monat – das ist jede Minute einer, den ganzen Vormittag.““
- Begründung: 1.200 im Monat sind rund 60 je Arbeitstag – eine Stunde lang einer pro Minute, nicht ein ganzer Vormittag (das wären ≈ 4.800/Monat).
  Ausgerechnet die Einheit, die ehrliche Bilder zu Zahlen lehrt, liefert ein viermal zu großes Bild. `v-0170` rechnet dieselbe Zahl richtig.
- Ersatz: „„1.200 Anrufe im Monat – an jedem Arbeitstag rund sechzig, eine Stunde lang jede Minute einer.““

**M2 – Falsches Bild in einer Musterlösung** (`einheiten-2.json`, `stimme-2-02-b`, `muster[1]`)
- Zitat: „„18.000 Blatt – übereinandergelegt fast so hoch wie unser Bürogebäude.““
- Begründung: Ein Blatt ist etwa 0,1 mm dick; 18.000 Blatt sind ≈ 1,8 m (36 Pakete à 500). Musterlösungen werden nachgeahmt.
- Ersatz: „„18.000 Blatt – übereinandergestapelt fast so hoch wie eine Tür. Jedes Jahr.““

**M3 – Dialog „Die Frage im Aufzug“: Ende passt nicht zum schwachen Weg** (`einheiten-2.json`, `stimme-2-01-d`, Knoten `k2` → `ende1`)
- Zitat: `k2` Wahl 2 (wert 0) „„Nein, nein, alles gut, wir kommen klar.““ → `ende1`: „Dr. Albers: „Gut. Schicken Sie mir die Frage, ich antworte bis Freitag.““
- Begründung: Auf diesem Weg wurde keine Frage gestellt; Albers antwortet auf etwas, das nicht passiert ist.
- Ersatz `ende1.sagt`: „Die Tür geht auf. Dr. Albers: „Gut. Wenn Sie etwas von mir brauchen – eine Mail genügt.““
  `ende1.ende`: „Dreißig Sekunden reichen, wenn die Antwort zuerst kommt: Ergebnis, ein Grund – und wenn du etwas brauchst, die Bitte mit Termin.“

**M4 – Lage „Die Frage in der Leitungsrunde“: Zusage auf eine nicht gestellte Bitte** (`lagen-2.json`, `stimme-l-06`, `k4` → `ende1`)
- Zitat: `k4` Wahl 2 (wert 0) „„Nein danke, wir kriegen das schon irgendwie hin …““ → `ende1`: „Dr. Albers: „Bekommen Sie. Danke – kurz und klar.““
- Begründung: „Bekommen Sie“ ohne Bitte ist unlogisch; „kurz und klar“ lobt auch die Wege über `k1b` Wahl 2 („so einfach ist das nicht zu sagen …“).
- Ersatz: Wahl 2 von `k4` nach neuem Knoten `ende2` leiten: `{ "id": "ende2", "sagt": "Dr. Albers nickt: „Gut. Dann weiter im Text.“ Nach der Runde fragt Jonas, warum du nicht um Hilfe gebeten hast.", "ende": "Antwort zuerst und die Zahl mit Bild hast du gebraucht – die Bitte nicht. Wer in der Runde nicht sagt, was er braucht, bekommt es selten." }`;
  `ende1.sagt` für die übrigen Wege: „Dr. Albers: „Bekommen Sie. Danke.““

**M5 – Lage „Das Update in der großen Videorunde“: Rückfrage auf Ungesagtes** (`lagen-2.json`, `stimme-l-09`, `k2.sagt`)
- Zitat: „Ein Kollege schaltet sein Mikrofon ein: „Ein Tag – im Schnitt? Wie viel ist das in Stunden?““
- Begründung: Auf den Wegen `k1` Wahl 3 („… was wir im letzten Quartal gemacht haben“) und `k1b` Wahl 2 („fange ich mal an mit dem Hintergrund“) fiel „ein Tag“ nie.
- Ersatz `k2.sagt`: „Inzwischen hast du das Ergebnis genannt: im Schnitt einen Tag schneller. Ein Kollege schaltet sein Mikrofon ein: „Im Schnitt? Wie viel ist das in Stunden?“ Jonas kennt die Zahlen genau.“

**M6 – Knoten setzen eine Wahl voraus, die nicht getroffen wurde** (`lagen-2.json` `stimme-l-07` `k3`; `lagen-3.json` `stimme-l-11` `k3`)
- Zitat l-07: `k3.sagt` „Viele Hände, Gelächter. …“ – auch nach `k2` Wahl 2 „„Herzlich willkommen zum Straßenfest.““ und Wahl 3, bei denen niemand die Hand heben sollte.
- Zitat l-11: `k3.sagt` „Die ersten lächeln. Jetzt kommt die Wendung.“ – auch nach `k2` Wahl 2 (Eigenschaften aufgezählt) und Wahl 3 („Ich möchte euch eine
  kleine Geschichte erzählen“), bei denen die Geschichte nie begonnen hat.
- Ersatz l-07 `k3.sagt`: „Die Leute sind bei dir. Jetzt willst du sagen, warum es das Fest gibt.“
- Ersatz l-11 `k3.sagt`: „Du erzählst vom Feldweg und vom roten Rad. Die ersten lächeln. Jetzt kommt die Wendung.“

**M7 – Dialog „Die Frage mit Spitze“: beste Schlusswahl zitiert eine nicht gegebene Zusage** (`einheiten-3.json`, `stimme-3-03-c`, `k3`)
- Zitat: Wahl 1 (wert 2) „„Ein Blatt statt drei – und bis Freitag die Antwort zu den alten Anträgen.““; Wahl 2 rueck „… jetzt endet die Runde bei Miriams Spitze.“
- Begründung: Wer in `k2` Wahl 2 („gelten bestimmt weiter“) oder Wahl 3 („äh … eher ja?“) nahm, hat „bis Freitag“ nie zugesagt. Die letzte Frage war
  Lenas, nicht Miriams – die Rückmeldung stimmt auf keinem Weg.
- Ersatz Wahl 1: „„Kurz: Ein Blatt statt drei. Und zu den alten Anträgen melde ich mich bis Freitag.““ (passt auf allen Wegen, auf dem schwachen als Korrektur)
- Ersatz rueck Wahl 2: „Das letzte Wort war eine Chance – jetzt endet die Runde bei einer offenen Frage statt bei deiner Botschaft.“

**M8 – Beste Antworten behaupten Tatsachen, die die Lage nie nennt** (in den Lagen, die „sicher, wo du es weißt – nicht raten“ üben)
- `lagen-2.json` `stimme-l-10` `k6` Wahl 1: „… Dann zahlen Sie keine Pauschale.“ – die Lage nennt nur „dafür eine kleine Pauschale“.
- `lagen-3.json` `stimme-l-13` `k2` Wahl 1 und `k2b` Wahl 1: „… der Rest aus dem Haushalt der Stadt“ – die Lage nennt nur „die Hälfte über Spenden“.
- `lagen-3.json` `stimme-l-15` `k8` Wahl 1: „„Ja, um rund ein Zehntel – vor allem wegen der Stahlpreise. Dafür ist sie zwei Monate früher fertig geworden.““ –
  rueck: „eine sachliche Einordnung, die stimmt“. Keine dieser Zahlen steht in der Lage; zudem spricht ein Teammitglied vor der Presse über Mehrkosten.
- Begründung: Die beste Antwort wäre auf Grundlage dessen, was der Nutzer weiß, geraten – genau das, was 3-02/3-03 und die falschen Antworten derselben Lagen bestrafen.
- Ersatz (Fakten in die `lage` aufnehmen, Antworten bleiben):
  - l-10 `lage` ergänzen: „Kommt ein Teil doch später, entfällt die Pauschale.“
  - l-13 `lage`: „Kosten: 25.000 Euro – die Hälfte über Spenden, den Rest trägt die Stadt.“
  - l-15 `lage` ergänzen: „Die Halle wurde rund ein Zehntel teurer als geplant, vor allem wegen der Stahlpreise, und war zwei Monate früher fertig. Diese Zahlen hat die Geschäftsleitung schon öffentlich genannt.“

### sollte

**S1 – Schluss-Knoten loben auf jedem Weg** (`lagen-2/3.json`, `ende1` von l-07, l-10, l-11, l-12, l-13, l-14, l-15)
- Zitate: l-07 „Frau Sommer …: „Das war genau richtig.““ (auch nach „… guten Appetit oder so“); l-10 „Am Ausgang stehen ein paar Gäste vor der Liste“ (auch
  wenn die Liste nie erwähnt wurde); l-11 „„Das war genau richtig.““ (auch nach „sonst schläfst du ja ein“); l-12 „„Gut. Pilot ab Januar.““ (auch nach
  „eher viel“ und „absolut überzeugt“); l-13 „Sven schreibt seinen Namen dazu“ (auch nachdem du ihn vor sechzig Eltern verspottet hast); l-14 „„… auf die
  Minute.““ (auch nach „ausführlich erklären“, das laut rueck die Zeit sprengt); l-15 „„Das war die beste Eröffnung, die ich hier erlebt habe.““ (auf jedem Weg).
- Begründung: Wie in Stufe 1 (Korrektur 6 in `stimme.md`): Der schwache Weg darf nicht mit Lob enden, sonst widerspricht das Ende den Rückmeldungen.
- Ersatz (neutral, auf allen Wegen wahr):
  - l-07: „Applaus, die ersten stehen auf und gehen zum Buffet. Frau Sommer drückt dir den Arm: „Danke, dass du das übernommen hast.““
  - l-10: „Applaus. Beim Hinausgehen fragt Herr Petersen Carla, wo man sich für den neuen Dienst anmeldet.“
  - l-11: „Alle stoßen an. Tante Renate hebt ihr Glas in deine Richtung: „Kurz war's. Danke dir.““
  - l-12: `k5` Wahl 2 und 3 nach neuem `ende2`: „Die Geschäftsführerin: „Danke. Wir beraten das intern und melden uns.““ – `ende`: „Ohne klare Zusammenfassung mit Plan bleibt die Entscheidung liegen. Sicher, wo du gerechnet hast, offen mit Plan, wo nicht – das macht einen Vorschlag entscheidbar.“
  - l-13: „Die Moderatorin schließt den Abend. Am Ausgang bleiben einige Eltern an der Spendenliste stehen.“
  - l-14: „Applaus. Die Moderatorin: „Danke – und das ohne Beamer.“ Miriam hält drei Finger hoch.“
  - l-15: „Applaus. Carla drückt dir die Hand: „Danke, dass du für uns gesprochen hast.““

**S2 – l-07: Knoten widerspricht der Rückmeldung davor** (`lagen-2.json`, `stimme-l-07`, `k2.sagt`)
- Zitat: `k1b` Wahl 2 rueck „Schneller hört dich hinten noch weniger …“ → `k2`: „Jetzt hören alle zu. Dein erster Satz.“ (auch nach `k1` Wahl 3 „Gleich laut loslegen“ – da hast du schon begonnen).
- Ersatz `k2.sagt`: „Frau Sommer klopft noch einmal ans Glas. Jetzt hören alle zu. Dein eigentlicher erster Satz.“

**S3 – l-06: Die beiden guten Antworten nennen verschiedene Zahlen** (`lagen-2.json`, `stimme-l-06`, `k2`)
- Zitat: Wahl 1 (wert 1) „… etwa eine Stunde am Tag … jetzt … eine halbe – über alle Schichten gerechnet“; Wahl 2 (wert 2) „„Pro Schicht eine halbe Stunde weniger …
  als hätten wir an jedem Freitag einen Kollegen mehr““.
- Begründung: Eine halbe Stunde am Tag ergibt keinen Kollegen pro Freitag; das Bild stimmt nur bei rund drei Schichten mit je einer halben Stunde. Der Nutzer kann nicht wissen, welche Zahl gilt.
- Ersatz: `lage` ergänzen „Das Lager arbeitet in drei Schichten.“; Wahl 1: „„Vorher hat jede Schicht etwa eine Stunde nach Teilen gesucht, jetzt ungefähr eine halbe.““;
  Wahl 2: „„Jede Schicht sucht eine halbe Stunde weniger – zusammen fast ein Arbeitstag pro Woche. Als hätten wir freitags einen Kollegen mehr.““

**S4 – Endeffekt zu absolut übertragen** (`einheiten-2.json` `stimme-2-05` `aha`; `wissen.json` `stimme-w-018`)
- Zitat: „Das Letzte, was du sagst, bleibt am ehesten hängen.“
- Begründung: Der Vorteil des Endes (Recency) zeigt sich beim sofortigen Abrufen und schwindet nach kurzer Ablenkung; dauerhaft hält eher der Anfang
  (Lehrbuchwissen, Glanzer & Cunitz 1966 – nicht eigens nachgeschlagen). Der `belegHinweis` ist ehrlich, die Aha-Aussage nicht.
- Ersatz `aha`: „Was du zuletzt sagst, ist noch frisch im Ohr, wenn die anderen entscheiden oder aufstehen. Verschenk es nicht an „Das war's“. Sag den Kernsatz noch einmal, nenn den nächsten Schritt – und bleib danach einen Moment still stehen.“
  `w-018` `belegHinweis` ergänzen: „Der Vorteil des Endes zeigt sich vor allem direkt danach; der des Anfangs hält länger.“

**S5 – Mythos zu hart geurteilt** (`wissen.json`, `stimme-w-088`)
- Zitat: `"urteil": "falsch"`; „Drei starke Gründe mit Bild schlagen meist zehn schwache.“
- Begründung: Laut der eigenen Quelle (Wang u. a. 2022) wirken mit Vorstellungsbildern **mehr** Aussagen besser – das stützt „teils“, und der Schlusssatz „mit Bild … drei“ widerspricht ihr.
- Ersatz: `"urteil": "teils"`; letzter Satz: „Drei starke Punkte sind ein guter Faustwert – wer lebendige Bilder weckt, darf auch mehr nennen.“

**S6 – Mission doppelt** (`einheiten-2.json`, `stimme-2-02`, letzter Schritt und Feld `mission`)
- Zitat: `{ "art": "mission", "ref": "stimme-m-05" }` – dieselbe Mission „Die Zahl langsam“ beendet schon `stimme-1-05`.
- Begründung: „aufbauend statt wiederholend“; m-05 übt das Tempo, nicht das Bild.
- Ersatz: Mission und Feld `mission` streichen, stattdessen
  `{ "art": "experiment", "auftrag": "Gib in dieser Woche einer Zahl, die du ohnehin nennst, ein Bild – je Tag, je Person oder ein Vergleich. Die Zahl sagst du langsam.", "dauer": "woche", "nachfrage": "Hat jemand die Zahl oder das Bild später wiederholt?" }`,
  `{ "art": "reflexion", "frage": "Welche Zahl aus deinem Alltag verdient ein Bild – und welches?" }`

**S7 – Gleiches Verhalten, andere Wertung** (`tests.json`, `stimme-fc-030`)
- Zitat: „Über die Köpfe hinweg auf die Rückwand …“ – `wert 1`; in `v-0104` und `v-0276` ist genau das `wert 0` („wirkt abwesend“).
- Ersatz: Rückwand → `wert 0`, warum „Wirkt abwesend: Keiner fühlt sich angesprochen – auch hinten nicht.“; „Vor allem zu den Bekannten vorn …“ → `wert 1`,
  warum „Freundliche Gesichter geben Halt – für den Anfang gut. Danach gehört der Blick auch zu den Neuen hinten.“

**S8 – Test ist eine geübte Vorrats-Aufgabe – mit anderer Wertung** (`tests.json` `stimme-fc-037` ↔ `vorrat-04.json` `stimme-v-0287`)
- Zitat: fc-037 „… hält ein Teilnehmer seit zwei Minuten ein eigenes Kurzreferat … Andere schauen auf die Uhr“, „Weiter geduldig zuhören …“ = `wert 1`;
  v-0287 „… hält ein Zuhörer einen langen Vortrag statt einer Frage. Andere schauen schon auf die Uhr“, „Warten, bis er fertig ist …“ = `wert 0`; beste Antwort fast wörtlich gleich (auch w-055).
- Ersatz fc-037 (Transfer, gleiche Fähigkeit): Frage „Bei der Betriebsversammlung nutzt jemand die Fragerunde nach deinem Vortrag zur Ablage für eine Beschwerde über die Parkplätze. Was tust du?“ –
  wert 2 „„Das ist ein eigenes Thema – ich gebe es an Dr. Albers weiter. Gibt es Fragen zur Ablage?““ (warum: „Ernst genommen, weitergeleitet, zurück zum Thema.“);
  wert 1 „Kurz zustimmen und dann zur nächsten Wortmeldung.“ (warum: „Höflich, aber das Anliegen hängt in der Luft – ein Satz, wohin es gehört, hilft ihm.“);
  wert 0 „Mitdiskutieren, bis das Parkplatzproblem geklärt ist.“ (warum: „Die Fragerunde gehört allen. So endet sie bei einem fremden Thema.“).

**S9 – Lagen-Wahlen über 140 Zeichen** (LIESMICH Abschnitt 4; das Skript misst Lagen nicht – in Stufe 1 korrigiert)
- `lagen-2.json`: l-07 k3 W1 (180), l-08 k1 W1 (141), l-08 k3 W1 (144), l-10 k5 W1 (147), l-10 k7 W1 (144).
- `lagen-3.json`: l-11 k3 W2 (146), l-12 k1 W1 (176), l-12 k3 W3 (144), l-12 k3b W1 (153), l-13 k2 W1 (161), l-13 k3 W1 (174), l-13 k5 W3 (141), l-14 k1 W1 (150),
  l-15 k3 W2 (145), l-15 k4 W1 (156), l-15 k5 W1 (153), l-15 k7 W1 (142).
- Ersatz der längsten:
  - l-12 k1 W1: „Ausatmen, warten, bis sie aufschaut: „Ich empfehle eine gemeinsame Bestellplattform. Sie spart uns jedes Jahr Geld im Einkauf.““
  - l-13 k3 W1: „„In den Sommerferien, das steht. Ob es länger dauert, frage ich bei der Stadt nach – es kommt in den Elternbrief.““
  - l-13 k2 W1: „Kurz still, dann ruhig: „Berechtigte Frage. Die Hälfte zahlen Spenden, den Rest die Stadt – von euch kein Pflichtbeitrag.““
  - l-07 k3 W1: „„Wir feiern, weil wir uns kennenlernen wollen, weil die Kinder Platz brauchen, weil der Grill da war und weil der Sommer bald vorbei ist.““
  - l-15 k4 W1: „Blick nach hinten: „Was heißt diese Halle für uns? || Kein Umweg. Kein Frieren im Lager. Und Platz für zwanzig Neue.““
  - l-15 k5 W1: siehe S13.

**S10 – Zeitangabe der Rede-Übung widersprüchlich** (`einheiten-3.json`, `stimme-3-04-d`)
- Zitat: „Halte deine Fünf-Minuten-Rede … Nach der Hälfte der Zeit kommt die Ansage: „Noch eine Minute.““ bei `"sekunden": 180`.
- Begründung: Fünf Minuten passen nicht in 180 s; „Hälfte der Zeit“ + „noch eine Minute“ ergibt 2½ Minuten. `v-0275` löst es sauber (360 s, Zeichen nach drei Minuten).
- Ersatz: `"sekunden": 300`; Auftrag: „… Nach drei Minuten kommt die Ansage: „Noch eine Minute.“ Dann streichst du den geplanten Teil und gehst zum Schluss.“

**S11 – Rangfolgen ohne eindeutige Reihenfolge** (`vorrat-03/04.json`)
- `v-0207`: Wasser → ausatmen → „mmh“ – der Spickzettel `w-120` lehrt Wasser → „mmh“ → ausatmen. Ersatz: Einträge 2 und 3 zusammenlegen („Zwei-, dreimal lang ausatmen, dann leise „mmh“.“) und als neuen dritten Eintrag „Den ersten Satz einmal halblaut sprechen.“ (warum: „Der Satz ist im Mund, bevor du gehst.“).
- `v-0199`: „zeigt, wie etwas abläuft“ vor „fügt etwas hinzu“ – beides sind Merkmale derselben hilfreichen Geste (Hostetter 2011 nennt beide); keine Rangfolge belegt. Ersatz: drei Einträge – „zeigt Ablauf oder Form, die die Worte nicht nennen“, „zeigt, was die Worte ohnehin genau sagen“, „hat keinen Bezug zum Gesagten“.
- `v-0252` („mmh“ vor Wasser), `v-0285` (Vorhersage vor Stärken notieren – ist Ablauf, nicht Stärke), `v-0235` (nach überraschender Zahl vor Zwischen-Teile-Pause): Plätze 2/3 sind Ermessen. Ersatz: „Stark zuerst“ durch eine echte Abfolge ersetzen oder auf drei klar abgestufte Einträge kürzen.

**S12 – Geschichte legt das Alter des Nutzers fest** (`lagen-3.json`, `stimme-l-11`, `k2`)
- Zitat: „… dir mit zwölf das Radfahren … beigebracht hat“; Wahl 1 „„Sommer 1998. …““ – passt nur für Jahrgang ≈ 1986.
- Ersatz `k2.sagt`: „… wie Tante Renate dir als Kind das Radfahren ohne Stützräder beigebracht hat.“; Wahl 1: „„Ein Sommer vor vielen Jahren. Ein Feldweg hinter dem Haus. Ich auf einem roten Rad, Tante Renate hinter mir, eine Hand am Sattel.““

**S13 – Bilder zu Zahlen ungenau** (`tests.json` `stimme-fc-026`; `lagen-3.json` `stimme-l-15` `k5`)
- fc-026: „50 Euro, ungefähr eine Tankfüllung“ – eine Tankfüllung kostet eher 70–90 Euro. Ersatz: „„600 Euro im Jahr – das sind für jede Wohnung 50 Euro, ungefähr ein Wocheneinkauf.““
- l-15 k5: „3.000 Quadratmeter – so groß wie zwölf Tennisplätze“ stimmt nur für das Feld innerhalb der Linien (≈ 260 m²); mit Auslauf, wie man sich einen Platz vorstellt (≈ 670 m²), sind es etwa vier. Ersatz (zugleich S9): „Langsam: „3.000 Quadratmeter – so viel wie vierzig Wohnungen.“ Pause. Dann ruhig: „Gebaut von Menschen, die nie aufgegeben haben.““

**S14 – Stille Ersatzübung mit vertauschtem Lernziel** (`vorrat-03/04.json`, `kopf.leise`)
- `v-0248` (vor vierzig Leuten ohne Mikrofon, kräftig über den Atem) → `v-0214` (Lage unter Druck); `v-0249` (sicher und offen in derselben Lage) → `v-0215` (lange Rede ohne Mikrofon einteilen). Ersatz: tauschen – `v-0248` → `v-0215`, `v-0249` → `v-0214`.
- `v-0208` (Aufzählung, nach jedem Punkt loslassen) → `v-0136`; `v-0209` (erste 90 s, vor jeder Antwort ausatmen) → `v-0137` (Atemstriche in der Aufzählung). Ersatz: tauschen – `v-0208` → `v-0137`, `v-0209` → `v-0136`.
- `stimme-2-06-c` (je Abschnitt eine Person ansehen) → `v-0134` (Stand im Spiegel). Ersatz: `v-0135` („Ein Gedanke, eine Person – innerlich“).

**S15 – Unbelegte Gleichsetzung ruhiger und lebhafter Redner** (`einheiten-3.json`, `stimme-3-05`, Mythos und `3-05-a` 4. Antwort)
- Zitat: „Ruhige, sachliche Redner überzeugen ebenso wie lebhafte.“ / „Sachliche Redner überzeugen genauso.“
- Begründung: Keine Quelle; die eigenen Quellen (Van Zant & Berger, Antonakis) zeigen eher, dass Wechsel und Lebendigkeit wirken. Die Botschaft (eigener Stil) trägt auch vorsichtiger.
- Ersatz: „Auch ruhige, sachliche Redner überzeugen – mit klarem Aufbau und Wechseln in Tempo und Pause. Kopierte Gesten …“ / „Ein Kommentar zum Stil ist kein Urteil über dich. Auch sachliche Redner überzeugen, wenn sie Wechsel setzen.“

**S16 – Graeber 2024 weiter gefasst als die Studie** (`einheiten-2.json` `stimme-2-02` Schritt 1; `vorrat-03.json` `v-0161` warum; `quellen.json` `graeber2024`)
- Zitat: „Eine Zahl und eine Geschichte verändern deine Meinung zunächst gleich stark.“ / „Schon ein anschauliches Detail neben der Zahl half.“
- Begründung: Zusammenfassung und Bericht der Autoren nennen die unterschiedliche Abnahme (73 % / rund ein Drittel), aber keine gleich großen Sofortwirkungen
  (ein Bericht der Hochschule sagt eher: Zahlen wirken sofort mindestens so stark). Belegt ist, dass **Verknüpfungen mit Vertrautem das Erinnern an Zahlen verbessern** – nicht „ein anschauliches Detail“.
- Ersatz Frage: „Eine Zahl und eine Geschichte verändern deine Meinung sofort. Was wirkt einen Tag später noch?“; letzter Satz der Auflösung, in `v-0161` und in der Quelle: „Half dabei: die Zahl mit etwas Vertrautem verknüpfen.“

### kann

- **K1 – Längste Antwort ist oft die beste:** `einheiten-2.json` 4 von 7, `lagen-2.json` 17 von 32, `lagen-3.json` 18 von 34 (Ziel: höchstens die Hälfte); im
  Dialog `3-03-c` sogar 4 von 4, in `l-10` 6 von 10. Mit den Kürzungen aus S9 sinkt der Wert; zusätzlich in `3-03-c` k2 W1 kürzen: „„Weiß ich gerade nicht. Ich kläre es mit der Personalabteilung – bis Freitag.““
- **K2 – `shu2014` verlinkt die einschränkende Studie** (`10.1002/jcpy.1256` ist Wang u. a. 2022). Link aufs Original setzen (vermutlich `10.1509/jm.11.0504` – vor dem Eintragen prüfen) oder Wang als eigene Quelle `wang2022` führen.
- **K3 – `2-02-a` 6. Karte** „Hinter der Zahl steht Lena …“ enthält keine Zahl. Ersatz: „„300 Überstunden im Jahr – dahinter steht Lena, die jeden Abend eine Stunde länger bleibt.““
- **K4 – `3-01-a` Muster 1:** Der Bus der Verkehrsbetriebe begründet nicht, warum der Verein Aushänge braucht. Ersatz Wendung: „Der Vereinsabend fällt aus – || die Absage stand nur in der Chatgruppe, und Frau Sommer hat kein Smartphone.“
- **K5 – „den Pilot“** (`l-12` k4, k5, ende): umgangssprachlich; Ersatz „das Pilotprojekt“ / „den Piloten“.
- **K6 – `3-01` Aha** „bleibt länger als jede Folie“ – Versprechen ohne Beleg. Ersatz: „… und bleibt oft länger hängen als eine Folie.“
- **K7 – `3-05` ohne Sprechschritt:** Die Karte sagt „Nimm einen Auftritt auf“, die Einheit übt es nicht. Vorschlag: `experiment` „Nimm deinen nächsten Beitrag auf. Schreib vorher drei Wörter, wie du wirken willst – und vergleich.“ (dauer `woche`).
- **K8 – Notation:** `l-07` k3 W1 setzt `||` vor das dritte Glied; `2-03` lehrt dort eine „winzige Pause“ (`|`). Ersatz: „… Würstchen – | und Nachbarn …“.
- **K9 – `v-0233` Muster 2:** Carlas „zitternde Hände“ als Pointe ihres Abschieds kann vor Publikum beschämen (Carla ist die Figur mit Auftrittsangst). Ersatz Szene: „Ihre erste Präsentation bei uns – zwanzig Folien in zehn Minuten.“, Pointe: „Heute schafft sie zwanzig Entscheidungen in zehn Minuten.“
- **K10 – `3-05` Karte „das wusste schon Aristoteles“:** Die Quelle `aristoteles` nennt Ethos/Pathos/Logos, nicht das Natürlichkeits-Gebot (Rhet. III 2). `aristoteles-vortrag` ergänzen oder die Stelle in der Quelle nennen.
- **K11 – `w-050` Beleg A**, aber „für Reden eine Übertragung“ – B wäre ehrlicher.
- **K12 – `w-016`** „Vor allem Vorgesetzte hören oft nur die ersten Sätze genau.“ ohne Beleg; Ersatz: „Viele, die wenig Zeit haben, hören vor allem den Anfang genau.“
- **K13 – `v-0261`** (Lautstärke wechseln) → `leise v-0217` (sicher/offen markieren): Lernziel passt kaum; besser eine stille Übung „Kräftige Stellen markieren“ ergänzen oder `v-0215`.
- **K14 – `l-15` k3 W2 rueck:** Bei einer offiziellen Eröffnung ist eine **kurze** Anrede üblich. Ersatz: „Eine lange Anrede verbraucht den Anfang. Kurz – „Liebe Gäste, lieber Herr Dr. Albers“ – und dann die Geschichte.“

## 3. Urteil

**Freigabereif nach Korrektur der muss-Befunde.** Fachlich und in der Stimmpflege ist der Bereich stark, die Quellen sind ehrlich eingeordnet, die
Einfluss-Klassen sauber, die stillen Ersatzübungen echt. Die Schwächen liegen fast nur in den **Wegen der Lagen und Dialoge** (M3–M8, S1–S3) und in
**zwei falsch gerechneten Bildern** genau in der Einheit, die Bilder zu Zahlen lehrt (M1, M2). Prüfskript: **0 Fehler, 0 Hinweise**.

## 4. Umsetzung (25.11.2026)

Geändert nur in `src/coach/inhalt/stimme/` (dazu `_index.json` über `node scripts/coach-index.mjs`). Keine Kennung geändert, nichts gelöscht;
`vorrat-01.json` (v-0008 mit Tonaufnahme) und andere Stufe-1-Dateien unberührt. Danach alle Wege der Lagen l-06…l-15 und der Dialoge 2-01-d, 3-03-c
Knoten für Knoten durchgegangen. Ergebnis: `coach-pruefe.mjs --nur stimme` **0 Fehler, 0 Hinweise**, `--soll stimme` **leer**; keine Lagen-Antwort über 140 Zeichen.

### muss

| Befund | Stand |
|---|---|
| M1 | umgesetzt wie vorgeschlagen (1.200/Monat ≈ 60 je Arbeitstag). |
| M2 | umgesetzt (18.000 Blatt ≈ 1,8 m – „fast so hoch wie eine Tür“). |
| M3 | umgesetzt, aber anders: `ende1` („ich antworte bis Freitag“) bleibt für die Wahl mit Bitte; Wahl 2 und 3 von `k2` führen in neues `ende2` („Wenn Sie etwas von mir brauchen – eine Mail genügt“), Fazit ohne Lob. So stimmt Albers' Satz auf dem guten Weg weiter. |
| M4 | umgesetzt mit neuem `ende2`; dessen Fazit aber als Regel formuliert („Antwort zuerst, die Zahl mit Bild … – und die Bitte konkret“) statt „hast du gebraucht“, weil das auf schwachen Wegen nicht stimmt. Zusätzlich `k2.sagt` („Halbiert – was heißt das?“) neutral gefasst – „halbiert“ fiel auf den Wegen über `k1` W3 und `k1b` W2 nie. |
| M5 | umgesetzt wie vorgeschlagen; dazu `k3.sagt` „Jonas meldet sich …“ (passt auch nach „Das reiche ich nach“) und `ende1` ohne „punktgenau“. |
| M6 | umgesetzt; l-07 `k3.sagt` aber „Es ist ruhig genug …“ statt „Die Leute sind bei dir“ (stimmt nach `k2` W3 nicht). l-11 wie vorgeschlagen; zusätzlich `k4`/`k6` so gefasst, dass das Gelächter von Renates Zwischenruf kommt. |
| M7 | umgesetzt wie vorgeschlagen. Zusätzlich: Die beste Antwort in `k1` behauptete „ersetzt zwei alte Formulare“ – steht jetzt in der `lage` („ein Formular statt bisher drei“), Zahl in `k1`/`k1b` auf „drei“ angeglichen. |
| M8 | umgesetzt (l-10, l-13, l-15 wie vorgeschlagen). Beim Durchgehen weitere beste Antworten mit Fakten außerhalb der Lage gefunden und die Fakten in die `lage` aufgenommen: l-06 (drei Schichten, eine → eine halbe Stunde, ein Drittel der Schilder, Monatsende), l-08 (bisher Techniker erst bei Ausfall, erster Termin Donnerstag), l-10 (Start im März, Stillstand kostet weit über 100 Euro je Stunde, Liste am Ausgang), l-12 (40.000 Euro), l-13 (zwei Spielzonen, Aufsicht bleibt, Plan B in zwei Abschnitten, Sommerferien, Spendenliste), l-14 (`k3.sagt` nennt den zweiten Handgriff „nachfragen“), l-15 (Wiese und Carla in Gummistiefeln, die drei Vorteile der Halle). l-15 `k8` W2 („Dazu kann ich nichts sagen“) wurde, da die Zahlen nun öffentlich sind, zu „Das beantwortet Ihnen Dr. Albers gleich am besten“ (wert 1). |

### sollte

| Befund | Stand |
|---|---|
| S1 | umgesetzt für l-07, l-10, l-11, l-12 (neues `ende2`), l-13, l-14, l-15 – l-07 statt „gehen zum Buffet“ (stimmt nach W1 nicht) „Die ersten Kinder stürmen schon zum Grill“. Zusätzlich neutral gefasst: l-08 `ende1` (ohne „lächelt dir zu“), l-09 `ende1`; die Fazits von l-14 und l-15 waren Rückblicke („frei gestanden …“) und sind jetzt Regeln („frei stehen …“). |
| S2 | umgesetzt wie vorgeschlagen. |
| S3 | umgesetzt (Lage: drei Schichten; beide Antworten „je Schicht“; 3 × ½ h × 5 Tage = 7,5 h ≈ ein Arbeitstag nachgerechnet). |
| S4 | umgesetzt (Aha 2-05 leicht gekürzt wegen 220 Zeichen); Satz zum Vorteil des Endes in `belegHinweis` von 2-05 **und** `w-018`. |
| S5 | umgesetzt; dazu den vorletzten Satz von `w-088` an Wang u. a. angepasst („den überzeugen mehr Punkte sogar stärker“). |
| S6 | umgesetzt wie vorgeschlagen (Mission m-05 und Feld `mission` aus 2-02 entfernt; der Anwendungstag `a-003` wählt Missionen ohnehin selbst). |
| S7 | umgesetzt wie vorgeschlagen. |
| S8 | umgesetzt; Frage klarer gefasst („Du hast … die neue Ablage vorgestellt. In der Fragerunde beschwert sich jemand ausführlich über die Parkplätze“). |
| S9 | umgesetzt – alle 17 genannten Wahlen gekürzt (eigene Fassungen, wo der Vorschlag Inhalt verlor); gemessen: keine Lagen-Wahl über 140. |
| S10 | umgesetzt (300 s, Ansage nach drei Minuten). |
| S11 | umgesetzt: v-0207 („mmh“ und Ausatmen in einem Eintrag, neuer dritter Eintrag „ersten Satz halblaut“), v-0199 auf drei Einträge, v-0252 und v-0285 auf drei klar abgestufte Einträge, v-0235 „vor dem Kernsatz – oder gleich nach einer überraschenden Zahl“ zusammengelegt. |
| S12 | umgesetzt wie vorgeschlagen. |
| S13 | fc-026 umgesetzt, aber mit anderem Bild: auch „ein Wocheneinkauf“ ist für 50 Euro fraglich (Familien) → „so viel wie ein Essen zu zweit im Restaurant“. l-15 `k5` wie vorgeschlagen (40 × 75 m² = 3.000 m²). |
| S14 | umgesetzt wie vorgeschlagen (v-0248 → v-0215, v-0249 → v-0214, v-0208 → v-0137, v-0209 → v-0136, 2-06-c → v-0135). |
| S15 | umgesetzt wie vorgeschlagen. |
| S16 | **teilweise**: Die Frage („zunächst gleich stark“) ist geändert. Den Satz „Schon ein anschauliches Detail neben der Zahl half“ habe ich **nicht** durch „Verknüpfen mit Vertrautem“ ersetzt: Die Zusammenfassung der Zeitschriftenfassung (QJE 2024) sagt, dass schon nicht-informative anschauliche Inhalte neben einer Zahl das Erinnern verbessern und den Rückgang bremsen; die Verknüpfung mit Zusammenhängen stammt aus dem Arbeitspapier (CEPR 2022). Präzisiert in 2-02 („selbst eines ohne neue Information“), v-0161 („half beim Erinnern“) und `graeber2024` (beide Fassungen genannt, „nicht am Volltext“). Zusätzlich das Aha von 2-02 entschärft: „fast vergessen“ → „verliert über Nacht den größten Teil ihrer Wirkung“ (gemessen wurde die Wirkung auf Überzeugungen). |

### kann

| Befund | Stand |
|---|---|
| K1 | umgesetzt: Gegenwahlen verlängert bzw. beste Antworten gekürzt. „Beste = längste“ (alle Knoten) jetzt `lagen-2` 16/32, `lagen-3` 15/34, `3-03-c` 1/4; Prüfskript ohne Hinweis. |
| K2 | umgesetzt: `shu2014` verlinkt jetzt `10.1509/jm.11.0504` (per DOI-Abfrage geprüft: Shu & Carlson, J. Marketing 78, 127–139); die DOI von Wang u. a. steht im Text. |
| K3 | umgesetzt, aber ohne Rechnung im Bild („300 Überstunden im Jahr – dahinter steht Lena, die abends bleibt, bis die Post raus ist“), damit die Karte eindeutig ins Fach „Gesicht dahinter“ gehört (der Vorschlag „jeden Abend eine Stunde“ ergäbe ≈ 220, nicht 300). |
| K4 | umgesetzt; Ort und Detail der Musterlösung mit angepasst (Vereinsheim, Kuchen im Regen), damit die Geschichte in sich stimmt. |
| K5 | umgesetzt („ein Pilotprojekt“, „Das Pilotprojekt startet im Januar“). |
| K6 | umgesetzt. |
| K7 | umgesetzt als `experiment` vor der Reflexion von 3-05 (Vorhersage in drei Wörtern, dann ansehen wie bei einer fremden Person – passend zur Studie derselben Einheit). |
| K8 | umgesetzt (`|` statt `||`, Rückmeldung angepasst). |
| K9 | umgesetzt; Toast passend geändert („auf jede Minute, die sie der neuen Abteilung spart“). |
| K10 | umgesetzt: 3-05 zitiert jetzt `aristoteles-vortrag`; dessen Text um Rhetorik III 2 ergänzt (Kunst verbergen, natürlich statt gekünstelt sprechen). |
| K11 | umgesetzt (Beleg B, Hinweis erklärt warum). |
| K12 | umgesetzt wie vorgeschlagen. |
| K13 | umgesetzt mit neuer stiller Übung `stimme-v-0290` „Ruhige und kräftige Stellen markieren“ (betonung, Stufe 8); v-0261 verweist darauf. |
| K14 | umgesetzt, an die beste Antwort angepasst (die beginnt ohne Anrede): „Wenn Anrede, dann kurz – „Liebe Gäste“ – und gleich die Geschichte.“ |

### Offen für den Hauptstrang

- Nichts außerhalb des Bereichs nötig (keine Änderung an `gemeinsam.json`, `quellen.json` oder `besetzung.json`).
- Beobachtung ohne Befund: v-0200 (Gesten beim Erklären) hat als stille Ersatzübung v-0134 „Stand im Spiegel“ – gleiche Fähigkeit, Gesten kommen dort aber nur am Rand vor. Eine stille Gesten-Übung könnte das später schärfen.
