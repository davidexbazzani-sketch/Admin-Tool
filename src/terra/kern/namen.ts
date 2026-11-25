// Terra Incognita — Namen aus dem festen Zufallswert eines Ortes: Hafenstädte, Dörfer, Wracks, Vorschläge für Inseln.
// Für alle Kollegen gleich (Teil der Welt). Inseln tauft der Erstentdecker selbst — hier steht nur der Vorschlag.
import { streu } from './streu'
import type { Ort } from './welt'

const aus = <T>(liste: readonly T[], saat: number, salz: number): T => liste[streu(saat, salz, 4711) % liste.length]

const NORD_A = ['Brak', 'Nord', 'Witt', 'Hal', 'Stor', 'Fehn', 'Mar', 'Grön', 'Hus', 'Tönn', 'Var', 'Eider', 'Lüt', 'Dün', 'Reet', 'Sand', 'Möw', 'Stein', 'Wester', 'Olden', 'Krum', 'Lang', 'Neu', 'Alt']
const NORD_B = ['haven', 'sund', 'vik', 'holm', 'siel', 'oog', 'büll', 'trup', 'by', 'hörn', 'warft', 'deich', 'tief', 'ness', 'koog', 'stede']
const OST_A = ['Rav', 'Kol', 'Mem', 'Dar', 'Stol', 'Wis', 'Greif', 'Lab', 'Pill', 'Tra', 'Bors', 'Nar', 'Rig', 'Sem', 'Lett', 'Dan', 'Elb', 'Gol', 'Kur', 'Sam']
const OST_B = ['ow', 'itz', 'gard', 'minde', 'burg', 'ava', 'hagen', 'in', 'au', 'kranz', 'walde', 'berg', 'ing', 'ort']
const SUED_A = ['Port ', 'Santa ', 'San ', 'Bahia ', 'Villa ', 'Puerto ', 'Cabo ', 'Porto ', 'Isla ']
const SUED_B = ['Mirabel', 'Almeda', 'Corazon', 'Serena', 'Lucinda', 'Verano', 'Oriana', 'Benedita', 'Florisa', 'Marimba', 'Tavira', 'Celestina', 'Aurelia', 'Palmar', 'Zafira', 'Esperanza', 'Dorado', 'Maravilla', 'Candela', 'Azul']
const WEST_A = ['Fern', 'Letzt', 'Wind', 'Sturm', 'Abend', 'Nebel', 'Welt', 'Sonn', 'Stern', 'Ruh', 'Wal', 'Gischt', 'Hoff', 'Sehn']
const WEST_B = ['haven', 'end', 'rast', 'port', 'huk', 'wacht', 'anker', 'licht', 'sund', 'trost']

function stadt(o: Ort, salz: number): string {
  const g = o.gebiet
  if (g === 5 || g === 6 || g === 7) return aus(SUED_A, o.saat, salz) + aus(SUED_B, o.saat, salz + 1)
  if (g === 3 || g === 4) return aus(OST_A, o.saat, salz) + aus(OST_B, o.saat, salz + 1)
  if (g === 8 || g === 9) return aus(WEST_A, o.saat, salz) + aus(WEST_B, o.saat, salz + 1)
  return aus(NORD_A, o.saat, salz) + aus(NORD_B, o.saat, salz + 1)
}

const SCHIFFE = ['Fortuna', 'Seeschwalbe', 'Morgenstern', 'Wilhelmine', 'Albatros', 'Gute Hoffnung', 'Nordlicht', 'Santa Clara', 'Windsbraut', 'Hanseat', 'Delphin', 'Emma Luise', 'Zuversicht', 'Margarethe', 'Sturmvogel', 'Concordia', 'Prinz Georg', 'Seejungfer', 'Adler von Lübeck', 'Esperanza', 'Zwei Brüder', 'Katharina', 'Neptun', 'Stella Maris']
const QUELLE = [['Süßwasserquelle', 'Wasserstelle', 'Bachmündung', 'Beerenhang'], ['Schmelzwasserbach', 'Eisquelle', 'Vogelklippe'], ['Kokoshain', 'Fruchthain', 'Wasserfall im Wald', 'Brotfruchtbäume']]
const RUINE = ['Verfallener Wachturm', 'Steinkreis', 'Alte Schanze', 'Versunkener Tempel', 'Verlassene Kapelle', 'Säulenhalle', 'Zerfallenes Kontor', 'Grabhügel', 'Mauern im Sand', 'Vergessenes Leuchtfeuer']
const EINSIEDLER = ['Hütte des Einsiedlers', 'Klause am Hang', 'Rauch über den Felsen', 'Die alte Lotsin', 'Der Strandläufer', 'Hütte aus Treibholz', 'Der Vogelwart', 'Die Kräuterfrau']
const FISCH = [['Heringsgründe', 'Dorschbank', 'Makrelenzug', 'Krabbengründe'], ['Walgründe', 'Robbenbank', 'Kabeljaubank'], ['Thunfischzug', 'Perlmuschelbank', 'Schildkrötengründe', 'Fliegende Fische']]
const STRUDEL = ['Der Schlund', 'Mahlstrom', 'Hexenkessel', 'Die Mühle', 'Der Sog', 'Teufelsloch']

