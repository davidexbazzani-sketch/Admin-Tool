// Umrisse (Geographie): „Welches Land hat diesen Umriss?“ – gezeigt wird die Form eines Landes, vier Länder zur Auswahl.
//
// Stufen:
//   1–2  markante Formen bekannter Länder (Italien, Chile, Japan …); die falschen Antworten sind
//        ebenfalls bekannte Länder, auf Stufe 1 von anderen Erdteilen
//   3–4  alle Länder mit Rang 1–2; falsche Antworten: bekannte Länder beliebiger Erdteile
//   5–6  Rang 1–3; falsche Antworten vom selben Erdteil
//   7–8  Rang 2–4; falsche Antworten vom selben Erdteil und ähnlich groß
//   9–10 Rang 3–5; falsche Antworten: die in der Größe ähnlichsten Länder desselben Erdteils
// Nicht dabei sind Länder, deren Form in dieser Kartenauflösung nichts hergibt (Kleinstländer, Inselgruppen).
//
// Die Form: Die Karte (geo/welt.json) ist als Weltkarte in Equal Earth gezeichnet – dort sind Länder im Norden
// breit gedrückt und am Äquator in die Länge gezogen. Für den Umriss wird deshalb EIN Land zurückgerechnet
// (Länge/Breite) und um seine eigene Mitte neu abgebildet (flächentreue Azimutalabbildung nach Lambert):
// so sieht es aus wie auf dem Globus bzw. im Atlas. Ein paar Zeilen Rechnung, keine Bibliothek.
import type { FragenGenerator } from '../kern/typen'
import { klemme } from '../kern/zufall'
import { textAuswahl } from './hilfen'
import { KONTINENT_NAME, LAENDER, ZWEI_ERDTEILE, imAkkusativ, type Land } from '../geo/laender'
import { WELT, pfadRinge, ringFlaeche, weltLand, type Punkt } from '../geo/welt'

// ── Equal Earth zurückrechnen ────────────────────────────────────────────────
const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2
/** Zeichenpunkt → [Länge, Breite] im Bogenmaß */
function zurueck([x, y]: Punkt): Punkt {
  const px = (x - WELT.proj.x) / WELT.proj.k
  const py = -(y - WELT.proj.y) / WELT.proj.k
  // Hilfswinkel t aus py = t·(A1 + A2·t² + t⁶·(A3 + A4·t²)) – Newton, konvergiert in wenigen Schritten
  let t = py / A1
  for (let i = 0; i < 8; i++) {
    const t2 = t * t, t6 = t2 * t2 * t2
    const f = t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2)) - py
    const ab = A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2)
    t -= f / ab
    if (Math.abs(f) < 1e-10) break
  }
  const t2 = t * t, t6 = t2 * t2 * t2
  const lon = (M * px * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))) / Math.cos(t)
  const lat = Math.asin(Math.max(-1, Math.min(1, Math.sin(t) / M)))
  return [lon, lat]
}
/** flächentreue Azimutalabbildung um (lon0, lat0); y zeigt nach unten (SVG) */
function azimutal([lon, lat]: Punkt, lon0: number, lat0: number): Punkt {
  const d = lon - lon0
  const k = Math.sqrt(2 / (1 + Math.sin(lat0) * Math.sin(lat) + Math.cos(lat0) * Math.cos(lat) * Math.cos(d)))
  return [k * Math.cos(lat) * Math.sin(d), -k * (Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(d))]
}
const rahmen = (ringe: Punkt[][]): [number, number, number, number] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of ringe) for (const [x, y] of r) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  return [x0, y0, x1, y1]
}

/** Länder, bei denen nur die größten Teilflächen den bekannten Umriss ergeben (Zahl = wie viele) */
const NUR_GROESSTE: Record<string, number> = {
  '840': 1, // Vereinigte Staaten: ohne Alaska und Hawaii
  '578': 1, // Norwegen: ohne Spitzbergen
}

/**
 * Umriss eines Landes als SVG-Pfad im Raum 0..100 (mittig, mit Rand). Weit entfernte Landesteile
 * bleiben weg, damit das Hauptland groß genug bleibt.
 */
