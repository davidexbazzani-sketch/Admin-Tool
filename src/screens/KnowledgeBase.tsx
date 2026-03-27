import { useState, useEffect, useRef } from 'react'
import {
  BookOpen, Search, X, Loader, ChevronRight, ArrowLeft,
  Copy, Check, FolderOpen, FileText, AlertTriangle, Monitor,
  Mail, Wifi, Printer, Shield, Package, Cpu, Users,
} from 'lucide-react'
import { api } from '../electronAPI'

// ── Icon map ──────────────────────────────────────────────────────────────────
const ICONS: Record<string, React.ReactNode> = {
  monitor: <Monitor size={18} />,
  'file-text': <FileText size={18} />,
  wifi: <Wifi size={18} />,
  printer: <Printer size={18} />,
  mail: <Mail size={18} />,
  cpu: <Cpu size={18} />,
  shield: <Shield size={18} />,
  package: <Package size={18} />,
  users: <Users size={18} />,
}

type View = 'home' | 'category' | 'subcategory' | 'article'

interface CatSummary { id: string; name: string; icon: string; articleCount: number; subcategories: { id: string; name: string; articleCount: number }[] }
interface ArtSummary { id: string; title: string; description: string; tags: string[] }
interface FullArticle { id: string; title: string; description: string; tags: string[]; steps: { title: string; content: string }[]; relatedSkills: string[] }
interface SearchHit { id: string; title: string; description: string; categoryName: string; subcategoryName: string; tags: string[] }

