// ── Benutzer-Suche → zugewiesene PCs (Startbildschirm) ───────────────────────
// Nutzt die wiederverwendbare Sofortsuche (UserPicker, client-seitig gefiltert).
// Nach Auswahl eines Benutzers werden dessen zugewiesene PCs (mit Modell) geladen;
// ein Klick wählt einen PC aus (onPick), hinter jedem Namen steht das „i".

import { useState } from 'react'
import { Loader2, UserSearch, Laptop } from 'lucide-react'
import { ladeBenutzerPCs, type UserPc } from '../netCheck/userPcs'
import { modelTypeDisplay } from '../services/endpointDevices'
import type { AdUserListItem } from '../services/adUsersList'
import { DeviceInfoButton } from './device/DeviceDossier'
import UserPicker from './UserPicker'

export default function UserPcSearch({ onPick }: { onPick: (hostname: string, serial?: string) => void }) {
  const [chosen, setChosen] = useState<AdUserListItem | null>(null)
  const [pcs, setPcs] = useState<UserPc[]>([])
  const [pcsLoading, setPcsLoading] = useState(false)
  const [picked, setPicked] = useState('')
  const [pcsMsg, setPcsMsg] = useState('')

  async function chooseUser(u: AdUserListItem) {
    setChosen(u); setPcsLoading(true); setPcs([]); setPicked(''); setPcsMsg('')
    const list = await ladeBenutzerPCs(u.sam, u.displayName)
    setPcs(list); setPcsLoading(false)
    if (!list.length) setPcsMsg(`Keine zugewiesenen PCs für ${u.displayName} gefunden.`)
  }
  function pick(pc: UserPc) { setPicked(pc.hostname); onPick(pc.hostname, pc.serial) }

  const modelText = (pc: UserPc) => pc.model
    ? `${pc.model}${modelTypeDisplay(pc.model) !== '—' ? ' · ' + modelTypeDisplay(pc.model) : ''}`
    : (pc.os || '—')

  return (
    <div className="space-y-2">
      {!chosen && <UserPicker onPick={chooseUser} />}

      {chosen && (
        <div className="rounded-md border border-border p-2 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <UserSearch size={14} className="text-primary" />
            <span className="text-sm font-semibold text-foreground">{chosen.displayName}</span>
            <span className="text-[11px] font-mono text-muted-foreground">{chosen.sam}</span>
            <button onClick={() => { setChosen(null); setPcs([]); setPicked('') }}
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
