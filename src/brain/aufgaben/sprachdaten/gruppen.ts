// Wortgruppen für „Was passt nicht?“ und „Welcher Oberbegriff passt?“ — selbst zusammengestellt.
//
// Jede Gruppe: Kennung, Lage t (1 = Alltagswörter … 3 = Fachwissen nötig), Sachgebiet (feld), Oberbegriff (name,
// so geschrieben, dass er in „… sind <name>“ passt), Einzahl mit Artikel (ein), mindestens acht Mitglieder
// (gängige zuerst) und ein bis zwei NAHE Gruppen (nah).
//
// Regeln, auf die sich der Generator verlässt:
//  • „Weit weg“ heißt: anderes Sachgebiet. Gruppen aus verschiedenen Sachgebieten überschneiden sich nie.
//    Mehrdeutige Wörter (z. B. „Orange“ = Obst UND Farbe) stehen hinter dem „/“: Sie werden gezeigt, wenn ihre
//    eigene Gruppe gefragt ist, aber nie als fremdes Wort in eine weit entfernte Gruppe gemischt.
//  • nah: [N] bei Gruppe G heißt: KEIN Mitglied von N gehört zu G (von Hand geprüft, Richtung beachten!).
//    Dann darf ein Wort aus N das fremde Wort unter Wörtern aus G sein, und G-Wörtern darf der Oberbegriff von
//    jeder Gruppe, die G als nah nennt, als falsche Antwort angeboten werden.
//  • Ein „!“ hinter einer nahen Gruppe heißt ENG: Die beiden trennt nur ein Merkmal, das man wissen muss
//    (Reptilien – Amphibien, Edelsteine – Gesteine). Ab Stufe 6 werden nur noch enge Paare gefragt, und zwar mit den
//    weniger geläufigen Wörtern (den hinteren der Liste). Nahe Paare ohne „!“ sind leicht zu trennen
//    (Möbel – Küchengeräte, Handwerksberufe – Verwandte) und kommen nur auf den unteren Stufen vor.
//  • falle: Mitglieder, die so aussehen, als gehörten sie zur genannten Nachbargruppe (Wal → Fische).
//  • merk: das unterscheidende Merkmal in einem Satz (für die Erklärung).
import type { Lage } from './analogien'

export interface Gruppe {
  id: string
  t: Lage
  feld: string
  name: string
  ein: string
  /** alle Mitglieder */
  w: string[]
  /** die ersten `klar` Mitglieder sind eindeutig (dürfen als fremdes Wort in weit entfernte Gruppen) */
  klar: number
  /** alle nahen Gruppen */
  nah: string[]
  /** davon die ENGEN (in der Liste mit „!“): Hier braucht man Fachwissen, um das fremde Wort zu erkennen */
  eng: string[]
  falle?: Record<string, string[]>
  merk?: string
}

const Gr = (id: string, t: Lage, feld: string, name: string, ein: string, woerter: string, nah: string, extra: { falle?: Record<string, string>; merk?: string } = {}): Gruppe => {
  const [vorn, hinten = ''] = woerter.split('/')
  const klar = vorn.trim().split(/\s+/)
  const rest = hinten.trim() ? hinten.trim().split(/\s+/) : []
  const falle: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(extra.falle ?? {})) falle[k] = v.split(' ')
  return { id, t, feld, name, ein, w: [...klar, ...rest], klar: klar.length, nah: nah.replace(/!/g, '').split(' '), eng: nah.split(' ').filter(x => x.endsWith('!')).map(x => x.slice(0, -1)), falle: extra.falle ? falle : undefined, merk: extra.merk }
}

