// ── Checkliste → „Übergabe-Termin" ────────────────────────────────────────────
// Datum + frei wählbare Zeitspanne + Raum → Outlook-Einladung an den Mitarbeiter
// (IT-Support als optionaler Teilnehmer = „CC"). Text je nach Neu/Refresh, mit Bitte um
// Alternativvorschlag. Zweiter Teil: Mail „erste Anmeldung" (Raum E10/E11).
// Termin landet im gemeinsamen Übergabe-Kalender (services/uebergabeTermine.ts).

import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, X, Loader2, Send, Mail, AlertTriangle, CheckCircle2, LogIn, ExternalLink } from 'lucide-react'
import type { Checklist } from '../../services/checklists'
import {
  baueEinladung, baueErstanmeldeMail, emailFuer, sendeEinladung, aktualisiereEinladung, sendeMail, oeffneMail,
  neuerTermin, aendereTermin, standardZeitraum, artVon, zeitraumText, ausLokal, IT_SUPPORT_MAIL, RAEUME,
  type UebergabeTermin, type TerminStore,
} from '../../services/uebergabeTermine'

const p2 = (n: number) => String(n).padStart(2, '0')

export default function UebergabeTerminDialog({ checklist, termin, kennung, bearbeiterName, onClose, onGeaendert }: {
  checklist: Checklist
  termin?: UebergabeTermin
  kennung: string
  bearbeiterName: string
  onClose: () => void
  onGeaendert: (s: TerminStore) => void
}) {
  const art = artVon(checklist)
  const std = standardZeitraum()
  const [datum, setDatum] = useState(termin ? termin.start.slice(0, 10) : std.datum)
  const [von, setVon] = useState(termin ? termin.start.slice(11, 16) : std.von)
  const [bis, setBis] = useState(termin ? termin.ende.slice(11, 16) : std.bis)
  const [raum, setRaum] = useState(termin?.raum || RAEUME[0])
  const [to, setTo] = useState(termin?.email || '')
  const [cc, setCc] = useState(IT_SUPPORT_MAIL)
  const [mailLaedt, setMailLaedt] = useState(!termin?.email)
  const [eigenerText, setEigenerText] = useState<{ subject: string; body: string } | null>(null)
  // Standard: Nachricht als Outlook-Termin (Kalendereintrag beim Mitarbeiter); abwählbar → reine Mail
  const [mitTermin, setMitTermin] = useState(true)
  const [busy, setBusy] = useState<'' | 'senden' | 'outlook' | 'anm-senden' | 'anm-outlook'>('')
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)
  // Erste Anmeldung
  const [anmRaum, setAnmRaum] = useState(RAEUME[0])
  const [anmWann, setAnmWann] = useState('')
  const [anmText, setAnmText] = useState<string | null>(null)

  useEffect(() => {
    if (termin?.email) return
    let ab = false
    void emailFuer(checklist.name, checklist.corpId).then(e => { if (!ab) { setTo(t => t || e); setMailLaedt(false) } })
    return () => { ab = true }
  }, [checklist, termin])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const start = `${datum}T${von}`, ende = `${datum}T${bis}`
  const zeitOk = !!datum && /^\d{2}:\d{2}$/.test(von) && /^\d{2}:\d{2}$/.test(bis) && bis > von
  const vergangen = zeitOk && ausLokal(ende).getTime() < Date.now()
  const vorschlag = useMemo(() => zeitOk ? baueEinladung({ name: checklist.name, art, start, ende, raum, bearbeiter: bearbeiterName, mitTermin }) : null,
    [checklist.name, art, start, ende, raum, bearbeiterName, zeitOk, mitTermin])
  const text = eigenerText ?? vorschlag
  const anmVorschlag = baueErstanmeldeMail({ name: checklist.name, raum: anmRaum, bearbeiter: bearbeiterName, wann: anmWann })
  const geaendert = !!termin && (termin.start !== start || termin.ende !== ende || termin.raum !== raum)
  // Es gibt schon einen Outlook-Termin (gesendet oder im Fenster geöffnet) → Änderungen nur als Update, kein zweiter Termin
  const bestehenderTermin = !!termin?.outlook?.entryId

  /** weg: 'senden' = direkt verschicken · 'outlook' = im Outlook-Fenster öffnen, Benutzer sendet selbst */
  async function versenden(weg: 'senden' | 'outlook') {
    if (!text || !zeitOk || !to.trim()) return
    setBusy(weg); setMeldung(null)
    try {
      if (bestehenderTermin) {
        // Bestehende Einladung verschieben → Outlook-Update an den Mitarbeiter
        const aktualisiert = { ...termin, start, ende, raum }
        const r = await aktualisiereEinladung(aktualisiert, bearbeiterName)
        if (!r.ok) { setMeldung({ ok: false, text: 'Outlook-Update fehlgeschlagen: ' + r.error }); return }
        const s = await aendereTermin(termin.id, kennung, { start, ende, raum, email: to.trim(), status: 'verschoben', outlook: { ...termin.outlook!, veraltet: false, geoeffnet: false } },
          `Termin geändert und Update an ${to.trim()} gesendet: ${zeitraumText(termin.start, termin.ende, true)} → ${zeitraumText(start, ende, true)}, Raum ${raum}`)
        if (s) onGeaendert(s)
        setMeldung({ ok: true, text: 'Termin geändert — der Mitarbeiter hat ein Outlook-Update bekommen.' })
        return
      }
      const anzeigen = weg === 'outlook'
      const jetzt = new Date().toISOString()
      let outlook = termin?.outlook
      if (mitTermin) {
        const r = await sendeEinladung({ to: to.trim(), cc, subject: text.subject, body: text.body, start, ende, raum, anzeigen })
        if (!r.ok) { setMeldung({ ok: false, text: `Termin konnte nicht ${anzeigen ? 'in Outlook geöffnet' : 'gesendet'} werden: ${r.error}` }); return }
        outlook = { entryId: r.entryId || '', globalId: r.globalId, gesendetAt: jetzt, gesendetBy: kennung, geoeffnet: anzeigen }
      } else {
        const r = anzeigen ? await oeffneMail(to.trim(), cc, text.subject, text.body) : await sendeMail(to.trim(), cc, text.subject, text.body)
        if (!r.ok) { setMeldung({ ok: false, text: `Mail konnte nicht ${anzeigen ? 'in Outlook geöffnet' : 'gesendet'} werden: ${r.error}` }); return }
      }
      const nachricht = { art: mitTermin ? 'termin' as const : 'mail' as const, weg: anzeigen ? 'geoeffnet' as const : 'gesendet' as const, at: jetzt, by: kennung, an: to.trim() }
      const was = mitTermin ? 'Termineinladung' : 'Mail (ohne Outlook-Termin)'
      const verlauf = `${was} an ${to.trim()} ${anzeigen ? 'im Outlook-Fenster geöffnet (dort abzusenden)' : 'gesendet'}, CC ${cc || '—'}`
      let s: TerminStore | null
      if (termin) {
        s = await aendereTermin(termin.id, kennung, { start, ende, raum, email: to.trim(), outlook, nachricht, status: 'geplant' }, verlauf)
      } else {
        s = (await neuerTermin({
          checklistId: checklist.id, titel: `Übergabe ${checklist.name}`, name: checklist.name, corpId: checklist.corpId, email: to.trim(),
          art, start, ende, raum, status: 'geplant', outlook, nachricht, createdBy: kennung,
        })).store
      }
      if (s) onGeaendert(s)
      setMeldung({ ok: true, text: anzeigen
        ? `${was} ist im Outlook-Fenster geöffnet — bitte dort prüfen und absenden. Der Termin steht bereits im Übergabe-Kalender.`
        : `${was} an ${to.trim()} gesendet und im Übergabe-Kalender eingetragen.` })
    } finally { setBusy('') }
  }

  async function ersteAnmeldung(weg: 'senden' | 'outlook') {
    if (!to.trim()) return
    const anzeigen = weg === 'outlook'
    setBusy(anzeigen ? 'anm-outlook' : 'anm-senden'); setMeldung(null)
    try {
      const body = anmText ?? anmVorschlag.body
      const r = anzeigen ? await oeffneMail(to.trim(), cc, anmVorschlag.subject, body) : await sendeMail(to.trim(), cc, anmVorschlag.subject, body)
      if (!r.ok) { setMeldung({ ok: false, text: `Mail konnte nicht ${anzeigen ? 'in Outlook geöffnet' : 'gesendet'} werden: ${r.error}` }); return }
      if (termin) {
        const s = await aendereTermin(termin.id, kennung, { ersteAnmeldung: { at: new Date().toISOString(), by: kennung, raum: anmRaum, weg: anzeigen ? 'geoeffnet' : 'gesendet' } },
          `Mail „erste Anmeldung" (Raum ${anmRaum}) an ${to.trim()} ${anzeigen ? 'im Outlook-Fenster geöffnet' : 'gesendet'}`)
        if (s) onGeaendert(s)
      }
      setMeldung({ ok: true, text: anzeigen ? 'Mail „erste Anmeldung" ist im Outlook-Fenster geöffnet — bitte dort absenden.' : `Mail „erste Anmeldung" an ${to.trim()} gesendet (CC ${cc}).` })
    } finally { setBusy('') }
  }

  const feld = 'px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <CalendarClock size={17} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">Übergabe-Termin · {checklist.name}</h3>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${art === 'refresh' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>{art === 'refresh' ? 'Refresh – Altgerät mitbringen' : 'Neues Gerät'}</span>
          <button onClick={onClose} disabled={!!busy} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          {termin && (
            <div className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground">
              Aktueller Termin: <b className="text-foreground">{zeitraumText(termin.start, termin.ende, true)} Uhr</b> · Raum {termin.raum} · Status {termin.status}
              {termin.nachricht
                ? <> · {termin.nachricht.art === 'termin' ? 'Termineinladung' : 'Mail (ohne Termin)'} {termin.nachricht.weg === 'geoeffnet' ? 'in Outlook geöffnet' : 'gesendet'} {new Date(termin.nachricht.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} von {termin.nachricht.by}</>
                : termin.outlook ? <> · Einladung gesendet {new Date(termin.outlook.gesendetAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} von {termin.outlook.gesendetBy}</> : ' · noch keine Nachricht'}
            </div>
          )}

          {/* Zeitraum + Raum */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <label className="text-[11px] text-muted-foreground col-span-2 sm:col-span-1">Datum
              <input type="date" value={datum} onChange={e => { setDatum(e.target.value); setEigenerText(null) }} className={`w-full mt-0.5 ${feld}`} /></label>
            <label className="text-[11px] text-muted-foreground">von
              <input type="time" value={von} step={900} onChange={e => { setVon(e.target.value); setEigenerText(null) }} className={`w-full mt-0.5 ${feld}`} /></label>
            <label className="text-[11px] text-muted-foreground">bis
              <input type="time" value={bis} step={900} onChange={e => { setBis(e.target.value); setEigenerText(null) }} className={`w-full mt-0.5 ${feld}`} /></label>
            <div className="text-[11px] text-muted-foreground">Raum
              <div className="flex gap-1 mt-0.5">
                {RAEUME.map(r => (
                  <button key={r} onClick={() => { setRaum(r); setEigenerText(null) }}
                    className={`flex-1 px-2 py-1.5 text-sm rounded-md border ${raum === r ? 'border-primary bg-primary/15 text-foreground font-semibold' : 'border-border text-muted-foreground hover:bg-accent'}`}>{r}</button>
                ))}
              </div>
            </div>
          </div>
          {zeitOk ? <p className="text-xs text-foreground">{zeitraumText(start, ende)}{vergangen && <span className="text-amber-300"> — liegt in der Vergangenheit</span>}</p>
            : <p className="text-xs text-red-300 flex items-center gap-1"><AlertTriangle size={12} />„bis" muss nach „von" liegen.</p>}

          {/* Empfänger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-[11px] text-muted-foreground">An (Mitarbeiter)
              <div className="relative mt-0.5">
                <input value={to} onChange={e => setTo(e.target.value)} placeholder={mailLaedt ? 'wird aus dem AD gesucht…' : 'name@skf.com'} className={`w-full ${feld}`} />
                {mailLaedt && <Loader2 size={13} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
              </div>
            </label>
            <label className="text-[11px] text-muted-foreground">CC
              <input value={cc} onChange={e => setCc(e.target.value)} className={`w-full mt-0.5 ${feld}`} /></label>
          </div>

          {/* Einladungstext */}
          {text && (
            <div className="space-y-1.5">
              <label className="block text-[11px] text-muted-foreground">Betreff
                <input value={text.subject} onChange={e => setEigenerText({ ...text, subject: e.target.value })} className={`w-full mt-0.5 ${feld}`} /></label>
              <label className="block text-[11px] text-muted-foreground">Einladungstext {eigenerText && <button onClick={() => setEigenerText(null)} className="ml-2 text-primary hover:underline">Vorlage wiederherstellen</button>}
                <textarea value={text.body} onChange={e => setEigenerText({ ...text, body: e.target.value })} rows={11}
                  className={`w-full mt-0.5 ${feld} text-xs font-mono leading-relaxed`} /></label>
            </div>
          )}

          {/* Erste Anmeldung */}
          <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
            <div className="flex items-center gap-2"><LogIn size={14} className="text-violet-400" /><span className="text-xs font-semibold text-foreground">Optional: Mail „erste Anmeldung"</span>
              <span className="text-[11px] text-muted-foreground">— Mitarbeiter meldet sich einmal kurz an, damit der PC seine Software zieht</span></div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="text-[11px] text-muted-foreground">Raum
                <div className="flex gap-1 mt-0.5">{RAEUME.map(r => (
                  <button key={r} onClick={() => { setAnmRaum(r); setAnmText(null) }} className={`px-3 py-1.5 text-sm rounded-md border ${anmRaum === r ? 'border-primary bg-primary/15 text-foreground font-semibold' : 'border-border text-muted-foreground hover:bg-accent'}`}>{r}</button>
                ))}</div>
              </div>
              <label className="text-[11px] text-muted-foreground flex-1 min-w-[200px]">Wann (optional, z. B. „heute bis 15 Uhr")
                <input value={anmWann} onChange={e => { setAnmWann(e.target.value); setAnmText(null) }} className={`w-full mt-0.5 ${feld}`} /></label>
              <button onClick={() => void ersteAnmeldung('outlook')} disabled={!!busy || !to.trim()} title="Mail im Outlook-Fenster öffnen — du prüfst und sendest selbst"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
                {busy === 'anm-outlook' ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}In Outlook öffnen
              </button>
              <button onClick={() => void ersteAnmeldung('senden')} disabled={!!busy || !to.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20 disabled:opacity-40">
                {busy === 'anm-senden' ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}Direkt senden
              </button>
            </div>
            <details>
              <summary className="text-[11px] text-muted-foreground cursor-pointer select-none hover:text-foreground">Mailtext ansehen/ändern</summary>
              <textarea value={anmText ?? anmVorschlag.body} onChange={e => setAnmText(e.target.value)} rows={9} className={`w-full mt-1 ${feld} text-xs font-mono leading-relaxed`} />
            </details>
            {termin?.ersteAnmeldung && <p className="text-[10px] text-muted-foreground">Zuletzt {termin.ersteAnmeldung.weg === 'geoeffnet' ? 'in Outlook geöffnet' : 'gesendet'} {new Date(termin.ersteAnmeldung.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} von {termin.ersteAnmeldung.by} (Raum {termin.ersteAnmeldung.raum})</p>}
          </div>

          {meldung && (
            <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${meldung.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}>
              {meldung.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}{meldung.text}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer"
            title="An: Mitarbeiter bekommt eine Termineinladung (Eintrag in seinem Kalender). Aus: nur eine normale Mail mit demselben Text.">
            <input type="checkbox" checked={mitTermin} onChange={e => { setMitTermin(e.target.checked); setEigenerText(null) }} disabled={!!busy || bestehenderTermin} className="accent-primary" />
            <CalendarClock size={13} className="text-blue-400" />mit Outlook-Termin (Kalendereintrag)
          </label>
          <p className="text-[10px] text-muted-foreground flex-1 min-w-[200px]">
            {mitTermin ? `Termineinladung aus deinem Postfach; ${cc || 'niemand'} als optionaler Teilnehmer.` : `Normale Mail, CC ${cc || '—'}.`} Antworten erkennt der Kalender über „Postfach prüfen".
          </p>
          <button onClick={onClose} disabled={!!busy} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Schließen</button>
          {bestehenderTermin ? (
            <button onClick={() => void versenden('senden')} disabled={!!busy || !zeitOk || !to.trim() || !geaendert}
              title={!geaendert ? 'Zeit oder Raum ändern, um ein Update zu senden' : undefined}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
              {busy === 'senden' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Termin ändern &amp; Update senden
            </button>
          ) : (
            <>
              <button onClick={() => void versenden('outlook')} disabled={!!busy || !zeitOk || !to.trim()} title="Im Outlook-Fenster öffnen — du prüfst und sendest selbst"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
                {busy === 'outlook' ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}In Outlook öffnen
              </button>
              <button onClick={() => void versenden('senden')} disabled={!!busy || !zeitOk || !to.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                {busy === 'senden' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Direkt senden
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function kurzTermin(t: UebergabeTermin): string {
  const a = ausLokal(t.start), b = ausLokal(t.ende)
  return `${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][a.getDay()]} ${p2(a.getDate())}.${p2(a.getMonth() + 1)}. ${p2(a.getHours())}:${p2(a.getMinutes())}–${p2(b.getHours())}:${p2(b.getMinutes())}`
}
