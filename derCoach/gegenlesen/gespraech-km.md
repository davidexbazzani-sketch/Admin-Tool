# Gegenlesen: Bereich `gespraech`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Fachlektor und Faktenprüfer · **Inhaltsdateien nicht geändert**

## Was geprüft wurde

- **Maßstab:** `08_ENTSCHEIDUNGEN.md` (geht vor), `06_INHALT_REGELN_MUSTER.md` (1–3, Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (3a ff., 5–7, inkl. der neuen Abgrenzung in §7: **falsches Entweder-oder = rot**, echte Wahl = Taktik), dazu die Vorgabe des Hauptstrangs: **künstlicher/erfundener Zeitdruck = erfundene Tatsache = rot, echte Fristen = fair** (steht so noch nicht wörtlich in §7, deckt sich aber mit `03` 10.4 „Knappheit“). `05_LEHRPLAN.md` 3.8, `01_KONZEPT.md`, `inhaltTypen.ts`, `besetzung.json`, Phase-1-Bericht `gegenlesen/gespraech.md`.
- **Vollständig gelesen:** `einheiten-2.json` (2-01…06), `einheiten-3.json` (3-01…05), `lagen-2.json` (l-06…l-10), `lagen-3.json` (l-11…l-15), `vorrat-03.json` (v-0095…0174, 80), `vorrat-04.json` (v-0175…0254, 80), Lerntage k/m in `kurs.json`, `tests.json` fc-025…040, neue Einträge in `wissen.json` (w-015…018, 054, 056, 057, 058, 065, 088, 097, 125), neue Quellen (`levine2018`, `abiesber2022`, `nemeth2001`, `greitemeyer2009`). **Jeden Weg durch jede Lage und jeden Dialog** nachverfolgt.
- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur gespraech` → **0 Fehler, 1 Hinweis** (`fc-014`, Phase 1, bekannt). `--soll gespraech`: Vorrat füllt alle Übungstage; aber **12 Hinweise „Wahl länger als 140 Zeichen“** in den neuen Lagen (l-06, l-07, l-08 ×2, l-09, l-10, l-13 ×2, l-15 ×2) und v-0142. Global meldet `--soll` `_index.json: veraltet` – Sache des Hauptstrangs (`node scripts/coach-index.mjs`).
- **Kursplan:** k = 6 E · 6 Ü · 4 L · 3 A · 1 S (20), m = 5 E · 5 Ü · 4 L · 3 A · 1 S (18). Bänder [3,6]–[4,7] bzw. [5,8]–[6,10]. Test-Stufen k 4–7, m 6–9. Titel folgen Lehrplan 3.8 bzw. den Schärfungen in `08`. **Stimmt.**
- **Kennungen:** Keine Kollision. Die neuen Wissens-Kennungen (015–018, 054, 056–058, 065, 088, 097, 125) gab es in HEAD nicht, keine doppelt, keine fremden Verweise. **Hinweis:** `gespraech-w-057` „Die Entweder-oder-Falle“ ist **kein Phase-1-Eintrag**, sondern neu in diesem Durchgang (in `git diff` angehängt) – die Änderung darf also noch ohne Rücksicht auf Auslieferung erfolgen.
- **Laut/leise:** 2-05-b → v-0152; v-0154/0155/0164/0165 (vorrat-03) und sechs `buehne` in vorrat-04 → jeweils existierende `stumm`-Übung derselben Fähigkeit. **Stimmt.**
- **Fachhilfe** nur als Schritt (3-01 → `belaestigung`, passend zur Karte „Wenn Streit Angst macht“). Keine Rufnummern, kein „...“, „Sie“ nur in wörtlicher Rede.
- **Quellen nachgeschlagen:**
  - **levine2018** (Pressemitteilung Chicago Booth, Inhaltsverzeichnis des Volltexts): drei Experimente – drei Tage ehrlich (Vergleich freundlich/neutral bzw. „aufmerksam“), ehrliches Gespräch mit nahem Menschen, ehrliche negative Rückmeldung. Ehrlichkeit angenehmer und verbindender als erwartet; Zuhörer („targets“) reagierten weniger negativ als vorhergesagt. `w-015`, `3-05` Studie: **korrekt.**
  - **abiesber2022** (APA-Presse, ScienceDaily): fünf Experimente, N = 1.984; Unterschätzung am stärksten bei wichtigen Punkten; die Frage „Würde ich es an seiner Stelle wollen?“ verkleinert die Lücke. `w-016`, `2-01`: **korrekt.**
  - **nemeth2001** (Abstract EJSP 10.1002/ejsp.58): echte Minderheit schlug alle drei Advocatus-Diaboli-Bedingungen; frühere Arbeit: gespielter Widerspruch stärkt eher die Ausgangsmeinung. `2-05`, `w-018`, `w-088`: **korrekt.** Nicht verwechseln mit Nemeth, Connell u. a. 2001 (J Appl Soc Psych).
  - **greitemeyer2009** (Abstract, Uni Göttingen): EJSP 39(4), 639–647; Eskalation sank nur in heterogenen Gruppen mit Advocatus-Diaboli-Verfahren. **Korrekt.**
  - `givi2024`, `speed2018`, `flynn2008`, `gollwitzer2006`, `eyal2018` stammen aus anderen Bereichen und sind dort geprüft. `gottman1999`, `schulzvonthun1981` und `oettingen2014` stehen auf `geprueft: false`. Sie stützen keine Zahl, das ist in Ordnung.

## Gesamteindruck

Fachlich ist der Teil sauber und ehrlich. Er baut erkennbar auf Phase 1 auf:
- **Phase k:** Lob mit Blick nach vorn, Kritik annehmen ohne einzuknicken, Nein mit Angebot, Maßstab statt Halbe-halbe, Widerspruch in der Runde mit Mittragen und Prüftermin, Lage–Folge–Möglichkeiten–Vorschlag nach oben.
- **Phase m:** die vier Zerstörer, vier Ohren, unfaire Züge, Absprachen mit „fertig heißt“ und „wenn es hakt“, das aufgeschobene Gespräch.

Die Belege sind ehrlich gestuft, die belegHinweise sagen, was übertragen ist. Die Sicherheitslinie hält: 3-01 mit `belaestigung`, 3-05 „bei Drohung gilt anderes“.

Die Mängel liegen an drei Stellen:
1. **Einfluss-Klassen nach der neuen Regel:** Das falsche Entweder-oder und der künstliche Zeitdruck laufen noch als `taktik`, und zwar in `w-057`, `3-03-a`, `3-03-b`, `v-0220`, `v-0222` und `v-0227`. In `l-12` widerspricht die Musterantwort dem eigenen Prinzip „künstlichem Zeitdruck nicht folgen“.
2. **Wege in den Lagen:** In l-09, l-13 und l-15 brechen Zeitlinie oder Wissensstand. Dazu passen in fast jeder Lage Fazit oder Rückmeldung nicht auf jedem Weg.
3. **Erratbarkeit:** Die beste Antwort ist in 32 von 42 bzw. 32 von 40 Lage-Knoten die längste, in den neuen Tests in 10 von 16.

Dazu kommt ein Figurenwiderspruch zu Miriams Mutter (v-0150 gegen l-15).

**Zählung: 13 muss · 19 sollte · 22 kann.**

---

## Muss

### M1 – `w-057` „Die Entweder-oder-Falle“: Klasse `taktik` → `rot`
- **Datei:** `wissen.json`, `gespraech-w-057`
- **Zitat:** `"einfluss": "taktik"`, `"gruppe": "Unfaire Züge kontern"`, Text: „… Das lügt nicht, engt aber ein und setzt unter Druck.“
- **Begründung:** Beschrieben ist genau das falsche Entweder-oder, das „alle anderen [Wege] verschwinden“ lässt, um zu drängen. Nach LIESMICH §7 ist das `rot`. „Das lügt nicht“ stimmt so nicht: Wer zwei Wege als die einzigen ausgibt, behauptet etwas Falsches. Als Einsatz-Übung kommt der Eintrag nirgends vor; Lagen und Vorrat nutzen ihn nur zum Erkennen (3-03-b, l-12 k2, v-0220). Es bleibt also bei Klasse und Text.
- **Ersatz:**
  - `"einfluss": "rot"`, `"gruppe": "Rote Linie – erkennen und abwehren"`
  - text: „„Entweder wir machen es so, oder wir lassen es ganz.“ Zwei Wege werden als die einzigen hingestellt, alle anderen verschwinden – damit du dich schnell entscheidest. Das verschweigt Möglichkeiten. Etwas anderes ist die echte Wahl („Lieber Dienstag oder Donnerstag?“), wenn es wirklich nur um zwei Wege geht.“
  - preis: „Ihr wählt zwischen zwei Wegen, obwohl die beste Lösung oft ein dritter ist – und wer es merkt, fühlt sich gelenkt.“
  - abwehr bleibt; ergänzen: „… und die Sorge dahinter anerkennen.“

### M2 – `3-03-a` (zuordnen fair / Taktik / rote Linie) lehrt die alte Einteilung
- **Datei:** `einheiten-3.json`, `gespraech-3-03-a`
- **Zitate:**
  - „„Entweder so, oder wir lassen es ganz.““ → `fach: 1`
  - „„Ich brauch die Antwort bis heute Abend.“ – ohne dass es eilt.“ → `fach: 1`
  - „Jemand redet lange weiter, damit du nicht zu Wort kommst.“ → `fach: 1`
- **Begründung:**
  - Die ersten beiden Karten sind nach der neuen Regel `rot`: das falsche Entweder-oder und der ausdrücklich erfundene Zeitdruck.
  - Die dritte nennt der Bereich selbst „unfair“ (`w-056`: „Unterbrechen …“). Nach §7 laufen unfaire Kunstgriffe als `rot` („nur erkennen und abwehren“).
  - Damit stünden unter „Taktik“ keine Karten mehr. Es fehlen dort echte, ehrliche Taktiken.
- **Ersatz** (Fächer bleiben je 2/3/3 oder ähnlich ausgewogen):
  - Karte 2: „„Lieber Dienstag oder Donnerstag?“ – beides geht wirklich.“ (`fach: 1`)
  - Karte 4: `fach: 2`, Text bleibt.
  - Karte 8: `fach: 2`, Text bleibt.
  - Karte 6 „Lass uns erst die Fakten klären …“ (fair) ersetzen durch „„Das muss ich erst noch abstimmen.““ (`fach: 1`).
  - Neue Taktik-Karte statt Karte 7 (Zermürben, rot – dafür bleibt Karte 3 rot): „Nach dem eigenen Angebot bewusst schweigen und warten.“ (`fach: 1`).

  Ergebnis: fair 1 · Taktik 3 · rot 4. Will man die fair-Seite halten, Karte 6 behalten und stattdessen Karte 7 durch die Schweigen-Karte ersetzen.

### M3 – `3-03-b` (kunstgriff Kassenwart): `einfluss` `taktik` → `rot`
- **Datei:** `einheiten-3.json`, `gespraech-3-03-b`
- **Zitat:** `"einfluss": "taktik"`; erklaerung: „Sie lügt nicht, setzt aber unter Druck.“
- **Begründung:** wie M1. Die Lage („… oder der Verein ist in zwei Jahren pleite“) ist ein falsches Entweder-oder.
- **Ersatz:** `"einfluss": "rot"`; erklaerung: „Die Entweder-oder-Falle stellt zwei Wege als die einzigen hin und verschweigt die übrigen, um zu drängen – das gehört zur roten Linie. Oft steckt eine echte Sorge dahinter. Abwehr: den Rahmen öffnen – „Welche Möglichkeiten gibt es noch?“ – und die Sorge anerkennen.“

### M4 – `v-0220`, `v-0222`, `v-0227` (vorrat-04): dieselbe Regel
- **Datei:** `vorrat-04.json`
- **`v-0220`** (kunstgriff, „Entweder wir fahren zu meinen Eltern, oder Weihnachten fällt dieses Jahr eben aus.“, `taktik`):
  - Ersatz: `"einfluss": "rot"`
  - erklaerung: „Das falsche Entweder-oder lässt alle anderen Wege verschwinden, um zu drängen – das gehört zur roten Linie. Eine echte Wahl zwischen zwei Möglichkeiten ist etwas anderes. Oft steckt ein echtes Anliegen dahinter. Abwehr: das Anliegen spiegeln und weitere Wege suchen.“
- **`v-0222`** (kunstgriff, künstlicher Zeitdruck, `taktik`, erklaerung „Er lügt nicht immer – manchmal ist es wirklich eilig.“):
  - Ersatz: `"einfluss": "rot"`
  - erklaerung: „Erfundener Zeitdruck ist eine erfundene Tatsache: Er soll dir die Zeit zum Prüfen nehmen – rote Linie. Eine echte Frist ist fair. Abwehr: nach der echten Frist fragen und dir die Zeit nehmen, die die Entscheidung braucht.“
- **`v-0227`** (zuordnen):
  - Karte „„Ich brauch die Antwort heute noch.“ – obwohl es Zeit hätte.“ → `fach: 2`.
  - Karte „„Entweder du kommst mit, oder ich fahr gar nicht.““ ist mehrdeutig. Ersetzen durch „„Lieber Dienstag oder Donnerstag?“ – beides geht wirklich.“ (`fach: 1`).
  - Für die Balance Karte 6 durch „„Das muss ich erst noch abstimmen.““ (`fach: 1`) ersetzen.
- **Außerdem (sollte):** `v-0184` (Gegenvorwurf, `taktik`). Die Wissens-Seite führt ihn als Fehler (`w-075`); als Ablenkungszug gehört er zu den unfairen Kunstgriffen. Ersatz: `"einfluss": "rot"` oder `einfluss` weglassen.

### M5 – `l-12` k4/k5: Die Musterantwort folgt dem künstlichen Zeitdruck, und der Weg bricht
- **Datei:** `lagen-3.json`, `gespraech-l-12` › `k4` › wahl 1 und `k5`
- **Zitate:**
  - k4 Kassenwart: „Ich schlage vor, wir stimmen jetzt sofort ab – es ist schon spät.“
  - wert 2: „Abstimmen gern – über den Antrag mit beiden Wegen.“
  - rueck: „… den künstlichen Zeitdruck genutzt, statt dich hetzen zu lassen.“
  - danach k5 w1: „… Abstimmung in der nächsten Vorstandssitzung.“
- **Begründung:**
  - Die beste Antwort stimmt der Sofort-Abstimmung zu. Das Prinzip der Lage lautet aber „künstlichem Zeitdruck nicht folgen“, und erfundener Zeitdruck ist jetzt `rot`.
  - Danach schlägt dieselbe Person eine Abstimmung in einer späteren Sitzung vor. Das widerspricht ihrer Zusage von gerade eben.
  - „Es ist schon spät“ kann auch wahr sein. Soll es als künstlich gelten, muss die Lage das zeigen.
- **Ersatz:**
  - k4 sagt: „„… Ich schlage vor, wir stimmen jetzt sofort ab – die Halle wird gleich abgeschlossen.“ (Du weißt: Sie ist bis 22 Uhr gebucht, es ist halb neun.)“
  - w1: „„Die Zahlen hab ich mit dem Hallenwart durchgerechnet. Die Halle ist bis zehn gebucht – zwei Minuten für beide Wege, dann stimmen wir ab.““
  - rueck: „Die Spitze nicht erwidert, mit Fakten geantwortet – und den erfundenen Zeitdruck ruhig richtiggestellt, statt dich hetzen zu lassen.“
  - k5 sagt: „Die Versammlung stimmt zu – unter einer Bedingung. Die Vorsitzende: „Die Hallenteilung muss stehen. Wer prüft das, und bis wann?““
  - k5 w1: „„Ich spreche bis Ende des Monats mit den Volleyballern und lege dem Kassenwart die Zahlen vor. Dann gibt der Vorstand das Training frei.““

### M6 – `l-09`: Der Weg über `k1b` bricht die Zeitlinie
- **Datei:** `lagen-2.json`, `gespraech-l-09` › `k1b` › wahl 1 → `k2`
- **Zitate:**
  - k1b: „Mittwoch, 21 Uhr … Lenas Schulung hast du verschoben.“
  - w1: „Können wir morgen um acht kurz sprechen?“ → k2 und k3: „Tarek macht **Mittwoch** die Schulung“
  - k4: „bis **Mittwochmittag** Bescheid“
  - ende1: „gut, dass Sie es **am Dienstag** gleich gesagt haben“
- **Begründung:** Auf diesem Weg ist es Donnerstag früh. Schulung und Mittwochmittag liegen in der Vergangenheit, und am Dienstag wurde nichts gesagt.
- **Ersatz:** k1b › wahl 1 `"weiter": "ende4"` mit neuem Knoten:
  - sagt: „Donnerstag, acht Uhr. Dr. Albers ruft Frau Köhler selbst an und gibt dir bis Freitagmittag. Lenas Schulung holt ihr nächste Woche nach.“
  - ende: „Spät, aber ehrlich – das hat die Lage gerettet. Am Dienstag wäre es eine Planungsfrage gewesen. Beim nächsten Mal: Lage und Folge gleich nennen, mit Vorschlag.“

### M7 – `l-15` k4b → k5: Der Nutzer kennt Miriams Interesse nicht
- **Datei:** `lagen-3.json`, `gespraech-l-15` › `k4b` › wahl 1 (`weiter: k5`)
- **Begründung:**
  - Auf dem Weg k3 › wahl 1 („ich bin wohl zu empfindlich“) → k4b → k5 hat Miriam nie gesagt, dass sie freitags früh gehen muss.
  - k5 w1 („Du willst freitags pünktlich los“) und k5 w3 („ist ja für deine Mutter“) setzen das aber voraus.
- **Ersatz:** k4b › wahl 1 `"weiter": "k4"` und k4 sagt wegneutral: „Miriam wird ernster: „Hm. Okay.“ Pause. „Und die Freitage … ehrlich: …“ (Rest wie M9)“.

### M8 – `l-15` k3 und k6: Miriam antwortet auf Ungesagtes
- **Datei:** `lagen-3.json`, `gespraech-l-15`
- **k3b › wahl 2** „„Na, die Freitage halt!““ → k3: Miriam lacht über „Arbeitstier“. Das Wort ist auf diesem Weg nie gefallen.
  - Ersatz: „„Na, die Freitage halt! Und das ‚Arbeitstier‘.““
- **k5 › wahl 2** „„Gib mir die Sachen einfach früher.““ → k6: „Donnerstag zwölf … das klappt meistens.“ Donnerstag zwölf hat auf diesem Weg niemand genannt.
  - Ersatz k6 sagt: „Miriam: „Früher – sagen wir Donnerstag zwölf? Das klappt meistens. Und wenn freitags mal was Dringendes von Kunden kommt?““

### M9 – Miriams Mutter: `v-0150` und `l-15` widersprechen sich
- **Dateien:** `vorrat-03.json` `gespraech-v-0150` › k2; `lagen-3.json` `gespraech-l-15` › k4 und k4 › wahl 2
- **Zitate:**
  - v-0150: „Sonntags besuche ich meine Mutter im Pflegeheim. Das ist **der einzige Tag**, an dem ich hinkomme.“, Nutzer: „Das wusste ich nicht.“
  - l-15: „Seit meine Mutter gepflegt wird, muss ich **freitags** um halb fünf los. Ich hab mich nicht getraut, das zu sagen.“, Nutzer: „Oh – das wusste ich nicht.“
- **Begründung:**
  - „Einziger Tag sonntags“ und „freitags muss ich los“ schließen sich aus.
  - Wer v-0150 gespielt hat, erlebt in l-15 dieselbe Enthüllung ein zweites Mal.
  - Abgleich über `src/coach/inhalt/`:
    - Sonst erwähnt nur `antrieb-fc-005` Miriams Mutter („Eigentlich will das [Beförderung] vor allem ihre Mutter“). Das ist vereinbar.
    - Weitere Familie: „mein Freund“ (`l-04`), eine Schwester (`2-03-a`). Kein Widerspruch.
    - Pflegeheim kommt außerdem bei Carlas Vater (`smalltalk/einheiten-2`) und Petersens Frau (`smalltalk/vorrat-02`) vor. Das Motiv häuft sich, ist aber kein Fehler.
- **Ersatz** (wegunabhängig, gleich ob v-0150 gespielt wurde):
  - v-0150 k2: „Miriam, leiser: „Meine Mutter braucht seit dem Sommer Pflege. Sonntags bin ich bei ihr – am Wochenende ist das der einzige Tag, an dem ich länger bleiben kann.““
  - l-15 k4 (ab „Und die Freitage“): „„Und die Freitage … ehrlich: Freitags bin ich mit der Pflege meiner Mutter dran, ich muss um halb fünf los. Ich hab mich nicht getraut zu sagen, dass ich deshalb so viel bei dir ablade.““
  - l-15 k4 › wahl 2: „„Oh – dass die Freitage daran hängen, wusste ich nicht. Danke, dass du's sagst. Dann lass uns etwas finden, das für uns beide passt.““

### M10 – `l-13` ende3 ist auf zwei Wegen falsch
- **Datei:** `lagen-3.json`, `gespraech-l-13` › `ende3`
- **Zitat:** sagt „Nächster Monat. Die Zahlen kommen **wieder am Mittwoch**, wieder ohne Warnung.“; ende „… die Ursache blieb ungelöst. Beim nächsten Mal: fragen, woran es liegt …“
- **Begründung:**
  - Über k5 › wahl 3 („Gut, dann Mittwoch zehn.“) ist Mittwoch jetzt der vereinbarte Tag. „Wieder am Mittwoch“ ist dort kein Fehler mehr.
  - Über k5 › wahl 1 und wahl 3 wurde nach der Ursache gefragt.
  - Über k3 › wahl 3 („Dann bestell ich die Lagerdaten künftig selbst“) ist die Ursache auf Kosten des Nutzers gelöst.
- **Ersatz:**
  - ende3 sagt: „Nächster Monat. Die Zahlen kommen wieder zu spät – wieder ohne Warnung.“
  - ende: „Kein Drama – aber die Absprache hatte eine Lücke: ein Termin, der nicht zur Lage passt, oder keine Frühwarnung. Beim nächsten Mal: nach der Ursache fragen und alle fünf Fragen klären.“
  - k3 › wahl 3 → neues `ende6`:
    - sagt: „Die Zahlen kommen pünktlich – weil du jeden Monat Montagabend selbst die Lagerdaten holst.“
    - ende: „Gelöst, aber auf deine Kosten. Beim nächsten Mal: die Ursache gemeinsam angehen und die Absprache neu treffen.“

### M11 – `v-0150`: Der Advent hat vier Sonntage (vorrat-03)
- **Zitate:** Lage „… fehlt noch jemand für zwei Sonntage … Du bist schon dreimal dran.“; k1 › wahl 3 rueck „Fünf Sonntage im Advent.“; k3 › wahl 1 „du die Samstage am 7. und 14.“ (im Dezember 2026 kein Samstag); ende1 „Am ersten Samstag bringt Miriam dir einen Kaffee“ (samstags arbeitet nach dem Tausch Miriam).
- **Ersatz:**
  - Lage: „Im Dienstplan für Dezember sind noch zwei Sonntage offen. Miriam hat alle Sonntage gestrichen. Du hast schon zwei übernommen.“
  - rueck: „Alle vier Sonntage für dich – und kein Wort darüber, warum. Der Groll wächst mit jedem.“
  - ende2 sagt: „Du arbeitest alle vier Sonntage …“
  - k3 › wahl 1: „du die ersten beiden Samstage, ich die beiden offenen Sonntage“
  - ende1: „Am Montag danach bringt Miriam dir einen Kaffee an den Platz.“

### M12 – `v-0142` (Fahrradkeller), k3 › wahl 2 → ende2 (vorrat-03)
- **Zitat:** ende2 „Dein Rad steht jetzt im Hof. Der Gang im Keller ist trotzdem zugestellt.“
- **Begründung:** Über k2/k2b → k3 → „Das regelt sich schon.“ hat der Nutzer sein Rad nie in den Hof gestellt.
- **Ersatz:** ende2 sagt: „Eine Woche später ist der Gang im Keller immer noch zugestellt. Frau Sommer klingelt wieder.“

### M13 – `l-06` k2 › wahl 3 → k3: „Danke“ ohne Lob, und die Fahrt im Büro
- **Datei:** `lagen-2.json`, `gespraech-l-06`
- **k2 › wahl 3:** Auf „Fangen wir lieber gleich mit dem Problem an, das Positive kennst du ja selbst.“ antwortet Lena in k3: „Lena lächelt vorsichtig: „Danke. Und das dritte?““. Es gab kein Lob, für das sie danken könnte.
  - Ersatz k3 sagt: „Lena, vorsichtig: „Und der Punkt, den wir klären sollten?““
- **k4b › wahl 2:** „Schweigend weiterfahren.“ Über k1b (am nächsten Morgen, im Büro) sitzt ihr nicht im Auto.
  - Ersatz: „Nichts mehr sagen.“ und in k4b „Sie schaut aus dem Fenster“ → „Sie schaut weg“.

---

## Sollte

### S1 – Erratbarkeit: Die beste Antwort ist meist die längste
- **Zählung** (Fragen mit ≥ 3 Antworten, Prüfskript-Regel „höchstens die Hälfte“):
  - neue Tests fc-025…040: **10 von 16**
  - `einheiten-2`: **6 von 8**
  - `einheiten-3`: **6 von 7**
  - `lagen-2`: alle Knoten **32 von 42**
  - `lagen-3`: alle Knoten **32 von 40**
  - `vorrat-04`: die beste Antwort ist in 27 von 28 die längste oder zweitlängste
  - Dialoge in `vorrat-03`: 12 von 16 Knoten
- **Begründung:** Wer „nimm die längste, außer sie ist aufgebläht“ wählt, trifft fast immer. Dazu meldet `--soll` 12 Wahlen über 140 Zeichen, fast alle davon beste Antworten.
- **Ersatz** (Beispiele, Muster gilt überall):
  - Beste Antworten kürzen:
    - l-08 k3 w2: „„Ich mach die Abrechnung im alten System, bis die Verbindung steht. Am 25. schauen wir zusammen drauf.““
    - l-15 k5 w1: „„Du willst freitags pünktlich los, ich brauch meine Abende. Was Freitag fertig sein soll, kommt bis Donnerstag zwölf?““
    - l-13 k5 w2: „„Ich frag Lena nach den Daten bis Montag 18 Uhr. Du lieferst Mittwoch zehn, Warnung Dienstagmittag. In einem Monat schauen wir drauf.““
  - Falsche Antworten verlängern:
    - l-09 k2 w1: „„Das müssen Sie entscheiden, was wichtiger ist – ich mach dann einfach, was Sie sagen.““
    - fc-030 w2: „„Und wer soll sie dann machen, wenn jeder so denkt wie du?““
  - Weitere Vorschläge: Fork-Bericht zu vorrat-03 (v-0142, 0143, 0150, 0151) und vorrat-04 (v-0177, 0210, 0213, 0218, 0232).

### S2 – „Chefin“ und festgelegte Geschlechter der Vorgesetzten
- **Stellen:**
  - `2-06` aha: „lässt die Chefin rechnen … macht ihr die Entscheidung leicht“. In derselben Einheit ist der Chef Dr. Albers („er“), und `08` hält fest: „Besetzung hat keine Chefin“.
  - `fc-032`: „erfährt deine Chefin es zu spät“, „der Chefin sagen“
  - `v-0162`, `v-0246`–`v-0248`: „deiner Vorgesetzten“ bzw. „deinem Chef … Er“ beim *eigenen* Vorgesetzten des Nutzers
- **Ersatz:**
  - 2-06 aha: „Wer nach oben nur „zu viel“ sagt, lässt den Chef rechnen. Wer Lage, Folge, Möglichkeiten und einen Vorschlag bringt, macht ihm die Entscheidung leicht – und schlechte Nachrichten früh sind halb so schlimm.“
  - fc-032: „deine Führungskraft“ bzw. „Dr. Albers“
  - v-0162/0246/0247: „deiner Führungskraft“
  - v-0248: „Dein Gegenüber schaut auf die Uhr.“
- **Auch:** v-0157 „als Einzige“ → „Außer dir hat niemand widersprochen.“; v-0204 „die Letzte im Büro“ → „bis zuletzt im Büro“.

### S3 – `l-06` ende2 passt nicht auf jedem Weg
- **Zitat:** „Lena war seit dem Termin auffallend still.“ / „Beim nächsten Mal: fragen, ob sie Rückmeldung will, Lob konkret, … Kritik an dir annehmen, statt dich zu verteidigen.“
- **Begründung:** Über k6 › wahl 2 („Abwarten“) nach einem guten Gespräch und über k1b › wahl 2 (gar keine Rückmeldung) stimmen weder „still“ noch der Rat.
- **Ersatz:**
  - sagt: „Zwei Wochen später ruft Frau Köhler an: Die Lieferung ist nicht da.“
  - ende: „Kein Drama – aber am Ende hat sich nichts geändert: Der Termin blieb falsch oder Lena blieb gekränkt. Beim nächsten Mal: bald und konkret zurückmelden, Kritik an dir annehmen – und den Termin gleich geraderücken.“

### S4 – `l-07` (Tante Renate): drei Wegbrüche
- **k1b › wahl 1** führt zu k2, dort sagt Renate „Am wichtigsten? …“. Die Frage wurde nie gestellt.
  - Ersatz: „Anrufen: „Ich muss ehrlich sein: Das Ganze schaffe ich nicht. Einen Teil übernehme ich gern. Was ist dir am wichtigsten?““
- **k3 › wahl 3** („Dann frag doch die anderen auch mal.“) über k2 › wahl 2: Renate fragt in k4 „die Einladungen – bis wann?“. Angeboten wurden die Einladungen nie.
  - Ersatz k4 sagt: „„Deine Cousine kocht ja gern, die frag ich. Und die Einladungen – machst du die? Bis wann?““
- **ende2** über k1 › wahl 3 → k2 › wahl 1 (Nein mit Angebot gesagt, dann der Schuld nachgegeben): Der Rat „klar Nein zum Ganzen, ein Angebot“ trifft hier nicht.
  - Ersatz: „… Beim nächsten Mal: klar Nein zum Ganzen, ein Angebot für einen Teil – und dabei bleiben, auch wenn Schuld ins Spiel kommt.“

### S5 – `l-08` ende2 über k3 › wahl 1
- **Zitat:** „Dr. Albers fragt, warum das keiner vorher gesehen hat.“ / „dein Wissen kam nicht an“
- **Begründung:** Auf diesem Weg hat der Nutzer das Problem gesehen und gesagt; Carla hatte schon zugestimmt.
- **Ersatz:**
  - sagt: „… Dr. Albers will wissen, wie das passieren konnte.“
  - ende: „Kein Drama – aber aus deinem Wissen ist keine Lösung geworden. Beim nächsten Mal: früh, gewürdigt, konkret – nach dem Interesse fragen und die Lösung als Absprache festhalten, statt nachzugeben, recht zu behalten oder abzuschieben.“

### S6 – `l-10` (Sparring k): Fazit und Logik auf Nebenwegen
- **ende1** „danke, dass Sie Wort gehalten haben“, „Am Nachmittag ist die Bestellliste geändert“, Fazit „ein Nein nach oben“.
  - Begründung: Über k3b hat der Nutzer sein Wort gebrochen und kein Nein nach oben gesagt. Über k5 › wahl 2 hat niemand die Liste angestoßen.
  - Ersatz sagt: „Mittwoch, 7:40 Uhr. Herr Petersen quittiert die richtigen Dichtungen: „Na also.““
  - Ersatz ende: „Kritik angenommen, nach oben ehrlich, nach der Ursache gefragt, Interessen statt Rang – und Absprachen mit Uhrzeit. Wo es heute gehakt hat, zeigt dir die Auswertung.“
- **ende3** über k5 › wahl 1 → k7 › wahl 2: „Im nächsten Monat vertauscht die Bestellliste wieder eine Größe“ / „nach der Ursache fragen“. Die Ursache ist hier schon gefunden.
  - Ersatz: k7 › wahl 2 → neues Ende, sagt „Mittwoch früh wird es eng: Tarek wartet zwanzig Minuten auf den Wagen.“, ende „Gelöst, aber knapp. Beim nächsten Mal: jede Lösung mit Uhrzeit festhalten.“
- **k3 › wahl 2** „Wir können per Kurier liefern“. Wenn der Lieferant erst Mittwoch liefert, hilft kein Kurier.
  - Ersatz: „„… Wir können Mittwoch fest zusagen oder die Dichtungen Mittwoch früh selbst vorbeibringen. Ich würde sie selbst bringen – um acht ist er versorgt.““ (passt zu k7).

### S7 – `l-11` ende1: „Den Zerstörer nicht erwidert“ stimmt nicht auf jedem Weg
- **Begründung:** Über k1 › wahl 1/2 → k2b › wahl 1 wurde erwidert und dann repariert.
- **Ersatz ende:** „Ob gleich oder nach einem Reparaturversuch: den Zerstörer nicht weiter erwidert, ruhig eingestiegen und eine Lösung über die Interessen gefunden – so wird aus einem Dauerstreit eine Absprache.“

### S8 – `l-12` ende2 über k5b › wahl 2
- **Zitat:** „die unfairen Züge haben gewirkt“
- **Begründung:** Auf diesem Weg scheitert der Antrag an fehlender Zuständigkeit, nicht an den unfairen Zügen.
- **Ersatz:** „Kein Drama – aber der Antrag ist versandet: durch unfaire Züge oder weil niemand zuständig war. Beim nächsten Mal: jeden Zug ruhig benennen, zur Sache zurück – und mit wer, was, bis wann schließen.“

### S9 – `l-14` (Jule): Musterabsprache ohne Betrag, Fazit nicht wegneutral
- **k3 › wahl 1** „Ab Januar jeweils zum Monatsersten …“ nennt keinen Betrag. ende3 fordert aber „Datum, Betrag, und was passiert, wenn es hakt“.
  - Ersatz: „„Das passt. Ab Januar jeden Ersten ein fester Teil – ein Viertel? Wenn's mal nicht klappt, sagst du's vorher. Schreiben wir's kurz auf?““ (keine festen Geldbeträge, `08`).
- **ende1** „Ein sanfter Einstieg, Schuldgefühle erkannt …“ stimmt nicht über k1 › wahl 2 (harter Einstieg, dann repariert) und nicht ohne k3b (keine Schuldgefühle im Spiel).
  - Ersatz: „Dein Anliegen gehalten, Jules Lage gehört und eine Absprache mit Datum und Plan B: Das aufgeschobene Gespräch hat die Freundschaft geschützt, nicht gefährdet.“

### S10 – `l-15` ende1 und ende3
- **ende1:** Das Fazit („Sanft eingestiegen … Absicht von Wirkung getrennt“) stimmt nicht über k1 › wahl 2 → k2b › wahl 1 und nicht über k3 › wahl 1.
  - Ersatz: „Ein ehrliches Anliegen, Beobachtung statt Urteil, Spitzen nicht erwidert, Kritik angenommen und eine Absprache mit Plan B: Das aufgeschobene Gespräch hat euch näher gebracht. Das ist Meisterschaft.“
- **ende3** („Zwei Wochen lang kommen die Aufgaben früher“, „die Absprache war zu weich“) passt nicht über:
  - k5 › wahl 3 („Ich übernehm's halt weiter“). Ersatz: `weiter: "ende2"`.
  - k4c › wahl 2 (es gab keine Absprache). Ersatz ende3: „Ein Anfang – aber ohne feste Absprache. Beim nächsten Mal: eine Lösung für beide, mit Uhrzeit, dem Fall „wenn es hakt“ und einem Termin zum Draufschauen.“

### S11 – Dialoge in Einheiten: Enden nicht wegneutral
- **`2-02-b` ende2** „Beim nächsten Mal: erst danke und ein Beispiel …“. Über k1 › wahl 2 (danke und Beispiel) → k2 › wahl 2/3 passt der Rat nicht.
  - Ersatz: „Kein Drama – aber Tarek hat nicht das Gefühl, dass sein Punkt angekommen ist. Beim nächsten Mal: den wahren Teil annehmen und eine Abmachung anbieten.“
- **`3-01-c` ende1** „Spott nicht erwidert, sondern benannt“. Über k1 › wahl 1/3 → k2b › wahl 1 stimmt das nicht.
  - Ersatz: „Ob gleich oder nach einem Reparaturversuch: den Spott nicht weiter erwidert, nach dem Wozu gefragt und einen Vorschlag für beide gemacht – so wird aus Verachtung wieder ein Gespräch.“
- **`3-01-c` ende2:** Über k1 › wahl 2 → k2 › wahl 2 ist das Benennen schon geschehen.
  - Ersatz: „Kein Drama – aber ein Zerstörer hat gewirkt: Spott, Abwerten oder Rechthaben. Beim nächsten Mal: nicht erwidern, sein Gefühl ernst nehmen, einen Vorschlag für beide machen.“

### S12 – `3-04` vergleich: Der Termin zum Draufschauen liegt nach der Frist
- **Zitat:** „… bis Mittwoch zwölf Uhr … Donnerstag um neun schauen wir kurz drauf.“
- **Begründung:** Der Bauplan derselben Einheit sagt „Ein kurzer Termin vor der Frist“, und Muster 2 macht es richtig (Dienstag 16 Uhr).
- **Ersatz:** „Dienstag um neun schauen wir kurz drauf.“, ebenso Merkkarte m2.

### S13 – `2-04-a` (zuordnen): zwei Karten mit fast gleichem Inhalt in verschiedenen Fächern
- **Zitate:** „„Ein Jahr bei dir, ein Jahr bei mir.““ (Möglichkeit) / „„Wer letztes Jahr gefeiert hat, ist diesmal nicht dran.““ (Maßstab)
- **Begründung:** Beides ist dieselbe Wechselregel. Wer die eine einordnet, muss bei der anderen raten.
- **Ersatz Karte 3:** „„Wer die Eltern übers Jahr seltener sieht, hat Vorrang.““ (Maßstab)

### S14 – Wissens-Seite: kein Eintrag zu künstlichem Zeitdruck und Dauerreden
- **Begründung:** Der Bereich übt beides (`3-03-a`, `l-12`, `v-0222`, `v-0227`), auf der Wissens-Seite steht dazu nichts. Taktik und rote Linie sollen dort „vollständig erklärt“ sein (`08`, LIESMICH §7).
- **Ersatz:** Neuer Eintrag `gespraech-w-059`:
  - `art: taktik`, `gruppe: "Rote Linie – erkennen und abwehren"`, `einfluss: rot`, `beleg: P`, `quellen: ["praxis-gespraech"]`, `faehigkeiten: ["gespraech.widerspruch"]`
  - titel: „Erfundener Zeitdruck“
  - text: „„Ich brauch das bis heute Abend“ – obwohl es Zeit hätte. Wer eine Eile erfindet, nimmt dir die Zeit zum Prüfen. Eine echte Frist ist fair und gehört gesagt.“
  - preis: „Entscheidungen unter erfundener Eile werden schlechter – und fliegt sie auf, ist das Vertrauen weg.“
  - abwehr: „Nach der echten Frist fragen: „Bis wann genau, und was passiert sonst?“ – und dir die Zeit nehmen, die die Entscheidung braucht.“
- Den Satz zum Dauerreden in `w-056` ergänzen: „… Unterbrechen, Dauerreden, Themenwechsel, Spott …“.

### S15 – Weitere Befunde aus `vorrat-03` (Kurzfassung, Ersatztexte im Fork-Bericht)
- **v-0151** (Küche im Gemeindehaus):
  - k2 beantwortet eine nicht gestellte Frage.
  - ende1 „Zwei Fragen …“ stimmt auf keinem Weg.
  - Ersatz ende1: „Nachfragen statt Reihenfolge: Als klar war, wie oft und wofür Jule die Küche braucht, war kein Streit mehr nötig.“
- **v-0143** (Woche mit Lena):
  - ende3 passt nicht auf k1 › w2 → k2 › w2.
  - k2b › w2 „Dann soll Dr. Albers eben entscheiden.“ ist hier wert 1, in v-0138 aber wert 0 → wert 0, tendenz `vermeiden`.
- **v-0156:** Die beste Antwort entscheidet im Familienchat über Renates Kopf hinweg.
  - Ersatz: „Renates Garten ist der schönste. Ich mach mir nur Sorgen um ihren Rücken – Renate, wär's dir lieber, wir feiern diesmal bei uns und du bringst den Kuchen?“

### S16 – Weitere Befunde aus `vorrat-04` (Kurzfassung)
- **v-0182 (rangfolge):** Die Pause mit Rückkehr steht hinter dem Reparatursatz. Das widerspricht v-0177. Ersatz für Eintrag 2: „„Lass uns später weiterreden.““ mit warum „Nimmt Hitze raus – ohne Uhrzeit bleibt die Rückkehr aber offen.“
- **v-0223:** „Lauter weiterreden, bis er aufhört.“ als wert 1 ist nicht brauchbar. Ersatz: „„Moment, ich war noch nicht fertig.““ (wert 1).
- **v-0229, v-0242:** Sven als Mitbewohner verträgt sich nicht mit Svens eigener neuer Wohnung (`vorrat-01`). Ersatz: „dein Mitbewohner“, namenlos.
- **v-0184:** „gleicht wochenlange Liegen nicht aus“ → „hebt wochenlanges Liegenlassen nicht auf“.

### S17 – `l-09` und `v-0168`/`v-0171`: Die beste Antwort klingt wie die Falle, die der Bereich lehrt
- **Zitat:** l-09 k2 › wahl 3: „„Entweder schiebe ich den Bericht auf Montag, oder Tarek übernimmt die Schulung. Ich würde den Bericht schieben.““
- **Begründung:** Das ist eine **echte** Wahl nach oben und damit fair. Der Bereich lehrt aber in w-057 und 3-03 „Entweder-oder = Falle“. Gleich klingende Musterantworten machen die neue Abgrenzung unscharf. Eine offene Tür zeigt den Unterschied.
- **Ersatz:** „„Zwei Wege sehe ich: den Bericht auf Montag oder Tarek übernimmt die Schulung. Ich würde den Bericht schieben – oder sehen Sie einen anderen?““ (v-0168 sinngemäß, siehe Fork-Bericht K1).

### S18 – Tarek bricht zu oft Absprachen
- **Stellen:** `3-04-b` („zum dritten Mal nicht eingehalten“), `l-13`, `v-0238`, `v-0240`, `v-0244`
- **Begründung:** In `besetzung.json` ist Tarek „Spaßvogel, hilfsbereit“. In Phase m wird er zur festen Figur des Unzuverlässigen.
- **Ersatz:** In `3-04-b` und in einer der Vorratsaufgaben eine namenlose Rolle wählen („ein Kollege aus dem Vertrieb“).

### S19 – Wahlen über 140 Zeichen in Gesprächen (Prüfskript-Hinweise)
- **Stellen:** l-06 k2, l-07 k4, l-08 k1/k3, l-09 k1, l-10 k3, l-13 k4/k5, l-15 k2/k5, v-0142 k2
- **Ersatz:** kürzen. Das behebt zugleich einen Teil von S1; Beispiele dort.

---

## Kann

1. **`3-01-a`:** „„Moment – das kam falscher raus, als ich es meinte.““ → „„Moment – das kam schärfer raus, als ich es meinte.““
2. **`3-02-b`:** „„Ich hatte ihn eigentlich um zwei erwartet.““ (Selbstkundgabe) lässt sich auch als Sache lesen. → „„Ich ärgere mich, weil ich ihn heute noch durchsehen wollte.““
3. **`3-02-d`:** Die beste Antwort ist eine geschlossene Zweierfrage („Interessant gut oder interessant schlecht?“), die offene Frage bekommt nur wert 1. Phase 1 lehrt „offen fragen“. → warum zu wert 1: „Offen und gut. Auf ein knappes „Interessant“ folgt darauf aber oft wieder nur ein knappes „Na ja“ – die Frage mit beiden Deutungen macht es ihm leichter, Farbe zu bekennen.“
4. **`3-03` m3:** Merkkarte zur roten Linie ergänzen: „… ein Nein übergehen, ein falsches Entweder-oder, erfundener Zeitdruck. …“
5. **`3-04-c`, Muster 1:** „Fertig: Buffet … steht um 15 Uhr. Bis: Samstag 14:30 Uhr aufgebaut.“ → „Fertig: Buffet für vierzig Leute steht. Bis: Samstag 14:30 Uhr.“
6. **`2-06` gegen `w-041`** („Ein Problem darf ohne Lösung kommen“): In der Karte ergänzen: „Hast du noch keine Lösung, bring trotzdem Lage und Folge – früh ist wichtiger als fertig.“
7. **`2-06` geschichte:** Bruno erzählt von „Carla Demir hat mir mal erzählt“. Bruno kennt die Arbeitsfiguren sonst nicht persönlich. → „Kennst du Carla Demir, die Projektleiterin? Die hat mal …“, oder als „Stell dir vor“-Geschichte.
8. **`2-06` belegHinweis:** „zeigen kleinere Studien“ – zitiert ist nur `milliken2003` (Interviews). → „zeigt eine Interviewstudie“.
9. **`l-09` k4 › wahl 2** rueck: „Gerade bei Neukunden hakt oft etwas.“ – Frau Köhler ist keine Neukundin mehr. → „Gerade bei Angeboten hakt oft etwas.“
10. **`l-10` k6 › wahl 1:** „heute früh in der Runde“ stimmt über k3b (Dienstag) nicht. → „in der Runde“.
11. **`l-07` k4 › wahl 2:** „Du schickst mir die Gästeliste bis Ende Januar“ – über k1b sitzt der Nutzer schon an der Gästeliste. Folgt aus S4, wenn k1b einen eigenen Ausgang bekommt.
12. **`l-07` und `ausdruck/lagen-3`:** Renates Siebzigster findet dort „im Gasthaus“ statt, in l-07 kocht die Cousine. Ist der „Runde“ derselbe Geburtstag, l-07 ende1: „Im März, im Gasthaus. Die Einladungen waren pünktlich …“ und k3 „Wer könnte das Essen übernehmen?“ → „Wer kümmert sich ums Gasthaus?“.
13. **`l-14`:** „„Plötzlich? Es ist seit Juli fällig!““ – vereinbart war „bis zum Sommer“. → „seit dem Sommer fällig“. Außerdem in ende1 unklar, wer spricht: „– „Ein Monat reicht völlig.““ → „Du lachst: „Ein Monat reicht völlig.““. In ende3 die Zeitform: „Im Mai kommt eine Überweisung, danach keine mehr.“
14. **`l-11`** rueck „Spott ist der giftigste der vier Zerstörer“ – die Quelle `gottman1999` ist ungeprüft. → „Spott gilt in der Paarforschung als besonders schädlich.“
15. **Haushalt des Nutzers uneinheitlich:**
    - Mitbewohner (l-11, 3-01-b), Mitbewohnerin (fc-028), Partner (fc-039), Eigentümerversammlung (fc-031)
    - in `smalltalk` „Frau Sommer unter mir“
    - Jede Stelle ist für sich ein Gedankenspiel, zusammen ergibt sich aber ein wechselnder Haushalt. fc-028 → „Eine Nachbarin fragt …“ und fc-039 neutral („die Person, mit der du zusammen bist“, warum „verteidigt sich“).
16. **`fc-026`** warum: „Ein Widerspruch beweist gerade, dass du nicht zugehört hast.“ → „Ein Widerspruch zeigt ihr eher, dass du gerade nicht zuhörst.“
17. **`quellen.json`:**
    - `greitemeyer2009` ohne Link → `"link": "https://doi.org/10.1002/ejsp.578"`, Seiten 639–647 ergänzen.
    - `nemeth2001`: Band und Seiten nachtragen, wenn bestätigt.
18. **`wissen.json`:** Die zwölf neuen Einträge hängen am Ende der Datei statt bei ihrer Art (Hebel 015–018 hinter den Spickzetteln). Falls die Seite nach Dateireihenfolge sortiert, einsortieren.
19. **`v-0108`:** Frau Sommers Katze füttern – in `ausdruck/vorrat-04` ist ihr Kater gestorben. → „ihre Blumen gießen“.
20. **`v-0128`:** Muster erfindet „Mittwoch“. **`v-0095`:** warum ohne Quelle („wirkt Dank meist stärker, als man glaubt“). Ersatz im Fork-Bericht.
21. **`v-0185`, `v-0205`, `v-0206`, `v-0219`, `v-0230`, `v-0176`:** Sprach- und Feinschliff laut Fork-Bericht vorrat-04, z. B. „als fühlst du dich“ → „als fühltest du dich“.
22. **Inventur-Lage wiederholt sich:** `2-06-b`, `v-0143`, `v-0169`, `v-0171`, `einheiten-1`. Bei v-0169/0171 einen anderen Anlass wählen (Messe, Systemumstellung).

## Figuren-Abgleich über `src/coach/inhalt/` (Auftrag 2)

- **Miriams pflegebedürftige Mutter** (v-0150, l-15): Widerspruch untereinander → **M9**. Sonst nur `antrieb-fc-005` („Eigentlich will das vor allem ihre Mutter“) – vereinbar. Übrige Familie: Freund (`l-04`), Schwester (`2-03-a`). Kein Widerspruch.
- **Jules „Kredit“ fürs Café (l-14):** Es ist **kein Kredit**, sondern Geld, das der Nutzer Jule „im Frühjahr … für die Kaffeemaschine ihres Cafés geliehen“ hat.
  - „Kredit“ kommt im ganzen Inhalt sonst nur in `smalltalk-fc-033` vor (Hauskauf eines Freundes) und als Redewendung in `stimme/wissen.json`. Keine Überschneidung.
  - Café-Zeitlinie (`smalltalk`: Job gekündigt, „Café am Markt übernehmen“; `ausdruck`: schwere erste Monate, Flyer; `gespraech-1-03`: erster Tag im Café; `v-0151`: Workshops, Ofen): mit „Frühjahr geliehen, November nachgefragt, zweite Theke“ **vereinbar**.
  - `besetzung.json` nennt Jule „Bekannte aus dem Kochkurs“, l-14 „Freundin“. Mit der Zeit plausibel, ebenso der Kochkurs als Ort.
- **Tante Renate:** runder Geburtstag im März (l-07) gegen Siebzigster „im Gasthaus“ (`ausdruck`) → Kann 12.
- **Herr Petersen** (l-10, „hört nicht mehr gut“), **Frau Köhler** (l-06, l-09), **Lena** (neu, wird eingearbeitet) und **Carla** (Projektleiterin) passen. **Sven** als Mitbewohner nicht → S16. **Tarek** → S18.

## Urteil

**Freigabereif: nach den Muss-Befunden ja.**
- M1–M5 setzen die neue Einfluss-Regel um, betreffen nur Klasse, Erklärung oder Karten und lassen sich ohne Strukturänderung erledigen.
- Für M6, M10 und M7 braucht es je einen neuen End-Knoten oder ein geändertes `weiter`.
- M9 (Miriams Mutter) betrifft zwei Dateien.

Die Sollte-Befunde S1 bis S11 (Erratbarkeit und wegneutrale Enden) sind der größte Hebel für die Qualität. Sie sollten vor der Freigabe für alle erledigt sein.

---

## Umsetzung (25.11.2026)

Geändert wurden nur Dateien in `src/coach/inhalt/gespraech/`, dazu `_index.json` über `node scripts/coach-index.mjs`. Kennungen blieben unverändert, gelöscht wurde nichts. Neu sind die End-Knoten `l-09 ende4`, `l-10 ende5` und `l-13 ende6` sowie der Wissens-Eintrag `gespraech-w-059`. Danach wurde jede Lage auf allen Wegen neu durchgegangen: eingehende Kanten je Ende geprüft, Rückmeldungen und Fazits wegneutral. Prüfskript: `--nur gespraech` → **0 Fehler**. Es bleiben 3 Hinweise, alle aus Phase 1 (`lagen-1 l-03`, `vorrat-02 v-0090`, `fc-014`). `--soll gespraech` meldet nichts darüber hinaus.

**Beste Antwort = längste** (Knoten/Fragen mit ≥ 2 Antworten, vorher → nachher):

| Datei | vorher | nachher |
|---|---|---|
| `lagen-2` | 32/42 | 17/42 |
| `lagen-3` | 31/40 | 17/40 |
| Tests fc-025…040 | 10/16 | 8/16 |
| `einheiten-2` | 6/9 | 3/9 |
| `einheiten-3` | 8/9 | 3/9 |
| `vorrat-03` | 22/36 | 16/36 |
| `vorrat-04` | 11/28 | 12/28 |

Die längste Antwort ist dabei höchstens in rund der Hälfte der Fälle eine falsche (keine Überkorrektur).

### Muss
- **M1 umgesetzt:** `w-057` ist jetzt `rot`, Gruppe „Rote Linie – erkennen und abwehren“. Text, Preis und Abwehr folgen dem Vorschlag, ergänzt um die Abgrenzung zur echten Wahl.
- **M2 umgesetzt, Variante „fair-Seite halten“:**
  - Karte 2 heißt jetzt „Lieber Dienstag oder Donnerstag?“ (Taktik).
  - Zeitdruck und Dauerreden gehören jetzt zur roten Linie.
  - Zermürben ist durch „Nach dem eigenen Angebot bewusst schweigen“ (Taktik) ersetzt.
  - Neue neunte Karte: „Das muss ich erst noch abstimmen.“ – und das stimmt (Taktik).
  - Ergebnis: fair 2 · Taktik 3 · rot 4.
- **M3 umgesetzt:** `3-03-b` ist jetzt `rot`, die Erklärung folgt dem Vorschlag.
- **M4 umgesetzt:**
  - `v-0220` und `v-0222` sind jetzt `rot`. Die Erklärung zu v-0222 sagt zusätzlich: Ob die Eile hier echt ist, weißt du noch nicht.
  - `v-0227`: Zeitdruck gehört jetzt zur roten Linie. Neu sind die Karten „Dienstag oder Donnerstag“ und „abstimmen“; die Protokoll-Karte ist entfallen. Ergebnis: 2/2/2.
  - `v-0184` ist jetzt `rot`, die Erklärung ist angepasst.
- **M5 umgesetzt:** k4 zeigt jetzt, dass der Zeitdruck erfunden ist (Halle bis 22 Uhr). Die Musterantwort stellt das ruhig richtig. k5 und k5 w1 sind angepasst (Freigabe nach geprüfter Hallenteilung), ebenso ende1. Das Prinzip heißt jetzt „erfundenem Zeitdruck nicht folgen“.
- **M6 umgesetzt:** `k1b` w1 → neues `ende4` (Donnerstag acht Uhr). Das Angebot ist auf Freitagmittag verschoben statt „gibt dir bis Freitagmittag“, weil Dr. Albers mit der Kundin spricht. ende1 ist jetzt nur noch über den Dienstag erreichbar.
- **M7 umgesetzt:** `k4b` w1 → `k4`. Der Text von k4 passt jetzt auf beide Wege („Hm. Okay – ich hör's.“ plus Freitage und Mutter).
- **M8 umgesetzt:** Die Antwort zu k3b nennt jetzt das „Arbeitstier“. k6 ist wegneutral: „Donnerstag zwölf als Grenze – das klappt meistens …“. Der Vorschlag „Früher – sagen wir Donnerstag zwölf?“ passte nicht auf den Weg über k5 w1.
- **M9 umgesetzt:** v-0150 k2 und l-15 k4 folgen dem Vorschlag. Die Antwort in l-15 k4 heißt jetzt „dass die Freitage daran hängen, wusste ich nicht“.
- **M10 umgesetzt:** ende3 ist wegneutral. Der Rat lautet jetzt „die Absprache an die Ursache anpassen“, weil auf zwei Wegen schon nach der Ursache gefragt wurde. k3 w3 → neues `ende6`.
- **M11 umgesetzt:** Dezember mit vier Sonntagen, „ersten beiden Samstage“, ende1 „Am Montag danach“. ende2 sagt zusätzlich „und deine Samstage obendrein“: Sonst arbeitet man auf dem besten Weg ebenfalls alle vier Sonntage, und das Ende unterschiede sich nicht.
- **M12 umgesetzt:** ende2 von v-0142 passt jetzt auch auf den Weg über k1 w3.
- **M13 umgesetzt:** k3 „Und der Punkt, den wir klären sollten?“, k4b „Sie schaut weg“, „Nichts mehr sagen.“ Außerdem:
  - k6 w3: „spätestens morgen um zehn“
  - ende1: „so früh“

  Beides, damit es auf dem Weg über k1b (am nächsten Morgen) stimmt.

### Sollte
- **S1 umgesetzt** (Zahlen oben): beste Antworten gekürzt, falsche bzw. brauchbare Antworten verlängert, ohne neue Tatsachen.
- **S2 umgesetzt:**
  - 2-06 aha: „den Chef … ihm“.
  - fc-032: Dr. Albers.
  - Konkrete Lagen mit eigenem Vorgesetzten → Dr. Albers („er“): v-0164, v-0166, v-0167, v-0172, v-0241, v-0251.
  - Allgemeine Übungen → „deine Führungskraft“ ohne Pronomen: v-0162, v-0246, v-0247, v-0248, v-0249. In v-0248 heißt die Störung „Dein Gegenüber schaut auf die Uhr“.
  - v-0157: „Außer dir hat in der Runde niemand widersprochen.“ v-0204: „bis zuletzt im Büro“.
  - **Nicht geändert (Phase 1):** `fc-0xx` „Die Chefin weiß es sicher“ (tests.json Z. ~398), `sb-4` „meiner Vorgesetzten“ und `vh-…` „bei einer Vorgesetzten“. Siehe offene Punkte.
- **S3 umgesetzt:** wie vorgeschlagen.
- **S4 umgesetzt:** k1b w1 mit Frage, k4 wegneutral („Bleiben die Einladungen – die übernimmst du? Bis wann?“), ende2-Rat ergänzt.
- **S5 umgesetzt:** wie vorgeschlagen. Zusätzlich ende1 wegneutral („Widersprochen, solange noch Zeit war …“), weil „erst gewürdigt“ über k1 w3 und k5 w1 nicht stimmte.
- **S6 umgesetzt:**
  - ende1 ohne „Wort gehalten“ und ohne geänderte Bestellliste. Das Fazit sagt jetzt, was erreicht ist und was trägt. Den Satz „zeigt dir die Auswertung“ habe ich nicht übernommen, weil nicht sicher ist, dass die App das tut.
  - k7 w2 → neues `ende5`; ende3 (nur noch über k5b w2) bekommt einen passenden Rat.
  - k3 w2: Kurier durch „selbst hinbringen – vor acht“ ersetzt.
  - ende2-Rat um „nur zusagen, was hält“ ergänzt (Weg über k3b).
- **S7 umgesetzt:** zusätzlich „nach einer Pause“ (Weg über k1c). „über die Interessen“ ist entfallen, weil es über k2 w1 (Putzplan) nicht stimmt.
- **S8 umgesetzt:** wie vorgeschlagen. Zusätzlich ist ende1 wegneutral formuliert, weil „jeden Zug ruhig benannt“ über k1 w1/w3, k2 w1 und k4 w3 nicht stimmte.
- **S9 umgesetzt:** Musterabsprache mit „ein fester Teil – ein Viertel?“ (kein Geldbetrag), ende1 wie vorgeschlagen.
- **S10 umgesetzt:**
  - ende1 lobt nicht mehr pauschal, sondern nennt, was trägt.
  - k5 w3 → ende2.
  - ende3: „ohne Absprache, die auch hält, wenn es hakt“ – passt auf k4c w2 und k6 w2.
- **S11 umgesetzt:** wie vorgeschlagen.
- **S12 umgesetzt:** Vergleich und Merkkarte m2: Dienstag um neun.
- **S13 umgesetzt:** „Wer die Eltern übers Jahr seltener sieht, hat Vorrang.“
- **S14 umgesetzt:** `w-059` „Erfundener Zeitdruck“ ist angelegt. Preis abgeschwächt: „Wer unter erfundener Eile entscheidet, prüft weniger …“ (keine Behauptung, die nicht belegt ist). Außerdem steht „Dauerreden“ jetzt in `w-056`.
- **S15 umgesetzt:**
  - v-0151: k2 nennt Häufigkeit und Zweck von sich aus, ende1 wie vorgeschlagen.
  - v-0143: k2b w2 auf `wert: 0`, `vermeiden`; ende3 wegneutral.
  - v-0156: wie vorgeschlagen, gekürzt auf ≤ 140 Zeichen.
- **S16 umgesetzt:**
  - v-0182 und v-0223 wie vorgeschlagen.
  - v-0229: „die Küche mach ich …“ statt eines Namens.
  - v-0242: „Mein Mitbewohner“.
  - v-0184: Wortlaut korrigiert.
- **S17 umgesetzt:** l-09 k2 w3 öffnet jetzt die Tür für einen dritten Weg. Ebenso v-0168 („Oder sehen Sie einen anderen Weg?“) und v-0171.
- **S18 umgesetzt:** 3-04-b „Ein Kollege aus dem Vertrieb“, v-0238 „Hör mal, wir müssen reden“, v-0240 „Ein Kollege aus dem Einkauf“, v-0244 „Ein Kollege aus dem Vertrieb“. Als Absprachebrecher bleibt Tarek nur in `l-13`, wo er verständlich und reuig auftritt.
- **S19 umgesetzt:** Keine Wahl in den neuen Lagen und Dialogen ist mehr länger als 140 Zeichen.

### Kann
- **Umgesetzt:**
  - 1 („schärfer“), 2 (Selbstkundgabe-Karte), 3 (warum zu wert 1, „leicht“ statt „oft“), 4 (Merkkarte m3), 5 (Muster).
  - 6: in der Karte 2-06 gekürzt, damit sie bei 420 Zeichen bleibt.
  - 7 (Geschichte), 8 (belegHinweis), 9, 10.
  - 11: Renate schickt jetzt „alle Adressen“. ende3 ist wegneutral („Jeder hat auf den anderen gewartet“), weil der Nutzer über k1b selbst an der Gästeliste saß.
  - 12: l-07 jetzt im Gasthaus. Die Cousine kennt den Wirt, k3 fragt „Wer kümmert sich ums Gasthaus?“.
  - 13, 14.
  - 15 teilweise: fc-028 „Eine Nachbarin“, fc-039 „Die Person, mit der du zusammen bist“ ohne Pronomen.
  - 16.
  - 17: Crossref bestätigt `nemeth2001` (31(6), 707–720) und `greitemeyer2009` (39(4), 639–647, DOI 10.1002/ejsp.578, als Link ergänzt).
  - 19 (Blumen gießen).
  - 20: v-0128 ohne „Mittwoch“. v-0095 begründet jetzt ohne Wirkungsbehauptung.
  - 21 teilweise: v-0219 „fühltest“, v-0205 aufgeblähte Antwort gekürzt. v-0176, v-0185, v-0206 und v-0230 habe ich durchgesehen und keinen Fehler gefunden. Der Fork-Bericht lag nicht vor.
  - 22: v-0169 Umzug ins neue Lager, v-0171 Messevorbereitung.
- **Bewusst nicht:**
  - **15 (Rest):** Der Mitbewohner in l-11/3-01-b, die Mitbewohnerin in v-0206 und die Eigentümerversammlung in fc-031 bleiben. Es sind einzelne Gedankenspiele, nichts davon ist ein Widerspruch.
  - **18:** Die Wissens-Seite filtert und sortiert nach `art` (`Bereichsseite.tsx`), die Reihenfolge in der Datei ist ohne Wirkung.

### Offene Punkte für den Hauptstrang
- **Phase-1-Stellen mit „Chefin“/„Vorgesetzte“** in `tests.json` (Stufe 1, nicht angefasst):
  - ein Szenario vor fc-025 („Die Chefin weiß es sicher“)
  - `sb-4` („meiner Vorgesetzten“)
  - ein Verhaltens-Item („bei einer Vorgesetzten“)

  Beim nächsten Phase-1-Durchgang auf „Führungskraft“ oder Dr. Albers umstellen.
- **Phase-1-Hinweise:** `lagen-1 l-03` und `vorrat-02 v-0090` (Wahl > 140 Zeichen), `fc-014` (keine wert-1-Antwort).
- **Renates runder Geburtstag:** Laut `_index.json` kommt Renates Siebzigster auch in `ruhe`, `selbst` und `stimme` vor. l-07 passt jetzt zu „Gasthaus“; ob die anderen Bereiche dazu passen, ist dort zu prüfen.
- Tarek kommt außer in l-13 noch in `v-0107` vor („kam zweimal zu spät zu Kundenterminen“) – das ist kein Absprachebruch und wurde gelassen.
