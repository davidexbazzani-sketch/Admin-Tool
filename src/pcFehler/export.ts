// ── PC-Fehler: Export „Alle Fehler“ ──────────────────────────────────────────
// Fasst die Fehlergruppen ALLER gelesenen PCs zu Fehlerarten zusammen und schreibt sie als
// Markdown-Datei. Gedacht für die Auswertung: Aus der Datei werden Regeln und Lösungen gebaut,
// die mit dem nächsten Update im Tool stehen (Nutzerwunsch 17.11.2026 — mit der Zeit sollen
// alle Fehler eine Lösung im Tool haben).
//   A  bekannte Fehlerbilder (Regel + hinterlegter Lösungsweg) — passt der Lösungsweg?
//   B  nicht zugeordnet — die Arbeitsliste für neue Regeln und Lösungen
//   C  als harmlos ausgeblendet (Rauschen) — stimmt „harmlos“?
// Personennamen kommen nicht hinein; Benutzernamen, SIDs, Mailadressen und Dokumentnamen in
// den Fehlertexten werden unkenntlich gemacht. Reine Logik (testbar) — geladen wird in speicher.ts.

import { leseGruppen, ordneZu, schwereFuer, wert, type Befund } from './auswertung'
import { REGELN, RAUSCHEN, type FehlerGruppe, type Regel, type Schwere } from './katalog'
import type { PcFehlerDatei } from './speicher'

export type ExportArt = 'bekannt' | 'unbekannt' | 'rauschen'

export interface Fehlerart {
  nr: string
  art: ExportArt
  /** bekannt: Befund-Schlüssel (Regel bzw. Regel|Programm) · sonst „Protokoll|Quelle|Kennung[|Zusatz]“ */
  schluessel: string
  titel: string
  log: string
  quelle: string
  /** Programm (Abstürze), Dienst (Service Control Manager) bzw. Office-Programm (OAlerts) */
  zusatz: string
  stufen: number[]
  /** bekannt: Ereignisse auf PCs mit Befund · sonst alle */
  ereignisse: number
  /** PC → Anzahl Ereignisse (bekannt: nur PCs mit Befund) */
  pcs: Map<string, number>
  /** nur bekannt: PCs unter der Meldeschwelle */
  unter: Map<string, number>
  zuerst: string
  zuletzt: string
  /** „Quelle Kennung“ → Anzahl */
  kennungen: Map<string, number>
  /** Modul + Code (Abstürze), Dienst (SCM), Meldung (Office) → Anzahl */
  details: Map<string, number>
  /** normalisierter Text → Beispiel (schon unkenntlich gemacht) + Anzahl */
  texte: Map<string, { text: string; n: number }>
  /** nur bekannt */
  regel?: Regel
  schwere?: Schwere
  bedeutung?: string
  /** Suchtexte des Lösungswegs → Anzahl */
  suchen: Map<string, number>
}

export interface ExportDaten {
  erstellt: string
  /** PCs, deren Stand frisch genug ist (Standard: höchstens 14 Tage alt) */
  pcsMitDaten: number
  /** davon nur teilweise (Dateien älterer Tool-Versionen: ohne Rauschen, höchstens 40 nicht zugeordnete) */
  pcsTeilweise: number
  /** nicht berücksichtigt, weil zu alt */
  pcsVeraltet: number
  pcsMitBefund: number
  /** frühester/spätester Lesezeitpunkt der berücksichtigten PCs */
  vonAm: string
  bisAm: string
  maxAlterTage: number
  bekannt: Fehlerart[]
  unbekannt: Fehlerart[]
  rauschen: Fehlerart[]
}

