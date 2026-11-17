// ── Welche Server spricht ein PowerShell-Befehl an? (reine Funktionen, testbar) ──
// Grundlage für zwei Dinge im Hauptprozess (electron/zugriffsProtokoll.ts):
//   1. Zugriffsprotokoll je Server: jeder Befehl, der einen bekannten Server per
//      Fern-Syntax anspricht, wird mit Zeit, Art und Dauer festgehalten.
//   2. Schonung der Cluster-Knoten (HCI-Hosts, vom Dienstleister verwaltet): außer
//      Ping darf das Tool sie gar nicht ansprechen — Befehle werden vorher abgelehnt.
//
// Gezählt wird NUR Fern-Syntax neben dem Namen/der IP (-ComputerName 'X', \\X, /s X,
// /server:X, Test-WSMan X, …) bzw. ein Name in Anführungszeichen, wenn derselbe Befehl
// einen Fern-Parameter mit Variable benutzt ($h=@('A','B'); Invoke-Command -ComputerName $h).
// Eine bloße Erwähnung (Mail-/Toast-Text „W3136 offline“, Get-ADComputer W3136,
// Resolve-DnsName) ist KEIN Zugriff auf den Server.

export type ZugriffArt = 'ping' | 'lesen' | 'aendern'

/** Feste Cluster-Knoten (HCI CL0128): W3135–W3138 + W3153 („Cluster Admin“). */
export const STANDARD_KNOTEN = ['W3135', 'W3136', 'W3137', 'W3138', 'W3153']

export interface ZielKontext {
  /** Bekannte Server (Kurzname, groß). */
  namen: string[]
  /** Cluster-Knoten (Kurzname, groß) — nur Ping erlaubt. */
  knoten: string[]
  /** IP → Servername (Kurzname), damit Zugriffe per IP dem Server zugeordnet werden. */
  ipNamen: Record<string, string>
}

export interface ZielTreffer { hosts: string[]; art: ZugriffArt }

export interface Erkennung {
  /** Zugriffe, getrennt nach Art (Ping-Ziele extra). Leer = kein Server angesprochen. */
  treffer: ZielTreffer[]
  /** Cluster-Knoten, die NICHT nur angepingt würden (→ Befehl sperren). */
  gesperrt: string[]
}

