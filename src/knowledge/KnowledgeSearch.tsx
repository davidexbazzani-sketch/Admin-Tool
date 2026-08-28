/**
 * KnowledgeSearch.tsx — Suchoberfläche der Wissensdatenbank.
 *
 * Aufbau:
 *   Suchfeld (mit Vorschlägen)
 *   → Entitätskarten ("W3137 · Server/VM · 12 Erwähnungen")
 *   → Trefferliste mit Herkunft, Pfad und markiertem Ausschnitt
 *   → Detailansicht des gewählten Abschnitts
 *
 * Einbinden:
 *   import { KnowledgeSearchPanel } from './KnowledgeSearch';
 *   <KnowledgeSearchPanel />
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useKnowledgeSearch } from './useKnowledgeSearch';
import type { KnowledgeChunk, KnowledgeEntity, SearchHit, ChunkType } from './knowledge.types';
import './KnowledgeSearch.css';

/* ───────────────────────────── Hilfen ───────────────────────────── */

const TYPE_LABEL: Record<ChunkType, string> = {
  knowledge: 'Kernwissen',
  contact: 'Kontakt',
  overview: 'Überblick',
  open: 'Offener Vorgang',
  thread: 'Vorgang',
  row: 'Eintrag',
  table: 'Tabelle',
  section: 'Abschnitt',
};

function relativeAge(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'heute erstellt';
  if (days === 1) return 'gestern erstellt';
  if (days < 31) return `vor ${days} Tagen erstellt`;
  return `Stand ${new Date(iso).toLocaleDateString('de-DE')}`;
}

