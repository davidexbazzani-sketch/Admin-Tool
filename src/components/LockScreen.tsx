// ── Sperrbildschirm (globale Programm-Sperre) ────────────────────────────────
// Wird angezeigt, wenn davidxe das Programm für alle gesperrt hat. Der Nutzer
// bleibt angemeldet, sieht aber keine Inhalte; abmelden ist möglich.

import { Lock, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { api } from '../electronAPI'
import type { AppLock } from '../services/appLock'

export default function LockScreen({ lock }: { lock: AppLock }) {
  const setSession = useAuthStore(s => s.setSession)
  const user = useAuthStore(s => s.session?.user)

  return (
    <div className="flex-1 flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/15 flex items-center justify-center mb-4">
          <Lock size={30} className="text-red-400" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Programm derzeit gesperrt</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Das IT Admin Tool wurde vorübergehend durch die Administration gesperrt und steht aktuell nicht zur Verfügung.
          Es gehen keine Daten verloren — bitte versuche es später erneut.
        </p>
        {lock.at && (
          <p className="text-[11px] text-muted-foreground/70 mt-3">
            Gesperrt am {new Date(lock.at).toLocaleString('de-DE')}{lock.by ? ` · ${lock.by}` : ''}
          </p>
        )}
        <button
          onClick={() => { if (user?.username) api().heartbeatClear(user.username).catch(() => {}); setSession(null) }}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium border border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <LogOut size={15} />Abmelden
        </button>
      </div>
    </div>
  )
}