/** Rechnername vereinheitlichen: \\, Domäne und Leerraum weg, groß. IPs bleiben. */
export function kurzName(raw: string): string {
  const s = String(raw || '').trim().replace(/^\\+/, '').replace(/\\.*$/, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return s
  return s.split('.')[0].toUpperCase()
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export interface Muster {
  re: RegExp | null
  /** Token (groß) → Kurzname */
  aufloesen: (token: string) => string
  knoten: Set<string>
}

/** Ein kombiniertes Muster für alle Namen und IPs (einmal je Kontext bauen). */
export function baueMuster(k: ZielKontext): Muster {
  const namen = new Set<string>()
  for (const n of [...k.namen, ...k.knoten]) { const x = kurzName(n); if (x && !/^\d/.test(x)) namen.add(x) }
  const ips = Object.keys(k.ipNamen || {}).filter(ip => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
  const teile: string[] = []
  if (namen.size) teile.push(`(?<![A-Za-z0-9_$-])(?:${[...namen].sort((a, b) => b.length - a.length).map(esc).join('|')})(?:\\.[A-Za-z0-9-]+)*(?![A-Za-z0-9_-])`)
  if (ips.length) teile.push(`(?<![0-9.])(?:${ips.map(esc).join('|')})(?![0-9]|\\.[0-9])`)
  const re = teile.length ? new RegExp(teile.join('|'), 'gi') : null
  const ipNamen = k.ipNamen || {}
  return {
    re,
    aufloesen: (token: string) => {
      const t = token.trim()
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return kurzName(ipNamen[t] || t)
      return kurzName(t)
    },
    // IPs werden über ipNamen zum Namen aufgelöst — die Sperrliste braucht nur Namen.
    knoten: new Set(k.knoten.map(kurzName).filter(Boolean)),
  }
}

// Fern-Syntax direkt VOR dem Namen (Fenster: Text vor dem Treffer, ohne Zeilenwechsel)
const DIREKT_FERN: RegExp[] = [
  // -ComputerName 'X' · -ComputerName @('A','X') · -Cn X · -ComputerName A,X
  /-(?:ComputerName|Cn)\s+(?:@?\(\s*)?(?:['"]?[^\s'",)]+['"]?\s*,\s*)*['"]?$/i,
  // UNC \\X (auch \\\\X aus zusammengesetzten Pfaden)
  /\\\\['"]?$/,
  // schtasks /s X · quser /server:X · wmic /node:X · shutdown /m \\X (UNC oben)
  /\/(?:s|server|node|m)(?::|\s+)['"]?$/i,
  // Test-WSMan X · New-CimSession X · New-PSSession X · Enter-PSSession X (Positionsparameter)
  /\b(?:Test-WSMan|New-CimSession|New-PSSession|Enter-PSSession|Test-NetConnection)\s+['"]?$/i,
  // [ServiceController]::new('WinRM','X')
  /ServiceController\]::new\(\s*['"][^'"]*['"]\s*,\s*['"]?$/i,
]
// Ping-Syntax direkt vor dem Namen
const DIREKT_PING: RegExp[] = [
  /\bTest-Connection\s+(?:-ComputerName\s+|-TargetName\s+)?(?:@?\(\s*)?(?:['"]?[^\s'",)]+['"]?\s*,\s*)*['"]?$/i,
  /\bping(?:\.exe)?\s+(?:-[a-z]\s+\d+\s+)*['"]?$/i,
  /SendPingAsync\(\s*['"]?$/i,
]
// Fern-Parameter mit Variable irgendwo im Befehl → Namen in Anführungszeichen sind Ziele
// ($env:COMPUTERNAME ist der eigene Rechner, zählt nicht)
const FERN_VARIABLE = /-(?:ComputerName|Cn|CimSession)\s+\$(?!env:)|\/(?:server|node):\s*\$(?!env:)|\/s\s+\$(?!env:)|\\\\\$(?!env:)|\\\\"\s*\+\s*\$(?!env:)|ServiceController\]::new\([^)]*,\s*\$(?!env:)|\b(?:Test-WSMan|New-CimSession|New-PSSession|Enter-PSSession)\s+\$(?!env:)/i
const PING_MARKER = /SendPingAsync|\bTest-Connection\b|\bping(?:\.exe)?\s/i

// Ändernde Befehle (nur zur Einordnung „lesend/ändernd“ im Protokoll; Aufrufer können
// die Art ausdrücklich mitgeben, das hat Vorrang)
const AENDERND = new RegExp([
  String.raw`\b(?:Restart|Stop)-Computer\b`,
  String.raw`\b(?:Start|Stop|Restart|Set|Suspend|Resume)-Service\b`,
  String.raw`\b(?:Set|New|Remove|Rename)-ItemProperty\b`,
  String.raw`\b(?:Remove|Rename|Move|Copy|New)-Item\b`,
  String.raw`\b(?:Set|Add|Clear)-Content\b`, String.raw`\bOut-File\b`, String.raw`\bSet-Acl\b`,
  String.raw`\b(?:Enable|Disable)-PSRemoting\b`, String.raw`\bInvoke-(?:Wmi|Cim)Method\b`,
  String.raw`\b(?:Register|Unregister|Start|Enable|Disable|Set)-ScheduledTask\b`,
  String.raw`\b(?:Start|Stop|Restart)-(?:WebAppPool|Website)\b`,
  String.raw`\b(?:Install|Uninstall)-(?:Package|Module|WindowsFeature|WindowsUpdate)\b`,
  String.raw`\bshutdown(?:\.exe)?\s+[^\n]*\/[rsfp]\b`,
  String.raw`\breg(?:\.exe)?\s+(?:add|delete|import|load|unload)\b`,
  String.raw`\bsc(?:\.exe)?\s+(?:"?\\\\\S+\s+)?(?:config|start|stop|delete|create|failure)\b`,
  String.raw`\bschtasks(?:\.exe)?\s+[^\n]*\/(?:create|run|delete|change|end)\b`,
  String.raw`\bpsexec`, String.raw`\/RestoreHealth`, String.raw`\/StartComponentCleanup`, String.raw`\/scannow`,
  String.raw`\bchkdsk\b[^\n]*\/[fr]\b`, String.raw`\bmsiexec\b`,
  String.raw`\bwinrm\s+(?:quickconfig|qc|set|create|delete)\b`,
  String.raw`\bbcdedit\s+\/set\b`, String.raw`\bgpupdate\b`,
].join('|'), 'i')

// Anlegen/Aufräumen von TEMP-Dateien (z. B. Übergabedateien des Tools, die im finally wieder
// gelöscht werden) ist keine Änderung am Server — vor der Einordnung herausnehmen (17.11.2026:
// die Chiron-Karte erschien sonst als „ändernd“, obwohl sie nur ihre lokale Temp-Datei löschte).
const LOKAL_TEMP = /\b(?:Remove-Item|New-Item|Set-Content|Add-Content|Out-File)\b[^\n;]*?(?:\$env:TE?MP\b|GetTempPath|\\AppData\\Local\\Temp\\|\\Temp\\)[^\n;]*/gi

/** Einordnung eines Befehls ohne Zielbezug: ändernd oder lesend. */
export function artAusBefehl(befehl: string): 'lesen' | 'aendern' {
  return AENDERND.test(befehl.replace(LOKAL_TEMP, '')) ? 'aendern' : 'lesen'
}

function zeilenAnfang(text: string, i: number): number {
  const n = text.lastIndexOf('\n', i - 1)
  return n < 0 ? 0 : n + 1
}

/**
 * Erkennt die angesprochenen Server eines Befehls.
 * `artVorgabe` (vom Aufrufer, z. B. 'lesen' für den Server-Monitor) hat Vorrang vor der
 * Einordnung aus dem Befehlstext — außer bei reinen Ping-Zielen.
 */
export function erkenneZiele(befehl: string, m: Muster, artVorgabe?: ZugriffArt): Erkennung {
  const leer: Erkennung = { treffer: [], gesperrt: [] }
  if (!m.re || !befehl) return leer
  const fern = new Set<string>()
  const ping = new Set<string>()
  const zitiert = new Set<string>()
  m.re.lastIndex = 0
  let t: RegExpExecArray | null
  while ((t = m.re.exec(befehl))) {
    const name = m.aufloesen(t[0])
    if (!name) continue
    const vor = befehl.slice(Math.max(zeilenAnfang(befehl, t.index), t.index - 400), t.index)
    const nach = befehl.charAt(t.index + t[0].length)
    if (DIREKT_PING.some(r => r.test(vor))) { ping.add(name); continue }
    if (DIREKT_FERN.some(r => r.test(vor))) { fern.add(name); continue }
    const zeichenVor = befehl.charAt(t.index - 1)
    if ((zeichenVor === "'" || zeichenVor === '"') && (nach === "'" || nach === '"')) zitiert.add(name)
  }
  if (zitiert.size) {
    // Test-Connection -ComputerName $h ist ein Ping — für die Variablen-Prüfung herausnehmen
    const ohnePing = befehl.replace(/\bTest-Connection\b[^\n;|}]*/gi, '')
    if (FERN_VARIABLE.test(ohnePing)) for (const n of zitiert) fern.add(n)
    else if (PING_MARKER.test(befehl)) for (const n of zitiert) ping.add(n)
  }
  for (const n of fern) ping.delete(n)
  const treffer: ZielTreffer[] = []
  if (fern.size) treffer.push({ hosts: [...fern], art: artVorgabe && artVorgabe !== 'ping' ? artVorgabe : artAusBefehl(befehl) })
  if (ping.size) treffer.push({ hosts: [...ping], art: 'ping' })
  const gesperrt = [...fern].filter(n => m.knoten.has(n))
  return { treffer, gesperrt }
}

/** Text, mit dem ein gesperrter Befehl beantwortet wird (erscheint in der Oberfläche). */
export function sperrText(knoten: string[]): string {
  const l = knoten.join(', ')
  return `Cluster-Knoten ${l}: Das IT Admin Tool greift hier nur per Ping zu (Knoten wird vom Dienstleister verwaltet). Der Befehl wurde nicht ausgeführt.`
}
