/**
 * Datenmodell der Wissensdatenbank.
 * Wird sowohl vom Build-Skript (als JSDoc-Referenz) als auch vom Renderer benutzt.
 */

/** Woher ein Chunk stammt. */
export interface KnowledgeSource {
  /** Stabile Kurz-ID, z. B. "brain", "mails", "governance". */
  id: string;
  /** Anzeigename in der UI, z. B. "Master-Brain". */
  label: string;
  /** Dateiname der Quelle. */
  file: string;
  /** 'curated' = redaktioneller Text, 'raw' = Rohdaten-Tabellen. */
  kind: 'curated' | 'raw';
  /** true = enthält personenbezogene Daten (landet in knowledge.sensitive.json). */
  sensitive: boolean;
  /** Kurzbeschreibung für die Herkunftsanzeige. */
  description?: string;
}

/** Art eines Chunks — bestimmt Ranking-Gewicht und Darstellung. */
export type ChunkType =
  | 'overview'   // Überblick / Einleitung eines Abschnitts
  | 'knowledge'  // Kernwissen-Block
  | 'contact'    // Kontakt-/Zuständigkeitstabelle
  | 'open'       // offene / laufende Vorgänge
  | 'thread'     // Thread-Register-Eintrag
  | 'table'      // sonstige Tabelle (als Ganzes)
  | 'row'        // einzelne Zeile einer Nachschlagetabelle
  | 'section';   // allgemeiner Textabschnitt

/** Ein durchsuchbarer Abschnitt. */
export interface KnowledgeChunk {
  /** Eindeutige ID, z. B. "mails#0421". */
  id: string;
  sourceId: string;
  /** Breadcrumb von H1 bis zur Überschrift des Chunks. */
  path: string[];
  /** Überschrift des Chunks (letztes Element von path, oder Zeilenschlüssel). */
  title: string;
  type: ChunkType;
  /** Reiner Text für die Suche (Markdown-Auszeichnung entfernt). */
  text: string;
  /** Original-Markdown für die Detailansicht. */
  md: string;
  /** Erkannte Entitäten in diesem Chunk (Werte, nicht Objekte). */
  entities: string[];
  /** Zeilennummer in der Quelldatei (für "im Original öffnen"). */
  line: number;
}

/** Art einer Entität. */
export type EntityType =
  | 'ticket' | 'host' | 'network' | 'serial' | 'person'
  | 'email' | 'ip' | 'printer' | 'cve' | 'phone' | 'app';

/** Eine erkannte Entität mit allen Fundstellen. */
export interface KnowledgeEntity {
  /** Normalisierter Schlüssel (lowercase), z. B. "w3137". */
  key: string;
  /** Anzeigeform, z. B. "W3137". */
  display: string;
  type: EntityType;
  /** Menschenlesbare Typbezeichnung, z. B. "Server / VM". */
  typeLabel: string;
  /** IDs aller Chunks, in denen die Entität vorkommt. */
  chunkIds: string[];
  /** Anzahl Fundstellen. */
  count: number;
  /** Zusatzinfo, falls aus einer Kontakttabelle gewonnen (Rolle, Firma). */
  hint?: string;
}

/** Kopfdaten eines Index-Bundles. */
export interface KnowledgeMeta {
  builtAt: string;
  builderVersion: string;
  sources: KnowledgeSource[];
  chunkCount: number;
  entityCount: number;
}

/** Inhalt einer knowledge.*.json. */
export interface KnowledgeBundle {
  meta: KnowledgeMeta;
  chunks: KnowledgeChunk[];
  entities: KnowledgeEntity[];
}

/** Ein Suchtreffer. */
export interface SearchHit {
  chunk: KnowledgeChunk;
  source: KnowledgeSource;
  /** Relevanz-Score (höher = besser). */
  score: number;
  /** Textausschnitt mit <mark>-Markierungen. */
  snippet: string;
  /** Die Suchbegriffe, die in diesem Chunk gefunden wurden. */
  matched: string[];
  /** true = nur über ein Synonym gefunden, nicht über den Originalbegriff. */
  synonymOnly?: boolean;
}

/** Ergebnis einer Suche. */
export interface SearchResult {
  query: string;
  /** Exakt getroffene Entitäten (werden als Karte über den Treffern gezeigt). */
  entities: KnowledgeEntity[];
  hits: SearchHit[];
  /** Gesamtzahl Treffer vor Begrenzung. */
  total: number;
  /** Dauer in Millisekunden. */
  tookMs: number;
  /** Vorschläge bei wenigen/keinen Treffern. */
  suggestions: string[];
}
