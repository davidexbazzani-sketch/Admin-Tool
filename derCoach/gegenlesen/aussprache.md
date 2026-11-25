# Gegenlesen: `aussprache` (Kern, Phase Grundlagen)

**Datum:** 25.11.2026 · **Blick:** Fachlektorat und Faktenprüfung, Sicht einer Logopädin bzw. Sprecherzieherin
**Geprüft:** `src/coach/inhalt/aussprache/` – `quellen.json`, `wissen.json`, `einheiten-1.json`, `lagen-1.json`,
`vorrat-01.json`, `vorrat-02.json`, `leiter.json`, `tests.json`, `kurs.json`. Die Schwerpunkt-Dateien (`-n`, `-l`, `-s`)
wurden nicht angefasst.
**Maßstab:** `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md`
(Abschnitt 3 und 16), Vergleich mit `konter/`.

## 1. Was geprüft wurde

- **Fakten an der Quelle:** Lam & Tjaden 2013 (Volltext PMC), Smiljanić & Bradlow 2009 (Volltext PMC, darin Picheny 1985,
  Payton 1994, Ferguson 2004, Krause & Braida 2004, Bradlow & Bent 2002), Stipancic u. a. 2016 (Volltext PMC),
  die Studie von 2019 zu älteren Zuhörern (Zusammenfassung), Plutarch, Demosthenes Kap. 11, Hullar (Scientific American).
  Gollwitzer & Sheeran 2006, Harkin u. a. 2016, Maas u. a. 2008, Newman & Schwarz 2018, DIN 5009:2022, Siebs,
  Krech u. a. 2009 und Hey/Reusch auf Autoren, Jahr, Zeitschrift und Kennzahlen abgeglichen.
- **Ergebnis:** Die Kernzahlen stimmen: +15 / +21 / +26 Prozentpunkte (12 Sprecher, 40 Zuhörer, Stimmengewirr),
  17 Punkte bei 5 schwerhörigen Zuhörern, 20 und 26 Punkte bei einem Sprecher, 14 und 23 Punkte bei 8 Zuhörern
  (55 bis 68 Jahre), 32 gesunde Sprecher („deutlich“ und „laut“ besser, „langsam“ nicht), d = 0,65 über 94 Vergleiche,
  d = 0,40 über 138 Studien, vier Wochen Heiserkeit. Die Beleg-Stufen sind ehrlich vergeben, auch die vorsichtigen
  Hinweise bei B, D und U.
- **Fachlich:** Artikulation (Vokalgruppen, Lippenrundung bei ü und ö, Lösen von p, t, k, lang und kurz), Lockern,
  Daumenprobe, Stimmschonung („ohne Druck im Hals“, „nicht schreien“), Dialekt, Grenze zur Fachhilfe (Arztpraxis,
  HNO-Praxis, Logopädie bei Poltern, 112 bei plötzlich verwaschener Sprache). Es gibt keine festen Zuzahlungsbeträge,
  kein Flüstern als Dauerübung und keine Übung, die zum Pressen anleitet.
- **Didaktik:** Alle 7 Einheiten sind in 6 bis 7 Minuten machbar und bauen aufeinander auf (Hören → Klar-Modus → Öffnung →
  Enden → Pausen → dichte Wörter → Alltag). Die besten Antworten sind wirklich die besten, die falschen Antworten
  plausibel. Die Lagen haben echte Verzweigungen und eine Rettung. Der Kursplan hat die Form 7 E / 7 Ü / 4 L / 2 A / 1 S.
- **Sprache:** Du-Form, kurze Sätze, keine verbotenen Wörter. Figuren stammen aus der Besetzung (Ausnahmen siehe Korrekturen).
  Die Telefonnummern liegen in den freigehaltenen Blöcken 030 23125 … und 040 66969 ….
- **Technik:** `node scripts/coach-index.mjs` lief durch. `node scripts/coach-pruefe.mjs --nur aussprache` meldet vorher und
  nachher **0 Fehler, 0 Hinweise**. Dazwischen erschien ein Hinweis zu `aussprache-fc-019`, der behoben ist.

## 2. Korrekturen (direkt vorgenommen)

Kennungen und Struktur sind unverändert. Geändert wurde nur Text.

| # | Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|---|
| 1 | quellen.json | `lam2013` | „JSLHR (2013)“ → „JSLHR 56(5), 1429–1440“, dazu: „alle zwölf Sprecher gewannen …, Rangfolge bei 10 von 12 gleich“ | Fundstelle ergänzt; die 10 von 12 betreffen nur die Rangfolge der Anweisungen |
| 2 | quellen.json | `ferguson2004` | „schwankte stark“ → „schwankte bei Vokalen von −12 bis +33 Prozentpunkten“ | Spanne laut smiljanic2009; einzelne Sprecher wurden schlechter verstanden |
| 3 | quellen.json | `plutarch` | „gegen die Brandung anreden. Plutarch selbst zweifelt …“ → Kiesel, Laufen und Bergaufgehen, auf einen Atem sprechen, Spiegel; „nur aus zweiter Hand (Demetrios von Phaleron)“; Brandung steht bei Cicero und Quintilian | Die Brandung kommt bei Plutarch nicht vor, ein ausdrücklicher Zweifel ebenfalls nicht |
| 4 | wissen.json | `aussprache-w-101` | „… gegen die Brandung angesprochen … Plutarch zweifelt selbst“ → „… vor einem großen Spiegel geprobt … Plutarch kennt das nur aus zweiter Hand.“ | wie 3 |
| 5 | wissen.json | `aussprache-w-087` | „zehn von zwölf Sprechern nach demselben Muster besser verstanden“ → „alle zwölf Sprecher besser verstanden – manche nur wenig, manche sehr viel“ | Die alte Fassung legte nahe, zwei Sprecher hätten nicht gewonnen. Falsch: Alle 12 gewannen |
| 6 | wissen.json | `aussprache-w-093` | „von gar keinem bis zu einem großen“ → „von leicht schlechter bis zu gut 30 Prozentpunkten mehr“ | Spanne −12 bis +33 |
| 7 | einheiten-1.json | `aussprache-1-02` (schaetzen) | „besser verstanden wurden fast alle“ → „… alle zwölf“ | Tabelle der Studie: alle positiv |
| 8 | wissen.json | `aussprache-w-115` | „hilft auch ihnen messbar“ → „… messbar – in Studien oft etwas weniger als Muttersprachlern“ | Bradlow & Bent 2002 nach smiljanic2009 |
| 9 | wissen.json | `aussprache-w-094` | „Wer schlecht hört, spricht oft selbst undeutlicher.“ → „Wer schlechter hört, spricht manchmal lauter oder undeutlicher, ohne es zu merken – dann klärt ein Hörtest mehr als jede Übung.“ | „oft“ ist ohne Quelle zu stark; dazu ein klarer Weg (Hörtest) |
| 10 | wissen.json | `aussprache-w-006` | „Gerade die Enden – „nicht“, „ist“, „haben“, „gestern“ – unterscheiden … Zeit, Zahl und Verneinung“ → „sagt/sagte, Kunde/Kunden, dem/den … und kleine Wörter wie „nicht“ und „ist“ gehen ohne ihr t leicht unter“ | Sprachlich falsch: Die Verneinung steckt nicht im Wortende, und „ist“/„is“ ist keine Verneinung |
| 11 | einheiten-1.json | `aussprache-1-04` (karte) | „Zeit, Zahl und Verneinung … gesagt oder sagen, Kunde oder Kunden, ist oder is“ → „Zeit, Zahl und Fall … sagt oder sagte, Kunde oder Kunden, dem oder den“ | wie 10; „gesagt/sagen“ unterscheidet sich auch am Wortanfang |
| 12 | einheiten-1.json | `aussprache-1-04` (vergleich) | schwach „… fertich“ → „… fertig“; stark „Es ist morgen fertig“ → „Es ist erst morgen fertig“ | **Fachfehler:** [ɪç] für -ig am Wortende ist die Standardaussprache, kein Nuscheln. Die Paare sind jetzt gleichwertig |
| 13 | einheiten-1.json | `aussprache-1-04-a` (Teil „Is“) | „das t macht die Frage hörbar“ → „mit t ist der Anfang der Frage klar zu hören“ | Eine Frage hört man an der Satzmelodie, nicht am t |
| 14 | einheiten-1.json | `aussprache-1-03` (Daumenprobe) | Schritt 1 ergänzt: „Schmerzt der Kiefer, lass die Übung weg.“ | Sicherheit bei Kiefergelenkbeschwerden |
| 15 | vorrat-01.json | `aussprache-v-0035` | „Erst mit der Daumenkuppe zwischen den Zähnen“ → „Erst mit der frisch gewaschenen Daumenkuppe locker zwischen den Zähnen“ | Hygiene und „nicht zubeißen“ wie in der Einheit |
| 16 | einheiten-1.json | `aussprache-1-06-c` | „zwo – drei – eins – zwo – fünf, \| null – vierzehn“ → „zwo – drei, \| eins – zwo – fünf, \| null – eins – vier“ | Widerspruch zur eigenen Karte („Zweier- oder Dreiergruppen“, „vierzehn → eins, vier“) |
| 17 | einheiten-1.json | `aussprache-1-06-a` (Antwort Mail) | „hat gerade keinen Stift am Rechner“ → „sitzt gerade nicht am Rechner“ | Die Begründung war unlogisch: Für eine Mail braucht er keinen Stift |
| 18 | einheiten-1.json | `aussprache-1-07` (regel) | „… schlägt jeden guten Vorsatz“ → „… trägt weiter als „ab jetzt immer““ | Überversprechen: Ein Wenn-Dann-Plan ist selbst ein Vorsatz, die Wirkung gilt im Schnitt |
| 19 | lagen-1.json | `aussprache-l-55` k3 | „Zehn Ziffern ohne Luft“ → „Elf Ziffern …“ | 040 66969 114 hat elf Ziffern |
| 20 | lagen-1.json | `aussprache-l-55` k5 | „ruft zurück: … Die Nummer für Rückfragen – …“ → „ruft über die Zentrale an: … Ihre Nummer – …“ | Logikfehler: Wer zurückruft, kennt die Nummer schon |
| 21 | vorrat-01.json | `aussprache-v-0055` | „Brücke, Bäckerei, Hügel“ → „Brücke, Brötchen, Hügel“ | Prüfliste „Umlaute mit runden Lippen“ – ä wird **nicht** gerundet |
| 22 | vorrat-01.json | `aussprache-v-0044` | „Die Länge hängt am Tempo, nicht an der Öffnung.“ → „Ob ein Vokal lang oder kurz ist, hängt am Wort – nicht an der Öffnung.“ | Die Vokallänge unterscheidet im Deutschen Wörter und hängt nicht am Tempo (vgl. Miete/Mitte) |
| 23 | vorrat-01.json | `aussprache-v-0034`, `aussprache-v-0036` | „Anna“ → „Carla“ | Figuren nur aus der Besetzung (Carla Demir); die vielen a bleiben |
| 24 | vorrat-01.json | `aussprache-v-0037` | „Wo wohnt Willi?“ → „Wo wohnt Miriam?“ | wie 23; w, o und i bleiben |
| 25 | vorrat-02.json | `aussprache-v-0060` | „Was verrät hier allein das Wortende?“ → „Was verrät hier das Wortende?“ | Bei „der Kunde – die Kunden“ und „ein – zwei“ verrät es nicht „allein“ das Ende |
| 26 | vorrat-02.json | `aussprache-v-0072` (Antwort „oben lassen“) | „klingt aber wie eine Frage und wirkt unsicher“ → „klingt aber leicht wie eine Frage“ | Steigende Satzenden sind in manchen Regionen üblich. Keine Wertung des Klangs (Dialekt kein Fehler) |
| 27 | tests.json | `aussprache-fc-019` | Frage fast wörtlich wie `aussprache-1-02-b`/`aussprache-v-0013` → neue Übertragungslage (Plausch, Kundenanruf mit Bestellnummer, Mittagspause) mit drei begründeten Antworten | Das Prüfskript meldet: misst Wiedererkennen statt Übertragen. Gleiche Fähigkeit, gleiche Kennung |

