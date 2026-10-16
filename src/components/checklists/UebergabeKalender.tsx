// ── Checklisten → Übergabe-Kalender ───────────────────────────────────────────
// Alle Übergabe-Termine (aus Checklisten + selbst eingetragene): Monatsübersicht links,
// Terminliste rechts. Bearbeiten/Verschieben, Notizen, Verlauf — jede Änderung mit
// Kennung. „Postfach prüfen" liest Antworten der Mitarbeiter (eigenes + IT-Support-
// Postfach) und trägt eindeutige Gegenvorschläge automatisch um.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, X, Plus, ChevronLeft, ChevronRight, Loader2, MailSearch, Send, Trash2, AlertTriangle,
  CheckCircle2, StickyNote, History, Ban, MessageSquareReply,
} from 'lucide-react'
import { PersonInfoButton } from '../person/PersonDossier'
import {
  ladeTermine, aendereTermin, neuerTermin, notizHinzufuegen, loescheTermin, postfachScan, vorschlagEntscheiden,
  aktualisiereEinladung, sageEinladungAb, speichereEinstellungen, zeitraumText, ausLokal, RAEUME,
  type TerminStore, type UebergabeTermin, type TerminStatus,
} from '../../services/uebergabeTermine'

const p2 = (n: number) => String(n).padStart(2, '0')
const tagKey = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

const STATUS_STIL: Record<TerminStatus, string> = {
  geplant: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  zugesagt: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  verschoben: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  abgesagt: 'bg-red-500/15 text-red-300 border-red-500/30',
  erledigt: 'bg-muted/40 text-muted-foreground border-border',
  storniert: 'bg-muted/40 text-muted-foreground border-border line-through',
}

