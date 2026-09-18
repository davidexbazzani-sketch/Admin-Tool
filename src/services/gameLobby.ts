// ── 4 gewinnt: Lobby, Einladungen & Match-Zustand (über das Netzlaufwerk) ─────
// Es gibt keinen Server/Push — alle Instanzen teilen sich nur das Netzlaufwerk.
// Präsenz ist nach presentationClients.ts modelliert (Heartbeat-Datei je Nutzer).
// Match-Synchronisation läuft rundenbasiert: Es schreibt IMMER nur der Spieler,
// der am Zug ist (das `turn`-Feld ist die natürliche Sperre) — jede Aktion lädt
// zuvor den FRISCHEN Stand. Match-Annahme ist mit einem Re-Read abgesichert.

import { api } from '../electronAPI'
import { emptyBoard, dropPiece, checkWinner, isDraw, type Cell, type Player } from '../games/connectFour'

const ROOT = 'games/connect-four'
export const LOBBY_HEARTBEAT_MS = 10_000
export const LOBBY_ONLINE_WINDOW_MS = 30_000
export const INVITE_TTL_MS = 60_000

// ── Coins ─────────────────────────────────────────────────────────────────────
export const STARTING_COINS = 100     // Startguthaben je Spieler
export const STAKE = 5                // Einsatz je Spieler pro Runde (Gewinner erhält 2×STAKE)

export interface PlayerRef { username: string; displayName: string }
export type Color = 'red' | 'yellow'
export type MatchStatus = 'waiting' | 'active' | 'finished' | 'abandoned'

export interface Match {
  id: string
  createdAt: string
  updatedAt: string
  createdBy: string           // username des Herausforderers
  players: { red: PlayerRef; yellow: PlayerRef }
  board: Cell[]
  turn: Color
  moveSeq: number
  lastMoveBy: string          // username
  winner: null | Color | 'draw'
  winLine?: number[]
  status: MatchStatus
  acceptedAt?: string
  endedBy?: string
  rematchOf?: string
  stake: number               // Einsatz je Spieler (Coins)
  settled?: boolean           // Coins bereits verrechnet?
  settledBy?: string          // Claim-Token des abrechnenden Clients
}

export interface Wallet { username: string; coins: number; updatedAt: string }

export interface LobbyEntry {
  username: string
  displayName: string
  at: string                  // ISO
  status: 'idle' | 'in-match'
  matchId?: string
}
export interface ListedLobby extends LobbyEntry { online: boolean; ageMs: number }

export interface Invite { from: string; fromDisplay: string; matchId: string; at: string }