export function umrissPfad(id: string): string {
  const w = weltLand(id)
  if (!w) return ''
  let ringe = pfadRinge(w.d)
  const nachGroesse = ringe.slice().sort((a, b) => Math.abs(ringFlaeche(b)) - Math.abs(ringFlaeche(a)))
  if (NUR_GROESSTE[id]) ringe = nachGroesse.slice(0, NUR_GROESSTE[id])
  // um die Mitte der Hauptfläche neu abbilden
  const grad = ringe.map(r => r.map(zurueck))
  const haupt = nachGroesse[0].map(zurueck)
  const [l0, b0, l1, b1] = rahmen([haupt])
  const lon0 = (l0 + l1) / 2, lat0 = (b0 + b1) / 2
  let flach = grad.map(r => r.map(p => azimutal(p, lon0, lat0)))
  // ferne Teile weglassen: Abstand zum Rahmen der Hauptfläche größer als 60 % von deren Ausdehnung
  const hauptFlach = haupt.map(p => azimutal(p, lon0, lat0))
  const [hx0, hy0, hx1, hy1] = rahmen([hauptFlach])
  const weit = 0.6 * Math.max(hx1 - hx0, hy1 - hy0)
  flach = flach.filter(r => {
    const [x0, y0, x1, y1] = rahmen([r])
    return Math.max(hx0 - x1, x0 - hx1, 0) <= weit && Math.max(hy0 - y1, y0 - hy1, 0) <= weit
  })
  // in den Raum 0..100 legen
  const [x0, y0, x1, y1] = rahmen(flach)
  const mass = 86 / Math.max(x1 - x0, y1 - y0, 1e-9)
  const dx = 50 - ((x0 + x1) / 2) * mass, dy = 50 - ((y0 + y1) / 2) * mass
  let d = ''
  for (const r of flach) {
    const p: Punkt[] = []
    for (const [x, y] of r) {
      const q: Punkt = [Math.round((x * mass + dx) * 10) / 10, Math.round((y * mass + dy) * 10) / 10]
      if (!p.length || p[p.length - 1][0] !== q[0] || p[p.length - 1][1] !== q[1]) p.push(q)
    }
    if (p.length < 3) continue
    d += `M${p.map(q => `${q[0]} ${q[1]}`).join('L')}Z`
  }
  return d
}

// ── welche Länder taugen? ────────────────────────────────────────────────────
/** Hauptfläche hat genug Ecken und Fläche, damit die Form etwas hergibt */
function taugt(l: Land): boolean {
  const w = weltLand(l.id)
  if (!w) return false
  const haupt = pfadRinge(w.d).reduce((a, b) => (Math.abs(ringFlaeche(b)) > Math.abs(ringFlaeche(a)) ? b : a))
  return haupt.length >= 16 && Math.abs(ringFlaeche(haupt)) >= 30 && !OHNE_UMRISS.has(l.id)
}
/**
 * Ohne Umriss-Frage: Inselgruppen ohne erkennbare Hauptfläche (Fidschi, Salomonen, Vanuatu, Bahamas) und
 * Länder, deren Umriss an einem umstrittenen Gebiet hängt (Ukraine, Marokko, Somalia, Serbien) – die Karte
 * zeichnet sie, wie die Kartendaten sie führen, aber als Quizfrage wäre die Form eine Aussage.
 */
const OHNE_UMRISS: ReadonlySet<string> = new Set(['242', '090', '548', '044', '804', '504', '706', '688'])
export const UMRISS_LAENDER: Land[] = LAENDER.filter(taugt)

/** markante, bekannte Formen für die ersten Stufen (Kennungen) */
const MARKANT = ['380', '250', '724', '276', '826', '300', '578', '752', '246', '352', '372', '620', '792', '643', '156', '356', '392', '036', '554',
  '840', '124', '484', '192', '076', '032', '152', '818', '710', '450', '360', '764', '704', '191']

