// Geographie – die Länderliste des Brain Trainers (von Hand gepflegt und gegengelesen).
// Jede Zeile gehört zu einer Fläche der Karte (geo/welt.json, gleiche Kennung = ISO-3166-Nummer).
//
//   rang     wie bekannt die LAGE einem Erwachsenen in Deutschland ist:
//            1 = kennt jeder (Frankreich, China) … 5 = schwer (Burkina Faso, Kirgisistan)
//   flaeche  amtliche Fläche in 1000 km² (gerundet). Der Test vergleicht sie mit der Fläche auf der Karte.
//   art      Artikel im Deutschen: 'm' der Iran · 'f' die Schweiz · 'n' das Vereinigte Königreich · 'pl' die Niederlande
//   form     nur bei Namen mit Eigenschaftswort: [nach „die/das“, nach „der/des“]
//
// Zuordnung der Erdteile bei Ländern auf zwei Erdteilen (siehe ZWEI_ERDTEILE): Russland und Zypern stehen
// bei Europa, Türkei, Kasachstan und der Kaukasus bei Asien. Mittelamerika und die Karibik zählen zu Nordamerika.

export type Kontinent = 'europa' | 'afrika' | 'asien' | 'nordamerika' | 'suedamerika' | 'ozeanien'
export type Rang = 1 | 2 | 3 | 4 | 5
export type Artikel = 'm' | 'f' | 'n' | 'pl'

export interface Land {
  id: string
  name: string
  hauptstadt: string
  kontinent: Kontinent
  rang: Rang
  /** Fläche in 1000 km² */
  flaeche: number
  art?: Artikel
  form?: [string, string]
}

export const KONTINENTE: Kontinent[] = ['europa', 'asien', 'afrika', 'nordamerika', 'suedamerika', 'ozeanien']
export const KONTINENT_NAME: Record<Kontinent, string> = {
  europa: 'Europa', asien: 'Asien', afrika: 'Afrika', nordamerika: 'Nordamerika', suedamerika: 'Südamerika', ozeanien: 'Australien und Ozeanien',
}

const L = (id: string, name: string, hauptstadt: string, kontinent: Kontinent, rang: Rang, flaeche: number, art?: Artikel, form?: [string, string]): Land =>
  ({ id, name, hauptstadt, kontinent, rang, flaeche, ...(art ? { art } : {}), ...(form ? { form } : {}) })

