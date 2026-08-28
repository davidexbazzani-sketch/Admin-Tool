/**
 * searchEngine.ts — Suchmaschine der Wissensdatenbank.
 *
 * Kapselt MiniSearch und ergänzt es um das, was für deutsche IT-Dokumentation
 * nötig ist: Umlaut-Toleranz, atomare Bezeichner, Synonyme, Entitätstreffer
 * und typabhängiges Ranking.
 *
 * Benutzung:
 *   const engine = new KnowledgeSearch();
 *   await engine.load(coreBundle, sensitiveBundle?);
 *   const res = engine.search('Voelkl');
 */

import MiniSearch, { type SearchResult as MSResult } from 'minisearch';
import type {
  KnowledgeBundle, KnowledgeChunk, KnowledgeEntity, KnowledgeSource,
  SearchHit, SearchResult, ChunkType,
} from './knowledge.types';
import {
  tokenize, processTerm, expandQueryTerm, foldVariants,
  buildSnippet, looksAtomic, STOPWORDS,
} from './germanText';

/** Füllwörter und zu kurze Fragmente aus der Anfrage werfen. */
function isNoise(term: string): boolean {
  const t = term.toLowerCase();
  return t.length < 2 || STOPWORDS.has(t);
}

/**
 * Ranking-Gewicht je Chunk-Typ. Ein Kernwissen-Block ist als Antwort mehr wert
 * als eine Zeile aus dem Thread-Register, und eine Kontaktzeile ist bei
 * Personensuchen das, was man eigentlich sehen will.
 */
const TYPE_BOOST: Record<ChunkType, number> = {
  knowledge: 1.6,
  contact: 1.5,
  overview: 1.35,
  open: 1.3,
  row: 1.15,
  thread: 1.0,
  table: 1.0,
  section: 0.95,
};

/** Quellen-Gewicht: kuratiertes Wissen schlägt Rohdaten. */
const SOURCE_BOOST: Record<string, number> = {
  brain: 1.5,
  governance: 1.2,
  mails: 1.15,
  unternehmen: 1.1,
  snapshot: 0.8,
};

export interface SearchOptions {
  /** Maximale Trefferzahl (Standard 40). */
  limit?: number;
  /** Nur diese Quellen durchsuchen. */
  sources?: string[];
  /** Nur diese Chunk-Typen. */
  types?: ChunkType[];
  /** Rohdaten (sensitives Bundle) einbeziehen. Standard: true, wenn geladen. */
  includeSensitive?: boolean;
}

export class KnowledgeSearch {
  private mini: MiniSearch<KnowledgeChunk> | null = null;
  private chunks = new Map<string, KnowledgeChunk>();
  private sources = new Map<string, KnowledgeSource>();
  private entities = new Map<string, KnowledgeEntity>();
  /** Nachname/Teilwort -> Entitätsschlüssel, für unscharfe Entitätstreffer. */
  private entityWords = new Map<string, Set<string>>();

  /** true, sobald mindestens ein Bundle geladen ist. */
  ready = false;
  /** Kopfdaten der geladenen Bundles. */
  loaded: { sourceId: string; chunks: number; builtAt: string }[] = [];

  /**
   * Lädt ein oder mehrere Bundles und baut den Index.
   * Der Aufbau dauert bei ~6.500 Chunks rund eine Sekunde und blockiert dabei
   * den Renderer — deshalb am besten beim App-Start oder in einem Worker.
   */
  async load(...bundles: (KnowledgeBundle | null | undefined)[]): Promise<void> {
    const docs: KnowledgeChunk[] = [];
    this.chunks.clear(); this.sources.clear(); this.entities.clear(); this.entityWords.clear();
    this.loaded = [];

    for (const b of bundles) {
      if (!b) continue;
      for (const s of b.meta.sources) this.sources.set(s.id, s);
      for (const c of b.chunks) { this.chunks.set(c.id, c); docs.push(c); }
      for (const e of b.entities) {
        const prev = this.entities.get(e.key);
        if (prev) {
          prev.chunkIds = [...new Set([...prev.chunkIds, ...e.chunkIds])];
          prev.count = prev.chunkIds.length;
          if (!prev.hint && e.hint) prev.hint = e.hint;
        } else {
          this.entities.set(e.key, { ...e });
        }
      }
      this.loaded.push({
        sourceId: b.meta.sources.map((s) => s.id).join(','),
        chunks: b.chunks.length,
        builtAt: b.meta.builtAt,
      });
    }

    // Wortindex über Entitäten, damit "Bipul" die Person "Vikrant Bipul" trifft
    for (const e of this.entities.values()) {
      for (const w of tokenize(e.display)) {
        for (const v of foldVariants(w)) {
          if (v.length < 3) continue;
          let set = this.entityWords.get(v);
          if (!set) { set = new Set(); this.entityWords.set(v, set); }
          set.add(e.key);
        }
      }
    }

    this.mini = new MiniSearch<KnowledgeChunk>({
      idField: 'id',
      fields: ['title', 'pathText', 'text', 'entityText'] as any,
      storeFields: ['id'],
      tokenize,
      processTerm: processTerm as any,
      searchOptions: {
        boost: { title: 4, pathText: 2, entityText: 3, text: 1 },
        prefix: true,
        combineWith: 'AND',
      },
    });

    // abgeleitete Felder anreichern
    const enriched = docs.map((c) => ({
      ...c,
      pathText: c.path.join(' '),
      entityText: c.entities.join(' '),
    }));
    await Promise.resolve();
    this.mini.addAll(enriched as any);
    this.ready = true;
  }

