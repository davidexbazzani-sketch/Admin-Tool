// ── Aktivitätsprotokoll: Wer/was hat wann welchen Eingriff ausgelöst? ────────
// Hält jeden Eingriff an PCs fest – mit Auslöser (per Klick oder automatisch), Funktion, Grund,
// Ziel-PC, Admin-PC und Konto. Zweck: Meldungen wie die von Security (CDO) nachvollziehen
// („wieso lief sp172533.exe auf DECZC…?“). Ansicht: Einstellungen → „Aktivitätsprotokoll“.
//
// Ablage auf dem Netzlaufwerk: protokoll/aktivitaet/<JJJJ-MM-TT>_<ADMIN-PC>.json – je Tag und
// Admin-PC eine Datei, damit mehrere Tool-Instanzen sich nie gegenseitig überschreiben.
// Schreiben ist „feuern und vergessen“ (serialisiert je Instanz) und darf nie einen Ablauf stören.
// Keine Geheimnisse: nur Namen, Hosts, Treiber/Betreffzeilen – nie Kennwörter oder Mailtexte.
import { api, setzeMailHook } from '../electronAPI'
import { useAuthStore } from '../store/authStore'

export type AktArt = 'automatisch' | 'manuell'
export interface AktAusloeser { art: AktArt; quelle: string; grund?: string }

export interface AktEintrag {
  id: string
  zeit: string              // ISO
  rechner: string           // Admin-PC, auf dem das Tool lief
  benutzer: string          // Konto im Tool
  art: AktArt
  quelle: string            // Funktion, z. B. „Komplett-Einrichtung“, „Treiber-Installation“
  aktion: string            // was gemacht wurde
  ziel?: string             // Ziel-PC bzw. Empfänger
  grund?: string            // warum (bei Automatik: welcher Zeitplan/welche Checkliste)
  ergebnis?: string
  details?: string[]
}

export const AKT_ORDNER = 'protokoll/aktivitaet'
const MAX_PRO_DATEI = 4000

let rechnerCache = ''
async function rechner(): Promise<string> {
  if (rechnerCache) return rechnerCache
  try { rechnerCache = ((await api().getHostname()) || '').toUpperCase() } catch { rechnerCache = '' }
  return rechnerCache || 'UNBEKANNT'
}
function benutzer(): string {
  const u = useAuthStore.getState().session?.user
  return u ? (u.displayName ? `${u.displayName} (${u.username})` : u.username) : 'unbekannt'
}
const tag = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

let kette: Promise<void> = Promise.resolve()

/** Eintrag schreiben (blockiert nie, wirft nie). */
export function protokolliere(e: Omit<AktEintrag, 'id' | 'zeit' | 'rechner' | 'benutzer'> & { benutzer?: string }): void {
  const jetzt = new Date()
  kette = kette.then(async () => {
    try {
      const pc = await rechner()
      const datei = `${AKT_ORDNER}/${tag(jetzt)}_${pc.replace(/[^A-Z0-9_-]/gi, '_')}.json`
      const alt = (await api().netReadJsonAsync<AktEintrag[]>(datei).catch(() => null)) || []
      const eintrag: AktEintrag = {
        id: jetzt.getTime().toString(36) + Math.random().toString(36).slice(2, 6),
        zeit: jetzt.toISOString(), rechner: pc, benutzer: e.benutzer || benutzer(),
        art: e.art, quelle: e.quelle, aktion: e.aktion, ziel: e.ziel, grund: e.grund, ergebnis: e.ergebnis,
        details: e.details?.slice(0, 60),
      }
      const neu = [...(Array.isArray(alt) ? alt : []), eintrag].slice(-MAX_PRO_DATEI)
      await api().netWriteJsonAsync(datei, neu)
    } catch { /* Protokoll darf nie stören */ }
  })
}

/** Einträge der letzten `tage` Tage (alle Admin-PCs), neueste zuerst. */
export async function ladeAktivitaet(tage: number): Promise<AktEintrag[]> {
  const ab = new Date(); ab.setHours(0, 0, 0, 0); ab.setDate(ab.getDate() - (tage - 1))
  const grenze = tag(ab)
  let dateien: string[] = []
  try { dateien = await api().netListDirAsync(AKT_ORDNER) } catch { return [] }
  const passend = dateien.filter(n => /^\d{4}-\d{2}-\d{2}_.+\.json$/i.test(n) && n.slice(0, 10) >= grenze)
  const out: AktEintrag[] = []
  // gestaffelt lesen (max. 4 gleichzeitig) – UI bleibt flüssig
  for (let i = 0; i < passend.length; i += 4) {
    const teil = await Promise.all(passend.slice(i, i + 4).map(n => api().netReadJsonAsync<AktEintrag[]>(`${AKT_ORDNER}/${n}`).catch(() => null)))
    for (const t of teil) if (Array.isArray(t)) out.push(...t)
  }
  return out.sort((a, b) => b.zeit.localeCompare(a.zeit))
}

/** Mailversand (api().sendEmailRaw) mitschreiben: Empfänger + Betreff, nie der Text. Einmal beim Start aufrufen. */
export function starteMailProtokoll(): void {
  setzeMailHook((o, r) => {
    protokolliere({
      art: o.protokoll?.art || 'manuell',
      quelle: o.protokoll?.quelle || 'Mailversand',
      aktion: `Mail gesendet (${r.method || o.method || 'outlook'})${o.attachmentPath ? ' mit Anhang' : ''}`,
      ziel: [o.to, o.cc && `CC ${o.cc}`].filter(Boolean).join(' · ').slice(0, 300),
      ergebnis: r.success ? 'gesendet' : `fehlgeschlagen${r.error ? ': ' + r.error.slice(0, 200) : ''}`,
      details: [`Betreff: ${(o.subject || '').slice(0, 200)}`, ...(r.method === 'outlook' || (!r.method && (o.method || 'outlook') === 'outlook') ? ['Versand über Outlook per kurzlebiger geplanter Aufgabe „ITMailSend_…“ im Benutzerkontext'] : [])],
    })
  })
}

/** Standard-Auslöser, wenn ein Aufrufer keinen mitgibt. */
export const PER_KLICK = (quelle: string, grund?: string): AktAusloeser => ({ art: 'manuell', quelle, grund })
export const AUTOMATISCH = (quelle: string, grund?: string): AktAusloeser => ({ art: 'automatisch', quelle, grund })
