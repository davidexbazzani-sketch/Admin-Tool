// ── Drucker → Toner-Lager ─────────────────────────────────────────────────────
// Alle Tonerarten im Unternehmen (aus den Druckern gelesen + von Hand ergänzt) mit Bestand.
// Wird irgendwo eine Patrone getauscht (Füllstand springt von ≤ 40 % auf ≥ 70 %), bucht der
// Drucker-Scan automatisch 1 Stück ab (services/druckerFlotte.ts → bucheTausche).
// „Bestellen" öffnet die Tonerbestellung (wie unter Infrastruktur Marine) vorbelegt; eine
// verschickte Bestellung wird als „bestellt" vermerkt, „Lieferung eingetroffen" bucht sie zu.

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Minus, PackageCheck, Plus, Search, ShoppingCart, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { PrinterInfoButton } from '../printer/PrinterDossier'
import TonerOrder from '../infra/TonerOrder'
import { aendereLager, bucheBestand, bestellNummer, lagerKey, type Lager, type LagerArtikel } from '../../services/druckerFlotte'
import { istToner, sauber } from '../../services/tonerWarnung'
import type { DruckerDaten } from '../../screens/Drucker'

interface Art { key: string; name: string; bestellNr: string; drucker: { name: string; prozent: number | null }[]; artikel?: LagerArtikel }

