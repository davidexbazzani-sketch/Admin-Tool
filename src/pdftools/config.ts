// ── PDF-Werkzeuge: Feature-Flag + Werkzeug-Katalog ───────────────────────────
// Dieser Katalog ist die EINZIGE Quelle der Wahrheit fuer die Werkzeuge der
// Oberflaeche: Schnellzugriff, Gruppen-Panel, Onboarding und Einstellungen
// lesen alles hier heraus. Neue Werkzeuge nur hier ergaenzen.

// Feature-Flag: Modul komplett ein-/ausschaltbar (Build-Schalter).
export const PDF_TOOLS_ENABLED = true

// Werkzeug-Gruppen in logischer Reihenfolge (einfach -> fortgeschritten).
export type PdfGroupId =
  | 'view' | 'comment' | 'fillsign' | 'edit' | 'create' | 'forms' | 'protect' | 'advanced'

export interface PdfGroup {
  id: PdfGroupId
  title: string        // Anzeige (Deutsch)
  hint: string         // kurze Gruppen-Beschreibung
  pro?: boolean        // Gruppe enthaelt ueberwiegend Pro-Funktionen
}

export const PDF_GROUPS: PdfGroup[] = [
  { id: 'view',     title: 'Ansehen & Lesen',        hint: 'Oeffnen, blättern, zoomen, suchen' },
  { id: 'comment',  title: 'Kommentieren & Markieren', hint: 'Notizen, Hervorheben, Zeichnen' },
  { id: 'fillsign', title: 'Ausfüllen & Unterschreiben', hint: 'Formulare, Unterschrift, Datum' },
  { id: 'edit',     title: 'Bearbeiten & Organisieren', hint: 'Seiten und Inhalte bearbeiten', pro: true },
  { id: 'create',   title: 'Erstellen & Umwandeln',  hint: 'PDF erzeugen, exportieren, OCR', pro: true },
  { id: 'forms',    title: 'Formulare',              hint: 'Felder anlegen und auswerten', pro: true },
  { id: 'protect',  title: 'Schützen & Signieren', hint: 'Passwort, Schwärzen, Signatur', pro: true },
  { id: 'advanced', title: 'Erweitert & Automatisieren', hint: 'Vergleich, Stapel, Messen', pro: true },
]

// 'ready'   = clientseitig real umgesetzt
// 'partial' = real, aber vereinfacht (Hinweis in der UI)
// 'service' = UI vorhanden, benoetigt spaeter einen Dienst/Backend
export type ToolStatus = 'ready' | 'partial' | 'service'

export interface PdfTool {
  id: string
  label: string          // Deutsch, knapp
  tooltip: string        // Alltagssprache: was macht das?
  group: PdfGroupId
  icon: string           // lucide-react Icon-Name (siehe iconRegistry)
  pro?: boolean
  status: ToolStatus
  defaultFavorite?: boolean
  destructive?: boolean  // rot einfärben (z.B. Schwärzen, Loeschen)
}

