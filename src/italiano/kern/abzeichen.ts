// Parla Italiano — Abzeichen: kleine Meilensteine, die zum Weitermachen anspornen.
// Sie ergeben sich vollständig aus dem Lernstand; gespeichert wird nur, WANN eines verdient wurde.
import type { ItDaten } from './typen'
import { hatGelernt, serie } from './serie'
import { SICHER_AB } from './kasten'
import { istWochenende } from './zeit'

export interface Abzeichen {
  id: string
  /** italienischer Name */
  name: string
  /** was man dafür tun muss */
  text: string
  /** Zeichen im Abzeichen */
  zeichen: string
  /** Gruppe für die Anzeige */
  gruppe: 'Serie' | 'Wörter' | 'Prüfungen' | 'Fleiß'
}

export const ABZEICHEN: Abzeichen[] = [
  { id: 'primo-passo', name: 'Primo passo', text: 'Die erste Lektion geschafft', zeichen: '👣', gruppe: 'Fleiß' },
  { id: 'serie-3', name: 'Tre giorni', text: '3 Lerntage in Folge', zeichen: '🔥', gruppe: 'Serie' },
  { id: 'serie-5', name: 'Una settimana', text: '5 Lerntage in Folge – eine ganze Arbeitswoche', zeichen: '🔥', gruppe: 'Serie' },
  { id: 'serie-10', name: 'Dieci giorni', text: '10 Lerntage in Folge', zeichen: '🔥', gruppe: 'Serie' },
  { id: 'serie-20', name: 'Venti giorni', text: '20 Lerntage in Folge', zeichen: '🌋', gruppe: 'Serie' },
  { id: 'serie-50', name: 'Cinquanta giorni', text: '50 Lerntage in Folge', zeichen: '🌋', gruppe: 'Serie' },
  { id: 'parole-50', name: 'Cinquanta parole', text: '50 Wörter gelernt', zeichen: '📗', gruppe: 'Wörter' },
  { id: 'parole-100', name: 'Cento parole', text: '100 Wörter gelernt', zeichen: '📘', gruppe: 'Wörter' },
  { id: 'parole-250', name: 'Un bel vocabolario', text: '250 Wörter gelernt', zeichen: '📙', gruppe: 'Wörter' },
  { id: 'parole-500', name: 'Cinquecento parole', text: '500 Wörter gelernt', zeichen: '📚', gruppe: 'Wörter' },
  { id: 'parole-1000', name: 'Mille parole', text: '1000 Wörter gelernt', zeichen: '🏛️', gruppe: 'Wörter' },
  { id: 'sicuro-100', name: 'Sicuro!', text: '100 Wörter sitzen sicher (Fach 4 oder 5)', zeichen: '💎', gruppe: 'Wörter' },
  { id: 'esame-1', name: 'Promosso!', text: 'Die erste Prüfung bestanden', zeichen: '🎓', gruppe: 'Prüfungen' },
  { id: 'primo-colpo', name: 'Al primo colpo', text: 'Eine Prüfung im ersten Versuch bestanden', zeichen: '🎯', gruppe: 'Prüfungen' },
  { id: 'esame-8', name: 'A1 completo', text: 'Alle 8 Prüfungen des Anfängerteils bestanden', zeichen: '🥉', gruppe: 'Prüfungen' },
  { id: 'esame-16', name: 'A2 completo', text: '16 Prüfungen bestanden', zeichen: '🥈', gruppe: 'Prüfungen' },
  { id: 'esame-24', name: 'Arrivato!', text: 'Alle 24 Prüfungen bestanden – am Ziel in Cagliari', zeichen: '🥇', gruppe: 'Prüfungen' },
  { id: 'perfetto', name: 'Perfetto', text: 'Ein Tagestest mit drei Sternen', zeichen: '⭐', gruppe: 'Fleiß' },
  { id: 'perfetto-5', name: 'Cinque volte perfetto', text: 'Fünf Tagestests mit drei Sternen', zeichen: '🌟', gruppe: 'Fleiß' },
  { id: 'palestra', name: 'In palestra', text: '10 Runden im freien Training', zeichen: '💪', gruppe: 'Fleiß' },
  { id: 'veloce', name: 'Veloce!', text: '20 richtige Wörter in einer Tempo-Runde', zeichen: '⚡', gruppe: 'Fleiß' },
  { id: 'fine-settimana', name: 'Anche di domenica', text: 'An einem Wochenende gelernt', zeichen: '☀️', gruppe: 'Fleiß' },
]

/** alle Abzeichen, deren Bedingung der Lernstand erfüllt */
export function verdient(d: ItDaten, heuteDatum: string): string[] {
  const aus: string[] = []
  const wenn = (id: string, bedingung: boolean) => { if (bedingung) aus.push(id) }
  const laengste = serie(d, heuteDatum).laengste
  const gelernt = Object.keys(d.kasten).length
  const sicher = Object.values(d.kasten).filter(e => e[0] >= SICHER_AB).length
  const bestanden = Math.max(0, d.level - 1)
  const sterne = Object.values(d.sterne)
  wenn('primo-passo', d.lektionen >= 1 || Object.keys(d.lektionAm).length >= 1)
  for (const n of [3, 5, 10, 20, 50]) wenn(`serie-${n}`, laengste >= n)
  for (const n of [50, 100, 250, 500, 1000]) wenn(`parole-${n}`, gelernt >= n)
  wenn('sicuro-100', sicher >= 100)
  wenn('esame-1', d.pruefungen.some(p => p.ok))
  // im ersten Versuch: die erste Prüfung eines Levels war gleich bestanden
  const erste = new Map<number, boolean>()
  for (const p of d.pruefungen) if (!erste.has(p.level)) erste.set(p.level, p.ok)
  wenn('primo-colpo', [...erste.values()].some(Boolean))
  for (const n of [8, 16, 24]) wenn(`esame-${n}`, bestanden >= n && d.pruefungen.some(p => p.ok))
  wenn('perfetto', sterne.some(s => s === 3))
  wenn('perfetto-5', sterne.filter(s => s === 3).length >= 5)
  wenn('palestra', d.tests.filter(t => t.art === 'training' || t.art === 'tempo').length >= 10)
  wenn('veloce', d.tests.some(t => t.art === 'tempo' && t.r >= 20))
  wenn('fine-settimana', Object.keys(d.tage).some(t => istWochenende(t) && hatGelernt(d, t)))
  return aus
}

export const abzeichenVon = (id: string): Abzeichen | undefined => ABZEICHEN.find(a => a.id === id)
