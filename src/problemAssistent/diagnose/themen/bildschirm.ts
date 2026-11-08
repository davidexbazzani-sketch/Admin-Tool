// ── Diagnose-Thema „Bildschirm, Dock & Grafik“ ───────────────────────────────
// Sonden: bs  = Grafikkarten, Treiber(-alter), Monitore (WMI), Dock/DisplayLink/Thunderbolt, Grafik-Ereignisse, RTX Desktop Manager, Miracast
//         bsb = in der Sitzung des Benutzers: tatsächliche Anzeigemodi je Bildschirm (Auflösung, Hz, Drehung), Skalierung, Kontrast, Farbfilter
// Alles NUR LESEND.
import { ja, liste, nein, num, txt } from '../motor'
import type { DgOber, DgSonde, DgWert } from '../types'

const laeuftNicht = (v: DgWert | undefined): boolean => v !== null && v !== undefined && txt(v) !== '' && txt(v) !== 'Running'

export const SONDEN_BILDSCHIRM: DgSonde[] = [
  {
    id: 'bs', titel: 'Grafik und Monitore (Grafiktreiber, erkannte Bildschirme, Dock, Grafikfehler)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
$vc = @(Get-CimInstance Win32_VideoController -EA SilentlyContinue)
$echt = @($vc | Where-Object { [string]$_.Name -notmatch '(?i)basic (display|render)|basisanzeige|remote|displaylink|citrix|vmware|hyper-v|mirage|indirect|virtual' })
$basis = @($vc | Where-Object { [string]$_.Name -match '(?i)basic display|basisanzeige' })
Fakt 'grafikkarten' @($vc | ForEach-Object { [string]$_.Name }); Fakt 'basisAdapter' ($basis.Count -gt 0)
$alt = -1; $altName = ''; $altVer = ''
foreach ($g in $echt) { if ($g.DriverDate) { $tg = [int]((Get-Date) - [datetime]$g.DriverDate).TotalDays; if ($tg -gt $alt) { $alt = $tg; $altName = [string]$g.Name; $altVer = [string]$g.DriverVersion } } }
Fakt 'treiberAlterTage' $(if ($alt -ge 0) { $alt } else { $null }); Fakt 'treiberAltName' $(if ($altName) { $altName } else { $null })
foreach ($g in $vc) { Punkt ('Grafik: ' + [string]$g.Name) $(if ([int]$g.ConfigManagerErrorCode -ne 0 -or [string]$g.Name -match '(?i)basic display|basisanzeige') { 'fehler' } elseif ($g.DriverDate -and ((Get-Date) - [datetime]$g.DriverDate).TotalDays -gt 730) { 'warn' } else { 'ok' }) ('Treiber ' + [string]$g.DriverVersion + $(if ($g.DriverDate) { ' vom ' + ([datetime]$g.DriverDate).ToString('dd.MM.yyyy') } else { '' }) + $(if ([int]$g.ConfigManagerErrorCode -ne 0) { ' · FEHLER Code ' + [int]$g.ConfigManagerErrorCode } else { '' }) + $(if ([string]$g.Name -match '(?i)basic display|basisanzeige') { ' · KEIN echter Grafiktreiber' } else { '' })) }
$gf = @($vc | Where-Object { [int]$_.ConfigManagerErrorCode -ne 0 } | Select-Object -First 1)
Fakt 'grafikFehlerCode' $(if ($gf.Count) { [int]$gf[0].ConfigManagerErrorCode } else { 0 }); Fakt 'grafikFehlerName' $(if ($gf.Count) { [string]$gf[0].Name } else { $null })
$nv = @($vc | Where-Object { [string]$_.Name -match '(?i)nvidia' }); $amd = @($vc | Where-Object { [string]$_.Name -match '(?i)radeon|\bamd\b' }); $intel = @($vc | Where-Object { [string]$_.Name -match '(?i)intel' })
Fakt 'nvidia' ($nv.Count -gt 0); Fakt 'nvidiaCode43' (@($nv | Where-Object { [int]$_.ConfigManagerErrorCode -eq 43 }).Count -gt 0); Fakt 'hybrid' ($intel.Count -gt 0 -and ($nv.Count + $amd.Count) -gt 0)
$mid = @(Get-CimInstance -Namespace 'root\wmi' -ClassName WmiMonitorID -EA SilentlyContinue | Where-Object { $_.Active })
$mcp = @(Get-CimInstance -Namespace 'root\wmi' -ClassName WmiMonitorConnectionParams -EA SilentlyContinue | Where-Object { $_.Active })
$pnpMon = @(Get-PnpDevice -PresentOnly -Class Monitor -EA SilentlyContinue)
$anzahl = $mid.Count; if (-not $anzahl) { $anzahl = @($pnpMon | Where-Object { [string]$_.Status -eq 'OK' }).Count }
$anschl = @{ '0' = 'VGA'; '4' = 'DVI'; '5' = 'HDMI'; '10' = 'DisplayPort'; '11' = 'intern'; '13' = 'intern'; '15' = 'Miracast'; '16' = 'USB-Grafik (DisplayLink o. ä.)'; '17' = 'virtuell'; '2147483648' = 'intern'; '-2147483648' = 'intern' }
$ext = @($mcp | Where-Object { $vt = [int64]$_.VideoOutputTechnology; -not ($vt -eq 2147483648 -or $vt -eq -2147483648 -or $vt -eq 11 -or $vt -eq 13) })
$namen = @()
foreach ($m in $mid) {
  $nm = (@($m.UserFriendlyName | Where-Object { [int]$_ -gt 0 } | ForEach-Object { [char][int]$_ })) -join ''
  $cp = @($mcp | Where-Object { $_.InstanceName -eq $m.InstanceName } | Select-Object -First 1)
  $an = $(if ($cp.Count) { $anschl[[string][int64]$cp[0].VideoOutputTechnology] } else { $null })
  $namen += ($(if ($nm) { $nm } elseif ($an -eq 'intern') { 'Laptop-Display' } else { 'Bildschirm' }) + $(if ($an) { ' (' + $an + ')' } else { '' }))
}
Fakt 'monitoreAktiv' $anzahl; Fakt 'externeMonitore' $(if ($mcp.Count) { $ext.Count } else { $null }); Fakt 'monitorNamen' @($namen)
Punkt 'Erkannte Bildschirme' $(if ($anzahl -ge 2) { 'ok' } elseif ($anzahl -eq 1) { 'info' } else { 'fehler' }) ('' + $anzahl + $(if ($namen.Count) { ': ' + ($namen -join ', ') } else { '' }))
$oe = @($pnpMon | Where-Object { [string]$_.FriendlyName -match '(?i)non-pnp|nicht-pnp|default monitor|standardmonitor|standard-monitor' })
$mf = @($pnpMon | Where-Object { [string]$_.Status -eq 'Error' })
Fakt 'ohneEdid' ($oe.Count -gt 0); Fakt 'monitorFehler' $mf.Count
if ($oe.Count) { Punkt 'Monitor ohne Kennung (EDID)' 'warn' ((@($oe | ForEach-Object { [string]$_.FriendlyName })) -join ', ') }
$alle = @(Get-PnpDevice -PresentOnly -EA SilentlyContinue)
$dock = @($alle | Where-Object { [string]$_.FriendlyName -match '(?i)\bdock\b|docking|displaylink' })
$tbc = @($alle | Where-Object { [string]$_.FriendlyName -match '(?i)thunderbolt|usb4' })
$df = @(@($dock) + @($tbc) | Where-Object { [string]$_.Status -eq 'Error' })
Fakt 'dockErkannt' ($dock.Count -gt 0); Fakt 'dockNamen' @($dock | ForEach-Object { [string]$_.FriendlyName } | Select-Object -Unique -First 4)
Fakt 'dockFehler' $df.Count; Fakt 'dockFehlerNamen' @($df | ForEach-Object { [string]$_.FriendlyName + ' (Code ' + [int]$_.ConfigManagerErrorCode + ')' } | Select-Object -First 4)
Punkt 'Dockingstation' $(if ($df.Count) { 'fehler' } elseif ($dock.Count) { 'ok' } else { 'info' }) $(if ($df.Count) { 'Fehler: ' + ((@($df | ForEach-Object { [string]$_.FriendlyName } | Select-Object -First 3)) -join ', ') } elseif ($dock.Count) { (@($dock | ForEach-Object { [string]$_.FriendlyName } | Select-Object -Unique -First 3)) -join ', ' } else { 'kein Dock erkannt' })
$dl = @($alle | Where-Object { [string]$_.FriendlyName -match '(?i)displaylink' })
$dld = Get-Service -Name 'DisplayLinkManager' -EA SilentlyContinue
Fakt 'displayLinkGeraet' ($dl.Count -gt 0); Fakt 'displayLinkDienst' $(if ($dld) { [string]$dld.Status } else { $null })
if ($dl.Count) { Punkt 'DisplayLink (Grafik über USB)' $(if ($dld -and $dld.Status -eq 'Running') { 'ok' } else { 'fehler' }) $(if ($dld) { 'Dienst ' + [string]$dld.Status } else { 'Gerät da, DisplayLink-Software FEHLT' }) }
$tbk = @($tbc | Where-Object { [string]$_.FriendlyName -match '(?i)controller|router|host' })
$tbd = Get-Service -Name 'ThunderboltService' -EA SilentlyContinue
Fakt 'thunderbolt' ($tbk.Count -gt 0); Fakt 'tbDienst' $(if ($tbd) { [string]$tbd.Status } else { $null }); Fakt 'tbFehler' @($tbc | Where-Object { [string]$_.Status -eq 'Error' }).Count
if ($tbk.Count -or $tbd) { Punkt 'Thunderbolt / USB4' $(if (@($tbc | Where-Object { [string]$_.Status -eq 'Error' }).Count) { 'fehler' } elseif ($tbd -and $tbd.Status -ne 'Running') { 'warn' } else { 'ok' }) ($(if ($tbk.Count) { [string]$tbk[0].FriendlyName } else { 'kein Controller' }) + $(if ($tbd) { ' · Dienst ' + [string]$tbd.Status } else { '' })) }
$tdr = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Display'; Id = 4101; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 200 -EA SilentlyContinue).Count
$lke = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Windows Error Reporting'; Id = 1001; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { [string]$_.Properties[2].Value -eq 'LiveKernelEvent' -and [string]$_.Properties[5].Value -match '^(141|117)$' }).Count
$vbs = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; Id = 1001; StartTime = (Get-Date).AddDays(-30) } -MaxEvents 100 -EA SilentlyContinue | Where-Object { [string]$_.Message -match '(?i)0x00000116|0x00000119|0x0000010e|0x00000117' }).Count
$igf = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { [string]$_.Properties[0].Value -match '(?i)igfxEM' }).Count
Fakt 'tdr7' $tdr; Fakt 'liveKernel30' $lke; Fakt 'videoBluescreen30' $vbs; Fakt 'igfxemAbstuerze7' $igf
Punkt 'Grafiktreiber zurückgesetzt (7 Tage)' $(if ($tdr -ge 3) { 'fehler' } elseif ($tdr) { 'warn' } else { 'ok' }) ('' + $tdr + ' Mal „Anzeigetreiber reagiert nicht mehr und wurde wiederhergestellt“')
Punkt 'Grafik-Hänger / Bluescreens (30 Tage)' $(if ($vbs) { 'fehler' } elseif ($lke) { 'warn' } else { 'ok' }) ('' + $lke + ' Grafik-Hänger (LiveKernelEvent), ' + $vbs + ' Grafik-Bluescreen(s)')
$rtx = @()
foreach ($uk in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall') {
  $rtx += @(Get-ChildItem -LiteralPath $uk -EA SilentlyContinue | ForEach-Object { [string](Get-ItemProperty -LiteralPath $_.PSPath -Name DisplayName -EA SilentlyContinue).DisplayName } | Where-Object { $_ -match '(?i)RTX Desktop Manager' })
}
Fakt 'rtxDesktopManager' ($rtx.Count -gt 0)
if ($nv.Count) { Punkt 'NVIDIA RTX Desktop Manager' $(if ($rtx.Count) { 'fehler' } else { 'ok' }) $(if ($rtx.Count) { 'INSTALLIERT – legt Edge/Chrome lahm' } else { 'nicht installiert' }) }
$wd = [string](netsh wlan show drivers 2>$null | Out-String)
$mz = [regex]::Match($wd, '(?im)^\s*(Wireless Display Supported|Unterst\S* drahtlose Anzeige|Drahtlose Anzeige unterst\S*)\s*:\s*(.*)$')
$mira = $(if ($mz.Success) { $mz.Groups[2].Value -match '^(?i)(yes|ja)' } else { $null })
Fakt 'miracast' $mira
Punkt 'Drahtloser Bildschirm (Miracast)' $(if ($mira) { 'ok' } else { 'info' }) $(if ($null -eq $mira) { 'nicht feststellbar (kein WLAN?)' } elseif ($mira) { 'unterstützt' } else { 'NICHT unterstützt' })
`,
  },
  {
    id: 'bsb', titel: 'Anzeige in der Sitzung des Benutzers (Auflösung, Hz, Drehung, Skalierung, Kontrast)', modus: 'benutzer', timeoutMs: 60000,
    ps: String.raw`
