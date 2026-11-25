// Parla Italiano — Verben beugen (für den Verb-Trainer).
// Regelmäßige Formen entstehen aus Regeln, unregelmäßige stehen ausgeschrieben in der Liste.
// Jede Zeit wird erst angeboten, wenn sie im Kurs dran war.
import { rng } from '../../brain/kern/zufall'
import type { ATippen } from './typen'

export type Zeit = 'presente' | 'passato' | 'imperfetto' | 'futuro' | 'condizionale' | 'congiuntivo'
export const ZEITEN: { id: Zeit; name: string; deutsch: string; abLevel: number; muster: string }[] = [
  { id: 'presente', name: 'presente', deutsch: 'Gegenwart', abLevel: 1, muster: 'parlo – ich spreche' },
  { id: 'passato', name: 'passato prossimo', deutsch: 'Vergangenheit (abgeschlossen)', abLevel: 9, muster: 'ho parlato – ich habe gesprochen' },
  { id: 'imperfetto', name: 'imperfetto', deutsch: 'Vergangenheit (wie es war)', abLevel: 13, muster: 'parlavo – ich sprach (immer)' },
  { id: 'futuro', name: 'futuro', deutsch: 'Zukunft', abLevel: 15, muster: 'parlerò – ich werde sprechen' },
  { id: 'condizionale', name: 'condizionale', deutsch: 'Möglichkeit, höfliche Bitte', abLevel: 17, muster: 'parlerei – ich würde sprechen' },
  { id: 'congiuntivo', name: 'congiuntivo presente', deutsch: 'nach «penso che …»', abLevel: 21, muster: 'che io parli – dass ich spreche' },
]
export const PERSONEN = ['io', 'tu', 'lui / lei', 'noi', 'voi', 'loro'] as const
type Sechs = [string, string, string, string, string, string]

export interface Verb {
  inf: string
  de: string
  /** ab diesem Level im Kurs bekannt */
  abLevel: number
  /** passato prossimo mit essere (sonst avere) */
  essere?: boolean
  /** unregelmäßiges Partizip */
  part?: string
  /** unregelmäßige Gegenwart */
  pres?: Sechs
  /** -ire mit -isc- (capisco) */
  isc?: boolean
  /** Stamm für Zukunft und Bedingungsform ohne Endung (andr-, sar-) */
  fut?: string
  /** unregelmäßiger congiuntivo presente */
  cong?: Sechs
  /** unregelmäßiges imperfetto: ganzer Formensatz oder Stamm (fac → facevo) */
  impf?: Sechs | string
}

