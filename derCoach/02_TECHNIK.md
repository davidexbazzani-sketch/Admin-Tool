# Der Coach – Technik

> **Stand 25.11.2026:** Entscheidungen und Korrekturen in [08_ENTSCHEIDUNGEN.md](08_ENTSCHEIDUNGEN.md) gehen dieser Datei vor (u. a. alle 14 Bereiche in Stufe 1, Bereichsseiten, rund 60 Lerntage je Bereich, Staffel, Einfluss-Klassen, korrigierte Zahlen).

Dieser Teil beschreibt, wie der Coach ins IT Admin Tool passt. Er beruht auf dem Stand des Projekts vom 24.11.2026. **Prüfe jede Angabe am Code, bevor du sie übernimmst** – die bestehenden Räume (`src/italiano/`, `src/brain/`, `src/terra/`) sind das Vorbild, ihre `LIESMICH.md` die Hausordnung.

## 1. Einbindung ins Admin Tool

| Datei | Änderung |
|---|---|
| `src/types.ts` | `'der-coach'` in den Typ `Screen` aufnehmen |
| `src/utils/menuCatalog.ts` | `{ id: 'der-coach', label: 'Der Coach', category: 'Sonstiges', elternteil: 'games' }` direkt hinter dem Eintrag `games`, vor `vier-gewinnt` – so steht die Kachel oben |
| `src/utils/featureRegistry.ts` | Beschreibung des Eintrags `games` ergänzen |
| `src/App.tsx` | `lazy(() => import('./coach/DerCoach'))`, `case 'der-coach'`, dazu die Erinnerung über `Spaeter` (wie `ItalienischErinnerung`) |
| `src/screens/Pausenraum.tsx` | eigene breite Kachel (`md:col-span-2`), die nur `src/coach/kurzStand.ts` lädt; Einleitungssatz ergänzen |
| `electron/brainSpeicher.ts` | drei neue Ablagen nach dem Muster von `terra`: `coach` (Endung `.dc`, Kopf `DC1\n`), `coachBuch` (Endung `.dcb`, Kopf `DB1\n`) und `coachTon` (Endung `.dct`, Kopf `DT1\n`, für Vergleichsaufnahmen), jeweils mit `laden`, `speichern`, `loeschen`, `beiseite` |
| `electron/preload.ts`, `src/electronAPI.ts` | `coachLaden`, `coachSpeichern`, `coachLoeschen`, `coachBeiseite` und dasselbe für `coachBuch` und `coachTon` |
| `package.json` | in `build.files` die Zeile `"!public/coach/**"` (die Kopie in `dist/` reicht, wie bei `italiano` und `terra`) |
| `public/coach/bilder/`, `public/coach/ton/` | Bilder und Ton; wie bei den anderen Räumen nicht im Repository |
| `scripts/` | `coach-pruefe.mjs`, `coach-groesse.mjs`, `coach-bilder.cjs`, `coach-ton-auftrag.mjs`, `coach-ton.cjs` |

Sonst wird außerhalb von `src/coach/` nichts angefasst. Die Sidebar braucht keinen Eintrag (Unterpunkte mit `elternteil` erscheinen als Kachel).

Vorhandene Muster, die du wiederverwendest (ansehen, nicht importieren):
- Windows-Benachrichtigung im Renderer: `src/components/chat/ChatController.tsx` (`new Notification(…)`)
- Mikrofon: `src/aufnahme/aufnehmen.ts` (`getUserMedia` mit `audio`)
- Bilder verkleinern: `scripts/terra-bilder.cjs`
- Ton-Aufträge und Schnitt: `scripts/italiano-ton-auftrag.mjs`, `scripts/italiano-ton.cjs`
- Inhaltsprüfung: `scripts/italiano-pruefe.mjs`
- Karteikasten und Serie: `src/italiano/kern/kasten.ts`, `src/italiano/kern/serie.ts`
- Wertung und Fähigkeitsschätzung: `src/brain/kern/wertung.ts`, `src/brain/iq/irt.ts`
- Aufgaben ohne Wiederholung: `src/brain/ablauf/ohneWiederholung.ts`

## 2. Ordnerstruktur

