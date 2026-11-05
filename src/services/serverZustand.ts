// ── Server-Zustand: was muss auf dem Server laufen — und läuft es? ───────────
// 1. Analyse (nur lesend, per WinRM): Software, Rollen, Dienste, IIS, geplante
//    Aufgaben, lauschende Ports, Freigaben, Festplatten, ausstehender Neustart.
// 2. Vorschlag: daraus die relevanten Prüfpunkte (Dienste der installierten
//    Programme + Server-Rollen, ihre Ports, IIS, Freigaben, Festplatten …).
//    Der Admin bestätigt/ändert → Soll-Zustand.
// 3. Prüfung gegen den Soll-Zustand (automatisch alle 15 min, nach Neustart, wenn
//    ein Server wieder erreichbar ist, und per Knopf). Neue kritische Fehler →
//    Ereignis „pruefung" (Popup + Mail, siehe serverEreignisse.ts).
// 4. Beheben NUR auf ausdrücklichen Klick (Dienst starten/neu starten, App-Pool,
//    Website, Aufgabe) — wird in der Server-Historie protokolliert.
//
// Ablage je Server (eigene Dateien → keine Schreibkonflikte):
//   server_monitor/soll/<HOST>.json      Soll-Zustand (Prüfpunkte)
//   server_monitor/ist/<HOST>.json       letztes Prüfergebnis
//   server_monitor/inventar/<HOST>.json  letzte Analyse

import { api } from '../electronAPI'
import { parseSysstatus, sealErgebnisse, SEAL_ABFRAGE, SEAL_TESTAUFRUF, SEAL_MARKE, type SealRoh } from './sealStatus'

/** seal = Systeme laut SEAL-`sysstatus` (PLOSSYS/DPF, z. B. W3148) — siehe sealStatus.ts */
export type PruefTyp = 'dienst' | 'apppool' | 'website' | 'aufgabe' | 'port' | 'freigabe' | 'festplatte' | 'neustart' | 'prozess' | 'seal'
/** kritisch = Alarm (Popup/Mail); hinweis = nur gelb anzeigen */
export type Stufe = 'kritisch' | 'hinweis'

export interface Pruefpunkt {
  id: string                 // typ:name (eindeutig je Server)
  typ: PruefTyp
  name: string               // Dienstname · App-Pool · Website · Aufgabe · Port · Freigabe · Laufwerk · Prozess
  anzeige: string            // lesbarer Name
  pfad?: string              // Aufgabe: Ordner (TaskPath)
  wert?: number              // Festplatte: mindestens % frei
  zuDienst?: string          // Port: gehört zu diesem Dienst (für „beheben")
  kennung?: 'dca'            // Dienst: ECI DCA (Zählerstände an Hilker & Pahl) — eigener Hinweis bei Ausfall
  befehl?: string            // SEAL: von Hand eingetragener sysstatus-Aufruf (leer = automatisch suchen)
  hinweis?: string           // warum relevant
  stufe: Stufe
}

export interface SollZustand {
  host: string
  punkte: Pruefpunkt[]
  geaendertAm: string
  geaendertVon: string
}

export interface PruefErgebnis {
  id: string; ok: boolean; status: string; detail?: string
  /** in Ordnung, aber mit Warnung (gelb, kein Alarm) — z. B. [W]-Zeile in sysstatus */
  warnung?: boolean
  /** Detailzeilen (SEAL: alle Zeilen des sysstatus-Blocks) */
  zeilen?: string[]
}

export interface IstStand {
  host: string
  am: string
  erreichbar: boolean
  fehler?: string
  boot?: string
  /** kurz nach dem Start: fehlende Dienste können noch hochfahren → kein Alarm */
  startetNoch?: boolean
  ergebnisse: PruefErgebnis[]
  /** SEAL: Gesamtzeile + Systeme, die in sysstatus neu auftauchen (nicht im Soll) */
  seal?: { gesamt?: string; neu: string[]; sysstatus?: string; befehl?: string }
}

// ── Analyse-Ergebnis (Inventar) ──────────────────────────────────────────────
export interface InvDienst { n: string; d: string; s: string; m: string; v?: boolean; p?: string; u?: string; pr?: number; b?: string }
export interface InvSoftware { n: string; v?: string; h?: string }
export interface InvAufgabe { n: string; pf: string; s: string; r: number; l?: string }
export interface InvPort { port: number; pr: number; proc: string }
export interface Inventar {
  host: string
  am: string
  os?: string
  boot?: string
  dienste: InvDienst[]
  software: InvSoftware[]
  rollen: string[]
  pools: { n: string; s: string }[]
  sites: { n: string; s: string; b?: string }[]
  aufgaben: InvAufgabe[]
  ports: InvPort[]
  freigaben: { n: string; p?: string }[]
  platten: { n: string; g: number; f: number }[]
  neustartAusstehend?: boolean
  /** SEAL-Installation (PLOSSYS/DPF) + Probelauf von sysstatus */
  seal?: SealRoh
}

const key = (h: string) => (h || '').trim().toUpperCase()
const sollDatei = (h: string) => `server_monitor/soll/${key(h)}.json`
const istDatei = (h: string) => `server_monitor/ist/${key(h)}.json`
const invDatei = (h: string) => `server_monitor/inventar/${key(h)}.json`
const esc = (s: string) => s.replace(/'/g, "''")
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)))
const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : v == null ? [] : [v as T]

export async function ladeSoll(h: string): Promise<SollZustand | null> {
  const d = await api().netReadJsonAsync<SollZustand>(sollDatei(h)).catch(() => null)
  return d && Array.isArray(d.punkte) ? d : null
}
export async function speichereSoll(s: SollZustand): Promise<boolean> {
  return api().netWriteJsonAsync(sollDatei(s.host), s).catch(() => false)
}
export async function ladeIst(h: string): Promise<IstStand | null> {
  const d = await api().netReadJsonAsync<IstStand>(istDatei(h)).catch(() => null)
  return d && Array.isArray(d.ergebnisse) ? d : null
}
export async function ladeInventar(h: string): Promise<Inventar | null> {
  return api().netReadJsonAsync<Inventar>(invDatei(h)).catch(() => null)
}

