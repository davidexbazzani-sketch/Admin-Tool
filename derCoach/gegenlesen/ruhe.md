# Gegenlesen: Bereich `ruhe` („Nervosität im Griff“)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Fachlektor und Faktenprüfer · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md` (Prüfliste 16, Sonderregeln `ruhe`), `src/coach/kern/inhaltTypen.ts`, Lehrplan `05` Abschnitt 3.2.
- Alle Dateien in `src/coach/inhalt/ruhe/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`. Dazu `gemeinsam.json` (Werkzeuge, Fachhilfe), `besetzung.json`, `quellen.json`.
- Fakten an der Quelle geprüft (Abstract oder Volltext): Behnke & Sawyer 2004, Brooks 2014, Poynter & Pasqualini 2025, Bosshard & Gomez 2024 (mit Verzerrungs-Analyse), Rupprecht u. a. 2021, Liu u. a. 2024, Hofmann u. a. 2009, Kross u. a. 2014, Webb u. a. 2012, Manzoni u. a. 2008, Ebrahimi u. a. 2019, McWilliam u. a. 2025, Laborde u. a. 2022 (Frage Ein-/Ausatem-Verhältnis). Stichproben zu Autor, Jahr, Zeitschrift, Band: Zaccaro 2018, Hatzigeorgiadis 2011, Teigen 1994, Steenen 2016, Savitsky & Gilovich 2003, Mulkens 2001 – ohne Befund.
- Brooks 2016 (zurückgezogen): kommt nirgends als Beleg vor. Wo Rituale erwähnt werden, steht ausdrücklich, dass die Studie zurückgezogen ist und nicht verwendet wird (`ruhe-w-009`, `ruhe-1-07`, `ruhe-v-0095`). In Ordnung.
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur ruhe`, vorher und nachher je **0 Fehler, 0 Hinweise**. Alle JSON-Dateien lassen sich einlesen.

## Gesamteindruck

Der Bereich ist sorgfältig gemacht. Die Belege sind in aller Regel ehrlich eingestuft, und die Korrekturen aus `08` sind umgesetzt (Verlauf, Umdeuten, Atmen, Rituale). Die Sicherheitsregeln sind eingehalten: Schwindel-Hinweis bei den Atemübungen, kein Heilversprechen, keine Medikamentenempfehlung, Fachhilfe „seele“ gleich in Einheit 1. Auch der Hinweis auf Alkohol oder Tabletten als Krücke steht an mehreren passenden Stellen. Ton, Besetzung und Du-Form passen, Qualität und Dichte entsprechen dem Bereich `konter`. Die Mängel waren vor allem überzogene oder ungenaue Zahlen-Sätze und einige kleinere didaktische Unschärfen.

## Korrekturen (alle Kennungen unverändert, nichts gelöscht)

### Fakten und Beleg-Hinweise (9)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| wissen | `ruhe-w-009` | „verbessern … deutlich – auch unter Druck (g = 0,70; 112 Vergleiche)“ → „In Experimenten deutlich (g = 0,64), unter Druck ähnlich (g = 0,70, aber unsicherer), in Vorher-nachher-Vergleichen weniger stark“ | Die 112 Effektgrößen gehören zur ganzen Meta-Analyse, nicht zu g = 0,70. Der Wert unter Druck hat ein sehr breites Vertrauensintervall (0,24–1,16), und vorher-nachher ist der Effekt klein (0,31). |
| wissen | `ruhe-w-011` | Selbstgespräch im Sport hilft „im Mittel deutlich“ → „im Mittel mittelstark“ | Hatzigeorgiadis 2011: Effekt 0,48, also mittelstark (so steht es auch in `quellen.json`). |
| wissen | `ruhe-w-012` | „Anspannen und Loslassen der Muskeln senkt Angst im Mittel mittelstark“ → „Entspannungstraining – etwa Anspannen und Loslassen der Muskeln – senkt …“, dazu ein neuer `belegHinweis` | Manzoni 2008 fasst Muskelentspannung, autogenes Training, angewandte Entspannung und Meditation zusammen (Meditation wirkte am stärksten). Den Gesamteffekt darf man nicht allein der Muskelentspannung zuschreiben. |
| wissen | `ruhe-w-101` | „Hält: Muskelentspannung senkt Angst …“ → „Hält: Entspannungstraining, darunter die Muskelentspannung, senkt Angst …“ | wie oben |
| wissen | `ruhe-w-014` | belegHinweis „Meta-Analyse über 14 Studien … über 400 Milligramm am Tag“ → „… über 14 kleine, recht unterschiedliche Studien … besonders über 400 Milligramm“ | Liu 2024: meist einzelne verabreichte Mengen, keine Tagesmenge; die Streuung ist sehr hoch (I² ≈ 95 %), insgesamt 546 Personen. |
| wissen | `ruhe-w-015` | „Programme …, die genau so arbeiten“ → „… die viel auf Üben vor Publikum setzen“; belegHinweis „bei großer Streuung“ → „schwankt zwischen den Studien, in der neueren stark. Untersucht sind ganze Programme, nicht einzelne Proben.“ | Die Meta-Analysen untersuchen Behandlungsprogramme, nicht das Proben selbst. Ebrahimi 2019 hatte nur geringe bis mittlere Streuung, McWilliam 2025 eine hohe. |
| wissen | `ruhe-w-020` | Beleg A ohne Hinweis → Beleg A mit `belegHinweis` („Belegt sind Programme … Dass schon einzelne Proben so wirken, ist eine Übertragung.“) | Ehrliche Abgrenzung, sonst wirkt der Tipp selbst wie mit A belegt. |
| wissen, einheiten | `ruhe-w-005`, `ruhe-1-04` (belegHinweis) | Satz ergänzt: „Ob das längere Ausatmen mehr bringt als langsames Atmen allein, ist uneinheitlich untersucht.“ | Studien zum Verhältnis von Ein- und Ausatmen sind gemischt (z. B. Meehan & Shaffer 2024: drei ohne Unterschied, vier mit Vorteil fürs lange Ausatmen). Belegt ist vor allem das langsame Atmen. |
| einheiten | `ruhe-1-03` (Schritt `studie`, ergebnis) | „Beide Male fühlten sich die Umdeuter zuversichtlicher.“ → „… begeisterter und zuversichtlicher – weniger Angst hatten sie aber nicht.“ | Brooks 2014 und die Wiederholung 2025: mehr Begeisterung (excitement), aber **nicht** weniger Angst. Das gehört ehrlich dazu (siehe offener Punkt 1). |

### Sicherheit und Regeln (4)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| wissen | Seite (`kern`) | „Du musst nicht ruhig sein …“ → „Du brauchst nicht ruhig zu sein …“ | „du musst“ ist verboten (LIESMICH 5, `06` Abschnitt 2), auch verneint. Das Prüfskript sieht `kern` offenbar nicht. |
| wissen | `ruhe-w-095` | „… oder über die 116 117 einen Termin … zu holen“ → „… oder einen Termin für eine psychotherapeutische Sprechstunde zu vereinbaren“ | Rufnummern nur über die Fachhilfe-Texte (zentral gepflegt). |
| vorrat-01 | `ruhe-v-0004` | „Hausarztpraxis oder die 116 117 sind gute erste Schritte“ → „die Hausarztpraxis ist ein guter erster Schritt“ | wie oben |
| leiter | `ruhe-m-01` | Satz ergänzt: „Wird dir schwummrig: aufhören und normal weiteratmen.“ | Sonderregel `ruhe`: Jede Atemübung trägt den Schwindel-Hinweis, auch die Mission. „Nicht am Steuer“ ist durch „am Schreibtisch“ abgedeckt. |

### Didaktik und Inhalt (7)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten | `ruhe-1-01-a` | Karten „Die Hände werden feucht.“ / „Schweiß auf der Stirn“ (Fach Kühlung) → „Du fängst an zu schwitzen.“ / „Auf der Stirn steht Schweiß.“ | Feuchte Handflächen dienen nicht der Kühlung; Schwitzen an Handflächen bei Aufregung gilt nicht als Wärmeabgabe. Zugleich fehlte der Punkt am Satzende. |
| vorrat-01 | `ruhe-v-0007` | Karte „die Fragerunde am Ende eines längeren Vortrags“ (→ gesunken) → „die letzte Minute eines längeren Vortrags“ | Widerspruch zu `ruhe-1-02-b`: Dort steht zu Recht, dass die Aufregung bei einer Frage wiederkommen kann. |
| vorrat-01 | `ruhe-v-0009` | Rangfolge „erster Satz“ vor „Warten kurz davor“ → „Kurz vor dem Start und der erste Satz“ · „zweite, dritte Minute“ · „Mitte des Vortrags“ · „letzte Minute“ | Welcher der beiden Momente stärker ist, hängt vom Maß ab: Seelisch ist es oft das Warten, körperlich der Beginn (Behnke). Die feste Reihenfolge hätte richtige Antworten als falsch gewertet. |
| vorrat-01 | `ruhe-v-0012` | Muster „… mein Körper fährt hoch, er fällt nicht um.“ → „… mein Körper macht sich bereit.“ | Kein Versprechen über den Körper, das im Einzelfall nicht stimmen muss. |
| vorrat-01 | `ruhe-v-0046` | Warum zu Antwort 1: „noch wirksamer ist, deutlich länger aus- als einzuatmen“ → „langsam atmen hilft. Mit langem Ausatmen hast du dazu einen festen Takt, an den du dich halten kannst.“ | Den Vorrang des langen Ausatmens vor ruhigem, langsamem Atmen geben die Daten nicht sicher her (siehe oben). |
| lagen | `ruhe-l-01`, Knoten `k3b`, Wahl 2 | Rückmeldung „Er versteht jetzt mehr …“ → „Ein Neuanfang ist gut. Nur bleibt das Tempo – er versteht wieder wenig, …“ | Die Wahl lautet „genauso schnell“; die alte Rückmeldung widersprach ihr. |
| tests | `ruhe-fc-016` | Antwort mit wert 1 „Möglichst viele Schritte, damit nichts fehlt.“ (Begründung: überfordert) → „Ein einziger Baustein, zum Beispiel einmal lang ausatmen.“ – „Ein guter Kern – mit zwei, drei festen Bausteinen mehr trägt sie besser.“ | Die alte Antwort war laut eigener Begründung schlecht und widersprach `ruhe-v-0094` (dort wert 0). |

### Sprache (2)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| vorrat-01 | `ruhe-v-0016` | „Frisch klingt es auch nach Proben – sicherer bist du dann trotzdem.“ → „Frisch klingt es auch nach dem Proben – und du gehst sicherer hinein.“ | Der Satz war unklar. |
| wissen | `ruhe-w-083` | „Auch Erfahrene … – der Körper fährt bei fast allen hoch.“ → „Auch viele Erfahrene … – der Körper fährt hoch, wenn etwas wichtig ist.“ | „bei fast allen“ ist eine Mengenangabe ohne Quelle (Behnke untersuchte Studierende). |

**Summe: 22 Korrekturen** (9 Fakten/Beleg, 4 Sicherheit/Regeln, 7 Didaktik, 2 Sprache). Danach Index neu erzeugt, Prüfskript: 0 Fehler, 0 Hinweise.

## Offene Punkte (Ermessen – nicht geändert)

1. **„Man fühlt sich zuversichtlicher“ (Vorgabe aus `08`).** Brooks 2014 und die Wiederholung 2025 haben vor allem *Begeisterung* (excitement) gemessen. Weniger Angst hatten die Teilnehmer nicht. Ob „zuversichtlicher“ als Selbstauskunft gemessen wurde, konnte ich im Abstract nicht bestätigen. Das Wort steht in `ruhe-w-003`, `ruhe-w-029`, `ruhe-1-03` (belegHinweis, studie, Merkkarte m2), `ruhe-v-0031` und `ruhe-fc-008`. **Empfehlung:** Der Hauptstrang prüft am Volltext und schreibt gegebenenfalls „man fühlt sich eher bereit und begeistert – weniger Angst hat man dadurch nicht“. Bosshard 2024 misst nur Leistung, nicht das Gefühl. Die Aussage „das Gefühl verbessert sich verlässlich“ stützt sich also allein auf Brooks und Poynter. Das ist eher „gestützt“ als „verlässlich“.
2. **Tests fast gleich wie Übungen.** Mehrere Formcheck-Fragen gleichen Trainingsaufgaben fast wörtlich, samt gleicher Antworten. Betroffen sind `ruhe-fc-004` ≈ `ruhe-1-04-a`, `fc-013` ≈ `1-05-a`, `fc-017` ≈ `1-07-b`, `fc-021` ≈ `v-0016`, `fc-023` ≈ `v-0079`, `fc-024` ≈ `v-0086` sowie `fc-019`/`fc-020` ≈ `v-0015`/`v-0023`. Der Formcheck misst dann Wiedererkennen statt Übertragen. **Empfehlung:** Für diese acht Fragen neue Lagen mit gleichem Lernziel schreiben (anderer Ort, andere Figur, andere Panne).
3. **Beleg A bei Koffein (`ruhe-w-014`, `-024`, `-072`).** Es gibt eine Meta-Analyse, aber nur 8 Arbeiten mit 546 Personen, sehr hohe Streuung und teils datengetriebene Untergruppen. Der Hinweis ist jetzt ehrlich. **Empfehlung:** A behalten, weil die Richtung durch ältere Koffein-Forschung breit gestützt ist, oder auf B senken. Das ist eine Entscheidung des Hauptstrangs.
4. **„Nicht tief ein – lang aus“ als Kernbotschaft.** Sie stammt aus dem freigegebenen Muster `ruhe-1-04`. Ob das lange Ausatmen mehr bringt als langsames Atmen allein, ist uneinheitlich untersucht (jetzt im belegHinweis vermerkt). **Empfehlung:** In Stufe 2 „langsam und lang aus“ sagen und die eigene Messung vorher/nachher betonen. Für Stufe 1 ist keine Änderung nötig.
5. **`ruhe-v-0052`, Karte „Luftnot und Brustenge, die nicht nachlassen“.** Sie ist richtig als „lieber etwas anderes“ eingeordnet, aber das Format `zuordnen` erklärt nichts. Ein Nutzer mit echten Herzbeschwerden erfährt nicht, dass er ärztliche Hilfe braucht. Der Fachhilfe-Text `notfall` betrifft nur Schlaganfall-Zeichen. **Empfehlung:** In `gemeinsam.json` (nicht meine Datei) den Text `notfall` um „Brustschmerz oder Luftnot, die nicht nachlassen: 112“ ergänzen. Oder die Karte in eine `auswahl` mit Begründung umbauen.
6. **Antworten mit wert 1, die eigentlich falsch sind.** Betroffen sind `ruhe-v-0031` („Er hilft gar nicht“), `ruhe-fc-006` („Gar nichts – Atmen wirkt nur nach Wochen“), `ruhe-fc-012` („Möglichst lange und fest anspannen“) und `ruhe-l-04` k1 („Drei starke Kaffee“). Die Begründungen erklären den Fehler, die Punktzahl lobt aber halb. **Empfehlung:** durch wirklich brauchbare Teilantworten ersetzen. Nicht dringend.
7. **Gemeinsame Werkzeuge (`gemeinsam.json`, nicht meine Datei).** Das Werkzeug `anspannen` trägt Beleg A mit `manzoni2008`. Dort gilt dieselbe Einschränkung wie bei `ruhe-w-012`: Die Meta-Analyse betrifft Entspannungsverfahren allgemein und Training über Wochen. Der Werkzeug-Hinweis („Wirkt am besten, wenn du es vorher ein paarmal geübt hast“) ist gut; ein Wort „Entspannungstraining“ wäre genauer.
8. **Quellen mit `geprueft: false`** (`mcgonigal2015`, `kahler1975`, `adler1927`, `praxis-ruhe`): Sie werden nur ohne Zahlen und für D- oder P-Einträge benutzt, das ist regelkonform. **Empfehlung:** Angaben einmal prüfen und auf `true` setzen (Kahler 1975: Transactional Analysis Journal 5(3), 280–284).
9. **Zwei beste Wahlen in Lagen** (`ruhe-l-03` k4, `ruhe-l-05` k3b): Das Prüfskript erlaubt sie in Gesprächen, didaktisch sind sie sinnvoll (zwei gleich gute Wege). Nur zur Kenntnis.
10. **Prüfskript:** Es prüft das Feld `kern` der Wissens-Seite offenbar nicht auf verbotene Wörter (Fund „Du musst nicht …“). **Empfehlung:** Prüfung auf `kern`, `einleitung` und `ziel` ausweiten.

## Didaktik – Einzelurteil der Einheiten

| Einheit | Dauer realistisch | Aufbau | Bemerkung |
|---|---|---|---|
| `ruhe-1-01` | ja (6) | zuordnen → karte → mythos → auswahl → experiment → karte → fachhilfe | Guter Einstieg; Fachhilfe früh und ohne Beschämung. |
| `ruhe-1-02` | ja (6) | schaetzen → karte → studie → rangfolge → auswahl → Mission | Die Kurve ist gut erklärt; die Grenze der Studie wird ehrlich genannt. |
| `ruhe-1-03` | knapp (7) | vergleich → karte → studie → umformulieren → kritiker → reflexion → Mission | Stark und ehrlich; zwei Schreibaufgaben hintereinander sind an der oberen Grenze der Zeit. |
| `ruhe-1-04` | ja (6) | wie Muster aus `06`, ergänzt um zuordnen | In Ordnung. |
| `ruhe-1-05` | ja (6) | schaetzen → karte → anleitung → auswahl → zuordnen → experiment → reflexion | Ohne Mission, das ist laut Lehrplan zulässig (die Mission steckt im `experiment`). |
| `ruhe-1-06` | knapp (7) | vergleich → karte → bauplan → sprechen (mit stiller Ersatzübung) → wenndann → auswahl → Mission | Sehr praxisnah. |
| `ruhe-1-07` | ja (7) | mythos → karte → rangfolge → routine → anleitung (90 s) → auswahl → Mission | Die feste Reihenfolge von Carlas Routine ist vertretbar. |

Die besten Antworten sind überall die besten, und sie stehen nicht immer an derselben Stelle. Die falschen Antworten sind plausibel und tragen meist eine `tendenz`. Missionen 1–10 steigen sinnvoll an, jede hat eine halbe Fassung. Der Kursplan folgt dem Muster genau (7 E, 7 Ü, 4 L, 2 A, 1 S).

## Urteil

**Freigabereif: ja.** Alle eindeutigen Fehler sind behoben, das Prüfskript meldet 0 Fehler und 0 Hinweise. Die offenen Punkte 1 (Wortlaut „zuversichtlicher“) und 2 (Testfragen zu nah an den Übungen) empfehle ich vor der Freigabe für alle Nutzer zu erledigen. Für die Freigabe an Davide blockieren sie nicht.