```
src/coach/
  DerCoach.tsx            Wurzel: Laden, Navigation, Einstieg oder Heute
  coach.css               Farbwelt --dc-… unter .dc-app; hell über .light .dc-app
  LIESMICH.md             Bauplan des Raums (pflegst du mit)
  kurzStand.ts            ein Satz für Kachel und Erinnerung; lädt weder Inhalte noch Oberfläche
  Erinnerung.tsx          Karte unten rechts (Training, Vorhaben, Missions-Nachfrage)
  host/
    host.ts               Schnittstelle CoachHost (siehe 3)
    adminTool.ts          Umsetzung fürs Admin Tool – EINZIGE Datei mit Importen von außerhalb
  kern/                   reine Logik, ohne React, ohne Uhr und Zufall von außen
    typen.ts              Lernstand
    inhaltTypen.ts        Aufbau der Inhalte
    inhalt.ts             Inhalte nachladen (ein Teilpaket je Bereich und Stufe)
    zeit.ts  zufall.ts    Kalendertag in Berliner Zeit; Zufall nur mit Startwert
    speicher.ts           Zustand (zustand) + verschlüsselte Ablage über host
    buch.ts               zweite Ablage: Schätze, Kompass-Texte, Reflexionen
    gehirn/
      schaetzung.ts       Wissen / Können / Tun je Fähigkeit
      schwierigkeit.ts    Stufe je Fähigkeit und Format nachführen
      wiederholung.ts     Karteikasten mit fünf Fächern
      kalibrierung.ts     Sicherheit gegen Trefferquote
      muster.ts           wiederkehrende Tendenzen
      antrieb.ts          Rhythmus, Durchhänger, Rückkehr
      planer.ts           Training und Runde zusammenstellen
      urteil.ts           Klartext für die „Ecke“
    reise.ts  serie.ts  missionen.ts  vorhaben.ts  kompass.ts
    ernstfall.ts          Ernstfall-Fahrplan: Termin → Schritte je Zeitpunkt
    wirkung.ts            Rangliste der Beruhigungs-Werkzeuge aus Vorher-/Nachher-Werten
    sprechbild.ts         Muster der Deutlichkeit aus Selbstprüfung und Messung
    ton.ts                dritte Ablage: Vergleichsaufnahmen
    ki.ts                 vorbereitete Schnittstelle, liefert offline nichts
    mikro/aufnahme.ts  mikro/analyse.ts
  inhalt/
    LIESMICH.md           Schreibregeln (aus 06_INHALT_REGELN_MUSTER.md übernehmen)
    bereiche.json  faehigkeiten.json  besetzung.json  quellen.json
    coach-zeilen.json  missionen.json  formcheck.json  einstufung.json
    vorhaben.json  ideen.json  kompass.json
    notfall.json          Beruhigungs-Werkzeuge, Notfall-Abläufe, Texte für den Baustein „fachhilfe“
    lesetexte.json        Lesetexte mit Wort- und Silbenzahl (Startaufnahme, klartext)
    <bereich>/stufe-1.json  stufe-2.json  stufe-3.json      Einheiten
    <bereich>/pool-<format>.json                             Übungsvorräte
    <bereich>/dialoge.json  <bereich>/sparring.json
    bibliothek/<thema>.json
  uebungen/               ein Baustein je Format (Karte, Schaetzen, Mythos, Dialog, Konter, …)
  ablauf/                 Lauf.tsx (ein Training), Sparring.tsx, Formcheck.tsx, Einstufung.tsx
  bereiche/               Einstieg, Heute, Reise, Halle, Missionen, Kompass, Vorhaben, Ecke, Bibliothek, Einstellungen
  figuren/                Bruno (Bild + Sprechblase), Strecke.tsx (Reise), Diagramme, Strichfiguren
```

Benennung wie im restlichen Projekt: deutsch, sprechend, Dateien klein halten (Richtwert unter 400 Zeilen).

## 3. Host-Adapter – die Grenze zum Tool

Damit der Coach später als eigenes Programm laufen kann, kennt nur `host/adminTool.ts` das Admin Tool.

```ts
// src/coach/host/host.ts
export interface Ablage {
  laden(): Promise<{ ok: boolean; daten: string | null; verschluesselung: boolean; fehler?: string }>
  speichern(json: string): Promise<{ ok: boolean; fehler?: string }>
  loeschen(): Promise<boolean>
  beiseite(art: 'defekt' | 'alt'): Promise<boolean>
}

export interface CoachHost {
  /** angemeldeter Benutzer; leer = nicht angemeldet */
  benutzer(): string
  ablage(name: 'coach' | 'coachBuch' | 'coachTon'): Ablage
  /** gibt es das Ziel in dieser Umgebung (und darf der Benutzer es sehen)? */
  kannOeffnen(ziel: 'parla-italiano'): boolean
  oeffne(ziel: 'parla-italiano' | 'pausenraum'): void
  /** Windows-Hinweis; Text nie mit persönlichem Inhalt */
  benachrichtige(titel: string, text: string): void
  bildPfad(datei: string): string
  tonPfad(datei: string): string
}
```

`coach-pruefe.mjs` prüft diese Grenze mit: Keine Datei unter `src/coach/` außer `host/adminTool.ts` darf etwas von außerhalb des Ordners importieren (Ausnahmen: `react`, `lucide-react`, `zustand`). Die Kachel in `Pausenraum.tsx` und die Zeilen in `App.tsx` sind die einzigen Stellen außerhalb, die den Coach kennen.

## 4. Datenmodell: Inhalte

Der vollständige Aufbau mit Beispielen steht in `06_INHALT_REGELN_MUSTER.md`. Kern:

```ts
export type BereichId = 'aussprache' | 'stimme' | 'ausdruck' | 'gespraech' | 'ueberzeugen' | 'smalltalk'
  | 'konter' | 'stegreif' | 'lesen' | 'ruhe' | 'mut' | 'selbst' | 'antrieb' | 'flirten'
/** wählbare Zusätze im Bereich aussprache */
export type SchwerpunktId = 'nuscheln' | 'lispeln' | 'stottern'
/** A belegt · B gestützt · P Praxiswissen · D Denkmodell · U umstritten oder Mythos */
export type Beleg = 'A' | 'B' | 'P' | 'D' | 'U'
export type Ton = 'ruhig' | 'klar' | 'trocken'

export interface Faehigkeit { id: string; bereich: BereichId; name: string; kurz: string }

export interface Einheit {
  id: string                 // "konter-1-01" — eingefroren; Schwerpunkte: "aussprache-n-01", "-l-", "-s-"
  bereich: BereichId
  schwerpunkt?: SchwerpunktId // nur gesetzt bei den je sechs Einheiten eines Schwerpunkts
  stufe: 1 | 2 | 3           // bei Schwerpunkten: Einheit 1–3 = Stufe 1, 4–6 = Stufe 2
  nr: number
  titel: string              // höchstens 48 Zeichen
  faehigkeiten: string[]     // 1 bis 2
  dauerMin: number           // 5 bis 7
  beleg: Beleg
  belegHinweis?: string      // was genau belegt ist und was nicht
  quellen: string[]          // Schlüssel aus inhalt/quellen.json
  aha: string                // der eine Gedanke, höchstens 220 Zeichen
  schritte: Schritt[]        // 5 bis 9, mindestens drei verschiedene Formate, mindestens zwei aktive
  regel: string              // Merksatz, höchstens 90 Zeichen
  merkkarten: { frage: string; antwort: string }[]   // 2 bis 3
  mission?: string           // Kennung aus missionen.json; fehlt, wenn keine Aufgabe für draußen passt
  voraus?: string[]
}

/** Jede Übung – in Einheiten wie in Vorräten – trägt Fähigkeit, Stufe und Kanal. */
export interface UebungsKopf {
  id: string
  faehigkeit: string
  stufe: number              // 1 leicht … 10 sehr schwer
  kanal: 'wissen' | 'koennen'
  laut?: boolean             // braucht lautes Sprechen → nur bei Schalter „laut üben“
  leise?: string             // Kennung der stillen Ersatzübung (Pflicht, wenn laut gesetzt ist)
  uhr?: boolean              // läuft mit Stoppuhr → entfällt bei „ohne Zeitdruck“
}
```