// ── Unkenntlich machen ──────────────────────────────────────────────────────
const DOKU = 'docx?|docm|dotx?|xlsx?|xlsm|xlsb|xltx?|pptx?|pptm|potx?|pdf|msg|eml|csv|vsdx?|one|pst|ost|txt|rtf|odt|ods|zip|dwg|sldprt|sldasm|slddrw|step|stp'
const DOM_FREI = /^(HKLM|HKCU|HKU|HKCR|HKCC|HKEY_[A-Z_]+|SOFTWARE|SYSTEM|MACHINE|REGISTRY|DEVICE|GLOBALROOT|NT|BUILTIN|WINDOWS|SYSTEM32|SYSWOW64|PROGRAMDATA|APPDATA|USERS|TEMP|DRIVERS|CONTROLSET\d*|CURRENTCONTROLSET|SERVICES|CLASSES|POLICIES|MICROSOFT|WOW6432NODE|PIPE|MAILSLOT|IIS|APPPOOL|NETWORK|LOCAL|WINDOW|MANAGER|FONT|DRIVER)$/
const KONTO_FREI = /^(SYSTEM|LOCAL ?SERVICE|NETWORK ?SERVICE|LOKALER ?DIENST|NETZWERKDIENST|ANONYMOUS ?LOGON|Administrator|Administratoren|Administrators|Guest|Gast|DefaultAccount|WDAGUtilityAccount|DWM-\d+|UMFD-\d+|Users|Benutzer|Authenticated Users)$/i
const PROFIL_FREI = /^(Public|Default|Default User|All Users|Öffentlich|Alle Benutzer|<Benutzer>)$/i

