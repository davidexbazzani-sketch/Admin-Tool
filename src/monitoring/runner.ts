// ── PC-Überwachung: Prüftakt ─────────────────────────────────────────────────
// Läuft in JEDER offenen Tool-Instanz im Takt, geprüft wird aber nur von der, die die
// Sperre hält. Je Auftrag: Ping → (erreichbar) Ereignisprotokolle seit dem letzten
// Durchgang lesen → Treffer melden (nur an den Ersteller) → nach Laufzeitende einmal
// abschließen (mit Ursachen-Analyse; bei WLAN mit Tiefenanalyse der Netzwerk-Diagnose).
// Nichts wird am Ziel-PC verändert.

import { verbinde } from '../services/enaioInstall'
import { abschlussAnalyse, dauerText, lueckeGrund, pruefeZustaende, trefferMeldung, uebernimmEreignisse, zeitText, type NetDiagnoseKurz } from './auswertung'
import { melde } from './melden'
import { istErreichbar, sammle } from './sammler'
import { gibSperreFrei, ladeAuftraege, ladeZustand, sichereSperre, speichereZustand } from './store'
import type { MonAuftrag, MonZustand } from './types'

export const NACHLAUF_MS = 72 * 3600_000        // nach Ende so lange auf den PC warten
const RUHE_MS = 10 * 60_000                       // höchstens eine Treffer-Meldung je 10 min
const PARALLEL = 3

export interface Pruefer { username: string; displayName: string; rechner: string }

export function effektivesEnde(a: MonAuftrag): number {
  const b = Date.parse(a.bis)
  const x = a.abgebrochenAm ? Date.parse(a.abgebrochenAm) : NaN
  return isNaN(x) ? b : Math.min(b, x)
}
export const hatKontrolle = (a: MonAuftrag, id: string) => a.kontrollen.some(k => k.id === id)
export const istWlanAuftrag = (a: MonAuftrag) => a.kontrollen.some(k => k.id.startsWith('wlan-'))

export function faellig(a: MonAuftrag, z: MonZustand, jetzt = Date.now()): boolean {
  if (z.abschluss) return false
  if (jetzt < Date.parse(a.von)) return false
  if (a.jetztPruefen && (!z.letztePruefung || a.jetztPruefen > z.letztePruefung)) return true
  return !z.naechstePruefung || jetzt >= Date.parse(z.naechstePruefung)
}

let laeuft = false

/** Ein Takt. `nurId` = nur diesen Auftrag (z. B. „Jetzt prüfen“). */
export async function takt(ich: Pruefer, nurId?: string): Promise<{ gelaufen: boolean; grund?: string; bearbeitet: number }> {
  if (laeuft) return { gelaufen: false, grund: 'läuft bereits', bearbeitet: 0 }
  laeuft = true
  try {
    if (!(await sichereSperre(ich.username, ich.rechner))) return { gelaufen: false, grund: 'ein anderer Rechner prüft', bearbeitet: 0 }
    const auftraege = (await ladeAuftraege()).filter(a => !nurId || a.id === nurId)
    const jetzt = Date.now()
    const offen = auftraege.filter(a => jetzt >= Date.parse(a.von) && jetzt < effektivesEnde(a) + NACHLAUF_MS + 3600_000)
    const arbeit: { a: MonAuftrag; z: MonZustand }[] = []
    for (const a of offen) { const z = await ladeZustand(a.id); if (faellig(a, z, jetzt)) arbeit.push({ a, z }) }
    let i = 0, n = 0
    const arbeiter = async () => { while (i < arbeit.length) { const w = arbeit[i++]; try { await bearbeite(w.a, w.z, ich); n++ } catch { /* nächster */ } } }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, arbeit.length) }, arbeiter))
    return { gelaufen: true, bearbeitet: n }
  } finally { laeuft = false }
}

export async function beende(): Promise<void> { await gibSperreFrei() }

