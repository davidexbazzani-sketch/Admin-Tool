// ── Globale 4-gewinnt-Herausforderung (überall im Tool) ──────────────────────
// Läuft im Hintergrund (wie ServerMonitorController) und pollt die eigene
// Einladungsdatei. Trifft eine Einladung ein UND der Spiele-Bildschirm ist NICHT
// offen, erscheint unten rechts ein Popup „X fordert dich heraus → Annehmen".
// Ist der Spiele-Bildschirm offen, übernimmt dieser die Anzeige.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Swords, X, Loader } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import { readInvite, clearInvite, acceptMatch, getCoins, STAKE, type Invite } from '../../services/gameLobby'

const POLL_MS = 12_000

export default function GameInviteController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const screen = useAppStore(s => s.screen)
  const setScreen = useAppStore(s => s.setScreen)

  const [invite, setInvite] = useState<Invite | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const dismissed = useRef<Set<string>>(new Set())

  const tick = useCallback(async () => {
    if (!username) return
    if (screen === 'games') { setInvite(null); return }   // der Screen übernimmt
    const inv = await readInvite(username)
    if (inv && !dismissed.current.has(inv.matchId)) setInvite(inv)
    else if (!inv) setInvite(null)
  }, [username, screen])

  useEffect(() => {
    if (!username) return
    void tick()
    const t = setInterval(() => { void tick() }, POLL_MS)
    const onFocus = () => { void tick() }
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [tick, username])

  const accept = useCallback(async () => {
    if (!invite || busy) return
    setBusy(true); setErr('')
    try {
      if ((await getCoins(username)) < STAKE) { setErr(`Nicht genug Coins (mind. ${STAKE}).`); return }
      dismissed.current.add(invite.matchId)
      await acceptMatch(invite.matchId, username)
      setInvite(null)
      setScreen('games')
    } finally { setBusy(false) }
  }, [invite, busy, username, setScreen])

  const decline = useCallback(async () => {
    if (!invite) return
    dismissed.current.add(invite.matchId)
    await clearInvite(username)
    setInvite(null)
  }, [invite, username])

  if (!invite || screen === 'games') return null

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-80 rounded-xl border border-emerald-500/50 bg-card shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-emerald-500/10 rounded-t-xl">
        <Swords className="text-emerald-400" size={18} />
        <span className="text-sm font-semibold text-foreground flex-1">4 gewinnt</span>
        <button onClick={decline} className="p-0.5 rounded text-muted-foreground hover:text-foreground"><X size={15} /></button>
      </div>
      <div className="px-4 py-3">
        <p className="text-sm text-foreground"><span className="font-semibold">{invite.fromDisplay}</span> fordert dich zu einer Runde heraus (Einsatz {STAKE} Coins).</p>
        {err && <p className="mt-1.5 text-[11px] text-red-400">{err}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button onClick={accept} disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
            {busy ? <Loader size={14} className="animate-spin" /> : <Swords size={14} />}Annehmen
          </button>
          <button onClick={decline} disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:text-foreground">Ablehnen</button>
        </div>
      </div>
    </div>
  )
}
