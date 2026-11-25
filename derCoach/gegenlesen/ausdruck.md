# Gegenlesen: Bereich `ausdruck` („Wortschatz & Ausdruck“)

**Datum:** 25.11.2026 · **Rolle:** unabhängiger Gegenleser (Lektorat/Germanistik, Trainerin für verständliches Schreiben, Faktenprüfung) · **Stand:** Phase Grundlagen

## Was geprüft wurde

- Regeln: `src/coach/inhalt/LIESMICH.md`, `derCoach/08_ENTSCHEIDUNGEN.md`, `derCoach/06_INHALT_REGELN_MUSTER.md` (Abschnitte 1–3, 10, Prüfliste 16), `src/coach/kern/inhaltTypen.ts`.
- Alle Dateien in `src/coach/inhalt/ausdruck/`: `quellen`, `wissen`, `einheiten-1`, `lagen-1`, `vorrat-01`, `vorrat-02`, `leiter`, `tests`, `kurs`. Jedes Beispiel, jede Musterlösung, jede Redewendung und jede Herleitung einzeln gelesen; Wortgrenzen der `kern`-Muster und alle Zählangaben im Text („vier Hauptwörter“, „sechs Füllwörter“ …) von Hand nachgezählt.
- Kontext: `besetzung.json`, `stegreif/` und `gespraech/` (Doppelungen/Widersprüche), Quellen in `stegreif/` und `ueberzeugen/` (`zinsser1976`, `schneider-profis`, `goffman1955` sind dort angelegt), früherer Bericht `stegreif.md` (Form).
- Fakten an der Quelle (Abstract, Volltext, Verlags- oder Normenseite):
  - **Brugman, Burgers & Vis 2019**: 91 Studien, 34.783 Teilnehmende; Wort-Bild d = 0,04 [0,01; 0,07], ausgebautes Bild d = 0,22 [0,15; 0,29]; Hinweise auf Publikationsverzerrung (Egger, Begg) – **stimmt**. „Praktisch nicht“ für d = 0,04 ist vertretbar (statistisch knapp signifikant, praktisch bedeutungslos).
  - **Henderson, Vallée-Tourangeau & Simons 2019**: 246 und 220 ausgewertete Personen, dz = 0,08 und 0,11, Intervalle schließen null ein – **stimmt**.
  - **Bullock u. a. 2019**: PUS 28(7), 845–853, 650 Teilnehmende, Fachwörter stören die Verarbeitung auch mit Begriffserklärung – **stimmt**.
  - **Packard & Berger 2021**: JCR 47(5), 787–806, fünf Studien, über 1.000 echte Gespräche, vermittelt über „wird zugehört“ – **stimmt**.
  - **Blankenship & Holtgraves 2005**: JLSP 24(1), 3–24; Wirkung je nach Merkmal verschieden – die vorsichtige Formulierung („uneinheitlich“) **passt**.
  - **Duden online „Sinn“**: „etwas macht [k]einen Sinn“ als umgangssprachlich, nach engl. „it makes sense“ – **stimmt** (Mythos `w-083` „teils“ ist richtig und ohne Besserwisserei).
  - **Tucholsky**: Peter Panter, Vossische Zeitung, 16.11.1930 – **stimmt**.
  - **DIN SPEC 33429:2025-03** (Leichte Sprache) und **DIN 8581-1:2024-05** (Einfache Sprache), Zielgruppen und „Einfache Sprache behält alle Informationen“ – **stimmt** (DIN-Media-Themenseite).
  - Ohne Befund (aus Kenntnis/Abstract): Oppenheimer 2006 (fünf Experimente, Mehrheit gibt Aufblähen zu), Hansen & Wänke 2010, Thibodeau & Boroditsky 2011 mit Kritik Steen u. a. 2014, Dunlosky 2013 (nur Abrufen und Verteilen „hoher Nutzen“), Stahlberg & Sczesny 2001, Winawer 2007 (Vorteil verschwindet bei verbaler Zusatzlast), Brown & Levinson 1987 (Englisch, Tamil, Tzeltal), Hamburger Modell (vier Merkmale, Einfachheit zuerst), Rechtschreibrat 2023 (Sonderzeichen nicht Kernbestand), Orwell 1946 (sechs Regeln, Horizon), Reiners 1943 und der Plagiatsvorwurf gegenüber Engel.
- Technik: `node scripts/coach-index.mjs` und `node scripts/coach-pruefe.mjs --nur ausdruck` vorher und nachher je **0 Fehler, 0 Hinweise**.

