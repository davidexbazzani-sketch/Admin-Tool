// Der Coach — Adapter fürs IT Admin Tool. EINZIGE Datei unter src/coach/, die etwas von außerhalb des Ordners
// importiert (geprüft von scripts/coach-pruefe.mjs).
//
// Sichtbarkeit (Wunsch des Auftraggebers, 26.11.2026): alle Master-Admins (und der Gründer). Der Menüeintrag trägt
// masterAdminOnly; ausblenden lässt er sich je Benutzer unter Einstellungen → Benutzer & Rechte. Die Rollenprüfung
// hier greift auch, solange die Menü-Sichtbarkeit noch nicht berechnet ist.
// Zur Freigabe für alle: FREIGEGEBEN = true setzen und masterAdminOnly in src/utils/menuCatalog.ts entfernen.
import { useAuthStore } from '../../store/authStore'
import { useAppStore } from '../../store/appStore'
import { useMenuSichtbar } from '../../store/menuSichtbarStore'
import { ipcRenderer } from '../../utils/ipc'
import type { Ablage, AblageName, CoachHost, LadeAntwort } from './host'

const FREIGEGEBEN = false

interface CoachIpc {
  [k: string]: unknown
}
function ipc(): CoachIpc | null {
  return (window as unknown as { electronAPI?: CoachIpc }).electronAPI ?? null
}
type Fn<A extends unknown[], R> = (...a: A) => Promise<R>
function ruf<A extends unknown[], R>(name: string, sonst: R): Fn<A, R> {
  return async (...a: A) => {
    const f = ipc()?.[name]
    if (typeof f !== 'function') return sonst
    return (f as (...x: A) => Promise<R>)(...a)
  }
}

function ablage(name: AblageName): Ablage {
  return {
    laden: ruf<[string], LadeAntwort>(`${name}Laden`, { ok: true, daten: null, verschluesselung: false }),
    speichern: ruf<[string, string], { ok: boolean; fehler?: string }>(`${name}Speichern`, { ok: false, fehler: 'kein Speicher' }),
    loeschen: ruf<[string], boolean>(`${name}Loeschen`, false),
    beiseite: ruf<[string, 'defekt' | 'alt'], boolean>(`${name}Beiseite`, false),
  }
}

const zuBase64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let s = ''
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 32768)))
  return btoa(s)
}
const ausBase64 = (b64: string): string => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))

export const adminToolHost: CoachHost = {
  benutzer: () => useAuthStore.getState().session?.user.username ?? '',
  anzeigeName: () => {
    const n = useAuthStore.getState().session?.user.displayName ?? ''
    return n.split(/[\s,]+/).filter(Boolean).find(t => !/^(dr\.?|prof\.?)$/i.test(t)) ?? ''
  },
  raumOffen: () => useAppStore.getState().screen === 'der-coach',
  darfSehen: () => {
    const u = useAuthStore.getState().session?.user
    if (!u) return false
    if (useMenuSichtbar.getState().sichtbar?.['der-coach'] === false) return false
    if (FREIGEGEBEN || u.role === 'master_admin' || u.isFounder === true) return true
    // Davide: Tool-Konto „davidxe“ oder sein Windows-Konto BQ8069 (Anmeldung per Windows/SSO)
    const w = String((u as { windowsUsername?: string }).windowsUsername || '').toLowerCase().split('\\').pop()
    return ['davidxe', 'bq8069'].includes((u.username || '').toLowerCase().split('\\').pop() || '') || w === 'bq8069'
  },
  andereKarteSichtbar: () => !!document.querySelector('[data-pi-erinnerung]'),
  beobachte: (rueckruf) => {
    const a = useAuthStore.subscribe(rueckruf)
    const b = useAppStore.subscribe((s, alt) => { if (s.screen !== alt.screen) rueckruf() })
    const c = useMenuSichtbar.subscribe(rueckruf)
    return () => { a(); b(); c() }
  },
  ablage,
  kannOeffnen: (ziel) => useMenuSichtbar.getState().sichtbar?.[ziel] !== false,
  oeffne: (ziel) => useAppStore.getState().setScreen(ziel === 'pausenraum' ? 'games' : ziel),
  benachrichtige: (titel, text) => {
    if (document.hasFocus()) return
    try { const n = new Notification(titel, { body: text, tag: 'der-coach' }); n.onclick = () => ipcRenderer('window:focus') } catch { /* nicht verfügbar */ }
  },
  speichereDatei: async (vorschlag, inhalt) => {
    const api = ipc()
    const dialog = api?.saveFileDialog as ((p?: string, f?: { name: string; extensions: string[] }[]) => Promise<string | null>) | undefined
    const schreibe = api?.writeFile as ((p: string, b64: string) => Promise<{ success: boolean }>) | undefined
    if (!dialog || !schreibe) return false
    const pfad = await dialog(vorschlag, [{ name: 'Der Coach', extensions: ['json'] }])
    if (!pfad) return false
    return (await schreibe(pfad, zuBase64(inhalt))).success
  },
  ladeDatei: async () => {
    const api = ipc()
    const dialog = api?.openFileDialog as ((f?: { name: string; extensions: string[] }[]) => Promise<string | null>) | undefined
    const lies = api?.readFile as ((p: string) => Promise<{ success: boolean; data?: string }>) | undefined
    if (!dialog || !lies) return null
    const pfad = await dialog([{ name: 'Der Coach', extensions: ['json'] }])
    if (!pfad) return null
    const r = await lies(pfad)
    return r.success && r.data ? ausBase64(r.data) : null
  },
  bildPfad: d => `./coach/bilder/${d}`,
  tonPfad: d => `./coach/ton/${d}`,
}
