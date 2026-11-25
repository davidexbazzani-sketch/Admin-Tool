// Geo-Wissen (Geographie): gemischte Fragen, die aus der Karte und der Länderliste gebaut werden.
//   • „Auf welchem Kontinent liegt X?“                    (6 Auswahlen, feste Reihenfolge)
//   • „Welches dieser Länder grenzt an X?“                (ein Nachbar, drei Nicht-Nachbarn)
//   • „Welches dieser Länder grenzt NICHT an X?“          (drei Nachbarn, ein Nicht-Nachbar)
//   • „Welches dieser Länder ist am größten?“             (ein Land ist deutlich größer als die anderen)
//
// Stufen:
//   1–2  Erdteil und Nachbarn bekannter Länder (Rang 1–2); falsche Antworten sind bekannte Länder des Erdteils
//   3–4  dazu Größenvergleich mit klarem Abstand (das größte mindestens dreimal so groß); Rang bis 3
//   5–6  dazu „grenzt NICHT an“; Größenvergleich ab doppelter Fläche; Rang bis 4
//   7–8  falsche Nachbarn sind Länder „um die Ecke“ (Nachbarn der Nachbarn); Größe ab 1,6-facher Fläche
//   9–10 weniger bekannte Länder (Rang 3–5 bzw. 4–5); Größe ab 1,4-facher Fläche bei ähnlich großen Ländern
//
// Verlässlichkeit:
//   • Nachbarn stammen aus der Karte (gemeinsame Grenzlinie), von Hand gegengelesen (scripts/brain-karte.mjs).
//   • „Grenzt nicht an“ wird nur behauptet, wenn es sicher ist: nicht bei sehr nahen Ländern, Exklaven,
//     Überseegebieten und nicht, wenn beide an dasselbe umstrittene Gebiet grenzen (`nah` in der Karte).
//   • Gemeint sind Landgrenzen; Kleinststaaten, die auf der Karte fehlen (Andorra, Liechtenstein …), kommen nicht vor.
//   • Flächen: amtliche Werte aus geo/laender.ts. Ein Land nimmt nur teil, wenn amtlicher Wert und Kartenfläche
//     (flächentreue Karte) höchstens 8 % auseinanderliegen, und nie bei strittiger oder uneinheitlicher Angabe.
import type { Frage, FragenGenerator } from '../kern/typen'
import { T } from '../kern/typen'
import { klemme, type Rng } from '../kern/zufall'
import { textAuswahl } from './hilfen'
import { KONTINENTE, KONTINENT_NAME, LAENDER, OHNE_QUIZ_IDS, ZWEI_ERDTEILE, aufzaehlung, gross, imAkkusativ, imGenitiv, istMehrzahl, istQuizLand, land, mitArtikel, type Land } from '../geo/laender'
import { WELT, weltLand } from '../geo/welt'

// ── Nachbarschaft ─────────────────────────────────────────────────────────────
/** Nachbarn, die selbst Quiz-Länder sind */
export const nachbarLaender = (l: Land): Land[] => (weltLand(l.id)?.nachbarn ?? []).filter(istQuizLand).map(id => land(id)!)
export const sindNachbarn = (a: string, b: string): boolean => !!weltLand(a)?.nachbarn.includes(b)
/** darf man behaupten, dass a und b NICHT aneinandergrenzen? */
export function sicherKeineNachbarn(a: string, b: string): boolean {
  const A = weltLand(a), B = weltLand(b)
  if (!A || !B || a === b) return false
  if (A.nachbarn.includes(b) || A.nah?.includes(b) || B.nah?.includes(a)) return false
  // beide grenzen an dasselbe Gebiet ohne Quiz (z. B. Kosovo, Westsahara) → je nach Sichtweise doch Nachbarn
  if (A.nachbarn.some(n => OHNE_QUIZ_IDS.has(n) && B.nachbarn.includes(n))) return false
  return true
}
const abstand = (a: Land, b: Land): number => {
  const p = weltLand(a.id)!, q = weltLand(b.id)!
  return Math.hypot(p.x - q.x, p.y - q.y)
}

