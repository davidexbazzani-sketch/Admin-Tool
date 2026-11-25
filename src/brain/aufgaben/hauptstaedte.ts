// Hauptstädte (Geographie): „Wie heißt die Hauptstadt von X?“ und umgekehrt „X ist die Hauptstadt von …?“.
// Vier Auswahlen, immer vom selben Erdteil.
//
// Stufen – es ändern sich drei Dinge:
//   • welche Länder gefragt werden (Rang 1 = kennt jeder … Rang 5 = schwer):
//       1: fast nur Rang 1 · 2: Rang 1–2 · 3: Rang 1–3, vor allem 2 · 4: Rang 2–3 · 5: vor allem Rang 3
//       6: Rang 3–4 · 7: Rang 3–5 · 8: vor allem Rang 4 · 9: Rang 4–5 · 10: vor allem Rang 5
//   • die falschen Antworten: Stufe 1–3 bekannte Hauptstädte des Erdteils, 4–6 beliebige des Erdteils,
//     ab 7 die der nächstgelegenen Länder (Riga/Vilnius/Tallinn, Bamako/Niamey/Ouagadougou …)
//   • ab Stufe 3 steht oft eine bekannte Großstadt desselben Landes dabei, die NICHT Hauptstadt ist
//     (Sydney, Istanbul, Zürich …) – die klassische Verwechslung gerade bei bekannten Ländern.
// Nicht gefragt wird nach Ländern, deren Hauptstadt strittig ist oder schon im Namen steht
// (siehe OHNE_HAUPTSTADTFRAGE in geo/laender.ts). Regierungssitze, die keine Hauptstadt sind
// (Den Haag, Abidjan, Cotonou, Putrajaya, Daressalam), kommen als Auswahl nie vor.
import type { FragenGenerator } from '../kern/typen'
import { klemme, type Rng } from '../kern/zufall'
import { textAuswahl } from './hilfen'
import { LAENDER, aufzaehlung, hauptstadtFragbar, imGenitiv, type Land } from '../geo/laender'
import { weltLand } from '../geo/welt'

const FRAGBAR = LAENDER.filter(hauptstadtFragbar)
const JE_RANG = [1, 2, 3, 4, 5].map(rang => FRAGBAR.filter(l => l.rang === rang))

/** Gewichte der Ränge 1–5 je Stufe */
const RANG_GEWICHT: number[][] = [
  [6, 1, 0, 0, 0],
  [3, 3, 0, 0, 0],
  [2, 4, 1, 0, 0],
  [0, 3, 3, 0, 0],
  [0, 1, 4, 1, 0],
  [0, 0, 3, 3, 0],
  [0, 0, 2, 3, 1],
  [0, 0, 1, 4, 2],
  [0, 0, 0, 3, 3],
  [0, 0, 0, 1, 3],
]

/**
 * Bekannte Großstädte, die NICHT Hauptstadt ihres Landes sind (Kennung des Landes → Städte).
 * Nur eindeutige Fälle – keine Regierungssitze und keine Städte, die auch als Hauptstadt gelten könnten.
 */
export const KEINE_HAUPTSTADT: Record<string, string[]> = {
  '276': ['Hamburg', 'München', 'Frankfurt am Main'], '250': ['Marseille', 'Lyon'], '380': ['Mailand', 'Neapel'],
  '724': ['Barcelona', 'Sevilla'], '620': ['Porto'], '826': ['Manchester', 'Birmingham'], '372': ['Cork'],
  '528': ['Rotterdam'], '056': ['Antwerpen'], '040': ['Salzburg', 'Graz'], '756': ['Zürich', 'Genf'],
  '616': ['Krakau', 'Danzig'], '208': ['Aarhus'], '578': ['Bergen'], '752': ['Göteborg', 'Malmö'],
  '300': ['Thessaloniki'], '643': ['Sankt Petersburg'], '203': ['Brünn'], '191': ['Split'], '804': ['Odessa', 'Charkiw'],
  '792': ['Istanbul', 'Izmir'], '156': ['Shanghai'], '356': ['Mumbai', 'Kalkutta'], '392': ['Osaka', 'Kyoto'],
  '410': ['Busan'], '586': ['Karatschi', 'Lahore'], '704': ['Ho-Chi-Minh-Stadt'], '764': ['Chiang Mai'],
  '682': ['Dschidda', 'Mekka'], '364': ['Isfahan'], '368': ['Basra'], '784': ['Dubai'], '398': ['Almaty'],
  '104': ['Rangun'], '760': ['Aleppo'], '860': ['Samarkand'],
  '818': ['Alexandria'], '504': ['Casablanca', 'Marrakesch'], '566': ['Lagos'], '404': ['Mombasa'], '120': ['Douala'],
  '288': ['Kumasi'], '012': ['Oran'], '434': ['Bengasi'],
  '124': ['Toronto', 'Montreal', 'Vancouver'], '840': ['New York', 'Los Angeles'],
  '076': ['Rio de Janeiro', 'São Paulo'], '170': ['Medellín'], '604': ['Cusco'], '218': ['Guayaquil'], '862': ['Maracaibo'],
  '036': ['Sydney', 'Melbourne'], '554': ['Auckland'],
}

