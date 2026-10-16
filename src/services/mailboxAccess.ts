// ── Gruppenpostfächer ein-/aushängen (Personen-Dossier) ─────────────────────
//
// WARUM NICHT DER OUTLOOK-WEG:
// Das manuelle Einbinden über „Kontoeinstellungen → Weitere Einstellungen → Erweitert"
// schreibt MAPI-Provider-Schlüssel mit generierten EntryIDs ins Outlook-Profil. Die
// lassen sich nicht verlässlich nachbauen, und falsch geschriebene Werte können das
// Profil unbrauchbar machen. Deshalb war dieser Bereich bisher reine Anzeige
// (siehe outlookMailboxes.ts).
//
// WAS STATTDESSEN GEMACHT WIRD:
// Exchange bringt dafür AutoMapping mit — genau den Mechanismus, bei dem Outlook das
// Postfach beim nächsten Start von selbst einhängt. Gesteuert wird er über die
// Vollzugriffs-Berechtigung am Postfach (`Add-/Remove-MailboxPermission`), die ihren
// Zustand im AD-Attribut `msExchDelegateListLink` ablegt — demselben Attribut, aus dem
// das Dossier die Postfächer ohnehin schon liest (Rückverweis `msExchDelegateListBL`).
//
// WICHTIG ZUR ABGRENZUNG: Berechtigungen werden hier im Haus über ServiceNow beantragt.
// Dieses Modul hängt deshalb standardmäßig NUR EIN und VERGIBT KEINE RECHTE: besteht der
// Vollzugriff noch nicht, bricht es ab und sagt das. Erst eine ausdrückliche Bestätigung
// (`darfRechteVergeben`) erlaubt das Vergeben.

import { api } from '../electronAPI'

