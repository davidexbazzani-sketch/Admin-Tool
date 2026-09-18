// ── Sonstiges → Spiele: 4 gewinnt live gegen andere Tool-Nutzer ──────────────
// Offene Lobby (Online-Nutzer sehen + herausfordern) + rundenbasiertes Match.
// Synchronisation ausschließlich über das Netzlaufwerk (Polling), siehe gameLobby.ts.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Gamepad2, Swords, Loader, Trophy, X, RefreshCw, LogOut, Users, Handshake, Coins } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import {
  writeLobby, clearLobby, listLobby, readInvite, clearInvite,
  createMatch, acceptMatch, applyMove, leaveMatch, createRematch, loadMatch, colorOf, findMyActiveMatch,
  settleMatch, getCoins, sameUser, LOBBY_HEARTBEAT_MS, STAKE,
  type Match, type ListedLobby, type Invite, type PlayerRef, type Color,
} from '../services/gameLobby'
import { COLS, ROWS, idx } from '../games/connectFour'

const DISC = (c: Color): string => (c === 'red' ? 'bg-red-500' : 'bg-amber-400')
const COLOR_LABEL = (c: Color): string => (c === 'red' ? 'Rot' : 'Gelb')

export default function Games() {
  const user = useAuthStore(s => s.session?.user)
  const meRef = useRef<PlayerRef>({ username: user?.username || '', displayName: user?.displayName || user?.username || '' })
  meRef.current = { username: user?.username || '', displayName: user?.displayName || user?.username || '' }
  const meName = meRef.current.username

  const [lobby, setLobby] = useState<ListedLobby[]>([])
  const [invite, setInvite] = useState<Invite | null>(null)
  const [match, setMatch] = useState<Match | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [coins, setCoins] = useState<number | null>(null)
  const matchId = match?.id ?? null
  const inMatch = !!match && (match.status === 'active' || match.status === 'waiting')

  const refreshCoins = useCallback(() => {
    if (meName) void getCoins(meName).then(setCoins)
  }, [meName])

  // ── Heartbeat: solange der Bildschirm offen ist, bin ich in der Lobby ──
  useEffect(() => {
    if (!meName) return
    void writeLobby(meRef.current, 'idle')
    const t = setInterval(() => { void writeLobby(meRef.current, match ? 'in-match' : 'idle', match?.id) }, LOBBY_HEARTBEAT_MS)
    return () => { clearInterval(t); void clearLobby(meName) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meName])

  // ── Wiedereinstieg: laufendes Match beim Öffnen finden + Guthaben laden ──
  useEffect(() => {
    if (!meName) return
    let cancelled = false
    refreshCoins()
    void findMyActiveMatch(meName).then(m => { if (!cancelled && m) setMatch(m) })
    return () => { cancelled = true }
  }, [meName, refreshCoins])

  // ── Lobby-Poll (nur ohne aktives Match) ──
  useEffect(() => {
    if (!meName || inMatch) return
    let cancelled = false
    const tick = async () => {
      const [l, inv] = await Promise.all([listLobby(), readInvite(meName)])
      if (cancelled) return
      setLobby(l)
      setInvite(inv)
      refreshCoins()
    }
    void tick()
    const t = setInterval(tick, 5000)
    return () => { cancelled = true; clearInterval(t) }
  }, [meName, inMatch, refreshCoins])

  // ── Match-Poll (alle 2 s, solange ich in einem Match bin) ──
  useEffect(() => {
    if (!matchId || !inMatch) return
    let cancelled = false
    const t = setInterval(async () => {
      let m = await loadMatch(matchId)
      // Fällt das Match beendet/aufgegeben zurück und ist noch nicht abgerechnet,
      // rechnet auch dieser Client ab (idempotent per Claim) → Coins bleiben konsistent.
      if (m && (m.status === 'finished' || m.status === 'abandoned') && !m.settled) {
        await settleMatch(m.id)
        m = (await loadMatch(matchId)) || m
        refreshCoins()
      }
      if (!cancelled && m) setMatch(m)
    }, 2000)
    return () => { cancelled = true; clearInterval(t) }
  }, [matchId, inMatch, refreshCoins])

  const myColor: Color | null = match ? colorOf(match, meName) : null
  const isMyTurn = !!match && match.status === 'active' && myColor != null && match.turn === myColor

  // ── Aktionen ────────────────────────────────────────────────────────────────
  const challenge = useCallback(async (target: PlayerRef) => {
    if (busy || !meName) return
    if ((coins ?? 0) < STAKE) { setMsg(`Nicht genug Coins – du brauchst mindestens ${STAKE}.`); return }
    setBusy(true); setMsg('')
    try {
      const m = await createMatch(meRef.current, target)
      setMatch(m)
    } catch { setMsg('Herausforderung fehlgeschlagen.') }
    finally { setBusy(false) }
  }, [busy, meName, coins])

  const accept = useCallback(async (inv: Invite) => {
    if (busy || !meName) return
    if ((coins ?? 0) < STAKE) { setMsg(`Nicht genug Coins zum Annehmen (mind. ${STAKE}).`); return }
    setBusy(true); setMsg('')
    try {
      const m = await acceptMatch(inv.matchId, meName)
      setInvite(null)
      if (m) setMatch(m)
      else setMsg('Match nicht mehr verfügbar.')
    } catch { setMsg('Annehmen fehlgeschlagen.') }
    finally { setBusy(false) }
  }, [busy, meName, coins])

  const decline = useCallback(async () => {
    if (!meName) return
    await clearInvite(meName); setInvite(null)
  }, [meName])

  const drop = useCallback(async (col: number) => {
    if (!matchId || !isMyTurn || busy) return
    setBusy(true)
    try {
      const r = await applyMove(matchId, meName, col)
      if (r.match) setMatch(r.match)
      if (r.match && r.match.status === 'finished') refreshCoins()
      if (!r.ok && r.reason) setMsg(r.reason)
    } finally { setBusy(false) }
  }, [matchId, isMyTurn, busy, meName, refreshCoins])

  const leave = useCallback(async () => {
    if (!matchId) { setMatch(null); return }
    await leaveMatch(matchId, meName)
    setMatch(null)
    refreshCoins()
    void writeLobby(meRef.current, 'idle')
  }, [matchId, meName, refreshCoins])

  const rematch = useCallback(async () => {
    if (!match || busy) return
    setBusy(true); setMsg('')
    try {
      const m = await createRematch(match, meName)
      if (m) setMatch(m)
    } finally { setBusy(false) }
  }, [match, busy, meName])

  if (!meName) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Bitte anmelden.</div>
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <Gamepad2 size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Pausenraum — 4 gewinnt</h1>
        <span className="text-xs text-muted-foreground">Live gegen andere Tool-Nutzer</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-sm font-semibold tabular-nums" title={`Einsatz pro Runde: ${STAKE} Coins · Gewinner erhält ${STAKE * 2}`}>
            <Coins size={14} />{coins ?? '…'} Coins
          </span>
          {match && (
            <button onClick={leave} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">
              <LogOut size={13} />Zur Lobby
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div className="shrink-0 mx-4 mt-2 px-3 py-2 text-xs rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 flex items-center gap-2">
          <span className="flex-1">{msg}</span>
          <button onClick={() => setMsg('')} className="text-blue-300/70 hover:text-blue-200 text-sm leading-none">×</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {match ? (
          <MatchView match={match} me={meName} myColor={myColor} isMyTurn={isMyTurn} busy={busy}
            onDrop={drop} onLeave={leave} onRematch={rematch} />
        ) : (
          <LobbyView lobby={lobby} me={meName} invite={invite} busy={busy}
            onChallenge={challenge} onAccept={accept} onDecline={decline} />
        )}
      </div>
    </div>
  )
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function LobbyView({ lobby, me, invite, busy, onChallenge, onAccept, onDecline }: {
  lobby: ListedLobby[]; me: string; invite: Invite | null; busy: boolean
  onChallenge: (t: PlayerRef) => void; onAccept: (i: Invite) => void; onDecline: () => void
}) {
  const others = lobby.filter(p => !sameUser(p.username, me))
  return (
    <div className="max-w-xl mx-auto space-y-4">
      {invite && (
        <div className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 p-4 flex items-center gap-3">
          <Swords className="text-emerald-400 shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">{invite.fromDisplay} fordert dich zu 4 gewinnt heraus</p>
            <p className="text-[11px] text-muted-foreground">Nimm an, um zu spielen.</p>
          </div>
          <button onClick={() => onAccept(invite)} disabled={busy}
            className="px-3 py-1.5 text-xs rounded-md font-semibold bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">Annehmen</button>
          <button onClick={onDecline} disabled={busy}
            className="px-2 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground"><X size={13} /></button>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Users size={15} className="text-primary" />
          <h2 className="text-sm font-semibold text-foreground">In der Lobby</h2>
          <span className="text-xs text-muted-foreground">{others.filter(p => p.online).length} online</span>
        </div>
        {others.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Niemand sonst ist gerade in der Lobby.<br />
            <span className="text-xs opacity-70">Sobald ein anderer Tool-Nutzer den „Pausenraum" öffnet, erscheint er hier.</span>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {others.map(p => (
              <li key={p.username} className="px-4 py-2.5 flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${p.online ? 'bg-emerald-400' : 'bg-muted-foreground/40'}`} />
                <span className="flex-1 text-sm text-foreground truncate">{p.displayName}
                  {p.status === 'in-match' && <span className="ml-2 text-[10px] text-amber-400">im Spiel</span>}
                </span>
                <button onClick={() => onChallenge({ username: p.username, displayName: p.displayName })}
                  disabled={busy || !p.online || p.status === 'in-match'}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40">
                  <Swords size={13} />Herausfordern
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground text-center inline-flex items-center justify-center gap-1 w-full">
        <Coins size={11} className="text-amber-400" />Einsatz {STAKE} Coins pro Spieler · der Gewinner erhält {STAKE * 2}. · Züge erscheinen nach 1–2 s.
      </p>
    </div>
  )
}

// ── Match / Brett ───────────────────────────────────────────────────────────
function MatchView({ match, me, myColor, isMyTurn, busy, onDrop, onLeave, onRematch }: {
  match: Match; me: string; myColor: Color | null; isMyTurn: boolean; busy: boolean
  onDrop: (col: number) => void; onLeave: () => void; onRematch: () => void
}) {
  const win = new Set(match.winLine ?? [])
  const oppColor: Color = myColor === 'red' ? 'yellow' : 'red'
  const oppName = match.players[oppColor]?.displayName || 'Gegner'
  const stake = match.stake || STAKE
  const gain = (n: number): string => (n > 0 ? `+${n}` : `${n}`)

  let status: ReactNode
  if (match.status === 'waiting') {
    status = <span className="inline-flex items-center gap-1.5 text-amber-400"><Loader size={13} className="animate-spin" />Warte auf Annahme durch {match.players.yellow.displayName}…</span>
  } else if (match.status === 'active') {
    status = isMyTurn
      ? <span className="text-emerald-400 font-semibold">Du bist am Zug</span>
      : <span className="text-muted-foreground">{oppName} ist am Zug…</span>
  } else if (match.status === 'abandoned') {
    const iQuit = match.endedBy && sameUser(match.endedBy, me)
    status = iQuit
      ? <span className="text-muted-foreground">Du hast aufgegeben. <span className="text-red-400 font-semibold">({gain(-stake)} Coins)</span></span>
      : <span className="text-emerald-400 font-semibold">{oppName} hat aufgegeben – du gewinnst! ({gain(stake)} Coins)</span>
  } else if (match.winner === 'draw') {
    status = <span className="text-foreground font-semibold">Unentschieden. <span className="text-muted-foreground">(±0 Coins)</span></span>
  } else {
    const iWon = match.winner === myColor
    status = <span className={`inline-flex items-center gap-1.5 font-semibold ${iWon ? 'text-emerald-400' : 'text-red-400'}`}><Trophy size={14} />{iWon ? `Du hast gewonnen! (${gain(stake)} Coins)` : `${oppName} hat gewonnen. (${gain(-stake)} Coins)`}</span>
  }

  const finished = match.status === 'finished' || match.status === 'abandoned'

  return (
    <div className="max-w-md mx-auto space-y-3">
      {/* Spieler-Kopf */}
      <div className="flex items-center justify-between gap-3 text-sm">
        <PlayerChip color="red" name={match.players.red.displayName} isMe={sameUser(match.players.red.username, me)} turn={match.status === 'active' && match.turn === 'red'} />
        <span className="text-xs text-muted-foreground">vs</span>
        <PlayerChip color="yellow" name={match.players.yellow.displayName} isMe={sameUser(match.players.yellow.username, me)} turn={match.status === 'active' && match.turn === 'yellow'} />
      </div>

      <div className="text-center text-sm h-5">{status}</div>
      <div className="text-center text-[11px] text-amber-300/70 inline-flex items-center justify-center gap-1 w-full"><Coins size={11} />Einsatz {stake} · Gewinner erhält {stake * 2} Coins</div>

      {/* Brett */}
      <div className="rounded-xl bg-blue-700/80 p-2 shadow-inner select-none">
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: COLS }, (_, c) => {
            const colFull = match.board[idx(0, c)] !== 0
            const clickable = isMyTurn && !colFull && !busy
            return (
              <button key={c} onClick={() => onDrop(c)} disabled={!clickable}
                className={`flex flex-col gap-1.5 rounded-md p-0.5 ${clickable ? 'hover:bg-white/10 cursor-pointer' : 'cursor-default'}`}
                title={clickable ? `Spalte ${c + 1}` : undefined}>
                {Array.from({ length: ROWS }, (_, r) => {
                  const v = match.board[idx(r, c)]
                  const isWin = win.has(idx(r, c))
                  return (
                    <span key={r}
                      className={`aspect-square w-full rounded-full border ${v === 0 ? 'bg-slate-900/60 border-white/10'
                        : v === 1 ? `${DISC('red')} border-red-300` : `${DISC('yellow')} border-amber-200`} ${isWin ? 'ring-2 ring-white shadow-[0_0_10px_rgba(255,255,255,0.7)]' : ''}`} />
                  )
                })}
              </button>
            )
          })}
        </div>
      </div>

      {/* Aktionen */}
      <div className="flex items-center justify-center gap-2">
        {finished && (
          <button onClick={onRematch} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <RefreshCw size={14} />Revanche
          </button>
        )}
        <button onClick={onLeave}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent">
          {finished ? <><Handshake size={13} />Zurück zur Lobby</> : <><LogOut size={13} />Aufgeben</>}
        </button>
      </div>
    </div>
  )
}

function PlayerChip({ color, name, isMe, turn }: { color: Color; name: string; isMe: boolean; turn: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${turn ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-border bg-card'} min-w-0`}>
      <span className={`w-3.5 h-3.5 rounded-full shrink-0 ${DISC(color)}`} />
      <span className="text-sm text-foreground truncate">{name}{isMe && <span className="text-[10px] text-muted-foreground"> (du)</span>}</span>
      <span className="text-[10px] text-muted-foreground shrink-0">{COLOR_LABEL(color)}</span>
    </div>
  )
}