`Schritt` ist eine Vereinigung über das Feld `art` (Formate aus `01_KONZEPT.md`, Abschnitt 8). Auswahl-Antworten können gestuft sein (`wert: 0 | 1 | 2`) und eine `tendenz` tragen, aus der das Coach-Gehirn Muster liest.

## 5. Datenmodell: Lernstand

Drei Ablagen, damit der häufig geschriebene Stand klein bleibt:

- **`coach`** – Profil, Fähigkeitswerte, erledigte Einheiten, Karteikasten, gesehene Aufgaben, Reise, Serie, Missionen, Vorhaben, Erinnerungs-Verlauf, Muster, Kalibrierung, Antrieb, Wirkung der Werkzeuge, Sprechbild, Ernstfall-Termine (nur Datum, Art und Stand – kein Titel).
- **`coachBuch`** – alles Geschriebene: Geschichten-Schatz, Konter-Schatz, Erfolgsbuch, Sätze, Kompass-Texte, Reflexionen, eigene Leitern, Startroutine, Titel und Notizen zu Ernstfällen.
- **`coachTon`** – Vergleichsaufnahmen der eigenen Stimme: höchstens acht, je höchstens 30 Sekunden, Opus mit rund 16 kbit/s als Base64 (zusammen unter 1 MB). Wird nur geladen, wenn der Vergleich geöffnet wird. Prüfe vorab, dass die Ablage 1,5 MB ohne spürbare Verzögerung verschlüsselt; sonst je Aufnahme eine eigene Datei.

```ts
export interface Faehigkeitsstand {
  w: number; k: number; t: number        // Wissen, Können, Tun als Wert zwischen −3 und +3
  nw: number; nk: number; nt: number     // Anzahl Belege je Kanal
  stufe: number                          // aktuelle Aufgabenstufe 1…10
  zuletzt: string                        // Kalendertag
}

export interface Profil {
  bereiche: BereichId[]
  schwerpunkte: SchwerpunktId[]          // nur wirksam, wenn 'aussprache' gewählt ist
  lautUeben: boolean                     // letzter Stand des Schalters „Ich kann gerade laut sprechen“
  ohneZeitdruck: boolean                 // Vorgabe true, sobald 'stottern' gewählt wird
  aufnahmenBehalten: boolean             // Vergleichsaufnahmen speichern – nur nach ausdrücklichem Ja
  gewicht: Partial<Record<BereichId, 1 | 2 | 3>>
  ton: Ton
  dauer: 10 | 15 | 30
  tage: number[]                         // Wochentage 1…7
  wofuer: string
  situationen: string[]
  mutproben: boolean
  mikrofon: boolean
  klang: boolean                         // vertonte Teile abspielen
  diskret: boolean
  erinnerung: { an: boolean; um: string; windows: boolean; proTag: 0 | 1 | 2 | 3 | 4; ruheVon: string; ruheBis: string }
  schaerfe: 'sanft' | 'normal' | 'arschtritt'
}
```

Regeln wie bei den anderen Räumen: Versionsfeld `v`; beim Laden fehlende Felder ergänzen (`pruefeDaten`); eine Datei, die sich nicht lesen ließ, nie überschreiben, sondern beiseitelegen; Schreiben entprellt und nacheinander; Verläufe begrenzen (z. B. Erinnerungen 90 Tage). Export als eine JSON-Datei (Aufnahmen auf Wunsch als einzelne Tondateien), Löschen aller drei Ablagen aus den Einstellungen – die Aufnahmen auch einzeln und für sich allein.

## 6. Coach-Gehirn: Rechenregeln

Alles als reine Funktionen mit Tests. Die Zahlen sind Startwerte – begründe Abweichungen im Plan.

**Fähigkeitswert.** Je Fähigkeit und Kanal ein Wert θ zwischen −3 und +3; Anzeige als p = 1 / (1 + e^(−θ)). Aufgabenschwierigkeit b = (Stufe − 5,5) × 0,6.

```
erwartet = 1 / (1 + e^(−(θ − b)))
θ ← θ + K × (ergebnis − erwartet)        ergebnis: 0, 0,5 oder 1
K = max(0,12, 0,5 / √(n + 1))             n = bisherige Belege in diesem Kanal
```

**Kanäle.** Wissen: `auswahl`, `zuordnen`, `rangfolge`, `mythos`, `fehler`, `szene`, `buendel`, `tonfall`, `kunstgriff`. Können: `dialog`, `konter`, `blitz`, `umformulieren`, `wortwahl`, `anschluss`, `spiegeln`, `jaund`, `bauplan`, `kern`, `sprechen`, `nachsprechen`, `lautleiter`, `klartext`, `routine`, Sparring. Tun: erledigte Missionen (Schwierigkeit aus der Leiterstufe), ausgewertete Ernstfälle und die Verhaltensfragen im Formcheck. Ohne Wertung bleiben `lockern`, `atem` und `fahrplan` (sie zählen nur als „gemacht“). Formate mit Selbstbewertung (freie Antworten) zählen mit halbem K.

