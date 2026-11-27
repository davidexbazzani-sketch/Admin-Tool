// ── Mail-PC: Lebenszeichen + Postausgang (services/mailPc.ts) ─────────────────
// Bewusst je PC: Jeder PC aus der Liste „Mail-PCs“ (Einstellungen → Für alle → Automatik & Scans)
// meldet bei offenem Tool jede Minute „online“ und verschickt die automatischen Mails aus dem
// Postausgang über sein Outlook. Der Automatik-PC arbeitet den Postausgang als letzte Wahl ab.
// Andere PCs tun nichts (kein Lesen alle 20 s auf jedem Admin-PC).
import { useEffect } from 'react'
import { useAuthStore, useIsAdmin } from '../store/authStore'
import { binAutomatikPc, darfAutomatik } from '../services/automatikLeiter'
import { bearbeitePostausgang, ladeListe, listeSofort, MAILPC_HERZ_MS, schreibeHerz } from '../services/mailPc'
import { eigenerRechner, rechnerKurz } from '../services/serverMelder'

const POSTAUSGANG_TAKT_MS = 20_000

export default function MailPcController() {
  const username = useAuthStore(s => s.session?.user?.username || '')
  const isAdmin = useIsAdmin()
  useEffect(() => {
    if (!username || !isAdmin) return
    let weg = false
    let ich = ''
    const benutzer = () => useAuthStore.getState().session?.user?.displayName || username
    const herz = async () => {
      await ladeListe()
      if (!ich) ich = rechnerKurz(await eigenerRechner())
      if (!weg) await schreibeHerz(benutzer())
    }
    void herz()
    const t1 = setInterval(() => { void herz() }, MAILPC_HERZ_MS)
    const t2 = setInterval(() => {
      if (weg) return
      // nur Mail-PCs der Liste und der Automatik-PC schauen in den Postausgang
      if (!(ich && listeSofort().reihenfolge.includes(ich)) && !binAutomatikPc()) return
      void bearbeitePostausgang(() => darfAutomatik())
    }, POSTAUSGANG_TAKT_MS)
    // beim Schließen sofort „nicht mehr online“ — sonst wartet der Automatik-PC 3 min
    const zu = () => { void schreibeHerz(benutzer(), true) }
    window.addEventListener('beforeunload', zu)
    return () => { weg = true; clearInterval(t1); clearInterval(t2); window.removeEventListener('beforeunload', zu); zu() }
  }, [username, isAdmin])
  return null
}