export const LAENDER: Land[] = [
  // ── Europa (39) ─────────────────────────────────────────────────────────────
  L('008', 'Albanien', 'Tirana', 'europa', 3, 28.7),
  L('112', 'Belarus', 'Minsk', 'europa', 3, 207.6),
  L('056', 'Belgien', 'Brüssel', 'europa', 2, 30.5),
  L('070', 'Bosnien und Herzegowina', 'Sarajevo', 'europa', 3, 51.2),
  L('100', 'Bulgarien', 'Sofia', 'europa', 3, 111.0),
  L('208', 'Dänemark', 'Kopenhagen', 'europa', 1, 43.1),
  L('276', 'Deutschland', 'Berlin', 'europa', 1, 357.6),
  L('233', 'Estland', 'Tallinn', 'europa', 3, 45.3),
  L('246', 'Finnland', 'Helsinki', 'europa', 2, 338.4),
  L('250', 'Frankreich', 'Paris', 'europa', 1, 551.7),
  L('300', 'Griechenland', 'Athen', 'europa', 1, 132.0),
  L('372', 'Irland', 'Dublin', 'europa', 1, 70.3),
  L('352', 'Island', 'Reykjavík', 'europa', 2, 103.0),
  L('380', 'Italien', 'Rom', 'europa', 1, 301.3),
  L('191', 'Kroatien', 'Zagreb', 'europa', 2, 56.6),
  L('428', 'Lettland', 'Riga', 'europa', 3, 64.6),
  L('440', 'Litauen', 'Vilnius', 'europa', 3, 65.3),
  L('442', 'Luxemburg', 'Luxemburg', 'europa', 2, 2.6),
  L('498', 'Republik Moldau', 'Chișinău', 'europa', 4, 33.8, 'f'),
  L('499', 'Montenegro', 'Podgorica', 'europa', 4, 13.8),
  L('528', 'Niederlande', 'Amsterdam', 'europa', 1, 41.5, 'pl'),
  L('807', 'Nordmazedonien', 'Skopje', 'europa', 4, 25.7),
  L('578', 'Norwegen', 'Oslo', 'europa', 1, 385.2),
  L('040', 'Österreich', 'Wien', 'europa', 1, 83.9),
  L('616', 'Polen', 'Warschau', 'europa', 1, 312.7),
  L('620', 'Portugal', 'Lissabon', 'europa', 1, 92.2),
  L('642', 'Rumänien', 'Bukarest', 'europa', 2, 238.4),
  L('643', 'Russland', 'Moskau', 'europa', 1, 17098),
  L('752', 'Schweden', 'Stockholm', 'europa', 1, 447.4),
  L('756', 'Schweiz', 'Bern', 'europa', 1, 41.3, 'f'),
  L('688', 'Serbien', 'Belgrad', 'europa', 3, 77.5),
  L('703', 'Slowakei', 'Bratislava', 'europa', 3, 49.0, 'f'),
  L('705', 'Slowenien', 'Ljubljana', 'europa', 3, 20.3),
  L('724', 'Spanien', 'Madrid', 'europa', 1, 506.0),
  L('203', 'Tschechien', 'Prag', 'europa', 2, 78.9),
  L('804', 'Ukraine', 'Kiew', 'europa', 2, 603.5, 'f'),
  L('348', 'Ungarn', 'Budapest', 'europa', 2, 93.0),
  L('826', 'Vereinigtes Königreich', 'London', 'europa', 1, 243.6, 'n', ['Vereinigte Königreich', 'Vereinigten Königreichs']),
  L('196', 'Zypern', 'Nikosia', 'europa', 3, 9.25),

  // ── Asien (43) ──────────────────────────────────────────────────────────────
  L('004', 'Afghanistan', 'Kabul', 'asien', 3, 652.9),
  L('051', 'Armenien', 'Eriwan', 'asien', 4, 29.7),
  L('031', 'Aserbaidschan', 'Baku', 'asien', 4, 86.6),
  L('050', 'Bangladesch', 'Dhaka', 'asien', 3, 147.6),
  L('064', 'Bhutan', 'Thimphu', 'asien', 4, 38.4),
  L('096', 'Brunei', 'Bandar Seri Begawan', 'asien', 5, 5.8),
  L('156', 'China', 'Peking', 'asien', 1, 9597),
  L('268', 'Georgien', 'Tiflis', 'asien', 3, 69.7),
  L('356', 'Indien', 'Neu-Delhi', 'asien', 1, 3287),
  L('360', 'Indonesien', 'Jakarta', 'asien', 2, 1905),
  L('368', 'Irak', 'Bagdad', 'asien', 2, 438.3, 'm'),
  L('364', 'Iran', 'Teheran', 'asien', 2, 1648, 'm'),
  L('376', 'Israel', 'Jerusalem', 'asien', 2, 22.1),
  L('392', 'Japan', 'Tokio', 'asien', 1, 377.9),
  L('887', 'Jemen', 'Sanaa', 'asien', 3, 528.0, 'm'),
  L('400', 'Jordanien', 'Amman', 'asien', 3, 89.3),
  L('116', 'Kambodscha', 'Phnom Penh', 'asien', 3, 181.0),
  L('398', 'Kasachstan', 'Astana', 'asien', 3, 2725),
  L('634', 'Katar', 'Doha', 'asien', 3, 11.6),
  L('417', 'Kirgisistan', 'Bischkek', 'asien', 5, 199.9),
  L('414', 'Kuwait', 'Kuwait-Stadt', 'asien', 4, 17.8),
  L('418', 'Laos', 'Vientiane', 'asien', 4, 236.8),
  L('422', 'Libanon', 'Beirut', 'asien', 3, 10.5, 'm'),
  L('458', 'Malaysia', 'Kuala Lumpur', 'asien', 3, 330.8),
  L('496', 'Mongolei', 'Ulan-Bator', 'asien', 2, 1564, 'f'),
  L('104', 'Myanmar', 'Naypyidaw', 'asien', 3, 676.6),
  L('524', 'Nepal', 'Kathmandu', 'asien', 3, 147.2),
  L('408', 'Nordkorea', 'Pjöngjang', 'asien', 2, 120.5),
  L('512', 'Oman', 'Maskat', 'asien', 3, 309.5),
  L('626', 'Osttimor', 'Dili', 'asien', 5, 14.9),
  L('586', 'Pakistan', 'Islamabad', 'asien', 3, 796.1),
  L('608', 'Philippinen', 'Manila', 'asien', 3, 300.0, 'pl'),
  L('682', 'Saudi-Arabien', 'Riad', 'asien', 2, 2150),
  L('144', 'Sri Lanka', 'Sri Jayewardenepura Kotte', 'asien', 3, 65.6),
  L('410', 'Südkorea', 'Seoul', 'asien', 2, 100.4),
  L('760', 'Syrien', 'Damaskus', 'asien', 3, 185.2),
  L('762', 'Tadschikistan', 'Duschanbe', 'asien', 5, 143.1),
  L('764', 'Thailand', 'Bangkok', 'asien', 2, 513.1),
  L('792', 'Türkei', 'Ankara', 'asien', 1, 783.6, 'f'),
  L('795', 'Turkmenistan', 'Aschgabat', 'asien', 5, 488.1),
  L('860', 'Usbekistan', 'Taschkent', 'asien', 4, 448.9),
  L('784', 'Vereinigte Arabische Emirate', 'Abu Dhabi', 'asien', 3, 83.6, 'pl', ['Vereinigten Arabischen Emirate', 'Vereinigten Arabischen Emirate']),
  L('704', 'Vietnam', 'Hanoi', 'asien', 2, 331.2),

  // ── Afrika (49) ─────────────────────────────────────────────────────────────
  L('818', 'Ägypten', 'Kairo', 'afrika', 1, 1001.4),
  L('012', 'Algerien', 'Algier', 'afrika', 3, 2381.7),
  L('024', 'Angola', 'Luanda', 'afrika', 4, 1246.7),
  L('226', 'Äquatorialguinea', 'Malabo', 'afrika', 5, 28.1),
  L('231', 'Äthiopien', 'Addis Abeba', 'afrika', 3, 1104.3),
  L('204', 'Benin', 'Porto-Novo', 'afrika', 5, 114.8),
  L('072', 'Botswana', 'Gaborone', 'afrika', 4, 581.7),
  L('854', 'Burkina Faso', 'Ouagadougou', 'afrika', 5, 274.2),
  L('108', 'Burundi', 'Gitega', 'afrika', 5, 27.8),
  L('180', 'Demokratische Republik Kongo', 'Kinshasa', 'afrika', 3, 2344.9, 'f', ['Demokratische Republik Kongo', 'Demokratischen Republik Kongo']),
  L('262', 'Dschibuti', 'Dschibuti', 'afrika', 5, 23.2),
  L('384', 'Elfenbeinküste', 'Yamoussoukro', 'afrika', 4, 322.5, 'f'),
  L('232', 'Eritrea', 'Asmara', 'afrika', 4, 117.6),
  L('748', 'Eswatini', 'Mbabane', 'afrika', 5, 17.4),
  L('266', 'Gabun', 'Libreville', 'afrika', 5, 267.7),
  L('270', 'Gambia', 'Banjul', 'afrika', 5, 11.3),
  L('288', 'Ghana', 'Accra', 'afrika', 4, 238.5),
  L('324', 'Guinea', 'Conakry', 'afrika', 5, 245.9),
  L('624', 'Guinea-Bissau', 'Bissau', 'afrika', 5, 36.1),
  L('120', 'Kamerun', 'Jaunde', 'afrika', 4, 475.4),
  L('404', 'Kenia', 'Nairobi', 'afrika', 2, 580.4),
  L('426', 'Lesotho', 'Maseru', 'afrika', 4, 30.4),
  L('430', 'Liberia', 'Monrovia', 'afrika', 5, 111.4),
  L('434', 'Libyen', 'Tripolis', 'afrika', 2, 1759.5),
  L('450', 'Madagaskar', 'Antananarivo', 'afrika', 2, 587.0),
  L('454', 'Malawi', 'Lilongwe', 'afrika', 5, 118.5),
  L('466', 'Mali', 'Bamako', 'afrika', 4, 1240.2),
  L('504', 'Marokko', 'Rabat', 'afrika', 2, 446.6),
  L('478', 'Mauretanien', 'Nouakchott', 'afrika', 4, 1030.7),
  L('508', 'Mosambik', 'Maputo', 'afrika', 4, 801.6),
  L('516', 'Namibia', 'Windhuk', 'afrika', 3, 824.3),
  L('562', 'Niger', 'Niamey', 'afrika', 4, 1267, 'm'),
  L('566', 'Nigeria', 'Abuja', 'afrika', 3, 923.8),
  L('178', 'Republik Kongo', 'Brazzaville', 'afrika', 4, 342.0, 'f'),
  L('646', 'Ruanda', 'Kigali', 'afrika', 4, 26.3),
  L('894', 'Sambia', 'Lusaka', 'afrika', 4, 752.6),
  L('686', 'Senegal', 'Dakar', 'afrika', 4, 196.7, 'm'),
  L('694', 'Sierra Leone', 'Freetown', 'afrika', 5, 71.7),
  L('716', 'Simbabwe', 'Harare', 'afrika', 4, 390.8),
  L('706', 'Somalia', 'Mogadischu', 'afrika', 3, 637.7),
  L('710', 'Südafrika', 'Pretoria', 'afrika', 1, 1221),
  L('729', 'Sudan', 'Khartum', 'afrika', 3, 1861.5, 'm'),
  L('728', 'Südsudan', 'Juba', 'afrika', 4, 644.3, 'm'),
  L('834', 'Tansania', 'Dodoma', 'afrika', 3, 945.1),
  L('768', 'Togo', 'Lomé', 'afrika', 5, 56.8),
  L('148', 'Tschad', 'N’Djamena', 'afrika', 4, 1284, 'm'),
  L('788', 'Tunesien', 'Tunis', 'afrika', 2, 163.6),
  L('800', 'Uganda', 'Kampala', 'afrika', 4, 241.0),
  L('140', 'Zentralafrikanische Republik', 'Bangui', 'afrika', 5, 623.0, 'f', ['Zentralafrikanische Republik', 'Zentralafrikanischen Republik']),

  // ── Nordamerika mit Mittelamerika und Karibik (16) ──────────────────────────
  L('044', 'Bahamas', 'Nassau', 'nordamerika', 3, 13.9, 'pl'),
  L('084', 'Belize', 'Belmopan', 'nordamerika', 5, 23.0),
  L('188', 'Costa Rica', 'San José', 'nordamerika', 3, 51.1),
  L('214', 'Dominikanische Republik', 'Santo Domingo', 'nordamerika', 3, 48.7, 'f', ['Dominikanische Republik', 'Dominikanischen Republik']),
  L('222', 'El Salvador', 'San Salvador', 'nordamerika', 5, 21.0),
  L('320', 'Guatemala', 'Guatemala-Stadt', 'nordamerika', 4, 108.9),
  L('332', 'Haiti', 'Port-au-Prince', 'nordamerika', 3, 27.8),
  L('340', 'Honduras', 'Tegucigalpa', 'nordamerika', 4, 112.5),
  L('388', 'Jamaika', 'Kingston', 'nordamerika', 3, 11.0),
  L('124', 'Kanada', 'Ottawa', 'nordamerika', 1, 9985),
  L('192', 'Kuba', 'Havanna', 'nordamerika', 2, 109.9),
  L('484', 'Mexiko', 'Mexiko-Stadt', 'nordamerika', 1, 1964.4),
  L('558', 'Nicaragua', 'Managua', 'nordamerika', 4, 130.4),
  L('591', 'Panama', 'Panama-Stadt', 'nordamerika', 3, 75.4),
  L('780', 'Trinidad und Tobago', 'Port of Spain', 'nordamerika', 5, 5.1),
  L('840', 'Vereinigte Staaten', 'Washington, D.C.', 'nordamerika', 1, 9834, 'pl', ['Vereinigten Staaten', 'Vereinigten Staaten']),

  // ── Südamerika (12) ─────────────────────────────────────────────────────────
  L('032', 'Argentinien', 'Buenos Aires', 'suedamerika', 2, 2780.4),
  L('068', 'Bolivien', 'Sucre', 'suedamerika', 3, 1098.6),
  L('076', 'Brasilien', 'Brasília', 'suedamerika', 1, 8515.8),
  L('152', 'Chile', 'Santiago', 'suedamerika', 2, 756.1),
  L('218', 'Ecuador', 'Quito', 'suedamerika', 3, 256.4),
  L('328', 'Guyana', 'Georgetown', 'suedamerika', 5, 215.0),
  L('170', 'Kolumbien', 'Bogotá', 'suedamerika', 2, 1141.7),
  L('600', 'Paraguay', 'Asunción', 'suedamerika', 3, 406.8),
  L('604', 'Peru', 'Lima', 'suedamerika', 2, 1285.2),
  L('740', 'Suriname', 'Paramaribo', 'suedamerika', 5, 163.8),
  L('858', 'Uruguay', 'Montevideo', 'suedamerika', 3, 176.2),
  L('862', 'Venezuela', 'Caracas', 'suedamerika', 2, 916.4),

  // ── Australien und Ozeanien (6) ─────────────────────────────────────────────
  L('036', 'Australien', 'Canberra', 'ozeanien', 1, 7692),
  L('242', 'Fidschi', 'Suva', 'ozeanien', 4, 18.3),
  L('554', 'Neuseeland', 'Wellington', 'ozeanien', 2, 268.0),
  L('598', 'Papua-Neuguinea', 'Port Moresby', 'ozeanien', 3, 462.8),
  L('090', 'Salomonen', 'Honiara', 'ozeanien', 5, 28.4, 'pl'),
  L('548', 'Vanuatu', 'Port Vila', 'ozeanien', 5, 12.2),
]

