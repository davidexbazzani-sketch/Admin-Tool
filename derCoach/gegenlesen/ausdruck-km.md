# Gegenlesen: Bereich `ausdruck`, Phasen Können (k) und Meisterschaft (m)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Fachlektor und Faktenprüfer · **Inhaltsdateien nicht geändert**

## Was geprüft wurde

- **Maßstab:** `08_ENTSCHEIDUNGEN.md` (geht vor; Lehrplan-Abweichung `ausdruck`: Titel „Positiv fassen – ohne zu schummeln“, „Heikles elegant sagen“, Sparrings mit Dr. Albers und Renate), `06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, 10, Prüfliste 16), `src/coach/inhalt/LIESMICH.md` (3a ff., 4–7), `05_LEHRPLAN.md` 3.7, `kern/inhaltTypen.ts`, `besetzung.json`, früherer Bericht `gegenlesen/ausdruck.md` (Phase 1).
- **Vollständig gelesen:** `einheiten-2.json` (2-01 bis 2-06), `einheiten-3.json` (3-01 bis 3-05), `lagen-2.json` (l-06 bis l-10), `lagen-3.json` (l-11 bis l-15), `vorrat-03.json` (v-0101–0185) und `vorrat-04.json` (v-0186–0270), die 38 neuen Lerntage in `kurs.json`, `tests.json` fc-025 bis fc-040, die neuen Einträge in `wissen.json` (w-015–018, 042–045, 054, 055, 089, 095, 096, 109, 124, 125) und die vier neuen Quellen (`rogers-lasky2023`, `kashdan2015`, `torre2018`, `duden-scheinbar`). Dazu `leiter.json` m-08 bis m-10. **Jeden Weg durch jede Lage** habe ich nachverfolgt.
- **Prüfskript:** `node scripts/coach-pruefe.mjs --nur ausdruck` → **0 Fehler, 0 Hinweise** (18 Einheiten, 15 Lagen, 270 Vorrat, 10 Missionen). `--soll ausdruck`: für `ausdruck` fehlt nichts.
- **Eigene Auszählung der Antwortlängen** (143 Fragen mit mindestens drei Antworten in den neuen Dateien): beste Antwort = längste in 53 (37 %); längste Antwort = falsche in 70 (49 %). Aber: in `einheiten-3.json` ist die beste Antwort in **9 von 9** Fragen die längste (siehe S3). Position der besten Antwort: 38 × erste, 63 × zweite, 37 × dritte, 5 × vierte Stelle.
- **Kursplan:** k = 6 E, 6 Ü, 4 L, 3 A, 1 S (20); m = 5 E, 5 Ü, 4 L, 3 A, 1 S (18). Bänder [3,6]–[4,7] und [5,8]–[6,10] (ue-016 [5,9]). Test-Stufen 4–7 (fc-025–032) und 6–9 (fc-033–040). Formate der Übungstage sind aus dem Vorrat füllbar. **Stimmt** – bis auf die Reihenfolge der Lagen in Phase m (S1).
- **Einfluss-Klassen, Fachhilfe, Form:** Keine rote Technik als Musterlösung, Mission oder Einsatz-Übung; „Beschönigen, bis es täuscht“ kommt nur zum Erkennen vor (v-0131, v-0136). Keine Taktik-Mission. Fachhilfe nur als Schritt (`3-05` → `seele`). Keine Rufnummern, kein „...“. „Sie“ steht nur in wörtlicher Rede oder als „sie“ (3. Person). Laute Übung `3-03-c` (buehne) hat die stille Ersatzübung `v-0186` (stumm, gleiche Fähigkeit). Figuren passen zu `besetzung.json` (Miriam neckt, Albers knapp, Lena genau, Petersen hört schlecht – passend die Mailbox-Übung v-0191, Renate sagt, was sie denkt, Sven stichelt).
- **Quellen nachgeschlagen:**
  - **rogers-lasky2023** (Auszug der Autoren, Behavioral Scientist): 7.002 Schulratsmitglieder, 127 gegen 49 Wörter, 4,8 % gegen 2,7 % („nearly twice“), Nebenstudie zur gefühlten Umfragedauer (29 % gegen 15 %) – **stimmt**. **Nicht** im Auszug und nicht im Quellentext: dass „die meisten vorher auf die lange getippt“ hätten (siehe M1). Eine Zweitquelle spricht von Klicks auf den Umfragelink statt von Antworten – unkritisch, aber siehe K-Liste.
  - **Duden online** „formal“ (1. die Form betreffend; 2. nur der Form nach), „formell“ (1. offiziell; 2. den Regeln der Höflichkeit genau entsprechend, förmlich; 3. nur äußerlich), „Quantensprung“ (1. Physik: sprunghafter Übergang zwischen Quantenzuständen; 2. ohne Stil-Marke: großer Fortschritt in kurzer Zeit), „jemandem auf den Zahn fühlen“ (nur mit Person, umgangssprachlich) – Ergebnisse unten unter „Bewusste Entscheidungen“.
  - **DWDS** „Maus“: „da beißt die Maus keinen Faden ab“ als Mehrwortausdruck belegt (Bedeutung laut Nachschlagewerken: daran ist nichts zu ändern); eine Fügung mit Katze und Faden ist nicht verzeichnet.
  - **torre2018** (Verlagsabstract): Affektbenennung zeigt Wirkungen wie bewusstes Regulieren (Erleben, Körper, Gehirn, Verhalten) und fühlt sich nicht wie Regulieren an – **passt** zu 3-05 und w-017.
  - **graeber2024** (in `stimme/quellen.json`, geprüft): Zahl verblasst schneller als Geschichte, „schon etwas Anschauliches neben der Zahl half“ – trägt 2-06, 3-03, w-018 **ausreichend**.
  - **kashdan2015** nicht eigens nachgeschlagen; der Quellentext deckt sich mit meinem Wissensstand (Übersicht, überwiegend Zusammenhangsstudien).

## Gesamteindruck

Die Phasen k und m sind **inhaltlich stark und ehrlich gebaut**: Die Einheiten vertiefen Phase 1 statt sie zu wiederholen (feste Verbindungen gegen leere Streckverben, positiv fassen mit der eigens gelehrten Grenze „frühestens/spätestens“, Bedeutungspaare ohne Besserwisserei, Leiter hinab zu konkreten Sätzen, fürs Ohr schreiben, eigener Ton, Gefühlswortschatz mit Fachhilfe). Die besseren Fassungen sind fast immer wirklich besser, die `kern`-Musterlösungen liegen unter der Wortgrenze, die Rangfolgen sind schlüssig, die Gefühls-Übungen lehren „nachfragen statt festlegen“ durchgehend. Die Sparrings (Bitte nach oben, Renates Siebzigster) sind lebendig und bündeln die Phase gut.

Die Mängel sitzen an drei Stellen:
1. **Wege in den Lagen:** In fünf Lagen zitiert eine Figur etwas, das auf manchen Wegen nie gesagt wurde, oder reagiert auf eine Antwort, die nicht kam (l-06, l-07, l-08, l-09, l-13).
2. **Eine unbelegte Behauptung** („die meisten tippten auf die lange Mail“) an vier Stellen.
3. **Kleinere Uneinheitlichkeiten:** Lagen vor ihren Einheiten im Kursplan m, die Regel aus 2-01 gegen „einen Antrag stellen“, formal/formell unterschiedlich bewertet, beste Antwort in `einheiten-3` immer die längste.

**Zählung: 6 muss · 15 sollte · 20 kann.**

---

## Muss

### M1 – Unbelegt: „Die meisten hatten auf die lange Mail getippt“
- **Dateien/Stellen:** `einheiten-2.json` › `ausdruck-2-04` › schaetzen (`aufloesung`) und Merkkarte `2-04-m3`; `wissen.json` › `ausdruck-w-015` (text), `ausdruck-w-089` (text).
- **Zitate:** „Die meisten Befragten hatten vorher auf die lange getippt.“ (2-04, w-015) · „… obwohl die meisten auf die lange getippt hatten.“ (2-04-m3) · „Die meisten glauben das.“ (w-089)
- **Begründung:** Weder der Quellentext von `rogers-lasky2023` noch der geprüfte Autoren-Auszug (Behavioral Scientist) berichtet eine Vorhersage-Befragung. Belegt sind nur die Antwortquoten und die Nebenstudie „kurze Mail → Umfrage wirkt kürzer“. LIESMICH 5: Aussagen über Befunde nur mit geprüfter Quelle. Steht die Vorhersage-Studie im Buch, muss sie erst nachgeschlagen und in den Quellentext aufgenommen werden – bis dahin raus.
- **Ersatz:**
  - 2-04 `aufloesung`: „Die kurze bekam fast doppelt so viele Antworten (4,8 gegen 2,7 von hundert). Lange Mails werden eher weggelegt – und lassen die Bitte größer wirken: Wer die kurze las, hielt auch die Umfrage öfter für kurz.“
  - 2-04-m3 `antwort`: „Die kurze Mail bekam fast doppelt so viele Antworten – und ließ die Umfrage kürzer wirken.“
  - w-015 `text`: „In einem Feldversuch bekamen rund 7.000 Empfänger dieselbe Bitte – einmal in 127, einmal in 49 Wörtern. Die kurze Fassung brachte fast doppelt so viele Antworten. Wer sie las, hielt auch die Umfrage öfter für kurz. Kürze ist Rücksicht auf volle Postfächer.“
  - w-089 `text`: „Es klingt einleuchtend: mehr Text, mehr Mühe. In einem großen Feldversuch bekam die kurze Fassung derselben Bitte aber fast doppelt so viele Antworten wie die lange. Ernst genommen wird, was man schnell versteht.“

### M2 – Lage `ausdruck-l-06`: „60 Euro“ und „Dienstag“ fallen vom Himmel
- **Datei:** `lagen-2.json` › `ausdruck-l-06`
- **Zitate:** k3 sagt „Herr Petersen rechnet: „60 Euro. Und wann hätte ich ihn wieder?““ · ende1 sagt „… „Na gut. Dienstag also.““
- **Begründung:** Den Betrag nennt nur k2 › wahl 2. Auf den Wegen k2 › wahl 1 („Das tut mir leid.“) und wahl 3 (Paragraf 7) hat Petersen nie „60 Euro“ gehört. Nach k3 › wahl 3 („In ein paar Tagen.“) geht es zu ende1, wo er „Dienstag also“ sagt – ein Tag, den niemand genannt hat; das Fazit lobt dort „Preis und Tag konkret“.
- **Ersatz:**
  - k3 `sagt` (Erzähltext, darum nur eine Anführung): Du nennst ihm den Festpreis: 60 Euro, das Leihgerät kostet nichts. Herr Petersen rechnet: „60 Euro. Und wann hätte ich ihn wieder?“
  - k3 › wahl 3 `weiter` → neues `ende4`: sagt „Herr Petersen nimmt das Leihgerät: „Ein paar Tage … na gut. Ich ruf dann Freitag mal an.““, ende „Kein Drama – er bekommt seinen Drucker. Aber ohne Tag muss er nachfragen. Nenn einen Tag, auch wenn er nur ungefähr ist.“

### M3 – Lage `ausdruck-l-13`: Sven antwortet auf Sätze, die nicht gefallen sind
- **Datei:** `lagen-3.json` › `ausdruck-l-13`
- **Zitate und Wege:**
  - k3 sagt „Sven: „Ja. Genau so. Jetzt sitz ich hier …““ – „Genau so“ bestätigt die Wortangebote aus k2 › wahl 3. Nach wahl 1 („Das redest du dir doch nur ein.“) oder wahl 2 („Verstehe.“) ergibt es keinen Sinn.
  - k4 sagt „Zwei Stunden und eine Pizza später. Sven an der Tür: „Danke, dass du gekommen bist …““ – nach k3 › wahl 2 (Lebenslauf) und wahl 3 („Wenn du reden willst, ich bin da.“) hat niemand einen Besuch angeboten.
  - ende1 sagt „Sven grinst schief: „Erschrocken. …““ – nach k4 › wahl 1 („Gut, gut. Alles bestens.“) und wahl 3 („Heute ging's um dich …“) hat niemand „erschrocken“ gesagt; das Fazit lobt „ein genaues Wort für dein eigenes Gefühl“.
- **Ersatz:**
  - k3 `sagt`: „Sven: „Na ja. Jetzt sitz ich hier und starr die Wand an.““
  - k3 › wahl 2 `weiter`: `ende2` (passt: Rat im Schreck, Sven zieht sich zurück).
  - k4 `sagt`: „Später am Abend, nach einem langen Gespräch. Sven: „Danke, dass du da warst. Und du? Du bist so still heute.““ (passt zu Besuch und Telefonat).
  - ende1 `sagt`: „Sven lacht kurz: „Erschrocken. Na, wenigstens einer, der heute ehrlich ist.““ (ohne Umarmung, weil auch ein Telefonat möglich ist).
  - k4 › wahl 1 und wahl 3 `weiter` → neues `ende3`: sagt „Sven: „Okay. Danke dir.““, ende „Kein Drama – der Abend hat ihm gutgetan. Aber Freundschaft geht in beide Richtungen: Ein genaues Wort für dein eigenes Gefühl hätte ihm gezeigt, dass er dir wichtig ist.“

### M4 – Lage `ausdruck-l-08`: Fahrradständer und rechte Wand auf Wegen, auf denen nichts geregelt wurde
- **Datei:** `lagen-2.json` › `ausdruck-l-08`
- **Zitate:** k3 › wahl 1 „„Ich habe um Platz gebeten und einen Fahrradständer im Hof angefragt. …““ · ende1 sagt „Am nächsten Morgen stehen die Räder an der Wand rechts.“
- **Begründung:** Ständer und „rechte Wand“ kommen nur in k2 › wahl 3 vor. Nach k2 › wahl 1 (rueck: „Irgendwo ist nirgendwo – die Räder bleiben, wo sie sind.“) und wahl 2 („Das ist nicht mein Problem.“, rueck: „die Gruppe schaltet auf Abwehr“) wäre die beste Antwort an Frau Sommer gelogen, und ende1 widerspricht der Rückmeldung.
- **Ersatz:** k2 › wahl 1 und wahl 2 `weiter` → neues `ende3`: sagt „Zwei Räder verschwinden, drei bleiben. Frau Sommer quetscht sich mit dem Rollator vorbei.“, ende „Kein Drama – ein Anfang. Aber ohne konkreten Platz bleiben die Räder, wo sie sind. Beim nächsten Mal: auf den Einwand eine Lösung für heute.“

### M5 – Lage `ausdruck-l-09`: Lena zitiert den Anhang, den niemand vorgeschlagen hat
- **Datei:** `lagen-2.json` › `ausdruck-l-09` › `ende1`
- **Zitat:** „Lena: „Danke. Seite 9 nach vorn und die alte Regelung in den Anhang – das mach ich heute noch.““ · ende „Ein genaues Lob, ein Befund mit Seite und Satz, ein letzter konkreter Punkt …“
- **Begründung:** Den Anhang schlägt nur k2b › wahl 1 vor. Auf dem besten Weg (k2 › wahl 3 → k3) fällt er nie. Nach k3 › wahl 1 („Sonst passt alles.“) gab es keinen „letzten konkreten Punkt“.
- **Ersatz:** ende1 `sagt`: „Lena: „Danke. Der Pate kommt auf Seite 1 – das mach ich heute noch.““; `ende`: „Ein genaues Lob, ein Befund mit Seite und Satz, wenige Punkte – und dann Schluss. So wird aus einer Rückmeldung ein Plan.“

### M6 – Lage `ausdruck-l-07`: Albers stimmt einem Vorschlag zu, den es nicht gibt
- **Datei:** `lagen-2.json` › `ausdruck-l-07` › k4 › wahl 1
- **Zitat:** wahl „„Ich passe künftig besser auf.““ (rueck: „ein Vorsatz ist kein Ablauf. Er fragt nach einer Regel.“) → `ende1`: „Albers: „Einverstanden. Machen Sie das so.““, Fazit „… ein Vorschlag für morgen.“
- **Begründung:** Rückmeldung und Ende widersprechen sich. `ende2` („Sicher. Trotzdem hätte ich bis Freitag gern einen Vorschlag.“ – „Beim nächsten Mal … gleich einen konkreten Vorschlag mitbringen“) passt genau.
- **Ersatz:** k4 › wahl 1 `weiter`: `ende2`.

---

## Sollte

### S1 – Kursplan Phase m: zwei Lagen stehen vor der Einheit, die sie lehren
- **Datei:** `kurs.json` (Phase m)
- **Befund:** `ausdruck-l-11` (Toast: „fürs Ohr schreiben“, „runde Zahl mit Bild“, „Kern am Schluss noch einmal“) steht nach 3-02, aber **vor** 3-03 „Schreiben fürs Hören“. `ausdruck-l-13` (Sven: „Gefühle in Worte fassen“) steht nach 3-04, aber **vor** 3-05 „Wortschatz für Gefühle“. `ausdruck-l-12` (Fachwörter mit Maß, Vergleich) passt dagegen genau hinter 3-02.
- **Ersatz:** Lagen-Plätze tauschen, Lerntag-Muster bleibt: L nach 3-02 = `l-12`; L nach 3-03 = `l-11`; L nach 3-04 = `l-14` (eigener Ton, fair bewerten); L nach 3-05 = `l-13`. (Präzedenz: `ruhe`, „l-14 steht im Kursplan vor l-13“, in `08`.)

### S2 – Regel aus 2-01 widerspricht „einen Antrag stellen“
- **Dateien:** `einheiten-2.json` › `ausdruck-2-01` (`regel`, karte, `2-01-a` Karte „einen Antrag stellen“ = fest, `2-01-m1`); `wissen.json` › `w-055`; `vorrat-03.json` › `v-0116`, `v-0119`, `v-0121`.
- **Zitat:** Regel „Gibt es ein einfaches Verb für dasselbe, nimm es – sonst bleibt das feste Paar.“ · Karte „Gibt es dieses Verb? Dann nimm es.“
- **Begründung:** Für „einen Antrag stellen“ gibt es „beantragen“ – nach der Regel müsste es aufgelöst werden; 2-01-a und v-0121 werten es aber als festes Paar. v-0119 sagt es selbst richtig: „Auflösen geht, nötig ist es nicht.“ Wer die Regel befolgt, wird in 2-01-a falsch gewertet.
- **Ersatz:** Regel: „Leer ist, was ein einfaches Verb nur verlängert – übliche feste Paare dürfen bleiben.“ (82 Zeichen) · Karte, Satz 4–6: „Leer ist eine Verbindung, wenn ein einfaches Verb dasselbe sagt und das Hauptwort nur Platz füllt: „eine Prüfung durchführen“. Übliche Paare wie „einen Antrag stellen“ dürfen bleiben, ebenso solche mit eigenem Sinn („in Kraft treten“ = beginnen zu gelten).“ · Alternativ in 2-01-a die Karte „einen Antrag stellen“ durch „eine Rolle spielen“ ersetzen.

### S3 – `einheiten-3.json`: die beste Antwort ist immer die längste
- **Datei:** `einheiten-3.json`, alle neun Auswahl-/Wortwahl-Fragen (3-01-a, -b, -e; 3-02-a; 3-03-d; 3-04-b, -d; 3-05-c, -d).
- **Begründung:** LIESMICH 4: höchstens in der Hälfte. 9 von 9 macht die Einheiten erratbar (bei 3-01-b und 3-05-d nur um einen Buchstaben, bei den Satzantworten deutlich).
- **Ersatz (je eine falsche oder brauchbare Antwort verlängern):**
  - 3-01-a, Antwort 3: „„Das ist eine prägnante, präzise, pointierte und in jeder Hinsicht profunde Analyse.““
  - 3-01-e, Antwort 2: „Eine Liste mit dreißig Bildungswörtern heute Abend am Stück lernen und morgen früh noch einmal durchlesen.“
  - 3-02-a, Antwort 4: „„Wie eine Versicherung, ein Fallschirm und ein doppelter Boden zugleich – für alles, was Ihnen lieb und teuer ist.““
  - 3-03-d, Antwort 4: „Mit „Ich bin kein großer Redner, verzeiht mir also die Versprecher“ anfangen.“
  - 3-04-b, Antwort 1: „So schreiben wie die Geschäftsführung in ihren Rundbriefen, damit es seriös und angemessen wirkt.“
  - 3-04-d, Antwort 2: „„Ja, übernimm ihren Stil ganz – der kommt bei allen im Haus gut an, das sieht man ja.““
  - 3-05-c, Antwort 4: „„Hast du schon über Werbung in der Zeitung nachgedacht? Oder über einen Mittagstisch für die Büros nebenan?““

### S4 – Rückmeldung oder Fazit passen nicht auf jedem Weg (leichter als M2–M6)
- **`lagen-3.json` › `l-11` › k4:** wahl 1 rueck „Der Kern vom Anfang kommt zurück“, wahl 2 rueck „Mit dem Bild vom Anfang …“, ende1 „Ein Anfang mit Bild“ – nach k1 › wahl 1 („Liebe Miriam, herzlichen Glückwunsch …“) gab es kein Bild am Anfang. **Ersatz** wahl 1 rueck: „Ein Bild als Schlusspunkt, bei dem alle das Glas heben. Kam es schon am Anfang, schließt sich der Bogen – fürs Ohr ist diese Wiederholung kein Fehler.“ · wahl 2 rueck: „Kurz und richtig. Mit einem Bild zum Schluss bliebe der Toast länger hängen.“
- **`lagen-3.json` › `l-15`:** k5 › wahl 1 „Also, keine Lobhudelei, nur eine letzte Tatsache …“ (rueck „Der Bogen zum Anfang“) – nach k1 › wahl 3 hat der Saal „Lobhudelei“ nie gehört (Renate sagte es dir unter vier Augen). Und ende1 „Das war keine Lobhudelei“ folgt auch auf k4 › wahl 1 („unendlich, unbeschreiblich, unglaublich viel“ – rueck: „Genau die Lobhudelei, die sie nicht wollte“). **Ersatz:** k4 › wahl 1 → neuer Knoten `k4b`: sagt „Renate ruft: „Kind, was hab ich dir gesagt?“ Die Gäste lachen.“, wahl „Mitlachen: „Stimmt. Also eine Tatsache: Mit sechzehn hast du mich zwei Wochen bei dir wohnen lassen.““ (2, → k5) / „„Doch, doch, das musste jetzt sein.““ (0, → k5, tendenz „stapeln“). k5 › wahl 1 rueck: „Ein kurzer Kernsatz und ein klares Zeichen fürs Glas – und wer am Anfang von Lobhudelei sprach, schließt hier den Bogen.“
- **`lagen-3.json` › `l-14` › ende1:** Die Inhaberin dankt „für die faire Bewertung“ und verspricht „Wir rufen künftig an“ – auch nach k2 › wahl 2 („absoluter Saftladen“) und nach k3 › wahl 1/3 + k4 › wahl 3, wo weder der fehlende Anruf noch ein Wunsch genannt wurde. **Ersatz:** k2 › wahl 2 `weiter` → `ende3` (Abwehr passt); ende1 sagt: „Am nächsten Tag antwortet die Inhaberin unter der Bewertung: „Danke für die offenen Worte. Die Verspätung tut uns leid – das schauen wir uns an.““
- **`lagen-3.json` › `l-12`:** Nach k2 › wahl 3 („erhöhte Vigilanz“ bleibt, rueck: „Wer „Vigilanz“ nicht kennt, liest weiter nichts.“) endet der Weg im Erfolg (ende1, Fazit „Alltagswörter“). **Ersatz:** k2 › wahl 3 `weiter` → neuer Knoten `k2b`: sagt „Jonas: „Vigilanz bleibt aber, das ist das richtige Wort.““ mit wahl „„Dann erklär es im selben Satz: Vigilanz, also Wachsamkeit.““ (2, → k3) / „„Wie du meinst.““ (0, → ende2).

### S5 – `ausdruck-v-0236` (Quantensprung): Besserwisserei als brauchbare Antwort
- **Datei:** `vorrat-04.json` › `ausdruck-v-0236`
- **Zitat:** wert 1 „Falsch, weil ein Quantensprung in der Physik winzig ist.“ – warum „Stimmt für die Physik, aber im Alltag heißt das Wort längst „großer Schritt“.“
- **Begründung (Duden nachgeschlagen):** Duden führt die übertragene Bedeutung ohne Stil-Marke: „Durchbruch, der eine Entwicklung in sehr kurzer Zeit sehr weit voranbringt“. In der Physik ist das Kennzeichen der **sprunghafte** Übergang, nicht die Winzigkeit. Der Einwand ist also halb falsch und genau die Korrektur anderer, die 2-05-e („besserwissen“, wert 0) ablehnt. Dazu ist „Sie spart pro Tag …“ zweideutig (Carla oder Software).
- **Ersatz:** frage: „Carla nennt die neue Software in ihrer Rede „einen Quantensprung“. Die Software spart pro Tag ein paar Minuten. Was stimmt?“ · Antwort 2 → wert 0, tendenz „besserwissen“, warum: „Der Einwand trifft nicht: In der Physik meint das Wort einen sprunghaften Übergang, im Alltag laut Duden einen großen Fortschritt. Das Problem ist die Übertreibung.“ · neue Antwort, wert 1: „Das Wort ist zu groß – „ein echter Fortschritt“ wäre ehrlicher.“ – warum: „Ehrlicher, aber noch ohne Inhalt: Was spart sie? Die Zahl mit einem Bild wäre stärker.“

### S6 – formal/formell: in 2-05 und v-0179 unterschiedlich bewertet
- **Dateien:** `einheiten-2.json` › `2-05-c` („sehr formal“ = wert 1, „Wird oft so gesagt“); `vorrat-03.json` › `v-0179` („formal“ = wert 0).
- **Begründung (Duden nachgeschlagen):** „formal“ = 1. die Form betreffend, 2. nur der Form nach. „formell“ = 1. offiziell, 2. den Regeln der Höflichkeit genau entsprechend (förmlich), 3. nur äußerlich. Den Sinn „förmlich, feierlich“ verzeichnet der Duden **nur** für „formell“; „formal“ in diesem Sinn folgt dem Englischen. Für beide Sätze (Siegel und Abendgarderobe; Anzug, Tischordnung, Reden) ist also „formell“ richtig. Die unterschiedliche Wertung von „formal“ ist vertretbar, weil 2-05-c sonst keine brauchbare Antwort hätte – die Begründung muss es aber sagen. Die Karte und `2-05-m3` stimmen mit dem Duden überein.
- **Ersatz:** 2-05-c, Antwort 1, warum: „Hört man oft, nach dem englischen „formal“. Der Duden kennt „formal“ aber nur als „die Form betreffend“ – gemeint ist hier „formell“.“ · v-0179 bleibt. Optional in die Karte von 2-05: „Beide können „nur der Form nach“ heißen: formal oder formell im Recht.“

### S7 – `ausdruck-v-0195`: Die vier Fassungen nennen nicht dieselbe Zahl
- **Datei:** `vorrat-04.json` › `ausdruck-v-0195`
- **Zitat:** 1. „Fast jede dritte Rechnung kommt zu spät. Bei uns im Team sind das etwa zwei am Tag.“ · 4. „Von den im letzten Quartal eingegangenen 1.284 Rechnungen kamen 420 zu spät.“
- **Begründung:** 420 / 1.284 = 32,7 % – Fassung 2 und 3 stimmen. Aber 420 späte Rechnungen im Quartal (rund 62 Arbeitstage) sind etwa **sieben** am Tag, nicht zwei. Die Übung lehrt „die Zahl bleibt richtig“ (v-0178) – hier stimmt das Bild nicht zur Zahl. Dazu passt „Rechnung kommt zu spät“ schlecht zu „Vortrag über offene Rechnungen“ (gemeint ist wohl: zu spät bezahlt). Erfundene Beispielzahlen brauchen keine Quelle (Regel gilt für Tatsachenbehauptungen); sie müssen aber in sich stimmen.
- **Ersatz:** 1. „Fast jede dritte Rechnung wird zu spät bezahlt. Bei uns sind das etwa sieben an jedem Arbeitstag.“ · 2. „Rund ein Drittel der Rechnungen wird zu spät bezahlt.“ · 3. „32,7 Prozent der Rechnungen werden zu spät bezahlt.“ · 4. „Von den im letzten Quartal gestellten 1.284 Rechnungen wurden 420 zu spät bezahlt.“ (Begründungen bleiben.)

### S8 – `ausdruck-fc-031`: „effektiv“ ist hier richtig, „effizient“ fraglich
- **Datei:** `tests.json` › `ausdruck-fc-031`
- **Zitat:** „Sie ist effizient.“ (1, „Beim Papier stimmt das.“) · „Sie ist effektiv.“ (0, „Über den Aufwand … sagt das nichts.“)
- **Begründung:** Die Regel spart Papier – sie **wirkt**, „effektiv“ stimmt also und lässt nur den Aufwand offen. „Effizient“ behauptet gerade ein gutes Verhältnis von Aufwand und Ergebnis – und der Aufwand (Wege) ist gestiegen. Die Wertung ist umgekehrt. (Zur Bitte des Schreibers: In fc-031 steht kein formal/formell; die Prüfung dazu steht in S6.)
- **Ersatz:** „Sie ist effektiv.“ → wert 1, warum: „Stimmt: Sie wirkt, es wird weniger gedruckt. Den neuen Aufwand – die Wege – verschweigt das Wort.“ · „Sie ist effizient.“ → wert 0, warum: „Effizient hieße: das Ziel mit wenig Aufwand. Gerade der Aufwand ist gestiegen – das Wort beschönigt.“

### S9 – `ausdruck-fc-026`: Die beste Antwort lässt das Nein weg
- **Datei:** `tests.json` › `ausdruck-fc-026`
- **Zitat:** wert 2 „„Für Donnerstag habe ich noch Plätze frei – soll ich Sie eintragen?““ – warum „Dass Dienstag voll ist, versteht sie von selbst.“
- **Begründung:** Der Bereich lehrt sonst „das Nein früh und klar, sofort sagen, was geht“ (l-06, Prinzip 1) und wertet in fc-023 „Klares Nein, ein „leider“, und was stattdessen geht“ als beste. Hier soll das Weglassen des Nein das Beste sein – widersprüchlich; die Anruferin kann nachhaken („Und Dienstag?“).
- **Ersatz:** „„Dienstag ist leider voll – für Donnerstag habe ich noch Plätze. Soll ich Sie eintragen?““ – warum: „Kurz das Nein, dann was geht, und sie kann gleich entscheiden.“ (Damit ist sie die längste; zum Ausgleich die wert-0-Antwort lassen, sie ist ähnlich lang.)

### S10 – `ausdruck-fc-030`: Die falsche Rechnung zeigt nicht, dass die Freundlichkeit nur Schein war
- **Datei:** `tests.json` › `ausdruck-fc-030`
- **Zitat:** „„Der Kellner wirkte freundlich, hat uns aber eine falsche Rechnung gebracht.““ → „Er war nur scheinbar freundlich.“
- **Begründung:** Ein freundlicher Kellner kann sich verrechnen. „Scheinbar“ verlangt, dass die Freundlichkeit in Wirklichkeit nicht bestand – das gibt die Lage nicht her.
- **Ersatz:** frage: „Jule erzählt: „Der Kellner hat uns angelächelt – und dann am Nebentisch über uns gelästert.“ Welches Wort passt? „Er war nur ___ freundlich.““

### S11 – `ausdruck-fc-038`: Die Lösung ist aus der Frage nicht erschließbar
- **Datei:** `tests.json` › `ausdruck-fc-038`
- **Zitat:** „„Deine Mails klingen jedes Mal anders – mal kumpelhaft, mal wie vom Amt.““ → beste: „Dein Ton hängt von der Laune ab …“
- **Begründung:** Ob du dich dem Empfänger anpasst (wert 1) oder nach Laune wechselst (wert 2), ist aus dem Satz nicht zu erkennen. Eindeutig wird es erst, wenn der Empfänger gleich bleibt.
- **Ersatz:** frage: „Ein Kollege sagt dir: „Deine Mails an mich klingen jedes Mal anders – mal kumpelhaft, mal wie vom Amt.“ Was steckt am ehesten dahinter?“; Antwort 1 warum: „Anpassen ist gut – aber hier ist es immer derselbe Empfänger. Dann fehlt etwas, das bleibt.“

### S12 – Deutsch
- `lagen-2.json` › `l-06` › k1 › wahl 2: „Reparatur zum Festpreis, solange ein Leihgerät.“ – „solange“ verlangt einen Satz. **Ersatz:** „Reparatur zum Festpreis, und für die Zeit ein Leihgerät.“
- `tests.json` › `fc-032` frage: „Was macht den Satz am meisten stärker?“ – doppelte Steigerung. **Ersatz:** „Was macht den Satz am stärksten?“
- `tests.json` › `fc-033`, Antwort 2 warum: „Dann hören die Hälfte nicht mehr zu.“ **Ersatz:** „Dann hört die Hälfte nicht mehr zu.“
- **Anführung in der Anführung** (innen ‚…‘, wie in l-08 k1 schon richtig): `l-09` k3 › wahl 2 („Statt ‚zeitnah ein Gespräch‘ würde ich ‚nach zwei Wochen‘ schreiben“), `l-11` k3 › wahl 2 („gefragt: ‚Na, wie geht's?‘“), `l-12` k1b › wahl 1 („‚Spear-Phishing‘ und ‚Vigilanz‘“), `l-12` k4 sagt („Das Wort ‚Phishing‘ lass ich aber drin.“), `l-12` k4 › wahl 3 („‚Phishing, also gefälschte Mails, die an Passwörter wollen.‘“).

### S13 – Musterlösungen erfüllen ihr eigenes Kriterium nicht
- `einheiten-2.json` › `2-03-c`, Muster 1: Kriterium „nennt die Folge“ – „Richtig ist der 14., nicht der 4.“ ist keine Folge. **Ersatz:** „„Ich habe die Einladung mit dem falschen Datum verschickt: dem 4. statt dem 14. Wer sich den 4. eingetragen hat, steht zehn Tage zu früh da. Ich schicke heute noch eine Korrektur an alle.““
- `vorrat-03.json` › `v-0127`, Muster 2: Kriterium „nennt die Folge“ fehlt. **Ersatz:** „„Mir ist ein Zahlendreher passiert: 1.400 statt 1.040 in Tabelle 2 – dadurch stimmt die Summe nicht. Das tut mir leid. Ich korrigiere es gleich und sage dir Bescheid.““
- `vorrat-04.json` › `v-0270`, Muster 2: Kriterium „Fakten: die dritte Verschiebung und was sie kostet“ – was es kostet, fehlt. **Ersatz:** „„Ich will offen sein: Nach der dritten Verschiebung bin ich frustriert – zwei Leute warten seit Wochen auf den Start. Mir würde helfen zu wissen, was vorher erledigt sein muss.““

### S14 – Beleg für Erklär-Vergleiche überdehnt
- **Dateien:** `einheiten-3.json` › `3-02` (`belegHinweis`), `wissen.json` › `w-043` (`belegHinweis`).
- **Zitat:** „Fälle miteinander vergleichen hilft beim Lernen, im Mittel mäßig.“ · „Dass Vergleiche beim Lernen helfen, zeigen Studien zum Vergleichen von Fällen.“
- **Begründung:** `gentner2003`/`alfieri2013` untersuchen, wie **Lernende zwei Fälle nebeneinanderlegen** und das gemeinsame Prinzip finden. Die Einheit lehrt etwas anderes: dass **ein Sprecher** Fremdes mit einem Alltagsbild erklärt. Die Befunde stützen das nur mittelbar; der Hinweis klingt, als sei genau das belegt. (`antonakis2011` steht in den Quellen, kommt im Hinweis aber nicht vor.)
- **Ersatz 3-02:** „Belegt ist: Wer zwei Fälle vergleicht, erkennt das gemeinsame Prinzip besser (Meta-Analyse, mäßiger Effekt). Ob ein einzelner Erklär-Vergleich ebenso hilft, ist damit nicht gezeigt – das ist Praxiswissen. Meinungen lenken Bildwörter kaum.“ · **Ersatz w-043:** „Studien zum Vergleichen von Fällen stützen den Gedanken nur mittelbar; dass ein Alltagsbild beim Erklären hilft, ist Praxiswissen. Meinungen lenken einzelne Bildwörter kaum.“ (Beleg-Stufe von w-043 dann besser P.)

### S15 – Gefühlswortschatz: Zusammenhang als Ursache formuliert
- **Dateien:** `einheiten-3.json` › `3-05` (`aha`, Karte); `wissen.json` › `w-016` (text).
- **Zitat:** aha „Wer seine Gefühle genau benennt, kann besser mit ihnen umgehen.“ · Karte/w-016 „Menschen, die negative Gefühle fein unterscheiden, greifen unter Druck seltener zu schädlichen Auswegen.“
- **Begründung:** Der `belegHinweis` sagt richtig „vor allem Zusammenhangsstudien“; Aha und Wissens-Text klingen aber nach Ursache. Der Karten-Satz ist als Zusammenhang formuliert und kann bleiben; das Aha nicht.
- **Ersatz:** aha, Satz 3: „Wer Gefühle fein unterscheidet, kommt im Schnitt besser mit ihnen zurecht.“ · w-016, Satz 2: „Menschen, die negative Gefühle fein unterscheiden, greifen unter Druck seltener zu schädlichen Auswegen – so zeigen es vor allem Vergleichsstudien.“

---

## Kann

1. **`vorrat-03.json` › `v-0113`** (vermischte Wendung): fachlich richtig – „da beißt die Maus keinen Faden ab“ (= daran ist nichts zu ändern) ist belegt, eine Fügung mit Katze nicht. Die Herkunft der Katze ist aber eine Vermutung. **Ersatz** fehler: „Richtig heißt es: „da beißt die Maus keinen Faden ab“. Die Katze ist wohl aus „da beißt sich die Katze in den Schwanz“ hineingerutscht.“ (Sinn passt zu „Nägel mit Köpfen“.)
2. **`einheiten-3.json` › `3-03-a`:** Der dritte Fehler hängt an „Danke.“ – markiert wird ein Wort, das selbst richtig ist; den Fehler (Bitte nicht wiederholt) findet man so nur durch Raten. **Ersatz:** den Fehler an „bitten wir Sie, ab März auf dem hinteren Parkplatz zu parken.“ hängen: „Die Bitte steckt am Ende eines langen Satzes und kommt nur einmal. Fürs Ohr: vorn sagen und am Schluss wiederholen.“
3. **„Notwendig → hinreichend“** (`2-02` Karte, `2-02-c`, `v-0134` Karten 2 und 3): „Ohne Rechnung kein Umtausch“ → „Mit Rechnung tauschen wir gern um“ verspricht streng genommen mehr (die Rechnung ist nötig, reicht aber vielleicht nicht). Die Einheit ist bei frühestens/spätestens so genau – ein Halbsatz in der Karte wäre konsequent: „Stimmt nur, wenn es die einzige Bedingung ist.“
4. **`vorrat-03.json` › `v-0167`:** Ein Teil beginnt mit Komma („, wobei der Raum noch offen ist,“) – je nach Anzeige steht „nun , wobei“. **Ersatz:** Komma ans Ende des vorigen Teils: „findet nun,“ · „wobei der Raum noch offen ist,“.
5. **`einheiten-3.json` › `3-03`, schaetzen:** „beides zusammen“ ist als Sammelantwort leicht zu erraten. **Ersatz** Optionen: „die Klammer“, „die Abkürzungen“, „die genaue Zahl mit Komma“ – Lösung: alle drei, Auflösung bleibt (oder als `auswahl`).
6. **`vorrat-03.json` › `v-0181`:** „Konsens … ohne dass jemand nachgeben muss“ ist zu eng – ein Konsens kann nach Zugeständnissen entstehen. **Ersatz:** „Heißt: Übereinstimmung. Dass jeder etwas nachgegeben hat, sagt das Wort nicht.“
7. **`vorrat-04.json` › `v-0224`:** „kohärent: Sie widersprechen sich an keiner Stelle“ – genauer wäre „konsistent“ (widerspruchsfrei); „kohärent“ heißt zusammenhängend, schlüssig. **Ersatz:** „„Die Ergebnisse sind konsistent: Sie widersprechen sich an keiner Stelle.““
8. **`lagen-3.json` › `l-12` › k3 › wahl 1** (Hotel): Das Bild verteilt Schlüssel auf verschiedene **Gäste**, das Thema ist ein Mensch mit vielen Konten. **Ersatz:** „„Wie beim Hausmeister: Für jede Tür ein eigener Schlüssel. Geht einer verloren, ist nur eine Tür offen.““
9. **`lagen-2.json` › `l-10` › k4 › wahl 3:** „die Abgabe am 7. liefere ich vorher“ – der 7. liegt ohnehin vor dem 10. **Ersatz:** „„Miriam vertritt mich in der Woche, und die Abgabe vom 12. liefere ich schon am 7.““
10. **`vorrat-03.json` › `v-0107`:** „Damit hast du ins Schwarze gezielt.“ als wert 1 – das Bild sagt das Gegenteil (nicht getroffen). Brauchbar ist es nicht; besser wert 0 und als wert 1 „Damit hast du ziemlich genau getroffen.“ (richtig, aber ohne Bild).
11. **`vorrat-03.json` › `v-0120`:** Lena zahlt Herrn Petersens Rechnung – laut Besetzung ist er Kunde, nicht Lieferant. **Ersatz:** „Lena schreibt an einen Lieferanten: …“.
12. **Längen in Vorrat und Lagen:** Die längste Antwort ist in 35 von 66 Vorratsfragen und 22 von 40 Lagen-Knoten eine falsche – knapp über der Hälfte (LIESMICH 4: „nicht meistens eine falsche“). Die beste Antwort steht nur 5-mal an vierter Stelle. Bei den nächsten Änderungen mitmischen.
13. **`wissen.json` › w-042–045:** Gruppe „Können und Meisterschaft“ ist ein Kursbegriff, kein Thema auf der Wissens-Seite. **Ersatz:** „Genau, bildhaft, ehrlich“.
14. **Unsicherheit wegkürzen:** `2-04-c` Muster („Der kleine ist für 30 Leute zu eng“ – Vorlage: „vermutlich zu eng“), `v-0148` Muster 1 („drei Wochen“ – Vorlage: „voraussichtlich“), `v-0199` (Vorlage „könnte … sparen“ → Muster „spart Zeit“). v-0150 lehrt ausdrücklich, das „voraussichtlich“ zu behalten – „etwa“ oder „voraussichtlich“ in den Mustern wäre konsequent.
15. **`wissen.json` › `w-051`** (Phase 1) nennt „„Bis … schaffe ich das.““ als Satz für heikle Stellen – neben der neuen Lehre aus 2-02 missverständlich. **Ersatz:** „„Ab … kann ich das.“ / „Bis … schaffe ich das.“ – je nachdem, was stimmt“. Für den Hauptstrang: `06_INHALT_REGELN_MUSTER.md` §10 zeigt noch „Das geht nicht vor Freitag.“ → „Das schaffe ich bis Freitag.“ als Muster.
16. **`einheiten-2.json` › `2-02-d`:** Die wert-1-Antwort (Warnungen, Sicherheitsregeln) ist ebenfalls voll richtig. **Ersatz** warum: „Auch richtig: Bei Gefahr zählt Klarheit. Die beste Antwort ist allgemeiner – sie gilt für jedes Nein ohne Alternative.“
17. **`tests.json` › `fc-034`**, Antwort 3 („machen alle Router“): stimmt so nicht; warum ergänzen: „Beruhigt – erklärt aber nicht, warum. Und nicht jeder Router macht das.“ · **`fc-035`:** „im Radio des Vereins“ wirkt ungewohnt; **Ersatz:** „über die Lautsprecher beim Vereinsfest“.
18. **`einheiten-2.json` › `2-05-c`**, Antwort 4: „offiziös … – das Gegenteil von gemeint“ ist zu stark. **Ersatz:** „Heißt „halbamtlich“ – nicht das, was gemeint ist.“
19. **`lagen-3.json` › `l-15` › k3 › wahl 3**, rueck: „mit einer Grenze, über die sie selbst lacht“ – der Vergleich nennt keine Grenze im Sinn von 3-02 („nur dass …“). **Ersatz:** „Ein Bild aus dem Alltag, das genau ihre Eigenart trifft – und über das sie selbst lacht.“
20. **`vorrat-04.json` › `v-0208`** (auf den Zahn fühlen): Duden führt die Wendung nur mit Person („jemandem“) – die Wertung ist gedeckt. In Testberichten ist „dem neuen Modell auf den Zahn fühlen“ allerdings verbreitet; die wert-1-Antwort fängt das auf. Nichts ändern, nur zur Kenntnis.

---

## Bewusste Entscheidungen (Bitte des Schreibers)

| Stelle | Nachgeschlagen | Entscheidung |
|---|---|---|
| `v-0195` Beispielzahlen | – (erfundene Beispielzahlen) | Erfundene Zahlen in einem Übungssatz brauchen keine Quelle, die Quellen-Regel gilt für Tatsachenbehauptungen. 32,7 % = 420/1.284 stimmt, „fast jede dritte“ und „rund ein Drittel“ stimmen. **Nicht** stimmig ist „etwa zwei am Tag“ (≈ sieben) und „kommt zu spät“ statt „wird zu spät bezahlt“ → S7. |
| `v-0236` Quantensprung | Duden: 1. Physik, sprunghafter Übergang; 2. großer Fortschritt in kurzer Zeit, ohne Stil-Marke | Die übertragene Bedeutung ist Standard. Die physikalische Korrektur ist Besserwisserei und nur halb richtig („winzig“ ist nicht das Kennzeichen) → wert 0, neue wert-1-Antwort → S5. |
| `v-0113` vermischte Wendung | DWDS: „da beißt die Maus keinen Faden ab“ belegt; keine Katzen-Fügung | Die Korrektur stimmt, der Satz in Miriams Mund passt („daran ist nichts zu ändern“). Nur die Herleitung „Katze aus ‚beißt sich in den Schwanz‘“ als Vermutung kennzeichnen → K1. |
| formal/formell (`2-05`, `v-0179`, `fc-031`) | Duden: „formal“ nur „die Form betreffend“ / „nur der Form nach“; „formell“ auch „förmlich“, „offiziell“ | In beiden Sätzen ist „formell“ richtig. v-0179 (formal = 0) bleibt; 2-05-c darf „formal“ als wert 1 behalten, muss aber sagen, dass der Duden diesen Sinn nicht kennt → S6. In `fc-031` steht kein formal/formell; dort ist effektiv/effizient umgekehrt gewertet → S8. |

## Urteil

**Abnahmereif nach den sechs Muss-Punkten.** M2–M6 sind kleine Umbauten an Knoten und `weiter`-Zielen; M1 ist eine Textkürzung an vier Stellen. Danach empfehle ich S1 (Kursplan-Reihenfolge) und S3 (Längen in `einheiten-3`) vor der Freigabe, weil Nutzer beides unmittelbar merken. Die übrigen Punkte sind Verfeinerungen.

---

## Umsetzung (25.11.2026)

Alle Änderungen nur in `src/coach/inhalt/ausdruck/` (dazu `_index.json` über `node scripts/coach-index.mjs`). Kennungen unverändert, nichts gelöscht. Danach `node scripts/coach-pruefe.mjs --nur ausdruck` → **0 Fehler** (die 7 verbleibenden Hinweise betreffen nur `lagen-1.json`, Stufe 1, vom Bericht nicht verlangt); `--soll ausdruck` → leer. Jeden Weg durch jede Lage nach der Änderung mit einem Hilfsskript aufgezählt (alle Knoten erreichbar) und die Schluss-Texte gegen die schwächsten Wege gelesen.

### Muss
| Befund | Stand |
|---|---|
| M1 „die meisten tippten auf die lange“ | **umgesetzt** an allen vier Stellen (2-04 `aufloesung`, 2-04-m3, w-015, w-089) nach den Ersatztexten. Selbst nachgesucht: Eine Vorhersage-Befragung ist nicht auffindbar → ohne diese Aussage. In `quellen.json` › `rogers-lasky2023` vermerkt, dass der Auszug keine Vorhersage berichtet und eine andere Darstellung von Klicks spricht. |
| M2 l-06 „60 Euro“/„Dienstag“ | **umgesetzt**, k3 aber als neutraler Erzähltext („Der Kostenvoranschlag liegt auf dem Tresen: 60 Euro Festpreis …“), damit er auch nach k2 › wahl 2 nicht doppelt wirkt; k3 › wahl 3 → neues `ende4`. Dazu S12 (k1 › wahl 2 „und für die Zeit ein Leihgerät“). |
| M3 l-13 Sven | **umgesetzt** wie vorgeschlagen (k3 „Na ja …“, k3 › wahl 2 → `ende2`, neuer k4-Text, ende1 ohne Umarmung, k4 › wahl 1/3 → neues `ende3`). k2 › wahl 3 auf ≤ 140 Zeichen gekürzt. |
| M4 l-08 Fahrradständer | **umgesetzt**: k2 › wahl 1/2 → neues `ende3` („Ein Rad verschwindet in den Hof, vier bleiben …“ – passt so auch zur Rückmeldung „die Räder bleiben, wo sie sind“). Die „rechte Wand“ steht jetzt im Lagetext (die beste Antwort behauptete sonst Ungesagtes). k1b › wahl 1 auf ≤ 140 Zeichen gekürzt. |
| M5 l-09 Anhang | **umgesetzt** („Der Pate kommt auf Seite 1“); Fazit so gefasst, dass es auch nach schwachem Anfang stimmt. „Ansprechpartner je Tag“ und „zeitnah ein Gespräch“ in den Lagetext aufgenommen (beste Antworten zitierten sie). |
| M6 l-07 | **umgesetzt** (k4 › wahl 1 → `ende2`); `ende2` sagt nicht mehr „die Meldung war gut“ (stimmte auf schwachen Wegen nicht). |

### Sollte
| Befund | Stand |
|---|---|
| S1 Kursplan m | **umgesetzt**: nur Reihenfolge – L nach 3-02 = l-12, nach 3-03 = l-11, nach 3-04 = l-14, nach 3-05 = l-13. |
| S2 Regel 2-01 | **umgesetzt** über die Regel (Ersatztext), die Karte (blasse Verben „durchführen, vornehmen, tätigen“ als Kennzeichen; „einen Antrag stellen“ ausdrücklich als übliches Paar) und 2-01-m1. Die Karte „einen Antrag stellen“ bleibt in 2-01-a – sie ist jetzt regelgerecht. v-0121-Auftrag angepasst („feste, übliche Verbindung“); w-055, v-0116, v-0119 passen schon. |
| S3 Längen in einheiten-3 | **umgesetzt, aber ausgewogen**: Alle Vorschläge zusammen hätten die Datei ins Gegenteil gekippt (längste Antwort in 8 von 9 Fragen eine falsche). Jetzt: beste = längste 3/9, längste = falsch 4/9, längste = brauchbar 2/9 (3-01-a, -e, 3-04-b, -d, 3-05-c nach Vorschlag; 3-03-d über die wert-1-Antwort statt der falschen). |
| S4 l-11, l-12, l-14, l-15 | **umgesetzt**. l-11: Rückmeldungen nach Ersatz, Fazit wegeneutral. l-12: neuer Knoten `k2b` – aber anders als vorgeschlagen, weil „Vigilanz“ in k2 › wahl 3 dein eigener Vorschlag ist (Jonas kann ihn nicht „verteidigen“): Jonas übernimmt deinen Satz, du merkst das Wort selbst; die schwache Antwort führt zu neuem `ende3` (das alte ende2 spricht von einem „pauschalen Urteil“ und passte nicht). l-14: k2 › wahl 2 → `ende3`, dessen Fazit nun Spott **und** Pauschalurteil abdeckt; ende1 nach Ersatz. l-15: neuer Knoten `k4b`; die schwache Antwort dort führt zu neuem `ende4` statt zu k5 (sonst hätte ende1 nach erneuter Lobhudelei gelobt); in ende1 antwortet Renate auf den letzten Satz („Auf Verlass. Das lass ich mir gefallen.“); k5 › wahl 1 Rückmeldung nach Ersatz. |
| S5 v-0236 Quantensprung | **umgesetzt**; neue wert-1-Antwort „eine kleine Hilfe im Alltag“ statt „ein echter Fortschritt“ (auch das wäre für ein paar Minuten noch zu groß). |
| S6 formal/formell | **umgesetzt** (2-05-c, Begründung mit beiden Duden-Bedeutungen von „formal“). Optionaler Kartenzusatz nicht übernommen (Karte nahe an 420 Zeichen, kein Gewinn für die Aufgabe). |
| S7 v-0195 | **umgesetzt**; nachgerechnet: 420/1.284 = 32,7 %; 420 in rund 62 Arbeitstagen ≈ 7 je Tag. |
| S8 fc-031 | **umgesetzt** (effektiv = 1, effizient = 0). |
| S9 fc-026 | **umgesetzt**. |
| S10 fc-030 | **umgesetzt**. |
| S11 fc-038 | **umgesetzt**. |
| S12 Deutsch | **umgesetzt** (l-06, fc-032, fc-033, alle fünf Anführungen in der Anführung). |
| S13 Musterlösungen | **umgesetzt** (2-03-c, v-0127, v-0270). |
| S14 Beleg Vergleiche | **umgesetzt** (3-02 `belegHinweis`; im Ersatz war der letzte Satz verdreht – „Meinungen lenken Bildwörter“ –, richtig: „Ein einzelnes Bildwort lenkt Meinungen kaum“). w-043 → Beleg P. |
| S15 Gefühlswortschatz | **umgesetzt** (3-05 Aha, w-016). Dazu in der 3-05-Schätzfrage „Die meisten erwarten das Gegenteil“ → „Viele …“ (die Quelle sagt nur „eher“). |

### Kann
| Nr. | Stand |
|---|---|
| 1 v-0113 | umgesetzt. |
| 2 3-03-a | umgesetzt (Fehler hängt jetzt an der Bitte, „Danke.“ ist fehlerfrei). |
| 3 notwendig/hinreichend | umgesetzt in der Karte von 2-02 („– wenn sie das Einzige ist, was fehlt“). v-0134 bleibt: In den Alltagslagen (Umtausch, Zutritt) ist die genannte Bedingung die einzige. |
| 4 v-0167 | umgesetzt. |
| 5 3-03 Schätzfrage | bewusst nicht: Auch drei Einzeloptionen plus „alles“ blieben erratbar; die Auflösung lehrt den Punkt. |
| 6 v-0181 | umgesetzt (Konsens = Übereinstimmung, sagt nichts übers Nachgeben). |
| 7 v-0224 | umgesetzt (konsistent). |
| 8 l-12 Hotel | umgesetzt, eigene Fassung: „Wie mit Schlüsseln: Für jede Tür ein eigener. Wird einer geklaut, kommt der Dieb nur durch diese eine Tür.“ |
| 9 l-10 Abgabe | umgesetzt („die Abgabe vom 12. liefere ich schon am 7.“); Abgabe, Carlas zwei Tage im Monat und Albers' knappe Mails stehen jetzt im Lagetext. |
| 10 v-0107 | umgesetzt, anders: Die Frage nennt jetzt „die Wendung vom Nagel“; wert 1 = „ins Schwarze getroffen“ (richtig, aber andere Wendung). „ziemlich genau getroffen“ wäre keine Fassung einer Redewendung. |
| 11 v-0120 | umgesetzt (Lieferant; „für einen Geschäftspartner zu knapp“). |
| 12 Längen Vorrat/Lagen | teils: in den geänderten Knoten mitgemischt; das Prüfskript meldet nichts. Keine Umbauten nur der Länge wegen. |
| 13 Gruppe w-042–045 | umgesetzt, anders: in bestehende Gruppen einsortiert (w-042/043 „Das genaue Wort“, w-044/045 „Heikles und Ton“) statt einer neuen. |
| 14 Unsicherheit | umgesetzt (2-04-c beide Muster „wird wohl zu eng“, v-0148 „etwa drei Wochen“, v-0199 „kann … Zeit sparen“, Kriterium ergänzt). |
| 15 w-051 | umgesetzt. **Für den Hauptstrang:** `06_INHALT_REGELN_MUSTER.md` §10 zeigt noch „Das geht nicht vor Freitag.“ → „Das schaffe ich bis Freitag.“ als Muster – widerspricht 2-02. |
| 16 2-02-d | umgesetzt. |
| 17 fc-034, fc-035 | umgesetzt (fc-035: „bei der Mitgliederversammlung des Vereins“). |
| 18 2-05-c offiziös | umgesetzt. |
| 19 l-15 k3 Rückmeldung | umgesetzt. |
| 20 v-0208 | nichts zu ändern. |

### Darüber hinaus (wiederkehrende Fehler geprüft)
- **Schluss-Texte auf schwachen Wegen:** Die `ende1`-Fazits von l-06 bis l-15 beginnen jetzt mit dem, was auf **jedem** Weg dorthin stimmt (meist die letzte, starke Entscheidung), und nennen den Rest als Maßstab statt als Lob. „Kein Drama – die Rede/der Inhalt war gut“ in l-11 und l-15 ersetzt.
- **Beste Antworten ohne Grundlage:** Tatsachen, die beste Antworten nannten, stehen jetzt im Lage- oder Knotentext (l-08 rechte Wand, l-09 Ansprechpartner/„zeitnah“, l-10 Carla/Abgabe/Albers' Stil, l-11 Miriam fragt und hört zu, l-15 Kuchen und die zwei Wochen mit sechzehn; „montags um neun“ → „montags früh“).
- **Antworten in Lagen ≤ 140 Zeichen:** l-08 k1b, l-10 k6, l-13 k2, l-14 k3, l-15 k4 gekürzt.
- **Laut/still:** Die stille Ersatzübung v-0186 hat jetzt auch den Schritt „Kern am Schluss ohne Blatt“ wie die laute 3-03-c.
- **Rechnungen:** 120.000 Blatt ≈ 480 je Arbeitstag ≈ fast ein Paket (2-06) und 2.347 Arbeitstage in zehn Jahren (l-11) geprüft – stimmen.
