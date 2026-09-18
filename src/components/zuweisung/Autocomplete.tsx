import { useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Scrollbares Autocomplete (ersetzt <datalist>, das im Build nicht zuverlässig
// scrollbar war). Freitext erlaubt; Vorschläge werden gefiltert und in einem
// eigenen, scrollbaren Feld angezeigt.
export default function Autocomplete({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [aktiv, setAktiv] = useState(-1)
  const blurTimer = useRef<number | null>(null)

  const gefiltert = useMemo(() => {
    const q = value.trim().toLowerCase()
    const list = q ? options.filter(o => o.toLowerCase().includes(q)) : options
    return list.slice(0, 300)
  }, [value, options])

  const waehle = (v: string) => { onChange(v); setOpen(false); setAktiv(-1) }

  return (
    <div className="relative"
      onBlur={() => { blurTimer.current = window.setTimeout(() => setOpen(false), 120) }}
      onFocus={() => { if (blurTimer.current) window.clearTimeout(blurTimer.current) }}>
      <div className="relative">
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); setAktiv(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAktiv(a => Math.min(a + 1, gefiltert.length - 1)) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setAktiv(a => Math.max(a - 1, 0)) }
            else if (e.key === 'Enter' && open && aktiv >= 0 && gefiltert[aktiv]) { e.preventDefault(); waehle(gefiltert[aktiv]) }
            else if (e.key === 'Escape') setOpen(false)
          }}
          placeholder={placeholder}
          className="w-full px-3 py-1.5 pr-8 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:border-primary"
        />
        <button type="button" tabIndex={-1} onMouseDown={e => { e.preventDefault(); setOpen(o => !o) }}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><ChevronDown size={14} /></button>
      </div>
      {open && gefiltert.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
          {gefiltert.map((o, i) => (
            <button key={o} type="button"
              onMouseDown={e => { e.preventDefault(); waehle(o) }}
              onMouseEnter={() => setAktiv(i)}
              className={`w-full text-left px-3 py-1.5 text-sm ${i === aktiv ? 'bg-accent/40 text-foreground' : 'text-foreground/90 hover:bg-accent/20'}`}>
              {o}
            </button>
          ))}
          {options.length > gefiltert.length && <div className="px-3 py-1 text-[11px] text-muted-foreground">… weiter tippen, um zu filtern ({options.length} gesamt)</div>}
        </div>
      )}
    </div>
  )
}
