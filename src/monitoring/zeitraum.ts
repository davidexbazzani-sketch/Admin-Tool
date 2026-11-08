// ── PC-Überwachung: Zeitraum-Schnellwahl (rein, testbar) ─────────────────────

export interface ZeitVorschlag { id: string; titel: string; bis: Date }

const WT_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const um = (d: Date, h: number, m = 0) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x }
const plusTage = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/** Nächster Werktag (Mo–Fr) nach heute. */
function naechsterWerktag(jetzt: Date): Date { let d = plusTage(jetzt, 1); while (d.getDay() === 0 || d.getDay() === 6) d = plusTage(d, 1); return d }
/** Nächster Montag (nicht heute). */
function naechsterMontag(jetzt: Date): Date { let d = plusTage(jetzt, 1); while (d.getDay() !== 1) d = plusTage(d, 1); return d }

export function zeitVorschlaege(jetzt = new Date()): ZeitVorschlag[] {
  const out: ZeitVorschlag[] = []
  const add = (id: string, titel: string, bis: Date) => { if (bis.getTime() - jetzt.getTime() >= 20 * 60_000 && !out.some(o => o.bis.getTime() === bis.getTime())) out.push({ id, titel, bis }) }
  add('4h', '4 Stunden', new Date(jetzt.getTime() + 4 * 3600_000))
  add('heute', 'bis heute 18:00', um(jetzt, 18))
  const wt = naechsterWerktag(jetzt)
  add('werktag', `bis ${wt.getDay() === plusTage(jetzt, 1).getDay() ? 'morgen' : WT_LANG[wt.getDay()]} 18:00`, um(wt, 18))
  const mo = naechsterMontag(jetzt)
  add('montag', `bis Montag ${String(mo.getDate()).padStart(2, '0')}.${String(mo.getMonth() + 1).padStart(2, '0')}. 18:00`, um(mo, 18))
  add('3t', '3 Tage', new Date(jetzt.getTime() + 3 * 86400_000))
  add('1w', '1 Woche', um(plusTage(jetzt, 7), 18))
  return out
}

/** Standard nach einer Behebung: bis zum übernächsten Werktag 18:00. */
export function standardBis(jetzt = new Date()): Date {
  const a = naechsterWerktag(jetzt)
  let b = plusTage(a, 1); while (b.getDay() === 0 || b.getDay() === 6) b = plusTage(b, 1)
  return um(b, 18)
}

export function bisText(d: Date): string {
  return `${WT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Wert für <input type="datetime-local"> in Ortszeit. */
export function alsLokal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export const MAX_LAUFZEIT_TAGE = 31
