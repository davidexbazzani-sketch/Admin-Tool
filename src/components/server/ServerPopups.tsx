// ── Server-Monitor – Neustart-Popups oben rechts ──────────────────────────────
// Bleiben stehen, bis der Nutzer „Gelesen" klickt. Unerwartete Neustarts mit roter
// Kopfleiste (weiße Schrift), geplante/unbekannte mit gelber (schwarze Schrift);
// der Text steht immer in normaler Schrift auf der Kartenfarbe.

import { Check, CheckCheck, RotateCcw, ExternalLink, ListChecks, ShieldAlert } from 'lucide-react'
import { useServerEreignisStore } from '../../store/serverEreignisStore'
import { useAppStore } from '../../store/appStore'
import { neustartUeberschrift, artText, zertFrist } from '../../services/serverEreignisse'

const MAX_EINZELN = 3

function bootText(b?: string): string {
  if (!b) return '—'
  const d = new Date(b.replace(' ', 'T'))
  return isNaN(d.getTime()) ? b : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function ServerPopups() {
  const offen = useServerEreignisStore(s => s.offen)
  const gelesen = useServerEreignisStore(s => s.gelesen)
  const setScreen = useAppStore(s => s.setScreen)
  const setOeffneHost = useServerEreignisStore(s => s.setOeffneHost)
  if (!offen.length || !gelesen) return null
  const einzeln = offen.slice(0, MAX_EINZELN)
  const mehr = offen.length - einzeln.length

  return (
    <>
      {einzeln.map(e => {
        if (e.typ === 'zertifikat' && e.zert) {
          const rot = e.zert.schwelle !== '30'
          return (
            <div key={e.id} role="alert" className={`rounded-xl border-2 ${rot ? 'border-red-500' : 'border-amber-400'} bg-card shadow-2xl overflow-hidden`}>
              <div className={`flex items-center gap-2 px-3 py-1.5 ${rot ? 'bg-red-600 text-white' : 'bg-amber-400 text-black'}`}>
                <ShieldAlert size={14} className="shrink-0" />
                <span className="text-xs font-bold tracking-wide">Zertifikat {zertFrist(e.zert)}</span>
              </div>
              <div className="px-3 py-2.5 space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  <span className="font-mono">{e.host}</span>{e.bezeichnung && <span className="font-normal text-muted-foreground"> · {e.bezeichnung}</span>}
                </p>
                <p className="text-xs text-foreground break-words"><b>{e.zert.cn}</b> · gültig bis <b>{new Date(e.zert.bis).toLocaleDateString('de-DE')}</b></p>
                <p className="text-[11px] text-muted-foreground break-words">verwendet: {e.zert.verwendung}</p>
              </div>
              <div className="flex items-center gap-2 px-3 pb-2.5">
                <button onClick={() => { setOeffneHost(e.host, 'zertifikate'); setScreen('server') }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-foreground hover:bg-accent">
                  <ExternalLink size={11} />Zertifikate öffnen
                </button>
                <button onClick={() => gelesen([e.id])}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90">
                  <Check size={13} />Gelesen
                </button>
              </div>
            </div>
          )
        }
        if (e.typ === 'pruefung') return (
          <div key={e.id} role="alert" className="rounded-xl border-2 border-red-500 bg-card shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white">
              <ListChecks size={14} className="shrink-0" />
              <span className="text-xs font-bold tracking-wide">Server-Prüfung: nicht alles in Ordnung</span>
            </div>
            <div className="px-3 py-2.5 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                <span className="font-mono">{e.host}</span>{e.bezeichnung && <span className="font-normal text-muted-foreground"> · {e.bezeichnung}</span>}
              </p>
              <ul className="space-y-0.5">
                {(e.probleme || []).slice(0, 6).map((p, i) => <li key={i} className="text-xs text-foreground break-words">• {p}</li>)}
                {(e.probleme?.length || 0) > 6 && <li className="text-[11px] text-muted-foreground">… und {(e.probleme?.length || 0) - 6} weitere</li>}
              </ul>
            </div>
            <div className="flex items-center gap-2 px-3 pb-2.5">
              <button onClick={() => { setOeffneHost(e.host); setScreen('server') }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-foreground hover:bg-accent">
                <ExternalLink size={11} />Status öffnen
              </button>
              <button onClick={() => gelesen([e.id])}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90">
                <Check size={13} />Gelesen
              </button>
            </div>
          </div>
        )
        const unerwartet = e.art === 'unerwartet'
        return (
          <div key={e.id} role="alert" className={`rounded-xl border-2 ${unerwartet ? 'border-red-500' : 'border-amber-400'} bg-card shadow-2xl overflow-hidden`}>
            <div className={`flex items-center gap-2 px-3 py-1.5 ${unerwartet ? 'bg-red-600 text-white' : 'bg-amber-400 text-black'}`}>
              <RotateCcw size={14} className="shrink-0" />
              <span className="text-xs font-bold tracking-wide">{neustartUeberschrift(e)}</span>
            </div>
            <div className="px-3 py-2.5 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                <span className="font-mono">{e.host}</span>{e.bezeichnung && <span className="font-normal text-muted-foreground"> · {e.bezeichnung}</span>}
              </p>
              {e.ausAm && <p className="text-xs text-foreground">heruntergefahren <b>{bootText(e.ausAm)}</b></p>}
              <p className="text-xs text-foreground">gestartet <b>{bootText(e.boot)}</b>{e.vorherBoot && <span className="text-muted-foreground"> (vorher {bootText(e.vorherBoot)})</span>}</p>
              <p className="text-xs text-foreground">{artText(e).replace(/^./, c => c.toUpperCase())}.</p>
              {e.grund && <p className="text-[11px] text-muted-foreground break-words">{e.grund}</p>}
            </div>
            <div className="flex items-center gap-2 px-3 pb-2.5">
              <button onClick={() => setScreen('server')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border text-[11px] text-foreground hover:bg-accent">
                <ExternalLink size={11} />Server-Monitor
              </button>
              <button onClick={() => gelesen([e.id])}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90">
                <Check size={13} />Gelesen
              </button>
            </div>
          </div>
        )
      })}
      {mehr > 0 && (
        <div className="rounded-xl border-2 border-amber-400 bg-card shadow-2xl px-3 py-2 flex items-center gap-2">
          <RotateCcw size={14} className="shrink-0 text-amber-500" />
          <span className="flex-1 text-xs text-foreground"><b>{mehr} weitere</b> Server-Meldung{mehr === 1 ? '' : 'en'}: {offen.slice(MAX_EINZELN).map(e => e.host).join(', ')}</span>
        </div>
      )}
      {offen.length > 1 && (
        <div className="flex justify-end">
          <button onClick={() => gelesen(offen.map(e => e.id))}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-foreground text-xs font-semibold shadow-lg hover:bg-accent">
            <CheckCheck size={13} />Alle {offen.length} als gelesen bestätigen
          </button>
        </div>
      )}
    </>
  )
}