/** Fern-Aufruf mit kurzen Verbindungs-Timeouts; Ergebnis als markierte JSON-Zeile. */
export function fern(host: string, inner: string, tag: string, payload?: unknown, opTimeoutMs = 180000): string {
  const p = payload !== undefined ? b64(JSON.stringify(payload)) : ''
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$so = New-PSSessionOption -OpenTimeout 15000 -OperationTimeout ${opTimeoutMs}`,
    `try {`,
    `  $r = Invoke-Command -ComputerName '${esc(host)}' -SessionOption $so -ErrorAction Stop -ArgumentList '${p}' -ScriptBlock {`,
    `    param($b64)`,
    `    $ErrorActionPreference='SilentlyContinue'`,
    `    $P = $null; if ($b64) { $P = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json }`,
    inner,
    `  }`,
    `  $r | ForEach-Object { '${tag}' + $_ }`,
    `} catch { '${tag}' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }`,
  ].join('\n')
}
export function lies<T>(stdout: string, tag: string): T | null {
  const i = (stdout || '').lastIndexOf(tag)
  if (i < 0) return null
  try { return JSON.parse(stdout.slice(i + tag.length).trim()) as T } catch { return null }
}
export const kurzFehler = (s?: string) => (s || '').split(/\r?\n/)[0].slice(0, 300)

// ── SEAL `sysstatus` (nur lesend) ────────────────────────────────────────────
// Sucht die SEAL-Installation (PLSROOT bzw. …\Seal\applications), darunter die
// Werkzeuge `sysstatus.*` und `sitwelcome.*` (lädt die SEAL-Umgebung wie die
// SEAL-Shell) und führt in einem eigenen cmd.exe aus:
//   cd /d <root> & call sitwelcome & echo @@SKF-SYSSTATUS@@ & call sysstatus
// Zeitlimit 120 s (danach wird nur der eigene Prozessbaum beendet), keine Temp-Datei.
// Ausgeführt wird ausschließlich sysstatus — ein von Hand eingetragener Befehl wird
// abgelehnt, wenn er etwas anderes enthält (sysstart/sysstop/Verkettungen …).
export const SEAL_PS = String.raw`
    function Find-SkfDatei([string]$start, [string]$name, [int]$tiefe, [string[]]$endungen = @()) {
      $ebene = @($start); $treffer = @()
      for ($t = 0; $t -le $tiefe -and $ebene.Count -gt 0; $t++) {
        $naechste = @()
        foreach ($d in $ebene) {
          try { $treffer += @([IO.Directory]::GetFiles($d, $name + '*') | Where-Object { [IO.Path]::GetFileNameWithoutExtension($_) -ieq $name -and ($endungen.Count -eq 0 -or $endungen -contains [IO.Path]::GetExtension($_).ToLower()) }) } catch { }
          if ($t -lt $tiefe) { try { $naechste += @([IO.Directory]::GetDirectories($d) | Where-Object { [IO.Path]::GetFileName($_) -notmatch '^(data|logs?|tmp|temp|spool|backup|bak|jobs?|archiv\w*|pgdata|cache|customer)$' }) } catch { } }
        }
        if ($treffer.Count -gt 0) { break }
        $ebene = $naechste
      }
      return $treffer
    }
    function Select-SkfBeste($liste) {
      $rang = @{ '.bat' = 1; '.cmd' = 2; '.exe' = 3; '.com' = 4; '.pl' = 5; '' = 6 }
      @($liste | Where-Object { $rang.ContainsKey([IO.Path]::GetExtension($_).ToLower()) } | Sort-Object { $rang[[IO.Path]::GetExtension($_).ToLower()] }) | Select-Object -First 1
    }
    function Get-SkfAufruf([string]$datei, [string]$perl = '') {
      $e = [IO.Path]::GetExtension($datei).ToLower()
      if ($e -eq '.bat' -or $e -eq '.cmd') { return 'call "' + $datei + '"' }
      if ($e -eq '.pl' -or $e -eq '') { if ($perl) { return '"' + $perl + '" "' + $datei + '"' } else { return 'perl "' + $datei + '"' } }
      return '"' + $datei + '"'
    }
    # SEAL bringt meist ein eigenes Perl mit (sysstatus ist auf W3148 ein .pl-Skript)
    function Find-SkfPerl([string]$root) {
      foreach ($s in @($root, (Split-Path -Parent $root))) {
        if (-not $s) { continue }
        $p = @(Find-SkfDatei $s 'perl' 5 @('.exe')) | Select-Object -First 1
        if ($p) { return [string]$p }
      }
      foreach ($k in 'C:\Strawberry\perl\bin\perl.exe', 'C:\Perl64\bin\perl.exe', 'C:\Perl\bin\perl.exe') { if (Test-Path -LiteralPath $k) { return $k } }
      $c = Get-Command perl.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($c) { return [string]$c.Source }
      return ''
    }
    function Get-SkfLnkOrte {
      $o = @((Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'), (Join-Path $env:PUBLIC 'Desktop'))
      foreach ($u in @(Get-ChildItem -LiteralPath (Split-Path -Parent $env:PUBLIC) -Directory -ErrorAction SilentlyContinue)) {
        $o += (Join-Path $u.FullName 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs'); $o += (Join-Path $u.FullName 'Desktop')
      }
      return $o
    }
    # Die SEAL-Shell (Verknüpfung im Startmenü/Desktop) lädt die Umgebung per Batch — genau
    # diese Batch wird vor sysstatus aufgerufen. Nie Dateien, die etwas starten/stoppen.
    function Find-SkfSealShell([string]$root, $orte) {
      $verboten = '(?i)sysstart|sysstop|kill|restart|shutdown'
      $sh = $null; try { $sh = New-Object -ComObject WScript.Shell } catch { }
      if ($sh) {
        foreach ($o in @($orte)) {
          if (-not $o -or -not (Test-Path -LiteralPath $o)) { continue }
          foreach ($l in @(Get-ChildItem -LiteralPath $o -Recurse -Depth 3 -Filter '*.lnk' -File -ErrorAction SilentlyContinue)) {
            try { $s = $sh.CreateShortcut($l.FullName); $t = [string]$s.TargetPath; $a = [string]$s.Arguments } catch { continue }
            $voll = $t + ' ' + $a
            if ($voll.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -lt 0 -and $voll -notmatch '(?i)\\seal\\|plossys|sitwelcome' -and $l.Name -notmatch '(?i)seal|plossys') { continue }
            $bat = ''
            if ($a -match '(?i)"([^"]+\.(bat|cmd))"') { $bat = $Matches[1] } elseif ($a -match '(?i)(\S+\.(bat|cmd))\b') { $bat = $Matches[1] } elseif ($t -match '(?i)\.(bat|cmd)$') { $bat = $t }
            if (-not $bat) { continue }
            $bat = [Environment]::ExpandEnvironmentVariables($bat)
            if ([IO.Path]::GetFileName($bat) -match $verboten) { continue }
            if (Test-Path -LiteralPath $bat) { return @{ datei = $bat; quelle = ('Verknüpfung ' + $l.FullName) } }
          }
        }
      }
      # Rückfall: Batch im SEAL-Ordner, die genau den Willkommenstext der SEAL-Shell ausgibt
      $ebene = @($root); $n = 0
      for ($t = 0; $t -le 3 -and $ebene.Count -gt 0; $t++) {
        $naechste = @()
        foreach ($d in $ebene) {
          foreach ($f in @(Get-ChildItem -LiteralPath $d -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -match '^\.(bat|cmd)$' })) {
            if ($f.Name -match $verboten -or $f.Name -notmatch '(?i)env|welcome|shell|prompt|plos') { continue }
            $n++; if ($n -gt 400) { break }
            if (Select-String -LiteralPath $f.FullName -Pattern 'environment will be loaded' -SimpleMatch -Quiet -ErrorAction SilentlyContinue) { return @{ datei = $f.FullName; quelle = 'Batch mit dem Willkommenstext der SEAL-Shell' } }
          }
          if ($t -lt 3) { $naechste += @(Get-ChildItem -LiteralPath $d -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch '^(data|logs?|tmp|temp|spool|backup|bak|jobs?|archiv\w*|pgdata|cache|customer)$' } | ForEach-Object { $_.FullName }) }
        }
        $ebene = $naechste
      }
      return $null
    }
    function Invoke-SkfCmd([string]$befehl, [string]$wd) {
      $psi = New-Object System.Diagnostics.ProcessStartInfo
      $psi.FileName = Join-Path $env:SystemRoot 'System32\cmd.exe'
      $psi.Arguments = '/d /s /c "' + $befehl + '"'
      $psi.WorkingDirectory = $wd
      $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
      $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true; $psi.RedirectStandardInput = $true
      try { $enc = [Text.Encoding]::GetEncoding([int](Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Nls\CodePage').OEMCP) } catch { $enc = [Text.Encoding]::GetEncoding(850) }
      $psi.StandardOutputEncoding = $enc; $psi.StandardErrorEncoding = $enc
      $p = [Diagnostics.Process]::Start($psi)
      $p.StandardInput.Close()
      $to = $p.StandardOutput.ReadToEndAsync(); $te = $p.StandardError.ReadToEndAsync()
      $zeit = -not $p.WaitForExit(120000)
      if ($zeit) { & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $p.Id /T /F 2>$null | Out-Null }
      [void]$to.Wait(5000); [void]$te.Wait(5000)
      $out = ''
      if ($to.IsCompleted) { $out = [string]$to.Result }
      if ($te.IsCompleted -and $te.Result) { $out += [Environment]::NewLine + [string]$te.Result }
      $ex = $null; if (-not $zeit) { $ex = $p.ExitCode }
      return @{ out = $out; exit = $ex; zeit = $zeit; marke = ($out.Contains('${SEAL_MARKE}')) }
    }
    function Invoke-SkfSysstatus([string]$manuell) {
      $r = [ordered]@{ gefunden = $false; root = ''; sysstatus = ''; sitwelcome = ''; umgebungQuelle = ''; perl = ''; befehl = ''; roh = ''; exit = $null; fehler = '' }
      $root = [Environment]::GetEnvironmentVariable('PLSROOT', 'Machine')
      if (-not $root -or -not (Test-Path -LiteralPath $root)) {
        $root = $null
        foreach ($k in 'D:\Seal\applications', 'C:\Seal\applications', 'E:\Seal\applications') { if (Test-Path -LiteralPath $k) { $root = $k; break } }
      }
      if (-not $root) {
        foreach ($s in @(Get-CimInstance Win32_Service)) { if ([string]$s.PathName -match '([A-Za-z]:\\[^"]*?\\seal\\applications)\\') { $root = $Matches[1]; break } }
      }
      if (-not $root) { return $r }
      $root = $root.TrimEnd('\')
      $r.gefunden = $true; $r.root = $root
      $ss = Select-SkfBeste @(Find-SkfDatei $root 'sysstatus' 4)
      if (-not $ss) { $par = Split-Path -Parent $root; if ($par) { $ss = Select-SkfBeste @(Find-SkfDatei $par 'sysstatus' 2) } }
      # Umgebung: sitwelcome.* — sonst die Batch hinter der SEAL-Shell-Verknüpfung
      $sw = Select-SkfBeste @(Find-SkfDatei $root 'sitwelcome' 4 @('.bat', '.cmd'))
      $swQuelle = $(if ($sw) { 'sitwelcome im SEAL-Ordner' } else { '' })
      if (-not $sw) { $orte = $(if ($SkfTestLnkOrte) { $SkfTestLnkOrte } else { Get-SkfLnkOrte }); $fs = Find-SkfSealShell $root $orte; if ($fs) { $sw = [string]$fs.datei; $swQuelle = [string]$fs.quelle } }
      $perl = ''; if ($ss -and ([IO.Path]::GetExtension($ss) -match '^(\.pl)?$')) { $perl = Find-SkfPerl $root }
      $r.sysstatus = [string]$ss; $r.sitwelcome = [string]$sw; $r.umgebungQuelle = $swQuelle; $r.perl = [string]$perl
      if ($manuell) {
        if ($manuell -notmatch '(?i)sysstatus' -or $manuell -match '(?i)sysstart|sysstop|\bstop\b|\bstart\b|kill|restart|\bdel\b|\berase\b|\brd\b|\brmdir\b|\bformat\b|[&|<>^\r\n]') { $r.fehler = 'Eingetragener Befehl abgelehnt — nur sysstatus ist erlaubt, keine weiteren Befehle'; return $r }
        $lauf = $manuell
      } elseif ($ss) { $lauf = Get-SkfAufruf $ss $perl }
      else { $r.fehler = 'sysstatus nicht gefunden unter ' + $root + ' — Befehl im Reiter Einrichten von Hand eintragen'; return $r }
      # SEAL-Variablen notfalls selbst setzen (wie in der SEAL-Shell angezeigt) + Perl/Werkzeuge in den PATH
      $basis = 'cd /d "' + $root + '"'
      if ($root -notmatch '[()]') {
        $basis += ' & (if not defined PLSROOT set "PLSROOT=' + $root + '\")'
        $basis += ' & (if not defined PLSDATA set "PLSDATA=' + $root + '\data")'
        $cust = Join-Path (Split-Path -Parent $root) 'customer'
        if ((Test-Path -LiteralPath $cust) -and $cust -notmatch '[()]') { $basis += ' & (if not defined SEAL_CUSTOMDIR set "SEAL_CUSTOMDIR=' + $cust + '")' }
      }
      $pfad = @(); if ($perl) { $pfad += (Split-Path -Parent $perl) }; if ($ss) { $pfad += (Split-Path -Parent $ss) }
      if ($pfad.Count) { $basis += ' & set "PATH=' + ($pfad -join ';') + ';%PATH%"' }
      $befehl = $basis
      if ($sw) { $befehl += ' & ' + (Get-SkfAufruf $sw) }
      $befehl += ' & echo ${SEAL_MARKE} & ' + $lauf
      $erg = Invoke-SkfCmd $befehl $root
      $vorher = ''
      if ($sw -and -not $erg.marke -and -not $erg.zeit) {
        # sitwelcome hat die Shell beendet → noch einmal ohne Umgebungsstart
        $vorher = [string]$erg.out
        $befehl = $basis + ' & echo ${SEAL_MARKE} & ' + $lauf
        $erg = Invoke-SkfCmd $befehl $root
      }
      $roh = $vorher + [string]$erg.out
      if ($roh.Length -gt 60000) { $roh = $roh.Substring($roh.Length - 60000) }
      $r.befehl = $befehl; $r.roh = $roh; $r.exit = $erg.exit
      if ($erg.zeit) { $r.fehler = 'sysstatus hat nach 120 s nicht geantwortet (abgebrochen)' }
      return $r
    }
`

// ── 1. Analyse ───────────────────────────────────────────────────────────────
export const ANALYSE_INNER = SEAL_PS + String.raw`
    $os = Get-CimInstance Win32_OperatingSystem
    $svc = @(Get-CimInstance Win32_Service | ForEach-Object {
      [pscustomobject]@{ n=[string]$_.Name; d=[string]$_.DisplayName; s=[string]$_.State; m=[string]$_.StartMode; v=[bool]$_.DelayedAutoStart; p=[string]$_.PathName; u=[string]$_.StartName; pr=[int]$_.ProcessId; b=([string]$_.Description).Substring(0, [Math]::Min(200, ([string]$_.Description).Length)) }
    })
    $sw = @(@(foreach ($k in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*') {
      Get-ItemProperty $k | Where-Object { $_.DisplayName -and -not $_.SystemComponent -and -not $_.ParentKeyName } | ForEach-Object { [pscustomobject]@{ n=[string]$_.DisplayName; v=[string]$_.DisplayVersion; h=[string]$_.Publisher } }
    }) | Sort-Object n -Unique)
    $rollen = @(); if (Get-Command Get-WindowsFeature -ErrorAction SilentlyContinue) { $rollen = @(Get-WindowsFeature | Where-Object { $_.Installed -and $_.FeatureType -eq 'Role' } | ForEach-Object { [string]$_.DisplayName }) }
    $pools = @(); $sites = @()
    if (Get-Module -ListAvailable WebAdministration) {
      Import-Module WebAdministration
      $pools = @(Get-ChildItem IIS:\AppPools | ForEach-Object { [pscustomobject]@{ n=[string]$_.Name; s=[string]$_.State } })
      $sites = @(Get-Website | ForEach-Object { [pscustomobject]@{ n=[string]$_.Name; s=[string]$_.State; b=(@($_.Bindings.Collection | ForEach-Object { $_.bindingInformation }) -join ', ') } })
    }
    $tasks = @(Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' } | ForEach-Object {
      $i = $_ | Get-ScheduledTaskInfo
      [pscustomobject]@{ n=[string]$_.TaskName; pf=[string]$_.TaskPath; s=[string]$_.State; r=[int64]$i.LastTaskResult; l=$(if ($i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { $i.LastRunTime.ToString('yyyy-MM-dd HH:mm') } else { '' }) }
    })
    $ports = @(Get-NetTCPConnection -State Listen | Where-Object { $_.LocalAddress -ne '127.0.0.1' -and $_.LocalAddress -ne '::1' } | Group-Object LocalPort | ForEach-Object {
      $c = $_.Group[0]; $pp = Get-Process -Id $c.OwningProcess
      [pscustomobject]@{ port=[int]$_.Name; pr=[int]$c.OwningProcess; proc=[string]$pp.ProcessName }
    })
    $shares = @(Get-SmbShare | Where-Object { -not $_.Special -and $_.Name -notmatch '\$$' } | ForEach-Object { [pscustomobject]@{ n=[string]$_.Name; p=[string]$_.Path } })
    $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object { [pscustomobject]@{ n=[string]$_.DeviceID; g=[math]::Round($_.Size/1GB,1); f=[math]::Round($_.FreeSpace/1GB,1) } })
    $pend = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
    $sealB = ''; if ($P -and $P.sealBefehl) { $sealB = [string]$P.sealBefehl }
    $seal = Invoke-SkfSysstatus $sealB
    @{ ok=$true; os=[string]$os.Caption; boot=$os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm'); dienste=$svc; software=$sw; rollen=$rollen; pools=$pools; sites=$sites; aufgaben=$tasks; ports=$ports; freigaben=$shares; platten=$disks; neustartAusstehend=[bool]$pend; seal=$seal } | ConvertTo-Json -Depth 4 -Compress
`

export function inventarAusRoh(host: string, d: Record<string, unknown>): Inventar {
  return {
    host: key(host), am: new Date().toISOString(),
    os: d.os as string, boot: d.boot as string,
    dienste: arr<InvDienst>(d.dienste), software: arr<InvSoftware>(d.software), rollen: arr<string>(d.rollen),
    pools: arr(d.pools), sites: arr(d.sites), aufgaben: arr<InvAufgabe>(d.aufgaben), ports: arr<InvPort>(d.ports),
    freigaben: arr(d.freigaben), platten: arr(d.platten), neustartAusstehend: !!d.neustartAusstehend,
    seal: d.seal && typeof d.seal === 'object' && (d.seal as SealRoh).gefunden ? d.seal as SealRoh : undefined,
  }
}

/** `sealBefehl` = von Hand eingetragener sysstatus-Aufruf (leer = automatisch suchen). */
export async function analysiere(host: string, sealBefehl?: string): Promise<{ ok: boolean; inventar?: Inventar; fehler?: string }> {
  const TAG = '@@SRVANALYSE@@'
  const r = await api().runPowerShell(fern(host, ANALYSE_INNER, TAG, { sealBefehl: (sealBefehl || '').trim() }, 300000), 320000)
  const d = lies<Record<string, unknown>>(r.stdout, TAG)
  if (!d) return { ok: false, fehler: r.timedOut ? 'Zeitüberschreitung bei der Analyse' : kurzFehler(r.stderr) || 'keine Antwort per WinRM' }
  if (d.ok === false) return { ok: false, fehler: kurzFehler(d.fehler as string) }
  const inv = inventarAusRoh(host, d)
  await api().netWriteJsonAsync(invDatei(host), inv).catch(() => false)
  return { ok: true, inventar: inv }
}

// ── 2. Vorschlag ─────────────────────────────────────────────────────────────
/** Automatisch startende Dienste, die regelmäßig von selbst stoppen oder nichts mit dem Server-Zweck zu tun haben. */
const RAUSCHEN = /^(gupdatem?|edgeupdatem?|MicrosoftEdgeElevationService|MozillaMaintenance|sppsvc|RemoteRegistry|MapsBroker|CDPSvc|tiledatamodelsvc|ShellHWDetection|BITS|wuauserv|UsoSvc|DoSvc|TrustedInstaller|WbioSrvc|WinDefend|WdNisSvc|Sense|MDCoreSvc|AdobeARMservice|ClickToRunSvc|GoogleChromeElevationService|sysmain|WaaSMedicSvc|edgeupdate)$/i
/** Windows-eigene Dienste, die für typische Server-Rollen wichtig sind. */
const ROLLEN_DIENSTE = /^(W3SVC|WAS|IISADMIN|DNS|DHCPServer|NTDS|Netlogon|Kdc|DFSR|Dfs|TermService|SQLBrowser|MSDTC|WinRM|Spooler|LanmanServer|SNMP|W32Time|CertSvc|WsusService|MSMQ)$/i
/** Liegt die Programmdatei im Windows-Ordner? Dann ist es ein Windows-Dienst (nicht installierte Software). */
const istWindowsDienst = (p?: string) => /\\windows\\(system32|syswow64|microsoft\.net|servicing)\\|svchost\.exe|\\Windows Defender\\|\\Microsoft\\Edge/i.test(p || '')
const AUFGABE_RAUSCHEN = /GoogleUpdate|MicrosoftEdgeUpdate|Adobe Acrobat Update|OneDrive|User_Feed|npcapwatchdog|CreateExplorerShellUnelevatedTask/i
/** Ergebnisse geplanter Aufgaben, die als „in Ordnung" gelten: 0, läuft, noch nie gelaufen. */
export const AUFGABE_OK = [0, 267009, 267011]

/**
 * ECI DCA (Printanista, früher FMAudit/PrintFleet) überträgt die Zählerstände der Drucker an
 * Hilker & Pahl. Fiel nach dem fehlerhaften Update 1.5.16 unbemerkt aus → wird immer vorgeschlagen
 * (Starttyp Automatisch), auch wenn er gerade NICHT läuft.
 */
export const DCA_DIENST = /ECI\s*DCA|Printanista|FMAudit|PrintFleet/i
export const istDcaDienst = (p: Pick<Pruefpunkt, 'typ' | 'name' | 'anzeige' | 'kennung'>) =>
  p.typ === 'dienst' && (p.kennung === 'dca' || DCA_DIENST.test(`${p.name} ${p.anzeige || ''}`))
export const DCA_AUSFALL = 'Zählerstände der Drucker werden nicht an Hilker & Pahl übertragen — bei Bedarf Kundendienst informieren: 040 41452160 · service@hilkerundpahl.de'

export interface Vorschlag { punkt: Pruefpunkt; vorgeschlagen: boolean; gruppe: string }

/** Aus der Analyse alle möglichen Prüfpunkte bauen; `vorgeschlagen` = vorab angehakt. */
export function baueVorschlag(inv: Inventar): Vorschlag[] {
  const v: Vorschlag[] = []
  const hatRolle = (re: RegExp) => inv.rollen.some(r => re.test(r))
  const dienstVorschlag = new Set<string>()

  for (const d of inv.dienste) {
    const auto = /^auto/i.test(d.m)
    const laeuft = /^running$/i.test(d.s)
    const windows = istWindowsDienst(d.p)
    const dca = DCA_DIENST.test(`${d.n} ${d.d} ${d.p || ''}`)
    let vor = false, hinweis = ''
    if (dca) {
      // Automatisch startend = muss laufen (auch wenn er gerade steht); manuell (z. B. Updater) nur anzeigen
      vor = auto
      hinweis = `ECI DCA – überträgt die Zählerstände der Drucker an Hilker & Pahl${auto && !laeuft ? ' · läuft aktuell NICHT' : ''}${!auto ? ` · Starttyp ${d.m}` : ''}`
    } else if (auto && laeuft && !RAUSCHEN.test(d.n)) {
      if (!windows) { vor = true; hinweis = 'Dienst eines installierten Programms' }
      else if (ROLLEN_DIENSTE.test(d.n)) {
        if (/^Spooler$/i.test(d.n)) { vor = hatRolle(/druck|print/i); hinweis = 'Druckserver-Rolle' }
        else if (/^LanmanServer$/i.test(d.n)) { vor = inv.freigaben.length > 0; hinweis = 'Netzwerkfreigaben' }
        else { vor = true; hinweis = /^WinRM$/i.test(d.n) ? 'nötig für die Überwachung durch das Tool' : 'Dienst einer Server-Rolle' }
      }
    }
    if (vor) dienstVorschlag.add(d.n.toUpperCase())
    v.push({
      gruppe: 'Dienste', vorgeschlagen: vor,
      punkt: { id: `dienst:${d.n}`, typ: 'dienst', name: d.n, anzeige: d.d || d.n, hinweis: hinweis || (auto ? (laeuft ? 'automatisch, läuft' : 'automatisch, läuft aktuell NICHT') : `Starttyp ${d.m}`), stufe: 'kritisch', ...(dca ? { kennung: 'dca' as const } : {}) },
    })
  }

  for (const p of inv.pools) v.push({ gruppe: 'IIS', vorgeschlagen: /started/i.test(p.s), punkt: { id: `apppool:${p.n}`, typ: 'apppool', name: p.n, anzeige: `App-Pool ${p.n}`, stufe: 'kritisch' } })
  for (const s of inv.sites) v.push({ gruppe: 'IIS', vorgeschlagen: /started/i.test(s.s), punkt: { id: `website:${s.n}`, typ: 'website', name: s.n, anzeige: `Website ${s.n}`, hinweis: s.b, stufe: 'kritisch' } })

  // Ports der vorgeschlagenen Dienste (ohne dynamische RPC-Ports) + 80/443 bei IIS (gehören „System"/http.sys)
  const pidZuDienst = new Map<number, InvDienst>()
  for (const d of inv.dienste) if (d.pr && dienstVorschlag.has(d.n.toUpperCase()) && !/svchost/i.test(d.p || '')) pidZuDienst.set(d.pr, d)
  const iis = inv.dienste.some(d => /^W3SVC$/i.test(d.n) && /^running$/i.test(d.s))
  for (const p of inv.ports.slice().sort((a, b) => a.port - b.port)) {
    const d = pidZuDienst.get(p.pr)
    const http = iis && p.pr === 4 && (p.port === 80 || p.port === 443)
    const vor = (!!d || http) && p.port < 49152
    v.push({
      gruppe: 'Ports', vorgeschlagen: vor,
      punkt: { id: `port:${p.port}`, typ: 'port', name: String(p.port), anzeige: `Port ${p.port} lauscht`, zuDienst: d?.n || (http ? 'W3SVC' : undefined), hinweis: d ? `${d.d || d.n} (${p.proc})` : http ? 'IIS (http.sys)' : p.proc, stufe: 'kritisch' },
    })
  }

  for (const t of inv.aufgaben) {
    const rauschen = AUFGABE_RAUSCHEN.test(t.n)
    v.push({
      gruppe: 'Geplante Aufgaben', vorgeschlagen: !rauschen && !/disabled/i.test(t.s),
      punkt: { id: `aufgabe:${t.pf}${t.n}`, typ: 'aufgabe', name: t.n, pfad: t.pf, anzeige: t.n, hinweis: t.l ? `zuletzt ${t.l}` : undefined, stufe: 'hinweis' },
    })
  }
  for (const f of inv.freigaben) v.push({ gruppe: 'Freigaben', vorgeschlagen: true, punkt: { id: `freigabe:${f.n}`, typ: 'freigabe', name: f.n, anzeige: `Freigabe ${f.n}`, hinweis: f.p, stufe: 'kritisch' } })
  for (const p of inv.platten) v.push({ gruppe: 'Einstellungen', vorgeschlagen: true, punkt: { id: `festplatte:${p.n}`, typ: 'festplatte', name: p.n, anzeige: `Laufwerk ${p.n} mind. 10 % frei`, wert: 10, hinweis: `${p.f} von ${p.g} GB frei`, stufe: 'hinweis' } })
  v.push({ gruppe: 'Einstellungen', vorgeschlagen: true, punkt: { id: 'neustart:ausstehend', typ: 'neustart', name: 'ausstehend', anzeige: 'Kein Neustart ausstehend (Updates)', stufe: 'hinweis' } })

  // SEAL Systems (PLOSSYS/DPF): je System aus sysstatus ein Prüfpunkt
  if (inv.seal?.gefunden) {
    const st = inv.seal.roh ? parseSysstatus(inv.seal.roh) : undefined
    v.push({
      gruppe: 'SEAL', vorgeschlagen: true,
      punkt: { id: SEAL_ABFRAGE, typ: 'seal', name: '_abfrage', anzeige: 'SEAL-Statusabfrage (sysstatus) funktioniert', hinweis: inv.seal.fehler ? `bei der Analyse: ${inv.seal.fehler}` : st?.erkannt ? `${st.systeme.length} Systeme${st.gesamt ? ` · ${st.gesamt}` : ''}` : 'Ausgabe bei der Analyse nicht erkannt', stufe: 'kritisch' },
    })
    for (const s of st?.systeme || []) v.push({
      gruppe: 'SEAL', vorgeschlagen: true,
      punkt: { id: `seal:${s.name}`, typ: 'seal', name: s.name, anzeige: `SEAL: ${s.name}`, hinweis: s.laeuft ? `läuft · ${s.zeilen.length} Detailzeile${s.zeilen.length === 1 ? '' : 'n'}` : 'lief bei der Analyse NICHT', stufe: 'kritisch' },
    })
    if (inv.seal.sitwelcome) v.push({
      gruppe: 'SEAL', vorgeschlagen: true,
      punkt: { id: SEAL_TESTAUFRUF, typ: 'seal', name: '_testaufruf', anzeige: 'SEAL-Umgebungsstart ohne Fehlermeldung', hinweis: st?.testaufrufFehler ? `bei der Analyse: ${st.testaufrufFehler}` : 'sitwelcome meldet keinen Fehler', stufe: 'hinweis' },
    })
  }
  return v
}

// ── 3. Prüfung ───────────────────────────────────────────────────────────────
export const PRUEF_INNER = SEAL_PS + String.raw`
    $os = Get-CimInstance Win32_OperatingSystem
    $listen = $null; $iis = $false
    $aus = @()
    # SEAL-Punkte werden nicht einzeln geprüft: sysstatus läuft EINMAL, ausgewertet wird in TypeScript
    $sealP = @(@($P) | Where-Object { $_.typ -eq 'seal' })
    foreach ($c in @(@($P) | Where-Object { $_.typ -ne 'seal' })) {
      $ok = $false; $st = ''; $det = ''
      switch ($c.typ) {
        'dienst' {
          $s = Get-CimInstance Win32_Service -Filter ("Name='" + ($c.name -replace "'", "''") + "'") -ErrorAction SilentlyContinue
          if (-not $s) { $st = 'fehlt' } else { $st = [string]$s.State; $ok = $s.State -eq 'Running'; $det = 'Starttyp ' + $s.StartMode }
        }
        'apppool' {
          if (-not $iis) { Import-Module WebAdministration; $iis = $true }
          $x = Get-Item ('IIS:\AppPools\' + $c.name) -ErrorAction SilentlyContinue
          if (-not $x) { $st = 'fehlt' } else { $st = [string]$x.State; $ok = $st -eq 'Started' }
        }
        'website' {
          if (-not $iis) { Import-Module WebAdministration; $iis = $true }
          $x = Get-Website -Name $c.name -ErrorAction SilentlyContinue
          if (-not $x) { $st = 'fehlt' } else { $st = [string]$x.State; $ok = $st -eq 'Started' }
        }
        'aufgabe' {
          $t = Get-ScheduledTask -TaskPath $c.pfad -TaskName $c.name -ErrorAction SilentlyContinue
          if (-not $t) { $st = 'fehlt' } else {
            $i = $t | Get-ScheduledTaskInfo; $rc = [int64]$i.LastTaskResult
            $st = [string]$t.State
            $ok = ($t.State -ne 'Disabled') -and (@(0, 267009, 267011) -contains $rc)
            $det = ('letztes Ergebnis 0x{0:X}' -f $rc) + $(if ($i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { ' · zuletzt ' + $i.LastRunTime.ToString('dd.MM. HH:mm') } else { '' })
          }
        }
        'port' {
          if ($null -eq $listen) { $listen = @([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | ForEach-Object { [int]$_.Port }) }
          $ok = $listen -contains [int]$c.name; $st = $(if ($ok) { 'lauscht' } else { 'lauscht nicht' })
        }
        'freigabe' { $sh = Get-SmbShare -Name $c.name -ErrorAction SilentlyContinue; $ok = [bool]$sh; $st = $(if ($ok) { 'vorhanden' } else { 'fehlt' }) }
        'festplatte' {
          $d = Get-CimInstance Win32_LogicalDisk -Filter ("DeviceID='" + $c.name + "'") -ErrorAction SilentlyContinue
          if ($d -and $d.Size) { $pz = [math]::Round($d.FreeSpace * 100 / $d.Size); $ok = $pz -ge [int]$c.wert; $st = "$pz % frei"; $det = ('{0:N1} von {1:N1} GB frei' -f ($d.FreeSpace / 1GB), ($d.Size / 1GB)) } else { $st = 'fehlt' }
        }
        'neustart' {
          $pend = (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired')
          $ok = -not $pend; $st = $(if ($pend) { 'Neustart ausstehend' } else { 'keiner ausstehend' })
        }
        'prozess' { $pp = Get-Process -Name $c.name -ErrorAction SilentlyContinue; $ok = [bool]$pp; $st = $(if ($ok) { 'läuft' } else { 'läuft nicht' }) }
      }
      $aus += [pscustomobject]@{ id = [string]$c.id; ok = [bool]$ok; status = [string]$st; detail = [string]$det }
    }
    $seal = $null
    if ($sealP.Count -gt 0) {
      $mb = @($sealP | Where-Object { $_.befehl } | Select-Object -First 1)
      $seal = Invoke-SkfSysstatus $(if ($mb.Count -gt 0) { [string]$mb[0].befehl } else { '' })
    }
    @{ ok = $true; boot = $os.LastBootUpTime.ToString('yyyy-MM-dd HH:mm'); ergebnisse = $aus; seal = $seal } | ConvertTo-Json -Depth 4 -Compress
`

const STATUS_DE: Record<string, string> = {
  running: 'läuft', stopped: 'gestoppt', 'start pending': 'startet gerade', 'stop pending': 'wird gestoppt', paused: 'angehalten',
  started: 'gestartet', stopping: 'wird gestoppt', starting: 'startet gerade', ready: 'bereit', disabled: 'deaktiviert', queued: 'in Warteschlange',
}
export const statusDe = (s: string) => STATUS_DE[(s || '').toLowerCase()] || s
/** Bis so lange nach dem Hochfahren gelten fehlende Dienste als „startet noch" (kein Alarm). */
const ANLAUF_MIN = 10

/** Gegen den Soll-Zustand prüfen und speichern. Nur lesend. */
export async function pruefe(host: string, soll: SollZustand): Promise<IstStand> {
  const TAG = '@@SRVPRUEF@@'
  const am = new Date().toISOString()
  const punkte = soll.punkte.map(p => ({ id: p.id, typ: p.typ, name: p.name, pfad: p.pfad, wert: p.wert, befehl: p.befehl }))
  const mitSeal = soll.punkte.some(p => p.typ === 'seal')
  let ist: IstStand
  if (!punkte.length) ist = { host: key(host), am, erreichbar: true, ergebnisse: [] }
  else {
    // mit SEAL: sysstatus darf bis 120 s (ggf. 2 Versuche) dauern
    const r = await api().runPowerShell(fern(host, PRUEF_INNER, TAG, punkte, mitSeal ? 300000 : 180000), mitSeal ? 320000 : 180000)
    const d = lies<{ ok?: boolean; fehler?: string; boot?: string; ergebnisse?: unknown; seal?: SealRoh | null }>(r.stdout, TAG)
    if (!d || d.ok === false) {
      ist = { host: key(host), am, erreichbar: false, fehler: d?.fehler ? kurzFehler(d.fehler) : r.timedOut ? 'Zeitüberschreitung' : kurzFehler(r.stderr) || 'keine Antwort per WinRM', ergebnisse: [] }
    } else {
      const ergebnisse = arr<PruefErgebnis>(d.ergebnisse).map(e => ({ ...e, status: statusDe(e.status) }))
      const bootMs = d.boot ? new Date(d.boot.replace(' ', 'T')).getTime() : NaN
      ist = { host: key(host), am, erreichbar: true, boot: d.boot, startetNoch: !isNaN(bootMs) && Date.now() - bootMs < ANLAUF_MIN * 60000, ergebnisse }
      if (mitSeal) {
        const s = sealErgebnisse(soll.punkte, d.seal || undefined)
        ist.ergebnisse.push(...s.ergebnisse)
        ist.seal = { gesamt: s.status?.gesamt, neu: s.neu, sysstatus: d.seal?.sysstatus || undefined, befehl: d.seal?.befehl || undefined }
      }
    }
  }
  await api().netWriteJsonAsync(istDatei(host), ist).catch(() => false)
  return ist
}

/** Kritische Prüfpunkte, die gerade NICHT in Ordnung sind. */
export function kritischeFehler(soll: SollZustand, ist: IstStand): Pruefpunkt[] {
  const erg = new Map(ist.ergebnisse.map(e => [e.id, e]))
  return soll.punkte.filter(p => p.stufe === 'kritisch' && erg.get(p.id) && !erg.get(p.id)!.ok)
}

/** schnell = Server mit SEAL-Prüfpunkten → wird alle 5 min geprüft (statt 15). */
export interface Zusammenfassung { gesamt: number; probleme: number; hinweise: number; am: string; erreichbar: boolean; startetNoch?: boolean; schnell?: boolean }
export function fasseZusammen(soll: SollZustand, ist: IstStand): Zusammenfassung {
  const erg = new Map(ist.ergebnisse.map(e => [e.id, e]))
  let probleme = 0, hinweise = 0
  for (const p of soll.punkte) {
    const e = erg.get(p.id)
    if (!e) continue
    if (e.ok) { if (e.warnung) hinweise++; continue }
    if (p.stufe === 'kritisch') probleme++; else hinweise++
  }
  return { gesamt: soll.punkte.length, probleme, hinweise, am: ist.am, erreichbar: ist.erreichbar, startetNoch: ist.startetNoch, schnell: soll.punkte.some(p => p.typ === 'seal') || undefined }
}

// ── 4. Beheben (nur auf Klick) ───────────────────────────────────────────────
export type Aktion = 'start' | 'restart' | 'aktivieren' | 'ausfuehren'

export const AKTION_INNER = String.raw`
    $typ = [string]$P.typ; $n = [string]$P.name; $a = [string]$P.aktion
    try {
      switch ($typ) {
        'dienst' {
          $s = Get-Service -Name $n -ErrorAction Stop
          if ((Get-CimInstance Win32_Service -Filter ("Name='" + ($n -replace "'", "''") + "'")).StartMode -eq 'Disabled') { throw 'Der Dienst ist deaktiviert (Starttyp „Deaktiviert") — bitte bewusst am Server ändern.' }
          if ($a -eq 'restart' -and $s.Status -eq 'Running') {
            # abhängige Dienste merken, die laufen — Restart-Service startet sie nicht von selbst wieder
            $abh = @($s.DependentServices | Where-Object { $_.Status -eq 'Running' } | ForEach-Object { $_.Name })
            Restart-Service -Name $n -Force -ErrorAction Stop
            foreach ($x in $abh) { Start-Service -Name $x -ErrorAction SilentlyContinue }
          } elseif ($s.Status -ne 'Running') { Start-Service -Name $n -ErrorAction Stop }
          $s.WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
          $s.Refresh(); $neu = [string]$s.Status
        }
        'apppool' { Import-Module WebAdministration; if ($a -eq 'restart') { Restart-WebAppPool -Name $n -ErrorAction Stop } else { Start-WebAppPool -Name $n -ErrorAction Stop }; Start-Sleep 2; $neu = [string](Get-WebAppPoolState -Name $n).Value }
        'website' { Import-Module WebAdministration; Start-Website -Name $n -ErrorAction Stop; Start-Sleep 2; $neu = [string](Get-Website -Name $n).State }
        'aufgabe' {
          $t = Get-ScheduledTask -TaskPath ([string]$P.pfad) -TaskName $n -ErrorAction Stop
          if ($a -eq 'aktivieren') { $t | Enable-ScheduledTask -ErrorAction Stop | Out-Null } else { $t | Start-ScheduledTask -ErrorAction Stop }
          Start-Sleep 2; $neu = [string](Get-ScheduledTask -TaskPath ([string]$P.pfad) -TaskName $n).State
        }
        default { throw 'Für diesen Prüfpunkt gibt es keine automatische Behebung.' }
      }
      @{ ok = $true; neu = $neu } | ConvertTo-Json -Compress
    } catch { @{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress }
`

/** Eine Behebung ausführen (nur nach Rückfrage in der Oberfläche aufrufen). */
export async function behebe(host: string, p: Pruefpunkt, aktion: Aktion): Promise<{ ok: boolean; neu?: string; fehler?: string }> {
  const TAG = '@@SRVFIX@@'
  const ziel = p.typ === 'port' && p.zuDienst ? { typ: 'dienst', name: p.zuDienst } : { typ: p.typ, name: p.name, pfad: p.pfad }
  const r = await api().runPowerShell(fern(host, AKTION_INNER, TAG, { ...ziel, aktion }), 150000)
  const d = lies<{ ok?: boolean; neu?: string; fehler?: string }>(r.stdout, TAG)
  if (!d) return { ok: false, fehler: r.timedOut ? 'Zeitüberschreitung' : kurzFehler(r.stderr) || 'keine Antwort per WinRM' }
  return d.ok ? { ok: true, neu: statusDe(d.neu || '') } : { ok: false, fehler: kurzFehler(d.fehler) }
}

/**
 * Ergebniscode einer geplanten Aufgabe in Klartext (aus dem Prüf-Detail „letztes Ergebnis 0x…").
 * `konfig` = Fehler steckt in der Aufgabe selbst (Pfad/Konto/Rechte) — erneut ausführen hilft nicht.
 */
export function aufgabenErgebnis(detail?: string): { code: string; text: string; konfig: boolean } | undefined {
  const m = /letztes Ergebnis 0x([0-9A-F]+)/i.exec(detail || '')
  if (!m) return undefined
  const hex = m[1].toUpperCase().slice(-8).replace(/^0+(?=.)/, '')
  const code = '0x' + hex
  const bekannt: Record<string, [string, boolean]> = {
    '0': ['erfolgreich', false],
    '41301': ['läuft gerade', false],
    '41303': ['ist noch nie gelaufen', false],
    '41306': ['wurde beendet (von Hand oder durch das Zeitlimit der Aufgabe)', false],
    '41325': ['wartet in der Warteschlange', false],
    '8004131F': ['lief schon — eine zweite Instanz wurde nicht gestartet', false],
    'C000013A': ['wurde abgebrochen (z. B. beim Herunterfahren)', false],
    '8007010B': ['Verzeichnisname ungültig — meist steht im Feld „Starten in" der Aktion ein Pfad in Anführungszeichen, den Ordner gibt es nicht (mehr) oder das ausführende Konto kommt nicht dran', true],
    '80070002': ['Datei nicht gefunden — das Programm/Skript der Aktion existiert unter dem Pfad nicht', true],
    '80070003': ['Pfad nicht gefunden — ein Ordner im Programm-/Skriptpfad existiert nicht', true],
    '80070005': ['Zugriff verweigert — das ausführende Konto hat keine Rechte', true],
    '8007052E': ['Anmeldung fehlgeschlagen — Benutzername/Kennwort des ausführenden Kontos stimmt nicht (Kennwort geändert?)', true],
    '80070569': ['dem ausführenden Konto fehlt das Recht „Als Batchauftrag anmelden"', true],
    '8004130F': ['die gespeicherten Kontodaten der Aufgabe fehlen — Kennwort muss neu hinterlegt werden', true],
    '800710E0': ['vom System abgelehnt — meist Bedingungen der Aufgabe oder Kontoeinstellungen', true],
  }
  const b = bekannt[hex]
  if (b) return { code, text: b[0], konfig: b[1] }
  const n = parseInt(hex, 16)
  if (n > 0 && n < 0x10000) return { code, text: `das Programm/Skript endete mit Fehlercode ${n} — Bedeutung hängt vom Programm ab`, konfig: false }
  return { code, text: 'unbekannter Fehlercode — im Verlauf der Aufgabe auf dem Server nachsehen', konfig: false }
}

/** Welche Behebung passt zu einem Prüfpunkt? (leer = keine) */
export function moeglicheAktionen(p: Pruefpunkt, e?: PruefErgebnis): { aktion: Aktion; text: string }[] {
  const laeuft = !!e?.ok
  switch (p.typ) {
    case 'dienst': return laeuft ? [{ aktion: 'restart', text: 'Neu starten' }] : [{ aktion: 'start', text: 'Starten' }, { aktion: 'restart', text: 'Neu starten' }]
    case 'port': return p.zuDienst ? [{ aktion: 'restart', text: `Dienst ${p.zuDienst} neu starten` }] : []
    case 'apppool': return laeuft ? [{ aktion: 'restart', text: 'Recyceln' }] : [{ aktion: 'start', text: 'Starten' }]
    case 'website': return laeuft ? [] : [{ aktion: 'start', text: 'Starten' }]
    case 'aufgabe': return /deaktiviert/i.test(e?.status || '') ? [{ aktion: 'aktivieren', text: 'Aktivieren' }] : [{ aktion: 'ausfuehren', text: 'Jetzt ausführen' }]
    default: return []
  }
}
