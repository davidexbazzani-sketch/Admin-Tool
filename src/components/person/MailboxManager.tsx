// ── Gruppenpostfächer im Personen-Dossier: einhängen und aushängen ──────────
// Die Anzeige (AD-AutoMapping + live aus dem Outlook-Profil) bleibt wie gehabt; hier
// kommen die Bedienelemente dazu. Technisch läuft alles über Exchange-AutoMapping —
// warum, steht in src/services/mailboxAccess.ts.

import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Loader2, Mail, Plus, Search, Send, X } from 'lucide-react'
import {
  findeExchangeWeg, haengePostfachEin, haengePostfachAus, sendeNachricht, baueNachricht,
  type ExchangeWeg, type MailboxErgebnis,
} from '../../services/mailboxAccess'
import { leseProfilAufbau, type ProfilAufbau } from '../../services/outlookProfilDiagnose'

export interface PostfachZeile { name: string; email: string; live?: boolean }

export default function MailboxManager({ sam, email, eintraege, hosts = [], onAktualisieren }: {
  /** SamAccountName des Benutzers — ohne ihn lässt sich nichts zuordnen. */
  sam: string
  /** E-Mail des Benutzers für die optionale Nachricht. */
  email: string
  eintraege: PostfachZeile[]
  /** Rechner dieser Person — für das Auslesen des Outlook-Profils. */
  hosts?: string[]
  /** Nach einer Änderung die Postfachliste neu laden. */
  onAktualisieren: () => void
}) {
  const [weg, setWeg] = useState<ExchangeWeg | null>(null)
  const [neu, setNeu] = useState('')
  const [benachrichtigen, setBenachrichtigen] = useState(true)
  const [busy, setBusy] = useState('')
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  // Rückfrage, wenn der Vollzugriff noch fehlt (läuft normalerweise über ServiceNow)
  const [rechteFrage, setRechteFrage] = useState<string>('')
  // Rückfrage beim Aushängen: nur ausblenden oder Zugriff entziehen?
  const [austragen, setAustragen] = useState<PostfachZeile | null>(null)
  const [detailsOffen, setDetailsOffen] = useState(false)
  // Profil-Auslesung (nur lesen) — klärt, wie „Zusätzlich diese Postfächer öffnen"
  // auf einem echten Rechner gespeichert ist.
  const [profilHost, setProfilHost] = useState(hosts[0] || '')
  const [profilSuche, setProfilSuche] = useState(eintraege[0]?.name || '')
  const [profilLaeuft, setProfilLaeuft] = useState(false)
  const [profil, setProfil] = useState<ProfilAufbau | null>(null)
  const [profilOffen, setProfilOffen] = useState(false)

  async function profilLesen() {
    if (profilLaeuft) return
    setProfilLaeuft(true); setProfil(null)
    setProfil(await leseProfilAufbau(profilHost, profilSuche))
    setProfilLaeuft(false)
  }

  // Mit dem Benutzer prüfen: nur so lässt sich an dessen AD-Objekt ablesen, ob sein
  // Postfach on-prem oder in Exchange Online liegt.
  useEffect(() => { void findeExchangeWeg(false, sam || undefined).then(setWeg) }, [sam])

  const bereit = weg?.ok === true

  /** Nach einer erfolgreichen Änderung: optional benachrichtigen und neu laden. */
  async function nachbereiten(erg: MailboxErgebnis, postfach: string, art: 'hinzugefuegt' | 'entfernt') {
    let text = erg.text
    if (erg.ok && benachrichtigen) {
      const mail = await sendeNachricht(email, postfach, art)
      text += `\n${mail.ok ? '✓ ' : '⚠ '}${mail.text}`
    }
    setMeldung({ ok: erg.ok, text })
    if (erg.ok) onAktualisieren()
  }

  async function einhaengen(mitRechten: boolean) {
    const mb = neu.trim()
    if (!mb || busy) return
    setBusy('add'); setMeldung(null); setRechteFrage('')
    const erg = await haengePostfachEin(mb, sam, { darfRechteVergeben: mitRechten })
    // Fehlt der Vollzugriff, nicht einfach scheitern — ausdrücklich nachfragen.
    if (!erg.ok && erg.text.includes('noch keinen Vollzugriff')) {
      setRechteFrage(mb); setMeldung({ ok: false, text: erg.text }); setBusy(''); return
    }
    await nachbereiten(erg, mb, 'hinzugefuegt')
    if (erg.ok) setNeu('')
    setBusy('')
  }

  /**
   * Nur die Nachricht verschicken — ohne Exchange. Deckt den Fall ab, dass das Postfach
   * von Hand in den Outlook-Kontoeinstellungen eingebunden wurde und nur noch der
   * Hinweis an den Benutzer fehlt.
   */
  async function nurNachricht() {
    const mb = neu.trim()
    if (!mb || busy) return
    setBusy('mail'); setMeldung(null)
    const mail = await sendeNachricht(email, mb, 'hinzugefuegt')
    setMeldung(mail.ok ? { ok: true, text: mail.text } : { ok: false, text: mail.text })
    if (mail.ok) setNeu('')
    setBusy('')
  }

  async function aushaengen(zeile: PostfachZeile, nurAushaengen: boolean) {
    if (busy) return
    const mb = zeile.email || zeile.name
    setBusy('del'); setMeldung(null); setAustragen(null)
    const erg = await haengePostfachAus(mb, sam, { nurAushaengen })
    await nachbereiten(erg, zeile.name || mb, 'entfernt')
    setBusy('')
  }

  const vorschau = baueNachricht(neu.trim() || 'Postfachname', 'hinzugefuegt')

  return (
    <div className="space-y-1.5">
      {/* ── Vorhandene Postfächer ──────────────────────────────────────────── */}
      {eintraege.map((m, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5 pl-1">
          <Mail size={11} className="shrink-0 text-blue-400" />
          <span className="text-xs text-foreground min-w-0 flex-1 break-words">{m.name}</span>
          {m.email && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{m.email}</span>}
          <span className={`text-[9px] px-1 py-0.5 rounded shrink-0 ${m.live
            ? 'bg-green-500/15 text-green-400 border border-green-500/25'
            : 'bg-muted/30 text-muted-foreground border border-border'}`}
            title={m.live ? 'Tatsächlich in Outlook eingebunden (live)' : 'Vollzugriff/AutoMapping laut AD'}>
            {m.live ? 'eingebunden' : 'AD'}
          </span>
          <button
            type="button"
            onClick={() => setAustragen(m)}
            disabled={!bereit || !sam || !!busy}
            title={bereit ? `„${m.name}" bei diesem Benutzer aushängen` : 'Exchange ist nicht erreichbar'}
            className="shrink-0 p-0.5 rounded text-muted-foreground/70 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <X size={12} />
          </button>
        </div>
      ))}

      {/* ── Rückfrage beim Aushängen ───────────────────────────────────────── */}
      {austragen && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 space-y-2">
          <p className="text-[11px] text-amber-200">
            „{austragen.name}" bei diesem Benutzer aushängen — was soll passieren?
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => void aushaengen(austragen, true)} disabled={!!busy}
              className="px-2.5 py-1 text-[11px] rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              Nur ausblenden
            </button>
            <button onClick={() => void aushaengen(austragen, false)} disabled={!!busy}
              className="px-2.5 py-1 text-[11px] rounded-md font-semibold border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 disabled:opacity-40">
              Vollzugriff entziehen
            </button>
            <button onClick={() => setAustragen(null)} className="text-[11px] text-muted-foreground hover:text-foreground">Abbrechen</button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            „Nur ausblenden" lässt die Berechtigung bestehen — Outlook zeigt das Postfach nicht mehr automatisch, der Benutzer
            kommt bei Bedarf weiter heran. „Vollzugriff entziehen" nimmt ihm das Recht ganz; das wird sonst über ServiceNow geregelt.
          </p>
        </div>
      )}

      {/* ── Hinzufügen ─────────────────────────────────────────────────────── */}
      <div className="pt-1.5 mt-1 border-t border-border/50 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            value={neu}
            onChange={e => setNeu(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void einhaengen(false) }}
            placeholder="Postfach (E-Mail-Adresse oder Name)"
            className="flex-1 min-w-0 px-2 py-1 text-[11px] font-mono rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void einhaengen(false)}
            disabled={!bereit || !sam || !neu.trim() || !!busy}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {busy === 'add' ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}Einhängen
          </button>
          <button
            type="button"
            onClick={() => void nurNachricht()}
            disabled={!email || !neu.trim() || !!busy}
            title={email ? 'Nur die Nachricht an den Benutzer schicken — ohne Exchange, für von Hand eingebundene Postfächer' : 'Keine E-Mail-Adresse des Benutzers bekannt'}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            {busy === 'mail' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}Nur Nachricht
          </button>
        </div>

        <label className="flex items-start gap-1.5 cursor-pointer">
          <input type="checkbox" checked={benachrichtigen} onChange={e => setBenachrichtigen(e.target.checked)}
            className="accent-primary mt-0.5 shrink-0" />
          <span className="text-[10px] text-muted-foreground">
            Benutzer benachrichtigen{email ? <span className="font-mono"> ({email})</span> : <span className="text-amber-400"> — keine E-Mail-Adresse bekannt</span>}
            <span className="block text-muted-foreground/70 italic mt-0.5 whitespace-pre-line">{vorschau.text}</span>
          </span>
        </label>
      </div>

      {/* ── Rückfrage Rechtevergabe ────────────────────────────────────────── */}
      {rechteFrage && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 space-y-2">
          <p className="text-[11px] text-amber-200">
            Soll der Vollzugriff auf „{rechteFrage}" hier gleich mitvergeben werden? Normalerweise läuft das über ServiceNow.
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => void einhaengen(true)} disabled={!!busy}
              className="px-2.5 py-1 text-[11px] rounded-md font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40">
              Vollzugriff vergeben und einhängen
            </button>
            <button onClick={() => { setRechteFrage(''); setMeldung(null) }} className="text-[11px] text-muted-foreground hover:text-foreground">Abbrechen</button>
          </div>
        </div>
      )}

      {/* ── Rückmeldungen ──────────────────────────────────────────────────── */}
      {meldung && (
        <div className={`flex items-start gap-1.5 px-2 py-1.5 rounded-md text-[10px] border ${
          meldung.ok ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-red-500/30 bg-red-500/5 text-red-300'
        }`}>
          {meldung.ok ? <Check size={11} className="shrink-0 mt-px" /> : <AlertTriangle size={11} className="shrink-0 mt-px" />}
          <span className="whitespace-pre-line break-words">{meldung.text}</span>
        </div>
      )}

      {!sam && (
        <p className="text-[10px] text-amber-400">
          Für diese Person ist kein AD-Konto aufgelöst — ohne das lässt sich kein Postfach zuordnen.
        </p>
      )}

      {/* Zustand des Exchange-Zugangs offenlegen, statt die Knöpfe wortlos zu sperren. */}
      {/* Bewusst leise: solange der Exchange-Weg hier nicht offensteht, erscheint dieser
          Hinweis in JEDEM Personen-Dossier. Als gelber Warnkasten wäre das dauerhafte
          Stör-Optik für etwas, das der Bediener ohnehin nicht ändern kann — deshalb eine
          unauffällige Zeile; die Einzelheiten bleiben einen Klick entfernt. */}
      {weg && !weg.ok && (
        <div className="space-y-1">
          <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
            <AlertTriangle size={11} className="shrink-0 mt-px opacity-60" />
            <span>
              Ein- und Aushängen über Exchange ist hier nicht möglich.{' '}
              <span className="text-muted-foreground">„Nur Nachricht" funktioniert.</span>
            </span>
          </p>
          <div className="flex items-center gap-2 pl-4">
            <button onClick={() => { setWeg(null); void findeExchangeWeg(true, sam || undefined).then(setWeg) }}
              className="text-[10px] underline text-muted-foreground hover:text-foreground">erneut prüfen</button>
            {weg.details.length > 0 && (
              <button onClick={() => setDetailsOffen(o => !o)}
                className="text-[10px] underline text-muted-foreground hover:text-foreground">
                {detailsOffen ? 'Einzelheiten ausblenden' : `Einzelheiten (${weg.details.length})`}
              </button>
            )}
          </div>
          {detailsOffen && (
            <div className="pl-4 space-y-0.5">
              {/* Die Begründung steht hier statt in der Zeile darüber — sichtbar, wenn
                  man sie sucht, aber nicht dauerhaft im Blickfeld. */}
              <p className="text-[10px] text-foreground break-words">{weg.text}</p>
              <ul className="space-y-0.5">
                {weg.details.map((z, i) => (
                  <li key={i} className="text-[10px] text-muted-foreground break-words">· {z}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {!weg && <p className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><Loader2 size={9} className="animate-spin" />Exchange-Zugang wird geprüft …</p>}

      {/* ── Profil-Aufbau auslesen (nur lesen) ──────────────────────────────── */}
      <div className="pt-1.5 border-t border-border/50">
        <button onClick={() => setProfilOffen(o => !o)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline">
          {profilOffen ? 'Profil-Aufbau ausblenden' : 'Outlook-Profil auslesen (nur lesen)'}
        </button>
        {profilOffen && (
          <div className="mt-1.5 space-y-1.5">
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Liest auf dem gewählten Rechner aus, in welchem Registry-Wert die Liste
              „Zusätzlich diese Postfächer öffnen" steht. <b>Es wird nichts verändert.</b>{' '}
              Such nach dem Namen eines Postfachs, das dort wirklich eingebunden ist.
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <input value={profilHost} onChange={e => setProfilHost(e.target.value)} placeholder="Rechner"
                className="w-40 px-2 py-1 text-[11px] font-mono rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              <input value={profilSuche} onChange={e => setProfilSuche(e.target.value)} placeholder="Name eines eingebundenen Postfachs"
                className="flex-1 min-w-[12rem] px-2 py-1 text-[11px] rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
              <button onClick={() => void profilLesen()} disabled={profilLaeuft || !profilHost.trim() || !profilSuche.trim()}
                className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md border border-border hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-40">
                {profilLaeuft ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}Auslesen
              </button>
            </div>
            {hosts.length > 1 && (
              <div className="flex items-center gap-1 flex-wrap">
                {hosts.map(h => (
                  <button key={h} onClick={() => setProfilHost(h)}
                    className={`px-1.5 py-0.5 text-[9px] rounded border font-mono ${profilHost === h ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent'}`}>{h}</button>
                ))}
              </div>
            )}
            {profil?.fehler && <p className="text-[10px] text-red-300">{profil.fehler}</p>}
            {profil?.ok && (
              <>
                <p className="text-[10px] text-muted-foreground">
                  {profil.profile.length} Profil(e), {profil.treffer.length} Treffer. Diesen Text bitte kopieren und mir schicken:
                </p>
                <textarea readOnly value={profil.rohtext} rows={10}
                  onFocus={e => e.currentTarget.select()}
                  className="w-full px-2 py-1 text-[10px] font-mono rounded-md border border-border bg-background text-foreground" />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
