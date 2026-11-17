// ── Server: „Health Check“ = DISM ScanHealth + SFC /verifyonly ───────────────
// Führt je Server per WinRM nacheinander aus (seit 17.11.2026 beide, vorher nur DISM):
//   1. DISM /English /Online /Cleanup-Image /ScanHealth   → Komponentenspeicher (WinSxS)
//   2. sfc /verifyonly                                    → geschützte Systemdateien
// Beides PRÜFT nur (Reparatur wäre /RestoreHealth bzw. sfc /scannow — wird nie
// ausgeführt). /English nur, damit die Ausgabe auf deutschen und englischen Servern
// gleich auswertbar ist. Zusätzlich NUR LESEND: Betriebssystem/Build, freier Platz auf
// dem Systemlaufwerk, ausstehender Neustart, die Zeilen aus CBS.log/dism.log, die
// während des Scans geschrieben wurden (dort stehen die beschädigten Dateien).
// Läuft auf dem Server schon ein DISM bzw. SFC, wird KEIN zweiter gestartet.
//
// Ablage: server_monitor/dism/<HOST>.json                letzter Stand + Verlauf je Server
//         server_monitor/dism/berichte/HealthCheck_….md   Bericht (für Menschen + KI)
//         server_monitor/dism/berichte/HealthCheck_….json derselbe Bericht strukturiert
// Kurzfassung für die Kachel: status.json servers[*].dism

import { api } from '../electronAPI'
import { fern, lies, kurzFehler } from './serverZustand'
import { aktualisiereStatus, hostKey } from './serverMonitor'
import { NUR_ASCII } from '../vollDiagnose/skripte'

export type DismZustand =
  | 'gesund' | 'reparierbar' | 'nicht_reparierbar'
  | 'fehler' | 'nicht_erreichbar' | 'laeuft_schon' | 'nicht_unterstuetzt' | 'unklar'

export interface DismInfo {
  os?: string
  version?: string
  ubr?: number
  boot?: string
  systemLw?: string
  freiGB?: number
  groesseGB?: number
  neustartAusstehend?: boolean
  tiWorker?: boolean
}
export interface DismBeschaedigung { art: string; datei: string }
export interface DismErgebnis {
  host: string
  /** Ende des Scans (ISO) */
  am: string
  /** Beginn des Scans (ISO) */
  start?: string
  dauerS?: number
  von: string
  zustand: DismZustand
  /** Kurztext deutsch („Komponentenspeicher gesund“ …) */
  text: string
  /** Ergebniszeile aus der DISM-Ausgabe (Englisch) */
  meldung?: string
  exitCode?: number
  fehlerCode?: string
  fehlerText?: string
  /** Erklärung bekannter Fehlercodes */
  hinweis?: string
  info?: DismInfo
  /** bereinigte DISM-Ausgabe (ohne Fortschrittsbalken) */
  ausgabe: string[]
  /** CBS.log: Block „Checking System Update Readiness“ … „Total Repaired Corruption“ */
  cbsBlock: string[]
  /** CBS.log: weitere auffällige Zeilen seit Scanbeginn */
  cbsZeilen: string[]
  /** dism.log: Fehler/Warnungen seit Scanbeginn */
  dismLog: string[]
  beschaedigt: DismBeschaedigung[]
  gefunden?: number
  repariert?: number
  /** z. B. „CBS.log nicht lesbar“ */
  logHinweis?: string
  /** Zweiter Teil des Health Checks: sfc /verifyonly (fehlt bei Ergebnissen vor dem 17.11.2026) */
  sfc?: SfcErgebnis
}

/** Ergebnis von sfc /verifyonly (Auswertung auch für die Tiefenprüfung der Komplett-Diagnose). */
export type SfcZustand = 'ok' | 'verletzungen' | 'blockiert' | 'neustart' | 'rechte' | 'unklar'
/** zusätzlich: nicht gelaufen, weil auf dem Server schon ein DISM/SFC lief */
export type SfcStand = SfcZustand | 'laeuft_schon' | 'uebersprungen'
export interface SfcErgebnis {
  zustand: SfcStand
  /** Kurztext deutsch */
  text: string
  /** Ergebniszeile von sfc (so, wie sie kam) */
  meldung: string
  /** betroffene Dateien (aus den [SR]-Zeilen in CBS.log) */
  dateien: string[]
  /** bereinigte SFC-Ausgabe */
  ausgabe: string[]
  /** CBS.log: [SR]-Zeilen seit SFC-Start */
  srZeilen: string[]
  exitCode?: number
  start?: string
  dauerS?: number
}
export interface DismKurz {
  am: string
  zustand: DismZustand
  text: string
  dauerS?: number
  /** SFC-Teil des Health Checks (fehlt bei älteren Ergebnissen) */
  sfc?: SfcStand
  sfcText?: string
  /** läuft gerade (von wem, seit wann) — für andere Tool-Instanzen sichtbar */
  laeuft?: { seit: string; von: string }
  /** letzter Versuch ohne echtes Ergebnis (nicht erreichbar / DISM lief schon) — der Stand oben bleibt */
  versuch?: { am: string; zustand: DismZustand; text: string }
}
export interface DismDatei {
  /** letztes ECHTES Ergebnis — wird von „nicht erreichbar“ nie überschrieben */
  letzter: DismErgebnis | null
  letzterVersuch?: DismErgebnis
  verlauf: { am: string; zustand: DismZustand; dauerS?: number; von: string; sfc?: SfcStand }[]
}
/** Angaben aus Kachel/Serverliste für den Bericht */
export interface DismMeta { bezeichnung?: string; anwendungen?: string; ip?: string }

export const DISM_BEFEHL = 'DISM /English /Online /Cleanup-Image /ScanHealth'
export const SFC_BEFEHL = 'sfc /verifyonly'
export const HEALTH_NAME = 'Health Check'
export const DISM_ORDNER = 'server_monitor/dism'
export const DISM_BERICHTE = `${DISM_ORDNER}/berichte`
/** Zeitfenster je Server: ScanHealth meist 5–20 min + SFC meist 5–15 min, auf langsamen Servern länger. */
export const DISM_TIMEOUT_MS = 110 * 60_000
/** „läuft“-Markierung gilt höchstens so lange (Tool abgestürzt → nicht ewig „läuft“). */
export const DISM_LAEUFT_MAX_MS = 120 * 60_000
/** Annahme für die Dauer-Schätzung, wenn ein Server noch nie geprüft wurde (DISM + SFC). */
export const DISM_DAUER_ANNAHME_S = 20 * 60

/** Für Tooltips: was der Health Check auf dem Server ausführt (ein Satz je Befehl). */
export const HEALTH_TOOLTIP =
  `${HEALTH_NAME} – nur Prüfung, es wird nichts repariert oder geändert:\n` +
  `1. ${DISM_BEFEHL} – prüft den Windows-Komponentenspeicher (WinSxS), aus dem Updates und Reparaturen kommen.\n` +
  `2. ${SFC_BEFEHL} – prüft alle geschützten Systemdateien (DLLs, Programme, Treiber) gegen die Originale.\n` +
  'Dazu nur lesend: Windows-Version, letzter Neustart, freier Platz, ausstehender Neustart, CBS.log/dism.log.\n' +
  'Dauer je Server meist 10–30 min (spürbare Last auf Datenträger und CPU). Läuft dort schon ein DISM/SFC, wird nichts gestartet.\n' +
  'Es läuft immer nur EIN Health Check zur Zeit – auch über alle Admins hinweg (gemeinsamer Cluster-Speicher); sonst wird gewartet.'

const key = (h: string) => (h || '').trim().toUpperCase()
const standDatei = (h: string) => `${DISM_ORDNER}/${key(h)}.json`
const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : v == null ? [] : [v as T]
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))

