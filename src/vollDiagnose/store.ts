// ── PC-Volldiagnose: Ablauf (Store, überlebt den Menüwechsel) ─────────────────
// Stufe 0 → Rundumscan → automatische leichte Vertiefungen → Ursachenbild → Maßnahmenplan.
// Lesend bis hierhin. Eingriffe nur über ausfuehren() — die Oberfläche ruft das erst nach
// dem Bestätigungsdialog auf (Server: Hostname eingetippt). Danach lesende Nachprüfung.

import { create } from 'zustand'
import { api } from '../electronAPI'
import { fern, lies, kurzFehler } from '../services/serverZustand'
import { fuehreAus as paFuehreAus } from '../problemAssistent/motor'
import { sondeAlsAktion, leseSonde } from '../problemAssistent/diagnose/motor'
import { DG_SONDEN_MAP, DG_THEMEN } from '../problemAssistent/diagnose/index'
import type { DgFakten, DgSonde } from '../problemAssistent/diagnose/types'
import { aktion as paAktion } from '../problemAssistent/aktionen'
import { liesZiel, winrmEinschalten } from './verbindung'
import { waehleSonden } from './sondenWahl'
import { EREIGNIS_PS, INTEGRITAET_PS, ZUSATZ_PS, SERVER_PS } from './skripte'
import {
  leseEreignisDaten, werteEreignisse, werteIntegritaet, werteZusatz, werteServer, werteSonden, baueBefund, problemVon, type ServerStand,
} from './auswertung'
import { VERTIEFUNGEN, werteV4 } from './vertiefungen'
import { bestimmeUrsachen } from './ursache'
import { baueMassnahmen, ausfuehrbar, fehlendeEingabe } from './plan'
import { umfangVon, problemVorschlaege, richtungText, type RichtungsUmfang } from './richtung'
import { TYPEN } from './katalog'
import { speichereLauf, letzterLauf } from './speicher'
import type { VdBefund, VdBereich, VdKontext, VdLauf, VdMassnahme, VdPruefung, VdRichtung, VdRoh, VdZiel } from './typen'

const TAG = '@@VD@@'
const GLEICHZEITIG = 3
/** Rohdaten je Host (nicht im Zustand, nur für Vertiefungen/Nachprüfung im Speicher) */
const ROH = new Map<string, Record<string, unknown>>()
const hk = (h: string) => (h || '').trim().toUpperCase()

function pool(n: number) {
  let aktiv = 0
  const warte: (() => void)[] = []
  return async <T,>(f: () => Promise<T>): Promise<T> => {
    if (aktiv >= n) await new Promise<void>(r => warte.push(r))
    aktiv++
    try { return await f() } finally { aktiv--; warte.shift()?.() }
  }
}

async function fernJson(host: string, ps: string, payload: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  // Rundumscan, Vertiefungen und Nachprüfung lesen nur (Wächter: .tmp-test/vd/nurlesen_test.ts)
  const r = await api().runPowerShell(fern(host, ps, TAG, payload ?? {}, 180000), timeoutMs + 20000, { quelle: 'Komplett-Diagnose', art: 'lesen' })
  const d = lies<Record<string, unknown>>(r.stdout, TAG)
  if (!d) throw new Error(r.timedOut ? 'Zeitüberschreitung' : kurzFehler(r.stderr) || 'keine Antwort per WinRM')
  if (d.ok === false) throw new Error(kurzFehler(String(d.fehler || 'Abfrage fehlgeschlagen')))
  return d
}

// ── Sonden → Bereich (für „Was wurde geprüft“) ──
const OBER_BEREICH: Record<string, VdBereich> = {
  netz: 'netz', wlan: 'netz', vpn: 'netz', laufwerke: 'profil', drucker: 'drucken', outlook: 'programme', teams: 'programme', office: 'programme', onedrive: 'programme',
  browser: 'programme', konto: 'sicherheit', leistung: 'leistung', stabilitaet: 'stabilitaet', windows: 'profil', software: 'updates', audio: 'hardware', bildschirm: 'hardware',
  hardware: 'hardware', telefonie: 'programme', fachprogramme: 'programme', sap: 'programme',
}
const SONDE_BEREICH = new Map<string, VdBereich>()
for (const o of DG_THEMEN) for (const u of o.unter) for (const s of u.sonden) if (!SONDE_BEREICH.has(s)) SONDE_BEREICH.set(s, OBER_BEREICH[o.id] || 'sonstiges')
SONDE_BEREICH.set('sys', 'stabilitaet'); SONDE_BEREICH.set('net', 'netz')

