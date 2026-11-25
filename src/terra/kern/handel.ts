// Terra Incognita — alles, was im Hafen Geld kostet oder bringt: Markt, Proviant, Werft, Offiziere, Kontor.
import { OFFIZIERE, offizier } from '../inhalt/offiziere'
import { ausbau, AUSBAUTEN, KLASSEN, rangVon, type Offizier } from './schiff'
import { kontorAbrechnen, ladungMenge, merkeKurse, ortVon, werteVon, type Spiel, type Umwelt } from './spiel'
import { streu } from './streu'
import { druckJetzt, marktVon, preise, proviantPreis, WAREN, wareNr } from './waren'
import type { Ort } from './welt'

export type Antwort = { ok: true; text?: string } | { ok: false; grund: string }
const nein = (grund: string): Antwort => ({ ok: false, grund })

function hafenHier(spiel: Spiel, nurHafen = false): Ort | null {
  const o = spiel.stand.imHafen ? ortVon(spiel.stand.imHafen) : null
  if (!o || (nurHafen && o.art !== 'hafen')) return null
  return o
}

/** Preis für `menge` Einheiten nacheinander (jede Einheit bewegt den Preis) — ohne etwas zu verändern */
export function kaufSumme(spiel: Spiel, ware: number, menge: number, u: Umwelt): number | null {
  const s = spiel.stand, ort = hafenHier(spiel)
  if (!ort) return null
  const id = WAREN[ware].id, handel = werteVon(s).handel
  const d = { ...druckJetzt(s.druck[ort.key]?.[id], s.stunden) }
  let summe = 0
  for (let i = 0; i < menge; i++) { const p = preise(ort, ware, u.tag, d, s.stunden, handel).kauf; if (p === null) return null; summe += p; d.k++ }
  return summe
}
export function verkaufSumme(spiel: Spiel, ware: number, menge: number, u: Umwelt): number | null {
  const s = spiel.stand, ort = hafenHier(spiel)
  if (!ort) return null
  const id = WAREN[ware].id, handel = werteVon(s).handel
  const d = { ...druckJetzt(s.druck[ort.key]?.[id], s.stunden) }
  let summe = 0
  for (let i = 0; i < menge; i++) { summe += preise(ort, ware, u.tag, d, s.stunden, handel).verkauf; d.v++ }
  return summe
}

export function kaufe(spiel: Spiel, wareId: string, menge: number, u: Umwelt): Antwort {
  const s = spiel.stand, ort = hafenHier(spiel), ware = wareNr(wareId)
  if (!ort || ware < 0 || menge < 1) return nein('Hier gibt es das nicht zu kaufen.')
  if (ladungMenge(s) + menge > werteVon(s).laderaum) return nein('Der Laderaum ist voll.')
  const summe = kaufSumme(spiel, ware, menge, u)
  if (summe === null) return nein('Hier gibt es das nicht zu kaufen.')
  if (summe > s.gold) return nein('Dafür reicht das Gold nicht.')
  const d = druckJetzt(s.druck[ort.key]?.[wareId], s.stunden)
  ;(s.druck[ort.key] ??= {})[wareId] = { ...d, k: d.k + menge }
  const hatte = s.ladung[wareId] ?? 0
  s.einkauf[wareId] = Math.round(((s.einkauf[wareId] ?? 0) * hatte + summe) / (hatte + menge))
  s.ladung[wareId] = hatte + menge
  s.gold -= summe
  s.zug++
  merkeKurse(s, ort, u)
  return { ok: true }
}

export function verkaufe(spiel: Spiel, wareId: string, menge: number, u: Umwelt): Antwort {
  const s = spiel.stand, ort = hafenHier(spiel), ware = wareNr(wareId)
  if (!ort || ware < 0 || menge < 1) return nein('Hier kauft das niemand.')
  if ((s.ladung[wareId] ?? 0) < menge) return nein('So viel ist nicht an Bord.')
  const summe = verkaufSumme(spiel, ware, menge, u) as number
  const d = druckJetzt(s.druck[ort.key]?.[wareId], s.stunden)
  ;(s.druck[ort.key] ??= {})[wareId] = { ...d, v: d.v + menge }
  s.ladung[wareId] -= menge
  if (!s.ladung[wareId]) { delete s.ladung[wareId]; delete s.einkauf[wareId] }
  s.gold += summe
  s.statistik.gehandelt += summe
  s.zug++
  merkeKurse(s, ort, u)
  return { ok: true }
}

