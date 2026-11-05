// ── Back-Up: Ergebnis auswerten und den Grund verständlich machen ────────────
// Das Backup-Skript (backupEngine.ts, BACKUP_PS) schreibt nach jedem Lauf eine kleine
// ergebnis.json: je Ordner robocopy-Exit-Code, die Zahlen aus der robocopy-Zusammen-
// fassung und die Fehlerzeilen aus dem Protokoll (Win32-Code + betroffene Datei +
// Windows-Meldungstext). Hier wird daraus ein Bericht für Karte, Verlauf und Popup.
// Rein rechnend (ohne electronAPI) — dadurch ohne Attrappen testbar.

export interface RoboFehler {
  code: number           // Win32-Fehlercode aus „FEHLER 32 (0x00000020) …"
  aktion?: string        // „Folgende Datei wird kopiert" / „Zugriff auf Quellverzeichnis" …
  pfad?: string          // betroffene Datei / betroffener Ordner
  text?: string          // Windows-Meldung in Systemsprache (Folgezeile im Protokoll)
}

export interface OrdnerErgebnis {
  quelle: string
  ziel: string
  rc: number | null                 // robocopy-Exit-Code (null = nicht gestartet)
  dateien?: number[] | null         // [gesamt, kopiert, übersprungen, abweichend, fehlgeschlagen, extra]
  bytes?: number[] | null           // gleiche Spalten in Bytes
  fehler?: RoboFehler[]             // eindeutige Fehlerzeilen (max. 40)
  fehlerAnzahl?: number             // Anzahl eindeutiger Fehlerzeilen insgesamt
  allgemein?: string[]              // „FEHLER : Ungültiger Parameter …" o. ä. ohne Code
  hinweis?: string                  // Fehler des Skripts selbst (Ausnahme o. ä.)
  log?: string                      // vollständiges robocopy-Protokoll (Pfad auf dem ausführenden PC)
}

export interface LaufErgebnis {
  runId: string
  rechner?: string                  // ausführender PC
  benutzer?: string
  start?: string                    // ISO
  ende?: string                     // ISO
  rcMax: number
  abgebrochen?: boolean
  abgebrochenVon?: string
  fehler?: string                   // Fehler vor/außerhalb robocopy (robocopy fehlt, Ziel nicht anlegbar …)
  zielFehler?: string
  ordner: OrdnerErgebnis[]
}

export type BerichtStufe = 'ok' | 'warnung' | 'fehler'

export interface BerichtGrund {
  code: number          // 0 = ohne Win32-Code
  titel: string         // verständlicher Grund auf Deutsch
  hilfe?: string        // was man tun kann
  meldung?: string      // Original-Windows-Meldung (Systemsprache)
  anzahl: number
  beispiele: string[]   // betroffene Dateien/Ordner (max. 3)
}

export interface LaufBericht {
  stufe: BerichtStufe
  titel: string                 // eine Zeile für Karte und Verlauf
  gruende: BerichtGrund[]       // häufigste zuerst, max. 6
  kopiert: number
  uebersprungen: number
  fehlgeschlagen: number
  extra: number
  bytesKopiert: number
  rcMax: number
  dauerSek?: number
  ordner: { quelle: string; ziel: string; rc: number | null; kopiert: number; fehlgeschlagen: number; log?: string }[]
  rechner?: string
  start?: string
  ende?: string
  art?: 'admin' | 'pc'          // wo lief der Lauf (für „Protokoll öffnen")
}

