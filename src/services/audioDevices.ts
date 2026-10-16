// ── Audio-Geräte eines Ziel-PCs anzeigen und steuern ────────────────────────
// Baut die PowerShell-Bausteine für die Remote-Doc-Kategorie „Audio & Sound".
//
// Warum mehrere Quellen nötig sind (lokal nachgemessen, nicht geraten):
//  • Die VOLLSTÄNDIGE Liste — also auch deaktivierte und nicht angeschlossene Geräte,
//    so wie der Windows-Sound-Dialog sie zeigt — steht nur in der Registry unter
//    MMDevices\Audio\Render bzw. \Capture. `Get-PnpDevice -Class AudioEndpoint` liefert
//    ausschließlich die aktuell aktiven Endpunkte (gemessen: 3 von 22 Registry-Einträgen).
//  • `DeviceState` ist KEIN glatter Wert, sondern ein Bitfeld mit gesetzten oberen Bits
//    (z. B. 553648132). Der Zustand steckt in den unteren 4 Bit → `-band 0xF`:
//    1 = aktiv, 2 = deaktiviert, 4 = nicht vorhanden, 8 = nicht eingesteckt.
//  • Der Anzeigename steht NICHT in „…},14" (ist leer), sondern wird aus
//    „…},2" (Gerät) und „…},6" (Treiber/Schnittstelle) zusammengesetzt — genau so
//    schreibt Windows ihn auch in der Geräteliste.
//  • Pegel, Stummschaltung und das Standardgerät gibt es nur über die Core-Audio-
//    Schnittstelle; dafür wird eine kleine C#-Klasse per Add-Type eingebunden.
//    ACHTUNG an der Vtable-Reihenfolge von IAudioEndpointVolume: sie muss exakt der
//    MSDN-Reihenfolge entsprechen. Eine um eins verschobene Deklaration liefert sonst
//    stillschweigend falsche Werte (im Test meldete GetMute dauerhaft „stumm").

