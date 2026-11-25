// Der Coach — Datum und Uhr an EINER Stelle (für Tests umstellbar). Ein „Tag“ ist der Kalendertag in Ortszeit,
// geschrieben als JJJJ-MM-TT. Nur diese Datei darf in kern/ die Uhr lesen (geprüft von .tmp-test/coach/regel_test.cjs).

let uhr: () => Date = () => new Date()
/** nur für Tests: die Uhr verstellen */
export function stelleUhr(f: (() => Date) | null): void { uhr = f ?? (() => new Date()) }
export const jetzt = (): Date => uhr()
export const jetztMs = (): number => uhr().getTime()

const zwei = (n: number): string => (n < 10 ? '0' : '') + n
export const datumVon = (d: Date): string => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`
export const heute = (): string => datumVon(jetzt())
export const uhrzeit = (): string => { const d = jetzt(); return `${zwei(d.getHours())}:${zwei(d.getMinutes())}` }

/** Datum → fortlaufende Tagnummer (Abstand in Tagen = Subtraktion) */
export function tagNummer(datum: string): number {
  const [j, m, t] = datum.split('-').map(Number)
  return Math.round(Date.UTC(j, (m || 1) - 1, t || 1) / 86_400_000)
}
export function datumAus(nummer: number): string {
  const d = new Date(nummer * 86_400_000)
  return `${d.getUTCFullYear()}-${zwei(d.getUTCMonth() + 1)}-${zwei(d.getUTCDate())}`
}
export const plusTage = (datum: string, n: number): string => datumAus(tagNummer(datum) + n)
/** 1 = Montag … 7 = Sonntag (ISO) */
export const wochentag = (datum: string): number => { const w = new Date(tagNummer(datum) * 86_400_000).getUTCDay(); return w === 0 ? 7 : w }
/** Montag der Woche */
export const wochenAnfang = (datum: string): string => plusTage(datum, 1 - wochentag(datum))
export const WOCHENTAGE = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
export const WT_KURZ = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export function datumText(datum: string): string {
  const [j, m, t] = datum.split('-').map(Number)
  return `${t}.${m}.${j}`
}