function psq(s: string): string { return s.replace(/'/g, "''") }

async function ps(script: string, timeoutMs: number) {
  return api().runPowerShell(script, timeoutMs)
}

/** JSON aus einer PowerShell-Ausgabe lösen (die Diagnose antwortet als Objekt). */
function parseJson<T>(stdout: string): T | null {
  const s = (stdout || '').trim()
  if (!s) return null
  const i = s.indexOf('{')
  const j = s.lastIndexOf('}')
  try { return JSON.parse(i >= 0 && j > i ? s.slice(i, j + 1) : s) as T } catch { return null }
}

/** Antwortzeile `RES:OK:…` / `RES:ERR:…` aus der Ausgabe lösen. */
function deute(stdout: string, stderr?: string): { ok: boolean; text: string } {
  const zeile = (stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('RES:'))
  if (!zeile) return { ok: false, text: (stderr || '').trim() || 'Keine Antwort von Exchange.' }
  const rest = zeile.slice(4)
  if (rest.startsWith('OK:')) return { ok: true, text: rest.slice(3) }
  if (rest.startsWith('ERR:')) return { ok: false, text: rest.slice(4) }
  return { ok: false, text: rest }
}

// ── Exchange-Weg finden ──────────────────────────────────────────────────────
//
// Die erste Fassung meldete nur „kein erreichbarer Exchange-Server" und warf damit
// zwei völlig verschiedene Lagen zusammen: „im AD steht gar keiner" (dann liegen die
// Postfächer in Exchange Online) und „steht da, antwortet aber nicht" (dann sind es
// Ports/Rechte). Außerdem wurde nur Port 80 geprüft — viele Exchange-Server haben den
// zu und bedienen nur 443. Deshalb sammelt die Prüfung jetzt Fakten und benennt sie.

export interface ExchangeWeg {
  ok: boolean
  server: string
  text: string            // Klartext für die Oberfläche
  details: string[]       // aufklappbare Einzelbefunde
  /** true = die Postfächer liegen offenkundig in Exchange Online. */
  cloud?: boolean
}

let wegCache: ExchangeWeg | null = null

/** Exchange-Server aus der Konfigurationspartition des AD + Ports prüfen. */
const SERVER_SUCHE_PS = [
  `$exSrv = $null`,
  `$srvBefunde = @()`,
  `$srvAnzahl = 0`,
  `try {`,
  `  $cfg = (Get-ADRootDSE -EA Stop).configurationNamingContext`,
  `  $basis = "CN=Microsoft Exchange,CN=Services,$cfg"`,
  `  $kand = @(Get-ADObject -SearchBase $basis -Filter "objectClass -eq 'msExchExchangeServer'" -Properties name,msExchCurrentServerRoles,serialNumber -EA Stop)`,
  `  $srvAnzahl = $kand.Count`,
  // Client-Access-Rolle (Bit 16) bevorzugen, aber niemanden ausschließen.
  `  $mitCas = @($kand | Where-Object { $null -eq $_.msExchCurrentServerRoles -or ([int]$_.msExchCurrentServerRoles -band 16) -ne 0 })`,
  `  $liste = @(@($mitCas) + @($kand | Where-Object { $mitCas -notcontains $_ })) | Select-Object -First 6`,
  `  foreach ($s in $liste) {`,
  `    $fqdn = [string]$s.name`,
  `    try { $dns = (Resolve-DnsName $s.name -EA Stop | Where-Object { $_.Name } | Select-Object -First 1); if ($dns -and $dns.Name) { $fqdn = $dns.Name } } catch {}`,
  `    $offen = @()`,
  `    foreach ($port in 443, 80) {`,
  `      $t = New-Object System.Net.Sockets.TcpClient`,
  `      try { if ($t.ConnectAsync($fqdn, $port).Wait(2500)) { $offen += $port } } catch {}`,
  `      try { $t.Close() } catch {}`,
  `    }`,
  `    $srvBefunde += ('' + $s.name + ' (' + [string]$s.serialNumber + ') — ' + $(if ($offen.Count) { 'erreichbar auf Port ' + ($offen -join '/') } else { 'antwortet weder auf 443 noch auf 80' }))`,
  `    if (-not $exSrv -and $offen.Count) { $exSrv = $fqdn; $exPorts = $offen }`,
  `  }`,
  `} catch { $srvBefunde += ('AD-Abfrage fehlgeschlagen: ' + $_.Exception.Message) }`,
].join('\n')

/**
 * Prüfen, ob (und wie) Exchange-Befehle möglich sind — und wo die Postfächer liegen.
 * `sam` ist optional; damit wird am AD-Objekt der Person abgelesen, ob ihr Postfach
 * on-prem oder in der Cloud liegt (`homeMDB` vs. `targetAddress` auf …onmicrosoft.com).
 */
export async function findeExchangeWeg(force = false, sam?: string): Promise<ExchangeWeg> {
  if (wegCache && !force) return wegCache
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$d = @()`,
    `if (-not (Get-Command Get-ADRootDSE -EA SilentlyContinue)) { @{ ok=$false; grund='RSAT'; details=@('Das PowerShell-Modul für Active Directory (RSAT) fehlt auf diesem Admin-PC.') } | ConvertTo-Json -Compress; return }`,
    SERVER_SUCHE_PS,
    `$d += $srvBefunde`,
    // Wo liegt das Postfach dieser Person? Das entscheidet die Lage eindeutig.
    `$cloud = $false`,
    sam ? [
      `try {`,
      `  $u = Get-ADUser -Identity '${psq(sam)}' -Properties homeMDB,targetAddress,msExchRecipientTypeDetails -EA Stop`,
      `  $ziel = [string]$u.targetAddress`,
      `  if ($u.homeMDB) { $d += 'Postfach von ${psq(sam)}: liegt on-prem (homeMDB gesetzt).' }`,
      `  elseif ($ziel -match 'onmicrosoft\\.com') { $cloud = $true; $d += ('Postfach von ${psq(sam)}: liegt in Exchange Online (targetAddress ' + $ziel + ').') }`,
      `  elseif ($ziel) { $d += ('Postfach von ${psq(sam)}: verweist auf ' + $ziel) }`,
      `  else { $d += 'Postfach von ${psq(sam)}: weder homeMDB noch targetAddress gesetzt.' }`,
      `} catch { $d += ('AD-Objekt ${psq(sam)} nicht lesbar: ' + $_.Exception.Message) }`,
    ].join('\n') : `$d += 'Kein Benutzer übergeben — Postfach-Lage nicht geprüft.'`,
    // Liegt das Modul für Exchange Online bereit?
    `$eom = Get-Module -ListAvailable -Name ExchangeOnlineManagement | Sort-Object Version -Descending | Select-Object -First 1`,
    `$d += ('Modul ExchangeOnlineManagement auf diesem Admin-PC: ' + $(if ($eom) { 'vorhanden (' + [string]$eom.Version + ')' } else { 'nicht installiert' }))`,
    `$hatEom = [bool]$eom`,
    // Erst jetzt die Sitzung testen — über beide Protokolle.
    `$verbunden = $false; $verbFehler = ''`,
    `if ($exSrv) {`,
    `  foreach ($proto in @('http','https')) {`,
    `    if ($verbunden) { break }`,
    `    try {`,
    `      $so = if ($proto -eq 'https') { New-PSSessionOption -SkipCACheck -SkipCNCheck } else { $null }`,
    `      $sess = if ($so) { New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri ($proto + '://' + $exSrv + '/PowerShell/') -Authentication Kerberos -SessionOption $so -EA Stop }`,
    `              else { New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri ($proto + '://' + $exSrv + '/PowerShell/') -Authentication Kerberos -EA Stop }`,
    `      Remove-PSSession $sess -EA SilentlyContinue`,
    `      $verbunden = $true`,
    `      $d += ('Verbindung zu ' + $exSrv + ' über ' + $proto + ' hat geklappt.')`,
    `    } catch { $verbFehler = $_.Exception.Message; $d += ('Verbindung zu ' + $exSrv + ' über ' + $proto + ' abgelehnt: ' + $verbFehler) }`,
    `  }`,
    `}`,
    `@{ ok=$verbunden; server=[string]$exSrv; anzahl=$srvAnzahl; cloud=$cloud; hatEom=$hatEom; details=$d } | ConvertTo-Json -Compress -Depth 4`,
  ].join('\n')

  const r = await ps(script, 120000)
  const j = parseJson<{ ok?: boolean; grund?: string; server?: string; anzahl?: number; cloud?: boolean; hatEom?: boolean; details?: unknown }>(r.stdout)
  const details = Array.isArray(j?.details) ? (j!.details as unknown[]).map(String) : j?.details ? [String(j.details)] : []

  if (!j) {
    wegCache = { ok: false, server: '', text: r.stderr?.trim() || 'Die Prüfung lieferte keine Antwort.', details }
    return wegCache
  }
  if (j.grund === 'RSAT') {
    wegCache = { ok: false, server: '', text: 'Das PowerShell-Modul für Active Directory (RSAT) fehlt auf diesem Admin-PC — ohne das geht gar nichts.', details }
    return wegCache
  }
  if (j.ok) {
    wegCache = { ok: true, server: String(j.server || ''), text: `Exchange-Server ${j.server} erreichbar.`, details }
    return wegCache
  }

  // Kein Weg — aber jetzt mit präziser Begründung.
  const anzahl = Number(j.anzahl ?? 0)
  let text: string
  if (j.cloud) {
    text = 'Die Postfächer liegen in Exchange Online (Microsoft 365). Ein- und Aushängen braucht dort das Modul ExchangeOnlineManagement und eine Anmeldung — der Weg über einen Exchange-Server im Haus greift nicht.'
  } else if (anzahl === 0) {
    text = 'Im AD ist überhaupt kein Exchange-Server eingetragen. Das spricht dafür, dass die Postfächer in Exchange Online liegen.'
  } else if (!j.server) {
    text = `Im AD stehen ${anzahl} Exchange-Server, aber keiner antwortet auf Port 443 oder 80 (siehe Einzelheiten).`
  } else {
    text = `Der Exchange-Server ${j.server} ist erreichbar, lehnt die PowerShell-Verbindung aber ab — das sind üblicherweise fehlende Berechtigungen (siehe Einzelheiten).`
  }
  wegCache = { ok: false, server: String(j.server || ''), text, details, cloud: Boolean(j.cloud) }
  return wegCache
}

/** Einen Exchange-Befehl in einer Remoting-Sitzung ausführen (Kerberos, kein Passwort). */
function mitExchange(innen: string[]): string {
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `if (-not (Get-Command Get-ADRootDSE -EA SilentlyContinue)) { Write-Output 'RES:ERR:Das PowerShell-Modul für Active Directory (RSAT) fehlt auf diesem Admin-PC.'; return }`,
    SERVER_SUCHE_PS,
    `if (-not $exSrv) { Write-Output 'RES:ERR:Im AD ist kein erreichbarer Exchange-Server eingetragen.'; return }`,
    `$sess = $null`,
    `try {`,
    `  $sess = New-PSSession -ConfigurationName Microsoft.Exchange -ConnectionUri ("http://$exSrv/PowerShell/") -Authentication Kerberos -EA Stop`,
    `  Import-PSSession $sess -DisableNameChecking -AllowClobber -CommandName Get-Mailbox,Get-MailboxPermission,Add-MailboxPermission,Remove-MailboxPermission -EA Stop | Out-Null`,
    ...innen.map(z => '  ' + z),
    `} catch { Write-Output ('RES:ERR:' + $_.Exception.Message) }`,
    `finally { if ($sess) { Remove-PSSession $sess -EA SilentlyContinue } }`,
  ].join('\n')
}

// ── Ein- und Aushängen ───────────────────────────────────────────────────────

export interface MailboxErgebnis { ok: boolean; text: string; rechteVergeben?: boolean }

/**
 * Postfach bei diesem Benutzer einhängen (AutoMapping einschalten).
 *
 * AutoMapping lässt sich an einer bestehenden Berechtigung nicht umstellen — Exchange
 * verlangt Entfernen und erneutes Setzen. Das passiert hier in einem Rutsch.
 *
 * Ohne `darfRechteVergeben` wird NICHTS vergeben: fehlt der Vollzugriff, bricht der
 * Vorgang mit einem Hinweis auf den ServiceNow-Antrag ab.
 */
export async function haengePostfachEin(
  postfach: string, benutzerSam: string, opts: { darfRechteVergeben?: boolean } = {},
): Promise<MailboxErgebnis> {
  const mb = (postfach || '').trim()
  const user = (benutzerSam || '').trim()
  if (!mb || !user) return { ok: false, text: 'Postfach und Benutzerkonto werden beide benötigt.' }

  const script = mitExchange([
    `$mb = Get-Mailbox -Identity '${psq(mb)}' -EA SilentlyContinue`,
    `if (-not $mb) { Write-Output 'RES:ERR:In Exchange gibt es kein Postfach „${psq(mb)}".'; return }`,
    `$perm = @(Get-MailboxPermission -Identity $mb.Identity -User '${psq(user)}' -EA SilentlyContinue | Where-Object { $_.AccessRights -contains 'FullAccess' -and -not $_.Deny })`,
    opts.darfRechteVergeben
      ? `# Rechtevergabe wurde ausdrücklich bestätigt`
      : `if ($perm.Count -eq 0) { Write-Output 'RES:ERR:KEINRECHT'; return }`,
    // Bestehende Berechtigung abräumen, damit AutoMapping neu gesetzt werden kann.
    `if ($perm.Count -gt 0) { Remove-MailboxPermission -Identity $mb.Identity -User '${psq(user)}' -AccessRights FullAccess -Confirm:$false -EA Stop | Out-Null }`,
    `Add-MailboxPermission -Identity $mb.Identity -User '${psq(user)}' -AccessRights FullAccess -AutoMapping $true -Confirm:$false -EA Stop | Out-Null`,
    `$neu = if ($perm.Count -eq 0) { '1' } else { '0' }`,
    `Write-Output ('RES:OK:' + [string]$mb.DisplayName + '|' + [string]$mb.PrimarySmtpAddress + '|' + $neu)`,
  ])
  const r = await ps(script, 180000)
  const d = deute(r.stdout, r.stderr)
  if (!d.ok) {
    if (d.text === 'KEINRECHT') {
      return { ok: false, text: `${user} hat auf „${mb}" noch keinen Vollzugriff. Die Berechtigung läuft über ServiceNow — erst danach lässt sich das Postfach einhängen. (Wer die Berechtigung hier mitvergeben will, muss das ausdrücklich bestätigen.)` }
    }
    return { ok: false, text: d.text }
  }
  const [name, adresse, neu] = d.text.split('|')
  return {
    ok: true,
    rechteVergeben: neu === '1',
    text: `„${name || mb}"${adresse ? ` (${adresse})` : ''} ist für ${user} eingehängt${neu === '1' ? ' — der Vollzugriff wurde dabei neu vergeben' : ''}. Outlook zeigt es nach einem Neustart.`,
  }
}

