// ── Back-Up-Engine: robocopy-Lauf, Erreichbarkeit, Ordner-Browser, PC-Aufgaben ──
// Ein Lauf wird IMMER von demselben PowerShell-Baustein (BACKUP_PS) ausgeführt —
// egal ob auf dem Admin-PC (Tool-Job, „Jetzt ausführen") oder als geplante Aufgabe
// direkt auf dem PC (lokales Ziel). Der Baustein:
//   - kopiert je Quell-Ordner mit robocopy (nur kopierend; /MIR nur wenn gewählt, nie /MOV),
//   - schreibt alle 2,5 s eine status.json (Phase, Ordner, Fortschritt) — darüber erkennt
//     das Tool auch, wenn der Prozess abgestürzt ist oder der PC neu gestartet wurde,
//   - wertet am Ende das robocopy-Protokoll aus (Zahlen + Fehlerzeilen mit Win32-Code)
//     und schreibt eine ergebnis.json. Daraus entsteht der Bericht (backupBericht.ts),
//     der den GRUND eines Fehlers auf der Karte zeigt.
//   - bricht ab, sobald eine Datei abbrechen.flag im Lauf-Ordner liegt.
// Ablageorte:
//   Admin-PC:  %LOCALAPPDATA%\ITAdminTool\Backups\<JobId>\
//   PC-Aufgabe: C:\ProgramData\ITAdminTool\Backups\<Aufgabe>\  (lesbar über \\PC\C$)

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { ensureWinRmTrustedHost, isIpv4 } from '../utils/remoteTarget'
import { ROBOCOPY_PS } from '../utils/robocopy'
import type { BackupJob } from './backups'
import { normalisiereErgebnis, type LaufErgebnis } from './backupBericht'

// ── Pfad-Helfer ───────────────────────────────────────────────────────────────

/** Einfache Anfuehrungszeichen fuer PowerShell-Single-Quote-Strings escapen. */
function q(s: string): string { return (s ?? '').replace(/'/g, "''") }
function b64(s: string): string { return btoa(unescape(encodeURIComponent(s))) }

/** Gültiger Rechnername (NetBIOS/DNS) oder IPv4 — auch Server wie „w3172". */
export function isHostOderIp(s: string): boolean {
  const t = (s ?? '').trim()
  if (!t) return false
  if (isIpv4(t)) return true
  return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,62})(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}))*$/.test(t) && !/^\d+$/.test(t)
}

/** Absoluter lokaler Laufwerkspfad (C:\x\y)? */
export function isAbsoluteLocalPath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test((p ?? '').trim())
}

/** Laufwerks-Wurzel (C:\ bzw. C:)? Als Quelle nicht erlaubt (ganzes Laufwerk). */
export function isLaufwerksWurzel(p: string): boolean {
  return /^[A-Za-z]:[\\/]*$/.test((p ?? '').trim())
}

/**
 * Vollstaendiger lokaler Pfad (C:\x\y) → UNC-Admin-Share (\\target\C$\x\y).
 * WICHTIG: Gibt bei einem UNGUELTIGEN (nicht absoluten) Pfad einen LEEREN String
 * zurueck — niemals den Pfad unveraendert. Sonst wuerde robocopy einen relativen
 * Pfad ins Arbeitsverzeichnis der App schreiben (fataler Bug).
 */
