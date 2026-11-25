# Der Coach – Abnahme Stufe 1 (25.11.2026)

Für Davide. Der Coach ist nur für dich sichtbar (Pausenraum → oberste Kachel „Der Coach“).

## Was drin ist

- **14 Bereiche + 3 Schwerpunkte** (Nuscheln, Lispeln, Stottern), Phase Grundlagen: 116 Einheiten, rund 1.580 Übungen,
  79 Lagen (verzweigte Gespräche), 170 Aufgaben fürs echte Leben, 17 × 24 bzw. 12 Testaufgaben, je Bereich eine
  Wissens-Seite mit Hebeln, Taktiken (fair · Taktik · rote Linie), Fehlern, Mythen, „Was dahinter steckt“, Büchern,
  Umfeldern und Spickzetteln. Rund 320 Lerntage.
- Jeder Bereich: geschrieben → unabhängig gegengelesen (Berichte in `gegenlesen/<bereich>.md`) → Restpunkte in
  `gegenlesen/NACHARBEIT.md`. Über 250 Korrekturen aus dem Gegenlesen sind eingearbeitet.
- Bruno (Entwurf 1) mit 10 Haltungen und 6 Raumbildern; Notfallkoffer mit 13 Werkzeugen, 8 „Gleich geht's los“-Karten
  und Hilfe-Hinweisen (seelische Belastung, Belästigung/Gewalt, Mobbing).
- Technik: alles nachgeladen, verschlüsselt lokal, Export/Import, Staffel, Zähler, stille Übungen, laut/leise,
  ohne Zeitdruck.

## Geprüft

| Prüfung | Ergebnis |
|---|---|
| Inhalte (`node scripts/coach-pruefe.mjs`) | 0 Fehler, 32 Hinweise (gewollt: Antworten ohne halben Punkt) |
| Kernlogik inkl. Nachstellung über 1.000 Tage | 72 / 72; Lernstand ≤ 60 KB, Planung ≤ 12 ms |
| Verschlüsselte Ablagen im Hauptprozess | 29 / 29 |
| Oberfläche (19 Szenen hell/dunkel, drei Schwerpunkte über drei Tage) | alle grün |
| Echtes Setup (`app.asar`) | 12 / 12 – vor dem Klick auf die Kachel nichts geladen, nach dem Verlassen nichts mehr |
| Typecheck | keine neuen Meldungen (90 wie vorher), Electron ok |
| Größe | Setup 244.375.448 Bytes (+1,48 MB); Coach ausgepackt 4,13 MB (Grenze 20 MB) |
| Higgsfield | 15 von 100 Credits |

## Bitte selbst ansehen

1. **Einstieg** einmal durchklicken, ein Training machen, die **Halle** und zwei **Bereichsseiten** öffnen.
2. **Stottern** – alle sechs Einheiten (Leseliste in `gegenlesen/stottern.md`).
3. **Lispeln** – alle sechs Einheiten (Leseliste in `gegenlesen/nuscheln-lispeln.md`).
4. **Flirten** – vor allem die Einheit „Der Ort entscheidet“ und die Lage im Kochkurs.
5. Fünf zufällige Einheiten und zwei Wissens-Seiten deiner Wahl.

## Fragen an dich

1. ~~Stottern, Lage `s-l-01`~~ – entschieden (Davide, 25.11.2026): bleibt 0 Punkte; Rückmeldung beginnt verständnisvoll.
2. ~~Stegreif, Missions-Sprossen~~ – entschieden (25.11.2026): Die Sprossen folgen jetzt der Reihenfolge der Einheiten.
3. ~~Selbstbewusstsein, Beleg-Stufe~~ – entschieden (25.11.2026): bleibt B, im Text als Modell gekennzeichnet.

## Bis zur Freigabe für alle

`gegenlesen/NACHARBEIT.md` abarbeiten (noch offen: einige Quellen am Volltext, kleinere Formulierungen), danach
`FREIGEGEBEN = true` in `src/coach/host/adminTool.ts` und `masterAdminOnly` in `src/utils/menuCatalog.ts` entfernen,
Einleitungssatz im Pausenraum ergänzen.
