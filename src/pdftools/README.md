# PDF-Werkzeuge (Modul)

Eigenstaendiger, gekapselter Menuepunkt, der Reader- und Pro-Funktionen rund um
PDF in einer aufgeraeumten, Apple-artigen Oberflaeche buendelt. Das Modul hat ein
eigenes Layout und eigene, gescopte Design-Tokens und beeinflusst das uebrige
App-Theme nicht.

## Aufbau

```
src/pdftools/
  index.tsx                 Einstieg + Apple-Layout (Kopfzeile, Tabs, Schnellzugriff, Viewer)
  config.ts                 Feature-Flag (PDF_TOOLS_ENABLED) + Werkzeug-Katalog + Onboarding-Daten
  pdftools.css              gescopte Design-Tokens unter .pdfx (kein Leak in/aus der App)
  pdfjsSetup.ts             PDF.js-Worker-Konfiguration (modul-lokal)
  store/usePdfToolsStore.ts Zustand-Store: Tabs (Speicher) + Personalisierung (localStorage)
  tools/
    io.ts                   Oeffnen/Speichern ueber die Electron-Bruecke api()
    pdfOps.ts               pdf-lib: Merge/Seiten/Wasserzeichen/Felder/Flatten/Bild->PDF ...
    render.ts               PDF.js: Rendern, Text, Suche, Bild-Export
    ocr.ts                  tesseract.js: Texterkennung
  components/
    ui.tsx                  Icon-Registry, Tooltip, Modal, Felder, Service-Hinweis
    PdfViewer.tsx           Viewer (Zoom/Layout/Drehen/Miniaturen/Suche/Klick-Platzierung)
    QuickAccess.tsx         anpassbarer Schnellzugriff (Drag & Drop)
    ToolGroups.tsx          Werkzeug-Palette (aufklappbare Gruppen, Anpinnen)
    ToolHost.tsx            Aktions-Dispatcher (ein Modal je Werkzeug)
    Onboarding.tsx          Erststart-Abfrage (Chips + Rollen-Presets)
    SettingsPanel.tsx       Sichtbarkeit/Reihenfolge, Reset, Onboarding neu, Dark Mode
  README.md
```

## Verwendete Bibliotheken (bereits im Projekt)

- **pdfjs-dist** — Anzeige, Textextraktion, Suche, Miniaturen, Bild-Export
- **pdf-lib** — Manipulation: Zusammenfuehren, Seiten (loeschen/extrahieren/drehen/
  neu anordnen/einfuegen), Wasserzeichen, Kopf-/Fusszeile, Bates, Flatten,
  Formularfelder, Bild->PDF, Re-Komprimieren, Text/Bild/Rechteck platzieren
- **tesseract.js** — OCR (neu hinzugefuegt)
- bestehende **SignaturePad**-Komponente fuer die Unterschrift

## Feature-Flag

`PDF_TOOLS_ENABLED` in `config.ts`. Bei `false` verschwindet der Menuepunkt aus
der Sidebar (und ist damit nicht erreichbar).

## Personalisierung / Persistenz

Favoriten (Schnellzugriff), Sichtbarkeit, eingeklappte Gruppen, Onboarding-Status
und Dark-Mode werden per `localStorage` (Schluessel `pdftools.personalization`)
gespeichert. Die geoeffneten Dokumente (binaer) werden bewusst NICHT persistiert.

## Integrationsstellen (Backend/Dienst)

Diese Funktionen haben eine vollstaendige UI, brauchen fuer den vollen Umfang aber
einen Dienst. Anbindung jeweils im passenden `ToolHost`-Zweig bzw. in `tools/`:

- **Word/Excel/PowerPoint-Export**: Text-basierte Variante ist real umgesetzt
  (`tools/officeExport.ts`, docx/exceljs/pptxgenjs). Fuer originalgetreues Layout
  (Spalten, Bilder, Tabellen) ist ein Konvertierungs-Dienst die Integrationsstelle.
- **PDF/A & Preflight** (Standard-Pruefung/Konvertierung)
- **Passwort/Verschluesselung** (clientseitig nicht sicher umsetzbar)
- **Zertifikatsbasierte Signatur** und **E-Sign-Versand** (Statusverfolgung)
- **Barrierefreiheit** (Auto-Tagging/Pruefung), **Portfolio**
- **Direktes Text-/Bild-Editing** im PDF, **Zuschneiden**, **Mess-Werkzeuge**

### OCR (offline)

Die OCR-Engine (Worker + WASM-Core) wird LOKAL aus `public/tesseract/` geladen —
keine Internet-Abhaengigkeit. Die Sprachdaten werden aus
`public/tesseract/tessdata/` geladen, falls vorhanden; sonst weicht OCR
automatisch auf den offiziellen CDN aus. Fuer vollstaendigen Offline-Betrieb die
Dateien `deu.traineddata.gz` / `eng.traineddata.gz` dort ablegen (siehe
`public/tesseract/tessdata/README.txt`). Die tesseract-Laufzeit liegt unter
`public/` und wird unveraendert (ohne Hashing) in den Build uebernommen.

## Neues Werkzeug ergaenzen

1. Eintrag in `PDF_TOOLS` (config.ts) mit `id`, `group`, `icon`, `tooltip`, `status`.
2. Falls eine echte Operation: Funktion in `tools/pdfOps.ts` (oder render/ocr) ergaenzen.
3. In `ToolHost.tsx` einen `case '<id>'` mit Modal/Logik hinzufuegen
   (oder Sofort-Aktion in `runTool` in `index.tsx`).
4. Icon-Name ggf. in `components/ui.tsx` (ICONS) auf eine lucide-Komponente mappen.
