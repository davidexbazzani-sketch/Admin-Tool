import { useState, useId } from 'react'
import { Plus, Minus, Upload, ArrowRight, Monitor, Hash, FileText } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { DeviceEntry, Prefix } from '../types'
import Card from '../components/Card'
import PrefixPopup from '../components/PrefixPopup'
import { importFile } from '../utils/fileImport'

function makeId() {
  return Math.random().toString(36).slice(2)
}

function makeDevice(type: DeviceEntry['type']): DeviceEntry {
  return {
    id: makeId(),
    type,
    value: '',
    prefixes: [],
    customPrefix: '',
    resolvedHostnames: [],
  }
}

function resolveHostnames(d: DeviceEntry): string[] {
  if (d.type === 'hostname') {
    return d.value.trim() ? [d.value.trim()] : []
  }
  if (!d.value.trim()) return []
  const results: string[] = []
  const prefixes = d.prefixes ?? []
  for (const p of prefixes) {
    if (p === 'Sonstige') {
      const cp = d.customPrefix?.trim() ?? ''
      if (cp) results.push(`${cp}${d.value.trim()}`)
    } else {
      results.push(`${p}${d.value.trim()}`)
    }
  }
  if (prefixes.length === 0 && d.value.trim()) results.push(d.value.trim())
  return results
}

