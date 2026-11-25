// Parla Italiano — die Reise: 24 Level = 24 Stationen von Turin bis Cagliari.
// Je Level 5 Lerntage und eine Prüfung. Wer besteht, bekommt die Rezeptseite der Station.
import type { Paar } from './inhaltTypen'

export interface Abschnitt { nr: number; name: string; cefr: string; kurz: string }

export const ABSCHNITTE: Abschnitt[] = [
  { nr: 1, name: 'Ankommen', cefr: 'A1.1', kurz: 'Begrüßen, vorstellen, bestellen, sich zurechtfinden' },
  { nr: 2, name: 'Alltag', cefr: 'A1.2', kurz: 'Tagesablauf, Wetter, Essen, Verabredungen' },
  { nr: 3, name: 'Erzählen', cefr: 'A2.1', kurz: 'Von gestern berichten, reisen, wohnen, Gesundheit' },
  { nr: 4, name: 'Früher und später', cefr: 'A2.2', kurz: 'Wie es früher war, Pläne, vergleichen' },
  { nr: 5, name: 'Wünsche und Meinung', cefr: 'B1.1', kurz: 'Höflich bitten, beschreiben, zusammenhängend erzählen' },
  { nr: 6, name: 'Mitreden', cefr: 'B1.2', kurz: 'Meinung sagen, vermuten, Probleme lösen' },
]

export interface Station {
  level: number
  ort: string
  /** Region zur Einordnung */
  region: string
  abschnitt: number
  /** Breite, Länge (für die Karte) */
  lat: number
  lon: number
  /** worum es geht, in wenigen Worten */
  thema: string
  /** die Rezeptseite, die man mit der Prüfung gewinnt */
  seite: Paar
}

