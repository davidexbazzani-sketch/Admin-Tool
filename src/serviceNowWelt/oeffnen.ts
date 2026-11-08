// Einen ServiceNow-Eintrag per Name öffnen (Katalog wird erst bei Bedarf geladen).
import { api } from '../electronAPI'
import { snLink, snPortalSuche, type SnKatalog } from './welt'

export async function oeffneSnEintrag(name: string): Promise<void> {
  const k = (await import('./katalog.json')).default as SnKatalog
  const e = k.eintraege.find(x => x.n.trim().toLowerCase() === name.trim().toLowerCase())
  await api().openExternal(e ? snLink(k.instanz, e) : snPortalSuche(k.instanz, name))
}
