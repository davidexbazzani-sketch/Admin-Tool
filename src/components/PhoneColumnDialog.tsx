import { useState } from 'react'
import { X, Phone } from 'lucide-react'
import type { ExcelColumn } from '../utils/fileImport'

type PhoneColRole = 'phone' | 'ignore'

interface Props {
  columns: ExcelColumn[]
  onConfirm: (phoneColNames: string[]) => void
  onCancel: () => void
}

const ROLE_STYLES: Record<PhoneColRole, string> = {
  phone:  'bg-blue-500/15 text-blue-300 border-blue-500/30',
  ignore: 'bg-muted text-muted-foreground border-border',
}

const ROLE_LABELS: Record<PhoneColRole, string> = {
  phone:  'Rufnummer',
  ignore: 'Ignorieren',
}

// Rough heuristic: column name or preview looks like it contains phone numbers
function detectPhoneCol(col: ExcelColumn): PhoneColRole {
  const nameLower = col.name.toLowerCase().replace(/[\s_\-]/g, '')
  const phonekws = ['telefon', 'phone', 'handy', 'mobil', 'mobile', 'rufnummer', 'nummer', 'fax', 'tel', 'ip']
  if (phonekws.some((k) => nameLower.includes(k))) return 'phone'
  // Check preview values for phone-like patterns
  if (col.preview.some((v) => /[\+\d][\d\s\-\.\/\(\)]{5,}/.test(v))) return 'phone'
  return 'ignore'
}

export default function PhoneColumnDialog({ columns, onConfirm, onCancel }: Props) {
  const [roles, setRoles] = useState<Record<string, PhoneColRole>>(
    Object.fromEntries(columns.map((c) => [c.name, detectPhoneCol(c)]))
  )

  function setRole(colName: string, role: PhoneColRole) {
    setRoles((prev) => ({ ...prev, [colName]: role }))
  }

  function handleConfirm() {
    const phoneColNames = columns.filter((c) => roles[c.name] === 'phone').map((c) => c.name)
    onConfirm(phoneColNames)
  }

  const hasSelection = Object.values(roles).includes('phone')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[580px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Phone size={16} className="text-primary" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Rufnummern-Spalten auswählen</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Welche Spalten enthalten Rufnummern?
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Column list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {columns.map((col) => {
            const role = roles[col.name]
            return (
              <div
                key={col.name}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-background hover:bg-accent/20 transition-colors"
              >
                <span className="w-7 h-7 flex items-center justify-center rounded bg-muted text-[11px] font-bold text-muted-foreground shrink-0 font-mono">
                  {col.letter}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{col.name}</p>
                  {col.preview.length > 0 && (
                    <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                      {col.preview.join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {(['phone', 'ignore'] as PhoneColRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setRole(col.name, r)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors ${
                        role === r ? ROLE_STYLES[r] : 'border-border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
          <p className="text-[11px] text-muted-foreground">
            {Object.values(roles).filter((r) => r === 'phone').length} Spalte(n) als Rufnummer markiert
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent text-foreground transition-colors"
            >
              Abbrechen
            </button>
            <button
              onClick={handleConfirm}
              disabled={!hasSelection}
              className="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              Importieren
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
