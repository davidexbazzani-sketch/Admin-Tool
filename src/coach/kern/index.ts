// Der Coach — Inhaltsverzeichnis (inhalt/_index.json, erzeugt von scripts/coach-index.mjs).
// Es enthält alles, was der Planer über die Inhalte wissen muss — Kursplan, Fähigkeit, Stufe, Merkmale —, aber keine
// Texte. So plant der Coach über alle Bereiche, ohne die Texte zu laden.
import type { BereichId, BereichInfo, FaehId, Kanal, KursId, Lerntag, Phase, SchrittArt, SchwerpunktId, SchwerpunktInfo } from './inhaltTypen'

export interface VorratKopf {
  b: BereichId; a: SchrittArt; f: FaehId; s: number; k: Kanal; d: string
  laut?: 1; uhr?: 1; leise?: string; test?: 1; sp?: SchwerpunktId; entf?: 1
}
export interface InhaltsIndex {
  /** Inhaltsstand (steigt mit jeder Auslieferung neuer Inhalte) */
  iv: number
  bereiche: BereichInfo[]
  schwerpunkte: SchwerpunktInfo[]
  kurse: Record<KursId, Lerntag[]>
  einheiten: Record<string, { kurs: KursId; d: string; f: FaehId[]; mk: string[]; mission?: string; titel: string; dauer: number; laut?: 1 }>
  vorrat: Record<string, VorratKopf>
  lagen: Record<string, { b: BereichId; d: string; phase: Phase; titel: string; f: FaehId[]; s: number; sparring?: 1; sp?: SchwerpunktId }>
  missionen: Record<string, { b: BereichId; sp?: SchwerpunktId; stufe: number; titel: string; d: string; ort: 'privat' | 'beruf' | 'beides'; mutprobe?: 1 }>
  merkkarten: Record<string, { e: string; d: string }>
  wissen: Partial<Record<BereichId, string>>
  tests: Record<KursId, string>
}

export const LEERER_INDEX: InhaltsIndex = { iv: 0, bereiche: [], schwerpunkte: [], kurse: {}, einheiten: {}, vorrat: {}, lagen: {}, missionen: {}, merkkarten: {}, wissen: {}, tests: {} }

/** Bereich einer beliebigen Kennung ("konter-1-01", "aussprache-s-01", "konter.spiel") */
export function bereichVon(kennung: string): BereichId {
  return kennung.split(/[-./]/)[0] as BereichId
}