export const STATIONEN: Station[] = [
  { level: 1, ort: 'Torino', region: 'Piemont', abschnitt: 1, lat: 45.07, lon: 7.69, thema: 'Begrüßen, vorstellen, zählen', seite: { it: 'Per il ragù: una cipolla, una carota e un gambo di sedano.', de: 'Für das Ragù: eine Zwiebel, eine Karotte und eine Stange Sellerie.' } },
  { level: 2, ort: 'Milano', region: 'Lombardei', abschnitt: 1, lat: 45.46, lon: 9.19, thema: 'Bahnhof, Café, bezahlen', seite: { it: 'Trita tutto molto fine.', de: 'Hacke alles sehr fein.' } },
  { level: 3, ort: 'Lago di Como', region: 'Lombardei', abschnitt: 1, lat: 46.0, lon: 9.26, thema: 'Familie, Leute beschreiben, Berufe', seite: { it: "Scalda due cucchiai di olio e una noce di burro.", de: 'Erhitze zwei Löffel Öl und ein nussgroßes Stück Butter.' } },
  { level: 4, ort: 'Genova', region: 'Ligurien', abschnitt: 1, lat: 44.41, lon: 8.93, thema: 'Wege in der Stadt, Verkehrsmittel', seite: { it: 'Fai rosolare le verdure a fuoco dolce per dieci minuti.', de: 'Dünste das Gemüse zehn Minuten bei milder Hitze an.' } },
  { level: 5, ort: 'Verona', region: 'Venetien', abschnitt: 2, lat: 45.44, lon: 10.99, thema: 'Uhrzeit, Tagesablauf, Woche', seite: { it: 'Aggiungi cento grammi di pancetta a cubetti.', de: 'Gib hundert Gramm gewürfelten Speck dazu.' } },
  { level: 6, ort: 'Bolzano', region: 'Südtirol', abschnitt: 2, lat: 46.5, lon: 11.35, thema: 'Wetter, Jahreszeiten, Kleidung', seite: { it: 'Poi trecento grammi di carne macinata di manzo.', de: 'Dann dreihundert Gramm Rinderhackfleisch.' } },
  { level: 7, ort: 'Venezia', region: 'Venetien', abschnitt: 2, lat: 45.44, lon: 12.33, thema: 'Markt, Restaurant, Geschmack', seite: { it: 'Rosola la carne finché cambia colore.', de: 'Brate das Fleisch an, bis es die Farbe wechselt.' } },
  { level: 8, ort: 'Bologna', region: 'Emilia-Romagna', abschnitt: 2, lat: 44.49, lon: 11.34, thema: 'Verabredungen, Hobbys, kochen', seite: { it: 'Versa mezzo bicchiere di vino rosso e lascia evaporare.', de: 'Gieße ein halbes Glas Rotwein an und lass ihn verdampfen.' } },
  { level: 9, ort: 'Firenze', region: 'Toskana', abschnitt: 3, lat: 43.77, lon: 11.26, thema: 'Von gestern erzählen, Museum', seite: { it: 'Aggiungi trecento grammi di passata di pomodoro.', de: 'Gib dreihundert Gramm passierte Tomaten dazu.' } },
  { level: 10, ort: 'Pisa', region: 'Toskana', abschnitt: 3, lat: 43.72, lon: 10.4, thema: 'Bahnfahren, Fahrkarten, unterwegs', seite: { it: "Un pizzico di sale e un po' di pepe.", de: 'Eine Prise Salz und etwas Pfeffer.' } },
  { level: 11, ort: 'Siena', region: 'Toskana', abschnitt: 3, lat: 43.32, lon: 11.33, thema: 'Wohnen, Möbel, Dinge suchen', seite: { it: 'Copri con un mestolo di brodo caldo.', de: 'Bedecke alles mit einer Kelle heißer Brühe.' } },
  { level: 12, ort: 'Perugia', region: 'Umbrien', abschnitt: 3, lat: 43.11, lon: 12.39, thema: 'Körper, Apotheke, Arzt', seite: { it: 'Cuoci a fuoco bassissimo per almeno due ore.', de: 'Koche es bei kleinster Hitze mindestens zwei Stunden.' } },
  { level: 13, ort: 'Roma', region: 'Latium', abschnitt: 4, lat: 41.9, lon: 12.5, thema: 'Wie es früher war', seite: { it: 'Mescola ogni tanto e non avere fretta.', de: 'Rühre ab und zu um und hab es nicht eilig.' } },
  { level: 14, ort: 'Napoli', region: 'Kampanien', abschnitt: 4, lat: 40.85, lon: 14.27, thema: 'Kochen, was ist passiert?', seite: { it: 'Alla fine versa mezzo bicchiere di latte.', de: 'Gieße am Ende ein halbes Glas Milch dazu.' } },
  { level: 15, ort: 'Amalfi', region: 'Kampanien', abschnitt: 4, lat: 40.63, lon: 14.6, thema: 'Pläne, Hotel, Strand', seite: { it: 'Per la pasta: quattrocento grammi di farina.', de: 'Für die Pasta: vierhundert Gramm Mehl.' } },
  { level: 16, ort: 'Bari', region: 'Apulien', abschnitt: 4, lat: 41.12, lon: 16.87, thema: 'Einkaufen, vergleichen, handeln', seite: { it: 'Quattro uova fresche: un uovo ogni cento grammi di farina.', de: 'Vier frische Eier: ein Ei je hundert Gramm Mehl.' } },
  { level: 17, ort: 'Matera', region: 'Basilikata', abschnitt: 5, lat: 40.67, lon: 16.6, thema: 'Wünsche, Arbeit, höflich bitten', seite: { it: 'Impasta a mano per dieci minuti.', de: 'Knete den Teig zehn Minuten von Hand.' } },
  { level: 18, ort: 'Lecce', region: 'Apulien', abschnitt: 5, lat: 40.35, lon: 18.17, thema: 'Feste, Beziehungen, beschreiben', seite: { it: "Lascia riposare l'impasto mezz'ora sotto un panno.", de: 'Lass den Teig eine halbe Stunde unter einem Tuch ruhen.' } },
  { level: 19, ort: 'Tropea', region: 'Kalabrien', abschnitt: 5, lat: 38.68, lon: 15.9, thema: 'Autopanne, Werkstatt, Wegbeschreibung', seite: { it: 'Stendi la sfoglia sottile con il mattarello.', de: 'Rolle den Teig mit dem Nudelholz dünn aus.' } },
  { level: 20, ort: 'Reggio Calabria', region: 'Kalabrien', abschnitt: 5, lat: 38.11, lon: 15.65, thema: 'Nachrichten, Handy, berichten', seite: { it: 'Arrotola la sfoglia e taglia strisce larghe un dito.', de: 'Rolle den Teig auf und schneide fingerbreite Streifen.' } },
  { level: 21, ort: 'Taormina', region: 'Sizilien', abschnitt: 6, lat: 37.85, lon: 15.29, thema: 'Meinung sagen, Natur, Umwelt', seite: { it: 'Cuoci le tagliatelle due minuti in acqua salata.', de: 'Koche die Tagliatelle zwei Minuten in Salzwasser.' } },
  { level: 22, ort: 'Siracusa', region: 'Sizilien', abschnitt: 6, lat: 37.08, lon: 15.29, thema: 'Lebensgeschichten, Briefe', seite: { it: 'Scola la pasta e uniscila subito al ragù.', de: 'Gieße die Pasta ab und gib sie sofort zum Ragù.' } },
  { level: 23, ort: 'Palermo', region: 'Sizilien', abschnitt: 6, lat: 38.12, lon: 13.36, thema: 'Was wäre, wenn …? Kultur', seite: { it: 'Servi con parmigiano grattugiato al momento.', de: 'Serviere mit frisch geriebenem Parmesan.' } },
  { level: 24, ort: 'Cagliari', region: 'Sardinien', abschnitt: 6, lat: 39.22, lon: 9.12, thema: 'Telefonieren, Probleme lösen, Redewendungen', seite: { it: 'Il segreto: cucina per le persone che ami, e mangiate insieme.', de: 'Das Geheimnis: Koche für die Menschen, die du liebst, und esst zusammen.' } },
]

