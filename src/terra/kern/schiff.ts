// Terra Incognita — Schiffsklassen, Ausbauten und Offiziere; daraus die Werte, mit denen gerechnet wird.

export interface Klasse {
  id: number
  name: string
  preis: number
  /** Proviant in Tagen */
  proviant: number
  laderaum: number
  sicht: number
  /** Tempo in Prozent (100 = Grundtempo) */
  tempo: number
  rumpf: number
  /** Plätze für Ausbauten */
  plaetze: number
  /** Plätze für Offiziere */
  offiziere: number
  /** im Gefecht: Kanonen je Breitseite, Mannschaft, Bewegungspunkte bei frischer Brise */
  kanonen: number
  crew: number
  fahrt: number
  text: string
}

export const KLASSEN: readonly Klasse[] = [
  { id: 0, name: 'Jolle', preis: 0, proviant: 8, laderaum: 4, sicht: 2, tempo: 100, rumpf: 10, plaetze: 2, offiziere: 1, kanonen: 1, crew: 4, fahrt: 3, text: 'Ein offenes Boot mit einem Mast. Für die Heimatsee reicht es.' },
  { id: 1, name: 'Kutter', preis: 800, proviant: 12, laderaum: 8, sicht: 2, tempo: 105, rumpf: 16, plaetze: 3, offiziere: 2, kanonen: 2, crew: 8, fahrt: 4, text: 'Gedeckt, seetüchtig, mit Platz für die erste richtige Ladung.' },
  { id: 2, name: 'Schoner', preis: 3200, proviant: 16, laderaum: 12, sicht: 3, tempo: 120, rumpf: 24, plaetze: 4, offiziere: 2, kanonen: 4, crew: 14, fahrt: 5, text: 'Zwei Masten, schnell am Wind. Das Schiff der Entdecker.' },
  { id: 3, name: 'Brigg', preis: 11500, proviant: 22, laderaum: 20, sicht: 3, tempo: 115, rumpf: 36, plaetze: 5, offiziere: 3, kanonen: 6, crew: 24, fahrt: 4, text: 'Rahsegel und ein tiefer Bauch: weit hinaus und voll zurück.' },
  { id: 4, name: 'Fregatte', preis: 32000, proviant: 28, laderaum: 26, sicht: 3, tempo: 130, rumpf: 50, plaetze: 6, offiziere: 4, kanonen: 10, crew: 40, fahrt: 5, text: 'Drei Masten, schnell und stark. Kein Meer ist ihr zu weit.' },
  { id: 5, name: 'Ostindienfahrer', preis: 64000, proviant: 38, laderaum: 44, sicht: 3, tempo: 110, rumpf: 60, plaetze: 6, offiziere: 4, kanonen: 8, crew: 30, fahrt: 3, text: 'Ein schwimmendes Lagerhaus. Langsam, aber jede Fahrt ein Vermögen.' },
  { id: 6, name: 'Entdeckerschiff', preis: 150000, proviant: 50, laderaum: 30, sicht: 4, tempo: 140, rumpf: 55, plaetze: 8, offiziere: 5, kanonen: 6, crew: 26, fahrt: 5, text: 'Gebaut für den Rand der Welt: schnell, ausdauernd, mit dem besten Ausguck.' },
]

