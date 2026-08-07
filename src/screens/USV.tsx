import { useState } from 'react'
import { BatteryCharging, FileText, LogIn, X, ZoomIn, AlertTriangle, Loader2, ExternalLink } from 'lucide-react'
import usvImg from '../../resources/USV/USV_freigestellt.png'
import stickerLeft from '../../resources/USV/Sticker_USV_2_links.png'
import stickerRight from '../../resources/USV/Sticker_USV1_rechts.png'
import { api } from '../electronAPI'

// Anordnung (siehe Bild): LINKS = USV 2, RECHTS = USV 1.
// URLs aus der Vergabe-Textdatei: links (USV2) = .199, rechts (USV1) = .198.
interface UpsDef {
  key: 'left' | 'right'
  name: string
  ip: string
  url: string
  sticker: string
  // Overlay-Positionen (Prozent, relativ zum Bild)
  stickerPos: { top: string; left: string }
  loginPos: { top: string; left: string }
}

const LEFT: UpsDef = {
  key: 'left', name: 'USV 2 (links)', ip: '10.170.118.199',
  url: 'http://10.170.118.199/NMC/C1MFwyh0M536UQk7iNgIUg/logon.htm',
  sticker: stickerLeft,
  stickerPos: { top: '8%', left: '38%' },
  loginPos: { top: '70%', left: '25%' },
}
const RIGHT: UpsDef = {
  key: 'right', name: 'USV 1 (rechts)', ip: '10.170.118.198',
  url: 'http://10.170.118.198/NMC/C1MFwyh0M536UQk7iNgIUg/logon.htm',
  sticker: stickerRight,
  stickerPos: { top: '8%', left: '86%' },
  loginPos: { top: '70%', left: '74%' },
}