export const PDF_TOOLS: PdfTool[] = [
  // 1. Ansehen & Lesen
  { id: 'open',        group: 'view', icon: 'FolderOpen', status: 'ready', defaultFavorite: true, label: 'PDF öffnen',      tooltip: 'Eine PDF-Datei vom Computer öffnen — oder einfach hierher ziehen.' },
  { id: 'recent',      group: 'view', icon: 'Clock',      status: 'ready',                        label: 'Zuletzt geöffnet', tooltip: 'Zeigt die zuletzt geöffneten Dokumente zum schnellen Wiederöffnen.' },
  { id: 'layout',      group: 'view', icon: 'LayoutGrid', status: 'ready',                        label: 'Seitenlayout',     tooltip: 'Einzelseite, fortlaufend oder Doppelseite anzeigen.' },
  { id: 'zoom',        group: 'view', icon: 'ZoomIn',     status: 'ready', defaultFavorite: true, label: 'Zoom',             tooltip: 'Größer/kleiner zoomen oder an die Seitenbreite anpassen.' },
  { id: 'rotateView',  group: 'view', icon: 'RotateCw',   status: 'ready',                        label: 'Ansicht drehen',   tooltip: 'Dreht nur die Ansicht — ändert die Datei nicht.' },
  { id: 'thumbnails',  group: 'view', icon: 'GalleryVerticalEnd', status: 'ready',                label: 'Miniaturen',       tooltip: 'Alle Seiten als kleine Vorschaubilder zum schnellen Springen.' },
  { id: 'search',      group: 'view', icon: 'Search',     status: 'ready', defaultFavorite: true, label: 'Suchen',           tooltip: 'Findet Wörter im Dokument und zeigt alle Treffer.' },
  { id: 'selectCopy',  group: 'view', icon: 'TextCursorInput', status: 'ready',                   label: 'Text kopieren',    tooltip: 'Text markieren und in die Zwischenablage kopieren.' },
  { id: 'readAloud',   group: 'view', icon: 'Volume2',    status: 'partial',                      label: 'Vorlesen',         tooltip: 'Liest den Seitentext laut vor (Barrierefreiheit).' },
  { id: 'print',       group: 'view', icon: 'Printer',    status: 'ready',                        label: 'Drucken',          tooltip: 'Dokument an den Drucker senden.' },
  { id: 'share',       group: 'view', icon: 'Mail',       status: 'ready',                        label: 'Per E-Mail senden', tooltip: 'Aktuelle PDF als Anhang per E-Mail verschicken.' },

  // 2. Kommentieren & Markieren
  { id: 'note',        group: 'comment', icon: 'StickyNote',  status: 'ready', defaultFavorite: true, label: 'Notiz',         tooltip: 'Eine gelbe Haftnotiz an eine Stelle setzen.' },
  { id: 'highlight',   group: 'comment', icon: 'Highlighter', status: 'ready', defaultFavorite: true, label: 'Hervorheben',   tooltip: 'Text farbig markieren.' },
  { id: 'underline',   group: 'comment', icon: 'Underline',   status: 'ready',                        label: 'Unterstreichen', tooltip: 'Text unterstreichen.' },
  { id: 'strike',      group: 'comment', icon: 'Strikethrough', status: 'ready',                      label: 'Durchstreichen', tooltip: 'Text durchstreichen.' },
  { id: 'draw',        group: 'comment', icon: 'PenTool',     status: 'ready',                        label: 'Zeichnen',      tooltip: 'Frei mit dem Stift auf der Seite zeichnen.' },
  { id: 'shapes',      group: 'comment', icon: 'Square',      status: 'ready',                        label: 'Formen',        tooltip: 'Rechtecke, Kreise und Linien einfügen.' },
  { id: 'textbox',     group: 'comment', icon: 'Type',        status: 'ready',                        label: 'Textfeld',      tooltip: 'Freien Text irgendwo auf die Seite schreiben.' },
  { id: 'callout',     group: 'comment', icon: 'MessageSquareMore', status: 'ready',                  label: 'Sprechblase',   tooltip: 'Eine Sprechblase mit Pfeil als Hinweis setzen.' },
  { id: 'stamp',       group: 'comment', icon: 'Stamp',       status: 'ready',                        label: 'Stempel',       tooltip: 'Stempel wie „Genehmigt“ oder ein Häkchen setzen.' },
  { id: 'comments',    group: 'comment', icon: 'MessagesSquare', status: 'partial',                   label: 'Kommentare verwalten', tooltip: 'Alle Kommentare auflisten, filtern und beantworten.' },

  // 3. Ausfuellen & Unterschreiben
  { id: 'fillForm',    group: 'fillsign', icon: 'FormInput', status: 'ready', defaultFavorite: true, label: 'Formular ausfüllen', tooltip: 'In vorhandene Formularfelder schreiben.' },
  { id: 'sign',        group: 'fillsign', icon: 'Signature', status: 'ready', defaultFavorite: true, label: 'Unterschreiben', tooltip: 'Eigene Unterschrift anlegen, speichern und platzieren.' },
  { id: 'addText',     group: 'fillsign', icon: 'Pen',       status: 'ready',                        label: 'Text/Datum setzen', tooltip: 'Text, Datum oder ein Häkchen frei platzieren.' },

  // 4. Bearbeiten & Organisieren (Pro)
  { id: 'editContent', group: 'edit', icon: 'PencilRuler', pro: true, status: 'partial', label: 'Text & Bild bearbeiten', tooltip: 'Vorhandenen Text und Bilder direkt im PDF ändern.' },
  { id: 'organize',    group: 'edit', icon: 'LayoutList',  pro: true, status: 'ready', defaultFavorite: true, label: 'Seiten organisieren', tooltip: 'Seiten neu anordnen, drehen, löschen — per Ziehen.' },
  { id: 'insertPages', group: 'edit', icon: 'FilePlus2',   pro: true, status: 'ready', label: 'Seiten einfügen', tooltip: 'Leere Seiten oder Seiten aus anderen PDFs einfügen.' },
  { id: 'deletePages', group: 'edit', icon: 'FileMinus2',  pro: true, status: 'ready', label: 'Seiten löschen', tooltip: 'Ausgewählte Seiten entfernen.', destructive: true },
  { id: 'extractPages',group: 'edit', icon: 'FileOutput',  pro: true, status: 'ready', label: 'Seiten extrahieren', tooltip: 'Ausgewählte Seiten als neue PDF speichern.' },
  { id: 'splitPdf',    group: 'edit', icon: 'SplitSquareHorizontal', pro: true, status: 'ready', label: 'PDF teilen', tooltip: 'Ein PDF in mehrere Dateien aufteilen.' },
  { id: 'mergePdf',    group: 'edit', icon: 'Combine',     pro: true, status: 'ready', defaultFavorite: true, label: 'Zusammenführen', tooltip: 'Mehrere PDFs zu einer Datei verbinden.' },
  { id: 'cropPages',   group: 'edit', icon: 'Crop',        pro: true, status: 'partial', label: 'Zuschneiden', tooltip: 'Seitenränder beschneiden.' },
  { id: 'watermark',   group: 'edit', icon: 'Droplets',    pro: true, status: 'ready', label: 'Wasserzeichen', tooltip: 'Text wie „Vertraulich“ über alle Seiten legen.' },
  { id: 'headerFooter',group: 'edit', icon: 'PanelTop',    pro: true, status: 'ready', label: 'Kopf-/Fußzeile', tooltip: 'Seitenzahlen oder Text oben/unten einfügen.' },
  { id: 'bates',       group: 'edit', icon: 'Hash',        pro: true, status: 'ready', label: 'Bates-Nummerierung', tooltip: 'Fortlaufende Nummern auf jede Seite (z.B. für Akten).' },
  { id: 'flatten',     group: 'edit', icon: 'Layers',      pro: true, status: 'ready', label: 'Fixieren (Flatten)', tooltip: 'Anmerkungen und Felder fest ins PDF einbrennen.' },

  // 5. Erstellen & Umwandeln (Pro)
  { id: 'createPdf',   group: 'create', icon: 'FilePlus',  pro: true, status: 'partial', label: 'PDF erstellen', tooltip: 'Neues PDF aus Datei, Bild, Zwischenablage oder leer.' },
  { id: 'exportImage', group: 'create', icon: 'FileImage', pro: true, status: 'ready', label: 'Als Bild exportieren', tooltip: 'Seiten als JPG/PNG speichern.' },
  { id: 'exportText',  group: 'create', icon: 'FileType',  pro: true, status: 'ready', label: 'Als Text exportieren', tooltip: 'Den Textinhalt als .txt speichern.' },
  { id: 'exportOffice',group: 'create', icon: 'FileOutput', pro: true, status: 'partial', label: 'Word/Excel/PPT', tooltip: 'Textinhalt nach Word, Excel oder PowerPoint exportieren.' },
  { id: 'ocr',         group: 'create', icon: 'ScanText',  pro: true, status: 'ready', label: 'Texterkennung (OCR)', tooltip: 'Macht gescannte Seiten durchsuchbar (erkennt Text im Bild).' },
  { id: 'compress',    group: 'create', icon: 'Minimize2', pro: true, status: 'partial', label: 'Verkleinern', tooltip: 'Dateigröße reduzieren.' },
  { id: 'preflight',   group: 'create', icon: 'BadgeCheck', pro: true, status: 'service', label: 'PDF/A & Preflight', tooltip: 'Auf Standards prüfen/konvertieren (benötigt Dienst).' },

  // 6. Formulare (Pro)
  { id: 'detectFields',group: 'forms', icon: 'ScanLine',   pro: true, status: 'partial', label: 'Felder erkennen', tooltip: 'Sucht automatisch nach Formularfeldern.' },
  { id: 'addFields',   group: 'forms', icon: 'TextCursorInput', pro: true, status: 'ready', label: 'Felder anlegen', tooltip: 'Textfeld, Häkchen, Auswahl, Button usw. einfügen.' },
  { id: 'formData',    group: 'forms', icon: 'Table',      pro: true, status: 'ready', label: 'Daten ex-/importieren', tooltip: 'Formulardaten als Datei sichern oder laden.' },
  { id: 'formCalc',    group: 'forms', icon: 'Calculator', pro: true, status: 'service', label: 'Berechnungen', tooltip: 'Felder berechnen/validieren (benötigt Skript-Dienst).' },

  // 7. Schuetzen & Signieren (Pro)
  { id: 'password',    group: 'protect', icon: 'Lock',     pro: true, status: 'service', label: 'Passwort & Rechte', tooltip: 'PDF mit Passwort schützen und Rechte vergeben (benötigt Dienst).' },
  { id: 'redact',      group: 'protect', icon: 'EraserOff', pro: true, status: 'partial', label: 'Schwärzen', tooltip: 'Inhalte dauerhaft unkenntlich machen.', destructive: true },
  { id: 'certSign',    group: 'protect', icon: 'ShieldCheck', pro: true, status: 'service', label: 'Digitale Signatur', tooltip: 'Mit Zertifikat rechtssicher signieren (benötigt Dienst).' },
  { id: 'sendForSign', group: 'protect', icon: 'Send',     pro: true, status: 'service', label: 'Zur Unterschrift senden', tooltip: 'E-Sign-Workflow mit Statusverfolgung (benötigt Dienst).' },

  // 8. Erweitert & Automatisieren (Pro)
  { id: 'compare',     group: 'advanced', icon: 'GitCompareArrows', pro: true, status: 'partial', label: 'Versionen vergleichen', tooltip: 'Zwei PDFs gegenüberstellen und Unterschiede finden.' },
  { id: 'batch',       group: 'advanced', icon: 'Workflow', pro: true, status: 'partial', label: 'Stapelverarbeitung', tooltip: 'Den gleichen Schritt auf viele Dateien anwenden.' },
  { id: 'accessibility', group: 'advanced', icon: 'Accessibility', pro: true, status: 'service', label: 'Barrierefreiheit', tooltip: 'Tags, Leserichtung und Prüfung (benötigt Dienst).' },
  { id: 'measure',     group: 'advanced', icon: 'Ruler',   pro: true, status: 'partial', label: 'Messen', tooltip: 'Abstand, Fläche und Umfang auf der Seite messen.' },
  { id: 'bookmarks',   group: 'advanced', icon: 'Bookmark', pro: true, status: 'ready', label: 'Lesezeichen & Links', tooltip: 'Lesezeichen und Verknüpfungen verwalten.' },
  { id: 'portfolio',   group: 'advanced', icon: 'FolderTree', pro: true, status: 'service', label: 'Portfolio', tooltip: 'Mehrere Dateien als Sammlung bündeln (benötigt Dienst).' },
]