interface Rundum { id: string; titel: string; bereich: VdBereich; ps: string; timeoutMs: number; nurServer?: boolean }
const RUNDUM: Rundum[] = [
  { id: 'ereignisse', titel: 'Ereignisprotokolle (alle Protokolle, Abstürze, Bluescreens)', bereich: 'stabilitaet', ps: EREIGNIS_PS, timeoutMs: 240_000 },
  { id: 'integritaet', titel: 'Windows-Integrität (DISM CheckHealth, CBS, Updates, Platz)', bereich: 'integritaet', ps: INTEGRITAET_PS, timeoutMs: 180_000 },
  { id: 'zusatz', titel: 'Dienste, geplante Aufgaben, Shell-Erweiterungen', bereich: 'dienste', ps: ZUSATZ_PS, timeoutMs: 150_000 },
  { id: 'server', titel: 'Server: Rollen und VSS-Writer', bereich: 'server', ps: SERVER_PS, timeoutMs: 120_000, nurServer: true },
]

async function ladeKontext(host: string): Promise<VdKontext> {
  const [pcv, pf, vor] = await Promise.all([
    import('../pcVerlauf/lesen').then(m => m.ladePc(host)).catch(() => null),
    import('../pcFehler/speicher').then(m => m.ladePcFehler(host)).catch(() => null),
    letzterLauf(host).catch(() => null),
  ])
  const grenze = Date.now() - 30 * 86400_000
  const { KAT_TEXT } = await import('../pcVerlauf/typen')
  const aenderungen = (pcv?.aenderungen || []).map(a => ({ am: a.am || a.bis, kat: a.kat, text: `${KAT_TEXT[a.kat]} ${a.art === 'neu' ? 'neu' : a.art === 'entfernt' ? 'entfernt' : 'geändert'}: ${a.name}${a.neu ? ' ' + a.neu : ''}` }))
    .filter(a => { const t = new Date(a.am).getTime(); return isFinite(t) && t >= grenze })
  return {
    aenderungen,
    pcFehler: pf ? { am: pf.am, titel: pf.befunde.map(b => b.titel) } : undefined,
    vorher: vor ? { am: vor.am, typen: vor.typen, von: vor.von } : undefined,
  }
}

async function serverStand(host: string): Promise<ServerStand> {
  const { loadServerStatus, hostKey } = await import('../services/serverMonitor')
  const st = (await loadServerStatus().catch(() => null))?.servers[hostKey(host)]
  if (!st) return {}
  const n = st.zertifikate?.naechstes
  return {
    pruefungProbleme: st.pruefung?.probleme, pruefungText: st.pruefung ? `${st.pruefung.gesamt - st.pruefung.probleme - st.pruefung.hinweise}/${st.pruefung.gesamt} Prüfpunkte OK` : undefined,
    zertKritisch: st.zertifikate?.kritisch, zertWarnung: st.zertifikate?.warnung, zertNaechstes: n ? `${n.cn} (${n.verwendung}) bis ${new Date(n.bis).toLocaleDateString('de-DE')}` : undefined,
    dismZustand: st.dism?.am ? st.dism.zustand : undefined, dismText: st.dism?.text, dismAm: st.dism?.am,
  }
}

/** Suchtexte → Katalogproblem (gleiche Erkennung wie „Gib dein Problem ein“). */
async function loeseSuchen(roh: VdRoh[]): Promise<void> {
  const cache = new Map<string, string | undefined>()
  for (const r of roh) {
    if (r.problem) continue
    const typ = TYPEN[r.typ]
    const q = (r.suche || typ?.suche || '').trim()
    if (!q) continue
    if (!cache.has(q)) {
      const v = await problemVorschlaege(q, 1).catch(() => [])
      cache.set(q, v[0]?.sicher ? v[0].id : undefined)
    }
    r.problem = cache.get(q)
  }
}

interface StartOpt { tage: number; autoVertiefen: boolean; richtung?: VdRichtung; von: string; serial?: string; person?: string }

interface VdState {
  laeufe: Record<string, VdLauf>
  aktiv: string | null
  starte: (host: string, o: StartOpt) => void
  vertiefe: (host: string, vertiefung: string) => Promise<void>
  setzeMassnahme: (host: string, id: string, patch: Partial<Pick<VdMassnahme, 'gewaehlt' | 'eingabe'>>) => void
  ausfuehren: (host: string, bestaetigtVon: string) => Promise<void>
  nachpruefen: (host: string) => Promise<void>
  winrmAn: (host: string, von: string) => Promise<string>
  zeige: (host: string | null) => void
  abbrechen: (host: string) => void
  schliesse: (host: string) => void
  lade: (l: VdLauf) => void
}

