// Der Coach — Auswertung einer Sprechaufnahme (Stufe 4). Reine Rechnung auf Abtastwerten, ohne Uhr und ohne Zufall.
// Gemessen wird nur, was sich ehrlich messen lässt: Sprechzeit, Pausen, Tempo (Silben je Sekunde Sprechzeit),
// wie stark die Satzenden abfallen, Lautstärke-Spannweite und Tonhöhen-Spannweite (Melodie).
// Es gibt keine Normwerte – der Maßstab ist immer die eigene Startaufnahme (Raum, Mikrofon und Tagesform verändern alles).

export interface Messung {
  /** Länge der Aufnahme ohne Stille am Anfang und Ende (s) */ sek: number
  /** reine Sprechzeit (s) */ sprechSek: number
  /** Pausen ab 0,25 s innerhalb der Rede */ pausen: number
  /** mittlere und längste Pause (s) */ pauseMittel: number; laengstePause: number
  /** Silben je Sekunde Sprechzeit (gezählt, wenn der Text bekannt ist, sonst geschätzt) */ tempo: number | null
  tempoGeschaetzt: boolean
  /** wie viel leiser die letzten 0,15 s eines Satzes sind als der Satz im Mittel (dB, größer = mehr „verschluckt“) */ satzende: number | null
  /** Spannweite der Lautstärke beim Sprechen (dB, 10.–90. Perzentil) */ dynamik: number
  /** Spannweite der Tonhöhe (Halbtöne, 10.–90. Perzentil); null, wenn zu wenig stimmhafte Stellen */ melodie: number | null
}

const HOP = 0.01, FENSTER = 0.02

function perzentil(werte: number[], p: number): number {
  if (!werte.length) return 0
  const s = [...werte].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))]
}
const mittel = (w: number[]): number => (w.length ? w.reduce((a, b) => a + b, 0) / w.length : 0)
const median = (w: number[]): number => perzentil(w, 0.5)

/** Lautstärke je 10-ms-Schritt in dB */
export function pegel(x: Float32Array, rate: number): number[] {
  const hop = Math.max(1, Math.round(HOP * rate)), len = Math.max(1, Math.round(FENSTER * rate))
  const aus: number[] = []
  for (let i = 0; i + len <= x.length; i += hop) {
    let s = 0
    for (let j = i; j < i + len; j++) s += x[j] * x[j]
    aus.push(10 * Math.log10(s / len + 1e-10))
  }
  return aus
}

/** stimmhaft/gesprochen je Schritt: Schwelle zwischen Grundrauschen und lauten Stellen, kleine Lücken gefüllt */
export const schwelleVon = (db: number[]): number => { const ruhe = perzentil(db, 0.1), laut = perzentil(db, 0.95); return Math.max(ruhe + 9, ruhe + (laut - ruhe) * 0.3) }
export function sprache(db: number[]): boolean[] {
  const schwelle = schwelleVon(db)
  const an = db.map(v => v > schwelle)
  // Lücken unter 0,15 s füllen (Verschlusslaute, kurze Atemzüge mitten im Wort)
  for (let i = 0; i < an.length;) {
    if (an[i]) { i++; continue }
    let j = i; while (j < an.length && !an[j]) j++
    if (i > 0 && j < an.length && (j - i) * HOP < 0.15) for (let k = i; k < j; k++) an[k] = true
    i = j
  }
  // Inseln unter 0,06 s entfernen (Klicks, Rascheln)
  for (let i = 0; i < an.length;) {
    if (!an[i]) { i++; continue }
    let j = i; while (j < an.length && an[j]) j++
    if ((j - i) * HOP < 0.06) for (let k = i; k < j; k++) an[k] = false
    i = j
  }
  return an
}

/** Grundfrequenz eines Abschnitts per Autokorrelation (70–400 Hz); null, wenn nicht deutlich periodisch */
export function grundton(x: Float32Array, start: number, len: number, rate: number): number | null {
  const minLag = Math.floor(rate / 400), maxLag = Math.min(len - 1, Math.ceil(rate / 70))
  let e0 = 0
  for (let i = start; i < start + len; i++) e0 += x[i] * x[i]
  if (e0 <= 1e-8) return null
  let best = 0, bestLag = 0
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0, e1 = 0
    for (let i = start; i < start + len - lag; i++) { s += x[i] * x[i + lag]; e1 += x[i + lag] * x[i + lag] }
    const r = s / Math.sqrt(e0 * e1 + 1e-12)
    if (r > best) { best = r; bestLag = lag }
  }
  return best >= 0.55 && bestLag ? rate / bestLag : null
}

/** Silben schätzen: Gipfel der geglätteten Lautstärke innerhalb gesprochener Stellen (mind. 3 dB, 0,1 s Abstand) */
export function silbenSchaetzen(db: number[], an: boolean[]): number {
  const glatt = db.map((_, i) => { let s = 0, n = 0; for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < db.length) { s += db[k]; n++ } return s / n })
  let n = 0, letzter = -999
  for (let i = 1; i < glatt.length - 1; i++) {
    if (!an[i] || glatt[i] < glatt[i - 1] || glatt[i] < glatt[i + 1]) continue
    let tal = glatt[i]
    for (let k = i - 1; k >= Math.max(0, i - 15); k--) tal = Math.min(tal, glatt[k])
    if (glatt[i] - tal >= 3 && i - letzter >= 10) { n++; letzter = i }
  }
  return n
}

