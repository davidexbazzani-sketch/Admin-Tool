// ── Server-Zugriffsprotokoll lesen (Dialog „Tool-Zugriffe“, Zeile bei Ausfällen) ──
// Geschrieben wird im Hauptprozess (electron/zugriffsProtokoll.ts): jeder Befehl des
// Tools, der einen bekannten Server anspricht — mit Zeit, Dauer, Funktion, Art
// (Ping/lesend/ändernd), Ergebnis, Admin-PC und Benutzer. Nie der Befehlstext.
// Ablage: server_monitor/zugriffe/<JJJJ-MM-TT>_<PC>.jsonl (alle Admin-PCs, 90 Tage).
import { api, type ZugriffEintrag } from '../electronAPI'
import { kurzName } from '../../electron/serverZiele'
import { istClusterKnoten } from './serverSchonung'

export type { ZugriffEintrag }

export interface ZugriffZusammenfassung {
  gesamt: number
  ping: number
  lesend: number
  aendernd: number
  gesperrt: number
  fehler: number
  zeitlimit: number
  /** Ø/max. Dauer der ausgeführten (nicht gesperrten) lesenden/ändernden Zugriffe */
  dauerMittelMs: number
  dauerMaxMs: number
  letzter?: ZugriffEintrag
  /** letzter ausgeführter lesender/ändernder Zugriff (ohne Ping) */
  letzterFern?: ZugriffEintrag
  pcs: string[]
  benutzer: string[]
  /** lesende/ändernde Zugriffe je Funktion, häufigste zuerst */
  quellen: { q: string; n: number }[]
}

export async function ladeZugriffe(o: { host?: string; von: Date; bis: Date; max?: number }): Promise<{ eintraege: ZugriffEintrag[]; gekappt: boolean; fehler?: string }> {
  try {
    const r = await api().zugriffeLade({ host: o.host ? kurzName(o.host) : undefined, von: o.von.toISOString(), bis: o.bis.toISOString(), max: o.max })
    return { eintraege: Array.isArray(r?.eintraege) ? r.eintraege : [], gekappt: !!r?.gekappt, fehler: r?.fehler }
  } catch {
    return { eintraege: [], gekappt: false, fehler: 'Zugriffsprotokoll nicht verfügbar' }
  }
}

export function fasseZugriffeZusammen(liste: ZugriffEintrag[]): ZugriffZusammenfassung {
  const z: ZugriffZusammenfassung = { gesamt: liste.length, ping: 0, lesend: 0, aendernd: 0, gesperrt: 0, fehler: 0, zeitlimit: 0, dauerMittelMs: 0, dauerMaxMs: 0, pcs: [], benutzer: [], quellen: [] }
  const pcs = new Set<string>(), us = new Set<string>(), q = new Map<string, number>()
  let summe = 0, n = 0
  for (const e of liste) {
    if (e.e === 'gesperrt') z.gesperrt++
    else if (e.a === 'ping') z.ping++
    else if (e.a === 'aendern') z.aendernd++
    else z.lesend++
    if (e.e === 'fehler') z.fehler++
    if (e.e === 'zeitlimit') z.zeitlimit++
    if (e.a !== 'ping' && e.e !== 'gesperrt') {
      summe += e.ms || 0; n++
      z.dauerMaxMs = Math.max(z.dauerMaxMs, e.ms || 0)
      q.set(e.q, (q.get(e.q) || 0) + 1)
      if (!z.letzterFern || e.t > z.letzterFern.t) z.letzterFern = e
    }
    if (e.pc) pcs.add(e.pc)
    if (e.u) us.add(e.u)
    if (!z.letzter || e.t > z.letzter.t) z.letzter = e
  }
  z.dauerMittelMs = n ? Math.round(summe / n) : 0
  z.pcs = [...pcs].sort()
  z.benutzer = [...us].sort()
  z.quellen = [...q.entries()].map(([qq, nn]) => ({ q: qq, n: nn })).sort((a, b) => b.n - a.n)
  return z
}

