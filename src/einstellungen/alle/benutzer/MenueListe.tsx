// ── Hakenliste: Menüpunkte (nach Sidebar-Kategorien) mit aufklappbaren Unterbereichen ──
import { useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { kinderVon, BEREICHE, type MenuCatalogItem } from '../../../utils/menuCatalog'
import { bereichSichtbar, rolleReicht, type BenutzerRecht, type SichtKontext } from '../../../utils/sichtbarkeit'
import { menuStateOf, withMenuState, type MenuVisibility, type MenuVisibilityState } from '../../../utils/menuVisibility'
import type { Screen } from '../../../types'
import { ZEILEN, KATEGORIEN, punktAn, punktSetzen, bereichSetzen, bereichWieStandard, unterbereicheVon } from './modell'

const rollenText = (m: Pick<MenuCatalogItem, 'adminOnly' | 'masterAdminOnly'>) => m.masterAdminOnly ? 'nur Master' : m.adminOnly ? 'ab Admin' : ''

function Haken({ an, onChange, disabled, label, data }: { an: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; data?: string }) {
  return <input type="checkbox" checked={an} disabled={disabled} onChange={e => onChange(e.target.checked)} aria-label={label} data-haken={data}
    className="w-4 h-4 accent-primary shrink-0 disabled:opacity-50 disabled:cursor-not-allowed" />
}

// ── je Benutzer ──────────────────────────────────────────────────────────────
export function BenutzerMenueListe({ ctx, recht, onRecht, festAn = [] }: {
  ctx: SichtKontext; recht: BenutzerRecht; onRecht: (r: BenutzerRecht) => void; festAn?: string[]
}) {
  const [offen, setOffen] = useState<Set<string>>(new Set())
  const k = { ...ctx, recht }
  const punkteFrei = recht.modus !== 'standard'
  const umklappen = (id: string) => setOffen(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <div className="space-y-3" data-menue-liste="benutzer">
      {KATEGORIEN.map(kat => (
        <div key={kat}>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{kat}</p>
          <div className="rounded-lg border border-border divide-y divide-border">
            {ZEILEN.filter(m => m.category === kat).map(m => {
              const rolleOk = rolleReicht(m, ctx.rolle)
              const an = rolleOk && punktAn(m.id, k)
              const fest = festAn.includes(m.id)
              const unter = unterbereicheVon(m.id)
              const aus = unter.filter(u => !bereichSichtbar(m.id, u.key, k)).length
              const eigeneListe = Array.isArray(recht.bereiche[m.id])
              return (
                <div key={m.id} data-menue-punkt={m.id}>
                  <div className={`flex items-center gap-2.5 px-3 py-1.5 ${rolleOk ? '' : 'opacity-50'}`}>
                    <Haken an={an || fest} disabled={!rolleOk || !punkteFrei || fest} label={m.label} data={m.id}
                      onChange={v => onRecht(punktSetzen(recht, m.id, v))} />
                    <span className={`text-xs flex-1 ${an || fest ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{m.label}</span>
                    {fest && <span className="text-[10px] text-muted-foreground">bleibt für dich an</span>}
                    {!rolleOk && <span className="text-[10px] text-muted-foreground" title="Die Rolle reicht dafür nicht">{rollenText(m)}</span>}
                    {unter.length > 0 && rolleOk && (
                      <button onClick={() => umklappen(m.id)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" data-unter-oeffnen={m.id}>
                        {aus ? <span className="es-warn">{aus} von {unter.length} aus</span> : <span>{unter.length} Bereiche</span>}
                        {offen.has(m.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    )}
                  </div>
                  {offen.has(m.id) && unter.length > 0 && rolleOk && (
                    <div className="pl-10 pr-3 pb-2 space-y-1" data-unter-liste={m.id}>
                      {unter.map(u => {
                        const sichtbar = bereichSichtbar(m.id, u.key, k)
                        const kind = kinderVon(m.id).find(c => c.id === u.key)
                        const kindRolleOk = !kind || rolleReicht(kind, ctx.rolle)
                        return (
                          <label key={u.key} className={`flex items-center gap-2 text-xs ${kindRolleOk ? '' : 'opacity-50'}`}>
                            <Haken an={sichtbar && kindRolleOk} disabled={!kindRolleOk} label={`${m.label} › ${u.label}`} data={`${m.id}:${u.key}`}
                              onChange={v => onRecht(bereichSetzen(recht, m.id, u.key, v, ctx.standardBereiche))} />
                            <span className={sichtbar ? 'text-foreground' : 'text-muted-foreground line-through'}>{u.label}</span>
                            {!kindRolleOk && kind && <span className="text-[10px] text-muted-foreground">{rollenText(kind)}</span>}
                          </label>
                        )
                      })}
                      {eigeneListe && (
                        <button onClick={() => onRecht(bereichWieStandard(recht, m.id))} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline mt-1">
                          <RotateCcw size={11} />Wie Standard
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Standard (für alle ohne eigene Einstellung) ─────────────────────────────
const STUFEN: { value: MenuVisibilityState; label: string }[] = [
  { value: 'all', label: 'Für alle' },
  { value: 'admin', label: 'Ab Admin' },
  { value: 'master', label: 'Nur Master' },
  { value: 'hidden', label: 'Aus' },
]

function Stufe({ id, global, onGlobal, fest }: { id: string; global: MenuVisibility; onGlobal: (v: MenuVisibility) => void; fest?: string }) {
  if (fest) return <span className="text-[11px] text-muted-foreground px-2">{fest}</span>
  const s = menuStateOf(id, global)
  return (
    <select value={s} onChange={e => onGlobal(withMenuState(id, e.target.value as MenuVisibilityState, global))} data-stufe={id}
      className={`text-[11px] rounded-md bg-background border px-2 py-1 text-foreground ${s === 'hidden' ? 'border-[var(--es-fehler)]' : s === 'all' ? 'border-border' : 'border-[var(--es-info)]'}`}>
      {STUFEN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function StandardMenueListe({ global, onGlobal, bereiche, onBereiche }: {
  global: MenuVisibility; onGlobal: (v: MenuVisibility) => void
  bereiche: Record<string, string[]>; onBereiche: (b: Record<string, string[]>) => void
}) {
  const [offen, setOffen] = useState<Set<string>>(new Set())
  const umklappen = (id: string) => setOffen(o => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const bereichUm = (menuId: string, key: string, sichtbar: boolean) => {
    const alt = bereiche[menuId] || []
    const neu = sichtbar ? alt.filter(k => k !== key) : [...new Set([...alt, key])]
    const b = { ...bereiche, [menuId]: neu }
    if (!neu.length) delete b[menuId]
    onBereiche(b)
  }
  return (
    <div className="space-y-3" data-menue-liste="standard">
      {KATEGORIEN.map(kat => (
        <div key={kat}>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{kat}</p>
          <div className="rounded-lg border border-border divide-y divide-border">
            {ZEILEN.filter(m => m.category === kat).map(m => {
              const kinder = kinderVon(m.id)
              const tabs = BEREICHE[m.id as Screen] || []
              const anzahl = kinder.length + tabs.length
              const aus = (bereiche[m.id] || []).length + kinder.filter(c => menuStateOf(c.id, global) === 'hidden').length
              const fest = m.alwaysVisible ? 'immer sichtbar' : (m.masterAdminOnly ? 'nur Master (fest)' : undefined)
              return (
                <div key={m.id} data-menue-punkt={m.id}>
                  <div className="flex items-center gap-2.5 px-3 py-1.5">
                    <span className={`text-xs flex-1 ${menuStateOf(m.id, global) === 'hidden' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{m.label}</span>
                    {m.adminOnly && <span className="text-[10px] text-muted-foreground" title="Fest im Tool: nur für Admins und Master">ab Admin (fest)</span>}
                    {anzahl > 0 && (
                      <button onClick={() => umklappen(m.id)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" data-unter-oeffnen={m.id}>
                        {aus ? <span className="es-warn">{aus} von {anzahl} aus</span> : <span>{anzahl} Bereiche</span>}
                        {offen.has(m.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </button>
                    )}
                    <Stufe id={m.id} global={global} onGlobal={onGlobal} fest={fest} />
                  </div>
                  {offen.has(m.id) && anzahl > 0 && (
                    <div className="pl-8 pr-3 pb-2 space-y-1" data-unter-liste={m.id}>
                      {kinder.map(c => (
                        <div key={c.id} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 text-foreground">{c.label}</span>
                          <Stufe id={c.id} global={global} onGlobal={onGlobal} />
                        </div>
                      ))}
                      {tabs.map(t => {
                        const sichtbar = !(bereiche[m.id] || []).includes(t.key)
                        return (
                          <label key={t.key} className="flex items-center gap-2 text-xs">
                            <Haken an={sichtbar} onChange={v => bereichUm(m.id, t.key, v)} label={`${m.label} › ${t.label}`} data={`${m.id}:${t.key}`} />
                            <span className={sichtbar ? 'text-foreground' : 'text-muted-foreground line-through'}>{t.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
