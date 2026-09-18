// ── Ableitungen fürs UI: Rollen je Person, Team-Gruppierung, Vertretungslücken ─
import type { Regelwerk, Abwesenheiten } from './types'

export interface PersonRollen { haupt: { id: string; thema: string }[]; vertretung: { id: string; thema: string }[] }

/** Für jede Person: in welchen Regeln Haupt- bzw. Vertretungsbearbeiter (inkl. Unterregeln). */
export function regelnJePerson(R: Regelwerk): Record<string, PersonRollen> {
  const out: Record<string, PersonRollen> = {}
  const ensure = (n: string) => (out[n] ||= { haupt: [], vertretung: [] })
  const pushH = (n: string, id: string, thema: string) => { if (n && !ensure(n).haupt.some(x => x.id === id)) out[n].haupt.push({ id, thema }) }
  const pushV = (n: string, id: string, thema: string) => { if (n && !ensure(n).vertretung.some(x => x.id === id)) out[n].vertretung.push({ id, thema }) }
  for (const r of R.regeln || []) {
    pushH(r.primary, r.id, r.thema)
    for (const v of r.vertretung || []) pushV(v, r.id, r.thema)
    for (const u of r.unter || []) {
      pushH(u.primary, `${r.id}/${u.id}`, u.hinweis || r.thema)
      for (const v of u.vertretung || []) pushV(v, `${r.id}/${u.id}`, u.hinweis || r.thema)
    }
  }
  return out
}

/** Personen je Team (APPS/HR/APPS-EXT/INFRA/FS), getrennt nach aktiv/inaktiv. */
export interface TeamGruppe { team: string; aktiv: string[]; inaktiv: string[] }
const TEAM_ORDER = ['INFRA', 'FS', 'APPS', 'HR', 'APPS-EXT']
export function personenJeTeam(R: Regelwerk): TeamGruppe[] {
  const map = new Map<string, TeamGruppe>()
  for (const [name, p] of Object.entries(R.personen || {})) {
    const team = p.team || '—'
    if (!map.has(team)) map.set(team, { team, aktiv: [], inaktiv: [] })
    if ((p.status || 'aktiv').startsWith('aktiv')) map.get(team)!.aktiv.push(name)
    else map.get(team)!.inaktiv.push(name)
  }
  return [...map.values()].sort((a, b) => {
    const ia = TEAM_ORDER.indexOf(a.team), ib = TEAM_ORDER.indexOf(b.team)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
}

// ── Vertretungslücken: Werktage, an denen Haupt + beide Vertretungen fehlen ────
function iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function abwesendAm(abw: Abwesenheiten, name: string, d: string): boolean {
  const p = abw.personen?.[name]; if (!p) return false
  return p.zeitraeume.some(z => z.von <= d && d <= z.bis)
}
export interface Luecke { regel: string; thema: string; kette: string[]; ranges: { von: string; bis: string }[]; tage: number }

/**
 * Für jede Regel (Kette = Haupt + Vertretung, nur aktive) die Werktage, an denen ALLE
 * abwesend sind. Nur wenn JEDES Kettenglied im Kalender steht (sonst „unbekannt" =
 * anwesend → keine sichere Lücke). Betriebsfreie Tage zählen nicht als Lücke.
 */
export function vertretungsluecken(R: Regelwerk, abw: Abwesenheiten | null): Luecke[] {
  if (!abw || !abw.zeitraum) return []
  const bf = new Set(abw.betriebsfrei || [])
  const istAktiv = (n: string) => (R.personen?.[n]?.status || 'aktiv').startsWith('aktiv')
  const werktage: string[] = []
  { const d = new Date(abw.zeitraum.von + 'T00:00:00'); const end = new Date(abw.zeitraum.bis + 'T00:00:00')
    while (d <= end) { const w = d.getDay(); const s = iso(d); if (w !== 0 && w !== 6 && !bf.has(s)) werktage.push(s); d.setDate(d.getDate() + 1) } }

  const seen = new Set<string>()
  const out: Luecke[] = []
  for (const r of R.regeln || []) {
    const kette = [r.primary, ...(r.vertretung || [])].filter(istAktiv)
    if (kette.length === 0) continue
    if (!kette.every(n => n in (abw.personen || {}))) continue   // unbekannte → keine sichere Aussage
    const key = kette.join('|')
    if (seen.has(key)) continue
    seen.add(key)
    const luecken = werktage.filter(d => kette.every(n => abwesendAm(abw, n, d)))
    if (luecken.length === 0) continue
    const ranges: { von: string; bis: string }[] = []
    for (const d of luecken) {
      const last = ranges[ranges.length - 1]
      if (last && diff(last.bis, d) <= 3) last.bis = d
      else ranges.push({ von: d, bis: d })
    }
    out.push({ regel: r.id, thema: r.thema, kette, ranges, tage: luecken.length })
  }
  return out.sort((a, b) => b.tage - a.tage)
}
function diff(a: string, b: string): number { return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000) }
