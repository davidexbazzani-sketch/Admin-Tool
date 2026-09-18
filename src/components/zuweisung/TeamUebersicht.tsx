import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, UserX, CalendarClock } from 'lucide-react'
import type { Regelwerk, Abwesenheiten } from '../../services/zuweisung/types'
import { regelnJePerson, personenJeTeam } from '../../services/zuweisung/analyse'

const TEAM_LABEL: Record<string, string> = { INFRA: 'Infrastruktur (Vor-Ort)', FS: 'Field Service Hamburg', APPS: 'SAP-/Anwendungsteam', HR: 'HR-Queue', 'APPS-EXT': 'Externe Berater' }

function fmt(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00'); return isNaN(d.getTime()) ? (iso || '') : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
}
/** Aktueller/kommender Abwesenheitsstatus einer Person zum Datum. */
function statusFor(abw: Abwesenheiten | null, name: string, datumISO: string): { text: string; ton: 'weg' | 'bald' | 'da' | 'unbek' } {
  if (!abw) return { text: '', ton: 'unbek' }
  const p = abw.personen?.[name]
  if (!p) return { text: 'nicht im Kalender', ton: 'unbek' }
  const heute = p.zeitraeume.find(z => z.von <= datumISO && datumISO <= z.bis)
  if (heute) return { text: `abwesend bis ${fmt(heute.bis)}`, ton: 'weg' }
  const naechste = p.zeitraeume.filter(z => z.von > datumISO).sort((a, b) => a.von.localeCompare(b.von))[0]
  if (naechste) return { text: `ab ${fmt(naechste.von)} weg`, ton: 'bald' }
  return { text: 'anwesend', ton: 'da' }
}

export default function TeamUebersicht({ regelwerk, abwesenheiten, datumISO }: { regelwerk: Regelwerk; abwesenheiten: Abwesenheiten | null; datumISO: string }) {
  const rollen = useMemo(() => regelnJePerson(regelwerk), [regelwerk])
  const teams = useMemo(() => personenJeTeam(regelwerk), [regelwerk])
  const [zeigeInaktiv, setZeigeInaktiv] = useState(false)

  const tonCls: Record<string, string> = { weg: 'text-red-400', bald: 'text-red-400', da: 'text-emerald-300', unbek: 'text-muted-foreground' }

  return (
    <div className="space-y-5 max-w-[70rem]">
      {teams.map(t => (
        <div key={t.team}>
          <h3 className="text-sm font-semibold text-foreground mb-2">{TEAM_LABEL[t.team] || t.team} <span className="text-muted-foreground font-normal">({t.aktiv.length} aktiv)</span></h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-3">
            {t.aktiv.map(name => {
              const p = regelwerk.personen[name]
              const r = rollen[name] || { haupt: [], vertretung: [] }
              const st = statusFor(abwesenheiten, name, datumISO)
              return (
                <div key={name} className="rounded-lg border border-border bg-card p-3 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground">{name}</span>
                    {st.text && <span className={`inline-flex items-center gap-1 text-[11px] ${tonCls[st.ton]}`}><CalendarClock size={11} />{st.text}</span>}
                  </div>
                  {p.rolle && <div className="text-[11px] text-muted-foreground">{p.rolle}</div>}
                  <div className="text-[11px] flex flex-wrap gap-1">
                    {r.haupt.map(x => <span key={x.id} title={x.thema} className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-mono">{x.id}</span>)}
                  </div>
                  {r.vertretung.length > 0 && (
                    <div className="text-[11px] flex flex-wrap gap-1">
                      <span className="text-muted-foreground mr-1">Vertretung:</span>
                      {r.vertretung.map(x => <span key={x.id} title={x.thema} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border font-mono">{x.id}</span>)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Inaktive */}
      {teams.some(t => t.inaktiv.length > 0) && (
        <div className="rounded-lg border border-border bg-background">
          <button onClick={() => setZeigeInaktiv(v => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground hover:text-foreground">
            {zeigeInaktiv ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <UserX size={14} />Nicht mehr zuweisen ({teams.reduce((a, t) => a + t.inaktiv.length, 0)})
          </button>
          {zeigeInaktiv && (
            <div className="px-4 pb-3 flex flex-col gap-1">
              {teams.flatMap(t => t.inaktiv).map(name => (
                <div key={name} className="text-xs text-muted-foreground">
                  <span className="line-through">{name}</span> — {regelwerk.personen[name]?.status}{regelwerk.personen[name]?.rolle ? ` · ${regelwerk.personen[name].rolle}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