/** Benutzernamen (Profilpfade, DOMÄNE\konto), SIDs, Mailadressen und Dokumentnamen ersetzen. */
export function unkenntlich(t: string): string {
  return t
    // Profilpfade: C:\Users\name\… → C:\Users\<Benutzer>\…
    .replace(/([\\/])(Users|Benutzer)([\\/])([^\\/\r\n"'<>|:;,]+)/gi, (m, a, u, b, name) => (PROFIL_FREI.test(name.trim()) ? m : `${a}${u}${b}<Benutzer>`))
    // Dokumentnamen in Anführungszeichen, in Pfaden und als einzelnes Wort
    .replace(new RegExp(`(["'„“‚‘»«])[^"'„“”‚‘’»«\\r\\n]{1,200}?\\.(${DOKU})(["'“”‘’«»])`, 'gi'), '$1<Datei>.$2$3')
    .replace(new RegExp(`([\\\\/])[^\\\\/"'„“”<>|:*?\\r\\n]{1,160}\\.(${DOKU})\\b`, 'gi'), '$1<Datei>.$2')
    .replace(new RegExp(`(^|[\\s(\\[=:])(?!<Datei>)[^\\s\\\\/"'„“”<>|:*?()\\[\\]]{1,120}\\.(${DOKU})\\b`, 'gi'), '$1<Datei>.$2')
    .replace(/S-1-5-21(-\d+){3,4}/g, 'S-1-5-21-…')
    .replace(/S-1-12-1(-\d+){3,4}/g, 'S-1-12-1-…')
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '<Mail>')
    // DOMÄNE\konto (nicht in Pfaden: davor kein „\“)
    .replace(/(?<![\\\w$.-])([A-Z][A-Z0-9-]{1,14})\\([A-Za-z][\w.-]{1,40})(?![\\\w])/g, (m, dom, konto) => (DOM_FREI.test(dom) || KONTO_FREI.test(konto) ? m : `${dom}\\<Benutzer>`))
}

// ── Zusammenfassen ──────────────────────────────────────────────────────────
const ABSTURZ = /^Application (Error|Hang)$/
/** Schlüssel einer Fehlerart: Protokoll|Quelle|Kennung, dazu Programm (Abstürze), Dienst (SCM) bzw. Office-Programm. */
export function signatur(g: FehlerGruppe): { key: string; zusatz: string } {
  const app0 = (g.app.split('|')[0] || '').trim()
  let zusatz = ''
  if (ABSTURZ.test(g.quelle)) zusatz = app0.toLowerCase()
  else if (/^OAlerts$/i.test(g.log)) zusatz = app0
  else if (g.quelle === 'Service Control Manager') zusatz = g.app.trim()
  return { key: `${g.log}|${g.quelle}|${g.id}${zusatz ? `|${zusatz}` : ''}`, zusatz }
}

/** Woran zwei Texte als „gleich“ gelten: Zahlen, Codes, GUIDs, Zeitangaben ausgeblendet. */
const textForm = (t: string) => t.toLowerCase().replace(/\{?[0-9a-f]{8}-[0-9a-f-]{27,}\}?/g, '{g}').replace(/0x[0-9a-f]+/g, '0x').replace(/\d+/g, '#').replace(/\s+/g, ' ').slice(0, 140)
/** Was je Fehlerart zusätzlich gezählt wird: Modul + Code (Abstürze), Dienst (SCM), Meldung (Office). */
function detailVon(g: FehlerGruppe): string {
  const s = g.app.split('|')
  if (g.quelle === 'Application Error' && s.length >= 3) return `${s[1]} ${s[2]}`.trim()
  if (g.quelle === 'Service Control Manager') return g.app.trim()
  if (/^OAlerts$/i.test(g.log) && s.length >= 2) return s.slice(1).join('|').trim()
  return ''
}
const plus = (m: Map<string, number>, k: string, n: number) => { if (k) m.set(k, (m.get(k) || 0) + n) }

function neueArt(art: ExportArt, schluessel: string, g: FehlerGruppe, zusatz: string): Fehlerart {
  return {
    nr: '', art, schluessel, titel: '', log: g.log, quelle: g.quelle, zusatz, stufen: [], ereignisse: 0,
    pcs: new Map(), unter: new Map(), zuerst: g.zuerst, zuletzt: g.zuletzt, kennungen: new Map(), details: new Map(), texte: new Map(), suchen: new Map(),
  }
}
/** Eine Gruppe in eine Fehlerart einrechnen (ohne PC-Zuordnung — die macht der Aufrufer). */
function rechneEin(a: Fehlerart, g: FehlerGruppe): void {
  if (g.stufe && !a.stufen.includes(g.stufe)) a.stufen.push(g.stufe)
  if (g.zuerst && (!a.zuerst || g.zuerst < a.zuerst)) a.zuerst = g.zuerst
  if (g.zuletzt && (!a.zuletzt || g.zuletzt > a.zuletzt)) a.zuletzt = g.zuletzt
  plus(a.kennungen, `${g.quelle} ${g.id}`, g.anzahl)
  plus(a.details, detailVon(g), g.anzahl)
  if (g.text) {
    const f = textForm(g.text)
    const x = a.texte.get(f)
    if (x) x.n += g.anzahl
    else a.texte.set(f, { text: unkenntlich(g.text), n: g.anzahl })
  }
}

export interface ExportOptionen {
  jetzt?: Date
  /** PCs, deren letzter Stand älter ist, zählen nicht (Standard 14 Tage). */
  maxAlterTage?: number
}

/** Alle PC-Dateien → Fehlerarten (A bekannt, B nicht zugeordnet, C Rauschen). */
export function sammleExport(dateien: PcFehlerDatei[], opt: ExportOptionen = {}): ExportDaten {
  const jetzt = opt.jetzt || new Date()
  const maxAlterTage = opt.maxAlterTage ?? 14
  const grenze = jetzt.getTime() - maxAlterTage * 86_400_000
  const bekannt = new Map<string, Fehlerart>(), unbekannt = new Map<string, Fehlerart>(), rauschen = new Map<string, Fehlerart>()
  let pcsMitDaten = 0, pcsTeilweise = 0, pcsVeraltet = 0, vonAm = '', bisAm = ''
  const mitBefund = new Set<string>()
  // Je Host nur die neueste Datei (Dateinamen sind je Host eindeutig — doppelt nur bei Altlasten)
  const neueste = new Map<string, PcFehlerDatei>()
  for (const d of dateien) {
    const h = (d.host || '').trim().split('.')[0].toUpperCase()
    if (!h) continue
    const x = neueste.get(h)
    if (!x || d.am > x.am) neueste.set(h, d)
  }

  const art = (m: Map<string, Fehlerart>, typ: ExportArt, g: FehlerGruppe) => {
    const s = signatur(g)
    let a = m.get(s.key)
    if (!a) { a = neueArt(typ, s.key, g, s.zusatz); a.titel = s.zusatz ? `${g.quelle} ${g.id} · ${s.zusatz}` : `${g.quelle} ${g.id}`; m.set(s.key, a) }
    return a
  }
  const bekannteArt = (key: string, r: Regel | undefined, g: FehlerGruppe, titel: string) => {
    let a = bekannt.get(key)
    if (!a) {
      a = neueArt('bekannt', key, g, r?.jeProgramm ? (g.app.split('|')[0] || '').trim() : '')
      a.titel = titel; a.regel = r; a.schwere = r?.schwere; a.bedeutung = r?.bedeutung
      bekannt.set(key, a)
    }
    return a
  }

  for (const [host, d] of neueste) {
    const t = new Date(d.am).getTime()
    if (!isFinite(t) || t < grenze) { pcsVeraltet++; continue }
    pcsMitDaten++
    if (!vonAm || d.am < vonAm) vonAm = d.am
    if (!bisAm || d.am > bisAm) bisAm = d.am
    const gruppen = Array.isArray(d.fe) ? leseGruppen(d.fe) : null
    if (gruppen) {
      // Bekannte Fehlerbilder: erst je PC zusammenzählen (Meldeschwelle gilt je PC)
      const jePc = new Map<string, { r: Regel; anzahl: number; gs: FehlerGruppe[] }>()
      for (const g of gruppen) {
        const z = ordneZu(g)
        if (z.art === 'regel') {
          const x = jePc.get(z.key)
          if (x) { x.anzahl += g.anzahl; x.gs.push(g) } else jePc.set(z.key, { r: z.regel, anzahl: g.anzahl, gs: [g] })
          continue
        }
        const a = art(z.art === 'rauschen' ? rauschen : unbekannt, z.art, g)
        rechneEin(a, g); a.ereignisse += g.anzahl; plus(a.pcs, host, g.anzahl)
      }
      for (const [key, x] of jePc) {
        const letzte = x.gs.reduce((m, g) => (g.zuletzt > m.zuletzt ? g : m), x.gs[0])
        const a = bekannteArt(key, x.r, letzte, wert(x.r.titel, letzte))
        for (const g of x.gs) { rechneEin(a, g); plus(a.suchen, wert(x.r.suche, g), g.anzahl) }
        if (x.anzahl >= (x.r.ab ?? 1)) {
          plus(a.pcs, host, x.anzahl); a.ereignisse += x.anzahl; mitBefund.add(host)
          if (schwereFuer(x.r, x.anzahl) === 'hoch') a.schwere = 'hoch'
          else if (a.schwere === 'niedrig' && schwereFuer(x.r, x.anzahl) === 'mittel') a.schwere = 'mittel'
        } else plus(a.unter, host, x.anzahl)
      }
    } else {
      // Datei einer älteren Tool-Version: nur Befunde + höchstens 40 nicht zugeordnete Gruppen
      pcsTeilweise++
      for (const b of d.befunde) {
        if (b.regel === 'laufwerk-i') continue
        const r = REGELN.find(x => x.id === b.regel)
        const [q, id] = [b.quelle.replace(/\s+\d+$/, ''), parseInt(b.quelle.match(/(\d+)$/)?.[1] || '0', 10)]
        const g: FehlerGruppe = { log: '', quelle: q, id, stufe: 0, anzahl: b.anzahl, zuerst: b.zuerst, zuletzt: b.zuletzt, app: '', text: b.beispiel }
        const a = bekannteArt(b.key, r, g, b.titel)
        rechneEin(a, g); plus(a.suchen, b.suche, b.anzahl)
        plus(a.pcs, host, b.anzahl); a.ereignisse += b.anzahl; mitBefund.add(host)
        if (b.schwere === 'hoch') a.schwere = 'hoch'
      }
      for (const g of Array.isArray(d.unbekannt) ? d.unbekannt : []) {
        if (!g || typeof g.quelle !== 'string' || !(g.anzahl > 0)) continue
        const a = art(unbekannt, 'unbekannt', g)
        rechneEin(a, g); a.ereignisse += g.anzahl; plus(a.pcs, host, g.anzahl)
      }
    }
    // Laufwerk I: kommt nicht aus dem Ereignisprotokoll, sondern aus der Registry der Benutzer
    const lw = d.befunde.find(b => b.regel === 'laufwerk-i')
    if (lw) {
      const g: FehlerGruppe = { log: 'Registry des Benutzers', quelle: 'Netzlaufwerk I:', id: 0, stufe: 0, anzahl: lw.anzahl, zuerst: lw.zuerst, zuletzt: lw.zuletzt, app: '', text: '' }
      const a = bekannteArt('laufwerk-i', undefined, g, lw.titel)
      a.schwere = lw.schwere; a.bedeutung = 'Bei angemeldeten Domänen-Benutzern fehlt die dauerhafte Verbindung zum Firmenlaufwerk I: (Standard für jeden Mitarbeiter).'
      plus(a.suchen, lw.suche, 1)
      if (lw.zuerst && (!a.zuerst || lw.zuerst < a.zuerst)) a.zuerst = lw.zuerst
      if (lw.zuletzt && (!a.zuletzt || lw.zuletzt > a.zuletzt)) a.zuletzt = lw.zuletzt
      plus(a.pcs, host, lw.anzahl); a.ereignisse += lw.anzahl; mitBefund.add(host)
    }
  }

  const pcsZahl = (a: Fehlerart) => a.pcs.size
  const sortiere = (l: Fehlerart[]) => l.sort((x, y) => pcsZahl(y) - pcsZahl(x) || y.ereignisse - x.ereignisse || x.schluessel.localeCompare(y.schluessel))
  // Bekannt: nur, was auf mindestens einem PC vorkommt (mit Befund oder darunter)
  const a = sortiere([...bekannt.values()].filter(x => x.pcs.size || x.unter.size))
  const b = sortiere([...unbekannt.values()])
  const c = sortiere([...rauschen.values()])
  const nummer = (l: Fehlerart[], p: string, stellen: number) => l.forEach((x, i) => { x.nr = `${p}${String(i + 1).padStart(stellen, '0')}` })
  nummer(a, 'A', 2); nummer(b, 'B', b.length > 99 ? 3 : 2); nummer(c, 'C', c.length > 99 ? 3 : 2)
  return { erstellt: jetzt.toISOString(), pcsMitDaten, pcsTeilweise, pcsVeraltet, pcsMitBefund: mitBefund.size, vonAm, bisAm, maxAlterTage, bekannt: a, unbekannt: b, rauschen: c }
}

// ── Markdown ────────────────────────────────────────────────────────────────
/** Was zu einem Suchtext im Problem-Katalog hinterlegt ist (ermittelt die Oberfläche). */
export interface LoesungsInfo {
  problemId?: string
  problemTitel?: string
  /** Sicherheit der Erkennung (hoch/mittel/niedrig/keine) */
  sicherheit: string
  /** true = die Suche hat das Problem sicher erkannt (Vorschlag); false = nur bester Treffer — zeigt das Radar trotzdem an */
  sicher: boolean
  /** erster Satz der Lösung */
  loesung?: string
  schritte: number
  /** Unbemerkt behebbar: Titel der Schritte — sonst der Grund, warum nicht */
  unbemerkt?: string[]
  grund?: string
}
export interface MarkdownOptionen {
  von?: string
  loesung?: (suche: string, befund: Befund) => LoesungsInfo | null
  modell?: (host: string) => string
}

const d2 = (n: number) => String(n).padStart(2, '0')
const zeit = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '—' : `${d2(d.getDate())}.${d2(d.getMonth() + 1)}. ${d2(d.getHours())}:${d2(d.getMinutes())}` }
const datum = (iso: string) => { const d = new Date(iso); return isNaN(d.getTime()) ? '—' : `${d2(d.getDate())}.${d2(d.getMonth() + 1)}.${d.getFullYear()}` }
const zahl = (n: number) => n.toLocaleString('de-DE')
const STUFE: Record<number, string> = { 1: 'kritisch', 2: 'Fehler', 3: 'Warnung', 4: 'Information' }
const stufenText = (s: number[]) => [...s].sort().map(x => STUFE[x] || `Stufe ${x}`).join(', ') || '—'
/** Einzeilig, gekürzt, ohne Backticks (bricht sonst Code-Markierungen). */
const text = (t: string, max: number) => { const s = t.replace(/\s+/g, ' ').trim(); return (s.length > max ? `${s.slice(0, max - 1)}…` : s).replace(/`/g, "'") }
/** Für Tabellenzellen zusätzlich „|“ maskieren. */
const zelle = (t: string, max: number) => text(t, max).replace(/\|/g, '\\|')
const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)
function pcListe(m: Map<string, number>, max = 15): string {
  const l = top(m, m.size)
  const teil = l.slice(0, max).map(([h, n]) => `${h} (${n}×)`).join(', ')
  return l.length > max ? `${teil} … +${l.length - max} weitere` : teil
}
function modelle(m: Map<string, number>, modell?: (h: string) => string): string {
  if (!modell) return ''
  const z = new Map<string, number>()
  for (const h of m.keys()) plus(z, modell(h) || 'unbekannt', 1)
  if (z.size === 1 && z.has('unbekannt')) return ''
  return top(z, 5).map(([k, n]) => `${text(k, 50)} (${n})`).join(', ') + (z.size > 5 ? ` … +${z.size - 5} weitere` : '')
}
const beispiele = (a: Fehlerart, n: number, max: number) => [...a.texte.values()].sort((x, y) => y.n - x.n).slice(0, n).map(x => `  - „${text(x.text, max)}“${a.texte.size > 1 ? ` (${zahl(x.n)}×)` : ''}`)

export function exportMarkdown(d: ExportDaten, opt: MarkdownOptionen = {}): string {
  const z: string[] = []
  const summe = (l: Fehlerart[]) => l.reduce((s, a) => s + a.ereignisse, 0)
  const pcsIn = (l: Fehlerart[]) => new Set(l.flatMap(a => [...a.pcs.keys()])).size
  const rauschMuster = RAUSCHEN.source.split('|').length

  z.push('# PC-Fehler – Export aller Fehler (Proaktive Fehlersuche)', '')
  z.push(`- Erstellt: ${datum(d.erstellt)} ${zeit(d.erstellt).split(' ')[1] || ''}${opt.von ? ` · von ${opt.von}` : ''} · IT Admin Tool`)
  z.push(`- Datengrundlage: **${zahl(d.pcsMitDaten)} PCs** mit Daten, gelesen zwischen ${datum(d.vonAm)} und ${datum(d.bisAm)}. Je PC zählen die Fehler der 7 Tage vor dem Lesen (alle Ereignisprotokolle außer „Security“, Fehler + kritisch, dazu Hardware-Warnungen und Office-Meldungen). Höchstens die 80 häufigsten Fehlerarten je PC.`)
  if (d.pcsTeilweise) z.push(`- Davon **${zahl(d.pcsTeilweise)} PCs nur teilweise** (Daten einer älteren Tool-Version: nur bekannte Fehlerbilder und die 40 häufigsten nicht zugeordneten, kein Rauschen). Nach dem nächsten Lauf der Fehlersuche mit der aktuellen Version sind sie vollständig.`)
  if (d.pcsVeraltet) z.push(`- Nicht berücksichtigt: ${zahl(d.pcsVeraltet)} PCs, deren letzter Stand älter als ${d.maxAlterTage} Tage ist.`)
  z.push(`- PCs mit mindestens einem Befund: ${zahl(d.pcsMitBefund)}`)
  z.push(`- Katalog im Tool: ${REGELN.length} Fehlerbilder (Regeln), Rauschliste mit ${rauschMuster} Mustern`)
  z.push(`- Datenschutz: keine Personennamen. In den Fehlertexten sind Benutzernamen, SIDs, Mailadressen und Dokumentnamen ersetzt (<Benutzer>, <Mail>, <Datei>).`, '')

  z.push('| Abschnitt | Fehlerarten | PCs betroffen | Ereignisse |', '|---|---:|---:|---:|')
  z.push(`| A · Bekannte Fehlerbilder (Regel + Lösungsweg) | ${d.bekannt.length} | ${zahl(pcsIn(d.bekannt))} | ${zahl(summe(d.bekannt))} |`)
  z.push(`| B · Nicht zugeordnet (noch ohne Regel) | ${d.unbekannt.length} | ${zahl(pcsIn(d.unbekannt))} | ${zahl(summe(d.unbekannt))} |`)
  z.push(`| C · Als harmlos ausgeblendet (Rauschen) | ${d.rauschen.length} | ${zahl(pcsIn(d.rauschen))} | ${zahl(summe(d.rauschen))} |`, '')

  z.push('## Hinweise für die Auswertung', '')
  z.push('- Ziel: Zu jeder Fehlerart steht eine Lösung im Tool. Abschnitt **B** ist die Arbeitsliste. In **A** prüfen, ob der hinterlegte Lösungsweg passt. In **C** prüfen, ob „harmlos“ stimmt.')
  z.push('- Neue Fehlerbilder kommen als Regel nach `src/pcFehler/katalog.ts` → `REGELN` (`wenn`: quelle/log/ids/app/text; `titel`, `schwere`, `bedeutung`, `ab`). Der Lösungsweg ist der Suchtext `suche` für „Gib dein Problem ein“. Fehlt dort ein passendes Problem, eines im Problem-Katalog anlegen (`src/problemAssistent/katalog/`).')
  z.push('- Harmloses kommt nach `RAUSCHEN` in derselben Datei.')
  z.push('- Schlüssel einer Fehlerart: `Protokoll|Quelle|Kennung|Zusatz`. Der Zusatz ist das Programm bei Abstürzen (Application Error/Hang), der Dienst beim „Service Control Manager“ und das Office-Programm bei OAlerts.')
  z.push('- „Unter der Meldeschwelle“: Die Regel greift erst ab `ab` Ereignissen je PC.', '')

  // ── A ──
  z.push(`## A · Bekannte Fehlerbilder (${d.bekannt.length})`, '')
  if (!d.bekannt.length) z.push('_Keine._', '')
  for (const a of d.bekannt) {
    z.push(`### ${a.nr} · ${text(a.titel, 140)}`)
    const ab = a.regel?.ab ?? 1
    z.push(`- Regel: \`${a.regel?.id || a.schluessel}\` · Schwere: ${a.schwere || '—'}${a.regel ? ` · Befund ab ${ab} Ereignis${ab === 1 ? '' : 'sen'} je PC` : ''}`)
    z.push(`- Betroffen: **${zahl(a.pcs.size)} PCs mit Befund** (${zahl(a.ereignisse)} ${a.schluessel === 'laufwerk-i' ? 'Benutzer' : 'Ereignisse'})${a.unter.size ? ` · ${zahl(a.unter.size)} PCs unter der Meldeschwelle (${zahl([...a.unter.values()].reduce((s, n) => s + n, 0))} Ereignisse)` : ''}`)
    if (a.zuerst) z.push(`- Zeitraum: ${zeit(a.zuerst)} – ${zeit(a.zuletzt)}`)
    if (a.kennungen.size && a.schluessel !== 'laufwerk-i') z.push(`- Ereignisse: ${top(a.kennungen, 6).map(([k, n]) => `${text(k, 80)} (${zahl(n)}×)`).join(', ')}${a.stufen.length ? ` · Stufe: ${stufenText(a.stufen)}` : ''}`)
    if (a.details.size) z.push(`- ${a.quelle === 'Service Control Manager' ? 'Dienste' : a.log === 'OAlerts' ? 'Meldungen' : 'Modul + Code'}: ${top(a.details, 6).map(([k, n]) => `${text(k, 90)} (${zahl(n)}×)`).join(', ')}${a.details.size > 6 ? ` … +${a.details.size - 6} weitere` : ''}`)
    if (a.bedeutung) z.push(`- Bedeutung: ${text(a.bedeutung, 300)}`)
    const suchen = top(a.suchen, 3)
    for (const [s] of suchen) {
      if (a.schluessel === 'laufwerk-i') { z.push('- Lösungsweg: eingebaut – „Laufwerk I: dauerhaft verbinden“ (Registry des Benutzers, wirksam ab der nächsten Anmeldung, unbemerkt behebbar)'); break }
      const befund: Befund = { key: a.schluessel, regel: a.regel?.id || '', titel: a.titel, schwere: a.schwere || 'niedrig', bedeutung: a.bedeutung || '', suche: s, anzahl: a.ereignisse, zuerst: a.zuerst, zuletzt: a.zuletzt, beispiel: '', quelle: a.quelle }
      const l = opt.loesung?.(s, befund)
      if (!l) { z.push(`- Lösungsweg: Suche „${zelle(s, 140)}“`); continue }
      if (!l.problemId) { z.push(`- Lösungsweg: Suche „${text(s, 140)}“ → **im Problem-Katalog nichts Passendes gefunden**`); continue }
      const was = `${text(l.problemTitel || '', 120)}“ (\`${l.problemId}\`, ${l.schritte} Schritt${l.schritte === 1 ? '' : 'e'})`
      z.push(l.sicher
        ? `- Lösungsweg: Suche „${text(s, 140)}“ → **„${was}**, Erkennung: ${l.sicherheit}${l.loesung ? ` — ${text(l.loesung, 220)}` : ''}`
        : `- Lösungsweg: Suche „${text(s, 140)}“ → **kein sicherer Treffer** – das Radar zeigt den besten Treffer „${was} an: prüfen, ob er passt`)
      z.push(`  - Unbemerkt behebbar: ${l.unbemerkt?.length ? `ja – ${l.unbemerkt.map(x => text(x, 80)).join(' · ')}` : `nein${l.grund ? ` (${text(l.grund, 200)})` : ''}`}`)
    }
    if (a.texte.size) { z.push('- Beispiele:'); z.push(...beispiele(a, 2, 240)) }
    const mo = modelle(a.pcs.size ? a.pcs : a.unter, opt.modell)
    if (mo) z.push(`- Modelle: ${mo}`)
    if (a.pcs.size) z.push(`- PCs: ${pcListe(a.pcs)}`)
    if (a.unter.size) z.push(`- Unter der Meldeschwelle: ${pcListe(a.unter, 10)}`)
    z.push('')
  }

  // ── B ──
  z.push(`## B · Nicht zugeordnet (${d.unbekannt.length})`, '')
  if (!d.unbekannt.length) z.push('_Keine — jede gefundene Fehlerart ist zugeordnet._', '')
  for (const a of d.unbekannt) {
    const proPc = Math.max(0, ...a.pcs.values())
    z.push(`### ${a.nr} · ${text(a.titel, 140)}`)
    z.push(`- Schlüssel: \`${text(a.schluessel, 200)}\` · Protokoll: ${text(a.log, 80)} · Stufe: ${stufenText(a.stufen)}`)
    z.push(`- **${zahl(a.pcs.size)} PCs** · ${zahl(a.ereignisse)} Ereignisse (höchstens ${zahl(proPc)} auf einem PC) · ${zeit(a.zuerst)} – ${zeit(a.zuletzt)}`)
    if (a.details.size && a.quelle !== 'Service Control Manager') z.push(`- ${a.log === 'OAlerts' ? 'Meldungen' : 'Modul + Code'}: ${top(a.details, 6).map(([k, n]) => `${text(k, 90)} (${zahl(n)}×)`).join(', ')}`)
    if (a.texte.size) { z.push('- Beispiele:'); z.push(...beispiele(a, 3, 240)) }
    const mo = modelle(a.pcs, opt.modell)
    if (mo) z.push(`- Modelle: ${mo}`)
    z.push(`- PCs: ${pcListe(a.pcs)}`, '')
  }

  // ── C ──
  z.push(`## C · Als harmlos ausgeblendet (${d.rauschen.length})`, '')
  if (!d.rauschen.length) z.push(d.pcsMitDaten > d.pcsTeilweise ? '_Keine._' : '_Noch keine Daten (erst nach dem nächsten Lauf der Fehlersuche mit der aktuellen Version)._', '')
  else {
    z.push('| Nr | Protokoll | Quelle | Kennung | Zusatz | PCs | Ereignisse | Beispiel |', '|---|---|---|---:|---|---:|---:|---|')
    for (const a of d.rauschen) {
      const [k] = a.kennungen.keys()
      const id = (k || '').match(/(\d+)$/)?.[1] || ''
      const bsp = [...a.texte.values()].sort((x, y) => y.n - x.n)[0]?.text || ''
      z.push(`| ${a.nr} | ${zelle(a.log, 60)} | ${zelle(a.quelle, 60)} | ${id} | ${zelle(a.zusatz, 50)} | ${a.pcs.size} | ${zahl(a.ereignisse)} | ${zelle(bsp, 130)} |`)
    }
    z.push('')
  }
  z.push('— Ende des Exports —', '')
  return z.join('\n')
}