export default function USV() {
  const [sticker, setSticker] = useState<{ src: string; title: string } | null>(null)
  const [login, setLogin] = useState<UpsDef | null>(null)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [loginErr, setLoginErr] = useState('')
  const [opening, setOpening] = useState(false)
  const [docOpening, setDocOpening] = useState(false)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  function flash(t: { kind: 'success' | 'error'; text: string }) {
    setToast(t); setTimeout(() => setToast(c => (c === t ? null : c)), 4000)
  }

  function openLogin(ups: UpsDef) {
    setLogin(ups); setUser(''); setPass(''); setLoginErr('')
  }

  async function submitLogin() {
    if (!login) return
    if (user.trim().toLowerCase() !== 'apc' || pass !== 'apc') {
      setLoginErr('Benutzer oder Passwort falsch.')
      return
    }
    setOpening(true)
    const r = await api().openInEdgeOrChrome(login.url)
    setOpening(false)
    if (r.success) {
      setLogin(null)
      flash({ kind: 'success', text: r.fallback ? `${login.name}: im Standardbrowser geöffnet.` : `${login.name}: im Browser geöffnet.` })
    } else {
      setLoginErr(r.error || 'Browser konnte nicht geöffnet werden.')
    }
  }

  async function openDoc() {
    setDocOpening(true)
    const r = await api().usvOpenDoc()
    setDocOpening(false)
    if (!r.success) flash({ kind: 'error', text: r.error || 'Notfallplan konnte nicht geöffnet werden.' })
  }

  function StickerHotspot({ ups }: { ups: UpsDef }) {
    return (
      <button
        onClick={() => setSticker({ src: ups.sticker, title: `Sticker ${ups.name}` })}
        title={`Sticker ${ups.name} anzeigen`}
        style={{ top: ups.stickerPos.top, left: ups.stickerPos.left }}
        className="absolute -translate-x-1/2 -translate-y-1/2 group"
      >
        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400/90 text-black text-[11px] font-semibold shadow-lg ring-2 ring-white/70 hover:bg-amber-300 transition-colors animate-pulse group-hover:animate-none">
          <ZoomIn size={13} />Sticker
        </span>
      </button>
    )
  }
  function LoginHotspot({ ups }: { ups: UpsDef }) {
    return (
      <button
        onClick={() => openLogin(ups)}
        style={{ top: ups.loginPos.top, left: ups.loginPos.left }}
        className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold shadow-xl ring-2 ring-white/40 hover:bg-blue-500 transition-colors"
      >
        <LogIn size={15} />Log In
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border flex items-center gap-3">
        <BatteryCharging size={22} className="text-emerald-400" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-foreground">USV — Unterbrechungsfreie Stromversorgung</h1>
          <p className="text-xs text-muted-foreground">Zwei APC Smart-UPS VT. Sticker antippen zum Vergrößern · „Log In" führt (nach Anmeldung) zur UPS-Weboberfläche.</p>
        </div>
        {/* USV Notfall Plan (Dokument) — schräg oben rechts */}
        <button onClick={openDoc} disabled={docOpening}
          className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
          title="USV Notfallplan öffnen">
          {docOpening ? <Loader2 size={22} className="animate-spin" /> : <FileText size={22} />}
          <span className="text-[10px] font-medium leading-tight text-center">USV Notfall&shy;Plan</span>
        </button>
      </div>

      {/* Bühne mit den beiden USVn */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-6">
        <div className="relative inline-block select-none">
          <img src={usvImg} alt="USV 2 (links) und USV 1 (rechts)" draggable={false}
            className="block max-h-[74vh] w-auto" />
          <StickerHotspot ups={LEFT} />
          <StickerHotspot ups={RIGHT} />
          <LoginHotspot ups={LEFT} />
          <LoginHotspot ups={RIGHT} />
        </div>
      </div>

      {/* Sticker-Lightbox */}
      {sticker && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setSticker(null)}>
          <div className="relative max-w-[92vw] max-h-[92vh]" onClick={e => e.stopPropagation()}>
            <img src={sticker.src} alt={sticker.title} className="max-w-[92vw] max-h-[88vh] w-auto h-auto rounded-lg shadow-2xl" />
            <div className="absolute -top-3 -right-3 flex items-center gap-2">
              <button onClick={() => setSticker(null)} className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:bg-white/90"><X size={18} /></button>
            </div>
            <p className="mt-2 text-center text-sm text-white/90">{sticker.title}</p>
          </div>
        </div>
      )}

      {/* Login-Dialog */}
      {login && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-6" onClick={() => !opening && setLogin(null)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <LogIn size={18} className="text-blue-400" />
              <h3 className="text-base font-semibold text-foreground">Anmeldung {login.name}</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Zugangsdaten eingeben, um zur UPS-Weboberfläche ({login.ip}) zu gelangen.</p>
            <div className="space-y-2">
              <label className="text-[11px] text-muted-foreground block">User
                <input value={user} onChange={e => { setUser(e.target.value); setLoginErr('') }} autoFocus autoComplete="off"
                  onKeyDown={e => { if (e.key === 'Enter') submitLogin() }}
                  className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
              </label>
              <label className="text-[11px] text-muted-foreground block">Password
                <input type="password" value={pass} onChange={e => { setPass(e.target.value); setLoginErr('') }} autoComplete="new-password"
                  onKeyDown={e => { if (e.key === 'Enter') submitLogin() }}
                  className="w-full mt-0.5 px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
              </label>
            </div>
            {loginErr && <p className="mt-2 text-xs text-red-300 flex items-center gap-1"><AlertTriangle size={13} />{loginErr}</p>}
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setLogin(null)} disabled={opening} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-50">Abbrechen</button>
              <button onClick={submitLogin} disabled={opening || !user.trim() || !pass}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                {opening ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}Anmelden &amp; öffnen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm">
          <div className={`flex items-start gap-2 px-4 py-3 rounded-lg shadow-2xl border ${toast.kind === 'success' ? 'bg-green-500 border-green-600 text-black' : 'bg-red-500/15 border-red-500/40 text-red-200'}`}>
            {toast.kind === 'success' ? <ExternalLink size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
            <p className="text-sm">{toast.text}</p>
          </div>
        </div>
      )}
    </div>
  )
}
