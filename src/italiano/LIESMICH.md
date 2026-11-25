# Parla Italiano – Bauplan

Italienisch-Kurs im Pausenraum: 24 Level (Stationen von Turin bis Cagliari), je 5 Lerntage und eine Prüfung. Eigenständiger Bereich wie der Brain Trainer; wird erst beim Öffnen geladen.

## Regeln, die nicht verhandelbar sind (Vorgaben des Nutzers, 18.11.2026)

- Am Tag ein Lernprogramm: Lektion (rund 10 Minuten), danach Tagestest (5 Minuten) zum Stoff des Vortags.
- Nach 5 Lerntagen die große Prüfung; wer besteht, steigt ein Level auf.
- Das Level jedes Benutzers ist für alle sichtbar (Reisegruppe). Alles andere – Lernstand, Ergebnisse, Fehler – bleibt lokal und verschlüsselt.
- Setup klein halten, Tool nicht verlangsamen: nichts aus diesem Ordner darf ins Hauptpaket.

## Wo was liegt

| Ordner / Datei | Inhalt |
|---|---|
| `ParlaItaliano.tsx` | Rahmen, Navigation, Begrüßung, Veröffentlichen des Levels |
| `kern/inhaltTypen.ts` | Aufbau der Lerninhalte |
| `kern/lehrplan.ts` | die 24 Stationen, Rezeptseiten, Kartenumriss |
| `kern/inhalt.ts` | Level-Dateien nachladen (ein Teilpaket je Level) |
| `kern/aufgaben.ts` | aus Inhalten Aufgaben bauen: Lektion, Tagestest, Prüfung, Training, Einstufung |
| `kern/stand.ts` | was heute dran ist (Lektion frei / morgen / Prüfung) |
| `kern/kasten.ts` | Karteikasten mit 5 Fächern |
| `kern/serie.ts` | Serie; Wochenenden unterbrechen nicht, Joker |
| `kern/antwort.ts` | getippte Antworten nachsichtig prüfen |
| `kern/speicher.ts` | Lernstand (zustand) + verschlüsselte Ablage über `italiano:laden/speichern/loeschen` |
| `kern/gruppe.ts` | Level auf dem Netzlaufwerk (`italiano/level/<benutzer>.json`) |
| `kern/ton.ts` | Ton abspielen (eine Datei je Lerntag + Zeitmarken) |
| `kern/verben.ts` | Verben beugen für den Verb-Trainer |
| `uebungen/` | Bausteine: Wortkarte, Auswahl, Paare, Satzbau, Tippen, Dialog |
| `ablauf/Lauf.tsx` | eine Runde durchspielen (lernen oder Test mit Uhr) |
| `ablauf/Programm.tsx` | Lektion → Tagestest, große Prüfung |
| `bereiche/` | Heute, Reise, Training, Tests, Reisegruppe, Fortschritt, Einstellungen |
| `inhalt/level-NN.json` | die Lerninhalte; Regeln, Lehrplan und Geschichte in `inhalt/LIESMICH.md` |
| `ton/zeiten.json` | wo jedes Wort und jede Dialogzeile in der Tondatei liegt (wird erzeugt) |
| `italiano.css` | eigene Farbwelt `--pi-…` unter `.pi-app` – keine anderen Farben, keine `dark:`-Klassen |

Außerhalb: `public/italiano/bilder/` (Postkarten, Kachelbild), `public/italiano/ton/` (Tondateien). Der Ordner `public/` ist nicht im Repo.

## Inhalte ändern

- Texte verbessern: jederzeit. Danach `node scripts/italiano-pruefe.mjs <Level>` (0 Fehler).
- **Nichts umsortieren, einfügen oder entfernen:** Die Kennung eines Wortes ist Lerntag × 100 + Platz. Der Lernstand der Benutzer hängt daran.
- **Wort oder Dialogzeile geändert?** Dann stimmt der Ton dieses Lerntags nicht mehr → für den Tag neu erzeugen (siehe unten).

## Werkzeuge (laufen nur beim Erstellen)

- `node scripts/italiano-pruefe.mjs [Level …]` – Inhalte prüfen; `--bekannt N`, `--geschichte N` für Autoren.
- `node scripts/italiano-namen.mjs` – Namensliste `kern/eigennamen.ts` neu erzeugen (Namen, Städte, Länder bleiben beim „Satz bauen“ auf den Kacheln groß; alles andere steht dort klein und ohne Satzzeichen, damit die Schreibweise die Reihenfolge nicht verrät). Nach jeder Änderung an den Texten ausführen – die Inhaltsprüfung meldet eine veraltete Liste als Fehler.
- `npx electron scripts/italiano-bilder.cjs <Quelle> <Ziel>` – Bilder verkleinern und als WebP ablegen.
- `node scripts/italiano-ton-auftrag.mjs <Level>` – Aufträge für die Sprachausgabe (ElevenLabs v4 über Higgsfield); `--umfang` zeigt Zeichen und Credits, `--hole <Datei>` lädt fertige Aufnahmen, `--ersatz` listet einzeln neu zu vertonende Dialogzeilen.
- `python scripts/italiano-ton-pruefe.py woerter|dialoge <von> <bis>` – Aufnahmen **mithörend teilen und nachmessen** (Spracherkenner Whisper, läuft lokal; Einrichtung im Dateikopf). Schreibt je Aufnahme die Schnittstellen (`tNNN-w.schnitt.json`, `tNNN-d.schnitt.json`) in den Rohordner; Auffälligkeiten stehen in `pruefbericht.tsv`.
- `npx electron scripts/italiano-ton.cjs baue <Rohordner> [von] [bis]` – Aufnahmen an diesen Schnittstellen teilen, angleichen, als Ogg/Opus mit 10 kbit/s speichern und `ton/zeiten.json` schreiben.
- `python scripts/italiano-ton-pruefe.py fertig <von> <bis>` – die fertigen Tondateien gegenprüfen: Ist jede Tondatei jünger als ihre Aufnahmen und Schnittdateien, liegt jedes Stück so in der Datei, wie die Schnittdatei es vorgibt? Und jedes Wort, jede Zeile noch einmal für sich gehört. **Nach jedem Bau ausführen** (alle 120 Lerntage dauern auf einem Laptop rund eine Stunde – im Hintergrund laufen lassen).
- `python scripts/italiano-ton-pruefe.py selbsttest` – die Auswerte-Regeln des Prüfwerkzeugs an bekannten Fällen prüfen (sofort fertig, ohne Spracherkenner). Nach jeder Änderung am Werkzeug.
- In der Claude-Shell vor jedem `npx electron …` die Variable `ELECTRON_RUN_AS_NODE` entfernen.

