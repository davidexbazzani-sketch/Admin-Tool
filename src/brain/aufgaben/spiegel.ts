// Spiegelbild: Die Figur wird an einer Linie gespiegelt — wie sieht sie danach aus?
//
// Stufe 1–3: Spiegelung an der senkrechten Linie (links ↔ rechts), 4–6 Kästchen ·
// 4–5: an der waagerechten Linie (oben ↔ unten) · 6–7: an der schrägen Linie (Diagonale) ·
// 8: Achse wechselt zufällig, 8 Kästchen · 9–10: erst spiegeln, dann eine Vierteldrehung.
// Falsche Antworten sind die übrigen Lagen derselben Figur (unverändert, gedreht, an der
// anderen Achse gespiegelt) — genau die Verwechslungen, die beim Spiegeln passieren.
import type { Form, FragenGenerator, Szene } from '../kern/typen'
import { S } from '../kern/typen'
import type { Rng } from '../kern/zufall'
import { klemme } from '../kern/zufall'
import { mischeAuswahl } from './hilfen'
import { alsSzene, drehe, festeFigur, normal, schluesselVon, spiegle, zufallsFigur, type Zellen } from './polyomino'

type Achse = 'senkrecht' | 'waagerecht' | 'schraeg'
const transponiere = (z: Zellen): Zellen => normal(z.map(([x, y]) => [y, x] as [number, number]))
/** Spiegelung an der Achse (Lage der Achse im Bild ist für die Form egal) */
export function spiegleAn(z: Zellen, a: Achse): Zellen {
  return a === 'senkrecht' ? spiegle(z) : a === 'waagerecht' ? normal(z.map(([x, y]) => [x, -y] as [number, number])) : transponiere(z)
}

const ACHSE_TEXT: Record<Achse, string> = {
  senkrecht: 'an der senkrechten Linie (links wird rechts)',
  waagerecht: 'an der waagerechten Linie (oben wird unten)',
  schraeg: 'an der schrägen Linie (von links oben nach rechts unten)',
}
function achsenLinie(a: Achse): Form {
  const basis = { typ: 'linie' as const, ton: 0 as const, dick: 2.2, strich: true }
  return a === 'senkrecht' ? { ...basis, x: 94, y: 6, x2: 94, y2: 94 } : a === 'waagerecht' ? { ...basis, x: 6, y: 94, x2: 94, y2: 94 } : { ...basis, x: 6, y: 6, x2: 94, y2: 94 }
}
/** Vorlage mit eingezeichneter Spiegellinie (Figur etwas kleiner, damit die Linie Platz hat) */
function vorlageBild(z: Zellen, a: Achse): Szene {
  const s = alsSzene(z, { ton: 2, kante: a === 'schraeg' ? 13 : 16 })
  // bei senkrechter/waagerechter Achse die Figur von der Linie wegrücken
  const dx = a === 'senkrecht' ? -8 : 0, dy = a === 'waagerecht' ? -8 : 0
  return { elemente: [...s.elemente.map(e => ({ ...e, x: e.x + dx, y: e.y + dy })), achsenLinie(a)] }
}

export const erzeuge: FragenGenerator = (r, stufeRoh) => {
  const stufe = klemme(Math.round(stufeRoh), 1, 10)
  const n = [4, 5, 6, 5, 6, 6, 7, 8, 7, 8][stufe - 1]
  const figur = n <= 5 ? festeFigur(r, n) : zufallsFigur(r, n, 4)
  const achse: Achse = stufe <= 3 ? 'senkrecht' : stufe <= 5 ? 'waagerecht' : stufe <= 7 ? 'schraeg' : r.aus(['senkrecht', 'waagerecht', 'schraeg'] as Achse[])
  const mitDrehung = stufe >= 9
  const viertel = mitDrehung ? r.aus([1, 3]) : 0
  const gespiegelt = spiegleAn(figur, achse)
  const richtig = drehe(gespiegelt, viertel)
  // alle acht Lagen der Figur (vier Drehungen, jeweils auch gespiegelt) — die richtige fällt beim Mischen heraus
  const lagen: Zellen[] = []
  for (let v = 0; v < 4; v++) { lagen.push(drehe(figur, v)); lagen.push(drehe(spiegle(figur), v)) }
  // zuerst die naheliegenden Verwechslungen: unverändert, an der anderen Achse gespiegelt, nur gedreht
  const naheliegend: Zellen[] = [normal(figur), spiegleAn(figur, achse === 'senkrecht' ? 'waagerecht' : 'senkrecht'), drehe(figur, 2), gespiegelt]
  const anzahl = stufe <= 4 ? 4 : stufe <= 7 ? 5 : 6
  const { optionen, richtig: index } = mischeAuswahl(r, richtig, [...naheliegend, ...r.misch(lagen)], z => S(alsSzene(z, { ton: 1 })), schluesselVon, anzahl)
  const dreh = viertel === 1 ? 'eine Vierteldrehung im Uhrzeigersinn' : 'eine Vierteldrehung gegen den Uhrzeigersinn'
  return {
    aufgabe: mitDrehung
      ? `Die Figur wird ${ACHSE_TEXT[achse].replace(/ \(.*\)/, '')} gespiegelt und macht danach ${dreh}. Wie sieht sie dann aus?`
      : 'Die Figur wird an der gestrichelten Linie gespiegelt. Wie sieht ihr Spiegelbild aus?',
    zeige: S(vorlageBild(figur, achse)),
    optionen, richtig: index, spalten: anzahl,
    erklaerung: `Gespiegelt wird ${ACHSE_TEXT[achse]}${mitDrehung ? `, danach folgt ${dreh}` : ''}. Die anderen Bilder zeigen die Figur unverändert, nur gedreht oder an einer anderen Linie gespiegelt.`,
    zeitSek: 30 + stufe * 6,
  }
}
