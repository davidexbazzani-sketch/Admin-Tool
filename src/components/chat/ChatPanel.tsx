// ── Chat – Fenster oben rechts (ein-/ausklappbar) ─────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircle, X, ChevronUp, ChevronDown, ArrowLeft, Send, Search, Loader2, Check, CheckCheck, AlertTriangle, Film, Play } from 'lucide-react'
import { useChatStore, anzahlUngelesen } from '../../store/chatStore'
import {
  ladeGespraech, sende, markiereGelesen, ungelesenBeiPartner, sicher, MAX_ZEICHEN, oeffneChatDatei, groesseText,
  type ChatIch, type ChatNachricht, type ChatNutzer, type ChatDatei,
} from '../../services/chat'
import { CHAT_BOTS, botVon, istBot } from '../../services/chatBots'

const initialen = (n: string) => n.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'

function seit(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 60) return `vor ${Math.max(m, 1)} Min`
  const h = Math.round(m / 60)
  if (h < 24) return `vor ${h} Std`
  const d = Math.round(h / 24)
  return d === 1 ? 'gestern' : `vor ${d} Tagen`
}

function statusText(n: ChatNutzer | undefined, botName?: string): { text: string; farbe: string } {
  const b = botVon(botName)
  if (b) return { text: b.status, farbe: 'bg-sky-500' }
  if (!n) return { text: 'offline', farbe: 'bg-zinc-500' }
  if (n.online && n.inaktiv) return { text: `inaktiv seit ${seit(Date.now() - new Date(n.aktivAt).getTime()).replace('vor ', '')}`, farbe: 'bg-amber-400' }
  if (n.online) return { text: 'online', farbe: 'bg-emerald-400' }
  return { text: `zuletzt ${seit(n.ageMs)}`, farbe: 'bg-zinc-500' }
}