/** Einfachanführungszeichen für PowerShell verdoppeln. */
function psEsc(s: string): string { return (s || '').replace(/'/g, "''") }

/** C#-Baustein für Core Audio — Pegel, Stumm, Standardgerät. */
const CORE_AUDIO_CS = `
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p);
  int UnregisterControlChangeNotify(IntPtr p);
  int GetChannelCount(out uint c);
  int SetMasterVolumeLevel(float db, ref Guid ctx);
  int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
  int GetMasterVolumeLevel(out float db);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint ch, float db, ref Guid ctx);
  int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
  int GetChannelVolumeLevel(uint ch, out float db);
  int GetChannelVolumeLevelScalar(uint ch, out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  int OpenPropertyStore(int access, out IntPtr store);
  int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetState(out int state);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int flow, int mask, out IntPtr col);
  int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice dev);
  int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice dev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public class SkfAudio {
  static IMMDeviceEnumerator Enum() { return (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject()); }
  static IAudioEndpointVolume VolOf(IMMDevice d) {
    var g = typeof(IAudioEndpointVolume).GUID; object o;
    Marshal.ThrowExceptionForHR(d.Activate(ref g, 23, IntPtr.Zero, out o));
    return (IAudioEndpointVolume)o;
  }
  public static string DefaultId(int flow) {
    IMMDevice d; if (Enum().GetDefaultAudioEndpoint(flow, 1, out d) != 0) return "";
    string id; d.GetId(out id); return id;
  }
  public static float GetVolume(string id) {
    IMMDevice d; Marshal.ThrowExceptionForHR(Enum().GetDevice(id, out d));
    float v; Marshal.ThrowExceptionForHR(VolOf(d).GetMasterVolumeLevelScalar(out v)); return v * 100;
  }
  public static bool GetMute(string id) {
    IMMDevice d; Marshal.ThrowExceptionForHR(Enum().GetDevice(id, out d));
    bool m; Marshal.ThrowExceptionForHR(VolOf(d).GetMute(out m)); return m;
  }
  public static void SetVolume(string id, float percent) {
    IMMDevice d; Marshal.ThrowExceptionForHR(Enum().GetDevice(id, out d));
    var g = Guid.Empty;
    Marshal.ThrowExceptionForHR(VolOf(d).SetMasterVolumeLevelScalar(percent / 100f, ref g));
  }
  public static void SetMute(string id, bool mute) {
    IMMDevice d; Marshal.ThrowExceptionForHR(Enum().GetDevice(id, out d));
    var g = Guid.Empty;
    Marshal.ThrowExceptionForHR(VolOf(d).SetMute(mute, ref g));
  }
}
`.trim()

/** Liest alle Endpunkte aus der Registry nach `$geraete` (Name, Zustand, Id, PnP-Id). */
const SAMMLE_GERAETE_PS = [
  `$zustand = @{ 1 = 'Aktiv'; 2 = 'Deaktiviert'; 4 = 'Nicht vorhanden'; 8 = 'Nicht eingesteckt' }`,
  `$pnp = @(Get-PnpDevice -Class AudioEndpoint -EA SilentlyContinue)`,
  `$geraete = @()`,
  `foreach ($art in @(@{ Schl = 'Render'; Typ = 'Wiedergabe'; Fluss = 0 }, @{ Schl = 'Capture'; Typ = 'Aufnahme'; Fluss = 1 })) {`,
  `  $basis = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\' + $art.Schl`,
  `  foreach ($k in (Get-ChildItem $basis -EA SilentlyContinue)) {`,
  `    $roh = (Get-ItemProperty $k.PSPath -Name DeviceState -EA SilentlyContinue).DeviceState`,
  `    if ($null -eq $roh) { continue }`,
  // Zustand steckt in den unteren 4 Bit — die oberen sind Windows-interne Flags.
  `    $s = [int]$roh -band 0xF`,
  `    $p = Get-ItemProperty (Join-Path $k.PSPath 'Properties') -EA SilentlyContinue`,
  `    $geraet = [string]$p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'`,
  `    $treiber = [string]$p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'`,
  `    if (-not $geraet) { continue }`,
  `    $name = if ($treiber) { "$geraet ($treiber)" } else { $geraet }`,
  `    $guid = $k.PSChildName`,
  `    $t = $pnp | Where-Object { $_.InstanceId -like ('*' + $guid + '*') } | Select-Object -First 1`,
  `    $geraete += [pscustomobject]@{`,
  `      Typ = $art.Typ; Name = $name; Zustand = $zustand[$s]; ZustandRoh = $s`,
  `      Id = ('{0.0.' + $art.Fluss + '.00000000}.' + $guid); Guid = $guid; Registry = $k.PSPath`,
  `      PnpId = $(if ($t) { $t.InstanceId } else { '' }); PnpStatus = $(if ($t) { $t.Status } else { '' })`,
  `    }`,
  `  }`,
  `}`,
].join('\n')

/**
 * Findet in `$geraete` genau ein Gerät → `$ziel`.
 *
 * Zuerst über die GUID des Endpunkts, denn Gerätenamen sind NICHT eindeutig: ein PC
 * führt z. B. drei Einträge „Speaker (Realtek(R) Audio)" (einer aktiv, zwei als Reste
 * früherer Anschlüsse). Über den Namen würde man immer den aktiven treffen — auch wenn
 * der Bediener eine andere Zeile angeklickt hat. Der Namensteil bleibt als Rückfall-
 * ebene, damit die Eingabe in Remote Doc („Speaker") weiter funktioniert.
 */
function findeGeraetPs(sucheVar: string): string {
  return [
    `$treffer = @($geraete | Where-Object { $_.Guid -eq ${sucheVar} })`,
    `if ($treffer.Count -eq 0) { $treffer = @($geraete | Where-Object { $_.Name -like ('*' + ${sucheVar} + '*') }) }`,
    `if ($treffer.Count -eq 0) { Write-Output ('ERR:Kein Audio-Geraet enthaelt ' + ${sucheVar} + '. Erst „Audio-Geraete anzeigen" aufrufen.'); return }`,
    `if ($treffer.Count -gt 1) {`,
    `  $aktive = @($treffer | Where-Object { $_.ZustandRoh -eq 1 })`,
    `  if ($aktive.Count -eq 1) { $treffer = $aktive }`,
    `  else { Write-Output ('ERR:Mehrdeutig (' + $treffer.Count + ' Treffer): ' + (($treffer | ForEach-Object { $_.Name }) -join ' | ')); return }`,
    `}`,
    `$ziel = $treffer[0]`,
  ].join('\n')
}

/**
 * Übersicht aller Wiedergabe- und Aufnahmegeräte samt Zustand, Pegel und Standard.
 *
 * `mitGuid` hängt die eindeutige Endpunkt-GUID an. In Remote Doc bleibt sie weg (reine
 * Textausgabe für den Menschen); das Sound-Fix-Fenster braucht sie, weil Gerätenamen
 * mehrfach vergeben sind und es die angeklickte Zeile treffen muss.
 */
export function buildAudioListInner(mitGuid = false): string {
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    SAMMLE_GERAETE_PS,
    // Pegel/Stumm/Standard nur für aktive Geräte — bei den übrigen gibt es keinen Endpunkt.
    `$standard = @{}`,
    `try {`,
    `  Add-Type -TypeDefinition @'`,
    CORE_AUDIO_CS,
    `'@ -EA Stop`,
    `  foreach ($f in 0,1) { $d = [SkfAudio]::DefaultId($f); if ($d) { $standard[$d] = $true } }`,
    `} catch { }`,
    `$aus = foreach ($g in $geraete) {`,
    `  $pegel = ''`,
    `  $stumm = ''`,
    `  if ($g.ZustandRoh -eq 1) {`,
    `    try { $pegel = [string][math]::Round([SkfAudio]::GetVolume($g.Id)) + ' %' } catch { }`,
    `    try { $stumm = $(if ([SkfAudio]::GetMute($g.Id)) { 'ja' } else { 'nein' }) } catch { }`,
    `  }`,
    `  [pscustomobject]@{`,
    `    Typ = $g.Typ`,
    `    Geraet = $g.Name`,
    ...(mitGuid ? [`    Guid = $g.Guid`] : []),
    `    Zustand = $g.Zustand`,
    `    Standard = $(if ($standard[$g.Id]) { 'ja' } else { '' })`,
    `    Pegel = $pegel`,
    `    Stumm = $stumm`,
    `    Schaltbar = $(if ($g.PnpId) { 'ja' } else { 'nur ueber Registry' })`,
    `  }`,
    `}`,
    // Aktive zuerst, dann nach Typ und Name — wie im Windows-Dialog.
    `$aus | Sort-Object @{E={ if ($_.Zustand -eq 'Aktiv') { 0 } else { 1 } }}, Typ, Geraet | ConvertTo-Json -Depth 4 -Compress`,
  ].join('\n')
}

/**
 * Gerät aktivieren oder deaktivieren.
 * Erster Weg ist PnP (sauber, ohne Dienst-Neustart) — der greift bei Geräten, die
 * Windows aktuell als Endpunkt führt. Für im Sound-Dialog deaktivierte Geräte gibt es
 * keinen PnP-Knoten; dort bleibt nur `DeviceState` in der Registry. Dieser Schlüssel
 * gehört SYSTEM und ist selbst für Administratoren schreibgeschützt (lokal geprüft:
 * „Der angeforderte Registrierungszugriff ist unzulässig"), deshalb läuft der Schreib-
 * vorgang über eine einmalige Aufgabe im SYSTEM-Kontext. Danach muss der Audiodienst
 * neu starten, damit Windows den geänderten Zustand übernimmt.
 */
export function buildAudioSwitchInner(aktivieren: boolean, eingabe: string): string {
  const neuerState = aktivieren ? 1 : 2
  const wort = aktivieren ? 'aktiviert' : 'deaktiviert'
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$suche = '${psEsc(eingabe)}'`,
    `if (-not $suche) { Write-Output 'ERR:Kein Geraetename angegeben'; return }`,
    SAMMLE_GERAETE_PS,
    findeGeraetPs('$suche'),
    `if ($ziel.PnpId) {`,
    `  try {`,
    aktivieren
      ? `    Enable-PnpDevice -InstanceId $ziel.PnpId -Confirm:$false -EA Stop`
      : `    Disable-PnpDevice -InstanceId $ziel.PnpId -Confirm:$false -EA Stop`,
    `    Write-Output ('OK:' + $ziel.Name + ' ${wort} (Geraete-Manager)')`,
    `    return`,
    `  } catch { Write-Output ('WARN:PnP fehlgeschlagen (' + $_.Exception.Message + ') - versuche Registry') }`,
    `}`,
    // ── Registry-Weg über eine Aufgabe im SYSTEM-Kontext ──────────────────────
    `$pfad = $ziel.Registry`,
    `$res = 'C:\\Temp\\skf_audio_switch.txt'`,
    `if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
    `Remove-Item $res -Force -EA SilentlyContinue`,
    `$inner = "try { Set-ItemProperty -LiteralPath '$pfad' -Name DeviceState -Value ${neuerState} -Type DWord -EA Stop; Restart-Service Audiosrv -Force -EA SilentlyContinue; 'OK' | Out-File '$res' -Encoding UTF8 } catch { ('ERR:' + ` + '$' + `_.Exception.Message) | Out-File '$res' -Encoding UTF8 }"`,
    `$b64 = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))`,
    `$task = 'SKFAudioSwitch_' + (Get-Date -Format 'yyyyMMddHHmmssfff')`,
    `try {`,
    `  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -EncodedCommand ' + $b64)`,
    `  $pr = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest`,
    `  Register-ScheduledTask -TaskName $task -Action $a -Principal $pr -Force | Out-Null`,
    `  Start-ScheduledTask -TaskName $task`,
    `  $ende = (Get-Date).AddSeconds(30)`,
    `  do { Start-Sleep -Milliseconds 500 } while ((-not (Test-Path $res)) -and ((Get-Date) -lt $ende))`,
    `  $erg = if (Test-Path $res) { (Get-Content $res -Raw -EA SilentlyContinue).Trim() } else { '' }`,
    `  Unregister-ScheduledTask -TaskName $task -Confirm:$false -EA SilentlyContinue`,
    `  Remove-Item $res -Force -EA SilentlyContinue`,
    `  if ($erg -eq 'OK') { Write-Output ('OK:' + $ziel.Name + ' ${wort} (Registry, Audiodienst neu gestartet)') }`,
    `  elseif ($erg) { Write-Output ('ERR:' + $erg.Replace('ERR:','')) }`,
    `  else { Write-Output 'ERR:Keine Rueckmeldung der SYSTEM-Aufgabe' }`,
    `} catch { Write-Output ('ERR:Aufgabe fehlgeschlagen: ' + $_.Exception.Message) }`,
  ].join('\n')
}

