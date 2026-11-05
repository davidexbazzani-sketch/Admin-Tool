// ── „Bestellung verfassen" ────────────────────────────────────────────────────
// Bestellliste = alle gezählten Artikel unter SOLL (Menge = SOLL − IST − schon unterwegs),
// dazu beliebige Positionen von Hand. Dann entweder direkt an Sascha Herges senden
// (CC IT-Support-Postfach) oder im Outlook-Fenster mit PDF-Anhang zum Bearbeiten öffnen.
// Erst NACH erfolgreichem Senden/Öffnen werden neue Artikel und Links ins Lager geschrieben
// und die Bestellung in der Historie festgehalten.
import { useMemo, useState } from 'react'
import {
  ShoppingCart, X, Plus, Trash2, Send, Mail, FileDown, Loader2, AlertTriangle, ExternalLink, Search, Truck, Info,
} from 'lucide-react'
import { api } from '../../electronAPI'
import {
  bestellVorschlag, neuerArtikel, aendereLager, bestellungFesthalten,
  type AccessoryItem, type AccessoryHistoryEntry, type BestellPosition,
} from '../../services/accessoryInventory'
import { kategorieName, normName, amazonSuche } from '../../services/zubehoerKatalog'
import {
  BESTELL_AN, BESTELL_CC, bestellBetreff, bestellMailHtml, adressFehler, adressListe, sortiertePositionen, linkHref, kurzLink,
} from '../../services/zubehoerBestellung'
import { bestellPdfAnhang, exportOrderList, type AccessoryExportFormat } from '../../services/accessoryInventoryExport'

interface Zeile extends BestellPosition { aktiv: boolean; linkGeaendert?: boolean }

const inp = 'px-2 py-1.5 rounded-md bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/50'

