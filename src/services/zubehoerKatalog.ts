// ── Zubehör-Katalog: Kategorien + übliche Büro-Kleinteile ─────────────────────
// Ordnet jeden Artikel einer Kategorie zu und gibt die Reihenfolge darin vor
// (Netzteil 65 W → 65 W USB-C → 150 W → 230 W statt alphabetischem Durcheinander).
// Vorhandene Artikel werden über `muster` erkannt und behalten ihren Namen; fehlende
// Standard-Artikel werden EINMAL mit Bestand „nicht gezählt" aufgenommen (siehe
// accessoryInventory.ts). Gelöschte Katalog-Artikel kommen nicht wieder.
// Hinweis: In Regex-Klammern keine Doppelpunkte (Tailwind liest sonst Klassen heraus).

export interface ZubehoerKategorie { id: string; name: string }

export const KATEGORIEN: ZubehoerKategorie[] = [
  { id: 'monitore', name: 'Bildschirme & Halterungen' },
  { id: 'docking', name: 'Dockingstations & Hubs' },
  { id: 'eingabe', name: 'Maus & Tastatur' },
  { id: 'audio', name: 'Headsets, Audio & Video' },
  { id: 'kabel', name: 'Kabel & Adapter' },
  { id: 'strom', name: 'Netzteile & Strom' },
  { id: 'taschen', name: 'Taschen & Transport' },
  { id: 'sonstiges', name: 'Speicher, Sicherheit & Sonstiges' },
]
const KAT_INDEX = new Map(KATEGORIEN.map((k, i) => [k.id, i]))
export const kategorieName = (id?: string) => KATEGORIEN.find(k => k.id === id)?.name ?? 'Sonstiges'
export const kategorieIndex = (id?: string) => KAT_INDEX.get(id || '') ?? KATEGORIEN.length

export interface KatalogArtikel {
  id: string
  name: string
  kategorie: string
  soll: number              // Vorschlag für den SOLL-Bestand
  muster: RegExp            // erkennt vorhandene Artikel (auf normalisiertem Namen)
}