/** Proviant kaufen (in Stunden; gerechnet wird je angefangenem Tag) */
export function kaufeProviant(spiel: Spiel, stunden: number): Antwort {
  const s = spiel.stand, ort = hafenHier(spiel)
  if (!ort) return nein('Proviant gibt es nur im Hafen oder im Dorf.')
  const platz = werteVon(s).proviantMax - s.proviant
  const menge = Math.min(platz, Math.max(0, Math.floor(stunden)))
  if (menge <= 0) return nein('Der Proviantraum ist voll.')
  const kosten = Math.ceil((menge * proviantPreis(ort)) / 24)
  if (kosten > s.gold) return nein('Dafür reicht das Gold nicht.')
  s.gold -= kosten; s.proviant += menge; s.zug++
  return { ok: true }
}
/** so viele Stunden Proviant kann man sich hier höchstens leisten */
export function proviantLeistbar(spiel: Spiel): number {
  const s = spiel.stand, ort = hafenHier(spiel)
  if (!ort) return 0
  return Math.min(werteVon(s).proviantMax - s.proviant, Math.floor((s.gold * 24) / proviantPreis(ort)))
}

/** In einer Hafenstadt aushelfen: ein Tag Arbeit, ein wenig Gold — damit niemand ohne Ausweg dasteht, auch nicht in
 *  einem fernen Hafen ohne Gold und Proviant. Kein Weg, reich zu werden: Arbeit bekommt nur, wer knapp bei Kasse ist
 *  (weniger als zehn Tage Proviant zum Preis dieses Hafens). Der Lohn reicht für fünf Tage Proviant. */
export const hafenarbeitLohn = (ort: Ort): number => 5 * proviantPreis(ort)
export const hafenarbeitGrenze = (ort: Ort): number => 10 * proviantPreis(ort)
/** Gibt es hier gerade Arbeit für diesen Kapitän? */
export function hafenarbeitMoeglich(spiel: Spiel): boolean {
  const ort = hafenHier(spiel, true)
  return !!ort && spiel.stand.gold < hafenarbeitGrenze(ort)
}
export function hafenarbeit(spiel: Spiel): Antwort {
  const s = spiel.stand, ort = hafenHier(spiel, true)
  if (!ort) return nein('Arbeit gibt es nur in einer Hafenstadt.')
  if (s.gold >= hafenarbeitGrenze(ort)) return nein('Wer noch Gold in der Tasche hat, den stellt der Hafenmeister nicht ein.')
  s.gold += hafenarbeitLohn(ort); s.stunden += 24; s.zug++
  return { ok: true }
}

// ── Werft ──
/** neue Schiffe gibt es in Hamburg und in großen Häfen */
export const hatGrosseWerft = (ort: Ort): boolean => ort.art === 'hafen' && ((ort.q === 0 && ort.r === 0) || ort.saat % 3 === 0)
/** was man für das alte Schiff bekommt */
export const inZahlung = (klasse: number): number => Math.floor(KLASSEN[klasse].preis / 2)

export function kaufeKlasse(spiel: Spiel, klasse: number): Antwort {
  const s = spiel.stand, ort = hafenHier(spiel, true)
  if (!ort || !hatGrosseWerft(ort)) return nein('Diese Werft baut keine Schiffe.')
  const k = KLASSEN[klasse]
  if (!k || klasse <= s.klasse) return nein('Dieses Schiff ist kein Fortschritt.')
  const kosten = k.preis - inZahlung(s.klasse)
  if (kosten > s.gold) return nein('Dafür reicht das Gold nicht.')
  s.gold -= kosten
  s.klasse = klasse
  s.rumpf = k.rumpf
  s.zug++
  return { ok: true }
}

