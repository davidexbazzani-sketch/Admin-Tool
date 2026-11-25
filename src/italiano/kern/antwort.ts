// Parla Italiano — getippte Antworten nachsichtig prüfen.
// Richtig ist richtig; ein fehlender Akzent, ein fehlender Artikel oder ein kleiner Tippfehler
// zählt ebenfalls, wird aber angezeigt („fast“), damit man es beim nächsten Mal besser macht.

export type Urteil = 'richtig' | 'fast' | 'falsch'
export interface Pruefung { urteil: Urteil; /** was genau nicht stimmte (nur bei „fast“) */ hinweis?: string }

/** Schreibweise angleichen: Kleinbuchstaben, gerade Apostrophe, keine Satzzeichen am Rand, einfache Leerzeichen */
export function glatt(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[‘’‛`´]/g, "'")
    .replace(/'\s+/g, "'")
    .replace(/[«»"“”„]/g, '')
    .replace(/[.!?…,;:]+$/g, '')
    .replace(/^[¡¿\s]+/g, '')
    .replace(/\s*([,;:!?])\s*/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim()
}
/** Akzente entfernen (è → e) */
export const ohneAkzent = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Satzzeichen ganz weg (für den Vergleich ganzer Sätze) */
const ohneZeichen = (s: string): string => s.replace(/[,;:!?.…]/g, '').replace(/\s+/g, ' ').trim()

const ARTIKEL = /^(il|lo|la|i|gli|le|un|uno|una)\s+|^(l'|un')/
export const ohneArtikel = (s: string): string => s.replace(ARTIKEL, '')

function abstand(a: string, b: string): number {
  if (a === b) return 0
  const m = a.length, n = b.length
  if (Math.abs(m - n) > 2) return 3
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => { const z = new Array<number>(n + 1).fill(0); z[0] = i; return z })
  for (let j = 0; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + kosten)
      // vertauschte Nachbarn zählen als ein Fehler
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[m][n]
}

/** Unterscheiden sich die beiden nur in einem Wortende? Dann ist es Grammatik (amico/amica), kein Tippfehler. */
function nurEndungAnders(a: string, b: string): boolean {
  const wa = a.split(' '), wb = b.split(' ')
  if (wa.length !== wb.length) return false
  let anders = 0
  for (let i = 0; i < wa.length; i++) {
    if (wa[i] === wb[i]) continue
    anders++
    if (wa[i].slice(0, -1) !== wb[i].slice(0, -1)) return false
  }
  return anders > 0
}

function vergleiche(eingabe: string, soll: string): Pruefung {
  const e = ohneZeichen(glatt(eingabe)), s = ohneZeichen(glatt(soll))
  if (!e) return { urteil: 'falsch' }
  if (e === s) return { urteil: 'richtig' }
  if (ohneAkzent(e) === ohneAkzent(s)) return { urteil: 'fast', hinweis: 'Achte auf den Akzent.' }
  if (ohneArtikel(s) !== s && ohneAkzent(e) === ohneAkzent(ohneArtikel(s))) return { urteil: 'fast', hinweis: 'Lern das Wort gleich mit Artikel.' }
  const ea = ohneAkzent(e), sa = ohneAkzent(s)
  const d = abstand(ea, sa)
  const erlaubt = sa.length >= 12 ? 2 : sa.length >= 6 ? 1 : 0
  if (d > 0 && d <= erlaubt && !nurEndungAnders(ea, sa)) return { urteil: 'fast', hinweis: 'Kleiner Tippfehler.' }
  return { urteil: 'falsch' }
}

/** Eingabe gegen die Lösung und weitere zugelassene Schreibweisen prüfen */
export function pruefeEingabe(eingabe: string, loesung: string, auch: readonly string[] = []): Pruefung {
  let beste: Pruefung = { urteil: 'falsch' }
  for (const soll of [loesung, ...auch]) {
    const p = vergleiche(eingabe, soll)
    if (p.urteil === 'richtig') return p
    if (p.urteil === 'fast' && beste.urteil === 'falsch') beste = p
  }
  return beste
}

/** Satz in Wortkacheln zerlegen (Satzzeichen bleiben am Wort) */
export function inKacheln(satz: string): string[] {
  return satz.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
}
/** Kacheln wieder zum Satz — für den Vergleich beim Satzbau */
export const satzGleich = (a: string[], b: string[]): boolean => glatt(a.join(' ')) === glatt(b.join(' '))

// ── Wortkacheln ohne verräterische Zeichen ──────────────────────────────────────────────
// Satzzeichen und der große Anfangsbuchstabe würden die Reihenfolge verraten («Buongiorno!» vorn, «favore.» hinten).
// Deshalb zeigen die Kacheln nur das Wort, und der Satzanfang steht klein. Groß bleibt, was im Kurs auch mitten
// im Satz groß geschrieben wird (Namen, Städte, Länder — die Liste erzeugt scripts/italiano-namen.mjs).

/** Satzzeichen am Rand entfernen. Apostrophe gehören zum Wort («l'amico», «un po'»). */
export const kachelKern = (t: string): string => t.replace(/^[«"“„(¿¡.…\-–—]+/, '').replace(/[»"”“).,;:!?…\-–—]+$/, '')
const SATZENDE = /[.!?…]["»”)]?$/
const ZITATBEGINN = /^[«"“„]/
const istGross = (w: string): boolean => w[0] !== w[0].toLowerCase()
const gerade = (s: string): string => s.replace(/[‘’‛`´]/g, "'")
/** Satz in Kacheln zum Legen zerlegen: ohne Satzzeichen, Satzanfänge klein — außer bei Eigennamen. */
export function legeKacheln(satz: string, namen: ReadonlySet<string>): string[] {
  const aus: string[] = []
  let anfang = true
  for (const r of inKacheln(gerade(satz))) {
    const k = kachelKern(r)
    if (k) aus.push((anfang || ZITATBEGINN.test(r)) && istGross(k) && !namen.has(k) ? k[0].toLowerCase() + k.slice(1) : k)
    anfang = SATZENDE.test(r) || (!k && anfang)
  }
  return aus
}
/** ein Satz nur aus seinen Wörtern, zum Vergleich mit gelegten Kacheln */
export const nurWoerter = (satz: string): string => glatt(inKacheln(gerade(satz)).map(kachelKern).filter(Boolean).join(' '))