**Tun verblasst.** Ohne neue Mission verliert der Tun-Wert je 30 Tage ein Zehntel seines Abstands zum Startwert. Wissen und Können verblassen nicht – dafür gibt es die Wiederholung.

**Form.** Anzeige je Fähigkeit: 0,3 × Wissen + 0,4 × Können + 0,3 × Tun. Bei weniger als sechs Belegen steht „noch wenig Daten“ statt einer Zahl.

**Lücke.** Wissen − Tun > 0,3 (als p) bei mindestens sechs Wissens-Belegen → Regel „kleinere Mission statt neuer Lektion“.

**Schwierigkeit.** Trefferquote der letzten zehn Aufgaben je Fähigkeit: über 0,9 → Stufe + 1; unter 0,7 → Stufe − 1. Zielbereich 0,8 bis 0,85.

**Wiederholung.** Fünf Fächer mit Abständen von 1, 3, 7, 16 und 35 Tagen. Richtig → ein Fach weiter; falsch → zurück in Fach 1. Merkkarten kommen aus Einheiten, aus dem Konter-Schatz und aus den „Sätzen für die Ecke“.

**Kalibrierung.** Mittlere Sicherheit minus Trefferquote über mindestens 15 Aufgaben. Abweichung über 0,15 → Hinweis in der Ecke (Überschätzung oder Unterschätzung).

**Muster.** Auswahl-Antworten tragen optional eine `tendenz` (z. B. `rechtfertigen`, `ausweichen`, `angreifen`, `einzelzeichen`, `ausfragen`, `gedankenlesen`, `weichmacher`, `uebertrumpfen`). Mindestens vier Treffer in 14 Tagen und über 40 % der Gelegenheiten → Muster gilt als aktiv und erscheint in der Ecke mit einer passenden Einheit.

**Wirkung der Werkzeuge.** Je Beruhigungs-Werkzeug (Kennungen in `inhalt/notfall.json`) der gleitende Mittelwert von „Anspannung vorher minus nachher“ (0–100) über die letzten acht Einsätze. Rangliste erst ab drei Einsätzen je Werkzeug; darunter gilt die Reihenfolge aus dem Inhalt. Ein Werkzeug mit Mittelwert unter 3 nach fünf Einsätzen rückt ans Ende. Die Liste ist eine Beobachtung, kein Versprechen – so steht es auch in der App.

**Sprechbild.** Fünf Merkmale mit je einem Wert 0–1: `tempo`, `oeffnung`, `endungen`, `lautstaerke`, `satzende`. Quellen: Selbstprüfung nach Aufnahmen (Prüfliste, fünf Punkte), ab Stufe 5 zusätzlich Messwerte (Tempo, Pausenanteil, Pegel am Satzende) und auf Wunsch die Einschätzung einer Vertrauensperson. Das stärkste Merkmal bestimmt, welche Übungen der Planer in `aussprache` bevorzugt. Für den Schwerpunkt Stottern wird kein Sprechbild geführt.

**Antrieb.** Zustände: `fluss` · `wackelt` (ein Trainingstag ausgelassen) · `pause` (drei oder mehr) · `rueckkehr` (erstes Training danach). Folgen: Kurztraining anbieten, Serie rettbar machen, Wiedereinstieg mit einer leichten Einheit, den Satz „Wofür trainierst du?“ zeigen.

## 7. Planer

```
planeTraining(stand, heute, dauer)
  1 Festigen     fällige Merkkarten, Anzahl nach Dauer
  2 Neu          Bereich wählen: Gewicht × Rückstand, nicht derselbe wie beim letzten Training
                 (wenn mehr als ein Bereich gewählt ist); nächste Einheit mit erfüllten Voraussetzungen
  3 Üben         (ab 15 Min) schwächste begonnene Fähigkeit: niedrige Form, lange nicht geübt
                 oder Muster aktiv; Aufgaben aus dem Vorrat in passender Stufe;
                 anderes Format als im Block davor
  4 Vertiefen    (bei 30 Min) Bibliotheksbeitrag zur Einheit oder zweite Einheit aus anderem Bereich
  5 Transfer     offene Mission abfragen; sonst eine vorschlagen:
                 Leiterstufe = höchste erledigte + 1, bei „Lücke“ eine Stufe darunter
  Zufall         nur aus Startwert (Benutzer + Kalendertag) → gleicher Tag, gleicher Plan
  Abwechslung    kein Format zweimal hintereinander
  Laut           Schalter aus → nur Übungen ohne `laut`; für jede laute die Ersatzübung aus `leise`,
                 die laute kommt auf die Liste „Später laut“ (höchstens zehn Einträge)
                 Schalter an → in `aussprache` bis zur Hälfte der Übungen laut, in `ruhe` bis zu zwei
                 je Training, in allen anderen Bereichen höchstens eine in fünf Trainings
  Zeitdruck      bei `ohneZeitdruck` keine Übung mit `uhr`; `blitz` läuft ohne Uhr
  Schwerpunkte   Einheiten eines Schwerpunkts nur, wenn er gewählt ist; sie wechseln sich mit dem
                 Kern von `aussprache` ab (höchstens jede zweite Einheit des Bereichs)
  Ernstfall      liegt ein Termin in den nächsten sieben Tagen, hat `ruhe` Vorrang: Startroutine,
                 erster Satz, am Vortag nur Kurztraining
```

`planeRunde` legt fünf Trainings fest und bestimmt das Sparring (Bereich mit den meisten Einheiten der Runde). Nach vier Runden folgt der Formcheck. Ändert der Nutzer die Bereiche, wird ab dem nächsten Training neu geplant; Erledigtes bleibt stehen.

Die **Einstufung** setzt Startwerte je Fähigkeit und kann Einheiten der Stufe 1 als „bekannt“ markieren – sie erscheinen dann als Kurzfassung (Regel, eine Übung, Merkkarten).