  /** Fügt ein weiteres Bundle nachträglich hinzu (z. B. Rohdaten erst auf Klick). */
  addBundle(b: KnowledgeBundle): void {
    if (!this.mini) throw new Error('KnowledgeSearch: erst load() aufrufen');
    for (const s of b.meta.sources) this.sources.set(s.id, s);
    const enriched: any[] = [];
    for (const c of b.chunks) {
      if (this.chunks.has(c.id)) continue;
      this.chunks.set(c.id, c);
      enriched.push({ ...c, pathText: c.path.join(' '), entityText: c.entities.join(' ') });
    }
    for (const e of b.entities) if (!this.entities.has(e.key)) this.entities.set(e.key, { ...e });
    this.mini.addAll(enriched);
    this.loaded.push({
      sourceId: b.meta.sources.map((s) => s.id).join(','),
      chunks: b.chunks.length,
      builtAt: b.meta.builtAt,
    });
  }

  /** Alle bekannten Quellen (für Filter-UI). */
  allSources(): KnowledgeSource[] { return [...this.sources.values()]; }

  /** Einen Chunk per ID holen (Detailansicht). */
  getChunk(id: string): KnowledgeChunk | undefined { return this.chunks.get(id); }

  /** Alle Chunks einer Entität (für "14 Erwähnungen" anzeigen). */
  chunksOfEntity(key: string): KnowledgeChunk[] {
    const e = this.entities.get(key.toLowerCase());
    if (!e) return [];
    return e.chunkIds.map((id) => this.chunks.get(id)).filter(Boolean) as KnowledgeChunk[];
  }

