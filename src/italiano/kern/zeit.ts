// Parla Italiano — Datum und Uhr an einer Stelle (für Tests umstellbar).
// Ein „Tag“ ist der Kalendertag in Ortszeit, geschrieben als JJJJ-MM-TT.

let uhr: () => Date = () => new Date()
/** nur für Tests: die Uhr des Bereichs verstellen */
export function stelleUhr(f: (() => Date) | null): void { uhr = f ?? (() => new Date()) }
export const jetzt = (): Date => uhr()

const zwei = (n: number): string => (n < 10 ? '0' : '') + n
export const datumVon = (d: Date = jetzt()): string => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`
export const heute = (): string => datumVon(jetzt())

/** Datum → fortlaufende Tagnummer (Abstand in Tagen ist einfache Subtraktion) */
export function tagNummer(datum: string): number {
  const [j, m, t] = datum.split('-').map(Number)
  return Math.round(Date.UTC(j, (m || 1) - 1, t || 1) / 86_400_000)
}
export function datumAus(nummer: number): string {
  const d = new Date(nummer * 86_400_000)
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`
}
export const plusTage = (datum: string, n: number): string => datumAus(tagNummer(datum) + n)
/** 0 = Sonntag … 6 = Samstag */
export const wochentag = (datum: string): number => new Date(tagNummer(datum) * 86_400_000).getUTCDay()
export const istWochenende = (datum: string): boolean => { const w = wochentag(datum); return w === 0 || w === 6 }

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
export const wochentagName = (datum: string): string => WOCHENTAGE[wochentag(datum)]
export function datumText(datum: string): string {
  const [j, m, t] = datum.split('-').map(Number)
  return `${t}.${m}.${j}`
}
