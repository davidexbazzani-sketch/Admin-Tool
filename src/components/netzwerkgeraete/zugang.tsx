// ── Netzwerkgeräte: gemeinsamer Zugang (PIN, Passwortzeile, Auto-Login) ──────────
// Gleiches Verhalten für alle Geräte (USV, Telefonanlage, …):
//   • Passwort anzeigen/kopieren und „Öffnen & anmelden" erst nach PIN 0506
//     (einmal pro Besuch des Bildschirms)
//   • „Öffnen & anmelden": Tool-Fenster, Benutzer+Passwort werden automatisch
//     eingetragen (IPC netzgeraet:openWeb); Passwort zusätzlich in der Zwischenablage
// Zugangsdaten liegen NICHT im Quelltext, sondern in resources/Netzwerkgeraete/<datei>.json
// (per .gitignore ausgeschlossen, beim Build eingebunden).

import { useState } from 'react'
import { Lock, Eye, EyeOff, Copy, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from '../../electronAPI'

export const NETZGERAETE_PIN = '0506'

interface ZugangsDatei { benutzer?: string; geraete: { ip: string; passwort: string; benutzer?: string }[] }
const dateien = import.meta.glob('../../../resources/Netzwerkgeraete/*.json', { eager: true, import: 'default' }) as Record<string, ZugangsDatei>

/** Zugangsdaten eines Geräts aus resources/Netzwerkgeraete/<datei>.json (null = Datei fehlt im Build). */
export function zugangFuer(datei: string, ip: string): { benutzer: string; passwort: string } | null {
  const d = Object.entries(dateien).find(([pfad]) => pfad.endsWith('/' + datei + '.json'))?.[1]
  const g = d?.geraete.find(x => x.ip === ip)
  if (!d || !g) return null
  return { benutzer: g.benutzer || d.benutzer || '', passwort: g.passwort }
}

/** PIN-Sperre: `mitPin(aktion)` führt die Aktion sofort aus, wenn schon entsperrt — sonst erst nach PIN. */
export function usePinSperre() {
  const [entsperrt, setEntsperrt] = useState(false)
  const [wartend, setWartend] = useState<null | (() => void)>(null)
  const [pin, setPin] = useState('')
  const [fehler, setFehler] = useState(false)

  function mitPin(aktion: () => void) {
    if (entsperrt) { aktion(); return }
    setPin(''); setFehler(false); setWartend(() => aktion)
  }
  function pruefen() {
    if (pin.trim() !== NETZGERAETE_PIN) { setFehler(true); return }
    setEntsperrt(true)
    const a = wartend; setWartend(null)
    a?.()
  }

  const pinDialog = wartend && (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-6" onClick={() => setWartend(null)}>
      <div className="bg-card border border-border rounded-xl shadow-2xl p-5 w-full max-w-xs" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1"><Lock size={16} className="text-blue-400" /><h3 className="text-sm font-semibold text-foreground">PIN eingeben</h3></div>
        <p className="text-xs text-muted-foreground mb-3">Für Passwörter und Anmeldung an den Netzwerkgeräten.</p>
        <input value={pin} onChange={e => { setPin(e.target.value); setFehler(false) }} autoFocus type="password" inputMode="numeric"
          onKeyDown={e => { if (e.key === 'Enter') pruefen() }}
          className="w-full px-3 py-2 text-center tracking-[0.4em] text-lg rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
        {fehler && <p className="mt-2 text-xs text-red-300 flex items-center gap-1"><AlertTriangle size={13} />PIN falsch.</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={() => setWartend(null)} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Abbrechen</button>
          <button onClick={pruefen} disabled={!pin} className="ml-auto px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">Weiter</button>
        </div>
      </div>
    </div>
  )

  return { entsperrt, mitPin, pinDialog }
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