const merke = <W>(rechne: (x: Land) => W): ((x: Land) => W) => {
  const speicher = new Map<string, W>()
  return x => { if (!speicher.has(x.id)) speicher.set(x.id, rechne(x)); return speicher.get(x.id)! }
}
/** die n Länder aus `pool`, die x am nächsten liegen */
const naechste = (x: Land, pool: Land[], n: number): Land[] => pool.slice().sort((a, b) => abstand(x, a) - abstand(x, b)).slice(0, n)
/** Nicht-Nachbarn von x: zuerst der eigene Erdteil; reicht das nicht, die nächstgelegenen anderen Länder */
export const nichtNachbarn = merke((x: Land): Land[] => {
  const sicher = LAENDER.filter(l => sicherKeineNachbarn(x.id, l.id))
  const erdteil = sicher.filter(l => l.kontinent === x.kontinent)
  if (erdteil.length >= 3) return erdteil
  return [...erdteil, ...sicher.filter(l => l.kontinent !== x.kontinent).sort((a, b) => abstand(x, a) - abstand(x, b)).slice(0, 4 - erdteil.length)]
})
/** Länder „um die Ecke“: Nachbarn der Nachbarn, die sicher keine Nachbarn sind */
export const umDieEcke = merke((x: Land): Land[] => {
  const ids = new Set<string>()
  for (const n of nachbarLaender(x)) for (const m of nachbarLaender(n)) if (sicherKeineNachbarn(x.id, m.id)) ids.add(m.id)
  return LAENDER.filter(l => ids.has(l.id))
})

// ── Flächen ───────────────────────────────────────────────────────────────────
/** Länder, deren Fläche je nach Zählweise stark schwankt (Überseegebiete, umstrittene Gebiete, unklare Grenzen) */
const OHNE_GROESSE: ReadonlySet<string> = new Set([
  '250', // Frankreich: mit oder ohne Übersee
  '208', // Dänemark: mit oder ohne Grönland
  '504', '706', '688', '196', '376', // Marokko, Somalia, Serbien, Zypern, Israel: angrenzendes umstrittenes Gebiet
  '682', '887', '434', '728', // Saudi-Arabien, Jemen, Libyen, Südsudan: Quellen weichen stark voneinander ab
])
/** Fläche laut Karte in 1000 km² */
export const kartenFlaeche = (l: Land): number => ((weltLand(l.id)?.f ?? 0) * WELT.km2) / 1000
export const GROESSEN_LAENDER: Land[] = LAENDER.filter(l => !OHNE_GROESSE.has(l.id) && Math.abs(kartenFlaeche(l) / l.flaeche - 1) <= 0.08)
/** „rund 2,4 Mio. km²“, „rund 360.000 km²“ – bewusst auf zwei Stellen gerundet */
export function flaecheText(tsdKm2: number): string {
  if (tsdKm2 >= 995) return `${(tsdKm2 / 1000).toFixed(1).replace('.', ',')} Mio. km²`
  if (tsdKm2 >= 99.5) return `${Math.round(tsdKm2 / 10) * 10}.000 km²`
  if (tsdKm2 >= 9.95) return `${Math.round(tsdKm2)}.000 km²`
  return `${String(Math.round(tsdKm2 * 10) * 100).replace(/(\d)(\d{3})$/, '$1.$2')} km²`
}

// ── die vier Fragearten ───────────────────────────────────────────────────────
const MITTELAMERIKA: ReadonlySet<string> = new Set(['320', '084', '222', '340', '558', '188'])
const KARIBIK: ReadonlySet<string> = new Set(['192', '332', '214', '388', '044'])
const mitRang = (pool: Land[], von: number, bis: number): Land[] => pool.filter(l => l.rang >= von && l.rang <= bis)
const liegt = (l: Land): string => (istMehrzahl(l) ? 'liegen' : 'liegt')
const grenzt = (l: Land): string => (istMehrzahl(l) ? 'grenzen' : 'grenzt')

