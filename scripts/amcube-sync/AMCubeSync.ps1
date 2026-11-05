#Requires -Version 5.1
# AMCubeSync-Version: 1.0.0
<#
.SYNOPSIS
    AMCube-Sync: kopiert die Daten der Chiron-AMCube-Anlagen (3D-Drucker) auf den Server w3294.

.DESCRIPTION
    Einseitig Anlage -> Server. Auf dem Server wird NIE geloescht (kein /MIR, kein /PURGE),
    und eine Datei, die im Ziel neuer ist als auf der Anlage, wird nicht ueberschrieben (/XO).
    Hintergrund: auf den Anlagen wird regelmaessig aufgeraeumt, der Server ist das Archiv.

    Laeuft als geplante Aufgabe (SYSTEM) stuendlich und beim Systemstart. Pro Anlage gilt:
    Ist seit der letzten ERFOLGREICHEN Synchronisation ein Zeitslot (Standard 06:00 und 18:00)
    vergangen, wird synchronisiert. Ist die Anlage nicht erreichbar (TCP 445, 2 s), wird sie
    uebersprungen und beim naechsten stuendlichen Lauf erneut versucht -> automatisches Nachholen.

    Schreiben NUR in <basePath>\<targetRoot>\<Zielordner>. targetRoot ist ausschliesslich
    '02_Serienproduktion_Test' (Testphase) oder '02_Serienproduktion' (produktiv).

    Ablage (Rechte nur SYSTEM + Administratoren): C:\ProgramData\AMCubeSync
      config.json      Konfiguration (Anlagen, Zeitslots, Ziel)   -- ohne Passwort
      status.json      Stand je Anlage (fuer das Admin-Tool)
      verlauf.jsonl    eine Zeile je Lauf und Anlage
      aktionen.jsonl   Protokoll der Aktionen (Einrichten, Auftraege, Passwort gesetzt ...)
      logs\            robocopy-Protokolle + Skript-Protokoll (aelter als logTage werden geloescht)
      auftraege\       manuelle Auftraege vom Admin-Tool (Jetzt ausfuehren, Vergleich ...)
      secret.bin       Passwort von skf1, verschluesselt (DPAPI, LocalMachine)
      schluessel.json  oeffentlicher Schluessel, mit dem das Tool ein neues Passwort verschluesselt

.PARAMETER DryRun
    Nur auflisten, was kopiert wuerde (robocopy /L). Kopiert nichts, aendert keinen Erfolgs-Stand.
.PARAMETER WhatIf
    Wie -DryRun.
.PARAMETER Anlage
    Nur diese Anlage(n), z. B. -Anlage 550-01,550-04
.PARAMETER Erzwingen
    Unabhaengig vom Zeitplan synchronisieren.
.PARAMETER Basis
    Ablageordner (Standard C:\ProgramData\AMCubeSync).
.PARAMETER Jetzt
    Nur fuer Tests: simulierte Uhrzeit (ISO, z. B. 2026-11-05T07:30:00).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File C:\ProgramData\AMCubeSync\AMCubeSync.ps1 -DryRun
#>
param(
    [switch]$DryRun,
    [switch]$WhatIf,
    [string[]]$Anlage = @(),
    [switch]$Erzwingen,
    [string]$Basis = 'C:\ProgramData\AMCubeSync',
    [string]$Jetzt = '',
    # --- nur fuer Tests ohne Server/Anlagen ---
    [switch]$TestOhneFreigabePruefung,
    [switch]$TestOhneAnmeldung,
    [switch]$TestBenutzerSchluessel,
    [string]$TestMutexName = ''
)