**Nach Art:** Fakten und Quellen 9 (1–9) · Fachlich (Phonetik, Sicherheit, Hygiene) 7 (10–15, 21) · Logik und Klarheit 6
(13, 16, 17, 19, 20, 22) · Ehrlichkeit 2 (18, 26) · Regeln (Besetzung) 2 (23, 24) · Didaktik und Tests 2 (25, 27).
Nr. 13 zählt zweimal. Zusammen sind es **27 Korrekturen**.

## 3. Offene Punkte (nicht geändert, Empfehlung)

1. **`{name}` ohne Namen zerbricht Übungssätze (wichtig, Technik).** `mitName()` in `src/coach/ansicht/hilfen.tsx`
   streicht den Platzhalter. Hier ist `{name}` aber der eigene Name des Nutzers, der *gesprochen* werden soll. Ohne
   Namen wird daraus „Guten Morgen am Apparat.“, „Hier ist wegen Ihrer Lieferung“ oder „Ich bin und kümmere mich …“.
   Das betrifft 20 Stellen in `einheiten-1`, `lagen-1`, `vorrat-01` und `wissen`. **Empfehlung:** In Sprech-Formaten
   (`nachsprechen`, Lagen-Wahl, Beispiele) ohne Namen „[dein Name]“ einsetzen statt streichen. Ein eigenes Kennzeichen
   wie `{eigenerName}` wäre auch möglich. Das ist Sache des Hauptstrangs.
