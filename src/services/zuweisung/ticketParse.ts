// ── Ganzes ServiceNow-Ticket (Text ODER OCR-Text) in Engine-Felder zerlegen ───
// Label-basiert und tolerant (OCR-Rauschen, DE/EN-Labels, Werte gleiche Zeile oder
// nächste Zeile). Assignment group / CI / Subcategory werden auf die bekannten
// Werte normalisiert; alles bleibt frei überschreibbar.

import type { Eingabe } from './types'

interface OptionenLite { queues: string[]; cis: string[]; subcats: string[] }
type Key = 'group' | 'ci' | 'sub' | 'caller' | 'short' | 'desc' | '_ignore'

const LABELS: { key: Key; re: RegExp }[] = [
  { key: 'group', re: /^\s*assignment\s*group\b/i },
  { key: 'short', re: /^\s*(short\s*description|kurzbeschreibung)\b/i },
  { key: 'ci', re: /^\s*(configuration\s*item|config\.?\s*item|\bci)\b/i },
  { key: 'sub', re: /^\s*(sub-?\s*category|unterkategorie)\b/i },
  { key: 'caller', re: /^\s*(caller|melder|anrufer)\b/i },
  { key: 'desc', re: /^\s*(description|beschreibung|additional comments|kommentar)(\s*html)?\b/i },
  // Nur als Trenn-/Ignorier-Labels:
  { key: '_ignore', re: /^\s*(category|kategorie|number|nummer|state|status|priority|priorität|opened|assigned to|opened by|closed by|close notes|contact type|impact|urgency|company|location)\b/i },
]

function stripHtml(s: string): string {
  return s.replace(/<br\s*\/?>(\s*)/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#34;|&quot;/gi, '"').replace(/&#39;/gi, "'")
}
function norm(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, '') }

function matchQueue(value: string, queues: string[]): string | null {
  const v = norm(value); if (!v) return null
  let best: { q: string; score: number } | null = null
  for (const q of queues) {
    const nq = norm(q)
    let score = 0
    if (v === nq) score = 100
    else if (v.includes(nq) || nq.includes(v)) score = 80
    else { // Token-Überlappung (z. B. "non hr" / "external")
      const tokens = q.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2)
      const hit = tokens.filter(t => value.toLowerCase().includes(t)).length
      score = tokens.length ? (hit / tokens.length) * 70 : 0
    }
    if (!best || score > best.score) best = { q, score }
  }
  return best && best.score >= 45 ? best.q : null
}
function matchExact(value: string, options: string[]): string | null {
  const v = norm(value); if (!v) return null
  for (const o of options) if (norm(o) === v) return o
  return null
}
function matchCi(value: string, cis: string[]): string | null {
  const exact = matchExact(value, cis); if (exact) return exact
  const v = norm(value); if (v.length < 3) return null
  // enthält / ist enthalten (OCR schneidet manchmal ab)
  let best: { c: string; score: number } | null = null
  for (const c of cis) {
    const nc = norm(c)
    const score = v === nc ? 100 : nc.includes(v) || v.includes(nc) ? Math.min(nc.length, v.length) : 0
    if (score && (!best || score > best.score)) best = { c, score }
  }
  return best ? best.c : null
}

// Kontrollierte Felder (Queue/CI/Subcategory) im GESAMTEN Text suchen — robust
// gegen OCR-Rauschen und Zwei-Spalten-Layouts, wo Label und Wert weit auseinander
// stehen. Nutzt bekannte Werte als Anker (längster Treffer gewinnt).
function scanControlled(whole: string, optionen: OptionenLite, genericSet: Set<string>): { group?: string; ci?: string; sub?: string } {
  const T = norm(whole)
  const findLongest = (cands: string[], minLen: number): string | undefined => {
    let best: { val: string; len: number } | null = null
    for (const c of cands) { const nc = norm(c); if (nc.length >= minLen && T.includes(nc) && (!best || nc.length > best.len)) best = { val: c, len: nc.length } }
    return best?.val
  }
  // Generische CIs (Hardware, CORP, OTHERS, Desktop Setup …) NICHT per Volltext raten —
  // die tauchen oft in der Browser-/Lesezeichenleiste auf (Fehltreffer). Nur über das echte CI-Label.
  const spezifischeCis = optionen.cis.filter(c => !genericSet.has(norm(c)))
  return { group: findLongest(optionen.queues, 8), ci: findLongest(spezifischeCis, 5), sub: findLongest(optionen.subcats, 8) }
}

export interface ParseErgebnis extends Partial<Eingabe> { erkannt: Record<string, string> }

export function parseTicketText(text: string, optionen: OptionenLite, generics: string[] = []): ParseErgebnis {
  let lines = stripHtml(text || '').replace(/\r/g, '').split('\n')
    .map(l => l.replace(/ /g, ' ').replace(/\t/g, ' ').replace(/ {2,}/g, ' ').replace(/\s+$/, ''))

  const labelAt = (l: string): { key: Key; rest: string } | null => {
    for (const L of LABELS) { const m = L.re.exec(l); if (m) return { key: L.key, rest: l.slice(m[0].length).replace(/^[\s:>\-–|·.]+/, '').trim() } }
    return null
  }

  // Browser-„Chrome" (Tab-Titel, Lesezeichenleiste, Menü) vor dem ersten echten
  // ServiceNow-Feld abschneiden — sonst raten Volltext-Scans an Lesezeichen (z. B. „Hardware").
  let firstLabel = -1
  for (let i = 0; i < lines.length; i++) { if (labelAt(lines[i])) { firstLabel = i; break } }
  if (firstLabel > 0) lines = lines.slice(firstLabel)

  const genericSet = new Set(generics.map(norm))
  const fields: Record<string, string> = {}
  for (let i = 0; i < lines.length; i++) {
    const info = labelAt(lines[i]); if (!info) continue
    const { key, rest } = info
    if (key === '_ignore') continue
    let value = rest
    if (!value) {
      for (let j = i + 1; j < lines.length; j++) { if (!lines[j].trim()) continue; if (labelAt(lines[j])) break; value = lines[j].trim(); i = j; break }
    }
    if (key === 'desc') {
      const parts: string[] = []; if (value) parts.push(value)
      for (let j = i + 1; j < lines.length; j++) { if (labelAt(lines[j])) break; parts.push(lines[j]) }
      value = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000)
    }
    if (fields[key] === undefined && value) fields[key] = value
  }

  const scan = scanControlled(lines.join(' '), optionen, genericSet)
  const group = matchQueue(fields.group || '', optionen.queues) || scan.group || fields.group || undefined
  const ci = matchCi(fields.ci || '', optionen.cis) || scan.ci || fields.ci || undefined
  const sub = matchExact(fields.sub || '', optionen.subcats) || scan.sub || undefined

  const out: ParseErgebnis = { erkannt: {} }
  if (group) out.group = group
  if (ci) out.ci = ci
  if (sub) out.sub = sub
  if (fields.caller) out.caller = fields.caller
  if (fields.short) out.short = fields.short
  if (fields.desc) out.desc = fields.desc
  // erkannt = die tatsächlich angewandten Werte (für die „erkannt …"-Anzeige)
  const erk: Record<string, string> = {}
  for (const k of ['group', 'ci', 'sub', 'caller', 'short', 'desc'] as const) { const v = out[k]; if (v) erk[k] = v }
  out.erkannt = erk
  return out
}
