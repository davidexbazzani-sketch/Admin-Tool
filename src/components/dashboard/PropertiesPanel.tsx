import React, { useState, useRef } from 'react'
import {
  Palette, Move, Settings, Bell, Sliders,
  ArrowUp, ArrowDown, Copy, Trash2,
  AlignLeft, AlignCenter, AlignRight,
  Plus, X,
} from 'lucide-react'
import type {
  DashboardElement, WidgetType, WidgetStyle, AlarmConfig, Threshold,
} from '../../types/dashboard'
import { DEFAULT_ALARM_CONFIG } from '../../types/dashboard'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PropertiesPanelProps {
  element: DashboardElement | null
  onUpdate: (id: string, patch: Partial<DashboardElement>) => void
  onDelete: (id: string) => void
  onBringToFront: (id: string) => void
  onSendToBack: (id: string) => void
  onDuplicate: (id: string) => void
}

type TabId = 'style' | 'position' | 'config' | 'alarm' | 'thresholds'

// ── Widget category helpers ────────────────────────────────────────────────────

const STATIC_TYPES: WidgetType[] = ['clock', 'note', 'text-label', 'divider']
const DATA_TYPES: WidgetType[] = [
  'online-status', 'service-status', 'cpu-usage', 'ram-usage', 'disk-usage',
  'uptime', 'system-info', 'logged-in-user', 'event-log-errors', 'windows-update',
  'quick-actions', 'counter', 'table',
]
const NUMERIC_TYPES: WidgetType[] = [
  'cpu-usage', 'ram-usage', 'disk-usage', 'event-log-errors', 'windows-update',
]
const TEXT_ELEMENT_TYPES: WidgetType[] = ['text-label', 'note']

function isStaticType(t: WidgetType) { return STATIC_TYPES.includes(t) }
function isDataType(t: WidgetType) { return DATA_TYPES.includes(t) }
function isNumericType(t: WidgetType) { return NUMERIC_TYPES.includes(t) }
function isTextElementType(t: WidgetType) { return TEXT_ELEMENT_TYPES.includes(t) }

