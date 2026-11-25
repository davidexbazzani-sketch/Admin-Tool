# Der Coach – Abnahme Stufen 2 bis 5 (26.11.2026)

Für Davide. Der Coach bleibt nur für dich sichtbar (Pausenraum → oberste Kachel „Der Coach“).

## Was dazugekommen ist

**Echtes Leben (Stufe 2)**
- **Missionen**: eigener Menüpunkt mit vier Reitern – Vorgenommen, Leitern (je Bereich), eigene Angst-Leitern, 20 Mutproben
  (nur wenn eingeschaltet), Beweisliste „befürchtet vs. passiert“.
- **Kompass**: sieben Stationen (Lebensrad, Werte, Spuren, bestmögliches Selbst, drei Leben, Reue-Test, Ziel-Pyramide),
  Ziele mit Wochen-Check und Rückblick nach drei Monaten – auch für Menschen, die noch keine Ziele haben.
- **Vorhaben**: 16 Kategorien mit 152 Ideen; Erinnerungskarte im Tool mit drei Schärfen bis „Arschtritt“, Obergrenze je Tag,
  Ruhezeiten, zwei Stunden Abstand; nach dreimal Wegklicken fragt sie einmal „leiser, kleiner, pausieren?“.
  Sprache führt auf Wunsch direkt zu Parla Italiano.
- **Notfallkoffer**: Startroutine zum Zusammenstellen, Ernstfall-Fahrplan (Termin mit Uhrzeit → Etappen von „Woche davor“
  bis „Danach“ → Nachbereitung), Brunos Stimme für 8 geführte Übungen.
- **Ecke**: vier Schätze, Beweisbilanz, „Was bei dir wirkt“, Durchhänger-Hinweis, „Das stimmt so nicht“ (eine Woche gezieltes
  Nachprüfen), Sprechbild.
- **Planer**: Ernstfall in 7 Tagen → `ruhe` zuerst; Vortag und Tag → kein neuer Stoff („Sicher bleiben“).

**Können und Meisterschaft (Stufen 3 und 5)** – in allen 14 Bereichen geschrieben, unabhängig gegengelesen, eingearbeitet:
- zusammen jetzt **270 Einheiten, 219 Lagen, 3.884 Übungen, 170 Missionen, 17 Kurse**, je Bereich 59 Lerntage
  (Schwerpunkte 15) – **871 Lerntage**; danach Meisterklasse (jedes dritte Training eine Lage erneut).
- Gegenlese-Berichte: `gegenlesen/<bereich>-km.md` (je mit Abschnitt „Umsetzung“). Rund 1.000 Befunde eingearbeitet.
- Schlussdurchgänge: Figuren über alle Bereiche (`figuren.md`, 119 Stellen), Nutzer ohne festgelegtes Geschlecht/Familienstand
  (über 110 Stellen), Längenausgleich gegen Erraten (über 150 Antworten).

**Stimme, Bild, Ton (Stufe 4)**
- **Sprechbild**: Startaufnahme eines Lesetexts, Vergleich später: Tempo, Pausen, Satzende, Melodie, Lautstärke –
  nur gegen die eigene Startaufnahme. Bei Stottern ohne Tempo und Pausen.
- **Szenenbilder**: 24 Szenen (Menschen lesen, Smalltalk) + 3 Publikumsbilder für die Bühne – jedes Bild gegen den Text geprüft.
- **Brunos Stimme**: „Gideon“ (tiefste der vier Proben); 18 Aufnahmen, jede per Spracherkennung gegengehört.
  **Betonungs-Hörbeispiele habe ich verworfen**: Die Sprachausgabe betont messbar nicht verlässlich.

**Feinschliff (Stufe 5)**: Suche über alle Wissens-Seiten (Halle), Meisterklasse, Barrierefreiheit (Fokus-Rahmen,
weniger Bewegung, beschriftete Symbol-Knöpfe), `src/coach/LIESMICH.md` vollständig.

## Geprüft

| Prüfung | Ergebnis |
|---|---|
| Inhalte (`node scripts/coach-pruefe.mjs`) | 0 Fehler, 31 Hinweise (gewollt: Antworten ohne halben Punkt) |
| Logik inkl. Nachstellung über 1.000 Tage | 109 / 109; Lernstand ≤ 111 KB (Grenze 150), Planung ≤ 23 ms |
| Aufnahme-Auswertung (künstliche Signale) | 14 / 14; 30 s Aufnahme in ≈ 0,24 s |
| Verschlüsselte Ablagen im Hauptprozess | 29 / 29 |
| Oberfläche (20 Szenen, u. a. Kompass, Vorhaben, Fahrplan, Vorhaben-Erinnerung, Sprechbild mit echtem Rekorder) | alle grün |
| Echtes Setup (`app.asar`) | 12 / 12 – vor dem Klick auf die Kachel nichts geladen, nach dem Verlassen nichts mehr |
| Typecheck | keine Meldung im Coach (übriges Tool unverändert 90) |
| Größe | Setup 246.904.865 Bytes (+2,5 MB zu Stufe 1, +4,1 MB zum Stand vor dem Coach); Coach ausgepackt 10,05 MB (Richtwert 15) |
| Higgsfield | 58,02 von 120 Credits (Bilder 35,25, Ton 22,77) |

## Bitte selbst ansehen

1. **Flirten** (Phasen Können/Meisterschaft) – heikelster Bereich, besonders `flirten-l-15` und Einheit 3-03 (Einverständnis, § 177).
2. **Antrieb 3-03** „Wenn der Akku leer bleibt“ (Erschöpfung, Hilfe-Hinweis).
3. **Brunos Stimme** im Notfallkoffer („Bruno führt dich durch“) – gefällt sie dir? Tausch ist billig.
4. **Kompass** Station 1–2 und **Vorhaben** mit einer Erinnerung (Schärfe „Arschtritt“).
5. Fünf zufällige Einheiten aus Können/Meisterschaft.

## Offen / zur Entscheidung

- Restliste in `gegenlesen/NACHARBEIT.md` (vor einer Freigabe für alle): u. a. einige Quellen am Volltext prüfen
  (`krause2002`, `hall2005`, `newman1997`, `kumar2018`), Kompass-Karten mit Quellenfeld.
- Freigabe für alle: zwei Sperren (`FREIGEGEBEN = false` in `src/coach/host/adminTool.ts`, `masterAdminOnly` im Menü).
- Hinweis außerhalb des Coach: Der Ordner `--ids/` (vier PowerShell-Skripte vom 16.11.) landet mit im Setup; Vorschlag:
  `"!--ids/**"` in `build.files` – nicht geändert, deine Entscheidung.