// ── PowerShell (läuft per WinRM auf dem Server, nur lesend außer dem DISM-Scan selbst) ──
export const DISM_INNER = String.raw`
    $info = @{}
    try { $os = Get-CimInstance Win32_OperatingSystem; $info.os = [string]$os.Caption; $info.version = [string]$os.Version; $info.boot = $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm') } catch { }
    try { $info.ubr = [int](Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name UBR -ErrorAction Stop).UBR } catch { }
    try { $lw = [string]$env:SystemDrive; $info.systemLw = $lw; $d = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $lw + "'"); $info.freiGB = [math]::Round($d.FreeSpace / 1GB, 1); $info.groesseGB = [math]::Round($d.Size / 1GB, 1) } catch { }
    $info.neustartAusstehend = [bool]((Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'))
    $info.tiWorker = [bool](@(Get-Process -Name TiWorker -ErrorAction SilentlyContinue).Count -gt 0)
    if (@(Get-Process -Name dism -ErrorAction SilentlyContinue).Count -gt 0) {
      @{ ok = $true; laeuftSchon = $true; info = $info } | ConvertTo-Json -Depth 4 -Compress
      return
    }
    $start = Get-Date
    $exe = Join-Path $env:SystemRoot 'System32\dism.exe'
    $roh = @(& $exe /English /Online /Cleanup-Image /ScanHealth 2>&1 | ForEach-Object { [string]$_ })
    $code = $LASTEXITCODE
    $ende = Get-Date
    # Fortschrittsbalken (je Stand eine Zeile bzw. per Wagenrücklauf überschrieben) schon hier entfernen,
    # sonst verdrängen hunderte Balken-Zeilen den Kopf der Ausgabe
    $ausgabe = @(foreach ($z in $roh) { $teile = @(($z -split "\r") | Where-Object { $_.Trim() }); if ($teile.Count) { $teile[-1] } else { '' } }) | Where-Object { $_ -notmatch '^\s*\[[=\s]*\d{1,3}([.,]\d)?\s*%[=\s]*\]\s*$' }
    $ausgabe = @($ausgabe)
    function Read-SkfLog([string]$pfad, [int]$maxBytes) {
      $fs = $null
      try {
        if (-not (Test-Path -LiteralPath $pfad)) { return ,@('@@FEHLT@@') }
        $fs = [IO.File]::Open($pfad, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
        if ($fs.Length -gt $maxBytes) { [void]$fs.Seek($fs.Length - $maxBytes, [IO.SeekOrigin]::Begin) }
        $sr = New-Object IO.StreamReader($fs)
        $t = $sr.ReadToEnd()
        return ,@($t -split "\r?\n")
      } catch { return ,@('@@FEHLER@@' + $_.Exception.Message) } finally { if ($fs) { $fs.Dispose() } }
    }
    # Zeitstempel „yyyy-MM-dd HH:mm:ss“ lassen sich als Text vergleichen (schnell bei großen Logs)
    $ab = $start.AddSeconds(-5).ToString('yyyy-MM-dd HH:mm:ss')
    function Select-SkfFenster($zeilen) {
      $im = $false
      foreach ($z in $zeilen) {
        if ($z.Length -ge 19 -and $z -match '^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d') { $im = ([string]::CompareOrdinal($z.Substring(0, 19), $ab) -ge 0) }
        if ($im) { $z }
      }
    }
    $logHinweis = ''
    $cbsBlock = @(); $cbsZeilen = @()
    $cbs = Read-SkfLog (Join-Path $env:SystemRoot 'Logs\CBS\CBS.log') 41943040
    if ($cbs.Count -eq 1 -and ([string]$cbs[0]).StartsWith('@@')) { $logHinweis = 'CBS.log nicht lesbar: ' + ([string]$cbs[0]).TrimStart('@') }
    else {
      $fenster = @(Select-SkfFenster $cbs)
      $imBlock = $false
      foreach ($z in $fenster) {
        if ($z -match 'Checking System Update Readiness') { $imBlock = $true; $cbsBlock = @() }
        if ($imBlock) { if ($cbsBlock.Count -lt 400) { $cbsBlock += $z }; if ($z -match 'Total Repaired Corruption') { $imBlock = $false }; continue }
        if ($cbsZeilen.Count -lt 200 -and $z -match '(?i)corrupt|\((p|f|fix)\)\s|, Error |\bfailed\b|ERROR_|hr\s*=\s*0x8|HRESULT\s*=\s*0x8|Repair') { $cbsZeilen += $z }
      }
    }
    $dismLog = @()
    $dl = Read-SkfLog (Join-Path $env:SystemRoot 'Logs\DISM\dism.log') 10485760
    if (-not ($dl.Count -eq 1 -and ([string]$dl[0]).StartsWith('@@'))) {
      $dismLog = @(Select-SkfFenster $dl | Where-Object { $_ -match ', (Error|Warning) ' } | Select-Object -First 120)
    }
    @{ ok = $true; start = $start.ToUniversalTime().ToString('o'); ende = $ende.ToUniversalTime().ToString('o'); exitCode = $code;
       ausgabe = @($ausgabe | Select-Object -Last 300); info = $info; cbsBlock = @($cbsBlock); cbsZeilen = @($cbsZeilen); dismLog = @($dismLog); logHinweis = $logHinweis } | ConvertTo-Json -Depth 4 -Compress
`

/**
 * sfc /verifyonly (NUR Prüfung — sfc /scannow würde reparieren und wird nie ausgeführt).
 * sfc schreibt UTF-16: zum Einlesen kurz auf Unicode stellen; scheitert das ohne Konsole
 * (Fernsitzung), bleiben nur NUL-Zeichen zu entfernen. Betroffene Dateien stehen mit „[SR]“
 * im CBS.log — gelesen werden nur Zeilen seit dem SFC-Start. Ergebnis in $sfcInfo.
 */
export const SFC_INNER = String.raw`
    $sfcInfo = [ordered]@{}
    if (@(Get-Process -Name sfc -ErrorAction SilentlyContinue).Count -gt 0) { $sfcInfo.laeuftSchon = $true }
    else {
      $sStart = Get-Date
      $altEnc = $null; try { $altEnc = [Console]::OutputEncoding; [Console]::OutputEncoding = [Text.Encoding]::Unicode } catch { }
      $sfcRoh = (& (Join-Path $env:SystemRoot 'System32\sfc.exe') /verifyonly 2>&1 | Out-String) -replace [char]0, ''
      $sfcInfo.exitCode = $LASTEXITCODE
      try { if ($altEnc) { [Console]::OutputEncoding = $altEnc } } catch { }
      $sEnde = Get-Date
      $sfcInfo.start = $sStart.ToUniversalTime().ToString('o'); $sfcInfo.ende = $sEnde.ToUniversalTime().ToString('o')
      $sfcInfo.ausgabe = @(($sfcRoh -split '[\r\n]+') | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -notmatch '\d+\s*%\s*(complete|abgeschlossen)' -and $_ -notmatch '^\s*\d+\s*%' } | Select-Object -Last 20)
      $sr = New-Object System.Collections.Generic.List[string]
      $sAb = $sStart.AddSeconds(-5).ToString('yyyy-MM-dd HH:mm:ss')
      $fs = $null
      try {
        $pf = Join-Path $env:SystemRoot 'Logs\CBS\CBS.log'
        $fs = [IO.File]::Open($pf, [IO.FileMode]::Open, [IO.FileAccess]::Read, ([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
        if ($fs.Length -gt 20971520) { [void]$fs.Seek($fs.Length - 20971520, [IO.SeekOrigin]::Begin) }
        $txt = (New-Object IO.StreamReader($fs)).ReadToEnd()
        foreach ($z in ($txt -split "\r?\n")) {
          if ($z.Length -lt 19 -or [string]::CompareOrdinal($z.Substring(0, 19), $sAb) -lt 0) { continue }
          if ($z -match '\[SR\]' -and $z -match 'Cannot|do not match|corrupt|Repair|Verify complete|repaired|not verify') { if ($sr.Count -lt 150) { $sr.Add($z) } }
        }
      } catch { $sfcInfo.logHinweis = 'CBS.log nicht lesbar: ' + $_.Exception.Message } finally { if ($fs) { $fs.Dispose() } }
      $sfcInfo.sr = $sr.ToArray()
    }
`

