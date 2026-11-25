// Terra Incognita — die Uhr: Kalendertag in Berliner Zeit als fortlaufende Nummer. Der Kern (kern/) fragt nie selbst
// nach der Zeit, er bekommt sie von hier. Öffentlich gezeigt werden immer nur Tage, nie Uhrzeiten.

const BERLIN = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })

/** Tagesnummer (Tage seit 1.1.1970) des Berliner Kalendertags zu einem Zeitpunkt */
export function tagNr(ms: number = Date.now()): number {
  const [j, m, t] = BERLIN.format(new Date(ms)).split('-').map(Number)
  return Math.floor(Date.UTC(j, m - 1, t) / 86400000)
}

/** „21.11.2026“ */
export function tagText(nr: number): string {
  const d = new Date(nr * 86400000)
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`
}
/** „21.11.“ */
export const tagKurz = (nr: number): string => tagText(nr).slice(0, 6)
/** Wochentag 0 = Sonntag … 6 = Samstag */
export const wochentag = (nr: number): number => new Date(nr * 86400000).getUTCDay()
/** „heute“, „gestern“, „vor 3 Tagen“, sonst das Datum */
export function tagRelativ(nr: number, heute: number = tagNr()): string {
  const d = heute - nr
  return d <= 0 ? 'heute' : d === 1 ? 'gestern' : d < 7 ? `vor ${d} Tagen` : `am ${tagKurz(nr)}`
}
