// ── Ziel-PC suchen: Hostname, IP-Adresse, Seriennummer ODER Name einer Person ─
// Ein Eingabefeld für alles. Sofort-Treffer aus den Zwischenspeichern (Endgeräte-
// Übersicht, Inventar, AD-Benutzerliste) — ohne Live-AD-Abfrage beim Tippen. Eine IP
// wird zusätzlich per DNS rückwärts aufgelöst; eine Person zeigt ihre zugewiesenen PCs
// (wie die Benutzer-Suche am Startbildschirm); „Im AD suchen“ findet Computer über alle
// Domänen per Namens-/Seriennummernteil (Computername = Präfix + Seriennummer).

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Loader2, Laptop, UserRound, Globe, Server, CornerDownLeft, RefreshCw } from 'lucide-react'
import { api } from '../electronAPI'
import { ensureDailyAdUsers } from '../services/adUserDirectory'
import type { AdUserListItem } from '../services/adUsersList'
import { ladeBenutzerPCs, type UserPc } from '../netCheck/userPcs'
import { isIpv4 } from '../utils/remoteTarget'
import { DeviceInfoButton } from './device/DeviceDossier'
import { PersonInfoButton } from './person/PersonDossier'

export interface PcWahl { host: string; serial?: string; person?: string; quelle?: string; ip?: string }

interface Geraet { host: string; serial?: string; person?: string; modell?: string; ip?: string; quelle: 'Endgerät' | 'Inventar' }

let cacheGeraete: Promise<Geraet[]> | null = null
function ladeGeraete(): Promise<Geraet[]> {
  if (!cacheGeraete) cacheGeraete = (async () => {
    const out = new Map<string, Geraet>()
    try {
      const d = await api().netReadJsonAsync<{ devices?: { hostname?: string; serial?: string; assignedTo?: string; model?: string }[] }>('endpoint-devices/devices.json')
      for (const x of d?.devices || []) { const h = (x.hostname || '').trim().toUpperCase(); if (h) out.set(h, { host: h, serial: x.serial || undefined, person: x.assignedTo || undefined, modell: x.model || undefined, quelle: 'Endgerät' }) }
    } catch { /* optional */ }
    try {
      const inv = await api().netReadJsonAsync<{ name?: string; serial?: string; assignedTo?: string; model?: string; ip?: string; category?: string }[]>('inventory/inventory.json')
      for (const x of Array.isArray(inv) ? inv : []) {
        const h = (x.name || '').trim().toUpperCase()
        if (!h || !/computer|pc|laptop|notebook|workstation|desktop|client|rechner|server/i.test(x.category || '') && !/^de/i.test(h)) continue
        const alt = out.get(h)
        out.set(h, { host: h, serial: alt?.serial || x.serial || undefined, person: alt?.person || x.assignedTo || undefined, modell: alt?.modell || x.model || undefined, ip: x.ip || undefined, quelle: alt?.quelle || 'Inventar' })
      }
    } catch { /* optional */ }
    return [...out.values()]
  })()
  return cacheGeraete
}

async function dnsRueckwaerts(ip: string): Promise<string> {
  if (!isIpv4(ip)) return ''
  try {
    const r = await api().runPowerShell(`try { ([System.Net.Dns]::GetHostEntry('${ip}').HostName -split '\\.')[0].ToUpper() } catch { '' }`, 12000)
    return (r.stdout || '').trim().split(/\r?\n/).pop()?.trim() || ''
  } catch { return '' }
}

