// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „bild“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bildschirm & Grafik: Monitore im Detail (QueryDisplayConfig in der Sitzung des Benutzers), Anzeige einstellen
// (Bildwiederholrate, empfohlene Auflösung, Drehung, Hauptbildschirm, Anordnung, Trennen, HDR), gespeicherte
// Monitor-Konfigurationen zurücksetzen, Grafik-Schalter (MPO, GPU-Planung, TDR).
// Smartphone & MFA: Handy am PC prüfen (Smartphone-Link, Bluetooth, USB/MTP, Tethering, Richtlinien) und
// Smartphone-Link gezielt abschalten. BIOS, Treiberpakete, Richtlinien und das Handy selbst werden nie verändert.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** C#-Kern: aktive Bildschirme über QueryDisplayConfig (Name, Anschluss, Auflösung, Hz, Drehung, empfohlene Auflösung,
 *  HDR, Farbtiefe) und die vom Treiber angebotenen Modi. Bewusst kompakt: Bausteine der Art „benutzer“ laufen über
 *  -EncodedCommand, die Befehlszeile ist auf 32 767 Zeichen begrenzt. */
const ANZ_KERN = String.raw`using System;using System.Collections.Generic;using System.Runtime.InteropServices;using M=System.Runtime.InteropServices.Marshal;
public class PaAnz{
const string U="user32.dll";
[DllImport(U)]static extern int GetDisplayConfigBufferSizes(uint f,out uint np,out uint nm);
[DllImport(U)]static extern int QueryDisplayConfig(uint f,ref uint np,IntPtr p,ref uint nm,IntPtr m,IntPtr t);
[DllImport(U)]static extern int DisplayConfigGetDeviceInfo(IntPtr p);
[DllImport(U,CharSet=CharSet.Unicode)]static extern bool EnumDisplaySettingsEx(string d,int i,IntPtr dm,uint f);
public class Mon{public string Gdi="",Name="",Pfad="";public int Nr,Tech,Rot,Scal,X,Y,W,H,PW,PH,Bits;public double Hz,PHz;public bool HdrOk,HdrAn,Primaer,Neu;public long Lid,Sl;public uint Tid,Sid;}
static int I(IntPtr b,int o){return M.ReadInt32(b,o);}
static void S(IntPtr b,int o,int v){M.WriteInt32(b,o,v);}
static IntPtr A(IntPtr b,int o){return new IntPtr(b.ToInt64()+o);}
static IntPtr N(int n){IntPtr b=M.AllocHGlobal(n);for(int i=0;i<n;i++)M.WriteByte(b,i,0);return b;}
static void K(IntPtr b,int t,int n,long l,uint id){for(int i=0;i<n;i++)M.WriteByte(b,i,0);S(b,0,t);S(b,4,n);M.WriteInt64(b,8,l);S(b,16,(int)id);}
static int G(IntPtr b,int t,int n,long l,uint id){K(b,t,n,l,id);return DisplayConfigGetDeviceInfo(b);}
static double Q(IntPtr b,int o){uint d=(uint)I(b,o+4);return d==0?0:Math.Round((uint)I(b,o)/(double)d,1);}
static IntPtr Dm(){IntPtr d=N(220);M.WriteInt16(d,68,220);return d;}
public static List<Mon> Liste(){
var L=new List<Mon>();uint np,nm;
if(GetDisplayConfigBufferSizes(2,out np,out nm)!=0)return L;
IntPtr p=N((int)np*72),m=N((int)nm*64),b=N(512);
try{if(QueryDisplayConfig(2,ref np,p,ref nm,m,IntPtr.Zero)!=0)return L;
for(int i=0;i<np;i++){IntPtr q=A(p,i*72);var x=new Mon();int s=I(q,12),n;
x.Sl=M.ReadInt64(q,0);x.Sid=(uint)I(q,8);x.Lid=M.ReadInt64(q,20);x.Tid=(uint)I(q,28);x.Tech=I(q,36);x.Rot=I(q,40);x.Scal=I(q,44);x.Hz=Q(q,48);
if(s>=0&&s<nm){IntPtr o=A(m,s*64);x.W=I(o,16);x.H=I(o,20);x.X=I(o,28);x.Y=I(o,32);}
x.Primaer=x.X==0&&x.Y==0;
if(G(b,1,84,x.Sl,x.Sid)==0)x.Gdi=M.PtrToStringUni(A(b,20));
if(int.TryParse(x.Gdi.Replace("\\\\.\\DISPLAY",""),out n))x.Nr=n;
if(G(b,2,420,x.Lid,x.Tid)==0){x.Name=M.PtrToStringUni(A(b,36));x.Pfad=M.PtrToStringUni(A(b,164));}
if(G(b,3,80,x.Lid,x.Tid)==0){x.PW=I(b,20);x.PH=I(b,24);x.PHz=Q(b,48);}
if(G(b,15,36,x.Lid,x.Tid)==0){int v=I(b,20);x.Neu=true;x.HdrOk=(v&16)!=0;x.HdrAn=(v&32)!=0||I(b,32)==2;x.Bits=I(b,28);}
else if(G(b,9,32,x.Lid,x.Tid)==0){int v=I(b,20);x.HdrOk=(v&9)==1;x.HdrAn=(v&2)!=0;x.Bits=I(b,28);}
L.Add(x);}
}finally{M.FreeHGlobal(p);M.FreeHGlobal(m);M.FreeHGlobal(b);}
return L;}
public static List<int[]> Modi(string g){var L=new List<int[]>();IntPtr d=Dm();try{for(int i=0;EnumDisplaySettingsEx(g,i,d,0);i++)L.Add(new int[]{I(d,172),I(d,176),I(d,184)});}finally{M.FreeHGlobal(d);}return L;}
`

