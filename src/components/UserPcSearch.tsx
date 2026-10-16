// ── Benutzer-Suche → zugewiesene PCs (Startbildschirm) ───────────────────────
// Nutzt die wiederverwendbare Sofortsuche (UserPicker, client-seitig gefiltert).
// Nach Auswahl eines Benutzers werden dessen zugewiesene PCs (mit Modell) geladen;
// ein Klick wählt einen PC aus (onPick), hinter jedem Namen steht das „i".

import { useState } from 'react'
import { Loader2, UserSearch, Laptop } from 'lucide-react'
import { api } from '../electronAPI'
import { buildParallelOnlineCheck, parseOnlineCheckLine } from '../utils/connectivityCheck'
import { ladeBenutzerPCs, type UserPc } from '../netCheck/userPcs'
import { modelTypeDisplay } from '../services/endpointDevices'
import type { AdUserListItem } from '../services/adUsersList'
import { DeviceInfoButton } from './device/DeviceDossier'
import UserPicker from './UserPicker'

export default function UserPcSearch({ onPick, mitOnlineStatus, placeholder }: {
  onPick: (hostname: string, serial?: string) => void
  /** Zusätzlich je PC prüfen, ob er gerade erreichbar ist (parallel, ≤10 gleichzeitig). */
  mitOnlineStatus?: boolean
  placeholder?: string
}) {
  const [chosen, setChosen] = useState<AdUserListItem | null>(null)
  const [pcs, setPcs] = useState<UserPc[]>([])
  const [pcsLoading, setPcsLoading] = useState(false)
  const [picked, setPicked] = useState('')
  const [pcsMsg, setPcsMsg] = useState('')
  // hostname (klein) -> erreichbar; fehlt der Eintrag, läuft die Prüfung noch
  const [online, setOnline] = useState<Record<string, boolean>>({})
  const [onlineLaeuft, setOnlineLaeuft] = useState(false)

  async function pruefeOnline(list: UserPc[]) {
    const hosts = list.map(p => p.hostname).filter(Boolean)
    if (!hosts.length) return
    setOnline({}); setOnlineLaeuft(true)
    try {
      const r = await api().runPowerShell(buildParallelOnlineCheck(hosts), 60000)
      const stand: Record<string, boolean> = {}
      for (const zeile of (r.stdout || '').split(/\r?\n/)) {
        if (!zeile.includes(':OK:') && !zeile.includes(':OFFLINE')) continue
        const { hostname, online: an } = parseOnlineCheckLine(zeile)
        if (hostname) stand[hostname.toLowerCase()] = an
      }
      setOnline(stand)
    } catch { /* ohne Status weiter — die Liste selbst bleibt brauchbar */ }
    setOnlineLaeuft(false)
  }

  async function chooseUser(u: AdUserListItem) {
    setChosen(u); setPcsLoading(true); setPcs([]); setPicked(''); setPcsMsg(''); setOnline({})
    const list = await ladeBenutzerPCs(u.sam, u.displayName)
    setPcs(list); setPcsLoading(false)
    if (!list.length) setPcsMsg(`Keine zugewiesenen PCs für ${u.displayName} gefunden.`)
    else if (mitOnlineStatus) void pruefeOnline(list)
  }
  function pick(pc: UserPc) { setPicked(pc.hostname); onPick(pc.hostname, pc.serial) }

  const modelText = (pc: UserPc) => pc.model
    ? `${pc.model}${modelTypeDisplay(pc.model) !== '—' ? ' · ' + modelTypeDisplay(pc.model) : ''}`
    : (pc.os || '—')

  return (
    <div className="space-y-2">
      {!chosen && <UserPicker onPick={chooseUser} placeholder={placeholder} />}

      {chosen && (
        <div className="rounded-md border border-border p-2 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <UserSearch size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">{chosen.displayName}</span>
            <span className="text-[11px] font-mono text-muted-foreground">{chosen.sam}</span>
            {mitOnlineStatus && pcs.length > 0 && (
              <button onClick={() => void pruefeOnline(pcs)} disabled={onlineLaeuft}
                className="text-[11px] text-muted-foreground hover:text-foreground underline disabled:opacity-40">
                {onlineLaeuft ? 'Status wird geprüft …' : 'Status neu prüfen'}
              </button>
            )}
            <button onClick={() => { setChosen(null); setPcs([]); setPicked(''); setOnline({}) }}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground">andere Auswahl</button>
          </div>
          {pcsLoading ? (
            <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />PCs werden ermittelt…</p>
          ) : pcs.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{pcsMsg || 'Keine zugewiesenen PCs gefunden.'}</p>
          ) : (
            <div className="space-y-1">
              {pcs.map(pc => {
                const isPicked = picked === pc.hostname
                return (
                  <div key={pc.hostname}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded border ${isPicked ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/40'}`}>
                    <button onClick={() => pick(pc)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                      <Laptop size={14} className="text-muted-foreground shrink-0" />
                      <span className="text-sm font-mono font-semibold text-foreground shrink-0">{pc.hostname}</span>
                      <span className="text-[11px] text-muted-foreground truncate">{modelText(pc)}</span>
                    </button>
                    {mitOnlineStatus && <OnlineAbzeichen zustand={online[pc.hostname.toLowerCase()]} laeuft={onlineLaeuft} />}
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border shrink-0">{pc.quelle}</span>
                    <DeviceInfoButton hostname={pc.hostname} serial={pc.serial} />
                    {isPicked && <span className="text-[10px] text-primary font-semibold shrink-0">ausgewählt</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Erreichbarkeit eines PCs. `undefined` = noch nicht geprüft bzw. Prüfung läuft. */
function OnlineAbzeichen({ zustand, laeuft }: { zustand: boolean | undefined; laeuft: boolean }) {
  if (zustand === undefined) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground border border-border">
        {laeuft && <Loader2 size={8} className="animate-spin" />}{laeuft ? 'prüfe …' : 'unbekannt'}
      </span>
    )
  }
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full border ${
      zustand ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' : 'bg-muted/40 text-muted-foreground border-border'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${zustand ? 'bg-emerald-400' : 'bg-muted-foreground/60'}`} />
      {zustand ? 'online' : 'offline'}
    </span>
  )
}
