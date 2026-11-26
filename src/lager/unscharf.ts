// Unscharfer Textvergleich für Kommentare: Groß/Klein, Umlaute, Bindestriche, Wortreihenfolge, Tippfehler.

/** Kleinbuchstaben, Umlaute ausgeschrieben (ä → ae …), ß → ss. */
export function normalisiere(s: string): string {
  return (s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[‐-―]/g, '-')
}

/** Wörter (nur Buchstaben/Ziffern). */
export function woerter(s: string): string[] {
  return normalisiere(s).split(/[^a-z0-9]+/).filter(Boolean)
}

/** Damerau-Levenshtein (Variante „optimal string alignment“): Einfügen, Löschen, Ersetzen, Vertauschen. */
export function abstand(a: string, b: string): number {
  if (a === b) return 0
  const n = a.length, m = b.length
  if (!n) return m
  if (!m) return n
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => {
    const z = new Array<number>(m + 1).fill(0)
    z[0] = i
    return z
  })
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const k = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + k)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1)
      d[i][j] = v
    }
  }
  return d[n][m]
}

function erlaubt(len: number): number {
  return len <= 4 ? 0 : len <= 7 ? 1 : 2
}

/**
 * Passt ein Wort zum Schlüssel?
 * - Schlüssel mit „*“ am Ende = Wortanfang („abhol*“ trifft „abholung“, „abholbereit“).
 * - Kurze Schlüssel (≤ 4 Zeichen): nur genau, als Wortteil („biospasswort“) oder mit Buchstabendreher.
 * - Länger: 1 (5–7 Zeichen) bzw. 2 Tippfehler (ab 8), erster Buchstabe muss stimmen.
 */
export function passt(wort: string, schluessel: string): boolean {
  const praefix = schluessel.endsWith('*')
  const key = praefix ? schluessel.slice(0, -1) : schluessel
  if (!wort || !key) return false
  if (praefix) {
    if (wort.startsWith(key)) return true
    if (key.length < 5 || wort[0] !== key[0]) return false
    // Tippfehler im Wortanfang („abhlung“, „angmeldet“)
    for (const len of [key.length - 1, key.length, key.length + 1]) {
      if (len <= wort.length && abstand(wort.slice(0, len), key) <= 1) return true
    }
    return false
  }
  if (wort === key) return true
  if (key.length <= 2) return false
  if (key.length <= 4) {
    if (wort.length > key.length && wort.includes(key)) return true
    return wort.length === key.length && abstand(wort, key) === 1 && vertauscht(wort, key)
  }
  if (wort[0] !== key[0]) return false
  // Wortteil bei längeren Schlüsseln („biospasswortgeloescht“)
  if (wort.length > key.length + 2 && wort.includes(key)) return true
  return abstand(wort, key) <= erlaubt(key.length)
}

function vertauscht(a: string, b: string): boolean {
  for (let i = 0; i < a.length - 1; i++) {
    if (a[i] !== b[i]) return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
  }
  return false
}

/** Enthält die Wortliste ein Wort, das zu einem der Schlüssel passt? */
export function hat(ws: string[], ...schluessel: string[]): boolean {
  return ws.some(w => schluessel.some(k => passt(w, k)))
}