// ── Win32-Codes → verständlicher Grund + Abhilfe ─────────────────────────────
// Nur die Codes, die bei Datei-Backups über Admin-Freigaben tatsächlich vorkommen.
// Unbekannte Codes zeigen die Windows-Meldung aus dem Protokoll.
const CODES: Record<number, { titel: string; hilfe?: string }> = {
  2:    { titel: 'Datei oder Ordner nicht gefunden', hilfe: 'Der Ordner existiert auf dem PC nicht (mehr) oder wurde während des Backups gelöscht/umbenannt. Quell-Ordner im Backup prüfen.' },
  3:    { titel: 'Pfad nicht gefunden', hilfe: 'Der Ordner existiert nicht (mehr) — z. B. umbenannt, anderes Benutzerprofil oder anderes Laufwerk. Quell-/Zielordner im Backup prüfen.' },
  5:    { titel: 'Zugriff verweigert', hilfe: 'Das ausführende Konto hat keine Rechte auf diese Datei bzw. diesen Ordner (z. B. fremdes Profil, verschlüsselte Datei, gesperrter Systemordner) oder darf im Ziel nicht schreiben.' },
  6:    { titel: 'Interner Datei-Handle ungültig', hilfe: 'Meist eine kurz unterbrochene Netzwerkverbindung. Backup erneut ausführen.' },
  15:   { titel: 'Laufwerk nicht gefunden', hilfe: 'Das Laufwerk gibt es auf diesem PC nicht (z. B. D: fehlt oder USB-Platte nicht angesteckt).' },
  19:   { titel: 'Datenträger ist schreibgeschützt', hilfe: 'Das Ziellaufwerk ist schreibgeschützt.' },
  21:   { titel: 'Laufwerk nicht bereit', hilfe: 'Das Laufwerk ist nicht bereit (z. B. USB-Platte abgezogen).' },
  23:   { titel: 'Datenfehler beim Lesen (CRC)', hilfe: 'Die Datei kann nicht gelesen werden — Hinweis auf einen Festplattendefekt am Quell-PC. Festplatte prüfen lassen.' },
  32:   { titel: 'Datei ist geöffnet (wird von einem Programm verwendet)', hilfe: 'Die Datei ist während des Backups in Benutzung, z. B. Outlook-PST, eine geöffnete Excel-Datei oder ein laufendes Programm. Programm schließen oder Backup zu einer Zeit planen, in der niemand arbeitet — beim nächsten Lauf wird es erneut versucht.' },
  33:   { titel: 'Datei ist teilweise gesperrt', hilfe: 'Ein Programm hat einen Teil der Datei gesperrt (z. B. Datenbank). Programm schließen und erneut ausführen.' },
  39:   { titel: 'Ziel-Laufwerk ist voll', hilfe: 'Auf dem Ziel ist nicht genug Platz. Speicher freigeben oder anderes Ziel wählen.' },
  53:   { titel: 'PC nicht im Netz erreichbar', hilfe: 'Der PC ist ausgeschaltet, im Standby, nicht im Firmennetz/VPN, oder die Datei- und Druckerfreigabe ist durch die Firewall gesperrt.' },
  59:   { titel: 'Unerwarteter Netzwerkfehler', hilfe: 'Die Verbindung ist während des Backups abgebrochen (WLAN, VPN, Standby). Erneut ausführen.' },
  64:   { titel: 'Netzwerkverbindung abgebrochen', hilfe: 'Der PC war während des Backups kurz nicht erreichbar (Standby, WLAN-Wechsel, Neustart). Erneut ausführen — bereits kopierte Dateien werden übersprungen.' },
  67:   { titel: 'Freigabe nicht gefunden', hilfe: 'Die Admin-Freigabe (z. B. \\\\PC\\D$) gibt es nicht — Laufwerk fehlt oder Admin-Freigaben sind abgeschaltet.' },
  86:   { titel: 'Anmeldung abgelehnt (Kennwort)', hilfe: 'Das Konto wurde vom PC abgelehnt. Mit einem Admin-Konto anmelden, das auf dem PC Rechte hat.' },
  112:  { titel: 'Ziel-Laufwerk ist voll', hilfe: 'Auf dem Ziel ist nicht genug Platz. Speicher freigeben, alte Sicherungen löschen oder anderes Ziel wählen.' },
  121:  { titel: 'Zeitüberschreitung im Netzwerk', hilfe: 'Der PC hat zu lange nicht geantwortet (langsame/abbrechende Verbindung). Erneut ausführen, ggf. per LAN statt WLAN.' },
  123:  { titel: 'Ungültiger Datei- oder Ordnername', hilfe: 'Der Name enthält Zeichen, die Windows nicht erlaubt (oft aus Mac/Cloud übernommen). Datei umbenennen.' },
  206:  { titel: 'Pfad oder Dateiname zu lang', hilfe: 'Der vollständige Pfad ist zu lang. Ordnerstruktur kürzen oder einen kürzeren Zielordner wählen (z. B. D:\\BK statt D:\\Backups\\…).' },
  1117: { titel: 'E/A-Gerätefehler', hilfe: 'Lesen oder Schreiben auf dem Datenträger ist fehlgeschlagen — Hinweis auf einen Festplatten-/USB-Defekt.' },
  1231: { titel: 'Netzwerkadresse nicht erreichbar', hilfe: 'Der PC ist im Netz nicht erreichbar (anderes Netz, VPN getrennt, Firewall).' },
  1232: { titel: 'Netzwerkadresse nicht erreichbar', hilfe: 'Der PC ist im Netz nicht erreichbar (anderes Netz, VPN getrennt, Firewall).' },
  1326: { titel: 'Anmeldung fehlgeschlagen', hilfe: 'Benutzername/Kennwort wurden vom PC abgelehnt. Mit einem Konto mit Admin-Rechten auf dem PC arbeiten.' },
  1392: { titel: 'Datei oder Ordner ist beschädigt', hilfe: 'Das Dateisystem meldet einen Schaden. chkdsk auf dem Quell-PC ausführen lassen.' },
  1450: { titel: 'Zu wenig Systemressourcen', hilfe: 'Windows hatte für den Vorgang nicht genug Ressourcen. Erneut ausführen.' },
  1920: { titel: 'Datei kann vom System nicht geöffnet werden', hilfe: 'Typisch für OneDrive-Platzhalter oder App-Verknüpfungen. Solche Dateien sind nicht lokal vorhanden und werden übersprungen.' },
}

