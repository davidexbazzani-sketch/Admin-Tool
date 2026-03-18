import { useState } from 'react'
import { Plus, Minus, Search, Phone, Smartphone, User } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { queryXelionUser, queryAllEmployees, type XelionResult } from '../utils/adUtils'
import Spinner from '../components/Spinner'
import Card from '../components/Card'

type Tab = 'single' | 'list' | 'all'

function makeId() { return Math.random().toString(36).slice(2) }

export default function XelionCheck() {
  const settings = useAppStore((s) => s.settings)

  const [tab, setTab] = useState<Tab>('single')
  const [singleInput, setSingleInput] = useState('')
  const [listItems, setListItems] = useState([{ id: makeId(), value: '' }])

  const [options, setOptions] = useState({
    showNumbers: true,
    noXelionButMobile: false,
    showPwdLastSet: false,
  })

  const [results, setResults] = useState<XelionResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    setError('')
    setLoading(true)
    setResults([])
    try {
      let items: string[] = []
      if (tab === 'single') items = [singleInput.trim()]
      if (tab === 'list') items = listItems.map((i) => i.value.trim()).filter(Boolean)

      if (tab === 'all') {
        const data = await queryAllEmployees('Hamburg', settings.adDomain)
        let filtered = data
        if (options.noXelionButMobile) filtered = filtered.filter((r) => r.hasMobile && !r.hasXelion)
        setResults(filtered)
      } else {
        const promises = items.map((v) => queryXelionUser(v, settings.adDomain))
        const data = await Promise.all(promises)
        let filtered = data
        if (options.noXelionButMobile) filtered = filtered.filter((r) => r.hasMobile && !r.hasXelion)
        setResults(filtered)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'single', label: 'Einzelabfrage' },
    { id: 'list', label: 'Liste' },
    { id: 'all', label: 'Alle Mitarbeiter' },
  ]

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">📱 Diensthandy & Xelion</h1>
        <p className="text-sm text-muted-foreground mt-1">AD-Abfrage für Telefonnummern und Xelion-Accounts</p>
      </div>

      <Card title="Eingabe">
        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                tab === t.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="mt-3">
          {tab === 'single' && (
            <input
              type="text"
              placeholder="Name oder Corp-ID..."
              value={singleInput}
              onChange={(e) => setSingleInput(e.target.value)}
              className="w-full max-w-sm px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          )}
          {tab === 'list' && (
            <div className="space-y-2 max-w-sm">
              {listItems.map((item) => (
                <div key={item.id} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Name oder Corp-ID..."
                    value={item.value}
                    onChange={(e) => setListItems((l) => l.map((i) => i.id === item.id ? { ...i, value: e.target.value } : i))}
                    className="flex-1 px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => setListItems((l) => l.filter((i) => i.id !== item.id))}
                    disabled={listItems.length === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-30"
                  >
                    <Minus size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setListItems((l) => [...l, { id: makeId(), value: '' }])}
                className="flex items-center gap-1 text-xs text-primary"
              >
                <Plus size={13} /> Hinzufügen
              </button>
            </div>
          )}
          {tab === 'all' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Standort:</span>
              <span className="font-medium text-foreground">Hamburg – Hermann Blohm Strasse</span>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-4 pt-2 border-t border-border mt-2">
          {[
            { key: 'showNumbers', label: 'Alle hinterlegten Rufnummern anzeigen' },
            { key: 'noXelionButMobile', label: 'Kein Xelion Account aber Diensthandy vorhanden' },
            { key: 'showPwdLastSet', label: 'Passwort zuletzt zurückgesetzt' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options[key as keyof typeof options]}
                onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
                className="accent-primary"
              />
              <span className="text-sm text-foreground">{label}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={run}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner size={14} /> : <Search size={14} />}
            Abfrage starten
          </button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <Card title={`Ergebnisse (${results.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Name</th>
                  {options.showNumbers && (
                    <>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">
                        <span className="flex items-center gap-1"><Phone size={11} /> Telefon</span>
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">
                        <span className="flex items-center gap-1"><Smartphone size={11} /> Mobil</span>
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">IP-Phone</th>
                    </>
                  )}
                  {options.showPwdLastSet && (
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">PW zuletzt geändert</th>
                  )}
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r, i) => (
                  <tr key={i} className="hover:bg-accent/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2 text-foreground font-medium">
                        <User size={13} className="text-muted-foreground" />{r.name}
                      </span>
                    </td>
                    {options.showNumbers && (
                      <>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.telephoneNumber || '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.mobile || '—'}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{r.ipPhone || '—'}</td>
                      </>
                    )}
                    {options.showPwdLastSet && (
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">{r.pwdLastSet || '—'}</td>
                    )}
                    <td className="px-3 py-2.5">
                      {r.hasMobile && !r.hasXelion ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          📱 Kein Xelion
                        </span>
                      ) : r.hasXelion ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          ✓ Xelion aktiv
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground border border-border">
                          Keine Daten
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
