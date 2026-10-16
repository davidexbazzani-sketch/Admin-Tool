<#
  ServiceNow-Zugang testen - komplett UNABHAENGIG vom IT Admin Tool.

  Fragt nur Client ID + Client Secret (von HCL) ab und prueft direkt gegen ServiceNow:
    3) OAuth "client_credentials" (nur Client ID + Secret)  <- der eigentliche Test
    4) Tabellen-Abruf mit dem erhaltenen OAuth-Token
  Optional (Rueckfrage j/N) zusaetzlich das alte Konto mit Benutzer + Passwort:
    1) Basic Auth
    2) OAuth "password"     (Client ID + Secret + Benutzer + Passwort)

  Aufruf: Rechtsklick > "Mit PowerShell ausfuehren"
     oder: powershell -ExecutionPolicy Bypass -File .\ServiceNow-Zugang-testen.ps1
     andere Instanz: ... -File .\ServiceNow-Zugang-testen.ps1 -Instanz https://skf.service-now.com

  Es wird NICHTS gespeichert. Secrets/Passwoerter werden verdeckt abgefragt und
  tauchen im Protokoll nicht auf (auch das Token wird maskiert). Das Protokoll
  landet in der Zwischenablage und als Datei im TEMP-Ordner - kann so an HCL.
#>
param([string]$Instanz = 'https://skfdev.service-now.com')

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Instanz = $Instanz.Trim().TrimEnd('/')
$protokoll = New-Object System.Collections.Generic.List[string]

function Schreib($text, $farbe = 'Gray') {
  Write-Host $text -ForegroundColor $farbe
  $protokoll.Add($text)
}

function Lies-Geheim($text) {
  $s = Read-Host $text -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

# Copy&Paste-Artefakte (Zeilenumbrueche/Tabs aus dem Chat) entfernen - wie im Tool.
function Bereinige($s) { if ($null -eq $s) { '' } else { ($s -replace "[`r`n`t]", '') } }

# Token-Werte in Antworten unkenntlich machen, bevor sie angezeigt/protokolliert werden.
function Maskiere($s) {
  if (-not $s) { return '' }
  return ($s -replace '"(access_token|refresh_token)"\s*:\s*"[^"]*"', '"$1":"***"')
}

function Aufruf($methode, $url, $header, $formBody) {
  try {
    $p = @{ Uri = $url; Method = $methode; Headers = $header; UseBasicParsing = $true; TimeoutSec = 30 }
    if ($formBody) { $p.Body = $formBody; $p.ContentType = 'application/x-www-form-urlencoded' }
    $r = Invoke-WebRequest @p
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = [string]$r.Content; Fehler = '' }
  } catch {
    $status = 0
    if ($_.Exception.Response) { try { $status = [int]$_.Exception.Response.StatusCode } catch { } }
    $body = ''
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
    return [pscustomobject]@{ Status = $status; Body = $body; Fehler = $_.Exception.Message }
  }
}

function Zeig-Ergebnis($name, $r, $okStatus = 200) {
  $ok = ($r.Status -ge 200 -and $r.Status -lt 300)
  if ($ok) { Schreib "   -> OK (HTTP $($r.Status))" 'Green' }
  else {
    $st = if ($r.Status) { "HTTP $($r.Status)" } else { 'keine HTTP-Antwort' }
    Schreib "   -> FEHLER ($st)" 'Red'
    if ($r.Fehler) { Schreib "      Meldung: $($r.Fehler)" 'DarkYellow' }
  }
  $b = Maskiere $r.Body
  if ($b) {
    if ($b.Length -gt 600) { $b = $b.Substring(0, 600) + ' ...' }
    Schreib "      Antwort: $b" 'DarkGray'
  }
  return $ok
}

function Hol-Token($grant, $clientId, $secret, $user, $pass) {
  $teile = @(
    'grant_type=' + [uri]::EscapeDataString($grant),
    'client_id=' + [uri]::EscapeDataString($clientId),
    'client_secret=' + [uri]::EscapeDataString($secret)
  )
  if ($grant -eq 'password') {
    $teile += 'username=' + [uri]::EscapeDataString($user)
    $teile += 'password=' + [uri]::EscapeDataString($pass)
  }
  return Aufruf 'POST' "$Instanz/oauth_token.do" @{ Accept = 'application/json' } ($teile -join '&')
}