/** Sehr schlanker Markdown-Renderer für die Detailansicht (kein externes Paket). */
function renderMarkdown(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const out: string[] = [];
  let inTable = false;
  let inList = false;

  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  const closeTable = () => { if (inTable) { out.push('</tbody></table>'); inTable = false; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = (s: string) =>
      esc(s)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');

    if (/^\s*\|/.test(line)) {
      const cells = line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
      if (/^[\s:|-]+$/.test(line)) continue;                    // Trennzeile
      if (!inTable) {
        closeList();
        out.push('<table><thead><tr>' + cells.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
        inTable = true;
        continue;
      }
      out.push('<tr>' + cells.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      continue;
    }
    closeTable();

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { closeList(); out.push(`<h${Math.min(h[1].length + 2, 6)}>${inline(h[2])}</h${Math.min(h[1].length + 2, 6)}>`); continue; }

    const li = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (li) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(li[1])}</li>`);
      continue;
    }
    closeList();

    if (/^\s*>\s?/.test(line)) { out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`); continue; }
    if (!line.trim()) continue;
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList(); closeTable();
  return out.join('\n');
}

/* ─────────────────────────── Teilkomponenten ─────────────────────────── */

function EntityCard({
  entity, onOpen,
}: { entity: KnowledgeEntity; onOpen: (e: KnowledgeEntity) => void }) {
  return (
    <button className="ks-entity" onClick={() => onOpen(entity)} title={entity.hint ?? entity.display}>
      <span className={`ks-entity__type ks-type--${entity.type}`}>{entity.typeLabel}</span>
      <span className="ks-entity__name">{entity.display}</span>
      {entity.hint && <span className="ks-entity__hint">{entity.hint}</span>}
      <span className="ks-entity__count">{entity.count}×</span>
    </button>
  );
}

function HitRow({
  hit, active, onSelect,
}: { hit: SearchHit; active: boolean; onSelect: (c: KnowledgeChunk) => void }) {
  const crumbs = hit.chunk.path.slice(1, -1);
  return (
    <li
      className={`ks-hit${active ? ' is-active' : ''}${hit.synonymOnly ? ' is-synonym' : ''}`}
      onClick={() => onSelect(hit.chunk)}
    >
      <div className="ks-hit__head">
        <span className={`ks-hit__type ks-type--${hit.chunk.type}`}>{TYPE_LABEL[hit.chunk.type]}</span>
        <span className="ks-hit__title">{hit.chunk.title}</span>
        <span className="ks-hit__source">{hit.source.label}</span>
      </div>
      {crumbs.length > 0 && <div className="ks-hit__crumbs">{crumbs.join(' › ')}</div>}
      <div className="ks-hit__snippet" dangerouslySetInnerHTML={{ __html: hit.snippet }} />
      {hit.synonymOnly && <div className="ks-hit__note">über Synonym gefunden</div>}
    </li>
  );
}

function Detail({
  chunk, sourceLabel, onClose,
}: { chunk: KnowledgeChunk; sourceLabel: string; onClose: () => void }) {
  const html = useMemo(() => renderMarkdown(chunk.md), [chunk.md]);
  return (
    <aside className="ks-detail">
      <header className="ks-detail__head">
        <div>
          <div className="ks-detail__crumbs">{chunk.path.join(' › ')}</div>
          <div className="ks-detail__meta">
            {sourceLabel} · {TYPE_LABEL[chunk.type]} · Zeile {chunk.line}
          </div>
        </div>
        <button className="ks-detail__close" onClick={onClose} aria-label="Schließen">×</button>
      </header>
      <div className="ks-detail__body" dangerouslySetInnerHTML={{ __html: html }} />
      {chunk.entities.length > 0 && (
        <footer className="ks-detail__ents">
          <span>Erwähnt:</span>
          {chunk.entities.slice(0, 24).map((e) => <code key={e}>{e}</code>)}
        </footer>
      )}
    </aside>
  );
}

/* ───────────────────────── Hauptkomponente ───────────────────────── */

export function KnowledgeSearchPanel() {
  const ks = useKnowledgeSearch();
  const [selected, setSelected] = useState<KnowledgeChunk | null>(null);
  const [entityView, setEntityView] = useState<KnowledgeEntity | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Laden der personenbezogenen Daten (AD-Benutzer, Durchwahlen, Gerätezuordnungen)
  // ein-/ausschaltbar. Standard: an. Wirkt sofort (Bundles werden neu geladen).
  const [loadSensitive, setLoadSensitive] = useState(() => {
    try { return localStorage.getItem('knowledge.loadSensitive') !== 'false' } catch { return true }
  });
  function toggleLoadSensitive() {
    const next = !loadSensitive;
    setLoadSensitive(next);
    try { localStorage.setItem('knowledge.loadSensitive', next ? 'true' : 'false') } catch { /* egal */ }
    ks.reload();
  }

  const suggestions = useMemo(
    () => (showSuggest && ks.query.length >= 2 ? ks.suggest(ks.query).slice(0, 7) : []),
    [ks, showSuggest],
  );

  /** Strg+K fokussiert das Suchfeld. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === 'Escape') { setSelected(null); setEntityView(null); setShowSuggest(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const entityChunks = useMemo(
    () => (entityView && ks.engine ? ks.engine.chunksOfEntity(entityView.key) : []),
    [entityView, ks.engine],
  );

  /* ── Ladezustände ── */
  if (ks.loading) {
    return (
      <div className="ks ks--state">
        <div className="ks-spinner" />
        <p>Wissensdatenbank wird geladen …</p>
      </div>
    );
  }
  if (ks.error) {
    return (
      <div className="ks ks--state ks--error">
        <h3>Wissensdatenbank nicht verfügbar</h3>
        <pre>{ks.error}</pre>
        <button onClick={ks.reload}>Erneut versuchen</button>
      </div>
    );
  }

  const res = ks.result;

  return (
    <div className="ks">
      {/* Suchleiste */}
      <div className="ks-bar">
        <div className="ks-input">
          <svg viewBox="0 0 20 20" className="ks-input__icon" aria-hidden>
            <path d="M8.5 3a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm4.9 7.5 4.1 4.1-1.4 1.4-4.1-4.1 1.4-1.4Z" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={ks.query}
            placeholder="Suchen: Person, Ticket, Server, Thema …   (Strg+K)"
            onChange={(e) => { ks.setQuery(e.target.value); setShowSuggest(true); }}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            autoComplete="off"
            spellCheck={false}
          />
          {ks.query && (
            <button className="ks-input__clear" onClick={() => { ks.setQuery(''); setSelected(null); }} aria-label="Leeren">×</button>
          )}
          {suggestions.length > 0 && (
            <ul className="ks-suggest">
              {suggestions.map((s) => (
                <li key={s} onMouseDown={() => { ks.searchNow(s); setShowSuggest(false); }}>{s}</li>
              ))}
            </ul>
          )}
        </div>

        {/* Quellenfilter */}
        <div className="ks-filters">
          {ks.sources.map((s) => {
            const on = ks.filters.sources.includes(s.id);
            return (
              <button
                key={s.id}
                className={`ks-chip${on ? ' is-on' : ''}${s.sensitive ? ' is-sensitive' : ''}`}
                title={s.description}
                onClick={() =>
                  ks.setFilters({
                    sources: on
                      ? ks.filters.sources.filter((x) => x !== s.id)
                      : [...ks.filters.sources, s.id],
                  })
                }
              >
                {s.label}
                {s.sensitive && <span className="ks-chip__lock" title="enthält personenbezogene Daten">•</span>}
              </button>
            );
          })}
          {ks.filters.sources.length > 0 && (
            <button className="ks-chip ks-chip--reset" onClick={() => ks.setFilters({ sources: [] })}>
              Filter zurücksetzen
            </button>
          )}
        </div>
      </div>

      {/* Statuszeile */}
      <div className="ks-status">
        {res ? (
          <>
            <strong>{res.total}</strong> Treffer für „{res.query}" · {res.tookMs} ms
          </>
        ) : (
          <>Wissensindex bereit · {relativeAge(ks.builtAt)}</>
        )}
        {ks.dir && <span className="ks-status__dir" title={ks.dir}>{ks.dir.startsWith('\\\\') ? 'Netzlaufwerk' : 'lokal'}</span>}
        <label className="ks-status__sens" title="Personenbezogene Daten (AD-Benutzer, Durchwahlen, Gerätezuordnungen) laden">
          <input type="checkbox" checked={loadSensitive} onChange={toggleLoadSensitive} />
          Sensible Daten laden
        </label>
      </div>

      <div className="ks-body">
        <div className="ks-results">
          {/* Entitätskarten */}
          {res && res.entities.length > 0 && (
            <div className="ks-entities">
              {res.entities.map((e) => (
                <EntityCard key={e.key} entity={e} onOpen={setEntityView} />
              ))}
            </div>
          )}

          {/* Entitäts-Detailliste */}
          {entityView && (
            <div className="ks-entityview">
              <div className="ks-entityview__head">
                <strong>{entityView.display}</strong>
                <span>{entityView.typeLabel} · {entityView.count} Fundstellen</span>
                <button onClick={() => setEntityView(null)}>×</button>
              </div>
              <ul className="ks-hits">
                {entityChunks.map((c) => (
                  <li key={c.id} className="ks-hit" onClick={() => setSelected(c)}>
                    <div className="ks-hit__head">
                      <span className={`ks-hit__type ks-type--${c.type}`}>{TYPE_LABEL[c.type]}</span>
                      <span className="ks-hit__title">{c.title}</span>
                    </div>
                    <div className="ks-hit__crumbs">{c.path.slice(1, -1).join(' › ')}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Trefferliste */}
          {res && res.hits.length > 0 && !entityView && (
            <ul className="ks-hits">
              {res.hits.map((h) => (
                <HitRow
                  key={h.chunk.id}
                  hit={h}
                  active={selected?.id === h.chunk.id}
                  onSelect={setSelected}
                />
              ))}
            </ul>
          )}

          {/* Nichts gefunden */}
          {res && res.total === 0 && (
            <div className="ks-empty">
              <p>Keine Treffer für „{res.query}".</p>
              {res.suggestions.length > 0 && (
                <p className="ks-empty__sugg">
                  Meintest du:{' '}
                  {res.suggestions.map((s) => (
                    <button key={s} onClick={() => ks.searchNow(s)}>{s}</button>
                  ))}
                </p>
              )}
            </div>
          )}

          {/* Startzustand */}
          {!res && (
            <div className="ks-hint">
              <p>Beispiele:</p>
              <div className="ks-hint__examples">
                {['INC2912083', 'W3137', 'Bipul', 'MFA', 'Serverraum', 'EPLAN Lizenz', 'USV Test'].map((s) => (
                  <button key={s} onClick={() => ks.searchNow(s)}>{s}</button>
                ))}
              </div>
              <ul className="ks-hint__tips">
                <li>Umlaute egal — „Voelkl" findet auch „Völkl".</li>
                <li>Ticketnummern, Hostnamen und IP-Adressen werden exakt gesucht.</li>
                <li>Quellen oben lassen sich ein- und ausblenden.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Detailspalte */}
        {selected && (
          <Detail
            chunk={selected}
            sourceLabel={ks.sources.find((s) => s.id === selected.sourceId)?.label ?? selected.sourceId}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

export default KnowledgeSearchPanel;