### Ton: drei Fallen, die schon einmal zugeschnappt sind (24.11.2026)

Die Sprachausgabe hat **keine Sprach-Einstellung** – sie rät die Sprache je Abschnitt aus dem Text. Und niemand kann 120 Lerntage durchhören. Deshalb gilt:

1. **Die 12 Wörter eines Lerntags sind EIN Abschnitt** („Zero. Uno. Due. …“), nie ein Abschnitt je Wort. Einzeln sprach sie Wörter, die es auch im Englischen gibt (zero, due, no, male, fare …), englisch aus – 26 von 1440. Im Zusammenhang der Liste bleibt sie beim Italienischen. Ein italienischer Vorspann als eigener Abschnitt hilft nicht. Bleibt ein einzelnes Wort auffällig: zweite Fassung der Liste erzeugen und Wort für Wort vergleichen, notfalls mit einer Schreibweise, die nur italienisch gelesen werden kann („Nò“, „Tré“, „La resèpscion“ – Abschnitt `woerter` in `scripts/italiano-ton-ersatz.json`; der Text im Tool bleibt, wie er ist).
2. **Dialogzeilen nie nach Pausenlänge und Textlänge teilen.** Die Pausen zwischen zwei Sätzen derselben Figur sind so lang wie die zwischen zwei Figuren; die Schätzung lag bei 517 von 1173 Zeilen an 109 von 120 Lerntagen um ein, zwei Wörter daneben (das „Sì.“ hing an der Vorzeile) – auch an 102 der 112 Tage, die als `ds: 1` vermerkt waren. Jetzt gibt der Spracherkenner die Grenzen vor, und jede Zeile wird danach für sich gehört. Ohne gültige Schnittdatei (fehlt, älter als die Aufnahme, falsche Stückzahl) fällt der Bau auf die alte Schätzung zurück – der Bau meldet solche Tage, `… fertig` ebenfalls („bau“).
3. **Dialogzeilen, die nur aus „englischen“ Wörtern bestehen** („Oh no! No, no, no!“), spricht sie englisch – ebenso oft ein einzelnes „No!“ am Zeilenanfang. Abhilfe: die Zeile einzeln neu vertonen, mit „nò“ statt „no“ und einem italienischen Hilfssatz davor, der beim Teilen wegfällt. Liste und Schreibweise stehen in `scripts/italiano-ton-ersatz.json`; `python scripts/italiano-ton-pruefe.py ersatz` übernimmt eine Ersatzzeile nur, wenn sie messbar besser ist. Der Text im Tool bleibt dabei unverändert.

`ds: 1` (Zeilen taugen für Hör-Aufgaben) gibt es nur, wenn die Hörprobe jede Zeile vollständig in ihrem Stück gefunden hat.

Grenzen der Messung: Wörter, die in beiden Sprachen gleich klingen (sei/„say“, blu/„blue“, mai/„my“, tu/„too“, chi/„key“), hält der Erkenner für englisch, obwohl sie stimmen. Lehnwörter wie „la reception“ klingen zu Recht englisch.

## Tests (`.tmp-test/italiano/`, nicht im Repo)

- Logik: `kern_test.ts` (Aufruf im Dateikopf) – Antwortprüfung, Karteikasten, Serie, Tagesstand, Verben und der Aufbau aller Lektionen, Tests und Prüfungen aus den echten Inhalten.
- Oberfläche: Vite auf Port 5199, dann `npx electron .tmp-test/italiano/ui_main.cjs "szene=…"` (tag1, tageswechsel, pruefung, rundgang, bereiche, einstufung, urkunde, ton; `&hell=1` für das helle Schema).
- Echter Build: `npx vite build`, dann `npx electron .tmp-test/italiano/prod_main.cjs`.
- Abspielweg (Tonweg wach halten): `npx electron .tmp-test/italiano/tonweg/main.cjs`. Nach neuem Ton vorher `npx esbuild src/italiano/kern/ton.ts --bundle --format=iife --global-name=Ton --outfile=.tmp-test/italiano/tonweg/ton.js` ausführen und `t001.ogg`, `t002.ogg` nach `tonweg/italiano/ton/` kopieren. Der Test misst Zeiten – nur auf einem ruhigen Rechner aussagekräftig.
