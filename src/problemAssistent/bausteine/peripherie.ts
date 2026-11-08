// ── Problem-Assistent: Lösungsbausteine Gruppe „peripherie“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
//
// Audio (Projektwissen, siehe services/audioDevices.ts):
//   • Die vollständige Geräteliste steht nur in der Registry (MMDevices\Audio\Render|Capture);
//     DeviceState ist ein Bitfeld → Zustand = -band 0xF (1 aktiv, 2 deaktiviert, 4 fehlt, 8 nicht eingesteckt).
//   • Gerätenamen sind NICHT eindeutig → angesprochen wird immer die Endpunkt-ID ({0.0.<fluss>.00000000}.<guid>).
//   • Standardgerät, Sichtbarkeit (Aktivieren) und Geräteeigenschaften (Abhören) gehen über die
//     Core-Audio-Schnittstelle IPolicyConfig (wie mmsys.cpl) — im Benutzerkontext, ohne Adminrechte.
//     Vtable-Reihenfolge exakt wie in AudioDeviceCmdlets; lokal gegengeprüft (GetPropertyValue liefert
//     denselben Wert wie IPropertyStore, SetDefaultEndpoint/SetEndpointVisibility/Pegel als No-op).

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** C#-Baustein für Core Audio: Standardgerät, Sichtbarkeit, Pegel/Stumm, Bool-Eigenschaften. */
const AUDIO_CS = String.raw`
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct PaPk { public Guid fmtid; public int pid; public PaPk(string g, int p) { fmtid = new Guid(g); pid = p; } }
[StructLayout(LayoutKind.Explicit, Size = 24)] public struct PaPv { [FieldOffset(0)] public ushort vt; [FieldOffset(8)] public short b; [FieldOffset(16)] public long rest; }
[ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPaEndpointVolume {
  [PreserveSig] int RegisterControlChangeNotify(IntPtr p);
  [PreserveSig] int UnregisterControlChangeNotify(IntPtr p);
  [PreserveSig] int GetChannelCount(out uint c);
  [PreserveSig] int SetMasterVolumeLevel(float db, ref Guid ctx);
  [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid ctx);
  [PreserveSig] int GetMasterVolumeLevel(out float db);
  [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
  [PreserveSig] int SetChannelVolumeLevel(uint ch, float db, ref Guid ctx);
  [PreserveSig] int SetChannelVolumeLevelScalar(uint ch, float level, ref Guid ctx);
  [PreserveSig] int GetChannelVolumeLevel(uint ch, out float db);
  [PreserveSig] int GetChannelVolumeLevelScalar(uint ch, out float level);
  [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid ctx);
  [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPaDevice {
  [PreserveSig] int Activate(ref Guid id, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o);
  [PreserveSig] int OpenPropertyStore(int access, out IntPtr store);
  [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
  [PreserveSig] int GetState(out int state);
}
[ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPaEnumerator {
  [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IntPtr col);
  [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IPaDevice dev);
  [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IPaDevice dev);
}
[ComImport, Guid("f8679f50-850a-41cf-9c72-430f290290c8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IPaPolicyConfig {
  [PreserveSig] int GetMixFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr f);
  [PreserveSig] int GetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, int d, IntPtr f);
  [PreserveSig] int ResetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id);
  [PreserveSig] int SetDeviceFormat([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr a, IntPtr b);
  [PreserveSig] int GetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, int d, IntPtr a, IntPtr b);
  [PreserveSig] int SetProcessingPeriod([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr a);
  [PreserveSig] int GetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr m);
  [PreserveSig] int SetShareMode([MarshalAs(UnmanagedType.LPWStr)] string id, IntPtr m);
  [PreserveSig] int GetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, int fx, ref PaPk k, out PaPv v);
  [PreserveSig] int SetPropertyValue([MarshalAs(UnmanagedType.LPWStr)] string id, int fx, ref PaPk k, ref PaPv v);
  [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string id, int role);
  [PreserveSig] int SetEndpointVisibility([MarshalAs(UnmanagedType.LPWStr)] string id, int visible);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class PaEnumCo { }
[ComImport, Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PaPolicyCo { }
public static class PaAudio {
  static IPaEnumerator En() { return (IPaEnumerator)(new PaEnumCo()); }
  static IPaPolicyConfig Pc() { return (IPaPolicyConfig)(new PaPolicyCo()); }
  static IPaDevice Dev(string id) { IPaDevice d; Marshal.ThrowExceptionForHR(En().GetDevice(id, out d)); return d; }
  static IPaEndpointVolume Vol(string id) { var g = typeof(IPaEndpointVolume).GUID; object o; Marshal.ThrowExceptionForHR(Dev(id).Activate(ref g, 23, IntPtr.Zero, out o)); return (IPaEndpointVolume)o; }
  public static string DefaultId(int flow, int role) { IPaDevice d; if (En().GetDefaultAudioEndpoint(flow, role, out d) != 0 || d == null) return ""; string id; d.GetId(out id); return id; }
  public static void SetDefault(string id) { var p = Pc(); for (int r = 0; r < 3; r++) Marshal.ThrowExceptionForHR(p.SetDefaultEndpoint(id, r)); }
  public static void SetVisible(string id) { Marshal.ThrowExceptionForHR(Pc().SetEndpointVisibility(id, 1)); }
  public static int GetVolume(string id) { float v; Marshal.ThrowExceptionForHR(Vol(id).GetMasterVolumeLevelScalar(out v)); return (int)Math.Round(v * 100); }
  public static bool GetMute(string id) { bool m; Marshal.ThrowExceptionForHR(Vol(id).GetMute(out m)); return m; }
  public static void SetVolume(string id, int pct) { var g = Guid.Empty; Marshal.ThrowExceptionForHR(Vol(id).SetMasterVolumeLevelScalar(pct / 100f, ref g)); }
  public static void SetMute(string id, bool m) { var g = Guid.Empty; Marshal.ThrowExceptionForHR(Vol(id).SetMute(m, ref g)); }
  public static int GetBool(string id, string fmt, int pid) { var k = new PaPk(fmt, pid); PaPv v; if (Pc().GetPropertyValue(id, 0, ref k, out v) != 0) return -1; if (v.vt != 11) return 0; return v.b != 0 ? 1 : 0; }
  public static void SetBool(string id, string fmt, int pid, bool val) { var k = new PaPk(fmt, pid); var v = new PaPv(); v.vt = 11; v.b = (short)(val ? -1 : 0); Marshal.ThrowExceptionForHR(Pc().SetPropertyValue(id, 0, ref k, ref v)); }
}
`.trim()