// ── Helfer ────────────────────────────────────────────────────────────────────
const lc = (s: string): string => (s || '').toLowerCase()
export const sameUser = (a: string, b: string): boolean => lc(a) === lc(b)
function safe(s: string): string { return lc(s).replace(/[^a-z0-9._-]/g, '_') }
function newId(): string { return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` }
const nowIso = (): string => new Date().toISOString()

const lobbyPath = (u: string): string => `${ROOT}/lobby/${safe(u)}.json`
const invitePath = (u: string): string => `${ROOT}/invites/${safe(u)}.json`
const matchPath = (id: string): string => `${ROOT}/matches/${safe(id)}.json`
const walletPath = (u: string): string => `${ROOT}/wallets/${safe(u)}.json`

// ── Wallet (Coins) ────────────────────────────────────────────────────────────
export async function getWallet(username: string): Promise<Wallet> {
  try {
    const w = await api().netReadJson<Wallet>(walletPath(username))
    if (w && typeof w.coins === 'number' && isFinite(w.coins)) return w
  } catch { /* noch keins → Startguthaben */ }
  return { username: lc(username), coins: STARTING_COINS, updatedAt: nowIso() }
}
export async function getCoins(username: string): Promise<number> { return (await getWallet(username)).coins }
async function setCoins(username: string, coins: number): Promise<void> {
  const payload: Wallet = { username: lc(username), coins: Math.max(0, Math.round(coins)), updatedAt: nowIso() }
  try { await api().netWriteJson(walletPath(username), payload) } catch { /* egal */ }
}
async function addCoins(username: string, delta: number): Promise<void> {
  const w = await getWallet(username)
  await setCoins(username, w.coins + delta)
}

// ── Präsenz / Lobby ───────────────────────────────────────────────────────────
export async function writeLobby(me: PlayerRef, status: 'idle' | 'in-match' = 'idle', matchId?: string): Promise<void> {
  const payload: LobbyEntry = { username: lc(me.username), displayName: me.displayName || me.username, at: nowIso(), status, matchId }
  try { await api().netWriteJson(lobbyPath(me.username), payload) } catch { /* offline → egal */ }
}
export async function clearLobby(username: string): Promise<void> {
  try { await api().netDeleteFile(lobbyPath(username)) } catch { /* egal */ }
}
export async function listLobby(): Promise<ListedLobby[]> {
  try {
    const files = await api().netListDir(`${ROOT}/lobby`)
    if (!Array.isArray(files)) return []
    const now = Date.now()
    const out: ListedLobby[] = []
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue
      try {
        const d = await api().netReadJson<LobbyEntry>(`${ROOT}/lobby/${f}`)
        if (!d || !d.username || !d.at) continue
        const ts = new Date(d.at).getTime()
        if (isNaN(ts)) continue
        const ageMs = now - ts
        out.push({ ...d, ageMs, online: ageMs <= LOBBY_ONLINE_WINDOW_MS })
      } catch { /* defekt → überspringen */ }
    }
    out.sort((a, b) => (a.online !== b.online ? (a.online ? -1 : 1) : a.displayName.localeCompare(b.displayName, 'de', { sensitivity: 'base' })))
    return out
  } catch { return [] }
}

// ── Einladungen ─────────────────────────────────────────────────────────────
export async function sendInvite(toUsername: string, inv: Invite): Promise<void> {
  try { await api().netWriteJson(invitePath(toUsername), inv) } catch { /* egal */ }
}
export async function readInvite(meUsername: string): Promise<Invite | null> {
  try {
    const inv = await api().netReadJson<Invite>(invitePath(meUsername))
    if (!inv || !inv.matchId || !inv.at) return null
    if (Date.now() - new Date(inv.at).getTime() > INVITE_TTL_MS) return null   // abgelaufen
    return inv
  } catch { return null }
}
export async function clearInvite(meUsername: string): Promise<void> {
  try { await api().netDeleteFile(invitePath(meUsername)) } catch { /* egal */ }
}

// ── Match ─────────────────────────────────────────────────────────────────────
export async function loadMatch(id: string): Promise<Match | null> {
  try {
    const m = await api().netReadJson<Match>(matchPath(id))
    if (m && m.id && Array.isArray(m.board)) return m
  } catch { /* weg */ }
  return null
}
async function saveMatch(m: Match): Promise<boolean> {
  m.updatedAt = nowIso()
  try { return await api().netWriteJson(matchPath(m.id), m) } catch { return false }
}
export async function deleteMatch(id: string): Promise<void> {
  try { await api().netDeleteFile(matchPath(id)) } catch { /* egal */ }
}

/** Neues Match: Herausforderer = Rot (beginnt), Ziel = Gelb. Schreibt zugleich die Einladung. */
export async function createMatch(challenger: PlayerRef, target: PlayerRef): Promise<Match> {
  const id = newId()
  const m: Match = {
    id, createdAt: nowIso(), updatedAt: nowIso(), createdBy: lc(challenger.username),
    players: { red: challenger, yellow: target },
    board: emptyBoard(), turn: 'red', moveSeq: 0, lastMoveBy: '', winner: null, status: 'waiting', stake: STAKE,
  }
  await saveMatch(m)
  await sendInvite(target.username, { from: lc(challenger.username), fromDisplay: challenger.displayName, matchId: id, at: nowIso() })
  return m
}

/** Revanche: der Gegner beginnt (Farben getauscht), der Klickende lädt ihn ein. */
export async function createRematch(prev: Match, meUsername: string): Promise<Match | null> {
  const meIsRed = sameUser(prev.players.red.username, meUsername)
  const me = meIsRed ? prev.players.red : prev.players.yellow
  const opp = meIsRed ? prev.players.yellow : prev.players.red
  if (!me || !opp) return null
  const id = newId()
  const m: Match = {
    id, createdAt: nowIso(), updatedAt: nowIso(), createdBy: lc(me.username), rematchOf: prev.id,
    players: { red: opp, yellow: me },          // Gegner beginnt
    board: emptyBoard(), turn: 'red', moveSeq: 0, lastMoveBy: '', winner: null, status: 'waiting', stake: STAKE,
  }
  await saveMatch(m)
  await sendInvite(opp.username, { from: lc(me.username), fromDisplay: me.displayName, matchId: id, at: nowIso() })
  return m
}

/** Match annehmen (nur der Eingeladene ≠ Ersteller). Re-Read gegen Doppel-Annahme. */
export async function acceptMatch(id: string, meUsername: string): Promise<Match | null> {
  const m = await loadMatch(id)
  if (!m) return null
  if (m.status === 'active') return m
  if (m.status !== 'waiting') return null
  const isPlayer = sameUser(m.players.red.username, meUsername) || sameUser(m.players.yellow.username, meUsername)
  if (!isPlayer || sameUser(m.createdBy, meUsername)) return null
  const token = nowIso()
  m.status = 'active'; m.acceptedAt = token
  await saveMatch(m)
  const check = await loadMatch(id)                     // Bestätigung: hat mein Write gewonnen?
  if (check && check.status === 'active' && check.acceptedAt === token) {
    await clearInvite(meUsername)
    return check
  }
  return check
}

/**
 * Coins abrechnen, sobald ein Match beendet/aufgegeben ist — genau EINMAL.
 * Claim per `settledBy`-Token + Re-Read verhindert Doppel-Abrechnung, falls beide
 * Clients gleichzeitig abrechnen. Gewinner +Einsatz, Verlierer −Einsatz, Remis 0.
 * Aufgeben: der Verbleibende gewinnt. Nur der abrechnende Client schreibt die
 * beiden Wallets (kein paralleler Schreiber je Wallet).
 */
export async function settleMatch(matchId: string): Promise<Match | null> {
  const m = await loadMatch(matchId)
  if (!m) return null
  if (m.settled) return m
  if (m.status !== 'finished' && m.status !== 'abandoned') return m
  const token = `${nowIso()}#${Math.random().toString(36).slice(2, 8)}`
  m.settled = true; m.settledBy = token
  await saveMatch(m)
  const check = await loadMatch(matchId)
  if (!check || check.settledBy !== token) return check   // anderer Client hat abgerechnet
  let winner: Color | null = null
  if (check.status === 'abandoned') {
    const quitter = check.endedBy || ''
    winner = sameUser(check.players.red.username, quitter) ? 'yellow'
      : sameUser(check.players.yellow.username, quitter) ? 'red' : null
  } else if (check.winner === 'red' || check.winner === 'yellow') {
    winner = check.winner
  }
  if (winner) {
    const loser: Color = winner === 'red' ? 'yellow' : 'red'
    const s = check.stake || STAKE
    await addCoins(check.players[winner].username, s)
    await addCoins(check.players[loser].username, -s)
  }
  return check
}