export function kaufeAusbau(spiel: Spiel, id: string): Antwort {
  const s = spiel.stand, a = ausbau(id)
  if (!hafenHier(spiel, true) || !a) return nein('Ausbauten gibt es nur in der Werft einer Hafenstadt.')
  if (s.ausbauten.includes(id)) return nein('Das ist schon eingebaut.')
  if ((a.abKlasse ?? 0) > s.klasse) return nein(`Dafür braucht es mindestens einen ${KLASSEN[a.abKlasse ?? 0].name}.`)
  if (s.ausbauten.length >= KLASSEN[s.klasse].plaetze) return nein('Kein Platz mehr für Ausbauten – größeres Schiff oder etwas ausbauen lassen.')
  if (a.preis > s.gold) return nein('Dafür reicht das Gold nicht.')
  s.gold -= a.preis; s.ausbauten.push(id); s.zug++
  return { ok: true }
}
export function verkaufeAusbau(spiel: Spiel, id: string): Antwort {
  const s = spiel.stand, a = ausbau(id)
  if (!hafenHier(spiel, true) || !a || !s.ausbauten.includes(id)) return nein('Das geht hier nicht.')
  s.ausbauten = s.ausbauten.filter(x => x !== id)
  s.gold += Math.floor(a.preis / 2); s.zug++
  // weniger Vorratsraum: Überschuss geht nicht verloren, aber nachfüllen kann man erst wieder darunter
  return { ok: true }
}
/** Preis je Rumpfpunkt: je größer das Schiff, desto teurer die Planken (Jolle 1×, Kutter 1,5× … Entdeckerschiff 4×) */
const punktPreis = (ort: Ort, klasse: number): number => Math.floor(((4 + ort.stufe) * (2 + klasse)) / 2)
export const reparaturPreis = (spiel: Spiel): number => {
  const s = spiel.stand, ort = hafenHier(spiel, true)
  return ort ? Math.max(0, werteVon(s).rumpfMax - s.rumpf) * punktPreis(ort, s.klasse) : 0
}
export function repariere(spiel: Spiel): Antwort {
  const s = spiel.stand, kosten = reparaturPreis(spiel)
  if (!hafenHier(spiel, true)) return nein('Reparieren kann nur die Werft einer Hafenstadt.')
  if (kosten <= 0) return nein('Der Rumpf ist in Ordnung.')
  if (kosten > s.gold) return nein('Dafür reicht das Gold nicht.')
  s.gold -= kosten; s.rumpf = werteVon(s).rumpfMax; s.zug++
  return { ok: true }
}
/** Hamburg lässt niemanden liegen: Ist der Rumpf unter der Hälfte und reicht das Gold nicht für die Werft, flickt der
 *  Hafenmeister ihn umsonst auf die Hälfte — damit man nach einer Niederlage nie festsitzt. */
export function notreparaturMoeglich(spiel: Spiel): boolean {
  const s = spiel.stand, w = werteVon(s)
  return s.imHafen === '0,0' && s.rumpf * 2 < w.rumpfMax && s.gold < reparaturPreis(spiel)
}
export function notreparatur(spiel: Spiel): Antwort {
  if (!notreparaturMoeglich(spiel)) return nein('Die Werft flickt nur umsonst, wer in Hamburg mit leerer Kasse und zerschossenem Rumpf liegt.')
  const s = spiel.stand
  s.rumpf = Math.floor(werteVon(s).rumpfMax / 2); s.zug++
  return { ok: true, text: 'Mit alten Planken und viel Werg ist der Rumpf wieder halbwegs dicht.' }
}

// ── Begleitschiffe: höchstens zwei, kleiner als das eigene Schiff. Sie kämpfen mit (gesteuert von ihren Kapitänen),
//    bringen die Hälfte ihres Laderaums mit und essen je ein Fünftel mehr Proviant. ──
export const GELEIT_MAX = 2
export const geleitPreis = (klasse: number): number => Math.floor((KLASSEN[klasse].preis * 6) / 10)
export function heuereGeleit(spiel: Spiel, klasse: number, name: string): Antwort {
  const s = spiel.stand, ort = hafenHier(spiel, true), k = KLASSEN[klasse]
  if (!ort || !hatGrosseWerft(ort)) return nein('Begleitschiffe gibt es nur bei einer großen Werft.')
  if (!k || klasse < 1 || klasse >= s.klasse) return nein('Ein Begleitschiff ist kleiner als das eigene Schiff.')
  if (s.geleit.length >= GELEIT_MAX) return nein('Mehr als zwei Begleitschiffe kann niemand führen.')
  const preis = geleitPreis(klasse)
  if (preis > s.gold) return nein('Dafür reicht das Gold nicht.')
  s.gold -= preis
  s.geleit.push({ klasse, name: (name || k.name).slice(0, 28), rumpf: k.rumpf })
  s.zug++
  return { ok: true, text: `Die „${(name || k.name).slice(0, 28)}“ fährt ab jetzt mit.` }
}
export function entlasseGeleit(spiel: Spiel, i: number): Antwort {
  const s = spiel.stand, g = s.geleit[i]
  if (!hafenHier(spiel, true) || !g) return nein('Das geht nur in einer Hafenstadt.')
  const k = KLASSEN[g.klasse], erloes = Math.floor((geleitPreis(g.klasse) * 3 * Math.max(0, g.rumpf)) / (10 * k.rumpf))
  s.geleit.splice(i, 1)
  s.gold += erloes; s.zug++
  return { ok: true, text: `Die „${g.name}“ geht ihrer Wege (+${erloes} Gold).` }
}
export const geleitReparaturPreis = (spiel: Spiel, i: number): number => {
  const s = spiel.stand, ort = hafenHier(spiel, true), g = s.geleit[i]
  return ort && g ? Math.max(0, KLASSEN[g.klasse].rumpf - g.rumpf) * punktPreis(ort, g.klasse) : 0
}
export function repariereGeleit(spiel: Spiel, i: number): Antwort {
  const s = spiel.stand, g = s.geleit[i], kosten = geleitReparaturPreis(spiel, i)
  if (!hafenHier(spiel, true) || !g) return nein('Reparieren kann nur die Werft einer Hafenstadt.')
  if (kosten <= 0) return nein('Das Schiff ist in Ordnung.')
  if (kosten > s.gold) return nein('Dafür reicht das Gold nicht.')
  s.gold -= kosten; g.rumpf = KLASSEN[g.klasse].rumpf; s.zug++
  return { ok: true }
}
export { AUSBAUTEN, KLASSEN }