export interface Ausbau { id: string; name: string; preis: number; text: string; abKlasse?: number; kampf?: boolean }
// (Ausbauten werden nur über ihre Kennung gesucht — neue Einträge verschieben nichts)
export const AUSBAUTEN: readonly Ausbau[] = [
  { id: 'kraehennest', name: 'Krähennest', preis: 300, text: 'Ein Ausguck im Masttopp: ein Feld mehr Sicht.' },
  { id: 'beiboot', name: 'Beiboot', preis: 450, text: 'Mit dem Beiboot an Land: Quellen und Funde bringen mehr.' },
  { id: 'poekel', name: 'Pökelfässer', preis: 800, text: 'Haltbarer Proviant: ein Viertel mehr Vorrat.' },
  { id: 'lot', name: 'Lot', preis: 900, text: 'Mit dem Lot tastet man sich durch Riffe. Ohne Lot sind sie unpassierbar.' },
  { id: 'laterne', name: 'Sturmlaterne', preis: 1200, text: 'Volle Sicht auch in den Nebelbänken. Ohne sie sieht man dort zwei Felder weniger weit.' },
  { id: 'zusatzraum', name: 'Zwischendeck', preis: 1400, text: 'Ein Viertel mehr Laderaum.' },
  { id: 'sextant', name: 'Sextant', preis: 1800, text: 'Zeigt Peilung und Entfernung zum Heimathafen – und macht Schatzkarten lesbar.', abKlasse: 1 },
  { id: 'fernrohr', name: 'Fernrohr', preis: 2200, text: 'Geschliffenes Glas aus der Bernsteinküste: noch ein Feld mehr Sicht.', abKlasse: 1 },
  { id: 'kupfer', name: 'Kupferbeschlag', preis: 2800, text: 'Ein glatter Rumpf macht das Schiff ein Sechstel schneller.', abKlasse: 2 },
  { id: 'taucherglocke', name: 'Taucherglocke', preis: 3200, text: 'Hinab zu den Wracks: doppelte Beute.', abKlasse: 2 },
  { id: 'eisbug', name: 'Eisbug', preis: 5200, text: 'Ein verstärkter Bug bricht Treibeis. Ohne ihn bleibt das Eismeer verschlossen.', abKlasse: 2 },
  // für das Gefecht (Stufe 2) — sie nehmen denselben Platz weg wie alles andere: Kanonen oder Laderaum?
  { id: 'drehbassen', name: 'Drehbassen', preis: 650, text: 'Kleine Schwenkgeschütze an der Reling: Wer längsseits kommt, verliert Leute – und entert schwerer.', kampf: true },
  { id: 'enterhaken', name: 'Enterhaken und Entermesser', preis: 900, text: 'Die Mannschaft ist gerüstet: Entern gelingt um die Hälfte leichter.', kampf: true },
  { id: 'geschuetze', name: 'Zusätzliche Geschütze', preis: 1600, text: 'Mehr Stückpforten: die Hälfte mehr Kanonen je Breitseite.', abKlasse: 1, kampf: true },
  { id: 'eichenplanken', name: 'Doppelte Eichenplanken', preis: 2600, text: 'Ein zweiter Mantel aus Eiche: ein Viertel mehr Rumpf.', abKlasse: 2, kampf: true },
]
export const ausbau = (id: string): Ausbau | undefined => AUSBAUTEN.find(a => a.id === id)