## 8. Erinnerungen

`src/coach/Erinnerung.tsx`, nachgeladen über `Spaeter` (frühestens eine Minute nach dem Start des Tools), prüft alle fünf Minuten.

Quellen, in dieser Rangfolge: (1) Ernstfall-Fahrplan (Vortag und rund eine Stunde vorher; nur wenn der Nutzer das beim Eintragen eingeschaltet hat), (2) Nachfrage zu einer gestern gewählten Mission, (3) heutiges Training offen (ab der eingestellten Uhrzeit, einmal am Tag), (4) Vorhaben. Die Karte zum Ernstfall nennt nie den Anlass, nur „Dein Fahrplan ist bereit“.

Regeln (in `kern/vorhaben.ts`, vollständig getestet):
- Obergrenze pro Tag aus dem Profil; Ruhezeiten; Mindestabstand 90 Minuten.
- Nie im Raum selbst, nie während eines laufenden Trainings.
- Nie gleichzeitig mit einer anderen Erinnerung: Ist `[data-pi-erinnerung]` im Dokument sichtbar, wartet der Coach bis zur nächsten Prüfung. Die Karte von Parla Italiano wird nicht verändert.
- „Heute nicht“ gilt bis Mitternacht für diese Quelle.
- Je Vorhaben wechseln die Arten reihum; je Art wird die Reaktionsquote geführt, schwache Arten kommen seltener.
- Dreimal hintereinander weggeklickt → einmalige Nachfrage (leiser, kleiner, streichen).
- Zeitfenster: Zähler je Stunde, bevorzugt werden Stunden mit Reaktion.
- Diskret-Modus: zugeklappte Karte ohne Inhalt. Windows-Benachrichtigung nur mit dem festen Text „Der Coach hat etwas für dich“.
- Merker in `localStorage` enthalten nie Inhalte, nur Datum und Zähler (wie `pi_erinnert_…`).

## 9. Mikrofon

In den Formaten `sprechen`, `buehne`, `nachsprechen`, `lautleiter` und `klartext`, nur wenn im Profil eingeschaltet. Zwei Dinge sind getrennt:

- **Laut sprechen** (Feld `laut`) braucht kein Mikrofon. Jede laute Übung hat eine stille Ersatzübung und den Knopf „Gerade nicht allein“ (überspringt ohne Nachteil).
- **Aufnehmen** ist immer freiwillig. Ohne Aufnahme bewertet der Nutzer mit der Prüfliste aus dem Gefühl.

Ausbau in zwei Schritten:
- **Stufe 1 – Aufnehmen und Anhören.** `getUserMedia({ audio })` → `MediaRecorder` → Aufnahme bleibt im Arbeitsspeicher → Anhören (auch im Wechsel mit der vorigen Fassung) → verwerfen. Dazu die „Startaufnahme“: Wer zustimmt, speichert zu Beginn einen festen Lesetext in `coachTon` – der spätere Vergleich braucht einen Anfangspunkt.
- **Stufe 5 – Auswerten.** `decodeAudioData` → Analyse → Rückmeldung; gespeicherte Aufnahmen lassen sich nachträglich auswerten.

Der hörbare Vergleich „vorher – nachher“ ist das wichtigste Werkzeug im Bereich `aussprache`: Die eigene Stimme klingt auf einer Aufnahme fremd, weil man sich sonst auch über die Schädelknochen hört – die Aufnahme zeigt, was die anderen hören.

`kern/mikro/analyse.ts` (reine Funktionen, mit erzeugten Testsignalen prüfbar):
- Pegelverlauf in 10-Millisekunden-Schritten; Schwelle aus dem Grundrauschen
- Sprech- und Pausenabschnitte; Pausenanteil, längste Pause, Zahl der Pausen über 0,7 Sekunden
- Silbenkerne als Spitzen des Pegelverlaufs → geschätztes Tempo
- Grundton per Autokorrelation → Spannweite in Halbtönen („Melodie“)
- Lautstärke-Spanne
- bei bekanntem Text (`klartext`, Startaufnahme): Silben je Sekunde aus der hinterlegten Silbenzahl und der reinen Sprechzeit – genauer als die Schätzung aus dem Pegel
- „Satzende hält“: mittlerer Pegel im letzten Fünftel jedes Sprechabschnitts gegen den Rest
- Vergleich zweier Fassungen desselben Textes (Tempo, Pausenanteil, Pegel) als Differenz

Rückmeldung in Worten und Bereichen („eher zügig“, „wenig Pausen“), nicht mit Scheingenauigkeit. Maßstab für das Tempo ist nie eine feste Zahl, sondern die eigene Ausgangslage („ein Fünftel langsamer als deine Startaufnahme“). Füllwörter zählt der Nutzer beim Anhören per Klick; der Coach erklärt, dass einzelne „Ähs“ unschädlich sind.

Nicht bauen: eine automatische Bewertung einzelner Laute (etwa „S-Laut richtig oder falsch“). Dafür reicht die Technik ohne Spracherkennung nicht; ein falsches Urteil schadet mehr, als es nützt. Erlaubt ist ein **Versuch**, den du im Plan getrennt ausweist: die Schärfe von Zischlauten als Anteil hoher Frequenzen sichtbar machen (nur Anzeige zum Selbstvergleich, kein Urteil) – und nur, wenn Tests mit echten Aufnahmen zeigen, dass die Anzeige stabil ist. Bei gewähltem Schwerpunkt Stottern entfallen Tempo- und Pausen-Urteile vollständig.

Vergleichsaufnahmen liegen in `coachTon` (siehe Abschnitt 5): Startaufnahme, die letzten drei Formchecks und je Schwerpunkt eine Startaufnahme – die jeweils älteste Formcheck-Aufnahme wird überschrieben.

## 10. Vorbereitete KI-Schnittstelle