$zeilen = @()
try {
  Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class DgAnzeige {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DD { public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString; public int StateFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public struct DM {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
    public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags; public int dmDisplayFrequency;
    public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] static extern bool EnumDisplayDevices(string dev, int i, ref DD dd, int flags);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] static extern bool EnumDisplaySettings(string dev, int mode, ref DM dm);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  public static string[] Liste() {
    try { SetProcessDPIAware(); } catch { }
    var aus = new List<string>();
    for (int i = 0; i < 16; i++) {
      var dd = new DD(); dd.cb = Marshal.SizeOf(dd);
      if (!EnumDisplayDevices(null, i, ref dd, 0)) break;
      if ((dd.StateFlags & 1) == 0) continue;
      var dm = new DM(); dm.dmSize = (short)Marshal.SizeOf(dm);
      if (!EnumDisplaySettings(dd.DeviceName, -1, ref dm)) continue;
      int mw = 0, mh = 0, mhz = 0;
      for (int m = 0; m < 4000; m++) {
        var x = new DM(); x.dmSize = (short)Marshal.SizeOf(x);
        if (!EnumDisplaySettings(dd.DeviceName, m, ref x)) break;
        if ((long)x.dmPelsWidth * x.dmPelsHeight > (long)mw * mh) { mw = x.dmPelsWidth; mh = x.dmPelsHeight; }
        if (x.dmPelsWidth == dm.dmPelsWidth && x.dmPelsHeight == dm.dmPelsHeight && x.dmDisplayFrequency > mhz) mhz = x.dmDisplayFrequency;
      }
      var mon = new DD(); mon.cb = Marshal.SizeOf(mon);
      string mn = EnumDisplayDevices(dd.DeviceName, 0, ref mon, 0) ? mon.DeviceString : "";
      aus.Add(string.Join("|", new string[] { dd.DeviceName, dd.DeviceString, mn, dm.dmPelsWidth.ToString(), dm.dmPelsHeight.ToString(), dm.dmDisplayFrequency.ToString(), dm.dmBitsPerPel.ToString(), dm.dmDisplayOrientation.ToString(), mw.ToString(), mh.ToString(), mhz.ToString(), ((dd.StateFlags & 4) != 0 ? "1" : "0") }));
    }
    return aus.ToArray();
  }
}
'@ -EA Stop
  $zeilen = @([DgAnzeige]::Liste())
} catch { Punkt 'Anzeigemodi' 'info' ('nicht lesbar: ' + $_.Exception.Message) }
$aufl = @(); $unter = @(); $lowHz = @(); $minBits = $null; $kopf = $false; $hoch = $false; $minB = $null
foreach ($z in $zeilen) {
  $t = $z -split '\|'
  if ($t.Count -lt 12) { continue }
  $wB = [int]$t[3]; $wH = [int]$t[4]; $hz = [int]$t[5]; $bit = [int]$t[6]; $ori = [int]$t[7]; $mxB = [int]$t[8]; $mxH = [int]$t[9]; $mxHz = [int]$t[10]
  $wer = $(if ($t[2]) { $t[2] } else { $t[0] }) + $(if ($t[11] -eq '1') { ' [Hauptbildschirm]' } else { '' })
  $aufl += ($wer + ': ' + $wB + '×' + $wH + ' @ ' + $hz + ' Hz')
  if ([int64]$wB * $wH -lt [int64]$mxB * $mxH) { $unter += ($wer + ': ' + $wB + '×' + $wH + ' statt ' + $mxB + '×' + $mxH) }
  if ($hz -gt 1 -and $hz -lt 50) { $lowHz += ($wer + ': ' + $hz + ' Hz' + $(if ($mxHz -gt $hz) { ' (möglich ' + $mxHz + ' Hz)' } else { '' })) }
  if ($null -eq $minBits -or $bit -lt $minBits) { $minBits = $bit }
  if ($null -eq $minB -or $wB -lt $minB) { $minB = $wB }
  if ($ori -eq 2) { $kopf = $true }; if ($ori -eq 1 -or $ori -eq 3) { $hoch = $true }
}
Fakt 'anzeigen' $(if ($zeilen.Count) { $aufl.Count } else { $null }); Fakt 'aufloesungen' @($aufl); Fakt 'unterNativ' @($unter); Fakt 'niedrigeHz' @($lowHz)
Fakt 'minBits' $minBits; Fakt 'kleinsteBreite' $minB; Fakt 'kopfstehend' $kopf; Fakt 'hochformat' $hoch
if ($zeilen.Count) {
  Punkt 'Bildschirme im Desktop' 'info' ('' + $aufl.Count + ': ' + ($aufl -join ' · '))
  Punkt 'Auflösung' $(if ($unter.Count) { 'warn' } else { 'ok' }) $(if ($unter.Count) { 'UNTER der möglichen Auflösung – ' + ($unter -join ' · ') } else { 'alle mit höchster Auflösung' })
  Punkt 'Bildwiederholrate' $(if ($lowHz.Count) { 'warn' } else { 'ok' }) $(if ($lowHz.Count) { $lowHz -join ' · ' } else { 'mind. 50 Hz' })
  if ($kopf -or $hoch) { Punkt 'Ausrichtung' 'warn' $(if ($kopf) { 'ein Bildschirm steht auf dem KOPF (180°)' } else { 'Hochformat eingestellt' }) }
}
$dk = Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Desktop' -EA SilentlyContinue
$benDef = ($dk.Win8DpiScaling -eq 1 -and $null -ne $dk.LogPixels)
Fakt 'skalierungBenutzerdef' $benDef; Fakt 'skalierungProzent' $(if ($benDef) { [math]::Round([double]$dk.LogPixels / 96 * 100) } else { $null })
Punkt 'Skalierung' $(if ($benDef) { 'warn' } else { 'ok' }) $(if ($benDef) { 'BENUTZERDEFINIERT ' + [math]::Round([double]$dk.LogPixels / 96 * 100) + ' % (wirkt auf alle Bildschirme, oft unscharf)' } else { 'Windows-Standard je Bildschirm' })
$hc = [string](Get-ItemProperty -LiteralPath 'HKCU:\Control Panel\Accessibility\HighContrast' -Name Flags -EA SilentlyContinue).Flags
$kon = $false; if ($hc -match '^\d+$') { $kon = (([int64]$hc -band 1) -eq 1) }
$cf = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\ColorFiltering' -EA SilentlyContinue
$ff = ($cf.Active -eq 1)
Fakt 'kontrast' $kon; Fakt 'farbfilter' $ff
Punkt 'Kontrastdesign' $(if ($kon) { 'warn' } else { 'ok' }) $(if ($kon) { 'EIN' } else { 'aus' })
Punkt 'Farbfilter (z. B. Graustufen)' $(if ($ff) { 'warn' } else { 'ok' }) $(if ($ff) { 'EIN' } else { 'aus' })
`,
  },
]

export const THEMEN_BILDSCHIRM: DgOber[] = [
  {
    id: 'bildschirm', titel: 'Bildschirm, Dock & Grafik', symbol: 'Monitor', beschreibung: 'Zweiter Monitor fehlt, Bild unscharf oder flackert, Monitore am Dock schwarz, Beamer zeigt nichts, Probleme nach Grafiktreiber-Update',
    unter: [
      {
        id: 'bs-zweiter', titel: 'Zweiter Monitor wird nicht erkannt', beschreibung: 'Monitor zeigt „Kein Signal“, bleibt schwarz oder Windows zeigt nur einen Bildschirm an',
        sonden: ['bs', 'bsb'],
        fragen: [{ id: 'dock', text: 'Hängt der Monitor an einer Dockingstation (statt direkt am Laptop/PC)?' }],
        regeln: [
          { id: 'basis', wenn: f => ja(f['bs.basisAdapter']), befund: () => 'Es läuft nur der „Microsoft Basisanzeigeadapter“ – der Grafiktreiber fehlt', problem: 'bildschirm-basisanzeigeadapter', schwere: 3 },
          { id: 'code43', wenn: f => ja(f['bs.nvidiaCode43']), befund: () => 'NVIDIA-Grafikkarte meldet „Code 43“ im Geräte-Manager', problem: 'bildschirm-nvidia-code-43', schwere: 3 },
          { id: 'dupliziert', wenn: f => num(f['bs.monitoreAktiv']) >= 2 && num(f['bsb.anzeigen']) === 1, befund: f => `${f['bs.monitoreAktiv']} Bildschirme angeschlossen, Windows zeigt aber nur 1 Bild (dupliziert oder ein Bildschirm abgeschaltet)`, problem: 'bildschirm-dupliziert-statt-erweitert', schwere: 3 },
          { id: 'einer-direkt', wenn: f => num(f['bs.monitoreAktiv']) <= 1 && f['frage.dock'] !== 'ja', befund: f => `Windows erkennt nur ${f['bs.monitoreAktiv']} Bildschirm (${txt(f['bs.monitorNamen'])})`, problem: 'bildschirm-zweiter-monitor', schwere: 2 },
          { id: 'einer-dock', wenn: f => num(f['bs.monitoreAktiv']) <= 1 && f['frage.dock'] === 'ja', befund: f => `Am Dock wird kein weiterer Bildschirm erkannt (nur ${f['bs.monitoreAktiv']}: ${txt(f['bs.monitorNamen'])})`, problem: 'bildschirm-dock-monitore-schwarz', schwere: 2 },
          { id: 'grafikfehler', wenn: f => num(f['bs.grafikFehlerCode']) > 0 && nein(f['bs.nvidiaCode43']), befund: f => `Grafikkarte ${txt(f['bs.grafikFehlerName'])} meldet Fehler Code ${f['bs.grafikFehlerCode']}`, problem: 'bildschirm-zweiter-monitor', schwere: 2 },
          { id: 'dock-fehler', wenn: f => num(f['bs.dockFehler']) > 0, befund: f => `Dock/Thunderbolt-Gerät mit Fehler: ${txt(f['bs.dockFehlerNamen'])}`, problem: 'hardware-dock-nicht-erkannt', schwere: 2 },
          { id: 'treiber-alt', wenn: f => num(f['bs.treiberAlterTage']) > 730, befund: f => `Grafiktreiber (${txt(f['bs.treiberAltName'])}) ist ${f['bs.treiberAlterTage']} Tage alt`, problem: 'bildschirm-zweiter-monitor', schwere: 1 },
        ],
        ohneBefund: ['bildschirm-zweiter-monitor', 'bildschirm-kein-signal', 'bildschirm-usb-c-monitor', 'bildschirm-daisy-chain'],
      },
      {
        id: 'bs-unscharf', titel: 'Bild unscharf, Auflösung falsch, alles zu groß oder zu klein', beschreibung: 'Schrift verschwommen, Bild gestreckt, Symbole riesig oder winzig, Monitor ruckelt (30 Hz)',
        sonden: ['bs', 'bsb'],
        regeln: [
          { id: 'basis', wenn: f => ja(f['bs.basisAdapter']), befund: () => 'Es läuft nur der „Microsoft Basisanzeigeadapter“ – daher niedrige Auflösung', problem: 'bildschirm-basisanzeigeadapter', schwere: 3 },
          { id: 'unter-nativ', wenn: f => liste(f['bsb.unterNativ']).length > 0, befund: f => `Bildschirm läuft unter seiner Auflösung: ${txt(f['bsb.unterNativ'])}`, problem: 'bildschirm-aufloesung-unscharf', schwere: 3 },
          { id: 'benutzerdef', wenn: f => ja(f['bsb.skalierungBenutzerdef']), befund: f => `Benutzerdefinierte Skalierung ${f['bsb.skalierungProzent']} % ist eingestellt`, problem: 'bildschirm-benutzerdefinierte-skalierung', schwere: 3 },
          { id: 'ohne-edid', wenn: f => ja(f['bs.ohneEdid']), befund: () => 'Ein Monitor meldet keine Kennung (Standardmonitor) – die richtige Auflösung fehlt', problem: 'bildschirm-generischer-pnp-monitor', schwere: 2 },
          { id: 'hz', wenn: f => liste(f['bsb.niedrigeHz']).length > 0, befund: f => `Niedrige Bildwiederholrate: ${txt(f['bsb.niedrigeHz'])}`, problem: 'bildschirm-30hz', schwere: 2 },
          { id: 'displaylink', wenn: f => ja(f['bs.displayLinkGeraet']) && laeuftNicht(f['bs.displayLinkDienst']), befund: f => `DisplayLink-Dienst läuft nicht (${txt(f['bs.displayLinkDienst'])})`, problem: 'bildschirm-displaylink', schwere: 2 },
          { id: 'treiber-alt', wenn: f => num(f['bs.treiberAlterTage']) > 730, befund: f => `Grafiktreiber (${txt(f['bs.treiberAltName'])}) ist ${f['bs.treiberAlterTage']} Tage alt`, problem: 'bildschirm-aufloesung-unscharf', schwere: 1 },
        ],
        ohneBefund: ['bildschirm-aufloesung-unscharf', 'bildschirm-skalierung', 'bildschirm-programm-unscharf', 'office-zweiter-bildschirm-unscharf'],
      },
      {
        id: 'bs-flackert', titel: 'Bildschirm flackert, wird kurz schwarz oder friert ein', beschreibung: 'Bild flackert, ist für Sekunden schwarz, „Anzeigetreiber wurde wiederhergestellt“, Bild friert ein und die Maus läuft weiter',
        sonden: ['bs', 'sys'],
        fragen: [{ id: 'akku', text: 'Passiert es nur im Akkubetrieb (ohne Netzteil)?' }],
        regeln: [
          { id: 'bluescreen', wenn: f => num(f['bs.videoBluescreen30']) > 0, befund: f => `${f['bs.videoBluescreen30']} Grafik-Bluescreen(s) in 30 Tagen (VIDEO_TDR_FAILURE o. ä.)`, problem: 'bildschirm-bluescreen-video-tdr', schwere: 3 },
          { id: 'tdr-oft', wenn: f => num(f['bs.tdr7']) >= 3, befund: f => `Grafiktreiber wurde in 7 Tagen ${f['bs.tdr7']}× zurückgesetzt`, problem: 'bildschirm-kurz-schwarz', schwere: 3 },
          { id: 'tdr', wenn: f => num(f['bs.tdr7']) >= 1 && num(f['bs.tdr7']) < 3, befund: f => `Grafiktreiber wurde in 7 Tagen ${f['bs.tdr7']}× zurückgesetzt`, problem: 'bildschirm-kurz-schwarz', schwere: 2 },
          { id: 'livekernel', wenn: f => num(f['bs.liveKernel30']) > 0, befund: f => `${f['bs.liveKernel30']} Grafik-Hänger (LiveKernelEvent) in 30 Tagen`, problem: 'bildschirm-livekernelevent-141', schwere: 2 },
          { id: 'basis', wenn: f => ja(f['bs.basisAdapter']), befund: () => 'Es läuft nur der „Microsoft Basisanzeigeadapter“', problem: 'bildschirm-basisanzeigeadapter', schwere: 2 },
          { id: 'akku', wenn: f => f['frage.akku'] === 'ja' && ja(f['sys.akku']), befund: () => 'Flackern nur im Akkubetrieb – Energiesparfunktion des Displays', problem: 'bildschirm-flackert-im-akku', schwere: 2 },
          { id: 'treiber-alt', wenn: f => num(f['bs.treiberAlterTage']) > 730, befund: f => `Grafiktreiber (${txt(f['bs.treiberAltName'])}) ist ${f['bs.treiberAlterTage']} Tage alt`, problem: 'bildschirm-flackert', schwere: 2 },
          { id: 'displaylink', wenn: f => ja(f['bs.displayLinkGeraet']), befund: () => 'Monitore hängen an DisplayLink (Grafik über USB) – ruckelt bei Last', problem: 'bildschirm-displaylink-ruckelt', schwere: 1 },
        ],
        ohneBefund: ['bildschirm-flackert', 'bildschirm-kurz-schwarz', 'bildschirm-monitor-geht-aus', 'bildschirm-flackern-video-mpo'],
      },
      {
        id: 'bs-dock', titel: 'Monitore am Dock bleiben schwarz', beschreibung: 'Laptop am Dock: externe Monitore bleiben schwarz, nur ein Monitor geht, Dock wird nicht erkannt',
        sonden: ['bs', 'bsb'],
        fragen: [{ id: 'drei', text: 'Sollen am Dock drei oder mehr Bildschirme laufen?' }],
        regeln: [
          { id: 'dock-fehler', wenn: f => num(f['bs.dockFehler']) > 0, befund: f => `Dock/Thunderbolt-Gerät mit Fehler: ${txt(f['bs.dockFehlerNamen'])}`, problem: 'hardware-dock-nicht-erkannt', schwere: 3 },
          { id: 'displaylink', wenn: f => ja(f['bs.displayLinkGeraet']) && f['bs.displayLinkDienst'] !== undefined && txt(f['bs.displayLinkDienst']) !== 'Running', befund: f => f['bs.displayLinkDienst'] === null ? 'DisplayLink-Dock erkannt, aber die DisplayLink-Software fehlt' : `DisplayLink-Dienst läuft nicht (${txt(f['bs.displayLinkDienst'])})`, problem: 'bildschirm-displaylink', schwere: 3 },
          { id: 'kein-extern', wenn: f => ja(f['bs.dockErkannt']) && num(f['bs.externeMonitore']) === 0, befund: f => `Dock ist da (${txt(f['bs.dockNamen'])}), aber kein externer Bildschirm wird erkannt`, problem: 'bildschirm-dock-monitore-schwarz', schwere: 3 },
          { id: 'tb-dienst', wenn: f => ja(f['bs.thunderbolt']) && laeuftNicht(f['bs.tbDienst']), befund: f => `Thunderbolt-Dienst läuft nicht (${txt(f['bs.tbDienst'])}) – Dock wird ggf. nicht freigegeben`, problem: 'bildschirm-thunderbolt-genehmigung', schwere: 2 },
          { id: 'tb-fehler', wenn: f => num(f['bs.tbFehler']) > 0, befund: f => `${f['bs.tbFehler']} Thunderbolt/USB4-Gerät(e) mit Fehler`, problem: 'hardware-thunderbolt-controller-fehlt', schwere: 2 },
          { id: 'kein-dock', wenn: f => nein(f['bs.dockErkannt']) && num(f['bs.externeMonitore']) === 0, befund: () => 'Windows erkennt weder ein Dock noch einen externen Bildschirm', problem: 'hardware-dock-nicht-erkannt', schwere: 2 },
          { id: 'dritter', wenn: f => f['frage.drei'] === 'ja' && num(f['bs.externeMonitore']) === 2, befund: () => 'Nur 2 externe Bildschirme laufen – der dritte wird nicht angesteuert', problem: 'bildschirm-dritter-monitor', schwere: 2 },
          { id: 'hz', wenn: f => liste(f['bsb.niedrigeHz']).length > 0, befund: f => `Monitor am Dock mit niedriger Bildwiederholrate: ${txt(f['bsb.niedrigeHz'])}`, problem: 'bildschirm-30hz', schwere: 2 },
        ],
        ohneBefund: ['bildschirm-dock-monitore-schwarz', 'hardware-dock-nicht-erkannt', 'bildschirm-displaylink', 'hardware-dock-trennt-staendig'],
      },
      {
        id: 'bs-beamer', titel: 'Beamer oder Präsentation geht nicht', beschreibung: 'Beamer/Raumdisplay zeigt nichts oder nur den Hintergrund, Bild verzerrt, „Drahtlos verbinden“ findet nichts',
        sonden: ['bs', 'bsb'],
        fragen: [{ id: 'drahtlos', text: 'Soll drahtlos verbunden werden (Windows+K / Miracast)?' }, { id: 'hintergrund', text: 'Zeigt der Beamer nur den Desktop-Hintergrund?' }],
        regeln: [
          { id: 'basis', wenn: f => ja(f['bs.basisAdapter']), befund: () => 'Es läuft nur der „Microsoft Basisanzeigeadapter“ – kein echter Grafiktreiber', problem: 'bildschirm-basisanzeigeadapter', schwere: 3 },
          { id: 'kein-beamer', wenn: f => num(f['bs.monitoreAktiv']) <= 1 && f['frage.drahtlos'] !== 'ja', befund: () => 'Windows erkennt keinen zweiten Bildschirm (Beamer/Display)', problem: 'bildschirm-beamer', schwere: 3 },
          { id: 'miracast', wenn: f => f['frage.drahtlos'] === 'ja' && nein(f['bs.miracast']), befund: () => 'WLAN-/Grafiktreiber unterstützen keinen drahtlosen Bildschirm (Miracast)', problem: 'bildschirm-miracast-findet-nichts', schwere: 3 },
          { id: 'hintergrund', wenn: f => f['frage.hintergrund'] === 'ja' && num(f['bsb.anzeigen']) >= 2, befund: () => 'Der Beamer ist als ERWEITERTER Bildschirm eingestellt – die Präsentation läuft auf dem Laptop', problem: 'bildschirm-beamer-nur-hintergrund', schwere: 3 },
          { id: 'dupliziert', wenn: f => num(f['bs.monitoreAktiv']) >= 2 && num(f['bsb.anzeigen']) === 1, befund: () => 'Bild wird dupliziert – die PowerPoint-Referentenansicht braucht „Erweitern“', problem: 'ppt-referentenansicht-dupliziert', schwere: 2 },
          { id: 'klein', wenn: f => num(f['bsb.kleinsteBreite']) > 0 && num(f['bsb.kleinsteBreite']) <= 1024, befund: f => `Ein Bildschirm läuft nur mit ${f['bsb.kleinsteBreite']} Pixel Breite – Bild gestaucht/verzerrt`, problem: 'bildschirm-beamer-verzerrt-duplizieren', schwere: 2 },
          { id: 'unter-nativ', wenn: f => liste(f['bsb.unterNativ']).length > 0, befund: f => `Bildschirm läuft unter seiner Auflösung: ${txt(f['bsb.unterNativ'])}`, problem: 'bildschirm-beamer-ausschnitt', schwere: 1 },
        ],
        ohneBefund: ['bildschirm-beamer', 'bildschirm-beamer-nur-hintergrund', 'ppt-referentenansicht-dupliziert', 'bildschirm-beamer-ausschnitt'],
      },
      {
        id: 'bs-treiber', titel: 'Grafiktreiber-Probleme (auch: Edge/Chrome weiß nach Treiber-Update)', beschreibung: 'Nach einem Grafiktreiber-Update gehen Edge/Chrome nicht mehr, NVIDIA-Fehler, „igfxEM funktioniert nicht mehr“, falsche Grafikkarte',
        sonden: ['bs', 'sys'],
        fragen: [{ id: 'browser', text: 'Zeigen Edge oder Chrome nur weiße oder leere Fenster bzw. starten nicht?' }],
        regeln: [
          { id: 'rtx', wenn: f => ja(f['bs.rtxDesktopManager']), befund: () => '„NVIDIA RTX Desktop Manager“ ist installiert – legt Edge/Chrome lahm', problem: 'bildschirm-rtx-desktop-manager', schwere: 3 },
          { id: 'code43', wenn: f => ja(f['bs.nvidiaCode43']), befund: () => 'NVIDIA-Grafikkarte meldet „Code 43“', problem: 'bildschirm-nvidia-code-43', schwere: 3 },
          { id: 'basis', wenn: f => ja(f['bs.basisAdapter']), befund: () => 'Es läuft nur der „Microsoft Basisanzeigeadapter“ – der Grafiktreiber fehlt', problem: 'bildschirm-basisanzeigeadapter', schwere: 3 },
          { id: 'browser-nvidia', wenn: f => f['frage.browser'] === 'ja' && ja(f['bs.nvidia']) && nein(f['bs.rtxDesktopManager']), befund: () => 'NVIDIA-Grafik und weiße Browserfenster – typisch nach Treiber-Update (Zusatzkomponenten)', problem: 'browser-weiss-rtx-desktop-manager', schwere: 2 },
          { id: 'igfxem', wenn: f => num(f['bs.igfxemAbstuerze7']) > 0, befund: f => `„igfxEM“ ist in 7 Tagen ${f['bs.igfxemAbstuerze7']}× abgestürzt`, problem: 'bildschirm-igfxem-fehler', schwere: 2 },
          { id: 'tdr', wenn: f => num(f['bs.tdr7']) > 0, befund: f => `Grafiktreiber wurde in 7 Tagen ${f['bs.tdr7']}× zurückgesetzt`, problem: 'bildschirm-kurz-schwarz', schwere: 2 },
          { id: 'treiber-alt', wenn: f => num(f['bs.treiberAlterTage']) > 730, befund: f => `Grafiktreiber (${txt(f['bs.treiberAltName'])}) ist ${f['bs.treiberAlterTage']} Tage alt`, problem: 'bildschirm-windows-update-alter-treiber', schwere: 1 },
          { id: 'hybrid', wenn: f => ja(f['bs.hybrid']), befund: f => `Zwei Grafikkarten (${txt(f['bs.grafikkarten'])}) – Programme können auf der falschen laufen`, problem: 'bildschirm-falsche-grafikkarte', schwere: 1 },
        ],
        ohneBefund: ['bildschirm-rtx-desktop-manager', 'bildschirm-schwarz-nach-treiberupdate-fern', 'bildschirm-nvidia-systemsteuerung-fehlt', 'bildschirm-falsche-grafikkarte'],
      },
      {
        id: 'bs-farben', titel: 'Bild sieht falsch aus: Farben, Kontrast, schwarz-weiß, gedreht', beschreibung: 'Plötzlich schwarz-weiß oder grelle Farben, Farbstreifen, Bild steht auf dem Kopf oder ist hochkant',
        sonden: ['bsb', 'bs'],
        regeln: [
          { id: 'kontrast', wenn: f => ja(f['bsb.kontrast']), befund: () => 'Kontrastdesign ist eingeschaltet', problem: 'bildschirm-kontrastmodus', schwere: 3 },
          { id: 'farbfilter', wenn: f => ja(f['bsb.farbfilter']), befund: () => 'Ein Farbfilter (z. B. Graustufen) ist eingeschaltet', problem: 'windows-bildschirm-graustufen', schwere: 3 },
          { id: 'kopf', wenn: f => ja(f['bsb.kopfstehend']), befund: () => 'Ein Bildschirm ist um 180° gedreht', problem: 'bildschirm-gedreht', schwere: 3 },
          { id: 'hochformat', wenn: f => ja(f['bsb.hochformat']), befund: () => 'Ein Bildschirm ist auf Hochformat (90°) gedreht', problem: 'bildschirm-gedreht', schwere: 2 },
          { id: 'bits', wenn: f => num(f['bsb.minBits']) > 0 && num(f['bsb.minBits']) < 24, befund: f => `Farbtiefe nur ${f['bsb.minBits']} Bit – Farbverläufe zeigen Stufen`, problem: 'bildschirm-farbstreifen-banding', schwere: 2 },
          { id: 'basis', wenn: f => ja(f['bs.basisAdapter']), befund: () => 'Es läuft nur der „Microsoft Basisanzeigeadapter“', problem: 'bildschirm-basisanzeigeadapter', schwere: 2 },
          { id: 'treiber-alt', wenn: f => num(f['bs.treiberAlterTage']) > 730, befund: f => `Grafiktreiber (${txt(f['bs.treiberAltName'])}) ist ${f['bs.treiberAlterTage']} Tage alt`, problem: 'bildschirm-farben', schwere: 1 },
        ],
        ohneBefund: ['bildschirm-farben', 'bildschirm-hdr-blass', 'bildschirm-hdmi-flaue-farben', 'bildschirm-hp-farbmodus-verstellt'],
      },
    ],
  },
]
