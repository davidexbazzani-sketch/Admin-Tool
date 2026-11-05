// ── Mail an ausgewählte Lizenz-Inhaber ──────────────────────────────────────────
// Eine persönliche Mail je Person: `{vorname}` wird ersetzt, geduzt wird im Text.
// Betreff und Text sind frei anpassbar (der letzte Stand bleibt je Nutzer lokal
// gespeichert). Bereits angeschriebene Personen sind vorab abgewählt.

import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Mail, RotateCcw, Send, X, XCircle } from 'lucide-react'
import { api } from '../../electronAPI'
import {
  PLATZHALTER_VORNAME, standardVorlage, setzeEin, protokolliereMails, type MailEintrag, type MailVorlage,
} from '../../services/xelionMail'

export interface MailEmpfaenger { key: string; name: string; email: string; vorname: string }

/** Ab so vielen Empfängern öffnet „in Outlook öffnen" zu viele Fenster auf einmal. */
const MAX_ENTWUERFE = 15

function ladeVorlage(speicherKey: string, absender: string): MailVorlage {
  try {
    const roh = localStorage.getItem(speicherKey)
    if (roh) { const v = JSON.parse(roh) as MailVorlage; if (v.betreff !== undefined && v.text) return v }
  } catch { /* Standard */ }
  return standardVorlage(absender)
}