function frageKontinent(r: Rng, von: number, bis: number, zeitSek: number): Frage | null {
  const pool = mitRang(LAENDER, von, bis).filter(l => !ZWEI_ERDTEILE.has(l.id))
  if (!pool.length) return null
  const l = r.aus(pool)
  const wo = MITTELAMERIKA.has(l.id) ? 'in Mittelamerika – das zählt zu Nordamerika'
    : KARIBIK.has(l.id) ? 'in der Karibik – sie zählt zu Nordamerika'
      : l.kontinent === 'ozeanien' ? (l.id === '036' ? 'im Erdteil „Australien und Ozeanien“' : 'in Ozeanien (Erdteil „Australien und Ozeanien“)')
        : `in ${KONTINENT_NAME[l.kontinent]}`
  return {
    aufgabe: `Auf welchem Kontinent ${liegt(l)} ${mitArtikel(l)}?`,
    optionen: KONTINENTE.map(k => T(KONTINENT_NAME[k])),
    richtig: KONTINENTE.indexOf(l.kontinent),
    spalten: 3,
    erklaerung: `${gross(mitArtikel(l))} ${liegt(l)} ${wo}.`,
    zeitSek,
  }
}

function frageGrenztAn(r: Rng, von: number, bis: number, schwer: boolean, zeitSek: number): Frage | null {
  const pool = mitRang(LAENDER, von, bis).filter(l => nachbarLaender(l).length >= 1 && nichtNachbarn(l).length >= 3)
  if (!pool.length) return null
  const x = r.aus(pool)
  const nachbar = r.aus(nachbarLaender(x))
  // leicht: bekannte Länder des Erdteils · schwer: die nächstgelegenen Länder „um die Ecke“
  const alle = nichtNachbarn(x)
  const ecke = naechste(x, umDieEcke(x), 6)
  const bekannt = alle.filter(l => l.rang <= Math.max(2, x.rang))
  const zuerst = schwer ? ecke : bekannt
  const falsche = [...r.misch(zuerst), ...r.misch(alle.filter(l => !zuerst.includes(l)))].slice(0, 3)
  if (falsche.length < 3) return null
  const { optionen, richtig } = textAuswahl(r, nachbar.name, falsche.map(l => l.name), 4)
  return {
    aufgabe: `Welches dieser Länder grenzt an ${imAkkusativ(x)}?`,
    optionen, richtig, zeitSek,
    erklaerung: `${gross(mitArtikel(nachbar))} ${grenzt(nachbar)} an ${imAkkusativ(x)} (gemeinsame Landgrenze). `
      + `${gross(aufzaehlung(falsche.map(mitArtikel)))} grenzen nicht an ${imAkkusativ(x)}.`,
  }
}

function frageGrenztNicht(r: Rng, von: number, bis: number, schwer: boolean, zeitSek: number): Frage | null {
  const pool = mitRang(LAENDER, von, bis).filter(l => nachbarLaender(l).length >= 3 && nichtNachbarn(l).length >= 1)
  if (!pool.length) return null
  const x = r.aus(pool)
  const nachbarn = r.ausN(nachbarLaender(x), 3)
  // leicht: eines der zehn nächstgelegenen Länder ohne gemeinsame Grenze · schwer: eines der vier nächsten „um die Ecke“
  const ecke = naechste(x, umDieEcke(x), 4)
  const fremd = r.aus(schwer && ecke.length ? ecke : naechste(x, nichtNachbarn(x), 10))
  const { optionen, richtig } = textAuswahl(r, fremd.name, nachbarn.map(l => l.name), 4)
  return {
    aufgabe: `Welches dieser Länder grenzt NICHT an ${imAkkusativ(x)}?`,
    optionen, richtig, zeitSek,
    erklaerung: `${gross(mitArtikel(fremd))} ${grenzt(fremd)} nicht an ${imAkkusativ(x)}. `
      + `${gross(aufzaehlung(nachbarn.map(mitArtikel)))} sind Nachbarn ${imGenitiv(x)}.`,
  }
}

