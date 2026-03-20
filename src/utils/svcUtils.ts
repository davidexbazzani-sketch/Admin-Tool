// Shared service management utilities — used by Results.tsx and RemoteDoc ServicePanel

export const CRITICAL_SERVICES = new Set([
  'WinRM', 'RpcSs', 'RpcEptMapper', 'Dnscache', 'LanmanServer', 'LanmanWorkstation',
  'Spooler', 'PlugPlay', 'wuauserv', 'EventLog', 'Winmgmt', 'BITS', 'Schedule',
  'MpsSvc', 'BFE', 'netprofm', 'NlaSvc', 'Netlogon', 'SamSs', 'lsass',
])

export interface SvcItem {
  Name: string
  DisplayName: string
  Status: string
  StartType: string
}

export function svcStatusColor(status: string): string {
  if (status === 'Running')  return 'text-emerald-400'
  if (status === 'Stopped')  return 'text-orange-400/80'
  if (status === 'Disabled') return 'text-muted-foreground'
  return 'text-amber-400'
}

/** Builds the Invoke-Command script that starts/stops/restarts a service and returns JSON. */
export function buildSvcActionScript(hostname: string, svcName: string, action: 'start' | 'stop' | 'restart'): string {
  const esc = svcName.replace(/'/g, "''")
  return [
    `try {`,
    `  $out = Invoke-Command -ComputerName '${hostname}' -EA Stop -ScriptBlock {`,
    `    param($n, $a)`,
    `    try {`,
    `      if ($a -eq 'start') { Start-Service -Name $n -EA Stop }`,
    `      elseif ($a -eq 'stop') { Stop-Service -Name $n -Force -EA Stop }`,
    `      else { Restart-Service -Name $n -Force -EA Stop }`,
    `      Start-Sleep -Seconds 2`,
    `      $s = Get-Service -Name $n`,
    `      @{success=$true;newStatus=$s.Status.ToString();message="Erfolgreich"} | ConvertTo-Json -Compress`,
    `    } catch {`,
    `      @{success=$false;newStatus='';message=$_.Exception.Message} | ConvertTo-Json -Compress`,
    `    }`,
    `  } -ArgumentList '${esc}','${action}'`,
    `  Write-Output $out`,
    `} catch {`,
    `  @{success=$false;newStatus='';message=$_.Exception.Message} | ConvertTo-Json -Compress`,
    `}`,
  ].join('\n')
}