2. **Stille Ersatzübungen sind meist Wissensfragen.** Jede laute Übung verweist auf eine stille Übung derselben
   Fähigkeit, meist `auswahl`/`zuordnen`. Das erfüllt die Regel, übt aber Erkennen statt Bewegung. Das Muster in `06`
   (`aussprache-1-02-s`: „stumm und überdeutlich sprechen, nur mit Lippen, Zunge und Kiefer“) fehlt ganz.
   **Empfehlung:** Zum Beispiel in Stufe 2 einige echte Stumm-Übungen ergänzen (stumm überdeutlich, Pausenzeichen
   setzen, Mundbild im Spiegel) und die `leise`-Verweise der Sprech-Einheiten 1-02, 1-03 und 1-04 darauf legen.
3. **„eins – vierzehn“ in der Mailbox-Nummer** (`aussprache-w-034`, `aussprache-l-55` k3/k5b). Der Coach lehrt
   „vierzehn → eins, vier“, spricht die Nummer aber selbst mit „vierzehn“. In l-55 führt sogar der beste Weg zur
   Rückfrage „vierzehn oder vierzig?“. Didaktisch kann das gewollt sein. **Empfehlung:** In k3 „eins – eins – vier“
   als beste Antwort und k5 in eine andere Rückfrage ändern, oder k5 ausdrücklich als „trotzdem passiert's – so
   rettest du es“ rahmen. Bei `w-034` „eins – eins – vier“ schreiben.
4. **`wert: 1` für sachlich falsche Aussagen:** `aussprache-v-0057` („Ihn länger halten“), `aussprache-fc-011` („ü weiter
   hinten“) und `aussprache-v-0042` („Tür – Tier“). Die Begründungen korrigieren es zwar, aber 1 Punkt signalisiert
   „halb richtig“. **Empfehlung:** auf 0 setzen oder durch eine wirklich brauchbare Teilantwort ersetzen.
5. **Korken „kurz ausprobieren“** (`aussprache-fc-005`, wert 1, „Kurz schadet kaum“). Ein Fremdkörper im Mund birgt
   Verschluck- und Aspirationsgefahr. `aussprache-v-0030` nennt Verschlucken nur als Nebengrund. **Empfehlung:** fc-005
   wert 0 oder Begründung „lieber nicht – Verschluckgefahr, und der Daumen erfüllt denselben Zweck“.
6. **Weitere Fast-Doubletten** (das Prüfskript meldet sie nicht): `aussprache-fc-003` ≈ `aussprache-v-0004` (Rückmeldung
   „am Telefon verstehe ich dich schlecht“), `aussprache-fc-020` ≈ `aussprache-1-07` Vergleich (dieselben beiden Vorsätze),
   `aussprache-fc-013` ≈ `aussprache-1-05` Mythos. **Empfehlung:** Die Testfragen in neue Lagen kleiden wie bei fc-019.
7. **Faustregel „Daumen quer“** (w-004, 1-03, v-0029). Das ist übliches Praxiswissen, aber mehrdeutig („quer“ =
   Daumenbreite oder Daumendicke?). **Empfehlung:** präzisieren, etwa „Daumenkuppe flach (Nagel nach oben) zwischen den
   Schneidezähnen“. Inhaltlich bleibt es Stufe P.
8. **Quellen ohne Prüfung:** `coblenzer1976`, `linklater1976` und `berry1973` (`geprueft: false`, „aus dem Gedächtnis“)
   tragen nur Bucheinträge ohne Zahlen. Das ist zulässig. Vor einer Freigabe für alle wäre ein kurzer Blick in die Bücher
   gut. Bei `krause2019` stehen keine Autoren; die Zahlen (8 Zuhörer, 55–68 Jahre, 4 Sprecher, +14/+23) habe ich an der
   Zusammenfassung bestätigt.
9. **Kleinigkeit:** In `aussprache-v-0020` ergibt die zusammengezogene Nummer „nullvierhundert…“ ausgeschrieben 0400 66969
   statt 040 66969. Das ist als Nuschel-Beispiel unschädlich und keine echte Nummer, sollte aber zur Sauberkeit auf
   „nullvierzigsechsundsechzig…“ geändert werden.

## 4. Urteil

**Freigabereif: ja, mit einer Bedingung.** Fachlich und sachlich ist der Kern nach den Korrekturen solide, ehrlich belegt
und respektvoll gegenüber Dialekt, Hörproblemen und Unsicherheit. Er ist auf dem Niveau von `konter/`. Vor einer Freigabe
für Nutzer **ohne gesetzten Namen** muss Punkt 3.1 (`{name}` in Sprechsätzen) technisch gelöst sein, sonst erscheinen
kaputte Übungssätze. Die Punkte 3.2 bis 3.6 verbessern die Qualität und sind keine Hürde.