/** Health Check: erst DISM (Block oben), dann SFC — eine JSON-Zeile mit beiden Teilen (nur druckbares ASCII). */
export const HEALTH_INNER = String.raw`
    $__dism = @(& {
${DISM_INNER}
    })
    $o = [ordered]@{ ok = $true; dism = [string]($__dism | Select-Object -Last 1) }
    if ($o.dism -match '"laeuftSchon"\s*:\s*true') { $o.sfc = @{ uebersprungen = $true } }
    else {
${SFC_INNER}
      $o.sfc = $sfcInfo
    }
    $o | ConvertTo-Json -Depth 5 -Compress ${NUR_ASCII}
`

// ── Auswertung (rein, testbar) ──────────────────────────────────────────────
const FORTSCHRITT = /^\s*\[[=\s]*\d{1,3}(?:[.,]\d)?\s*%[=\s]*\]\s*$/
/** „[====100.0%====] No component store corruption detected.“ — Ergebnis steht hinter dem Balken */
const BALKEN_VORNE = /^\s*\[[=\s]*\d{1,3}(?:[.,]\d)?\s*%[=\s]*\]\s*/

/** Fortschrittsbalken und doppelte Leerzeilen entfernen. */
export function bereinigeAusgabe(roh: string[]): string[] {
  const aus: string[] = []
  for (const z0 of roh) {
    const teile = String(z0 ?? '').split('\r').filter(t => t.trim())
    let z = (teile.length ? teile[teile.length - 1] : '').replace(/\s+$/, '')
    if (FORTSCHRITT.test(z)) continue
    if (BALKEN_VORNE.test(z)) { z = z.replace(BALKEN_VORNE, ''); if (!z.trim()) continue }
    if (!z.trim() && (!aus.length || !aus[aus.length - 1].trim())) continue
    aus.push(z)
  }
  while (aus.length && !aus[aus.length - 1].trim()) aus.pop()
  return aus
}

/** Bekannte Fehlercodes → Erklärung (nur sichere Zuordnungen). */
export const DISM_FEHLER: Record<string, string> = {
  '87': 'Parameter unbekannt – dieses Windows kennt /ScanHealth nicht (älter als Server 2012) oder der Befehl ist falsch geschrieben.',
  '740': 'Erhöhte Rechte erforderlich – die Fernsitzung läuft ohne Administratorrechte.',
  '5': 'Zugriff verweigert.',
  '0x80070005': 'Zugriff verweigert.',
  '2': 'Datei nicht gefunden.',
  '1726': 'Remoteprozeduraufruf fehlgeschlagen – häufig läuft gleichzeitig eine andere Wartung (Windows Update) oder ein Neustart steht aus.',
  '1009': 'Die Registrierungsdatenbank ist beschädigt (ERROR_BADDB).',
  '14098': 'Der Komponentenspeicher ist beschädigt (ERROR_SXS_COMPONENT_STORE_CORRUPT).',
  '0x800f081f': 'Quelldateien nicht gefunden (CBS_E_SOURCE_MISSING) – betrifft eine Reparatur, nicht die reine Prüfung.',
  '0x800705b4': 'Zeitüberschreitung des Vorgangs.',
}

const ZAHL = (s?: string) => { const n = Number(String(s ?? '').trim()); return Number.isFinite(n) ? n : undefined }

/** „(p)	CSI Payload Corrupt	(n)	amd64_…\datei.dll“ → { art, datei } */
export function beschaedigungenAus(zeilen: string[]): DismBeschaedigung[] {
  const aus: DismBeschaedigung[] = []
  for (const z of zeilen) {
    const m = /\((?:p|f|fix|w)\)\s+(.+)$/i.exec(z)
    if (!m) continue
    const teile = m[1].split('\t').map(t => t.trim()).filter(t => t && !/^\(\w+\)$/.test(t))
    if (!teile.length || !/corrupt|missing|beschädigt|fehlt/i.test(teile[0])) continue
    const e = { art: teile[0], datei: teile.slice(1).join(' ') }
    if (!aus.some(x => x.art === e.art && x.datei === e.datei)) aus.push(e)
    if (aus.length >= 200) break
  }
  return aus
}

/** Aus der rohen Antwort des Servers das Ergebnis bauen. */
export function dismAusRoh(host: string, d: Record<string, unknown>, von: string, jetzt = new Date()): DismErgebnis {
  const info = (d.info && typeof d.info === 'object' ? d.info : {}) as DismInfo
  if (d.laeuftSchon) {
    return { host: key(host), am: jetzt.toISOString(), von, zustand: 'laeuft_schon', info,
      text: 'Auf dem Server läuft bereits ein DISM-Vorgang – kein zweiter gestartet',
      ausgabe: [], cbsBlock: [], cbsZeilen: [], dismLog: [], beschaedigt: [] }
  }
  const ausgabe = bereinigeAusgabe(arr<string>(d.ausgabe).map(String))
  const cbsBlock = arr<string>(d.cbsBlock).map(String)
  const cbsZeilen = arr<string>(d.cbsZeilen).map(String)
  const dismLog = arr<string>(d.dismLog).map(String)
  const start = String(d.start || '') || undefined
  const ende = String(d.ende || '') || undefined
  const dauerS = start && ende ? Math.max(0, Math.round((new Date(ende).getTime() - new Date(start).getTime()) / 1000)) : undefined
  const exitCode = typeof d.exitCode === 'number' ? d.exitCode : ZAHL(String(d.exitCode ?? '')) ?? undefined
  const text = ausgabe.join('\n')

  // Fehler: „Error: 0x800f081f“ + Erklärungszeile(n) danach
  let fehlerCode: string | undefined, fehlerText: string | undefined
  const iFehler = ausgabe.findIndex(z => /^\s*(Error|Fehler)\s*:\s*\S+/i.test(z))
  if (iFehler >= 0) {
    fehlerCode = /^\s*(?:Error|Fehler)\s*:\s*(\S+)/i.exec(ausgabe[iFehler])![1].toLowerCase()
    const rest: string[] = []
    for (const z of ausgabe.slice(iFehler + 1)) {
      if (/DISM log file|DISM-Protokolldatei/i.test(z)) break
      if (z.trim()) rest.push(z.trim())
      if (rest.length >= 4) break
    }
    fehlerText = rest.join(' ') || undefined
  }
  const meldungZeile = (re: RegExp) => ausgabe.find(z => re.test(z))?.trim()

  let zustand: DismZustand
  let kurz: string
  let meldung: string | undefined
  if ((meldung = meldungZeile(/no component store corruption detected|keine komponentenspeicherbesch/i))) {
    zustand = 'gesund'; kurz = 'Komponentenspeicher gesund – keine Beschädigung gefunden'
  } else if ((meldung = meldungZeile(/component store is repairable|komponentenspeicher kann repariert werden/i))) {
    zustand = 'reparierbar'; kurz = 'Komponentenspeicher beschädigt, aber reparierbar (DISM /RestoreHealth)'
  } else if ((meldung = meldungZeile(/component store cannot be repaired|kann nicht repariert werden/i))) {
    zustand = 'nicht_reparierbar'; kurz = 'Komponentenspeicher beschädigt und NICHT reparierbar'
  } else if (fehlerCode === '87' || /(scanhealth|cleanup-image)[^\n]*(is unknown|not recognized|ist unbekannt)/i.test(text)) {
    zustand = 'nicht_unterstuetzt'; kurz = 'Dieses Windows unterstützt /ScanHealth nicht'
  } else if (fehlerCode) {
    zustand = 'fehler'; kurz = `DISM-Fehler ${fehlerCode}`
  } else if (!ausgabe.length) {
    zustand = 'fehler'; kurz = 'DISM lieferte keine Ausgabe'
  } else {
    zustand = 'unklar'; kurz = exitCode === 0 ? 'DISM meldete Erfolg, Ergebnis nicht erkannt – Ausgabe prüfen' : `Ergebnis nicht erkannt (Exit-Code ${exitCode ?? '?'})`
  }

  const zahlAus = (re: RegExp) => { for (const z of cbsBlock) { const m = re.exec(z); if (m) return ZAHL(m[1]) } return undefined }
  return {
    host: key(host), am: jetzt.toISOString(), start, dauerS, von, zustand, text: kurz, meldung, exitCode,
    fehlerCode, fehlerText, hinweis: fehlerCode ? DISM_FEHLER[fehlerCode] : undefined, info,
    ausgabe, cbsBlock, cbsZeilen, dismLog,
    beschaedigt: beschaedigungenAus([...cbsBlock, ...cbsZeilen]),
    gefunden: zahlAus(/Total Detected Corruption:\s*(\d+)/i),
    repariert: zahlAus(/Total Repaired Corruption:\s*(\d+)/i),
    logHinweis: String(d.logHinweis || '') || undefined,
  }
}