$ErrorActionPreference = 'Stop'
$SkriptVersion = '1.0.0'
$TAB = [string][char]9
$Inv = [Globalization.CultureInfo]::InvariantCulture
$Utf8 = New-Object System.Text.UTF8Encoding($false)
if ($WhatIf) { $DryRun = $true }
$Anlage = @($Anlage | ForEach-Object { ([string]$_) -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
$ErlaubteRoots = @('02_Serienproduktion_Test', '02_Serienproduktion')

$P = @{
    Cfg        = Join-Path $Basis 'config.json'
    Status     = Join-Path $Basis 'status.json'
    Verlauf    = Join-Path $Basis 'verlauf.jsonl'
    Aktionen   = Join-Path $Basis 'aktionen.jsonl'
    Logs       = Join-Path $Basis 'logs'
    Auftraege  = Join-Path $Basis 'auftraege'
    Ergebnisse = Join-Path $Basis 'auftraege\ergebnisse'
    Secret     = Join-Path $Basis 'secret.bin'
    PwNeu      = Join-Path $Basis 'passwort.neu'
    Schluessel = Join-Path $Basis 'schluessel.json'
}

# ── Hilfen ───────────────────────────────────────────────────────────────────

function Get-Jetzt { if ($Jetzt) { return [datetime]::Parse($Jetzt, $Inv) }; return Get-Date }
function Get-Iso([datetime]$d) { return $d.ToString('o') }

function Write-SkfLog([string]$text) {
    try {
        $datei = Join-Path $P.Logs ('AMCubeSync_' + (Get-Date).ToString('yyyy-MM') + '.log')
        [IO.File]::AppendAllText($datei, ((Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '  ' + $text + "`r`n"), $Utf8)
    } catch { }
}

function Save-SkfJson([string]$pfad, $obj) {
    $json = ConvertTo-Json -InputObject $obj -Depth 10 -Compress
    try {
        $tmp = $pfad + '.tmp'
        [IO.File]::WriteAllText($tmp, $json, $Utf8)
        if (Test-Path -LiteralPath $pfad) { [IO.File]::Replace($tmp, $pfad, $null) } else { [IO.File]::Move($tmp, $pfad) }
    } catch { try { [IO.File]::WriteAllText($pfad, $json, $Utf8) } catch { } }
}

function Read-SkfJson([string]$pfad) {
    if (-not (Test-Path -LiteralPath $pfad)) { return $null }
    $t = [IO.File]::ReadAllText($pfad).TrimStart([char]0xFEFF)
    if (-not $t.Trim()) { return $null }
    return ($t | ConvertFrom-Json)
}

function Add-SkfZeile([string]$pfad, $obj) {
    try { [IO.File]::AppendAllText($pfad, (ConvertTo-Json -InputObject $obj -Depth 6 -Compress) + "`n", $Utf8) } catch { }
}

function Write-SkfAktion([string]$aktion, [string]$von, $details) {
    Add-SkfZeile $P.Aktionen @{ am = (Get-Iso (Get-Date)); von = $von; aktion = $aktion; details = $details; rechner = $env:COMPUTERNAME; quelle = 'Skript' }
}

# PSCustomObject (aus ConvertFrom-Json) -> Hashtable, damit Felder ergaenzt werden koennen
function ConvertTo-SkfHash($o) {
    if ($null -eq $o) { return $null }
    if ($o -is [System.Management.Automation.PSCustomObject]) {
        $h = @{}
        foreach ($p in $o.PSObject.Properties) { $h[$p.Name] = ConvertTo-SkfHash $p.Value }
        return $h
    }
    if (($o -is [System.Collections.IEnumerable]) -and -not ($o -is [string])) {
        $l = New-Object System.Collections.ArrayList
        foreach ($x in $o) { [void]$l.Add((ConvertTo-SkfHash $x)) }
        return , $l
    }
    return $o
}

function Format-SkfGB([double]$bytes) { return ([math]::Round($bytes / 1GB, 1)).ToString($Inv) }

function Test-SkfPort([string]$h, [int]$port, [int]$ms) {
    $c = New-Object System.Net.Sockets.TcpClient
    try {
        $a = $c.BeginConnect($h, $port, $null, $null)
        if ($a.AsyncWaitHandle.WaitOne($ms) -and $c.Connected) { $c.EndConnect($a); return $true }
        return $false
    } catch { return $false } finally { $c.Close() }
}

function Get-SkfFrei([string]$pfad) {
    $d = New-Object System.IO.DriveInfo([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($pfad)))
    return [int64]$d.AvailableFreeSpace
}

function Get-SkfRobocopy {
    $kand = @()
    if ((-not [Environment]::Is64BitProcess) -and [Environment]::Is64BitOperatingSystem) { $kand += (Join-Path $env:SystemRoot 'Sysnative\robocopy.exe') }
    $kand += (Join-Path $env:SystemRoot 'System32\robocopy.exe')
    foreach ($k in $kand) { if (Test-Path -LiteralPath $k) { return $k } }
    $c = Get-Command robocopy.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}

# ── Netzwerkverbindung zur Anlage (ohne gespeicherte Anmeldedaten, ohne Laufwerksbuchstaben) ──
# WNetAddConnection2 im Prozess: das Passwort taucht in keiner Befehlszeile auf.
if (-not ('SkfNetz' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SkfNetz {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class NETRESOURCE {
        public int dwScope = 0; public int dwType = 1; public int dwDisplayType = 0; public int dwUsage = 0;
        public string lpLocalName = null; public string lpRemoteName = null; public string lpComment = null; public string lpProvider = null;
    }
    [DllImport("mpr.dll", CharSet = CharSet.Unicode)] static extern int WNetAddConnection2(NETRESOURCE nr, string password, string user, int flags);
    [DllImport("mpr.dll", CharSet = CharSet.Unicode)] static extern int WNetCancelConnection2(string name, int flags, bool force);
    public static int Verbinden(string unc, string user, string pw) { NETRESOURCE nr = new NETRESOURCE(); nr.lpRemoteName = unc; return WNetAddConnection2(nr, pw, user, 0); }
    public static int Trennen(string unc) { return WNetCancelConnection2(unc, 0, true); }
}
'@
}

function Get-SkfNetzFehler([int]$code, [string]$wer, [string]$unc) {
    $orig = ''
    try { $orig = (New-Object ComponentModel.Win32Exception($code)).Message } catch { }
    $t = switch ($code) {
        1326 { @('anmeldung', ('Anmeldung mit ' + $wer + ' fehlgeschlagen (Benutzername oder Passwort falsch)')) }
        86   { @('anmeldung', ('Anmeldung mit ' + $wer + ' fehlgeschlagen (Passwort falsch)')) }
        1909 { @('anmeldung', ('Konto ' + $wer + ' ist gesperrt')) }
        1331 { @('anmeldung', ('Konto ' + $wer + ' ist deaktiviert')) }
        1330 { @('anmeldung', ('Passwort von ' + $wer + ' ist abgelaufen')) }
        1907 { @('anmeldung', ('Passwort von ' + $wer + ' muss geaendert werden')) }
        1385 { @('anmeldung', ('Netzwerkanmeldung fuer ' + $wer + ' ist auf der Anlage nicht erlaubt (Richtlinie)')) }
        1327 { @('anmeldung', ('Anmeldung mit ' + $wer + ' durch Kontoeinschraenkung abgelehnt')) }
        53   { @('freigabe', ('Netzwerkpfad ' + $unc + ' nicht gefunden')) }
        67   { @('freigabe', ('Freigabe ' + $unc + ' gibt es auf der Anlage nicht')) }
        1219 { @('anmeldung', ('Zur Anlage besteht bereits eine Verbindung mit anderen Anmeldedaten (' + $unc + ')')) }
        5    { @('zugriff', ('Zugriff auf ' + $unc + ' verweigert')) }
        default { @('netz', ('Verbindung zu ' + $unc + ' fehlgeschlagen (Windows-Fehler ' + $code + ')')) }
    }
    return @{ art = $t[0]; text = $t[1]; code = $code; original = $orig }
}

# ── Passwort: Schluesselpaar (Tool verschluesselt) + DPAPI LocalMachine (Ablage) ──
$PwEntropie = [Text.Encoding]::UTF8.GetBytes('AMCubeSync-skf1')
Add-Type -AssemblyName System.Security
Add-Type -AssemblyName System.Core

function Get-SkfRsa {
    $name = 'AMCubeSync-Passwort'
    if ($TestBenutzerSchluessel) { $name = 'AMCubeSync-Passwort-Test' }
    $prov = [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider
    $open = [System.Security.Cryptography.CngKeyOpenOptions]::MachineKey
    if ($TestBenutzerSchluessel) { $open = [System.Security.Cryptography.CngKeyOpenOptions]::None }
    if ([System.Security.Cryptography.CngKey]::Exists($name, $prov, $open)) {
        $k = [System.Security.Cryptography.CngKey]::Open($name, $prov, $open)
    } else {
        $p = New-Object System.Security.Cryptography.CngKeyCreationParameters
        $p.Provider = $prov
        $p.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::None
        if (-not $TestBenutzerSchluessel) { $p.KeyCreationOptions = [System.Security.Cryptography.CngKeyCreationOptions]::MachineKey }
        $p.Parameters.Add((New-Object System.Security.Cryptography.CngProperty('Length', [BitConverter]::GetBytes([int]2048), [System.Security.Cryptography.CngPropertyOptions]::None)))
        $k = [System.Security.Cryptography.CngKey]::Create([System.Security.Cryptography.CngAlgorithm]::Rsa, $name, $p)
    }
    return New-Object System.Security.Cryptography.RSACng($k)
}

function ConvertTo-SkfB64Url([byte[]]$b) { return [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

function Update-SkfSchluessel($st) {
    try {
        $rsa = Get-SkfRsa
        $pub = $rsa.ExportParameters($false)
        $n = ConvertTo-SkfB64Url $pub.Modulus
        $alt = Read-SkfJson $P.Schluessel
        if (-not $alt -or $alt.n -ne $n) {
            Save-SkfJson $P.Schluessel @{ kty = 'RSA'; n = $n; e = (ConvertTo-SkfB64Url $pub.Exponent); alg = 'RSA-OAEP-256'; erstellt = (Get-Iso (Get-Date)); rechner = $env:COMPUTERNAME }
        }
        $st.schluessel = $true
    } catch { $st.schluessel = $false; $st.schluesselFehler = $_.Exception.Message; Write-SkfLog ('Schluessel: ' + $_.Exception.Message) }
}

function Set-SkfNurAdmins([string]$pfad) {
    if ($TestBenutzerSchluessel) { return }
    try { & (Join-Path $env:SystemRoot 'System32\icacls.exe') $pfad /inheritance:r /grant:r '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null } catch { }
}

# Neues Passwort vom Tool (passwort.neu, mit dem oeffentlichen Schluessel verschluesselt) uebernehmen
function Update-SkfPasswort($st) {
    if (-not (Test-Path -LiteralPath $P.PwNeu)) { return }
    $von = ''
    try {
        $neu = Read-SkfJson $P.PwNeu
        $von = [string]$neu.von
        $rsa = Get-SkfRsa
        $klar = $rsa.Decrypt([Convert]::FromBase64String([string]$neu.daten), [System.Security.Cryptography.RSAEncryptionPadding]::OaepSHA256)
        $geschuetzt = [System.Security.Cryptography.ProtectedData]::Protect($klar, $PwEntropie, [System.Security.Cryptography.DataProtectionScope]::LocalMachine)
        [Array]::Clear($klar, 0, $klar.Length)
        [IO.File]::WriteAllBytes($P.Secret, $geschuetzt)
        Set-SkfNurAdmins $P.Secret
        $st.passwort = @{ gesetztAm = (Get-Iso (Get-Date)); von = $von }
        $st.Remove('passwortFehler')
        Write-SkfLog ('Passwort fuer skf1 neu hinterlegt (von ' + $von + ')')
        Write-SkfAktion 'passwort-gesetzt' $von $null
    } catch {
        $st.passwortFehler = @{ am = (Get-Iso (Get-Date)); text = ('Neues Passwort konnte nicht uebernommen werden: ' + $_.Exception.Message) }
        Write-SkfLog ('Passwort konnte nicht uebernommen werden: ' + $_.Exception.Message)
    } finally { Remove-Item -LiteralPath $P.PwNeu -Force -ErrorAction SilentlyContinue }
}

function Get-SkfPasswort {
    if (-not (Test-Path -LiteralPath $P.Secret)) { return $null }
    $b = [System.Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($P.Secret), $PwEntropie, [System.Security.Cryptography.DataProtectionScope]::LocalMachine)
    $s = [Text.Encoding]::UTF8.GetString($b)
    [Array]::Clear($b, 0, $b.Length)
    return $s
}

# ── Konfiguration + Pfadschutz ───────────────────────────────────────────────

function Read-SkfConfig {
    $c = Read-SkfJson $P.Cfg
    if (-not $c) { throw 'config.json fehlt' }
    foreach ($f in @('basePath', 'targetRoot', 'benutzer')) { if (-not $c.$f) { throw ('config.json: Feld ' + $f + ' fehlt') } }
    if ($ErlaubteRoots -notcontains [string]$c.targetRoot) { throw ('config.json: targetRoot "' + $c.targetRoot + '" ist nicht erlaubt') }
    if (-not $c.shareName) { $c | Add-Member -NotePropertyName shareName -NotePropertyValue 'Chiron' -Force }
    if (-not $c.slots) { $c | Add-Member -NotePropertyName slots -NotePropertyValue @('06:00', '18:00') -Force }
    if (-not $c.minFreeGB) { $c | Add-Member -NotePropertyName minFreeGB -NotePropertyValue 10 -Force }
    if (-not $c.logTage) { $c | Add-Member -NotePropertyName logTage -NotePropertyValue 90 -Force }
    return $c
}

# Liefert <basePath>\<root>\<zielordner> — und NUR das. Alles andere wirft.
function Get-SkfZiel($cfg, $a, [string]$root = '') {
    if (-not $root) { $root = [string]$cfg.targetRoot }
    if ($ErlaubteRoots -notcontains $root) { throw ('Zielstamm "' + $root + '" ist nicht erlaubt') }
    $name = [string]$a.zielordner
    if (-not ($name -match '^[A-Za-z0-9][A-Za-z0-9 ._-]*$') -or $name.Contains('..')) { throw ('Zielordner "' + $name + '" ist ungueltig') }
    $basis = [IO.Path]::GetFullPath([string]$cfg.basePath).TrimEnd('\')
    $rootPfad = $basis + '\' + $root
    $ziel = [IO.Path]::GetFullPath($rootPfad + '\' + $name)
    if (-not $ziel.StartsWith($rootPfad + '\', [StringComparison]::OrdinalIgnoreCase) -or $ziel.Substring($rootPfad.Length + 1).Contains('\')) { throw 'Zielpfad verlaesst den erlaubten Bereich' }
    return $ziel
}

function Test-SkfTeilpfad([string]$p) {
    if (-not $p) { return $false }
    if ($p -match '[/:*?"<>|]' -or $p.StartsWith('\') -or $p.EndsWith('\')) { return $false }
    foreach ($t in $p.Split('\')) { if (-not $t -or $t -eq '.' -or $t -eq '..') { return $false } }
    return $true
}

# Quellen einer Anlage: Hauptordner -> Zielordner, aktive Zusatzordner -> Zielordner\<Name>
function Get-SkfQuellen($a, [string]$ziel) {
    $wurzel = '\\' + [string]$a.ip + '\' + [string]$a.freigabe
    $l = @()
    if (-not (Test-SkfTeilpfad ([string]$a.quellordner))) { throw ('Quellordner "' + $a.quellordner + '" ist ungueltig') }
    $l += , @{ q = ($wurzel + '\' + [string]$a.quellordner); z = $ziel; haupt = $true }
    foreach ($zo in @($a.zusatzordner)) {
        if (-not $zo -or -not $zo.aktiv) { continue }
        $qo = [string]$zo.quellordner
        if (-not (Test-SkfTeilpfad $qo)) { throw ('Zusatzordner "' + $qo + '" ist ungueltig') }
        $blatt = $qo.Split('\')[-1]
        $l += , @{ q = ($wurzel + '\' + $qo); z = ($ziel + '\' + $blatt); haupt = $false }
    }
    return , $l
}

function Test-SkfFreigabe($cfg, $st) {
    $st.server = @{ freigabeOk = $true; freigabeFehler = ''; freiBytes = $null; minFreeGB = $cfg.minFreeGB; geprueftAm = (Get-Iso (Get-Date)) }
    try { $st.server.freiBytes = Get-SkfFrei ([string]$cfg.basePath) } catch { }
    if ($TestOhneFreigabePruefung) { return $true }
    try {
        $s = Get-SmbShare -Name ([string]$cfg.shareName) -ErrorAction Stop
        $ist = ([string]$s.Path).TrimEnd('\')
        $soll = ([string]$cfg.basePath).TrimEnd('\')
        if ($ist -ne $soll) {
            $st.server.freigabeOk = $false
            $st.server.freigabeFehler = ('Freigabe "' + $cfg.shareName + '" zeigt auf ' + $ist + ', in der Konfiguration steht ' + $soll + ' - Sync abgebrochen, bitte Konfiguration pruefen')
        }
    } catch {
        $st.server.freigabeOk = $false
        $st.server.freigabeFehler = ('Freigabe "' + $cfg.shareName + '" nicht gefunden (' + $_.Exception.Message + ') - Sync abgebrochen')
    }
    if (-not $st.server.freigabeOk) { Write-SkfLog $st.server.freigabeFehler }
    return [bool]$st.server.freigabeOk
}

# ── Zeitplan ─────────────────────────────────────────────────────────────────

function Get-SkfLetzterSlot([datetime]$jetzt, $slots) {
    $best = $null
    foreach ($tag in 0, 1) {
        foreach ($s in @($slots)) {
            $t = [datetime]::ParseExact([string]$s, 'HH:mm', $Inv)
            $d = $jetzt.Date.AddDays(-$tag).Add($t.TimeOfDay)
            if ($d -le $jetzt -and ($null -eq $best -or $d -gt $best)) { $best = $d }
        }
    }
    return $best
}

function Test-SkfFaellig($s, [datetime]$jetzt, $cfg) {
    if (-not $s.letzterErfolg) { return $true }
    if ([string]$s.letzterErfolgZiel -ne [string]$cfg.targetRoot) { return $true }
    $slot = Get-SkfLetzterSlot $jetzt $cfg.slots
    if ($null -eq $slot) { return $false }
    return ([datetime]::Parse([string]$s.letzterErfolg, $Inv) -lt $slot)
}

# ── robocopy ─────────────────────────────────────────────────────────────────

function ConvertTo-SkfArg([string]$s) { return '"' + ($s -replace '\\+$', '') + '"' }

function Invoke-SkfRobo([string]$exe, [string]$quelle, [string]$ziel, [string[]]$schalter, [string]$log, $st) {
    $argStr = (ConvertTo-SkfArg $quelle) + ' ' + (ConvertTo-SkfArg $ziel) + ' ' + ($schalter -join ' ') + ' ' + (ConvertTo-SkfArg ('/UNILOG:' + $log))
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exe; $psi.Arguments = $argStr; $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $outT = $p.StandardOutput.ReadToEndAsync(); $errT = $p.StandardError.ReadToEndAsync()
    $leser = $null; $zeilen = 0; $basisK = 0
    if ($st -and $st.laeuft) { $basisK = [int64]$st.laeuft.kopiert }
    while (-not $p.WaitForExit(5000)) {
        if (-not $leser -and (Test-Path -LiteralPath $log)) {
            try {
                $fs = New-Object System.IO.FileStream($log, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
                $leser = New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::Unicode, $true)
            } catch { $leser = $null }
        }
        if ($leser) { try { while ($null -ne ($z = $leser.ReadLine())) { if ($z.StartsWith($TAB) -and $z.Contains('\')) { $zeilen++ } } } catch { } }
        if ($st -and $st.laeuft) { $st.laeuft.kopiert = $basisK + $zeilen; $st.laeuft.aktualisiert = (Get-Iso (Get-Date)); Save-SkfJson $P.Status $st }
    }
    try { [void]$p.WaitForExit(15000) } catch { }
    if ($leser) { try { $leser.Close() } catch { } }
    $rc = 16; try { $rc = [int]$p.ExitCode } catch { }
    $aus = ''; try { $aus = [string]$outT.Result + [string]$errT.Result } catch { }
    return @{ rc = $rc; aus = $aus; zeilen = $zeilen }
}

# Zusammenfassung (Dateien/Bytes) + Fehlerzeilen "FEHLER 5 (0x00000005) ... <Pfad>" + Folgezeile
function Read-SkfRoboLog([string]$log, [string]$aus) {
    $r = @{ dateien = $null; bytes = $null; fehler = (New-Object System.Collections.ArrayList); fehlerAnzahl = 0; allgemein = (New-Object System.Collections.ArrayList) }
    $zeilen = @()
    if ($log -and (Test-Path -LiteralPath $log)) { try { $zeilen = [IO.File]::ReadAllLines($log) } catch { } }
    if ($aus) { $zeilen = @($zeilen) + @($aus -split '\r?\n') }
    $summen = New-Object System.Collections.ArrayList
    $gesehen = @{}
    $allg = New-Object System.Collections.ArrayList
    for ($i = 0; $i -lt $zeilen.Count; $i++) {
        $z = [string]$zeilen[$i]
        $m = [regex]::Match($z, '^\s*[^\d\s:][^:]*:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$')
        if ($m.Success) { [void]$summen.Add(@([int64]$m.Groups[1].Value, [int64]$m.Groups[2].Value, [int64]$m.Groups[3].Value, [int64]$m.Groups[4].Value, [int64]$m.Groups[5].Value, [int64]$m.Groups[6].Value)); continue }
        $m = [regex]::Match($z, '\s(\d{1,5})\s+\(0x[0-9A-Fa-f]{8}\)\s*(.*)$')
        if ($m.Success) {
            $rest = $m.Groups[2].Value.Trim()
            $key = $m.Groups[1].Value + '|' + $rest
            if (-not $gesehen.ContainsKey($key)) {
                $gesehen[$key] = $true
                $r.fehlerAnzahl++
                if ($r.fehler.Count -lt 20) {
                    $pfad = ''; $aktion = $rest
                    $pm = [regex]::Match($rest, '(\\\\.+|[A-Za-z]:\\.*)$')
                    if ($pm.Success) { $pfad = $pm.Groups[1].Value.Trim(); $aktion = $rest.Substring(0, $pm.Index).Trim() }
                    $text = ''; if ($i + 1 -lt $zeilen.Count) { $text = ([string]$zeilen[$i + 1]).Trim() }
                    [void]$r.fehler.Add(@{ code = [int]$m.Groups[1].Value; aktion = $aktion; pfad = $pfad; text = $text })
                }
            }
            continue
        }
        $m = [regex]::Match($z, '^\s*(\*+\s*)?(ERROR|FEHLER)\s*:\s*(.+)$', 'IgnoreCase')
        if ($m.Success -and $allg.Count -lt 5) { [void]$allg.Add($m.Groups[3].Value.Trim()) }
    }
    if ($r.fehler.Count -eq 0) { foreach ($a in $allg) { [void]$r.allgemein.Add($a) } }
    if ($summen.Count -ge 2) { $r.dateien = $summen[1] }
    if ($summen.Count -ge 3) { $r.bytes = $summen[2] }
    return $r
}

function Get-SkfSchalter($cfg, [bool]$dry) {
    $rb = $cfg.robocopy
    $retries = 2; $wait = 10; $threads = 8
    if ($rb) { if ($rb.retries -ne $null) { $retries = [int]$rb.retries }; if ($rb.wait -ne $null) { $wait = [int]$rb.wait }; if ($rb.threads) { $threads = [int]$rb.threads } }
    # Einseitig, nie loeschen: /E (kein /MIR, kein /PURGE), /XO (im Ziel neuere Dateien bleiben)
    $s = @('/E', '/Z', '/FFT', '/XO', ('/R:' + $retries), ('/W:' + $wait), '/NP', '/XJ', ('/MT:' + $threads), '/NDL', '/FP', '/BYTES')
    if ($dry) { $s += '/L' }
    return , $s
}

# ── Verbindung je Anlage (mit Aufraeumen) ────────────────────────────────────

function Connect-SkfAnlage($cfg, $a) {
    $wurzel = '\\' + [string]$a.ip + '\' + [string]$a.freigabe
    if ($TestOhneAnmeldung) { return @{ ok = $true; wurzel = $wurzel; verbunden = $false } }
    $pw = Get-SkfPasswort
    if (-not $pw) { return @{ ok = $false; wurzel = $wurzel; fehler = @{ art = 'kein_passwort'; text = 'Kein Passwort fuer skf1 hinterlegt (im Admin-Tool unter Bearbeiten setzen)'; code = 0; original = '' } } }
    $wer = [string]$a.hostname + '\' + [string]$cfg.benutzer
    [void][SkfNetz]::Trennen($wurzel)
    $rc = [SkfNetz]::Verbinden($wurzel, $wer, $pw)
    $pw = $null
    if ($rc -ne 0) { return @{ ok = $false; wurzel = $wurzel; fehler = (Get-SkfNetzFehler $rc $wer $wurzel) } }
    return @{ ok = $true; wurzel = $wurzel; verbunden = $true }
}
function Disconnect-SkfAnlage($v) { if ($v -and $v.verbunden) { try { [void][SkfNetz]::Trennen($v.wurzel) } catch { } } }

function Get-SkfAnlageStatus($st, $a) {
    $id = [string]$a.id
    if (-not $st.anlagen.ContainsKey($id)) { $st.anlagen[$id] = @{ id = $id } }
    $s = $st.anlagen[$id]
    $s.name = [string]$a.name; $s.hostname = [string]$a.hostname; $s.ip = [string]$a.ip; $s.aktiv = [bool]$a.aktiv; $s.zielordner = [string]$a.zielordner
    return $s
}

function Get-SkfSicherName([string]$s) { return ($s -replace '[^A-Za-z0-9._-]', '_') }

# ── Eine Anlage synchronisieren ──────────────────────────────────────────────
# Liefert den Verlaufseintrag (oder $null, wenn nicht faellig).
function Invoke-SkfAnlage($cfg, $a, $st, [hashtable]$o) {
    $s = Get-SkfAnlageStatus $st $a
    $jetzt = Get-Jetzt
    if (-not $o.erzwingen -and -not (Test-SkfFaellig $s $jetzt $cfg)) { return $null }
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $e = @{ runId = $o.runId; anlage = [string]$a.id; start = (Get-Iso $jetzt); ergebnis = ''; kopiert = 0; bytes = 0; rc = $null; dryRun = [bool]$o.dryRun; ausloeser = $o.ausloeser; ziel = [string]$cfg.targetRoot; fehler = $null; log = '' }
    $v = $null
    $fehler = $null
    try {
        if (-not $o.dryRun) { $s.letzterVersuch = $e.start }
        $st.laeuft.anlage = [string]$a.id; $st.laeuft.kopiert = 0; Save-SkfJson $P.Status $st
        $ziel = Get-SkfZiel $cfg $a
        if (-not $a.ip) { throw 'Keine IP-Adresse eingetragen' }
        $erreichbar = Test-SkfPort ([string]$a.ip) 445 2000
        $s.erreichbar = $erreichbar; $s.geprueftAm = (Get-Iso (Get-Date))
        if (-not $erreichbar) {
            $e.ergebnis = 'nicht_erreichbar'
            if (-not $o.dryRun) { $s.ergebnis = 'nicht_erreichbar' }
            Write-SkfLog ($a.id + ': nicht erreichbar (TCP 445) - wird beim naechsten Lauf erneut versucht')
            return $e
        }
        $frei = Get-SkfFrei ([string]$cfg.basePath)
        $minB = [int64]([double]$cfg.minFreeGB * 1GB)
        if (-not $o.dryRun -and $frei -lt $minB) {
            $fehler = @{ art = 'platz'; text = ('Zielordner voll, nur noch ' + (Format-SkfGB $frei) + ' GB frei (Minimum ' + $cfg.minFreeGB + ' GB)'); code = 112; original = '' }
            return $e
        }
        $v = Connect-SkfAnlage $cfg $a
        if (-not $v.ok) { $fehler = $v.fehler; return $e }
        $quellen = Get-SkfQuellen $a $ziel
        if (-not (Test-Path -LiteralPath $quellen[0].q)) {
            $fehler = @{ art = 'quelle'; text = ('Quellordner ' + $quellen[0].q + ' nicht gefunden'); code = 3; original = '' }
            return $e
        }
        $exe = Get-SkfRobocopy
        if (-not $exe) { throw 'robocopy.exe nicht gefunden' }
        $id = Get-SkfSicherName ([string]$a.id)
        # Erster Lauf in dieses Ziel: vorher Speicherbedarf ermitteln (robocopy /L) und gegen den freien Platz pruefen
        if (-not $o.dryRun -and ((-not $s.letzterErfolg) -or ([string]$s.letzterErfolgZiel -ne [string]$cfg.targetRoot))) {
            $bedarf = [int64]0; $n = 0
            foreach ($q in $quellen) {
                $n++
                $vlog = Join-Path $P.Logs ($o.runId + '_' + $id + '_bedarf' + $n + '.log')
                [void](Invoke-SkfRobo $exe $q.q $q.z ((Get-SkfSchalter $cfg $true) + @('/NFL', '/NJH')) $vlog $null)
                $l = Read-SkfRoboLog $vlog ''
                if ($l.bytes) { $bedarf += [int64]$l.bytes[1] }
            }
            if ($bedarf + $minB -gt $frei) {
                $fehler = @{ art = 'platz'; text = ('Zu wenig Speicher fuer den ersten Lauf: benoetigt ' + (Format-SkfGB $bedarf) + ' GB, frei ' + (Format-SkfGB $frei) + ' GB (Minimum ' + $cfg.minFreeGB + ' GB muss frei bleiben) - nicht gestartet'); code = 112; original = '' }
                return $e
            }
        }
        if (-not $o.dryRun -and -not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Force -Path $ziel | Out-Null }
        $rcMax = 0; $n = 0; $ersterFehler = $null; $fehlerAnzahl = 0; $logs = @()
        foreach ($q in $quellen) {
            $n++
            if (-not $q.haupt -and -not (Test-Path -LiteralPath $q.q)) { Write-SkfLog ($a.id + ': Zusatzordner ' + $q.q + ' nicht vorhanden - uebersprungen'); continue }
            $log = Join-Path $P.Logs ($o.runId + '_' + $id + '_' + $n + '.log'); $logs += $log
            $r = Invoke-SkfRobo $exe $q.q $q.z (Get-SkfSchalter $cfg ([bool]$o.dryRun)) $log $st
            $l = Read-SkfRoboLog $log $r.aus
            if ($l.dateien) { $e.kopiert += [int64]$l.dateien[1] }
            if ($l.bytes) { $e.bytes += [int64]$l.bytes[1] }
            if ($r.rc -gt $rcMax) { $rcMax = $r.rc }
            $fehlerAnzahl += $l.fehlerAnzahl
            if (-not $ersterFehler -and $l.fehler.Count -gt 0) { $ersterFehler = $l.fehler[0] }
            if (-not $ersterFehler -and $l.allgemein.Count -gt 0) { $ersterFehler = @{ code = 0; aktion = ''; pfad = ''; text = $l.allgemein[0] } }
        }
        $e.rc = $rcMax; $e.log = ($logs | Select-Object -First 1)
        if ($rcMax -ge 8) {
            $t = 'Robocopy-Fehler ' + $rcMax
            if ($ersterFehler) { $t += ': ' + $ersterFehler.text; if ($ersterFehler.pfad) { $t += ' (' + $ersterFehler.pfad + ')' } }
            if ($fehlerAnzahl -gt 1) { $t += ' - insgesamt ' + $fehlerAnzahl + ' Fehler' }
            $orig = ''; if ($ersterFehler) { $orig = ([string]$ersterFehler.aktion + ' ' + [string]$ersterFehler.pfad).Trim() }
            $code = 0; if ($ersterFehler) { $code = [int]$ersterFehler.code }
            $fehler = @{ art = 'robocopy'; text = $t; code = $code; rc = $rcMax; original = $orig; anzahl = $fehlerAnzahl }
            return $e
        }
        $e.ergebnis = 'ok'
        return $e
    } catch {
        $fehler = @{ art = 'skript'; text = $_.Exception.Message; code = 0; original = ($_.InvocationInfo.PositionMessage) }
        return $e
    } finally {
        Disconnect-SkfAnlage $v
        $sw.Stop()
        $e.ende = (Get-Iso (Get-Jetzt)); $e.dauerSek = [int]$sw.Elapsed.TotalSeconds
        if ($fehler) {
            $fehler.am = $e.start; $fehler.log = $e.log
            $e.ergebnis = 'fehler'; $e.fehler = $fehler.text; $e.fehlerArt = $fehler.art; $e.code = $fehler.code
        }
        if ($o.dryRun) {
            $s.probelauf = @{ am = $e.start; ergebnis = $e.ergebnis; wuerdeKopieren = $e.kopiert; bytes = $e.bytes; rc = $e.rc; fehler = $fehler; log = $e.log }
        } elseif ($e.ergebnis -eq 'ok') {
            $s.letzterErfolg = $e.start; $s.letzterErfolgZiel = [string]$cfg.targetRoot
            $s.ergebnis = 'ok'; $s.fehler = $null
            $s.kopiert = $e.kopiert; $s.bytes = $e.bytes; $s.rc = $e.rc; $s.dauerSek = $e.dauerSek; $s.log = $e.log
        } elseif ($e.ergebnis -eq 'fehler') {
            # Fehler bleibt stehen, bis ein Folgelauf erfolgreich war
            $s.ergebnis = 'fehler'; $s.fehler = $fehler; $s.rc = $e.rc; $s.log = $e.log
        }
        if ($e.ergebnis -and $e.ergebnis -ne '') {
            Add-SkfZeile $P.Verlauf $e
            Write-SkfLog ($a.id + ': ' + $e.ergebnis + $(if ($o.dryRun) { ' (Probelauf)' } else { '' }) + ', ' + $e.kopiert + ' Dateien, ' + (Format-SkfGB $e.bytes) + ' GB, rc=' + $e.rc + $(if ($fehler) { ' - ' + $fehler.text } else { '' }))
        }
        $st.laeuft.anlage = ''
        Save-SkfJson $P.Status $st
    }
}

# ── Auftraege: Pruefen, Groesse, Vergleich Test <-> Produktiv ────────────────

function Test-SkfAnlagen($cfg, $st, [string[]]$nur) {
    $out = @()
    foreach ($a in @($cfg.anlagen)) {
        if ($nur.Count -and $nur -notcontains [string]$a.id) { continue }
        $s = Get-SkfAnlageStatus $st $a
        $r = @{ id = [string]$a.id; aktiv = [bool]$a.aktiv; erreichbar = $false; anmeldung = ''; quelleDa = $false; fehler = $null }
        if (-not $a.ip) { $r.fehler = @{ art = 'konfig'; text = 'Keine IP-Adresse eingetragen' }; $out += , $r; continue }
        $r.erreichbar = Test-SkfPort ([string]$a.ip) 445 2000
        $s.erreichbar = $r.erreichbar; $s.geprueftAm = (Get-Iso (Get-Date))
        if ($r.erreichbar) {
            $v = Connect-SkfAnlage $cfg $a
            try {
                if ($v.ok) {
                    $r.anmeldung = 'ok'
                    try { $r.quelleDa = Test-Path -LiteralPath ((Get-SkfQuellen $a (Get-SkfZiel $cfg $a))[0].q) } catch { $r.fehler = @{ art = 'konfig'; text = $_.Exception.Message } }
                } else { $r.anmeldung = $v.fehler.art; $r.fehler = $v.fehler }
            } finally { Disconnect-SkfAnlage $v }
        }
        $out += , $r
    }
    return , $out
}

function Get-SkfGroesse($cfg, $st, [string[]]$nur) {
    $exe = Get-SkfRobocopy
    $frei = Get-SkfFrei ([string]$cfg.basePath)
    $minB = [int64]([double]$cfg.minFreeGB * 1GB)
    $liste = @(); $summe = [int64]0
    foreach ($a in @($cfg.anlagen)) {
        if (-not $a.aktiv) { continue }
        if ($nur.Count -and $nur -notcontains [string]$a.id) { continue }
        $r = @{ id = [string]$a.id; erreichbar = $false; gesamtBytes = 0; zuKopierenBytes = 0; dateien = 0; zuKopierenDateien = 0; fehler = $null }
        if ($a.ip -and (Test-SkfPort ([string]$a.ip) 445 2000)) {
            $r.erreichbar = $true
            $v = Connect-SkfAnlage $cfg $a
            try {
                if (-not $v.ok) { $r.fehler = $v.fehler }
                else {
                    $n = 0
                    foreach ($q in (Get-SkfQuellen $a (Get-SkfZiel $cfg $a))) {
                        $n++
                        if (-not (Test-Path -LiteralPath $q.q)) { continue }
                        $vlog = Join-Path $P.Logs ('groesse_' + (Get-SkfSicherName ([string]$a.id)) + '_' + $n + '.log')
                        [void](Invoke-SkfRobo $exe $q.q $q.z ((Get-SkfSchalter $cfg $true) + @('/NFL', '/NJH')) $vlog $null)
                        $l = Read-SkfRoboLog $vlog ''
                        if ($l.bytes) { $r.gesamtBytes += [int64]$l.bytes[0]; $r.zuKopierenBytes += [int64]$l.bytes[1] }
                        if ($l.dateien) { $r.dateien += [int64]$l.dateien[0]; $r.zuKopierenDateien += [int64]$l.dateien[1] }
                        Remove-Item -LiteralPath $vlog -Force -ErrorAction SilentlyContinue
                    }
                    $summe += $r.zuKopierenBytes
                }
            } catch { $r.fehler = @{ art = 'skript'; text = $_.Exception.Message } } finally { Disconnect-SkfAnlage $v }
        } else { $r.fehler = @{ art = 'nicht_erreichbar'; text = 'Anlage nicht erreichbar' } }
        $liste += , $r
    }
    return @{ anlagen = $liste; freiBytes = $frei; minFreeBytes = $minB; zuKopierenBytes = $summe; reicht = (($summe + $minB) -le $frei) }
}

function Get-SkfDateiListe([string]$pfad) {
    $h = @{}
    if (-not [IO.Directory]::Exists($pfad)) { return $null }
    $basisLen = $pfad.TrimEnd('\').Length + 1
    $stapel = New-Object System.Collections.Stack
    $stapel.Push($pfad)
    while ($stapel.Count -gt 0) {
        $d = $stapel.Pop()
        try { foreach ($u in [IO.Directory]::EnumerateDirectories($d)) { $stapel.Push($u) } } catch { }
        try {
            foreach ($f in (New-Object IO.DirectoryInfo($d)).EnumerateFiles()) {
                $h[$f.FullName.Substring($basisLen).ToLowerInvariant()] = @($f.FullName.Substring($basisLen), [int64]$f.Length, $f.LastWriteTimeUtc)
            }
        } catch { }
    }
    return $h
}

# Nur lesend: listet je Anlage Unterschiede zwischen Test- und Produktivordner
function Compare-SkfTestProd($cfg, [string[]]$nur) {
    $out = @()
    $max = 200
    foreach ($a in @($cfg.anlagen)) {
        if ($nur.Count -and $nur -notcontains [string]$a.id) { continue }
        if (-not $a.zielordner) { continue }
        $r = @{ id = [string]$a.id; aktiv = [bool]$a.aktiv; testPfad = ''; prodPfad = ''; testDa = $false; prodDa = $false; nurTest = 0; nurProd = 0; unterschiedlich = 0; gleich = 0; listeNurTest = @(); listeNurProd = @(); listeUnterschied = @(); fehler = '' }
        try {
            $r.testPfad = Get-SkfZiel $cfg $a '02_Serienproduktion_Test'
            $r.prodPfad = Get-SkfZiel $cfg $a '02_Serienproduktion'
            $t = Get-SkfDateiListe $r.testPfad; $p = Get-SkfDateiListe $r.prodPfad
            $r.testDa = $null -ne $t; $r.prodDa = $null -ne $p
            if (-not $t) { $t = @{} }; if (-not $p) { $p = @{} }
            $nt = New-Object System.Collections.ArrayList; $np = New-Object System.Collections.ArrayList; $nu = New-Object System.Collections.ArrayList
            foreach ($k in $t.Keys) {
                $x = $t[$k]
                if (-not $p.ContainsKey($k)) { $r.nurTest++; if ($nt.Count -lt $max) { [void]$nt.Add($x[0]) }; continue }
                $y = $p[$k]
                $zeitDiff = [math]::Abs(($x[2] - $y[2]).TotalSeconds)
                if ($x[1] -ne $y[1] -or $zeitDiff -gt 2) {
                    $r.unterschiedlich++
                    if ($nu.Count -lt $max) { [void]$nu.Add(@{ p = $x[0]; testGroesse = $x[1]; prodGroesse = $y[1]; testZeit = (Get-Iso $x[2].ToLocalTime()); prodZeit = (Get-Iso $y[2].ToLocalTime()) }) }
                } else { $r.gleich++ }
            }
            foreach ($k in $p.Keys) { if (-not $t.ContainsKey($k)) { $r.nurProd++; if ($np.Count -lt $max) { [void]$np.Add($p[$k][0]) } } }
            $r.listeNurTest = @($nt | Sort-Object); $r.listeNurProd = @($np | Sort-Object); $r.listeUnterschied = @($nu)
        } catch { $r.fehler = $_.Exception.Message }
        $out += , $r
    }
    return , $out
}

function Get-SkfAuftraege {
    if (-not (Test-Path -LiteralPath $P.Auftraege)) { return @() }
    return @(Get-ChildItem -LiteralPath $P.Auftraege -Filter '*.json' -File | Sort-Object Name)
}

function Invoke-SkfAuftrag($datei, $st) {
    $a = $null
    try { $a = Read-SkfJson $datei.FullName } catch { }
    Remove-Item -LiteralPath $datei.FullName -Force -ErrorAction SilentlyContinue
    if (-not $a -or -not $a.id) { return }
    $id = Get-SkfSicherName ([string]$a.id)
    $erg = @{ id = [string]$a.id; art = [string]$a.art; von = [string]$a.von; start = (Get-Iso (Get-Date)); ende = $null; ok = $true; fehler = ''; daten = $null }
    $nur = @($a.anlagen | Where-Object { $_ } | ForEach-Object { [string]$_ })
    Write-SkfLog ('Auftrag ' + $a.art + ' von ' + $a.von + $(if ($nur.Count) { ' (' + ($nur -join ', ') + ')' } else { '' }))
    Write-SkfAktion ('auftrag-' + $a.art) ([string]$a.von) @{ anlagen = $nur; dryRun = [bool]$a.dryRun }
    try {
        $cfg = Read-SkfConfig
        switch ([string]$a.art) {
            'sync' {
                if (-not (Test-SkfFreigabe $cfg $st)) { throw $st.server.freigabeFehler }
                $runId = (Get-Date).ToString('yyyyMMdd-HHmmss') + $(if ($a.dryRun) { '-probe' } else { '-manuell' })
                $liste = @()
                foreach ($an in @($cfg.anlagen)) {
                    if ($nur.Count -and $nur -notcontains [string]$an.id) { continue }
                    if (-not $an.aktiv) { continue }
                    $x = Invoke-SkfAnlage $cfg $an $st @{ erzwingen = $true; dryRun = [bool]$a.dryRun; ausloeser = ('manuell:' + $a.von); runId = $runId }
                    if ($x) { $liste += , $x }
                }
                $erg.daten = $liste
            }
            'pruefen' { $erg.daten = Test-SkfAnlagen $cfg $st $nur }
            'groesse' { $erg.daten = Get-SkfGroesse $cfg $st $nur }
            'vergleich' { $erg.daten = Compare-SkfTestProd $cfg $nur }
            'schluessel' { $erg.daten = @{ schluessel = [bool]$st.schluessel } }
            default { throw ('Unbekannter Auftrag ' + $a.art) }
        }
    } catch { $erg.ok = $false; $erg.fehler = $_.Exception.Message; Write-SkfLog ('Auftrag fehlgeschlagen: ' + $_.Exception.Message) }
    $erg.ende = (Get-Iso (Get-Date))
    Save-SkfJson (Join-Path $P.Ergebnisse ($id + '.json')) $erg
}

function Clear-SkfAlt($cfg) {
    $grenze = (Get-Date).AddDays(-[int]$cfg.logTage)
    try { Get-ChildItem -LiteralPath $P.Logs -File | Where-Object { $_.LastWriteTime -lt $grenze } | Remove-Item -Force -ErrorAction SilentlyContinue } catch { }
    try { Get-ChildItem -LiteralPath $P.Ergebnisse -File | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item -Force -ErrorAction SilentlyContinue } catch { }
    try {
        if ((Test-Path -LiteralPath $P.Verlauf) -and (Get-Item -LiteralPath $P.Verlauf).Length -gt 5MB) {
            $grenzIso = Get-Iso $grenze
            $bleibt = @([IO.File]::ReadAllLines($P.Verlauf) | Where-Object { $m = [regex]::Match($_, '"start":"([^"]+)"'); $m.Success -and $m.Groups[1].Value -ge $grenzIso.Substring(0, 10) })
            [IO.File]::WriteAllLines($P.Verlauf, [string[]]$bleibt, $Utf8)
        }
    } catch { }
}

# ── Hauptablauf ──────────────────────────────────────────────────────────────

foreach ($d in @($Basis, $P.Logs, $P.Auftraege, $P.Ergebnisse)) { if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null } }

# Sperre gegen Doppelstart. Ein Mutex wird von Windows freigegeben, wenn der Prozess endet —
# ein abgestuerzter Lauf hinterlaesst also keine veraltete Sperre (AbandonedMutex = frei).
$mutexName = 'Global\AMCubeSync'
if ($TestMutexName) { $mutexName = $TestMutexName }
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$hatSperre = $false
try { $hatSperre = $mutex.WaitOne(0) } catch { if ($_.Exception.InnerException -is [System.Threading.AbandonedMutexException] -or $_.Exception -is [System.Threading.AbandonedMutexException]) { $hatSperre = $true } }
if (-not $hatSperre) { Write-SkfLog 'Ein anderer Lauf ist noch aktiv - dieser Start wird uebersprungen.'; exit 0 }

$exitCode = 0
$st = $null
try {
    $st = ConvertTo-SkfHash (Read-SkfJson $P.Status)
    if (-not $st) { $st = @{ version = 1 } }
    if (-not ($st.anlagen -is [hashtable])) { $st.anlagen = @{} }
    $st.skriptVersion = $SkriptVersion; $st.rechner = $env:COMPUTERNAME
    $st.laeuft = @{ seit = (Get-Iso (Get-Date)); pid = $PID; anlage = ''; kopiert = 0; aktualisiert = (Get-Iso (Get-Date)) }
    $st.Remove('fehler')
    Save-SkfJson $P.Status $st

    Update-SkfSchluessel $st
    Update-SkfPasswort $st

    $cfg = $null
    try { $cfg = Read-SkfConfig } catch { $st.fehler = @{ art = 'konfig'; text = ('Konfiguration: ' + $_.Exception.Message); am = (Get-Iso (Get-Date)) }; Write-SkfLog $st.fehler.text }
    if ($cfg) {
        $st.targetRoot = [string]$cfg.targetRoot
        $st.modus = $(if ($cfg.targetRoot -eq '02_Serienproduktion') { 'produktiv' } else { 'test' })
        $st.basePath = [string]$cfg.basePath
        $st.slots = @($cfg.slots)
        $freigabeOk = Test-SkfFreigabe $cfg $st
        # Anlagen, die aus der Konfiguration entfernt wurden, aus dem Status nehmen
        $ids = @($cfg.anlagen | ForEach-Object { [string]$_.id })
        foreach ($k in @($st.anlagen.Keys)) { if ($ids -notcontains $k) { $st.anlagen.Remove($k) } }
        foreach ($a in @($cfg.anlagen)) { [void](Get-SkfAnlageStatus $st $a) }

        $runde = 0
        do {
            foreach ($af in (Get-SkfAuftraege)) { Invoke-SkfAuftrag $af $st }
            if ($runde -eq 0) {
                $cfg = Read-SkfConfig
                if ($freigabeOk) {
                    $runId = (Get-Date).ToString('yyyyMMdd-HHmmss') + $(if ($DryRun) { '-probe' } else { '' })
                    foreach ($a in @($cfg.anlagen)) {
                        if ($Anlage.Count -and $Anlage -notcontains [string]$a.id) { continue }
                        if (-not $a.aktiv) { continue }
                        $x = Invoke-SkfAnlage $cfg $a $st @{ erzwingen = ([bool]$Erzwingen -or [bool]$DryRun); dryRun = [bool]$DryRun; ausloeser = 'zeitplan'; runId = $runId }
                        if ($x -and $x.ergebnis -eq 'fehler') { $exitCode = 1 }
                    }
                } else { $exitCode = 1 }
            }
            $runde++
        } while ($runde -lt 5 -and @(Get-SkfAuftraege).Count -gt 0)
        Clear-SkfAlt $cfg
    } else { $exitCode = 2 }
} catch {
    $exitCode = 3
    Write-SkfLog ('Unerwarteter Fehler: ' + $_.Exception.Message + ' ' + $_.InvocationInfo.PositionMessage)
    if ($st) { $st.fehler = @{ art = 'skript'; text = ('Unerwarteter Fehler im Sync-Skript: ' + $_.Exception.Message); am = (Get-Iso (Get-Date)) } }
} finally {
    if ($st) {
        $st.laeuft = $null
        $st.letzterLauf = @{ ende = (Get-Iso (Get-Date)); exitCode = $exitCode }
        $st.aktualisiert = (Get-Iso (Get-Date))
        Save-SkfJson $P.Status $st
    }
    try { $mutex.ReleaseMutex() } catch { }
    $mutex.Dispose()
}
exit $exitCode