function frageGroesse(r: Rng, rangBis: number, faktor: number, eng: boolean, zeitSek: number): Frage | null {
  const pool = mitRang(GROESSEN_LAENDER, 1, rangBis)
  for (let versuch = 0; versuch < 30; versuch++) {
    const gross1 = r.aus(pool)
    // die anderen: deutlich kleiner – amtlich UND auf der Karte; auf hohen Stufen nicht zu klein (sonst zu leicht)
    const kleiner = pool.filter(l => l.id !== gross1.id
      && gross1.flaeche >= faktor * l.flaeche && kartenFlaeche(gross1) >= (faktor * 0.9) * kartenFlaeche(l)
      && (!eng || l.flaeche * faktor * 2.5 >= gross1.flaeche))
    if (kleiner.length < 3) continue
    const andere = r.ausN(kleiner, 3)
    const { optionen, richtig } = textAuswahl(r, gross1.name, andere.map(l => l.name), 4)
    const reihe = [gross1, ...andere.slice().sort((a, b) => b.flaeche - a.flaeche)]
    return {
      aufgabe: 'Welches dieser Länder ist am größten?',
      optionen, richtig, zeitSek,
      erklaerung: `${gross(mitArtikel(gross1))} ${istMehrzahl(gross1) ? 'sind' : 'ist'} mit rund ${flaecheText(gross1.flaeche)} am größten. `
        + `Zum Vergleich: ${reihe.slice(1).map(l => `${l.name} rund ${flaecheText(l.flaeche)}`).join(', ')}.`,
    }
  }
  return null
}

type Art = 'kontinent' | 'grenzt' | 'nicht' | 'groesse'
interface Stufe {
  /** Gewichte der Fragearten */
  arten: Partial<Record<Art, number>>
  /** Rang der Länder bei der Erdteil-Frage [von, bis] */
  k: [number, number]
  /** Rang der Länder bei den Nachbar-Fragen [von, bis] */
  n: [number, number]
  /** Größenvergleich: das größte Land ist mindestens so viel mal größer als das zweitgrößte */
  faktor: number
  zeitSek: number
}
const STUFEN: Stufe[] = [
  { arten: { kontinent: 3, grenzt: 2 }, k: [1, 2], n: [1, 1], faktor: 3, zeitSek: 18 },
  { arten: { kontinent: 2, grenzt: 3 }, k: [1, 2], n: [1, 2], faktor: 3, zeitSek: 18 },
  { arten: { kontinent: 2, grenzt: 3, groesse: 2 }, k: [2, 3], n: [1, 2], faktor: 3, zeitSek: 20 },
  { arten: { kontinent: 2, grenzt: 3, groesse: 2 }, k: [2, 3], n: [2, 3], faktor: 3, zeitSek: 20 },
  { arten: { kontinent: 1, grenzt: 3, nicht: 2, groesse: 2 }, k: [3, 4], n: [2, 3], faktor: 2, zeitSek: 22 },
  { arten: { kontinent: 1, grenzt: 2, nicht: 3, groesse: 2 }, k: [3, 4], n: [2, 4], faktor: 2, zeitSek: 22 },
  { arten: { kontinent: 1, grenzt: 3, nicht: 3, groesse: 2 }, k: [4, 5], n: [2, 4], faktor: 1.6, zeitSek: 24 },
  { arten: { kontinent: 1, grenzt: 3, nicht: 3, groesse: 2 }, k: [4, 5], n: [3, 4], faktor: 1.6, zeitSek: 24 },
  { arten: { kontinent: 1, grenzt: 3, nicht: 3, groesse: 2 }, k: [4, 5], n: [3, 5], faktor: 1.4, zeitSek: 26 },
  { arten: { kontinent: 1, grenzt: 3, nicht: 3, groesse: 2 }, k: [5, 5], n: [4, 5], faktor: 1.4, zeitSek: 26 },
]

export const erzeuge: FragenGenerator = (r, stufe) => {
  const s = klemme(Math.round(stufe), 1, 10)
  const st = STUFEN[s - 1]
  const arten = Object.entries(st.arten) as [Art, number][]
  for (let versuch = 0; versuch < 12; versuch++) {
    let x = r() * arten.reduce((a, [, g]) => a + g, 0)
    let art: Art = arten[0][0]
    for (const [a, g] of arten) { x -= g; if (x < 0) { art = a; break } }
    const frage = art === 'kontinent' ? frageKontinent(r, st.k[0], st.k[1], st.zeitSek - 6)
      : art === 'grenzt' ? frageGrenztAn(r, st.n[0], st.n[1], s >= 7, st.zeitSek)
        : art === 'nicht' ? frageGrenztNicht(r, st.n[0], st.n[1], s >= 7, st.zeitSek)
          : frageGroesse(r, Math.min(5, st.n[1] + 1), st.faktor, s >= 7, st.zeitSek)
    if (frage) return frage
  }
  // sollte nie nötig sein: eine Erdteil-Frage geht immer
  return frageKontinent(r, 1, 5, 14)!
}