```ts
// kern/ki.ts
export interface FreitextAuftrag { art: 'konter' | 'umformulieren' | 'anschluss' | 'kern'; aufgabe: string; antwort: string; kriterien: string[] }
export interface FreitextUrteil { kriterien: Record<string, 0 | 1 | 2>; hinweis: string }
export interface Ki { verfuegbar(): boolean; bewerte(a: FreitextAuftrag): Promise<FreitextUrteil | null> }
export const ki: Ki = { verfuegbar: () => false, bewerte: async () => null }
```

Die Übungs-Bausteine rufen `ki.bewerte` auf und fallen bei `null` auf Musterlösungen mit Selbstbewertung zurück. Kein Netzwerk-Code in diesem Auftrag.

## 11. Bilder und Ton

**Budget: höchstens 100 Higgsfield-Credits insgesamt.** Wenn dir die Werkzeuge nicht zur Verfügung stehen, erzeugst du Auftragsdateien (wie `italiano-ton-auftrag.mjs`), und Davide lässt sie in Claude (Chat) ausführen. Vor jedem Auftrag: Kosten schätzen lassen und in `coach-groesse.mjs` verbuchen.

| Posten | Menge | Annahme | Credits |
|---|---|---|---|
| Figur: Entwürfe zur Auswahl | 4 Bilder | 0,75 je Bild (Kostenvoranschlag `gpt_image_2_6`, 24.11.2026) | 3 |
| Figur: Haltungen und Ausdrücke | 10 Bilder | mit dem gewählten Entwurf als Vorlage | 7,5 |
| Halle, Kachel, Einstieg | 6 Bilder | | 4,5 |
| Szenen fürs Menschen-Lesen | 34 Bilder | | 25,5 |
| Szenen für `aussprache`, `ruhe` und `ueberzeugen` | 6 Bilder | Telefon, Videokonferenz, hinter der Bühne, vor der Tür, Erstgespräch, Vorstellung in der Runde | 4,5 |
| Bühne (Publikum) | 4 Bilder | | 3 |
| Ausschuss und Nachbesserung | rund 20 % | | 10 |
| Ton: Bruno | 7.000 Zeichen | rund 4,85 je 1.000 Zeichen (`elevenlabs_v4`, im Projekt gemessen am 18.11.2026) | 34 |
| Ton: Hörproben zur Stimmwahl | 3 Stimmen | | 3 |
| Reserve | | | 5 |
| **Summe** | | | **100** |

Preise ändern sich – vor Beginn neu schätzen lassen.

**Bilder**
- Zuerst die Figur: vier Entwürfe, Davide wählt. Erst dann die übrigen Bilder mit dem gewählten Entwurf als Vorlage.
- Beschreibung der Figur in `01_KONZEPT.md`, Abschnitt 3. In jeden Auftrag: frei erfundene Person, keine Ähnlichkeit mit realen Personen, keine Schrift, keine Logos, ruhiger Hintergrund, filmisches Licht.
- Szenen zeigen ganze Situationen (Haltung, Abstand, Zuwendung, Umgebung), nicht einzelne Grimassen. Vielfältige Besetzung. Jede Szene gehört zu einer Aufgabe mit klarer, vertretbarer Auflösung.
- **Abnahme:** Jedes Bild sieht Davide vor der Übernahme. Bilder mit Fehlern (Hände, Gesichter) fliegen raus. Rückfall für Haltungen: Strichfiguren als SVG.
- Verkleinern mit `coach-bilder.cjs` (Muster `terra-bilder.cjs`): Szenen 960 × 540, Figur 640 × 800, Kachel 1000 × 563, WebP mit Güte um 0,72.

**Ton**
- Eine deutsche Stimme für Bruno; drei Hörproben, Davide wählt.
- Vertont werden (zusammen höchstens 7.000 Zeichen): acht geführte Übungen (Runterfahren in 60 Sekunden, Seufzer-Atmung, Anspannen und Loslassen, Stimme finden, Vor dem Auftritt, Körper-Check, bestmögliches Selbst – Einleitung, Abschluss-Ritual), zwölf Hörbeispiele (Betonung, Pausen, Tonfall, Tempo, „derselbe Satz, drei Wirkungen“) und zehn Vorsprech-Sätze für `aussprache` (klar und natürlich gesprochen). Mundstellungen und Zungenlagen zeigst du als Zeichnung (SVG), nicht als Bild.
- Nuscheln, Lispeln oder Stottern werden nie künstlich erzeugt oder vorgespielt.
- Speichern als Ogg/Opus, eine Tonspur, 24 kbit/s. Schnitt und Prüfung nach dem Muster von Parla Italiano – mit den dort beschriebenen Fallen (Sprache wird je Abschnitt geraten; Abschnitte nie blind nach Pausen teilen).
- Ton ist immer abschaltbar; jeder vertonte Text steht auch als Schrift da.

## 12. Größenbudget

Davide hat das ursprüngliche Limit gelockert. **Richtwert 15 MB, Obergrenze 20 MB** zusätzliche Größe des Installers.

| Teil | Erwartung | Obergrenze |
|---|---|---|
| Bilder (rund 60, im Schnitt 90 KB) | 5,5 MB | 9 MB |
| Ton (rund 8 Minuten bei 24 kbit/s) | 1,5 MB | 4 MB |
| Aufnahmen des Nutzers | zählen nicht zum Installer (liegen im Benutzerprofil, unter 1 MB) | |
| Inhalte und Code (im Installer gepackt) | 2 MB | 4 MB |
| Reserve | | 3 MB |
| **Summe** | **9 MB** | **20 MB** |

