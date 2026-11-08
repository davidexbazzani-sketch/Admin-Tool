// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „wlan“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Firmen-WLAN-Anmeldung (802.1X/EAP), WLAN-Ereignisse, erweiterte WLAN-Treiber-Eigenschaften, Anmeldeseiten
// öffentlicher WLANs (Captive Portal), Zscaler-Zustand und die Dienste von WLAN, Zscaler und Cisco.
// Treiber-Eigenschaften werden mit -NoRestart gesetzt (keine Trennung); laufende Dienste werden nie gestoppt.
// Access Points, RADIUS/NPS, Zertifizierungsstellen, Zscaler-Richtlinien und Gruppenrichtlinien ändert nichts hiervon.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Einstellungen für „wlan4-treiber-erweitert“. */
const TREIBER_OPT = ['Wi-Fi 7 aus (höchstens Wi-Fi 6)', 'Wi-Fi 6 und 7 aus (höchstens Wi-Fi 5)', 'Wi-Fi-Modus: Treiber-Standard', 'Energiesparen im Treiber aus (MIMO, U-APSD, Paketbündelung)', 'Bluetooth-Koexistenz ein', 'Alle Treiber-Einstellungen auf Standard']
/** Dienstgruppen für „wlan4-dienste-reparieren“. */
const DIENST_OPT = ['WLAN (WlanSvc, EapHost)', 'Zscaler (ZSAService)', 'Cisco Secure Client (VPN-Agent)']
/** Browser für „wlan4-anmeldeseite-oeffnen“. */
const BROWSER_OPT = ['Standardbrowser', 'Edge', 'Chrome', 'Firefox']

/** WLAN-Profile lesen (auch schreibgeschützte Richtlinien-Profile, die netsh ohne „Name :“ auflistet) — nie Kennwörter. */
const WL_PS = String.raw`
function WlProfile {
  $l = @()
  foreach ($z in ((& netsh.exe wlan show profiles 2>&1 | Out-String) -split '\r?\n')) {
    if ($z -notmatch '^\s+\S') { continue }
    $t = $z.Trim()
    if ($t -match '^-+$' -or $t -match '^<') { continue }
    if ($t -match ':') { $t = ($t -replace '^[^:]*:\s*', '').Trim() }
    if ($t) { $l += $t }
  }
  @($l | Select-Object -Unique)
}
function WlDetail([string]$n) { (& netsh.exe wlan show profile ('name=' + $n) 2>&1 | Out-String) }
`

/** Physische WLAN-Adapter (ohne Bluetooth). */
const WLAD_PS = String.raw`
function WlAdapter { @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.PhysicalMediaType -match '802\.11' -or ($_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN' -and $_.PhysicalMediaType -notmatch 'Bluetooth') }) }
`