export function analysiere(x: Float32Array, rate: number, silben?: number): Messung | null {
  if (x.length < rate * 0.5) return null
  const db = pegel(x, rate)
  const an = sprache(db)
  const erster = an.indexOf(true), letzter = an.lastIndexOf(true)
  if (erster < 0 || (letzter - erster) * HOP < 0.5) return null
  // Abschnitte (Sätze/Phrasen) und Pausen dazwischen
  const stuecke: [number, number][] = []
  const pausen: number[] = []
  for (let i = erster; i <= letzter;) {
    if (an[i]) { let j = i; while (j <= letzter && an[j]) j++; stuecke.push([i, j]); i = j; continue }
    let j = i; while (j <= letzter && !an[j]) j++
    if ((j - i) * HOP >= 0.25) pausen.push((j - i) * HOP)
    i = j
  }
  const sprechSek = stuecke.reduce((s, [a, b]) => s + (b - a) * HOP, 0)
  const schwelle = schwelleVon(db)
  const gesprochen = db.filter((v, i) => an[i] && v > schwelle)
  // Satzenden: Phrasen ab 0,4 s, die vor einer Pause ab 0,25 s oder am Ende stehen
  const abfall: number[] = []
  for (const [a, b] of stuecke) {
    if ((b - a) * HOP < 0.4) continue
    const ende = db.slice(Math.max(a, b - 15), b), ganz = db.slice(a, b)
    abfall.push(median(ganz) - mittel(ende))
  }
  // Melodie: Grundton alle 50 ms an deutlich lauten Stellen (Rechenzeit klein halten)
  const f0: number[] = []
  const len = Math.round(0.04 * rate), hop = Math.round(HOP * rate)
  for (let i = erster; i <= letzter; i += 5) if (an[i] && db[i] > schwelle + 6 && i * hop + len < x.length) { const f = grundton(x, i * hop, len, rate); if (f) f0.push(f) }
  const ht = f0.length >= 20 ? f0.map(f => 12 * Math.log2(f / median(f0))) : []
  const n = silben ?? silbenSchaetzen(db, an)
  return {
    sek: Math.round((letzter - erster) * HOP * 10) / 10,
    sprechSek: Math.round(sprechSek * 10) / 10,
    pausen: pausen.length,
    pauseMittel: Math.round(mittel(pausen) * 100) / 100,
    laengstePause: Math.round(Math.max(0, ...pausen) * 100) / 100,
    tempo: sprechSek >= 2 && n > 0 ? Math.round((n / sprechSek) * 10) / 10 : null,
    tempoGeschaetzt: silben === undefined,
    satzende: abfall.length ? Math.round(mittel(abfall) * 10) / 10 : null,
    dynamik: Math.round((perzentil(gesprochen, 0.9) - perzentil(gesprochen, 0.1)) * 10) / 10,
    melodie: ht.length ? Math.round((perzentil(ht, 0.9) - perzentil(ht, 0.1)) * 10) / 10 : null,
  }
}

export interface Vergleich { was: string; start: string; jetzt: string; satz: string }

/** Vergleich mit der Startaufnahme – nur Unterschiede, die über das Messrauschen hinausgehen, mit vorsichtiger Deutung */
export function vergleiche(start: Messung, jetzt: Messung): Vergleich[] {
  const aus: Vergleich[] = []
  const zahl = (v: number | null, e = '') => (v === null ? '–' : `${String(v).replace('.', ',')}${e}`)
  if (start.tempo !== null && jetzt.tempo !== null) {
    const d = (jetzt.tempo - start.tempo) / start.tempo
    aus.push({ was: 'Tempo (Silben je Sekunde)', start: zahl(start.tempo), jetzt: zahl(jetzt.tempo), satz: Math.abs(d) < 0.08 ? 'etwa gleich schnell' : d < 0 ? `rund ${Math.round(-d * 100)} % ruhiger` : `rund ${Math.round(d * 100)} % schneller` })
  }
  const proMinS = start.sek ? (start.pausen / start.sek) * 60 : 0, proMinJ = jetzt.sek ? (jetzt.pausen / jetzt.sek) * 60 : 0
  aus.push({ was: 'Pausen je Minute', start: zahl(Math.round(proMinS)), jetzt: zahl(Math.round(proMinJ)), satz: Math.abs(proMinJ - proMinS) < 2 ? 'etwa gleich viele Pausen' : proMinJ > proMinS ? 'mehr Pausen – gut, wenn sie an Satzenden sitzen' : 'weniger Pausen' })
  if (start.satzende !== null && jetzt.satzende !== null) {
    const d = jetzt.satzende - start.satzende
    aus.push({ was: 'Abfall am Satzende (dB)', start: zahl(start.satzende), jetzt: zahl(jetzt.satzende), satz: Math.abs(d) < 1.5 ? 'Satzenden etwa wie am Anfang' : d < 0 ? 'Satzenden tragen besser' : 'Satzenden fallen stärker ab' })
  }
  if (start.melodie !== null && jetzt.melodie !== null) {
    const d = jetzt.melodie - start.melodie
    aus.push({ was: 'Tonhöhen-Spannweite (Halbtöne)', start: zahl(start.melodie), jetzt: zahl(jetzt.melodie), satz: Math.abs(d) < 1 ? 'Melodie etwa gleich' : d > 0 ? 'mehr Melodie in der Stimme' : 'flacher als am Anfang' })
  }
  aus.push({ was: 'Lautstärke-Spannweite (dB)', start: zahl(start.dynamik), jetzt: zahl(jetzt.dynamik), satz: Math.abs(jetzt.dynamik - start.dynamik) < 2 ? 'etwa gleich lebendig' : jetzt.dynamik > start.dynamik ? 'lebendiger in der Lautstärke' : 'gleichmäßiger in der Lautstärke' })
  return aus
}