/** Einen Auftrag einen Durchgang weiterbringen (exportiert für Tests). */
export async function bearbeite(a: MonAuftrag, z: MonZustand, ich: Pruefer, dienste = { istErreichbar, sammle, verbinde, melde, netAnalyse }): Promise<MonZustand> {
  const jetzt = Date.now(), jetztIso = new Date(jetzt).toISOString()
  const ende = effektivesEnde(a), endeIso = new Date(ende).toISOString()
  const vorbei = jetzt >= ende
  const intervall = Math.min(60, Math.max(2, a.intervallMin || 5)) * 60_000
  z.pruefungen++; z.letztePruefung = jetztIso
  z.aktualisiertAm = jetztIso; z.aktualisiertVon = `${ich.displayName} (${ich.rechner || '?'})`

  const online = await dienste.istErreichbar(a.host)
  if (!online) {
    z.erreichbar.fehl++; z.erreichbar.fehlFolge++
    if (!z.erreichbar.nichtSeit) z.erreichbar.nichtSeit = jetztIso
    if (!vorbei && hatKontrolle(a, 'erreichbar') && z.erreichbar.fehlFolge >= 2 && !z.erreichbar.gemeldet) {
      z.erreichbar.gemeldet = true
      const m = trefferMeldung(a, [], [`${a.host} ist seit ${zeitText(z.erreichbar.nichtSeit)} nicht erreichbar (${z.erreichbar.fehlFolge} Prüfungen). Ob er aus war, im Standby oder das Netz weg war, steht in der nächsten Meldung, sobald er wieder antwortet.`])
      await dienste.melde(a, z, 'nicht-erreichbar', `${a.host}: nicht erreichbar`, m.text)
    }
    if (vorbei) {
      if (jetzt > ende + NACHLAUF_MS) await schliesseAb(a, z, ich, false, dienste)
      else if (!z.endeGemeldet) {
        z.endeGemeldet = true
        const bisher = z.treffer.filter(t => Date.parse(t.zeit) <= ende && t.schwere !== 'info').length
        await dienste.melde(a, z, 'ende-ausstehend', `${a.host}: Überwachung beendet — Abschluss folgt`,
          `${a.host}: Die Überwachung ist am ${zeitText(endeIso)} zu Ende gegangen. Bisher ${bisher ? bisher + ' Problem' + (bisher === 1 ? '' : 'e') : 'keine Probleme'}. Der PC ist gerade nicht erreichbar — die letzten Stunden und die Ursachen-Analyse kommen, sobald er wieder antwortet (höchstens ${NACHLAUF_MS / 3600_000} Stunden).`)
      }
    }
    z.naechstePruefung = new Date(jetzt + (vorbei ? 10 * 60_000 : intervall)).toISOString()
    await speichereZustand(z)
    return z
  }

  // erreichbar — Lücke seit dem letzten Erfolg mitlesen (aus/Standby/Netz weg?)
  const luecke = z.erreichbar.nichtSeit ? { von: z.erreichbar.zuletztOk || z.erreichbar.nichtSeit, bis: jetztIso } : undefined
  const seitMs = z.gelesenBis ? Date.parse(z.gelesenBis) - 2 * 60_000 : Date.parse(a.von)
  const auftragS = { seit: new Date(Math.max(seitMs, Date.parse(a.von))).toISOString(), bis: vorbei ? endeIso : undefined, kontrollen: a.kontrollen, luecke }
  let ant = await dienste.sammle(a.host, auftragS)
  if (!ant.ok && /WinRM|WS-Management|5985|Verbindung|connect|Zugriff|denied/i.test(ant.fehler || '')) {
    const f = await dienste.verbinde(a.host)
    if (!f) ant = await dienste.sammle(a.host, auftragS)
  }
  if (!ant.ok) {
    z.letzterFehler = ant.fehler || 'Abfrage fehlgeschlagen'
    z.naechstePruefung = new Date(jetzt + (vorbei ? 10 * 60_000 : intervall)).toISOString()
    if (vorbei && jetzt > ende + NACHLAUF_MS) await schliesseAb(a, z, ich, false, dienste)
    await speichereZustand(z)
    return z
  }
  z.erfolgreich++; z.letzteErfolg = jetztIso; z.letzterFehler = undefined
  z.gelesenBis = vorbei ? endeIso : ant.jetzt
  if (ant.fehlend.length) z.hinweise = Array.from(new Set([...(z.hinweise || []), ...ant.fehlend.map(f => `Protokoll nicht lesbar: ${f}`)])).slice(-20)

  uebernimmEreignisse(z, ant, a, endeIso)
  pruefeZustaende(z, ant, a)

  const zusatz: string[] = []
  if (z.erreichbar.nichtSeit) {
    const grund = lueckeGrund(ant.luecke)
    const dauer = jetzt - Date.parse(z.erreichbar.nichtSeit)
    if (z.erreichbar.fehlFolge >= 2) {
      z.erreichbar.ausfaelle.push({ von: z.erreichbar.nichtSeit, bis: jetztIso, grund })
      if (hatKontrolle(a, 'erreichbar') && (z.erreichbar.gemeldet || !/heruntergefahren|Standby/i.test(grund))) zusatz.push(`Wieder erreichbar nach ${dauerText(dauer)} — ${grund}.`)
    }
    z.erreichbar.nichtSeit = undefined; z.erreichbar.fehlFolge = 0; z.erreichbar.gemeldet = false
  }
  z.erreichbar.ok++; z.erreichbar.zuletztOk = jetztIso

  const offen = z.treffer.filter(t => !t.gemeldet && Date.parse(t.zeit) <= ende + 60_000)
  const ruhig = !z.letzteTrefferMeldung || jetzt - Date.parse(z.letzteTrefferMeldung) >= RUHE_MS
  if ((offen.length && (ruhig || vorbei)) || zusatz.length) {
    const m = trefferMeldung(a, offen, zusatz)
    await dienste.melde(a, z, zusatz.length && !offen.length ? 'wieder-erreichbar' : 'treffer', m.titel, m.text)
    for (const t of offen) t.gemeldet = true
    z.letzteTrefferMeldung = jetztIso
  }

  if (vorbei) await schliesseAb(a, z, ich, true, dienste)
  z.naechstePruefung = new Date(jetzt + intervall).toISOString()
  await speichereZustand(z)
  return z
}