export default function XelionMailDialog({ empfaenger, absender, protokoll, onClose, onProtokoll }: {
  empfaenger: MailEmpfaenger[]
  absender: string
  protokoll: Record<string, MailEintrag[]>
  onClose: () => void
  onProtokoll: (p: Record<string, MailEintrag[]>) => void
}) {
  const speicherKey = `xelion.mailVorlage.${absender || 'default'}`
  const [vorlage, setVorlage] = useState<MailVorlage>(() => ladeVorlage(speicherKey, absender))
  const [vornamen, setVornamen] = useState<Record<string, string>>(() => Object.fromEntries(empfaenger.map(e => [e.key, e.vorname])))
  // Schon einmal angeschrieben → vorab abgewählt (kann bewusst wieder angehakt werden)
  const [an, setAn] = useState<Set<string>>(() => new Set(empfaenger.filter(e => e.email && !protokoll[e.key]?.length).map(e => e.key)))
  const [vorschauKey, setVorschauKey] = useState(() => empfaenger.find(e => e.email)?.key ?? '')
  const [laeuft, setLaeuft] = useState(false)
  const [ergebnis, setErgebnis] = useState<{ key: string; ok: boolean; text: string }[]>([])
  const [bestaetigen, setBestaetigen] = useState(false)

  const ziel = useMemo(() => empfaenger.filter(e => an.has(e.key) && e.email), [empfaenger, an])
  const ohneVorname = ziel.filter(e => !(vornamen[e.key] || '').trim())
  const ohnePlatzhalter = !vorlage.text.includes(PLATZHALTER_VORNAME)
  const vorschau = empfaenger.find(e => e.key === vorschauKey)

  function aendere(v: MailVorlage) {
    setVorlage(v)
    try { localStorage.setItem(speicherKey, JSON.stringify(v)) } catch { /* nur Komfort */ }
  }
  function zuruecksetzen() {
    const v = standardVorlage(absender)
    setVorlage(v)
    try { localStorage.removeItem(speicherKey) } catch { /* egal */ }
  }

  async function los(modus: 'senden' | 'entwurf') {
    setBestaetigen(false)
    setLaeuft(true)
    const res: { key: string; ok: boolean; text: string }[] = []
    const gesendet: Record<string, MailEintrag> = {}
    for (const e of ziel) {
      const body = setzeEin(vorlage.text, (vornamen[e.key] || '').trim())
      const betreff = setzeEin(vorlage.betreff, (vornamen[e.key] || '').trim())
      try {
        if (modus === 'entwurf') {
          await api().composeEmail({ to: e.email, cc: '', subject: betreff, body })
          res.push({ key: e.key, ok: true, text: 'in Outlook geöffnet' })
        } else {
          const r = await api().sendEmailRaw({ to: e.email, subject: betreff, body, smtp: '', port: 0, method: 'outlook' })
          res.push({ key: e.key, ok: !!r.success, text: r.success ? `gesendet an ${e.email}` : (r.error || 'Versand fehlgeschlagen') })
          if (r.success) gesendet[e.key] = { am: new Date().toISOString(), von: absender, betreff, an: e.email }
        }
      } catch (err) {
        res.push({ key: e.key, ok: false, text: err instanceof Error ? err.message : String(err) })
      }
      setErgebnis([...res])
    }
    if (Object.keys(gesendet).length) {
      try { onProtokoll(await protokolliereMails(gesendet)) }
      catch { res.push({ key: '', ok: false, text: 'Mails sind raus, aber das Protokoll auf dem Netzlaufwerk konnte nicht geschrieben werden.' }); setErgebnis([...res]) }
    }
    setLaeuft(false)
  }

  const ergebnisVon = (key: string) => ergebnis.find(r => r.key === key)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => !laeuft && onClose()}>
      <div className="bg-card border border-border rounded-xl w-[1000px] max-w-full max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <Mail size={16} className="text-foreground" />
          <h2 className="text-base font-semibold text-foreground">Mail an Auswahl ({empfaenger.length})</h2>
          <button onClick={onClose} disabled={laeuft} className="ml-auto text-muted-foreground hover:text-foreground disabled:opacity-40"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-[1fr_340px] gap-4 p-5">
          {/* ── Text ── */}
          <div className="space-y-2 min-w-0">
            <label className="block">
              <span className="text-[11px] text-muted-foreground">Betreff</span>
              <input value={vorlage.betreff} onChange={e => aendere({ ...vorlage, betreff: e.target.value })} disabled={laeuft}
                className="mt-0.5 w-full px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary" />
            </label>
            <label className="block">
              <span className="text-[11px] text-muted-foreground">
                Text — <span className="font-mono text-foreground">{PLATZHALTER_VORNAME}</span> wird je Person durch den Vornamen ersetzt
              </span>
              <textarea value={vorlage.text} onChange={e => aendere({ ...vorlage, text: e.target.value })} disabled={laeuft} rows={14}
                className="mt-0.5 w-full px-2.5 py-2 text-sm rounded-md bg-background border border-border text-foreground resize-y focus:outline-none focus:border-primary" />
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={zuruecksetzen} disabled={laeuft}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40">
                <RotateCcw size={11} />Standardtext (Xelion oder Teams?)
              </button>
              {ohnePlatzhalter && (
                <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                  <AlertTriangle size={11} />Im Text fehlt {PLATZHALTER_VORNAME} — die Anrede wäre nicht persönlich.
                </span>
              )}
            </div>
            {vorschau && (
              <div className="rounded-md border border-border bg-muted/20 p-3">
                <p className="text-[11px] text-muted-foreground mb-1.5">Vorschau für <b className="text-foreground">{vorschau.name}</b> ({vorschau.email})</p>
                <p className="text-xs font-semibold text-foreground mb-1">{setzeEin(vorlage.betreff, vornamen[vorschau.key] || '')}</p>
                <p className="text-xs text-foreground whitespace-pre-wrap">{setzeEin(vorlage.text, vornamen[vorschau.key] || '')}</p>
              </div>
            )}
          </div>

          {/* ── Empfänger ── */}
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-foreground font-semibold">Empfänger · {ziel.length} von {empfaenger.length}</span>
              <button onClick={() => setAn(new Set(empfaenger.filter(e => e.email).map(e => e.key)))} disabled={laeuft} className="ml-auto underline text-muted-foreground hover:text-foreground">alle</button>
              <button onClick={() => setAn(new Set())} disabled={laeuft} className="underline text-muted-foreground hover:text-foreground">keine</button>
            </div>
            <p className="text-[10px] text-muted-foreground">Vorname prüfen und bei Bedarf korrigieren. Klick auf eine Zeile zeigt die Vorschau.</p>
            <div className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
              {empfaenger.map(e => {
                const schon = protokoll[e.key] ?? []
                const r = ergebnisVon(e.key)
                return (
                  <div key={e.key} onClick={() => setVorschauKey(e.key)}
                    className={`rounded-md border px-2 py-1.5 cursor-pointer ${vorschauKey === e.key ? 'border-primary' : 'border-border'} ${an.has(e.key) ? '' : 'opacity-60'}`}>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" className="accent-primary" checked={an.has(e.key)} disabled={!e.email || laeuft}
                        onClick={ev => ev.stopPropagation()}
                        onChange={ev => setAn(s => { const n = new Set(s); if (ev.target.checked) n.add(e.key); else n.delete(e.key); return n })} />
                      <span className="text-xs text-foreground truncate flex-1" title={e.email || 'keine E-Mail-Adresse'}>{e.name}</span>
                      <input value={vornamen[e.key] ?? ''} disabled={laeuft} placeholder="Vorname"
                        onClick={ev => ev.stopPropagation()}
                        onChange={ev => setVornamen(v => ({ ...v, [e.key]: ev.target.value }))}
                        className="w-24 px-1.5 py-0.5 text-[11px] rounded border border-border bg-background text-foreground focus:outline-none focus:border-primary" />
                    </div>
                    {!e.email && <p className="text-[10px] text-amber-400 pl-5">keine E-Mail-Adresse</p>}
                    {schon.length > 0 && (
                      <p className="text-[10px] text-amber-400 pl-5" title={schon.map(s => `${new Date(s.am).toLocaleString('de-DE')} · ${s.von} · ${s.betreff}`).join('\n')}>
                        bereits angeschrieben am {new Date(schon[schon.length - 1].am).toLocaleDateString('de-DE')} von {schon[schon.length - 1].von}
                      </p>
                    )}
                    {r && (
                      <p className={`text-[10px] pl-5 inline-flex items-center gap-1 ${r.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r.ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}{r.text}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-t border-border">
          {ohneVorname.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
              <AlertTriangle size={11} />Bei {ohneVorname.length} Empfänger(n) fehlt der Vorname.
            </span>
          )}
          {ergebnis.find(r => !r.key) && <span className="text-[11px] text-red-400">{ergebnis.find(r => !r.key)!.text}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} disabled={laeuft} className="px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
              {ergebnis.length ? 'Schließen' : 'Abbrechen'}
            </button>
            <button onClick={() => void los('entwurf')} disabled={laeuft || !ziel.length || ziel.length > MAX_ENTWUERFE || ohneVorname.length > 0}
              title={ziel.length > MAX_ENTWUERFE ? `Mehr als ${MAX_ENTWUERFE} Outlook-Fenster auf einmal — bitte direkt senden` : 'Jede Mail als Entwurf in Outlook öffnen und selbst absenden'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
              <Mail size={12} />In Outlook öffnen ({ziel.length})
            </button>
            {bestaetigen ? (
              <>
                <span className="text-[11px] text-foreground">{ziel.length} Mail(s) jetzt wirklich senden?</span>
                <button onClick={() => void los('senden')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">
                  <Send size={12} />Ja, senden
                </button>
                <button onClick={() => setBestaetigen(false)} className="px-2 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent">Nein</button>
              </>
            ) : (
              <button onClick={() => setBestaetigen(true)} disabled={laeuft || !ziel.length || ohneVorname.length > 0 || !vorlage.betreff.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                {laeuft ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}Direkt senden ({ziel.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