/**
 * Flächen der Karte, die NIE abgefragt und nie als Auswahl angeboten werden. Sie sind gezeichnet und
 * anklickbar wie alles andere; ein Klick darauf wird nicht gewertet. Die Karte zeigt sie so, wie die
 * Kartendaten (Natural Earth) sie führen – ohne Wertung.
 *   'status'  = Status völkerrechtlich umstritten
 *   'gebiet'  = abhängiges Gebiet bzw. Landesteil in Übersee, kein eigener Staat
 */
export interface Gebiet { id: string; name: string; grund: 'status' | 'gebiet' }
export const OHNE_QUIZ: Gebiet[] = [
  { id: 'kosovo', name: 'Kosovo', grund: 'status' },
  { id: 'krim', name: 'Krim', grund: 'status' },
  { id: 'nordzypern', name: 'Nordzypern', grund: 'status' },
  { id: '275', name: 'Palästina', grund: 'status' },
  { id: 'somaliland', name: 'Somaliland', grund: 'status' },
  { id: '158', name: 'Taiwan', grund: 'status' },
  { id: '732', name: 'Westsahara', grund: 'status' },
  { id: '238', name: 'Falklandinseln', grund: 'gebiet' },
  { id: 'guayana', name: 'Französisch-Guayana', grund: 'gebiet' },
  { id: '260', name: 'Französische Süd- und Antarktisgebiete', grund: 'gebiet' },
  { id: '304', name: 'Grönland', grund: 'gebiet' },
  { id: '540', name: 'Neukaledonien', grund: 'gebiet' },
  { id: '630', name: 'Puerto Rico', grund: 'gebiet' },
]
export const OHNE_QUIZ_IDS: ReadonlySet<string> = new Set(OHNE_QUIZ.map(g => g.id))