/** Merkhilfen für die Erklärung */
const MERKE: Record<string, string> = {
  '380': 'Merkhilfe: der „Stiefel“ im Mittelmeer, mit Sizilien und Sardinien.',
  '250': 'Merkhilfe: das „Sechseck“ (l’Hexagone), dazu Korsika.',
  '152': 'Merkhilfe: der lange, schmale Streifen an der Pazifikküste Südamerikas.',
  '578': 'Merkhilfe: lang gestreckt mit zerklüfteter Fjordküste. Spitzbergen ist hier weggelassen.',
  '840': 'Gezeigt ist das zusammenhängende Staatsgebiet – ohne Alaska und Hawaii.',
  '392': 'Merkhilfe: ein lang gezogener Inselbogen vor der Küste Ostasiens.',
  '554': 'Merkhilfe: zwei lang gestreckte Hauptinseln.',
  '360': 'Merkhilfe: eine lange Inselkette – Sumatra, Java, Sulawesi sowie Teile von Borneo und Neuguinea.',
  '704': 'Merkhilfe: ein schmales „S“ entlang der Küste.',
  '764': 'Merkhilfe: der „Elefantenkopf“ mit dem Rüssel nach Süden.',
  '356': 'Merkhilfe: das große Dreieck, das in den Indischen Ozean ragt.',
  '036': 'Merkhilfe: der kompakte Kontinent mit Tasmanien im Süden.',
  '826': 'Gezeigt sind Großbritannien und Nordirland.',
  '300': 'Merkhilfe: zerklüftetes Festland mit dem Peloponnes, dazu Kreta.',
  '192': 'Merkhilfe: die lang gestreckte, leicht gebogene Insel.',
  '450': 'Merkhilfe: die lang gezogene Insel vor Ostafrika.',
  '191': 'Merkhilfe: wie ein Bumerang um Bosnien und Herzegowina herum.',
  '818': 'Merkhilfe: fast ein Quadrat, im Nordosten die Sinai-Halbinsel.',
  '643': 'Merkhilfe: das größte Land der Erde, sehr breit von West nach Ost.',
  '032': 'Merkhilfe: breit im Norden, nach Süden spitz zulaufend bis Feuerland.',
  '124': 'Merkhilfe: breites Festland, im Norden viele große Inseln.',
  '484': 'Merkhilfe: nach Süden schmaler, mit den Halbinseln Niederkalifornien und Yucatán.',
  '752': 'Merkhilfe: lang gestreckt von Nord nach Süd, ohne die Fjordküste Norwegens.',
  '246': 'Merkhilfe: unten breit, oben schmal – östlich von Schweden.',
  '352': 'Merkhilfe: die Insel mit den Westfjorden als „Zipfel“ im Nordwesten.',
  '724': 'Merkhilfe: der größte Teil der Iberischen Halbinsel – die Lücke im Westen ist Portugal.',
  '620': 'Merkhilfe: ein schmales Hochkant-Rechteck am Westrand der Iberischen Halbinsel.',
  '710': 'Merkhilfe: die Südspitze Afrikas – das Loch ist Lesotho.',
  '792': 'Merkhilfe: ein breites Rechteck zwischen Schwarzem Meer und Mittelmeer.',
}

const groessenNaehe = (a: Land, b: Land): number => Math.abs(Math.log(a.flaeche / b.flaeche))

export const erzeuge: FragenGenerator = (r, stufe) => {
  const s = klemme(Math.round(stufe), 1, 10)
  const mitRang = (von: number, bis: number) => UMRISS_LAENDER.filter(l => l.rang >= von && l.rang <= bis)
  const markant = UMRISS_LAENDER.filter(l => MARKANT.includes(l.id))

  // welches Land?
  const topf = s <= 2 ? markant : s <= 4 ? mitRang(1, 2) : s <= 6 ? mitRang(1, 3) : s <= 8 ? mitRang(2, 4) : mitRang(3, 5)
  const l = r.aus(topf)

  // die drei falschen
  const andere = (pool: Land[]) => pool.filter(x => x.id !== l.id)
  const erdteil = andere(LAENDER.filter(x => x.kontinent === l.kontinent))
  let falsche: Land[]
  if (s === 1) falsche = r.ausN(andere(markant).filter(x => x.kontinent !== l.kontinent), 3)
  else if (s <= 2) falsche = r.ausN(andere(markant), 3)
  else if (s <= 4) falsche = r.ausN(andere(LAENDER.filter(x => x.rang <= 2)), 3)
  else if (s <= 6) falsche = r.ausN(erdteil, 3)
  else {
    const nachGroesse = erdteil.slice().sort((a, b) => groessenNaehe(l, a) - groessenNaehe(l, b))
    falsche = r.ausN(nachGroesse.slice(0, s <= 8 ? 8 : 4), 3)
  }
  if (falsche.length < 3) falsche = [...falsche, ...r.misch(andere(LAENDER.filter(x => !falsche.includes(x))))].slice(0, 3)

  const { optionen, richtig } = textAuswahl(r, l.name, falsche.map(x => x.name), 4)
  const merke = MERKE[l.id]
  return {
    aufgabe: 'Welches Land hat diesen Umriss?',
    zeige: { art: 'szene', szene: { elemente: [{ typ: 'pfad', x: 50, y: 50, d: umrissPfad(l.id), fuell: 'halb', ton: 1, dick: 1.1 }] } },
    optionen, richtig,
    erklaerung: `Der Umriss zeigt ${imAkkusativ(l)}${ZWEI_ERDTEILE.has(l.id) ? '' : ` (${KONTINENT_NAME[l.kontinent]})`}.${merke ? ' ' + merke : ''}`,
    zeitSek: 18 + s,
  }
}