export default function UebergabeKalender({ kennung, bearbeiterName, onClose }: { kennung: string; bearbeiterName: string; onClose: () => void }) {
  const [store, setStore] = useState<TerminStore | null>(null)
  const [monat, setMonat] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [tag, setTag] = useState<string | null>(null)
  const [alle, setAlle] = useState(false)
  const [offen, setOffen] = useState<UebergabeTermin | 'neu' | null>(null)
  const [scan, setScan] = useState(false)
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null)

  const neuLaden = useCallback(async () => setStore(await ladeTermine()), [])
  useEffect(() => { void neuLaden() }, [neuLaden])

  async function postfach() {
    setScan(true); setMeldung(null)
    try {
      const r = await postfachScan(kennung)
      if (r.store) setStore(r.store)
      if (!r.ok) { setMeldung({ ok: false, text: 'Postfach-Prüfung fehlgeschlagen: ' + r.error }); return }
      const teile = [`${r.neu} neue Antwort(en)`, `${r.umgetragen} automatisch umgetragen`]
      setMeldung({ ok: !(r.hinweise?.length), text: teile.join(' · ') + (r.hinweise?.length ? ' — ' + r.hinweise.join('; ') : '') })
    } finally { setScan(false) }
  }

  const termine = store?.termine ?? []
  const heute = tagKey(new Date())
  const proTag = useMemo(() => {
    const m = new Map<string, UebergabeTermin[]>()
    for (const t of termine) { if (t.status === 'storniert') continue; const k = t.start.slice(0, 10); if (!m.has(k)) m.set(k, []); m.get(k)!.push(t) }
    return m
  }, [termine])

  const liste = useMemo(() => {
    let l = termine.filter(t => (alle ? true : t.status !== 'storniert' && t.status !== 'erledigt' && t.ende.slice(0, 10) >= heute))
    if (tag) l = l.filter(t => t.start.slice(0, 10) === tag)
    return l.sort((a, b) => a.start.localeCompare(b.start))
  }, [termine, alle, tag, heute])

  const gruppen = useMemo(() => {
    const g = new Map<string, UebergabeTermin[]>()
    for (const t of liste) { const k = t.start.slice(0, 10); if (!g.has(k)) g.set(k, []); g.get(k)!.push(t) }
    return [...g.entries()]
  }, [liste])

  // Monatsraster (Mo–So)
  const zellen = useMemo(() => {
    const erster = new Date(monat), off = (erster.getDay() + 6) % 7
    const start = new Date(erster); start.setDate(1 - off)
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [monat])

  const offeneVorschlaege = termine.reduce((n, t) => n + t.vorschlaege.filter(v => !v.erledigt && v.art === 'vorschlag').length, 0)
  const auto = store?.einstellungen?.autoUebernehmen !== false

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Kopf */}
        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-2">
          <CalendarDays size={18} className="text-blue-400" />
          <h3 className="text-base font-semibold text-foreground">Übergabe-Kalender</h3>
          {offeneVorschlaege > 0 && <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">{offeneVorschlaege} Terminvorschlag/-vorschläge offen</span>}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer" title={'Eindeutige Gegenvorschläge (Outlook „Neue Zeit vorschlagen“ oder Datum + Uhrzeit im Text) direkt umtragen'}>
              <input type="checkbox" checked={auto} onChange={async e => { const s = await speichereEinstellungen({ autoUebernehmen: e.target.checked }); if (s) setStore(s) }} className="accent-primary" />
              eindeutige Vorschläge automatisch umtragen
            </label>
            <button onClick={() => void postfach()} disabled={scan}
              title={store?.letzterScan ? `Zuletzt ${fmt(store.letzterScan.at)} von ${store.letzterScan.by}` : 'Antworten der Mitarbeiter im eigenen und im IT-Support-Postfach suchen'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50">
              {scan ? <Loader2 size={13} className="animate-spin" /> : <MailSearch size={13} />}Postfach prüfen
            </button>
            <button onClick={() => setOffen('neu')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90"><Plus size={13} />Termin eintragen</button>
            <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
        </div>
        {meldung && <div className={`mx-5 mt-2 rounded-md border px-3 py-1.5 text-xs ${meldung.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>{meldung.text}</div>}

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[300px_1fr]">
          {/* Monat */}
          <div className="border-r border-border p-4 space-y-3 overflow-auto">
            <div className="flex items-center gap-1">
              <button onClick={() => setMonat(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronLeft size={16} /></button>
              <span className="flex-1 text-center text-sm font-semibold text-foreground">{MONATE[monat.getMonth()]} {monat.getFullYear()}</span>
              <button onClick={() => setMonat(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-1 rounded hover:bg-accent text-muted-foreground"><ChevronRight size={16} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(w => <span key={w}>{w}</span>)}
              {zellen.map(d => {
                const k = tagKey(d), n = proTag.get(k)?.length ?? 0, imMonat = d.getMonth() === monat.getMonth()
                return (
                  <button key={k} onClick={() => setTag(t => (t === k ? null : k))}
                    className={`relative aspect-square rounded-md text-xs flex flex-col items-center justify-center border ${tag === k ? 'border-primary bg-primary/15' : k === heute ? 'border-blue-500/50' : 'border-transparent hover:bg-accent'} ${imMonat ? 'text-foreground' : 'text-muted-foreground/40'}`}>
                    {d.getDate()}
                    {n > 0 && <span className="absolute bottom-0.5 min-w-[14px] px-1 rounded-full text-[9px] leading-[14px] font-semibold bg-blue-500 text-white">{n}</span>}
                  </button>
                )
              })}
            </div>
            <div className="space-y-1.5 text-xs">
              {tag && <button onClick={() => setTag(null)} className="w-full px-2 py-1 rounded-md border border-border text-muted-foreground hover:bg-accent">Tagesfilter aufheben</button>}
              <label className="flex items-center gap-2 text-muted-foreground cursor-pointer"><input type="checkbox" checked={alle} onChange={e => setAlle(e.target.checked)} className="accent-primary" />auch vergangene, erledigte &amp; stornierte</label>
              {store?.letzterScan && <p className="text-[10px] text-muted-foreground">Postfach zuletzt geprüft {fmt(store.letzterScan.at)} · {store.letzterScan.by}</p>}
            </div>
          </div>

          {/* Liste */}
          <div className="min-h-0 overflow-auto p-4 space-y-4">
            {!store ? <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Lade Termine…</p>
              : !gruppen.length ? <p className="text-sm text-muted-foreground">{tag ? 'An diesem Tag gibt es keine Termine.' : 'Keine anstehenden Termine.'}</p>
              : gruppen.map(([k, ts]) => (
                <div key={k}>
                  <p className={`text-xs font-semibold mb-1.5 ${k === heute ? 'text-blue-300' : 'text-muted-foreground'}`}>{zeitraumText(`${k}T00:00`, `${k}T00:00`).split(' zwischen')[0]}{k === heute ? ' · heute' : ''}</p>
                  <div className="space-y-1.5">
                    {ts.map(t => {
                      const vs = t.vorschlaege.filter(v => !v.erledigt && v.art === 'vorschlag').length
                      return (
                        <button key={t.id} onClick={() => setOffen(t)} className="w-full text-left rounded-lg border border-border bg-background/60 hover:bg-accent/30 px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-mono text-foreground w-28">{t.start.slice(11, 16)}–{t.ende.slice(11, 16)}</span>
                          <span className="text-sm font-semibold text-foreground">{t.name || t.titel}</span>
                          {t.art !== 'eigener' && <span className={`px-1.5 py-0.5 rounded-full text-[10px] border ${t.art === 'refresh' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>{t.art === 'refresh' ? 'Refresh' : 'Neu'}</span>}
                          <span className="text-xs text-muted-foreground">Raum {t.raum}</span>
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] border ${STATUS_STIL[t.status]}`}>{t.status}</span>
                          {t.outlook?.veraltet && <span className="px-1.5 py-0.5 rounded-full text-[10px] border bg-amber-500/15 text-amber-300 border-amber-500/40">Outlook-Update ausstehend</span>}
                          {t.nachricht?.weg === 'geoeffnet' && <span title="Nur im Outlook-Fenster geöffnet — ob dort abgeschickt wurde, sieht das Tool nicht" className="px-1.5 py-0.5 rounded-full text-[10px] border bg-muted/40 text-muted-foreground border-border">in Outlook geöffnet</span>}
                          {t.nachricht?.art === 'mail' && <span title="Ohne Outlook-Termin verschickt — kein Kalendereintrag beim Mitarbeiter" className="px-1.5 py-0.5 rounded-full text-[10px] border bg-muted/40 text-muted-foreground border-border">nur Mail</span>}
                          {vs > 0 && <span className="px-1.5 py-0.5 rounded-full text-[10px] border bg-amber-500/20 text-amber-200 border-amber-500/50 inline-flex items-center gap-1"><MessageSquareReply size={10} />{vs} Vorschlag</span>}
                          {t.notizen.length > 0 && <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5"><StickyNote size={10} />{t.notizen.length}</span>}
                          <span className="ml-auto text-[10px] text-muted-foreground">{t.updatedBy ? `geändert ${fmt(t.updatedAt)} · ${t.updatedBy}` : `angelegt · ${t.createdBy}`}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {offen && (
        <TerminEditor termin={offen === 'neu' ? null : offen} kennung={kennung} bearbeiterName={bearbeiterName}
          onClose={() => setOffen(null)} onGespeichert={s => { setStore(s); if (offen !== 'neu') setOffen(s.termine.find(x => x.id === (offen as UebergabeTermin).id) ?? null) }}
          onFertig={s => { setStore(s); setOffen(null) }} />
      )}
    </div>
  )
}

// ── Termin bearbeiten / neu eintragen ─────────────────────────────────────────
function TerminEditor({ termin, kennung, bearbeiterName, onClose, onGespeichert, onFertig }: {
  termin: UebergabeTermin | null; kennung: string; bearbeiterName: string
  onClose: () => void; onGespeichert: (s: TerminStore) => void; onFertig: (s: TerminStore) => void
}) {
  const heute = new Date()
  const [titel, setTitel] = useState(termin?.titel ?? '')
  const [name, setName] = useState(termin?.name ?? '')
  const [datum, setDatum] = useState(termin ? termin.start.slice(0, 10) : tagKey(heute))
  const [von, setVon] = useState(termin ? termin.start.slice(11, 16) : '08:00')
  const [bis, setBis] = useState(termin ? termin.ende.slice(11, 16) : '09:00')
  const [raum, setRaum] = useState(termin?.raum ?? RAEUME[0])
  const [status, setStatus] = useState<TerminStatus>(termin?.status ?? 'geplant')
  const [notiz, setNotiz] = useState('')
  const [outlookMit, setOutlookMit] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fehler, setFehler] = useState('')

  const start = `${datum}T${von}`, ende = `${datum}T${bis}`
  const zeitOk = !!datum && bis > von
  const zeitGeaendert = !!termin && (termin.start !== start || termin.ende !== ende || termin.raum !== raum)
  const feld = 'px-2.5 py-1.5 text-sm rounded-md bg-background border border-border text-foreground focus:outline-none focus:border-primary'

  async function speichern() {
    if (!zeitOk) { setFehler('„bis" muss nach „von" liegen.'); return }
    setBusy(true); setFehler('')
    try {
      if (!termin) {
        const r = await neuerTermin({ titel: titel.trim() || name.trim() || 'Termin', name: name.trim(), art: 'eigener', start, ende, raum, status, createdBy: kennung, notiz: notiz.trim() || undefined })
        if (r.store) onFertig(r.store); else setFehler('Speichern fehlgeschlagen (Netzlaufwerk?)')
        return
      }
      const teile: string[] = []
      if (zeitGeaendert) teile.push(`${zeitraumText(termin.start, termin.ende, true)}, Raum ${termin.raum} → ${zeitraumText(start, ende, true)}, Raum ${raum}`)
      if (status !== termin.status) teile.push(`Status ${termin.status} → ${status}`)
      if (titel !== termin.titel) teile.push(`Titel → „${titel}"`)
      let outlookHinweis = ''
      let outlook = termin.outlook
      if (zeitGeaendert && termin.outlook?.entryId) {
        if (outlookMit) {
          const r = await aktualisiereEinladung({ ...termin, start, ende, raum }, bearbeiterName)
          if (!r.ok) { setFehler('Gespeichert wird nicht — Outlook-Update fehlgeschlagen: ' + r.error); return }
          outlook = { ...termin.outlook, veraltet: false }; outlookHinweis = ' · Outlook-Update gesendet'
        } else { outlook = { ...termin.outlook, veraltet: true }; outlookHinweis = ' · Outlook-Termin NICHT aktualisiert' }
      }
      let s = await aendereTermin(termin.id, kennung, { titel, name, start, ende, raum, status: zeitGeaendert && status === termin.status ? 'verschoben' : status, outlook },
        teile.length ? teile.join(' · ') + outlookHinweis : undefined)
      if (s && notiz.trim()) s = await notizHinzufuegen(termin.id, notiz, kennung)
      if (s) { setNotiz(''); onGespeichert(s) } else setFehler('Speichern fehlgeschlagen (Netzlaufwerk?)')
    } finally { setBusy(false) }
  }

  async function outlookUpdate() {
    if (!termin) return
    setBusy(true); setFehler('')
    try {
      const r = await aktualisiereEinladung(termin, bearbeiterName)
      if (!r.ok) { setFehler('Outlook-Update fehlgeschlagen: ' + r.error); return }
      const s = await aendereTermin(termin.id, kennung, { outlook: { ...termin.outlook!, veraltet: false } }, 'Outlook-Update an den Mitarbeiter gesendet')
      if (s) onGespeichert(s)
    } finally { setBusy(false) }
  }

  async function absagen() {
    if (!termin || !window.confirm(`Termin ${zeitraumText(termin.start, termin.ende, true)} wirklich absagen?${termin.outlook ? ' Der Mitarbeiter bekommt eine Outlook-Absage.' : ''}`)) return
    setBusy(true); setFehler('')
    try {
      const r = await sageEinladungAb(termin)
      if (!r.ok) { setFehler('Outlook-Absage fehlgeschlagen: ' + r.error); return }
      const s = await aendereTermin(termin.id, kennung, { status: 'storniert' }, termin.outlook ? 'Termin abgesagt (Outlook-Absage gesendet)' : 'Termin abgesagt')
      if (s) onFertig(s)
    } finally { setBusy(false) }
  }

  async function loeschen() {
    if (!termin || !window.confirm('Eintrag endgültig aus dem Kalender löschen?')) return
    const s = await loescheTermin(termin.id); if (s) onFertig(s)
  }

  async function vorschlag(mailId: string, ja: boolean) {
    if (!termin) return
    setBusy(true)
    try { const s = await vorschlagEntscheiden(termin.id, mailId, ja, kennung); if (s) onGespeichert(s) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6" onClick={() => !busy && onClose()}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <CalendarDays size={16} className="text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">{termin ? (termin.name || termin.titel) : 'Termin eintragen'}</h3>
          {termin?.name && <PersonInfoButton name={termin.name} sam={termin.corpId} />}
          <button onClick={onClose} disabled={busy} className="ml-auto p-1 rounded text-muted-foreground hover:text-foreground"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Offene Vorschläge aus dem Postfach */}
          {termin?.vorschlaege.filter(v => !v.erledigt).map(v => (
            <div key={v.mailId} className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1.5">
              <p className="text-xs text-amber-200 font-semibold flex items-center gap-1.5"><MessageSquareReply size={13} />
                {v.art === 'vorschlag' ? `Neuer Terminvorschlag: ${zeitraumText(v.start!, v.ende!, true)} Uhr` : v.art === 'absage' ? 'Absage ohne konkreten Gegenvorschlag' : 'Antwort ohne erkennbaren Termin'}
              </p>
              <p className="text-[11px] text-muted-foreground">Mail von {v.von} · {v.empfangen}{v.fundstelle ? ` · erkannt: „${v.fundstelle}"` : ''}</p>
              <p className="text-[11px] text-foreground/80 italic line-clamp-3">„{v.auszug}"</p>
              <div className="flex gap-2">
                {v.art === 'vorschlag' && <button onClick={() => void vorschlag(v.mailId, true)} disabled={busy} className="px-3 py-1 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90">Übernehmen</button>}
                <button onClick={() => void vorschlag(v.mailId, false)} disabled={busy} className="px-3 py-1 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">{v.art === 'vorschlag' ? 'Verwerfen' : 'Erledigt'}</button>
              </div>
            </div>
          ))}
          {termin?.outlook?.veraltet && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
              <AlertTriangle size={13} />Der Termin wurde umgetragen, die Outlook-Einladung des Mitarbeiters zeigt aber noch die alte Zeit.
              <button onClick={() => void outlookUpdate()} disabled={busy} className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold"><Send size={12} />Update senden</button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] text-muted-foreground">Titel<input value={titel} onChange={e => setTitel(e.target.value)} placeholder="z. B. Übergabe Max Muster" className={`w-full mt-0.5 ${feld}`} /></label>
            <label className="text-[11px] text-muted-foreground">Mitarbeiter<input value={name} onChange={e => setName(e.target.value)} className={`w-full mt-0.5 ${feld}`} /></label>
            <label className="text-[11px] text-muted-foreground">Datum<input type="date" value={datum} onChange={e => setDatum(e.target.value)} className={`w-full mt-0.5 ${feld}`} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-muted-foreground">von<input type="time" step={900} value={von} onChange={e => setVon(e.target.value)} className={`w-full mt-0.5 ${feld}`} /></label>
              <label className="text-[11px] text-muted-foreground">bis<input type="time" step={900} value={bis} onChange={e => setBis(e.target.value)} className={`w-full mt-0.5 ${feld}`} /></label>
            </div>
            <div className="text-[11px] text-muted-foreground">Raum
              <div className="flex gap-1 mt-0.5">{[...new Set([...RAEUME, raum])].map(r => (
                <button key={r} onClick={() => setRaum(r)} className={`flex-1 px-2 py-1.5 text-sm rounded-md border ${raum === r ? 'border-primary bg-primary/15 text-foreground font-semibold' : 'border-border text-muted-foreground hover:bg-accent'}`}>{r}</button>
              ))}</div>
            </div>
            <label className="text-[11px] text-muted-foreground">Status
              <select value={status} onChange={e => setStatus(e.target.value as TerminStatus)} className={`w-full mt-0.5 ${feld}`}>
                {(['geplant', 'zugesagt', 'verschoben', 'abgesagt', 'erledigt', 'storniert'] as TerminStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select></label>
          </div>
          {zeitGeaendert && termin?.outlook?.entryId && (
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <input type="checkbox" checked={outlookMit} onChange={e => setOutlookMit(e.target.checked)} className="accent-primary" />
              Mitarbeiter per Outlook-Update über die neue Zeit informieren
            </label>
          )}
          <label className="block text-[11px] text-muted-foreground">Notiz hinzufügen (wird mit deiner Kennung gespeichert)
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} className={`w-full mt-0.5 ${feld} text-xs`} /></label>

          {termin && termin.notizen.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1"><StickyNote size={12} />Notizen</p>
              {[...termin.notizen].reverse().map((n, i) => (
                <div key={i} className="rounded-md bg-background/60 border border-border px-2.5 py-1.5 text-xs"><p className="text-foreground whitespace-pre-wrap">{n.text}</p><p className="text-[10px] text-muted-foreground mt-0.5">{fmt(n.at)} · {n.by}</p></div>
              ))}
            </div>
          )}
          {termin && (
            <details>
              <summary className="text-[11px] font-semibold text-muted-foreground cursor-pointer select-none flex items-center gap-1"><History size={12} />Verlauf ({termin.verlauf.length})</summary>
              <div className="mt-1 space-y-0.5">{[...termin.verlauf].reverse().map((v, i) => <p key={i} className="text-[11px] text-muted-foreground"><span className="text-foreground/80">{fmt(v.at)}</span> · {v.by} — {v.text}</p>)}</div>
            </details>
          )}
          {fehler && <p className="text-xs text-red-300 flex items-center gap-1"><AlertTriangle size={13} />{fehler}</p>}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center gap-2">
          {termin && termin.status !== 'storniert' && <button onClick={() => void absagen()} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-red-300 hover:border-red-500/40"><Ban size={13} />Absagen</button>}
          {termin && <button onClick={() => void loeschen()} disabled={busy} title="Eintrag aus dem Kalender löschen (keine Outlook-Absage)" className="p-1.5 rounded-md border border-border text-muted-foreground hover:text-red-300"><Trash2 size={13} /></button>}
          <span className="flex-1" />
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:bg-accent">Schließen</button>
          <button onClick={() => void speichern()} disabled={busy || !zeitOk}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}{termin ? 'Speichern' : 'Eintragen'}
          </button>
        </div>
      </div>
    </div>
  )
}