export const sek = (ms: number) => `${(ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`
export const uhr = (iso?: string) => {
  const d = iso ? new Date(iso) : null
  return d && !isNaN(d.getTime()) ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''
}

/** Kurzfassung in einem Satz, z. B. „24× Ping · 23× lesend (Dienste & Prüfungen 23×; Ø 2,1 s, max 4,0 s; zuletzt 14:05) · 0× ändernd“. */
export function zugriffeText(z: ZugriffZusammenfassung, o: { knoten?: boolean } = {}): string {
  if (!z.gesamt) return 'keine Zugriffe des Tools protokolliert'
  const teile: string[] = []
  if (o.knoten && !z.lesend && !z.aendernd) {
    teile.push(z.ping ? `nur Ping (${z.ping}×)` : 'kein Ping')
  } else {
    teile.push(`${z.ping}× Ping`)
    const qs = z.quellen.slice(0, 3).map(x => `${x.q} ${x.n}×`).join(', ')
    const dauer = z.dauerMittelMs ? `; Ø ${sek(z.dauerMittelMs)}, max ${sek(z.dauerMaxMs)}` : ''
    const zuletzt = z.letzterFern ? `; zuletzt ${uhr(z.letzterFern.t)}` : ''
    teile.push(`${z.lesend}× lesend, ${z.aendernd}× ändernd${z.lesend || z.aendernd ? ` (${qs}${dauer}${zuletzt})` : ''}`)
  }
  if (z.gesperrt) teile.push(`${z.gesperrt}× gesperrt (Cluster-Knoten)`)
  if (z.zeitlimit) teile.push(`${z.zeitlimit}× Zeitlimit`)
  return teile.join(' · ')
}

