// ── ServiceNow-Zugangsprüfung: Ergebnis erklären ────────────────────────────
// Aus den strukturierten Fehlerangaben (SnDiag, vom Main-Prozess) entstehen
//   • eine deutsche Kurzinfo für die Anzeige im Tool und
//   • eine englische Begründung zum Weiterleiten an den ServiceNow-Support (HCL):
//     was passiert, was fehlt, was zu tun ist — inkl. ServiceNows Originalantwort.
// Zugangsdaten tauchen nie im Text auf; von der Client ID nur die letzten 4 Zeichen.

import type { SnDiag } from '../electronAPI'

export interface SnErklaerung {
  /** Deutsche Kurzinfo (eine Zeile). */
  kurz: string
  /** Wer muss handeln? 'hcl' = an den ServiceNow-Support weiterleiten, 'wir' = eigene Seite (Netzwerk/Einstellung). */
  wer: 'hcl' | 'wir'
  /** Englischer Text zum Weiterleiten. */
  englisch: string
}

export interface SnPruefKontext {
  instanceUrl: string
  /** Letzte Zeichen der Client ID (nur zur Wiedererkennung). */
  clientIdEnde?: string
  /** Benutzer des alten Kontos (Basic Auth / password grant). */
  user?: string
  at: Date
}

const TABELLEN = 'incident, sc_task, sys_user, sys_user_group, cmdb_ci_computer'

function methodeEn(d: SnDiag, k: SnPruefKontext): string {
  if (d.method === 'oauth') return `OAuth 2.0 (Client ID ending in …${k.clientIdEnde || '????'})`
  if (d.method === 'basic') return `Basic authentication (user "${k.user || '?'}")`
  return 'SSO session'
}

function oauthEntity(text?: string): string {
  return (text || '').match(/OAuth:\s*([0-9a-f]{32})/i)?.[1] ?? ''
}

function snAntwort(status: number, error?: string, description?: string): string {
  const teile = [error, description].filter(Boolean).join(' — ')
  return `HTTP ${status || '—'}${teile ? ` — "${teile}"` : ''}`
}