export default function BestellDialog({ items, history, von, onClose, onFertig }: {
  items: AccessoryItem[]; history: AccessoryHistoryEntry[]; von: string
  onClose: () => void
  onFertig: (x: { meldung: string; items?: AccessoryItem[]; eintrag: AccessoryHistoryEntry }) => void
}) {
  const vorschlag = useMemo(() => bestellVorschlag(items, history), [items, history])
  const [auto, setAuto] = useState<Zeile[]>(() => vorschlag.positionen.map(p => ({ ...p, aktiv: true })))
  const [manuell, setManuell] = useState<Zeile[]>(() => vorschlag.positionen.length ? [] : [leereZeile()])
  const [an, setAn] = useState(BESTELL_AN)
  const [cc, setCc] = useState(BESTELL_CC)
  const [anmerkung, setAnmerkung] = useState('')
  const [busy, setBusy] = useState<'' | 'senden' | 'outlook' | 'pdf' | AccessoryExportFormat>('')
  const [bestaetigen, setBestaetigen] = useState(false)
  const [fehler, setFehler] = useState('')
  const [hinweis, setHinweis] = useState('')

  const nachName = useMemo(() => new Map(items.map(it => [normName(it.name), it])), [items])
  const positionen = useMemo(() => sortiertePositionen([...auto.filter(z => z.aktiv), ...manuell]), [auto, manuell])
  const summe = positionen.reduce((s, p) => s + p.menge, 0)
  const ohneLink = positionen.filter(p => !linkHref(p.link)).length
  const doppelt = useMemo(() => {
    const n = new Map<string, number>()
    for (const p of positionen) n.set(normName(p.name), (n.get(normName(p.name)) ?? 0) + 1)
    return [...n.entries()].filter(([, c]) => c > 1).map(([k]) => positionen.find(p => normName(p.name) === k)?.name || k)
  }, [positionen])
  const adressProblem = adressFehler(an, cc)
  const sperre = !positionen.length ? 'Keine Position in der Bestellung.' : adressProblem || (doppelt.length ? `Doppelt in der Liste: ${doppelt.join(', ')}` : '')

  function leereZeile(): Zeile { return { key: `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: '', menge: 1, link: '', manuell: true, aufnehmen: true, aktiv: true } }
  const setAutoZeile = (key: string, p: Partial<Zeile>) => setAuto(l => l.map(z => z.key === key ? { ...z, ...p } : z))
  const setManZeile = (key: string, p: Partial<Zeile>) => setManuell(l => l.map(z => {
    if (z.key !== key) return z
    const n = { ...z, ...p }
    // Name passt zu einem Lager-Artikel → Artikel verknüpfen (Link übernehmen, nicht doppelt anlegen)
    if (p.name !== undefined) {
      const it = nachName.get(normName(n.name))
      n.itemId = it?.id; n.kategorie = it?.kategorie
      if (it && !n.link.trim()) n.link = it.amazonLink
    }
    return n
  }))

  const meta = () => ({ von, an: adressListe(an), anmerkung, datum: new Date() })

  /** PDF in den Exportordner schreiben (für Anhang bzw. Ansicht). */
  async function pdf(): Promise<string> {
    const settings = await api().getSettings()
    const r = await bestellPdfAnhang(positionen, String(settings.exportPath || ''), meta())
    if (!r.ok || !r.path) throw new Error(`PDF konnte nicht erstellt werden: ${r.error || 'unbekannt'}`)
    return r.path
  }

  async function pdfAnsehen() {
    setBusy('pdf'); setFehler(''); setHinweis('')
    try { const p = await pdf(); await api().openPath(p); setHinweis(`PDF gespeichert unter ${p}`) }
    catch (e) { setFehler(e instanceof Error ? e.message : String(e)) }
    finally { setBusy('') }
  }

  async function speichernAls(f: AccessoryExportFormat) {
    setBusy(f); setFehler('')
    try { const r = await exportOrderList(positionen, f, meta()); if (!r.ok) setFehler(r.error || 'Speichern fehlgeschlagen.') }
    finally { setBusy('') }
  }

  async function ausfuehren(art: 'senden' | 'outlook') {
    if (sperre) { setFehler(sperre); return }
    setBusy(art); setFehler(''); setHinweis(''); setBestaetigen(false)
    try {
      // Neue Lager-Artikel vorbereiten (IDs schon jetzt, damit die Historie sie kennt)
      const neueArtikel: AccessoryItem[] = []
      const final: BestellPosition[] = positionen.map(p => {
        if (!p.manuell || p.itemId || !p.aufnehmen) return p
        const a = neuerArtikel({ name: p.name, current: 0, target: p.menge, amazonLink: p.link, von })
        neueArtikel.push(a)
        return { ...p, itemId: a.id, kategorie: a.kategorie }
      })
      const pfad = await pdf()
      const betreff = bestellBetreff()
      const body = bestellMailHtml({ positionen: final, von, an, anmerkung, mitPdf: true })
      const anL = adressListe(an), ccL = adressListe(cc)
      let meldung: string
      if (art === 'senden') {
        const r = await api().sendEmailRaw({ to: anL, cc: ccL, subject: betreff, body, html: true, smtp: '', port: 0, method: 'outlook', attachmentPath: pfad })
        if (!r.success) throw new Error(`Senden fehlgeschlagen: ${r.error || 'Outlook hat nicht geantwortet'} — es wurde nichts verschickt.`)
        meldung = `Bestellung an ${anL}${ccL ? ` (CC ${ccL})` : ''} gesendet — ${final.length} Position${final.length === 1 ? '' : 'en'}, ${summe} Stück, PDF im Anhang.`
      } else {
        const r = await api().composeEmail({ to: anL, cc: ccL, subject: betreff, body, html: true, attachmentPath: pfad })
        if (!r.success && !r.fallback) throw new Error('Outlook-Fenster konnte nicht geöffnet werden.')
        meldung = r.success
          ? 'Bestellung im Outlook-Fenster geöffnet (PDF im Anhang) — dort prüfen, bearbeiten und senden. Danach unter „Bestellungen" als gesendet abhaken.'
          : `Outlook nicht erreichbar — das Standard-Mailprogramm wurde ohne Anhang geöffnet. Das PDF liegt unter ${pfad}.`
      }
      // Erst jetzt dauerhaft: neue Artikel + nachgetragene Links ins Lager
      const linkPatches = new Map(auto.filter(z => z.aktiv && z.linkGeaendert && z.itemId).map(z => [z.itemId!, z.link.trim()]))
      let neuItems: AccessoryItem[] | undefined
      if (neueArtikel.length || linkPatches.size) {
        try {
          neuItems = await aendereLager(list => [
            ...list.map(it => linkPatches.has(it.id) ? { ...it, amazonLink: linkPatches.get(it.id)! } : it),
            ...neueArtikel.filter(a => !list.some(it => normName(it.name) === normName(a.name))),
          ], von)
        } catch (e) { meldung += ` Hinweis: Lagerliste nicht aktualisiert (${e instanceof Error ? e.message : String(e)}).` }
      }
      const eintrag = await bestellungFesthalten({ positionen: final, by: von, art: art === 'senden' ? 'gesendet' : 'outlook', an: anL, cc: ccL, anmerkung })
      onFertig({ meldung, items: neuItems, eintrag })
    } catch (e) {
      setFehler(e instanceof Error ? e.message : String(e))
    } finally { setBusy('') }
  }

  const laeuft = !!busy
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { if (!laeuft) onClose() }}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border">
          <ShoppingCart size={18} className="text-primary" />
          <h3 className="text-base font-semibold text-foreground">Bestellung verfassen</h3>
          <span className="text-xs text-muted-foreground">{positionen.length} Position{positionen.length === 1 ? '' : 'en'} · {summe} Stück</span>
          <button onClick={onClose} disabled={laeuft} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground disabled:opacity-40"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1 Automatisch */}
          <section>
            <p className="text-xs font-semibold text-foreground mb-1">Unter Soll — automatisch übernommen</p>
            <p className="text-[11px] text-muted-foreground mb-2">Menge = Soll − Bestand{vorschlag.unterwegsGedeckt.length || history.some(h => h.sentToSascha) ? ' − bereits bestellt (unterwegs)' : ''}. Haken entfernen, um eine Position wegzulassen; Menge und Link lassen sich anpassen.</p>
            {auto.length === 0 ? (
              <p className="text-[11px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-3 text-center">Alle gezählten Artikel erfüllen das Soll — unten lassen sich trotzdem Positionen von Hand ergänzen.</p>
            ) : (
              <div className="rounded-md border border-border divide-y divide-border">
                {auto.map(z => {
                  const it = items.find(i => i.id === z.itemId)
                  return (
                    <div key={z.key} className={`grid grid-cols-[auto_minmax(0,1.2fr)_84px_minmax(0,1.4fr)] items-center gap-2 px-2.5 py-1.5 ${z.aktiv ? '' : 'opacity-50'}`}>
                      <input type="checkbox" checked={z.aktiv} onChange={e => setAutoZeile(z.key, { aktiv: e.target.checked })} className="w-4 h-4 accent-primary" title="In die Bestellung" />
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate" title={z.name}>{z.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{kategorieName(z.kategorie)}{it ? ` · Bestand ${it.current} / Soll ${it.target}` : ''}</p>
                      </div>
                      <MengeFeld wert={z.menge} onChange={n => setAutoZeile(z.key, { menge: n })} disabled={!z.aktiv} />
                      <LinkFeld link={z.link} name={z.name} disabled={!z.aktiv} onChange={l => setAutoZeile(z.key, { link: l, linkGeaendert: true })} />
                    </div>
                  )
                })}
              </div>
            )}
            {vorschlag.unterwegsGedeckt.length > 0 && (
              <p className="text-[11px] text-blue-500 mt-1.5 flex items-start gap-1"><Truck size={12} className="mt-0.5 shrink-0" />
                Schon bestellt und noch nicht angekommen (nicht erneut übernommen): {vorschlag.unterwegsGedeckt.map(u => `${u.item.name} (${u.unterwegs})`).join(', ')}</p>
            )}
            {vorschlag.nichtGezaehlt.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1.5 flex items-start gap-1"><Info size={12} className="mt-0.5 shrink-0" />
                Noch nicht gezählt, darum nicht automatisch dabei: {vorschlag.nichtGezaehlt.slice(0, 12).map(i => i.name).join(', ')}{vorschlag.nichtGezaehlt.length > 12 ? ` und ${vorschlag.nichtGezaehlt.length - 12} weitere` : ''}. Erst den Bestand eintragen — oder unten von Hand ergänzen.</p>
            )}
          </section>

          {/* 2 Von Hand */}
          <section>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-semibold text-foreground">Weitere Artikel von Hand</p>
              <button onClick={() => setManuell(l => [...l, leereZeile()])} className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary hover:underline"><Plus size={12} />Position hinzufügen</button>
            </div>
            <datalist id="zubehoer-artikel">{items.map(it => <option key={it.id} value={it.name} />)}</datalist>
            {manuell.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Etwas, das nicht unter Soll steht oder noch gar nicht im Lager geführt wird? Über „Position hinzufügen" ergänzen.</p>
            ) : (
              <div className="rounded-md border border-border divide-y divide-border">
                {manuell.map(z => (
                  <div key={z.key} className="px-2.5 py-1.5 space-y-1">
                    <div className="grid grid-cols-[minmax(0,1.2fr)_84px_minmax(0,1.4fr)_auto] items-center gap-2">
                      <input value={z.name} onChange={e => setManZeile(z.key, { name: e.target.value })} list="zubehoer-artikel" placeholder="Artikel (z. B. HDMI-Kabel 5 m)" className={`${inp} min-w-0`} />
                      <MengeFeld wert={z.menge} onChange={n => setManZeile(z.key, { menge: n })} />
                      <LinkFeld link={z.link} name={z.name} immerOffen onChange={l => setManZeile(z.key, { link: l })} />
                      <button onClick={() => setManuell(l => l.filter(x => x.key !== z.key))} title="Position entfernen" className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10"><Trash2 size={13} /></button>
                    </div>
                    {z.name.trim() && (z.itemId
                      ? <p className="text-[10px] text-muted-foreground">Lager-Artikel · {kategorieName(z.kategorie)} — wird beim Eintreffen in den Bestand gebucht.</p>
                      : <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                          <input type="checkbox" checked={!!z.aufnehmen} onChange={e => setManZeile(z.key, { aufnehmen: e.target.checked })} className="w-3.5 h-3.5 accent-primary" />
                          Auch dauerhaft ins Lager aufnehmen (Soll = {z.menge}) — sonst nur für diese Bestellung
                        </label>)}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3 Mail */}
          <section className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Mail size={13} />E-Mail</p>
            <div className="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5 text-[11px]">
              <label className="text-muted-foreground">An</label>
              <input value={an} onChange={e => setAn(e.target.value)} className={`${inp} w-full`} />
              <label className="text-muted-foreground">CC</label>
              <input value={cc} onChange={e => setCc(e.target.value)} className={`${inp} w-full`} />
              <span className="text-muted-foreground">Betreff</span>
              <span className="text-sm text-foreground">{bestellBetreff()}</span>
              <label className="text-muted-foreground self-start pt-1.5">Anmerkung</label>
              <textarea value={anmerkung} onChange={e => setAnmerkung(e.target.value)} rows={2} placeholder={"optional, z. B. „bitte bis Monatsende“ oder ein Lieferhinweis"} className={`${inp} w-full resize-y`} />
            </div>
            <p className="text-[10px] text-muted-foreground">In der Mail stehen Artikel, Anzahl und Bestelllink als Tabelle; die Bestellung hängt zusätzlich als PDF an.{ohneLink ? ` ${ohneLink} Position${ohneLink === 1 ? ' hat' : 'en haben'} noch keinen Link.` : ''} Links, die du hier einträgst, werden beim Artikel gespeichert.</p>
          </section>

          {fehler && <p className="text-xs text-red-500 flex items-start gap-1"><AlertTriangle size={13} className="mt-0.5 shrink-0" />{fehler}</p>}
          {hinweis && <p className="text-[11px] text-muted-foreground break-all">{hinweis}</p>}
        </div>

        <div className="flex items-center gap-2 px-5 py-3 border-t border-border flex-wrap">
          <button onClick={pdfAnsehen} disabled={laeuft || !positionen.length} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40">
            {busy === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} className="text-red-500" />}PDF ansehen
          </button>
          <span className="text-[11px] text-muted-foreground">Speichern als</span>
          {(['excel', 'word'] as const).map(f => (
            <button key={f} onClick={() => speichernAls(f)} disabled={laeuft || !positionen.length} className="text-[11px] text-primary hover:underline disabled:opacity-40 disabled:no-underline">{busy === f ? '…' : f === 'excel' ? 'Excel' : 'Word'}</button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            {sperre && !laeuft && <span className="text-[11px] text-amber-500 max-w-xs truncate" title={sperre}>{sperre}</span>}
            <button onClick={() => ausfuehren('outlook')} disabled={laeuft || !!sperre} title="Outlook-Fenster mit Text und PDF-Anhang öffnen — dort bearbeiten und selbst senden"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40">
              {busy === 'outlook' ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} className="text-blue-500" />}In Outlook öffnen (mit PDF)
            </button>
            {bestaetigen ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1">
                <span className="text-[11px] text-foreground">Jetzt an {adressListe(an)} senden?</span>
                <button onClick={() => ausfuehren('senden')} className="px-2.5 py-1 text-xs rounded-md font-semibold bg-blue-600 text-white hover:bg-blue-500">Senden</button>
                <button onClick={() => setBestaetigen(false)} className="px-2 py-1 text-xs rounded-md text-muted-foreground hover:bg-accent">Zurück</button>
              </span>
            ) : (
              <button onClick={() => setBestaetigen(true)} disabled={laeuft || !!sperre}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-md font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40">
                {busy === 'senden' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}Direkt senden
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MengeFeld({ wert, onChange, disabled }: { wert: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex items-center gap-1">
      <input value={String(wert)} disabled={disabled} inputMode="numeric"
        onChange={e => onChange(Math.min(9999, parseInt(e.target.value.replace(/\D/g, ''), 10) || 0))}
        className={`${inp} w-14 text-center font-semibold disabled:opacity-50`} title="Anzahl" />
      <span className="text-[10px] text-muted-foreground">Stk.</span>
    </div>
  )
}

function LinkFeld({ link, name, onChange, disabled, immerOffen }: { link: string; name: string; onChange: (l: string) => void; disabled?: boolean; immerOffen?: boolean }) {
  const [offen, setOffen] = useState(immerOffen || !link.trim())
  const h = linkHref(link)
  if (!offen && h) {
    return (
      <div className="flex items-center gap-1 min-w-0">
        <button onClick={() => { try { void api().openExternal(h) } catch { /* ignore */ } }} title={h} disabled={disabled}
          className="min-w-0 inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline truncate"><ExternalLink size={11} className="shrink-0" /><span className="truncate">{kurzLink(link)}</span></button>
        <button onClick={() => setOffen(true)} disabled={disabled} className="text-[10px] text-muted-foreground hover:text-foreground shrink-0">ändern</button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 min-w-0">
      <input value={link} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder="Bestelllink (Amazon)" className={`${inp} min-w-0 flex-1 text-xs py-1`} />
      {name.trim() && (
        <button onClick={() => { try { void api().openExternal(amazonSuche(name)) } catch { /* ignore */ } }} disabled={disabled} title={`Bei Amazon nach „${name}" suchen — Link dann hier einfügen`}
          className="p-1 rounded-md text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 shrink-0"><Search size={12} /></button>
      )}
    </div>
  )
}