## Gesamteindruck

Ein sorgfältiger, ehrlicher Bereich. Die Haltung stimmt: „Gewählt heißt treffend“, Dialekt und Umgangssprache gelten als Wahl, nicht als Fehler; Sick wird mit Vorsicht empfohlen, „Sinn machen“ fair eingeordnet, Gendern sachlich als Registerfrage mit Beleg und Rechtschreibrat behandelt. Die Replikationslage ist vorbildlich offen benannt (konkrete Sätze → Henderson; Metaphern → Brugman; Absicherungen → uneinheitlich; Fachwort-Erklärungen helfen kaum). Die besseren Fassungen sind fast durchweg wirklich besser, die Musterlösungen der `kern`-Übungen liegen alle unter der Wortgrenze (nachgezählt), die Lagen sind auf jedem Weg logisch. Die Mängel waren: die Anrede ohne Komma (Entscheidung des Hauptstrangs), ein Kasusfehler in einer Lücke, eine „Positiv fassen“-Umformung, die den Inhalt verschob, mehrere falsche Zählangaben und zwei unsaubere Herleitungen von Redewendungen.

## Korrekturen (Kennungen unverändert, nichts gelöscht, Struktur gleich)

### Anrede mit Komma – Entscheidung des Hauptstrangs (9 Stellen)

| Datei | Kennung | vorher → nachher |
|---|---|---|
| einheiten-1 | `ausdruck-1-03-b` (absatz) | „Hallo Tarek, ich hoffe …“ → „Hallo, Tarek, ich hoffe …“ |
| einheiten-1 | `ausdruck-1-03-b` (Muster 1) | „Hallo Tarek, wie viele …“ → „Hallo, Tarek, wie viele …“ (Wortzahl unverändert 17) |
| einheiten-1 | `ausdruck-1-07-b` (Antwort 1) | „Hi Nadine, kurze Frage:“ → „Hi, Nadine, kurze Frage:“ |
| einheiten-1 | `ausdruck-1-07-b` (Antwort 3, beste) | „Guten Tag Frau Köhler, …“ → „Guten Tag, Frau Köhler, …“ |
| lagen-1 | `ausdruck-l-01` k1 (sagt) | „Guten Tag Herr Dr. Albers, …“ → „Guten Tag, Herr Dr. Albers, …“ |
| lagen-1 | `ausdruck-l-03` k1 (sagt) | „Hallo Carla, …“ → „Hallo, Carla, …“ |
| vorrat-02 | `ausdruck-v-0092` (Fächer) | „Hi Sven,“ / „Hallo Frau Köhler,“ → „Hi, Sven,“ / „Hallo, Frau Köhler,“ |
| vorrat-02 | `ausdruck-v-0093` (Muster 1 und 2) | „Guten Tag Herr Dr. Albers,“ / „Hallo Herr Albers,“ → „Guten Tag, Herr Dr. Albers,“ / „Hallo, Herr Albers,“ |
| wissen | `ausdruck-w-052` (Beispiele) | „Hi Tarek,“ / „Hallo Frau Köhler,“ → „Hi, Tarek,“ / „Hallo, Frau Köhler,“ |

Bewusst **nicht** geändert: „Hallo zusammen,“ (`1-03-a`, `v-0097`) – „zusammen“ ist keine namentliche Anrede, „Hallo, zusammen“ wäre unüblich; „Liebe Tante Renate,“, „Liebe Frau Sommer,“, „Sehr geehrte …,“ – hier ist „Liebe/Sehr geehrte“ Beifügung, kein Komma.

