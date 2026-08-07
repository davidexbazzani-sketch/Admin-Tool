// ── Onboarding-Karten-Editor ──────────────────────────────────────────────────
// Hier pflegt die IT einmalig alles, was die interaktive Map der Onboarding-
// HTML braucht:
//   - Gebaeude-Regionen auf dem Komplett-Lageplan (Rechteck ziehen -> Klickflaeche)
//   - Etagen→PDF-Seiten-Zuordnung (Verwaltungsgebaeude/Kopfbauwerk)
//   - Ziel-Pins (Personalbuero, Kantine, Betriebsrat, Empfang) + Raum-Pins
//   - Wegbeschreibungen (Routen) als Schrittlisten
// Gespeichert zentral in onboarding/markers.json.

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Save, MapPin, Square, MousePointer2, Trash2, Plus, Route, Layers, Info } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import OnboardingPlanViewer, { type EditorMode } from './OnboardingPlanViewer'
import {
  loadOnboardingMarkers, saveOnboardingMarkers, newMarkerId,
  PLAN_IDS, PLAN_LABELS, MULTI_FLOOR_PLANS, DESTINATION_PRESETS,
  type OnboardingMarkers, type PlanId, type MapPin as Pin, type MapRegion, type MapRoute,
} from '../../services/onboarding'