function zieheLand(r: Rng, gewichte: number[]): Land {
  let x = r() * gewichte.reduce((a, b) => a + b, 0)
  for (let i = 0; i < 5; i++) {
    x -= gewichte[i]
    if (x < 0 && gewichte[i] > 0) return r.aus(JE_RANG[i])
  }
  return r.aus(JE_RANG[gewichte.findIndex(g => g > 0)])
}

const abstand = (a: Land, b: Land): number => {
  const p = weltLand(a.id), q = weltLand(b.id)
  return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 1e9
}

/** drei andere Länder desselben Erdteils – je nach Stufe bekannte, beliebige oder die nächstgelegenen */
function andereLaender(r: Rng, l: Land, stufe: number): Land[] {
  const erdteil = FRAGBAR.filter(x => x.id !== l.id && x.kontinent === l.kontinent)
  if (stufe <= 3) {
    const bekannt = erdteil.filter(x => x.rang <= Math.max(2, l.rang))
    return r.ausN(bekannt.length >= 5 ? bekannt : erdteil, 3)
  }
  if (stufe <= 6) return r.ausN(erdteil, 3)
  return r.ausN(erdteil.slice().sort((a, b) => abstand(l, a) - abstand(l, b)).slice(0, 6), 3)
}

export const erzeuge: FragenGenerator = (r, stufe) => {
  const s = klemme(Math.round(stufe), 1, 10)
  const l = zieheLand(r, RANG_GEWICHT[s - 1])
  const andere = andereLaender(r, l, s)
  const zurHauptstadt = r.chance(s <= 2 ? 0.7 : 0.55)
  const zeitSek = 14 + Math.round(s / 2)

  if (zurHauptstadt) {
    // ab Stufe 3: oft eine Großstadt desselben Landes als Falle (sie ist wirklich falsch)
    const fallen = KEINE_HAUPTSTADT[l.id]
    const falle = s >= 3 && fallen && r.chance(0.7) ? r.aus(fallen) : null
    const fremde = falle ? andere.slice(0, 2) : andere
    const { optionen, richtig } = textAuswahl(r, l.hauptstadt, [...fremde.map(x => x.hauptstadt), ...(falle ? [falle] : [])], 4)
    return {
      aufgabe: `Wie heißt die Hauptstadt ${imGenitiv(l)}?`,
      optionen, richtig, zeitSek,
      erklaerung: `Die Hauptstadt ${imGenitiv(l)} ist ${l.hauptstadt}. `
        + `${aufzaehlung(fremde.map((x, i) => `${x.hauptstadt} ${i === 0 ? 'ist die Hauptstadt' : 'die'} ${imGenitiv(x)}`))}.`
        + (falle ? ` ${falle} liegt zwar im selben Land, ist aber nicht die Hauptstadt.` : ''),
    }
  }

  const { optionen, richtig } = textAuswahl(r, l.name, andere.map(x => x.name), 4)
  return {
    aufgabe: `${l.hauptstadt} ist die Hauptstadt von …?`,
    optionen, richtig, zeitSek,
    erklaerung: `${l.hauptstadt} ist die Hauptstadt ${imGenitiv(l)}. `
      + `Die Hauptstädte der anderen Länder: ${andere.map(x => `${x.name} – ${x.hauptstadt}`).join(', ')}.`,
  }
}