/** Cloud-Dateien (OneDrive „nur online") melden Codes im Bereich 362–404. */
function cloudCode(code: number): boolean { return code >= 362 && code <= 404 }

export function grundZuCode(code: number): { titel: string; hilfe?: string } | null {
  if (CODES[code]) return CODES[code]
  if (cloudCode(code)) return {
    titel: 'OneDrive-/Cloud-Datei nicht lokal vorhanden',
    hilfe: 'Die Datei liegt nur in der Cloud („nur online verfügbar") und kann über die Freigabe nicht gelesen werden. Sie ist dort ohnehin gesichert.',
  }
  return null
}

/** robocopy-Exit-Code verständlich (Bitmaske: 1 kopiert, 2 extra, 4 abweichend, 8 fehlgeschlagen, 16 schwer). */
export function rcText(rc: number | null | undefined): string {
  if (rc == null) return 'nicht gestartet'
  if (rc >= 16) return 'schwerer Fehler — nichts kopiert'
  if (rc >= 8) return 'einige Dateien konnten nicht kopiert werden'
  if (rc === 0) return 'alles aktuell, nichts zu kopieren'
  const teile: string[] = []
  if (rc & 1) teile.push('Dateien kopiert')
  if (rc & 2) teile.push('zusätzliche Dateien im Ziel')
  if (rc & 4) teile.push('abweichende Dateien')
  return teile.join(', ')
}

const zahl = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}
function arr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : v == null ? [] : [v as T] }

