/**
 * useKnowledgeSearch.ts — React-Hook um die Suchmaschine.
 *
 * Lädt die Bundles einmalig, baut den Index und stellt eine entprellte
 * Suchfunktion bereit. Der Indexaufbau (~700 ms bei 6.400 Chunks) läuft
 * beim ersten Rendern; solange ist `loading` true.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KnowledgeSearch, type SearchOptions } from './searchEngine';
import type { SearchResult, KnowledgeSource, ChunkType } from './knowledge.types';
import { api } from '../electronAPI';

export interface UseKnowledgeSearchState {
  ready: boolean;
  loading: boolean;
  error: string | null;
  /** Zeitpunkt der Index-Erstellung (ISO) — für den "Stand:"-Hinweis. */
  builtAt: string | null;
  /** Ordner, aus dem geladen wurde (Netzlaufwerk oder lokal). */
  dir: string | null;
  sources: KnowledgeSource[];
  result: SearchResult | null;
  query: string;
  setQuery: (q: string) => void;
  /** Sofort suchen, ohne Entprellung (z. B. bei Klick auf einen Vorschlag). */
  searchNow: (q: string, opts?: SearchOptions) => void;
  suggest: (q: string) => string[];
  engine: KnowledgeSearch | null;
  /** Aktive Filter. */
  filters: { sources: string[]; types: ChunkType[]; includeSensitive: boolean };
  setFilters: (f: Partial<UseKnowledgeSearchState['filters']>) => void;
  reload: () => void;
}

const DEBOUNCE_MS = 160;

export function useKnowledgeSearch(): UseKnowledgeSearchState {
  const engineRef = useRef<KnowledgeSearch | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  const [dir, setDir] = useState<string | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [nonce, setNonce] = useState(0);
  const [filters, setFiltersState] = useState(() => {
    let includeSensitive = true
    try { includeSensitive = localStorage.getItem('knowledge.loadSensitive') !== 'false' } catch { /* default an */ }
    return { sources: [] as string[], types: [] as ChunkType[], includeSensitive };
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Laden & Indexaufbau ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let loadSensitive = true
        try { loadSensitive = localStorage.getItem('knowledge.loadSensitive') !== 'false' } catch { /* default an */ }
        const res = await api().knowledgeLoad(loadSensitive);
        if (cancelled) return;
        if (!res.ok || !res.core) throw new Error(res.error ?? 'Wissensindex nicht gefunden.');

        const engine = new KnowledgeSearch();
        // Ein Frame Luft lassen, damit die UI den Ladezustand zeichnen kann
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        await engine.load(res.core, res.sensitive);
        if (cancelled) return;

        engineRef.current = engine;
        setSources(engine.allSources());
        setBuiltAt(res.builtAt);
        setDir(res.dir);
        setReady(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [nonce]);

  /* ── Suche ausführen ── */
  const run = useCallback((q: string, opts?: SearchOptions) => {
    const engine = engineRef.current;
    if (!engine || !engine.ready) return;
    if (q.trim().length < 2) { setResult(null); return; }
    setResult(engine.search(q, {
      sources: filters.sources.length ? filters.sources : undefined,
      types: filters.types.length ? filters.types : undefined,
      includeSensitive: filters.includeSensitive,
      ...opts,
    }));
  }, [filters]);

  /* ── Entprellte Suche bei Tippen ── */
  useEffect(() => {
    if (!ready) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run(query), DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query, ready, run]);

  const searchNow = useCallback((q: string, opts?: SearchOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setQuery(q);
    run(q, opts);
  }, [run]);

  const suggest = useCallback(
    (q: string) => engineRef.current?.suggest(q) ?? [],
    [],
  );

  const setFilters = useCallback((f: Partial<typeof filters>) => {
    setFiltersState((prev) => ({ ...prev, ...f }));
  }, []);

  const reload = useCallback(() => {
    engineRef.current = null;
    setReady(false);
    setResult(null);
    setNonce((n) => n + 1);
  }, []);

  return useMemo(() => ({
    ready, loading, error, builtAt, dir, sources,
    result, query, setQuery, searchNow, suggest,
    engine: engineRef.current, filters, setFilters, reload,
  }), [ready, loading, error, builtAt, dir, sources, result, query, searchNow, suggest, filters, setFilters, reload]);
}