const datum = (iso: string) => new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
const zeit = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function TonerLager({ daten, bestellenFuer, onBestellenErledigt }: {
  daten: DruckerDaten | null; neuLaden: () => Promise<void>; bestellenFuer: string | null; onBestellenErledigt: () => void
}) {
  const u = useAuthStore(s => s.session?.user)
  const wer = u?.displayName || u?.username || 'unbekannt'
  const [lager, setLager] = useState<Lager | null>(daten?.lager ?? null)
  useEffect(() => { setLager(daten?.lager ?? null) }, [daten?.lager])
  const [busy, setBusy] = useState<string | null>(null)
  const [fehler, setFehler] = useState('')
  const [suche, setSuche] = useState('')
  const [neueArt, setNeueArt] = useState('')
  const [bestellung, setBestellung] = useState<Art | null>(null)
  const [verlaufAuf, setVerlaufAuf] = useState(false)

  const arten: Art[] = useMemo(() => {
    const m = new Map<string, Art>()
    for (const s of Object.values(daten?.flotte.drucker || {})) {
      for (const x of s.supplies) {
        if (!istToner(x.name)) continue
        const key = lagerKey(x.name)
        const a = m.get(key) || { key, name: sauber(x.name), bestellNr: bestellNummer(x.name), drucker: [] }
        a.drucker.push({ name: s.name, prozent: x.prozent })
        m.set(key, a)
      }
    }
    for (const a of Object.values(lager?.artikel || {})) {
      const e = m.get(a.key) || { key: a.key, name: a.name, bestellNr: bestellNummer(a.name), drucker: [] }
      e.artikel = a
      if (a.bestellNr) e.bestellNr = a.bestellNr
      m.set(a.key, e)
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  }, [daten, lager])

  // Aus der Übersicht „bestellen" geklickt → Bestellung direkt öffnen
  useEffect(() => {
    if (!bestellenFuer) return
    const a = arten.find(x => x.key === lagerKey(bestellenFuer))
    if (a) setBestellung(a)
    onBestellenErledigt()
  }, [bestellenFuer, arten, onBestellenErledigt])

  async function aendern(key: string, f: (l: Lager) => void) {
    setBusy(key); setFehler('')
    const neu = await aendereLager(f)
    if (neu) setLager(neu)
    else setFehler('Toner-Lager konnte nicht gespeichert werden (Netzlaufwerk nicht erreichbar oder Datei nicht lesbar) — nichts geändert.')
    setBusy(null)
  }

  const plusMinus = (a: Art, delta: number) => aendern(a.key, l => { bucheBestand(l, a.name, delta, 'manuell', wer) })
  const setzeBestand = (a: Art, wert: number) => aendern(a.key, l => { const alt = l.artikel[a.key]?.bestand || 0; if (wert !== alt) bucheBestand(l, a.name, wert - alt, 'manuell', wer, undefined, 'Bestand von Hand gesetzt') })
  const setzeFeld = (a: Art, feld: 'mindest' | 'bestellNr', wert: string) => aendern(a.key, l => {
    const art = (l.artikel[a.key] ||= { key: a.key, name: a.name, bestand: 0 })
    if (feld === 'mindest') art.mindest = wert === '' ? undefined : Math.max(0, Math.round(Number(wert)) || 0)
    else art.bestellNr = wert.trim() || undefined
  })
  const lieferung = (a: Art) => aendern(a.key, l => {
    const offen = l.artikel[a.key]?.bestellt || []
    const menge = offen.reduce((s, b) => s + b.menge, 0)
    if (menge) bucheBestand(l, a.name, menge, 'lieferung', wer, undefined, `Lieferung eingetroffen (${offen.length} Bestellung${offen.length === 1 ? '' : 'en'})`)
    l.artikel[a.key].bestellt = []
  })
  const bestellt = (a: Art, menge: number) => aendern(a.key, l => {
    const art = bucheBestand(l, a.name, 0, 'bestellung', wer, undefined, `${menge} Stück bei Hilker & Pahl bestellt`)
    art.bestellt = [...(art.bestellt || []), { menge, am: new Date().toISOString(), von: wer }]
  })

  if (!daten) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" />wird geladen …</p>

  const q = suche.trim().toLowerCase()
  const sichtbar = arten.filter(a => !q || a.name.toLowerCase().includes(q) || a.bestellNr.toLowerCase().includes(q) || a.drucker.some(d => d.name.toLowerCase().includes(q)))
  const nachbestellen = arten.filter(a => a.artikel && a.artikel.mindest !== undefined && a.artikel.bestand <= a.artikel.mindest && !(a.artikel.bestellt || []).length).length

  return (
    <div className="space-y-3">
      {!daten.lager && <p className="flex items-center gap-1.5 text-xs text-foreground rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2"><AlertTriangle size={13} className="text-red-500" />Die Lagerdatei ist gerade nicht lesbar — Änderungen sind gesperrt, damit nichts verloren geht.</p>}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <div className="relative">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={suche} onChange={e => setSuche(e.target.value)} placeholder="Toner, Bestellnummer, Drucker …"
            className="pl-7 pr-2 py-1.5 w-72 rounded-md bg-background border border-border text-foreground" />
        </div>
        <span className="text-muted-foreground">{arten.length} Tonerarten{nachbestellen ? <> · <b className="text-foreground">{nachbestellen} unter Mindestbestand</b></> : ''}</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <input value={neueArt} onChange={e => setNeueArt(e.target.value)} placeholder="Tonerart von Hand ergänzen (z. B. HP CF362A Gelb)"
            className="w-72 px-2 py-1.5 rounded-md bg-background border border-border text-foreground" />
          <button disabled={!neueArt.trim() || !daten.lager} onClick={() => { const n = neueArt.trim(); setNeueArt(''); void aendern(lagerKey(n), l => { bucheBestand(l, n, 0, 'manuell', wer, undefined, 'Tonerart angelegt') }) }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-40"><Plus size={12} />Hinzufügen</button>
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">Wird an einem Drucker eine Patrone getauscht (Füllstand springt von höchstens 40 % auf mindestens 70 %), bucht der Drucker-Check automatisch 1 Stück aus dem Bestand ab.</p>
      {fehler && <p className="text-xs text-foreground rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2">{fehler}</p>}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Tonerart</th>
              <th className="text-left font-medium px-2 py-2">Bestell-Nr.</th>
              <th className="text-left font-medium px-2 py-2">Verwendet in</th>
              <th className="text-center font-medium px-2 py-2">Bestand</th>
              <th className="text-center font-medium px-2 py-2">Mindest</th>
              <th className="text-left font-medium px-2 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sichtbar.map(a => {
              const art = a.artikel
              const offen = art?.bestellt || []
              const offenMenge = offen.reduce((s, b) => s + b.menge, 0)
              const leer = art && art.bestand === 0
              const unter = art?.mindest !== undefined && art!.bestand <= art!.mindest
              const tief = a.drucker.some(d => d.prozent !== null && d.prozent < 15)
              const sperre = busy === a.key || !daten.lager
              return (
                <tr key={a.key} className="align-top">
                  <td className="px-3 py-2 text-foreground font-medium max-w-[16rem]">{a.name}</td>
                  <td className="px-2 py-2">
                    <input defaultValue={art?.bestellNr || a.bestellNr} disabled={sperre} onBlur={e => { if (e.target.value.trim() !== (art?.bestellNr || a.bestellNr)) void setzeFeld(a, 'bestellNr', e.target.value) }}
                      className="w-24 px-1.5 py-0.5 rounded border border-border bg-background font-mono text-foreground" />
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                      {a.drucker.length ? a.drucker.map(d => (
                        <span key={d.name} className="inline-flex items-center gap-0.5 text-foreground">{d.name}<PrinterInfoButton printerName={d.name} />
                          <span className={`tabular-nums ${d.prozent !== null && d.prozent < 4 ? 'font-bold' : 'text-muted-foreground'}`}>{d.prozent === null ? '' : `${d.prozent} %`}</span></span>
                      )) : <span className="text-muted-foreground">von Hand angelegt</span>}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex items-center justify-center gap-1">
                      <button disabled={sperre || !art?.bestand} onClick={() => void plusMinus(a, -1)} className="p-1 rounded border border-border text-foreground hover:bg-accent disabled:opacity-30" title="1 entnehmen"><Minus size={11} /></button>
                      <input key={`${a.key}_${art?.bestand ?? 0}`} defaultValue={art?.bestand ?? 0} disabled={sperre} inputMode="numeric"
                        onBlur={e => { const v = Math.max(0, Math.round(Number(e.target.value)) || 0); if (v !== (art?.bestand ?? 0)) void setzeBestand(a, v) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="w-12 text-center px-1 py-0.5 rounded border border-border bg-background text-foreground font-semibold tabular-nums" />
                      <button disabled={sperre} onClick={() => void plusMinus(a, 1)} className="p-1 rounded border border-border text-foreground hover:bg-accent disabled:opacity-30" title="1 dazu"><Plus size={11} /></button>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input key={`${a.key}_m_${art?.mindest ?? ''}`} defaultValue={art?.mindest ?? ''} disabled={sperre} placeholder="—" inputMode="numeric"
                      onBlur={e => { if (e.target.value !== String(art?.mindest ?? '')) void setzeFeld(a, 'mindest', e.target.value) }}
                      className="w-12 text-center px-1 py-0.5 rounded border border-border bg-background text-foreground tabular-nums" />
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-col gap-1 items-start">
                      {busy === a.key ? <Loader2 size={12} className="animate-spin text-muted-foreground" />
                        : leer ? <span className="px-1.5 py-0.5 rounded bg-red-600 text-white font-semibold">leer</span>
                        : unter && !offenMenge ? <span className="px-1.5 py-0.5 rounded bg-amber-400 text-black font-semibold">nachbestellen</span>
                        : unter ? <span className="px-1.5 py-0.5 rounded border border-border text-foreground">unter Mindest — bestellt</span>
                        : art ? <span className="inline-flex items-center gap-1 text-foreground"><CheckCircle2 size={12} className="text-emerald-500" />ok</span>
                        : <span className="text-muted-foreground">nicht gepflegt</span>}
                      {tief && <span className="text-[10px] text-muted-foreground">ein Drucker unter 15 %</span>}
                      {offenMenge > 0 && (
                        <span className="text-[11px] text-foreground">{offenMenge} bestellt ({offen.map(b => datum(b.am)).join(', ')})
                          <button disabled={sperre} onClick={() => void lieferung(a)} className="ml-1 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-border hover:bg-accent disabled:opacity-40"><PackageCheck size={11} />Lieferung da</button>
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => setBestellung(a)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground font-semibold hover:opacity-90"><ShoppingCart size={12} />Bestellen</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!sichtbar.length && <p className="px-3 py-6 text-center text-xs text-muted-foreground">{arten.length ? 'Keine Treffer.' : 'Noch keine Tonerarten — sie erscheinen nach der ersten Drucker-Prüfung (oder von Hand ergänzen).'}</p>}
      </div>

      {lager && lager.bewegungen.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <button onClick={() => setVerlaufAuf(x => !x)} className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-foreground hover:bg-accent/30">
            {verlaufAuf ? <ChevronDown size={13} /> : <ChevronRight size={13} />}Lagerbewegungen ({lager.bewegungen.length})
          </button>
          {verlaufAuf && (
            <div className="max-h-72 overflow-y-auto divide-y divide-border border-t border-border">
              {[...lager.bewegungen].reverse().slice(0, 100).map((b, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-1.5 text-[11px]">
                  <span className="w-24 text-muted-foreground tabular-nums">{zeit(b.am)}</span>
                  <span className="w-10 text-right font-semibold tabular-nums text-foreground">{b.delta > 0 ? `+${b.delta}` : b.delta || '·'}</span>
                  <span className="flex-1 min-w-0 truncate text-foreground">{b.name}{b.drucker ? ` · ${b.drucker}` : ''}{b.text ? ` — ${b.text}` : ''}</span>
                  <span className="text-muted-foreground">Bestand {b.bestandNach}</span>
                  <span className="w-32 truncate text-muted-foreground">{b.von || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {bestellung && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-start justify-center overflow-y-auto p-6" onClick={() => setBestellung(null)}>
          <div className="relative w-full max-w-5xl rounded-xl border border-border bg-background p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <button onClick={() => setBestellung(null)} className="absolute right-3 top-3 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent" title="Schließen"><X size={16} /></button>
            <p className="text-xs text-muted-foreground mb-3">Bestellung für <b className="text-foreground">{bestellung.name}</b> — Lagerbestand {bestellung.artikel?.bestand ?? 0}{bestellung.drucker.length ? ` · verwendet in ${bestellung.drucker.map(d => d.name).join(', ')}` : ''}</p>
            <TonerOrder
              vorbelegt={{
                toner: bestellung.artikel?.bestellNr || bestellung.bestellNr,
                menge: Math.max(1, (bestellung.artikel?.mindest ?? 0) - (bestellung.artikel?.bestand ?? 0) + 1),
                notiz: bestellung.drucker.length ? `Fuer Drucker: ${bestellung.drucker.map(d => d.name).join(', ')}` : '',
              }}
              onGesendet={(_t, menge) => void bestellt(bestellung, menge)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