export const VERBEN: Verb[] = [
  { inf: 'essere', de: 'sein', abLevel: 1, essere: true, part: 'stato', pres: ['sono', 'sei', 'è', 'siamo', 'siete', 'sono'], fut: 'sar', cong: ['sia', 'sia', 'sia', 'siamo', 'siate', 'siano'], impf: ['ero', 'eri', 'era', 'eravamo', 'eravate', 'erano'] },
  { inf: 'avere', de: 'haben', abLevel: 1, part: 'avuto', pres: ['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno'], fut: 'avr', cong: ['abbia', 'abbia', 'abbia', 'abbiamo', 'abbiate', 'abbiano'] },
  { inf: 'parlare', de: 'sprechen', abLevel: 3 },
  { inf: 'lavorare', de: 'arbeiten', abLevel: 3 },
  { inf: 'abitare', de: 'wohnen', abLevel: 3 },
  { inf: 'guardare', de: 'ansehen', abLevel: 3 },
  { inf: 'cercare', de: 'suchen', abLevel: 4 },
  { inf: 'trovare', de: 'finden', abLevel: 4 },
  { inf: 'aspettare', de: 'warten', abLevel: 4 },
  { inf: 'andare', de: 'gehen, fahren', abLevel: 4, essere: true, pres: ['vado', 'vai', 'va', 'andiamo', 'andate', 'vanno'], fut: 'andr', cong: ['vada', 'vada', 'vada', 'andiamo', 'andiate', 'vadano'] },
  { inf: 'prendere', de: 'nehmen', abLevel: 5, part: 'preso' },
  { inf: 'leggere', de: 'lesen', abLevel: 5, part: 'letto' },
  { inf: 'scrivere', de: 'schreiben', abLevel: 5, part: 'scritto' },
  { inf: 'vedere', de: 'sehen', abLevel: 5, part: 'visto', fut: 'vedr' },
  { inf: 'mangiare', de: 'essen', abLevel: 5 },
  { inf: 'dormire', de: 'schlafen', abLevel: 5 },
  { inf: 'partire', de: 'abfahren', abLevel: 5, essere: true },
  { inf: 'capire', de: 'verstehen', abLevel: 5, isc: true },
  { inf: 'finire', de: 'beenden', abLevel: 5, isc: true },
  { inf: 'preferire', de: 'vorziehen', abLevel: 5, isc: true },
  { inf: 'arrivare', de: 'ankommen', abLevel: 5, essere: true },
  { inf: 'fare', de: 'machen', abLevel: 6, part: 'fatto', pres: ['faccio', 'fai', 'fa', 'facciamo', 'fate', 'fanno'], fut: 'far', cong: ['faccia', 'faccia', 'faccia', 'facciamo', 'facciate', 'facciano'], impf: 'face' },
  { inf: 'venire', de: 'kommen', abLevel: 6, essere: true, part: 'venuto', pres: ['vengo', 'vieni', 'viene', 'veniamo', 'venite', 'vengono'], fut: 'verr', cong: ['venga', 'venga', 'venga', 'veniamo', 'veniate', 'vengano'] },
  { inf: 'uscire', de: 'ausgehen', abLevel: 6, essere: true, pres: ['esco', 'esci', 'esce', 'usciamo', 'uscite', 'escono'], cong: ['esca', 'esca', 'esca', 'usciamo', 'usciate', 'escano'] },
  { inf: 'stare', de: 'bleiben, sich befinden', abLevel: 6, essere: true, part: 'stato', pres: ['sto', 'stai', 'sta', 'stiamo', 'state', 'stanno'], fut: 'star', cong: ['stia', 'stia', 'stia', 'stiamo', 'stiate', 'stiano'] },
  { inf: 'dare', de: 'geben', abLevel: 6, pres: ['do', 'dai', 'dà', 'diamo', 'date', 'danno'], fut: 'dar', cong: ['dia', 'dia', 'dia', 'diamo', 'diate', 'diano'] },
  { inf: 'volere', de: 'wollen', abLevel: 7, pres: ['voglio', 'vuoi', 'vuole', 'vogliamo', 'volete', 'vogliono'], fut: 'vorr', cong: ['voglia', 'voglia', 'voglia', 'vogliamo', 'vogliate', 'vogliano'] },
  { inf: 'bere', de: 'trinken', abLevel: 7, part: 'bevuto', pres: ['bevo', 'bevi', 'beve', 'beviamo', 'bevete', 'bevono'], fut: 'berr', cong: ['beva', 'beva', 'beva', 'beviamo', 'beviate', 'bevano'], impf: 'beve' },
  { inf: 'potere', de: 'können', abLevel: 8, pres: ['posso', 'puoi', 'può', 'possiamo', 'potete', 'possono'], fut: 'potr', cong: ['possa', 'possa', 'possa', 'possiamo', 'possiate', 'possano'] },
  { inf: 'dovere', de: 'müssen', abLevel: 8, pres: ['devo', 'devi', 'deve', 'dobbiamo', 'dovete', 'devono'], fut: 'dovr', cong: ['debba', 'debba', 'debba', 'dobbiamo', 'dobbiate', 'debbano'] },
  { inf: 'sapere', de: 'wissen, können', abLevel: 8, pres: ['so', 'sai', 'sa', 'sappiamo', 'sapete', 'sanno'], fut: 'sapr', cong: ['sappia', 'sappia', 'sappia', 'sappiamo', 'sappiate', 'sappiano'] },
  { inf: 'giocare', de: 'spielen', abLevel: 8 },
  { inf: 'pagare', de: 'bezahlen', abLevel: 8 },
  { inf: 'comprare', de: 'kaufen', abLevel: 8 },
  { inf: 'dire', de: 'sagen', abLevel: 9, part: 'detto', pres: ['dico', 'dici', 'dice', 'diciamo', 'dite', 'dicono'], fut: 'dir', cong: ['dica', 'dica', 'dica', 'diciamo', 'diciate', 'dicano'], impf: 'dice' },
  { inf: 'mettere', de: 'legen, stellen', abLevel: 9, part: 'messo' },
  { inf: 'aprire', de: 'öffnen', abLevel: 9, part: 'aperto' },
  { inf: 'chiudere', de: 'schließen', abLevel: 9, part: 'chiuso' },
  { inf: 'chiedere', de: 'fragen, bitten', abLevel: 9, part: 'chiesto' },
  { inf: 'rispondere', de: 'antworten', abLevel: 9, part: 'risposto' },
  { inf: 'tornare', de: 'zurückkommen', abLevel: 10, essere: true },
  { inf: 'rimanere', de: 'bleiben', abLevel: 10, essere: true, part: 'rimasto', pres: ['rimango', 'rimani', 'rimane', 'rimaniamo', 'rimanete', 'rimangono'], fut: 'rimarr', cong: ['rimanga', 'rimanga', 'rimanga', 'rimaniamo', 'rimaniate', 'rimangano'] },
  { inf: 'conoscere', de: 'kennen', abLevel: 11, part: 'conosciuto' },
  { inf: 'vivere', de: 'leben', abLevel: 13, part: 'vissuto', fut: 'vivr' },
  { inf: 'cominciare', de: 'anfangen', abLevel: 13 },
]

