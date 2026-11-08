// ── Chat – Hintergrund ────────────────────────────────────────────────────────
// Läuft im angemeldeten Hauptfenster (App.tsx): schreibt den Anwesenheits-Herzschlag,
// fragt den eigenen Posteingang ab und meldet neue Nachrichten als Popup (im Tool) bzw.
// als Windows-Benachrichtigung (Tool im Hintergrund). Rendert Chatfenster + Popups
// (auch die Toner-Warnungen, damit sich oben rechts nichts überlappt).
//
// Takt: Posteingang alle 5 s (Fenster im Vordergrund) bzw. 15 s (Hintergrund) — nur ein
// Verzeichnis-Listing, asynchron. Nutzerliste nur bei offenem Chat häufig.

import { useCallback, useEffect, useRef } from 'react'
import { Activity, MessageCircle, Printer, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { useTonerWarnungStore } from '../../store/tonerWarnungStore'
import { istBot, istDruckerBot, istMonitorBot } from '../../services/chatBots'
import TonerPopups from '../printer/TonerPopups'
import ServerPopups from '../server/ServerPopups'
import { useServerEreignisStore } from '../../store/serverEreignisStore'
import {
  HERZSCHLAG_MS, schreibeHerzschlag, meldeAb, ladeNutzer, listePosteingang, leseHinweis, absenderAusId, sicher,
} from '../../services/chat'
import { onAppFocus, ersterLaufEntzerrt } from '../../utils/appFocus'
import { ipcRenderer } from '../../utils/ipc'
import ChatPanel from './ChatPanel'

const POSTEINGANG_MS = 5_000
const POSTEINGANG_HINTERGRUND_MS = 15_000
const NUTZER_OFFEN_MS = 20_000
const NUTZER_ZU_MS = 120_000

/** Kurzer, leiser Hinweiston (ohne Datei) — nur wenn das Tool im Vordergrund ist. */
function ping() {
  try {
    const ctx = new AudioContext()
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime); o.frequency.setValueAtTime(1320, ctx.currentTime + 0.09)
    g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3)
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.32)
    setTimeout(() => void ctx.close(), 500)
  } catch { /* ohne Ton */ }
}

export default function ChatController() {
  const user = useAuthStore(s => s.session?.user)
  const username = user?.username || ''
  const displayName = user?.displayName || username
  const ich = useRef({ username, displayName })
  ich.current = { username, displayName }

  const aktivAt = useRef(new Date())
  const gesehen = useRef<Set<string> | null>(null)   // null = erster Lauf (kein Einzel-Popup für Altes)
  const takt = useRef(0)
  const busyEingang = useRef(false)

  // Aktivität (für „inaktiv seit …") — gedrosselt
  useEffect(() => {
    let zuletzt = 0
    const merk = () => { const j = Date.now(); if (j - zuletzt > 5000) { zuletzt = j; aktivAt.current = new Date() } }
    window.addEventListener('mousemove', merk, { passive: true }); window.addEventListener('keydown', merk)
    return () => { window.removeEventListener('mousemove', merk); window.removeEventListener('keydown', merk) }
  }, [])

  const herzschlag = useCallback(() => { if (ich.current.username) void schreibeHerzschlag(ich.current, aktivAt.current) }, [])

  const nutzerLaden = useCallback(async () => {
    if (!ich.current.username) return
    useChatStore.getState().setNutzer(await ladeNutzer())
  }, [])

  const posteingang = useCallback(async () => {
    const me = ich.current.username
    if (!me || busyEingang.current) return
    busyEingang.current = true
    try {
      const ids = await listePosteingang(me)
      const st = useChatStore.getState()
      const gruppen: Record<string, string[]> = {}
      for (const id of ids) { const von = absenderAusId(id); (gruppen[von] ||= []).push(id) }
      st.setUngelesen(gruppen)
      // Popups bleiben stehen, bis man liest oder schließt — gelesen (auch an einem anderen
      // Rechner) heißt: Popup dieses Absenders weg
      for (const t of st.toasts) {
        if (t.from ? !gruppen[t.from]?.length : !ids.length) st.entferneToast(t.id)
      }

      const erstesMal = gesehen.current === null
      const vorher = gesehen.current || new Set<string>()
      const neu = ids.filter(id => !vorher.has(id))
      gesehen.current = new Set(ids)
      if (!neu.length) return

      if (erstesMal) {
        // Beim Start: eine Sammelmeldung statt vieler Popups
        st.zeigeToast({ id: 'start', from: '', fromDisplay: '', vorschau: `${ids.length} ungelesene Nachricht${ids.length === 1 ? '' : 'en'}`, anzahl: ids.length })
        return
      }
      const sichtbar = document.hasFocus() && st.offen && !st.eingeklappt
      let tonFaellig = false
      for (const [von, liste] of Object.entries(gruppen)) {
        const neuVon = liste.filter(id => neu.includes(id))
        if (!neuVon.length) continue
        if (sichtbar && st.partner && sicher(st.partner) === von) continue   // Gespräch ist offen → dort sichtbar
        const h = await leseHinweis(me, neuVon[neuVon.length - 1])
        const name = h?.fromDisplay || st.namen[von] || von
        if (h) st.merkeNamen({ [von]: h.fromDisplay })
        st.zeigeToast({ id: neuVon[neuVon.length - 1], from: von, fromDisplay: name, vorschau: h?.vorschau || 'Neue Nachricht', anzahl: liste.length })
        if (document.hasFocus()) tonFaellig = true
        else {
          try {
            const n = new Notification(`Nachricht von ${name}`, { body: h?.vorschau || '', tag: `chat-${von}` })
            n.onclick = () => { ipcRenderer('window:focus'); useChatStore.getState().oeffne(von) }
          } catch { /* Benachrichtigungen nicht verfügbar */ }
        }
      }
      if (tonFaellig) ping()
    } finally { busyEingang.current = false }
  }, [])

  useEffect(() => {
    if (!username) return
    useChatStore.getState().setBereit(true)
    gesehen.current = null
    const start = ersterLaufEntzerrt(() => { herzschlag(); void posteingang(); void nutzerLaden() })
    const hb = setInterval(herzschlag, HERZSCHLAG_MS)
    // Ein 5-s-Takt: im Hintergrund nur jeden 3. Durchgang den Posteingang lesen
    const t = setInterval(() => {
      takt.current++
      if (document.hasFocus() || takt.current % Math.round(POSTEINGANG_HINTERGRUND_MS / POSTEINGANG_MS) === 0) void posteingang()
      const st = useChatStore.getState()
      const nutzerTakt = st.offen && !st.eingeklappt && document.hasFocus() ? NUTZER_OFFEN_MS : NUTZER_ZU_MS
      if (takt.current % Math.round(nutzerTakt / POSTEINGANG_MS) === 0) void nutzerLaden()
    }, POSTEINGANG_MS)
    const abmelden = onAppFocus(() => { herzschlag(); void posteingang() }, 15_000)
    const tschuess = () => { void meldeAb(ich.current) }
    window.addEventListener('beforeunload', tschuess)
    return () => {
      start(); clearInterval(hb); clearInterval(t); abmelden()
      window.removeEventListener('beforeunload', tschuess)
      useChatStore.getState().setBereit(false)
    }
  }, [username, herzschlag, posteingang, nutzerLaden])

  // Beim Öffnen des Chats sofort frische Nutzerliste
  const offen = useChatStore(s => s.offen)
  useEffect(() => { if (offen) void nutzerLaden() }, [offen, nutzerLaden])

  if (!username) return null
  return (
    <>
      <ChatPanel ich={{ username, displayName }} nachSenden={() => void posteingang()} />
      <ChatToasts />
    </>
  )
}

