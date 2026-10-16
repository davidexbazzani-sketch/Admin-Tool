// ── Einstellungen: Globale Programm-Sperre (nur davidxe) ─────────────────────
// Sperrt/entsperrt das gesamte Programm für ALLE anderen Nutzer. Davide selbst
// sieht weiterhin alles und ist der Einzige, der die Sperre wieder aufheben kann.

import { useEffect, useState } from 'react'
import { Lock, Unlock, Loader2, AlertTriangle, Check } from 'lucide-react'
import Card from './Card'
import { useAuthStore } from '../store/authStore'
import { loadAppLock, setAppLock, type AppLock } from '../services/appLock'

export default function AppLockCard() {
  const user = useAuthStore(s => s.session?.user)
  const by = user?.displayName || user?.username || 'davidxe'

  const [lock, setLock] = useState<AppLock>({ locked: false })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function reload() {
    setLoading(true)
    try { setLock(await loadAppLock()) } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [])

  async function toggle(next: boolean) {
    if (next && !window.confirm('Das gesamte Programm wird für ALLE anderen Nutzer sofort gesperrt (auch bereits angemeldete). Nichts wird gelöscht. Fortfahren?')) return
    setBusy(true); setMsg('')
    try {
      const ok = await setAppLock(next, by)
      if (!ok) { setMsg('Konnte nicht gespeichert werden (Netzlaufwerk/Rechte?).'); return }
      await reload()
      setMsg(next ? 'Programm ist jetzt für alle anderen gesperrt.' : 'Sperre aufgehoben – das Programm ist wieder freigegeben.')
    } finally { setBusy(false) }
  }

  return (
    <Card title="Programm-Sperre (Master Admin)" icon={<Lock size={15} />}
      subtitle="Das gesamte Programm für alle anderen Nutzer sperren – nur du kannst es wieder freigeben.">
      {loading ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" />lädt…</div>
      ) : (
        <div className="space-y-3">
          <div className={`px-3 py-2 rounded-md border text-xs flex items-center gap-2 ${lock.locked ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'}`}>
            {lock.locked ? <Lock size={14} /> : <Unlock size={14} />}
            {lock.locked
              ? <span><b>Gesperrt</b>{lock.at ? ` seit ${new Date(lock.at).toLocaleString('de-DE')}` : ''}{lock.by ? ` · durch ${lock.by}` : ''}. Alle außer dir sehen nur den Sperrbildschirm.</span>
              : <span>Nicht gesperrt – das Programm ist für alle nutzbar.</span>}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {lock.locked ? (
              <button onClick={() => void toggle(false)} disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}Sperre aufheben (für alle freigeben)
              </button>
            ) : (
              <button onClick={() => void toggle(true)} disabled={busy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-50">
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}Programm für alle sperren
              </button>
            )}
            <button onClick={() => void reload()} disabled={busy} className="text-[11px] text-muted-foreground hover:text-foreground underline">Status neu laden</button>
          </div>

          <p className="text-[10px] text-muted-foreground flex items-start gap-1">
            <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-400" />
            Wirkt sofort für alle Instanzen (bereits angemeldete werden binnen ~20 Sekunden gesperrt). Es werden keine Daten gelöscht. Du selbst bist von der Sperre ausgenommen.
          </p>

          {msg && <p className="text-xs text-emerald-400 inline-flex items-center gap-1"><Check size={12} />{msg}</p>}
        </div>
      )}
    </Card>
  )
}