export function toolById(id: string): PdfTool | undefined {
  return PDF_TOOLS.find(t => t.id === id)
}

export function toolsByGroup(group: PdfGroupId): PdfTool[] {
  return PDF_TOOLS.filter(t => t.group === group)
}

// Standard-Favoriten, wenn das Onboarding uebersprungen wird.
export const DEFAULT_FAVORITES: string[] = PDF_TOOLS.filter(t => t.defaultFavorite).map(t => t.id)

// ── Onboarding: Aufgaben-Chips -> welche Werkzeuge in den Schnellzugriff ──────
export interface OnboardingTask {
  id: string
  label: string
  tools: string[]   // Werkzeuge, die bei Auswahl gepinnt werden
}

export const ONBOARDING_TASKS: OnboardingTask[] = [
  { id: 'read',    label: 'Lesen & Kommentieren', tools: ['open', 'search', 'note', 'highlight', 'print'] },
  { id: 'edit',    label: 'Bearbeiten & Organisieren', tools: ['organize', 'mergePdf', 'deletePages', 'watermark'] },
  { id: 'convert', label: 'Umwandeln & Exportieren', tools: ['exportImage', 'exportText', 'ocr', 'compress'] },
  { id: 'forms',   label: 'Formulare', tools: ['fillForm', 'addFields', 'formData'] },
  { id: 'protect', label: 'Schützen & Signieren', tools: ['sign', 'password', 'redact'] },
  { id: 'advanced',label: 'Erweitert', tools: ['compare', 'batch', 'measure', 'bookmarks'] },
]

// Rollen-Presets als Abkuerzung im Onboarding.
export interface RolePreset {
  id: string
  label: string
  tasks: string[]   // OnboardingTask-Ids
}

export const ROLE_PRESETS: RolePreset[] = [
  { id: 'service',     label: 'Service/Montage', tasks: ['read', 'forms'] },
  { id: 'office',      label: 'Sachbearbeitung', tasks: ['read', 'edit', 'forms', 'protect'] },
  { id: 'quality',     label: 'Qualität',   tasks: ['read', 'edit', 'advanced'] },
  { id: 'sales',       label: 'Vertrieb',        tasks: ['read', 'convert', 'protect'] },
]