export const REZEPT_TITEL: Paar = { it: 'Tagliatelle al ragù di Nonna Rosa', de: 'Tagliatelle mit dem Ragù von Oma Rosa' }

export const station = (level: number): Station => STATIONEN[Math.max(1, Math.min(STATIONEN.length, level)) - 1]
export const abschnittVon = (level: number): Abschnitt => ABSCHNITTE[station(level).abschnitt - 1]
/** Level 25 = am Ziel (alle 24 Prüfungen bestanden) */
export const AM_ZIEL = STATIONEN.length + 1
export const stufenName = (level: number): string => level >= AM_ZIEL ? 'Am Ziel · B1' : `Level ${level} · ${station(level).ort}`
export const bildVon = (level: number): string => `./italiano/bilder/station-${String(Math.min(level, STATIONEN.length)).padStart(2, '0')}.webp`

// ── Karte ───────────────────────────────────────────────────────────────────────────────
// Stark vereinfachter Umriss (Länge, Breite) — nur zur Orientierung auf der Reiseroute.
const FESTLAND: [number, number][] = [
  [7.5, 43.8], [6.9, 44.4], [6.6, 45.1], [7.0, 45.9], [7.9, 46.0], [8.4, 46.4], [9.0, 45.85], [9.3, 46.5], [10.1, 46.6], [10.5, 46.9],
  [12.1, 47.0], [12.4, 46.7], [13.7, 46.5], [13.6, 45.8], [13.1, 45.7], [12.3, 45.3], [12.4, 44.9], [12.3, 44.2], [13.5, 43.6], [14.0, 42.7],
  [14.7, 42.1], [15.2, 41.9], [16.2, 41.9], [15.9, 41.6], [16.9, 41.1], [18.0, 40.6], [18.5, 40.1], [18.4, 39.8], [18.0, 40.0], [17.2, 40.5],
  [16.6, 40.1], [16.5, 39.6], [17.1, 39.0], [16.5, 38.4], [16.1, 37.9], [15.65, 38.0], [15.9, 38.7], [16.1, 39.2], [15.8, 39.9], [15.3, 40.0],
  [15.0, 40.2], [14.9, 40.6], [14.35, 40.57], [14.2, 40.8], [13.8, 41.2], [13.0, 41.2], [12.2, 41.7], [11.6, 42.3], [11.1, 42.4], [10.5, 42.9],
  [10.3, 43.5], [10.1, 44.0], [9.6, 44.15], [8.9, 44.4], [8.2, 44.0],
]
const SIZILIEN: [number, number][] = [[12.4, 38.0], [13.3, 38.2], [14.5, 38.0], [15.6, 38.3], [15.15, 37.5], [15.3, 37.0], [15.1, 36.65], [14.3, 37.0], [13.5, 37.3], [12.6, 37.6]]
const SARDINIEN: [number, number][] = [[9.2, 41.25], [9.7, 40.9], [9.8, 40.5], [9.65, 39.9], [9.6, 39.2], [9.1, 39.2], [8.9, 38.9], [8.4, 39.05], [8.45, 39.9], [8.4, 40.4], [8.15, 40.6], [8.2, 40.95], [8.8, 40.95]]

export const KARTE = { breite: 300, hoehe: 372 }
const LON0 = 6.2, LON1 = 18.9, LAT0 = 47.3, LAT1 = 36.3
/** Länge/Breite → Punkt auf der Karte */
export function aufKarte(lon: number, lat: number): [number, number] {
  return [
    Math.round(((lon - LON0) / (LON1 - LON0)) * KARTE.breite * 10) / 10,
    Math.round(((LAT0 - lat) / (LAT0 - LAT1)) * KARTE.hoehe * 10) / 10,
  ]
}
/** geschlossene, weich gerundete Linie durch die Punkte (Catmull-Rom → Bézier), damit der Umriss nicht eckig wirkt */
function pfad(punkte: [number, number][]): string {
  const p = punkte.map(([lo, la]) => aufKarte(lo, la))
  const n = p.length
  const r = (x: number) => Math.round(x * 10) / 10
  const zug = 0.75
  let d = `M${p[0][0]} ${p[0][1]}`
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n], p1 = p[i], p2 = p[(i + 1) % n], p3 = p[(i + 2) % n]
    d += ` C${r(p1[0] + ((p2[0] - p0[0]) / 6) * zug)} ${r(p1[1] + ((p2[1] - p0[1]) / 6) * zug)} ${r(p2[0] - ((p3[0] - p1[0]) / 6) * zug)} ${r(p2[1] - ((p3[1] - p1[1]) / 6) * zug)} ${p2[0]} ${p2[1]}`
  }
  return d + ' Z'
}
export const UMRISS: string[] = [pfad(FESTLAND), pfad(SIZILIEN), pfad(SARDINIEN)]
