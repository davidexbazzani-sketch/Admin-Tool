// ── Geführte Diagnose: Sonden ausführen, Regeln auswerten ────────────────────
import type { PaAktion } from '../motor'
import type { DgBefund, DgFakten, DgPunkt, DgRegel, DgSonde, DgSondenErgebnis, DgUnter, DgWert } from './types'

const TAG = '@@DG@@'

/** Kopf jeder Sonde: Fakt/Punkt sammeln. $P = Sonden-ID (Präfix der Fakten). */
export const DG_KOPF = String.raw`
$dgS = [string]$P
$dgF = @{}
$dgP = New-Object System.Collections.Generic.List[object]
function Fakt([string]$n, $v) { $dgF[$dgS + '.' + $n] = $v }
function Punkt([string]$t, [string]$s, [string]$x) { [void]$dgP.Add(@{ t = $t; s = $s; x = $x }) }
`
/** Fuß: Ergebnis als eine Zeile ausgeben (auch wenn die Sonde mittendrin scheitert, siehe sondeAlsAktion). */
const DG_FUSS = String.raw`
Zeile ('${TAG}' + (@{ f = $dgF; p = @($dgP | ForEach-Object { [pscustomobject]$_ }) } | ConvertTo-Json -Compress -Depth 5))
`

/** Sonde als lesender Baustein (gleiche Ausführung wie im Problem-Assistenten). */
export function sondeAlsAktion(s: DgSonde): PaAktion {
  return {
    id: 'dg-' + s.id, titel: s.titel, beschreibung: 'Diagnose-Prüfung (liest nur)', modus: s.modus, risiko: 'lesen',
    timeoutMs: s.timeoutMs ?? 90_000,
    // Fehler in der Sonde selbst → als Punkt melden, Fakten bis dahin trotzdem ausgeben
    ps: DG_KOPF + 'try {\n' + s.ps + '\n} catch { Punkt \'Prüfung abgebrochen\' \'warn\' ([string]$_.Exception.Message) }\n' + DG_FUSS,
  }
}

/** Ergebnis-Zeile einer Sonde lesen. */
export function leseSonde(zeilen: string[]): { fakten: DgFakten; punkte: DgPunkt[] } | null {
  const z = [...zeilen].reverse().find(l => l.startsWith(TAG))
  if (!z) return null
  try {
    const j = JSON.parse(z.slice(TAG.length)) as { f?: Record<string, unknown>; p?: unknown }
    const fakten: DgFakten = {}
    for (const [k, v] of Object.entries(j.f || {})) fakten[k] = normalisiere(v)
    const punkte = (Array.isArray(j.p) ? j.p : j.p ? [j.p] : []) as DgPunkt[]
    return { fakten, punkte: punkte.filter(p => p && p.t).map(p => ({ t: String(p.t), s: (['ok', 'warn', 'fehler', 'info'].includes(p.s) ? p.s : 'info'), x: p.x ? String(p.x) : undefined })) }
  } catch { return null }
}
function normalisiere(v: unknown): DgWert {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.map(x => String(x))
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v
  return JSON.stringify(v)
}

// ── Helfer für Regeln (fehlender Fakt ⇒ nie Treffer) ────────────────────────
export const num = (v: DgWert | undefined): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : NaN)
export const ja = (v: DgWert | undefined): boolean => v === true || v === 'true' || v === 'ja'
export const nein = (v: DgWert | undefined): boolean => v === false || v === 'false' || v === 'nein'
export const txt = (v: DgWert | undefined): string => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v))
export const liste = (v: DgWert | undefined): string[] => (Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [String(v)])
/** Zahl für Befund-Texte auf Deutsch („48,2“). Kein Zahlwert → Text unverändert. */
export const zahl = (v: DgWert | undefined): string => { const n = num(v); return isNaN(n) ? txt(v) : n.toLocaleString('de-DE', { maximumFractionDigits: 1 }) }

/** Alle Regeln eines Unterthemas auswerten → Befunde, wichtigste zuerst, je Problem nur einmal. */
export function werteAus(u: DgUnter, f: DgFakten): DgBefund[] {
  const out: DgBefund[] = []
  for (const r of u.regeln) {
    let trifft = false
    try { trifft = r.wenn(f) === true } catch { trifft = false }
    if (!trifft) continue
    let text = ''
    try { text = r.befund(f) } catch { text = '' }
    out.push({ regel: r.id, problem: r.problem, text: text || r.id, schwere: r.schwere })
  }
  out.sort((a, b) => b.schwere - a.schwere)
  const gesehen = new Set<string>()
  return out.filter(b => (gesehen.has(b.problem) ? false : (gesehen.add(b.problem), true)))
}

/** Sonden eines Unterthemas ausführen (max. 2 gleichzeitig) und Fortschritt melden. */
export async function fuehreDiagnose(
  host: string, u: DgUnter, sonden: Map<string, DgSonde>, antworten: Record<string, 'ja' | 'nein'>,
  melde: (e: DgSondenErgebnis, laeuft: string[]) => void, ctx: { sam?: string } = {},
): Promise<{ fakten: DgFakten; ergebnisse: DgSondenErgebnis[]; befunde: DgBefund[] }> {
  const { fuehreAus } = await import('../motor')
  const fakten: DgFakten = {}
  for (const [k, v] of Object.entries(antworten)) fakten['frage.' + k] = v
  const ergebnisse: DgSondenErgebnis[] = []
  const liste = u.sonden.map(id => sonden.get(id)).filter((s): s is DgSonde => !!s)
  const laeuft = new Set<string>()
  let i = 0
  const arbeiter = async () => {
    for (;;) {
      const s = liste[i++]
      if (!s) return
      laeuft.add(s.id)
      melde({ id: s.id, titel: s.titel, ok: true, punkte: [], dauerMs: 0 }, [...laeuft])
      const t0 = Date.now()
      const r = await fuehreAus(host, sondeAlsAktion(s), s.id, { sam: ctx.sam })
      const g = leseSonde(r.zeilen)
      const e: DgSondenErgebnis = g
        ? { id: s.id, titel: s.titel, ok: true, punkte: g.punkte, dauerMs: Date.now() - t0 }
        : { id: s.id, titel: s.titel, ok: false, fehler: r.fehler || 'keine Antwort', punkte: [], dauerMs: Date.now() - t0 }
      if (g) Object.assign(fakten, g.fakten)
      fakten[s.id + '._ok'] = !!g
      ergebnisse.push(e)
      laeuft.delete(s.id)
      melde(e, [...laeuft])
    }
  }
  await Promise.all([arbeiter(), arbeiter()])
  return { fakten, ergebnisse, befunde: werteAus(u, fakten) }
}

export type { DgRegel }