/** Umlaute je nach Kodierung kaputt („Integrit³ts…“, „IntegritÃ¤ts…“) → in Mustern 1–2 beliebige Zeichen. */
export function sfcAusRoh(zeilen: string[], sr: string[]): { zustand: SfcZustand; meldung: string; dateien: string[] } {
  const text = zeilen.join(' ')
  let meldung = zeilen.find(z => /Ressourcenschutz|Resource Protection|Systemreparatur|system repair/i.test(z)) || ''
  if (!meldung && zeilen.length) {
    // umbrochener Satz („Sie müssen … Konsolensitzung“ / „ausführen, um …“) → beide Zeilen
    const n = zeilen.length
    meldung = n > 1 && /^[a-zäöüß]/.test(zeilen[n - 1]) ? `${zeilen[n - 2]} ${zeilen[n - 1]}` : zeilen[n - 1]
  }
  const dateien = [...new Set(sr.flatMap(z => [...z.matchAll(/["'\[]([^"'\]\\]+\.(?:dll|exe|sys|mui|ocx|cpl|drv|winmd|cat|manifest))["'\]]/gi)].map(m => m[1])))].slice(0, 40)
  let zustand: SfcZustand = 'unklar'
  if (/did not find any integrity violations|keine Integrit.{1,2}tsverletzungen/i.test(text)) zustand = 'ok'
  else if (/found integrity violations|Integrit.{1,2}tsverletzungen gefunden|corrupt files|besch.{1,2}digte Dateien/i.test(text)) zustand = 'verletzungen'
  else if (/system repair pending|Systemreparatur (aus|steht aus)|requires reboot|Neustart erforderlich/i.test(text)) zustand = 'neustart'
  else if (/could not perform the requested operation|konnte den angeforderten Vorgang nicht/i.test(text)) zustand = 'blockiert'
  else if (/administrator running a console session|als Administrator angemeldet sein/i.test(text)) zustand = 'rechte'
  if (zustand === 'unklar' && dateien.length && sr.some(z => /do not match|Cannot verify|corrupt/i.test(z))) zustand = 'verletzungen'
  return { zustand, meldung: meldung.trim(), dateien }
}

export const SFC_TEXT: Record<SfcStand, string> = {
  ok: 'Systemdateien in Ordnung – keine Integritätsverletzungen',
  verletzungen: 'Integritätsverletzungen gefunden – Systemdateien beschädigt oder verändert',
  neustart: 'Eine Systemreparatur steht aus – erst neu starten, dann erneut prüfen',
  blockiert: 'SFC konnte den Vorgang nicht ausführen (andere Wartung aktiv oder Neustart ausstehend)',
  rechte: 'SFC lief ohne Administratorrechte',
  unklar: 'Ergebnis von SFC nicht erkannt – Ausgabe prüfen',
  laeuft_schon: 'Auf dem Server lief bereits ein SFC – kein zweiter gestartet',
  uebersprungen: 'Nicht gestartet, weil auf dem Server schon ein DISM lief',
}
export const sfcKurz: Record<SfcStand, string> = {
  ok: 'ok', verletzungen: 'Verletzungen', neustart: 'Neustart nötig', blockiert: 'blockiert', rechte: 'keine Rechte', unklar: 'unklar', laeuft_schon: 'lief schon', uebersprungen: 'übersprungen',
}

/** SFC-Ergebnis aus den rohen Zeilen bauen (Health Check und Tiefenprüfung der Komplett-Diagnose). */
export function sfcErgebnisAus(ausgabe: string[], sr: string[], o: { exitCode?: number; start?: string; ende?: string } = {}): SfcErgebnis {
  const zeilen = ausgabe.map(z => String(z ?? '').replace(/\u0000/g, '').trim()).filter(Boolean)
  const s = sfcAusRoh(zeilen, sr)
  const dauerS = o.start && o.ende ? Math.max(0, Math.round((new Date(o.ende).getTime() - new Date(o.start).getTime()) / 1000)) : undefined
  const zahl = s.zustand === 'verletzungen' && s.dateien.length ? ` (${s.dateien.length} Datei${s.dateien.length === 1 ? '' : 'en'})` : ''
  return { zustand: s.zustand, text: SFC_TEXT[s.zustand] + zahl, meldung: s.meldung, dateien: s.dateien, ausgabe: zeilen, srZeilen: sr, exitCode: o.exitCode, start: o.start, dauerS }
}

/**
 * Antwort des Health Checks ({ dism: "<JSON>", sfc: {…} }) auswerten. Ältere bzw. reine DISM-Antworten
 * (ohne „dism“-Feld) gehen weiter — dann ohne SFC-Teil.
 */
export function healthAusRoh(host: string, d: Record<string, unknown>, von: string, jetzt = new Date()): DismErgebnis {
  if (typeof d.dism !== 'string') return dismAusRoh(host, d, von, jetzt)
  let dj: Record<string, unknown> | null = null
  try { dj = JSON.parse(d.dism || 'null') } catch { dj = null }
  const e = dj ? dismAusRoh(host, dj, von, jetzt)
    : { ...dismNichtErreichbar(host, 'keine DISM-Antwort', von, jetzt), zustand: 'fehler' as DismZustand, text: 'DISM lieferte keine auswertbare Antwort' }
  const s = (d.sfc && typeof d.sfc === 'object' ? d.sfc : {}) as Record<string, unknown>
  if (s.uebersprungen) e.sfc = { zustand: 'uebersprungen', text: SFC_TEXT.uebersprungen, meldung: '', dateien: [], ausgabe: [], srZeilen: [] }
  else if (s.laeuftSchon) e.sfc = { zustand: 'laeuft_schon', text: SFC_TEXT.laeuft_schon, meldung: '', dateien: [], ausgabe: [], srZeilen: [] }
  else {
    const ex = typeof s.exitCode === 'number' ? s.exitCode : ZAHL(String(s.exitCode ?? ''))
    e.sfc = sfcErgebnisAus(arr<string>(s.ausgabe).map(String), arr<string>(s.sr).map(String), { exitCode: ex, start: String(s.start || '') || undefined, ende: String(s.ende || '') || undefined })
    if (s.logHinweis && !e.logHinweis) e.logHinweis = String(s.logHinweis)
  }
  // Dauer = DISM + SFC (Start des DISM bis Ende des SFC)
  if (e.start && e.sfc?.start && e.sfc.dauerS !== undefined) e.dauerS = Math.max(0, Math.round((new Date(e.sfc.start).getTime() + e.sfc.dauerS * 1000 - new Date(e.start).getTime()) / 1000))
  return e
}

