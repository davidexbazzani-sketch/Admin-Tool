// ── SEAL Systems (PLOSSYS / Digital Process Factory): „sysstatus" auswerten ──
// Auf SEAL-Servern (z. B. W3148) zeigt das SEAL-Werkzeug `sysstatus` je „System"
// (Apache, PostgreSQL, DPF, RFC-Server, SAP …) einen Block:
//
//   Status of system: DPF
//   [I]  DPF License valid
//   [I]  DPF Process Manager working        PID 1908
//   …
//   System DPF is running.
//
// und am Ende „All systems (11) are running.". Ausgeführt wird es per WinRM in
// serverZustand.ts (SEAL_PS, nur lesend — sysstart/sysstop werden nie aufgerufen);
// hier wird nur der Text ausgewertet und den Prüfpunkten vom Typ `seal` zugeordnet.

import type { Pruefpunkt, PruefErgebnis } from './serverZustand'

export interface SealSystem {
  name: string
  laeuft: boolean
  /** Abschlusszeile, z. B. „System DPF is running." */
  abschluss?: string
  /** alle Detailzeilen des Blocks */
  zeilen: string[]
  /** [E]/[F]/[C]-Zeilen → Fehler (Alarm) */
  fehler: string[]
  /** [W]-Zeilen und verdächtige Zeilen („not running", „failed" …) → Warnung */
  warnungen: string[]
}

export interface SealStatus {
  /** wurde überhaupt ein „Status of system:"-Block gefunden? */
  erkannt: boolean
  systeme: SealSystem[]
  /** Gesamtzeile, z. B. „All systems (11) are running." */
  gesamt?: string
  alleLaufen: boolean
  /** „Systems in Status "Started":" → { Started: [...] } */
  statusListen: Record<string, string[]>
  /** „Error while test call in SEALService! Error code (1280)" (aus dem Umgebungsstart) */
  testaufrufFehler?: string
}

/** Rohantwort des PS-Blocks (SEAL_PS in serverZustand.ts). */
export interface SealRoh {
  gefunden?: boolean
  root?: string
  sysstatus?: string
  /** Batch, die die SEAL-Umgebung lädt (sitwelcome oder die hinter der SEAL-Shell-Verknüpfung) */
  sitwelcome?: string
  /** woher die Umgebungs-Batch kommt („Verknüpfung …", „sitwelcome im SEAL-Ordner" …) */
  umgebungQuelle?: string
  /** Perl-Interpreter für sysstatus.pl */
  perl?: string
  befehl?: string
  roh?: string
  exit?: number | null
  fehler?: string
}

export const SEAL_ABFRAGE = 'seal:_abfrage'
export const SEAL_TESTAUFRUF = 'seal:_testaufruf'
export const SEAL_MARKE = '@@SKF-SYSSTATUS@@'
export const istSealSonderpunkt = (id: string) => id === SEAL_ABFRAGE || id === SEAL_TESTAUFRUF

const VERDACHT = /\b(not running|not working|not alive|not all|stopped|failed|failure|dead|invalid|expired|unreachable|not reachable|aborted|crashed|missing)\b/i

/** Ausgabe von `sysstatus` (ggf. mit vorangestelltem Willkommenstext) zerlegen. */
export function parseSysstatus(text: string): SealStatus {
  const zeilen = (text || '').replace(/\r\n?/g, '\n').split('\n')
  const systeme: SealSystem[] = []
  const statusListen: Record<string, string[]> = {}
  let akt: SealSystem | null = null
  let liste: string[] | null = null
  let gesamt: string | undefined
  let testaufrufFehler: string | undefined

  for (const roh of zeilen) {
    const z = roh.trim()
    const tf = /Error while test call in .*?Error code \(\s*-?\d+\s*\)/i.exec(z)
    if (tf) testaufrufFehler = tf[0]
    if (!z || z.includes(SEAL_MARKE)) continue
    if (/^-{5,}$/.test(z)) { akt = null; liste = null; continue }

    const kopf = /^Status of system:\s*(.+)$/i.exec(z)
    if (kopf) {
      akt = { name: kopf[1].trim(), laeuft: false, zeilen: [], fehler: [], warnungen: [] }
      systeme.push(akt); liste = null
      continue
    }
    const sl = /^Systems in Status\s*"?([^":]+?)"?\s*:?\s*$/i.exec(z)
    if (sl) { akt = null; liste = statusListen[sl[1].trim()] = []; continue }

    if (akt) {
      const ab = /^System\s+(.+?)\s+is\s+(.+?)\.?$/i.exec(z)
      if (ab && ab[1].trim().toLowerCase() === akt.name.toLowerCase()) {
        akt.abschluss = z
        akt.laeuft = /^running$/i.test(ab[2].trim())
        continue
      }
      akt.zeilen.push(z)
      const marke = /^\[([A-Z])\]/.exec(z)?.[1]
      if (marke === 'E' || marke === 'F' || marke === 'C') akt.fehler.push(z)
      else if (marke === 'W') akt.warnungen.push(z)
      else if (VERDACHT.test(z) || /\bstatus\s+(?!RUNNING\b)[A-Z]{3,}\b/.test(z) || /=\s*(?!ALIVE\s*$)[A-Z][A-Z_ ]{2,}$/.test(z)) akt.warnungen.push(z)
      continue
    }
    if (liste) { liste.push(z); continue }
    // außerhalb der Blöcke: Gesamtzeile („All systems (11) are running.")
    if (/\bsystems?\b/i.test(z) && /\brunning\b/i.test(z) && !/^Show|^Start|^Stop/i.test(z)) gesamt = z
  }

  // Steht ein System in einer Liste mit anderem Status als „Started", läuft es nicht.
  for (const [st, namen] of Object.entries(statusListen)) {
    if (/^started$/i.test(st)) continue
    for (const s of systeme) if (namen.some(n => n.toLowerCase() === s.name.toLowerCase())) s.laeuft = false
  }

  return {
    erkannt: systeme.length > 0,
    systeme, gesamt, statusListen, testaufrufFehler,
    alleLaufen: !!gesamt && /^All systems \(\d+\) are running\.?$/i.test(gesamt) && systeme.every(s => s.laeuft),
  }
}

