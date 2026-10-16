// ── Nachricht an den am Ziel-PC angemeldeten Benutzer ───────────────────────
// `msg *` zeigt ein Fenster in der Sitzung jedes angemeldeten Benutzers. Best-effort:
// ist niemand angemeldet oder ist msg.exe nicht verfügbar (Windows Home), passiert
// schlicht nichts — das darf einen laufenden Vorgang nie aufhalten.
// Gleiches Muster wie in hpDrivers.notifyLoggedInUser, hier zentral zum Wiederverwenden.

import { api } from '../electronAPI'

/**
 * Zeigt dem angemeldeten Benutzer eine Meldung. `sekunden` ist die Anzeigedauer, nach
 * der das Fenster von selbst verschwindet (msg /TIME).
 * Gibt zurück, ob die Meldung abgesetzt werden konnte — nur zur Protokollierung.
 */
export async function sendDesktopMessage(host: string, message: string, sekunden = 300): Promise<boolean> {
  const h = (host || '').trim()
  if (!h) return false
  const m = (message || '').replace(/"/g, "'")   // msg-Argument ist doppelt gequotet
  const script = [
    `try {`,
    `  $o = Invoke-Command -ComputerName '${h.replace(/'/g, "''")}' -ErrorAction Stop -ScriptBlock {`,
    `    try { msg * /TIME:${sekunden} "${m}"; 'OK' } catch { 'ERR' }`,
    `  }`,
    `  Write-Output ([string]$o)`,
    `} catch { Write-Output 'ERR' }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 30000)
    return (r.stdout || '').includes('OK')
  } catch { return false }
}