// ── Offiziere ──
const S_OFFIZIER = 8301
/** Wer wartet an diesem Ort auf eine Heuer? (höchstens einer; Meister nur weit draußen) */
export function offizierHier(ort: Ort): Offizier | null {
  if (ort.art !== 'hafen' && ort.art !== 'dorf' && ort.art !== 'einsiedler') return null
  const wurf = streu(ort.saat, 0, S_OFFIZIER)
  if (wurf % 100 >= (ort.art === 'hafen' ? 60 : 35)) return null
  const passend = OFFIZIERE.filter(o => o.gebiete.includes(ort.gebiet) && (o.rang === 1 || ort.stufe >= 2))
  if (!passend.length) return null
  return passend[(wurf >>> 8) % passend.length]
}

export function heuere(spiel: Spiel, ortKey: string): Antwort {
  const s = spiel.stand, ort = ortVon(ortKey)
  const o = ort ? offizierHier(ort) : null
  if (!ort || !o) return nein('Hier sucht niemand eine Heuer.')
  if (s.offiziere.includes(o.id)) return nein(`${o.name} fährt schon mit.`)
  if (o.heuer > s.gold) return nein('Für das Handgeld reicht das Gold nicht.')
  // gleiche Aufgabe: Der Bessere ersetzt den anderen
  const gleiche = s.offiziere.map(id => offizier(id)).find(x => x && x.rolle === o.rolle)
  if (gleiche && gleiche.rang >= o.rang) return nein(`Diese Aufgabe erfüllt bereits ${gleiche.name}.`)
  if (!gleiche && s.offiziere.length >= KLASSEN[s.klasse].offiziere) return nein('Kein Platz mehr für Offiziere – größeres Schiff oder jemanden entlassen.')
  if (gleiche) s.offiziere = s.offiziere.filter(id => id !== gleiche.id)
  s.gold -= o.heuer
  s.offiziere.push(o.id)
  if (!s.atlas.offiziere.includes(o.id)) s.atlas.offiziere.push(o.id)
  s.zug++
  return { ok: true, text: `${o.name} kommt an Bord.` }
}
export function entlasse(spiel: Spiel, id: string): Antwort {
  const s = spiel.stand
  if (!s.offiziere.includes(id)) return nein('Dieser Offizier fährt nicht mit.')
  s.offiziere = s.offiziere.filter(x => x !== id); s.zug++
  return { ok: true }
}

// ── Kontor ──
export const KONTOR_MAX_STUFE = 3
/** wie viele Kontore der Rang erlaubt */
export const kontorPlaetze = (ruhm: number): number => { const r = rangVon(ruhm); return r < 2 ? 0 : 1 + Math.floor((r - 2) / 1.5) }
export function kontorPreis(ort: Ort, zielStufe: number): number { return 400 * (1 + ort.stufe) * (1 << (zielStufe - 1)) }

export function baueKontor(spiel: Spiel, u: Umwelt): Antwort {
  const s = spiel.stand, ort = hafenHier(spiel, true)
  if (!ort) return nein('Ein Kontor steht nur in einer Hafenstadt.')
  const jetzt = s.kontore[ort.key] ?? 0
  if (jetzt >= KONTOR_MAX_STUFE) return nein('Dieses Kontor ist voll ausgebaut.')
  if (!jetzt && Object.keys(s.kontore).length >= kontorPlaetze(s.ruhm)) return nein(kontorPlaetze(s.ruhm) ? 'Für ein weiteres Kontor fehlt der Rang.' : 'Ein Kontor darf erst ein Matrose gründen.')
  const kosten = kontorPreis(ort, jetzt + 1)
  if (kosten > s.gold) return nein('Dafür reicht das Gold nicht.')
  kontorAbrechnen(s, u.jetzt)          // erst abrechnen, dann gilt die neue Rate
  s.gold -= kosten
  s.kontore[ort.key] = jetzt + 1
  s.zug++
  return { ok: true }
}

export { marktVon }