export const AKTIONEN_WLAN4: PaAktion[] = [
  // ══ Firmen-WLAN-Anmeldung (802.1X) — lesend ═════════════════════════════════
  A({ id: 'wlan4-anmeldung-pruefen', titel: 'Firmen-WLAN-Anmeldung (802.1X) prüfen: Profil, EAP, Zertifikate, Dienste, letzte Fehler', modus: 'system', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Zeigt für das Enterprise-WLAN-Profil (z. B. SKF-Corp) bzw. ein angegebenes Profil: Sicherheit, EAP-Methode (Zertifikat/PEAP), Anmeldung als Computer oder Benutzer, erwartete WLAN-Server und vertrauenswürdige Stammzertifikate (vorhanden/abgelaufen), die Computerzertifikate für die Anmeldung (Ablauf, privater Schlüssel nutzbar, TPM), die Dienste „Automatische WLAN-Konfiguration“ und „Extensible Authentication Protocol“ sowie die 802.1X- und Verbindungsfehler der letzten 7 Tage mit EAP-Fehlercode im Klartext. Nie Kennwörter. Ändert nichts.',
    param: { label: 'WLAN-Profil (optional)', platzhalter: 'leer = Firmen-WLAN (Enterprise-Profil), z. B. SKF-Corp', vorlagen: ['SKF-Corp', 'eduroam'] },
    ps: String.raw`
${WL_PS}
$jetzt = Get-Date
$eapText = @{ '0x80420010' = 'Zertifikatspeicher nicht zugreifbar'; '0x80420011' = 'EAP-Methode nicht installiert'; '0x80420100' = 'Anmelde-Zertifikat (Computer/Benutzer) nicht gefunden'; '0x80420101' = 'Anmelde-Zertifikat ungültig'; '0x80420102' = 'Anmelde-Zertifikat abgelaufen'; '0x80420103' = 'Anmelde-Zertifikat gesperrt (zurückgezogen)'; '0x80420104' = 'sonstiger Fehler am Anmelde-Zertifikat'; '0x80420105' = 'Anmelde-Zertifikat vom Server abgelehnt'; '0x80420111' = 'Anmeldedaten abgelehnt'; '0x80420112' = 'Benutzername oder Kennwort abgelehnt'; '0x80420113' = 'kein Smartcard-Leser'; '0x80420200' = 'Serverzertifikat nicht gefunden'; '0x80420201' = 'Serverzertifikat ungültig'; '0x80420202' = 'Serverzertifikat abgelaufen'; '0x80420203' = 'Serverzertifikat gesperrt'; '0x80420204' = 'sonstiger Fehler am Serverzertifikat'; '0x80420300' = 'Stammzertifikat zum eigenen Zertifikat fehlt'; '0x80420301' = 'Stammzertifikat zum eigenen Zertifikat ungültig'; '0x80420302' = 'Stammzertifikat zum eigenen Zertifikat abgelaufen'; '0x80420400' = 'Stammzertifizierungsstelle des WLAN-Servers fehlt bzw. nicht vertrauenswürdig'; '0x80420401' = 'Stammzertifikat des WLAN-Servers ungültig' }
$roh = $P.Trim()
if ($roh -and $roh -notmatch '^[^"\x00-\x1f]{1,64}$') { throw 'Ungültiger Profilname (keine Anführungszeichen, höchstens 64 Zeichen).' }
$liste = @(WlProfile)
$ziel = $null
if ($roh) {
  $ziel = @($liste | Where-Object { $_ -ieq $roh })[0]
  if (-not $ziel) { throw ('WLAN-Profil „' + $roh + '“ ist auf diesem PC nicht gespeichert. Vorhanden: ' + (($liste | Select-Object -First 12) -join ', ')) }
} else {
  $kand = @()
  foreach ($n in $liste) { $t = WlDetail $n; if ($t -match '(?i)802\.1X\s*:\s*(Aktiviert|Enabled)' -or $t -match '(?i)(Enterprise|Unternehmen)') { $kand += $n } }
  $ziel = @($kand | Where-Object { $_ -match 'SKF' })[0]
  if (-not $ziel) { $ziel = @($kand)[0] }
}
if (-not $ziel) { Zeile ('Kein Enterprise-WLAN-Profil (802.1X) gespeichert' + $(if ($liste.Count) { ' — vorhanden: ' + (($liste | Select-Object -First 10) -join ', ') } else { ' — keine WLAN-Profile bzw. kein WLAN-Adapter' }) + '. Fehlt SKF-Corp: „Gruppenrichtlinien neu anwenden“.') }
else {
  Zeile ('Profil „' + $ziel + '“:')
  $schon = @{}
  foreach ($z in ((WlDetail $ziel) -split '\r?\n')) {
    if ($z -match '(?i)Schl.sselinhalt|Key Content|Sicherheitsschl|Security key') { continue }
    if ($z -match '^\s*(Angewendet|Applied|Authentifizierung|Authentication|Verschl.sselung|Ciph[e]r|802\.1X|EAP|Zwischengespeichert|Cached)') { $k = $z.Trim(); if (-not $schon.ContainsKey($k)) { $schon[$k] = 1; Zeile ('  ' + $k) } }
  }
  $xml = ''
  foreach ($f in @(Get-ChildItem 'C:\ProgramData\Microsoft\Wlansvc\Profiles\Interfaces' -Recurse -Filter '*.xml' -EA SilentlyContinue)) {
    $c = ''; try { $c = [System.IO.File]::ReadAllText($f.FullName) } catch {}
    if ($c -match '<name>([^<]*)</name>' -and $matches[1] -ieq $ziel) { $xml = $c; break }
  }
  if (-not $xml) {
    foreach ($k in @(Get-ChildItem 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Wireless' -Recurse -EA SilentlyContinue)) {
      $pp = Get-ItemProperty -LiteralPath $k.PSPath -EA SilentlyContinue
      if (-not $pp) { continue }
      foreach ($pr in $pp.PSObject.Properties) {
        if ($pr.Name -like 'PS*') { continue }
        $v = $pr.Value; $s2 = ''
        if ($v -is [string]) { $s2 = $v }
        elseif ($v -is [byte[]]) { try { $s2 = [Text.Encoding]::Unicode.GetString($v) } catch {}; if ($s2 -notmatch '<WLANProfile') { try { $s2 = [Text.Encoding]::UTF8.GetString($v) } catch {} } }
        if ($s2 -match '<WLANProfile' -and $s2 -match ('<name>' + [regex]::Escape($ziel) + '</name>')) { $xml = $s2; break }
      }
      if ($xml) { break }
    }
  }
  if ($xml) {
    $am = ''; if ($xml -match '<authMode>([^<]+)</authMode>') { $am = $matches[1].Trim() }
    $amT = switch ($am) { 'machineOrUser' { 'Computer, nach der Windows-Anmeldung Benutzer (machineOrUser)' } 'machine' { 'nur Computer (machine)' } 'user' { 'nur Benutzer (user)' } 'guest' { 'Gast' } default { 'nicht festgelegt (Windows-Standard: Computer oder Benutzer)' } }
    Zeile ('  Anmeldung als: ' + $amT)
    $et = @([regex]::Matches($xml, '<Type[^>]*>(\d+)</Type>') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    $etT = @($et | ForEach-Object { switch ($_) { '13' { 'EAP-TLS (Zertifikat)' } '25' { 'PEAP' } '26' { 'EAP-MSCHAPv2 (Benutzername/Kennwort)' } '21' { 'EAP-TTLS' } '55' { 'TEAP' } default { 'EAP-Typ ' + $_ } } })
    if ($etT.Count) { Zeile ('  EAP-Methoden: ' + ($etT -join ' › ')) }
    if ($xml -match '<singleSignOn') { $sso = 'ja'; if ($xml -match '<singleSignOn[\s\S]*?<type>([^<]+)</type>') { $sso += ' (' + $matches[1] + ')' }; Zeile ('  Single Sign-On (vor/nach der Windows-Anmeldung): ' + $sso) }
    $sn = @([regex]::Matches($xml, '<ServerNames>([^<]*)</ServerNames>') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ })
    Zeile ('  Erwartete WLAN-Server (Servernamen): ' + $(if ($sn.Count) { ($sn -join '; ') } else { 'nicht eingeschränkt' }))
    if ($xml -match '<DisableUserPromptForServerValidation>\s*true') { Zeile '  Rückfrage bei unbekanntem WLAN-Server: aus — die Verbindung scheitert dann ohne Meldung' }
    $tr = @([regex]::Matches($xml, '<TrustedRootCA>([^<]+)</TrustedRootCA>') | ForEach-Object { ($_.Groups[1].Value -replace '\s', '').ToUpper() } | Select-Object -Unique)
    if (-not $tr.Count) { Zeile '  Vertrauenswürdige Stammzertifizierungsstellen: im Profil keine festgelegt' }
    $root = @(Get-ChildItem Cert:\LocalMachine\Root -EA SilentlyContinue)
    foreach ($h in $tr) {
      $c = @($root | Where-Object { $_.Thumbprint -eq $h })[0]
      if ($c) { $tage = [int]($c.NotAfter - $jetzt).TotalDays; Zeile ('  Stammzertifikat „' + ($c.Subject -replace '^.*?CN=([^,]+).*$', '$1') + '“: vorhanden, gültig bis ' + $c.NotAfter.ToString('dd.MM.yyyy') + $(if ($tage -lt 0) { ' · ABGELAUFEN' } else { '' })) }
      else { Zeile ('  Stammzertifikat ' + $h + ': FEHLT im Computer-Speicher → dem WLAN-Server wird nicht vertraut („Gruppenrichtlinien neu anwenden“, sonst DXC)') }
    }
  } else { Zeile '  Profil-Details (Anmeldeart, Serverprüfung) sind nicht lesbar.' }
}
$ca = @(Get-ChildItem Cert:\LocalMachine\My -EA SilentlyContinue | Where-Object { @($_.EnhancedKeyUsageList | ForEach-Object { [string]$_.ObjectId }) -contains '1.3.6.1.5.5.7.3.2' })
Zeile ('Computerzertifikate für die Anmeldung (Clientauthentifizierung): ' + $ca.Count)
foreach ($c in $ca | Sort-Object NotAfter -Descending | Select-Object -First 6) {
  $tage = [int]($c.NotAfter - $jetzt).TotalDays
  $schl = 'kein privater Schlüssel'
  if ($c.HasPrivateKey) {
    try {
      $k = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($c)
      if (-not $k) { $k = [System.Security.Cryptography.X509Certificates.ECDsaCertificateExtensions]::GetECDsaPrivateKey($c) }
      $prov = ''; try { $prov = [string]$k.Key.Provider.Provider } catch {}
      $schl = 'privater Schlüssel nutzbar' + $(if ($prov -match 'Platform') { ' (liegt im TPM)' } elseif ($prov) { ' (' + $prov + ')' } else { '' })
    } catch { $m = [string]$_.Exception.Message; if ($_.Exception.InnerException) { $m = [string]$_.Exception.InnerException.Message }; $schl = 'privater Schlüssel NICHT nutzbar (' + $m + ') — z. B. nach TPM-Löschung/BIOS-Update' }
  }
  Zeile ('  ' + ($c.Subject -replace '^.*?CN=([^,]+).*$', '$1') + ' · Aussteller ' + ($c.Issuer -replace '^.*?CN=([^,]+).*$', '$1') + ' · gültig bis ' + $c.NotAfter.ToString('dd.MM.yyyy') + $(if ($tage -lt 0) { ' · ABGELAUFEN' } elseif ($tage -lt 30) { ' · läuft in ' + $tage + ' Tagen ab' } else { '' }) + ' · ' + $schl)
}
if (-not $ca.Count) { Zeile '  → Ohne Computerzertifikat kann eine Zertifikatsanmeldung (EAP-TLS) nicht klappen: „Zertifikate automatisch erneuern“ (PC dazu per LAN oder Zscaler mit der Domäne verbunden).' }
foreach ($n in 'WlanSvc', 'EapHost') {
  $s = Get-Service -Name $n -EA SilentlyContinue
  if ($s) { Zeile ('Dienst ' + $s.DisplayName + ' (' + $n + '): ' + $s.Status + ' · Starttyp ' + $s.StartType + $(if ([string]$s.StartType -eq 'Disabled') { ' ← DEAKTIVIERT' } else { '' })) } else { Zeile ('Dienst ' + $n + ': nicht vorhanden') }
}
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-WLAN-AutoConfig/Operational'; Id = 12013, 11006, 8002; StartTime = $jetzt.AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue)
Zeile ('Fehler der letzten 7 Tage: 802.1X-Anmeldung (12013) ' + @($ev | Where-Object { $_.Id -eq 12013 }).Count + ' · Sicherheit/Schlüsselaustausch (11006) ' + @($ev | Where-Object { $_.Id -eq 11006 }).Count + ' · Verbindungsaufbau (8002) ' + @($ev | Where-Object { $_.Id -eq 8002 }).Count)
$codes = @{}
foreach ($e in $ev) { foreach ($m in [regex]::Matches([string]$e.Message, '0x8042[0-9A-Fa-f]{4}')) { $h = $m.Value.ToLower(); $codes[$h] = 1 + [int]$codes[$h] } }
foreach ($h in $codes.Keys) { Zeile ('  EAP-Code ' + $h + ' (' + $codes[$h] + '×): ' + $(if ($eapText.ContainsKey($h)) { $eapText[$h] } else { 'unbekannt' })) }
foreach ($e in $ev | Select-Object -First 8) {
  $teile = @(([string]$e.Message -split '\r?\n') | Where-Object { $_ -match '(?i)(SSID|Profilname|Identit|grund|Reason|Ursache|Fehler\s*:|Error\s*:|EAP)' } | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Select-Object -First 6)
  $txt = ($teile -join ' · '); if ($txt.Length -gt 260) { $txt = $txt.Substring(0, 260) + '…' }
  Zeile ('  ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ' · Ereignis ' + $e.Id + ' · ' + $txt)
}
Zeile 'Identität „host/…“ = Anmeldung als Computer, „Domäne\Name“ bzw. E-Mail = als Benutzer.'` }),

  // ══ WLAN-Ereignisse auswerten — lesend ══════════════════════════════════════
  A({ id: 'wlan4-fehler-auswerten', titel: 'WLAN-Ereignisse auswerten: Verbindungen, Fehler- und Trennungsgründe gezählt, Treiberfehler', modus: 'system', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Fasst die WLAN-Ereignisse der letzten Tage zusammen (Standard 7): Anzahl Verbindungen, fehlgeschlagene Verbindungen und Trennungen, jeweils nach Grund gezählt; Sicherheits- und 802.1X-Fehler; genutzte Netze und Funktypen (Wi-Fi 4/5/6/7); Fehler und Warnungen des WLAN-Treibers (Intel Netwtw, Realtek, MediaTek, Qualcomm …) im Systemprotokoll und Abstürze des WLAN-Dienstes. Ändert nichts.',
    param: { label: 'Tage zurück (1–30, optional)', platzhalter: '7', vorlagen: ['1', '3', '7', '14', '30'] },
    ps: String.raw`
$t = 7
if ($P.Trim()) { if ($P.Trim() -notmatch '^\d{1,2}$') { throw 'Bitte eine Zahl von 1 bis 30 angeben (Tage zurück).' }; $t = [int]$P.Trim(); if ($t -lt 1 -or $t -gt 30) { throw 'Bitte eine Zahl von 1 bis 30 angeben (Tage zurück).' } }
$ab = (Get-Date).AddDays(-$t)
function Daten($e) { $d = @{}; try { $x = [xml]$e.ToXml(); foreach ($n in $x.Event.EventData.Data) { $d[[string]$n.Name] = [string]$n.'#text' } } catch {}; $d }
function Zaehle([hashtable]$h, [string]$k) { if (-not $k) { $k = '(ohne Angabe)' }; $h[$k] = 1 + [int]$h[$k] }
function Top([hashtable]$h, [int]$n) { @($h.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First $n | ForEach-Object { '' + $_.Value + '× ' + $_.Key }) }
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-WLAN-AutoConfig/Operational'; Id = 8001, 8002, 8003, 11006, 12013; StartTime = $ab } -MaxEvents 3000 -EA SilentlyContinue)
$netze = @{}; $phy = @{}; $fehl = @{}; $tr = @{}; $sich = @{}
$n1 = 0; $n2 = 0; $n3 = 0; $n4 = 0
foreach ($e in $ev) {
  $d = Daten $e
  switch ($e.Id) {
    8001 { $n1++; Zaehle $netze $d['SSID']; Zaehle $phy $d['PHYType'] }
    8002 { $n2++; $g = $d['FailureReason']; if (-not $g) { $g = $d['ReasonCode'] }; Zaehle $fehl ($d['SSID'] + ': ' + $g) }
    8003 { $n3++; Zaehle $tr $d['Reason'] }
    default { $n4++; $g = $d['ReasonText']; if (-not $g) { $g = $d['ReasonCode'] }; Zaehle $sich ('Ereignis ' + $e.Id + ' · ' + $d['SSID'] + ': ' + $g) }
  }
}
Zeile ('Letzte ' + $t + ' Tage: ' + $n1 + ' Verbindungen · ' + $n2 + ' fehlgeschlagen · ' + $n3 + ' Trennungen · ' + $n4 + ' Sicherheits-/802.1X-Fehler')
if ($netze.Count) { Zeile ('Netze: ' + ((Top $netze 6) -join ' · ')) }
if ($phy.Count) { Zeile ('Funktyp: ' + ((Top $phy 4) -join ' · ') + '  (802.11n = Wi-Fi 4, ac = Wi-Fi 5, ax = Wi-Fi 6/6E, be = Wi-Fi 7; a/g = alt, max. 54 MBit/s)') }
if ($tr.Count) { Zeile 'Trennungen nach Grund:'; Top $tr 6 | ForEach-Object { Zeile ('  ' + $_) } }
if ($fehl.Count) { Zeile 'Fehlgeschlagene Verbindungen nach Netz und Grund:'; Top $fehl 6 | ForEach-Object { Zeile ('  ' + $_) } }
if ($sich.Count) { Zeile 'Sicherheits- bzw. 802.1X-Fehler:'; Top $sich 5 | ForEach-Object { Zeile ('  ' + $_) } }
$muster = '^(Netwtw\w*|Netwbw\w*|NETw\w*|Netwsw\w*|rtwlan\w*|RtlWlan\w*|rtux\w*|mtkwl\w*|mtkwecx\w*|Qcamain\w*|Qcwlan\w*|athw\w*|BCMWL\w*)$'
$sys = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Level = 1, 2, 3; StartTime = $ab } -MaxEvents 4000 -EA SilentlyContinue)
$tre = @($sys | Where-Object { $_.ProviderName -match $muster })
if ($tre.Count) {
  Zeile ('Treiber-Fehler/-Warnungen des WLAN-Adapters: ' + $tre.Count)
  foreach ($g in @($tre | Group-Object ProviderName, Id | Sort-Object Count -Descending | Select-Object -First 5)) {
    $l = $g.Group[0]; $msg = ([string]$l.Message -split '\r?\n')[0]; if ($msg.Length -gt 140) { $msg = $msg.Substring(0, 140) + '…' }
    Zeile ('  ' + $g.Count + '× ' + $l.ProviderName + ' Ereignis ' + $l.Id + ' (zuletzt ' + $l.TimeCreated.ToString('dd.MM. HH:mm') + '): ' + $msg)
  }
  Zeile '  → Treiberfehler: aktuellen HP-Treiber installieren (Werkzeug „Treiber-Installation“).'
} else { Zeile 'Treiber-Fehler/-Warnungen des WLAN-Adapters im Systemprotokoll: keine' }
$dienst = @($sys | Where-Object { $_.ProviderName -eq 'Service Control Manager' -and $_.Id -in 7031, 7034, 7023, 7000 -and [string]$_.Message -match 'WLAN|Wlansvc|AutoConfig|Extensible Authentication|EapHost' })
if ($dienst.Count) { Zeile ('Abstürze/Startfehler von WLAN-Dienst bzw. EapHost: ' + $dienst.Count + ' (zuletzt ' + $dienst[0].TimeCreated.ToString('dd.MM. HH:mm') + ')') }
Zeile 'Tiefe Ursachen-Analyse mit Behebung: Werkzeug „WLAN-/Netzwerk-Diagnose“.'` }),

  // ══ Erweiterte WLAN-Treiber-Eigenschaften ═══════════════════════════════════
  A({ id: 'wlan4-treiber-erweitert', titel: 'WLAN-Treiber: Wi-Fi-6/7-Modus, Energiesparen, Bluetooth-Koexistenz oder alles auf Standard', modus: 'system', risiko: 'aendern',
    beschreibung: 'Setzt erweiterte Eigenschaften des WLAN-Treibers (Intel, Realtek, MediaTek, Qualcomm …) — nur, wenn der Treiber sie hat: Wi-Fi 7 bzw. Wi-Fi 6 und 7 abschalten (für ältere oder fehlerhafte Router/Access Points), Wi-Fi-Modus zurück auf den Treiber-Standard, Energiesparen im Treiber aus (MIMO-Energiesparen, U-APSD, Paketbündelung — gegen Verzögerungen und Aussetzer), Bluetooth-Koexistenz ein oder alle Eigenschaften auf den Treiber-Standard (eine von Hand gesetzte MAC-Adresse bleibt). Zeigt alte und neue Werte; wirkt ohne Trennung beim nächsten Neustart des WLAN-Adapters bzw. des PCs.',
    param: { label: 'Einstellung', platzhalter: TREIBER_OPT[1], pflicht: true, optionen: TREIBER_OPT },
    ps: String.raw`
${WLAD_PS}
$opt = @('${TREIBER_OPT.join("', '")}')
$wahl = @($opt | Where-Object { $_ -ieq $P.Trim() })[0]
if (-not $wahl) { throw ('Bitte eine dieser Einstellungen wählen: ' + ($opt -join ' · ')) }
$wl = @(WlAdapter)
if (-not $wl.Count) { throw 'Kein WLAN-Adapter gefunden.' }
$a = $wl[0]
Zeile ('WLAN-Adapter: ' + $a.InterfaceDescription + ' · Treiber ' + $a.DriverProvider + ' ' + $a.DriverVersionString + ' vom ' + $a.DriverDate)
$ap = @(Get-NetAdapterAdvancedProperty -Name $a.Name -EA SilentlyContinue)
$script:geaendert = 0
$aus = '(?i)^\s*(\d+\.\s*)?(Disabled|Deaktiviert|Deaktivieren|Disable|Off|Aus)\s*$'
function Neu($e) { [string](Get-NetAdapterAdvancedProperty -Name $a.Name -EA SilentlyContinue | Where-Object { $_.RegistryKeyword -eq $e.RegistryKeyword } | Select-Object -First 1).DisplayValue }
function Setze($e, [string]$ziel) {
  $alt = [string]$e.DisplayValue
  if ($alt -eq $ziel) { Zeile ('  ' + $e.DisplayName + ': war schon „' + $alt + '“'); return }
  $e | Set-NetAdapterAdvancedProperty -DisplayValue $ziel -NoRestart -EA Stop
  Zeile ('  ' + $e.DisplayName + ': vorher „' + $alt + '“ → jetzt „' + (Neu $e) + '“'); $script:geaendert++
}
function Zurueck($e) {
  $alt = [string]$e.DisplayValue
  $e | Reset-NetAdapterAdvancedProperty -NoRestart -EA Stop
  $neu = Neu $e
  if ($alt -eq $neu) { Zeile ('  ' + $e.DisplayName + ': war schon Standard „' + $alt + '“') } else { Zeile ('  ' + $e.DisplayName + ': vorher „' + $alt + '“ → jetzt Standard „' + $neu + '“'); $script:geaendert++ }
}
function IstBe([string]$v) { $v -match '(?i)802\.11\s?be|11be|/be\b|\bbe\b|Wi-?Fi\s?7|EHT' }
function IstAx([string]$v) { $v -match '(?i)802\.11\s?ax|11ax|/ax\b|\bax\b|Wi-?Fi\s?6|\bHE\b' }
function IstAc([string]$v) { $v -match '(?i)802\.11\s?ac|11ac|/ac\b|\bac\b|Wi-?Fi\s?5|VHT' }
$modusProps = @($ap | Where-Object { ($_.DisplayName -match '(?i)Wireless.?Mode|Funkmodus|Drahtlos.?Modus|WLAN-Modus|Wireless-Modus|802\.11[a-z/]*\s+(Wireless|Modus|Mode)|\bHT.?mode|HT-Modus|\bHE.?mode|EHT|Wi-?Fi.?[67]|802\.11\s?(ax|be)' -or $_.RegistryKeyword -match '(?i)WirelessMode|IEEE11nMode|HTMode|HEMode|EHTMode|11axMode|11beMode|Dot11ax|Dot11be|WiFi6|WiFi7') -and $_.DisplayName -notmatch '(?i)Wake|WoWLAN|Channel|Kanal|Bandwidth|Bandbreite|Preamble|Pr.ambel' })
switch ($wahl) {
  'Wi-Fi 7 aus (höchstens Wi-Fi 6)' {
    $treffer = 0
    foreach ($e in $modusProps) {
      $w = @($e.ValidDisplayValues)
      if (@($w | Where-Object { IstBe $_ }).Count) { $z = @($w | Where-Object { -not (IstBe $_) -and (IstAx $_) } | Sort-Object Length -Descending)[0]; if ($z) { $treffer++; Setze $e $z } }
      elseif ((IstBe $e.DisplayName) -or $e.RegistryKeyword -match '(?i)EHT|11be|Dot11be|WiFi7') { $z = @($w | Where-Object { $_ -match $aus })[0]; if ($z) { $treffer++; Setze $e $z } }
    }
    if (-not $treffer) { Zeile '  Der Treiber hat keine Wi-Fi-7-Einstellung (Adapter kann kein Wi-Fi 7 oder regelt es selbst) — nichts geändert.' }
  }
  'Wi-Fi 6 und 7 aus (höchstens Wi-Fi 5)' {
    $treffer = 0
    foreach ($e in $modusProps) {
      $w = @($e.ValidDisplayValues)
      if (@($w | Where-Object { (IstAx $_) -or (IstBe $_) }).Count) { $z = @($w | Where-Object { (IstAc $_) -and -not (IstAx $_) -and -not (IstBe $_) } | Sort-Object Length -Descending)[0]; if ($z) { $treffer++; Setze $e $z } }
      elseif ((IstAx $e.DisplayName) -or (IstBe $e.DisplayName) -or $e.RegistryKeyword -match '(?i)HEMode|EHTMode|11ax|11be|Dot11ax|Dot11be|WiFi6|WiFi7') { $z = @($w | Where-Object { $_ -match $aus })[0]; if ($z) { $treffer++; Setze $e $z } }
    }
    if (-not $treffer) { Zeile '  Der Adapter kann ohnehin höchstens Wi-Fi 5 (802.11ac) bzw. hat keine Einstellung dafür — nichts geändert.' }
  }
  'Wi-Fi-Modus: Treiber-Standard' {
    if (-not $modusProps.Count) { Zeile '  Der Treiber hat keine Einstellung für den Wi-Fi-Modus — nichts geändert.' }
    foreach ($e in $modusProps) { Zurueck $e }
  }
  'Energiesparen im Treiber aus (MIMO, U-APSD, Paketbündelung)' {
    $treffer = 0
    foreach ($e in @($ap | Where-Object { $_.DisplayName -match '(?i)MIMO' -or $_.RegistryKeyword -match '(?i)MIMOPowerSave|SMPS' })) { $w = @($e.ValidDisplayValues); $z = @($w | Where-Object { $_ -match '(?i)No SMPS|Kein\w*\s+SMPS|Keine' })[0]; if (-not $z) { $z = @($w | Where-Object { $_ -match $aus })[0] }; if ($z) { $treffer++; Setze $e $z } }
    foreach ($e in @($ap | Where-Object { $_.DisplayName -match '(?i)U-?APSD' -or $_.RegistryKeyword -match '(?i)uAPSD' })) { $z = @($e.ValidDisplayValues | Where-Object { $_ -match $aus })[0]; if ($z) { $treffer++; Setze $e $z } }
    foreach ($e in @($ap | Where-Object { $_.DisplayName -match '(?i)Packet Coalesc|Paket\w*\s*(zusammen|b.ndel|koalesz)' -or $_.RegistryKeyword -match '(?i)PacketCoalescing' })) { $z = @($e.ValidDisplayValues | Where-Object { $_ -match $aus })[0]; if ($z) { $treffer++; Setze $e $z } }
    if (-not $treffer) { Zeile '  Der Treiber hat keine dieser Energiespar-Eigenschaften — nichts geändert (allgemein: „WLAN-Energiesparen abschalten“).' }
  }
  'Bluetooth-Koexistenz ein' {
    $treffer = 0
    foreach ($e in @($ap | Where-Object { ($_.DisplayName -match '(?i)Bluetooth|BT.?Coex|Coexist|Koexist' -or $_.RegistryKeyword -match '(?i)BTCoex|BtCoex|Coexist|BluetoothCollab') -and $_.DisplayName -notmatch '(?i)Wake|AMP|Offload' })) {
      $w = @($e.ValidDisplayValues)
      $z = @($w | Where-Object { $_ -match '(?i)^\s*(\d+\.\s*)?(Enable|Enabled|Aktivieren|Aktiviert|Ein|On)\s*$' })[0]
      if (-not $z) { $z = @($w | Where-Object { $_ -match '(?i)Auto' })[0] }
      if ($z) { $treffer++; Setze $e $z }
    }
    if (-not $treffer) { Zeile '  Der Treiber hat keine Bluetooth-Koexistenz-Einstellung (Intel regelt das selbst) — nichts geändert. Hilft dann: „Band: 5 GHz bevorzugen“.' }
  }
  default {
    $mac = @($ap | Where-Object { $_.RegistryKeyword -match '(?i)NetworkAddress' -and [string]$_.DisplayValue })
    if ($mac.Count) { Zeile ('  Von Hand gesetzte MAC-Adresse „' + $mac[0].DisplayValue + '“ bleibt bewusst unverändert.') }
    $diff = @($ap | Where-Object { $_.RegistryKeyword -notmatch '(?i)NetworkAddress' -and $null -ne $_.DefaultDisplayValue -and [string]$_.DisplayValue -ne [string]$_.DefaultDisplayValue })
    if (-not $diff.Count) { Zeile '  Alle Eigenschaften stehen schon auf dem Treiber-Standard — nichts geändert.' }
    foreach ($e in $diff) { Zurueck $e }
  }
}
if ($script:geaendert) { Zeile ('' + $script:geaendert + ' Änderung(en) — wirken beim nächsten Neustart des WLAN-Adapters bzw. des PCs (sofort: „Netzwerkadapter neu starten“ → WLAN, Verbindung kurz weg).') }` }),

  // ══ Anmeldeseite öffentlicher WLANs (Captive Portal) ════════════════════════
  A({ id: 'wlan4-anmeldeseite-oeffnen', titel: 'Anmeldeseite des WLANs öffnen (Hotel, Bahn, Gast-WLAN, Mobilfunk-Tagespass)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 60000,
    beschreibung: 'Prüft in der Sitzung des Benutzers ohne Proxy, ob das WLAN eine Anmeldeseite verlangt (Windows-Prüfadresse msftconnecttest.com), und öffnet die Anmeldeseite des Netzes im gewählten Browser über eine unverschlüsselte http-Adresse — so erscheint sie auch, wenn der Browser sonst nur Zertifikatsfehler zeigt. Ist das Internet frei, wird nichts geöffnet.',
    param: { label: 'Browser (optional)', platzhalter: 'Standardbrowser', optionen: BROWSER_OPT },
    ps: String.raw`
$opt = @('${BROWSER_OPT.join("', '")}')
$w = $P.Trim(); if (-not $w) { $w = 'Standardbrowser' }
$w = @($opt | Where-Object { $_ -ieq $w })[0]
if (-not $w) { throw ('Bitte einen dieser Browser wählen: ' + ($opt -join ' · ')) }
$frei = $false; $portal = ''
try {
  $rq = [System.Net.HttpWebRequest]::Create('http://www.msftconnecttest.com/connecttest.txt')
  $rq.AllowAutoRedirect = $false; $rq.Timeout = 8000; $rq.Proxy = $null
  $rs = $rq.GetResponse()
  $code = [int]$rs.StatusCode; $loc = [string]$rs.Headers['Location']
  $sr = New-Object System.IO.StreamReader($rs.GetResponseStream()); $txt = $sr.ReadToEnd(); $sr.Close(); $rs.Close()
  if ($code -eq 200 -and $txt -match 'Microsoft Connect Test') { $frei = $true }
  elseif ($loc -match '^https?://' -and $loc.Length -lt 2000) { $portal = $loc }
  Zeile ('Prüfadresse: HTTP ' + $code + $(if ($loc) { ' → umgeleitet auf ' + $loc } elseif (-not $frei) { ' mit fremdem Inhalt (Anmeldeseite des Netzes)' } else { '' }))
} catch { $m = [string]$_.Exception.Message; if ($_.Exception.InnerException) { $m = [string]$_.Exception.InnerException.Message }; Zeile ('Prüfadresse nicht erreichbar: ' + $m) }
if ($frei) { Zeile 'Internet ist frei — dieses Netz verlangt keine (weitere) Anmeldung. Nichts geöffnet.' }
else {
  $url = 'http://www.msftconnecttest.com/redirect'; if ($portal) { $url = $portal }
  try {
    switch ($w) {
      'Edge' { Start-Process -FilePath 'msedge.exe' -ArgumentList $url }
      'Chrome' { Start-Process -FilePath 'chrome.exe' -ArgumentList $url }
      'Firefox' { Start-Process -FilePath 'firefox.exe' -ArgumentList $url }
      default { Start-Process -FilePath $url }
    }
    Zeile ('Anmeldeseite geöffnet (' + $w + '): ' + $url)
    Zeile 'Bitte dort anmelden bzw. Bedingungen bestätigen (Zimmernummer, Code, Tagespass) — danach baut Zscaler die Verbindung von selbst auf.'
  } catch { throw ('Browser „' + $w + '“ ließ sich nicht starten: ' + $_.Exception.Message) }
}` }),

  // ══ Zscaler-Zustand und Protokolle nach Fehlerbildern — lesend ══════════════
  A({ id: 'wlan4-zscaler-diagnose', titel: 'Zscaler im Detail: Dienst, Prozesse, Tunnel-Art, Proxy und Protokolle nach Fehlerbildern', modus: 'profil', risiko: 'lesen', timeoutMs: 120000,
    beschreibung: 'Zeigt Version, Dienst (Zustand und Starttyp), laufende Zscaler-Prozesse, den Zscaler-Netzwerkadapter (Tunnel über Adapter, typisch Tunnel 2.0) bzw. den lokalen Proxy 127.0.0.1:9000 (typisch Tunnel 1.0/PAC), Proxy- und WinHTTP-Einstellungen und durchsucht die Zscaler-Protokolle der letzten 3 Tage nach bekannten Fehlerbildern: Captive Portal, Interner Fehler, Netzwerkfehler, Anmeldung/Token, Firmennetz-Erkennung (Trusted Network), Tunnel, Private Access (ZPA), DNS, Zertifikate und Updates — je mit Anzahl und letzter Zeile. Ändert nichts.',
    ps: String.raw`
$s = Get-Service ZSAService -EA SilentlyContinue
if (-not $s) { Zeile 'Zscaler Client Connector ist nicht installiert (Dienst ZSAService fehlt).' }
else {
  $v = (Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { $_.DisplayName -match 'Zscaler' } | Select-Object -First 1).DisplayVersion
  Zeile ('Zscaler Client Connector ' + $v + ' · Dienst ZSAService: ' + $s.Status + ' · Starttyp ' + $s.StartType + $(if ([string]$s.StartType -ne 'Automatic') { ' ← sollte „Automatisch“ sein' } else { '' }))
  $pr = @(Get-Process -IncludeUserName -EA SilentlyContinue | Where-Object { $_.ProcessName -match '^ZSA' })
  Zeile ('Prozesse: ' + $(if ($pr.Count) { (@($pr | ForEach-Object { $_.ProcessName + $(if ($_.ProcessName -eq 'ZSATray') { ' (' + $_.UserName + ')' } else { '' }) }) | Select-Object -Unique) -join ', ' } else { 'keine' }))
  if (-not @($pr | Where-Object { $_.ProcessName -eq 'ZSATunnel' }).Count) { Zeile '  → ZSATunnel läuft nicht: kein Tunnel aufgebaut (Dienst neu starten bzw. Zscaler-App öffnen).' }
}
$ad = @(Get-NetAdapter -IncludeHidden -EA SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'Zscaler' })
foreach ($x in $ad) { Zeile ('Zscaler-Netzwerkadapter „' + $x.Name + '“ (' + $x.InterfaceDescription + '): ' + $x.Status) }
if (-not $ad.Count -and $s) { Zeile 'Zscaler-Netzwerkadapter: keiner (Tunnel über lokalen Proxy bzw. Filtertreiber)' }
if ($uHive) {
  $is = Get-ItemProperty ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings') -EA SilentlyContinue
  $px = [string]$is.ProxyServer; $pac = [string]$is.AutoConfigURL
  Zeile ('Proxy des Benutzers: ' + $(if ($is.ProxyEnable -eq 1) { 'an (' + $px + ')' } else { 'aus' }) + ' · Proxy-Skript (PAC): ' + $(if ($pac) { $pac } else { 'keins' }))
  if ($px -match '127\.0\.0\.1:9000' -or $pac -match '127\.0\.0\.1|localhost') { Zeile '  → Zscaler arbeitet mit lokalem Proxy (typisch Tunnel 1.0) — Programme ohne Proxy-Unterstützung umgehen ihn.' }
} else { Zeile 'Kein Benutzer angemeldet — Proxy des Benutzers nicht geprüft.' }
$wh = @((& netsh.exe winhttp show proxy 2>&1 | Out-String) -split '\r?\n' | Where-Object { $_ -match '(?i)proxy|Direkt|Direct' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($wh.Count) { Zeile ('WinHTTP: ' + ($wh -join ' · ')) }
$orte = @(); if ($uProf) { $orte += (Join-Path $uLocal 'Zscaler\logs') }; $orte += 'C:\ProgramData\Zscaler\log', 'C:\ProgramData\Zscaler\logs'
$dateien = @()
foreach ($o in $orte) { if (Test-Path -LiteralPath $o) { $dateien += @(Get-ChildItem -LiteralPath $o -File -EA SilentlyContinue | Where-Object { $_.LastWriteTime -gt (Get-Date).AddDays(-3) }) } }
$dateien = @($dateien | Sort-Object LastWriteTime -Descending | Select-Object -First 8)
if (-not $dateien.Count) { Zeile 'Zscaler-Protokolle der letzten 3 Tage: keine gefunden.' }
else {
  $kat = [ordered]@{ 'Captive Portal' = '(?i)captive'; 'Interner Fehler' = '(?i)internal.?error|interner fehler'; 'Netzwerkfehler' = '(?i)network.?error|netzwerkfehler'; 'Anmeldung/Token' = '(?i)saml|token.{0,30}(expir|invalid|fail)|auth\w*.{0,20}fail|re-?auth|login.{0,10}fail'; 'Firmennetz-Erkennung' = '(?i)trusted.?network|on_trusted|off_trusted|vpn_trusted|split_vpn'; 'Tunnel' = '(?i)tunnel.?(1\.0|2\.0|version|mode)|z-?tunnel|dtls|twlp'; 'Private Access (ZPA)' = '(?i)\bzpa\b|private.?access|broker'; 'DNS' = '(?i)dns.{0,40}(fail|timeout|error|fehl)'; 'Zertifikat/SSL' = '(?i)certificate.{0,40}(fail|error|invalid|expir)|ssl.{0,30}(fail|error)'; 'Update' = '(?i)upgrade|update.{0,20}(fail|error|pending)' }
  $anz = @{}; $letzt = @{}; $zeilen = 0
  foreach ($f in ($dateien | Sort-Object LastWriteTime)) {
    foreach ($z in @(Get-Content -LiteralPath $f.FullName -Tail 3000 -EA SilentlyContinue)) {
      $zeilen++
      foreach ($k in $kat.Keys) { if ($z -match $kat[$k]) { $anz[$k] = 1 + [int]$anz[$k]; $letzt[$k] = $z } }
    }
  }
  Zeile ('Zscaler-Protokolle: ' + $dateien.Count + ' Datei(en), ' + $zeilen + ' Zeilen durchsucht (neueste: ' + $dateien[0].Name + ', ' + $dateien[0].LastWriteTime.ToString('dd.MM. HH:mm') + ')')
  if (-not $anz.Count) { Zeile '  Keine bekannten Fehlerbilder gefunden (oder die Protokolle sind verschlüsselt — dann „Zscaler-Protokolle als ZIP“ für DXC).' }
  foreach ($k in $kat.Keys) { if ($anz.ContainsKey($k)) { $l = ([string]$letzt[$k]).Trim(); if ($l.Length -gt 200) { $l = $l.Substring(0, 200) + '…' }; Zeile ('  ' + $k + ': ' + $anz[$k] + '× · zuletzt: ' + $l) } }
}` }),

  // ══ Dienste von WLAN, Zscaler und Cisco reparieren ══════════════════════════
  A({ id: 'wlan4-dienste-reparieren', titel: 'Dienste von WLAN, Zscaler oder Cisco auf Starttyp „Automatisch“ bzw. Standard setzen und starten', modus: 'system', risiko: 'aendern',
    beschreibung: 'Prüft die gewählten Dienste und stellt einen deaktivierten bzw. falschen Starttyp auf den Windows-/Hersteller-Standard zurück: „Automatische WLAN-Konfiguration“ (WlanSvc, automatisch) und „Extensible Authentication Protocol“ (EapHost, manuell), Zscaler (ZSAService, automatisch) oder den Cisco-VPN-Agenten (csc_vpnagent/vpnagent, automatisch). Nicht laufende Dienste werden gestartet; laufende werden nie gestoppt (keine Trennung). Zeigt Starttyp und Zustand vorher/nachher.',
    param: { label: 'Welche Dienste', platzhalter: DIENST_OPT[0], pflicht: true, optionen: DIENST_OPT },
    ps: String.raw`
$opt = @('${DIENST_OPT.join("', '")}')
$wahl = @($opt | Where-Object { $_ -ieq $P.Trim() })[0]
if (-not $wahl) { throw ('Bitte eine dieser Gruppen wählen: ' + ($opt -join ' · ')) }
switch ($wahl) {
  'WLAN (WlanSvc, EapHost)' { $soll = @(@('WlanSvc', 'Automatic'), @('EapHost', 'Manual')) }
  'Zscaler (ZSAService)' { $soll = @(, @('ZSAService', 'Automatic')) }
  default { $soll = @(@('csc_vpnagent', 'Automatic'), @('vpnagent', 'Automatic')) }
}
$gef = 0
foreach ($x in $soll) {
  $name = $x[0]; $typ = $x[1]
  $s = Get-Service -Name $name -EA SilentlyContinue
  if (-not $s) { continue }
  $gef++
  $altTyp = [string]$s.StartType; $altSt = [string]$s.Status
  $hinweis = ''
  if ($altTyp -eq 'Disabled' -or ($typ -eq 'Automatic' -and $altTyp -ne 'Automatic')) {
    try { Set-Service -Name $name -StartupType $typ -EA Stop } catch { $hinweis = ' · Starttyp NICHT änderbar (' + $_.Exception.Message + ') — Manipulationsschutz bzw. beschädigte Installation: Neuinstallation über DXC' }
  }
  if ((Get-Service -Name $name).Status -ne 'Running' -and [string](Get-Service -Name $name).StartType -ne 'Disabled') {
    try { Start-Service -Name $name -EA Stop; Start-Sleep -Seconds 2 } catch { $hinweis += ' · startet NICHT (' + $_.Exception.Message + ')' }
  }
  $n = Get-Service -Name $name
  Zeile ('Dienst ' + $n.DisplayName + ' (' + $name + '): Starttyp vorher ' + $altTyp + ' → jetzt ' + [string]$n.StartType + ' · Zustand vorher ' + $altSt + ' → jetzt ' + [string]$n.Status + $hinweis)
}
if (-not $gef) { throw ('Keiner der Dienste ist installiert (' + (@($soll | ForEach-Object { $_[0] }) -join ', ') + ') — Programm nicht installiert.') }` }),
]