/**
 * Länder, nach deren Hauptstadt NICHT gefragt wird (und die auch nicht als falsche Auswahl dienen):
 * die Antwort wäre strittig oder steht schon im Namen.
 */
export const OHNE_HAUPTSTADTFRAGE: Record<string, string> = {
  '710': 'Südafrika hat drei Hauptstädte (Pretoria, Kapstadt, Bloemfontein).',
  '068': 'Bolivien: Sucre ist die Hauptstadt laut Verfassung, die Regierung sitzt in La Paz.',
  '376': 'Israel: Der Status Jerusalems ist international umstritten.',
  '144': 'Sri Lanka: Sri Jayewardenepura Kotte ist Hauptstadt, Colombo Regierungssitz.',
  '748': 'Eswatini hat zwei Hauptstädte (Mbabane und Lobamba).',
  '108': 'Burundi: Der Umzug von Bujumbura nach Gitega läuft seit 2019.',
  '360': 'Indonesien: Der Umzug von Jakarta nach Nusantara läuft.',
  '226': 'Äquatorialguinea verlegt die Hauptstadt von Malabo nach Ciudad de la Paz.',
  '887': 'Jemen: Sanaa ist Hauptstadt laut Verfassung, die anerkannte Regierung sitzt in Aden.',
  '442': 'Luxemburg: Hauptstadt und Land heißen gleich.',
  '262': 'Dschibuti: Hauptstadt und Land heißen gleich.',
  '484': 'Mexiko-Stadt: der Landesname steht in der Antwort.',
  '320': 'Guatemala-Stadt: der Landesname steht in der Antwort.',
  '591': 'Panama-Stadt: der Landesname steht in der Antwort.',
  '414': 'Kuwait-Stadt: der Landesname steht in der Antwort.',
  '624': 'Guinea-Bissau: die Hauptstadt Bissau steht im Landesnamen.',
}

