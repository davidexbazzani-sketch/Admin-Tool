# Brain Trainer – Bauplan für Übungen

Der Brain Trainer ist ein eigenständiger Bereich im Pausenraum des IT Admin Tools. Er hat mit den IT-Funktionen nichts zu tun. Dieses Dokument beschreibt, wie eine Übung gebaut wird.

## Grundsätze

- **Sprache:** Alle Texte für Benutzer auf Deutsch, duzend („Finde die Zahl“). Kommentare im Code auf Deutsch.
- **Eigenständig:** Nichts außerhalb von `src/brain/` importieren, außer `react` und `lucide-react`. Ausnahme ist `BrainTrainer.tsx` (Anmeldung).
- **Klein und schnell:**
  - Aufgaben werden erzeugt, nicht aus großen Dateien gelesen.
  - Keine neuen npm-Pakete.
  - Kein Netzwerk, keine Bilder aus dem Internet.
- **Reproduzierbar:** Zufall kommt nur aus `Rng` (`kern/zufall.ts`), nie aus `Math.random()`. Gleicher Startwert und gleiche Stufe ergeben dieselbe Aufgabe. Im Duell bekommen so beide Spieler dieselben Aufgaben.
- **Farben:** nur die Variablen `--bt-…` aus `brain.css`. Keine Tailwind-Farbklassen, keine `dark:`-Klassen, keine festen Hex-Farben. Tailwind ist nur für Anordnung erlaubt (`flex`, `grid`, `gap-…`), genauso Inline-Styles.
  - Hell und dunkel müssen beide gut aussehen. Hell ist die Klasse `.light` am `<html>`.
  - Eine Familie darf eine eigene CSS-Datei anlegen (`uebungen/<familie>/<familie>.css`, Klassen mit Präfix `bt-<familie>-`) und sie in ihren Komponenten importieren. Ausnahme: Die Karten-Styles der Geographie liegen bei der Karte selbst, in `geo/geo.css`.
- **Größe:** Die Spielfläche ist etwa 1040 × 600 px (Fenster 1280 × 800 abzüglich Seitenleiste und Kopf). Eine Übung muss ohne Scrollen hineinpassen.
- **Ehrlich:** „Was wird trainiert?“ beschreibt die geübte Fähigkeit, keine Heilsversprechen.

## Zwei Arten von Übungen

### A) Fragen mit Auswahl oder Eingabe: `aufgaben/<name>.ts`

Reiner Generator ohne React. Den Ablauf (Zeit, Tasten, Rückmeldung, Erklärung, Sprint/Duell) übernimmt `ablauf/FragenLauf.tsx`.

```ts
import type { FragenGenerator } from '../kern/typen'
export const erzeuge: FragenGenerator = (r, stufe) => ({
  aufgabe: 'Welche Zahl setzt die Reihe fort?',
  zeige: { art: 'folge', teile: ['2', '4', '6', null] },   // optional
  optionen: [T('7'), T('8'), T('9'), T('10')],             // 2–8 Auswahlen
  richtig: 1,                                              // Index der richtigen
  erklaerung: 'Immer +2. Gesucht: 8.',                     // Pflicht
  zeitSek: 40,                                             // Pflicht: Richtzeit je Aufgabe
})
```

- **Stufe 1 (leicht) bis 10 (sehr schwer):** Die Schwierigkeit muss spürbar und gleichmäßig steigen. Im Dateikopf steht, was sich je Stufe ändert.
- **Genau eine richtige Antwort.** Mehrdeutige Aufgaben verwerfen und neu erzeugen. Falsche Antworten sollen plausibel sein, aber eindeutig falsch.
- **Darstellungen** (`Darstellung` in `kern/typen.ts`): `text`, `szene` (SVG-Figur im Raum 0..100, siehe `Form`), `matrix`, `folge`, `schritte`. Gezeichnet werden sie von `figuren/Zeige.tsx`.
- **Eingabe statt Auswahl:** `eingabe: 'zahl' | 'wort'`, `optionen: []`, `richtig: -1`, `loesungen: ['42']`.
- **Merkphase:** `vorab: { zeige, sek }` zeigt etwas an und blendet es vor der Frage aus.
- **Helfer** in `aufgaben/hilfen.ts`: `mischeAuswahl`, `zahlAuswahl`, `textAuswahl`, `zahlText`.
- **Vorlagen:** `aufgaben/zahlenreihen.ts` (Zahlen), `aufgaben/matrizen.ts` (Figuren).

### B) Freie Übung mit eigener Oberfläche: `uebungen/<familie>/<Name>.tsx`

```tsx
import type { FreiProps } from '../../kern/typen'
export function Komponente({ stufe, start, modus, dauerSek, onPunkte, onFertig }: FreiProps) { … }
```

