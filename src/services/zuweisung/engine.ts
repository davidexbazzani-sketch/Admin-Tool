// ── Ticket-Zuweisungs-Engine (reine Logik, keine KI, keine Netzzugriffe) ──────
// Portierung von resources/Ticket Zuweisung/zuweisung_engine.py. `zuweisen` verhält
// sich EXAKT wie predict() (roh, inkl. evtl. inaktiver Namen) — das ist die
// Grundlage des Paritätstests (303/303). Inaktiv-/Abwesenheits-Logik steckt separat
// in `mitVertretung` (= mit_vertretung()). Bei Abweichungen gilt die Python-Fassung.

import type {
  Regelwerk, Regel, RegelUnter, Eingabe, Ergebnis, SignalArt,
  Abwesenheiten, VertretungErgebnis, KetteGlied,
} from './types'

// Wissensinseln: Badge in Ansicht A (8 Regeln laut Vorgabe) …
export const WISSENSINSEL_BADGE = new Set(['APP-CAD', 'APP-SHIP', 'APP-PROD', 'APP-SD', 'APP-FI', 'APP-MM', 'APP-ENAIO', 'HR-QUEUE'])
// … und der Rückfrage-Hinweis bei Vertretung (10 Regeln, wie zuweisung_engine.WISSENSINSELN).
export const WISSENSINSEL_HINT = new Set(['APP-CAD', 'APP-SHIP', 'APP-PROD', 'APP-SD', 'APP-FI', 'APP-MM', 'APP-ENAIO', 'HR-QUEUE', 'APP-POWER', 'APP-HR'])

interface KompilierteRegel extends Regel { ci_re: RegExp | null; kw_re: RegExp | null; unter_c: (RegelUnter & { kw_re: RegExp | null; ci_re: RegExp | null })[] }
export interface RegexProblem { wo: string; muster: string; fehler: string }
export interface ZuweisenOpts { dept?: string; adAbteilungen?: Record<string, string> }

export interface Engine {
  zuweisen(eingabe: Eingabe, opts?: ZuweisenOpts): Ergebnis
  mitVertretung(pred: Ergebnis, datumISO: string, abwesenheiten: Abwesenheiten | null, queue?: string): VertretungErgebnis
  deptOf(caller: string, adAbteilungen?: Record<string, string>): string
  regexFallbacks: RegexProblem[]   // nur mit 'i' kompilierbar (u-Flag scheiterte) → mögliche Semantik-Differenz
  regexErrors: RegexProblem[]      // gar nicht kompilierbar → sichtbar gemeldet
  inaktiveNamen: string[]
}

