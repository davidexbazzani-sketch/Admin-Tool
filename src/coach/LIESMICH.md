# Der Coach – technische Übersicht

Raum im Pausenraum des IT Admin Tools: Trainingscamp für Wirkung, Mut und Antrieb mit 14 Bereichen, der Figur
Bruno, täglichen Lernpaketen und Aufgaben fürs echte Leben. Konzept und Plan: `derCoach/` und
`C:\Users\User\.claude\plans\elegant-conjuring-catmull.md`. Inhalte schreiben: `inhalt/LIESMICH.md`.

**Sichtbar bis zur Freigabe nur für Davide** (`host/adminTool.ts`: `FREIGEGEBEN = false`, dazu
`masterAdminOnly` im Menü-Katalog). Zur Freigabe fallen beide Sperren.

## Grundsätze

- **Herauslösbar:** Nur `host/adminTool.ts` importiert von außerhalb des Ordners. Alles andere spricht über
  `host/host.ts` (Schnittstelle `CoachHost`) mit dem Tool. `kern/` importiert nie aus `host/` (Ausnahme
  `kern/speicher.ts` für die Ablagen). Erlaubte Pakete: react, react-dom, lucide-react, zustand. Das prüft
  `scripts/coach-pruefe.mjs`.
- **Macht das Tool nicht langsamer:** Raum, Kachel-Stand (`kurzStand.ts`) und Erinnerung werden nachgeladen;
  jede Inhaltsdatei ist ein eigenes Teilpaket. Vor dem Öffnen der Kachel ist nichts vom Coach geladen –
  `scripts/coach-groesse.mjs` bricht ab, wenn ein Coach-Modul ins Hauptpaket rutscht.
- **Privat:** Alles liegt lokal und verschlüsselt (DPAPI) in drei Ablagen: `coach` (Lernstand, `.dc`),
  `coachBuch` (alles Geschriebene, `.dcb`), `coachTon` (höchstens acht Aufnahmen, `.dct`) –
  `electron/brainSpeicher.ts`. An PC und Windows-Konto gebunden → Export/Import in den Einstellungen.
  Kachel und Erinnerung nennen nie Bereiche oder Titel; im Diskret-Modus nur einen allgemeinen Satz.
- **Kennungen sind eingefroren**, sobald ausgeliefert (Lernstand hängt daran). Reihenfolge nur im Kursplan.
- **Deterministisch:** Planer und Auswahl nutzen nur Zufall mit Startwert (`kern/zufall.ts`); die Uhr nur über
  `kern/zeit.ts` (im Test stellbar).

## Ordner

