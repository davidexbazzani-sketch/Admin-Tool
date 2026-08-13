// ── Drucker-Seed (Stammdaten aus dem SEAL Add Printer Wizard) ─────────────────
// Automatisch aus den vom Nutzer gelieferten Screenshots des SEAL Add Printer
// Wizard erfasst. Dient als Basis-Stammdaten je Drucker (Duplex, Farbe,
// Papierformat, Standort) und als Vorlage zum Befüllen der Standort-Übersicht
// (Kategorie "Drucker"). Frei editierbare Zusatzfelder (IP, Tonerart, Modell …)
// liegen im Drucker-Dossier und überschreiben diese Basis nicht.

export interface PrinterSeed {
  /** Warteschlangen-/Druckername (eindeutig, z. B. "PMD634"). */
  name: string
  /** "Simplex" | "Duplex" */
  duplex: string
  /** "Farbe" | "Schwarzweiß" */
  color: string
  /** Unterstützte Papierformate (z. B. ["A3","A4"]). */
  paperFormats: string[]
  /** Standort-/Beschreibungstext aus dem Wizard. */
  location: string
}

export const PRINTER_SEED: PrinterSeed[] = [
  {
    name: "DEHAM001",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "G170 A4 Farbe"
  },
  {
    name: "DEHAM002",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "Prüffeld Büro"
  },
  {
    name: "DEHAM004",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "H8 Vorverpackung"
  },
  {
    name: "DEHAM006",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "Container 05 Instandhaltung"
  },
  {
    name: "DEHAM007",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "k122 A3 A4 Color"
  },
  {
    name: "DEHAM008",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "k214 A4 Duplex Color"
  },
  {
    name: "DEHAM009",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "K210 A3 A4 Color"
  },
  {
    name: "DEHAM010",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "H8 Hochregallager A4"
  },
  {
    name: "DEHAM011",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "v240 A4 Color Duplex"
  },
  {
    name: "DEHAM012",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "Galerie Süd H8 A3 A4 Color"
  },
  {
    name: "DEHAM013",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "Tor A A4 Color Duplex"
  },
  {
    name: "DEHAM014",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "WE Schrank LV"
  },
  {
    name: "DEHAM015",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "G162"
  },
  {
    name: "DEHAM016",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "v326 A4 Color"
  },
  {
    name: "DEHAM017",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H7 Montage Abdichtung A4 SW"
  },
  {
    name: "DEHAM018",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "H6 Storchennest A4 Color"
  },
  {
    name: "DEHAM019",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "H8 Vorverpackung A3 Color Duplex"
  },
  {
    name: "DEHAM021",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "H7 Messmaschine A4 Farbe / Platz 762"
  },
  {
    name: "DEHAM022",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "Wareneingang (Tresen)"
  },
  {
    name: "DEHAM023",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H8 Co04 A4 SW Duplex"
  },
  {
    name: "PDFPLOTTER_SKF",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "Benutzerdefiniert"
    ],
    location: "PDF Single an Versender"
  },
  {
    name: "Pickup",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "Benutzerdefiniert"
    ],
    location: "Alle Drucker mit NFC-Tag"
  },
  {
    name: "PMD379",
    duplex: "Simplex",
    color: "Schwarzweiß",
    paperFormats: [
      "RollA0",
      "RollA2"
    ],
    location: "v344 SW A0/A1/A2/A3/A4"
  },
  {
    name: "PMD388",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "VIRTUELL - NICHT LÖSCHEN"
  },
  {
    name: "PMD390",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "k021 A4 SW Duplex"
  },
  {
    name: "PMD437",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H6 Turm A4 SW Duplex"
  },
  {
    name: "PMD438",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v331.1 A4 SW Duplex"
  },
  {
    name: "PMD485",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "z105 A4 SW Duplex"
  },
  {
    name: "PMD502",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "Prüffeld"
  },
  {
    name: "PMD506",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "Galerie EG Pausenraum A4 SW Duplex"
  },
  {
    name: "PMD510",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "Co04 A4 Color Duplex"
  },
  {
    name: "PMD512",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v119 A4 SW Duplex"
  },
  {
    name: "PMD518",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "k111 A4 SW"
  },
  {
    name: "PMD519",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "Repro vk40 A4 SW Duplex"
  },
  {
    name: "PMD523",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "H6EW A3 SW Duplex"
  },
  {
    name: "PMD528",
    duplex: "Simplex",
    color: "Schwarzweiß",
    paperFormats: [
      "RollA0",
      "RollA1"
    ],
    location: "Repro SW A0/A1/A2/A3/A4"
  },
  {
    name: "PMD532",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H6 Co04 A4 SW Duplex"
  },
  {
    name: "PMD548",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "V324 A4 SW Duplex"
  },
  {
    name: "PMD549",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v326 A4 SW Duplex"
  },
  {
    name: "PMD552",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v219 A4 SW Duplex"
  },
  {
    name: "PMD556",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "VK48 A4 SW Duplex"
  },
  {
    name: "PMD557",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "K116 A4 SW Duplex"
  },
  {
    name: "PMD559",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "k116 A4 SW Duplex"
  },
  {
    name: "PMD561",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H3 Co12 A4 SW Duplex"
  },
  {
    name: "PMD565",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "Wareneingangsprüfung Schrank A4 SW Duplex"
  },
  {
    name: "PMD570",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A3",
      "A4",
      "A5"
    ],
    location: "Repro SW A3/A4"
  },
  {
    name: "PMD571",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4",
      "A5"
    ],
    location: "Repro Farbe A3/A4"
  },
  {
    name: "PMD574",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v248 A4 SW Duplex"
  },
  {
    name: "PMD583",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "Co03 A3 SW Duplex"
  },
  {
    name: "PMD584",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v205 A4 SW Duplex"
  },
  {
    name: "PMD587",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H7 Montage Abdichtung A4 SW Duplex"
  },
  {
    name: "PMD591",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H6 Graviermaschine A4 SW Duplex"
  },
  {
    name: "PMD593",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "M090 WE hinten A4 SW Duplex"
  },
  {
    name: "PMD594",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H9 Co101 geg. Wareneingang"
  },
  {
    name: "PMD595",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "v400 Flur A4 Farbe Duplex"
  },
  {
    name: "PMD596",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "G170 A3 SW Duplex"
  },
  {
    name: "PMD597",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "VS001 A3 SW Duplex"
  },
  {
    name: "PMD598",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v400 Flur A3 SW Duplex"
  },
  {
    name: "PMD599",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "H8 Vorverpackung A3 SW Duplex"
  },
  {
    name: "PMD601",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H6 Süd Meistercontainer A4 S/W Scan"
  },
  {
    name: "PMD604",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "k119 A3 SW Duplex"
  },
  {
    name: "PMD607",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "M090 A3 SW Duplex"
  },
  {
    name: "PMD608",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v302 A4 SW Duplex"
  },
  {
    name: "PMD609",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v226 A4 SW Duplex"
  },
  {
    name: "PMD610",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "k103 A4 Farbe Duplex"
  },
  {
    name: "PMD611",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "Versand 2 A3 Duplex Color"
  },
  {
    name: "PMD612",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v233 A4 SW Duplex"
  },
  {
    name: "PMD613",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "Galerie 160 A4 SW Duplex"
  },
  {
    name: "PMD614",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "Co10 A4 SW Duplex"
  },
  {
    name: "PMD615",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v335 Flur A3 Farbe Duplex"
  },
  {
    name: "PMD616",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v209 A3 A4 Farbe Duplex"
  },
  {
    name: "PMD617",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v243 A3 Farbe Duplex"
  },
  {
    name: "PMD618",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v130 A3 SW Duplex"
  },
  {
    name: "PMD620",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v315 A4 SW Duplex"
  },
  {
    name: "PMD621",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "UMLEITUNG ZU DEHAM010 A4 SW Duplex"
  },
  {
    name: "PMD622",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H6 A4 SW Duplex unterhalb AV"
  },
  {
    name: "PMD623",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H4 BlueMon Labor v315 A4 SW Duplex"
  },
  {
    name: "PMD624",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "VE14 IT-Support A4 SW Duplex"
  },
  {
    name: "PMD625",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v318 A3 SW Duplex"
  },
  {
    name: "PMD626",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "G161.1 A4 SW Duplex"
  },
  {
    name: "PMD627",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "K210 A4 SW Duplex"
  },
  {
    name: "PMD628",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "K132 A4/A3 SW/Farbe Duplex"
  },
  {
    name: "PMD629",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v313 A4/A3 SW/Farbe Duplex"
  },
  {
    name: "PMD631",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v007 A4/A3 SW/Farbe Duplex"
  },
  {
    name: "PMD633",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v305 A4 SW Duplex"
  },
  {
    name: "PMD634",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "v128 A4 / A3 S W / Farbe Duplex"
  },
  {
    name: "PMD635",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A3",
      "A4"
    ],
    location: "H8 Meistercontainer A3 SW Duplex"
  },
  {
    name: "PMD636",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "v240 A4 SW Duplex Vorlagen Fach 2"
  },
  {
    name: "PMD637",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "VE10 A4 SW Duplex"
  },
  {
    name: "PMD640",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "H8 Co04 A4 SW Duplex"
  },
  {
    name: "PMD642",
    duplex: "Duplex",
    color: "Schwarzweiß",
    paperFormats: [
      "A4"
    ],
    location: "Wareneingang A4 SW Duplex"
  },
  {
    name: "PMD643",
    duplex: "Simplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "H9 Anbau A4 / A3 SW / Farbe Duplex"
  },
  {
    name: "PMD644",
    duplex: "Duplex",
    color: "Farbe",
    paperFormats: [
      "A4"
    ],
    location: "VS006 A4 Farbe"
  }
]


/** Schneller Lookup der Basis-Stammdaten je (kanonischem) Druckernamen. */
export function seedForPrinter(name: string): PrinterSeed | undefined {
  const key = (name || '').trim().toUpperCase()
  return PRINTER_SEED.find(p => p.name.toUpperCase() === key)
}