export default function Home() {
  const setScreen = useAppStore((s) => s.setScreen)
  const setDevices = useAppStore((s) => s.setDevices)

  // Single query state
  const [singleHostname, setSingleHostname] = useState('')
  const [singleSerial, setSingleSerial] = useState('')
  const [singlePrefixes, setSinglePrefixes] = useState<Prefix[]>([])
  const [singleCustom, setSingleCustom] = useState('')

  // List state
  const [hostnameRows, setHostnameRows] = useState<DeviceEntry[]>([makeDevice('hostname')])
  const [serialRows, setSerialRows] = useState<DeviceEntry[]>([makeDevice('serial')])

  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError] = useState('')

  function updateHostnameRow(id: string, value: string) {
    setHostnameRows((rows) => rows.map((r) => r.id === id ? { ...r, value } : r))
  }
  function updateSerialRow(id: string, value: string) {
    setSerialRows((rows) => rows.map((r) => r.id === id ? { ...r, value } : r))
  }
  function updateSerialPrefixes(id: string, prefixes: Prefix[], customPrefix: string) {
    setSerialRows((rows) => rows.map((r) => r.id === id ? { ...r, prefixes, customPrefix } : r))
  }

  function handleImport() {
    setImportError('')
    setImportLoading(true)
    importFile()
      .then(({ hostnames, serials }) => {
        if (hostnames.length > 0) {
          const newRows = hostnames.map((v) => ({ ...makeDevice('hostname'), value: v }))
          setHostnameRows((rows) => [...rows.filter((r) => r.value), ...newRows])
        }
        if (serials.length > 0) {
          const newRows = serials.map((v) => ({ ...makeDevice('serial'), value: v }))
          setSerialRows((rows) => [...rows.filter((r) => r.value), ...newRows])
        }
      })
      .catch((err) => setImportError(String(err)))
      .finally(() => setImportLoading(false))
  }

  function handleProceed() {
    const all: DeviceEntry[] = []

    // Single query
    if (singleHostname.trim()) {
      all.push({ id: makeId(), type: 'hostname', value: singleHostname.trim(), resolvedHostnames: [singleHostname.trim()] })
    }
    if (singleSerial.trim()) {
      const d: DeviceEntry = { id: makeId(), type: 'serial', value: singleSerial.trim(), prefixes: singlePrefixes, customPrefix: singleCustom, resolvedHostnames: [] }
      d.resolvedHostnames = resolveHostnames(d)
      all.push(d)
    }

    // List rows
    for (const r of hostnameRows) {
      if (r.value.trim()) all.push({ ...r, resolvedHostnames: [r.value.trim()] })
    }
    for (const r of serialRows) {
      if (r.value.trim()) {
        const resolved = resolveHostnames(r)
        all.push({ ...r, resolvedHostnames: resolved })
      }
    }

    setDevices(all)
    setScreen('query-menu')
  }

  const hasInput =
    singleHostname.trim() ||
    singleSerial.trim() ||
    hostnameRows.some((r) => r.value.trim()) ||
    serialRows.some((r) => r.value.trim())

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Startbildschirm</h1>
        <p className="text-sm text-muted-foreground mt-1">Geräte eingeben oder importieren, dann Abfrage starten</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Einzelabfrage */}
        <Card title="Einzelabfrage" icon={<Monitor size={16} />} subtitle="Hostname oder Seriennummer">
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hostname</label>
              <input
                type="text"
                placeholder="z.B. DEHAM12345678"
                value={singleHostname}
                onChange={(e) => setSingleHostname(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Seriennummer</label>
              <div className="flex gap-2">
                <PrefixPopup
                  selectedPrefixes={singlePrefixes}
                  customPrefix={singleCustom}
                  onChange={(p, c) => { setSinglePrefixes(p); setSingleCustom(c) }}
                  serial={singleSerial}
                />
                <input
                  type="text"
                  placeholder="z.B. 12345678"
                  value={singleSerial}
                  onChange={(e) => setSingleSerial(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              {singleSerial && singlePrefixes.length > 0 && (
                <p className="text-xs text-primary mt-1 font-mono">
                  → {resolveHostnames({ id: '', type: 'serial', value: singleSerial, prefixes: singlePrefixes, customPrefix: singleCustom, resolvedHostnames: [] }).join(', ')}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Card 3: Datei-Import */}
        <Card title="Datei-Import" icon={<FileText size={16} />} subtitle=".xlsx, .xls, .csv, .docx, .pdf">
          <div className="flex flex-col items-center justify-center py-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload size={22} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">Datei importieren</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Hostnames und Seriennummern werden automatisch erkannt
              </p>
            </div>
            <button
              onClick={handleImport}
              disabled={importLoading}
              className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {importLoading ? 'Importiere...' : 'Datei auswählen'}
            </button>
            {importError && <p className="text-xs text-destructive text-center">{importError}</p>}
          </div>
        </Card>
      </div>

      {/* Card 2: Liste erstellen */}
      <Card title="Liste erstellen" icon={<Hash size={16} />} subtitle="Mehrere Geräte auf einmal">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hostnames */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hostnames</p>
              <button
                onClick={() => setHostnameRows((r) => [...r, makeDevice('hostname')])}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus size={13} /> Hinzufügen
              </button>
            </div>
            <div className="space-y-2">
              {hostnameRows.map((row) => (
                <div key={row.id} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Hostname..."
                    value={row.value}
                    onChange={(e) => updateHostnameRow(row.id, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={() => setHostnameRows((r) => r.filter((x) => x.id !== row.id))}
                    disabled={hostnameRows.length === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-30"
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Seriennummern */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Seriennummern</p>
              <button
                onClick={() => setSerialRows((r) => [...r, makeDevice('serial')])}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <Plus size={13} /> Hinzufügen
              </button>
            </div>
            <div className="space-y-2">
              {serialRows.map((row) => (
                <div key={row.id} className="flex gap-2 items-center">
                  <PrefixPopup
                    selectedPrefixes={row.prefixes ?? []}
                    customPrefix={row.customPrefix ?? ''}
                    onChange={(p, c) => updateSerialPrefixes(row.id, p, c)}
                    serial={row.value}
                  />
                  <input
                    type="text"
                    placeholder="Seriennummer..."
                    value={row.value}
                    onChange={(e) => updateSerialRow(row.id, e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                  />
                  <button
                    onClick={() => setSerialRows((r) => r.filter((x) => x.id !== row.id))}
                    disabled={serialRows.length === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-30"
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* CTA */}
      <div className="flex justify-end pb-2">
        <button
          onClick={handleProceed}
          disabled={!hasInput}
          className={`
            flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all
            ${hasInput
              ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
            }
          `}
        >
          Zur Abfrage
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  )
}