/**
 * Länder auf zwei Erdteilen oder mit strittiger Zuordnung – nach ihrem Erdteil wird nicht gefragt.
 * (Ägypten: Sinai · Indonesien: Neuguinea · Panama und Trinidad: Grenze Nord-/Südamerika)
 */
export const ZWEI_ERDTEILE: ReadonlySet<string> = new Set(['643', '792', '398', '268', '051', '031', '196', '818', '360', '591', '780'])

// ── Nachschlagen ──────────────────────────────────────────────────────────────
const NACH_ID = new Map(LAENDER.map(l => [l.id, l]))
const GEBIET_NACH_ID = new Map(OHNE_QUIZ.map(g => [g.id, g]))

/** Quiz-Land zur Kennung (undefined bei Flächen ohne Quiz) */
export const land = (id: string): Land | undefined => NACH_ID.get(id)
export const istQuizLand = (id: string): boolean => NACH_ID.has(id)
/** Name jeder Fläche der Karte, auch der Gebiete ohne Quiz */
export const nameVon = (id: string): string => NACH_ID.get(id)?.name ?? GEBIET_NACH_ID.get(id)?.name ?? ''
export const laenderVon = (kontinent: Kontinent): Land[] => LAENDER.filter(l => l.kontinent === kontinent)
/** Länder mit Rang von..bis (beide eingeschlossen), auf Wunsch nur eines Erdteils */
export const laenderMitRang = (von: number, bis: number, kontinent?: Kontinent): Land[] =>
  LAENDER.filter(l => l.rang >= von && l.rang <= bis && (!kontinent || l.kontinent === kontinent))
