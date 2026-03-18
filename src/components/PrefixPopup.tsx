import { useState, useRef, useEffect } from 'react'
import type { Prefix } from '../types'

const PRESET_PREFIXES: Prefix[] = ['DE', 'DEHAM', 'DESCH', 'Sonstige']

interface Props {
  selectedPrefixes: Prefix[]
  customPrefix: string
  onChange: (prefixes: Prefix[], customPrefix: string) => void
  serial: string
}

export default function PrefixPopup({ selectedPrefixes, customPrefix, onChange, serial }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function togglePrefix(p: Prefix) {
    const next = selectedPrefixes.includes(p)
      ? selectedPrefixes.filter((x) => x !== p)
      : [...selectedPrefixes, p]
    onChange(next, customPrefix)
  }

  // Preview of resolved hostnames
  const previews: string[] = []
  for (const p of selectedPrefixes) {
    if (p === 'Sonstige') {
      if (customPrefix && serial) previews.push(`${customPrefix}${serial}`)
    } else {
      if (serial) previews.push(`${p}${serial}`)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`
          px-2.5 py-1.5 text-xs rounded border transition-colors
          ${selectedPrefixes.length > 0
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:border-primary/50'
          }
        `}
      >
        {selectedPrefixes.length > 0 ? selectedPrefixes.join(', ') : 'Präfix'}
      </button>

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-52 bg-card border border-border rounded-lg shadow-xl p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground font-medium mb-2">Präfix wählen</p>
          {PRESET_PREFIXES.map((p) => (
            <label key={p} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="checkbox"
                checked={selectedPrefixes.includes(p)}
                onChange={() => togglePrefix(p)}
                className="accent-primary"
              />
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">{p}</span>
            </label>
          ))}
          {selectedPrefixes.includes('Sonstige') && (
            <input
              type="text"
              placeholder="Eigener Präfix..."
              value={customPrefix}
              onChange={(e) => onChange(selectedPrefixes, e.target.value)}
              className="w-full mt-1 px-2 py-1 text-xs rounded border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          )}
          {previews.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border">
              <p className="text-[10px] text-muted-foreground mb-1">Vorschau:</p>
              {previews.map((pv) => (
                <p key={pv} className="text-[11px] text-primary font-mono">{pv}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