/** WLAN-Tiefenanalyse (Netzwerk-Diagnose) — nur geladen, wenn gebraucht. */
async function netAnalyse(host: string, by: string): Promise<{ diag: NetDiagnoseKurz | null; pfad?: string }> {
  const [{ runNetScan }, { saveLauf, laufPfadFuer }, { werteAus, diagnose }] = await Promise.all([
    import('../netCheck/runScan'), import('../netCheck/store'), import('../netCheck/ursachen'),
  ])
  const r = await runNetScan(host, by, 'problem')
  if (!r.ok || !r.lauf) return { diag: null }
  try { await saveLauf(r.lauf) } catch { /* Analyse trotzdem verwenden */ }
  const d = diagnose(r.lauf, werteAus(r.lauf))
  return { diag: d ? { titel: d.titel, punkte: d.punkte, schritte: d.schritte } : null, pfad: laufPfadFuer(r.lauf) }
}

async function schliesseAb(a: MonAuftrag, z: MonZustand, ich: Pruefer, vollstaendig: boolean, dienste: { melde: typeof melde; netAnalyse: typeof netAnalyse }): Promise<void> {
  if (z.abschluss) return
  const endeIso = new Date(effektivesEnde(a)).toISOString()
  let netDiag: NetDiagnoseKurz | null = null, pfad: string | undefined
  const wlanTreffer = z.treffer.some(t => t.kontrolle.startsWith('wlan-') && t.schwere !== 'info')
  if (vollstaendig && istWlanAuftrag(a) && wlanTreffer) {
    try { const r = await dienste.netAnalyse(a.host, `${ich.displayName} (Überwachung)`); netDiag = r.diag; pfad = r.pfad } catch { /* ohne Tiefenanalyse */ }
  }
  z.abschluss = abschlussAnalyse(a, z, { ende: endeIso, vollstaendig, netDiagnose: netDiag, netLaufPfad: pfad })
  await dienste.melde(a, z, 'abschluss', z.abschluss.titel, z.abschluss.text, z.abschluss.langtext)
}