/**
 * Postfach aushängen. Zwei Stufen, weil das ein Unterschied ist:
 *  · `nurAushaengen` (Standard): Vollzugriff bleibt, nur AutoMapping aus — Outlook blendet
 *    es aus, der Benutzer kann es bei Bedarf weiter selbst öffnen.
 *  · sonst: Vollzugriff wird komplett entzogen.
 */
export async function haengePostfachAus(
  postfach: string, benutzerSam: string, opts: { nurAushaengen?: boolean } = {},
): Promise<MailboxErgebnis> {
  const mb = (postfach || '').trim()
  const user = (benutzerSam || '').trim()
  if (!mb || !user) return { ok: false, text: 'Postfach und Benutzerkonto werden beide benötigt.' }
  const nurAus = opts.nurAushaengen !== false

  const script = mitExchange([
    `$mb = Get-Mailbox -Identity '${psq(mb)}' -EA SilentlyContinue`,
    `if (-not $mb) { Write-Output 'RES:ERR:In Exchange gibt es kein Postfach „${psq(mb)}".'; return }`,
    `$perm = @(Get-MailboxPermission -Identity $mb.Identity -User '${psq(user)}' -EA SilentlyContinue | Where-Object { $_.AccessRights -contains 'FullAccess' -and -not $_.Deny })`,
    `if ($perm.Count -eq 0) { Write-Output 'RES:ERR:Für ${psq(user)} besteht an diesem Postfach gar kein Vollzugriff — es gibt nichts auszuhängen.'; return }`,
    `Remove-MailboxPermission -Identity $mb.Identity -User '${psq(user)}' -AccessRights FullAccess -Confirm:$false -EA Stop | Out-Null`,
    nurAus
      ? `Add-MailboxPermission -Identity $mb.Identity -User '${psq(user)}' -AccessRights FullAccess -AutoMapping $false -Confirm:$false -EA Stop | Out-Null`
      : `# Vollzugriff wird vollständig entzogen`,
    `Write-Output ('RES:OK:' + [string]$mb.DisplayName + '|' + [string]$mb.PrimarySmtpAddress)`,
  ])
  const r = await ps(script, 180000)
  const d = deute(r.stdout, r.stderr)
  if (!d.ok) return { ok: false, text: d.text }
  const [name, adresse] = d.text.split('|')
  return {
    ok: true,
    text: nurAus
      ? `„${name || mb}"${adresse ? ` (${adresse})` : ''} ist für ${user} ausgehängt (Vollzugriff bleibt bestehen). Outlook blendet es nach einem Neustart aus.`
      : `Der Vollzugriff von ${user} auf „${name || mb}" wurde entzogen. Outlook blendet das Postfach nach einem Neustart aus.`,
  }
}