export function localToUnc(target: string, localPath: string): string {
  const t = (target ?? '').trim()
  const m = /^([A-Za-z]):[\\/]?(.*)$/.exec((localPath ?? '').trim())
  if (!t || !m) return ''
  const drive = m[1].toUpperCase()
  const rest = m[2].replace(/\//g, '\\')
  return `\\\\${t}\\${drive}$\\${rest}`.replace(/\\+$/, '')
}

/** Laufwerksbuchstabe + Pfad zu vollem lokalen Pfad ('C', 'Backups\\x' → 'C:\\Backups\\x'). */
export function driveLocal(drive: string, sub: string): string {
  const d = (drive || 'C').replace(/[:$\\]/g, '').toUpperCase().slice(0, 1) || 'C'
  const s = (sub ?? '').replace(/^[\\/]+/, '')
  return s ? `${d}:\\${s}` : `${d}:\\`
}

/** Letzter Pfadbestandteil (Ordnername). */
function leafName(p: string): string {
  const parts = (p ?? '').replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || 'Ordner'
}

/** Ziel-Basis als vollstaendiger lokaler Pfad auf dem Ziel-PC. */
export function destBaseLocal(job: BackupJob): string {
  return job.dest.path || driveLocal(job.dest.drive, '')
}
/** Ziel-PC (bei lokalem Ziel = Quell-PC). */
export function destTargetOf(job: BackupJob): string {
  return job.dest.kind === 'network' ? (job.dest.target || '') : job.source.target
}

function normPathLower(p: string): string {
  return (p ?? '').trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}
/** Ist `child` gleich `parent` oder liegt darunter? */
function isUnderOrEqual(child: string, parent: string): boolean {
  const c = normPathLower(child), p = normPathLower(parent)
  if (!c || !p) return false
  return c === p || c.startsWith(p + '\\')
}
/**
 * Schutz: Quelle und Ziel duerfen sich auf DEMSELBEN PC nicht ueberschneiden.
 * Sonst koennte robocopy (v. a. mit /MIR) in ein Quell-Verzeichnis hineinschreiben
 * bzw. eine Schleife erzeugen. Bei getrennten PCs unmoeglich → kein Block.
 */
export function overlapError(job: BackupJob): string | null {
  const sameMachine = job.dest.kind === 'local'
    || (!!job.dest.target && normPathLower(job.dest.target) === normPathLower(job.source.target))
  if (!sameMachine) return null
  const dest = destBaseLocal(job)
  for (const sf of job.source.folders) {
    if (isUnderOrEqual(dest, sf) || isUnderOrEqual(sf, dest)) {
      return `Quelle und Ziel überschneiden sich (${sf} ↔ ${dest}). Bitte ein Ziel außerhalb der Quell-Ordner wählen.`
    }
  }
  return null
}

/**
 * Zielordner je Quell-Ordner: Ziel-Basis + Ordnername. Gleich heißende Ordner
 * bekommen den Laufwerksbuchstaben vorangestellt (wie bisher, damit bestehende
 * Sicherungen weiter in denselben Ordner laufen), weitere Dubletten eine Nummer.
 */
export function zielOrdner(job: BackupJob): { quelle: string; ziel: string }[] {
  const base = destBaseLocal(job).replace(/[\\/]+$/, '')
  const used = new Set<string>()
  const out: { quelle: string; ziel: string }[] = []
  for (const folder of job.source.folders) {
    let leaf = leafName(folder)
    if (used.has(leaf.toLowerCase())) leaf = `${folder.slice(0, 1).toUpperCase()}_${leaf}`
    let kandidat = leaf, nr = 2
    while (used.has(kandidat.toLowerCase())) kandidat = `${leaf}_${nr++}`
    used.add(kandidat.toLowerCase())
    out.push({ quelle: folder, ziel: `${base}\\${kandidat}` })
  }
  return out
}

/** Prüft einen Job vor dem Lauf/Einrichten. Liefert die erste verständliche Beanstandung. */
export function jobFehler(job: BackupJob): string | null {
  if (!job.source.target?.trim()) return 'Kein Quell-PC angegeben.'
  if (!job.source.folders.length) return 'Keine Quell-Ordner ausgewählt.'
  const bad = job.source.folders.find(f => !isAbsoluteLocalPath(f))
  if (bad) return `Ungültiger Quell-Ordner (voller Pfad mit Laufwerk nötig): ${bad}`
  const wurzel = job.source.folders.find(isLaufwerksWurzel)
  if (wurzel) return `Ein ganzes Laufwerk (${wurzel}) kann nicht als Quelle gesichert werden — bitte Ordner auswählen.`
  const destTarget = destTargetOf(job)
  if (!destTarget?.trim()) return job.dest.kind === 'network' ? 'Kein Ziel-PC angegeben.' : 'Kein Quell-PC angegeben.'
  if (!isAbsoluteLocalPath(destBaseLocal(job))) return 'Ungültiger Zielordner — bitte einen vollständigen Pfad mit Laufwerk angeben (z. B. D:\\Backups\\PC01).'
  if (!localToUnc(destTarget, destBaseLocal(job)).startsWith('\\\\')) return 'Zielpfad konnte nicht als Netzwerkpfad aufgelöst werden.'
  return overlapError(job)
}

/**
 * Robocopy-Schalter — AUSSCHLIESSLICH kopierend.
 * Die QUELLE wird nur gelesen und NIE veraendert: es gibt bewusst KEIN /MOV
 * bzw. /MOVE (das wuerde Quelldateien nach dem Kopieren loeschen). /MIR (Spiegeln)
 * loescht ggf. nur im ZIEL nicht mehr vorhandene Dateien — niemals in der Quelle.
 * /XJ = Junctions/Symlinks NICHT verfolgen (verhindert Endlosschleifen).
 * Protokoll-Schalter (/UNILOG, /NP …) setzt der Baustein selbst.
 */
export function roboSchalter(job: BackupJob): string[] {
  const base = ['/FFT', '/XA:H', '/XJ', '/W:5', '/R:2', '/Z', '/MT:8']
  const flags = job.mirror ? ['/MIR', ...base] : ['/E', ...base]
  return flags.filter(f => !/^\/(MOV|MOVE)$/i.test(f))
}

// ── PowerShell-Baustein für einen Lauf ────────────────────────────────────────
// Bewusst ohne Umlaute (Skriptdatei wird zwar mit BOM geschrieben, aber sicher ist sicher)
// und ohne Backticks (String.raw).

export const BACKUP_PS = ROBOCOPY_PS + '\n' + String.raw`
$TAB = [string][char]9
function Save-SkfJson([string]$pfad, $obj) {
  $json = ConvertTo-Json -InputObject $obj -Depth 8 -Compress
  $enc = New-Object System.Text.UTF8Encoding($false)
  try {
    $tmp = $pfad + '.tmp'
    [System.IO.File]::WriteAllText($tmp, $json, $enc)
    if (Test-Path -LiteralPath $pfad) { [System.IO.File]::Replace($tmp, $pfad, $null) } else { [System.IO.File]::Move($tmp, $pfad) }
  } catch { try { [System.IO.File]::WriteAllText($pfad, $json, $enc) } catch { } }
}
function ConvertTo-SkfArg([string]$s) {
  $s = $s -replace '\\+$', ''
  if ($s -match '^[A-Za-z]:$') { $s = $s + '\.' }
  return '"' + $s + '"'
}
# robocopy als Prozess starten, waehrenddessen Fortschritt zaehlen + Abbruch pruefen
function Invoke-SkfRobo([string]$exe, [string]$quelle, [string]$ziel, [string[]]$schalter, [string]$log, $st, [string]$statusPfad, [string]$abbruchPfad) {
  $argStr = (ConvertTo-SkfArg $quelle) + ' ' + (ConvertTo-SkfArg $ziel) + ' ' + ($schalter -join ' ') + ' ' + (ConvertTo-SkfArg ('/UNILOG:' + $log))
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $exe; $psi.Arguments = $argStr; $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $outT = $p.StandardOutput.ReadToEndAsync(); $errT = $p.StandardError.ReadToEndAsync()
  $leser = $null; $zeilen = 0; $abgebrochen = $false
  while (-not $p.WaitForExit(2500)) {
    if ($abbruchPfad -and (Test-Path -LiteralPath $abbruchPfad)) { try { $p.Kill() } catch { }; $abgebrochen = $true; break }
    if (-not $leser -and (Test-Path -LiteralPath $log)) {
      try {
        $fs = New-Object System.IO.FileStream($log, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $leser = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::Unicode, $true)
      } catch { $leser = $null }
    }
    if ($leser) { try { while ($null -ne ($z = $leser.ReadLine())) { if ($z.StartsWith($TAB) -and $z.Contains('\')) { $zeilen++ } } } catch { } }
    $st.aktuell = $st.basisKopiert + $zeilen
    $st.aktualisiert = (Get-Date).ToString('o')
    Save-SkfJson $statusPfad $st
  }
  try { [void]$p.WaitForExit(15000) } catch { }
  if ($leser) { try { $leser.Close() } catch { } }
  $rc = 16; try { $rc = [int]$p.ExitCode } catch { }
  $aus = ''; try { $aus = [string]$outT.Result + [string]$errT.Result } catch { }
  return @{ rc = $rc; aus = $aus; abgebrochen = $abgebrochen; zeilen = $zeilen }
}
# robocopy-Protokoll auswerten: Zusammenfassung (Dateien/Bytes) + Fehlerzeilen mit Code
function Read-SkfRoboLog([string]$log, [string]$aus) {
  $r = @{ dateien = $null; bytes = $null; fehler = (New-Object System.Collections.ArrayList); fehlerAnzahl = 0; allgemein = (New-Object System.Collections.ArrayList) }
  $zeilen = @()
  if ($log -and (Test-Path -LiteralPath $log)) { try { $zeilen = [System.IO.File]::ReadAllLines($log) } catch { } }
  if ($aus) { $zeilen = @($zeilen) + @($aus -split '\r?\n') }
  $summen = New-Object System.Collections.ArrayList
  $gesehen = @{}
  $allg = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt $zeilen.Count; $i++) {
    $z = [string]$zeilen[$i]
    $m = [regex]::Match($z, '^\s*[^\d\s:][^:]*:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$')
    if ($m.Success) {
      [void]$summen.Add(@([int64]$m.Groups[1].Value, [int64]$m.Groups[2].Value, [int64]$m.Groups[3].Value, [int64]$m.Groups[4].Value, [int64]$m.Groups[5].Value, [int64]$m.Groups[6].Value))
      continue
    }
    $m = [regex]::Match($z, '\s(\d{1,5})\s+\(0x[0-9A-Fa-f]{8}\)\s*(.*)$')
    if ($m.Success) {
      $rest = $m.Groups[2].Value.Trim()
      $key = $m.Groups[1].Value + '|' + $rest
      if (-not $gesehen.ContainsKey($key)) {
        $gesehen[$key] = $true
        $r.fehlerAnzahl++
        if ($r.fehler.Count -lt 40) {
          $pfad = ''; $aktion = $rest
          $pm = [regex]::Match($rest, '(\\\\.+|[A-Za-z]:\\.*)$')
          if ($pm.Success) { $pfad = $pm.Groups[1].Value.Trim(); $aktion = $rest.Substring(0, $pm.Index).Trim() }
          $text = ''
          if ($i + 1 -lt $zeilen.Count) { $text = ([string]$zeilen[$i + 1]).Trim() }
          [void]$r.fehler.Add(@{ code = [int]$m.Groups[1].Value; aktion = $aktion; pfad = $pfad; text = $text })
        }
      }
      continue
    }
    $m = [regex]::Match($z, '^\s*(\*+\s*)?(ERROR|FEHLER|ERREUR|ERRORE)\s*:\s*(.+)$', 'IgnoreCase')
    if ($m.Success -and $allg.Count -lt 5) { [void]$allg.Add($m.Groups[3].Value.Trim()) }
  }
  if ($r.fehler.Count -eq 0) { foreach ($a in $allg) { [void]$r.allgemein.Add($a) } }
  if ($summen.Count -ge 2) { $r.dateien = $summen[1] }
  if ($summen.Count -ge 3) { $r.bytes = $summen[2] }
  return $r
}
function Invoke-SkfBackup($P) {
  try { Set-Location -LiteralPath $env:TEMP } catch { }
  $basis = [string]$P.basis
  if (-not $basis) { $basis = Join-Path $env:LOCALAPPDATA ('ITAdminTool\Backups\' + $P.jobId) }
  $runId = [string]$P.runId
  if (-not $runId) { $runId = (Get-Date).ToString('yyyyMMdd-HHmmss') + '-' + ('{0:x4}' -f (Get-Random -Maximum 65535)) }
  $statusPfad = Join-Path $basis 'status.json'
  $ergebnisPfad = Join-Path $basis 'ergebnis.json'
  $abbruchPfad = Join-Path $basis 'abbrechen.flag'
  $logDir = Join-Path $basis ('logs\' + $runId)
  try { New-Item -ItemType Directory -Force -Path $logDir -EA Stop | Out-Null } catch { }

  # Doppelstart verhindern: laeuft fuer diesen Job schon ein Lauf (Status juenger als 90 s)?
  if (Test-Path -LiteralPath $statusPfad) {
    try {
      $alt = Get-Content -LiteralPath $statusPfad -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($alt.phase -ne 'fertig' -and [string]$alt.runId -ne $runId -and $alt.aktualisiert) {
        $alter = ((Get-Date) - [datetime]::Parse([string]$alt.aktualisiert)).TotalSeconds
        if ($alter -lt 90) { return 3 }
      }
    } catch { }
  }
  Remove-Item -LiteralPath $abbruchPfad -Force -EA SilentlyContinue

  $ordner = @($P.ordner)
  $jetzt = (Get-Date).ToString('o')
  $st = @{ runId = $runId; phase = 'start'; ordnerNr = 0; ordnerAnzahl = $ordner.Count; erwartet = 0; erwartetBytes = 0; basisKopiert = 0; aktuell = 0; start = $jetzt; aktualisiert = $jetzt; rechner = $env:COMPUTERNAME; von = [string]$P.von }
  Save-SkfJson $statusPfad $st
  $res = @{ runId = $runId; rechner = $env:COMPUTERNAME; benutzer = $env:USERNAME; start = $jetzt; ende = $null; rcMax = 0; abgebrochen = $false; ordner = (New-Object System.Collections.ArrayList) }

  $exe = Get-SkfRobocopy
  $schalter = @($P.schalter | ForEach-Object { [string]$_ })
  if (-not $exe) { $res.fehler = 'robocopy.exe wurde auf dem ausfuehrenden PC nicht gefunden.'; $res.rcMax = 16 }
  else {
    try { if (-not (Test-Path -LiteralPath ([string]$P.zielBasis))) { New-Item -ItemType Directory -Force -Path ([string]$P.zielBasis) -EA Stop | Out-Null } } catch { $res.zielFehler = $_.Exception.Message }

    # Vorlauf (/L, kopiert nichts): wie viele Dateien sind zu kopieren? Nur fuer den Fortschritt.
    if ($P.vorlauf) {
      $st.phase = 'pruefen'
      $i = 0
      foreach ($o in $ordner) {
        $i++; $st.ordnerNr = $i; Save-SkfJson $statusPfad $st
        if (Test-Path -LiteralPath $abbruchPfad) { break }
        try {
          $vlog = Join-Path $logDir ('vorlauf_' + $i + '.log')
          [void](Invoke-SkfRobo $exe ([string]$o.q) ([string]$o.z) ($schalter + @('/L', '/NFL', '/NDL', '/NP', '/BYTES', '/NJH')) $vlog $st $statusPfad $abbruchPfad)
          $s = Read-SkfRoboLog $vlog ''
          if ($s.dateien) { $st.erwartet += $s.dateien[1] }
          if ($s.bytes) { $st.erwartetBytes += $s.bytes[1] }
        } catch { }
      }
    }

    $st.phase = 'kopieren'; $st.basisKopiert = 0
    $i = 0
    foreach ($o in $ordner) {
      $i++
      $e = @{ quelle = [string]$o.q; ziel = [string]$o.z; rc = $null; dateien = $null; bytes = $null; fehler = @(); fehlerAnzahl = 0; allgemein = @(); hinweis = ''; log = '' }
      if (Test-Path -LiteralPath $abbruchPfad) { $res.abgebrochen = $true; [void]$res.ordner.Add($e); continue }
      try {
        $log = Join-Path $logDir ('ordner_' + $i + '.log'); $e.log = $log
        $st.ordnerNr = $i; Save-SkfJson $statusPfad $st
        $l = Invoke-SkfRobo $exe ([string]$o.q) ([string]$o.z) ($schalter + @('/NP', '/NDL', '/FP', '/BYTES')) $log $st $statusPfad $abbruchPfad
        $e.rc = $l.rc
        if ($l.abgebrochen) { $res.abgebrochen = $true }
        $s = Read-SkfRoboLog $log $l.aus
        $e.dateien = $s.dateien; $e.bytes = $s.bytes; $e.fehler = @($s.fehler); $e.fehlerAnzahl = $s.fehlerAnzahl; $e.allgemein = @($s.allgemein)
        if ($s.dateien) { $st.basisKopiert += $s.dateien[1] } else { $st.basisKopiert += $l.zeilen }
      } catch { $e.hinweis = $_.Exception.Message; if ($null -eq $e.rc) { $e.rc = 16 } }
      if ($null -ne $e.rc -and $e.rc -gt $res.rcMax) { $res.rcMax = $e.rc }
      [void]$res.ordner.Add($e)
    }
  }
  if ($res.zielFehler -and $res.rcMax -lt 8) { $res.Remove('zielFehler') }
  if ($res.abgebrochen) { $res.abgebrochenVon = [string](Get-Content -LiteralPath $abbruchPfad -Raw -EA SilentlyContinue) }
  $res.ende = (Get-Date).ToString('o')
  Save-SkfJson $ergebnisPfad $res
  Save-SkfJson (Join-Path $logDir 'ergebnis.json') $res
  $st.phase = 'fertig'; $st.aktualisiert = $res.ende; $st.aktuell = $st.basisKopiert
  Save-SkfJson $statusPfad $st
  Remove-Item -LiteralPath $abbruchPfad -Force -EA SilentlyContinue
  # Alte Protokolle aufraeumen: die letzten 15 Laeufe bleiben
  try { Get-ChildItem -LiteralPath (Join-Path $basis 'logs') -Directory -EA Stop | Sort-Object Name -Descending | Select-Object -Skip 15 | Remove-Item -Recurse -Force -EA SilentlyContinue } catch { }
  if ($res.rcMax -ge 8 -or $res.fehler -or $res.abgebrochen) { return 1 }
  return 0
}
`

export interface LaufParameter {
  jobId: string
  runId?: string          // leer = Baustein vergibt (PC-Aufgabe)
  basis?: string          // leer = %LOCALAPPDATA%\ITAdminTool\Backups\<jobId>
  ordner: { q: string; z: string }[]
  schalter: string[]
  zielBasis: string
  vorlauf: boolean
  von?: string
}

/** Komplettes Lauf-Skript: Baustein + Parameter (Base64-JSON, dadurch ohne Escaping-Fallen). */
export function baueLaufSkript(p: LaufParameter): string {
  return BACKUP_PS + '\n' + [
    `$P = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(JSON.stringify(p))}')) | ConvertFrom-Json`,
    `$rcSkf = Invoke-SkfBackup $P`,
    `exit $rcSkf`,
  ].join('\n')
}

/** Lauf-Parameter für den Admin-PC (UNC-Quelle → UNC-Ziel). */
export function adminLaufParameter(job: BackupJob, runId: string, von: string): LaufParameter {
  const destTarget = destTargetOf(job)
  return {
    jobId: job.id, runId, von,
    ordner: zielOrdner(job).map(o => ({ q: localToUnc(job.source.target, o.quelle), z: localToUnc(destTarget, o.ziel) })).filter(o => o.q && o.z),
    schalter: roboSchalter(job),
    zielBasis: localToUnc(destTarget, destBaseLocal(job)),
    vorlauf: true,
  }
}

// ── Erreichbarkeit (schnell: DNS + Port 445 mit 2 s, dann Admin-Freigabe) ──────

const ERREICHBAR_PS = String.raw`
function Test-SkfPort([string]$h, [int]$port, [int]$ms) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $a = $c.BeginConnect($h, $port, $null, $null); if ($a.AsyncWaitHandle.WaitOne($ms) -and $c.Connected) { $c.EndConnect($a); return $true }; return $false } catch { return $false } finally { $c.Close() }
}
function Test-SkfHost([string]$h, [string[]]$laufwerke) {
  $r = @{ host = $h; dns = $true; smb = $false; ping = $null; freigaben = @{} }
  if ($h -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { try { [void][System.Net.Dns]::GetHostAddresses($h) } catch { $r.dns = $false; return $r } }
  $r.smb = Test-SkfPort $h 445 2500
  if (-not $r.smb) { try { $r.ping = [bool](Test-Connection -ComputerName $h -Count 1 -Quiet -EA Stop) } catch { $r.ping = $false }; return $r }
  foreach ($lw in $laufwerke) { $p = '\\' + $h + '\' + $lw + '$'; $ok = $false; try { $ok = [System.IO.Directory]::Exists($p) } catch { }; $r.freigaben[$lw] = $ok }
  return $r
}
`

export interface HostStand { host: string; dns: boolean; smb: boolean; ping: boolean | null; freigaben: Record<string, boolean> }

/** Verständliche Meldung zu einem Host-Stand (null = alles in Ordnung). */
export function hostProblem(h: HostStand, laufwerke: string[], rolle: 'Quell-PC' | 'Ziel-PC' | 'PC'): { titel: string; hilfe: string } | null {
  if (!h.dns) return { titel: `${rolle} „${h.host}" ist im Netz unbekannt`, hilfe: 'Der Name ist im DNS nicht bekannt — Schreibweise prüfen oder die IP-Adresse verwenden.' }
  if (!h.smb) {
    return h.ping
      ? { titel: `${rolle} ${h.host} antwortet, aber die Dateifreigabe ist gesperrt`, hilfe: 'Der PC ist an, aber Port 445 (Datei- und Druckerfreigabe) ist durch die Firewall gesperrt.' }
      : { titel: `${rolle} ${h.host} ist nicht erreichbar`, hilfe: 'Der PC ist ausgeschaltet, im Standby oder nicht im Firmennetz/VPN.' }
  }
  const fehlt = laufwerke.filter(l => h.freigaben[l] === false)
  if (fehlt.length) return { titel: `Admin-Freigabe ${fehlt.map(l => `\\\\${h.host}\\${l}$`).join(', ')} nicht erreichbar`, hilfe: 'Das Laufwerk gibt es auf dem PC nicht, oder das angemeldete Konto hat dort keine Admin-Rechte.' }
  return null
}

function laufwerkVon(p: string): string { return (p.trim()[0] || 'C').toUpperCase() }

/** Prüft Quell- und Ziel-PC eines Jobs. Liefert die erste Beanstandung oder null. */
export async function pruefeErreichbar(job: BackupJob): Promise<{ titel: string; hilfe: string } | null> {
  const src = job.source.target.trim()
  const dst = destTargetOf(job).trim()
  const srcLw = [...new Set(job.source.folders.map(laufwerkVon))]
  const dstLw = [laufwerkVon(destBaseLocal(job))]
  const gleich = src.toLowerCase() === dst.toLowerCase()
  const ziele: [string, string[]][] = gleich ? [[src, [...new Set([...srcLw, ...dstLw])]]] : [[src, srcLw], [dst, dstLw]]
  const script = ERREICHBAR_PS + '\n' + `$o = @(${ziele.map(([h, lw]) => `(Test-SkfHost '${q(h)}' @(${lw.map(l => `'${l}'`).join(',')}))`).join(', ')})\nConvertTo-Json -InputObject $o -Depth 4 -Compress`
  try {
    const r = await api().runPowerShell(script, 45000)
    const m = r.stdout.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
    if (!m) return null   // Prüfung selbst fehlgeschlagen → Lauf trotzdem versuchen (robocopy meldet den Grund)
    const arr = ([] as HostStand[]).concat(JSON.parse(m[0]))
    for (let i = 0; i < arr.length; i++) {
      const [, lw] = ziele[i]
      const rolle = gleich ? 'PC' : i === 0 ? 'Quell-PC' : 'Ziel-PC'
      const p = hostProblem({ ...arr[i], freigaben: arr[i].freigaben ?? {} }, lw, rolle)
      if (p) return p
    }
    return null
  } catch { return null }
}

export interface PruefPunkt { ok: boolean | null; titel: string; detail?: string }

/** Ausführliche Prüfung im Editor („Verbindung prüfen") — liest nur; schreibt im Ziel
 *  höchstens eine leere Testdatei und löscht sie sofort wieder. */
export async function pruefeEinrichtung(job: BackupJob): Promise<PruefPunkt[]> {
  const punkte: PruefPunkt[] = []
  const f = jobFehler(job)
  if (f) return [{ ok: false, titel: f }]
  const src = job.source.target.trim(), dst = destTargetOf(job).trim()
  const gleich = src.toLowerCase() === dst.toLowerCase()
  const zielBasisUnc = localToUnc(dst, destBaseLocal(job))
  const quellen = job.source.folders.map(o => ({ lokal: o, unc: localToUnc(src, o) }))
  const lwSrc = [...new Set(job.source.folders.map(laufwerkVon))]
  const lwDst = laufwerkVon(destBaseLocal(job))
  const script = ERREICHBAR_PS + '\n' + [
    `$o = @{}`,
    `$o.src = Test-SkfHost '${q(src)}' @(${[...new Set([...lwSrc, ...(gleich ? [lwDst] : [])])].map(l => `'${l}'`).join(',')})`,
    gleich ? `$o.dst = $o.src` : `$o.dst = Test-SkfHost '${q(dst)}' @('${lwDst}')`,
    `$o.ordner = @()`,
    `if ($o.src.smb) { foreach ($p in @(${quellen.map(x => `'${q(x.unc)}'`).join(',')})) { $da = $false; $fehler = ''; try { $da = [System.IO.Directory]::Exists($p); if ($da) { [void][System.IO.Directory]::EnumerateFileSystemEntries($p).GetEnumerator().MoveNext() } } catch { $fehler = $_.Exception.InnerException.Message; if (-not $fehler) { $fehler = $_.Exception.Message } }; $o.ordner += @{ p = $p; da = $da; fehler = $fehler } } }`,
    `$o.schreiben = $null; $o.schreibFehler = ''; $o.zielDa = $false; $o.frei = $null; $o.gesamt = $null`,
    `if ($o.dst.smb) {`,
    `  $z = '${q(zielBasisUnc)}'`,
    `  $o.zielDa = [System.IO.Directory]::Exists($z)`,
    `  $test = $z; while ($test -and -not [System.IO.Directory]::Exists($test)) { $test = [System.IO.Path]::GetDirectoryName($test) }`,
    `  if ($test) { $tf = Join-Path $test ('.itadmin-schreibtest-' + [guid]::NewGuid().ToString('N') + '.tmp'); try { [System.IO.File]::WriteAllText($tf, ''); Remove-Item -LiteralPath $tf -Force -EA SilentlyContinue; $o.schreiben = $true } catch { $o.schreiben = $false; $o.schreibFehler = $_.Exception.InnerException.Message; if (-not $o.schreibFehler) { $o.schreibFehler = $_.Exception.Message } } }`,
    `  try { $d = (New-Object -ComObject Scripting.FileSystemObject).GetDrive('\\\\${q(dst)}\\${lwDst}$'); $o.frei = [double]$d.AvailableSpace; $o.gesamt = [double]$d.TotalSize } catch { }`,
    `}`,
    job.dest.kind === 'local' && job.scheduled ? `$o.winrm = $false; $o.winrmFehler = ''; try { Test-WSMan -ComputerName '${q(src)}' -EA Stop | Out-Null; $o.winrm = $true } catch { $o.winrmFehler = $_.Exception.Message }` : '',
    `ConvertTo-Json -InputObject $o -Depth 5 -Compress`,
  ].join('\n')
  let o: {
    src: HostStand; dst: HostStand; ordner?: { p: string; da: boolean; fehler?: string }[] | { p: string; da: boolean; fehler?: string }
    schreiben?: boolean | null; schreibFehler?: string; zielDa?: boolean; frei?: number | null; gesamt?: number | null
    winrm?: boolean; winrmFehler?: string
  }
  try {
    const r = await api().runPowerShell(script, 90000)
    const m = r.stdout.match(/\{[\s\S]*\}/)
    if (!m) return [{ ok: false, titel: 'Prüfung konnte nicht ausgeführt werden', detail: (r.stderr || r.stdout || '').slice(0, 300) }]
    o = JSON.parse(m[0])
  } catch (e) { return [{ ok: false, titel: 'Prüfung konnte nicht ausgeführt werden', detail: e instanceof Error ? e.message : String(e) }] }

  const pSrc = hostProblem({ ...o.src, freigaben: o.src.freigaben ?? {} }, lwSrc, gleich ? 'PC' : 'Quell-PC')
  punkte.push(pSrc ? { ok: false, titel: pSrc.titel, detail: pSrc.hilfe } : { ok: true, titel: `${gleich ? 'PC' : 'Quell-PC'} ${src} erreichbar (Admin-Freigabe ${lwSrc.map(l => l + '$').join(', ')})` })
  if (o.src.smb) {
    const ordner = ([] as { p: string; da: boolean; fehler?: string }[]).concat(o.ordner ?? [])
    ordner.forEach((x, i) => {
      const lokal = quellen[i]?.lokal ?? x.p
      if (x.fehler) punkte.push({ ok: false, titel: `Quell-Ordner ${lokal} nicht lesbar`, detail: x.fehler })
      else if (!x.da) punkte.push({ ok: false, titel: `Quell-Ordner ${lokal} gibt es nicht`, detail: 'Pfad prüfen — evtl. umbenannt oder anderes Benutzerprofil.' })
      else punkte.push({ ok: true, titel: `Quell-Ordner ${lokal} lesbar` })
    })
  }
  if (!gleich) {
    const pDst = hostProblem({ ...o.dst, freigaben: o.dst.freigaben ?? {} }, [lwDst], 'Ziel-PC')
    punkte.push(pDst ? { ok: false, titel: pDst.titel, detail: pDst.hilfe } : { ok: true, titel: `Ziel-PC ${dst} erreichbar (Admin-Freigabe ${lwDst}$)` })
  }
  if (o.dst.smb && (o.dst.freigaben ?? {})[lwDst] !== false) {
    if (o.schreiben === false) punkte.push({ ok: false, titel: `Im Ziel ${destBaseLocal(job)} darf nicht geschrieben werden`, detail: o.schreibFehler })
    else if (o.schreiben) punkte.push({ ok: true, titel: o.zielDa ? `Zielordner ${destBaseLocal(job)} beschreibbar` : `Zielordner ${destBaseLocal(job)} wird beim ersten Lauf angelegt` })
    if (typeof o.frei === 'number' && o.frei >= 0) {
      const gb = o.frei / 1024 ** 3
      punkte.push({ ok: gb >= 5, titel: `Freier Speicher auf ${dst} ${lwDst}: ${gb.toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`, detail: gb < 5 ? 'Sehr wenig Platz — das Backup kann mit „Ziel-Laufwerk ist voll" abbrechen.' : undefined })
    }
  }
  if (job.dest.kind === 'local' && job.scheduled) {
    punkte.push(o.winrm
      ? { ok: true, titel: `Fernverwaltung (WinRM) auf ${src} erreichbar — PC-Aufgabe kann eingerichtet werden` }
      : { ok: null, titel: `Fernverwaltung (WinRM) auf ${src} antwortet nicht`, detail: 'Beim Speichern wird versucht, WinRM zu starten. Klappt das nicht, kann die PC-Aufgabe nicht eingerichtet werden.' })
  }
  return punkte
}

// ── Remote-Ordner-Browser (UNC – funktioniert auch per IP, ohne WinRM) ────────

export async function listRemoteDrives(target: string): Promise<{ ok: boolean; drives: string[]; error?: string }> {
  const script = ERREICHBAR_PS + '\n' + [
    `$h = Test-SkfHost '${q(target)}' @('C','D','E','F','G','H','I')`,
    `ConvertTo-Json -InputObject $h -Depth 3 -Compress`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 40000)
    const m = r.stdout.match(/\{[\s\S]*\}/)
    if (!m) return { ok: false, drives: [], error: 'Abfrage fehlgeschlagen.' }
    const h = JSON.parse(m[0]) as HostStand
    const drives = Object.entries(h.freigaben ?? {}).filter(([, v]) => v).map(([k]) => k).sort()
    if (drives.length) return { ok: true, drives }
    const p = hostProblem({ ...h, freigaben: h.freigaben ?? {} }, ['C'], 'PC')
    return { ok: false, drives: [], error: p ? `${p.titel} — ${p.hilfe}` : 'Keine Admin-Freigabe (C$, D$ …) erreichbar — Rechte prüfen.' }
  } catch (e) { return { ok: false, drives: [], error: e instanceof Error ? e.message : String(e) } }
}