/** Pegel eines Geräts setzen. Eingabe: `Geraetename=Prozent` (z. B. `Speaker=30`). */
export function buildAudioVolumeInner(eingabe: string): string {
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$eingabe = '${psEsc(eingabe)}'`,
    `if ($eingabe -notmatch '^(.+?)\\s*=\\s*(\\d{1,3})$') { Write-Output 'ERR:Bitte im Format Geraet=Prozent angeben, z. B. Speaker=30'; return }`,
    `$suche = $Matches[1].Trim()`,
    `$wert = [int]$Matches[2]`,
    `if ($wert -lt 0 -or $wert -gt 100) { Write-Output 'ERR:Prozentwert muss zwischen 0 und 100 liegen'; return }`,
    SAMMLE_GERAETE_PS,
    findeGeraetPs('$suche'),
    `if ($ziel.ZustandRoh -ne 1) { Write-Output ('ERR:' + $ziel.Name + ' ist ' + $ziel.Zustand + ' - der Pegel laesst sich nur bei aktiven Geraeten setzen.'); return }`,
    `try {`,
    `  Add-Type -TypeDefinition @'`,
    CORE_AUDIO_CS,
    `'@ -EA Stop`,
    `  $vorher = [math]::Round([SkfAudio]::GetVolume($ziel.Id))`,
    `  [SkfAudio]::SetVolume($ziel.Id, $wert)`,
    `  $nachher = [math]::Round([SkfAudio]::GetVolume($ziel.Id))`,
    `  Write-Output ('OK:' + $ziel.Name + ': Pegel ' + $vorher + ' % -> ' + $nachher + ' %')`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
}

/** Stummschaltung setzen. Eingabe: `Geraetename=an` oder `Geraetename=aus`. */
export function buildAudioMuteInner(eingabe: string): string {
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$eingabe = '${psEsc(eingabe)}'`,
    `if ($eingabe -notmatch '^(.+?)\\s*=\\s*(an|aus|ein|on|off)$') { Write-Output 'ERR:Bitte im Format Geraet=an oder Geraet=aus angeben'; return }`,
    `$suche = $Matches[1].Trim()`,
    `$stumm = $Matches[2] -in @('an','ein','on')`,
    SAMMLE_GERAETE_PS,
    findeGeraetPs('$suche'),
    `if ($ziel.ZustandRoh -ne 1) { Write-Output ('ERR:' + $ziel.Name + ' ist ' + $ziel.Zustand + ' - stummschalten geht nur bei aktiven Geraeten.'); return }`,
    `try {`,
    `  Add-Type -TypeDefinition @'`,
    CORE_AUDIO_CS,
    `'@ -EA Stop`,
    `  [SkfAudio]::SetMute($ziel.Id, $stumm)`,
    `  $ist = [SkfAudio]::GetMute($ziel.Id)`,
    `  Write-Output ('OK:' + $ziel.Name + ': stumm=' + $(if ($ist) { 'ja' } else { 'nein' }))`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
}
