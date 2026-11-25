// Terra Incognita — Aufträge aus dem Hafen: Fracht, Post, Vermessung, Suche. Kein Auftrag hat eine Frist.
import { GEBIETE } from './gebiete'
import { abstand, peilung } from './hex'
import { ART_NAME, ortName } from './namen'
import { ladungMenge, ortVon, werteVon, type Spiel, type Umwelt } from './spiel'
import type { Auftrag, TiStand } from './stand'
import { streu3 } from './streu'
import { marktVon, WAREN } from './waren'
import { orteNahe, type Ort } from './welt'

export const AUFTRAG_MAX = 3
const S_AUFTRAG = 8401

const SUCH_ARTEN = ['wunder', 'ruine', 'wrack', 'einsiedler']
const SUCH_WORT: Record<string, string> = { wunder: 'ein Naturwunder', ruine: 'eine Ruine', wrack: 'ein Wrack', einsiedler: 'einen Einsiedler' }

/** die drei Angebote, die ein Hafen heute aushängt (für alle Kollegen dieselben) */
export function angebote(ort: Ort, s: TiStand, u: Umwelt): Auftrag[] {
  if (ort.art !== 'hafen') return []
  const aus: Auftrag[] = []
  const haefen = orteNahe(ort.q, ort.r, 40).filter(o => o.art === 'hafen' && o.key !== ort.key).sort((a, b) => abstand(ort.q, ort.r, a.q, a.r) - abstand(ort.q, ort.r, b.q, b.r) || (a.key < b.key ? -1 : 1))
  for (let i = 0; i < 3; i++) {
    const wurf = streu3(ort.saat, u.tag, i, S_AUFTRAG)
    const id = `${ort.key}#${u.tag}#${i}`
    if (s.auftraege.some(a => a.id === id) || s.erledigt[`a${id}`]) continue
    const art = wurf % 4
    if ((art === 0 || art === 1) && haefen.length) {
      // nahe Ziele häufiger als ferne
      const ziel = haefen[Math.min(haefen.length - 1, Math.floor((Math.min((wurf >>> 4) % 100, (wurf >>> 12) % 100) * haefen.length) / 100))]
      const d = abstand(ort.q, ort.r, ziel.q, ziel.r)
      const bekannt = !!s.entdeckt[`o${ziel.key}`]
      const wo = bekannt ? ortName(ziel) : `${ortName(ziel)} (im ${peilung(ort.q, ort.r, ziel.q, ziel.r)}, etwa ${Math.max(5, Math.round(d / 5) * 5)} Felder)`
      if (art === 0) {
        const menge = 2 + ((wurf >>> 20) % 5)
        const ware = WAREN[marktVon(ort).angebot[0] ?? 0]
        aus.push({ id, art: 'fracht', von: ort.key, ziel: ziel.key, ware: ware.id, menge, stand: 0, gold: menge * (10 + 2 * d), ruhm: 4 + Math.floor(d / 3), text: `${menge} Ballen ${ware.name} nach ${wo} bringen. Die Fracht belegt ${menge} Plätze im Laderaum.` })
      } else {
        aus.push({ id, art: 'post', von: ort.key, ziel: ziel.key, stand: 0, gold: 24 + 5 * d, ruhm: 3 + Math.floor(d / 4), text: `Einen Postsack nach ${wo} bringen.` })
      }
    } else if (art === 2) {
      const felder = 50 + 10 * ((wurf >>> 8) % 12)
      const gebiet = ort.gebiet
      aus.push({ id, art: 'vermessung', von: ort.key, gebiet, felder, stand: 0, gold: felder * (2 + ort.stufe), ruhm: Math.floor(felder / 5), text: `Die Gilde braucht neue Karten: ${felder} Felder im Gebiet ${GEBIETE[gebiet].name} vermessen.` })
    } else {
      const sucheArt = SUCH_ARTEN[(wurf >>> 8) % SUCH_ARTEN.length]
      aus.push({ id, art: 'suche', von: ort.key, sucheArt, stand: 0, gold: 110 + 60 * ort.stufe, ruhm: 15 + 8 * ort.stufe, text: `Ein Gelehrter zahlt gut, wenn ihr ${SUCH_WORT[sucheArt]} findet, das noch auf keiner eurer Karten steht.` })
    }
  }
  return aus
}

export type AuftragAntwort = { ok: true } | { ok: false; grund: string }

export function nimmAn(spiel: Spiel, a: Auftrag): AuftragAntwort {
  const s = spiel.stand
  if (s.imHafen !== a.von) return { ok: false, grund: 'Diesen Auftrag gibt es nur in seinem Hafen.' }
  if (s.auftraege.length >= AUFTRAG_MAX) return { ok: false, grund: `Mehr als ${AUFTRAG_MAX} Aufträge auf einmal nimmt kein Kapitän an.` }
  if (s.auftraege.some(x => x.id === a.id)) return { ok: false, grund: 'Dieser Auftrag ist schon angenommen.' }
  if (a.art === 'fracht' && ladungMenge(s) + (a.menge ?? 0) > werteVon(s).laderaum) return { ok: false, grund: 'Für diese Fracht reicht der Laderaum nicht.' }
  s.auftraege.push({ ...a, stand: 0 })
  s.zug++
  return { ok: true }
}

/** Ist der Auftrag hier und jetzt erfüllt? */
export function istErfuellt(s: TiStand, a: Auftrag): boolean {
  if (a.art === 'fracht' || a.art === 'post') return s.imHafen === a.ziel
  const hafen = s.imHafen ? ortVon(s.imHafen) : null
  if (!hafen || hafen.art !== 'hafen') return false
  return a.art === 'vermessung' ? a.stand >= (a.felder ?? 0) : a.stand >= 1
}

export function erfuelle(spiel: Spiel, id: string): { ok: boolean; gold: number; ruhm: number } {
  const s = spiel.stand, a = s.auftraege.find(x => x.id === id)
  if (!a || !istErfuellt(s, a)) return { ok: false, gold: 0, ruhm: 0 }
  s.auftraege = s.auftraege.filter(x => x.id !== id)
  s.erledigt[`a${id}`] = 1
  s.gold += a.gold; s.ruhm += a.ruhm
  s.zug++
  return { ok: true, gold: a.gold, ruhm: a.ruhm }
}

export function gibAuf(spiel: Spiel, id: string): void {
  const s = spiel.stand
  s.auftraege = s.auftraege.filter(x => x.id !== id)
  s.zug++
}

/** kurze Zeile für die Liste: Art + Ziel */
export function auftragZiel(a: Auftrag): string {
  if (a.art === 'fracht' || a.art === 'post') { const o = a.ziel ? ortVon(a.ziel) : null; return o ? ortName(o) : '?' }
  if (a.art === 'vermessung') return `${Math.min(a.stand, a.felder ?? 0)} von ${a.felder} Feldern`
  return a.stand >= 1 ? `${ART_NAME[a.sucheArt ?? ''] ?? 'Fund'} gefunden` : 'noch nichts gefunden'
}