/** Listet Unterordner eines lokalen Pfads auf dem Ziel-PC (via UNC). */
export async function listRemoteDirs(target: string, localPath: string): Promise<{ ok: boolean; dirs: string[]; error?: string }> {
  const unc = localToUnc(target, localPath)
  if (!unc) return { ok: false, dirs: [], error: 'Ungültiger Pfad — bitte mit Laufwerk angeben (z. B. C:\\Users).' }
  const script = [
    `$p='${q(unc)}'`,
    `try { if (-not [System.IO.Directory]::Exists($p)) { Write-Output 'NOTFOUND'; exit 0 } } catch { Write-Output ('ERR:' + $_.Exception.Message); exit 0 }`,
    `$dirs=@()`,
    `try { foreach ($d in [System.IO.Directory]::EnumerateDirectories($p)) { $dirs += [System.IO.Path]::GetFileName($d) } } catch { $m = $_.Exception.InnerException.Message; if (-not $m) { $m = $_.Exception.Message }; Write-Output ('ERR:' + $m); exit 0 }`,
    `'DIRS:' + ($dirs -join '|')`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 30000)
    const out = r.stdout.trim()
    if (out === 'NOTFOUND') return { ok: false, dirs: [], error: 'Ordner gibt es nicht (oder PC nicht erreichbar).' }
    if (out.startsWith('ERR:')) return { ok: false, dirs: [], error: out.slice(4) }
    const m = out.match(/DIRS:(.*)$/s)
    if (!m) return { ok: false, dirs: [], error: r.stderr || 'Ordner nicht lesbar' }
    const dirs = m[1] ? m[1].split('|').map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de')) : []
    return { ok: true, dirs }
  } catch (e) { return { ok: false, dirs: [], error: e instanceof Error ? e.message : String(e) } }
}