### Sprache als Lehrstoff (6)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten-1 | `ausdruck-1-02-c` (frage) | „Ich kann **dir** morgen ___.“ → „Ich kann **euch** morgen ___.“ | Die als brauchbar (`wert: 1`) gelobte Antwort „unterstützen“ verlangt den Akkusativ: „Ich kann dir unterstützen“ ist ungrammatisch. „Euch“ passt zu allen vier Antworten (Dativ und Akkusativ gleich), alle Begründungen bleiben richtig. |
| wissen | `ausdruck-w-033` (Beispiel 1) | Umformung von „Das geht nicht vor Freitag.“: „**Bis Freitag schaffe ich das.**“ → „**Am Freitag habe ich das fertig.**“ | Der Text behauptet „Der Inhalt ist derselbe“. „Nicht vor Freitag“ heißt *frühestens* Freitag, „bis Freitag“ *spätestens* Freitag – die alte Fassung versprach mehr. Neue Fassung wie in `v-0081` („Am Mittwoch habe ich es fertig“). |
| vorrat-02 | `ausdruck-v-0087` (Karte 1) | „Bis Freitag schaffe ich das.“ → „Am Freitag habe ich das fertig.“ | Gegenstück zu „Vor Freitag geht da gar nichts.“ – gleiche Inhaltsverschiebung wie oben. |
| vorrat-01 | `ausdruck-v-0011` (Karte 5) | „klar gemacht“ → „klargemacht“ | Amtliche Regelung/Duden: „klarmachen“ (= verdeutlichen) wird zusammengeschrieben. |
| vorrat-01 | `ausdruck-v-0044` (Antwort 1, warum) | „Vermischt mit „Akzente setzen“ …“ → „Hier haben sich zwei Wendungen vermischt (wohl mit „auf etwas setzen“) – die feste Verbindung heißt „Wert legen auf“.“ | Die Herleitung aus „Akzente setzen“ ist nicht belegbar; „auf etwas setzen“ liegt näher und ist vorsichtig formuliert. |
| vorrat-01 | `ausdruck-v-0047` (Antwort 1, text + warum) | „Zwei Redewendungen sind vermischt: …“ → „Redewendungen sind vermischt – vor allem … und …“; warum ergänzt: „dazu kommt noch „ins Gesicht schlagen““ | „Das schlägt dem Fass die Krone ins Gesicht“ ist eine Dreifach-Kontamination; „ins Gesicht“ stammt aus keiner der beiden genannten Wendungen. |

### Zählangaben und Logik (6)

| Datei | Kennung | vorher → nachher | Grund |
|---|---|---|---|
| einheiten-1 | `ausdruck-1-04` (vergleich, unterschied) | „drei Nebensätze lang“ → „vier Nebensätze lang“ | Vor dem Hauptsatz stehen vier: „Da …“, „die … geplant war“, „an dem Carla … ist“, „wie sich jetzt herausgestellt hat“. |
| einheiten-1 | `ausdruck-1-05-c` (Antwort 1, warum) | „Vier Absicherungen“ → „Fünf Absicherungen“ | würde, vielleicht, eventuell, etwas, könnten. |
| wissen | `ausdruck-w-073` (text) | „fünf Wörter Anlauf“ → „acht Wörter Anlauf“ | „Also eigentlich wollte ich halt nur mal kurz“ = acht Wörter. |
| vorrat-02 | `ausdruck-v-0064` (Eintrag 4, warum) | „Sechs Füllwörter“ → „Sieben Füllwörter und Weichmacher“ | eigentlich, nur, mal, ganz, kurz, vielleicht, irgendwie. |
| vorrat-01 | `ausdruck-v-0012` (Karte 3) | „Die Folie bekommt größere Schrift, damit man sie auch hinten lesen kann.“ → „Die Folie lesbarer machen: weniger Text, klarere Grafik.“ | Die alte Karte passte ebenso zu „anpassen“ (an den Raum angepasst) – zwei richtige Fächer. |
| tests | `ausdruck-fc-001` (frage) | „jede Menge stimmt“ → „jede Mengenangabe stimmt“ | Doppeldeutig: „jede Menge“ liest sich als Umgangssprache für „sehr viel“. |

**Summe: 21 Korrekturen** (9 Anrede-Komma, 6 Sprache als Lehrstoff, 6 Zählangaben/Logik). Danach `coach-index.mjs` neu erzeugt; `coach-pruefe.mjs --nur ausdruck`: **0 Fehler, 0 Hinweise** (gesamt 0 Fehler).

## Offene Punkte (Ermessen – nicht geändert)