export function createEngine(R: Regelwerk): Engine {
  const regexFallbacks: RegexProblem[] = []
  const regexErrors: RegexProblem[] = []

  // Python re-Muster in JS mit Flags 'iu' kompilieren; scheitert das u-Flag,
  // Fallback auf 'i' (mit Vermerk); scheitert auch das, sichtbarer Fehler (null).
  const rx = (muster: string | undefined | null, wo: string): RegExp | null => {
    if (!muster) return null
    try { return new RegExp(muster, 'iu') }
    catch (e1) {
      try { const r = new RegExp(muster, 'i'); regexFallbacks.push({ wo, muster, fehler: String((e1 as Error).message) }); return r }
      catch (e2) { regexErrors.push({ wo, muster, fehler: String((e2 as Error).message) }); return null }
    }
  }

  const GEN = new Set(R.meta.generische_cis || [])
  const AUTH = rx(R.meta.auth_signal, 'meta.auth_signal')
  const FEHLER = rx(R.meta.fehler_signal, 'meta.fehler_signal')
  const GRP: Record<string, string> = {}
  for (const [queue, g] of Object.entries(R.gruppen || {})) GRP[queue] = g.kurz

  const rules: KompilierteRegel[] = (R.regeln || []).map(r => ({
    ...r,
    ci_re: rx(r.ci, `regel ${r.id}.ci`),
    kw_re: rx(r.kw, `regel ${r.id}.kw`),
    unter_c: (r.unter || []).map(u => ({ ...u, kw_re: rx(u.bed?.kw, `regel ${r.id}/${u.id}.kw`), ci_re: rx(u.bed?.ci, `regel ${r.id}/${u.id}.ci`) })),
  }))

  const inaktiveNamen = Object.entries(R.personen || {}).filter(([, v]) => !(v.status || 'aktiv').startsWith('aktiv')).map(([n]) => n)

  const deptOf = (caller: string, ad?: Record<string, string>): string => {
    if (!ad) return ''
    if (ad[caller]) return ad[caller]
    const norm = (s: string) => s.replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ä/g, 'ae').replace(/ß/g, 'ss')
    for (const [k, v] of Object.entries(ad)) if (norm(k) === caller) return v
    return ''
  }
  const deptMatch = (codes: string[], d: string): boolean => {
    if (!d) return false
    for (const c of codes) if ((c.includes(' ') && d.startsWith(c)) || (!c.includes(' ') && d.split(' ')[0] === c)) return true
    return false
  }

  interface T { g: string; ci: string; short: string; desc: string; sub: string; caller: string; dept: string }

  const applyUnter = (rule: KompilierteRegel, t: T, text: string): Ergebnis => {
    for (const u of rule.unter_c) {
      const b = u.bed || {}; let ok = true
      if (b.gruppe && !b.gruppe.includes(t.g)) ok = false
      if (ok && u.kw_re && !u.kw_re.test(text)) ok = false
      if (ok && u.ci_re && !u.ci_re.test(t.ci || '')) ok = false
      if (ok && b.abteilung && !deptMatch(b.abteilung, t.dept)) ok = false
      if (ok && b.auth && !(AUTH?.test(t.short) && !FEHLER?.test(t.short))) ok = false
      if (ok) return { id: u.id, regel: rule.id, thema: rule.thema, grund: u.hinweis || '', primary: u.primary, vertretung: u.vertretung || [], pool: u.pool !== undefined ? u.pool : (rule.pool || false) }
    }
    return { id: rule.id, regel: rule.id, thema: rule.thema, grund: rule.hinweis || '', primary: rule.primary, vertretung: rule.vertretung || [], pool: rule.pool || false }
  }
  const withSignal = (r: Ergebnis, s: SignalArt): Ergebnis => { r.signal = s; return r }

  const zuweisen = (eingabe: Eingabe, opts?: ZuweisenOpts): Ergebnis => {
    const group = eingabe.group || ''
    const t: T = {
      g: GRP[group] || group || '',
      ci: eingabe.ci || '',
      short: eingabe.short || '',
      desc: eingabe.desc || '',
      sub: eingabe.sub || '',
      caller: eingabe.caller || '',
      dept: opts?.dept !== undefined ? opts.dept : deptOf(eingabe.caller || '', opts?.adAbteilungen),
    }
    const g = t.g, ci = t.ci, short = t.short
    const text = short + ' \n ' + t.desc.slice(0, 2000)
    const generic = GEN.has(ci)
    const cand = rules.filter(r => r.gruppen.includes(g))

    for (const r of cand) if (r.kw_bei_ci && r.kw_re && r.kw_re.test(short)) return withSignal(applyUnter(r, t, text), 'kw_bei_ci_short')
    if (!generic) for (const r of cand) if (r.ci_re && r.ci_re.test(ci)) return withSignal(applyUnter(r, t, text), 'ci')
    for (const r of cand) if (r.kw_bei_ci && r.kw_re && r.kw_re.test(text)) return withSignal(applyUnter(r, t, text), 'kw_bei_ci_text')
    for (const r of cand) if (r.kw_re && r.kw_re.test(short) && (generic || !r.ci_re)) return withSignal(applyUnter(r, t, text), 'kw_short')
    for (const r of cand) if (r.kw_re && r.kw_re.test(short)) return withSignal(applyUnter(r, t, text), 'kw_short')
    for (const r of cand) if (r.kw_re && r.kw_re.test(t.desc.slice(0, 2000))) return withSignal(applyUnter(r, t, text), 'kw_desc')
    for (const r of cand) if ((r.subcats || []).includes(t.sub || '')) return withSignal(applyUnter(r, t, text), 'subcat')

    const m = R.melder_regeln?.[t.caller]
    if (m) return { id: 'MELDER', regel: 'MELDER', thema: 'Melder-Regel', grund: m.thema, primary: m.person, vertretung: [], pool: false, signal: 'melder' }
    if (g === 'APPS') for (const [name, dr] of Object.entries(R.abteilungen || {})) if (deptMatch(dr.codes, t.dept)) return { id: 'ABTEILUNG', regel: 'ABTEILUNG', thema: 'Abteilungs-Regel', grund: name + ' – ' + dr.beleg, primary: dr.person, vertretung: [], pool: false, signal: 'abteilung' }
    for (const r of cand) if (!r.ci_re && !r.kw_re && !(r.subcats && r.subcats.length)) return withSignal(applyUnter(r, t, text), 'rest')

    const order = (R.gruppen[group]?.reihenfolge) || ['?']
    return { id: 'NONE', regel: 'NONE', thema: 'Gruppen-Reihenfolge', grund: 'kein Signal', primary: order[0], vertretung: order.slice(1), pool: true, signal: 'gruppen_reihenfolge' }
  }

  // ── Schritt 2: Abwesenheiten anwenden (= mit_vertretung) ────────────────────
  const abwesendAm = (abw: Abwesenheiten | null, name: string, datumISO: string) => {
    const p = abw?.personen?.[name]
    if (!p) return null
    for (const z of p.zeitraeume) if (z.von <= datumISO && datumISO <= z.bis) return z
    return null
  }
  const istInaktiv = (name: string): boolean => {
    const st = R.personen?.[name]?.status ?? 'aktiv'
    return !!st && !st.startsWith('aktiv')
  }

  const mitVertretung = (pred: Ergebnis, datumISO: string, abw: Abwesenheiten | null, queue = ''): VertretungErgebnis => {
    const basis = [pred.primary, ...(pred.vertretung || [])]
    const reihenfolge = (R.gruppen?.[queue]?.reihenfolge || []).filter(n => !basis.includes(n))
    const kette = [...basis, ...reihenfolge]
    const ketteDetail: KetteGlied[] = []
    const abwesend: { name: string; von: string; bis: string }[] = []
    const hinweise: string[] = []
    let zuweisen: string | null = null

    for (const n of kette) {
      if (zuweisen) { ketteDetail.push({ name: n, zustand: 'uebersprungen' }); continue }
      if (istInaktiv(n)) { ketteDetail.push({ name: n, zustand: 'inaktiv' }); continue }
      const z = abwesendAm(abw, n, datumISO)
      if (z) { abwesend.push({ name: n, von: z.von, bis: z.bis }); ketteDetail.push({ name: n, zustand: 'abwesend', von: z.von, bis: z.bis }); continue }
      zuweisen = n; ketteDetail.push({ name: n, zustand: 'zuweisen' })
    }
    if (zuweisen === null) { zuweisen = pred.primary; hinweise.push('Alle in der Kette abwesend – Hauptbearbeiter belassen und Rückfrage stellen.') }
    if (zuweisen !== pred.primary && abwesend.length) hinweise.push(`Vertretung, weil ${abwesend[0].name} bis ${abwesend[0].bis} abwesend ist.`)
    if (WISSENSINSEL_HINT.has(pred.regel) && zuweisen !== pred.primary) hinweise.push('Wissensinsel: Hauptbearbeiter ist die einzige Fachkraft – bei nicht dringenden Tickets auf Rückkehr warten oder rückfragen.')
    for (const n of new Set([pred.primary, zuweisen])) {
      if (abw && !(n in (abw.personen || {})) && ['APPS', 'HR', 'APPS-EXT'].includes(R.personen?.[n]?.team || '')) {
        hinweise.push(`${n} steht nicht im Team-Kalender – Abwesenheit unbekannt, gilt als anwesend.`)
      }
    }
    return { datum: datumISO, zuweisen, kette: ketteDetail, abwesend, hinweise }
  }

  return { zuweisen, mitVertretung, deptOf, regexFallbacks, regexErrors, inaktiveNamen }
}
