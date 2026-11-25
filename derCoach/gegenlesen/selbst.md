# Gegenlesen: Bereich `selbst` („Selbstbewusstsein“)

**Datum:** 25.11.2026 · **Rolle:** unabhängige Gegenleserin aus drei Blickwinkeln: Psychotherapie (KVT und tiefenpsychologisch fundiert), Nutzer mit niedrigem Selbstwert, Faktenprüfung · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, Prüfliste 16), `src/coach/kern/inhaltTypen.ts`, Lehrplan `05` Abschnitt 3.11, Wissensbasis `04` Abschnitt 3, `gegenlesen/NACHARBEIT.md` und `gegenlesen/ruhe.md` als Vergleich.
- Alle Dateien in `src/coach/inhalt/selbst/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`. Dazu `besetzung.json`, `gemeinsam.json` (Fachhilfe `seele`), gemeinsame `quellen.json` sowie `ruhe/quellen.json` (`kahler1975`, `adler1927`, `epiktet`, `kross2021`).
- An der Quelle geprüft (Abstract, Verlagsseite oder Presse der Autoren): Niveau u. a. 2021 (119 Studien, d = 0,38, KI 0,33–0,43), Ferrari u. a. 2019 (27 RCTs; g = 0,75 / 0,66 / 0,57 / 0,56; Grübeln 1,37), Saiphoo u. a. 2020 (121 Stichproben, r = −0,079), Elkjær u. a. 2022 (zusammengesunken gegen neutral g = 0,45, breit gegen neutral g = 0,06), Körner u. a. 2022 (rund 130 Experimente, Selbstempfinden ja, Verhalten schwächer, Hormone nein), Flynn & Bordieri 2020, Wood u. a. 2009, Givi & Kirk 2024 (fünf Studien, Studie 2 mit 208 echten Paaren), Kille u. a. 2017, Marigold u. a. 2007, Mongrain & Anselmo-Matthews 2012. Ohne Befund geprüft wurden außerdem Autor, Jahr, Zeitschrift und Band von Breines & Chen 2012, Bravata 2020 (9–82 %), Gerber 2018, Gilovich 2000, Bruk 2018, Seligman 2005, Kross 2014, Moran & Eyal 2022, Clance & Imes 1978 und Orth & Robins 2022.
- Deutsche Buchtitel: Branden, Neff, Brown, Rogers, Young & Klosko stimmen. Harris und Burns waren falsch (siehe Korrekturen).
- Nicht nachgeschlagene Klassiker (Bandura, Baumeister, Young, Rogers, Kohut, Bowlby, Branden, Brown, Beck, Burns, Frankl, Adler, Kahler, Seneca, Epiktet) werden **nur ohne Zahlen** und inhaltlich richtig wiedergegeben. In Ordnung.
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur selbst`. Vorher: 0 Fehler, 0 Hinweise. Nachher: **0 Fehler, 1 Hinweis** (`selbst-fc-003` ohne `wert: 1`, gewollt, siehe unten).

## Gesamteindruck

Ein starker, warmer Bereich. Die Kernidee („Zutrauen folgt dem Tun“, Kritiker prüfen statt überschreien, Selbstmitgefühl als Lernhaltung) ist fachlich sauber und für Menschen mit niedrigem Selbstwert gut gemacht. Es gibt keine Parolen und kein „denk positiv“. Gefühle werden nie als falsche Antwort gewertet (Stich, Wärme im Gesicht, Ärger: jeweils „verständlich“ oder „normal“). Die Rückmeldungen sind nicht beschämend, und Ausweichen wird erklärt statt verurteilt. Die Replikationskrise ist ehrlich verarbeitet: Wood 2009 steht als umstritten (U) da, Power Posing ist entzaubert, und Social Media ist als „klein, Richtung offen“ eingeordnet. Die Denkmodelle tragen ein D und den Hinweis „Landkarte, keine Diagnose“ (`w-090`). Die Fachhilfe `seele` steht in Einheit 1, ergänzt um eine Karte „Wenn es mehr ist“ und den Eintrag `w-099`, im Text ohne Rufnummern. Die Mängel waren zwei ungenaue Quellenwiedergaben, falsche deutsche Buchtitel, einige überzogene Formulierungen („fast immer“, „der häufigste Fehler“) und ein Sprachfehler.

## Korrekturen (alle Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Fakten und Quellen (8)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| quellen | `mongrain2012` | „Mehr Zufriedenheit, aber kein Rückgang der Niedergeschlagenheit“ → „Die Übungen hoben die Zufriedenheit dauerhaft – eine angenehme Vergleichsübung (schöne Erinnerungen) aber ebenso; bei der Niedergeschlagenheit kein Vorteil gegenüber der Vergleichsgruppe …“ | Laut Abstract steigerte auch das positive Placebo die Zufriedenheit. Ohne diesen Satz klingt die Wiederholung wie eine Bestätigung der Übung. |
| wissen | `selbst-w-006` (belegHinweis) | „Die Wiederholung fand mehr Zufriedenheit, aber keinen Rückgang …“ → „In der Wiederholung stieg die Zufriedenheit, nach einer angenehmen Vergleichsübung aber ebenso; die Niedergeschlagenheit sank nicht stärker als in der Vergleichsgruppe.“ | wie oben |
| einheiten | `selbst-1-05` (Schritt `studie`, grenze) | „Eine Wiederholung fand mehr Zufriedenheit, aber keinen Rückgang …“ → „In einer Wiederholung stieg die Zufriedenheit – nach einer angenehmen Vergleichsübung aber ebenso, und die Niedergeschlagenheit sank nicht stärker.“ | wie oben |
| quellen | `flynn2020` | „zwei direkte Wiederholungen … Journal of Contextual Behavioral Science.“ → richtiger Titel, Band 16, Seiten 49–61, „Eine Wiederholung und eine erweiterte Wiederholung … mit je rund 230 Teilnehmenden“ | Nur Studie 1 ist eine Wiederholung. Studie 2 ist laut Autoren eine Wiederholung im Sinn und eine Erweiterung (mit Werte-Schreiben). Die Aussagen in den Texten („zwei Wiederholungen fanden keinen Unterschied“) bleiben im Kern richtig. |
| einheiten | `selbst-1-03` (aha) | „… schaut eher hin und macht es beim nächsten Mal besser.“ → „… und will es beim nächsten Mal besser machen.“ | Breines & Chen messen Wille und Lernzeit, nicht bessere Leistung. Das passt jetzt auch zu `w-004`, `w-074`, `w-082` und Merkkarte `m2`. |
| quellen + wissen | `harris2011`, `selbst-w-109` | deutsch „Mit Vertrauen leben“ → „Der Weg zu echtem Selbstvertrauen“ (Titel `w-109`: „Harris: Der Weg zu echtem Selbstvertrauen (2011)“, genau 48 Zeichen) | Die deutsche Ausgabe (Arbor, 2014) heißt so. Einen Titel „Mit Vertrauen leben“ gibt es dafür nicht. |
| quellen + wissen | `burns1980`, `selbst-w-108` | deutsch „Fühl dich gut“ → „Feeling Good – Depressionen überwinden, Selbstachtung gewinnen“ (Titel `w-108`: „Burns: Feeling Good (1980)“) | Die lieferbare deutsche Ausgabe (Junfermann) trägt den englischen Haupttitel. „Fühl dich gut“ lässt sich als Übersetzung nicht sicher zuordnen. |
| wissen | `selbst-w-098` | „Wo das gefehlt hat, bleibt man kränkbar“ → „… bleibt man oft leichter kränkbar“ | Das war zu deterministisch (Trauma-Blick). Es widersprach auch `v-0100` und `w-096` („Muster lassen sich verändern“). |

### Überzogene Aussagen ohne Quelle (5)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| lagen | `selbst-l-02` k1 (dritte Wahl, rueck) | „der drückt fast immer“ → „der drückt meist“ | Gerber 2018: Meist folgt Kontrast, aber nicht fast immer (es gibt auch Angleichung). So steht es sonst überall im Bereich. |
| lagen | `selbst-l-02` ende2 | „Vergleiche nach oben drücken fast immer.“ → „… drücken meist.“ | wie oben |
| vorrat-02 | `selbst-v-0056` (vierter Eintrag) | „drückt fast immer“ → „drückt meist“ | wie oben |
| vorrat-02 | `selbst-v-0057` (dritter Eintrag) | „Weggedrückte Gefühle melden sich meist lauter zurück.“ → „… melden sich oft wieder – und du erfährst nicht, was dir wichtig ist.“ | Der Rückpralleffekt beim Unterdrücken ist klein und uneinheitlich. „Meist lauter“ ist ohne Quelle zu stark. |
| vorrat-01 | `selbst-v-0007` (vierter Eintrag) | „ist der häufigste Fehler“ → „ist ein häufiger Fehler – es kommt meist erst mit dem Tun“ | Ein Superlativ ohne Beleg. |

### Sprache und Regeln (2)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten | `selbst-1-04` (zweiter Schritt `karte`) | „Kein Wunder also – aber ein Werkzeug, das wenig kostet.“ → „Kein Wundermittel also – …“ | Falsche Redewendung: „Kein Wunder“ heißt „nicht überraschend“ und gibt hier das Gegenteil des Gemeinten. |
| wissen | `selbst-w-006` (titel) | „Erfolge musst du nicht erfinden, nur festhalten“ → „Erfolge nicht erfinden, nur festhalten“ | Verbotenes „du musst“ (auch verneint und umgestellt), wie im Gegenlesen `ruhe` gehandhabt. Das Prüfskript erkennt die Umstellung „musst du“ nicht. |

### Didaktik (1)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| tests | `selbst-fc-003` (erste Antwort) | „Ganz leise wird der Kritiker selten – also hilft nur ignorieren.“ `wert: 1` → `wert: 0`; warum: „Ignorieren hilft aber wenig – prüfen und umbauen trägt weiter.“ | Die Schlussfolgerung „hilft nur ignorieren“ widerspricht der Lehre des Bereichs. Regel aus `NACHARBEIT.md`: Sachlich falsche halbe Punkte werden auf 0 gesetzt. Der Prüfskript-Hinweis „keine brauchbare Antwort“ ist damit gewollt. |

**Zusammen: 16 Änderungen** (Fakten/Quellen 8, Überzogenes 5, Sprache/Regeln 2, Didaktik 1).

## Geprüft und in Ordnung

- **Zahlen:** Alle Zahlen im Text (119 Studien, d = 0,38; 27 Studien; 121 Studien; 9–82 %) stehen bei Quellen mit `geprueft: true` und stimmen. Beleg-Stufen sind ehrlich. Mythen stehen auf U, Denkmodelle auf D. Soziometer, Bindung sowie Scham und Schuld stehen auf B mit dem Hinweis „empirisch gestützt, als vollständige Erklärung umstritten“. Das ist vertretbar, weil hinter diesen Theorien echte Forschung steht (siehe offener Punkt 6).
- **Psychologie:** Die Modelle Antreiber (Kahler), Schemata/Lebensfallen (Young), Rogers' Bedingungen des Werts, Adlers Minderwertigkeitsgefühl, Kohut, Bindung und Scham/Schuld (Tangney) sind korrekt und knapp dargestellt. Jedes Modell bekommt eine Handlungsfrage für heute statt einer Kindheits-Deutung. Der Fragebogen der Schematherapie ist ausdrücklich nicht verwendet (Lizenz).
- **Sicherheit:** `v-0040` (`sicherheit: true`) zeigt bei wochenlanger Freudlosigkeit richtig auf Hilfe von außen. `fachhilfe seele` steht in `1-01`, ohne Rufnummern im Bereichstext. Kein Selbstoptimierungsdruck: „Gut genug ist gut genug“ und „Ich darf um Hilfe bitten“ kommen mehrfach vor.
- **Didaktik:** Alle 7 Einheiten haben 6 bis 8 Schritte, 6–7 Minuten, mindestens drei Formate und einen neugierig machenden Einstieg. Jede endet mit einer Mission, und die Zuordnung zu den Missionen folgt dem Lehrplan. Der Kursplan hat die Reihenfolge E·Ü·E·Ü·E·Ü·L·A·E·Ü·L·E·Ü·E·Ü·L·A·E·Ü·L·S. Jede Lage setzt nur voraus, was vorher gelehrt wurde. Die beste Antwort ist nicht auffällig oft die längste (wie in `NACHARBEIT.md` festgehalten).
- **Anzahlen:** 24 Szenarien (3 je Fähigkeit), 5 Selbstbild-, 3 Verhaltensfragen, 10 Missionen, 100 Vorrats-Übungen. „Drei Teile des Selbstmitgefühls“, „drei Prüffragen“, „vier Quellen“ und „fünf Antreiber“ sind überall gleich gezählt.
- **Besetzung:** Nur Figuren aus `besetzung.json`. Dazu kommen namenlose Rollen und „Herr Typisch“ als Spitzname für den Kritiker.

## Offene Punkte (Ermessen, nicht geändert)

1. **Lob konkret oder abstrakt (`w-011`, `1-06` Karte, `w-035`).** Kille 2017 zeigt: Ein *konkreter* Blick auf das Lob hilft. Marigold 2007 zeigt dagegen: Das Nachdenken über die *Bedeutung* des Lobs (eher abstrakt) hilft. Der Text verbindet beides („Wofür genau? … was ein Lob bedeutet“), und das ist praktisch brauchbar. *Empfehlung:* im `belegHinweis` von `w-011` ergänzen: „Die Studien zeigen zwei Wege: genau hinschauen oder überlegen, was das Lob bedeutet.“
2. **Fast doppelte Testfragen.** Das Prüfskript meldet keine, von Hand gefunden wurden:
   - `fc-019` (Hund) ≈ `v-0080` (Blumen): beide mit „erfundener Ausrede“ und „Bedenkzeit, du weißt die Antwort schon“
   - `fc-024` ≈ `v-0093` (Reaktion größer als der Anlass, wunder Punkt)
   - `fc-020` ≈ `v-0082` (Enttäuschung nach dem Nein)
   - `fc-017` ≈ `v-0071`/`v-0076` (Siegerpose)

   *Empfehlung:* in die Sammelliste von `NACHARBEIT.md` aufnehmen und durch neue Lagen mit gleichem Lernziel ersetzen.
3. **Fragwürdige halbe Punkte:**
   - `l-01` k1 „Ist nur ein Tippfehler, das ändert ja nichts.“: 400 statt 40 ändert sehr wohl etwas.
   - `fc-016` „Breitbeinig, die Arme hinter dem Kopf“ im Wartebereich vor einem Bewerbungsgespräch.
   - `v-0100` „Erst die ganze Kindheit aufarbeiten, *bevor* du etwas änderst“.

   *Empfehlung:* jeweils auf 0 setzen oder den Text so ändern, dass die Antwort wirklich halb richtig ist.
4. **`l-04` ende2:** „Deine Schwester hat ihr Essen allein gegessen.“ Für Menschen, die sich schnell schuldig fühlen, ist das ein kleiner Schuld-Stich am Ende. *Empfehlung:* neutraler, etwa „Den Besuch bei deiner Schwester hast du verschoben.“
5. **`l-03` ende2 auf dem Weg über k2b:** Albers sagt „Gut, dann frage ich Frau Okafor“, obwohl er auf diesem Weg die Frage nach dem neuen Team (k3) noch nicht gestellt hat. Man kann es auf die Einarbeitungs-Methode beziehen, es ist aber unscharf. *Empfehlung:* ende2 etwa so: „Gut. Dann bitte ich für die nächste Einarbeitung Frau Okafor.“
6. **Beleg-Stufe der „Dahinter“-Modelle:** Soziometer (`w-091`), Bindung (`w-096`) und Scham/Schuld (`w-097`) stehen auf B, alle anderen Modelle auf D. Fachlich vertretbar (empirische Theorien). Wenn der Auftrag „alle Modelle als D“ wörtlich gemeint ist, die drei auf D setzen und den Hinweis behalten. Zu Scham/Schuld gibt es neuere Befunde, nach denen Scham auch Wiedergutmachung auslösen kann, wenn der Schaden behebbar ist. Das „eher“ im Text deckt das ab.
7. **Fachhilfe `seele` nur in `1-01`:** Das reicht nach den Regeln. Optional ein zweites Mal in `1-03` (harte Selbstbeschimpfung), weil dort am ehesten jemand mit depressiver Selbstabwertung „hängen bleibt“.
8. **Zuordnen „Selbstmitleid“ (`1-03-b`):** Fachlich richtig (Neff). Für sehr beschämungsanfällige Nutzer könnte das Etikett hart klingen. *Empfehlung:* in der Auflösung einen Satz ergänzen wie „Selbstmitleid ist verständlich – es hilft nur selten weiter.“ Dafür bietet das Format `zuordnen` keine Begründung je Karte, also eher in der folgenden Karte oder in der Begründung von `v-0037`.
9. **Blickkontakt als Regel (`1-06`, `m-06`, `v-0075`):** Für manche Menschen (etwa im Autismus-Spektrum oder aus anderen Kulturen) ist „Blick halten“ belastend. *Empfehlung:* irgendwo ein Halbsatz wie „oder kurz in Richtung der Person“.
10. **Quellen `geprueft: false`:** 25 Einträge (Klassiker, Bücher, einige Studien wie `orth2022`, `baumeister2003`, `tangney2007`, `leary1995`). Sie werden nur ohne Zahlen genutzt, das ist regelkonform. Die bibliografischen Angaben, die ich stichprobenartig geprüft habe, stimmen.

## Urteil

**Freigabereif: ja.** Nach den 16 Korrekturen gibt es keine sachlich falschen Zahlen und keine schädlichen Botschaften mehr. Die Denkmodelle sind sauber gekennzeichnet. Die offenen Punkte sind Feinschliff (vor allem fast doppelte Testfragen und drei halbe Punkte) und können über `NACHARBEIT.md` vor der Freigabe für alle erledigt werden.