/** Gesamtbild für Kachel/Liste: Farbe + Text aus DISM- und SFC-Teil. */
export type HealthStufe = 'gruen' | 'gelb' | 'rot' | 'grau'
export function healthGesamt(k: { zustand: DismZustand; sfc?: SfcStand }): { stufe: HealthStufe; text: string } {
  const teile: string[] = []
  let stufe: HealthStufe = 'gruen'
  const hoch = (s: HealthStufe) => { const r = { gruen: 0, grau: 1, gelb: 2, rot: 3 }; if (r[s] > r[stufe]) stufe = s }
  if (k.zustand === 'nicht_reparierbar' || k.zustand === 'fehler') { hoch('rot'); teile.push(`DISM ${zustandText[k.zustand]}`) }
  else if (k.zustand === 'reparierbar' || k.zustand === 'unklar') { hoch('gelb'); teile.push(`DISM ${zustandText[k.zustand]}`) }
  else if (k.zustand !== 'gesund') { hoch('grau'); teile.push(`DISM ${zustandText[k.zustand]}`) }
  if (k.sfc === 'verletzungen') { hoch('rot'); teile.push('SFC Verletzungen') }
  else if (k.sfc === 'neustart' || k.sfc === 'blockiert' || k.sfc === 'rechte' || k.sfc === 'unklar') { hoch('gelb'); teile.push(`SFC ${sfcKurz[k.sfc]}`) }
  else if (k.sfc === 'laeuft_schon' || k.sfc === 'uebersprungen') { hoch('grau'); teile.push(`SFC ${sfcKurz[k.sfc]}`) }
  if (!teile.length) return { stufe: 'gruen', text: k.sfc ? 'gesund' : 'gesund (ohne SFC)' }
  return { stufe, text: teile.join(' · ') }
}

/** Ergebnis, wenn der Server gar nicht antwortete. */
export function dismNichtErreichbar(host: string, fehler: string, von: string, jetzt = new Date()): DismErgebnis {
  return { host: key(host), am: jetzt.toISOString(), von, zustand: 'nicht_erreichbar', text: `Nicht erreichbar: ${fehler}`,
    ausgabe: [], cbsBlock: [], cbsZeilen: [], dismLog: [], beschaedigt: [] }
}

export const zustandText: Record<DismZustand, string> = {
  gesund: 'gesund', reparierbar: 'reparierbar', nicht_reparierbar: 'nicht reparierbar', fehler: 'Fehler',
  nicht_erreichbar: 'nicht erreichbar', laeuft_schon: 'DISM lief schon', nicht_unterstuetzt: 'nicht unterstützt', unklar: 'unklar',
}
/** Rangfolge für Sortierung/Farbe: je kleiner, desto schlimmer. */
export const zustandRang: Record<DismZustand, number> = {
  nicht_reparierbar: 0, reparierbar: 1, fehler: 2, unklar: 3, nicht_erreichbar: 4, laeuft_schon: 5, nicht_unterstuetzt: 6, gesund: 7,
}
export const istAuffaellig = (z?: DismZustand) => z === 'reparierbar' || z === 'nicht_reparierbar' || z === 'fehler' || z === 'unklar'

// ── Erklärungen (Reiter „Schnell-Health-Check“, Bericht) ────────────────────
export interface BefehlErklaerung {
  befehl: string
  titel: string
  macht: string
  bewirkt: string
  ergebnis: string
  erkennt: string[]
  dauer: string
  fehler: string[]
}
export const HEALTH_ERKLAERUNG: BefehlErklaerung[] = [
  {
    befehl: DISM_BEFEHL,
    titel: '1. Komponentenspeicher prüfen (DISM ScanHealth)',
    macht: 'Liest den ganzen Windows-Komponentenspeicher (Ordner C:\\Windows\\WinSxS) und vergleicht jede Komponente mit ihrer Prüfsumme. Der Komponentenspeicher ist die „Ersatzteilkiste“ von Windows: Aus ihm werden Updates, Rollen und Features installiert und beschädigte Systemdateien wiederhergestellt.',
    bewirkt: 'Nur Prüfung – es wird nichts repariert oder geändert (Reparatur wäre /RestoreHealth, das führt das Tool nie aus). DISM schreibt sein Ergebnis in CBS.log und dism.log; das Tool liest die Zeilen ab Scanbeginn. „/English“ sorgt nur für eine einheitlich auswertbare Ausgabe.',
    ergebnis: '„gesund“ (keine Beschädigung), „reparierbar“ (beschädigt, aber mit /RestoreHealth behebbar) oder „nicht reparierbar“ – dazu die Liste der beschädigten Komponenten aus CBS.log.',
    erkennt: [
      'beschädigte oder fehlende Komponenten und Manifeste im Komponentenspeicher',
      'Ursache für Windows-Updates, die immer wieder scheitern (z. B. 0x800f081f, 0x800f0831, 0x80073712)',
      'Rollen und Features, die sich nicht installieren oder entfernen lassen',
      'warum SFC Systemdateien nicht wiederherstellen kann (die Vorlage selbst ist kaputt)',
    ],
    dauer: 'meist 5–20 min; liest den ganzen Komponentenspeicher (spürbare Last auf Datenträger und CPU). Läuft auf dem Server schon ein DISM, wird kein zweiter gestartet.',
    fehler: [
      '740 – die Fernsitzung hat keine Administratorrechte',
      '87 – dieses Windows kennt /ScanHealth nicht (älter als Server 2012)',
      '1726 – andere Wartung (Windows Update) läuft oder ein Neustart steht aus',
      '14098 – Komponentenspeicher beschädigt',
      '0x800705b4 – Zeitüberschreitung',
    ],
  },
  {
    befehl: SFC_BEFEHL,
    titel: '2. Systemdateien prüfen (SFC verifyonly)',
    macht: 'Der „System File Checker“ prüft alle geschützten Windows-Systemdateien – DLLs, Programme und Treiber u. a. in System32 – gegen die Originale aus dem Komponentenspeicher.',
    bewirkt: 'Nur Prüfung – „/verifyonly“ ersetzt keine Datei (Reparatur wäre sfc /scannow, das führt das Tool nie aus). Betroffene Dateien schreibt SFC mit „[SR]“ ins CBS.log; das Tool liest diese Zeilen ab dem SFC-Start.',
    ergebnis: '„keine Integritätsverletzungen“, „Integritätsverletzungen gefunden“ (mit Liste der Dateien), „Systemreparatur steht aus“ (erst Neustart) oder „Vorgang konnte nicht ausgeführt werden“.',
    erkennt: [
      'beschädigte, veränderte oder falsche Versionen von Systemdateien',
      'Ursache für abstürzende Dienste und Programme, Bluescreens, Anmelde- und Startprobleme',
      'Systemdateien, die von Software oder Schadsoftware ausgetauscht wurden',
      'eine angefangene, noch nicht abgeschlossene Reparatur (Neustart ausstehend)',
    ],
    dauer: 'meist 5–15 min; liest alle geschützten Systemdateien. Läuft erst nach DISM: SFC repariert aus dem Komponentenspeicher – ist der nicht gesund, hilft SFC allein nicht.',
    fehler: [
      '„konnte den angeforderten Vorgang nicht ausführen“ – andere Wartung (TrustedInstaller/Windows Update) aktiv oder Neustart ausstehend',
      '„Systemreparatur steht aus“ – erst neu starten',
      '„muss als Administrator angemeldet sein“ – keine Administratorrechte',
    ],
  },
]
export const HEALTH_ZUSATZ = 'Zusätzlich nur gelesen: Windows-Version und Build, letzter Neustart, freier Platz auf dem Systemlaufwerk, ob ein Neustart aussteht und ob der Windows-Update-Installer (TiWorker) gerade läuft.'