// Reihenfolge = Anzeige-Reihenfolge innerhalb der Kategorie. Bei mehreren passenden
// Mustern gewinnt das ERSTE — darum spezielle vor allgemeinen (USB-A→C vor USB-C→C).
export const KATALOG: KatalogArtikel[] = [
  // Bildschirme
  { id: 'bildschirm-24', name: 'Bildschirm 24 Zoll', kategorie: 'monitore', soll: 2, muster: /(bildschirm|monitor).*24/ },
  { id: 'bildschirm-27', name: 'Bildschirm 27 Zoll', kategorie: 'monitore', soll: 2, muster: /(bildschirm|monitor).*27/ },
  { id: 'monitorarm', name: 'Monitorhalterung (Tischarm)', kategorie: 'monitore', soll: 1, muster: /monitor\s*(arm|halter)|tischhalter/ },
  // Docking
  { id: 'dock-zbook', name: 'Dockingstation (Z-Book)', kategorie: 'docking', soll: 2, muster: /dock.*z\s*book/ },
  { id: 'dock-usbc', name: 'Dockingstation USB-C', kategorie: 'docking', soll: 3, muster: /^docking\s*station$|dock.*usb\s*c|usb\s*c.*dock/ },
  { id: 'usb-hub', name: 'USB-A Hub', kategorie: 'docking', soll: 2, muster: /usb\s*a?\s*hub/ },
  { id: 'usbc-multiport', name: 'USB-C Multiport-Adapter (HDMI, USB, LAN)', kategorie: 'docking', soll: 2, muster: /multiport|usb\s*c\s*hub/ },
  // Eingabe
  { id: 'maus-tastatur', name: 'Maus + Tastatur (Set)', kategorie: 'eingabe', soll: 2, muster: /maus.*tastatur|tastatur.*maus|desktop\s*set/ },
  { id: 'maus-funk', name: 'Maus kabellos', kategorie: 'eingabe', soll: 2, muster: /maus.*(funk|kabellos|wireless|bluetooth)/ },
  { id: 'maus', name: 'Maus', kategorie: 'eingabe', soll: 5, muster: /^maus(e|en)?\b/ },
  { id: 'tastatur', name: 'Tastatur', kategorie: 'eingabe', soll: 3, muster: /^tastatur/ },
  { id: 'mauspad', name: 'Mauspad', kategorie: 'eingabe', soll: 3, muster: /maus\s*pad|mausmatte/ },
  { id: 'presenter', name: 'Presenter', kategorie: 'eingabe', soll: 1, muster: /presenter|praesenter/ },
  // Audio & Video
  { id: 'headset', name: 'Headset', kategorie: 'audio', soll: 5, muster: /headset/ },
  { id: 'jabra-link', name: 'Jabra Link 390a (USB-A Bluetooth-Adapter)', kategorie: 'audio', soll: 2, muster: /jabra.*link|link\s*390/ },
  { id: 'webcam', name: 'Webcam', kategorie: 'audio', soll: 2, muster: /kamera|webcam|camera/ },
  { id: 'speakerphone', name: 'Konferenzlautsprecher (Speakerphone)', kategorie: 'audio', soll: 1, muster: /speaker|konferenz\s*laut|freisprech/ },
  // Kabel & Adapter
  { id: 'usb-a-verl', name: 'Kabel USB-A Verlängerung', kategorie: 'kabel', soll: 3, muster: /usb\s*a\s*(zu\s*)?usb\s*a|usb.*verlaenger/ },
  { id: 'usb-a-c', name: 'Kabel USB-A zu USB-C', kategorie: 'kabel', soll: 5, muster: /usb\s*a\s*(zu|auf|-)?\s*usb\s*c/ },
  { id: 'usb-c-lightning', name: 'Kabel USB-C zu Lightning', kategorie: 'kabel', soll: 2, muster: /lightning/ },
  { id: 'usb-c-c', name: 'Kabel USB-C zu USB-C', kategorie: 'kabel', soll: 5, muster: /usb\s*c\s*(zu|auf|-)?\s*usb\s*c/ },
  { id: 'hdmi-kabel', name: 'HDMI-Kabel 2 m', kategorie: 'kabel', soll: 5, muster: /hdmi\s*kabel|kabel\s*hdmi|^hdmi(\s*\d+\s*m)?$/ },
  { id: 'dp-kabel', name: 'DisplayPort-Kabel 2 m', kategorie: 'kabel', soll: 5, muster: /display\s*port\s*kabel|dp\s*kabel|kabel\s*display\s*port/ },
  { id: 'dp-adapter', name: 'DisplayPort-Adapter', kategorie: 'kabel', soll: 3, muster: /display\s*port.*adapter/ },
  { id: 'usbc-hdmi', name: 'Adapter USB-C zu HDMI', kategorie: 'kabel', soll: 3, muster: /usb\s*c.*hdmi/ },
  { id: 'usbc-lan', name: 'Adapter USB-C zu LAN (RJ45)', kategorie: 'kabel', soll: 2, muster: /usb\s*c.*(lan|rj\s*45|ethernet)/ },
  { id: 'lan-kabel', name: 'Netzwerkkabel (LAN) 3 m', kategorie: 'kabel', soll: 10, muster: /netzwerk\s*kabel|lan\s*kabel|patch\s*kabel/ },
  { id: 'kaltgeraet', name: 'Kaltgerätekabel', kategorie: 'kabel', soll: 5, muster: /kaltgeraet/ },
  // Netzteile & Strom
  { id: 'nt-65', name: 'Netzteil 65 W', kategorie: 'strom', soll: 3, muster: /netzteil\w*\s*65\s*w(?!.*usb)/ },
  { id: 'nt-65-usbc', name: 'Netzteil 65 W USB-C', kategorie: 'strom', soll: 3, muster: /netzteil\w*.*65.*usb\s*c|usb\s*c\s*netzteil/ },
  { id: 'nt-150', name: 'Netzteil 150 W', kategorie: 'strom', soll: 2, muster: /netzteil\w*\s*150/ },
  { id: 'nt-230', name: 'Netzteil 230 W', kategorie: 'strom', soll: 1, muster: /netzteil\w*\s*230/ },
  { id: 'steckdosenleiste', name: 'Steckdosenleiste (Mehrfachsteckdose)', kategorie: 'strom', soll: 3, muster: /steckdosen|mehrfach\s*steck/ },
  { id: 'usb-ladegeraet', name: 'USB-C Ladegerät (Handy)', kategorie: 'strom', soll: 3, muster: /lade\s*(geraet|adapter|stecker)|charger/ },
  // Taschen
  { id: 'tasche-gross', name: 'Laptoptasche groß', kategorie: 'taschen', soll: 2, muster: /tasche\w*\s*gross/ },
  { id: 'tasche-klein', name: 'Laptoptasche klein', kategorie: 'taschen', soll: 2, muster: /tasche\w*\s*klein/ },
  { id: 'rucksack', name: 'Laptop-Rucksack', kategorie: 'taschen', soll: 2, muster: /rucksack/ },
  // Sonstiges
  { id: 'usb-stick', name: 'USB-Stick 64 GB', kategorie: 'sonstiges', soll: 5, muster: /usb\s*stick/ },
  { id: 'ext-ssd', name: 'Externe SSD 1 TB', kategorie: 'sonstiges', soll: 1, muster: /extern\w*\s*(ssd|festplatte|hdd)|festplatte/ },
  { id: 'schloss', name: 'Laptopschloss (Kensington)', kategorie: 'sonstiges', soll: 2, muster: /schloss|kensington/ },
  { id: 'blickschutz', name: 'Blickschutzfilter 14 Zoll', kategorie: 'sonstiges', soll: 2, muster: /blickschutz|privacy/ },
  { id: 'reiniger', name: 'Bildschirm-Reinigungstücher', kategorie: 'sonstiges', soll: 2, muster: /reinig/ },
  { id: 'batterien', name: 'Batterien AA / AAA', kategorie: 'sonstiges', soll: 10, muster: /batterie/ },
  { id: 'kabelbinder', name: 'Klett-Kabelbinder', kategorie: 'sonstiges', soll: 1, muster: /kabelbinder|klett/ },
]
const KATALOG_POS = new Map(KATALOG.map((k, i) => [k.id, i]))
export const katalogPosition = (id?: string) => (id ? KATALOG_POS.get(id) : undefined) ?? 9999