  /** Vorschläge während der Eingabe (Entitäten zuerst, dann Überschriften). */
  suggest(query: string, limit = 8): string[] {
    if (!this.mini || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    const out: string[] = [];
    for (const e of this.entities.values()) {
      if (out.length >= limit) break;
      if (e.key.startsWith(q) || foldVariants(e.display).some((v) => v.startsWith(q))) {
        out.push(e.display);
      }
    }
    if (out.length < limit) {
      for (const s of this.mini.autoSuggest(query, { fuzzy: 0.2 })) {
        if (out.length >= limit) break;
        if (!out.includes(s.suggestion)) out.push(s.suggestion);
      }
    }
    return out;
  }

  /** Hauptsuche. */
  search(query: string, opts: SearchOptions = {}): SearchResult {
    const t0 = performance.now();
    const q = query.trim();
    const empty: SearchResult = {
      query: q, entities: [], hits: [], total: 0, tookMs: 0, suggestions: [],
    };
    if (!this.mini || q.length < 2) return empty;

    const limit = opts.limit ?? 40;
    const rawTerms = tokenize(q);
    const atomic = rawTerms.some(looksAtomic);

    // 1) Entitätstreffer — exakt oder über Wortbestandteil
    const entHits = new Map<string, KnowledgeEntity>();
    for (const term of rawTerms) {
      const key = term.toLowerCase();
      const direct = this.entities.get(key);
      if (direct) entHits.set(direct.key, direct);
      for (const v of foldVariants(term)) {
        for (const k of this.entityWords.get(v) ?? []) {
          const e = this.entities.get(k);
          if (e) entHits.set(k, e);
        }
      }
    }

    // 2) Volltextsuche.
    //    Wichtig: Fuzzy NUR bei langen Begriffen. Bei kurzen Abkuerzungen wie
    //    "MFA" wuerde eine Editierdistanz von 1 auf "Mia", "MSA", "MDA" matchen
    //    und die Trefferliste mit Zufallsfunden fluten.
    const searchTerms = rawTerms.filter((tk) => !isNoise(tk));
    const expanded = [...new Set(searchTerms.flatMap(expandQueryTerm))];
    const minLen = Math.min(...searchTerms.map((s) => s.length), 99);
    const useFuzzy = !atomic && minLen >= 5;

    const msOpts: any = {
      prefix: !atomic,
      fuzzy: useFuzzy ? 0.2 : false,
      maxFuzzy: 2,
      combineWith: 'AND',
    };

    // Synonyme mitsuchen: Originalbegriffe UND Erweiterungen, ODER-verknuepft
    // je Begriff, aber UND ueber die Begriffe hinweg.
    const queries = searchTerms.map((tk) => expandQueryTerm(tk));
    const needsSynonyms = queries.some((v, i) => v.length > foldVariants(searchTerms[i]).length);

    let results: MSResult[] = this.mini.search(q, msOpts);

    if (needsSynonyms) {
      // Treffer der Synonymvarianten dazunehmen und nach ID zusammenfuehren
      const extra = this.mini.search(expanded.join(' '), { ...msOpts, combineWith: 'OR' });
      const byId = new Map<string, MSResult>();
      for (const r of results) byId.set(r.id as string, r);
      for (const r of extra) {
        const id = r.id as string;
        if (!byId.has(id)) {
          // Nur ueber ein Synonym gefunden -> markieren und abwerten
          byId.set(id, { ...r, score: r.score * 0.5, _synonymOnly: true } as any);
        }
      }
      results = [...byId.values()];
    }

    // Nichts gefunden: letzter Versuch mit ODER und (falls sinnvoll) Fuzzy
    if (results.length === 0) {
      results = this.mini.search(expanded.join(' '), {
        ...msOpts, combineWith: 'OR', fuzzy: minLen >= 5 ? 0.2 : false,
      });
    }

    // 3) Filtern, gewichten, aufbereiten
    const wanted = opts.sources ? new Set(opts.sources) : null;
    const wantedTypes = opts.types ? new Set(opts.types) : null;
    const includeSensitive = opts.includeSensitive ?? true;

    // Nur inhaltstragende Begriffe markieren — sonst wird "ist" in "Christian" hervorgehoben
    const highlightTerms = searchTerms.filter((tk) => tk.length >= 3);

    const hits: SearchHit[] = [];
    for (const r of results) {
      const chunk = this.chunks.get(r.id as string);
      if (!chunk) continue;
      const source = this.sources.get(chunk.sourceId);
      if (!source) continue;
      if (wanted && !wanted.has(chunk.sourceId)) continue;
      if (wantedTypes && !wantedTypes.has(chunk.type)) continue;
      if (!includeSensitive && source.sensitive) continue;

      const boost = (TYPE_BOOST[chunk.type] ?? 1) * (SOURCE_BOOST[chunk.sourceId] ?? 1);
      // Exakter Entitätstreffer im Chunk zieht stark nach oben
      const entBonus = chunk.entities.some((e) => entHits.has(e)) ? 1.4 : 1;
      hits.push({
        chunk,
        source,
        score: r.score * boost * entBonus,
        synonymOnly: !!(r as any)._synonymOnly,
        snippet: buildSnippet(chunk.text, highlightTerms),
        matched: Object.keys((r as any).match ?? {}),
      });
    }
    // Exakte Treffer immer vor reinen Synonymtreffern — ein kurzer, seltener
    // Synonymtreffer wuerde sonst per BM25 nach oben rutschen.
    hits.sort((a, b) => {
      const sa = (a as any).synonymOnly ? 1 : 0;
      const sb = (b as any).synonymOnly ? 1 : 0;
      if (sa !== sb) return sa - sb;
      return b.score - a.score;
    });

    const total = hits.length;
    const suggestions = total < 3 ? this.suggest(q, 6) : [];

    return {
      query: q,
      entities: [...entHits.values()].sort((a, b) => b.count - a.count).slice(0, 6),
      hits: hits.slice(0, limit),
      total,
      tookMs: Math.round((performance.now() - t0) * 10) / 10,
      suggestions,
    };
  }
}