/** Was bedeutet das Ergebnis – und was ist zu tun? (Reparaturen macht das Tool NIE selbst.) */
export const DISM_WAS_TUN: Partial<Record<DismZustand, string>> = {
  gesund: 'Nichts zu tun.',
  reparierbar: 'Im Wartungsfenster von Hand: DISM /Online /Cleanup-Image /RestoreHealth (braucht Windows Update/WSUS oder eine Quelle per /Source), danach sfc /scannow und neu starten. Das Tool repariert nicht selbst.',
  nicht_reparierbar: 'Reparatur nur mit Installationsmedium derselben Version als Quelle (/RestoreHealth /Source:wim:…) – sonst Inplace-Upgrade oder Neuaufbau. Die Server-Verantwortlichen einbeziehen.',
  fehler: 'Fehlercode beachten (Erklärung oben). Häufig: Neustart steht aus oder Windows Update arbeitet gerade – später erneut prüfen.',
  unklar: 'Rohausgabe unten prüfen und den Health Check später wiederholen.',
  nicht_unterstuetzt: 'Dieses Windows kennt ScanHealth nicht – nur SFC ist aussagekräftig.',
  laeuft_schon: 'Auf dem Server lief schon ein DISM – später erneut prüfen.',
}
export const SFC_WAS_TUN: Partial<Record<SfcStand, string>> = {
  ok: 'Nichts zu tun.',
  verletzungen: 'Ist DISM „gesund“: im Wartungsfenster von Hand sfc /scannow, danach neu starten. Ist DISM nicht gesund: zuerst DISM /RestoreHealth, dann sfc /scannow. Das Tool repariert nicht selbst.',
  neustart: 'Server im Wartungsfenster neu starten (eine Reparatur wartet darauf) und danach den Health Check wiederholen.',
  blockiert: 'Später wiederholen – meist arbeitet gerade Windows Update (TrustedInstaller) oder ein Neustart steht aus.',
  rechte: 'Das Konto des Tools hat in der Fernsitzung keine Administratorrechte auf diesem Server.',
  unklar: 'Rohausgabe unten prüfen und den Health Check später wiederholen.',
  laeuft_schon: 'Auf dem Server lief schon ein SFC – später erneut prüfen.',
  uebersprungen: 'Später erneut prüfen, wenn kein DISM mehr läuft.',
}
/** Echtes Ergebnis vom Server (sonst: nur ein gescheiterter Versuch, alter Stand bleibt). */
export const istEchtesErgebnis = (z: DismZustand) => z !== 'nicht_erreichbar' && z !== 'laeuft_schon'

export function kurzVon(e: DismErgebnis): DismKurz {
  return { am: e.am, zustand: e.zustand, text: e.text, dauerS: e.dauerS, sfc: e.sfc?.zustand, sfcText: e.sfc?.text }
}

// ── Bericht (Markdown für Menschen + KI, JSON strukturiert) ─────────────────
const pad = (n: number) => String(n).padStart(2, '0')
export function zeitText(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? iso : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function dauerText(s?: number): string {
  if (s === undefined || !Number.isFinite(s)) return '—'
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60), r = s % 60
  return m < 60 ? `${m} min ${pad(r)} s` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`
}
export function dateiStempel(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`
}
const code = (zeilen: string[]) => '```text\n' + (zeilen.length ? zeilen.join('\n').replace(/```/g, "'''") : '(keine)') + '\n```'
const ja = (b?: boolean) => b === undefined ? '—' : b ? 'ja' : 'nein'

export function zaehle(liste: DismErgebnis[]): Record<DismZustand, number> {
  const z = { gesund: 0, reparierbar: 0, nicht_reparierbar: 0, fehler: 0, nicht_erreichbar: 0, laeuft_schon: 0, nicht_unterstuetzt: 0, unklar: 0 } as Record<DismZustand, number>
  for (const e of liste) z[e.zustand]++
  return z
}

function serverAbschnitt(e: DismErgebnis, m?: DismMeta): string {
  const i = e.info || {}
  const os = [i.os, i.version && `${i.version}${i.ubr !== undefined ? '.' + i.ubr : ''}`].filter(Boolean).join(' · ')
  const z: string[] = []
  z.push(`<!-- BEGIN SERVER ${e.host} -->`)
  z.push(`## Server ${e.host}`)
  z.push('')
  if (m?.bezeichnung) z.push(`- Bezeichnung: ${m.bezeichnung}`)
  if (m?.anwendungen) z.push(`- Anwendungen: ${m.anwendungen}`)
  if (m?.ip) z.push(`- IP: ${m.ip}`)
  z.push(`- **Ergebnis: ${e.sfc ? healthGesamt({ zustand: e.zustand, sfc: e.sfc.zustand }).text : zustandText[e.zustand]}**`)
  z.push(`- DISM (Komponentenspeicher): ${zustandText[e.zustand]} – ${e.text}`)
  if (e.sfc) z.push(`- SFC (Systemdateien): ${sfcKurz[e.sfc.zustand]} – ${e.sfc.text}`)
  if (e.meldung) z.push(`- DISM-Meldung: \`${e.meldung}\``)
  if (e.sfc?.meldung) z.push(`- SFC-Meldung: \`${e.sfc.meldung.replace(/`/g, "'")}\``)
  if (e.exitCode !== undefined) z.push(`- Exit-Code: ${e.exitCode}`)
  if (e.fehlerCode) z.push(`- Fehlercode: ${e.fehlerCode}${e.fehlerText ? ` – ${e.fehlerText}` : ''}`)
  if (e.hinweis) z.push(`- Bedeutung: ${e.hinweis}`)
  if (e.gefunden !== undefined) z.push(`- Beschädigungen laut CBS.log: ${e.gefunden} gefunden, ${e.repariert ?? 0} repariert`)
  if (os) z.push(`- Betriebssystem: ${os}`)
  if (i.boot) z.push(`- Letzter Neustart: ${i.boot}`)
  if (i.freiGB !== undefined) z.push(`- Freier Speicher auf ${i.systemLw || 'dem Systemlaufwerk'} ${i.freiGB} GB von ${i.groesseGB ?? '?'} GB`)
  if (i.neustartAusstehend !== undefined) z.push(`- Neustart ausstehend: ${ja(i.neustartAusstehend)}`)
  if (i.tiWorker !== undefined) z.push(`- Windows-Update-Installer (TiWorker) lief: ${ja(i.tiWorker)}`)
  z.push(`- Geprüft: ${e.start ? `${zeitText(e.start)} – ` : ''}${zeitText(e.am)}${e.dauerS !== undefined ? ` (Dauer ${dauerText(e.dauerS)})` : ''} · von ${e.von}`)
  if (e.logHinweis) z.push(`- Hinweis: ${e.logHinweis}`)
  if (e.beschaedigt.length) {
    z.push('')
    z.push('### Beschädigte Komponenten')
    z.push('')
    z.push('| Art | Datei / Komponente |')
    z.push('|---|---|')
    for (const b of e.beschaedigt) z.push(`| ${b.art.replace(/\|/g, '/')} | ${b.datei.replace(/\|/g, '/') || '—'} |`)
  }
  if (e.sfc?.dateien.length) {
    z.push('')
    z.push('### Von SFC beanstandete Systemdateien')
    z.push('')
    for (const d of e.sfc.dateien) z.push(`- ${d}`)
  }
  if (e.zustand !== 'nicht_erreichbar' && e.zustand !== 'laeuft_schon') {
    z.push('')
    z.push('### DISM-Ausgabe')
    z.push(code(e.ausgabe))
    z.push('')
    z.push('### CBS.log – Prüfblock (Checking System Update Readiness)')
    z.push(code(e.cbsBlock))
    z.push('')
    z.push('### CBS.log – weitere auffällige Zeilen seit Scanbeginn')
    z.push(code(e.cbsZeilen))
    z.push('')
    z.push('### dism.log – Fehler und Warnungen seit Scanbeginn')
    z.push(code(e.dismLog))
    if (e.sfc) {
      z.push('')
      z.push('### SFC-Ausgabe (sfc /verifyonly)')
      z.push(code(e.sfc.ausgabe))
      z.push('')
      z.push('### CBS.log – SFC-Zeilen [SR] seit SFC-Start')
      z.push(code(e.sfc.srZeilen))
    }
  }
  z.push(`<!-- END SERVER ${e.host} -->`)
  return z.join('\n')
}