export async function createRemoteDir(target: string, localPath: string): Promise<{ ok: boolean; error?: string }> {
  const unc = localToUnc(target, localPath)
  if (!unc) return { ok: false, error: 'Ungültiger Pfad.' }
  const script = `try { New-Item -ItemType Directory -Force -Path '${q(unc)}' -EA Stop | Out-Null; 'OK' } catch { 'ERR:' + $_.Exception.Message }`
  try {
    const r = await api().runPowerShell(script, 20000)
    return r.stdout.includes('OK') && !r.stdout.includes('ERR:') ? { ok: true } : { ok: false, error: r.stdout.replace(/^ERR:/, '').trim() || 'Fehler' }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

// ── Lauf starten / verfolgen / abbrechen ──────────────────────────────────────

export interface LaufHandle {
  art: 'admin' | 'pc'
  jobId: string
  runId: string           // bei 'pc' zunächst leer, wird aus status.json übernommen
  host?: string           // bei 'pc': der PC
  basisLesen: string      // '' = %LOCALAPPDATA%\ITAdminTool\Backups\<jobId> auf diesem PC; sonst UNC
  gestartet: number       // ms
}

export interface LaufStatus {
  runId: string; phase: 'start' | 'pruefen' | 'kopieren' | 'fertig'
  ordnerNr: number; ordnerAnzahl: number; erwartet: number; erwartetBytes: number; aktuell: number
  start?: string; aktualisiert?: string; rechner?: string; von?: string
}

export interface LaufStand { lesbar: boolean; fehler?: string; status: LaufStatus | null; ergebnis: LaufErgebnis | null }

export const PC_BASIS = 'C:\\ProgramData\\ITAdminTool\\Backups'

export function nativeTaskName(job: BackupJob): string { return job.nativeTaskName || `ITAdminBackup_${job.id}` }
export function pcBasisLokal(job: BackupJob): string { return `${PC_BASIS}\\${nativeTaskName(job)}` }
export function pcBasisUnc(job: BackupJob): string { return localToUnc(job.source.target, pcBasisLokal(job)) }

function basisAusdruck(h: Pick<LaufHandle, 'basisLesen' | 'jobId'>): string {
  return h.basisLesen ? `'${q(h.basisLesen)}'` : `(Join-Path $env:LOCALAPPDATA 'ITAdminTool\\Backups\\${q(h.jobId)}')`
}

/** Startet einen Lauf auf dem Admin-PC als versteckten Hintergrundprozess. */
export async function starteAdminLauf(job: BackupJob, von: string): Promise<{ ok: boolean; handle?: LaufHandle; error?: string }> {
  const f = jobFehler(job)
  if (f) return { ok: false, error: f }
  const runId = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')}-${Math.random().toString(36).slice(2, 6)}`
  const p = adminLaufParameter(job, runId, von)
  if (!p.ordner.length) return { ok: false, error: 'Keine gültigen Quell-Ordner.' }
  const skript = baueLaufSkript(p)
  const startScript = [
    `$b = Join-Path $env:LOCALAPPDATA 'ITAdminTool\\Backups\\${q(job.id)}'`,
    `New-Item -ItemType Directory -Force -Path $b | Out-Null`,
    `$ps1 = Join-Path $b 'lauf.ps1'`,
    `$text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(skript)}'))`,
    `[System.IO.File]::WriteAllText($ps1, $text, (New-Object System.Text.UTF8Encoding($true)))`,
    `$exe = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'`,
    `if (-not (Test-Path -LiteralPath $exe)) { $exe = 'powershell.exe' }`,
    `$pr = Start-Process -FilePath $exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"' + $ps1 + '"')) -WindowStyle Hidden -PassThru -EA Stop`,
    `'STARTED:' + $pr.Id`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(startScript, 30000)
    if (!r.stdout.includes('STARTED:')) return { ok: false, error: `Backup-Prozess konnte nicht gestartet werden: ${(r.stderr || r.stdout || 'unbekannt').slice(0, 300)}` }
    return { ok: true, handle: { art: 'admin', jobId: job.id, runId, basisLesen: '', gestartet: Date.now() } }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

/** Startet die PC-Aufgabe sofort (läuft lokal auf dem PC — schnell, ohne Umweg über das Netz). */
export async function startePcAufgabe(job: BackupJob): Promise<{ ok: boolean; handle?: LaufHandle; error?: string; fehlt?: boolean }> {
  const host = job.source.target.trim()
  await vorbereitenWinRM(host)
  const script = [
    `try {`,
    `  $r = Invoke-Command -ComputerName '${q(host)}' -ScriptBlock { param($tn) $t = Get-ScheduledTask -TaskName $tn -EA SilentlyContinue; if (-not $t) { 'FEHLT'; return }; if ($t.State -eq 'Disabled') { 'AUS'; return }; Start-ScheduledTask -TaskName $tn -EA Stop; 'OK' } -ArgumentList '${q(nativeTaskName(job))}' -EA Stop`,
    `  'RES:' + ($r -join ',')`,
    `} catch { 'ERR:' + $_.Exception.Message }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 45000)
    const out = r.stdout
    if (out.includes('RES:') && out.includes('OK')) return { ok: true, handle: { art: 'pc', jobId: job.id, runId: '', host, basisLesen: pcBasisUnc(job), gestartet: Date.now() } }
    if (out.includes('FEHLT')) return { ok: false, fehlt: true, error: 'Die PC-Aufgabe fehlt auf dem PC.' }
    if (out.includes('AUS')) return { ok: false, fehlt: true, error: 'Die PC-Aufgabe ist auf dem PC deaktiviert.' }
    return { ok: false, error: `PC-Aufgabe konnte nicht gestartet werden (WinRM): ${winrmText(out.replace(/^[\s\S]*ERR:/, '') || r.stderr)}` }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

/** Liest status.json + ergebnis.json eines Laufs (lokal bzw. per UNC). */
export async function liesLaufStand(h: Pick<LaufHandle, 'basisLesen' | 'jobId'>): Promise<LaufStand> {
  const script = [
    `$b = ${basisAusdruck(h)}`,
    `$o = @{ lesbar = $false; fehler = ''; status = ''; ergebnis = '' }`,
    `try {`,
    `  $o.lesbar = [System.IO.Directory]::Exists($b)`,
    `  $s = Join-Path $b 'status.json'; if ([System.IO.File]::Exists($s)) { $o.status = [System.IO.File]::ReadAllText($s) }`,
    `  $e = Join-Path $b 'ergebnis.json'; if ([System.IO.File]::Exists($e)) { $o.ergebnis = [System.IO.File]::ReadAllText($e) }`,
    `} catch { $o.fehler = $_.Exception.Message }`,
    `ConvertTo-Json -InputObject $o -Compress`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 30000)
    const m = r.stdout.match(/\{[\s\S]*\}/)
    if (!m) return { lesbar: false, fehler: r.stderr || 'keine Antwort', status: null, ergebnis: null }
    const o = JSON.parse(m[0]) as { lesbar: boolean; fehler?: string; status?: string; ergebnis?: string }
    let status: LaufStatus | null = null, ergebnis: LaufErgebnis | null = null
    try { if (o.status) status = JSON.parse(o.status.replace(/^\uFEFF/, '')) } catch { /* halb geschrieben → nächster Durchgang */ }
    try { if (o.ergebnis) ergebnis = normalisiereErgebnis(JSON.parse(o.ergebnis.replace(/^\uFEFF/, ''))) } catch { /* dito */ }
    return { lesbar: o.lesbar, fehler: o.fehler || undefined, status, ergebnis }
  } catch (e) { return { lesbar: false, fehler: e instanceof Error ? e.message : String(e), status: null, ergebnis: null } }
}

/** Bittet den laufenden Baustein um Abbruch (Datei abbrechen.flag, wird alle 2,5 s geprüft). */
export async function brecheLaufAb(h: Pick<LaufHandle, 'basisLesen' | 'jobId'>, von: string): Promise<boolean> {
  const script = `$b = ${basisAusdruck(h)}; try { [System.IO.File]::WriteAllText((Join-Path $b 'abbrechen.flag'), '${q(von)}'); 'OK' } catch { 'ERR:' + $_.Exception.Message }`
  try { const r = await api().runPowerShell(script, 20000); return r.stdout.includes('OK') } catch { return false }
}

/** Pfad einer Datei auf dem ausführenden PC → für openPath auf diesem PC (bei PC-Aufgabe über C$). */
export function protokollPfad(job: BackupJob, pfad: string | undefined, art: 'admin' | 'pc'): string {
  if (!pfad) return ''
  if (art === 'pc' && isAbsoluteLocalPath(pfad)) return localToUnc(job.source.target, pfad)
  return pfad
}

// ── Native Windows-Aufgabe (Ziel lokal, laeuft autonom auf dem PC) ────────────

function winrmText(m: string): string {
  const t = (m || '').trim()
  if (/WinRM|WS-Management|Fernverwaltung/i.test(t) && /nicht|cannot|kann|failed/i.test(t)) return `WinRM ist auf dem PC nicht erreichbar (${t.slice(0, 160)})`
  if (/Zugriff verweigert|Access is denied/i.test(t)) return 'Zugriff verweigert — das Konto ist auf dem PC kein Administrator.'
  return t.slice(0, 300) || 'unbekannter Fehler'
}

async function vorbereitenWinRM(host: string): Promise<void> {
  if (isIpv4(host)) { try { await ensureWinRmTrustedHost(host) } catch { /* egal */ } }
  try { await ensureWinRM(host) } catch { /* egal — Invoke-Command meldet den Grund */ }
}

/** Lauf-Parameter für die PC-Aufgabe (lokale Pfade auf dem PC). */
export function pcLaufParameter(job: BackupJob): LaufParameter {
  return {
    jobId: job.id, basis: pcBasisLokal(job),
    ordner: zielOrdner(job).map(o => ({ q: o.quelle, z: o.ziel })),
    schalter: roboSchalter(job),
    zielBasis: destBaseLocal(job),
    vorlauf: true, von: 'PC-Aufgabe',
  }
}

const TAGE_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Registriert/aktualisiert die native Aufgabe auf dem (Quell-=Ziel-)PC. Nur fuer lokales Ziel. */
export async function registerNativeTask(job: BackupJob): Promise<{ ok: boolean; error?: string }> {
  const f = jobFehler(job)
  if (f) return { ok: false, error: f }
  const host = job.source.target.trim()
  const taskName = nativeTaskName(job)
  const s = job.schedule
  const art = s?.type === 'once' ? 'once' : s?.repeat === 'weekly' ? 'weekly' : 'daily'
  const tage = (s?.days && s.days.length ? s.days : [1]).map(d => TAGE_EN[d]).filter(Boolean).join(',')
  const skript = baueLaufSkript(pcLaufParameter(job))
  await vorbereitenWinRM(host)
  const regScript = [
    `try {`,
    `$r = Invoke-Command -ComputerName '${q(host)}' -ScriptBlock {`,
    `  param($tn, $b64, $art, $zeit, $datum, $tage, $basis)`,
    `  $ErrorActionPreference = 'Stop'`,
    `  New-Item -ItemType Directory -Force -Path $basis | Out-Null`,
    // Ordner nur fuer SYSTEM + Administratoren (das Skript laeuft als SYSTEM)
    `  $icacls = Join-Path $env:SystemRoot 'System32\\icacls.exe'`,
    `  & $icacls $basis /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null`,
    `  $ps1 = Join-Path $basis ($tn + '.ps1')`,
    `  $text = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64))`,
    `  [System.IO.File]::WriteAllText($ps1, $text, (New-Object System.Text.UTF8Encoding($true)))`,
    `  $at = [datetime]::ParseExact($zeit, 'HH:mm', [Globalization.CultureInfo]::InvariantCulture)`,
    `  if ($art -eq 'once') { $t = New-ScheduledTaskTrigger -Once -At ([datetime]::ParseExact(($datum + ' ' + $zeit), 'yyyy-MM-dd HH:mm', [Globalization.CultureInfo]::InvariantCulture)) }`,
    `  elseif ($art -eq 'weekly') { $t = New-ScheduledTaskTrigger -Weekly -DaysOfWeek ($tage -split ',') -At $at }`,
    `  else { $t = New-ScheduledTaskTrigger -Daily -At $at }`,
    `  $psExe = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'`,
    `  $a = New-ScheduledTaskAction -Execute $psExe -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $ps1 + '"')`,
    `  $p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest -LogonType ServiceAccount`,
    `  $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew`,
    `  Register-ScheduledTask -TaskName $tn -Action $a -Trigger $t -Principal $p -Settings $s -Description 'IT Admin Tool – Back-Up (nur kopierend)' -Force | Out-Null`,
    // Alter Ablageort (bis 11/2026): C:\\Windows\\Temp — wird von der Datenträgerbereinigung geleert
    `  Remove-Item -LiteralPath (Join-Path $env:SystemRoot ('Temp\\' + $tn + '.ps1')), (Join-Path $env:SystemRoot ('Temp\\' + $tn + '.log')) -Force -EA SilentlyContinue`,
    `  'OK'`,
    `} -ArgumentList '${q(taskName)}','${b64(skript)}','${art}','${q(s?.time || '20:00')}','${q(s?.date || '')}','${tage}','${q(pcBasisLokal(job))}' -EA Stop`,
    `'RES:' + ($r -join ',')`,
    `} catch { 'ERR:' + $_.Exception.Message }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(regScript, 60000)
    if (r.stdout.includes('RES:') && r.stdout.includes('OK')) return { ok: true }
    const m = r.stdout.includes('ERR:') ? r.stdout.replace(/^[\s\S]*?ERR:/, '') : (r.stderr || r.stdout)
    return { ok: false, error: winrmText(m) }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

/** Aufgabe aktivieren/deaktivieren (Pausieren), ohne sie neu zu schreiben. */
export async function setNativeTaskAktiv(job: BackupJob, aktiv: boolean): Promise<{ ok: boolean; error?: string; fehlt?: boolean }> {
  const host = job.source.target.trim()
  await vorbereitenWinRM(host)
  const script = [
    `try {`,
    `  $r = Invoke-Command -ComputerName '${q(host)}' -ScriptBlock { param($tn, $an) $t = Get-ScheduledTask -TaskName $tn -EA SilentlyContinue; if (-not $t) { 'FEHLT'; return }; if ($an) { Enable-ScheduledTask -TaskName $tn -EA Stop | Out-Null } else { Disable-ScheduledTask -TaskName $tn -EA Stop | Out-Null }; 'OK' } -ArgumentList '${q(nativeTaskName(job))}', $${aktiv ? 'true' : 'false'} -EA Stop`,
    `  'RES:' + ($r -join ',')`,
    `} catch { 'ERR:' + $_.Exception.Message }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 45000)
    if (r.stdout.includes('FEHLT')) return { ok: false, fehlt: true, error: 'Die PC-Aufgabe fehlt auf dem PC.' }
    if (r.stdout.includes('RES:') && r.stdout.includes('OK')) return { ok: true }
    return { ok: false, error: winrmText(r.stdout.replace(/^[\s\S]*?ERR:/, '') || r.stderr) }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

/** Entfernt Aufgabe + Skript (+ Lauf-Protokolle) vom PC. Gesicherte Daten bleiben unberührt. */
export async function unregisterNativeTask(job: BackupJob): Promise<{ ok: boolean; error?: string }> {
  const host = job.source.target.trim()
  const taskName = nativeTaskName(job)
  await vorbereitenWinRM(host)
  const script = [
    `try {`,
    `  $r = Invoke-Command -ComputerName '${q(host)}' -ScriptBlock {`,
    `    param($tn, $basis)`,
    `    Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue`,
    `    Remove-Item -LiteralPath (Join-Path $env:SystemRoot ('Temp\\' + $tn + '.ps1')), (Join-Path $env:SystemRoot ('Temp\\' + $tn + '.log')) -Force -EA SilentlyContinue`,
    `    Remove-Item -LiteralPath (Join-Path (Split-Path $basis -Parent) ($tn + '.ps1')) -Force -EA SilentlyContinue`,
    // Nur den Lauf-Ordner der Aufgabe (Status/Protokolle) — NIE die gesicherten Daten
    `    if ($basis -like 'C:\\ProgramData\\ITAdminTool\\Backups\\ITAdminBackup_*') { Remove-Item -LiteralPath $basis -Recurse -Force -EA SilentlyContinue }`,
    `    if (Get-ScheduledTask -TaskName $tn -EA SilentlyContinue) { 'NOCH' } else { 'OK' }`,
    `  } -ArgumentList '${q(taskName)}','${q(pcBasisLokal(job))}' -EA Stop`,
    `  'RES:' + ($r -join ',')`,
    `} catch { 'ERR:' + $_.Exception.Message }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 45000)
    if (r.stdout.includes('RES:') && r.stdout.includes('OK')) return { ok: true }
    if (r.stdout.includes('NOCH')) return { ok: false, error: 'Die Aufgabe konnte auf dem PC nicht entfernt werden.' }
    return { ok: false, error: winrmText(r.stdout.replace(/^[\s\S]*?ERR:/, '') || r.stderr) }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

export interface NativeTaskInfo {
  erreichbar: boolean
  fehler?: string
  exists: boolean
  state?: string          // Ready | Running | Disabled …
  lastRun?: string        // ISO
  nextRun?: string        // ISO
  lastResult?: number
  skriptDa?: boolean
  alterStand?: boolean    // Skript noch am alten Ort (C:\Windows\Temp) → neu einrichten
}

/** Liest Live-Status der nativen Aufgabe vom PC (WinRM, nur lesend). */
export async function queryNativeTask(job: BackupJob): Promise<NativeTaskInfo> {
  const host = job.source.target.trim()
  const script = [
    `try {`,
    `  $r = Invoke-Command -ComputerName '${q(host)}' -ScriptBlock {`,
    `    param($tn, $basis)`,
    `    $t = Get-ScheduledTask -TaskName $tn -EA SilentlyContinue`,
    `    if (-not $t) { '{"exists":false}'; return }`,
    `    $i = $t | Get-ScheduledTaskInfo`,
    `    $iso = { param($d) if ($d -and $d.Year -gt 2000) { $d.ToString('o') } else { '' } }`,
    `    $neu = Join-Path (Split-Path $basis -Parent) ($tn + '.ps1')`,
    `    @{ exists = $true; state = [string]$t.State; lastRun = (& $iso $i.LastRunTime); nextRun = (& $iso $i.NextRunTime); lastResult = [int64]$i.LastTaskResult; skriptDa = (Test-Path -LiteralPath $neu); alterStand = (-not (Test-Path -LiteralPath $neu)) -and (Test-Path -LiteralPath (Join-Path $env:SystemRoot ('Temp\\' + $tn + '.ps1'))) } | ConvertTo-Json -Compress`,
    `  } -ArgumentList '${q(nativeTaskName(job))}','${q(pcBasisLokal(job))}' -EA Stop`,
    `  'RES:' + ($r -join '')`,
    `} catch { 'ERR:' + $_.Exception.Message }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 30000)
    if (r.stdout.includes('ERR:') || !r.stdout.includes('RES:')) {
      return { erreichbar: false, exists: false, fehler: winrmText(r.stdout.replace(/^[\s\S]*?ERR:/, '') || r.stderr || 'keine Antwort') }
    }
    const m = r.stdout.match(/\{.*\}/s)
    if (!m) return { erreichbar: true, exists: false }
    const j = JSON.parse(m[0]) as Omit<NativeTaskInfo, 'erreichbar'>
    return { erreichbar: true, ...j, lastRun: j.lastRun || undefined, nextRun: j.nextRun || undefined }
  } catch (e) { return { erreichbar: false, exists: false, fehler: e instanceof Error ? e.message : String(e) } }
}

/** Ergebnisse der letzten Läufe einer PC-Aufgabe (per UNC, ohne WinRM) — für Karte + Verlauf. */
export async function liesPcErgebnisse(job: BackupJob, max = 15): Promise<{ lesbar: boolean; fehler?: string; status: LaufStatus | null; ergebnisse: LaufErgebnis[] }> {
  const unc = pcBasisUnc(job)
  if (!unc) return { lesbar: false, fehler: 'Ungültiger PC', status: null, ergebnisse: [] }
  const script = ERREICHBAR_PS + '\n' + [
    `$o = @{ lesbar = $false; fehler = ''; status = ''; ergebnisse = @() }`,
    `if (-not (Test-SkfPort '${q(job.source.target.trim())}' 445 2500)) { $o.fehler = 'PC nicht erreichbar'; ConvertTo-Json -InputObject $o -Compress; exit 0 }`,
    `$b = '${q(unc)}'`,
    `try {`,
    `  $o.lesbar = [System.IO.Directory]::Exists($b)`,
    `  $s = Join-Path $b 'status.json'; if ([System.IO.File]::Exists($s)) { $o.status = [System.IO.File]::ReadAllText($s) }`,
    `  $l = Join-Path $b 'logs'`,
    `  if ([System.IO.Directory]::Exists($l)) { $o.ergebnisse = @(Get-ChildItem -LiteralPath $l -Directory -EA Stop | Sort-Object Name -Descending | Select-Object -First ${max} | ForEach-Object { $e = Join-Path $_.FullName 'ergebnis.json'; if ([System.IO.File]::Exists($e)) { [System.IO.File]::ReadAllText($e) } }) }`,
    `} catch { $o.fehler = $_.Exception.Message }`,
    `ConvertTo-Json -InputObject $o -Compress -Depth 3`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 40000)
    const m = r.stdout.match(/\{[\s\S]*\}/)
    if (!m) return { lesbar: false, fehler: r.stderr || 'keine Antwort', status: null, ergebnisse: [] }
    const o = JSON.parse(m[0]) as { lesbar: boolean; fehler?: string; status?: string; ergebnisse?: string[] | string }
    let status: LaufStatus | null = null
    try { if (o.status) status = JSON.parse(o.status.replace(/^\uFEFF/, '')) } catch { /* egal */ }
    const ergebnisse: LaufErgebnis[] = []
    for (const t of ([] as string[]).concat(o.ergebnisse ?? [])) {
      try { const e = normalisiereErgebnis(JSON.parse(String(t).replace(/^\uFEFF/, ''))); if (e) ergebnisse.push(e) } catch { /* egal */ }
    }
    return { lesbar: o.lesbar, fehler: o.fehler || undefined, status, ergebnisse }
  } catch (e) { return { lesbar: false, fehler: e instanceof Error ? e.message : String(e), status: null, ergebnisse: [] } }
}

/** Ziel im Explorer öffnen (UNC). */
export function zielUnc(job: BackupJob): string { return localToUnc(destTargetOf(job), destBaseLocal(job)) }

/** Prüft nur, ob ein Rechner per Admin-Freigabe erreichbar ist (für Abwärtskompatibilität). */
export async function checkTargetReachable(target: string): Promise<{ ok: boolean; error?: string }> {
  const r = await listRemoteDrives(target)
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}
