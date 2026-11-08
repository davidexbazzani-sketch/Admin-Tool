// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „tmeet“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Teams-Besprechungen, Anrufe, Audio/Video in Teams.
//
// Audio (Projektwissen, vgl. bausteine/peripherie.ts):
//   • Geräteliste nur vollständig aus der Registry (MMDevices\Audio\Render|Capture), DeviceState -band 0xF (1 = aktiv).
//   • Geräteeigenschaften (exklusiver Modus, Audioverbesserungen) gehen über IPolicyConfig::SetPropertyValue —
//     im Benutzerkontext OHNE Adminrechte (lokal gemessen: Setzen + Zurücklesen + Registry-Gegenprobe).
//     Nicht gesetzt = VT_EMPTY → Windows-Standard (exklusiv erlaubt, Verbesserungen an).
//   • App-Lautstärke (Lautstärkemixer) über IAudioSessionManager2 → Sitzungen je Prozess (ISimpleAudioVolume).
//     Eine Sitzung gibt es erst, wenn das Programm seit dem Start schon einmal Ton benutzt hat.
// Neues Teams speichert Fensterpositionen in …\MSTeams\app_settings.json (*_window_placement, main_window_bounds);
// ConvertFrom-Json/ConvertTo-Json -Depth 20 übersteht die Datei verlustfrei (lokal geprüft, Arrays bleiben Arrays).

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** C#: IPolicyConfig (Eigenschaften lesen/schreiben) + Sitzungen des Lautstärkemixers. Typnamen mit „Tm“ (eindeutig). */
const TM_AUDIO_CS = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct TmPk { public Guid fmtid; public int pid; public TmPk(string g, int p) { fmtid = new Guid(g); pid = p; } }
[StructLayout(LayoutKind.Explicit, Size = 24)] public struct TmPv { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public short b; [FieldOffset(8)] public uint ui; [FieldOffset(16)] public long rest; }
[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITmPolicyConfig {
  [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr f);
  [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, int d, IntPtr f);
  [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id);
  [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr a, IntPtr b);
  [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, int d, IntPtr a, IntPtr b);
  [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr a);
  [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr m);
  [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr m);
  [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, int fx, ref TmPk k, out TmPv v);
  [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, int fx, ref TmPk k, ref TmPv v);
  [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
  [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string id, int visible);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITmDevice {
  [PreserveSig] int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetState(out int state);
}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITmEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IntPtr col);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out ITmDevice dev);
  [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out ITmDevice dev);
}
[ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITmSessionManager2 {
  [PreserveSig] int GetAudioSessionControl(IntPtr g, int f, out IntPtr c);
  [PreserveSig] int GetSimpleAudioVolume(IntPtr g, int f, out IntPtr v);
  [PreserveSig] int GetSessionEnumerator(out ITmSessionEnum e);
}
[ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITmSessionEnum {
  [PreserveSig] int GetCount(out int n);
  [PreserveSig] int GetSession(int i, out ITmSessionControl2 s);
}
[ComImport, Guid("bfb7ff88-7239-4fc9-8fa2-07c950be9c6d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITmSessionControl2 {
  [PreserveSig] int GetState(out int s);
  [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string n);
  [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string n, ref Guid g);
  [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string n);
  [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string n, ref Guid g);
  [PreserveSig] int GetGroupingParam(out Guid g);
  [PreserveSig] int SetGroupingParam(ref Guid g, ref Guid c);
  [PreserveSig] int RegisterAudioSessionNotification(IntPtr p);
  [PreserveSig] int UnregisterAudioSessionNotification(IntPtr p);
  [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string s);
  [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string s);
  [PreserveSig] int GetProcessId(out uint pid);
  [PreserveSig] int IsSystemSoundsSession();
  [PreserveSig] int SetDuckingPreference(bool o);
}
[ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface ITmSimpleVolume {
  [PreserveSig] int SetMasterVolume(float v, ref Guid g);
  [PreserveSig] int GetMasterVolume(out float v);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g);
  [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool m);
}
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class TmPolicyCo { }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class TmEnumCo { }
public class TmSitzung { public string Geraet; public uint Pid; public bool System; public int Pegel; public bool Stumm; internal ITmSimpleVolume Vol; }
public static class TmAudio {
  static ITmPolicyConfig Pc() { return (ITmPolicyConfig)(new TmPolicyCo()); }
  // -1 = nicht lesbar, 2 = nicht gesetzt (Windows-Standard), sonst 0/1
  public static int GetFlag(string id, string fmt, int pid) { var k = new TmPk(fmt, pid); TmPv v; if (Pc().GetPropertyValue(id, 0, ref k, out v) != 0) return -1; if (v.vt == 0) return 2; if (v.vt == 11) return v.b != 0 ? 1 : 0; if (v.vt == 19 || v.vt == 3) return v.ui != 0 ? 1 : 0; return -1; }
  public static void SetBool(string id, string fmt, int pid, bool val) { var k = new TmPk(fmt, pid); var v = new TmPv(); v.vt = 11; v.b = (short)(val ? -1 : 0); Marshal.ThrowExceptionForHR(Pc().SetPropertyValue(id, 0, ref k, ref v)); }
  public static void SetUInt(string id, string fmt, int pid, uint val) { var k = new TmPk(fmt, pid); var v = new TmPv(); v.vt = 19; v.ui = val; Marshal.ThrowExceptionForHR(Pc().SetPropertyValue(id, 0, ref k, ref v)); }
  public static List<TmSitzung> Sitzungen(string[] ids) {
    var l = new List<TmSitzung>();
    var en = (ITmEnumerator)(new TmEnumCo());
    foreach (var id in ids) {
      ITmDevice d; if (en.GetDevice(id, out d) != 0 || d == null) continue;
      var g = typeof(ITmSessionManager2).GUID; object o;
      if (d.Activate(ref g, 23, IntPtr.Zero, out o) != 0 || o == null) continue;
      ITmSessionEnum se; if (((ITmSessionManager2)o).GetSessionEnumerator(out se) != 0 || se == null) continue;
      int n; se.GetCount(out n);
      for (int i = 0; i < n; i++) {
        ITmSessionControl2 s; if (se.GetSession(i, out s) != 0 || s == null) continue;
        var t = new TmSitzung(); t.Geraet = id; s.GetProcessId(out t.Pid); t.System = s.IsSystemSoundsSession() == 0;
        var v = (ITmSimpleVolume)s; float f; v.GetMasterVolume(out f); t.Pegel = (int)Math.Round(f * 100); v.GetMute(out t.Stumm); t.Vol = v;
        l.Add(t);
      }
    }
    return l;
  }
  public static void Voll(TmSitzung t) { var g = Guid.Empty; Marshal.ThrowExceptionForHR(t.Vol.SetMasterVolume(1.0f, ref g)); Marshal.ThrowExceptionForHR(t.Vol.SetMute(false, ref g)); float f; t.Vol.GetMasterVolume(out f); t.Pegel = (int)Math.Round(f * 100); t.Vol.GetMute(out t.Stumm); }
}
`.trim()

/** Core Audio laden + Geräteliste aus der Registry (Name wie im Sound-Dialog, Endpunkt-ID, Zustand). */
const TM_AUDIO_PS = String.raw`
Add-Type -TypeDefinition @'
${TM_AUDIO_CS}
'@ -EA Stop
function TmGeraete {
  foreach ($f in @(@{ S = 'Render'; T = 'Wiedergabe'; F = 0 }, @{ S = 'Capture'; T = 'Aufnahme'; F = 1 })) {
    foreach ($k in Get-ChildItem ('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\' + $f.S) -EA SilentlyContinue) {
      $roh = (Get-ItemProperty $k.PSPath -Name DeviceState -EA SilentlyContinue).DeviceState
      if ($null -eq $roh) { continue }
      $p = Get-ItemProperty (Join-Path $k.PSPath 'Properties') -EA SilentlyContinue
      $g = [string]$p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'; $t = [string]$p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
      if (-not $g) { continue }
      $fx = 0; try { $fx = @((Get-Item (Join-Path $k.PSPath 'FxProperties') -EA Stop).GetValueNames()).Count } catch {}
      [pscustomobject]@{ Fluss = $f.F; Typ = $f.T; Name = $(if ($t) { $g + ' (' + $t + ')' } else { $g }); Guid = $k.PSChildName; Id = ('{0.0.' + $f.F + '.00000000}.' + $k.PSChildName); Zustand = ([int]$roh -band 0xF); Effekte = ($fx -gt 0) }
    }
  }
}
function TmAn([int]$v) { switch ($v) { 2 { 'an (Windows-Standard)' } 1 { 'an' } 0 { 'aus' } default { 'unbekannt' } } }
$TM_GERAET = 'b3f8fa53-0004-438e-9003-51a46e139bfc'
$TM_SYSFX = '1da5d803-d492-4edd-8c23-e0c0ffee7f0e'
`

export const AKTIONEN_TMEET4: PaAktion[] = [
  // ══ Diagnose ════════════════════════════════════════════════════════════════
  A({ id: 'tmeet-medien-faehigkeiten', titel: 'Kann der PC Teams-Video und -Effekte? (Prozessor/AVX2, Arbeitsspeicher, Grafik, Kamera, Strom)', modus: 'system', risiko: 'lesen', timeoutMs: 60000,
    beschreibung: 'Zeigt, was Teams für Video, Hintergrundeffekte und Rauschunterdrückung vom PC braucht: Prozessor mit Kernen und AVX2 (Pflicht für Hintergrund weichzeichnen/ersetzen und Rauschunterdrückung „Hoch“), Auslastung, Arbeitsspeicher, Grafik mit Treiberdatum, NPU (Windows-Studio-Effekte), Kameras sowie Netzteil/Akku, Energiesparmodus und Energieplan — mit Bewertung. Ändert nichts.',
    ps: String.raw`
Add-Type -Namespace TmNative -Name K32 -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(uint f); [StructLayout(LayoutKind.Sequential)] public struct Sps { public byte Ac; public byte Flag; public byte Prozent; public byte Status; public int Rest; public int Voll; } [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out Sps s);' -EA Stop
$cpu = @(Get-CimInstance Win32_Processor -EA SilentlyContinue)
$kerne = 0; $threads = 0; $last = @()
foreach ($c in $cpu) { $kerne += [int]$c.NumberOfCores; $threads += [int]$c.NumberOfLogicalProcessors; $last += [int]$c.LoadPercentage }
$avx2 = [TmNative.K32]::IsProcessorFeaturePresent(40)
Zeile ('Prozessor: ' + $(if ($cpu.Count) { ([string]$cpu[0].Name).Trim() } else { '?' }) + ' · ' + $kerne + ' Kerne / ' + $threads + ' Threads · AVX2: ' + (Ja $avx2))
if ($last.Count) { Zeile ('Prozessorlast gerade: ' + ($last -join '/') + ' %') }
$os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
$ramGb = 0
if ($os) { $ramGb = [math]::Round([double]$os.TotalVisibleMemorySize / 1MB, 1); Zeile ('Arbeitsspeicher: ' + $ramGb + ' GB, frei ' + [math]::Round([double]$os.FreePhysicalMemory / 1MB, 1) + ' GB') }
foreach ($g in @(Get-CimInstance Win32_VideoController -EA SilentlyContinue)) {
  $dt = ''; try { if ($g.DriverDate) { $dt = ([datetime]$g.DriverDate).ToString('dd.MM.yyyy') } } catch {}
  Zeile ('Grafik: ' + $g.Name + ' · Treiber ' + $g.DriverVersion + $(if ($dt) { ' vom ' + $dt } else { '' }))
}
$npu = @(Get-PnpDevice -Class ComputeAccelerator -PresentOnly -EA SilentlyContinue)
Zeile ('NPU (Windows-Studio-Effekte): ' + $(if ($npu.Count) { (($npu | ForEach-Object { $_.FriendlyName + ' [' + $_.Status + ']' }) -join ', ') } else { 'keine' }))
$kam = @(Get-PnpDevice -Class Camera, Image -PresentOnly -EA SilentlyContinue | Where-Object { $_.FriendlyName -notmatch 'scanner|scan' })
Zeile ('Kameras: ' + $(if ($kam.Count) { (($kam | ForEach-Object { $_.FriendlyName + ' [' + $_.Status + ']' }) -join ', ') } else { 'KEINE erkannt' }))
$s = New-Object TmNative.K32+Sps
if ([TmNative.K32]::GetSystemPowerStatus([ref]$s)) {
  $netz = $(switch ([int]$s.Ac) { 0 { 'Akku' } 1 { 'Netzteil' } default { 'unbekannt' } })
  Zeile ('Stromversorgung: ' + $netz + $(if ([int]$s.Prozent -le 100) { ' · Akku ' + [int]$s.Prozent + ' %' } else { '' }) + ' · Energiesparmodus: ' + $(if ([int]$s.Status -band 1) { 'AN (Windows drosselt Prozessor und Hintergrund)' } else { 'aus' }))
}
$plan = (& powercfg.exe /getactivescheme 2>$null | Out-String).Trim()
if ($plan) { Zeile ('Energieplan: ' + ($plan -replace '^.*\(([^)]+)\).*$', '$1')) }
Zeile ('Bewertung Hintergrund weichzeichnen/ersetzen und Rauschunterdrückung „Hoch“: ' + $(if ($avx2) { 'vom Prozessor unterstützt' } else { 'NICHT möglich – der Prozessor hat kein AVX2 (Teams blendet die Optionen aus)' }))
if ($kerne -lt 4 -or $ramGb -lt 7.5) { Zeile ('Bewertung Video: knapp (' + $kerne + ' Kerne, ' + $ramGb + ' GB) – Teams reduziert bei Last Video, Effekte und Galerie; Richtwert für flüssige Video-Besprechungen mit Effekten: ab 4 Kernen und 8 GB.') }
else { Zeile 'Bewertung Video: Ausstattung reicht für Video-Besprechungen mit Effekten.' }` }),
  // ══ Audio in Teams beheben ══════════════════════════════════════════════════
  A({ id: 'tmeet-audio-exklusiv-aus', titel: 'Exklusiven Zugriff auf Headset/Mikrofon abschalten (Teams/Xelion blockieren sich nicht mehr)', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Schaltet „Anwendungen haben alleinige Kontrolle über dieses Gerät“ und „Anwendungen im exklusiven Modus Vorrang geben“ für die aktiven Audiogeräte aus (wie mmsys.cpl → Eigenschaften → Erweitert). Dann kann kein Programm (Xelion, Diktiersoftware, abgestürzter Anruf) Headset oder Mikrofon für Teams sperren. Leer = alle aktiven Geräte. Zeigt vorher/nachher.',
    param: { label: 'Gerät (Teil des Namens) – leer = alle aktiven', platzhalter: 'z. B. Jabra', vorlagen: ['Jabra', 'Headset', 'Mikrofon', 'Lautsprecher'] },
    ps: String.raw`
$t = ''
if ($P -and $P.Trim()) {
  if ($P -notmatch '^\s*([\w ().,+&#/-]{2,60}?)\s*$') { throw 'Bitte einen Gerätenamen (Teil) angeben, z. B. „Jabra“ – oder leer lassen für alle aktiven Geräte.' }
  $t = $matches[1].Trim()
}
${TM_AUDIO_PS}
$aktiv = @(TmGeraete | Where-Object { $_.Zustand -eq 1 })
$l = $aktiv
if ($t) { $l = @($aktiv | Where-Object { $_.Name.IndexOf($t, [StringComparison]::OrdinalIgnoreCase) -ge 0 }) }
if (-not $l.Count) { throw ('Kein aktives Audiogerät passt zu „' + $t + '“. Aktiv sind: ' + (($aktiv | ForEach-Object { $_.Typ + ': ' + $_.Name }) -join ' | ')) }
if ($l.Count -gt 12) { throw ('Zu viele Geräte (' + $l.Count + ') – bitte einen Namen angeben.') }
$n = 0
foreach ($g in $l) {
  $a3 = [TmAudio]::GetFlag($g.Id, $TM_GERAET, 3); $a4 = [TmAudio]::GetFlag($g.Id, $TM_GERAET, 4)
  if ($a3 -eq 0 -and $a4 -eq 0) { Zeile ($g.Typ + ' ' + $g.Name + ': exklusiver Zugriff war schon aus'); continue }
  [TmAudio]::SetBool($g.Id, $TM_GERAET, 3, $false)
  [TmAudio]::SetBool($g.Id, $TM_GERAET, 4, $false)
  $b3 = [TmAudio]::GetFlag($g.Id, $TM_GERAET, 3); $b4 = [TmAudio]::GetFlag($g.Id, $TM_GERAET, 4)
  Zeile ($g.Typ + ' ' + $g.Name + ': alleinige Kontrolle ' + (TmAn $a3) + ' → ' + (TmAn $b3) + ' · Vorrang ' + (TmAn $a4) + ' → ' + (TmAn $b4))
  $n++
}
Zeile ('Geändert: ' + $n + ' Gerät(e). Ein Programm, das ein Gerät gerade exklusiv hält, gibt es erst beim Beenden frei – Teams bzw. Xelion danach neu starten.')` }),
  A({ id: 'tmeet-audio-verbesserungen', titel: 'Audioverbesserungen eines Geräts ab- oder wieder einschalten (Echo, Roboterstimme, Aussetzer)', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Schaltet die Audioverbesserungen des Treibers (Realtek/Waves MaxxAudio/Dolby/HP-Rauschfilter) für ein Mikrofon oder einen Lautsprecher ab bzw. wieder ein – wie Einstellungen → Sound → Gerät → „Audioverbesserungen“. Doppelte Rauschunterdrückung und Echofilter neben Teams verursachen Aussetzer, Roboterstimme und Echo. Zeigt vorher/nachher; wirkt ab dem nächsten Anruf.',
    param: { label: 'Gerät (Teil des Namens) = aus | an', platzhalter: 'Mikrofon = aus', pflicht: true, vorlagen: ['Mikrofon = aus', 'Mikrofonarray = aus', 'Lautsprecher = aus', 'Jabra = aus', 'Mikrofon = an'] },
    ps: String.raw`
if ($P -notmatch '^\s*([\w ().,+&#/-]{2,60}?)\s*=\s*(aus|an)\s*$') { throw 'Bitte im Format „Mikrofon = aus“ bzw. „Lautsprecher = an“ angeben.' }
$t = $matches[1].Trim(); $aus = ($matches[2] -ieq 'aus')
${TM_AUDIO_PS}
$aktiv = @(TmGeraete | Where-Object { $_.Zustand -eq 1 })
$l = @($aktiv | Where-Object { $_.Name.IndexOf($t, [StringComparison]::OrdinalIgnoreCase) -ge 0 })
if (-not $l.Count) { throw ('Kein aktives Audiogerät passt zu „' + $t + '“. Aktiv sind: ' + (($aktiv | ForEach-Object { $_.Typ + ': ' + $_.Name }) -join ' | ')) }
if ($l.Count -gt 4) { throw ('„' + $t + '“ passt auf ' + $l.Count + ' Geräte – bitte genauer angeben: ' + (($l | ForEach-Object { $_.Name }) -join ' | ')) }
foreach ($g in $l) {
  $v = [TmAudio]::GetFlag($g.Id, $TM_SYSFX, 5)
  $vorTxt = $(if ($v -eq 1) { 'aus' } elseif ($v -eq 0 -or $v -eq 2) { 'an' } else { 'unbekannt' })
  [TmAudio]::SetUInt($g.Id, $TM_SYSFX, 5, $(if ($aus) { [uint32]1 } else { [uint32]0 }))
  $w = [TmAudio]::GetFlag($g.Id, $TM_SYSFX, 5)
  $nachTxt = $(if ($w -eq 1) { 'aus' } elseif ($w -eq 0) { 'an' } else { 'unbekannt' })
  Zeile ($g.Typ + ' ' + $g.Name + ': Audioverbesserungen ' + $vorTxt + ' → ' + $nachTxt + $(if (-not $g.Effekte) { ' (der Treiber meldet keine eigenen Effekte – die Änderung wirkt dann kaum)' } else { '' }))
}
Zeile 'Wirkt für neue Audioverbindungen – laufenden Anruf neu verbinden bzw. Teams neu starten. Treiber-Apps (Realtek Audio Console, HP Audio Control, Waves) können eigene Filter zusätzlich haben.'` }),
  A({ id: 'tmeet-app-lautstaerke', titel: 'Teams/Xelion im Lautstärkemixer auf 100 % und Ton an', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Zeigt die Lautstärke je Programm aus dem Windows-Lautstärkemixer (auch je Headset/Lautsprecher) und stellt Teams bzw. Xelion – oder alle stummen/leisen Programme – auf 100 % und hebt deren Stummschaltung auf. Hilft, wenn nur Teams leise oder stumm ist, obwohl Windows laut ist. Teams muss laufen und seit dem Start schon einmal Ton benutzt haben.',
    param: { label: 'Welche Programme', platzhalter: 'Teams', pflicht: true, optionen: ['Teams', 'Xelion', 'Alle stummen oder leisen Programme'] },
    ps: String.raw`
$wahl = $P.Trim()
if ($wahl -notmatch '^(teams|xelion|alle stummen oder leisen programme)$') { throw ('Unbekannte Auswahl: ' + $wahl) }
${TM_AUDIO_PS}
$geraete = @(TmGeraete | Where-Object { $_.Zustand -eq 1 })
$s = @([TmAudio]::Sitzungen([string[]]@($geraete | ForEach-Object { $_.Id })))
$namen = @{}
foreach ($x in $s) {
  $id = [int]$x.Pid
  if ($namen.ContainsKey($id)) { continue }
  $pn = $(if ($x.System) { 'Systemklänge' } else { '' })
  if (-not $pn -and $id) {
    $pr = Get-Process -Id $id -EA SilentlyContinue
    $pn = [string]$pr.ProcessName
    if ($pn -ieq 'msedgewebview2') { $cl = [string](Get-CimInstance Win32_Process -Filter ('ProcessId=' + $id) -EA SilentlyContinue).CommandLine; if ($cl -match 'MSTeams') { $pn = 'ms-teams (WebView2)' } }
  }
  $namen[$id] = $pn
}
function TmGeraetName([string]$id) { $g = @($geraete | Where-Object { $_.Id -ieq $id }); if ($g.Count) { $g[0].Typ + ' ' + $g[0].Name } else { $id } }
$ziel = @(foreach ($x in $s) {
  $pn = [string]$namen[[int]$x.Pid]
  if ($wahl -ieq 'teams' -and $pn -match '^ms-teams') { $x }
  elseif ($wahl -ieq 'xelion' -and $pn -match 'xelion') { $x }
  elseif ($wahl -like 'alle*' -and ($x.Stumm -or $x.Pegel -lt 50)) { $x }
})
Zeile ('Programme mit Ton gerade: ' + $(if ($s.Count) { ((@($s | ForEach-Object { [string]$namen[[int]$_.Pid] + ' ' + $_.Pegel + ' %' + $(if ($_.Stumm) { ' stumm' } else { '' }) }) | Where-Object { $_ -notmatch '^ ' } | Select-Object -Unique) -join ', ') } else { 'keine' }))
if (-not $ziel.Count) {
  if ($wahl -like 'alle*') { Zeile 'Kein Programm ist im Lautstärkemixer stumm oder unter 50 % – nichts zu tun.' }
  else { Zeile ('Keine Audiositzung von ' + $wahl + ' gefunden – es läuft nicht oder hat seit dem Start noch keinen Ton benutzt. Einen Testanruf starten und den Baustein dann erneut ausführen.') }
} else {
  foreach ($x in $ziel) {
    $vor = '' + $x.Pegel + ' %' + $(if ($x.Stumm) { ' (stumm)' } else { '' })
    [TmAudio]::Voll($x)
    Zeile ([string]$namen[[int]$x.Pid] + ' auf ' + (TmGeraetName $x.Geraet) + ': ' + $vor + ' → ' + $x.Pegel + ' %' + $(if ($x.Stumm) { ' (weiter stumm)' } else { '' }))
  }
}` }),

  // ══ Teams-Fenster ═══════════════════════════════════════════════════════════
  A({ id: 'tmeet-fensterposition-zuruecksetzen', titel: 'Gespeicherte Teams-Fensterpositionen zurücksetzen (Besprechungsfenster außerhalb des Bildschirms)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet das neue Teams des Benutzers und entfernt aus seiner Einstellungsdatei (app_settings.json) nur die gemerkten Positionen von Haupt-, Besprechungs-, Anruf- und Chatfenster – z. B. auf einem Monitor, der nicht mehr angeschlossen ist. Die Datei wird vorher gesichert (*.alt_…), alle anderen Teams-Einstellungen bleiben. Beim nächsten Start öffnen die Fenster auf dem Hauptbildschirm.',
    ps: String.raw`
NeedUser
$f = Join-Path $uLocal 'Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams\app_settings.json'
if (-not (Test-Path -LiteralPath $f)) { throw 'Das neue Teams hat für diesen Benutzer noch keine Einstellungsdatei (app_settings.json) – Teams einmal starten.' }
$j = $null; try { $j = [IO.File]::ReadAllText($f) | ConvertFrom-Json } catch { throw ('app_settings.json ist nicht lesbar: ' + $_.Exception.Message) }
$mm = $j.meeting_window_placement
if ($mm -and $mm.screen) { Zeile ('Besprechungsfenster gemerkt auf: ' + $(if ($mm.screen.id) { [string]$mm.screen.id } else { 'Standard' }) + ' · Position ' + [string]$mm.normal_bounds.pos.x + '/' + [string]$mm.normal_bounds.pos.y + ' · Größe ' + [string]$mm.normal_bounds.size.width + '×' + [string]$mm.normal_bounds.size.height + ' · Zustand ' + [string]$mm.state) }
$mb = $j.main_window_bounds
if ($mb) { Zeile ('Hauptfenster gemerkt: Position ' + [string]$mb.pos.x + '/' + [string]$mb.pos.y + ' · Größe ' + [string]$mb.size.width + '×' + [string]$mb.size.height) }
$mon = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBasicDisplayParams -EA SilentlyContinue | Where-Object { $_.Active })
Zeile ('Angeschlossene Bildschirme gerade: ' + $mon.Count)
StopUser @('ms-teams')
$j = $null; try { $j = [IO.File]::ReadAllText($f) | ConvertFrom-Json } catch { throw ('app_settings.json ist nach dem Beenden nicht lesbar: ' + $_.Exception.Message) }
$keys = @($j.PSObject.Properties | Where-Object { $_.Name -match '_window_placement$|^main_window_bounds$|^main_window_maximized$' } | ForEach-Object { $_.Name })
if (-not $keys.Count) { Zeile 'Es sind keine Fensterpositionen gespeichert – nichts zu ändern.' }
else {
  $sich = $f + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
  Copy-Item -LiteralPath $f -Destination $sich -Force -EA Stop
  foreach ($k in $keys) { $j.PSObject.Properties.Remove($k) }
  $neu = $j | ConvertTo-Json -Depth 20 -Compress
  $null = $neu | ConvertFrom-Json
  [IO.File]::WriteAllText($f, $neu, (New-Object System.Text.UTF8Encoding($false)))
  Zeile ('Entfernt: ' + ($keys -join ', '))
  Zeile ('Sicherung: ' + (Split-Path $sich -Leaf) + ' – alle übrigen Teams-Einstellungen bleiben.')
  Zeile 'Beim nächsten Start (→ „Teams starten“) öffnen Haupt- und Besprechungsfenster wieder auf dem Hauptbildschirm.'
}` }),
]