// Widget type display names
const WIDGET_LABELS: Record<WidgetType, string> = {
  'online-status': 'Online-Status',
  'service-status': 'Dienststatus',
  'cpu-usage': 'CPU-Auslastung',
  'ram-usage': 'RAM-Auslastung',
  'disk-usage': 'Festplatte',
  'uptime': 'Uptime',
  'system-info': 'Systeminfo',
  'logged-in-user': 'Angemeldeter Benutzer',
  'event-log-errors': 'Ereignis-Fehler',
  'windows-update': 'Windows Update',
  'quick-actions': 'Schnellaktionen',
  'clock': 'Uhr',
  'note': 'Notiz',
  'text-label': 'Textbeschriftung',
  'divider': 'Trennlinie',
  'counter': 'Zähler',
  'table': 'Tabelle',
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface ColorPickerProps {
  value: string
  onChange: (v: string) => void
  label?: string
}

function ColorPicker({ value, onChange }: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {/* Color swatch acts as trigger */}
      <div
        className="w-6 h-6 rounded border border-border cursor-pointer shrink-0"
        style={{ backgroundColor: value }}
        onClick={() => inputRef.current?.click()}
        title="Farbe wählen"
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="sr-only"
        tabIndex={-1}
      />
      <input
        type="text"
        value={value}
        onChange={e => {
          const v = e.target.value
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v)
        }}
        maxLength={7}
        className="w-20 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary font-mono"
        placeholder="#000000"
      />
    </div>
  )
}

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${checked ? 'bg-primary' : 'bg-border'}`}
    >
      <span
        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

interface NumberInputProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  unit?: string
  className?: string
}

function NumberInput({ value, onChange, min, max, step = 1, unit, className }: NumberInputProps) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={e => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onChange(v)
        }}
        className={`w-16 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary ${className ?? ''}`}
      />
      {unit && <span className="text-muted-foreground text-[10px]">{unit}</span>}
    </div>
  )
}

// Reusable form row
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/30 text-xs">
      <span className="text-muted-foreground w-24 shrink-0">{label}</span>
      <div className="flex items-center gap-1 min-w-0 flex-1 justify-end">{children}</div>
    </div>
  )
}

// Section header
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider py-2 mt-2">
      {children}
    </div>
  )
}

// ── Tab: Stil ─────────────────────────────────────────────────────────────────

function StyleTab({ element, onUpdate }: { element: DashboardElement; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  const { style } = element

  function updateStyle(patch: Partial<WidgetStyle>) {
    onUpdate(element.id, { style: { ...style, ...patch } })
  }

  return (
    <div>
      <SectionHeader>Farben</SectionHeader>

      <FormRow label="Hintergrund">
        <ColorPicker value={style.backgroundColor} onChange={v => updateStyle({ backgroundColor: v })} />
      </FormRow>

      <FormRow label="Textfarbe">
        <ColorPicker value={style.textColor} onChange={v => updateStyle({ textColor: v })} />
      </FormRow>

      <FormRow label="Titelfarbe">
        <ColorPicker value={style.titleColor} onChange={v => updateStyle({ titleColor: v })} />
      </FormRow>

      <SectionHeader>Rahmen &amp; Form</SectionHeader>

      <FormRow label="Eckradius">
        <NumberInput value={style.borderRadius} onChange={v => updateStyle({ borderRadius: v })} min={0} max={50} unit="px" />
      </FormRow>

      <FormRow label="Rahmenbreite">
        <NumberInput value={style.borderWidth} onChange={v => updateStyle({ borderWidth: v })} min={0} max={10} unit="px" />
      </FormRow>

      <FormRow label="Rahmenstil">
        <select
          value={style.borderStyle}
          onChange={e => updateStyle({ borderStyle: e.target.value as WidgetStyle['borderStyle'] })}
          className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
        >
          <option value="none">Kein</option>
          <option value="solid">Solid</option>
          <option value="dashed">Gestrichelt</option>
          <option value="dotted">Gepunktet</option>
        </select>
      </FormRow>

      {style.borderStyle !== 'none' && style.borderWidth > 0 && (
        <FormRow label="Rahmenfarbe">
          <ColorPicker value={style.borderColor} onChange={v => updateStyle({ borderColor: v })} />
        </FormRow>
      )}

      <SectionHeader>Effekte</SectionHeader>

      <FormRow label="Schatten">
        <Toggle checked={style.shadow} onChange={v => updateStyle({ shadow: v })} />
      </FormRow>

      <FormRow label="Deckkraft">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={style.opacity}
            onChange={e => updateStyle({ opacity: parseFloat(e.target.value) })}
            className="w-20 accent-primary"
          />
          <span className="text-foreground text-[10px] w-8 text-right">{Math.round(style.opacity * 100)}%</span>
        </div>
      </FormRow>

      <SectionHeader>Titel</SectionHeader>

      <FormRow label="Titel anzeigen">
        <Toggle checked={style.titleVisible} onChange={v => updateStyle({ titleVisible: v })} />
      </FormRow>

      <SectionHeader>Schrift</SectionHeader>

      <FormRow label="Schriftgröße">
        <NumberInput value={style.fontSize} onChange={v => updateStyle({ fontSize: v })} min={8} max={72} unit="px" />
      </FormRow>

      <FormRow label="Schriftart">
        <select
          value={style.fontFamily}
          onChange={e => updateStyle({ fontFamily: e.target.value })}
          className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
        >
          <option value="Inter, sans-serif">Inter</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Roboto, sans-serif">Roboto</option>
          <option value="Consolas, monospace">Consolas</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Verdana, sans-serif">Verdana</option>
        </select>
      </FormRow>

      {isTextElementType(element.type) && (
        <>
          <FormRow label="Fett">
            <Toggle checked={style.fontBold} onChange={v => updateStyle({ fontBold: v })} />
          </FormRow>

          <FormRow label="Kursiv">
            <Toggle checked={style.fontItalic} onChange={v => updateStyle({ fontItalic: v })} />
          </FormRow>

          <FormRow label="Ausrichtung">
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map(align => {
                const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight
                return (
                  <button
                    key={align}
                    type="button"
                    onClick={() => updateStyle({ textAlign: align })}
                    className={`p-1 rounded transition-colors ${style.textAlign === align ? 'bg-primary text-primary-foreground' : 'bg-background border border-border text-muted-foreground hover:text-foreground'}`}
                    title={align}
                  >
                    <Icon size={12} />
                  </button>
                )
              })}
            </div>
          </FormRow>
        </>
      )}
    </div>
  )
}

// ── Tab: Position ─────────────────────────────────────────────────────────────

function PositionTab({
  element, onUpdate, onBringToFront, onSendToBack, onDuplicate, onDelete,
}: {
  element: DashboardElement
  onUpdate: PropertiesPanelProps['onUpdate']
  onBringToFront: PropertiesPanelProps['onBringToFront']
  onSendToBack: PropertiesPanelProps['onSendToBack']
  onDuplicate: PropertiesPanelProps['onDuplicate']
  onDelete: PropertiesPanelProps['onDelete']
}) {
  return (
    <div>
      <SectionHeader>Position &amp; Größe</SectionHeader>

      <FormRow label="X">
        <NumberInput
          value={element.position.x}
          onChange={v => onUpdate(element.id, { position: { ...element.position, x: v } })}
          min={0}
          unit="px"
        />
      </FormRow>

      <FormRow label="Y">
        <NumberInput
          value={element.position.y}
          onChange={v => onUpdate(element.id, { position: { ...element.position, y: v } })}
          min={0}
          unit="px"
        />
      </FormRow>

      <FormRow label="Breite">
        <NumberInput
          value={element.size.width}
          onChange={v => onUpdate(element.id, { size: { ...element.size, width: Math.max(40, v) } })}
          min={40}
          unit="px"
        />
      </FormRow>

      <FormRow label="Höhe">
        <NumberInput
          value={element.size.height}
          onChange={v => onUpdate(element.id, { size: { ...element.size, height: Math.max(24, v) } })}
          min={24}
          unit="px"
        />
      </FormRow>

      <SectionHeader>Ebene</SectionHeader>

      <FormRow label="Z-Index">
        <NumberInput
          value={element.zIndex}
          onChange={v => onUpdate(element.id, { zIndex: v })}
          min={0}
          max={999}
        />
      </FormRow>

      <FormRow label="Gesperrt">
        <Toggle
          checked={!!element.locked}
          onChange={v => onUpdate(element.id, { locked: v })}
        />
      </FormRow>

      <SectionHeader>Aktionen</SectionHeader>

      <div className="flex flex-col gap-1.5 py-1">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onBringToFront(element.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-background border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <ArrowUp size={12} />
            In Vordergrund
          </button>
          <button
            type="button"
            onClick={() => onSendToBack(element.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded bg-background border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <ArrowDown size={12} />
            In Hintergrund
          </button>
        </div>
        <button
          type="button"
          onClick={() => onDuplicate(element.id)}
          className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-background border border-border text-xs text-foreground hover:border-primary hover:text-primary transition-colors"
        >
          <Copy size={12} />
          Duplizieren
        </button>
        <button
          type="button"
          onClick={() => onDelete(element.id)}
          className="flex items-center justify-center gap-1.5 py-1.5 rounded bg-red-950/60 border border-red-800/60 text-xs text-red-400 hover:bg-red-900/60 hover:border-red-600 transition-colors"
        >
          <Trash2 size={12} />
          Löschen
        </button>
      </div>
    </div>
  )
}

// ── Tab: Konfiguration ────────────────────────────────────────────────────────

function ConfigTab({ element, onUpdate }: { element: DashboardElement; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  const { config, type } = element

  function updateConfig(patch: Partial<typeof config>) {
    onUpdate(element.id, { config: { ...config, ...patch } })
  }

  const targetsText = (config.targets ?? []).join('\n')
  const servicesText = (config.services ?? []).join('\n')

  const isNumeric = isNumericType(type)
  const isService = type === 'service-status'
  const isTextEl = isTextElementType(type)
  const isQuickAction = type === 'quick-actions'

  return (
    <div>
      <SectionHeader>Allgemein</SectionHeader>

      <FormRow label="Titel">
        <input
          type="text"
          value={config.title ?? ''}
          onChange={e => updateConfig({ title: e.target.value })}
          placeholder="Widget-Titel"
          className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
        />
      </FormRow>

      {!isStaticType(type) && !isTextEl && (
        <>
          <div className="py-1.5 border-b border-border/30 text-xs">
            <div className="text-muted-foreground mb-1">Hostnames</div>
            <textarea
              rows={3}
              value={targetsText}
              onChange={e => {
                const raw = e.target.value
                const parsed = raw
                  .split(/[\n,]+/)
                  .map(s => s.trim())
                  .filter(Boolean)
                updateConfig({ targets: parsed })
              }}
              placeholder="PC01&#10;PC02&#10;192.168.1.1"
              className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary resize-none font-mono"
            />
            <div className="text-muted-foreground text-[10px] mt-0.5">Einer pro Zeile oder kommagetrennt</div>
          </div>
        </>
      )}

      {isService && (
        <div className="py-1.5 border-b border-border/30 text-xs">
          <div className="text-muted-foreground mb-1">Dienste</div>
          <textarea
            rows={3}
            value={servicesText}
            onChange={e => {
              const parsed = e.target.value
                .split(/[\n,]+/)
                .map(s => s.trim())
                .filter(Boolean)
              updateConfig({ services: parsed })
            }}
            placeholder="wuauserv&#10;spooler&#10;W32Time"
            className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary resize-none font-mono"
          />
          <div className="text-muted-foreground text-[10px] mt-0.5">Dienstname (interne Kennung)</div>
        </div>
      )}

      {isTextEl && (
        <div className="py-1.5 border-b border-border/30 text-xs">
          <div className="text-muted-foreground mb-1">Text</div>
          <textarea
            rows={4}
            value={config.text ?? ''}
            onChange={e => updateConfig({ text: e.target.value })}
            placeholder="Textinhalt eingeben..."
            className="w-full bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary resize-none"
          />
        </div>
      )}

      {isQuickAction && (
        <div className="py-2 text-xs text-muted-foreground bg-background/40 rounded border border-border/40 px-2 mt-1">
          Aktionen werden direkt im Widget konfiguriert (Bearbeitungsmodus).
        </div>
      )}

      {!isStaticType(type) && !isTextEl && !isQuickAction && (
        <>
          <SectionHeader>Aktualisierung</SectionHeader>

          <FormRow label="Auto-Refresh">
            <Toggle checked={config.autoRefresh} onChange={v => updateConfig({ autoRefresh: v })} />
          </FormRow>

          {config.autoRefresh && (
            <FormRow label="Intervall">
              <NumberInput
                value={config.refreshInterval}
                onChange={v => updateConfig({ refreshInterval: Math.max(5, v) })}
                min={5}
                unit="Sek."
              />
            </FormRow>
          )}
        </>
      )}

      {isNumeric && (
        <>
          <SectionHeader>Darstellung</SectionHeader>

          <FormRow label="Format">
            <select
              value={config.displayFormat ?? 'tile'}
              onChange={e => updateConfig({ displayFormat: e.target.value })}
              className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              <option value="tile">Kachel</option>
              <option value="list">Liste</option>
              <option value="bar">Balken</option>
              <option value="gauge">Gauge</option>
              <option value="number">Zahl</option>
            </select>
          </FormRow>
        </>
      )}

      {!isStaticType(type) && !isTextEl && !isQuickAction && (
        <>
          <SectionHeader>Optionen</SectionHeader>

          <FormRow label="Zeitstempel">
            <Toggle
              checked={!!config.showTimestamp}
              onChange={v => updateConfig({ showTimestamp: v })}
            />
          </FormRow>

          <FormRow label="Refresh-Button">
            <Toggle
              checked={!!config.showRefreshButton}
              onChange={v => updateConfig({ showRefreshButton: v })}
            />
          </FormRow>
        </>
      )}
    </div>
  )
}

// ── Tab: Alarm ────────────────────────────────────────────────────────────────

const ALARM_CONDITION_OPTIONS = [
  { value: 'offline', label: 'Offline' },
  { value: 'gt', label: 'Wert > X' },
  { value: 'lt', label: 'Wert < X' },
  { value: 'gte', label: 'Wert >= X' },
  { value: 'lte', label: 'Wert <= X' },
  { value: 'eq', label: 'Wert = X' },
  { value: 'ne', label: 'Wert ≠ X' },
  { value: 'stopped', label: 'Dienst gestoppt' },
  { value: 'running', label: 'Dienst läuft' },
  { value: 'changed', label: 'Wert geändert' },
]

const NEEDS_VALUE: AlarmConfig['condition']['type'][] = ['gt', 'lt', 'gte', 'lte', 'eq', 'ne']

function AlarmTab({ element, onUpdate }: { element: DashboardElement; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  const alarm: AlarmConfig = element.alarm ?? { ...DEFAULT_ALARM_CONFIG }

  function updateAlarm(patch: Partial<AlarmConfig>) {
    onUpdate(element.id, { alarm: { ...alarm, ...patch } })
  }

  const conditionNeedsValue = NEEDS_VALUE.includes(alarm.condition.type)

  return (
    <div>
      <SectionHeader>Alarm-Konfiguration</SectionHeader>

      <FormRow label="Alarm aktiv">
        <Toggle checked={alarm.enabled} onChange={v => updateAlarm({ enabled: v })} />
      </FormRow>

      {alarm.enabled && (
        <>
          <SectionHeader>Bedingung</SectionHeader>

          <FormRow label="Auslöser">
            <select
              value={alarm.condition.type}
              onChange={e =>
                updateAlarm({
                  condition: { ...alarm.condition, type: e.target.value as AlarmConfig['condition']['type'] },
                })
              }
              className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              {ALARM_CONDITION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </FormRow>

          {conditionNeedsValue && (
            <FormRow label="Schwellenwert">
              <NumberInput
                value={Number(alarm.condition.value ?? 0)}
                onChange={v =>
                  updateAlarm({ condition: { ...alarm.condition, value: v } })
                }
                step={0.1}
              />
            </FormRow>
          )}

          <SectionHeader>Aktionen</SectionHeader>

          {(
            [
              { key: 'blink', label: 'Widget blinkt' },
              { key: 'blinkEntireApp', label: 'App blinkt' },
              { key: 'sound', label: 'Sound abspielen' },
              { key: 'popup', label: 'Popup anzeigen' },
              { key: 'log', label: 'Log-Eintrag' },
            ] as { key: keyof AlarmConfig['actions']; label: string }[]
          ).map(({ key, label }) => {
            const val = alarm.actions[key]
            if (typeof val !== 'boolean') return null
            return (
              <FormRow key={key} label={label}>
                <Toggle
                  checked={val}
                  onChange={v =>
                    updateAlarm({ actions: { ...alarm.actions, [key]: v } })
                  }
                />
              </FormRow>
            )
          })}

          {alarm.actions.sound && (
            <>
              <SectionHeader>Sound</SectionHeader>

              <FormRow label="Sound-Typ">
                <select
                  value={alarm.actions.soundType}
                  onChange={e =>
                    updateAlarm({
                      actions: {
                        ...alarm.actions,
                        soundType: e.target.value as AlarmConfig['actions']['soundType'],
                      },
                    })
                  }
                  className="bg-background border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
                >
                  <option value="siren">Sirene</option>
                  <option value="beep">Beep</option>
                  <option value="bell">Glocke</option>
                </select>
              </FormRow>

              <FormRow label="Lautstärke">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={alarm.actions.soundVolume}
                    onChange={e =>
                      updateAlarm({
                        actions: { ...alarm.actions, soundVolume: parseInt(e.target.value) },
                      })
                    }
                    className="w-20 accent-primary"
                  />
                  <span className="text-foreground text-[10px] w-8 text-right">{alarm.actions.soundVolume}%</span>
                </div>
              </FormRow>
            </>
          )}
        </>
      )}

      {!alarm.enabled && (
        <div className="text-[10px] text-muted-foreground py-2 px-1 bg-background/40 rounded border border-border/40 mt-2">
          Alarm ist deaktiviert. Aktiviere ihn oben, um Benachrichtigungen zu konfigurieren.
        </div>
      )}
    </div>
  )
}

// ── Tab: Schwellenwerte ───────────────────────────────────────────────────────

const THRESHOLD_CONDITION_OPTIONS = [
  { value: 'gt', label: '> (größer als)' },
  { value: 'gte', label: '>= (größer/gleich)' },
  { value: 'lt', label: '< (kleiner als)' },
  { value: 'lte', label: '<= (kleiner/gleich)' },
  { value: 'eq', label: '= (gleich)' },
  { value: 'ne', label: '≠ (ungleich)' },
]

function ThresholdsTab({ element, onUpdate }: { element: DashboardElement; onUpdate: PropertiesPanelProps['onUpdate'] }) {
  const thresholds: Threshold[] = element.thresholds ?? []

  function updateThresholds(next: Threshold[]) {
    onUpdate(element.id, { thresholds: next })
  }

  function addThreshold() {
    if (thresholds.length >= 5) return
    const newT: Threshold = {
      id: crypto.randomUUID(),
      condition: 'gt',
      value: 80,
      color: '#ef4444',
    }
    updateThresholds([...thresholds, newT])
  }

  function removeThreshold(id: string) {
    updateThresholds(thresholds.filter(t => t.id !== id))
  }

  function updateThreshold(id: string, patch: Partial<Threshold>) {
    updateThresholds(thresholds.map(t => (t.id === id ? { ...t, ...patch } : t)))
  }

  return (
    <div>
      <SectionHeader>Schwellenwerte</SectionHeader>

      <div className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
        Regeln werden in der Reihenfolge geprüft. Erste zutreffende Regel gewinnt.
      </div>

      <button
        type="button"
        onClick={addThreshold}
        disabled={thresholds.length >= 5}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded bg-background border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors mb-2"
      >
        <Plus size={12} />
        Schwellenwert hinzufügen {thresholds.length >= 5 && '(Max 5)'}
      </button>

      <div className="space-y-2">
        {thresholds.map((t, idx) => (
          <div key={t.id} className="rounded border border-border/60 bg-background/40 p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">Regel {idx + 1}</span>
              <button
                type="button"
                onClick={() => removeThreshold(t.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors"
              >
                <X size={12} />
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              <select
                value={t.condition}
                onChange={e => updateThreshold(t.id, { condition: e.target.value as Threshold['condition'] })}
                className="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-1 text-[10px] text-foreground focus:outline-none focus:border-primary"
              >
                {THRESHOLD_CONDITION_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <input
                type="number"
                value={t.value as number}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  if (!isNaN(v)) updateThreshold(t.id, { value: v })
                }}
                className="w-16 bg-background border border-border rounded px-1.5 py-1 text-[10px] text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Farbe</span>
              <ColorPicker
                value={t.color}
                onChange={v => updateThreshold(t.id, { color: v })}
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Beschriftung</span>
              <input
                type="text"
                value={t.label ?? ''}
                onChange={e => updateThreshold(t.id, { label: e.target.value })}
                placeholder="Optional"
                className="flex-1 bg-background border border-border rounded px-1.5 py-1 text-[10px] text-foreground focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        ))}

        {thresholds.length === 0 && (
          <div className="text-[10px] text-muted-foreground text-center py-4">
            Noch keine Schwellenwerte definiert.
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PropertiesPanel({
  element,
  onUpdate,
  onDelete,
  onBringToFront,
  onSendToBack,
  onDuplicate,
}: PropertiesPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>('style')

  if (!element) {
    return (
      <div className="w-[280px] shrink-0 bg-card border-l border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-center h-full text-muted-foreground text-xs">
          Kein Element ausgewählt
        </div>
      </div>
    )
  }

  const showConfig = !isStaticType(element.type)
  const showAlarm = isDataType(element.type)
  const showThresholds = isNumericType(element.type)

  // Build available tabs
  const tabs: { id: TabId; label: string; Icon: React.ElementType }[] = [
    { id: 'style', label: 'Stil', Icon: Palette },
    { id: 'position', label: 'Position', Icon: Move },
    ...(showConfig ? [{ id: 'config' as TabId, label: 'Konfig.', Icon: Settings }] : []),
    ...(showAlarm ? [{ id: 'alarm' as TabId, label: 'Alarm', Icon: Bell }] : []),
    ...(showThresholds ? [{ id: 'thresholds' as TabId, label: 'Werte', Icon: Sliders }] : []),
  ]

  // Ensure active tab is valid for current element
  const validTab = tabs.find(t => t.id === activeTab) ? activeTab : 'style'

  return (
    <div className="w-[280px] shrink-0 bg-card border-l border-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground truncate">
            {WIDGET_LABELS[element.type]}
          </div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">{element.id.slice(0, 8)}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-2 text-[10px] flex flex-col items-center gap-0.5 transition-colors ${
              validTab === id
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
        {validTab === 'style' && (
          <StyleTab element={element} onUpdate={onUpdate} />
        )}
        {validTab === 'position' && (
          <PositionTab
            element={element}
            onUpdate={onUpdate}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        )}
        {validTab === 'config' && showConfig && (
          <ConfigTab element={element} onUpdate={onUpdate} />
        )}
        {validTab === 'alarm' && showAlarm && (
          <AlarmTab element={element} onUpdate={onUpdate} />
        )}
        {validTab === 'thresholds' && showThresholds && (
          <ThresholdsTab element={element} onUpdate={onUpdate} />
        )}
      </div>
    </div>
  )
}