/** Core Audio laden + Geräteliste aus der Registry (alle Zustände, Name wie im Sound-Dialog, Endpunkt-ID). */
const AUDIO_PS = String.raw`
Add-Type -TypeDefinition @'
${AUDIO_CS}
'@ -EA Stop
function PaGeraete {
  foreach ($f in @(@{ S = 'Render'; T = 'Wiedergabe'; F = 0 }, @{ S = 'Capture'; T = 'Aufnahme'; F = 1 })) {
    foreach ($k in Get-ChildItem ('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\MMDevices\Audio\' + $f.S) -EA SilentlyContinue) {
      $roh = (Get-ItemProperty $k.PSPath -Name DeviceState -EA SilentlyContinue).DeviceState
      if ($null -eq $roh) { continue }
      $p = Get-ItemProperty (Join-Path $k.PSPath 'Properties') -EA SilentlyContinue
      $g = [string]$p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'; $t = [string]$p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'
      if (-not $g) { continue }
      [pscustomobject]@{ Fluss = $f.F; Typ = $f.T; Name = $(if ($t) { $g + ' (' + $t + ')' } else { $g }); Guid = $k.PSChildName; Id = ('{0.0.' + $f.F + '.00000000}.' + $k.PSChildName); Zustand = ([int]$roh -band 0xF) }
    }
  }
}
function PaZustand([int]$s) { switch ($s) { 1 { 'aktiv' } 2 { 'deaktiviert' } 4 { 'nicht vorhanden' } 8 { 'nicht eingesteckt' } default { 'Zustand ' + $s } } }
function PaSuche($liste, [string]$t) { @($liste | Where-Object { $_.Name.IndexOf($t, [StringComparison]::OrdinalIgnoreCase) -ge 0 }) }
function PaNameVon($liste, [string]$id) { $x = @($liste | Where-Object { $_.Id -ieq $id }); if ($x.Count) { $x[0].Name } elseif ($id) { $id } else { 'keins' } }
$ABHOEREN = '24dbb0fc-9311-4b3d-9cf0-18ff155639d4'
`

/** Aktuellen Netz-/Akku-Index einer Energieeinstellung lesen (auch ausgeblendete) → @(Netz, Akku) oder $null. */
const PWR_PS = String.raw`
function PaPwr([string]$sub, [string]$set) {
  $o = (& powercfg.exe /qh SCHEME_CURRENT $sub $set 2>$null | Out-String)
  $h = @([regex]::Matches($o, '0x([0-9a-fA-F]{8})') | ForEach-Object { [Convert]::ToInt32($_.Groups[1].Value, 16) })
  if ($h.Count -ge 2) { @($h[$h.Count - 2], $h[$h.Count - 1]) } else { $null }
}
`