/** Rohes ergebnis.json (aus PowerShell, evtl. mit Einzelwert statt Array) → saubere Struktur. */
export function normalisiereErgebnis(roh: unknown): LaufErgebnis | null {
  if (!roh || typeof roh !== 'object') return null
  const r = roh as Record<string, unknown>
  const ordner = arr<Record<string, unknown>>(r.ordner).map(o => ({
    quelle: String(o.quelle ?? ''),
    ziel: String(o.ziel ?? ''),
    rc: o.rc == null || o.rc === '' ? null : zahl(o.rc),
    dateien: Array.isArray(o.dateien) ? (o.dateien as unknown[]).map(zahl) : null,
    bytes: Array.isArray(o.bytes) ? (o.bytes as unknown[]).map(zahl) : null,
    fehler: arr<Record<string, unknown>>(o.fehler).map(f => ({
      code: zahl(f.code),
      aktion: f.aktion ? String(f.aktion) : undefined,
      pfad: f.pfad ? String(f.pfad) : undefined,
      text: f.text ? String(f.text) : undefined,
    })),
    fehlerAnzahl: o.fehlerAnzahl == null ? undefined : zahl(o.fehlerAnzahl),
    allgemein: arr<unknown>(o.allgemein).map(String).filter(Boolean),
    hinweis: o.hinweis ? String(o.hinweis) : undefined,
    log: o.log ? String(o.log) : undefined,
  }))
  return {
    runId: String(r.runId ?? ''),
    rechner: r.rechner ? String(r.rechner) : undefined,
    benutzer: r.benutzer ? String(r.benutzer) : undefined,
    start: r.start ? String(r.start) : undefined,
    ende: r.ende ? String(r.ende) : undefined,
    rcMax: zahl(r.rcMax),
    abgebrochen: r.abgebrochen === true,
    abgebrochenVon: r.abgebrochenVon ? String(r.abgebrochenVon) : undefined,
    fehler: r.fehler ? String(r.fehler) : undefined,
    zielFehler: r.zielFehler ? String(r.zielFehler) : undefined,
    ordner,
  }
}

export function fmtBytes(b: number): string {
  if (!b || b < 1024) return `${b || 0} B`
  const e = ['KB', 'MB', 'GB', 'TB']
  let v = b / 1024, i = 0
  while (v >= 1024 && i < e.length - 1) { v /= 1024; i++ }
  return `${v.toLocaleString('de-DE', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${e[i]}`
}

const n = (x: number) => x.toLocaleString('de-DE')