/** C#-Zusatz nur zum Lesen: wirksame Skalierung je Bildschirm (Thread wird dafür DPI-bewusst). */
const ANZ_DPI = String.raw`[DllImport(U)]static extern IntPtr SetThreadDpiAwarenessContext(IntPtr c);
[DllImport(U)]static extern IntPtr MonitorFromPoint(long pt,uint f);
[DllImport("shcore.dll")]static extern int GetDpiForMonitor(IntPtr h,int t,out uint x,out uint y);
public static int Dpi(Mon x){try{SetThreadDpiAwarenessContext(new IntPtr(-4));uint a,c;IntPtr h=MonitorFromPoint(((long)(x.Y+1)<<32)|(uint)(x.X+1),0);if(h!=IntPtr.Zero&&GetDpiForMonitor(h,0,out a,out c)==0)return (int)Math.Round(a*100.0/96);}catch{}return 0;}
`

/** C#-Zusatz zum Ändern: DEVMODE setzen (Auflösung, Hz, Drehung, Position, Hauptbildschirm), anwenden, HDR schalten. */
const ANZ_SETZ = String.raw`[DllImport(U,CharSet=CharSet.Unicode)]static extern int ChangeDisplaySettingsEx(string d,IntPtr dm,IntPtr h,uint f,IntPtr l);
[DllImport(U)]static extern int DisplayConfigSetDeviceInfo(IntPtr p);
public static int Setze(string g,int w,int h,int hz,int ori,int x,int y,int f,uint fl){IntPtr d=Dm();try{if(!EnumDisplaySettingsEx(g,-1,d,0))return -99;
if((f&0x80000)!=0)S(d,172,w);if((f&0x100000)!=0)S(d,176,h);if((f&0x400000)!=0)S(d,184,hz);if((f&0x80)!=0)S(d,84,ori);if((f&0x20)!=0){S(d,76,x);S(d,80,y);}
S(d,72,f);return ChangeDisplaySettingsEx(g,d,IntPtr.Zero,fl,IntPtr.Zero);}finally{M.FreeHGlobal(d);}}
public static int Anwenden(){return ChangeDisplaySettingsEx(null,IntPtr.Zero,IntPtr.Zero,0,IntPtr.Zero);}
public static int Hdr(Mon x,bool an){IntPtr b=N(24);try{K(b,x.Neu?16:10,24,x.Lid,x.Tid);S(b,20,an?1:0);return DisplayConfigSetDeviceInfo(b);}finally{M.FreeHGlobal(b);}}
`

/** Optionen für „bild4-anzeige-setzen“ (optional „= Bildschirm“ dahinter). */
const ANZ_OPT = ['Höchste Bildwiederholrate', 'Empfohlene Auflösung', 'Querformat (Drehung zurücksetzen)', 'Hochformat', 'Hauptbildschirm', 'Reihenfolge links nach rechts', 'Bildschirm trennen', 'HDR aus', 'HDR an']
/** Optionen für „bild4-grafik-option“. */
const GRAFIK_OPT = ['MPO abschalten (Flackern, schwarze Flächen)', 'MPO wieder Standard', 'GPU-Planung aus', 'GPU-Planung an', 'TDR-Wartezeit 8 Sekunden', 'TDR-Wartezeit Standard']
/** Optionen für „bild4-smartphone-link“. */
const SL_OPT = ['Anrufe am PC aus', 'Benachrichtigungen und Nachrichten am PC aus', 'Smartphone-Link ganz aus (Autostart und Hintergrund)', 'Wieder einschalten']