export const hauptstadtFragbar = (l: Land): boolean => !(l.id in OHNE_HAUPTSTADTFRAGE)

// ── Sprache: Artikel und Fälle ────────────────────────────────────────────────
export const istMehrzahl = (l: Land): boolean => l.art === 'pl'
/** „die Schweiz“, „die Niederlande“, „das Vereinigte Königreich“, „Frankreich“ */
export function mitArtikel(l: Land): string {
  if (!l.art) return l.name
  return `${l.art === 'm' ? 'der' : l.art === 'n' ? 'das' : 'die'} ${l.form?.[0] ?? l.name}`
}
/** 4. Fall, z. B. nach „grenzt an“: „den Iran“, „die Schweiz“, „Frankreich“ */
export function imAkkusativ(l: Land): string {
  if (!l.art) return l.name
  return `${l.art === 'm' ? 'den' : l.art === 'n' ? 'das' : 'die'} ${l.form?.[0] ?? l.name}`
}
/** Zugehörigkeit: „der Schweiz“, „des Iran“, „der Niederlande“, sonst „von Frankreich“ */
export function imGenitiv(l: Land): string {
  if (!l.art) return `von ${l.name}`
  return `${l.art === 'm' || l.art === 'n' ? 'des' : 'der'} ${l.form?.[1] ?? l.name}`
}
/** Satzanfang groß: „Die Schweiz“, „Frankreich“ */
export const gross = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)
/** „A, B und C“ */
export function aufzaehlung(teile: string[]): string {
  if (teile.length <= 1) return teile[0] ?? ''
  return `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]}`
}