/** Computer im AD über alle Domänen (Teil von Name oder Seriennummer). */
async function adComputerSuche(teil: string): Promise<{ host: string; os?: string; beschreibung?: string; zuletzt?: string }[]> {
  const t = teil.replace(/[^A-Za-z0-9-]/g, '')
  if (t.length < 3) return []
  const ps = [
    `$ErrorActionPreference='SilentlyContinue'; $t='${t}'; $out=@()`,
    `$doms=@(); try { $cfg=([ADSI]'LDAP://RootDSE').configurationNamingContext; $s=New-Object System.DirectoryServices.DirectorySearcher([ADSI]("LDAP://CN=Partitions,$cfg")); $s.Filter='(&(objectCategory=crossRef)(systemFlags:1.2.840.113556.1.4.803:=2))'; [void]$s.PropertiesToLoad.Add('dnsRoot'); foreach ($r in $s.FindAll()) { $doms += [string]$r.Properties['dnsroot'][0] } } catch {}`,
    `if (-not $doms.Count -and $env:USERDNSDOMAIN) { $doms=@($env:USERDNSDOMAIN) }`,
    `foreach ($d in $doms) { try { $s=New-Object System.DirectoryServices.DirectorySearcher([ADSI]("LDAP://$d")); $s.Filter="(&(objectCategory=computer)(|(name=*$t*)(dNSHostName=*$t*)))"; $s.SizeLimit=15; foreach ($p in 'name','operatingSystem','description','lastLogonTimestamp') { [void]$s.PropertiesToLoad.Add($p) }; foreach ($r in $s.FindAll()) { $ll=''; if ($r.Properties['lastlogontimestamp'].Count) { $ll=[DateTime]::FromFileTime([int64]$r.Properties['lastlogontimestamp'][0]).ToString('yyyy-MM-dd') }; $out += [ordered]@{ host=[string]$r.Properties['name'][0]; os=[string]$r.Properties['operatingsystem'][0]; beschreibung=[string]$r.Properties['description'][0]; zuletzt=$ll } } } catch {} }`,
    `'@@PCSUCHE@@' + (ConvertTo-Json -InputObject @($out | Select-Object -First 20) -Compress)`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(ps, 45000)
    const i = (r.stdout || '').lastIndexOf('@@PCSUCHE@@')
    if (i < 0) return []
    const j = JSON.parse(r.stdout.slice(i + 11).trim())
    return (Array.isArray(j) ? j : [j]).filter(x => x && x.host).map(x => ({ host: String(x.host).toUpperCase(), os: x.os || undefined, beschreibung: x.beschreibung || undefined, zuletzt: x.zuletzt || undefined }))
  } catch { return [] }
}

const istHostname = (s: string) => /^[A-Za-z][A-Za-z0-9-]{3,14}$/.test(s)