// ── Benachrichtigung an den Benutzer ─────────────────────────────────────────

/** Betreff und Text der optionalen Nachricht. */
export function baueNachricht(postfach: string, art: 'hinzugefuegt' | 'entfernt'): { betreff: string; text: string } {
  const was = art === 'hinzugefuegt' ? 'hinzugefügt' : 'entfernt'
  return {
    betreff: `Gruppenpostfach „${postfach}" ${was}`,
    text: `„${postfach}" wurde ${was}, bitte Outlook einmal neustarten.\n\nViele Grüße\nDeine IT`,
  }
}

/** Die Nachricht per Outlook verschicken (gleicher Weg wie die übrigen Tool-Mails). */
export async function sendeNachricht(empfaenger: string, postfach: string, art: 'hinzugefuegt' | 'entfernt'): Promise<MailboxErgebnis> {
  const to = (empfaenger || '').trim()
  if (!to) return { ok: false, text: 'Keine E-Mail-Adresse des Benutzers bekannt — die Nachricht wurde nicht verschickt.' }
  const { betreff, text } = baueNachricht(postfach, art)
  try {
    const r = await api().sendEmailRaw({ to, subject: betreff, body: text, smtp: '', port: 0, user: '', pass: '' })
    return r?.success
      ? { ok: true, text: `Nachricht an ${to} verschickt.` }
      : { ok: false, text: `Die Nachricht an ${to} konnte nicht verschickt werden${r?.error ? `: ${r.error}` : '.'}` }
  } catch (e) {
    return { ok: false, text: `Die Nachricht an ${to} konnte nicht verschickt werden: ${e instanceof Error ? e.message : String(e)}` }
  }
}