/** Für den Vergleich: klein, Umlaute ausgeschrieben, Satzzeichen → Leerzeichen. */
export function normName(s: string): string {
  return (s ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9+]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Passender Katalog-Artikel zu einem vorhandenen Namen (oder undefined). */
export function findeKatalog(name: string): KatalogArtikel | undefined {
  const n = normName(name)
  if (!n) return undefined
  return KATALOG.find(k => normName(k.name) === n) ?? KATALOG.find(k => k.muster.test(n))
}

/** Kategorie aus dem Namen raten (für Artikel, die nicht im Katalog stehen). */
export function rateKategorie(name: string): string {
  const k = findeKatalog(name)
  if (k) return k.kategorie
  const n = normName(name)
  if (/kabel|adapter/.test(n)) return 'kabel'
  if (/bildschirm|monitor|display(?!\s*port)/.test(n)) return 'monitore'
  if (/dock|hub/.test(n)) return 'docking'
  if (/maus|tastatur|keyboard|mouse/.test(n)) return 'eingabe'
  if (/headset|kopfhoerer|kamera|webcam|lautsprecher|jabra|mikrofon|audio/.test(n)) return 'audio'
  if (/kabel|adapter|usb|hdmi|lan|display\s*port/.test(n)) return 'kabel'
  if (/netzteil|strom|steckdose|lade|akku|power/.test(n)) return 'strom'
  if (/tasche|rucksack|sleeve|koffer/.test(n)) return 'taschen'
  return 'sonstiges'
}

/** Amazon-Suche zum Namen (Hilfe beim Hinterlegen eines Links). */
export const amazonSuche = (name: string) => `https://www.amazon.de/s?k=${encodeURIComponent(name.trim())}`