/** Lokale Serverzeit „yyyy-MM-dd HH:mm“ bzw. ISO → Date. */
function alsDatum(s?: string): Date | null {
  if (!s) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') : s)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Für Ausfall-Ereignisse (offline, neustart): je Ereignis die Zeile „Zugriffe des Tools in
 * den 2 Stunden davor: …“. Lädt das Protokoll EINMAL für alle Ereignisse. Fehlt das
 * Protokoll (Netzlaufwerk, Mock), gibt es keine Zeile. Wirft nie.
 */
export async function zugriffeVorEreignissen(
  ereignisse: { id: string; typ: string; host: string; at: string; ausAm?: string; boot?: string }[],
  stunden = 2,
): Promise<Record<string, string>> {
  const aus: Record<string, string> = {}
  try {
    const relevant = ereignisse
      .filter(e => e.typ === 'offline' || e.typ === 'neustart')
      .map(e => ({ e, zeit: (e.typ === 'neustart' ? alsDatum(e.ausAm) || alsDatum(e.boot) : null) || alsDatum(e.at) }))
      .filter((x): x is { e: typeof x.e; zeit: Date } => !!x.zeit)
    if (!relevant.length) return aus
    const fenster = stunden * 3_600_000
    const von = new Date(Math.min(...relevant.map(x => x.zeit.getTime())) - fenster)
    const bis = new Date(Math.max(...relevant.map(x => x.zeit.getTime())))
    const r = await ladeZugriffe({ von, bis, max: 20_000 })
    if (r.fehler) return aus
    for (const { e, zeit } of relevant) {
      const h = kurzName(e.host)
      const ab = zeit.getTime() - fenster, bisT = zeit.getTime()
      const l = r.eintraege.filter(x => { const t = Date.parse(x.t); return t >= ab && t <= bisT && x.h.some(y => kurzName(y) === h) })
      aus[e.id] = `Zugriffe des IT Admin Tools in den ${stunden} Stunden davor: ${zugriffeText(fasseZugriffeZusammen(l), { knoten: istClusterKnoten(h) })}.`
    }
  } catch { /* keine Zeile */ }
  return aus
}

/** Angesprochene Server eines Eintrags als Text (Kurznamen, sortiert). */
export const serverVon = (e: ZugriffEintrag) => [...new Set((e.h || []).map(kurzName).filter(Boolean))].sort().join(', ')

export interface ZugriffeJeServer { server: string; ping: number; lesend: number; aendernd: number; gesperrt: number; fehler: number; dauerMittelMs: number }
/** Zählung je Server (ein Eintrag mit mehreren Servern zählt bei jedem), meiste Zugriffe zuerst. */
export function zugriffeJeServer(liste: ZugriffEintrag[]): ZugriffeJeServer[] {
  const m = new Map<string, ZugriffeJeServer & { summe: number; n: number }>()
  for (const e of liste) {
    for (const h of new Set((e.h || []).map(kurzName).filter(Boolean))) {
      const s = m.get(h) || { server: h, ping: 0, lesend: 0, aendernd: 0, gesperrt: 0, fehler: 0, dauerMittelMs: 0, summe: 0, n: 0 }
      if (e.e === 'gesperrt') s.gesperrt++
      else if (e.a === 'ping') s.ping++
      else if (e.a === 'aendern') s.aendernd++
      else s.lesend++
      if (e.e === 'fehler' || e.e === 'zeitlimit') s.fehler++
      if (e.a !== 'ping' && e.e !== 'gesperrt') { s.summe += e.ms || 0; s.n++ }
      m.set(h, s)
    }
  }
  return [...m.values()]
    .map(({ summe, n, ...s }) => ({ ...s, dauerMittelMs: n ? Math.round(summe / n) : 0 }))
    .sort((a, b) => (b.lesend + b.aendernd) - (a.lesend + a.aendernd) || b.ping - a.ping || a.server.localeCompare(b.server))
}

/** Markdown für DXC/HPE (Dialog „Als Text kopieren“ / „Speichern unter“). */
export function zugriffeMarkdown(host: string, von: Date, bis: Date, liste: ZugriffEintrag[]): string {
  const z = fasseZugriffeZusammen(liste)
  const dt = (d: Date) => d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const art = (e: ZugriffEintrag) => e.e === 'gesperrt' ? 'gesperrt' : e.a === 'ping' ? 'Ping' : e.a === 'aendern' ? 'ändernd' : 'lesend'
  const zelle = (s: string) => s.replace(/\|/g, '/')
  const jeServer = host ? [] : zugriffeJeServer(liste)
  const zeilen = [
    `# Zugriffe des IT Admin Tools auf ${host || 'alle Server'}`,
    '',
    `Zeitraum: ${dt(von)} – ${dt(bis)}`,
    `Zusammenfassung: ${zugriffeText(z, { knoten: istClusterKnoten(host) })}`,
    `Beteiligte Admin-PCs: ${z.pcs.join(', ') || '—'}`,
    '',
    'Hinweis: Protokolliert wird jeder Befehl des Tools, der einen bekannten Server per Fern-Syntax anspricht (Ping, WinRM, DCOM, Freigaben). Ältere Tool-Versionen schreiben nichts mit. Befehlstexte werden nie gespeichert.',
    '',
    ...(jeServer.length ? [
      '## Je Server',
      '',
      '| Server | lesend | ändernd | Ping | gesperrt | Fehler/Zeitlimit | Ø Dauer |',
      '|---|---|---|---|---|---|---|',
      ...jeServer.map(s => `| ${s.server} | ${s.lesend} | ${s.aendernd} | ${s.ping} | ${s.gesperrt} | ${s.fehler} | ${s.dauerMittelMs ? sek(s.dauerMittelMs) : '—'} |`),
      '',
      '## Alle Zugriffe',
      '',
    ] : []),
    '| Zeit | Server | Art | Funktion | Dauer | Ergebnis | PC | Benutzer |',
    '|---|---|---|---|---|---|---|---|',
    ...liste.slice().sort((a, b) => a.t.localeCompare(b.t)).map(e =>
      `| ${new Date(e.t).toLocaleString('de-DE')} | ${zelle(serverVon(e)) || '—'} | ${art(e)} | ${zelle(e.q)} | ${e.a === 'ping' ? '—' : sek(e.ms)} | ${e.e}${e.x ? `: ${zelle(e.x)}` : ''} | ${e.pc} | ${zelle(e.u)} |`),
  ]
  return zeilen.join('\n')
}
