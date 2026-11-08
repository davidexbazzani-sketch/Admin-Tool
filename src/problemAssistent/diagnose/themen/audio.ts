// ── Diagnose-Thema „Audio, Headset, Kamera & Mikrofon“ ───────────────────────
// Sonden: au  = Audiogeräte des PCs (Registry MMDevices, Dienste, Treiber, Bluetooth, Abstürze)
//         aub = in der Sitzung des Benutzers: Standardgeräte, Pegel, Stumm (Core Audio), Datenschutz, Einstellungen
//         kam = Kameras (PnP, Frameserver, Richtlinien, BIOS, virtuelle Kameras)
// Alles NUR LESEND. DeviceState ist ein Bitfeld → Zustand = DeviceState -band 0xF (1 aktiv, 2 deaktiviert, 4 fehlt, 8 ausgesteckt).
import { ja, liste, nein, num, txt } from '../motor'
import type { DgFakten, DgOber, DgSonde, DgWert } from '../types'

/** Dienst bekannt und läuft NICHT (fehlender Fakt ⇒ false). */
const laeuftNicht = (v: DgWert | undefined): boolean => v !== null && v !== undefined && txt(v) !== '' && txt(v) !== 'Running'
/** Datenschutz-Schalter steht auf „Deny“. */
const verweigert = (v: DgWert | undefined): boolean => txt(v) === 'Deny'
const datenschutzMikro = (f: DgFakten): string[] => [
  verweigert(f['aub.micGeraet']) ? 'für das ganze Gerät' : '', verweigert(f['aub.micUser']) ? 'für den Benutzer' : '', verweigert(f['aub.micDesktop']) ? 'für Desktop-Programme' : '',
].filter(Boolean)