export default function PcSuche({ wert, onWahl, autoFocus, placeholder, kompakt }: {
  wert?: PcWahl | null
  onWahl: (w: PcWahl | null) => void
  autoFocus?: boolean
  placeholder?: string
  kompakt?: boolean
}) {
  const [q, setQ] = useState('')
  const [geraete, setGeraete] = useState<Geraet[]>([])
  const [personen, setPersonen] = useState<AdUserListItem[]>([])
  const [laedt, setLaedt] = useState(true)
  const [dns, setDns] = useState<{ ip: string; host: string; laeuft: boolean } | null>(null)
  const [person, setPerson] = useState<AdUserListItem | null>(null)
  const [personPcs, setPersonPcs] = useState<UserPc[] | null>(null)
  const [ad, setAd] = useState<{ teil: string; laeuft: boolean; treffer: { host: string; os?: string; beschreibung?: string; zuletzt?: string }[] } | null>(null)
  const eingabe = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let aus = false
    Promise.all([ladeGeraete(), ensureDailyAdUsers().then(r => r.dir?.users || []).catch(() => [] as AdUserListItem[])])
      .then(([g, u]) => { if (!aus) { setGeraete(g); setPersonen(u); setLaedt(false) } })
      .catch(() => { if (!aus) setLaedt(false) })
    return () => { aus = true }
  }, [])

  const t = q.trim()
  const tl = t.toLowerCase()
  const ipVoll = isIpv4(t)
  const ipTeil = /^\d{1,3}(\.\d{0,3}){1,3}$/.test(t)

  // IP → DNS rückwärts (kurz verzögert)
  useEffect(() => {
    if (!ipVoll) { setDns(null); return }
    setDns({ ip: t, host: '', laeuft: true })
    const h = setTimeout(() => { void dnsRueckwaerts(t).then(host => setDns(d => (d && d.ip === t ? { ip: t, host, laeuft: false } : d))) }, 350)
    return () => clearTimeout(h)
  }, [t, ipVoll])

  const treffer = useMemo(() => {
    if (!t) return { geraete: [] as Geraet[], personen: [] as AdUserListItem[] }
    const g = ipTeil
      ? geraete.filter(x => x.ip && x.ip.startsWith(t))
      : geraete.filter(x => x.host.toLowerCase().includes(tl) || (tl.length >= 4 && (x.serial || '').toLowerCase().includes(tl)) || (tl.length >= 3 && (x.person || '').toLowerCase().includes(tl)))
    g.sort((a, b) => Number(!a.host.toLowerCase().startsWith(tl)) - Number(!b.host.toLowerCase().startsWith(tl)) || a.host.localeCompare(b.host))
    const p = ipTeil || tl.length < 2 ? [] : personen.filter(u => u.displayName.toLowerCase().includes(tl) || u.sam.toLowerCase().includes(tl) || (u.email || '').toLowerCase().includes(tl))
      .sort((a, b) => Number(!a.displayName.toLowerCase().startsWith(tl)) - Number(!b.displayName.toLowerCase().startsWith(tl)) || a.displayName.localeCompare(b.displayName, 'de'))
    return { geraete: g.slice(0, 8), personen: p.slice(0, 6) }
  }, [t, tl, ipTeil, geraete, personen])

  function waehle(w: PcWahl) { onWahl(w); setQ(''); setPerson(null); setPersonPcs(null); setAd(null) }
  async function waehlePerson(u: AdUserListItem) {
    setPerson(u); setPersonPcs(null)
    const l = await ladeBenutzerPCs(u.sam, u.displayName)
    setPersonPcs(l)
    if (l.length === 1) waehle({ host: l[0].hostname, serial: l[0].serial, person: u.displayName, quelle: l[0].quelle })
  }
  async function sucheImAd() {
    setAd({ teil: t, laeuft: true, treffer: [] })
    const r = await adComputerSuche(t)
    setAd({ teil: t, laeuft: false, treffer: r })
  }
  function enter() {
    if (ipVoll && dns?.host) return waehle({ host: dns.host, ip: t, quelle: 'DNS' })
    if (ipVoll) return waehle({ host: t, ip: t, quelle: 'IP' })
    if (treffer.geraete.length === 1 || (treffer.geraete[0] && treffer.geraete[0].host.toLowerCase() === tl)) { const g = treffer.geraete[0]; return waehle({ host: g.host, serial: g.serial, person: g.person, quelle: g.quelle }) }
    if (!treffer.geraete.length && treffer.personen.length === 1) return void waehlePerson(treffer.personen[0])
    if (istHostname(t)) return waehle({ host: t.toUpperCase(), quelle: 'Eingabe' })
  }

  // Gewählt → kompakte Anzeige
  if (wert?.host) {
    return (
      <div className="flex items-center gap-2 flex-wrap rounded-md border border-primary/40 bg-primary/5 px-3 py-2" data-pc-gewaehlt>
        <Laptop size={15} className="text-primary shrink-0" />
        <span className="font-mono font-semibold text-sm text-foreground">{wert.host}</span>
        <DeviceInfoButton hostname={wert.host} serial={wert.serial} />
        {wert.ip && wert.ip !== wert.host && <span className="text-[11px] text-muted-foreground font-mono">{wert.ip}</span>}
        {wert.person && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">· {wert.person}<PersonInfoButton name={wert.person} /></span>}
        {wert.quelle && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border">{wert.quelle}</span>}
        <button onClick={() => { onWahl(null); setTimeout(() => eingabe.current?.focus(), 0) }} className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline">anderer PC</button>
      </div>
    )
  }

  const nichts = t && !treffer.geraete.length && !treffer.personen.length && !ipVoll
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input ref={eingabe} value={q} onChange={e => { setQ(e.target.value); setPerson(null); setPersonPcs(null); setAd(null) }} autoFocus={autoFocus} spellCheck={false}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enter() } if (e.key === 'Escape') setQ('') }}
          placeholder={placeholder || 'Hostname, IP-Adresse, Seriennummer oder Name …'} data-pc-suche
          className={`w-full pl-9 pr-9 ${kompakt ? 'py-1.5' : 'py-2.5'} text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary`} />
        {laedt && <Loader2 size={14} className="absolute right-9 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        {q && <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground" title="Leeren"><X size={14} /></button>}
      </div>

      {t && (
        <div className="rounded-md border border-border bg-card divide-y divide-border/60 max-h-80 overflow-y-auto shadow-sm" data-pc-treffer>
          {ipVoll && (
            <button onClick={() => waehle(dns?.host ? { host: dns.host, ip: t, quelle: 'DNS' } : { host: t, ip: t, quelle: 'IP' })}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30">
              <Globe size={14} className="text-sky-500 shrink-0" />
              <span className="text-sm font-mono text-foreground">{t}</span>
              <span className="text-xs text-muted-foreground">
                {dns?.laeuft ? <span className="inline-flex items-center gap-1"><Loader2 size={11} className="animate-spin" />Name wird aufgelöst …</span>
                  : dns?.host ? <>→ <span className="font-mono font-semibold text-foreground">{dns.host}</span> (DNS)</> : 'kein DNS-Name — direkt per IP verbinden'}
              </span>
              <CornerDownLeft size={12} className="ml-auto text-muted-foreground" />
            </button>
          )}
          {treffer.geraete.map(g => (
            <div key={g.host} role="button" tabIndex={0} onClick={() => waehle({ host: g.host, serial: g.serial, person: g.person, quelle: g.quelle, ip: g.ip })}
              onKeyDown={e => { if (e.key === 'Enter') waehle({ host: g.host, serial: g.serial, person: g.person, quelle: g.quelle, ip: g.ip }) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 cursor-pointer">
              <Laptop size={14} className="text-muted-foreground shrink-0" />
              <span className="text-sm font-mono font-semibold text-foreground">{g.host}</span>
              <DeviceInfoButton hostname={g.host} serial={g.serial} />
              <span className="text-[11px] text-muted-foreground truncate">{[g.person, g.modell, g.ip, g.serial && `SN ${g.serial}`].filter(Boolean).join(' · ')}</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border shrink-0">{g.quelle}</span>
            </div>
          ))}
          {treffer.personen.map(u => (
            <div key={u.sam}>
              <div role="button" tabIndex={0} onClick={() => void waehlePerson(u)} onKeyDown={e => { if (e.key === 'Enter') void waehlePerson(u) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 cursor-pointer ${person?.sam === u.sam ? 'bg-accent/20' : ''}`}>
                <UserRound size={14} className="text-violet-500 shrink-0" />
                <span className="inline-flex items-center gap-1 text-sm text-foreground">{u.displayName}<PersonInfoButton name={u.displayName} sam={u.sam} /></span>
                <span className="text-[11px] text-muted-foreground font-mono">{u.sam}</span>
                {u.department && <span className="text-[11px] text-muted-foreground truncate">· {u.department}</span>}
                <span className="ml-auto text-[10px] text-primary shrink-0">zugewiesene Geräte →</span>
              </div>
              {person?.sam === u.sam && (
                <div className="pl-9 pr-3 pb-2 space-y-1" data-person-pcs>
                  {personPcs === null ? <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Geräte werden ermittelt …</p>
                    : personPcs.length === 0 ? <p className="text-xs text-muted-foreground italic">Keine zugewiesenen Geräte gefunden.</p>
                      : personPcs.map(pc => (
                        <div key={pc.hostname} role="button" tabIndex={0} onClick={() => waehle({ host: pc.hostname, serial: pc.serial, person: u.displayName, quelle: pc.quelle })}
                          onKeyDown={e => { if (e.key === 'Enter') waehle({ host: pc.hostname, serial: pc.serial, person: u.displayName, quelle: pc.quelle }) }}
                          className="flex items-center gap-2 px-2 py-1.5 rounded border border-border bg-background hover:border-primary/50 cursor-pointer">
                          <Laptop size={13} className="text-muted-foreground" />
                          <span className="text-sm font-mono font-semibold text-foreground">{pc.hostname}</span>
                          <DeviceInfoButton hostname={pc.hostname} serial={pc.serial} />
                          <span className="text-[11px] text-muted-foreground truncate">{pc.model || pc.os || ''}{pc.lastLogon ? ` · zuletzt ${pc.lastLogon}` : ''}</span>
                          <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border">{pc.quelle}</span>
                        </div>
                      ))}
                </div>
              )}
            </div>
          ))}
          {!ipVoll && istHostname(t) && !treffer.geraete.some(g => g.host.toLowerCase() === tl) && (
            <button onClick={() => waehle({ host: t.toUpperCase(), quelle: 'Eingabe' })} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/30">
              <CornerDownLeft size={14} className="text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">„<span className="font-mono text-foreground">{t.toUpperCase()}</span>“ direkt als Computernamen verwenden</span>
            </button>
          )}
          {!ipVoll && !ipTeil && t.replace(/[^A-Za-z0-9-]/g, '').length >= 3 && (
            <div className="px-3 py-2">
              {!ad || ad.teil !== t ? (
                <button onClick={() => void sucheImAd()} className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"><Server size={12} />„{t}“ im AD suchen (alle Domänen, auch per Seriennummer)</button>
              ) : ad.laeuft ? <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={11} className="animate-spin" />Verzeichnis wird durchsucht …</p>
                : ad.treffer.length === 0 ? <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">Im AD nichts gefunden. <button onClick={() => void sucheImAd()} className="inline-flex items-center gap-1 text-primary"><RefreshCw size={11} />erneut</button></p>
                  : ad.treffer.map(x => (
                    <div key={x.host} role="button" tabIndex={0} onClick={() => waehle({ host: x.host, quelle: 'AD' })} onKeyDown={e => { if (e.key === 'Enter') waehle({ host: x.host, quelle: 'AD' }) }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent/30 cursor-pointer">
                      <Server size={13} className="text-muted-foreground" />
                      <span className="text-sm font-mono font-semibold text-foreground">{x.host}</span>
                      <DeviceInfoButton hostname={x.host} />
                      <span className="text-[11px] text-muted-foreground truncate">{[x.beschreibung, x.os, x.zuletzt && `zuletzt ${x.zuletzt}`].filter(Boolean).join(' · ')}</span>
                    </div>
                  ))}
            </div>
          )}
          {nichts && !istHostname(t) && (!ad || ad.teil !== t) && t.replace(/[^A-Za-z0-9-]/g, '').length < 3 && <p className="px-3 py-2 text-xs text-muted-foreground">Nichts gefunden.</p>}
        </div>
      )}
    </div>
  )
}