export const AKTIONEN_PERIPHERIE: PaAktion[] = [
  // ══ Audio ═══════════════════════════════════════════════════════════════════
  A({ id: 'peri-audio-uebersicht', titel: 'Audio-Übersicht (Standardgerät, Pegel, deaktivierte Geräte)', modus: 'benutzer', risiko: 'lesen',
    beschreibung: 'Alle Wiedergabe- und Aufnahmegeräte wie im Sound-Dialog – auch deaktivierte –, welches Standard bzw. Standard für Kommunikation ist, Pegel, Stummschaltung und eingeschaltetes „Abhören“.',
    ps: String.raw`
${AUDIO_PS}
$l = @(PaGeraete)
$rolle = @{}
foreach ($f in 0, 1) { foreach ($r in 0, 2) { $d = [PaAudio]::DefaultId($f, $r); if ($d) { $w = $(if ($r -eq 0) { 'STANDARD' } else { 'Standard für Kommunikation' }); if ($rolle.ContainsKey($d)) { $rolle[$d] = $rolle[$d] + ' + Kommunikation' } else { $rolle[$d] = $w } } } }
foreach ($typ in 'Wiedergabe', 'Aufnahme') {
  $teil = @($l | Where-Object { $_.Typ -eq $typ } | Sort-Object @{ E = { if ($_.Zustand -eq 1) { 0 } elseif ($_.Zustand -eq 2) { 1 } else { 2 } } }, Name)
  Zeile ('— ' + $typ + ': ' + @($teil | Where-Object { $_.Zustand -eq 1 }).Count + ' aktiv, ' + @($teil | Where-Object { $_.Zustand -eq 2 }).Count + ' deaktiviert —')
  foreach ($g in @($teil | Where-Object { $_.Zustand -le 2 })) {
    $z = $g.Name + ' · ' + (PaZustand $g.Zustand)
    if ($rolle.ContainsKey($g.Id)) { $z += ' · ' + $rolle[$g.Id] }
    if ($g.Zustand -eq 1) {
      try { $z += ' · Pegel ' + [PaAudio]::GetVolume($g.Id) + ' %'; if ([PaAudio]::GetMute($g.Id)) { $z += ' · STUMM' } } catch {}
      if ($g.Fluss -eq 1 -and [PaAudio]::GetBool($g.Id, $ABHOEREN, 1) -eq 1) { $z += ' · „Abhören“ AN (Benutzer hört sich selbst)' }
    }
    Zeile ('  ' + $z)
  }
  $rest = @($teil | Where-Object { $_.Zustand -gt 2 }).Count
  if ($rest) { Zeile ('  + ' + $rest + ' frühere bzw. nicht eingesteckte Geräte (ausgeblendet)') }
}` }),
  A({ id: 'peri-audio-standard', titel: 'Standard-Audiogerät festlegen (z. B. Headset statt Monitor)', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Macht ein aktives Gerät zum Windows-Standard für Wiedergabe und Aufnahme (auch „Standard für Kommunikation“) – wie Rechtsklick → „Als Standardgerät festlegen“. Nur Geräte aus der Liste; der Name wird streng abgeglichen.',
    param: { label: 'Gerät (Teil des Namens, optional „Wiedergabe:“/„Aufnahme:“ davor)', platzhalter: 'z. B. Jabra', pflicht: true, vorlagen: ['Jabra', 'Jabra Link', 'Jabra Speak', 'Realtek', 'Wiedergabe: Jabra', 'Aufnahme: Jabra'] },
    ps: String.raw`
if ($P -notmatch '^\s*(?:(Wiedergabe|Aufnahme)\s*:\s*)?([\w ().,+&#/-]{2,60}?)\s*$') { throw 'Bitte einen Gerätenamen (Teil) angeben, z. B. „Jabra“ oder „Aufnahme: Jabra“.' }
$nur = [string]$matches[1]; $t = $matches[2].Trim()
${AUDIO_PS}
$l = @(PaGeraete)
$aktiv = @($l | Where-Object { $_.Zustand -eq 1 })
$n = 0
foreach ($f in 0, 1) {
  $typ = $(if ($f -eq 0) { 'Wiedergabe' } else { 'Aufnahme' })
  if ($nur -and $nur -ne $typ) { continue }
  $tr = @(PaSuche @($aktiv | Where-Object { $_.Fluss -eq $f }) $t)
  if ($tr.Count -gt 1) { $ex = @($tr | Where-Object { $_.Name -ieq $t }); if ($ex.Count -eq 1) { $tr = $ex } }
  $vor = [PaAudio]::DefaultId($f, 0)
  if (-not $tr.Count) { Zeile ($typ + ': kein aktives Gerät mit „' + $t + '“ – bleibt ' + (PaNameVon $l $vor)); continue }
  if ($tr.Count -gt 1) { throw ($typ + ': „' + $t + '“ ist mehrdeutig – ' + (($tr | ForEach-Object { $_.Name }) -join ' | ') + '. Bitte genauer angeben.') }
  [PaAudio]::SetDefault($tr[0].Id)
  $neu = [PaAudio]::DefaultId($f, 0)
  Zeile ($typ + ': vorher ' + (PaNameVon $l $vor) + ' → jetzt ' + (PaNameVon $l $neu) + ' (auch für Kommunikation)')
  $n++
}
if (-not $n) { throw ('Kein aktives Audiogerät passt zu „' + $t + '“. Aktiv sind: ' + (($aktiv | ForEach-Object { $_.Typ + ': ' + $_.Name }) -join ' | ')) }
Zeile 'Teams folgt dem Windows-Standard, wenn dort „Standardgerät“ eingestellt ist – sonst in Teams unter Einstellungen → Geräte auswählen.'` }),
  A({ id: 'peri-audio-pegel', titel: 'Lautstärke bzw. Mikrofonpegel eines Geräts setzen', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Setzt den Pegel (5–100 %) eines aktiven Lautsprechers/Headsets oder Mikrofons und hebt eine Stummschaltung in Windows auf. „Standard“ meint das aktuelle Standardgerät.',
    param: { label: 'Gerät = Prozent (optional „Wiedergabe:“/„Aufnahme:“ davor)', platzhalter: 'Aufnahme: Standard = 90', pflicht: true, vorlagen: ['Aufnahme: Standard = 90', 'Wiedergabe: Standard = 70', 'Aufnahme: Jabra = 90', 'Wiedergabe: Jabra = 80'] },
    ps: String.raw`
if ($P -notmatch '^\s*(?:(Wiedergabe|Aufnahme)\s*:\s*)?([\w ().,+&#/-]{2,60}?)\s*=\s*(\d{1,3})\s*%?\s*$') { throw 'Bitte im Format „Aufnahme: Standard = 90“ oder „Wiedergabe: Jabra = 70“ angeben.' }
$nur = [string]$matches[1]; $t = $matches[2].Trim(); $wert = [int]$matches[3]
if ($wert -lt 5 -or $wert -gt 100) { throw 'Der Pegel muss zwischen 5 und 100 % liegen (ganz aus = stummschalten).' }
${AUDIO_PS}
$l = @(PaGeraete)
$aktiv = @($l | Where-Object { $_.Zustand -eq 1 })
$fl = @(0, 1)
if ($nur -ieq 'Wiedergabe') { $fl = @(0) } elseif ($nur -ieq 'Aufnahme') { $fl = @(1) } elseif ($t -ieq 'Standard') { $fl = @(0) }
if ($t -ieq 'Standard') {
  $ziel = @(foreach ($f in $fl) { $d = [PaAudio]::DefaultId($f, 0); $aktiv | Where-Object { $_.Id -ieq $d } })
} else {
  $ziel = @(PaSuche @($aktiv | Where-Object { $fl -contains $_.Fluss }) $t)
  if ($ziel.Count -gt 1) { $ex = @($ziel | Where-Object { $_.Name -ieq $t }); if ($ex.Count -eq 1) { $ziel = $ex } }
}
if (-not $ziel.Count) { throw ('Kein aktives Gerät zu „' + $t + '“. Aktiv sind: ' + (($aktiv | ForEach-Object { $_.Typ + ': ' + $_.Name }) -join ' | ')) }
if ($ziel.Count -gt 1) { throw ('„' + $t + '“ passt auf mehrere Geräte: ' + (($ziel | ForEach-Object { $_.Typ + ': ' + $_.Name }) -join ' | ') + ' – bitte „Wiedergabe:“ bzw. „Aufnahme:“ voranstellen oder genauer angeben.') }
$g = $ziel[0]
$vp = [PaAudio]::GetVolume($g.Id); $vm = [PaAudio]::GetMute($g.Id)
[PaAudio]::SetVolume($g.Id, $wert)
if ($vm) { [PaAudio]::SetMute($g.Id, $false) }
Zeile ($g.Typ + ' ' + $g.Name + ': vorher ' + $vp + ' %' + $(if ($vm) { ' (stumm)' } else { '' }) + ' → jetzt ' + [PaAudio]::GetVolume($g.Id) + ' %' + $(if ([PaAudio]::GetMute($g.Id)) { ' (weiter stumm)' } else { ' (nicht stumm)' }))
if ($g.Fluss -eq 1) { Zeile 'Teams/Webex regeln den Mikrofonpegel evtl. automatisch nach – dort „Mikrofonlautstärke automatisch anpassen“ prüfen.' }` }),
  A({ id: 'peri-audio-aktivieren', titel: 'Im Sound-Dialog deaktiviertes Audiogerät aktivieren', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Schaltet ein in der Sound-Systemsteuerung deaktiviertes Headset, Mikrofon oder Lautsprecher wieder ein (wie Rechtsklick → „Aktivieren“). Nur Geräte, die wirklich deaktiviert sind.',
    param: { label: 'Gerät (Teil des Namens)', platzhalter: 'z. B. Jabra, Mikrofon', pflicht: true, vorlagen: ['Jabra', 'Mikrofon', 'Mikrofonarray', 'Lautsprecher', 'Kopfhörer'] },
    ps: String.raw`
if ($P -notmatch '^\s*([\w ().,+&#/-]{2,60}?)\s*$') { throw 'Bitte einen Gerätenamen (Teil) angeben, z. B. „Jabra“ oder „Mikrofon“.' }
$t = $matches[1].Trim()
${AUDIO_PS}
$l = @(PaGeraete)
$aus = @($l | Where-Object { $_.Zustand -eq 2 })
$tr = @(PaSuche $aus $t)
if (-not $aus.Count) { Zeile 'Kein Audiogerät ist im Sound-Dialog deaktiviert – nichts zu tun (fehlt es ganz, ist es nicht angeschlossen oder ohne Treiber).' }
elseif (-not $tr.Count) { throw ('Kein deaktiviertes Gerät zu „' + $t + '“. Deaktiviert sind: ' + (($aus | ForEach-Object { $_.Typ + ': ' + $_.Name }) -join ' | ')) }
elseif ($tr.Count -gt 4) { throw ('Zu viele Treffer (' + $tr.Count + ') – bitte genauer angeben: ' + (($tr | ForEach-Object { $_.Name }) -join ' | ')) }
else {
  foreach ($g in $tr) {
    [PaAudio]::SetVisible($g.Id)
    Start-Sleep -Milliseconds 500
    $jetzt = @(PaGeraete | Where-Object { $_.Guid -eq $g.Guid })
    $z = $(if ($jetzt.Count) { PaZustand $jetzt[0].Zustand } else { 'unbekannt' })
    Zeile ($g.Typ + ' ' + $g.Name + ': vorher deaktiviert → jetzt ' + $z + $(if ($z -eq 'deaktiviert') { ' (bitte Remote Doc „Audio & Sound“ → Aktivieren nutzen)' } else { '' }))
  }
}` }),
  A({ id: 'peri-audio-abhoeren-aus', titel: '„Dieses Gerät als Wiedergabequelle verwenden“ (Abhören) abschalten', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Schaltet bei allen aktiven Mikrofonen das „Abhören“ aus – der Benutzer hört sich dann nicht mehr selbst im Headset bzw. aus den Lautsprechern.',
    ps: String.raw`
${AUDIO_PS}
$mics = @(PaGeraete | Where-Object { $_.Fluss -eq 1 -and $_.Zustand -eq 1 })
$n = 0
foreach ($g in $mics) {
  if ([PaAudio]::GetBool($g.Id, $ABHOEREN, 1) -eq 1) {
    [PaAudio]::SetBool($g.Id, $ABHOEREN, 1, $false)
    $neu = [PaAudio]::GetBool($g.Id, $ABHOEREN, 1)
    Zeile ($g.Name + ': Abhören vorher an → jetzt ' + $(if ($neu -eq 0) { 'aus' } else { 'weiter an (mmsys.cpl → Aufnahme → Eigenschaften → Abhören)' }))
    $n++
  }
}
if (-not $n) { Zeile ('Bei keinem der ' + $mics.Count + ' aktiven Mikrofone ist „Abhören“ an – der Mithörton kommt dann vom Headset selbst (Jabra Direct → Mithörton).') }` }),
  A({ id: 'peri-audio-option', titel: 'Windows-Audio-Option des Benutzers setzen (Kommunikation / Mono-Audio)', modus: 'profil', risiko: 'aendern',
    beschreibung: '„Kommunikation“: ob Windows bei Anrufen andere Töne leiser macht. „Mono-Audio“: beide Kanäle auf beide Ohren (aus = Stereo; an = für Mono-Headsets mit einer Hörmuschel). Wirkt nach Neustart der Audiodienste.',
    param: { label: 'Einstellung', platzhalter: 'Kommunikation: keine Aktion', pflicht: true, optionen: ['Kommunikation: keine Aktion', 'Kommunikation: Standard (andere Töne 80 % leiser)', 'Mono-Audio aus', 'Mono-Audio an'] },
    ps: String.raw`
NeedHive
switch -Regex ($P) {
  '^kommunikation: keine' { $wn = 'UserDuckingPreference'; $w = 3; break }
  '^kommunikation: standard' { $wn = 'UserDuckingPreference'; $w = 1; break }
  '^mono-audio aus' { $wn = 'AccessibilityMonoMixState'; $w = 0; break }
  '^mono-audio an' { $wn = 'AccessibilityMonoMixState'; $w = 1; break }
  default { throw ('Unbekannte Auswahl: ' + $P) }
}
$k = $uHive + '\Software\Microsoft\Multimedia\Audio'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$v = (Get-ItemProperty $k -EA SilentlyContinue).$wn
$txt = @{ 'UserDuckingPreference' = @{ 0 = 'andere Töne stumm'; 1 = 'andere Töne 80 % leiser'; 2 = 'andere Töne 50 % leiser'; 3 = 'keine Aktion' }; 'AccessibilityMonoMixState' = @{ 0 = 'aus (Stereo)'; 1 = 'an' } }
$std = $(if ($wn -eq 'UserDuckingPreference') { 1 } else { 0 })
Set-ItemProperty -Path $k -Name $wn -Value $w -Type DWord
Zeile ($(if ($wn -eq 'UserDuckingPreference') { 'Bei Anrufen (Kommunikation)' } else { 'Mono-Audio' }) + ': vorher ' + $(if ($null -eq $v) { $txt[$wn][$std] + ' (Standard)' } else { $txt[$wn][[int]$v] }) + ' → jetzt ' + $txt[$wn][$w])
Zeile 'Wirkt nach „Audio-Dienste neu starten“ bzw. nach Ab- und Anmelden.'` }),

  // ══ Bildschirm & Grafik ═════════════════════════════════════════════════════
  A({ id: 'peri-gpu-praeferenz', titel: 'Grafikkarte für ein Programm festlegen (Hochleistung/Energiesparen)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Wie Einstellungen → Anzeige → Grafik: Ein Programm läuft auf der starken NVIDIA-/AMD-Grafik (Hochleistung), auf der Onboard-Grafik (Energiesparen) oder Windows entscheidet. Das Programm danach neu starten.',
    param: { label: 'Programm = Hochleistung | Energiesparen | Windows', platzhalter: 'SLDWORKS = Hochleistung', pflicht: true, vorlagen: ['SLDWORKS = Hochleistung', 'FreeCAD = Hochleistung', 'EModelViewer = Hochleistung', 'msedge = Energiesparen', 'chrome = Energiesparen'] },
    ps: String.raw`
NeedHive
if ($P -notmatch '^\s*(.+?)\s*=\s*(Hochleistung|Energiesparen|Windows)\s*$') { throw 'Bitte im Format „SLDWORKS = Hochleistung“ angeben (Hochleistung, Energiesparen oder Windows).' }
$prog = $matches[1].Trim().Trim('"'); $art = $matches[2]
$w = $(if ($art -ieq 'Hochleistung') { 2 } elseif ($art -ieq 'Energiesparen') { 1 } else { 0 })
$pfad = $null
if ($prog -match '^[A-Za-z]:\\[^<>"|?*]+\.exe$') { if (Test-Path -LiteralPath $prog) { $pfad = $prog } else { throw ('Datei nicht gefunden: ' + $prog) } }
else {
  $name = $prog -replace '\.exe$', ''
  if ($name -notmatch '^[A-Za-z0-9][A-Za-z0-9._ -]{1,40}$') { throw ('Ungültiger Programmname: ' + $prog) }
  $lp = @(UserProcs @($name) | Where-Object { $_.Path } | Select-Object -First 1)
  if ($lp.Count) { $pfad = [string]$lp[0].Path }
  if (-not $pfad) { $ap = Get-ItemProperty ('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\' + $name + '.exe') -EA SilentlyContinue; if ($ap) { $c = ([string]$ap.'(default)').Trim('"'); if ($c -and (Test-Path -LiteralPath $c)) { $pfad = $c } } }
  if (-not $pfad) { $gf = @(Get-ChildItem -Path 'C:\Program Files', 'C:\Program Files (x86)' -Filter ($name + '.exe') -Recurse -Depth 3 -File -EA SilentlyContinue | Select-Object -First 1); if ($gf.Count) { $pfad = $gf[0].FullName } }
  if (-not $pfad) { throw ('Programm „' + $name + '.exe“ nicht gefunden – bitte den vollständigen Pfad angeben, z. B. C:\Program Files\…\programm.exe = Hochleistung.') }
}
$k = $uHive + '\Software\Microsoft\DirectX\UserGpuPreferences'
if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
$alt = [string](Get-Item -LiteralPath $k).GetValue($pfad)
$neu = $(if ($alt -match 'GpuPreference=\d;') { $alt -replace 'GpuPreference=\d;', ('GpuPreference=' + $w + ';') } else { 'GpuPreference=' + $w + ';' + $alt })
Set-ItemProperty -LiteralPath $k -Name $pfad -Value $neu -Type String
$name2 = @{ 0 = 'Windows entscheidet'; 1 = 'Energiesparen (Onboard-Grafik)'; 2 = 'Hochleistung (starke Grafikkarte)' }
$av = $(if ($alt -match 'GpuPreference=(\d);') { $name2[[int]$matches[1]] } else { 'Windows entscheidet (nicht gesetzt)' })
Zeile ($pfad + ': vorher ' + $av + ' → jetzt ' + $name2[$w])
$gpu = @(Get-CimInstance Win32_VideoController -EA SilentlyContinue | ForEach-Object { $_.Name })
Zeile ('Grafikchips: ' + ($gpu -join ' | ') + $(if ($gpu.Count -lt 2) { ' – nur einer vorhanden, die Auswahl wirkt erst mit zweitem Grafikchip.' } else { '' }))
Zeile 'Das Programm jetzt schließen und neu starten.'` }),
  A({ id: 'peri-anzeige-skalierung', titel: 'Anzeige-Skalierung des Benutzers setzen (100/125/150 %)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt eine feste Skalierung für alle Bildschirme des Benutzers oder entfernt eine benutzerdefinierte Skalierung (dann gilt wieder die empfohlene je Bildschirm). Wirkt nach Ab- und Anmelden.',
    param: { label: 'Skalierung', platzhalter: '100 %', pflicht: true, optionen: ['100 %', '125 %', '150 %', '175 %', 'Benutzerdefinierte Skalierung entfernen'] },
    ps: String.raw`
NeedHive
$k = $uHive + '\Control Panel\Desktop'
$dpi = Get-ItemProperty -LiteralPath $k -EA SilentlyContinue
$vorher = $(if ($dpi.Win8DpiScaling -eq 1 -and $dpi.LogPixels) { 'benutzerdefiniert ' + [math]::Round(100 * [double]$dpi.LogPixels / 96) + ' %' } else { 'empfohlen je Bildschirm (keine benutzerdefinierte Skalierung)' })
if ($P -match '^\s*(100|125|150|175)\s*%?\s*$') {
  $proz = [int]$matches[1]
  Set-ItemProperty -LiteralPath $k -Name LogPixels -Value ([int]($proz * 96 / 100)) -Type DWord
  Set-ItemProperty -LiteralPath $k -Name Win8DpiScaling -Value 1 -Type DWord
  $jetzt = 'benutzerdefiniert ' + $proz + ' % für alle Bildschirme'
} elseif ($P -match '^\s*benutzerdefinierte') {
  Remove-ItemProperty -LiteralPath $k -Name LogPixels -EA SilentlyContinue
  Set-ItemProperty -LiteralPath $k -Name Win8DpiScaling -Value 0 -Type DWord
  $jetzt = 'empfohlen je Bildschirm (benutzerdefinierte Skalierung entfernt)'
} else { throw ('Unbekannte Skalierung: ' + $P) }
Zeile ('Skalierung: vorher ' + $vorher + ' → jetzt ' + $jetzt)
Zeile 'Wirkt erst, wenn sich der Benutzer ab- und wieder anmeldet.'` }),
  A({ id: 'peri-anzeige-helligkeit', titel: 'Display-Helligkeit fest einstellen (automatische Anpassung aus)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt die Helligkeit des Laptop-Displays (20–100 %) für Netz- und Akkubetrieb und schaltet die adaptive Helligkeit (Lichtsensor) ab – gegen dunkles oder ständig wechselndes Display.',
    param: { label: 'Helligkeit in %', platzhalter: '80', pflicht: true, vorlagen: ['100', '80', '60'] },
    ps: String.raw`
if ($P -notmatch '^\s*(\d{1,3})\s*%?\s*$') { throw 'Bitte die Helligkeit in Prozent angeben (20–100).' }
$n = [int]$matches[1]
if ($n -lt 20 -or $n -gt 100) { throw 'Die Helligkeit muss zwischen 20 und 100 % liegen.' }
${PWR_PS}
$aus = @{ 0 = 'aus'; 1 = 'an' }
$ab = PaPwr 'SUB_VIDEO' 'ADAPTBRIGHT'
$hv = PaPwr 'SUB_VIDEO' 'VIDEONORMALLEVEL'
& powercfg.exe /setacvalueindex SCHEME_CURRENT SUB_VIDEO ADAPTBRIGHT 0 2>&1 | Out-Null
& powercfg.exe /setdcvalueindex SCHEME_CURRENT SUB_VIDEO ADAPTBRIGHT 0 2>&1 | Out-Null
& powercfg.exe /setacvalueindex SCHEME_CURRENT SUB_VIDEO VIDEONORMALLEVEL $n 2>&1 | Out-Null
& powercfg.exe /setdcvalueindex SCHEME_CURRENT SUB_VIDEO VIDEONORMALLEVEL $n 2>&1 | Out-Null
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
$ab2 = PaPwr 'SUB_VIDEO' 'ADAPTBRIGHT'
if ($ab) { Zeile ('Adaptive Helligkeit (Netz/Akku): vorher ' + $aus[$ab[0]] + '/' + $aus[$ab[1]] + ' → jetzt ' + $(if ($ab2) { $aus[$ab2[0]] + '/' + $aus[$ab2[1]] } else { '?' })) } else { Zeile 'Adaptive Helligkeit: auf diesem Gerät nicht vorhanden (kein Lichtsensor).' }
if ($hv) { Zeile ('Helligkeit im Energieplan (Netz/Akku): vorher ' + $hv[0] + ' %/' + $hv[1] + ' % → jetzt ' + $n + ' %/' + $n + ' %') }
$m = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBrightnessMethods -EA SilentlyContinue)
if (-not $m.Count) { Zeile 'Kein Display, dessen Helligkeit Windows regelt – externe Monitore stellt man am Monitor selbst ein.' } else {
  $b = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBrightness -EA SilentlyContinue)
  $vor = $(if ($b.Count) { [string]$b[0].CurrentBrightness + ' %' } else { '?' })
  foreach ($x in $m) { try { Invoke-CimMethod -InputObject $x -MethodName WmiSetBrightness -Arguments @{ Timeout = [uint32]1; Brightness = [byte]$n } -EA Stop | Out-Null } catch { Zeile ('Helligkeit setzen: ' + $_.Exception.Message) } }
  Start-Sleep -Milliseconds 600
  $b2 = @(Get-CimInstance -Namespace root\wmi -ClassName WmiMonitorBrightness -EA SilentlyContinue)
  Zeile ('Display-Helligkeit: vorher ' + $vor + ' → jetzt ' + $(if ($b2.Count) { [string]$b2[0].CurrentBrightness + ' %' } else { '?' }))
}
Zeile 'Regelt das Bild danach noch je nach Inhalt nach: in Windows „Helligkeit je nach Inhalt ändern“ bzw. im Intel-Grafikprogramm die Energiesparfunktion der Anzeige ausschalten.'` }),

  // ══ Akku & Energie ══════════════════════════════════════════════════════════
  A({ id: 'peri-energie-weckquelle', titel: 'Weckberechtigung eines Geräts ändern (darf den PC wecken: an/aus)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Nimmt einem Gerät die Weckberechtigung (z. B. empfindliche Maus, WLAN) oder gibt sie zurück (Tastatur weckt den PC nicht mehr). Nur Geräte aus der powercfg-Liste; LAN-Karten bleiben weckberechtigt (nächtliche Updates).',
    param: { label: 'Gerät = aus | an (Name wie in „Was weckt den PC auf?“)', platzhalter: 'HID-konforme Maus = aus', pflicht: true, vorlagen: ['HID-konforme Maus = aus', 'HID-Tastatur = an', 'HID-konforme Maus = an', 'Wi-Fi = aus'] },
    ps: String.raw`
if ($P -notmatch '^\s*([\w .,()&/#+:®™-]{2,120}?)\s*=\s*(aus|an)\s*$') { throw 'Bitte im Format „HID-konforme Maus = aus“ bzw. „HID-Tastatur = an“ angeben.' }
$t = $matches[1].Trim(); $an = ($matches[2] -ieq 'an')
function PaWake([string]$art) { @((& powercfg.exe /devicequery $art 2>$null) | ForEach-Object { ([string]$_).Trim() } | Where-Object { $_ -and $_ -notmatch '^(NONE|KEINE?)$' }) }
$armed = @(PaWake 'wake_armed')
$liste = @(if ($an) { PaWake 'wake_programmable' } else { $armed })
$tr = @($liste | Where-Object { $_ -ieq $t })
if (-not $tr.Count) { $tr = @($liste | Where-Object { $_.IndexOf($t, [StringComparison]::OrdinalIgnoreCase) -ge 0 }) }
if (-not $liste.Count) { Zeile $(if ($an) { 'Kein Gerät meldet, dass es den PC wecken kann.' } else { 'Kein Gerät darf den PC wecken – nichts zu tun.' }) }
elseif (-not $tr.Count) { throw ('Kein passendes Gerät „' + $t + '“. ' + $(if ($an) { 'Wecken können: ' } else { 'Wecken dürfen: ' }) + ($liste -join ' | ')) }
elseif ($tr.Count -gt 3) { throw ('Zu viele Treffer (' + $tr.Count + ') – bitte genauer angeben: ' + ($tr -join ' | ')) }
else {
  foreach ($d in $tr) {
    $vor = $armed -contains $d
    if (-not $an -and $d -match 'Ethernet|GbE|Gigabit|Family Controller|I21\d|I22\d|Network Connection') { Zeile ($d + ': LAN-Karte – bleibt weckberechtigt (sonst klappen nächtliche Updates und Fernwartung nicht).'); continue }
    if ($an -eq $vor) { Zeile ($d + ': darf wecken – ist schon ' + $(if ($vor) { 'ja' } else { 'nein' })); continue }
    if ($an) { & powercfg.exe /deviceenablewake $d 2>&1 | Out-Null } else { & powercfg.exe /devicedisablewake $d 2>&1 | Out-Null }
    $c = $LASTEXITCODE
    $nach = @(PaWake 'wake_armed') -contains $d
    Zeile ($d + ': darf wecken – vorher ' + $(if ($vor) { 'ja' } else { 'nein' }) + ' → jetzt ' + $(if ($nach) { 'ja' } else { 'nein' }) + $(if ($nach -ne $an) { ' (unverändert, powercfg Code ' + $c + ')' } else { '' }))
  }
}` }),
  A({ id: 'peri-energie-tasten', titel: 'Aktion beim Zuklappen bzw. beim Drücken der Ein/Aus-Taste festlegen', modus: 'system', risiko: 'aendern',
    beschreibung: 'Was beim Zuklappen (getrennt für Netz/Dock und Akku) bzw. beim kurzen Drücken der Ein/Aus-Taste passiert. Für „Ruhezustand“ wird der Ruhezustand bei Bedarf eingeschaltet (Datei C:\hiberfil.sys).',
    param: { label: 'Aktion', platzhalter: 'Zuklappen: am Netz nichts tun, im Akku Energie sparen', pflicht: true, optionen: ['Zuklappen: am Netz nichts tun, im Akku Energie sparen', 'Zuklappen: am Netz nichts tun, im Akku Ruhezustand', 'Zuklappen: immer Energie sparen', 'Zuklappen: immer Ruhezustand', 'Netzschalter: Energie sparen', 'Netzschalter: Ruhezustand', 'Netzschalter: Herunterfahren'] },
    ps: String.raw`
$wahl = @(switch -Regex ($P) {
  '^zuklappen: am netz nichts tun, im akku energie' { 'LIDACTION', 0, 1; break }
  '^zuklappen: am netz nichts tun, im akku ruhe' { 'LIDACTION', 0, 2; break }
  '^zuklappen: immer energie' { 'LIDACTION', 1, 1; break }
  '^zuklappen: immer ruhe' { 'LIDACTION', 2, 2; break }
  '^netzschalter: energie' { 'PBUTTONACTION', 1, 1; break }
  '^netzschalter: ruhe' { 'PBUTTONACTION', 2, 2; break }
  '^netzschalter: herunter' { 'PBUTTONACTION', 3, 3; break }
  default { throw ('Unbekannte Auswahl: ' + $P) }
})
$set = [string]$wahl[0]; $ac = [int]$wahl[1]; $dc = [int]$wahl[2]
$was = $(if ($set -eq 'LIDACTION') { 'Zuklappen' } else { 'Ein/Aus-Taste' })
${PWR_PS}
$txt = @{ 0 = 'nichts tun'; 1 = 'Energie sparen'; 2 = 'Ruhezustand'; 3 = 'Herunterfahren'; 4 = 'Bildschirm ausschalten' }
$alt = PaPwr 'SUB_BUTTONS' $set
if (-not $alt) { throw ('Keine Einstellung für „' + $was + '“ gefunden.') }
if ($ac -eq 2 -or $dc -eq 2) {
  $hp = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Power' -EA SilentlyContinue
  $he = $hp.HibernateEnabled; if ($null -eq $he) { $he = $hp.HibernateEnabledDefault }
  if ($he -ne 1) { & powercfg.exe /hibernate on 2>&1 | Out-Null; $hc = $LASTEXITCODE; & powercfg.exe /hibernate /type full 2>&1 | Out-Null; Zeile ('Ruhezustand: vorher aus → jetzt eingeschaltet (powercfg Code ' + $hc + ')') }
  elseif ($hp.HiberFileType -eq 1) { & powercfg.exe /hibernate /type full 2>&1 | Out-Null; Zeile 'Ruhezustandsdatei: vorher reduziert (nur Schnellstart) → jetzt vollständig' }
}
& powercfg.exe /setacvalueindex SCHEME_CURRENT SUB_BUTTONS $set $ac 2>&1 | Out-Null
& powercfg.exe /setdcvalueindex SCHEME_CURRENT SUB_BUTTONS $set $dc 2>&1 | Out-Null
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
$neu = PaPwr 'SUB_BUTTONS' $set
Zeile ($was + ' am Netz: vorher ' + $txt[$alt[0]] + ' → jetzt ' + $txt[$neu[0]])
Zeile ($was + ' im Akku: vorher ' + $txt[$alt[1]] + ' → jetzt ' + $txt[$neu[1]])
$pg = $(if ($set -eq 'LIDACTION') { '5ca83367-6e45-459f-a27b-476b1d01c936' } else { '7648efa3-dd9c-4e3e-b566-50f929386280' })
if (Test-Path ('HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\' + $pg)) { Zeile ('Achtung: Eine Richtlinie gibt „' + $was + '“ vor und überstimmt diese Einstellung (DXC).') }` }),
  A({ id: 'peri-energie-standby-akku', titel: 'Standby im Akkubetrieb ruhigstellen (Netzwerk und Weck-Timer aus)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Im Akkubetrieb trennt der Laptop im Standby das Netzwerk und lässt sich nicht mehr von Weck-Timern (Updates, Wartung) wecken – gegen heiße, leere Laptops in der Tasche. Am Netzteil bleibt alles wie bisher.',
    ps: String.raw`
${PWR_PS}
$t1 = @{ 0 = 'aus'; 1 = 'an'; 2 = 'von Windows verwaltet' }
$t2 = @{ 0 = 'aus'; 1 = 'an'; 2 = 'nur wichtige' }
$sub = 'fea3413e-7e05-4911-9a71-700331f1c294'; $set = 'f15576e8-98b7-4186-b944-eafa664402d9'
$a1 = PaPwr $sub $set
$a2 = PaPwr 'SUB_SLEEP' 'RTCWAKE'
if ($a1) { & powercfg.exe /setdcvalueindex SCHEME_CURRENT $sub $set 0 2>&1 | Out-Null }
if ($a2) { & powercfg.exe /setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 0 2>&1 | Out-Null }
& powercfg.exe /setactive SCHEME_CURRENT 2>&1 | Out-Null
$n1 = PaPwr $sub $set
$n2 = PaPwr 'SUB_SLEEP' 'RTCWAKE'
if ($a1 -and $n1) { Zeile ('Netzwerk im Standby (Akku): vorher ' + $t1[$a1[1]] + ' → jetzt ' + $t1[$n1[1]] + ' · am Netzteil bleibt ' + $t1[$n1[0]]) } else { Zeile 'Netzwerk im Standby: Einstellung auf diesem Gerät nicht vorhanden (klassischer Standby S3).' }
if ($a2 -and $n2) { Zeile ('Weck-Timer (Akku): vorher ' + $t2[$a2[1]] + ' → jetzt ' + $t2[$n2[1]] + ' · am Netzteil bleibt ' + $t2[$n2[0]] + ' (nächtliche Updates)') } else { Zeile 'Weck-Timer: Einstellung nicht gefunden.' }
$pwa = (& powercfg.exe /a 2>$null | Out-String); $i = $pwa.IndexOf('nicht verf'); if ($i -lt 0) { $i = $pwa.IndexOf('not avail') }
$verf = $(if ($i -gt 0) { $pwa.Substring(0, $i) } else { $pwa })
Zeile ('Standby-Art: ' + $(if ($verf -match 'S0') { 'Modern Standby (S0 – bliebe sonst in der Tasche online)' } else { 'klassischer Standby (S3)' }))` }),
]