export const AKTIONEN_BILD4: PaAktion[] = [
  // ══ Bildschirm & Grafik ═════════════════════════════════════════════════════
  A({ id: 'bild4-anzeige-details', titel: 'Bildschirme im Detail (Auflösung, Hz, Anschluss, HDR, Hauptbildschirm, Drehung, Skalierung)', modus: 'benutzer', risiko: 'lesen',
    beschreibung: 'Liest in der Sitzung des Benutzers jeden aktiven Bildschirm so, wie Windows ihn gerade betreibt: Nummer, Name/Hersteller-ID, Anschluss (HDMI, DisplayPort/USB-C, intern, DisplayLink, VIRTUELL), Auflösung und Bildwiederholrate gegenüber der empfohlenen (EDID), höchste mögliche Hz, Drehung, Skalierung, Position, Hauptbildschirm, HDR (möglich/an) und Farbtiefe, dazu duplizierte Anzeige, Grafikkarten und Warnungen (unter 50 Hz, nicht empfohlene Auflösung, Kabel/Dock begrenzt). Ändert nichts.',
    timeoutMs: 60000,
    ps: String.raw`
if (-not ('PaAnz' -as [type])) { Add-Type -TypeDefinition (@'
${ANZ_KERN}${ANZ_DPI}}
'@) }
function Tech([int]$t) { switch ($t) { -2147483648 { 'intern (Laptop-Display)' } 0 { 'VGA' } 4 { 'DVI' } 5 { 'HDMI' } 6 { 'intern (LVDS)' } 10 { 'DisplayPort/USB-C' } 11 { 'intern (eDP)' } 15 { 'drahtlos (Miracast)' } 16 { 'USB-Grafik (DisplayLink o. ä.)' } 17 { 'VIRTUELL (Software-Bildschirm)' } default { 'Anschluss ' + $t } } }
$l = @([PaAnz]::Liste())
if (-not $l.Count) { throw 'Keine aktiven Bildschirme lesbar – Sitzung gesperrt oder Remotedesktop-Sitzung?' }
$q = @($l | ForEach-Object { '' + $_.Sl + '/' + $_.Sid } | Select-Object -Unique)
Zeile ('Aktive Bildschirme: ' + $l.Count + ' · ' + $(if ($q.Count -lt $l.Count) { 'DUPLIZIERT (mehrere zeigen dasselbe Bild)' } elseif ($l.Count -gt 1) { 'erweitert' } else { 'nur ein Bildschirm' }))
foreach ($x in @($l | Sort-Object X, Y)) {
  $id = $(if ($x.Pfad -match 'DISPLAY#([^#]+)#') { ' [' + $matches[1] + ']' } else { '' })
  $mo = @([PaAnz]::Modi($x.Gdi))
  $hm = [int]($mo | Where-Object { ($_[0] -eq $x.W -and $_[1] -eq $x.H) -or ($_[0] -eq $x.H -and $_[1] -eq $x.W) } | ForEach-Object { $_[2] } | Measure-Object -Maximum).Maximum
  $gr = [double]($mo | ForEach-Object { [double]$_[0] * $_[1] } | Measure-Object -Maximum).Maximum
  $dpi = [PaAnz]::Dpi($x)
  Zeile ('Bildschirm ' + $x.Nr + $(if ($x.Primaer) { ' (HAUPTBILDSCHIRM)' } else { '' }) + ': ' + $(if ($x.Name) { $x.Name } else { 'ohne Namen' }) + $id + ' · ' + (Tech $x.Tech))
  Zeile ('   ' + $x.W + '×' + $x.H + ' @ ' + $x.Hz + ' Hz · empfohlen ' + $(if ($x.PW) { '' + $x.PW + '×' + $x.PH + ' @ ' + $x.PHz + ' Hz' } else { 'unbekannt (EDID fehlt)' }) + ' · höchste Hz hier: ' + $hm + ' · Drehung ' + @{ 1 = 'keine'; 2 = '90° (Hochformat)'; 3 = '180° (auf dem Kopf)'; 4 = '270° (Hochformat)' }[$x.Rot] + ' · Skalierung ' + $(if ($dpi) { '' + $dpi + ' %' } else { '?' }) + ' · Position ' + $x.X + ',' + $x.Y)
  Zeile ('   HDR: ' + $(if ($x.HdrOk) { 'möglich, ' + $(if ($x.HdrAn) { 'AN' } else { 'aus' }) } else { 'nicht möglich (Monitor, Kabel oder Dock)' }) + ' · Farbtiefe ' + $x.Bits + ' Bit je Farbe' + $(if ($x.Scal -eq 2) { ' · Bild ZENTRIERT (schwarzer Rand)' } elseif ($x.Scal -eq 3) { ' · Bild GESTRECKT' } else { '' }))
  if ($x.PW -and ([double]$x.W * $x.H) -ne ([double]$x.PW * $x.PH)) { Zeile ('   ACHTUNG: läuft nicht mit der empfohlenen Auflösung ' + $x.PW + '×' + $x.PH + $(if ($gr -lt ([double]$x.PW * $x.PH)) { ' – der Treiber bietet sie gar nicht an (Kabel, Adapter oder Dock begrenzen)' } else { '' })) }
  if ($hm -gt [math]::Round($x.Hz) + 1) { Zeile ('   ACHTUNG: ' + $hm + ' Hz wären möglich, eingestellt sind ' + $x.Hz + ' Hz') }
  if ($x.Hz -gt 0 -and $x.Hz -lt 50) { Zeile '   ACHTUNG: unter 50 Hz – Bild ruckelt (Kabel, Adapter oder Dock-Anschluss zu langsam)' }
  if ($x.Tech -eq 17) { Zeile '   ACHTUNG: virtueller Bildschirm einer Software (Fernwartung, Bildschirm-Erweiterung) – kein echter Monitor' }
}
$k = Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Desktop' -EA SilentlyContinue
if ($k.Win8DpiScaling -eq 1 -and $k.LogPixels) { Zeile ('Benutzerdefinierte Skalierung für alle Bildschirme: ' + [math]::Round(100 * [double]$k.LogPixels / 96) + ' %') }
foreach ($g in @(Get-CimInstance Win32_VideoController -EA SilentlyContinue)) { Zeile ('Grafik: ' + $g.Name + ' · Treiber ' + $g.DriverVersion + $(if ($g.DriverDate) { ' vom ' + $g.DriverDate.ToString('dd.MM.yyyy') } else { '' })) }` }),

  A({ id: 'bild4-anzeige-setzen', titel: 'Anzeige einstellen (Bildwiederholrate, Auflösung, Drehung, Hauptbildschirm, Anordnung, Trennen, HDR)', modus: 'benutzer', risiko: 'aendern',
    beschreibung: 'Stellt in der Sitzung des Benutzers die Anzeige um – wie Einstellungen → System → Anzeige: höchste Bildwiederholrate, empfohlene (native) Auflösung, Querformat bzw. Hochformat, Hauptbildschirm (ohne Angabe: größter externer Monitor), Reihenfolge der Monitore von links nach rechts, einen Bildschirm trennen (Phantom- oder ausgeschalteter Monitor) oder HDR aus/an. Ohne „= Bildschirm“ gilt es für alle Bildschirme; Bildschirm = Nummer aus „Bildschirme im Detail“, Teil des Namens oder „intern“. Zeigt vorher/nachher; das Bild ist dabei kurz schwarz.',
    param: { label: 'Einstellung (optional „ = Bildschirm“: Nummer, Namensteil oder „intern“)', platzhalter: 'Höchste Bildwiederholrate', pflicht: true, optionen: ANZ_OPT, vorlagen: ['Höchste Bildwiederholrate', 'Empfohlene Auflösung', 'Hauptbildschirm = 2', 'Hochformat = 2', 'Reihenfolge links nach rechts = 2,1', 'Bildschirm trennen = 3', 'HDR aus'] },
    timeoutMs: 60000,
    ps: String.raw`
if ($P -notmatch '^\s*([^=]+?)\s*(?:=\s*([\w .,()-]{1,40}?))?\s*$') { throw 'Format: „Einstellung = Bildschirm“.' }
$z = [string]$matches[2]; $was = @(@('${ANZ_OPT.join("','")}') | Where-Object { $_ -ieq $matches[1] })[0]
if (-not $was) { throw ('Unbekannte Einstellung: ' + $P) }
if (-not ('PaAnz' -as [type])) { Add-Type -TypeDefinition (@'
${ANZ_KERN}${ANZ_SETZ}}
'@) }
function K($x) { 'Bildschirm ' + $x.Nr + ' (' + $(if ($x.Name) { $x.Name } else { 'intern' }) + ')' }
function Z($x, $t) { Zeile ((K $x) + ': ' + $t) }
function Alle { @([PaAnz]::Liste() | Group-Object Gdi | ForEach-Object { $_.Group[0] }) }
function Stand($t) { foreach ($x in Alle) { Zeile ($t + (K $x) + ' ' + $x.W + '×' + $x.H + ' @ ' + $x.Hz + ' Hz · ' + ($x.Rot - 1) * 90 + '° · Pos. ' + $x.X + ',' + $x.Y + $(if ($x.Primaer) { ' · Hauptbildschirm' }) + ' · HDR ' + $(if ($x.HdrAn) { 'an' } else { 'aus' })) } }
function E($r) { if ($r) { 'Fehler ' + $r } else { 'ok' } }
function Hz($x, $a, $b) { @([PaAnz]::Modi($x.Gdi) | Where-Object { ($_[0] -eq $a -and $_[1] -eq $b) -or ($_[0] -eq $b -and $_[1] -eq $a) } | ForEach-Object { $_[2] }) }
function Lege($pos, $hg) { foreach ($x in $alle) { $r = [PaAnz]::Setze($x.Gdi, 0, 0, 0, 0, $pos[$x.Gdi][0], $pos[$x.Gdi][1], 0x20, 0x10000001 + 0x10 * ($x.Gdi -eq $hg)); if ($r) { Z $x (E $r) } }; Zeile ('Anwenden: ' + (E ([PaAnz]::Anwenden()))) }
$alle = Alle
if (-not $alle.Count) { throw 'Keine Bildschirme lesbar (Sitzung gesperrt?).' }
$in = @(-2147483648, 6, 11); $wahl = $alle
if ($z -and $was -notlike 'Reihen*') {
  $wahl = @($alle | Where-Object { if ($z -match '^\d+$') { $_.Nr -eq [int]$z } elseif ($z -match '^(intern|laptop)') { $in -contains $_.Tech } else { ($_.Name + $_.Pfad) -like ('*' + $z + '*') } })
  if (-not $wahl.Count) { throw ('Kein Bildschirm passt zu „' + $z + '“.') }
}
Stand 'Vorher: '
switch -Wildcard ($was) {
  'Höchste*' { foreach ($x in $wahl) { $m = [int](Hz $x $x.W $x.H | Measure-Object -Maximum).Maximum; Z $x $(if ($m -le [math]::Round($x.Hz)) { 'schon höchste Rate' } else { '→ ' + $m + ' Hz: ' + (E ([PaAnz]::Setze($x.Gdi, 0, 0, $m, 0, 0, 0, 0x400000, 1))) }) } }
  'Empfohlene*' { foreach ($x in $wahl) { $a, $b = $(if ($x.Rot % 2) { $x.PW, $x.PH } else { $x.PH, $x.PW }); $h = @(Hz $x $a $b)
    Z $x $(if (-not $a) { 'keine Empfehlung lesbar (EDID fehlt)' } elseif ($a -eq $x.W -and $b -eq $x.H) { 'hat schon ' + $a + '×' + $b } elseif (-not $h.Count) { '' + $a + '×' + $b + ' nicht angeboten (Kabel/Adapter/Dock begrenzt)' } else { $f = $(if ($h -contains [int][math]::Round($x.PHz)) { [int][math]::Round($x.PHz) } else { [int]($h | Measure-Object -Maximum).Maximum }); '→ ' + $a + '×' + $b + ' @ ' + $f + ' Hz: ' + (E ([PaAnz]::Setze($x.Gdi, $a, $b, $f, 0, 0, 0, 0x580000, 1))) }) } }
  'Querformat*' { foreach ($x in @($wahl | Where-Object { $_.Rot -gt 1 })) { $a, $b = $(if ($x.Rot % 2) { $x.W, $x.H } else { $x.H, $x.W }); Z $x ('→ nicht gedreht: ' + (E ([PaAnz]::Setze($x.Gdi, $a, $b, 0, 0, 0, 0, 0x180080, 1)))) } }
  'Hochformat' { if (-not $z) { throw 'Bitte „Hochformat = Nummer“ angeben.' }
    foreach ($x in @($wahl | Where-Object { $_.Rot -ne 2 })) { $a, $b = $(if ($x.Rot % 2) { $x.H, $x.W } else { $x.W, $x.H }); Z $x ('→ Hochformat: ' + (E ([PaAnz]::Setze($x.Gdi, $a, $b, 0, 1, 0, 0, 0x180080, 1)))) } }
  'Haupt*' { $t = @(if ($z) { $wahl } else { $alle | Where-Object { $in -notcontains $_.Tech -and $_.Tech -ne 17 } | Sort-Object { [double]$_.W * $_.H } | Select-Object -Last 1 })
    if ($t.Count -ne 1) { throw 'Bitte „Hauptbildschirm = Nummer“ angeben.' }
    $t = $t[0]; if ($t.Primaer) { Z $t 'schon Hauptbildschirm' } else { $pos = @{}; foreach ($x in $alle) { $pos[$x.Gdi] = @(($x.X - $t.X), ($x.Y - $t.Y)) }; Lege $pos $t.Gdi } }
  'Reihen*' { if ($z -notmatch '^\d{1,2}(\s*,\s*\d{1,2})+$') { throw 'Bitte z. B. „Reihenfolge links nach rechts = 2,1“ angeben.' }
    $nr = @($z -split '\s*,\s*' | ForEach-Object { [int]$_ })
    if ((@($nr | Sort-Object) -join ',') -ne (@($alle.Nr | Sort-Object) -join ',')) { throw ('Jede aktive Nummer genau einmal angeben: ' + ($alle.Nr -join ', ')) }
    $xx = 0; $sp = @{}; foreach ($n in $nr) { $m = @($alle | Where-Object { $_.Nr -eq $n })[0]; $sp[$m.Gdi] = $xx; $xx += $m.W }
    $h = @($alle | Where-Object { $_.Primaer })[0]; $pos = @{}; foreach ($x in $alle) { $pos[$x.Gdi] = @(($sp[$x.Gdi] - $sp[$h.Gdi]), 0) }; Lege $pos $h.Gdi }
  'Bildschirm trennen' { $t = $wahl[0]; if (-not $z -or $wahl.Count -ne 1 -or $alle.Count -lt 2 -or $t.Primaer) { throw 'Bitte „Bildschirm trennen = Nummer“ (nicht Hauptbildschirm).' }
    Z $t ('trennen: ' + (E ([PaAnz]::Setze($t.Gdi, 0, 0, 0, 0, 0, 0, 0x180020, 0x10000001))) + ' · anwenden: ' + (E ([PaAnz]::Anwenden()))) }
  default { $an = $was -eq 'HDR an'
    foreach ($x in @([PaAnz]::Liste() | Where-Object { $wahl.Gdi -contains $_.Gdi })) { Z $x $(if (-not $x.HdrOk) { 'kein HDR möglich' } elseif ($x.HdrAn -eq $an) { 'schon so' } else { $was + ': ' + (E ([PaAnz]::Hdr($x, $an))) }) } }
}
Start-Sleep -Seconds 2
Stand 'Jetzt: '` }),

  A({ id: 'bild4-anzeige-speicher-zuruecksetzen', titel: 'Gespeicherte Monitor-Konfigurationen zurücksetzen (Anordnung, Auflösung, Skalierung je Monitor-Kombination)', modus: 'system', risiko: 'aendern', timeoutMs: 120000,
    beschreibung: 'Windows merkt sich für jede Monitor-Kombination (Dock, Homeoffice, Beamer) Anordnung, Auflösung, Drehung und Skalierung (GraphicsDrivers\\Configuration, Connectivity, ScaleFactors). Sind diese Einträge verbogen – Anordnung wird vergessen, „Anzeigeeinstellungen konnten nicht gespeichert werden“, Phantom-Bildschirme, Skalierung springt –, werden sie als SYSTEM nach C:\\ProgramData\\ITAdminTool\\Sicherung gesichert (.reg) und entfernt. Windows legt sie beim nächsten Anstecken bzw. Neustart neu an (Erweitern, empfohlene Auflösung und Skalierung). Wirkt nach Neustart oder Ab-/Anstecken der Monitore.',
    ps: String.raw`
$st = Get-Date -Format 'yyyyMMdd_HHmmss'
$dir = 'C:\ProgramData\ITAdminTool\Sicherung\Anzeige_' + $st
if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$innen = @'
$d = '__DIR__'; $o = New-Object System.Collections.Generic.List[string]
foreach ($k in 'Configuration', 'Connectivity', 'ScaleFactors') {
  $p = 'Registry::HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\' + $k
  if (-not (Test-Path -LiteralPath $p)) { $o.Add($k + ': nicht vorhanden'); continue }
  $n = @(Get-ChildItem -LiteralPath $p -EA SilentlyContinue).Count
  & reg.exe export ('HKLM\SYSTEM\CurrentControlSet\Control\GraphicsDrivers\' + $k) ($d + '\' + $k + '.reg') /y 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { $o.Add($k + ': Sicherung fehlgeschlagen – nichts entfernt'); continue }
  try { Get-ChildItem -LiteralPath $p -EA Stop | Remove-Item -Recurse -Force -EA Stop; $o.Add($k + ': ' + $n + ' gespeicherte Einträge gesichert und entfernt') } catch { $o.Add($k + ': nicht entfernt – ' + $_.Exception.Message) }
}
$o | Out-File -LiteralPath ($d + '\ergebnis.txt') -Encoding UTF8 -Force
'@
$innen = $innen.Replace('__DIR__', $dir)
Spaeter $innen 3
Zeile 'Zurücksetzen läuft als SYSTEM (die Schlüssel sind für Administratoren gesperrt) …'
$f = $dir + '\ergebnis.txt'; $bis = (Get-Date).AddSeconds(75)
while (-not (Test-Path -LiteralPath $f) -and (Get-Date) -lt $bis) { Start-Sleep -Seconds 2 }
if (Test-Path -LiteralPath $f) { foreach ($z in @(Get-Content -LiteralPath $f -Encoding UTF8 -EA SilentlyContinue)) { if ($z) { Zeile $z } } }
else { Zeile ('Noch keine Rückmeldung – das Ergebnis steht gleich in ' + $f) }
Zeile ('Sicherung: ' + $dir + ' (Rückweg: .reg-Dateien als Administrator importieren).')
Zeile 'Wirkt nach einem Neustart bzw. wenn die Monitore/das Dock ab- und wieder angesteckt werden. Danach Anordnung und Hauptbildschirm neu einstellen.'` }),

  A({ id: 'bild4-grafik-option', titel: 'Grafik-Schalter setzen (MPO gegen Flackern, GPU-Planung, TDR-Wartezeit)', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt einen systemweiten Grafik-Schalter und zeigt alte und neue Werte: Multiplane-Overlay (MPO) abschalten – von Microsoft/NVIDIA empfohlen gegen Flackern, schwarze Rechtecke und Ruckeln mit mehreren Monitoren und Videos; hardwarebeschleunigte GPU-Planung aus/an – gegen kurze Einfrierer (LiveKernelEvent 141/117) mit manchen Treibern; TDR-Wartezeit 8 Sekunden – „Anzeigetreiber reagiert nicht mehr“ bei großen 3D-Modellen. Mit „Standard“ wieder zurück. Wirkt nach einem Neustart.',
    param: { label: 'Schalter', platzhalter: 'MPO abschalten (Flackern, schwarze Flächen)', pflicht: true, optionen: GRAFIK_OPT },
    ps: String.raw`
$opt = @('${GRAFIK_OPT.join("','")}')
$w = @($opt | Where-Object { $_ -ieq $P.Trim() }); if (-not $w.Count) { throw ('Unbekannter Schalter „' + $P + '“ – möglich: ' + ($opt -join ', ')) }
$g = 'HKLM:\SYSTEM\CurrentControlSet\Control\GraphicsDrivers'; $d = 'HKLM:\SOFTWARE\Microsoft\Windows\Dwm'
function Wert([string]$k, [string]$n) { $v = (Get-ItemProperty -LiteralPath $k -Name $n -EA SilentlyContinue).$n; if ($null -eq $v) { 'Standard (nicht gesetzt)' } else { '' + $v } }
function Stand { 'MPO: OverlayTestMode=' + (Wert $d 'OverlayTestMode') + ', DisableOverlays=' + (Wert $g 'DisableOverlays') + ' · GPU-Planung HwSchMode=' + (Wert $g 'HwSchMode') + ' (1 = aus, 2 = an) · TdrDelay=' + (Wert $g 'TdrDelay') }
Zeile ('Vorher: ' + (Stand))
switch ($w[0]) {
  'MPO abschalten (Flackern, schwarze Flächen)' { if (-not (Test-Path $d)) { New-Item -Path $d -Force | Out-Null }; Set-ItemProperty -LiteralPath $d -Name OverlayTestMode -Value 5 -Type DWord; Set-ItemProperty -LiteralPath $g -Name DisableOverlays -Value 1 -Type DWord }
  'MPO wieder Standard' { Remove-ItemProperty -LiteralPath $d -Name OverlayTestMode -EA SilentlyContinue; Remove-ItemProperty -LiteralPath $g -Name DisableOverlays -EA SilentlyContinue }
  'GPU-Planung aus' { Set-ItemProperty -LiteralPath $g -Name HwSchMode -Value 1 -Type DWord }
  'GPU-Planung an' { Set-ItemProperty -LiteralPath $g -Name HwSchMode -Value 2 -Type DWord }
  'TDR-Wartezeit 8 Sekunden' { Set-ItemProperty -LiteralPath $g -Name TdrDelay -Value 8 -Type DWord }
  'TDR-Wartezeit Standard' { Remove-ItemProperty -LiteralPath $g -Name TdrDelay -EA SilentlyContinue }
}
Zeile ('Jetzt:  ' + (Stand))
foreach ($c in @(Get-CimInstance Win32_VideoController -EA SilentlyContinue)) { Zeile ('Grafik: ' + $c.Name + ' · Treiber ' + $c.DriverVersion) }
$r = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Display'; Id = 4101; StartTime = (Get-Date).AddDays(-14) } -EA SilentlyContinue)
Zeile ('Grafiktreiber-Resets (14 Tage): ' + $r.Count)
Zeile 'Wirkt erst nach einem Neustart des PCs.'` }),

  // ══ Smartphone & MFA ════════════════════════════════════════════════════════
  A({ id: 'bild4-handy-pc-pruefen', titel: 'Handy am PC prüfen (Smartphone-Link, Bluetooth, USB/MTP, Tethering, Richtlinien, HEIF)', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Alles, was Handy und PC verbindet, auf einen Blick: Smartphone-Link (Version, für den Benutzer installiert, läuft, Autostart, Hintergrund, gekoppelte Handys mit Anrufen/Benachrichtigungen/Nachrichten an/aus), Bluetooth (Dienst, Adapter, gekoppelte Geräte), per USB erkannte Handys (MTP/WPD, Apple-Treiber und -Dienst, Android-ADB), USB-/Bluetooth-Tethering-Adapter, Richtlinien, die Smartphone-Link, geräteübergreifende Zwischenablage oder Handys als Speicher sperren, sowie HEIF-/HEVC-Erweiterungen für iPhone-Fotos und -Videos. Ändert nichts.',
    ps: String.raw`
NeedUser
function Pakete([string]$n) { try { @(Get-AppxPackage -AllUsers -Name $n -EA Stop | Select-Object -First 1) } catch { @() } }
$pk = Pakete 'Microsoft.YourPhone'
if ($pk.Count) {
  $fu = @($pk[0].PackageUserInformation | Where-Object { [string]$_.UserSecurityId.Sid -eq $uSid -or [string]$_.UserSecurityId -like ('*' + $uName + '*') } | Select-Object -First 1)
  Zeile ('Smartphone-Link: Version ' + $pk[0].Version + ' · für ' + $uName + ': ' + $(if ($fu.Count) { [string]$fu[0].InstallState } else { 'nicht registriert' }))
} else { Zeile 'Smartphone-Link: nicht installiert (oder Paketliste nicht lesbar)' }
$lp = @(UserProcs @('PhoneExperienceHost', 'YourPhone', 'CrossDeviceService', 'CrossDeviceResume'))
Zeile ('Läuft: ' + $(if ($lp.Count) { ((@($lp | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ') } else { 'nein' }))
if ($uHive) {
  $st = @{ 0 = 'aus'; 1 = 'vom Benutzer abgeschaltet'; 2 = 'an'; 3 = 'per Richtlinie aus'; 4 = 'per Richtlinie an' }
  $sk = $uHive + '\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\Microsoft.YourPhone_8wekyb3d8bbwe'
  foreach ($t in @(Get-ChildItem -LiteralPath $sk -EA SilentlyContinue | Where-Object { $null -ne $_.GetValue('State') })) { Zeile ('Autostart ' + $t.PSChildName + ': ' + $st[[int]$t.GetValue('State')]) }
  $bk = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications\Microsoft.YourPhone_8wekyb3d8bbwe') -EA SilentlyContinue
  Zeile ('Im Hintergrund: ' + $(if ($bk.Disabled -eq 1 -or $bk.DisabledByUser -eq 1) { 'abgeschaltet' } else { 'erlaubt' }))
  $mk = Get-Item -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Mobility') -EA SilentlyContinue
  if ($mk) {
    Zeile ('Mobile Geräte: PhoneLinkEnabled=' + $mk.GetValue('PhoneLinkEnabled') + ' · OptedIn=' + $mk.GetValue('OptedIn') + ' · CrossDeviceEnabled=' + $mk.GetValue('CrossDeviceEnabled'))
    foreach ($g in @($mk.GetValueNames() | Where-Object { $_ -match '^CallsEnabled_(.+)$' } | ForEach-Object { $matches[1] })) { Zeile ('Gekoppeltes Handy ' + $g.Substring(0, [math]::Min(8, $g.Length)) + '…: Anrufe ' + $mk.GetValue('CallsEnabled_' + $g) + ' · Benachrichtigungen ' + $mk.GetValue('NotificationsEnabled_' + $g) + ' · Nachrichten ' + $mk.GetValue('MessagesEnabled_' + $g) + ' (1 = an)') }
  } else { Zeile 'Mobile Geräte: noch nie eingerichtet' }
}
$pol = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -EA SilentlyContinue
foreach ($n in 'EnableMmx', 'AllowCrossDeviceClipboard', 'EnableCdp') { if ($null -ne $pol.$n) { Zeile ('Richtlinie ' + $n + ' = ' + $pol.$n + $(if ($pol.$n -eq 0) { ' (GESPERRT)' } else { '' })) } }
$bs = Get-Service bthserv -EA SilentlyContinue
Zeile ('Bluetooth-Dienst: ' + $(if ($bs) { [string]$bs.Status + ' (' + $bs.StartType + ')' } else { 'fehlt' }))
$bt = @(Get-PnpDevice -Class Bluetooth -EA SilentlyContinue)
foreach ($a in @($bt | Where-Object { $_.Present -and $_.FriendlyName -match 'Adapter|Wireless Bluetooth|Intel|Realtek|Qualcomm|MediaTek' } | Select-Object -First 2)) { Zeile ('Bluetooth-Adapter: ' + $a.FriendlyName + ' · ' + $a.Status) }
$gk = @($bt | Where-Object { [string]$_.InstanceId -match '^BTH(ENUM|LE)\\DEV_' } | ForEach-Object { [string]$_.FriendlyName } | Where-Object { $_ } | Select-Object -Unique)
Zeile ('Gekoppelte Bluetooth-Geräte: ' + $(if ($gk.Count) { ($gk | Select-Object -First 10) -join ', ' } else { 'keine' }))
$usb = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { [string]$_.InstanceId -notmatch '^(BTH|SWD\\MMDEVAPI)' -and $_.Class -notin 'Bluetooth', 'MEDIA', 'AudioEndpoint' -and ($_.Class -eq 'WPD' -or [string]$_.FriendlyName -match 'Apple Mobile Device|iPhone|iPad|\bMTP\b|ADB Interface|Android') })
Zeile ('Per USB erkannte Handys: ' + $(if ($usb.Count) { (@($usb | ForEach-Object { [string]$_.FriendlyName + ' (' + $_.Status + ')' }) | Select-Object -Unique -First 6) -join '; ' } else { 'keins (Handy entsperrt, „Dateiübertragung“ gewählt, Datenkabel?)' }))
$ap = Get-Service -Name 'Apple Mobile Device Service' -EA SilentlyContinue
if ($ap) { Zeile ('Apple Mobile Device Service: ' + $ap.Status + ' (' + $ap.StartType + ')') }
$te = @(Get-NetAdapter -EA SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'Remote NDIS|RNDIS|Apple Mobile Device Ethernet|Bluetooth Device \(Personal Area' })
foreach ($a in $te) { Zeile ('Tethering-Adapter: ' + $a.InterfaceDescription + ' · ' + $a.Status) }
$rs = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices'
if (Test-Path -LiteralPath $rs) {
  if ((Get-ItemProperty -LiteralPath $rs -EA SilentlyContinue).Deny_All -eq 1) { Zeile 'Richtlinie: ALLE Wechseldatenträger gesperrt (auch Handys)' }
  foreach ($k in '{6AC27878-A6FA-4155-BA85-F98F491D4F33}', '{F33FDC04-D1AC-4E8E-9A30-19BBD4B108AE}') { $v = Get-ItemProperty -LiteralPath ($rs + '\' + $k) -EA SilentlyContinue; if ($v.Deny_Read -eq 1 -or $v.Deny_Write -eq 1) { Zeile ('Richtlinie: Handys/Media-Player (WPD) gesperrt – lesen ' + $(if ($v.Deny_Read -eq 1) { 'NEIN' } else { 'ja' }) + ', schreiben ' + $(if ($v.Deny_Write -eq 1) { 'NEIN' } else { 'ja' })) } }
}
foreach ($n in 'Microsoft.HEIFImageExtension', 'Microsoft.HEVCVideoExtension') { $x = Pakete $n; Zeile ($n + ': ' + $(if ($x.Count) { [string]$x[0].Version } else { 'nicht installiert' })) }` }),

  A({ id: 'bild4-smartphone-link', titel: 'Smartphone-Link gezielt abschalten (Anrufe, Benachrichtigungen, Autostart) oder wieder einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet für den angemeldeten Benutzer nur die gewählten Teile von Smartphone-Link (Phone Link) ab: Anrufe am PC (PC klingelt nicht mehr mit), Benachrichtigungen und SMS/Nachrichten des Handys am PC – oder Smartphone-Link ganz (kein Autostart, nicht im Hintergrund, Mobile Geräte aus). „Wieder einschalten“ nimmt alles zurück. Zeigt alte und neue Werte; Smartphone-Link wird dafür beendet. Die Kopplung mit dem Handy bleibt bestehen.',
    param: { label: 'Was', platzhalter: 'Anrufe am PC aus', pflicht: true, optionen: SL_OPT },
    ps: String.raw`
NeedHive
$opt = @('${SL_OPT.join("','")}')
$w = @($opt | Where-Object { $_ -ieq $P.Trim() }); if (-not $w.Count) { throw ('Unbekannte Auswahl „' + $P + '“ – möglich: ' + ($opt -join ', ')) }
$was = $w[0]
$mk = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Mobility'
$bk = $uHive + '\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications\Microsoft.YourPhone_8wekyb3d8bbwe'
$sk = $uHive + '\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\Microsoft.YourPhone_8wekyb3d8bbwe'
function Werte([string]$muster, [int]$v) {
  if (-not (Test-Path -LiteralPath $mk)) { Zeile 'Smartphone-Link wurde für diesen Benutzer noch nie eingerichtet.'; return }
  $it = Get-Item -LiteralPath $mk
  $n = @($it.GetValueNames() | Where-Object { $_ -like $muster })
  if (-not $n.Count) { Zeile ('Keine Einstellung ' + $muster + ' vorhanden (kein Handy gekoppelt).') }
  foreach ($x in $n) { $a = $it.GetValue($x); Set-ItemProperty -LiteralPath $mk -Name $x -Value $v -Type DWord; Zeile ($x + ': ' + $a + ' → ' + $v) }
}
StopUser @('PhoneExperienceHost', 'YourPhone')
switch ($was) {
  'Anrufe am PC aus' { Werte 'CallsEnabled_*' 0 }
  'Benachrichtigungen und Nachrichten am PC aus' { Werte 'NotificationsEnabled_*' 0; Werte 'MessagesEnabled_*' 0 }
  default {
    $an = ($was -eq 'Wieder einschalten'); $v = $(if ($an) { 1 } else { 0 })
    if (Test-Path -LiteralPath $mk) { $a = (Get-Item -LiteralPath $mk).GetValue('PhoneLinkEnabled'); Set-ItemProperty -LiteralPath $mk -Name PhoneLinkEnabled -Value $v -Type DWord; Zeile ('Mobile Geräte/Smartphone-Link: ' + $a + ' → ' + $v) }
    if ($an) { Werte 'CallsEnabled_*' 1; Werte 'NotificationsEnabled_*' 1; Werte 'MessagesEnabled_*' 1 }
    foreach ($t in @(Get-ChildItem -LiteralPath $sk -EA SilentlyContinue | Where-Object { $null -ne $_.GetValue('State') })) {
      $a = [int]$t.GetValue('State')
      if ($a -ge 3) { Zeile ('Autostart ' + $t.PSChildName + ': per Richtlinie festgelegt (' + $a + ') – unverändert'); continue }
      Set-ItemProperty -LiteralPath $t.PSPath -Name State -Value $(if ($an) { 2 } else { 1 }) -Type DWord; Zeile ('Autostart ' + $t.PSChildName + ': ' + $a + ' → ' + $(if ($an) { '2 (an)' } else { '1 (vom Benutzer aus)' }))
    }
    if (-not $an -and -not (Test-Path -LiteralPath $bk)) { New-Item -Path $bk -Force | Out-Null }
    if (Test-Path -LiteralPath $bk) { $b = Get-ItemProperty -LiteralPath $bk; Set-ItemProperty -LiteralPath $bk -Name Disabled -Value (1 - $v) -Type DWord; Set-ItemProperty -LiteralPath $bk -Name DisabledByUser -Value (1 - $v) -Type DWord; Zeile ('Im Hintergrund ausführen: ' + $(if ($b.Disabled -eq 1 -or $b.DisabledByUser -eq 1) { 'aus' } else { 'erlaubt' }) + ' → ' + $(if ($an) { 'erlaubt' } else { 'aus' })) }
  }
}
Zeile 'Wirkt beim nächsten Start von Smartphone-Link. Die Kopplung mit dem Handy bleibt erhalten.'` }),
]