export interface MoveResult { ok: boolean; match?: Match; reason?: string }

/** Zug ausführen — lädt frisch, prüft „am Zug", legt Stein, wertet Sieg/Unentschieden aus. */
export async function applyMove(id: string, meUsername: string, col: number): Promise<MoveResult> {
  const m = await loadMatch(id)
  if (!m) return { ok: false, reason: 'Match nicht gefunden' }
  if (m.status !== 'active') return { ok: false, match: m, reason: 'Match nicht aktiv' }
  const myColor: Color | null =
    sameUser(m.players.red.username, meUsername) ? 'red'
    : sameUser(m.players.yellow.username, meUsername) ? 'yellow' : null
  if (!myColor) return { ok: false, match: m, reason: 'Kein Spieler dieses Matches' }
  if (m.turn !== myColor) return { ok: false, match: m, reason: 'Nicht am Zug' }
  const player: Player = myColor === 'red' ? 1 : 2
  const dropped = dropPiece(m.board, col, player)
  if (!dropped) return { ok: false, match: m, reason: 'Spalte voll' }
  m.board = dropped.board
  m.moveSeq += 1
  m.lastMoveBy = lc(meUsername)
  const win = checkWinner(m.board)
  if (win) { m.winner = win.player === 1 ? 'red' : 'yellow'; m.winLine = win.line; m.status = 'finished' }
  else if (isDraw(m.board)) { m.winner = 'draw'; m.status = 'finished' }
  else { m.turn = myColor === 'red' ? 'yellow' : 'red' }
  await saveMatch(m)
  if (m.status === 'finished') { const s = await settleMatch(m.id); return { ok: true, match: s || m } }
  return { ok: true, match: m }
}

/** Partie verlassen/aufgeben. Läuft sie noch, gewinnt der Gegner (abandoned). */
export async function leaveMatch(id: string, meUsername: string): Promise<void> {
  const m = await loadMatch(id)
  if (!m) return
  if (m.status === 'waiting' || m.status === 'active') {
    m.status = 'abandoned'; m.endedBy = lc(meUsername)
    await saveMatch(m)
    // Aufgeben nur abrechnen, wenn schon gespielt wurde (nicht bei „waiting" ohne Annahme).
    if (m.acceptedAt || m.moveSeq > 0) await settleMatch(m.id)
  }
}

/** Farbe des Nutzers im Match (oder null). */
export function colorOf(m: Match, username: string): Color | null {
  if (sameUser(m.players.red.username, username)) return 'red'
  if (sameUser(m.players.yellow.username, username)) return 'yellow'
  return null
}

/** Laufendes/wartendes Match des Nutzers finden (zum Wiedereinstieg beim Öffnen). */
export async function findMyActiveMatch(username: string): Promise<Match | null> {
  try {
    const files = await api().netListDir(`${ROOT}/matches`)
    if (!Array.isArray(files)) return null
    let best: Match | null = null
    for (const f of files) {
      if (!f.toLowerCase().endsWith('.json')) continue
      const m = await loadMatch(f.replace(/\.json$/i, ''))
      if (!m || !colorOf(m, username)) continue
      if (m.status !== 'active' && m.status !== 'waiting') continue
      if (Date.now() - new Date(m.updatedAt).getTime() > 30 * 60 * 1000) continue   // >30 min alt → ignorieren
      if (!best || m.updatedAt > best.updatedAt) best = m
    }
    return best
  } catch { return null }
}