/** Ergebnis eines Laufs → Bericht (Stufe, eine Titelzeile, gruppierte Gründe). */
export function bewerteErgebnis(e: LaufErgebnis): LaufBericht {
  let kopiert = 0, uebersprungen = 0, fehlgeschlagen = 0, extra = 0, bytesKopiert = 0
  const gruppen = new Map<string, BerichtGrund>()
  const add = (key: string, g: Omit<BerichtGrund, 'anzahl' | 'beispiele'>, beispiel?: string, menge = 1) => {
    const vorh = gruppen.get(key)
    if (vorh) {
      vorh.anzahl += menge
      if (beispiel && vorh.beispiele.length < 3 && !vorh.beispiele.includes(beispiel)) vorh.beispiele.push(beispiel)
    } else {
      gruppen.set(key, { ...g, anzahl: menge, beispiele: beispiel ? [beispiel] : [] })
    }
  }

  if (e.fehler) add('skript', { code: 0, titel: e.fehler })
  if (e.zielFehler) add('ziel', { code: 0, titel: 'Zielordner konnte nicht angelegt werden', meldung: e.zielFehler, hilfe: 'Prüfen, ob das Ziel-Laufwerk existiert und das Konto dort schreiben darf.' })

  for (const o of e.ordner) {
    const d = o.dateien ?? []
    kopiert += d[1] ?? 0; uebersprungen += d[2] ?? 0; fehlgeschlagen += d[4] ?? 0; extra += d[5] ?? 0
    bytesKopiert += (o.bytes ?? [])[1] ?? 0
    for (const f of o.fehler ?? []) {
      const bek = grundZuCode(f.code)
      add(`c${cloudCode(f.code) ? 'cloud' : f.code}`, {
        code: f.code,
        titel: bek?.titel ?? (f.text || `Windows-Fehler ${f.code}`),
        hilfe: bek?.hilfe,
        meldung: f.text,
      }, f.pfad)
    }
    // Weitere Fehlerzeilen, die über die 40 gespeicherten hinausgehen, zählen mit
    const gezeigt = (o.fehler ?? []).length
    if (o.fehlerAnzahl && o.fehlerAnzahl > gezeigt && o.fehler?.length) {
      const letzte = o.fehler[o.fehler.length - 1]
      add(`c${cloudCode(letzte.code) ? 'cloud' : letzte.code}`, { code: letzte.code, titel: '' }, undefined, o.fehlerAnzahl - gezeigt)
    }
    for (const a of o.allgemein ?? []) add(`a${a}`, { code: 0, titel: a, hilfe: 'robocopy hat den Auftrag nicht angenommen.' })
    if (o.hinweis) add(`h${o.hinweis}`, { code: 0, titel: o.hinweis }, o.quelle)
    if ((o.rc ?? 0) >= 8 && !(o.fehler ?? []).length && !(o.allgemein ?? []).length && !o.hinweis) {
      add(`rc${o.quelle}`, { code: 0, titel: `robocopy meldet: ${rcText(o.rc)} (Code ${o.rc})`, hilfe: 'Im Protokoll stehen die Einzelheiten („Protokoll öffnen").' }, o.quelle)
    }
  }

  const gruende = [...gruppen.values()].sort((a, b) => b.anzahl - a.anzahl).slice(0, 6)
  const schwer = e.ordner.some(o => (o.rc ?? 16) >= 16) || !!e.fehler || !!e.zielFehler || e.ordner.length === 0
  const alleSchwer = e.ordner.length === 0 || e.ordner.every(o => (o.rc ?? 16) >= 16)
  let stufe: BerichtStufe = 'ok'
  if (e.abgebrochen) stufe = 'fehler'
  else if (e.rcMax >= 8 || schwer) stufe = (alleSchwer || (kopiert === 0 && fehlgeschlagen > 0) || !!e.fehler) ? 'fehler' : 'warnung'

  let titel: string
  const haupt = gruende[0]?.titel
  if (e.abgebrochen) titel = `Abgebrochen${e.abgebrochenVon ? ` von ${e.abgebrochenVon}` : ''} — ${n(kopiert)} Dateien bis dahin kopiert`
  else if (stufe === 'ok') titel = kopiert > 0 ? `Erfolgreich — ${n(kopiert)} Dateien kopiert (${fmtBytes(bytesKopiert)})` : 'Erfolgreich — alles war schon aktuell'
  else if (stufe === 'warnung') {
    const nicht = fehlgeschlagen || gruende.reduce((s, g) => s + g.anzahl, 0)
    titel = `Teilweise — ${n(kopiert)} kopiert, ${n(nicht)} nicht kopiert${haupt ? `: ${haupt}` : ''}`
  } else titel = `Fehlgeschlagen${haupt ? ` — ${haupt}` : ''}`

  let dauerSek: number | undefined
  if (e.start && e.ende) {
    const d = (new Date(e.ende).getTime() - new Date(e.start).getTime()) / 1000
    if (Number.isFinite(d) && d >= 0) dauerSek = Math.round(d)
  }

  return {
    stufe, titel, gruende, kopiert, uebersprungen, fehlgeschlagen, extra, bytesKopiert, rcMax: e.rcMax, dauerSek,
    ordner: e.ordner.map(o => ({ quelle: o.quelle, ziel: o.ziel, rc: o.rc, kopiert: (o.dateien ?? [])[1] ?? 0, fehlgeschlagen: (o.dateien ?? [])[4] ?? 0, log: o.log })),
    rechner: e.rechner, start: e.start, ende: e.ende,
  }
}

/** Bericht für einen Fehler, der vor dem eigentlichen Lauf auftrat (PC aus, Start fehlgeschlagen …). */
export function berichtAusFehler(titel: string, hilfe?: string, meldung?: string): LaufBericht {
  return {
    stufe: 'fehler', titel: `Fehlgeschlagen — ${titel}`,
    gruende: [{ code: 0, titel, hilfe, meldung, anzahl: 1, beispiele: [] }],
    kopiert: 0, uebersprungen: 0, fehlgeschlagen: 0, extra: 0, bytesKopiert: 0, rcMax: 16, ordner: [],
  }
}

export function fmtDauer(sek?: number): string {
  if (sek == null) return ''
  if (sek < 60) return `${sek} s`
  const m = Math.round(sek / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}