export type OffizierRolle = 'navigator' | 'koch' | 'zimmermann' | 'kartograph' | 'dolmetscher' | 'ausguck' | 'quartiermeister' | 'arzt'
export interface Offizier {
  id: string
  name: string
  rolle: OffizierRolle
  /** 1 = tüchtig, 2 = meisterhaft */
  rang: 1 | 2
  heuer: number
  /** in welchen Gebieten man ihn antreffen kann */
  gebiete: number[]
  text: string
}
export const ROLLE_NAME: Record<OffizierRolle, string> = {
  navigator: 'Navigator', koch: 'Schiffskoch', zimmermann: 'Zimmermann', kartograph: 'Kartograph',
  dolmetscher: 'Dolmetscherin', ausguck: 'Ausguck', quartiermeister: 'Quartiermeister', arzt: 'Schiffsärztin',
}
export const ROLLE_WIRKUNG: Record<OffizierRolle, [string, string]> = {
  navigator: ['Gegenwind kostet ein Viertel weniger Zeit.', 'Gegenwind kostet zwei Fünftel weniger Zeit.'],
  koch: ['Der Proviant reicht ein Achtel länger.', 'Der Proviant reicht ein Viertel länger.'],
  zimmermann: ['Flickt den Rumpf auf See: ein Punkt je zwei Tage.', 'Flickt den Rumpf auf See: ein Punkt je Tag.'],
  kartograph: ['Die Gilde zahlt die Hälfte mehr für neue Karten.', 'Die Gilde zahlt das Doppelte für neue Karten.'],
  dolmetscher: ['Jeder Handel ist ein Zwölftel günstiger.', 'Jeder Handel ist ein Sechstel günstiger.'],
  ausguck: ['Ein Feld mehr Sicht.', 'Ein Feld mehr Sicht, und der Nebel nimmt nur halb so viel.'],
  quartiermeister: ['Staut geschickt: zwei Plätze mehr im Laderaum.', 'Staut meisterhaft: fünf Plätze mehr im Laderaum.'],
  arzt: ['Unglücke auf See gehen glimpflicher aus.', 'Unglücke auf See gehen fast immer glimpflich aus.'],
}
/** was ein Offizier im Gefecht und gegen Piraten bewirkt (tüchtig, meisterhaft) */
export const ROLLE_KAMPF: Partial<Record<OffizierRolle, [string, string]>> = {
  navigator: ['Im Gefecht: ein Bewegungspunkt mehr.', 'Im Gefecht: ein Bewegungspunkt mehr.'],
  arzt: ['Im Gefecht: ein Fünftel weniger Verluste an Mannschaft.', 'Im Gefecht: ein Drittel weniger Verluste an Mannschaft.'],
  quartiermeister: ['Nach einem Sieg: ein Zehntel mehr Beute.', 'Nach einem Sieg: ein Fünftel mehr Beute.'],
  dolmetscher: ['Handelt den Zoll der Piraten um ein Viertel herunter.', 'Handelt den Zoll der Piraten um die Hälfte herunter.'],
  ausguck: ['Sieht jeden Hinterhalt kommen: kein Überfall ohne Vorwarnung.', 'Sieht jeden Hinterhalt kommen: kein Überfall ohne Vorwarnung.'],
}

/** was der Spielstand über das Schiff sagt — nur das, was die Werte bestimmt */
export interface SchiffStand { klasse: number; ausbauten: readonly string[]; offiziere: readonly string[]; geleit?: readonly { klasse: number }[] }

export interface SchiffWerte {
  klasse: Klasse
  /** Proviant in Stunden */
  proviantMax: number
  laderaum: number
  /** Sicht bei klarem Wetter und im Nebel */
  sicht: number
  sichtNebel: number
  tempo: number
  rumpfMax: number
  lot: boolean
  eisbug: boolean
  /** Gegenwind-Aufschlag in Prozent des vollen Aufschlags (100 = voll) */
  gegenwind: number
  /** Proviantverbrauch in Prozent */
  verbrauch: number
  /** Zuschlag der Gilde in Prozent */
  gilde: number
  /** Handelsvorteil in Tausendsteln */
  handel: number
  beiboot: boolean
  taucherglocke: boolean
  sextant: boolean
  /** Rumpfpunkte, die der Zimmermann je 48 Stunden auf See flickt */
  flicken: number
  /** Schutz bei Unglücken in Prozent */
  schutz: number
  // ── Gefecht ──
  kanonen: number
  crew: number
  /** Bewegungspunkte bei frischer Brise */
  fahrt: number
  /** Enterstärke in Prozent obendrauf */
  enter: number
  drehbassen: boolean
  navigator: boolean
  /** weniger Verluste an Mannschaft in Prozent */
  arzt: number
  /** mehr Beute in Prozent */
  beute: number
  /** so viel Prozent des Zolls verlangen die Piraten */
  zoll: number
  /** kein Überfall ohne Vorwarnung */
  ausguck: boolean
  /** Zahl der Begleitschiffe */
  geleit: number
}