export const useVollDiagnoseStore = create<VdState>((set, get) => {
  const hole = (h: string) => get().laeufe[hk(h)]
  const setze = (h: string, f: (l: VdLauf) => VdLauf) => set(st => { const k = hk(h); const l = st.laeufe[k]; return l ? { laeufe: { ...st.laeufe, [k]: f(l) } } : st })
  const pruefung = (h: string, p: VdPruefung) => setze(h, l => ({ ...l, pruefungen: l.pruefungen.some(x => x.id === p.id) ? l.pruefungen.map(x => (x.id === p.id ? { ...x, ...p } : x)) : [...l.pruefungen, p] }))
  const umfang = (l: VdLauf): RichtungsUmfang => umfangVon(l.richtung)

  /** Befunde neu einordnen: Ursachenbild, Maßnahmenplan, „neu seit letzter Diagnose“. */
  const ordne = (h: string) => setze(h, l => {
    const vorher = new Set(l.kontext?.vorher?.typen || [])
    const mitNeu = l.befunde.map(b => ({ ...b, neu: l.kontext?.vorher ? !vorher.has(b.typ) : undefined }))
    const { ursachen, befunde } = bestimmeUrsachen(mitNeu)
    return { ...l, ursachen, befunde, massnahmen: baueMassnahmen(befunde, ursachen, l.ziel?.geraet || 'pc', l.massnahmen) }
  })
  const speichere = async (h: string) => { const l = hole(h); if (!l) return; const d = await speichereLauf(l, richtungText(l.richtung)); if (d) setze(h, x => ({ ...x, datei: d })) }

  const baue = (h: string, roh: VdRoh[], quelle: string, eltern?: string): VdBefund[] => {
    const l = hole(h)!
    const z = { n: l.befunde.filter(b => b.quelle === quelle).length }
    const u = umfang(l)
    return roh.map(r => baueBefund({ ...r, passend: r.passend ?? (r.problem ? u.bereiche.has(problemVon(r.problem)?.bereich || '') : undefined) }, { geraet: l.ziel?.geraet || 'pc', quelle, eltern, zaehler: z }))
  }

  /** Rundum-Prüfung (fern, JSON) ausführen und auswerten. */
  const rundumLauf = async (h: string, r: Rundum): Promise<VdRoh[]> => {
    const l = hole(h)!
    const t0 = Date.now()
    pruefung(h, { id: r.id, titel: r.titel, bereich: r.bereich, art: 'rundum', status: 'laeuft' })
    try {
      const d = await fernJson(h, r.ps, { tage: l.tage }, r.timeoutMs)
      const roh = ROH.get(hk(h)) || {}
      let ergebnis: VdRoh[] = []
      if (r.id === 'ereignisse') { const daten = leseEreignisDaten(d); roh.ereignisse = daten; ergebnis = werteEreignisse(daten, l.ziel?.geraet || 'pc', umfang(l)).roh }
      else if (r.id === 'integritaet') { roh.integritaet = d; ergebnis = werteIntegritaet(d, umfang(l)) }
      else if (r.id === 'zusatz') { roh.zusatz = d; ergebnis = werteZusatz(d, l.ziel?.geraet || 'pc') }
      else if (r.id === 'server') { roh.server = d; ergebnis = werteServer(d, await serverStand(h)) }
      ROH.set(hk(h), roh)
      pruefung(h, { id: r.id, titel: r.titel, bereich: r.bereich, art: 'rundum', status: ergebnis.length ? 'auffaellig' : 'ok', dauerMs: Date.now() - t0, befunde: ergebnis.length })
      return ergebnis
    } catch (e) {
      pruefung(h, { id: r.id, titel: r.titel, bereich: r.bereich, art: 'rundum', status: 'fehler', grund: e instanceof Error ? e.message : String(e), dauerMs: Date.now() - t0 })
      return []
    }
  }

  const sondeLauf = async (h: string, s: DgSonde): Promise<DgFakten> => {
    const l = hole(h)!
    const t0 = Date.now()
    const id = 'sonde:' + s.id
    pruefung(h, { id, titel: s.titel, bereich: SONDE_BEREICH.get(s.id) || 'sonstiges', art: 'rundum', status: 'laeuft' })
    const r = await paFuehreAus(h, sondeAlsAktion(s), s.id, { sam: l.ziel?.sam })
    const g = leseSonde(r.zeilen)
    const warn = g ? g.punkte.filter(p => p.s === 'warn' || p.s === 'fehler').length : 0
    pruefung(h, { id, titel: s.titel, bereich: SONDE_BEREICH.get(s.id) || 'sonstiges', art: 'rundum', status: !g ? 'fehler' : warn ? 'auffaellig' : 'ok', grund: g ? undefined : r.fehler || 'keine Antwort', dauerMs: Date.now() - t0, punkte: g?.punkte })
    return g ? { ...g.fakten, [s.id + '._ok']: true } : { [s.id + '._ok']: false }
  }

  /** Eine Vertiefung ausführen (lesend) und ihre Befunde einhängen. */
  const vertiefeIntern = async (h: string, vid: string): Promise<void> => {
    const v = VERTIEFUNGEN[vid]
    const l = hole(h)
    if (!v || !l || !l.ziel) return
    const ausloeser = l.befunde.filter(b => b.vertiefungen.includes(vid))
    setze(h, x => ({ ...x, vertiefungLaeuft: [...new Set([...x.vertiefungLaeuft, vid])] }))
    const pid = 'v:' + vid
    const t0 = Date.now()
    pruefung(h, { id: pid, titel: v.titel, bereich: ausloeser[0]?.bereich || 'sonstiges', art: 'vertiefung', status: 'laeuft' })
    const ctx = { host: h, von: l.von, tage: l.tage, geraet: l.ziel.geraet, roh: ROH.get(hk(h)) || {}, ausloeser, alle: l.befunde, fakten: l.fakten, kontext: l.kontext }
    try {
      const { ps, payload } = v.skript(ctx)
      // Tiefenprüfung (DISM ScanHealth + SFC) an Servern: dieselbe Sperre wie der Health Check —
      // immer nur EINER zur Zeit, über alle Admins (höchstens 30 min warten, sonst ausgelassen)
      const d = vid === 'v4-tiefe' && l.ziel.geraet === 'server'
        ? await import('../services/serverDism').then(m => m.mitDismSperre(h, l.von, 'komplett-diagnose', () => fernJson(h, ps, payload ?? {}, v.timeoutMs), {
          beimWarten: b => pruefung(h, { id: pid, titel: v.titel, bereich: ausloeser[0]?.bereich || 'sonstiges', art: 'vertiefung', status: 'laeuft', grund: `wartet – Health Check läuft gerade${b?.host ? ` auf ${b.host}` : ''}${b?.von ? ` (${b.von})` : ''}` }),
        }))
        : await fernJson(h, ps, payload ?? {}, v.timeoutMs)
      if (d === null) throw new Error('Ausgelassen: 30 min lang lief woanders ein Health Check (immer nur einer zur Zeit, auch über alle Admins). Bitte später erneut starten.')
      const roh = v.auswerten(d, ctx)
      if (vid === 'v4-tiefe' && l.ziel.geraet === 'server') {
        const { dism } = werteV4(d, ctx)
        if (dism) await import('../services/serverDism').then(m => m.speichereDismErgebnis(h, dism, l.von)).catch(() => {})
      }
      const r0 = ROH.get(hk(h)) || {}; r0[vid] = d; ROH.set(hk(h), r0)
      await loeseSuchen(roh)
      const neu = baue(h, roh, vid, ausloeser[0]?.id)
      const geklaert = neu.some(b => !/-unklar$|-unauffaellig$/.test(b.typ))
      setze(h, x => ({
        ...x,
        befunde: [...x.befunde.filter(b => b.quelle !== vid).map(b => (geklaert && ausloeser.some(a => a.id === b.id) ? { ...b, ursacheOffen: false } : b)), ...neu],
        vertiefungLaeuft: x.vertiefungLaeuft.filter(i => i !== vid), vertiefungFertig: [...new Set([...x.vertiefungFertig, vid])],
      }))
      pruefung(h, { id: pid, titel: v.titel, bereich: ausloeser[0]?.bereich || 'sonstiges', art: 'vertiefung', status: neu.length ? 'auffaellig' : 'ok', dauerMs: Date.now() - t0, befunde: neu.length })
    } catch (e) {
      setze(h, x => ({ ...x, vertiefungLaeuft: x.vertiefungLaeuft.filter(i => i !== vid) }))
      pruefung(h, { id: pid, titel: v.titel, bereich: ausloeser[0]?.bereich || 'sonstiges', art: 'vertiefung', status: 'fehler', grund: e instanceof Error ? e.message : String(e), dauerMs: Date.now() - t0 })
    }
    ordne(h)
  }

  /** Leichte Vertiefungen automatisch, bis die Ursache klar ist (max. 3 Ebenen). */
  const autoVertiefen = async (h: string) => {
    const l0 = hole(h)
    if (!l0) return
    const u = umfang(l0)
    for (let tiefe = 0; tiefe < 3; tiefe++) {
      const l = hole(h)!
      if (l.abbruch) return
      const offen = new Set<string>()
      for (const b of l.befunde) if (b.ursacheOffen) for (const v of b.vertiefungen) if (VERTIEFUNGEN[v]?.last === 'leicht' && !l.vertiefungFertig.includes(v)) offen.add(v)
      if (tiefe === 0) for (const v of u.vertiefungen) if (VERTIEFUNGEN[v]?.last === 'leicht' && !l.vertiefungFertig.includes(v)) offen.add(v)
      if (!offen.size) return
      for (const v of offen) { if (hole(h)?.abbruch) return; await vertiefeIntern(h, v) }
    }
  }

  const ablauf = async (h: string, o: StartOpt) => {
    // ── Stufe 0 ──
    const ziel: VdZiel = await liesZiel(h)
    setze(h, l => ({ ...l, ziel }))
    if (!ziel.winrm || ziel.fehler && !ziel.os) { setze(h, l => ({ ...l, phase: 'fehler', fehler: ziel.fehler, ende: Date.now() })); return }
    const kontext = await ladeKontext(h).catch(() => ({ aenderungen: [] }) as VdKontext)
    setze(h, l => ({ ...l, kontext, phase: 'rundum' }))
    // ── Stufe 1: Rundumscan (3 gleichzeitig) ──
    const l1 = hole(h)!
    const u = umfang(l1)
    const wahl = waehleSonden(ziel.geraet, !!ziel.benutzer, u.sonden)
    for (const x of wahl.aus) pruefung(h, { id: 'sonde:' + x.s.id, titel: x.s.titel, bereich: SONDE_BEREICH.get(x.s.id) || 'sonstiges', art: 'rundum', status: 'uebersprungen', grund: x.grund })
    const platz = pool(GLEICHZEITIG)
    const rundum = RUNDUM.filter(r => !r.nurServer || ziel.geraet === 'server')
    for (const r of rundum) pruefung(h, { id: r.id, titel: r.titel, bereich: r.bereich, art: 'rundum', status: 'wartet' })
    for (const s of wahl.laufen) pruefung(h, { id: 'sonde:' + s.id, titel: s.titel, bereich: SONDE_BEREICH.get(s.id) || 'sonstiges', art: 'rundum', status: 'wartet' })
    const fakten: DgFakten = { 'pc.erreichbar': true }
    const ergebnisse = await Promise.all([
      ...rundum.map(r => platz(() => (hole(h)?.abbruch ? Promise.resolve([] as VdRoh[]) : rundumLauf(h, r)))),
      ...wahl.laufen.map(s => platz(async () => { if (hole(h)?.abbruch) return [] as VdRoh[]; Object.assign(fakten, await sondeLauf(h, s)); return [] as VdRoh[] })),
    ])
    if (hole(h)?.abbruch) { setze(h, l => ({ ...l, phase: 'abgebrochen', ende: Date.now() })); return }
    const roh = ergebnisse.flat()
    roh.push(...werteSonden(fakten, ziel.geraet, u))
    // Verdacht aus der Beschreibung
    if (o.richtung?.problem) {
      const p = problemVon(o.richtung.problem)
      if (p) {
        const bestaetigt = roh.some(r => r.problem === p.id || r.typ === 'dg:' + p.id)
        roh.push({ typ: 'verdacht', problem: p.id, titel: `Verdacht: ${p.titel}`, schwere: bestaetigt ? 'warnung' : 'hinweis', passend: true,
          text: bestaetigt ? 'Die Prüfungen bestätigen den Verdacht aus deiner Beschreibung.' : 'Aus deiner Beschreibung – die Prüfungen haben dazu (noch) nichts Eindeutiges gefunden.', belege: [`Typische Ursache: ${p.ursache}`] })
      }
    }
    await loeseSuchen(roh)
    setze(h, l => ({ ...l, fakten, befunde: [] }))
    const befunde = baue(h, roh, 'rundum')
    setze(h, l => ({ ...l, befunde }))
    ordne(h)
    // ── Vertiefungen ──
    if (o.autoVertiefen) { setze(h, l => ({ ...l, phase: 'vertiefen' })); await autoVertiefen(h) }
    ordne(h)
    const lEnde = hole(h)!
    setze(h, l => ({ ...l, phase: l.abbruch ? 'abgebrochen' : 'fertig', ende: Date.now() }))
    await speichere(h)
    void import('../services/aktivitaet').then(m => m.protokolliere({ art: 'manuell', quelle: 'PC-Volldiagnose', aktion: 'Diagnose ausgeführt (nur gelesen)', ziel: hk(h), benutzer: o.von,
      ergebnis: `${lEnde.befunde.filter(b => b.schwere === 'kritisch').length} kritisch · ${lEnde.befunde.filter(b => b.schwere === 'warnung').length} Warnungen · ${lEnde.befunde.filter(b => b.schwere === 'hinweis').length} Hinweise`,
      details: [`${lEnde.pruefungen.length} Prüfungen`, ...(o.richtung ? [`Richtung: ${richtungText(o.richtung)}`] : []), ...lEnde.ursachen.map(x => `Ursache: ${x.titel}`)] })).catch(() => {})
  }

  return {
    laeufe: {},
    aktiv: null,

    starte: (host, o) => {
      const h = host.trim()
      if (!h) return
      const alt = hole(h)
      if (alt && (alt.phase === 'verbinden' || alt.phase === 'rundum' || alt.phase === 'vertiefen' || alt.ausfuehrung?.laeuft)) { set({ aktiv: hk(h) }); return }
      ROH.set(hk(h), {})
      const lauf: VdLauf = {
        id: Date.now().toString(36), host: h, von: o.von, start: Date.now(), tage: o.tage, autoVertiefen: o.autoVertiefen, richtung: o.richtung,
        phase: 'verbinden', pruefungen: [], befunde: [], fakten: {}, ursachen: [], massnahmen: [], vertiefungLaeuft: [], vertiefungFertig: [],
        person: o.person, serial: o.serial,
      }
      set(st => ({ laeufe: { ...st.laeufe, [hk(h)]: lauf }, aktiv: hk(h) }))
      void ablauf(h, o).catch(e => setze(h, l => ({ ...l, phase: 'fehler', fehler: e instanceof Error ? e.message : String(e), ende: Date.now() })))
    },

    vertiefe: async (host, vid) => { await vertiefeIntern(host, vid); await speichere(host) },

    setzeMassnahme: (host, id, patch) => setze(host, l => ({ ...l, massnahmen: l.massnahmen.map(m => (m.id === id ? { ...m, ...patch } : m)) })),

    ausfuehren: async (host, bestaetigtVon) => {
      const l = hole(host)
      if (!l?.ziel || l.ausfuehrung?.laeuft) return
      const auswahl = l.massnahmen.filter(m => m.gewaehlt && !m.gesperrt && ausfuehrbar(m.loesung) && m.status !== 'ok')
      if (!auswahl.length) return
      setze(host, x => ({ ...x, ausfuehrung: { laeuft: true, start: Date.now(), bestaetigtVon } }))
      const { logDeviceAction } = await import('../services/deviceDossier')
      const { protokolliere } = await import('../services/aktivitaet')
      const { logDossierAction } = await import('../services/personDossier')
      let neustart = false
      for (const m of auswahl) {
        const fehlt = fehlendeEingabe(m)
        if (fehlt) { setze(host, x => ({ ...x, massnahmen: x.massnahmen.map(y => (y.id === m.id ? { ...y, status: 'fehler', fehler: `Eingabe fehlt: ${fehlt}` } : y)) })); continue }
        setze(host, x => ({ ...x, massnahmen: x.massnahmen.map(y => (y.id === m.id ? { ...y, status: 'laeuft', fehler: undefined, zeilen: [] } : y)) }))
        const zeilen: string[] = []
        let ok = true, fehler = ''
        for (const s of (m.loesung.schritte || []).filter(x => !x.optional)) {
          const a = paAktion(s.aktion)
          if (!a) { ok = false; fehler = `Baustein „${s.aktion}“ fehlt`; break }
          if (l.ziel.geraet === 'server' && (a.modus === 'profil' || a.modus === 'benutzer')) { zeilen.push(`– übersprungen (nur am Arbeitsplatz-PC): ${a.titel}`); continue }
          const param = s.param ? s.param.replace(/\{eingabe\}/g, (m.eingabe || '').trim()) : (a.param?.pflicht ? (m.eingabe || '').trim() : '')
          const r = await paFuehreAus(host, a, param, { sam: l.ziel.sam })
          zeilen.push(`▶ ${s.titel || a.titel}`, ...r.zeilen.slice(0, 40))
          setze(host, x => ({ ...x, massnahmen: x.massnahmen.map(y => (y.id === m.id ? { ...y, zeilen: [...zeilen] } : y)) }))
          if (!r.ok) { ok = false; fehler = r.fehler || 'Fehler'; break }
          if (s.aktion === 'neustart-countdown') neustart = true
        }
        const befundTitel = l.befunde.filter(b => m.befunde.includes(b.id)).map(b => b.titel)
        setze(host, x => ({ ...x, massnahmen: x.massnahmen.map(y => (y.id === m.id ? { ...y, status: ok ? 'ok' : 'fehler', fehler: ok ? undefined : fehler, zeilen } : y)) }))
        const text = `PC-Volldiagnose: ${m.loesung.titel}${m.eingabe ? ` (${m.eingabe})` : ''} — ${ok ? 'erledigt' : 'Fehler: ' + fehler}`
        void logDeviceAction(host, l.serial || l.ziel.seriennummer, text, bestaetigtVon, 'PC-Volldiagnose', { ohneProtokoll: true })
        protokolliere({ art: 'manuell', quelle: 'PC-Volldiagnose', aktion: `Maßnahme ausgeführt: ${m.loesung.titel}`, ziel: hk(host), benutzer: bestaetigtVon, grund: befundTitel.slice(0, 3).join(' · ').slice(0, 300), ergebnis: ok ? 'ok' : `Fehler: ${fehler}`.slice(0, 300), details: zeilen.slice(0, 40) })
        if (l.person) void logDossierAction(l.person, l.ziel.sam, `${text} · auf ${hk(host)}`, bestaetigtVon, 'PC-Volldiagnose')
        if (!ok) break
      }
      setze(host, x => ({ ...x, ausfuehrung: { ...(x.ausfuehrung as NonNullable<VdLauf['ausfuehrung']>), laeuft: false, ende: Date.now(), neustartAusgeloest: neustart } }))
      await speichere(host)
      if (!neustart) await get().nachpruefen(host)
    },

    nachpruefen: async (host) => {
      const l = hole(host)
      if (!l?.ziel) return
      const erledigt = l.massnahmen.filter(m => m.status === 'ok')
      // Wirkt erst nach dem Neustart (z. B. TDR-Wartezeit, chkdsk, SFC): jetzt nachzuprüfen wäre irreführend
      const pruefbar = erledigt.filter(m => !m.loesung.neustart)
      const ids = new Set(pruefbar.flatMap(m => m.befunde))
      const betroffen = l.befunde.filter(b => ids.has(b.id))
      if (!betroffen.length && pruefbar.length === erledigt.length) return
      setze(host, x => ({ ...x, ausfuehrung: { ...(x.ausfuehrung || { laeuft: false, start: Date.now() }), nachpruefung: 'laeuft' } }))
      const quellen = new Set(betroffen.map(b => b.quelle === 'rundum' ? (b.typ.startsWith('integ-') ? 'integritaet' : b.typ.startsWith('zus-') ? 'zusatz' : b.typ.startsWith('srv-') ? 'server' : b.typ.startsWith('dg:') ? 'sonden' : b.typ.startsWith('evt') ? 'ereignisse' : 'sonst') : b.quelle))
      // Verlaufsdaten (Ereignisse, Bluescreens, Abstürze, Update-Verlauf) zeigen direkt nach dem
      // Eingriff noch die alten Fälle → nicht erneut lesen, Ergebnis „nicht eindeutig“ (Überwachung)
      const HISTORISCH = new Set(['ereignisse', 'v1-bluescreen', 'v2-absturz', 'v3-update'])
      const neuRoh: VdRoh[] = []
      const geprueft = new Set<string>()
      for (const q of quellen) {
        if (HISTORISCH.has(q)) continue
        const r = RUNDUM.find(x => x.id === q)
        if (r) { neuRoh.push(...await rundumLauf(host, r)); geprueft.add(q) }
        else if (q === 'sonden') {
          const sonden = [...new Set(betroffen.filter(b => b.typ.startsWith('dg:')).flatMap(b => b.sonden || []))].map(id => DG_SONDEN_MAP.get(id)).filter((s): s is DgSonde => !!s && s.modus !== 'benutzer')
          const f: DgFakten = { ...l.fakten }
          for (const s of sonden) Object.assign(f, await sondeLauf(host, s))
          setze(host, x => ({ ...x, fakten: f }))
          neuRoh.push(...werteSonden(f, l.ziel.geraet, umfangVon(l.richtung)))
          geprueft.add('sonden')
        } else if (VERTIEFUNGEN[q]?.last === 'leicht') {
          const v = VERTIEFUNGEN[q]
          const ctx = { host, von: l.von, tage: l.tage, geraet: l.ziel.geraet, roh: ROH.get(hk(host)) || {}, ausloeser: [], alle: l.befunde, fakten: l.fakten, kontext: l.kontext }
          try { const { ps, payload } = v.skript(ctx); neuRoh.push(...v.auswerten(await fernJson(host, ps, payload ?? {}, v.timeoutMs), ctx)); geprueft.add(q) } catch { /* bleibt unklar */ }
        }
      }
      const noch = (b: VdBefund) => neuRoh.some(r => r.typ === b.typ && (!r.titel || r.titel === b.titel))
      const quelleVon = (b: VdBefund) => (b.quelle === 'rundum' ? (b.typ.startsWith('integ-') ? 'integritaet' : b.typ.startsWith('zus-') ? 'zusatz' : b.typ.startsWith('srv-') ? 'server' : b.typ.startsWith('dg:') ? 'sonden' : 'ereignisse') : b.quelle)
      setze(host, x => {
        const befunde = x.befunde.map(b => {
          if (!ids.has(b.id)) return b
          if (!geprueft.has(quelleVon(b))) return { ...b, nach: 'unklar' as const }
          return { ...b, nach: noch(b) ? 'offen' as const : 'behoben' as const }
        })
        const massnahmen = x.massnahmen.map(m => {
          if (m.status !== 'ok') return m
          if (m.loesung.neustart) return { ...m, nachpruefung: 'unklar' as const, nachText: 'Wirkt erst nach dem Neustart – danach eine neue Diagnose starten (Nachprüfung).' }
          const bs = befunde.filter(b => m.befunde.includes(b.id))
          const st = bs.some(b => b.nach === 'offen') ? 'offen' as const : bs.length && bs.every(b => b.nach === 'behoben') ? 'behoben' as const : 'unklar' as const
          const txt = st === 'behoben' ? 'Nachprüfung: behoben.' : st === 'offen' ? 'Nachprüfung: noch vorhanden – nächsten Lösungsweg prüfen.' : 'Nachprüfung nicht eindeutig (Ereignisse sind Vergangenheit bzw. Tiefenprüfung nötig) – Überwachung einrichten oder später erneut diagnostizieren.'
          return { ...m, nachpruefung: st, nachText: txt }
        })
        // noch offen → nächster Lösungsweg des Befunds als neue (nicht angehakte) Maßnahme
        const extra: VdMassnahme[] = []
        for (const b of befunde.filter(y => y.nach === 'offen')) {
          const benutzt = new Set(massnahmen.filter(m => m.befunde.includes(b.id)).map(m => m.loesung.id))
          const naechste = b.loesungen.find(lz => ausfuehrbar(lz) && !benutzt.has(lz.id))
          if (naechste && !massnahmen.some(m => m.loesung.id === naechste.id) && !extra.some(m => m.loesung.id === naechste.id)) extra.push({ id: 'm-' + naechste.id + '|naechster', loesung: naechste, befunde: [b.id], empfohlen: true, gewaehlt: false, status: 'offen', eingabe: naechste.frage?.vorbelegt })
        }
        return { ...x, befunde, massnahmen: [...massnahmen, ...extra], ausfuehrung: { ...(x.ausfuehrung || { laeuft: false, start: Date.now() }), nachpruefung: 'fertig' } }
      })
      await speichere(host)
    },

    winrmAn: async (host, von) => {
      const f = await winrmEinschalten(host, von)
      return f
    },

    zeige: host => set({ aktiv: host ? hk(host) : null }),
    abbrechen: host => setze(host, l => ({ ...l, abbruch: true })),
    schliesse: host => set(st => { const laeufe = { ...st.laeufe }; delete laeufe[hk(host)]; ROH.delete(hk(host)); return { laeufe, aktiv: st.aktiv === hk(host) ? null : st.aktiv } }),
    lade: l => set(st => ({ laeufe: { ...st.laeufe, [hk(l.host)]: l }, aktiv: hk(l.host) })),
  }
})