/** Warum war die Abfrage nicht verwertbar? (leer = alles gut) */
export function sealAbfrageFehler(r: SealRoh | undefined, st?: SealStatus): string {
  if (!r) return 'keine Antwort vom Server'
  if (!r.gefunden) return 'keine SEAL-Installation gefunden (PLSROOT bzw. \\Seal\\applications)'
  if (r.fehler) return r.fehler
  if (!st?.erkannt) {
    const letzte = (r.roh || '').split(/\r?\n/).map(z => z.trim()).filter(z => z && !z.includes(SEAL_MARKE)).slice(-1)[0]
    return `Ausgabe von sysstatus nicht erkannt${r.exit != null ? ` (Exitcode ${r.exit})` : ''}${letzte ? ` — letzte Zeile: ${letzte.slice(0, 160)}` : ''}`
  }
  return ''
}

/**
 * Ergebnisse für die `seal`-Prüfpunkte aus einer Abfrage. Schlägt die Abfrage selbst
 * fehl, wird NUR „SEAL-Statusabfrage" rot — die einzelnen Systeme bleiben ohne Urteil
 * (sonst kämen 11 Folgefehler in Popup und Mail).
 */
export function sealErgebnisse(punkte: Pruefpunkt[], r: SealRoh | undefined): { ergebnisse: PruefErgebnis[]; status?: SealStatus; neu: string[] } {
  const sp = punkte.filter(p => p.typ === 'seal')
  if (!sp.length) return { ergebnisse: [], neu: [] }
  const st = r?.roh ? parseSysstatus(r.roh) : undefined
  const fehler = sealAbfrageFehler(r, st)
  const aus: PruefErgebnis[] = []

  for (const p of sp) {
    if (p.id === SEAL_ABFRAGE) {
      aus.push(fehler
        ? { id: p.id, ok: false, status: 'fehlgeschlagen', detail: fehler, zeilen: (r?.roh || '').split(/\r?\n/).map(z => z.trimEnd()).filter(z => z.trim() && !z.includes(SEAL_MARKE)).slice(-25) }
        : { id: p.id, ok: true, status: 'funktioniert', detail: `${st!.systeme.length} Systeme${st!.gesamt ? ` · ${st!.gesamt}` : ''}` })
      continue
    }
    if (p.id === SEAL_TESTAUFRUF) {
      if (!r?.roh) continue
      aus.push(st?.testaufrufFehler
        ? { id: p.id, ok: false, status: 'Fehlermeldung', detail: st.testaufrufFehler }
        : { id: p.id, ok: true, status: 'keine Fehlermeldung' })
      continue
    }
    if (fehler || !st) continue
    const s = st.systeme.find(x => x.name.toLowerCase() === p.name.toLowerCase())
    if (!s) { aus.push({ id: p.id, ok: false, status: 'fehlt in sysstatus', detail: 'Das System taucht in der Ausgabe von sysstatus nicht mehr auf.' }); continue }
    if (!s.laeuft) {
      aus.push({ id: p.id, ok: false, status: 'läuft nicht', detail: [...s.fehler, ...s.warnungen].join(' · ') || s.abschluss || 'keine Abschlusszeile „System … is running."', zeilen: s.zeilen })
    } else if (s.fehler.length) {
      aus.push({ id: p.id, ok: false, status: 'läuft, meldet Fehler', detail: s.fehler.join(' · '), zeilen: s.zeilen })
    } else if (s.warnungen.length) {
      aus.push({ id: p.id, ok: true, warnung: true, status: 'läuft (Warnung)', detail: s.warnungen.join(' · '), zeilen: s.zeilen })
    } else {
      aus.push({ id: p.id, ok: true, status: 'läuft', zeilen: s.zeilen })
    }
  }
  const bekannt = new Set(sp.map(p => p.name.toLowerCase()))
  const neu = fehler || !st ? [] : st.systeme.map(s => s.name).filter(n => !bekannt.has(n.toLowerCase()))
  return { ergebnisse: aus, status: st, neu }
}

/** Sicherheitsriegel für einen von Hand eingetragenen Befehl (gleiche Regel wie im PS-Block). */
export function sealBefehlFehler(befehl: string): string {
  const b = befehl.trim()
  if (!b) return ''
  if (!/sysstatus/i.test(b)) return 'Der Befehl muss sysstatus aufrufen.'
  if (/sysstart|sysstop|\bstop\b|\bstart\b|kill|restart|\bdel\b|\berase\b|\brd\b|\brmdir\b|\bformat\b|[&|<>^\r\n]/i.test(b)) return 'Nur sysstatus ist erlaubt — keine weiteren Befehle, Verkettungen oder Umleitungen.'
  return ''
}
