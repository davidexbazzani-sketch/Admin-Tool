// Hinweis statt Bildschirm, wenn ein Menüpunkt für den Benutzer ausgeblendet ist
// (Einstellungen → „Benutzer & Rechte“). Genutzt von der Wache in App.tsx.
import { EyeOff } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useMenuSichtbar } from '../store/menuSichtbarStore'

/** true, wenn der Bildschirm für diesen Benutzer ausgeblendet ist (solange nichts berechnet ist: false). */
export const useAusgeblendet = (screen: string) => useMenuSichtbar(s => !!s.sichtbar && s.sichtbar[screen] === false)

export default function AusgeblendetHinweis({ screen }: { screen: string }) {
  const setScreen = useAppStore(s => s.setScreen)
  return (
    <div className="flex h-full items-center justify-center p-6" data-bildschirm-ausgeblendet={screen}>
      <div className="max-w-sm text-center space-y-3">
        <div className="mx-auto w-12 h-12 rounded-xl bg-muted/30 text-muted-foreground flex items-center justify-center"><EyeOff size={22} /></div>
        <h2 className="text-base font-semibold text-foreground">Dieser Bereich ist für dich ausgeblendet</h2>
        <p className="text-sm text-muted-foreground">Die IT hat ihn in den Einstellungen unter „Benutzer &amp; Rechte“ für dein Konto ausgeblendet. Wenn du ihn brauchst, melde dich bei der IT.</p>
        <button onClick={() => setScreen('home')} className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90">Zur Startseite</button>
      </div>
    </div>
  )
}
