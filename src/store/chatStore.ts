// ── Chat: gemeinsamer Zustand für Titelleisten-Knopf, Chatfenster und Popups ──
// Die Netzlogik steckt in services/chat.ts, der Takt in components/chat/ChatController.tsx.
import { create } from 'zustand'
import type { ChatNutzer } from '../services/chat'

export interface ChatToast { id: string; from: string; fromDisplay: string; vorschau: string; anzahl: number }

const lies = (k: string, std: boolean) => { try { const v = localStorage.getItem(k); return v === null ? std : v === '1' } catch { return std } }
const merke = (k: string, v: boolean) => { try { localStorage.setItem(k, v ? '1' : '0') } catch { /* egal */ } }

interface ChatState {
  bereit: boolean                         // Controller läuft (nur im angemeldeten Hauptfenster)
  offen: boolean                          // Chatfenster sichtbar
  eingeklappt: boolean                    // nur die Kopfzeile sichtbar
  partner: string | null                  // offenes Gespräch (username)
  nutzer: ChatNutzer[]
  nutzerGeladen: boolean                 // erste Nutzerliste da (sonst „wird geladen")
  ungelesen: Record<string, string[]>     // Absender → ungelesene Nachrichten-IDs
  namen: Record<string, string>           // username → Anzeigename (auch für Offline-Absender)
  toasts: ChatToast[]
  setBereit: (b: boolean) => void
  umschalten: () => void
  oeffne: (partner?: string | null) => void
  schliesse: () => void
  setEingeklappt: (b: boolean) => void
  setPartner: (p: string | null) => void
  setNutzer: (n: ChatNutzer[]) => void
  setUngelesen: (u: Record<string, string[]>) => void
  merkeNamen: (n: Record<string, string>) => void
  zeigeToast: (t: ChatToast) => void
  entferneToast: (id: string) => void
}

export const useChatStore = create<ChatState>((set) => ({
  bereit: false,
  offen: lies('chat_offen', false),
  eingeklappt: lies('chat_eingeklappt', false),
  partner: null,
  nutzer: [],
  nutzerGeladen: false,
  ungelesen: {},
  namen: {},
  toasts: [],
  setBereit: (bereit) => set({ bereit }),
  umschalten: () => set(s => { const offen = !s.offen; merke('chat_offen', offen); if (offen) merke('chat_eingeklappt', false); return { offen, eingeklappt: offen ? false : s.eingeklappt } }),
  oeffne: (partner) => set(s => { merke('chat_offen', true); merke('chat_eingeklappt', false); return { offen: true, eingeklappt: false, partner: partner === undefined ? s.partner : partner } }),
  schliesse: () => set(() => { merke('chat_offen', false); return { offen: false } }),
  setEingeklappt: (eingeklappt) => set(() => { merke('chat_eingeklappt', eingeklappt); return { eingeklappt } }),
  setPartner: (partner) => set({ partner }),
  setNutzer: (nutzer) => set(s => ({ nutzer, nutzerGeladen: true, namen: { ...s.namen, ...Object.fromEntries(nutzer.map(n => [n.username.toLowerCase(), n.displayName])) } })),
  setUngelesen: (ungelesen) => set({ ungelesen }),
  merkeNamen: (n) => set(s => ({ namen: { ...s.namen, ...n } })),
  // Je Absender nur ein Popup (Zähler hochzählen statt stapeln), höchstens 5 gleichzeitig.
  // Popups bleiben stehen, bis gelesen oder geschlossen (ChatController räumt beim Lesen ab).
  zeigeToast: (t) => set(s => {
    const rest = s.toasts.filter(x => x.from !== t.from)
    return { toasts: [...rest, t].slice(-5) }
  }),
  entferneToast: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}))

export const anzahlUngelesen = (u: Record<string, string[]>) => Object.values(u).reduce((s, l) => s + l.length, 0)