function Avatar({ name, farbe, gross = false }: { name: string; farbe: string; gross?: boolean }) {
  return (
    <span className={`relative shrink-0 ${gross ? 'w-9 h-9 text-xs' : 'w-8 h-8 text-[11px]'} rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center`}>
      {initialen(name)}
      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${farbe}`} />
    </span>
  )
}

export default function ChatPanel({ ich, nachSenden }: { ich: ChatIch; nachSenden: () => void }) {
  const offen = useChatStore(s => s.offen)
  const eingeklappt = useChatStore(s => s.eingeklappt)
  const setEingeklappt = useChatStore(s => s.setEingeklappt)
  const schliesse = useChatStore(s => s.schliesse)
  const partner = useChatStore(s => s.partner)
  const setPartner = useChatStore(s => s.setPartner)
  const nutzer = useChatStore(s => s.nutzer)
  const nutzerGeladen = useChatStore(s => s.nutzerGeladen)
  const ungelesen = useChatStore(s => s.ungelesen)
  const namen = useChatStore(s => s.namen)

  const andere = useMemo(() => nutzer.filter(n => sicher(n.username) !== sicher(ich.username)), [nutzer, ich.username])
  const online = andere.filter(n => n.online).length
  const summeUngelesen = anzahlUngelesen(ungelesen)
  const partnerNutzer = partner ? andere.find(n => sicher(n.username) === sicher(partner)) : undefined
  const partnerName = !partner ? '' : botVon(partner) ? botVon(partner)!.displayName
    : (partnerNutzer?.displayName || namen[sicher(partner)] || partner)

  if (!offen) return null
  return (
    <div className={`fixed top-11 right-3 z-[85] w-[372px] rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden ${eingeklappt ? '' : 'h-[min(560px,calc(100vh-64px))]'}`}>
      {/* Kopf — Klick klappt ein/aus */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-sidebar cursor-pointer select-none" onClick={() => setEingeklappt(!eingeklappt)}>
        <MessageCircle size={15} className="text-primary" />
        <span className="text-sm font-semibold text-foreground">Chat</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{online} online</span>
        {summeUngelesen > 0 && <span className="text-[10px] px-1.5 rounded-full bg-red-500 text-white font-semibold">{summeUngelesen}</span>}
        <button onClick={e => { e.stopPropagation(); setEingeklappt(!eingeklappt) }} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40" title={eingeklappt ? 'Ausklappen' : 'Einklappen'}>
          {eingeklappt ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button onClick={e => { e.stopPropagation(); schliesse() }} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40" title="Schließen"><X size={14} /></button>
      </div>
      {!eingeklappt && (
        partner
          ? <Gespraech key={partner} ich={ich} partner={partner} partnerName={partnerName} partnerNutzer={partnerNutzer} onZurueck={() => setPartner(null)} nachSenden={nachSenden} />
          : <Kontakte andere={andere} geladen={nutzerGeladen} ungelesen={ungelesen} namen={namen} onWaehle={setPartner} />
      )}
    </div>
  )
}

function Kontakte({ andere, geladen, ungelesen, namen, onWaehle }: {
  andere: ChatNutzer[]; geladen: boolean; ungelesen: Record<string, string[]>; namen: Record<string, string>; onWaehle: (u: string) => void
}) {
  const [suche, setSuche] = useState('')
  // Absender mit ungelesenen Nachrichten, die (noch) nicht in der Anwesenheitsliste stehen
  // (der Drucker-Absender hat eine feste Zeile ganz oben)
  const zusaetzlich = Object.keys(ungelesen).filter(u => ungelesen[u].length && !istBot(u) && !andere.some(n => sicher(n.username) === u))
  const q = suche.trim().toLowerCase()
  const liste = andere.filter(n => !q || n.displayName.toLowerCase().includes(q) || n.username.toLowerCase().includes(q))
  const zeile = (u: string, name: string, n: ChatNutzer | undefined) => {
    const st = statusText(n, u)
    const anz = ungelesen[sicher(u)]?.length || 0
    return (
      <button key={u} onClick={() => onWaehle(u)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent/30 text-left">
        <Avatar name={name} farbe={st.farbe} />
        <span className="flex-1 min-w-0">
          <span className={`block text-xs truncate ${anz ? 'font-semibold text-foreground' : 'text-foreground'}`}>{name}</span>
          <span className="block text-[10px] text-muted-foreground truncate">{st.text}</span>
        </span>
        {anz > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">{anz}</span>}
      </button>
    )
  }
  const on = liste.filter(n => n.online), off = liste.filter(n => !n.online)
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Person suchen …" className="w-full pl-6 pr-2 py-1 rounded-md bg-background border border-border text-xs" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {CHAT_BOTS.filter(b => !q || b.displayName.toLowerCase().includes(q)).map(b => zeile(b.username, b.displayName, undefined))}
        {zusaetzlich.map(u => zeile(u, namen[u] || u, undefined))}
        <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Gerade im Tool ({on.length})</p>
        {!geladen ? <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] text-muted-foreground"><Loader2 size={11} className="animate-spin" />wird geladen …</p>
          : on.length ? on.map(n => zeile(n.username, n.displayName, n)) : andere.length > 0 && <p className="px-3 py-1 text-[11px] text-muted-foreground">Gerade niemand außer dir.</p>}
        {off.length > 0 && <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Offline</p>}
        {off.map(n => zeile(n.username, n.displayName, n))}
        {geladen && !andere.length && <p className="px-3 py-4 text-[11px] text-muted-foreground">Noch niemand gefunden — die Liste füllt sich, sobald andere das Tool (in dieser Version) öffnen.</p>}
      </div>
    </div>
  )
}

/** Angehängtes Video: Name, Größe, „Öffnen“ (Standardprogramm, direkt vom Netzlaufwerk) */
function DateiAnhang({ datei, meins }: { datei: ChatDatei; meins: boolean }) {
  const [laedt, setLaedt] = useState(false)
  const [fehler, setFehler] = useState('')
  async function oeffne() {
    setLaedt(true); setFehler('')
    const f = await oeffneChatDatei(datei).catch(e => (e as Error).message)
    setLaedt(false)
    if (f) setFehler(f)
  }
  return (
    <span className={`mt-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5 ${meins ? 'bg-black/15' : 'bg-background/60 border border-border'}`} data-chat-datei>
      <Film size={16} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium" title={datei.name}>{datei.name}</span>
        <span className="block text-[10px] opacity-70">{typeof datei.bytes === 'number' && datei.bytes > 0 ? groesseText(datei.bytes) : 'Video'}{fehler && <span className="text-red-300"> · {fehler}</span>}</span>
      </span>
      <button onClick={() => void oeffne()} disabled={laedt} className={`shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${meins ? 'bg-white/20 hover:bg-white/30' : 'bg-primary text-primary-foreground hover:opacity-90'} disabled:opacity-50`} title="Video öffnen">
        {laedt ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}Öffnen
      </button>
    </span>
  )
}

const uhrzeit = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
function tagLabel(iso: string): string {
  const d = new Date(iso), h = new Date(), g = new Date(); g.setDate(h.getDate() - 1)
  if (d.toDateString() === h.toDateString()) return 'Heute'
  if (d.toDateString() === g.toDateString()) return 'Gestern'
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
}

function Gespraech({ ich, partner, partnerName, partnerNutzer, onZurueck, nachSenden }: {
  ich: ChatIch; partner: string; partnerName: string; partnerNutzer: ChatNutzer | undefined; onZurueck: () => void; nachSenden: () => void
}) {
  const [nachrichten, setNachrichten] = useState<(ChatNachricht & { fehler?: boolean; sendet?: boolean })[]>([])
  const [laedt, setLaedt] = useState(true)
  const [text, setText] = useState('')
  const [fehler, setFehler] = useState('')
  const [beiPartnerUngelesen, setBeiPartnerUngelesen] = useState<Set<string>>(new Set())
  const bekannt = useRef(new Set<string>())
  const unten = useRef<HTMLDivElement>(null)
  const eingabe = useRef<HTMLTextAreaElement>(null)
  const ungelesenVonPartner = useChatStore(s => s.ungelesen[sicher(partner)])
  const setUngelesen = useChatStore(s => s.setUngelesen)

  const laden = useCallback(async () => {
    const neu = await ladeGespraech(ich.username, partner, bekannt.current)
    if (neu.length) {
      neu.forEach(n => bekannt.current.add(n.id))
      setNachrichten(alt => [...alt.filter(a => !neu.some(n => n.id === a.id)), ...neu].sort((a, b) => a.id.localeCompare(b.id)))
    }
    setLaedt(false)
  }, [ich.username, partner])

  // Gelesen-Status meiner Nachrichten beim Partner
  const lesestatus = useCallback(async () => { setBeiPartnerUngelesen(await ungelesenBeiPartner(partner)) }, [partner])

  useEffect(() => {
    void laden(); void lesestatus()
    const t = setInterval(() => { if (document.hasFocus()) { void laden(); void lesestatus() } }, 8000)
    return () => clearInterval(t)
  }, [laden, lesestatus])

  // Neue Nachricht vom Partner (vom Hintergrund-Takt gemeldet) → nachladen und als gelesen markieren
  useEffect(() => {
    if (!ungelesenVonPartner?.length) return
    void (async () => {
      await laden()
      if (!document.hasFocus()) return
      await markiereGelesen(ich.username, ungelesenVonPartner)
      const st = useChatStore.getState().ungelesen
      setUngelesen({ ...st, [sicher(partner)]: [] })
    })()
  }, [ungelesenVonPartner, laden, ich.username, partner, setUngelesen])

  useEffect(() => { unten.current?.scrollIntoView({ block: 'end' }) }, [nachrichten.length])
  useEffect(() => { eingabe.current?.focus() }, [])

  async function abschicken() {
    const t = text
    if (!t.trim()) return
    setText(''); setFehler('')
    const tempId = `~${Date.now()}`
    const vorlaeufig = { id: tempId, from: ich.username.toLowerCase(), fromDisplay: ich.displayName, to: partner, toDisplay: partnerName, text: t, at: new Date().toISOString(), sendet: true }
    setNachrichten(n => [...n, vorlaeufig])
    const n = await sende(ich, { username: partner, displayName: partnerName }, t)
    if (n) {
      bekannt.current.add(n.id)
      setNachrichten(alt => alt.map(a => a.id === tempId ? n : a))
      setBeiPartnerUngelesen(s => new Set([...s, n.id]))
      nachSenden()
    } else {
      setNachrichten(alt => alt.map(a => a.id === tempId ? { ...a, sendet: false, fehler: true } : a))
      setFehler('Nicht gesendet — Netzlaufwerk nicht erreichbar? Text ist wieder im Eingabefeld.')
      setText(t)
    }
  }

  const botInfo = botVon(partner)
  const bot = !!botInfo
  const st = statusText(partnerNutzer, partner)
  let letzterTag = ''
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border">
        <button onClick={onZurueck} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/40" title="Zurück zur Liste"><ArrowLeft size={14} /></button>
        <Avatar name={partnerName} farbe={st.farbe} gross />
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-foreground truncate">{partnerName}</span>
          <span className="block text-[10px] text-muted-foreground">{st.text}</span>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {laedt && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 size={12} className="animate-spin" />Lade Verlauf …</p>}
        {!laedt && !nachrichten.length && <p className="text-[11px] text-muted-foreground text-center py-6">{botInfo ? botInfo.leer : `Noch keine Nachrichten. Schreib ${partnerName.split(/[\s,]+/)[0]} etwas!`}</p>}
        {nachrichten.map(n => {
          const meins = sicher(n.from) === sicher(ich.username)
          const tag = tagLabel(n.at)
          const trenner = tag !== letzterTag
          letzterTag = tag
          return (
            <div key={n.id}>
              {trenner && <p className="text-center text-[10px] text-muted-foreground py-1.5">{tag}</p>}
              <div className={`flex ${meins ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs whitespace-pre-wrap break-words ${meins
                  ? `${n.fehler ? 'bg-red-500/30' : 'bg-primary'} text-primary-foreground rounded-br-sm` : 'bg-accent text-foreground rounded-bl-sm'}`}>
                  {n.text}
                  {n.datei && typeof n.datei.rel === 'string' && typeof n.datei.name === 'string' && <DateiAnhang datei={n.datei} meins={meins} />}
                  <span className={`flex items-center justify-end gap-0.5 mt-0.5 text-[9px] ${meins ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {uhrzeit(n.at)}
                    {meins && (n.fehler ? <AlertTriangle size={10} /> : n.sendet ? <Loader2 size={10} className="animate-spin" />
                      : beiPartnerUngelesen.has(n.id) ? <Check size={11} /> : <CheckCheck size={11} />)}
                  </span>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={unten} />
      </div>
      {botInfo && <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border">{botInfo.fuss}</p>}
      {!bot && !partnerNutzer?.online && <p className="px-3 py-1 text-[10px] text-muted-foreground border-t border-border">{partnerName} ist gerade nicht im Tool — die Nachricht kommt beim nächsten Öffnen an.</p>}
      {fehler && <p className="px-3 py-1 text-[10px] text-red-300">{fehler}</p>}
      {!bot && <div className="flex items-end gap-2 px-3 py-2 border-t border-border">
        <textarea ref={eingabe} value={text} onChange={e => setText(e.target.value.slice(0, MAX_ZEICHEN))} rows={1}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void abschicken() } }}
          placeholder="Nachricht schreiben …" title="Enter = senden · Umschalt+Enter = neue Zeile"
          className="flex-1 max-h-28 min-h-[34px] resize-none px-2.5 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          style={{ height: Math.min(112, 34 + (text.split('\n').length - 1) * 16) }} />
        <button onClick={() => void abschicken()} disabled={!text.trim()} title="Senden"
          className="h-[34px] w-[34px] shrink-0 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:opacity-90 disabled:opacity-40"><Send size={14} /></button>
      </div>}
      {text.length > MAX_ZEICHEN - 200 && <p className="px-3 pb-1 text-[10px] text-amber-300 text-right">{text.length}/{MAX_ZEICHEN}</p>}
    </div>
  )
}