export default function KnowledgeBase() {
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CatSummary[]>([])
  const [view, setView] = useState<View>('home')

  // Navigation state
  const [activeCat, setActiveCat] = useState<CatSummary | null>(null)
  const [activeSub, setActiveSub] = useState<{ id: string; name: string } | null>(null)
  const [articles, setArticles] = useState<ArtSummary[]>([])
  const [article, setArticle] = useState<FullArticle | null>(null)
  const [articlesLoading, setArticlesLoading] = useState(false)
  const [articleLoading, setArticleLoading] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Copy
  const [copied, setCopied] = useState(false)

  // ── Load categories on mount ────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true)
      // Ensure the wissensdatenbank exists (generate if first start)
      await api().wbEnsureGenerated()
      const cats = await api().wbGetCategories()
      setCategories(cats)
      setLoading(false)
    })()
  }, [])

  // ── Search with debounce ────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!searchQuery.trim() || searchQuery.length < 2) { setSearchResults([]); return }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const results = await api().wbSearch(searchQuery)
      setSearchResults(results)
      setSearching(false)
    }, 300)
  }, [searchQuery])

  // Ctrl+W shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'w') { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Navigation ──────────────────────────────────────────────────────────
  function openCategory(cat: CatSummary) {
    setActiveCat(cat)
    setActiveSub(null)
    setArticle(null)
    setView('category')
    setSearchQuery('')
    setSearchResults([])
  }

  async function openSubcategory(sub: { id: string; name: string }) {
    setActiveSub(sub)
    setArticlesLoading(true)
    setView('subcategory')
    const arts = await api().wbGetArticles(sub.id)
    setArticles(arts)
    setArticlesLoading(false)
  }

  async function openArticle(articleId: string) {
    setArticleLoading(true)
    setView('article')
    const a = await api().wbGetArticle(articleId)
    setArticle(a)
    setArticleLoading(false)
  }

  function goBack() {
    if (view === 'article') { setArticle(null); setView(activeSub ? 'subcategory' : 'category') }
    else if (view === 'subcategory') { setActiveSub(null); setView('category') }
    else if (view === 'category') { setActiveCat(null); setView('home') }
  }

  async function copyArticle() {
    if (!article) return
    const text = `${article.title}\n\n${article.steps.map((s, i) => `Schritt ${i + 1}: ${s.title}\n${s.content}`).join('\n\n')}`
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
        <Loader size={16} className="animate-spin" /> Wissensdatenbank wird geladen...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-3">
        <BookOpen size={20} className="text-primary" />
        <h1 className="text-lg font-bold text-foreground">Wissensdatenbank</h1>
        {view !== 'home' && (
          <button onClick={goBack} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-2">
            <ArrowLeft size={12} /> Zurück
          </button>
        )}
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-2">
          <button onClick={() => { setView('home'); setActiveCat(null); setActiveSub(null); setArticle(null) }} className="hover:text-foreground">Start</button>
          {activeCat && <><ChevronRight size={10} /><button onClick={() => { setView('category'); setActiveSub(null); setArticle(null) }} className="hover:text-foreground">{activeCat.name}</button></>}
          {activeSub && <><ChevronRight size={10} /><button onClick={() => { setView('subcategory'); setArticle(null) }} className="hover:text-foreground">{activeSub.name}</button></>}
          {article && <><ChevronRight size={10} /><span className="text-foreground truncate max-w-[200px]">{article.title}</span></>}
        </div>
      </div>

      {/* Search bar */}
      <div className="shrink-0 px-6 py-3 border-b border-border relative">
        <div className="relative max-w-2xl">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input ref={searchRef} value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="Anleitungen durchsuchen... (Strg+W)"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary" />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(''); setSearchResults([]) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Search results */}
        {(searchResults.length > 0 || (searching && searchQuery.length >= 2)) && (
          <div className="absolute left-6 right-6 top-full mt-1 z-30 bg-card border border-border rounded-lg shadow-xl max-h-[50vh] overflow-y-auto">
            {searching && <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1"><Loader size={10} className="animate-spin" /> Suche...</div>}
            {searchResults.map(r => (
              <button key={r.id} onClick={() => { openArticle(r.id); setSearchQuery(''); setSearchResults([]) }}
                className="w-full text-left px-3 py-2.5 hover:bg-accent/30 border-b border-border/30">
                <div className="flex items-start gap-2">
                  <FileText size={12} className="text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{r.title}</p>
                    <p className="text-[9px] text-muted-foreground">{r.categoryName} &gt; {r.subcategoryName}</p>
                    <p className="text-[10px] text-muted-foreground/70 truncate">{r.description}</p>
                  </div>
                </div>
              </button>
            ))}
            {!searching && searchResults.length === 0 && searchQuery.length >= 2 && (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">Keine Ergebnisse für „{searchQuery}"</div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* ── HOME: Category grid ── */}
        {view === 'home' && (
          <div className="max-w-4xl mx-auto">
            <h2 className="text-sm font-semibold text-foreground mb-4">Kategorien</h2>
            {categories.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {categories.map(cat => (
                  <button key={cat.id} onClick={() => openCategory(cat)}
                    className="text-left p-4 rounded-xl border border-border hover:bg-accent/30 hover:border-primary/30 transition-colors group">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-primary">{ICONS[cat.icon] ?? <FolderOpen size={18} />}</span>
                      <span className="text-sm font-medium text-foreground group-hover:text-primary">{cat.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{cat.articleCount} Artikel in {cat.subcategories.length} Themen</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <BookOpen size={48} className="mx-auto opacity-20 mb-3" />
                <p className="text-sm">Wissensdatenbank ist leer</p>
                <p className="text-xs opacity-60 mt-1">Beim nächsten Start wird sie automatisch generiert.</p>
              </div>
            )}
          </div>
        )}

        {/* ── CATEGORY: Subcategory list ── */}
        {view === 'category' && activeCat && (
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-primary">{ICONS[activeCat.icon] ?? <FolderOpen size={20} />}</span>
              <h2 className="text-lg font-bold text-foreground">{activeCat.name}</h2>
              <span className="text-xs text-muted-foreground ml-2">{activeCat.articleCount} Artikel</span>
            </div>
            {activeCat.subcategories.map(sub => (
              <button key={sub.id} onClick={() => openSubcategory(sub)}
                className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-accent/30 hover:border-primary/30 transition-colors">
                <FolderOpen size={16} className="text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{sub.name}</p>
                  <p className="text-[10px] text-muted-foreground">{sub.articleCount} Artikel</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        {/* ── SUBCATEGORY: Article list ── */}
        {view === 'subcategory' && activeSub && (
          <div className="max-w-3xl mx-auto space-y-2">
            <h2 className="text-sm font-semibold text-foreground mb-3">{activeSub.name}</h2>
            {articlesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                <Loader size={12} className="animate-spin" /> Artikel laden...
              </div>
            ) : articles.length > 0 ? (
              articles.map(a => (
                <button key={a.id} onClick={() => openArticle(a.id)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-accent/30 hover:border-primary/30 transition-colors">
                  <p className="text-sm font-medium text-foreground">{a.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{a.description}</p>
                  {a.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {a.tags.slice(0, 5).map(t => (
                        <span key={t} className="px-1.5 py-0.5 text-[8px] rounded bg-muted/30 text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}
                </button>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Keine Artikel in dieser Kategorie</p>
            )}
          </div>
        )}

        {/* ── ARTICLE: Full detail view ── */}
        {view === 'article' && (
          <div className="max-w-3xl mx-auto">
            {articleLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
                <Loader size={12} className="animate-spin" /> Artikel laden...
              </div>
            ) : article ? (
              <>
                {/* Article header */}
                <div className="mb-6">
                  <div className="flex items-start gap-2 mb-2">
                    <h2 className="text-xl font-bold text-foreground flex-1">{article.title}</h2>
                    <button onClick={copyArticle} title="Artikel kopieren"
                      className="p-1.5 rounded-md border border-border hover:bg-accent text-muted-foreground shrink-0">
                      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">{article.description}</p>
                  {article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {article.tags.map(t => (
                        <span key={t} className="px-2 py-0.5 text-[9px] rounded-full bg-primary/10 text-primary border border-primary/20">{t}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Steps */}
                <div className="space-y-4">
                  {article.steps.map((step, i) => (
                    <div key={i} className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/10 border-b border-border">
                        <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                          {i + 1}
                        </span>
                        <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
                      </div>
                      <div className="px-4 py-3">
                        {/* Render content with basic formatting */}
                        {step.content.split('\n\n').map((para, pi) => {
                          // Detect PowerShell/command blocks
                          if (para.match(/^(Get-|Set-|Remove-|New-|Invoke-|Start-|Stop-|Restart-|Test-|Clear-|Resolve-|sfc |DISM |powershell|cmd |reg |sc\.exe|Optimize-|Repair-)/m)) {
                            return (
                              <div key={pi} className="my-2 relative">
                                <pre className="px-3 py-2 rounded-md bg-muted/30 border border-border text-xs font-mono text-foreground overflow-x-auto whitespace-pre-wrap">{para}</pre>
                                <button onClick={() => { navigator.clipboard.writeText(para) }}
                                  className="absolute top-1 right-1 p-1 rounded hover:bg-accent text-muted-foreground" title="Kopieren">
                                  <Copy size={10} />
                                </button>
                              </div>
                            )
                          }
                          // Bullet points
                          if (para.includes('•')) {
                            return (
                              <ul key={pi} className="my-1.5 space-y-0.5">
                                {para.split('\n').map((line, li) => (
                                  <li key={li} className="text-sm text-foreground/90 flex items-start gap-1.5">
                                    {line.startsWith('•') ? <span className="text-primary mt-0.5">•</span> : null}
                                    <span>{line.replace(/^• ?/, '')}</span>
                                  </li>
                                ))}
                              </ul>
                            )
                          }
                          // Regular paragraph — make paths/keywords bold
                          return <p key={pi} className="text-sm text-foreground/90 mb-2 leading-relaxed">{para}</p>
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Related skills */}
                {article.relatedSkills.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-border">
                    <p className="text-[10px] text-muted-foreground mb-2">Verwandte Remote-Doc Skills:</p>
                    <div className="flex flex-wrap gap-1">
                      {article.relatedSkills.map(s => (
                        <span key={s} className="px-2 py-0.5 text-[9px] rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Artikel nicht gefunden</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
