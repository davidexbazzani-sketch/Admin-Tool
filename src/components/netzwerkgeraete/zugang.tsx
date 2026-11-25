// ── Netzwerkgeräte: gemeinsamer Zugang (PIN, Passwortzeile, Auto-Login) ──────────
// Gleiches Verhalten für alle Geräte (USV, Telefonanlage, …):
//   • Passwort anzeigen/kopieren und „Öffnen & anmelden" erst nach PIN 0506
//     (einmal pro Besuch des Bildschirms)
//   • „Öffnen & anmelden": Tool-Fenster, Benutzer+Passwort werden automatisch
//     eingetragen (IPC netzgeraet:openWeb); Passwort zusätzlich in der Zwischenablage
// Zugangsdaten liegen NICHT im Quelltext, sondern in resources/Netzwerkgeraete/<datei>.json
// (per .gitignore ausgeschlossen, beim Build eingebunden).

import { useState } from 'react'
import { Lock, Eye, EyeOff, Copy, CheckCircle2 } from 'lucide-react'
import { api } from '../../electronAPI'
import { TOOL_PIN, usePinSperre as usePinSperreAllgemein } from '../PinSperre'

export const NETZGERAETE_PIN = TOOL_PIN

interface ZugangsDatei { benutzer?: string; geraete: { ip: string; passwort: string; benutzer?: string }[] }
const dateien = import.meta.glob('../../../resources/Netzwerkgeraete/*.json', { eager: true, import: 'default' }) as Record<string, ZugangsDatei>

/** Zugangsdaten eines Geräts aus resources/Netzwerkgeraete/<datei>.json (null = Datei fehlt im Build). */
export function zugangFuer(datei: string, ip: string): { benutzer: string; passwort: string } | null {
  const d = Object.entries(dateien).find(([pfad]) => pfad.endsWith('/' + datei + '.json'))?.[1]
  const g = d?.geraete.find(x => x.ip === ip)
  if (!d || !g) return null
  return { benutzer: g.benutzer || d.benutzer || '', passwort: g.passwort }
}

/** PIN-Sperre: `mitPin(aktion)` führt die Aktion sofort aus, wenn schon entsperrt — sonst erst nach PIN.
 *  Der Baustein selbst liegt in components/PinSperre.tsx (auch für die Einstellungen genutzt). */
export function usePinSperre(hinweis = 'Für Passwörter und Anmeldung an den Netzwerkgeräten.') {
  return usePinSperreAllgemein(hinweis)
}

/** Zeile „Passwort ••••" mit Anzeigen/Kopieren (beides hinter der PIN). */
export function PasswortZeile({ passwort, entsperrt, mitPin, label = 'Passwort' }: {
  passwort: string; entsperrt: boolean; mitPin: (a: () => void) => void; label?: string
}) {
  const [sichtbar, setSichtbar] = useState(false)
  const [kopiert, setKopiert] = useState(false)
  async function kopieren() {
    try { await navigator.clipboard.writeText(passwort); setKopiert(true); setTimeout(() => setKopiert(false), 2000) } catch { /* egal */ }
  }
  const zeigen = entsperrt && sichtbar
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
      <Lock size={13} className="text-muted-foreground shrink-0" />
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <code className="flex-1 font-mono text-sm text-foreground truncate select-text">{zeigen ? passwort : '••••••••••••'}</code>
      <button onClick={() => mitPin(() => setSichtbar(v => !v))} disabled={!passwort}
        title={zeigen ? 'Verbergen' : 'Anzeigen (PIN)'} className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-40">
        {zeigen ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
      <button onClick={() => mitPin(() => void kopieren())} disabled={!passwort}
        title="Kopieren (PIN)" className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-40">
        {kopiert ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
      </button>
    </div>
  )
}

/** Weboberfläche im Tool-Fenster öffnen; Benutzer+Passwort automatisch eintragen (Passwort zusätzlich in die Zwischenablage). */
export async function oeffneMitLogin(o: { url: string; title: string; benutzer: string; passwort: string }): Promise<{ ok: boolean; text: string }> {
  try { await navigator.clipboard.writeText(o.passwort) } catch { /* egal */ }
  const r = await api().netzgeraetOpenWeb({ url: o.url, title: o.title, user: o.benutzer, pass: o.passwort })
  return r.success
    ? { ok: true, text: `${o.title} wird geöffnet — Anmeldung läuft automatisch (Passwort liegt zusätzlich in der Zwischenablage).` }
    : { ok: false, text: r.error || 'Fenster konnte nicht geöffnet werden.' }
}

/** Im Standardbrowser öffnen; Passwort vorher in die Zwischenablage. */
export async function oeffneImBrowser(o: { url: string; title: string; passwort: string }): Promise<{ ok: boolean; text: string }> {
  try { await navigator.clipboard.writeText(o.passwort) } catch { /* egal */ }
  const r = await api().openInEdgeOrChrome(o.url)
  return r.success
    ? { ok: true, text: `${o.title} im Browser geöffnet — Passwort liegt in der Zwischenablage (Strg+V).` }
    : { ok: false, text: r.error || 'Browser konnte nicht geöffnet werden.' }
}