export const GRUPPEN: Gruppe[] = [
  // ── Tiere ──────────────────────────────────────────────────────────────────
  Gr('saeuger', 2, 'tier', 'Säugetiere', 'ein Säugetier', 'Hund Katze Pferd Kuh Elefant Löwe Hase Wolf Wal Delfin Robbe Fledermaus', 'fische! voegel',
    { falle: { fische: 'Wal Delfin Robbe', voegel: 'Fledermaus' }, merk: 'Säugetiere säugen ihre Jungen und atmen mit Lungen – auch die im Wasser und in der Luft.' }),
  Gr('voegel', 1, 'tier', 'Vögel', 'ein Vogel', 'Amsel Adler Taube Spatz Schwalbe Storch Eule Möwe Specht Papagei Pinguin', 'saeuger! insekten',
    { falle: { saeuger: 'Pinguin' }, merk: 'Vögel haben Federn und legen Eier – auch der Pinguin, der nicht fliegt.' }),
  Gr('fische', 1, 'tier', 'Fische', 'ein Fisch', 'Hering Forelle Karpfen Hecht Lachs Aal Thunfisch Dorsch Makrele Hai', 'saeuger! amphibien!',
    { merk: 'Fische atmen mit Kiemen.' }),
  Gr('reptilien', 3, 'tier', 'Reptilien', 'ein Reptil', 'Eidechse Krokodil Schildkröte Schlange Leguan Chamäleon Gecko Kobra Natter Waran', 'amphibien!',
    { merk: 'Reptilien haben eine trockene, schuppige Haut.' }),
  Gr('amphibien', 3, 'tier', 'Amphibien', 'eine Amphibie', 'Frosch Kröte Molch Salamander Unke Laubfrosch Olm Axolotl', 'reptilien! fische',
    { falle: { fische: 'Olm Axolotl Molch' }, merk: 'Amphibien haben eine feuchte Haut und wachsen als Larven im Wasser heran.' }),
  Gr('insekten', 2, 'tier', 'Insekten', 'ein Insekt', 'Ameise Biene Wespe Libelle Mücke Heuschrecke Schmetterling Hummel Floh Grille / Käfer', 'spinnentiere!',
    { falle: { spinnentiere: 'Floh Ameise Grille Käfer' }, merk: 'Insekten haben sechs Beine.' }),
  Gr('spinnentiere', 3, 'tier', 'Spinnentiere', 'ein Spinnentier', 'Kreuzspinne Vogelspinne Wolfsspinne Tarantel Skorpion Zecke Milbe Weberknecht', 'insekten!',
    { falle: { insekten: 'Zecke Milbe Weberknecht' }, merk: 'Spinnentiere haben acht Beine.' }),

  // ── Pflanzen und was auf dem Feld wächst ───────────────────────────────────
  Gr('blumen', 1, 'pflanze', 'Blumen', 'eine Blume', 'Rose Tulpe Nelke Lilie Veilchen Narzisse Sonnenblume Dahlie Orchidee Krokus', 'laubbaeume kraeuter'),
  Gr('laubbaeume', 2, 'pflanze', 'Laubbäume', 'ein Laubbaum', 'Eiche Buche Birke Ahorn Linde Pappel Erle Ulme Esche / Kastanie Weide', 'nadelbaeume!',
    { merk: 'Laubbäume tragen Blätter.' }),
  Gr('nadelbaeume', 3, 'pflanze', 'Nadelbäume', 'ein Nadelbaum', 'Fichte Tanne Lärche Zeder Eibe Zypresse Douglasie Pinie Mammutbaum', 'laubbaeume!',
    { merk: 'Nadelbäume tragen Nadeln.' }),
  Gr('getreide', 2, 'pflanze', 'Getreidearten', 'eine Getreideart', 'Weizen Roggen Gerste Hafer Reis Hirse Dinkel / Mais', 'gemuese'),
  Gr('kraeuter', 2, 'pflanze', 'Küchenkräuter', 'ein Küchenkraut', 'Petersilie Schnittlauch Basilikum Dill Thymian Rosmarin Salbei Majoran Oregano Kresse', 'gemuese blumen'),
  Gr('obst', 1, 'pflanze', 'Obstsorten', 'eine Obstsorte', 'Apfel Birne Kirsche Pflaume Banane Pfirsich Aprikose Zitrone Mango Ananas / Orange', 'gemuese'),
  Gr('gemuese', 1, 'pflanze', 'Gemüsesorten', 'eine Gemüsesorte', 'Karotte Kohlrabi Lauch Spinat Zwiebel Rettich Blumenkohl Brokkoli Rosenkohl Radieschen Spargel', 'obst'),

  // ── Essen und Trinken ──────────────────────────────────────────────────────
  Gr('getraenke', 1, 'essen', 'Getränke', 'ein Getränk', 'Tee Kaffee Saft Limonade Kakao Schorle Mineralwasser Brause', 'backwaren'),
  Gr('backwaren', 1, 'essen', 'Backwaren', 'eine Backware', 'Brot Brötchen Brezel Zwieback Toast Baguette Knäckebrot Fladenbrot Hörnchen Laugenstange', 'suesses getraenke'),
  Gr('suesses', 1, 'essen', 'Süßigkeiten', 'eine Süßigkeit', 'Bonbon Schokolade Lakritz Marzipan Praline Lutscher Karamell Nougat Gummibärchen Kaugummi', 'backwaren'),

  // ── Haus ───────────────────────────────────────────────────────────────────
  Gr('moebel', 1, 'haus', 'Möbel', 'ein Möbelstück', 'Tisch Stuhl Schrank Bett Sofa Regal Sessel Kommode Hocker Truhe', 'kuechen gebaeude'),
  Gr('gebaeude', 1, 'haus', 'Gebäude', 'ein Gebäude', 'Rathaus Scheune Bahnhof Hütte Villa Fabrik Burg Museum Schule Hotel', 'moebel'),

  // ── Geräte ─────────────────────────────────────────────────────────────────
  Gr('kuechen', 1, 'geraet', 'Küchengeräte', 'ein Küchengerät', 'Topf Pfanne Sieb Schneebesen Reibe Nudelholz Kochlöffel Schöpfkelle Backblech Trichter', 'moebel'),
  Gr('werkzeuge', 1, 'geraet', 'Werkzeuge', 'ein Werkzeug', 'Hammer Zange Säge Bohrer Feile Meißel Schraubenzieher Axt Schraubenschlüssel Hobel', 'kuechen'),

  // ── Kleidung und Schmuck ───────────────────────────────────────────────────
  Gr('kleidung', 1, 'kleid', 'Kleidungsstücke', 'ein Kleidungsstück', 'Hose Hemd Jacke Mantel Pullover Bluse Kleid Weste Socke / Rock', 'schmuck'),
  Gr('schmuck', 2, 'kleid', 'Schmuckstücke', 'ein Schmuckstück', 'Kette Armband Brosche Ohrring Diadem Armreif Collier Medaillon Halskette / Ring', 'edelsteine kleidung'),

  // ── Fahrzeuge ──────────────────────────────────────────────────────────────
  Gr('land', 1, 'fahrzeug', 'Landfahrzeuge', 'ein Landfahrzeug', 'Auto Bus Fahrrad Motorrad Lastwagen Traktor Straßenbahn Roller Kutsche Moped', 'wasser'),
  Gr('wasser', 2, 'fahrzeug', 'Wasserfahrzeuge', 'ein Wasserfahrzeug', 'Kahn Fähre Floß Kanu Jacht Segelboot Dampfer Tanker Kajak Ruderboot', 'land'),

  // ── Musikinstrumente ───────────────────────────────────────────────────────
  Gr('saiten', 2, 'musik', 'Saiteninstrumente', 'ein Saiteninstrument', 'Geige Gitarre Cello Harfe Bratsche Kontrabass Laute Mandoline Zither Banjo', 'blas! schlag!',
    { merk: 'Bei Saiteninstrumenten schwingen Saiten.' }),
  Gr('blas', 2, 'musik', 'Blasinstrumente', 'ein Blasinstrument', 'Flöte Trompete Blockflöte Posaune Klarinette Saxofon Tuba Oboe Fagott Dudelsack', 'saiten! schlag!',
    { merk: 'Bei Blasinstrumenten schwingt die Luft, die man hineinbläst.' }),
  Gr('schlag', 2, 'musik', 'Schlaginstrumente', 'ein Schlaginstrument', 'Trommel Pauke Schlagzeug Rassel Gong Xylofon Tamburin Kastagnetten Glockenspiel / Triangel', 'saiten! blas!',
    { merk: 'Schlaginstrumente werden geschlagen oder geschüttelt.' }),

  // ── Kunst ──────────────────────────────────────────────────────────────────
  Gr('taenze', 2, 'kunst', 'Tänze', 'ein Tanz', 'Walzer Tango Polka Foxtrott Samba Rumba Polonaise Mazurka Menuett Flamenco', 'musikwerke!'),
  Gr('musikwerke', 3, 'kunst', 'Musikgattungen', 'eine Musikgattung', 'Sinfonie Sonate Oper Arie Ouvertüre Fuge Serenade Operette Kantate Oratorium', 'literatur!'),
  Gr('literatur', 3, 'kunst', 'Literaturgattungen', 'eine Literaturgattung', 'Roman Märchen Kurzgeschichte Fabel Komödie Drama Sage Novelle Epos Sonett', 'musikwerke!'),

  // ── Stoffe der Natur ───────────────────────────────────────────────────────
  Gr('edelsteine', 3, 'stoff', 'Edelsteine', 'ein Edelstein', 'Diamant Rubin Smaragd Saphir Opal Topas Amethyst Granat Aquamarin Turmalin', 'gesteine! metalle',
    { merk: 'Edelsteine sind seltene, besonders schöne und harte Minerale.' }),
  Gr('metalle', 2, 'stoff', 'Metalle', 'ein Metall', 'Eisen Kupfer Zink Zinn Blei Aluminium Nickel Platin Natrium Quecksilber / Gold Silber', 'gase gesteine',
    { falle: { gase: 'Natrium Quecksilber' }, merk: 'Metalle glänzen und leiten Strom – auch das weiche Natrium und das flüssige Quecksilber.' }),
  Gr('gase', 3, 'stoff', 'Gase', 'ein Gas', 'Sauerstoff Stickstoff Wasserstoff Helium Neon Argon Methan Ozon Kohlendioxid Chlor', 'metalle!'),
  Gr('gesteine', 3, 'stoff', 'Gesteine', 'ein Gestein', 'Sandstein Kalkstein Granit Marmor Schiefer Basalt Gneis Tuff Porphyr Quarzit', 'edelsteine! metalle',
    { merk: 'Gesteine sind Gemenge aus Mineralen und bauen die Erdkruste auf.' }),

  // ── Natur und Erde ─────────────────────────────────────────────────────────
  Gr('gewaesser', 1, 'natur', 'Gewässer', 'ein Gewässer', 'Fluss See Bach Teich Meer Ozean Tümpel Weiher Lagune / Strom', 'landformen'),
  Gr('landformen', 2, 'natur', 'Landschaftsformen', 'eine Landschaftsform', 'Berg Tal Hügel Schlucht Düne Klippe Hochebene Senke Kuppe / Ebene', 'gewaesser'),
  Gr('wetter', 1, 'natur', 'Wettererscheinungen', 'eine Wettererscheinung', 'Regen Schnee Hagel Sturm Gewitter Frost Graupel Wind Dunst / Tau', 'himmel'),
  Gr('himmel', 1, 'natur', 'Himmelskörper', 'ein Himmelskörper', 'Mond Venus Jupiter Saturn Komet Neptun Asteroid Uranus / Mars Merkur', 'wetter'),
  Gr('fluesse', 2, 'natur', 'Flüsse', 'ein Fluss', 'Rhein Donau Elbe Nil Amazonas Themse Seine Wolga Mosel Weser', 'staedte'),

  // ── Farben und Formen ──────────────────────────────────────────────────────
  Gr('farben', 1, 'form', 'Farben', 'eine Farbe', 'Rot Blau Grün Gelb Schwarz Weiß Braun Lila Rosa Grau Violett', 'flaechen'),
  Gr('flaechen', 2, 'form', 'ebene Figuren', 'eine ebene Figur', 'Kreis Quadrat Dreieck Rechteck Oval Trapez Ellipse Sechseck Parallelogramm / Raute', 'koerper! farben',
    { merk: 'Ebene Figuren sind flach – sie haben keine Tiefe.' }),
  Gr('koerper', 3, 'form', 'geometrische Körper', 'ein geometrischer Körper', 'Würfel Kugel Kegel Quader Prisma Tetraeder Oktaeder Halbkugel / Pyramide Zylinder', 'flaechen!',
    { falle: { flaechen: 'Tetraeder Oktaeder Prisma' }, merk: 'Geometrische Körper sind räumlich – sie haben Länge, Breite und Höhe.' }),

  // ── Der Körper ─────────────────────────────────────────────────────────────
  Gr('aussen', 1, 'koerper', 'äußere Körperteile', 'ein äußerer Körperteil', 'Arm Bein Hand Knie Schulter Finger Ellbogen Nase Ohr / Fuß', 'organe'),
  Gr('organe', 2, 'koerper', 'innere Organe', 'ein inneres Organ', 'Herz Lunge Leber Niere Magen Darm Milz Gehirn Gallenblase Bauchspeicheldrüse', 'aussen'),

  // ── Menschen ───────────────────────────────────────────────────────────────
  Gr('handwerk', 2, 'mensch', 'Handwerksberufe', 'ein Handwerksberuf', 'Bäcker Tischler Maurer Schlosser Schuster Dachdecker Klempner Zimmermann Glaser Optiker Uhrmacher Goldschmied Konditor / Schneider', 'akademisch! verwandte',
    { merk: 'Ein Handwerk erlernt man in einer Lehre – auch Optiker, Uhrmacher und Goldschmiede sind Handwerker.' }),
  Gr('akademisch', 2, 'mensch', 'akademische Berufe', 'ein akademischer Beruf', 'Arzt Richter Lehrer Anwalt Zahnarzt Apotheker Notar Architekt Ingenieur Tierarzt', 'handwerk!',
    { falle: { handwerk: 'Architekt Ingenieur' }, merk: 'Für einen akademischen Beruf braucht man ein Studium.' }),
  Gr('verwandte', 1, 'mensch', 'Verwandte', 'eine Bezeichnung für Verwandte', 'Vater Bruder Schwester Onkel Tante Cousin Nichte Neffe Enkel Großmutter / Mutter', 'handwerk'),
  Gr('gefuehle', 3, 'mensch', 'Gefühle', 'ein Gefühl', 'Freude Angst Wut Trauer Scham Ekel Sehnsucht Heimweh Furcht Kummer Wehmut', 'eigenschaften!',
    { merk: 'Ein Gefühl kommt und geht.' }),
  Gr('eigenschaften', 3, 'mensch', 'Charaktereigenschaften', 'eine Charaktereigenschaft', 'Ehrlichkeit Höflichkeit Pünktlichkeit Bescheidenheit Sparsamkeit Großzügigkeit Geduld Fleiß Treue Geiz Ehrgeiz Sanftmut', 'gefuehle!',
    { merk: 'Eine Charaktereigenschaft ist ein bleibender Wesenszug.' }),

  // ── Sport ──────────────────────────────────────────────────────────────────
  Gr('ballsport', 1, 'sport', 'Ballsportarten', 'eine Ballsportart', 'Fußball Handball Basketball Volleyball Tennis Rugby Tischtennis Wasserball Faustball / Golf', 'wintersport'),
  Gr('wintersport', 2, 'sport', 'Wintersportarten', 'eine Wintersportart', 'Rodeln Biathlon Skispringen Eiskunstlauf Curling Bobfahren Skilanglauf Eisschnelllauf', 'ballsport'),

  // ── Länder und Sprachen ────────────────────────────────────────────────────
  Gr('sprachen', 1, 'geo', 'Sprachen', 'eine Sprache', 'Deutsch Englisch Spanisch Französisch Italienisch Russisch Polnisch Türkisch Arabisch Chinesisch Japanisch', 'laender'),
  Gr('laender', 1, 'geo', 'Länder', 'ein Land', 'Frankreich Spanien Italien Polen Schweden Brasilien Kanada Japan Indien Ägypten', 'staedte sprachen'),
  Gr('staedte', 1, 'geo', 'Städte', 'eine Stadt', 'Berlin Paris Rom Wien Madrid London Prag Oslo Athen Lissabon', 'laender fluesse'),

  // ── Maße ───────────────────────────────────────────────────────────────────
  Gr('zeit', 1, 'mass', 'Zeiteinheiten', 'eine Zeiteinheit', 'Sekunde Minute Stunde Tag Woche Monat Jahr Jahrzehnt Jahrhundert Jahrtausend', 'laengen'),
  Gr('laengen', 2, 'mass', 'Längenmaße', 'ein Längenmaß', 'Meter Kilometer Zentimeter Millimeter Meile Zoll Seemeile Dezimeter Lichtjahr', 'zeit!',
    { falle: { zeit: 'Lichtjahr' }, merk: 'Längenmaße messen Strecken – auch das Lichtjahr: die Strecke, die das Licht in einem Jahr zurücklegt.' }),
]

/**
 * Oberbegriffe, die für die Wörter einer Gruppe NIE als falsche Antwort angeboten werden, weil sie sich
 * vertreten ließen (weiter gefasster oder sich überschneidender Begriff). Schlüssel: Gruppe der gezeigten Wörter.
 * Beispiel: Rhein, Donau, Elbe und Nil sind Flüsse – aber eben auch Gewässer.
 */
export const NIE_ALS_OBERBEGRIFF: Record<string, string[]> = {
  kuechen: ['werkzeuge'],
  kraeuter: ['gemuese'],
  obst: ['laubbaeume'],
  taenze: ['musikwerke'],
  edelsteine: ['gesteine', 'schmuck'],
  fluesse: ['gewaesser'],
}