`scripts/coach-groesse.mjs` rechnet nach jedem Build: Rohgröße von `dist/coach/**` (Bilder und Ton lassen sich nicht weiter packen) plus gepackte Größe der Coach-Teilpakete in `dist/assets/` (gzip als Näherung). Zum Abschluss jeder Stufe zusätzlich der echte Vergleich zweier Installer. Stand vor Beginn: `release/IT Admin Tool Setup 1.0.0.exe` mit 242.794.239 Bytes (24.11.2026).

Mehr Platz macht die App nur besser, wenn auch Credits da sind: Bei 100 Credits füllen Bilder und Ton kaum mehr als 8 MB. Wenn Davide mehr Bilder oder mehr Ton möchte, ist das Credit-Budget die Stellschraube – im Plan als Variante ausweisen.

## 13. Stufen im Detail

Jede Stufe endet mit der Abnahme aus `00_START.md`, Abschnitt 9.

**Stufe 1 – Fundament (spielbar)**
- Host-Adapter, Ablagen, Typen, Speicher, Farbwelt, Kachel, Menüeinträge
- Einstieg (Einführung, Ton, Bereiche mit Schwerpunkt-Frage, Situations-Check, Zeit)
- Bildschirme Heute, Reise (erste Fassung), Halle, Einstellungen
- Trainings-Lauf mit den fünfzehn Grundformaten: `karte`, `schaetzen`, `mythos`, `vergleich`, `auswahl`, `zuordnen`, `dialog`, `konter`, `blitz`, `umformulieren`, `reflexion`, `mission`, `atem`, `lockern`, `nachsprechen` – dazu `lautleiter` und `klartext` als Spielarten von `nachsprechen` sowie `routine` in einfacher Form
- Schalter „laut üben“ mit Ersatzübungen und Liste „Später laut“; Schalter „ohne Zeitdruck“
- Aufnehmen und Anhören, Startaufnahme mit Ablage `coachTon` (noch ohne Auswertung)
- Notfallkoffer in erster Fassung: Runterfahren in 60 Sekunden, Mittendrin-Karte, Abfrage „Anspannung vorher/nachher“
- Planer in einfacher Form (Reihenfolge, Wiederholung, Abwechslung), Serie mit Wochenziel und Kurztraining
- Erinnerung ans Training, Diskret-Modus
- `coach-pruefe.mjs`, `coach-groesse.mjs`, Tests
- Inhalte: 39 Einheiten (Stufe 1 von `konter`, `ruhe`, `aussprache` = 21, dazu die drei Schwerpunkte mit je 6 = 18), 4 Dialoge, 3 Sparrings, 6 Leitern mit je 10 Missionen (drei Bereiche, drei Schwerpunkte), Coach-Zeilen für 40 Anlässe in drei Tönen
- Vorräte: mindestens 60 Sprüche, 40 Zeitdruck-Aufgaben, 30 Umformulierungen, 60 Auswahlfragen, 30 Mythen; für `aussprache` 120 Übungswörter und -sätze nach Lauten geordnet, 40 eigene Zungenbrecher, 12 Lesetexte mit hinterlegter Silbenzahl, 20 Lockerungsübungen mit Zeichnung, je Schwerpunkt 60 Übungseinträge; für `ruhe` 12 Werkzeuge für den Notfallkoffer und 30 Sorgensätze zum Umdeuten
- Bilder: Figur (nach Auswahl), Kachel, Einstieg

**Stufe 2 – Coach-Gehirn**
- Fähigkeiten-Schätzung, Schwierigkeit, Kalibrierung, Muster, Antrieb, adaptiver Planer
- Einstufung, Sparring als eigener Ablauf, Formcheck, Formkurve
- Bildschirm Ecke; Bereiche ändern während der Reise
- Formate: `rangfolge`, `fehler`, `anschluss`, `spiegeln`, `jaund`, `bauplan`, `kern`, `selbstbild`
- Inhalte: 77 Einheiten (Stufe 1 der übrigen elf Bereiche), Einstufung und Formcheck für alle vierzehn Bereiche (je acht Szenario-Aufgaben, fünf Selbsteinschätzungen, drei Verhaltensfragen; in `aussprache` zusätzlich Lesetext und Prüfliste, in `ruhe` zusätzlich die Auswertung echter Anlässe), Vorräte je Bereich auf mindestens 80 Einträge, 11 Sparrings
- Sprechbild und Wirkungs-Rangliste in der Ecke

**Stufe 3 – Echtes Leben**
- Missionen mit Vorher/Nachher, Beweisliste, eigene Leitern (`leiter`), Mutproben mit eigenem Schalter
- Notfallkoffer vollständig (Startroutine, Ernstfall-Fahrplan mit `fahrplan`, „Was bei mir wirkt“), Nachbereitung, die vier Schätze, `gespraechskarte`, `geschichtenbau`, `humorlabor`, `kunstgriff`, `experiment`, `kritiker`
- Inhalte: 84 Einheiten (Stufe 2 aller Bereiche), die übrigen elf Leitern (110 Missionen, zusammen 170), 20 Mutproben, 6 Notfall-Abläufe

**Stufe 4 – Antrieb**
- Kompass mit sieben Stationen, Ziel-Pyramide, Wochen-Check
- Vorhaben mit Erinnerungs-Regelwerk, Wochenübersicht, optionale Windows-Benachrichtigung
- Erfolgsbuch, Durchhänger-Logik vollständig
- Formate: `woop`, `werte`, `lebensrad`, `schreibreise`, `studie`, `geschichte`
- Inhalte: 16 Vorhaben-Kategorien (je sechs kleinste Schritte, je zwölf Erinnerungen in drei Schärfen), 150 Ideen (Unternehmungen, Freuden, Impulse)

**Stufe 5 – Stimme, Bild, Ton**
- Auswertung der Aufnahmen (Abschnitt 9), Vorher-Nachher-Vergleich, Messwerte fürs Sprechbild; `sprechen`, `buehne`
- `szene`, `buendel`, `tonfall`, `wortwahl`
- Bilder und Ton laut Abschnitt 11; Inhalte: 34 Szenen-Aufgaben, 12 Hörbeispiele, 8 geführte Übungen, 10 Vorsprech-Sätze