/**
 * Popup-Stapel oben rechts: zuerst Toner-Warnungen, darunter Chat-Nachrichten. Beide
 * bleiben stehen (wie bei Teams, nur ohne automatisches Ausblenden) — Chat-Popups gehen
 * beim Lesen der Nachricht oder per „schließen" weg, Toner-Warnungen per „Gelesen".
 */
function ChatToasts() {
  const toasts = useChatStore(s => s.toasts)
  const entferne = useChatStore(s => s.entferneToast)
  const oeffne = useChatStore(s => s.oeffne)
  const panelBreit = useChatStore(s => s.offen && !s.eingeklappt)
  const panelZu = useChatStore(s => s.offen && s.eingeklappt)    // nur die Kopfzeile → Popups darunter
  const toner = useTonerWarnungStore(s => s.offen.length)
  const neustarts = useServerEreignisStore(s => s.offen.length)

  if (!toasts.length && !toner && !neustarts) return null
  return (
    <div className={`fixed z-[90] flex flex-col gap-2 w-80 overflow-y-auto ${panelZu ? 'top-[92px] max-h-[calc(100vh-104px)]' : 'top-11 max-h-[calc(100vh-56px)]'} ${panelBreit ? 'right-[392px]' : 'right-3'}`}>
      <ServerPopups />
      <TonerPopups />
      {toasts.map(t => (
        <div key={t.id} className="rounded-xl border border-primary/40 bg-card shadow-2xl overflow-hidden">
          <button onClick={() => { oeffne(t.from || null); entferne(t.id) }} className="w-full text-left px-3 py-2.5 hover:bg-accent/30 flex items-start gap-2.5">
            <span className="mt-0.5 w-8 h-8 shrink-0 rounded-full bg-primary/20 text-primary flex items-center justify-center">{istDruckerBot(t.from) ? <Printer size={15} /> : istMonitorBot(t.from) ? <Activity size={15} /> : <MessageCircle size={15} />}</span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs font-semibold text-foreground truncate">
                {t.from ? `${t.fromDisplay}${t.anzahl > 1 ? ` (${t.anzahl})` : ''}` : 'Chat'}
              </span>
              <span className="block text-[11px] text-muted-foreground line-clamp-2 break-words">{t.vorschau}</span>
              <span className="block mt-1 text-[10px] text-primary">{t.from && !istBot(t.from) ? 'Klicken zum Antworten' : 'Klicken zum Öffnen'}</span>
            </span>
          </button>
          <div className="flex justify-end px-2 pb-1.5 -mt-1">
            <button onClick={() => entferne(t.id)} className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"><X size={10} />schließen</button>
          </div>
        </div>
      ))}
    </div>
  )
}