/** Bericht als Markdown: Übersicht + je Server ein klar abgegrenzter Abschnitt. */
export function berichtMarkdown(liste: DismErgebnis[], meta: Record<string, DismMeta>, o: { erstellt: Date; von: string; titel?: string }): string {
  const sortiert = [...liste].sort((a, b) => zustandRang[a.zustand] - zustandRang[b.zustand] || a.host.localeCompare(b.host))
  const n = zaehle(liste)
  const z: string[] = []
  const sfcVerletzt = liste.filter(e => e.sfc?.zustand === 'verletzungen').length
  z.push(`# ${o.titel || 'Health-Check-Bericht: Komponentenspeicher (DISM) + Systemdateien (SFC)'}`)
  z.push('')
  z.push(`- Erstellt: ${zeitText(o.erstellt.toISOString())} von ${o.von}`)
  z.push(`- Befehle je Server: \`${DISM_BEFEHL}\`, danach \`${SFC_BEFEHL}\` – nur Prüfung, es wurde nichts repariert oder geändert`)
  z.push(`- Server: ${liste.length} · DISM gesund ${n.gesund} · reparierbar ${n.reparierbar} · nicht reparierbar ${n.nicht_reparierbar} · Fehler ${n.fehler + n.unklar} · nicht erreichbar ${n.nicht_erreichbar}${n.laeuft_schon ? ` · DISM lief schon ${n.laeuft_schon}` : ''}${n.nicht_unterstuetzt ? ` · nicht unterstützt ${n.nicht_unterstuetzt}` : ''} · SFC mit Verletzungen ${sfcVerletzt}`)
  z.push('')
  z.push('> Aufbau für die Auswertung: Jeder Server steht in einem eigenen Abschnitt „## Server <Name>“, eingefasst von den')
  z.push('> HTML-Kommentaren BEGIN SERVER <Name> und END SERVER <Name>. DISM: **gesund** = keine Beschädigung;')
  z.push('> **reparierbar** = Beschädigung, behebbar mit `DISM /Online /Cleanup-Image /RestoreHealth`, danach `sfc /scannow`;')
  z.push('> **nicht reparierbar** = Komponentenspeicher defekt; **Fehler** = DISM brach ab (Fehlercode und Logzeilen beachten).')
  z.push('> SFC: **ok** = keine Integritätsverletzungen; **Verletzungen** = Systemdateien beschädigt (Liste aus den [SR]-Zeilen).')
  z.push('> Welche Komponenten betroffen sind, steht im CBS.log-Prüfblock (Zeilen mit „(p)“ / „Corrupt“).')
  z.push('')
  z.push('## Übersicht')
  z.push('')
  z.push('| Server | DISM | SFC | Details | Dauer | geprüft |')
  z.push('|---|---|---|---|---|---|')
  for (const e of sortiert) z.push(`| ${e.host} | ${zustandText[e.zustand]} | ${e.sfc ? sfcKurz[e.sfc.zustand] : '—'} | ${[e.text, e.sfc?.text].filter(Boolean).join(' · ').replace(/\|/g, '/')} | ${dauerText(e.dauerS)} | ${zeitText(e.am)} |`)
  for (const e of sortiert) { z.push(''); z.push('---'); z.push(''); z.push(serverAbschnitt(e, meta[key(e.host)])) }
  z.push('')
  return z.join('\n')
}

export function berichtJson(liste: DismErgebnis[], meta: Record<string, DismMeta>, o: { erstellt: Date; von: string }) {
  const sortiert = [...liste].sort((a, b) => zustandRang[a.zustand] - zustandRang[b.zustand] || a.host.localeCompare(b.host))
  return {
    art: 'health-check',
    erstellt: o.erstellt.toISOString(),
    von: o.von,
    befehl: DISM_BEFEHL,
    befehle: [DISM_BEFEHL, SFC_BEFEHL],
    nurPruefung: true,
    anzahl: liste.length,
    zusammenfassung: zaehle(liste),
    server: sortiert.map(e => ({ ...meta[key(e.host)], ...e })),
  }
}

// ── Abfrage + Ablage ────────────────────────────────────────────────────────
export async function ladeDism(h: string): Promise<DismDatei> {
  const d = await api().netReadJsonAsync<DismDatei>(standDatei(h)).catch(() => null)
  return { letzter: d?.letzter && d.letzter.host ? d.letzter : null, letzterVersuch: d?.letzterVersuch?.host ? d.letzterVersuch : undefined, verlauf: arr(d?.verlauf) }
}

/** Letzte Ergebnisse mehrerer Server (fehlende fallen weg). */
export async function ladeLetzte(hosts: string[]): Promise<DismErgebnis[]> {
  const aus: DismErgebnis[] = []
  for (let i = 0; i < hosts.length; i += 8) {
    const teil = await Promise.all(hosts.slice(i, i + 8).map(h => ladeDism(h).then(d => d.letzter).catch(() => null)))
    for (const e of teil) if (e) aus.push(e)
  }
  return aus
}

/** Kurzfassung in status.json ändern — immer im FRISCH geladenen Stand (andere Abläufe schreiben mit). */
async function aendereKurz(host: string, f: (alt?: DismKurz) => DismKurz | undefined): Promise<void> {
  await aktualisiereStatus(frisch => {
    const k = hostKey(host)
    const servers = { ...frisch.servers }
    const alt = servers[k] || { online: true, consecutiveFailures: 0 }
    servers[k] = { ...alt, dism: f(alt.dism) }
    return { ...frisch, servers }
  }).catch(() => false)
}

/** „läuft“ in status.json setzen (andere Admins sehen es an der Kachel); der letzte Stand bleibt. */
export async function markiereLaeuft(host: string, von: string): Promise<void> {
  await aendereKurz(host, alt => ({ ...(alt || { am: '', zustand: 'unklar', text: '' }), laeuft: { seit: new Date().toISOString(), von } }))
}
/** „läuft“ wieder wegnehmen, ohne neues Ergebnis (z. B. Lauf abgebrochen, bevor der Server dran war). */
export async function entferneLaeuft(host: string): Promise<void> {
  await aendereKurz(host, alt => (alt ? (alt.am ? { ...alt, laeuft: undefined } : undefined) : undefined))
}
export function laeuftNoch(k?: DismKurz, jetzt = Date.now()): boolean {
  if (!k?.laeuft) return false
  const t = new Date(k.laeuft.seit).getTime()
  return Number.isFinite(t) && jetzt - t < DISM_LAEUFT_MAX_MS
}

// ── Nur EIN Health Check gleichzeitig — über alle Admins (17.11.2026) ─────────
// Während eines Sammellaufs mit 3 Servern gleichzeitig dauerten die Dienst-Prüfungen der übrigen
// Server 35–65 % länger (Zugriffsprotokoll 17.11.). Deshalb: höchstens EIN Health Check (bzw. eine
// Tiefenprüfung V4 der Komplett-Diagnose) zur Zeit, egal von welchem PC. Sperre mit Lebenszeichen
// (alle 5 min); ohne Lebenszeichen seit 15 min gilt sie als verwaist (Tool abgestürzt/PC aus).
export const DISM_SPERRE_PFAD = `${DISM_ORDNER}/sperre.json`
export const DISM_SPERRE_LEBENSZEICHEN_MS = 5 * 60_000
export const DISM_SPERRE_VERWAIST_MS = 15 * 60_000
export interface DismSperre { token: string; host: string; von: string; rechner?: string; seit: string; at: string; art?: 'health' | 'komplett-diagnose' }