| Ordner/Datei | Inhalt |
|---|---|
| `DerCoach.tsx` | Wurzel des Raums: setzt den Host, lädt Verzeichnis und Lernstand, Navigation |
| `kurzStand.ts` | Mini-Stand für die Kachel im Pausenraum (ohne Inhalte) |
| `Erinnerung.tsx`, `erinnerung.css` | tägliche Karte unten rechts; wartet, solange eine andere Raum-Karte sichtbar ist |
| `farben.css`, `coach.css` | Farbwelt (`--dc-…`, hell und dunkel) und Formen (`dc-…`). Keine Tailwind-`dark:`-Klassen |
| `host/` | `host.ts` Schnittstelle · `aktiv.ts` aktueller Host mit stillem Ersatz · `adminTool.ts` Anbindung ans Tool |
| `kern/inhaltTypen.ts` | Typen aller Inhalte (Bereiche, Schritt-Arten, Einheit, Lage, Kursplan, Wissen, Mission, Tests) |
| `kern/typen.ts` | Lernstand (`CoachDaten`), Buch, Ton, Tagesplan |
| `kern/inhalt.ts` | Nachladen per `import.meta.glob`; `ladeFuer` holt vor einem Training alles auf einmal |
| `kern/index.ts` | Typ des Verzeichnisses `inhalt/_index.json` (erzeugt von `scripts/coach-index.mjs`) |
| `kern/kurs.ts` | Kurse, nächster Lerntag, Fortschritt, Staffel (3/4/6 aktive Bereiche je 10/15/30 Minuten) |
| `kern/gehirn/` | `schaetzung` (Fähigkeit je Wissen/Können/Tun), `wiederholung` (Karteikasten 1/3/7/16/35 Tage), `planer` (Tagesplan) |
| `kern/buchung.ts` | Antworten, Lerntage, Pakete, Missionen verbuchen (reine Funktionen) |
| `kern/serie.ts` | Serie mit einer rettbaren Lücke, Wochenziel, Antrieb |
| `kern/uebergang.ts` | Prüfen und Überführen älterer Stände (`ok · ueberfuehrt · neuer · fremd · kaputt`) |
| `kern/speicher.ts` | zustand-Store: laden, ändern, sichern (erst Buch, dann Stand), Export/Import/Löschen |
| `kern/ki.ts` | vorbereiteter Platz für eine spätere Bewertung freier Antworten (heute offline) |
| `ansicht/` | Hilfen (Name einsetzen, Beleg-Chip, Bruno, Quellen), Symbole |
| `uebungen/` | ein Baustein je Format-Familie; `Schritt.tsx` verteilt |
| `ablauf/` | Lernpaket (`Paket.tsx`), Einheit, Merkkarte, Tests, Anwendung, Mission |
| `bereiche/` | Einstieg, Heute, Halle, Bereichsseite (5 Reiter), Reise, Ecke, Notfallkoffer, Einstellungen |
| `ton/aufnahme.ts` | Aufnehmen (MediaRecorder, 16 kbit/s, höchstens 30 s) und Abspielen über Web Audio (die CSP sperrt Blob-Ton) |
| `inhalt/` | alle Inhalte als JSON, je Bereich ein Ordner |

## Ablauf eines Trainings

1. `DerCoach` lädt `_index.json` und den Lernstand; `pflegeStaffel` hält die aktiven Bereiche aktuell.
2. `planeTag` (rein, deterministisch) baut aus Stand, Verzeichnis, Tag und Dauer die Blöcke
   (Aufwärmen/Einstufung, Lerntag, Festigen, Üben, Tiefe, Rundencheck, Transfer). Der Plan wird mit Signatur in
   `daten.heute` festgehalten; neu geplant wird nur, solange das Training nicht begonnen hat.
3. `ladeFuer` holt alle nötigen Teilpakete; `Paket.tsx` spielt die Blöcke ab und verbucht jede Antwort.
4. Am Blockende `schliesseLerntag`/`merkeVerlauf`, am Ende `schliessePaket`; gesichert wird entprellt,
   am Blockende und beim Verlassen.

## Prüfen

```
node scripts/coach-index.mjs            Verzeichnis neu erzeugen (nach jeder Inhaltsänderung)
node scripts/coach-pruefe.mjs           Inhalte, Kennungen, Kurspläne, Grenze zum Tool (--nur <bereich>, --soll <bereich>)
node scripts/coach-groesse.mjs          Größe der Coach-Teilpakete, nichts im Hauptpaket, Credits
```

Tests (nicht im Repository) unter `.tmp-test/coach/`: `kern_test.ts` (Logik, Nachstellung über 1.000 Tage),
`main_test.cjs` (echte Ablagen im Hauptprozess), `ui.tsx` + `ui_main.cjs` (Szenen hell/dunkel im unsichtbaren
Electron gegen Vite auf Port 5199; `ELECTRON_RUN_AS_NODE` vorher entfernen).

## Bilder und Ton

`public/coach/bilder/` und `public/coach/ton/` (nicht im Repository; Vite kopiert sie nach `dist/`). Bis ein Bild da
ist, zeigt `Bruno` eine gezeichnete Figur. Higgsfield-Credits: Rahmen 100 + 20 Reserve, Buchführung in
`derCoach/credits.json`. Bruno = Entwurf 1 (Wahl Davides, 25.11.2026). Rohbilder (PNG) und Entwürfe liegen in `.tmp-test/coach/bilder-roh/` (gitignored); umwandeln mit `npx electron scripts/coach-bilder.cjs .tmp-test/coach/bilder-roh public/coach/bilder`. Im Code: `<Bruno haltung="…">` (10 Haltungen) und `<Raumbild name="…">` in `ansicht/hilfen.tsx`.