export function schiffWerte(s: SchiffStand, offizierListe: readonly Offizier[]): SchiffWerte {
  const k = KLASSEN[Math.max(0, Math.min(KLASSEN.length - 1, s.klasse))]
  const hat = (id: string): boolean => s.ausbauten.includes(id)
  const stufe = (rolle: OffizierRolle): number => {
    let beste = 0
    for (const id of s.offiziere) { const o = offizierListe.find(x => x.id === id); if (o && o.rolle === rolle && o.rang > beste) beste = o.rang }
    return beste
  }
  const sichtPlus = (hat('kraehennest') ? 1 : 0) + (hat('fernrohr') ? 1 : 0)
  const ausguck = stufe('ausguck')
  const klar = k.sicht + sichtPlus + (ausguck ? 1 : 0)
  // Begleitschiffe: jedes bringt die Hälfte seines Laderaums mit und isst ein Fünftel mehr Proviant
  const geleit = (s.geleit ?? []).filter(g => g && KLASSEN[g.klasse]).slice(0, 2)
  let geleitRaum = 0
  for (const g of geleit) geleitRaum += Math.floor(KLASSEN[g.klasse].laderaum / 2)
  return {
    klasse: k,
    proviantMax: Math.floor((k.proviant * 24 * (hat('poekel') ? 125 : 100)) / 100),
    laderaum: Math.floor((k.laderaum * (hat('zusatzraum') ? 125 : 100)) / 100) + [0, 2, 5][stufe('quartiermeister')] + geleitRaum,
    sicht: klar,
    // Nebel nimmt zwei Felder Sicht (ein meisterhafter Ausguck: nur eines), die Laterne hebt das auf
    sichtNebel: hat('laterne') ? klar : Math.max(1, klar - (ausguck === 2 ? 1 : 2)),
    tempo: Math.floor((k.tempo * (hat('kupfer') ? 116 : 100)) / 100),
    rumpfMax: Math.floor((k.rumpf * (hat('eichenplanken') ? 125 : 100)) / 100),
    lot: hat('lot'),
    eisbug: hat('eisbug'),
    gegenwind: [100, 75, 60][stufe('navigator')],
    verbrauch: Math.floor(([100, 88, 76][stufe('koch')] * (100 + 20 * geleit.length)) / 100),
    gilde: [100, 150, 200][stufe('kartograph')],
    handel: [0, 83, 166][stufe('dolmetscher')],
    beiboot: hat('beiboot'),
    taucherglocke: hat('taucherglocke'),
    sextant: hat('sextant'),
    flicken: stufe('zimmermann'),
    schutz: [0, 50, 85][stufe('arzt')],
    kanonen: hat('geschuetze') ? Math.ceil((k.kanonen * 3) / 2) : k.kanonen,
    crew: k.crew,
    fahrt: k.fahrt + (hat('kupfer') ? 1 : 0),
    enter: hat('enterhaken') ? 50 : 0,
    drehbassen: hat('drehbassen'),
    navigator: stufe('navigator') > 0,
    arzt: [0, 20, 33][stufe('arzt')],
    beute: [0, 10, 20][stufe('quartiermeister')],
    zoll: [100, 75, 50][stufe('dolmetscher')],
    ausguck: ausguck > 0,
    geleit: geleit.length,
  }
}

export interface Rang { ab: number; name: string }
export const RAENGE: readonly Rang[] = [
  { ab: 0, name: 'Schiffsjunge' }, { ab: 150, name: 'Leichtmatrose' }, { ab: 500, name: 'Matrose' }, { ab: 1400, name: 'Bootsmann' },
  { ab: 3500, name: 'Steuermann' }, { ab: 8000, name: 'Kapitän' }, { ab: 16000, name: 'Kommodore' }, { ab: 30000, name: 'Konteradmiral' },
  { ab: 55000, name: 'Admiral' }, { ab: 100000, name: 'Großadmiral' },
]
export function rangVon(ruhm: number): number {
  let i = 0
  while (i + 1 < RAENGE.length && ruhm >= RAENGE[i + 1].ab) i++
  return i
}