/** Frei = keine Sperre, verwaist oder meine eigene. */
export function dismSperreFrei(s: DismSperre | null | undefined, token: string, jetzt = Date.now()): boolean {
  if (!s?.token) return true
  if (s.token === token) return true
  const t = Date.parse(s.at || '')
  return isNaN(t) || jetzt - t >= DISM_SPERRE_VERWAIST_MS
}
export async function ladeDismSperre(): Promise<DismSperre | null> {
  try {
    const s = await api().netReadJsonAsync<DismSperre>(DISM_SPERRE_PFAD)
    return s && typeof s === 'object' && typeof s.token === 'string' && s.token ? s : null
  } catch { return null }
}
/**
 * Sperre holen: frei? → schreiben → kurz warten → gegenlesen (zwei PCs gleichzeitig: nur einer gewinnt).
 * `belegt` = wer sie gerade hat (für „wartet – Health Check läuft gerade auf …“).
 */
export async function holeDismSperre(token: string, host: string, von: string, o: { art?: DismSperre['art']; rechner?: string; warte?: (ms: number) => Promise<void> } = {}): Promise<{ ok: boolean; belegt?: DismSperre }> {
  const alt = await ladeDismSperre()
  if (!dismSperreFrei(alt, token)) return { ok: false, belegt: alt! }
  const jetzt = new Date().toISOString()
  const neu: DismSperre = { token, host, von, rechner: o.rechner, seit: jetzt, at: jetzt, art: o.art || 'health' }
  try { await api().netWriteJsonAsync(DISM_SPERRE_PFAD, neu) } catch { return { ok: false } }
  await (o.warte || (ms => new Promise<void>(r => setTimeout(r, ms))))(1500 + Math.floor(Math.random() * 1500))
  const da = await ladeDismSperre()
  if (da?.token === token) return { ok: true }
  return { ok: false, belegt: da || undefined }
}
/** Lebenszeichen (nur wenn es noch meine Sperre ist). */
export async function erneuereDismSperre(token: string): Promise<void> {
  const s = await ladeDismSperre()
  if (s?.token !== token) return
  try { await api().netWriteJsonAsync(DISM_SPERRE_PFAD, { ...s, at: new Date().toISOString() }) } catch { /* nächstes Lebenszeichen */ }
}
/** Freigeben (nur die eigene). */
export async function gibDismSperreFrei(token: string): Promise<void> {
  const s = await ladeDismSperre()
  if (s?.token !== token) return
  try { await api().netWriteJsonAsync(DISM_SPERRE_PFAD, { token: '', host: '', von: '', seit: s.seit, at: new Date().toISOString(), frei: true }) } catch { /* verwaist dann von selbst */ }
}
/**
 * Mit der Sperre etwas ausführen (für die Tiefenprüfung V4): wartet höchstens `maxWarteMs`
 * auf eine freie Sperre (alle 60 s neu nachsehen), sonst `null`.
 */
export async function mitDismSperre<T>(host: string, von: string, art: DismSperre['art'], fn: () => Promise<T>, o: { maxWarteMs?: number; beimWarten?: (belegt?: DismSperre) => void; warte?: (ms: number) => Promise<void> } = {}): Promise<T | null> {
  const token = `${art || 'health'}#${Math.random().toString(36).slice(2, 10)}`
  const warte = o.warte || (ms => new Promise<void>(r => setTimeout(r, ms)))
  const ende = Date.now() + (o.maxWarteMs ?? 30 * 60_000)
  for (;;) {
    const r = await holeDismSperre(token, host, von, { art, warte })
    if (r.ok) break
    if (Date.now() >= ende) return null
    o.beimWarten?.(r.belegt)
    await warte(60_000)
  }
  const herz = setInterval(() => { void erneuereDismSperre(token) }, DISM_SPERRE_LEBENSZEICHEN_MS)
  try { return await fn() } finally { clearInterval(herz); await gibDismSperreFrei(token) }
}

/** EINEN Server prüfen: Health Check (DISM ScanHealth + sfc /verifyonly) per WinRM, Ergebnis speichern (Datei + Kachel). */
export async function scanneServer(host: string, von: string): Promise<DismErgebnis> {
  const TAG = '@@SRVDISM@@'
  const r = await api().runPowerShell(fern(host, HEALTH_INNER, TAG), DISM_TIMEOUT_MS, { quelle: 'Health Check (DISM + SFC, nur Prüfung)', art: 'lesen' })
  const d = lies<Record<string, unknown>>(r.stdout, TAG)
  let e: DismErgebnis
  if (d && d.ok !== false) e = healthAusRoh(host, d, von)
  else {
    const grund = d?.fehler ? kurzFehler(String(d.fehler))
      : r.timedOut ? `Zeitüberschreitung nach ${Math.round(DISM_TIMEOUT_MS / 60000)} min (DISM läuft auf dem Server evtl. weiter)`
      : kurzFehler(r.stderr) || 'keine Antwort per WinRM'
    e = dismNichtErreichbar(host, grund, von)
  }
  await speichereDismErgebnis(host, e, von)
  return e
}

/** Ergebnis ablegen (Datei je Server + Kurzfassung für die Kachel) — auch für die Tiefenprüfung der Volldiagnose. */
export async function speichereDismErgebnis(host: string, e: DismErgebnis, von: string): Promise<void> {
  const alt = await ladeDism(host)
  const verlauf = [{ am: e.am, zustand: e.zustand, dauerS: e.dauerS, von, sfc: e.sfc?.zustand }, ...alt.verlauf].slice(0, 30)
  const echt = istEchtesErgebnis(e.zustand)
  const datei: DismDatei = echt ? { letzter: e, verlauf } : { letzter: alt.letzter, letzterVersuch: e, verlauf }
  await api().netWriteJsonAsync(standDatei(host), datei).catch(() => false)
  await aendereKurz(host, k => echt ? kurzVon(e)
    : { ...(k?.am ? k : { am: '', zustand: e.zustand, text: e.text }), laeuft: undefined, versuch: { am: e.am, zustand: e.zustand, text: e.text } })
}

/** Bericht auf dem Netzlaufwerk ablegen (.md + .json mit gleichem Namen). */
export async function speichereBericht(liste: DismErgebnis[], meta: Record<string, DismMeta>, von: string, name: string): Promise<{ md: string; json: unknown; rel: string; ok: boolean }> {
  const erstellt = new Date()
  const md = berichtMarkdown(liste, meta, { erstellt, von })
  const json = berichtJson(liste, meta, { erstellt, von })
  const basis = `${DISM_BERICHTE}/HealthCheck_${dateiStempel(erstellt)}_${name.replace(/[^A-Za-z0-9_-]+/g, '-')}`
  const okMd = await api().netWriteRawFile(`${basis}.md`, b64(md)).catch(() => false)
  const okJson = await api().netWriteJsonAsync(`${basis}.json`, json).catch(() => false)
  return { md, json, rel: `${basis}.md`, ok: !!okMd && !!okJson }
}

/** Bericht lokal speichern („Speichern unter“): .md und daneben .json. */
export async function speichereBerichtUnter(md: string, json: unknown, vorschlag: string): Promise<string | null> {
  const ziel = await api().saveFileDialog(vorschlag, [{ name: 'Markdown-Bericht', extensions: ['md'] }])
  if (!ziel) return null
  const pfadMd = /\.md$/i.test(ziel) ? ziel : `${ziel}.md`
  const r1 = await api().writeFile(pfadMd, b64(md))
  if (!r1.success) throw new Error(r1.error || 'Speichern fehlgeschlagen')
  const r2 = await api().writeFile(pfadMd.replace(/\.md$/i, '.json'), b64(JSON.stringify(json, null, 2)))
  if (!r2.success) throw new Error(r2.error || 'JSON konnte nicht gespeichert werden')
  return pfadMd
}

export async function oeffneBerichtOrdner(): Promise<void> {
  const basis = (await api().netGetBasePath()).replace(/[\\/]+$/, '')
  await api().openPath(`${basis}\\${DISM_BERICHTE.replace(/\//g, '\\')}`)
}