/** Klima eines Gebiets: 0 = gemäßigt, 1 = kalt, 2 = warm */
export const klima = (gebiet: number): 0 | 1 | 2 => (gebiet === 2 ? 1 : gebiet === 5 || gebiet === 6 || gebiet === 7 ? 2 : 0)

/** der feste Name eines Ortes (Hafenstädte, Dörfer und Fundstellen haben ihn von sich aus) */
export function ortName(o: Ort): string {
  if (o.q === 0 && o.r === 0) return 'Hamburg'
  switch (o.art) {
    case 'hafen': return stadt(o, 1)
    case 'dorf': return stadt(o, 11)
    case 'quelle': return aus(QUELLE[klima(o.gebiet)], o.saat, 21)
    case 'ruine': return aus(RUINE, o.saat, 31)
    case 'einsiedler': return aus(EINSIEDLER, o.saat, 41)
    case 'wrack': return `Wrack der „${aus(SCHIFFE, o.saat, 51)}“`
    case 'fischgrund': return aus(FISCH[klima(o.gebiet)], o.saat, 61)
    case 'strudel': return aus(STRUDEL, o.saat, 71)
    case 'treibgut': return 'Treibgut'
    case 'wunder': return 'Naturwunder'      // der richtige Name kommt aus dem Atlas-Inhalt (wunderVon)
  }
}

export const ART_NAME: Record<string, string> = {
  hafen: 'Hafenstadt', dorf: 'Dorf', quelle: 'Proviantstelle', ruine: 'Ruine', wunder: 'Naturwunder', einsiedler: 'Einsiedler',
  wrack: 'Wrack', fischgrund: 'Fischgrund', strudel: 'Strudel', treibgut: 'Treibgut', insel: 'Insel',
}

const INSEL_ADJ = ['Graue', 'Hohe', 'Stille', 'Wilde', 'Grüne', 'Kahle', 'Lange', 'Runde', 'Schiefe', 'Ferne', 'Einsame', 'Windige', 'Schwarze', 'Weiße', 'Goldene', 'Vergessene']
const INSEL_NOMEN = ['Insel', 'Klippe', 'Düne', 'Schäre', 'Bank', 'Kuppe', 'Nadel', 'Sichel', 'Warte', 'Zunge']
const INSEL_TIER = ['Möwen', 'Robben', 'Kormoran', 'Seehund', 'Austern', 'Bernstein', 'Wal', 'Sturm', 'Nebel', 'Muschel', 'Krähen', 'Hummer', 'Reiher', 'Otter', 'Schildkröten', 'Papageien']
const INSEL_ENDE = ['insel', 'oog', 'sand', 'holm', 'riff', 'plate', 'werder', 'eiland', 'kliff', 'grund']

/** Namensvorschlag für eine Insel (der Entdecker darf frei taufen) */
export function inselVorschlag(q: number, r: number, variante = 0): string {
  const saat = streu(q, r, 5151 + variante)
  const form = saat % 5
  if (form === 0) return `${aus(INSEL_ADJ, saat, 1)} ${aus(INSEL_NOMEN, saat, 2)}`
  if (form === 1) return `Kap ${aus(NORD_A, saat, 3)}${aus(['horn', 'huk', 'ness', 'ort'], saat, 4)}`
  if (form === 2) return `Sankt ${aus(['Anna', 'Jakob', 'Brendan', 'Nikolaus', 'Ursula', 'Klemens', 'Marta', 'Olaf'], saat, 5)}`
  return `${aus(INSEL_TIER, saat, 6)}${aus(INSEL_ENDE, saat, 7)}`
}

/** Taufnamen säubern: keine Steuerzeichen, keine Zeilenumbrüche, höchstens 28 Zeichen */
export function saeubereName(roh: string): string {
  return String(roh ?? '').replace(/[\u0000-\u001F\u007F<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28)
}