1. **„Dialekt ist ein Register“** (`einleitung`, `w-009`, `w-082`, `w-091`, `1-07` Karte, `v-0096`). Fachlich ist Dialekt eine regionale *Varietät*, Register eine situative; was der Nutzer *wählt*, ist der Wechsel zwischen beiden. Die Vereinfachung ist für Laien verständlich und wertet niemanden ab. **Empfehlung:** an einer Stelle (etwa `w-091`) einen Halbsatz ergänzen: „Fachleute nennen Dialekt eine Varietät; zwischen ihr und dem Hochdeutschen zu wechseln, ist eine Registerwahl.“ Sonst lassen.
2. **Nadine Köhler**: In `besetzung.json` „mögliche Kundin“, in `1-07-b` erste Mail an eine mögliche Kundin – zwei Lerntage später (`ausdruck-l-05`) hat sie Geräte bestellt und plant mit ihnen. Nicht widersprüchlich, aber schnell. **Empfehlung:** in `l-05` „lage“ ein Wort wie „ihre erste Bestellung“ – oder so lassen.
3. **Füllwörter im Gespräch vs. `stegreif`**: `stegreif-w-084`/`w-077` (Laske 2024) sagen, einzelne Füllwörter schaden kaum; `ausdruck-v-0062` (gesprochen, „in der Besprechung“) wertet zwei Füllwörter als Signal der Unsicherheit. Es geht um verschiedene Dinge („äh“ vs. abschwächende Wörter wie „im Prinzip“), ein Nutzer, der beide Bereiche übt, könnte es aber als Widerspruch lesen. **Empfehlung:** in `v-0062` (warum der besten Antwort) „… im Gespräch fällt ein einzelnes kaum auf, zwei vor der Kernaussage schon“ – oder so lassen.
4. **Wortfeld geblockt üben** (`w-011`, `w-088`, Entscheidung in `08`): Für *neuen* Fremdsprachenwortschatz gibt es Befunde, dass bedeutungsnahe Wörter gemeinsam gelernt einander stören (Tinkham 1993/1997, Erten & Tekin 2008). Für Muttersprachler, die Unterschiede zwischen Synonymen lernen, passt das Blocken gut – und der Kurs übt Synonyme immer mit ihrem Unterschied. Die Entscheidung bleibt; **Empfehlung:** den belegHinweis von `w-011` nicht verschärfen, aber bei Erweiterung um Fremdwörter-Blöcke daran denken.
5. **`ausdruck-l-03` k2, Wahl 1 (rueck)**: „„Dieses Jahr“ ist ehrlich, ohne Hintertür“ – man kann „dieses Jahr“ auch gerade als Hintertür lesen („nächstes Jahr vielleicht“). **Empfehlung:** „„Dieses Jahr“ ist ehrlich und lässt die Zukunft offen, ohne etwas zu versprechen.“
6. **`ausdruck-l-01` ende2**: Albers schreibt „Gut. Schicken Sie mir das bitte noch einmal in zwei Sätzen.“, der Ende-Text sagt „die Freigabe kommt“ – im Text steht sie nicht. **Empfehlung:** sagt-Text ergänzen: „Gut, freigegeben. Schicken Sie mir …“.
7. **`ausdruck-w-027`** Beispiel: Die Umformung fügt „so schnell“ hinzu (stand nicht in der Vorlage) und lässt „nach dem Gespräch mit Ihrer Abteilung letzte Woche“ weg. Als Stilbeispiel tragbar; **Empfehlung:** „Danke für die Unterlagen nach unserem Gespräch.“
8. **`ausdruck-v-0091`**: „Danke für das gute Gespräch heute.“ passt auch in den Chat mit Tarek (Fach 0). **Empfehlung:** „Vielen Dank für das Gespräch heute – ich melde mich bis Freitag.“ (klarer Kundenbezug).
9. **`ausdruck-v-0073`**, Eintrag 3: Diese Fassung lässt die Bitte („ab acht zu Hause sein“) ganz weg – sie ist damit nicht nur schwerer zu hören, sondern unvollständig. Rangfolge bleibt vertretbar.
10. **`ausdruck-v-0015`**, Muster 2: „Zwei Kunden haben von der Preisänderung erst aus der Rechnung erfahren.“ erfüllt das Kriterium „sagt, wer was nicht getan hat“ nur indirekt. Kleinigkeit.
11. **Doppelung mit `gespraech`**: „Befund statt Urteil“ (`ausdruck-w-032`, `v-0078`, `v-0086`) entspricht „Beobachtung statt Urteil“ (`gespraech-1-04`) – inhaltlich gleich, kein Widerspruch; ausdruck behandelt die schriftliche Formulierung, gespraech das Gespräch. Gut so; ein Querverweis auf der Bereichsseite wäre schön.
12. **Quellen**: `sick2004`, `pinker2014`, `praxis-ausdruck` (hier) und `schneider-profis`, `goffman1955` (andere Bereiche) tragen `geprueft: false`. Keine davon stützt eine Zahl – regelkonform. Bei `reiners1943` konnte ich die Neuausgabe „2018“ nicht prüfen (2004 ist sicher); ohne Folgen für den Text.

## Urteil

**Freigabereif: ja.** Nach den 21 Korrekturen keine sachlichen oder sprachlichen Fehler mehr gefunden; alle Zahlen mit geprüfter Quelle stimmen; die offenen Punkte sind Verfeinerungen.