const stamm = (inf: string): string => inf.slice(0, -3)
const gruppe = (inf: string): 'are' | 'ere' | 'ire' => inf.slice(-3) as 'are' | 'ere' | 'ire'

/** Stamm vor einer Endung, die mit i oder e beginnt: cerc → cerch, pag → pagh; mangi → mang */
function vorI(s: string, inf: string): string {
  if (gruppe(inf) !== 'are') return s
  if (/[cg]$/.test(s)) return s + 'h'
  if (/i$/.test(s)) return s.slice(0, -1)
  return s
}

function presente(v: Verb): Sechs {
  if (v.pres) return v.pres
  const s = stamm(v.inf), g = gruppe(v.inf)
  if (g === 'are') { const i = vorI(s, v.inf); return [s + 'o', i + 'i', s + 'a', i + 'iamo', s + 'ate', s + 'ano'] }
  if (g === 'ere') return [s + 'o', s + 'i', s + 'e', s + 'iamo', s + 'ete', s + 'ono']
  if (v.isc) return [s + 'isco', s + 'isci', s + 'isce', s + 'iamo', s + 'ite', s + 'iscono']
  return [s + 'o', s + 'i', s + 'e', s + 'iamo', s + 'ite', s + 'ono']
}
export function partizip(v: Verb): string {
  if (v.part) return v.part
  const s = stamm(v.inf), g = gruppe(v.inf)
  return s + (g === 'are' ? 'ato' : g === 'ere' ? 'uto' : 'ito')
}
const ESSERE = VERBEN_PRES('essere'), AVERE = VERBEN_PRES('avere')
function VERBEN_PRES(inf: 'essere' | 'avere'): Sechs {
  return inf === 'essere' ? ['sono', 'sei', 'è', 'siamo', 'siete', 'sono'] : ['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno']
}
function passato(v: Verb): Sechs {
  const p = partizip(v)
  if (!v.essere) return AVERE.map(h => `${h} ${p}`) as Sechs
  const mz = p.slice(0, -1) + 'i'
  return ESSERE.map((h, i) => `${h} ${i < 3 ? p : mz}`) as Sechs
}
function imperfetto(v: Verb): Sechs {
  if (Array.isArray(v.impf)) return v.impf
  const s = typeof v.impf === 'string' ? v.impf : v.inf.slice(0, -2)
  return [s + 'vo', s + 'vi', s + 'va', s + 'vamo', s + 'vate', s + 'vano']
}
function zukunftsStamm(v: Verb): string {
  if (v.fut) return v.fut
  const s = stamm(v.inf), g = gruppe(v.inf)
  if (g === 'ire') return s + 'ir'
  if (g === 'ere') return s + 'er'
  return vorI(s, v.inf) + 'er'
}
function futuro(v: Verb): Sechs { const s = zukunftsStamm(v); return [s + 'ò', s + 'ai', s + 'à', s + 'emo', s + 'ete', s + 'anno'] }
function condizionale(v: Verb): Sechs { const s = zukunftsStamm(v); return [s + 'ei', s + 'esti', s + 'ebbe', s + 'emmo', s + 'este', s + 'ebbero'] }
function congiuntivo(v: Verb): Sechs {
  if (v.cong) return v.cong
  const s = stamm(v.inf), g = gruppe(v.inf)
  if (g === 'are') { const i = vorI(s, v.inf); return [i + 'i', i + 'i', i + 'i', i + 'iamo', i + 'iate', i + 'ino'] }
  if (v.isc) return [s + 'isca', s + 'isca', s + 'isca', s + 'iamo', s + 'iate', s + 'iscano']
  return [s + 'a', s + 'a', s + 'a', s + 'iamo', s + 'iate', s + 'ano']
}