Write-Host ''
Write-Host '=== ServiceNow-Zugang testen ===' -ForegroundColor Cyan
Write-Host "Instanz: $Instanz"
Write-Host 'Die zwei Werte aus dem HCL-Chat per Copy & Paste einfuegen.'
Write-Host ''
$clientId = (Bereinige (Read-Host 'Client ID')).Trim()
$secret   = (Bereinige (Lies-Geheim 'Client Secret (verdeckt)')).Trim()
$user = ''; $pass = ''
Write-Host ''
if ((Read-Host 'Zusaetzlich das ALTE Konto (Benutzer + Passwort) testen? [j/N]') -match '^(j|y)') {
  $user = (Bereinige (Read-Host 'Benutzername (z. B. automated_user)')).Trim()
  $pass = Bereinige (Lies-Geheim 'Passwort (verdeckt)')
}

Schreib ''
Schreib "ServiceNow-Zugangstest $(Get-Date -Format 'dd.MM.yyyy HH:mm:ss') - Instanz $Instanz" 'Cyan'
$cidAnzeige = if ($clientId.Length -gt 8) { $clientId.Substring(0, 6) + '...' + $clientId.Substring($clientId.Length - 4) } else { $clientId }
Schreib "Client ID: $cidAnzeige (Laenge $($clientId.Length)) | Secret: Laenge $($secret.Length) | Benutzer: $user | Passwort: Laenge $($pass.Length)"
Schreib ''

$tabUrl = "$Instanz/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=user_name,name"
if ($user) { $tabUrl = "$Instanz/api/now/table/sys_user?sysparm_limit=1&sysparm_fields=user_name,name&sysparm_query=user_name=" + [uri]::EscapeDataString($user) }

$erg = [ordered]@{}

# 1) Basic Auth
if ($user -and $pass) {
  Schreib '1) Basic Auth (Benutzer + Passwort) -> Table-API' 'White'
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${user}:${pass}"))
  $r = Aufruf 'GET' $tabUrl @{ Accept = 'application/json'; Authorization = "Basic $b64" } $null
  $erg['Basic Auth'] = Zeig-Ergebnis 'Basic' $r
} else { Schreib '1) Basic Auth: uebersprungen (Benutzer/Passwort leer)' 'DarkGray' }
Schreib ''

$token = $null
# 2) OAuth password grant
if ($clientId -and $secret -and $user -and $pass) {
  Schreib '2) OAuth Token, grant_type=password (Client ID + Secret + Benutzer + Passwort)' 'White'
  $r = Hol-Token 'password' $clientId $secret $user $pass
  $erg['OAuth password'] = Zeig-Ergebnis 'password' $r
  if ($erg['OAuth password']) { try { $token = ($r.Body | ConvertFrom-Json).access_token } catch { } }
} else { Schreib '2) OAuth password: uebersprungen (es fehlt Client ID/Secret/Benutzer/Passwort)' 'DarkGray' }
Schreib ''

# 3) OAuth client_credentials
if ($clientId -and $secret) {
  Schreib '3) OAuth Token, grant_type=client_credentials (nur Client ID + Secret)' 'White'
  $r = Hol-Token 'client_credentials' $clientId $secret '' ''
  $erg['OAuth client_credentials'] = Zeig-Ergebnis 'client_credentials' $r
  if (-not $token -and $erg['OAuth client_credentials']) { try { $token = ($r.Body | ConvertFrom-Json).access_token } catch { } }
} else { Schreib '3) OAuth client_credentials: uebersprungen (Client ID/Secret leer)' 'DarkGray' }
Schreib ''

# 4) Table-API mit Token
if ($token) {
  Schreib '4) Table-API mit OAuth-Token (Bearer)' 'White'
  $r = Aufruf 'GET' "$Instanz/api/now/table/incident?sysparm_limit=1&sysparm_fields=number" @{ Accept = 'application/json'; Authorization = "Bearer $token" } $null
  $erg['Table-API mit Token'] = Zeig-Ergebnis 'bearer' $r
} else { Schreib '4) Table-API mit Token: uebersprungen (kein Token erhalten)' 'DarkGray' }

Schreib ''
Schreib '=== Zusammenfassung ===' 'Cyan'
foreach ($k in $erg.Keys) {
  if ($erg[$k]) { Schreib ("   OK      " + $k) 'Green' } else { Schreib ("   FEHLER  " + $k) 'Red' }
}
if ($erg.Count -eq 0) { Schreib '   Nichts getestet - keine Werte eingegeben.' 'DarkYellow' }

$datei = Join-Path $env:TEMP ("ServiceNow-Test-" + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
try { $protokoll | Set-Content -Path $datei -Encoding UTF8 } catch { }
try { ($protokoll -join "`r`n") | Set-Clipboard; Write-Host ''; Write-Host 'Protokoll (ohne Passwoerter/Secrets/Token) liegt in der Zwischenablage und unter:' -ForegroundColor Cyan; Write-Host "   $datei" } catch { }

Write-Host ''
Read-Host 'Enter zum Schliessen'