export const SONDEN_AUDIO: DgSonde[] = [
  {
    id: 'au', titel: 'Audiogeräte (Wiedergabe/Aufnahme, Dienste, Treiber, Bluetooth, Abstürze)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
$hsMuster = '(?i)headset|jabra|plantronics|\bpoly\b|blackwire|voyager|savi|logitech|epos|sennheiser|evolve|engage|hands-free|freisprech|airpods|bose'
$endp = New-Object System.Collections.Generic.List[object]
foreach ($art in 'Render', 'Capture') {
  foreach ($k in @(Get-ChildItem -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\' + $art) -EA SilentlyContinue)) {
    $roh = (Get-ItemProperty -LiteralPath $k.PSPath -Name DeviceState -EA SilentlyContinue).DeviceState
    if ($null -eq $roh) { continue }
    $eig = Get-ItemProperty -LiteralPath (Join-Path $k.PSPath 'Properties') -EA SilentlyContinue
    $gn = [string]$eig.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'; $tr = [string]$eig.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'; $bus = [string]$eig.'{a45c254e-df1c-4efd-8020-67d146a850e0},24'
    if (-not $gn) { continue }
    $nm = $(if ($tr) { $gn + ' (' + $tr + ')' } else { $gn })
    $hs = ($bus -match '^(USB|BTHENUM|BTHHFENUM|BTHLEDEVICE)$') -or ($nm -match $hsMuster)
    [void]$endp.Add([pscustomobject]@{ Art = $art; Name = $nm; Zst = ([int64]$roh -band 0xF); Bus = $bus; Hs = $hs })
  }
}
$wa = @($endp | Where-Object { $_.Art -eq 'Render' -and $_.Zst -eq 1 })
$ra = @($endp | Where-Object { $_.Art -eq 'Capture' -and $_.Zst -eq 1 })
$deak = @($endp | Where-Object { $_.Zst -eq 2 })
Fakt 'wiedergabeAktiv' $wa.Count; Fakt 'aufnahmeAktiv' $ra.Count
Fakt 'deaktiviert' @($deak | ForEach-Object { [string]$_.Name } | Select-Object -Unique -First 8); Fakt 'deaktiviertAnzahl' $deak.Count
Punkt 'Wiedergabegeräte (aktiv)' $(if ($wa.Count) { 'ok' } else { 'fehler' }) $(if ($wa.Count) { (@($wa | ForEach-Object { $_.Name } | Select-Object -Unique -First 5)) -join ', ' } else { 'KEIN aktives Wiedergabegerät' })
Punkt 'Aufnahmegeräte / Mikrofone (aktiv)' $(if ($ra.Count) { 'ok' } else { 'fehler' }) $(if ($ra.Count) { (@($ra | ForEach-Object { $_.Name } | Select-Object -Unique -First 5)) -join ', ' } else { 'KEIN aktives Mikrofon' })
if ($deak.Count) { Punkt 'Im Sound-Dialog deaktiviert' 'warn' ((@($deak | ForEach-Object { $_.Name } | Select-Object -Unique -First 5)) -join ', ') }
$hsA = @($endp | Where-Object { $_.Hs -and $_.Zst -eq 1 })
$hsD = @($endp | Where-Object { $_.Hs -and $_.Zst -eq 2 })
Fakt 'headsetAktiv' ($hsA.Count -gt 0); Fakt 'headsetWiedergabeAktiv' @($hsA | Where-Object { $_.Art -eq 'Render' }).Count
Fakt 'headsetBekannt' (@($endp | Where-Object { $_.Hs }).Count -gt 0); Fakt 'headsetDeaktiviert' ($hsD.Count -gt 0)
Fakt 'headsetName' $(if ($hsA.Count) { [string]$hsA[0].Name } elseif ($hsD.Count) { [string]$hsD[0].Name } else { $null })
Punkt 'Headset / USB- bzw. Bluetooth-Audio' $(if ($hsD.Count) { 'fehler' } elseif ($hsA.Count) { 'ok' } else { 'info' }) $(if ($hsD.Count) { 'DEAKTIVIERT: ' + $hsD[0].Name } elseif ($hsA.Count) { 'verbunden: ' + ((@($hsA | ForEach-Object { $_.Name } | Select-Object -Unique -First 3)) -join ', ') } elseif (@($endp | Where-Object { $_.Hs }).Count) { 'früher benutzt, gerade NICHT verbunden' } else { 'kein Headset bekannt' })
$sm = @($ra | Where-Object { $_.Name -match '(?i)stereo ?mix|what u hear|wave out' })
$vi = @($ra | Where-Object { $_.Name -match '(?i)nvidia broadcast|krisp|voicemeeter|vb-audio|cable output|virtual' })
Fakt 'stereomixAktiv' ($sm.Count -gt 0); Fakt 'virtuellAktiv' @($vi | ForEach-Object { [string]$_.Name })
if ($vi.Count) { Punkt 'Virtuelles Mikrofon' 'warn' ((@($vi | ForEach-Object { $_.Name })) -join ', ') }
$bt = @($endp | Where-Object { $_.Zst -eq 1 -and $_.Bus -match '^BTH' })
$btHf = @($bt | Where-Object { $_.Bus -eq 'BTHHFENUM' }); $btSt = @($bt | Where-Object { $_.Bus -ne 'BTHHFENUM' })
Fakt 'btAktiv' $bt.Count; Fakt 'btHandsfreeAktiv' ($btHf.Count -gt 0); Fakt 'btStereoAktiv' ($btSt.Count -gt 0)
if ($bt.Count) { Punkt 'Bluetooth-Audio' 'info' ('' + $bt.Count + ' Endpunkt(e) aktiv' + $(if ($btHf.Count -and $btSt.Count) { ' – Kopfhörer UND Freisprech-Profil gleichzeitig' } elseif ($btHf.Count) { ' – Freisprech-Profil (Telefonqualität)' } else { ' – nur Stereo (ohne Mikrofon)' })) }
foreach ($dn in 'Audiosrv', 'AudioEndpointBuilder', 'BTAGService', 'bthserv') {
  $dv = Get-Service -Name $dn -EA SilentlyContinue
  $fn = @{ Audiosrv = 'audiosrv'; AudioEndpointBuilder = 'endpointBuilder'; BTAGService = 'btag'; bthserv = 'bthserv' }[$dn]
  Fakt $fn $(if ($dv) { [string]$dv.Status } else { $null }); Fakt ($fn + 'Start') $(if ($dv) { [string]$dv.StartType } else { $null })
  if ($dv) { Punkt ('Dienst ' + $dv.DisplayName) $(if ($dv.Status -eq 'Running') { 'ok' } elseif ($dn -match '^(Audiosrv|AudioEndpointBuilder)$') { 'fehler' } elseif ([string]$dv.StartType -eq 'Disabled') { 'warn' } else { 'info' }) ([string]$dv.Status + ' (' + [string]$dv.StartType + ')') }
}
$med = @(Get-PnpDevice -PresentOnly -Class MEDIA -EA SilentlyContinue)
$tf = @($med | Where-Object { [string]$_.Status -ne 'OK' })
Fakt 'treiberFehler' $tf.Count; Fakt 'treiberFehlerNamen' @($tf | ForEach-Object { [string]$_.FriendlyName + ' (Code ' + [int]$_.ConfigManagerErrorCode + ')' })
Fakt 'code52' (@($tf | Where-Object { [int]$_.ConfigManagerErrorCode -eq 52 }).Count -gt 0)
$gen = @($med | Where-Object { [string]$_.FriendlyName -match '^(High Definition Audio-Ger.t|High Definition Audio Device)$' -and [string]$_.InstanceId -match 'VEN_(10EC|14F1|111D|1102)' })
Fakt 'generischerTreiber' ($gen.Count -gt 0)
Punkt 'Soundtreiber' $(if ($tf.Count) { 'fehler' } elseif ($gen.Count) { 'warn' } elseif ($med.Count) { 'ok' } else { 'fehler' }) $(if ($tf.Count) { 'mit Fehler: ' + ((@($tf | ForEach-Object { [string]$_.FriendlyName + ' (Code ' + [int]$_.ConfigManagerErrorCode + ')' })) -join ', ') } elseif ($gen.Count) { 'nur Windows-Standardtreiber „High Definition Audio“ (Herstellertreiber fehlt)' } elseif ($med.Count) { '' + $med.Count + ' Audio-Gerät(e) ohne Fehler' } else { 'kein Audio-Gerät gefunden' })
$usbF = @(Get-PnpDevice -PresentOnly -Class USB -EA SilentlyContinue | Where-Object { [string]$_.Status -eq 'Error' })
Fakt 'usbFehler' $usbF.Count
if ($usbF.Count) { Punkt 'USB-Geräte mit Fehler' 'warn' ((@($usbF | ForEach-Object { [string]$_.FriendlyName } | Select-Object -First 3)) -join ', ') }
$btGer = @(Get-PnpDevice -PresentOnly -Class Bluetooth -EA SilentlyContinue)
$funk = @($btGer | Where-Object { [string]$_.InstanceId -match '^(USB|PCI)\\' })
$btF = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.InstanceId -match '^(BTHENUM|BTHHFENUM)\\' -and [string]$_.Status -eq 'Error' }) + @($funk | Where-Object { [string]$_.Status -eq 'Error' })
Fakt 'btAdapter' $funk.Count; Fakt 'btFehler' $btF.Count
Punkt 'Bluetooth-Adapter' $(if ($btF.Count) { 'fehler' } elseif ($funk.Count) { 'ok' } else { 'info' }) $(if ($btF.Count) { 'Fehler: ' + ((@($btF | ForEach-Object { [string]$_.FriendlyName } | Select-Object -First 3)) -join ', ') } elseif ($funk.Count) { [string]$funk[0].FriendlyName } else { 'kein Bluetooth-Adapter' })
$ab = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Service Control Manager'; Id = 7031, 7034; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { [string]$_.Properties[0].Value -match '(?i)^Windows[- ]Audio' }).Count
Fakt 'audiosrvAbstuerze7' $ab
Punkt 'Audiodienst unerwartet beendet (7 Tage)' $(if ($ab) { 'warn' } else { 'ok' }) ('' + $ab + ' Mal')
`,
  },
  {
    id: 'aub', titel: 'Ton in der Sitzung des Benutzers (Standardgeräte, Lautstärke, Stumm, Datenschutz)', modus: 'benutzer', timeoutMs: 90000,
    ps: String.raw`
$hsMuster = '(?i)headset|jabra|plantronics|\bpoly\b|blackwire|voyager|savi|logitech|epos|sennheiser|evolve|engage|hands-free|freisprech|airpods|bose'
function EndpInfo([string]$id) {
  $r = @{ Name = ''; Bus = ''; Treiber = '' }
  if ($id -notmatch '^\{0\.0\.([01])\.00000000\}\.(\{[0-9a-fA-F-]+\})$') { return $r }
  $zw = $(if ($Matches[1] -eq '0') { 'Render' } else { 'Capture' })
  $eig = Get-ItemProperty -LiteralPath ('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\' + $zw + '\' + $Matches[2] + '\Properties') -EA SilentlyContinue
  $gn = [string]$eig.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'; $r.Treiber = [string]$eig.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
  $r.Name = $(if ($r.Treiber) { $gn + ' (' + $r.Treiber + ')' } else { $gn }); $r.Bus = [string]$eig.'{a45c254e-df1c-4efd-8020-67d146a850e0},24'
  return $r
}
function IstHs($r) { return (($r.Bus -match '^(USB|BTHENUM|BTHHFENUM|BTHLEDEVICE)$') -or ($r.Name -match $hsMuster)) }
$ca = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDgEpVol {
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
interface IDgMMDevice {
  int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  int OpenPropertyStore(int access, out IntPtr store);
  int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  int GetState(out int state);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IDgMMEnum {
  int EnumAudioEndpoints(int flow, int mask, out IntPtr col);
  int GetDefaultAudioEndpoint(int flow, int role, out IDgMMDevice dev);
  int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IDgMMDevice dev);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DgMMEnumCo { }
public class DgAudio {
  static IDgMMEnum En() { return (IDgMMEnum)(new DgMMEnumCo()); }
  static IDgEpVol VolOf(string id) {
    IDgMMDevice d; Marshal.ThrowExceptionForHR(En().GetDevice(id, out d));
    var g = typeof(IDgEpVol).GUID; object o;
    Marshal.ThrowExceptionForHR(d.Activate(ref g, 23, IntPtr.Zero, out o));
    return (IDgEpVol)o;
  }
  public static string DefaultId(int flow, int role) {
    IDgMMDevice d; if (En().GetDefaultAudioEndpoint(flow, role, out d) != 0) return "";
    string id; d.GetId(out id); return id;
  }
  public static float Volume(string id) { float v; Marshal.ThrowExceptionForHR(VolOf(id).GetMasterVolumeLevelScalar(out v)); return v * 100; }
  public static bool Muted(string id) { bool m; Marshal.ThrowExceptionForHR(VolOf(id).GetMute(out m)); return m; }
}
'@ -EA Stop
  $ca = $true
} catch { Punkt 'Core Audio' 'info' ('nicht lesbar: ' + $_.Exception.Message) }
if ($ca) {
  $w0 = [DgAudio]::DefaultId(0, 0); $w2 = [DgAudio]::DefaultId(0, 2); $r0 = [DgAudio]::DefaultId(1, 0); $r2 = [DgAudio]::DefaultId(1, 2)
  $wi = EndpInfo $w0; $ri = EndpInfo $r0; $kw = EndpInfo $w2; $kr = EndpInfo $r2
  Fakt 'standardWiedergabe' $(if ($w0) { $wi.Name } else { $null }); Fakt 'standardAufnahme' $(if ($r0) { $ri.Name } else { $null })
  Fakt 'kommWiedergabe' $(if ($w2) { $kw.Name } else { $null }); Fakt 'kommAufnahme' $(if ($r2) { $kr.Name } else { $null })
  Fakt 'keinStandardWiedergabe' (-not $w0); Fakt 'keinStandardAufnahme' (-not $r0)
  if ($w0) {
    $wp = $null; $wm = $null; try { $wp = [math]::Round([double][DgAudio]::Volume($w0)); $wm = [bool][DgAudio]::Muted($w0) } catch {}
    Fakt 'standardWiedergabePegel' $wp; Fakt 'standardWiedergabeStumm' $wm
    Fakt 'standardIstHeadset' (IstHs $wi); Fakt 'standardIstBluetooth' ($wi.Bus -match '^BTH')
    $mon = ($wi.Bus -eq 'HDAUDIO' -and ($wi.Treiber -match '(?i)display audio|hdmi|displayport|nvidia high definition|amd high definition')) -or $wi.Name -match '(?i)display audio'
    Fakt 'standardIstMonitor' $mon
    Punkt 'Standard-Wiedergabe' $(if ($wm -or ($null -ne $wp -and $wp -lt 5)) { 'fehler' } elseif ($mon) { 'warn' } else { 'ok' }) ($wi.Name + ' · Lautstärke ' + $wp + ' %' + $(if ($wm) { ' · STUMM' } else { '' }) + $(if ($mon) { ' · Ton geht an den MONITOR' } else { '' }))
  } else { Punkt 'Standard-Wiedergabe' 'fehler' 'kein Standardgerät – Windows hat nichts zum Abspielen' }
  if ($r0) {
    $rp = $null; $rm = $null; try { $rp = [math]::Round([double][DgAudio]::Volume($r0)); $rm = [bool][DgAudio]::Muted($r0) } catch {}
    Fakt 'standardAufnahmePegel' $rp; Fakt 'standardAufnahmeStumm' $rm; Fakt 'aufnahmeIstHeadset' (IstHs $ri)
    Punkt 'Standard-Mikrofon' $(if ($rm -or ($null -ne $rp -and $rp -lt 10)) { 'fehler' } elseif ($null -ne $rp -and $rp -lt 30) { 'warn' } else { 'ok' }) ($ri.Name + ' · Pegel ' + $rp + ' %' + $(if ($rm) { ' · STUMM' } else { '' }))
  } else { Punkt 'Standard-Mikrofon' 'fehler' 'kein Standard-Mikrofon' }
  if ($r2 -and $r2 -ne $r0) {
    $km = $null; try { $km = [bool][DgAudio]::Muted($r2) } catch {}
    Fakt 'kommAufnahmeStumm' $km
  } else { Fakt 'kommAufnahmeStumm' $rm }
  Fakt 'kommUnterschiedlich' ([bool]$w2 -and [bool]$w0 -and $w2 -ne $w0)
  Fakt 'kommIstBluetooth' (($kw.Bus -eq 'BTHHFENUM') -or ($kr.Bus -eq 'BTHHFENUM'))
  Fakt 'kommAufnahmeStereomix' ($kr.Name -match '(?i)stereo ?mix|what u hear|wave out')
  Fakt 'kommAufnahmeVirtuell' ($kr.Name -match '(?i)nvidia broadcast|krisp|voicemeeter|vb-audio|cable output|virtual')
  Punkt 'Für Gespräche (Kommunikation)' $(if ($kr.Name -match '(?i)stereo ?mix|virtual|cable output|voicemeeter') { 'fehler' } elseif ($w2 -ne $w0) { 'warn' } else { 'info' }) ('Lautsprecher: ' + $kw.Name + ' · Mikrofon: ' + $kr.Name + $(if ($w2 -ne $w0) { ' (anderes Gerät als für Musik/Systemtöne)' } else { '' }))
}
$cs = 'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore'
$mg = [string](Get-ItemProperty -LiteralPath ('HKLM:\' + $cs + '\microphone') -EA SilentlyContinue).Value
$mu = [string](Get-ItemProperty -LiteralPath ('HKCU:\' + $cs + '\microphone') -EA SilentlyContinue).Value
$md = [string](Get-ItemProperty -LiteralPath ('HKCU:\' + $cs + '\microphone\NonPackaged') -EA SilentlyContinue).Value
$kg = [string](Get-ItemProperty -LiteralPath ('HKLM:\' + $cs + '\webcam') -EA SilentlyContinue).Value
$ku = [string](Get-ItemProperty -LiteralPath ('HKCU:\' + $cs + '\webcam') -EA SilentlyContinue).Value
$kd = [string](Get-ItemProperty -LiteralPath ('HKCU:\' + $cs + '\webcam\NonPackaged') -EA SilentlyContinue).Value
Fakt 'micGeraet' $mg; Fakt 'micUser' $mu; Fakt 'micDesktop' $md; Fakt 'camGeraet' $kg; Fakt 'camUser' $ku; Fakt 'camDesktop' $kd
$pol = $false
foreach ($pk in 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy', 'HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\Privacy') { if ((Get-ItemProperty -LiteralPath $pk -Name LetAppsAccessMicrophone -EA SilentlyContinue).LetAppsAccessMicrophone -eq 2) { $pol = $true } }
Fakt 'micRichtlinie' $pol
Punkt 'Mikrofon-Datenschutz' $(if ($pol -or 'Deny' -in @($mg, $mu, $md)) { 'fehler' } else { 'ok' }) $(if ($pol) { 'per RICHTLINIE gesperrt' } else { 'Gerät ' + $(if ($mg) { $mg } else { 'Standard' }) + ' · Benutzer ' + $(if ($mu) { $mu } else { 'Standard' }) + ' · Desktop-Programme ' + $(if ($md) { $md } else { 'Standard' }) })
Punkt 'Kamera-Datenschutz' $(if ('Deny' -in @($kg, $ku, $kd)) { 'fehler' } else { 'ok' }) ('Gerät ' + $(if ($kg) { $kg } else { 'Standard' }) + ' · Benutzer ' + $(if ($ku) { $ku } else { 'Standard' }) + ' · Desktop-Programme ' + $(if ($kd) { $kd } else { 'Standard' }))
function InBenutzung([string]$art) {
  $wer = New-Object System.Collections.Generic.List[string]
  foreach ($ak in @(Get-ChildItem -LiteralPath ('HKCU:\' + $cs + '\' + $art) -EA SilentlyContinue) + @(Get-ChildItem -LiteralPath ('HKCU:\' + $cs + '\' + $art + '\NonPackaged') -EA SilentlyContinue)) {
    if ($ak.PSChildName -eq 'NonPackaged') { continue }
    $ei = Get-ItemProperty -LiteralPath $ak.PSPath -EA SilentlyContinue
    if ($ei.LastUsedTimeStart -and [int64]$ei.LastUsedTimeStop -eq 0) { [void]$wer.Add((($ak.PSChildName -split '#')[-1] -replace '_[a-z0-9]{13}$', '')) }
  }
  return ,@($wer)
}
$mib = InBenutzung 'microphone'; $kib = InBenutzung 'webcam'
Fakt 'mikroInBenutzung' @($mib); Fakt 'kameraInBenutzung' @($kib)
Punkt 'Gerade in Benutzung' 'info' ('Mikrofon: ' + $(if ($mib.Count) { $mib -join ', ' } else { 'von keinem Programm' }) + ' · Kamera: ' + $(if ($kib.Count) { $kib -join ', ' } else { 'von keinem Programm' }))
$mmA = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Multimedia\Audio' -EA SilentlyContinue
$mono = ($mmA.AccessibilityMonoMixState -eq 1); $duck = $mmA.UserDuckingPreference
Fakt 'mono' $mono; Fakt 'ducking' $(if ($null -ne $duck) { [int]$duck } else { $null })
Punkt 'Mono-Audio' $(if ($mono) { 'warn' } else { 'ok' }) $(if ($mono) { 'EIN – beide Ohren bekommen dasselbe Signal' } else { 'aus' })
Punkt 'Bei Anrufen andere Töne' 'info' $(switch ([string]$duck) { '0' { 'alle anderen Töne STUMM schalten' } '1' { 'um 80 % verringern' } '2' { 'um 50 % verringern' } '3' { 'nichts tun' } default { 'Standard (um 80 % verringern)' } })
`,
  },
  {
    id: 'kam', titel: 'Kameras (Gerät, Treiber, Frameserver, Richtlinien, BIOS)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
$bild = @(Get-PnpDevice -EA SilentlyContinue | Where-Object { [string]$_.Class -in 'Camera', 'Image' -and [string]$_.FriendlyName -notmatch '(?i)scan|drucker|printer|fax|mfp' })
$da = @($bild | Where-Object { [string]$_.Status -ne 'Unknown' })
$gut = @($da | Where-Object { [string]$_.Status -eq 'OK' -and [string]$_.FriendlyName -notmatch '(?i)\bIR\b|infrared|infrarot' })
$aus = @($da | Where-Object { [int]$_.ConfigManagerErrorCode -eq 22 })
$kap = @($da | Where-Object { [string]$_.Status -ne 'OK' -and [int]$_.ConfigManagerErrorCode -ne 22 })
Fakt 'anzahl' $gut.Count; Fakt 'deaktiviert' @($aus | ForEach-Object { [string]$_.FriendlyName }); Fakt 'fehler' @($kap | ForEach-Object { [string]$_.FriendlyName + ' (Code ' + [int]$_.ConfigManagerErrorCode + ')' })
Fakt 'usbKamera' (@($gut | Where-Object { [string]$_.InstanceId -like 'USB\*' }).Count -gt 0); Fakt 'irKamera' (@($da | Where-Object { [string]$_.FriendlyName -match '(?i)\bIR\b|infrared|infrarot' }).Count -gt 0)
Fakt 'frueher' @($bild | Where-Object { [string]$_.Status -eq 'Unknown' }).Count
Punkt 'Kamera' $(if ($gut.Count) { 'ok' } else { 'fehler' }) $(if ($gut.Count) { (@($gut | ForEach-Object { [string]$_.FriendlyName })) -join ', ' } else { 'keine funktionierende Kamera erkannt' })
if ($aus.Count) { Punkt 'Kamera deaktiviert' 'fehler' ((@($aus | ForEach-Object { [string]$_.FriendlyName })) -join ', ') }
if ($kap.Count) { Punkt 'Kamera mit Fehler' 'fehler' ((@($kap | ForEach-Object { [string]$_.FriendlyName + ' (Code ' + [int]$_.ConfigManagerErrorCode + ')' })) -join ', ') }
$mipi = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.FriendlyName -match '(?i)\bIPU\b|control logic|camera sensor|kamerasensor|avstream' -and [string]$_.Status -ne 'OK' })
Fakt 'mipiFehler' ($mipi.Count -gt 0)
if ($mipi.Count) { Punkt 'Kamera-Baustein (MIPI/IPU) mit Fehler' 'fehler' ((@($mipi | ForEach-Object { [string]$_.FriendlyName })) -join ', ') }
$fs = Get-Service -Name 'FrameServer' -EA SilentlyContinue
Fakt 'frameServer' $(if ($fs) { [string]$fs.Status } else { $null }); Fakt 'frameServerStart' $(if ($fs) { [string]$fs.StartType } else { $null })
Punkt 'Dienst Windows-Kamera-Frameserver' $(if (-not $fs) { 'info' } elseif ([string]$fs.StartType -eq 'Disabled') { 'fehler' } else { 'ok' }) $(if ($fs) { [string]$fs.Status + ' (' + [string]$fs.StartType + ')' + $(if ([string]$fs.Status -ne 'Running') { ' – startet bei Bedarf' } else { '' }) } else { 'nicht vorhanden' })
$fsAb = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { [string]$_.Message -match '(?i)FrameServer' }).Count
Fakt 'frameServerAbstuerze7' $fsAb
if ($fsAb) { Punkt 'Frameserver abgestürzt (7 Tage)' 'warn' ('' + $fsAb + ' Mal') }
$rl = $false
foreach ($rk in 'HKLM:\SOFTWARE\Policies\Microsoft\Camera', 'HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\Camera') { if ((Get-ItemProperty -LiteralPath $rk -Name AllowCamera -EA SilentlyContinue).AllowCamera -eq 0) { $rl = $true } }
foreach ($rk in 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\AppPrivacy', 'HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\Privacy') { if ((Get-ItemProperty -LiteralPath $rk -Name LetAppsAccessCamera -EA SilentlyContinue).LetAppsAccessCamera -eq 2) { $rl = $true } }
Fakt 'richtlinie' $rl
Punkt 'Kamera-Richtlinie' $(if ($rl) { 'fehler' } else { 'ok' }) $(if ($rl) { 'Kamera per Gruppenrichtlinie/Intune GESPERRT' } else { 'keine Sperre' })
$bios = @(Get-CimInstance -Namespace 'root\HP\InstrumentedBIOS' -ClassName HP_BIOSEnumeration -EA SilentlyContinue | Where-Object { [string]$_.Name -match '(?i)^(integrated )?(camera|webcam)' })
$biosAus = $false
foreach ($bx in $bios) { $cv = [string]$bx.CurrentValue; if (-not $cv) { $cv = (@(([string]$bx.Value) -split ',') | Where-Object { $_ -like '[*]*' } | Select-Object -First 1) -replace '^\*', '' }; if ($cv -match '(?i)disable') { $biosAus = $true } }
Fakt 'biosAus' $biosAus
if ($bios.Count) { Punkt 'HP-BIOS (nur gelesen)' $(if ($biosAus) { 'fehler' } else { 'ok' }) $(if ($biosAus) { 'Kamera im BIOS ABGESCHALTET' } else { 'Kamera im BIOS an' }) }
$virt = @()
foreach ($uk in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') {
  $virt += @(Get-ChildItem -LiteralPath $uk -EA SilentlyContinue | ForEach-Object { [string](Get-ItemProperty -LiteralPath $_.PSPath -Name DisplayName -EA SilentlyContinue).DisplayName } | Where-Object { $_ -match '(?i)OBS Studio|Snap Camera|XSplit|ManyCam|NVIDIA Broadcast|Camo\b|EpocCam|DroidCam' })
}
Fakt 'virtuell' @($virt | Select-Object -Unique)
if ($virt.Count) { Punkt 'Virtuelle Kamera installiert' 'warn' ((@($virt | Select-Object -Unique)) -join ', ') }
`,
  },
]

export const THEMEN_AUDIO: DgOber[] = [
  {
    id: 'audio', titel: 'Audio, Headset, Kamera & Mikrofon', symbol: 'Headphones', beschreibung: 'Kein Ton, Mikrofon geht nicht, Headset wird nicht erkannt, Kamera schwarz, Echo oder abgehackter Ton, Bluetooth-Headset',
    unter: [
      {
        id: 'au-kein-ton', titel: 'Kein Ton aus Lautsprecher oder Headset', beschreibung: 'Videos und Anrufe bleiben stumm, rotes X am Lautsprechersymbol, „Kein Audioausgabegerät installiert“',
        sonden: ['au', 'aub'],
        regeln: [
          { id: 'dienst-aus', wenn: f => laeuftNicht(f['au.audiosrv']) && txt(f['au.audiosrvStart']) !== 'Disabled', befund: f => `Dienst „Windows-Audio“ läuft nicht (${txt(f['au.audiosrv'])})`, problem: 'audio-dienst-reagiert-nicht', schwere: 3 },
          { id: 'dienst-deaktiviert', wenn: f => txt(f['au.audiosrvStart']) === 'Disabled' || laeuftNicht(f['au.endpointBuilder']), befund: f => txt(f['au.audiosrvStart']) === 'Disabled' ? 'Dienst „Windows-Audio“ ist deaktiviert' : `Dienst „Windows-Audio-Endpunkterstellung“ läuft nicht (${txt(f['au.endpointBuilder'])})`, problem: 'audio-dienst-fehler-1068', schwere: 3 },
          { id: 'kein-geraet', wenn: f => num(f['au.wiedergabeAktiv']) === 0, befund: () => 'Windows hat kein einziges aktives Wiedergabegerät', problem: 'audio-kein-ausgabegeraet', schwere: 3 },
          { id: 'code52', wenn: f => ja(f['au.code52']), befund: f => `Soundtreiber wird nicht geladen (Signatur, Code 52): ${txt(f['au.treiberFehlerNamen'])}`, problem: 'audio-realtek-code-52', schwere: 3 },
          { id: 'stumm', wenn: f => ja(f['aub.standardWiedergabeStumm']) || num(f['aub.standardWiedergabePegel']) < 3, befund: f => `Standard-Wiedergabegerät ${txt(f['aub.standardWiedergabe'])} ist ${ja(f['aub.standardWiedergabeStumm']) ? 'stummgeschaltet' : 'auf ' + f['aub.standardWiedergabePegel'] + ' % Lautstärke'}`, problem: 'audio-headset-stumm-geschaltet', schwere: 3 },
          { id: 'monitor', wenn: f => ja(f['aub.standardIstMonitor']), befund: f => `Der Ton geht an den Monitor: ${txt(f['aub.standardWiedergabe'])}`, problem: 'audio-ton-am-monitor', schwere: 2 },
          { id: 'generisch', wenn: f => ja(f['au.generischerTreiber']) || num(f['au.treiberFehler']) > 0, befund: f => num(f['au.treiberFehler']) > 0 ? `Audio-Gerät mit Treiberfehler: ${txt(f['au.treiberFehlerNamen'])}` : 'Nur der Windows-Standardtreiber „High Definition Audio“ ist geladen (Herstellertreiber fehlt)', problem: 'audio-generischer-hd-treiber', schwere: 2 },
          { id: 'abstuerze', wenn: f => num(f['au.audiosrvAbstuerze7']) > 0, befund: f => `Der Audiodienst wurde in 7 Tagen ${f['au.audiosrvAbstuerze7']}× unerwartet beendet`, problem: 'audio-audiosrv-stuerzt-ab', schwere: 2 },
        ],
        ohneBefund: ['audio-kein-ton', 'audio-geraet-deaktiviert', 'audio-programm-im-mixer-stumm', 'audio-lautsprecher-nach-headset-stumm'],
      },
      {
        id: 'au-mikro', titel: 'Mikrofon geht nicht – andere hören mich nicht', beschreibung: 'Gegenüber hört nichts oder nur sehr leise, Pegelanzeige bewegt sich nicht, „Wir haben kein Mikrofon gefunden“',
        sonden: ['au', 'aub'],
        regeln: [
          { id: 'richtlinie', wenn: f => ja(f['aub.micRichtlinie']), befund: () => 'Mikrofonzugriff ist per Richtlinie (Gruppenrichtlinie/Intune) gesperrt', problem: 'kamera-mikrofon-von-organisation-gesperrt', schwere: 3 },
          { id: 'datenschutz', wenn: f => datenschutzMikro(f).length > 0, befund: f => `Mikrofon-Datenschutz steht auf „Verweigern“ ${datenschutzMikro(f).join(', ')}`, problem: 'kamera-mikrofon-datenschutz', schwere: 3 },
          { id: 'kein-mikro', wenn: f => num(f['au.aufnahmeAktiv']) === 0, befund: () => 'Windows hat kein einziges aktives Mikrofon', problem: 'kamera-kein-mikrofon-gefunden', schwere: 3 },
          { id: 'stumm', wenn: f => ja(f['aub.standardAufnahmeStumm']) || ja(f['aub.kommAufnahmeStumm']) || num(f['aub.standardAufnahmePegel']) < 10, befund: f => `Mikrofon ${txt(f['aub.standardAufnahme'])} ist ${ja(f['aub.standardAufnahmeStumm']) || ja(f['aub.kommAufnahmeStumm']) ? 'in Windows stummgeschaltet' : 'auf ' + f['aub.standardAufnahmePegel'] + ' % Pegel'}`, problem: 'kamera-mikrofon-stumm-windows', schwere: 3 },
          { id: 'stereomix', wenn: f => ja(f['aub.kommAufnahmeStereomix']), befund: f => `Als Gesprächs-Mikrofon ist „${txt(f['aub.kommAufnahme'])}“ eingestellt (Stereomix)`, problem: 'audio-stereomix-als-mikrofon', schwere: 3 },
          { id: 'leise', wenn: f => num(f['aub.standardAufnahmePegel']) >= 10 && num(f['aub.standardAufnahmePegel']) < 30, befund: f => `Mikrofonpegel nur ${f['aub.standardAufnahmePegel']} %`, problem: 'audio-mikrofon-zu-leise', schwere: 2 },
          { id: 'virtuell', wenn: f => ja(f['aub.kommAufnahmeVirtuell']), befund: f => `Als Gesprächs-Mikrofon ist ein virtuelles Gerät eingestellt: ${txt(f['aub.kommAufnahme'])}`, problem: 'kamera-virtuelles-mikrofon', schwere: 2 },
          { id: 'falsches', wenn: f => ja(f['au.headsetAktiv']) && nein(f['aub.aufnahmeIstHeadset']), befund: f => `Headset ist verbunden, Standard-Mikrofon ist aber ${txt(f['aub.standardAufnahme'])}`, problem: 'kamera-falsches-mikrofon', schwere: 2 },
        ],
        ohneBefund: ['audio-headset-mikrofon-geht-nicht', 'kamera-kein-mikrofon-gefunden', 'kamera-mikrofon-datenschutz', 'audio-mikrofon-zu-leise'],
      },
      {
        id: 'au-headset', titel: 'Headset wird nicht erkannt oder falsches Gerät', beschreibung: 'Headset fehlt in der Auswahl, Ton kommt aus dem Laptop statt aus dem Headset, Mikrofon vom Laptop statt vom Headset',
        sonden: ['au', 'aub'],
        fragen: [{ id: 'angesteckt', text: 'Ist das Headset gerade angesteckt bzw. eingeschaltet?' }],
        regeln: [
          { id: 'deaktiviert', wenn: f => ja(f['au.headsetDeaktiviert']), befund: f => `Headset ist im Sound-Dialog deaktiviert: ${txt(f['au.headsetName'])}`, problem: 'audio-geraet-deaktiviert', schwere: 3 },
          { id: 'nicht-da', wenn: f => nein(f['au.headsetAktiv']) && f['frage.angesteckt'] === 'ja', befund: f => ja(f['au.headsetBekannt']) ? 'Headset war schon einmal verbunden, wird aber gerade NICHT erkannt' : 'Windows erkennt kein Headset (USB/Bluetooth)', problem: 'audio-headset-nicht-erkannt', schwere: 3 },
          { id: 'lautsprecher', wenn: f => ja(f['au.headsetAktiv']) && nein(f['aub.standardIstHeadset']), befund: f => `Headset ist verbunden, Windows spielt aber über ${txt(f['aub.standardWiedergabe'])}`, problem: 'audio-ton-lautsprecher-statt-headset', schwere: 3 },
          { id: 'dienst', wenn: f => laeuftNicht(f['au.audiosrv']), befund: f => `Dienst „Windows-Audio“ läuft nicht (${txt(f['au.audiosrv'])})`, problem: 'audio-dienst-reagiert-nicht', schwere: 3 },
          { id: 'mikro', wenn: f => ja(f['au.headsetAktiv']) && nein(f['aub.aufnahmeIstHeadset']), befund: f => `Headset ist verbunden, Standard-Mikrofon ist aber ${txt(f['aub.standardAufnahme'])}`, problem: 'kamera-falsches-mikrofon', schwere: 2 },
          { id: 'zwei-geraete', wenn: f => ja(f['aub.kommUnterschiedlich']), befund: f => `Gespräche laufen über ${txt(f['aub.kommWiedergabe'])}, Musik/Systemtöne über ${txt(f['aub.standardWiedergabe'])}`, problem: 'audio-kommunikationsgeraet-anders', schwere: 2 },
          { id: 'doppelt', wenn: f => num(f['au.headsetWiedergabeAktiv']) >= 2, befund: f => `${f['au.headsetWiedergabeAktiv']} Headset-/USB-Wiedergabegeräte gleichzeitig aktiv (Kabel und Funk-Stick?)`, problem: 'audio-headset-doppelt-kabel-und-stick', schwere: 1 },
          { id: 'usb-fehler', wenn: f => num(f['au.usbFehler']) > 0, befund: f => `${f['au.usbFehler']} USB-Gerät(e) mit Fehler im Geräte-Manager`, problem: 'kamera-usb-ressourcen', schwere: 1 },
        ],
        ohneBefund: ['audio-headset-nicht-erkannt', 'audio-ton-lautsprecher-statt-headset', 'audio-headset-nach-standby', 'audio-jabra-link-stick'],
      },
      {
        id: 'au-kamera', titel: 'Kamera schwarz oder wird nicht gefunden', beschreibung: '„Wir finden Ihre Kamera nicht“, schwarzes Bild in Teams, Kamera „wird von einer anderen App verwendet“',
        sonden: ['kam', 'aub'],
        regeln: [
          { id: 'richtlinie', wenn: f => ja(f['kam.richtlinie']), befund: () => 'Kamera ist per Gruppenrichtlinie/Intune gesperrt', problem: 'kamera-von-organisation-gesperrt', schwere: 3 },
          { id: 'bios', wenn: f => ja(f['kam.biosAus']), befund: () => 'Kamera ist im HP-BIOS abgeschaltet', problem: 'kamera-im-bios-abgeschaltet', schwere: 3 },
          { id: 'keine', wenn: f => num(f['kam.anzahl']) === 0 || liste(f['kam.deaktiviert']).length > 0 || liste(f['kam.fehler']).length > 0, befund: f => liste(f['kam.deaktiviert']).length ? `Kamera ist im Geräte-Manager deaktiviert: ${txt(f['kam.deaktiviert'])}` : liste(f['kam.fehler']).length ? `Kamera hat einen Gerätefehler: ${txt(f['kam.fehler'])}` : 'Windows erkennt keine funktionierende Kamera', problem: 'kamera-nicht-gefunden', schwere: 3 },
          { id: 'mipi', wenn: f => ja(f['kam.mipiFehler']), befund: () => 'Kamera-Baustein (Intel IPU / Kamerasensor) hat einen Treiberfehler', problem: 'kamera-mipi-treiber-ipu', schwere: 3 },
          { id: 'datenschutz', wenn: f => verweigert(f['aub.camGeraet']) || verweigert(f['aub.camUser']), befund: f => `Kamera-Datenschutz steht auf „Verweigern“ (${verweigert(f['aub.camGeraet']) ? 'für das ganze Gerät' : 'für den Benutzer'})`, problem: 'kamera-fehler-0xa00f4246', schwere: 3 },
          { id: 'desktop', wenn: f => verweigert(f['aub.camDesktop']), befund: () => 'Kamera ist für Desktop-Programme (Teams, Zoom, Webex) gesperrt', problem: 'kamera-desktop-apps-gesperrt', schwere: 3 },
          { id: 'frameserver', wenn: f => txt(f['kam.frameServerStart']) === 'Disabled' || num(f['kam.frameServerAbstuerze7']) > 0, befund: f => txt(f['kam.frameServerStart']) === 'Disabled' ? 'Dienst „Windows-Kamera-Frameserver“ ist deaktiviert' : `Kamera-Frameserver ist in 7 Tagen ${f['kam.frameServerAbstuerze7']}× abgestürzt`, problem: 'kamera-frameserver-absturz', schwere: 2 },
          { id: 'belegt', wenn: f => liste(f['aub.kameraInBenutzung']).length > 0, befund: f => `Kamera wird gerade benutzt von: ${txt(f['aub.kameraInBenutzung'])}`, problem: 'kamera-andere-app', schwere: 2 },
        ],
        ohneBefund: ['kamera-teams-schwarz', 'kamera-hp-kamerataste', 'kamera-virtuelle-kamera', 'kamera-nach-standby-weg'],
      },
      {
        id: 'au-qualitaet', titel: 'Ton abgehackt, Echo, verzerrt oder wird leiser', beschreibung: 'Ton knackt oder hat Aussetzer, Gegenüber hört ein Echo, Stimme klingt blechern, Lautstärke sinkt bei Anrufen',
        sonden: ['au', 'aub', 'sys'],
        fragen: [{ id: 'echo', text: 'Hören Gesprächspartner ein Echo von sich selbst?' }, { id: 'akku', text: 'Tritt es nur im Akkubetrieb (ohne Netzteil) auf?' }],
        regeln: [
          { id: 'abstuerze', wenn: f => num(f['au.audiosrvAbstuerze7']) > 0, befund: f => `Der Audiodienst wurde in 7 Tagen ${f['au.audiosrvAbstuerze7']}× unerwartet beendet`, problem: 'audio-audiosrv-stuerzt-ab', schwere: 3 },
          { id: 'echo', wenn: f => f['frage.echo'] === 'ja' && nein(f['aub.standardIstHeadset']), befund: f => `Ton läuft über ${txt(f['aub.standardWiedergabe'])} statt über ein Headset – das Mikrofon nimmt den Lautsprecher wieder auf`, problem: 'audio-echo', schwere: 3 },
          { id: 'bt-blechern', wenn: f => ja(f['aub.kommIstBluetooth']), befund: () => 'Gespräche laufen über das Bluetooth-Freisprechprofil (Telefonqualität)', problem: 'audio-bluetooth-blechern', schwere: 2 },
          { id: 'generisch', wenn: f => ja(f['au.generischerTreiber']), befund: () => 'Nur der Windows-Standardtreiber „High Definition Audio“ ist geladen', problem: 'audio-generischer-hd-treiber', schwere: 2 },
          { id: 'akku', wenn: f => f['frage.akku'] === 'ja' && ja(f['sys.akku']), befund: () => 'Aussetzer nur im Akkubetrieb – Energiesparen bremst USB/Audio', problem: 'audio-aussetzer-im-akkubetrieb', schwere: 2 },
          { id: 'ducking', wenn: f => num(f['aub.ducking']) === 0, befund: () => 'Windows schaltet bei Anrufen alle anderen Töne stumm', problem: 'audio-lautstaerke-sinkt', schwere: 2 },
          { id: 'mono', wenn: f => ja(f['aub.mono']), befund: () => '„Mono-Audio“ ist eingeschaltet', problem: 'audio-mono-versehentlich-an', schwere: 2 },
          { id: 'uebersteuert', wenn: f => num(f['aub.standardAufnahmePegel']) >= 95 && ja(f['aub.aufnahmeIstHeadset']), befund: f => `Headset-Mikrofon steht auf ${f['aub.standardAufnahmePegel']} % – kann übersteuern`, problem: 'kamera-mikrofon-verzerrt', schwere: 1 },
        ],
        ohneBefund: ['audio-knistern', 'audio-echo', 'teams-ton-abgehackt', 'kamera-mikrofon-verzerrt'],
      },
      {
        id: 'au-bluetooth', titel: 'Bluetooth-Headset koppelt nicht oder klingt schlecht', beschreibung: 'Bluetooth-Headset verbindet sich nicht, kein Mikrofon am Bluetooth-Headset, Ton blechern oder zu leise',
        sonden: ['au', 'aub'],
        fragen: [{ id: 'gekoppelt', text: 'Ist das Bluetooth-Headset eingeschaltet und mit dem Laptop gekoppelt?' }],
        regeln: [
          { id: 'kein-adapter', wenn: f => num(f['au.btAdapter']) === 0, befund: () => 'Der PC hat keinen (funktionierenden) Bluetooth-Adapter', problem: 'hardware-bluetooth-fehlt', schwere: 3 },
          { id: 'bthserv', wenn: f => laeuftNicht(f['au.bthserv']), befund: f => `Bluetooth-Unterstützungsdienst läuft nicht (${txt(f['au.bthserv'])})`, problem: 'audio-bt-gekoppelt-nicht-verbunden', schwere: 3 },
          { id: 'btag', wenn: f => txt(f['au.btagStart']) === 'Disabled', befund: () => 'Dienst „Bluetooth-Audiogateway“ ist deaktiviert – das Headset-Mikrofon fehlt', problem: 'kamera-bluetooth-headset-ohne-mikrofon', schwere: 3 },
          { id: 'treiber', wenn: f => num(f['au.btFehler']) > 0, befund: f => `${f['au.btFehler']} Bluetooth-Gerät(e) mit Treiberfehler`, problem: 'audio-bt-treiberfehler', schwere: 3 },
          { id: 'nicht-verbunden', wenn: f => num(f['au.btAktiv']) === 0 && f['frage.gekoppelt'] === 'ja', befund: () => 'Kein Bluetooth-Audiogerät ist gerade verbunden', problem: 'audio-bluetooth-headset-koppelt-nicht', schwere: 2 },
          { id: 'blechern', wenn: f => ja(f['aub.kommIstBluetooth']), befund: () => 'Gespräche laufen über das Bluetooth-Freisprechprofil (Telefonqualität)', problem: 'audio-bluetooth-blechern', schwere: 2 },
          { id: 'doppelt', wenn: f => ja(f['au.btHandsfreeAktiv']) && ja(f['au.btStereoAktiv']), befund: () => 'Das Headset ist doppelt da: „Kopfhörer“ (Stereo) und „Headset“ (Freisprechen)', problem: 'audio-bt-doppelt-kopfhoerer-headset', schwere: 1 },
          { id: 'leise', wenn: f => ja(f['aub.standardIstBluetooth']) && num(f['aub.standardWiedergabePegel']) < 30, befund: f => `Bluetooth-Kopfhörer läuft mit nur ${f['aub.standardWiedergabePegel']} % Lautstärke`, problem: 'audio-bluetooth-zu-leise', schwere: 1 },
        ],
        ohneBefund: ['audio-bluetooth-headset-koppelt-nicht', 'audio-bt-headset-trennt-sich', 'audio-bluetooth-handy-statt-laptop', 'kamera-bluetooth-headset-ohne-mikrofon'],
      },
    ],
  },
]