export function erklaereSnFehler(diag: SnDiag | undefined, fehler: string | undefined, k: SnPruefKontext): SnErklaerung {
  const was: string[] = []     // What happens
  const fehlt: string[] = []   // What is missing / please do
  let kurz = fehler || 'Unbekannter Fehler'
  let wer: 'hcl' | 'wir' = 'hcl'

  if (!diag) {
    was.push(`The request failed: ${fehler || 'unknown error'}`)
    fehlt.push('Please check the integration setup on your side.')
  } else if (diag.stage === 'connect') {
    wer = 'wir'
    kurz = 'Keine Verbindung zur Instanz (Netzwerk/Proxy) — liegt sehr wahrscheinlich an unserer Seite, nicht an HCL.'
    was.push(`No HTTP response from the instance: ${diag.netError || fehler || 'connection error'}`)
    fehlt.push('This looks like a network/proxy issue on our side — no action needed from ServiceNow support yet.')
  } else if (diag.stage === 'token') {
    const att = diag.attempts ?? []
    const kurzTeile: string[] = []
    for (const a of att) {
      const text = `${a.error || ''} ${a.description || ''}`
      was.push(`Token request (POST /oauth_token.do, grant_type=${a.grant}): ${a.netError ? `no response — ${a.netError}` : snAntwort(a.status, a.error, a.description)}`)
      if (a.netError) {
        wer = 'wir'
        kurzTeile.push('keine Verbindung zum Token-Endpunkt (Netzwerk)')
      } else if (/integration user is not configured/i.test(text)) {
        const id = oauthEntity(a.description)
        fehlt.push(`The OAuth Application Registry entry${id ? ` (sys_id ${id})` : ''} has no "OAuth Application User" set. For the client_credentials grant, please set the OAuth Application User (e.g. our integration user) on that entry.`)
        kurzTeile.push('Client ID + Secret stimmen, aber HCL hat am OAuth-Eintrag noch keinen „OAuth Application User" hinterlegt')
      } else if (/unsupported_grant_type/i.test(text)) {
        fehlt.push(`The grant type "${a.grant}" is not enabled on the instance. For client_credentials please set the system property glide.oauth.inbound.client.credential.grant_type.enabled = true.`)
        kurzTeile.push(`Grant-Typ „${a.grant}" ist auf der Instanz nicht freigeschaltet`)
      } else if (/invalid_client/i.test(text) || /client.*(not found|invalid)/i.test(text)) {
        fehlt.push('The Client ID / Client Secret are not accepted (invalid_client). Please confirm the Client ID and re-send the Client Secret (it may have been regenerated).')
        kurzTeile.push('Client ID oder Client Secret wird nicht akzeptiert')
      } else if (a.grant === 'password' && /access_denied|invalid_grant/i.test(text)) {
        fehlt.push(`The user "${k.user || '?'}" is not accepted for the password grant with this OAuth client (wrong password, locked user, or user not allowed for this client).`)
        kurzTeile.push('Benutzer/Passwort für diesen OAuth-Client abgelehnt')
      } else {
        fehlt.push(`Please check the OAuth Application Registry entry — the token request was rejected (${snAntwort(a.status, a.error, a.description)}).`)
        kurzTeile.push(`Token abgelehnt (HTTP ${a.status})`)
      }
    }
    kurz = 'OAuth-Token nicht erhalten — ' + (kurzTeile.join('; ') || 'unbekannter Grund') + '.'
  } else {
    // stage 'api': erreicht + (ggf.) Token bekommen, aber die Table-API lehnt ab
    const st = diag.status || 0
    const sn = [diag.snMessage, diag.snDetail].filter(Boolean).join(' — ')
    was.push(`Table API (GET /api/now/table/${diag.table || 'sys_user'}) with ${methodeEn(diag, k)}: HTTP ${st}${sn ? ` — "${sn}"` : ''}`)
    if (st === 401 && diag.method === 'oauth') {
      fehlt.push('An OAuth token was issued, but the Table API rejects it. Please check that the OAuth Application User is active and allowed to use the REST API (token scope "useraccount").')
      kurz = 'Token erhalten, aber die Table-API lehnt es ab (401) — Einstellung bei HCL.'
    } else if (st === 401 && diag.method === 'basic') {
      fehlt.push(`Basic authentication for user "${k.user || '?'}" is rejected although it worked before. Has the password been changed, or has Basic Auth / web service access been disabled for this user?`)
      kurz = 'Altes Konto (Benutzer + Passwort) wird abgelehnt (401) — Passwort geändert oder Basic Auth abgeschaltet?'
    } else if (st === 401) {
      wer = 'wir'
      fehlt.push('Not signed in (SSO session missing or expired).')
      kurz = 'Nicht angemeldet (SSO) — bitte anmelden.'
    } else if (st === 403) {
      fehlt.push(`Authentication works, but read access is denied. Please grant the integration user read access (roles / ACLs) to the tables ${TABELLEN}.`)
      kurz = 'Anmeldung klappt, aber es fehlen Leserechte (403) — Rollen/ACLs bei HCL.'
    } else if (st === 404) {
      wer = 'wir'
      fehlt.push('Endpoint not found — please verify the instance URL.')
      kurz = 'Nicht gefunden (404) — Instanz-URL prüfen (unsere Einstellung).'
    } else {
      fehlt.push('Unexpected response from the Table API — please check the instance logs for this request.')
      kurz = `Unerwartete Antwort der Table-API (HTTP ${st}).`
    }
  }

  const stamp = k.at.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const englisch = [
    'Hello,',
    '',
    'we are connecting our internal IT admin tool to ServiceNow via the REST Table API. The connection test currently fails.',
    '',
    `Instance:        ${k.instanceUrl}`,
    `Authentication:  ${diag ? methodeEn(diag, k) : 'unknown'}`,
    `Tested at:       ${stamp}`,
    '',
    'What happens:',
    ...was.map(s => '- ' + s),
    '',
    wer === 'hcl' ? 'What is missing / please do:' : 'Note:',
    ...fehlt.map(s => '- ' + s),
    '',
    `The integration needs read access to: ${TABELLEN} (later also write access to incident and sc_task).`,
    '',
    'Could you please check this and let me know when it is fixed? Thank you!',
  ].join('\n')

  return { kurz, wer, englisch }
}