- **Vorlage:** `uebungen/tempo/Schulte.tsx`.
- **Start und Ende:**
  - Die Übung startet sofort beim Einhängen. Vorstellung, 3-2-1 und Ergebnisanzeige macht der Rahmen `ablauf/UebungSpielen.tsx`.
  - `onFertig(Rohergebnis)` wird genau einmal gerufen.
- **Wurzel-Element:** `<div className="bt-lauf" data-bt-frei="<id>">`.
- **Kopfzeile:** immer `KopfZeile` aus `ablauf/kit.tsx`.
  - links: Fortschritt oder Restzeit
  - Mitte: `Balken`
  - rechts: Punkte oder Zeit
- **Bausteine:**
  - aus `ablauf/kit.tsx`: `useUhr`, `useStoppuhr`, `useTasten`, `KopfZeile`, `Balken`, `Taste`, `median`
  - CSS-Klassen: `bt-feld` (klickbares Feld; Zustände `data-an`, `data-gut`, `data-schlecht`, `data-matt`), `bt-reiz` (großer Reiz in der Mitte), `bt-antwortleiste`, `bt-knopf`, `bt-chip`, `bt-aufgabe`, `bt-blitz-gut`, `bt-blitz-schlecht`, `bt-ruettel`
- **Stufen 1–10:** im Dateikopf beschreiben. Die Logik (Aufgaben erzeugen, lösen, prüfen) steht als reine, exportierte Funktionen in derselben Datei oder in `<Name>.logik.ts`, damit sie ohne Oberfläche testbar ist.
- **Training:** Ein Durchgang dauert 1–3 Minuten. Große Rätsel dürfen länger dauern und bekommen im Katalog `lang: true`.
- **Duell** (`modus === 'duell'`), nur wenn die Übung dafür taugt:
  - Läuft genau `dauerSek` Sekunden.
  - Die Aufgaben kommen aus `rng(start)`, sind also für beide Spieler gleich.
  - Der laufende Stand geht über `onPunkte(punkte)` nach außen.
  - Am Ende steht `duellPunkte` im Rohergebnis.
- **Rohergebnis:**
  - `leistung` 0..1 ist die Güte des Durchgangs, gebildet mit `guete(anteilRichtig, tempo)` und `tempoAus(ms, gut, langsam)` aus `kern/wertung.ts`.
  - Ab 0,8 steigt die Stufe, unter 0,55 sinkt sie. Die Richtwerte so wählen, dass ein geübter Mensch auf der passenden Stufe etwa 0,7–0,85 erreicht.
  - `text` ist eine Zeile fürs Ergebnis, z. B. „Spanne 7“.
- **Bedienung:** Maus und, wo es passt, Tasten. Der Tastenhinweis steht sichtbar in der Übung.
- **Aufräumen:** Zeitgeber und Listener beim Aushängen entfernen. Nach `onFertig` nichts mehr tun.

## Katalog

Jede Übung bekommt einen Eintrag in `kern/katalog.ts` (`id`, `name`, `gebiet`, `kurz`, `trainiert`, `bedienung`, `dauer`, `duell?`, `lang?`, `lade`). Das Modul wird erst beim Öffnen geladen.

## Tests (gitignored unter `.tmp-test/brain/`)

**Generatoren:** `npx tsx .tmp-test/brain/gen_test.ts`. Neue Generatoren in `generatoren.ts` eintragen oder im eigenen Familien-Test `pruefeGenerator(name, erzeuge)` aus `pruefung.ts` rufen.
- Geprüft wird: genau eine richtige Antwort, keine doppelten Auswahlen, reproduzierbar, Erklärung und Zeit vorhanden, Abwechslung.

**Logik freier Übungen:** eigener Test `.tmp-test/brain/<familie>_test.ts` mit `npx tsx`, z. B. Sudoku eindeutig lösbar.

**Oberfläche:** headless Electron gegen den laufenden Vite-Server auf Port 5199.
- In der Shell muss `ELECTRON_RUN_AS_NODE` entfernt sein.
- Die Bilder landen im Scratchpad unter `brain/`.
- Eine Übung direkt, ohne Katalog-Eintrag:
  ```
  npx electron .tmp-test/brain/ui_main.cjs "szene=direkt&modul=uebungen/tempo/Schulte.tsx&stufe=5"
  npx electron .tmp-test/brain/ui_main.cjs "szene=direkt&modul=uebungen/tempo/Schulte.tsx&stufe=5&modus=duell&dauer=20&hell=1"
  npx electron .tmp-test/brain/ui_main.cjs "szene=direktFragen&modul=aufgaben/zahlenreihen.ts&stufe=7&anzahl=4"
  ```
- Eigene Szenen (klicken, Tasten, Prüfpunkte) kommen in `.tmp-test/brain/szenen_<familie>.tsx`. Die Helfer stehen in `szenen.tsx`.