export default function MarkerEditor() {
  const authUser = useAuthStore(s => s.session?.user)
  const currentUser = authUser?.displayName || authUser?.username || 'unbekannt'

  const [markers, setMarkers] = useState<OnboardingMarkers | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const [planId, setPlanId] = useState<PlanId>('komplett')
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [mode, setMode] = useState<EditorMode>('none')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [resetSignal, setResetSignal] = useState(0)

  // Formular fuer neue Pins
  const [pinKind, setPinKind] = useState<'destination' | 'room' | 'entrance'>('destination')
  const [pinLabel, setPinLabel] = useState('')
  const [pinRoom, setPinRoom] = useState('')
  const [pinBuilding, setPinBuilding] = useState<PlanId>('verwaltung')

  // Abschluss-Formular fuer eine frisch gezogene Region
  const [pendingRect, setPendingRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [regionLabel, setRegionLabel] = useState('')
  const [regionTarget, setRegionTarget] = useState<PlanId>('kopfbauwerk')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const m = await loadOnboardingMarkers()
      if (!cancelled) { setMarkers(m); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])

  function update(mut: (m: OnboardingMarkers) => OnboardingMarkers) {
    setMarkers(prev => (prev ? mut(structuredClone(prev)) : prev))
    setDirty(true)
    setSavedMsg('')
  }

  async function save() {
    if (!markers) return
    setSaving(true)
    try {
      const ok = await saveOnboardingMarkers(markers, currentUser)
      setSavedMsg(ok ? 'Gespeichert ✓' : 'Speichern fehlgeschlagen (Netzlaufwerk?)')
      if (ok) setDirty(false)
    } finally { setSaving(false) }
  }

  const pinsHere = useMemo(() => (markers?.pins ?? []).filter(p => p.planId === planId && p.page === page), [markers, planId, page])
  const regionsHere = useMemo(() => (markers?.regions ?? []).filter(r => r.planId === planId && r.page === page), [markers, planId, page])
  const selectedPin = markers?.pins.find(p => p.id === selectedId) ?? null
  const selectedRegion = markers?.regions.find(r => r.id === selectedId) ?? null
  const destinationPins = markers?.pins.filter(p => p.kind === 'destination') ?? []
  const roomPins = markers?.pins.filter(p => p.kind === 'room') ?? []
  const isMultiFloor = MULTI_FLOOR_PLANS.includes(planId)
  const floors = markers?.floors[planId] ?? []

  function placePin(x: number, y: number) {
    const label = pinLabel.trim() || (
      pinKind === 'room' ? (pinRoom.trim() ? `Raum ${pinRoom.trim()}` : 'Raum')
      : pinKind === 'entrance' ? `Eingang ${PLAN_LABELS[pinBuilding]}`
      : 'Ziel')
    const pin: Pin = {
      id: newMarkerId('pin'), kind: pinKind, planId, page, x, y, label,
      roomNumber: pinKind === 'room' ? pinRoom.trim() : undefined,
      buildingId: pinKind === 'entrance' ? pinBuilding : undefined,
    }
    update(m => { m.pins.push(pin); return m })
    setSelectedId(pin.id)
    setMode('none')
    setPinLabel(''); setPinRoom('')
  }

  function placeRegion(rect: { x: number; y: number; w: number; h: number }) {
    setPendingRect(rect)
    setMode('none')
  }

  function commitRegion() {
    if (!pendingRect || !regionLabel.trim()) return
    const region: MapRegion = { id: newMarkerId('rg'), planId, page, label: regionLabel.trim(), targetPlanId: regionTarget, rect: pendingRect }
    update(m => { m.regions.push(region); return m })
    setSelectedId(region.id)
    setPendingRect(null); setRegionLabel('')
  }

  function deleteSelected() {
    if (!selectedId) return
    update(m => {
      m.pins = m.pins.filter(p => p.id !== selectedId)
      m.regions = m.regions.filter(r => r.id !== selectedId)
      m.routes = m.routes.filter(r => r.fromPinId !== selectedId && r.toPinId !== selectedId)
      return m
    })
    setSelectedId(null)
  }

  function switchPlan(p: PlanId) {
    setPlanId(p); setPage(1); setSelectedId(null); setMode('none'); setPendingRect(null)
    setResetSignal(s => s + 1)
  }

  if (loading || !markers) {
    return <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin" />Lade Karten-Konfiguration…</div>
  }

  return (
    <div className="flex gap-4 h-full min-h-0">
      {/* ── Karte ── */}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {PLAN_IDS.map(p => (
            <button key={p} onClick={() => switchPlan(p)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${planId === p ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}>
              {PLAN_LABELS[p]}
            </button>
          ))}
          {pageCount > 1 && (
            <select value={page} onChange={e => { setPage(Number(e.target.value)); setSelectedId(null) }}
              className="px-2 py-1.5 text-xs rounded-md bg-background border border-border text-foreground">
              {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => <option key={n} value={n}>Seite {n}</option>)}
            </select>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => { setMode('none'); setPendingRect(null) }} title="Auswählen / verschieben"
              className={`p-1.5 rounded-md border ${mode === 'none' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}><MousePointer2 size={14} /></button>
            <button onClick={() => { setMode('pin'); setPendingRect(null) }} title="Pin setzen (Klick auf die Karte)"
              className={`p-1.5 rounded-md border ${mode === 'pin' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}><MapPin size={14} /></button>
            <button onClick={() => setMode('region')} title="Gebäude-Region ziehen (Rechteck aufziehen)"
              className={`p-1.5 rounded-md border ${mode === 'region' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border text-muted-foreground hover:text-foreground'}`}><Square size={14} /></button>
          </div>
        </div>

        {mode === 'pin' && (
          <div className="flex items-center gap-2 flex-wrap text-xs bg-muted/10 border border-border rounded-md px-3 py-2">
            <span className="text-muted-foreground font-semibold">Neuer Pin:</span>
            <select value={pinKind} onChange={e => setPinKind(e.target.value as 'destination' | 'room' | 'entrance')}
              className="px-2 py-1 rounded bg-background border border-border text-foreground">
              <option value="destination">Ziel (z. B. Kantine)</option>
              <option value="room">Raum / Arbeitsplatz</option>
              <option value="entrance">Gebäude-Eingang (auf Gesamtplan)</option>
            </select>
            <input value={pinLabel} onChange={e => setPinLabel(e.target.value)} placeholder="Beschriftung"
              className="px-2 py-1 rounded bg-background border border-border text-foreground w-44" />
            {pinKind === 'room' && (
              <input value={pinRoom} onChange={e => setPinRoom(e.target.value)} placeholder="Raumnr. (z. B. 210)"
                className="px-2 py-1 rounded bg-background border border-border text-foreground w-32" />
            )}
            {pinKind === 'entrance' && (
              <select value={pinBuilding} onChange={e => setPinBuilding(e.target.value as PlanId)}
                className="px-2 py-1 rounded bg-background border border-border text-foreground">
                {PLAN_IDS.filter(p => p !== 'komplett').map(p => <option key={p} value={p}>Eingang: {PLAN_LABELS[p]}</option>)}
              </select>
            )}
            <span className="text-muted-foreground">→ dann auf die Karte klicken{pinKind === 'entrance' && planId !== 'komplett' ? ' (Eingänge gehören auf den Komplett-Lageplan!)' : ''}</span>
          </div>
        )}

        {pendingRect && (
          <div className="flex items-center gap-2 flex-wrap text-xs bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
            <span className="font-semibold text-amber-300">Region benennen:</span>
            <input autoFocus value={regionLabel} onChange={e => setRegionLabel(e.target.value)} placeholder="z. B. Kopfbauwerk"
              onKeyDown={e => { if (e.key === 'Enter') commitRegion() }}
              className="px-2 py-1 rounded bg-background border border-border text-foreground w-44" />
            <span className="text-muted-foreground">öffnet:</span>
            <select value={regionTarget} onChange={e => setRegionTarget(e.target.value as PlanId)}
              className="px-2 py-1 rounded bg-background border border-border text-foreground">
              {PLAN_IDS.filter(p => p !== 'komplett').map(p => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
            </select>
            <button onClick={commitRegion} disabled={!regionLabel.trim()}
              className="px-2.5 py-1 rounded bg-primary text-primary-foreground font-semibold disabled:opacity-40">Übernehmen</button>
            <button onClick={() => setPendingRect(null)} className="px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground">Verwerfen</button>
          </div>
        )}

        <div className="flex-1 min-h-[420px] rounded-lg border border-border overflow-hidden">
          <OnboardingPlanViewer
            planId={planId} page={page}
            pins={pinsHere} regions={regionsHere}
            selectedId={selectedId} mode={mode}
            onPlacePin={placePin}
            onPlaceRegion={placeRegion}
            onSelect={setSelectedId}
            onPinMove={(id, x, y) => update(m => { const p = m.pins.find(q => q.id === id); if (p) { p.x = x; p.y = y } return m })}
            onPageCountKnown={setPageCount}
            resetSignal={resetSignal}
          />
        </div>
      </div>

      {/* ── Seitenleiste ── */}
      <div className="w-80 shrink-0 overflow-y-auto space-y-3 pr-1">
        <button onClick={save} disabled={saving || !dirty}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-md font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {dirty ? 'Änderungen speichern' : 'Gespeichert'}
        </button>
        {savedMsg && <p className={`text-xs ${savedMsg.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>{savedMsg}</p>}

        {/* Auswahl */}
        {(selectedPin || selectedRegion) && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-foreground">{selectedPin ? (selectedPin.kind === 'room' ? 'Raum-Pin' : selectedPin.kind === 'entrance' ? 'Eingangs-Pin' : 'Ziel-Pin') : 'Gebäude-Region'}</h4>
              <button onClick={deleteSelected} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10" title="Löschen"><Trash2 size={13} /></button>
            </div>
            <input
              value={selectedPin ? selectedPin.label : selectedRegion!.label}
              onChange={e => update(m => {
                const p = m.pins.find(q => q.id === selectedId); if (p) p.label = e.target.value
                const r = m.regions.find(q => q.id === selectedId); if (r) r.label = e.target.value
                return m
              })}
              className="w-full px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground" placeholder="Beschriftung" />
            {selectedPin?.kind === 'room' && (
              <input
                value={selectedPin.roomNumber ?? ''}
                onChange={e => update(m => { const p = m.pins.find(q => q.id === selectedId); if (p) p.roomNumber = e.target.value; return m })}
                className="w-full px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground" placeholder="Raumnummer (z. B. 210)" />
            )}
            {selectedPin?.kind === 'entrance' && (
              <select
                value={selectedPin.buildingId ?? 'verwaltung'}
                onChange={e => update(m => { const p = m.pins.find(q => q.id === selectedId); if (p) p.buildingId = e.target.value as PlanId; return m })}
                className="w-full px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground">
                {PLAN_IDS.filter(p => p !== 'komplett').map(p => <option key={p} value={p}>Eingang von: {PLAN_LABELS[p]}</option>)}
              </select>
            )}
            {selectedRegion && (
              <select
                value={selectedRegion.targetPlanId}
                onChange={e => update(m => { const r = m.regions.find(q => q.id === selectedId); if (r) r.targetPlanId = e.target.value as PlanId; return m })}
                className="w-full px-2 py-1.5 text-xs rounded bg-background border border-border text-foreground">
                {PLAN_IDS.filter(p => p !== 'komplett').map(p => <option key={p} value={p}>öffnet: {PLAN_LABELS[p]}</option>)}
              </select>
            )}
            {selectedPin && <p className="text-[10px] text-muted-foreground">Pin auf der Karte ziehen, um ihn zu verschieben.</p>}
          </div>
        )}

        {/* Etagen-Zuordnung */}
        {isMultiFloor && (
          <div className="rounded-lg border border-border bg-card p-3 space-y-2">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5"><Layers size={12} className="text-blue-400" />Etagen → PDF-Seiten ({PLAN_LABELS[planId]})</h4>
            {floors.length === 0 && <p className="text-[11px] text-muted-foreground">Noch keine Etagen zugeordnet. Die HTML fragt dann keine Etage ab.</p>}
            {floors.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input value={f.floor}
                  onChange={e => update(m => { const arr = m.floors[planId] ?? []; arr[i] = { ...arr[i], floor: e.target.value }; m.floors[planId] = arr; return m })}
                  className="w-16 px-2 py-1 text-xs rounded bg-background border border-border text-foreground" placeholder="EG" />
                <span className="text-[11px] text-muted-foreground">= Seite</span>
                <select value={f.page}
                  onChange={e => update(m => { const arr = m.floors[planId] ?? []; arr[i] = { ...arr[i], page: Number(e.target.value) }; m.floors[planId] = arr; return m })}
                  className="flex-1 px-2 py-1 text-xs rounded bg-background border border-border text-foreground">
                  {Array.from({ length: pageCount }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={() => update(m => { m.floors[planId] = (m.floors[planId] ?? []).filter((_, j) => j !== i); return m })}
                  className="p-1 rounded text-muted-foreground hover:text-red-400"><Trash2 size={12} /></button>
              </div>
            ))}
            <button onClick={() => update(m => { m.floors[planId] = [...(m.floors[planId] ?? []), { floor: '', page: 1 }]; return m })}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} />Etage hinzufügen</button>
            <p className="text-[10px] text-muted-foreground">Konvention: „EG", „1", „2" … (Raumnummer 210 → Etage „2").</p>
          </div>
        )}

        {/* Routen */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5"><Route size={12} className="text-blue-400" />Wegbeschreibungen</h4>
          {markers.routes.length === 0 && <p className="text-[11px] text-muted-foreground">Noch keine Routen. „Weg anzeigen" hebt dann nur die Pins hervor.</p>}
          {markers.routes.map(rt => (
            <div key={rt.id} className="rounded-md border border-border bg-background p-2 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <select value={rt.fromPinId}
                  onChange={e => update(m => { const r = m.routes.find(q => q.id === rt.id); if (r) r.fromPinId = e.target.value; return m })}
                  className="flex-1 min-w-0 px-1.5 py-1 text-[11px] rounded bg-card border border-border text-foreground">
                  <option value="">Von: beliebig</option>
                  {roomPins.map(p => <option key={p.id} value={p.id}>Von: {p.label}</option>)}
                </select>
                <select value={rt.toPinId}
                  onChange={e => update(m => { const r = m.routes.find(q => q.id === rt.id); if (r) r.toPinId = e.target.value; return m })}
                  className="flex-1 min-w-0 px-1.5 py-1 text-[11px] rounded bg-card border border-border text-foreground">
                  <option value="">Nach: Ziel wählen</option>
                  {destinationPins.map(p => <option key={p.id} value={p.id}>Nach: {p.label}</option>)}
                </select>
                <button onClick={() => update(m => { m.routes = m.routes.filter(q => q.id !== rt.id); return m })}
                  className="p-1 rounded text-muted-foreground hover:text-red-400 shrink-0"><Trash2 size={12} /></button>
              </div>
              <textarea
                value={rt.steps.join('\n')}
                onChange={e => update(m => { const r = m.routes.find(q => q.id === rt.id); if (r) r.steps = e.target.value.split('\n'); return m })}
                onBlur={() => update(m => { const r = m.routes.find(q => q.id === rt.id); if (r) r.steps = r.steps.map(s => s.trim()).filter(Boolean); return m })}
                rows={3} placeholder={'Ein Schritt pro Zeile, z. B.:\nZum Kopfbauwerk gehen\nTreppe in den 2. Stock\nRaum 215 auf der linken Seite'}
                className="w-full px-2 py-1.5 text-[11px] rounded bg-card border border-border text-foreground leading-relaxed" />
            </div>
          ))}
          <button onClick={() => update(m => { m.routes.push({ id: newMarkerId('rt'), fromPinId: '', toPinId: destinationPins[0]?.id ?? '', steps: [] } satisfies MapRoute); return m })}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><Plus size={11} />Route hinzufügen</button>
        </div>

        {/* Checkliste der Soll-Ziele */}
        <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
          <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5"><Info size={12} className="text-blue-400" />Diese Ziele sollten gepinnt sein</h4>
          {DESTINATION_PRESETS.map(d => {
            const done = destinationPins.some(p => p.label.toLowerCase().includes(d.label.toLowerCase()))
            return (
              <p key={d.label} className={`text-[11px] ${done ? 'text-green-400' : 'text-muted-foreground'}`}>
                {done ? '✓' : '○'} {d.label} <span className="opacity-60">({d.hint})</span>
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}
