// ── Chat-Knopf in der Titelleiste (oben rechts) ───────────────────────────────
import { MessageCircle } from 'lucide-react'
import { useChatStore, anzahlUngelesen } from '../../store/chatStore'

export default function ChatKnopf() {
  const bereit = useChatStore(s => s.bereit)
  const offen = useChatStore(s => s.offen)
  const umschalten = useChatStore(s => s.umschalten)
  const ungelesen = useChatStore(s => anzahlUngelesen(s.ungelesen))
  const online = useChatStore(s => s.nutzer.filter(n => n.online).length)
  if (!bereit) return null   // nur im angemeldeten Hauptfenster
  return (
    <button onClick={umschalten}
      title={`Chat ${offen ? 'schließen' : 'öffnen'} · ${Math.max(online - 1, 0)} weitere im Tool${ungelesen ? ` · ${ungelesen} ungelesen` : ''}`}
      className={`relative h-7 px-2 mr-1 flex items-center gap-1.5 rounded text-[11px] transition-colors ${ungelesen > 0 ? 'chat-blinkt' : ''} ${offen ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'}`}>
      <MessageCircle size={14} />
      <span className="font-medium">Chat</span>
      {ungelesen > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-red-500 text-white ring-1 ring-white text-[9px] font-bold leading-[15px] text-center">{ungelesen}</span>
      )}
    </button>
  )
}