**Stufe 6 – Meisterschaft und Feinschliff**
- Inhalte: 70 Einheiten (Stufe 3 aller Bereiche), Bibliothek (75 Beiträge), Mythen-Sammlung (55)
- Erhaltungstraining nach abgeschlossenem Bereich
- Barrierefreiheit, hell und dunkel, Export und Löschen
- Abschlussmessung Größe und Credits; Ablöse-Prüfung (Grenze zum Tool); `LIESMICH.md` vollständig

Summe: 270 Einheiten (39 + 77 + 84 + 70) – je Bereich 18, dazu 18 in den drei Schwerpunkten.

## 14. Tests und Prüfskripte

Wie bei den anderen Räumen unter `.tmp-test/coach/` (nicht im Repository):

- **Logik** (`npx tsx`): Schätzung (steigt bei Erfolg, sinkt bei Misserfolg, bleibt in Grenzen), Schwierigkeit, Wiederholung, Planer (Zeitbudget eingehalten, Abwechslung, gleicher Startwert → gleicher Plan, kein Format doppelt hintereinander, Anteil lauter Übungen je Bereich), Serie (Trainingstage, Rettung, Wochenziel), Vorhaben-Regeln (Obergrenze, Ruhezeiten, Drosselung), Speicher (fehlende Felder, fremde Datei, beiseite), Mikro-Analyse an erzeugten Signalen; Laut-Regel (Schalter aus → keine laute Übung, jede hat Ersatz, „Später laut“ wird nachgeholt), „ohne Zeitdruck“ (keine Übung mit Uhr; bei Schwerpunkt Stottern vorbelegt), Schwerpunkte (nicht gewählt → keine einzige Einheit, Übung, Mission oder Erinnerung daraus), Ernstfall-Fahrplan (Schritte je Zeitpunkt, Vorrang im Planer, Karte ohne Anlass), Wirkungs-Rangliste (Mindestzahl, Herabstufung), Ablage `coachTon` (Obergrenze, Überschreiben der ältesten, Löschen).
- **Inhalte** (`node scripts/coach-pruefe.mjs`): Aufbau, eindeutige Kennungen, verweise auf vorhandene Fähigkeiten, Quellen und Missionen, Feldlängen, genau eine beste Antwort, keine doppelten Auswahlen, Beleg-Stufe gesetzt, Zahlen nur mit Quelle, drei Töne vollständig, verbotene Wörter (Liste in `06`), Du-Form, Grenze zum Tool; jede laute Übung hat eine Ersatzübung; Einheiten der Schwerpunkte Lispeln und Stottern enthalten den Hinweis auf Fachhilfe; im Schwerpunkt Stottern keine Übung mit Uhr; Silbenzahl der Lesetexte stimmt mit einer Nachzählung überein.
- **Oberfläche**: headless Electron gegen Vite auf Port 5199 mit Szenen (`einstieg`, `schwerpunkte`, `heute`, `lauf`, `dialog`, `konter`, `nachsprechen`, `lockern`, `runterfahren`, `fahrplan`, `sparring`, `formcheck`, `ecke`, `mission`, `kompass`, `vorhaben`, `erinnerung`; jeweils auch mit `hell=1`). In der Shell vorher `ELECTRON_RUN_AS_NODE` entfernen.
- **Echter Build**: `npx vite build`, danach Start gegen `dist/`.

## 15. Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Inhalte werden dünn oder gleichförmig | Muster in `06`, Prüfskript, je Stufe Stichprobe durch Davide (fünf zufällige Einheiten), Mindestzahl an Formaten je Einheit |
| Falsche oder geschönte Fakten | Beleg-Stufen, Quellenpflicht für Zahlen, Nachrecherche je Stufe |
| Bilder mit Fehlern | Abnahme jedes Bildes, Strichfiguren als Rückfall |
| Mikrofon-Auswertung ungenau | Rückmeldung in Bereichen, Tests mit erzeugten Signalen; der hörbare Vergleich und die Prüfliste tragen auch ohne Messung, die Auswertung ist Zugabe |
| Erinnerungen nerven | Regelwerk, Obergrenze, Aus-Schalter, einmalige Nachfrage statt Dauerfeuer |
| Zu viel auf einmal für den Nutzer | Stufe 1 zeigt nur vier Bildschirme; weitere erscheinen, wenn sie Inhalt haben |
| Start des Tools wird langsamer | alles nachgeladen, Erinnerung über `Spaeter`, Kachel lädt nur `kurzStand` |
| Lernstand geht verloren | Beiseitelegen statt Überschreiben, Versionsfeld, Export |
| Coach verwächst mit dem Tool | Host-Adapter, Importprüfung im Prüfskript |
| Budget reißt | `coach-groesse.mjs` nach jeder Stufe, Kosten vor jedem Auftrag schätzen |
| Inhalte zu Lispeln und Stottern sind fachlich falsch oder verletzend | strenge Schreibregeln und Muster in `06`, Leitlinie als Maßstab, Prüfregeln im Skript, Davide liest diese 12 Einheiten vollständig gegen; Empfehlung fürs spätere Produkt: Durchsicht durch eine Logopädin oder einen Logopäden |
| Laute Übungen passen nicht ins Büro | Schalter „laut üben“, Ersatzübungen, „Später laut“, stumme Mundübungen |
| Aufnahmen der Stimme sind heikel | Speichern nur nach ausdrücklichem Ja, eigene verschlüsselte Ablage, Obergrenze, Löschen mit einem Klick |
| Beruhigungs-Werkzeuge wirken bei jedem anders | Wirkung messen statt behaupten; ehrliche Beleg-Stufen; mehrere Werkzeuge zur Wahl |