export function beuge(v: Verb, z: Zeit): Sechs {
  switch (z) {
    case 'presente': return presente(v)
    case 'passato': return passato(v)
    case 'imperfetto': return imperfetto(v)
    case 'futuro': return futuro(v)
    case 'condizionale': return condizionale(v)
    case 'congiuntivo': return congiuntivo(v)
  }
}

/** weitere richtige Schreibweisen: weibliche Form beim passato prossimo mit essere, mit Pronomen davor */
function auchRichtig(v: Verb, z: Zeit, person: number, form: string): string[] {
  const aus: string[] = []
  if (z === 'passato' && v.essere) aus.push(form.slice(0, -1) + (person < 3 ? 'a' : 'e'))
  const pronomen = [['io'], ['tu'], ['lui', 'lei'], ['noi'], ['voi'], ['loro']][person]
  for (const f of [form, ...aus.slice()]) for (const p of pronomen) aus.push(`${z === 'congiuntivo' ? 'che ' : ''}${p} ${f}`, `${p} ${f}`)
  if (z === 'congiuntivo') aus.push(`che ${form}`)
  return [...new Set(aus)]
}

export const zeitenBis = (level: number) => ZEITEN.filter(z => z.abLevel <= level)
export const verbenBis = (level: number): Verb[] => VERBEN.filter(v => v.abLevel <= level)

/** Aufgaben für den Verb-Trainer: Grundform + Person → Form tippen */
export function baueVerben(zeit: Zeit, level: number, start: number, anzahl: number): ATippen[] {
  const r = rng(start).zweig(`verben/${zeit}`)
  const z = ZEITEN.find(x => x.id === zeit)!
  const verben = verbenBis(Math.max(level, 3))
  const aus: ATippen[] = []
  const gesehen = new Set<string>()
  for (let i = 0; i < anzahl * 4 && aus.length < anzahl; i++) {
    const v = r.aus(verben), p = r.int(0, 5)
    const schluessel = `${v.inf}/${p}`
    if (gesehen.has(schluessel)) continue
    gesehen.add(schluessel)
    const form = beuge(v, zeit)[p]
    aus.push({
      typ: 'tippen', id: `vb-${zeit}-${v.inf}-${p}`, f: 'grammatik', kopf: `${z.name} · ${z.deutsch}`,
      frage: `${v.inf} (${v.de})`, vor: `${zeit === 'congiuntivo' ? 'che ' : ''}${PERSONEN[p]} `, nachText: '', loesung: form, auch: auchRichtig(v, zeit, p, form),
    })
  }
  return aus
}
