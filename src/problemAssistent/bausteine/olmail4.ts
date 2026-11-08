// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „olmail“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// E-Mail-Themen: Zustellung/Unzustellbarkeitsberichte, Internetkopfzeilen, Mail-Optionen, Schrift/Briefpapier.
// Outlook-Optionen nur im Benutzer-Hive ($uHive, Art „profil“); Richtlinien werden nur gelesen und gemeldet.
// Outlook-COM nur in der Benutzersitzung (Art „benutzer“) — Outlook muss dort laufen.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Laufendes Outlook der Benutzersitzung holen (COM), sonst verständlich abbrechen. */
const OL_COM = String.raw`
$ol = $null
try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch {}
if (-not $ol) { throw 'Outlook läuft nicht in der Sitzung des Benutzers — bitte zuerst „Outlook starten“ und den Schritt danach wiederholen.' }
$ns = $ol.Session`

export const AKTIONEN_OLMAIL4: PaAktion[] = [
  // ── Zustellung: Postausgang + Unzustellbarkeitsberichte ──────────────────────
  A({ id: 'olmail-zustellung-pruefen', titel: 'Postausgang und Unzustellbarkeitsberichte auswerten (NDR-Codes)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Liest im laufenden Outlook des Benutzers: Ist Outlook online? Was hängt im Postausgang (Größe, Anlagen, Empfängerzahl, nicht aufgelöste/ungültige Adressen, über 25 MB)? Und die Unzustellbarkeits- und Verzögerungsberichte der letzten 14 Tage im Posteingang mit Statuscode (z. B. 5.1.10, 5.4.1, 4.4.7), Empfänger, Textauszug und Bedeutung. Ändert nichts.',
    ps: OL_COM + String.raw`
Zeile ('Outlook ' + [string]$ol.Version + ' · ' + $(if ($ns.Offline) { 'OFFLINE (Offline arbeiten aktiv oder keine Verbindung)' } else { 'online' }) + ' · Postfach ' + [string]$ns.DefaultStore.DisplayName)
$ob = $ns.GetDefaultFolder(4)
$oi = $ob.Items
$n = [int]$oi.Count
Zeile ('Postausgang: ' + $n + ' Element(e)')
$max = [int][Math]::Min($n, 15)
for ($i = 1; $i -le $max; $i++) {
  try {
    $m = $oi.Item($i)
    $gr = 0.0; try { $gr = [double]$m.Size } catch {}
    $an = 0; try { $an = [int]$m.Attachments.Count } catch {}
    $rc = 0; $bad = @()
    try {
      $rc = [int]$m.Recipients.Count
      for ($j = 1; $j -le $rc; $j++) {
        $r = $m.Recipients.Item($j)
        $adr = [string]$r.Address
        if (-not $r.Resolved) { $bad += ([string]$r.Name + ' (nicht aufgelöst)') }
        elseif ($adr -match '@' -and $adr -notmatch '^[^@\s;,<>"]+@[^@\s;,<>"]+\.[A-Za-z]{2,}$') { $bad += ($adr + ' (Adresse ungültig)') }
      }
    } catch {}
    $warn = @()
    if ($gr -gt 25MB) { $warn += 'GRÖSSER ALS 25 MB' }
    if ($rc -gt 500) { $warn += 'MEHR ALS 500 EMPFÄNGER' }
    if ($bad.Count) { $warn += ('Problem-Empfänger: ' + ((@($bad) | Select-Object -First 3) -join ', ')) }
    $ct = ''; try { $ct = ([datetime]$m.CreationTime).ToString('dd.MM. HH:mm') } catch {}
    Zeile ('  „' + [string]$m.Subject + '“ · ' + (Groesse $gr) + ' · ' + $an + ' Anlage(n) · ' + $rc + ' Empfänger · erstellt ' + $ct + $(if ($warn.Count) { ' · ' + ($warn -join ' · ') } else { '' }))
  } catch { Zeile ('  Element ' + $i + ' nicht lesbar: ' + $_.Exception.Message) }
}
function Bedeutung([string]$c, [string]$t) {
  if ($t -match 'blocked using|spamhaus|S3140|S3150|block ?list|blacklist') { return 'Absender-Server steht beim Empfänger auf einer Sperrliste' }
  if ($t -match 't-online') { return 'T-Online lehnt den Server ab' }
  if ($t -match 'moderat') { return 'Verteiler mit Genehmigung (Moderation)' }
  switch -Regex ($c) {
    '^5\.1\.(1|10)$' { return 'Empfängeradresse gibt es nicht' }
    '^5\.1\.3$' { return 'Adresse ungültig geschrieben (Leerzeichen, Umlaut, Sonderzeichen)' }
    '^5\.1\.8$' { return 'eigenes Konto am Senden gehindert' }
    '^5\.1\.90$' { return 'Tageslimit an Empfängern erreicht' }
    '^5\.2\.1$' { return 'Postfach des Empfängers deaktiviert' }
    '^5\.2\.2$' { return 'Postfach des Empfängers voll' }
    '^(5\.2\.3|5\.3\.4)$' { return 'Nachricht zu groß für den Empfänger' }
    '^5\.4\.1$' { return 'Empfänger beim Zielsystem unbekannt bzw. abgewiesen' }
    '^5\.4\.(4|310)$' { return 'Domäne des Empfängers existiert nicht (Tippfehler?)' }
    '^5\.4\.(6|14)$' { return 'Mailschleife (Weiterleitung im Kreis)' }
    '^5\.4\.5$' { return 'Sendekontingent überschritten' }
    '^(4\.4\.7|5\.4\.300)$' { return 'Zustellung abgelaufen — Server des Empfängers nicht erreichbar' }
    '^5\.5\.3$' { return 'zu viele Empfänger' }
    '^5\.7\.(12|133|134|135|136)$' { return 'Empfänger nimmt nur Mails von angemeldeten bzw. internen Absendern' }
    '^5\.7\.23$' { return 'SPF-Prüfung beim Empfänger fehlgeschlagen' }
    '^5\.7\.(26|509)$' { return 'DMARC bzw. Absender-Authentifizierung fehlgeschlagen' }
    '^5\.7\.3$' { return 'Empfänger verlangt verschlüsselte Verbindung (TLS)' }
    '^5\.7\.(57|60|139)$' { return 'SMTP-Anmeldung bzw. Absenderrecht fehlt' }
    '^5\.7\.520$' { return 'automatische Weiterleitung nach extern gesperrt' }
    '^5\.7\.708$' { return 'Versand gesperrt' }
    '^5\.7\.1$' { return 'abgelehnt (Berechtigung, Inhalt, Anlage oder Spamfilter)' }
    '^4\.' { return 'vorübergehend — Exchange versucht es weiter' }
  }
  return ''
}
$seit = (Get-Date).AddDays(-14)
$ib = $ns.GetDefaultFolder(6)
$f = '@SQL="http://schemas.microsoft.com/mapi/proptag/0x001A001F" LIKE ''REPORT.IPM.Note%'''
$liste = @()
try {
  $rep = $ib.Items.Restrict($f)
  try { $rep.Sort('[CreationTime]', $true) } catch {}
  $k = 0
  foreach ($x in $rep) {
    $k++; if ($k -gt 300) { break }
    $mcl = ''; try { $mcl = [string]$x.MessageClass } catch {}
    if ($mcl -notmatch 'NDR|Delayed') { continue }
    $d = $null; try { $d = [datetime]$x.CreationTime } catch {}
    if ($d -and $d -lt $seit) { continue }
    $liste += $x
  }
} catch { Zeile ('Berichte nicht durchsuchbar: ' + $_.Exception.Message) }
$nNdr = @($liste | Where-Object { [string]$_.MessageClass -match 'NDR' }).Count
Zeile ('Unzustellbarkeitsberichte (14 Tage, Posteingang): ' + $nNdr + ' · Verzögerungsmeldungen: ' + ($liste.Count - $nNdr))
foreach ($x in (@($liste) | Select-Object -First 12)) {
  $body = ''; try { $body = [string]$x.Body } catch {}
  $mc = [regex]::Match($body, '\b[45]\.\d{1,3}\.\d{1,3}\b')
  $code = $(if ($mc.Success) { $mc.Value } else { '?' })
  $aus = ''
  if ($mc.Success) { $st = [int][Math]::Max(0, $mc.Index - 70); $aus = ($body.Substring($st, [int][Math]::Min(220, $body.Length - $st)) -replace '\s+', ' ').Trim() }
  $em = [regex]::Match($body, '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}')
  $be = Bedeutung $code $body
  $d = ''; try { $d = ([datetime]$x.CreationTime).ToString('dd.MM. HH:mm') } catch {}
  Zeile ('  ' + $d + ' · ' + $(if ([string]$x.MessageClass -match 'Delayed') { 'VERZÖGERT' } else { 'UNZUSTELLBAR' }) + ' · Code ' + $code + $(if ($be) { ' = ' + $be } else { '' }) + $(if ($em.Success) { ' · ' + $em.Value } else { '' }) + ' · „' + [string]$x.Subject + '“')
  if ($aus) { Zeile ('    … ' + $aus + ' …') }
}
if (-not $liste.Count) { Zeile 'Keine Unzustellbarkeitsberichte im Posteingang der letzten 14 Tage (verschiebt eine Regel sie woandershin?).' }
Zeile 'Hinweis: Codes 4.x.x sind vorübergehend (nicht neu senden), 5.x.x endgültig. Ablehnungen durch fremde Server klärt der Empfänger bzw. DXC.'` }),

  // ── Internetkopfzeilen einer Mail ────────────────────────────────────────────
  A({ id: 'olmail-kopfzeilen', titel: 'Internetkopfzeilen einer Mail auswerten (Absender, Spamfilter, Weg, Anlagen)', modus: 'benutzer', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Sucht im laufenden Outlook des Benutzers die neueste Mail mit dem angegebenen Betreff-Teil (Posteingang, Junk-E-Mail, Gelöschte Elemente) und wertet ihre Internetkopfzeilen aus: echter Absender, „Antworten an“ (Reply-To), SPF/DKIM/DMARC, Spam-Einstufung von Microsoft 365 (SCL, SFV, CAT, Sicherheitstipps), Weg und Verzögerung über die Server, Format, Codierung, Ablaufdatum, Anlagen (auch ausgeblendete) und die Nachrichten-ID für die Nachverfolgung durch DXC. Ändert nichts.',
    param: { label: 'Betreff der Mail (Teil genügt)', platzhalter: 'z. B. Rechnung 4711', pflicht: true },
    ps: String.raw`
$t = $P.Trim()
if ($t.Length -lt 3 -or $t.Length -gt 150) { throw 'Bitte 3 bis 150 Zeichen aus dem Betreff angeben.' }
if ($t -match '[\x00-\x1f]') { throw 'Der Betreff-Teil enthält Steuerzeichen.' }
` + OL_COM + String.raw`
$filter = '@SQL="urn:schemas:httpmail:subject" LIKE ''%' + $t.Replace("'", "''") + '%'''
$treffer = @()
foreach ($fid in 6, 23, 3) {
  $fo = $null; try { $fo = $ns.GetDefaultFolder($fid) } catch {}
  if (-not $fo) { continue }
  try {
    $it = $fo.Items.Restrict($filter)
    $it.Sort('[ReceivedTime]', $true)
    $x = $it.GetFirst()
    if ($x) { $treffer += [pscustomobject]@{ Ordner = [string]$fo.Name; Mail = $x; Zeit = [datetime]$x.ReceivedTime } }
  } catch {}
}
if (-not $treffer.Count) { throw ('Keine Mail mit „' + $t + '“ im Betreff in Posteingang, Junk-E-Mail oder Gelöschte Elemente gefunden.') }
$w = @($treffer | Sort-Object Zeit -Descending)[0]
$m = $w.Mail
$fmt = ''; try { $fmt = switch ([int]$m.BodyFormat) { 1 { 'Nur-Text' } 2 { 'HTML' } 3 { 'Rich-Text' } default { '?' } } } catch {}
Zeile ('Mail: „' + [string]$m.Subject + '“ · Ordner ' + $w.Ordner + ' · empfangen ' + $w.Zeit.ToString('dd.MM.yyyy HH:mm') + ' · ' + (Groesse ([double]$m.Size)) + ' · Format ' + $fmt)
function Kurz([string]$s) { if ($s.Length -gt 170) { $s.Substring(0, 170) + ' …' } else { $s } }
$h = ''
try { $h = [string]$m.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x007D001F') } catch {}
if (-not $h) {
  Zeile 'Keine Internetkopfzeilen vorhanden — die Mail kam firmenintern über Exchange oder wurde von Outlook selbst erzeugt.'
} else {
  $kz = New-Object System.Collections.Generic.List[string]
  foreach ($l in ($h -split "\r?\n")) { if ($l -match '^\s' -and $kz.Count) { $kz[$kz.Count - 1] = $kz[$kz.Count - 1] + ' ' + $l.Trim() } elseif ($l) { $kz.Add($l) } }
  function Kopf([string]$n) { $re = '^' + [regex]::Escape($n) + ':\s*'; @($kz | Where-Object { $_ -match $re } | ForEach-Object { $_ -replace $re, '' }) }
  function Adr([string]$s) { $a = [regex]::Match($s, '[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+'); if ($a.Success) { $a.Value.ToLower() } else { '' } }
  $von = [string](@(Kopf 'From') + '')[0]
  Zeile ('Von: ' + (Kurz $von))
  $snd = [string](@(Kopf 'Sender') + '')[0]
  if ($snd -and (Adr $snd) -ne (Adr $von)) { Zeile ('Tatsächlich gesendet von (Sender): ' + (Kurz $snd)) }
  $rp = [string](@(Kopf 'Return-Path') + '')[0]
  if ($rp) { Zeile ('Rücklaufadresse (Return-Path): ' + (Kurz $rp)) }
  $rt = [string](@(Kopf 'Reply-To') + '')[0]
  if ($rt) { Zeile ($(if ((Adr $rt) -ne (Adr $von)) { 'ACHTUNG — Antworten gehen an eine ANDERE Adresse (Reply-To): ' } else { 'Antworten an: ' }) + (Kurz $rt)) }
  $an = [string](@(Kopf 'To') + '')[0]
  if ($an) { Zeile ('An: ' + (Kurz $an)) }
  foreach ($n in 'X-Mailer', 'User-Agent') { $v = [string](@(Kopf $n) + '')[0]; if ($v) { Zeile ('Versandprogramm: ' + (Kurz $v)) } }
  $ctp = [string](@(Kopf 'Content-Type') + '')[0]
  if ($ctp) { Zeile ('Inhaltstyp: ' + (Kurz $ctp)) }
  foreach ($n in 'Expiry-Date', 'Expires') { $v = [string](@(Kopf $n) + '')[0]; if ($v) { Zeile ('Läuft ab (danach durchgestrichen): ' + $v) } }
  $ar = (@(Kopf 'Authentication-Results') -join ' ')
  if ($ar) {
    $teile = @()
    foreach ($n in 'spf', 'dkim', 'dmarc', 'compauth') { $mm = [regex]::Match($ar, '\b' + $n + '=(\w+)'); if ($mm.Success) { $teile += ($n.ToUpper() + ' ' + $mm.Groups[1].Value) } }
    $rs = [regex]::Match($ar, 'reason=(\d+)'); if ($rs.Success) { $teile += ('Grund ' + $rs.Groups[1].Value) }
    Zeile ('Absender-Prüfung: ' + $(if ($teile.Count) { $teile -join ' · ' } else { Kurz $ar }))
    if ($ar -match 'compauth=fail') { Zeile 'ACHTUNG — zusammengesetzte Authentifizierung fehlgeschlagen: Der Absender ist vermutlich gefälscht (oder der Absender hat SPF/DKIM falsch eingerichtet).' }
  }
  $sfvTxt = @{ 'SPM' = 'als Spam eingestuft'; 'NSPM' = 'kein Spam'; 'SKS' = 'vorab als Spam markiert (Regel)'; 'SKA' = 'Absender in der Zulassungsliste der Firma'; 'SKB' = 'Absender in der Sperrliste der Firma'; 'SKN' = 'vorab als kein Spam markiert (Regel)'; 'SKI' = 'firmenintern'; 'SKQ' = 'aus der Quarantäne freigegeben'; 'BLK' = 'vom Benutzer blockiert'; 'SFE' = 'Absender in den sicheren Absendern des Benutzers' }
  $catTxt = @{ 'PHSH' = 'Phishing'; 'HPHSH' = 'Phishing (hohe Sicherheit)'; 'HPHISH' = 'Phishing (hohe Sicherheit)'; 'SPM' = 'Spam'; 'HSPM' = 'Spam (hohe Sicherheit)'; 'BULK' = 'Massenmail'; 'MALW' = 'Schadsoftware'; 'SPOOF' = 'gefälschter Absender'; 'DIMP' = 'Identitätswechsel (Domäne)'; 'UIMP' = 'Identitätswechsel (Person)'; 'GIMP' = 'Identitätswechsel (Postfachintelligenz)'; 'AMP' = 'Antischadsoftware'; 'SAP' = 'Sichere Anlagen'; 'FTBP' = 'gesperrter Dateityp'; 'INTOS' = 'interner Phishingverdacht'; 'OSPM' = 'ausgehender Spam'; 'NONE' = 'unauffällig' }
  $fr = (@(Kopf 'X-Forefront-Antispam-Report') -join ';')
  $scl = [regex]::Match($fr, 'SCL:(-?\d+)')
  if (-not $scl.Success) { $scl = [regex]::Match((@(Kopf 'X-MS-Exchange-Organization-SCL') -join ' '), '(-?\d+)') }
  $sfv = [regex]::Match($fr, 'SFV:(\w+)'); $cat = [regex]::Match($fr, 'CAT:(\w+)'); $sfty = [regex]::Match($fr, 'SFTY:([\d.]+)')
  if ($scl.Success -or $sfv.Success -or $cat.Success) {
    $s = @()
    if ($scl.Success) { $s += ('SCL ' + $scl.Groups[1].Value + ' (-1 = sicher, 0–1 = kein Spam, 5–6 = Spam, 9 = sicher Spam)') }
    if ($sfv.Success) { $v = $sfv.Groups[1].Value; $s += ('SFV ' + $v + $(if ($sfvTxt[$v]) { ' = ' + $sfvTxt[$v] } else { '' })) }
    if ($cat.Success) { $v = $cat.Groups[1].Value; $s += ('Kategorie ' + $v + $(if ($catTxt[$v]) { ' = ' + $catTxt[$v] } else { '' })) }
    Zeile ('Spamfilter Microsoft 365: ' + ($s -join ' · '))
  }
  if ($sfty.Success) { $v = $sfty.Groups[1].Value; Zeile ('Sicherheitstipp SFTY ' + $v + $(switch ($v) { '9.19' { ' = Identitätswechsel einer Domäne' } '9.20' { ' = Identitätswechsel einer Person' } '9.25' { ' = Hinweis „Erster Kontakt“' } default { '' } })) }
  $aa = [string](@(Kopf 'X-MS-Exchange-Organization-AuthAs') + '')[0]
  if ($aa) { Zeile ('Eingang als: ' + $aa + $(if ($aa -match 'Anonymous') { ' (von außen, nicht angemeldet)' } elseif ($aa -match 'Internal') { ' (firmenintern)' } else { '' })) }
  $rcv = @(Kopf 'Received')
  $zeiten = New-Object System.Collections.Generic.List[object]
  foreach ($r in $rcv) {
    $ix = $r.LastIndexOf(';')
    if ($ix -lt 0) { continue }
    $ds = (($r.Substring($ix + 1) -replace '\([^)]*\)', '') -replace '^\s*[A-Za-z]{3},\s*', '').Trim()
    $d = [DateTimeOffset]::MinValue
    if ([DateTimeOffset]::TryParse($ds, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$d)) {
      $hv = [regex]::Match($r, '^from\s+(\S+)')
      $zeiten.Add([pscustomobject]@{ Zeit = $d; Von = $(if ($hv.Success) { $hv.Groups[1].Value } else { '?' }) })
    }
  }
  if ($zeiten.Count -ge 2) {
    $zeiten.Reverse()
    $ges = ($zeiten[$zeiten.Count - 1].Zeit - $zeiten[0].Zeit).TotalMinutes
    $mx = 0.0; $bei = ''
    for ($j = 1; $j -lt $zeiten.Count; $j++) { $g = ($zeiten[$j].Zeit - $zeiten[$j - 1].Zeit).TotalMinutes; if ($g -gt $mx) { $mx = $g; $bei = $zeiten[$j].Von } }
    Zeile ('Weg der Mail: ' + $rcv.Count + ' Stationen · Laufzeit ' + ('{0:N1}' -f $ges) + ' min' + $(if ($mx -ge 5) { ' · größte Verzögerung ' + ('{0:N0}' -f $mx) + ' min (bei ' + $bei + ')' } else { '' }))
  } elseif ($rcv.Count) { Zeile ('Weg der Mail: ' + $rcv.Count + ' Station(en)') }
  $nid = [string](@(Kopf 'X-MS-Exchange-Organization-Network-Message-Id') + @(Kopf 'X-MS-Exchange-CrossTenant-Network-Message-Id') + '')[0]
  $mid = [string](@(Kopf 'Message-ID') + '')[0]
  if ($nid -or $mid) { Zeile ('Für die Nachverfolgung (DXC): ' + $(if ($nid) { 'Network-Message-Id ' + $nid } else { '' }) + $(if ($mid) { ' · Message-ID ' + (Kurz $mid) } else { '' })) }
}
try {
  $al = @()
  for ($j = 1; $j -le $m.Attachments.Count; $j++) {
    $a = $m.Attachments.Item($j)
    $hid = $false; try { $hid = [bool]$a.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B') } catch {}
    $al += ([string]$a.FileName + ' (' + (Groesse ([double]$a.Size)) + $(if ($hid) { ', im Text/ausgeblendet' } else { '' }) + ')')
  }
  Zeile ('Anlagen: ' + $(if ($al.Count) { (@($al) | Select-Object -First 10) -join ', ' } else { 'keine' }))
  $alle = $al -join ' '
  if ($alle -match 'smime\.p7m') { Zeile 'smime.p7m = S/MIME-signierte bzw. verschlüsselte Mail, die unterwegs nicht als solche erkannt wurde.' }
  if ($alle -match 'winmail\.dat') { Zeile 'winmail.dat = Rich-Text-Mail (TNEF) aus Outlook, die beim Empfänger nicht entpackt wurde.' }
  if ($alle -match 'ATT\d{5}') { Zeile 'ATT0000x = Textteile zwischen Anlagen (typisch für Apple Mail oder einen angehängten Hinweistext) — kein Fehler des PCs.' }
  if ($alle -match 'Malware Alert Text') { Zeile 'Malware Alert Text.txt = Microsoft 365 hat eine schädliche Anlage entfernt (IT-Sicherheit informieren).' }
} catch { Zeile ('Anlagen nicht lesbar: ' + $_.Exception.Message) }`
  }),

  // ── Mail-Optionen und Richtlinien anzeigen ───────────────────────────────────
  A({ id: 'olmail-einstellungen', titel: 'E-Mail-Optionen und Outlook-Richtlinien des Benutzers anzeigen', modus: 'profil', risiko: 'lesen',
    beschreibung: 'Zeigt die E-Mail-Einstellungen des angemeldeten Benutzers auf einen Blick — Nachrichtenformat, Nur-Text-Anzeige, Codierung, Sofort senden, Kopie in Gesendete Elemente, Komma als Adresstrenner, Lesebestätigungen, Benachrichtigung/Ton/Briefumschlag und Anzeigedauer, externe Bilder, Anlagenvorschau, zusätzlich gesperrte Anlagentypen, Signatur-Standards und Cloud-Signaturen, Schrift/Briefpapier, Office-Design, Zeitzone — und welche Werte per Richtlinie festgelegt sind. Ändert nichts.',
    ps: String.raw`
NeedHive
$b = $uHive + '\Software\Microsoft\Office\16.0\Outlook'
$p = $uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook'
if (-not (Test-Path $b)) { throw 'Outlook wurde für diesen Benutzer noch nie gestartet (kein Outlook-Eintrag).' }
function Lies([string]$basis, [string]$unter, [string]$name) { (Get-ItemProperty -Path ($basis + '\' + $unter) -Name $name -EA SilentlyContinue).$name }
function Zeig([string]$label, [string]$unter, [string]$name, [string]$std, [hashtable]$txt) {
  $pv = Lies $p $unter $name
  $v = Lies $b $unter $name
  $eff = $v; if ($null -ne $pv) { $eff = $pv }
  $s = 'nicht gesetzt (Standard: ' + $std + ')'
  if ($null -ne $eff) { $s = [string]$eff; if ($txt -and $txt.ContainsKey([string]$eff)) { $s = $txt[[string]$eff] + ' (' + $eff + ')' } }
  if ($null -ne $pv) { $s = $s + ' — PER RICHTLINIE festgelegt' }
  Zeile ($label + ': ' + $s)
}
$einAus = @{ '0' = 'aus'; '1' = 'ein' }
Zeig 'Nachrichtenformat beim Verfassen' 'Options\Mail' 'EditorPreference' 'HTML' @{ '131072' = 'HTML'; '65536' = 'Nur-Text'; '196610' = 'Rich-Text' }
Zeig 'Empfangene Mails nur als Text lesen' 'Options\Mail' 'ReadAsPlain' 'aus' $einAus
Zeig 'Signierte Mails nur als Text lesen' 'Options\Mail' 'ReadSignedAsPlain' 'aus' $einAus
Zeig 'Codierung ausgehender Mails' 'Options\MSHTML\International' 'Default_CodePageOut' 'automatisch' @{ '65001' = 'Unicode UTF-8'; '28591' = 'Westeuropäisch ISO'; '1252' = 'Westeuropäisch Windows'; '20127' = 'US-ASCII' }
Zeig 'Sofort senden, wenn verbunden' 'Options\Mail' 'Send Mail Immediately' 'ein' $einAus
Zeig 'Kopie in Gesendete Elemente' 'Preferences' 'SaveSent' 'ein' $einAus
Zeig 'Komma als Adresstrenner' 'Preferences' 'AllowCommasInRecip' 'aus' $einAus
Zeig 'AutoVervollständigen' 'Preferences' 'ShowAutoSug' 'ein' $einAus
Zeig 'Antwort auf Lesebestätigungs-Anforderungen' 'Options\Mail' 'Receipt Response' 'jedes Mal fragen' @{ '0' = 'immer senden'; '1' = 'nie senden'; '2' = 'jedes Mal fragen' }
Zeig 'Neue Mail: Desktopbenachrichtigung' 'Preferences' 'NewmailDesktopAlerts' 'ein' $einAus
Zeig 'Neue Mail: Ton' 'Preferences' 'PlaySound' 'ein' $einAus
Zeig 'Neue Mail: Briefumschlag in der Taskleiste' 'Preferences' 'ShowEnvelope' 'ein' $einAus
$wn = (Get-ItemProperty -Path ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings\Microsoft.Office.OUTLOOK.EXE.15') -Name Enabled -EA SilentlyContinue).Enabled
Zeile ('Windows-Benachrichtigungen für Outlook: ' + $(if ($null -ne $wn -and [int]$wn -eq 0) { 'AUS (in Windows abgeschaltet)' } else { 'erlaubt' }))
$md = (Get-ItemProperty -Path ($uHive + '\Control Panel\Accessibility') -Name MessageDuration -EA SilentlyContinue).MessageDuration
Zeile ('Anzeigedauer von Benachrichtigungen: ' + $(if ($null -ne $md) { '' + $md + ' Sekunden' } else { 'Standard (5 Sekunden)' }))
Zeig 'Bilder aus dem Internet blockieren' 'Options\Mail' 'BlockExtContent' 'ja' @{ '0' = 'nein, werden geladen'; '1' = 'ja' }
$vorschauAus = @()
foreach ($u in 'Preferences', 'Security') { foreach ($nm in 'DisableAttachmentPreviewing', 'DisableAttachmentPreview') { foreach ($bas in $b, $p) { $x = Lies $bas $u $nm; if ($null -ne $x -and [int]$x -eq 1) { $vorschauAus += ($u + '\' + $nm + $(if ($bas -eq $p) { ' (Richtlinie)' } else { '' })) } } } }
Zeile ('Anlagenvorschau: ' + $(if ($vorschauAus.Count) { 'ABGESCHALTET über ' + ($vorschauAus -join ', ') } else { 'eingeschaltet' }))
foreach ($nm in 'Level1Add', 'Level1Remove', 'Level2Add') { foreach ($bas in $p, $b) { $x = [string](Lies $bas 'Security' $nm); if ($x) { Zeile ('Anlagentypen ' + $nm + $(if ($bas -eq $p) { ' (Richtlinie)' } else { '' }) + ': ' + $x) } } }
$mx = Lies $p 'Preferences' 'MaximumAttachmentSize'; if ($null -eq $mx) { $mx = Lies $b 'Preferences' 'MaximumAttachmentSize' }
Zeile ('Höchstgröße für Anlagen in Outlook: ' + $(if ($null -ne $mx) { '' + $mx + ' KB' + $(if ([int]$mx -eq 0) { ' (unbegrenzt — es gilt das Limit von Exchange)' } else { '' }) } else { 'nicht gesetzt (es gilt das Limit von Exchange)' }))
$cl = Lies $b 'Setup' 'DisableRoamingSignaturesTemporaryToggle'
Zeile ('Cloud-Signaturen: ' + $(if ($null -ne $cl -and [int]$cl -eq 1) { 'aus (nur Signaturen dieses PCs)' } else { 'an (Abgleich über das Postfach)' }))
$ms = Get-ItemProperty -Path ($uHive + '\Software\Microsoft\Office\16.0\Common\MailSettings') -EA SilentlyContinue
function SchriftTxt($wert) {
  if (-not $wert) { return '' }
  $s = ''; try { $s = [Text.Encoding]::ASCII.GetString([byte[]]$wert) } catch { return 'gesetzt' }
  $t = @()
  $f = [regex]::Match($s, 'font-family:\s*"?([^";,&]+)'); if ($f.Success) { $t += $f.Groups[1].Value.Trim() }
  $g = [regex]::Match($s, 'font-size:\s*([\d.]+pt)'); if ($g.Success) { $t += $g.Groups[1].Value }
  $c = [regex]::Match($s, '[;{\s]color:\s*([#\w]+)'); if ($c.Success) { $t += ('Farbe ' + $c.Groups[1].Value) }
  if ($t.Count) { return ($t -join ', ') } else { return 'gesetzt' }
}
if ($ms) {
  Zeile ('Standardsignatur neue Mails: ' + $(if ($ms.NewSignature) { $ms.NewSignature } else { '(keine)' }) + ' · Antworten/Weiterleitungen: ' + $(if ($ms.ReplySignature) { $ms.ReplySignature } else { '(keine)' }))
  Zeile ('Briefpapier/Design: ' + $(if ($ms.NewTheme) { $ms.NewTheme } else { '(keins)' }) + ' · Schrift neue Mails: ' + $(if ($ms.ComposeFontComplex) { SchriftTxt $ms.ComposeFontComplex } else { 'Standard' }) + ' · Schrift Antworten: ' + $(if ($ms.ReplyFontComplex) { SchriftTxt $ms.ReplyFontComplex } else { 'Standard' }))
} else { Zeile 'Signatur-Standards, Briefpapier und Schriften: nichts eigenes gesetzt (Outlook-Standard).' }
$ui = (Get-ItemProperty -Path ($uHive + '\Software\Microsoft\Office\16.0\Common') -Name 'UI Theme' -EA SilentlyContinue).'UI Theme'
Zeile ('Office-Design: ' + $(if ($null -ne $ui) { '' + $ui + ' (0 = farbig, 3 = dunkelgrau, 4 = schwarz, 5 = weiß, 6 = wie Windows)' } else { 'Standard' }))
try { $tz = Get-TimeZone; Zeile ('Zeitzone des PCs: ' + $tz.DisplayName) } catch {}
$pol = @()
foreach ($u in 'Options\Mail', 'Preferences', 'Security', 'Options\General') { $ip = Get-ItemProperty -Path ($p + '\' + $u) -EA SilentlyContinue; if ($ip) { $pol += @($ip.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name + '=' + $_.Value }) } }
Zeile ('Outlook-Richtlinien (Mail/Preferences/Security/General): ' + $(if ($pol.Count) { ((@($pol) | Select-Object -First 15) -join ', ') + $(if ($pol.Count -gt 15) { ' …' } else { '' }) } else { 'keine' }))` }),

  // ── Einzelne Mail-Optionen setzen ────────────────────────────────────────────
  A({ id: 'olmail-option', titel: 'E-Mail-Einstellung setzen (Komma-Trenner, Briefumschlag, Benachrichtigungsdauer)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Setzt eine einzelne E-Mail-Einstellung des angemeldeten Benutzers direkt in seiner Registry und zeigt alten und neuen Wert: Komma als Trennzeichen zwischen Empfängern zulassen (sonst „Outlook erkennt einen oder mehrere Namen nicht“), Briefumschlag-Symbol bei neuer Mail in der Taskleiste, Windows-Benachrichtigungen 30 Sekunden statt 5 Sekunden anzeigen. Eine Richtlinie hat Vorrang und wird gemeldet. Outlook danach neu starten.',
    param: { label: 'Einstellung', platzhalter: 'Kommas als Adresstrenner: ein', pflicht: true, optionen: ['Kommas als Adresstrenner: ein', 'Briefumschlag bei neuer Mail: ein', 'Benachrichtigungen 30 Sekunden anzeigen'] },
    ps: String.raw`
NeedHive
$o = $P.Trim()
$base = $uHive + '\Software\Microsoft\Office\16.0\Outlook'
$pol = $uHive + '\Software\Policies\Microsoft\Office\16.0\Outlook'
function WertTxt($v) { if ($null -eq $v) { 'nicht gesetzt (Standard)' } else { [string]$v } }
function Setze([string]$pfad, [string]$polpfad, [string]$name, [int]$wert, [string]$label) {
  if ($polpfad) { $pv = (Get-ItemProperty -Path $polpfad -Name $name -EA SilentlyContinue).$name; if ($null -ne $pv) { Zeile ($label + ': per Richtlinie auf ' + $pv + ' festgelegt — die Richtlinie hat Vorrang (zuständig DXC).') } }
  if (-not (Test-Path $pfad)) { New-Item -Path $pfad -Force | Out-Null }
  $alt = (Get-ItemProperty -Path $pfad -Name $name -EA SilentlyContinue).$name
  Set-ItemProperty -Path $pfad -Name $name -Value $wert -Type DWord
  Zeile ($label + ': vorher ' + (WertTxt $alt) + ', jetzt ' + $wert)
}
switch -Regex ($o) {
  '^kommas' {
    if (-not (Test-Path $base)) { throw 'Outlook wurde für diesen Benutzer noch nie gestartet (kein Outlook-Eintrag).' }
    Setze ($base + '\Preferences') ($pol + '\Preferences') 'AllowCommasInRecip' 1 '„Kommas zum Trennen mehrerer Empfänger zulassen“ (1 = ein)'
    Zeile 'Danach trennt Outlook „Meier, Hans; Huber, Eva“ und „a@x.de, b@y.de“ richtig. Outlook neu starten.'
    break }
  '^briefumschlag' {
    if (-not (Test-Path $base)) { throw 'Outlook wurde für diesen Benutzer noch nie gestartet (kein Outlook-Eintrag).' }
    Setze ($base + '\Preferences') ($pol + '\Preferences') 'ShowEnvelope' 1 '„Briefumschlagsymbol in der Taskleiste anzeigen“ (1 = ein)'
    Zeile 'Das Symbol erscheint bei neuen Mails im Posteingang am Outlook-Knopf der Taskleiste. Outlook neu starten.'
    break }
  '^benachrichtigungen' {
    Setze ($uHive + '\Control Panel\Accessibility') '' 'MessageDuration' 30 'Anzeigedauer von Windows-Benachrichtigungen in Sekunden'
    Zeile 'Gilt für alle Windows-Benachrichtigungen (Outlook, Teams …) — wirksam nach Ab- und Anmelden bzw. sofort über Einstellungen → Barrierefreiheit → Visuelle Effekte.'
    break }
  default { throw ('Unbekannte Einstellung: ' + $o) }
}` }),

  // ── Schrift und Briefpapier zurücksetzen ─────────────────────────────────────
  A({ id: 'olmail-schrift-zuruecksetzen', titel: 'Schriftarten und Briefpapier für Mails auf Standard zurücksetzen (mit Sicherung)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Beendet Outlook und setzt die unter „Briefpapier und Schriftarten“ gespeicherten Werte des Benutzers zurück: Schrift und Farbe für neue Mails, Antworten/Weiterleitungen und Nur-Text, Kommentar-Kennzeichnung sowie das Design/Briefpapier — oder nur das Briefpapier. Die alten Werte werden vorher in einen Sicherungsschlüssel (MailSettings.alt_…) kopiert; die Standardsignaturen bleiben unberührt. Gegen Times New Roman, blaue/kursive Antworten, „[Name]“-Kommentare und Hintergrundbilder in jeder Mail.',
    param: { label: 'Was zurücksetzen', platzhalter: 'Schriften und Briefpapier', pflicht: true, optionen: ['Schriften und Briefpapier', 'Nur Briefpapier'] },
    ps: String.raw`
NeedHive
$w = $P.Trim()
$alle = switch -Regex ($w) { '^schriften' { $true; break } '^nur briefpapier' { $false; break } default { throw ('Unbekannte Auswahl: ' + $w) } }
$k = $uHive + '\Software\Microsoft\Office\16.0\Common\MailSettings'
$pk = $uHive + '\Software\Policies\Microsoft\Office\16.0\Common\MailSettings'
$pip = Get-ItemProperty -Path $pk -EA SilentlyContinue
if ($pip) { $pn = @($pip.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name }); if ($pn.Count) { Zeile ('Achtung: per Richtlinie vorgegeben (hat Vorrang, zuständig DXC): ' + ($pn -join ', ')) } }
if (-not (Test-Path $k)) {
  Zeile 'Keine eigenen Einstellungen für Briefpapier und Schriftarten vorhanden — Outlook nutzt bereits den Standard.'
} else {
  $ip = Get-ItemProperty -Path $k -EA SilentlyContinue
  $vorh = @($ip.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name })
  $weg = @($vorh | Where-Object { $_ -notmatch 'Signature' -and ($alle -or $_ -match '^(NewTheme|ThemeFont)$') })
  if (-not $weg.Count) {
    Zeile ('Nichts zurückzusetzen — gesetzt sind nur: ' + $(if ($vorh.Count) { $vorh -join ', ' } else { 'keine Werte' }) + '.')
  } else {
    function Txt($n, $v) {
      if ($v -is [byte[]]) {
        $s = [Text.Encoding]::ASCII.GetString($v)
        $f = [regex]::Match($s, 'font-family:\s*"?([^";,&]+)'); $c = [regex]::Match($s, '[;{\s]color:\s*([#\w]+)'); $g = [regex]::Match($s, 'font-size:\s*([\d.]+pt)')
        $t = @(); if ($f.Success) { $t += $f.Groups[1].Value.Trim() }; if ($g.Success) { $t += $g.Groups[1].Value }; if ($c.Success) { $t += ('Farbe ' + $c.Groups[1].Value) }
        if ($t.Count) { return ($t -join ', ') } else { return ('Binärwert, ' + $v.Length + ' Bytes') }
      }
      return [string]$v
    }
    StopUser @('OUTLOOK')
    $sk = $k + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
    if (-not (Test-Path $sk)) { New-Item -Path $sk -Force | Out-Null }
    $key = Get-Item -Path $k
    foreach ($n in $weg) {
      $v = $ip.$n
      $art = [string]$key.GetValueKind($n)
      New-ItemProperty -Path $sk -Name $n -Value $v -PropertyType $art | Out-Null
      Remove-ItemProperty -Path $k -Name $n -EA Stop
      Zeile ($n + ': vorher „' + (Txt $n $v) + '“, jetzt Outlook-Standard')
    }
    Zeile ('Gesichert in ' + (Split-Path $sk -Leaf) + ' (unter Software\Microsoft\Office\16.0\Common) — bei Bedarf von dort zurückholbar.')
    Zeile 'Beim nächsten Start schreibt Outlook neue Mails in der Standardschrift. Eigene Schrift danach unter Datei → Optionen → E-Mail → Briefpapier und Schriftarten wählen.'
  }
}` }),

  // ── Reparaturen in der Benutzersitzung ───────────────────────────────────────
  A({ id: 'olmail-reparatur', titel: 'Outlook-Reparatur in der Benutzersitzung (Postausgang räumen, E-Mail-Infos)', modus: 'benutzer', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: '„Postausgang in Entwürfe verschieben“: verschiebt hängende Mails aus dem Postausgang des laufenden Outlook nach „Entwürfe“ (gegen „Outlook hat bereits mit der Übertragung dieser Nachricht begonnen“; danach Anhang verkleinern bzw. Empfänger korrigieren und neu senden). „E-Mail-Infos-Cache leeren“ startet Outlook mit /cleanmailtipcache (veraltete Hinweise wie „außerhalb Ihrer Organisation“ oder „ist abwesend“).',
    param: { label: 'Was', platzhalter: 'Postausgang in Entwürfe verschieben', pflicht: true, optionen: ['Postausgang in Entwürfe verschieben', 'E-Mail-Infos-Cache leeren (/cleanmailtipcache)'] },
    ps: String.raw`
$w = $P.Trim()
$art = switch -Regex ($w) { '^postausgang' { 'pa'; break } '^e-mail-infos' { '/cleanmailtipcache'; break } default { throw ('Unbekannte Auswahl: ' + $w) } }
if ($art -eq 'pa') {
` + OL_COM + String.raw`
  $ob = $ns.GetDefaultFolder(4); $dr = $ns.GetDefaultFolder(16)
  $it = $ob.Items
  $n = [int]$it.Count
  if (-not $n) {
    Zeile 'Der Postausgang ist leer — nichts zu verschieben.'
  } else {
    $liste = @(); for ($i = 1; $i -le $n; $i++) { $liste += $it.Item($i) }
    $ok = 0; $fe = 0
    foreach ($m in $liste) {
      $bet = ''; try { $bet = [string]$m.Subject } catch {}
      $gr = ''; try { $gr = Groesse ([double]$m.Size) } catch {}
      try { [void]$m.Move($dr); $ok++; Zeile ('Nach „Entwürfe“ verschoben: „' + $bet + '“ (' + $gr + ')') }
      catch { $fe++; Zeile ('Nicht verschiebbar: „' + $bet + '“ (' + $gr + ') — ' + $_.Exception.Message) }
    }
    Zeile ('Ergebnis: ' + $ok + ' verschoben, ' + $fe + ' nicht verschiebbar.')
    if ($ok) { Zeile 'Die Mails liegen jetzt unter „Entwürfe“: Anhang verkleinern bzw. als OneDrive-Link einfügen oder Empfänger korrigieren und neu senden.' }
    if ($fe) { Zeile 'Hängt eine Mail weiter: In Outlook „Senden/Empfangen → Offline arbeiten“ einschalten, Outlook neu starten, die Mail nach „Entwürfe“ ziehen und „Offline arbeiten“ wieder ausschalten.' }
  }
} else {
  $vor = @(Get-Process OUTLOOK -EA SilentlyContinue)
  if ($vor.Count) { $vor | Stop-Process -Force -EA SilentlyContinue; Start-Sleep -Seconds 3; Zeile 'Outlook beendet.' } else { Zeile 'Outlook lief nicht.' }
  Start-Process -FilePath 'outlook.exe' -ArgumentList $art
  Zeile ('Outlook mit ' + $art + ' gestartet — die zwischengespeicherten E-Mail-Infos (Abwesenheit, extern, große Verteiler) werden verworfen und neu vom Server geholt.')
}` }),
]
